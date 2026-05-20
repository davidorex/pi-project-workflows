/**
 * Project SDK — queryable surface for project block state, discovery,
 * and derived metrics. Computes everything dynamically from filesystem
 * and git — no cache, no stale data.
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { readBlock, updateItemInBlock } from "./block-api.js";
import { getLensValidators } from "./lens-validator.js";
import {
	type ConfigBlock,
	type Edge,
	type ItemRecord,
	loadConfig,
	loadRelations,
	validateRelations,
} from "./project-context.js";
import { projectDir, schemaPath, schemasDir } from "./project-dir.js";

// Re-export substrate SDK so consumers can keep importing through project-sdk
// during the migration arc.
export {
	type BlockKindDecl,
	type CompositionMember,
	type ConfigBlock,
	type CurationSuggestion,
	displayName,
	type Edge,
	edgesForLens,
	getProjectContext,
	groupByLens,
	type HierarchyDecl,
	type InvariantDecl,
	type ItemRecord,
	type LayerDecl,
	type LensSpec,
	listUncategorized,
	loadConfig,
	loadRelations,
	type ProjectContext,
	projectRoot,
	type RelationTypeDecl,
	type StatusBucket,
	type SubstrateValidationIssue,
	type SubstrateValidationResult,
	synthesizeFromField,
	validateRelations,
	walkDescendants,
} from "./project-context.js";

// ── Block discovery ──────────────────────────────────────────────────────────

export interface BlockInfo {
	name: string;
	hasSchema: boolean;
}

export function availableBlocks(cwd: string): BlockInfo[] {
	const workflowDir = projectDir(cwd);
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
	const dir = schemasDir(cwd);
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
	const schemasDirPath = schemasDir(cwd);
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

/** Default planning lifecycle block types shipped with /project init. */
export const PROJECT_BLOCK_TYPES = [
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
	const schemaPathStr = schemaPath(cwd, schemaName);
	try {
		const raw = JSON.parse(fs.readFileSync(schemaPathStr, "utf-8")) as Record<string, unknown>;
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
	const schemasDirPath = schemasDir(cwd);
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
	const blockDir = projectDir(cwd);
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

export interface ProjectState {
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
export function projectState(cwd: string): ProjectState {
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
	const blockDir = projectDir(cwd);
	try {
		if (fs.existsSync(blockDir)) {
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
	const state: ProjectState = {
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
	try {
		const handoffPath = path.join(projectDir(cwd), "handoff.json");
		state.hasHandoff = fs.existsSync(handoffPath);
	} catch {
		/* ignore */
	}

	return state;
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
	const blockDir = projectDir(cwd);
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

export interface ProjectValidationIssue {
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

export interface ProjectValidationResult {
	status: "clean" | "warnings" | "invalid";
	issues: ProjectValidationIssue[];
}

/**
 * Field-equality predicate for config-declared invariants. Mirrors the
 * composition-lens `where` semantics (project-context.ts:773-778): the item
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
export function validateProject(cwd: string): ProjectValidationResult {
	const issues: ProjectValidationIssue[] = [];

	// Build the unified ID index once — the resolution surface for every edge
	// endpoint and for the relocated invariants below.
	// Note: buildIdIndex enforces the prefix-vs-block invariant and may throw
	// on corrupted state; that surfaces as a hard failure to validateProject
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
