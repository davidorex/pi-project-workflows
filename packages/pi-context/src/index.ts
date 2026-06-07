/**
 * Extension entry point for pi-context — registers block tools and the
 * /context command for project state management.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { forEachBlockArray, readBlock, readBlockForDir, writeBlockForDir } from "./block-api.js";
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
	migrationsPathForDir,
	resolveContextDir,
	SCHEMAS_DIR,
	schemasDir,
	tryResolveContextDir,
	writeBootstrapPointer,
} from "./context-dir.js";
import { contextState, findAppendableBlocks, validateContext } from "./context-sdk.js";
import { cleanGitEnv } from "./git-env.js";
import { buildCurationSuggestions, loadLensView, renderLensView } from "./lens-view.js";
import { getProjectMigrationRegistryForDir, invalidateMigrationRegistryForDir } from "./migration-registry-loader.js";
import { appendMigrationDeclForDir, loadMigrationsFileForDir, type MigrationDecl } from "./migrations-store.js";
import { getObject, putObject } from "./object-store.js";
import { registerAll } from "./ops-registry.js";
import { buildOrientationBlock, skillsDir } from "./orientation.js";
import { listRoadmaps, loadRoadmap, renderRoadmap, validateRoadmaps } from "./roadmap-plan.js";
import { mergeSchema, type SchemaConflict } from "./schema-merge.js";
import { validateBlockWithMigrationForDir } from "./schema-validator.js";
import { writeSchemaCheckedForDir } from "./schema-write.js";
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
	/**
	 * FGAP-029 safe re-sync (slice S4) — SCHEMA --update outcomes.
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
 * Migration-aware re-sync of ONE installed schema under `/context install
 * --update` (FGAP-029 safe re-sync, slice S4). Replaces the blind
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
): "resynced" | "migrated" | "blocked" {
	const catalogVersion = readDeclaredVersion(sourceFile);
	const installedVersion = readDeclaredVersion(destFile);

	// (A) Same version (or either version unreadable / non-versioned): there is no
	// version transition to migrate across, so the drift is description-only —
	// safe to overwrite the schema verbatim. Items are unaffected by a same-
	// version schema body change (the version is the migration contract).
	if (installedVersion === catalogVersion || catalogVersion === undefined || installedVersion === undefined) {
		fs.copyFileSync(sourceFile, destFile);
		return "resynced";
	}

	// (B) Version bump — migrate-or-refuse. installedVersion ≠ catalogVersion,
	// both defined. The chain is sought in the catalog's OWN migrations.json so
	// the declarations and the schema versions stay coherent.
	const chain = findCatalogMigrationChain(samplesRoot, name, installedVersion, catalogVersion);
	if (chain === null) {
		// No shipped chain reaches the catalog version → refuse, leave unchanged.
		return "blocked";
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
	const present = new Set((existing?.migrations ?? []).map((m) => `${m.schemaName} ${m.fromVersion}`));
	for (const decl of chain) {
		const key = `${decl.schemaName} ${decl.fromVersion}`;
		if (present.has(key)) continue;
		appendMigrationDeclForDir(destRoot, decl);
		present.add(key);
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
		return "migrated";
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
		return "migrated";
	} catch {
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
		return "blocked";
	}
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
		if (!destExists) {
			// Fresh install — no installed copy yet, so there are no items to
			// migrate. Copy the catalog schema verbatim (unchanged behaviour).
			fs.copyFileSync(sourceFile, destFile);
			result.installed.push(relDest);
			continue;
		}
		// destExists && overwrite — migration-aware schema re-sync (FGAP-029 S4).
		// resyncSchema decides between same-version overwrite, version-bump
		// forward-migration, and refuse-and-leave-unchanged; it never strands the
		// block's items under a schema they fail.
		const outcome = resyncSchema(destRoot, samplesRoot, sourceFile, destFile, name);
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
			const content_hash = computeFileContentHash(destSchemaFile);
			// Base-stamp (TASK-035 / FEAT-006 T2): persist the as-installed schema body
			// into the content-addressed object store keyed by its install-baseline
			// content_hash, so the merge base is retrievable later (TASK-036 precondition).
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
 * The per-schema action plan produced by `updateContext` (FEAT-006 T1 — TASK-034 /
 * DEC-0017). `updateContext` classifies every installed schema via the read-only
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
 *     file was edited on disk. This first increment (DEC-0017) REFUSES to
 *     overwrite a locally-modified schema: no `resyncSchema` call, no copy, no
 *     write of any kind for these. The schema name is recorded here so the
 *     operator can reconcile; an automatic three-way merge is the deferred
 *     follow-on (TASK-036), out of scope for T1.
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
	/** `locally-modified` / `both-diverged` schemas — refused, never overwritten (DEC-0017). */
	refused: string[];
	/**
	 * `locally-modified` / `both-diverged` schemas whose recorded base, local
	 * body, and catalog body merged conflict-free (TASK-036 — FEAT-006 T3). The
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
}

/**
 * `/context update` engine (FEAT-006 T1 — TASK-034 / DEC-0017). Brings the
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
 *                            (DEC-0017) never clobbers a locally-edited schema; the
 *                            three-way merge is deferred (TASK-036).
 *                            [TASK-036 — FEAT-006 T3, now implemented]: the merge is no
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
 * plan is computed (every `catalog-ahead` schema is listed under `resynced` as the
 * would-act set, since the concrete resync outcome is only known by running it),
 * but `resyncSchema` is NOT invoked. The live path mutates only via `resyncSchema`
 * (the catalog-ahead branch); `installContext` and its install handler are NOT
 * touched. Resolves the catalog / dest paths through the SAME `resolveCatalog` +
 * `installedSchemaDestPath` helpers the installer + detector use.
 */
