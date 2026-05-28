/**
 * run-real-checks Pi tool — loads a work-order by id from the substrate
 * `work-orders` block (TASK-088 schema) and invokes the real-check-runner
 * (TASK-090). The returned RealCheckResult carries the deterministic
 * verdict the orchestrator inspects — never the executing agent's
 * self-report (FGAP-102 + DEC-0047 clause 5).
 */

import { readBlock } from "@davidorex/pi-context/block-api";
import { Type } from "@earendil-works/pi-ai";
import type { AgentToolResult, AgentToolUpdateCallback, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { type RealCheckCriteria, type RealCheckResult, runRealChecks } from "./real-check-runner.js";

interface WorkOrder {
	id: string;
	real_check_criteria?: RealCheckCriteria;
}

export class WorkOrderNotFoundError extends Error {
	constructor(workOrderId: string) {
		super(`run-real-checks: work-order '${workOrderId}' not found in work-orders block`);
		this.name = "WorkOrderNotFoundError";
	}
}

export const runRealChecksTool = {
	name: "run-real-checks",
	label: "Run Real Checks",
	description:
		"Run the deterministic real-checks declared on a work-order (build/check/test exit + runtime-demo + adversarial-probe). Returns a structured RealCheckResult. NEVER LLM self-report; verdict is the actual exit code.",
	promptSnippet: "Run a work-order's declared real-checks for verdict gating.",
	parameters: Type.Object({
		work_order_id: Type.String({
			description: "ID of the work-order whose real_check_criteria to run (e.g. 'WO-NNN').",
		}),
		max_check_time_ms: Type.Optional(
			Type.Number({ description: "Max total time per check in milliseconds. Defaults to 600000 (10 minutes)." }),
		),
	}),
	async execute(
		_toolCallId: string,
		params: { work_order_id: string; max_check_time_ms?: number },
		_signal: AbortSignal,
		_onUpdate: AgentToolUpdateCallback,
		ctx: ExtensionContext,
	): Promise<AgentToolResult<RealCheckResult>> {
		const data = readBlock(ctx.cwd, "work-orders") as { work_orders: WorkOrder[] };
		const wo = data.work_orders.find((w) => w.id === params.work_order_id);
		if (!wo) throw new WorkOrderNotFoundError(params.work_order_id);

		const result = await runRealChecks(ctx.cwd, wo.id, wo.real_check_criteria ?? {}, {
			max_check_time_ms: params.max_check_time_ms,
		});

		return {
			details: result,
			content: [
				{
					type: "text",
					text: `run-real-checks ${wo.id}: ${result.passed ? "PASSED" : "FAILED"} (${result.total_duration_ms}ms)`,
				},
			],
		};
	},
};
