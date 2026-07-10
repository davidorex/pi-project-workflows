/**
 * work-order-loop — bounded implementation of the end-to-end
 * orchestrator-declared work-order execution loop.
 *
 * The orchestrator declares a work-order (per the work-order schema/block
 * covering target_agent, real_check_criteria, scope, input_contract). This
 * library drives the end-to-end loop the work-order encodes:
 *
 *   for iteration in 0..max_iterations:
 *     1. dispatch the work-order's target_agent as a `pi` subprocess —
 *        in-process dispatch can't execute tools (pi-jit-agents'
 *        executeAgent is a single-turn completion primitive binding none),
 *        so real tool execution requires a `pi` subprocess. pi-jit-agents is
 *        used directly as a library here, never wrapped by an intermediating
 *        extension, staying the classify / structured-output primitive.
 *     2. run the work-order's real_check_criteria via runRealChecks
 *        (deterministic verdict — never the
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
 * Per this harness's confinement of the main LLM to acting only through
 * extension tools / JIT-agent dispatch / workflows (never default
 * bash/read/write/edit directly), the orchestrator-side composite is the
 * only authorized driver of this loop; the agent_grant the orchestrator
 * passes is composed (intersected) at the call-agent dispatch boundary.
 */

import { readBlock } from "@davidorex/pi-context/block-api";
import { validate } from "@davidorex/pi-context/schema-validator";
import { createAgentLoader } from "@davidorex/pi-jit-agents/agent-spec";
import { compileAgent } from "@davidorex/pi-jit-agents/compile";
import { bundledTemplateDir, createTemplateEnv } from "@davidorex/pi-jit-agents/template";
import type { JitAgentResult } from "@davidorex/pi-jit-agents/types";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { type AttestedCommitResult, attestedCommit as canonicalAttestedCommit } from "./attested-commit.js";
import { composeToolGrant } from "./capability-composer.js";
import { dispatchLoadContext } from "./dispatch-loader.js";
import { resolveDispatchModel } from "./dispatch-model.js";
import {
	runRealChecks as canonicalRunRealChecks,
	type RealCheckCriteria,
	type RealCheckResult,
} from "./real-check-runner.js";
import { runPiSubprocess } from "./subprocess-dispatch.js";

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
	input_contract?: Record<string, unknown>;
}

/**
 * Clamp a composed tool grant to the operations the work-order's `scope`
 * declares. The work-order's declared operation scope is the outer bound —
 * the dispatched agent can never exceed the operations the work-order itself
 * authorizes, regardless of the caller's agent_grant. When the work-order
 * declares no `scope.operations` (absent or empty array), the composed grant
 * is returned unchanged.
 */
export function clampToScope(composedGrant: string[], operations?: string[]): string[] {
	if (!operations || operations.length === 0) return composedGrant;
	const allowed = new Set(operations);
	return composedGrant.filter((t) => allowed.has(t));
}

/**
 * Validate a work-order dispatch input against the work-order's declared
 * `input_contract` (an inline JSON Schema). Reuses the canonical pi-context
 * AJV validator (shared instance / strictness / formats) rather than standing
 * up a parallel validator. On a contract violation THROWS an error naming the
 * work-order id and the AJV error detail (the loop surfaces thrown errors);
 * when no contract is declared this is a no-op pass-through.
 */
export function validateWorkOrderInput(
	input: Record<string, unknown>,
	contract: Record<string, unknown> | undefined,
	workOrderId: string,
): void {
	if (!contract) return;
	try {
		validate(contract, input, `work-order '${workOrderId}' input_contract`);
	} catch (err) {
		throw new Error(
			`work-order-loop: dispatch input for work-order '${workOrderId}' violates its input_contract: ${
				err instanceof Error ? err.message : String(err)
			}`,
		);
	}
}

/**
 * Internal indirection — tests substitute these to short-circuit the
 * subprocess dispatch / real-check / commit paths. Production code path never
 * reassigns; the same indirection pattern as call-agent-tool._internals.
 */
type DispatchTargetAgent = (
	cwd: string,
	wo: WorkOrderRecord,
	agentGrant: string[],
	ctx: ExtensionContext,
) => Promise<JitAgentResult>;

