import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
	appendToBlock,
	appendToNestedArray,
	appendToNestedTypedFile,
	appendToTypedFile,
	nextId,
	readBlock,
	readBlockDir,
	removeFromBlock,
	removeFromNestedArray,
	removeFromNestedTypedFile,
	removeFromTypedFile,
	resolveBlockItemSchema,
	updateItemInBlock,
	updateItemInTypedFile,
	updateNestedArrayItem,
	updateNestedItemInTypedFile,
	upsertItemInBlock,
	upsertItemInTypedFile,
	writeBlock,
	writeTypedFile,
} from "./block-api.js";
import { writeBootstrapPointer } from "./context-dir.js";
import type { DispatchContext } from "./dispatch-context.js";
import { ValidationError } from "./schema-validator.js";

function makeTmpDir(prefix: string): string {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), `block-api-${prefix}-`));
	writeBootstrapPointer(cwd, ".project");
	return cwd;
}

function setupWorkflowDir(tmpDir: string): string {
	const wfDir = path.join(tmpDir, ".project");
	fs.mkdirSync(wfDir, { recursive: true });
	return wfDir;
}

function setupSchema(tmpDir: string, blockName: string, schema: Record<string, unknown>): void {
	const schemasDir = path.join(tmpDir, ".project", "schemas");
	fs.mkdirSync(schemasDir, { recursive: true });
	fs.writeFileSync(path.join(schemasDir, `${blockName}.schema.json`), JSON.stringify(schema, null, 2));
}

const gapsSchema = {
	type: "object",
	required: ["gaps"],
	properties: {
		gaps: {
			type: "array",
			items: {
				type: "object",
				required: ["id", "description", "status"],
				properties: {
					id: { type: "string" },
					description: { type: "string" },
					status: { type: "string", enum: ["open", "resolved", "deferred"] },
				},
			},
		},
	},
};

describe("readBlock", () => {
	it("reads and parses valid JSON block", (t) => {
		const tmpDir = makeTmpDir("read-valid");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		const wfDir = setupWorkflowDir(tmpDir);

		const data = { gaps: [{ id: "g1", description: "test", status: "open" }] };
		fs.writeFileSync(path.join(wfDir, "gaps.json"), JSON.stringify(data));

		const result = readBlock(tmpDir, "gaps");
		assert.deepStrictEqual(result, data);
	});

	it("throws when block file does not exist", (t) => {
		const tmpDir = makeTmpDir("read-missing");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);

		assert.throws(
			() => readBlock(tmpDir, "nonexistent"),
			(err: unknown) => {
				assert.ok(err instanceof Error);
				assert.ok(err.message.includes("not found"));
				return true;
			},
		);
	});

	it("throws when .project/ dir does not exist", (t) => {
		const tmpDir = makeTmpDir("read-nodir");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		assert.throws(
			() => readBlock(tmpDir, "gaps"),
			(err: unknown) => {
				assert.ok(err instanceof Error);
				assert.ok(err.message.includes("not found"));
				return true;
			},
		);
	});

	it("throws on invalid JSON", (t) => {
		const tmpDir = makeTmpDir("read-badjson");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		const wfDir = setupWorkflowDir(tmpDir);

		fs.writeFileSync(path.join(wfDir, "bad.json"), "not json{{");

		assert.throws(
			() => readBlock(tmpDir, "bad"),
			(err: unknown) => {
				assert.ok(err instanceof Error);
				assert.ok(err.message.includes("Invalid JSON"));
				return true;
			},
		);
	});

	it("reads block with no corresponding schema", (t) => {
		const tmpDir = makeTmpDir("read-noschema");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		const wfDir = setupWorkflowDir(tmpDir);

		const data = { default: "claude-sonnet-4-20250514" };
		fs.writeFileSync(path.join(wfDir, "model-config.json"), JSON.stringify(data));

		const result = readBlock(tmpDir, "model-config");
		assert.deepStrictEqual(result, data);
	});

	it("reads non-array-wrapper blocks", (t) => {
		const tmpDir = makeTmpDir("read-flat");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		const wfDir = setupWorkflowDir(tmpDir);

		const data = { current_phase: 5, test_count: 100 };
		fs.writeFileSync(path.join(wfDir, "state.json"), JSON.stringify(data));

		const result = readBlock(tmpDir, "state");
		assert.deepStrictEqual(result, data);
	});
});

describe("writeBlock", () => {
	it("writes valid data with schema validation", (t) => {
		const tmpDir = makeTmpDir("write-valid");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);
		setupSchema(tmpDir, "gaps", gapsSchema);

		const data = { gaps: [{ id: "g1", description: "test", status: "open" }] };
		writeBlock(tmpDir, "gaps", data);

		const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "gaps.json"), "utf-8"));
		assert.deepStrictEqual(onDisk, data);
	});

	it("throws ValidationError on schema violation — file NOT created", (t) => {
		const tmpDir = makeTmpDir("write-invalid");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);
		setupSchema(tmpDir, "gaps", gapsSchema);

		const badData = { gaps: [{ id: 123, description: "test" }] }; // id should be string, missing status

		assert.throws(
			() => writeBlock(tmpDir, "gaps", badData),
			(err: unknown) => {
				assert.ok(err instanceof ValidationError);
				return true;
			},
		);

		assert.ok(!fs.existsSync(path.join(tmpDir, ".project", "gaps.json")));
	});

	it("writes without validation when no schema exists", (t) => {
		const tmpDir = makeTmpDir("write-noschema");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);

		const data = { anything: "goes" };
		writeBlock(tmpDir, "custom", data);

		const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "custom.json"), "utf-8"));
		assert.deepStrictEqual(onDisk, data);
	});

	it("creates .project/ dir if missing", (t) => {
		const tmpDir = makeTmpDir("write-mkdir");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const data = { test: true };
		writeBlock(tmpDir, "new-block", data);

		assert.ok(fs.existsSync(path.join(tmpDir, ".project", "new-block.json")));
	});

	it("no tmp file remains after successful write", (t) => {
		const tmpDir = makeTmpDir("write-notmp");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);

		writeBlock(tmpDir, "clean", { data: true });

		const wfDir = path.join(tmpDir, ".project");
		const files = fs.readdirSync(wfDir);
		const tmpFiles = files.filter((f) => f.includes(".tmp"));
		assert.strictEqual(tmpFiles.length, 0);
	});

	it("no tmp file or data file on validation failure", (t) => {
		const tmpDir = makeTmpDir("write-cleanfail");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);
		setupSchema(tmpDir, "gaps", gapsSchema);

		try {
			writeBlock(tmpDir, "gaps", { gaps: "not an array" });
		} catch {
			/* expected */
		}

		const wfDir = path.join(tmpDir, ".project");
		const files = fs.readdirSync(wfDir);
		assert.ok(!files.includes("gaps.json"));
		const tmpFiles = files.filter((f) => f.includes(".tmp"));
		assert.strictEqual(tmpFiles.length, 0);
	});

	it("overwrites existing block file", (t) => {
		const tmpDir = makeTmpDir("write-overwrite");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);

		writeBlock(tmpDir, "data", { version: 1 });
		writeBlock(tmpDir, "data", { version: 2 });

		const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "data.json"), "utf-8"));
		assert.strictEqual(onDisk.version, 2);
	});

	it("preserves 2-space JSON indent", (t) => {
		const tmpDir = makeTmpDir("write-indent");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);

		writeBlock(tmpDir, "fmt", { key: "value" });

		const raw = fs.readFileSync(path.join(tmpDir, ".project", "fmt.json"), "utf-8");
		assert.ok(raw.includes('  "key"'));
	});
});

describe("appendToBlock", () => {
	it("appends item to existing array", (t) => {
		const tmpDir = makeTmpDir("append-existing");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);
		setupSchema(tmpDir, "gaps", gapsSchema);

		const initial = { gaps: [{ id: "g1", description: "first", status: "open" }] };
		fs.writeFileSync(path.join(tmpDir, ".project", "gaps.json"), JSON.stringify(initial));

		appendToBlock(tmpDir, "gaps", "gaps", { id: "g2", description: "second", status: "open" });

		const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "gaps.json"), "utf-8"));
		assert.strictEqual(onDisk.gaps.length, 2);
		assert.strictEqual(onDisk.gaps[1].id, "g2");
	});

	it("appends to empty array", (t) => {
		const tmpDir = makeTmpDir("append-empty");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);
		setupSchema(tmpDir, "gaps", gapsSchema);

		fs.writeFileSync(path.join(tmpDir, ".project", "gaps.json"), JSON.stringify({ gaps: [] }));

		appendToBlock(tmpDir, "gaps", "gaps", { id: "g1", description: "first", status: "open" });

		const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "gaps.json"), "utf-8"));
		assert.strictEqual(onDisk.gaps.length, 1);
	});

	it("throws ValidationError on invalid item — original file unchanged", (t) => {
		const tmpDir = makeTmpDir("append-invalid");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);
		setupSchema(tmpDir, "gaps", gapsSchema);

		const original = { gaps: [{ id: "g1", description: "valid", status: "open" }] };
		const originalStr = JSON.stringify(original);
		fs.writeFileSync(path.join(tmpDir, ".project", "gaps.json"), originalStr);

		assert.throws(
			() => appendToBlock(tmpDir, "gaps", "gaps", { id: 999, description: "bad" }), // missing status, bad id type
			(err: unknown) => {
				assert.ok(err instanceof ValidationError);
				return true;
			},
		);

		const afterStr = fs.readFileSync(path.join(tmpDir, ".project", "gaps.json"), "utf-8");
		assert.strictEqual(afterStr, originalStr);
	});

	it("throws when block file does not exist", (t) => {
		const tmpDir = makeTmpDir("append-nofile");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);

		assert.throws(
			() => appendToBlock(tmpDir, "missing", "items", { id: "x" }),
			(err: unknown) => {
				assert.ok(err instanceof Error);
				assert.ok(err.message.includes("not found"));
				return true;
			},
		);
	});

	it("throws when arrayKey does not exist in data", (t) => {
		const tmpDir = makeTmpDir("append-nokey");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);

		fs.writeFileSync(path.join(tmpDir, ".project", "gaps.json"), JSON.stringify({ gaps: [] }));

		assert.throws(
			() => appendToBlock(tmpDir, "gaps", "decisions", { id: "d1" }),
			(err: unknown) => {
				assert.ok(err instanceof Error);
				assert.ok(err.message.includes("has no key"));
				return true;
			},
		);
	});

	it("throws when arrayKey is not an array", (t) => {
		const tmpDir = makeTmpDir("append-notarray");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);

		fs.writeFileSync(path.join(tmpDir, ".project", "data.json"), JSON.stringify({ items: "string" }));

		assert.throws(
			() => appendToBlock(tmpDir, "data", "items", { id: "x" }),
			(err: unknown) => {
				assert.ok(err instanceof Error);
				assert.ok(err.message.includes("not an array"));
				return true;
			},
		);
	});

	it("does not mutate file on validation failure", (t) => {
		const tmpDir = makeTmpDir("append-nomutate");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);
		setupSchema(tmpDir, "gaps", gapsSchema);

		const original = { gaps: [{ id: "g1", description: "safe", status: "open" }] };
		fs.writeFileSync(path.join(tmpDir, ".project", "gaps.json"), JSON.stringify(original, null, 2));

		try {
			appendToBlock(tmpDir, "gaps", "gaps", { broken: true });
		} catch {
			/* expected */
		}

		const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "gaps.json"), "utf-8"));
		assert.strictEqual(onDisk.gaps.length, 1);
		assert.strictEqual(onDisk.gaps[0].id, "g1");
	});

	it("appends to block without schema", (t) => {
		const tmpDir = makeTmpDir("append-noschema");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);

		fs.writeFileSync(path.join(tmpDir, ".project", "custom.json"), JSON.stringify({ items: [1] }));

		appendToBlock(tmpDir, "custom", "items", 2);

		const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "custom.json"), "utf-8"));
		assert.deepStrictEqual(onDisk.items, [1, 2]);
	});

	it("sequential appends — both items present", (t) => {
		const tmpDir = makeTmpDir("append-seq");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);

		fs.writeFileSync(path.join(tmpDir, ".project", "list.json"), JSON.stringify({ items: [] }));

		appendToBlock(tmpDir, "list", "items", "first");
		appendToBlock(tmpDir, "list", "items", "second");

		const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "list.json"), "utf-8"));
		assert.deepStrictEqual(onDisk.items, ["first", "second"]);
	});
});

