/**
 * Project SDK — queryable surface for project block state, discovery,
 * and derived metrics. Computes everything dynamically from filesystem
 * and git — no cache, no stale data.
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { readBlock, updateItemInBlock } from "./block-api.js";
import {
	type ConfigBlock,
	type Edge,
	findUnmaterializedAssets,
	type ItemRecord,
	loadConfig,
	loadRelations,
	validateRelations,
} from "./context.js";
import { resolveContextDir, SCHEMAS_DIR, schemaPath, schemasDir, tryResolveContextDir } from "./context-dir.js";
import { getLensValidators } from "./lens-validator.js";
import { resolveStatusVocabulary } from "./status-vocab.js";
import { topoSort } from "./topo.js";

// Re-export substrate SDK so consumers can keep importing through context-sdk.
export {
	type BlockKindDecl,
	type CompositionMember,
	type ConfigBlock,
	type ContextData,
	type CurationSuggestion,
	displayName,
	type Edge,
	edgesForLens,
	groupByLens,
	type HierarchyDecl,
	type InvariantDecl,
	type ItemRecord,
	type LayerDecl,
	type LensSpec,
	listUncategorized,
	loadConfig,
	loadContext,
	loadRelations,
	type RelationTypeDecl,
	type StatusBucket,
	type SubstrateValidationIssue,
	type SubstrateValidationResult,
	synthesizeFromField,
	validateRelations,
	walkDescendants,
} from "./context.js";

// ── Block discovery ──────────────────────────────────────────────────────────

export interface BlockInfo {
	name: string;
	hasSchema: boolean;
}

export function availableBlocks(cwd: string): BlockInfo[] {
	const workflowDir = tryResolveContextDir(cwd);
	if (workflowDir === null) return [];
	const schemasDirPath = schemasDir(cwd);
	if (!fs.existsSync(workflowDir)) return [];

	const blocks: BlockInfo[] = [];
	for (const file of fs.readdirSync(workflowDir)) {
		if (!file.endsWith(".json")) continue;
		const name = file.replace(".json", "");
		const hasSchema = fs.existsSync(path.join(schemasDirPath, `${name}.schema.json`));
		blocks.push({ name, hasSchema });
	}
	return blocks.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Discover schemas in the substrate dir's `schemas/` subdirectory (resolved
 * via `schemasDir(cwd)` per DEC-0015). Returns sorted list of
 * absolute paths to .schema.json files.
 */
export function availableSchemas(cwd: string): string[] {
	const root = tryResolveContextDir(cwd);
	if (root === null) return [];
	const dir = path.join(root, SCHEMAS_DIR);
	if (!fs.existsSync(dir)) return [];
	const schemas: string[] = [];
	for (const file of fs.readdirSync(dir)) {
		if (file.endsWith(".schema.json")) {
			schemas.push(path.join(dir, file));
		}
	}
	return schemas.sort();
}

/**
 * Discover blocks with array properties by scanning the substrate dir's
 * `schemas/` subdirectory (resolved via `schemasDir(cwd)` per
 * DEC-0015) for schemas whose root type has at least one array property.
 * Returns block name, first array key, and schema path for each.
 */
export function findAppendableBlocks(cwd: string): Array<{ block: string; arrayKey: string; schemaPath: string }> {
	const root = tryResolveContextDir(cwd);
	if (root === null) return [];
	const schemasDirPath = path.join(root, SCHEMAS_DIR);
	if (!fs.existsSync(schemasDirPath)) return [];
	const results: Array<{ block: string; arrayKey: string; schemaPath: string }> = [];
	for (const file of fs.readdirSync(schemasDirPath)) {
		if (!file.endsWith(".schema.json")) continue;
		const blockName = file.replace(".schema.json", "");
		try {
			const schema = JSON.parse(fs.readFileSync(path.join(schemasDirPath, file), "utf-8"));
			if (schema.properties) {
				for (const [key, prop] of Object.entries(schema.properties)) {
					if ((prop as Record<string, unknown>).type === "array") {
						results.push({ block: blockName, arrayKey: key, schemaPath: path.join(schemasDirPath, file) });
						break; // first array property
					}
				}
			}
		} catch {
			/* skip malformed schemas */
		}
	}
	return results;
}

// ── Vocabulary (derived from schemas) ─────────────────────────────────────────

/** Default planning lifecycle block types shipped with /context init. */
export const CONTEXT_BLOCK_TYPES = [
	"project",
	"domain",
	"requirements",
	"architecture",
	"tasks",
	"decisions",
	"issues",
	"rationale",
	"verification",
	"handoff",
	"conformance-reference",
	"audit",
] as const;

export interface SchemaProperty {
	name: string;
	type: string;
	required: boolean;
	description?: string;
	enum?: string[];
}

export interface SchemaInfo {
	name: string;
	title: string;
	properties: SchemaProperty[];
	arrayKeys: string[];
	itemProperties?: Record<string, SchemaProperty[]>;
}

/**
 * Read and parse a schema, extracting property metadata.
 * Returns null if the schema file doesn't exist or is unparseable.
 */
export function schemaInfo(cwd: string, schemaName: string): SchemaInfo | null {
	return schemaInfoFromPath(schemaPath(cwd, schemaName), schemaName);
}

/**
 * Extract schema property metadata from an ABSOLUTE schema file path.
 * Identical extraction to `schemaInfo` but addressed by path rather than
 * (cwd, name) — lets package-intrinsic consumers (e.g. samples-catalog) read
 * the extension's bundled samples/schemas/*.schema.json without a project
 * substrate. Returns null if the schema file doesn't exist or is unparseable.
 */
export function schemaInfoFromPath(absSchemaPath: string, schemaName: string): SchemaInfo | null {
	try {
		const raw = JSON.parse(fs.readFileSync(absSchemaPath, "utf-8")) as Record<string, unknown>;
		const title = String(raw.title ?? schemaName);
		const requiredSet = new Set(Array.isArray(raw.required) ? (raw.required as string[]) : []);
		const properties: SchemaProperty[] = [];
		const arrayKeys: string[] = [];
		const itemProperties: Record<string, SchemaProperty[]> = {};

		if (raw.properties && typeof raw.properties === "object") {
			for (const [name, propRaw] of Object.entries(raw.properties as Record<string, Record<string, unknown>>)) {
				const propType = extractType(propRaw);
				const prop: SchemaProperty = {
					name,
					type: propType,
					required: requiredSet.has(name),
					description: propRaw.description ? String(propRaw.description) : undefined,
					enum: Array.isArray(propRaw.enum) ? (propRaw.enum as string[]) : undefined,
				};
				properties.push(prop);

				if (propType === "array") {
					arrayKeys.push(name);
					// Extract item properties (one level deep)
					const items = propRaw.items as Record<string, unknown> | undefined;
					if (items?.properties && typeof items.properties === "object") {
						const itemRequiredSet = new Set(Array.isArray(items.required) ? (items.required as string[]) : []);
						const itemProps: SchemaProperty[] = [];
						for (const [iName, iPropRaw] of Object.entries(
							items.properties as Record<string, Record<string, unknown>>,
						)) {
							itemProps.push({
								name: iName,
								type: extractType(iPropRaw),
								required: itemRequiredSet.has(iName),
								description: iPropRaw.description ? String(iPropRaw.description) : undefined,
								enum: Array.isArray(iPropRaw.enum) ? (iPropRaw.enum as string[]) : undefined,
							});
						}
						itemProperties[name] = itemProps;
					}
				}
			}
		}

		return {
			name: schemaName,
			title,
			properties,
			arrayKeys,
			itemProperties: Object.keys(itemProperties).length > 0 ? itemProperties : undefined,
		};
	} catch {
		return null;
	}
}

