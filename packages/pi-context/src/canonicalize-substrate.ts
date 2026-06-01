/**
 * canonicalize-substrate — Cycle-10 one-shot substrate CANONICALIZER engine.
 *
 * Transforms ONE substrate IN PLACE (on whatever dir it is given — the
 * orchestrator points this at a work-dupe, never the live substrate) into
 * canonical content-addressed shape:
 *
 *   1. substrate_id — minted + written when absent (so `appendToBlockForDir` /
 *      `writeBlockForDir` can mint oids via `substrateIdForDir`).
 *   2. PROMOTE every nested id-bearing array (any depth) to a top-level entity
 *      block + ordinal-bearing membership edges; the parent is de-nested
 *      (the nested array property removed from BOTH its schema and its data).
 *   3. BACKFILL — every registered block_kind's items get oid / content_hash /
 *      object stamped (idempotent).
 *   4. CONVERT bare-refname relation endpoints to structured `{kind:"item", oid,
 *      refname}` form (the membership edges promotion files are already
 *      structured); lens-bin labels → `{kind:"lens_bin", bin}`.
 *
 * Plus a `dryRun` preview (ZERO writes, accurate report counts) and a
 * `CanonicalizeReport`.
 *
 * ── Promotion model (recursive, parent-first) ────────────────────────────────
 * A worklist over block_kinds. Processing one block_kind:
 *   a. backfills (stamps) its items via `writeBlockForDir` → its items now carry
 *      oids (the membership-edge PARENT oid for any nested child);
 *   b. for each DIRECT nested id-bearing array on its item shape (a 2-segment
 *      `findNestedIdBearingArrays` path `<arrayKey>.<nested>`):
 *        - WITH data → look up the EXPLICIT promotion target (keyed by the dotted
 *          `<parentBlockKind>.<nestedKey>` path) the operator supplied. NO entry
 *          → THROW (explicit-or-fail; the canonicalizer NEVER derives, singularizes
 *          or truncates a name). The target is either a REUSED registered block
 *          (`reuse:true`; `keepIds:true` keeps the original ids) or a NEW block
 *          minted from the operator-GIVEN `prefix`/`idPattern` (used verbatim) +
 *          the operator-GIVEN membership `relationType`. Append each nested item
 *          (mint/keep id, stamp oid), file the membership edge parent(this item's
 *          oid) → child(promoted oid) with the array index as `ordinal`, and
 *          ENQUEUE the target block so a deeper nested array carried inside the
 *          promoted item is processed in turn;
 *        - 0-data → schema-de-nest ONLY (drop the nested property from the item
 *          schema; no block synthesized);
 *      then de-nest the parent: schema-replace FIRST (the nested array property
 *      removed, the 3 identity fields present, any top-level $ref inlined) so the
 *      9.2 nested-id guard in `writeSchemaForDir` passes, THEN rewrite the parent
 *      block without the nested array, and record a `declarative-transform`
 *      migration decl (`{op:"delete", path:"<arrayKey>.<nested>"}`,
 *      consistency-only).
 *
 * Parent-first ordering guarantees the parent oid exists before its child edges
 * are filed: a top-level block_kind is backfilled before its direct nested
 * arrays are promoted; a synthesized child block is itself backfilled (by the
 * append-stamp) before ITS nested arrays are promoted.
 *
 * ── dryRun determinism caveat ────────────────────────────────────────────────
 * `mintOid` / `mintSubstrateId` salt a `randomUUID()` nonce, so under dryRun the
 * exact oids a real run would mint cannot be predicted. The dry run therefore
 * performs ZERO writes and reports the COUNTS a real run would produce
 * (promotions/entities/edges, schemas de-nested, kinds + relation_types
 * registered, items oid-minted/hashed, objects stored, edges structured) by
 * SIMULATING the algorithm against in-memory snapshots — never by asserting the
 * future oid bytes. The orchestrator's go/no-go decision is thus trustworthy.
 *
 * Discipline mirrors migrate-content-addressed.ts + rename-canonical-id.ts:
 * single-dir target, a returned report, a dryRun gate that touches no channel.
 */

import fs from "node:fs";
import path from "node:path";
import {
	appendToBlockForDir,
	contentProjection,
	readBlockForDir,
	resolveBlockItemSchema,
	writeBlockForDir,
} from "./block-api.js";
import { computeContentHash } from "./content-hash.js";
import {
	amendConfigEntryForDir,
	appendRelationForDir,
	type BlockKindDecl,
	type ConfigBlock,
	type Edge,
	type EdgeEndpoint,
	loadConfigForDir,
	loadRelationsForDir,
	type RawEndpoint,
	type RelationTypeDecl,
	writeConfigForDir,
	writeRelationsForDir,
} from "./context.js";
import { mintSubstrateId, SUBSTRATE_ID_PATTERN } from "./context-dir.js";
import type { DispatchContext } from "./dispatch-context.js";
import { IDENTITY_FIELDS } from "./land-identity-fields.js";
import { appendMigrationDeclForDir } from "./migrations-store.js";
import { hasObject } from "./object-store.js";
import { findNestedIdBearingArrays, writeSchemaCheckedForDir } from "./schema-write.js";

/**
 * An EXPLICIT operator-provided promotion target for one nested id-bearing array.
 * Per the binding ledger (commit 7228879): promotion-target names are NEVER
 * algorithmically derived/singularized/truncated — the operator names every
 * top-level block_kind + relation_type. There is no synthesis fallback: a
 * data-bearing nested array WITHOUT an entry throws (explicit-or-fail).
 */
export interface PromotionTarget {
	/** canonical_id of the top-level block to promote the nested items into. */
	blockKind: string;
	/** Reuse an existing registered block_kind (must already exist in config). */
	reuse?: boolean;
	/** Reuse + keep each nested item's ORIGINAL id (must match the block's
	 * id.pattern + be unique there). Only meaningful with `reuse:true`. */
	keepIds?: boolean;
	/** NEW block: the id prefix, e.g. "STORY-TASK-" (must match `^[A-Za-z_-]+$`). */
	prefix?: string;
	/** NEW block: the id pattern, e.g. `^STORY-TASK-\d{4}$`. Used VERBATIM — never
	 * derived from the prefix. */
	idPattern?: string;
	/** The membership relation_type (parent contains child). Registered or widened
	 * to cover the parent/child block_kinds as needed. */
	relationType: string;
}

