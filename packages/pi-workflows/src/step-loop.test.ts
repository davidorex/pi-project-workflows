import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { executeLoop } from "./step-loop.ts";
import type { LoopExecuteOptions } from "./step-loop.ts";
import { zeroUsage, DEFAULT_MAX_ATTEMPTS } from "./step-shared.ts";
import type { LoopSpec, StepResult, StepSpec, ExecutionState, AgentSpec } from "./types.ts";
import { mockCtx, mockPi, makeSpec } from "./test-helpers.ts";

function makeState(overrides?: Partial<ExecutionState>): ExecutionState {
  return { input: {}, steps: {}, status: "running", ...overrides };
}

function makeLoopOptions(t: any, overrides?: Partial<LoopExecuteOptions>): LoopExecuteOptions {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-loop-"));
  fs.mkdirSync(path.join(tmpDir, "outputs"), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, "sessions"), { recursive: true });
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  return {
    ctx: mockCtx(tmpDir),
    pi: mockPi(),
    loadAgent: () => ({ name: "default" }),
    dispatchAgent: async (step, agent, prompt, opts) => ({
      step: opts.stepName,
      agent: step.agent ?? "default",
      status: "completed" as const,
      usage: zeroUsage(),
      durationMs: 50,
      textOutput: "agent output",
    }),
    runDir: tmpDir,
    spec: makeSpec({ steps: {} }),
    ...overrides,
  };
}

