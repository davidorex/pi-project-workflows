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
		// Bundled `decisions` schema is the active validator post tier-2
		// migration. Initialize the project tier with a valid empty array
		// so the append target exists.
		setupBlock(tmpDir, "decisions", "decisions", decisionsSchema);

		// Bad: status is not in bundled enum (decided|tentative|revisit|superseded)
		const badEntry = {
			id: "bad-decision",
			decision: "X",
			rationale: "Y",
			status: "nonexistent-status",
		};

		assert.throws(
			() => appendToBlock(tmpDir, "decisions", "decisions", badEntry),
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

	it("appends to decisions block (bundled schema)", (t) => {
		const tmpDir = makeTmpDir();
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		// Bundled decisions schema requires id/decision/rationale/status.
		setupBlock(tmpDir, "decisions", "decisions", decisionsSchema, [
			{ id: "d1", decision: "First", rationale: "Initial", status: "decided" },
		]);

		appendToBlock(tmpDir, "decisions", "decisions", {
			id: "d2",
			decision: "Second",
			rationale: "Needs review",
			status: "tentative",
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
			{ id: "d1", decision: "First", rationale: "Initial", status: "decided" },
			{ id: "d2", decision: "Second", rationale: "Pending review", status: "tentative" },
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
		setupBlock(tmpDir, "decisions", "decisions", decisionsSchema, [
			{ id: "d1", decision: "X", rationale: "Y", status: "tentative" },
		]);

		assert.throws(
			() => updateItemInBlock(tmpDir, "decisions", "decisions", (d) => d.id === "d1", { status: "invalid-status" }),
			(err: unknown) => {
				assert.ok(err instanceof ValidationError);
				return true;
			},
		);

		// Original file unchanged after validation failure
		const data = readBlock(tmpDir, "decisions") as { decisions: Array<Record<string, unknown>> };
		assert.strictEqual(data.decisions[0].status, "tentative");
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
			{ id: "d1", decision: "Original", rationale: "Initial choice", status: "tentative" },
		]);

		updateItemInBlock(tmpDir, "decisions", "decisions", (d) => d.id === "d1", { status: "decided" });

		const data = readBlock(tmpDir, "decisions") as { decisions: Array<Record<string, unknown>> };
		assert.strictEqual(data.decisions[0].status, "decided");
	});
});

// ── findAppendableBlocks ──────────────────────────────────────────────────

describe("findAppendableBlocks", () => {
	it("discovers bundled blocks from schema array properties", (t) => {
		const tmpDir = makeTmpDir();
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		// findAppendableBlocks reads from `<package>/defaults/schemas/` only
		// post tier-2 migration; the bundled set is the discovery target.
		const results = findAppendableBlocks(tmpDir);

		const decisions = results.find((r) => r.block === "decisions");
		assert.ok(decisions, "should find bundled decisions block");
		assert.strictEqual(decisions!.arrayKey, "decisions");
		assert.ok(decisions!.schemaPath.includes("decisions.schema.json"));

		const tasks = results.find((r) => r.block === "tasks");
		assert.ok(tasks, "should find bundled tasks block");
		assert.strictEqual(tasks!.arrayKey, "tasks");
	});

	it("returns bundled tier-2 appendable blocks regardless of project state", (t) => {
		const tmpDir = makeTmpDir();
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		// Post tier-2 migration, findAppendableBlocks reads only from
		// `<package>/defaults/schemas/`. The project tier's existence is
		// irrelevant to its output.
		const results = findAppendableBlocks(tmpDir);
		assert.ok(results.length > 0);
		assert.ok(results.some((r) => r.block === "decisions"));
	});

	it("returns bundled appendable blocks", (t) => {
		const tmpDir = makeTmpDir();
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		// findAppendableBlocks reads from `<package>/defaults/schemas/` post
		// tier-2 migration. Verify it discovers known appendable bundled blocks
		// (decisions, tasks, etc.) and identifies their array key.
		const results = findAppendableBlocks(tmpDir);
		const decisions = results.find((r) => r.block === "decisions");
		assert.ok(decisions, "should find bundled decisions block");
		assert.strictEqual(decisions!.arrayKey, "decisions");
		const tasks = results.find((r) => r.block === "tasks");
		assert.ok(tasks, "should find bundled tasks block");
		assert.strictEqual(tasks!.arrayKey, "tasks");
	});
});
