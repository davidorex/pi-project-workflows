/**
 * pi-context substrate SDK — config-driven vocabulary registries from line 1.
 *
 * This module owns the substrate primitives ported from
 * `analysis/poc-degree-zero-lens/render.ts` and extended with the
 * config-as-canonical-registry shape per the step-2 plan.
 *
 * Design constraint: imports only from `./context-dir` (path constants),
 * `./schema-validator` (AJV bridge), and node builtins. This module resolves
 * the substrate dir via `resolveContextDir` from `./context-dir` without
 * forming a cycle through context-sdk; it must therefore stay at a strictly
 * lower layer than context-sdk.
 *
 * Closes structurally:
 *   - FGAP-001 (hierarchical block storage via closure-table per DEC-0009)
 *   - FGAP-013 (status vocabulary registry — `config.status_buckets`)
 *   - issue-089 class (PLAN- prefix collision — `config.block_kinds[].prefix`
 *     makes prefix conflicts a config-registration-time concern, not a
 *     fixture-write-time crash)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appendManyToTypedFileIfAbsent, writeTypedFile } from "./block-api.js";
import {
	assertSubstrateName,
	mintSubstrateId,
	resolveContextDir,
	SCHEMAS_DIR,
	tryResolveContextDir,
} from "./context-dir.js";
import { registerSubstrate } from "./context-registry.js";
import type { DispatchContext } from "./dispatch-context.js";
import { ValidationError, validateFromFile } from "./schema-validator.js";

// ── Type definitions (from plan §"Files to create") ──────────────────────────

export interface ConfigBlock {
	schema_version: string;
	root: string;
	/**
	 * Per-substrate root identity (content-addressed substrate identity, Cycle 3).
	 * `^sub-[0-9a-f]{16}$`; minted once via `mintSubstrateId` and immutable on
	 * disk. Read by `substrateIdForDir` (throws when absent). Optional on the
	 * type so pre-Cycle-3 configs (and the packaged conception template, which
	 * intentionally omits it) remain valid; substrates that stamp identity carry
	 * it by construction.
	 */
	substrate_id?: string;
	naming?: Record<string, string>;
	layers?: LayerDecl[];
	block_kinds: BlockKindDecl[];
	status_buckets?: Record<string, StatusBucket>;
	display_strings?: Record<string, string>;
	relation_types?: RelationTypeDecl[];
	hierarchy?: HierarchyDecl[];
	lenses?: LensSpec[];
	invariants?: InvariantDecl[];
	installed_schemas?: string[];
	installed_blocks?: string[];
	tool_operations?: ToolOperationDecl[];
	tool_operations_forbidden?: string[];
}

/**
 * Operation-granular tool grant vocabulary entry (FEAT-005 / DEC-0047). Each
 * names a Pi tool (or coarser operation) that can be granted to a privileged
 * JIT-agent. Default grant is EMPTY per DEC-0047; consumers opt-in operations
 * per dispatch.
 */
export interface ToolOperationDecl {
	canonical_id: string;
	display_name?: string;
	category?: string;
	/**
	 * Composite-tool KIND identifier (FEAT-010). When present, composite-loader
	 * binds `instance_params` to the named KIND library function and registers
	 * a per-instance Pi tool. Absent → entry is a static-tool reference only
	 * (FEAT-005 shape).
	 */
	kind?: string;
	/**
	 * Instance-scoped parameters (FEAT-010) — fixed at registration; closure-
	 * bound by composite-loader so the runtime callsite cannot widen scope
	 * (e.g. read-files.allowed_roots, command-allowlist.allowed_commands).
	 */
	instance_params?: Record<string, unknown>;
}

/**
 * The eleven config registries `amendConfigEntry` can target. Each name maps to
 * a top-level `ConfigBlock` property; the scalars `schema_version` / `root` are
 * intentionally NOT addressable (they are not registries — mutate them via a
 * whole-config write). The set is kept in sync with `ConfigBlock` by hand.
 */
export type AmendRegistry =
	| "block_kinds"
	| "relation_types"
	| "lenses"
	| "layers"
	| "invariants"
	| "status_buckets"
	| "display_strings"
	| "naming"
	| "installed_schemas"
	| "installed_blocks"
	| "hierarchy"
	| "tool_operations"
	| "tool_operations_forbidden";

/** The scoped amend verbs. `add` requires the key absent; `replace` / `remove`
 * require it present (OP-CORRECTNESS, decidable from the loaded config alone). */
export type AmendOperation = "add" | "replace" | "remove";

/**
 * Outcome of one `amendConfigEntry` call. `modified` is false only for a
 * structural no-op (none occur today — every op either mutates or throws — but
 * the field is reserved for future idempotent-replace semantics). `previousValue`
 * carries the displaced / removed entry for `replace` / `remove` (undefined for
 * `add`).
 */
export interface AmendResult {
	modified: boolean;
	operation: AmendOperation;
	registry: AmendRegistry;
	key: string;
	previousValue?: unknown;
}

export interface LayerDecl {
	id: string;
	display_name: string;
	description?: string;
}

export interface BlockKindDecl {
	canonical_id: string;
	display_name: string;
	prefix: string;
	schema_path: string;
	array_key: string;
	data_path: string;
	layer?: string;
}

export type StatusBucket = "complete" | "in_progress" | "blocked" | "todo" | "unknown";

export interface RelationTypeDecl {
	canonical_id: string;
	display_name: string;
	category: "ordering" | "data_flow" | "membership";
	cycle_allowed?: boolean;
	source_kinds?: string[];
	target_kinds?: string[];
}

export interface HierarchyDecl {
	parent_block: string;
	child_block: string;
	relation_type: string;
}

/**
 * Config-declared substrate invariant (DEC-0025: vocabulary lives in DATA, not
 * source). Two classes, both enforced generically by validateContext — no
 * block/status/relation_type literal appears in the consumer loops:
 *
 *  - `requires-edge`: items in `block` matching the optional `where` predicate
 *    must occupy `direction`'s endpoint on ≥1 edge whose relation_type ∈
 *    `relation_types`.
 *  - `status-consistency`: for items in `block` (optionally gated by
 *    `when_bucket` on the item's own status bucket), the related item across an
 *    edge whose relation_type ∈ `relation_types` (item at `direction`, target at
 *    the other endpoint) must have status bucket === `require_target_bucket`
 *    and/or !== `forbid_target_bucket`.
 *
 * The status-bucket fields use the inline string-union rather than importing
 * StatusBucket from status-vocab: status-vocab imports loadContext from
 * THIS module, so importing StatusBucket back would form a cycle. The union is
 * kept in sync with StatusBucket (context.ts:64) by hand.
 */
export interface InvariantDecl {
	id: string;
	class: "requires-edge" | "status-consistency";
	block: string;
	where?: Record<string, string | number | boolean>;
	relation_types: string[];
	direction: "as_parent" | "as_child";
	when_bucket?: "complete" | "in_progress" | "blocked" | "todo" | "unknown";
	require_target_bucket?: "complete" | "in_progress" | "blocked" | "todo" | "unknown";
	forbid_target_bucket?: "complete" | "in_progress" | "blocked" | "todo" | "unknown";
	severity?: "error" | "warning";
	message?: string;
}

export interface LensSpec {
	id: string;
	bins: string[];
	kind?: "target" | "composition";
	target?: string;
	targets?: string[];
	members?: CompositionMember[];
	relation_type?: string;
	derived_from_field?: string | null;
	render_uncategorized?: boolean;
}

export interface CompositionMember {
	lens?: string;
	from?: string;
	where?: Record<string, string | number | boolean>;
}

/**
 * Structured edge endpoint (content-addressed-substrate-identity arc, Cycle 5).
 *
 * Two kinds:
 *  - `item`: an item endpoint. `oid` is the content-addressed object id (Cycle 3)
 *    and is the dedup identity (see `endpointIdentity`); `refname` is the legacy
 *    canonical id (FGAP-NNN, DEC-NNNN, …) and is the CONSUMER-LAYER node identity
 *    (see `normalizeEndpoint` / the load-bearing pivot). `substrate_id` present →
 *    a FOREIGN endpoint (points into another substrate); resolution of foreign
 *    endpoints is Cycle 8 (F2) — this cycle treats them as unresolved sentinels.
 *    `content_hash` is carried for Cycle-8 drift detection, inert here.
 *  - `lens_bin`: a virtual lens-bin parent node (`bin` is the bin label). A
 *    lens_bin endpoint NEVER resolves to an item — it is matched against
 *    `lens.bins` only (the corruption-risk surface, Constraint 4).
 */
export type EdgeEndpoint =
	| { kind: "item"; substrate_id?: string; oid: string; refname?: string; content_hash?: string }
	| { kind: "lens_bin"; bin: string };

/**
 * The persisted / accepted endpoint form on `Edge.parent` / `Edge.child`. The
 * relations.json data stays string-form until Phase H (Cycle 10) migrates it;
 * the porcelain writes structured `EdgeEndpoint` objects. Every consumer accepts
 * BOTH via the `normalizeEndpoint` / `endpointKey` / `endpointBin` helpers below.
 */
export type RawEndpoint = string | EdgeEndpoint;

export interface Edge {
	parent: RawEndpoint;
	child: RawEndpoint;
	relation_type: string;
	ordinal?: number;
}

