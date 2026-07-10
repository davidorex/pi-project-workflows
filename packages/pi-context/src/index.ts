/**
 * Extension entry point for pi-context — registers block tools and the
 * /context command for project state management.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { ErrorObject } from "ajv";
import { forEachBlockArray, readBlock, readBlockForDir, updateItemInBlock, writeBlockForDir } from "./block-api.js";
import { computeContentHash, computeFileContentHash } from "./content-hash.js";
import {
	type AdoptResult,
	adoptConception,
	type ConfigBlock,
	installedBlockDestPath,
	installedSchemaDestPath,
	loadConfig,
	loadContext,
	loadRelations,
	mergeCatalogRegistries,
	type RegistryAdditions,
	reconcileActiveSubstrateRegistration,
	writeConfig,
	writeSkeletonConfig,
} from "./context.js";
import {
	BootstrapNotFoundError,
	flipBootstrapPointer,
	migrationsPathForDir,
	mintSubstrateId,
	pendingBlockedPathForDir,
	resolveContextDir,
	SCHEMAS_DIR,
	schemasDir,
	tryResolveContextDir,
	writeBootstrapPointer,
} from "./context-dir.js";
import { registerSubstrate } from "./context-registry.js";
import {
	buildIdIndex,
	contextState,
	derivedRollupComplete,
	evaluateStalenessCandidates,
	findAppendableBlocks,
	validateContext,
} from "./context-sdk.js";
import type { DispatchContext } from "./dispatch-context.js";
import { cleanGitEnv } from "./git-env.js";
import { buildCurationSuggestions, loadLensView, renderLensView } from "./lens-view.js";
import {
	buildFreshRegistryWithChain,
	getProjectMigrationRegistryForDir,
	invalidateMigrationRegistryForDir,
} from "./migration-registry-loader.js";
import {
	appendMigrationDeclForDir,
	loadMigrationsFileForDir,
	type MigrationDecl,
	seedCatalogConfigMigrationDecls,
} from "./migrations-store.js";
import { getObject, putObject } from "./object-store.js";
import { registerAll } from "./ops-registry.js";
import { buildOrientationBlock, skillsDir } from "./orientation.js";
import {
	loadPendingBlockedForDir,
	type PendingBlockedEntry,
	reconcilePendingBlockedForDir,
} from "./pending-blocked-store.js";
import { discoverArrayKey } from "./read-element.js";
import { loadRoadmap, renderRoadmap, validateRoadmap } from "./roadmap-plan.js";
import { mergeSchema, type SchemaConflict } from "./schema-merge.js";
import { runMigrations } from "./schema-migrations.js";
import { ValidationError, validate, validateBlockWithMigrationForDir } from "./schema-validator.js";
import { writeSchemaCheckedForDir } from "./schema-write.js";
import { resolveStateDerivation, resolveStatusVocabulary as resolveStatusVocab } from "./status-vocab.js";
import { checkForUpdates } from "./update-check.js";

// ── Command handlers ────────────────────────────────────────────────────────

/**
 * /context status — derives project state from authoritative sources and
 * sends it as a structured message. Available to human, LLM, and system.
 */
function handleStatus(ctx: ExtensionCommandContext, pi: ExtensionAPI): void {
	const state = contextState(ctx.cwd);

	const lines: string[] = [];
	lines.push(`## Project Status`);
	lines.push("");
	lines.push(`**Source:** ${state.sourceFiles} files, ${state.sourceLines} lines | **Tests:** ${state.testCount}`);
	lines.push(`**Schemas:** ${state.schemas} | **Blocks:** ${state.blocks}`);
	lines.push(`**Phases:** ${state.phases.total} (current: ${state.phases.current})`);
	lines.push(`**Commit:** ${state.lastCommit} (${state.lastCommitMessage})`);

	// Block summaries
	const summaryEntries = Object.entries(state.blockSummaries);
	if (summaryEntries.length > 0) {
		lines.push("");
		lines.push("**Blocks:**");
		for (const [name, summary] of summaryEntries) {
			const arrayEntries = Object.entries(summary.arrays);
			if (arrayEntries.length === 1) {
				// Single-array block — compact display
				const [, arr] = arrayEntries[0];
				let detail = `${arr.total} items`;
				if (arr.byStatus) {
					detail += ` (${Object.entries(arr.byStatus)
						.map(([s, n]) => `${s}: ${n}`)
						.join(", ")})`;
				}
				lines.push(`- **${name}:** ${detail}`);
			} else {
				// Multi-array block — show each array
				lines.push(`- **${name}:**`);
				for (const [key, arr] of arrayEntries) {
					lines.push(`    ${key}: ${arr.total}`);
				}
			}
		}
	}

	// Planning lifecycle
	if (state.requirements) {
		const r = state.requirements;
		const statusParts = Object.entries(r.byStatus)
			.map(([s, n]) => `${s}: ${n}`)
			.join(", ");
		lines.push(`- **Requirements:** ${r.total} (${statusParts})`);
	}
	if (state.tasks) {
		const t = state.tasks;
		const statusParts = Object.entries(t.byStatus)
			.map(([s, n]) => `${s}: ${n}`)
			.join(", ");
		lines.push(`- **Tasks:** ${t.total} (${statusParts})`);
	}
	if (state.domain) {
		lines.push(`- **Domain:** ${state.domain.total} entries`);
	}
	if (state.verifications) {
		const v = state.verifications;
		lines.push(`- **Verifications:** ${v.total} (${v.passed} passed, ${v.failed} failed)`);
	}
	if (state.hasHandoff) {
		lines.push(`- **Handoff:** active (<substrate-dir>/handoff.json)`);
	}

	if (state.recentCommits.length > 0) {
		lines.push("");
		lines.push("**Recent:**");
		for (const c of state.recentCommits) lines.push(`  ${c}`);
	}

	pi.sendMessage({
		customType: "context-status",
		content: lines.join("\n"),
		display: true,
	});
}

/**
 * /context add-work — discovers appendable blocks from schemas,
 * returns a structured instruction for main context to extract
 * items from the conversation into typed JSON blocks.
 */
async function handleAddWork(args: string, ctx: ExtensionCommandContext, pi: ExtensionAPI): Promise<void> {
	const workflowDir = tryResolveContextDir(ctx.cwd);
	if (workflowDir === null) {
		ctx.ui.notify(
			"No .pi-context.json bootstrap pointer found. Run /context init <substrate-dir> first to bootstrap the substrate.",
			"error",
		);
		return;
	}
	const schemasDirPath = schemasDir(ctx.cwd);

	if (!fs.existsSync(schemasDirPath)) {
		// Reachable only when the bootstrap pointer is present but the substrate
		// dir's schemas/ subdirectory is absent (e.g. partial init). Display
		// string references the resolved schemas path rather than the literal
		// `.project/schemas/` so non-default substrate dirs surface accurately.
		ctx.ui.notify(`No schemas directory found at ${schemasDirPath}.`, "warning");
		return;
	}

	const appendableBlocks = findAppendableBlocks(ctx.cwd);
	const blockInfo: string[] = [];

	for (const { block, arrayKey, schemaPath } of appendableBlocks) {
		const dataPath = path.join(workflowDir, `${block}.json`);

		const schema = fs.readFileSync(schemaPath, "utf8");
		let currentCount = "";
		try {
			const data = readBlock(ctx.cwd, block) as Record<string, unknown>;
			const arr = data[arrayKey];
			if (Array.isArray(arr)) currentCount = ` (${arr.length} existing)`;
		} catch {
			/* block file doesn't exist or invalid — skip count */
		}

		blockInfo.push(
			`### ${block} (array: ${arrayKey})${currentCount}\nSchema: ${schemaPath}\nData: ${dataPath}\n\`\`\`json\n${schema}\n\`\`\``,
		);
	}

	const inputSection = args.trim() ? `**Input:**\n${args.trim()}\n\n` : "";

	const blockNames = appendableBlocks.map((b) => b.block).join(", ");

	const instruction = `## Add Work to Project Blocks

${inputSection}Read the recent conversation and extract relevant items into the project's typed JSON blocks. Each block has a schema — conform to it exactly.

**Appendable blocks:** ${blockNames}

**Blocks to update:**

${blockInfo.join("\n\n")}

**Process:**
1. Read the conversation for items that belong in the appendable blocks
2. Read the current block files to check for duplicates
3. Append new entries — do NOT replace existing content
4. Schema validation happens automatically when you use append-block-item

**Rules:**
- IDs must be kebab-case and unique within their block
- Use \`source: "human"\` for content from this conversation
- Architecture changes and phase creation are separate processes — do not attempt them here`;

	pi.sendMessage(
		{
			customType: "context-add-work",
			content: instruction,
			display: false,
		},
		{
			triggerTurn: true,
			deliverAs: "followUp",
		},
	);
}

/**
 * Thrown by `initProject` when an existing `.pi-context.json` bootstrap pointer
 * declares a different `contextDir` than the caller is requesting. Previously
 * the divergence was silent — `initProject` only wrote the pointer when absent
 * and then operated against the EXISTING pointer's contextDir, completely
 * dropping the caller's argument and emitting a misleading "Project
 * initialized" message that scaffolded directories in the EXISTING substrate.
 * The loud-fail surfaces the divergence and names `/context switch -c <new-dir>`
 * as the correct command for changing the pointer to a new substrate dir.
 *
 * Carries `existing` (the pointer's current contextDir) and `requested` (the
 * caller's arg) so callers can format diagnostic messages without re-deriving.
 * Idempotent re-init (existing === requested) is preserved (no throw — falls
 * through to the dir-scaffolding loop which is itself idempotent).
 */
export class ContextInitMismatchError extends Error {
	readonly existing: string;
	readonly requested: string;
	constructor(existing: string, requested: string) {
		super(
			`/context init: .pi-context.json already declares contextDir='${existing}' but caller requested '${requested}'. ` +
				`Re-init with a different substrate dir is rejected — use '/context switch -c ${requested}' to bootstrap '${requested}' as a new substrate AND flip the bootstrap pointer to it in one operation. ` +
				`To re-scaffold the existing '${existing}' substrate idempotently, re-run /context init with no argument change.`,
		);
		this.name = "ContextInitMismatchError";
		this.existing = existing;
		this.requested = requested;
	}
}

/**
 * Initialize the substrate dir: write the bootstrap pointer and scaffold the
 * substrate + schemas directories ONLY. No schema/block assets are copied here
 * (init must not impose a catalog — the package ships no default schemas or
 * block files; users opt in via `config.installed_schemas`/`installed_blocks`).
 * Run accept-all to adopt
 * a config + install to materialize the declared assets. Shared by the /context
 * init command handler and the context-init tool.
 *
 * Hard-fail-on-mismatch: when `.pi-context.json` already exists
 * AND its declared contextDir differs from the caller's `contextDir` argument,
 * throws ContextInitMismatchError naming `/context switch -c <new-dir>` as the
 * correct command. When the existing pointer matches the caller's arg, behavior
 * is idempotent re-init (dir-scaffolding loop skips existing dirs). When no
 * pointer exists, the caller's arg writes a fresh pointer.
 */
