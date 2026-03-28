/**
 * Extension entry point — registers workflow tools and the `/workflow` command
 * for discovering, executing, and managing multi-step workflow runs.
 */

import fs from "node:fs";
import path from "node:path";
import { syncSkillsToUser } from "@davidorex/pi-project/src/sync-skills.js";
import type {
	AgentToolResult,
	AgentToolUpdateCallback,
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { truncateHead } from "@mariozechner/pi-coding-agent";
import { Key } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { createAgentLoader } from "./agent-spec.js";
import type { IncompleteRun } from "./checkpoint.js";
import { findIncompleteRun, formatIncompleteRun, validateResumeCompatibility } from "./checkpoint.js";
import type { WorkflowResult, WorkflowSpec } from "./types.js";
import { discoverWorkflows, findWorkflow } from "./workflow-discovery.js";
import { executeWorkflow, requestPause } from "./workflow-executor.js";
import {
	availableAgents,
	availableSchemas,
	availableTemplates,
	filterNames,
	stepTypes,
	validateWorkflow,
} from "./workflow-sdk.js";
import { WORKFLOWS_DIR } from "./workflows-dir.js";

// ── Helper functions ────────────────────────────────────────────────────────

function listWorkflowNames(cwd: string): string {
	const workflows = discoverWorkflows(cwd);
	if (workflows.length === 0) return "(none)";
	return workflows.map((w) => w.name).join(", ");
}

/**
 * Summarize a JSON Schema's expected shape for error messages.
 * Produces something like: { path: string (required), question?: string }
 */
function _summarizeInputSchema(schema: Record<string, unknown> | undefined): string {
	if (!schema) return "(any)";
	const props = schema.properties as Record<string, Record<string, unknown>> | undefined;
	if (!props) return JSON.stringify(schema);
	const required = new Set(Array.isArray(schema.required) ? schema.required : []);
	const fields = Object.entries(props).map(([key, val]) => {
		const type = val?.type || "unknown";
		const req = required.has(key);
		return req ? `${key}: ${type} (required)` : `${key}?: ${type}`;
	});
	return `{ ${fields.join(", ")} }`;
}

/**
 * Prompt for workflow input fields. Supports `source` field for select-from-file.
 * Returns the input object, or null if user cancelled.
 */
async function promptForInput(
	spec: { input?: unknown },
	ctx: ExtensionCommandContext,
): Promise<Record<string, unknown> | null> {
	const schema = spec.input as Record<string, unknown> | undefined;
	if (!schema) return {};

	const props = schema.properties as Record<string, Record<string, unknown>> | undefined;
	const required = new Set(Array.isArray(schema.required) ? (schema.required as string[]) : []);
	if (!props) return {};

	const inputObj: Record<string, unknown> = {};
	for (const [key, val] of Object.entries(props)) {
		if (!required.has(key) || val?.default !== undefined) continue;
		if (!ctx.hasUI) {
			ctx.ui.notify("Workflow input prompts require interactive mode.", "warning");
			return null;
		}

		const source = val?.source as Record<string, unknown> | undefined;
		if (source?.file && source?.array) {
			// Source-based select: load options from a JSON file
			const filePath = String(source.file);
			const arrayField = String(source.array);
			const labelFields = Array.isArray(source.label) ? (source.label as string[]) : [String(source.label || "id")];
			const valueField = String(source.value || "id");
			const filter = source.filter as Record<string, unknown> | undefined;

			try {
				const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
				let items = data[arrayField] as Record<string, unknown>[];
				if (filter) {
					items = items.filter((item) => Object.entries(filter).every(([k, v]) => item[k] === v));
				}
				if (items.length === 0) {
					ctx.ui.notify(`No items found in ${filePath} matching filter.`, "warning");
					return null;
				}
				const formatLabel = (item: Record<string, unknown>) =>
					labelFields.map((f) => String(item[f] ?? "")).join(" — ");
				const options = items.map(formatLabel);
				const desc = (val?.description as string) || key;
				const selected = await ctx.ui.select(desc, options);
				if (selected == null) return null;
				// Map label back to value
				const selectedItem = items.find((item) => formatLabel(item) === selected);
				inputObj[key] = selectedItem ? String(selectedItem[valueField]) : selected;
			} catch {
				ctx.ui.notify(`Failed to load options from ${filePath}`, "warning");
				return null;
			}
		} else {
			// Standard text input
			const type = (val?.type as string) || "string";
			const desc = (val?.description as string) || "";
			const prompt = desc ? `${key} (${type}): ${desc}` : `${key} (${type})`;
			const value = await ctx.ui.input(prompt);
			if (value == null) return null;
			if (type === "number") {
				inputObj[key] = Number(value);
			} else if (type === "array" || type === "object") {
				try {
					inputObj[key] = JSON.parse(value);
				} catch {
					inputObj[key] = value;
				}
			} else {
				inputObj[key] = value;
			}
		}
	}
	return inputObj;
}

function formatToolResult(result: WorkflowResult): string {
	const status = result.status === "completed" ? "completed" : "failed";
	const stepSummary = Object.entries(result.steps)
		.map(([name, s]) => `${s.status === "completed" ? "\u2713" : "\u2717"} ${name}`)
		.join(", ");
	return `Workflow '${result.workflow}' ${status}: ${stepSummary}. Run dir: ${result.runDir}`;
}

// ── Shared logic (used by both tools and commands) ──────────────────────────

/**
 * Validate one or all workflow specs. Returns structured results suitable
 * for both the /workflow validate command and the workflow-validate tool.
 */
function runValidation(
	cwd: string,
	name?: string,
): {
	found: boolean;
	results: { name: string; valid: boolean; issues: import("./workflow-sdk.js").ValidationIssue[] }[];
} {
	const workflows = name ? ([findWorkflow(name, cwd)].filter(Boolean) as WorkflowSpec[]) : discoverWorkflows(cwd);

	if (workflows.length === 0) return { found: false, results: [] };

	const results = workflows.map((spec) => {
		const result = validateWorkflow(spec, cwd);
		return { name: spec.name, valid: result.valid, issues: result.issues };
	});

	return { found: true, results };
}

/**
 * Aggregate workflow vocabulary — step types, filters, available agents,
 * workflows, schemas, templates. Shared between the /workflow status
 * command and the workflow-status tool.
 */
function gatherWorkflowStatus(cwd: string): Record<string, unknown> {
	const workflows = discoverWorkflows(cwd);
	const agents = availableAgents(cwd);
	const schemas = availableSchemas(cwd);
	const templates = availableTemplates(cwd);
	const types = stepTypes();
	const filters = filterNames();

	return {
		stepTypes: types.map((t) => t.name),
		filters,
		workflows: workflows.map((w) => ({ name: w.name, description: w.description, source: w.source })),
		agents: agents.map((a) => ({
			name: a.name,
			role: a.role,
			description: a.description,
			model: a.model,
			tools: a.tools,
			outputFormat: a.outputFormat,
		})),
		schemas: schemas.length,
		templates: templates.length,
	};
}

/**
 * Initialize .workflows/ directory structure. Returns list of created
 * directory paths (relative to cwd). Shared between the /workflow init
 * command and the workflow-init tool.
 */
function initWorkflowDirs(cwd: string): { created: string[] } {
	const workflowsDir = path.join(cwd, WORKFLOWS_DIR);
	const runsDir = path.join(workflowsDir, "runs");

	const created: string[] = [];

	for (const dir of [workflowsDir, runsDir]) {
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
			created.push(`${path.relative(cwd, dir)}/`);
		}
	}

	return { created };
}

