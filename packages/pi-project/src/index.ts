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
} from "@mariozechner/pi-coding-agent";
import { truncateHead } from "@mariozechner/pi-coding-agent";
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
import { PROJECT_DIR, SCHEMAS_DIR } from "./project-dir.js";
import { completeTask, findAppendableBlocks, projectState, validateProject } from "./project-sdk.js";
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
	const workflowDir = path.join(ctx.cwd, PROJECT_DIR);
	const schemasDir = path.join(workflowDir, SCHEMAS_DIR);

	if (!fs.existsSync(schemasDir)) {
		ctx.ui.notify(`No ${PROJECT_DIR}/${SCHEMAS_DIR}/ directory found.`, "warning");
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
function initProject(cwd: string): { created: string[]; skipped: string[] } {
	const projectDir = path.join(cwd, PROJECT_DIR);
	const schemasDir = path.join(projectDir, SCHEMAS_DIR);
	const phasesDir = path.join(projectDir, "phases");

	const defaultsDir = path.resolve(import.meta.dirname, "..", "defaults");
	const defaultSchemasDir = path.join(defaultsDir, "schemas");
	const defaultBlocksDir = path.join(defaultsDir, "blocks");

	const created: string[] = [];
	const skipped: string[] = [];

	// Create directories
	for (const dir of [projectDir, schemasDir, phasesDir]) {
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
			created.push(`${path.relative(cwd, dir)}/`);
		}
	}

	// Copy default schemas
	if (fs.existsSync(defaultSchemasDir)) {
		for (const file of fs.readdirSync(defaultSchemasDir)) {
			const dest = path.join(schemasDir, file);
			if (fs.existsSync(dest)) {
				skipped.push(`${SCHEMAS_DIR}/${file}`);
			} else {
				fs.copyFileSync(path.join(defaultSchemasDir, file), dest);
				created.push(`${SCHEMAS_DIR}/${file}`);
			}
		}
	}

	// Create default block files
	if (fs.existsSync(defaultBlocksDir)) {
		for (const file of fs.readdirSync(defaultBlocksDir)) {
			const dest = path.join(projectDir, file);
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
 * /project init — scaffold .project/ directory with default schemas and
 * empty block files. Idempotent: skips files that already exist.
 */
function handleInit(ctx: ExtensionCommandContext): void {
	const { created, skipped } = initProject(ctx.cwd);

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

	// ── Tool: project-init ──────────────────────────────────────────────────

	pi.registerTool({
		name: "project-init",
		label: "Project Init",
		description: "Initialize .project/ directory with default schemas and empty block files.",
		promptSnippet: "Initialize .project/ directory with default schemas and blocks",
		parameters: Type.Object({}),
		async execute(
			_toolCallId: string,
			_params: Record<string, never>,
			_signal: AbortSignal,
			_onUpdate: AgentToolUpdateCallback,
			ctx: ExtensionContext,
		): Promise<AgentToolResult<undefined>> {
			const result = initProject(ctx.cwd);
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

	// ── Command: /project ──────────────────────────────────────────────────

	interface SubcommandEntry {
		description: string;
		handler: (args: string, ctx: ExtensionCommandContext) => Promise<void> | void;
		getCompletions?: (argPrefix: string) => Array<{ value: string; label: string; description?: string }> | null;
	}

	const PROJECT_SUBCOMMANDS: Record<string, SubcommandEntry> = {
		init: {
			description: "Initialize .project/ with schemas and default blocks",
			handler: (_args, ctx) => handleInit(ctx),
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
						lines.push(`${icon} [${issue.block}] ${issue.field}: ${issue.message}`);
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