/**
 * Normalized endpoint view — the single derivation that every consumer site
 * routes through. NO resolution, NO imports, NO registry consultation: pure
 * shape-normalization, so `context.ts` stays at its layer (it may not import
 * `context-sdk`).
 *
 * Mapping (the load-bearing pivot — consumer node identity = refname, NOT oid):
 *  - string `s`                              → `{kind:"item", key:s, foreign:false}`
 *  - `{kind:"item", oid, refname?, substrate_id?}` → `{kind:"item", key: refname ?? oid, foreign: !!substrate_id}`
 *  - `{kind:"lens_bin", bin}`                → `{kind:"lens_bin", key:bin, bin}`
 *
 * A same-substrate structured item therefore normalizes to its `refname`, so it
 * lands on the IDENTICAL node as a legacy bare-refname string for the same item
 * — byte-identical behavior on existing string data. A foreign structured item
 * (or a legacy `project:`/`<alias>:` string) keys on its foreign string → an
 * `idIndex` miss → the same unresolved/dangling outcome as today's sentinels.
 */
export type NormalizedEndpoint =
	| { kind: "item"; key: string; foreign: boolean }
	| { kind: "lens_bin"; key: string; bin: string };

export function normalizeEndpoint(e: RawEndpoint): NormalizedEndpoint {
	if (typeof e === "string") {
		return { kind: "item", key: e, foreign: false };
	}
	if (e.kind === "lens_bin") {
		return { kind: "lens_bin", key: e.bin, bin: e.bin };
	}
	return { kind: "item", key: e.refname ?? e.oid, foreign: !!e.substrate_id };
}

/**
 * The consumer-layer node key for an endpoint — the string that joins against
 * `idIndex` (keyed by item refname) or is compared to `lens.bins` labels. This
 * is the normalize-to-string shim every walker / validator / grouping site reads
 * in place of the bare `edge.parent`/`edge.child`. Returns byte-identical results
 * for legacy string endpoints.
 */
export function endpointKey(e: RawEndpoint): string {
	return normalizeEndpoint(e).key;
}

/**
 * The bin label for a `{kind:"lens_bin"}` endpoint; `null` for any item endpoint
 * (string or structured). Lens sites test this so a lens_bin endpoint can never
 * reach an `idIndex.get` path (Constraint 4). A legacy STRING parent is `null`
 * here too — it stays bin-or-item ambiguous and is resolved by
 * `lens.bins.includes(endpointKey(e))` exactly as before this cycle.
 */
export function endpointBin(e: RawEndpoint): string | null {
	const n = normalizeEndpoint(e);
	return n.kind === "lens_bin" ? n.bin : null;
}

/**
 * The DEDUP identity of an endpoint (the deliberate asymmetry vs the consumer
 * node key): string → the string; structured item → `${substrate_id ?? ""}:${oid}`;
 * lens_bin → `bin:${bin}`. This is what `identityKey` keys on for the
 * append-if-absent no-op.
 *
 * The `${substrate_id ?? ""}:${oid}` colon-form is the EDGE DEDUP KEY ONLY — it is
 * NOT the oid's own format. The oid is a bare 32-hex digest (see `mintOid`, which
 * returns the digest with no substrate prefix and no colon). The `substrate_id`
 * prefix is prepended here solely so two items that happen to share an oid across
 * DIFFERENT substrates dedup as distinct edges; within one substrate the oid alone
 * is content-addressed, so two items with the same oid but different refnames dedup
 * together.
 *
 * A bare-refname STRING and a structured same-item with the SAME refname do NOT
 * dedup-merge here (string key `"FGAP-1"` vs item key `":<oid>"`) — the documented,
 * probed asymmetry.
 */
export function endpointIdentity(e: RawEndpoint): string {
	if (typeof e === "string") return e;
	if (e.kind === "lens_bin") return `bin:${e.bin}`;
	return `${e.substrate_id ?? ""}:${e.oid}`;
}

export interface ItemRecord {
	id: string;
	[k: string]: unknown;
}

export interface SubstrateValidationIssue {
	code:
		| "edge_parent_not_in_bins"
		| "edge_unresolved_parent"
		| "edge_unresolved_child"
		| "edge_unknown_relation_type"
		| "edge_parent_wrong_block"
		| "edge_child_wrong_block"
		| "edge_cycle_detected";
	message: string;
	edge?: Edge;
	cycle?: string[];
	relation_type?: string;
}

export interface SubstrateValidationResult {
	status: "clean" | "warnings" | "invalid";
	issues: SubstrateValidationIssue[];
}

export interface ContextData {
	config: ConfigBlock | null;
	relations: Edge[];
}

export interface CurationSuggestion {
	payload: Edge;
	reason: string;
}

// ── Schema paths (bundled with the package) ──────────────────────────────────

/**
 * Resolve the bundled config / relations schema files. Resolved relative to
 * this module so it works from both `src/` (via tsx --test) and `dist/`
 * (after `tsc` compile) — schemas live one directory up in either case.
 */
function bundledSchemaPath(name: "config" | "relations"): string {
	const here = path.dirname(fileURLToPath(import.meta.url));
	return path.resolve(here, "..", "schemas", `${name}.schema.json`);
}

// ── Substrate-dir-relative file paths ────────────────────────────────────────

/** `<resolveContextDir(cwd)>/config.json` — substrate-dir-relative; bootstrap
 * pointer at `<cwd>/.pi-context.json` declares the substrate dir per DEC-0015.
 * Previous `.project/`-fixed exemption removed — initProject writes the
 * bootstrap pointer FIRST so the resolver finds the dir before any path-builder
 * runs. */
function configPath(cwd: string): string {
	return path.join(resolveContextDir(cwd), "config.json");
}

/** `<substrateDir>/config.json` — the dir-targeted twin of `configPath`. Takes
 * the ALREADY-RESOLVED substrate dir directly (no pointer resolution), mirroring
 * the Cycle-1 `*ForDir` pattern (cf. `relationsPathForDir`). The Cycle-10
 * canonicalizer targets a non-active work-dupe substrate via this path. */
function configPathForDir(substrateDir: string): string {
	return path.join(substrateDir, "config.json");
}

/** `<resolveContextDir(cwd)>/relations.json` — same substrate-dir-relative
 * resolution as configPath; previous `.project/`-fixed exemption removed for
 * DEC-0015 compliance. */
function relationsPath(cwd: string): string {
	return path.join(resolveContextDir(cwd), "relations.json");
}

/** `<substrateDir>/relations.json` — the dir-targeted twin of `relationsPath`.
 * Takes the ALREADY-RESOLVED substrate dir directly (no pointer resolution),
 * mirroring the Cycle-1 `*ForDir` pattern. */
function relationsPathForDir(substrateDir: string): string {
	return path.join(substrateDir, "relations.json");
}

// ── Loaders ─────────────────────────────────────────────────────────────────

/**
 * Resolve the substrate root for `cwd` — pointer-canonical (DEC-0045 / FGAP-079).
 *
 * Returns `resolveContextDir(cwd)` (the `.pi-context.json` pointer dir) for ALL
 * substrate path resolution. `config.root` is NOT a path-resolution input:
 * config.json and relations.json are pinned to the pointer dir by necessity
 * (`projectRoot` must read config.json to learn `config.root`, so config.json
 * cannot itself relocate), so honoring `config.root` for blocks/schemas would
 * split the substrate across two dirs (config/relations at the pointer; blocks/
 * schemas at config.root) — incoherent. Substrate relocation is properly done
 * by flipping the pointer (future `/context migrate`, DEC-0036 step-5), which
 * moves the whole substrate coherently.
 *
 * `config.root` is retained as optional config DATA (DEC-0041 — config carries
 * the substrate dir name for display/round-trip) but is unused for resolution.
 * In practice `adoptConception` sets `config.root` == the pointer dir, so this
 * is behavior-preserving wherever the two coincide; it removes the latent
 * divergence (writes honoring config.root while reads/validation use the
 * pointer) that surfaced under FGAP-077.
 */

/**
 * Load and AJV-validate `<cwd>/.project/config.json` against the bundled
 * config.schema.json. Returns null when the file is absent. Throws
 * ValidationError on schema failure; throws Error with file context on
 * read/parse failure.
 */
export function loadConfig(cwd: string): ConfigBlock | null {
	const root = tryResolveContextDir(cwd);
	if (root === null) return null;
	return loadConfigForDir(root);
}

/**
 * Dir-targeted twin of {@link loadConfig} (Cycle-1 `*ForDir` pattern). Reads +
 * AJV-validates `<substrateDir>/config.json` against the bundled config schema
 * for the ALREADY-RESOLVED substrate dir — no `.pi-context.json` pointer
 * resolution. Returns `null` when the file is absent (a normal pre-write state).
 * `loadConfig` is a thin wrapper resolving the active pointer dir; behaviour is
 * byte-identical when called via cwd. Used by the Cycle-10 canonicalizer to read
 * a NON-active (work-dupe) substrate's config in place.
 */
export function loadConfigForDir(substrateDir: string): ConfigBlock | null {
	const p = path.join(substrateDir, "config.json");
	if (!fs.existsSync(p)) return null;
	let raw: string;
	try {
		raw = fs.readFileSync(p, "utf-8");
	} catch (err) {
		throw new Error(`loadConfigForDir: failed to read ${p}: ${err instanceof Error ? err.message : String(err)}`);
	}
	let data: unknown;
	try {
		data = JSON.parse(raw);
	} catch (err) {
		throw new Error(`loadConfigForDir: invalid JSON in ${p}: ${err instanceof Error ? err.message : String(err)}`);
	}
	validateFromFile(bundledSchemaPath("config"), data, `config.json (${p})`);
	return data as ConfigBlock;
}

