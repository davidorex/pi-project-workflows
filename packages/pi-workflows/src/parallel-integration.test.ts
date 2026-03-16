import { describe, it } from "node:test";
import assert from "node:assert";
import { buildExecutionPlan } from "./dag.ts";
import { parseWorkflowSpec } from "./workflow-spec.ts";
import { executeWorkflow } from "./workflow-executor.ts";
import type { WorkflowSpec } from "./types.ts";
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
  } as any;
}

function mockPi() {
  const messages: any[] = [];
  return {
    sendMessage: (msg: any, opts: any) => messages.push({ msg, opts }),
    _messages: messages,
  } as any;
}

function mockOptions(tmpDir?: string) {
  const cwd = tmpDir ?? fs.mkdtempSync(path.join(os.tmpdir(), "wf-parallel-"));
  return {
    ctx: mockCtx(cwd),
    pi: mockPi(),
    loadAgent: (name: string) => ({ name }),
  };
}

function makeSpec(overrides: Partial<WorkflowSpec> & { steps: WorkflowSpec["steps"] }): WorkflowSpec {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-parallel-"));
  return {
    name: "test-parallel",
    description: "test",
    source: "project" as const,
    filePath: path.join(tmpDir, "test.workflow.yaml"),
    ...overrides,
  };
}

describe("parallel integration — DAG analysis", () => {
  it("DAG-inferred parallel workflow produces correct execution plan", () => {
    const yaml = fs.readFileSync(
      path.resolve(import.meta.dirname, "../workflows/parallel-analysis.workflow.yaml"),
      "utf-8",
    );
    const spec = parseWorkflowSpec(yaml, "parallel-analysis.workflow.yaml", "project");
    const plan = buildExecutionPlan(spec);

    // Layer 0: explore (no deps)
    assert.deepStrictEqual(plan[0].steps, ["explore"]);

    // Layer 1: three analyzers (all depend only on explore)
    assert.strictEqual(plan[1].steps.length, 3);
    assert.ok(plan[1].steps.includes("analyze-structure"));
    assert.ok(plan[1].steps.includes("analyze-quality"));
    assert.ok(plan[1].steps.includes("analyze-patterns"));

    // Layer 2: synthesize (depends on all three analyzers)
    assert.deepStrictEqual(plan[2].steps, ["synthesize"]);
  });

  it("explicit parallel workflow parses correctly", () => {
    const yaml = fs.readFileSync(
      path.resolve(import.meta.dirname, "../workflows/parallel-explicit.workflow.yaml"),
      "utf-8",
    );
    const spec = parseWorkflowSpec(yaml, "parallel-explicit.workflow.yaml", "project");

    assert.ok(spec.steps.analyzers);
    assert.ok(spec.steps.analyzers.parallel);
    assert.ok(spec.steps.analyzers.parallel!.structure);
    assert.ok(spec.steps.analyzers.parallel!.quality);
  });
});

describe("parallel integration — execution", () => {
  it("parallel gate steps complete faster than sequential", async () => {
    // Two 2-second sleeps in parallel should take ~2s, not ~4s.
    // Steps need explicit ${{ steps.X }} deps to be parallelized
    // (conservative plan adds implicit sequential deps for steps without them).
    const spec = makeSpec({
      name: "timing-test",
      steps: {
        source: {
          transform: { mapping: { ready: true } },
        },
        a: {
          gate: { check: "sleep 2 && echo done-a" },
          input: { trigger: "${{ steps.source.output.ready }}" },
        },
        b: {
          gate: { check: "sleep 2 && echo done-b" },
          input: { trigger: "${{ steps.source.output.ready }}" },
        },
      },
    });

    const startTime = Date.now();
    const result = await executeWorkflow(spec, {}, mockOptions());
    const elapsed = Date.now() - startTime;

    assert.strictEqual(result.status, "completed");
    // If parallel: ~2s. If sequential: ~4s. Allow margin.
    assert.ok(elapsed < 3500, `Expected parallel execution (~2s) but took ${elapsed}ms`);
  });

  it("timeout kills a slow gate step", async () => {
    const spec = makeSpec({
      name: "timeout-test",
      steps: {
        slow: {
          gate: { check: "sleep 60 && echo done" },
          timeout: { seconds: 2 },
        },
      },
    });

    const startTime = Date.now();
    const result = await executeWorkflow(spec, {}, mockOptions());
    const elapsed = Date.now() - startTime;

    // Gate check failed because process was killed by timeout
    assert.strictEqual(result.status, "failed");
    assert.ok(elapsed < 10000, `Timeout should have killed step quickly, took ${elapsed}ms`);
  });

  it("parallel step failure cancels siblings", async () => {
    // fast_fail and slow_success both depend on source → parallel layer.
    // fast_fail exits immediately with error → slow_success should be cancelled.
    const spec = makeSpec({
      name: "cancel-test",
      steps: {
        source: {
          transform: { mapping: { ready: true } },
        },
        fast_fail: {
          gate: { check: "exit 1", onFail: "fail" },
          input: { trigger: "${{ steps.source.output.ready }}" },
        },
        slow_success: {
          gate: { check: "sleep 10 && echo done" },
          input: { trigger: "${{ steps.source.output.ready }}" },
        },
        after: {
          transform: {
            mapping: {
              a: "${{ steps.fast_fail.output }}",
              b: "${{ steps.slow_success.output }}",
            },
          },
        },
      },
    });

    const startTime = Date.now();
    const result = await executeWorkflow(spec, {}, mockOptions());
    const elapsed = Date.now() - startTime;

    assert.strictEqual(result.status, "failed");
    // Should not have waited 10s for slow_success
    assert.ok(elapsed < 5000, `Should have cancelled quickly, took ${elapsed}ms`);
  });
});