export function initProject(cwd: string, contextDir: string): { created: string[]; skipped: string[] } {
	const bootstrapPath = path.join(cwd, ".pi-context.json");
	if (fs.existsSync(bootstrapPath)) {
		// Existing pointer — check for divergence with caller's arg before
		// touching anything. Read the pointer directly (not via the cached
		// resolveContextDir) so the error message reflects the actual on-disk
		// state and is not masked by a stale cache entry.
		let existingContextDir: string;
		try {
			const raw = fs.readFileSync(bootstrapPath, "utf-8");
			const parsed = JSON.parse(raw) as { contextDir?: unknown };
			if (typeof parsed.contextDir !== "string") {
				throw new Error(
					`initProject: existing ${bootstrapPath} lacks a string contextDir; refuses to proceed against a malformed pointer`,
				);
			}
			existingContextDir = parsed.contextDir;
		} catch (err) {
			if (err instanceof Error && err.name === "ContextInitMismatchError") throw err;
			throw new Error(
				`initProject: failed to read existing ${bootstrapPath}: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
		if (existingContextDir !== contextDir) {
			throw new ContextInitMismatchError(existingContextDir, contextDir);
		}
		// Matching pointer — fall through to idempotent dir scaffolding without
		// re-writing the pointer (writeBootstrapPointer would stamp fresh
		// created_at on every init, corrupting the bootstrap-timestamp
		// forensic).
	} else {
		// No pointer — write a fresh one carrying the caller's contextDir
		// (required — the substrate dir name is never hardcoded). writeBootstrapPointer is atomic + invalidates
		// the bootstrapCache so the immediate-next resolveContextDir call reads
		// the freshly-written value.
		writeBootstrapPointer(cwd, contextDir);
	}
	const projectDirPath = resolveContextDir(cwd);
	const schemasDirPath = schemasDir(cwd);
	const created: string[] = [];
	const skipped: string[] = [];
	for (const dir of [projectDirPath, schemasDirPath]) {
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
			created.push(`${path.relative(cwd, dir)}/`);
		} else {
			skipped.push(`${path.relative(cwd, dir)}/`);
		}
	}
	// Write the minimal schema-valid SKELETON config so the
	// substrate has a tool-driven config from bootstrap — onward paths are
	// /context accept-all (adopt the packaged catalog) OR amend-config / edit
	// (build a custom vocabulary). NEVER-CLOBBER: an idempotent re-init over an
	// existing config (skeleton or populated) leaves it untouched.
	const skeleton = writeSkeletonConfig(cwd);
	const configRel = `${path.relative(cwd, path.join(projectDirPath, "config.json"))}`;
	(skeleton.written ? created : skipped).push(configRel);
	return { created, skipped };
}

/**
 * Result shape from installContext. installed/updated/skipped/notFound carry
 * relative-to-project-root destination paths (schemas/<name>.schema.json or
 * <name>.json). error is set only when no .project/config.json exists.
 */
export interface InstallResult {
	error?: string;
	installed: string[];
	updated: string[];
	skipped: string[];
	notFound: string[];
	preserved: string[];
	/**
	 * Safe re-sync (slice S4) — closing the earlier footgun where
	 * `/context install --update` blindly overwrote installed schemas AND block
	 * data with empty catalog starters, with no safe way to re-sync a stale
	 * schema. SCHEMA --update outcomes.
	 *   - `resynced`: an installed schema re-synced from the catalog where no
	 *     block-item migration was required (same `version` as installed — a
	 *     description-only / non-versioned drift — OR a version bump whose block
	 *     file is absent / holds zero items, so no items needed migrating).
	 *   - `migrated`: a version-bumped schema re-synced AND the populated block's
	 *     items forward-migrated through the shipped migration chain + re-validated
	 *     against the new schema (block re-written via the migration path).
	 *   - `blocked`: a version-bumped schema REFUSED — no shipped migration chain
	 *     reaches the catalog version, OR the migrated items would not validate
	 *     against the new schema. BOTH the schema file AND the block file are left
	 *     byte-unchanged (forward-migrate-or-refuse; never strand items under a
	 *     schema they fail).
	 */
	resynced: string[];
	migrated: string[];
	blocked: string[];
	/**
	 * Ceremony-entry identity establishment — mint, persist, register substrate
	 * identity at entry when absent, rather than refusing outright: the
	 * `substrate_id` this
	 * run minted + persisted + registered because the config lacked one. Absent
	 * when identity was already established (never re-minted).
	 */
	substrateIdEstablished?: string;
}

/**
 * One per-item validation failure mapped from an AJV `ErrorObject`, in the
 * minimal shape the blocked-diagnostic surfaces consume — surfacing which
 * item/field/constraint actually failed instead of discarding the AJV error
 * and returning a bare "blocked."
 * `itemId` is the failing block item's `id` when the AJV `instancePath` resolves
 * to one (envelope-level errors leave it undefined); `instancePath` is AJV's raw
 * JSON pointer; `keyword` + `message` carry the constraint that failed and its
 * AJV text. The shape is deliberately minimal — no full `params` plumbing.
 */
export interface BlockValidationFailure {
	itemId?: string;
	instancePath: string;
	keyword: string;
	message: string;
}

/**
 * Per-schema blocked-resync diagnostic detail — surfacing which
 * item/field/constraint actually failed instead of discarding the AJV error
 * and returning a bare "blocked." Carried by
 * `simulateResyncOutcome` / `resyncSchema` on the blocked arms and surfaced via
 * `UpdateResult.blockedDetail`, so a refused catalog-ahead resync reports WHY it
 * refused — distinguishing a missing migration chain from items that fail the
 * catalog schema, with the version pair and (for validation failures) the per-
 * item failures naming id / field / constraint.
 *   - `no-migration-chain`: no shipped chain reaches `to` from `from`; the
 *     version pair is carried, `failures` omitted.
 *   - `validation-failed`: the in-memory forward-migrate + re-validate threw an
 *     AJV ValidationError; the version pair is carried, `failures` lists the
 *     per-item constraint failures.
 *   - `write-failed`: a NON-validation throw at the resync write boundary (e.g.
 *     the mandatory identity stamp refusing a substrate with no `substrate_id`,
 *     or an unreadable catalog body) — classified at the catch site rather
 *     than lumped in with item-validation failures. The items were NOT flagged
 *     invalid; `failures` carries a single `{instancePath:"", keyword:"error"}`
 *     entry whose `message` is the thrown error. A `write-failed` refusal
 *     inscribes NO failure markers and persists NO pending-blocked record —
 *     those are validation-only consequences (the resolve-blocked remedy fixes
 *     items, which is not the problem here).
 */
export interface BlockedDetail {
	name: string;
	reason: "no-migration-chain" | "validation-failed" | "write-failed";
	from?: string;
	to?: string;
	failures?: BlockValidationFailure[];
	/**
	 * content_hash of the pinned pre-marker block bytes, set ONLY when the live
	 * update actually inscribed git-style failure markers into this schema's block
	 * file. `renderBlocked` keys its past-tense "markers were
	 * written INTO the block file" claim on this field's presence: a dryRun preview
	 * (writes nothing) and a `no-migration-chain` entry (never marked) leave it
	 * omitted, so the rendered guidance for those does not falsely claim a write.
	 */
	premarker_hash?: string;
}

/**
 * Resolve the failing block item's `id` from an AJV `instancePath`.
 * The AJV pointer for a block-item error is `/<arrayKey>/<index>/<field>…`; this
 * matches the leading `/<arrayKey>/<index>` segment, resolves
 * `blockData[arrayKey][index]`, and returns its `id` when that is a string.
 * Returns undefined when the path is envelope-level (no `/<arrayKey>/<index>`
 * prefix), the indexed item is absent, or its `id` is not a string.
 */
function itemIdForPath(blockData: unknown, instancePath: string): string | undefined {
	const m = /^\/([^/]+)\/(\d+)/.exec(instancePath);
	if (!m) return undefined;
	const [, arrayKey, indexStr] = m;
	if (!blockData || typeof blockData !== "object") return undefined;
	const arr = (blockData as Record<string, unknown>)[arrayKey];
	if (!Array.isArray(arr)) return undefined;
	const item = arr[Number(indexStr)];
	if (!item || typeof item !== "object") return undefined;
	const id = (item as Record<string, unknown>).id;
	return typeof id === "string" ? id : undefined;
}

/**
 * Map AJV `ErrorObject[]` to the minimal {@link BlockValidationFailure} shape,
 * resolving each error's failing item `id` from `blockData` via {@link
 * itemIdForPath}. `message` is the AJV message (`""` when absent).
 */
function mapValidationFailures(errors: ErrorObject[], blockData: unknown): BlockValidationFailure[] {
	return errors.map((e) => ({
		itemId: itemIdForPath(blockData, e.instancePath),
		instancePath: e.instancePath,
		keyword: e.keyword,
		message: e.message ?? "",
	}));
}

/**
 * Locate the 0-based source-text line index of the field a
 * `validation-failed` failure's `instancePath` points at, within the pretty-printed
 * block-file lines. The AJV pointer is `/<arrayKey>/<index>/<field>…`; this finds the
 * `"<arrayKey>":` line, then walks forward counting STRUCTURAL `{`/`[`/`}`/`]` (a
 * per-line lexer skips JSON string literals — quote-to-quote with backslash escapes —
 * so braces/brackets inside string VALUES are never miscounted) to reach the index-th
 * item object, then finds the `"<field>":` line within it. Returns null when the path
 * is envelope-level (no `/<arrayKey>/<index>` prefix) or the line cannot be located —
 * the caller then places a header marker block at the TOP of the file. Line-granular
 * only (no column); the marker write is always a full-line sentinel above/below.
 */
function locateFailureLine(lines: string[], instancePath: string): number | null {
	const m = /^\/([^/]+)\/(\d+)(?:\/(.+))?$/.exec(instancePath);
	if (!m) return null;
	const [, arrayKey, indexStr, fieldTail] = m;
	const index = Number(indexStr);
	const arrayKeyRe = new RegExp(`^\\s*"${arrayKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"\\s*:`);
	let arrLine = -1;
	for (let i = 0; i < lines.length; i++) {
		if (arrayKeyRe.test(lines[i])) {
			arrLine = i;
			break;
		}
	}
	if (arrLine === -1) return null;
	let depth = 0;
	let inArray = false;
	let itemCount = -1;
	let itemStart = -1;
	for (let i = arrLine; i < lines.length; i++) {
		const line = lines[i];
		// Per-line lexer: count structural brackets only OUTSIDE string literals so a
		// brace/bracket inside a string VALUE never shifts the depth (the string-aware
		// fix — a naive char scan would mis-place the sentinel).
		let inString = false;
		let escaped = false;
		for (let c = 0; c < line.length; c++) {
			const ch = line[c];
			if (inString) {
				if (escaped) {
					escaped = false;
				} else if (ch === "\\") {
					escaped = true;
				} else if (ch === '"') {
					inString = false;
				}
				continue;
			}
			if (ch === '"') {
				inString = true;
				continue;
			}
			if (ch === "[") {
				if (!inArray) inArray = true;
			} else if (ch === "]") {
				if (inArray && depth === 0) return null;
			} else if (ch === "{") {
				if (inArray && depth === 0) {
					itemCount++;
					if (itemCount === index) itemStart = i;
				}
				depth++;
			} else if (ch === "}") {
				depth--;
				if (inArray && depth === 0 && itemCount === index) {
					if (!fieldTail) return itemStart >= 0 ? itemStart : null;
					const fieldKey = fieldTail.split("/")[0];
					const fieldRe = new RegExp(`^\\s*"${fieldKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"\\s*:`);
					for (let j = itemStart; j <= i; j++) {
						if (fieldRe.test(lines[j])) return j;
					}
					return itemStart >= 0 ? itemStart : null;
				}
			}
		}
	}
	return null;
}

/**
 * The git-style conflict sentinel contract — ONE source of truth shared by the
 * marker WRITER (`composeMarkerText` builds its open/close lines from these
 * tokens) and the marker DETECTORS (every blocked-marker scan derives its regex
 * from `MARKER_LINE_RE`). The seven-character `<<<<<<<` / `>>>>>>>` literals are
 * intentionally confined to these two token constants so the writer and the
 * detectors can never drift to different sentinels. `MARKER_LINE_RE` matches a
 * line that STARTS with either token (no `m` flag — single-line tests);
 * `MARKER_LINE_RE_MULTILINE` is its multiline twin (same source, `m` flag) for
 * whole-file scans where the marker may be on any line.
 */
const MARKER_OPEN = "<<<<<<<";
const MARKER_CLOSE = ">>>>>>>";
const MARKER_LINE_RE = new RegExp(`^(${MARKER_OPEN}|${MARKER_CLOSE})`);
const MARKER_LINE_RE_MULTILINE = new RegExp(MARKER_LINE_RE.source, "m");

/**
 * Compose the marker-bearing block-file text for a
 * validation-blocked resync (git-merge-style in-file failure markers, the
 * default behavior for a blocked schema update). Given the raw pretty-printed block bytes and the
 * per-item failures, inserts FULL-LINE git-style conflict sentinels around the
 * offending line(s):
 *
 *   `<<<<<<< BLOCKED <name> <from> -> <to> <instancePath> [<keyword>]: <message>`
 *   ...the offending line...
 *   `>>>>>>> target: <name>@<to>`
 *
 * The message reuses `describeBlockedFailure`'s keyword phrasing so the in-file text
 * and the CLI `renderBlocked` report read identically. A failure whose line cannot be
 * located (envelope-level path, or the field line is not found) gets a marker block at
 * the TOP of the file. Sentinels are inserted bottom-up by descending line index so an
 * earlier insertion does not shift a later one. The result is NOT valid JSON (by
 * design — the markers make the block fail any JSON read until stripped by
 * `resolveBlocked`).
 */
function composeMarkerText(
	rawBytes: string,
	name: string,
	from: string | undefined,
	to: string | undefined,
	failures: BlockValidationFailure[],
): string {
	const fromTok = from ?? "?";
	const toTok = to ?? "?";
	const lines = rawBytes.split("\n");
	const topMarkers: BlockValidationFailure[] = [];
	const byLine = new Map<number, BlockValidationFailure[]>();
	for (const f of failures) {
		const idx = locateFailureLine(lines, f.instancePath);
		if (idx === null) {
			topMarkers.push(f);
		} else {
			const list = byLine.get(idx) ?? [];
			list.push(f);
			byLine.set(idx, list);
		}
	}
	const openFor = (f: BlockValidationFailure): string => {
		const kw = f.keyword && f.keyword !== "error" ? ` [${f.keyword}]` : "";
		const ip = f.instancePath ? ` ${f.instancePath}` : "";
		return `${MARKER_OPEN} BLOCKED ${name} ${fromTok} -> ${toTok}${ip}${kw}: ${describeBlockedFailure(f)}`;
	};
	const closeLine = `${MARKER_CLOSE} target: ${name}@${toTok}`;
	const targetIdxs = [...byLine.keys()].sort((a, b) => b - a);
	for (const idx of targetIdxs) {
		const lineFailures = byLine.get(idx) ?? [];
		const opens = lineFailures.map(openFor);
		lines.splice(idx + 1, 0, closeLine);
		lines.splice(idx, 0, ...opens);
	}
	if (topMarkers.length > 0) {
		const header = [...topMarkers.map(openFor), closeLine];
		lines.unshift(...header);
	}
	return lines.join("\n");
}

/**
 * Resolve the package samples catalog once: the absolute `samplesRoot` plus a
 * `byId` map from each block_kind's `canonical_id` to its declared
 * `schema_path` / `data_path` (relative to `samplesRoot`). Shared read helper
 * extracted from `installContext` so the installer and the read-only
 * `checkStatus` drift detector resolve the catalog identically (no divergence).
 *
 * lazy fileURLToPath idiom: import.meta.dirname is undefined under
 * tsx's CJS-interop dist-load; import.meta.url is not. Reads the conception once
 * for the canonical_id→paths map so callers resolve sources by the same
 * block_kind declarations the accept-all onboarding mode ships.
 */
function resolveCatalog(): { samplesRoot: string; byId: Map<string, { schema_path: string; data_path: string }> } {
	const samplesRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "samples");
	const conception = JSON.parse(fs.readFileSync(path.join(samplesRoot, "conception.json"), "utf-8")) as {
		block_kinds?: Array<{ canonical_id: string; schema_path: string; data_path: string }>;
	};
	const byId = new Map<string, { schema_path: string; data_path: string }>();
	for (const bk of conception.block_kinds ?? []) {
		byId.set(bk.canonical_id, { schema_path: bk.schema_path, data_path: bk.data_path });
	}
	return { samplesRoot, byId };
}

/**
 * Read a JSON file's own declared `version` field (the schema/block envelope
 * `version`). Returns undefined when the file is absent, unreadable, not valid
 * JSON, or carries no string `version`. Used by resyncSchema to compare the
 * catalog vs installed schema versions without crashing on a corrupt file.
 */
function readDeclaredVersion(file: string): string | undefined {
	try {
		const parsed = JSON.parse(fs.readFileSync(file, "utf-8")) as { version?: unknown };
		return typeof parsed.version === "string" ? parsed.version : undefined;
	} catch {
		return undefined;
	}
}

/**
 * Read the verbatim bundled catalog `*.schema.json` body for a named
 * block_kind. Resolves the catalog via the shared `resolveCatalog()` (same
 * `samplesRoot` + `canonical_id`→`schema_path` map the installer and the drift
 * detector use), then reads the catalog schema file's raw bytes. The returned
 * `text` is the unparsed source (raw JSON Schema — properties/definitions/$id),
 * NOT the `read-samples-catalog` projection, so an operator can diff it locally
 * against the installed `<substrate>/schemas/<name>.schema.json` without
 * touching node_modules.
 *
 * Read-only and substrate-independent: it touches only the package's bundled
 * `samplesRoot` and takes no cwd, so no installed schema, block, or config is
 * reachable from this path. Throws on an unknown kind, matching the unknown-kind
 * throw idiom in validateBlockItemsAgainstCatalog / resolveConflict.
 */
export function readCatalogSchemaText(kindName: string): { kind: string; schemaPath: string; text: string } {
	const { samplesRoot, byId } = resolveCatalog();
	const kind = byId.get(kindName);
	if (!kind) {
		throw new Error(`no catalog block_kind named '${kindName}'`);
	}
	const schemaPath = path.join(samplesRoot, kind.schema_path);
	const text = fs.readFileSync(schemaPath, "utf-8");
	return { kind: kindName, schemaPath, text };
}

/**
 * Walk the shipped catalog migration chain for `schemaName` from `fromVersion`
 * to `toVersion`, returning the ordered MigrationDecl list (one per hop) when a
 * complete chain exists, or `null` when no chain reaches `toVersion`.
 *
 * Chain semantics mirror the registry's one-outgoing-edge-per-(schemaName,
 * fromVersion) discipline: at each step we look for the single decl whose
 * (schemaName, fromVersion) matches the current cursor and advance the cursor to
 * its `toVersion`. A cycle guard bounds the walk to the number of available
 * decls so a malformed catalog cannot loop forever. The catalog migrations file
 * is read from `samplesRoot/migrations.json` (the SAME catalog the schema source
 * is copied from), so the migration declarations and the schema versions cannot
 * drift apart.
 */
function findCatalogMigrationChain(
	samplesRoot: string,
	schemaName: string,
	fromVersion: string,
	toVersion: string,
): MigrationDecl[] | null {
	const catalogMigrationsPath = path.join(samplesRoot, "migrations.json");
	let catalogDecls: MigrationDecl[];
	try {
		const parsed = JSON.parse(fs.readFileSync(catalogMigrationsPath, "utf-8")) as { migrations?: MigrationDecl[] };
		catalogDecls = Array.isArray(parsed.migrations) ? parsed.migrations : [];
	} catch {
		return null;
	}
	const chain: MigrationDecl[] = [];
	let cursor = fromVersion;
	const maxHops = catalogDecls.length;
	for (let i = 0; i <= maxHops; i++) {
		if (cursor === toVersion) return chain;
		const next = catalogDecls.find((d) => d.schemaName === schemaName && d.fromVersion === cursor);
		if (!next) return null;
		chain.push(next);
		cursor = next.toVersion;
	}
	// Exhausted maxHops without reaching toVersion → cyclic / non-terminating.
	return null;
}

/**
 * Read-only computation of the migration declarations a version-bump re-sync of
 * `name` WOULD register into the substrate's migrations.json, WITHOUT writing
 * anything — closing the earlier gap where `/context install --update`
 * silently appended catalog migration declarations with no report of what was
 * added. Mirrors the filter
 * `resyncSchema`'s registration loop applies: read the installed vs catalog
 * `version`, walk the shipped catalog chain, and subtract the decls whose
 * `(schemaName, fromVersion)` pair is already present on disk. Returns the
 * absent decls as the `{ schema, from, to }` report shape (empty array when the
 * versions match, either version is unreadable, no chain reaches the catalog
 * version, or every chain decl is already registered). Reads only — never
 * appends, never overwrites the schema. Used by `updateContext`'s dryRun
 * catalog-ahead arm to report the would-register set; the live path lets
 * `resyncSchema` itself report the decls it actually appended.
 */
function computeWouldRegisterMigrations(
	destRoot: string,
	samplesRoot: string,
	sourceFile: string,
	destFile: string,
	name: string,
): Array<{ schema: string; from: string; to: string }> {
	const catalogVersion = readDeclaredVersion(sourceFile);
	const installedVersion = readDeclaredVersion(destFile);
	if (installedVersion === undefined || catalogVersion === undefined || installedVersion === catalogVersion) {
		return [];
	}
	const chain = findCatalogMigrationChain(samplesRoot, name, installedVersion, catalogVersion);
	if (chain === null) return [];
	const existing = loadMigrationsFileForDir(destRoot);
	const present = new Set((existing?.migrations ?? []).map((m) => `${m.schemaName} ${m.fromVersion}`));
	const out: Array<{ schema: string; from: string; to: string }> = [];
	for (const decl of chain) {
		const key = `${decl.schemaName} ${decl.fromVersion}`;
		if (present.has(key)) continue;
		out.push({ schema: decl.schemaName, from: decl.fromVersion, to: decl.toVersion });
		present.add(key);
	}
	return out;
}

/**
 * Pure-read simulation of `resyncSchema`'s outcome for ONE catalog-ahead schema —
 * closing the earlier gap where `--dryRun` optimistically reported every
 * catalog-ahead schema as "resynced" even when a live run would actually
 * migrate or block it. Predicts which of `resyncSchema`'s
 * three terminal statuses (`resynced` / `migrated` / `blocked`) a live re-sync
 * WOULD produce, by mirroring `resyncSchema`'s five decision arms 1:1 over an
 * IN-MEMORY forward-migration + re-validation — WITHOUT writing any file and
 * WITHOUT touching the project's cached migration registry. The aim is a dryRun
 * plan whose per-schema bucket matches what `--update` (no dryRun) would land,
 * so the preview no longer lists every catalog-ahead schema as `resynced`
 * regardless of the true outcome.
 *
 * Arm mapping to `resyncSchema` (lines noted are that helper's, not this one's):
 *   1. Same/either-undefined version → `resynced`, `wouldRegister: []`
 *      (mirrors the same-version verbatim-overwrite arm).
 *   2. No catalog chain reaching the catalog version → `blocked`,
 *      `wouldRegister: []` (mirrors the no-chain refuse arm).
 *   3. `wouldRegister` = the chain decls not already present in migrations.json
 *      (reuses `computeWouldRegisterMigrations`' dedup, shared by call).
 *   4. Block file absent / zero items → `migrated`, `wouldRegister` (mirrors the
 *      no-items register-the-chain + advance arm). An UNREADABLE block file is
 *      treated as POPULATED (the same safety default `resyncSchema` applies),
 *      routing it through the validate path which throws → `blocked`.
 *   5. Populated block → build a FRESH in-memory registry (the substrate's
 *      existing decls + the catalog chain's absent edges via `migrationFnFor`,
 *      deduped on (schemaName, fromVersion) since `register` throws on
 *      duplicates), then mirror `validateBlockWithMigrationForDir`'s keying in
 *      memory: when the block carries a string `schema_version` differing from
 *      the catalog version, `runMigrations(registry, name, blockVersion,
 *      catalogVersion, blockData)`; absent ⇒ validate as-is. Then
 *      `validate(catalogSchema, migrated, name)`. Pass → `migrated`; any throw
 *      (no path, migration throw, validation failure) → `blocked` with
 *      `wouldRegister: []` and a `detail` (the per-item validation diagnostic): `reason:"validation-failed"`,
 *      the version pair, and the per-item failures mapped from
 *      `ValidationError.errors` (a single synthetic failure for a non-AJV throw).
 *
 * `detail` carries the blocked diagnostic the dryRun arm pushes into
 * `UpdateResult.blockedDetail`; the `blocked` arms still report `wouldRegister:
 * []`, mirroring `resyncSchema`'s post-rollback truth that a refused re-sync
 * leaves nothing registered. (Supersedes the prior unconsumed `errors` field.)
 */
function simulateResyncOutcome(
	destRoot: string,
	samplesRoot: string,
	sourceFile: string,
	destFile: string,
	name: string,
): {
	outcome: "resynced" | "migrated" | "blocked";
	wouldRegister: Array<{ schema: string; from: string; to: string }>;
	detail?: { reason: BlockedDetail["reason"]; from?: string; to?: string; failures?: BlockValidationFailure[] };
} {
	const catalogVersion = readDeclaredVersion(sourceFile);
	const installedVersion = readDeclaredVersion(destFile);

	// Arm 1 — same version (or either unreadable / non-versioned): no transition
	// to migrate across. Mirrors the live path 1:1 — a populated block is
	// re-validated in memory against the incoming catalog body, and a failure
	// predicts blocked (validation-failed, per-item failures); otherwise the
	// live path overwrites verbatim → resynced, no decls.
	if (installedVersion === catalogVersion || catalogVersion === undefined || installedVersion === undefined) {
		const sameVersionBlockFile = installedBlockDestPath(destRoot, name);
		if (fs.existsSync(sameVersionBlockFile)) {
			let sameVersionBlockData: unknown;
			let sameVersionHasItems = false;
			try {
				sameVersionBlockData = JSON.parse(fs.readFileSync(sameVersionBlockFile, "utf-8"));
				forEachBlockArray(sameVersionBlockData, (_arrayKey, arr) => {
					if (arr.length > 0) sameVersionHasItems = true;
				});
			} catch {
				sameVersionHasItems = true; // unreadable — same safety default as the live path
			}
			if (sameVersionHasItems) {
				try {
					const catalogSchema = JSON.parse(fs.readFileSync(sourceFile, "utf-8")) as Record<string, unknown>;
					validate(catalogSchema, sameVersionBlockData, name);
				} catch (err) {
					const failures =
						err instanceof ValidationError
							? mapValidationFailures(err.errors, sameVersionBlockData)
							: [{ instancePath: "", keyword: "error", message: String(err) }];
					return {
						outcome: "blocked",
						wouldRegister: [],
						detail: { reason: "validation-failed", from: installedVersion, to: catalogVersion, failures },
					};
				}
			}
		}
		return { outcome: "resynced", wouldRegister: [] };
	}

	// Arm 2 — version bump with NO shipped chain reaching the catalog version: the
	// live path refuses, leaving everything unchanged → blocked, no decls. The
	// blocked detail records the no-chain reason + the version pair.
	const chain = findCatalogMigrationChain(samplesRoot, name, installedVersion, catalogVersion);
	if (chain === null) {
		return {
			outcome: "blocked",
			wouldRegister: [],
			detail: { reason: "no-migration-chain", from: installedVersion, to: catalogVersion },
		};
	}

	// Arm 3 — the decls a live resync WOULD register (chain minus already-present),
	// reusing the same dedup the live path applies.
	const wouldRegister = computeWouldRegisterMigrations(destRoot, samplesRoot, sourceFile, destFile, name);

	// Arm 4 — load the block exactly as the live path does (same dest path; missing
	// file ⇒ no items; unreadable ⇒ treat populated AND route to the validate path).
	const blockFile = installedBlockDestPath(destRoot, name);
	let blockData: unknown;
	let hasItems = false;
	if (fs.existsSync(blockFile)) {
		try {
			blockData = JSON.parse(fs.readFileSync(blockFile, "utf-8"));
			forEachBlockArray(blockData, (_arrayKey, arr) => {
				if (arr.length > 0) hasItems = true;
			});
		} catch {
			// Unreadable block — POPULATED safety default; the validate attempt below
			// will throw on the undefined blockData, predicting the live blocked path.
			hasItems = true;
		}
	}
	if (!hasItems) {
		// No items to migrate — the live path overwrites + registers the chain and
		// reports migrated. Mirror that bucket; the decls would register.
		return { outcome: "migrated", wouldRegister };
	}

	// Arm 5 — populated block: simulate the forward-migrate + re-validate IN MEMORY
	// against a FRESH registry (never the project's cached registry, which a dryRun
	// must not warm) and the catalog schema object read off disk.
	try {
		// Build the registry the live path would resolve against: the substrate's
		// existing decls plus the catalog chain's absent edges, deduped on
		// (schemaName, fromVersion). FRESH, never the project's cached registry.
		const registry = buildFreshRegistryWithChain(destRoot, chain);

		const catalogSchema = JSON.parse(fs.readFileSync(sourceFile, "utf-8")) as Record<string, unknown>;

		// Mirror validateBlockWithMigrationForDir's keying IN MEMORY: fromVersion =
		// the block's declared schema_version (when a string), toVersion = the
		// catalog schema's version. Absent / non-string envelope ⇒ validate as-is.
		const blockVersion =
			blockData && typeof blockData === "object" && "schema_version" in (blockData as Record<string, unknown>)
				? ((blockData as Record<string, unknown>).schema_version as unknown)
				: undefined;
		let toValidate: unknown = blockData;
		if (typeof blockVersion === "string" && blockVersion !== catalogVersion) {
			toValidate = runMigrations(registry, name, blockVersion, catalogVersion, blockData);
		}
		validate(catalogSchema, toValidate, name);
		return { outcome: "migrated", wouldRegister };
	} catch (err) {
		// Migrated items would NOT validate against the catalog schema (or the
		// migration walk threw) → the live path refuses → blocked. Post-rollback
		// truth: nothing registers, so report no decls. The blocked detail records
		// the validation-failed reason + the version pair + (when the throw is an AJV
		// ValidationError) the per-item failures mapped against the loaded block data;
		// a non-AJV throw becomes a single synthetic failure.
		const failures =
			err instanceof ValidationError
				? mapValidationFailures(err.errors, blockData)
				: [{ instancePath: "", keyword: "error", message: String(err) }];
		return {
			outcome: "blocked",
			wouldRegister: [],
			detail: { reason: "validation-failed", from: installedVersion, to: catalogVersion, failures },
		};
	}
}

/**
 * Validate ONE installed block's items against the CATALOG schema version,
 * read-only — surfacing which item/field/constraint actually failed instead of
 * discarding the AJV error. The standalone diagnostic underneath the
 * `validate-block-items` op: it answers "would these items pass the catalog
 * schema (after the shipped forward-migration, when the block lags the catalog
 * version)?" WITHOUT writing anything — no schema overwrite, no block re-write, no
 * migration registration.
 *
 * Resolution mirrors the catalog-ahead resync path so the diagnostic predicts the
 * same pass/fail `resyncSchema` would reach:
 *   - resolve the block_kind via `resolveCatalog().byId` (an unknown block throws
 *     a field-named Error); read the catalog schema body off `samplesRoot`.
 *   - load the installed block via `installedBlockDestPath` (a missing block file
 *     throws field-named).
 *   - when the block's declared envelope `schema_version` is a string differing
 *     from the catalog `version` AND a shipped chain reaches the catalog version,
 *     forward-migrate the block IN MEMORY through a FRESH registry seeded from the
 *     substrate's existing decls + the chain's absent edges (deduped on
 *     (schemaName, fromVersion)); otherwise validate as-is. No registry warming.
 *   - `validate(catalogSchema, data, blockName)` in try/catch → pass:
 *     `{valid:true, failures:[]}`; ValidationError → `{valid:false, failures}`
 *     mapped against the (migrated) data; any other throw → a single synthetic
 *     `{instancePath:"", keyword:"error", message:String(err)}` failure.
 *
 * Returns `{ block, from?, to?, valid, failures }`: `from`/`to` are the block's
 * declared version and the catalog version (each undefined when unreadable).
 * NEVER writes.
 */
export function validateBlockItemsAgainstCatalog(
	cwd: string,
	blockName: string,
): { block: string; from?: string; to?: string; valid: boolean; failures: BlockValidationFailure[] } {
	const destRoot = tryResolveContextDir(cwd);
	if (destRoot === null) {
		throw new Error(
			"No .pi-context.json bootstrap pointer found. Run /context init <substrate-dir> first to bootstrap the substrate.",
		);
	}
	const { samplesRoot, byId } = resolveCatalog();
	const kind = byId.get(blockName);
	if (!kind) {
		throw new Error(`block: '${blockName}' is not a known catalog block_kind (no canonical_id matches)`);
	}
	const sourceFile = path.join(samplesRoot, kind.schema_path);
	const blockFile = installedBlockDestPath(destRoot, blockName);
	if (!fs.existsSync(blockFile)) {
		throw new Error(`block: installed block file not found for '${blockName}' at ${blockFile}`);
	}

	const catalogVersion = readDeclaredVersion(sourceFile);
	let blockData: unknown;
	try {
		blockData = JSON.parse(fs.readFileSync(blockFile, "utf-8"));
	} catch (err) {
		return {
			block: blockName,
			to: catalogVersion,
			valid: false,
			failures: [{ instancePath: "", keyword: "error", message: String(err) }],
		};
	}

	const blockVersion =
		blockData && typeof blockData === "object" && "schema_version" in (blockData as Record<string, unknown>)
			? ((blockData as Record<string, unknown>).schema_version as unknown)
			: undefined;
	const fromVersion = typeof blockVersion === "string" ? blockVersion : undefined;

	try {
		const catalogSchema = JSON.parse(fs.readFileSync(sourceFile, "utf-8")) as Record<string, unknown>;
		let toValidate: unknown = blockData;
		if (typeof blockVersion === "string" && catalogVersion !== undefined && blockVersion !== catalogVersion) {
			const chain = findCatalogMigrationChain(samplesRoot, blockName, blockVersion, catalogVersion);
			if (chain !== null) {
				// FRESH registry seeded from the substrate's existing decls + the chain's
				// absent edges, deduped on (schemaName, fromVersion) — never warm the
				// project's cached registry from a read-only diagnostic.
				const registry = buildFreshRegistryWithChain(destRoot, chain);
				toValidate = runMigrations(registry, blockName, blockVersion, catalogVersion, blockData);
			}
		}
		validate(catalogSchema, toValidate, blockName);
		return { block: blockName, from: fromVersion, to: catalogVersion, valid: true, failures: [] };
	} catch (err) {
		const failures =
			err instanceof ValidationError
				? mapValidationFailures(err.errors, blockData)
				: [{ instancePath: "", keyword: "error", message: String(err) }];
		return { block: blockName, from: fromVersion, to: catalogVersion, valid: false, failures };
	}
}

/**
 * Migration-aware re-sync of ONE installed schema under `/context install
 * --update` (safe re-sync, slice S4, closing the earlier footgun where
 * `--update` blindly overwrote installed schemas AND block data with empty
 * catalog starters). Replaces the blind
 * `fs.copyFileSync` the schema loop used to perform with a forward-migrate-or-
 * refuse decision so a catalog schema version bump never strands the block's
 * already-filed items under a schema they no longer satisfy.
 *
 * Precondition: the dest schema file EXISTS (the caller routes fresh installs
 * straight to copyFileSync). Returns one of:
 *   - `"resynced"`: same installed/catalog `version` (description-only drift, or
 *     non-versioned schemas) → safe verbatim overwrite; OR a version bump whose
 *     block file is absent / holds zero items → no items to migrate, overwrite +
 *     register the chain.
 *   - `"migrated"`: a version bump with a populated block whose items
 *     forward-migrated through the shipped chain AND re-validated against the new
 *     schema → block re-written via the migration path.
 *   - `"blocked"`: a version bump with NO shipped chain reaching the catalog
 *     version, OR migrated items that would FAIL the new schema. The schema file,
 *     the block file, AND migrations.json are all left BYTE-UNCHANGED.
 *
 * Byte-unchanged guarantee for `"blocked"`: this helper captures the original
 * schema bytes BEFORE any overwrite, and the original migrations.json bytes
 * BEFORE the first decl append. For the version-bump path it must validate the
 * migrated items against the NEW schema (which validateBlockWithMigrationFor-
 * Dir reads from disk), so it registers the shipped chain into migrations.json
 * and overwrites the schema first, then on ANY failure (no chain, append
 * failure, validation throw) RESTORES the captured original schema bytes
 * verbatim, RESTORES migrations.json to its captured pre-call bytes (or removes
 * it when it did not exist pre-call, since the append loop may have created it),
 * and invalidates the registry cache it may have warmed. The block file is only
 * ever touched via writeBlockForDir on the SUCCESS path, so a `"blocked"`
 * outcome never writes the block. The net effect for `"blocked"` is the schema
 * file, the block file, and migrations.json all identical to their pre-call
 * bytes (migrations.json absent if it was absent pre-call).
 */
function resyncSchema(
	destRoot: string,
	samplesRoot: string,
	sourceFile: string,
	destFile: string,
	name: string,
): {
	status: "resynced" | "migrated" | "blocked";
	registeredMigrations: Array<{ schema: string; from: string; to: string }>;
	blockedDetail?: { reason: BlockedDetail["reason"]; from?: string; to?: string; failures?: BlockValidationFailure[] };
	pendingEntry?: PendingBlockedEntry;
} {
	const catalogVersion = readDeclaredVersion(sourceFile);
	const installedVersion = readDeclaredVersion(destFile);

	// Build the pending-blocked record for a refused resync — closing the
	// earlier gap where blocked was a dead-end with no persisted state or
	// resolution command.
	// Pin the TARGET catalog schema body into the object store (computeContentHash
	// + putObject — idempotent on the content hash) so resolve-blocked can later
	// re-validate the corrected block against the SAME pinned target this run
	// blocked on, and carry the chain reaching it (empty for a no-chain refusal).
	// resyncSchema RETURNS this entry; updateContext owns the sidecar write so the
	// helper's contract stays narrow (it does not touch pending-blocked.json).
	const buildPendingEntry = (
		reason: PendingBlockedEntry["reason"],
		chain: MigrationDecl[],
		failures?: BlockValidationFailure[],
	): PendingBlockedEntry => {
		const targetBody = JSON.parse(fs.readFileSync(sourceFile, "utf-8")) as Record<string, unknown>;
		const targetHash = computeContentHash(targetBody);
		putObject(destRoot, targetHash, targetBody);
		const entry: PendingBlockedEntry = {
			name,
			reason,
			target_hash: targetHash,
			chain,
			blocked_at: new Date().toISOString(),
		};
		if (installedVersion !== undefined) entry.from = installedVersion;
		if (catalogVersion !== undefined) entry.to = catalogVersion;
		if (failures) entry.failures = failures;
		return entry;
	};

	// (A) Same version (or either version unreadable / non-versioned): there is no
	// version transition to migrate across. A verbatim overwrite is safe only
	// when the existing block items still conform to the INCOMING catalog body —
	// a same-version change that narrows validity (a dropped property under
	// additionalProperties:false, an added required, a narrowed enum) would
	// otherwise silently invalidate the block. Populated blocks are therefore
	// re-validated against the incoming body IN MEMORY before any write, and a
	// failure refuses the resync (blocked, per-item failures, pending-blocked
	// recorded) — mirroring the version-bump path's validate-or-refuse
	// discipline. Nothing has been written when the refusal fires, so the
	// schema file, block file, and migrations.json are all byte-unchanged. No
	// migration is registered on this arm, so it reports an empty decl list.
	if (installedVersion === catalogVersion || catalogVersion === undefined || installedVersion === undefined) {
		const sameVersionBlockFile = installedBlockDestPath(destRoot, name);
		if (fs.existsSync(sameVersionBlockFile)) {
			let sameVersionBlockData: unknown;
			let sameVersionHasItems = false;
			try {
				sameVersionBlockData = JSON.parse(fs.readFileSync(sameVersionBlockFile, "utf-8"));
				forEachBlockArray(sameVersionBlockData, (_arrayKey, arr) => {
					if (arr.length > 0) sameVersionHasItems = true;
				});
			} catch {
				// Unreadable block — safety default: treat as populated and route it
				// through the validate path (which throws → blocked).
				sameVersionHasItems = true;
			}
			if (sameVersionHasItems) {
				try {
					const catalogSchema = JSON.parse(fs.readFileSync(sourceFile, "utf-8")) as Record<string, unknown>;
					validate(catalogSchema, sameVersionBlockData, name);
				} catch (err) {
					// Classify the refusal at the catch site rather than lumping every
					// throw in with item-validation failures: only an AJV ValidationError is an
					// item-validation failure; any other throw (unreadable catalog body,
					// a write-boundary precondition) is `write-failed` — no pending entry,
					// so the marker/pending pipeline (validation-only consequences) never
					// fires for it.
					if (err instanceof ValidationError) {
						const failures = mapValidationFailures(err.errors, sameVersionBlockData);
						return {
							status: "blocked",
							registeredMigrations: [],
							blockedDetail: { reason: "validation-failed", from: installedVersion, to: catalogVersion, failures },
							pendingEntry: buildPendingEntry("validation-failed", [], failures),
						};
					}
					return {
						status: "blocked",
						registeredMigrations: [],
						blockedDetail: {
							reason: "write-failed",
							from: installedVersion,
							to: catalogVersion,
							failures: [{ instancePath: "", keyword: "error", message: String(err) }],
						},
					};
				}
			}
		}
		fs.copyFileSync(sourceFile, destFile);
		return { status: "resynced", registeredMigrations: [] };
	}

	// (B) Version bump — migrate-or-refuse. installedVersion ≠ catalogVersion,
	// both defined. The chain is sought in the catalog's OWN migrations.json so
	// the declarations and the schema versions stay coherent.
	const chain = findCatalogMigrationChain(samplesRoot, name, installedVersion, catalogVersion);
	if (chain === null) {
		// No shipped chain reaches the catalog version → refuse, leave unchanged.
		// Nothing was registered, so the report is empty. The blocked detail records
		// the no-chain reason + the version pair.
		return {
			status: "blocked",
			registeredMigrations: [],
			blockedDetail: { reason: "no-migration-chain", from: installedVersion, to: catalogVersion },
			pendingEntry: buildPendingEntry("no-migration-chain", []),
		};
	}

	// Capture migrations.json raw bytes BEFORE any decl append so the refuse path
	// can restore it byte-for-byte — appendMigrationDeclForDir below mutates it, and
	// a later validation throw must leave migrations.json byte-unchanged too (not
	// just the schema file). Mirrors the originalSchemaBytes capture below.
	const migrationsPath = migrationsPathForDir(destRoot);
	const originalMigrationsBytes = fs.existsSync(migrationsPath) ? fs.readFileSync(migrationsPath) : null;

	// Register each shipped decl into the substrate's migrations.json (idempotent:
	// skip a decl whose (schemaName, fromVersion) is already present — append
	// throws on collision). Registration is required BEFORE the validate+migrate
	// call so the loaded registry carries the forward edge.
	const existing = loadMigrationsFileForDir(destRoot);
	const present = new Set((existing?.migrations ?? []).map((m) => `${m.schemaName}\u0000${m.fromVersion}`));
	// Accumulate the decls THIS call actually appends (the not-already-present
	// subset), reported as the { schema, from, to } shape for the caller to
	// surface — closing the earlier gap where migration declarations were
	// silently appended with no report of what was added. On the blocked rollback path below this list is
	// discarded and [] is returned (post-rollback truth: nothing stuck).
	const registeredMigrations: Array<{ schema: string; from: string; to: string }> = [];
	for (const decl of chain) {
		const key = `${decl.schemaName}\u0000${decl.fromVersion}`;
		if (present.has(key)) continue;
		appendMigrationDeclForDir(destRoot, decl);
		present.add(key);
		registeredMigrations.push({ schema: decl.schemaName, from: decl.fromVersion, to: decl.toVersion });
	}

	// Determine whether the block file carries items to migrate. Absent / zero-
	// item blocks need no migration: register-the-chain + overwrite the schema and
	// report `migrated` (the version model advanced even though no items moved).
	const blockFile = installedBlockDestPath(destRoot, name);
	let blockData: unknown;
	let hasItems = false;
	if (fs.existsSync(blockFile)) {
		try {
			blockData = JSON.parse(fs.readFileSync(blockFile, "utf-8"));
			forEachBlockArray(blockData, (_arrayKey, arr) => {
				if (arr.length > 0) hasItems = true;
			});
		} catch {
			// Unreadable block — treat as POPULATED (safety default) and route it
			// through the validate path, which will throw and trigger rollback.
			hasItems = true;
		}
	}

	// Capture the original schema bytes for an airtight rollback, then overwrite
	// the schema so validateBlockWithMigrationForDir (which reads the schema from
	// disk) validates the migrated items against the NEW schema.
	const originalSchemaBytes = fs.readFileSync(destFile);
	fs.copyFileSync(sourceFile, destFile);

	if (!hasItems) {
		// No items to migrate — schema overwritten, chain registered. Done.
		return { status: "migrated", registeredMigrations };
	}

	try {
		const registry = getProjectMigrationRegistryForDir(destRoot);
		const migrated = validateBlockWithMigrationForDir(destRoot, name, blockData, registry);
		// Persist the forward-migrated block (identity ⇒ byte-equal items). When the
		// block carries a `schema_version` envelope field, advance it to the catalog
		// version so the on-disk block declares the version it now conforms to —
		// runMigrations applies the item transforms but does NOT stamp the envelope
		// version, so we advance it here before the write. writeBlockForDir re-routes
		// through the migration path; with the envelope now at catalogVersion it
		// validates straight (no re-migration) against the just-installed schema.
		if (
			migrated &&
			typeof migrated === "object" &&
			!Array.isArray(migrated) &&
			typeof (migrated as Record<string, unknown>).schema_version === "string"
		) {
			(migrated as Record<string, unknown>).schema_version = catalogVersion;
		}
		// Persist the migrated block via the full whole-block write so the migrated
		// items are identity-stamped (mint-or-preserve oid, recompute content_hash).
		// Identity stamping is mandatory for every write.
		writeBlockForDir(destRoot, name, migrated);
		return { status: "migrated", registeredMigrations };
	} catch (err) {
		// Migrated items would NOT validate against the new schema (or migration
		// threw). Refuse: restore the original schema bytes verbatim so the schema
		// file is byte-unchanged, and invalidate the registry cache warmed above so
		// a subsequent read rebuilds against the on-disk (restored) state. The block
		// file was never written on this path, so it is already byte-unchanged.
		fs.writeFileSync(destFile, originalSchemaBytes);
		// Restore migrations.json to its pre-call bytes: if it existed, write the
		// captured bytes back; if it did NOT exist pre-call, the append loop created
		// it — remove it so the refuse path leaves no trace.
		if (originalMigrationsBytes === null) {
			if (fs.existsSync(migrationsPath)) fs.unlinkSync(migrationsPath);
		} else {
			fs.writeFileSync(migrationsPath, originalMigrationsBytes);
		}
		invalidateMigrationRegistryForDir(destRoot);
		// Rollback reverted migrations.json to its pre-call bytes, so report no
		// registered migrations (post-rollback truth — nothing is stuck on disk). The
		// blocked detail records the validation-failed reason + the version pair + the
		// per-item failures (a single synthetic failure for a non-AJV throw) so the
		// caller surfaces WHY the resync refused.
		// Classify the refusal at the catch site rather than lumping every throw in
		// with item-validation failures: only an AJV ValidationError means the
		// migrated items fail the catalog schema. Any other throw — the mandatory
		// identity stamp refusing a substrate with no substrate_id, an I/O failure —
		// is `write-failed`: the items were never flagged invalid, so no pending
		// entry is built and the marker/pending pipeline (validation-only
		// consequences) never fires.
		if (err instanceof ValidationError) {
			const failures = mapValidationFailures(err.errors, blockData);
			return {
				status: "blocked",
				registeredMigrations: [],
				blockedDetail: { reason: "validation-failed", from: installedVersion, to: catalogVersion, failures },
				pendingEntry: buildPendingEntry("validation-failed", chain, failures),
			};
		}
		return {
			status: "blocked",
			registeredMigrations: [],
			blockedDetail: {
				reason: "write-failed",
				from: installedVersion,
				to: catalogVersion,
				failures: [{ instancePath: "", keyword: "error", message: String(err) }],
			},
		};
	}
}

/**
 * /context install opt-in mechanism — the package ships no default schemas or
 * block files; a fresh substrate gets nothing auto-seeded. Reads config.installed_schemas
 * and config.installed_blocks, copies declared assets from the package
 * samples catalog (samples/, keyed by conception.json's block_kinds) into the
 * project's substrate root + schemas dir.
 *
 *   - Default behavior is skip-if-exists. With overwrite=true, replaces the
 *     destination file and reports as "updated" rather than "installed".
 *   - Sources missing from the samples catalog are reported as "notFound".
 *   - Empty install lists are not an error — the result is a clean no-op.
 */
/**
 * Ceremony-entry identity establishment — closing the earlier gap where, on a
 * substrate with no established `substrate_id`, schema re-sync's migrate path
 * threw and was misreported as "blocked." When the
 * substrate's config.json lacks a `substrate_id`, mint one (the SAME
 * `mintSubstrateId` init uses), persist it through the sanctioned config write
 * path, and register it in the project registry (the SAME `registerSubstrate`
 * call init/accept-all make) — BEFORE the ceremony's first write that stamps
 * identity, so a pre-identity substrate HEALS on the sanctioned ceremony
 * instead of refusing at the stamping guard. Called at the entry of every
 * substrate-lifecycle ceremony that can reach an identity-stamping write
 * (update, install, resolve-blocked), at the same seam as the config-migration
 * seeding. Returns the minted id when establishment happened (the ceremony
 * reports it in its result), undefined when identity was already established
 * (never re-mints — the on-disk id is immutable) or no config is loadable (the
 * ceremony's own config handling reports that). This is explicit
 * ceremony-boundary provisioning, not a lazy mint inside a block write —
 * `substrateIdForDir`'s loud guard stays load-bearing for any write reaching
 * it without identity (defense in depth: identity is never lazily minted as a
 * side-effect of an arbitrary block write).
 */
function establishSubstrateIdentityAtEntry(cwd: string, destRoot: string): string | undefined {
	let config: ConfigBlock | null;
	try {
		config = loadConfig(cwd);
	} catch {
		return undefined; // unloadable config — the ceremony's own path surfaces it
	}
	if (!config) return undefined;
	const existing = config.substrate_id;
	if (typeof existing === "string" && /^sub-[0-9a-f]{16}$/.test(existing)) return undefined;
	const substrate_id = mintSubstrateId();
	config.substrate_id = substrate_id;
	writeConfig(cwd, config);
	registerSubstrate(cwd, substrate_id, path.relative(cwd, destRoot) || ".", []);
	return substrate_id;
}

export function installContext(cwd: string, options: { overwrite?: boolean } = {}): InstallResult {
	const result: InstallResult = {
		installed: [],
		updated: [],
		skipped: [],
		notFound: [],
		preserved: [],
		resynced: [],
		migrated: [],
		blocked: [],
	};
	const overwrite = options.overwrite === true;

	const destRoot = tryResolveContextDir(cwd);
	if (destRoot === null) {
		result.error =
			"No .pi-context.json bootstrap pointer found. Run /context init <substrate-dir> first to bootstrap the substrate.";
		return result;
	}
	// Seed the catalog's `config` migration chain (idempotent) before the config
	// read below, and before resyncSchema's pre-call migrations.json byte capture
	// — so a blocked-resync rollback restores to the seeded state, preserving the
	// seed.
	seedCatalogConfigMigrationDecls(destRoot);
	// Ceremony-entry identity establishment — before any write that
	// stamps identity (the --update resync path's writeBlockForDir).
	const establishedId = establishSubstrateIdentityAtEntry(cwd, destRoot);
	if (establishedId) result.substrateIdEstablished = establishedId;
	const config: ConfigBlock | null = loadConfig(cwd);
	if (!config) {
		result.error = "No config.json found in substrate dir — run /context init <substrate-dir> first.";
		return result;
	}

	// destRoot is resolver-aware via tryResolveContextDir(cwd) — it already
	// cascades through resolveContextDir under the hood (context-dir.ts).
	// SCHEMAS_DIR is composed as a bare segment off that
	// resolver-aware root; this is intentional and consistent with the
	// substrate-dir-name-never-hardcoded convention
	// (no hardcoded substrate-dir literal here — `schemas/` is a substrate
	// internal-layout constant, not the substrate-dir name itself).
	const schemasRoot = path.join(destRoot, SCHEMAS_DIR);
	if (!fs.existsSync(schemasRoot)) fs.mkdirSync(schemasRoot, { recursive: true });

	// Catalog resolution (samplesRoot + canonical_id→paths map) is shared with
	// the read-only checkStatus drift detector via resolveCatalog so installer
	// and detector cannot drift in how they resolve sources.
	const { samplesRoot, byId } = resolveCatalog();

	for (const name of (config as ConfigBlock).installed_schemas ?? []) {
		const relDest = `${SCHEMAS_DIR}/${name}.schema.json`;
		const kind = byId.get(name);
		if (!kind) {
			result.notFound.push(relDest);
			continue;
		}
		const sourceFile = path.join(samplesRoot, kind.schema_path);
		// Single source of the dest derivation, shared with findUnmaterializedAssets
		// (installedSchemaDestPath(destRoot, name) === path.join(schemasRoot, name+".schema.json")).
		const destFile = installedSchemaDestPath(destRoot, name);
		if (!fs.existsSync(sourceFile)) {
			result.notFound.push(relDest);
			continue;
		}
		const destExists = fs.existsSync(destFile);
		if (destExists && !overwrite) {
			result.skipped.push(relDest);
			continue;
		}
		if (!destExists) {
			// Fresh install — no installed copy yet, so there are no items to
			// migrate. Copy the catalog schema verbatim (unchanged behaviour).
			fs.copyFileSync(sourceFile, destFile);
			result.installed.push(relDest);
			continue;
		}
		// destExists && overwrite — migration-aware schema re-sync (safe re-sync, slice S4).
		// resyncSchema decides between same-version overwrite, version-bump
		// forward-migration, and refuse-and-leave-unchanged; it never strands the
		// block's items under a schema they fail.
		// resyncSchema now returns { status, registeredMigrations }; installContext
		// reports only the status bucket (the migration-decl reporting surface is on
		// /context update — where every registered declaration is surfaced in the
		// update output/dry-run — so the appended decls are intentionally
		// ignored here).
		const { status: outcome } = resyncSchema(destRoot, samplesRoot, sourceFile, destFile, name);
		switch (outcome) {
			case "resynced":
				result.resynced.push(relDest);
				break;
			case "migrated":
				result.migrated.push(relDest);
				break;
			case "blocked":
				result.blocked.push(relDest);
				break;
		}
	}

	for (const name of (config as ConfigBlock).installed_blocks ?? []) {
		const relDest = `${name}.json`;
		const kind = byId.get(name);
		if (!kind) {
			result.notFound.push(relDest);
			continue;
		}
		const sourceFile = path.join(samplesRoot, "blocks", kind.data_path);
		const destFile = installedBlockDestPath(destRoot, name);
		if (!fs.existsSync(sourceFile)) {
			result.notFound.push(relDest);
			continue;
		}
		const destExists = fs.existsSync(destFile);
		if (destExists) {
			// Block-data preservation (safe re-sync): never copy a catalog
			// starter over a block that already holds items, even under --update.
			// Catalog block starters are empty ({"tasks": []}); copying one over a
			// populated block would delete the filed items. Read the existing block
			// and treat ANY top-level (or nested) array with length > 0 as populated.
			// Safety default: if the block can't be read/confirmed-empty (throw, or
			// migration-validation failure), treat it as POPULATED — never overwrite
			// something we could not read.
			let populated = true;
			try {
				const existing = readBlockForDir(destRoot, name);
				let hasItems = false;
				forEachBlockArray(existing, (_arrayKey, arr) => {
					if (arr.length > 0) hasItems = true;
				});
				populated = hasItems;
			} catch {
				populated = true;
			}
			if (populated) {
				result.preserved.push(relDest);
				continue;
			}
			if (!overwrite) {
				result.skipped.push(relDest);
				continue;
			}
			// Idempotent skip: the on-disk empty block already equals the
			// catalog starter (JCS-canonical content equality, key-order/whitespace
			// insensitive) — rewriting it would be a no-op churn (mtime bump, identical
			// bytes), so skip it and report `skipped` rather than `updated`. Reaches
			// here only for an itemless block under overwrite; a starter whose content
			// differs (e.g. an extra top-level field) still falls through to the copy.
			if (computeFileContentHash(destFile) === computeFileContentHash(sourceFile)) {
				result.skipped.push(relDest);
				continue;
			}
			fs.copyFileSync(sourceFile, destFile);
			result.updated.push(relDest);
			continue;
		}
		fs.copyFileSync(sourceFile, destFile);
		result.installed.push(relDest);
	}

	// ── Install baseline of the installed SCHEMAS (safe re-sync) ──────
	// Record where the installed schema model came from + a per-schema content
	// fingerprint, so a later slice can detect installed-vs-catalog drift. BLOCKS
	// are user data and are deliberately NOT baselined (only the re-syncable model
	// — schemas — is fingerprinted). The fingerprint is taken from the INSTALLED
	// dest file (via the SAME `installedSchemaDestPath` derivation the copy loop
	// uses), not the catalog source, so the baseline reflects what is actually on
	// disk. `version` is the installed schema file's own declared `version` field.
	const assets: Record<string, { content_hash: string; version: string }> = {};
	for (const name of (config as ConfigBlock).installed_schemas ?? []) {
		const destSchemaFile = installedSchemaDestPath(destRoot, name);
		if (!fs.existsSync(destSchemaFile)) continue;
		// Safety default (mirror of the block-preservation try/catch above): a
		// declared schema file present-but-corrupt (not valid JSON, unreadable, or
		// not hashable) must NOT crash installContext. Skip baselining it — it is
		// simply omitted from `installed_from.assets`; drift tracking resumes once
		// the file is valid. Install proceeds for all other declared schemas.
		try {
			const schemaJson = JSON.parse(fs.readFileSync(destSchemaFile, "utf-8")) as { version?: string };
			const content_hash = computeFileContentHash(destSchemaFile);
			// Base-stamp: persist the as-installed schema body
			// into the content-addressed object store keyed by its install-baseline
			// content_hash, so the merge base is retrievable later (a precondition for
			// the deterministic 3-way schema merge).
			// putObject is idempotent (content-addressed) — re-installing unchanged content
			// re-stamps identical bytes harmlessly. Reuses the already-parsed schemaJson and
			// already-computed content_hash; no re-read or re-hash.
			putObject(destRoot, content_hash, schemaJson as Record<string, unknown>);
			assets[name] = {
				content_hash,
				version: typeof schemaJson.version === "string" ? schemaJson.version : "",
			};
		} catch {}
	}

	// `catalog` is the pi-context package "name@version", resolved from the SAME
	// package root `samplesRoot` is derived from (one dir up from this module).
	const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
	const pkgJson = JSON.parse(fs.readFileSync(path.join(pkgRoot, "package.json"), "utf-8")) as {
		name?: string;
		version?: string;
	};
	const catalog = `${pkgJson.name ?? ""}@${pkgJson.version ?? ""}`;
	// `catalog_version` is the conception's own schema_version (samplesRoot resolved above).
	const conceptionVersion = JSON.parse(fs.readFileSync(path.join(samplesRoot, "conception.json"), "utf-8")) as {
		schema_version?: string;
	};
	const catalog_version = conceptionVersion.schema_version ?? "";

	// Idempotency: when the EXISTING baseline has deep-equal catalog + catalog_version
	// + assets, PRESERVE it verbatim (including its `at`) so a re-run on an unchanged
	// substrate produces a byte-identical config.json. Only refresh `at` when the
	// baseline content differs.
	const existingFrom = (config as ConfigBlock).installed_from;
	const sameBaseline =
		existingFrom !== undefined &&
		existingFrom.catalog === catalog &&
		existingFrom.catalog_version === catalog_version &&
		JSON.stringify(existingFrom.assets) === JSON.stringify(assets);
	const installed_from = sameBaseline
		? (existingFrom as NonNullable<ConfigBlock["installed_from"]>)
		: { catalog, catalog_version, at: new Date().toISOString(), assets };

	writeConfig(cwd, { ...(config as ConfigBlock), installed_from });

	return result;
}

/**
 * One installed-schema's drift classification, produced by the read-only
 * `checkStatus` detector. `state` summarizes the three-way comparison between
 * the S2 install baseline (config.installed_from.assets[name].content_hash),
 * the catalog's current schema file, and the currently-installed schema file:
 *
 *   - `in-sync`         — baseline === catalog-now === installed-now
 *   - `catalog-ahead`   — catalog-now ≠ baseline, installed-now === baseline
 *                         (the package shipped a newer schema; local copy
 *                          still matches the baseline it was installed from)
 *   - `locally-modified`— installed-now ≠ baseline, catalog-now === baseline
 *                         (someone edited the installed schema on disk)
 *   - `both-diverged`   — both catalog-now and installed-now ≠ baseline
 *   - `no-baseline`     — no baseline recorded for this schema (pre-S2 install,
 *                          or never installed) — drift is undecidable
 *   - `missing-catalog` — the catalog source file is absent / unhashable
 *   - `missing-installed` — the installed dest file is absent / unhashable
 *
 * `baseline_version` is the version captured in the baseline asset;
 * `catalog_version` is the catalog schema file's own declared `version`;
 * `installed_modified` is true when the installed file differs from the
 * baseline content (covers locally-modified + both-diverged).
 */
export interface CheckStatusAsset {
	name: string;
	state:
		| "in-sync"
		| "catalog-ahead"
		| "locally-modified"
		| "both-diverged"
		| "no-baseline"
		| "missing-catalog"
		| "missing-installed";
	baseline_version?: string;
	catalog_version?: string;
	installed_modified?: boolean;
	/**
	 * True for an asset whose CATALOG copy has moved past the install baseline
	 * (states `catalog-ahead` / `both-diverged`) — i.e. the installed schema is
	 * behind the catalog. Absent (undefined) on not-behind assets. Closes the
	 * earlier gap where check-status computed per-asset version info but never
	 * surfaced which installed schemas are behind the catalog.
	 */
	behind?: boolean;
	/**
	 * The version gap for a `behind` asset. `from`/`to` are the
	 * baseline and catalog versions (either may be undefined when a schema body
	 * omits `version`). `basis` distinguishes a declared version bump
	 * (`from !== to`, both present) from a content-only drift (same or
	 * undefined versions, yet the content hash moved — `catalog-ahead` is a hash
	 * comparison, so a behind asset can have an unchanged version string).
	 * Absent (undefined) on not-behind assets.
	 */
	version_delta?: { from?: string; to?: string; basis: "version-bump" | "content-only" };
}

/**
 * Result of the read-only `checkStatus` drift detector: a per-schema
 * classification plus a state-keyed summary count (with a `total`). Writes
 * nothing.
 */
export interface CheckStatusReport {
	perAsset: CheckStatusAsset[];
	summary: Record<CheckStatusAsset["state"], number> & { total: number };
}

/**
 * PURE-READ drift detector for `/context check-status` (safe
 * re-sync, slice S3). Compares, per installed schema, the S2 install baseline
 * against the catalog's current schema file and the currently-installed schema
 * file, classifies the drift, and RETURNS the report. Writes NOTHING anywhere —
 * no config write, no file copy, no mkdir; only reads. One designed exception:
 * like every ceremony entry point it seeds the catalog's `config` migration
 * chain into `migrations.json` (idempotent) before its first config read — the
 * heal semantic, consistent with idempotent re-init healing — so a
 * version-lagging legacy substrate is diagnosable instead of throwing.
 *
 * For each `config.installed_schemas` entry:
 *   - baseline      = config.installed_from?.assets?.[name]?.content_hash
 *   - catalog-now   = computeFileContentHash(samplesRoot/<kind.schema_path>)
 *                     (state `missing-catalog` when the source file is absent
 *                      or unhashable)
 *   - installed-now = computeFileContentHash(installedSchemaDestPath(destRoot,name))
 *                     (state `missing-installed` when the dest file is absent
 *                      or unhashable)
 *
 * Each file-hash read is wrapped in try/catch so a corrupt file degrades to a
 * `missing-*` / diverged classification rather than throwing — mirroring S2's
 * safety default. A schema whose name has no catalog block_kind is reported
 * `missing-catalog`.
 */
export function checkStatus(cwd: string): CheckStatusReport {
	const emptySummary = (): CheckStatusReport["summary"] => ({
		"in-sync": 0,
		"catalog-ahead": 0,
		"locally-modified": 0,
		"both-diverged": 0,
		"no-baseline": 0,
		"missing-catalog": 0,
		"missing-installed": 0,
		total: 0,
	});

	const perAsset: CheckStatusAsset[] = [];

	const destRoot = tryResolveContextDir(cwd);
	if (destRoot === null) {
		return { perAsset, summary: emptySummary() };
	}
	// Ceremony seed (idempotent) before the config read below — the one
	// sanctioned write in this otherwise pure-read detector (see docstring).
	seedCatalogConfigMigrationDecls(destRoot);
	const config = loadConfig(cwd);
	if (!config) {
		return { perAsset, summary: emptySummary() };
	}

	const { samplesRoot, byId } = resolveCatalog();

	for (const name of config.installed_schemas ?? []) {
		const baselineAsset = config.installed_from?.assets?.[name];
		const baseline = baselineAsset?.content_hash;

		const kind = byId.get(name);
		// Catalog-now hash (undefined when the source is absent/unhashable).
		let catalogHash: string | undefined;
		let catalogVersion: string | undefined;
		if (kind) {
			const sourceFile = path.join(samplesRoot, kind.schema_path);
			try {
				catalogHash = computeFileContentHash(sourceFile);
				const parsed = JSON.parse(fs.readFileSync(sourceFile, "utf-8")) as { version?: string };
				catalogVersion = typeof parsed.version === "string" ? parsed.version : undefined;
			} catch {
				catalogHash = undefined;
			}
		}

		// Installed-now hash (undefined when the dest is absent/unhashable).
		let installedHash: string | undefined;
		try {
			installedHash = computeFileContentHash(installedSchemaDestPath(destRoot, name));
		} catch {
			installedHash = undefined;
		}

		const installed_modified = baseline !== undefined && installedHash !== undefined && installedHash !== baseline;

		let state: CheckStatusAsset["state"];
		if (installedHash === undefined) {
			state = "missing-installed";
		} else if (catalogHash === undefined) {
			state = "missing-catalog";
		} else if (baseline === undefined) {
			state = "no-baseline";
		} else {
			const catalogDrift = catalogHash !== baseline;
			const installedDrift = installedHash !== baseline;
			if (!catalogDrift && !installedDrift) {
				state = "in-sync";
			} else if (catalogDrift && !installedDrift) {
				state = "catalog-ahead";
			} else if (!catalogDrift && installedDrift) {
				state = "locally-modified";
			} else {
				state = "both-diverged";
			}
		}

		// Surface, per asset, whether the catalog has moved
		// past the install baseline and by what version gap. Computed AFTER the
		// classification arm above (the arm is unchanged). `behind` is true exactly
		// for the catalog-moved states; the version delta carries the baseline →
		// catalog version pair and a `basis` that records whether the catalog drift
		// was a declared version bump or a content-only change (catalog-ahead is a
		// hash comparison, so the version string can be unchanged while the body moved).
		const behind = state === "catalog-ahead" || state === "both-diverged";
		const baselineVersion = baselineAsset?.version;
		const versionDelta: CheckStatusAsset["version_delta"] | undefined = behind
			? {
					from: baselineVersion,
					to: catalogVersion,
					basis:
						baselineVersion !== undefined && catalogVersion !== undefined && baselineVersion !== catalogVersion
							? "version-bump"
							: "content-only",
				}
			: undefined;

		perAsset.push({
			name,
			state,
			baseline_version: baselineVersion,
			catalog_version: catalogVersion,
			installed_modified,
			...(behind ? { behind: true, version_delta: versionDelta } : {}),
		});
	}

	const summary = emptySummary();
	for (const a of perAsset) {
		summary[a.state] += 1;
		summary.total += 1;
	}

	return { perAsset, summary };
}

/**
 * Render a `CheckStatusReport` (from the read-only `checkStatus` detector) as a
 * scannable per-state grouping for `/context check-status`. Groups the
 * affected schema names under each non-empty state, then a total line. Mirrors
 * the install-handler `lines.push` style.
 */
export function renderCheckStatus(report: CheckStatusReport): string {
	const lines: string[] = [];
	lines.push("Schema drift — installed vs catalog (read-only; no writes):");
	const order: CheckStatusAsset["state"][] = [
		"in-sync",
		"catalog-ahead",
		"locally-modified",
		"both-diverged",
		"no-baseline",
		"missing-catalog",
		"missing-installed",
	];
	for (const state of order) {
		const assets = report.perAsset.filter((a) => a.state === state);
		if (assets.length === 0) continue;
		// For a behind asset (catalog-ahead / both-diverged) annotate the name with
		// the version gap: `name (1.0.0 -> 1.0.1)` for a declared bump, or
		// `name (1.0.1, content changed)` / `name (content changed)` (versions
		// undefined) for a content-only drift — so the version pair is scannable
		// inline.
		const labels = assets.map((a) => {
			if (!a.behind || !a.version_delta) return a.name;
			const { from, to, basis } = a.version_delta;
			if (basis === "version-bump") return `${a.name} (${from} -> ${to})`;
			const v = to ?? from;
			return v !== undefined ? `${a.name} (${v}, content changed)` : `${a.name} (content changed)`;
		});
		lines.push(`  ${state} (${assets.length}): ${labels.join(", ")}`);
	}
	if (report.perAsset.length === 0) {
		lines.push("  (no installed schemas declared — nothing to compare)");
	}
	lines.push(`Total: ${report.summary.total} schema(s).`);
	return lines.join("\n");
}

/**
 * The per-schema action plan produced by `updateContext` — the `pi-context
 * update` command shell's first slice, delivering "never silently clobber"
 * via refuse-and-report for locally-modified schemas. `updateContext` classifies every installed schema via the read-only
 * `checkStatus` detector, then routes by drift state:
 *
 *   - `resynced` / `migrated`: a `catalog-ahead` schema (the package shipped a
 *     newer schema; the local copy still matches the baseline it was installed
 *     from) was brought current through the SAME `resyncSchema` path `/context
 *     install --update` uses. `resyncSchema` reports `resynced` (same-version /
 *     versionless drift, or a version bump with no items to migrate) vs
 *     `migrated` (a version bump whose populated block forward-migrated +
 *     re-validated); `updateContext` records the schema name under the
 *     corresponding array. A `catalog-ahead` schema whose `resyncSchema` returns
 *     `blocked` (no shipped chain, or migrated items fail the new schema) is
 *     recorded under `blocked` — schema, block, and migrations.json all left
 *     byte-unchanged (per `resyncSchema`'s blocked guarantee).
 *   - `refused`: a `locally-modified` or `both-diverged` schema — the installed
 *     file was edited on disk. This first increment REFUSES to
 *     overwrite a locally-modified schema: no `resyncSchema` call, no copy, no
 *     write of any kind for these. The schema name is recorded here so the
 *     operator can reconcile; an automatic three-way merge is the deferred
 *     follow-on (the deterministic 3-way schema merge), out of scope for this
 *     first increment.
 *   - `reported`: a schema whose drift is undecidable or whose files are absent
 *     (`no-baseline` / `missing-catalog` / `missing-installed`). Recorded with
 *     its `state` (no write attempted) so the operator sees why it was not acted
 *     on.
 *   - `inSync`: an `in-sync` schema — already current, recorded as a no-action.
 *
 * `dryRun: true` performs NO writes (no `resyncSchema` call) — the action plan is
 * computed from `checkStatus` alone, so the `resynced`/`migrated`/`blocked`
 * arrays carry the schemas that WOULD be acted on (every `catalog-ahead` schema
 * is reported under `resynced` in the preview, since the resync outcome is not
 * computed without running it), and `refused`/`reported`/`inSync` are identical
 * to the live run. Nothing on disk changes under `dryRun`.
 */
export interface UpdateResult {
	/** Substrate-resolution / config-load failure (no schemas processed). */
	error?: string;
	/** When true, no writes were performed — the plan is a preview only. */
	dryRun: boolean;
	/** `catalog-ahead` schemas re-synced verbatim (same-version / no-item-migration). */
	resynced: string[];
	/** `catalog-ahead` schemas whose populated block forward-migrated + re-validated. */
	migrated: string[];
	/** `catalog-ahead` schemas whose resync was refused by `resyncSchema` (no safe migration). */
	blocked: string[];
	/**
	 * Per-schema blocked-resync diagnostic detail — surfacing which
	 * item/field/constraint actually failed instead of a bare "blocked" — one entry
	 * per name in `blocked`. Each carries the refusal `reason` (`no-migration-chain`
	 * — no shipped chain reaches the catalog version — vs `validation-failed` — the
	 * forward-migrated items fail the catalog schema), the installed→catalog version
	 * pair, and (for `validation-failed`) the per-item `failures` naming the failing
	 * item id, field (the `instancePath`), constraint `keyword`, and AJV `message`.
	 * Under `dryRun` this is the predicted detail; the live run reports the detail
	 * `resyncSchema` produced on refusal. The `blocked: string[]` list is unchanged.
	 */
	blockedDetail: BlockedDetail[];
	/** `locally-modified` / `both-diverged` schemas — refused, never overwritten. */
	refused: string[];
	/**
	 * `locally-modified` / `both-diverged` schemas whose recorded base, local
	 * body, and catalog body merged conflict-free (the deterministic 3-way
	 * schema merge). The
	 * merged body was written (live run) or validated only (`dryRun`).
	 */
	merged: string[];
	/**
	 * `locally-modified` / `both-diverged` schemas whose 3-way merge surfaced
	 * irreconcilable per-path disagreements (the merge declined to write); each
	 * entry carries the schema `name` + its `conflicts` for reconciliation.
	 */
	conflicts: Array<{ name: string; conflicts: SchemaConflict[] }>;
	/** `no-baseline` / `missing-catalog` / `missing-installed` schemas — reported, not acted on. */
	reported: Array<{ name: string; state: CheckStatusAsset["state"] }>;
	/** `in-sync` schemas — already current, no action. */
	inSync: string[];
	/**
	 * Catalog-new config-registry entries this run additively propagated into the
	 * substrate config (the additive config-registry propagation slice of
	 * `pi-context update`). Per registry, the identity-keyed
	 * ids brought current (`relation_types` / `block_kinds` by `canonical_id`,
	 * `invariants` / `lenses` by `id`). User-authored entries absent from the
	 * catalog, and existing entries whose body diverges from the catalog, are
	 * preserved untouched and never listed here (additive-only). Under `dryRun`
	 * the arrays report what WOULD be added; nothing is written.
	 */
	registryAdditions: RegistryAdditions;
	/**
	 * Migration declarations this run registered into the substrate's
	 * migrations.json. A version-bump `catalog-ahead` re-sync registers
	 * the shipped catalog chain's not-already-present decls before migrating; each
	 * appears here as `{ schema, from, to }`. Mirrors `registryAdditions`: under
	 * `dryRun` this lists what WOULD be registered (computed read-only from the
	 * catalog chain minus the decls already on disk); nothing is written. A
	 * same-version resync or a `blocked` (rolled-back) outcome contributes nothing.
	 */
	migrationsRegistered: Array<{ schema: string; from: string; to: string }>;
	/**
	 * Partial-application legibility — a blocked update result must surface what
	 * applied alongside what was refused. Present EXACTLY when this run
	 * both refused something (`blocked` / `refused` / `conflicts` non-empty) AND
	 * applied something (`resynced` / `migrated` / `merged` /
	 * `migrationsRegistered` / any `registryAdditions` array non-empty) — the
	 * per-component decision model (a blocked schema rolls back only itself; the
	 * additive registry propagation writes regardless) means those can co-occur
	 * in one run, and without this field a caller reading `blocked` can conclude
	 * nothing was applied while config.json in fact changed. `applied` /
	 * `notApplied` mirror the underlying channels (`notApplied.conflicts` carries
	 * the conflicted schema NAMES; per-path detail stays on `conflicts`);
	 * `summary` is the one-line operator-legible statement naming what was
	 * applied alongside what was refused and why. Computed for live AND `dryRun`
	 * runs — under `dryRun` it is the predicted partiality of the previewed plan
	 * (nothing written), which the summary states explicitly. A fully-clean or
	 * fully-refused run carries no field.
	 */
	partialApplication?: {
		applied: {
			resynced: string[];
			migrated: string[];
			merged: string[];
			registryAdditions: RegistryAdditions;
			migrationsRegistered: Array<{ schema: string; from: string; to: string }>;
		};
		notApplied: {
			blocked: string[];
			refused: string[];
			conflicts: string[];
		};
		summary: string;
	};
	/**
	 * Ceremony-entry identity establishment: the `substrate_id` this
	 * LIVE run minted + persisted + registered because the config lacked one, so
	 * the run's stamping writes proceed instead of refusing. Absent when
	 * identity was already established (never re-minted) and always absent under
	 * `dryRun` (a preview performs no stamping write, so nothing is established).
	 */
	substrateIdEstablished?: string;
}

/**
 * `/context update` engine — the command shell's first slice, delivering
 * "never silently clobber" via refuse-and-report for locally-modified schemas.
 * Brings the
 * installed substrate MODEL (schemas) current with the packaged catalog by
 * consulting the read-only `checkStatus` drift detector per installed schema and
 * routing each by its drift `state`:
 *
 *   - `in-sync`            → no-op (recorded under `inSync`).
 *   - `catalog-ahead`      → re-sync via the EXISTING `resyncSchema` (the SAME
 *                            call shape `/context install --update`'s schema loop
 *                            uses for that asset: `resyncSchema(destRoot,
 *                            samplesRoot, sourceFile, destFile, name)` with
 *                            `sourceFile = samplesRoot/<kind.schema_path>` and
 *                            `destFile = installedSchemaDestPath(destRoot,
 *                            name)`). Its `resynced`/`migrated`/`blocked` outcome
 *                            routes into the matching array.
 *   - `locally-modified` /
 *     `both-diverged`      → REFUSE-AND-REPORT: do NOT call `resyncSchema`, do NOT
 *                            overwrite; record under `refused`. The first increment
 *                            never clobbers a locally-edited schema; the
 *                            three-way merge was originally deferred.
 *                            [The deterministic 3-way schema merge, now implemented]: the merge is no
 *                            longer deferred. BASE is reconstructed from the baseline's
 *                            content-addressed body (`getObject(destRoot,
 *                            installed_from.assets[name].content_hash)`) and key/path-
 *                            merged with OURS (installed file) + THEIRS (catalog file)
 *                            via `mergeSchema`. Conflict-free → write via
 *                            `writeSchemaCheckedForDir` (meta-validated; `dryRun`
 *                            validates without writing), record under `merged`; any
 *                            conflict → record `{name, conflicts}` under `conflicts`,
 *                            write NOTHING; no retrievable base body / parse / merge /
 *                            validation throw → fall back to `refused`. An auto-merged
 *                            body is base-refreshed post-loop like a resync.
 *   - `no-baseline` /
 *     `missing-catalog` /
 *     `missing-installed`  → record under `reported` (with the state) — undecidable
 *                            or absent, not acted on.
 *
 * When `dryRun` is true NO writes occur: `checkStatus` is consulted and the action
 * plan is computed, but `resyncSchema` is NOT invoked. For each `catalog-ahead`
 * schema the dryRun arm calls `simulateResyncOutcome`, which mirrors
 * `resyncSchema`'s decision arms 1:1 over an IN-MEMORY forward-migration +
 * re-validation and predicts the precise outcome bucket —
 * `resynced` / `migrated` / `blocked` — the live path would land, so the schema is
 * pushed onto `result[outcome]` rather than unconditionally onto `resynced`. The
 * would-register migration decls it returns (the same read-only set:
 * catalog chain minus the decls already on disk; empty on a blocked prediction)
 * are surfaced onto `migrationsRegistered` without writing. The live path mutates
 * only via `resyncSchema` (the catalog-ahead branch) and surfaces the decls it
 * appended onto `migrationsRegistered`; `installContext` and its install handler
 * are NOT touched.
 * Resolves the catalog / dest paths through the SAME `resolveCatalog` +
 * `installedSchemaDestPath` helpers the installer + detector use.
 */
export function updateContext(cwd: string, { dryRun = false }: { dryRun?: boolean } = {}): UpdateResult {
	const result: UpdateResult = {
		dryRun,
		resynced: [],
		migrated: [],
		blocked: [],
		blockedDetail: [],
		refused: [],
		merged: [],
		conflicts: [],
		reported: [],
		inSync: [],
		registryAdditions: { relation_types: [], invariants: [], block_kinds: [], lenses: [] },
		migrationsRegistered: [],
	};

	const destRoot = tryResolveContextDir(cwd);
	if (destRoot === null) {
		result.error =
			"No .pi-context.json bootstrap pointer found. Run /context init <substrate-dir> first to bootstrap the substrate.";
		return result;
	}
	// Seed the catalog's `config` migration chain (idempotent) before the config
	// read below — every ceremony entry point seeds before its first config read,
	// so a version-lagging legacy substrate heals on update instead of throwing.
	seedCatalogConfigMigrationDecls(destRoot);
	// Ceremony-entry identity establishment — before any write that
	// stamps identity (the version-bump resync's writeBlockForDir), so a
	// pre-identity substrate heals here instead of refusing at the stamping
	// guard. LIVE runs only: a dryRun performs no stamping write, so there is
	// nothing to establish ahead of — the preview keeps its writes-nothing
	// contract (beyond the idempotent ceremony seed), and its predicted
	// per-schema plan already matches the healed live outcome (the in-memory
	// simulation never consults the stamping precondition).
	if (!dryRun) {
		const establishedId = establishSubstrateIdentityAtEntry(cwd, destRoot);
		if (establishedId) result.substrateIdEstablished = establishedId;
	}
	const config = loadConfig(cwd);
	if (!config) {
		result.error = "No config.json found in substrate dir — run /context init <substrate-dir> first.";
		return result;
	}

	// Drift classification is the read-only checkStatus detector (shares
	// resolveCatalog + installedSchemaDestPath with the installer, so update and
	// install cannot diverge on how they resolve sources / dests). The routing
	// below acts ONLY on the classified state; it never re-derives drift.
	const report = checkStatus(cwd);
	// Catalog resolution for the catalog-ahead resync branch — the SAME helper the
	// installer + detector use, so the sourceFile derivation matches checkStatus's.
	const { samplesRoot, byId } = resolveCatalog();

	// The live run's pending-blocked records — closing the earlier gap where
	// blocked was a dead-end with no persisted state or resolution command. Each blocked
	// catalog-ahead resync returns a pinned `pendingEntry`; after the schema loop
	// the LIVE path reconciles pending-blocked.json to exactly this set (an empty
	// set removes the sidecar — no stale empty file). The dryRun path collects
	// nothing and the post-loop reconcile is !dryRun-guarded, so a preview never
	// touches the sidecar (nor the object store, since resyncSchema is never called
	// under dryRun).
	const pendingBlockedEntries: PendingBlockedEntry[] = [];

	for (const asset of report.perAsset) {
		const { name, state } = asset;
		switch (state) {
			case "in-sync":
				result.inSync.push(name);
				break;
			case "catalog-ahead": {
				if (dryRun) {
					// Preview only — never call resyncSchema (it writes).
					// Predict the PRECISE per-schema outcome by running
					// resyncSchema’s decision arms 1:1 over an in-memory forward-migration +
					// re-validation (simulateResyncOutcome), so the plan buckets the schema as
					// the resynced / migrated / blocked it WOULD land — not as resynced
					// unconditionally, closing the earlier gap where --dryRun optimistically
					// reported every catalog-ahead schema as "resynced." The would-register
					// decls it returns are the same read-only
					// set (empty on a blocked prediction — post-rollback truth that a refused
					// resync registers nothing). Wrapped in the merge-arm per-asset error
					// tolerance: on a thrown helper failure, fall back to the prior behavior
					// (resynced + no decls) so the plan never crashes.
					try {
						const kind = byId.get(name);
						if (kind) {
							const sourceFile = path.join(samplesRoot, kind.schema_path);
							const destFile = installedSchemaDestPath(destRoot, name);
							const { outcome, wouldRegister, detail } = simulateResyncOutcome(
								destRoot,
								samplesRoot,
								sourceFile,
								destFile,
								name,
							);
							result[outcome].push(name);
							for (const m of wouldRegister) result.migrationsRegistered.push(m);
							// A predicted-blocked schema carries its diagnostic detail
							// (reason + version pair + per-item failures) into blockedDetail so the
							// dryRun plan surfaces WHY it would refuse, matching the live run.
							if (outcome === "blocked" && detail) {
								result.blockedDetail.push({ name, ...detail });
							}
						} else {
							result.resynced.push(name);
						}
					} catch {
						result.resynced.push(name);
					}
					break;
				}
				const kind = byId.get(name);
				if (!kind) {
					// A catalog-ahead classification implies a catalog block_kind existed
					// when checkStatus ran; defend against a races/edge by reporting rather
					// than throwing (mirrors checkStatus's missing-catalog default).
					result.reported.push({ name, state: "missing-catalog" });
					break;
				}
				const sourceFile = path.join(samplesRoot, kind.schema_path);
				const destFile = installedSchemaDestPath(destRoot, name);
				const {
					status: outcome,
					registeredMigrations,
					blockedDetail,
					pendingEntry,
				} = resyncSchema(destRoot, samplesRoot, sourceFile, destFile, name);
				// Surface the decls the live resync actually appended.
				for (const m of registeredMigrations) result.migrationsRegistered.push(m);
				switch (outcome) {
					case "resynced":
						result.resynced.push(name);
						break;
					case "migrated":
						result.migrated.push(name);
						break;
					case "blocked":
						result.blocked.push(name);
						// Carry the live refusal diagnostic (reason + version pair +
						// per-item failures) into blockedDetail alongside the bare name.
						if (blockedDetail) result.blockedDetail.push({ name, ...blockedDetail });
						// Collect the pinned pending-blocked record so the
						// post-loop reconcile persists it (resolve-blocked consumes it later).
						if (pendingEntry) pendingBlockedEntries.push(pendingEntry);
						break;
				}
				break;
			}
			case "locally-modified":
			case "both-diverged": {
				// 3-way merge: a locally-edited schema is no
				// longer blindly refused. Reconstruct BASE from the recorded install
				// baseline's content-addressed body, take OURS = the installed file and
				// THEIRS = the catalog file, and key/path-merge. Conflict-free → write
				// (or, under dryRun, validate-only); any conflict → record + do NOT write.
				const kind = byId.get(name);
				if (!kind) {
					// Mirrors the catalog-ahead arm's missing-catalog guard: a drift
					// classification implies a catalog block_kind existed at check time;
					// defend a race by reporting rather than throwing.
					result.reported.push({ name, state: "missing-catalog" });
					break;
				}
				const sourceFile = path.join(samplesRoot, kind.schema_path);
				const destFile = installedSchemaDestPath(destRoot, name);
				const baseHash = config.installed_from?.assets?.[name]?.content_hash;
				const base = baseHash ? getObject(destRoot, baseHash) : null;
				if (!base) {
					// No retrievable stamped base body ⇒ no safe 3-way merge possible;
					// fall back to refuse-and-report so the drift signal stays.
					result.refused.push(name);
					break;
				}
				try {
					const ours = JSON.parse(fs.readFileSync(destFile, "utf-8")) as Record<string, unknown>;
					const theirs = JSON.parse(fs.readFileSync(sourceFile, "utf-8")) as Record<string, unknown>;
					const { merged, conflicts } = mergeSchema(base, ours, theirs);
					if (conflicts.length === 0) {
						// writeSchemaCheckedForDir meta-validates + guards nested-id arrays;
						// dryRun validates without writing. The refresh loop (below) is
						// !dryRun-guarded, so a dryRun merge stamps/refreshes nothing.
						writeSchemaCheckedForDir(destRoot, name, merged, "replace", undefined, { dryRun });
						result.merged.push(name);
						// Stamp the merge BASE := the CATALOG body (theirs), not the merged
						// on-disk body — closing the earlier gap where the post-merge baseline
						// refresh stamped the merge base from the merged on-disk body rather
						// than the catalog body, so a kept local divergence survived exactly
						// one update before being silently overwritten by the catalog on the
						// next one. A 3-way merge that KEEPS a local divergence
						// (a reconciled conflict OR a disjoint auto-merge: installed === merged
						// === R, R ≠ catalog) must persist as `locally-modified` on the next
						// check-status — so the next update re-derives base === theirs (catalog)
						// → ours === R via the `base === theirs → ours` rule (schema-merge.ts),
						// keeping R durable at a stable fixed point. Were the baseline left at
						// the merged on-disk body, the next check would read `catalog-ahead` and
						// RESYNC the schema to the catalog, clobbering R. Mirrors resolveConflict's
						// base-advance. dryRun-guarded so a dry-run merge stamps nothing.
						if (!dryRun) stampBaselineFromBody(cwd, name, theirs, readDeclaredVersion(sourceFile) ?? "");
					} else {
						result.conflicts.push({ name, conflicts });
					}
				} catch {
					// A parse/merge/meta-validation throw must not crash the per-asset
					// loop; fall back to refuse-and-report so the schema keeps its drift
					// signal and is surfaced for manual reconciliation.
					result.refused.push(name);
				}
				break;
			}
			default:
				// no-baseline / missing-catalog / missing-installed — undecidable or
				// absent; report with the state, take no action.
				result.reported.push({ name, state });
				break;
		}
	}

	// Reconcile pending-blocked.json to THIS run's blocked set — closing the
	// earlier gap where blocked was a dead-end with no persisted state or
	// resolution command
	// (live only — the dryRun arm collected nothing and writes nothing). When the
	// run produced blocked entries, persist exactly them; when it produced none,
	// REMOVE any prior sidecar so a now-unblocked model leaves no stale record. The
	// blocked contract (schema/block/migrations.json byte-unchanged) is untouched —
	// this sidecar + the pinned object are additive, outside that contract.
	// Git-style in-file failure markers are the DEFAULT behavior
	// of a live validation-blocked schema (no flag, no mode) — the requirement
	// that when update blocks a schema, failure markers are written into the
	// block file at the offending items/fields, not just in a CLI report. For every blocked entry
	// whose reason is validation-failed with non-empty failures, inscribe full-line
	// conflict sentinels INTO the block file at the offending items/fields so the
	// operator sees the problem inline. (1) Pin the PRE-MARKER block-file
	// bytes (wrapped so the object faithfully identifies the raw text) into the object
	// store and set `premarker_hash` on the entry BEFORE the sidecar write, so the
	// record carries the byte-exact restore point. (2) Compose the marker-bearing text
	// and raw-write it back via tmp+rename — NOT writeBlockForDir (the marker file is
	// not valid JSON; routing it through the block writer would throw). The SCHEMA and
	// migrations.json stay byte-unchanged (the blocked contract for those is intact);
	// only the block file changes, by design. A re-run over a block whose file ALREADY
	// carries sentinels RETAINS the prior entry's premarker_hash and does NOT re-mark
	// (CHANGE 4) — the marker file is composed once, from the genuine pre-marker bytes.
	// dryRun writes nothing (this whole block is !dryRun-guarded); a no-chain entry is
	// never marked (validation-failed only).
	if (!dryRun) {
		const priorPending = loadPendingBlockedForDir(destRoot);
		for (const entry of pendingBlockedEntries) {
			if (entry.reason !== "validation-failed" || !entry.failures || entry.failures.length === 0) continue;
			const blockFile = installedBlockDestPath(destRoot, entry.name);
			if (!fs.existsSync(blockFile)) continue;
			const rawBytes = fs.readFileSync(blockFile, "utf-8");
			if (MARKER_LINE_RE_MULTILINE.test(rawBytes)) {
				// Already marked (a re-run): the freshly-built candidate `entry` is DEGRADED
				// — its failures were re-derived from the marker-bearing (non-JSON) block file,
				// which parses to a synthetic envelope-level failure ([{instancePath:"",
				// keyword:"type",message:"must be object"}]) rather than the genuine per-item
				// failures. RETAIN the prior pending entry WHOLE (failures, chain, from/to,
				// reason, blocked_at, premarker_hash) and discard the degraded candidate; the
				// marker file is left untouched (do not re-mark, do not re-pin). When no prior
				// entry exists (sentinels present but no sidecar — e.g. a hand-marked file or a
				// removed sidecar), there is nothing genuine to retain; keep the candidate as-is.
				const prior = priorPending?.entries.find((e) => e.name === entry.name);
				if (prior) {
					const idx = pendingBlockedEntries.indexOf(entry);
					if (idx >= 0) pendingBlockedEntries[idx] = prior;
					// Re-derive this run's blockedDetail for the schema from the retained entry
					// (the per-loop result.blockedDetail push carried the same degraded failures
					// the candidate did). Carry premarker_hash so renderBlocked can truthfully
					// assert that markers were written for this entry.
					const detail = result.blockedDetail.find((d) => d.name === prior.name);
					if (detail) {
						detail.reason = prior.reason;
						detail.from = prior.from;
						detail.to = prior.to;
						detail.failures = prior.failures;
						detail.premarker_hash = prior.premarker_hash;
					}
				}
				continue;
			}
			const wrapper = { kind: "raw-block-bytes", block: entry.name, bytes: rawBytes };
			const premarkerHash = computeContentHash(wrapper);
			putObject(destRoot, premarkerHash, wrapper);
			entry.premarker_hash = premarkerHash;
			// Mirror the pin onto this run's blockedDetail so renderBlocked can truthfully
			// assert that markers were written for this entry (only marker-bearing entries
			// carry premarker_hash; dryRun and no-chain entries never reach this arm).
			const detail = result.blockedDetail.find((d) => d.name === entry.name);
			if (detail) detail.premarker_hash = premarkerHash;
			const markerText = composeMarkerText(rawBytes, entry.name, entry.from, entry.to, entry.failures);
			const tmpPath = `${blockFile}.markers-${process.pid}.tmp`;
			fs.writeFileSync(tmpPath, markerText);
			fs.renameSync(tmpPath, blockFile);
		}
		reconcilePendingBlockedForDir(destRoot, pendingBlockedEntries);
	}

	// Baseline refresh for the schemas this run actually brought current. A resync
	// overwrites the installed schema file with the catalog source but does NOT, by
	// itself, refresh the recorded install baseline (config.installed_from.assets) —
	// so without this step a just-resynced schema would still read as drifted
	// (installed === catalog ≠ stale-baseline → both-diverged) on the next
	// check-status. Mirror installContext's post-loop baseline write, but SURGICALLY:
	// refresh ONLY the resynced/migrated assets (their on-disk body IS the catalog
	// post-resync, so base === catalog either way). A merged schema is EXCLUDED here:
	// it already stamped its baseline := the CATALOG body in the merge
	// arm, so re-fingerprinting its merged on-disk body would overwrite that with
	// the merged body and resync away a kept-local divergence on the next update. A
	// `refused` (locally-modified) schema is likewise not in `brought_current`, so it
	// keeps its drift signal. dryRun performs no writes, so it never refreshes.
	const brought_current = [...result.resynced, ...result.migrated];
	if (!dryRun && brought_current.length > 0) {
		// Refresh the install baseline + base-stamp the body for each schema this run
		// actually brought current, via the shared `refreshBaselineForSchema` helper
		// (a DRY-out of the prior inline body). The helper owns
		// its own per-name config load + content-addressed stamp + config write, and
		// is internally guarded against an absent / corrupt schema file (returns
		// false, leaving the stale baseline entry untouched) — so a present-but-
		// corrupt schema is skipped rather than crashing the update, mirroring the
		// prior inline safety default. A `refused` (locally-modified) schema is NOT
		// in `brought_current`, so it keeps its drift signal (re-fingerprinting it
		// would falsely mark it in-sync). dryRun is excluded by the outer guard, so a
		// dry-run never refreshes.
		for (const name of brought_current) {
			refreshBaselineForSchema(cwd, name);
		}
	}

	// Config-registry propagation — the additive config-registry propagation
	// slice of `pi-context update`. Bring catalog-new
	// keyed-array config-registry entries (relation_types / invariants /
	// block_kinds / lenses) that are ABSENT from the substrate config current with
	// the packaged catalog, ADDITIVELY: a user-authored entry (absent from the
	// catalog) and an existing entry whose body diverges from the catalog are both
	// preserved untouched (mergeCatalogRegistries never replaces a present id).
	// Re-load config FRESH — the baseline-refresh loop above wrote config.json, so
	// the `config` captured at function entry is stale (would drop those baseline
	// updates on write-back). Under dryRun: compute + record additions, write
	// nothing. A read/parse failure is swallowed so the schema-update result
	// (already computed) is not lost — registryAdditions simply stays empty.
	try {
		const catalog = JSON.parse(fs.readFileSync(path.join(samplesRoot, "conception.json"), "utf-8")) as ConfigBlock;
		const fresh = loadConfig(cwd);
		if (fresh) {
			const { merged, additions } = mergeCatalogRegistries(fresh, catalog);
			result.registryAdditions = additions;
			if (
				!dryRun &&
				(additions.relation_types.length ||
					additions.invariants.length ||
					additions.block_kinds.length ||
					additions.lenses.length)
			) {
				writeConfig(cwd, merged);
			}
		}
	} catch {
		// Catalog read / parse / config-load failure: leave registryAdditions empty
		// (its initialized value) and return the schema-update result unchanged.
	}

	// Partial-application legibility — a blocked update result must surface what
	// applied alongside what was refused: computed LAST, after every
	// channel above is final (the registry propagation just ran), so the field is
	// a pure derivation of the finished result. Populated exactly when the run
	// both refused something and applied something; a blocked run whose registry
	// additions (or other-schema resyncs) landed must never read as a no-op.
	// dryRun runs derive the same shape from the predicted plan.
	const ra = result.registryAdditions;
	const registryAdditionCount =
		ra.relation_types.length + ra.invariants.length + ra.block_kinds.length + ra.lenses.length;
	const refusedSomething = result.blocked.length > 0 || result.refused.length > 0 || result.conflicts.length > 0;
	const appliedSomething =
		result.resynced.length > 0 ||
		result.migrated.length > 0 ||
		result.merged.length > 0 ||
		result.migrationsRegistered.length > 0 ||
		registryAdditionCount > 0;
	if (refusedSomething && appliedSomething) {
		const appliedParts: string[] = [];
		if (registryAdditionCount > 0) {
			const perRegistry = (["relation_types", "invariants", "block_kinds", "lenses"] as const)
				.filter((k) => ra[k].length > 0)
				.map((k) => `${ra[k].length} ${k}`)
				.join(", ");
			appliedParts.push(`registry additions (${perRegistry})`);
		}
		if (result.resynced.length > 0) appliedParts.push(`resynced: ${result.resynced.join(", ")}`);
		if (result.migrated.length > 0) appliedParts.push(`migrated: ${result.migrated.join(", ")}`);
		if (result.merged.length > 0) appliedParts.push(`merged: ${result.merged.join(", ")}`);
		if (result.migrationsRegistered.length > 0)
			appliedParts.push(
				`migration declarations registered: ${result.migrationsRegistered.map((m) => `${m.schema} ${m.from}->${m.to}`).join(", ")}`,
			);
		const notAppliedParts: string[] = [];
		if (result.blocked.length > 0)
			notAppliedParts.push(
				`blocked: ${result.blocked
					.map((name) => {
						const detail = result.blockedDetail.find((d) => d.name === name);
						return detail ? `'${name}' (${detail.reason})` : `'${name}'`;
					})
					.join(", ")}`,
			);
		if (result.refused.length > 0)
			notAppliedParts.push(
				`refused (local modifications preserved): ${result.refused.map((n) => `'${n}'`).join(", ")}`,
			);
		if (result.conflicts.length > 0)
			notAppliedParts.push(`merge conflicts: ${result.conflicts.map((c) => `'${c.name}'`).join(", ")}`);
		result.partialApplication = {
			applied: {
				resynced: [...result.resynced],
				migrated: [...result.migrated],
				merged: [...result.merged],
				registryAdditions: ra,
				migrationsRegistered: [...result.migrationsRegistered],
			},
			notApplied: {
				blocked: [...result.blocked],
				refused: [...result.refused],
				conflicts: result.conflicts.map((c) => c.name),
			},
			summary: `PARTIAL APPLICATION${dryRun ? " (dryRun preview)" : ""}: applied — ${appliedParts.join("; ")}. Not applied — ${notAppliedParts.join("; ")}. The applied portion ${dryRun ? "WOULD change" : "changed"} the substrate even though schemas were refused${dryRun ? " (nothing written in this preview)" : ""}.`,
		};
	}

	return result;
}

/**
 * Stamp an in-memory schema `body` as the install baseline
 * (`config.installed_from.assets[name]`) for one schema — the mechanism that
 * lets the resolve-conflict op advance the merge base to the catalog body on
 * commit, so resolving a conflict actually stops it from being re-flagged.
 * The shared stamp mechanics extracted from
 * `refreshBaselineForSchema`: compute the content_hash of `body`, store it into
 * the content-addressed object store (`putObject`) under that hash, set
 * `config.installed_from.assets[name] = { content_hash, version }` (refreshing
 * `at`), and write the config. Self-contained + idempotent: it owns its config
 * load + write. Returns the stamped `content_hash`, or `null` (no write) when
 * the substrate dir is unresolvable or the config carries no `installed_from`.
 *
 * Two callers stamp via this: `refreshBaselineForSchema` (re-baselines the
 * ON-DISK body — `update`'s post-loop refresh) and `resolveConflict` (advances
 * the baseline to the CATALOG body so the next `update` re-derives a resolved
 * schema as `locally-modified`, not a recurring conflict).
 */
export function stampBaselineFromBody(
	cwd: string,
	name: string,
	body: Record<string, unknown>,
	version: string,
): string | null {
	const destRoot = tryResolveContextDir(cwd);
	if (destRoot === null) return null;
	const config = loadConfig(cwd);
	if (!config?.installed_from) return null;
	const hash = computeContentHash(body);
	putObject(destRoot, hash, body);
	const installed_from = {
		...config.installed_from,
		at: new Date().toISOString(),
		assets: {
			...config.installed_from.assets,
			[name]: { content_hash: hash, version },
		},
	};
	writeConfig(cwd, { ...config, installed_from });
	return hash;
}

/**
 * Re-stamp the install baseline (`config.installed_from.assets[name]`) for one
 * schema from its CURRENT on-disk body. Self-contained
 * + idempotent. Used by `updateContext`'s post-loop refresh to re-baseline each
 * brought-current schema (resynced / migrated / auto-merged) so a follow-up
 * `/context check-status` reports it `in-sync`:
 *
 *   - returns `false` (no write) when the installed schema file is absent, OR
 *     its freshly-computed `content_hash` already equals the recorded baseline
 *     hash (a true no-op — nothing was reconciled / written).
 *   - otherwise delegates the stamp to `stampBaselineFromBody` (object-store
 *     put + `assets[name]` set + config write from the on-disk body + its
 *     declared version) and returns `true`.
 *
 * This is a pure idempotent re-stamp action (re-stamps the on-disk body as the
 * new baseline; false when the file is absent or its hash already equals the
 * baseline). Mirrors `updateContext`'s post-loop refresh body for ONE name.
 */
export function refreshBaselineForSchema(cwd: string, name: string): boolean {
	const destRoot = tryResolveContextDir(cwd);
	if (destRoot === null) return false;
	const config = loadConfig(cwd);
	if (!config?.installed_from) return false;
	const destFile = installedSchemaDestPath(destRoot, name);
	if (!fs.existsSync(destFile)) return false;
	const newHash = computeFileContentHash(destFile);
	if (newHash === config.installed_from.assets?.[name]?.content_hash) return false;
	const body = JSON.parse(fs.readFileSync(destFile, "utf-8")) as Record<string, unknown> & { version?: string };
	const stamped = stampBaselineFromBody(cwd, name, body, typeof body.version === "string" ? body.version : "");
	return stamped !== null;
}

/**
 * Reconciliation-commit op — closing the earlier gap where resolving a
 * conflict via write-schema still didn't fix anything (the merge base never
 * advanced to match, so update kept re-flagging the same schema as conflicted
 * forever); this op advances the merge base to the catalog body on commit,
 * completing the caller-as-reconciler model
 * end-to-end. After `update` surfaces a both-diverged schema CONFLICT, the
 * calling agent reconciles the conflicting paths into a resolved body R and runs
 * this op. It does two things atomically per call:
 *
 *   1. WRITES R, when a `schema` is supplied: parse-if-string (mirroring the
 *      write-schema op's tolerant JSON-string handling) then
 *      `writeSchemaCheckedForDir(destRoot, name, R, "replace", ctx)` (AJV
 *      meta-validate + nested-id guard + atomic write). When `schema` is omitted
 *      the current on-disk body is treated as already reconciled — no write.
 *   2. ADVANCES the merge base to the CATALOG body (theirs): it reads the
 *      catalog source schema, stamps it as the install baseline via
 *      `stampBaselineFromBody`. This is the fix the bare write-schema lacks —
 *      with the baseline advanced to the catalog, the next `update`'s 3-way
 *      check resolves the schema as `locally-modified` (base === catalog ≠ R),
 *      and `mergeSchema(base=catalog, ours=R, theirs=catalog)` takes R via the
 *      `base === theirs → ours` rule → auto-merge, zero conflicts, R preserved.
 *      Without this advance, the baseline stays at the original pre-conflict
 *      body and `update` re-derives the SAME both-diverged conflict forever.
 *
 * Throws a clear error when the substrate dir is unresolvable, the config /
 * catalog kind for `name` is missing, or the catalog source schema is absent —
 * the base cannot be advanced without a catalog body to advance it to.
 *
 * Returns `{ schemaName, wroteSchema, baseAdvancedTo }`: `wroteSchema` is true
 * iff a `schema` was supplied and written; `baseAdvancedTo` is the content_hash
 * of the catalog body now stamped as the baseline.
 */
export function resolveConflict(
	cwd: string,
	name: string,
	schema?: unknown,
	ctx?: DispatchContext,
): { schemaName: string; wroteSchema: boolean; baseAdvancedTo: string } {
	const destRoot = tryResolveContextDir(cwd);
	if (destRoot === null) {
		throw new Error(`resolve-conflict: no active substrate resolved for '${cwd}'`);
	}
	// Ceremony seed (idempotent) — update-family class rule: every ceremony
	// entry point seeds the catalog's `config` migration chain before its first
	// config read (here reached via stampBaselineFromBody's loadConfig).
	seedCatalogConfigMigrationDecls(destRoot);
	const { samplesRoot, byId } = resolveCatalog();
	const kind = byId.get(name);
	if (!kind) {
		throw new Error(`resolve-conflict: no catalog block_kind named '${name}' — cannot advance the merge base`);
	}
	const sourceFile = path.join(samplesRoot, kind.schema_path);
	if (!fs.existsSync(sourceFile)) {
		throw new Error(`resolve-conflict: catalog schema source missing at ${sourceFile} for '${name}'`);
	}

	// 1. Write the reconciled body R when supplied. Type.Unknown() params may
	// arrive as JSON strings (mirror the write-schema op handler): parse if
	// possible, otherwise keep raw (meta-validation rejects a non-object body).
	let wroteSchema = false;
	if (schema !== undefined) {
		let body = schema;
		if (typeof body === "string") {
			try {
				body = JSON.parse(body);
			} catch {
				/* keep raw string — meta-validation will reject a non-object */
			}
		}
		writeSchemaCheckedForDir(destRoot, name, body as object, "replace", ctx);
		wroteSchema = true;
	}

	// 2. Advance the merge base to the CATALOG body (theirs). Read + parse the
	// catalog source, stamp it as the new install baseline so the next update's
	// 3-way check sees base === catalog and takes R via base === theirs → ours.
	const catalogBody = JSON.parse(fs.readFileSync(sourceFile, "utf-8")) as Record<string, unknown>;
	const version = readDeclaredVersion(sourceFile) ?? "";
	const catalogHash = stampBaselineFromBody(cwd, name, catalogBody, version);
	if (catalogHash === null) {
		throw new Error(`resolve-conflict: could not advance the merge base for '${name}' (no install baseline in config)`);
	}

	return { schemaName: name, wroteSchema, baseAdvancedTo: catalogHash };
}

/**
 * `context-reconcile` result — the repair half of currency-by-construction.
 * `deltas` lists every
 * rollup-kind item whose STORED status diverges from its DERIVED membership-
 * rollup status (from → stored value, to → derived value, per the declaring
 * derived-status invariant). Under `dryRun` the deltas are the exact set a
 * live run would apply and nothing is written (`applied` 0); a live run
 * applies exactly that set through the standard validated write path and
 * reports `applied`. Scope v1 is derived-status deltas ONLY: the op never
 * writes an authored-status kind (feature/gap/issue/task buckets are human
 * judgment) and never touches prose — those classes are flagged for review by
 * validate, not auto-repaired.
 */
export interface ReconcileResult {
	error?: string;
	dryRun: boolean;
	deltas: Array<{ id: string; block: string; from: string; to: string; invariant: string }>;
	applied: number;
	/**
	 * Declared-baseline staleness sweep — the machine-evaluable
	 * typed-condition-baseline mechanism, in service of currency-by-construction:
	 * every stale_conditions-bearing item whose status buckets complete and
	 * whose typed condition fired, transitioned to `stale`. Under dryRun the
	 * exact set a live run would apply; a live run applies it through the
	 * standard validated write path.
	 */
	stalenessTransitions: Array<{ id: string; block: string; from: string; to: string; reasons: string[] }>;
	stalenessApplied: number;
	/** Ceremony-entry identity establishment, live runs only. */
	substrateIdEstablished?: string;
}

/**
 * `/context reconcile` engine — the repair half of the derived-status
 * invariant class, in service of currency-by-construction. Computes every stored-vs-derived status delta for the
 * kinds the config's derived-status invariants declare (paired with their
 * `state_derivation.rollups` entries), using the SAME shared completeness
 * helper the state derivation and the invariant class use
 * (`derivedRollupComplete`) — the preview, the detector, and the repair
 * cannot disagree. A live run converges each delta through `updateItemInBlock`
 * (identity-stamped, AJV-validated, envelope-stamped, attested to the invoking
 * writer via `ctx`): a converge-write is not authoring — the written value IS
 * the derivation (the schema_version stamp argument). Ceremony discipline:
 * seeds the catalog config decls at entry, and a LIVE run establishes
 * substrate identity when absent (it reaches identity-stamping writes).
 * Deltas are deduplicated per (block, id) across invariants.
 */
export function reconcileContext(
	cwd: string,
	{ dryRun = false }: { dryRun?: boolean } = {},
	ctx?: DispatchContext,
): ReconcileResult {
	const result: ReconcileResult = { dryRun, deltas: [], applied: 0, stalenessTransitions: [], stalenessApplied: 0 };
	const destRoot = tryResolveContextDir(cwd);
	if (destRoot === null) {
		result.error =
			"No .pi-context.json bootstrap pointer found. Run /context init <substrate-dir> first to bootstrap the substrate.";
		return result;
	}
	seedCatalogConfigMigrationDecls(destRoot);
	if (!dryRun) {
		const establishedId = establishSubstrateIdentityAtEntry(cwd, destRoot);
		if (establishedId) result.substrateIdEstablished = establishedId;
	}
	const config = loadConfig(cwd);
	if (!config) {
		result.error = "No config.json found in substrate dir — run /context init <substrate-dir> first.";
		return result;
	}
	result.deltas = computeDerivedStatusDeltas(cwd, config);
	result.stalenessTransitions = computeStalenessTransitions(cwd);
	if (dryRun) return result;
	result.applied = applyDerivedStatusDeltas(cwd, config, result.deltas, ctx);
	result.stalenessApplied = applyStalenessTransitions(cwd, config, result.stalenessTransitions, ctx);
	return result;
}

/**
 * The transition slice of the declared-baseline staleness sweep: candidates
 * from the SAME evaluateStalenessCandidates helper validate flags with, each
 * becoming a stored-status delta to `stale`.
 */
function computeStalenessTransitions(cwd: string): ReconcileResult["stalenessTransitions"] {
	const index = buildIdIndex(cwd);
	return evaluateStalenessCandidates(cwd, index).map((c) => ({
		id: c.id,
		block: c.block,
		from: String(index.byRefname.get(c.id)?.item.status ?? ""),
		to: "stale",
		reasons: c.reasons,
	}));
}

/** Apply the complete-to-stale transitions through the standard validated write path. */
function applyStalenessTransitions(
	cwd: string,
	config: ConfigBlock,
	transitions: ReconcileResult["stalenessTransitions"],
	ctx?: DispatchContext,
): number {
	let applied = 0;
	for (const t of transitions) {
		const arrayKey =
			config.block_kinds?.find((bk) => bk.canonical_id === t.block)?.array_key ??
			(() => {
				const data = readBlock(cwd, t.block) as Record<string, unknown>;
				const discovered = discoverArrayKey(data);
				if (discovered === null) {
					throw new Error(`context-reconcile: no array key discoverable for block '${t.block}'`);
				}
				return discovered;
			})();
		updateItemInBlock(cwd, t.block, arrayKey, (item) => String(item.id) === t.id, { status: t.to }, ctx);
		applied += 1;
	}
	return applied;
}

/**
 * Read-only core of the derived-status repair: the stored-vs-derived delta set
 * for every kind a `derived-status` invariant declares (paired with its
 * `state_derivation.rollups` entry), deduplicated per (block, id). Shared by
 * `reconcileContext` and the post-write convergence hook so the ceremony and
 * the hook compute the identical set.
 */
function computeDerivedStatusDeltas(cwd: string, config: ConfigBlock): ReconcileResult["deltas"] {
	const deltas: ReconcileResult["deltas"] = [];
	const sd = resolveStateDerivation(cwd);
	const declared = (config.invariants ?? []).filter((inv) => inv.class === "derived-status");
	if (sd === null || declared.length === 0) return deltas;

	const index = buildIdIndex(cwd);
	const edges = loadRelations(cwd);
	const vocab = resolveStatusVocab(cwd);
	const bucketOf = (item: Record<string, unknown>): string => vocab[String(item.status)] ?? "unknown";
	const rollupByKind = new Map(sd.rollups.map((r) => [r.kind, r]));
	const roleDir = new Map<string, "as_parent" | "as_child">();
	for (const rt of config.relation_types ?? []) {
		if (rt.role_direction !== undefined) roleDir.set(rt.canonical_id, rt.role_direction);
	}
	const seen = new Set<string>();
	for (const inv of declared) {
		const entry = rollupByKind.get(inv.block);
		if (entry === undefined) continue; // inert declaration — nothing to derive against
		for (const loc of index.byRefname.values()) {
			if (loc.block !== inv.block) continue;
			const key = `${inv.block} ${loc.id}`;
			if (seen.has(key)) continue;
			const derived = derivedRollupComplete(index, edges, roleDir, rollupByKind, bucketOf, loc.id)
				? entry.complete_status
				: entry.incomplete_status;
			const stored = String(loc.item.status);
			if (stored === derived) continue;
			seen.add(key);
			deltas.push({ id: loc.id, block: inv.block, from: stored, to: derived, invariant: inv.id });
		}
	}
	return deltas;
}

/** Apply a computed delta set through the standard validated write path. */
function applyDerivedStatusDeltas(
	cwd: string,
	config: ConfigBlock,
	deltas: ReconcileResult["deltas"],
	ctx?: DispatchContext,
): number {
	let applied = 0;
	for (const delta of deltas) {
		const arrayKey =
			config.block_kinds?.find((bk) => bk.canonical_id === delta.block)?.array_key ??
			(() => {
				const data = readBlock(cwd, delta.block) as Record<string, unknown>;
				const discovered = discoverArrayKey(data);
				if (discovered === null) {
					throw new Error(`context-reconcile: no array key discoverable for block '${delta.block}'`);
				}
				return discovered;
			})();
		updateItemInBlock(cwd, delta.block, arrayKey, (item) => String(item.id) === delta.id, { status: delta.to }, ctx);
		applied += 1;
	}
	return applied;
}

/**
 * Converge-on-write hook — part of currency-by-construction (the schema_version
 * template applied to rollup-kind stored status), closing the gap where a
 * milestone could read as "reached" by live derivation while still
 * gate-blocking its own tasks via a stale stored status. Invoked
 * AFTER a sanctioned mutating op's write lands (the op's own lock is already
 * released — sequential lock acquisition, no nesting): recomputes the
 * derived-status delta set with the SAME core the reconcile ceremony uses and
 * stamps every affected rollup item's stored status through the standard
 * validated write path — a converge-stamp is not authoring; the written value
 * IS the derivation. Config-driven opt-in: a substrate with no
 * `derived-status` invariant (or no `state_derivation.rollups`) computes an
 * empty set and performs no writes, so non-declaring and legacy substrates
 * are byte-identical to before. BEST-EFFORT by design: it never establishes
 * identity (a convergence side-effect minting a substrate_id would be a lazy
 * mint — identity is never lazily minted as a side-effect of an arbitrary
 * block write) and never fails the caller's already-landed write — an
 * apply failure leaves the divergence for the `derived-status` invariant to
 * detect and `context-reconcile` (the ceremony with the establishment +
 * error surface) to repair. Returns the converged set, or null when there was
 * nothing to converge or the hook could not run.
 */
export function convergeDerivedStatusAfterWrite(cwd: string, ctx?: DispatchContext): ReconcileResult["deltas"] | null {
	try {
		const config = loadConfig(cwd);
		if (!config) return null;
		const deltas = computeDerivedStatusDeltas(cwd, config);
		if (deltas.length === 0) return null;
		applyDerivedStatusDeltas(cwd, config, deltas, ctx);
		return deltas;
	} catch {
		// Best-effort: the caller's write already landed; a convergence failure
		// (pre-identity stamping guard, unreadable sibling block) leaves the
		// divergence detectable by the derived-status invariant and repairable by
		// context-reconcile — never a failure of the triggering write.
		return null;
	}
}

/**
 * Blocked-resolution commit op — closing the earlier gap where blocked was a
 * dead-end with no persisted state or resolution command; this is the
 * resolution half of
 * the blocked-resync loop `update` opens. After `update` REFUSES a catalog-ahead
 * resync (blocked) it persists a pending-blocked record pinning the TARGET
 * catalog schema body (in the object store) + the migration chain reaching it.
 * The calling agent then fixes the block's failing items (or widens the local
 * schema) and runs THIS op to commit the resolution against the SAME pinned
 * target the run blocked on — so a subsequent `update` converges (in-sync)
 * instead of re-blocking.
 *
 * Flow:
 *   1. Load the pending-blocked record; an absent entry for `name` throws a
 *      field-named error (run `update` first to produce one).
 *   2. Retrieve the pinned target schema body by its `target_hash` from the
 *      object store; a missing object throws (the pin is the resolution contract).
 *   3. Re-validate the CURRENT block against the PINNED target body: load the
 *      installed block, forward-migrate its items IN MEMORY through the entry's
 *      chain when the block's declared `schema_version` differs from the target
 *      `to` version (a FRESH registry seeded existing-decls-first + the chain,
 *      mirroring validateBlockItemsAgainstCatalog), then `validate`.
 *   4. FAIL → return `{ resolved: false, failures }` and WRITE NOTHING — the
 *      pending record stays intact so the caller can correct + retry.
 *   5. PASS → in order: register the chain decls not already on disk (collecting
 *      the registered set), write the target schema (replace), advance the
 *      migrated block's `schema_version` envelope to `to` + persist it (skipping
 *      the block write when it had no items — schema still written, base still
 *      advanced, mirroring the live no-items handling), advance the merge base to
 *      the target body, and clear the entry from pending-blocked.json (removing
 *      the file when it becomes empty). Return `{ resolved: true,
 *      registeredMigrations, baseAdvancedTo }`.
 *
 * Throws (no write) when the substrate dir is unresolvable, no pending entry
 * names `name`, or the pinned target object is missing.
 */
export function resolveBlocked(
	cwd: string,
	name: string,
	ctx?: DispatchContext,
):
	| { schemaName: string; resolved: false; failures: BlockValidationFailure[]; substrateIdEstablished?: string }
	| {
			schemaName: string;
			resolved: true;
			registeredMigrations: Array<{ schema: string; from: string; to: string }>;
			baseAdvancedTo: string | null;
			substrateIdEstablished?: string;
	  } {
	const destRoot = tryResolveContextDir(cwd);
	if (destRoot === null) {
		throw new Error(`resolve-blocked: no active substrate resolved for '${cwd}'`);
	}
	// Ceremony seed (idempotent) — update-family class rule: every ceremony
	// entry point seeds the catalog's `config` migration chain before its first
	// config read (here reached via stampBaselineFromBody's loadConfig on the
	// pass path).
	seedCatalogConfigMigrationDecls(destRoot);
	// Ceremony-entry identity establishment — before the commit's
	// writeBlockForDir stamping write, so a pre-identity substrate's resolution
	// heals identity instead of refusing mid-commit.
	const establishedId = establishSubstrateIdentityAtEntry(cwd, destRoot);
	const pending = loadPendingBlockedForDir(destRoot);
	const entry = pending?.entries.find((e) => e.name === name);
	if (!entry) {
		throw new Error(`schemaName: no pending-blocked entry for '${name}' — run update first`);
	}

	const targetBody = getObject(destRoot, entry.target_hash);
	if (targetBody === null) {
		throw new Error(
			`schemaName: pinned target schema object ${entry.target_hash} missing for '${name}' — cannot re-validate the block`,
		);
	}

	// Load the installed block (the validateBlockItemsAgainstCatalog load pattern).
	// Read the RAW text first. A live update inscribes git-style
	// failure markers INTO the block file (full-line `<<<<<<<`/`>>>>>>>` sentinels), so
	// the file is no longer valid JSON. Detect the sentinels by a full-line scan, STRIP
	// the marker lines, and parse the remainder. `strippedText` is retained so the PASS
	// path can raw-write it to disk BEFORE the commit's writeBlockForDir — the identity
	// stamp's prior-read then parses the ON-DISK stripped file and matches items by oid,
	// preserving oids (content_parent advances only on genuinely changed items, no
	// re-mint). A strip that still does not parse falls through to the parse-fail path;
	// on FAIL the marker file is left untouched (the no-write-on-fail contract).
	const blockFile = installedBlockDestPath(destRoot, name);
	let blockData: unknown;
	let wasMarked = false;
	let strippedText: string | undefined;
	try {
		if (fs.existsSync(blockFile)) {
			const rawText = fs.readFileSync(blockFile, "utf-8");
			wasMarked = MARKER_LINE_RE_MULTILINE.test(rawText);
			strippedText = wasMarked
				? rawText
						.split("\n")
						.filter((line) => !MARKER_LINE_RE.test(line))
						.join("\n")
				: rawText;
			blockData = JSON.parse(strippedText);
		} else {
			blockData = undefined;
		}
	} catch (err) {
		return {
			schemaName: name,
			resolved: false,
			failures: [{ instancePath: "", keyword: "error", message: String(err) }],
			...(establishedId ? { substrateIdEstablished: establishedId } : {}),
		};
	}

	const blockVersion =
		blockData && typeof blockData === "object" && "schema_version" in (blockData as Record<string, unknown>)
			? ((blockData as Record<string, unknown>).schema_version as unknown)
			: undefined;
	const targetVersion = entry.to;

	// Determine whether the block carries items (mirrors resyncSchema's hasItems).
	let hasItems = false;
	if (blockData && typeof blockData === "object") {
		forEachBlockArray(blockData, (_arrayKey, arr) => {
			if (arr.length > 0) hasItems = true;
		});
	}

	// Re-validate the block against the PINNED target body, forward-migrating its
	// items in memory through the entry chain when the block lags the target. A
	// FRESH registry seeded existing-decls-first + the chain, deduped on
	// (schemaName, fromVersion) — never warm the project's cached registry.
	let migrated: unknown = blockData;
	try {
		if (
			typeof blockVersion === "string" &&
			typeof targetVersion === "string" &&
			blockVersion !== targetVersion &&
			entry.chain.length > 0
		) {
			const registry = buildFreshRegistryWithChain(destRoot, entry.chain);
			migrated = runMigrations(registry, name, blockVersion, targetVersion, blockData);
		}
		validate(targetBody, migrated, name);
	} catch (err) {
		const failures =
			err instanceof ValidationError
				? mapValidationFailures(err.errors, blockData)
				: [{ instancePath: "", keyword: "error", message: String(err) }];
		return {
			schemaName: name,
			resolved: false,
			failures,
			...(establishedId ? { substrateIdEstablished: establishedId } : {}),
		};
	}

	// PASS — commit the resolution, ALL-OR-NOTHING — closing the earlier gap where
	// the resync/resolve-blocked pipeline classified every throw as an
	// item-validation failure, corrupting the all-or-nothing refusal guarantee.
	// The commit touches
	// up to five files; a throw partway (e.g. the mandatory identity stamp inside
	// writeBlockForDir refusing a substrate with no substrate_id) previously
	// stranded a partial commit — schema advanced, markers stripped, block
	// unwritten, pending entry stale. Capture the raw pre-commit bytes of every
	// touched file up front; on any commit-phase throw restore them byte-exact
	// (the per-component transactional model — a blocked schema doesn't withhold
	// sibling schema resyncs or the additive registry propagation — and the
	// never-silently-overwrite-or-hard-block update discipline), invalidate
	// the migration-registry cache warmed by the reverted decl appends, and
	// return resolved:false carrying the truthful failure. Object-store putObject
	// entries are content-addressed and harmless to leave behind.
	const commitFiles = [
		migrationsPathForDir(destRoot),
		installedSchemaDestPath(destRoot, name),
		blockFile,
		path.join(destRoot, "config.json"),
		pendingBlockedPathForDir(destRoot),
	];
	const preCommitBytes = new Map<string, Buffer | null>();
	for (const f of commitFiles) {
		preCommitBytes.set(f, fs.existsSync(f) ? fs.readFileSync(f) : null);
	}
	try {
		// (1) Register the chain decls not already on disk (the resyncSchema dedup),
		// collecting the registered set.
		const existing = loadMigrationsFileForDir(destRoot);
		const present = new Set((existing?.migrations ?? []).map((m) => `${m.schemaName} ${m.fromVersion}`));
		const registeredMigrations: Array<{ schema: string; from: string; to: string }> = [];
		for (const decl of entry.chain) {
			const key = `${decl.schemaName} ${decl.fromVersion}`;
			if (present.has(key)) continue;
			appendMigrationDeclForDir(destRoot, decl, ctx);
			present.add(key);
			registeredMigrations.push({ schema: decl.schemaName, from: decl.fromVersion, to: decl.toVersion });
		}

		// (2) Write the target schema (replace — meta-validated, nested-id-guarded, atomic).
		writeSchemaCheckedForDir(destRoot, name, targetBody, "replace", ctx);

		// (3) Advance the migrated block's schema_version envelope to the target + persist
		// it (skip when the block had no items — schema still written, base still advanced,
		// mirroring the live no-items handling). Identity stamping re-runs on the write.
		if (hasItems) {
			// oid stability: when the on-disk block carried markers,
			// raw-write the STRIPPED text to the block file (tmp+rename) BEFORE
			// writeBlockForDir, so the identity-stamp prior-read parses the marker-free
			// on-disk file and preserves each item's oid (no re-mint; content_parent advances
			// only on genuinely changed items).
			if (wasMarked && strippedText !== undefined) {
				const tmpPath = `${blockFile}.unmark-${process.pid}.tmp`;
				fs.writeFileSync(tmpPath, strippedText);
				fs.renameSync(tmpPath, blockFile);
			}
			if (
				migrated &&
				typeof migrated === "object" &&
				!Array.isArray(migrated) &&
				typeof (migrated as Record<string, unknown>).schema_version === "string" &&
				typeof targetVersion === "string"
			) {
				(migrated as Record<string, unknown>).schema_version = targetVersion;
			}
			writeBlockForDir(destRoot, name, migrated);
		}

		// (4) Advance the merge base to the target body so a subsequent update converges
		// (base === catalog) instead of re-deriving drift.
		const baseAdvancedTo = stampBaselineFromBody(cwd, name, targetBody, targetVersion ?? "");

		// (5) Clear the resolved entry from pending-blocked.json (remove the file when
		// it becomes empty — no stale empty sidecar).
		const remaining = (pending?.entries ?? []).filter((e) => e.name !== name);
		reconcilePendingBlockedForDir(destRoot, remaining, ctx);

		return {
			schemaName: name,
			resolved: true,
			registeredMigrations,
			baseAdvancedTo,
			...(establishedId ? { substrateIdEstablished: establishedId } : {}),
		};
	} catch (err) {
		for (const [f, bytes] of preCommitBytes) {
			if (bytes === null) {
				if (fs.existsSync(f)) fs.unlinkSync(f);
			} else {
				fs.writeFileSync(f, bytes);
			}
		}
		invalidateMigrationRegistryForDir(destRoot);
		return {
			schemaName: name,
			resolved: false,
			failures: [{ instancePath: "", keyword: "error", message: String(err) }],
			...(establishedId ? { substrateIdEstablished: establishedId } : {}),
		};
	}
}

/**
 * Render an `UpdateResult["conflicts"]` set as a readable conflict report —
 * the surface the `update` op + CLI hand
 * to the CALLING agent, which reconciles each conflict into a resolved body and
 * commits it via the `resolve-conflict` op (writes the body AND advances the
 * merge base to the catalog so `update` stops re-reporting it; no subordinate
 * resolver is spawned). Mirrors `renderCheckStatus`'s grouping
 * style: one section per conflicting schema `name`, then each irreconcilable
 * `{ path, base, ours, theirs }` with its three values JSON-compacted for a
 * side-by-side scan, then a trailing guidance line stating how to apply a
 * reconciliation. Pure: no I/O, no writes.
 */
export function renderConflicts(conflicts: UpdateResult["conflicts"]): string {
	const lines: string[] = [];
	lines.push("Schema merge conflicts — manual reconciliation required (no writes performed):");
	if (conflicts.length === 0) {
		lines.push("  (no conflicts)");
		return lines.join("\n");
	}
	for (const { name, conflicts: set } of conflicts) {
		lines.push(`  ${name} (${set.length} conflict${set.length === 1 ? "" : "s"}):`);
		for (const c of set) {
			lines.push(`    ${c.path}`);
			lines.push(`      base:   ${JSON.stringify(c.base)}`);
			lines.push(`      ours:   ${JSON.stringify(c.ours)}`);
			lines.push(`      theirs: ${JSON.stringify(c.theirs)}`);
		}
	}
	lines.push(
		"To resolve each: reconcile the conflicting paths into a schema, then resolve-conflict --schemaName <name> --schema <reconciled> — it writes your schema AND advances the merge base to the catalog so update stops re-reporting it.",
	);
	return lines.join("\n");
}

/**
 * Render the per-schema blocked-resync diagnostic — surfacing which
 * item/field/constraint actually failed instead of a bare "blocked" — as a
 * readable report the CLI surfaces below `update`'s output when a catalog-ahead
 * resync was refused. One section per blocked schema `name`:
 *   - header `blocked: <name> (<from> -> <to>)` (the installed→catalog version
 *     pair; `?` substitutes a missing version).
 *   - `no-migration-chain` → one line `no migration chain reaches <to> from
 *     <from>`.
 *   - `validation-failed` → one line per failing item, naming the item id (or the
 *     `instancePath` when no id resolved), the field (the tail of `instancePath`),
 *     and the constraint phrased keyword-aware — MIRRORING the CLI's
 *     `formatAjvError` keyword switch (required / type / enum / additionalProperties
 *     fall through to the raw message), reproduced here rather than imported to
 *     avoid a pi-context → pi-context-cli dependency cycle (render.ts imports this
 *     package). A failure carrying no AJV `keyword` mapping prints its raw message.
 *
 * A LIVE `update` that blocks a `validation-failed` resync
 * inscribes git-style failure markers INTO the block file at the offending items —
 * and ONLY then does the trailing guidance claim, in the past tense, that markers
 * "were written INTO the block file(s)". That claim is keyed on the per-entry
 * `premarker_hash` (set only when markers were actually inscribed): a dryRun preview
 * writes nothing and a `no-migration-chain` entry is never marked, so neither carries
 * `premarker_hash` — for those the report keeps each entry's reason line + neutral
 * fix-then-resolve guidance WITHOUT the past-tense write claim. In all cases the
 * schema + `migrations.json` stay byte-unchanged. Pure: no I/O, no writes.
 */
export function renderBlocked(blockedDetail: BlockedDetail[]): string {
	const lines: string[] = [];
	lines.push("Schema resync blocked (schema + migrations.json unchanged):");
	if (blockedDetail.length === 0) {
		lines.push("  (no blocked schemas)");
		return lines.join("\n");
	}
	for (const d of blockedDetail) {
		const from = d.from ?? "?";
		const to = d.to ?? "?";
		lines.push(`  blocked: ${d.name} (${from} -> ${to})`);
		if (d.reason === "no-migration-chain") {
			lines.push(`    no migration chain reaches ${to} from ${from}`);
			continue;
		}
		if (d.reason === "write-failed") {
			// Classified at the catch site: a non-validation refusal at the write boundary. The items were
			// NOT flagged invalid — do not direct the operator at them.
			for (const f of d.failures ?? []) {
				lines.push(`    ${f.message}`);
			}
			lines.push(
				"    write refused (not an item-validation failure) — the block's items were not flagged invalid; do not edit items. Address the named precondition, then re-run update.",
			);
			continue;
		}
		// validation-failed
		for (const f of d.failures ?? []) {
			const subject = f.itemId ?? f.instancePath ?? "(item)";
			const field = f.instancePath ? f.instancePath.split("/").filter(Boolean).pop() : undefined;
			const fieldClause = field ? ` field \`${field}\`` : "";
			lines.push(`    ${subject}:${fieldClause} ${describeBlockedFailure(f)}`);
		}
	}
	// Past-tense write claim ONLY when at least one entry actually carries markers
	// (premarker_hash present). Otherwise the resync was refused without inscribing
	// anything (dryRun preview, or only no-migration-chain entries) — emit neutral
	// fix-then-resolve guidance that does NOT assert a write that did not happen.
	const anyMarked = blockedDetail.some((d) => d.premarker_hash);
	if (anyMarked) {
		lines.push(
			"Git-style failure markers were written INTO the block file(s): open each block file, fix the items between the `<<<<<<< BLOCKED …` / `>>>>>>> target: …` markers, then resolve-blocked --schemaName <name> --yes — it strips the markers, re-validates the corrected block against the pinned target, writes the target schema, advances the merge base, and clears the block so update converges.",
		);
	} else if (blockedDetail.some((d) => d.reason !== "write-failed")) {
		// The fix-items-then-resolve-blocked flow applies only to entries that
		// persist a pending record (validation-failed / no-migration-chain). A
		// report whose entries are ALL write-failed carries its own per-entry
		// guidance (address the precondition, re-run update) — appending the
		// item-fixing flow here would contradict it.
		lines.push(
			"No markers were written (preview, or no migration chain to mark against). Resolve a validation-failed block by correcting the offending items in the block file, then resolve-blocked --schemaName <name> --yes — it re-validates the corrected block against the pinned target, writes the target schema, advances the merge base, and clears the block so update converges.",
		);
	}
	return lines.join("\n");
}

/**
 * Phrase ONE blocked validation failure keyword-aware, mirroring the CLI's
 * `formatAjvError` keyword switch. The minimal {@link
 * BlockValidationFailure} shape drops the AJV `params`, so the required /
 * additionalProperties branches that need `missingProperty` / `additionalProperty`
 * fall back to the raw AJV `message` (which already names them); type / enum and
 * every other keyword likewise surface the AJV message, prefixed by the constraint
 * keyword so the failing constraint is named even without params.
 */
function describeBlockedFailure(f: BlockValidationFailure): string {
	const msg = f.message || "invalid";
	return f.keyword && f.keyword !== "error" ? `${f.keyword} — ${msg}` : msg;
}

/**
 * /context init — scaffold the substrate dir (bootstrap pointer + substrate +
 * schemas directories only; no asset copying). Run accept-all + install to
 * populate. Idempotent: skips directories that already exist.
 */
function handleInit(args: string, ctx: ExtensionCommandContext): void {
	const contextDir = args.trim().split(/\s+/)[0];
	if (!contextDir) {
		ctx.ui.notify(
			"/context init requires a substrate dir name (e.g. '/context init .context'). No default — you choose the name.",
			"error",
		);
		return;
	}

	let result: { created: string[]; skipped: string[] };
	try {
		result = initProject(ctx.cwd, contextDir);
	} catch (err) {
		// Name-based catch per the cross-module-instance-instanceof-unreliable
		// discipline used elsewhere in this file (tryResolveContextDir pattern).
		if (err instanceof Error && err.name === "ContextInitMismatchError") {
			ctx.ui.notify(err.message, "error");
			return;
		}
		throw err;
	}
	const { created, skipped } = result;

	const lines: string[] = [];
	lines.push(`Project initialized`);
	lines.push("");
	if (created.length > 0) {
		lines.push(`Created (${created.length}): ${created.join(", ")}`);
	}
	if (skipped.length > 0) {
		lines.push(`Skipped (${skipped.length}, already exist): ${skipped.join(", ")}`);
	}
	if (created.length === 0 && skipped.length > 0) {
		lines.push("Project already initialized — nothing to do.");
	}
	lines.push("");
	lines.push(
		"The substrate now carries a skeleton config (schema-valid, empty of vocabulary). Two onward paths: run /context accept-all to adopt the packaged catalog, OR amend-config / edit config.json to build a custom vocabulary.",
	);

	ctx.ui.notify(lines.join("\n"), "info");
}

/**
 * /context accept-all — adopt the canonical packaged conception
 * (samples/conception.json) as this substrate's config.json. Writes config only
 * (no asset materialization — run /context install after). Skeleton-aware:
 * overwrites a SKELETON config (the empty-of-vocabulary
 * config init / switch -c writes) but never a POPULATED one. Requires the
 * substrate to be initialized first (a bootstrap pointer must exist).
 */
function handleAcceptAll(_args: string, ctx: ExtensionCommandContext): void {
	let r: AdoptResult;
	try {
		r = adoptConception(ctx.cwd);
	} catch (err) {
		if (err instanceof BootstrapNotFoundError) {
			ctx.ui.notify("Run /context init <substrate-dir> first", "error");
			return;
		}
		throw err;
	}
	if (!r.adopted) {
		ctx.ui.notify("config.json already carries a populated vocabulary — not overwritten.", "info");
		return;
	}
	ctx.ui.notify(
		`Adopted canonical config (root: ${r.root}, ${r.schemaCount} schemas / ${r.blockCount} blocks declared). Run /context install to materialize them.`,
		"info",
	);
}

// ── /context switch + list + archive — substrate-management primitives ─────

/**
 * Resolve a writer identity for the slash command path. Slash commands run
 * inside the operator's interactive Pi session and the user IS the terminal
 * operator; the auth-gate identity-stamp at the Pi tool boundary does not
 * apply here. Falls back to "operator" (plus an operator-visible warning via
 * ctx.ui.notify) when neither git config user.email nor process.env.USER
 * yields a value, so the pointer-history switched_by field always carries
 * a non-empty string.
 *
 * NOTE: inlined locally rather than imported from pi-agent-dispatch's
 * verified-identity.ts to avoid a circular dep (pi-agent-dispatch depends
 * on pi-context). The discovery cascade matches the canonical resolver:
 * git config user.email → process.env.USER → null+warning.
 */
function resolveSlashCommandWriter(ctx: ExtensionCommandContext): string {
	let fromGit: string | null = null;
	try {
		const out = execSync("git config user.email", {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
			cwd: ctx.cwd,
			env: cleanGitEnv(),
		}).trim();
		fromGit = out.length > 0 ? out : null;
	} catch {
		fromGit = null;
	}
	if (fromGit !== null) return fromGit;
	const fromEnv = process.env.USER;
	if (fromEnv && fromEnv.length > 0) return fromEnv;
	ctx.ui.notify(
		"slash command writer-identity: neither git config user.email nor process.env.USER yielded a value; switched_by will be stamped 'operator' (unverified).",
		"warning",
	);
	return "operator";
}

/**
 * Bootstrap a new substrate dir + flip the pointer in one operation. The
 * shared engine behind `/context switch -c <new-dir>` and the
 * `context-switch` Pi tool with `create_new=true`.
 *
 * Sequence:
 * 1. Caller-supplied target dir name validated (assertSubstrateName — same
 *    discipline as schema names; rejects path separators / dots / '..').
 *    NOTE: a leading-dot dir like '.context' fails assertSubstrateName, so
 *    target dirs that start with '.' bypass that check by stripping the dot
 *    before validation and re-prepending — preserves the existing convention
 *    in this repo (`.project` / `.context` style) while keeping the substrate-
 *    name discipline for the body of the name.
 * 2. Writes a fresh bootstrap pointer FOR THE NEW DIR via the v1.0.0 single-
 *    arg writeBootstrapPointer overload — pointer carries the new dir as
 *    contextDir + a fresh created_at. This OVERWRITES the existing pointer
 *    intentionally because we then immediately flip; the flip preserves the
 *    new-dir's created_at since the freshly-written pointer's created_at is
 *    the only one in scope.
 *    Wait: this would lose the original substrate's created_at. The correct
 *    sequence is to flip FIRST (which preserves existing created_at into
 *    the new pointer + stamps previous_contextDir from existing), then
 *    scaffold the new dir's structure. flipBootstrapPointer does the pointer
 *    work; this helper then mkdir's the substrate root + schemas subdir.
 */
export function switchAndCreate(cwd: string, newContextDir: string, writerIdentity: string): { created: string[] } {
	// Validation: allow a leading '.' in the dir name (project convention) but
	// require the rest to match the substrate-name discipline.
	const nameBody = newContextDir.startsWith(".") ? newContextDir.slice(1) : newContextDir;
	if (!/^[A-Za-z0-9_-]+$/.test(nameBody)) {
		throw new Error(
			`/context switch -c: invalid target dir name '${newContextDir}' (only letters, digits, '-', '_' after an optional leading '.' are allowed; no path separators or '..')`,
		);
	}

	// Require an existing pointer so we have something to flip FROM. The
	// existence check + read live inside flipBootstrapPointer.
	flipBootstrapPointer(cwd, newContextDir, writerIdentity);

	// Scaffold the new substrate dir's structure (substrate root + schemas
	// subdir). Mirrors initProject's dir-creation loop without writing the
	// pointer again (flip already did that).
	const projectDirPath = resolveContextDir(cwd);
	const schemasDirPath = schemasDir(cwd);
	const created: string[] = [];
	for (const dir of [projectDirPath, schemasDirPath]) {
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
			created.push(`${path.relative(cwd, dir)}/`);
		}
	}
	// Write the minimal schema-valid SKELETON config so the
	// freshly-created substrate has a tool-driven config from bootstrap — onward
	// paths are /context accept-all OR amend-config / edit. NEVER-CLOBBER via
	// writeSkeletonConfig (a re-creation over an existing config leaves it).
	const skeleton = writeSkeletonConfig(cwd);
	if (skeleton.written) {
		created.push(`${path.relative(cwd, path.join(projectDirPath, "config.json"))}`);
	}
	// Reconcile the now-active substrate's identity into the project-root
	// registry. writeSkeletonConfig registers a freshly-minted id, but when the
	// target dir already carried a config (never-clobber returned written:false)
	// its id may be unregistered — register it here so the SoT-drift invariant
	// does not raise a false substrate_id_unregistered.
	reconcileActiveSubstrateRegistration(cwd);
	return { created };
}

