/**
 * Cycle 9 / PART 1 — id-uniqueness guard on the block-append primitives.
 *
 * The pure-append (`appendToTypedFile`), block-append (`appendToBlockForDir`),
 * and whole-file-write (`writeBlockForDir`) paths reject a duplicate `id`
 * within a block array — atomically, inside their `withBlockLock` critical
 * section (the prior tool-layer readBlock-then-append check was racy + has been
 * removed). The guard MUST NOT fire on upsert (replace-by-id is intended), on
 * id-less items, or on `appendManyToTypedFileIfAbsent` (its matchKey skip is the
 * dedup).
 */

import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
	appendManyToTypedFileIfAbsent,
	appendToBlockForDir,
	appendToNestedArrayForDir,
	appendToTypedFile,
	upsertItemInBlockForDir,
	writeBlockForDir,
} from "./block-api.js";
import { writeBootstrapPointer } from "./context-dir.js";

function makeTmpDir(prefix: string): string {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), `append-uniqueness-${prefix}-`));
	writeBootstrapPointer(cwd, ".project");
	return cwd;
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
				required: ["id", "description"],
				properties: {
					id: { type: "string", pattern: "^FGAP-\\d{3}$" },
					description: { type: "string" },
				},
			},
		},
	},
};

// A top-level array (`reviews`) whose items carry a nested id-bearing array
// (`findings`) — the shape the Cycle 9.1 P4 nested guard targets. Nested items
// allow an id-less shape too (so the "id-less not rejected" case is exercisable).
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
							required: ["note"],
							properties: {
								id: { type: "string" },
								note: { type: "string" },
							},
						},
					},
				},
			},
		},
	},
};