// ── Installed-asset materialization (shared with installContext; DEC-0042 / FGAP-095) ──

/**
 * Destination path of an installed SCHEMA asset — `<root>/<SCHEMAS_DIR>/<name>.schema.json`.
 * `root` is the already-resolved substrate root (`projectRoot(cwd)`). This is the
 * single source of the schema-dest derivation; `installContext` and
 * `findUnmaterializedAssets` both route through it so installer and detector
 * cannot drift.
 */
export function installedSchemaDestPath(root: string, name: string): string {
	assertSubstrateName(name);
	return path.join(root, SCHEMAS_DIR, `${name}.schema.json`);
}

/** Destination path of an installed BLOCK asset — `<root>/<name>.json`. `root` is `projectRoot(cwd)`. */
export function installedBlockDestPath(root: string, name: string): string {
	assertSubstrateName(name);
	return path.join(root, `${name}.json`);
}

/**
 * The declared-but-not-materialized installed assets for `config`: the subset of
 * `config.installed_schemas` / `installed_blocks` whose destination file is
 * absent on disk. Empty arrays when everything declared is present (or nothing
 * is declared — vacuously materialized). Pure read, no copy — answers "is the
 * substrate fully installed?" via the SAME path derivation `installContext`
 * writes to, so the question and the act cannot diverge.
 */
export function findUnmaterializedAssets(cwd: string, config: ConfigBlock): { schemas: string[]; blocks: string[] } {
	const root = tryResolveContextDir(cwd);
	if (root === null) return { schemas: [], blocks: [] };
	const schemas = (config.installed_schemas ?? []).filter(
		(name) => !fs.existsSync(installedSchemaDestPath(root, name)),
	);
	const blocks = (config.installed_blocks ?? []).filter((name) => !fs.existsSync(installedBlockDestPath(root, name)));
	return { schemas, blocks };
}

/**
 * Load and AJV-validate `<cwd>/.project/relations.json`. Returns [] when the
 * file is absent. Schema shape is `Edge[]` at the top level (array, not
 * `{edges: [...]}`); the validator enforces this.
 */
export function loadRelations(cwd: string): Edge[] {
	const root = tryResolveContextDir(cwd);
	if (root === null) return [];
	return loadRelationsForDir(root);
}

/**
 * Dir-targeted twin of {@link loadRelations} (Cycle-1 `*ForDir` pattern). Reads
 * `<substrateDir>/relations.json` against the ALREADY-RESOLVED substrate dir —
 * no `.pi-context.json` pointer resolution. Returns `[]` when the file is absent;
 * AJV-validates the top-level `Edge[]` array against the bundled relations schema
 * exactly as the cwd form does. `loadRelations` is a thin wrapper resolving the
 * active pointer dir; behaviour is byte-identical when called via cwd. Used by
 * the Phase-H migration to read a NON-active substrate's edges in place.
 */
export function loadRelationsForDir(substrateDir: string): Edge[] {
	const p = relationsPathForDir(substrateDir);
	if (!fs.existsSync(p)) return [];
	let raw: string;
	try {
		raw = fs.readFileSync(p, "utf-8");
	} catch (err) {
		throw new Error(`loadRelations: failed to read ${p}: ${err instanceof Error ? err.message : String(err)}`);
	}
	let data: unknown;
	try {
		data = JSON.parse(raw);
	} catch (err) {
		throw new Error(`loadRelations: invalid JSON in ${p}: ${err instanceof Error ? err.message : String(err)}`);
	}
	validateFromFile(bundledSchemaPath("relations"), data, `relations.json (${p})`);
	return data as Edge[];
}

// ── Writers (atomic, AJV-validated against bundled schemas) ──────────────────

/**
 * Atomic, AJV-validated write of `<resolveContextDir(cwd)>/relations.json`
 * (top-level `Edge[]` array). Delegates to block-api's `writeTypedFile` against
 * the bundled relations schema. Importing `writeTypedFile` here is cycle-safe:
 * block-api imports only `resolveContextDir`-class path constants and does NOT
 * import context, so this module remains at a strictly lower layer in the read
 * direction while reaching up to block-api for the shared atomic-write surface.
 *
 * `ctx` is threaded through for attestation parity with the rest of the write
 * surface; the relations schema is a flat array and declares no envelope author
 * fields, so stamping is a structural no-op today (consistent with the
 * top-level-array stamping semantics documented in block-api).
 */
export function writeRelations(cwd: string, edges: Edge[], ctx?: DispatchContext): void {
	writeRelationsForDir(resolveContextDir(cwd), edges, ctx);
}

/**
 * Dir-targeted twin of `writeRelations` (Cycle-1 `*ForDir` pattern). Operates
 * on `<substrateDir>/relations.json` against the ALREADY-RESOLVED substrate dir
 * — no `.pi-context.json` pointer resolution. `writeRelations` is a thin
 * wrapper resolving the active dir; behaviour is byte-identical when called via
 * cwd. AJV-shape validation comes from `writeTypedFile`; same attestation-parity
 * no-op semantics as the cwd form.
 */
export function writeRelationsForDir(substrateDir: string, edges: Edge[], ctx?: DispatchContext): void {
	writeTypedFile(relationsPathForDir(substrateDir), bundledSchemaPath("relations"), edges, ctx, "relations.json");
}

/**
 * Composite identity of an edge for append-if-absent dedup: the
 * (parent, child, relation_type) triple. `ordinal` is intentionally NOT part
 * of identity — two edges differing only in `ordinal` are the same relationship
 * for dedup purposes (re-filing with a different sibling-order is a no-op, not a
 * second edge). The space separator is safe because none of the three id
 * components contains a space in any registered substrate vocabulary.
 */
const identityKey = (e: unknown): string => {
	const r = e as Edge;
	return `${endpointIdentity(r.parent)} ${endpointIdentity(r.child)} ${r.relation_type}`;
};

/**
 * Append closure-table edges to `<resolveContextDir(cwd)>/relations.json`,
 * skipping any whose (parent, child, relation_type) triple already exists
 * on-disk OR appears earlier in this same batch. The write-twin of
 * `writeRelations` (whole-file replace) for the additive case. Creates
 * relations.json (flat `Edge[]` array) when absent.
 *
 * Guards are DEFERRED to `validateContext` by design: this surface performs
 * only AJV-shape validation (whole-array against the relations schema) and the
 * exact-duplicate-no-op above. Reference integrity — endpoints resolve,
 * relation_type is registered, no cycle under hierarchy relation_types — is NOT
 * checked here. This is forced by the layer graph: `appendRelations` lives in
 * context, which imports only block-api; endpoint resolution needs
 * `buildIdIndex` from context-sdk, and importing context-sdk here would invert
 * the dependency direction. Registration / endpoint / cycle violations are
 * caught later by `validateContext`.
 *
 * `ctx` is threaded for attestation parity with `writeRelations`; the relations
 * schema is a flat array with no envelope author fields, so stamping is a
 * structural no-op today (consistent with the top-level-array stamping
 * semantics documented in block-api).
 */
export function appendRelations(
	cwd: string,
	edges: Edge[],
	ctx?: DispatchContext,
): { appended: number; skipped: number } {
	return appendRelationsForDir(resolveContextDir(cwd), edges, ctx);
}

/**
 * Dir-targeted twin of `appendRelations` (Cycle-1 `*ForDir` pattern). Operates
 * on `<substrateDir>/relations.json` against the ALREADY-RESOLVED substrate dir
 * — no pointer resolution. `appendRelations` is a thin wrapper resolving the
 * active dir; behaviour is byte-identical when called via cwd. Same deferred-
 * guard semantics: only AJV-shape validation + the (parent, child,
 * relation_type) exact-duplicate-no-op; relation_type registration / endpoint
 * resolution / cycle checks remain deferred to `validateContext`.
 */
export function appendRelationsForDir(
	substrateDir: string,
	edges: Edge[],
	ctx?: DispatchContext,
): { appended: number; skipped: number } {
	return appendManyToTypedFileIfAbsent(
		relationsPathForDir(substrateDir),
		bundledSchemaPath("relations"),
		null,
		edges,
		identityKey,
		ctx,
		"relations.json",
	);
}

/**
 * Append a single closure-table edge. Convenience over `appendRelations`:
 * returns `{ appended }` reflecting whether the edge was new (true) or an
 * exact (parent, child, relation_type) duplicate of an existing edge (false →
 * no-op). Same deferred-guard semantics as `appendRelations`.
 */
export function appendRelation(cwd: string, edge: Edge, ctx?: DispatchContext): { appended: boolean } {
	return appendRelationForDir(resolveContextDir(cwd), edge, ctx);
}

/**
 * Dir-targeted twin of `appendRelation` (Cycle-1 `*ForDir` pattern). Operates
 * on `<substrateDir>/relations.json` against the ALREADY-RESOLVED substrate dir.
 * `appendRelation` is a thin wrapper resolving the active dir; behaviour is
 * byte-identical when called via cwd. Same `{ appended }` semantics + deferred
 * guards as `appendRelationsForDir`.
 */
export function appendRelationForDir(substrateDir: string, edge: Edge, ctx?: DispatchContext): { appended: boolean } {
	const r = appendRelationsForDir(substrateDir, [edge], ctx);
	return { appended: r.appended > 0 };
}

/**
 * Atomic, AJV-validated write of `<resolveContextDir(cwd)>/config.json`.
 * Delegates to block-api's `writeTypedFile` against the bundled config schema.
 * Same cycle-safety reasoning as `writeRelations`.
 */