/**
 * Flip the bootstrap pointer to an existing substrate dir. Shared engine
 * behind `/context switch <existing-dir>` and the `context-switch` Pi tool
 * default mode.
 *
 * Read-side safety check: verifies `<cwd>/<targetDir>/config.json` exists
 * before flipping (the substrate must already be initialized; flipping to
 * a non-substrate dir would leave the resolver pointing at an empty path).
 * The check is a fail-fast; the flip itself is performed by
 * flipBootstrapPointer.
 */
export function switchToExisting(cwd: string, targetDir: string, writerIdentity: string): void {
	const targetConfigPath = path.join(cwd, targetDir, "config.json");
	if (!fs.existsSync(targetConfigPath)) {
		throw new Error(
			`/context switch: target dir '${targetDir}' has no config.json at ${targetConfigPath} — refusing to flip the bootstrap pointer to a non-substrate dir. Use '/context switch -c ${targetDir}' to bootstrap a fresh substrate at that dir AND flip the pointer.`,
		);
	}
	flipBootstrapPointer(cwd, targetDir, writerIdentity);
	// Seed the TARGET substrate's catalog `config` migration chain (idempotent)
	// right after the flip — every ceremony entry point seeds before its first
	// config read, so the first read on the now-active substrate (reconcile's
	// below, or any later one) cannot throw on a version-lagging legacy config.
	seedCatalogConfigMigrationDecls(resolveContextDir(cwd));
	// Register the now-active substrate's identity if the target carried a
	// config-bearing-but-unregistered substrate_id, so the SoT-drift invariant
	// does not raise a false substrate_id_unregistered after the flip.
	reconcileActiveSubstrateRegistration(cwd);
}

