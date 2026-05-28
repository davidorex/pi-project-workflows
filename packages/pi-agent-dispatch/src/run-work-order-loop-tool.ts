/**
 * run-work-order-loop Pi tool — single-call wrapper around the FEAT-006
 * north-star loop. The orchestrator names a work-order id (loaded from
 * .project/work-orders.json per TASK-088 schema) and the loop drives:
 * dispatch the target_agent → run-real-checks → on pass commit-attested
 * → on fail human-OK retry. Bounded iterations (default 3) per FEAT-006;
 * human-OK gate per DEC-0047 governance.
 *
 * Per DEC-0014 this tool is the harness-confined orchestrator's positive-
 * clause shortcut: previously the orchestrator hand-chained call-agent /
 * run-real-checks / commit-attested per iteration; now one Pi call closes
 * the loop while preserving every gate (capability composition at the
 * call boundary, deterministic real-check verdict, human-OK retry, writer-
 * attestation footer).
 */

import { Type } from "@earendil-works/pi-ai";
import type { AgentToolResult, AgentToolUpdateCallback, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { runWorkOrderLoop, type WorkOrderLoopResult } from "./work-order-loop.js";

export const runWorkOrderLoopTool = {
	name: "run-work-order-loop",
	label: "Run Work-Order Loop",
	description:
		"Execute the bounded FEAT-006 loop for a work-order: dispatch target_agent (via direct pi-jit-agents library per DEC-0044 narrowed / JI-021) → run-real-checks (deterministic verdict per DEC-0018 + DEC-0047 clause 5) → on-pass commit-attested → on-fail human-OK retry at the iteration boundary. Bounded iterations (default 3); human-OK gate per DEC-0047 governance.",
	promptSnippet: "Execute the end-to-end work-order loop for a declared spec.",
	parameters: Type.Object({
		work_order_id: Type.String({
			description: "ID of the work-order to execute (loads from .project/work-orders.json per TASK-088 schema).",
		}),
		max_iterations: Type.Optional(Type.Number({ description: "Max iteration count before fail-final. Default 3." })),
		agent_grant: Type.Optional(
			Type.Array(Type.String(), {
				description:
					"Tool grant for the dispatched privileged agent (per FEAT-005 capability composition). Default empty.",
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
