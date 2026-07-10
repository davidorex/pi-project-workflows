/**
 * Project SDK — queryable surface for project block state, discovery,
 * and derived metrics. Computes everything dynamically from filesystem
 * and git — no cache, no stale data.
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readBlock, readBlockForDir, resolveGitRefOrNull, updateItemInBlock } from "./block-api.js";
import { computeFileBytesHash } from "./content-hash.js";
import {
	appendRelation,
	appendRelations,
	type ConfigBlock,
	counterEndpoint,
	type Edge,
	type EdgeEndpoint,
	endpointIdentity,
	endpointKey,
	findUnmaterializedAssets,
	type ItemRecord,
	isSkeletonConfig,
	loadConfig,
	loadConfigForDir,
	loadRelations,
	primaryEndpoint,
	type RawEndpoint,
	type RelationTypeDecl,
	type RollupDecl,
	removeRelation,
	validateRelations,
	writeRelations,
} from "./context.js";
import { resolveContextDir, SCHEMAS_DIR, schemaPath, schemasDir, tryResolveContextDir } from "./context-dir.js";
import { loadRegistry, resolveAlias, resolveSubstrateDir } from "./context-registry.js";
import type { DispatchContext } from "./dispatch-context.js";
import { cleanGitEnv } from "./git-env.js";
import { getLensValidators } from "./lens-validator.js";
import { getProjectMigrationRegistryForDir } from "./migration-registry-loader.js";
import { addressInto, discoverArrayKey, pageArray } from "./read-element.js";
import { ValidationError, validateBlockWithMigrationForDir, validateFromFile } from "./schema-validator.js";
import { findNestedIdBearingArrays } from "./schema-write.js";
import { resolveStateDerivation, resolveStatusVocabulary } from "./status-vocab.js";
import { topoSort } from "./topo.js";

// Re-export substrate SDK so consumers can keep importing through context-sdk.
export {
	type BlockKindDecl,
	type CompositionMember,
	type ConfigBlock,
	type ContextData,
	type CurationSuggestion,
	counterEndpoint,
	displayName,
	type Edge,
	type EdgeEndpoint,
	edgesForLens,
	endpointBin,
	endpointIdentity,
	endpointKey,
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
	type NormalizedEndpoint,
	normalizeEndpoint,
	primaryEndpoint,
	type RawEndpoint,
	type RelationTypeDecl,
	type RollupDecl,
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
 * via `schemasDir(cwd)`). Returns sorted list of
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
 * `schemas/` subdirectory (resolved via `schemasDir(cwd)`) for schemas whose root type has at least one array property.
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
 * `schemasDir(cwd)`) and parses each schema.
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
 * Zero-loss derived "where are we + what's next" state — the canonical
 * primitive for atomic self-direction (previously filtering/walking/
 * cross-referencing existed only as separate primitives the caller had to
 * compose by hand), exposed dual-surface to both the Pi runtime and the
 * Claude Code harness rather than hand-maintained files like
 * MEMORY.md/HANDOFF.md drifting independently. A pure function of `.project`
 * substrate — focus, in-flight units,
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
	/** atomic-next, ranked: unblocked planned tasks (topo order) then open issues (by priority) then open framework-gaps (by priority) */
	nextActions: { id: string; kind: string; priority?: string; reason: string }[];
	/** planned tasks whose task_depends_on_task dependency parents are not ALL completed */
	blocked: { id: string; block: string; blockedBy: string[] }[];
	/**
	 * derived membership-rollups (milestones) per `state_derivation.rollups`. For
	 * each rollup entry, members are the PARENT items of `membership_relation` edges
	 * whose child is the rollup item; `status` is the rollup entry's `complete_status`
	 * when ≥1 member exists and every member buckets to complete, else its
	 * `incomplete_status`. `status` is a config-declared string (the stock rollup
	 * emits `reached` / `planned`); `phaseCount` is the member count.
	 */
	milestones: { id: string; status: string; phaseCount: number }[];
}

/**
 * The five-state bootstrap progression, derived purely from the filesystem —
 * nothing stored. Consumed by the `/context start` conductor (the single,
 * always-safe, state-derived bootstrap entry point that makes out-of-order
 * init/accept-all/install unrepresentable), the
 * dispatch READY-gate, and the startup-slot hint.
 *
 * `skeleton` sits between `no-config` and `not-installed`:
 * init / switch -c now write a minimal schema-valid config empty of vocabulary,
 * so a freshly-bootstrapped substrate lands at `skeleton` rather than `no-config`
 * — onward paths are accept-all (adopt the packaged catalog) OR amend/edit.
 */
