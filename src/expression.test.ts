import { describe, it } from "node:test";
import assert from "node:assert";
import { resolveExpressions, resolveExpression, evaluateCondition, ExpressionError } from "./expression.ts";
import type { ExpressionScope, CompletionScope } from "./types.ts";

const scope: ExpressionScope = {
  input: {
    description: "null pointer in login",
    maxAttempts: 3,
    tags: ["auth", "critical"],
  },
  steps: {
    diagnose: {
      step: "diagnose",
      agent: "diagnostician",
      status: "completed",
      output: {
        summary: "NPE in UserService.login()",
        rootCause: "session param is null",
        fixLocation: { file: "src/auth/user-service.ts", line: 47 },
        reproCommand: "npm test -- --grep login",
      },
      textOutput: "Found the bug...",
      usage: { input: 1000, output: 500, cacheRead: 0, cacheWrite: 0, cost: 0.03, turns: 2 },
      durationMs: 42000,
    },
  },
};

describe("resolveExpression", () => {
  it("resolves input properties", () => {
    assert.strictEqual(resolveExpression("input.description", scope), "null pointer in login");
  });

  it("resolves input number", () => {
    assert.strictEqual(resolveExpression("input.maxAttempts", scope), 3);
  });

  it("resolves step output object", () => {
    const result = resolveExpression("steps.diagnose.output", scope);
    assert.strictEqual(typeof result, "object");
    assert.strictEqual((result as any).summary, "NPE in UserService.login()");
  });

  it("resolves nested step output", () => {
    assert.strictEqual(
      resolveExpression("steps.diagnose.output.fixLocation.file", scope),
      "src/auth/user-service.ts",
    );
  });

  it("resolves step metadata", () => {
    assert.strictEqual(resolveExpression("steps.diagnose.status", scope), "completed");
    assert.strictEqual(resolveExpression("steps.diagnose.usage.cost", scope), 0.03);
  });

  it("returns undefined for missing optional property on input", () => {
    assert.strictEqual(resolveExpression("input.nonexistent", scope), undefined);
  });

  it("returns undefined for missing optional property on step output", () => {
    assert.strictEqual(resolveExpression("steps.diagnose.output.missingField", scope), undefined);
  });

  it("throws on unexecuted step", () => {
    assert.throws(
      () => resolveExpression("steps.fix.output", scope),
      (err: unknown) => err instanceof ExpressionError && err.message.includes("fix"),
    );
  });

  it("throws on invalid root path", () => {
    assert.throws(
      () => resolveExpression("typo.something", scope),
      (err: unknown) => err instanceof ExpressionError,
    );
  });
});

// ── Filter tests ──

describe("resolveExpression filters", () => {
  it("applies duration filter", () => {
    assert.strictEqual(
      resolveExpression("steps.diagnose.durationMs | duration", scope),
      "42s",
    );
  });

  it("applies currency filter", () => {
    assert.strictEqual(
      resolveExpression("steps.diagnose.usage.cost | currency", scope),
      "$0.03",
    );
  });

  it("applies json filter", () => {
    const result = resolveExpression("steps.diagnose.output.fixLocation | json", scope);
    assert.strictEqual(typeof result, "string");
    const parsed = JSON.parse(result as string);
    assert.strictEqual(parsed.file, "src/auth/user-service.ts");
    assert.strictEqual(parsed.line, 47);
  });

  it("handles whitespace around pipe", () => {
    assert.strictEqual(
      resolveExpression("steps.diagnose.durationMs  |  duration", scope),
      "42s",
    );
  });

  it("throws on unknown filter", () => {
    assert.throws(
      () => resolveExpression("steps.diagnose.durationMs | bogus", scope),
      (err: unknown) => err instanceof ExpressionError && err.message.includes("bogus"),
    );
  });

  it("applies filter in embedded expression", () => {
    const result = resolveExpressions(
      "Took ${{ steps.diagnose.durationMs | duration }}, cost ${{ steps.diagnose.usage.cost | currency }}",
      scope,
    );
    assert.strictEqual(result, "Took 42s, cost $0.03");
  });

  it("applies filter in whole-value expression", () => {
    const result = resolveExpressions("${{ steps.diagnose.durationMs | duration }}", scope);
    assert.strictEqual(result, "42s");
  });
});

// ── Wider scope (CompletionScope) tests ──

describe("resolveExpression with CompletionScope", () => {
  const completionScope: CompletionScope = {
    input: { path: "/src" },
    steps: scope.steps,
    totalUsage: { input: 1500, output: 700, cacheRead: 0, cacheWrite: 0, cost: 0.05, turns: 3 },
    totalDurationMs: 92000,
    runDir: "/tmp/runs/test-run",
    runId: "test-20260313-120000-abcd",
    workflow: "explore-summarize",
    status: "completed",
    output: "Final summary text",
  };

  it("resolves root-level completion fields", () => {
    assert.strictEqual(resolveExpression("workflow", completionScope), "explore-summarize");
    assert.strictEqual(resolveExpression("status", completionScope), "completed");
    assert.strictEqual(resolveExpression("runDir", completionScope), "/tmp/runs/test-run");
    assert.strictEqual(resolveExpression("runId", completionScope), "test-20260313-120000-abcd");
  });

  it("resolves totalUsage fields", () => {
    assert.strictEqual(
      resolveExpression("totalUsage.cost", completionScope),
      0.05,
    );
  });

  it("applies filters on completion fields", () => {
    assert.strictEqual(
      resolveExpression("totalDurationMs | duration", completionScope),
      "1m32s",
    );
    assert.strictEqual(
      resolveExpression("totalUsage.cost | currency", completionScope),
      "$0.05",
    );
  });

  it("still resolves input and steps from completion scope", () => {
    assert.strictEqual(
      resolveExpression("input.path", completionScope),
      "/src",
    );
    assert.strictEqual(
      resolveExpression("steps.diagnose.status", completionScope),
      "completed",
    );
  });
});

