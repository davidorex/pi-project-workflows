/**
 * run-work-order-loop Pi tool — single-call wrapper around the end-to-end
 * orchestrator-declared work-order execution loop. The orchestrator names a
 * work-order id (loaded from the substrate's work-orders block, per the
 * work-order schema/block covering target_agent, real_check_criteria, scope,
 * input_contract) and the loop drives: dispatch the target_agent →
 * run-real-checks → on pass commit-attested → on fail human-OK retry.
 * Bounded iterations (default 3) per the loop's design; human-OK gate per
 * this project's capability-governance model (default-empty grants,
 * operation-granular composition, human-only capability widening, and
 * deterministic real-checks — never agent self-report — as the pass/fail
 * verdict).
 *
 * Per this harness's confinement of the main LLM to acting only through
 * extension tools / JIT-agent dispatch / workflows (never default
 * bash/read/write/edit directly), this tool is the harness-confined
 * orchestrator's positive-clause shortcut: previously the orchestrator
 * hand-chained call-agent / run-real-checks / commit-attested per iteration;
 * now one Pi call closes the loop while preserving every gate (capability
 * composition at the call boundary, deterministic real-check verdict,
 * human-OK retry, writer-attestation footer).
 */

import { Type } from "@earendil-works/pi-ai";
import type { AgentToolResult, AgentToolUpdateCallback, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { runWorkOrderLoop, type WorkOrderLoopResult } from "./work-order-loop.js";

export const runWorkOrderLoopTool = {
	name: "run-work-order-loop",
	label: "Run Work-Order Loop",
	description:
		"Execute the bounded work-order loop: dispatch target_agent (via direct pi-jit-agents library) → run-real-checks (deterministic verdict — the actual exit code, never an LLM self-report) → on-pass commit-attested → on-fail human-OK retry at the iteration boundary. Bounded iterations (default 3); human-OK gate governs retry.",
	promptSnippet: "Execute the end-to-end work-order loop for a declared spec.",
	parameters: Type.Object({
		work_order_id: Type.String({
			description: "ID of the work-order to execute (loads from the substrate's work-orders block).",
		}),
		max_iterations: Type.Optional(Type.Number({ description: "Max iteration count before fail-final. Default 3." })),
		agent_grant: Type.Optional(
			Type.Array(Type.String(), {
				description: "Tool grant for the dispatched privileged agent (capability composition). Default empty.",
			}),
		),
	}),
	async execute(
		_toolCallId: string,
		params: { work_order_id: string; max_iterations?: number; agent_grant?: string[] },
		_signal: AbortSignal,
		_onUpdate: AgentToolUpdateCallback,
		ctx: ExtensionContext,
	): Promise<AgentToolResult<WorkOrderLoopResult>> {
		const result = await runWorkOrderLoop(ctx.cwd, params, ctx);
		const commitFragment = result.commit_sha ? `, commit ${result.commit_sha}` : "";
		return {
			details: result,
			content: [
				{
					type: "text",
					text: `run-work-order-loop ${params.work_order_id}: ${result.final_status} (${result.iterations.length} iterations${commitFragment})`,
				},
			],
		};
	},
};
