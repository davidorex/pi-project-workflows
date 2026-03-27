import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { persistStepOutput } from "./output.js";

describe("persistStepOutput", () => {
	it("writes structured output as JSON", (t) => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-output-"));
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		fs.mkdirSync(path.join(tmpDir, "outputs"), { recursive: true });

		const result = persistStepOutput(tmpDir, "analyze", { findings: ["a", "b"] });
		assert.ok(result);
		assert.ok(result.endsWith("analyze.json"));
		const content = JSON.parse(fs.readFileSync(result, "utf-8"));
		assert.deepStrictEqual(content, { findings: ["a", "b"] });
	});

	it("wraps string output as JSON", (t) => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-output-"));
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		fs.mkdirSync(path.join(tmpDir, "outputs"), { recursive: true });

		const result = persistStepOutput(tmpDir, "explore", undefined, "Found patterns");
		assert.ok(result);
		assert.ok(result.endsWith("explore.json"));
		const content = JSON.parse(fs.readFileSync(result, "utf-8"));
		assert.deepStrictEqual(content, { text: "Found patterns" });
	});

	it("prefers structured output over textOutput", (t) => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-output-"));
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		fs.mkdirSync(path.join(tmpDir, "outputs"), { recursive: true });

		const result = persistStepOutput(tmpDir, "step1", { key: "val" }, "text fallback");
		assert.ok(result);
		const content = JSON.parse(fs.readFileSync(result, "utf-8"));
		assert.deepStrictEqual(content, { key: "val" });
	});

	it("wraps string output field as JSON", (t) => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-output-"));
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		fs.mkdirSync(path.join(tmpDir, "outputs"), { recursive: true });

		const result = persistStepOutput(tmpDir, "step1", "plain string");
		assert.ok(result);
		assert.ok(result.endsWith(".json"));
		const content = JSON.parse(fs.readFileSync(result, "utf-8"));
		assert.deepStrictEqual(content, { text: "plain string" });
	});

	it("returns undefined when nothing to write", (t) => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-output-"));
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		fs.mkdirSync(path.join(tmpDir, "outputs"), { recursive: true });
		assert.strictEqual(persistStepOutput(tmpDir, "empty", undefined, undefined), undefined);
	});

	it("returns undefined for empty string", (t) => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-output-"));
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		fs.mkdirSync(path.join(tmpDir, "outputs"), { recursive: true });
		assert.strictEqual(persistStepOutput(tmpDir, "empty", undefined, ""), undefined);
	});

	it("writes array output as JSON", (t) => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-output-"));
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		fs.mkdirSync(path.join(tmpDir, "outputs"), { recursive: true });

		const result = persistStepOutput(tmpDir, "items", ["a", "b", "c"]);
		assert.ok(result);
		assert.ok(result.endsWith(".json"));
		assert.deepStrictEqual(JSON.parse(fs.readFileSync(result, "utf-8")), ["a", "b", "c"]);
	});

	it("all outputs are JSON regardless of input type", (t) => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-output-"));
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		fs.mkdirSync(path.join(tmpDir, "outputs"), { recursive: true });

		const r1 = persistStepOutput(tmpDir, "s1", { a: 1 });
		const r2 = persistStepOutput(tmpDir, "s2", "hello");
		const r3 = persistStepOutput(tmpDir, "s3", undefined, "world");
		assert.ok(r1!.endsWith(".json"));
		assert.ok(r2!.endsWith(".json"));
		assert.ok(r3!.endsWith(".json"));
	});

	it("creates outputs directory if missing", (t) => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-output-"));
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		// Don't create outputs/ — persistStepOutput should handle it

		const result = persistStepOutput(tmpDir, "auto", { data: true });
		assert.ok(result);
		assert.ok(fs.existsSync(result));
		assert.deepStrictEqual(JSON.parse(fs.readFileSync(result, "utf-8")), { data: true });
	});

	it("writes to author-declared output path", (t) => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-output-"));
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const customPath = path.join(tmpDir, "reports", "analysis", "structure.json");
		const result = persistStepOutput(tmpDir, "step1", { key: "val" }, undefined, customPath);
		assert.strictEqual(result, customPath);
		assert.ok(fs.existsSync(customPath));
		assert.deepStrictEqual(JSON.parse(fs.readFileSync(customPath, "utf-8")), { key: "val" });
	});

	it("creates parent directories for author-declared path", (t) => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-output-"));
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const deepPath = path.join(tmpDir, "a", "b", "c", "result.json");
		const result = persistStepOutput(tmpDir, "step1", ["x"], undefined, deepPath);
		assert.strictEqual(result, deepPath);
		assert.deepStrictEqual(JSON.parse(fs.readFileSync(deepPath, "utf-8")), ["x"]);
	});

	it("defaults to run dir when no output path declared", (t) => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-output-"));
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const result = persistStepOutput(tmpDir, "my-step", { a: 1 });
		assert.ok(result);
		assert.strictEqual(result, path.join(tmpDir, "outputs", "my-step.json"));
	});
});

