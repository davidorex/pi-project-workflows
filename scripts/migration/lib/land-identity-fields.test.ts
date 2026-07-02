import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { validateBlockWithMigrationForDir } from "@davidorex/pi-context/schema-validator";
import { landIdentityFieldsForDir } from "./land-identity-fields.js";

// The canonical identity-field declarations, byte-identical to the module's
// frozen IDENTITY_FIELDS source — duplicated here so the test asserts the
// injected bytes against an INDEPENDENT copy (a regression in the module's
// constant must fail this assertion, not silently agree with itself).
const CANONICAL_IDENTITY_FIELDS: Record<string, Record<string, string>> = {
	oid: {
		type: "string",
		pattern: "^[0-9a-f]{32}$",
		description:
			"Content-independent substrate-stable item identity (content-addressed substrate identity, Cycle 3). Minted once at item birth via mintOid(substrate_id); immutable across content versions. Optional in the schema so pre-Cycle-3 items validate; stamped on next write.",
	},
	content_hash: {
		type: "string",
		pattern: "^[0-9a-f]{64}$",
		description:
			"SHA-256 (hex) of the RFC-8785-canonical content projection of this item (metadata fields excluded). Recomputed on every stamping write; moves with content, stable across metadata-only churn.",
	},
	content_parent: {
		type: "string",
		pattern: "^[0-9a-f]{64}$",
		description:
			"content_hash of the immediately-prior version of this item; set on a content-changing update, absent on the first (v1) version. Forms the per-item content version chain.",
	},
};
const IDENTITY_NAMES = ["oid", "content_hash", "content_parent"] as const;

/** Mirror of the migration's (unexported) schemaDeclaresIdentityFields gate. */
function schemaDeclaresIdentityFields(schemaAbs: string, arrayKey: string): boolean {
	let schema: Record<string, unknown>;
	try {
		schema = JSON.parse(fs.readFileSync(schemaAbs, "utf-8")) as Record<string, unknown>;
	} catch {
		return false;
	}
	const props = schema.properties as Record<string, unknown> | undefined;
	const arrayNode = props?.[arrayKey] as Record<string, unknown> | undefined;
	const items = arrayNode?.items as Record<string, unknown> | undefined;
	const itemProps = items?.properties as Record<string, unknown> | undefined;
	if (!itemProps) return false;
	return IDENTITY_NAMES.every((n) => Object.hasOwn(itemProps, n));
}

function readJson(p: string): Record<string, unknown> {
	return JSON.parse(fs.readFileSync(p, "utf-8")) as Record<string, unknown>;
}

/** Snapshot every file under a dir → { relpath: bytes } for tree-equality checks. */
function snapshotTree(root: string): Record<string, string> {
	const out: Record<string, string> = {};
	function walk(dir: string): void {
		for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
			const abs = path.join(dir, ent.name);
			if (ent.isDirectory()) walk(abs);
			else out[path.relative(root, abs)] = fs.readFileSync(abs, "utf-8");
		}
	}
	walk(root);
	return out;
}

/**
 * Build a scratch substrate dir with four block_kinds covering every disposition:
 *   (a) `inline`   — inline-items schema LACKING the fields + data lacking them → updated
 *   (b) `refkind`  — items:{$ref:"#/definitions/x"} + data → inlined
 *   (c) `conventions` — registered block_kind whose schema file is ABSENT + no data → created
 *                       (uses a real samples canonical_id so the create-copy resolves)
 *   (d) `already`  — schema ALREADY declaring the fields → already
 */