export const _internals = {
	runRealChecks: canonicalRunRealChecks,
	attestedCommit: canonicalAttestedCommit,
	/**
	 * Tests reassign this to short-circuit the spec compile + `pi` subprocess
	 * dispatch chain. Production code path runs the default canonical
	 * implementation below.
	 */
	dispatchTargetAgent: undefined as DispatchTargetAgent | undefined,
};

/**
 * Dispatch the work-order's target agent as a `pi` subprocess — in-process
 * dispatch can't execute tools (pi-jit-agents' executeAgent is a
 * single-turn completion primitive binding none), so real tool execution
 * requires a `pi` subprocess.
 *
 * The subprocess is the ONLY execution path that binds real, callable tools —
 * pi-jit-agents `executeAgent` binds none (it materializes only a phantom
 * output-schema tool), so an agent granted [write,bash] through that library
 * primitive can never act. We reuse pi-workflows' proven subprocess pattern:
 * compile the spec for its rendered task prompt + model + tool grant, then
 * spawn `pi --mode json --model <spec> --tools <composedGrant> -p <prompt>`
 * in `cwd` and collect the final assistant output. pi resolves model + auth
 * itself inside the subprocess (operator auth.json), so no DispatchContext
 * auth is threaded — `ctx` is retained only to satisfy the seam signature.
 */
async function dispatchTargetAgent(
	cwd: string,
	wo: WorkOrderRecord,
	agentGrant: string[],
	_ctx: ExtensionContext,
): Promise<JitAgentResult> {
	const loadAgent = createAgentLoader(dispatchLoadContext(cwd));
	const spec = loadAgent(wo.target_agent);
	// builtinDir = bundled pi-jit-agents templates/, so a bundled spec's task/system
	// templates resolve without a local copy.
	const env = createTemplateEnv({ cwd, builtinDir: bundledTemplateDir() });
	// Guard the dispatch input against the work-order's declared input_contract
	// BEFORE compiling/spawning; a contract violation throws and the loop
	// surfaces it (no subprocess is spawned on a bad input).
	const input = { work_order_id: wo.id };
	validateWorkOrderInput(input, wo.input_contract, wo.id);
	const compiled = compileAgent(spec, { env, input, cwd });
	// Model precedence, per this project's dispatch model-resolution order:
	// compiled/spec model → model-config by_role[role]
	// → default → null. A null result is NOT an error for subprocess dispatch — no
	// `--model` is passed and pi resolves its own default inside the subprocess.
	const modelSpec = compiled.model ?? spec.model ?? resolveDispatchModel(cwd, spec) ?? undefined;
	// Intersect at dispatch boundary (parent ∩ requested = agentGrant ∩ spec.tools).
	// The clamp now actually reaches execution: composedGrant becomes the
	// subprocess `--tools` allowlist (empty grant → `--no-tools`).
	const composedGrant = composeToolGrant(agentGrant, spec.tools);
	// The work-order's declared operation scope is the outer bound — clamp the
	// composed grant to wo.scope.operations so the dispatched agent can never
	// exceed the operations the work-order itself authorizes, regardless of the
	// caller's agent_grant. Absent/empty scope.operations → composedGrant
	// unchanged.
	const finalGrant = clampToScope(composedGrant, wo.scope?.operations);
	const result = await runPiSubprocess({
		cwd,
		model: modelSpec,
		tools: finalGrant,
		prompt: compiled.taskPrompt,
	});
	if (result.exitCode !== 0 || result.timedOut) {
		throw new Error(
			`work-order-loop: pi subprocess for agent '${wo.target_agent}' ` +
				`${result.timedOut ? "timed out" : `exited with code ${result.exitCode}`}` +
				`${result.stderr ? `: ${result.stderr}` : ""}`,
		);
	}
	if (!result.text) {
		throw new Error(
			`work-order-loop: pi subprocess for agent '${wo.target_agent}' produced no assistant output ` +
				`(exit ${result.exitCode})${result.stderr ? `: ${result.stderr}` : ""}`,
		);
	}
	return {
		output: result.text,
		raw: result.lastAssistantMessage,
		usage: result.usage,
	} as unknown as JitAgentResult;
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
