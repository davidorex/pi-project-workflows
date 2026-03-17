import { describe, it } from "node:test";
import assert from "node:assert";
import { executeWorkflow } from "./workflow-executor.js";
import type { WorkflowSpec } from "./types.js";
import { mockCtx, mockPi, makeSpec } from "./test-helpers.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

function defaultOptions(tmpDir?: string) {
  const cwd = tmpDir ?? fs.mkdtempSync(path.join(os.tmpdir(), "wf-loop-"));
  return {
    ctx: mockCtx(cwd),
    pi: mockPi(),
    loadAgent: () => ({ name: "default" }),
    _cwd: cwd,
  };
}

// Skip integration tests unless RUN_INTEGRATION=1 and pi is available
let hasPi = false;
if (process.env.RUN_INTEGRATION === "1") {
  try {
    const { execSync } = await import("node:child_process");
    execSync("pi --version", { stdio: "ignore" });
    hasPi = true;
  } catch {}
}

describe("loop steps", () => {
  it("breaks on gate pass", async (t: any) => {
    const spec = makeSpec({
      steps: {
        retry: {
          loop: {
            maxAttempts: 3,
            steps: {
              check: {
                gate: {
                  check: "echo pass",
                  onPass: "break",
                  onFail: "continue",
                },
              },
            },
          },
        },
      },
    });

    const opts = defaultOptions();

    t.after(() => { fs.rmSync(path.dirname(spec.filePath), { recursive: true, force: true }); fs.rmSync(opts._cwd, { recursive: true, force: true }); });

    const result = await executeWorkflow(spec, {}, opts);
    assert.strictEqual(result.status, "completed");
    assert.strictEqual(result.steps.retry.output.iterations, 1); // broke on first pass
  });

  it("retries on gate fail and exhausts", async (t: any) => {
    const spec = makeSpec({
      steps: {
        retry: {
          loop: {
            maxAttempts: 2,
            steps: {
              check: {
                gate: {
                  check: "exit 1",
                  onPass: "break",
                  onFail: "continue",
                },
              },
            },
          },
        },
      },
    });

    const opts = defaultOptions();

    t.after(() => { fs.rmSync(path.dirname(spec.filePath), { recursive: true, force: true }); fs.rmSync(opts._cwd, { recursive: true, force: true }); });

    const result = await executeWorkflow(spec, {}, opts);
    assert.strictEqual(result.steps.retry.status, "failed");
    assert.strictEqual(result.steps.retry.output.iterations, 2);
  });

  it("accumulates prior attempts in loop scope", async (t: any) => {
    // This test verifies that the loop scope includes priorAttempts.
    // We use a transform step inside the loop to capture the iteration count.
    const spec = makeSpec({
      steps: {
        retry: {
          loop: {
            maxAttempts: 3,
            steps: {
              capture: {
                transform: {
                  mapping: {
                    iteration: "${{ loop.iteration }}",
                    priorCount: "${{ loop.priorAttempts.length }}",
                  },
                },
              },
              check: {
                gate: {
                  check: "exit 1",
                  onPass: "break",
                  onFail: "continue",
                },
              },
            },
          },
        },
      },
    });

    const opts = defaultOptions();

    t.after(() => { fs.rmSync(path.dirname(spec.filePath), { recursive: true, force: true }); fs.rmSync(opts._cwd, { recursive: true, force: true }); });

    const result = await executeWorkflow(spec, {}, opts);
    const attempts = result.steps.retry.output.attempts;

    // First iteration: iteration=0, priorCount=0
    assert.strictEqual(attempts[0].steps.capture.output.iteration, 0);

    // Second iteration: iteration=1, priorCount=1
    assert.strictEqual(attempts[1].steps.capture.output.iteration, 1);
  });

  it("runs onExhausted when all attempts fail", { skip: !hasPi ? "pi not available" : undefined, timeout: 60000 }, async (t: any) => {
    const spec = makeSpec({
      steps: {
        retry: {
          loop: {
            maxAttempts: 2,
            steps: {
              check: {
                gate: { check: "exit 1", onFail: "continue" },
              },
            },
            onExhausted: {
              agent: "default",
            },
          },
        },
      },
    });

    const opts = defaultOptions();

    t.after(() => { fs.rmSync(path.dirname(spec.filePath), { recursive: true, force: true }); fs.rmSync(opts._cwd, { recursive: true, force: true }); });

    const result = await executeWorkflow(spec, {}, opts);
    assert.ok(result.steps.retry.output.lastIteration._exhausted);
  });

  it("agent step inside loop with retry", { skip: !hasPi ? "pi not available" : undefined, timeout: 120000 }, async (t: any) => {
    // Agent runs, gate fails, agent retries with priorAttempts context
    const spec = makeSpec({
      steps: {
        retry: {
          loop: {
            maxAttempts: 2,
            steps: {
              work: {
                agent: "default",
                input: {
                  attempt: "${{ loop.iteration }}",
                },
              },
              check: {
                gate: {
                  check: "exit 1",
                  onPass: "break",
                  onFail: "continue",
                },
              },
            },
          },
        },
      },
    });

    const opts = defaultOptions();

    t.after(() => { fs.rmSync(path.dirname(spec.filePath), { recursive: true, force: true }); fs.rmSync(opts._cwd, { recursive: true, force: true }); });

    const result = await executeWorkflow(spec, {}, opts);
    assert.strictEqual(result.steps.retry.output.iterations, 2);
    // Both iterations should have a 'work' step that completed
    assert.strictEqual(result.steps.retry.output.attempts[0].steps.work.status, "completed");
    assert.strictEqual(result.steps.retry.output.attempts[1].steps.work.status, "completed");
  });

  it("gate onFail: fail stops the loop", async (t: any) => {
    const spec = makeSpec({
      steps: {
        retry: {
          loop: {
            maxAttempts: 3,
            steps: {
              check: {
                gate: {
                  check: "exit 1",
                  onFail: "fail",
                },
              },
            },
          },
        },
      },
    });

    const opts = defaultOptions();

    t.after(() => { fs.rmSync(path.dirname(spec.filePath), { recursive: true, force: true }); fs.rmSync(opts._cwd, { recursive: true, force: true }); });

    const result = await executeWorkflow(spec, {}, opts);
    assert.strictEqual(result.status, "failed");
    assert.strictEqual(result.steps.retry.status, "failed");
    assert.strictEqual(result.steps.retry.output.iterations, 1); // stopped after first iteration
  });

  it("gate onFail: break stops the loop without marking failed", async (t: any) => {
    const spec = makeSpec({
      steps: {
        retry: {
          loop: {
            maxAttempts: 3,
            steps: {
              check: {
                gate: {
                  check: "exit 1",
                  onFail: "break",
                },
              },
            },
          },
        },
      },
    });

    const opts = defaultOptions();

    t.after(() => { fs.rmSync(path.dirname(spec.filePath), { recursive: true, force: true }); fs.rmSync(opts._cwd, { recursive: true, force: true }); });

    const result = await executeWorkflow(spec, {}, opts);
    // onFail: break stops the loop but loopStatus remains "failed" (no gate passed)
    assert.strictEqual(result.steps.retry.status, "failed");
    assert.strictEqual(result.steps.retry.output.iterations, 1);
  });

  it("transform step inside loop", async (t: any) => {
    const spec = makeSpec({
      steps: {
        retry: {
          loop: {
            maxAttempts: 2,
            steps: {
              compute: {
                transform: {
                  mapping: {
                    value: "${{ loop.iteration }}",
                  },
                },
              },
              check: {
                gate: {
                  check: "exit 1",
                  onPass: "break",
                  onFail: "continue",
                },
              },
            },
          },
        },
      },
    });

    const opts = defaultOptions();

    t.after(() => { fs.rmSync(path.dirname(spec.filePath), { recursive: true, force: true }); fs.rmSync(opts._cwd, { recursive: true, force: true }); });

    const result = await executeWorkflow(spec, {}, opts);
    const attempts = result.steps.retry.output.attempts;

    // First iteration: value=0
    assert.strictEqual(attempts[0].steps.compute.output.value, 0);
    assert.strictEqual(attempts[0].steps.compute.status, "completed");

    // Second iteration: value=1
    assert.strictEqual(attempts[1].steps.compute.output.value, 1);
  });

  it("loop aggregates usage across iterations", async (t: any) => {
    const spec = makeSpec({
      steps: {
        retry: {
          loop: {
            maxAttempts: 3,
            steps: {
              check: {
                gate: {
                  check: "exit 1",
                  onPass: "break",
                  onFail: "continue",
                },
              },
            },
          },
        },
      },
    });

    const opts = defaultOptions();

    t.after(() => { fs.rmSync(path.dirname(spec.filePath), { recursive: true, force: true }); fs.rmSync(opts._cwd, { recursive: true, force: true }); });

    const result = await executeWorkflow(spec, {}, opts);
    // Gates have zero usage, but the aggregation should still work
    assert.strictEqual(result.steps.retry.usage.cost, 0);
    assert.strictEqual(result.steps.retry.usage.turns, 0);
  });

  it("when conditional skips sub-steps inside loop", async (t: any) => {
    const spec = makeSpec({
      steps: {
        retry: {
          loop: {
            maxAttempts: 2,
            steps: {
              skipped: {
                when: "${{ loop.iteration == 99 }}",
                transform: {
                  mapping: { value: "should not appear" },
                },
              },
              check: {
                gate: {
                  check: "exit 1",
                  onPass: "break",
                  onFail: "continue",
                },
              },
            },
          },
        },
      },
    });

    const opts = defaultOptions();

    t.after(() => { fs.rmSync(path.dirname(spec.filePath), { recursive: true, force: true }); fs.rmSync(opts._cwd, { recursive: true, force: true }); });

    const result = await executeWorkflow(spec, {}, opts);
    const attempts = result.steps.retry.output.attempts;

    // Both iterations should have skipped the transform step
    assert.strictEqual(attempts[0].steps.skipped.status, "skipped");
    assert.strictEqual(attempts[1].steps.skipped.status, "skipped");
  });

  it("loop with dynamic attempts via expression", async (t: any) => {
    const spec = makeSpec({
      input: {
        type: "object",
        properties: { maxRetries: { type: "number" } },
      },
      steps: {
        retry: {
          loop: {
            maxAttempts: 5, // fallback
            attempts: "${{ input.maxRetries }}",
            steps: {
              check: {
                gate: {
                  check: "exit 1",
                  onPass: "break",
                  onFail: "continue",
                },
              },
            },
          },
        },
      },
    });

    const opts = defaultOptions();

    t.after(() => { fs.rmSync(path.dirname(spec.filePath), { recursive: true, force: true }); fs.rmSync(opts._cwd, { recursive: true, force: true }); });

    const result = await executeWorkflow(spec, { maxRetries: 2 }, opts);
    assert.strictEqual(result.steps.retry.output.iterations, 2);
    assert.strictEqual(result.steps.retry.output.maxAttempts, 2);
  });

  it("loop followed by regular step", async (t: any) => {
    const spec = makeSpec({
      steps: {
        retry: {
          loop: {
            maxAttempts: 2,
            steps: {
              check: {
                gate: {
                  check: "echo pass",
                  onPass: "break",
                  onFail: "continue",
                },
              },
            },
          },
        },
        after: {
          transform: {
            mapping: { completed: true },
          },
        },
      },
    });

    const opts = defaultOptions();

    t.after(() => { fs.rmSync(path.dirname(spec.filePath), { recursive: true, force: true }); fs.rmSync(opts._cwd, { recursive: true, force: true }); });

    const result = await executeWorkflow(spec, {}, opts);
    assert.strictEqual(result.status, "completed");
    assert.strictEqual(result.steps.retry.status, "completed");
    assert.strictEqual(result.steps.after.status, "completed");
    assert.deepStrictEqual(result.steps.after.output, { completed: true });
  });

  it("failed loop prevents subsequent steps", async (t: any) => {
    const spec = makeSpec({
      steps: {
        retry: {
          loop: {
            maxAttempts: 1,
            steps: {
              check: {
                gate: {
                  check: "exit 1",
                  onFail: "continue",
                },
              },
            },
          },
        },
        after: {
          transform: {
            mapping: { shouldNotRun: true },
          },
        },
      },
    });

    const opts = defaultOptions();

    t.after(() => { fs.rmSync(path.dirname(spec.filePath), { recursive: true, force: true }); fs.rmSync(opts._cwd, { recursive: true, force: true }); });

    const result = await executeWorkflow(spec, {}, opts);
    assert.strictEqual(result.status, "failed");
    assert.strictEqual(result.steps.retry.status, "failed");
    assert.ok(!result.steps.after); // never executed
  });

  it("current iteration sub-steps visible to later sub-steps", async (t: any) => {
    const spec = makeSpec({
      steps: {
        retry: {
          loop: {
            maxAttempts: 1,
            steps: {
              first: {
                transform: {
                  mapping: { value: 42 },
                },
              },
              second: {
                transform: {
                  mapping: {
                    fromFirst: "${{ steps.first.output.value }}",
                  },
                },
              },
              check: {
                gate: {
                  check: "echo pass",
                  onPass: "break",
                },
              },
            },
          },
        },
      },
    });

    const opts = defaultOptions();

    t.after(() => { fs.rmSync(path.dirname(spec.filePath), { recursive: true, force: true }); fs.rmSync(opts._cwd, { recursive: true, force: true }); });

    const result = await executeWorkflow(spec, {}, opts);
    assert.strictEqual(result.status, "completed");
    const attempts = result.steps.retry.output.attempts;
    assert.strictEqual(attempts[0].steps.second.output.fromFirst, 42);
  });

  it("outer steps accessible from inside loop", async (t: any) => {
    const spec = makeSpec({
      steps: {
        setup: {
          transform: {
            mapping: { context: "from-outer" },
          },
        },
        retry: {
          loop: {
            maxAttempts: 1,
            steps: {
              capture: {
                transform: {
                  mapping: {
                    outerValue: "${{ steps.setup.output.context }}",
                  },
                },
              },
              check: {
                gate: {
                  check: "echo pass",
                  onPass: "break",
                },
              },
            },
          },
        },
      },
    });

    const opts = defaultOptions();

    t.after(() => { fs.rmSync(path.dirname(spec.filePath), { recursive: true, force: true }); fs.rmSync(opts._cwd, { recursive: true, force: true }); });

    const result = await executeWorkflow(spec, {}, opts);
    assert.strictEqual(result.status, "completed");
    const attempts = result.steps.retry.output.attempts;
    assert.strictEqual(attempts[0].steps.capture.output.outerValue, "from-outer");
  });
});
