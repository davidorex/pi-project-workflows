/**
 * Centralized read/write API for .project/*.json project block files.
 * Validates data against schemas before writing; uses atomic writes (tmp + rename).
 * Read-modify-write operations (append, update) use file-level locking via proper-lockfile
 * to prevent data loss from concurrent workflow steps targeting the same block.
 *
 * DispatchContext (FGAP-004): every write function accepts an optional final
 * argument `ctx?: DispatchContext`. When provided AND the target block's
 * schema declares any of {created_by, created_at, modified_by, modified_at},
 * items are stamped via `stampItem` from `./dispatch-context` before AJV
 * validation. When `ctx` is undefined, behavior is byte-identical to the
 * pre-step-3 surface — the parameter is purely additive. The has-author-fields
 * decision is mtime-cached per (cwd, blockName) to avoid re-reading the
 * schema on every write; mirrors the `loadContext` cache pattern from
 * `context.ts`.
 *
 * Future extraction seam for pi-project extension.
 */

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import _lockfile from "proper-lockfile";
import { canonicalJson, computeContentHash, computeFileBytesHash, sha256Hex } from "./content-hash.js";
import {
	assertSubstrateName,
	resolveContextDir,
	schemaPathForDir,
	substrateIdForDir,
	tryResolveContextDir,
} from "./context-dir.js";
import type { DispatchContext } from "./dispatch-context.js";
import { stampItem } from "./dispatch-context.js";
import { cleanGitEnv } from "./git-env.js";
import { getProjectMigrationRegistryForDir } from "./migration-registry-loader.js";
import { hasObject, putObject } from "./object-store.js";
import { validateBlockWithMigrationForDir, validateFromFile } from "./schema-validator.js";

// Node16 module resolution + CJS interop: default import may be wrapped
const lockfile = (_lockfile as any).default ?? _lockfile;

/**
 * Acquire a file-level lock, run fn(), release lock in finally.
 * Skips locking if the target file does not yet exist (first write — no contention possible).
 * Uses proper-lockfile's lockSync/unlockSync for synchronous read-modify-write safety.
 */
function withBlockLock<T>(filePath: string, fn: () => T): T {
	if (!fs.existsSync(filePath)) {
		return fn();
	}
	lockfile.lockSync(filePath, { stale: 10000 });
	try {
		return fn();
	} finally {
		lockfile.unlockSync(filePath);
	}
}

function blockFilePathForDir(substrateDir: string, blockName: string): string {
	assertSubstrateName(blockName);
	return path.join(substrateDir, `${blockName}.json`);
}

function blockSchemaPathForDir(substrateDir: string, blockName: string): string {
	return schemaPathForDir(substrateDir, blockName);
}

// ── Schema introspection cache (DispatchContext support, FGAP-004) ───────────

/**
 * Author fields recognized by `stampItem`. If the target schema's
 * (top-level array item, or top-level object) `properties` declares any of
 * these, ctx-stamping runs before AJV validation; otherwise stamping is
 * skipped so an `additionalProperties: false` schema does not fail
 * validation on injected fields.
 */
const AUTHOR_FIELDS = ["created_by", "created_at", "modified_by", "modified_at"] as const;

/**
 * The MANDATORY content/metadata floor (content-addressed substrate identity,
 * Cycle 3 / carried item 1; v3 spec §A2). The identity/addressing fields
 * `id`, `oid`, `content_hash`, `content_parent` are ALWAYS metadata —
 * EXCLUDED from the content hash — and a schema's `x-identity.metadata_fields`
 * override can NEVER pull them into the content. This is the floor that makes
 * the content hash a faithful identity for content rather than for addressing:
 * a refname rename (`id`), a freshly-minted `oid`, or a recomputed
 * `content_hash` / advanced `content_parent` must never move the hash, or the
 * object store would fork on pure addressing churn. `metadataFieldsForSchema`
 * unions this floor into whatever partition an override declares so the floor
 * is non-overridable by construction.
 */
export const MANDATORY_METADATA_FIELDS: ReadonlySet<string> = new Set<string>([
	"id",
	"oid",
	"content_hash",
	"content_parent",
]);

/**
 * The DISCRETIONARY metadata fields (v3 spec §A2): the four author/attestation
 * fields (`AUTHOR_FIELDS`) plus the lifecycle-closure fields (`closed_by`,
 * `closed_at`). These are the fields a schema MAY redefine via an
 * `x-identity.metadata_fields` override — when an override is declared it
 * REPLACES this discretionary set (the floor is still unioned back in); when
 * absent these are the discretionary defaults. Built from `AUTHOR_FIELDS` so
 * the four author strings keep a single source of truth and cannot drift from
 * the stamping path.
 */
export const DISCRETIONARY_METADATA_FIELDS: ReadonlySet<string> = new Set<string>([
	...AUTHOR_FIELDS,
	"closed_by",
	"closed_at",
]);

/**
 * The default content/metadata partition when no `x-identity.metadata_fields`
 * override is declared: `MANDATORY ∪ DISCRETIONARY` — the same 10 fields the
 * Cycle-2 surface enumerated (`id`, `oid`, `content_hash`, `content_parent`,
 * the four author fields, `closed_by`, `closed_at`). Retained as the
 * no-override default so the membership is identical to the pre-Cycle-3 set;
 * `metadataFieldsForSchema` now composes it from the two named subsets rather
 * than a flat literal so the mandatory floor is provably a subset of every
 * resolved partition (see that function).
 */
export const DEFAULT_METADATA_FIELDS: ReadonlySet<string> = new Set<string>([
	...MANDATORY_METADATA_FIELDS,
	...DISCRETIONARY_METADATA_FIELDS,
]);

interface SchemaCacheEntry {
	mtimeMs: number;
	/** True when the schema declares ANY author field anywhere — top-level
	 * envelope OR any nested array item shape. Used for the cheap "could
	 * stamping ever happen for this block?" check. Derived from
	 * `envelopeDeclares.size > 0 || any perArrayKey value has size > 0`. */
	hasAuthorFields: boolean;
	/** Subset of `AUTHOR_FIELDS` declared on the TOP-LEVEL envelope's
	 * `properties`. Distinguished from per-array-key state so `writeBlock`'s
	 * envelope-stamp does not fire merely because some nested array's items
	 * carry author fields. Empty set = "no envelope-level stamping". */
	envelopeDeclares: ReadonlySet<string>;
	/** Per-array-key declared subset — keyed by the array property name (NOT
	 * a dotted path). Built by recursing through the schema so nested arrays
	 * (e.g. `properties.reviews.items.properties.findings`) appear under
	 * their own key. Lookup miss = "no entry for this key" = stamping is
	 * skipped (safe default for unrecognised keys). The Set value carries
	 * the SUBSET of `AUTHOR_FIELDS` that the array's items declare so
	 * `stampItem` only touches schema-declared fields and does not trip
	 * `additionalProperties: false`. Empty set = "key catalogued but no
	 * author fields declared on its items". */
	perArrayKey: Map<string, ReadonlySet<string>>;
	/** The content/metadata partition per array key — the set of fields to
	 * EXCLUDE when projecting an item to its hashable content (Cycle 2 /
	 * Phase A). Keyed by array property name; value is the RESOLVED partition
	 * `MANDATORY ∪ (override ?? DISCRETIONARY)` for that item kind (carried
	 * item 1). Populated once per cache load via `metadataFieldsForSchema` so
	 * there is a single resolution path and no parallel default. A lookup miss
	 * falls back to the same resolution at the read site
	 * (`metadataFieldsForSchema`), so an uncatalogued key still gets the safe
	 * default partition. */
	metadataFieldsByArrayKey: Map<string, ReadonlySet<string>>;
	/** Per-array-key: does the array's item subschema declare ALL THREE
	 * identity fields (`oid`, `content_hash`, `content_parent`) in its
	 * `properties`? This is the Cycle-3 stamping gate (locked decision 1),
	 * mirroring `perArrayKey`'s author-field gate: `prepareItemIdentityForWrite`
	 * is a NO-OP for any array whose value here is `false` (or absent). Keyed
	 * by array property name; nested arrays appear under their own key. A
	 * lookup miss = `false` (uncatalogued key never stamps). The three fields
	 * are required together so a schema mid-edit (declaring a subset) does not
	 * half-stamp and trip `additionalProperties: false`. */
	identityFieldsByArrayKey: Map<string, boolean>;
}

const schemaCache = new Map<string, SchemaCacheEntry>();

function safeStat(p: string): fs.Stats | null {
	try {
		return fs.statSync(p);
	} catch {
		return null;
	}
}

/**
 * Subset of `AUTHOR_FIELDS` that the schema's TOP-LEVEL `properties` object
 * declares. Used by `writeBlock`'s envelope-stamp question — whole-block
 * writes stamp on the envelope, not on every nested item. Empty set = "no
 * envelope-level author fields declared, skip stamping."
 */
function schemaTopLevelDeclaredAuthorFields(schema: unknown): ReadonlySet<string> {
	const out = new Set<string>();
	if (!schema || typeof schema !== "object") return out;
	const s = schema as Record<string, unknown>;
	const props = s.properties as Record<string, unknown> | undefined;
	if (!props) return out;
	for (const f of AUTHOR_FIELDS) {
		if (Object.hasOwn(props, f)) out.add(f);
	}
	return out;
}

/**
 * Walk every `items.properties` reachable from a schema by recursing through
 * `properties.*` and `items.*`. For each visited array property, record
 * whether its items' properties declare any author field. The result map is
 * keyed by the array property name; nested arrays (e.g.
 * `properties.reviews.items.properties.findings`) appear under their own key
 * (`findings`) so the caller's question — "do the items of array
 * '<arrayKey>' declare author fields?" — gets the right answer regardless of
 * nesting depth. Mutates `into` in place.
 *
 * Recursion is bounded by the schema's structural depth — there is no risk
 * of cycles unless the schema uses `$ref` cycles (which AJV would reject as
 * malformed during data validation, and step-3 schemas use no $ref).
 */
function collectArrayItemAuthorDecisions(schema: unknown, into: Map<string, ReadonlySet<string>>): void {
	if (!schema || typeof schema !== "object") return;
	const s = schema as Record<string, unknown>;
	const props = s.properties as Record<string, unknown> | undefined;
	if (!props) return;
	for (const [propKey, propSpecRaw] of Object.entries(props)) {
		if (!propSpecRaw || typeof propSpecRaw !== "object") continue;
		const spec = propSpecRaw as Record<string, unknown>;
		if (spec.type === "array") {
			const items = spec.items as Record<string, unknown> | undefined;
			if (items && typeof items === "object") {
				const itemProps = items.properties as Record<string, unknown> | undefined;
				if (itemProps) {
					const declared = new Set<string>();
					for (const f of AUTHOR_FIELDS) {
						if (Object.hasOwn(itemProps, f)) declared.add(f);
					}
					// "Union" if the same key appears at multiple nesting
					// depths — the recorded set is the union of declared
					// fields across all reachable shapes for the key. This
					// preserves the earlier "stamp on positive declaration
					// if any reachable shape carries the field" behavior
					// without losing the per-field grain.
					const prior = into.get(propKey);
					if (prior) {
						const merged = new Set<string>(prior);
						for (const f of declared) merged.add(f);
						into.set(propKey, merged);
					} else {
						into.set(propKey, declared);
					}
					// Recurse into items so deeper nested arrays are catalogued too.
					collectArrayItemAuthorDecisions(items, into);
				}
			}
		} else {
			// Recurse into nested object properties (covers `type: "object"`
			// without a literal `type` field — JSON Schema permits omitting
			// `type` so long as `properties` is present).
			collectArrayItemAuthorDecisions(spec, into);
		}
	}
}

/**
 * Read the `x-identity.metadata_fields` override from an item subschema, if
 * present. `x-identity` follows the established `x-prompt-budget` /
 * `x-lifecycle` extension-keyword convention; `metadata_fields` is an array of
 * field names to treat as metadata (excluded from the content hash) for items
 * of this kind. Returns the array as a `Set` when validly declared, else
 * `null` (caller falls back to `DEFAULT_METADATA_FIELDS`). Non-string entries
 * are ignored defensively; a non-array `metadata_fields` yields `null`.
 */
function readItemMetadataFieldsOverride(itemSchema: unknown): ReadonlySet<string> | null {
	if (!itemSchema || typeof itemSchema !== "object") return null;
	const xIdentity = (itemSchema as Record<string, unknown>)["x-identity"];
	if (!xIdentity || typeof xIdentity !== "object") return null;
	const fields = (xIdentity as Record<string, unknown>).metadata_fields;
	if (!Array.isArray(fields)) return null;
	const out = new Set<string>();
	for (const f of fields) {
		if (typeof f === "string") out.add(f);
	}
	return out;
}

/**
 * Walk every `items` subschema reachable from a schema (same traversal shape
 * as `collectArrayItemAuthorDecisions`) and record, per array property name,
 * the RAW `x-identity.metadata_fields` override for that array's items — ONLY
 * when one is declared. A key with no declared override is left ABSENT from
 * `into` (no default is written) so `metadataFieldsForSchema` can distinguish
 * "override declared" from "no override" and apply the mandatory-floor union
 * over the discretionary default at the read site. Mutates `into` in place.
 * Nested arrays appear under their own key. When the same key appears at
 * multiple depths, the first explicitly-declared override encountered is
 * retained (a later declaration does not clobber it).
 */