/** Extract type string from a JSON Schema property. */
function extractType(prop: Record<string, unknown>): string {
	if (Array.isArray(prop.type)) return (prop.type as string[]).join("|");
	if (typeof prop.type === "string") return prop.type;
	return "unknown";
}

/**
 * All schemas with their property metadata.
 * Scans the substrate dir's `schemas/` subdirectory (resolved via
 * `schemasDir(cwd)` per DEC-0015) and parses each schema.
 */
export function schemaVocabulary(cwd: string): SchemaInfo[] {
	const root = tryResolveContextDir(cwd);
	if (root === null) return [];
	const schemasDirPath = path.join(root, SCHEMAS_DIR);
	if (!fs.existsSync(schemasDirPath)) return [];
	const results: SchemaInfo[] = [];
	for (const file of fs.readdirSync(schemasDirPath).sort()) {
		if (!file.endsWith(".schema.json")) continue;
		const name = file.replace(".schema.json", "");
		const info = schemaInfo(cwd, name);
		if (info) results.push(info);
	}
	return results;
}

export interface BlockStructure {
	name: string;
	exists: boolean;
	hasSchema: boolean;
	arrays: { key: string; itemCount: number }[];
}

/**
 * What blocks exist and their structure — combines availableBlocks
 * and block summaries into a single queryable function.
 */
export function blockStructure(cwd: string): BlockStructure[] {
	const blockDir = tryResolveContextDir(cwd);
	if (blockDir === null) return [];
	const blocks = availableBlocks(cwd);
	return blocks.map((b) => {
		const arrays: { key: string; itemCount: number }[] = [];
		try {
			const data = readBlock(cwd, b.name) as Record<string, unknown>;
			for (const [key, val] of Object.entries(data)) {
				if (Array.isArray(val)) {
					arrays.push({ key, itemCount: val.length });
				}
			}
		} catch {
			/* block unreadable */
		}
		return {
			name: b.name,
			exists: fs.existsSync(path.join(blockDir, `${b.name}.json`)),
			hasSchema: b.hasSchema,
			arrays,
		};
	});
}

// ── Derived State ────────────────────────────────────────────────────────────

export interface ArraySummary {
	total: number;
	byStatus?: Record<string, number>;
}

export interface BlockSummary {
	arrays: Record<string, ArraySummary>;
}

/**
 * Zero-loss derived "where are we + what's next" state (DEC-0040 / FGAP-072 /
 * FGAP-059). A pure function of `.project` substrate — focus, in-flight units,
 * atomic-next ranked actions, and blocked tasks are all DERIVED, never
 * hand-stored. Built to serve `.context` identically once that substrate-dir
 * lands. Reuses existing primitives (buildIdIndex / loadRelations / topoSort);
 * introduces no new traversal or status logic.
 */
export interface CurrentState {
	/** one-line: active in-flight ids, else current in-progress phase, else "no active focus." */
	focus: string;
	/** tasks with status "in-progress" */
	inFlight: { id: string; block: string; description: string }[];
	/** atomic-next, ranked: open framework-gaps (by priority) then unblocked planned tasks (topo order) */
	nextActions: { id: string; kind: string; priority?: string; reason: string }[];
	/** planned tasks whose task_depends_on_task dependency parents are not ALL completed */
	blocked: { id: string; block: string; blockedBy: string[] }[];
}

/**
 * The four-state bootstrap progression, derived purely from the filesystem
 * (DEC-0040 — nothing stored). Consumed by the `/context start` conductor, the
 * dispatch READY-gate, and the startup-slot hint (DEC-0042 / FGAP-095).
 */
export type BootstrapState = "no-pointer" | "no-config" | "not-installed" | "ready";

export interface BootstrapStatus {
	/** which stop in the bootstrap progression `cwd` is at */
	state: BootstrapState;
	/** absolute substrate dir once the `.pi-context.json` pointer exists, else null */
	contextDir: string | null;
	/** declared-but-unmaterialized installed assets — populated only for "not-installed", else empty */
	missing: { schemas: string[]; blocks: string[] };
}

/**
 * Derive the bootstrap progression for `cwd` from the filesystem, in order:
 *   no-pointer    — no `.pi-context.json` (checked directly so this NEVER throws
 *                   pre-bootstrap — it is the unset-substrate detection read the
 *                   harness-confined LLM uses to redirect the human to `/context start`)
 *   no-config     — pointer present, no `config.json`
 *   not-installed — config present, some declared installed_* asset is absent
 *   ready         — config present, all declared assets materialized (or none declared)
 *
 * Does NOT swallow corruption: a malformed `config.json` propagates
 * `loadConfig`'s ValidationError — the four states are the NORMAL progression;
 * corruption is a separate error condition, not a bootstrap stop.
 */
export function deriveBootstrapState(cwd: string): BootstrapStatus {
	const empty = { schemas: [] as string[], blocks: [] as string[] };
	if (!fs.existsSync(path.join(cwd, ".pi-context.json"))) {
		return { state: "no-pointer", contextDir: null, missing: empty };
	}
	const contextDir = resolveContextDir(cwd);
	const config = loadConfig(cwd);
	if (config === null) {
		return { state: "no-config", contextDir, missing: empty };
	}
	const missing = findUnmaterializedAssets(cwd, config);
	const installed = missing.schemas.length === 0 && missing.blocks.length === 0;
	return { state: installed ? "ready" : "not-installed", contextDir, missing };
}

export interface ContextState {
	testCount: number;
	sourceFiles: number;
	sourceLines: number;
	lastCommit: string;
	lastCommitMessage: string;
	recentCommits: string[];
	blockSummaries: Record<string, BlockSummary>;
	phases: { total: number; current: number };
	blocks: number;
	schemas: number;
	// Planning lifecycle derived state (present when corresponding blocks exist)
	requirements?: { total: number; byStatus: Record<string, number>; byPriority: Record<string, number> };
	tasks?: { total: number; byStatus: Record<string, number> };
	domain?: { total: number };
	verifications?: { total: number; passed: number; failed: number };
	hasHandoff?: boolean;
}

/**
 * Derive project state from authoritative sources at query time.
 * No cache, no stale data — computed fresh on every call.
 */
