import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
	computeResumePoint,
	findIncompleteRun,
	formatIncompleteRun,
	validateResumeCompatibility,
} from "./checkpoint.js";
import { writeState } from "./state.js";
import { makeSpec } from "./test-helpers.js";
import type { ExecutionState } from "./types.js";

describe("findIncompleteRun", () => {
	it("returns null when no runs directory exists", () => {
		const result = findIncompleteRun("/nonexistent", "test-workflow");
		assert.strictEqual(result, null);
	});

	it("returns null when all runs are completed", (t) => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-ckpt-"));
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const runDir = path.join(tmpDir, ".workflows", "runs", "test", "runs", "test-20260314-120000-abcd");
		fs.mkdirSync(runDir, { recursive: true });
		writeState(runDir, { input: {}, steps: {}, status: "completed" });

		const result = findIncompleteRun(tmpDir, "test");
		assert.strictEqual(result, null);
	});

	it("finds a run with status 'running' (interrupted)", (t) => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-ckpt-"));
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const runDir = path.join(tmpDir, ".workflows", "runs", "test", "runs", "test-20260314-120000-abcd");
		fs.mkdirSync(runDir, { recursive: true });

		const state: ExecutionState = {
			input: { path: "/src" },
			steps: {
				explore: {
					step: "explore",
					agent: "explorer",
					status: "completed",
					usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 1 },
					durationMs: 1000,
					textOutput: "found stuff",
				},
			},
			status: "running",
		};
		writeState(runDir, state);

		const result = findIncompleteRun(tmpDir, "test");
		assert.ok(result);
		assert.strictEqual(result.runId, "test-20260314-120000-abcd");
		assert.deepStrictEqual(result.completedSteps, ["explore"]);
		assert.strictEqual(result.failedStep, undefined);
	});

	it("finds a run with status 'failed'", (t) => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-ckpt-"));
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const runDir = path.join(tmpDir, ".workflows", "runs", "test", "runs", "test-20260314-120000-abcd");
		fs.mkdirSync(runDir, { recursive: true });

		const state: ExecutionState = {
			input: {},
			steps: {
				step1: {
					step: "step1",
					agent: "a",
					status: "completed",
					usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 },
					durationMs: 0,
				},
				step2: {
					step: "step2",
					agent: "b",
					status: "failed",
					usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 },
					durationMs: 0,
					error: "timeout",
				},
			},
			status: "failed",
		};
		writeState(runDir, state);

		const result = findIncompleteRun(tmpDir, "test");
		assert.ok(result);
		assert.deepStrictEqual(result.completedSteps, ["step1"]);
		assert.strictEqual(result.failedStep, "step2");
	});

	it("returns most recent incomplete run", (t) => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-ckpt-"));
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const runsBase = path.join(tmpDir, ".workflows", "runs", "test", "runs");

		// Older run (completed)
		const oldDir = path.join(runsBase, "test-20260314-100000-aaaa");
		fs.mkdirSync(oldDir, { recursive: true });
		writeState(oldDir, { input: {}, steps: {}, status: "completed" });

		// Newer run (failed)
		const newDir = path.join(runsBase, "test-20260314-120000-bbbb");
		fs.mkdirSync(newDir, { recursive: true });
		writeState(newDir, { input: {}, steps: {}, status: "failed" });

		const result = findIncompleteRun(tmpDir, "test");
		assert.ok(result);
		assert.strictEqual(result.runId, "test-20260314-120000-bbbb");
	});
});

