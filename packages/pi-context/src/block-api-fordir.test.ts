/**
 * Cycle 1 / Phase 0 — dir-targeted block-api primitives.
 *
 * Proves the `*ForDir(substrateDir, …)` variants address an EXPLICIT substrate
 * directory rather than the cwd-resolved active one, and that the cwd forms are
 * thin wrappers (`fn(cwd,…) = fnForDir(resolveContextDir(cwd),…)`) whose on-disk
 * effect is byte-identical to the ForDir form invoked with the resolved dir.
 *
 * Four families per the plan's Verification §2:
 *   (a) explicit-dir write/read — the ForDir variant lands in the dir passed.
 *   (b) equivalence — `fn(cwd,…)` and `fnForDir(resolveContextDir(cwd),…)`
 *       produce byte-identical files.
 *   (c) multi-substrate isolation — `.subA` active + `.subB` target: a write
 *       into `.subB` leaves `.subA` untouched and never moves the pointer
 *       (`resolveContextDir(cwd)` still returns `.subA`).
 *   (d) migration path — `writeBlockForDir` on a version-bumped block reads the
 *       TARGET dir's schema + migrations.json, never the active dir's.
 */

import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
	appendToBlock,
	appendToBlockForDir,
	appendToNestedArray,
	appendToNestedArrayForDir,
	nextId,
	nextIdForDir,
	readBlock,
	readBlockDir,
	readBlockDirForDir,
	readBlockForDir,
	removeFromBlock,
	removeFromBlockForDir,
	removeFromNestedArray,
	removeFromNestedArrayForDir,
	updateItemInBlock,
	updateItemInBlockForDir,
	updateNestedArrayItem,
	updateNestedArrayItemForDir,
	upsertItemInBlock,
	upsertItemInBlockForDir,
	writeBlock,
	writeBlockForDir,
} from "./block-api.js";
import { resolveContextDir, writeBootstrapPointer } from "./context-dir.js";

/** Make a tmp project whose active substrate is `.project`. */
function makeTmpDir(prefix: string): string {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), `block-api-fordir-${prefix}-`));
	writeBootstrapPointer(cwd, ".project");
	return cwd;
}

function setupWorkflowDir(tmpDir: string): string {
	const wfDir = path.join(tmpDir, ".project");
	fs.mkdirSync(wfDir, { recursive: true });
	return wfDir;
}

function setupSchema(tmpDir: string, substrateRel: string, blockName: string, schema: Record<string, unknown>): void {
	const schemasDir = path.join(tmpDir, substrateRel, "schemas");
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
					id: { type: "string", pattern: "^FGAP-\\d{3}$" },
					description: { type: "string" },
					status: { type: "string", enum: ["open", "resolved", "deferred"] },
				},
			},
		},
	},
};

const nestedSchema = {
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
							required: ["fid", "note"],
							properties: {
								fid: { type: "string" },
								note: { type: "string" },
							},
						},
					},
				},
			},
		},
	},
};

// ── (a) explicit-dir write/read ──────────────────────────────────────────────

describe("ForDir: explicit-dir write/read", () => {
	it("writeBlockForDir + readBlockForDir land in the dir passed, not the active one", (t) => {
		const tmpDir = makeTmpDir("explicit");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		// Active substrate is .project; the explicit target is .subB.
		setupWorkflowDir(tmpDir);
		const subB = path.join(tmpDir, ".subB");
		fs.mkdirSync(subB, { recursive: true });
		setupSchema(tmpDir, ".subB", "gaps", gapsSchema);

		const data = { gaps: [{ id: "FGAP-001", description: "x", status: "open" }] };
		writeBlockForDir(subB, "gaps", data);

		assert.ok(fs.existsSync(path.join(subB, "gaps.json")), "must write into .subB");
		assert.ok(!fs.existsSync(path.join(tmpDir, ".project", "gaps.json")), "must NOT write into active .project");
		assert.deepStrictEqual(readBlockForDir(subB, "gaps"), data);
	});

	it("appendToBlockForDir + nextIdForDir allocate + append into the dir passed", (t) => {
		const tmpDir = makeTmpDir("explicit-append");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);
		const subB = path.join(tmpDir, ".subB");
		fs.mkdirSync(subB, { recursive: true });
		setupSchema(tmpDir, ".subB", "gaps", gapsSchema);
		fs.writeFileSync(path.join(subB, "gaps.json"), JSON.stringify({ gaps: [] }));

		const id = nextIdForDir(subB, "gaps");
		assert.strictEqual(id, "FGAP-001");
		appendToBlockForDir(subB, "gaps", "gaps", { id, description: "first", status: "open" });

		const after = readBlockForDir(subB, "gaps") as { gaps: unknown[] };
		assert.strictEqual(after.gaps.length, 1);
		assert.strictEqual(nextIdForDir(subB, "gaps"), "FGAP-002");
	});

	it("readBlockDirForDir reads a subdir of the dir passed (missing → [])", (t) => {
		const tmpDir = makeTmpDir("explicit-dir");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		const subB = path.join(tmpDir, ".subB");
		fs.mkdirSync(path.join(subB, "items"), { recursive: true });
		fs.writeFileSync(path.join(subB, "items", "a.json"), JSON.stringify({ n: 1 }));
		fs.writeFileSync(path.join(subB, "items", "b.json"), JSON.stringify({ n: 2 }));

		assert.deepStrictEqual(readBlockDirForDir(subB, "items"), [{ n: 1 }, { n: 2 }]);
		assert.deepStrictEqual(readBlockDirForDir(subB, "missing"), []);
	});
});

