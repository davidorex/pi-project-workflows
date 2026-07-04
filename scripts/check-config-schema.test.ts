/**
 * Helper-level tests for the config-schema breaking-diff gate: every
 * additive/breaking cell of diffSchemaShapes, and every pairing outcome of
 * migrationPaired. Pure functions — no git, no filesystem.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { diffSchemaShapes, migrationPaired } from "./check-config-schema.js";

type Json = Record<string, unknown>;

function schema(overrides: Json = {}): Json {
	return {
		version: "1.8.0",
		type: "object",
		required: ["schema_version", "block_kinds"],
		additionalProperties: false,
		properties: {
			schema_version: { type: "string" },
			block_kinds: { type: "array", items: { type: "object" } },
			relation_types: {
				type: "array",
				items: {
					type: "object",
					required: ["canonical_id"],
					additionalProperties: false,
					properties: {
						canonical_id: { type: "string" },
						source_kinds: { type: "array" },
					},
				},
			},
		},
		...overrides,
	};
}

function clone(s: Json): Json {
	return JSON.parse(JSON.stringify(s));
}

describe("diffSchemaShapes", () => {
	it("identical schemas → no findings", () => {
		assert.deepEqual(diffSchemaShapes(schema(), schema()), []);
	});

	it("removed root-level key → removed-key finding with path", () => {
		const next = clone(schema());
		delete (next.properties as Json).relation_types;
		const findings = diffSchemaShapes(schema(), next);
		assert.deepEqual(findings, [{ kind: "removed-key", path: "$.properties.relation_types" }]);
	});

	it("removed NESTED key (inside items.properties) → removed-key finding", () => {
		const next = clone(schema());
		delete ((((next.properties as Json).relation_types as Json).items as Json).properties as Json).source_kinds;
		const findings = diffSchemaShapes(schema(), next);
		assert.deepEqual(findings, [
			{ kind: "removed-key", path: "$.properties.relation_types.items.properties.source_kinds" },
		]);
	});

	it("rename surfaces as a removal of the old key", () => {
		const next = clone(schema());
		const props = next.properties as Json;
		props.relation_kinds = props.relation_types;
		delete props.relation_types;
		const findings = diffSchemaShapes(schema(), next);
		assert.equal(findings.length, 1);
		assert.equal(findings[0]?.kind, "removed-key");
		assert.equal(findings[0]?.path, "$.properties.relation_types");
	});

	it("new required entry on a PRE-EXISTING object → new-required finding", () => {
		const next = clone(schema());
		(next.required as string[]).push("relation_types");
		const findings = diffSchemaShapes(schema(), next);
		assert.deepEqual(findings, [{ kind: "new-required", path: "$.required[relation_types]" }]);
	});

	it("new required entry on a pre-existing NESTED object → new-required finding", () => {
		const next = clone(schema());
		((((next.properties as Json).relation_types as Json).items as Json).required as string[]).push("source_kinds");
		const findings = diffSchemaShapes(schema(), next);
		assert.deepEqual(findings, [
			{ kind: "new-required", path: "$.properties.relation_types.items.required[source_kinds]" },
		]);
	});

	it("a NEWLY-ADDED optional object with its own initial requireds is additive (never visited)", () => {
		const next = clone(schema());
		(next.properties as Json).lenses = {
			type: "array",
			items: { type: "object", required: ["id", "bins"], properties: { id: {}, bins: {} } },
		};
		assert.deepEqual(diffSchemaShapes(schema(), next), []);
	});

	it("new optional property + description/enum additions + version change are additive", () => {
		const next = clone(schema({ version: "1.9.0" }));
		(next.properties as Json).naming = { type: "object", description: "new optional registry" };
		const rt = (((next.properties as Json).relation_types as Json).items as Json).properties as Json;
		(rt.canonical_id as Json).description = "now documented";
		assert.deepEqual(diffSchemaShapes(schema(), next), []);
	});
});

describe("migrationPaired", () => {
	const decls = (toVersion: string) =>
		JSON.stringify({
			schema_version: "1.0.0",
			migrations: [{ schemaName: "config", fromVersion: "1.0.0", toVersion, kind: "identity" }],
		});

	it("version advance + matching config decl → paired", () => {
		const r = migrationPaired("1.8.0", "1.9.0", decls("1.9.0"));
		assert.equal(r.paired, true);
	});

	it("version advance WITHOUT a decl reaching the new version → not paired", () => {
		const r = migrationPaired("1.8.0", "1.9.0", decls("1.8.0"));
		assert.equal(r.paired, false);
		assert.match(r.reason, /reaches version '1\.9\.0'/);
	});

	it("decl present but NO version advance → not paired", () => {
		const r = migrationPaired("1.8.0", "1.8.0", decls("1.8.0"));
		assert.equal(r.paired, false);
		assert.match(r.reason, /without a schema version advance/);
	});

	it("missing migrations registry → not paired", () => {
		const r = migrationPaired("1.8.0", "1.9.0", undefined);
		assert.equal(r.paired, false);
		assert.match(r.reason, /not found/);
	});

	it("missing version on either side → not paired", () => {
		assert.equal(migrationPaired(undefined, "1.9.0", decls("1.9.0")).paired, false);
		assert.equal(migrationPaired("1.8.0", undefined, decls("1.9.0")).paired, false);
	});
});