describe("updateItemInBlock", () => {
	it("updates matching item fields", (t) => {
		const tmpDir = makeTmpDir("update-match");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);
		setupSchema(tmpDir, "gaps", gapsSchema);

		const initial = { gaps: [{ id: "g1", description: "test", status: "open" }] };
		fs.writeFileSync(path.join(tmpDir, ".project", "gaps.json"), JSON.stringify(initial));

		updateItemInBlock(tmpDir, "gaps", "gaps", (g) => g.id === "g1", { status: "resolved", resolved_by: "test" });

		const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "gaps.json"), "utf-8"));
		assert.strictEqual(onDisk.gaps[0].status, "resolved");
		assert.strictEqual(onDisk.gaps[0].resolved_by, "test");
		assert.strictEqual(onDisk.gaps[0].id, "g1"); // unchanged
	});

	it("throws when no item matches predicate", (t) => {
		const tmpDir = makeTmpDir("update-nomatch");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);

		fs.writeFileSync(path.join(tmpDir, ".project", "gaps.json"), JSON.stringify({ gaps: [{ id: "g1" }] }));

		assert.throws(
			() => updateItemInBlock(tmpDir, "gaps", "gaps", (g) => g.id === "nonexistent", { status: "resolved" }),
			(err: unknown) => {
				assert.ok(err instanceof Error);
				assert.ok(err.message.includes("No matching item"));
				return true;
			},
		);
	});

	it("throws ValidationError when update produces invalid data — original unchanged", (t) => {
		const tmpDir = makeTmpDir("update-invalid");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);
		setupSchema(tmpDir, "gaps", gapsSchema);

		const original = { gaps: [{ id: "g1", description: "test", status: "open" }] };
		const originalStr = JSON.stringify(original);
		fs.writeFileSync(path.join(tmpDir, ".project", "gaps.json"), originalStr);

		assert.throws(
			() => updateItemInBlock(tmpDir, "gaps", "gaps", (g) => g.id === "g1", { status: "invalid-status" }),
			(err: unknown) => {
				assert.ok(err instanceof ValidationError);
				return true;
			},
		);

		// Original file unchanged
		const afterStr = fs.readFileSync(path.join(tmpDir, ".project", "gaps.json"), "utf-8");
		assert.strictEqual(afterStr, originalStr);
	});

	it("preserves other items in array", (t) => {
		const tmpDir = makeTmpDir("update-preserve");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);

		const initial = {
			items: [
				{ id: "a", val: 1 },
				{ id: "b", val: 2 },
				{ id: "c", val: 3 },
			],
		};
		fs.writeFileSync(path.join(tmpDir, ".project", "data.json"), JSON.stringify(initial));

		updateItemInBlock(tmpDir, "data", "items", (i) => i.id === "b", { val: 99 });

		const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "data.json"), "utf-8"));
		assert.strictEqual(onDisk.items[0].val, 1);
		assert.strictEqual(onDisk.items[1].val, 99);
		assert.strictEqual(onDisk.items[2].val, 3);
	});

	it("shallow merge — new field added, existing field overwritten", (t) => {
		const tmpDir = makeTmpDir("update-merge");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);

		fs.writeFileSync(
			path.join(tmpDir, ".project", "data.json"),
			JSON.stringify({
				items: [{ id: "x", existing: "old", keep: "this" }],
			}),
		);

		updateItemInBlock(tmpDir, "data", "items", (i) => i.id === "x", { existing: "new", added: "field" });

		const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "data.json"), "utf-8"));
		assert.strictEqual(onDisk.items[0].existing, "new");
		assert.strictEqual(onDisk.items[0].added, "field");
		assert.strictEqual(onDisk.items[0].keep, "this");
	});

	it("works on block without schema", (t) => {
		const tmpDir = makeTmpDir("update-noschema");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);

		fs.writeFileSync(path.join(tmpDir, ".project", "custom.json"), JSON.stringify({ items: [{ id: "a", v: 1 }] }));

		updateItemInBlock(tmpDir, "custom", "items", (i) => i.id === "a", { v: 2 });

		const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "custom.json"), "utf-8"));
		assert.strictEqual(onDisk.items[0].v, 2);
	});
});

// Schema modeling spec-reviews shape: parent items keyed by `id`, each with a
// `findings` array. Used to exercise appendToNestedArray's parent-find +
// nested-array-grow path. Matches REVIEW-001's structural use case.
const reviewsSchema = {
	type: "object",
	required: ["reviews"],
	properties: {
		reviews: {
			type: "array",
			items: {
				type: "object",
				required: ["id", "findings"],
				properties: {
					id: { type: "string" },
					findings: {
						type: "array",
						items: {
							type: "object",
							required: ["id", "description", "severity"],
							properties: {
								id: { type: "string" },
								description: { type: "string" },
								severity: { type: "string", enum: ["info", "warning", "error"] },
							},
						},
					},
				},
			},
		},
	},
};

describe("appendToNestedArray", () => {
	it("happy path — appends to nested findings array on matched parent", (t) => {
		const tmpDir = makeTmpDir("nested-happy");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);
		setupSchema(tmpDir, "spec-reviews", reviewsSchema);

		const initial = {
			reviews: [{ id: "REVIEW-001", findings: [] }],
		};
		fs.writeFileSync(path.join(tmpDir, ".project", "spec-reviews.json"), JSON.stringify(initial));

		appendToNestedArray(tmpDir, "spec-reviews", "reviews", (item) => item.id === "REVIEW-001", "findings", {
			id: "F-001",
			description: "first finding",
			severity: "info",
		});

		const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "spec-reviews.json"), "utf-8"));
		assert.strictEqual(onDisk.reviews[0].findings.length, 1);
		assert.strictEqual(onDisk.reviews[0].findings[0].id, "F-001");
	});

	it("throws when block file does not exist", (t) => {
		const tmpDir = makeTmpDir("nested-nofile");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);

		assert.throws(
			() =>
				appendToNestedArray(tmpDir, "missing", "reviews", (i) => i.id === "x", "findings", {
					id: "f",
					description: "d",
					severity: "info",
				}),
			(err: unknown) => {
				assert.ok(err instanceof Error);
				assert.ok(err.message.includes("not found"));
				return true;
			},
		);
	});

	it("throws when parent array key is missing", (t) => {
		const tmpDir = makeTmpDir("nested-nokey");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);

		fs.writeFileSync(path.join(tmpDir, ".project", "spec-reviews.json"), JSON.stringify({ other: [] }));

		assert.throws(
			() =>
				appendToNestedArray(tmpDir, "spec-reviews", "reviews", (i) => i.id === "x", "findings", {
					id: "f",
					description: "d",
					severity: "info",
				}),
			(err: unknown) => {
				assert.ok(err instanceof Error);
				assert.ok(err.message.includes("has no key"));
				assert.ok(err.message.includes("reviews"));
				return true;
			},
		);
	});

	it("throws when parent array key is not an array", (t) => {
		const tmpDir = makeTmpDir("nested-notarray");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);

		fs.writeFileSync(path.join(tmpDir, ".project", "spec-reviews.json"), JSON.stringify({ reviews: "not-an-array" }));

		assert.throws(
			() =>
				appendToNestedArray(tmpDir, "spec-reviews", "reviews", (i) => i.id === "x", "findings", {
					id: "f",
					description: "d",
					severity: "info",
				}),
			(err: unknown) => {
				assert.ok(err instanceof Error);
				assert.ok(err.message.includes("not an array"));
				return true;
			},
		);
	});

	it("throws when no parent item matches predicate", (t) => {
		const tmpDir = makeTmpDir("nested-nomatch");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);

		fs.writeFileSync(
			path.join(tmpDir, ".project", "spec-reviews.json"),
			JSON.stringify({ reviews: [{ id: "OTHER", findings: [] }] }),
		);

		assert.throws(
			() =>
				appendToNestedArray(tmpDir, "spec-reviews", "reviews", (i) => i.id === "REVIEW-001", "findings", {
					id: "f",
					description: "d",
					severity: "info",
				}),
			(err: unknown) => {
				assert.ok(err instanceof Error);
				assert.ok(err.message.includes("No matching item"));
				assert.ok(err.message.includes("spec-reviews"));
				assert.ok(err.message.includes("reviews"));
				return true;
			},
		);
	});

	it("throws when matched parent has no nested key", (t) => {
		const tmpDir = makeTmpDir("nested-no-nested-key");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);

		fs.writeFileSync(
			path.join(tmpDir, ".project", "spec-reviews.json"),
			JSON.stringify({ reviews: [{ id: "REVIEW-001" }] }),
		);

		assert.throws(
			() =>
				appendToNestedArray(tmpDir, "spec-reviews", "reviews", (i) => i.id === "REVIEW-001", "findings", {
					id: "f",
					description: "d",
					severity: "info",
				}),
			(err: unknown) => {
				assert.ok(err instanceof Error);
				assert.ok(err.message.includes("no nested key"));
				assert.ok(err.message.includes("findings"));
				return true;
			},
		);
	});

	it("throws when matched parent's nested key is not an array", (t) => {
		const tmpDir = makeTmpDir("nested-nested-notarray");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);

		fs.writeFileSync(
			path.join(tmpDir, ".project", "spec-reviews.json"),
			JSON.stringify({ reviews: [{ id: "REVIEW-001", findings: "wrong" }] }),
		);

		assert.throws(
			() =>
				appendToNestedArray(tmpDir, "spec-reviews", "reviews", (i) => i.id === "REVIEW-001", "findings", {
					id: "f",
					description: "d",
					severity: "info",
				}),
			(err: unknown) => {
				assert.ok(err instanceof Error);
				assert.ok(err.message.includes("nested key"));
				assert.ok(err.message.includes("not an array"));
				return true;
			},
		);
	});

	it("throws ValidationError on schema-violating finding — original file unchanged", (t) => {
		const tmpDir = makeTmpDir("nested-invalid-item");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);
		setupSchema(tmpDir, "spec-reviews", reviewsSchema);

		const original = { reviews: [{ id: "REVIEW-001", findings: [] }] };
		const originalStr = JSON.stringify(original);
		fs.writeFileSync(path.join(tmpDir, ".project", "spec-reviews.json"), originalStr);

		assert.throws(
			() =>
				appendToNestedArray(
					tmpDir,
					"spec-reviews",
					"reviews",
					(i) => i.id === "REVIEW-001",
					"findings",
					// Missing `severity`, wrong types — must fail AJV validation
					{ id: 999, description: "missing-severity" },
				),
			(err: unknown) => {
				assert.ok(err instanceof ValidationError);
				return true;
			},
		);

		const afterStr = fs.readFileSync(path.join(tmpDir, ".project", "spec-reviews.json"), "utf-8");
		assert.strictEqual(afterStr, originalStr);
	});

	it("atomic semantics — writeBlock failure leaves file byte-identical", (t) => {
		// Force-failure mechanism: stub fs.renameSync (used by writeBlock's
		// atomic tmp-rename step) to throw. Restored in t.after. This avoids
		// chmod tricks that are unreliable on macOS/CI tmpdirs.
		const tmpDir = makeTmpDir("nested-atomic");
		const origRenameSync = fs.renameSync;
		t.after(() => {
			fs.renameSync = origRenameSync;
			fs.rmSync(tmpDir, { recursive: true, force: true });
		});
		setupWorkflowDir(tmpDir);
		setupSchema(tmpDir, "spec-reviews", reviewsSchema);

		const original = { reviews: [{ id: "REVIEW-001", findings: [] }] };
		const originalStr = JSON.stringify(original, null, 2);
		fs.writeFileSync(path.join(tmpDir, ".project", "spec-reviews.json"), originalStr);

		fs.renameSync = ((..._args: unknown[]) => {
			throw new Error("simulated rename failure");
		}) as typeof fs.renameSync;

		assert.throws(
			() =>
				appendToNestedArray(tmpDir, "spec-reviews", "reviews", (i) => i.id === "REVIEW-001", "findings", {
					id: "F-001",
					description: "ok",
					severity: "info",
				}),
			(err: unknown) => {
				assert.ok(err instanceof Error);
				assert.ok(err.message.includes("Failed to write"));
				return true;
			},
		);

		const afterStr = fs.readFileSync(path.join(tmpDir, ".project", "spec-reviews.json"), "utf-8");
		assert.strictEqual(afterStr, originalStr);
	});

	it("multi-match — warns via console.error and updates only first parent", (t) => {
		const tmpDir = makeTmpDir("nested-multi");
		const origConsoleError = console.error;
		const errs: string[] = [];
		console.error = (...args: unknown[]) => {
			errs.push(args.map(String).join(" "));
		};
		t.after(() => {
			console.error = origConsoleError;
			fs.rmSync(tmpDir, { recursive: true, force: true });
		});
		setupWorkflowDir(tmpDir);

		// Two parents both satisfy predicate (no schema — exercise warning path
		// without imposing schema constraints on duplicate ids).
		fs.writeFileSync(
			path.join(tmpDir, ".project", "dups.json"),
			JSON.stringify({
				reviews: [
					{ id: "DUP", findings: [] },
					{ id: "DUP", findings: [] },
				],
			}),
		);

		appendToNestedArray(tmpDir, "dups", "reviews", (i) => i.id === "DUP", "findings", { id: "F-only-first" });

		const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "dups.json"), "utf-8"));
		assert.strictEqual(onDisk.reviews[0].findings.length, 1);
		assert.strictEqual(onDisk.reviews[1].findings.length, 0);
		assert.ok(errs.some((s) => s.includes("appendToNestedArray") && s.includes("2 items matched")));
	});
});

