/**
 * Tests for the block step executor.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { executeBlock } from "./step-block.js";

let tmpDir: string;

beforeEach(() => {
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "block-step-test-"));
	// Create .project structure
	const projectDir = path.join(tmpDir, ".project");
	const schemasDir = path.join(projectDir, "schemas");
	const phasesDir = path.join(projectDir, "phases");
	fs.mkdirSync(schemasDir, { recursive: true });
	fs.mkdirSync(phasesDir, { recursive: true });

	// Write a gaps block
	fs.writeFileSync(
		path.join(projectDir, "gaps.json"),
		JSON.stringify({ gaps: [{ id: "g1", status: "open", description: "test gap" }] }, null, 2),
	);

	// Write an architecture block
	fs.writeFileSync(path.join(projectDir, "architecture.json"), JSON.stringify({ modules: ["core"] }, null, 2));

	// Write phase files
	fs.writeFileSync(
		path.join(phasesDir, "01-foundation.json"),
		JSON.stringify({ number: 1, name: "foundation" }, null, 2),
	);
	fs.writeFileSync(path.join(phasesDir, "02-features.json"), JSON.stringify({ number: 2, name: "features" }, null, 2));

	// Write a minimal schema for gaps
	fs.writeFileSync(
		path.join(schemasDir, "gaps.schema.json"),
		JSON.stringify({
			type: "object",
			required: ["gaps"],
			properties: { gaps: { type: "array" } },
		}),
	);

	// Write a minimal schema for phase
	fs.writeFileSync(
		path.join(schemasDir, "phase.schema.json"),
		JSON.stringify({
			type: "object",
			required: ["number", "name"],
			properties: { number: { type: "number" }, name: { type: "string" } },
		}),
	);
});

afterEach(() => {
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

const emptyScope: Record<string, unknown> = { input: {}, steps: {} };

describe("block step: read", () => {
	it("reads a single block", () => {
		const result = executeBlock({ read: "gaps" }, "load", emptyScope, tmpDir);
		assert.equal(result.status, "completed");
		const output = result.output as { gaps: unknown[] };
		assert.equal(output.gaps.length, 1);
		assert.equal((output.gaps[0] as { id: string }).id, "g1");
	});

	it("reads multiple blocks", () => {
		const result = executeBlock({ read: ["gaps", "architecture"] }, "load", emptyScope, tmpDir);
		assert.equal(result.status, "completed");
		const output = result.output as Record<string, unknown>;
		assert.ok(output.gaps);
		assert.ok(output.architecture);
	});

	it("fails on missing required block", () => {
		const result = executeBlock({ read: ["gaps", "nonexistent"] }, "load", emptyScope, tmpDir);
		assert.equal(result.status, "failed");
		assert.ok(result.error?.includes("nonexistent"));
	});

	it("returns null for optional missing block", () => {
		const result = executeBlock(
			{ read: ["gaps", "nonexistent"], optional: ["nonexistent"] },
			"load",
			emptyScope,
			tmpDir,
		);
		assert.equal(result.status, "completed");
		const output = result.output as Record<string, unknown>;
		assert.ok(output.gaps);
		assert.equal(output.nonexistent, null);
	});

	it("fails on missing single required block", () => {
		const result = executeBlock({ read: "nonexistent" }, "load", emptyScope, tmpDir);
		assert.equal(result.status, "failed");
		assert.ok(result.error?.includes("nonexistent"));
	});
});

describe("block step: readDir", () => {
	it("reads directory entries sorted", () => {
		const result = executeBlock({ readDir: "phases" }, "load-phases", emptyScope, tmpDir);
		assert.equal(result.status, "completed");
		const output = result.output as { number: number; name: string }[];
		assert.equal(output.length, 2);
		assert.equal(output[0].number, 1);
		assert.equal(output[1].number, 2);
	});

	it("returns empty array for missing directory", () => {
		const result = executeBlock({ readDir: "nonexistent" }, "load", emptyScope, tmpDir);
		assert.equal(result.status, "completed");
		assert.deepEqual(result.output, []);
	});

	it("fails on corrupt JSON in existing directory", () => {
		fs.writeFileSync(path.join(tmpDir, ".project", "phases", "03-corrupt.json"), "not json{");
		const result = executeBlock({ readDir: "phases" }, "load", emptyScope, tmpDir);
		assert.equal(result.status, "failed");
		assert.ok(result.error?.includes("Invalid JSON"));
		assert.ok(result.error?.includes("03-corrupt.json"));
	});

	it("returns empty array for empty directory", () => {
		const emptyDir = path.join(tmpDir, ".project", "empty");
		fs.mkdirSync(emptyDir, { recursive: true });
		const result = executeBlock({ readDir: "empty" }, "load", emptyScope, tmpDir);
		assert.equal(result.status, "completed");
		assert.deepEqual(result.output, []);
	});
});

describe("block step: write", () => {
	it("writes a block with schema validation", () => {
		const data = { gaps: [{ id: "g2", status: "open", description: "new" }] };
		const result = executeBlock({ write: { name: "gaps", data } }, "save", emptyScope, tmpDir);
		assert.equal(result.status, "completed");
		const written = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "gaps.json"), "utf-8"));
		assert.equal(written.gaps[0].id, "g2");
	});

	it("fails on schema violation", () => {
		const data = { not_gaps: "invalid" };
		const result = executeBlock({ write: { name: "gaps", data } }, "save", emptyScope, tmpDir);
		assert.equal(result.status, "failed");
		assert.ok(result.error);
	});

	it("writes to subdirectory path", () => {
		const data = { number: 3, name: "cleanup" };
		const result = executeBlock(
			{ write: { name: "phase", data, path: "phases/03-cleanup" } },
			"save",
			emptyScope,
			tmpDir,
		);
		assert.equal(result.status, "completed");
		const written = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "phases", "03-cleanup.json"), "utf-8"));
		assert.equal(written.number, 3);
	});
});

describe("block step: append", () => {
	it("appends to block array", () => {
		const item = { id: "g2", status: "open", description: "appended" };
		const result = executeBlock({ append: { name: "gaps", key: "gaps", item } }, "add", emptyScope, tmpDir);
		assert.equal(result.status, "completed");
		const data = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "gaps.json"), "utf-8"));
		assert.equal(data.gaps.length, 2);
		assert.equal(data.gaps[1].id, "g2");
	});

	it("fails on nonexistent block", () => {
		const result = executeBlock({ append: { name: "nonexistent", key: "items", item: {} } }, "add", emptyScope, tmpDir);
		assert.equal(result.status, "failed");
	});
});

describe("block step: update", () => {
	it("updates item in block array", () => {
		const result = executeBlock(
			{ update: { name: "gaps", key: "gaps", match: { id: "g1" }, set: { status: "resolved" } } },
			"fix",
			emptyScope,
			tmpDir,
		);
		assert.equal(result.status, "completed");
		const data = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "gaps.json"), "utf-8"));
		assert.equal(data.gaps[0].status, "resolved");
	});

	it("fails when no match", () => {
		const result = executeBlock(
			{ update: { name: "gaps", key: "gaps", match: { id: "nonexistent" }, set: { status: "resolved" } } },
			"fix",
			emptyScope,
			tmpDir,
		);
		assert.equal(result.status, "failed");
	});
});

describe("block step: expression resolution", () => {
	it("resolves expressions in read block name", () => {
		const scope = { input: { blockName: "gaps" }, steps: {} };
		const result = executeBlock({ read: "${{ input.blockName }}" as unknown as string }, "load", scope, tmpDir);
		assert.equal(result.status, "completed");
		assert.ok(result.output);
	});

	it("resolves expressions in write data", () => {
		const scope = {
			input: {},
			steps: { prev: { output: { gaps: [{ id: "new", status: "open", description: "from expr" }] } } },
		};
		const result = executeBlock(
			{ write: { name: "gaps", data: "${{ steps.prev.output }}" as unknown } },
			"save",
			scope,
			tmpDir,
		);
		assert.equal(result.status, "completed");
	});
});