function buildScratchSubstrate(): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "land-identity-"));
	const sub = path.join(dir, ".project");
	fs.mkdirSync(path.join(sub, "schemas"), { recursive: true });

	fs.writeFileSync(
		path.join(sub, "config.json"),
		JSON.stringify({
			schema_version: "1.7.0",
			root: ".project",
			block_kinds: [
				{
					canonical_id: "inline",
					display_name: "Inline",
					prefix: "IN-",
					schema_path: "schemas/inline.schema.json",
					array_key: "items",
					data_path: "inline.json",
				},
				{
					canonical_id: "refkind",
					display_name: "Ref",
					prefix: "RF-",
					schema_path: "schemas/refkind.schema.json",
					array_key: "items",
					data_path: "refkind.json",
				},
				{
					canonical_id: "conventions",
					display_name: "Conventions",
					prefix: "CONV-",
					schema_path: "schemas/conventions.schema.json",
					array_key: "rules",
					data_path: "conventions.json",
				},
				{
					canonical_id: "already",
					display_name: "Already",
					prefix: "AL-",
					schema_path: "schemas/already.schema.json",
					array_key: "items",
					data_path: "already.json",
				},
			],
			relation_types: [],
			invariants: [],
		}),
	);

	// (a) inline-items schema LACKING the fields + data lacking them.
	fs.writeFileSync(
		path.join(sub, "schemas", "inline.schema.json"),
		`${JSON.stringify(
			{
				$schema: "http://json-schema.org/draft-07/schema#",
				type: "object",
				required: ["items"],
				properties: {
					items: {
						type: "array",
						items: {
							type: "object",
							additionalProperties: false,
							required: ["id", "title"],
							properties: { id: { type: "string", pattern: "^IN-\\d{4}$" }, title: { type: "string" } },
						},
					},
				},
			},
			null,
			2,
		)}\n`,
	);
	fs.writeFileSync(path.join(sub, "inline.json"), JSON.stringify({ items: [{ id: "IN-0001", title: "alpha" }] }));

	// (b) $ref-items schema + data.
	fs.writeFileSync(
		path.join(sub, "schemas", "refkind.schema.json"),
		`${JSON.stringify(
			{
				$schema: "http://json-schema.org/draft-07/schema#",
				type: "object",
				required: ["items"],
				definitions: {
					row: {
						type: "object",
						additionalProperties: false,
						required: ["id", "label"],
						properties: { id: { type: "string", pattern: "^RF-\\d{4}$" }, label: { type: "string" } },
					},
				},
				properties: {
					items: { type: "array", items: { $ref: "#/definitions/row" } },
				},
			},
			null,
			2,
		)}\n`,
	);
	fs.writeFileSync(path.join(sub, "refkind.json"), JSON.stringify({ items: [{ id: "RF-0001", label: "beta" }] }));

	// (c) conventions: NO schema file, NO data file (create-from-samples path).

	// (d) already-declaring schema (carries the 3 fields verbatim) + data.
	fs.writeFileSync(
		path.join(sub, "schemas", "already.schema.json"),
		`${JSON.stringify(
			{
				$schema: "http://json-schema.org/draft-07/schema#",
				type: "object",
				required: ["items"],
				properties: {
					items: {
						type: "array",
						items: {
							type: "object",
							required: ["id"],
							properties: {
								id: { type: "string" },
								oid: CANONICAL_IDENTITY_FIELDS.oid,
								content_hash: CANONICAL_IDENTITY_FIELDS.content_hash,
								content_parent: CANONICAL_IDENTITY_FIELDS.content_parent,
							},
						},
					},
				},
			},
			null,
			2,
		)}\n`,
	);
	fs.writeFileSync(path.join(sub, "already.json"), JSON.stringify({ items: [{ id: "x" }] }));

	return sub;
}

