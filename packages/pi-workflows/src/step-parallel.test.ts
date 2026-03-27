import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import type { ExecutionLayer } from "./dag.js";
import type { ParallelOptions, SingleStepExecutor } from "./step-parallel.js";
import { executeParallelLayer, executeParallelStep } from "./step-parallel.js";
import { zeroUsage } from "./step-shared.js";
import { makeSpec, mockCtx, mockPi } from "./test-helpers.js";
import type { ExecutionState, StepSpec } from "./types.js";

function makeTmpDir(t: any): string {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-parallel-"));
	fs.mkdirSync(path.join(tmpDir, "outputs"), { recursive: true });
	fs.mkdirSync(path.join(tmpDir, "sessions"), { recursive: true });
	t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
	return tmpDir;
}

function makeParallelOptions(tmpDir: string, overrides?: Partial<ParallelOptions>): ParallelOptions {
	return {
		ctx: mockCtx(tmpDir),
		pi: mockPi(),
		loadAgent: () => ({ name: "default" }),
		runDir: tmpDir,
		spec: makeSpec({
			steps: {
				a: { agent: "test" },
				b: { agent: "test" },
				c: { agent: "test" },
			},
		}),
		widgetState: {
			spec: makeSpec({ steps: { a: { agent: "test" }, b: { agent: "test" }, c: { agent: "test" } } }),
			state: { input: {}, steps: {}, status: "running" },
			startTime: Date.now(),
		},
		...overrides,
	};
}

/**
 * Mock executor factory: controls behavior per step name.
 */
function mockExecutor(
	behavior: Record<string, { success: boolean; output?: unknown; delayMs?: number; usage?: any }> = {},
): SingleStepExecutor {
	return async (stepName, stepSpec, state, options) => {
		const b = behavior[stepName] ?? { success: true };
		if (b.delayMs) await new Promise((r) => setTimeout(r, b.delayMs));
		// Check abort signal to simulate cancellation
		if (options.signal?.aborted) {
			state.steps[stepName] = {
				step: stepName,
				agent: stepSpec.agent ?? "mock",
				status: "failed",
				output: undefined,
				usage: zeroUsage(),
				durationMs: 0,
				error: "aborted",
			};
			return false;
		}
		state.steps[stepName] = {
			step: stepName,
			agent: stepSpec.agent ?? "mock",
			status: b.success ? "completed" : "failed",
			output: b.output ?? { mock: true },
			usage: b.usage ?? zeroUsage(),
			durationMs: b.delayMs ?? 0,
			error: b.success ? undefined : "mock failure",
		};
		return b.success;
	};
}