// Schema for nested update/remove tests — same shape as reviewsSchema above
// but with nested item enum constraints to allow schema-violation testing.
const reviewsWithStateSchema = {
	type: "object",
	required: ["reviews"],
	properties: {
		reviews: {
			type: "array",
			items: {
				type: "object",
				required: ["id", "findings"],
				properties: {
					id: { type: "string" },
					findings: {
						type: "array",
						items: {
							type: "object",
							required: ["id", "state"],
							properties: {
								id: { type: "string" },
								state: { type: "string", enum: ["open", "triaged", "resolved"] },
							},
						},
					},
				},
			},
		},
	},
};

describe("updateNestedArrayItem", () => {
	it("happy path — updates matched nested item; siblings untouched", (t) => {
		const tmpDir = makeTmpDir("upd-nested-happy");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);
		setupSchema(tmpDir, "spec-reviews", reviewsWithStateSchema);

		const initial = {
			reviews: [
				{
					id: "REVIEW-001",
					findings: [
						{ id: "F-001", state: "open" },
						{ id: "F-002", state: "open" },
					],
				},
			],
		};
		fs.writeFileSync(path.join(tmpDir, ".project", "spec-reviews.json"), JSON.stringify(initial));

		updateNestedArrayItem(
			tmpDir,
			"spec-reviews",
			"reviews",
			(p) => p.id === "REVIEW-001",
			"findings",
			(f) => f.id === "F-001",
			{ state: "resolved" },
		);

		const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "spec-reviews.json"), "utf-8"));
		assert.strictEqual(onDisk.reviews[0].findings[0].state, "resolved");
		assert.strictEqual(onDisk.reviews[0].findings[1].state, "open");
	});

	it("throws when block file does not exist", (t) => {
		const tmpDir = makeTmpDir("upd-nested-nofile");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);

		assert.throws(
			() =>
				updateNestedArrayItem(
					tmpDir,
					"missing",
					"reviews",
					(p) => p.id === "x",
					"findings",
					(f) => f.id === "y",
					{ state: "resolved" },
				),
			(err: unknown) => {
				assert.ok(err instanceof Error);
				assert.ok(err.message.includes("not found"));
				return true;
			},
		);
	});

	it("throws when parent array key is missing", (t) => {
		const tmpDir = makeTmpDir("upd-nested-no-parent-key");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);

		fs.writeFileSync(path.join(tmpDir, ".project", "spec-reviews.json"), JSON.stringify({ other: [] }));

		assert.throws(
			() =>
				updateNestedArrayItem(
					tmpDir,
					"spec-reviews",
					"reviews",
					(p) => p.id === "x",
					"findings",
					(f) => f.id === "y",
					{ state: "resolved" },
				),
			(err: unknown) => {
				assert.ok(err instanceof Error);
				assert.ok(err.message.includes("has no key"));
				return true;
			},
		);
	});

	it("throws when parent array key is not an array", (t) => {
		const tmpDir = makeTmpDir("upd-nested-parent-notarr");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);

		fs.writeFileSync(path.join(tmpDir, ".project", "spec-reviews.json"), JSON.stringify({ reviews: "notanarray" }));

		assert.throws(
			() =>
				updateNestedArrayItem(
					tmpDir,
					"spec-reviews",
					"reviews",
					(p) => p.id === "x",
					"findings",
					(f) => f.id === "y",
					{ state: "resolved" },
				),
			(err: unknown) => {
				assert.ok(err instanceof Error);
				assert.ok(err.message.includes("not an array"));
				return true;
			},
		);
	});

	it("throws when no parent matches", (t) => {
		const tmpDir = makeTmpDir("upd-nested-no-parent");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);

		fs.writeFileSync(
			path.join(tmpDir, ".project", "spec-reviews.json"),
			JSON.stringify({ reviews: [{ id: "OTHER", findings: [] }] }),
		);

		assert.throws(
			() =>
				updateNestedArrayItem(
					tmpDir,
					"spec-reviews",
					"reviews",
					(p) => p.id === "REVIEW-001",
					"findings",
					(f) => f.id === "any",
					{ state: "resolved" },
				),
			(err: unknown) => {
				assert.ok(err instanceof Error);
				assert.ok(err.message.includes("No matching item"));
				return true;
			},
		);
	});

	it("throws when matched parent missing nestedKey", (t) => {
		const tmpDir = makeTmpDir("upd-nested-no-nested-key");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);

		fs.writeFileSync(
			path.join(tmpDir, ".project", "spec-reviews.json"),
			JSON.stringify({ reviews: [{ id: "REVIEW-001" }] }),
		);

		assert.throws(
			() =>
				updateNestedArrayItem(
					tmpDir,
					"spec-reviews",
					"reviews",
					(p) => p.id === "REVIEW-001",
					"findings",
					(f) => f.id === "x",
					{ state: "resolved" },
				),
			(err: unknown) => {
				assert.ok(err instanceof Error);
				assert.ok(err.message.includes("no nested key"));
				return true;
			},
		);
	});

	it("throws when matched parent's nested key is not an array", (t) => {
		const tmpDir = makeTmpDir("upd-nested-nested-notarr");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);

		fs.writeFileSync(
			path.join(tmpDir, ".project", "spec-reviews.json"),
			JSON.stringify({ reviews: [{ id: "REVIEW-001", findings: "wrong" }] }),
		);

		assert.throws(
			() =>
				updateNestedArrayItem(
					tmpDir,
					"spec-reviews",
					"reviews",
					(p) => p.id === "REVIEW-001",
					"findings",
					(f) => f.id === "x",
					{ state: "resolved" },
				),
			(err: unknown) => {
				assert.ok(err instanceof Error);
				assert.ok(err.message.includes("nested key"));
				assert.ok(err.message.includes("not an array"));
				return true;
			},
		);
	});

	it("throws when no nested item matches", (t) => {
		const tmpDir = makeTmpDir("upd-nested-no-nested");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);

		fs.writeFileSync(
			path.join(tmpDir, ".project", "spec-reviews.json"),
			JSON.stringify({ reviews: [{ id: "REVIEW-001", findings: [{ id: "F-001", state: "open" }] }] }),
		);

		assert.throws(
			() =>
				updateNestedArrayItem(
					tmpDir,
					"spec-reviews",
					"reviews",
					(p) => p.id === "REVIEW-001",
					"findings",
					(f) => f.id === "F-999",
					{ state: "resolved" },
				),
			(err: unknown) => {
				assert.ok(err instanceof Error);
				assert.ok(err.message.includes("No matching nested item"));
				return true;
			},
		);
	});

	it("throws ValidationError on schema-violating update — original unchanged", (t) => {
		const tmpDir = makeTmpDir("upd-nested-invalid");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);
		setupSchema(tmpDir, "spec-reviews", reviewsWithStateSchema);

		const original = {
			reviews: [{ id: "REVIEW-001", findings: [{ id: "F-001", state: "open" }] }],
		};
		const originalStr = JSON.stringify(original);
		fs.writeFileSync(path.join(tmpDir, ".project", "spec-reviews.json"), originalStr);

		assert.throws(
			() =>
				updateNestedArrayItem(
					tmpDir,
					"spec-reviews",
					"reviews",
					(p) => p.id === "REVIEW-001",
					"findings",
					(f) => f.id === "F-001",
					{ state: "not-a-valid-state" },
				),
			(err: unknown) => {
				assert.ok(err instanceof ValidationError);
				return true;
			},
		);

		const afterStr = fs.readFileSync(path.join(tmpDir, ".project", "spec-reviews.json"), "utf-8");
		assert.strictEqual(afterStr, originalStr);
	});

	it("multi-match warnings at parent and nested levels", (t) => {
		const tmpDir = makeTmpDir("upd-nested-multi");
		const origConsoleError = console.error;
		const errs: string[] = [];
		console.error = (...args: unknown[]) => {
			errs.push(args.map(String).join(" "));
		};
		t.after(() => {
			console.error = origConsoleError;
			fs.rmSync(tmpDir, { recursive: true, force: true });
		});
		setupWorkflowDir(tmpDir);

		fs.writeFileSync(
			path.join(tmpDir, ".project", "dups.json"),
			JSON.stringify({
				reviews: [
					{
						id: "DUP",
						findings: [
							{ id: "F-DUP", state: "open" },
							{ id: "F-DUP", state: "open" },
						],
					},
					{ id: "DUP", findings: [] },
				],
			}),
		);

		updateNestedArrayItem(
			tmpDir,
			"dups",
			"reviews",
			(p) => p.id === "DUP",
			"findings",
			(f) => f.id === "F-DUP",
			{ state: "resolved" },
		);

		const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "dups.json"), "utf-8"));
		assert.strictEqual(onDisk.reviews[0].findings[0].state, "resolved");
		assert.strictEqual(onDisk.reviews[0].findings[1].state, "open");
		assert.ok(errs.some((s) => s.includes("updateNestedArrayItem") && s.includes("2 parent")));
		assert.ok(errs.some((s) => s.includes("updateNestedArrayItem") && s.includes("2 nested")));
	});
});

describe("removeFromBlock", () => {
	it("happy path — single match removed", (t) => {
		const tmpDir = makeTmpDir("rm-single");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);
		setupSchema(tmpDir, "gaps", gapsSchema);

		fs.writeFileSync(
			path.join(tmpDir, ".project", "gaps.json"),
			JSON.stringify({
				gaps: [
					{ id: "g1", description: "keep", status: "open" },
					{ id: "g2", description: "drop", status: "open" },
				],
			}),
		);

		const result = removeFromBlock(tmpDir, "gaps", "gaps", (g) => g.id === "g2");
		assert.deepStrictEqual(result, { removed: 1 });

		const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "gaps.json"), "utf-8"));
		assert.strictEqual(onDisk.gaps.length, 1);
		assert.strictEqual(onDisk.gaps[0].id, "g1");
	});

	it("happy path — multi-match all removed", (t) => {
		const tmpDir = makeTmpDir("rm-multi");
		const origConsoleError = console.error;
		const errs: string[] = [];
		console.error = (...args: unknown[]) => {
			errs.push(args.map(String).join(" "));
		};
		t.after(() => {
			console.error = origConsoleError;
			fs.rmSync(tmpDir, { recursive: true, force: true });
		});
		setupWorkflowDir(tmpDir);

		fs.writeFileSync(
			path.join(tmpDir, ".project", "items.json"),
			JSON.stringify({
				items: [
					{ id: "a", drop: true },
					{ id: "b", drop: true },
					{ id: "c", drop: false },
				],
			}),
		);

		const result = removeFromBlock(tmpDir, "items", "items", (i) => i.drop === true);
		assert.deepStrictEqual(result, { removed: 2 });

		const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "items.json"), "utf-8"));
		assert.strictEqual(onDisk.items.length, 1);
		assert.strictEqual(onDisk.items[0].id, "c");
		assert.ok(errs.some((s) => s.includes("removeFromBlock") && s.includes("2 items")));
	});

	it("no match — returns { removed: 0 } without throw, file unchanged", (t) => {
		const tmpDir = makeTmpDir("rm-nomatch");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);

		const original = { items: [{ id: "a" }] };
		const originalStr = JSON.stringify(original);
		fs.writeFileSync(path.join(tmpDir, ".project", "items.json"), originalStr);

		const result = removeFromBlock(tmpDir, "items", "items", (i) => i.id === "nonexistent");
		assert.deepStrictEqual(result, { removed: 0 });

		const afterStr = fs.readFileSync(path.join(tmpDir, ".project", "items.json"), "utf-8");
		assert.strictEqual(afterStr, originalStr);
	});

	it("throws when block file does not exist", (t) => {
		const tmpDir = makeTmpDir("rm-nofile");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);

		assert.throws(
			() => removeFromBlock(tmpDir, "missing", "items", () => true),
			(err: unknown) => {
				assert.ok(err instanceof Error);
				assert.ok(err.message.includes("not found"));
				return true;
			},
		);
	});

	it("throws when arrayKey is missing", (t) => {
		const tmpDir = makeTmpDir("rm-nokey");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);

		fs.writeFileSync(path.join(tmpDir, ".project", "data.json"), JSON.stringify({ other: [] }));

		assert.throws(
			() => removeFromBlock(tmpDir, "data", "items", () => true),
			(err: unknown) => {
				assert.ok(err instanceof Error);
				assert.ok(err.message.includes("has no key"));
				return true;
			},
		);
	});

	it("throws when arrayKey is not an array", (t) => {
		const tmpDir = makeTmpDir("rm-notarr");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);

		fs.writeFileSync(path.join(tmpDir, ".project", "data.json"), JSON.stringify({ items: "wrong" }));

		assert.throws(
			() => removeFromBlock(tmpDir, "data", "items", () => true),
			(err: unknown) => {
				assert.ok(err instanceof Error);
				assert.ok(err.message.includes("not an array"));
				return true;
			},
		);
	});

	it("throws ValidationError when removal violates schema (minItems)", (t) => {
		const tmpDir = makeTmpDir("rm-minitems");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);
		// Schema requires at least one entry in items
		setupSchema(tmpDir, "data", {
			type: "object",
			required: ["items"],
			properties: {
				items: { type: "array", minItems: 1, items: { type: "object" } },
			},
		});

		const original = { items: [{ id: "only" }] };
		const originalStr = JSON.stringify(original);
		fs.writeFileSync(path.join(tmpDir, ".project", "data.json"), originalStr);

		assert.throws(
			() => removeFromBlock(tmpDir, "data", "items", (i) => i.id === "only"),
			(err: unknown) => {
				assert.ok(err instanceof ValidationError);
				return true;
			},
		);

		const afterStr = fs.readFileSync(path.join(tmpDir, ".project", "data.json"), "utf-8");
		assert.strictEqual(afterStr, originalStr);
	});
});

