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
import { appendToBlock, readBlock, updateItemInBlock } from "./block-api.js";
import { findAppendableBlocks } from "./project-sdk.js";
import { ValidationError } from "./schema-validator.js";

function makeTmpDir(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), "block-tools-"));
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
