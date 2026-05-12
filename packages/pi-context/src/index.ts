/**
 * Extension entry point for pi-project — registers block tools and the
 * /project command for project state management.
 */
import fs from "node:fs";
import path from "node:path";
import type {
	AgentToolResult,
	AgentToolUpdateCallback,
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { truncateHead } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
	appendToBlock,
	appendToNestedArray,
	readBlock,
	readBlockDir,
	removeFromBlock,
	removeFromNestedArray,
	updateItemInBlock,
	updateNestedArrayItem,
	writeBlock,
} from "./block-api.js";
import {
	buildCurationSuggestions,
	edgesForLensByName,
	loadLensView,
	renderLensView,
	validateProjectRelations,
	walkLensDescendants,
} from "./lens-view.js";
import { type ConfigBlock, getProjectContext, loadConfig, projectRoot } from "./project-context.js";
import {
	BootstrapNotFoundError,
	projectDir,
	SCHEMAS_DIR,
	schemaPath,
	schemasDir,
	writeBootstrapPointer,
} from "./project-dir.js";
import {
	completeTask,
	filterBlockItems,
	findAppendableBlocks,
	projectState,
	resolveItemById,
	validateProject,
} from "./project-sdk.js";
import { listRoadmaps, loadRoadmap, type RoadmapView, renderRoadmap, validateRoadmaps } from "./roadmap-plan.js";
import { readSchema } from "./schema-write.js";
import { checkForUpdates } from "./update-check.js";

// ── Command handlers ────────────────────────────────────────────────────────

/**
 * /project status — derives project state from authoritative sources and
 * sends it as a structured message. Available to human, LLM, and system.
 */
function handleStatus(ctx: ExtensionCommandContext, pi: ExtensionAPI): void {
	const state = projectState(ctx.cwd);

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
		customType: "project-status",
		content: lines.join("\n"),
		display: true,
	});
}

/**
 * /project add-work — discovers appendable blocks from schemas,
 * returns a structured instruction for main context to extract
 * items from the conversation into typed JSON blocks.
 */
async function handleAddWork(args: string, ctx: ExtensionCommandContext, pi: ExtensionAPI): Promise<void> {
	let workflowDir: string;
	let schemasDirPath: string;
	try {
		workflowDir = projectDir(ctx.cwd);
		schemasDirPath = schemasDir(ctx.cwd);
	} catch (err) {
		if (err instanceof BootstrapNotFoundError) {
			ctx.ui.notify(
				"No .pi-context.json bootstrap pointer found. Run /project init first to bootstrap the substrate.",
				"error",
			);
			return;
		}
		throw err;
	}

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
			customType: "project-add-work",
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
 * Initialize .project/ directory with default schemas and empty block files.
 * Idempotent: skips files that already exist. Shared by the /project init
 * command handler and the project-init tool.
 */
function initProject(cwd: string, contextDir: string): { created: string[]; skipped: string[] } {
	// FIRST action — write the `.pi-context.json` bootstrap pointer carrying
	// the caller-supplied `contextDir` (required per DEC-0015) so every
	// subsequent path-builder call (projectDir / schemasDir) resolves through
	// the freshly-written pointer rather than throwing BootstrapNotFoundError.
	// writeBootstrapPointer is idempotent (atomic tmp+rename) so re-running
	// initProject after a prior init does not corrupt the pointer.
	if (!fs.existsSync(path.join(cwd, ".pi-context.json"))) {
		writeBootstrapPointer(cwd, contextDir);
	}

	const projectDirPath = projectDir(cwd);
	const schemasDirPath = schemasDir(cwd);
	const phasesDir = path.join(projectDirPath, "phases");

	const defaultsDir = path.resolve(import.meta.dirname, "..", "defaults");
	const defaultSchemasDir = path.join(defaultsDir, "schemas");
	const defaultBlocksDir = path.join(defaultsDir, "blocks");

	const created: string[] = [];
	const skipped: string[] = [];

	// Create directories
	for (const dir of [projectDirPath, schemasDirPath, phasesDir]) {
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
			created.push(`${path.relative(cwd, dir)}/`);
		}
	}

	// Copy default schemas — display strings keep the legacy `schemas/` literal
	// (cosmetic; user-facing path display).
	if (fs.existsSync(defaultSchemasDir)) {
		for (const file of fs.readdirSync(defaultSchemasDir)) {
			const dest = path.join(schemasDirPath, file);
			if (fs.existsSync(dest)) {
				skipped.push(`schemas/${file}`);
			} else {
				fs.copyFileSync(path.join(defaultSchemasDir, file), dest);
				created.push(`schemas/${file}`);
			}
		}
	}

	// Create default block files
	if (fs.existsSync(defaultBlocksDir)) {
		for (const file of fs.readdirSync(defaultBlocksDir)) {
			const dest = path.join(projectDirPath, file);
			if (fs.existsSync(dest)) {
				skipped.push(file);
			} else {
				fs.copyFileSync(path.join(defaultBlocksDir, file), dest);
				created.push(file);
			}
		}
	}

	return { created, skipped };
}

