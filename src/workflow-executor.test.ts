import { describe, it } from "node:test";
import assert from "node:assert";
import { executeWorkflow } from "./workflow-executor.ts";
import type { WorkflowSpec, AgentSpec, ExecutionState, GateSpec, TransformSpec } from "./types.ts";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// Mock ExtensionContext and ExtensionAPI for testing
function mockCtx(cwd: string) {
  return {
    cwd,
    hasUI: false,
    ui: {
      setWidget: () => {},
      notify: () => {},
      setStatus: () => {},
    },
    // ... other ctx fields as needed (most unused in headless mode)
  } as any;
}

function mockPi() {
  const messages: any[] = [];
  return {
    sendMessage: (msg: any, opts: any) => messages.push({ msg, opts }),
    _messages: messages,
  } as any;
}

// Skip if pi is not available
let hasPi = false;
try {
  const { execSync } = await import("node:child_process");
  execSync("pi --version", { stdio: "ignore" });
  hasPi = true;
} catch {}

describe("executeWorkflow", { skip: !hasPi ? "pi not available" : undefined }, () => {
  it("runs a single-step workflow", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-exec-"));
    const spec: WorkflowSpec = {
      name: "test",
      description: "test workflow",
      steps: {
        greet: { agent: "default" },
      },
      source: "project",
      filePath: path.join(tmpDir, "test.workflow.yaml"),
    };

    const pi = mockPi();
    const result = await executeWorkflow(spec, {}, {
      ctx: mockCtx(tmpDir),
      pi,
      loadAgent: () => ({ name: "default" }),
    });

    assert.strictEqual(result.status, "completed");
    assert.ok(result.steps.greet);
    assert.strictEqual(result.steps.greet.status, "completed");
    assert.ok(result.totalDurationMs > 0);
    assert.ok(pi._messages.length >= 1); // sendMessage called

    fs.rmSync(tmpDir, { recursive: true });
  }, { timeout: 60000 });

  it("fails fast on step failure", async () => {
    // Use a pre-aborted signal to reliably trigger failure on the first step.
    // pi does not necessarily fail for unknown agent names, so the original
    // approach of using a nonexistent agent is not reliable. An already-aborted
    // signal exercises the executor's cancellation/fail-fast path: the first
    // step is marked failed with "Workflow cancelled" and the second step
    // is never reached.
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-exec-"));
    const spec: WorkflowSpec = {
      name: "test",
      description: "test",
      steps: {
        willFail: { agent: "default" },
        shouldNotRun: { agent: "default" },
      },
      source: "project",
      filePath: path.join(tmpDir, "test.workflow.yaml"),
    };

    const controller = new AbortController();
    controller.abort(); // pre-abort

    const result = await executeWorkflow(spec, {}, {
      ctx: mockCtx(tmpDir),
      pi: mockPi(),
      signal: controller.signal,
      loadAgent: () => ({ name: "default" }),
    });

    assert.strictEqual(result.status, "failed");
    assert.ok(result.steps.willFail);
    assert.strictEqual(result.steps.willFail.error, "Workflow cancelled");
    assert.ok(!result.steps.shouldNotRun); // never executed

    fs.rmSync(tmpDir, { recursive: true });
  }, { timeout: 30000 });

  it("validates workflow input", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-exec-"));
    const spec: WorkflowSpec = {
      name: "test",
      description: "test",
      input: {
        type: "object",
        required: ["name"],
        properties: { name: { type: "string" } },
      },
      steps: { s: { agent: "default" } },
      source: "project",
      filePath: path.join(tmpDir, "test.workflow.yaml"),
    };

    await assert.rejects(
      () => executeWorkflow(spec, { name: 123 }, {
        ctx: mockCtx(tmpDir),
        pi: mockPi(),
        loadAgent: () => ({ name: "default" }),
      }),
      (err: unknown) => err instanceof Error && err.message.includes("Validation failed"),
    );

    fs.rmSync(tmpDir, { recursive: true });
  });

  it("resolves expressions between steps", async () => {
    // This test verifies that step 2 can reference step 1's output.
    // Since we can't easily control what pi outputs, we verify the
    // expression resolution doesn't throw and both steps complete.
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-exec-"));
    const spec: WorkflowSpec = {
      name: "test",
      description: "test",
      steps: {
        first: { agent: "default" },
        second: {
          agent: "default",
          input: { prior: "${{ steps.first.textOutput }}" },
        },
      },
      source: "project",
      filePath: path.join(tmpDir, "test.workflow.yaml"),
    };

    const result = await executeWorkflow(spec, {}, {
      ctx: mockCtx(tmpDir),
      pi: mockPi(),
      loadAgent: () => ({ name: "default" }),
    });

    assert.strictEqual(result.status, "completed");
    assert.strictEqual(Object.keys(result.steps).length, 2);

    fs.rmSync(tmpDir, { recursive: true });
  }, { timeout: 120000 });

  it("persists state to disk", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-exec-"));
    const spec: WorkflowSpec = {
      name: "test",
      description: "test",
      steps: { s: { agent: "default" } },
      source: "project",
      filePath: path.join(tmpDir, "test.workflow.yaml"),
    };

    const result = await executeWorkflow(spec, {}, {
      ctx: mockCtx(tmpDir),
      pi: mockPi(),
      loadAgent: () => ({ name: "default" }),
    });

    // Verify state.json exists in run directory
    const stateFile = path.join(result.runDir, "state.json");
    assert.ok(fs.existsSync(stateFile));
    const savedState = JSON.parse(fs.readFileSync(stateFile, "utf-8"));
    assert.strictEqual(savedState.status, "completed");

    fs.rmSync(tmpDir, { recursive: true });
  }, { timeout: 60000 });
});