export function contextState(cwd: string): ContextState {
	// Git state
	let lastCommit = "unknown";
	let lastCommitMessage = "";
	try {
		lastCommit = execSync("git log -1 --format=%h", { cwd, encoding: "utf-8" }).trim();
		lastCommitMessage = execSync("git log -1 --format=%s", { cwd, encoding: "utf-8" }).trim();
	} catch {
		/* not a git repo or no commits */
	}

	// Recent commits
	let recentCommits: string[] = [];
	try {
		const log = execSync("git log --oneline -5", { cwd, encoding: "utf-8" }).trim();
		if (log) recentCommits = log.split("\n");
	} catch {
		/* not a git repo */
	}

	// Resolve src dirs — workspace-aware: if cwd has a package.json with
	// "workspaces" globs, collect src/ from each matched package directory;
	// otherwise fall back to the single cwd/src/ directory.
	const srcDirs: string[] = [];
	try {
		const rootPkg = path.join(cwd, "package.json");
		if (fs.existsSync(rootPkg)) {
			const pkg = JSON.parse(fs.readFileSync(rootPkg, "utf-8"));
			if (Array.isArray(pkg.workspaces) && pkg.workspaces.length > 0) {
				for (const pattern of pkg.workspaces as string[]) {
					// Support trailing /* glob (e.g. "packages/*")
					const base = pattern.replace(/\/?\*$/, "");
					const baseDir = path.join(cwd, base);
					if (fs.existsSync(baseDir) && fs.statSync(baseDir).isDirectory()) {
						for (const entry of fs.readdirSync(baseDir)) {
							const pkgSrc = path.join(baseDir, entry, "src");
							if (fs.existsSync(pkgSrc) && fs.statSync(pkgSrc).isDirectory()) {
								srcDirs.push(pkgSrc);
							}
						}
					}
				}
			}
		}
	} catch {
		/* failed to read/parse package.json — fall through */
	}
	// Fallback: if no workspace dirs found, use cwd/src as before
	if (srcDirs.length === 0) {
		const single = path.join(cwd, "src");
		if (fs.existsSync(single)) srcDirs.push(single);
	}

	// Source file count and line count (non-test .ts files, recursive)
	let sourceFiles = 0;
	let sourceLines = 0;
	function walkTsFiles(dir: string, cb: (filePath: string) => void): void {
		let entries: fs.Dirent[];
		try {
			entries = fs.readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			const fullPath = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				walkTsFiles(fullPath, cb);
			} else if (entry.isFile()) {
				cb(fullPath);
			}
		}
	}
	for (const srcDir of srcDirs) {
		walkTsFiles(srcDir, (filePath) => {
			const base = path.basename(filePath);
			if (!base.endsWith(".ts") || base.endsWith(".test.ts")) return;
			sourceFiles++;
			try {
				const content = fs.readFileSync(filePath, "utf-8");
				sourceLines += content.split("\n").length;
			} catch {
				/* unreadable file */
			}
		});
	}

	// Test count derived from static scan of it()/it.only()/test()/test.only() declarations in test files
	let testCount = 0;
	for (const srcDir of srcDirs) {
		walkTsFiles(srcDir, (filePath) => {
			if (!filePath.endsWith(".test.ts")) return;
			try {
				const content = fs.readFileSync(filePath, "utf-8");
				const matches = content.match(/^\s*(?:it|test)(?:\.only)?\s*\(/gm);
				if (matches) testCount += matches.length;
			} catch {
				/* unreadable file */
			}
		});
	}

	// Block summaries — scan all blocks, report item counts and status distribution
	const blockSummaries: Record<string, BlockSummary> = {};
	const blockDir = tryResolveContextDir(cwd);
	try {
		if (blockDir !== null && fs.existsSync(blockDir)) {
			for (const file of fs.readdirSync(blockDir)) {
				if (!file.endsWith(".json")) continue;
				const blockName = file.replace(".json", "");
				try {
					const data = readBlock(cwd, blockName) as Record<string, unknown>;
					const arrays: Record<string, ArraySummary> = {};
					for (const [key, val] of Object.entries(data)) {
						if (!Array.isArray(val)) continue;
						const items = val as Record<string, unknown>[];
						const arrSummary: ArraySummary = { total: items.length };
						// Aggregate by status if items have a status field
						if (items.length > 0 && typeof items[0] === "object" && items[0] !== null && "status" in items[0]) {
							const byStatus: Record<string, number> = {};
							for (const item of items) {
								const s = String((item as Record<string, unknown>).status ?? "unknown");
								byStatus[s] = (byStatus[s] ?? 0) + 1;
							}
							arrSummary.byStatus = byStatus;
						}
						arrays[key] = arrSummary;
					}
					if (Object.keys(arrays).length > 0) {
						blockSummaries[blockName] = { arrays };
					}
				} catch {
					/* skip unreadable blocks */
				}
			}
		}
	} catch {
		/* no block dir */
	}

	// Phases from the <substrateDir>/phase.json array-block (DEC-0028).
	// Singular file basename matches phase.schema.json + the verification.json
	// precedent (singular file + singular schema + plural array_key "phases").
	// `total` is phases[].length; `current` counts completed phases — a
	// monotonic progress measure that does not assume contiguous numbering.
	// Absent phase.json yields total=0/current=0 (graceful).
	let phaseTotal = 0;
	let phaseCurrent = 0;
	try {
		const phaseData = readBlock(cwd, "phase") as { phases?: Record<string, unknown>[] };
		if (Array.isArray(phaseData.phases)) {
			phaseTotal = phaseData.phases.length;
			phaseCurrent = phaseData.phases.filter((p) => p.status === "completed").length;
		}
	} catch {
		/* no phase.json */
	}

	// Planning lifecycle derived state
	const state: ContextState = {
		testCount,
		sourceFiles,
		sourceLines,
		lastCommit,
		lastCommitMessage,
		recentCommits,
		blockSummaries,
		phases: { total: phaseTotal, current: phaseCurrent },
		blocks: availableBlocks(cwd).length,
		schemas: availableSchemas(cwd).length,
	};

	// Requirements summary
	try {
		const reqData = readBlock(cwd, "requirements") as { requirements?: unknown[] };
		if (Array.isArray(reqData.requirements)) {
			const items = reqData.requirements as Record<string, unknown>[];
			const byStatus: Record<string, number> = {};
			const byPriority: Record<string, number> = {};
			for (const item of items) {
				const s = String(item.status ?? "unknown");
				byStatus[s] = (byStatus[s] ?? 0) + 1;
				const p = String(item.priority ?? "unknown");
				byPriority[p] = (byPriority[p] ?? 0) + 1;
			}
			state.requirements = { total: items.length, byStatus, byPriority };
		}
	} catch {
		/* block doesn't exist */
	}

	// Tasks summary
	try {
		const taskData = readBlock(cwd, "tasks") as { tasks?: unknown[] };
		if (Array.isArray(taskData.tasks)) {
			const items = taskData.tasks as Record<string, unknown>[];
			const byStatus: Record<string, number> = {};
			for (const item of items) {
				const s = String(item.status ?? "unknown");
				byStatus[s] = (byStatus[s] ?? 0) + 1;
			}
			state.tasks = { total: items.length, byStatus };
		}
	} catch {
		/* block doesn't exist */
	}

	// Domain summary
	try {
		const domainData = readBlock(cwd, "domain") as { entries?: unknown[] };
		if (Array.isArray(domainData.entries)) {
			state.domain = { total: domainData.entries.length };
		}
	} catch {
		/* block doesn't exist */
	}

	// Verification summary
	try {
		const verData = readBlock(cwd, "verification") as { verifications?: unknown[] };
		if (Array.isArray(verData.verifications)) {
			const items = verData.verifications as Record<string, unknown>[];
			let passed = 0;
			let failed = 0;
			for (const item of items) {
				if (item.status === "passed") passed++;
				else if (item.status === "failed") failed++;
			}
			state.verifications = { total: items.length, passed, failed };
		}
	} catch {
		/* block doesn't exist */
	}

	// Handoff presence
	const handoffRoot = tryResolveContextDir(cwd);
	state.hasHandoff = handoffRoot !== null && fs.existsSync(path.join(handoffRoot, "handoff.json"));

	return state;
}

/**
 * Derive {@link CurrentState} ("where are we + what's next") purely from
 * `.project` substrate. No writes; tolerant of absent optional blocks (every
 * branch defaults to empty rather than throwing).
 *
 * Edge-direction contract for blocked/ready derivation (verified against
 * roadmap-plan.ts:471 — the topoSort-deps mapping for phase_depends_on uses the
 * identical convention): a `task_depends_on_task` edge `{parent: D, child: T}`
 * means task T DEPENDS ON task D, so D must reach status "completed" before T is
 * unblocked. (relation name source_verb_target = task_depends_on_task ⇒ child is
 * the source/dependent, parent is the target/prerequisite; config display_name
 * "depends on task".)
 */