// ── (b) equivalence: fn(cwd,…) byte-identical to fnForDir(resolveContextDir(cwd),…)

describe("ForDir: cwd-form ≡ fnForDir(resolveContextDir(cwd))", () => {
	function freshGapsProject(prefix: string): { tmpDir: string; resolved: string } {
		const tmpDir = makeTmpDir(prefix);
		setupWorkflowDir(tmpDir);
		setupSchema(tmpDir, ".project", "gaps", gapsSchema);
		fs.writeFileSync(path.join(tmpDir, ".project", "gaps.json"), JSON.stringify({ gaps: [] }));
		return { tmpDir, resolved: resolveContextDir(tmpDir) };
	}

	const blockPath = (tmpDir: string) => path.join(tmpDir, ".project", "gaps.json");

	it("writeBlock ≡ writeBlockForDir", (t) => {
		const a = freshGapsProject("eq-write-a");
		const b = freshGapsProject("eq-write-b");
		t.after(() => {
			fs.rmSync(a.tmpDir, { recursive: true, force: true });
			fs.rmSync(b.tmpDir, { recursive: true, force: true });
		});
		const data = { gaps: [{ id: "FGAP-001", description: "d", status: "open" }] };
		writeBlock(a.tmpDir, "gaps", data);
		writeBlockForDir(b.resolved, "gaps", data);
		assert.strictEqual(fs.readFileSync(blockPath(a.tmpDir), "utf-8"), fs.readFileSync(blockPath(b.tmpDir), "utf-8"));
	});

	it("appendToBlock ≡ appendToBlockForDir", (t) => {
		const a = freshGapsProject("eq-append-a");
		const b = freshGapsProject("eq-append-b");
		t.after(() => {
			fs.rmSync(a.tmpDir, { recursive: true, force: true });
			fs.rmSync(b.tmpDir, { recursive: true, force: true });
		});
		const item = { id: "FGAP-001", description: "appended", status: "open" };
		appendToBlock(a.tmpDir, "gaps", "gaps", item);
		appendToBlockForDir(b.resolved, "gaps", "gaps", item);
		assert.strictEqual(fs.readFileSync(blockPath(a.tmpDir), "utf-8"), fs.readFileSync(blockPath(b.tmpDir), "utf-8"));
	});

	it("updateItemInBlock ≡ updateItemInBlockForDir", (t) => {
		const a = freshGapsProject("eq-update-a");
		const b = freshGapsProject("eq-update-b");
		t.after(() => {
			fs.rmSync(a.tmpDir, { recursive: true, force: true });
			fs.rmSync(b.tmpDir, { recursive: true, force: true });
		});
		const item = { id: "FGAP-001", description: "v1", status: "open" };
		appendToBlock(a.tmpDir, "gaps", "gaps", item);
		appendToBlockForDir(b.resolved, "gaps", "gaps", item);
		const pred = (it: Record<string, unknown>) => it.id === "FGAP-001";
		updateItemInBlock(a.tmpDir, "gaps", "gaps", pred, { status: "resolved" });
		updateItemInBlockForDir(b.resolved, "gaps", "gaps", pred, { status: "resolved" });
		assert.strictEqual(fs.readFileSync(blockPath(a.tmpDir), "utf-8"), fs.readFileSync(blockPath(b.tmpDir), "utf-8"));
	});

	it("upsertItemInBlock ≡ upsertItemInBlockForDir", (t) => {
		const a = freshGapsProject("eq-upsert-a");
		const b = freshGapsProject("eq-upsert-b");
		t.after(() => {
			fs.rmSync(a.tmpDir, { recursive: true, force: true });
			fs.rmSync(b.tmpDir, { recursive: true, force: true });
		});
		const item = { id: "FGAP-001", description: "upserted", status: "open" };
		const ra = upsertItemInBlock(a.tmpDir, "gaps", "gaps", item, "id");
		const rb = upsertItemInBlockForDir(b.resolved, "gaps", "gaps", item, "id");
		assert.deepStrictEqual(ra, rb);
		assert.strictEqual(fs.readFileSync(blockPath(a.tmpDir), "utf-8"), fs.readFileSync(blockPath(b.tmpDir), "utf-8"));
	});

	it("removeFromBlock ≡ removeFromBlockForDir", (t) => {
		const a = freshGapsProject("eq-remove-a");
		const b = freshGapsProject("eq-remove-b");
		t.after(() => {
			fs.rmSync(a.tmpDir, { recursive: true, force: true });
			fs.rmSync(b.tmpDir, { recursive: true, force: true });
		});
		const item = { id: "FGAP-001", description: "doomed", status: "open" };
		appendToBlock(a.tmpDir, "gaps", "gaps", item);
		appendToBlockForDir(b.resolved, "gaps", "gaps", item);
		const pred = (it: Record<string, unknown>) => it.id === "FGAP-001";
		const ra = removeFromBlock(a.tmpDir, "gaps", "gaps", pred);
		const rb = removeFromBlockForDir(b.resolved, "gaps", "gaps", pred);
		assert.deepStrictEqual(ra, rb);
		assert.strictEqual(fs.readFileSync(blockPath(a.tmpDir), "utf-8"), fs.readFileSync(blockPath(b.tmpDir), "utf-8"));
	});

	it("nextId ≡ nextIdForDir", (t) => {
		const a = freshGapsProject("eq-nextid-a");
		t.after(() => fs.rmSync(a.tmpDir, { recursive: true, force: true }));
		assert.strictEqual(nextId(a.tmpDir, "gaps"), nextIdForDir(a.resolved, "gaps"));
	});

	it("readBlock ≡ readBlockForDir", (t) => {
		const a = freshGapsProject("eq-read-a");
		t.after(() => fs.rmSync(a.tmpDir, { recursive: true, force: true }));
		appendToBlock(a.tmpDir, "gaps", "gaps", { id: "FGAP-001", description: "r", status: "open" });
		assert.deepStrictEqual(readBlock(a.tmpDir, "gaps"), readBlockForDir(a.resolved, "gaps"));
	});

	it("readBlockDir ≡ readBlockDirForDir", (t) => {
		const a = freshGapsProject("eq-readdir-a");
		t.after(() => fs.rmSync(a.tmpDir, { recursive: true, force: true }));
		fs.mkdirSync(path.join(a.tmpDir, ".project", "items"), { recursive: true });
		fs.writeFileSync(path.join(a.tmpDir, ".project", "items", "x.json"), JSON.stringify({ k: 1 }));
		assert.deepStrictEqual(readBlockDir(a.tmpDir, "items"), readBlockDirForDir(a.resolved, "items"));
	});

	it("nested append/update/remove cwd ≡ ForDir", (t) => {
		const mk = (prefix: string): { tmpDir: string; resolved: string } => {
			const tmpDir = makeTmpDir(prefix);
			setupWorkflowDir(tmpDir);
			setupSchema(tmpDir, ".project", "reviews", nestedSchema);
			fs.writeFileSync(
				path.join(tmpDir, ".project", "reviews.json"),
				JSON.stringify({ reviews: [{ id: "R1", findings: [] }] }),
			);
			return { tmpDir, resolved: resolveContextDir(tmpDir) };
		};
		const a = mk("eq-nested-a");
		const b = mk("eq-nested-b");
		t.after(() => {
			fs.rmSync(a.tmpDir, { recursive: true, force: true });
			fs.rmSync(b.tmpDir, { recursive: true, force: true });
		});
		const reviewPath = (tmpDir: string) => path.join(tmpDir, ".project", "reviews.json");
		const parentPred = (it: Record<string, unknown>) => it.id === "R1";
		const finding = { fid: "F1", note: "first" };
		appendToNestedArray(a.tmpDir, "reviews", "reviews", parentPred, "findings", finding);
		appendToNestedArrayForDir(b.resolved, "reviews", "reviews", parentPred, "findings", finding);
		assert.strictEqual(fs.readFileSync(reviewPath(a.tmpDir), "utf-8"), fs.readFileSync(reviewPath(b.tmpDir), "utf-8"));

		const nestedPred = (it: Record<string, unknown>) => it.fid === "F1";
		updateNestedArrayItem(a.tmpDir, "reviews", "reviews", parentPred, "findings", nestedPred, { note: "edited" });
		updateNestedArrayItemForDir(b.resolved, "reviews", "reviews", parentPred, "findings", nestedPred, {
			note: "edited",
		});
		assert.strictEqual(fs.readFileSync(reviewPath(a.tmpDir), "utf-8"), fs.readFileSync(reviewPath(b.tmpDir), "utf-8"));

		const ra = removeFromNestedArray(a.tmpDir, "reviews", "reviews", parentPred, "findings", nestedPred);
		const rb = removeFromNestedArrayForDir(b.resolved, "reviews", "reviews", parentPred, "findings", nestedPred);
		assert.deepStrictEqual(ra, rb);
		assert.strictEqual(fs.readFileSync(reviewPath(a.tmpDir), "utf-8"), fs.readFileSync(reviewPath(b.tmpDir), "utf-8"));
	});
});

