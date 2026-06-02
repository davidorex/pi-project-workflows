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
 * ── Schema-surgical de-nest sweep (data-INDEPENDENT) ─────────────────────────
 * The data-driven model above de-nests a parent only when its nested array carried
 * DATA. A block whose SCHEMA declares a nested id-bearing array but whose DATA is empty
 * (a 0-item parent — e.g. `layer-plans.json = {"plans":[]}` with a schema declaring
 * `plans.items.properties.layers[].id`) is skipped by every data-driven gate, so the
 * nested-array DECLARATION survives and `validateContext` (which scans SCHEMAS) would
 * flag it. A FINAL sweep (Step 3.5) therefore reads each registered block_kind's on-disk
 * schema and strips every nested id-bearing array property the detector reports —
 * schema-surgical (`stripNestedIdArrayFromSchema`), never data-inferred, so it works at
 * 0 items. It is a no-op on a block Step 2 already de-nested (its re-emitted schema
 * carries no nested-id array) and on an already-canonical substrate, so the data-bearing
 * PROMOTION path is untouched.
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
} from "@davidorex/pi-context/block-api";
import { computeContentHash } from "@davidorex/pi-context/content-hash";
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
} from "@davidorex/pi-context/context";
import { mintSubstrateId, SUBSTRATE_ID_PATTERN } from "@davidorex/pi-context/context-dir";
import type { DispatchContext } from "@davidorex/pi-context/dispatch-context";
import { hasObject } from "@davidorex/pi-context/object-store";
import { findNestedIdBearingArrays, writeSchemaCheckedForDir } from "@davidorex/pi-context/schema-write";
import { IDENTITY_FIELDS } from "./land-identity-fields.js";
import { appendMigrationDeclForDir } from "./migration-decl-writer.js";

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

/**
 * An EXPLICIT operator-provided directive to REGISTER an orphan content-bearing
 * block — a `<array_key>` array of id-bearing items present in the substrate DATA
 * but NOT declared as a `block_kind` in config (so the backfill pass, which iterates
 * registered block_kinds only, never reaches it). The orphan's schema is assumed
 * ALREADY CLEAN (it correctly models the array + any singleton fields); this directive
 * does NOT clean-emit-rebuild it. It (i) registers the canonical_id as a block_kind and
 * (ii) injects the 3 identity fields onto the array's item subschema if absent — exactly
 * like `land-identity-fields`, preserving the rest of the schema (including the item `id`
 * declaration: a slug `{type:"string"}` is kept verbatim — NO pattern added, NO ids
 * minted). The EXISTING backfill pass then content-addresses the array's items.
 *
 * Singleton top-level fields alongside the array (e.g. `lint_command`, a
 * `test_conventions` object) are NOT items → never touched by the backfill.
 *
 * Idempotent: re-running when the block is already registered AND its item schema
 * already declares identity → no config amend, no schema write.
 */
export interface RegisterBlock {
	/** canonical_id under which to register the orphan block_kind. */
	canonical_id: string;
	/** The data file's array property carrying the id-bearing items. */
	array_key: string;
	/** The block_kind `prefix` (config field; may be "" for slug-id orphans whose
	 * ids are not prefix+number — no ids are minted for an orphan, so this is purely
	 * the config declaration). */
	prefix: string;
	/** Schema file path relative to the substrate dir (the orphan's existing clean schema). */
	schema_path: string;
	/** Data file path relative to the substrate dir. */
	data_path: string;
	/** Optional display_name; defaults to the canonical_id when omitted. */
	display_name?: string;
}

