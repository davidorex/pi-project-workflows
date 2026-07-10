import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { writeBootstrapPointer } from "@davidorex/pi-context/context-dir";
import type { JitAgentResult } from "@davidorex/pi-jit-agents/types";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { AttestedCommitResult } from "./attested-commit.js";
import type { RealCheckCriteria, RealCheckResult } from "./real-check-runner.js";
import {
	_internals,
	clampToScope,
	runWorkOrderLoop,
	validateWorkOrderInput,
	WorkOrderNotFoundError,
} from "./work-order-loop.js";

interface ConfirmCall {
	title: string;
	message: string;
}

function mockCtx(
	cwd: string,
	confirmAnswers: boolean[] = [],
	hasUI = true,
): { ctx: ExtensionContext; calls: ConfirmCall[] } {
	const calls: ConfirmCall[] = [];
	let answerIdx = 0;
	const ctx = {
		cwd,
		hasUI,
		ui: {
			confirm: async (title: string, message: string) => {
				calls.push({ title, message });
				const ans = confirmAnswers[answerIdx];
				answerIdx++;
				return ans ?? true;
			},
		},
	} as unknown as ExtensionContext;
	return { ctx, calls };
}

function writeWorkOrders(
	cwd: string,
	work_orders: Array<{
		id: string;
		target_agent?: string;
		real_check_criteria?: RealCheckCriteria;
		scope?: { files?: string[] };
	}>,
): void {
	fs.writeFileSync(path.join(cwd, "substrate", "work-orders.json"), JSON.stringify({ work_orders }));
}

const PASSING_REAL_CHECK: RealCheckResult = {
	passed: true,
	work_order_id: "WO-001",
	details: { build_check_test: { passed: true, exit_code: 0, stdout: "ok", stderr: "", duration_ms: 1 } },
	total_duration_ms: 1,
	timestamp: new Date().toISOString(),
};

const FAILING_REAL_CHECK: RealCheckResult = {
	passed: false,
	work_order_id: "WO-001",
	details: { build_check_test: { passed: false, exit_code: 1, stdout: "", stderr: "boom", duration_ms: 1 } },
	total_duration_ms: 1,
	timestamp: new Date().toISOString(),
};

const ATTESTED_COMMIT_RESULT: AttestedCommitResult = {
	committed: true,
	commit_sha: "deadbeef",
	exit_code: 0,
	stdout: "ok",
	stderr: "",
};

const FAKE_AGENT_RESULT: JitAgentResult = {
	output: { ok: true },
	usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
} as unknown as JitAgentResult;