/**
 * Result shape from installProject. installed/updated/skipped/notFound carry
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
 * /project install opt-in mechanism (DEC-0011). Reads config.installed_schemas
 * and config.installed_blocks, copies declared assets from the package
 * registry/ catalog into the project's substrate root + schemas dir.
 *
 *   - Default behavior is skip-if-exists. With overwrite=true, replaces the
 *     destination file and reports as "updated" rather than "installed".
 *   - Sources missing from the registry are reported as "notFound".
 *   - Empty install lists are not an error — the result is a clean no-op.
 */
export function installProject(cwd: string, options: { overwrite?: boolean } = {}): InstallResult {
	const result: InstallResult = { installed: [], updated: [], skipped: [], notFound: [] };
	const overwrite = options.overwrite === true;

	let config: ConfigBlock | null;
	let destRoot: string;
	try {
		config = loadConfig(cwd);
		if (!config) {
			result.error = "No config.json found in substrate dir — run /project init first.";
			return result;
		}
		destRoot = projectRoot(cwd);
	} catch (err) {
		if (err instanceof BootstrapNotFoundError) {
			result.error = "No .pi-context.json bootstrap pointer found. Run /project init first to bootstrap the substrate.";
			return result;
		}
		throw err;
	}

	const registryRoot = path.resolve(import.meta.dirname, "..", "registry");
	// destRoot is resolver-aware via projectRoot(cwd) — it already cascades
	// through resolveContextDir under the hood (project-context.ts:projectRoot
	// fallback). SCHEMAS_DIR is composed as a bare segment off that
	// resolver-aware root; this is intentional and DEC-0015-compliant
	// (no hardcoded substrate-dir literal here — `schemas/` is a substrate
	// internal-layout constant, not the substrate-dir name itself).
	const schemasRoot = path.join(destRoot, SCHEMAS_DIR);
	if (!fs.existsSync(schemasRoot)) fs.mkdirSync(schemasRoot, { recursive: true });

	const installedSchemas = (config as ConfigBlock).installed_schemas ?? [];
	for (const name of installedSchemas) {
		const sourceFile = path.join(registryRoot, "schemas", `${name}.schema.json`);
		const destFile = path.join(schemasRoot, `${name}.schema.json`);
		const relDest = `${SCHEMAS_DIR}/${name}.schema.json`;
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

	const installedBlocks = (config as ConfigBlock).installed_blocks ?? [];
	for (const name of installedBlocks) {
		const sourceFile = path.join(registryRoot, "blocks", `${name}.json`);
		const destFile = path.join(destRoot, `${name}.json`);
		const relDest = `${name}.json`;
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
 * /project init — scaffold .project/ directory with default schemas and
 * empty block files. Idempotent: skips files that already exist.
 */
function handleInit(args: string, ctx: ExtensionCommandContext): void {
	const contextDir = args.trim().split(/\s+/)[0];
	if (!contextDir) {
		ctx.ui.notify(
			"/project init requires a substrate dir name (e.g. '/project init .project' or '/project init .context'). Per DEC-0015, no default.",
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

// ── Extension factory ───────────────────────────────────────────────────────

const extension = (pi: ExtensionAPI) => {
	// ── Update check on session start (non-blocking) ───────────────────
	pi.on("session_start", async (_event, ctx) => {
		checkForUpdates((msg, level) => ctx.ui.notify(msg, level)).catch(() => {});
	});

	// ── Tool: append-block-item ─────────────────────────────────────────

	pi.registerTool({
		name: "append-block-item",
		label: "Append Block Item",
		description: "Append an item to an array in a project block file. Schema validation is automatic.",
		promptSnippet: "Append items to project blocks (issues, decisions, or any user-defined block)",
		parameters: Type.Object({
			block: Type.String({ description: "Block name (e.g., 'issues', 'decisions')" }),
			arrayKey: Type.String({ description: "Array key in the block (e.g., 'issues', 'decisions')" }),
			item: Type.Unknown({ description: "Item object to append — must conform to block schema" }),
		}),
		async execute(
			_toolCallId: string,
			params: { block: string; arrayKey: string; item: Record<string, unknown> },
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
			const jsonStr = JSON.stringify(result, null, 2);
			const truncated = truncateHead(jsonStr);
			let text = truncated.content;
			if (truncated.truncated) {
				text += `\n\n[Truncated: ${truncated.totalBytes} bytes exceeds 50KB limit. Full content: .project/${params.subdir}/]`;
			}
			return {
				details: undefined,
				content: [{ type: "text", text }],
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
			const jsonStr = JSON.stringify(result, null, 2);
			const truncated = truncateHead(jsonStr);
			let text = truncated.content;
			if (truncated.truncated) {
				text += `\n\n[Truncated: ${truncated.totalBytes} bytes exceeds 50KB limit. Full content: .project/${params.block}.json]`;
			}
			return {
				details: undefined,
				content: [{ type: "text", text }],
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

	// ── Tool: project-status ────────────────────────────────────────────────

	pi.registerTool({
		name: "project-status",
		label: "Project Status",
		description: "Get derived project state — source metrics, block summaries, planning lifecycle status.",
		promptSnippet: "Get project state — source metrics, block summaries, planning lifecycle status",
		parameters: Type.Object({}),
		async execute(
			_toolCallId: string,
			_params: Record<string, never>,
			_signal: AbortSignal,
			_onUpdate: AgentToolUpdateCallback,
			ctx: ExtensionContext,
		): Promise<AgentToolResult<undefined>> {
			const result = projectState(ctx.cwd);
			return {
				details: undefined,
				content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
			};
		},
	});

	// ── Tool: project-validate ──────────────────────────────────────────────

	pi.registerTool({
		name: "project-validate",
		label: "Project Validate",
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
			const result = validateProject(ctx.cwd);
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
			"Read the substrate config.json as structured JSON — vocabulary, lenses, relation_types, status_buckets, display_strings, layers, block_kinds, installed_schemas, installed_blocks.",
		promptSnippet: "Read project config — vocabulary, lenses, relation_types, status_buckets",
		parameters: Type.Object({}),
		async execute(
			_toolCallId: string,
			_params: Record<string, never>,
			_signal: AbortSignal,
			_onUpdate: AgentToolUpdateCallback,
			ctx: ExtensionContext,
		): Promise<AgentToolResult<undefined>> {
			const config = loadConfig(ctx.cwd);
			const configPath = path.join(projectDir(ctx.cwd), "config.json");
			const result = { config, configPath };
			const jsonStr = JSON.stringify(result, null, 2);
			const truncated = truncateHead(jsonStr);
			let text = truncated.content;
			if (truncated.truncated) {
				text += `\n\n[Truncated: ${truncated.totalBytes} bytes exceeds 50KB limit. Full content: ${configPath}]`;
			}
			return {
				details: undefined,
				content: [{ type: "text", text }],
			};
		},
	});

	// ── Tool: read-schema ───────────────────────────────────────────────────

	pi.registerTool({
		name: "read-schema",
		label: "Read Schema",
		description: "Read a substrate schema by name as parsed JSON. Returns null when the schema file is absent.",
		promptSnippet: "Read a block schema as structured JSON",
		parameters: Type.Object({
			schemaName: Type.String({
				description: "Schema name without extension (e.g., 'tasks', 'decisions', 'issues')",
			}),
		}),
		async execute(
			_toolCallId: string,
			params: { schemaName: string },
			_signal: AbortSignal,
			_onUpdate: AgentToolUpdateCallback,
			ctx: ExtensionContext,
		): Promise<AgentToolResult<undefined>> {
			const schema = readSchema(ctx.cwd, params.schemaName);
			const schemaPathStr = schemaPath(ctx.cwd, params.schemaName);
			const result = { schema, schemaPath: schemaPathStr };
			const jsonStr = JSON.stringify(result, null, 2);
			const truncated = truncateHead(jsonStr);
			let text = truncated.content;
			if (truncated.truncated) {
				text += `\n\n[Truncated: ${truncated.totalBytes} bytes exceeds 50KB limit. Full content: ${schemaPathStr}]`;
			}
			return {
				details: undefined,
				content: [{ type: "text", text }],
			};
		},
	});

	// ── Tool: project-init ──────────────────────────────────────────────────

	pi.registerTool({
		name: "project-init",
		label: "Project Init",
		description: "Initialize .project/ directory with default schemas and empty block files.",
		promptSnippet: "Initialize .project/ directory with default schemas and blocks",
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

	// ── Tool: filter-block-items ──────────────────────────────────────────

	pi.registerTool({
		name: "filter-block-items",
		label: "Filter Block Items",
		description:
			"Filter the array items of a block by a single-field predicate (eq / neq / in / matches). Discovers the single top-level array property in the block; items missing the predicate field are never matched. Wraps the canonical readBlock + caller-side filter into one queryable surface; never mutates the block.",
		promptSnippet: "Filter a block's items by a predicate — eq / neq / in / matches against a single field",
		parameters: Type.Object({
			block: Type.String({ description: "Block name (e.g., 'tasks', 'decisions', 'framework-gaps')" }),
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
			const jsonStr = JSON.stringify(result, null, 2);
			const truncated = truncateHead(jsonStr);
			let text = truncated.content;
			if (truncated.truncated) {
				text += `\n\n[Truncated: ${truncated.totalBytes} bytes exceeds 50KB limit.]`;
			}
			return {
				details: undefined,
				content: [{ type: "text", text }],
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

	// ── Tool: project-validate-relations ──────────────────────────────────

	pi.registerTool({
		name: "project-validate-relations",
		label: "Project Validate Relations",
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
			const result = validateProjectRelations(ctx.cwd);
			return {
				details: undefined,
				content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
			};
		},
	});

	// ── Tool: project-edges-for-lens ──────────────────────────────────────

	pi.registerTool({
		name: "project-edges-for-lens",
		label: "Project Edges For Lens",
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
			return {
				details: undefined,
				content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
			};
		},
	});

	// ── Tool: project-walk-descendants ────────────────────────────────────

	pi.registerTool({
		name: "project-walk-descendants",
		label: "Project Walk Descendants",
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
		name: "project-roadmap-load",
		label: "Project: load roadmap",
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
				return {
					details: undefined,
					content: [{ type: "text", text: JSON.stringify(view, null, 2) }],
				};
			}
			return {
				details: undefined,
				content: [{ type: "text", text: JSON.stringify(serializeRoadmapView(view), null, 2) }],
			};
		},
	});

	pi.registerTool({
		name: "project-roadmap-render",
		label: "Project: render roadmap",
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
			const naming = getProjectContext(ctx.cwd).config?.naming;
			return {
				details: undefined,
				content: [{ type: "text", text: renderRoadmap(view, naming) }],
			};
		},
	});

	pi.registerTool({
		name: "project-roadmap-validate",
		label: "Project: validate roadmap(s)",
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
		name: "project-roadmap-list",
		label: "Project: list roadmaps",
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

	// ── Command: /project ──────────────────────────────────────────────────

	interface SubcommandEntry {
		description: string;
		handler: (args: string, ctx: ExtensionCommandContext) => Promise<void> | void;
		getCompletions?: (argPrefix: string) => Array<{ value: string; label: string; description?: string }> | null;
	}

	const PROJECT_SUBCOMMANDS: Record<string, SubcommandEntry> = {
		init: {
			description: "Initialize .project/ with schemas and default blocks",
			handler: (args, ctx) => handleInit(args, ctx),
		},
		install: {
			description: "Copy schemas and starter blocks declared in .project/config.json from the package registry",
			handler: (args, ctx) => {
				const overwrite = /(^|\s)--update(\s|$)/.test(args);
				const result = installProject(ctx.cwd, { overwrite });
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
					lines.push(`Not found in registry (${result.notFound.length}): ${result.notFound.join(", ")}`);
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
		view: {
			description: "Render a configured lens view (groupByLens projection) into the conversation",
			handler: (args, ctx) => {
				const lensId = args.trim().split(/\s+/)[0];
				if (!lensId) {
					ctx.ui.notify("Usage: /project view <lensId>", "error");
					return;
				}
				const result = loadLensView(ctx.cwd, lensId);
				if ("error" in result) {
					ctx.ui.notify(result.error, "error");
					return;
				}
				const config = getProjectContext(ctx.cwd).config;
				ctx.ui.notify(renderLensView(result, config?.naming), "info");
			},
		},
		"lens-curate": {
			description: "Walk uncategorized items in a lens and surface bin-assignment suggestions for the LLM to act on",
			handler: (args, ctx) => {
				const lensId = args.trim().split(/\s+/)[0];
				if (!lensId) {
					ctx.ui.notify("Usage: /project lens-curate <lensId>", "error");
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
						customType: "project-lens-curate",
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
					ctx.ui.notify("Usage: /project roadmap-view <ROADMAP-id>", "error");
					return;
				}
				const view = loadRoadmap(ctx.cwd, roadmapId);
				if ("error" in view) {
					ctx.ui.notify(view.error, "error");
					return;
				}
				const naming = getProjectContext(ctx.cwd).config?.naming;
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
				const result = validateProject(ctx.cwd);
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
				const lines = ["Usage: /project <subcommand> [args]", ""];
				for (const [name, entry] of Object.entries(PROJECT_SUBCOMMANDS)) {
					lines.push(`  ${name.padEnd(12)} ${entry.description}`);
				}
				ctx.ui.notify(lines.join("\n"), "info");
			},
		},
	};

	pi.registerCommand("project", {
		description: "Project state management",
		getArgumentCompletions: (prefix: string) => {
			const tokens = prefix.split(/\s+/);
			const partial = tokens[tokens.length - 1];

			if (tokens.length <= 1) {
				return Object.entries(PROJECT_SUBCOMMANDS)
					.filter(([name]) => name.startsWith(partial))
					.map(([name, entry]) => ({ value: name, label: name, description: entry.description }));
			}

			const subName = tokens[0];
			const sub = PROJECT_SUBCOMMANDS[subName];
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

			const entry = PROJECT_SUBCOMMANDS[subcommand];
			if (!entry) {
				const names = Object.keys(PROJECT_SUBCOMMANDS).join(", ");
				ctx.ui.notify(`Unknown subcommand: ${subcommand}. Available: ${names}`, "warning");
				return;
			}

			await entry.handler(rest, ctx);
		},
	});
};

export default extension;

export type { CompleteTaskResult, ItemLocation } from "./project-sdk.js";
// Re-export for consumers
export {
	blockStructure,
	buildIdIndex,
	completeTask,
	findAppendableBlocks,
	PROJECT_BLOCK_TYPES,
	resolveItemById,
	schemaInfo,
	schemaVocabulary,
} from "./project-sdk.js";
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
