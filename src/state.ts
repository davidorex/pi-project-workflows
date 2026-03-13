import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { ExecutionState, WorkflowResult, WorkflowSpec, StepResult, StepUsage } from "./types.ts";

/**
 * Generate a unique run ID.
 * Format: <workflow-name>-<yyyymmdd>-<hhmmss>-<4 hex chars>
 * Example: "bugfix-20260312-214041-a3f2"
 */
export function generateRunId(workflowName: string): string {
  const now = new Date();
  const yyyy = now.getFullYear().toString();
  const mm = (now.getMonth() + 1).toString().padStart(2, "0");
  const dd = now.getDate().toString().padStart(2, "0");
  const hh = now.getHours().toString().padStart(2, "0");
  const min = now.getMinutes().toString().padStart(2, "0");
  const ss = now.getSeconds().toString().padStart(2, "0");
  const hex = crypto.randomBytes(2).toString("hex");
  return `${workflowName}-${yyyy}${mm}${dd}-${hh}${min}${ss}-${hex}`;
}

/**
 * Initialize the run directory structure.
 * Creates:
 *   .pi/workflow-runs/<runId>/
 *   .pi/workflow-runs/<runId>/sessions/
 *   .pi/workflow-runs/<runId>/outputs/
 *
 * @param cwd - project root
 * @param runId - unique run identifier
 * @returns absolute path to the run directory
 */
export function initRunDir(cwd: string, runId: string): string {
  const runDir = path.join(cwd, ".pi", "workflow-runs", runId);
  fs.mkdirSync(path.join(runDir, "sessions"), { recursive: true });
  fs.mkdirSync(path.join(runDir, "outputs"), { recursive: true });
  return runDir;
}

/**
 * Write execution state to state.json in the run directory.
 * Overwrites on each call (not append).
 * Uses atomic write: write to .state.json.tmp, then fs.renameSync to state.json.
 */
export function writeState(runDir: string, state: ExecutionState): void {
  const tmpPath = path.join(runDir, ".state.json.tmp");
  const finalPath = path.join(runDir, "state.json");
  fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2), "utf-8");
  fs.renameSync(tmpPath, finalPath);
}

/**
 * Read execution state from state.json.
 * Returns null if file doesn't exist.
 */
export function readState(runDir: string): ExecutionState | null {
  const statePath = path.join(runDir, "state.json");
  try {
    const content = fs.readFileSync(statePath, "utf-8");
    return JSON.parse(content) as ExecutionState;
  } catch {
    return null;
  }
}

/**
 * Write a step's structured output to outputs/<stepName>.json.
 */
export function writeStepOutput(runDir: string, stepName: string, output: unknown): void {
  const outputPath = path.join(runDir, "outputs", `${stepName}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), "utf-8");
}

/**
 * Write aggregated metrics to metrics.json.
 */
export function writeMetrics(runDir: string, steps: Record<string, StepResult>): void {
  const total = aggregateUsage(steps);
  const totalDurationMs = Object.values(steps).reduce((sum, s) => sum + s.durationMs, 0);
  const metrics = {
    totalUsage: total,
    totalDurationMs,
    steps: Object.fromEntries(
      Object.entries(steps).map(([name, s]) => [name, { usage: s.usage, durationMs: s.durationMs }]),
    ),
  };
  fs.writeFileSync(path.join(runDir, "metrics.json"), JSON.stringify(metrics, null, 2), "utf-8");
}

/**
 * Aggregate usage across all steps.
 */
export function aggregateUsage(steps: Record<string, StepResult>): StepUsage {
  const total: StepUsage = {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    cost: 0,
    turns: 0,
  };
  for (const step of Object.values(steps)) {
    if (step.usage) {
      total.input += step.usage.input;
      total.output += step.usage.output;
      total.cacheRead += step.usage.cacheRead;
      total.cacheWrite += step.usage.cacheWrite;
      total.cost += step.usage.cost;
      total.turns += step.usage.turns;
    }
  }
  return total;
}

/**
 * Build a WorkflowResult from execution state.
 * Aggregates usage across steps, computes total duration,
 * sets output to the last completed step's output (or explicit workflow output if defined).
 */
export function buildResult(
  spec: WorkflowSpec,
  runId: string,
  runDir: string,
  state: ExecutionState,
  status: "completed" | "failed",
): WorkflowResult {
  const totalUsage = aggregateUsage(state.steps);
  const totalDurationMs = Object.values(state.steps).reduce((sum, s) => sum + s.durationMs, 0);

  // Determine output: last completed step's output
  let output: unknown = undefined;
  const stepNames = Object.keys(spec.steps);
  for (let i = stepNames.length - 1; i >= 0; i--) {
    const stepName = stepNames[i];
    const stepResult = state.steps[stepName];
    if (stepResult && stepResult.status === "completed") {
      output = stepResult.output ?? stepResult.textOutput;
      break;
    }
  }

  return {
    workflow: spec.name,
    runId,
    status,
    steps: state.steps,
    output,
    totalUsage,
    totalDurationMs,
    runDir,
  };
}

/**
 * Format duration in milliseconds to human-readable string.
 * <60s -> "42s", <60m -> "1m32s", >=60m -> "1h02m"
 */
function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) {
    return `${minutes}m${seconds.toString().padStart(2, "0")}s`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h${remainingMinutes.toString().padStart(2, "0")}m`;
}

/**
 * Format cost as a dollar string.
 */
function formatCost(cost: number): string {
  return `$${cost.toFixed(2)}`;
}

/**
 * Format a WorkflowResult as human-readable text for injection into the conversation.
 */
export function formatResult(result: WorkflowResult): string {
  const stepEntries = Object.values(result.steps);
  const totalSteps = stepEntries.length;
  const completedSteps = stepEntries.filter((s) => s.status === "completed").length;
  const duration = formatDuration(result.totalDurationMs);
  const cost = formatCost(result.totalUsage.cost);

  const lines: string[] = [];

  if (result.status === "completed") {
    lines.push(`Workflow '${result.workflow}' completed (${totalSteps} steps, ${duration}, ${cost})`);
  } else {
    // Find the failed step name
    const failedStep = stepEntries.find((s) => s.status === "failed");
    const failedName = failedStep ? failedStep.step : "unknown";
    lines.push(
      `Workflow '${result.workflow}' failed at step '${failedName}' (${completedSteps}/${totalSteps} steps, ${duration}, ${cost})`,
    );
  }

  lines.push("");
  lines.push("Steps:");

  for (const step of stepEntries) {
    const stepDuration = formatDuration(step.durationMs);
    const stepCost = formatCost(step.usage.cost);

    if (step.status === "completed") {
      lines.push(`  \u2713 ${step.step}  ${stepDuration}  ${stepCost}  (${step.usage.turns} turns)`);
    } else if (step.status === "failed") {
      const errorPreview = step.error || "Unknown error";
      lines.push(`  \u2717 ${step.step}  ${stepDuration}  ${stepCost}  ${errorPreview}`);
    } else {
      // skipped
      lines.push(`  \u00b7 ${step.step}`);
    }
  }

  if (result.status === "completed") {
    lines.push("");
    lines.push(
      `Total: ${result.totalUsage.input} input + ${result.totalUsage.output} output tokens, ${cost}`,
    );
  }

  lines.push("");
  lines.push(`Session logs: ${result.runDir}/sessions/`);

  return lines.join("\n");
}