export function writeConfig(cwd: string, config: ConfigBlock, ctx?: DispatchContext): void {
	writeConfigForDir(resolveContextDir(cwd), config, ctx);
}

/**
 * Dir-targeted twin of `writeConfig` (Cycle-1 `*ForDir` pattern). Atomic,
 * AJV-validated write of `<substrateDir>/config.json` against the bundled config
 * schema for the ALREADY-RESOLVED substrate dir — no pointer resolution.
 * `writeConfig` is a thin wrapper resolving the active dir; behaviour is
 * byte-identical when called via cwd. Same attestation-parity no-op semantics as
 * the cwd form (the config schema declares no envelope author fields).
 */
export function writeConfigForDir(substrateDir: string, config: ConfigBlock, ctx?: DispatchContext): void {
	writeTypedFile(configPathForDir(substrateDir), bundledSchemaPath("config"), config, ctx, "config.json");
}

/**
 * A config is a SKELETON when it carries NO vocabulary content — the minimal
 * schema-valid shape that `initProject` / `switchAndCreate` write so a substrate
 * has a tool-driven config from bootstrap (FGAP-001 / DEC-0001). Identity /
 * scaffold fields (`schema_version`, `root`, `substrate_id`) are IGNORED here —
 * a skeleton can carry a minted `substrate_id` and still be empty of vocabulary.
 *
 * Used by `adoptConception` (accept-all overwrites a skeleton but never a
 * populated config) and `deriveBootstrapState` (a skeleton config is the
 * `skeleton` bootstrap state — onward paths: accept-all OR amend/edit).
 */
export function isSkeletonConfig(config: ConfigBlock): boolean {
	// A skeleton carries NO vocabulary content in ANY registry. The ONLY fields
	// permitted to be present in a skeleton are the identity / scaffold scalars
	// `schema_version`, `root`, `substrate_id` — EVERY other config field (every
	// registry) must be empty/absent. Derive the registry set from
	// `REGISTRY_DESCRIPTORS` (the single source enumerating all addressable
	// registries) so a registry added there is automatically covered here; the
	// descriptor `kind` dictates the emptiness test: `map` → no own keys; every
	// array kind (`keyed-array` / `string-array` / `value-array`) → zero length.
	for (const [registry, descriptor] of Object.entries(REGISTRY_DESCRIPTORS) as [AmendRegistry, RegistryDescriptor][]) {
		const value = config[registry];
		if (descriptor.kind === "map") {
			if (Object.keys((value ?? {}) as Record<string, unknown>).length > 0) {
				return false;
			}
		} else if (((value ?? []) as unknown[]).length > 0) {
			return false;
		}
	}
	return true;
}

/**
 * Write the minimal schema-valid SKELETON config to the active substrate's
 * `config.json` (FGAP-001 / DEC-0001) — pointer-resolving like `adoptConception`:
 * resolves the substrate dir from the `.pi-context.json` pointer. NEVER-CLOBBER:
 * returns `{ written: false }` without writing when a config already exists, so a
 * populated (or already-skeleton) config is preserved. Otherwise builds
 * `{ schema_version: "1.0.0", block_kinds: [], root, substrate_id: <minted> }`
 * and writes it via `writeConfigForDir` (atomic tmp+rename + whole-config AJV).
 *
 * The skeleton mints its `substrate_id` via `mintSubstrateId` — the SAME function
 * `adoptConception` uses — and registers it in the project-root registry via
 * `registerSubstrate` (the SAME registration call `adoptConception` makes), so the
 * substrate carries content-addressed identity from bootstrap and the id is
 * resolvable project-wide. A later accept-all that overwrites the skeleton READS
 * and PRESERVES this on-disk id (see `adoptConception`), so identity is stable
 * across `init → accept-all`. `schema_version` is the "1.0.0" literal the packaged
 * `samples/conception.json` declares.
 *
 * The TS `ConfigBlock` type requires fields beyond the runtime AJV authority
 * (`schemas/config.schema.json` requires only `schema_version` + `block_kinds`),
 * so the skeleton is cast `as unknown as ConfigBlock` — runtime validation in
 * `writeConfigForDir` enforces only the schema.
 */
export function writeSkeletonConfig(cwd: string, ctx?: DispatchContext): { written: boolean } {
	const substrateDir = resolveContextDir(cwd); // throws BootstrapNotFoundError if no pointer
	const root = path.relative(cwd, substrateDir);
	if (loadConfig(cwd) !== null) {
		return { written: false };
	}
	const substrate_id = mintSubstrateId();
	const skeleton = {
		schema_version: "1.0.0",
		block_kinds: [],
		root,
		substrate_id,
	} as unknown as ConfigBlock;
	writeConfigForDir(substrateDir, skeleton, ctx);
	registerSubstrate(cwd, substrate_id, root, []);
	return { written: true };
}

/**
 * Result shape from `adoptConception`. `adopted` is false (no-op) when a config
 * already exists; `schemaCount` / `blockCount` then report the EXISTING config's
 * declared counts. `configPath` / `root` are relative-to-cwd display paths.
 */
export interface AdoptResult {
	adopted: boolean;
	configPath: string;
	root: string;
	schemaCount: number;
	blockCount: number;
}

/**
 * accept-all: adopt the package's canonical packaged conception
 * (samples/conception.json) as this substrate's config.json (DEC-0037 / DEC-0038
 * accept-all mode). Writes config ONLY (does not install assets — run
 * installContext after). Idempotent: never clobbers an existing config
 * (DEC-0011/0038 offer-don't-impose). The conception ships NO root (it is a
 * template, not an instance — DEC-0041/FGAP-094); this function SETS root to the
 * ACTUAL substrate dir name (resolved from the .pi-context.json pointer) on the
 * adopted config. Validated via writeConfig (whole-config AJV).
 */
export function adoptConception(cwd: string): AdoptResult {
	const contextDirAbs = resolveContextDir(cwd); // throws BootstrapNotFoundError if no pointer
	const root = path.relative(cwd, contextDirAbs);
	const cfgPath = configPath(cwd);
	const existing = loadConfig(cwd);
	// Never-clobber a POPULATED config (DEC-0011/0038 offer-don't-impose). A
	// SKELETON config (FGAP-001 / DEC-0001 — written by init / switch -c, empty of
	// vocabulary) IS overwritten by the catalog: it carries no vocabulary to
	// protect, and the existing on-disk substrate_id is read + preserved below.
	if (existing && !isSkeletonConfig(existing)) {
		return {
			adopted: false,
			configPath: path.relative(cwd, cfgPath),
			root,
			schemaCount: (existing.installed_schemas ?? []).length,
			blockCount: (existing.installed_blocks ?? []).length,
		};
	}
	const here = path.dirname(fileURLToPath(import.meta.url));
	const samplesRoot = path.resolve(here, "..", "samples");
	const conception = JSON.parse(fs.readFileSync(path.join(samplesRoot, "conception.json"), "utf-8")) as ConfigBlock;
	conception.root = root; // SET root from the resolved substrate dir — the conception template ships none (DEC-0041)

	// Resolve + register the per-substrate content-addressed substrate_id.
	// config.json is the SoT for substrate_id. When a SKELETON config already
	// exists (init / switch -c minted + registered an id), accept-all PRESERVES
	// that on-disk id so identity is stable across `init → accept-all`. With no
	// prior config (a fresh accept-all reaching here, `existing` null), mint a new
	// id — the packaged conception ships none. registerSubstrate then upserts the
	// active substrate into the project-root registry under `root` (the
	// project-root-relative substrate dir) with empty aliases; for the preserved-id
	// case it re-upserts the SAME id idempotently. The SoT-drift invariant in
	// validateContext then passes for this substrate.
	conception.substrate_id =
		existing?.substrate_id && existing.substrate_id.length > 0 ? existing.substrate_id : mintSubstrateId();
	writeConfig(cwd, conception);
	registerSubstrate(cwd, conception.substrate_id, root, []);
	return {
		adopted: true,
		configPath: path.relative(cwd, cfgPath),
		root,
		schemaCount: (conception.installed_schemas ?? []).length,
		blockCount: (conception.installed_blocks ?? []).length,
	};
}

// ── Scoped config amend (FGAP-076 / DEC-0019/0020 A2) ─────────────────────────

/**
 * Storage shape of a config registry, dictating how `amendConfigEntry` locates,
 * guards, and mutates an entry:
 *  - `keyed-array`: array of objects keyed by an id field (`idField`).
 *  - `map`: object map (key → value); the entry IS the value.
 *  - `string-array`: array of strings; the key IS the value (no separate entry).
 *  - `value-array`: array of objects with no single id field; identity is the
 *    canonical join of structural fields (only `hierarchy` today).
 */
type RegistryKind = "keyed-array" | "map" | "string-array" | "value-array";

interface RegistryDescriptor {
	kind: RegistryKind;
	/** id field for `keyed-array` registries; absent for the other kinds. */
	idField?: string;
}

/**
 * Per-registry storage descriptors. Drives the kind-dispatch in
 * `amendConfigEntry`; the keys enumerate every addressable `AmendRegistry`.
 */
const REGISTRY_DESCRIPTORS: Record<AmendRegistry, RegistryDescriptor> = {
	block_kinds: { kind: "keyed-array", idField: "canonical_id" },
	relation_types: { kind: "keyed-array", idField: "canonical_id" },
	lenses: { kind: "keyed-array", idField: "id" },
	layers: { kind: "keyed-array", idField: "id" },
	invariants: { kind: "keyed-array", idField: "id" },
	status_buckets: { kind: "map" },
	display_strings: { kind: "map" },
	naming: { kind: "map" },
	installed_schemas: { kind: "string-array" },
	installed_blocks: { kind: "string-array" },
	hierarchy: { kind: "value-array" },
	tool_operations: { kind: "keyed-array", idField: "canonical_id" },
	tool_operations_forbidden: { kind: "string-array" },
};