describe("append id-uniqueness guard", () => {
	it("appendToTypedFile (object-with-array-field): duplicate id throws", () => {
		const cwd = makeTmpDir("typed");
		const dir = path.join(cwd, ".project");
		fs.mkdirSync(dir, { recursive: true });
		setupSchema(cwd, "gaps", gapsSchema);
		const filePath = path.join(dir, "gaps.json");
		const schemaPath = path.join(dir, "schemas", "gaps.schema.json");
		fs.writeFileSync(filePath, JSON.stringify({ gaps: [] }));

		appendToTypedFile(filePath, schemaPath, "gaps", { id: "FGAP-001", description: "first" });
		assert.throws(
			() => appendToTypedFile(filePath, schemaPath, "gaps", { id: "FGAP-001", description: "dup" }),
			/Item 'FGAP-001' already exists in .*\.gaps/,
		);
		// On-disk array unchanged — still exactly one item.
		const data = JSON.parse(fs.readFileSync(filePath, "utf-8")) as { gaps: unknown[] };
		assert.strictEqual(data.gaps.length, 1);
	});

	it("appendToTypedFile (flat top-level array): duplicate id throws", () => {
		const cwd = makeTmpDir("flat");
		const dir = path.join(cwd, ".project");
		fs.mkdirSync(dir, { recursive: true });
		const filePath = path.join(dir, "flat.json");
		fs.writeFileSync(filePath, JSON.stringify([{ id: "A", v: 1 }]));
		assert.throws(
			() => appendToTypedFile(filePath, null, null, { id: "A", v: 2 }),
			/Item 'A' already exists in .*\.__top__/,
		);
		// A different id appends fine.
		appendToTypedFile(filePath, null, null, { id: "B", v: 2 });
		const arr = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown[];
		assert.strictEqual(arr.length, 2);
	});

	it("appendToBlockForDir: duplicate id throws (inline write path, separate guard)", () => {
		const cwd = makeTmpDir("block");
		const dir = path.join(cwd, ".project");
		fs.mkdirSync(dir, { recursive: true });
		setupSchema(cwd, "gaps", gapsSchema);
		fs.writeFileSync(path.join(dir, "gaps.json"), JSON.stringify({ gaps: [] }));

		appendToBlockForDir(dir, "gaps", "gaps", { id: "FGAP-002", description: "first" });
		assert.throws(
			() => appendToBlockForDir(dir, "gaps", "gaps", { id: "FGAP-002", description: "dup" }),
			/Item 'FGAP-002' already exists in gaps\.gaps/,
		);
	});

	it("upsertItemInBlockForDir: duplicate id REPLACES (no throw)", () => {
		const cwd = makeTmpDir("upsert");
		const dir = path.join(cwd, ".project");
		fs.mkdirSync(dir, { recursive: true });
		setupSchema(cwd, "gaps", gapsSchema);
		fs.writeFileSync(path.join(dir, "gaps.json"), JSON.stringify({ gaps: [] }));

		upsertItemInBlockForDir(dir, "gaps", "gaps", { id: "FGAP-003", description: "v1" }, "id");
		// Same id again → replace, NOT throw.
		assert.doesNotThrow(() =>
			upsertItemInBlockForDir(dir, "gaps", "gaps", { id: "FGAP-003", description: "v2" }, "id"),
		);
		const data = JSON.parse(fs.readFileSync(path.join(dir, "gaps.json"), "utf-8")) as {
			gaps: Array<{ id: string; description: string }>;
		};
		assert.strictEqual(data.gaps.length, 1);
		assert.strictEqual(data.gaps[0].description, "v2");
	});

	it("writeBlockForDir: whole-file array with two same-id items throws", () => {
		const cwd = makeTmpDir("wholefile");
		const dir = path.join(cwd, ".project");
		fs.mkdirSync(dir, { recursive: true });
		setupSchema(cwd, "gaps", gapsSchema);

		assert.throws(
			() =>
				writeBlockForDir(dir, "gaps", {
					gaps: [
						{ id: "FGAP-010", description: "a" },
						{ id: "FGAP-010", description: "b" },
					],
				}),
			/Item 'FGAP-010' already exists in gaps\.gaps/,
		);
		// Nothing written.
		assert.strictEqual(fs.existsSync(path.join(dir, "gaps.json")), false);
	});

	it("items with no id field are NOT rejected", () => {
		const cwd = makeTmpDir("noid");
		const dir = path.join(cwd, ".project");
		fs.mkdirSync(dir, { recursive: true });
		const filePath = path.join(dir, "notes.json");
		fs.writeFileSync(filePath, JSON.stringify([{ note: "x" }]));
		// No schema, no id field — two id-less appends both succeed.
		assert.doesNotThrow(() => appendToTypedFile(filePath, null, null, { note: "y" }));
		assert.doesNotThrow(() => appendToTypedFile(filePath, null, null, { note: "z" }));
		const arr = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown[];
		assert.strictEqual(arr.length, 3);
	});

	it("appendManyToTypedFileIfAbsent matchKey skip is unaffected by the guard", () => {
		const cwd = makeTmpDir("ifabsent");
		const dir = path.join(cwd, ".project");
		fs.mkdirSync(dir, { recursive: true });
		const filePath = path.join(dir, "edges.json");
		fs.writeFileSync(filePath, JSON.stringify([{ id: "E1" }]));
		// Two candidates share matchKey with the existing E1 → skipped via the
		// matchKey dedup; a genuinely new E2 is appended. No duplicate-id throw.
		const res = appendManyToTypedFileIfAbsent(
			filePath,
			null,
			null,
			[{ id: "E1" }, { id: "E2" }],
			(it) => (it as { id: string }).id,
		);
		assert.strictEqual(res.appended, 1);
		assert.strictEqual(res.skipped, 1);
		const arr = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown[];
		assert.strictEqual(arr.length, 2);
	});

	// ── Cycle 9.1 P4: nested id-bearing arrays ────────────────────────────────

	it("appendToNestedArrayForDir: nested duplicate id throws (label names parent.nested)", () => {
		const cwd = makeTmpDir("nested-dup");
		const dir = path.join(cwd, ".project");
		fs.mkdirSync(dir, { recursive: true });
		setupSchema(cwd, "reviews", reviewsSchema);
		fs.writeFileSync(
			path.join(dir, "reviews.json"),
			JSON.stringify({ reviews: [{ id: "R1", findings: [{ id: "F1", note: "first" }] }] }),
		);

		const parentPred = (it: Record<string, unknown>) => it.id === "R1";
		assert.throws(
			() => appendToNestedArrayForDir(dir, "reviews", "reviews", parentPred, "findings", { id: "F1", note: "dup" }),
			/Item 'F1' already exists in .*\.reviews\.findings/,
		);
		// On-disk nested array unchanged — still exactly one finding.
		const data = JSON.parse(fs.readFileSync(path.join(dir, "reviews.json"), "utf-8")) as {
			reviews: Array<{ findings: unknown[] }>;
		};
		assert.strictEqual(data.reviews[0].findings.length, 1);
	});

	it("appendToNestedArrayForDir: id-less nested item is NOT rejected", () => {
		const cwd = makeTmpDir("nested-noid");
		const dir = path.join(cwd, ".project");
		fs.mkdirSync(dir, { recursive: true });
		setupSchema(cwd, "reviews", reviewsSchema);
		fs.writeFileSync(
			path.join(dir, "reviews.json"),
			JSON.stringify({ reviews: [{ id: "R1", findings: [{ note: "a" }] }] }),
		);

		const parentPred = (it: Record<string, unknown>) => it.id === "R1";
		assert.doesNotThrow(() =>
			appendToNestedArrayForDir(dir, "reviews", "reviews", parentPred, "findings", { note: "b" }),
		);
		const data = JSON.parse(fs.readFileSync(path.join(dir, "reviews.json"), "utf-8")) as {
			reviews: Array<{ findings: unknown[] }>;
		};
		assert.strictEqual(data.reviews[0].findings.length, 2);
	});

	it("writeBlockForDir: whole-file recurse rejects two same-id items in a NESTED array", () => {
		const cwd = makeTmpDir("nested-wholefile");
		const dir = path.join(cwd, ".project");
		fs.mkdirSync(dir, { recursive: true });
		setupSchema(cwd, "reviews", reviewsSchema);

		assert.throws(
			() =>
				writeBlockForDir(dir, "reviews", {
					reviews: [
						{
							id: "R1",
							findings: [
								{ id: "F9", note: "a" },
								{ id: "F9", note: "b" },
							],
						},
					],
				}),
			/Item 'F9' already exists in reviews\.findings/,
		);
		// Nothing written.
		assert.strictEqual(fs.existsSync(path.join(dir, "reviews.json")), false);
	});
});