/** A map keyed by the dotted nested-array path the canonicalizer reports
 * (`<parentBlockKind>.<nestedArrayKey>`, e.g. "features.stories", "story.tasks",
 * "layer-plans.layers"). */
export type PromotionTargets = Record<string, PromotionTarget>;

export interface CanonicalizeReport {
	substrate_dir: string;
	substrate_id: string;
	promotions: { path: string; block_kind: string; reused: boolean; entities: number; edges: number }[];
	schema_denested: string[]; // schemas whose nested id array was removed (incl 0-data)
	kinds_registered: string[];
	relation_types_registered: string[];
	items_oid_minted: number;
	items_hashed: number;
	objects_stored: number;
	edges_structured: number;
	dry_run: boolean;
}

/** Internal item-shape view of a block's schema. */
interface ItemSchemaView {
	arrayKey: string;
	itemSchema: Record<string, unknown>;
}

/** Resolve a block_kind's data-file path relative to the substrate dir. */
function dataAbs(substrateDir: string, bk: BlockKindDecl): string {
	return path.isAbsolute(bk.data_path) ? bk.data_path : path.join(substrateDir, bk.data_path);
}

/** Resolve a block_kind's schema-file path relative to the substrate dir. */
function schemaAbs(substrateDir: string, bk: BlockKindDecl): string {
	return path.isAbsolute(bk.schema_path) ? bk.schema_path : path.join(substrateDir, bk.schema_path);
}

/** Read a block array (the item list) for a block_kind; [] when the data file
 * is absent or the array is missing. Reads the on-disk JSON directly so it is
 * usable inside the dryRun simulation (no migration hooks needed for a plain
 * array read). */
function readItems(substrateDir: string, bk: BlockKindDecl): Record<string, unknown>[] {
	const p = dataAbs(substrateDir, bk);
	if (!fs.existsSync(p)) return [];
	let data: Record<string, unknown>;
	try {
		data = JSON.parse(fs.readFileSync(p, "utf-8")) as Record<string, unknown>;
	} catch {
		return [];
	}
	const arr = data[bk.array_key];
	return Array.isArray(arr) ? (arr.filter((x) => x && typeof x === "object") as Record<string, unknown>[]) : [];
}

/** Data-driven nested id-bearing array keys on a block's items: any direct
 * property whose value is a non-empty array of objects each (or the first)
 * carrying a string `id`. Used for SYNTHESIZED child blocks whose written schema
 * intentionally does NOT declare their deeper nested arrays (the 9.2 guard forbids
 * it) — the deeper arrays survive in the DATA as additionalProperties and are
 * detected here. Returns the de-duplicated key set across all items. */
function dataNestedIdArrayKeys(items: Record<string, unknown>[]): string[] {
	const keys = new Set<string>();
	for (const item of items) {
		for (const [k, v] of Object.entries(item)) {
			if (!Array.isArray(v) || v.length === 0) continue;
			const first = v.find((x) => x && typeof x === "object") as Record<string, unknown> | undefined;
			if (first && typeof first.id === "string") keys.add(k);
		}
	}
	return [...keys];
}

/** Parse the prefix + digit-width from an `^PREFIX\d{N}$` (or `\d{N,}`) item id
 * pattern; null when not prefix+width parseable. Mirrors `nextIdForDir`'s regex. */
function parseIdPattern(pattern: string | undefined): { prefix: string; width: number } | null {
	if (!pattern) return null;
	const m = /^\^([A-Za-z_-]+)\\d\{(\d+)(?:,\d*)?\}\$$/.exec(pattern);
	if (!m) return null;
	return { prefix: m[1], width: Number.parseInt(m[2], 10) };
}

/** The item subschema's `id.pattern` for a block_kind, read from its schema
 * file (resolving a top-level $ref). null when absent / unresolvable. */
function blockIdPattern(substrateDir: string, bk: BlockKindDecl): string | null {
	const p = schemaAbs(substrateDir, bk);
	if (!fs.existsSync(p)) return null;
	let schema: Record<string, unknown>;
	try {
		schema = JSON.parse(fs.readFileSync(p, "utf-8")) as Record<string, unknown>;
	} catch {
		return null;
	}
	let view: ItemSchemaView;
	try {
		view = resolveBlockItemSchema(schema);
	} catch {
		return null;
	}
	const idProp = ((view.itemSchema.properties ?? {}) as Record<string, Record<string, unknown>>).id;
	return idProp && typeof idProp.pattern === "string" ? (idProp.pattern as string) : null;
}

/**
 * The item subschema of the array property at the dotted path tail. `dotted` is
 * a `findNestedIdBearingArrays` 2-segment path `<arrayKey>.<nested>`; this reads
 * the parent block's schema, descends `properties.<arrayKey>.items` (inlining a
 * top-level $ref via resolveBlockItemSchema), then `properties.<nested>.items`,
 * inlining a one-level local $ref on the nested items. Returns the nested item
 * subschema (deep-cloned). Throws on a structural surprise.
 */
function nestedItemSubschema(
	parentSchema: Record<string, unknown>,
	parentItem: ItemSchemaView,
	nestedKey: string,
): Record<string, unknown> {
	const props = (parentItem.itemSchema.properties ?? {}) as Record<string, Record<string, unknown>>;
	const node = props[nestedKey];
	if (!node || node.type !== "array" || !node.items) {
		throw new Error(
			`canonicalizeSubstrate: nested property '${nestedKey}' is not an array-with-items on the item shape`,
		);
	}
	let items = node.items as Record<string, unknown>;
	const ref = typeof items.$ref === "string" ? (items.$ref as string) : undefined;
	if (ref) {
		const m = /^#\/(definitions|\$defs)\/(.+)$/.exec(ref);
		if (!m) throw new Error(`canonicalizeSubstrate: unsupported nested $ref '${ref}'`);
		const bag = (parentSchema[m[1]] ?? {}) as Record<string, Record<string, unknown>>;
		const target = bag[m[2]];
		if (!target) throw new Error(`canonicalizeSubstrate: nested $ref '${ref}' does not resolve`);
		items = target;
	}
	return structuredClone(items);
}

