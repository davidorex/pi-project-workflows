/**
 * Content-addressed object-store tests (Cycle 2 / Phase B). Fixture shape
 * (mkdtempSync / rmSync). Proves: put -> has(true) -> get deep-equal
 * round-trip; idempotent re-put is a byte-level no-op; get on an absent hash is
 * null; the file lands at `<dir>/objects/<hash>.json`; malformed hashes are
 * rejected by the path-safety guard.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { writeBlockForDir } from "./block-api.js";
import { getObject, hasObject, putObject } from "./object-store.js";

/** A syntactically valid lowercase 64-char hex hash (not necessarily the hash
 * of `content` — object-store does not verify the hash, by design). */
const HASH = "a".repeat(64);
const HASH2 = "b".repeat(64);

describe("object-store", () => {
	let dir: string;

	before(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), "object-store-test-"));
	});

	after(() => {
		fs.rmSync(dir, { recursive: true, force: true });
	});

	it("put -> hasObject true -> getObject deep-equal round-trip", () => {
		const content = { title: "x", n: 3, nested: { a: 1 }, list: [1, 2] };
		assert.equal(hasObject(dir, HASH), false);
		putObject(dir, HASH, content);
		assert.equal(hasObject(dir, HASH), true);
		assert.deepEqual(getObject(dir, HASH), content);
	});

	it("object lands at <dir>/objects/<hash>.json", () => {
		const expected = path.join(dir, "objects", `${HASH}.json`);
		assert.equal(fs.existsSync(expected), true);
	});

	it("idempotent re-put is a no-op (file mtime and bytes unchanged)", async () => {
		const filePath = path.join(dir, "objects", `${HASH}.json`);
		const before = fs.statSync(filePath);
		const bytesBefore = fs.readFileSync(filePath, "utf-8");
		// Re-put with DIFFERENT content under the SAME hash: must NOT overwrite
		// (content-addressed store treats same hash as already-stored).
		await new Promise((r) => setTimeout(r, 10));
		putObject(dir, HASH, { totally: "different" });
		const after = fs.statSync(filePath);
		const bytesAfter = fs.readFileSync(filePath, "utf-8");
		assert.equal(bytesAfter, bytesBefore);
		assert.equal(after.mtimeMs, before.mtimeMs);
		assert.equal(after.size, before.size);
	});

	it("getObject on an absent hash returns null", () => {
		assert.equal(getObject(dir, HASH2), null);
		assert.equal(hasObject(dir, HASH2), false);
	});

	it("putObject rejects a too-short hash", () => {
		assert.throws(() => putObject(dir, "xyz", { a: 1 }), /invalid contentHash/);
	});

	it("putObject rejects an uppercase (wrong-charset) hash of correct length", () => {
		assert.throws(() => putObject(dir, "A".repeat(64), { a: 1 }), /invalid contentHash/);
	});

	it("putObject rejects a wrong-length hash", () => {
		assert.throws(() => putObject(dir, "a".repeat(63), { a: 1 }), /invalid contentHash/);
		assert.throws(() => putObject(dir, "a".repeat(65), { a: 1 }), /invalid contentHash/);
	});

	it("putObject rejects a hash containing path separators", () => {
		assert.throws(() => putObject(dir, `../${"a".repeat(61)}`, { a: 1 }), /invalid contentHash/);
	});

	it("getObject and hasObject also reject a malformed hash", () => {
		assert.throws(() => getObject(dir, "nope"), /invalid contentHash/);
		assert.throws(() => hasObject(dir, "nope"), /invalid contentHash/);
	});
});

// ── Cycle 9.1 P6: object persistence is gated on whole-block AJV ──────────────
//
// Stamping computes content_hash regardless of AJV, but objects/ is written
// ONLY after the whole block clears validation (writeTypedFile post-validation
// walk). An AJV-fail must therefore leave objects/ empty AND the block file
// untouched. A successful write persists the object. Seeding mirrors
// identity-stamp.test.ts makeScratch (schema with the 3 identity fields +
// config carrying substrate_id).

const SUB = "sub-0011223344556677";

function makeIdentityScratch(): { dir: string } {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "object-store-ajv-"));
	fs.mkdirSync(path.join(dir, "schemas"), { recursive: true });
	fs.writeFileSync(
		path.join(dir, "config.json"),
		JSON.stringify({ schema_version: "1.8.0", block_kinds: [], substrate_id: SUB }, null, 2),
		"utf-8",
	);
	const schema = {
		type: "object",
		properties: {
			tasks: {
				type: "array",
				items: {
					type: "object",
					additionalProperties: false,
					required: ["id", "title"],
					properties: {
						id: { type: "string" },
						title: { type: "string" },
						oid: { type: "string", pattern: "^[0-9a-f]{32}$" },
						content_hash: { type: "string", pattern: "^[0-9a-f]{64}$" },
						content_parent: { type: "string", pattern: "^[0-9a-f]{64}$" },
					},
				},
			},
		},
	};
	fs.writeFileSync(path.join(dir, "schemas", "tasks.schema.json"), JSON.stringify(schema, null, 2), "utf-8");
	return { dir };
}

describe("object-store: no orphan object on whole-block AJV failure", () => {
	it("an AJV-failing write hashes fine but leaves objects/ empty and the block unwritten", (t) => {
		const { dir } = makeIdentityScratch();
		t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
		const objDir = path.join(dir, "objects");
		// `bogus` violates additionalProperties:false → whole-block AJV fails. The
		// item still hashes during stamping, but persistence is post-validation.
		assert.throws(() => writeBlockForDir(dir, "tasks", { tasks: [{ id: "T1", title: "x", bogus: 1 }] }));
		// No orphan object — objects/ is empty (or never created).
		const objs = fs.existsSync(objDir) ? fs.readdirSync(objDir) : [];
		assert.equal(objs.length, 0, "AJV-fail must leave no orphan content object");
		// Block file never landed.
		assert.equal(fs.existsSync(path.join(dir, "tasks.json")), false, "block file unchanged (unwritten)");
	});

	it("a successful write persists exactly the stamped item's object", (t) => {
		const { dir } = makeIdentityScratch();
		t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
		const objDir = path.join(dir, "objects");
		writeBlockForDir(dir, "tasks", { tasks: [{ id: "T1", title: "x" }] });
		const written = JSON.parse(fs.readFileSync(path.join(dir, "tasks.json"), "utf-8")) as {
			tasks: Array<{ content_hash: string }>;
		};
		assert.ok(hasObject(dir, written.tasks[0].content_hash));
		assert.equal(fs.readdirSync(objDir).length, 1, "exactly one content object persisted");
	});
});
