/**
 * Unit tests for content-addressed identity stamping (Cycle 3 / Phase C):
 *   - mintOid: deterministic by (substrateId, nonce); differs by nonce + by
 *     substrateId; shape ^[0-9a-f]{32}$.
 *   - prepareItemIdentityForWrite: create (mints oid, computes hash, puts
 *     object, no content_parent); update (preserves oid, recomputes hash, sets
 *     content_parent on content change, NOT on no-op, throws on oid change);
 *     no-op when the schema does not declare the identity fields.
 *   - mandatory-floor union in metadataFieldsForSchema: an override that omits
 *     `id` still excludes the floor, so two items differing only in `id` hash
 *     equal under that override.
 *   - substrateIdForDir: throws when config.json absent / lacks substrate_id.
 *   - describeIdentityOverride: null when no override; correct delta when present.
 *
 * Scratch substrates are built by hand (schema file + config.json carrying a
 * substrate_id) so the stamping gate + substrate_id-presence both fire.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
	contentProjection,
	DISCRETIONARY_METADATA_FIELDS,
	describeIdentityOverride,
	MANDATORY_METADATA_FIELDS,
	metadataFieldsForSchema,
	mintOid,
	prepareItemIdentityForWrite,
} from "./block-api.js";
import { computeContentHash } from "./content-hash.js";
import { substrateIdForDir } from "./context-dir.js";
import { hasObject } from "./object-store.js";

const SUB = "sub-0011223344556677";

function makeScratch(opts: { withSubstrateId?: boolean; identityFields?: boolean; override?: string[] }): {
	dir: string;
	schemaPath: string;
} {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "identity-stamp-"));
	fs.mkdirSync(path.join(dir, "schemas"), { recursive: true });
	const config: Record<string, unknown> = { schema_version: "1.0.0", block_kinds: [] };
	if (opts.withSubstrateId !== false) config.substrate_id = SUB;
	fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify(config, null, 2), "utf-8");

	const itemProps: Record<string, unknown> = {
		id: { type: "string" },
		title: { type: "string" },
		created_by: { type: "string" },
	};
	if (opts.identityFields !== false) {
		itemProps.oid = { type: "string", pattern: "^[0-9a-f]{32}$" };
		itemProps.content_hash = { type: "string", pattern: "^[0-9a-f]{64}$" };
		itemProps.content_parent = { type: "string", pattern: "^[0-9a-f]{64}$" };
	}
	const items: Record<string, unknown> = { type: "object", properties: itemProps };
	if (opts.override) items["x-identity"] = { metadata_fields: opts.override };
	const schema = { type: "object", properties: { tasks: { type: "array", items } } };
	const schemaPath = path.join(dir, "schemas", "tasks.schema.json");
	fs.writeFileSync(schemaPath, JSON.stringify(schema, null, 2), "utf-8");
	return { dir, schemaPath };
}

describe("mintOid", () => {
	it("is deterministic by (substrateId, nonce) and shaped ^[0-9a-f]{32}$", () => {
		const a = mintOid(SUB, "nonce-1");
		const b = mintOid(SUB, "nonce-1");
		assert.strictEqual(a, b, "same (substrateId, nonce) → same oid");
		assert.match(a, /^[0-9a-f]{32}$/);
	});
	it("differs by nonce", () => {
		assert.notStrictEqual(mintOid(SUB, "nonce-1"), mintOid(SUB, "nonce-2"));
	});
	it("differs by substrateId for the same nonce (cross-substrate uniqueness)", () => {
		assert.notStrictEqual(mintOid("sub-aaaaaaaaaaaaaaaa", "n"), mintOid("sub-bbbbbbbbbbbbbbbb", "n"));
	});
	it("mints a fresh value each call when no nonce supplied", () => {
		assert.notStrictEqual(mintOid(SUB), mintOid(SUB));
	});
});

describe("prepareItemIdentityForWrite — create", () => {
	it("mints oid, computes content_hash, puts the object, sets no content_parent", (t) => {
		const { dir, schemaPath } = makeScratch({});
		t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
		const out = prepareItemIdentityForWrite(dir, "tasks", { id: "T1", title: "x" }, schemaPath, "tasks", "create");
		assert.match(out.oid as string, /^[0-9a-f]{32}$/);
		assert.match(out.content_hash as string, /^[0-9a-f]{64}$/);
		assert.ok(!("content_parent" in out), "v1 item must have no content_parent");
		assert.ok(hasObject(dir, out.content_hash as string), "object persisted under content_hash");
	});

	it("is a NO-OP when the schema does not declare the identity fields", (t) => {
		const { dir, schemaPath } = makeScratch({ identityFields: false });
		t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
		const item = { id: "T1", title: "x" };
		const out = prepareItemIdentityForWrite(dir, "tasks", item, schemaPath, "tasks", "create");
		assert.deepStrictEqual(out, item, "non-identity schema → item returned unchanged");
		assert.ok(!("oid" in out));
	});
});

describe("prepareItemIdentityForWrite — update", () => {
	it("preserves prior oid, recomputes hash, sets content_parent on content change", (t) => {
		const { dir, schemaPath } = makeScratch({});
		t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
		const v1 = prepareItemIdentityForWrite(dir, "tasks", { id: "T1", title: "x" }, schemaPath, "tasks", "create");
		const v2 = prepareItemIdentityForWrite(
			dir,
			"tasks",
			{ id: "T1", title: "CHANGED" },
			schemaPath,
			"tasks",
			"update",
			v1,
		);
		assert.strictEqual(v2.oid, v1.oid, "oid preserved across content update");
		assert.notStrictEqual(v2.content_hash, v1.content_hash, "hash moved on content change");
		assert.strictEqual(v2.content_parent, v1.content_hash, "content_parent = prior hash");
	});

	it("does NOT advance content_parent on a no-op (unchanged content) write", (t) => {
		const { dir, schemaPath } = makeScratch({});
		t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
		const v1 = prepareItemIdentityForWrite(dir, "tasks", { id: "T1", title: "x" }, schemaPath, "tasks", "create");
		// Re-stamp with identical content (only a metadata field touched).
		const v2 = prepareItemIdentityForWrite(
			dir,
			"tasks",
			{ id: "T1", title: "x", created_by: "human/d" },
			schemaPath,
			"tasks",
			"update",
			v1,
		);
		assert.strictEqual(v2.content_hash, v1.content_hash, "hash unchanged on content-stable write");
		assert.ok(!("content_parent" in v2), "content_parent not advanced when content unchanged");
		assert.strictEqual(v2.oid, v1.oid);
	});

	it("throws when an update would change an existing oid (immutability)", (t) => {
		const { dir, schemaPath } = makeScratch({});
		t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
		const v1 = prepareItemIdentityForWrite(dir, "tasks", { id: "T1", title: "x" }, schemaPath, "tasks", "create");
		assert.throws(
			() =>
				prepareItemIdentityForWrite(
					dir,
					"tasks",
					{ id: "T1", title: "x", oid: "ffffffffffffffffffffffffffffffff" },
					schemaPath,
					"tasks",
					"update",
					v1,
				),
			/oid is immutable/,
		);
	});

	it("mints an oid on update when the prior item never had one", (t) => {
		const { dir, schemaPath } = makeScratch({});
		t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
		const out = prepareItemIdentityForWrite(
			dir,
			"tasks",
			{ id: "T1", title: "x" },
			schemaPath,
			"tasks",
			"update",
			{ id: "T1", title: "old" }, // prior with no oid
		);
		assert.match(out.oid as string, /^[0-9a-f]{32}$/, "fresh oid minted when prior lacked one");
	});

	it("does NOT honor a caller-supplied oid on first stamp — mints a fresh one (no prior oid)", (t) => {
		const { dir, schemaPath } = makeScratch({});
		t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
		const supplied = "abcdef0123456789abcdef0123456789"; // well-formed 32-hex
		const out = prepareItemIdentityForWrite(
			dir,
			"tasks",
			{ id: "T1", title: "x", oid: supplied },
			schemaPath,
			"tasks",
			"update",
			{ id: "T1", title: "old" }, // prior with no oid
		);
		assert.match(out.oid as string, /^[0-9a-f]{32}$/, "result oid is well-formed (minted)");
		assert.notStrictEqual(out.oid, supplied, "caller-supplied oid is NOT honored on first stamp — system minted");
	});
});

describe("metadataFieldsForSchema — mandatory-floor union", () => {
	it("no override → MANDATORY ∪ DISCRETIONARY (the default partition)", () => {
		const { dir, schemaPath } = makeScratch({});
		const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
		fs.rmSync(dir, { recursive: true, force: true });
		const fields = metadataFieldsForSchema(schema, "tasks");
		for (const f of MANDATORY_METADATA_FIELDS) assert.ok(fields.has(f), `floor field ${f} present`);
		for (const f of DISCRETIONARY_METADATA_FIELDS) assert.ok(fields.has(f), `discretionary field ${f} present`);
	});

	it("override omitting `id` STILL excludes the floor; two items differing only in id hash equal", () => {
		// Override declares only `created_by` as metadata — it omits id/oid/etc.
		const { dir, schemaPath } = makeScratch({ override: ["created_by"] });
		const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
		fs.rmSync(dir, { recursive: true, force: true });
		const fields = metadataFieldsForSchema(schema, "tasks");
		for (const f of MANDATORY_METADATA_FIELDS)
			assert.ok(fields.has(f), `floor field ${f} still excluded under override`);
		// closed_by is discretionary, dropped by this override → must be CONTENT.
		assert.ok(!fields.has("closed_by"), "non-declared discretionary field falls into content");
		const a = { id: "T1", oid: "a".repeat(32), title: "same" };
		const b = { id: "T2", oid: "b".repeat(32), title: "same" };
		assert.strictEqual(
			computeContentHash(contentProjection(schema, "tasks", a)),
			computeContentHash(contentProjection(schema, "tasks", b)),
			"items differing only in floor fields (id/oid) hash equal under an id-omitting override",
		);
	});
});

describe("substrateIdForDir", () => {
	it("returns the substrate_id when present", (t) => {
		const { dir } = makeScratch({});
		t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
		assert.strictEqual(substrateIdForDir(dir), SUB);
	});
	it("throws when config.json lacks substrate_id", (t) => {
		const { dir } = makeScratch({ withSubstrateId: false });
		t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
		assert.throws(() => substrateIdForDir(dir), /no valid substrate_id/);
	});
	it("throws when config.json is absent", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "identity-stamp-nocfg-"));
		try {
			assert.throws(() => substrateIdForDir(dir), /no config\.json/);
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("describeIdentityOverride", () => {
	it("returns null when no array declares an override", () => {
		const { dir, schemaPath } = makeScratch({});
		const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
		fs.rmSync(dir, { recursive: true, force: true });
		assert.strictEqual(describeIdentityOverride(schema), null);
	});
	it("names dropped discretionary fields + added exclusions when an override is present", () => {
		// Override = ["audit_note"] → adds audit_note as metadata, drops every
		// discretionary field (created_by/at, modified_by/at, closed_by/at).
		const { dir, schemaPath } = makeScratch({ override: ["audit_note"] });
		const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
		fs.rmSync(dir, { recursive: true, force: true });
		const desc = describeIdentityOverride(schema);
		assert.ok(desc !== null);
		assert.match(desc as string, /array 'tasks'/);
		assert.match(desc as string, /audit_note/, "added exclusion named");
		assert.match(desc as string, /created_by/, "dropped discretionary field named");
	});
});