/** Build a minimal item subschema from a sample of data items — used for a
 * DATA-only nested key (a deeper array on a synthesized child block whose written
 * schema does not declare it). Declares every observed scalar/array property as
 * permissive (string for strings, leaves arrays/objects loosely typed) so the
 * promoted data validates; deeper id-bearing arrays are left as loose `array`
 * (re-detected from data at the next level). The synthesizeChildSchema pass adds
 * the id + identity fields. */
function synthesizeItemSubschemaFromData(samples: Record<string, unknown>[]): Record<string, unknown> {
	const props: Record<string, unknown> = {};
	for (const s of samples) {
		for (const [k, v] of Object.entries(s)) {
			if (k === "oid" || k === "content_hash" || k === "content_parent") continue;
			if (Object.hasOwn(props, k)) continue;
			if (typeof v === "string") props[k] = { type: "string" };
			else if (typeof v === "number") props[k] = { type: "number" };
			else if (typeof v === "boolean") props[k] = { type: "boolean" };
			else if (Array.isArray(v)) {
				// A nested id-bearing array: declare it loosely as `array` (an item
				// subschema would re-trip the 9.2 guard via synthesizeChildSchema's drop
				// — which is exactly what we want; it stays loose + data-detected).
				const first = v.find((x) => x && typeof x === "object") as Record<string, unknown> | undefined;
				if (first && typeof first.id === "string") {
					props[k] = {
						type: "array",
						items: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
					};
				} else {
					props[k] = { type: "array" };
				}
			} else if (v && typeof v === "object") props[k] = { type: "object" };
		}
	}
	return { type: "object", required: ["id"], properties: props };
}

/** Inline a top-level $ref item shape into a fresh schema body whose `items` is
 * an inline object carrying the 3 identity fields, then DROP `nestedKey` from
 * its properties. Mirrors land-identity-fields.ts:239-249 (inline-then-inject)
 * + the de-nest drop. The result has NO nested id-bearing array, so it passes
 * the 9.2 guard in `writeSchemaForDir`. */
function denestedSchemaBody(originalSchema: Record<string, unknown>, nestedKeys: string[]): Record<string, unknown> {
	const schema = structuredClone(originalSchema);
	const view = resolveBlockItemSchema(schema);
	const props = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
	const arrayNode = props[view.arrayKey] as Record<string, unknown>;
	// Inline the item subschema in place (so a $ref-form items carrying the
	// nested array is materialized before the drop), preserving everything else.
	const inlinedItems = structuredClone(view.itemSchema);
	const itemProps = (inlinedItems.properties ?? {}) as Record<string, unknown>;
	for (const nestedKey of nestedKeys) delete (itemProps as Record<string, unknown>)[nestedKey];
	for (const name of ["oid", "content_hash", "content_parent"] as const) {
		if (!Object.hasOwn(itemProps, name))
			(itemProps as Record<string, unknown>)[name] = structuredClone(IDENTITY_FIELDS[name]);
	}
	inlinedItems.properties = itemProps;
	arrayNode.items = inlinedItems;
	return schema;
}

/** Synthesize a fresh block schema envelope for a promoted child entity —
 * mirrors samples tasks.schema.json: $schema/$id/version/title/type:object/
 * required:[arrayKey]/properties.<arrayKey>.items = the nested item subschema +
 * the 3 identity fields + an `id` declaration carrying the synthesized pattern.
 *
 * DEEPER nested id-bearing arrays carried inside `nestedItemSchema` (e.g. a
 * `tasks` array inside a promoted `story` item) are DROPPED from the written
 * item schema — `writeSchemaForDir`'s 9.2 guard forbids a schema that declares a
 * nested id-bearing array, so a synthesized child schema must NOT declare its
 * deeper arrays. The promoted child's DATA still carries those deeper arrays
 * (copied verbatim) — the schema leaves `additionalProperties` at the draft-07
 * default (true), so the data round-trips — and they are re-detected from the
 * DATA when the child block is processed (data-driven detection), promoted, and
 * de-nested in turn. The returned `droppedDeeper` lists the dropped keys so the
 * caller can record them for the data-driven worklist. */
function synthesizeChildSchema(
	canonicalId: string,
	arrayKey: string,
	nestedItemSchema: Record<string, unknown>,
	idPattern: string,
): { schema: Record<string, unknown>; droppedDeeper: string[] } {
	const itemSchema = structuredClone(nestedItemSchema);
	const itemProps = (itemSchema.properties ?? {}) as Record<string, unknown>;
	itemProps.id = { type: "string", pattern: idPattern };
	for (const name of ["oid", "content_hash", "content_parent"] as const) {
		if (!Object.hasOwn(itemProps, name))
			(itemProps as Record<string, unknown>)[name] = structuredClone(IDENTITY_FIELDS[name]);
	}
	// Drop any deeper nested id-bearing array property declared on the item shape
	// (an array whose items declare an `id`) so the written schema passes the 9.2
	// guard. The data keeps these arrays; they are re-detected from the data.
	const droppedDeeper: string[] = [];
	for (const [k, v] of Object.entries(itemProps)) {
		if (!v || typeof v !== "object") continue;
		const node = v as Record<string, unknown>;
		if (node.type === "array" && node.items && typeof node.items === "object") {
			const items = node.items as Record<string, unknown>;
			const props = items.properties as Record<string, unknown> | undefined;
			const req = Array.isArray(items.required) ? (items.required as string[]) : [];
			if ((props && Object.hasOwn(props, "id")) || req.includes("id")) {
				delete itemProps[k];
				droppedDeeper.push(k);
			}
		}
	}
	itemSchema.properties = itemProps;
	const required = Array.isArray(itemSchema.required) ? (itemSchema.required as string[]) : [];
	if (!required.includes("id")) itemSchema.required = ["id", ...required];
	return {
		schema: {
			$schema: "http://json-schema.org/draft-07/schema#",
			$id: `pi-context://schemas/${canonicalId}`,
			version: "1.0.0",
			title: canonicalId,
			type: "object",
			required: [arrayKey],
			properties: {
				[arrayKey]: { type: "array", items: itemSchema },
			},
		},
		droppedDeeper,
	};
}