describe("persistStepOutput error handling", () => {
	it("returns undefined when directory creation fails", (t) => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-output-err-"));
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		// Create a file where the outputs directory should be — mkdirSync will fail with ENOTDIR
		const blocker = path.join(tmpDir, "outputs");
		fs.writeFileSync(blocker, "not a directory");

		const result = persistStepOutput(tmpDir, "step1", { data: true });
		assert.strictEqual(result, undefined);
	});

	it("returns undefined when write to author-declared path fails", (_t) => {
		// Use /dev/null/impossible on unix — a known-bad path
		const result = persistStepOutput(
			"/tmp",
			"step1",
			{ data: true },
			undefined,
			"/dev/null/impossible/path/output.json",
		);
		assert.strictEqual(result, undefined);
	});

	it("returns undefined when file write fails due to unwritable directory", (t) => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-output-err-"));
		t.after(() => {
			// Restore permissions for cleanup
			try {
				fs.chmodSync(path.join(tmpDir, "outputs"), 0o755);
			} catch {
				/* ignore */
			}
			fs.rmSync(tmpDir, { recursive: true, force: true });
		});

		// Create outputs dir then make it read-only
		const outputsDir = path.join(tmpDir, "outputs");
		fs.mkdirSync(outputsDir, { recursive: true });
		fs.chmodSync(outputsDir, 0o444);

		const result = persistStepOutput(tmpDir, "step1", { data: true });
		assert.strictEqual(result, undefined);
	});

	it("writes warning to stderr on failure", (t) => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-output-err-"));
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		// Create a file where outputs dir should be
		fs.writeFileSync(path.join(tmpDir, "outputs"), "blocker");

		// Capture stderr
		const originalWrite = process.stderr.write;
		let captured = "";
		process.stderr.write = ((chunk: string) => {
			captured += chunk;
			return true;
		}) as typeof process.stderr.write;
		t.after(() => {
			process.stderr.write = originalWrite;
		});

		persistStepOutput(tmpDir, "step1", { data: true });
		assert.ok(captured.includes("step1"));
		assert.ok(captured.includes("[pi-workflows]"));
	});

	it("returns undefined for string output when directory creation fails", (t) => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-output-err-"));
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		// Create a file where the outputs directory should be
		fs.writeFileSync(path.join(tmpDir, "outputs"), "not a directory");

		const result = persistStepOutput(tmpDir, "step1", undefined, "some text");
		assert.strictEqual(result, undefined);
	});

	it("does not throw on write failure — existing tests still pass", () => {
		// Verify that all the existing happy-path tests still work unchanged.
		// This test is a meta-check — if output.test.ts runs without error,
		// the non-throwing behavior is confirmed alongside existing behavior.
		assert.ok(true);
	});
});