// ── evaluateCondition tests ──

describe("evaluateCondition", () => {
  it("returns true for truthy value", () => {
    assert.strictEqual(evaluateCondition("input.description", scope), true);
  });

  it("returns true for truthy number", () => {
    assert.strictEqual(evaluateCondition("input.maxAttempts", scope), true);
  });

  it("returns false for undefined (missing optional field)", () => {
    assert.strictEqual(evaluateCondition("input.nonexistent", scope), false);
  });

  it("supports negation with ! prefix", () => {
    assert.strictEqual(evaluateCondition("!input.nonexistent", scope), true);
    assert.strictEqual(evaluateCondition("!input.description", scope), false);
  });

  it("supports equality with string literal", () => {
    assert.strictEqual(evaluateCondition("input.description == 'null pointer in login'", scope), true);
    assert.strictEqual(evaluateCondition("input.description == 'something else'", scope), false);
  });

  it("supports numeric comparison", () => {
    assert.strictEqual(evaluateCondition("input.maxAttempts > 2", scope), true);
    assert.strictEqual(evaluateCondition("input.maxAttempts > 5", scope), false);
    assert.strictEqual(evaluateCondition("input.maxAttempts >= 3", scope), true);
    assert.strictEqual(evaluateCondition("input.maxAttempts < 10", scope), true);
    assert.strictEqual(evaluateCondition("input.maxAttempts <= 3", scope), true);
  });

  it("treats boolean false as falsy", () => {
    const boolScope = { flag: false } as unknown as Record<string, unknown>;
    assert.strictEqual(evaluateCondition("flag", boolScope), false);
  });

  it("supports != operator", () => {
    assert.strictEqual(evaluateCondition("steps.diagnose.status != 'failed'", scope), true);
    assert.strictEqual(evaluateCondition("steps.diagnose.status != 'completed'", scope), false);
  });

  it("supports comparison with boolean literal", () => {
    const boolScope = { enabled: true } as unknown as Record<string, unknown>;
    assert.strictEqual(evaluateCondition("enabled == true", boolScope), true);
    assert.strictEqual(evaluateCondition("enabled == false", boolScope), false);
  });
});

describe("resolveExpressions", () => {
  it("resolves whole-value expression preserving type", () => {
    const result = resolveExpressions("${{ steps.diagnose.output }}", scope);
    assert.strictEqual(typeof result, "object");
    assert.strictEqual((result as any).summary, "NPE in UserService.login()");
  });

  it("resolves whole-value expression preserving number", () => {
    const result = resolveExpressions("${{ input.maxAttempts }}", scope);
    assert.strictEqual(result, 3);
  });

  it("resolves whole-value expression preserving array", () => {
    const result = resolveExpressions("${{ input.tags }}", scope);
    assert.ok(Array.isArray(result));
    assert.deepStrictEqual(result, ["auth", "critical"]);
  });

  it("resolves embedded expression as string interpolation", () => {
    const result = resolveExpressions(
      "Bug in ${{ steps.diagnose.output.fixLocation.file }} at line ${{ steps.diagnose.output.fixLocation.line }}",
      scope,
    );
    assert.strictEqual(result, "Bug in src/auth/user-service.ts at line 47");
  });

  it("resolves object values recursively", () => {
    const input = {
      description: "${{ input.description }}",
      diagnosis: "${{ steps.diagnose.output }}",
      nested: {
        file: "${{ steps.diagnose.output.fixLocation.file }}",
        plain: "no expression here",
      },
    };
    const result = resolveExpressions(input, scope) as any;
    assert.strictEqual(result.description, "null pointer in login");
    assert.strictEqual(typeof result.diagnosis, "object");
    assert.strictEqual(result.nested.file, "src/auth/user-service.ts");
    assert.strictEqual(result.nested.plain, "no expression here");
  });

  it("resolves array elements", () => {
    const input = ["${{ input.description }}", "${{ input.maxAttempts }}"];
    const result = resolveExpressions(input, scope) as unknown[];
    assert.strictEqual(result[0], "null pointer in login");
    assert.strictEqual(result[1], 3);
  });

  it("passes through non-string primitives", () => {
    assert.strictEqual(resolveExpressions(42, scope), 42);
    assert.strictEqual(resolveExpressions(true, scope), true);
    assert.strictEqual(resolveExpressions(null, scope), null);
  });

  it("passes through strings with no expressions", () => {
    assert.strictEqual(resolveExpressions("plain string", scope), "plain string");
  });

  it("handles whitespace in expressions", () => {
    assert.strictEqual(
      resolveExpressions("${{   input.description   }}", scope),
      "null pointer in login",
    );
  });

  it("renders undefined as empty string in embedded expressions", () => {
    const result = resolveExpressions(
      "Question: ${{ input.nonexistent }}",
      scope,
    );
    assert.strictEqual(result, "Question: ");
  });

  it("resolves whole-value undefined for missing optional field", () => {
    const result = resolveExpressions("${{ input.nonexistent }}", scope);
    assert.strictEqual(result, undefined);
  });

  it("stringifies objects in embedded expressions", () => {
    const result = resolveExpressions(
      "Location: ${{ steps.diagnose.output.fixLocation }}",
      scope,
    );
    assert.ok(typeof result === "string");
    assert.ok((result as string).includes("src/auth/user-service.ts"));
  });
});
