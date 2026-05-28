/**
 * auth-gate — per-tool user-authorization handler registered on
 * `pi.on("tool_call", ...)` from the pi-agent-dispatch extension factory.
 *
 * Aim (FGAP-134): close the writer.kind spoof at the pi-dispatch layer.
 * Prior to this gate, tools like author-agent-spec / commit-attested /
 * author-tool-grant enforced human-only authoring by inspecting a
 * caller-supplied `writer.kind="human"` field — empirically spoofable by
 * an in-pi agent (demonstrated 2026-05-29 against clock-menu-app). The
 * pi.on('tool_call') event fires at the pi-dispatch boundary regardless
 * of the tool's execute() body, regardless of which extension registered
 * the tool, and regardless of caller-supplied argument shapes. Returning
 * `{ block: true, reason }` from the handler prevents the tool from
 * executing at all; the writer.kind field becomes derived-from-verified-
 * interaction rather than caller-trusted.
 *
 * Surface: 14 canonical Bucket-2 tools (per FGAP-134 plan files-table)
 * declared in `AUTH_REQUIRED_TOOLS`. The handler enforces:
 *   - non-interactive context (ctx.hasUI === false) → unconditional
 *     refusal with a structured reason naming the missing interactivity.
 *     This closes the JSON-mode / workflow-subprocess bypass: a step
 *     that auto-invokes a Bucket-2 tool without an attached operator
 *     cannot proceed (intended governance per FGAP-134 plan side-effects
 *     section).
 *   - interactive context (ctx.hasUI === true) → ctx.ui.confirm(title,
 *     message) where message renders the tool name + sanitized arg
 *     summary; on operator decline returns block:true; on accept returns
 *     void (allow).
 *
 * Non-Bucket-2 tools (read-block, call-agent, run-real-checks, the SDK
 * built-ins bash/read/edit/write/grep/find/ls, dynamic composite tools,
 * etc.) pass through unconditionally — the gate is narrowly targeted at
 * the sensitive-substrate-write surface DEC-0047 governs.
 *
 * Co-existence: pi-behavior-monitors registers its own tool_call handler
 * (packages/pi-behavior-monitors/index.ts) for the deviation-monitor
 * pipeline. Per pi-coding-agent's documented multi-handler semantics
 * (types.d.ts:809 — the `on` registration is additive, not exclusive),
 * both handlers coexist; pi-dispatch invokes each in registration order
 * and honors the first `block:true` returned. No ordering conflict
 * expected — pi-behavior-monitors' handler operates on classification
 * verdicts; this gate operates on toolName allowlist.
 */

import type {
	ExtensionAPI,
	ExtensionContext,
	ToolCallEvent,
	ToolCallEventResult,
} from "@earendil-works/pi-coding-agent";

/**
 * The 14 Bucket-2 canonical tool names whose execution requires an
 * affirmative user-confirm. Sourced verbatim from FGAP-134 plan
 * files-table (registration-site column anchors each name in source).
 *
 * Frozen + typed `as const` so accidental mutation at runtime is
 * caught by the type system; consumers should never reach into this
 * list to add/remove entries — vocabulary changes require a source
 * edit + release per DEC-0047 governance-as-code precedent.
 */
export const AUTH_REQUIRED_TOOLS = [
	// pi-agent-dispatch
	"author-agent-spec",
	"author-tool-grant",
	"commit-attested",
	// pi-context
	"write-schema",
	"amend-config",
	"write-block",
	"rename-canonical-id",
	"context-init",
	"context-accept-all",
	// pi-workflows
	"workflow-execute",
	"workflow-resume",
	"workflow-init",
	// pi-behavior-monitors
	"monitors-control",
	"monitors-rules",
] as const;

/**
 * Summarize a tool-call argument object for operator-readable confirm
 * prompts. Top-level keys are rendered; string values are truncated to
 * ~80 chars + ellipsis; nested objects are rendered as `{...}`
 * placeholders so secret-bearing structured args (e.g. spec bodies
 * holding API keys, file contents passed by reference) never appear
 * verbatim in the prompt.
 *
 * Deliberately non-exhaustive: this is an operator-readability aid,
 * not a safe-render contract. Sensitive fields should never be passed
 * by these tools in the first place; the summary is one final
 * defensive truncation rather than the primary guard.
 */
function summarizeArgs(input: Record<string, unknown> | undefined): string {
	if (!input || typeof input !== "object") return "(no args)";
	const keys = Object.keys(input);
	if (keys.length === 0) return "(no args)";
	const parts: string[] = [];
	for (const key of keys) {
		const value = (input as Record<string, unknown>)[key];
		if (value === null || value === undefined) {
			parts.push(`${key}=${String(value)}`);
		} else if (typeof value === "string") {
			const truncated = value.length > 80 ? `${value.slice(0, 80)}…` : value;
			parts.push(`${key}="${truncated}"`);
		} else if (typeof value === "number" || typeof value === "boolean") {
			parts.push(`${key}=${String(value)}`);
		} else if (Array.isArray(value)) {
			parts.push(`${key}=[${value.length} item(s)]`);
		} else if (typeof value === "object") {
			parts.push(`${key}={...}`);
		} else {
			parts.push(`${key}=<${typeof value}>`);
		}
	}
	return parts.join(", ");
}

/**
 * The pi.on('tool_call') handler. Exported separately from the
 * registration helper so unit tests can invoke it directly with a mock
 * event + mock context, without driving a real pi extension factory.
 *
 * Returns:
 *   - `void` when the tool is not in AUTH_REQUIRED_TOOLS (pass through);
 *   - `void` when the tool is in AUTH_REQUIRED_TOOLS, ctx.hasUI is true,
 *     and ctx.ui.confirm resolves true (operator allowed);
 *   - `{ block: true, reason }` when ctx.hasUI is false (non-interactive
 *     refusal) or when ctx.ui.confirm resolves false (operator declined).
 */
export async function authGateHandler(
	event: ToolCallEvent,
	ctx: ExtensionContext,
): Promise<ToolCallEventResult | undefined> {
	if (!(AUTH_REQUIRED_TOOLS as readonly string[]).includes(event.toolName)) {
		return; // pass-through: tool is not in the gated set
	}

	if (!ctx.hasUI) {
		return {
			block: true,
			reason: `tool ${event.toolName} requires interactive user-confirm; current context is non-interactive (ctx.hasUI=false)`,
		};
	}

	const argSummary = summarizeArgs(event.input as Record<string, unknown> | undefined);
	const message = `tool ${event.toolName} requested; args: ${argSummary}`;
	const ok = await ctx.ui.confirm(`Authorize ${event.toolName}?`, message);
	if (ok === false) {
		return { block: true, reason: "user declined" };
	}
	return;
}

/**
 * Register the auth-gate handler on a pi extension API. Single line at
 * the factory call-site. Idempotent registration is the responsibility
 * of the caller (the extension factory runs once per pi process; double-
 * registration would produce duplicate prompts).
 */
export function registerAuthGate(pi: ExtensionAPI): void {
	pi.on("tool_call", authGateHandler);
}