// ── When conditionals ──
// These tests don't require pi on PATH since gate/transform/when steps
// don't use subprocess dispatch.

describe("when conditionals", () => {
  it("skips step when condition is falsy", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-when-"));
    const spec: WorkflowSpec = {
      name: "test-when",
      description: "test when conditionals",
      steps: {
        setup: {
          agent: "transform",
          transform: {
            mapping: { ready: false, value: 42 },
          },
        },
        conditional: {
          agent: "transform",
          when: "${{ steps.setup.output.ready }}",
          transform: {
            mapping: { result: "should not appear" },
          },
        },
        after: {
          agent: "transform",
          transform: {
            mapping: { final: "done" },
          },
        },
      },
      source: "project",
      filePath: path.join(tmpDir, "test.workflow.yaml"),
    };

    const result = await executeWorkflow(spec, {}, {
      ctx: mockCtx(tmpDir),
      pi: mockPi(),
      loadAgent: () => ({ name: "default" }),
    });

    assert.strictEqual(result.status, "completed");
    assert.strictEqual(result.steps.conditional.status, "skipped");
    // Subsequent step still runs
    assert.strictEqual(result.steps.after.status, "completed");
    assert.deepStrictEqual(result.steps.after.output, { final: "done" });

    fs.rmSync(tmpDir, { recursive: true });
  });

  it("runs step when condition is truthy", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-when-"));
    const spec: WorkflowSpec = {
      name: "test-when-truthy",
      description: "test when conditionals truthy",
      steps: {
        setup: {
          agent: "transform",
          transform: {
            mapping: { ready: true },
          },
        },
        conditional: {
          agent: "transform",
          when: "${{ steps.setup.output.ready }}",
          transform: {
            mapping: { result: "executed" },
          },
        },
      },
      source: "project",
      filePath: path.join(tmpDir, "test.workflow.yaml"),
    };

    const result = await executeWorkflow(spec, {}, {
      ctx: mockCtx(tmpDir),
      pi: mockPi(),
      loadAgent: () => ({ name: "default" }),
    });

    assert.strictEqual(result.status, "completed");
    assert.strictEqual(result.steps.conditional.status, "completed");
    assert.deepStrictEqual(result.steps.conditional.output, { result: "executed" });

    fs.rmSync(tmpDir, { recursive: true });
  });
});

// ── Gate steps ──

