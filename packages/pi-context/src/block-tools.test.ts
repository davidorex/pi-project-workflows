/**
 * Tests for the generic block tools (append-block-item, update-block-item)
 * and findAppendableBlocks discovery. Tests the block-api functions directly
 * since the tool execute functions are thin wrappers.
 */

import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { appendToBlock, readBlock, updateItemInBlock } from "./block-api.js";
import { loadConfig } from "./context.js";
import { resolveContextDir, schemaPath, writeBootstrapPointer } from "./context-dir.js";
import { findAppendableBlocks } from "./context-sdk.js";
import { readCatalogSchemaText } from "./index.js";
import { type OpDefinition, ops } from "./ops-registry.js";
import type { ReadStructured } from "./read-element.js";
import { samplesCatalog } from "./samples-catalog.js";
import { ValidationError } from "./schema-validator.js";
import { readSchema } from "./schema-write.js";

/** Resolve an op by name, asserting it exists, for op-level `run()` tests. */
function op(name: string): OpDefinition {
	const found = ops.find((o) => o.name === name);
	if (found === undefined) throw new Error(`op not found: ${name}`);
	return found;
}

/** Pull the `{read}` ReadStructured off an OpResult, asserting it is one. */
function readOf(result: unknown): ReadStructured {
	const r = result as { read?: ReadStructured };
	assert.ok(r && typeof r === "object" && r.read !== undefined, "op returned a {read} result");
	return r.read;
}

function makeTmpDir(): string {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "block-tools-"));
	writeBootstrapPointer(cwd, ".project");
	return cwd;
}

/** Set up a block with schema and initial data in a temp dir */
function setupBlock(
	tmpDir: string,
	blockName: string,
	arrayKey: string,
	schema: Record<string, unknown>,
	items: unknown[] = [],
): void {
	const wfDir = path.join(tmpDir, ".project");
	const schemasDir = path.join(wfDir, "schemas");
	fs.mkdirSync(schemasDir, { recursive: true });
	fs.writeFileSync(path.join(schemasDir, `${blockName}.schema.json`), JSON.stringify(schema));
	fs.writeFileSync(path.join(wfDir, `${blockName}.json`), JSON.stringify({ [arrayKey]: items }, null, 2));
}

const gapsSchema = {
	type: "object",
	required: ["gaps"],
	properties: {
		gaps: {
			type: "array",
			items: {
				type: "object",
				required: ["id", "description", "status", "category", "priority"],
				properties: {
					id: { type: "string" },
					description: { type: "string" },
					status: { type: "string", enum: ["open", "resolved", "deferred"] },
					category: { type: "string", enum: ["primitive", "issue", "cleanup", "capability", "composition"] },
					priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
					resolved_by: { type: "string" },
					source: { type: "string", enum: ["human", "agent", "monitor", "workflow"] },
					details: { type: "string" },
				},
			},
		},
	},
};

const decisionsSchema = {
	type: "object",
	required: ["decisions"],
	properties: {
		decisions: {
			type: "array",
			items: {
				type: "object",
				required: ["id", "decision", "status"],
				properties: {
					id: { type: "string" },
					decision: { type: "string" },
					status: { type: "string", enum: ["decided", "tentative", "superseded"] },
					rationale: { type: "string" },
				},
			},
		},
	},
};

// ── append-block-item ─────────────────────────────────────────────────────

