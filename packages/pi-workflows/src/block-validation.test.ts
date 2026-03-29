/**
 * Tests for post-step block validation with filesystem diff.
 */

import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { snapshotBlockFiles, validateChangedBlocks } from "@davidorex/pi-project/block-validation";
import { mockCtx, mockPi } from "./test-helpers.js";
import type { WorkflowSpec } from "./types.js";
import { executeWorkflow } from "./workflow-executor.js";

// ── Unit tests for snapshotBlockFiles / validateChangedBlocks ──

describe("snapshotBlockFiles", () => {
	it("returns empty map when .project/ does not exist", () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bv-snap-"));
		const result = snapshotBlockFiles(tmpDir);
		assert.strictEqual(result.size, 0);
		fs.rmSync(tmpDir, { recursive: true });
	});

	it("snapshots .json files in .project/", () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bv-snap-"));
		const wfDir = path.join(tmpDir, ".project");
		fs.mkdirSync(wfDir, { recursive: true });
		fs.writeFileSync(path.join(wfDir, "gaps.json"), "{}");
		fs.writeFileSync(path.join(wfDir, "decisions.json"), "[]");
		fs.writeFileSync(path.join(wfDir, "readme.txt"), "not json"); // should be ignored

		const result = snapshotBlockFiles(tmpDir);
		assert.strictEqual(result.size, 2);
		assert.ok(result.has(path.join(wfDir, "gaps.json")));
		assert.ok(result.has(path.join(wfDir, "decisions.json")));
		assert.ok(!result.has(path.join(wfDir, "readme.txt")));

		fs.rmSync(tmpDir, { recursive: true });
	});
});

describe("validateChangedBlocks", () => {
	it("does nothing when no files changed", () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bv-val-"));
		const wfDir = path.join(tmpDir, ".project");
		fs.mkdirSync(wfDir, { recursive: true });
		fs.writeFileSync(path.join(wfDir, "gaps.json"), "{}");

		const before = snapshotBlockFiles(tmpDir);
		// No changes — should not throw
		assert.doesNotThrow(() => validateChangedBlocks(tmpDir, before));

		fs.rmSync(tmpDir, { recursive: true });
	});

	it("skips changed files with no matching schema", () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bv-val-"));
		const wfDir = path.join(tmpDir, ".project");
		fs.mkdirSync(wfDir, { recursive: true });

		const before = snapshotBlockFiles(tmpDir);

		// Create a new file with no schema
		fs.writeFileSync(path.join(wfDir, "no-schema.json"), '{"data": true}');

		// Should not throw — no schema to validate against
		assert.doesNotThrow(() => validateChangedBlocks(tmpDir, before));

		fs.rmSync(tmpDir, { recursive: true });
	});

	it("validates changed file against its schema — passes", () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bv-val-"));
		const wfDir = path.join(tmpDir, ".project");
		const schemasDir = path.join(wfDir, "schemas");
		fs.mkdirSync(schemasDir, { recursive: true });

		// Create schema
		fs.writeFileSync(
			path.join(schemasDir, "test-block.schema.json"),
			JSON.stringify({
				type: "object",
				required: ["name"],
				properties: { name: { type: "string" } },
			}),
		);

		const before = snapshotBlockFiles(tmpDir);

		// Create a valid block file
		fs.writeFileSync(path.join(wfDir, "test-block.json"), JSON.stringify({ name: "valid" }));

		assert.doesNotThrow(() => validateChangedBlocks(tmpDir, before));

		fs.rmSync(tmpDir, { recursive: true });
	});

	it("throws on validation failure", () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bv-val-"));
		const wfDir = path.join(tmpDir, ".project");
		const schemasDir = path.join(wfDir, "schemas");
		fs.mkdirSync(schemasDir, { recursive: true });

		// Create schema requiring name as string
		fs.writeFileSync(
			path.join(schemasDir, "test-block.schema.json"),
			JSON.stringify({
				type: "object",
				required: ["name"],
				properties: { name: { type: "string" } },
			}),
		);

		const before = snapshotBlockFiles(tmpDir);

		// Create an invalid block file (name should be string, not number)
		fs.writeFileSync(path.join(wfDir, "test-block.json"), JSON.stringify({ name: 123 }));

		assert.throws(
			() => validateChangedBlocks(tmpDir, before),
			(err: unknown) => err instanceof Error && err.message.includes("Block validation failed"),
		);

		fs.rmSync(tmpDir, { recursive: true });
	});

	it("detects modified files (not just new files)", () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bv-val-"));
		const wfDir = path.join(tmpDir, ".project");
		const schemasDir = path.join(wfDir, "schemas");
		fs.mkdirSync(schemasDir, { recursive: true });

		// Create schema
		fs.writeFileSync(
			path.join(schemasDir, "data.schema.json"),
			JSON.stringify({
				type: "object",
				required: ["value"],
				properties: { value: { type: "number" } },
			}),
		);

		// Create valid initial file
		const blockPath = path.join(wfDir, "data.json");
		fs.writeFileSync(blockPath, JSON.stringify({ value: 42 }));

		const before = snapshotBlockFiles(tmpDir);

		// Modify the file to be invalid (need to ensure mtime changes)
		// Use a tiny delay or touch the file
		const newContent = JSON.stringify({ value: "not a number" });
		// Force mtime change by writing with a slight delay
		const origMtime = fs.statSync(blockPath).mtimeMs;
		fs.writeFileSync(blockPath, newContent);
		// If mtime didn't change (same millisecond), force it
		const newMtime = fs.statSync(blockPath).mtimeMs;
		if (newMtime === origMtime) {
			fs.utimesSync(blockPath, new Date(), new Date(Date.now() + 1000));
		}

		assert.throws(
			() => validateChangedBlocks(tmpDir, before),
			(err: unknown) => err instanceof Error && err.message.includes("Block validation failed"),
		);

		fs.rmSync(tmpDir, { recursive: true });
	});
});

