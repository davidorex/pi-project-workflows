/**
 * content/metadata projection tests (Cycle 2 / Phase A). Proves the
 * correctness crux: the projection drops exactly the metadata fields and keeps
 * content; a metadata-only mutation yields an identical projection (and thus an
 * identical content hash); the `x-identity.metadata_fields` override is
 * honored; the input item is never mutated.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { contentProjection, DEFAULT_METADATA_FIELDS, metadataFieldsForSchema } from "./block-api.js";
import { computeContentHash } from "./content-hash.js";

/** Inline schema with one array key `tasks` whose items use the default
 * partition (no `x-identity`). */
const defaultSchema: Record<string, unknown> = {
	type: "object",
	properties: {
		tasks: {
			type: "array",
			items: {
				type: "object",
				properties: {
					id: { type: "string" },
					oid: { type: "string" },
					content_hash: { type: "string" },
					content_parent: { type: "string" },
					created_by: { type: "string" },
					created_at: { type: "string" },
					modified_by: { type: "string" },
					modified_at: { type: "string" },
					closed_by: { type: "string" },
					closed_at: { type: "string" },
					title: { type: "string" },
					status: { type: "string" },
				},
			},
		},
	},
};

/** Inline schema whose `notes` items override the metadata partition via
 * `x-identity.metadata_fields` (only `id` is metadata; `created_at` is content
 * here). */
const overrideSchema: Record<string, unknown> = {
	type: "object",
	properties: {
		notes: {
			type: "array",
			items: {
				type: "object",
				"x-identity": { metadata_fields: ["id"] },
				properties: {
					id: { type: "string" },
					created_at: { type: "string" },
					body: { type: "string" },
				},
			},
		},
	},
};

describe("content-projection", () => {
	it("DEFAULT_METADATA_FIELDS has exactly the 10 documented members", () => {
		assert.deepEqual([...DEFAULT_METADATA_FIELDS].sort(), [
			"closed_at",
			"closed_by",
			"content_hash",
			"content_parent",
			"created_at",
			"created_by",
			"id",
			"modified_at",
			"modified_by",
			"oid",
		]);
	});

	it("metadataFieldsForSchema returns the default set for an array with no x-identity", () => {
		assert.deepEqual([...metadataFieldsForSchema(defaultSchema, "tasks")].sort(), [...DEFAULT_METADATA_FIELDS].sort());
	});

	it("metadataFieldsForSchema falls back to default for an unknown array key", () => {
		assert.deepEqual([...metadataFieldsForSchema(defaultSchema, "nope")].sort(), [...DEFAULT_METADATA_FIELDS].sort());
	});

	it("projection drops exactly the 10 default metadata fields and keeps content", () => {
		const item: Record<string, unknown> = {
			id: "TASK-001",
			oid: "oid-1",
			content_hash: "h",
			content_parent: "p",
			created_by: "human:a",
			created_at: "2026-01-01",
			modified_by: "human:b",
			modified_at: "2026-01-02",
			closed_by: "human:c",
			closed_at: "2026-01-03",
			title: "do the thing",
			status: "open",
		};
		const proj = contentProjection(defaultSchema, "tasks", item);
		assert.deepEqual(proj, { title: "do the thing", status: "open" });
	});

	it("metadata-only change yields an identical projection and identical content hash", () => {
		const base: Record<string, unknown> = {
			id: "TASK-001",
			oid: "oid-1",
			created_at: "2026-01-01",
			title: "do the thing",
			status: "open",
		};
		const metadataMutated: Record<string, unknown> = {
			...base,
			oid: "oid-9999",
			created_at: "2099-12-31",
			content_hash: "differs",
		};
		const pa = contentProjection(defaultSchema, "tasks", base);
		const pb = contentProjection(defaultSchema, "tasks", metadataMutated);
		assert.deepEqual(pa, pb);
		assert.equal(computeContentHash(pa), computeContentHash(pb));
	});

	it("content change yields a different projection and different content hash", () => {
		const base: Record<string, unknown> = { id: "T", title: "a", status: "open" };
		const changed: Record<string, unknown> = { id: "T", title: "b", status: "open" };
		assert.notEqual(
			computeContentHash(contentProjection(defaultSchema, "tasks", base)),
			computeContentHash(contentProjection(defaultSchema, "tasks", changed)),
		);
	});

	it("x-identity.metadata_fields override is honored under the mandatory-floor union (created_at becomes content)", () => {
		// Cycle 3 (carried item 1): the override REPLACES the discretionary set
		// (so created_at — a discretionary default — becomes content), but the
		// mandatory floor (id/oid/content_hash/content_parent) is UNIONED back
		// in. Override `["id"]` therefore resolves to the floor (id already a
		// floor member; the override adds nothing beyond it), not to a bare
		// `["id"]`. The projection still drops `id` and keeps `created_at`.
		assert.deepEqual([...metadataFieldsForSchema(overrideSchema, "notes")].sort(), [
			"content_hash",
			"content_parent",
			"id",
			"oid",
		]);
		const item: Record<string, unknown> = { id: "N-1", created_at: "2026-01-01", body: "hello" };
		const proj = contentProjection(overrideSchema, "notes", item);
		// `id` dropped (floor); `created_at` retained as content (override drops
		// it from the discretionary metadata set).
		assert.deepEqual(proj, { created_at: "2026-01-01", body: "hello" });
	});

	it("contentProjection does NOT mutate its input item", () => {
		const item: Record<string, unknown> = {
			id: "TASK-001",
			oid: "oid-1",
			created_at: "2026-01-01",
			title: "x",
		};
		const snapshot = { ...item };
		contentProjection(defaultSchema, "tasks", item);
		assert.deepEqual(item, snapshot);
		assert.ok(Object.hasOwn(item, "id"));
		assert.ok(Object.hasOwn(item, "oid"));
		assert.ok(Object.hasOwn(item, "created_at"));
	});
});