export function currentState(cwd: string): CurrentState {
	// Tolerate any substrate-read failure (no .project, malformed config, etc.)
	// by collapsing to the empty state — this is a pure read surface.
	let idIndex: Map<string, ItemLocation>;
	try {
		idIndex = buildIdIndex(cwd);
	} catch {
		idIndex = new Map();
	}
	let edges: Edge[];
	try {
		edges = loadRelations(cwd);
	} catch {
		edges = [];
	}

	// Resolve the active status-vocabulary ONCE (defaults shadowed by
	// config.status_buckets). Every status comparison below routes through the
	// resulting bucket — no raw status literal ("in-progress"/"completed"/etc.)
	// is compared in source (DEC-0025 vocabulary-neutrality). bucket(item) maps
	// a raw item.status string to its StatusBucket, defaulting to "unknown".
	const vocab = resolveStatusVocabulary(cwd);
	const bucket = (item: Record<string, unknown>): string => vocab[String(item.status)] ?? "unknown";

	// ── inFlight: tasks-block items bucketing to in_progress ───────────────────
	const inFlight: CurrentState["inFlight"] = [];
	for (const [id, loc] of idIndex) {
		if (loc.block !== "tasks") continue;
		if (bucket(loc.item) !== "in_progress") continue;
		inFlight.push({
			id,
			block: loc.block,
			description: typeof loc.item.description === "string" ? loc.item.description : "",
		});
	}

	// Task dependency adjacency from task_depends_on_task edges: for task T,
	// depParents(T) = parents of edges {parent, child:T}. T is unblocked iff
	// every dep parent that resolves to a known item is completed (deps pointing
	// at unknown ids are treated as satisfied — a dangling edge is a relations
	// integrity concern surfaced by validateRelations, not a blocker here).
	const isCompleted = (taskId: string): boolean => {
		const loc = idIndex.get(taskId);
		return loc !== undefined && bucket(loc.item) === "complete";
	};
	const depParentsOf = (taskId: string): string[] =>
		edges.filter((e) => e.relation_type === "task_depends_on_task" && e.child === taskId).map((e) => e.parent);
	const incompleteDeps = (taskId: string): string[] =>
		depParentsOf(taskId).filter((dep) => idIndex.has(dep) && !isCompleted(dep));

	// Collect all to-do (ready/queued) tasks once — drives both blocked + ready
	// derivations. "todo" bucket = planned/queued work (raw status "planned"
	// buckets to todo under STATUS_VOCABULARY_DEFAULTS).
	const plannedTasks: { id: string; loc: ItemLocation }[] = [];
	for (const [id, loc] of idIndex) {
		if (loc.block === "tasks" && bucket(loc.item) === "todo") plannedTasks.push({ id, loc });
	}

	// ── blocked: planned tasks with at least one incomplete dep parent ─────────
	const blocked: CurrentState["blocked"] = [];
	const blockedIds = new Set<string>();
	for (const { id, loc } of plannedTasks) {
		const blockedBy = incompleteDeps(id);
		if (blockedBy.length > 0) {
			blocked.push({ id, block: loc.block, blockedBy });
			blockedIds.add(id);
		}
	}

	// ── nextActions (atomic-next, ranked) ──────────────────────────────────────
	const nextActions: CurrentState["nextActions"] = [];

	// 1. Open framework-gaps (gaps bucketing to todo — raw status "identified"
	//    buckets to todo under STATUS_VOCABULARY_DEFAULTS), ranked
	//    P0 > P1 > P2 > P3 (missing priority sorts last) then by id.
	const priorityRank: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
	const openGaps: { id: string; priority?: string }[] = [];
	for (const [id, loc] of idIndex) {
		if (loc.block !== "framework-gaps") continue;
		if (bucket(loc.item) !== "todo") continue;
		openGaps.push({ id, priority: typeof loc.item.priority === "string" ? loc.item.priority : undefined });
	}
	openGaps.sort((a, b) => {
		const ra = a.priority !== undefined ? (priorityRank[a.priority] ?? 99) : 99;
		const rb = b.priority !== undefined ? (priorityRank[b.priority] ?? 99) : 99;
		if (ra !== rb) return ra - rb;
		return a.id.localeCompare(b.id);
	});
	for (const g of openGaps) {
		nextActions.push({
			id: g.id,
			kind: "framework-gap",
			...(g.priority !== undefined ? { priority: g.priority } : {}),
			reason: `open gap (priority ${g.priority ?? "unset"})`,
		});
	}

	// 2. Ready tasks: planned tasks NOT in `blocked`, ordered via topoSort over
	//    the planned-task nodes with deps = their task_depends_on_task parents.
	//    topoSort only counts edges between nodes present in the graph, so deps
	//    pointing outside the planned set (e.g. already-completed prerequisites)
	//    don't gate the ordering — we then filter the resulting order to the
	//    ready (unblocked + planned) subset.
	const { order } = topoSort(
		plannedTasks,
		(t) => t.id,
		(t) => depParentsOf(t.id),
	);
	for (const id of order) {
		if (blockedIds.has(id)) continue;
		nextActions.push({ id, kind: "task", reason: "unblocked planned task" });
	}

	// Cap nextActions at a scannable head (first 15) — derivation can surface a
	// long backlog; the head is the actionable slice for "what's next".
	const NEXT_ACTIONS_CAP = 15;
	const cappedNextActions = nextActions.slice(0, NEXT_ACTIONS_CAP);

	// ── focus: single derived string ───────────────────────────────────────────
	let focus: string;
	if (inFlight.length > 0) {
		focus = `in-flight: ${inFlight.map((t) => t.id).join(", ")}`;
	} else {
		// Fall back to a phase bucketing to in_progress (phase.json phases[]
		// array-block).
		let inProgressPhase: { id?: string; name?: string } | null = null;
		for (const [id, loc] of idIndex) {
			if (loc.block !== "phase") continue;
			if (bucket(loc.item) !== "in_progress") continue;
			inProgressPhase = { id, name: typeof loc.item.name === "string" ? loc.item.name : undefined };
			break;
		}
		if (inProgressPhase !== null) {
			const label = inProgressPhase.name ? `${inProgressPhase.id} (${inProgressPhase.name})` : inProgressPhase.id;
			focus = `phase: ${label}`;
		} else {
			focus = "no active focus.";
		}
	}

	return { focus, inFlight, nextActions: cappedNextActions, blocked };
}

// ── Predicate Filter ────────────────────────────────────────────────────────

/**
 * Predicate operators for filterBlockItems. Each operator carries a
 * documented semantic against `item[field]`:
 *   - `eq`      : strict-equality (===) against `value`
 *   - `neq`     : strict-inequality (!==) against `value`
 *   - `in`      : `value` must be an array; matches when item[field] is in it
 *   - `matches` : item[field] must be a string; tested against `new RegExp(value)`
 *
 * The match policy for items missing the predicate field is uniform:
 * `item[field] === undefined` → NOT a match (returns false) for every
 * operator. Rationale: returning early avoids throwing on heterogeneous
 * block arrays where some items legitimately lack the field; callers that
 * want a hard "field must exist" gate compose with `op: "neq", value: undefined`
 * (still excluded by the undefined branch — current semantic is filter, not
 * schema assertion). Documented here rather than via throw so callers get a
 * cleanly-typed empty/partial array rather than a runtime trap.
 */
export interface FilterPredicate {
	field: string;
	op: "eq" | "neq" | "in" | "matches";
	value: unknown;
}

/**
 * Discover the single top-level array key in a block payload. Returns null
 * when the block has zero array properties; throws when ambiguous (two or
 * more array properties), since callers cannot proceed without an explicit
 * disambiguation policy. Mirrors the heuristic in
 * scripts/orchestrator/inject-context-items.ts:85-95 — both consumers share
 * the same single-array-key assumption used across .project/ block writes.
 */
function discoverArrayKey(blockData: Record<string, unknown>): string | null {
	const arrayKeys = Object.entries(blockData).filter(([, v]) => Array.isArray(v));
	if (arrayKeys.length === 0) return null;
	if (arrayKeys.length === 1) return arrayKeys[0][0];
	throw new Error(
		`filterBlockItems: block has multiple top-level array properties (${arrayKeys
			.map(([k]) => k)
			.join(", ")}); array_key per block is not declared in any registry — single-array assumption violated`,
	);
}

