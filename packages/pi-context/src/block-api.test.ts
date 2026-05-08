import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
	appendToBlock,
	appendToNestedArray,
	readBlock,
	readBlockDir,
	removeFromBlock,
	removeFromNestedArray,
	updateItemInBlock,
	updateNestedArrayItem,
	writeBlock,
} from "./block-api.js";
import { ValidationError } from "./schema-validator.js";

function makeTmpDir(prefix: string): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), `block-api-${prefix}-`));
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
		const phasesDir = path.join(wfDir, "phases");
		fs.mkdirSync(phasesDir);
		fs.writeFileSync(path.join(phasesDir, "02-second.json"), JSON.stringify({ n: 2 }));
		fs.writeFileSync(path.join(phasesDir, "01-first.json"), JSON.stringify({ n: 1 }));
		// Non-JSON files should be ignored
		fs.writeFileSync(path.join(phasesDir, "notes.txt"), "ignored");

		const result = readBlockDir(tmpDir, "phases") as Array<{ n: number }>;
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
});