describe("validateResumeCompatibility", () => {
	it("returns null when compatible", () => {
		const state: ExecutionState = {
			input: {},
			steps: {
				step1: {
					step: "step1",
					agent: "a",
					status: "completed",
					usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 },
					durationMs: 0,
				},
			},
			status: "failed",
			specVersion: "1",
		};
		const spec = makeSpec({ version: "1", steps: { step1: { agent: "a" }, step2: { agent: "b" } } });
		assert.strictEqual(validateResumeCompatibility(state, spec), null);
	});

	it("rejects version mismatch", () => {
		const state: ExecutionState = {
			input: {},
			steps: {},
			status: "failed",
			specVersion: "1",
		};
		const spec = makeSpec({ version: "2", steps: { step1: { agent: "a" } } });
		const msg = validateResumeCompatibility(state, spec);
		assert.ok(msg?.includes("version"));
	});

	it("rejects when completed step no longer exists in spec", () => {
		const state: ExecutionState = {
			input: {},
			steps: {
				removed_step: {
					step: "removed_step",
					agent: "a",
					status: "completed",
					usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 },
					durationMs: 0,
				},
			},
			status: "failed",
		};
		const spec = makeSpec({ steps: { different_step: { agent: "a" } } });
		const msg = validateResumeCompatibility(state, spec);
		assert.ok(msg?.includes("removed_step"));
	});
});

describe("computeResumePoint", () => {
	it("returns first layer with pending steps", () => {
		const plan = [{ steps: ["a"] }, { steps: ["b", "c"] }, { steps: ["d"] }];
		const completed = new Set(["a"]);
		const result = computeResumePoint(plan, completed);
		assert.ok(result);
		assert.strictEqual(result.resumeLayerIndex, 1);
		assert.deepStrictEqual(result.pendingStepsInLayer, ["b", "c"]);
	});

	it("returns only pending steps in a partially completed layer", () => {
		const plan = [{ steps: ["a"] }, { steps: ["b", "c", "d"] }, { steps: ["e"] }];
		const completed = new Set(["a", "b", "d"]);
		const result = computeResumePoint(plan, completed);
		assert.ok(result);
		assert.strictEqual(result.resumeLayerIndex, 1);
		assert.deepStrictEqual(result.pendingStepsInLayer, ["c"]);
	});

	it("returns null when all steps are completed", () => {
		const plan = [{ steps: ["a"] }, { steps: ["b"] }];
		const completed = new Set(["a", "b"]);
		const result = computeResumePoint(plan, completed);
		assert.strictEqual(result, null);
	});

	it("handles first layer being the resume point", () => {
		const plan = [{ steps: ["a", "b"] }, { steps: ["c"] }];
		const completed = new Set<string>();
		const result = computeResumePoint(plan, completed);
		assert.ok(result);
		assert.strictEqual(result.resumeLayerIndex, 0);
		assert.deepStrictEqual(result.pendingStepsInLayer, ["a", "b"]);
	});
});

describe("formatIncompleteRun", () => {
	it("formats an interrupted run", () => {
		const run = {
			runId: "test-20260314-120000-abcd",
			runDir: "/tmp/runs/test-20260314-120000-abcd",
			state: { input: {}, steps: {}, status: "running" as const },
			completedSteps: ["explore", "analyze"],
			updatedAt: "2026-03-14T12:00:00.000Z",
		};
		const spec = makeSpec({ steps: { explore: { agent: "a" }, analyze: { agent: "b" }, synthesize: { agent: "c" } } });
		const msg = formatIncompleteRun(run, spec);
		assert.ok(msg.includes("interrupted"));
		assert.ok(msg.includes("2/3"));
	});

	it("formats a failed run with step name", () => {
		const run = {
			runId: "test-20260314-120000-abcd",
			runDir: "/tmp/runs/test-20260314-120000-abcd",
			state: { input: {}, steps: {}, status: "failed" as const },
			completedSteps: ["explore"],
			failedStep: "analyze",
			updatedAt: "2026-03-14T12:00:00.000Z",
		};
		const spec = makeSpec({ steps: { explore: { agent: "a" }, analyze: { agent: "b" }, synthesize: { agent: "c" } } });
		const msg = formatIncompleteRun(run, spec);
		assert.ok(msg.includes("failed"));
		assert.ok(msg.includes("analyze"));
		assert.ok(msg.includes("1/3"));
	});
});