/** The single array property name of a synthesized block schema body — used to
 * derive a NEW block's `array_key` from the schema it was given. Returns the lone
 * `properties` key when the schema declares exactly one array property; throws
 * otherwise (the caller then falls back to the blockKind). */
function singleArrayKeyOf(schema: Record<string, unknown>): string | null {
	const props = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
	const arrayKeys = Object.entries(props)
		.filter(([, v]) => v && (v as Record<string, unknown>).type === "array")
		.map(([k]) => k);
	return arrayKeys.length === 1 ? arrayKeys[0] : null;
}

/** Parse the digit-width from an explicit `^...\d{N}$` (or `\d{N,}`) id pattern;
 * defaults to 4 when the pattern carries no fixed `\d{N}` quantifier. Used to mint
 * ids against the operator-given idPattern (never to DERIVE the pattern). */
function widthFromPattern(pattern: string): number {
	const m = /\\d\{(\d+)(?:,\d*)?\}/.exec(pattern);
	return m ? Number.parseInt(m[1], 10) : 4;
}

/** Next id for a synthesized/target block from its prefix+width, scanning the
 * given live item ids for the max numeric suffix. Pure (no disk) so it is
 * usable inside the dryRun simulation. */
function nextIdFrom(items: Record<string, unknown>[], prefix: string, width: number): string {
	const re = new RegExp(`^${prefix}(\\d+)$`);
	let maxN = 0;
	for (const it of items) {
		const id = typeof it.id === "string" ? (it.id as string) : "";
		const mm = re.exec(id);
		if (mm) {
			const n = Number.parseInt(mm[1], 10);
			if (n > maxN) maxN = n;
		}
	}
	return `${prefix}${String(maxN + 1).padStart(width, "0")}`;
}

/** True iff `id` matches the prefix+width pattern. */
function idMatchesPattern(id: string, parsed: { prefix: string; width: number }): boolean {
	return new RegExp(`^${parsed.prefix}\\d{${parsed.width},}$`).test(id);
}

/**
 * Canonicalize `substrateDir` in place. See the module header. `dryRun` performs
 * ZERO writes and reports the counts a real run would produce. Throws on a
 * structural surprise (missing config, an unparseable schema, an unresolvable
 * $ref) — never silently no-ops a promotion.
 */