describe("removeFromNestedArray", () => {
	it("happy path — removes matching nested items", (t) => {
		const tmpDir = makeTmpDir("rmn-happy");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);
		setupSchema(tmpDir, "spec-reviews", reviewsWithStateSchema);

		fs.writeFileSync(
			path.join(tmpDir, ".project", "spec-reviews.json"),
			JSON.stringify({
				reviews: [
					{
						id: "REVIEW-001",
						findings: [
							{ id: "F-001", state: "open" },
							{ id: "F-002", state: "open" },
							{ id: "F-003", state: "resolved" },
						],
					},
				],
			}),
		);

		const result = removeFromNestedArray(
			tmpDir,
			"spec-reviews",
			"reviews",
			(p) => p.id === "REVIEW-001",
			"findings",
			(f) => f.state === "open",
		);
		assert.deepStrictEqual(result, { removed: 2 });

		const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "spec-reviews.json"), "utf-8"));
		assert.strictEqual(onDisk.reviews[0].findings.length, 1);
		assert.strictEqual(onDisk.reviews[0].findings[0].id, "F-003");
	});

	it("throws when no parent matches", (t) => {
		const tmpDir = makeTmpDir("rmn-no-parent");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);

		fs.writeFileSync(
			path.join(tmpDir, ".project", "spec-reviews.json"),
			JSON.stringify({ reviews: [{ id: "OTHER", findings: [] }] }),
		);

		assert.throws(
			() =>
				removeFromNestedArray(
					tmpDir,
					"spec-reviews",
					"reviews",
					(p) => p.id === "REVIEW-001",
					"findings",
					() => true,
				),
			(err: unknown) => {
				assert.ok(err instanceof Error);
				assert.ok(err.message.includes("No matching item"));
				return true;
			},
		);
	});

	it("no nested match — returns { removed: 0 } without throw, file unchanged", (t) => {
		const tmpDir = makeTmpDir("rmn-no-nested");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);

		const original = { reviews: [{ id: "REVIEW-001", findings: [{ id: "F-001", state: "open" }] }] };
		const originalStr = JSON.stringify(original);
		fs.writeFileSync(path.join(tmpDir, ".project", "spec-reviews.json"), originalStr);

		const result = removeFromNestedArray(
			tmpDir,
			"spec-reviews",
			"reviews",
			(p) => p.id === "REVIEW-001",
			"findings",
			(f) => f.id === "F-999",
		);
		assert.deepStrictEqual(result, { removed: 0 });

		const afterStr = fs.readFileSync(path.join(tmpDir, ".project", "spec-reviews.json"), "utf-8");
		assert.strictEqual(afterStr, originalStr);
	});

	it("throws when block file does not exist", (t) => {
		const tmpDir = makeTmpDir("rmn-nofile");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);

		assert.throws(
			() =>
				removeFromNestedArray(
					tmpDir,
					"missing",
					"reviews",
					() => true,
					"findings",
					() => true,
				),
			(err: unknown) => {
				assert.ok(err instanceof Error);
				assert.ok(err.message.includes("not found"));
				return true;
			},
		);
	});

	it("throws when matched parent has no nestedKey", (t) => {
		const tmpDir = makeTmpDir("rmn-no-nested-key");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);

		fs.writeFileSync(
			path.join(tmpDir, ".project", "spec-reviews.json"),
			JSON.stringify({ reviews: [{ id: "REVIEW-001" }] }),
		);

		assert.throws(
			() =>
				removeFromNestedArray(
					tmpDir,
					"spec-reviews",
					"reviews",
					(p) => p.id === "REVIEW-001",
					"findings",
					() => true,
				),
			(err: unknown) => {
				assert.ok(err instanceof Error);
				assert.ok(err.message.includes("no nested key"));
				return true;
			},
		);
	});

	it("throws ValidationError when removal violates schema (nested minItems)", (t) => {
		const tmpDir = makeTmpDir("rmn-minitems");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);
		setupSchema(tmpDir, "spec-reviews", {
			type: "object",
			required: ["reviews"],
			properties: {
				reviews: {
					type: "array",
					items: {
						type: "object",
						required: ["id", "findings"],
						properties: {
							id: { type: "string" },
							findings: {
								type: "array",
								minItems: 1,
								items: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
							},
						},
					},
				},
			},
		});

		const original = { reviews: [{ id: "REVIEW-001", findings: [{ id: "only" }] }] };
		const originalStr = JSON.stringify(original);
		fs.writeFileSync(path.join(tmpDir, ".project", "spec-reviews.json"), originalStr);

		assert.throws(
			() =>
				removeFromNestedArray(
					tmpDir,
					"spec-reviews",
					"reviews",
					(p) => p.id === "REVIEW-001",
					"findings",
					(f) => f.id === "only",
				),
			(err: unknown) => {
				assert.ok(err instanceof ValidationError);
				return true;
			},
		);

		const afterStr = fs.readFileSync(path.join(tmpDir, ".project", "spec-reviews.json"), "utf-8");
		assert.strictEqual(afterStr, originalStr);
	});
});

describe("readBlockDir", () => {
	it("reads sorted JSON files from a subdirectory", (t) => {
		const tmpDir = makeTmpDir("rdir-happy");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		const wfDir = setupWorkflowDir(tmpDir);
		// readBlockDir is a generic subdirectory reader; use a neutral subdir name
		// (phases are an ordinary array-block since DEC-0028, no longer a subdir).
		const itemsDir = path.join(wfDir, "items");
		fs.mkdirSync(itemsDir);
		fs.writeFileSync(path.join(itemsDir, "02-second.json"), JSON.stringify({ n: 2 }));
		fs.writeFileSync(path.join(itemsDir, "01-first.json"), JSON.stringify({ n: 1 }));
		// Non-JSON files should be ignored
		fs.writeFileSync(path.join(itemsDir, "notes.txt"), "ignored");

		const result = readBlockDir(tmpDir, "items") as Array<{ n: number }>;
		assert.strictEqual(result.length, 2);
		assert.strictEqual(result[0].n, 1);
		assert.strictEqual(result[1].n, 2);
	});

	it("returns [] for missing directory", (t) => {
		const tmpDir = makeTmpDir("rdir-missing");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);

		const result = readBlockDir(tmpDir, "nonexistent");
		assert.deepStrictEqual(result, []);
	});

	it("throws on invalid JSON within an existing directory", (t) => {
		const tmpDir = makeTmpDir("rdir-badjson");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		const wfDir = setupWorkflowDir(tmpDir);
		const dir = path.join(wfDir, "broken");
		fs.mkdirSync(dir);
		fs.writeFileSync(path.join(dir, "bad.json"), "not json{");

		assert.throws(
			() => readBlockDir(tmpDir, "broken"),
			(err: unknown) => {
				assert.ok(err instanceof Error);
				assert.ok(err.message.includes("Invalid JSON"));
				assert.ok(err.message.includes("bad.json"));
				return true;
			},
		);
	});

	it("returns [] (no throw) when no .pi-context.json pointer exists", (t) => {
		// Raw mkdtempSync WITHOUT writeBootstrapPointer (unlike makeTmpDir) — so the
		// cwd has no .pi-context.json. readBlockDir is a READ reached pointer-less (the
		// read-dir Pi tool + workflow readDir step); it must degrade to [] rather than
		// hard-throw BootstrapNotFoundError (consistent with missing-dir → []).
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "block-api-rdir-nopointer-"));
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		let result: unknown[] | undefined;
		assert.doesNotThrow(() => {
			result = readBlockDir(tmpDir, "phases");
		});
		assert.deepStrictEqual(result, []);
	});
});

// ── DispatchContext coverage (FGAP-004) ─────────────────────────────────────

// Schema variant of gapsSchema that DOES declare per-item author fields.
// Used to verify ctx-stamping populates the fields when the schema permits.
const gapsAuthoredSchema = {
	type: "object",
	required: ["gaps"],
	properties: {
		gaps: {
			type: "array",
			items: {
				type: "object",
				required: ["id", "description", "status"],
				properties: {
					id: { type: "string" },
					description: { type: "string" },
					status: { type: "string", enum: ["open", "resolved", "deferred"] },
					created_by: { type: "string" },
					created_at: { type: "string" },
					modified_by: { type: "string" },
					modified_at: { type: "string" },
				},
			},
		},
	},
};

const ctxAgent: DispatchContext = {
	writer: { kind: "agent", agent_id: "claude-opus-4-7" },
};

describe("DispatchContext — ctx-omitted path is byte-identical to pre-step-3 surface", () => {
	it("appendToBlock without ctx leaves item untouched (no created_by injected)", (t) => {
		const tmpDir = makeTmpDir("ctx-omitted-append");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);
		setupSchema(tmpDir, "gaps", gapsAuthoredSchema);

		fs.writeFileSync(path.join(tmpDir, ".project", "gaps.json"), JSON.stringify({ gaps: [] }));

		appendToBlock(tmpDir, "gaps", "gaps", { id: "g1", description: "noctx", status: "open" });

		const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "gaps.json"), "utf-8"));
		assert.strictEqual(onDisk.gaps[0].id, "g1");
		assert.strictEqual(onDisk.gaps[0].created_by, undefined);
		assert.strictEqual(onDisk.gaps[0].modified_by, undefined);
	});

	it("updateItemInBlock without ctx does not refresh modified_by", (t) => {
		const tmpDir = makeTmpDir("ctx-omitted-update");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);
		setupSchema(tmpDir, "gaps", gapsAuthoredSchema);

		fs.writeFileSync(
			path.join(tmpDir, ".project", "gaps.json"),
			JSON.stringify({
				gaps: [
					{
						id: "g1",
						description: "x",
						status: "open",
						created_by: "human/legacy",
						modified_by: "human/legacy",
					},
				],
			}),
		);

		updateItemInBlock(tmpDir, "gaps", "gaps", (g) => g.id === "g1", { status: "resolved" });

		const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "gaps.json"), "utf-8"));
		assert.strictEqual(onDisk.gaps[0].status, "resolved");
		// modified_by/_at fields keep their pre-existing values when ctx is omitted
		assert.strictEqual(onDisk.gaps[0].modified_by, "human/legacy");
	});
});