// ── Command handlers ────────────────────────────────────────────────────────

async function handleList(ctx: ExtensionCommandContext, pi: ExtensionAPI): Promise<void> {
	const workflows = discoverWorkflows(ctx.cwd);
	if (workflows.length === 0) {
		ctx.ui.notify("No workflows found in .workflows/ or ~/.pi/agent/workflows/", "info");
		return;
	}

	const options = workflows.map((w) => {
		const source = w.source === "project" ? "[project]" : "[user]";
		const desc = w.description ? ` — ${w.description}` : "";
		return `${w.name} ${source}${desc}`;
	});

	if (!ctx.hasUI) {
		ctx.ui.notify("Workflow list requires interactive mode.", "warning");
		return;
	}
	const selected = await ctx.ui.select("Run workflow", options);
	if (!selected) return; // user cancelled

	const name = selected.split(" ")[0];
	const spec = findWorkflow(name, ctx.cwd);
	if (!spec) {
		ctx.ui.notify(`Workflow '${name}' not found.`, "warning");
		return;
	}

	// Prompt for required input fields
	const input = await promptForInput(spec, ctx);
	if (input === null) return;

	const inputJson = Object.keys(input).length > 0 ? JSON.stringify(input) : undefined;
	const rawArgs = inputJson ? `${name} --input '${inputJson}'` : name;
	await handleRun(rawArgs, ctx, pi);
}