// ── (c) multi-substrate isolation ────────────────────────────────────────────

describe("ForDir: multi-substrate isolation (.subA active + .subB target)", () => {
	function twoSubstrates(prefix: string): { tmpDir: string; subA: string; subB: string } {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `block-api-fordir-${prefix}-`));
		// Active substrate is .subA.
		writeBootstrapPointer(tmpDir, ".subA");
		const subA = path.join(tmpDir, ".subA");
		const subB = path.join(tmpDir, ".subB");
		fs.mkdirSync(subA, { recursive: true });
		fs.mkdirSync(subB, { recursive: true });
		setupSchema(tmpDir, ".subA", "gaps", gapsSchema);
		setupSchema(tmpDir, ".subB", "gaps", gapsSchema);
		fs.writeFileSync(path.join(subA, "gaps.json"), JSON.stringify({ gaps: [] }, null, 2));
		fs.writeFileSync(path.join(subB, "gaps.json"), JSON.stringify({ gaps: [] }, null, 2));
		return { tmpDir, subA, subB };
	}

	it("write into .subB leaves .subA untouched and never moves the pointer", (t) => {
		const { tmpDir, subA, subB } = twoSubstrates("iso");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		// Sanity: pointer resolves to .subA before the cross-substrate write.
		assert.strictEqual(path.basename(resolveContextDir(tmpDir)), ".subA");
		const subASnapshot = fs.readFileSync(path.join(subA, "gaps.json"), "utf-8");

		const id = nextIdForDir(subB, "gaps");
		appendToBlockForDir(subB, "gaps", "gaps", { id, description: "into B", status: "open" });

		// .subB received the item.
		const bAfter = readBlockForDir(subB, "gaps") as { gaps: Array<{ id: string }> };
		assert.strictEqual(bAfter.gaps.length, 1);
		assert.strictEqual(bAfter.gaps[0]!.id, "FGAP-001");

		// .subA is byte-identical to the pre-write snapshot.
		assert.strictEqual(fs.readFileSync(path.join(subA, "gaps.json"), "utf-8"), subASnapshot);
		const aAfter = readBlockForDir(subA, "gaps") as { gaps: unknown[] };
		assert.strictEqual(aAfter.gaps.length, 0);

		// Pointer never moved.
		assert.strictEqual(path.basename(resolveContextDir(tmpDir)), ".subA");

		// The cwd form still targets the active .subA, confirming separation.
		appendToBlock(tmpDir, "gaps", "gaps", { id: "FGAP-002", description: "into A via cwd", status: "open" });
		const aViaCwd = readBlock(tmpDir, "gaps") as { gaps: Array<{ id: string }> };
		assert.strictEqual(aViaCwd.gaps.length, 1);
		assert.strictEqual(aViaCwd.gaps[0]!.id, "FGAP-002");
		// .subB unaffected by the cwd-form write into .subA.
		const bUnchanged = readBlockForDir(subB, "gaps") as { gaps: unknown[] };
		assert.strictEqual(bUnchanged.gaps.length, 1);
	});
});