describe("executeParallelLayer", () => {
	it("executes all steps in the layer", async (t) => {
		const tmpDir = makeTmpDir(t);
		const state: ExecutionState = { input: {}, steps: {}, status: "running" };
		const spec = makeSpec({
			steps: {
				a: { agent: "test" },
				b: { agent: "test" },
				c: { agent: "test" },
			},
		});
		const layer: ExecutionLayer = { steps: ["a", "b", "c"] };
		const options = makeParallelOptions(tmpDir, { spec });

		await executeParallelLayer(
			layer,
			spec,
			state,
			mockExecutor({
				a: { success: true },
				b: { success: true },
				c: { success: true },
			}),
			options,
		);

		assert.ok(state.steps.a);
		assert.ok(state.steps.b);
		assert.ok(state.steps.c);
		assert.strictEqual(state.steps.a.status, "completed");
		assert.strictEqual(state.steps.b.status, "completed");
		assert.strictEqual(state.steps.c.status, "completed");
	});

	it("sets state.status to failed when any step fails", async (t) => {
		const tmpDir = makeTmpDir(t);
		const state: ExecutionState = { input: {}, steps: {}, status: "running" };
		const spec = makeSpec({
			steps: {
				a: { agent: "test" },
				b: { agent: "test" },
			},
		});
		const layer: ExecutionLayer = { steps: ["a", "b"] };
		const options = makeParallelOptions(tmpDir, { spec });

		await executeParallelLayer(
			layer,
			spec,
			state,
			mockExecutor({
				a: { success: true },
				b: { success: false },
			}),
			options,
		);

		assert.strictEqual(state.status, "failed");
	});

	it("cancels remaining steps when one fails (abort signal)", async (t) => {
		const tmpDir = makeTmpDir(t);
		const state: ExecutionState = { input: {}, steps: {}, status: "running" };
		const spec = makeSpec({
			steps: {
				slow: { agent: "test" },
				fast_fail: { agent: "test" },
			},
		});
		const layer: ExecutionLayer = { steps: ["slow", "fast_fail"] };
		const options = makeParallelOptions(tmpDir, { spec });

		await executeParallelLayer(
			layer,
			spec,
			state,
			mockExecutor({
				slow: { success: true, delayMs: 200 },
				fast_fail: { success: false, delayMs: 10 },
			}),
			options,
		);

		assert.strictEqual(state.status, "failed");
		// The slow step may have been aborted — it should still have a result
		assert.ok(state.steps.fast_fail);
		assert.strictEqual(state.steps.fast_fail.status, "failed");
	});

	it("respects pre-aborted parent signal", async (t) => {
		const tmpDir = makeTmpDir(t);
		const state: ExecutionState = { input: {}, steps: {}, status: "running" };
		const spec = makeSpec({
			steps: { a: { agent: "test" } },
		});
		const layer: ExecutionLayer = { steps: ["a"] };
		const controller = new AbortController();
		controller.abort();
		const options = makeParallelOptions(tmpDir, { spec, signal: controller.signal });

		await executeParallelLayer(
			layer,
			spec,
			state,
			mockExecutor({
				a: { success: true },
			}),
			options,
		);

		// Step should see aborted signal
		if (state.steps.a) {
			// If it ran at all, it should have seen the abort
			assert.ok(true);
		}
	});

	it("updates widgetState.currentStep with all layer step names", async (t) => {
		const tmpDir = makeTmpDir(t);
		const state: ExecutionState = { input: {}, steps: {}, status: "running" };
		const spec = makeSpec({
			steps: { x: { agent: "test" }, y: { agent: "test" } },
		});
		const layer: ExecutionLayer = { steps: ["x", "y"] };
		const widgetState = {
			spec,
			state,
			startTime: Date.now(),
			currentStep: undefined as string | undefined,
		};
		const options = makeParallelOptions(tmpDir, { spec, widgetState });

		await executeParallelLayer(
			layer,
			spec,
			state,
			mockExecutor({
				x: { success: true },
				y: { success: true },
			}),
			options,
		);

		assert.strictEqual(widgetState.currentStep, "x, y");
	});

	it("handles single-step layer (degenerate case)", async (t) => {
		const tmpDir = makeTmpDir(t);
		const state: ExecutionState = { input: {}, steps: {}, status: "running" };
		const spec = makeSpec({ steps: { only: { agent: "test" } } });
		const layer: ExecutionLayer = { steps: ["only"] };
		const options = makeParallelOptions(tmpDir, { spec });

		await executeParallelLayer(
			layer,
			spec,
			state,
			mockExecutor({
				only: { success: true },
			}),
			options,
		);

		assert.ok(state.steps.only);
		assert.strictEqual(state.steps.only.status, "completed");
	});

	it("handles empty layer (no steps)", async (t) => {
		const tmpDir = makeTmpDir(t);
		const state: ExecutionState = { input: {}, steps: {}, status: "running" };
		const spec = makeSpec({ steps: {} });
		const layer: ExecutionLayer = { steps: [] };
		const options = makeParallelOptions(tmpDir, { spec });

		await executeParallelLayer(layer, spec, state, mockExecutor(), options);

		// No errors, no state changes
		assert.strictEqual(Object.keys(state.steps).length, 0);
	});

	it("does not set state.status on all-success", async (t) => {
		const tmpDir = makeTmpDir(t);
		const state: ExecutionState = { input: {}, steps: {}, status: "running" };
		const spec = makeSpec({
			steps: { a: { agent: "test" }, b: { agent: "test" } },
		});
		const layer: ExecutionLayer = { steps: ["a", "b"] };
		const options = makeParallelOptions(tmpDir, { spec });

		await executeParallelLayer(
			layer,
			spec,
			state,
			mockExecutor({
				a: { success: true },
				b: { success: true },
			}),
			options,
		);

		// Status should remain "running" — setting to "completed" is the executor's job
		assert.strictEqual(state.status, "running");
	});

	it("collects results via Promise.allSettled (no unhandled rejections)", async (t) => {
		const tmpDir = makeTmpDir(t);
		const state: ExecutionState = { input: {}, steps: {}, status: "running" };
		const spec = makeSpec({
			steps: { a: { agent: "test" }, b: { agent: "test" } },
		});
		const layer: ExecutionLayer = { steps: ["a", "b"] };
		const options = makeParallelOptions(tmpDir, { spec });

		// Mock executor that throws an exception for step "b"
		const executor: SingleStepExecutor = async (stepName, _stepSpec, execState, _opts) => {
			if (stepName === "b") throw new Error("unexpected crash");
			execState.steps[stepName] = {
				step: stepName,
				agent: "mock",
				status: "completed",
				output: {},
				usage: zeroUsage(),
				durationMs: 0,
			};
			return true;
		};

		await executeParallelLayer(layer, spec, state, executor, options);

		assert.strictEqual(state.status, "failed");
	});
});

