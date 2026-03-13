import { describe, it } from "node:test";
import assert from "node:assert";
import { resolveExpressions, resolveExpression, ExpressionError } from "./expression.ts";
import type { ExpressionScope } from "./types.ts";

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