describe("DispatchContext — ctx-provided path stamps when schema declares author fields", () => {
	it("appendToBlock stamps created_by + modified_by on a fresh item", (t) => {
		const tmpDir = makeTmpDir("ctx-append-authored");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);
		setupSchema(tmpDir, "gaps", gapsAuthoredSchema);

		fs.writeFileSync(path.join(tmpDir, ".project", "gaps.json"), JSON.stringify({ gaps: [] }));

		appendToBlock(tmpDir, "gaps", "gaps", { id: "g1", description: "stamped", status: "open" }, ctxAgent);

		const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "gaps.json"), "utf-8"));
		assert.strictEqual(onDisk.gaps[0].created_by, "agent/claude-opus-4-7");
		assert.strictEqual(onDisk.gaps[0].modified_by, "agent/claude-opus-4-7");
		assert.ok(typeof onDisk.gaps[0].created_at === "string");
		assert.ok(typeof onDisk.gaps[0].modified_at === "string");
	});

	it("updateItemInBlock refreshes modified_by, preserves created_by", (t) => {
		const tmpDir = makeTmpDir("ctx-update-authored");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);
		setupSchema(tmpDir, "gaps", gapsAuthoredSchema);

		fs.writeFileSync(
			path.join(tmpDir, ".project", "gaps.json"),
			JSON.stringify({
				gaps: [
					{
						id: "g1",
						description: "x",
						status: "open",
						created_by: "human/legacy",
						created_at: "2025-01-01T00:00:00.000Z",
						modified_by: "human/legacy",
						modified_at: "2025-01-01T00:00:00.000Z",
					},
				],
			}),
		);

		updateItemInBlock(tmpDir, "gaps", "gaps", (g) => g.id === "g1", { status: "resolved" }, ctxAgent);

		const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "gaps.json"), "utf-8"));
		assert.strictEqual(onDisk.gaps[0].status, "resolved");
		assert.strictEqual(onDisk.gaps[0].created_by, "human/legacy"); // preserved
		assert.strictEqual(onDisk.gaps[0].created_at, "2025-01-01T00:00:00.000Z"); // preserved
		assert.strictEqual(onDisk.gaps[0].modified_by, "agent/claude-opus-4-7"); // refreshed
		assert.notStrictEqual(onDisk.gaps[0].modified_at, "2025-01-01T00:00:00.000Z");
	});

	it("appendToNestedArray stamps the nested item when nested-item schema declares author fields", (t) => {
		const tmpDir = makeTmpDir("ctx-nested-authored");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);
		setupSchema(tmpDir, "spec-reviews", {
			type: "object",
			required: ["reviews"],
			properties: {
				reviews: {
					type: "array",
					items: {
						type: "object",
						required: ["id", "findings"],
						properties: {
							id: { type: "string" },
							findings: {
								type: "array",
								items: {
									type: "object",
									required: ["id", "description"],
									properties: {
										id: { type: "string" },
										description: { type: "string" },
										created_by: { type: "string" },
										created_at: { type: "string" },
										modified_by: { type: "string" },
										modified_at: { type: "string" },
									},
								},
							},
						},
					},
				},
			},
		});

		fs.writeFileSync(
			path.join(tmpDir, ".project", "spec-reviews.json"),
			JSON.stringify({ reviews: [{ id: "REVIEW-001", findings: [] }] }),
		);

		appendToNestedArray(
			tmpDir,
			"spec-reviews",
			"reviews",
			(r) => r.id === "REVIEW-001",
			"findings",
			{ id: "F-001", description: "stamped finding" },
			ctxAgent,
		);

		const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "spec-reviews.json"), "utf-8"));
		const finding = onDisk.reviews[0].findings[0];
		assert.strictEqual(finding.created_by, "agent/claude-opus-4-7");
		assert.strictEqual(finding.modified_by, "agent/claude-opus-4-7");
	});

	it("updateNestedArrayItem refreshes modified_*, preserves created_*", (t) => {
		const tmpDir = makeTmpDir("ctx-update-nested-authored");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);
		setupSchema(tmpDir, "spec-reviews", {
			type: "object",
			required: ["reviews"],
			properties: {
				reviews: {
					type: "array",
					items: {
						type: "object",
						required: ["id", "findings"],
						properties: {
							id: { type: "string" },
							findings: {
								type: "array",
								items: {
									type: "object",
									required: ["id", "state"],
									properties: {
										id: { type: "string" },
										state: { type: "string", enum: ["open", "resolved"] },
										created_by: { type: "string" },
										created_at: { type: "string" },
										modified_by: { type: "string" },
										modified_at: { type: "string" },
									},
								},
							},
						},
					},
				},
			},
		});

		fs.writeFileSync(
			path.join(tmpDir, ".project", "spec-reviews.json"),
			JSON.stringify({
				reviews: [
					{
						id: "REVIEW-001",
						findings: [
							{
								id: "F-001",
								state: "open",
								created_by: "human/legacy",
								created_at: "2025-01-01T00:00:00.000Z",
								modified_by: "human/legacy",
								modified_at: "2025-01-01T00:00:00.000Z",
							},
						],
					},
				],
			}),
		);

		updateNestedArrayItem(
			tmpDir,
			"spec-reviews",
			"reviews",
			(p) => p.id === "REVIEW-001",
			"findings",
			(f) => f.id === "F-001",
			{ state: "resolved" },
			ctxAgent,
		);

		const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "spec-reviews.json"), "utf-8"));
		const f = onDisk.reviews[0].findings[0];
		assert.strictEqual(f.state, "resolved");
		assert.strictEqual(f.created_by, "human/legacy");
		assert.strictEqual(f.created_at, "2025-01-01T00:00:00.000Z");
		assert.strictEqual(f.modified_by, "agent/claude-opus-4-7");
		assert.notStrictEqual(f.modified_at, "2025-01-01T00:00:00.000Z");
	});

	it("writeBlock stamps top-level envelope when schema declares author fields at top level", (t) => {
		const tmpDir = makeTmpDir("ctx-write-toplevel");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);
		setupSchema(tmpDir, "manifest", {
			type: "object",
			required: ["title"],
			properties: {
				title: { type: "string" },
				created_by: { type: "string" },
				created_at: { type: "string" },
				modified_by: { type: "string" },
				modified_at: { type: "string" },
			},
		});

		writeBlock(tmpDir, "manifest", { title: "demo" }, ctxAgent);

		const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "manifest.json"), "utf-8"));
		assert.strictEqual(onDisk.title, "demo");
		assert.strictEqual(onDisk.created_by, "agent/claude-opus-4-7");
		assert.strictEqual(onDisk.modified_by, "agent/claude-opus-4-7");
	});
});

describe("DispatchContext — schemas without author fields skip stamping (no AJV failure)", () => {
	it("appendToBlock with ctx + additionalProperties:false schema does not inject author fields", (t) => {
		const tmpDir = makeTmpDir("ctx-noauthor-strict");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);
		setupSchema(tmpDir, "items", {
			type: "object",
			required: ["items"],
			properties: {
				items: {
					type: "array",
					items: {
						type: "object",
						required: ["id"],
						properties: { id: { type: "string" } },
						additionalProperties: false,
					},
				},
			},
		});

		fs.writeFileSync(path.join(tmpDir, ".project", "items.json"), JSON.stringify({ items: [] }));

		// Should NOT throw — stamping is skipped for schemas that don't declare author fields
		appendToBlock(tmpDir, "items", "items", { id: "x" }, ctxAgent);

		const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "items.json"), "utf-8"));
		assert.strictEqual(onDisk.items[0].id, "x");
		assert.strictEqual(onDisk.items[0].created_by, undefined);
		assert.strictEqual(onDisk.items[0].modified_by, undefined);
	});

	it("appendToBlock with ctx + no schema at all skips stamping silently", (t) => {
		const tmpDir = makeTmpDir("ctx-noschema");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);

		fs.writeFileSync(path.join(tmpDir, ".project", "freeform.json"), JSON.stringify({ items: [] }));

		appendToBlock(tmpDir, "freeform", "items", { id: "y" }, ctxAgent);

		const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "freeform.json"), "utf-8"));
		assert.strictEqual(onDisk.items[0].id, "y");
		assert.strictEqual(onDisk.items[0].created_by, undefined);
	});

	it("removeFromBlock accepts ctx for signature parity (no stamping side effects)", (t) => {
		const tmpDir = makeTmpDir("ctx-remove-parity");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);

		fs.writeFileSync(path.join(tmpDir, ".project", "data.json"), JSON.stringify({ items: [{ id: "a" }, { id: "b" }] }));

		const result = removeFromBlock(tmpDir, "data", "items", (i) => i.id === "a", ctxAgent);
		assert.deepStrictEqual(result, { removed: 1 });

		const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "data.json"), "utf-8"));
		assert.strictEqual(onDisk.items.length, 1);
	});

	it("removeFromNestedArray accepts ctx for signature parity", (t) => {
		const tmpDir = makeTmpDir("ctx-remove-nested-parity");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);

		fs.writeFileSync(
			path.join(tmpDir, ".project", "spec-reviews.json"),
			JSON.stringify({
				reviews: [{ id: "R", findings: [{ id: "F-1" }, { id: "F-2" }] }],
			}),
		);

		const result = removeFromNestedArray(
			tmpDir,
			"spec-reviews",
			"reviews",
			(p) => p.id === "R",
			"findings",
			(f) => f.id === "F-1",
			ctxAgent,
		);
		assert.deepStrictEqual(result, { removed: 1 });
	});
});

// FGAP-017 regression: schemas may declare a SUBSET of the four author
// fields. The framework-gaps.schema.json shape (item declares `created_by`
// only, with `additionalProperties: false`) was the empirical trigger that
// surfaced the original bug — `stampItem` injected all four fields, and
// AJV rejected the write with "must NOT have additional properties
// (modified_by)". This test mirrors that schema shape so any future
// regression that re-introduces unconditional stamping fails here loudly.
describe("DispatchContext — partial author-field declaration with additionalProperties:false (FGAP-017)", () => {
	it("appendToBlock with ctx + schema declaring `created_by` only writes only created_by", (t) => {
		const tmpDir = makeTmpDir("ctx-partial-created-by-only");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);
		// Mirrors framework-gaps.schema.json's per-item shape: created_by
		// declared, the other three author fields NOT declared, and
		// additionalProperties:false at item level. The pre-fix all-or-
		// nothing decision said "schema declares ANY author field, so stamp
		// all four" — which AJV then rejected.
		setupSchema(tmpDir, "framework-gaps", {
			type: "object",
			required: ["gaps"],
			properties: {
				gaps: {
					type: "array",
					items: {
						type: "object",
						required: ["id", "description", "status"],
						properties: {
							id: { type: "string" },
							description: { type: "string" },
							status: { type: "string", enum: ["open", "resolved", "deferred"] },
							created_by: { type: "string" },
						},
						additionalProperties: false,
					},
				},
			},
		});

		fs.writeFileSync(path.join(tmpDir, ".project", "framework-gaps.json"), JSON.stringify({ gaps: [] }));

		// Must not throw. Pre-fix this raised:
		//   ValidationError: ... /gaps/0: must NOT have additional properties (modified_by)
		appendToBlock(
			tmpDir,
			"framework-gaps",
			"gaps",
			{ id: "FGAP-017", description: "regression-test entry", status: "open" },
			ctxAgent,
		);

		const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "framework-gaps.json"), "utf-8"));
		assert.strictEqual(onDisk.gaps[0].id, "FGAP-017");
		// created_by stamped from ctx writer — the one declared author field
		assert.strictEqual(onDisk.gaps[0].created_by, "agent/claude-opus-4-7");
		// The three undeclared fields must be absent from the written item
		assert.strictEqual(Object.hasOwn(onDisk.gaps[0], "created_at"), false);
		assert.strictEqual(Object.hasOwn(onDisk.gaps[0], "modified_by"), false);
		assert.strictEqual(Object.hasOwn(onDisk.gaps[0], "modified_at"), false);
	});
});