function collectArrayItemMetadataOverrides(schema: unknown, into: Map<string, ReadonlySet<string>>): void {
	if (!schema || typeof schema !== "object") return;
	const s = schema as Record<string, unknown>;
	const props = s.properties as Record<string, unknown> | undefined;
	if (!props) return;
	for (const [propKey, propSpecRaw] of Object.entries(props)) {
		if (!propSpecRaw || typeof propSpecRaw !== "object") continue;
		const spec = propSpecRaw as Record<string, unknown>;
		if (spec.type === "array") {
			const items = spec.items as Record<string, unknown> | undefined;
			if (items && typeof items === "object") {
				const itemProps = items.properties as Record<string, unknown> | undefined;
				if (itemProps) {
					const override = readItemMetadataFieldsOverride(items);
					// Record only an explicit override; absence means "no
					// override" so the read site applies the discretionary
					// default. First explicit declaration wins.
					if (override && !into.has(propKey)) {
						into.set(propKey, override);
					}
					collectArrayItemMetadataOverrides(items, into);
				}
			}
		} else {
			collectArrayItemMetadataOverrides(spec, into);
		}
	}
}

/**
 * The three item fields whose presence (ALL THREE) in an array item's
 * `properties` arms the Cycle-3 identity-stamping path for that array (locked
 * decision 1). Distinct from `MANDATORY_METADATA_FIELDS` (which additionally
 * carries `id`, present on every block item regardless of identity): these are
 * the net-new fields a Cycle-3 schema edit adds, so their joint presence is the
 * signal that a schema opted into identity stamping.
 */
const IDENTITY_DECLARATION_FIELDS = ["oid", "content_hash", "content_parent"] as const;

/**
 * Walk every `items` subschema reachable from a schema (same traversal shape as
 * `collectArrayItemMetadataOverrides`) and record, per array property name,
 * whether the item subschema's `properties` declares ALL THREE
 * `IDENTITY_DECLARATION_FIELDS`. This is the schema-gate cataloguer for
 * `prepareItemIdentityForWrite` (locked decision 1) — mirrors
 * `collectArrayItemAuthorDecisions` for the author-stamp gate. A key absent
 * from `into` (or recorded `false`) means "this array does not stamp identity".
 * `true` is recorded once and never downgraded (first positive declaration
 * across reachable shapes wins, paralleling the author cataloguer's union).
 */
function collectArrayItemIdentityDecisions(schema: unknown, into: Map<string, boolean>): void {
	if (!schema || typeof schema !== "object") return;
	const s = schema as Record<string, unknown>;
	const props = s.properties as Record<string, unknown> | undefined;
	if (!props) return;
	for (const [propKey, propSpecRaw] of Object.entries(props)) {
		if (!propSpecRaw || typeof propSpecRaw !== "object") continue;
		const spec = propSpecRaw as Record<string, unknown>;
		if (spec.type === "array") {
			const items = spec.items as Record<string, unknown> | undefined;
			if (items && typeof items === "object") {
				const itemProps = items.properties as Record<string, unknown> | undefined;
				if (itemProps) {
					const declaresAll = IDENTITY_DECLARATION_FIELDS.every((f) => Object.hasOwn(itemProps, f));
					if (declaresAll) {
						into.set(propKey, true);
					} else if (!into.has(propKey)) {
						into.set(propKey, false);
					}
					collectArrayItemIdentityDecisions(items, into);
				}
			}
		} else {
			collectArrayItemIdentityDecisions(spec, into);
		}
	}
}

/**
 * The content/metadata partition for items of array `arrayKey` under `schema`:
 * `MANDATORY_METADATA_FIELDS ∪ (override ?? DISCRETIONARY_METADATA_FIELDS)`
 * (carried item 1 / v3 spec §A2). The item subschema's
 * `x-identity.metadata_fields` override, when declared, REPLACES the
 * discretionary set; the mandatory floor (`id`/`oid`/`content_hash`/
 * `content_parent`) is then unioned back in so an override can never pull a
 * floor field into the content — even an override that omits `id` still
 * excludes the floor, so two items differing only in `id` hash equal under
 * that override. When no override is declared the result equals
 * `DEFAULT_METADATA_FIELDS` (floor ∪ discretionary) byte-for-byte.
 *
 * Single reader — both the cache populate site (`getSchemaCacheEntry` via
 * `collectArrayItemMetadataOverrides`) and `contentProjection` route through
 * this so there is exactly one resolution path and no parallel default.
 * Resolves the item subschema by the same array-key traversal used for
 * author-field decisions, reading the RAW override (not the already-defaulted
 * collected value) so the union is over the override itself.
 */
export function metadataFieldsForSchema(schema: unknown, arrayKey: string): ReadonlySet<string> {
	const overrides = new Map<string, ReadonlySet<string>>();
	collectArrayItemMetadataOverrides(schema, overrides);
	const override = overrides.get(arrayKey);
	const discretionary = override ?? DISCRETIONARY_METADATA_FIELDS;
	return new Set<string>([...MANDATORY_METADATA_FIELDS, ...discretionary]);
}

/**
 * Human-readable description of how a schema's `x-identity.metadata_fields`
 * override changes the discretionary metadata partition relative to the
 * default — or `null` when NO array item subschema declares an override
 * (carried item 2 / informed-authorization confirm). Pure function: no
 * filesystem, no cache; takes a parsed schema object and inspects every
 * reachable array item subschema for an `x-identity.metadata_fields`
 * declaration.
 *
 * When at least one override is present, returns a one-line-per-array summary
 * naming, per array key, which DISCRETIONARY fields the override DROPS
 * (present in `DISCRETIONARY_METADATA_FIELDS` but absent from the override)
 * and which non-floor fields it ADDS (present in the override, not a floor
 * field, not a default discretionary field). The mandatory floor
 * (`id`/`oid`/`content_hash`/`content_parent`) is never reported as
 * add/drop — it is structurally unaffected by an override — so the caller
 * (auth-gate) can append a standing "floor remains excluded" affirmation.
 *
 * Used by `authGateHandler` to enrich the `write-schema` confirm message; the
 * exact wording is the affordance, not a parse contract.
 */
export function describeIdentityOverride(schema: unknown): string | null {
	const overrides = new Map<string, ReadonlySet<string>>();
	collectArrayItemMetadataOverrides(schema, overrides);
	if (overrides.size === 0) return null;
	const lines: string[] = [];
	for (const [arrayKey, override] of overrides) {
		const dropped: string[] = [];
		for (const f of DISCRETIONARY_METADATA_FIELDS) {
			if (!override.has(f)) dropped.push(f);
		}
		const added: string[] = [];
		for (const f of override) {
			if (!MANDATORY_METADATA_FIELDS.has(f) && !DISCRETIONARY_METADATA_FIELDS.has(f)) added.push(f);
		}
		const parts: string[] = [];
		if (added.length > 0) parts.push(`treats as metadata (excluded from hash): ${added.join(", ")}`);
		if (dropped.length > 0) parts.push(`now hashed (no longer metadata): ${dropped.join(", ")}`);
		if (parts.length === 0) parts.push("redefines the discretionary metadata set with no net field-level change");
		lines.push(`array '${arrayKey}': ${parts.join("; ")}`);
	}
	return lines.join("\n");
}

/**
 * Project an item to its hashable content: a SHALLOW COPY of `item` with the
 * metadata keys (`metadataFieldsForSchema(schema, arrayKey)`) deleted. Does
 * NOT mutate `item`. The result is what Cycle 3 will feed to
 * `computeContentHash`, so a metadata-only mutation (refreshed author stamp,
 * freshly-assigned `oid`, etc.) leaves the projection — and therefore the
 * content hash — unchanged.
 *
 * `schema` is the parsed schema object (not a path), so this is usable both
 * from the cache populate path and from ad-hoc callers / tests holding an
 * inline schema.
 */
export function contentProjection(
	schema: Record<string, unknown>,
	arrayKey: string,
	item: Record<string, unknown>,
): Record<string, unknown> {
	const metadataFields = metadataFieldsForSchema(schema, arrayKey);
	const projection: Record<string, unknown> = { ...item };
	for (const f of metadataFields) {
		delete projection[f];
	}
	return projection;
}

/**
 * Load the cached schema-introspection answer for a schema file, refreshing
 * the cache when the file's mtime changes (or it appears / disappears).
 * Returns `null` when no schema exists at the path — callers treat that as
 * "no author fields declared" and skip ctx-stamping silently.
 *
 * Cache key is the absolute schema path (globally unique across cwds and
 * block names), enabling reuse for arbitrary (filePath, schemaPath) pairs
 * outside `.project/` — e.g., monitor side-car list schemas resolved from
 * `import.meta.url` in pi-behavior-monitors.
 */
function getSchemaCacheEntry(schemaPath: string | null): SchemaCacheEntry | null {
	if (!schemaPath) return null;
	const key = path.resolve(schemaPath);
	const stat = safeStat(key);
	if (!stat) {
		// Missing schema — drop any stale cache entry and signal absence.
		schemaCache.delete(key);
		return null;
	}
	const mtimeMs = stat.mtimeMs;
	const hit = schemaCache.get(key);
	if (hit && hit.mtimeMs === mtimeMs) return hit;

	let schema: unknown;
	try {
		schema = JSON.parse(fs.readFileSync(key, "utf-8"));
	} catch {
		// Unreadable / invalid JSON — treat as "no author fields declared" so
		// stamping is skipped; the existing AJV validation path will surface the
		// real problem on the next write.
		const entry: SchemaCacheEntry = {
			mtimeMs,
			hasAuthorFields: false,
			envelopeDeclares: new Set<string>(),
			perArrayKey: new Map(),
			metadataFieldsByArrayKey: new Map(),
			identityFieldsByArrayKey: new Map(),
		};
		schemaCache.set(key, entry);
		return entry;
	}
	const perArrayKey = new Map<string, ReadonlySet<string>>();
	collectArrayItemAuthorDecisions(schema, perArrayKey);
	// Resolved content/metadata partition per array key (carried item 1).
	// Collect the declared override keys, then resolve each through
	// `metadataFieldsForSchema` so the cached value already carries the
	// mandatory-floor union; identical resolution path as the read site.
	const overrides = new Map<string, ReadonlySet<string>>();
	collectArrayItemMetadataOverrides(schema, overrides);
	const metadataFieldsByArrayKey = new Map<string, ReadonlySet<string>>();
	for (const arrayKey of overrides.keys()) {
		metadataFieldsByArrayKey.set(arrayKey, metadataFieldsForSchema(schema, arrayKey));
	}
	const identityFieldsByArrayKey = new Map<string, boolean>();
	collectArrayItemIdentityDecisions(schema, identityFieldsByArrayKey);
	const envelopeDeclares = schemaTopLevelDeclaredAuthorFields(schema);
	let anyArrayItemDeclares = false;
	for (const v of perArrayKey.values()) {
		if (v.size > 0) {
			anyArrayItemDeclares = true;
			break;
		}
	}
	const entry: SchemaCacheEntry = {
		mtimeMs,
		hasAuthorFields: envelopeDeclares.size > 0 || anyArrayItemDeclares,
		envelopeDeclares,
		perArrayKey,
		metadataFieldsByArrayKey,
		identityFieldsByArrayKey,
	};
	schemaCache.set(key, entry);
	return entry;
}

/**
 * Does the item subschema for `arrayKey` under the schema at `schemaPath`
 * declare all three identity fields (`oid`/`content_hash`/`content_parent`)?
 * The Cycle-3 stamping gate (locked decision 1) — `false` (incl. for a missing
 * schema or an uncatalogued key) means `prepareItemIdentityForWrite` is a
 * no-op for this array. Mirrors `declaredAuthorFieldsForArray`'s
 * cache-backed lookup shape.
 */
function arrayDeclaresIdentityFields(schemaPath: string | null, arrayKey: string): boolean {
	const entry = getSchemaCacheEntry(schemaPath);
	if (!entry) return false;
	return entry.identityFieldsByArrayKey.get(arrayKey) ?? false;
}

/**
 * Subset of `AUTHOR_FIELDS` declared at the schema's top-level envelope.
 * Used by `writeTypedFile` to decide which envelope fields to stamp on a
 * whole-file write — distinct from per-item stamping which uses
 * `declaredAuthorFieldsForArray`. Empty set = "no envelope-level stamping."
 */
function declaredAuthorFieldsForEnvelope(schemaPath: string | null): ReadonlySet<string> {
	const entry = getSchemaCacheEntry(schemaPath);
	return entry?.envelopeDeclares ?? new Set<string>();
}

/**
 * Subset of `AUTHOR_FIELDS` declared on the items of the array reached by
 * `arrayKey` — at any nesting depth. Used by the array-grained writers to
 * thread the per-field stamping decision into `stampItem`. An array key not
 * catalogued by the schema returns the empty set — stamping a key the schema
 * does not describe is the path that triggers `additionalProperties: false`
 * AJV failures, so the safe default is "skip" rather than "trust the envelope
 * answer." Empty set = "no per-item stamping."
 */
function declaredAuthorFieldsForArray(schemaPath: string | null, arrayKey: string): ReadonlySet<string> {
	const entry = getSchemaCacheEntry(schemaPath);
	if (!entry) return new Set<string>();
	return entry.perArrayKey.get(arrayKey) ?? new Set<string>();
}

/**
 * Conditionally stamp `item` when `ctx` is provided AND the schema declares
 * author fields on the relevant array items. Returns the (possibly stamped)
 * item — callers downstream feed it to AJV validation as usual.
 *
 * `mode` tracks "is this a fresh insertion or a mutation of an existing
 * item?" so `created_by` / `created_at` are not refreshed on update.
 */