async function handleRun(rawArgs: string, ctx: ExtensionCommandContext, pi: ExtensionAPI): Promise<void> {
	// Extract workflow name (first token) and --input value (everything after --input flag)
	const inputFlagIdx = rawArgs.indexOf("--input");
	let namePart: string;
	let inputJson: string | undefined;

	if (inputFlagIdx !== -1) {
		namePart = rawArgs.slice(0, inputFlagIdx).trim();
		inputJson = rawArgs.slice(inputFlagIdx + "--input".length).trim();
		// Strip surrounding single or double quotes
		if (
			(inputJson.startsWith("'") && inputJson.endsWith("'")) ||
			(inputJson.startsWith('"') && inputJson.endsWith('"'))
		) {
			inputJson = inputJson.slice(1, -1);
		}
	} else {
		namePart = rawArgs.trim();
	}

	const name = namePart.split(/\s+/)[0];
	if (!name) {
		ctx.ui.notify("Usage: /workflow run <name> [--input '<json>']", "warning");
		return;
	}

	const spec = findWorkflow(name, ctx.cwd);
	if (!spec) {
		ctx.ui.notify(`Workflow '${name}' not found.`, "warning");
		return;
	}

	// Check for resumable run before starting fresh
	const incomplete = findIncompleteRun(ctx.cwd, spec.name);
	if (incomplete) {
		const compat = validateResumeCompatibility(incomplete.state, spec);
		if (!compat) {
			const summary = formatIncompleteRun(incomplete, spec);
			if (!ctx.hasUI) {
				// Non-interactive mode: auto-resume incomplete run
				try {
					await executeWorkflow(spec, incomplete.state.input, {
						ctx,
						pi,
						loadAgent: createAgentLoader(ctx.cwd),
						resume: {
							runId: incomplete.runId,
							runDir: incomplete.runDir,
							state: incomplete.state,
						},
					});
				} catch (err) {
					ctx.ui.notify(`Resume failed: ${err instanceof Error ? err.message : String(err)}`, "error");
				}
				return;
			}
			const choice = await ctx.ui.select(`${summary}\n\nResume this run?`, [
				"Yes — resume from checkpoint",
				"No — start fresh",
			]);
			if (choice === "Yes — resume from checkpoint") {
				try {
					await executeWorkflow(spec, incomplete.state.input, {
						ctx,
						pi,
						loadAgent: createAgentLoader(ctx.cwd),
						resume: {
							runId: incomplete.runId,
							runDir: incomplete.runDir,
							state: incomplete.state,
						},
					});
				} catch (err) {
					ctx.ui.notify(`Resume failed: ${err instanceof Error ? err.message : String(err)}`, "error");
				}
				return;
			}
			// User chose fresh — fall through to normal execution
		}
	}

	// Parse input: --input JSON, or infer single required field from positional arg
	let input: unknown = {};
	if (inputJson) {
		try {
			input = JSON.parse(inputJson);
		} catch {
			ctx.ui.notify(`Invalid JSON for --input: ${inputJson}`, "warning");
			return;
		}
	} else if (spec.input) {
		const prompted = await promptForInput(spec, ctx);
		if (prompted === null) return;
		input = prompted;
	}

	try {
		await executeWorkflow(spec, input, {
			ctx,
			pi,
			loadAgent: createAgentLoader(ctx.cwd),
		});
		// Result is injected into conversation by executeWorkflow via sendMessage
	} catch (err) {
		ctx.ui.notify(`Workflow '${name}' failed: ${err instanceof Error ? err.message : String(err)}`, "error");
	}
}