describe("gate steps", () => {
  it("passes on exit code 0", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-gate-"));
    const spec: WorkflowSpec = {
      name: "test-gate",
      description: "test gate step",
      steps: {
        verify: {
          agent: "gate",
          gate: {
            check: "echo ok",
          },
        },
      },
      source: "project",
      filePath: path.join(tmpDir, "test.workflow.yaml"),
    };

    const result = await executeWorkflow(spec, {}, {
      ctx: mockCtx(tmpDir),
      pi: mockPi(),
      loadAgent: () => ({ name: "default" }),
    });

    assert.strictEqual(result.status, "completed");
    assert.strictEqual(result.steps.verify.status, "completed");
    const gateOutput = result.steps.verify.output as { passed: boolean; exitCode: number; output: string };
    assert.strictEqual(gateOutput.passed, true);
    assert.strictEqual(gateOutput.exitCode, 0);
    assert.strictEqual(gateOutput.output, "ok");

    fs.rmSync(tmpDir, { recursive: true });
  });

  it("fails workflow on gate failure with onFail: fail (default)", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-gate-"));
    const spec: WorkflowSpec = {
      name: "test-gate-fail",
      description: "test gate failure",
      steps: {
        verify: {
          agent: "gate",
          gate: {
            check: "exit 1",
          },
        },
        after: {
          agent: "transform",
          transform: {
            mapping: { shouldNotRun: true },
          },
        },
      },
      source: "project",
      filePath: path.join(tmpDir, "test.workflow.yaml"),
    };

    const result = await executeWorkflow(spec, {}, {
      ctx: mockCtx(tmpDir),
      pi: mockPi(),
      loadAgent: () => ({ name: "default" }),
    });

    assert.strictEqual(result.status, "failed");
    assert.strictEqual(result.steps.verify.status, "failed");
    assert.ok(result.steps.verify.error?.includes("Gate check failed"));
    // Second step should not have run
    assert.ok(!result.steps.after);

    fs.rmSync(tmpDir, { recursive: true });
  });

  it("continues on gate failure with onFail: continue", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-gate-"));
    const spec: WorkflowSpec = {
      name: "test-gate-continue",
      description: "test gate failure with continue",
      steps: {
        verify: {
          agent: "gate",
          gate: {
            check: "exit 1",
            onFail: "continue",
          },
        },
        after: {
          agent: "transform",
          transform: {
            mapping: { ran: true },
          },
        },
      },
      source: "project",
      filePath: path.join(tmpDir, "test.workflow.yaml"),
    };

    const result = await executeWorkflow(spec, {}, {
      ctx: mockCtx(tmpDir),
      pi: mockPi(),
      loadAgent: () => ({ name: "default" }),
    });

    assert.strictEqual(result.status, "completed");
    // Gate step is completed (not failed) because onFail: continue
    assert.strictEqual(result.steps.verify.status, "completed");
    const gateOutput = result.steps.verify.output as { passed: boolean };
    assert.strictEqual(gateOutput.passed, false);
    // Next step ran
    assert.strictEqual(result.steps.after.status, "completed");
    assert.deepStrictEqual(result.steps.after.output, { ran: true });

    fs.rmSync(tmpDir, { recursive: true });
  });

  it("resolves expressions in gate check", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-gate-"));
    const spec: WorkflowSpec = {
      name: "test-gate-expr",
      description: "test gate expression resolution",
      steps: {
        setup: {
          agent: "transform",
          transform: {
            mapping: { cmd: "echo resolved" },
          },
        },
        verify: {
          agent: "gate",
          gate: {
            check: "${{ steps.setup.output.cmd }}",
          },
        },
      },
      source: "project",
      filePath: path.join(tmpDir, "test.workflow.yaml"),
    };

    const result = await executeWorkflow(spec, {}, {
      ctx: mockCtx(tmpDir),
      pi: mockPi(),
      loadAgent: () => ({ name: "default" }),
    });

    assert.strictEqual(result.status, "completed");
    assert.strictEqual(result.steps.verify.status, "completed");
    const gateOutput = result.steps.verify.output as { passed: boolean; output: string };
    assert.strictEqual(gateOutput.passed, true);
    assert.strictEqual(gateOutput.output, "resolved");

    fs.rmSync(tmpDir, { recursive: true });
  });
});

// ── Artifacts ──

