/**
 * read-truncation-gate — pi.on('tool_result', handler) registered from
 * the pi-agent-dispatch extension factory that intercepts pi's built-in
 * `read` tool responses when the underlying TruncationResult signals
 * truncation, and REPLACES the content payload entirely with a single
 * text item carrying a hard-refusal directive.
 *
 * Canonical model: the pi.on('tool_result') boundary mirrors the auth-
 * gate's tool_call boundary — it runs at the pi-dispatch layer, after
 * the tool's execute() body has produced its result, and before the
 * LLM sees the result. Returning a ToolResultEventResult with `content`
 * set REPLACES the corresponding event field entirely (no merge); the
 * agent never sees the original (truncated head) content. The directive
 * IS the content, so the agent cannot skim past it — there is no head
 * to skim. The phrasing pattern (⚠️ prefix, INCOMPLETE / "do NOT"
 * framing, explicit-next-action guidance naming concrete tools + params)
 * mirrors pi-context's serializeForRead overCapDirective canon at
 * read-element.ts:222-245, which proved itself across the typed-read
 * surfaces (read-block-page / read-schema / read-samples-catalog).
 *
 * Why pi's built-in marker is insufficient: pi's read tool appends a
 * single text marker at end-of-content on truncation (the marker IS
 * structured + carries a continuation hint via `offset=N`), but its
 * end-of-content position is trivially skimmable — LLMs scan content
 * for the substantive bit they want and miss the marker. Empirically,
 * an in-pi LLM reading a large file gets the head and proceeds with
 * incomplete content as if it had the whole file. This handler closes
 * that gap by making the directive the entire visible response.
 *
 * Coexists with auth-gate: that handler registers on pi.on('tool_call')
 * for the substrate-write authorization surface; this handler registers
 * on pi.on('tool_result') for the read-output integrity surface. The
 * two events are orthogonal and the handlers do not interfere.
 *
 * No-op for non-read tools and for non-truncated read results — handler
 * returns undefined, leaving the original event payload untouched.
 */

import type { ExtensionAPI, ExtensionContext, ToolResultEvent } from "@earendil-works/pi-coding-agent";

/**
 * Local mirror of pi's internal `ToolResultEventResult` shape (not
 * re-exported from the SDK index.d.ts at present; declared at
 * `node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts:726-730`).
 * Carrying a local interface keeps the handler-return contract typed at
 * the dispatch module without reaching into the SDK's internal-types
 * subpath, which is not part of its public surface contract.
 *
 * Field semantics per the SDK: any field set REPLACES the corresponding
 * event field entirely (no merge); omitted fields are left untouched.
 */
interface ToolResultGateOutcome {
	content?: { type: "text"; text: string }[];
	details?: unknown;
	isError?: boolean;
}

/**
 * Minimal projection of pi's TruncationResult carrying the fields the
 * directive renders. Mirrors the canonical shape declared at
 * `node_modules/@earendil-works/pi-coding-agent/dist/core/tools/truncate.d.ts`
 * — kept as a local interface (rather than a deep import) so the
 * dispatch module is not coupled to an internal pi tool-types path
 * that may shift across pi versions; the field set is the public
 * contract on details.truncation.
 */
export interface TruncationProjection {
	truncated: boolean;
	truncatedBy?: "lines" | "bytes" | null;
	outputLines?: number;
	totalLines?: number;
	outputBytes?: number;
	totalBytes?: number;
	maxLines?: number;
	maxBytes?: number;
	lastLinePartial?: boolean;
	firstLineExceedsLimit?: boolean;
}

