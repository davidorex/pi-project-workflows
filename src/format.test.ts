import { describe, it } from "node:test";
import assert from "node:assert";
import { formatDuration, formatCost } from "./format.ts";

describe("formatDuration", () => {
  it("formats zero", () => {
    assert.strictEqual(formatDuration(0), "0s");
  });

  it("formats sub-minute", () => {
    assert.strictEqual(formatDuration(42000), "42s");
  });

  it("rounds to nearest second", () => {
    assert.strictEqual(formatDuration(1500), "2s");
    assert.strictEqual(formatDuration(1499), "1s");
  });

  it("formats minutes and seconds", () => {
    assert.strictEqual(formatDuration(92000), "1m32s");
  });

  it("pads seconds in minute format", () => {
    assert.strictEqual(formatDuration(60000), "1m00s");
    assert.strictEqual(formatDuration(63000), "1m03s");
  });

  it("formats hours and minutes", () => {
    assert.strictEqual(formatDuration(3720000), "1h02m");
  });

  it("formats exact hour", () => {
    assert.strictEqual(formatDuration(3600000), "1h00m");
  });
});

describe("formatCost", () => {
  it("formats zero", () => {
    assert.strictEqual(formatCost(0), "$0.00");
  });

  it("formats small cost", () => {
    assert.strictEqual(formatCost(0.03), "$0.03");
  });

  it("formats larger cost", () => {
    assert.strictEqual(formatCost(1.5), "$1.50");
  });

  it("rounds to two decimal places", () => {
    assert.strictEqual(formatCost(0.999), "$1.00");
    assert.strictEqual(formatCost(0.001), "$0.00");
  });
});