/** Canonical identity join for a hierarchy triple (the `value-array` kind). */
function hierarchyKey(h: { parent_block: string; child_block: string; relation_type: string }): string {
	return `${h.parent_block} ${h.child_block} ${h.relation_type}`;
}

/**
 * Scoped add / replace / remove of ONE entry in ONE config registry.
 *
 * Two guard tiers, both decidable here:
 *  1. OP-CORRECTNESS (local, in-config invariants — the analog of
 *     rename-canonical-id's existence/collision guards): `add` requires the key
 *     ABSENT (collision → throw); `replace` / `remove` require it PRESENT
 *     (missing → throw). Every such throw fires BEFORE any write, so a guard
 *     failure leaves config.json byte-untouched.
 *  2. SHAPE: automatic + free via `writeConfig`'s whole-config AJV validation —
 *     a malformed entry (e.g. a relation_type missing its required `category`,
 *     or a status_bucket value outside the enum) fails the write and throws
 *     ValidationError, again leaving the file unchanged (atomic tmp+rename).
 *
 * Cross-registry referential integrity (removing a relation_type / lens / layer
 * / block_kind that is still referenced by an edge or another registry) is
 * DEFERRED to `validateContext` by design — the same layer-graph constraint that
 * defers `appendRelation`'s integrity checks (this module imports only block-api;
 * referential checks need buildIdIndex from context-sdk, which would invert the
 * dependency). `remove` therefore emits NO write-time warning.
 *
 * Mutation works on a deep clone of the loaded config (the
 * load → JSON.parse(JSON.stringify(config)) → mutate → writeConfig precedent
 * from rename-canonical-id); the original is never touched until the single
 * `writeConfig` at the end (skipped under `dryRun`).
 *
 * `ctx` is forwarded to `writeConfig` for attestation parity with the rest of
 * the write surface; the config schema declares no envelope author fields, so
 * stamping is a structural no-op today (consistent with `writeConfig`).
 *
 * @param registry  one of the eleven `AmendRegistry` names (validated; scalars
 *                  `schema_version` / `root` are rejected as non-registries).
 * @param operation `add` | `replace` | `remove` (validated).
 * @param key       the entry key — id for keyed-array, map key for map, the
 *                  string value for string-array, a JSON-encoded triple for the
 *                  hierarchy value-array.
 * @param entry     the entry payload: object for keyed-array / value-array, the
 *                  value for map; required for `add` / `replace`, omitted for
 *                  `remove`. For string-array, when provided it must equal `key`.
 * @throws Error on unknown registry / operation, missing entry for add/replace,
 *         absent config, OP-CORRECTNESS violation, or key/entry divergence.
 * @throws ValidationError (from `writeConfig`) on a SHAPE violation.
 */
export function amendConfigEntry(
	cwd: string,
	registry: string,
	operation: string,
	key: string,
	entry?: unknown,
	ctx?: DispatchContext,
	opts?: { dryRun?: boolean },
): AmendResult {
	return amendConfigEntryForDir(resolveContextDir(cwd), registry, operation, key, entry, ctx, opts);
}

/**
 * Dir-targeted twin of `amendConfigEntry` (Cycle-1 `*ForDir` pattern). Carries
 * the FULL scoped add / replace / remove body; `amendConfigEntry` delegates here
 * via `resolveContextDir(cwd)`, so a cwd call is byte-identical to a ForDir call
 * on the resolved active dir. Targets `<substrateDir>/config.json` directly via
 * `loadConfigForDir` / `writeConfigForDir` (NO pointer resolution) so the
 * Cycle-10 canonicalizer can register block_kinds / relation_types into a
 * non-active work-dupe substrate in place. Both guard tiers
 * (OP-CORRECTNESS + SHAPE-via-AJV) and the deep-clone-then-write-once discipline
 * are identical to the documented `amendConfigEntry` contract above.
 */
export function amendConfigEntryForDir(
	substrateDir: string,
	registry: string,
	operation: string,
	key: string,
	entry?: unknown,
	ctx?: DispatchContext,
	opts?: { dryRun?: boolean },
): AmendResult {
	// (1) Discriminator validation.
	const descriptor = REGISTRY_DESCRIPTORS[registry as AmendRegistry] as RegistryDescriptor | undefined;
	if (!descriptor) {
		const addressable = Object.keys(REGISTRY_DESCRIPTORS).join(" | ");
		throw new Error(
			`amendConfigEntry: unknown registry '${registry}' — addressable registries: ${addressable} (scalars schema_version / root are not registries)`,
		);
	}
	if (operation !== "add" && operation !== "replace" && operation !== "remove") {
		throw new Error(`amendConfigEntry: unknown operation '${operation}' — expected add | replace | remove`);
	}
	const op = operation as AmendOperation;
	const reg = registry as AmendRegistry;
	// string-array registries (installed_schemas/installed_blocks) carry the value
	// AS the key, so add needs no separate entry payload; every other kind does.
	if ((op === "add" || op === "replace") && entry === undefined && descriptor.kind !== "string-array") {
		throw new Error(`amendConfigEntry: operation '${op}' requires an entry payload`);
	}

	// (2) Load + (3) deep clone (mutate the clone, write once at the end).
	const config = loadConfigForDir(substrateDir);
	if (!config) {
		throw new Error("amendConfigEntry: no config.json");
	}
	const nextConfig = JSON.parse(JSON.stringify(config)) as ConfigBlock;
	// `nc` is the untyped view used for dynamic-registry indexing below.
	const nc = nextConfig as unknown as Record<string, unknown>;

	let modified = false;
	let previousValue: unknown;

	// (4) Locate + OP-CORRECTNESS-guard + mutate the clone, per descriptor kind.
	if (descriptor.kind === "keyed-array") {
		const idField = descriptor.idField as string;
		const arr = (nc[reg] as Array<Record<string, unknown>> | undefined) ?? [];
		const idx = arr.findIndex((e) => e[idField] === key);
		const present = idx !== -1;
		if (op === "add" || op === "replace") {
			const obj = entry as Record<string, unknown>;
			if (!obj || typeof obj !== "object" || obj[idField] !== key) {
				throw new Error(
					`amendConfigEntry: entry.${idField} (${
						obj && typeof obj === "object" ? String(obj[idField]) : "missing"
					}) must equal key (${key}) for registry '${reg}'`,
				);
			}
		}
		if (op === "add") {
			if (present) throw new Error(`amendConfigEntry: add collision — ${reg}[${idField}=${key}] already exists`);
			if (!Array.isArray(nc[reg])) nc[reg] = [];
			(nc[reg] as Array<Record<string, unknown>>).push(entry as Record<string, unknown>);
			modified = true;
		} else if (op === "replace") {
			if (!present) throw new Error(`amendConfigEntry: replace target missing — ${reg}[${idField}=${key}] not found`);
			previousValue = arr[idx];
			arr.splice(idx, 1, entry as Record<string, unknown>);
			modified = true;
		} else {
			if (!present) throw new Error(`amendConfigEntry: remove target missing — ${reg}[${idField}=${key}] not found`);
			previousValue = arr[idx];
			arr.splice(idx, 1);
			modified = true;
		}
	} else if (descriptor.kind === "map") {
		const m = (nc[reg] as Record<string, unknown> | undefined) ?? {};
		const present = Object.hasOwn(m, key);
		if (op === "add" || op === "replace") {
			if (op === "add" && present) throw new Error(`amendConfigEntry: add collision — ${reg}[${key}] already exists`);
			if (op === "replace" && !present) {
				throw new Error(`amendConfigEntry: replace target missing — ${reg}[${key}] not found`);
			}
			previousValue = present ? m[key] : undefined;
			if (!nc[reg]) nc[reg] = {};
			(nc[reg] as Record<string, unknown>)[key] = entry;
			modified = true;
		} else {
			if (!present) throw new Error(`amendConfigEntry: remove target missing — ${reg}[${key}] not found`);
			previousValue = m[key];
			delete (nc[reg] as Record<string, unknown>)[key];
			modified = true;
		}
	} else if (descriptor.kind === "string-array") {
		const arr = (nc[reg] as string[] | undefined) ?? [];
		if (entry !== undefined && entry !== key) {
			throw new Error(`amendConfigEntry: entry (${String(entry)}) must equal key (${key}) for string-array '${reg}'`);
		}
		const present = arr.includes(key);
		if (op === "add") {
			if (present) throw new Error(`amendConfigEntry: add collision — ${reg} already contains '${key}'`);
			if (!Array.isArray(nc[reg])) nc[reg] = [];
			(nc[reg] as string[]).push(key);
			modified = true;
		} else if (op === "replace") {
			throw new Error(
				`amendConfigEntry: replace is meaningless for string-array '${reg}' (value IS the key) — use remove + add`,
			);
		} else {
			if (!present) throw new Error(`amendConfigEntry: remove target missing — ${reg} does not contain '${key}'`);
			previousValue = key;
			nc[reg] = arr.filter((v) => v !== key);
			modified = true;
		}
	} else {
		// value-array (hierarchy): identity is the canonical (parent,child,relation_type) join.
		let target: { parent_block: string; child_block: string; relation_type: string };
		try {
			target = JSON.parse(key) as { parent_block: string; child_block: string; relation_type: string };
		} catch (err) {
			throw new Error(
				`amendConfigEntry: key for value-array '${reg}' must be a JSON {parent_block, child_block, relation_type}: ${
					err instanceof Error ? err.message : String(err)
				}`,
			);
		}
		const arr =
			(nc[reg] as Array<{ parent_block: string; child_block: string; relation_type: string }> | undefined) ?? [];
		if (op === "add" || op === "replace") {
			const obj = entry as { parent_block: string; child_block: string; relation_type: string };
			if (!obj || typeof obj !== "object" || hierarchyKey(obj) !== hierarchyKey(target)) {
				throw new Error(`amendConfigEntry: entry must hk-match key (${key}) for value-array '${reg}'`);
			}
		}
		const idx = arr.findIndex((e) => hierarchyKey(e) === hierarchyKey(target));
		const present = idx !== -1;
		if (op === "add") {
			if (present) throw new Error(`amendConfigEntry: add collision — ${reg} already contains ${key}`);
			if (!Array.isArray(nc[reg])) nc[reg] = [];
			(nc[reg] as Array<unknown>).push(entry);
			modified = true;
		} else if (op === "replace") {
			if (!present) throw new Error(`amendConfigEntry: replace target missing — ${reg} has no ${key}`);
			previousValue = arr[idx];
			arr.splice(idx, 1, entry as { parent_block: string; child_block: string; relation_type: string });
			modified = true;
		} else {
			if (!present) throw new Error(`amendConfigEntry: remove target missing — ${reg} has no ${key}`);
			previousValue = arr[idx];
			arr.splice(idx, 1);
			modified = true;
		}
	}

	// (5) SHAPE validation + single config write. Under dryRun we still validate
	// the would-be-written config against the SAME schema writeConfig uses (so a
	// dry-run surfaces shape errors), but write nothing — keeping ONE validation
	// path (no parallel re-implementation of the op for dry-run previews).
	if (modified) {
		if (opts?.dryRun) {
			validateFromFile(bundledSchemaPath("config"), nextConfig, "config.json (dry-run)");
		} else {
			writeConfigForDir(substrateDir, nextConfig, ctx);
		}
	}

	// (6) Outcome.
	return {
		modified,
		operation: op,
		registry: reg,
		key,
		...(previousValue !== undefined ? { previousValue } : {}),
	};
}