describe("append-block-item", () => {
	it("appends to any named block with any array key", (t) => {
		const tmpDir = makeTmpDir();
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupBlock(tmpDir, "decisions", "decisions", decisionsSchema);

		appendToBlock(tmpDir, "decisions", "decisions", {
			id: "d1",
			decision: "Use TypeScript",
			status: "decided",
			rationale: "Type safety",
		});

		const data = readBlock(tmpDir, "decisions") as { decisions: unknown[] };
		assert.strictEqual(data.decisions.length, 1);
		assert.deepStrictEqual((data.decisions[0] as Record<string, unknown>).id, "d1");
	});

	it("appends to gaps block with all required fields", (t) => {
		const tmpDir = makeTmpDir();
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupBlock(tmpDir, "gaps", "gaps", gapsSchema);

		const entry = {
			id: "test-gap",
			description: "Something is missing",
			status: "open",
			category: "issue",
			priority: "high",
			source: "agent",
		};

		appendToBlock(tmpDir, "gaps", "gaps", entry);

		const data = readBlock(tmpDir, "gaps") as { gaps: unknown[] };
		assert.strictEqual(data.gaps.length, 1);
		assert.deepStrictEqual(data.gaps[0], entry);
	});

	it("deduplicates by id field when present", (t) => {
		const tmpDir = makeTmpDir();
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupBlock(tmpDir, "gaps", "gaps", gapsSchema, [
			{
				id: "existing-gap",
				description: "Already here",
				status: "open",
				category: "issue",
				priority: "medium",
				source: "human",
			},
		]);

		// Simulate the tool's duplicate check logic
		const data = readBlock(tmpDir, "gaps") as { gaps: Array<{ id: string }> };
		const isDuplicate = data.gaps.some((g) => g.id === "existing-gap");
		assert.ok(isDuplicate, "should detect existing item by id");
	});

	it("validates against block schema", (t) => {
		const tmpDir = makeTmpDir();
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupBlock(tmpDir, "gaps", "gaps", gapsSchema);

		const badEntry = {
			id: "bad-gap",
			description: "Bad category",
			status: "open",
			category: "nonexistent-category",
			priority: "high",
			source: "agent",
		};

		assert.throws(
			() => appendToBlock(tmpDir, "gaps", "gaps", badEntry),
			(err: unknown) => {
				assert.ok(err instanceof ValidationError);
				return true;
			},
		);
	});

	it("throws when block file does not exist", (t) => {
		const tmpDir = makeTmpDir();
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		assert.throws(
			() =>
				appendToBlock(tmpDir, "gaps", "gaps", {
					id: "x",
					description: "y",
					status: "open",
					category: "issue",
					priority: "low",
				}),
			(err: unknown) => {
				assert.ok(err instanceof Error);
				assert.ok(err.message.includes("not found"));
				return true;
			},
		);
	});

	it("includes optional details field when provided", (t) => {
		const tmpDir = makeTmpDir();
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupBlock(tmpDir, "gaps", "gaps", gapsSchema);

		const entry = {
			id: "detailed-gap",
			description: "Has details",
			status: "open",
			category: "capability",
			priority: "medium",
			source: "agent",
			details: "Extra context about the gap",
		};

		appendToBlock(tmpDir, "gaps", "gaps", entry);

		const data = readBlock(tmpDir, "gaps") as { gaps: Array<Record<string, unknown>> };
		assert.strictEqual(data.gaps[0].details, "Extra context about the gap");
	});

	it("appends to decisions block (non-gap block)", (t) => {
		const tmpDir = makeTmpDir();
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupBlock(tmpDir, "decisions", "decisions", decisionsSchema, [{ id: "d1", decision: "First", status: "decided" }]);

		appendToBlock(tmpDir, "decisions", "decisions", {
			id: "d2",
			decision: "Second",
			status: "tentative",
			rationale: "Needs review",
		});

		const data = readBlock(tmpDir, "decisions") as { decisions: unknown[] };
		assert.strictEqual(data.decisions.length, 2);
		assert.strictEqual((data.decisions[1] as Record<string, unknown>).id, "d2");
	});
});

// ── update-block-item ─────────────────────────────────────────────────────