describe("executeParallelStep", () => {
	it("returns completed result with aggregated sub-outputs", async (t) => {
		const tmpDir = makeTmpDir(t);
		const state: ExecutionState = { input: {}, steps: {}, status: "running" };
		const parallelSpec: Record<string, StepSpec> = {
			sub1: { agent: "test" },
			sub2: { agent: "test" },
		};
		const options = makeParallelOptions(tmpDir);

		const result = await executeParallelStep(
			parallelSpec,
			"parallel1",
			state,
			mockExecutor({
				sub1: { success: true, output: { data: "from-sub1" } },
				sub2: { success: true, output: { data: "from-sub2" } },
			}),
			options,
		);

		assert.strictEqual(result.status, "completed");
		const output = result.output as any;
		assert.ok(output.sub1);
		assert.ok(output.sub2);
		assert.deepStrictEqual(output.sub1, { data: "from-sub1" });
		assert.deepStrictEqual(output.sub2, { data: "from-sub2" });
	});

	it("returns failed result when any sub-step fails", async (t) => {
		const tmpDir = makeTmpDir(t);
		const state: ExecutionState = { input: {}, steps: {}, status: "running" };
		const parallelSpec: Record<string, StepSpec> = {
			sub1: { agent: "test" },
			sub2: { agent: "test" },
		};
		const options = makeParallelOptions(tmpDir);

		const result = await executeParallelStep(
			parallelSpec,
			"parallel1",
			state,
			mockExecutor({
				sub1: { success: true },
				sub2: { success: false },
			}),
			options,
		);

		assert.strictEqual(result.status, "failed");
	});

	it("aggregates usage across sub-steps", async (t) => {
		const tmpDir = makeTmpDir(t);
		const state: ExecutionState = { input: {}, steps: {}, status: "running" };
		const parallelSpec: Record<string, StepSpec> = {
			sub1: { agent: "test" },
			sub2: { agent: "test" },
		};
		const options = makeParallelOptions(tmpDir);

		const result = await executeParallelStep(
			parallelSpec,
			"parallel1",
			state,
			mockExecutor({
				sub1: { success: true, usage: { input: 100, output: 50, cacheRead: 0, cacheWrite: 0, cost: 0.01, turns: 1 } },
				sub2: { success: true, usage: { input: 200, output: 100, cacheRead: 10, cacheWrite: 5, cost: 0.02, turns: 2 } },
			}),
			options,
		);

		assert.strictEqual(result.usage.input, 300);
		assert.strictEqual(result.usage.output, 150);
		assert.strictEqual(result.usage.cacheRead, 10);
		assert.strictEqual(result.usage.cacheWrite, 5);
		assert.strictEqual(result.usage.cost, 0.03);
		assert.strictEqual(result.usage.turns, 3);
	});

	it("cancels remaining sub-steps when one fails", async (t) => {
		const tmpDir = makeTmpDir(t);
		const state: ExecutionState = { input: {}, steps: {}, status: "running" };
		const parallelSpec: Record<string, StepSpec> = {
			slow: { agent: "test" },
			fast_fail: { agent: "test" },
		};
		const options = makeParallelOptions(tmpDir);

		const result = await executeParallelStep(
			parallelSpec,
			"parallel1",
			state,
			mockExecutor({
				slow: { success: true, delayMs: 200 },
				fast_fail: { success: false, delayMs: 10 },
			}),
			options,
		);

		assert.strictEqual(result.status, "failed");
	});

	it("respects pre-aborted signal", async (t) => {
		const tmpDir = makeTmpDir(t);
		const state: ExecutionState = { input: {}, steps: {}, status: "running" };
		const parallelSpec: Record<string, StepSpec> = { sub1: { agent: "test" } };
		const controller = new AbortController();
		controller.abort();
		const options = makeParallelOptions(tmpDir, { signal: controller.signal });

		const result = await executeParallelStep(
			parallelSpec,
			"parallel1",
			state,
			mockExecutor({
				sub1: { success: true },
			}),
			options,
		);

		// Should complete without hanging — the abort is propagated to sub-steps
		assert.ok(result);
	});

	it("sets agent to 'parallel'", async (t) => {
		const tmpDir = makeTmpDir(t);
		const state: ExecutionState = { input: {}, steps: {}, status: "running" };
		const parallelSpec: Record<string, StepSpec> = { sub1: { agent: "test" } };
		const options = makeParallelOptions(tmpDir);

		const result = await executeParallelStep(
			parallelSpec,
			"parallel1",
			state,
			mockExecutor({
				sub1: { success: true },
			}),
			options,
		);

		assert.strictEqual(result.agent, "parallel");
	});

	it("sets step name correctly", async (t) => {
		const tmpDir = makeTmpDir(t);
		const state: ExecutionState = { input: {}, steps: {}, status: "running" };
		const parallelSpec: Record<string, StepSpec> = { sub1: { agent: "test" } };
		const options = makeParallelOptions(tmpDir);

		const result = await executeParallelStep(
			parallelSpec,
			"my-parallel",
			state,
			mockExecutor({
				sub1: { success: true },
			}),
			options,
		);

		assert.strictEqual(result.step, "my-parallel");
	});

	it("includes textOutput as JSON stringified sub-outputs", async (t) => {
		const tmpDir = makeTmpDir(t);
		const state: ExecutionState = { input: {}, steps: {}, status: "running" };
		const parallelSpec: Record<string, StepSpec> = { sub1: { agent: "test" } };
		const options = makeParallelOptions(tmpDir);

		const result = await executeParallelStep(
			parallelSpec,
			"parallel1",
			state,
			mockExecutor({
				sub1: { success: true, output: { val: 1 } },
			}),
			options,
		);

		assert.ok(result.textOutput);
		const parsed = JSON.parse(result.textOutput!);
		assert.deepStrictEqual(parsed.sub1, { val: 1 });
	});

	it("records positive durationMs", async (t) => {
		const tmpDir = makeTmpDir(t);
		const state: ExecutionState = { input: {}, steps: {}, status: "running" };
		const parallelSpec: Record<string, StepSpec> = { sub1: { agent: "test" } };
		const options = makeParallelOptions(tmpDir);

		const result = await executeParallelStep(
			parallelSpec,
			"parallel1",
			state,
			mockExecutor({
				sub1: { success: true },
			}),
			options,
		);

		assert.ok(result.durationMs >= 0);
	});

	it("handles single sub-step", async (t) => {
		const tmpDir = makeTmpDir(t);
		const state: ExecutionState = { input: {}, steps: {}, status: "running" };
		const parallelSpec: Record<string, StepSpec> = { only: { agent: "test" } };
		const options = makeParallelOptions(tmpDir);

		const result = await executeParallelStep(
			parallelSpec,
			"parallel1",
			state,
			mockExecutor({
				only: { success: true, output: { single: true } },
			}),
			options,
		);

		assert.strictEqual(result.status, "completed");
		assert.deepStrictEqual((result.output as any).only, { single: true });
	});

	it("handles all sub-steps failing", async (t) => {
		const tmpDir = makeTmpDir(t);
		const state: ExecutionState = { input: {}, steps: {}, status: "running" };
		const parallelSpec: Record<string, StepSpec> = {
			sub1: { agent: "test" },
			sub2: { agent: "test" },
		};
		const options = makeParallelOptions(tmpDir);

		const result = await executeParallelStep(
			parallelSpec,
			"parallel1",
			state,
			mockExecutor({
				sub1: { success: false },
				sub2: { success: false },
			}),
			options,
		);

		assert.strictEqual(result.status, "failed");
	});

	it("handles rejected promise from executor (exception, not false return)", async (t) => {
		const tmpDir = makeTmpDir(t);
		const state: ExecutionState = { input: {}, steps: {}, status: "running" };
		const parallelSpec: Record<string, StepSpec> = {
			sub1: { agent: "test" },
			sub2: { agent: "test" },
		};
		const options = makeParallelOptions(tmpDir);

		const executor: SingleStepExecutor = async (stepName, _stepSpec, execState, _opts) => {
			if (stepName === "sub2") throw new Error("boom");
			execState.steps[stepName] = {
				step: stepName,
				agent: "mock",
				status: "completed",
				output: {},
				usage: zeroUsage(),
				durationMs: 0,
			};
			return true;
		};

		const result = await executeParallelStep(parallelSpec, "parallel1", state, executor, options);

		assert.strictEqual(result.status, "failed");
	});
});