// ── ContextData mtime cache ───────────────────────────────────────────────

interface CacheEntry {
	configMtimeMs: number;
	relationsMtimeMs: number;
	/** mtime of `<cwd>/.pi-context.json` at cache-population time; cache
	 * invalidates when the bootstrap pointer's mtime changes so a per-cwd
	 * substrate-dir relocation (rare; future `/context migrate`) is picked
	 * up without an explicit cache flush. Tracked as `safeMtimeMs` so a
	 * transient absence reads as `0` rather than throwing. */
	bootstrapMtimeMs: number;
	value: ContextData;
}

const contextCache = new Map<string, CacheEntry>();

/** Return mtime of file in ms, or 0 when absent. Catches ENOENT to keep
 * "missing" indistinguishable from "never modified" without throwing. */
function safeMtimeMs(p: string): number {
	try {
		return fs.statSync(p).mtimeMs;
	} catch {
		return 0;
	}
}

/**
 * Cached `(loadConfig, loadRelations)` pair, keyed by absolute cwd. Cache
 * invalidates when either `config.json` or `relations.json` mtime changes —
 * deleting the file (mtime → 0) also invalidates so a config-removal is
 * picked up. Direct, intentional cache flush is not exposed; tests that
 * need to bypass call `loadConfig`/`loadRelations` directly.
 */
export function loadContext(cwd: string): ContextData {
	const key = path.resolve(cwd);
	const bMtime = safeMtimeMs(path.join(cwd, ".pi-context.json"));
	// Chokepoint guard (FGAP-074 C3): when no `.pi-context.json` bootstrap
	// pointer resolves, `configPath`/`relationsPath` would throw
	// BootstrapNotFoundError. Degrade to an empty context instead so READ /
	// VALIDATE / SNAPSHOT callers reaching here indirectly
	// (validateContext → resolveStatusVocabulary → loadContext, currentState,
	// etc.) survive pointer-less. Cached by the absent bootstrap mtime so the
	// degraded value invalidates the instant a pointer lands.
	const root = tryResolveContextDir(cwd);
	if (root === null) {
		const hit = contextCache.get(key);
		if (hit && hit.bootstrapMtimeMs === bMtime && hit.configMtimeMs === 0 && hit.relationsMtimeMs === 0) {
			return hit.value;
		}
		const value: ContextData = { config: null, relations: [] };
		contextCache.set(key, {
			bootstrapMtimeMs: bMtime,
			configMtimeMs: 0,
			relationsMtimeMs: 0,
			value,
		});
		return value;
	}
	const cMtime = safeMtimeMs(configPath(cwd));
	const rMtime = safeMtimeMs(relationsPath(cwd));
	const hit = contextCache.get(key);
	if (hit && hit.bootstrapMtimeMs === bMtime && hit.configMtimeMs === cMtime && hit.relationsMtimeMs === rMtime) {
		return hit.value;
	}
	const value: ContextData = {
		config: loadConfig(cwd),
		relations: loadRelations(cwd),
	};
	contextCache.set(key, {
		bootstrapMtimeMs: bMtime,
		configMtimeMs: cMtime,
		relationsMtimeMs: rMtime,
		value,
	});
	return value;
}

// ── Edge synthesis + lens projection ─────────────────────────────────────────

/**
 * Synthesize edges from a per-item field for a derived lens. Returns [] when
 * `lens.derived_from_field` is null / undefined (caller should source edges
 * from authored relations instead).
 */
export function synthesizeFromField(lens: LensSpec, items: ItemRecord[]): Edge[] {
	if (lens.derived_from_field === null || lens.derived_from_field === undefined) return [];
	const field = lens.derived_from_field;
	const relationType = lens.relation_type ?? lens.id;
	const out: Edge[] = [];
	for (const item of items) {
		const v = item[field];
		if (typeof v === "string") {
			out.push({ parent: v, child: item.id, relation_type: relationType });
		}
	}
	return out;
}

/**
 * Edges visible to traversal/projection for a given lens. Auto-derived lens →
 * edges synthesized from items at read-time. Hand-curated lens → filter
 * authored edges by relation_type.
 */
export function edgesForLens(lens: LensSpec, items: ItemRecord[], authoredEdges: Edge[]): Edge[] {
	if (lens.derived_from_field !== null && lens.derived_from_field !== undefined) {
		return synthesizeFromField(lens, items);
	}
	const relationType = lens.relation_type ?? lens.id;
	return authoredEdges.filter((e) => e.relation_type === relationType);
}

/**
 * Walk descendants of `parentId` along edges of a given relation_type. Cycle-
 * safe via a visited-set: revisit short-circuits, so a back-edge does not
 * loop, but `validateRelations` is the surface that flags the cycle.
 */
export function walkDescendants(parentId: string, relationType: string, edges: Edge[]): string[] {
	const out: string[] = [];
	const visited = new Set<string>();
	const stack = [parentId];
	while (stack.length > 0) {
		const node = stack.pop();
		if (node === undefined || visited.has(node)) continue;
		visited.add(node);
		for (const e of edges) {
			if (endpointKey(e.parent) === node && e.relation_type === relationType) {
				const childKey = endpointKey(e.child);
				out.push(childKey);
				stack.push(childKey);
			}
		}
	}
	return out;
}

/**
 * Walk ancestors of `itemId` along edges of a given relation_type — the
 * reverse-direction traversal of walkDescendants. Iterates edges where
 * `e.child === node && e.relation_type === relationType` and recurses on
 * `e.parent`. Cycle-safe via a visited-set mirroring walkDescendants:
 * revisit short-circuits, so a back-edge does not loop, but
 * `validateRelations` is the surface that flags the cycle.
 *
 * Returns the ancestor id list (may include multiple distinct parents
 * when the closure-table edge set is a DAG with merges). Order is
 * traversal-order (closest ancestors first) matching walkDescendants'
 * BFS-like semantic; callers MUST treat the result as a set or sort if
 * deterministic order is required.
 *
 * Pure function — operates on the Edge[] argument; does NOT read substrate.
 */
export function walkAncestors(itemId: string, relationType: string, edges: Edge[]): string[] {
	const out: string[] = [];
	const visited = new Set<string>();
	const stack = [itemId];
	while (stack.length > 0) {
		const node = stack.pop();
		if (node === undefined || visited.has(node)) continue;
		visited.add(node);
		for (const e of edges) {
			if (endpointKey(e.child) === node && e.relation_type === relationType) {
				const parentKey = endpointKey(e.parent);
				out.push(parentKey);
				stack.push(parentKey);
			}
		}
	}
	return out;
}

/**
 * Find all closure-table edges incident on `itemId`, returning the full
 * Edge[] records — NOT id arrays. Distinguishing semantic vs walkDescendants
 * and walkAncestors which return string[] id chains for traversal; this
 * primitive surfaces edge-level inspection (relation_type + ordinal preserved
 * per record) for callers that need the relationship-typed view rather than
 * the projected id set.
 *
 * Direction semantics:
 *   "inbound"  — edges where `e.child === itemId` (edges pointing AT itemId)
 *   "outbound" — edges where `e.parent === itemId` (edges FROM itemId)
 *   "both"     — union of inbound + outbound (default).
 *
 * Self-loop handling: an edge with `parent === child === itemId` is a
 * self-loop. Under "both" direction such an edge matches BOTH the inbound
 * and outbound filters. The implementation iterates edges once with a
 * single inclusion predicate per direction, so a self-loop is returned
 * EXACTLY ONCE under "both" — never duplicated. This is the cleaner
 * option: callers reasoning about reference-uniqueness do not need to
 * dedup, and an edge identity in relations.json maps to a single result
 * record.
 *
 * Multiple relation_types between the same (parent, child) pair preserve
 * as DISTINCT result entries — each edge is a separate relationship
 * record, queries on it must not collapse.
 *
 * Pure function — operates on the Edge[] argument; does NOT read substrate.
 */