export type BootstrapState = "no-pointer" | "no-config" | "skeleton" | "not-installed" | "ready";

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
 *   skeleton      — config present but empty of vocabulary (the init / switch -c
 *                   minimal config, written instead of leaving the substrate
 *                   config-less); onward via accept-all
 *                   OR amend/edit
 *   not-installed — config present + populated, some declared installed_* asset is absent
 *   ready         — config present, all declared assets materialized (or none declared)
 *
 * Does NOT swallow corruption: a malformed `config.json` propagates
 * `loadConfig`'s ValidationError — the five states are the NORMAL progression;
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
	if (isSkeletonConfig(config)) {
		return { state: "skeleton", contextDir, missing: empty };
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
		lastCommit = execSync("git log -1 --format=%h", { cwd, encoding: "utf-8", env: cleanGitEnv() }).trim();
		lastCommitMessage = execSync("git log -1 --format=%s", { cwd, encoding: "utf-8", env: cleanGitEnv() }).trim();
	} catch {
		/* not a git repo or no commits */
	}

	// Recent commits
	let recentCommits: string[] = [];
	try {
		const log = execSync("git log --oneline -5", { cwd, encoding: "utf-8", env: cleanGitEnv() }).trim();
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

	// Phases from the <substrateDir>/phase.json array-block (a top-level
	// array-block, not one file per phase keyed by integer).
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
 * Edge-direction contract for blocked/ready derivation (the same convention as
 * roadmap-plan's topoSort-preds mapping for milestone_precedes_milestone —
 * preds are parents of edges whose child is the node): a
 * `task_depends_on_task` edge `{parent: D, child: T}`
 * means task T DEPENDS ON task D, so D must reach status "completed" before T is
 * unblocked. (relation name source_verb_target = task_depends_on_task ⇒ child is
 * the source/dependent, parent is the target/prerequisite; config display_name
 * "depends on task".)
 *
 * Readiness ALSO honors `task_gated_by_item` gates (the NOW slice of
 * feature/story-level gating — task-level gate-awareness shipped first,
 * leaving feature/story as residual future work): a
 * `task_gated_by_item` edge `{parent: T, child: G}` means task T is GATED BY
 * item G (the gate target, of any kind — gap/decision/feature/task/…), so G must
 * reach the "complete" bucket before T's gate releases. A planned task with any
 * gate target NOT in the "complete" bucket is reported in `blocked` (the target
 * id present in `blockedBy`, unioned with unsatisfied dep-parents) and excluded
 * from `nextActions`; a gate target reaching "complete" releases the gate. Gate
 * satisfaction is `bucket(target) === "complete"` via the same status-vocabulary
 * the status-consistency invariant engine uses — kind-general, no per-kind
 * special-casing (gap→closed, decision→enacted, feature→complete, task→completed
 * all bucket to "complete"). A dangling gate target (id resolves to no item) is
 * treated as satisfied/non-blocking, mirroring the dangling-dep guard.
 *
 * Scope is strictly the literal relation_type `task_gated_by_item`:
 * `decision_gated_by_item` and other non-task `*_gated_by_item` edges are inert
 * here (currentState buckets only tasks). A gate target in a terminal-abandoned
 * status (wontfix/superseded/cancelled — buckets to "unknown", NOT "complete")
 * keeps the gated task blocked under the `=== "complete"` rule; promoting such
 * states to gate-releasing, and config-driven generalization to all gate
 * relation kinds, is a refinement boundary for the config-declared
 * state-derivation registry, out of scope here.
 */

/**
 * Render a `next_ranked` entry's `reason_template`, substituting `{token}`
 * occurrences from `tokens` (every value stringified). Tokens absent from the
 * map are left literal. An undefined template yields the empty string — the
 * deriver carries no kind-coupled reason default; the stock registry declares
 * the templates that reproduce the canonical reason strings.
 */
function renderReasonTemplate(template: string | undefined, tokens: Record<string, string | undefined>): string {
	if (template === undefined) return "";
	return template.replace(/\{(\w+)\}/g, (match, key: string) => {
		const v = tokens[key];
		return v !== undefined ? v : match;
	});
}

/**
 * Rollup-aware completeness — the ONE truth model for "is this item complete",
 * in service of currency-by-construction (closing the gap where a milestone
 * could read as "reached" by live derivation while still gate-blocking its own
 * tasks via a stale stored status). A kind declared in `state_derivation.rollups` is
 * DERIVED-status: complete iff it has ≥1 member (via the rollup's membership
 * relation, oriented by `role_direction`) and every member is complete under
 * this same function (recursively rollup-aware; a `visiting` guard makes a
 * membership cycle derive not-complete instead of recursing forever). Every
 * other kind is complete iff its status buckets to "complete". SHARED by
 * `currentState` (gate satisfaction + the milestones facet) and the
 * `derived-status` invariant class in `validateContext`, so the derivation and
 * the divergence detector cannot disagree.
 */
export function derivedRollupComplete(
	index: SubstrateIndex,
	edges: Edge[],
	roleDirection: ReadonlyMap<string, "as_parent" | "as_child">,
	rollupByKind: ReadonlyMap<string, RollupDecl>,
	bucketOf: (item: Record<string, unknown>) => string,
	itemId: string,
	visiting: Set<string> = new Set(),
): boolean {
	const loc = index.byRefname.get(itemId);
	if (loc === undefined) return false;
	const entry = rollupByKind.get(loc.block);
	if (entry === undefined) return bucketOf(loc.item) === "complete";
	if (visiting.has(itemId)) return false;
	visiting.add(itemId);
	const dir = roleDirection.get(entry.membership_relation) ?? "as_child";
	const memberIds = edges
		.filter((e) => e.relation_type === entry.membership_relation && endpointKey(primaryEndpoint(e, dir)) === itemId)
		.map((e) => endpointKey(counterEndpoint(e, dir)));
	return (
		memberIds.length >= 1 &&
		memberIds.every((memberId) =>
			derivedRollupComplete(index, edges, roleDirection, rollupByKind, bucketOf, memberId, visiting),
		)
	);
}

export function currentState(cwd: string): CurrentState {
	// Tolerate any substrate-read failure (no .project, malformed config, etc.)
	// by collapsing to the empty state — this is a pure read surface.
	let index: SubstrateIndex;
	try {
		index = buildIdIndex(cwd);
	} catch {
		index = { dir: cwd, byRefname: new Map(), byOid: new Map(), items: [] };
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
	// is compared in source (per the vocabulary-neutral-canon convention). bucket(item) maps
	// a raw item.status string to its StatusBucket, defaulting to "unknown".
	const vocab = resolveStatusVocabulary(cwd);
	const bucket = (item: Record<string, unknown>): string => vocab[String(item.status)] ?? "unknown";

	// Resolve the config-declared derivation registry — added so this deriver no
	// longer hardcodes stock kinds and is inert on a custom-vocabulary substrate. When
	// it is ABSENT, every coupling below is unconfigured, so the function returns
	// the truthful "state-derivation not configured" signal — a state distinct
	// from a configured-but-empty substrate (which derives normally to
	// `focus: "no active focus."` + empty arrays). All 16 couplings below read
	// `sd.*`; no kind / relation / rank / status / head-size literal remains.
	const sd = resolveStateDerivation(cwd);
	if (sd === null) {
		return { focus: "state-derivation not configured", inFlight: [], nextActions: [], blocked: [], milestones: [] };
	}

	// ── inFlight: items of an `in_flight.kinds` block bucketing to in_flight.bucket ─
	const inFlight: CurrentState["inFlight"] = [];
	for (const loc of index.byRefname.values()) {
		if (!sd.in_flight.kinds.includes(loc.block)) continue;
		if (bucket(loc.item) !== sd.in_flight.bucket) continue;
		inFlight.push({
			id: loc.id,
			block: loc.block,
			description: typeof loc.item.description === "string" ? loc.item.description : "",
		});
	}

	// Per-relation role_direction declarations (the explicit field carrying edge
	// orientation, rather than a guessed direction) — consulted by the
	// rollup-aware completeness check below, the blocking partition, and the
	// milestones rollup. Hoisted above isCompleted so all three read ONE map.
	const roleDirection = new Map<string, "as_parent" | "as_child">();
	for (const rt of loadConfig(cwd)?.relation_types ?? []) {
		if (rt.role_direction !== undefined) roleDirection.set(rt.canonical_id, rt.role_direction);
	}

	// A target is complete when it resolves to a known item that IS complete under
	// its kind's truth model (part of currency-by-construction, closing the gap
	// where a milestone could read as "reached" by live derivation while still
	// gate-blocking its own tasks via a stale stored status):
	//   • a kind declared in `sd.rollups` is DERIVED-status — its stored status
	//     field is canon-forbidden to author and may lag, so completeness is the
	//     membership rollup itself (≥1 member, every member complete), recursively
	//     rollup-aware for nested rollup kinds, with a visiting-set guard so a
	//     membership cycle derives not-complete instead of recursing forever;
	//   • every other kind keeps the SHARED status-vocab bucketing (extended so a
	//     task's `task_gated_by_item` gate, not just `task_depends_on_task`
	//     dependency, is honored, the same check the status-consistency invariant engine uses),
	//     byte-identical to the prior behavior.
	// The milestones[] rollup below consumes THIS function for its reached
	// verdict, so gate satisfaction and the reported milestone status agree by
	// construction within a single read — the two can no longer split-brain. The
	// derived-status invariant class evaluates the SAME shared helper, so
	// validate-side divergence verdicts match the derivation too.
	// Kind set + membership relation come from config (`sd.rollups` +
	// role_direction); no kind / relation literal here (per the
	// vocabulary-neutral-canon convention).
	const rollupEntryByKind = new Map(sd.rollups.map((entry) => [entry.kind, entry]));
	const isCompleted = (itemId: string): boolean =>
		derivedRollupComplete(index, edges, roleDirection, rollupEntryByKind, bucket, itemId);

	// Blocking-relation adjacency, driven by `sd.blocked_by.relation_types`. The
	// two stock relations use OPPOSITE endpoint directions, preserved exactly:
	//   • task_depends_on_task — DEPENDENCY direction: parents of edges whose CHILD
	//     is the item (the prerequisites of the item).
	//   • task_gated_by_item   — GATE direction: children of edges whose PARENT is
	//     the item (the gate targets the item waits on).
	// A relation present in the set with no known direction rule defaults to the
	// DEPENDENCY direction (parent-of-edge-with-child=item). Which relations
	// participate is gated on membership in `sd.blocked_by.relation_types`, so an
	// empty/absent relation is simply not consulted.
	// Partition the configured blocking relations into GATE-direction vs
	// DEPENDENCY-direction by each relation's declared `role_direction` (the
	// explicit field carrying edge orientation, rather than a guessed direction),
	// replacing the former single `task_gated_by_item` string literal:
	//   • role_direction === "as_child" → GATE direction: the relation's PRIMARY
	//     role (the gate) sits at edge.child and the waiting item at edge.parent, so
	//     the item's gates are the CHILDREN of edges whose PARENT is the item.
	//   • otherwise (as_parent OR unset) → DEPENDENCY direction: the item's
	//     prerequisites are the PARENTS of edges whose CHILD is the item.
	// For the stock set {task_depends_on_task (as_parent), task_gated_by_item
	// (as_child)} this partition is identical to the pre-change literal split, so
	// blocked / nextActions / blockedBy stay byte-identical; any *_gated_by_item
	// sibling later added to blocked_by routes to the gate direction by
	// construction (no literal to extend). A blocked_by relation the config does
	// NOT register with a role_direction reads as the DEPENDENCY default.
	const blockedByRels = new Set(sd.blocked_by.relation_types);
	const gateDirRels = new Set([...blockedByRels].filter((rt) => roleDirection.get(rt) === "as_child"));
	const depDirRels = new Set([...blockedByRels].filter((rt) => roleDirection.get(rt) !== "as_child"));
	const dependencyPredsOf = (itemId: string): string[] =>
		edges
			.filter((e) => depDirRels.has(e.relation_type) && endpointKey(e.child) === itemId)
			.map((e) => endpointKey(e.parent));
	const gatePredsOf = (itemId: string): string[] =>
		edges
			.filter((e) => gateDirRels.has(e.relation_type) && endpointKey(e.parent) === itemId)
			.map((e) => endpointKey(e.child));
	// All preds (deps ∪ gates) in discovery order — used by the topo ordering below.
	const allPredsOf = (itemId: string): string[] => [...dependencyPredsOf(itemId), ...gatePredsOf(itemId)];
	const incompletePreds = (itemId: string): string[] =>
		dependencyPredsOf(itemId).filter((dep) => index.byRefname.has(dep) && !isCompleted(dep));
	const unsatisfiedGates = (itemId: string): string[] =>
		gatePredsOf(itemId).filter((target) => index.byRefname.has(target) && !isCompleted(target));

	// The "planned tasks" set is the next_ranked entry that has NO rank_field (the
	// stock tasks entry, topo-ordered). It drives both blocked + ready derivations.
	const topoEntry = sd.next_ranked.find((e) => e.rank_field === undefined);
	const plannedTasks: { id: string; loc: ItemLocation }[] = [];
	if (topoEntry !== undefined) {
		for (const loc of index.byRefname.values()) {
			if (loc.block === topoEntry.kind && bucket(loc.item) === topoEntry.bucket) {
				plannedTasks.push({ id: loc.id, loc });
			}
		}
	}

	// blockedBy(T) = UNION of T's unsatisfied dependency-direction preds and
	// unsatisfied gate-direction targets, de-duplicated while preserving discovery
	// order (deps first, then gates). With no gate relation configured / no gate
	// edges present this collapses to the dependency-only set.
	const blockersOf = (taskId: string): string[] => {
		const result: string[] = [];
		const seen = new Set<string>();
		for (const blocker of [...incompletePreds(taskId), ...unsatisfiedGates(taskId)]) {
			if (seen.has(blocker)) continue;
			seen.add(blocker);
			result.push(blocker);
		}
		return result;
	};

	// ── blocked: planned tasks with at least one unsatisfied dep or gate ─────────
	const blocked: CurrentState["blocked"] = [];
	const blockedIds = new Set<string>();
	for (const { id, loc } of plannedTasks) {
		const blockedBy = blockersOf(id);
		if (blockedBy.length > 0) {
			blocked.push({ id, block: loc.block, blockedBy });
			blockedIds.add(id);
		}
	}

	// ── nextActions (atomic-next, ranked) ──────────────────────────────────────
	// Iterate `sd.next_ranked` IN ARRAY ORDER — array order IS the cross-kind push
	// order (stock: topo-ordered tasks, then priority-ranked issues, then
	// priority-ranked gaps).
	const nextActions: CurrentState["nextActions"] = [];
	for (const entry of sd.next_ranked) {
		if (entry.rank_field !== undefined) {
			// Field-ranked entry (stock: framework-gaps by `priority`). Select items of
			// `entry.kind` at `entry.bucket`, rank by index in `entry.rank_order` (value
			// not listed → large sentinel 99) then by id.
			const rankField = entry.rank_field;
			const rankIndex: Record<string, number> = {};
			(entry.rank_order ?? []).forEach((v, i) => {
				rankIndex[v] = i;
			});
			const selected: { id: string; value?: string }[] = [];
			for (const loc of index.byRefname.values()) {
				if (loc.block !== entry.kind) continue;
				if (bucket(loc.item) !== entry.bucket) continue;
				const raw = loc.item[rankField];
				selected.push({ id: loc.id, value: typeof raw === "string" ? raw : undefined });
			}
			selected.sort((a, b) => {
				const ra = a.value !== undefined ? (rankIndex[a.value] ?? 99) : 99;
				const rb = b.value !== undefined ? (rankIndex[b.value] ?? 99) : 99;
				if (ra !== rb) return ra - rb;
				return a.id.localeCompare(b.id);
			});
			for (const s of selected) {
				nextActions.push({
					id: s.id,
					kind: entry.label,
					...(s.value !== undefined ? { [rankField]: s.value } : {}),
					reason: renderReasonTemplate(entry.reason_template, { rank_value: s.value ?? "unset", id: s.id }),
				});
			}
		} else {
			// Topo-ordered entry (stock: tasks). Ready = planned items NOT in `blocked`,
			// ordered via topoSort over the planned nodes with preds = dependency preds
			// ∪ gate targets. topoSort only counts edges between graph nodes, so preds
			// outside the planned set (completed / non-task) don't gate the ordering.
			const { order } = topoSort(
				plannedTasks,
				(t) => t.id,
				(t) => allPredsOf(t.id),
			);
			for (const id of order) {
				if (blockedIds.has(id)) continue;
				nextActions.push({ id, kind: entry.label, reason: renderReasonTemplate(entry.reason_template, { id }) });
			}
		}
	}

	// Cap nextActions at the config-declared scannable head — derivation can
	// surface a long backlog; the head is the actionable slice for "what's next".
	const cappedNextActions = nextActions.slice(0, sd.head_size);

	// ── milestones: config-declared membership rollups ──────────────────────────
	// For each `sd.rollups` entry, orientation is read from the membership
	// relation's declared `role_direction`: the CONTAINER (the rollup
	// item itself) sits at the PRIMARY endpoint, its MEMBERS at the COUNTER
	// endpoint. `phase_positioned_in_milestone` is `as_child` (container=milestone
	// at edge.child, member=phase at edge.parent), so `primaryEndpoint`===child /
	// `counterEndpoint`===parent reproduces the prior filter-child / map-parent
	// selection exactly. A membership relation the config does not register with a
	// `role_direction` defaults to `as_child` (the pre-explicit-orientation
	// container=child convention). The rollup emits `complete_status` when ≥1 member exists and
	// every member id resolves to a known item bucketing to complete; else
	// `incomplete_status` (covering no-members + any-incomplete). Every comparison
	// routes through bucket() — no raw status literal.
	const milestones: CurrentState["milestones"] = [];
	for (const entry of sd.rollups) {
		const dir = roleDirection.get(entry.membership_relation) ?? "as_child";
		for (const loc of index.byRefname.values()) {
			if (loc.block !== entry.kind) continue;
			const memberIds = edges
				.filter((e) => e.relation_type === entry.membership_relation && endpointKey(primaryEndpoint(e, dir)) === loc.id)
				.map((e) => endpointKey(counterEndpoint(e, dir)));
			const phaseCount = memberIds.length;
			// The reached verdict IS the rollup-aware isCompleted — the same function
			// gate satisfaction consults — so the reported milestone status and the
			// gates it releases cannot diverge within this read (currency-by-construction).
			const reached = isCompleted(loc.id);
			milestones.push({
				id: loc.id,
				status: reached ? entry.complete_status : entry.incomplete_status,
				phaseCount,
			});
		}
	}
	milestones.sort((a, b) => a.id.localeCompare(b.id));

	// ── focus: single derived string ───────────────────────────────────────────
	let focus: string;
	if (inFlight.length > 0) {
		focus = `in-flight: ${inFlight.map((t) => t.id).join(", ")}`;
	} else {
		// Fall back to the first item of `focus_fallback.kind` bucketing to
		// `focus_fallback.bucket` (stock: an in-progress phase).
		let fallbackItem: { id?: string; name?: string } | null = null;
		for (const loc of index.byRefname.values()) {
			if (loc.block !== sd.focus_fallback.kind) continue;
			if (bucket(loc.item) !== sd.focus_fallback.bucket) continue;
			fallbackItem = { id: loc.id, name: typeof loc.item.name === "string" ? loc.item.name : undefined };
			break;
		}
		if (fallbackItem !== null) {
			const label = fallbackItem.name ? `${fallbackItem.id} (${fallbackItem.name})` : fallbackItem.id;
			focus = `${sd.focus_fallback.kind}: ${label}`;
		} else {
			focus = "no active focus.";
		}
	}

	return { focus, inFlight, nextActions: cappedNextActions, blocked, milestones };
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

// discoverArrayKey lives in read-element.ts (the lowest pure layer) and is
// imported above — ONE copy of the single-top-level-array heuristic shared by
// filterBlockItems / readBlockPage / serializeForRead. Mirrors the assumption
// in scripts/orchestrator/inject-context-items.ts used across .project/ writes.

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
 * Closes part of the phase-2 query-surface work in the multi-phase closure of
 * the earlier substrate-bootstrap-hardcoding gap.
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
 * Reads the block then routes id-resolution through the shared addressInto primitive
 * (id matches `.id` or `.canonical_id`), so block-item lookup uses the same element
 * addressing as every other read surface. Missing block / multiple top-level arrays
 * THROW (readBlock + discoverArrayKey via addressInto); no-array block or id-not-found → null —
 * closing the earlier gap where read-block was all-or-nothing, with no way to
 * fetch one item by id without fetching the whole (often 100KB+) block.
 */
export function readBlockItem(cwd: string, blockName: string, id: string): unknown | null {
	const data = readBlock(cwd, blockName) as Record<string, unknown>;
	// A block with multiple top-level arrays must throw (single-array assumption);
	// addressInto tolerates ambiguity, so probe discoverArrayKey directly first to
	// preserve the documented throw, then address into the resolved array.
	discoverArrayKey(data);
	const hit = addressInto(data, { id });
	return hit.found ? hit.value : null;
}

/**
 * Paginate a block's items. Reads the block, discovers its single top-level array,
 * then routes the slice/total/hasMore math through the shared `pageArray` primitive
 * (ONE pagination implementation — serializeForRead uses the same). Returns the FULL
 * count as `total` (not the page length) and `hasMore = offset + limit < total`.
 * No-array block → {items:[],total:0,hasMore:false}; offset ≥ total → empty items
 * with correct total. Missing block / multiple top-level arrays propagate the throw
 * (consistent with filterBlockItems) — the same fetch-one-page-without-the-whole-block
 * primitive that closes the earlier all-or-nothing read gap.
 */
export function readBlockPage(
	cwd: string,
	blockName: string,
	opts: { offset?: number; limit?: number } = {},
): BlockPage {
	const data = readBlock(cwd, blockName) as Record<string, unknown>;
	const arrayKey = discoverArrayKey(data);
	const arr = arrayKey ? (data[arrayKey] as unknown[]) : [];
	return pageArray(arr, opts);
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
 * Cross-block join (HYBRID) — closing the earlier gap where natural queries
 * like "completed tasks with their verifications" required N+1 round-trip
 * tool calls. Mode = exactly one of relationType (edge) XOR
 * leftField+rightField (field). Returns one JoinResult per left item (after leftPredicate),
 * right always an array. Edge mode is native to the closure-table-edges-only
 * reference model (relations.json); field mode is a
 * DEPRECATED backward-compat path that joins on a shared field value (formerly inline-FK,
 * now arbitrary shared fields). NO validation uses field mode — cross-block validation is
 * edge-only since references became edges from the start (rather than migrated
 * in place); field mode here is a query convenience, not a reference surface.
 * Reuses filterBlockItems / readBlock / discoverArrayKey / loadRelations / buildIdIndex.
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
	const index = buildIdIndex(cwd);
	return leftItems.map((left) => {
		const leftId = left.id;
		const right: Record<string, unknown>[] = [];
		if (typeof leftId === "string") {
			for (const e of edges) {
				const here = leftEndpoint === "parent" ? endpointKey(e.parent) : endpointKey(e.child);
				if (here !== leftId) continue;
				const otherId = leftEndpoint === "parent" ? endpointKey(e.child) : endpointKey(e.parent);
				const loc = index.byRefname.get(otherId);
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
	/**
	 * The item's refname — its top-level string `id`. Exposed on the locator so
	 * iteration over a {@link SubstrateIndex.items} list can recover the key
	 * without re-deriving it from `item.id` (the value is identical: `id` is set
	 * to `item.id` at index-build time). Lookup maps (`byRefname`) key on this
	 * same value.
	 */
	id: string;
	block: string;
	arrayKey: string;
	item: Record<string, unknown>;
}

/**
 * Split-surface index over a single substrate's id-bearing items (Cycle 7 /
 * Phase F1). Replaces the prior `Map<refname, ItemLocation>` return of
 * {@link buildIdIndex}/{@link buildIdIndexForDir} by separating the two roles
 * that the single Map previously served:
 *
 *   - `byRefname` — point-lookup map keyed by refname (`item.id`). First-writer-
 *     wins on refname collision across blocks (one entry per distinct refname),
 *     exactly as the prior Map. This is the lookup surface every `.get`/`.has`
 *     consumer reads.
 *   - `items` — the iteration surface: ONE entry per id-bearing item, in scan
 *     order. Whole-index `for…of` consumers iterate this so a future dual-keyed
 *     lookup map (F2's oid keys) cannot inflate iteration (anti-double-count).
 *   - `byOid` — point-lookup map keyed by an item's string `oid`, ONE entry per
 *     item that HAS a string `oid`. Populated here but DORMANT this cycle —
 *     no F1 consumer reads it; it is the seam Cycle-8/F2 fills with cross-
 *     substrate (oid-keyed) resolution. Near-empty on current real data (most
 *     items are unstamped). First-writer-wins on oid collision, mirroring
 *     `byRefname`'s collision discipline.
 *
 * `dir` is the scanned substrate directory; `substrate_id` is `config.substrate_id`
 * when the config declares one (undefined otherwise — absence does NOT throw,
 * so a pre-identity substrate still indexes cleanly).
 */
export interface SubstrateIndex {
	substrate_id?: string;
	dir: string;
	byRefname: Map<string, ItemLocation>;
	byOid: Map<string, ItemLocation>;
	items: ItemLocation[];
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
 * config-registration time rather than fixture-write time. Closes the PLAN-
 * id-prefix collision class (between the layer-plans and plan block kinds,
 * both using PLAN-NNN ids) structurally.
 *
 * Longest-prefix wins so that compatible registrations like `R-` and
 * `REVIEW-` resolve unambiguously.
 */
export function expectedBlockForId(id: string, cfg: ConfigBlock | null): string | null {
	if (!cfg) return null;
	let best: { prefix: string; canonical: string } | null = null;
	for (const bk of cfg.block_kinds) {
		// An empty prefix matches every id (startsWith("")) — it must never act as
		// a catch-all claiming unprefixed ids (the earlier defect where an empty
		// prefix accidentally matched everything, breaking the id-index invariant
		// for freeform-slug-id blocks like conventions). Empty prefix is a LEGITIMATE
		// signal for slug-id blocks (e.g. conventions, whose flat slug-ids reflect an
		// underspecified schema for lens/relational discoverability) that don't use
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
 *     ordinary array-block, not one file per phase keyed by integer (PHASE-NNN ids in `phase.json` under
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
export function buildIdIndex(cwd: string): SubstrateIndex {
	const blockDir = tryResolveContextDir(cwd);
	if (blockDir === null) {
		// No active pointer — return an empty SubstrateIndex (dir set to cwd so
		// the surface is still well-formed; substrate_id undefined). Mirrors the
		// prior empty-Map return.
		return { dir: cwd, byRefname: new Map(), byOid: new Map(), items: [] };
	}
	return buildIdIndexForDir(blockDir, cwd, loadConfig(cwd));
}

/**
 * Build the item-id → location index for an ARBITRARY substrate directory
 * (the dir-targeted twin of `buildIdIndex`, which resolves the active pointer
 * dir). Used by the relation porcelain to index a FOREIGN substrate (resolved
 * via the registry from a `<alias>:` selector) as well as the active substrate.
 *
 * `substrateDir` is the absolute substrate directory to scan; `cfg` is that
 * dir's config (drives the prefix-vs-block invariant via `expectedBlockForId`),
 * passed by the caller so this function performs no pointer resolution. Reads
 * each block file via `readBlockForDir` so the version-aware validation hook
 * fires identically to the active-dir path. Same first-writer-wins collision
 * semantics + prefix-invariant throw as `buildIdIndex`.
 */
export function buildIdIndexForDir(substrateDir: string, _cwd: string, cfg: ConfigBlock | null): SubstrateIndex {
	// `_cwd` is part of the locked F1 signature (the active-dir caller threads its
	// cwd; the foreign-substrate caller threads the foreign dir) so F2 can resolve
	// registry-relative concerns from it. F1's body reads config explicitly via
	// `cfg`, so `_cwd` is currently unused — retained for the forward-compatible
	// surface rather than dropped and re-added next cycle.
	const byRefname = new Map<string, ItemLocation>();
	const byOid = new Map<string, ItemLocation>();
	const items: ItemLocation[] = [];
	const index: SubstrateIndex = {
		substrate_id: cfg?.substrate_id,
		dir: substrateDir,
		byRefname,
		byOid,
		items,
	};
	if (!fs.existsSync(substrateDir)) return index;

	// Top-level block files — scan every array property for items with `id`.
	for (const file of fs.readdirSync(substrateDir)) {
		if (!file.endsWith(".json")) continue;
		const blockName = file.replace(".json", "");
		let data: Record<string, unknown>;
		try {
			data = readBlockForDir(substrateDir, blockName) as Record<string, unknown>;
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

				// `items` carries ONE entry per id-bearing item in scan order (the
				// iteration surface). `byRefname` is first-writer-wins on refname
				// collision (one entry per distinct refname) — exactly the prior
				// single-Map semantics. The locator that lands in `items` is the
				// same object reference stored under the maps when this is the first
				// writer for its refname, so iteration and lookup share identity.
				const loc: ItemLocation = { id: idVal, block: blockName, arrayKey, item };
				items.push(loc);
				if (!byRefname.has(idVal)) {
					byRefname.set(idVal, loc);
				}
				// `byOid` — populated for items carrying a string `oid` (DORMANT this
				// cycle: no F1 consumer reads it). First-writer-wins on oid collision,
				// mirroring `byRefname`.
				const oidVal = item.oid;
				if (typeof oidVal === "string" && oidVal.length > 0 && !byOid.has(oidVal)) {
					byOid.set(oidVal, loc);
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
	return buildIdIndex(cwd).byRefname.get(id) ?? null;
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
 * Closes part of the phase-2 query-surface work in the multi-phase closure of
 * the earlier substrate-bootstrap-hardcoding gap — shipping resolveItemsByIds,
 * the bulk-lookup variant.
 */
export function resolveItemsByIds(cwd: string, ids: string[]): Map<string, ItemLocation | null> {
	const out = new Map<string, ItemLocation | null>();
	if (ids.length === 0) return out;
	const index = buildIdIndex(cwd);
	for (const id of ids) {
		if (out.has(id)) continue; // duplicate input — Map dedup semantics
		out.set(id, index.byRefname.get(id) ?? null);
	}
	return out;
}

// ── Relation porcelain (selector → structured EdgeEndpoint → raw append) ─────

/**
 * Load a foreign substrate dir's config.json PREFERRING the migration-aware
 * loader (`loadConfigForDir`: migrate-then-validate) so this reader sees the
 * SAME config shape `loadConfig` sees once a shape-changing config migration
 * exists (no split-brain read of the same file). Best-effort in two tiers:
 * when the migration-aware load fails (unresolvable version, invalid), fall
 * back to the prior raw parse — the consumer is `expectedBlockForId`'s prefix
 * invariant, which is better fed an unvalidated `block_kinds` than none (a
 * null config would silently disable the invariant and let a mis-filed
 * foreign id resolve instead of degrading). Absent or unparsable → null,
 * exactly the prior contract.
 */
function loadConfigForDirBestEffort(substrateDir: string): ConfigBlock | null {
	const p = path.join(substrateDir, "config.json");
	if (!fs.existsSync(p)) return null;
	try {
		return loadConfigForDir(substrateDir);
	} catch {
		try {
			return JSON.parse(fs.readFileSync(p, "utf-8")) as ConfigBlock;
		} catch {
			return null;
		}
	}
}

/**
 * Is `selector` a declared lens bin in the active config? Scans every
 * `config.lenses[].bins[]`. Disambiguates a bare selector that names a bin
 * (→ `{kind:"lens_bin"}`) from one that names an item refname (→ `{kind:"item"}`).
 */
function selectorIsLensBin(cwd: string, selector: string): boolean {
	const cfg = loadConfig(cwd);
	if (!cfg) return false;
	for (const lens of cfg.lenses ?? []) {
		if (lens.bins.includes(selector)) return true;
	}
	return false;
}

/**
 * Resolve one friendly relation selector to a structured `EdgeEndpoint`:
 *  - `<alias>:<refname>` (alias is a registered substrate alias) → FOREIGN item
 *    `{kind:"item", substrate_id, oid, refname}` (oid from the foreign index;
 *    when the foreign refname does not resolve, oid is left as the refname so the
 *    endpoint round-trips — Cycle 8 resolves foreign endpoints, this cycle only
 *    forms them; an unresolved foreign endpoint validates as a sentinel).
 *  - a selector matching a declared lens bin → `{kind:"lens_bin", bin}`.
 *  - a bare `refname` → SAME-substrate item `{kind:"item", oid, refname}` (oid
 *    from the active index; falls back to refname when unresolved so an
 *    edge to a not-yet-filed item is still expressible).
 *
 * NOTE: the `<alias>:` branch is tried first so an alias-prefixed selector is
 * never misread as a bare refname containing a colon.
 */
export function resolveRelationSelector(cwd: string, selector: string): EdgeEndpoint {
	// `<alias>:<refname>` — only when the prefix is a REGISTERED alias (a bare
	// refname that happens to contain a colon is not an alias selector).
	const colon = selector.indexOf(":");
	if (colon > 0) {
		const alias = selector.slice(0, colon);
		const refname = selector.slice(colon + 1);
		const substrate_id = resolveAlias(cwd, alias);
		if (substrate_id !== null) {
			const dir = resolveSubstrateDir(cwd, substrate_id);
			let oid = refname;
			if (dir !== null) {
				const abs = path.isAbsolute(dir) ? dir : path.resolve(cwd, dir);
				const foreignIndex = buildIdIndexForDir(abs, abs, loadConfigForDirBestEffort(abs));
				const loc = foreignIndex.byRefname.get(refname);
				if (loc && typeof loc.item.oid === "string") oid = loc.item.oid;
			}
			return { kind: "item", substrate_id, oid, refname };
		}
	}

	// A declared lens bin → lens_bin endpoint (never an item).
	if (selectorIsLensBin(cwd, selector)) {
		return { kind: "lens_bin", bin: selector };
	}

	// Bare refname → same-substrate item. oid from the active index; falls back
	// to the refname itself when the item is not yet filed.
	const index = buildIdIndex(cwd);
	const loc = index.byRefname.get(selector);
	const oid = loc && typeof loc.item.oid === "string" ? loc.item.oid : selector;
	return { kind: "item", oid, refname: selector };
}

/**
 * Resolve the bundled relations schema file (top-level `Edge[]` array schema)
 * — the SAME schema `loadRelations` / `writeRelations` validate against (see
 * `context.ts` `bundledSchemaPath("relations")`). Resolved relative to this
 * module so it works from both `src/` (tsx --test) and `dist/` (after tsc) —
 * the `schemas/` dir lives one directory up in either case. Used by the
 * `dryRun` preview branch of the relation porcelain to apply the write path's
 * validation WITHOUT writing (the shared library preview the
 * orchestrator scripts and the `--dryRun` ops both call, added for
 * relation-mutation ops' `--dryRun` parity).
 */
function relationsSchemaPath(): string {
	const here = path.dirname(fileURLToPath(import.meta.url));
	return path.resolve(here, "..", "schemas", "relations.schema.json");
}

/** Dedup identity key for an edge — the SAME (parent, child, relation_type)
 * identity the raw append/remove plumbing matches on (ordinal-insensitive). */
function edgeIdentityKey(edge: Edge): string {
	return `${endpointIdentity(edge.parent)} ${endpointIdentity(edge.child)} ${edge.relation_type}`;
}

/**
 * Shared edge-registry validator — an edge whose parent/child kind doesn't
 * match the relation-type's declared source_kinds/target_kinds is rejected at
 * write, not just flagged later by validate. The single source of edge
 * registration + endpoint-kind semantics, invoked BOTH at write time (the
 * `appendRelationByRef` / `appendRelationsByRef` porcelain, so a bad edge throws
 * before the raw write) AND post-hoc in {@link validateContext} (so write-time
 * and validate-time verdicts are guaranteed identical).
 *
 * Returns an ARRAY of human-readable error messages — empty when the edge is
 * acceptable. Each message is byte-identical to the wording `validateContext`
 * historically emitted inline, so the validate-time issue stream is unchanged;
 * the write path joins the array into the thrown Error message.
 *
 * Checks (registration + source/target-kind ONLY — NO `category` check; the
 * relation_type `category` attribute has no per-edge referent anywhere in code):
 *  - (a) `edge.relation_type` MUST be registered in `config.relation_types[]`
 *        (matched by `canonical_id`). Unregistered → the registration message;
 *        when unregistered the kind check is short-circuited (no rt to read).
 *  - (b) PRESENCE-GATED source/target-kind membership: a relation_type with
 *        NEITHER `source_kinds` NOR `target_kinds` is unchecked (mirrors the
 *        `if (!rt.source_kinds && !rt.target_kinds) continue;` gate). When a set
 *        is present, the resolved endpoint block (via `resolve(...).loc.block`)
 *        MUST be in it, honoring the `"*"` wildcard. A lens_bin / dangling /
 *        unregistered endpoint carries no `loc` and is skipped for the kind
 *        check (endpoint-resolution failures are validateContext's own surface,
 *        not this helper's).
 *
 * `resolve` is the caller-supplied endpoint resolver (the same pass-bound
 * `resolveRef` closure validateContext builds; the write path builds a fresh one
 * over a freshly-built active index).
 */
export function validateEdgeAgainstRegistry(
	edge: Edge,
	config: ConfigBlock,
	resolve: (ref: RawEndpoint) => ResolvedRef,
): string[] {
	const errors: string[] = [];
	const parentKey = endpointKey(edge.parent);
	const childKey = endpointKey(edge.child);

	const rt = (config.relation_types ?? []).find((r) => r.canonical_id === edge.relation_type);
	if (!rt) {
		errors.push(`Edge relation_type '${edge.relation_type}' is not registered in config.relation_types`);
		// Short-circuit: with no registered relation_type there is no source/target
		// metadata to gate on (mirrors validateContext's `if (!rt) continue;`).
		return errors;
	}

	// Presence gate — neither set declared → endpoint kinds unchecked.
	if (!rt.source_kinds && !rt.target_kinds) return errors;

	const parentLoc = resolve(edge.parent).loc;
	const childLoc = resolve(edge.child).loc;
	if (parentLoc && rt.source_kinds && !(rt.source_kinds.includes("*") || rt.source_kinds.includes(parentLoc.block))) {
		errors.push(
			`Edge ${parentKey} -> ${childKey}: source kind '${parentLoc.block}' not in source_kinds [${rt.source_kinds.join(", ")}] for relation_type '${edge.relation_type}'`,
		);
	}
	if (childLoc && rt.target_kinds && !(rt.target_kinds.includes("*") || rt.target_kinds.includes(childLoc.block))) {
		errors.push(
			`Edge ${parentKey} -> ${childKey}: target kind '${childLoc.block}' not in target_kinds [${rt.target_kinds.join(", ")}] for relation_type '${edge.relation_type}'`,
		);
	}
	return errors;
}

/**
 * Build the per-call edge-validation resolver for the WRITE-TIME porcelain — a
 * `resolveRef` closure bound to a freshly-built active index + a fresh foreign
 * cache for this write, plus the loaded config. Mirrors the pass-bound resolver
 * validateContext constructs, so the two paths resolve endpoints identically.
 * Returns `null` when no config is present (a pre-bootstrap substrate has no
 * relation_types registry to validate against → write-time check is a no-op,
 * matching validateContext's `if (config)` gate).
 */
function buildWriteTimeEdgeValidator(
	cwd: string,
): { config: ConfigBlock; resolve: (ref: RawEndpoint) => ResolvedRef } | null {
	const config = loadConfig(cwd);
	if (!config) return null;
	const activeIndex = buildIdIndex(cwd);
	const foreignCache = new Map<string, SubstrateIndex>();
	const resolve = (ref: RawEndpoint): ResolvedRef => resolveRef(cwd, ref, { activeIndex, foreignCache });
	return { config, resolve };
}

/**
 * Single-edge write-time gate (the same write/validate-parity edge-registry
 * check): build the validator for `cwd` and
 * THROW if `edge` fails the shared registry check. A no-op when no config is
 * present (pre-bootstrap substrate). The thrown message names the offending
 * endpoint kind / relation_type / expected kinds (the helper's wording).
 */
function assertEdgeValidForWrite(cwd: string, edge: Edge): void {
	const validator = buildWriteTimeEdgeValidator(cwd);
	if (!validator) return;
	const edgeErrors = validateEdgeAgainstRegistry(edge, validator.config, validator.resolve);
	if (edgeErrors.length > 0) {
		throw new Error(`Edge rejected at write time (invalid relation_type / endpoint kind): ${edgeErrors.join("; ")}`);
	}
}

/**
 * Input to the relation-append porcelain: EITHER the raw `{parent, child}`
 * endpoint selectors (the storage orientation directly) OR the role-typed
 * `{primary, counter}` form (the explicit role-typed orientation — name the
 * semantic roles, let the porcelain
 * map them to parent/child via the relation's declared `role_direction`).
 * `relation_type` + optional `ordinal` are common to both. The two orientation
 * pairs are mutually exclusive.
 */
export interface RelationAppendInput {
	parent?: string;
	child?: string;
	primary?: string;
	counter?: string;
	relation_type: string;
	ordinal?: number;
}

/**
 * Whether a role-bearing relation is orientation-AMBIGUOUS: its `source_kinds`
 * and `target_kinds` overlap (a shared kind, or either side unconstrained / the
 * `"*"` wildcard), so a bare `{parent, child}` append cannot be reliably oriented
 * from the endpoint kinds alone. Disjoint-kind relations are self-orienting — the
 * `validateEdgeAgainstRegistry` source/target-kind gate already rejects an
 * inversion — so a bare append of them stays allowed.
 */
function relationKindsOverlap(rt: RelationTypeDecl | undefined): boolean {
	const s = rt?.source_kinds;
	const t = rt?.target_kinds;
	if (!s || !t) return true; // an unconstrained endpoint is universal → overlaps everything
	if (s.includes("*") || t.includes("*")) return true;
	return s.some((k) => t.includes(k));
}

/**
 * Resolve a {@link RelationAppendInput} (raw `{parent,child}` OR role-typed
 * `{primary,counter}`) to the canonical `{parent, child}` STRING selectors the raw
 * plumbing consumes, applying the explicit-role-typed-orientation write rules:
 *  - the raw and role-typed pairs are mutually exclusive; exactly one complete
 *    pair must be supplied.
 *  - the role-typed form maps `primary`/`counter` → `parent`/`child` via the
 *    relation's declared `role_direction`; it throws when the relation declares no
 *    `role_direction` (there is no primary/counter role to map).
 *  - a bare `{parent,child}` append of a role-BEARING relation that is
 *    orientation-ambiguous (same-kind / wildcard endpoints) is REJECTED, directing
 *    the author to `--primary`/`--counter`. The porcelain never guesses or swaps.
 *  - a bare append of a role-less relation, or of a role-bearing DISJOINT-kind
 *    relation (self-orienting via the kind gate), passes through unchanged.
 */
export function orientAppendInput(
	config: ConfigBlock | null,
	rel: RelationAppendInput,
): { parent: string; child: string; relation_type: string; ordinal?: number } {
	const hasRole = rel.primary !== undefined || rel.counter !== undefined;
	const hasRaw = rel.parent !== undefined || rel.child !== undefined;
	if (hasRole && hasRaw) {
		throw new Error(
			`Relation append for '${rel.relation_type}': --primary/--counter and --parent/--child are mutually exclusive; supply exactly one orientation pair.`,
		);
	}
	const rt = (config?.relation_types ?? []).find((r) => r.canonical_id === rel.relation_type);
	const roleDir = rt?.role_direction;
	const ordinalPart = rel.ordinal !== undefined ? { ordinal: rel.ordinal } : {};
	if (hasRole) {
		if (rel.primary === undefined || rel.counter === undefined) {
			throw new Error(
				`Relation append for '${rel.relation_type}': the role-typed form needs BOTH --primary and --counter.`,
			);
		}
		if (roleDir === undefined) {
			throw new Error(
				`Relation '${rel.relation_type}' declares no role_direction, so it has no primary/counter role to map — author it with --parent/--child.`,
			);
		}
		const parent = roleDir === "as_parent" ? rel.primary : rel.counter;
		const child = roleDir === "as_parent" ? rel.counter : rel.primary;
		return { parent, child, relation_type: rel.relation_type, ...ordinalPart };
	}
	if (rel.parent === undefined || rel.child === undefined) {
		throw new Error(
			`Relation append for '${rel.relation_type}': supply either --parent and --child, or --primary and --counter.`,
		);
	}
	if (roleDir !== undefined && relationKindsOverlap(rt)) {
		throw new Error(
			`Relation '${rel.relation_type}' carries a declared role_direction and is orientation-ambiguous (its ` +
				`source and target kinds overlap), so a bare --parent/--child append cannot be reliably oriented. Re-issue ` +
				`with --primary/--counter (primary = the endpoint holding the relation's semantic role, stored at edge.${roleDir === "as_parent" ? "parent" : "child"}).`,
		);
	}
	return { parent: rel.parent, child: rel.child, relation_type: rel.relation_type, ...ordinalPart };
}

/**
 * Friendly-selector relation append (Cycle 5 porcelain). Accepts EITHER raw
 * `{parent, child}` selectors OR the role-typed `{primary, counter}` form
 * (the explicit orientation form), resolves the (possibly role-mapped) STRING selectors to structured
 * `EdgeEndpoint`s via `resolveRelationSelector`, then delegates to the raw
 * `appendRelation` plumbing (atomic, AJV-validated, exact-duplicate no-op — same
 * deferred-integrity semantics). Keeps the string param surface its callers (the
 * append-relation Pi tool + the orchestrator CLI) already expose.
 *
 * Returns `{ appended, edge }` where `edge` is the RESOLVED structured edge
 * actually written (so callers can report / dry-run-validate the structured
 * form).
 */
export function appendRelationByRef(
	cwd: string,
	rel: RelationAppendInput,
	ctx?: DispatchContext,
	opts?: { dryRun?: boolean },
): { appended: boolean; edge: Edge; dryRun?: boolean } {
	const oriented = orientAppendInput(loadConfig(cwd), rel);
	const edge: Edge = {
		parent: resolveRelationSelector(cwd, oriented.parent),
		child: resolveRelationSelector(cwd, oriented.child),
		relation_type: oriented.relation_type,
		...(oriented.ordinal !== undefined ? { ordinal: oriented.ordinal } : {}),
	};
	// Write-time edge-registry gate (the write/validate-parity edge-kind check):
	// reject an unregistered
	// relation_type or a source/target-kind-violating endpoint BEFORE any write
	// (dryRun included — preview must surface the same rejection). The shared
	// helper guarantees this verdict is identical to validateContext's.
	assertEdgeValidForWrite(cwd, edge);
	if (opts?.dryRun) {
		// Preview parity: run the SAME validation the write path applies (the
		// prospective Edge[] against the whole relations schema — what
		// loadRelations/writeRelations validate) but write nothing. The
		// would-decision uses the SAME dedup identity the raw append matches on.
		const existing = loadRelations(cwd);
		const prospective = [...existing, edge];
		validateFromFile(relationsSchemaPath(), prospective, "relations[edge]");
		const newId = edgeIdentityKey(edge);
		const duplicate = existing.some((e) => edgeIdentityKey(e) === newId);
		return { appended: !duplicate, edge, dryRun: true };
	}
	const { appended } = appendRelation(cwd, edge, ctx);
	return { appended, edge };
}

/**
 * Friendly-selector relation removal — the porcelain twin of
 * {@link appendRelationByRef}. Resolves `parent` / `child` STRING selectors to
 * structured `EdgeEndpoint`s via the SAME `resolveRelationSelector` the append
 * porcelain uses, then delegates to the raw `removeRelation` plumbing, which
 * matches on the `identityKey` dedup identity (so a `removeRelationByRef` of the
 * selectors an `appendRelationByRef` wrote removes exactly that edge — the
 * porcelain layers stay symmetric). Returns `{ removed, edge }` where `edge` is
 * the RESOLVED structured edge that was matched against (so callers can report /
 * dry-run-validate the structured form), and `removed` is false on the
 * idempotent no-match no-op.
 */
export function removeRelationByRef(
	cwd: string,
	rel: { parent: string; child: string; relation_type: string },
	ctx?: DispatchContext,
	opts?: { dryRun?: boolean },
): { removed: boolean; edge: Edge; dryRun?: boolean } {
	const edge: Edge = {
		parent: resolveRelationSelector(cwd, rel.parent),
		child: resolveRelationSelector(cwd, rel.child),
		relation_type: rel.relation_type,
	};
	if (opts?.dryRun) {
		// Preview parity: compute the prospective post-removal Edge[] and validate
		// it against the whole relations schema (write-path validation), write
		// nothing. `removed` reflects whether a matching edge is present on the
		// SAME dedup identity the raw remove matches on.
		const existing = loadRelations(cwd);
		const targetId = edgeIdentityKey(edge);
		const matches = existing.some((e) => edgeIdentityKey(e) === targetId);
		const prospective = existing.filter((e) => edgeIdentityKey(e) !== targetId);
		validateFromFile(relationsSchemaPath(), prospective, "relations[edge]");
		return { removed: matches, edge, dryRun: true };
	}
	const { removed } = removeRelation(cwd, edge, ctx);
	return { removed, edge };
}

/**
 * Friendly-selector ATOMIC relation replace — a single load → filter-out-old →
 * push-new → write cycle (no half-state: the old edge and the new edge never
 * coexist on disk, and the file is rewritten exactly ONCE). Resolves the `old`
 * and `new` selector triples via the SAME `resolveRelationSelector` the append /
 * remove porcelain use. The old edge is matched on the `identityKey` dedup
 * identity (parent, child, relation_type — `ordinal`-insensitive, symmetric with
 * append-dedup / remove); the new edge is pushed verbatim (carrying its optional
 * `ordinal`). If the resolved new edge collides on identity with a surviving edge
 * it is de-duplicated against the post-filter set so the write stays
 * exact-duplicate-free, matching `appendRelations` semantics.
 *
 * Returns `{ replaced, removed, oldEdge, newEdge }`: `removed` reflects whether
 * the old edge was actually present (false → the old edge was absent, so this is
 * effectively an append of `newEdge`); `replaced` is true when the resolved new
 * edge was written (false only when it collided with an already-present surviving
 * edge → a no-op add). `ctx` threads to `writeRelations` for attestation parity.
 */
export function replaceRelationByRef(
	cwd: string,
	rels: {
		old: { parent: string; child: string; relation_type: string };
		new: { parent: string; child: string; relation_type: string; ordinal?: number };
	},
	ctx?: DispatchContext,
	opts?: { dryRun?: boolean },
): { replaced: boolean; removed: boolean; oldEdge: Edge; newEdge: Edge; dryRun?: boolean } {
	const oldEdge: Edge = {
		parent: resolveRelationSelector(cwd, rels.old.parent),
		child: resolveRelationSelector(cwd, rels.old.child),
		relation_type: rels.old.relation_type,
	};
	const newEdge: Edge = {
		parent: resolveRelationSelector(cwd, rels.new.parent),
		child: resolveRelationSelector(cwd, rels.new.child),
		relation_type: rels.new.relation_type,
		...(rels.new.ordinal !== undefined ? { ordinal: rels.new.ordinal } : {}),
	};
	const existing = loadRelations(cwd);
	const oldKey = edgeIdentityKey(oldEdge);
	const newKey = edgeIdentityKey(newEdge);
	const filtered = existing.filter((e) => edgeIdentityKey(e) !== oldKey);
	const removed = filtered.length !== existing.length;
	const collides = filtered.some((e) => edgeIdentityKey(e) === newKey);
	const next = collides ? filtered : [...filtered, newEdge];
	if (opts?.dryRun) {
		// Preview parity: validate the prospective post-replace Edge[] against the
		// whole relations schema (write-path validation), write nothing. The
		// would-decisions (`removed`/`replaced`) are the SAME values the write
		// path computes.
		validateFromFile(relationsSchemaPath(), next, "relations[edge]");
		return { replaced: !collides, removed, oldEdge, newEdge, dryRun: true };
	}
	writeRelations(cwd, next, ctx);
	return { replaced: !collides, removed, oldEdge, newEdge };
}

/**
 * Friendly-selector BULK relation append over the raw {@link appendRelations}
 * (whole-file additive write with per-(parent, child, relation_type) dedup,
 * skipping edges already on disk OR earlier in the same batch). Resolves each
 * `edges[]` selector triple via the SAME `resolveRelationSelector` the
 * single-edge porcelain uses, then hands the resolved `Edge[]` to
 * `appendRelations`. Returns `{ appended, skipped, edges }` — `edges` being the
 * resolved structured edges handed to the raw layer (so callers can report /
 * dry-run-validate the structured form). Same deferred-integrity semantics as
 * `appendRelations` (AJV-shape + duplicate-no-op only; relation_type
 * registration / endpoint resolution / cycle checks deferred to
 * `validateContext`).
 */
export function appendRelationsByRef(
	cwd: string,
	edges: RelationAppendInput[],
	ctx?: DispatchContext,
	opts?: { dryRun?: boolean },
): { appended: number; skipped: number; edges: Edge[]; dryRun?: boolean } {
	// Orient every input once against the loaded config (the explicit
	// role-typed-orientation contract): a role-typed
	// {primary,counter} edge maps to parent/child via role_direction; a bare
	// {parent,child} append of an orientation-ambiguous role-bearing relation is
	// rejected here (before any write), directing the author to --primary/--counter.
	const config = loadConfig(cwd);
	const resolved: Edge[] = edges.map((rel) => {
		const oriented = orientAppendInput(config, rel);
		return {
			parent: resolveRelationSelector(cwd, oriented.parent),
			child: resolveRelationSelector(cwd, oriented.child),
			relation_type: oriented.relation_type,
			...(oriented.ordinal !== undefined ? { ordinal: oriented.ordinal } : {}),
		};
	});
	// Write-time edge-registry gate (the write/validate-parity edge-kind check):
	// every resolved edge in the batch
	// is checked BEFORE any write (dryRun included). Build the validator once for
	// the batch (config + active index built once) and reject if any edge fails —
	// an all-or-nothing batch (no partial write past a bad edge).
	const validator = buildWriteTimeEdgeValidator(cwd);
	if (validator) {
		for (const edge of resolved) {
			const edgeErrors = validateEdgeAgainstRegistry(edge, validator.config, validator.resolve);
			if (edgeErrors.length > 0) {
				throw new Error(
					`Edge rejected at write time (invalid relation_type / endpoint kind): ${edgeErrors.join("; ")}`,
				);
			}
		}
	}
	if (opts?.dryRun) {
		// Preview parity: replay the bulk dedup the raw appendRelations applies —
		// skip an edge whose identity is already on disk OR earlier in THIS batch
		// (a `seen` Set seeded from the existing on-disk identities) — accumulate
		// the non-dup prospective Edge[], validate it against the whole relations
		// schema (write-path validation), write nothing.
		const existing = loadRelations(cwd);
		const seen = new Set(existing.map((e) => edgeIdentityKey(e)));
		let appended = 0;
		let skipped = 0;
		const prospective = [...existing];
		for (const edge of resolved) {
			const key = edgeIdentityKey(edge);
			if (seen.has(key)) {
				skipped++;
			} else {
				seen.add(key);
				prospective.push(edge);
				appended++;
			}
		}
		validateFromFile(relationsSchemaPath(), prospective, "relations[edge]");
		return { appended, skipped, edges: resolved, dryRun: true };
	}
	const { appended, skipped } = appendRelations(cwd, resolved, ctx);
	return { appended, skipped, edges: resolved };
}

// ── Endpoint resolution (Cycle 8 / Phase F2) ────────────────────────────────

/**
 * Classification of an endpoint by {@link resolveRef}:
 *  - `active`       — an item resolved in the ACTIVE substrate index (the
 *                     same-substrate refname/oid path, byte-identical pass to today).
 *  - `foreign`      — an item resolved in a REGISTERED foreign substrate's index
 *                     (via a structured `substrate_id` locator or a legacy
 *                     `<alias>:<refname>` string whose alias is registered).
 *  - `dangling`     — a located endpoint (active or foreign) whose key was NOT
 *                     found in the relevant index (the "does not resolve" outcome),
 *                     OR a foreign substrate whose index build threw (degraded to
 *                     dangling rather than crashing validation).
 *  - `unregistered` — a locator naming a substrate_id / alias that the project-root
 *                     registry does NOT carry (the foreign substrate is not yet
 *                     registered — the pre-Phase-H state of the 30 `project:` strings).
 */
export type ResolveStatus = "active" | "foreign" | "dangling" | "unregistered";

/**
 * The result of {@link resolveRef}. `endpointKind` discriminates item endpoints
 * (the resolution surface) from lens_bin endpoints (always `active`, never an
 * item lookup). `loc` is the resolved {@link ItemLocation} for `active`/`foreign`
 * item endpoints (absent for `dangling`/`unregistered`/lens_bin). `substrate_id`
 * is the resolved foreign substrate_id when known (structured locator, or an
 * alias that resolved); `oid`/`refname` carry the parsed/structured lookup keys.
 */
export interface ResolvedRef {
	status: ResolveStatus;
	endpointKind: "item" | "lens_bin";
	substrate_id?: string;
	oid?: string;
	refname?: string;
	loc?: ItemLocation;
}

/**
 * Build (or fetch from the per-pass cache) the {@link SubstrateIndex} for a
 * REGISTERED foreign substrate. Resolves the substrate dir from the registry,
 * absolutizes it against `cwd`, and builds the index once per substrate_id within
 * a validation pass (the `foreignCache` is keyed by substrate_id). A build that
 * THROWS (malformed foreign block / prefix-invariant violation) is caught and
 * returns null — the caller resolves the ref `dangling` rather than crashing the
 * whole validation pass on one bad foreign substrate.
 *
 * Returns null when the substrate_id is not registered (→ caller `unregistered`)
 * or when the foreign-index build throws (→ caller `dangling`). A registered
 * substrate whose dir is missing on disk builds an empty index (not null) via
 * `buildIdIndexForDir`'s existsSync guard, so its endpoints resolve `dangling`.
 */
function foreignIndexFor(
	cwd: string,
	substrate_id: string,
	foreignCache: Map<string, SubstrateIndex>,
): SubstrateIndex | null {
	const cached = foreignCache.get(substrate_id);
	if (cached) return cached;
	const dir = resolveSubstrateDir(cwd, substrate_id);
	if (dir === null) return null; // not registered → unregistered (caller)
	const abs = path.isAbsolute(dir) ? dir : path.resolve(cwd, dir);
	try {
		const index = buildIdIndexForDir(abs, abs, loadConfigForDirBestEffort(abs));
		foreignCache.set(substrate_id, index);
		return index;
	} catch {
		// Malformed foreign block / prefix-invariant throw — degrade to dangling.
		// Do NOT cache the failure (a transient read could differ); the per-pass
		// cost of a re-throw is bounded by the edge count into this substrate.
		return null;
	}
}

/**
 * Classify a single edge endpoint (legacy string OR structured) into one of the
 * four {@link ResolveStatus} values — the load-bearing F2 resolver wired into
 * `validateContext`'s edge loop + the `validateRelations` `resolve?` hook.
 *
 * Algorithm (the locked Cycle-8 design):
 *  1. A structured `{kind:"lens_bin"}` endpoint → `{status:"active",
 *     endpointKind:"lens_bin"}` with NO item lookup (a lens_bin never routes
 *     through item resolution — the corruption-risk surface, Constraint 4).
 *  2. An item endpoint WITH A LOCATOR — a structured `substrate_id`, OR a STRING
 *     of the form `<alias>:<refname>` whose `<alias>` prefix is a REGISTERED
 *     alias — resolves against the named FOREIGN substrate: substrate_id/alias
 *     NOT in the registry → `unregistered`; registered → build (cached) the
 *     foreign index → look up by `oid` (structured locator carrying an oid) else
 *     by `refname` in `byOid`/`byRefname` → found `foreign` / absent `dangling`.
 *     A foreign-index build that throws → `dangling` (never a crash).
 *  3. An item endpoint with NO locator — a bare oid or a bare refname (a string
 *     with no `:` alias-prefix) — resolves against the ACTIVE index ONLY → found
 *     `active` / absent `dangling`.
 *
 * The alias-string parse is ATTEMPTED FIRST on any string containing a `:`
 * (mirroring `resolveRelationSelector`): the `<x>` in `<x>:<y>` is treated as an
 * alias candidate, so such a string is an aliased-item locator (step 2), NOT a
 * bare refname (step 3). If `<x>` is NOT a registered alias → `unregistered`. So
 * today's `project:FGAP-153` (the `project` alias is not registered until Phase H)
 * → `unregistered`. The real 30 are therefore `unregistered` pre-H and flip to
 * `foreign` once Phase H registers the `project` alias (the count/total stay
 * unchanged at reclassification — see the note in `validateContext`).
 *
 * `opts.activeIndex` lets the caller pass a pre-built active index (built once per
 * validation pass); `opts.foreignCache` memoizes foreign indices per substrate_id
 * within the pass (so N edges into one foreign substrate build its index ONCE).
 */
export function resolveRef(
	cwd: string,
	ref: RawEndpoint,
	opts?: { activeIndex?: SubstrateIndex; foreignCache?: Map<string, SubstrateIndex> },
): ResolvedRef {
	const foreignCache = opts?.foreignCache ?? new Map<string, SubstrateIndex>();
	const activeIndex = opts?.activeIndex ?? buildIdIndex(cwd);

	// (1) lens_bin endpoint — no item lookup.
	if (typeof ref !== "string" && ref.kind === "lens_bin") {
		return { status: "active", endpointKind: "lens_bin" };
	}

	// Derive the locator + lookup keys.
	//  - structured item: substrate_id (locator), oid, refname.
	//  - string: attempt `<alias>:<refname>` parse — a `:` whose prefix is a
	//    REGISTERED alias yields a foreign locator; otherwise no locator (step 3
	//    looks up the whole string in the active index).
	let substrate_id: string | undefined;
	let oid: string | undefined;
	let refname: string | undefined;

	// A string carrying a `:` is treated as a `<alias>:<refname>` LOCATOR
	// candidate (the alias parse is ATTEMPTED): the prefix is an alias that
	// either resolves (→ foreign locator) or does NOT (→ `unregistered` — the
	// pre-Phase-H state of the 30 `project:` strings, whose `project` alias is
	// not yet registered). A registered alias yields a foreign `substrate_id`
	// locator + the post-colon refname; an UNregistered alias is flagged with the
	// `aliasUnregistered` sentinel so step (2)/(3) below routes it to
	// `unregistered` rather than the active index. A string with NO `:` is a bare
	// active refname (step 3).
	let aliasUnregistered = false;
	if (typeof ref === "string") {
		const colon = ref.indexOf(":");
		if (colon > 0) {
			const alias = ref.slice(0, colon);
			const aliasSubId = resolveAlias(cwd, alias);
			if (aliasSubId !== null) {
				// Registered alias → foreign locator; refname is the post-colon part.
				substrate_id = aliasSubId;
				refname = ref.slice(colon + 1);
			} else {
				// `:`-prefix is an alias CANDIDATE but the alias is NOT registered →
				// `unregistered` (NOT active-dangling). The whole string is retained as
				// the refname for diagnostics; no active-index lookup is performed.
				aliasUnregistered = true;
				refname = ref;
			}
		} else {
			// No colon — bare active refname.
			refname = ref;
		}
	} else {
		// Structured item endpoint.
		substrate_id = ref.substrate_id;
		oid = ref.oid;
		refname = ref.refname;
	}

	// A `<alias>:<refname>` string whose alias is NOT registered → unregistered
	// (locked decision 1: the alias parse is attempted; a missing alias is the
	// pre-Phase-H state of the 30, NOT an active-substrate dangling lookup).
	if (aliasUnregistered) {
		return { status: "unregistered", endpointKind: "item", refname };
	}

	// (2) item endpoint WITH a foreign locator (structured substrate_id OR an
	// alias that resolved to one).
	if (substrate_id !== undefined) {
		const index = foreignIndexFor(cwd, substrate_id, foreignCache);
		if (index === null) {
			// substrate_id not registered → unregistered (a build-throw also returns
			// null, but foreignIndexFor only returns null on UNREGISTERED when the
			// registry lacks the id; the throw path returns null too — disambiguate
			// by re-checking the registry to keep the two outcomes distinct).
			const dir = resolveSubstrateDir(cwd, substrate_id);
			return dir === null
				? { status: "unregistered", endpointKind: "item", substrate_id, oid, refname }
				: { status: "dangling", endpointKind: "item", substrate_id, oid, refname };
		}
		// Look up by oid first (structured locator carrying an oid), else by refname.
		let loc: ItemLocation | undefined;
		if (typeof oid === "string" && oid.length > 0) loc = index.byOid.get(oid);
		if (!loc && typeof refname === "string" && refname.length > 0) loc = index.byRefname.get(refname);
		return loc
			? { status: "foreign", endpointKind: "item", substrate_id, oid, refname, loc }
			: { status: "dangling", endpointKind: "item", substrate_id, oid, refname };
	}

	// (3) item endpoint with NO locator → ACTIVE index only.
	let loc: ItemLocation | undefined;
	if (typeof oid === "string" && oid.length > 0) loc = activeIndex.byOid.get(oid);
	if (!loc && typeof refname === "string" && refname.length > 0) loc = activeIndex.byRefname.get(refname);
	return loc
		? { status: "active", endpointKind: "item", oid, refname, loc }
		: { status: "dangling", endpointKind: "item", oid, refname };
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
 * Evaluate every config-declared invariant (requires-edge, status-consistency,
 * derived-status) against the given substrate state, returning the issue set.
 * The ONE evaluation path shared by `validateContext` (read-side sweep) and
 * the ops-layer write-time gate (delta-scoped surfacing/refusal of newly-
 * introduced violations) — the two consumers cannot classify differently.
 * Unknown invariant classes are skipped (forward-compat).
 */
export function evaluateConfigInvariants(
	cwd: string,
	config: ConfigBlock,
	index: SubstrateIndex,
	relations: Edge[],
): ContextValidationIssue[] {
	const issues: ContextValidationIssue[] = [];
	// ── Config-declared invariants (per the vocabulary-neutral-canon convention) ─────────
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
			satisfied.add(inv.direction === "as_parent" ? endpointKey(edge.parent) : endpointKey(edge.child));
		}
		for (const loc of index.byRefname.values()) {
			const id = loc.id;
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

	// ── status-consistency invariants — closing the earlier gap where
	// validateProject had no cross-block status-consistency checks to catch
	// status drift ──────────────
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
		for (const loc of index.byRefname.values()) {
			const id = loc.id;
			if (loc.block !== inv.block) continue;
			if (inv.when_bucket && bucketOf(loc.item) !== inv.when_bucket) continue;
			for (const edge of relations) {
				if (!relSet.has(edge.relation_type)) continue;
				const selfIsParent = inv.direction === "as_parent";
				if ((selfIsParent ? endpointKey(edge.parent) : endpointKey(edge.child)) !== id) continue;
				const otherId = selfIsParent ? endpointKey(edge.child) : endpointKey(edge.parent);
				const otherLoc = index.byRefname.get(otherId);
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

	// ── derived-status invariants — part of currency-by-construction, closing
	// the gap where a milestone could read as "reached" by live derivation
	// while still gate-blocking its own tasks via a stale stored status ───────────────────────
	// For a rollup-declared kind (state_derivation.rollups), each item's
	// STORED status must equal its DERIVED membership-rollup status —
	// divergence in EITHER direction (stored behind or ahead of the
	// derivation) is reported. Completeness comes from the SAME shared
	// helper currentState's gate satisfaction uses (derivedRollupComplete),
	// so validate-side verdicts match the derivation by construction. A
	// declaration naming a block with no matching rollups entry is inert
	// (the invariant has nothing to derive against). Vocabulary-free: kind,
	// membership relation, and the status strings all come from config.
	{
		const sdInv = resolveStateDerivation(cwd);
		const declared = (config.invariants ?? []).filter((inv) => inv.class === "derived-status");
		if (sdInv !== null && declared.length > 0) {
			const rollupByKind = new Map(sdInv.rollups.map((r) => [r.kind, r]));
			const roleDir = new Map<string, "as_parent" | "as_child">();
			for (const rt of config.relation_types ?? []) {
				if (rt.role_direction !== undefined) roleDir.set(rt.canonical_id, rt.role_direction);
			}
			for (const inv of declared) {
				const entry = rollupByKind.get(inv.block);
				if (entry === undefined) continue;
				for (const loc of index.byRefname.values()) {
					if (loc.block !== inv.block) continue;
					const derived = derivedRollupComplete(index, relations, roleDir, rollupByKind, bucketOf, loc.id)
						? entry.complete_status
						: entry.incomplete_status;
					const stored = String(loc.item.status);
					if (stored === derived) continue;
					issues.push({
						severity: inv.severity ?? "warning",
						message: (
							inv.message ??
							`Item '{id}' (block '{block}') stored status '{stored}' diverges from its derived rollup status '{derived}' (derived-status '${inv.id}')`
						)
							.replaceAll("{id}", loc.id)
							.replaceAll("{block}", inv.block)
							.replaceAll("{stored}", stored)
							.replaceAll("{derived}", derived),
						block: inv.block,
						field: `${loc.id}.${inv.id}`,
						code: inv.id,
					});
				}
			}
		}
	}
	return issues;
}

/** One item flagged by the declared-baseline staleness sweep. */
export interface StalenessCandidate {
	id: string;
	block: string;
	/**
	 * `staleness-candidate`: a stale_conditions-bearing item whose status
	 * buckets complete and whose typed condition fired — eligible for the
	 * complete-to-stale transition (applied ONLY by context-reconcile or a
	 * human, never by validate).
	 */
	kind: "staleness-candidate";
	reasons: string[];
}

/**
 * Declared-baseline currency sweep — the machine-evaluable typed-condition-baseline
 * mechanism (beyond bare strings) in service of currency-by-construction, the ONE
 * evaluation path shared by `validateContext` (flags) and `reconcileContext`
 * (the complete-to-stale transition) — detector and repair cannot disagree.
 * Field-driven and vocabulary-neutral: no block-name literals — any item
 * carrying a `stale_conditions` array is condition-evaluable. Bare-string
 * conditions are never machine-judged. Typed conditions are judged only on
 * items whose status buckets `complete` (the transition's precondition).
 * Unstamped baselines (no `baseline_hash`/`baseline_sha` — e.g. the file/ref
 * was unreadable at write) are never judged.
 */
export function evaluateStalenessCandidates(cwd: string, index?: SubstrateIndex): StalenessCandidate[] {
	const out: StalenessCandidate[] = [];
	const ctxRoot = tryResolveContextDir(cwd);
	if (ctxRoot === null) return out;
	const projectRoot = path.dirname(ctxRoot);
	const idx = index ?? buildIdIndex(cwd);
	const vocab = resolveStatusVocabulary(cwd);
	const bucketOf = (item: Record<string, unknown>): string => vocab[String(item.status)] ?? "unknown";
	const substrateAbs = path.resolve(ctxRoot);
	// Substrate-internal paths are living state, not groundable artifacts — the
	// write choke never stamps them, and a hand-authored pin/baseline on one is
	// never judged here (it would drift on every substrate write and flag forever).
	const isSubstrateInternal = (rel: string): boolean => {
		const abs = path.resolve(projectRoot, rel);
		return abs === substrateAbs || abs.startsWith(substrateAbs + path.sep);
	};
	const fileHashOrNull = (rel: string): string | null => {
		const abs = path.resolve(projectRoot, rel);
		try {
			if (!fs.statSync(abs).isFile()) return null;
			return computeFileBytesHash(abs);
		} catch {
			return null;
		}
	};

	for (const loc of idx.byRefname.values()) {
		const item = loc.item;
		const hasConditions = Array.isArray(item.stale_conditions);
		const completeBucket = bucketOf(item) === "complete";

		const firedReasons: string[] = [];
		if (hasConditions && completeBucket) {
			for (const cond of item.stale_conditions as unknown[]) {
				if (!cond || typeof cond !== "object" || Array.isArray(cond)) continue; // bare strings stay human-only
				const c = cond as Record<string, unknown>;
				if (c.kind === "item-status" && typeof c.item === "string" && typeof c.bucket === "string") {
					const target = idx.byRefname.get(c.item);
					if (target !== undefined && bucketOf(target.item) === c.bucket) {
						firedReasons.push(`stale condition fired: item '${c.item}' bucketed '${c.bucket}'`);
					}
				} else if (
					c.kind === "file-changed" &&
					typeof c.path === "string" &&
					typeof c.baseline_hash === "string" &&
					!isSubstrateInternal(c.path)
				) {
					const now = fileHashOrNull(c.path);
					if (now === null) {
						firedReasons.push(`stale condition fired: file '${c.path}' is gone`);
					} else if (now !== c.baseline_hash) {
						firedReasons.push(`stale condition fired: file '${c.path}' changed from its baseline`);
					}
				} else if (c.kind === "revision-moved" && typeof c.ref === "string" && typeof c.baseline_sha === "string") {
					const now = resolveGitRefOrNull(projectRoot, c.ref);
					if (now !== null && now !== c.baseline_sha) {
						firedReasons.push(
							`stale condition fired: ref '${c.ref}' moved from '${(c.baseline_sha as string).slice(0, 12)}'`,
						);
					}
				}
			}
		}

		if (hasConditions && completeBucket && firedReasons.length > 0) {
			out.push({
				id: loc.id,
				block: loc.block,
				kind: "staleness-candidate",
				reasons: firedReasons,
			});
		}
	}
	return out;
}

/**
 * Validate cross-block referential integrity against the EDGE model
 * (`relations.json` closure-table edges are THE reference surface, authored
 * exclusively as edges — no inline foreign-key field on any item schema).
 * Returns structured issues rather than throwing.
 *
 * Edge integrity replaces the pre-clean-re-derivation per-block inline-FK reference scan:
 * each edge's `parent`/`child` must resolve to a known item id (via the unified
 * `buildIdIndex`), and each edge's `relation_type` must be registered in
 * `config.relation_types[]` (following the tripartite `source_verb_target`
 * canonical-id naming convention). Cycle
 * detection is delegated to `validateRelations` (its `edge_cycle_detected`
 * diagnostics are merged in).
 *
 * Substrate invariants beyond edge integrity are enforced generically from
 * `config.invariants[]` per the `requires-edge` class — no invariant vocabulary
 * (block kind / status / relation_type / direction) lives in source (per the
 * vocabulary-neutral-canon convention).
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
	const index = buildIdIndex(cwd);

	// ── Edge integrity (closure-table reference surface — the exclusive
	// authoring model for all inter-item relationships) ─────────────
	// Load config + relations; both absent in a pre-bootstrap project, in which
	// case edge checks (and the relocated invariants, which depend on edges)
	// are skipped gracefully — there is no edge model to validate yet.
	const config = loadConfig(cwd);
	const relations: Edge[] = config ? loadRelations(cwd) : [];

	// ── SoT-drift invariant (content-addressed substrate identity, Cycle 4) ───
	// When the active config declares a `substrate_id`, the project-root
	// registry (.pi-context-registry.json) MUST carry an entry for that id whose
	// `dir` resolves to the active substrate dir. A missing entry or a dir
	// mismatch means the registry has drifted from the active substrate's sole
	// SoT (config.substrate_id) and is an ERROR. When `config.substrate_id` is
	// ABSENT (a pre-identity / pre-Phase-H substrate), the check SKIPS — read
	// the field directly off the config rather than via substrateIdFor (which
	// THROWS on absence) so an un-migrated substrate still validates cleanly.
	if (config) {
		const substrateId = config.substrate_id;
		if (typeof substrateId === "string" && substrateId.length > 0) {
			const registry = loadRegistry(cwd);
			const entry = registry?.substrates?.[substrateId];
			if (!entry) {
				issues.push({
					severity: "error",
					message: `config.substrate_id '${substrateId}' is not registered in the project-root .pi-context-registry.json — register the active substrate (registerSubstrate) so foreign-locator resolution can find it`,
					block: "config",
					field: "substrate_id",
					code: "substrate_id_unregistered",
				});
			} else {
				const registeredAbs = path.resolve(cwd, entry.dir);
				// resolveContextDir returns path.join(cwd, contextDir), which is
				// RELATIVE when cwd is relative (e.g. '.'). Absolutize it so the
				// comparison is absolute-vs-absolute and a relative cwd can't
				// produce a false-positive drift error.
				const activeAbs = path.resolve(resolveContextDir(cwd));
				if (registeredAbs !== activeAbs) {
					issues.push({
						severity: "error",
						message: `config.substrate_id '${substrateId}' registry entry dir '${entry.dir}' (resolved ${registeredAbs}) does not match the active substrate dir ${activeAbs} — the registry has drifted from the active substrate's SoT`,
						block: "config",
						field: "substrate_id",
						code: "substrate_id_registry_mismatch",
					});
				}
			}
		}
	}

	// `config` present → run edge-integrity + the relocated invariants. The
	// invariants detect MISSING edges (completed task without a verification
	// edge; decision without a forcing-artifact edge), so they must run even
	// when relations is empty — gating them on relations.length>0 would
	// false-pass a zero-edge substrate. The edge-integrity loop below is a
	// no-op on empty relations, so it needs no separate guard.
	if (config) {
		// Per-pass foreign-index cache (Constraint 3): N foreign edges into the same
		// registered substrate build that substrate's index ONCE within this pass.
		const foreignCache = new Map<string, SubstrateIndex>();
		// Resolver bound to this pass's cwd + active index + foreign cache; supplied
		// to validateRelations so its lens/hierarchy resolution can see foreign items.
		const resolve = (ref: RawEndpoint): ResolvedRef => resolveRef(cwd, ref, { activeIndex: index, foreignCache });
		for (const edge of relations) {
			// F2 severity split (DEC §F2): every endpoint is classified by resolveRef
			// into active | foreign | dangling | unregistered. active/foreign/lens_bin
			// → no issue; unregistered → ERROR (`edge_endpoint_unregistered`); dangling
			// → ERROR (`edge_endpoint_dangling`). The two new codes REPLACE the prior
			// inline "does not resolve" message — the intended reclassification of the
			// cross-substrate (`<alias>:`) strings (their alias is unregistered pre-H).
			const parentKey = endpointKey(edge.parent);
			const childKey = endpointKey(edge.child);
			const parentRes = resolve(edge.parent);
			const childRes = resolve(edge.child);
			if (parentRes.status === "unregistered") {
				issues.push({
					severity: "error",
					message: `Edge parent '${parentKey}' (relation_type '${edge.relation_type}') names an unregistered substrate alias/id`,
					block: "relations",
					field: `${parentKey}->${childKey}`,
					code: "edge_endpoint_unregistered",
				});
			} else if (parentRes.status === "dangling") {
				issues.push({
					severity: "error",
					message: `Edge parent '${parentKey}' (relation_type '${edge.relation_type}') does not resolve to any item`,
					block: "relations",
					field: `${parentKey}->${childKey}`,
					code: "edge_endpoint_dangling",
				});
			}
			if (childRes.status === "unregistered") {
				issues.push({
					severity: "error",
					message: `Edge child '${childKey}' (relation_type '${edge.relation_type}') names an unregistered substrate alias/id`,
					block: "relations",
					field: `${parentKey}->${childKey}`,
					code: "edge_endpoint_unregistered",
				});
			} else if (childRes.status === "dangling") {
				issues.push({
					severity: "error",
					message: `Edge child '${childKey}' (relation_type '${edge.relation_type}') does not resolve to any item`,
					block: "relations",
					field: `${parentKey}->${childKey}`,
					code: "edge_endpoint_dangling",
				});
			}
		}

		// ── Edge registration + endpoint-kind check — closing the earlier gap
		// where relation_types carried no endpoint-kind metadata (so validation
		// checked that edge endpoints exist but never that their kinds were legal
		// for that relation type — e.g. a task-addresses-gap edge whose child was
		// actually a decision would pass validation);
		// factored into the shared validateEdgeAgainstRegistry helper so the
		// write-time porcelain and this validate-time loop reach an IDENTICAL
		// verdict). The helper performs (a) relation_type-registration and
		// (b) PRESENCE-GATED source/target-kind membership ("*" wildcard honored);
		// a relation_type with neither kind set is unchecked (the frozen .project
		// substrate, whose relation_types carry no endpoint metadata, is not
		// retroactively failed). Its returned messages are byte-identical to the
		// wording this loop historically emitted inline (registration message +
		// source/target kind messages), each mapped to the same issue shape
		// (severity error, block "relations", field parent->child, no code).
		// Order discipline (the write/validate-parity edge-registry lift): context-validate prints issues[], so the
		// emission order is a UX surface and must match the pre-refactor two-pass
		// shape — ALL relation_type-registration issues across every edge first,
		// THEN ALL source/target-kind issues across every edge (class-grouped, not
		// interleaved per edge). The shared helper returns both classes per edge;
		// we collect once then partition by message text (registration messages
		// carry "is not registered"; kind messages carry "source kind"/"target
		// kind"). Issue set/count/wording/severity and the registration
		// short-circuit are unchanged — this is order-only.
		const registrationIssues: ContextValidationIssue[] = [];
		const kindIssues: ContextValidationIssue[] = [];
		for (const edge of relations) {
			const parentKey = endpointKey(edge.parent);
			const childKey = endpointKey(edge.child);
			for (const message of validateEdgeAgainstRegistry(edge, config, resolve)) {
				const issue: ContextValidationIssue = {
					severity: "error",
					message,
					block: "relations",
					field: `${parentKey}->${childKey}`,
				};
				if (message.includes("is not registered")) {
					registrationIssues.push(issue);
				} else {
					kindIssues.push(issue);
				}
			}
		}
		issues.push(...registrationIssues, ...kindIssues);

		// Cycle detection — delegate to validateRelations. It performs its own
		// lens/hierarchy/relation_type resolution and emits several edge codes;
		// only its cycle diagnostics are merged here (the parent/child/relation_type
		// resolution above is the authoritative reference-integrity surface, so
		// merging validateRelations' resolution codes too would double-report).
		const itemsByBlock: Record<string, ItemRecord[]> = {};
		for (const loc of index.byRefname.values()) {
			(itemsByBlock[loc.block] ??= []).push({ id: loc.id, ...loc.item });
		}
		try {
			const relResult = validateRelations(config, relations, itemsByBlock, resolve);
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

		// ── Config-declared invariants — the three classes evaluate through the
		// SHARED evaluateConfigInvariants helper (also consumed by the write-time
		// gate at the ops layer), so validate-side and write-side verdicts are
		// identical by construction (the same write/validate-parity lift pattern
		// used for edge kind/category checks).
		issues.push(...evaluateConfigInvariants(cwd, config, index, relations));
	}

	// Cross-block status-vocabulary check: an item status value absent
	// from the declared vocabulary silently buckets to "unknown" in currentState /
	// status-consistency invariants — surface it. Vocabulary-neutral: reads the
	// config-driven vocab ("status" is the established item status field, same read
	// as currentState / bucketOf). A value mapped to the "unknown" BUCKET is still a
	// key (recognized) and is NOT flagged; only a value with NO key is. Warning-only.
	{
		const statusVocab = resolveStatusVocabulary(cwd);
		for (const sloc of index.byRefname.values()) {
			const sid = sloc.id;
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

	// ── Declared-baseline staleness sweep — the machine-evaluable
	// typed-condition-baseline mechanism, in service of currency-by-construction ──
	// Fired typed stale_conditions, through the SAME
	// evaluateStalenessCandidates helper context-reconcile's transition sweep
	// uses (identical verdicts). Warning-only, and validate NEVER mutates — the
	// complete-to-stale transition belongs to reconcile or a human.
	for (const cand of evaluateStalenessCandidates(cwd, index)) {
		issues.push({
			severity: "warning",
			message: `Item '${cand.id}' (block '${cand.block}') is a staleness candidate — ${cand.reasons.join("; ")}. Apply the complete-to-stale transition via context-reconcile or by hand; validate never mutates.`,
			block: cand.block,
			field: `${cand.id}.${cand.kind}`,
			code: "staleness-candidate",
		});
	}

	// ── Nested id-bearing array warning (content-addressed substrate identity,
	// Cycle 9.2) ─────────────────────────────────────────────────────────────
	// Schema-level, independent of block DATA + config: enumerate the active
	// substrate's installed schemas and flag every array property at nesting
	// depth ≥ 1 whose item shape carries an `id` — a relationship-as-embedding
	// that should be promoted to a top-level entity + membership edge (Phase H).
	// Non-fatal (warning), so it raises the warning count only and never flips
	// status to "invalid" by itself. Runs whether or not config is present;
	// skips cleanly when the schemas dir is absent (pre-bootstrap substrate) and
	// is best-effort per-file (an unparseable / unreadable schema is skipped
	// rather than failing the whole project validate).
	{
		// Resolve the substrate dir via tryResolveContextDir (returns null when no
		// pointer exists) rather than schemasDir, whose resolveContextDir THROWS on a
		// pointer-less cwd — validateContext must degrade cleanly there, not throw.
		const ctxRoot = tryResolveContextDir(cwd);
		const schemasDirPath = ctxRoot === null ? null : path.join(ctxRoot, SCHEMAS_DIR);
		if (schemasDirPath !== null && fs.existsSync(schemasDirPath)) {
			for (const file of fs.readdirSync(schemasDirPath).sort()) {
				if (!file.endsWith(".schema.json")) continue;
				const schemaName = file.slice(0, -".schema.json".length);
				let parsed: Record<string, unknown>;
				try {
					parsed = JSON.parse(fs.readFileSync(path.join(schemasDirPath, file), "utf-8")) as Record<string, unknown>;
				} catch {
					continue; // unreadable / non-JSON schema — not this pass's concern
				}
				for (const fieldPath of findNestedIdBearingArrays(parsed)) {
					issues.push({
						severity: "warning",
						message: `nested id-bearing array '${fieldPath}' — promote to a top-level entity + membership edge (Phase H)`,
						block: schemaName,
						field: fieldPath,
						code: "nested_id_bearing_array",
					});
				}
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

	// ── Substrate-wide block schema-validity sweep ────────────────────────────
	// The composed verdict must cover schema validity, not only edge/invariant
	// integrity: invalidity introduced WITHOUT a write to the block (a schema
	// resync, a hand edit, catalog drift) previously sat behind a clean verdict
	// until the next write to that block failed. For every block that has BOTH a
	// schema in <substrateDir>/schemas/ AND a block file, validate the whole
	// block against its installed schema — migration-aware when the envelope is
	// stamped (validateBlockWithMigrationForDir walks a lagging version through
	// the registered chain), raw otherwise (the same helper: absent version ⇒
	// straight validate). Every failure surfaces as an ERROR naming the block,
	// the failing item id (resolved from the AJV instancePath), and the
	// field/keyword. Guarded per block so one unreadable file cannot mask the
	// rest of the sweep; pointer-less projects degrade gracefully (no sweep —
	// there is no substrate to validate), matching validateContext's class rule.
	{
		const substrateDir = tryResolveContextDir(cwd);
		const schemasDir = substrateDir ? path.join(substrateDir, "schemas") : null;
		if (substrateDir && schemasDir && fs.existsSync(schemasDir)) {
			const registry = getProjectMigrationRegistryForDir(substrateDir);
			for (const schemaFile of fs.readdirSync(schemasDir).filter((f) => f.endsWith(".schema.json"))) {
				const blockName = schemaFile.slice(0, -".schema.json".length);
				const blockFile = path.join(substrateDir, `${blockName}.json`);
				if (!fs.existsSync(blockFile)) continue;
				try {
					const blockData = JSON.parse(fs.readFileSync(blockFile, "utf-8"));
					validateBlockWithMigrationForDir(substrateDir, blockName, blockData, registry);
				} catch (err) {
					if (err instanceof ValidationError) {
						for (const e of err.errors) {
							const itemId = blockItemIdForInstancePath(cwd, blockName, e.instancePath);
							issues.push({
								severity: "error",
								message:
									`Block '${blockName}' fails its installed schema at ${e.instancePath || "(envelope)"}${itemId ? ` (item '${itemId}')` : ""}: ${e.keyword} ${e.message ?? ""}`.trimEnd(),
								block: blockName,
								...(itemId !== undefined ? { field: itemId } : {}),
								code: "block_schema_invalid",
							});
						}
					} else {
						issues.push({
							severity: "error",
							message: `Block '${blockName}' failed schema-validity sweep: ${err instanceof Error ? err.message : String(err)}`,
							block: blockName,
							code: "block_schema_invalid",
						});
					}
				}
			}
		}
	}

	const errorCount = issues.filter((i) => i.severity === "error").length;
	const warningCount = issues.filter((i) => i.severity === "warning").length;
	return {
		status: errorCount > 0 ? "invalid" : warningCount > 0 ? "warnings" : "clean",
		issues,
	};
}

/**
 * Resolve the failing block item's `id` from an AJV `instancePath` of the form
 * `/<arrayKey>/<index>[/...]` by re-reading the block file. Returns undefined
 * for envelope-level paths or when the item carries no string id.
 */
function blockItemIdForInstancePath(cwd: string, blockName: string, instancePath: string): string | undefined {
	const m = /^\/([^/]+)\/(\d+)/.exec(instancePath);
	if (!m) return undefined;
	try {
		const substrateDir = resolveContextDir(cwd);
		const data = JSON.parse(fs.readFileSync(path.join(substrateDir, `${blockName}.json`), "utf-8")) as Record<
			string,
			unknown
		>;
		const arr = data[m[1]];
		if (!Array.isArray(arr)) return undefined;
		const item = arr[Number(m[2])];
		if (!item || typeof item !== "object") return undefined;
		const id = (item as Record<string, unknown>).id;
		return typeof id === "string" ? id : undefined;
	} catch {
		return undefined;
	}
}

// ── Verification-Gated Task Completion ─────────────────────────────────────

export interface CompleteTaskResult {
	taskId: string;
	verificationId: string;
	verificationStatus: string;
	previousStatus: string;
	/** true when this call filed the verification_verifies_item edge; false when an exact edge pre-existed (no-op dedup). */
	edgeAppended: boolean;
}

/**
 * Verification-gated task completion — the closure transition ATOM. Reads the
 * verification block to confirm a passing verification entry exists, FILES the
 * `verification_verifies_item` closure-table edge itself (verification as
 * parent, task as child; idempotent — an exact pre-existing edge is a no-op via
 * appendRelation's dedup), then updates the task status to "completed", all in
 * one call. Filing the edge here rather than requiring a prior append-relation
 * is load-bearing: an error-severity invariant pair (passed-verification-
 * verifies-completed-task / completed-task-has-verification) forbids BOTH
 * intermediate resting states, so no two-op sequence can thread the write-time
 * gate — only the joint end-state is legal. The edge IS the linkage — no
 * `verification` field is embedded on the task (the verification → task
 * `verification.target`/`target_type` fields were removed from the verification
 * schema in favor of the edge).
 */
export function completeTask(
	cwd: string,
	taskId: string,
	verificationId: string,
	ctx?: DispatchContext,
): CompleteTaskResult {
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

	// 3. File the verification_verifies_item edge: verification (parent) →
	// task (child), through the same porcelain a standalone append-relation
	// uses (registered-type + endpoint-kind validation, atomic write,
	// exact-duplicate no-op). The closure-table edge — not a verification
	// field — is the canonical linkage; filing it in the SAME call that flips
	// status makes closure a single transition atom under the write-time
	// invariant gate.
	const { appended } = appendRelationByRef(
		cwd,
		{ parent: verificationId, child: taskId, relation_type: "verification_verifies_item" },
		ctx,
	);

	// 4. Update task status. The edge is the linkage — no `verification` field is
	// embedded (a populated additionalProperties:false tasks schema would reject it).
	updateItemInBlock(cwd, "tasks", "tasks", (t) => t.id === taskId, { status: "completed" }, ctx);

	return {
		taskId,
		verificationId,
		verificationStatus: String(verification.status),
		previousStatus: currentStatus,
		edgeAppended: appended,
	};
}
