/**
 * Extension entry point for pi-context — registers block tools and the
 * /context command for project state management.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
	AgentToolResult,
	AgentToolUpdateCallback,
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
	appendToBlock,
	appendToNestedArray,
	nextId,
	readBlock,
	readBlockDir,
	removeFromBlock,
	removeFromNestedArray,
	updateItemInBlock,
	updateNestedArrayItem,
	writeBlock,
} from "./block-api.js";
import {
	type AdoptResult,
	adoptConception,
	amendConfigEntry,
	appendRelation,
	type ConfigBlock,
	type Edge,
	installedBlockDestPath,
	installedSchemaDestPath,
	loadConfig,
	loadContext,
} from "./context.js";
import {
	BootstrapNotFoundError,
	resolveContextDir,
	SCHEMAS_DIR,
	schemaPath,
	schemasDir,
	tryResolveContextDir,
	writeBootstrapPointer,
} from "./context-dir.js";
import {
	completeTask,
	contextState,
	currentState,
	deriveBootstrapState,
	filterBlockItems,
	findAppendableBlocks,
	type ItemLocation,
	joinBlocks,
	readBlockItem,
	readBlockPage,
	resolveItemById,
	resolveItemsByIds,
	validateContext,
} from "./context-sdk.js";
import { gatherExecutionContext } from "./execution-context.js";
import {
	buildCurationSuggestions,
	edgesForLensByName,
	findReferencesInRepo,
	loadLensView,
	renderLensView,
	validateContextRelations,
	walkAncestorsByLens,
	walkLensDescendants,
} from "./lens-view.js";
import { buildOrientationBlock, skillsDir } from "./orientation.js";
import { addressInto, serializeForRead } from "./read-element.js";
import { renameCanonicalId } from "./rename-canonical-id.js";
import { listRoadmaps, loadRoadmap, type RoadmapView, renderRoadmap, validateRoadmaps } from "./roadmap-plan.js";
import { samplesCatalog } from "./samples-catalog.js";
import { readSchema, writeSchemaChecked } from "./schema-write.js";
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
		lines.push(`- **Handoff:** active (.project/handoff.json)`);
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
			"No .pi-context.json bootstrap pointer found. Run /context init first to bootstrap the substrate.",
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
 * Initialize the substrate dir: write the bootstrap pointer and scaffold the
 * substrate + schemas directories ONLY. No schema/block assets are copied here
 * (FGAP-067 / DEC-0011: init must not impose a catalog). Run accept-all to adopt
 * a config + install to materialize the declared assets. Idempotent: skips
 * directories that already exist. Shared by the /context init command handler
 * and the context-init tool.
 */
function initProject(cwd: string, contextDir: string): { created: string[]; skipped: string[] } {
	// FIRST action — write the `.pi-context.json` bootstrap pointer carrying
	// the caller-supplied `contextDir` (required per DEC-0015) so every
	// subsequent path-builder call (projectDir / schemasDir) resolves through
	// the freshly-written pointer rather than throwing BootstrapNotFoundError.
	// writeBootstrapPointer is idempotent (atomic tmp+rename) so re-running
	// initProject after a prior init does not corrupt the pointer.
	if (!fs.existsSync(path.join(cwd, ".pi-context.json"))) writeBootstrapPointer(cwd, contextDir);
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
	const result: InstallResult = { installed: [], updated: [], skipped: [], notFound: [] };
	const overwrite = options.overwrite === true;

	const destRoot = tryResolveContextDir(cwd);
	if (destRoot === null) {
		result.error = "No .pi-context.json bootstrap pointer found. Run /context init first to bootstrap the substrate.";
		return result;
	}
	const config: ConfigBlock | null = loadConfig(cwd);
	if (!config) {
		result.error = "No config.json found in substrate dir — run /context init first.";
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

	// lazy fileURLToPath idiom (FGAP-088): import.meta.dirname is undefined under
	// tsx's CJS-interop dist-load; import.meta.url is not. Read the conception once for
	// the canonical_id→paths map so install resolves sources by the same
	// block_kind declarations the accept-all conception ships (DEC-0037/0038).
	const samplesRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "samples");
	const conception = JSON.parse(fs.readFileSync(path.join(samplesRoot, "conception.json"), "utf-8")) as {
		block_kinds?: Array<{ canonical_id: string; schema_path: string; data_path: string }>;
	};
	const byId = new Map<string, { schema_path: string; data_path: string }>();
	for (const bk of conception.block_kinds ?? []) {
		byId.set(bk.canonical_id, { schema_path: bk.schema_path, data_path: bk.data_path });
	}

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
		if (destExists && !overwrite) {
			result.skipped.push(relDest);
			continue;
		}
		fs.copyFileSync(sourceFile, destFile);
		(destExists ? result.updated : result.installed).push(relDest);
	}

	return result;
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
			"/context init requires a substrate dir name (e.g. '/context init .project' or '/context init .context'). Per DEC-0015, no default.",
			"error",
		);
		return;
	}

	const { created, skipped } = initProject(ctx.cwd, contextDir);

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

	ctx.ui.notify(lines.join("\n"), "info");
}

/**
 * /context accept-all — adopt the canonical packaged conception
 * (samples/conception.json) as this substrate's config.json. Writes config only
 * (no asset materialization — run /context install after). Idempotent: never
 * overwrites an existing config. Requires the substrate to be initialized first
 * (a bootstrap pointer must exist).
 */
