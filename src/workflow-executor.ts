import fs from "node:fs";
import path from "node:path";
import type { WorkflowSpec, WorkflowResult, AgentSpec, ExecutionState, ExpressionScope, StepUsage, StepResult, GateSpec, TransformSpec } from "./types.ts";
import type { ProgressWidgetState } from "./tui.ts";
import { validate, validateFromFile } from "./schema-validator.ts";
import { resolveExpressions, evaluateCondition } from "./expression.ts";
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
 * Execute a gate step: runs a shell command, passes/fails based on exit code.
 *
 * The gate's check command is expected to already have ${{ }} expressions resolved
 * before being passed here.
 */
async function executeGate(
  gate: GateSpec,
  stepName: string,
  options: { cwd: string; signal?: AbortSignal },
): Promise<StepResult> {
  const startTime = Date.now();
  try {
    const { execSync } = await import("node:child_process");
    const output = execSync(gate.check, {
      cwd: options.cwd,
      timeout: 60000,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return {
      step: stepName,
      agent: "gate",
      status: "completed",
      textOutput: output.trim(),
      output: { passed: true, exitCode: 0, output: output.trim() },
      usage: zeroUsage(),
      durationMs: Date.now() - startTime,
    };
  } catch (err: unknown) {
    const execErr = err as { status?: number; stdout?: string; stderr?: string };
    const exitCode = execErr.status ?? 1;
    const stderr = execErr.stderr?.trim() ?? "";
    const stdout = execErr.stdout?.trim() ?? "";
    return {
      step: stepName,
      agent: "gate",
      status: "completed",
      textOutput: stderr || stdout,
      output: { passed: false, exitCode, output: stderr || stdout },
      usage: zeroUsage(),
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Execute a transform step: produces output by resolving expressions in the mapping.
 * No LLM call, no subprocess, no shell command — pure expression resolution.
 */
function executeTransform(
  transform: TransformSpec,
  stepName: string,
  scope: Record<string, unknown>,
): StepResult {
  const startTime = Date.now();
  try {
    const output = resolveExpressions(transform.mapping, scope);
    return {
      step: stepName,
      agent: "transform",
      status: "completed",
      output,
      textOutput: JSON.stringify(output, null, 2),
      usage: zeroUsage(),
      durationMs: Date.now() - startTime,
    };
  } catch (err) {
    return {
      step: stepName,
      agent: "transform",
      status: "failed",
      usage: zeroUsage(),
      durationMs: Date.now() - startTime,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Execute a workflow from a parsed spec and validated input.
 *
 * Runs steps sequentially (phase 1), resolving ${{ }} expressions,
 * dispatching subprocesses, validating outputs, persisting state,
 * updating TUI, and injecting the result into the conversation.
 *
 * Supports step types: agent (default), gate, transform.
 * Supports `when` conditionals for skipping steps.
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

  // 4. Set working message
  if (ctx.hasUI) {
    ctx.ui.setWorkingMessage(`Running ${spec.name} workflow...`);
  }

  // 5. Execute steps in declared order
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

    // Build expression scope for this step
    const scope: ExpressionScope = { input: state.input, steps: state.steps };

    // Evaluate `when` conditional — skip step if condition is falsy
    if (stepSpec.when) {
      const conditionExpr = stepSpec.when.replace(/^\$\{\{\s*/, "").replace(/\s*\}\}$/, "");
      const shouldRun = evaluateCondition(conditionExpr, scope as unknown as Record<string, unknown>);

      if (!shouldRun) {
        state.steps[stepName] = {
          step: stepName,
          agent: stepSpec.agent ?? "skipped",
          status: "skipped",
          usage: zeroUsage(),
          durationMs: 0,
        };
        writeState(runDir, state);
        // Update widget after skip
        if (ctx.hasUI) {
          ctx.ui.setWidget("workflow-progress", createProgressWidget(widgetState));
        }
        continue;
      }
    }

    // Update widget: mark this step as current
    widgetState.currentStep = stepName;
    if (ctx.hasUI) {
      ctx.ui.setWidget("workflow-progress", createProgressWidget(widgetState));
    }

    // ── Gate step ──
    if (stepSpec.gate) {
      // Resolve expressions in gate check command
      const resolvedCheck = String(resolveExpressions(stepSpec.gate.check, scope as unknown as Record<string, unknown>));
      const resolvedGate: GateSpec = {
        ...stepSpec.gate,
        check: resolvedCheck,
      };

      const gateResult = await executeGate(resolvedGate, stepName, {
        cwd: ctx.cwd,
        signal,
      });

      const gateOutput = gateResult.output as { passed: boolean; exitCode: number; output: string };

      if (gateOutput.passed) {
        // Handle onPass
        const onPass = stepSpec.gate.onPass ?? "continue";
        state.steps[stepName] = gateResult;
        writeState(runDir, state);
        if (ctx.hasUI) {
          ctx.ui.setWidget("workflow-progress", createProgressWidget(widgetState));
        }
        if (onPass === "break") {
          // Signal loop should stop (used inside loops — for now just break the step loop)
          break;
        }
        // onPass === "continue": proceed to next step
        continue;
      } else {
        // Handle onFail
        const onFail = stepSpec.gate.onFail ?? "fail";
        if (onFail === "fail") {
          gateResult.status = "failed";
          gateResult.error = `Gate check failed (exit ${gateOutput.exitCode}): ${gateOutput.output}`;
          state.steps[stepName] = gateResult;
          state.status = "failed";
          writeState(runDir, state);
          if (ctx.hasUI) {
            ctx.ui.setWidget("workflow-progress", createProgressWidget(widgetState));
          }
          break;
        } else if (onFail === "continue") {
          state.steps[stepName] = gateResult;
          writeState(runDir, state);
          if (ctx.hasUI) {
            ctx.ui.setWidget("workflow-progress", createProgressWidget(widgetState));
          }
          continue;
        } else if (onFail === "break") {
          state.steps[stepName] = gateResult;
          writeState(runDir, state);
          if (ctx.hasUI) {
            ctx.ui.setWidget("workflow-progress", createProgressWidget(widgetState));
          }
          break;
        }
      }
    }

    // ── Transform step ──
    if (stepSpec.transform) {
      const transformResult = executeTransform(
        stepSpec.transform,
        stepName,
        scope as unknown as Record<string, unknown>,
      );

      if (transformResult.output) {
        writeStepOutput(runDir, stepName, transformResult.output);
      }
      state.steps[stepName] = transformResult;
      writeState(runDir, state);
      if (ctx.hasUI) {
        ctx.ui.setWidget("workflow-progress", createProgressWidget(widgetState));
      }
      // Fail fast on transform failure
      if (transformResult.status === "failed") {
        state.status = "failed";
        break;
      }
      continue;
    }

    // ── Loop step (placeholder for spec 10) ──
    // Handled by spec 10

    // ── Agent step (default) ──

    // Resolve ${{ }} expressions in step input
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

    // Refresh widget with completed step data
    if (ctx.hasUI) {
      ctx.ui.setWidget("workflow-progress", createProgressWidget(widgetState));
    }

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
    ctx.ui.setWorkingMessage(undefined);
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
