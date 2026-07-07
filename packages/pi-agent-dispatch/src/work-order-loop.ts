/**
 * work-order-loop — bounded FEAT-006 north-star loop implementation.
 *
 * The orchestrator declares a work-order (TASK-088 schema). This library
 * drives the end-to-end loop the work-order encodes:
 *
 *   for iteration in 0..max_iterations:
 *     1. dispatch the work-order's target_agent via the jit-agents library
 *        (DEC-0044 narrowed; pi-jit-agents stays a library import per JI-021).
 *     2. run the work-order's real_check_criteria via runRealChecks
 *        (deterministic verdict per DEC-0018 + DEC-0047 clause 5 — never the
 *        executing agent's self-report).
 *     3. on pass: commit-attested with writer-identity footer; final_status
 *        = "completed".
 *     4. on fail: ask the human at the iteration boundary (ctx.ui.confirm)
 *        whether to retry. !confirm → final_status = "aborted-by-human".
 *
 * If the loop exhausts max_iterations without a pass → final_status =
 * "failed". The aim is one Pi tool invocation that closes the entire loop
 * — the orchestrator no longer manually chains call-agent / run-real-checks
 * / commit-attested per iteration.
 *
 * Per DEC-0014 the orchestrator-side composite is the only authorized
 * driver of this loop; per FEAT-005 the agent_grant the orchestrator
 * passes is composed (intersected) at the call-agent dispatch boundary.
 */

import { readBlock } from "@davidorex/pi-context/block-api";
import { createAgentLoader } from "@davidorex/pi-jit-agents/agent-spec";
import { compileAgent } from "@davidorex/pi-jit-agents/compile";
import { executeAgent as canonicalExecuteAgent } from "@davidorex/pi-jit-agents/runtime";
import { createTemplateEnv } from "@davidorex/pi-jit-agents/template";
import type { CompiledAgent, DispatchContext, JitAgentResult } from "@davidorex/pi-jit-agents/types";
import type { Api, Model } from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { type AttestedCommitResult, attestedCommit as canonicalAttestedCommit } from "./attested-commit.js";
import { composeToolGrant } from "./capability-composer.js";
import {
	runRealChecks as canonicalRunRealChecks,
	type RealCheckCriteria,
	type RealCheckResult,
} from "./real-check-runner.js";

export class WorkOrderNotFoundError extends Error {
	constructor(workOrderId: string) {
		super(`work-order-loop: work-order '${workOrderId}' not found in work-orders block`);
		this.name = "WorkOrderNotFoundError";
	}
}

export interface WorkOrderIteration {
	iteration: number;
	agent_output: unknown;
	real_check_result: RealCheckResult;
	commit_attested_result?: AttestedCommitResult;
	status: "passed" | "failed";
}

export interface WorkOrderLoopResult {
	work_order_id: string;
	iterations: WorkOrderIteration[];
	final_status: "completed" | "failed" | "aborted-by-human" | "aborted-non-interactive";
	commit_sha?: string;
	total_duration_ms: number;
}

export interface WorkOrderLoopOptions {
	work_order_id: string;
	max_iterations?: number;
	agent_grant?: string[];
}

interface WorkOrderRecord {
	id: string;
	target_agent: string;
	real_check_criteria?: RealCheckCriteria;
	scope?: { files?: string[]; directories?: string[]; operations?: string[] };
}

function parseModelSpec(spec: string): { provider: string; modelId: string } {
	const slashIndex = spec.indexOf("/");
	if (slashIndex !== -1) return { provider: spec.slice(0, slashIndex), modelId: spec.slice(slashIndex + 1) };
	return { provider: "anthropic", modelId: spec };
}

/**
 * Internal indirection — tests substitute these to short-circuit the
 * jit-agents / real-check / commit paths. Production code path never
 * reassigns; the same indirection pattern as call-agent-tool._internals.
 */
type DispatchTargetAgent = (
	cwd: string,
	wo: WorkOrderRecord,
	agentGrant: string[],
	ctx: ExtensionContext,
) => Promise<JitAgentResult>;

export const _internals = {
	executeAgent: canonicalExecuteAgent as (c: CompiledAgent, d: DispatchContext) => Promise<JitAgentResult>,
	runRealChecks: canonicalRunRealChecks,
	attestedCommit: canonicalAttestedCommit,
	/**
	 * Tests reassign this to short-circuit the model/auth resolution +
	 * jit-agents compile/dispatch chain. Production code path runs the
	 * default canonical implementation.
	 */
	dispatchTargetAgent: undefined as DispatchTargetAgent | undefined,
};

