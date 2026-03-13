import { describe, it } from "node:test";
import assert from "node:assert";
import {
  generateRunId, initRunDir, writeState, readState,
  writeStepOutput, buildResult, formatResult, aggregateUsage,
} from "./state.ts";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { ExecutionState, WorkflowSpec, StepResult, StepUsage } from "./types.ts";

describe("generateRunId", () => {
  it("includes workflow name", () => {
    const id = generateRunId("bugfix");
    assert.ok(id.startsWith("bugfix-"));
  });

  it("generates unique IDs", () => {
    const a = generateRunId("test");
    const b = generateRunId("test");
    assert.notStrictEqual(a, b);
  });
});

describe("initRunDir", () => {
  it("creates directory structure under workflow name", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-state-"));
    const runDir = initRunDir(tmpDir, "test-wf", "test-run-1");

    assert.ok(fs.existsSync(runDir));
    assert.ok(runDir.includes(path.join("test-wf", "runs", "test-run-1")));
    assert.ok(fs.existsSync(path.join(runDir, "sessions")));
    assert.ok(fs.existsSync(path.join(runDir, "outputs")));

    fs.rmSync(tmpDir, { recursive: true });
  });
});

describe("writeState / readState", () => {
  it("round-trips execution state", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-state-"));
    const runDir = path.join(tmpDir, "run");
    fs.mkdirSync(runDir, { recursive: true });

    const state: ExecutionState = {
      input: { description: "test" },
      steps: {},
      status: "running",
    };

    writeState(runDir, state);
    const loaded = readState(runDir);
    assert.deepStrictEqual(loaded, state);

    fs.rmSync(tmpDir, { recursive: true });
  });

  it("returns null for nonexistent state", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-state-"));
    assert.strictEqual(readState(tmpDir), null);
    fs.rmSync(tmpDir, { recursive: true });
  });
});

describe("aggregateUsage", () => {
  it("sums usage across steps", () => {
    const usage = (n: number): StepUsage => ({
      input: n * 100, output: n * 50, cacheRead: 0, cacheWrite: 0,
      cost: n * 0.01, turns: n,
    });
    const steps: Record<string, StepResult> = {
      a: { step: "a", agent: "x", status: "completed", usage: usage(1), durationMs: 1000 },
      b: { step: "b", agent: "y", status: "completed", usage: usage(2), durationMs: 2000 },
    };
    const total = aggregateUsage(steps);
    assert.strictEqual(total.input, 300);
    assert.strictEqual(total.output, 150);
    assert.strictEqual(total.turns, 3);
    assert.ok(Math.abs(total.cost - 0.03) < 0.001);
  });
});

describe("formatResult", () => {
  it("includes workflow name and step summary", () => {
    const result = buildResult(
      { name: "test", steps: { s: { agent: "a" } } } as WorkflowSpec,
      "test-run-1",
      "/tmp/run",
      {
        input: {},
        steps: {
          s: {
            step: "s", agent: "a", status: "completed",
            textOutput: "done",
            usage: { input: 100, output: 50, cacheRead: 0, cacheWrite: 0, cost: 0.01, turns: 1 },
            durationMs: 5000,
          },
        },
        status: "completed",
      },
      "completed",
    );
    const text = formatResult(result);
    assert.ok(text.includes("test"));
    assert.ok(text.includes("completed"));
    assert.ok(text.includes("$0.01") || text.includes("0.01"));
  });
});