async function handleResume(rawArgs: string, ctx: ExtensionCommandContext, pi: ExtensionAPI): Promise<void> {
	const name = rawArgs.trim().split(/\s+/)[0];
	if (!name) {
		ctx.ui.notify("Usage: /workflow resume <name>", "warning");
		return;
	}

	const spec = findWorkflow(name, ctx.cwd);
	if (!spec) {
		ctx.ui.notify(`Workflow '${name}' not found.`, "warning");
		return;
	}

	const incomplete = findIncompleteRun(ctx.cwd, spec.name);
	if (!incomplete) {
		ctx.ui.notify(`No incomplete runs found for '${name}'.`, "info");
		return;
	}

	// Validate compatibility
	const compat = validateResumeCompatibility(incomplete.state, spec);
	if (compat) {
		ctx.ui.notify(`Cannot resume: ${compat}`, "warning");
		return;
	}

	// Show summary and confirm
	const summary = formatIncompleteRun(incomplete, spec);
	if (!ctx.hasUI) {
		// Non-interactive mode: auto-resume without confirmation
	} else {
		const choice = await ctx.ui.select(`${summary}\n\nResume this run?`, ["Yes — resume", "No — cancel"]);
		if (choice !== "Yes — resume") return;
	}

	try {
		await executeWorkflow(spec, incomplete.state.input, {
			ctx,
			pi,
			loadAgent: createAgentLoader(ctx.cwd),
			resume: {
				runId: incomplete.runId,
				runDir: incomplete.runDir,
				state: incomplete.state,
			},
		});
	} catch (err) {
		ctx.ui.notify(`Resume failed: ${err instanceof Error ? err.message : String(err)}`, "error");
	}
}

function handleValidate(args: string, ctx: ExtensionCommandContext): void {
	const name = args.trim() || undefined;
	const { found, results } = runValidation(ctx.cwd, name);

	if (name && !found) {
		ctx.ui.notify(`Workflow '${name}' not found.`, "warning");
		return;
	}

	if (!found) {
		ctx.ui.notify("No workflows found.", "info");
		return;
	}

	const lines: string[] = [];
	let totalErrors = 0;
	let totalWarnings = 0;

	for (const r of results) {
		const errors = r.issues.filter((i) => i.severity === "error").length;
		const warnings = r.issues.filter((i) => i.severity === "warning").length;
		totalErrors += errors;
		totalWarnings += warnings;

		const icon = r.valid ? "\u2713" : "\u2717";
		lines.push(`${icon} ${r.name} (${errors} errors, ${warnings} warnings)`);
		for (const issue of r.issues) {
			lines.push(`  ${issue.severity === "error" ? "\u2717" : "\u26a0"} ${issue.field}: ${issue.message}`);
		}
	}

	lines.push("");
	lines.push(`${results.length} workflow(s), ${totalErrors} error(s), ${totalWarnings} warning(s)`);

	ctx.ui.notify(lines.join("\n"), totalErrors > 0 ? "error" : "info");
}

function handleWorkflowInit(ctx: ExtensionCommandContext): void {
	const { created } = initWorkflowDirs(ctx.cwd);

	if (created.length > 0) {
		ctx.ui.notify(`Workflows initialized: created ${created.join(", ")}`, "info");
	} else {
		ctx.ui.notify("Workflows already initialized — nothing to do.", "info");
	}
}

// ── Extension factory ───────────────────────────────────────────────────────

