/**
 * Tests for graduated failure / retry support.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { snapshotBlockFiles, validateChangedBlocks, rollbackBlockFiles } from "@davidorex/pi-project/src/block-validation.ts";
import type { BlockSnapshot } from "@davidorex/pi-project/src/block-validation.ts";
import { parseWorkflowSpec } from "./workflow-spec.ts";
import { executeWorkflow } from "./workflow-executor.ts";
import type { StepResult, StepUsage } from "./types.ts";

/** Create a temp directory for test fixtures. */
function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "retry-test-"));
}

/** Clean up temp directory. */
function cleanDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch { /* ignore */ }
}

function zeroUsage(): StepUsage {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 };
}

// ── Block validation / rollback tests ──

describe("snapshotBlockFiles", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    cleanDir(tmpDir);
  });

  it("captures file content", () => {
    const wfDir = path.join(tmpDir, ".project");
    fs.mkdirSync(wfDir, { recursive: true });
    fs.writeFileSync(path.join(wfDir, "state.json"), '{"version": 1}');
    fs.writeFileSync(path.join(wfDir, "gaps.json"), '{"gaps": []}');

    const snapshot = snapshotBlockFiles(tmpDir);
    assert.equal(snapshot.size, 2);

    const stateSnap = snapshot.get(path.join(wfDir, "state.json"));
    assert.ok(stateSnap);
    assert.equal(stateSnap.content, '{"version": 1}');
    assert.equal(typeof stateSnap.mtime, "number");

    const gapsSnap = snapshot.get(path.join(wfDir, "gaps.json"));
    assert.ok(gapsSnap);
    assert.equal(gapsSnap.content, '{"gaps": []}');
  });

  it("returns empty map when .project/ does not exist", () => {
    const snapshot = snapshotBlockFiles(tmpDir);
    assert.equal(snapshot.size, 0);
  });
});

describe("rollbackBlockFiles", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    cleanDir(tmpDir);
  });

  it("restores changed file content", () => {
    const wfDir = path.join(tmpDir, ".project");
    fs.mkdirSync(wfDir, { recursive: true });
    fs.writeFileSync(path.join(wfDir, "state.json"), '{"version": 1}');

    const snapshot = snapshotBlockFiles(tmpDir);

    // Simulate a step modifying the file
    fs.writeFileSync(path.join(wfDir, "state.json"), '{"version": 2}');

    const rolled = rollbackBlockFiles(tmpDir, snapshot);
    assert.equal(rolled.length, 1);

    const content = fs.readFileSync(path.join(wfDir, "state.json"), "utf-8");
    assert.equal(content, '{"version": 1}');
  });

  it("deletes new files not in snapshot", () => {
    const wfDir = path.join(tmpDir, ".project");
    fs.mkdirSync(wfDir, { recursive: true });

    const snapshot = snapshotBlockFiles(tmpDir);

    // Simulate a step creating a new file
    fs.writeFileSync(path.join(wfDir, "new-file.json"), '{"new": true}');

    const rolled = rollbackBlockFiles(tmpDir, snapshot);
    assert.equal(rolled.length, 1);
    assert.equal(fs.existsSync(path.join(wfDir, "new-file.json")), false);
  });

  it("does not touch unchanged files", () => {
    const wfDir = path.join(tmpDir, ".project");
    fs.mkdirSync(wfDir, { recursive: true });
    fs.writeFileSync(path.join(wfDir, "state.json"), '{"version": 1}');

    const snapshot = snapshotBlockFiles(tmpDir);

    // Don't modify anything
    const rolled = rollbackBlockFiles(tmpDir, snapshot);
    assert.equal(rolled.length, 0);

    const content = fs.readFileSync(path.join(wfDir, "state.json"), "utf-8");
    assert.equal(content, '{"version": 1}');
  });
});

// ── Workflow spec parsing tests ──