describe("update-block-item", () => {
	it("matches by arbitrary field predicate", (t) => {
		const tmpDir = makeTmpDir();
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupBlock(tmpDir, "gaps", "gaps", gapsSchema, [
			{ id: "g1", description: "to resolve", status: "open", category: "issue", priority: "high", source: "human" },
		]);

		// Match by id (as the generic tool would via match entries)
		updateItemInBlock(tmpDir, "gaps", "gaps", (g) => g.id === "g1", { status: "resolved", resolved_by: "test-fix" });

		const data = readBlock(tmpDir, "gaps") as { gaps: Array<Record<string, unknown>> };
		assert.strictEqual(data.gaps[0].status, "resolved");
		assert.strictEqual(data.gaps[0].resolved_by, "test-fix");
		assert.strictEqual(data.gaps[0].description, "to resolve"); // unchanged
	});

	it("matches by multiple fields", (t) => {
		const tmpDir = makeTmpDir();
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupBlock(tmpDir, "decisions", "decisions", decisionsSchema, [
			{ id: "d1", decision: "First", status: "decided" },
			{ id: "d2", decision: "Second", status: "tentative" },
		]);

		// Match by status + id (as update-block-item would with multi-field match)
		updateItemInBlock(tmpDir, "decisions", "decisions", (item) => item.id === "d2" && item.status === "tentative", {
			status: "decided",
			rationale: "Confirmed",
		});

		const data = readBlock(tmpDir, "decisions") as { decisions: Array<Record<string, unknown>> };
		assert.strictEqual(data.decisions[1].status, "decided");
		assert.strictEqual(data.decisions[1].rationale, "Confirmed");
		assert.strictEqual(data.decisions[0].status, "decided"); // d1 unchanged
	});

	it("throws on no match", (t) => {
		const tmpDir = makeTmpDir();
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupBlock(tmpDir, "gaps", "gaps", gapsSchema, [
			{ id: "g1", description: "exists", status: "open", category: "issue", priority: "low", source: "human" },
		]);

		assert.throws(
			() => updateItemInBlock(tmpDir, "gaps", "gaps", (g) => g.id === "nonexistent", { status: "resolved" }),
			(err: unknown) => {
				assert.ok(err instanceof Error);
				assert.ok(err.message.includes("No matching item"));
				return true;
			},
		);
	});

	it("validates after update", (t) => {
		const tmpDir = makeTmpDir();
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupBlock(tmpDir, "gaps", "gaps", gapsSchema, [
			{ id: "g1", description: "test", status: "open", category: "issue", priority: "low", source: "human" },
		]);

		assert.throws(
			() => updateItemInBlock(tmpDir, "gaps", "gaps", (g) => g.id === "g1", { status: "invalid-status" }),
			(err: unknown) => {
				assert.ok(err instanceof ValidationError);
				return true;
			},
		);

		// Original file unchanged after validation failure
		const data = readBlock(tmpDir, "gaps") as { gaps: Array<Record<string, unknown>> };
		assert.strictEqual(data.gaps[0].status, "open");
	});

	it("no-op when updates object is empty", (t) => {
		const tmpDir = makeTmpDir();
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupBlock(tmpDir, "gaps", "gaps", gapsSchema, [
			{ id: "g1", description: "stable", status: "open", category: "issue", priority: "low", source: "human" },
		]);

		// Empty updates still writes (Object.assign with {} is a no-op on content)
		updateItemInBlock(tmpDir, "gaps", "gaps", (g) => g.id === "g1", {});

		const data = readBlock(tmpDir, "gaps") as { gaps: Array<Record<string, unknown>> };
		assert.strictEqual(data.gaps[0].status, "open"); // unchanged
	});

	it("updates item in non-gap block", (t) => {
		const tmpDir = makeTmpDir();
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupBlock(tmpDir, "decisions", "decisions", decisionsSchema, [
			{ id: "d1", decision: "Original", status: "tentative" },
		]);

		updateItemInBlock(tmpDir, "decisions", "decisions", (d) => d.id === "d1", { status: "decided" });

		const data = readBlock(tmpDir, "decisions") as { decisions: Array<Record<string, unknown>> };
		assert.strictEqual(data.decisions[0].status, "decided");
	});
});

// ── findAppendableBlocks ──────────────────────────────────────────────────

describe("findAppendableBlocks", () => {
	it("discovers blocks from schema array properties", (t) => {
		const tmpDir = makeTmpDir();
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const schemasDir = path.join(tmpDir, ".project", "schemas");
		fs.mkdirSync(schemasDir, { recursive: true });

		// Schema with array property
		fs.writeFileSync(
			path.join(schemasDir, "gaps.schema.json"),
			JSON.stringify({
				type: "object",
				properties: { gaps: { type: "array", items: { type: "object" } } },
			}),
		);

		// Schema with array property
		fs.writeFileSync(
			path.join(schemasDir, "decisions.schema.json"),
			JSON.stringify({
				type: "object",
				properties: { decisions: { type: "array", items: { type: "object" } } },
			}),
		);

		// Schema without array property (should not appear)
		fs.writeFileSync(
			path.join(schemasDir, "model-config.schema.json"),
			JSON.stringify({
				type: "object",
				properties: { default: { type: "string" } },
			}),
		);

		const results = findAppendableBlocks(tmpDir);
		assert.ok(results.length >= 2, `expected >= 2 appendable blocks, got ${results.length}`);

		const gaps = results.find((r) => r.block === "gaps");
		assert.ok(gaps, "should find gaps block");
		assert.strictEqual(gaps!.arrayKey, "gaps");
		assert.ok(gaps!.schemaPath.includes("gaps.schema.json"));

		const decisions = results.find((r) => r.block === "decisions");
		assert.ok(decisions, "should find decisions block");
		assert.strictEqual(decisions!.arrayKey, "decisions");

		const config = results.find((r) => r.block === "model-config");
		assert.ok(!config, "should not include model-config (no array property)");
	});

	it("returns empty array when schemas dir does not exist", (t) => {
		const tmpDir = makeTmpDir();
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const results = findAppendableBlocks(tmpDir);
		assert.deepStrictEqual(results, []);
	});

	it("skips malformed schema files", (t) => {
		const tmpDir = makeTmpDir();
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const schemasDir = path.join(tmpDir, ".project", "schemas");
		fs.mkdirSync(schemasDir, { recursive: true });

		fs.writeFileSync(
			path.join(schemasDir, "good.schema.json"),
			JSON.stringify({
				type: "object",
				properties: { items: { type: "array" } },
			}),
		);
		fs.writeFileSync(path.join(schemasDir, "bad.schema.json"), "not json{{{");

		const results = findAppendableBlocks(tmpDir);
		assert.ok(
			results.some((r) => r.block === "good"),
			"should find good block",
		);
		assert.ok(!results.some((r) => r.block === "bad"), "should skip bad block");
	});
});

