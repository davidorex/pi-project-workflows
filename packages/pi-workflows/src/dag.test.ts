import { describe, it } from "node:test";
import assert from "node:assert";
import { extractDependencies, buildExecutionPlan, isSequential } from "./dag.js";
import type { StepSpec } from "./types.js";
import { makeSpec as makeSpecFull } from "./test-helpers.js";

/**
 * Helper: build a minimal WorkflowSpec from a steps object.
 */
function makeSpec(steps: Record<string, StepSpec>) {
  return makeSpecFull({ steps });
}

describe("extractDependencies", () => {
  it("returns empty deps for steps with no expressions", () => {
    const spec = makeSpec({
      a: { agent: "foo" },
      b: { agent: "bar" },
    });
    const deps = extractDependencies(spec);
    assert.strictEqual(deps.get("a")!.size, 0);
    assert.strictEqual(deps.get("b")!.size, 0);
  });

  it("extracts deps from input expressions", () => {
    const spec = makeSpec({
      a: { agent: "foo" },
      b: {
        agent: "bar",
        input: {
          context: "${{ steps.a.textOutput }}",
        },
      },
    });
    const deps = extractDependencies(spec);
    assert.strictEqual(deps.get("a")!.size, 0);
    assert.ok(deps.get("b")!.has("a"));
  });

  it("extracts deps from when condition", () => {
    const spec = makeSpec({
      a: { agent: "foo" },
      b: {
        agent: "bar",
        when: "${{ steps.a.output.shouldRun }}",
      },
    });
    const deps = extractDependencies(spec);
    assert.ok(deps.get("b")!.has("a"));
  });

  it("extracts deps from bare when condition (no ${{ }})", () => {
    const spec = makeSpec({
      a: { agent: "foo" },
      b: {
        agent: "bar",
        when: "steps.a.output.shouldRun",
      },
    });
    const deps = extractDependencies(spec);
    assert.ok(deps.get("b")!.has("a"));
  });

  it("extracts deps from gate check", () => {
    const spec = makeSpec({
      a: { agent: "foo" },
      b: {
        gate: { check: "${{ steps.a.output.reproCommand }}" },
      },
    });
    const deps = extractDependencies(spec);
    assert.ok(deps.get("b")!.has("a"));
  });

  it("extracts deps from transform mapping", () => {
    const spec = makeSpec({
      a: { agent: "foo" },
      b: { agent: "bar" },
      c: {
        transform: {
          mapping: {
            fromA: "${{ steps.a.textOutput }}",
            fromB: "${{ steps.b.output.data }}",
          },
        },
      },
    });
    const deps = extractDependencies(spec);
    assert.ok(deps.get("c")!.has("a"));
    assert.ok(deps.get("c")!.has("b"));
  });

  it("extracts multiple deps from a single expression string", () => {
    const spec = makeSpec({
      a: { agent: "foo" },
      b: { agent: "bar" },
      c: {
        agent: "baz",
        input: {
          combined: "${{ steps.a.textOutput }}\n\n${{ steps.b.textOutput }}",
        },
      },
    });
    const deps = extractDependencies(spec);
    assert.ok(deps.get("c")!.has("a"));
    assert.ok(deps.get("c")!.has("b"));
  });

  it("extracts deps from nested input objects", () => {
    const spec = makeSpec({
      a: { agent: "foo" },
      b: {
        agent: "bar",
        input: {
          nested: {
            deep: {
              value: "${{ steps.a.output.x }}",
            },
          },
        },
      },
    });
    const deps = extractDependencies(spec);
    assert.ok(deps.get("b")!.has("a"));
  });

  it("extracts deps from input arrays", () => {
    const spec = makeSpec({
      a: { agent: "foo" },
      b: {
        agent: "bar",
        input: {
          items: ["${{ steps.a.output.x }}", "static"],
        },
      },
    });
    const deps = extractDependencies(spec);
    assert.ok(deps.get("b")!.has("a"));
  });

  it("ignores input-only references (no step deps)", () => {
    const spec = makeSpec({
      a: {
        agent: "foo",
        input: {
          path: "${{ input.path }}",
        },
      },
    });
    const deps = extractDependencies(spec);
    assert.strictEqual(deps.get("a")!.size, 0);
  });

  it("ignores self-references", () => {
    const spec = makeSpec({
      a: {
        agent: "foo",
        input: {
          self: "${{ steps.a.output }}",
        },
      },
    });
    const deps = extractDependencies(spec);
    assert.strictEqual(deps.get("a")!.size, 0);
  });

  it("ignores references to non-existent steps", () => {
    const spec = makeSpec({
      a: {
        agent: "foo",
        input: {
          bad: "${{ steps.nonexistent.output }}",
        },
      },
    });
    const deps = extractDependencies(spec);
    assert.strictEqual(deps.get("a")!.size, 0);
  });

  it("does not descend into loop sub-steps", () => {
    const spec = makeSpec({
      a: { agent: "foo" },
      b: {
        loop: {
          maxAttempts: 3,
          steps: {
            inner: {
              agent: "bar",
              input: { ctx: "${{ steps.a.textOutput }}" },
            },
          },
        },
      },
    });
    const deps = extractDependencies(spec);
    // The loop step itself should depend on 'a' via its sub-step's expression,
    // BUT per the design: we do NOT descend into loop sub-steps for top-level DAG.
    // The loop step's own `input` or `when` would declare its real deps.
    assert.strictEqual(deps.get("b")!.size, 0);
  });
});