async function dispatchTargetAgent(
	cwd: string,
	wo: WorkOrderRecord,
	agentGrant: string[],
	ctx: ExtensionContext,
): Promise<JitAgentResult> {
	const loadAgent = createAgentLoader({ cwd });
	const spec = loadAgent(wo.target_agent);
	const env = createTemplateEnv({ cwd });
	const compiled = compileAgent(spec, { env, input: { work_order_id: wo.id }, cwd });
	const modelSpec = compiled.model ?? spec.model;
	if (!modelSpec) {
		throw new Error(`work-order-loop: agent '${wo.target_agent}' has no model specified.`);
	}
	const { provider, modelId } = parseModelSpec(modelSpec);
	const model = ctx.modelRegistry.find(provider, modelId);
	if (!model) {
		throw new Error(`work-order-loop: model '${modelSpec}' not found for agent '${wo.target_agent}'.`);
	}
	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
	if (!auth.ok) {
		throw new Error(`work-order-loop: auth resolution failed for '${modelSpec}': ${auth.error}`);
	}
	// Intersect at dispatch boundary per FEAT-005 (parent ∩ requested = agentGrant ∩ spec.tools).
	const composedGrant = composeToolGrant(agentGrant, spec.tools);
	const dispatch: DispatchContext = {
		model: model as Model<Api>,
		auth: { apiKey: auth.apiKey ?? "", headers: auth.headers ?? {} },
		parentGrant: composedGrant,
		maxTokens: 1024,
	};
	return _internals.executeAgent(compiled, dispatch);
}

export async function runWorkOrderLoop(
	cwd: string,
	options: WorkOrderLoopOptions,
	ctx: ExtensionContext,
): Promise<WorkOrderLoopResult> {
	const start = Date.now();
	const maxIterations = options.max_iterations ?? 3;

	const data = readBlock(cwd, "work-orders") as { work_orders: WorkOrderRecord[] };
	const wo = data.work_orders.find((w) => w.id === options.work_order_id);
	if (!wo) throw new WorkOrderNotFoundError(options.work_order_id);

	const iterations: WorkOrderIteration[] = [];
	let finalStatus: WorkOrderLoopResult["final_status"] = "failed";
	let commitSha: string | undefined;

	const dispatch = _internals.dispatchTargetAgent ?? dispatchTargetAgent;

	for (let i = 0; i < maxIterations; i++) {
		const agentResult = await dispatch(cwd, wo, options.agent_grant ?? [], ctx);
		const realCheck = await _internals.runRealChecks(cwd, wo.id, wo.real_check_criteria ?? { build_check_test: true });

		if (realCheck.passed) {
			const files = wo.scope?.files ?? [];
			const commitMessage = `feat(work-order-${wo.id}): completion under FEAT-006 loop (iteration ${i + 1}/${maxIterations})`;
			let commit: AttestedCommitResult | undefined;
			if (files.length > 0) {
				commit = await _internals.attestedCommit(cwd, {
					files,
					message: commitMessage,
					agent_id: wo.target_agent,
					work_order_id: wo.id,
				});
				commitSha = commit.commit_sha;
			}
			iterations.push({
				iteration: i,
				agent_output: agentResult.output,
				real_check_result: realCheck,
				commit_attested_result: commit,
				status: "passed",
			});
			finalStatus = "completed";
			break;
		}

		iterations.push({
			iteration: i,
			agent_output: agentResult.output,
			real_check_result: realCheck,
			status: "failed",
		});

		// Human-OK gate at iteration boundary. Skip after final iteration —
		// the loop will exit naturally as "failed" without asking the user
		// whether to retry past max_iterations.
		if (i < maxIterations - 1) {
			// Non-interactive contexts have no human to ask. Do NOT call
			// ctx.ui.confirm (which would return an environment default) and
			// mislabel that default as a human decision. Mirror the auth-gate
			// pattern (auth-gate.ts checks !ctx.hasUI first) and record the
			// distinct "aborted-non-interactive" status.
			if (ctx.hasUI === false) {
				finalStatus = "aborted-non-interactive";
				break;
			}
			const failExcerpt = JSON.stringify(realCheck.details, null, 2).slice(0, 500);
			const proceed = await ctx.ui.confirm(
				"Real-check failed",
				`Iteration ${i + 1}/${maxIterations} failed. Retry?\nFail-report: ${failExcerpt}`,
			);
			if (!proceed) {
				finalStatus = "aborted-by-human";
				break;
			}
		}
	}

	return {
		work_order_id: wo.id,
		iterations,
		final_status: finalStatus,
		commit_sha: commitSha,
		total_duration_ms: Date.now() - start,
	};
}