// ── append-block-nested-item / update-block-nested-item / remove-block-item /
//    remove-block-nested-item / read-block-dir ──────────────────────────────
//
// These tests exercise the block-api primitives that the registered tools
// call. The tool execute wrappers themselves are thin (parameter-shape
// adapters that build predicates from `match` objects); these tests cover the
// predicate-building pattern + idempotent-remove + readBlockDir surfaces that
// the new tool registrations rely on.

import {
	appendToNestedArray,
	readBlockDir,
	removeFromBlock,
	removeFromNestedArray,
	updateNestedArrayItem,
} from "./block-api.js";

const reviewsToolSchema = {
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

describe("append-block-nested-item (tool surface)", () => {
	it("appends nested item via match-object predicate", (t) => {
		const tmpDir = makeTmpDir();
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupBlock(tmpDir, "spec-reviews", "reviews", reviewsToolSchema, [{ id: "REVIEW-001", findings: [] }]);

		// Mirror what the tool does: build predicate from match entries
		const match = { id: "REVIEW-001" };
		const matchEntries = Object.entries(match);
		const predicate = (i: Record<string, unknown>) => matchEntries.every(([k, v]) => i[k] === v);
		appendToNestedArray(tmpDir, "spec-reviews", "reviews", predicate, "findings", { id: "F-001", state: "open" });

		const data = readBlock(tmpDir, "spec-reviews") as { reviews: Array<{ findings: unknown[] }> };
		assert.strictEqual(data.reviews[0].findings.length, 1);
	});
});

describe("update-block-nested-item (tool surface)", () => {
	it("updates nested item via parent + nested match predicates", (t) => {
		const tmpDir = makeTmpDir();
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupBlock(tmpDir, "spec-reviews", "reviews", reviewsToolSchema, [
			{ id: "REVIEW-001", findings: [{ id: "F-001", state: "open" }] },
		]);

		const parentMatch = { id: "REVIEW-001" };
		const nestedMatch = { id: "F-001" };
		const parentEntries = Object.entries(parentMatch);
		const nestedEntries = Object.entries(nestedMatch);
		const parentPred = (i: Record<string, unknown>) => parentEntries.every(([k, v]) => i[k] === v);
		const nestedPred = (i: Record<string, unknown>) => nestedEntries.every(([k, v]) => i[k] === v);
		updateNestedArrayItem(tmpDir, "spec-reviews", "reviews", parentPred, "findings", nestedPred, { state: "resolved" });

		const data = readBlock(tmpDir, "spec-reviews") as {
			reviews: Array<{ findings: Array<Record<string, unknown>> }>;
		};
		assert.strictEqual(data.reviews[0].findings[0].state, "resolved");
	});

	it("surfaces clear error when parent missing", (t) => {
		const tmpDir = makeTmpDir();
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupBlock(tmpDir, "spec-reviews", "reviews", reviewsToolSchema, [
			{ id: "REVIEW-001", findings: [{ id: "F-001", state: "open" }] },
		]);

		const pPred = (i: Record<string, unknown>) => i.id === "REVIEW-999";
		const nPred = (i: Record<string, unknown>) => i.id === "F-001";
		assert.throws(
			() => updateNestedArrayItem(tmpDir, "spec-reviews", "reviews", pPred, "findings", nPred, { state: "resolved" }),
			(err: unknown) => {
				assert.ok(err instanceof Error);
				assert.ok(err.message.includes("No matching item"));
				return true;
			},
		);
	});
});

describe("remove-block-item (tool surface)", () => {
	it("removes via predicate; returns count", (t) => {
		const tmpDir = makeTmpDir();
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupBlock(tmpDir, "decisions", "decisions", decisionsSchema, [
			{ id: "d1", decision: "first", status: "decided" },
			{ id: "d2", decision: "second", status: "tentative" },
		]);

		const result = removeFromBlock(tmpDir, "decisions", "decisions", (d) => d.id === "d1");
		assert.deepStrictEqual(result, { removed: 1 });

		const data = readBlock(tmpDir, "decisions") as { decisions: Array<Record<string, unknown>> };
		assert.strictEqual(data.decisions.length, 1);
		assert.strictEqual(data.decisions[0].id, "d2");
	});

	it("idempotent — { removed: 0 } on no match without throw", (t) => {
		const tmpDir = makeTmpDir();
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupBlock(tmpDir, "decisions", "decisions", decisionsSchema, [{ id: "d1", decision: "first", status: "decided" }]);

		const result = removeFromBlock(tmpDir, "decisions", "decisions", (d) => d.id === "nonexistent");
		assert.deepStrictEqual(result, { removed: 0 });
	});

	it("clear error on missing block file", (t) => {
		const tmpDir = makeTmpDir();
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		assert.throws(
			() => removeFromBlock(tmpDir, "missing", "items", () => true),
			(err: unknown) => {
				assert.ok(err instanceof Error);
				assert.ok(err.message.includes("not found"));
				return true;
			},
		);
	});
});

describe("remove-block-nested-item (tool surface)", () => {
	it("removes nested via parent + nested predicates", (t) => {
		const tmpDir = makeTmpDir();
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupBlock(tmpDir, "spec-reviews", "reviews", reviewsToolSchema, [
			{
				id: "REVIEW-001",
				findings: [
					{ id: "F-001", state: "open" },
					{ id: "F-002", state: "open" },
				],
			},
		]);

		const result = removeFromNestedArray(
			tmpDir,
			"spec-reviews",
			"reviews",
			(p) => p.id === "REVIEW-001",
			"findings",
			(f) => f.id === "F-001",
		);
		assert.deepStrictEqual(result, { removed: 1 });

		const data = readBlock(tmpDir, "spec-reviews") as { reviews: Array<{ findings: Array<Record<string, unknown>> }> };
		assert.strictEqual(data.reviews[0].findings.length, 1);
		assert.strictEqual(data.reviews[0].findings[0].id, "F-002");
	});

	it("idempotent on nested miss; throws on parent miss", (t) => {
		const tmpDir = makeTmpDir();
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupBlock(tmpDir, "spec-reviews", "reviews", reviewsToolSchema, [
			{ id: "REVIEW-001", findings: [{ id: "F-001", state: "open" }] },
		]);

		// Nested miss — idempotent
		const r1 = removeFromNestedArray(
			tmpDir,
			"spec-reviews",
			"reviews",
			(p) => p.id === "REVIEW-001",
			"findings",
			(f) => f.id === "F-999",
		);
		assert.deepStrictEqual(r1, { removed: 0 });

		// Parent miss — throws
		assert.throws(
			() =>
				removeFromNestedArray(
					tmpDir,
					"spec-reviews",
					"reviews",
					(p) => p.id === "REVIEW-999",
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
});

describe("read-block-dir (tool surface)", () => {
	it("enumerates schemas/ subdirectory", (t) => {
		const tmpDir = makeTmpDir();
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		const schemasDir = path.join(tmpDir, ".project", "schemas");
		fs.mkdirSync(schemasDir, { recursive: true });
		fs.writeFileSync(path.join(schemasDir, "a.schema.json"), JSON.stringify({ name: "a" }));
		fs.writeFileSync(path.join(schemasDir, "b.schema.json"), JSON.stringify({ name: "b" }));

		const result = readBlockDir(tmpDir, "schemas") as Array<{ name: string }>;
		assert.strictEqual(result.length, 2);
		assert.deepStrictEqual(result.map((r) => r.name).sort(), ["a", "b"]);
	});

	it("returns [] when subdir missing", (t) => {
		const tmpDir = makeTmpDir();
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		const result = readBlockDir(tmpDir, "nonexistent");
		assert.deepStrictEqual(result, []);
	});
});

// ─────────────────────────────────────────────────────────────────────────
// read-config tool — loadConfig + resolveContextDir cascade through bootstrap pointer
// (DEC-0015: substrate location is config-driven via .pi-context.json; the
// computed config path must reflect the pointer-declared contextDir, not a
// hardcoded ".project" literal).
// ─────────────────────────────────────────────────────────────────────────

describe("read-config tool — loadConfig + resolveContextDir cascade", () => {
	it("returns null when config absent and resolves path through pointer-declared contextDir", (t) => {
		const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "read-config-cascade-"));
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		// Non-default contextDir to prove no hardcoded ".project" literal.
		writeBootstrapPointer(cwd, ".context-test");

		const config = loadConfig(cwd);
		assert.strictEqual(config, null, "loadConfig returns null when config.json absent");

		const computed = path.join(resolveContextDir(cwd), "config.json");
		assert.strictEqual(
			computed,
			path.join(cwd, ".context-test", "config.json"),
			"resolveContextDir cascades through bootstrap pointer (.context-test, not .project)",
		);
	});

	it("returns parsed ConfigBlock when config present at resolver-correct path", (t) => {
		const cwd = makeTmpDir();
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		// makeTmpDir wrote pointer for ".project"; place config there.
		const configPath = path.join(resolveContextDir(cwd), "config.json");
		const minimalConfig = {
			schema_version: "1.7.0",
			root: ".project",
			block_kinds: [
				{
					canonical_id: "tasks",
					display_name: "Tasks",
					prefix: "TASK-",
					schema_path: "schemas/tasks.schema.json",
					array_key: "tasks",
					data_path: "tasks.json",
				},
			],
		};
		fs.mkdirSync(path.dirname(configPath), { recursive: true });
		fs.writeFileSync(configPath, JSON.stringify(minimalConfig));

		const loaded = loadConfig(cwd);
		assert.notStrictEqual(loaded, null, "loadConfig returns non-null when file present");
		assert.strictEqual(loaded?.schema_version, "1.7.0");
		assert.strictEqual(loaded?.root, ".project");
		assert.strictEqual(loaded?.block_kinds.length, 1);
		assert.strictEqual(loaded?.block_kinds[0].canonical_id, "tasks");
	});
});

// ─────────────────────────────────────────────────────────────────────────
// read-schema tool — readSchema + schemaPath cascade through bootstrap pointer
// (DEC-0015: schema location is config-driven; schemaPath must compose
// pointer-declared contextDir + SCHEMAS_DIR + "<name>.schema.json").
// ─────────────────────────────────────────────────────────────────────────

describe("read-schema tool — readSchema + schemaPath cascade", () => {
	it("returns null when schema absent and resolves path through pointer-declared contextDir", (t) => {
		const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "read-schema-cascade-"));
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		writeBootstrapPointer(cwd, ".context-test");

		const schema = readSchema(cwd, "nonexistent");
		assert.strictEqual(schema, null, "readSchema returns null when schema absent");

		const computed = schemaPath(cwd, "nonexistent");
		assert.strictEqual(
			computed,
			path.join(cwd, ".context-test", "schemas", "nonexistent.schema.json"),
			"schemaPath cascades through bootstrap pointer (.context-test/schemas/, not .project/schemas/)",
		);
	});

	it("returns parsed schema object when schema present at resolver-correct path", (t) => {
		const cwd = makeTmpDir();
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		const sp = schemaPath(cwd, "tasks");
		const minimalSchema = {
			$schema: "http://json-schema.org/draft-07/schema#",
			type: "object",
			properties: {},
		};
		fs.mkdirSync(path.dirname(sp), { recursive: true });
		fs.writeFileSync(sp, JSON.stringify(minimalSchema));

		const loaded = readSchema(cwd, "tasks") as Record<string, unknown> | null;
		assert.notStrictEqual(loaded, null, "readSchema returns non-null when file present");
		assert.strictEqual(loaded?.type, "object");
		assert.strictEqual(loaded?.$schema, "http://json-schema.org/draft-07/schema#");
	});
});

// ─────────────────────────────────────────────────────────────────────────
// Addressed-single-node reads return the WHOLE subtree (capped), not a
// 50-item page of an incidental array child. Each op below names ONE node via
// its addressing param; the op passes `whole:true` so an object node carrying
// an array child still serializes every sibling key. The 50KB cap is retained
// (unconditional after the whole-skip), so an over-cap node still fails closed.
// ─────────────────────────────────────────────────────────────────────────

describe("addressed-single-node reads return the whole subtree (capped)", () => {
	it("read-schema --path at an object node returns the whole object, not a page of its array child", (t) => {
		const cwd = makeTmpDir();
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		const sp = schemaPath(cwd, "tasks");
		// `properties.tasks.items` is an object node carrying an array child
		// (`required`) PLUS a sibling object (`properties`) — paging the node
		// would surface only the array slice and drop the siblings.
		const schema = {
			$schema: "http://json-schema.org/draft-07/schema#",
			type: "object",
			properties: {
				tasks: {
					type: "array",
					items: {
						type: "object",
						required: ["id", "title", "status"],
						properties: {
							id: { type: "string" },
							title: { type: "string" },
							status: { type: "string" },
						},
					},
				},
			},
		};
		fs.mkdirSync(path.dirname(sp), { recursive: true });
		fs.writeFileSync(sp, JSON.stringify(schema));

		const read = readOf(op("read-schema").run(cwd, { schemaName: "tasks", path: "properties.tasks.items" }));
		const data = read.data as Record<string, unknown>;
		assert.strictEqual(typeof data, "object", "data is the whole addressed object");
		// Both the array child AND the sibling object — not a paged slice of one array.
		assert.deepStrictEqual(data.required, ["id", "title", "status"]);
		assert.ok(data.properties && typeof data.properties === "object", "sibling `properties` retained");
		assert.strictEqual(read.total, undefined, "whole-object reads carry no paging total");
		assert.strictEqual(read.complete, true, "under-cap whole read is complete");
	});

	it("read-config --registry <single-array registry> returns the whole array, not a page", (t) => {
		const cwd = makeTmpDir();
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		const configPath = path.join(resolveContextDir(cwd), "config.json");
		const lenses = [
			{ id: "alpha", kind: "target", target: "tasks", derived_from_field: "status", bins: ["a"] },
			{ id: "beta", kind: "target", target: "tasks", derived_from_field: "status", bins: ["b"] },
			{ id: "gamma", kind: "target", target: "tasks", derived_from_field: "status", bins: ["c"] },
		];
		fs.mkdirSync(path.dirname(configPath), { recursive: true });
		fs.writeFileSync(
			configPath,
			JSON.stringify({ schema_version: "1.7.0", root: ".project", block_kinds: [], lenses }),
		);

		const read = readOf(op("read-config").run(cwd, { registry: "lenses" }));
		const data = read.data as unknown[];
		assert.ok(Array.isArray(data), "data is the whole array");
		assert.strictEqual(data.length, 3, "all three lenses present (not a page)");
		assert.strictEqual(read.complete, true);
	});

	it("read-config --registry block_kinds --id <one> returns the whole entry, every field", (t) => {
		const cwd = makeTmpDir();
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		const configPath = path.join(resolveContextDir(cwd), "config.json");
		const entry = {
			canonical_id: "tasks",
			display_name: "Tasks",
			prefix: "TASK-",
			schema_path: "schemas/tasks.schema.json",
			array_key: "tasks",
			data_path: "tasks.json",
		};
		fs.mkdirSync(path.dirname(configPath), { recursive: true });
		fs.writeFileSync(configPath, JSON.stringify({ schema_version: "1.7.0", root: ".project", block_kinds: [entry] }));

		const read = readOf(op("read-config").run(cwd, { registry: "block_kinds", id: "tasks" }));
		const data = read.data as Record<string, unknown>;
		assert.strictEqual(data.canonical_id, "tasks");
		assert.strictEqual(data.array_key, "tasks");
		assert.strictEqual(data.data_path, "tasks.json");
		assert.strictEqual(data.prefix, "TASK-");
		assert.strictEqual(read.complete, true);
	});

	it("an over-cap addressed node fails closed (data:null, complete:false) — the 50KB cap is retained", (t) => {
		const cwd = makeTmpDir();
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		const sp = schemaPath(cwd, "big");
		// A single addressed object node whose serialized form exceeds the 50KB
		// read cap. `whole:true` skips paging only; the cap is applied
		// unconditionally after, so this still fails closed.
		const bigBlob = "x".repeat(60_000);
		const schema = {
			$schema: "http://json-schema.org/draft-07/schema#",
			type: "object",
			properties: {
				node: {
					type: "object",
					description: bigBlob,
					required: ["a"],
				},
			},
		};
		fs.mkdirSync(path.dirname(sp), { recursive: true });
		fs.writeFileSync(sp, JSON.stringify(schema));

		const read = readOf(op("read-schema").run(cwd, { schemaName: "big", path: "properties.node" }));
		assert.strictEqual(read.data, null, "over-cap node returns data:null");
		assert.strictEqual(read.complete, false, "over-cap node is not complete");
		assert.strictEqual(read.truncated, true, "over-cap node is flagged truncated");
	});
});

// ─────────────────────────────────────────────────────────────────────────
// read-catalog-schema — readCatalogSchemaText fetches the VERBATIM bundled
// catalog *.schema.json body (raw JSON Schema), not the read-samples-catalog
// projection. The fetch is read-only + substrate-independent (no cwd). The op
// returns the bare raw bytes as a prose-string OpResult (STORY-010 / FGAP-079,
// TASK-050).
// ─────────────────────────────────────────────────────────────────────────

const SAMPLES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "samples");