/**
 * Filter the array items of a block by a predicate. Reads the block via the
 * canonical block-api `readBlock`, discovers the single top-level array key,
 * and returns a new array of items satisfying the predicate. The source
 * block is never mutated.
 *
 * Behavior contract:
 *   - Block must exist; underlying `readBlock` throw propagates.
 *   - Block must have exactly one top-level array property (single-array
 *     assumption — same as inject-context-items.ts).
 *   - Items missing the predicate field never match (see FilterPredicate
 *     docstring for rationale).
 *   - `op: "in"` requires `value` to be an array; otherwise no items match.
 *   - `op: "matches"` constructs `new RegExp(String(value))`; a malformed
 *     regex pattern throws synchronously from the RegExp constructor.
 *
 * Closes part of the FGAP-026 phase 2 query-surface gap (TASK-034).
 */
export function filterBlockItems(cwd: string, blockName: string, predicate: FilterPredicate): unknown[] {
	const data = readBlock(cwd, blockName) as Record<string, unknown>;
	const arrayKey = discoverArrayKey(data);
	if (arrayKey === null) return [];
	const items = data[arrayKey] as unknown[];
	const { field, op, value } = predicate;
	const re = op === "matches" ? new RegExp(String(value)) : null;
	return items.filter((raw) => {
		if (!raw || typeof raw !== "object") return false;
		const item = raw as Record<string, unknown>;
		const fv = item[field];
		if (fv === undefined) return false;
		switch (op) {
			case "eq":
				return fv === value;
			case "neq":
				return fv !== value;
			case "in":
				return Array.isArray(value) && (value as unknown[]).includes(fv);
			case "matches":
				return typeof fv === "string" && re!.test(fv);
			default:
				return false;
		}
	});
}

export interface BlockPage {
	items: unknown[];
	total: number;
	hasMore: boolean;
}

/**
 * Read a single item from ONE named block by its id, or null if absent.
 * Block-scoped (no cross-substrate idIndex, no prefix-vs-block invariant — that is resolveItemById).
 * Reuses filterBlockItems(id eq) so it inherits readBlock + discoverArrayKey + edge semantics
 * (missing block / multiple top-level arrays THROW; no-array block or id-not-found → null). FGAP-045.
 */
export function readBlockItem(cwd: string, blockName: string, id: string): unknown | null {
	const matches = filterBlockItems(cwd, blockName, { field: "id", op: "eq", value: id });
	return matches.length > 0 ? matches[0] : null;
}

/**
 * Paginate a block's items. Reuses readBlock + discoverArrayKey. Returns the FULL count as `total`
 * (not the page length) and `hasMore = offset + limit < total`. No-array block → {items:[],total:0,
 * hasMore:false}; offset ≥ total → empty items with correct total. Missing block / multiple top-level
 * arrays propagate the throw (consistent with filterBlockItems). FGAP-045.
 */
export function readBlockPage(
	cwd: string,
	blockName: string,
	opts: { offset?: number; limit?: number } = {},
): BlockPage {
	const offset = opts.offset ?? 0;
	const limit = opts.limit ?? 50;
	const data = readBlock(cwd, blockName) as Record<string, unknown>;
	const arrayKey = discoverArrayKey(data);
	const arr = arrayKey ? (data[arrayKey] as unknown[]) : [];
	const total = arr.length;
	const items = arr.slice(offset, offset + limit);
	return { items, total, hasMore: offset + limit < total };
}

/**
 * Read a block and return its single top-level array of items, or [] when the
 * block has no array property. Mirrors the read+discover prologue shared by
 * filterBlockItems / readBlockPage; missing block / multiple top-level arrays
 * propagate the throw via readBlock + discoverArrayKey. Module-private helper
 * for joinBlocks' no-predicate left path + field-mode right read.
 */
function readBlockArray(cwd: string, blockName: string): Record<string, unknown>[] {
	const data = readBlock(cwd, blockName) as Record<string, unknown>;
	const arrayKey = discoverArrayKey(data);
	if (arrayKey === null) return [];
	return (data[arrayKey] as unknown[]).filter(
		(raw): raw is Record<string, unknown> => !!raw && typeof raw === "object",
	);
}

// ── Cross-block Join ──────────────────────────────────────────────────────────

export interface JoinSpec {
	leftBlock: string;
	rightBlock: string;
	relationType?: string; // EDGE mode (XOR field mode)
	leftField?: string; // FIELD mode (with rightField)
	rightField?: string;
	leftEndpoint?: "parent" | "child"; // EDGE mode: is the left item the edge parent (default) or child?
	leftPredicate?: FilterPredicate; // optional pre-filter on the left block
}

export interface JoinResult {
	left: Record<string, unknown>;
	right: Record<string, unknown>[]; // ALWAYS an array (one-to-many; [] = no match)
}

/**
 * Cross-block join (FGAP-043, HYBRID). Mode = exactly one of relationType (edge) XOR
 * leftField+rightField (field). Returns one JoinResult per left item (after leftPredicate),
 * right always an array. Edge mode is DEC-0013-native (relations.json); field mode joins on a
 * shared field value (legacy inline-FK + arbitrary shared fields). Reuses filterBlockItems /
 * readBlock / discoverArrayKey / loadRelations / buildIdIndex.
 */
export function joinBlocks(cwd: string, spec: JoinSpec): JoinResult[] {
	const isEdge = spec.relationType !== undefined;
	const isField = spec.leftField !== undefined || spec.rightField !== undefined;
	if (isEdge && isField)
		throw new Error(
			"joinBlocks: specify EITHER relationType (edge mode) OR leftField+rightField (field mode), not both",
		);
	if (!isEdge && !isField)
		throw new Error("joinBlocks: specify relationType (edge mode) or leftField+rightField (field mode)");
	if (isField && (spec.leftField === undefined || spec.rightField === undefined))
		throw new Error("joinBlocks: field mode requires both leftField and rightField");

	const leftItems = spec.leftPredicate
		? (filterBlockItems(cwd, spec.leftBlock, spec.leftPredicate) as Record<string, unknown>[])
		: readBlockArray(cwd, spec.leftBlock);

	if (isField) {
		const rightItems = readBlockArray(cwd, spec.rightBlock);
		const rf = spec.rightField as string;
		const lf = spec.leftField as string;
		const index = new Map<unknown, Record<string, unknown>[]>();
		for (const r of rightItems) {
			const key = r[rf];
			const bucket = index.get(key);
			if (bucket) bucket.push(r);
			else index.set(key, [r]);
		}
		return leftItems.map((left) => ({ left, right: left[lf] !== undefined ? (index.get(left[lf]) ?? []) : [] }));
	}

	// EDGE mode
	const relationType = spec.relationType as string;
	const leftEndpoint = spec.leftEndpoint ?? "parent";
	const edges = loadRelations(cwd).filter((e) => e.relation_type === relationType);
	const idIndex = buildIdIndex(cwd);
	return leftItems.map((left) => {
		const leftId = left.id;
		const right: Record<string, unknown>[] = [];
		if (typeof leftId === "string") {
			for (const e of edges) {
				const here = leftEndpoint === "parent" ? e.parent : e.child;
				if (here !== leftId) continue;
				const otherId = leftEndpoint === "parent" ? e.child : e.parent;
				const loc = idIndex.get(otherId);
				if (loc && loc.block === spec.rightBlock) right.push(loc.item);
			}
		}
		return { left, right };
	});
}

// ── Cross-block ID Resolver ─────────────────────────────────────────────────

/**
 * Locator for a single item discovered by buildIdIndex: which block file it
 * lives in, which array key inside that block holds it, and the item payload.
 * Intended as the substrate for renderer-driven cross-reference resolution
 * (e.g., a per-item macro inlining a related decision by ID).
 */
