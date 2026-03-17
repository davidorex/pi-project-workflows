import { describe, it } from "node:test";
import assert from "node:assert";
import { executePause } from "./step-pause.js";

describe("executePause", () => {
  it("returns completed result with message", () => {
    const result = executePause("review-point", "Review exploration results");
    assert.strictEqual(result.status, "completed");
    assert.strictEqual(result.step, "review-point");
    assert.strictEqual(result.agent, "pause");
    assert.strictEqual(result.textOutput, "Review exploration results");
    assert.deepStrictEqual(result.output, { message: "Review exploration results" });
    assert.strictEqual(result.durationMs, 0);
  });

  it("returns completed result without message (boolean true)", () => {
    const result = executePause("checkpoint");
    assert.strictEqual(result.status, "completed");
    assert.strictEqual(result.textOutput, "Workflow paused");
    assert.strictEqual(result.output, undefined);
  });

  it("has zero usage", () => {
    const result = executePause("p");
    assert.strictEqual(result.usage.cost, 0);
    assert.strictEqual(result.usage.turns, 0);
    assert.strictEqual(result.usage.input, 0);
    assert.strictEqual(result.usage.output, 0);
  });
});