describe("artifacts", () => {
  it("writes artifact files after workflow completion", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-artifact-"));
    const spec: WorkflowSpec = {
      name: "test-artifact",
      description: "test artifact writing",
      steps: {
        produce: {
          agent: "transform",
          transform: {
            mapping: { report: "test report content", count: 42 },
          },
        },
      },
      artifacts: {
        textReport: {
          path: path.join(tmpDir, "reports", "latest.txt"),
          from: "steps.produce.output.report",
        },
        jsonReport: {
          path: path.join(tmpDir, "reports", "data.json"),
          from: "steps.produce.output",
        },
      },
      source: "project",
      filePath: path.join(tmpDir, "test.workflow.yaml"),
    };

    const result = await executeWorkflow(spec, {}, {
      ctx: mockCtx(tmpDir),
      pi: mockPi(),
      loadAgent: () => ({ name: "default" }),
    });

    assert.strictEqual(result.status, "completed");
    assert.ok(result.artifacts);
    assert.ok(result.artifacts!.textReport);
    assert.ok(result.artifacts!.jsonReport);

    // Verify text artifact written as string (not JSON-wrapped)
    const textContent = fs.readFileSync(result.artifacts!.textReport, "utf-8");
    assert.strictEqual(textContent, "test report content");

    // Verify JSON artifact written as formatted JSON
    const jsonContent = JSON.parse(fs.readFileSync(result.artifacts!.jsonReport, "utf-8"));
    assert.deepStrictEqual(jsonContent, { report: "test report content", count: 42 });

    fs.rmSync(tmpDir, { recursive: true });
  });

  it("resolves expressions in artifact path", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-artifact-"));
    const spec: WorkflowSpec = {
      name: "test-artifact-path",
      description: "test artifact path expression",
      steps: {
        produce: {
          agent: "transform",
          transform: {
            mapping: { value: "data" },
          },
        },
      },
      artifacts: {
        report: {
          path: path.join(tmpDir, "reports", "run-${{ runId }}.json"),
          from: "steps.produce.output",
        },
      },
      source: "project",
      filePath: path.join(tmpDir, "test.workflow.yaml"),
    };

    const result = await executeWorkflow(spec, {}, {
      ctx: mockCtx(tmpDir),
      pi: mockPi(),
      loadAgent: () => ({ name: "default" }),
    });

    assert.strictEqual(result.status, "completed");
    assert.ok(result.artifacts);
    // The artifact path should contain the runId
    assert.ok(result.artifacts!.report.includes(result.runId));
    assert.ok(fs.existsSync(result.artifacts!.report));

    fs.rmSync(tmpDir, { recursive: true });
  });

  it("handles relative artifact paths resolved against cwd", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-artifact-"));
    const spec: WorkflowSpec = {
      name: "test-artifact-rel",
      description: "test relative artifact path",
      steps: {
        produce: {
          agent: "transform",
          transform: {
            mapping: { result: "output" },
          },
        },
      },
      artifacts: {
        report: {
          path: "output/latest.json",
          from: "steps.produce.output",
        },
      },
      source: "project",
      filePath: path.join(tmpDir, "test.workflow.yaml"),
    };

    const result = await executeWorkflow(spec, {}, {
      ctx: mockCtx(tmpDir),
      pi: mockPi(),
      loadAgent: () => ({ name: "default" }),
    });

    assert.strictEqual(result.status, "completed");
    assert.ok(result.artifacts);
    const expectedPath = path.resolve(tmpDir, "output/latest.json");
    assert.strictEqual(result.artifacts!.report, expectedPath);
    assert.ok(fs.existsSync(expectedPath));

    fs.rmSync(tmpDir, { recursive: true });
  });

  it("artifact failure is non-fatal", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-artifact-"));
    const notifications: Array<{ msg: string; level: string }> = [];
    const spec: WorkflowSpec = {
      name: "test-artifact-fail",
      description: "test artifact failure handling",
      steps: {
        produce: {
          agent: "transform",
          transform: {
            mapping: { value: "data" },
          },
        },
      },
      artifacts: {
        bad: {
          path: path.join(tmpDir, "reports", "output.json"),
          from: "steps.nonexistent.output",  // expression will fail
        },
      },
      source: "project",
      filePath: path.join(tmpDir, "test.workflow.yaml"),
    };

    const ctx = {
      cwd: tmpDir,
      hasUI: true,
      ui: {
        setWidget: () => {},
        notify: (msg: string, level: string) => notifications.push({ msg, level }),
        setStatus: () => {},
        setWorkingMessage: () => {},
      },
    } as any;

    const result = await executeWorkflow(spec, {}, {
      ctx,
      pi: mockPi(),
      loadAgent: () => ({ name: "default" }),
    });

    // Workflow still completes despite artifact failure
    assert.strictEqual(result.status, "completed");
    // No artifacts written
    assert.ok(!result.artifacts || Object.keys(result.artifacts).length === 0);
    // Warning notification was sent
    assert.ok(notifications.some((n) => n.msg.includes("bad") && n.level === "warning"));

    fs.rmSync(tmpDir, { recursive: true });
  });

  it("includes artifacts in formatResult output", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-artifact-"));
    const spec: WorkflowSpec = {
      name: "test-artifact-format",
      description: "test artifact in formatResult",
      steps: {
        produce: {
          agent: "transform",
          transform: {
            mapping: { value: "data" },
          },
        },
      },
      artifacts: {
        report: {
          path: path.join(tmpDir, "reports", "latest.json"),
          from: "steps.produce.output",
        },
      },
      source: "project",
      filePath: path.join(tmpDir, "test.workflow.yaml"),
    };

    const pi = mockPi();
    const result = await executeWorkflow(spec, {}, {
      ctx: mockCtx(tmpDir),
      pi,
      loadAgent: () => ({ name: "default" }),
    });

    // The sendMessage content should include artifact info
    const lastMsg = pi._messages[pi._messages.length - 1];
    const content = lastMsg.msg.content;
    assert.ok(content.includes("Artifacts:"));
    assert.ok(content.includes("report"));

    fs.rmSync(tmpDir, { recursive: true });
  });
});