/**
 * Flip the bootstrap pointer back to the previous_contextDir (parallel to
 * `git switch -`). Shared engine behind `/context switch -` and the
 * `context-switch` Pi tool with `to_previous=true`.
 *
 * Reads the existing pointer's `previous_contextDir`; if absent (the pointer
 * was never switched), throws a structured error naming the precondition.
 */
export function switchToPrevious(cwd: string, writerIdentity: string): { from: string; to: string } {
	const bootstrapPath = path.join(cwd, ".pi-context.json");
	if (!fs.existsSync(bootstrapPath)) {
		throw new BootstrapNotFoundError(cwd, bootstrapPath);
	}
	const raw = fs.readFileSync(bootstrapPath, "utf-8");
	const pointer = JSON.parse(raw) as { contextDir?: unknown; previous_contextDir?: unknown };
	const previous = pointer.previous_contextDir;
	const current = pointer.contextDir;
	if (typeof previous !== "string" || previous.length === 0) {
		throw new Error(
			`/context switch -: pointer has no previous_contextDir to flip back to (substrate has never been switched). The /context switch - form requires a prior /context switch invocation to populate the previous_contextDir field.`,
		);
	}
	if (typeof current !== "string") {
		throw new Error(
			`/context switch -: existing pointer at ${bootstrapPath} lacks a string contextDir; refuses to flip an unreadable pointer`,
		);
	}
	flipBootstrapPointer(cwd, previous, writerIdentity);
	// Seed the flipped-back-to substrate's catalog `config` migration chain
	// (idempotent) right after the flip — same switch-family ceremony rule as
	// switchToExisting: the first config read on the now-active substrate must
	// not throw on a version-lagging legacy config.
	seedCatalogConfigMigrationDecls(resolveContextDir(cwd));
	// Register the now-active substrate's identity if flipping back landed on a
	// config-bearing-but-unregistered substrate_id, so the SoT-drift invariant
	// does not raise a false substrate_id_unregistered after the flip. Mirrors
	// switchToExisting / switchAndCreate; only reached on a successful flip
	// (the absent-previous_contextDir path throws above).
	reconcileActiveSubstrateRegistration(cwd);
	return { from: current, to: previous };
}

