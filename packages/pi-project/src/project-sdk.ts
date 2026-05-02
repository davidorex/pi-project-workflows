/**
 * Project SDK — queryable surface for project block state, discovery,
 * and derived metrics. Computes everything dynamically from filesystem
 * and git — no cache, no stale data.
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { readBlock, updateItemInBlock } from "./block-api.js";
import { PROJECT_DIR, SCHEMAS_DIR } from "./project-dir.js";

// ── Block discovery ──────────────────────────────────────────────────────────

export interface BlockInfo {
	name: string;
	hasSchema: boolean;
}

export function availableBlocks(cwd: string): BlockInfo[] {
	const workflowDir = path.join(cwd, PROJECT_DIR);
	const schemasDir = path.join(workflowDir, SCHEMAS_DIR);
	if (!fs.existsSync(workflowDir)) return [];

	const blocks: BlockInfo[] = [];
	for (const file of fs.readdirSync(workflowDir)) {
		if (!file.endsWith(".json")) continue;
		const name = file.replace(".json", "");
		const hasSchema = fs.existsSync(path.join(schemasDir, `${name}.schema.json`));
		blocks.push({ name, hasSchema });
	}
	return blocks.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Discover schemas in PROJECT_DIR/SCHEMAS_DIR.
 * Returns sorted list of absolute paths to .schema.json files.
 */