// ── Transform steps ──

describe("transform steps", () => {
  it("produces output from expression mapping", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-transform-"));
    const spec: WorkflowSpec = {
      name: "test-transform",
      description: "test transform step",
      steps: {
        merge: {
          agent: "transform",
          transform: {
            mapping: {
              greeting: "hello",
              count: 42,
              nested: { deep: true },
            },
          },
        },
      },
      source: "project",
      filePath: path.join(tmpDir, "test.workflow.yaml"),
    };

    const result = await executeWorkflow(spec, {}, {
      ctx: mockCtx(tmpDir),
      pi: mockPi(),
      loadAgent: () => ({ name: "default" }),
    });

    assert.strictEqual(result.status, "completed");
    assert.strictEqual(result.steps.merge.status, "completed");
    assert.strictEqual(result.steps.merge.agent, "transform");
    const output = result.steps.merge.output as Record<string, unknown>;
    assert.strictEqual(output.greeting, "hello");
    assert.strictEqual(output.count, 42);
    assert.deepStrictEqual(output.nested, { deep: true });

    fs.rmSync(tmpDir, { recursive: true });
  });

  it("costs nothing (usage.cost === 0, usage.turns === 0)", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-transform-"));
    const spec: WorkflowSpec = {
      name: "test-transform-cost",
      description: "test transform zero cost",
      steps: {
        merge: {
          agent: "transform",
          transform: {
            mapping: { result: "free" },
          },
        },
      },
      source: "project",
      filePath: path.join(tmpDir, "test.workflow.yaml"),
    };

    const result = await executeWorkflow(spec, {}, {
      ctx: mockCtx(tmpDir),
      pi: mockPi(),
      loadAgent: () => ({ name: "default" }),
    });

    assert.strictEqual(result.status, "completed");
    assert.strictEqual(result.steps.merge.usage.cost, 0);
    assert.strictEqual(result.steps.merge.usage.turns, 0);
    assert.strictEqual(result.steps.merge.usage.input, 0);
    assert.strictEqual(result.steps.merge.usage.output, 0);
    assert.strictEqual(result.totalUsage.cost, 0);
    assert.strictEqual(result.totalUsage.turns, 0);

    fs.rmSync(tmpDir, { recursive: true });
  });
});

// ── Phase 2 integration tests ──
// These exercise combined phase 2 features: when, gate, transform, loop