describe("landIdentityFieldsForDir", () => {
	it("classifies all four dispositions + makes the H1 gate pass without invalidating data", (t) => {
		const sub = buildScratchSubstrate();
		t.after(() => fs.rmSync(path.dirname(sub), { recursive: true, force: true }));

		// Pre-state: NONE of the present schemas with data declare all three fields,
		// except the already-declaring one.
		assert.strictEqual(schemaDeclaresIdentityFields(path.join(sub, "schemas", "inline.schema.json"), "items"), false);
		assert.strictEqual(schemaDeclaresIdentityFields(path.join(sub, "schemas", "refkind.schema.json"), "items"), false);
		assert.strictEqual(schemaDeclaresIdentityFields(path.join(sub, "schemas", "already.schema.json"), "items"), true);

		const report = landIdentityFieldsForDir(sub);
		assert.deepStrictEqual(report.updated, ["inline"]);
		assert.deepStrictEqual(report.inlined, ["refkind"]);
		assert.deepStrictEqual(report.created, ["conventions"]);
		assert.deepStrictEqual(report.already, ["already"]);
		assert.strictEqual(report.dry_run, false);

		// (a) inline → gate passes; existing data still valid; fields byte-identical + NOT required.
		assert.strictEqual(schemaDeclaresIdentityFields(path.join(sub, "schemas", "inline.schema.json"), "items"), true);
		const inlineSchema = readJson(path.join(sub, "schemas", "inline.schema.json"));
		const inlineItemProps = (
			((inlineSchema.properties as Record<string, unknown>).items as Record<string, unknown>).items as Record<
				string,
				unknown
			>
		).properties as Record<string, unknown>;
		for (const n of IDENTITY_NAMES) {
			assert.deepStrictEqual(inlineItemProps[n], CANONICAL_IDENTITY_FIELDS[n], `inline.${n} byte-identical`);
		}
		const inlineRequired = (
			((inlineSchema.properties as Record<string, unknown>).items as Record<string, unknown>).items as Record<
				string,
				unknown
			>
		).required as string[];
		for (const n of IDENTITY_NAMES) assert.ok(!inlineRequired.includes(n), `inline ${n} NOT in required`);
		assert.doesNotThrow(() => validateBlockWithMigrationForDir(sub, "inline", readJson(path.join(sub, "inline.json"))));

		// (b) refkind → items now INLINE (no $ref), carries the 3 fields, preserves the
		// definition's own constraints; existing data still valid.
		assert.strictEqual(schemaDeclaresIdentityFields(path.join(sub, "schemas", "refkind.schema.json"), "items"), true);
		const refSchema = readJson(path.join(sub, "schemas", "refkind.schema.json"));
		const refItems = ((refSchema.properties as Record<string, unknown>).items as Record<string, unknown>)
			.items as Record<string, unknown>;
		assert.strictEqual(refItems.$ref, undefined, "refkind items no longer a $ref");
		assert.strictEqual(refItems.additionalProperties, false, "inlined definition constraints preserved");
		const refItemProps = refItems.properties as Record<string, unknown>;
		assert.ok(Object.hasOwn(refItemProps, "label"), "original definition property preserved");
		for (const n of IDENTITY_NAMES) assert.deepStrictEqual(refItemProps[n], CANONICAL_IDENTITY_FIELDS[n]);
		// definitions block left in place.
		assert.ok(Object.hasOwn(refSchema, "definitions"), "definitions block retained for nested-ref resolution");
		assert.doesNotThrow(() =>
			validateBlockWithMigrationForDir(sub, "refkind", readJson(path.join(sub, "refkind.json"))),
		);

		// (c) conventions → created from samples-canonical (which already declares the fields).
		assert.ok(fs.existsSync(path.join(sub, "schemas", "conventions.schema.json")));
		assert.strictEqual(
			schemaDeclaresIdentityFields(path.join(sub, "schemas", "conventions.schema.json"), "rules"),
			true,
		);

		// (d) already → unchanged.
		assert.strictEqual(schemaDeclaresIdentityFields(path.join(sub, "schemas", "already.schema.json"), "items"), true);
	});

	it("dry-run writes NOTHING (tree snapshot before === after) yet reports the same buckets", (t) => {
		const sub = buildScratchSubstrate();
		t.after(() => fs.rmSync(path.dirname(sub), { recursive: true, force: true }));

		const before = snapshotTree(sub);
		const report = landIdentityFieldsForDir(sub, { dryRun: true });
		const after = snapshotTree(sub);

		assert.strictEqual(report.dry_run, true);
		assert.deepStrictEqual(report.updated, ["inline"]);
		assert.deepStrictEqual(report.inlined, ["refkind"]);
		assert.deepStrictEqual(report.created, ["conventions"]);
		assert.deepStrictEqual(report.already, ["already"]);
		assert.deepStrictEqual(after, before, "dry-run must not touch disk");
	});

	it("is idempotent — a second run reports everything in `already` with no writes", (t) => {
		const sub = buildScratchSubstrate();
		t.after(() => fs.rmSync(path.dirname(sub), { recursive: true, force: true }));

		landIdentityFieldsForDir(sub); // first run lands the fields.
		const afterFirst = snapshotTree(sub);

		const report2 = landIdentityFieldsForDir(sub);
		assert.deepStrictEqual(report2.updated, []);
		assert.deepStrictEqual(report2.inlined, []);
		assert.deepStrictEqual(report2.created, []);
		assert.deepStrictEqual(report2.already.sort(), ["already", "conventions", "inline", "refkind"]);
		assert.deepStrictEqual(snapshotTree(sub), afterFirst, "idempotent run must not touch disk");
	});

	it("does not introduce a non-identity diff — the rest of each schema is unchanged", (t) => {
		const sub = buildScratchSubstrate();
		t.after(() => fs.rmSync(path.dirname(sub), { recursive: true, force: true }));

		const inlineBefore = readJson(path.join(sub, "schemas", "inline.schema.json"));
		landIdentityFieldsForDir(sub);
		const inlineAfter = readJson(path.join(sub, "schemas", "inline.schema.json"));

		// Strip the three injected fields from `after`'s item properties; the rest
		// must be deep-equal to `before`.
		const afterItemProps = {
			...((
				((inlineAfter.properties as Record<string, unknown>).items as Record<string, unknown>).items as Record<
					string,
					unknown
				>
			).properties as Record<string, unknown>),
		};
		for (const n of IDENTITY_NAMES) delete afterItemProps[n];
		const beforeItemProps = (
			((inlineBefore.properties as Record<string, unknown>).items as Record<string, unknown>).items as Record<
				string,
				unknown
			>
		).properties as Record<string, unknown>;
		assert.deepStrictEqual(afterItemProps, beforeItemProps, "non-identity item properties unchanged");

		// required, additionalProperties, top-level keys all unchanged.
		const inlineAfterItems = ((inlineAfter.properties as Record<string, unknown>).items as Record<string, unknown>)
			.items as Record<string, unknown>;
		const inlineBeforeItems = ((inlineBefore.properties as Record<string, unknown>).items as Record<string, unknown>)
			.items as Record<string, unknown>;
		assert.deepStrictEqual(inlineAfterItems.required, inlineBeforeItems.required);
		assert.strictEqual(inlineAfterItems.additionalProperties, inlineBeforeItems.additionalProperties);
		assert.deepStrictEqual(Object.keys(inlineAfter).sort(), Object.keys(inlineBefore).sort());
	});
});
