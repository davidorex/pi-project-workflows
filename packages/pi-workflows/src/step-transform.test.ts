import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { zeroUsage } from "./step-shared.js";
import { executeTransform } from "./step-transform.js";

describe("executeTransform", () => {
	// Happy path
	it("resolves simple mapping to output object", () => {
		const result = executeTransform({ mapping: { greeting: "hello" } }, "step1", {});
		assert.strictEqual(result.status, "completed");
		assert.deepStrictEqual(result.output, { greeting: "hello" });
	});

	it("resolves ${{ }} expressions in mapping values", () => {
		const result = executeTransform({ mapping: { name: "${{ input.name }}" } }, "step1", { input: { name: "Alice" } });
		assert.strictEqual(result.status, "completed");
		assert.strictEqual((result.output as any).name, "Alice");
	});

	it("resolves nested expressions", () => {
		const result = executeTransform({ mapping: { val: "${{ steps.x.output.field }}" } }, "step1", {
			input: {},
			steps: {
				x: {
					step: "x",
					agent: "test",
					status: "completed",
					output: { field: "deep-value" },
					usage: zeroUsage(),
					durationMs: 0,
				},
			},
		});
		assert.strictEqual(result.status, "completed");
		assert.strictEqual((result.output as any).val, "deep-value");
	});

	it("preserves non-expression values (numbers, booleans, null)", () => {
		const result = executeTransform({ mapping: { count: 42, flag: true, empty: null } }, "step1", {});
		assert.strictEqual(result.status, "completed");
		const output = result.output as any;
		assert.strictEqual(output.count, 42);
		assert.strictEqual(output.flag, true);
		assert.strictEqual(output.empty, null);
	});

	it("sets agent to 'transform'", () => {
		const result = executeTransform({ mapping: {} }, "step1", {});
		assert.strictEqual(result.agent, "transform");
	});

	it("sets step name correctly", () => {
		const result = executeTransform({ mapping: {} }, "my-transform", {});
		assert.strictEqual(result.step, "my-transform");
	});

	it("has zero usage", () => {
		const result = executeTransform({ mapping: {} }, "step1", {});
		assert.deepStrictEqual(result.usage, zeroUsage());
	});

	it("has non-negative durationMs", () => {
		const result = executeTransform({ mapping: {} }, "step1", {});
		assert.ok(result.durationMs >= 0);
	});

	it("includes textOutput as JSON-stringified output", () => {
		const result = executeTransform({ mapping: { a: 1 } }, "step1", {});
		assert.strictEqual(result.textOutput, JSON.stringify({ a: 1 }, null, 2));
	});

	// Output persistence
	it("persists output to runDir when runDir is provided", (t) => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-transform-"));
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const result = executeTransform({ mapping: { x: 1 } }, "step1", {}, tmpDir);
		assert.ok(result.outputPath);
		assert.ok(fs.existsSync(result.outputPath!));
		const persisted = JSON.parse(fs.readFileSync(result.outputPath!, "utf-8"));
		assert.deepStrictEqual(persisted, { x: 1 });
	});

	it("persists output to outputPath when provided", (t) => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-transform-"));
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const customPath = path.join(tmpDir, "custom-out.json");
		const result = executeTransform({ mapping: { y: 2 } }, "step1", {}, tmpDir, customPath);
		assert.strictEqual(result.outputPath, customPath);
		assert.ok(fs.existsSync(customPath));
	});

	it("does not persist when runDir is omitted", () => {
		const result = executeTransform({ mapping: { z: 3 } }, "step1", {});
		assert.strictEqual(result.outputPath, undefined);
	});

	// Error paths
	it("returns failed status when expression resolution throws", () => {
		const result = executeTransform({ mapping: { bad: "${{ steps.nonexistent.output }}" } }, "step1", {
			input: {},
			steps: {},
		});
		assert.strictEqual(result.status, "failed");
		assert.ok(result.error);
		assert.ok(result.error!.length > 0);
	});

	it("returns failed status with error message string", () => {
		const result = executeTransform({ mapping: { bad: "${{ steps.nonexistent.output }}" } }, "step1", {
			input: {},
			steps: {},
		});
		assert.strictEqual(result.status, "failed");
		assert.strictEqual(typeof result.error, "string");
		assert.ok(result.error!.includes("nonexistent"));
	});

	// Edge cases
	it("handles empty mapping object", () => {
		const result = executeTransform({ mapping: {} }, "step1", {});
		assert.strictEqual(result.status, "completed");
		assert.deepStrictEqual(result.output, {});
	});

	it("handles mapping with mixed expressions and literals", () => {
		const result = executeTransform({ mapping: { resolved: "${{ input.x }}", literal: "plain" } }, "step1", {
			input: { x: 42 },
		});
		assert.strictEqual(result.status, "completed");
		const output = result.output as any;
		assert.strictEqual(output.resolved, 42);
		assert.strictEqual(output.literal, "plain");
	});
});
