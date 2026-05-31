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
});
