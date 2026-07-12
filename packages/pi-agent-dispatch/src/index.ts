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
 * L3 runtime guard, part of this package's per-kind composite-tool
 * registration model's layered enforcement forbidding any wholesale
 * (bash/write/edit/shell/execute) operation from being registered this way:
 * on extension load, assert defaults contains no FORBIDDEN_WHOLESALE_OPERATIONS
 * token. Catches the failure mode
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

	// Static tools — registrations for the JIT capability-composition layer's
	// composed-grant model, this project's capability-governance model, and
	// the work-order pipeline spanning the work-order schema/block through
	// the real-check verdict gate; run-work-order-loop is the end-to-end
	// orchestrator-declared work-order execution loop, implemented by this
	// loop's own implementation task.
	pi.registerTool(authorAgentSpecTool);
	pi.registerTool(callAgentTool);
	pi.registerTool(runRealChecksTool);
	pi.registerTool(commitAttestedTool);
	pi.registerTool(authorToolGrantTool);
	pi.registerTool(runWorkOrderLoopTool);

	// Dynamic composite-tool registration from config.tool_operations[],
	// per this package's per-kind composite-tool registration model with its
	// layered enforcement forbidding any wholesale operation from being
	// registered this way. loadComposites throws if any entry hits the L1∪L5
	// forbidden union — refuse to start rather than register a parallel
	// ungated path.
	//
	// Observability of the config-absent degrade path — closing the gap
	// where a config-absent substrate silently registered zero composite
	// tools with no signal at all: pi.ui.notify is on ExtensionContext
	// (tool-execution time), NOT on ExtensionAPI (factory time). At factory
	// load the only canonical observability channel is the TraceEntry
	// pipeline, which loadComposites already writes via writeAgentTrace, per
	// this project's precedent for reporting a degraded-but-non-fatal
	// condition (emit a warning through the trace pipeline rather than
	// staying silent or throwing). The returned config_absent flag is kept on the
	// surface for any future factory-time UI hook upstream may add; today
	// it is functionally informational + queryable via the trace JSONL.
	const result = loadComposites(process.cwd(), pi);
	void result;

	// Per-tool user-auth gate at the pi-dispatch layer, closing a spoofable
	// writer.kind field by gating sensitive tool calls at the dispatch
	// boundary regardless of caller-supplied values. Registered
	// AFTER static + composite tools so the handler sees the full surface
	// (registration order does not affect handler-invocation behavior —
	// pi.on('tool_call') fires for every tool regardless of registration
	// sequence — but placing the registration last preserves a readable
	// 'tools first, gates last' factory shape). The operator-confirm-gated
	// sensitive-write tool vocabulary + handler
	// semantics live in auth-gate.ts; see that module's header for the
	// governance rationale + the gated-set member list.
	registerAuthGate(pi);

	// This gate intercepts pi's built-in `read` tool's truncation signal and
	// replaces truncated content with an explicit refusal directive, so an
	// agent can't silently proceed as if it read the whole file: a
	// pi.on('tool_result') gate watches for the structured details.truncation
	// field on `read` tool responses, and REPLACES the content payload with a
	// hard-refusal directive. Mirrors pi-context serializeForRead overCapDirective
	// canon — the directive IS the response so the agent cannot skim past
	// it. Coexists with the tool_call auth-gate above on the orthogonal
	// tool_result event; multi-handler composition is the SDK contract.
	// See read-truncation-gate.ts header for the full canonical-model
	// docstring.
	registerReadTruncationGate(pi);
};

export default extension;