export interface ItemLocation {
	block: string;
	arrayKey: string;
	item: Record<string, unknown>;
}

/**
 * Look up the block expected to host an ID based on its prefix, driven by
 * the config registry.
 *
 * Resolution: scan `cfg.block_kinds[]` for the longest-matching `prefix`
 * and return its `canonical_id`. Returns null when:
 *   - `cfg` is null (no config / pre-bootstrap project — graceful fallback)
 *   - no `block_kinds[].prefix` matches the id (bare phase IDs, legacy
 *     unprefixed IDs, future prefixes not yet registered)
 *
 * Registry is config-driven from line 1 — prefix conflicts surface at
 * config-registration time rather than fixture-write time. Closes issue-089
 * class (PLAN- vs PLAN-NNN collision) structurally.
 *
 * Longest-prefix wins so that compatible registrations like `R-` and
 * `REVIEW-` resolve unambiguously.
 */
export function expectedBlockForId(id: string, cfg: ConfigBlock | null): string | null {
	if (!cfg) return null;
	let best: { prefix: string; canonical: string } | null = null;
	for (const bk of cfg.block_kinds) {
		// An empty prefix matches every id (startsWith("")) — it must never act as
		// a catch-all claiming unprefixed ids (FGAP-062). Empty prefix is a LEGITIMATE
		// signal for slug-id blocks (e.g. conventions, FGAP-051) that don't use
		// prefix+number ids; such blocks are simply excluded from prefix-based
		// resolution (their items index under their own block file with no
		// prefix-vs-block enforcement).
		if (!bk.prefix) continue;
		if (id.startsWith(bk.prefix)) {
			if (!best || bk.prefix.length > best.prefix.length) {
				best = { prefix: bk.prefix, canonical: bk.canonical_id };
			}
		}
	}
	return best ? best.canonical : null;
}

/**
 * Build a map from item-ID to its location across every block in `.project/`.
 *
 * Scan strategy:
 *   - `.project/*.json` — every array property whose items are objects with
 *     a string `id` field becomes an indexed entry. Phases participate as an
 *     ordinary array-block since DEC-0028 (PHASE-NNN ids in `phase.json` under
 *     the plural `phases` array key); there is no dedicated file-per-phase branch.
 *
 * Prefix invariant: when an item ID starts with one of the prefixes registered
 * in `config.block_kinds[]`, the block it was found in must match that
 * registry's `canonical_id`. Mismatches throw immediately — schema patterns
 * make this state unreachable through validated writes, so encountering one
 * indicates either a direct-fs corruption or an unmapped prefix collision that
 * needs explicit resolution. When no config exists (pre-bootstrap project),
 * the prefix invariant is silently skipped — every encountered id is indexed
 * without enforcement.
 *
 * Collisions on identical IDs across different blocks: first writer wins
 * (no overwrite) — duplicate entries are intentionally ignored to keep
 * the resolver deterministic without allocating warning channels here.
 */
export function buildIdIndex(cwd: string): Map<string, ItemLocation> {
	const index = new Map<string, ItemLocation>();
	const blockDir = tryResolveContextDir(cwd);
	if (blockDir === null) return index;
	const cfg = loadConfig(cwd);

	// Phases are an ordinary array-block since DEC-0028: each phase carries a
	// PHASE-NNN top-level `id` and lives in `phase.json` under the plural
	// `phases` array key (singular file basename matches phase.schema.json +
	// the verification.json precedent). The generic block-file scan below
	// indexes them by id like any other block. When `PHASE-` is registered in
	// config.block_kinds (canonical_id "phase"), expectedBlockForId resolves
	// PHASE-NNN ids to block "phase" — matching the file they are found in, so
	// the prefix-vs-block invariant passes without a dedicated branch.

	// Top-level block files — scan every array property for items with `id`.
	if (!fs.existsSync(blockDir)) return index;
	for (const file of fs.readdirSync(blockDir)) {
		if (!file.endsWith(".json")) continue;
		const blockName = file.replace(".json", "");
		let data: Record<string, unknown>;
		try {
			data = readBlock(cwd, blockName) as Record<string, unknown>;
		} catch {
			continue; // unreadable / malformed block — skip
		}
		for (const [arrayKey, val] of Object.entries(data)) {
			if (!Array.isArray(val)) continue;
			for (const raw of val) {
				if (!raw || typeof raw !== "object") continue;
				const item = raw as Record<string, unknown>;
				const idVal = item.id;
				if (typeof idVal !== "string" || idVal.length === 0) continue;

				const expected = expectedBlockForId(idVal, cfg);
				if (expected !== null && expected !== blockName) {
					throw new Error(
						`buildIdIndex: ID '${idVal}' found in block '${blockName}' but its prefix maps to block '${expected}'. ` +
							`Prefix-vs-block-kind invariant violated — this indicates a direct-fs write that bypassed schema validation, or a prefix collision needing explicit resolution.`,
					);
				}

				if (!index.has(idVal)) {
					index.set(idVal, { block: blockName, arrayKey, item });
				}
			}
		}
	}

	return index;
}

/**
 * One-off lookup — builds the full index then performs a single get.
 * Callers performing multiple lookups in one render pass should call
 * `buildIdIndex` once and reuse the returned map.
 */
export function resolveItemById(cwd: string, id: string): ItemLocation | null {
	return buildIdIndex(cwd).get(id) ?? null;
}

/**
 * Bulk variant of `resolveItemById` — resolve N ids against a single
 * `buildIdIndex` traversal. Complements the singular form (which remains
 * available for one-off renderer-driven lookups) by collapsing N independent
 * `buildIdIndex` rebuilds into one. Coexists with the singular surface;
 * neither supersedes the other.
 *
 * Semantics:
 *   - Returns a `Map<string, ItemLocation | null>` whose entries are keyed
 *     by the INPUT ids exactly as supplied (no normalization, no dedup
 *     beyond Map's intrinsic key-uniqueness). Duplicate input ids therefore
 *     collapse to one map entry — caller-side responsibility if multiplicity
 *     matters; the canonical bulk-lookup contract is "set of ids → set of
 *     resolutions" rather than "list → list".
 *   - For each input id: present in the index → its `ItemLocation`; absent
 *     → null entry. Every input id has an entry in the returned map (no
 *     silent drops); this is the property that distinguishes the bulk
 *     surface from a partial-result `getMany`.
 *   - Empty input (`ids: []`) returns an empty Map (no index build cost
 *     beyond the unavoidable directory existence check inside buildIdIndex).
 *   - Insertion order matches the first-encounter order of `ids` (standard
 *     ES Map semantics on `.set`).
 *
 * Behavior contract:
 *   - Single `buildIdIndex(cwd)` invocation regardless of `ids.length`
 *     (closes the N×singular-call pattern that motivated the bulk surface).
 *   - Prefix-vs-block invariant violations inside the index build propagate
 *     out as-is — same surface contract as `resolveItemById`.
 *
 * Closes part of the FGAP-026 phase 2 query-surface gap (TASK-035).
 */
export function resolveItemsByIds(cwd: string, ids: string[]): Map<string, ItemLocation | null> {
	const out = new Map<string, ItemLocation | null>();
	if (ids.length === 0) return out;
	const index = buildIdIndex(cwd);
	for (const id of ids) {
		if (out.has(id)) continue; // duplicate input — Map dedup semantics
		out.set(id, index.get(id) ?? null);
	}
	return out;
}

// ── Project Validation (cross-block reference integrity) ─────────────────────

