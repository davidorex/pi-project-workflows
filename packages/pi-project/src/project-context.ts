/**
 * Substrate context — reads .project/config.json (the substrate bootstrap
 * location) and exposes config.root through every path helper. block-api
 * and other consumers route through this module so the user's chosen
 * substrate root reaches the runtime instead of being trapped in the
 * substrate SDK alone.
 *
 * Bootstrap exemption: config.json + relations.json themselves live at the
 * fixed PROJECT_DIR location (`.project/`). They are the substrate that
 * DEFINES root, so they cannot live AT root. All OTHER blocks, schemas,
 * agents, and templates live under `<config.root>/...` per the resolved
 * projectRoot.
 *
 * Module dependencies are deliberately limited to project-dir.ts (constants),
 * schema-validator.ts, and node builtins so block-api.ts can import
 * projectRoot without forming a cycle through project-sdk.ts.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PROJECT_DIR, SCHEMAS_DIR } from "./project-dir.js";
import { validateFromFile } from "./schema-validator.js";

/**
 * Degree-zero substrate config — typed schema-validated block describing the
 * substrate itself. `root` declares on-disk substrate location (closes
 * GitHub #3 surface). `naming` aliases canonical block ids to display names.
 * `hierarchy` declares legal closure-table edges. `lenses` declares named
 * projections over target blocks.
 */
export interface ConfigBlock {
	schema_version: string;
	root: string;
	naming?: Record<string, string>;
	hierarchy?: HierarchyDecl[];
	lenses: LensSpec[];
	installed_schemas?: string[];
	installed_blocks?: string[];
}

export interface HierarchyDecl {
	parent_block: string;
	child_block: string;
	relation_type: string;
}

export interface LensSpec {
	id: string;
	target: string;
	relation_type: string;
	derived_from_field: string | null;
	bins: string[];
	render_uncategorized?: boolean;
}

/**
 * Closure-table edge — one row in relations.json. `parent` is either a
 * canonical id (hierarchy edges) or a lens.bins value (lens edges); the
 * disambiguation is cross-document and lives in validateRelations.
 */
export interface Edge {
	parent: string;
	child: string;
	relation_type: string;
}

/** A block item with at minimum a string `id` field plus arbitrary extras. */
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

/** Curation suggestion shape emitted by listUncategorized — the would-be edge append payload. */
export interface CurationSuggestion {
	would_append_to: string;
	payload: Edge;
}

/**
 * Cached substrate context — mtime-keyed snapshot of config + relations
 * for one cwd. Returned by getProjectContext; consumers must not mutate.
 */
export interface ProjectContext {
	config: ConfigBlock | null;
	relations: Edge[];
	configMtime: number | null;
	relationsMtime: number | null;
}

/**
 * Three-tier schema resolution for substrate framework-contract schemas
 * (config, relations). Order: project override (.project/schemas/) → user
 * override (~/.pi/agent/schemas/) → package-shipped (this package's
 * schemas/ directory). First existing path wins. If none exist, returns
 * the package-shipped path; validateFromFile will throw if that file is
 * missing (deployment bug).
 */
function resolveSubstrateSchemaPath(cwd: string, schemaName: string): string {
	const filename = `${schemaName}.schema.json`;
	const projectTier = path.join(cwd, PROJECT_DIR, SCHEMAS_DIR, filename);
	if (fs.existsSync(projectTier)) return projectTier;
	const userTier = path.join(os.homedir(), ".pi", "agent", "schemas", filename);
	if (fs.existsSync(userTier)) return userTier;
	const packageTier = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "schemas", filename);
	return packageTier;
}

/**
 * Read .project/config.json (the substrate bootstrap location, NOT
 * <config.root>/config.json — config defines root so it cannot live AT
 * root). Validate against the resolved config schema, return the parsed
 * ConfigBlock. Returns null if the file is absent. Throws ValidationError
 * on schema failure.
 */
export function loadConfig(cwd: string): ConfigBlock | null {
	const filePath = path.join(cwd, PROJECT_DIR, "config.json");
	if (!fs.existsSync(filePath)) return null;
	const schemaPath = resolveSubstrateSchemaPath(cwd, "config");
	const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
	validateFromFile(schemaPath, raw, ".project/config.json");
	return raw as ConfigBlock;
}

/**
 * Read .project/relations.json (substrate bootstrap location alongside
 * config.json), validate against the resolved relations schema, return the
 * unwrapped edges array. Returns [] if the file is absent. Throws
 * ValidationError on schema failure.
 */
export function loadRelations(cwd: string): Edge[] {
	const filePath = path.join(cwd, PROJECT_DIR, "relations.json");
	if (!fs.existsSync(filePath)) return [];
	const schemaPath = resolveSubstrateSchemaPath(cwd, "relations");
	const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
	validateFromFile(schemaPath, raw, ".project/relations.json");
	return (raw as { edges: Edge[] }).edges;
}