function maybeStampItem(
	schemaPath: string | null,
	arrayKey: string,
	item: Record<string, unknown>,
	ctx: DispatchContext | undefined,
	mode: "create" | "update",
): Record<string, unknown> {
	if (!ctx) return item;
	const declared = declaredAuthorFieldsForArray(schemaPath, arrayKey);
	if (declared.size === 0) return item;
	return stampItem(item, ctx, mode, declared);
}

// ── Content-addressed identity stamping (Cycle 3 / Phase C) ──────────────────

/**
 * Mint a fresh OID for an item being born in `substrateId`. An OID is the
 * substrate-stable, content-INDEPENDENT identity of an item across all its
 * content versions (vs. `content_hash`, which moves with content; vs. `id`,
 * the human refname). Derived as the first 32 hex chars of
 * `sha256Hex(canonicalJson([substrateId, nonce ?? randomUUID()]))`:
 *   - salting with `substrateId` makes two substrates that mint with the same
 *     nonce produce distinct OIDs (cross-substrate uniqueness — the reason
 *     Cycle 3 needs the substrate_id core);
 *   - `nonce` is optional and exists for deterministic tests; production calls
 *     pass none and get a fresh `randomUUID()` so each birth is unique even
 *     within one substrate.
 * 128 bits (32 hex) of digest is collision-free in the item-count regime.
 *
 * RETURN SHAPE: a bare 32-character lowercase-hex digest — no substrate prefix,
 * no colon separator. `substrateId` salts the hash and does NOT appear in the
 * returned value. (The `<substrate_id>:<oid>` colon-form seen elsewhere is the
 * edge dedup key in `endpointIdentity`, not the oid itself.)
 */
export function mintOid(substrateId: string, nonce?: string): string {
	const seed = nonce ?? randomUUID();
	return sha256Hex(canonicalJson([substrateId, seed])).slice(0, 32);
}

/**
 * Compute the content/identity fields for an item about to be written, per the
 * content-addressed substrate identity model (Cycle 3 / Phase C). Returns the
 * item with `oid` / `content_hash` / `content_parent` set; the input is never
 * mutated (a shallow copy is returned). Also persists the content projection to
 * the object store as a side effect on every stamping write.
 *
 * NO-OP GATE (locked decision 1): when the item's array subschema does not
 * declare all three identity fields, the original `item` is returned unchanged
 * (no oid mint, no hash, no object write, no substrate_id read). This scopes
 * the behavior change to exactly the schemas Cycle 3 edits — bespoke test
 * schemas without the fields are untouched — mirroring `maybeStampItem`'s
 * author-field gate. The gate is NOT ctx-gated: content hash / oid are
 * integrity, not attestation.
 *
 * Ordering vs author-stamp: call AFTER `maybeStampItem`/`maybeStampTypedItem`.
 * Author fields are in the metadata partition (excluded from the projection),
 * so the content hash is invariant to whether author-stamping ran first — but
 * `content_hash` itself is a metadata field, so it must be assigned AFTER the
 * projection is computed from the (already author-stamped) item.
 *
 * `mode`:
 *   - `"create"`: mint a fresh `oid` (via `substrateIdForDir(substrateDir)`),
 *     compute `content_hash`, set NO `content_parent` (a v1 item has no prior).
 *   - `"update"`: preserve `prior.oid` — and THROW if the incoming item carries
 *     a different `oid` (locked decision 3: oid is immutable). Recompute
 *     `content_hash`. When the content changed (new hash !== prior.content_hash)
 *     set `content_parent = prior.content_hash`; when content is unchanged
 *     (no-op write) leave `content_parent` at the prior value (not advanced).
 *
 * `prior` is the on-disk item being replaced (required for `"update"`); for
 * `"create"` it is ignored.
 */
/**
 * Declared-baseline currency capture at the write choke (FEAT-011 criterion 6
 * — TASK-089). Two field families, each schema-gated per nested field so a
 * schema not declaring the shape is untouched (the identity-stamp gating
 * pattern):
 *
 *  (a) CONTENT PINS — an array-of-object field whose item subschema declares
 *      `content_pin` plus a path-bearing property (`path` or `file`): each
 *      element naming a readable file and carrying no pin gets
 *      `content_pin = sha256(file)`. An existing pin is never overwritten
 *      (the pin records the hash at GROUNDING time; drift is a validate flag,
 *      not a re-stamp).
 *  (b) TYPED STALE-CONDITION BASELINES — an array field whose item subschema
 *      admits kind-const object branches (oneOf): a `file-changed` element
 *      without `baseline_hash` gets the file's current hash; a
 *      `revision-moved` element without `baseline_sha` gets the ref's current
 *      commit (repo-resolved from the project root; unresolvable → left
 *      unstamped, so the condition stays human-only).
 *
 * Paths resolve against the project root (the substrate dir's parent).
 * Mutated elements are copied first — the caller's nested objects are never
 * aliased. Runs BEFORE the content projection is hashed, so `content_hash`
 * covers the stamped values.
 */
function stampDeclaredBaselines(
	substrateDir: string,
	schemaPath: string,
	arrayKey: string,
	item: Record<string, unknown>,
): void {
	let itemProps: Record<string, unknown> | undefined;
	try {
		const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8")) as Record<string, unknown>;
		const props = (schema.properties as Record<string, unknown> | undefined)?.[arrayKey] as
			| Record<string, unknown>
			| undefined;
		itemProps = ((props?.items as Record<string, unknown> | undefined)?.properties ?? undefined) as
			| Record<string, unknown>
			| undefined;
	} catch {
		return;
	}
	if (!itemProps) return;
	const projectRoot = path.dirname(substrateDir);
	const fileHashOrNull = (rel: string): string | null => {
		const abs = path.resolve(projectRoot, rel);
		try {
			if (!fs.statSync(abs).isFile()) return null;
			return computeFileBytesHash(abs);
		} catch {
			return null;
		}
	};
	for (const [field, decl] of Object.entries(itemProps)) {
		const arr = item[field];
		if (!Array.isArray(arr)) continue;
		const fieldItems = (decl as Record<string, unknown> | undefined)?.items as Record<string, unknown> | undefined;
		if (!fieldItems) continue;

		// (a) content pins
		const elemProps = fieldItems.properties as Record<string, unknown> | undefined;
		const pathField = elemProps?.content_pin ? (elemProps.path ? "path" : elemProps.file ? "file" : null) : null;

		// (b) typed condition baselines
		const branches = Array.isArray(fieldItems.oneOf) ? (fieldItems.oneOf as Array<Record<string, unknown>>) : [];
		const branchDeclares = (kind: string): boolean =>
			branches.some((b) => {
				const kindDecl = (b.properties as Record<string, unknown> | undefined)?.kind as
					| Record<string, unknown>
					| undefined;
				return kindDecl?.const === kind;
			});

		if (pathField === null && branches.length === 0) continue;

		item[field] = arr.map((el) => {
			if (!el || typeof el !== "object" || Array.isArray(el)) return el;
			const rec = el as Record<string, unknown>;
			if (pathField !== null && typeof rec.content_pin !== "string" && typeof rec[pathField] === "string") {
				const hash = fileHashOrNull(rec[pathField] as string);
				if (hash !== null) return { ...rec, content_pin: hash };
			}
			if (
				rec.kind === "file-changed" &&
				branchDeclares("file-changed") &&
				typeof rec.baseline_hash !== "string" &&
				typeof rec.path === "string"
			) {
				const hash = fileHashOrNull(rec.path);
				if (hash !== null) return { ...rec, baseline_hash: hash };
			}
			if (
				rec.kind === "revision-moved" &&
				branchDeclares("revision-moved") &&
				typeof rec.baseline_sha !== "string" &&
				typeof rec.ref === "string"
			) {
				const sha = resolveGitRefOrNull(projectRoot, rec.ref);
				if (sha !== null) return { ...rec, baseline_sha: sha };
			}
			return el;
		});
	}
}

/** Current commit of `ref` in the repo at `projectRoot`, or null (no repo / unresolvable). */
export function resolveGitRefOrNull(projectRoot: string, ref: string): string | null {
	try {
		const out = execFileSync("git", ["rev-parse", "--verify", `${ref}^{commit}`], {
			cwd: projectRoot,
			env: cleanGitEnv(),
			stdio: ["ignore", "pipe", "ignore"],
		})
			.toString()
			.trim();
		return out.length > 0 ? out : null;
	} catch {
		return null;
	}
}

export function prepareItemIdentityForWrite(
	substrateDir: string,
	blockName: string,
	item: Record<string, unknown>,
	schemaPath: string | null,
	arrayKey: string,
	mode: "create" | "update",
	prior?: Record<string, unknown>,
): Record<string, unknown> {
	// Schema-gate: no-op unless the array's items declare all three identity
	// fields. Cheap cache-backed check; runs before any substrate_id read or
	// hashing so non-identity schemas pay nothing.
	if (!arrayDeclaresIdentityFields(schemaPath, arrayKey)) {
		return item;
	}

	const out: Record<string, unknown> = { ...item };
	// Declared-baseline currency capture (FEAT-011 criterion 6) rides the
	// identity choke: citation/evidence content pins and typed stale-condition
	// baselines are stamped BEFORE the content projection is hashed, so
	// content_hash covers them and a later metadata-only write never sees a
	// phantom content change. Schema-gated per nested field (a schema not
	// declaring content_pin / the typed condition shapes is untouched).
	stampDeclaredBaselines(substrateDir, schemaPath as string, arrayKey, out);

	// `content_hash` is itself a metadata field; project (which drops it +
	// the rest of the floor + discretionary metadata) BEFORE assigning the
	// fresh hash. The schema must be parseable here — the gate passed, so the
	// file exists and is valid JSON (getSchemaCacheEntry already parsed it).
	const schema = JSON.parse(fs.readFileSync(schemaPath as string, "utf-8")) as Record<string, unknown>;

	if (mode === "create") {
		const substrateId = substrateIdForDir(substrateDir);
		out.oid = mintOid(substrateId);
		// content_parent intentionally absent on a v1 item.
		const projection = contentProjection(schema, arrayKey, out);
		const hash = computeContentHash(projection);
		out.content_hash = hash;
		// Object persistence is deferred to writeTypedFile's post-validation walk
		// (Cycle 9.1 P6): stamping must not write to objects/ before the whole
		// block clears AJV, else an AJV-fail leaves an orphan content object.
		return out;
	}

	// mode === "update"
	const priorOid = prior && typeof prior.oid === "string" ? (prior.oid as string) : undefined;
	const incomingOid = typeof out.oid === "string" ? (out.oid as string) : undefined;
	if (priorOid !== undefined && incomingOid !== undefined && incomingOid !== priorOid) {
		throw new Error(
			`prepareItemIdentityForWrite: oid is immutable — update to block '${blockName}' (array '${arrayKey}') would change oid '${priorOid}' to '${incomingOid}'`,
		);
	}
	// Preserve the prior oid (the canonical, content-independent identity).
	// When there is no prior oid (e.g. an update against an item that predates
	// identity stamping / was never stamped) the path ALWAYS mints — a
	// caller-supplied oid is never honored on first stamp, upholding the
	// "OIDs are system-minted, never caller-asserted" invariant identically to
	// create-mode. (`incomingOid` is still consulted by the immutability throw
	// guard above when a prior oid exists.)
	if (priorOid !== undefined) {
		out.oid = priorOid;
	} else {
		out.oid = mintOid(substrateIdForDir(substrateDir));
	}

	const priorHash = prior && typeof prior.content_hash === "string" ? (prior.content_hash as string) : undefined;
	const priorParent = prior && typeof prior.content_parent === "string" ? (prior.content_parent as string) : undefined;
	const projection = contentProjection(schema, arrayKey, out);
	const hash = computeContentHash(projection);
	out.content_hash = hash;
	// Object persistence deferred to writeTypedFile's post-validation walk
	// (Cycle 9.1 P6); see create-mode note above.
	// content_parent advances to the prior content_hash ONLY when content
	// actually changed. On an unchanged-content write (no-op / author-only
	// re-stamp) it is NOT advanced — instead the prior version's own
	// content_parent is PRESERVED (carried forward) so the version chain is not
	// truncated by a metadata-only write. When there is neither a prior hash
	// (first stamping write on a pre-existing item) nor a prior parent, it is
	// left absent.
	if (priorHash !== undefined && priorHash !== hash) {
		out.content_parent = priorHash;
	} else if (priorParent !== undefined) {
		out.content_parent = priorParent;
	} else {
		// No-op write whose prior had no parent (e.g. re-stamp of a v1 item):
		// ensure a stale content_parent does not linger on the carried item.
		delete out.content_parent;
	}
	return out;
}

/**
 * Read and parse a .project/{blockName}.json file.
 * Throws if the file does not exist or contains invalid JSON.
 *
 * Optional filter: when provided, returns a shallow copy of the block with only
 * matching items in the specified array key. Non-array or missing keys return the
 * block unchanged. The filter is applied after parsing, before returning.
 */
