/**
 * Integration tests for checkpoint/resume — proves the full cycle
 * using mock dispatch (no real subprocesses).
 */

import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { readState } from "./state.js";
import { makeSpec, mockCtx, mockPi } from "./test-helpers.js";
import type { StepResult, StepUsage } from "./types.js";
import { executeWorkflow, requestPause } from "./workflow-executor.js";

const zeroUsage: StepUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 };

function mockResult(stepName: string, text: string): StepResult {
	return {
		step: stepName,
		agent: "mock",
		status: "completed" as const,
		textOutput: text,
		usage: { ...zeroUsage },
		durationMs: 100,
	};
}

describe("resume: crash recovery", () => {
	it("skips completed steps when resuming after failure", async (t) => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-resume-"));
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const dispatched: string[] = [];

		const spec = makeSpec({
			steps: {
				step1: { agent: "a" },
				step2: { agent: "b" },
				step3: { agent: "c" },
			},
		});

		// First run: step1 succeeds, step2 fails
		const failDispatch = async (_step: any, _agent: any, _prompt: string, opts: any) => {
			dispatched.push(opts.stepName);
			if (opts.stepName === "step2") {
				return {
					...mockResult(opts.stepName, ""),
					status: "failed" as const,
					error: "Simulated failure",
				};
			}
			return mockResult(opts.stepName, `output-${opts.stepName}`);
		};

		const result1 = await executeWorkflow(
			spec,
			{},
			{
				ctx: mockCtx(tmpDir),
				pi: mockPi(),
				loadAgent: () => ({ name: "mock" }),
				dispatchFn: failDispatch,
			},
		);

		assert.strictEqual(result1.status, "failed");
		assert.ok(dispatched.includes("step1"));
		assert.ok(dispatched.includes("step2"));

		// Verify state on disk
		const savedState = readState(result1.runDir)!;
		assert.ok(savedState, "state should be persisted");
		assert.strictEqual(savedState.steps.step1.status, "completed");
		assert.strictEqual(savedState.steps.step2.status, "failed");

		// Second run: resume — step1 NOT dispatched, step2 re-runs successfully, step3 runs
		dispatched.length = 0;
		const successDispatch = async (_step: any, _agent: any, _prompt: string, opts: any) => {
			dispatched.push(opts.stepName);
			return mockResult(opts.stepName, `output-${opts.stepName}`);
		};

		const result2 = await executeWorkflow(
			spec,
			{},
			{
				ctx: mockCtx(tmpDir),
				pi: mockPi(),
				loadAgent: () => ({ name: "mock" }),
				dispatchFn: successDispatch,
				resume: {
					runId: result1.runId,
					runDir: result1.runDir,
					state: savedState,
				},
			},
		);

		assert.strictEqual(result2.status, "completed");
		assert.ok(!dispatched.includes("step1"), "step1 should be skipped on resume");
		assert.ok(dispatched.includes("step2"), "step2 should re-run");
		assert.ok(dispatched.includes("step3"), "step3 should run");
	});
});

describe("resume: pause step", () => {
	it("pauses at a pause step and resumes from the next step", async (t) => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-resume-"));
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const dispatched: string[] = [];
		const mockDispatch = async (_step: any, _agent: any, _prompt: string, opts: any) => {
			dispatched.push(opts.stepName);
			return mockResult(opts.stepName, `output-${opts.stepName}`);
		};

		const spec = makeSpec({
			steps: {
				step1: { agent: "a" },
				checkpoint: { pause: "Review step1 results" },
				step2: { agent: "b" },
			},
		});

		// Run 1: should pause after step1 + checkpoint
		const result1 = await executeWorkflow(
			spec,
			{},
			{
				ctx: mockCtx(tmpDir),
				pi: mockPi(),
				loadAgent: () => ({ name: "mock" }),
				dispatchFn: mockDispatch,
			},
		);

		assert.strictEqual(result1.status, "paused");
		assert.ok(dispatched.includes("step1"));
		assert.ok(!dispatched.includes("step2"), "step2 should not run before resume");

		// Verify state on disk
		const savedState = readState(result1.runDir)!;
		assert.ok(savedState, "state should be persisted");
		assert.strictEqual(savedState.status, "paused");
		assert.strictEqual(savedState.steps.step1.status, "completed");
		assert.strictEqual(savedState.steps.checkpoint.status, "completed");

		// Run 2: resume — step1 and checkpoint skipped, step2 runs
		dispatched.length = 0;
		const result2 = await executeWorkflow(
			spec,
			{},
			{
				ctx: mockCtx(tmpDir),
				pi: mockPi(),
				loadAgent: () => ({ name: "mock" }),
				dispatchFn: mockDispatch,
				resume: {
					runId: result1.runId,
					runDir: result1.runDir,
					state: savedState,
				},
			},
		);

		assert.strictEqual(result2.status, "completed");
		assert.ok(!dispatched.includes("step1"), "step1 should be skipped");
		assert.ok(!dispatched.includes("checkpoint"), "checkpoint should be skipped");
		assert.ok(dispatched.includes("step2"), "step2 should run");
	});
});

describe("resume: keybinding-initiated pause", () => {
	it("pauses between steps when requestPause is called", async (t) => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-resume-"));
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const dispatched: string[] = [];
		const mockDispatch = async (_step: any, _agent: any, _prompt: string, opts: any) => {
			dispatched.push(opts.stepName);
			// After step1 dispatch, request pause
			if (opts.stepName === "step1") {
				requestPause();
			}
			return mockResult(opts.stepName, `output-${opts.stepName}`);
		};

		const spec = makeSpec({
			steps: {
				step1: { agent: "a" },
				step2: { agent: "b" },
				step3: { agent: "c" },
			},
		});

		const result = await executeWorkflow(
			spec,
			{},
			{
				ctx: mockCtx(tmpDir),
				pi: mockPi(),
				loadAgent: () => ({ name: "mock" }),
				dispatchFn: mockDispatch,
			},
		);

		assert.strictEqual(result.status, "paused");
		assert.ok(dispatched.includes("step1"));
		assert.ok(!dispatched.includes("step2"), "step2 should not run — paused after step1");
	});
});