export function findReferences(
	itemId: string,
	edges: Edge[],
	direction: "inbound" | "outbound" | "both" = "both",
): Edge[] {
	if (direction === "inbound") {
		return edges.filter((e) => endpointKey(e.child) === itemId);
	}
	if (direction === "outbound") {
		return edges.filter((e) => endpointKey(e.parent) === itemId);
	}
	// "both": single-pass predicate; self-loop matches once via the OR.
	return edges.filter((e) => endpointKey(e.child) === itemId || endpointKey(e.parent) === itemId);
}

/**
 * Project items into bins under a lens. Items reachable through `lensEdges`
 * with parent ∈ `lens.bins` go to that bin; remaining items go to
 * "(uncategorized)". Caller picks whether to include the uncategorized
 * bucket via `lens.render_uncategorized`.
 */
export function groupByLens(items: ItemRecord[], lens: LensSpec, lensEdges: Edge[]): Map<string, ItemRecord[]> {
	const grouped = new Map<string, ItemRecord[]>();
	for (const bin of lens.bins) grouped.set(bin, []);
	grouped.set("(uncategorized)", []);

	const itemById = new Map(items.map((i) => [i.id, i]));
	const placedIds = new Set<string>();
	for (const e of lensEdges) {
		const item = itemById.get(endpointKey(e.child));
		// Parent bin label: a structured {kind:"lens_bin"} contributes its bin; a
		// legacy string parent stays bin-or-item-ambiguous and is resolved by
		// `lens.bins.includes` (endpointBin is null for strings → fall back to the
		// string key). A structured ITEM parent (endpointBin null, non-bin key)
		// simply fails the includes test and is left for the (uncategorized) pass.
		const binLabel = endpointBin(e.parent) ?? endpointKey(e.parent);
		if (item && lens.bins.includes(binLabel)) {
			grouped.get(binLabel)?.push(item);
			placedIds.add(item.id);
		}
	}
	for (const item of items) {
		if (!placedIds.has(item.id)) grouped.get("(uncategorized)")?.push(item);
	}
	return grouped;
}

// ── Display name resolution ──────────────────────────────────────────────────

/**
 * Universal display-name lookup. Resolution order:
 *   1. `cfg.naming[canonicalId]` if present (explicit alias)
 *   2. matching `block_kinds[].display_name` whose `canonical_id` matches
 *   3. canonical id itself (POC A identity-vs-display decoupling)
 */
export function displayName(cfg: ConfigBlock | null, canonicalId: string): string {
	if (!cfg) return canonicalId;
	if (cfg.naming && Object.hasOwn(cfg.naming, canonicalId)) {
		return cfg.naming[canonicalId];
	}
	for (const bk of cfg.block_kinds) {
		if (bk.canonical_id === canonicalId) return bk.display_name;
	}
	return canonicalId;
}

// ── Curation surface (uncategorized listing) ─────────────────────────────────

/**
 * List items that fell to the (uncategorized) bucket plus a template for
 * emitting append-block-item payloads. Suggestion intentionally carries the
 * edge payload only — the calling ceremony decides which bin to file under.
 */
export function listUncategorized(
	lens: LensSpec,
	grouped: Map<string, ItemRecord[]>,
): {
	uncategorized: ItemRecord[];
	suggestionTemplate: (binName: string, item: ItemRecord) => CurationSuggestion;
} {
	const uncategorized = grouped.get("(uncategorized)") ?? [];
	const relationType = lens.relation_type ?? lens.id;
	const suggestionTemplate = (binName: string, item: ItemRecord): CurationSuggestion => ({
		payload: { parent: binName, child: item.id, relation_type: relationType },
		reason: `item '${item.id}' falls outside lens '${lens.id}' bins; suggested placement '${binName}'`,
	});
	return { uncategorized, suggestionTemplate };
}

// ── validateRelations ────────────────────────────────────────────────────────

/**
 * Validate authored edges against `config` registries (lenses + hierarchy +
 * relation_types) and the cross-block id index supplied by the caller.
 * Emits seven structured issue codes:
 *   - edge_unknown_relation_type
 *   - edge_parent_not_in_bins (lens edges)
 *   - edge_unresolved_parent / edge_parent_wrong_block (hierarchy edges)
 *   - edge_unresolved_child / edge_child_wrong_block (lens or hierarchy)
 *   - edge_cycle_detected (DFS recursion-stack on hierarchy relation_types)
 *
 * `itemsByBlock` is indexed by `BlockKindDecl.canonical_id` for hierarchy
 * checks (parent / child must reside in the declared block) and by
 * `LensSpec.target` for lens checks. Callers supply the index — this
 * module does not read blocks itself, keeping it independent of block-api.
 */
/**
 * Minimal structural view of an F2 resolver result consumed by
 * {@link validateRelations}. Mirrors `context-sdk`'s `ResolvedRef` for the two
 * fields this module reads (`status` + `loc.block`) WITHOUT importing
 * context-sdk (the layering constraint: context.ts may not import context-sdk).
 * The caller (validateContext) passes a closure returning the full ResolvedRef,
 * which is structurally assignable to this view.
 */
export interface RelationResolveView {
	status: "active" | "foreign" | "dangling" | "unregistered";
	loc?: { block: string };
}