export function readBlockForDir(
	substrateDir: string,
	blockName: string,
	filter?: { arrayKey: string; predicate: (item: Record<string, unknown>) => boolean },
): unknown {
	const filePath = blockFilePathForDir(substrateDir, blockName);
	let content: string;
	try {
		content = fs.readFileSync(filePath, "utf-8");
	} catch {
		throw new Error(`Block file not found: ${filePath}`);
	}

	let data: unknown;
	try {
		data = JSON.parse(content);
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		throw new Error(`Invalid JSON in block file: ${filePath}: ${msg}`);
	}

	// Version-aware validation hook (FGAP-136 plan step 4). When the block has
	// an existing schema AND the parsed data carries a schema_version field,
	// route through validateBlockWithMigration with the substrate-loaded
	// project MigrationRegistry. The hook is conditional on schema_version
	// presence so pre-versioned blocks (no schema_version field on items)
	// pass through unchanged — the migration boundary only fires when there
	// IS a version assertion to compare against. Whole-block validation
	// uses the parsed `data` as-is; per-array-item migration is out of
	// scope today (the block envelope is what carries schema_version, not
	// each item).
	if (existingBlockSchemaPathForDir(substrateDir, blockName) !== null) {
		const envelope = data as Record<string, unknown> | null;
		if (envelope && typeof envelope === "object" && typeof envelope.schema_version === "string") {
			const registry = getProjectMigrationRegistryForDir(substrateDir);
			data = validateBlockWithMigrationForDir(substrateDir, blockName, envelope, registry);
		}
	}

	if (filter) {
		const record = data as Record<string, unknown>;
		const arr = record[filter.arrayKey];
		if (Array.isArray(arr)) {
			return { ...record, [filter.arrayKey]: arr.filter(filter.predicate) };
		}
	}

	return data;
}

export function readBlock(
	cwd: string,
	blockName: string,
	filter?: { arrayKey: string; predicate: (item: Record<string, unknown>) => boolean },
): unknown {
	// Assert the name BEFORE resolving the substrate dir so the FGAP-079
	// path-traversal guard fires ahead of BootstrapNotFoundError (preserves the
	// pre-Phase-0 ordering: name-guard precedes pointer resolution).
	assertSubstrateName(blockName);
	return readBlockForDir(resolveContextDir(cwd), blockName, filter);
}

/**
 * Resolve the existing schema path for a block (or null when no schema
 * file is present at the conventional location). Used by every wrapper
 * that delegates to the typed-file primitives.
 */
function existingBlockSchemaPathForDir(substrateDir: string, blockName: string): string | null {
	const schemaFile = blockSchemaPathForDir(substrateDir, blockName);
	return fs.existsSync(schemaFile) ? schemaFile : null;
}

/**
 * Read raw file content as a parsed value, throwing labeled errors
 * matching the prior `readBlock` semantics. Generalised so the typed-file
 * primitives can read arbitrary paths (not only `.project/<name>.json`).
 * `errorLabel` typically ends up like `block file '<name>.json'` or
 * `monitor '<name>' patterns`.
 */
function readTypedFile(filePath: string, errorLabel: string): unknown {
	let content: string;
	try {
		content = fs.readFileSync(filePath, "utf-8");
	} catch {
		throw new Error(`File not found: ${errorLabel} (${filePath})`);
	}
	try {
		return JSON.parse(content);
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		throw new Error(`Invalid JSON in ${errorLabel} (${filePath}): ${msg}`);
	}
}

/**
 * Validated whole-file write to an arbitrary `(filePath, schemaPath)` pair.
 * The `.project/`-targeting `writeBlock` becomes a thin wrapper over this.
 * `schemaPath = null` skips AJV validation entirely (matches `writeBlock`'s
 * "no schema file present" semantic).
 *
 * `ctx` (FGAP-004): when provided AND the schema declares author fields at
 * the top-level envelope (and `data` is object-shaped, NOT array-shaped),
 * the envelope is stamped before AJV runs. Top-level array files (e.g.
 * monitor pattern lists) skip envelope-stamping silently — the envelope
 * lookup returns an empty set for array schemas because their top-level
 * `properties` is undefined.
 *
 * Atomic write via tmp + rename. Does NOT itself acquire a `withBlockLock`
 * — whole-file overwrite has no read-modify-write race that locking would
 * protect against. Callers performing read-modify-write (e.g.
 * `appendToTypedFile`, `appendToBlock`, …) wrap the surrounding critical
 * section in `withBlockLock` themselves; `writeTypedFile` is then called
 * from inside that section. This matches the prior `writeBlock` /
 * `appendToBlock` split exactly — preserves byte-identical lock semantics
 * for existing callers.
 */
export function writeTypedFile(
	filePath: string,
	schemaPath: string | null,
	data: unknown,
	ctx?: DispatchContext,
	errorLabel?: string,
): void {
	const label = errorLabel ?? filePath;

	// Optional ctx-stamping: only when the schema declares author fields at
	// the top-level envelope, and only on object-shaped data. Per-field
	// declared subset is threaded into `stampItem` so partial declarations
	// (e.g. envelope declares `created_by` only) do not inject the other
	// three fields and trip `additionalProperties: false`.
	let toWrite = data;
	if (ctx && schemaPath && data && typeof data === "object" && !Array.isArray(data)) {
		const declared = declaredAuthorFieldsForEnvelope(schemaPath);
		if (declared.size > 0) {
			toWrite = stampItem(data as Record<string, unknown>, ctx, "create", declared);
		}
	}

	// Parse the supplied schema once — the version stamp below and the
	// post-validation object persistence both consume it.
	const parsedSchema: Record<string, unknown> | null = schemaPath
		? (JSON.parse(fs.readFileSync(schemaPath, "utf-8")) as Record<string, unknown>)
		: null;

	// Envelope schema_version stamp (TASK-073; the FGAP-105 fold-locus lands
	// generically here so EVERY versioned-document write converges — block
	// wrappers, whole-block writes, config, migrations.json all funnel through
	// writeTypedFile). When the schema declares a top-level `schema_version`
	// property AND carries a `version` string, the envelope is stamped to the
	// schema's current version — overwritten, never passed through, so the
	// persisted version is truthful by construction (an incoming stale version
	// has already been walked forward by the caller's migration gate). Self-
	// gating: a schema that does not declare the property (or has no version)
	// leaves the data untouched, so substrates whose installed schemas predate
	// the property keep writing unchanged until `/context update` lands it.
	if (parsedSchema && toWrite && typeof toWrite === "object" && !Array.isArray(toWrite)) {
		const props = parsedSchema.properties;
		if (
			props &&
			typeof props === "object" &&
			"schema_version" in (props as Record<string, unknown>) &&
			typeof parsedSchema.version === "string"
		) {
			toWrite = { ...(toWrite as Record<string, unknown>), schema_version: parsedSchema.version };
		}
	}

	// Validate before write (if a schema is supplied)
	if (schemaPath) {
		validateFromFile(schemaPath, toWrite, label);
	}

	// Post-validation object persistence (Cycle 9.1 P6). Content objects are
	// written to objects/ ONLY after the whole block clears AJV and BEFORE the
	// tmp+rename — so an AJV-fail leaves no orphan object, and a committed block
	// never references a missing object. Stamping (prepareItemIdentityForWrite)
	// computed each item's content_hash but no longer persists; we persist here.
	// Gated on schemaPath: a schema-less write carries no identity items, and
	// the per-item content_hash check protects the non-stamping config/registry/
	// relations/migrations writers (their items carry no content_hash).
	if (schemaPath && parsedSchema) {
		const substrateDir = path.dirname(filePath);
		const schema = parsedSchema;
		forEachBlockArray(toWrite, (arrayKey, arr) => {
			for (const item of arr) {
				if (item && typeof item === "object" && !Array.isArray(item)) {
					const rec = item as Record<string, unknown>;
					if (typeof rec.content_hash === "string" && !hasObject(substrateDir, rec.content_hash)) {
						putObject(substrateDir, rec.content_hash, contentProjection(schema, arrayKey, rec));
					}
				}
			}
		});
	}

	// Ensure directory exists
	fs.mkdirSync(path.dirname(filePath), { recursive: true });

	// Atomic write: tmp + rename. Callers needing read-modify-write atomicity
	// hold `withBlockLock(filePath, ...)` around the broader critical section.
	const tmpPath = `${filePath}.block-api-${process.pid}.tmp`;
	try {
		fs.writeFileSync(tmpPath, JSON.stringify(toWrite, null, 2), "utf-8");
		fs.renameSync(tmpPath, filePath);
	} catch (err) {
		try {
			fs.unlinkSync(tmpPath);
		} catch {
			/* ignore cleanup failure */
		}
		const msg = err instanceof Error ? err.message : String(err);
		throw new Error(`Failed to write ${label}: ${msg}`);
	}
}

/**
 * Validated atomic append to an array within a `(filePath, schemaPath)` pair.
 * `arrayPath = null` means "the file IS the array" (top-level array shape,
 * e.g. monitor patterns / instructions); `arrayPath = string` means
 * "data[arrayPath] is the target array" (object-with-array-field shape, the
 * `.project/` block convention).
 *
 * `ctx` (FGAP-004): when provided AND the schema declares author fields on
 * the items reached by `arrayPath` (or, for the flat-array case, on the
 * array's `items.properties.*`), the appended item is stamped via
 * `stampItem` in create-mode before AJV validation. For the flat-array
 * case the array key passed to the per-array-key cache lookup is the
 * arbitrary token `__top__` — `collectArrayItemAuthorDecisions` only
 * traverses `properties.*` paths and never visits a top-level array
 * schema, so the lookup will always miss; flat-array stamping is
 * intentionally a no-op until a schema actually declares author fields
 * on a top-level array shape (no current consumer does so).
 */
/**
 * Atomic id-uniqueness guard for the append path. Reads the `id` off the
 * incoming item (when it carries one) and rejects the append if any element
 * already present in `arr` shares that id. Items genuinely lacking an `id`
 * property are skipped (NOT fabricated) — mirrors the `"id" in item` gate the
 * tool layer used. The check runs inside the caller's `withBlockLock` critical
 * section against the array already in hand, so it is atomic (unlike a racy
 * `readBlock`-then-`append` at the tool layer). `labelForArray` is the
 * `<label>.<arrayKey>` context the message names.
 */
function assertAppendIdUnique(arr: unknown[], item: unknown, labelForArray: string): void {
	if (!item || typeof item !== "object" || Array.isArray(item)) return;
	const rec = item as Record<string, unknown>;
	if (!("id" in rec)) return;
	const id = rec.id;
	for (const existing of arr) {
		if (existing && typeof existing === "object" && (existing as Record<string, unknown>).id === id) {
			throw new Error(`Item '${String(id)}' already exists in ${labelForArray}`);
		}
	}
}

/**
 * Atomic whole-file id-uniqueness guard: rejects a whole-array write that
 * itself carries two elements sharing an `id`. Only elements that HAVE an `id`
 * property participate (mirrors `assertAppendIdUnique`'s gate); id-less
 * elements are skipped. `labelForArray` is the `<label>.<arrayKey>` context the
 * message names.
 */
function assertNoDuplicateIdsInArray(arr: unknown[], labelForArray: string): void {
	const seen = new Set<unknown>();
	for (const el of arr) {
		if (!el || typeof el !== "object" || Array.isArray(el)) continue;
		const rec = el as Record<string, unknown>;
		if (!("id" in rec)) continue;
		const id = rec.id;
		if (seen.has(id)) {
			throw new Error(`Item '${String(id)}' already exists in ${labelForArray}`);
		}
		seen.add(id);
	}
}

/**
 * Pure-data recursive walk over every array-valued property at any depth.
 * For a plain (non-array) object `data`, each `[key, value]` pair whose `value`
 * is an array is reported via `visit(key, value)`, then each element of that
 * array that is itself a plain (non-array) object is recursed into (so an
 * item's own nested id-bearing arrays — e.g. `layer-plans` items'
 * `layers` / `migration_phases` — are visited under their item-local key).
 * No schema is consulted; this matches the block shapes the schemas use
 * (top-level arrays of items, items carrying nested arrays of items). Non-array
 * object-valued properties that are NOT array elements are not descended into —
 * block items live in arrays, so only array elements are recursion frontiers.
 */
export function forEachBlockArray(data: unknown, visit: (arrayKey: string, array: unknown[]) => void): void {
	if (!data || typeof data !== "object" || Array.isArray(data)) return;
	for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
		if (!Array.isArray(value)) continue;
		visit(key, value);
		for (const el of value) {
			if (el && typeof el === "object" && !Array.isArray(el)) {
				forEachBlockArray(el, visit);
			}
		}
	}
}

export function appendToTypedFile(
	filePath: string,
	schemaPath: string | null,
	arrayPath: string | null,
	item: unknown,
	ctx?: DispatchContext,
	errorLabel?: string,
): void {
	const label = errorLabel ?? filePath;
	withBlockLock(filePath, () => {
		const data = readTypedFile(filePath, label);

		if (arrayPath === null) {
			// Flat top-level array shape: file content IS the array.
			if (!Array.isArray(data)) {
				throw new Error(`${label}: expected top-level array, got ${typeof data}`);
			}
			// Atomic id-uniqueness guard (reads the in-hand array under the lock).
			assertAppendIdUnique(data, item, `${label}.__top__`);
			const authored =
				ctx && item && typeof item === "object" && !Array.isArray(item)
					? maybeStampItem(schemaPath, "__top__", item as Record<string, unknown>, ctx, "create")
					: item;
			// Identity-stamp AFTER author-stamp (ordering is hash-neutral; see
			// prepareItemIdentityForWrite). Flat-array shape never identity-stamps.
			const itemToAppend = maybeIdentityStampTypedItem(filePath, schemaPath, null, authored, "create");
			const next = [...data, itemToAppend];
			// Validate the WHOLE array against schemaPath, then write.
			writeTypedFile(filePath, schemaPath, next, undefined, label);
			return;
		}

		// Object-with-array-field shape (the .project/ block convention).
		if (!data || typeof data !== "object" || Array.isArray(data)) {
			throw new Error(`${label}: expected object with array field '${arrayPath}'`);
		}
		const record = data as Record<string, unknown>;
		if (!(arrayPath in record)) {
			throw new Error(`${label} has no key '${arrayPath}'`);
		}
		if (!Array.isArray(record[arrayPath])) {
			throw new Error(`${label} key '${arrayPath}' is not an array`);
		}
		// Atomic id-uniqueness guard (reads the in-hand array under the lock).
		assertAppendIdUnique(record[arrayPath] as unknown[], item, `${label}.${arrayPath}`);
		const authored =
			ctx && item && typeof item === "object" && !Array.isArray(item)
				? maybeStampItem(schemaPath, arrayPath, item as Record<string, unknown>, ctx, "create")
				: item;
		const itemToAppend = maybeIdentityStampTypedItem(filePath, schemaPath, arrayPath, authored, "create");
		record[arrayPath] = [...(record[arrayPath] as unknown[]), itemToAppend];
		writeTypedFile(filePath, schemaPath, record, undefined, label);
	});
}