describe("runWorkOrderLoop", () => {
	let tmpDir: string;
	let originalRealChecks: typeof _internals.runRealChecks;
	let originalAttestedCommit: typeof _internals.attestedCommit;
	let originalDispatch: typeof _internals.dispatchTargetAgent;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-agent-dispatch-work-order-loop-"));
		fs.mkdirSync(path.join(tmpDir, "substrate"), { recursive: true });
		writeBootstrapPointer(tmpDir, "substrate");
		originalRealChecks = _internals.runRealChecks;
		originalAttestedCommit = _internals.attestedCommit;
		originalDispatch = _internals.dispatchTargetAgent;
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
		_internals.runRealChecks = originalRealChecks;
		_internals.attestedCommit = originalAttestedCommit;
		_internals.dispatchTargetAgent = originalDispatch;
	});

	it("bounded iteration count — agent fails both attempts → final_status=failed + iterations.length=2", async () => {
		writeWorkOrders(tmpDir, [
			{ id: "WO-001", target_agent: "stub", real_check_criteria: { build_check_test: true }, scope: { files: [] } },
		]);
		_internals.dispatchTargetAgent = async () => FAKE_AGENT_RESULT;
		_internals.runRealChecks = async () => FAILING_REAL_CHECK;
		_internals.attestedCommit = async () => ATTESTED_COMMIT_RESULT;
		const { ctx, calls } = mockCtx(tmpDir, [true]); // consent to retry between iter 1 and iter 2

		const result = await runWorkOrderLoop(tmpDir, { work_order_id: "WO-001", max_iterations: 2 }, ctx);

		assert.equal(result.final_status, "failed");
		assert.equal(result.iterations.length, 2);
		assert.equal(result.iterations[0].status, "failed");
		assert.equal(result.iterations[1].status, "failed");
		assert.equal(calls.length, 1); // confirm fires once (between iter 1 + iter 2; not after iter 2)
		assert.equal(result.commit_sha, undefined);
	});

	it("happy path — passes on iteration 1 → final_status=completed + commit_sha set + iterations.length=1", async () => {
		writeWorkOrders(tmpDir, [
			{
				id: "WO-002",
				target_agent: "stub",
				real_check_criteria: { build_check_test: true },
				scope: { files: ["src/foo.ts"] },
			},
		]);
		_internals.dispatchTargetAgent = async () => FAKE_AGENT_RESULT;
		_internals.runRealChecks = async () => ({ ...PASSING_REAL_CHECK, work_order_id: "WO-002" });
		_internals.attestedCommit = async () => ATTESTED_COMMIT_RESULT;
		const { ctx, calls } = mockCtx(tmpDir);

		const result = await runWorkOrderLoop(tmpDir, { work_order_id: "WO-002", max_iterations: 3 }, ctx);

		assert.equal(result.final_status, "completed");
		assert.equal(result.iterations.length, 1);
		assert.equal(result.iterations[0].status, "passed");
		assert.equal(result.commit_sha, "deadbeef");
		assert.equal(calls.length, 0);
	});

	it("fail-then-pass on retry — iter 1 fails, iter 2 passes → final_status=completed + iterations.length=2", async () => {
		writeWorkOrders(tmpDir, [
			{
				id: "WO-003",
				target_agent: "stub",
				real_check_criteria: { build_check_test: true },
				scope: { files: ["src/bar.ts"] },
			},
		]);
		_internals.dispatchTargetAgent = async () => FAKE_AGENT_RESULT;
		let calls = 0;
		_internals.runRealChecks = async () => {
			calls++;
			return calls === 1 ? FAILING_REAL_CHECK : { ...PASSING_REAL_CHECK, work_order_id: "WO-003" };
		};
		_internals.attestedCommit = async () => ATTESTED_COMMIT_RESULT;
		const { ctx, calls: confirmCalls } = mockCtx(tmpDir, [true]);

		const result = await runWorkOrderLoop(tmpDir, { work_order_id: "WO-003", max_iterations: 3 }, ctx);

		assert.equal(result.final_status, "completed");
		assert.equal(result.iterations.length, 2);
		assert.equal(result.iterations[0].status, "failed");
		assert.equal(result.iterations[1].status, "passed");
		assert.equal(result.commit_sha, "deadbeef");
		assert.equal(confirmCalls.length, 1);
	});

	it("human-aborts-at-boundary — fail iter 1; ctx.ui.confirm=false → final_status=aborted-by-human + iterations.length=1", async () => {
		writeWorkOrders(tmpDir, [
			{
				id: "WO-004",
				target_agent: "stub",
				real_check_criteria: { build_check_test: true },
				scope: { files: ["src/baz.ts"] },
			},
		]);
		_internals.dispatchTargetAgent = async () => FAKE_AGENT_RESULT;
		_internals.runRealChecks = async () => FAILING_REAL_CHECK;
		_internals.attestedCommit = async () => ATTESTED_COMMIT_RESULT;
		const { ctx, calls } = mockCtx(tmpDir, [false]);

		const result = await runWorkOrderLoop(tmpDir, { work_order_id: "WO-004", max_iterations: 3 }, ctx);

		assert.equal(result.final_status, "aborted-by-human");
		assert.equal(result.iterations.length, 1);
		assert.equal(calls.length, 1);
		assert.equal(result.commit_sha, undefined);
	});

	it("non-interactive-abort — fail iter 1; ctx.hasUI=false → final_status=aborted-non-interactive + confirm never called + iterations.length=1", async () => {
		writeWorkOrders(tmpDir, [
			{
				id: "WO-006",
				target_agent: "stub",
				real_check_criteria: { build_check_test: true },
				scope: { files: ["src/quux.ts"] },
			},
		]);
		_internals.dispatchTargetAgent = async () => FAKE_AGENT_RESULT;
		_internals.runRealChecks = async () => FAILING_REAL_CHECK;
		_internals.attestedCommit = async () => ATTESTED_COMMIT_RESULT;
		const { ctx, calls } = mockCtx(tmpDir, [], false); // non-interactive: no UI to confirm against

		const result = await runWorkOrderLoop(tmpDir, { work_order_id: "WO-006", max_iterations: 2 }, ctx);

		assert.equal(result.final_status, "aborted-non-interactive");
		assert.equal(result.iterations.length, 1); // exactly one iteration ran; no retry past the environment default
		assert.equal(calls.length, 0); // ctx.ui.confirm was NEVER called
		assert.equal(result.commit_sha, undefined);
	});

	it("WorkOrderNotFoundError when work_order_id absent from substrate", async () => {
		writeWorkOrders(tmpDir, []);
		_internals.dispatchTargetAgent = async () => FAKE_AGENT_RESULT;
		const { ctx } = mockCtx(tmpDir);

		await assert.rejects(
			runWorkOrderLoop(tmpDir, { work_order_id: "WO-999" }, ctx),
			(err: Error) => err instanceof WorkOrderNotFoundError && /WO-999/.test(err.message),
		);
	});

	it("propagates real_check_result + commit_attested_result in the iteration record", async () => {
		writeWorkOrders(tmpDir, [
			{
				id: "WO-005",
				target_agent: "stub",
				real_check_criteria: { build_check_test: true },
				scope: { files: ["src/qux.ts"] },
			},
		]);
		_internals.dispatchTargetAgent = async () => FAKE_AGENT_RESULT;
		_internals.runRealChecks = async () => ({ ...PASSING_REAL_CHECK, work_order_id: "WO-005" });
		_internals.attestedCommit = async () => ATTESTED_COMMIT_RESULT;
		const { ctx } = mockCtx(tmpDir);

		const result = await runWorkOrderLoop(tmpDir, { work_order_id: "WO-005" }, ctx);

		assert.equal(result.iterations[0].real_check_result.work_order_id, "WO-005");
		assert.equal(result.iterations[0].real_check_result.passed, true);
		assert.equal(result.iterations[0].commit_attested_result?.commit_sha, "deadbeef");
		assert.equal(result.iterations[0].commit_attested_result?.committed, true);
		assert.deepEqual(result.iterations[0].agent_output, { ok: true });
	});
});

