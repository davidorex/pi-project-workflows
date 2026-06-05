/**
 * Extension entry point for pi-context — registers block tools and the
 * /context command for project state management.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { forEachBlockArray, readBlock, readBlockForDir } from "./block-api.js";
import { computeFileContentHash } from "./content-hash.js";
import {
	type AdoptResult,
	adoptConception,
	type ConfigBlock,
	installedBlockDestPath,
	installedSchemaDestPath,
	loadConfig,
	loadContext,
	reconcileActiveSubstrateRegistration,
	writeConfig,
	writeSkeletonConfig,
} from "./context.js";
import {
	BootstrapNotFoundError,
	flipBootstrapPointer,
	resolveContextDir,
	SCHEMAS_DIR,
	schemasDir,
	tryResolveContextDir,
	writeBootstrapPointer,
} from "./context-dir.js";
import { contextState, findAppendableBlocks, validateContext } from "./context-sdk.js";
import { cleanGitEnv } from "./git-env.js";
import { buildCurationSuggestions, loadLensView, renderLensView } from "./lens-view.js";
import { registerAll } from "./ops-registry.js";
import { buildOrientationBlock, skillsDir } from "./orientation.js";
import { listRoadmaps, loadRoadmap, renderRoadmap, validateRoadmaps } from "./roadmap-plan.js";
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
 * declares a different `contextDir` than the caller is requesting. Pre-FGAP-179
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
 * (FGAP-067 / DEC-0011: init must not impose a catalog). Run accept-all to adopt
 * a config + install to materialize the declared assets. Shared by the /context
 * init command handler and the context-init tool.
 *
 * Hard-fail-on-mismatch (post-FGAP-179): when `.pi-context.json` already exists
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
		// (required per DEC-0015). writeBootstrapPointer is atomic + invalidates
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
	// Write the minimal schema-valid SKELETON config (FGAP-001 / DEC-0001) so the
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
}

/**
 * Resolve the package samples catalog once: the absolute `samplesRoot` plus a
 * `byId` map from each block_kind's `canonical_id` to its declared
 * `schema_path` / `data_path` (relative to `samplesRoot`). Shared read helper
 * extracted from `installContext` so the installer and the read-only
 * `checkStatus` drift detector resolve the catalog identically (no divergence).
 *
 * lazy fileURLToPath idiom (FGAP-088): import.meta.dirname is undefined under
 * tsx's CJS-interop dist-load; import.meta.url is not. Reads the conception once
 * for the canonical_id→paths map so callers resolve sources by the same
 * block_kind declarations the accept-all conception ships (DEC-0037/0038).
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
 * /context install opt-in mechanism (DEC-0011). Reads config.installed_schemas
 * and config.installed_blocks, copies declared assets from the package
 * samples catalog (samples/, keyed by conception.json's block_kinds) into the
 * project's substrate root + schemas dir.
 *
 *   - Default behavior is skip-if-exists. With overwrite=true, replaces the
 *     destination file and reports as "updated" rather than "installed".
 *   - Sources missing from the samples catalog are reported as "notFound".
 *   - Empty install lists are not an error — the result is a clean no-op.
 */