/**
 * Validated atomic bulk append-if-absent to an array within a
 * `(filePath, schemaPath)` pair. Each candidate in `items` is appended only
 * when no element already present (on-disk OR earlier in this same batch)
 * shares its `matchKey`. Dedup is keyed solely on `matchKey(item)` — the
 * write surface does no semantic validation beyond the whole-array AJV check
 * and this exact-duplicate-no-op; richer integrity (referential, etc.) is
 * deferred to callers / downstream validators.
 *
 * `arrayPath` mirrors `appendToTypedFile`: `null` ⇒ the file content IS the
 * array (flat top-level array shape); `string` ⇒ `data[arrayPath]` is the
 * target array (object-with-array-field shape, the `.project/` convention).
 * The branching is identical to `appendToTypedFile`'s.
 *
 * The whole read-find-write critical section runs inside `withBlockLock`, so
 * concurrent batches against the same file serialise. When `appended === 0`
 * nothing is written (the file is left byte-identical). The first write
 * against an absent file works: `withBlockLock` skips locking when the file is
 * absent (no contention possible), and the absent file is treated as an empty
 * array for the flat-array shape — only that shape is creatable from absence;
 * the object-with-array-field shape requires an existing envelope and so still
 * throws via `readTypedFile`.
 *
 * `ctx` is threaded to `writeTypedFile` for attestation parity; per the
 * top-level-array stamping semantics documented above, flat-array shapes with
 * no declared envelope author fields treat it as a structural no-op.
 */
export function appendManyToTypedFileIfAbsent(
	filePath: string,
	schemaPath: string | null,
	arrayPath: string | null,
	items: unknown[],
	matchKey: (item: unknown) => string,
	ctx?: DispatchContext,
	errorLabel?: string,
): { appended: number; skipped: number } {
	const label = errorLabel ?? filePath;
	return withBlockLock(filePath, () => {
		// Absent file is the empty-array starting point for the flat-array shape
		// (enables first-write file creation); the object-with-array-field shape
		// requires an existing envelope, so it reads through and throws below.
		const data = arrayPath === null && !fs.existsSync(filePath) ? [] : readTypedFile(filePath, label);

		if (arrayPath === null) {
			// Flat top-level array shape: file content IS the array.
			if (!Array.isArray(data)) {
				throw new Error(`${label}: expected top-level array, got ${typeof data}`);
			}
			const arr = [...data];
			const seen = new Set<string>(arr.map((existing) => matchKey(existing)));
			let appended = 0;
			let skipped = 0;
			for (const candidate of items) {
				const key = matchKey(candidate);
				if (seen.has(key)) {
					skipped++;
					continue;
				}
				seen.add(key);
				arr.push(candidate);
				appended++;
			}
			if (appended > 0) {
				writeTypedFile(filePath, schemaPath, arr, ctx, label);
			}
			return { appended, skipped };
		}

		// Object-with-array-field shape (the .project/ block convention).
		if (!data || typeof data !== "object" || Array.isArray(data)) {
			throw new Error(`${label}: expected object with array field '${arrayPath}'`);
		}
		const record = data as Record<string, unknown>;
		if (!(arrayPath in record)) {
			throw new Error(`${label} has no key '${arrayPath}'`);
		}
		if (!Array.isArray(record[arrayPath])) {
			throw new Error(`${label} key '${arrayPath}' is not an array`);
		}
		const arr = [...(record[arrayPath] as unknown[])];
		const seen = new Set<string>(arr.map((existing) => matchKey(existing)));
		let appended = 0;
		let skipped = 0;
		for (const candidate of items) {
			const key = matchKey(candidate);
			if (seen.has(key)) {
				skipped++;
				continue;
			}
			seen.add(key);
			// Identity-stamp each newly-appended candidate (create mode; an
			// append-if-absent candidate is always a fresh item). No-op unless
			// the schema declares identity fields.
			arr.push(maybeIdentityStampTypedItem(filePath, schemaPath, arrayPath, candidate, "create"));
			appended++;
		}
		if (appended > 0) {
			record[arrayPath] = arr;
			writeTypedFile(filePath, schemaPath, record, ctx, label);
		}
		return { appended, skipped };
	});
}

// ── Internal helpers shared by the typed-file find-or-merge primitives ─────

/**
 * Resolve the array reachable by `arrayPath` against `data` after the
 * standard read step, throwing labeled errors for the three structural
 * invariants common to every find-or-merge primitive:
 *   - `arrayPath === null` → `data` itself must be a plain array
 *   - `arrayPath === string` → `data` must be a non-array object with that
 *     key present and the value must be an array
 *
 * Returns the resolved array PLUS a writer thunk that puts the (possibly
 * new) array reference back into the parent shape so callers can hand the
 * mutated parent to `writeTypedFile`. The writer thunk is what isolates
 * the "file IS the array" case from the "object with array field" case
 * inside primitive bodies — every primitive uses the same shape-resolution
 * preamble and the same final `writeTypedFile` call regardless of the
 * top-level shape.
 *
 * Multi-match warnings, predicate-not-found semantics, and ctx-stamping
 * are NOT part of this helper — they vary per primitive (update throws on
 * miss, remove is idempotent, upsert decides append-vs-replace, etc.).
 */
function resolveTypedArrayShape(
	data: unknown,
	arrayPath: string | null,
	label: string,
): {
	arr: unknown[];
	rewriteParent: (next: unknown[]) => unknown;
} {
	if (arrayPath === null) {
		if (!Array.isArray(data)) {
			throw new Error(`${label}: expected top-level array, got ${typeof data}`);
		}
		return {
			arr: data,
			rewriteParent: (next) => next,
		};
	}
	if (!data || typeof data !== "object" || Array.isArray(data)) {
		throw new Error(`${label}: expected object with array field '${arrayPath}'`);
	}
	const record = data as Record<string, unknown>;
	if (!(arrayPath in record)) {
		throw new Error(`${label} has no key '${arrayPath}'`);
	}
	const candidate = record[arrayPath];
	if (!Array.isArray(candidate)) {
		throw new Error(`${label} key '${arrayPath}' is not an array`);
	}
	return {
		arr: candidate,
		rewriteParent: (next) => ({ ...record, [arrayPath]: next }),
	};
}

/**
 * Per-item ctx-stamping for the typed-file find-or-merge primitives.
 * Mirrors the existing `maybeStampItem` semantics but keys the schema
 * lookup by `arrayPath`. For the flat-array case (`arrayPath === null`)
 * the lookup uses the `__top__` sentinel which `collectArrayItemAuthorDecisions`
 * never populates — flat-array stamping is intentionally a no-op until a
 * schema actually declares author fields on a top-level array shape (no
 * current consumer does so). Documented in the FGAP-019 closure commit.
 */
function maybeStampTypedItem(
	schemaPath: string | null,
	arrayPath: string | null,
	item: Record<string, unknown>,
	ctx: DispatchContext | undefined,
	mode: "create" | "update",
): Record<string, unknown> {
	const key = arrayPath ?? "__top__";
	return maybeStampItem(schemaPath, key, item, ctx, mode);
}

/**
 * Per-item identity stamping (Cycle 3) for the typed-file mutation primitives.
 * Thin wrapper over `prepareItemIdentityForWrite` that derives
 * `substrateDir` / `blockName` from `filePath` (block files live at
 * `<substrateDir>/<block>.json`) and skips non-object items (a scalar / array
 * item cannot carry identity fields). The flat-array key (`arrayPath === null`)
 * maps to the `__top__` sentinel which `collectArrayItemIdentityDecisions`
 * never populates, so flat-array shapes never identity-stamp — same
 * intentional no-op as author stamping. NOT ctx-gated: identity is integrity,
 * not attestation, so this runs whether or not a DispatchContext was supplied;
 * the schema-gate inside `prepareItemIdentityForWrite` is the only fire/no-op
 * decision.
 */
function maybeIdentityStampTypedItem(
	filePath: string,
	schemaPath: string | null,
	arrayPath: string | null,
	item: unknown,
	mode: "create" | "update",
	prior?: Record<string, unknown>,
): unknown {
	if (!item || typeof item !== "object" || Array.isArray(item)) return item;
	const substrateDir = path.dirname(filePath);
	const blockName = path.basename(filePath, ".json");
	const key = arrayPath ?? "__top__";
	return prepareItemIdentityForWrite(
		substrateDir,
		blockName,
		item as Record<string, unknown>,
		schemaPath,
		key,
		mode,
		prior,
	);
}

/**
 * Validated atomic find-by-predicate update of one item inside an array
 * reachable from `(filePath, schemaPath, arrayPath)`. Generalises
 * `updateItemInBlock` to arbitrary file paths and supports both top-level
 * array files (`arrayPath === null`) and object-with-array-field files
 * (`arrayPath === string`). Throws on predicate miss; AJV validates the
 * whole file after mutation.
 *
 * Multi-match warning emits on stderr with the established `[block-api]`
 * prefix (grep-discoverable across legacy log lines).
 *
 * `ctx`: when supplied AND the schema declares author fields on the items
 * reachable by `arrayPath`, the merged item is stamped in update-mode
 * before AJV runs. Flat-array stamping is a no-op (see
 * `maybeStampTypedItem`).
 */
export function updateItemInTypedFile(
	filePath: string,
	schemaPath: string | null,
	arrayPath: string | null,
	predicate: (item: Record<string, unknown>) => boolean,
	updates: Record<string, unknown>,
	ctx?: DispatchContext,
	errorLabel?: string,
): void {
	const label = errorLabel ?? filePath;
	withBlockLock(filePath, () => {
		const data = readTypedFile(filePath, label);
		const { arr: rawArr, rewriteParent } = resolveTypedArrayShape(data, arrayPath, label);
		const arr = rawArr as Record<string, unknown>[];
		const idx = arr.findIndex(predicate);
		if (idx === -1) {
			throw new Error(`No matching item in ${label}${arrayPath !== null ? ` key '${arrayPath}'` : ""}`);
		}
		let matchCount = 1;
		for (let i = idx + 1; i < arr.length; i++) {
			if (predicate(arr[i])) matchCount++;
		}
		if (matchCount > 1) {
			console.error(`[block-api] updateItemInBlock: ${matchCount} items matched predicate, only first updated`);
		}
		const prior = arr[idx];
		const merged: Record<string, unknown> = { ...prior, ...updates };
		const authored = ctx ? maybeStampTypedItem(schemaPath, arrayPath, merged, ctx, "update") : merged;
		// Identity-stamp in update mode: preserve prior oid (throw on change),
		// recompute hash, advance content_parent on content change.
		const updated = maybeIdentityStampTypedItem(filePath, schemaPath, arrayPath, authored, "update", prior) as Record<
			string,
			unknown
		>;
		const patched = [...arr];
		patched[idx] = updated;
		writeTypedFile(filePath, schemaPath, rewriteParent(patched), undefined, label);
	});
}

/**
 * Validated atomic find-or-append. Generalises `upsertItemInBlock` to
 * arbitrary `(filePath, schemaPath, arrayPath)` triples, including
 * top-level array files via `arrayPath === null`.
 *
 * FGAP-018 fix lives here (was in `upsertItemInBlock` prior to Step 6.3):
 * on the update branch, declared create-time attestation fields are
 * pre-merged from the existing on-disk item onto the supplied item if
 * absent, so attestation integrity (FGAP-004) holds across replacement.
 * The wrapper `upsertItemInBlock` inherits the fix structurally.
 *
 * For the flat-array case the pre-merge is a structural no-op — the
 * `declaredAuthorFieldsForArray` lookup keyed by `__top__` returns the
 * empty set (top-level array schemas are never visited by
 * `collectArrayItemAuthorDecisions`), so no fields are carried. This is
 * intentional: no current consumer declares author fields on a top-level
 * array shape, and the unconditional pre-merge code path simply finds
 * nothing to merge. If a future consumer lands such a schema, the
 * stamping cataloguer needs an extension (filed-or-future work) — this
 * primitive will then start preserving attestation on flat-array upserts
 * automatically.
 */