const extension = (pi: ExtensionAPI) => {
	try {
		syncSkillsToUser(import.meta.dirname);
	} catch {
		/* non-critical */
	}

	// ── Tool: workflow ──────────────────────────────────────────────────────

	pi.registerTool({
		name: "workflow",
		label: "Workflow",
		description:
			"Run a named workflow with typed input. Discovers workflows from .workflows/ and ~/.pi/agent/workflows/.",
		promptSnippet: "Run a multi-step workflow with typed data flow between agents",
		parameters: Type.Object({
			workflow: Type.String({ description: "Name of the workflow to run" }),
			input: Type.Optional(
				Type.Unknown({ description: "Input data for the workflow (validated against workflow's input schema)" }),
			),
			fresh: Type.Optional(
				Type.String({ description: "Set to 'true' to start a fresh run, ignoring any incomplete prior runs" }),
			),
		}),

		async execute(
			_toolCallId: string,
			params: { workflow: string; input?: unknown; fresh?: string },
			signal: AbortSignal | undefined,
			_onUpdate: AgentToolUpdateCallback | undefined,
			ctx: ExtensionContext,
		) {
			const spec = findWorkflow(params.workflow, ctx.cwd);
			if (!spec) {
				throw new Error(`Workflow '${params.workflow}' not found. Available workflows: ${listWorkflowNames(ctx.cwd)}`);
			}

			// Defensive: if input arrives as a JSON string (e.g. from Type.Unknown()),
			// parse it into an object.
			let input = params.input ?? {};
			if (typeof input === "string") {
				try {
					input = JSON.parse(input);
				} catch {
					// leave as string — validation will catch it if schema expects object
				}
			}

			// Check for resumable run (unless explicitly requesting fresh)
			let resumeOpts: { runId: string; runDir: string; state: import("./types.js").ExecutionState } | undefined;
			if (params.fresh !== "true") {
				const incomplete = findIncompleteRun(ctx.cwd, spec.name);
				if (incomplete) {
					const compat = validateResumeCompatibility(incomplete.state, spec);
					if (!compat) {
						resumeOpts = {
							runId: incomplete.runId,
							runDir: incomplete.runDir,
							state: incomplete.state,
						};
					}
					// If incompatible, silently start fresh
				}
			}

			const result = await executeWorkflow(spec, input, {
				ctx,
				pi,
				signal,
				loadAgent: createAgentLoader(ctx.cwd),
				resume: resumeOpts,
			});

			return {
				content: [{ type: "text", text: formatToolResult(result) }],
				details: result,
			};
		},
	});

	// ── Tool: workflow-list ─────────────────────────────────────────────────

	pi.registerTool({
		name: "workflow-list",
		label: "Workflow List",
		description: "List available workflows with names, descriptions, and sources.",
		promptSnippet: "List available workflows with names, descriptions, and sources",
		parameters: Type.Object({}),

		async execute(
			_toolCallId: string,
			_params: Record<string, never>,
			_signal: AbortSignal | undefined,
			_onUpdate: AgentToolUpdateCallback | undefined,
			ctx: ExtensionContext,
		): Promise<AgentToolResult<undefined>> {
			const workflows = discoverWorkflows(ctx.cwd);
			const items = workflows.map((w) => ({
				name: w.name,
				description: w.description,
				source: w.source,
			}));

			return {
				details: undefined,
				content: [{ type: "text", text: truncateHead(JSON.stringify(items, null, 2)).content }],
			};
		},
	});

	// ── Tool: workflow-agents ──────────────────────────────────────────────

	pi.registerTool({
		name: "workflow-agents",
		label: "Workflow Agents",
		description:
			"List available agents with full specs, or inspect a single agent by name. Returns role, description, model, tools, output format/schema, prompt template paths.",
		promptSnippet: "List available agents with specs, or inspect a single agent by name",
		parameters: Type.Object({
			name: Type.Optional(Type.String({ description: "Agent name to inspect (omit to list all)" })),
		}),

		async execute(
			_toolCallId: string,
			params: { name?: string },
			_signal: AbortSignal | undefined,
			_onUpdate: AgentToolUpdateCallback | undefined,
			ctx: ExtensionContext,
		): Promise<AgentToolResult<undefined>> {
			const agents = availableAgents(ctx.cwd);

			if (params.name) {
				const agent = agents.find((a) => a.name === params.name);
				if (!agent) {
					throw new Error(`Agent '${params.name}' not found. Available: ${agents.map((a) => a.name).join(", ")}`);
				}
				return {
					details: undefined,
					content: [{ type: "text", text: truncateHead(JSON.stringify(agent, null, 2)).content }],
				};
			}

			const items = agents.map((a) => ({
				name: a.name,
				role: a.role,
				description: a.description,
				model: a.model,
				tools: a.tools,
				extensions: a.extensions,
				skills: a.skills,
				outputFormat: a.outputFormat,
				outputSchema: a.outputSchema,
				promptTemplate: a.promptTemplate,
				taskTemplate: a.taskTemplate,
			}));

			return {
				details: undefined,
				content: [{ type: "text", text: truncateHead(JSON.stringify(items, null, 2)).content }],
			};
		},
	});

	// ── Tool: workflow-validate ─────────────────────────────────────────────

	pi.registerTool({
		name: "workflow-validate",
		label: "Workflow Validate",
		description: "Validate workflow specs — check agents, schemas, step references, and filters.",
		promptSnippet: "Validate workflow specs — check agents, schemas, step references, filters",
		parameters: Type.Object({
			name: Type.Optional(Type.String({ description: "Workflow name to validate (omit to validate all)" })),
		}),

		async execute(
			_toolCallId: string,
			params: { name?: string },
			_signal: AbortSignal | undefined,
			_onUpdate: AgentToolUpdateCallback | undefined,
			ctx: ExtensionContext,
		): Promise<AgentToolResult<undefined>> {
			const { found, results } = runValidation(ctx.cwd, params.name);

			if (params.name && !found) {
				throw new Error(`Workflow '${params.name}' not found. Available workflows: ${listWorkflowNames(ctx.cwd)}`);
			}

			return {
				details: undefined,
				content: [{ type: "text", text: truncateHead(JSON.stringify(results, null, 2)).content }],
			};
		},
	});

	// ── Tool: workflow-status ───────────────────────────────────────────────

	pi.registerTool({
		name: "workflow-status",
		label: "Workflow Status",
		description: "Get workflow vocabulary — step types, filters, available agents, workflows, schemas, templates.",
		promptSnippet: "Get workflow vocabulary — step types, filters, available agents, workflows, schemas",
		parameters: Type.Object({}),

		async execute(
			_toolCallId: string,
			_params: Record<string, never>,
			_signal: AbortSignal | undefined,
			_onUpdate: AgentToolUpdateCallback | undefined,
			ctx: ExtensionContext,
		): Promise<AgentToolResult<undefined>> {
			const status = gatherWorkflowStatus(ctx.cwd);

			return {
				details: undefined,
				content: [{ type: "text", text: truncateHead(JSON.stringify(status, null, 2)).content }],
			};
		},
	});

	// ── Tool: workflow-init ─────────────────────────────────────────────────

	pi.registerTool({
		name: "workflow-init",
		label: "Workflow Init",
		description: "Initialize .workflows/ directory for workflow run state.",
		promptSnippet: "Initialize .workflows/ directory for workflow run state",
		parameters: Type.Object({}),

		async execute(
			_toolCallId: string,
			_params: Record<string, never>,
			_signal: AbortSignal | undefined,
			_onUpdate: AgentToolUpdateCallback | undefined,
			ctx: ExtensionContext,
		): Promise<AgentToolResult<undefined>> {
			const result = initWorkflowDirs(ctx.cwd);

			return {
				details: undefined,
				content: [{ type: "text", text: truncateHead(JSON.stringify(result, null, 2)).content }],
			};
		},
	});

	// ── Command: /workflow ──────────────────────────────────────────────────

	interface SubcommandEntry {
		description: string;
		handler: (args: string, ctx: ExtensionCommandContext) => Promise<void> | void;
		getCompletions?: (argPrefix: string) => Array<{ value: string; label: string; description?: string }> | null;
	}

	const workflowNameCompletions = (argPrefix: string) => {
		const workflows = discoverWorkflows(process.cwd());
		return workflows
			.filter((w) => w.name.startsWith(argPrefix))
			.map((w) => ({ value: w.name, label: w.name, description: w.description || "" }));
	};

	const WORKFLOW_SUBCOMMANDS: Record<string, SubcommandEntry> = {
		init: {
			description: "Initialize .workflows/ directory",
			handler: (_args, ctx) => handleWorkflowInit(ctx),
		},
		list: {
			description: "List and select a workflow to run",
			handler: (_args, ctx) => handleList(ctx, pi),
		},
		run: {
			description: "Run a workflow by name",
			handler: (args, ctx) => handleRun(args, ctx, pi),
			getCompletions: workflowNameCompletions,
		},
		resume: {
			description: "Resume an incomplete workflow run",
			handler: (args, ctx) => handleResume(args, ctx, pi),
			getCompletions: workflowNameCompletions,
		},
		validate: {
			description: "Validate workflow specs",
			handler: (args, ctx) => handleValidate(args, ctx),
			getCompletions: workflowNameCompletions,
		},
		status: {
			description: "Show workflow vocabulary and discovery",
			handler: (_args, ctx) => {
				const status = gatherWorkflowStatus(ctx.cwd);
				const lines: string[] = [];
				lines.push(`Step types: ${(status.stepTypes as string[]).join(", ")}`);
				lines.push(`Filters: ${(status.filters as string[]).join(", ")}`);
				const wfs = status.workflows as { name: string }[];
				lines.push(`Workflows: ${wfs.length} (${wfs.map((w) => w.name).join(", ")})`);
				const ags = status.agents as { name: string }[];
				lines.push(`Agents: ${ags.length} (${ags.map((a) => a.name).join(", ")})`);
				lines.push(`Schemas: ${status.schemas}`);
				lines.push(`Templates: ${status.templates}`);
				ctx.ui.notify(lines.join("\n"), "info");
			},
		},
		help: {
			description: "Show available subcommands",
			handler: (_args, ctx) => {
				const lines = ["Usage: /workflow <subcommand> [args]", ""];
				for (const [name, entry] of Object.entries(WORKFLOW_SUBCOMMANDS)) {
					lines.push(`  ${name.padEnd(12)} ${entry.description}`);
				}
				ctx.ui.notify(lines.join("\n"), "info");
			},
		},
	};

	pi.registerCommand("workflow", {
		description: "List and run workflows",
		getArgumentCompletions: (prefix: string) => {
			const tokens = prefix.split(/\s+/);
			const partial = tokens[tokens.length - 1];

			// Level 0: completing the subcommand name
			if (tokens.length <= 1) {
				return Object.entries(WORKFLOW_SUBCOMMANDS)
					.filter(([name]) => name.startsWith(partial))
					.map(([name, entry]) => ({ value: name, label: name, description: entry.description }));
			}

			// Level 1+: delegate to subcommand's getCompletions
			const subName = tokens[0];
			const sub = WORKFLOW_SUBCOMMANDS[subName];
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
			const subcommand = spaceIdx === -1 ? trimmed || "list" : trimmed.slice(0, spaceIdx);
			const rest = spaceIdx === -1 ? "" : trimmed.slice(spaceIdx + 1);

			const entry = WORKFLOW_SUBCOMMANDS[subcommand];
			if (!entry) {
				const names = Object.keys(WORKFLOW_SUBCOMMANDS).join(", ");
				ctx.ui.notify(`Unknown subcommand: ${subcommand}. Available: ${names}`, "warning");
				return;
			}

			await entry.handler(rest, ctx);
		},
	});

	// ── Keybindings ──

	if (Key) {
		pi.registerShortcut(Key.ctrl("h"), {
			description: "Pause running workflow",
			handler: async (ctx: ExtensionContext) => {
				requestPause();
				ctx.ui.notify("Pause requested — workflow will pause after current step completes.", "info");
			},
		});

		pi.registerShortcut(Key.ctrl("j"), {
			description: "Resume paused workflow",
			handler: async (ctx: ExtensionContext) => {
				const workflows = discoverWorkflows(ctx.cwd);
				let found: { spec: WorkflowSpec; incomplete: IncompleteRun } | null = null;

				for (const wfSpec of workflows) {
					const incomplete = findIncompleteRun(ctx.cwd, wfSpec.name);
					if (incomplete) {
						const compat = validateResumeCompatibility(incomplete.state, wfSpec);
						if (!compat) {
							found = { spec: wfSpec, incomplete };
							break;
						}
					}
				}

				if (!found) {
					ctx.ui.notify("No paused or incomplete workflows to resume.", "info");
					return;
				}

				const summary = formatIncompleteRun(found.incomplete, found.spec);
				ctx.ui.notify(`Resuming: ${summary}`, "info");

				try {
					await executeWorkflow(found.spec, found.incomplete.state.input, {
						ctx,
						pi,
						loadAgent: createAgentLoader(ctx.cwd),
						resume: {
							runId: found.incomplete.runId,
							runDir: found.incomplete.runDir,
							state: found.incomplete.state,
						},
					});
				} catch (err) {
					ctx.ui.notify(`Resume failed: ${err instanceof Error ? err.message : String(err)}`, "error");
				}
			},
		});
	}
};

export default extension;