export function installContext(cwd: string, options: { overwrite?: boolean } = {}): InstallResult {
	const result: InstallResult = { installed: [], updated: [], skipped: [], notFound: [], preserved: [] };
	const overwrite = options.overwrite === true;

	const destRoot = tryResolveContextDir(cwd);
	if (destRoot === null) {
		result.error =
			"No .pi-context.json bootstrap pointer found. Run /context init <substrate-dir> first to bootstrap the substrate.";
		return result;
	}
	const config: ConfigBlock | null = loadConfig(cwd);
	if (!config) {
		result.error = "No config.json found in substrate dir — run /context init <substrate-dir> first.";
		return result;
	}

	// destRoot is resolver-aware via tryResolveContextDir(cwd) — it already
	// cascades through resolveContextDir under the hood (context-dir.ts).
	// SCHEMAS_DIR is composed as a bare segment off that
	// resolver-aware root; this is intentional and DEC-0015-compliant
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
		fs.copyFileSync(sourceFile, destFile);
		(destExists ? result.updated : result.installed).push(relDest);
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
			// Block-data preservation (FGAP-029 safe re-sync): never copy a catalog
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
			fs.copyFileSync(sourceFile, destFile);
			result.updated.push(relDest);
			continue;
		}
		fs.copyFileSync(sourceFile, destFile);
		result.installed.push(relDest);
	}

	// ── Install baseline of the installed SCHEMAS (FGAP-029 safe re-sync) ──────
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
			assets[name] = {
				content_hash: computeFileContentHash(destSchemaFile),
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
 * PURE-READ drift detector for `/context check-status` (FGAP-029 safe
 * re-sync, slice S3). Compares, per installed schema, the S2 install baseline
 * against the catalog's current schema file and the currently-installed schema
 * file, classifies the drift, and RETURNS the report. Writes NOTHING anywhere —
 * no config write, no file copy, no mkdir; only reads.
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

		perAsset.push({
			name,
			state,
			baseline_version: baselineAsset?.version,
			catalog_version: catalogVersion,
			installed_modified,
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
		const names = report.perAsset.filter((a) => a.state === state).map((a) => a.name);
		if (names.length === 0) continue;
		lines.push(`  ${state} (${names.length}): ${names.join(", ")}`);
	}
	if (report.perAsset.length === 0) {
		lines.push("  (no installed schemas declared — nothing to compare)");
	}
	lines.push(`Total: ${report.summary.total} schema(s).`);
	return lines.join("\n");
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
 * (no asset materialization — run /context install after). Skeleton-aware
 * (FGAP-001 / DEC-0001): overwrites a SKELETON config (the empty-of-vocabulary
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
	// Write the minimal schema-valid SKELETON config (FGAP-001 / DEC-0001) so the
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

	// ── Eager framework guidance (FGAP-090) ────────────────────────────
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
				const level = result.notFound.length > 0 ? "warning" : "info";
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
		"roadmap-list": {
			description: "List every roadmap in <config.root>/roadmap.json with id, title, status, and phase count",
			handler: (_args, ctx) => {
				const list = listRoadmaps(ctx.cwd);
				if (list.length === 0) {
					ctx.ui.notify(
						"No roadmaps found. Install the roadmap block via the substrate dir's config.json installed_blocks, then author roadmap.json.",
						"info",
					);
					return;
				}
				const lines = list.map(
					(r) =>
						`${r.id} [${r.status ?? "(unspecified)"}] ${r.title} (${r.phaseCount} phase${r.phaseCount === 1 ? "" : "s"})`,
				);
				ctx.ui.notify(lines.join("\n"), "info");
			},
		},
		"roadmap-view": {
			description:
				"Render a roadmap as pure-textual markdown (phase order, per-phase adjacency from authored phase_depends_on edges, status rollup, milestone resolution). NO mermaid.",
			handler: (args, ctx) => {
				const roadmapId = args.trim().split(/\s+/)[0];
				if (!roadmapId) {
					ctx.ui.notify("Usage: /context roadmap-view <ROADMAP-id>", "error");
					return;
				}
				const view = loadRoadmap(ctx.cwd, roadmapId);
				if ("error" in view) {
					ctx.ui.notify(view.error, "error");
					return;
				}
				const naming = loadContext(ctx.cwd).config?.naming;
				ctx.ui.notify(renderRoadmap(view, naming), "info");
			},
		},
		"roadmap-validate": {
			description: "Validate every roadmap (or a single one when ROADMAP-id supplied) — surfaces structured issues",
			handler: (args, ctx) => {
				const roadmapId = args.trim().split(/\s+/)[0] || undefined;
				const result = validateRoadmaps(ctx.cwd);
				const filtered = roadmapId
					? result.issues.filter((i) => !i.roadmap_id || i.roadmap_id === roadmapId)
					: result.issues;
				if (filtered.length === 0) {
					ctx.ui.notify(`✓ Roadmap validation passed${roadmapId ? ` for ${roadmapId}` : ""}.`, "info");
					return;
				}
				const lines = filtered.map((i) => `✗ [${i.code}] ${i.roadmap_id ?? ""}/${i.phase_id ?? ""}: ${i.message}`);
				const level = result.status === "invalid" ? "error" : "warning";
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
	listRoadmaps,
	loadRoadmap,
	type PhaseSpec,
	type PhaseStatus,
	type PhaseView,
	type RoadmapSpec,
	type RoadmapView,
	renderRoadmap,
	resolveStatusVocabulary,
	rollupPhaseStatus,
	topoSort,
	validateRoadmaps,
} from "./roadmap-plan.js";