// ── Integration tests: block validation in workflow executor ──

describe("post-step block validation in executor", () => {
	it("step that does not modify .project/ passes normally", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bv-exec-"));
		const spec: WorkflowSpec = {
			name: "bv-no-change",
			description: "step without block changes",
			steps: {
				compute: {
					transform: { mapping: { result: 42 } },
				},
			},
			source: "project",
			filePath: path.join(tmpDir, "test.project.yaml"),
		};

		const result = await executeWorkflow(
			spec,
			{},
			{
				ctx: mockCtx(tmpDir),
				pi: mockPi(),
				loadAgent: () => ({ name: "default" }),
			},
		);

		assert.strictEqual(result.status, "completed");
		assert.strictEqual(result.steps.compute.status, "completed");

		fs.rmSync(tmpDir, { recursive: true });
	});

	it("step that writes valid data to a .project/ block passes", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bv-exec-"));
		const wfDir = path.join(tmpDir, ".project");
		const schemasDir = path.join(wfDir, "schemas");
		fs.mkdirSync(schemasDir, { recursive: true });

		// Create schema
		fs.writeFileSync(
			path.join(schemasDir, "result.schema.json"),
			JSON.stringify({
				type: "object",
				required: ["status"],
				properties: { status: { type: "string" } },
			}),
		);

		// Use a command step that writes a valid block file
		const spec: WorkflowSpec = {
			name: "bv-valid-write",
			description: "step writes valid block",
			steps: {
				writeBlock: {
					command: `echo '{"status": "ok"}' > ${path.join(wfDir, "result.json")}`,
				},
			},
			source: "project",
			filePath: path.join(tmpDir, "test.project.yaml"),
		};

		const result = await executeWorkflow(
			spec,
			{},
			{
				ctx: mockCtx(tmpDir),
				pi: mockPi(),
				loadAgent: () => ({ name: "default" }),
			},
		);

		assert.strictEqual(result.status, "completed");
		assert.strictEqual(result.steps.writeBlock.status, "completed");

		fs.rmSync(tmpDir, { recursive: true });
	});

	it("step that writes invalid data to a .project/ block fails", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bv-exec-"));
		const wfDir = path.join(tmpDir, ".project");
		const schemasDir = path.join(wfDir, "schemas");
		fs.mkdirSync(schemasDir, { recursive: true });

		// Create schema requiring status as string
		fs.writeFileSync(
			path.join(schemasDir, "result.schema.json"),
			JSON.stringify({
				type: "object",
				required: ["status"],
				properties: { status: { type: "string" } },
			}),
		);

		// Command step writes invalid data (status is number, not string)
		const spec: WorkflowSpec = {
			name: "bv-invalid-write",
			description: "step writes invalid block",
			steps: {
				writeBlock: {
					command: `echo '{"status": 123}' > ${path.join(wfDir, "result.json")}`,
				},
				shouldNotRun: {
					transform: { mapping: { ran: true } },
				},
			},
			source: "project",
			filePath: path.join(tmpDir, "test.project.yaml"),
		};

		const result = await executeWorkflow(
			spec,
			{},
			{
				ctx: mockCtx(tmpDir),
				pi: mockPi(),
				loadAgent: () => ({ name: "default" }),
			},
		);

		assert.strictEqual(result.status, "failed");
		assert.strictEqual(result.steps.writeBlock.status, "failed");
		assert.ok(result.steps.writeBlock.error?.includes("Block validation failed"));
		// Fail-fast: next step should not run
		assert.ok(!result.steps.shouldNotRun);

		fs.rmSync(tmpDir, { recursive: true });
	});

	it("changed .project/ file with no matching schema is skipped", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bv-exec-"));
		const wfDir = path.join(tmpDir, ".project");
		fs.mkdirSync(wfDir, { recursive: true });
		// No schemas directory at all

		// Command writes a JSON file with no schema
		const spec: WorkflowSpec = {
			name: "bv-no-schema",
			description: "step writes block with no schema",
			steps: {
				writeBlock: {
					command: `echo '{"anything": "goes"}' > ${path.join(wfDir, "custom.json")}`,
				},
			},
			source: "project",
			filePath: path.join(tmpDir, "test.project.yaml"),
		};

		const result = await executeWorkflow(
			spec,
			{},
			{
				ctx: mockCtx(tmpDir),
				pi: mockPi(),
				loadAgent: () => ({ name: "default" }),
			},
		);

		assert.strictEqual(result.status, "completed");
		assert.strictEqual(result.steps.writeBlock.status, "completed");

		fs.rmSync(tmpDir, { recursive: true });
	});

	it("validates multiple changed block files in one step", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bv-exec-"));
		const wfDir = path.join(tmpDir, ".project");
		const schemasDir = path.join(wfDir, "schemas");
		fs.mkdirSync(schemasDir, { recursive: true });

		// Schema for file-a: requires name as string
		fs.writeFileSync(
			path.join(schemasDir, "file-a.schema.json"),
			JSON.stringify({
				type: "object",
				required: ["name"],
				properties: { name: { type: "string" } },
			}),
		);
		// Schema for file-b: requires count as number
		fs.writeFileSync(
			path.join(schemasDir, "file-b.schema.json"),
			JSON.stringify({
				type: "object",
				required: ["count"],
				properties: { count: { type: "number" } },
			}),
		);

		// Write valid file-a, invalid file-b
		const cmd = [
			`echo '{"name": "ok"}' > ${path.join(wfDir, "file-a.json")}`,
			`echo '{"count": "not-a-number"}' > ${path.join(wfDir, "file-b.json")}`,
		].join(" && ");

		const spec: WorkflowSpec = {
			name: "bv-multi",
			description: "step writes multiple blocks",
			steps: {
				writeBlocks: { command: cmd },
			},
			source: "project",
			filePath: path.join(tmpDir, "test.project.yaml"),
		};

		const result = await executeWorkflow(
			spec,
			{},
			{
				ctx: mockCtx(tmpDir),
				pi: mockPi(),
				loadAgent: () => ({ name: "default" }),
			},
		);

		assert.strictEqual(result.status, "failed");
		assert.strictEqual(result.steps.writeBlocks.status, "failed");
		assert.ok(result.steps.writeBlocks.error?.includes("file-b.json"));

		fs.rmSync(tmpDir, { recursive: true });
	});
});