export function upsertItemInTypedFile(
	filePath: string,
	schemaPath: string | null,
	arrayPath: string | null,
	item: Record<string, unknown>,
	idField: string,
	ctx?: DispatchContext,
	errorLabel?: string,
	opts?: { dryRun?: boolean },
): { mode: "appended" | "updated"; dryRun?: boolean } {
	const label = errorLabel ?? filePath;
	const idValue = item[idField];
	if (idValue === undefined || idValue === null || idValue === "") {
		throw new Error(
			`upsertItemInTypedFile: item is missing required idField '${idField}' (got: ${JSON.stringify(idValue)}) for ${label}`,
		);
	}
	return withBlockLock(filePath, () => {
		const data = readTypedFile(filePath, label);
		const { arr: rawArr, rewriteParent } = resolveTypedArrayShape(data, arrayPath, label);
		const arr = rawArr as Record<string, unknown>[];
		const idx = arr.findIndex((existing) => existing && existing[idField] === idValue);
		const mode: "appended" | "updated" = idx === -1 ? "appended" : "updated";
		const stampMode: "create" | "update" = mode === "appended" ? "create" : "update";

		// FGAP-018 fix: on update branch, pre-merge create-time attestation fields
		// from the existing on-disk item onto the supplied item if absent. stampItem
		// in update-mode does not touch created_*; this carries them forward across
		// replacement so attestation integrity (FGAP-004) holds. For the flat-array
		// case (arrayPath === null) the declared-fields lookup returns an empty set
		// and no carry happens — see the function-doc note.
		let itemForStamp = item;
		if (idx !== -1 && schemaPath) {
			const declared = declaredAuthorFieldsForArray(schemaPath, arrayPath ?? "__top__");
			const existing = arr[idx];
			const carriedFields: Record<string, unknown> = {};
			for (const field of ["created_by", "created_at"]) {
				if (declared.has(field) && !(field in item) && existing && field in existing) {
					carriedFields[field] = existing[field];
				}
			}
			if (Object.keys(carriedFields).length > 0) {
				itemForStamp = { ...carriedFields, ...item };
			}
		}

		const authored = ctx ? maybeStampTypedItem(schemaPath, arrayPath, itemForStamp, ctx, stampMode) : itemForStamp;
		// Identity-stamp: append branch is create (no prior); replace branch is
		// update with the on-disk item as prior, so prepareItemIdentityForWrite
		// preserves the prior oid even though upsert REPLACES (the supplied item
		// carries no oid) and advances content_parent on content change. This is
		// the identity analogue of the FGAP-018 created_* carry-forward above.
		const priorForIdentity = idx === -1 ? undefined : arr[idx];
		const stamped = maybeIdentityStampTypedItem(
			filePath,
			schemaPath,
			arrayPath,
			authored,
			stampMode,
			priorForIdentity,
		) as Record<string, unknown>;
		const patched = [...arr];
		if (idx === -1) {
			patched.push(stamped);
		} else {
			patched[idx] = stamped;
		}
		if (opts?.dryRun) {
			// Same validation writeTypedFile applies before writing (validateFromFile
			// on the prospective whole file, gated on a non-null schemaPath), run on
			// the STAMPED prospective so dryRun rejects/accepts identically to the
			// write — but write nothing. The lock above guarantees the prospective
			// matched a consistent on-disk snapshot.
			if (schemaPath) {
				validateFromFile(schemaPath, rewriteParent(patched), label);
			}
			return { mode, dryRun: true };
		}
		writeTypedFile(filePath, schemaPath, rewriteParent(patched), undefined, label);
		return { mode };
	});
}

/**
 * Validated atomic predicate-based remove. Generalises `removeFromBlock`
 * to arbitrary `(filePath, schemaPath, arrayPath)` triples including
 * top-level array files. Idempotent on miss (returns `{ removed: 0 }`
 * without throwing or writing). AJV validates whole file after mutation
 * (so e.g. a `minItems` violation surfaces).
 */
export function removeFromTypedFile(
	filePath: string,
	schemaPath: string | null,
	arrayPath: string | null,
	predicate: (item: Record<string, unknown>) => boolean,
	ctx?: DispatchContext,
	errorLabel?: string,
): { removed: number } {
	// See note in removeFromBlock: ctx is accepted for surface parity; no items
	// remain to stamp on removal.
	void ctx;
	const label = errorLabel ?? filePath;
	return withBlockLock(filePath, () => {
		const data = readTypedFile(filePath, label);
		const { arr: rawArr, rewriteParent } = resolveTypedArrayShape(data, arrayPath, label);
		const arr = rawArr as Record<string, unknown>[];
		const remaining = arr.filter((it) => !predicate(it));
		const removed = arr.length - remaining.length;
		if (removed === 0) {
			return { removed: 0 };
		}
		if (removed > 1) {
			console.error(`[block-api] removeFromBlock: ${removed} items matched predicate, all removed`);
		}
		writeTypedFile(filePath, schemaPath, rewriteParent(remaining), undefined, label);
		return { removed };
	});
}

/**
 * Validated atomic append to a nested array inside a parent-array item.
 * Generalises `appendToNestedArray` to arbitrary `(filePath, schemaPath,
 * parentArrayKey, nestedArrayKey)`. Nesting requires object-with-array-field
 * shape — a top-level array file cannot host nested arrays at the same
 * structural level — so `parentArrayKey` is `string` (no `null` form).
 *
 * Throws on missing parent key, no parent match, missing nested key, or
 * AJV failure. Multi-match warning emits at parent level via stderr with
 * the established `[block-api]` prefix.
 */
export function appendToNestedTypedFile(
	filePath: string,
	schemaPath: string | null,
	parentArrayKey: string,
	predicate: (item: Record<string, unknown>) => boolean,
	nestedArrayKey: string,
	item: unknown,
	ctx?: DispatchContext,
	errorLabel?: string,
): void {
	const label = errorLabel ?? filePath;
	withBlockLock(filePath, () => {
		const data = readTypedFile(filePath, label);
		const { arr: rawArr, rewriteParent } = resolveTypedArrayShape(data, parentArrayKey, label);
		const arr = rawArr as Record<string, unknown>[];
		const idx = arr.findIndex(predicate);
		if (idx === -1) {
			throw new Error(`No matching item in ${label} key '${parentArrayKey}'`);
		}
		let matchCount = 1;
		for (let i = idx + 1; i < arr.length; i++) {
			if (predicate(arr[i])) matchCount++;
		}
		if (matchCount > 1) {
			console.error(`[block-api] appendToNestedArray: ${matchCount} items matched predicate, only first updated`);
		}
		const parent = arr[idx];
		if (!(nestedArrayKey in parent)) {
			throw new Error(`Matched item in ${label} key '${parentArrayKey}' has no nested key '${nestedArrayKey}'`);
		}
		if (!Array.isArray(parent[nestedArrayKey])) {
			throw new Error(
				`Matched item in ${label} key '${parentArrayKey}' nested key '${nestedArrayKey}' is not an array`,
			);
		}
		// Atomic id-uniqueness guard on the nested array (Cycle 9.1 P4): reads the
		// in-hand nested array under the lock. Label names the full parent.nested path.
		assertAppendIdUnique(parent[nestedArrayKey] as unknown[], item, `${label}.${parentArrayKey}.${nestedArrayKey}`);
		const authored =
			ctx && item && typeof item === "object" && !Array.isArray(item)
				? maybeStampItem(schemaPath, nestedArrayKey, item as Record<string, unknown>, ctx, "create")
				: item;
		// Identity-stamp the appended nested item (create mode), keyed on the
		// nested array key so the gate consults the nested item subschema.
		const itemToAppend = maybeIdentityStampTypedItem(filePath, schemaPath, nestedArrayKey, authored, "create");
		const updatedParent = {
			...parent,
			[nestedArrayKey]: [...(parent[nestedArrayKey] as unknown[]), itemToAppend],
		};
		const patched = [...arr];
		patched[idx] = updatedParent;
		writeTypedFile(filePath, schemaPath, rewriteParent(patched), undefined, label);
	});
}

/**
 * Validated atomic update of a single item inside a nested array on a
 * parent-array item. Generalises `updateNestedArrayItem` to arbitrary
 * `(filePath, schemaPath, parentArrayKey, nestedArrayKey)`. Object-shape
 * file required (see `appendToNestedTypedFile` doc).
 *
 * Throws on missing parent key, no parent/nested match, missing nested
 * key, or AJV failure. Multi-match warnings emit at both parent and
 * nested levels via stderr with the `[block-api]` prefix.
 */
export function updateNestedItemInTypedFile(
	filePath: string,
	schemaPath: string | null,
	parentArrayKey: string,
	parentPredicate: (item: Record<string, unknown>) => boolean,
	nestedArrayKey: string,
	nestedPredicate: (item: Record<string, unknown>) => boolean,
	updates: Record<string, unknown>,
	ctx?: DispatchContext,
	errorLabel?: string,
): void {
	const label = errorLabel ?? filePath;
	withBlockLock(filePath, () => {
		const data = readTypedFile(filePath, label);
		const { arr: rawArr, rewriteParent } = resolveTypedArrayShape(data, parentArrayKey, label);
		const arr = rawArr as Record<string, unknown>[];
		const parentIdx = arr.findIndex(parentPredicate);
		if (parentIdx === -1) {
			throw new Error(`No matching item in ${label} key '${parentArrayKey}'`);
		}
		let parentMatchCount = 1;
		for (let i = parentIdx + 1; i < arr.length; i++) {
			if (parentPredicate(arr[i])) parentMatchCount++;
		}
		if (parentMatchCount > 1) {
			console.error(
				`[block-api] updateNestedArrayItem: ${parentMatchCount} parent items matched predicate, only first updated`,
			);
		}
		const parent = arr[parentIdx];
		if (!(nestedArrayKey in parent)) {
			throw new Error(`Matched item in ${label} key '${parentArrayKey}' has no nested key '${nestedArrayKey}'`);
		}
		if (!Array.isArray(parent[nestedArrayKey])) {
			throw new Error(
				`Matched item in ${label} key '${parentArrayKey}' nested key '${nestedArrayKey}' is not an array`,
			);
		}
		const nestedArr = parent[nestedArrayKey] as Record<string, unknown>[];
		const nestedIdx = nestedArr.findIndex(nestedPredicate);
		if (nestedIdx === -1) {
			throw new Error(`No matching nested item in ${label} key '${parentArrayKey}[${parentIdx}].${nestedArrayKey}'`);
		}
		let nestedMatchCount = 1;
		for (let i = nestedIdx + 1; i < nestedArr.length; i++) {
			if (nestedPredicate(nestedArr[i])) nestedMatchCount++;
		}
		if (nestedMatchCount > 1) {
			console.error(
				`[block-api] updateNestedArrayItem: ${nestedMatchCount} nested items matched predicate, only first updated`,
			);
		}
		const priorNested = nestedArr[nestedIdx];
		const mergedNested: Record<string, unknown> = { ...priorNested, ...updates };
		const authoredNested = ctx ? maybeStampItem(schemaPath, nestedArrayKey, mergedNested, ctx, "update") : mergedNested;
		// Identity-stamp the updated nested item (update mode; prior = on-disk
		// nested item) so oid is preserved/immutable and content_parent advances.
		const updatedNested = maybeIdentityStampTypedItem(
			filePath,
			schemaPath,
			nestedArrayKey,
			authoredNested,
			"update",
			priorNested,
		) as Record<string, unknown>;
		const patchedNested = [...nestedArr];
		patchedNested[nestedIdx] = updatedNested;
		const updatedParent = { ...parent, [nestedArrayKey]: patchedNested };
		const patchedParents = [...arr];
		patchedParents[parentIdx] = updatedParent;
		writeTypedFile(filePath, schemaPath, rewriteParent(patchedParents), undefined, label);
	});
}

/**
 * Validated atomic remove from a nested array. Generalises
 * `removeFromNestedArray` to arbitrary `(filePath, schemaPath,
 * parentArrayKey, nestedArrayKey)`. Object-shape file required (see
 * `appendToNestedTypedFile` doc). Idempotent on nested-miss (returns
 * `{ removed: 0 }`); throws on parent-miss to surface a malformed
 * caller, mirroring the wrapper's prior semantics.
 */
export function removeFromNestedTypedFile(
	filePath: string,
	schemaPath: string | null,
	parentArrayKey: string,
	parentPredicate: (item: Record<string, unknown>) => boolean,
	nestedArrayKey: string,
	nestedPredicate: (item: Record<string, unknown>) => boolean,
	ctx?: DispatchContext,
	errorLabel?: string,
): { removed: number } {
	void ctx;
	const label = errorLabel ?? filePath;
	return withBlockLock(filePath, () => {
		const data = readTypedFile(filePath, label);
		const { arr: rawArr, rewriteParent } = resolveTypedArrayShape(data, parentArrayKey, label);
		const arr = rawArr as Record<string, unknown>[];
		const parentIdx = arr.findIndex(parentPredicate);
		if (parentIdx === -1) {
			throw new Error(`No matching item in ${label} key '${parentArrayKey}'`);
		}
		let parentMatchCount = 1;
		for (let i = parentIdx + 1; i < arr.length; i++) {
			if (parentPredicate(arr[i])) parentMatchCount++;
		}
		if (parentMatchCount > 1) {
			console.error(
				`[block-api] removeFromNestedArray: ${parentMatchCount} parent items matched predicate, only first targeted`,
			);
		}
		const parent = arr[parentIdx];
		if (!(nestedArrayKey in parent)) {
			throw new Error(`Matched item in ${label} key '${parentArrayKey}' has no nested key '${nestedArrayKey}'`);
		}
		if (!Array.isArray(parent[nestedArrayKey])) {
			throw new Error(
				`Matched item in ${label} key '${parentArrayKey}' nested key '${nestedArrayKey}' is not an array`,
			);
		}
		const nestedArr = parent[nestedArrayKey] as Record<string, unknown>[];
		const nestedRemaining = nestedArr.filter((it) => !nestedPredicate(it));
		const removed = nestedArr.length - nestedRemaining.length;
		if (removed === 0) {
			return { removed: 0 };
		}
		if (removed > 1) {
			console.error(`[block-api] removeFromNestedArray: ${removed} nested items matched predicate, all removed`);
		}
		const updatedParent = { ...parent, [nestedArrayKey]: nestedRemaining };
		const patched = [...arr];
		patched[parentIdx] = updatedParent;
		writeTypedFile(filePath, schemaPath, rewriteParent(patched), undefined, label);
		return { removed };
	});
}