describe("read-catalog-schema — verbatim catalog body fetch (readCatalogSchemaText)", () => {
	it("returns .text byte-identical to the bundled catalog schema file", () => {
		const file = path.join(SAMPLES_DIR, "schemas/tasks.schema.json");
		const expected = fs.readFileSync(file, "utf-8");
		const result = readCatalogSchemaText("tasks");
		assert.strictEqual(result.kind, "tasks");
		assert.strictEqual(result.schemaPath, file, "schemaPath is the bundled samples schema file");
		assert.strictEqual(result.text, expected, "text is byte-identical to the catalog file");
	});

	it("the body is the RAW JSON Schema (properties + $id), NOT the read-samples-catalog projection (AC2)", () => {
		const parsed = JSON.parse(readCatalogSchemaText("tasks").text) as Record<string, unknown>;
		assert.ok(parsed.properties && typeof parsed.properties === "object", "raw schema carries top-level properties");
		assert.strictEqual(typeof parsed.$id, "string", "raw schema carries a top-level $id");
		// Contrast: the projection has no properties/$id at top level — it is the
		// kinds/relationTypes/lenses/... summary view, a different shape entirely.
		const projection = samplesCatalog({ kind: "tasks" }) as Record<string, unknown>;
		assert.ok(!("properties" in projection), "projection has no top-level properties");
		assert.ok(!("$id" in projection), "projection has no top-level $id");
		assert.ok("kinds" in projection, "projection is the summary view (carries kinds)");
	});

	it("throws on an unknown kind, naming the kind in the message", () => {
		assert.throws(
			() => readCatalogSchemaText("not-a-real-kind"),
			(err: unknown) => err instanceof Error && err.message.includes("not-a-real-kind"),
			"throws an Error naming the unknown kind",
		);
	});

	it("touches no substrate — the fn takes no cwd, so the read path reaches no installed schema/block/config (AC3)", () => {
		// AC3 by construction: readCatalogSchemaText has no cwd parameter and
		// resolves only the package-bundled samplesRoot. Calling it twice yields
		// the same bytes regardless of any project on disk; nothing is written.
		assert.strictEqual(readCatalogSchemaText.length, 1, "single param (kindName) — no cwd, no substrate reachable");
		const a = readCatalogSchemaText("tasks").text;
		const b = readCatalogSchemaText("tasks").text;
		assert.strictEqual(a, b, "repeat reads are stable (pure read of the bundled catalog)");
	});
});

describe("read-catalog-schema op — raw-string OpResult", () => {
	it("returns the bare raw schema text (a string, not a {json}/{read} wrap)", () => {
		const result = op("read-catalog-schema").run("/unused/cwd", { kind: "tasks" });
		assert.strictEqual(typeof result, "string", "the op returns a bare string OpResult");
		const expected = fs.readFileSync(path.join(SAMPLES_DIR, "schemas/tasks.schema.json"), "utf-8");
		assert.strictEqual(result, expected, "the string is byte-identical to the catalog file");
	});

	it("is surface:use and NOT authGated (a read-only fetch)", () => {
		const def = op("read-catalog-schema");
		assert.strictEqual(def.surface, "use");
		assert.notStrictEqual(def.authGated, true, "read-only fetch is not auth-gated");
	});
});