export interface ContextValidationIssue {
	severity: "error" | "warning";
	message: string;
	block: string;
	/**
	 * Defect locator within the block. Required for cross-block reference
	 * diagnostics; optional for lens-validator-sourced issues whose
	 * locator (e.g. phase_id) does not always map to a field path.
	 */
	field?: string;
	/**
	 * Opaque diagnostic slug from a registered lens-validator
	 * (e.g. roadmap_lens_missing). Absent on issues produced by the
	 * built-in cross-block reference scan, which has no slug surface
	 * (its diagnostics are uniquely identified by block + field).
	 */
	code?: string;
}

export interface ContextValidationResult {
	status: "clean" | "warnings" | "invalid";
	issues: ContextValidationIssue[];
}

/**
 * Field-equality predicate for config-declared invariants. Mirrors the
 * composition-lens `where` semantics (context.ts:773-778): the item
 * qualifies only when EVERY (field, value) pair matches item[field] === value.
 * Absent predicate → every item qualifies.
 */
function matchesWhere(item: Record<string, unknown>, where?: Record<string, string | number | boolean>): boolean {
	if (!where) return true;
	for (const [k, v] of Object.entries(where)) if (item[k] !== v) return false;
	return true;
}

/**
 * Validate cross-block referential integrity against the EDGE model
 * (DEC-0013: `relations.json` closure-table edges are THE reference surface).
 * Returns structured issues rather than throwing.
 *
 * Edge integrity replaces the pre-DEC-0036 per-block inline-FK reference scan:
 * each edge's `parent`/`child` must resolve to a known item id (via the unified
 * `buildIdIndex`), and each edge's `relation_type` must be registered in
 * `config.relation_types[]` (DEC-0030 tripartite canonical_ids). Cycle
 * detection is delegated to `validateRelations` (its `edge_cycle_detected`
 * diagnostics are merged in).
 *
 * Substrate invariants beyond edge integrity are enforced generically from
 * `config.invariants[]` per the `requires-edge` class — no invariant vocabulary
 * (block kind / status / relation_type / direction) lives in source (DEC-0025).
 * The canonical pi-context conception declares two invariants as config DATA:
 * `completed-task-has-verification` and `decision-cites-forcing-artifact`; a
 * project ships only the invariants its own conception requires.
 */
export function validateContext(cwd: string): ContextValidationResult {
	const issues: ContextValidationIssue[] = [];

	// Build the unified ID index once — the resolution surface for every edge
	// endpoint and for the relocated invariants below.
	// Note: buildIdIndex enforces the prefix-vs-block invariant and may throw
	// on corrupted state; that surfaces as a hard failure to validateContext
	// callers (intended — corrupted IDs are not recoverable cross-ref issues).
	const idIndex = buildIdIndex(cwd);

	// ── Edge integrity (DEC-0013 closure-table reference surface) ─────────────
	// Load config + relations; both absent in a pre-bootstrap project, in which
	// case edge checks (and the relocated invariants, which depend on edges)
	// are skipped gracefully — there is no edge model to validate yet.
	const config = loadConfig(cwd);
	const relations: Edge[] = config ? loadRelations(cwd) : [];

	// `config` present → run edge-integrity + the relocated invariants. The
	// invariants detect MISSING edges (completed task without a verification
	// edge; decision without a forcing-artifact edge), so they must run even
	// when relations is empty — gating them on relations.length>0 would
	// false-pass a zero-edge substrate. The edge-integrity loop below is a
	// no-op on empty relations, so it needs no separate guard.
	if (config) {
		const registeredRelTypes = new Set((config.relation_types ?? []).map((rt) => rt.canonical_id));
		for (const edge of relations) {
			if (!idIndex.has(edge.parent)) {
				issues.push({
					severity: "error",
					message: `Edge parent '${edge.parent}' (relation_type '${edge.relation_type}') does not resolve to any item`,
					block: "relations",
					field: `${edge.parent}->${edge.child}`,
				});
			}
			if (!idIndex.has(edge.child)) {
				issues.push({
					severity: "error",
					message: `Edge child '${edge.child}' (relation_type '${edge.relation_type}') does not resolve to any item`,
					block: "relations",
					field: `${edge.parent}->${edge.child}`,
				});
			}
			if (!registeredRelTypes.has(edge.relation_type)) {
				issues.push({
					severity: "error",
					message: `Edge relation_type '${edge.relation_type}' is not registered in config.relation_types`,
					block: "relations",
					field: `${edge.parent}->${edge.child}`,
				});
			}
		}

		// ── Edge endpoint-kind check (FGAP-086, DEC-0037) ─────────────────────
		// Presence-gated: a relation_type with neither source_kinds nor
		// target_kinds is unchecked, so the frozen .project substrate (whose
		// relation_types carry no endpoint metadata) is not retroactively failed.
		// When metadata is present, an edge endpoint whose resolved block is not in
		// the declared kind set (and the set is not the "*" wildcard) is an error.
		// loc.block is the data-file basename; the source/target_kinds name
		// block_kind canonical_ids — the loc.block==canonical_id assumption is
		// inherited from the invariant loop below (~:1140), where inv.block (a
		// canonical_id) is matched directly against loc.block.
		for (const edge of relations) {
			const rt = config.relation_types?.find((r) => r.canonical_id === edge.relation_type);
			if (!rt) continue; // unregistered relation_type already reported above
			if (!rt.source_kinds && !rt.target_kinds) continue; // metadata absent → unchecked
			const parentLoc = idIndex.get(edge.parent);
			const childLoc = idIndex.get(edge.child);
			if (
				parentLoc &&
				rt.source_kinds &&
				!(rt.source_kinds.includes("*") || rt.source_kinds.includes(parentLoc.block))
			) {
				issues.push({
					severity: "error",
					message: `Edge ${edge.parent} -> ${edge.child}: source kind '${parentLoc.block}' not in source_kinds [${rt.source_kinds.join(", ")}] for relation_type '${edge.relation_type}'`,
					block: "relations",
					field: `${edge.parent}->${edge.child}`,
				});
			}
			if (childLoc && rt.target_kinds && !(rt.target_kinds.includes("*") || rt.target_kinds.includes(childLoc.block))) {
				issues.push({
					severity: "error",
					message: `Edge ${edge.parent} -> ${edge.child}: target kind '${childLoc.block}' not in target_kinds [${rt.target_kinds.join(", ")}] for relation_type '${edge.relation_type}'`,
					block: "relations",
					field: `${edge.parent}->${edge.child}`,
				});
			}
		}

		// Cycle detection — delegate to validateRelations. It performs its own
		// lens/hierarchy/relation_type resolution and emits several edge codes;
		// only its cycle diagnostics are merged here (the parent/child/relation_type
		// resolution above is the authoritative reference-integrity surface, so
		// merging validateRelations' resolution codes too would double-report).
		const itemsByBlock: Record<string, ItemRecord[]> = {};
		for (const [id, loc] of idIndex) {
			(itemsByBlock[loc.block] ??= []).push({ id, ...loc.item });
		}
		try {
			const relResult = validateRelations(config, relations, itemsByBlock);
			for (const ri of relResult.issues) {
				if (ri.code !== "edge_cycle_detected") continue;
				issues.push({
					severity: "error",
					message: ri.message,
					block: "relations",
					code: ri.code,
				});
			}
		} catch {
			/* validateRelations is best-effort for cycle detection; a throw here
			   must not mask the authoritative edge-integrity issues collected above. */
		}

		// ── Config-declared invariants (DEC-0025: vocabulary-neutral) ─────────
		// Replaces the two previously-hardcoded invariants (completed-task-has-
		// verification, decision-cites-forcing-artifact). Every block / status /
		// relation_type / direction literal comes from config.invariants[] DATA;
		// this loop contains no vocabulary literal. Each requires-edge invariant:
		// items in `block` matching `where` must occupy `direction`'s endpoint on
		// ≥1 edge whose relation_type ∈ relation_types — else a diagnostic.
		for (const inv of config.invariants ?? []) {
			if (inv.class !== "requires-edge") continue; // forward-compat: skip unknown classes
			const relTypeSet = new Set(inv.relation_types);
			const satisfied = new Set<string>();
			for (const edge of relations) {
				if (!relTypeSet.has(edge.relation_type)) continue;
				satisfied.add(inv.direction === "as_parent" ? edge.parent : edge.child);
			}
			for (const [id, loc] of idIndex) {
				if (loc.block !== inv.block) continue;
				if (!matchesWhere(loc.item, inv.where)) continue;
				if (satisfied.has(id)) continue;
				issues.push({
					severity: inv.severity ?? "error",
					message: (inv.message ?? `Item '{id}' in block '{block}' violates invariant '${inv.id}'`)
						.replaceAll("{id}", id)
						.replaceAll("{block}", inv.block),
					block: inv.block,
					field: `${id}.${inv.id}`,
					code: inv.id,
				});
			}
		}

		// ── status-consistency invariants (DEC-0040 / FGAP-073) ──────────────
		// Cross-block status drift: for each item in inv.block (optionally gated
		// by when_bucket on the item's own status bucket), inspect edges whose
		// relation_type ∈ inv.relation_types and whose inv.direction endpoint is
		// the item; the OTHER endpoint is the target. Violation when the target's
		// status bucket differs from require_target_bucket, or equals
		// forbid_target_bucket. Vocabulary-free — every literal comes from `inv`
		// or the config-resolved status vocabulary; no block/status/relation
		// string is hardcoded. vocab resolved once, outside the loop.
		const vocab = resolveStatusVocabulary(cwd);
		const bucketOf = (item: Record<string, unknown>): string => vocab[String(item.status)] ?? "unknown";
		for (const inv of config.invariants ?? []) {
			if (inv.class !== "status-consistency") continue;
			const relSet = new Set(inv.relation_types);
			for (const [id, loc] of idIndex) {
				if (loc.block !== inv.block) continue;
				if (inv.when_bucket && bucketOf(loc.item) !== inv.when_bucket) continue;
				for (const edge of relations) {
					if (!relSet.has(edge.relation_type)) continue;
					const selfIsParent = inv.direction === "as_parent";
					if ((selfIsParent ? edge.parent : edge.child) !== id) continue;
					const otherId = selfIsParent ? edge.child : edge.parent;
					const otherLoc = idIndex.get(otherId);
					if (!otherLoc) continue; // dangling endpoint handled by edge-integrity above
					const otherBucket = bucketOf(otherLoc.item);
					const violateRequire = inv.require_target_bucket !== undefined && otherBucket !== inv.require_target_bucket;
					const violateForbid = inv.forbid_target_bucket !== undefined && otherBucket === inv.forbid_target_bucket;
					if (violateRequire || violateForbid) {
						issues.push({
							severity: inv.severity ?? "error",
							message: (inv.message ?? `Item '{id}' (block '{block}') status-consistency '${inv.id}'`)
								.replaceAll("{id}", id)
								.replaceAll("{block}", inv.block),
							block: inv.block,
							field: `${id}.${inv.id}`,
							code: inv.id,
						});
					}
				}
			}
		}
	}

	// Cross-block status-vocabulary check (FGAP-025): an item status value absent
	// from the declared vocabulary silently buckets to "unknown" in currentState /
	// status-consistency invariants — surface it. Vocabulary-neutral: reads the
	// config-driven vocab ("status" is the established item status field, same read
	// as currentState / bucketOf). A value mapped to the "unknown" BUCKET is still a
	// key (recognized) and is NOT flagged; only a value with NO key is. Warning-only.
	{
		const statusVocab = resolveStatusVocabulary(cwd);
		for (const [sid, sloc] of idIndex) {
			const sval = sloc.item.status;
			if (sval === undefined || sval === null) continue;
			if (!(String(sval) in statusVocab)) {
				issues.push({
					severity: "warning",
					message: `Item '${sid}' (block '${sloc.block}') status '${String(sval)}' is not in the declared status vocabulary — it silently buckets to 'unknown'.`,
					block: sloc.block,
					field: "status",
					code: "status_unknown_value",
				});
			}
		}
	}

	// Lens-validator dispatch (Step 7 / pi-context Divergence 3): iterate every
	// validator registered via registerLensValidator and merge its issues into
	// the project-validation result. Validators are guarded individually so a
	// throwing validator surfaces as a warning issue rather than a hard fail —
	// keeps the whole-project validate command robust against per-lens bugs.
	for (const v of getLensValidators()) {
		try {
			const result = v.validate(cwd);
			for (const li of result.issues) {
				issues.push({
					severity: li.severity,
					message: li.message,
					block: li.block,
					...(li.field !== undefined ? { field: li.field } : {}),
					code: li.code,
				});
			}
		} catch (err) {
			issues.push({
				severity: "warning",
				message: `Lens validator '${v.name}' threw: ${err instanceof Error ? err.message : String(err)}`,
				block: "lens-validator",
				code: `lens_validator_failed:${v.name}`,
			});
		}
	}

	const errorCount = issues.filter((i) => i.severity === "error").length;
	const warningCount = issues.filter((i) => i.severity === "warning").length;
	return {
		status: errorCount > 0 ? "invalid" : warningCount > 0 ? "warnings" : "clean",
		issues,
	};
}