/**
 * Validate `data` against its schema (if one exists) and write atomically
 * to `.project/{blockName}.json`. Throws `ValidationError` on schema failure.
 * Files without a corresponding schema are written without validation.
 *
 * Thin wrapper over `writeTypedFile` — see that function for full semantics.
 * `ctx` (FGAP-004): whole-block writes are treated as create-mode envelope
 * stamping; callers wanting per-item attribution should prefer the
 * array-grained writers.
 */
export function writeBlockForDir(substrateDir: string, blockName: string, data: unknown, ctx?: DispatchContext): void {
	const filePath = blockFilePathForDir(substrateDir, blockName);
	const schemaPath = existingBlockSchemaPathForDir(substrateDir, blockName);

	// Whole-block identity stamping (Cycle 3): for every top-level array whose
	// item subschema declares the identity fields, stamp each item — mint-or-
	// preserve oid, recompute content_hash, advance content_parent on change.
	// Prior item state is read from the on-disk block and matched by oid (then
	// id) so a re-written item preserves its oid and only advances its parent
	// when its content actually changed. A no-op for non-identity schemas /
	// non-object data (the gate inside prepareItemIdentityForWrite short-
	// circuits). Author-only re-stamping is hash-neutral, so a whole-block
	// re-write that merely refreshes attestation leaves content hashes stable.
	// Whole-file id-uniqueness guard: a whole-block write carrying two items
	// sharing an `id` within one array is rejected before stamping/validation.
	// Recurses through nested id-bearing arrays (Cycle 9.1 P4) so a duplicate id
	// inside e.g. a `layer-plans` item's `layers` is rejected too.
	if (data && typeof data === "object" && !Array.isArray(data)) {
		forEachBlockArray(data, (arrayKey, arr) => assertNoDuplicateIdsInArray(arr, `${blockName}.${arrayKey}`));
	}

	let identityStamped: unknown = data;
	if (schemaPath !== null && data && typeof data === "object" && !Array.isArray(data)) {
		identityStamped = stampWholeBlockIdentity(
			substrateDir,
			blockName,
			filePath,
			schemaPath,
			data as Record<string, unknown>,
		);
	}

	// Version-aware pre-write validation (FGAP-136 plan step 4). When a
	// schema is present AND the data envelope carries a schema_version,
	// run validateBlockWithMigration with the substrate-loaded
	// MigrationRegistry. A version-mismatch with no declared migration
	// throws upstream of writeTypedFile so the file never lands; a
	// declared migration walks the data forward before AJV runs. The
	// migrated form is what writeTypedFile receives. The ForDir registry +
	// validation read the TARGET substrate's schema + migrations.json, never
	// the active dir's.
	let toWrite: unknown = identityStamped;
	if (
		schemaPath !== null &&
		identityStamped &&
		typeof identityStamped === "object" &&
		typeof (identityStamped as Record<string, unknown>).schema_version === "string"
	) {
		const registry = getProjectMigrationRegistryForDir(substrateDir);
		toWrite = validateBlockWithMigrationForDir(substrateDir, blockName, identityStamped, registry);
	}

	writeTypedFile(filePath, schemaPath, toWrite, ctx, `block file '${blockName}.json'`);
}

/**
 * Identity-stamp every item of every top-level array in a whole-block write
 * (Cycle 3 / locked decision: writeBlockForDir stamps each array item). Reads
 * the on-disk block (if present) to build a prior-item index keyed by `oid`
 * (primary) then `id` (fallback), so each re-written item:
 *   - reuses its prior `oid` (immutable; `prepareItemIdentityForWrite` throws
 *     if the incoming item carries a DIFFERENT non-empty oid),
 *   - recomputes its `content_hash`,
 *   - advances `content_parent` to the prior hash only when content changed.
 * An item with no on-disk match is treated as a fresh create (mints an oid).
 * Returns a shallow-cloned block; the input is not mutated. Arrays whose item
 * subschema does not declare the identity fields pass through untouched (the
 * gate inside `prepareItemIdentityForWrite` short-circuits per item).
 */
function stampWholeBlockIdentity(
	substrateDir: string,
	blockName: string,
	filePath: string,
	schemaPath: string,
	data: Record<string, unknown>,
): Record<string, unknown> {
	// Read prior on-disk block directly (no migration hook, no lock — caller
	// holds the lock when one is needed; a fresh read here just supplies the
	// prior-item index). Absent file → no priors → every item is a create.
	let priorData: Record<string, unknown> | null = null;
	if (fs.existsSync(filePath)) {
		try {
			priorData = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Record<string, unknown>;
		} catch {
			priorData = null;
		}
	}

	const out: Record<string, unknown> = { ...data };
	for (const [arrayKey, value] of Object.entries(data)) {
		if (!Array.isArray(value)) continue;
		if (!arrayDeclaresIdentityFields(schemaPath, arrayKey)) continue;

		// Build prior index for this array, keyed by oid then id.
		const priorByOid = new Map<string, Record<string, unknown>>();
		const priorById = new Map<string, Record<string, unknown>>();
		const priorArr = priorData && Array.isArray(priorData[arrayKey]) ? (priorData[arrayKey] as unknown[]) : [];
		for (const p of priorArr) {
			if (!p || typeof p !== "object") continue;
			const rec = p as Record<string, unknown>;
			if (typeof rec.oid === "string") priorByOid.set(rec.oid, rec);
			if (typeof rec.id === "string") priorById.set(rec.id, rec);
		}

		out[arrayKey] = value.map((item) => {
			if (!item || typeof item !== "object" || Array.isArray(item)) return item;
			const rec = item as Record<string, unknown>;
			const prior =
				(typeof rec.oid === "string" ? priorByOid.get(rec.oid) : undefined) ??
				(typeof rec.id === "string" ? priorById.get(rec.id) : undefined);
			const mode: "create" | "update" = prior ? "update" : "create";
			return prepareItemIdentityForWrite(substrateDir, blockName, rec, schemaPath, arrayKey, mode, prior);
		});
	}
	return out;
}

export function writeBlock(cwd: string, blockName: string, data: unknown, ctx?: DispatchContext): void {
	// Name-guard before pointer resolution (FGAP-079 ordering; see readBlock).
	assertSubstrateName(blockName);
	writeBlockForDir(resolveContextDir(cwd), blockName, data, ctx);
}

/**
 * Read current file, push item onto data[arrayKey], validate whole file
 * against schema, write atomically. Throws if file doesn't exist, if
 * arrayKey is missing or not an array, or if validation fails.
 *
 * `ctx` (FGAP-004): when provided AND the schema declares author fields on
 * `properties.<arrayKey>.items.properties.*`, the appended item is stamped
 * via `stampItem` in create-mode before AJV validation. Schemas that don't
 * declare author fields fall through unstamped — guards against
 * `additionalProperties: false` AJV failures on blocks whose item shape
 * doesn't carry author markers yet.
 */
export function appendToBlockForDir(
	substrateDir: string,
	blockName: string,
	arrayKey: string,
	item: unknown,
	ctx?: DispatchContext,
): void {
	withBlockLock(blockFilePathForDir(substrateDir, blockName), () => {
		const data = readBlockForDir(substrateDir, blockName);

		if (!data || typeof data !== "object") {
			throw new Error(`Block '${blockName}' is not an object`);
		}

		const record = data as Record<string, unknown>;
		if (!(arrayKey in record)) {
			throw new Error(`Block '${blockName}' has no key '${arrayKey}'`);
		}
		if (!Array.isArray(record[arrayKey])) {
			throw new Error(`Block '${blockName}' key '${arrayKey}' is not an array`);
		}

		// Atomic id-uniqueness guard (reads the in-hand array under the lock).
		// This primitive writes inline (does NOT route through appendToTypedFile),
		// so the guard is applied here separately.
		assertAppendIdUnique(record[arrayKey] as unknown[], item, `${blockName}.${arrayKey}`);

		// Optional ctx-stamping for object-shaped items (skipped silently for
		// scalar items even when the schema technically permits author fields —
		// stamping a string / number is meaningless).
		const schemaPath = existingBlockSchemaPathForDir(substrateDir, blockName);
		const itemToAppend =
			ctx && item && typeof item === "object" && !Array.isArray(item)
				? maybeStampItem(schemaPath, arrayKey, item as Record<string, unknown>, ctx, "create")
				: item;

		record[arrayKey] = [...(record[arrayKey] as unknown[]), itemToAppend];
		writeBlockForDir(substrateDir, blockName, record);
	});
}

export function appendToBlock(
	cwd: string,
	blockName: string,
	arrayKey: string,
	item: unknown,
	ctx?: DispatchContext,
): void {
	// Name-guard before pointer resolution (FGAP-079 ordering; see readBlock).
	assertSubstrateName(blockName);
	appendToBlockForDir(resolveContextDir(cwd), blockName, arrayKey, item, ctx);
}

/**
 * Find an item in data[arrayKey] by predicate, shallow-merge updates onto it,
 * validate whole file against schema, write atomically. Throws if no item
 * matches, if arrayKey is missing or not an array, or if validation fails.
 *
 * `ctx` (FGAP-004): when provided AND the schema declares author fields on
 * the array's items, the merged item is run through `stampItem` in
 * update-mode after the shallow merge — `created_by` / `created_at` are
 * preserved, `modified_by` / `modified_at` refresh.
 */
export function updateItemInBlockForDir(
	substrateDir: string,
	blockName: string,
	arrayKey: string,
	predicate: (item: Record<string, unknown>) => boolean,
	updates: Record<string, unknown>,
	ctx?: DispatchContext,
): void {
	const filePath = blockFilePathForDir(substrateDir, blockName);
	const schemaPath = existingBlockSchemaPathForDir(substrateDir, blockName);
	updateItemInTypedFile(filePath, schemaPath, arrayKey, predicate, updates, ctx, `block file '${blockName}.json'`);
}

export function updateItemInBlock(
	cwd: string,
	blockName: string,
	arrayKey: string,
	predicate: (item: Record<string, unknown>) => boolean,
	updates: Record<string, unknown>,
	ctx?: DispatchContext,
): void {
	// Name-guard before pointer resolution (FGAP-079 ordering; see readBlock).
	assertSubstrateName(blockName);
	updateItemInBlockForDir(resolveContextDir(cwd), blockName, arrayKey, predicate, updates, ctx);
}

/**
 * Atomically find-or-append a single item in `data[arrayKey]` keyed by
 * `idField`. Acquires the block lock; reads the array; locates the first
 * existing item where `existingItem[idField] === item[idField]`; if found
 * the item at that index is REPLACED (not shallow-merged) by the supplied
 * `item` and stamping runs in `"update"` mode; otherwise `item` is pushed
 * onto the array and stamping runs in `"create"` mode. AJV validates the
 * whole file against the schema after mutation, before write.
 *
 * Composing existing `updateItemInBlock` + `appendToBlock` from a caller
 * would release the block lock between the read-check and the mutating
 * write, which is race-prone for concurrent monitor/LLM writes against the
 * same block — this primitive holds the lock for both halves of the
 * find-or-append decision in one atomic critical section.
 *
 * Throws when `item[idField]` is missing or empty (defensive — surfaces a
 * malformed call site early instead of silently appending a duplicate
 * that would never match on a subsequent upsert). Throws on the usual
 * block / arrayKey / not-array invariants and on AJV validation failure.
 *
 * Replacement semantics (vs. updateItemInBlock's shallow-merge): upsert is
 * the call surface for monitor write-actions where the template produces
 * the FULL item shape per classification — there is no prior partial state
 * to merge against. Callers that need merge-on-update should continue to
 * use `updateItemInBlock`.
 */
export function upsertItemInBlockForDir(
	substrateDir: string,
	blockName: string,
	arrayKey: string,
	item: Record<string, unknown>,
	idField: string,
	ctx?: DispatchContext,
	opts?: { dryRun?: boolean },
): { mode: "appended" | "updated"; dryRun?: boolean } {
	const filePath = blockFilePathForDir(substrateDir, blockName);
	const schemaPath = existingBlockSchemaPathForDir(substrateDir, blockName);
	return upsertItemInTypedFile(
		filePath,
		schemaPath,
		arrayKey,
		item,
		idField,
		ctx,
		`block file '${blockName}.json'`,
		opts,
	);
}

export function upsertItemInBlock(
	cwd: string,
	blockName: string,
	arrayKey: string,
	item: Record<string, unknown>,
	idField: string,
	ctx?: DispatchContext,
	opts?: { dryRun?: boolean },
): { mode: "appended" | "updated"; dryRun?: boolean } {
	// Name-guard before pointer resolution (FGAP-079 ordering; see readBlock).
	assertSubstrateName(blockName);
	return upsertItemInBlockForDir(resolveContextDir(cwd), blockName, arrayKey, item, idField, ctx, opts);
}