describe("workflow-spec retry parsing", () => {
  it("parses retry config from step YAML", () => {
    const yaml = `
name: test-retry
description: test
steps:
  analyze:
    agent: code-analyzer
    retry:
      maxAttempts: 3
      onExhausted: skip
      steeringMessage: Focus on valid JSON output.
`;
    const spec = parseWorkflowSpec(yaml, "/test.project.yaml", "project");
    const step = spec.steps.analyze;
    assert.ok(step.retry);
    assert.equal(step.retry.maxAttempts, 3);
    assert.equal(step.retry.onExhausted, "skip");
    assert.equal(step.retry.steeringMessage, "Focus on valid JSON output.");
  });

  it("step without retry config has no retry field", () => {
    const yaml = `
name: test-no-retry
description: test
steps:
  analyze:
    agent: code-analyzer
`;
    const spec = parseWorkflowSpec(yaml, "/test.project.yaml", "project");
    assert.equal(spec.steps.analyze.retry, undefined);
  });

  it("rejects invalid retry.maxAttempts", () => {
    const yaml = `
name: test-invalid
description: test
steps:
  analyze:
    agent: code-analyzer
    retry:
      maxAttempts: -1
`;
    assert.throws(() => {
      parseWorkflowSpec(yaml, "/test.project.yaml", "project");
    }, /retry\.maxAttempts must be a positive integer/);
  });

  it("rejects invalid retry.onExhausted", () => {
    const yaml = `
name: test-invalid
description: test
steps:
  analyze:
    agent: code-analyzer
    retry:
      maxAttempts: 2
      onExhausted: retry
`;
    assert.throws(() => {
      parseWorkflowSpec(yaml, "/test.project.yaml", "project");
    }, /retry\.onExhausted must be 'fail' or 'skip'/);
  });
});

// ── Retry integration tests (using injectable dispatch) ──

