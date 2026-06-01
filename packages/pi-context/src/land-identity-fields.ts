/**
 * land-identity-fields — C2-completion (Cycle 10, H1-precursor): land the three
 * content-addressed-identity field DECLARATIONS (`oid` / `content_hash` /
 * `content_parent`) as OPTIONAL item properties on every registered block_kind
 * schema of a substrate that lacks them. This is the precondition the H1 migration
 * (`migrateToContentAddressed`) gates on at its step-0 readiness check
 * (`schemaDeclaresIdentityFields`): a schema whose item shape does not declare all
 * three fields makes the migration refuse to backfill.
 *
 * Surgical INJECT, never wholesale-replace: each schema keeps every existing
 * constraint (its `required`, its other properties, `additionalProperties`, etc.)
 * byte-for-byte; only the three field entries are added under
 * `properties.<array_key>.items.properties`. The fields are NEVER added to
 * `required` — they are optional so pre-Cycle-3 items (which carry none of them)
 * still validate. The migration's own backfill stamps the values later.
 *
 * Data-safety: the three fields are additive + optional, so existing block items
 * remain schema-valid after the injection (no `required` change, no constraint
 * tightening). No schema_version bump / `$id` / `version` / migration declaration
 * is filed — the target data carries no `schema_version` envelope, and
 * `validateBlockWithMigration` only runs migrations on a version delta, so an
 * additive-optional field change needs none.
 *
 * Scope: ONLY `config.block_kinds`. Orphan schema files under `schemas/` that are
 * not registered as a block_kind are ignored — the migration gate only inspects
 * registered block_kinds, so unregistered schemas are out of the readiness path.
 *
 * Per-block_kind dispositions (the LandReport buckets):
 *   - `created`: the block_kind's schema file was ABSENT. Such a block has no
 *     data yet (asserted: the data file is absent before this path is taken), so
 *     the samples-canonical schema for that canonical_id — which already declares
 *     all three fields — is copied in via a `create` write.
 *   - `inlined`: the schema's `items` is a `{ $ref: "#/definitions/X" }` (or
 *     `#/$defs/X`). The referenced definition is deep-cloned into `items` (its
 *     constraints preserved, data-safe) and the three fields injected into that
 *     now-inline `items.properties`. The schema's `definitions`/`$defs` block is
 *     left in place so any NESTED `$ref`s inside the definition still resolve.
 *   - `already`: the inline `items.properties` already declares all three fields
 *     — idempotent skip, no write.
 *   - `updated`: the inline `items.properties` lacks the fields — they are
 *     injected; everything else preserved byte-for-byte.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { DispatchContext } from "./dispatch-context.js";
import { readSchemaForDir, writeSchemaCheckedForDir } from "./schema-write.js";

/** Bundled samples-schemas directory — resolved relative to this module so it
 * works from both `src/` (tsx) and `dist/` (built); `samples/` sits one level
 * above either (mirrors `samples-catalog.ts`'s SAMPLES_DIR resolution). */
const SAMPLES_SCHEMAS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "samples", "schemas");

/**
 * The three identity-field declarations, byte-identical to the form already
 * present across the samples-canonical + active schemas. The SINGLE shared
 * source — injected verbatim into every schema that lacks them. Frozen so a
 * downstream mutation cannot silently corrupt the canonical shape; each
 * injection deep-clones it (via `structuredClone`) before insertion.
 */
export const IDENTITY_FIELDS: Readonly<Record<string, Record<string, string>>> = Object.freeze({
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
});

/** The three identity-field property names. */
const IDENTITY_FIELD_NAMES = ["oid", "content_hash", "content_parent"] as const;

export interface LandReport {
	substrate_dir: string;
	updated: string[]; // block_kinds whose schema gained the fields (inline-items inject)
	created: string[]; // block_kinds whose missing schema was created from the samples-canonical body
	inlined: string[]; // block_kinds whose $ref items were inlined + then injected
	already: string[]; // block_kinds already declaring the fields (idempotent skip)
	dry_run: boolean;
}

