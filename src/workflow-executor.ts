import fs from "node:fs";
import path from "node:path";
import type { WorkflowSpec, WorkflowResult, AgentSpec, ExecutionState, ExpressionScope, StepUsage } from "./types.ts";
import type { ProgressWidgetState } from "./tui.ts";
import { validate, validateFromFile } from "./schema-validator.ts";
import { resolveExpressions } from "./expression.ts";
import { dispatch } from "./dispatch.ts";
import { generateRunId, initRunDir, writeState, writeStepOutput, writeMetrics, buildResult, formatResult } from "./state.ts";
import { resolveCompletion } from "./completion.ts";
import { createProgressWidget } from "./tui.ts";

export interface ExecuteOptions {
  /** pi extension context (for TUI, cwd, etc.) */
  ctx: any;
  /** pi extension API (for sendMessage) */
  pi: any;
  /** AbortSignal for cancellation (e.g. user presses Ctrl+C) */
  signal?: AbortSignal;
  /**
   * Agent spec loader. Given an agent name, returns the AgentSpec.
   * The executor does not know how to load agent specs — the caller provides this.
   * If the agent is not found, return a minimal spec with just the name.
   */
  loadAgent: (name: string) => AgentSpec;
}

/**
 * Helper that returns a StepUsage with all zeroes.
 */
function zeroUsage(): StepUsage {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 };
}

/**
 * Resolve a schema path relative to the workflow spec file.
 * If the schema path is absolute, return as-is.
 * If relative, resolve against the directory containing the workflow spec.
 */
function resolveSchemaPath(schemaPath: string, specFilePath: string): string {
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
function buildPrompt(
  step: { agent: string; input?: Record<string, unknown>; output?: { format?: string; schema?: string } },
  agentSpec: AgentSpec,
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
 * Execute a workflow from a parsed spec and validated input.
 *
 * Runs steps sequentially (phase 1), resolving ${{ }} expressions,
 * dispatching subprocesses, validating outputs, persisting state,
 * updating TUI, and injecting the result into the conversation.
 *
 * Returns the WorkflowResult (also injected into conversation via sendMessage).
 */
export async function executeWorkflow(
  spec: WorkflowSpec,
  input: unknown,
  options: ExecuteOptions,
): Promise<WorkflowResult> {
  const { ctx, pi, signal, loadAgent } = options;

  // 1. Validate input against workflow input schema (if defined)
  if (spec.input) {
    validate(spec.input, input, `workflow input for '${spec.name}'`);
  }

  // 2. Initialize run directory and state
  const runId = generateRunId(spec.name);
  const runDir = initRunDir(ctx.cwd, runId);
  const state: ExecutionState = {
    input,
    steps: {},
    status: "running",
  };

  // 3. Show TUI progress widget
  const widgetState: ProgressWidgetState = {
    spec,
    state,
    startTime: Date.now(),
  };
  if (ctx.hasUI) {
    ctx.ui.setWidget("workflow-progress", createProgressWidget(widgetState));
  }

  // 4. Execute steps in declared order
  const stepEntries = Object.entries(spec.steps);
  for (let i = 0; i < stepEntries.length; i++) {
    const [stepName, stepSpec] = stepEntries[i];

    // Check cancellation
    if (signal?.aborted) {
      state.status = "failed";
      state.steps[stepName] = {
        step: stepName,
        agent: stepSpec.agent,
        status: "failed",
        usage: zeroUsage(),
        durationMs: 0,
        error: "Workflow cancelled",
      };
      break;
    }

    // Update widget: mark this step as current
    widgetState.currentStep = stepName;
    if (ctx.hasUI) {
      ctx.ui.setWidget("workflow-progress", createProgressWidget(widgetState));
    }

    // Resolve ${{ }} expressions in step input
    const scope: ExpressionScope = { input: state.input, steps: state.steps };
    let resolvedInput: unknown;
    try {
      resolvedInput = resolveExpressions(stepSpec.input ?? {}, scope);
    } catch (err) {
      // Expression resolution failed — record as step failure
      state.steps[stepName] = {
        step: stepName,
        agent: stepSpec.agent,
        status: "failed",
        usage: zeroUsage(),
        durationMs: 0,
        error: err instanceof Error ? err.message : String(err),
      };
      state.status = "failed";
      break;
    }

    // Load agent spec
    const agentSpec = loadAgent(stepSpec.agent);

    // Build prompt from resolved input
    const prompt = buildPrompt(stepSpec, agentSpec, resolvedInput, runDir, stepName);

    // Dispatch subprocess
    const result = await dispatch(stepSpec, agentSpec, prompt, {
      cwd: ctx.cwd,
      sessionLogDir: path.join(runDir, "sessions"),
      stepName,
      signal,
      onEvent: (evt) => {
        // Could update widget with live tool info here (later enhancement)
      },
    });

    // Validate output against schema (if defined)
    if (stepSpec.output?.schema && result.status === "completed") {
      const schemaPath = resolveSchemaPath(stepSpec.output.schema, spec.filePath);
      try {
        // Read output file written by the agent
        const outputFilePath = path.join(runDir, "outputs", `${stepName}.json`);
        if (fs.existsSync(outputFilePath)) {
          const rawOutput = JSON.parse(fs.readFileSync(outputFilePath, "utf-8"));
          validateFromFile(schemaPath, rawOutput, `step output for '${stepName}'`);
          result.output = rawOutput;
        } else {
          // Try to parse structured output from the text output
          try {
            const parsed = JSON.parse(result.textOutput || "");
            validateFromFile(schemaPath, parsed, `step output for '${stepName}'`);
            result.output = parsed;
            writeStepOutput(runDir, stepName, parsed);
          } catch {
            result.status = "failed";
            result.error = `Step '${stepName}' has output schema but no valid JSON output was produced`;
          }
        }
      } catch (err) {
        result.status = "failed";
        result.error = err instanceof Error ? err.message : String(err);
      }
    } else if (result.output) {
      // No schema, but structured output exists — persist it
      writeStepOutput(runDir, stepName, result.output);
    }

    // Store result
    state.steps[stepName] = result;
    writeState(runDir, state);

    // Fail fast
    if (result.status === "failed") {
      state.status = "failed";
      break;
    }
  }

  // 5. Finalize
  if (state.status === "running") {
    state.status = "completed";
  }
  writeState(runDir, state);
  writeMetrics(runDir, state.steps);

  // 6. Clean up TUI
  if (ctx.hasUI) {
    ctx.ui.setWidget("workflow-progress", undefined);
  }

  // 7. Build and inject result
  const result = buildResult(spec, runId, runDir, state, state.status as "completed" | "failed");
  const triggerTurn = spec.triggerTurn !== false;

  let content: string;
  if (spec.completion) {
    try {
      content = resolveCompletion(spec.completion, result, input);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      content = formatResult(result) + `\n\nCompletion template error: ${msg}`;
    }
  } else {
    content = formatResult(result);
  }

  pi.sendMessage(
    { customType: "workflow-result", content, display: "verbose" },
    { triggerTurn },
  );

  return result;
}