function makeSpec(overrides: Partial<WorkflowSpec> & { steps: WorkflowSpec["steps"] }): WorkflowSpec {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-p2-"));
  return {
    name: "test-p2",
    description: "phase 2 integration test",
    source: "project",
    filePath: path.join(tmpDir, "test.workflow.yaml"),
    ...overrides,
  };
}

function defaultOptions(tmpDir?: string) {
  const cwd = tmpDir ?? fs.mkdtempSync(path.join(os.tmpdir(), "wf-p2-"));
  return {
    ctx: mockCtx(cwd),
    pi: mockPi(),
    loadAgent: () => ({ name: "default" }),
  };
}

describe("phase 2 integration", () => {
  it("runs a workflow with when, gate, transform", async () => {
    const spec = makeSpec({
      steps: {
        source: {
          transform: {
            mapping: { data: "initial" },
          },
        },
        check: {
          gate: { check: "echo pass", onPass: "continue" },
        },
        conditional: {
          when: "${{ steps.check.output.passed }}",
          transform: {
            mapping: {
              wasChecked: "${{ steps.check.output.passed }}",
              sourceStatus: "${{ steps.source.status }}",
            },
          },
        },
      },
    });

    const result = await executeWorkflow(spec, {}, defaultOptions());
    assert.strictEqual(result.status, "completed");
    assert.strictEqual(result.steps.check.output.passed, true);
    assert.strictEqual(result.steps.conditional.output.wasChecked, true);
    assert.strictEqual(result.steps.conditional.usage.cost, 0);
  });

  it("skips conditional step when gate fails", async () => {
    const spec = makeSpec({
      steps: {
        check: {
          gate: { check: "exit 1", onFail: "continue" },
        },
        conditional: {
          when: "${{ steps.check.output.passed }}",
          transform: {
            mapping: { result: "should not appear" },
          },
        },
        final: {
          transform: {
            mapping: { done: true },
          },
        },
      },
    });

    const result = await executeWorkflow(spec, {}, defaultOptions());
    assert.strictEqual(result.status, "completed");
    assert.strictEqual(result.steps.check.output.passed, false);
    assert.strictEqual(result.steps.conditional.status, "skipped");
    assert.strictEqual(result.steps.final.status, "completed");
  });

  it("runs a loop with gate break", async () => {
    const spec = makeSpec({
      steps: {
        retry: {
          loop: {
            maxAttempts: 5,
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

    const result = await executeWorkflow(spec, {}, defaultOptions());
    assert.strictEqual(result.status, "completed");
    assert.strictEqual(result.steps.retry.output.iterations, 1);
  });

  it("combines transform, loop, and artifacts", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-p2-"));
    const spec: WorkflowSpec = {
      name: "test-combined",
      description: "combined phase 2 test",
      steps: {
        setup: {
          transform: {
            mapping: { prefix: "test" },
          },
        },
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
        summary: {
          transform: {
            mapping: {
              setupResult: "${{ steps.setup.output.prefix }}",
              loopIterations: "${{ steps.retry.output.iterations }}",
              loopStatus: "${{ steps.retry.status }}",
            },
          },
        },
      },
      artifacts: {
        report: {
          path: path.join(tmpDir, "artifacts", "summary.json"),
          from: "steps.summary.output",
        },
      },
      source: "project",
      filePath: path.join(tmpDir, "test.workflow.yaml"),
    };

    const result = await executeWorkflow(spec, {}, {
      ctx: mockCtx(tmpDir),
      pi: mockPi(),
      loadAgent: () => ({ name: "default" }),
    });

    assert.strictEqual(result.status, "completed");

    // Verify transform output
    const summaryOutput = result.steps.summary.output as Record<string, unknown>;
    assert.strictEqual(summaryOutput.setupResult, "test");
    assert.strictEqual(summaryOutput.loopIterations, 1);
    assert.strictEqual(summaryOutput.loopStatus, "completed");

    // Verify artifact was written
    assert.ok(result.artifacts);
    assert.ok(result.artifacts!.report);
    const artifactContent = JSON.parse(fs.readFileSync(result.artifacts!.report, "utf-8"));
    assert.strictEqual(artifactContent.setupResult, "test");

    fs.rmSync(tmpDir, { recursive: true });
  });
});