describe("upsertItemInBlock", () => {
	it("appends new item when idField value is not present in array", (t) => {
		const tmpDir = makeTmpDir("upsert-append-new");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);
		setupSchema(tmpDir, "gaps", gapsSchema);

		fs.writeFileSync(
			path.join(tmpDir, ".project", "gaps.json"),
			JSON.stringify({ gaps: [{ id: "g1", description: "existing", status: "open" }] }),
		);

		const result = upsertItemInBlock(
			tmpDir,
			"gaps",
			"gaps",
			{ id: "g2", description: "new entry", status: "open" },
			"id",
		);

		assert.deepStrictEqual(result, { mode: "appended" });
		const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "gaps.json"), "utf-8"));
		assert.strictEqual(onDisk.gaps.length, 2);
		assert.strictEqual(onDisk.gaps[0].id, "g1");
		assert.strictEqual(onDisk.gaps[1].id, "g2");
		assert.strictEqual(onDisk.gaps[1].description, "new entry");
	});

	it("replaces item at index when idField value matches existing", (t) => {
		const tmpDir = makeTmpDir("upsert-replace-existing");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);
		setupSchema(tmpDir, "gaps", gapsSchema);

		fs.writeFileSync(
			path.join(tmpDir, ".project", "gaps.json"),
			JSON.stringify({
				gaps: [
					{ id: "g1", description: "original first", status: "open" },
					{ id: "g2", description: "second", status: "open" },
				],
			}),
		);

		const result = upsertItemInBlock(
			tmpDir,
			"gaps",
			"gaps",
			{ id: "g1", description: "replaced first", status: "resolved" },
			"id",
		);

		assert.deepStrictEqual(result, { mode: "updated" });
		const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "gaps.json"), "utf-8"));
		assert.strictEqual(onDisk.gaps.length, 2); // no growth — replacement, not append
		assert.strictEqual(onDisk.gaps[0].id, "g1");
		// Replacement semantics: prior fields not in new item are GONE (not merged).
		assert.strictEqual(onDisk.gaps[0].description, "replaced first");
		assert.strictEqual(onDisk.gaps[0].status, "resolved");
		// Sibling at index 1 untouched
		assert.strictEqual(onDisk.gaps[1].id, "g2");
		assert.strictEqual(onDisk.gaps[1].description, "second");
	});

	it("throws when item[idField] is missing", (t) => {
		const tmpDir = makeTmpDir("upsert-missing-idfield");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);
		setupSchema(tmpDir, "gaps", gapsSchema);

		fs.writeFileSync(path.join(tmpDir, ".project", "gaps.json"), JSON.stringify({ gaps: [] }));

		assert.throws(
			() => upsertItemInBlock(tmpDir, "gaps", "gaps", { description: "no id present", status: "open" }, "id"),
			(err: unknown) => {
				assert.ok(err instanceof Error);
				assert.ok(err.message.includes("missing required idField 'id'"));
				return true;
			},
		);

		// File must be unchanged — defensive throw fires before any write
		const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "gaps.json"), "utf-8"));
		assert.deepStrictEqual(onDisk, { gaps: [] });
	});

	it("ctx-stamping: append uses create-mode (created_* + modified_*); update uses update-mode (only modified_* refreshed)", (t) => {
		const tmpDir = makeTmpDir("upsert-ctx-stamping");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);
		setupSchema(tmpDir, "gaps", gapsAuthoredSchema);

		fs.writeFileSync(path.join(tmpDir, ".project", "gaps.json"), JSON.stringify({ gaps: [] }));

		// First call: append -> create-mode stamps both created_* and modified_*
		const r1 = upsertItemInBlock(
			tmpDir,
			"gaps",
			"gaps",
			{ id: "g1", description: "first write", status: "open" },
			"id",
			ctxAgent,
		);
		assert.deepStrictEqual(r1, { mode: "appended" });

		const afterAppend = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "gaps.json"), "utf-8"));
		assert.strictEqual(afterAppend.gaps[0].created_by, "agent/claude-opus-4-7");
		assert.strictEqual(afterAppend.gaps[0].modified_by, "agent/claude-opus-4-7");
		assert.ok(typeof afterAppend.gaps[0].created_at === "string");
		const originalModifiedAt: string = afterAppend.gaps[0].modified_at;
		assert.ok(typeof originalModifiedAt === "string");

		// Wait long enough that ISO timestamp differs (≥1 ms guaranteed by busy loop)
		const start = Date.now();
		while (Date.now() === start) {
			/* spin */
		}

		// Second call with same id: update-mode stamps modified_* only; created_* preserved.
		// Replacement semantics replace the whole item, but stampItem in update-mode then
		// preserves prior created_by/created_at IF the supplied item lacks them — verified here.
		// To make the assertion meaningful, we re-supply the same item shape WITHOUT author fields.
		const r2 = upsertItemInBlock(
			tmpDir,
			"gaps",
			"gaps",
			{ id: "g1", description: "second write", status: "resolved" },
			"id",
			ctxAgent,
		);
		assert.deepStrictEqual(r2, { mode: "updated" });

		const afterUpdate = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "gaps.json"), "utf-8"));
		assert.strictEqual(afterUpdate.gaps[0].description, "second write");
		assert.strictEqual(afterUpdate.gaps[0].status, "resolved");
		// modified_* refreshed under update-mode stamping.
		assert.strictEqual(afterUpdate.gaps[0].modified_by, "agent/claude-opus-4-7");
		assert.notStrictEqual(afterUpdate.gaps[0].modified_at, originalModifiedAt);
		// FGAP-018 closure: upsert update-branch pre-merges declared create-time
		// attestation fields from the existing on-disk item when supplied item omits
		// them. created_* survives replacement; modified_* refreshes per update-mode.
		assert.strictEqual(afterUpdate.gaps[0].created_by, "agent/claude-opus-4-7");
		assert.strictEqual(afterUpdate.gaps[0].created_at, afterAppend.gaps[0].created_at);
	});

	it("FGAP-018: preserves created_* across multiple upsert updates when caller omits them", (t) => {
		const tmpDir = makeTmpDir("upsert-attestation-multi");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);
		setupSchema(tmpDir, "gaps", gapsAuthoredSchema);
		fs.writeFileSync(path.join(tmpDir, ".project", "gaps.json"), JSON.stringify({ gaps: [] }));

		upsertItemInBlock(tmpDir, "gaps", "gaps", { id: "g1", description: "v1", status: "open" }, "id", ctxAgent);
		const afterFirst = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "gaps.json"), "utf-8"));
		const originalCreatedBy = afterFirst.gaps[0].created_by;
		const originalCreatedAt = afterFirst.gaps[0].created_at;

		const ctxOther: DispatchContext = { writer: { kind: "human", user: "david" } };
		upsertItemInBlock(tmpDir, "gaps", "gaps", { id: "g1", description: "v2", status: "open" }, "id", ctxOther);

		// Wait long enough that ISO timestamp differs (≥1 ms guaranteed by busy loop)
		const start = Date.now();
		while (Date.now() === start) {
			/* spin */
		}

		upsertItemInBlock(tmpDir, "gaps", "gaps", { id: "g1", description: "v3", status: "resolved" }, "id", ctxAgent);

		const afterThird = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "gaps.json"), "utf-8"));
		assert.strictEqual(afterThird.gaps[0].description, "v3");
		assert.strictEqual(afterThird.gaps[0].status, "resolved");
		assert.strictEqual(afterThird.gaps[0].created_by, originalCreatedBy, "created_by carried across two updates");
		assert.strictEqual(afterThird.gaps[0].created_at, originalCreatedAt, "created_at carried across two updates");
		assert.strictEqual(afterThird.gaps[0].modified_by, "agent/claude-opus-4-7");
		assert.notStrictEqual(afterThird.gaps[0].modified_at, originalCreatedAt);
	});
});

// =============================================================================
// writeTypedFile / appendToTypedFile — generalised (filePath, schemaPath) surface
// FGAP-019 closure: the same validated-write surface that fronts .project/<block>.json
// writes is now reachable for arbitrary file paths + schema paths (e.g. monitor
// side-car state). The existing block-api primitives wrap it.
// =============================================================================

const flatPatternListSchema = {
	type: "array",
	items: {
		type: "object",
		properties: {
			id: { type: "string" },
			description: { type: "string" },
			severity: { type: "string" },
		},
		required: ["id", "description"],
		additionalProperties: false,
	},
};

const envelopeAuthorSchema = {
	type: "object",
	required: ["name"],
	properties: {
		name: { type: "string" },
		created_by: { type: "string" },
		created_at: { type: "string" },
	},
	additionalProperties: false,
};

function writeSchemaFile(dir: string, basename: string, schema: Record<string, unknown>): string {
	fs.mkdirSync(dir, { recursive: true });
	const p = path.join(dir, basename);
	fs.writeFileSync(p, JSON.stringify(schema, null, 2));
	return p;
}

describe("writeTypedFile", () => {
	it("writes data to arbitrary tmpdir path with arbitrary schema and validates atomically", (t) => {
		const tmpDir = makeTmpDir("typed-write-arbitrary");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const schemaPath = writeSchemaFile(path.join(tmpDir, "schemas"), "list.schema.json", flatPatternListSchema);
		const filePath = path.join(tmpDir, "side-car", "patterns.json");
		const data = [{ id: "p1", description: "first", severity: "warning" }];

		writeTypedFile(filePath, schemaPath, data, undefined, "side-car patterns");

		const onDisk = JSON.parse(fs.readFileSync(filePath, "utf-8"));
		assert.deepStrictEqual(onDisk, data);
		// Atomic write produced no leftover tmp file
		const dirEntries = fs.readdirSync(path.dirname(filePath));
		assert.deepStrictEqual(
			dirEntries.filter((e) => e.includes("tmp")),
			[],
		);
	});

	it("schemaPath = null skips validation entirely", (t) => {
		const tmpDir = makeTmpDir("typed-write-no-schema");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const filePath = path.join(tmpDir, "anything.json");
		// Data shape that would FAIL the flat-list schema (missing required id+description)
		const data = [{ unrelated: "field" }];

		// schemaPath = null → no AJV → write succeeds
		assert.doesNotThrow(() => writeTypedFile(filePath, null, data));
		assert.deepStrictEqual(JSON.parse(fs.readFileSync(filePath, "utf-8")), data);
	});

	it("ctx-stamping fires when schema declares envelope author fields", (t) => {
		const tmpDir = makeTmpDir("typed-write-envelope-stamp");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const schemaPath = writeSchemaFile(path.join(tmpDir, "schemas"), "env.schema.json", envelopeAuthorSchema);
		const filePath = path.join(tmpDir, "envelope.json");
		const ctx: DispatchContext = { writer: { kind: "agent", agent_id: "test-writer" } };

		writeTypedFile(filePath, schemaPath, { name: "thing" }, ctx, "envelope file");

		const onDisk = JSON.parse(fs.readFileSync(filePath, "utf-8"));
		assert.strictEqual(onDisk.name, "thing");
		assert.strictEqual(onDisk.created_by, "agent/test-writer");
		// (writerToString renders { kind: "agent", agent_id: "test-writer" } as "agent/test-writer")
		assert.ok(typeof onDisk.created_at === "string" && onDisk.created_at.length > 0);
	});
});

describe("appendToTypedFile", () => {
	it("arrayPath = null appends to top-level array file (flat-array shape)", (t) => {
		const tmpDir = makeTmpDir("typed-append-flat");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const schemaPath = writeSchemaFile(path.join(tmpDir, "schemas"), "list.schema.json", flatPatternListSchema);
		const filePath = path.join(tmpDir, "patterns.json");
		// bootstrap an empty list
		writeTypedFile(filePath, schemaPath, [], undefined, "patterns");

		appendToTypedFile(
			filePath,
			schemaPath,
			null,
			{ id: "p1", description: "first", severity: "info" },
			undefined,
			"patterns",
		);
		appendToTypedFile(
			filePath,
			schemaPath,
			null,
			{ id: "p2", description: "second", severity: "warning" },
			undefined,
			"patterns",
		);

		const onDisk = JSON.parse(fs.readFileSync(filePath, "utf-8"));
		assert.strictEqual(onDisk.length, 2);
		assert.strictEqual(onDisk[0].id, "p1");
		assert.strictEqual(onDisk[1].id, "p2");
	});

	it("arrayPath = string appends to data[arrayPath] within object-shape file", (t) => {
		const tmpDir = makeTmpDir("typed-append-object");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const filePath = path.join(tmpDir, "obj.json");
		fs.writeFileSync(filePath, JSON.stringify({ items: [] }));

		appendToTypedFile(filePath, null, "items", { name: "alpha" }, undefined, "obj file");
		appendToTypedFile(filePath, null, "items", { name: "beta" }, undefined, "obj file");

		const onDisk = JSON.parse(fs.readFileSync(filePath, "utf-8"));
		assert.deepStrictEqual(onDisk.items, [{ name: "alpha" }, { name: "beta" }]);
	});

	it("AJV validates the appended item against the list schema (malformed item throws)", (t) => {
		const tmpDir = makeTmpDir("typed-append-validates");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const schemaPath = writeSchemaFile(path.join(tmpDir, "schemas"), "list.schema.json", flatPatternListSchema);
		const filePath = path.join(tmpDir, "patterns.json");
		writeTypedFile(filePath, schemaPath, [], undefined, "patterns");

		// Missing required `description` — must throw ValidationError, leaving file untouched.
		assert.throws(
			() => appendToTypedFile(filePath, schemaPath, null, { id: "p-bad" }, undefined, "patterns"),
			(err: unknown) => err instanceof ValidationError,
		);

		const onDisk = JSON.parse(fs.readFileSync(filePath, "utf-8"));
		assert.deepStrictEqual(onDisk, []);
	});
});