export function validateRelations(
	config: ConfigBlock,
	relations: Edge[],
	itemsByBlock: Record<string, ItemRecord[]>,
	resolve?: (ref: RawEndpoint) => RelationResolveView,
): SubstrateValidationResult {
	const issues: SubstrateValidationIssue[] = [];

	const lensesByRelType = new Map<string, LensSpec>();
	for (const l of config.lenses ?? []) {
		const rt = l.relation_type ?? l.id;
		lensesByRelType.set(rt, l);
	}
	const hierarchyByRelType = new Map<string, HierarchyDecl>();
	for (const h of config.hierarchy ?? []) hierarchyByRelType.set(h.relation_type, h);
	const declaredRelTypes = new Set<string>();
	for (const rt of lensesByRelType.keys()) declaredRelTypes.add(rt);
	for (const rt of hierarchyByRelType.keys()) declaredRelTypes.add(rt);
	for (const rt of config.relation_types ?? []) declaredRelTypes.add(rt.canonical_id);

	const idIndex = new Map<string, string>();
	for (const [block, items] of Object.entries(itemsByBlock)) {
		for (const i of items) idIndex.set(i.id, block);
	}

	for (const edge of relations) {
		const lens = lensesByRelType.get(edge.relation_type);
		const hier = hierarchyByRelType.get(edge.relation_type);
		// Consumer-layer node keys (the load-bearing pivot): string-typed for
		// byte-identical diagnostics. A structured same-substrate item normalizes
		// to its refname; a foreign item / project: string keys on its foreign
		// string → idIndex miss → unresolved, exactly as today's sentinels.
		const parentKey = endpointKey(edge.parent);
		const childKey = endpointKey(edge.child);

		// Block-resolution for the parent/child item endpoints. When a `resolve`
		// hook is supplied (validateContext's F2 resolver), a resolved active OR
		// foreign item contributes its `loc.block` — so a cross-substrate child
		// under a lens/hierarchy relation_type resolves to its foreign block rather
		// than missing the active-only `idIndex`. When OMITTED (test callers /
		// standalone use), this falls back to the inline `idIndex.get(key)` —
		// byte-identical to the pre-F2 behavior. (`undefined` from either path means
		// "not found in any loaded block", exactly as before.)
		const resolveBlock = (endpoint: RawEndpoint, key: string): string | undefined => {
			if (!resolve) return idIndex.get(key);
			const r = resolve(endpoint);
			return r.status === "active" || r.status === "foreign" ? r.loc?.block : undefined;
		};

		if (!declaredRelTypes.has(edge.relation_type)) {
			issues.push({
				code: "edge_unknown_relation_type",
				message: `relation_type '${edge.relation_type}' matches no lens, hierarchy, or relation_types declaration`,
				edge,
				relation_type: edge.relation_type,
			});
			continue;
		}

		if (lens) {
			// Bin label: a structured {kind:"lens_bin"} parent contributes its bin;
			// a legacy string parent is bin-or-item ambiguous, resolved by includes.
			// A structured ITEM parent (endpointBin null) keys on its refname/oid and
			// fails the includes test → edge_parent_not_in_bins (never an idIndex.get).
			const parentBin = endpointBin(edge.parent) ?? parentKey;
			if (!lens.bins.includes(parentBin)) {
				issues.push({
					code: "edge_parent_not_in_bins",
					message: `lens-edge parent '${parentBin}' is not in lens '${lens.id}' bins`,
					edge,
				});
			}
			const childBlock = resolveBlock(edge.child, childKey);
			if (!childBlock) {
				issues.push({
					code: "edge_unresolved_child",
					message: `lens-edge child '${childKey}' not found in any loaded block`,
					edge,
				});
			} else if (lens.target && childBlock !== lens.target) {
				issues.push({
					code: "edge_child_wrong_block",
					message: `lens-edge child '${childKey}' in block '${childBlock}', expected lens.target '${lens.target}'`,
					edge,
				});
			}
		}

		if (hier) {
			const parentBlock = resolveBlock(edge.parent, parentKey);
			if (!parentBlock) {
				issues.push({
					code: "edge_unresolved_parent",
					message: `hierarchy-edge parent '${parentKey}' not found in any loaded block`,
					edge,
				});
			} else if (parentBlock !== hier.parent_block) {
				issues.push({
					code: "edge_parent_wrong_block",
					message: `hierarchy-edge parent '${parentKey}' in block '${parentBlock}', expected '${hier.parent_block}'`,
					edge,
				});
			}
			const childBlock = resolveBlock(edge.child, childKey);
			if (!childBlock) {
				issues.push({
					code: "edge_unresolved_child",
					message: `hierarchy-edge child '${childKey}' not found in any loaded block`,
					edge,
				});
			} else if (childBlock !== hier.child_block) {
				issues.push({
					code: "edge_child_wrong_block",
					message: `hierarchy-edge child '${childKey}' in block '${childBlock}', expected '${hier.child_block}'`,
					edge,
				});
			}
		}
	}

	// ── Cycle detection ──────────────────────────────────────────────────
	// Per-relation_type DFS with explicit recursion stack. Only relation_types
	// that have a hierarchy or relation_types declaration with cycle_allowed≠true
	// are checked. Lens-only relation_types do not participate in cycle checks
	// (parents are bin labels, not item ids).
	const cycleAllowed = new Map<string, boolean>();
	for (const rt of config.relation_types ?? []) cycleAllowed.set(rt.canonical_id, rt.cycle_allowed === true);
	const cycleCandidates = new Set<string>();
	for (const rt of hierarchyByRelType.keys()) {
		if (!cycleAllowed.get(rt)) cycleCandidates.add(rt);
	}
	for (const rt of config.relation_types ?? []) {
		if (!rt.cycle_allowed && !lensesByRelType.has(rt.canonical_id)) cycleCandidates.add(rt.canonical_id);
	}

	for (const rt of cycleCandidates) {
		const adj = new Map<string, string[]>();
		for (const e of relations) {
			if (e.relation_type !== rt) continue;
			// Cycle adjacency is keyed on the consumer node key (refname for items)
			// so a structured item and a legacy same-refname string collapse to one
			// graph node — byte-identical cycle diagnostics on string data.
			const pk = endpointKey(e.parent);
			const arr = adj.get(pk) ?? [];
			arr.push(endpointKey(e.child));
			adj.set(pk, arr);
		}
		const visited = new Set<string>();
		const onStack = new Set<string>();
		const reportedCycles = new Set<string>();

		function dfs(node: string, stack: string[]): void {
			if (onStack.has(node)) {
				const idx = stack.indexOf(node);
				const cycle = idx >= 0 ? stack.slice(idx).concat(node) : [node, node];
				const key = `${rt}:${cycle.join("→")}`;
				if (!reportedCycles.has(key)) {
					reportedCycles.add(key);
					issues.push({
						code: "edge_cycle_detected",
						message: `cycle detected under relation_type '${rt}': ${cycle.join(" → ")}`,
						relation_type: rt,
						cycle,
					});
				}
				return;
			}
			if (visited.has(node)) return;
			visited.add(node);
			onStack.add(node);
			stack.push(node);
			for (const child of adj.get(node) ?? []) {
				dfs(child, stack);
			}
			stack.pop();
			onStack.delete(node);
		}
		for (const start of adj.keys()) {
			if (!visited.has(start)) dfs(start, []);
		}
	}

	const errorCodes = new Set<SubstrateValidationIssue["code"]>([
		"edge_parent_not_in_bins",
		"edge_unresolved_parent",
		"edge_unresolved_child",
		"edge_unknown_relation_type",
		"edge_parent_wrong_block",
		"edge_child_wrong_block",
		"edge_cycle_detected",
	]);
	const hasErrors = issues.some((i) => errorCodes.has(i.code));
	const status: SubstrateValidationResult["status"] = hasErrors ? "invalid" : issues.length > 0 ? "warnings" : "clean";
	return { status, issues };
}

// ── Composition resolution (lens-of-lenses) ─────────────────────────────────

/**
 * Result of resolving a composition lens. members carries the per-member
 * resolution; unionedItems is the deduped union (by item.id) used by
 * loadLensView; perItemOrigin maps item.id → originating block name (or
 * sub-lens id when the member resolves through another lens).
 */
export interface ResolvedComposition {
	members: Array<{
		source: { lens?: string; from?: string; where?: Record<string, string | number | boolean> };
		items: ItemRecord[];
	}>;
	unionedItems: ItemRecord[];
	perItemOrigin: Map<string, string>;
}

/**
 * Resolve a composition lens by walking each member declaration:
 *   - { lens: <id> }: lookup the named sub-lens in config.lenses; if it's
 *     also composition, recurse via resolveCompositionInternal carrying
 *     the visited-set; if it's target, load its target block items.
 *   - { from: <block>, where: <field-equality> }: read the block items and
 *     filter by field-equality predicate.
 *
 * Cycle detection: if a sub-lens reference forms a cycle in the composition
 * graph (lens A → lens B → lens A), throws an Error with message
 * "composition_cycle_detected: <cycle path>".
 *
 * Throws when:
 *   - lens is not kind="composition"
 *   - composition members reference a non-existent sub-lens id
 *   - composition members reference a sub-lens that throws on resolution
 *   - cycle detected
 *
 * Caller (loadLensView) catches Error and returns { error: <message> }.
 */
export function resolveComposition(cwd: string, lens: LensSpec): ResolvedComposition {
	if (lens.kind !== "composition") {
		throw new Error(`resolveComposition: lens '${lens.id}' is not kind=composition`);
	}
	const ctx = loadContext(cwd);
	if (!ctx.config) {
		throw new Error("resolveComposition: no <substrate-dir>/config.json");
	}
	return resolveCompositionInternal(cwd, lens, ctx.config, new Set());
}

function resolveCompositionInternal(
	cwd: string,
	lens: LensSpec,
	config: ConfigBlock,
	visited: Set<string>,
): ResolvedComposition {
	if (visited.has(lens.id)) {
		const cyclePath = [...visited, lens.id].join(" → ");
		throw new Error(`composition_cycle_detected: ${cyclePath}`);
	}
	visited.add(lens.id);

	const members: ResolvedComposition["members"] = [];
	const perItemOrigin = new Map<string, string>();
	const unionedById = new Map<string, ItemRecord>();
	const allLenses = config.lenses ?? [];

	for (const member of lens.members ?? []) {
		if (member.lens) {
			const subLens = allLenses.find((l) => l.id === member.lens);
			if (!subLens) {
				throw new Error(`resolveComposition: member references unknown lens '${member.lens}'`);
			}
			let memberItems: ItemRecord[] = [];
			if (subLens.kind === "composition") {
				const subResult = resolveCompositionInternal(cwd, subLens, config, new Set(visited));
				memberItems = subResult.unionedItems;
				for (const [id, origin] of subResult.perItemOrigin) {
					if (!perItemOrigin.has(id)) perItemOrigin.set(id, origin);
				}
			} else {
				// Target lens: read its target block items directly. Don't
				// invoke loadLensView here (avoids importing block-api;
				// context.ts is at a lower layer than lens-view).
				if (!subLens.target) {
					throw new Error(`resolveComposition: sub-lens '${subLens.id}' is kind=target but missing target field`);
				}
				memberItems = readBlockItems(cwd, subLens.target);
				for (const item of memberItems) {
					if (typeof item.id === "string" && !perItemOrigin.has(item.id)) {
						perItemOrigin.set(item.id, subLens.target);
					}
				}
			}
			members.push({ source: { lens: member.lens }, items: memberItems });
			for (const item of memberItems) {
				if (typeof item.id === "string" && !unionedById.has(item.id)) {
					unionedById.set(item.id, item);
				}
			}
		} else if (member.from) {
			const blockName = member.from;
			const blockItems = readBlockItems(cwd, blockName);
			const where = member.where ?? {};
			const filtered = blockItems.filter((item) => {
				for (const [k, v] of Object.entries(where)) {
					if (item[k] !== v) return false;
				}
				return true;
			});
			members.push({ source: { from: blockName, where: member.where }, items: filtered });
			for (const item of filtered) {
				if (typeof item.id === "string") {
					if (!unionedById.has(item.id)) unionedById.set(item.id, item);
					if (!perItemOrigin.has(item.id)) perItemOrigin.set(item.id, blockName);
				}
			}
		}
	}

	return { members, unionedItems: [...unionedById.values()], perItemOrigin };
}

/**
 * Inline minimal block read used by resolveComposition. Avoids importing
 * block-api at this layer (context.ts must remain free of
 * block-api dependencies — block-api imports resolveContextDir from context-dir).
 */
function readBlockItems(cwd: string, blockName: string): ItemRecord[] {
	assertSubstrateName(blockName);
	const root = tryResolveContextDir(cwd);
	if (root === null) return [];
	const filePath = path.join(root, `${blockName}.json`);
	if (!fs.existsSync(filePath)) return [];
	const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Record<string, unknown>;
	const arrayKey = Object.keys(raw).find((k) => Array.isArray(raw[k]));
	if (!arrayKey) return [];
	return raw[arrayKey] as ItemRecord[];
}

// Re-export ValidationError so consumers don't have to dual-import.
export { ValidationError };