/**
 * Enumerate top-level dirs under `cwd` that contain a `config.json` — i.e.,
 * dirs that could be the target of `/context switch`. Returns an array of
 * `{name, isActive}` entries; `isActive` flips true for the dir matching the
 * current bootstrap pointer's contextDir. Shared engine behind `/context list`
 * and the `context-list` Pi tool.
 */
export function listSubstrates(cwd: string): Array<{ name: string; isActive: boolean }> {
	let activeContextDir: string | null = null;
	try {
		const bootstrapPath = path.join(cwd, ".pi-context.json");
		if (fs.existsSync(bootstrapPath)) {
			const raw = fs.readFileSync(bootstrapPath, "utf-8");
			const pointer = JSON.parse(raw) as { contextDir?: unknown };
			if (typeof pointer.contextDir === "string") activeContextDir = pointer.contextDir;
		}
	} catch {
		// Malformed pointer: list still works, no dir flagged active.
		activeContextDir = null;
	}

	const out: Array<{ name: string; isActive: boolean }> = [];
	let entries: string[];
	try {
		entries = fs.readdirSync(cwd);
	} catch {
		return out;
	}
	for (const name of entries.sort()) {
		const fullPath = path.join(cwd, name);
		let stat: fs.Stats;
		try {
			stat = fs.statSync(fullPath);
		} catch {
			continue;
		}
		if (!stat.isDirectory()) continue;
		// archive/ is itself a directory but holds archived substrates; skip
		// the wrapper dir itself (the items inside are not directly switchable).
		if (name === "archive") continue;
		if (!fs.existsSync(path.join(fullPath, "config.json"))) continue;
		out.push({ name, isActive: activeContextDir === name });
	}
	return out;
}