describe("wrapper continuity smoke (writeBlock + appendToBlock still byte-identical)", () => {
	it("appendToBlock + writeBlock route through writeTypedFile and produce expected on-disk state", (t) => {
		const tmpDir = makeTmpDir("wrapper-continuity");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);
		setupSchema(tmpDir, "gaps", gapsSchema);

		// writeBlock — whole-file overwrite
		writeBlock(tmpDir, "gaps", { gaps: [] });
		const initial = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "gaps.json"), "utf-8"));
		assert.deepStrictEqual(initial, { gaps: [] });

		// appendToBlock — read-modify-write under withBlockLock; must NOT
		// re-acquire the lock inside writeTypedFile (that bug surfaced as
		// "Lock file is already being held" during initial Step 6.1
		// implementation; this test guards the regression).
		appendToBlock(tmpDir, "gaps", "gaps", { id: "g1", description: "d", status: "open" });
		const afterAppend = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "gaps.json"), "utf-8"));
		assert.strictEqual(afterAppend.gaps.length, 1);
		assert.strictEqual(afterAppend.gaps[0].id, "g1");
	});
});

// =============================================================================
// FGAP-020 closure: 6 typed-file find-or-merge primitives reach the validated-
// write surface for arbitrary `(filePath, schemaPath, arrayPath)` triples.
// 3 of 6 (update / upsert / remove) accept arrayPath = null (top-level array
// shape, e.g. monitor pattern lists). The 3 nested variants require object-
// with-array-field shape — nesting on a top-level array is structurally
// nonsensical. The 6 .project/-targeting wrappers (updateItemInBlock,
// upsertItemInBlock, appendToNestedArray, updateNestedArrayItem,
// removeFromBlock, removeFromNestedArray) delegate to these primitives;
// their existing tests above remain unmodified to assert wrapper continuity.
// =============================================================================

// Schema for object-shape typed-file tests below — small list of items by id,
// suitable for update / upsert / remove exercises against an arbitrary
// (filePath, schemaPath) outside `.project/`.
const sideObjectSchema = {
	type: "object",
	required: ["items"],
	properties: {
		items: {
			type: "array",
			items: {
				type: "object",
				required: ["id", "label"],
				properties: {
					id: { type: "string" },
					label: { type: "string" },
				},
			},
		},
	},
};

// Author-bearing variant of the side-object schema — used to exercise the
// FGAP-018 pre-merge through `upsertItemInTypedFile` with a real schema-path
// declaration outside `.project/`. additionalProperties:false would also work
// here; omitted to keep the test focused on attestation preservation rather
// than partial-declaration AJV interactions (covered by the FGAP-017 test).
const sideObjectAuthoredSchema = {
	type: "object",
	required: ["items"],
	properties: {
		items: {
			type: "array",
			items: {
				type: "object",
				required: ["id", "label"],
				properties: {
					id: { type: "string" },
					label: { type: "string" },
					created_by: { type: "string" },
					created_at: { type: "string" },
					modified_by: { type: "string" },
					modified_at: { type: "string" },
				},
			},
		},
	},
};

// Object-shape schema with nested arrays for nested-typed-file tests. Mirrors
// the spec-reviews shape but anchored at an arbitrary file path (no .project/
// dependency). Nested `findings` carries an enum constraint so AJV violation
// paths can be exercised independently.
const sideNestedSchema = {
	type: "object",
	required: ["reviews"],
	properties: {
		reviews: {
			type: "array",
			items: {
				type: "object",
				required: ["id", "findings"],
				properties: {
					id: { type: "string" },
					findings: {
						type: "array",
						items: {
							type: "object",
							required: ["id", "description", "severity"],
							properties: {
								id: { type: "string" },
								description: { type: "string" },
								severity: { type: "string", enum: ["info", "warning", "error"] },
							},
						},
					},
				},
			},
		},
	},
};

describe("updateItemInTypedFile", () => {
	it("arrayPath = string updates item in object-with-array-field file", (t) => {
		const tmpDir = makeTmpDir("typed-update-object");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const schemaPath = writeSchemaFile(path.join(tmpDir, "schemas"), "obj.schema.json", sideObjectSchema);
		const filePath = path.join(tmpDir, "side-car", "obj.json");
		fs.mkdirSync(path.dirname(filePath), { recursive: true });
		fs.writeFileSync(
			filePath,
			JSON.stringify({
				items: [
					{ id: "a", label: "alpha" },
					{ id: "b", label: "beta" },
				],
			}),
		);

		updateItemInTypedFile(filePath, schemaPath, "items", (it) => it.id === "a", { label: "ALPHA" });

		const onDisk = JSON.parse(fs.readFileSync(filePath, "utf-8"));
		assert.deepStrictEqual(onDisk.items[0], { id: "a", label: "ALPHA" });
		assert.deepStrictEqual(onDisk.items[1], { id: "b", label: "beta" });
	});

	it("arrayPath = null updates item in top-level array file (flat-array shape)", (t) => {
		const tmpDir = makeTmpDir("typed-update-flat");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const schemaPath = writeSchemaFile(path.join(tmpDir, "schemas"), "list.schema.json", flatPatternListSchema);
		const filePath = path.join(tmpDir, "patterns.json");
		writeTypedFile(
			filePath,
			schemaPath,
			[
				{ id: "p1", description: "first", severity: "info" },
				{ id: "p2", description: "second", severity: "warning" },
			],
			undefined,
			"patterns",
		);

		updateItemInTypedFile(
			filePath,
			schemaPath,
			null,
			(it) => it.id === "p1",
			{ severity: "error" },
			undefined,
			"patterns",
		);

		const onDisk = JSON.parse(fs.readFileSync(filePath, "utf-8"));
		assert.strictEqual(onDisk.length, 2);
		assert.strictEqual(onDisk[0].severity, "error");
		assert.strictEqual(onDisk[1].id, "p2");
	});
});

describe("upsertItemInTypedFile", () => {
	it("arrayPath = string appends new + replaces existing inside object-with-array-field file", (t) => {
		const tmpDir = makeTmpDir("typed-upsert-object");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const schemaPath = writeSchemaFile(path.join(tmpDir, "schemas"), "obj.schema.json", sideObjectSchema);
		const filePath = path.join(tmpDir, "obj.json");
		fs.writeFileSync(filePath, JSON.stringify({ items: [{ id: "a", label: "alpha" }] }));

		const r1 = upsertItemInTypedFile(filePath, schemaPath, "items", { id: "b", label: "beta" }, "id");
		assert.deepStrictEqual(r1, { mode: "appended" });
		const r2 = upsertItemInTypedFile(filePath, schemaPath, "items", { id: "a", label: "ALPHA-replaced" }, "id");
		assert.deepStrictEqual(r2, { mode: "updated" });

		const onDisk = JSON.parse(fs.readFileSync(filePath, "utf-8"));
		assert.strictEqual(onDisk.items.length, 2);
		assert.strictEqual(onDisk.items[0].label, "ALPHA-replaced");
		assert.strictEqual(onDisk.items[1].id, "b");
	});

	it("arrayPath = null appends + replaces inside top-level array file (flat-array shape)", (t) => {
		const tmpDir = makeTmpDir("typed-upsert-flat");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const schemaPath = writeSchemaFile(path.join(tmpDir, "schemas"), "list.schema.json", flatPatternListSchema);
		const filePath = path.join(tmpDir, "patterns.json");
		writeTypedFile(filePath, schemaPath, [], undefined, "patterns");

		const r1 = upsertItemInTypedFile(
			filePath,
			schemaPath,
			null,
			{ id: "p1", description: "first", severity: "info" },
			"id",
			undefined,
			"patterns",
		);
		assert.deepStrictEqual(r1, { mode: "appended" });

		const r2 = upsertItemInTypedFile(
			filePath,
			schemaPath,
			null,
			{ id: "p1", description: "first-updated", severity: "warning" },
			"id",
			undefined,
			"patterns",
		);
		assert.deepStrictEqual(r2, { mode: "updated" });

		const onDisk = JSON.parse(fs.readFileSync(filePath, "utf-8"));
		assert.strictEqual(onDisk.length, 1);
		assert.strictEqual(onDisk[0].description, "first-updated");
		assert.strictEqual(onDisk[0].severity, "warning");
	});

	// FGAP-018 regression — pre-merge logic now lives inside upsertItemInTypedFile.
	// On the object-shape side the wrapper test on line ~2128 already proves
	// preservation of declared created_* through the wrapper; this test asserts the
	// same on the typed-file primitive directly with an arbitrary (non-.project/)
	// file path.
	it("FGAP-018 (object-shape): preserves declared created_* across upsert update when caller omits them", (t) => {
		const tmpDir = makeTmpDir("typed-upsert-fgap-018-obj");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const schemaPath = writeSchemaFile(
			path.join(tmpDir, "schemas"),
			"obj-authored.schema.json",
			sideObjectAuthoredSchema,
		);
		const filePath = path.join(tmpDir, "side", "authored.json");
		fs.mkdirSync(path.dirname(filePath), { recursive: true });
		fs.writeFileSync(filePath, JSON.stringify({ items: [] }));

		const ctx: DispatchContext = { writer: { kind: "agent", agent_id: "claude-opus-4-7" } };
		upsertItemInTypedFile(filePath, schemaPath, "items", { id: "x", label: "v1" }, "id", ctx, "side authored");
		const afterFirst = JSON.parse(fs.readFileSync(filePath, "utf-8"));
		const originalCreatedBy = afterFirst.items[0].created_by;
		const originalCreatedAt = afterFirst.items[0].created_at;
		assert.strictEqual(originalCreatedBy, "agent/claude-opus-4-7");

		const start = Date.now();
		while (Date.now() === start) {
			/* spin to guarantee modified_at differs */
		}

		const ctxOther: DispatchContext = { writer: { kind: "human", user: "david" } };
		upsertItemInTypedFile(filePath, schemaPath, "items", { id: "x", label: "v2" }, "id", ctxOther, "side authored");

		const afterSecond = JSON.parse(fs.readFileSync(filePath, "utf-8"));
		assert.strictEqual(afterSecond.items[0].label, "v2");
		assert.strictEqual(afterSecond.items[0].created_by, originalCreatedBy, "created_by carried");
		assert.strictEqual(afterSecond.items[0].created_at, originalCreatedAt, "created_at carried");
		assert.strictEqual(afterSecond.items[0].modified_by, "human/david");
	});

	// FGAP-018 (flat-array) — DOCUMENTED SKIP. The pre-merge logic structurally
	// no-ops for arrayPath = null because `collectArrayItemAuthorDecisions`
	// never visits a top-level array schema, so the declared-fields lookup
	// keyed by `__top__` returns the empty set. No current consumer declares
	// author fields on a flat-array shape; if one ever does, the cataloguer
	// needs an extension (filed-or-future work) — this test pins the current
	// behavior so a future change that adds flat-array stamping must update
	// the test alongside the cataloguer extension.
	it("FGAP-018 (flat-array): pre-merge is a no-op (cataloguer does not visit top-level array schemas)", (t) => {
		const tmpDir = makeTmpDir("typed-upsert-fgap-018-flat");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const schemaPath = writeSchemaFile(path.join(tmpDir, "schemas"), "list.schema.json", flatPatternListSchema);
		const filePath = path.join(tmpDir, "patterns.json");
		writeTypedFile(filePath, schemaPath, [], undefined, "patterns");

		// Pre-seed an item that already has additionalProperties — but the schema
		// is additionalProperties:false, so we keep only declared fields.
		upsertItemInTypedFile(
			filePath,
			schemaPath,
			null,
			{ id: "p1", description: "first", severity: "info" },
			"id",
			undefined,
			"patterns",
		);

		// Replace it with a new item omitting `severity`. Pre-merge would carry
		// declared fields IF the schema declared author fields at the top-level
		// item shape; flatPatternListSchema does not declare any author fields on
		// items, so the pre-merge contributes nothing — the replacement
		// semantics fully overwrite. This documents the structural no-op.
		upsertItemInTypedFile(
			filePath,
			schemaPath,
			null,
			{ id: "p1", description: "first-updated" },
			"id",
			undefined,
			"patterns",
		);

		const onDisk = JSON.parse(fs.readFileSync(filePath, "utf-8"));
		assert.strictEqual(onDisk.length, 1);
		assert.strictEqual(onDisk[0].description, "first-updated");
		// severity gone — no carry; replacement semantics intact.
		assert.strictEqual(Object.hasOwn(onDisk[0], "severity"), false);
	});
});

