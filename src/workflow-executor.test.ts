import { describe, it } from "node:test";
import assert from "node:assert";
import { executeWorkflow } from "./workflow-executor.ts";
import type { WorkflowSpec, AgentSpec, ExecutionState } from "./types.ts";
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