export interface CanonicalizeReport {
	substrate_dir: string;
	substrate_id: string;
	promotions: { path: string; block_kind: string; reused: boolean; entities: number; edges: number }[];
	schema_denested: string[]; // schemas whose nested id array was removed (incl 0-data)
	kinds_registered: string[];
	registered_blocks: string[]; // orphan content-bearing blocks newly registered via opts.registerBlocks
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

/** The 3 content-addressed-identity field names — excluded from the inferred
 * content-field union (they are re-appended as the canonical identity declarations
 * by `inferItemSubschemaFromData`). */
const IDENTITY_FIELD_NAMES = ["oid", "content_hash", "content_parent"] as const;

/** Map ONE observed JS runtime value to its JSON-Schema primitive `type` string,
 * or null for null/undefined (a null observation contributes nothing to the union —
 * an absent value, not a distinct type). Arrays are reported as `"array"` LOOSELY
 * (no `items`) — both inline non-id arrays AND id-bearing nested arrays that will be
 * promoted+dropped must NOT be declared as nested-id arrays (the 9.2 guard forbids
 * it + the data still validates against a loose `{type:"array"}`). */
function jsonTypeOf(v: unknown): string | null {
	if (v === null || v === undefined) return null;
	if (typeof v === "string") return "string";
	if (typeof v === "number") return "number";
	if (typeof v === "boolean") return "boolean";
	if (Array.isArray(v)) return "array";
	if (typeof v === "object") return "object";
	return null;
}

/**
 * Derive an id `pattern` from a set of observed ids. Returns `^<prefix>\d{N}$` when
 * EVERY id shares a single `[A-Za-z_-]+` non-digit prefix immediately followed by a
 * run of digits (the numeric suffix), with `N` = the MINIMUM observed numeric-suffix
 * width (so `\d{N,}` would over-narrow; we emit a fixed `\d{N}` matching the minimum,
 * widening to `{N,}`-equivalent only when widths diverge). Returns null when the ids
 * do not share a single prefix, carry no numeric suffix, or are empty — caller then
 * emits a permissive `{type:"string"}`.
 *
 * Examples: DEC-0001 → ^DEC-\d{4}$; FEAT-001 → ^FEAT-\d{3}$; issue-001 → ^issue-\d{3}$;
 * L1..L5 → ^L\d{1}$ (prefix has no trailing separator — allowed); PHASE-1 → ^PHASE-\d{1}$.
 * Mixed widths (FEAT-1, FEAT-22) → ^FEAT-\d{1,}$ (min width, open upper).
 */
export function deriveIdPattern(ids: string[]): string | null {
	if (ids.length === 0) return null;
	const split = /^([A-Za-z_-]+?)(\d+)$/;
	let prefix: string | null = null;
	let minWidth = Number.POSITIVE_INFINITY;
	let maxWidth = 0;
	for (const id of ids) {
		if (typeof id !== "string") return null;
		const m = split.exec(id);
		if (!m) return null;
		const [, pfx, digits] = m;
		if (prefix === null) prefix = pfx;
		else if (prefix !== pfx) return null;
		const w = digits.length;
		if (w < minWidth) minWidth = w;
		if (w > maxWidth) maxWidth = w;
	}
	if (prefix === null) return null;
	// Escape regex metacharacters in the literal prefix (`-`/`_` are literals inside the
	// pattern body; nothing else can appear given the `[A-Za-z_-]+` class, but escape
	// defensively so a future class-widening cannot inject an unescaped metachar).
	const esc = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const quant = minWidth === maxWidth ? `\\d{${minWidth}}` : `\\d{${minWidth},}`;
	return `^${esc}${quant}$`;
}

/**
 * CLEAN-EMIT inference: build a fresh item subschema PURELY from observed DATA —
 * inheriting NOTHING from any source schema. For each field across ALL items, UNION
 * its JSON type (not first-wins); a field showing >1 distinct non-null type collapses
 * to a permissive `{}` (no `type`). `required` is `["id"]` ONLY — every other field is
 * optional (a field present on some-not-all items must not be required).
 * `additionalProperties:false` over the COMPLETE observed field union (data is clean ⇒
 * the union is exhaustive ⇒ all items validate). The 3 identity fields are appended as
 * optional properties (their canonical declarations). The `id` property gets the GIVEN
 * `opts.idPattern` (promoted blocks, fresh-minted ids) or a `deriveIdPattern` over the
 * observed ids (de-nested parents); a `{type:"string"}` permissive fallback when neither
 * yields a pattern. `synthesizeChildSchema` later wraps this in the canonical envelope +
 * drops any deeper id-array (so the written schema passes the 9.2 guard). */
export function inferItemSubschemaFromData(
	items: Record<string, unknown>[],
	opts: { idPattern?: string },
): Record<string, unknown> {
	// Union each field's observed JSON types across ALL items (identity fields excluded
	// here; appended as the canonical declarations below).
	const typesByField = new Map<string, Set<string>>();
	const order: string[] = [];
	for (const item of items) {
		for (const [k, v] of Object.entries(item)) {
			if ((IDENTITY_FIELD_NAMES as readonly string[]).includes(k) || k === "id") continue;
			const t = jsonTypeOf(v);
			if (t === null) continue; // null/undefined observation contributes no type
			let set = typesByField.get(k);
			if (!set) {
				set = new Set<string>();
				typesByField.set(k, set);
				order.push(k);
			}
			set.add(t);
		}
	}

	const props: Record<string, unknown> = {};
	// id property first (declaration-order cosmetic; AJV ignores order).
	if (typeof opts.idPattern === "string") {
		props.id = { type: "string", pattern: opts.idPattern };
	} else {
		const ids = items.map((it) => it.id).filter((x): x is string => typeof x === "string");
		const derived = deriveIdPattern(ids);
		props.id = derived ? { type: "string", pattern: derived } : { type: "string" };
	}
	// Content fields in first-observed order.
	for (const k of order) {
		const types = typesByField.get(k) as Set<string>;
		if (types.size === 1) {
			const [t] = [...types];
			// Arrays + objects are declared LOOSELY (bare `{type}`) — an id-bearing nested
			// array must NOT be declared with id-bearing `items` (the 9.2 guard would trip);
			// it is re-detected from data + promoted at the next worklist level.
			props[k] = { type: t };
		} else {
			// >1 distinct non-null type (clean data should preclude this) → permissive `{}`.
			props[k] = {};
		}
	}
	// Append the 3 identity fields as the canonical OPTIONAL declarations.
	for (const name of IDENTITY_FIELD_NAMES) {
		if (!Object.hasOwn(props, name)) props[name] = structuredClone(IDENTITY_FIELDS[name]);
	}

	return {
		type: "object",
		required: ["id"],
		additionalProperties: false,
		properties: props,
	};
}

/** Inline a top-level $ref item shape into a fresh schema body whose `items` is
 * an inline object carrying the 3 identity fields. CLEAN-EMIT: inherits NOTHING
 * from the source parent schema — the de-nested parent's item subschema is INFERRED
 * from the de-nested parent DATA (the parent items after the promoted nested arrays
 * are removed), id pattern derived from the observed parent ids, identity fields +
 * `additionalProperties:false` over the observed field union. Wrapped in the canonical
 * envelope ($schema/$id/version/title/type/required:[arrayKey]). The result carries NO
 * nested id-bearing array (the promoted keys are gone from the data ⇒ absent from the
 * union), so it passes the 9.2 guard in `writeSchemaForDir`.
 *
 * `arrayKey` is the parent block's array_key; `denestedItems` are the parent items
 * with the promoted nested-array keys already removed; `canonicalId` titles the
 * envelope. */
function denestedSchemaBody(
	canonicalId: string,
	arrayKey: string,
	denestedItems: Record<string, unknown>[],
	substrateId: string,
): Record<string, unknown> {
	const itemSchema = inferItemSubschemaFromData(denestedItems, {});
	return {
		$schema: "http://json-schema.org/draft-07/schema#",
		$id: emittedSchemaId(canonicalId, substrateId),
		version: "1.0.0",
		title: canonicalId,
		type: "object",
		required: [arrayKey],
		properties: {
			[arrayKey]: { type: "array", items: itemSchema },
		},
	};
}

/** The `$id` for a canonicalizer-EMITTED schema, scoped by the substrate id so two
 * substrates that both carry a block_kind of the SAME canonical_id (e.g. two projects
 * each with a `feature-story` block) do NOT collide in AJV's process-global compiled-
 * validator cache (AJV keys by `$id`; a same-`$id` second body silently reuses the first
 * substrate's compiled validator, validating the second substrate's data against the
 * wrong shape). A single fresh-process run against one substrate is unaffected; the scope
 * only matters when more than one substrate is canonicalized in the same process (the
 * canonicalizer is a library callable repeatedly, and the test suite exercises many
 * substrates in one process). Schemas are loaded by FILE PATH, never resolved by this
 * `$id` string, so scoping it changes only the AJV cache key. */
function emittedSchemaId(canonicalId: string, substrateId: string): string {
	return `pi-context://schemas/${substrateId}/${canonicalId}`;
}

/** Does a block schema's item subschema ALREADY declare all 3 identity fields?
 * Resolves the item shape via `resolveBlockItemSchema` (top-level $ref inlined) and
 * checks `properties` for `oid`/`content_hash`/`content_parent`. Returns false when
 * the schema is unparseable / has no resolvable item shape. Used to GATE the up-front
 * parent-schema re-emit: an identity-declaring schema (e.g. a samples-shaped or already-
 * canonicalized block) needs no re-emit; a source schema whose item shape omits the
 * identity fields (the real `.project-migrate` `$ref`-tree definitions) does, because the
 * framework's identity-stamp gate (`prepareItemIdentityForWrite`) is a NO-OP until the
 * on-disk schema declares them — without the re-emit the parent block's items never mint
 * oids, and the membership-edge parent-oid lookup throws. */
function itemShapeDeclaresIdentity(schema: Record<string, unknown>): boolean {
	let view: ItemSchemaView;
	try {
		view = resolveBlockItemSchema(schema);
	} catch {
		return false;
	}
	const props = (view.itemSchema.properties ?? {}) as Record<string, unknown>;
	return IDENTITY_FIELD_NAMES.every((f) => Object.hasOwn(props, f));
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
	substrateId: string,
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
			$id: emittedSchemaId(canonicalId, substrateId),
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

/** Resolve a one-level local `$ref` (`#/definitions/* | #/$defs/*`) on a schema node
 * against `root`, mirroring `findNestedIdBearingArrays`' `deref`. An absent / external /
 * unresolvable `$ref` returns the node unchanged (opaque). Used by the schema-surgical
 * de-nest navigator so a `$ref`-rooted block schema (the real `.project-migrate` shape:
 * `items:{$ref:#/definitions/feature}`) is traversed identically to the detector that
 * reported the dotted path. */
function derefNode(node: Record<string, unknown>, root: Record<string, unknown>): Record<string, unknown> {
	const ref = typeof node.$ref === "string" ? node.$ref : undefined;
	if (!ref) return node;
	const m = /^#\/(definitions|\$defs)\/(.+)$/.exec(ref);
	if (!m) return node;
	const bag = root[m[1]] as Record<string, Record<string, unknown>> | undefined;
	const target = bag?.[m[2]];
	return target && typeof target === "object" ? target : node;
}

/** Locate the subschema node that DIRECTLY declares `segment` under its own
 * `properties`, mirroring `findNestedIdBearingArrays`' `descendShape` — which finds a
 * property either on the (deref'd) node's OWN `properties` OR inside ANY composition
 * branch (`allOf`/`oneOf`/`anyOf`), traversed at the SAME path level (`schema-write.ts`
 * `:195-226` for own-`properties`, `:238-242` for composition-branch descent; the branch
 * walk passes the SAME keyPath, so a branch contributes no path segment and its
 * `properties` are reached transparently). Returns the `properties` bag holding the
 * segment AND the node owning that bag (so `required` can be filtered on the SAME owner
 * the detector keyed on), or null when the segment is not declared on this node or any of
 * its composition branches. Single-level: it does NOT itself recurse INTO the segment —
 * the caller drives descent through the located property's array `items` / object body.
 *
 * `$ref` is deref'd via `derefNode` BEFORE inspecting `properties`/composition, matching
 * the detector's `walk` (`schema-write.ts:253` derefs before `descendShape`). A composition
 * branch is likewise deref'd before inspection. Recursion across nested composition wrappers
 * (e.g. `allOf:[{oneOf:[...]}]`) is bounded by a small depth backstop so a hostile
 * pure-inline composition chain cannot overflow — the detector itself never emits a path
 * segment from a composition branch, so the realistic depth is ~1-2.
 */
function findSegmentHolder(
	nodeRaw: Record<string, unknown>,
	root: Record<string, unknown>,
	segment: string,
	depth = 0,
): { props: Record<string, unknown>; owner: Record<string, unknown> } | null {
	if (!nodeRaw || typeof nodeRaw !== "object" || depth > 64) return null;
	const node = derefNode(nodeRaw, root);
	const props = node.properties as Record<string, unknown> | undefined;
	if (props && typeof props === "object" && Object.hasOwn(props, segment)) {
		return { props, owner: node };
	}
	// The segment may be declared inside a composition branch (the detector descends each
	// branch at the SAME path level). Inspect each branch the same way.
	for (const key of ["allOf", "oneOf", "anyOf"] as const) {
		const arr = node[key];
		if (!Array.isArray(arr)) continue;
		for (const member of arr) {
			if (member && typeof member === "object") {
				const found = findSegmentHolder(member as Record<string, unknown>, root, segment, depth + 1);
				if (found) return found;
			}
		}
	}
	return null;
}

/**
 * SCHEMA-SURGICAL de-nest of ONE nested id-bearing array property DECLARATION from a
 * block schema, navigating the dotted path `findNestedIdBearingArrays` reports
 * (`<arrayKey>.<n1>[.<n2>...]`, paths relative to the SCHEMA ROOT). Each segment is a
 * `properties.<seg>` key the detector visited; the detector reaches the next segment by
 * one of THREE intermediate shapes, and this navigator mirrors EACH so it deletes from the
 * SAME location the detector flagged:
 *   - ARRAY intermediate → descend through the array's `items` (deref'd) into ITS shape
 *     (`schema-write.ts:214-219`, the `depth+1` array-`items` descent);
 *   - OBJECT intermediate (a non-array object-valued property) → descend into THAT node's
 *     shape at the SAME level (`schema-write.ts:220-224`, the same-`depth` object recursion);
 *   - COMPOSITION wrapper (`allOf`/`oneOf`/`anyOf`) on an intermediate OR the item shape →
 *     the segment's `properties` live inside the branch the detector descended
 *     (`schema-write.ts:238-242`); `findSegmentHolder` locates the branch carrying the
 *     segment so the strip happens there, exactly where the detector keyed it.
 * A one-level local `$ref` is deref'd at every hop (mirroring the detector's `walk` deref),
 * so a `$ref`-rooted block schema (the real `.project-migrate` `items:{$ref:#/definitions/…}`
 * shape) is traversed identically — and a strip on the deref'd target mutates the shared
 * definition object under root.$defs/definitions, the SAME pointer the detector resolved to
 * flag the path. This generalizes `foldin-context.ts denestLayerPlans` (`:126-151`), which
 * hardcoded `delete itemProps.layers` / `migration_phases` at a fixed depth-1 path.
 *
 * Operates on a STRUCTURED CLONE; returns `{ schema, changed }`. `changed` is false ONLY
 * for a genuinely-unnavigable shape — a tuple-form `items` array at a non-final segment (the
 * canonicalizer never emits tuple-items; a hand-authored tuple-items nested array is outside
 * the wasc/empty-schema case this surgery targets), an absent segment, or an already-removed
 * final property — so the caller skips the schema write + the report entry. Also strips the
 * final segment from the holding shape's `required`.
 *
 * Schema-surgical, NOT data-inferred: it works with a PARENT block carrying 0 items (the
 * wasc case) because it edits the schema declaration directly and never reads data —
 * unlike `denestParent` / `denestedSchemaBody`, which re-infer the item shape from data and
 * collapse to an empty/degenerate schema when there are no items.
 */
export function stripNestedIdArrayFromSchema(
	schema: Record<string, unknown>,
	dottedPath: string,
): { schema: Record<string, unknown>; changed: boolean } {
	const segments = dottedPath.split(".");
	if (segments.length < 2) return { schema, changed: false };
	const root = structuredClone(schema) as Record<string, unknown>;

	// `currentShape` is the schema node (deref'd lazily by `findSegmentHolder`) whose
	// `properties` — directly OR via a composition branch — declare the NEXT segment. It
	// starts at the schema root (its `properties.<arrayKey>` holds segment 0). For each
	// non-final segment we locate the declaring property, then advance `currentShape` to the
	// shape that hosts the FOLLOWING segment: an array property's `items` (deref'd) for an
	// array intermediate, or the object property body itself for an object intermediate.
	let currentShape: Record<string, unknown> = root;

	for (let i = 0; i < segments.length - 1; i++) {
		const holder = findSegmentHolder(currentShape, root, segments[i]);
		if (!holder) return { schema: root, changed: false };
		const seg = holder.props[segments[i]] as Record<string, unknown> | undefined;
		if (!seg || typeof seg !== "object") return { schema: root, changed: false };
		if (seg.type === "array" || seg.items !== undefined) {
			// ARRAY intermediate: descend through `items` (deref'd) — the next segment lives
			// inside the array's item shape (the detector's depth+1 array-items descent).
			const itemsRaw = seg.items;
			// A tuple-items (array) intermediate is not navigated (see header).
			if (!itemsRaw || typeof itemsRaw !== "object" || Array.isArray(itemsRaw)) {
				return { schema: root, changed: false };
			}
			currentShape = itemsRaw as Record<string, unknown>;
		} else {
			// OBJECT intermediate: descend into the object property body at the SAME level —
			// the next segment lives in THIS node's `properties` (the detector's same-depth
			// object recursion). `findSegmentHolder` will deref it on the next hop.
			currentShape = seg;
		}
	}

	// `currentShape` is now the shape (array `items`, object body, or composition wrapper)
	// whose `properties` — directly or via a branch — DECLARE the final segment. Locate the
	// declaring bag + its owner so the strip + the `required` filter land on the SAME node the
	// detector keyed on.
	const last = segments[segments.length - 1];
	const finalHolder = findSegmentHolder(currentShape, root, last);
	if (!finalHolder) return { schema: root, changed: false };
	const holderProps = finalHolder.props;
	const owner = finalHolder.owner;
	let changed = false;
	if (Object.hasOwn(holderProps, last)) {
		delete holderProps[last];
		changed = true;
	}
	if (Array.isArray(owner.required)) {
		const filtered = (owner.required as unknown[]).filter((r) => r !== last);
		if (filtered.length !== (owner.required as unknown[]).length) {
			owner.required = filtered;
			changed = true;
		}
	}
	return { schema: root, changed };
}

/**
 * Canonicalize `substrateDir` in place. See the module header. `dryRun` performs
 * ZERO writes and reports the counts a real run would produce. Throws on a
 * structural surprise (missing config, an unparseable schema, an unresolvable
 * $ref) — never silently no-ops a promotion.
 */
export function canonicalizeSubstrate(
	substrateDir: string,
	opts?: {
		dryRun?: boolean;
		ctx?: DispatchContext;
		promotionTargets?: PromotionTargets;
		registerBlocks?: RegisterBlock[];
	},
): CanonicalizeReport {
	const dryRun = opts?.dryRun ?? false;
	const ctx = opts?.ctx;
	const promotionTargets: PromotionTargets = opts?.promotionTargets ?? {};
	const registerBlocks: RegisterBlock[] = opts?.registerBlocks ?? [];

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
		registered_blocks: [],
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

	// ── In-memory stores for dryRun simulation ─────────────────────────────────
	// blockName → item array. Mutated only under dryRun; the real run reads/writes
	// disk. Seeded lazily from the on-disk data.
	const simItems = new Map<string, Record<string, unknown>[]>();
	// canonical_id → schema body for SYNTHESIZED child blocks under dryRun. The real
	// run writes a synthesized block's schema to disk in `registerKind`; the dryRun
	// path performs ZERO writes, so a synthesized block has NO on-disk schema. Without
	// this store the worklist's schema read (and the content-hash projection in
	// backfill/appendPromoted) would see `fs.existsSync(schemaPath) === false` for a
	// synthesized block and SKIP it — silently dropping any DEEPER nested array carried
	// inside a synthesized intermediate (a depth-3 promotion through a synth depth-2
	// parent). Holding the synthesized schema in memory lets the dryRun simulation read
	// it exactly where the real run reads the just-written on-disk schema, so the
	// data-observed deeper arrays are detected identically. Keyed by canonical_id.
	const simSchemas = new Map<string, Record<string, unknown>>();
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

	// Simulated object-store membership for dryRun. The real run writes objects to
	// disk (via writeBlockForDir / appendToBlockForDir → putObject) AS IT GOES, so a
	// later `hasObject` check sees an earlier write's hash already present and does NOT
	// re-count it (content-addressed dedup). The dryRun writes nothing, so a plain
	// `hasObject` against the static on-disk store would over-count every projection.
	// This set replays putObject's idempotent dedup in memory: `simWouldStore(hash)`
	// returns true (a NEW store) only when the hash is absent from BOTH the on-disk
	// store and this set, recording it so a recurrence is not re-counted — matching the
	// real run's `objects_stored` count exactly.
	const simStored = new Set<string>();
	const simWouldStore = (hash: string): boolean => {
		if (hasObject(substrateDir, hash) || simStored.has(hash)) return false;
		simStored.add(hash);
		return true;
	};

	// Resolve a block's schema body: under dryRun, prefer the in-memory synthesized
	// schema (a synth block has no on-disk schema in a dry run) then fall back to disk;
	// under a real run, read disk. Returns null when neither source has it (a block
	// whose schema file is genuinely absent). Mirrors the real run's on-disk read so
	// the dryRun simulation observes the SAME schema the real run just wrote.
	const schemaForBk = (bk: BlockKindDecl): Record<string, unknown> | null => {
		if (dryRun) {
			const inMem = simSchemas.get(bk.canonical_id);
			if (inMem) return structuredClone(inMem);
		}
		const p = schemaAbs(substrateDir, bk);
		if (!fs.existsSync(p)) return null;
		try {
			return JSON.parse(fs.readFileSync(p, "utf-8")) as Record<string, unknown>;
		} catch {
			return null;
		}
	};

	// Backfill (real) or simulate-stamp (dry) a block's items so every item carries
	// an oid; returns a refname→oid map for the block. Accumulates report counts.
	const backfillBlock = (bk: BlockKindDecl): Map<string, string> => {
		const map = new Map<string, string>();
		// `schemaForBk` reads disk under a real run and prefers the in-memory synthesized
		// schema under dryRun — so a synthesized child block's content-hash projection is
		// computed against the same schema in both modes.
		const schema = schemaForBk(bk);
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
					// Mirror the real run's backfill, which counts a store only when the hash
					// is not already present (writeBlockForDir then stores all items). An item
					// promoted earlier via appendPromoted was already simulated-stored, so it is
					// not re-counted here — matching real, where the append's putObject already
					// wrote it to disk before this backfill's pre-write hasObject check.
					if (simWouldStore(hash)) report.objects_stored += 1;
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
			// Hold the synthesized schema in memory so the worklist's later schema read
			// (and the content-hash projection) sees it — the real run reads this same
			// body off disk after `writeSchemaCheckedForDir`. Without it the dryRun worklist
			// would skip the synthesized block (no on-disk schema) and miss its deeper
			// nested arrays — a depth-3 promotion through a synth intermediate.
			simSchemas.set(bk.canonical_id, structuredClone(schemaBody));
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
			// The REAL appendPromoted does NOT count objects_stored — it only WRITES the
			// object (appendToBlockForDir → putObject); the store is counted later, when this
			// block is backfilled and finds the hash present. Mirror that here: record the
			// would-be store in the sim set (so the later backfill's simWouldStore skips it)
			// WITHOUT incrementing the count. `schemaForBk` resolves the synthesized target's
			// in-memory schema (no on-disk schema yet under dryRun) so the projection matches.
			const schema = schemaForBk(targetBk);
			if (schema) {
				const hash = computeContentHash(contentProjection(schema, targetBk.array_key, stamped));
				simWouldStore(hash);
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
		// Read the parent block + compute the DE-NESTED item set (promoted nested-array
		// keys removed) FIRST — the clean-emit schema is inferred from this de-nested data,
		// so it must be materialized before the schema-replace.
		const block = readBlockForDir(substrateDir, parentBk.canonical_id) as Record<string, unknown>;
		const arr = Array.isArray(block[parentBk.array_key])
			? (block[parentBk.array_key] as Record<string, unknown>[])
			: [];
		const denestedItems = arr.map((it) => {
			if (!it || typeof it !== "object") return it;
			const next = { ...it };
			for (const k of nestedKeys) delete (next as Record<string, unknown>)[k];
			return next;
		});
		// CLEAN-EMIT: infer the parent's canonical schema from the de-nested DATA — inherits
		// NOTHING from the source parent schema (no $ref/$defs/divergent-AP carried over).
		const denested = denestedSchemaBody(
			parentBk.canonical_id,
			parentBk.array_key,
			denestedItems.filter((x): x is Record<string, unknown> => !!x && typeof x === "object"),
			report.substrate_id,
		);
		writeSchemaCheckedForDir(substrateDir, parentBk.canonical_id, denested, "replace", ctx);
		// Rewrite parent block dropping the nested arrays.
		block[parentBk.array_key] = denestedItems;
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

	// Up-front parent-schema re-emit: BEFORE a block is backfilled, ensure its
	// on-disk item schema DECLARES the 3 identity fields, so the framework's identity-
	// stamp gate (`prepareItemIdentityForWrite`, a NO-OP until the schema declares them)
	// actually mints oids on backfill. A source block (e.g. the real `.project-migrate`
	// `$ref`-tree `features`) whose definitions omit the identity fields would otherwise
	// never get parent oids, and the membership-edge parent-oid lookup throws. CLEAN-EMIT:
	// the replacement item schema is INFERRED from the CURRENT (STILL-NESTED) data — every
	// observed field including the to-be-promoted nested id-bearing arrays as LOOSE
	// `{type:"array"}` (no id-bearing `items`, so the 9.2 guard passes) + the identity
	// fields + `additionalProperties:false`. The still-nested parent DATA validates against
	// this intermediate schema at the backfill write (loose arrays accept the nested
	// content); the later `denestParent` re-infers from the DE-NESTED data, dropping the
	// promoted keys. GATED on (i) the block has data items (a fileless/empty block — e.g.
	// the vestigial divergent-narrow `story` — is left UNTOUCHED, never a backfill/promotion
	// source) AND (ii) its current item shape does NOT already declare identity (an already-
	// identity-declaring schema needs no re-emit, so identity-shaped source + synth-child
	// schemas are not churned). Real run only; dryRun simulates oid stamping via fakeOid
	// regardless of the on-disk schema, so it needs no re-emit (and writes nothing).
	const prepareParentSchema = (bk: BlockKindDecl): void => {
		if (dryRun) return;
		const items = readItems(substrateDir, bk);
		if (items.length === 0) return;
		const schema = schemaForBk(bk);
		if (schema && itemShapeDeclaresIdentity(schema)) return;
		// Infer from the CURRENT still-nested items (nested id-bearing arrays surface as
		// loose `{type:"array"}` — NOT special-cased/omitted; de-nesting drops them later).
		const reemit = denestedSchemaBody(bk.canonical_id, bk.array_key, items, report.substrate_id);
		writeSchemaCheckedForDir(substrateDir, bk.canonical_id, reemit, "replace", ctx);
	};

	// ── Step 1.5: register orphan content-bearing blocks ───────────────────────
	// BEFORE the backfill worklist seeds from config: take every operator-supplied
	// `registerBlocks` directive and make the orphan a REGISTERED identity-declaring
	// block_kind so the existing backfill pass (Step 2) content-addresses its items.
	// The orphan's schema is assumed already clean (it models the array + any singleton
	// fields correctly) — this pass does NOT clean-emit-rebuild it; it only (i) adds the
	// block_kind to config when absent and (ii) injects the 3 identity fields onto the
	// array's item subschema when absent (exactly like `land-identity-fields`, preserving
	// everything else — including a slug `{type:"string"}` item `id` left verbatim, so no
	// pattern is added + no ids are minted). Idempotent: already-registered +
	// identity-declaring → no config amend, no schema write.
	const registerOrphanBlock = (rb: RegisterBlock): void => {
		const cfg = currentConfig();
		const already = (cfg.block_kinds ?? []).some((b) => b.canonical_id === rb.canonical_id);
		const bk: BlockKindDecl = {
			canonical_id: rb.canonical_id,
			display_name: rb.display_name ?? rb.canonical_id,
			prefix: rb.prefix,
			schema_path: rb.schema_path,
			array_key: rb.array_key,
			data_path: rb.data_path,
		};
		if (!already) {
			report.registered_blocks.push(rb.canonical_id);
			if (dryRun) {
				(workingConfig.block_kinds ??= []).push(bk);
			} else {
				amendConfigEntryForDir(substrateDir, "block_kinds", "add", rb.canonical_id, bk, ctx);
			}
		}
		// Inject the 3 identity fields onto the array's item subschema if absent — the
		// SURGICAL inject (`land-identity-fields` discipline), NOT a clean-emit rebuild.
		// Real run only: under dryRun oid stamping is simulated via `fakeOid` regardless of
		// the on-disk schema declaration, so no schema write is needed (and dryRun writes
		// nothing). The orphan's existing clean schema is read, the array's item
		// `properties` augmented with any missing identity field, and written back via
		// `writeSchemaCheckedForDir(..., "replace", ...)` — keeping the rest byte-for-byte.
		if (dryRun) return;
		const schemaPath = path.isAbsolute(rb.schema_path) ? rb.schema_path : path.join(substrateDir, rb.schema_path);
		if (!fs.existsSync(schemaPath)) {
			throw new Error(
				`canonicalizeSubstrate: registerBlocks['${rb.canonical_id}'] schema not found at ${schemaPath} (an orphan block's clean schema must already exist on disk)`,
			);
		}
		let schema: Record<string, unknown>;
		try {
			schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8")) as Record<string, unknown>;
		} catch (err) {
			throw new Error(
				`canonicalizeSubstrate: registerBlocks['${rb.canonical_id}'] schema at ${schemaPath} is unparseable: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
		const props = schema.properties as Record<string, unknown> | undefined;
		const arrayNode = props?.[rb.array_key] as Record<string, unknown> | undefined;
		if (!arrayNode || typeof arrayNode !== "object") {
			throw new Error(
				`canonicalizeSubstrate: registerBlocks['${rb.canonical_id}'] schema has no array property '${rb.array_key}' under properties`,
			);
		}
		const items = arrayNode.items as Record<string, unknown> | undefined;
		if (!items || typeof items !== "object") {
			throw new Error(
				`canonicalizeSubstrate: registerBlocks['${rb.canonical_id}'] array '${rb.array_key}' has no object 'items'`,
			);
		}
		const itemProps = (items.properties as Record<string, unknown> | undefined) ?? {};
		if (IDENTITY_FIELD_NAMES.every((n) => Object.hasOwn(itemProps, n))) return; // already declares identity
		const nextProps: Record<string, unknown> = { ...itemProps };
		for (const name of IDENTITY_FIELD_NAMES) {
			if (!Object.hasOwn(nextProps, name)) nextProps[name] = structuredClone(IDENTITY_FIELDS[name]);
		}
		items.properties = nextProps;
		writeSchemaCheckedForDir(substrateDir, rb.canonical_id, schema, "replace", ctx);
	};
	for (const rb of registerBlocks) registerOrphanBlock(rb);
	if (!dryRun && registerBlocks.length > 0) {
		// Re-read config so the worklist seed below includes the just-registered orphans.
		workingConfig = loadConfigForDir(substrateDir) as ConfigBlock;
	}

	// ── Step 2: promotion worklist (parent-first) ──────────────────────────────
	// Seed with every registered block_kind; synthesized child blocks enqueue.
	const queue: BlockKindDecl[] = [...(workingConfig.block_kinds ?? [])];
	const processed = new Set<string>();

	while (queue.length) {
		const bk = queue.shift() as BlockKindDecl;
		if (processed.has(bk.canonical_id)) continue;
		processed.add(bk.canonical_id);

		// (a) Re-emit this block's schema to the identity-declaring clean-emit shape (when
		//     its source schema omits identity), THEN backfill so its items carry oids.
		prepareParentSchema(bk);
		const parentOidByRef = backfillBlock(bk);

		// (b) Direct nested id-bearing array KEYS on THIS block's items — DATA-DRIVEN
		//     ONLY (no source-schema read for detection): every direct property whose
		//     value is a non-empty array of id-bearing objects, across all parent items.
		//     This is the SAME detector for a top-level block (its $ref/divergent source
		//     schema is never consulted), a reused block, AND a synthesized child block
		//     (whose written schema intentionally omits its deeper arrays per the 9.2
		//     guard — the data carries them). A 0-data nested array contributes no key
		//     (empty ⇒ not id-bearing) and so is not promoted HERE. Whether its SCHEMA
		//     declaration is dropped depends on whether this block was re-inferred: a
		//     parent with data items is clean-emit re-inferred (the empty array re-emerges
		//     as a loose `{type:"array"}`, 9.2-guard-clean); a parent with ZERO items is
		//     NOT re-inferred (`prepareParentSchema` early-returns at 0 items, and
		//     `denestParent` runs only when a key WAS promoted), so a 0-data nested array
		//     declared on a 0-item block's SCHEMA survives AS an id-bearing nested array —
		//     the case the schema-surgical sweep below (Step 3.5) strips, since the
		//     data-driven path here cannot reach it. The promotionTargets lookup below is
		//     explicit-or-fail.
		const nestedKeysAll = dataNestedIdArrayKeys(itemsFor(bk));
		if (nestedKeysAll.length === 0) continue;

		// Accumulate EVERY promoted nested key for ONE schema-replace + data rewrite at
		// the end — a parent with multiple nested id-bearing arrays must drop them all in
		// one inferred-schema write (the clean-emit infers the parent schema from the data
		// AFTER all promoted keys are removed, so a single end-of-block de-nest is correct).
		const denestKeys: string[] = [];

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

			// CLEAN-EMIT: the promoted entity's item subschema is ALWAYS inferred from the
			// nested DATA — inheriting NOTHING from the source parent schema (no $ref/$defs,
			// no divergent narrow AP). Uniform for top-level, reused, and synth-deeper keys.
			// For a NEW block the GIVEN idPattern is used; `synthesizeChildSchema` re-stamps
			// it on the envelope. (For a REUSE target this subschema is not written — the
			// reuse block's on-disk schema stands — but it is computed identically.)
			const nestedItemSchema = inferItemSubschemaFromData(
				pending.map((p) => p.childItem),
				{ idPattern: spec.idPattern },
			);
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
					report.substrate_id,
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
				// Track the assigned id so `nextIdFrom` sees the running set on the NEXT
				// iteration. Under dryRun `appendPromoted` already pushed the full child body
				// into the SAME sim array `targetItemsLive` references (itemsFor returns the
				// live store), so pushing again here would DOUBLE-populate the sim store —
				// inflating the later backfill's item/hash/object counts and diverging the
				// dryRun report from the real run. Only the real run needs this stub: there
				// `appendPromoted` writes to disk and `targetItemsLive` is a throwaway disk
				// read, so the running set must be tracked here for `nextIdFrom`.
				if (!dryRun) targetItemsLive.push({ id: assignedId, oid: childOid });
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

	// ── Step 3.5: schema-surgical de-nest sweep (SCHEMA-DRIVEN, data-independent) ─
	// The data-driven promotion/de-nest above (Step 2) only de-nests a parent whose
	// nested id-bearing array carried DATA (`dataNestedIdArrayKeys` skips empty arrays;
	// `prepareParentSchema` early-returns at 0 items; `denestParent` runs only when a key
	// was promoted). A block whose SCHEMA declares a nested id-bearing array but whose DATA
	// is empty — the wasc shape, e.g. `layer-plans.json = {"plans":[]}` with a schema
	// declaring `plans.items.properties.layers[].id` + `migration_phases[].id` — is left
	// UN-touched by Step 2, so the nested-array DECLARATION survives and `validateContext`
	// (which scans SCHEMAS via `findNestedIdBearingArrays`) would flag `nested_id_bearing
	// _array`. A tool named "canonicalize" must not emit a substrate its own validator
	// rejects. This sweep closes that gap: for EVERY registered block_kind, read the
	// on-disk schema, and for each nested id-bearing array path the detector reports, strip
	// that property declaration (schema-surgical, never data-inferred — works at 0 items).
	//
	// REGRESSION-SAFE: a block already de-nested by Step 2 is SKIPPED here (its canonical_id
	// is already in `report.schema_denested`) — under a REAL run Step 2 re-emitted its schema
	// clean (so the detector would find nothing anyway), and under DRYRUN Step 2 only counted
	// the de-nest in-memory while the on-disk schema is unchanged, so without this skip the
	// sweep would re-read the still-nested on-disk schema and DOUBLE-COUNT the block in
	// `schema_denested` — diverging the dryRun report from the real run. Skipping by the
	// already-recorded set keeps dry==real and confines this sweep to exactly the gap Step 2
	// left: a block whose SCHEMA declares a nested id-bearing array that Step 2 never de-nested
	// (the 0-data wasc shape). The data-driven PROMOTION of data-bearing arrays (entities +
	// membership edges) is untouched; an already-canonical substrate has no nested-id schema,
	// so the sweep performs zero writes.
	const alreadyDenested = new Set(report.schema_denested);
	for (const bk of currentConfig().block_kinds ?? []) {
		if (alreadyDenested.has(bk.canonical_id)) continue;
		const schema = schemaForBk(bk);
		if (!schema) continue;
		const nestedPaths = findNestedIdBearingArrays(schema);
		if (nestedPaths.length === 0) continue;
		let working = schema;
		let anyChanged = false;
		for (const dottedPath of nestedPaths) {
			const { schema: stripped, changed } = stripNestedIdArrayFromSchema(working, dottedPath);
			if (changed) {
				working = stripped;
				anyChanged = true;
			}
		}
		if (!anyChanged) continue;
		report.schema_denested.push(bk.canonical_id);
		if (dryRun) {
			// Reflect the strip in the in-memory schema store so the post-sweep completeness
			// guard below reads the de-nested (stripped) shape under dryRun exactly as it reads
			// the just-written on-disk shape under a real run — keeping the guard's verdict
			// dry==real. Never writes disk (the dryRun no-write contract holds).
			simSchemas.set(bk.canonical_id, structuredClone(working));
			continue;
		}
		writeSchemaCheckedForDir(substrateDir, bk.canonical_id, working, "replace", ctx);
	}

	// ── Step 3.5 completeness guard: the sweep's de-nest must be EXHAUSTIVE ──────
	// The sweep above strips every nested id-bearing array path `findNestedIdBearingArrays`
	// reports — but a stripper that fails to mirror the detector's traversal for some
	// intermediate shape (an object-valued wrapper, a composition branch) would record
	// `changed:false`, leave the declaration on disk, and let canonicalizeSubstrate return a
	// FALSELY-CLEAN report over a schema `validateContext` still flags. This guard re-runs the
	// detector over every registered block's POST-sweep schema and THROWS naming the block +
	// surviving path if ANY nested id-bearing array remains — so the tool can never claim
	// success while leaving a `nested_id_bearing_array` the validator would reject. dryRun
	// parity: a Step-2 de-nested block is clean on disk after a real run, but under dryRun its
	// de-nest was only counted in-memory (denestParent never re-writes the dry schema store) —
	// so its still-nested on-disk schema is EXCLUDED here by the `alreadyDenested` set (Step-2
	// de-nested blocks). For a sweep-stripped block, `schemaForBk` resolves the in-memory
	// stripped shape under dryRun (set just above) and the on-disk stripped shape under a real
	// run, so the guard inspects the SAME post-de-nest schema in both modes.
	for (const bk of currentConfig().block_kinds ?? []) {
		if (alreadyDenested.has(bk.canonical_id)) continue; // de-nested by Step 2 (real: clean on disk; dry: counted in-memory)
		const schema = schemaForBk(bk);
		if (!schema) continue;
		const remaining = findNestedIdBearingArrays(schema);
		if (remaining.length > 0) {
			throw new Error(
				`canonicalizeSubstrate: completeness guard — block '${bk.canonical_id}' still declares nested id-bearing array(s) after the de-nest sweep: ${remaining.join(", ")}. ` +
					`stripNestedIdArrayFromSchema did not mirror findNestedIdBearingArrays' traversal for this shape; canonicalize will not return a falsely-clean report.`,
			);
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