/**
 * Move a substrate dir to `archive/<name>/`. Shared engine behind
 * `/context archive <dir>` and the `context-archive` Pi tool.
 *
 * Safety preconditions:
 * 1. Target dir must NOT be the active substrate (the dir the bootstrap
 *    pointer currently names). Archiving the active substrate would leave
 *    the resolver pointing at a non-existent path.
 * 2. Target dir must exist + must have a config.json (refuses to archive a
 *    non-substrate dir).
 * 3. `archive/<name>/` must not already exist (refuses to clobber a prior
 *    archive of the same name).
 *
 * Creates `archive/` if absent. Uses `fs.renameSync` for atomicity on the
 * same filesystem.
 */
export function archiveSubstrate(cwd: string, targetDir: string): { from: string; to: string } {
	const bootstrapPath = path.join(cwd, ".pi-context.json");
	if (fs.existsSync(bootstrapPath)) {
		try {
			const raw = fs.readFileSync(bootstrapPath, "utf-8");
			const pointer = JSON.parse(raw) as { contextDir?: unknown };
			if (pointer.contextDir === targetDir) {
				throw new Error(
					`/context archive: refuses to archive '${targetDir}' — it is the ACTIVE substrate (the bootstrap pointer names it). Switch to a different substrate first with '/context switch <other-dir>' or '/context switch -c <new-dir>' before archiving '${targetDir}'.`,
				);
			}
		} catch (err) {
			// Propagate the structural-refuse error verbatim; tolerate other
			// read-errors (a malformed pointer should not block archival of an
			// unrelated dir).
			if (err instanceof Error && err.message.startsWith("/context archive: refuses")) throw err;
		}
	}

	const sourcePath = path.join(cwd, targetDir);
	if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isDirectory()) {
		throw new Error(`/context archive: target dir '${targetDir}' does not exist at ${sourcePath}`);
	}
	if (!fs.existsSync(path.join(sourcePath, "config.json"))) {
		throw new Error(
			`/context archive: target dir '${targetDir}' has no config.json — refuses to archive a non-substrate dir (use rm or git mv directly for non-substrate cleanup)`,
		);
	}

	const archiveRoot = path.join(cwd, "archive");
	if (!fs.existsSync(archiveRoot)) fs.mkdirSync(archiveRoot, { recursive: true });

	const destPath = path.join(archiveRoot, targetDir);
	if (fs.existsSync(destPath)) {
		throw new Error(
			`/context archive: archive/${targetDir} already exists at ${destPath} — refuses to clobber a prior archive of the same name. Rename or remove the prior archive first.`,
		);
	}

	fs.renameSync(sourcePath, destPath);
	return { from: path.relative(cwd, sourcePath), to: path.relative(cwd, destPath) };
}