// ── (d) migration path against the TARGET dir ────────────────────────────────

describe("ForDir: writeBlockForDir migrates against the TARGET dir's schema + migrations.json", () => {
	const versionedSchema = (version: string) => ({
		version,
		type: "object",
		required: ["schema_version", "items"],
		additionalProperties: false,
		properties: {
			schema_version: { type: "string" },
			items: { type: "array", items: { type: "object" } },
		},
	});

	it("v1 block written into a v2 .subB with a declared identity migration succeeds", (t) => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "block-api-fordir-mig-"));
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		// Active substrate .subA is at v1; the TARGET .subB is at v2 with a migration.
		writeBootstrapPointer(tmpDir, ".subA");
		const subA = path.join(tmpDir, ".subA");
		const subB = path.join(tmpDir, ".subB");
		fs.mkdirSync(subA, { recursive: true });
		fs.mkdirSync(subB, { recursive: true });
		// .subA schema stays at v1 (no migration) — if writeBlockForDir read the
		// ACTIVE dir's schema/migrations it would mismatch (active is v1, data is
		// v1 → versions equal → no migration needed → masks the bug). To make the
		// target-vs-active distinction load-bearing we set the active schema to a
		// DIFFERENT version with NO migration so reading it would throw.
		setupSchema(tmpDir, ".subA", "thing", versionedSchema("3.0.0"));
		setupSchema(tmpDir, ".subB", "thing", versionedSchema("2.0.0"));
		// Target migrations.json: identity v1 → v2.
		fs.writeFileSync(
			path.join(subB, "migrations.json"),
			JSON.stringify(
				{
					schema_version: "1.0.0",
					migrations: [
						{
							schemaName: "thing",
							fromVersion: "1.0.0",
							toVersion: "2.0.0",
							kind: "identity",
							created_by: "test",
							created_at: new Date().toISOString(),
						},
					],
				},
				null,
				2,
			),
		);

		// Write a v1-versioned block into .subB. The data declares schema_version
		// 1.0.0; the TARGET schema is at 2.0.0 → the migration registry built from
		// .subB/migrations.json resolves the identity edge and the write lands.
		writeBlockForDir(subB, "thing", { schema_version: "1.0.0", items: [{ id: "x" }] });
		assert.ok(fs.existsSync(path.join(subB, "thing.json")), "v1→v2 write into .subB must land");
		const landed = readBlockForDir(subB, "thing") as { schema_version: string };
		assert.strictEqual(landed.schema_version, "1.0.0");
		// Active .subA untouched.
		assert.ok(!fs.existsSync(path.join(subA, "thing.json")), "active .subA must stay empty");
	});

	it("v1 block into a v2 .subB with NO migration throws (target's migrations.json is read)", (t) => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "block-api-fordir-mig-throw-"));
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		writeBootstrapPointer(tmpDir, ".subA");
		const subA = path.join(tmpDir, ".subA");
		const subB = path.join(tmpDir, ".subB");
		fs.mkdirSync(subA, { recursive: true });
		fs.mkdirSync(subB, { recursive: true });
		// Active .subA HAS an identity migration v1→v2; if writeBlockForDir wrongly
		// read the ACTIVE migrations.json the write would (wrongly) succeed. The
		// TARGET .subB has none → must throw.
		setupSchema(tmpDir, ".subA", "thing", versionedSchema("2.0.0"));
		setupSchema(tmpDir, ".subB", "thing", versionedSchema("2.0.0"));
		fs.writeFileSync(
			path.join(subA, "migrations.json"),
			JSON.stringify(
				{
					schema_version: "1.0.0",
					migrations: [
						{
							schemaName: "thing",
							fromVersion: "1.0.0",
							toVersion: "2.0.0",
							kind: "identity",
							created_by: "test",
							created_at: new Date().toISOString(),
						},
					],
				},
				null,
				2,
			),
		);

		assert.throws(
			() => writeBlockForDir(subB, "thing", { schema_version: "1.0.0", items: [{ id: "x" }] }),
			/MigrationRegistry|migration/i,
			"target .subB has no migration → must throw despite active .subA having one",
		);
		assert.ok(!fs.existsSync(path.join(subB, "thing.json")), "failed write must not land in .subB");
	});
});
