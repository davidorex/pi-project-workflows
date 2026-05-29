import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerAuthGate } from "./auth-gate.js";
import { authorAgentSpecTool } from "./author-agent-spec-tool.js";
import { authorToolGrantTool } from "./author-tool-grant-tool.js";
import { callAgentTool } from "./call-agent-tool.js";
import { commitAttestedTool } from "./commit-attested-tool.js";
import { loadComposites } from "./composite-loader.js";
import {
	FORBIDDEN_WHOLESALE_OPERATIONS,
	type OperationDescriptor,
	TOOL_OPERATION_DEFAULTS,
} from "./operation-vocab.js";
import { registerReadTruncationGate } from "./read-truncation-gate.js";
import { runRealChecksTool } from "./run-real-checks-tool.js";
import { runWorkOrderLoopTool } from "./run-work-order-loop-tool.js";

/**
 * L3 runtime guard (FEAT-010): on extension load, assert defaults
 * contains no FORBIDDEN_WHOLESALE_OPERATIONS token. Catches the failure mode
 * where a future maintainer adds a wholesale entry to defaults and the L2
 * test invariant is bypassed (e.g. tests not run pre-commit). Throws to
 * halt extension load — refusing to start with a broken-canon vocabulary
 * is the only safe option per feedback_no_parallel_ungated_paths.
 *
 * Exported (with `defaults` arg) so tests can supply a synthetic
 * violator-containing map and assert the throw path without mutating the
 * module-level const.
 */
export function assertDefaultsClean(defaults: Record<string, OperationDescriptor> = TOOL_OPERATION_DEFAULTS): void {
	const violators = Object.values(defaults).filter((op) =>
		(FORBIDDEN_WHOLESALE_OPERATIONS as readonly string[]).includes(op.canonical_id),
	);
	if (violators.length > 0) {
		throw new Error(
			`pi-agent-dispatch: L3 runtime guard tripped — TOOL_OPERATION_DEFAULTS contains forbidden wholesale tokens [${violators.map((v) => v.canonical_id).join(", ")}]. Source change + release required to remove.`,
		);
	}
}

const extension = (pi: ExtensionAPI) => {
	// L3: assert framework defaults clean of forbidden-wholesale tokens
	assertDefaultsClean();

	// Static tools (FEAT-005 / DEC-0047 / TASK-088-090; run-work-order-loop FEAT-006 / TASK-091)
	pi.registerTool(authorAgentSpecTool);
	pi.registerTool(callAgentTool);
	pi.registerTool(runRealChecksTool);
	pi.registerTool(commitAttestedTool);
	pi.registerTool(authorToolGrantTool);
	pi.registerTool(runWorkOrderLoopTool);

	// Dynamic composite-tool registration from config.tool_operations[]
	// (FEAT-010). loadComposites throws if any entry hits the L1∪L5
	// forbidden union — refuse to start rather than register a parallel
	// ungated path.
	//
	// Observability of the config-absent degrade path (FGAP-121 layer-a):
	// pi.ui.notify is on ExtensionContext (tool-execution time), NOT on
	// ExtensionAPI (factory time). At factory load the only canonical
	// observability channel is the TraceEntry pipeline, which
	// loadComposites already writes via writeAgentTrace per DEC-0002 /
	// TASK-086 precedent. The returned config_absent flag is kept on the
	// surface for any future factory-time UI hook upstream may add; today
	// it is functionally informational + queryable via the trace JSONL.
	const result = loadComposites(process.cwd(), pi);
	void result;

	// FGAP-134: per-tool user-auth gate at pi-dispatch layer. Registered
	// AFTER static + composite tools so the handler sees the full surface
	// (registration order does not affect handler-invocation behavior —
	// pi.on('tool_call') fires for every tool regardless of registration
	// sequence — but placing the registration last preserves a readable
	// 'tools first, gates last' factory shape). Closes the writer.kind
	// spoof at the dispatch boundary regardless of caller-supplied field
	// values. Bucket-2 vocabulary + handler semantics live in auth-gate.ts;
	// see that module's header for the governance rationale + Bucket-2
	// member list.
	registerAuthGate(pi);

	// FGAP-135: pi.on('tool_result') gate intercepts pi's built-in `read`
	// tool responses when the structured details.truncation field signals
	// truncation, and REPLACES the content payload with a hard-refusal
	// directive. Mirrors pi-context serializeForRead overCapDirective
	// canon — the directive IS the response so the agent cannot skim past
	// it. Coexists with the tool_call auth-gate above on the orthogonal
	// tool_result event; multi-handler composition is the SDK contract.
	// See read-truncation-gate.ts header for the full canonical-model
	// docstring.
	registerReadTruncationGate(pi);
};

export default extension;
