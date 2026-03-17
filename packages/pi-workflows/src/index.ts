/**
 * Extension entry point — registers the `workflow` tool and `/workflow` command
 * for discovering, executing, and managing multi-step workflow runs.
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
import { Key } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { createAgentLoader } from "./agent-spec.js";
import { findIncompleteRun, formatIncompleteRun, validateResumeCompatibility } from "./checkpoint.js";
import type { WorkflowResult } from "./types.js";
import { discoverWorkflows, findWorkflow } from "./workflow-discovery.js";
import { executeWorkflow, requestPause } from "./workflow-executor.js";
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
function summarizeInputSchema(schema: Record<string, unknown> | undefined): string {
	if (!schema) return "(any)";
	const props = schema.properties as Record<string, any> | undefined;
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
			const labelField = String(source.label || "id");
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
				const options = items.map((item) => String(item[labelField] ?? ""));
				const desc = (val?.description as string) || key;
				const selected = await ctx.ui.select(desc, options);
				if (selected == null) return null;
				// Map label back to value
				const selectedItem = items.find((item) => String(item[labelField]) === selected);
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

/**
 * /workflow init — scaffold .workflows/ directory for user workflow specs
 * and run state. Idempotent.
 */
function handleWorkflowInit(ctx: ExtensionCommandContext): void {
	const workflowsDir = path.join(ctx.cwd, WORKFLOWS_DIR);
	const runsDir = path.join(workflowsDir, "runs");

	const created: string[] = [];

	for (const dir of [workflowsDir, runsDir]) {
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
			created.push(path.relative(ctx.cwd, dir) + "/");
		}
	}

	if (created.length > 0) {
		ctx.ui.notify(`Workflows initialized: created ${created.join(", ")}`, "info");
	} else {
		ctx.ui.notify("Workflows already initialized — nothing to do.", "info");
	}
}

// ── Extension factory ───────────────────────────────────────────────────────

const extension = (pi: ExtensionAPI) => {
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
			toolCallId: string,
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

	// ── Command: /workflow ──────────────────────────────────────────────────

	pi.registerCommand("workflow", {
		description: "List and run workflows",
		getArgumentCompletions: (prefix: string) => {
			const subcommands = ["init", "run", "list", "resume"];
			return subcommands.filter((s) => s.startsWith(prefix)).map((s) => ({ value: s, label: s }));
		},

		async handler(args: string, ctx: ExtensionCommandContext) {
			const trimmed = args.trim();
			const spaceIdx = trimmed.indexOf(" ");
			const subcommand = spaceIdx === -1 ? trimmed || "list" : trimmed.slice(0, spaceIdx);
			const rest = spaceIdx === -1 ? "" : trimmed.slice(spaceIdx + 1);

			if (subcommand === "init") {
				handleWorkflowInit(ctx);
			} else if (subcommand === "list") {
				await handleList(ctx, pi);
			} else if (subcommand === "run") {
				await handleRun(rest, ctx, pi);
			} else if (subcommand === "resume") {
				await handleResume(rest, ctx, pi);
			} else {
				ctx.ui.notify(`Unknown subcommand: ${subcommand}. Use: init, list, run, resume`, "warning");
			}
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
				let found: { spec: any; incomplete: any } | null = null;

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
