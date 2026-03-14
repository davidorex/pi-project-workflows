/**
 * Shared helpers for step executors — constants, usage aggregation,
 * prompt building, schema resolution, and state persistence.
 */
import path from "node:path";
import type { StepUsage, StepResult, ExecutionState } from "./types.ts";
import type { ProgressWidgetState } from "./tui.ts";
import { writeState } from "./state.ts";
import { createProgressWidget } from "./tui.ts";

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
 * Resolve a schema path relative to the workflow spec file.
 * If the schema path is absolute, return as-is.
 * If relative, resolve against the directory containing the workflow spec.
 */
export function resolveSchemaPath(schemaPath: string, specFilePath: string): string {
  if (path.isAbsolute(schemaPath)) return schemaPath;
  return path.resolve(path.dirname(specFilePath), schemaPath);
}

/**
 * Build the prompt string sent to the subprocess.
 *
 * The prompt includes:
 * 1. The resolved input as context
 * 2. Output instructions (if schema-bound)
 */
export function buildPrompt(
  step: { agent?: string; input?: Record<string, unknown>; output?: { format?: string; schema?: string } },
  _agentSpec: unknown,
  resolvedInput: unknown,
  runDir: string,
  stepName: string,
): string {
  const parts: string[] = [];

  // Input context
  if (resolvedInput && typeof resolvedInput === "object" && Object.keys(resolvedInput).length > 0) {
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
    parts.push(`**Output:** Write your result as valid JSON to: ${outputPath}`);
    if (step.output.schema) {
      parts.push(`The output must conform to the JSON Schema at: ${resolveSchemaPath(step.output.schema, "")}`);
    }
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
  ctx: { hasUI: boolean; ui: { setWidget(id: string, w: unknown): void } },
): void {
  state.steps[stepName] = result;
  writeState(runDir, state);
  if (ctx.hasUI) {
    ctx.ui.setWidget(WIDGET_ID, createProgressWidget(widgetState));
  }
}