describe("buildExecutionPlan", () => {
  it("fully sequential: linear chain", () => {
    const spec = makeSpec({
      a: { agent: "foo" },
      b: {
        agent: "bar",
        input: { ctx: "${{ steps.a.textOutput }}" },
      },
      c: {
        agent: "baz",
        input: { ctx: "${{ steps.b.output }}" },
      },
    });
    const plan = buildExecutionPlan(spec);
    assert.strictEqual(plan.length, 3);
    assert.deepStrictEqual(plan[0].steps, ["a"]);
    assert.deepStrictEqual(plan[1].steps, ["b"]);
    assert.deepStrictEqual(plan[2].steps, ["c"]);
    assert.ok(isSequential(plan));
  });

  it("fully parallel: no dependencies", () => {
    const spec = makeSpec({
      a: { agent: "foo", input: { x: "${{ input.path }}" } },
      b: { agent: "bar", input: { x: "${{ input.path }}" } },
      c: { agent: "baz", input: { x: "${{ input.path }}" } },
    });
    const plan = buildExecutionPlan(spec);
    assert.strictEqual(plan.length, 1);
    assert.strictEqual(plan[0].steps.length, 3);
    assert.ok(plan[0].steps.includes("a"));
    assert.ok(plan[0].steps.includes("b"));
    assert.ok(plan[0].steps.includes("c"));
    assert.ok(!isSequential(plan));
  });

  it("fan-out then merge: diamond pattern", () => {
    const spec = makeSpec({
      source: { agent: "foo" },
      analyzerA: {
        agent: "bar",
        input: { ctx: "${{ steps.source.textOutput }}" },
      },
      analyzerB: {
        agent: "baz",
        input: { ctx: "${{ steps.source.textOutput }}" },
      },
      merge: {
        transform: {
          mapping: {
            a: "${{ steps.analyzerA.output }}",
            b: "${{ steps.analyzerB.output }}",
          },
        },
      },
    });
    const plan = buildExecutionPlan(spec);
    assert.strictEqual(plan.length, 3);
    assert.deepStrictEqual(plan[0].steps, ["source"]);
    assert.strictEqual(plan[1].steps.length, 2);
    assert.ok(plan[1].steps.includes("analyzerA"));
    assert.ok(plan[1].steps.includes("analyzerB"));
    assert.deepStrictEqual(plan[2].steps, ["merge"]);
  });

  it("mixed: some parallel, some sequential", () => {
    const spec = makeSpec({
      a: { agent: "foo" },
      b: { agent: "bar" },
      c: {
        agent: "baz",
        input: { ctx: "${{ steps.a.textOutput }}" },
      },
      d: {
        transform: {
          mapping: {
            b: "${{ steps.b.output }}",
            c: "${{ steps.c.output }}",
          },
        },
      },
    });
    const plan = buildExecutionPlan(spec);
    assert.strictEqual(plan.length, 3);
    // Layer 0: a, b (both independent)
    assert.strictEqual(plan[0].steps.length, 2);
    assert.ok(plan[0].steps.includes("a"));
    assert.ok(plan[0].steps.includes("b"));
    // Layer 1: c (depends on a)
    assert.deepStrictEqual(plan[1].steps, ["c"]);
    // Layer 2: d (depends on b and c)
    assert.deepStrictEqual(plan[2].steps, ["d"]);
  });

  it("detects cycle", () => {
    const spec = makeSpec({
      a: {
        agent: "foo",
        input: { ctx: "${{ steps.b.output }}" },
      },
      b: {
        agent: "bar",
        input: { ctx: "${{ steps.a.output }}" },
      },
    });
    assert.throws(
      () => buildExecutionPlan(spec),
      (err: Error) => err.message.includes("cycle"),
    );
  });

  it("single step", () => {
    const spec = makeSpec({
      only: { agent: "foo" },
    });
    const plan = buildExecutionPlan(spec);
    assert.strictEqual(plan.length, 1);
    assert.deepStrictEqual(plan[0].steps, ["only"]);
    assert.ok(isSequential(plan));
  });

  it("preserves YAML order within layers", () => {
    // Steps with no deps should appear in their YAML declaration order
    const spec = makeSpec({
      z: { agent: "foo" },
      a: { agent: "bar" },
      m: { agent: "baz" },
    });
    const plan = buildExecutionPlan(spec);
    assert.strictEqual(plan.length, 1);
    // Should preserve insertion order: z, a, m
    assert.deepStrictEqual(plan[0].steps, ["z", "a", "m"]);
  });

  it("step with when referencing another step", () => {
    const spec = makeSpec({
      check: { gate: { check: "echo ok" } },
      conditional: {
        agent: "foo",
        when: "${{ steps.check.output.passed }}",
      },
    });
    const plan = buildExecutionPlan(spec);
    assert.strictEqual(plan.length, 2);
    assert.deepStrictEqual(plan[0].steps, ["check"]);
    assert.deepStrictEqual(plan[1].steps, ["conditional"]);
  });
});