describe("graduated failure retry", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    // Create minimal run dir structure
    const runDir = path.join(tmpDir, ".pi", "workflow-runs", "test", "runs");
    fs.mkdirSync(runDir, { recursive: true });
  });

  afterEach(() => {
    cleanDir(tmpDir);
  });

  /** Minimal mock context */
  function mockCtx() {
    return {
      cwd: tmpDir,
      hasUI: false,
      ui: { setWidget() {}, notify() {}, setWorkingMessage() {} },
    };
  }

  /** Minimal mock pi */
  function mockPi() {
    const messages: any[] = [];
    return {
      sendMessage(msg: any, opts?: any) { messages.push({ msg, opts }); },
      messages,
    };
  }

  /** Build a dispatch function that fails N times then succeeds */
  function buildDispatchFn(failCount: number, errorMessage = "Agent failed") {
    let callCount = 0;
    return async (_stepSpec: any, _agentSpec: any, prompt: string, _opts: any): Promise<StepResult> => {
      callCount++;
      if (callCount <= failCount) {
        return {
          step: _opts.stepName,
          agent: _stepSpec.agent ?? "test-agent",
          status: "failed",
          usage: zeroUsage(),
          durationMs: 100,
          error: errorMessage,
        };
      }
      return {
        step: _opts.stepName,
        agent: _stepSpec.agent ?? "test-agent",
        status: "completed",
        output: { result: "success" },
        textOutput: '{"result": "success"}',
        usage: zeroUsage(),
        durationMs: 100,
      };
    };
  }

  it("agent step fails first, succeeds on attempt 2", async () => {
    const yaml = `
name: test-retry
description: test
steps:
  analyze:
    agent: test-agent
    retry:
      maxAttempts: 3
`;
    const spec = parseWorkflowSpec(yaml, path.join(tmpDir, "test.project.yaml"), "project");
    const dispatchFn = buildDispatchFn(1);

    const result = await executeWorkflow(spec, {}, {
      ctx: mockCtx(),
      pi: mockPi(),
      loadAgent: () => ({ name: "test-agent" }),
      dispatchFn,
    });

    assert.equal(result.status, "completed");
    const stepResult = result.steps.analyze;
    assert.equal(stepResult.status, "completed");
    assert.equal(stepResult.attempt, 2);
    assert.equal(stepResult.totalAttempts, 2);
    assert.ok(stepResult.priorErrors);
    assert.equal(stepResult.priorErrors.length, 1);
    assert.equal(stepResult.priorErrors[0], "Agent failed");
  });

  it("agent step exhausts 3 attempts with onExhausted=fail", async () => {
    const yaml = `
name: test-retry-fail
description: test
steps:
  analyze:
    agent: test-agent
    retry:
      maxAttempts: 3
      onExhausted: fail
`;
    const spec = parseWorkflowSpec(yaml, path.join(tmpDir, "test.project.yaml"), "project");
    const dispatchFn = buildDispatchFn(5); // always fails

    const result = await executeWorkflow(spec, {}, {
      ctx: mockCtx(),
      pi: mockPi(),
      loadAgent: () => ({ name: "test-agent" }),
      dispatchFn,
    });

    assert.equal(result.status, "failed");
    const stepResult = result.steps.analyze;
    assert.equal(stepResult.status, "failed");
    assert.equal(stepResult.attempt, 3);
    assert.equal(stepResult.totalAttempts, 3);
    assert.ok(stepResult.priorErrors);
    assert.equal(stepResult.priorErrors.length, 3);
  });

  it("agent step exhausts attempts with onExhausted=skip — workflow continues", async () => {
    const yaml = `
name: test-retry-skip
description: test
steps:
  analyze:
    agent: test-agent
    retry:
      maxAttempts: 2
      onExhausted: skip
  followup:
    agent: test-agent
`;
    const spec = parseWorkflowSpec(yaml, path.join(tmpDir, "test.project.yaml"), "project");
    let callCount = 0;
    const dispatchFn = async (_stepSpec: any, _agentSpec: any, _prompt: string, opts: any): Promise<StepResult> => {
      callCount++;
      // analyze always fails, followup succeeds
      if (opts.stepName === "analyze") {
        return {
          step: opts.stepName, agent: "test-agent", status: "failed",
          usage: zeroUsage(), durationMs: 100, error: "fail",
        };
      }
      return {
        step: opts.stepName, agent: "test-agent", status: "completed",
        output: { ok: true }, textOutput: '{"ok":true}',
        usage: zeroUsage(), durationMs: 100,
      };
    };

    const result = await executeWorkflow(spec, {}, {
      ctx: mockCtx(),
      pi: mockPi(),
      loadAgent: () => ({ name: "test-agent" }),
      dispatchFn,
    });

    assert.equal(result.status, "completed");
    assert.equal(result.steps.analyze.status, "skipped");
    assert.ok(result.steps.analyze.warnings);
    assert.ok(result.steps.analyze.warnings.some((w: string) => w.includes("onExhausted: skip")));
    assert.equal(result.steps.followup.status, "completed");
  });

  it("command step with retry config is ignored — fails immediately", async () => {
    const yaml = `
name: test-command-retry
description: test
steps:
  check:
    command: "exit 1"
    retry:
      maxAttempts: 3
`;
    const spec = parseWorkflowSpec(yaml, path.join(tmpDir, "test.project.yaml"), "project");

    const result = await executeWorkflow(spec, {}, {
      ctx: mockCtx(),
      pi: mockPi(),
      loadAgent: () => ({ name: "test-agent" }),
    });

    assert.equal(result.status, "failed");
    const stepResult = result.steps.check;
    assert.equal(stepResult.status, "failed");
    // Should not have retried — no attempt tracking beyond 1
    assert.equal(stepResult.attempt, 1);
    assert.equal(stepResult.totalAttempts, 1);
  });

  it("block validation failure triggers rollback and retry", async () => {
    // Create .project dir with a schema that demands version=1
    const wfDir = path.join(tmpDir, ".project");
    const schemasDir = path.join(wfDir, "schemas");
    fs.mkdirSync(schemasDir, { recursive: true });
    fs.writeFileSync(path.join(wfDir, "state.json"), '{"version": 1}');
    fs.writeFileSync(path.join(schemasDir, "state.schema.json"), JSON.stringify({
      type: "object",
      properties: { version: { type: "number", const: 1 } },
      required: ["version"],
    }));

    const yaml = `
name: test-block-retry
description: test
steps:
  update:
    agent: test-agent
    retry:
      maxAttempts: 3
`;
    const spec = parseWorkflowSpec(yaml, path.join(tmpDir, "test.project.yaml"), "project");

    let attemptCount = 0;
    const dispatchFn = async (_stepSpec: any, _agentSpec: any, _prompt: string, opts: any): Promise<StepResult> => {
      attemptCount++;
      // On first attempt, corrupt the block file. On second, leave it alone.
      if (attemptCount === 1) {
        fs.writeFileSync(path.join(wfDir, "state.json"), '{"version": 2}');
      }
      return {
        step: opts.stepName, agent: "test-agent", status: "completed",
        output: { done: true }, textOutput: '{"done":true}',
        usage: zeroUsage(), durationMs: 100,
      };
    };

    const result = await executeWorkflow(spec, {}, {
      ctx: mockCtx(),
      pi: mockPi(),
      loadAgent: () => ({ name: "test-agent" }),
      dispatchFn,
    });

    assert.equal(result.status, "completed");
    assert.equal(result.steps.update.status, "completed");
    assert.equal(result.steps.update.attempt, 2);
    // Verify file was rolled back before second attempt
    const content = fs.readFileSync(path.join(wfDir, "state.json"), "utf-8");
    assert.equal(content, '{"version": 1}');
  });

  it("block validation rollback deletes new files created during step", async () => {
    const wfDir = path.join(tmpDir, ".project");
    const schemasDir = path.join(wfDir, "schemas");
    fs.mkdirSync(schemasDir, { recursive: true });
    // Schema that always fails for newfile
    fs.writeFileSync(path.join(schemasDir, "newfile.schema.json"), JSON.stringify({
      type: "object",
      properties: { valid: { type: "boolean", const: true } },
      required: ["valid"],
    }));

    const yaml = `
name: test-new-file-rollback
description: test
steps:
  create:
    agent: test-agent
    retry:
      maxAttempts: 2
`;
    const spec = parseWorkflowSpec(yaml, path.join(tmpDir, "test.project.yaml"), "project");

    let attemptCount = 0;
    const dispatchFn = async (_stepSpec: any, _agentSpec: any, _prompt: string, opts: any): Promise<StepResult> => {
      attemptCount++;
      if (attemptCount === 1) {
        // Create a new block file that fails validation
        fs.writeFileSync(path.join(wfDir, "newfile.json"), '{"valid": false}');
      }
      // Second attempt: don't create the file
      return {
        step: opts.stepName, agent: "test-agent", status: "completed",
        output: { done: true }, textOutput: '{"done":true}',
        usage: zeroUsage(), durationMs: 100,
      };
    };

    const result = await executeWorkflow(spec, {}, {
      ctx: mockCtx(),
      pi: mockPi(),
      loadAgent: () => ({ name: "test-agent" }),
      dispatchFn,
    });

    assert.equal(result.status, "completed");
    // The new file should have been deleted during rollback
    assert.equal(fs.existsSync(path.join(wfDir, "newfile.json")), false);
  });

  it("step with no retry config — backward compatible, same as current", async () => {
    const yaml = `
name: test-no-retry
description: test
steps:
  analyze:
    agent: test-agent
`;
    const spec = parseWorkflowSpec(yaml, path.join(tmpDir, "test.project.yaml"), "project");
    const dispatchFn = buildDispatchFn(0); // succeeds immediately

    const result = await executeWorkflow(spec, {}, {
      ctx: mockCtx(),
      pi: mockPi(),
      loadAgent: () => ({ name: "test-agent" }),
      dispatchFn,
    });

    assert.equal(result.status, "completed");
    const stepResult = result.steps.analyze;
    assert.equal(stepResult.status, "completed");
    assert.equal(stepResult.attempt, 1);
    assert.equal(stepResult.totalAttempts, 1);
    assert.equal(stepResult.priorErrors, undefined);
  });

  it("cancelled workflow during retry — cancellation respected between attempts", async () => {
    const yaml = `
name: test-cancel-retry
description: test
steps:
  analyze:
    agent: test-agent
    retry:
      maxAttempts: 5
`;
    const spec = parseWorkflowSpec(yaml, path.join(tmpDir, "test.project.yaml"), "project");
    const controller = new AbortController();

    let callCount = 0;
    const dispatchFn = async (_stepSpec: any, _agentSpec: any, _prompt: string, opts: any): Promise<StepResult> => {
      callCount++;
      // Fail first attempt, then abort synchronously before returning
      if (callCount === 1) {
        controller.abort();
        return {
          step: opts.stepName, agent: "test-agent", status: "failed",
          usage: zeroUsage(), durationMs: 100, error: "first fail",
        };
      }
      return {
        step: opts.stepName, agent: "test-agent", status: "completed",
        output: {}, textOutput: "{}",
        usage: zeroUsage(), durationMs: 100,
      };
    };

    const result = await executeWorkflow(spec, {}, {
      ctx: mockCtx(),
      pi: mockPi(),
      signal: controller.signal,
      loadAgent: () => ({ name: "test-agent" }),
      dispatchFn,
    });

    assert.equal(result.status, "failed");
    // Should have only made 1 dispatch call before cancellation
    assert.equal(callCount, 1);
  });
});