export function canonicalizeSubstrate(
	substrateDir: string,
	opts?: { dryRun?: boolean; ctx?: DispatchContext; promotionTargets?: PromotionTargets },
): CanonicalizeReport {
	const dryRun = opts?.dryRun ?? false;
	const ctx = opts?.ctx;
	const promotionTargets: PromotionTargets = opts?.promotionTargets ?? {};

	const config = loadConfigForDir(substrateDir);
	if (!config) {
		throw new Error(`canonicalizeSubstrate: no config.json at ${substrateDir}`);
	}

	const report: CanonicalizeReport = {
		substrate_dir: substrateDir,
		substrate_id: "",
		promotions: [],
		schema_denested: [],
		kinds_registered: [],
		relation_types_registered: [],
		items_oid_minted: 0,
		items_hashed: 0,
		objects_stored: 0,
		edges_structured: 0,
		dry_run: dryRun,
	};

	// In-memory working config: under a real run we mutate the substrate via
	// amendConfigEntryForDir and re-load; under dryRun we mutate this clone so the
	// simulation sees synthesized kinds/relation_types without writing.
	let workingConfig: ConfigBlock = JSON.parse(JSON.stringify(config)) as ConfigBlock;

	// ── Step 1: substrate_id ──────────────────────────────────────────────────
	const existingId = workingConfig.substrate_id;
	if (typeof existingId === "string" && SUBSTRATE_ID_PATTERN.test(existingId)) {
		report.substrate_id = existingId;
	} else {
		const minted = mintSubstrateId();
		report.substrate_id = minted;
		workingConfig.substrate_id = minted;
		if (!dryRun) {
			const next = JSON.parse(JSON.stringify(config)) as ConfigBlock;
			next.substrate_id = minted;
			writeConfigForDir(substrateDir, next, ctx);
			workingConfig = loadConfigForDir(substrateDir) as ConfigBlock;
		}
	}

	// Reload config helper after a mutation (real run); under dryRun returns the
	// in-memory working clone.
	const currentConfig = (): ConfigBlock => {
		if (dryRun) return workingConfig;
		return loadConfigForDir(substrateDir) as ConfigBlock;
	};

	// ── In-memory item store for dryRun simulation ─────────────────────────────
	// blockName → item array. Mutated only under dryRun; the real run reads/writes
	// disk. Seeded lazily from the on-disk data.
	const simItems = new Map<string, Record<string, unknown>[]>();
	const simEdges: Edge[] = dryRun ? loadRelationsForDir(substrateDir).map((e) => ({ ...e })) : [];
	let nextSimOid = 0;
	const fakeOid = (): string => {
		// A deterministic 32-hex placeholder for the simulation only (never written).
		nextSimOid += 1;
		return nextSimOid.toString(16).padStart(32, "0");
	};

	const itemsFor = (bk: BlockKindDecl): Record<string, unknown>[] => {
		if (dryRun) {
			let arr = simItems.get(bk.canonical_id);
			if (!arr) {
				arr = readItems(substrateDir, bk).map((x) => ({ ...x }));
				simItems.set(bk.canonical_id, arr);
			}
			return arr;
		}
		return readItems(substrateDir, bk);
	};

	// Backfill (real) or simulate-stamp (dry) a block's items so every item carries
	// an oid; returns a refname→oid map for the block. Accumulates report counts.
	const backfillBlock = (bk: BlockKindDecl): Map<string, string> => {
		const map = new Map<string, string>();
		const schemaPath = schemaAbs(substrateDir, bk);
		const schema = fs.existsSync(schemaPath)
			? (JSON.parse(fs.readFileSync(schemaPath, "utf-8")) as Record<string, unknown>)
			: null;
		if (dryRun) {
			const arr = itemsFor(bk);
			for (const item of arr) {
				const hadOid = typeof item.oid === "string" && (item.oid as string).length > 0;
				if (!hadOid) {
					report.items_oid_minted += 1;
					item.oid = fakeOid();
				}
				report.items_hashed += 1;
				if (schema) {
					const projection = contentProjection(schema, bk.array_key, item);
					const hash = computeContentHash(projection);
					if (!hasObject(substrateDir, hash)) report.objects_stored += 1;
				}
				if (typeof item.id === "string") map.set(item.id as string, item.oid as string);
			}
			return map;
		}
		// Real run: count from the pre-write disk state, then write back (stamps).
		const dataPath = dataAbs(substrateDir, bk);
		if (fs.existsSync(dataPath)) {
			const block = readBlockForDir(substrateDir, bk.canonical_id) as Record<string, unknown>;
			const arr = Array.isArray(block[bk.array_key]) ? (block[bk.array_key] as Record<string, unknown>[]) : [];
			for (const item of arr) {
				if (!item || typeof item !== "object") continue;
				const hadOid = typeof item.oid === "string" && (item.oid as string).length > 0;
				if (!hadOid) report.items_oid_minted += 1;
				report.items_hashed += 1;
				if (schema) {
					const projection = contentProjection(schema, bk.array_key, item);
					const hash = computeContentHash(projection);
					if (!hasObject(substrateDir, hash)) report.objects_stored += 1;
				}
			}
			writeBlockForDir(substrateDir, bk.canonical_id, block, ctx);
			// Re-read to capture minted oids.
			const after = readBlockForDir(substrateDir, bk.canonical_id) as Record<string, unknown>;
			const afterArr = Array.isArray(after[bk.array_key]) ? (after[bk.array_key] as Record<string, unknown>[]) : [];
			for (const item of afterArr) {
				if (item && typeof item.id === "string" && typeof item.oid === "string") {
					map.set(item.id as string, item.oid as string);
				}
			}
		}
		return map;
	};

	// Register a synthesized block_kind (real: amend config + write schema; dry:
	// mutate workingConfig + count).
	const registerKind = (bk: BlockKindDecl, schemaBody: Record<string, unknown>): void => {
		report.kinds_registered.push(bk.canonical_id);
		if (dryRun) {
			(workingConfig.block_kinds ??= []).push(bk);
			return;
		}
		amendConfigEntryForDir(substrateDir, "block_kinds", "add", bk.canonical_id, bk, ctx);
		writeSchemaCheckedForDir(substrateDir, bk.canonical_id, schemaBody, "create", ctx);
	};

	// Register a synthesized relation_type if absent (real: amend config; dry:
	// mutate workingConfig + count). Returns the canonical_id.
	const ensureRelationType = (decl: RelationTypeDecl): void => {
		const cfg = currentConfig();
		const existing = (cfg.relation_types ?? []).find((r) => r.canonical_id === decl.canonical_id);
		if (existing) {
			// Widen BOTH source_kinds + target_kinds to include the parent/child if
			// the existing declaration enumerates them and omits one. A `*` wildcard
			// already covers everything, so no widen there.
			const widenSide = (need: string[] | undefined, have: string[] | undefined): string[] | undefined => {
				if (!Array.isArray(have)) return have; // unconstrained (undefined) → no widen
				const present = new Set(have);
				if (present.has("*")) return have;
				const missing = (need ?? []).filter((k) => !present.has(k) && k !== "*");
				return missing.length ? [...have, ...missing] : have;
			};
			const nextSource = widenSide(decl.source_kinds, existing.source_kinds);
			const nextTarget = widenSide(decl.target_kinds, existing.target_kinds);
			const changed = nextSource !== existing.source_kinds || nextTarget !== existing.target_kinds;
			if (changed) {
				const widened: RelationTypeDecl = { ...existing, source_kinds: nextSource, target_kinds: nextTarget };
				if (dryRun) {
					const idx = (workingConfig.relation_types ?? []).findIndex((r) => r.canonical_id === decl.canonical_id);
					if (idx >= 0 && workingConfig.relation_types) workingConfig.relation_types[idx] = widened;
				} else {
					amendConfigEntryForDir(substrateDir, "relation_types", "replace", decl.canonical_id, widened, ctx);
				}
			}
			return;
		}
		report.relation_types_registered.push(decl.canonical_id);
		if (dryRun) {
			(workingConfig.relation_types ??= []).push(decl);
			return;
		}
		amendConfigEntryForDir(substrateDir, "relation_types", "add", decl.canonical_id, decl, ctx);
	};

	// File a membership edge parent(oid)→child(oid) with the array index ordinal.
	const fileEdge = (
		parentOid: string,
		parentRef: string,
		childOid: string,
		childRef: string,
		relationType: string,
		ordinal: number,
	): void => {
		const edge: Edge = {
			parent: { kind: "item", oid: parentOid, refname: parentRef },
			child: { kind: "item", oid: childOid, refname: childRef },
			relation_type: relationType,
			ordinal,
		};
		if (dryRun) {
			simEdges.push(edge);
			return;
		}
		appendRelationForDir(substrateDir, edge, ctx);
	};

	// Seed an EMPTY data file `{ <array_key>: [] }` for a promotion target whose
	// data file is absent, so the FIRST `appendToBlockForDir` (which reads the file
	// first) does not throw `Block file not found`. Idempotent: a no-op when the
	// file already exists. Applies UNIFORMLY to reuse + synth targets — a registered-
	// but-fileless reuse block (e.g. a `story` block_kind with zero prior data, no
	// `story.json`) is the case the real `.project-migrate` run hit. `writeBlockForDir`
	// validates the empty block against the target's schema, so the schema MUST exist
	// before this runs: a reuse block's schema is already on disk; a synth block's
	// schema is written by `registerKind` (which runs before the first append). Real
	// run only — the dryRun path never reads the target file via appendToBlockForDir.
	const seedEmptyBlockFile = (targetBk: BlockKindDecl): void => {
		if (dryRun) return;
		const dp = dataAbs(substrateDir, targetBk);
		if (!fs.existsSync(dp)) {
			writeBlockForDir(substrateDir, targetBk.canonical_id, { [targetBk.array_key]: [] }, ctx);
		}
	};

	// Append a promoted child item to its target block (real) or the sim store
	// (dry); returns the minted/assigned oid.
	const appendPromoted = (targetBk: BlockKindDecl, item: Record<string, unknown>): string => {
		if (dryRun) {
			const arr = itemsFor(targetBk);
			const stamped = { ...item, oid: fakeOid() };
			arr.push(stamped);
			report.items_oid_minted += 1;
			report.items_hashed += 1;
			const schemaPath = schemaAbs(substrateDir, targetBk);
			if (fs.existsSync(schemaPath)) {
				const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8")) as Record<string, unknown>;
				const hash = computeContentHash(contentProjection(schema, targetBk.array_key, stamped));
				if (!hasObject(substrateDir, hash)) report.objects_stored += 1;
			}
			return stamped.oid as string;
		}
		// Ensure the target's data file exists before the first append reads it.
		seedEmptyBlockFile(targetBk);
		appendToBlockForDir(substrateDir, targetBk.canonical_id, targetBk.array_key, item, ctx);
		// Read back the minted oid.
		const block = readBlockForDir(substrateDir, targetBk.canonical_id) as Record<string, unknown>;
		const arr = Array.isArray(block[targetBk.array_key])
			? (block[targetBk.array_key] as Record<string, unknown>[])
			: [];
		const written = arr.find((x) => x && typeof x === "object" && (x as Record<string, unknown>).id === item.id);
		const oid = written && typeof written.oid === "string" ? (written.oid as string) : undefined;
		if (!oid) throw new Error(`canonicalizeSubstrate: appended '${String(item.id)}' but could not read back its oid`);
		report.items_oid_minted += 1;
		report.items_hashed += 1;
		return oid;
	};

	// De-nest a parent block over ALL its nested id-bearing array keys at once:
	// schema-replace (drop EVERY nested prop) FIRST so the 9.2 guard passes even
	// when the parent had multiple nested arrays, then rewrite the parent items
	// dropping the nested arrays, then a single consistency-only migration decl
	// listing one delete-op per dropped key. Real run only; under dryRun we mutate
	// the sim store + count. No-op when `nestedKeys` is empty.
	const denestParent = (parentBk: BlockKindDecl, nestedKeys: string[]): void => {
		if (nestedKeys.length === 0) return;
		report.schema_denested.push(parentBk.canonical_id);
		if (dryRun) {
			for (const item of itemsFor(parentBk)) {
				for (const k of nestedKeys) delete item[k];
			}
			return;
		}
		const schemaPath = schemaAbs(substrateDir, parentBk);
		const original = JSON.parse(fs.readFileSync(schemaPath, "utf-8")) as Record<string, unknown>;
		const denested = denestedSchemaBody(original, nestedKeys);
		writeSchemaCheckedForDir(substrateDir, parentBk.canonical_id, denested, "replace", ctx);
		// Rewrite parent block dropping the nested arrays.
		const block = readBlockForDir(substrateDir, parentBk.canonical_id) as Record<string, unknown>;
		const arr = Array.isArray(block[parentBk.array_key])
			? (block[parentBk.array_key] as Record<string, unknown>[])
			: [];
		block[parentBk.array_key] = arr.map((it) => {
			if (!it || typeof it !== "object") return it;
			const next = { ...it };
			for (const k of nestedKeys) delete (next as Record<string, unknown>)[k];
			return next;
		});
		writeBlockForDir(substrateDir, parentBk.canonical_id, block, ctx);
		// Consistency-only migration decl (a version delta is what would trigger it;
		// none today, so this is advisory). try/skip on collision.
		try {
			appendMigrationDeclForDir(substrateDir, {
				schemaName: parentBk.canonical_id,
				fromVersion: "1.0.0",
				toVersion: "1.0.1",
				kind: "declarative-transform",
				transform: {
					operations: nestedKeys.map((k) => ({ op: "delete", path: `${parentBk.array_key}.${k}` })),
				},
				created_by: ctx?.writer ? `${ctx.writer.kind}` : "canonicalize-substrate",
				created_at: new Date().toISOString(),
			});
		} catch {
			// (schemaName, fromVersion) already declared — skip.
		}
	};

	// ── Step 2: promotion worklist (parent-first) ──────────────────────────────
	// Seed with every registered block_kind; synthesized child blocks enqueue.
	const queue: BlockKindDecl[] = [...(workingConfig.block_kinds ?? [])];
	const processed = new Set<string>();

	while (queue.length) {
		const bk = queue.shift() as BlockKindDecl;
		if (processed.has(bk.canonical_id)) continue;
		processed.add(bk.canonical_id);

		// (a) Backfill so this block's items carry oids (parent oids for children).
		const parentOidByRef = backfillBlock(bk);

		// (b) Direct nested id-bearing array KEYS on THIS block's items, from the
		//     UNION of (i) schema-declared 2-segment `findNestedIdBearingArrays`
		//     paths and (ii) DATA-observed nested id arrays. The data source catches
		//     deeper arrays carried inside a SYNTHESIZED child block whose written
		//     schema intentionally omits them (the 9.2 guard forbids declaring them).
		//     Re-read the schema (a prior de-nest may have changed it).
		const schemaPath = schemaAbs(substrateDir, bk);
		if (!fs.existsSync(schemaPath)) continue;
		const parentSchema = JSON.parse(fs.readFileSync(schemaPath, "utf-8")) as Record<string, unknown>;
		const schemaKeys = findNestedIdBearingArrays(parentSchema)
			.filter((p) => p.split(".").length === 2)
			.map((p) => p.split(".")[1]);
		const dataKeys = dataNestedIdArrayKeys(itemsFor(bk));
		const nestedKeysAll = [...new Set([...schemaKeys, ...dataKeys])];
		if (nestedKeysAll.length === 0) continue;

		let parentItem: ItemSchemaView;
		try {
			parentItem = resolveBlockItemSchema(parentSchema);
		} catch {
			continue;
		}

		// Accumulate EVERY nested key (data + 0-data) for ONE schema-replace + data
		// rewrite at the end — a parent with multiple nested id-bearing arrays must
		// drop them all in one schema write, else the 9.2 guard rejects a partial
		// de-nest (the still-nested sibling array trips it). Only keys still PRESENT
		// on the (possibly synthesized) schema are passed to the schema-replace; a
		// data-only deeper key is dropped from data alone.
		const denestKeys: string[] = [];
		const schemaDeclaredKeys = new Set(schemaKeys);

		for (const nestedKey of nestedKeysAll) {
			denestKeys.push(nestedKey);

			// Gather the nested items across all parent items, with their parent
			// ref + array index (ordinal).
			const parents = itemsFor(bk);
			type Pending = { parentRef: string; childItem: Record<string, unknown>; ordinal: number };
			const pending: Pending[] = [];
			for (const parent of parents) {
				const parentRef = typeof parent.id === "string" ? (parent.id as string) : "";
				const nestedArr = parent[nestedKey];
				if (!Array.isArray(nestedArr)) continue;
				let ordinal = 0;
				for (const child of nestedArr) {
					if (child && typeof child === "object") {
						pending.push({ parentRef, childItem: child as Record<string, unknown>, ordinal });
					}
					ordinal += 1;
				}
			}

			if (pending.length === 0) {
				// 0-data nested id array → schema-de-nest only (no block synthesized).
				// The key is already in `denestKeys`; the single end-of-block
				// denestParent drops it from schema + data.
				continue;
			}

			// Resolve target block from the EXPLICIT operator-provided mapping keyed by
			// the dotted nested-array path. No entry → THROW (explicit-or-fail; the
			// ledger forbids any algorithmic name synthesis/singularization/truncation).
			const dottedPath = `${bk.canonical_id}.${nestedKey}`;
			const spec = promotionTargets[dottedPath];
			if (!spec) {
				throw new Error(
					`canonicalizeSubstrate: no promotionTargets entry for data-bearing nested array '${dottedPath}' — promotion targets must be supplied explicitly (no name synthesis)`,
				);
			}

			// The nested item subschema comes from the parent SCHEMA when it declares
			// the key (the normal case); for a DATA-only key (deeper array on a
			// synthesized block) the schema omits it, so synthesize the subschema from
			// the promoted data samples.
			const nestedItemSchema = schemaDeclaredKeys.has(nestedKey)
				? nestedItemSubschema(parentSchema, parentItem, nestedKey)
				: synthesizeItemSubschemaFromData(pending.map((p) => p.childItem));
			const cfg = currentConfig();
			let target: BlockKindDecl | undefined;
			const reused = spec.reuse === true;
			const keepIds = reused && spec.keepIds === true;

			if (reused) {
				// REUSE: the named block_kind must already be registered.
				target = (cfg.block_kinds ?? []).find((b) => b.canonical_id === spec.blockKind);
				if (!target) {
					throw new Error(
						`canonicalizeSubstrate: promotionTargets['${dottedPath}'].reuse names block_kind '${spec.blockKind}', which is not registered`,
					);
				}
				if (keepIds) {
					// Assert each nested id matches the reuse block's id.pattern + is unique.
					const parsed = parseIdPattern(blockIdPattern(substrateDir, target) ?? undefined);
					if (!parsed) {
						throw new Error(
							`canonicalizeSubstrate: reuse target '${spec.blockKind}' has no parseable id.pattern (required for keepIds)`,
						);
					}
					const existingIds = new Set(itemsFor(target).map((x) => x.id as string));
					const seen = new Set<string>();
					for (const p of pending) {
						const id = typeof p.childItem.id === "string" ? (p.childItem.id as string) : "";
						if (!idMatchesPattern(id, parsed)) {
							throw new Error(
								`canonicalizeSubstrate: keepIds on '${dottedPath}': nested id '${id}' does not match reuse target '${spec.blockKind}' id.pattern`,
							);
						}
						if (existingIds.has(id) || seen.has(id)) {
							throw new Error(
								`canonicalizeSubstrate: keepIds on '${dottedPath}': nested id '${id}' collides in reuse target '${spec.blockKind}'`,
							);
						}
						seen.add(id);
					}
				}
			}

			// childIdPattern drives minted ids (reuse-no-keepIds + new blocks).
			let childIdPattern: { prefix: string; width: number };
			if (!target) {
				// NEW block: use the operator-GIVEN prefix + idPattern VERBATIM (never
				// derived). Both are required for a new-block target.
				if (typeof spec.prefix !== "string" || typeof spec.idPattern !== "string") {
					throw new Error(
						`canonicalizeSubstrate: promotionTargets['${dottedPath}'] is a NEW block (no reuse) and must declare both 'prefix' and 'idPattern'`,
					);
				}
				if (!/^[A-Za-z_-]+$/.test(spec.prefix)) {
					throw new Error(
						`canonicalizeSubstrate: promotionTargets['${dottedPath}'].prefix '${spec.prefix}' is not valid (^[A-Za-z_-]+$)`,
					);
				}
				childIdPattern = { prefix: spec.prefix, width: widthFromPattern(spec.idPattern) };
				// array_key = the synthesized schema's single array property. The schema
				// body declares exactly one array property named for the blockKind, so
				// `singleArrayKeyOf` recovers it (falling back to the blockKind itself).
				const childArrayKey = spec.blockKind;
				const { schema: finalSchema } = synthesizeChildSchema(
					spec.blockKind,
					childArrayKey,
					nestedItemSchema,
					spec.idPattern,
				);
				const resolvedArrayKey = singleArrayKeyOf(finalSchema) ?? childArrayKey;
				target = {
					canonical_id: spec.blockKind,
					display_name: spec.blockKind,
					prefix: spec.prefix,
					schema_path: `schemas/${spec.blockKind}.schema.json`,
					array_key: resolvedArrayKey,
					data_path: `${spec.blockKind}.json`,
				};
				registerKind(target, finalSchema);
				// The empty data file is seeded uniformly at first append (seedEmptyBlockFile
				// inside appendPromoted) — for synth + reuse alike. registerKind has already
				// written this synth block's schema, satisfying the schema-present precondition.
			} else if (keepIds) {
				// Keep original ids: a pattern parse is still useful as a sentinel, but
				// ids are kept verbatim below (assignment branch checks `keepIds`).
				const parsed = parseIdPattern(blockIdPattern(substrateDir, target) ?? undefined);
				childIdPattern = (parsed as { prefix: string; width: number } | null) ?? {
					prefix: target.prefix,
					width: 4,
				};
			} else {
				// REUSE without keepIds → mint via the reuse block's own pattern.
				const parsed = parseIdPattern(blockIdPattern(substrateDir, target) ?? undefined);
				if (!parsed) {
					throw new Error(
						`canonicalizeSubstrate: reuse target '${spec.blockKind}' has no parseable id.pattern (required to mint ids)`,
					);
				}
				childIdPattern = parsed;
			}

			// Membership relation_type = the GIVEN `relationType` name (never derived).
			// If registered, widen its source_kinds/target_kinds to include the
			// parent/child block_kinds; if absent, register it (category membership).
			const membershipName = spec.relationType;
			ensureRelationType({
				canonical_id: membershipName,
				display_name: membershipName.replace(/_/g, " "),
				category: "membership",
				source_kinds: [bk.canonical_id],
				target_kinds: [target.canonical_id],
			});

			// Promote each nested item (in order) → append + edge.
			let entities = 0;
			let edges = 0;
			// Track assigned ids so nextIdFrom sees the running set under dryRun.
			const targetItemsLive = itemsFor(target);
			for (const p of pending) {
				const origId = typeof p.childItem.id === "string" ? (p.childItem.id as string) : "";
				let assignedId: string;
				if (keepIds) {
					// Reuse + keepIds: keep the original id verbatim (validated above).
					assignedId = origId;
				} else {
					// New block, or reuse without keepIds → mint a fresh id from the
					// (operator-given / reuse-block) prefix + width.
					assignedId = nextIdFrom(targetItemsLive, childIdPattern.prefix, childIdPattern.width);
				}
				// Strip a deeper nested array? No — keep deeper nested arrays so the
				// synthesized child block's schema (which retains them) re-detects them
				// when the child block is processed. Only the child's OWN id is set.
				const childBody: Record<string, unknown> = { ...p.childItem, id: assignedId };
				// Drop identity fields carried from the source so the append mints fresh.
				delete childBody.oid;
				delete childBody.content_hash;
				delete childBody.content_parent;
				const childOid = appendPromoted(target, childBody);
				targetItemsLive.push({ id: assignedId, oid: childOid });
				const parentOid = parentOidByRef.get(p.parentRef);
				if (!parentOid) {
					throw new Error(
						`canonicalizeSubstrate: parent '${p.parentRef}' of promoted '${origId}' has no oid (backfill ordering breach)`,
					);
				}
				fileEdge(parentOid, p.parentRef, childOid, origId, membershipName, p.ordinal);
				entities += 1;
				edges += 1;
			}

			report.promotions.push({
				path: `${bk.canonical_id}.${nestedKey}`,
				block_kind: target.canonical_id,
				reused,
				entities,
				edges,
			});

			// Enqueue the (synthesized or reused) target so its OWN nested arrays are
			// promoted in turn (parent-first recursion).
			if (!processed.has(target.canonical_id)) queue.push(target);
		}

		// De-nest the parent over ALL its nested keys at once (schema-replace + data
		// rewrite + one migration decl) — after every array's data has been promoted.
		denestParent(bk, denestKeys);
	}

	// ── Step 3: backfill remaining untouched blocks ────────────────────────────
	// Every registered block_kind not yet processed (none in practice — the
	// worklist seeded with all — but a reused empty block that was processed is
	// covered; this guards a kind that had no nested arrays and no data path read).
	for (const bk of currentConfig().block_kinds ?? []) {
		if (!processed.has(bk.canonical_id)) {
			backfillBlock(bk);
			processed.add(bk.canonical_id);
		}
	}

	// ── Step 4: convert remaining bare-refname edges to structured ──────────────
	// The membership edges promotion filed are already structured. The ORIGINAL
	// edges are bare-refname strings pointing at top-level ids — convert each
	// endpoint to {kind:item, oid, refname} when it names a known item, else
	// {kind:lens_bin, bin}. Build a global refname→oid map across all blocks.
	const refnameOid = new Map<string, string>();
	for (const bk of currentConfig().block_kinds ?? []) {
		for (const item of itemsFor(bk)) {
			if (typeof item.id === "string" && typeof item.oid === "string" && !refnameOid.has(item.id as string)) {
				refnameOid.set(item.id as string, item.oid as string);
			}
		}
	}
	const isItem = (ref: string): boolean => refnameOid.has(ref);
	const convert = (ep: RawEndpoint): RawEndpoint => {
		if (typeof ep !== "string") return ep; // already structured
		if (isItem(ep)) {
			const out: EdgeEndpoint = { kind: "item", oid: refnameOid.get(ep) as string, refname: ep };
			return out;
		}
		const out: EdgeEndpoint = { kind: "lens_bin", bin: ep };
		return out;
	};

	const sourceEdges = dryRun ? simEdges : loadRelationsForDir(substrateDir);
	let structuredCount = 0;
	const nextEdges: Edge[] = [];
	for (const e of sourceEdges) {
		const parent = convert(e.parent);
		const child = convert(e.child);
		if (parent !== e.parent || child !== e.child) structuredCount += 1;
		nextEdges.push({ ...e, parent, child });
	}
	report.edges_structured = structuredCount;
	if (!dryRun && structuredCount > 0) {
		writeRelationsForDir(substrateDir, nextEdges, ctx);
	}

	return report;
}