/** A registered block_kind, the only fields this engine reads from config. */
interface BlockKindDecl {
	canonical_id: string;
	array_key: string;
	schema_path: string;
	data_path: string;
}

/** Resolve a block_kind `schema_path` / `data_path` against the substrate dir. */
function resolveAgainst(substrateDir: string, p: string): string {
	return path.isAbsolute(p) ? p : path.join(substrateDir, p);
}

/**
 * Build a fresh `items.properties` object that carries `existing`'s entries plus
 * the three identity fields (deep-cloned from the frozen canonical source).
 * Existing entries are preserved; an existing same-named entry is NOT clobbered
 * (the `already`/skip path is decided by the caller, so this is only reached for
 * a genuinely-missing field set, but the guard keeps it order-preserving + safe).
 */
function injectIdentityFields(existing: Record<string, unknown>): Record<string, unknown> {
	const next: Record<string, unknown> = { ...existing };
	for (const name of IDENTITY_FIELD_NAMES) {
		if (!Object.hasOwn(next, name)) {
			next[name] = structuredClone(IDENTITY_FIELDS[name]);
		}
	}
	return next;
}

/** True iff an inline `items.properties` object declares all three fields. */
function itemPropsDeclareAll(itemProps: Record<string, unknown> | undefined): boolean {
	if (!itemProps) return false;
	return IDENTITY_FIELD_NAMES.every((n) => Object.hasOwn(itemProps, n));
}

/**
 * Resolve a one-level local `$ref` (`#/definitions/X` | `#/$defs/X`) against the
 * schema's own definition bags. Returns a deep clone of the target so the inline
 * `items` does not alias the `definitions` entry. Returns `null` when the ref is
 * unsupported / unresolvable (caller then leaves the schema untouched + reports).
 */
function derefLocal(schema: Record<string, unknown>, ref: string): Record<string, unknown> | null {
	const m = /^#\/(definitions|\$defs)\/(.+)$/.exec(ref);
	if (!m) return null;
	const bag = schema[m[1]] as Record<string, Record<string, unknown>> | undefined;
	const target = bag?.[m[2]];
	if (!target || typeof target !== "object") return null;
	return structuredClone(target) as Record<string, unknown>;
}

/**
 * Add the three identity-field DECLARATIONS to every registered block_kind
 * schema of `substrateDir` that lacks them. See module doc for the per-block_kind
 * disposition rules. Reads `<substrateDir>/config.json` for `block_kinds[]`.
 *
 * `opts.dryRun`: compute the report (which bucket each block_kind lands in) but
 * perform ZERO writes.
 * `opts.ctx`: forwarded to the schema-write surface for call-site parity (schema
 * files carry no author-attestation fields, so it is not stamped).
 */
