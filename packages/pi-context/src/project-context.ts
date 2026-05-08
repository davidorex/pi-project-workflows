/**
 * pi-context substrate SDK — config-driven vocabulary registries from line 1.
 *
 * This module owns the substrate primitives ported from
 * `analysis/poc-degree-zero-lens/render.ts` and extended with the
 * config-as-canonical-registry shape per the step-2 plan.
 *
 * Design constraint: imports only from `./project-dir` (path constants),
 * `./schema-validator` (AJV bridge), and node builtins. block-api is intended
 * to import `projectRoot` from this module without forming a cycle through
 * project-sdk; this module must therefore stay at a strictly lower layer than
 * block-api.
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
import { PROJECT_DIR } from "./project-dir.js";
import { ValidationError, validateFromFile } from "./schema-validator.js";

// ── Type definitions (from plan §"Files to create") ──────────────────────────

export interface ConfigBlock {
	schema_version: string;
	root: string;
	naming?: Record<string, string>;
	layers?: LayerDecl[];
	block_kinds: BlockKindDecl[];
	status_buckets?: Record<string, StatusBucket>;
	display_strings?: Record<string, string>;
	relation_types?: RelationTypeDecl[];
	hierarchy?: HierarchyDecl[];
	lenses?: LensSpec[];
	installed_schemas?: string[];
	installed_blocks?: string[];
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
}

export interface HierarchyDecl {
	parent_block: string;
	child_block: string;
	relation_type: string;
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

export interface Edge {
	parent: string;
	child: string;
	relation_type: string;
	ordinal?: number;
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

export interface ProjectContext {
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

// ── Bootstrap-fixed file paths ───────────────────────────────────────────────

/** `<cwd>/.project/config.json` — bootstrap exemption: config lives at the
 * fixed location even when `config.root` relocates the rest of the substrate. */
function configPath(cwd: string): string {
	return path.join(cwd, PROJECT_DIR, "config.json");
}

/** `<cwd>/.project/relations.json` — same bootstrap exemption. */
function relationsPath(cwd: string): string {
	return path.join(cwd, PROJECT_DIR, "relations.json");
}

// ── Loaders ─────────────────────────────────────────────────────────────────

/**
 * Resolve the substrate root for `cwd`. Reads the bootstrap-fixed
 * `<cwd>/.project/config.json`, returns `config.root` resolved relative to
 * cwd. Falls back to `<cwd>/.project` when no config is present (bootstrap
 * exemption — the config itself lives there too).
 */
export function projectRoot(cwd: string): string {
	const cfg = loadConfig(cwd);
	if (cfg && typeof cfg.root === "string" && cfg.root.length > 0) {
		return path.resolve(cwd, cfg.root);
	}
	return path.join(cwd, PROJECT_DIR);
}

/**
 * Load and AJV-validate `<cwd>/.project/config.json` against the bundled
 * config.schema.json. Returns null when the file is absent. Throws
 * ValidationError on schema failure; throws Error with file context on
 * read/parse failure.
 */
export function loadConfig(cwd: string): ConfigBlock | null {
	const p = configPath(cwd);
	if (!fs.existsSync(p)) return null;
	let raw: string;
	try {
		raw = fs.readFileSync(p, "utf-8");
	} catch (err) {
		throw new Error(`loadConfig: failed to read ${p}: ${err instanceof Error ? err.message : String(err)}`);
	}
	let data: unknown;
	try {
		data = JSON.parse(raw);
	} catch (err) {
		throw new Error(`loadConfig: invalid JSON in ${p}: ${err instanceof Error ? err.message : String(err)}`);
	}
	validateFromFile(bundledSchemaPath("config"), data, `config.json (${p})`);
	return data as ConfigBlock;
}

/**
 * Load and AJV-validate `<cwd>/.project/relations.json`. Returns [] when the
 * file is absent. Schema shape is `Edge[]` at the top level (array, not
 * `{edges: [...]}`); the validator enforces this.
 */
export function loadRelations(cwd: string): Edge[] {
	const p = relationsPath(cwd);
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

// ── ProjectContext mtime cache ───────────────────────────────────────────────

interface CacheEntry {
	configMtimeMs: number;
	relationsMtimeMs: number;
	value: ProjectContext;
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
export function getProjectContext(cwd: string): ProjectContext {
	const key = path.resolve(cwd);
	const cMtime = safeMtimeMs(configPath(cwd));
	const rMtime = safeMtimeMs(relationsPath(cwd));
	const hit = contextCache.get(key);
	if (hit && hit.configMtimeMs === cMtime && hit.relationsMtimeMs === rMtime) {
		return hit.value;
	}
	const value: ProjectContext = {
		config: loadConfig(cwd),
		relations: loadRelations(cwd),
	};
	contextCache.set(key, { configMtimeMs: cMtime, relationsMtimeMs: rMtime, value });
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
			if (e.parent === node && e.relation_type === relationType) {
				out.push(e.child);
				stack.push(e.child);
			}
		}
	}
	return out;
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
		const item = itemById.get(e.child);
		if (item && lens.bins.includes(e.parent)) {
			grouped.get(e.parent)?.push(item);
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
export function validateRelations(
	config: ConfigBlock,
	relations: Edge[],
	itemsByBlock: Record<string, ItemRecord[]>,
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
			if (!lens.bins.includes(edge.parent)) {
				issues.push({
					code: "edge_parent_not_in_bins",
					message: `lens-edge parent '${edge.parent}' is not in lens '${lens.id}' bins`,
					edge,
				});
			}
			const childBlock = idIndex.get(edge.child);
			if (!childBlock) {
				issues.push({
					code: "edge_unresolved_child",
					message: `lens-edge child '${edge.child}' not found in any loaded block`,
					edge,
				});
			} else if (lens.target && childBlock !== lens.target) {
				issues.push({
					code: "edge_child_wrong_block",
					message: `lens-edge child '${edge.child}' in block '${childBlock}', expected lens.target '${lens.target}'`,
					edge,
				});
			}
		}

		if (hier) {
			const parentBlock = idIndex.get(edge.parent);
			if (!parentBlock) {
				issues.push({
					code: "edge_unresolved_parent",
					message: `hierarchy-edge parent '${edge.parent}' not found in any loaded block`,
					edge,
				});
			} else if (parentBlock !== hier.parent_block) {
				issues.push({
					code: "edge_parent_wrong_block",
					message: `hierarchy-edge parent '${edge.parent}' in block '${parentBlock}', expected '${hier.parent_block}'`,
					edge,
				});
			}
			const childBlock = idIndex.get(edge.child);
			if (!childBlock) {
				issues.push({
					code: "edge_unresolved_child",
					message: `hierarchy-edge child '${edge.child}' not found in any loaded block`,
					edge,
				});
			} else if (childBlock !== hier.child_block) {
				issues.push({
					code: "edge_child_wrong_block",
					message: `hierarchy-edge child '${edge.child}' in block '${childBlock}', expected '${hier.child_block}'`,
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
			const arr = adj.get(e.parent) ?? [];
			arr.push(e.child);
			adj.set(e.parent, arr);
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

// Re-export ValidationError so consumers don't have to dual-import.
export { ValidationError };