export function availableSchemas(cwd: string): string[] {
	const dir = path.join(cwd, PROJECT_DIR, SCHEMAS_DIR);
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
 * Discover blocks with array properties by scanning PROJECT_DIR/SCHEMAS_DIR
 * for schemas whose root type has at least one array property.
 * Returns block name, first array key, and schema path for each.
 */
export function findAppendableBlocks(cwd: string): Array<{ block: string; arrayKey: string; schemaPath: string }> {
	const schemasDir = path.join(cwd, PROJECT_DIR, SCHEMAS_DIR);
	if (!fs.existsSync(schemasDir)) return [];
	const results: Array<{ block: string; arrayKey: string; schemaPath: string }> = [];
	for (const file of fs.readdirSync(schemasDir)) {
		if (!file.endsWith(".schema.json")) continue;
		const blockName = file.replace(".schema.json", "");
		try {
			const schema = JSON.parse(fs.readFileSync(path.join(schemasDir, file), "utf-8"));
			if (schema.properties) {
				for (const [key, prop] of Object.entries(schema.properties)) {
					if ((prop as Record<string, unknown>).type === "array") {
						results.push({ block: blockName, arrayKey: key, schemaPath: path.join(schemasDir, file) });
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
	const schemaPath = path.join(cwd, PROJECT_DIR, SCHEMAS_DIR, `${schemaName}.schema.json`);
	try {
		const raw = JSON.parse(fs.readFileSync(schemaPath, "utf-8")) as Record<string, unknown>;
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
 * Scans .project/schemas/ and parses each schema.
 */
export function schemaVocabulary(cwd: string): SchemaInfo[] {
	const schemasDir = path.join(cwd, PROJECT_DIR, SCHEMAS_DIR);
	if (!fs.existsSync(schemasDir)) return [];
	const results: SchemaInfo[] = [];
	for (const file of fs.readdirSync(schemasDir).sort()) {
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
	const blockDir = path.join(cwd, PROJECT_DIR);
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
	const blockDir = path.join(cwd, PROJECT_DIR);
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

	// Phases from PROJECT_DIR/phases/*.json
	let phaseTotal = 0;
	let phaseCurrent = 0;
	try {
		const phasesDir = path.join(cwd, PROJECT_DIR, "phases");
		if (fs.existsSync(phasesDir)) {
			const files = fs
				.readdirSync(phasesDir)
				.filter((f) => f.endsWith(".json"))
				.sort();
			phaseTotal = files.length;
			if (files.length > 0) {
				const last = files[files.length - 1];
				phaseCurrent = parseInt(last.split("-")[0], 10) || 0;
			}
		}
	} catch {
		/* no phases dir */
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
		const handoffPath = path.join(cwd, PROJECT_DIR, "handoff.json");
		state.hasHandoff = fs.existsSync(handoffPath);
	} catch {
		/* ignore */
	}

	return state;
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
 * Map from item-ID prefix to the block name that ID is expected to live in.
 * Plan 0 (v0.15.0) tightened the relevant block schemas so AJV rejects
 * ID values that violate these prefix conventions at write time. The
 * resolver enforces the same invariant at index-build time as a defense
 * against direct-fs writes that bypass validation.
 *
 * IDs whose prefix is not in this table are still indexed; only listed
 * prefixes are subject to block-of-residence enforcement.
 */
const ID_PREFIX_TO_BLOCK: Record<string, string> = {
	"DEC-": "decisions",
	"FGAP-": "framework-gaps",
	"R-": "research",
	"REVIEW-": "spec-reviews",
	"FEAT-": "features",
	"PLAN-": "layer-plans",
	"TASK-": "tasks",
	"REQ-": "requirements",
	"VER-": "verification",
	"RAT-": "rationale",
	"issue-": "issues",
};

/**
 * Look up the block expected to host an ID based on its prefix.
 * Returns null when the ID matches no known prefix (e.g., bare phase IDs,
 * legacy unprefixed IDs, or future prefix conventions not yet wired in).
 */
function expectedBlockForId(id: string): string | null {
	for (const [prefix, block] of Object.entries(ID_PREFIX_TO_BLOCK)) {
		if (id.startsWith(prefix)) return block;
	}
	return null;
}

/**
 * Build a map from item-ID to its location across every block in `.project/`.
 *
 * Scan strategy:
 *   1. `.project/phases/*.json` — single-object files contributing both
 *      `String(number)` and `name` as IDs under block "phases".
 *   2. `.project/*.json` — every array property whose items are objects with
 *      a string `id` field becomes an indexed entry.
 *
 * Prefix invariant: when an item ID starts with one of the known prefixes
 * (see ID_PREFIX_TO_BLOCK), the block it was found in must match the
 * expected block. Mismatches throw immediately — Plan 0's schema patterns
 * make this state unreachable through validated writes, so encountering
 * one indicates either a direct-fs corruption or an unmapped prefix
 * collision that needs explicit resolution.
 *
 * Collisions on identical IDs across different blocks: first writer wins
 * (no overwrite) — duplicate entries are intentionally ignored to keep
 * the resolver deterministic without allocating warning channels here.
 */
export function buildIdIndex(cwd: string): Map<string, ItemLocation> {
	const index = new Map<string, ItemLocation>();
	const blockDir = path.join(cwd, PROJECT_DIR);

	// Phase files — special: synthesized IDs from number + name fields,
	// not from a top-level `id` string. No prefix — exempt from the
	// prefix-vs-block consistency check.
	const phasesDir = path.join(blockDir, "phases");
	if (fs.existsSync(phasesDir)) {
		try {
			for (const file of fs.readdirSync(phasesDir).filter((f) => f.endsWith(".json"))) {
				try {
					const data = JSON.parse(fs.readFileSync(path.join(phasesDir, file), "utf-8")) as Record<string, unknown>;
					const phaseLoc: ItemLocation = { block: "phases", arrayKey: file, item: data };
					if (data.number !== undefined && !index.has(String(data.number))) {
						index.set(String(data.number), phaseLoc);
					}
					if (typeof data.name === "string" && !index.has(data.name)) {
						index.set(data.name, phaseLoc);
					}
				} catch {
					/* skip malformed phase file */
				}
			}
		} catch {
			/* phases dir unreadable */
		}
	}

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

				const expected = expectedBlockForId(idVal);
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

// ── Project Validation (cross-block reference integrity) ─────────────────────

export interface ProjectValidationIssue {
	severity: "error" | "warning";
	message: string;
	block: string;
	field: string;
}

export interface ProjectValidationResult {
	status: "clean" | "warnings" | "invalid";
	issues: ProjectValidationIssue[];
}

/**
 * Validate cross-block referential integrity: do IDs referenced across blocks
 * actually exist? Returns structured issues rather than throwing.
 *
 * ID collection delegates to `buildIdIndex` — per-kind Sets are then derived
 * by filtering the index on `ItemLocation.block`. Behavior preserves the
 * pre-resolver inline scan: same predicates against the same logical Sets.
 */
export function validateProject(cwd: string): ProjectValidationResult {
	const issues: ProjectValidationIssue[] = [];

	// Build the unified ID index once and partition into per-kind Sets.
	// Note: buildIdIndex enforces the prefix-vs-block invariant and may throw
	// on corrupted state; that surfaces as a hard failure to validateProject
	// callers (intended — corrupted IDs are not recoverable cross-ref issues).
	const idIndex = buildIdIndex(cwd);
	const phaseIds = new Set<string>();
	const taskIds = new Set<string>();
	const decisionIds = new Set<string>();
	const requirementIds = new Set<string>();
	const verificationIds = new Set<string>();
	for (const [id, loc] of idIndex) {
		switch (loc.block) {
			case "phases":
				phaseIds.add(id);
				break;
			case "tasks":
				taskIds.add(id);
				break;
			case "decisions":
				decisionIds.add(id);
				break;
			case "requirements":
				requirementIds.add(id);
				break;
			case "verification":
				verificationIds.add(id);
				break;
		}
	}

	// All known IDs for generic resolution — preserves pre-refactor allIds set
	// (phases + tasks + decisions + requirements + verifications). Other
	// block IDs are intentionally excluded to keep validateProject's
	// behavior bit-identical to the pre-refactor implementation.
	const allIds = new Set([...phaseIds, ...taskIds, ...decisionIds, ...requirementIds, ...verificationIds]);

	// Validate task references
	try {
		const taskData = readBlock(cwd, "tasks") as { tasks?: Record<string, unknown>[] };
		if (Array.isArray(taskData.tasks)) {
			for (const task of taskData.tasks) {
				// task.phase → valid phase
				if (task.phase !== undefined && !phaseIds.has(String(task.phase))) {
					issues.push({
						severity: "warning",
						message: `Task '${task.id}' references phase '${task.phase}' which does not exist`,
						block: "tasks",
						field: `tasks[${task.id}].phase`,
					});
				}
				// task.depends_on → valid task IDs
				if (Array.isArray(task.depends_on)) {
					for (const dep of task.depends_on as string[]) {
						if (!taskIds.has(dep)) {
							issues.push({
								severity: "error",
								message: `Task '${task.id}' depends on task '${dep}' which does not exist`,
								block: "tasks",
								field: `tasks[${task.id}].depends_on`,
							});
						}
					}
				}
				// task.verification → valid verification ID
				if (task.verification && !verificationIds.has(String(task.verification))) {
					issues.push({
						severity: "warning",
						message: `Task '${task.id}' references verification '${task.verification}' which does not exist`,
						block: "tasks",
						field: `tasks[${task.id}].verification`,
					});
				}
				// completed task without verification reference
				if (task.status === "completed" && !task.verification) {
					issues.push({
						severity: "error",
						message: `Task '${task.id}' is completed but has no verification reference`,
						block: "tasks",
						field: `tasks[${task.id}].verification`,
					});
				}
			}
		}
	} catch {
		/* block doesn't exist */
	}

	// Validate decision references
	try {
		const decData = readBlock(cwd, "decisions") as { decisions?: Record<string, unknown>[] };
		if (Array.isArray(decData.decisions)) {
			for (const dec of decData.decisions) {
				if (dec.phase !== undefined && !phaseIds.has(String(dec.phase))) {
					issues.push({
						severity: "warning",
						message: `Decision '${dec.id}' references phase '${dec.phase}' which does not exist`,
						block: "decisions",
						field: `decisions[${dec.id}].phase`,
					});
				}
				// decision.task → valid task ID
				if (dec.task && !taskIds.has(String(dec.task))) {
					issues.push({
						severity: "warning",
						message: `Decision '${dec.id}' references task '${dec.task}' which does not exist`,
						block: "decisions",
						field: `decisions[${dec.id}].task`,
					});
				}
			}
		}
	} catch {
		/* block doesn't exist */
	}

	// Validate issue references
	try {
		const issueData = readBlock(cwd, "issues") as { issues?: Record<string, unknown>[] };
		if (Array.isArray(issueData.issues)) {
			for (const issue of issueData.issues) {
				if (issue.resolved_by && !allIds.has(String(issue.resolved_by))) {
					issues.push({
						severity: "warning",
						message: `Issue '${issue.id}' references resolved_by '${issue.resolved_by}' which does not exist`,
						block: "issues",
						field: `issues[${issue.id}].resolved_by`,
					});
				}
			}
		}
	} catch {
		/* block doesn't exist */
	}

	// Validate requirement references
	try {
		const reqData = readBlock(cwd, "requirements") as { requirements?: Record<string, unknown>[] };
		if (Array.isArray(reqData.requirements)) {
			for (const req of reqData.requirements) {
				if (Array.isArray(req.traces_to)) {
					for (const ref of req.traces_to as string[]) {
						if (!allIds.has(ref)) {
							issues.push({
								severity: "warning",
								message: `Requirement '${req.id}' traces to '${ref}' which does not exist`,
								block: "requirements",
								field: `requirements[${req.id}].traces_to`,
							});
						}
					}
				}
				if (Array.isArray(req.depends_on)) {
					for (const dep of req.depends_on as string[]) {
						if (!requirementIds.has(dep)) {
							issues.push({
								severity: "error",
								message: `Requirement '${req.id}' depends on requirement '${dep}' which does not exist`,
								block: "requirements",
								field: `requirements[${req.id}].depends_on`,
							});
						}
					}
				}
			}
		}
	} catch {
		/* block doesn't exist */
	}

	// Validate verification references
	try {
		const verData = readBlock(cwd, "verification") as { verifications?: Record<string, unknown>[] };
		if (Array.isArray(verData.verifications)) {
			for (const ver of verData.verifications) {
				if (ver.target && !allIds.has(String(ver.target))) {
					issues.push({
						severity: "warning",
						message: `Verification '${ver.id}' targets '${ver.target}' which does not exist`,
						block: "verification",
						field: `verifications[${ver.id}].target`,
					});
				}
			}
		}
	} catch {
		/* block doesn't exist */
	}

	// Validate rationale references
	try {
		const ratData = readBlock(cwd, "rationale") as { rationales?: Record<string, unknown>[] };
		if (Array.isArray(ratData.rationales)) {
			for (const rat of ratData.rationales) {
				if (Array.isArray(rat.related_decisions)) {
					for (const decId of rat.related_decisions as string[]) {
						if (!decisionIds.has(decId)) {
							issues.push({
								severity: "warning",
								message: `Rationale '${rat.id}' references decision '${decId}' which does not exist`,
								block: "rationale",
								field: `rationales[${rat.id}].related_decisions`,
							});
						}
					}
				}
			}
		}
	} catch {
		/* block doesn't exist */
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