const projectContextCache = new Map<string, ProjectContext>();

/**
 * mtime-invalidated cache over loadConfig + loadRelations. On each call
 * stat both files; reload (and replace cache entry) only when mtime
 * differs from the cached value or no entry exists yet. ENOENT records
 * mtime as null. Cache is module-level — first call builds, subsequent
 * calls within the same process return the cached snapshot when files
 * are unchanged.
 */
export function getProjectContext(cwd: string): ProjectContext {
	const configPath = path.join(cwd, PROJECT_DIR, "config.json");
	const relationsPath = path.join(cwd, PROJECT_DIR, "relations.json");

	const currentConfigMtime = mtimeOrNull(configPath);
	const currentRelationsMtime = mtimeOrNull(relationsPath);

	const cached = projectContextCache.get(cwd);
	if (cached && cached.configMtime === currentConfigMtime && cached.relationsMtime === currentRelationsMtime) {
		return cached;
	}

	const fresh: ProjectContext = {
		config: loadConfig(cwd),
		relations: loadRelations(cwd),
		configMtime: currentConfigMtime,
		relationsMtime: currentRelationsMtime,
	};
	projectContextCache.set(cwd, fresh);
	return fresh;
}

function mtimeOrNull(filePath: string): number | null {
	try {
		return fs.statSync(filePath).mtimeMs;
	} catch {
		return null;
	}
}

/**
 * Resolve the substrate root for a given cwd. Returns config.root from
 * .project/config.json when present and parseable; otherwise returns
 * PROJECT_DIR (".project") for back-compat. Cheap after first call due
 * to getProjectContext's mtime cache.
 *
 * Block-api and every other consumer of substrate paths routes through
 * this helper so config.root flows through the runtime instead of being
 * trapped at the substrate-SDK layer.
 */
export function projectRoot(cwd: string): string {
	const ctx = getProjectContext(cwd);
	return ctx.config?.root ?? PROJECT_DIR;
}

/** Path-helper: substrate root directory (honors config.root). */
export function projectDir(cwd: string): string {
	return path.join(cwd, projectRoot(cwd));
}

/** Path-helper: schemas subdirectory under the substrate root. */
export function schemasDir(cwd: string): string {
	return path.join(cwd, projectRoot(cwd), SCHEMAS_DIR);
}

/** Path-helper: schema file path for a named block under the substrate root. */
export function schemaPath(cwd: string, blockName: string): string {
	return path.join(cwd, projectRoot(cwd), SCHEMAS_DIR, `${blockName}.schema.json`);
}

/** Path-helper: agents subdirectory under the substrate root. */
export function agentsDir(cwd: string): string {
	return path.join(cwd, projectRoot(cwd), "agents");
}

/** Path-helper: templates subdirectory under the substrate root. */
export function projectTemplatesDir(cwd: string): string {
	return path.join(cwd, projectRoot(cwd), "templates");
}

// ── Substrate algorithms (pure functions over the substrate types) ──────────

/**
 * One pass over items; for each item with a string-typed value at
 * lens.derived_from_field, emit { parent: <fieldValue>, child: item.id,
 * relation_type: lens.relation_type }. Returns [] when the lens has no
 * derived_from_field (lens.derived_from_field === null indicates
 * hand-curated edges instead).
 */
export function synthesizeFromField(lens: LensSpec, items: ItemRecord[]): Edge[] {
	if (lens.derived_from_field === null) return [];
	const field = lens.derived_from_field;
	const out: Edge[] = [];
	for (const item of items) {
		const v = item[field];
		if (typeof v === "string") {
			out.push({ parent: v, child: item.id, relation_type: lens.relation_type });
		}
	}
	return out;
}

/**
 * Edges visible to traversal/projection for a given lens. Auto-derived
 * lenses synthesize from the items' field; hand-curated lenses filter
 * authoredEdges by relation_type. Lazy-per-lens: only the queried lens
 * is materialized — no eager union across all lenses.
 */
export function edgesForLens(lens: LensSpec, items: ItemRecord[], authoredEdges: Edge[]): Edge[] {
	if (lens.derived_from_field !== null) return synthesizeFromField(lens, items);
	return authoredEdges.filter((e) => e.relation_type === lens.relation_type);
}