describe("removeFromTypedFile", () => {
	it("arrayPath = string removes matching items from object-with-array-field file", (t) => {
		const tmpDir = makeTmpDir("typed-remove-object");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const schemaPath = writeSchemaFile(path.join(tmpDir, "schemas"), "obj.schema.json", sideObjectSchema);
		const filePath = path.join(tmpDir, "obj.json");
		fs.writeFileSync(
			filePath,
			JSON.stringify({
				items: [
					{ id: "a", label: "alpha" },
					{ id: "b", label: "beta" },
					{ id: "c", label: "gamma" },
				],
			}),
		);

		const r = removeFromTypedFile(filePath, schemaPath, "items", (it) => it.id === "b");
		assert.deepStrictEqual(r, { removed: 1 });

		const onDisk = JSON.parse(fs.readFileSync(filePath, "utf-8"));
		assert.strictEqual(onDisk.items.length, 2);
		assert.strictEqual(onDisk.items.map((it: { id: string }) => it.id).join(","), "a,c");
	});

	it("arrayPath = null removes matching items from top-level array file; idempotent on miss", (t) => {
		const tmpDir = makeTmpDir("typed-remove-flat");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const schemaPath = writeSchemaFile(path.join(tmpDir, "schemas"), "list.schema.json", flatPatternListSchema);
		const filePath = path.join(tmpDir, "patterns.json");
		writeTypedFile(
			filePath,
			schemaPath,
			[
				{ id: "p1", description: "first", severity: "info" },
				{ id: "p2", description: "second", severity: "warning" },
			],
			undefined,
			"patterns",
		);

		const r1 = removeFromTypedFile(filePath, schemaPath, null, (it) => it.id === "p1", undefined, "patterns");
		assert.deepStrictEqual(r1, { removed: 1 });

		const onDisk = JSON.parse(fs.readFileSync(filePath, "utf-8"));
		assert.strictEqual(onDisk.length, 1);
		assert.strictEqual(onDisk[0].id, "p2");

		// Idempotent miss
		const r2 = removeFromTypedFile(filePath, schemaPath, null, (it) => it.id === "nonexistent", undefined, "patterns");
		assert.deepStrictEqual(r2, { removed: 0 });
		const onDisk2 = JSON.parse(fs.readFileSync(filePath, "utf-8"));
		assert.strictEqual(onDisk2.length, 1);
	});
});

describe("appendToNestedTypedFile", () => {
	it("appends to nested array on matched parent in arbitrary object-shape file", (t) => {
		const tmpDir = makeTmpDir("typed-nested-append");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const schemaPath = writeSchemaFile(path.join(tmpDir, "schemas"), "nested.schema.json", sideNestedSchema);
		const filePath = path.join(tmpDir, "side", "reviews.json");
		fs.mkdirSync(path.dirname(filePath), { recursive: true });
		fs.writeFileSync(
			filePath,
			JSON.stringify({
				reviews: [{ id: "REVIEW-001", findings: [] }],
			}),
		);

		appendToNestedTypedFile(
			filePath,
			schemaPath,
			"reviews",
			(it) => it.id === "REVIEW-001",
			"findings",
			{ id: "F-001", description: "first", severity: "info" },
			undefined,
			"side reviews",
		);

		const onDisk = JSON.parse(fs.readFileSync(filePath, "utf-8"));
		assert.strictEqual(onDisk.reviews[0].findings.length, 1);
		assert.strictEqual(onDisk.reviews[0].findings[0].id, "F-001");
	});
});

describe("updateNestedItemInTypedFile", () => {
	it("updates nested item identified by parent + nested predicates in object-shape file", (t) => {
		const tmpDir = makeTmpDir("typed-nested-update");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const schemaPath = writeSchemaFile(path.join(tmpDir, "schemas"), "nested.schema.json", sideNestedSchema);
		const filePath = path.join(tmpDir, "reviews.json");
		fs.writeFileSync(
			filePath,
			JSON.stringify({
				reviews: [
					{
						id: "REVIEW-001",
						findings: [
							{ id: "F-001", description: "first", severity: "info" },
							{ id: "F-002", description: "second", severity: "warning" },
						],
					},
				],
			}),
		);

		updateNestedItemInTypedFile(
			filePath,
			schemaPath,
			"reviews",
			(it) => it.id === "REVIEW-001",
			"findings",
			(it) => it.id === "F-001",
			{ severity: "error", description: "first-escalated" },
			undefined,
			"reviews",
		);

		const onDisk = JSON.parse(fs.readFileSync(filePath, "utf-8"));
		const finding = onDisk.reviews[0].findings.find((f: { id: string }) => f.id === "F-001");
		assert.strictEqual(finding.severity, "error");
		assert.strictEqual(finding.description, "first-escalated");
		// Sibling untouched
		const sibling = onDisk.reviews[0].findings.find((f: { id: string }) => f.id === "F-002");
		assert.strictEqual(sibling.severity, "warning");
	});
});

describe("removeFromNestedTypedFile", () => {
	it("removes nested items matching predicate; idempotent on nested-miss; throws on parent-miss", (t) => {
		const tmpDir = makeTmpDir("typed-nested-remove");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const schemaPath = writeSchemaFile(path.join(tmpDir, "schemas"), "nested.schema.json", sideNestedSchema);
		const filePath = path.join(tmpDir, "reviews.json");
		fs.writeFileSync(
			filePath,
			JSON.stringify({
				reviews: [
					{
						id: "REVIEW-001",
						findings: [
							{ id: "F-001", description: "first", severity: "info" },
							{ id: "F-002", description: "second", severity: "warning" },
						],
					},
				],
			}),
		);

		const r1 = removeFromNestedTypedFile(
			filePath,
			schemaPath,
			"reviews",
			(it) => it.id === "REVIEW-001",
			"findings",
			(it) => it.id === "F-001",
			undefined,
			"reviews",
		);
		assert.deepStrictEqual(r1, { removed: 1 });

		const onDisk = JSON.parse(fs.readFileSync(filePath, "utf-8"));
		assert.strictEqual(onDisk.reviews[0].findings.length, 1);
		assert.strictEqual(onDisk.reviews[0].findings[0].id, "F-002");

		// Idempotent on nested miss (parent matches, nested predicate finds nothing)
		const r2 = removeFromNestedTypedFile(
			filePath,
			schemaPath,
			"reviews",
			(it) => it.id === "REVIEW-001",
			"findings",
			(it) => it.id === "F-nonexistent",
			undefined,
			"reviews",
		);
		assert.deepStrictEqual(r2, { removed: 0 });

		// Throws on parent miss (mirrors wrapper semantics)
		assert.throws(
			() =>
				removeFromNestedTypedFile(
					filePath,
					schemaPath,
					"reviews",
					(it) => it.id === "REVIEW-NEVER",
					"findings",
					(_) => true,
					undefined,
					"reviews",
				),
			(err: unknown) => err instanceof Error && err.message.includes("No matching item"),
		);
	});
});

// ── resolveBlockItemSchema + nextId (FGAP-083 / FGAP-084) ─────────────────────

const inlineGapSchema = {
	type: "object",
	required: ["g"],
	properties: {
		g: {
			type: "array",
			items: { type: "object", required: ["id"], properties: { id: { type: "string", pattern: "^G-\\d{3}$" } } },
		},
	},
};
const refFeatureSchema = {
	type: "object",
	required: ["features"],
	properties: { features: { type: "array", items: { $ref: "#/definitions/feature" } } },
	definitions: {
		feature: { type: "object", required: ["id"], properties: { id: { type: "string", pattern: "^FEAT-\\d{3}$" } } },
	},
};

function writeBlockFile(tmp: string, block: string, data: unknown): void {
	setupWorkflowDir(tmp);
	fs.writeFileSync(path.join(tmp, ".project", `${block}.json`), JSON.stringify(data, null, 2));
}

describe("resolveBlockItemSchema", () => {
	it("returns the inline items schema + array key", () => {
		const { arrayKey, itemSchema } = resolveBlockItemSchema(inlineGapSchema);
		assert.strictEqual(arrayKey, "g");
		assert.strictEqual((itemSchema.properties as any).id.pattern, "^G-\\d{3}$");
	});

	it("dereferences a #/definitions/<x> $ref items schema", () => {
		const { arrayKey, itemSchema } = resolveBlockItemSchema(refFeatureSchema);
		assert.strictEqual(arrayKey, "features");
		assert.strictEqual((itemSchema.properties as any).id.pattern, "^FEAT-\\d{3}$");
	});

	it("throws on an unresolvable $ref", () => {
		const bad = {
			type: "object",
			properties: { x: { type: "array", items: { $ref: "#/definitions/missing" } } },
			definitions: {},
		};
		assert.throws(() => resolveBlockItemSchema(bad), /does not resolve/);
	});

	it("throws when no array property is present", () => {
		assert.throws(
			() => resolveBlockItemSchema({ type: "object", properties: { x: { type: "string" } } }),
			/no array property/,
		);
	});
});

describe("nextId", () => {
	it("allocates the first id for an empty inline block", (t) => {
		const tmp = makeTmpDir("nextid-empty");
		t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
		setupSchema(tmp, "g", inlineGapSchema);
		writeBlockFile(tmp, "g", { g: [] });
		assert.strictEqual(nextId(tmp, "g"), "G-001");
	});

	it("scans existing ids for the max suffix (inline)", (t) => {
		const tmp = makeTmpDir("nextid-scan");
		t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
		setupSchema(tmp, "g", inlineGapSchema);
		writeBlockFile(tmp, "g", { g: [{ id: "G-001" }, { id: "G-003" }] });
		assert.strictEqual(nextId(tmp, "g"), "G-004");
	});

	it("reads the id pattern through a $ref items schema", (t) => {
		const tmp = makeTmpDir("nextid-ref");
		t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
		setupSchema(tmp, "features", refFeatureSchema);
		writeBlockFile(tmp, "features", { features: [{ id: "FEAT-002" }] });
		assert.strictEqual(nextId(tmp, "features"), "FEAT-003");
	});

	it("honors a 4-digit width", (t) => {
		const tmp = makeTmpDir("nextid-w4");
		t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
		const decSchema = {
			type: "object",
			required: ["decisions"],
			properties: {
				decisions: {
					type: "array",
					items: { type: "object", required: ["id"], properties: { id: { type: "string", pattern: "^DEC-\\d{4}$" } } },
				},
			},
		};
		setupSchema(tmp, "decisions", decSchema);
		writeBlockFile(tmp, "decisions", { decisions: [] });
		assert.strictEqual(nextId(tmp, "decisions"), "DEC-0001");
	});

	it("handles a variable-width pattern (\\d{3,}) using the minimum width", (t) => {
		const tmp = makeTmpDir("nextid-var");
		t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
		const taskSchema = {
			type: "object",
			required: ["tasks"],
			properties: {
				tasks: {
					type: "array",
					items: {
						type: "object",
						required: ["id"],
						properties: { id: { type: "string", pattern: "^TASK-\\d{3,}$" } },
					},
				},
			},
		};
		setupSchema(tmp, "tasks", taskSchema);
		writeBlockFile(tmp, "tasks", { tasks: [{ id: "TASK-007" }] });
		assert.strictEqual(nextId(tmp, "tasks"), "TASK-008");
	});

	it("throws when the item schema has no id pattern", (t) => {
		const tmp = makeTmpDir("nextid-nopat");
		t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
		const noPat = {
			type: "object",
			required: ["x"],
			properties: { x: { type: "array", items: { type: "object", properties: { id: { type: "string" } } } } },
		};
		setupSchema(tmp, "x", noPat);
		writeBlockFile(tmp, "x", { x: [] });
		assert.throws(() => nextId(tmp, "x"), /no id\.pattern/);
	});
});

describe("$ref block whole-file validation on append", () => {
	it("appendToBlock validates a $ref item against the resolved definition", (t) => {
		const tmp = makeTmpDir("ref-append");
		t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
		setupSchema(tmp, "features", refFeatureSchema);
		writeBlockFile(tmp, "features", { features: [] });
		// valid (id matches FEAT pattern) passes — proves AJV resolves #/definitions/feature
		appendToBlock(tmp, "features", "features", { id: "FEAT-001" });
		assert.strictEqual((readBlock(tmp, "features") as any).features.length, 1);
		// invalid (id violates the $ref'd pattern) throws ValidationError
		assert.throws(() => appendToBlock(tmp, "features", "features", { id: "nope" }), ValidationError);
	});
});