/**
 * Atomically append an item to a nested array inside a parent-array item.
 *
 * Read current file, locate parent-array item by predicate, push `item` onto
 * `data[parentArrayKey][matchedIndex][nestedArrayKey]`, validate whole file
 * against schema, write atomically. Throws if file doesn't exist; if
 * parentArrayKey is missing or not an array; if no parent item matches the
 * predicate; if the matched parent item has no `nestedArrayKey` or it is not
 * an array; or if validation fails. Mirrors updateItemInBlock's structure:
 * file lock, predicate findIndex, multi-match warning, clone-before-write so
 * the original array remains unmodified if writeBlock throws.
 */
export function appendToNestedArrayForDir(
	substrateDir: string,
	blockName: string,
	parentArrayKey: string,
	predicate: (item: Record<string, unknown>) => boolean,
	nestedArrayKey: string,
	item: unknown,
	ctx?: DispatchContext,
): void {
	const filePath = blockFilePathForDir(substrateDir, blockName);
	const schemaPath = existingBlockSchemaPathForDir(substrateDir, blockName);
	appendToNestedTypedFile(
		filePath,
		schemaPath,
		parentArrayKey,
		predicate,
		nestedArrayKey,
		item,
		ctx,
		`block file '${blockName}.json'`,
	);
}

export function appendToNestedArray(
	cwd: string,
	blockName: string,
	parentArrayKey: string,
	predicate: (item: Record<string, unknown>) => boolean,
	nestedArrayKey: string,
	item: unknown,
	ctx?: DispatchContext,
): void {
	// Name-guard before pointer resolution (FGAP-079 ordering; see readBlock).
	assertSubstrateName(blockName);
	appendToNestedArrayForDir(resolveContextDir(cwd), blockName, parentArrayKey, predicate, nestedArrayKey, item, ctx);
}

/**
 * Atomically update a single item inside a nested array on a parent-array
 * item: locate parent by parentPredicate, locate nested by nestedPredicate,
 * shallow-merge `updates` onto the matched nested item, validate the whole
 * file against schema, write atomically. Throws on missing block / missing
 * parent key / parent key not array / no parent match / matched parent
 * missing nestedKey / nested key not array / no nested match / validation
 * failure. Multi-match warnings emit at both parent and nested levels via
 * console.error (mirrors the established appendToNestedArray /
 * updateItemInBlock convention). Clone-then-write keeps the original arrays
 * unmodified if writeBlock throws.
 */
export function updateNestedArrayItemForDir(
	substrateDir: string,
	blockName: string,
	parentArrayKey: string,
	parentPredicate: (item: Record<string, unknown>) => boolean,
	nestedArrayKey: string,
	nestedPredicate: (item: Record<string, unknown>) => boolean,
	updates: Record<string, unknown>,
	ctx?: DispatchContext,
): void {
	const filePath = blockFilePathForDir(substrateDir, blockName);
	const schemaPath = existingBlockSchemaPathForDir(substrateDir, blockName);
	updateNestedItemInTypedFile(
		filePath,
		schemaPath,
		parentArrayKey,
		parentPredicate,
		nestedArrayKey,
		nestedPredicate,
		updates,
		ctx,
		`block file '${blockName}.json'`,
	);
}

export function updateNestedArrayItem(
	cwd: string,
	blockName: string,
	parentArrayKey: string,
	parentPredicate: (item: Record<string, unknown>) => boolean,
	nestedArrayKey: string,
	nestedPredicate: (item: Record<string, unknown>) => boolean,
	updates: Record<string, unknown>,
	ctx?: DispatchContext,
): void {
	// Name-guard before pointer resolution (FGAP-079 ordering; see readBlock).
	assertSubstrateName(blockName);
	updateNestedArrayItemForDir(
		resolveContextDir(cwd),
		blockName,
		parentArrayKey,
		parentPredicate,
		nestedArrayKey,
		nestedPredicate,
		updates,
		ctx,
	);
}

/**
 * Atomically remove all items matching `predicate` from a top-level array
 * inside `data[arrayKey]`, validate the whole file against schema, write
 * atomically. Returns `{ removed: <count> }`. Throws on missing block /
 * missing key / key not array / validation failure (e.g., schema requires
 * minItems and removal violates it). Returns `{ removed: 0 }` on no match
 * without throwing — removal of a non-existent item is treated as an
 * idempotent successful no-op, distinct from update which throws on miss.
 */
export function removeFromBlockForDir(
	substrateDir: string,
	blockName: string,
	arrayKey: string,
	predicate: (item: Record<string, unknown>) => boolean,
	ctx?: DispatchContext,
): { removed: number } {
	const filePath = blockFilePathForDir(substrateDir, blockName);
	const schemaPath = existingBlockSchemaPathForDir(substrateDir, blockName);
	return removeFromTypedFile(filePath, schemaPath, arrayKey, predicate, ctx, `block file '${blockName}.json'`);
}

export function removeFromBlock(
	cwd: string,
	blockName: string,
	arrayKey: string,
	predicate: (item: Record<string, unknown>) => boolean,
	ctx?: DispatchContext,
): { removed: number } {
	// Name-guard before pointer resolution (FGAP-079 ordering; see readBlock).
	assertSubstrateName(blockName);
	return removeFromBlockForDir(resolveContextDir(cwd), blockName, arrayKey, predicate, ctx);
}

/**
 * Atomically remove all items matching `nestedPredicate` from a nested array
 * inside the parent-array item matched by `parentPredicate`. Validates and
 * writes atomically. Returns `{ removed: <count> }`. Throws on missing block
 * / missing parent key / parent key not array / no parent match / matched
 * parent missing nestedKey / nested key not array / validation failure.
 * Returns `{ removed: 0 }` on no nested match without throwing (idempotent,
 * mirrors removeFromBlock semantics). Multi-match warning at parent level
 * via console.error.
 */
export function removeFromNestedArrayForDir(
	substrateDir: string,
	blockName: string,
	parentArrayKey: string,
	parentPredicate: (item: Record<string, unknown>) => boolean,
	nestedArrayKey: string,
	nestedPredicate: (item: Record<string, unknown>) => boolean,
	ctx?: DispatchContext,
): { removed: number } {
	const filePath = blockFilePathForDir(substrateDir, blockName);
	const schemaPath = existingBlockSchemaPathForDir(substrateDir, blockName);
	return removeFromNestedTypedFile(
		filePath,
		schemaPath,
		parentArrayKey,
		parentPredicate,
		nestedArrayKey,
		nestedPredicate,
		ctx,
		`block file '${blockName}.json'`,
	);
}

export function removeFromNestedArray(
	cwd: string,
	blockName: string,
	parentArrayKey: string,
	parentPredicate: (item: Record<string, unknown>) => boolean,
	nestedArrayKey: string,
	nestedPredicate: (item: Record<string, unknown>) => boolean,
	ctx?: DispatchContext,
): { removed: number } {
	// Name-guard before pointer resolution (FGAP-079 ordering; see readBlock).
	assertSubstrateName(blockName);
	return removeFromNestedArrayForDir(
		resolveContextDir(cwd),
		blockName,
		parentArrayKey,
		parentPredicate,
		nestedArrayKey,
		nestedPredicate,
		ctx,
	);
}

/**
 * Read all `.json` files in a `.project/<subdir>/` directory and return the
 * parsed contents as a sorted array. Sort order is filesystem-name ascending
 * (matches Array.sort default on the basename strings). Missing directories
 * return `[]` — on-demand `.project/` subdirectories are valid and represent
 * "no items yet". Throws on filesystem read failure of a present file or on
 * invalid JSON, with file-relative path in the error message. Behavior must
 * match the previous private `executeReadDir` in pi-workflows step-block.ts
 * byte-identically; both pi-workflows and the `read-block-dir` registered
 * tool consume this single export.
 */
export function readBlockDirForDir(substrateDir: string, subdir: string): unknown[] {
	const dirPath = path.join(substrateDir, subdir);

	let entries: string[];
	try {
		entries = fs
			.readdirSync(dirPath)
			.filter((f) => f.endsWith(".json"))
			.sort();
	} catch {
		// Missing directory = "no items yet" for on-demand substrate-dir subdirectories
		return [];
	}

	const results: unknown[] = [];
	for (const filename of entries) {
		const filePath = path.join(dirPath, filename);
		let content: string;
		try {
			content = fs.readFileSync(filePath, "utf-8");
		} catch {
			throw new Error(`Cannot read file: ${filePath}`);
		}
		try {
			results.push(JSON.parse(content));
		} catch {
			throw new Error(`Invalid JSON in: ${filePath}`);
		}
	}
	return results;
}

export function readBlockDir(cwd: string, subdir: string): unknown[] {
	const root = tryResolveContextDir(cwd);
	if (root === null) return []; // no .pi-context.json pointer → no items (consistent with missing-dir → [])
	return readBlockDirForDir(root, subdir);
}

// ── Item-schema resolution + id allocation (FGAP-083 / FGAP-084) ──────────────

/**
 * Resolve the item subschema for a block schema: find the first array property
 * carrying `items`, dereferencing a single-level `$ref` to `#/definitions/<x>`
 * or `#/$defs/<x>` (the shape FK-stripped block schemas use, e.g. features /
 * spec-reviews). Returns the array key + the resolved item schema object (with
 * its `properties` / `required` / `id`). Throws when no array property is found
 * or the `$ref` cannot be resolved.
 *
 * FGAP-083: callers that read `items.properties.id.pattern` / `items.required`
 * straight off `props[arrayKey].items` get `undefined` for `$ref` items; this
 * one dereference is the fix shared by auto-id, author-field auto-stamp, and
 * whole-file validation.
 */
export function resolveBlockItemSchema(schema: Record<string, unknown>): {
	arrayKey: string;
	itemSchema: Record<string, unknown>;
} {
	const props = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
	let arrayKey: string | undefined;
	for (const [k, v] of Object.entries(props)) {
		if (v && v.type === "array" && v.items) {
			arrayKey = k;
			break;
		}
	}
	if (!arrayKey) {
		throw new Error("resolveBlockItemSchema: no array property with items found in schema");
	}
	let items = (props[arrayKey] as Record<string, unknown>).items as Record<string, unknown>;
	const ref = typeof items.$ref === "string" ? (items.$ref as string) : undefined;
	if (ref) {
		const m = /^#\/(definitions|\$defs)\/(.+)$/.exec(ref);
		if (!m) {
			throw new Error(`resolveBlockItemSchema: unsupported $ref '${ref}' (only #/definitions/* or #/$defs/*)`);
		}
		const bag = (schema[m[1]] ?? {}) as Record<string, Record<string, unknown>>;
		const target = bag[m[2]];
		if (!target) {
			throw new Error(`resolveBlockItemSchema: $ref '${ref}' does not resolve in schema`);
		}
		items = target;
	}
	return { arrayKey, itemSchema: items };
}

/**
 * Allocate the next id for a block from its schema's id pattern — canonical and
 * `$ref`-aware (FGAP-084 / FGAP-083). Reads the block schema, resolves the item
 * subschema, parses the `id` pattern's prefix + minimum digit width
 * (`^FGAP-\d{3}$` → `FGAP-`/3; `^TASK-\d{3,}$` → `TASK-`/3), scans existing item
 * ids for the max numeric suffix, and returns `prefix` + zero-padded (maxN+1).
 * Throws when the schema is missing or the id pattern is absent / not
 * prefix+width parseable. Orchestrator CLIs + the in-pi append tool route
 * through this instead of re-implementing allocation.
 */
export function nextIdForDir(substrateDir: string, blockName: string): string {
	const schemaFile = blockSchemaPathForDir(substrateDir, blockName);
	if (!fs.existsSync(schemaFile)) {
		throw new Error(`nextId: schema not found for block '${blockName}' at ${schemaFile}`);
	}
	const schema = JSON.parse(fs.readFileSync(schemaFile, "utf-8")) as Record<string, unknown>;
	const { arrayKey, itemSchema } = resolveBlockItemSchema(schema);
	const idProp = ((itemSchema.properties ?? {}) as Record<string, Record<string, unknown>>).id;
	const pattern = idProp && typeof idProp.pattern === "string" ? (idProp.pattern as string) : undefined;
	if (!pattern) {
		throw new Error(`nextId: block '${blockName}' item schema has no id.pattern`);
	}
	const m = /^\^([A-Za-z_-]+)\\d\{(\d+)(?:,\d*)?\}\$$/.exec(pattern);
	if (!m) {
		throw new Error(`nextId: id pattern '${pattern}' for block '${blockName}' is not prefix+width parseable`);
	}
	const prefix = m[1];
	const width = Number.parseInt(m[2], 10);
	const data = readBlockForDir(substrateDir, blockName) as Record<string, unknown>;
	const items = (data[arrayKey] ?? []) as Array<Record<string, unknown>>;
	const re = new RegExp(`^${prefix}(\\d+)$`);
	let maxN = 0;
	for (const it of items) {
		const id = typeof it.id === "string" ? it.id : "";
		const mm = re.exec(id);
		if (mm) {
			const n = Number.parseInt(mm[1], 10);
			if (n > maxN) maxN = n;
		}
	}
	return `${prefix}${String(maxN + 1).padStart(width, "0")}`;
}

export function nextId(cwd: string, blockName: string): string {
	// Name-guard before pointer resolution (FGAP-079 ordering; see readBlock).
	assertSubstrateName(blockName);
	return nextIdForDir(resolveContextDir(cwd), blockName);
}