/**
 * /context switch — handler for the slash command surface. Parses args for
 * the three subforms: `-c <new-dir>` (bootstrap new + flip), `-` (flip to
 * previous_contextDir), bare `<existing-dir>` (flip to existing substrate).
 */
function handleSwitch(args: string, ctx: ExtensionCommandContext): void {
	const trimmed = args.trim();
	if (trimmed.length === 0) {
		ctx.ui.notify("Usage: /context switch <existing-dir> | /context switch -c <new-dir> | /context switch -", "error");
		return;
	}

	const tokens = trimmed.split(/\s+/);
	const writerIdentity = resolveSlashCommandWriter(ctx);

	try {
		if (tokens[0] === "-c") {
			const target = tokens[1];
			if (!target) {
				ctx.ui.notify("Usage: /context switch -c <new-dir>", "error");
				return;
			}
			const { created } = switchAndCreate(ctx.cwd, target, writerIdentity);
			const createdLine = created.length > 0 ? ` (created: ${created.join(", ")})` : "";
			ctx.ui.notify(
				`Switched bootstrap pointer to new substrate '${target}'${createdLine}. The substrate now carries a skeleton config (schema-valid, empty of vocabulary). Two onward paths: /context accept-all (adopt the packaged catalog, then /context install) OR amend-config / edit config.json (build a custom vocabulary).`,
				"info",
			);
			return;
		}
		if (tokens[0] === "-") {
			const { from, to } = switchToPrevious(ctx.cwd, writerIdentity);
			ctx.ui.notify(`Switched bootstrap pointer from '${from}' back to '${to}' (previous_contextDir).`, "info");
			return;
		}
		// Bare dir name — flip to an existing substrate.
		switchToExisting(ctx.cwd, tokens[0], writerIdentity);
		ctx.ui.notify(`Switched bootstrap pointer to existing substrate '${tokens[0]}'.`, "info");
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		ctx.ui.notify(msg, "error");
	}
}

