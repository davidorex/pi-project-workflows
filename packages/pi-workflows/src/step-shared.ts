/**
 * Shared helpers for step executors — constants, usage aggregation,
 * prompt building, schema resolution, state persistence, and template resolution.
 */
import fs from "node:fs";
import path from "node:path";
import { readBlock } from "@davidorex/pi-project/block-api";
import { projectDir, schemaPath } from "@davidorex/pi-project/project-dir";
import type nunjucks from "nunjucks";
import { writeState } from "./state.js";
import { renderTemplate, renderTemplateFile } from "./template.js";
import type { ProgressWidgetState } from "./tui.js";
import { createProgressWidget } from "./tui.js";
import type { AgentSpec, ExecutionState, StepResult, StepUsage, WorkflowContext } from "./types.js";

/** Grace period (ms) between SIGTERM and SIGKILL when killing subprocesses. */
export const SIGKILL_GRACE_MS = 3000;

/** Widget ID used for the workflow progress widget. */
export const WIDGET_ID = "workflow-progress";

/** Default max loop attempts when not specified. */
export const DEFAULT_MAX_ATTEMPTS = 3;

/**
 * Helper that returns a StepUsage with all zeroes.
 */
export function zeroUsage(): StepUsage {
	return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 };
}

/**
 * Add step usage into a running total (mutates `total`).
 */
export function addUsage(total: StepUsage, step: StepUsage): void {
	total.input += step.input;
	total.output += step.output;
	total.cacheRead += step.cacheRead;
	total.cacheWrite += step.cacheWrite;
	total.cost += step.cost;
	total.turns += step.turns;
}

/**
 * Resolve a schema path to an absolute filesystem path.
 *
 * Three resolution modes:
 * - Absolute paths: returned as-is
 * - `block:<name>` prefix: resolves to `.project/schemas/<name>.schema.json` from cwd.
 *   This is the portable way to reference project block schemas from any workflow or
 *   agent spec regardless of package install location. Uses the user's actual schemas
 *   (which may be customized).
 * - Relative paths: resolved against the directory containing the spec file
 */
export function resolveSchemaPath(schemaPathSpec: string, specFilePath: string, cwd?: string): string {
	if (path.isAbsolute(schemaPathSpec)) return schemaPathSpec;
	const blockMatch = schemaPathSpec.match(/^block:(.+)$/);
	if (blockMatch) {
		const resolvedCwd = cwd || process.cwd();
		return schemaPath(resolvedCwd, blockMatch[1]!);
	}
	return path.resolve(path.dirname(specFilePath), schemaPathSpec);
}

/**
 * Build the prompt string sent to the subprocess.
 *
 * The prompt includes:
 * 1. The compiled task template (if set), or the resolved input as context
 * 2. Output instructions (if schema-bound)
 */
export function buildPrompt(
	step: { agent?: string; input?: Record<string, unknown>; output?: { format?: string; schema?: string } },
	agentSpec: AgentSpec,
	resolvedInput: unknown,
	runDir: string,
	stepName: string,
	cwd?: string,
): string {
	const parts: string[] = [];

	// Task template was compiled by compileAgentSpec — use it
	if (agentSpec.taskTemplate) {
		parts.push(agentSpec.taskTemplate);
	} else if (resolvedInput && typeof resolvedInput === "object" && Object.keys(resolvedInput).length > 0) {
		// No task template — serialize input as JSON
		parts.push("## Input\n");
		parts.push("```json");
		parts.push(JSON.stringify(resolvedInput, null, 2));
		parts.push("```\n");
	} else if (typeof resolvedInput === "string") {
		parts.push(resolvedInput);
	}

	// Output instructions (if schema-bound)
	if (step.output?.format === "json" || step.output?.schema) {
		const outputPath = path.join(runDir, "outputs", `${stepName}.json`);
		parts.push("\n---");
		parts.push(
			"**Output:** Your final response MUST be raw JSON only — no markdown fences, no code blocks, no commentary before or after. Just the JSON object.",
		);
		if (step.output.schema) {
			parts.push(`The output must conform to the JSON Schema at: ${resolveSchemaPath(step.output.schema, "", cwd)}`);
		}
		parts.push(`If you have write access, also write the JSON to: ${outputPath}`);
	}

	return parts.join("\n");
}

/**
 * Persist step result to state and update TUI widget.
 * Replaces the repeated writeState + setWidget pattern.
 */
export function persistStep(
	state: ExecutionState,
	stepName: string,
	result: StepResult,
	runDir: string,
	widgetState: ProgressWidgetState,
	ctx: WorkflowContext,
): void {
	state.steps[stepName] = result;
	// Clear activity and live usage buffers for completed step
	widgetState.activities?.delete(stepName);
	widgetState.liveUsage?.delete(stepName);
	try {
		writeState(runDir, state);
	} catch (err) {
		if (ctx.hasUI && ctx.ui.notify) {
			const msg = err instanceof Error ? err.message : String(err);
			ctx.ui.notify(`State write failed after step '${stepName}': ${msg}`, "error");
		}
		throw err; // re-throw — state write failure is fatal
	}
	if (ctx.hasUI) {
		ctx.ui.setWidget(WIDGET_ID, createProgressWidget(widgetState));
	}
}

/**
 * Compile an agent spec: render system and task templates through Nunjucks.
 *
 * Every agent's prompts go through Nunjucks. Plain text without template
 * tags renders to itself. The .md that pi receives is compiled output.
 *
 * If the agent declares contextBlocks and a .project/ directory exists at cwd,
 * block data is auto-injected into the template context as _<blockname>.
 * Missing blocks are set to null — templates guard with {% if _blockname %}.
 */
export function compileAgentSpec(
	agentSpec: AgentSpec,
	resolvedInput: unknown,
	templateEnv?: nunjucks.Environment,
	cwd?: string,
): AgentSpec {
	if (!templateEnv) return agentSpec;

	const ctx =
		typeof resolvedInput === "object" && resolvedInput !== null ? (resolvedInput as Record<string, unknown>) : {};

	// Inject block data into template context when contextBlocks is declared
	if (agentSpec.contextBlocks && agentSpec.contextBlocks.length > 0 && cwd) {
		const projectDirPath = projectDir(cwd);
		if (fs.existsSync(projectDirPath)) {
			for (const name of agentSpec.contextBlocks) {
				const ctxKey = `_${name.replace(/-/g, "_")}`;
				try {
					ctx[ctxKey] = readBlock(cwd, name);
				} catch {
					ctx[ctxKey] = null;
				}
			}
		}
	}

	let result = agentSpec;

	// System prompt: file template or inline — always rendered
	if (agentSpec.promptTemplate) {
		const rendered = renderTemplateFile(templateEnv, agentSpec.promptTemplate, ctx);
		result = { ...result, systemPrompt: rendered, promptTemplate: undefined };
	} else if (agentSpec.systemPrompt) {
		const rendered = renderTemplate(templateEnv, agentSpec.systemPrompt, ctx);
		result = { ...result, systemPrompt: rendered };
	}

	// Task prompt: file template — rendered from typed input
	if (agentSpec.taskTemplate) {
		const rendered = renderTemplateFile(templateEnv, agentSpec.taskTemplate, ctx);
		result = { ...result, taskTemplate: rendered };
	}

	return result;
}