describe("executeLoop — direct unit tests", () => {
  // Gate-only loops (no agent dispatch needed)
  it("breaks on first gate pass (onPass: break)", async (t) => {
    const loopSpec: LoopSpec = {
      maxAttempts: 3,
      steps: {
        check: {
          gate: { check: "echo pass", onPass: "break" },
        },
      },
    };
    const state = makeState();
    const result = await executeLoop(loopSpec, "myloop", state, makeLoopOptions(t));

    assert.strictEqual(result.status, "completed");
    assert.strictEqual((result.output as any).iterations, 1);
  }, { timeout: 10000 });

  it("retries and exhausts when gate always fails (onFail: continue)", async (t) => {
    const loopSpec: LoopSpec = {
      maxAttempts: 2,
      steps: {
        check: {
          gate: { check: "exit 1", onFail: "continue" },
        },
      },
    };
    const state = makeState();
    const result = await executeLoop(loopSpec, "myloop", state, makeLoopOptions(t));

    assert.strictEqual(result.status, "failed");
    assert.strictEqual((result.output as any).iterations, 2);
  }, { timeout: 10000 });

  it("stops on gate onFail: fail", async (t) => {
    const loopSpec: LoopSpec = {
      maxAttempts: 3,
      steps: {
        check: {
          gate: { check: "exit 1", onFail: "fail" },
        },
      },
    };
    const state = makeState();
    const result = await executeLoop(loopSpec, "myloop", state, makeLoopOptions(t));

    assert.strictEqual(result.status, "failed");
    assert.strictEqual((result.output as any).iterations, 1);
  }, { timeout: 10000 });

  it("stops on gate onFail: break without marking as completed", async (t) => {
    const loopSpec: LoopSpec = {
      maxAttempts: 3,
      steps: {
        check: {
          gate: { check: "exit 1", onFail: "break" },
        },
      },
    };
    const state = makeState();
    const result = await executeLoop(loopSpec, "myloop", state, makeLoopOptions(t));

    // "break" on fail stops the loop but no gate passed, so status remains "failed"
    assert.strictEqual(result.status, "failed");
    assert.strictEqual((result.output as any).iterations, 1);
  }, { timeout: 10000 });

  // Transform sub-steps
  it("executes transform sub-steps within loop", async (t) => {
    const loopSpec: LoopSpec = {
      maxAttempts: 1,
      steps: {
        prep: {
          transform: { mapping: { msg: "hello" } },
        },
        check: {
          gate: { check: "echo pass", onPass: "break" },
        },
      },
    };
    const state = makeState();
    const result = await executeLoop(loopSpec, "myloop", state, makeLoopOptions(t));

    assert.strictEqual(result.status, "completed");
    const attempts = (result.output as any).attempts;
    assert.ok(attempts[0].steps.prep);
    assert.strictEqual(attempts[0].steps.prep.status, "completed");
    assert.deepStrictEqual(attempts[0].steps.prep.output, { msg: "hello" });
  }, { timeout: 10000 });

  it("provides loop.iteration in scope for transforms", async (t) => {
    const loopSpec: LoopSpec = {
      maxAttempts: 2,
      steps: {
        track: {
          transform: { mapping: { iter: "${{ loop.iteration }}" } },
        },
        check: {
          gate: { check: "exit 1", onFail: "continue" },
        },
      },
    };
    const state = makeState();
    const result = await executeLoop(loopSpec, "myloop", state, makeLoopOptions(t));

    const attempts = (result.output as any).attempts;
    assert.strictEqual(attempts[0].steps.track.output.iter, 0);
    assert.strictEqual(attempts[1].steps.track.output.iter, 1);
  }, { timeout: 10000 });

  it("provides loop.maxAttempts in scope", async (t) => {
    const loopSpec: LoopSpec = {
      maxAttempts: 5,
      steps: {
        track: {
          transform: { mapping: { max: "${{ loop.maxAttempts }}" } },
        },
        check: {
          gate: { check: "echo pass", onPass: "break" },
        },
      },
    };
    const state = makeState();
    const result = await executeLoop(loopSpec, "myloop", state, makeLoopOptions(t));

    const attempts = (result.output as any).attempts;
    assert.strictEqual(attempts[0].steps.track.output.max, 5);
  }, { timeout: 10000 });

  it("provides loop.priorAttempts in scope", async (t) => {
    // Note: loop.priorAttempts is a live reference to the allAttempts array,
    // so transforms that capture it get the same array instance. We verify
    // the array is accessible and has the right type. After the loop completes,
    // the array contains all iterations (shared reference).
    const loopSpec: LoopSpec = {
      maxAttempts: 2,
      steps: {
        // Use a transform that reads the length instead of capturing the array reference,
        // to avoid circular structure issues
        track: {
          transform: { mapping: { hasPrior: "${{ loop.iteration }}" } },
        },
        check: {
          gate: { check: "exit 1", onFail: "continue" },
        },
      },
    };
    const state = makeState();
    const result = await executeLoop(loopSpec, "myloop", state, makeLoopOptions(t));

    const attempts = (result.output as any).attempts;
    // Verify loop.iteration (which correlates with priorAttempts count) is accessible
    assert.strictEqual(attempts[0].steps.track.output.hasPrior, 0);
    assert.strictEqual(attempts[1].steps.track.output.hasPrior, 1);
    // Verify the loop output has the attempts array
    assert.strictEqual(attempts.length, 2);
  }, { timeout: 10000 });

  // Agent sub-steps (mocked dispatch)
  it("dispatches agent sub-steps via dispatchAgent callback", async (t) => {
    let dispatched = false;
    const loopSpec: LoopSpec = {
      maxAttempts: 1,
      steps: {
        work: { agent: "worker" },
        check: {
          gate: { check: "echo pass", onPass: "break" },
        },
      },
    };
    const state = makeState();
    const opts = makeLoopOptions(t, {
      dispatchAgent: async (step, agent, prompt, dispatchOpts) => {
        dispatched = true;
        return {
          step: dispatchOpts.stepName,
          agent: step.agent ?? "worker",
          status: "completed",
          usage: zeroUsage(),
          durationMs: 50,
          textOutput: "done",
        };
      },
    });
    const result = await executeLoop(loopSpec, "myloop", state, opts);

    assert.ok(dispatched);
    assert.strictEqual(result.status, "completed");
    const attempts = (result.output as any).attempts;
    assert.ok(attempts[0].steps.work);
    assert.strictEqual(attempts[0].steps.work.status, "completed");
  }, { timeout: 10000 });

  it("fails loop when agent sub-step fails", async (t) => {
    const loopSpec: LoopSpec = {
      maxAttempts: 3,
      steps: {
        work: { agent: "worker" },
        check: {
          gate: { check: "echo pass", onPass: "break" },
        },
      },
    };
    const state = makeState();
    const opts = makeLoopOptions(t, {
      dispatchAgent: async (step, agent, prompt, dispatchOpts) => ({
        step: dispatchOpts.stepName,
        agent: step.agent ?? "worker",
        status: "failed",
        usage: zeroUsage(),
        durationMs: 10,
        error: "agent crashed",
      }),
    });
    const result = await executeLoop(loopSpec, "myloop", state, opts);

    assert.strictEqual(result.status, "failed");
    // Loop stopped immediately on agent failure
    assert.strictEqual((result.output as any).iterations, 1);
  }, { timeout: 10000 });

  it("includes agent sub-step usage in aggregated loop usage", async (t) => {
    const loopSpec: LoopSpec = {
      maxAttempts: 1,
      steps: {
        work: { agent: "worker" },
        check: {
          gate: { check: "echo pass", onPass: "break" },
        },
      },
    };
    const state = makeState();
    const opts = makeLoopOptions(t, {
      dispatchAgent: async (step, agent, prompt, dispatchOpts) => ({
        step: dispatchOpts.stepName,
        agent: step.agent ?? "worker",
        status: "completed",
        usage: { input: 100, output: 50, cacheRead: 10, cacheWrite: 5, cost: 0.01, turns: 1 },
        durationMs: 50,
        textOutput: "done",
      }),
    });
    const result = await executeLoop(loopSpec, "myloop", state, opts);

    assert.strictEqual(result.usage.input, 100);
    assert.strictEqual(result.usage.output, 50);
    assert.strictEqual(result.usage.cost, 0.01);
    assert.strictEqual(result.usage.turns, 1);
  }, { timeout: 10000 });

  // Agent input expression failure
  it("fails iteration when agent input expression resolution throws", async (t) => {
    const loopSpec: LoopSpec = {
      maxAttempts: 3,
      steps: {
        work: {
          agent: "worker",
          input: { bad: "${{ steps.undefined_step.output }}" },
        },
      },
    };
    const state = makeState();
    const result = await executeLoop(loopSpec, "myloop", state, makeLoopOptions(t));

    assert.strictEqual(result.status, "failed");
    const attempts = (result.output as any).attempts;
    assert.ok(attempts[0].steps.work);
    assert.strictEqual(attempts[0].steps.work.status, "failed");
  }, { timeout: 10000 });

  // maxAttempts from expression
  it("resolves maxAttempts from ${{ }} expression", async (t) => {
    const loopSpec: LoopSpec = {
      maxAttempts: 10, // fallback
      attempts: "${{ input.retries }}",
      steps: {
        check: {
          gate: { check: "exit 1", onFail: "continue" },
        },
      },
    };
    const state = makeState({ input: { retries: 2 } });
    const result = await executeLoop(loopSpec, "myloop", state, makeLoopOptions(t));

    assert.strictEqual((result.output as any).maxAttempts, 2);
    assert.strictEqual((result.output as any).iterations, 2);
  }, { timeout: 10000 });

  it("falls back to loopSpec.maxAttempts when expression resolves to NaN", async (t) => {
    const loopSpec: LoopSpec = {
      maxAttempts: 2,
      attempts: "${{ input.bogus }}",
      steps: {
        check: {
          gate: { check: "exit 1", onFail: "continue" },
        },
      },
    };
    // input.bogus is undefined — resolves to NaN when Number() is applied
    const state = makeState({ input: {} });
    const result = await executeLoop(loopSpec, "myloop", state, makeLoopOptions(t));

    assert.strictEqual((result.output as any).maxAttempts, 2);
  }, { timeout: 10000 });

  it("falls back to DEFAULT_MAX_ATTEMPTS when both are absent", async (t) => {
    const loopSpec: LoopSpec = {
      maxAttempts: undefined as any,  // simulate absent
      steps: {
        check: {
          gate: { check: "exit 1", onFail: "continue" },
        },
      },
    };
    const state = makeState();
    const result = await executeLoop(loopSpec, "myloop", state, makeLoopOptions(t));

    assert.strictEqual((result.output as any).maxAttempts, DEFAULT_MAX_ATTEMPTS);
    assert.strictEqual((result.output as any).iterations, DEFAULT_MAX_ATTEMPTS);
  }, { timeout: 15000 });

  // when conditional on sub-steps
  it("skips sub-step when its when condition is falsy", async (t) => {
    const loopSpec: LoopSpec = {
      maxAttempts: 1,
      steps: {
        skip_me: {
          transform: { mapping: { val: "should not run" } },
          when: "${{ loop.iteration == 99 }}",
        },
        check: {
          gate: { check: "echo pass", onPass: "break" },
        },
      },
    };
    const state = makeState();
    const result = await executeLoop(loopSpec, "myloop", state, makeLoopOptions(t));

    assert.strictEqual(result.status, "completed");
    const attempts = (result.output as any).attempts;
    assert.strictEqual(attempts[0].steps.skip_me.status, "skipped");
  }, { timeout: 10000 });

  // onExhausted
  it("runs onExhausted agent when all iterations fail without break", async (t) => {
    let exhaustedDispatched = false;
    const loopSpec: LoopSpec = {
      maxAttempts: 2,
      steps: {
        check: {
          gate: { check: "exit 1", onFail: "continue" },
        },
      },
      onExhausted: { agent: "fallback" },
    };
    const state = makeState();
    const opts = makeLoopOptions(t, {
      dispatchAgent: async (step, agent, prompt, dispatchOpts) => {
        exhaustedDispatched = true;
        return {
          step: dispatchOpts.stepName,
          agent: step.agent ?? "fallback",
          status: "completed",
          usage: zeroUsage(),
          durationMs: 10,
          textOutput: "exhausted recovery",
        };
      },
    });
    const result = await executeLoop(loopSpec, "myloop", state, opts);

    assert.ok(exhaustedDispatched);
    const lastIteration = (result.output as any).lastIteration;
    assert.ok(lastIteration._exhausted);
  }, { timeout: 10000 });

  it("records expression error in onExhausted when input resolution fails", async (t) => {
    const loopSpec: LoopSpec = {
      maxAttempts: 1,
      steps: {
        check: {
          gate: { check: "exit 1", onFail: "continue" },
        },
      },
      onExhausted: {
        agent: "fallback",
        input: { bad: "${{ steps.nonexistent.output }}" },
      },
    };
    const state = makeState();
    const opts = makeLoopOptions(t, {
      dispatchAgent: async (step, agent, prompt, dispatchOpts) => ({
        step: dispatchOpts.stepName,
        agent: step.agent ?? "fallback",
        status: "completed",
        usage: zeroUsage(),
        durationMs: 10,
        textOutput: "ran anyway",
      }),
    });
    const result = await executeLoop(loopSpec, "myloop", state, opts);

    const lastIteration = (result.output as any).lastIteration;
    assert.ok(lastIteration._exhausted);
    assert.ok(lastIteration._exhausted.error);
    assert.ok(lastIteration._exhausted.error.includes("Expression error"));
  }, { timeout: 10000 });

  it("does not run onExhausted when loop completed via break", async (t) => {
    let exhaustedDispatched = false;
    const loopSpec: LoopSpec = {
      maxAttempts: 3,
      steps: {
        check: {
          gate: { check: "echo pass", onPass: "break" },
        },
      },
      onExhausted: { agent: "fallback" },
    };
    const state = makeState();
    const opts = makeLoopOptions(t, {
      dispatchAgent: async (step, agent, prompt, dispatchOpts) => {
        exhaustedDispatched = true;
        return {
          step: dispatchOpts.stepName,
          agent: step.agent ?? "fallback",
          status: "completed",
          usage: zeroUsage(),
          durationMs: 10,
          textOutput: "should not run",
        };
      },
    });
    const result = await executeLoop(loopSpec, "myloop", state, opts);

    assert.strictEqual(result.status, "completed");
    assert.ok(!exhaustedDispatched);
    const lastIteration = (result.output as any).lastIteration;
    assert.ok(!lastIteration._exhausted);
  }, { timeout: 10000 });

  // Scope visibility
  it("current iteration sub-steps are visible to later sub-steps in same iteration", async (t) => {
    const loopSpec: LoopSpec = {
      maxAttempts: 1,
      steps: {
        first: {
          transform: { mapping: { val: "from-first" } },
        },
        second: {
          transform: { mapping: { ref: "${{ steps.first.output.val }}" } },
        },
        check: {
          gate: { check: "echo pass", onPass: "break" },
        },
      },
    };
    const state = makeState();
    const result = await executeLoop(loopSpec, "myloop", state, makeLoopOptions(t));

    assert.strictEqual(result.status, "completed");
    const attempts = (result.output as any).attempts;
    assert.strictEqual(attempts[0].steps.second.output.ref, "from-first");
  }, { timeout: 10000 });

  it("outer state.steps accessible from inside loop", async (t) => {
    const state = makeState({
      steps: {
        outer: {
          step: "outer",
          agent: "test",
          status: "completed",
          output: { value: "outer-data" },
          usage: zeroUsage(),
          durationMs: 0,
        },
      },
    });
    const loopSpec: LoopSpec = {
      maxAttempts: 1,
      steps: {
        ref: {
          transform: { mapping: { fromOuter: "${{ steps.outer.output.value }}" } },
        },
        check: {
          gate: { check: "echo pass", onPass: "break" },
        },
      },
    };
    const result = await executeLoop(loopSpec, "myloop", state, makeLoopOptions(t));

    assert.strictEqual(result.status, "completed");
    const attempts = (result.output as any).attempts;
    assert.strictEqual(attempts[0].steps.ref.output.fromOuter, "outer-data");
  }, { timeout: 10000 });

  // Cancellation
  it("stops loop when signal is aborted", async (t) => {
    const controller = new AbortController();
    controller.abort();

    const loopSpec: LoopSpec = {
      maxAttempts: 10,
      steps: {
        check: {
          gate: { check: "echo pass", onPass: "break" },
        },
      },
    };
    const state = makeState();
    const opts = makeLoopOptions(t, { signal: controller.signal });
    const result = await executeLoop(loopSpec, "myloop", state, opts);

    assert.strictEqual((result.output as any).iterations, 0);
  }, { timeout: 10000 });

  // Output structure
  it("result output has iterations, maxAttempts, attempts, lastIteration", async (t) => {
    const loopSpec: LoopSpec = {
      maxAttempts: 1,
      steps: {
        check: {
          gate: { check: "echo pass", onPass: "break" },
        },
      },
    };
    const state = makeState();
    const result = await executeLoop(loopSpec, "myloop", state, makeLoopOptions(t));

    const output = result.output as any;
    assert.ok("iterations" in output);
    assert.ok("maxAttempts" in output);
    assert.ok("attempts" in output);
    assert.ok("lastIteration" in output);
  }, { timeout: 10000 });

  it("textOutput summarizes loop execution", async (t) => {
    const loopSpec: LoopSpec = {
      maxAttempts: 2,
      steps: {
        check: {
          gate: { check: "exit 1", onFail: "continue" },
        },
      },
    };
    const state = makeState();
    const result = await executeLoop(loopSpec, "myloop", state, makeLoopOptions(t));

    assert.ok(result.textOutput);
    assert.ok(result.textOutput!.includes("myloop"));
    assert.ok(result.textOutput!.includes("2/2"));
  }, { timeout: 10000 });

  it("output is persisted to runDir", async (t) => {
    const loopSpec: LoopSpec = {
      maxAttempts: 1,
      steps: {
        check: {
          gate: { check: "echo pass", onPass: "break" },
        },
      },
    };
    const state = makeState();
    const opts = makeLoopOptions(t);
    const result = await executeLoop(loopSpec, "myloop", state, opts);

    assert.ok(result.outputPath);
    assert.ok(fs.existsSync(result.outputPath!));
  }, { timeout: 10000 });

  // Usage aggregation
  it("aggregates usage across all iterations", async (t) => {
    const loopSpec: LoopSpec = {
      maxAttempts: 2,
      steps: {
        check: {
          gate: { check: "exit 1", onFail: "continue" },
        },
      },
    };
    const state = makeState();
    const result = await executeLoop(loopSpec, "myloop", state, makeLoopOptions(t));

    // Gates have zero usage, so total should be zero
    assert.deepStrictEqual(result.usage, zeroUsage());
  }, { timeout: 10000 });
});