/**
 * Walk the closure-table descendants of parentId under the given
 * relation_type. Stack-based DFS with visited-set guard — cycles in the
 * edge graph are silently de-duped at the walk layer (cycle reporting
 * lives in validateRelations, not here).
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
 * Project items into lens.bins via the supplied lensEdges. Pre-populates
 * each declared bin (ensuring stable ordering) plus an "(uncategorized)"
 * bucket. Items not placed by any edge land in "(uncategorized)". Edges
 * whose parent is not in lens.bins are silently skipped (validateRelations
 * surfaces those as edge_parent_not_in_bins).
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

/**
 * Validate the closure-table relations against the config + a per-block
 * snapshot of items. Emits structured issues for:
 *   - edge_unknown_relation_type: relation_type matches no lens or hierarchy
 *   - edge_parent_not_in_bins: lens-edge parent not in lens.bins
 *   - edge_unresolved_parent: hierarchy-edge parent not found in any block
 *   - edge_unresolved_child: edge child not found in any block
 *   - edge_parent_wrong_block: hierarchy-edge parent in unexpected block
 *   - edge_child_wrong_block: edge child in unexpected block
 *   - edge_cycle_detected: cycle within a relation_type subgraph
 *
 * Cycle detection runs as a final pass partitioning authoredEdges by
 * relation_type and DFS'ing each subgraph with recursion-stack tracking.
 * Cycles are emitted as { cycle: [<id1>, <id2>, ..., <id1>], relation_type }.
 * Any issue promotes status to "invalid".
 */
export function validateRelations(
	config: ConfigBlock,
	authoredEdges: Edge[],
	itemsByBlock: Record<string, ItemRecord[]>,
): SubstrateValidationResult {
	const issues: SubstrateValidationIssue[] = [];

	const lensesByRelType = new Map<string, LensSpec>();
	for (const l of config.lenses) lensesByRelType.set(l.relation_type, l);
	const hierarchyByRelType = new Map<string, HierarchyDecl>();
	for (const h of config.hierarchy ?? []) hierarchyByRelType.set(h.relation_type, h);

	const idIndex = new Map<string, string>();
	for (const [block, items] of Object.entries(itemsByBlock)) {
		for (const i of items) idIndex.set(i.id, block);
	}

	for (const edge of authoredEdges) {
		const lens = lensesByRelType.get(edge.relation_type);
		const hier = hierarchyByRelType.get(edge.relation_type);

		if (!lens && !hier) {
			issues.push({
				code: "edge_unknown_relation_type",
				message: `relation_type '${edge.relation_type}' matches no lens or hierarchy declaration`,
				edge,
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
			} else if (childBlock !== lens.target) {
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

	// Final pass: cycle detection per relation_type subgraph
	const edgesByRelType = new Map<string, Edge[]>();
	for (const e of authoredEdges) {
		if (!edgesByRelType.has(e.relation_type)) edgesByRelType.set(e.relation_type, []);
		edgesByRelType.get(e.relation_type)?.push(e);
	}
	for (const [relType, edges] of edgesByRelType) {
		const adj = new Map<string, string[]>();
		for (const e of edges) {
			if (!adj.has(e.parent)) adj.set(e.parent, []);
			adj.get(e.parent)?.push(e.child);
		}
		const visited = new Set<string>();
		const onStack = new Set<string>();
		const stack: string[] = [];
		const emittedCycles = new Set<string>();

		const dfs = (node: string): void => {
			if (onStack.has(node)) {
				const idx = stack.indexOf(node);
				if (idx === -1) return;
				const cycle = [...stack.slice(idx), node];
				const key = cycle.join("→");
				if (!emittedCycles.has(key)) {
					emittedCycles.add(key);
					issues.push({
						code: "edge_cycle_detected",
						message: `cycle in relation_type '${relType}': ${cycle.join(" → ")}`,
						cycle,
						relation_type: relType,
					});
				}
				return;
			}
			if (visited.has(node)) return;
			visited.add(node);
			onStack.add(node);
			stack.push(node);
			for (const child of adj.get(node) ?? []) {
				dfs(child);
			}
			stack.pop();
			onStack.delete(node);
		};

		for (const node of adj.keys()) {
			if (!visited.has(node)) dfs(node);
		}
	}

	const status: SubstrateValidationResult["status"] = issues.length === 0 ? "clean" : "invalid";
	return { status, issues };
}

/** Resolve a canonical id to its display name via the naming alias map; falls back to the id itself. */
export function displayName(canonicalId: string, naming: Record<string, string> | undefined): string {
	if (!naming) return canonicalId;
	return naming[canonicalId] ?? canonicalId;
}

/**
 * Return uncategorized items from a groupByLens result plus a closure that
 * emits the would-be appendToBlock edge payload for a given (bin, item).
 * The suggestionTemplate is the curation-ceremony substrate consumed by the
 * /project lens-curate command (issue-068, separate work).
 */
export function listUncategorized(
	lens: LensSpec,
	grouped: Map<string, ItemRecord[]>,
): {
	uncategorized: ItemRecord[];
	suggestionTemplate: (binName: string, item: ItemRecord) => CurationSuggestion;
} {
	const uncat = grouped.get("(uncategorized)") ?? [];
	const suggestionTemplate = (binName: string, item: ItemRecord): CurationSuggestion => ({
		would_append_to: "relations.json#/edges",
		payload: { parent: binName, child: item.id, relation_type: lens.relation_type },
	});
	return { uncategorized: uncat, suggestionTemplate };
}