// ── Verification-Gated Task Completion ─────────────────────────────────────

export interface CompleteTaskResult {
	taskId: string;
	verificationId: string;
	verificationStatus: string;
	previousStatus: string;
}

/**
 * Gate task completion on verification. Reads the verification block to confirm
 * a passing verification entry exists targeting this task, then atomically
 * updates the task status to "completed" with the verification cross-reference.
 */
export function completeTask(cwd: string, taskId: string, verificationId: string): CompleteTaskResult {
	// 1. Read and validate verification entry
	let verData: { verifications?: Record<string, unknown>[] };
	try {
		verData = readBlock(cwd, "verification") as typeof verData;
	} catch {
		throw new Error(`Verification block not found — cannot complete task '${taskId}' without verification`);
	}

	const verifications = Array.isArray(verData.verifications) ? verData.verifications : [];
	const verification = verifications.find((v) => v.id === verificationId);
	if (!verification) {
		throw new Error(`Verification '${verificationId}' not found in verification block`);
	}

	if (verification.target !== taskId || verification.target_type !== "task") {
		throw new Error(
			`Verification '${verificationId}' targets '${verification.target}' (${verification.target_type}), not task '${taskId}'`,
		);
	}

	if (verification.status !== "passed") {
		throw new Error(
			`Verification '${verificationId}' status is '${verification.status}', not 'passed' — cannot complete task`,
		);
	}

	// 2. Read and validate task entry
	let taskData: { tasks?: Record<string, unknown>[] };
	try {
		taskData = readBlock(cwd, "tasks") as typeof taskData;
	} catch {
		throw new Error(`Tasks block not found — cannot complete task '${taskId}'`);
	}

	const tasks = Array.isArray(taskData.tasks) ? taskData.tasks : [];
	const task = tasks.find((t) => t.id === taskId);
	if (!task) {
		throw new Error(`Task '${taskId}' not found in tasks block`);
	}

	const currentStatus = String(task.status);
	if (currentStatus === "completed") {
		throw new Error(`Task '${taskId}' is already completed`);
	}
	if (currentStatus === "cancelled") {
		throw new Error(`Task '${taskId}' is already cancelled`);
	}

	// 3. Update task status with verification cross-reference
	updateItemInBlock(cwd, "tasks", "tasks", (t) => t.id === taskId, {
		status: "completed",
		verification: verificationId,
	});

	return {
		taskId,
		verificationId,
		verificationStatus: String(verification.status),
		previousStatus: currentStatus,
	};
}