/**
 * Pure function that constructs the directive text from the pi read
 * tool call input + the structured TruncationResult. No I/O; identical
 * inputs yield identical output. Exported separately from the handler
 * so unit tests can drive directive composition in isolation.
 *
 * Renders:
 *   - the file path (from `input.path`; defaults to "<unknown>" if the
 *     input shape is unexpectedly empty — defensive guard, not a
 *     contract);
 *   - the truncation accounting (outputLines / totalLines and
 *     outputBytes / totalBytes; numeric fields rendered with a default
 *     of "?" if absent so a partial TruncationResult still produces a
 *     readable directive);
 *   - the continuation hint (`offset=<nextOffset>` where nextOffset is
 *     outputLines per pi's read.js marker convention);
 *   - explicit guidance to use `grep` for targeted search as an
 *     alternative to paginated re-read.
 *
 * The "The truncated head is NOT returned" sentence enforces the
 * hard-refusal semantic at the language level — it signals the agent
 * that the directive IS the entire response payload, not a header
 * followed by content.
 */
export function buildTruncationDirective(
	input: Record<string, unknown> | undefined,
	truncation: TruncationProjection,
): string {
	const path = typeof input?.path === "string" && input.path.length > 0 ? input.path : "<unknown>";
	const totalLines = truncation.totalLines ?? "?";
	const totalBytes = truncation.totalBytes ?? "?";
	const outputLines = truncation.outputLines ?? "?";
	const outputBytes = truncation.outputBytes ?? "?";
	// pi's read.js builds its end-of-content marker with `Use offset=${nextOffset}`
	// where nextOffset equals the count of complete lines emitted (outputLines).
	// Mirror that convention so the directive's continuation hint matches the
	// canonical semantics consumers may already expect from pi.
	const nextOffset = truncation.outputLines ?? "?";

	return (
		`⚠️ READ TRUNCATED — file \`${path}\` is ${totalLines} lines / ${totalBytes} bytes total; ` +
		`only the first ${outputLines} lines / ${outputBytes} bytes were returned. ` +
		`The content below is INCOMPLETE; do NOT proceed as if you have the full file.\n\n` +
		`To continue from where the read stopped: call \`read\` again with \`offset=${nextOffset}\` ` +
		`(and \`limit=...\` if desired).\n` +
		`To find specific content without reading the rest of the file: use \`grep\` with a pattern + path.\n\n` +
		`The truncated head is NOT returned in this response — re-issue the read with ` +
		`\`offset=${nextOffset}\` or use \`grep\` for targeted search.`
	);
}

/**
 * The pi.on('tool_result') handler. Exported separately from the
 * registration helper so unit tests can invoke it directly with a mock
 * event and mock context, without driving a real pi extension factory.
 *
 * Returns:
 *   - `undefined` (pass-through) when toolName !== "read";
 *   - `undefined` (pass-through) when details.truncation is absent or
 *     truncation.truncated is false (the read was complete);
 *   - `{ content, isError }` REPLACING the event payload when the read
 *     was truncated. `isError` is set false because the read itself
 *     succeeded — only its completeness is at issue; raising isError
 *     would surface as a tool failure to the LLM and trigger error-
 *     handling paths instead of the canonical "use offset / use grep"
 *     guidance the directive carries.
 */
export async function readTruncationGateHandler(
	event: ToolResultEvent,
	_ctx: ExtensionContext,
): Promise<ToolResultGateOutcome | undefined> {
	if (event.toolName !== "read") {
		return; // pass-through: only intercept read tool results
	}
	const details = event.details as { truncation?: TruncationProjection } | undefined;
	const truncation = details?.truncation;
	if (!truncation?.truncated) {
		return; // pass-through: read was not truncated, original content stands
	}
	const directive = buildTruncationDirective(event.input, truncation);
	return {
		content: [{ type: "text", text: directive }],
		isError: false,
	};
}

/**
 * Register the read-truncation-gate handler on a pi extension API.
 * Single line at the factory call-site. Idempotent registration is the
 * responsibility of the caller (the extension factory runs once per pi
 * process; double-registration would produce duplicate replacements).
 */
export function registerReadTruncationGate(pi: ExtensionAPI): void {
	pi.on("tool_result", readTruncationGateHandler);
}