export function updateContext(cwd: string, { dryRun = false }: { dryRun?: boolean } = {}): UpdateResult {
	const result: UpdateResult = {
		dryRun,
		resynced: [],
		migrated: [],
		blocked: [],
		refused: [],
		merged: [],
		conflicts: [],
		reported: [],
		inSync: [],
	};

	const destRoot = tryResolveContextDir(cwd);
	if (destRoot === null) {
		result.error =
			"No .pi-context.json bootstrap pointer found. Run /context init <substrate-dir> first to bootstrap the substrate.";
		return result;
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

	for (const asset of report.perAsset) {
		const { name, state } = asset;
		switch (state) {
			case "in-sync":
				result.inSync.push(name);
				break;
			case "catalog-ahead": {
				if (dryRun) {
					// Preview only — never call resyncSchema (it writes). The concrete
					// resynced/migrated/blocked outcome is unknowable without running it,
					// so report the schema as the would-act (resynced) set.
					result.resynced.push(name);
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
				const outcome = resyncSchema(destRoot, samplesRoot, sourceFile, destFile, name);
				switch (outcome) {
					case "resynced":
						result.resynced.push(name);
						break;
					case "migrated":
						result.migrated.push(name);
						break;
					case "blocked":
						result.blocked.push(name);
						break;
				}
				break;
			}
			case "locally-modified":
			case "both-diverged": {
				// 3-way merge (TASK-036 — FEAT-006 T3): a locally-edited schema is no
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
					// fall back to refuse-and-report (DEC-0017) so the drift signal stays.
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

	// Baseline refresh for the schemas this run actually brought current. A resync
	// overwrites the installed schema file with the catalog source but does NOT, by
	// itself, refresh the recorded install baseline (config.installed_from.assets) —
	// so without this step a just-resynced schema would still read as drifted
	// (installed === catalog ≠ stale-baseline → both-diverged) on the next
	// check-status. Mirror installContext's post-loop baseline write, but SURGICALLY:
	// refresh ONLY the resynced/migrated assets so a `refused` (locally-modified)
	// schema KEEPS its drift signal (re-fingerprinting it would falsely mark it
	// in-sync). dryRun performs no writes, so it never refreshes.
	const brought_current = [...result.resynced, ...result.migrated, ...result.merged];
	if (!dryRun && brought_current.length > 0) {
		// Refresh the install baseline + base-stamp the body for each schema this run
		// actually brought current, via the shared `refreshBaselineForSchema` helper
		// (TASK-037 — FEAT-006 T4 DRY-out of the prior inline body). The helper owns
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

	return result;
}

/**
 * Reconstruct the three-way merge inputs for one `locally-modified` /
 * `both-diverged` schema (TASK-037 — FEAT-006 T4). Replicates EXACTLY the
 * base/ours/theirs resolution `updateContext`'s merge arm performs, so the
 * conflict RESOLVER reconciles against the SAME bodies the `update` op merged:
 *
 *   - BASE   = the content-addressed body stored under the install baseline's
 *              recorded `content_hash` (`getObject(destRoot, hash)`).
 *   - OURS   = the currently-installed schema file (`installedSchemaDestPath`).
 *   - THEIRS = the catalog's current schema file (`samplesRoot/<kind.schema_path>`,
 *              resolved via the SAME `resolveCatalog` map the installer + detector use).
 *
 * Returns `null` (never throws) when the substrate / config / catalog kind /
 * stamped base body is absent or any read/parse fails — the caller treats a
 * `null` as "no safe merge inputs, fall back to a report". Pure read; no writes.
 */
export function getConflictMergeInputs(
	cwd: string,
	name: string,
): { base: Record<string, unknown>; ours: Record<string, unknown>; theirs: Record<string, unknown> } | null {
	try {
		const destRoot = tryResolveContextDir(cwd);
		if (destRoot === null) return null;
		const config = loadConfig(cwd);
		if (!config) return null;
		const { samplesRoot, byId } = resolveCatalog();
		const kind = byId.get(name);
		if (!kind) return null;
		const baseHash = config.installed_from?.assets?.[name]?.content_hash;
		if (!baseHash) return null;
		const base = getObject(destRoot, baseHash);
		if (!base) return null;
		const ours = JSON.parse(fs.readFileSync(installedSchemaDestPath(destRoot, name), "utf-8")) as Record<
			string,
			unknown
		>;
		const theirs = JSON.parse(fs.readFileSync(path.join(samplesRoot, kind.schema_path), "utf-8")) as Record<
			string,
			unknown
		>;
		return { base, ours, theirs };
	} catch {
		return null;
	}
}

/**
 * Re-stamp the install baseline (`config.installed_from.assets[name]`) for one
 * schema from its CURRENT on-disk body (TASK-037 — FEAT-006 T4). Self-contained
 * + idempotent: it owns its config load + write, so the conflict RESOLVER can
 * call it standalone after an interactive mergetool has (or has not) rewritten
 * the installed schema file:
 *
 *   - returns `false` (no write) when the installed schema file is absent, OR
 *     its freshly-computed `content_hash` already equals the recorded baseline
 *     hash (a true no-op — nothing was reconciled / written).
 *   - otherwise stamps the new body into the content-addressed object store
 *     (`putObject`) under its new `content_hash`, sets
 *     `config.installed_from.assets[name] = { content_hash, version }`, writes
 *     the config, and returns `true` — so a NON-equal new hash signals "the
 *     mergetool reconciled this schema" to the resolver's resolved/unresolved
 *     tally. Mirrors `updateContext`'s post-loop refresh body for ONE name.
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
	const body = JSON.parse(fs.readFileSync(destFile, "utf-8")) as { version?: string };
	putObject(destRoot, newHash, body as Record<string, unknown>);
	const installed_from = {
		...config.installed_from,
		at: new Date().toISOString(),
		assets: {
			...config.installed_from.assets,
			[name]: { content_hash: newHash, version: typeof body.version === "string" ? body.version : "" },
		},
	};
	writeConfig(cwd, { ...config, installed_from });
	return true;
}

/**
 * Render an `UpdateResult["conflicts"]` set as a readable conflict report
 * (TASK-037 — FEAT-006 T4) — the non-interactive resolution surface (mirrors
 * `renderCheckStatus`'s grouping style). One section per conflicting schema
 * `name`, then each irreconcilable `{ path, base, ours, theirs }` with its three
 * values JSON-compacted for a side-by-side scan. Pure: no I/O, no writes.
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
// Re-export the 3-way merge conflict type so cross-package consumers (the
// pi-context-cli conflict resolver, TASK-037) can type `UpdateResult.conflicts`
// against the public `@davidorex/pi-context` surface without reaching into the
// unexported `./schema-merge` subpath.
export type { SchemaConflict } from "./schema-merge.js";