function handleAcceptAll(_args: string, ctx: ExtensionCommandContext): void {
	let r: AdoptResult;
	try {
		r = adoptConception(ctx.cwd);
	} catch (err) {
		if (err instanceof BootstrapNotFoundError) {
			ctx.ui.notify("Run /context init <dir> first", "error");
			return;
		}
		throw err;
	}
	if (!r.adopted) {
		ctx.ui.notify("config.json already present — not overwritten.", "info");
		return;
	}
	ctx.ui.notify(
		`Adopted canonical config (root: ${r.root}, ${r.schemaCount} schemas / ${r.blockCount} blocks declared). Run /context install to materialize them.`,
		"info",
	);
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

	// ── Tool: append-block-item ─────────────────────────────────────────

	pi.registerTool({
		name: "append-block-item",
		label: "Append Block Item",
		description:
			"Append an item to an array in a project block file. Schema validation is automatic. Set autoId:true to allocate the next id from the block's id pattern when the item has no id.",
		promptSnippet: "Append items to project blocks (issues, decisions, or any user-defined block)",
		parameters: Type.Object({
			block: Type.String({ description: "Block name (e.g., 'issues', 'decisions')" }),
			arrayKey: Type.String({ description: "Array key in the block (e.g., 'issues', 'decisions')" }),
			item: Type.Unknown({ description: "Item object to append — must conform to block schema" }),
			autoId: Type.Optional(
				Type.Boolean({
					description: "When true and the item has no id, allocate the next id from the block's id pattern",
				}),
			),
		}),
		async execute(
			_toolCallId: string,
			params: { block: string; arrayKey: string; item: Record<string, unknown>; autoId?: boolean },
			_signal: AbortSignal,
			_onUpdate: AgentToolUpdateCallback,
			ctx: ExtensionContext,
		): Promise<AgentToolResult<undefined>> {
			// Type.Unknown() params may arrive as JSON strings — parse if needed
			if (typeof params.item === "string") {
				try {
					params.item = JSON.parse(params.item) as Record<string, unknown>;
				} catch {
					throw new Error(`item parameter must be a JSON object, got unparseable string`);
				}
			}
			// Auto-id allocation (FGAP-084 dual-surface twin of file-block-item --auto-id)
			if (params.autoId && params.item && typeof params.item === "object" && !params.item.id) {
				params.item.id = nextId(ctx.cwd, params.block);
			}
			// Duplicate check if item has an id field
			if (params.item && typeof params.item === "object" && "id" in params.item) {
				try {
					const data = readBlock(ctx.cwd, params.block) as Record<string, unknown>;
					const arr = data[params.arrayKey];
					if (Array.isArray(arr) && arr.some((i: Record<string, unknown>) => i.id === params.item.id)) {
						throw new Error(`Item '${params.item.id}' already exists in ${params.block}.${params.arrayKey}`);
					}
				} catch (e) {
					/* Re-throw duplicate errors; swallow block-not-found */
					if (e instanceof Error && e.message.includes("already exists")) throw e;
				}
			}

			appendToBlock(ctx.cwd, params.block, params.arrayKey, params.item);
			const id = params.item?.id ? ` '${params.item.id}'` : "";
			return {
				details: undefined,
				content: [{ type: "text", text: `Appended item${id} to ${params.block}.${params.arrayKey}` }],
			};
		},
	});

	// ── Tool: update-block-item ───────────────────────────────────────────

	pi.registerTool({
		name: "update-block-item",
		label: "Update Block Item",
		description: "Update fields on an item in a project block array. Finds by predicate field match.",
		promptSnippet: "Update items in project blocks — change status, add details, mark resolved",
		parameters: Type.Object({
			block: Type.String({ description: "Block name (e.g., 'issues', 'decisions')" }),
			arrayKey: Type.String({ description: "Array key in the block" }),
			match: Type.Record(Type.String(), Type.Unknown(), { description: "Fields to match (e.g., { id: 'issue-123' })" }),
			updates: Type.Record(Type.String(), Type.Unknown(), {
				description: "Fields to update (e.g., { status: 'resolved' })",
			}),
		}),
		async execute(
			_toolCallId: string,
			params: { block: string; arrayKey: string; match: Record<string, unknown>; updates: Record<string, unknown> },
			_signal: AbortSignal,
			_onUpdate: AgentToolUpdateCallback,
			ctx: ExtensionContext,
		): Promise<AgentToolResult<undefined>> {
			if (Object.keys(params.updates).length === 0) {
				throw new Error("No fields to update — updates parameter is empty");
			}

			const matchEntries = Object.entries(params.match);
			updateItemInBlock(
				ctx.cwd,
				params.block,
				params.arrayKey,
				(item) => matchEntries.every(([k, v]) => item[k] === v),
				params.updates,
			);

			const matchDesc = matchEntries.map(([k, v]) => `${k}=${v}`).join(", ");
			return {
				details: undefined,
				content: [
					{
						type: "text",
						text: `Updated item (${matchDesc}) in ${params.block}.${params.arrayKey}: ${Object.keys(params.updates).join(", ")}`,
					},
				],
			};
		},
	});

	// ── Tool: append-relation ─────────────────────────────────────────────

	pi.registerTool({
		name: "append-relation",
		label: "Append Relation",
		description:
			"Append a closure-table relation (edge: parent, child, relation_type, optional ordinal) to relations.json. " +
			"Shape is AJV-validated; an exact-duplicate edge (same parent+child+relation_type) is a no-op. Reference " +
			"integrity (endpoints resolve, relation_type registered, no cycle) is NOT checked here — run context-validate " +
			"after. Creates relations.json if absent.",
		promptSnippet: "Create a relation/edge between two items (parent→child under a relation_type)",
		parameters: Type.Object({
			parent: Type.String({ description: "Canonical id (or lens bin name) of the parent endpoint" }),
			child: Type.String({ description: "Canonical id of the child endpoint" }),
			relation_type: Type.String({
				description: "Registered relation_type canonical_id / hierarchy edge type / lens id",
			}),
			ordinal: Type.Optional(Type.Integer({ description: "Optional sibling-ordering within (parent, relation_type)" })),
		}),
		async execute(
			_toolCallId: string,
			params: { parent: string; child: string; relation_type: string; ordinal?: number },
			_signal: AbortSignal,
			_onUpdate: AgentToolUpdateCallback,
			ctx: ExtensionContext,
		): Promise<AgentToolResult<undefined>> {
			const edge: Edge = {
				parent: params.parent,
				child: params.child,
				relation_type: params.relation_type,
				...(params.ordinal !== undefined ? { ordinal: params.ordinal } : {}),
			};
			const { appended } = appendRelation(ctx.cwd, edge);
			const ordinalNote = params.ordinal !== undefined ? ` (ordinal ${params.ordinal})` : "";
			const text = appended
				? `Appended relation ${edge.parent} -[${edge.relation_type}]-> ${edge.child}${ordinalNote}`
				: `Relation ${edge.parent} -[${edge.relation_type}]-> ${edge.child} already exists — no-op`;
			return {
				details: undefined,
				content: [{ type: "text", text }],
			};
		},
	});

	// ── Tool: append-block-nested-item ────────────────────────────────────

	pi.registerTool({
		name: "append-block-nested-item",
		label: "Append Block Nested Item",
		description:
			"Append an item to a nested array on a parent-array item in a project block. Schema validation is automatic.",
		promptSnippet: "Append items to nested arrays inside parent items (e.g., findings inside a review)",
		parameters: Type.Object({
			block: Type.String({ description: "Block name (e.g., 'spec-reviews')" }),
			arrayKey: Type.String({ description: "Parent array key (e.g., 'reviews')" }),
			match: Type.Record(Type.String(), Type.Unknown(), {
				description: "Fields to match the parent item (e.g., { id: 'REVIEW-001' })",
			}),
			nestedKey: Type.String({ description: "Nested array key on the matched parent (e.g., 'findings')" }),
			item: Type.Unknown({ description: "Item object to append to the nested array — must conform to schema" }),
		}),
		async execute(
			_toolCallId: string,
			params: {
				block: string;
				arrayKey: string;
				match: Record<string, unknown>;
				nestedKey: string;
				item: Record<string, unknown>;
			},
			_signal: AbortSignal,
			_onUpdate: AgentToolUpdateCallback,
			ctx: ExtensionContext,
		): Promise<AgentToolResult<undefined>> {
			if (typeof params.item === "string") {
				try {
					params.item = JSON.parse(params.item) as Record<string, unknown>;
				} catch {
					throw new Error(`item parameter must be a JSON object, got unparseable string`);
				}
			}
			const matchEntries = Object.entries(params.match);
			const predicate = (i: Record<string, unknown>) => matchEntries.every(([k, v]) => i[k] === v);
			appendToNestedArray(ctx.cwd, params.block, params.arrayKey, predicate, params.nestedKey, params.item);
			const matchDesc = matchEntries.map(([k, v]) => `${k}=${v}`).join(", ");
			const id = params.item?.id ? ` '${params.item.id}'` : "";
			return {
				details: undefined,
				content: [
					{
						type: "text",
						text: `Appended item${id} to ${params.block}.${params.arrayKey}[${matchDesc}].${params.nestedKey}`,
					},
				],
			};
		},
	});

	// ── Tool: update-block-nested-item ────────────────────────────────────

	pi.registerTool({
		name: "update-block-nested-item",
		label: "Update Block Nested Item",
		description:
			"Update fields on a nested-array item inside a parent-array item in a project block. Finds parent and nested by predicate field match. Throws on parent or nested miss (mirrors update-block-item semantics).",
		promptSnippet: "Update items inside nested arrays — change finding state, mark resolved",
		parameters: Type.Object({
			block: Type.String({ description: "Block name (e.g., 'spec-reviews')" }),
			arrayKey: Type.String({ description: "Parent array key (e.g., 'reviews')" }),
			match: Type.Record(Type.String(), Type.Unknown(), {
				description: "Fields to match the parent item (e.g., { id: 'REVIEW-001' })",
			}),
			nestedKey: Type.String({ description: "Nested array key on the matched parent (e.g., 'findings')" }),
			nestedMatch: Type.Record(Type.String(), Type.Unknown(), {
				description: "Fields to match the nested item (e.g., { id: 'F-001' })",
			}),
			updates: Type.Record(Type.String(), Type.Unknown(), {
				description: "Fields to update on the nested item (e.g., { state: 'resolved' })",
			}),
		}),
		async execute(
			_toolCallId: string,
			params: {
				block: string;
				arrayKey: string;
				match: Record<string, unknown>;
				nestedKey: string;
				nestedMatch: Record<string, unknown>;
				updates: Record<string, unknown>;
			},
			_signal: AbortSignal,
			_onUpdate: AgentToolUpdateCallback,
			ctx: ExtensionContext,
		): Promise<AgentToolResult<undefined>> {
			if (Object.keys(params.updates).length === 0) {
				throw new Error("No fields to update — updates parameter is empty");
			}
			const parentEntries = Object.entries(params.match);
			const nestedEntries = Object.entries(params.nestedMatch);
			const parentPred = (i: Record<string, unknown>) => parentEntries.every(([k, v]) => i[k] === v);
			const nestedPred = (i: Record<string, unknown>) => nestedEntries.every(([k, v]) => i[k] === v);
			updateNestedArrayItem(
				ctx.cwd,
				params.block,
				params.arrayKey,
				parentPred,
				params.nestedKey,
				nestedPred,
				params.updates,
			);
			const parentDesc = parentEntries.map(([k, v]) => `${k}=${v}`).join(", ");
			const nestedDesc = nestedEntries.map(([k, v]) => `${k}=${v}`).join(", ");
			return {
				details: undefined,
				content: [
					{
						type: "text",
						text: `Updated nested item (${nestedDesc}) in ${params.block}.${params.arrayKey}[${parentDesc}].${params.nestedKey}: ${Object.keys(params.updates).join(", ")}`,
					},
				],
			};
		},
	});

	// ── Tool: remove-block-item ───────────────────────────────────────────

	pi.registerTool({
		name: "remove-block-item",
		label: "Remove Block Item",
		description:
			"Remove items matching a predicate from a top-level array in a project block. Idempotent — returns { removed: 0 } on no match without throwing. Schema validation runs after removal.",
		promptSnippet: "Remove items from project blocks — prune retracted issues, dedupe entries",
		parameters: Type.Object({
			block: Type.String({ description: "Block name (e.g., 'issues')" }),
			arrayKey: Type.String({ description: "Top-level array key (e.g., 'issues')" }),
			match: Type.Record(Type.String(), Type.Unknown(), { description: "Fields to match (e.g., { id: 'issue-123' })" }),
		}),
		async execute(
			_toolCallId: string,
			params: { block: string; arrayKey: string; match: Record<string, unknown> },
			_signal: AbortSignal,
			_onUpdate: AgentToolUpdateCallback,
			ctx: ExtensionContext,
		): Promise<AgentToolResult<undefined>> {
			const matchEntries = Object.entries(params.match);
			const predicate = (i: Record<string, unknown>) => matchEntries.every(([k, v]) => i[k] === v);
			const result = removeFromBlock(ctx.cwd, params.block, params.arrayKey, predicate);
			const matchDesc = matchEntries.map(([k, v]) => `${k}=${v}`).join(", ");
			return {
				details: undefined,
				content: [
					{
						type: "text",
						text: `Removed ${result.removed} item(s) matching (${matchDesc}) from ${params.block}.${params.arrayKey}`,
					},
				],
			};
		},
	});

	// ── Tool: remove-block-nested-item ────────────────────────────────────

	pi.registerTool({
		name: "remove-block-nested-item",
		label: "Remove Block Nested Item",
		description:
			"Remove items matching a predicate from a nested array on a parent-array item in a project block. Throws on parent miss; returns { removed: 0 } on nested miss without throwing.",
		promptSnippet: "Remove nested items — drop rejected findings, retract nested references",
		parameters: Type.Object({
			block: Type.String({ description: "Block name (e.g., 'spec-reviews')" }),
			arrayKey: Type.String({ description: "Parent array key (e.g., 'reviews')" }),
			match: Type.Record(Type.String(), Type.Unknown(), {
				description: "Fields to match the parent item (e.g., { id: 'REVIEW-001' })",
			}),
			nestedKey: Type.String({ description: "Nested array key on the matched parent (e.g., 'findings')" }),
			nestedMatch: Type.Record(Type.String(), Type.Unknown(), {
				description: "Fields to match the nested items to remove (e.g., { id: 'F-001' })",
			}),
		}),
		async execute(
			_toolCallId: string,
			params: {
				block: string;
				arrayKey: string;
				match: Record<string, unknown>;
				nestedKey: string;
				nestedMatch: Record<string, unknown>;
			},
			_signal: AbortSignal,
			_onUpdate: AgentToolUpdateCallback,
			ctx: ExtensionContext,
		): Promise<AgentToolResult<undefined>> {
			const parentEntries = Object.entries(params.match);
			const nestedEntries = Object.entries(params.nestedMatch);
			const parentPred = (i: Record<string, unknown>) => parentEntries.every(([k, v]) => i[k] === v);
			const nestedPred = (i: Record<string, unknown>) => nestedEntries.every(([k, v]) => i[k] === v);
			const result = removeFromNestedArray(
				ctx.cwd,
				params.block,
				params.arrayKey,
				parentPred,
				params.nestedKey,
				nestedPred,
			);
			const parentDesc = parentEntries.map(([k, v]) => `${k}=${v}`).join(", ");
			const nestedDesc = nestedEntries.map(([k, v]) => `${k}=${v}`).join(", ");
			return {
				details: undefined,
				content: [
					{
						type: "text",
						text: `Removed ${result.removed} nested item(s) matching (${nestedDesc}) from ${params.block}.${params.arrayKey}[${parentDesc}].${params.nestedKey}`,
					},
				],
			};
		},
	});

	// ── Tool: read-block-dir ──────────────────────────────────────────────

	pi.registerTool({
		name: "read-block-dir",
		label: "Read Block Dir",
		description:
			"Enumerate and parse all .json files in a .project/<subdir>/ directory, returned as a sorted array. Missing directories return [].",
		promptSnippet: "Enumerate project block subdirectories (phases, schemas, etc.) as parsed JSON",
		parameters: Type.Object({
			subdir: Type.String({ description: "Subdirectory under .project/ (e.g., 'phases', 'schemas')" }),
		}),
		async execute(
			_toolCallId: string,
			params: { subdir: string },
			_signal: AbortSignal,
			_onUpdate: AgentToolUpdateCallback,
			ctx: ExtensionContext,
		): Promise<AgentToolResult<undefined>> {
			const result = readBlockDir(ctx.cwd, params.subdir);
			const envelope = serializeForRead(result, { label: `.project/${params.subdir}/` });
			return {
				details: undefined,
				content: [{ type: "text", text: envelope.content }],
			};
		},
	});

	// ── Tool: read-block ────────────────────────────────────────────────────

	pi.registerTool({
		name: "read-block",
		label: "Read Block",
		description: "Read a project block file as structured JSON.",
		promptSnippet: "Read a project block as structured JSON",
		parameters: Type.Object({
			block: Type.String({ description: "Block name (e.g., 'issues', 'tasks', 'requirements')" }),
		}),
		async execute(
			_toolCallId: string,
			params: { block: string },
			_signal: AbortSignal,
			_onUpdate: AgentToolUpdateCallback,
			ctx: ExtensionContext,
		): Promise<AgentToolResult<undefined>> {
			const result = readBlock(ctx.cwd, params.block);
			const envelope = serializeForRead(result, { label: `.project/${params.block}.json` });
			return {
				details: undefined,
				content: [{ type: "text", text: envelope.content }],
			};
		},
	});

	// ── Tool: write-block ───────────────────────────────────────────────────

	pi.registerTool({
		name: "write-block",
		label: "Write Block",
		description: "Write or replace an entire project block with schema validation.",
		promptSnippet: "Write or replace a project block with schema validation",
		parameters: Type.Object({
			block: Type.String({ description: "Block name (e.g., 'project', 'architecture')" }),
			data: Type.Unknown({ description: "Complete block data — must conform to block schema" }),
		}),
		async execute(
			_toolCallId: string,
			params: { block: string; data: unknown },
			_signal: AbortSignal,
			_onUpdate: AgentToolUpdateCallback,
			ctx: ExtensionContext,
		): Promise<AgentToolResult<undefined>> {
			const data = typeof params.data === "string" ? JSON.parse(params.data) : params.data;
			writeBlock(ctx.cwd, params.block, data);
			return {
				details: undefined,
				content: [{ type: "text", text: `Wrote block '${params.block}' successfully` }],
			};
		},
	});

	// ── Tool: context-status ────────────────────────────────────────────────

	pi.registerTool({
		name: "context-status",
		label: "Context Status",
		description: "Get derived context state — source metrics, block summaries, planning lifecycle status.",
		promptSnippet: "Get context state — source metrics, block summaries, planning lifecycle status",
		parameters: Type.Object({}),
		async execute(
			_toolCallId: string,
			_params: Record<string, never>,
			_signal: AbortSignal,
			_onUpdate: AgentToolUpdateCallback,
			ctx: ExtensionContext,
		): Promise<AgentToolResult<undefined>> {
			const result = contextState(ctx.cwd);
			return {
				details: undefined,
				content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
			};
		},
	});

	// ── Tool: context-validate ──────────────────────────────────────────────

	pi.registerTool({
		name: "context-validate",
		label: "Context Validate",
		description: "Validate cross-block referential integrity — check that IDs referenced across blocks exist.",
		promptSnippet: "Validate cross-block referential integrity",
		parameters: Type.Object({}),
		async execute(
			_toolCallId: string,
			_params: Record<string, never>,
			_signal: AbortSignal,
			_onUpdate: AgentToolUpdateCallback,
			ctx: ExtensionContext,
		): Promise<AgentToolResult<undefined>> {
			const result = validateContext(ctx.cwd);
			return {
				details: undefined,
				content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
			};
		},
	});

	// ── Tool: read-config ───────────────────────────────────────────────────

	pi.registerTool({
		name: "read-config",
		label: "Read Config",
		description:
			"Read the substrate config.json as structured JSON — vocabulary, lenses, relation_types, status_buckets, display_strings, layers, block_kinds, installed_schemas, installed_blocks. Address ONE registry/map via `registry` (e.g. relation_types) and ONE entry within it via `id` (canonical_id) instead of reading the whole config.",
		promptSnippet: "Read project config — vocabulary, lenses, relation_types, status_buckets",
		parameters: Type.Object({
			registry: Type.Optional(
				Type.String({
					description:
						"Address ONE config registry/map by key (e.g. 'relation_types', 'lenses', 'block_kinds', 'status_buckets')",
				}),
			),
			id: Type.Optional(Type.String({ description: "With `registry`: address ONE entry within it by canonical_id" })),
		}),
		async execute(
			_toolCallId: string,
			params: { registry?: string; id?: string },
			_signal: AbortSignal,
			_onUpdate: AgentToolUpdateCallback,
			ctx: ExtensionContext,
		): Promise<AgentToolResult<undefined>> {
			const config = loadConfig(ctx.cwd);
			const root = tryResolveContextDir(ctx.cwd);
			const configPath = root === null ? null : path.join(root, "config.json");

			if (params.registry !== undefined) {
				const reg = addressInto(config, { key: params.registry });
				if (!reg.found) {
					return {
						details: undefined,
						content: [{ type: "text", text: `read-config: registry not found — ${reg.resolved}` }],
					};
				}
				if (params.id !== undefined) {
					const entry = addressInto(reg.value, { id: params.id });
					if (!entry.found) {
						return {
							details: undefined,
							content: [
								{ type: "text", text: `read-config: entry not found in ${params.registry} — ${entry.resolved}` },
							],
						};
					}
					const envEntry = serializeForRead(entry.value, { label: `config.${params.registry}.${params.id}` });
					return { details: undefined, content: [{ type: "text", text: envEntry.content }] };
				}
				const envReg = serializeForRead(reg.value, { label: `config.${params.registry}` });
				return { details: undefined, content: [{ type: "text", text: envReg.content }] };
			}

			const result = { config, configPath };
			const envelope = serializeForRead(result, { label: configPath ?? "config.json" });
			return {
				details: undefined,
				content: [{ type: "text", text: envelope.content }],
			};
		},
	});

	// ── Tool: list-tools ──────────────────────────────────────────────────────

	pi.registerTool({
		name: "list-tools",
		label: "List Tools",
		description:
			"Discover the agent's own tool surface (all loaded extensions + builtins). Default returns a COMPACT index — one line per tool (name · param-count · one-line description) plus the active set — not the full JSON-schemas. Pass `name` to fetch ONE tool's full descriptor (name + description + parameter JSON-schema + sourceInfo). Index→detail per FGAP-101.",
		promptSnippet: "Discover available tools — compact index, or one tool's full descriptor via `name`",
		parameters: Type.Object({
			name: Type.Optional(
				Type.String({ description: "Address ONE tool by name → full descriptor (params schema + sourceInfo)" }),
			),
		}),
		async execute(
			_toolCallId: string,
			params: { name?: string },
			_signal: AbortSignal,
			_onUpdate: AgentToolUpdateCallback,
			_ctx: ExtensionContext,
		): Promise<AgentToolResult<undefined>> {
			// Closes over the factory `pi` (the introspection surface lives on
			// ExtensionAPI, not ExtensionContext) — `_ctx` is unused.
			const all = pi.getAllTools();
			const active = pi.getActiveTools();

			if (params.name !== undefined) {
				const hit = addressInto(all, { key: params.name });
				// getAllTools entries are keyed by `.name`, not `.id`/`.canonical_id`;
				// resolve by name explicitly rather than relying on addressInto's id path.
				const tool = hit.found ? hit.value : all.find((t) => (t as { name?: string }).name === params.name);
				if (tool === undefined) {
					return {
						details: undefined,
						content: [{ type: "text", text: `list-tools: tool not found — name=${params.name}` }],
					};
				}
				const envOne = serializeForRead(tool, { label: `tool ${params.name}` });
				return { details: undefined, content: [{ type: "text", text: envOne.content }] };
			}

			// Default: compact index (FGAP-101) — name + param count + one-line description.
			const index = all.map((t) => {
				const tool = t as {
					name?: string;
					description?: string;
					parameters?: { properties?: Record<string, unknown> };
				};
				const paramCount =
					tool.parameters?.properties && typeof tool.parameters.properties === "object"
						? Object.keys(tool.parameters.properties).length
						: 0;
				const oneLine = (tool.description ?? "").split("\n")[0] ?? "";
				return { name: tool.name, params: paramCount, description: oneLine };
			});
			// The compact index is one line per tool — small enough to serialize whole
			// (no paging); keep the wrapper fields (active/total) on the result object.
			const result = { tools: index, active, total: all.length, activeCount: active.length };
			const envelope = serializeForRead(result, { label: "tool index — pass name= for detail" });
			return {
				details: undefined,
				content: [{ type: "text", text: envelope.content }],
			};
		},
	});

	// ── Tool: read-samples-catalog ────────────────────────────────────────────

	pi.registerTool({
		name: "read-samples-catalog",
		label: "Read Samples Catalog",
		description:
			"Enumerate installable sample block kinds (DEC-0037 packaged view): per kind — title, description, item shape, applicable relation_types (as source/target), invariants, lenses — plus top-level relation_type/lens/invariant/layer/status_bucket registries. Package-intrinsic: reads the extension's bundled samples catalog, independent of any project. Optional `kind` returns one packaged kind.",
		promptSnippet: "Discover installable sample block kinds — title, shape, relation_types, invariants, lenses",
		parameters: Type.Object({
			kind: Type.Optional(Type.String({ description: "Filter to one block_kind canonical_id (e.g. 'tasks')" })),
		}),
		async execute(
			_toolCallId: string,
			params: { kind?: string },
			_signal: AbortSignal,
			_onUpdate: AgentToolUpdateCallback,
			_ctx: ExtensionContext,
		): Promise<AgentToolResult<undefined>> {
			// Package-intrinsic: the catalog reads the extension's bundled samples
			// directory, not the project substrate — `_ctx` (and its cwd) is unused.
			const catalog = samplesCatalog(params.kind ? { kind: params.kind } : undefined);
			const envelope = serializeForRead(catalog, {
				label: params.kind ? `samples kind=${params.kind}` : "samples catalog",
			});
			return {
				details: undefined,
				content: [{ type: "text", text: envelope.content }],
			};
		},
	});

	// ── Tool: context-current-state ───────────────────────────────────────────

	pi.registerTool({
		name: "context-current-state",
		label: "Context Current State",
		description:
			"Derive 'where are we + what's next' purely from .project substrate — focus, in-flight tasks, ranked atomic-next actions (open framework-gaps then unblocked planned tasks), and blocked tasks. No writes; nothing hand-stored.",
		promptSnippet: "Derive current project state — focus, in-flight, next actions, blocked",
		parameters: Type.Object({}),
		async execute(
			_toolCallId: string,
			_params: Record<string, never>,
			_signal: AbortSignal,
			_onUpdate: AgentToolUpdateCallback,
			ctx: ExtensionContext,
		): Promise<AgentToolResult<undefined>> {
			const state = currentState(ctx.cwd);
			return {
				details: undefined,
				content: [{ type: "text", text: JSON.stringify(state, null, 2) }],
			};
		},
	});

	// ── Tool: context-bootstrap-state ─────────────────────────────────────────

	pi.registerTool({
		name: "context-bootstrap-state",
		label: "Context Bootstrap State",
		description:
			"Derive the substrate bootstrap state for the cwd, purely from the filesystem (DEC-0040): 'no-pointer' | 'no-config' | 'not-installed' | 'ready', plus the resolved contextDir and any declared-but-unmaterialized installed assets. Unlike every other tool, this NEVER throws on an un-bootstrapped substrate — it returns 'no-pointer' so you can detect a fresh substrate and tell the human to run /context start (bootstrap is human-only). No writes.",
		promptSnippet:
			"Derive substrate bootstrap state — no-pointer | no-config | not-installed | ready (never throws pre-bootstrap)",
		parameters: Type.Object({}),
		async execute(
			_toolCallId: string,
			_params: Record<string, never>,
			_signal: AbortSignal,
			_onUpdate: AgentToolUpdateCallback,
			ctx: ExtensionContext,
		): Promise<AgentToolResult<undefined>> {
			const status = deriveBootstrapState(ctx.cwd);
			return {
				details: undefined,
				content: [{ type: "text", text: JSON.stringify(status, null, 2) }],
			};
		},
	});

	// ── Tool: rename-canonical-id ─────────────────────────────────────────────

	pi.registerTool({
		name: "rename-canonical-id",
		label: "Rename Canonical Id",
		description:
			"Rename a canonical_id (kind: item | relation_type | lens | layer) from oldId to newId across all substrate surfaces that carry it as DATA — item home block + relations.json edges, or the relevant config registries. Out-of-substrate occurrences (analysis MDs, git history) are REPORTED, never rewritten. block_kind renames are unsupported (filesystem cascade). Use dryRun to preview the would-change counts without writing.",
		promptSnippet: "Rename a canonical_id (item/relation_type/lens/layer) across substrate; dryRun to preview",
		parameters: Type.Object({
			kind: Type.String({ description: "One of: item | relation_type | lens | layer" }),
			oldId: Type.String({ description: "Current canonical_id to rename from" }),
			newId: Type.String({ description: "New canonical_id to rename to" }),
			dryRun: Type.Optional(Type.Boolean({ description: "Compute would-change counts without writing" })),
		}),
		async execute(
			_toolCallId: string,
			params: { kind: string; oldId: string; newId: string; dryRun?: boolean },
			_signal: AbortSignal,
			_onUpdate: AgentToolUpdateCallback,
			ctx: ExtensionContext,
		): Promise<AgentToolResult<undefined>> {
			const report = renameCanonicalId(ctx.cwd, params.kind, params.oldId, params.newId, { dryRun: params.dryRun });
			return {
				details: undefined,
				content: [{ type: "text", text: JSON.stringify(report, null, 2) }],
			};
		},
	});

	// ── Tool: amend-config ────────────────────────────────────────────────────

	pi.registerTool({
		name: "amend-config",
		label: "Amend Config",
		description:
			"Scoped add / replace / remove of ONE entry in ONE config.json registry (block_kinds, relation_types, lenses, " +
			"layers, invariants, status_buckets, display_strings, naming, installed_schemas, installed_blocks, hierarchy). " +
			"The whole resulting config is AJV-validated (SHAPE) and op-correctness is enforced (add ⇒ key absent, " +
			"replace/remove ⇒ key present). Cross-registry referential integrity (removing a still-referenced " +
			"relation_type / lens / layer / block_kind) is NOT checked here — run context-validate after. dryRun previews " +
			"without writing.",
		promptSnippet:
			"Add/replace/remove one entry in a config.json registry (vocabulary, lenses, invariants, status_buckets)",
		parameters: Type.Object({
			registry: Type.String({
				description:
					"One of: block_kinds | relation_types | lenses | layers | invariants | status_buckets | display_strings | naming | installed_schemas | installed_blocks | hierarchy",
			}),
			operation: Type.String({ description: "add | replace | remove" }),
			key: Type.String({
				description:
					"Entry key: id for keyed-array (block_kinds/relation_types/lenses/layers/invariants), map key for " +
					"map (status_buckets/display_strings/naming), the string value for string-array " +
					"(installed_schemas/installed_blocks), or a JSON {parent_block, child_block, relation_type} for hierarchy",
			}),
			entry: Type.Optional(
				Type.Unknown({
					description:
						"Entry payload: object for keyed-array/hierarchy, string for map value; omit for remove. For keyed-array its id field must equal key; for string-array (when given) it must equal key",
				}),
			),
			dryRun: Type.Optional(Type.Boolean({ description: "Preview the op without writing config.json" })),
		}),
		async execute(
			_toolCallId: string,
			params: { registry: string; operation: string; key: string; entry?: unknown; dryRun?: boolean },
			_signal: AbortSignal,
			_onUpdate: AgentToolUpdateCallback,
			ctx: ExtensionContext,
		): Promise<AgentToolResult<undefined>> {
			// Type.Unknown() params may arrive as JSON strings. Parse if possible; on
			// failure KEEP the raw string (valid for map-value registries whose value
			// is a bare string, e.g. naming/display_strings/status_buckets).
			let entry = params.entry;
			if (typeof entry === "string") {
				try {
					entry = JSON.parse(entry);
				} catch {
					/* keep raw string — valid for map-value registries */
				}
			}
			const result = amendConfigEntry(ctx.cwd, params.registry, params.operation, params.key, entry, undefined, {
				dryRun: params.dryRun,
			});
			const verb = result.modified ? (params.dryRun ? `would ${result.operation}` : `${result.operation}d`) : "no-op";
			return {
				details: undefined,
				content: [{ type: "text", text: `amend-config: ${verb} ${result.registry}[${result.key}]` }],
			};
		},
	});

	// ── Tool: read-schema ───────────────────────────────────────────────────

	pi.registerTool({
		name: "read-schema",
		label: "Read Schema",
		description:
			"Read a substrate schema by name as parsed JSON. Returns null when the schema file is absent. Address ONE property via `path` (dotted/bracket, e.g. properties.tasks.items.properties.status) instead of reading the whole schema.",
		promptSnippet: "Read a block schema as structured JSON — optionally address one property via `path`",
		parameters: Type.Object({
			schemaName: Type.String({
				description: "Schema name without extension (e.g., 'tasks', 'decisions', 'issues')",
			}),
			path: Type.Optional(
				Type.String({
					description: "Address ONE property by dotted/bracket path (e.g. 'properties.tasks.items.properties.status')",
				}),
			),
		}),
		async execute(
			_toolCallId: string,
			params: { schemaName: string; path?: string },
			_signal: AbortSignal,
			_onUpdate: AgentToolUpdateCallback,
			ctx: ExtensionContext,
		): Promise<AgentToolResult<undefined>> {
			const schema = readSchema(ctx.cwd, params.schemaName);
			const schemaPathStr = schemaPath(ctx.cwd, params.schemaName);

			if (params.path !== undefined) {
				const addr = addressInto(schema, { path: params.path });
				if (!addr.found) {
					return {
						details: undefined,
						content: [{ type: "text", text: `read-schema: property not found — ${addr.resolved}` }],
					};
				}
				const envProp = serializeForRead(addr.value, { label: `${params.schemaName} ${addr.resolved}` });
				return { details: undefined, content: [{ type: "text", text: envProp.content }] };
			}

			const result = { schema, schemaPath: schemaPathStr };
			const envelope = serializeForRead(result, { label: schemaPathStr });
			return {
				details: undefined,
				content: [{ type: "text", text: envelope.content }],
			};
		},
	});

	// ── Tool: write-schema ──────────────────────────────────────────────────

	pi.registerTool({
		name: "write-schema",
		label: "Write Schema",
		description:
			"Create or replace a substrate block-kind JSON Schema. operation 'create' requires the schema absent; " +
			"'replace' requires it present. The body is AJV draft-07 meta-validated before an atomic write. CAVEAT: a " +
			"'replace' that changes the schema's version does NOT migrate existing block items — read-time " +
			"validateBlockWithMigration throws a version mismatch until a code-level MigrationFn is registered (no tool " +
			"surface for that). Registering the block_kind that points at this schema is a separate step (amend-config " +
			"block_kinds).",
		promptSnippet: "Create or replace a block-kind JSON Schema (meta-validated, atomic)",
		parameters: Type.Object({
			operation: Type.String({ description: "create | replace" }),
			schemaName: Type.String({ description: "Schema name without extension (e.g., 'tasks')" }),
			schema: Type.Unknown({
				description: "The whole JSON Schema object (draft-07). Accepts a JSON string.",
			}),
			dryRun: Type.Optional(Type.Boolean({ description: "Meta-validate without writing" })),
		}),
		async execute(
			_toolCallId: string,
			params: { operation: string; schemaName: string; schema?: unknown; dryRun?: boolean },
			_signal: AbortSignal,
			_onUpdate: AgentToolUpdateCallback,
			ctx: ExtensionContext,
		): Promise<AgentToolResult<undefined>> {
			// Type.Unknown() params may arrive as JSON strings. Parse if possible; on
			// failure KEEP the raw value (meta-validation rejects a non-object body).
			let schema = params.schema;
			if (typeof schema === "string") {
				try {
					schema = JSON.parse(schema);
				} catch {
					/* keep raw string — meta-validation will reject a non-object */
				}
			}
			const result = writeSchemaChecked(
				ctx.cwd,
				params.schemaName,
				schema as object,
				params.operation as "create" | "replace",
				undefined,
				{ dryRun: params.dryRun },
			);
			const verb = result.written ? `${result.operation}d` : `would ${result.operation}`;
			return {
				details: undefined,
				content: [
					{ type: "text", text: `write-schema: ${verb} schema '${params.schemaName}' at ${result.schemaPath}` },
				],
			};
		},
	});

	// ── Tool: context-init ──────────────────────────────────────────────────

	pi.registerTool({
		name: "context-init",
		label: "Context Init",
		description: "Initialize the substrate dir (bootstrap pointer + dirs only; run accept-all + install to populate).",
		promptSnippet: "Initialize the substrate dir (bootstrap pointer + dirs only; run accept-all + install to populate)",
		parameters: Type.Object({
			contextDir: Type.String({
				description: "Substrate dir name (e.g. .project). Required per DEC-0015 — no default.",
			}),
		}),
		async execute(
			_toolCallId: string,
			params: { contextDir: string },
			_signal: AbortSignal,
			_onUpdate: AgentToolUpdateCallback,
			ctx: ExtensionContext,
		): Promise<AgentToolResult<undefined>> {
			const result = initProject(ctx.cwd, params.contextDir);
			return {
				details: undefined,
				content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
			};
		},
	});

	// ── Tool: context-accept-all ──────────────────────────────────────────────

	pi.registerTool({
		name: "context-accept-all",
		label: "Accept-All Conception",
		description:
			"Adopt the canonical packaged conception (samples/conception.json) as this substrate's config.json (accept-all). Writes config only — run install after. Idempotent: never overwrites an existing config.",
		promptSnippet: "Adopt the canonical conception as config (accept-all)",
		parameters: Type.Object({}),
		async execute(
			_toolCallId: string,
			_params: Record<string, never>,
			_signal: AbortSignal,
			_onUpdate: AgentToolUpdateCallback,
			ctx: ExtensionContext,
		): Promise<AgentToolResult<undefined>> {
			let result: AdoptResult;
			try {
				result = adoptConception(ctx.cwd);
			} catch (err) {
				if (err instanceof BootstrapNotFoundError) {
					return {
						details: undefined,
						content: [{ type: "text", text: "substrate not initialized — run context-init first" }],
					};
				}
				throw err;
			}
			return {
				details: undefined,
				content: [{ type: "text", text: JSON.stringify(result) }],
			};
		},
	});

	// ── Tool: filter-block-items ──────────────────────────────────────────

	pi.registerTool({
		name: "filter-block-items",
		label: "Filter Block Items",
		description:
			"Filter the array items of a block by a single-field predicate (eq / neq / in / matches). Discovers the single top-level array property in the block; items missing the predicate field are never matched. Wraps the canonical readBlock + caller-side filter into one queryable surface; never mutates the block.",
		promptSnippet: "Filter a block's items by a predicate — eq / neq / in / matches against a single field",
		parameters: Type.Object({
			block: Type.String({
				description: "Block name (e.g., 'tasks', 'decisions', 'framework-gaps', 'context-contracts')",
			}),
			field: Type.String({ description: "Item field to test (e.g., 'status', 'priority', 'id')" }),
			op: Type.Union([Type.Literal("eq"), Type.Literal("neq"), Type.Literal("in"), Type.Literal("matches")], {
				description:
					"Comparison operator: eq (===), neq (!==), in (value is array, item[field] in it), matches (regexp test on string)",
			}),
			value: Type.Unknown({
				description: "Comparison value — scalar for eq/neq, array for in, regexp pattern string for matches",
			}),
		}),
		async execute(
			_toolCallId: string,
			params: { block: string; field: string; op: "eq" | "neq" | "in" | "matches"; value: unknown },
			_signal: AbortSignal,
			_onUpdate: AgentToolUpdateCallback,
			ctx: ExtensionContext,
		): Promise<AgentToolResult<undefined>> {
			const result = filterBlockItems(ctx.cwd, params.block, {
				field: params.field,
				op: params.op,
				value: params.value,
			});
			const envelope = serializeForRead(result, { label: `${params.block} filtered` });
			return {
				details: undefined,
				content: [{ type: "text", text: envelope.content }],
			};
		},
	});

	// ── Tool: resolve-item-by-id ──────────────────────────────────────────

	pi.registerTool({
		name: "resolve-item-by-id",
		label: "Resolve Item By Id",
		description:
			"Look up the block, array key, and item payload for a given ID across all .project/ blocks. Returns null when no item matches. Mirrors the resolveItemById SDK function and shares its prefix-vs-block invariant — IDs whose prefix maps to a known block but live elsewhere throw at index-build time.",
		promptSnippet: "Resolve a kind-prefixed ID (DEC-/FEAT-/FGAP-/issue-/REQ-/TASK-/etc.) to its owning block and item",
		parameters: Type.Object({
			id: Type.String({ description: "Kind-prefixed ID, e.g., DEC-0001 / FEAT-001 / FGAP-003 / issue-064" }),
		}),
		async execute(
			_toolCallId: string,
			params: { id: string },
			_signal: AbortSignal,
			_onUpdate: AgentToolUpdateCallback,
			ctx: ExtensionContext,
		): Promise<AgentToolResult<undefined>> {
			const result = resolveItemById(ctx.cwd, params.id);
			return {
				details: undefined,
				content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
			};
		},
	});

	// ── Tool: read-block-item ─────────────────────────────────────────────

	pi.registerTool({
		name: "read-block-item",
		label: "Read Block Item",
		description:
			"Read a single item from a named block by its id — returns the item or null. Block-scoped (unlike resolve-item-by-id, which searches all blocks by kind-prefixed id). Avoids fetching a whole large block to get one item.",
		promptSnippet: "Read one item from a block by id (block-scoped; null if absent)",
		parameters: Type.Object({
			block: Type.String({ description: "Block name (e.g., 'tasks', 'decisions', 'framework-gaps')" }),
			id: Type.String({ description: "Item id within the block (e.g., 'TASK-001')" }),
		}),
		async execute(
			_toolCallId: string,
			params: { block: string; id: string },
			_signal: AbortSignal,
			_onUpdate: AgentToolUpdateCallback,
			ctx: ExtensionContext,
		): Promise<AgentToolResult<undefined>> {
			const result = readBlockItem(ctx.cwd, params.block, params.id);
			// whole: the item is already the addressed element — don't re-page its
			// intrinsic arrays; preserve the single-item|null output contract.
			const envelope = serializeForRead(result, { whole: true, label: `${params.block} ${params.id}` });
			return {
				details: undefined,
				content: [{ type: "text", text: envelope.content }],
			};
		},
	});

	// ── Tool: read-block-page ─────────────────────────────────────────────

	pi.registerTool({
		name: "read-block-page",
		label: "Read Block Page",
		description:
			"Paginate a block's items: returns { items, total, hasMore }. offset default 0, limit default 50. Use for blocks too large to fetch whole (past the 50KB read-block cap). total is the full item count; hasMore signals another page.",
		promptSnippet: "Paginate a block's items — offset + limit; returns {items,total,hasMore}",
		parameters: Type.Object({
			block: Type.String({ description: "Block name (e.g., 'framework-gaps', 'decisions', 'issues')" }),
			offset: Type.Optional(Type.Integer({ minimum: 0, description: "Start index (default 0)" })),
			limit: Type.Optional(Type.Integer({ minimum: 1, description: "Max items to return (default 50)" })),
		}),
		async execute(
			_toolCallId: string,
			params: { block: string; offset?: number; limit?: number },
			_signal: AbortSignal,
			_onUpdate: AgentToolUpdateCallback,
			ctx: ExtensionContext,
		): Promise<AgentToolResult<undefined>> {
			const result = readBlockPage(ctx.cwd, params.block, { offset: params.offset, limit: params.limit });
			// whole: readBlockPage ALREADY paged — preserve the {items,total,hasMore}
			// output contract; do not let serializeForRead re-page the items array.
			const envelope = serializeForRead(result, { whole: true, label: `${params.block} page` });
			return {
				details: undefined,
				content: [{ type: "text", text: envelope.content }],
			};
		},
	});

	// ── Tool: join-blocks ─────────────────────────────────────────────────

	pi.registerTool({
		name: "join-blocks",
		label: "Join Blocks",
		description:
			"Join two blocks in one call (FGAP-043). EDGE mode: pass `relationType` — pairs left items with right-block items connected by that relations.json edge (`leftEndpoint` parent|child, default parent). FIELD mode: pass `leftField`+`rightField` — pairs where left[leftField] === right[rightField]. Optional left pre-filter via where{Field,Op,Value}. Returns [{left, right:[]}] (right always an array; one-to-many). Use instead of N+1 read-block + resolve calls.",
		promptSnippet: "Join two blocks in one call — by relation edge or shared field; returns {left,right[]} pairs",
		parameters: Type.Object({
			leftBlock: Type.String({ description: "Left block name (e.g., 'tasks')" }),
			rightBlock: Type.String({ description: "Right block name (e.g., 'verification')" }),
			relationType: Type.Optional(Type.String({ description: "Edge mode: relations.json relation_type" })),
			leftField: Type.Optional(Type.String({ description: "Field mode: left item field" })),
			rightField: Type.Optional(Type.String({ description: "Field mode: right item field" })),
			leftEndpoint: Type.Optional(
				Type.Union([Type.Literal("parent"), Type.Literal("child")], {
					description: "Edge mode: is the left item the edge parent (default) or child",
				}),
			),
			whereField: Type.Optional(Type.String({ description: "Optional left pre-filter field" })),
			whereOp: Type.Optional(
				Type.Union([Type.Literal("eq"), Type.Literal("neq"), Type.Literal("in"), Type.Literal("matches")]),
			),
			whereValue: Type.Optional(Type.Unknown({ description: "Optional left pre-filter value" })),
		}),
		async execute(
			_toolCallId: string,
			params: {
				leftBlock: string;
				rightBlock: string;
				relationType?: string;
				leftField?: string;
				rightField?: string;
				leftEndpoint?: "parent" | "child";
				whereField?: string;
				whereOp?: "eq" | "neq" | "in" | "matches";
				whereValue?: unknown;
			},
			_signal: AbortSignal,
			_onUpdate: AgentToolUpdateCallback,
			ctx: ExtensionContext,
		): Promise<AgentToolResult<undefined>> {
			const leftPredicate =
				params.whereField !== undefined
					? { field: params.whereField, op: params.whereOp ?? "eq", value: params.whereValue }
					: undefined;
			const result = joinBlocks(ctx.cwd, {
				leftBlock: params.leftBlock,
				rightBlock: params.rightBlock,
				relationType: params.relationType,
				leftField: params.leftField,
				rightField: params.rightField,
				leftEndpoint: params.leftEndpoint,
				leftPredicate,
			});
			const envelope = serializeForRead(result, { label: `${params.leftBlock} ⋈ ${params.rightBlock}` });
			return {
				details: undefined,
				content: [{ type: "text", text: envelope.content }],
			};
		},
	});

	// ── Tool: resolve-items-by-id (bulk) ──────────────────────────────────

	pi.registerTool({
		name: "resolve-items-by-id",
		label: "Resolve Items By Id (Bulk)",
		description:
			"Bulk variant of resolve-item-by-id — resolve N kind-prefixed ids against a single buildIdIndex traversal. Returns an object mapping each input id to its ItemLocation (block / arrayKey / item) or null when not found. Coexists with the singular resolve-item-by-id tool; bulk collapses the N×singular-call pattern for callers resolving multiple ids in one render pass.",
		promptSnippet: "Resolve a batch of kind-prefixed ids (DEC-/FGAP-/TASK-/issue-/REQ-/...) in one call",
		parameters: Type.Object({
			ids: Type.Array(Type.String(), {
				description: "Array of kind-prefixed ids (DEC-/FGAP-/TASK-/issue-/REQ-/...) to resolve in one call",
			}),
		}),
		async execute(
			_toolCallId: string,
			params: { ids: string[] },
			_signal: AbortSignal,
			_onUpdate: AgentToolUpdateCallback,
			ctx: ExtensionContext,
		): Promise<AgentToolResult<undefined>> {
			const resultMap = resolveItemsByIds(ctx.cwd, params.ids);
			const obj: Record<string, ItemLocation | null> = {};
			for (const [id, loc] of resultMap) obj[id] = loc;
			// whole: an id→location map keyed by arbitrary ids — not a pageable
			// collection; serialize the map verbatim.
			const envelope = serializeForRead(obj, { whole: true, label: "resolved ids" });
			return {
				details: undefined,
				content: [{ type: "text", text: envelope.content }],
			};
		},
	});

	// ── Tool: complete-task ────────────────────────────────────────────────

	pi.registerTool({
		name: "complete-task",
		label: "Complete Task",
		description: "Complete a task with verification gate — requires a passing verification entry targeting the task.",
		promptSnippet: "Complete a task — gates on passing verification before updating status",
		parameters: Type.Object({
			taskId: Type.String({ description: "Task ID to complete" }),
			verificationId: Type.String({
				description: "Verification entry ID (must target this task with status 'passed')",
			}),
		}),
		async execute(
			_toolCallId: string,
			params: { taskId: string; verificationId: string },
			_signal: AbortSignal,
			_onUpdate: AgentToolUpdateCallback,
			ctx: ExtensionContext,
		): Promise<AgentToolResult<undefined>> {
			const result = completeTask(ctx.cwd, params.taskId, params.verificationId);
			return {
				details: undefined,
				content: [
					{
						type: "text",
						text: `Task '${result.taskId}' completed (was '${result.previousStatus}'). Verification: ${result.verificationId} (${result.verificationStatus})`,
					},
				],
			};
		},
	});

	// ── Tool: context-validate-relations ──────────────────────────────────

	pi.registerTool({
		name: "context-validate-relations",
		label: "Context Validate Relations",
		description:
			"Validate substrate relations.json edges against config-declared lenses + hierarchy + relation_types and the cross-block id index. Returns SubstrateValidationResult with status (clean/warnings/invalid) and per-issue diagnostics.",
		promptSnippet: "Validate substrate relations against config + items",
		parameters: Type.Object({}),
		async execute(
			_toolCallId: string,
			_params: Record<string, never>,
			_signal: AbortSignal,
			_onUpdate: AgentToolUpdateCallback,
			ctx: ExtensionContext,
		): Promise<AgentToolResult<undefined>> {
			const result = validateContextRelations(ctx.cwd);
			return {
				details: undefined,
				content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
			};
		},
	});

	// ── Tool: context-edges-for-lens ──────────────────────────────────────

	pi.registerTool({
		name: "context-edges-for-lens",
		label: "Context Edges For Lens",
		description:
			"Materialize the Edge[] for a named lens — synthetic edges from derived_from_field for auto-derived lenses; authored edges filtered by relation_type for hand-curated lenses; unioned items from composition members for kind=composition lenses.",
		promptSnippet: "Materialize edges for a named lens (auto-derived or hand-curated)",
		parameters: Type.Object({
			lensId: Type.String({ description: "Lens id from config.lenses[].id" }),
		}),
		async execute(
			_toolCallId: string,
			params: { lensId: string },
			_signal: AbortSignal,
			_onUpdate: AgentToolUpdateCallback,
			ctx: ExtensionContext,
		): Promise<AgentToolResult<undefined>> {
			const result = edgesForLensByName(ctx.cwd, params.lensId);
			const envelope = serializeForRead(result, { label: `edges for lens ${params.lensId}` });
			return {
				details: undefined,
				content: [{ type: "text", text: envelope.content }],
			};
		},
	});

	// ── Tool: context-walk-descendants ────────────────────────────────────

	pi.registerTool({
		name: "context-walk-descendants",
		label: "Context Walk Descendants",
		description:
			"Walk closure-table descendants of a parent id under a given relation_type. Returns string[] of descendant ids (may be empty if no children or relations.json absent).",
		promptSnippet: "Walk closure-table descendants under a relation_type",
		parameters: Type.Object({
			parentId: Type.String({ description: "Parent id (canonical id or lens bin name)" }),
			relationType: Type.String({ description: "Relation type from config.relation_types[].canonical_id" }),
		}),
		async execute(
			_toolCallId: string,
			params: { parentId: string; relationType: string },
			_signal: AbortSignal,
			_onUpdate: AgentToolUpdateCallback,
			ctx: ExtensionContext,
		): Promise<AgentToolResult<undefined>> {
			const result = walkLensDescendants(ctx.cwd, params.parentId, params.relationType);
			return {
				details: undefined,
				content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
			};
		},
	});

	// ── Tool: walk-ancestors ─────────────────────────────────────────────
	// Reverse-direction counterpart to context-walk-descendants. Coexists
	// with the descendants tool — this tool is the parent-direction
	// traversal; FGAP-029 partial closure (TASK-036 / sub-phase 2.3).

	pi.registerTool({
		name: "walk-ancestors",
		label: "Walk Ancestors",
		description:
			"Walk closure-table ancestors of an item id under a given relation_type — reverse-direction counterpart to context-walk-descendants. Returns string[] of ancestor ids (may be empty if no parents or relations.json absent).",
		promptSnippet: "Walk closure-table ancestors under a relation_type",
		parameters: Type.Object({
			itemId: Type.String({ description: "Child item id whose ancestors are sought" }),
			relationType: Type.String({ description: "Relation type from config.relation_types[].canonical_id" }),
		}),
		async execute(
			_toolCallId: string,
			params: { itemId: string; relationType: string },
			_signal: AbortSignal,
			_onUpdate: AgentToolUpdateCallback,
			ctx: ExtensionContext,
		): Promise<AgentToolResult<undefined>> {
			const result = walkAncestorsByLens(ctx.cwd, params.itemId, params.relationType);
			const envelope = serializeForRead(result, { label: `ancestors of ${params.itemId}` });
			return {
				details: undefined,
				content: [{ type: "text", text: envelope.content }],
			};
		},
	});

	// ── Tool: find-references ────────────────────────────────────────────
	// Edge-level inspection of closure-table references incident on an item.
	// Returns Edge[] (NOT string[]) — distinguishing semantic vs the id-chain
	// walk-ancestors / context-walk-descendants tools. Coexists with both:
	// walk-* surfaces serve id-chain traversal; find-references serves
	// relation-typed edge inspection. TASK-037 / Phase 2 sub-phase 2.4 —
	// final Phase 2 atomic unit.

	pi.registerTool({
		name: "find-references",
		label: "Find References",
		description:
			"Find all closure-table edges incident on an item id (inbound, outbound, or both). Returns Edge[] preserving relation_type + ordinal per record — edge-level view, not the id-chain projection that walk-ancestors / context-walk-descendants emit.",
		promptSnippet: "Find closure-table edges incident on an item id",
		parameters: Type.Object({
			itemId: Type.String({ description: "Item id whose incident edges are sought" }),
			direction: Type.Optional(
				Type.Union([Type.Literal("inbound"), Type.Literal("outbound"), Type.Literal("both")], {
					description:
						"inbound: edges where child === itemId; outbound: edges where parent === itemId; both: union (default).",
				}),
			),
		}),
		async execute(
			_toolCallId: string,
			params: { itemId: string; direction?: "inbound" | "outbound" | "both" },
			_signal: AbortSignal,
			_onUpdate: AgentToolUpdateCallback,
			ctx: ExtensionContext,
		): Promise<AgentToolResult<undefined>> {
			const result = findReferencesInRepo(ctx.cwd, params.itemId, params.direction);
			const envelope = serializeForRead(result, { label: `edges on ${params.itemId}` });
			return {
				details: undefined,
				content: [{ type: "text", text: envelope.content }],
			};
		},
	});

	// ── Tool: gather-execution-context ───────────────────────────────────
	// Work-unit-driven context bundling per DEC-0017: read unit + read its
	// context-contract (by unit_kind) + walk each declared relation_type
	// bidirectionally per direction semantic + resolve reached ids to full
	// item payloads via the bulk resolver. Returns ContextBundle as one
	// structured payload, removing the N+1-read pattern that orchestrators
	// had to hand-roll before this primitive. Closes FGAP-031.
	// TASK-039 / Phase 3 sub-phase 3.2.

	pi.registerTool({
		name: "gather-execution-context",
		label: "Gather Execution Context",
		description:
			"Compose a ContextBundle for a work-unit by reading its context-contract (by unit_kind) and walking declared relation_types bidirectionally per direction semantic. Returns unit + perRelationType buckets of resolved items + traversal_depth + scoped_at. Per DEC-0017 substrate primitive serving harness-confined dispatch.",
		promptSnippet: "Compose ContextBundle for unit + context-contract-declared bundle_relation_types",
		parameters: Type.Object({
			unitId: Type.String({ description: "Work-unit id (e.g. TASK-NNN / DEC-NNNN / FGAP-NNN)" }),
			kind: Type.String({
				description:
					"Unit-kind type tag (e.g. 'task', 'decision', 'verification') matching a context-contract entry's unit_kind",
			}),
			maxDepth: Type.Optional(
				Type.Integer({
					minimum: 1,
					description: "Override per-relation-type max_depth via Math.min against each spec.max_depth",
				}),
			),
		}),
		async execute(
			_toolCallId: string,
			params: { unitId: string; kind: string; maxDepth?: number },
			_signal: AbortSignal,
			_onUpdate: AgentToolUpdateCallback,
			ctx: ExtensionContext,
		): Promise<AgentToolResult<undefined>> {
			const result = gatherExecutionContext(ctx.cwd, params);
			// whole: a structured ContextBundle (unit + perRelationType buckets) —
			// preserve the bundle shape rather than paging any single inner array.
			const envelope = serializeForRead(result, { whole: true, label: `bundle ${params.unitId}` });
			return {
				details: undefined,
				content: [{ type: "text", text: envelope.content }],
			};
		},
	});

	// ── Roadmap tools (Step 7 / pi-context PM-lens) ─────────────────────────

	// Strip non-serializable fields (suggestionTemplate fn, grouped Map) from
	// the embedded LoadedLensView records before tool serialization. Mirrors
	// the Map → object precedent used elsewhere for tool boundary shapes.
	const serializeRoadmapView = (view: RoadmapView): unknown => ({
		roadmap: view.roadmap,
		phases: view.phases.map((pv) => ({
			phase: pv.phase,
			lensView:
				"error" in pv.lensView
					? pv.lensView
					: {
							lens: pv.lensView.lens,
							items: pv.lensView.items,
							edges: pv.lensView.edges,
							grouped: Object.fromEntries(pv.lensView.grouped),
							uncategorized: pv.lensView.uncategorized,
						},
			status: pv.status,
			...(pv.milestone ? { milestone: pv.milestone } : {}),
			...(pv.milestoneSatisfied !== undefined ? { milestoneSatisfied: pv.milestoneSatisfied } : {}),
		})),
		phaseOrder: view.phaseOrder,
		cycles: view.cycles,
		edges: view.edges,
	});

	pi.registerTool({
		name: "context-roadmap-load",
		label: "Context: load roadmap",
		description:
			"Load a roadmap by id and return the materialized RoadmapView (phases, lens-views, status rollup, milestone resolution, scoped phase_depends_on edges, topo-ordered phaseOrder + cycles). Per DEC-0012 phase ordering lives in relations.json with relation_type='phase_depends_on'.",
		promptSnippet: "Load a roadmap by id",
		parameters: Type.Object({
			roadmapId: Type.String({ description: "ROADMAP-NNN id from <config.root>/roadmap.json" }),
		}),
		async execute(
			_toolCallId: string,
			params: { roadmapId: string },
			_signal: AbortSignal,
			_onUpdate: AgentToolUpdateCallback,
			ctx: ExtensionContext,
		): Promise<AgentToolResult<undefined>> {
			const view = loadRoadmap(ctx.cwd, params.roadmapId);
			if ("error" in view) {
				const envErr = serializeForRead(view, { whole: true, label: `roadmap ${params.roadmapId} (error)` });
				return {
					details: undefined,
					content: [{ type: "text", text: envErr.content }],
				};
			}
			// whole: a structured RoadmapView (phases + lens-views + rollups) — keep
			// the view shape intact rather than paging an inner array.
			const envelope = serializeForRead(serializeRoadmapView(view), {
				whole: true,
				label: `roadmap ${params.roadmapId}`,
			});
			return {
				details: undefined,
				content: [{ type: "text", text: envelope.content }],
			};
		},
	});

	pi.registerTool({
		name: "context-roadmap-render",
		label: "Context: render roadmap",
		description:
			"Render a roadmap by id as pure-textual markdown — phase order list, per-phase adjacency lines (sourced from view.edges, alphabetically sorted), status rollup counts, milestone resolution, exit criteria. NO mermaid / graph syntax: per-phase **Depends on:** lines come strictly from authored phase_depends_on edges scoped to in-roadmap phases.",
		promptSnippet: "Render a roadmap as markdown",
		parameters: Type.Object({
			roadmapId: Type.String({ description: "ROADMAP-NNN id from <config.root>/roadmap.json" }),
		}),
		async execute(
			_toolCallId: string,
			params: { roadmapId: string },
			_signal: AbortSignal,
			_onUpdate: AgentToolUpdateCallback,
			ctx: ExtensionContext,
		): Promise<AgentToolResult<undefined>> {
			const view = loadRoadmap(ctx.cwd, params.roadmapId);
			if ("error" in view) {
				return {
					details: undefined,
					content: [{ type: "text", text: JSON.stringify(view, null, 2) }],
				};
			}
			const naming = loadContext(ctx.cwd).config?.naming;
			return {
				details: undefined,
				content: [{ type: "text", text: renderRoadmap(view, naming) }],
			};
		},
	});

	pi.registerTool({
		name: "context-roadmap-validate",
		label: "Context: validate roadmap(s)",
		description:
			"Validate every roadmap × phase × milestone in <config.root>/roadmap.json. Codes: roadmap_lens_missing, roadmap_phase_dep_missing, roadmap_phase_cycle, roadmap_composition_cycle, roadmap_milestone_evidence_block_missing, roadmap_milestone_query_invalid, roadmap_status_unknown_value. Display strings flow through config.display_strings (pi-context divergence). Optional roadmapId filter restricts issue list to a single roadmap.",
		promptSnippet: "Validate roadmaps",
		parameters: Type.Object({
			roadmapId: Type.Optional(
				Type.String({ description: "Filter to issues matching this roadmap_id (omit for full-project validation)" }),
			),
		}),
		async execute(
			_toolCallId: string,
			params: { roadmapId?: string },
			_signal: AbortSignal,
			_onUpdate: AgentToolUpdateCallback,
			ctx: ExtensionContext,
		): Promise<AgentToolResult<undefined>> {
			const result = validateRoadmaps(ctx.cwd);
			const filtered = params.roadmapId
				? result.issues.filter((i) => !i.roadmap_id || i.roadmap_id === params.roadmapId)
				: result.issues;
			return {
				details: undefined,
				content: [{ type: "text", text: JSON.stringify({ status: result.status, issues: filtered }, null, 2) }],
			};
		},
	});

	pi.registerTool({
		name: "context-roadmap-list",
		label: "Context: list roadmaps",
		description:
			"List every roadmap in <config.root>/roadmap.json with id, title, optional status, and phase count. Returns [] when roadmap.json absent (opt-in block; absence is the truthful answer).",
		promptSnippet: "List roadmaps",
		parameters: Type.Object({}),
		async execute(
			_toolCallId: string,
			_params: Record<string, never>,
			_signal: AbortSignal,
			_onUpdate: AgentToolUpdateCallback,
			ctx: ExtensionContext,
		): Promise<AgentToolResult<undefined>> {
			return {
				details: undefined,
				content: [{ type: "text", text: JSON.stringify(listRoadmaps(ctx.cwd), null, 2) }],
			};
		},
	});

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
		install: {
			description: "Copy schemas and starter blocks declared in .project/config.json from the package samples catalog",
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
						"Nothing declared in installed_schemas / installed_blocks — edit .project/config.json to add entries.",
					);
				}
				const level = result.notFound.length > 0 ? "warning" : "info";
				ctx.ui.notify(lines.join("\n"), level);
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
						"No roadmaps found. Install the roadmap block via .project/config.json's installed_blocks, then author roadmap.json.",
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

export type { CompleteTaskResult, ItemLocation } from "./context-sdk.js";
// Re-export for consumers
export {
	blockStructure,
	buildIdIndex,
	CONTEXT_BLOCK_TYPES,
	completeTask,
	findAppendableBlocks,
	resolveItemById,
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