export function landIdentityFieldsForDir(
	substrateDir: string,
	opts?: { dryRun?: boolean; ctx?: DispatchContext },
): LandReport {
	const dryRun = opts?.dryRun ?? false;
	const ctx = opts?.ctx;
	const report: LandReport = {
		substrate_dir: substrateDir,
		updated: [],
		created: [],
		inlined: [],
		already: [],
		dry_run: dryRun,
	};

	const configPath = path.join(substrateDir, "config.json");
	let config: { block_kinds?: BlockKindDecl[] };
	try {
		config = JSON.parse(fs.readFileSync(configPath, "utf-8")) as { block_kinds?: BlockKindDecl[] };
	} catch (err) {
		throw new Error(
			`landIdentityFieldsForDir: cannot read config at ${configPath}: ${err instanceof Error ? err.message : String(err)}`,
		);
	}
	const blockKinds = Array.isArray(config.block_kinds) ? config.block_kinds : [];

	for (const bk of blockKinds) {
		const schemaAbs = resolveAgainst(substrateDir, bk.schema_path);

		// ── Missing schema file → create from the samples-canonical body ──────────
		if (!fs.existsSync(schemaAbs)) {
			const dataAbs = resolveAgainst(substrateDir, bk.data_path);
			if (fs.existsSync(dataAbs)) {
				// A registered block_kind with data but no schema is a corrupt substrate
				// state the create path must not paper over (copying a samples body would
				// silently re-shape live data). Fail loudly rather than guess.
				throw new Error(
					`landIdentityFieldsForDir: block_kind '${bk.canonical_id}' has data at ${dataAbs} but no schema at ${schemaAbs}; cannot safely create a schema for a populated block`,
				);
			}
			const samplesSchemaPath = path.join(SAMPLES_SCHEMAS_DIR, `${bk.canonical_id}.schema.json`);
			let samplesSchema: object;
			try {
				samplesSchema = JSON.parse(fs.readFileSync(samplesSchemaPath, "utf-8")) as object;
			} catch (err) {
				throw new Error(
					`landIdentityFieldsForDir: block_kind '${bk.canonical_id}' has no schema and no samples-canonical schema at ${samplesSchemaPath}: ${err instanceof Error ? err.message : String(err)}`,
				);
			}
			if (!dryRun) {
				writeSchemaCheckedForDir(substrateDir, bk.canonical_id, samplesSchema, "create", ctx);
			}
			report.created.push(bk.canonical_id);
			continue;
		}

		// ── Schema present → read + classify ──────────────────────────────────────
		const schema = readSchemaForDir(substrateDir, bk.canonical_id) as Record<string, unknown> | null;
		if (schema === null) {
			// existsSync said present but readSchemaForDir returned null — a race or a
			// path divergence between config.schema_path and the canonical resolver.
			throw new Error(
				`landIdentityFieldsForDir: block_kind '${bk.canonical_id}' schema present at ${schemaAbs} but not resolvable via the canonical reader (config.schema_path may diverge from <dir>/schemas/<canonical_id>.schema.json)`,
			);
		}

		const props = schema.properties as Record<string, unknown> | undefined;
		const arrayNode = props?.[bk.array_key] as Record<string, unknown> | undefined;
		if (!arrayNode || typeof arrayNode !== "object") {
			throw new Error(
				`landIdentityFieldsForDir: block_kind '${bk.canonical_id}' schema has no array property '${bk.array_key}' under properties; cannot locate the item shape`,
			);
		}
		const items = arrayNode.items as Record<string, unknown> | undefined;
		if (!items || typeof items !== "object") {
			throw new Error(
				`landIdentityFieldsForDir: block_kind '${bk.canonical_id}' array '${bk.array_key}' has no object 'items'; cannot inject identity fields`,
			);
		}

		// ── items is a $ref → inline the definition, then inject ──────────────────
		const ref = typeof items.$ref === "string" ? items.$ref : undefined;
		if (ref) {
			const inlined = derefLocal(schema, ref);
			if (inlined === null) {
				throw new Error(
					`landIdentityFieldsForDir: block_kind '${bk.canonical_id}' items $ref '${ref}' is unsupported or unresolvable against the schema's own definitions/$defs`,
				);
			}
			const inlinedProps = (inlined.properties as Record<string, unknown> | undefined) ?? {};
			inlined.properties = injectIdentityFields(inlinedProps);
			// Replace items with the inline (deep-cloned) definition carrying the fields.
			// The schema's definitions/$defs block is left in place so nested $refs resolve.
			arrayNode.items = inlined;
			if (!dryRun) {
				writeSchemaCheckedForDir(substrateDir, bk.canonical_id, schema, "replace", ctx);
			}
			report.inlined.push(bk.canonical_id);
			continue;
		}

		// ── inline items.properties → already / updated ───────────────────────────
		const itemProps = items.properties as Record<string, unknown> | undefined;
		if (itemPropsDeclareAll(itemProps)) {
			report.already.push(bk.canonical_id);
			continue;
		}
		items.properties = injectIdentityFields(itemProps ?? {});
		if (!dryRun) {
			writeSchemaCheckedForDir(substrateDir, bk.canonical_id, schema, "replace", ctx);
		}
		report.updated.push(bk.canonical_id);
	}

	return report;
}