/**
 * /context list — enumerate substrate dirs in the cwd (top-level dirs
 * containing a config.json). Marks the active one (the dir the bootstrap
 * pointer names).
 */
function handleList(_args: string, ctx: ExtensionCommandContext): void {
	const subs = listSubstrates(ctx.cwd);
	if (subs.length === 0) {
		ctx.ui.notify(
			"No substrate dirs found under cwd (no top-level dir contains config.json). Run /context init <dir> + /context accept-all to bootstrap one.",
			"info",
		);
		return;
	}
	const lines = subs.map((s) => (s.isActive ? `* ${s.name} (active)` : `  ${s.name}`));
	ctx.ui.notify(lines.join("\n"), "info");
}

/**
 * /context archive — move a substrate dir to archive/<dir>/. Refuses to
 * archive the active substrate; refuses to clobber a prior archive of the
 * same name.
 */
function handleArchive(args: string, ctx: ExtensionCommandContext): void {
	const targetDir = args.trim().split(/\s+/)[0];
	if (!targetDir) {
		ctx.ui.notify("Usage: /context archive <dir>", "error");
		return;
	}
	try {
		const { from, to } = archiveSubstrate(ctx.cwd, targetDir);
		ctx.ui.notify(`Archived substrate '${from}' to '${to}'.`, "info");
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		ctx.ui.notify(msg, "error");
	}
}

// ── Extension factory ───────────────────────────────────────────────────────

const extension = (pi: ExtensionAPI) => {
	// ── Update check on session start (non-blocking) ───────────────────
	pi.on("session_start", async (_event, ctx) => {
		checkForUpdates((msg, level) => ctx.ui.notify(msg, level)).catch(() => {});
	});

	// ── Eager framework guidance ────────────────────────────
	// Append (never replace) the orientation block to the assembled system
	// prompt so the in-pi agent receives a topic→tool-call map up front.
	// The runtime chains extensions' systemPrompt outputs; returning the
	// augmented prompt preserves pi-core's prompt + other extensions, and
	// returning nothing would reset to base.
	pi.on("before_agent_start", (event) => ({
		systemPrompt: `${event.systemPrompt}\n\n${buildOrientationBlock()}`,
	}));

	// Surface the packaged pi-context skill directory to the runtime.
	pi.on("resources_discover", () => ({ skillPaths: [skillsDir()] }));

	// ── Register substrate tools from the op-registry ────────────────────
	// The 45 substrate tool definitions live in ops-registry.ts as
	// OpDefinitions; registerAll iterates them and registers each as a pi tool
	// under a uniform execute wrapper. Behavior-identical to the prior inline
	// per-tool registrations that previously occupied this region.
	registerAll(pi);

	// ── Command: /context ──────────────────────────────────────────────────

	interface SubcommandEntry {
		description: string;
		handler: (args: string, ctx: ExtensionCommandContext) => Promise<void> | void;
		getCompletions?: (argPrefix: string) => Array<{ value: string; label: string; description?: string }> | null;
	}

	const CONTEXT_SUBCOMMANDS: Record<string, SubcommandEntry> = {
		init: {
			description: "Initialize the substrate dir (bootstrap pointer + dirs only; run accept-all + install to populate)",
			handler: (args, ctx) => handleInit(args, ctx),
		},
		switch: {
			description:
				"Flip the bootstrap pointer (parallel to git switch). Forms: '<existing-dir>' (flip to existing substrate) | '-c <new-dir>' (bootstrap new + flip) | '-' (flip back to previous_contextDir)",
			handler: (args, ctx) => handleSwitch(args, ctx),
		},
		list: {
			description: "Enumerate top-level dirs containing config.json (switchable substrates); marks the active one",
			handler: (args, ctx) => handleList(args, ctx),
		},
		archive: {
			description:
				"Move a non-active substrate dir to archive/<dir>/ (refuses to archive the active substrate or clobber an existing archive)",
			handler: (args, ctx) => handleArchive(args, ctx),
		},
		install: {
			description:
				"Copy schemas and starter blocks declared in the substrate dir's config.json from the package samples catalog",
			handler: (args, ctx) => {
				const overwrite = /(^|\s)--update(\s|$)/.test(args);
				const result = installContext(ctx.cwd, { overwrite });
				if (result.error) {
					ctx.ui.notify(result.error, "error");
					return;
				}
				const lines: string[] = [];
				if (result.installed.length > 0) {
					lines.push(`Installed (${result.installed.length}): ${result.installed.join(", ")}`);
				}
				if (result.updated.length > 0) {
					lines.push(`Updated (${result.updated.length}): ${result.updated.join(", ")}`);
				}
				if (result.resynced.length > 0) {
					lines.push(`Re-synced (${result.resynced.length}): ${result.resynced.join(", ")}`);
				}
				if (result.migrated.length > 0) {
					lines.push(
						`Migrated (${result.migrated.length}, schema bumped — block items forward-migrated): ${result.migrated.join(", ")}`,
					);
				}
				if (result.blocked.length > 0) {
					lines.push(
						`Blocked (${result.blocked.length}, no safe migration — left unchanged): ${result.blocked.join(", ")}`,
					);
				}
				if (result.preserved.length > 0) {
					lines.push(
						`Preserved (${result.preserved.length}, populated — block data is never overwritten): ${result.preserved.join(", ")}`,
					);
				}
				if (result.skipped.length > 0) {
					lines.push(
						`Skipped (${result.skipped.length}, exists — pass --update to overwrite): ${result.skipped.join(", ")}`,
					);
				}
				if (result.notFound.length > 0) {
					lines.push(`Not found in samples catalog (${result.notFound.length}): ${result.notFound.join(", ")}`);
				}
				if (lines.length === 0) {
					lines.push(
						"Nothing declared in installed_schemas / installed_blocks — edit the substrate dir's config.json to add entries.",
					);
				}
				const level = result.notFound.length > 0 || result.blocked.length > 0 ? "warning" : "info";
				ctx.ui.notify(lines.join("\n"), level);
			},
		},
		"check-status": {
			description: "Preview installed-vs-catalog schema drift (read-only; writes nothing)",
			handler: (_args, ctx) => {
				ctx.ui.notify(renderCheckStatus(checkStatus(ctx.cwd)), "info");
			},
		},
		"accept-all": {
			description: "Adopt the canonical packaged conception as config.json (writes config only; run install after)",
			handler: (args, ctx) => handleAcceptAll(args, ctx),
		},
		view: {
			description: "Render a configured lens view (groupByLens projection) into the conversation",
			handler: (args, ctx) => {
				const lensId = args.trim().split(/\s+/)[0];
				if (!lensId) {
					ctx.ui.notify("Usage: /context view <lensId>", "error");
					return;
				}
				const result = loadLensView(ctx.cwd, lensId);
				if ("error" in result) {
					ctx.ui.notify(result.error, "error");
					return;
				}
				const config = loadContext(ctx.cwd).config;
				ctx.ui.notify(renderLensView(result, config?.naming), "info");
			},
		},
		"lens-curate": {
			description: "Walk uncategorized items in a lens and surface bin-assignment suggestions for the LLM to act on",
			handler: (args, ctx) => {
				const lensId = args.trim().split(/\s+/)[0];
				if (!lensId) {
					ctx.ui.notify("Usage: /context lens-curate <lensId>", "error");
					return;
				}
				const result = loadLensView(ctx.cwd, lensId);
				if ("error" in result) {
					ctx.ui.notify(result.error, "error");
					return;
				}
				if (result.uncategorized.length === 0) {
					ctx.ui.notify(`Lens '${lensId}' has no uncategorized items — nothing to curate.`, "info");
					return;
				}
				pi.sendMessage(
					{
						customType: "context-lens-curate",
						content: buildCurationSuggestions(result),
						display: false,
					},
					{
						triggerTurn: true,
						deliverAs: "followUp",
					},
				);
			},
		},
		"roadmap-view": {
			description:
				"Render the derived roadmap as pure-textual markdown (milestone order over authored milestone_precedes_milestone edges, per-milestone phase/task rollups, adjacency strictly from edges). NO mermaid.",
			handler: (_args, ctx) => {
				const view = loadRoadmap(ctx.cwd);
				if ("error" in view) {
					ctx.ui.notify(view.error, "error");
					return;
				}
				ctx.ui.notify(renderRoadmap(view), "info");
			},
		},
		"roadmap-validate": {
			description: "Validate the derived milestone roadmap — surfaces structured issues (error/warning/info codes)",
			handler: (_args, ctx) => {
				const result = validateRoadmap(ctx.cwd);
				if (result.issues.length === 0) {
					ctx.ui.notify("✓ Roadmap validation passed.", "info");
					return;
				}
				const lines = result.issues.map((i) => {
					const where = `${i.milestone_id ? ` ${i.milestone_id}` : ""}${i.phase_id ? ` ${i.phase_id}` : ""}`;
					return `✗ [${i.code}]${where}: ${i.message}`;
				});
				const level = result.status === "invalid" ? "error" : result.status === "warnings" ? "warning" : "info";
				ctx.ui.notify(lines.join("\n"), level);
			},
		},
		status: {
			description: "Show derived project state",
			handler: (_args, ctx) => handleStatus(ctx, pi),
		},
		"add-work": {
			description: "Extract conversation items into project blocks",
			handler: (args, ctx) => handleAddWork(args, ctx, pi),
			getCompletions: (argPrefix) => {
				const blocks = findAppendableBlocks(process.cwd());
				return blocks
					.filter((b) => b.block.startsWith(argPrefix))
					.map((b) => ({ value: b.block, label: b.block, description: `array: ${b.arrayKey}` }));
			},
		},
		validate: {
			description: "Check cross-block referential integrity",
			handler: (_args, ctx) => {
				const result = validateContext(ctx.cwd);
				const errors = result.issues.filter((i) => i.severity === "error").length;
				const warnings = result.issues.filter((i) => i.severity === "warning").length;
				const statusIcon = result.status === "clean" ? "\u2713" : result.status === "warnings" ? "\u26a0" : "\u2717";
				const lines: string[] = [];
				if (result.status === "clean") {
					lines.push(`${statusIcon} Project validation passed — no cross-block reference issues.`);
				} else {
					for (const issue of result.issues) {
						const icon = issue.severity === "error" ? "\u2717" : "\u26a0";
						const locator = issue.field ?? issue.code ?? "(no locator)";
						lines.push(`${icon} [${issue.block}] ${locator}: ${issue.message}`);
					}
					lines.push("");
					lines.push(`${statusIcon} ${errors} error(s), ${warnings} warning(s)`);
				}
				const level = result.status === "invalid" ? "error" : result.status === "warnings" ? "warning" : "info";
				ctx.ui.notify(lines.join("\n"), level);
			},
		},
		help: {
			description: "Show available subcommands",
			handler: (_args, ctx) => {
				const lines = ["Usage: /context <subcommand> [args]", ""];
				for (const [name, entry] of Object.entries(CONTEXT_SUBCOMMANDS)) {
					lines.push(`  ${name.padEnd(12)} ${entry.description}`);
				}
				ctx.ui.notify(lines.join("\n"), "info");
			},
		},
	};

	pi.registerCommand("context", {
		description: "Context state management",
		getArgumentCompletions: (prefix: string) => {
			const tokens = prefix.split(/\s+/);
			const partial = tokens[tokens.length - 1];

			if (tokens.length <= 1) {
				return Object.entries(CONTEXT_SUBCOMMANDS)
					.filter(([name]) => name.startsWith(partial))
					.map(([name, entry]) => ({ value: name, label: name, description: entry.description }));
			}

			const subName = tokens[0];
			const sub = CONTEXT_SUBCOMMANDS[subName];
			if (sub?.getCompletions) {
				const argPrefix = tokens.slice(1).join(" ");
				const items = sub.getCompletions(argPrefix);
				if (items) {
					return items.map((item) => ({ ...item, value: `${subName} ${item.value}` }));
				}
			}

			return null;
		},

		async handler(args: string, ctx: ExtensionCommandContext) {
			const trimmed = args.trim();
			const spaceIdx = trimmed.indexOf(" ");
			const subcommand = spaceIdx === -1 ? trimmed || "status" : trimmed.slice(0, spaceIdx);
			const rest = spaceIdx === -1 ? "" : trimmed.slice(spaceIdx + 1);

			const entry = CONTEXT_SUBCOMMANDS[subcommand];
			if (!entry) {
				const names = Object.keys(CONTEXT_SUBCOMMANDS).join(", ");
				ctx.ui.notify(`Unknown subcommand: ${subcommand}. Available: ${names}`, "warning");
				return;
			}

			await entry.handler(rest, ctx);
		},
	});
};

export default extension;

// Re-export the config-registry-propagation surface so
// consumers can type `UpdateResult.registryAdditions` and call the pure merge
// helper against the public `@davidorex/pi-context` surface.
// mergeCatalogRegistries + the edge-orientation helpers
// (counterEndpoint / primaryEndpoint — the single source of truth for reading a
// relation's primary/counter endpoint under its config-declared role_direction).
export { counterEndpoint, mergeCatalogRegistries, primaryEndpoint, type RegistryAdditions } from "./context.js";
export {
	contextRegistryPath,
	invalidateRegistry,
	loadRegistry,
	REGISTRY_FILE_VERSION,
	type RegistryEntry,
	type RegistryFile,
	registerSubstrate,
	resolveAlias,
	resolveSubstrateDir,
	writeRegistry,
} from "./context-registry.js";
export type { CompleteTaskResult, ItemLocation, ResolvedRef, ResolveStatus } from "./context-sdk.js";
// Re-export for consumers
export {
	blockStructure,
	buildIdIndex,
	CONTEXT_BLOCK_TYPES,
	completeTask,
	findAppendableBlocks,
	resolveItemById,
	resolveRef,
	schemaInfo,
	schemaVocabulary,
} from "./context-sdk.js";
export { type RenameKind, type RenameReport, renameCanonicalId } from "./rename-canonical-id.js";
export {
	loadRoadmap,
	type MilestoneRoadmapView,
	type MilestoneView,
	type PhaseRollupView,
	type PhaseStatus,
	renderRoadmap,
	resolveStatusVocabulary,
	rollupPhaseStatus,
	type TaskRow,
	topoSort,
	validateRoadmap,
} from "./roadmap-plan.js";
// Re-export the 3-way merge conflict type so cross-package consumers (the
// pi-context-cli conflict resolver) can type `UpdateResult.conflicts`
// against the public `@davidorex/pi-context` surface without reaching into the
// unexported `./schema-merge` subpath.
export type { SchemaConflict } from "./schema-merge.js";