describe("clampToScope — the work-order scope clamp intersecting the composed capability grant with the work-order's declared scope.operations", () => {
	it("intersects the composed grant to scope.operations (['write','bash'] ∩ ['write'] = ['write'])", () => {
		assert.deepEqual(clampToScope(["write", "bash"], ["write"]), ["write"]);
	});

	it("drops every tool the work-order does not authorize (bash excluded when scope is ['write'])", () => {
		const clamped = clampToScope(["write", "bash", "read"], ["write"]);
		assert.deepEqual(clamped, ["write"]);
		assert.equal(clamped.includes("bash"), false);
	});

	it("is a no-op when scope.operations is absent (undefined) — composed grant unchanged", () => {
		assert.deepEqual(clampToScope(["write", "bash"], undefined), ["write", "bash"]);
	});

	it("is a no-op when scope.operations is an empty array — composed grant unchanged", () => {
		assert.deepEqual(clampToScope(["write", "bash"], []), ["write", "bash"]);
	});

	it("preserves grant order and yields [] when scope authorizes nothing the grant holds", () => {
		assert.deepEqual(clampToScope(["read", "write"], ["bash"]), []);
	});
});

describe("validateWorkOrderInput — the work-order's input_contract validation", () => {
	const CONTRACT = {
		type: "object",
		required: ["work_order_id"],
		properties: { work_order_id: { type: "string" } },
		additionalProperties: false,
	} as Record<string, unknown>;

	it("passes a conforming input against the declared contract", () => {
		assert.doesNotThrow(() => validateWorkOrderInput({ work_order_id: "WO-101" }, CONTRACT, "WO-101"));
	});

	it("throws naming the work-order id when the input violates the contract (wrong type)", () => {
		assert.throws(
			() => validateWorkOrderInput({ work_order_id: 42 } as unknown as Record<string, unknown>, CONTRACT, "WO-102"),
			(err: Error) => /WO-102/.test(err.message) && /input_contract/.test(err.message),
		);
	});

	it("throws when a required property is missing from the input", () => {
		assert.throws(
			() => validateWorkOrderInput({}, CONTRACT, "WO-103"),
			(err: Error) => /WO-103/.test(err.message),
		);
	});

	it("is a no-op pass-through when no contract is declared (undefined)", () => {
		assert.doesNotThrow(() => validateWorkOrderInput({ work_order_id: "WO-104" }, undefined, "WO-104"));
	});
});
