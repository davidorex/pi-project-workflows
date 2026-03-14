/**
 * Workflow executor — orchestrates step execution with DAG-based layering,
 * parallel dispatch, timeout enforcement, state persistence, and TUI updates.
 */
import fs from "node:fs";
import path from "node:path";
import type { WorkflowSpec, WorkflowResult, AgentSpec, ExecutionState, ExpressionScope, StepUsage, StepResult, GateSpec, TransformSpec, LoopSpec, LoopState, LoopAttempt } from "./types.ts";
import type { ProgressWidgetState } from "./tui.ts";
import { validate, validateFromFile } from "./schema-validator.ts";
import { resolveExpressions, evaluateCondition } from "./expression.ts";
import { dispatch } from "./dispatch.ts";
import { generateRunId, initRunDir, getWorkflowDir, writeState, writeStepOutput, writeMetrics, buildResult, formatResult } from "./state.ts";
import { resolveCompletion } from "./completion.ts";
import { createProgressWidget } from "./tui.ts";
import { buildExecutionPlan, extractDependencies } from "./dag.ts";
import type { ExecutionLayer, ExecutionPlan } from "./dag.ts";

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
 * Execute a loop step: runs sub-steps repeatedly until a gate breaks,
 * max attempts is reached, or a step fails.
 *
 * Loop sub-steps can be agent, gate, or transform steps.
 * Gates inside loops support onPass: "break" (stop looping on success)
 * and onFail: "continue" (retry on failure, the default inside loops).
 *
 * The loop scope provides ${{ loop.iteration }}, ${{ loop.maxAttempts }},
 * and ${{ loop.priorAttempts }} for expression resolution inside sub-steps.
 */
async function executeLoop(
  loopSpec: LoopSpec,
  stepName: string,
  state: ExecutionState,
  options: ExecuteOptions & { runDir: string; spec: WorkflowSpec },
): Promise<StepResult> {
  const { ctx, pi, signal, loadAgent, runDir, spec } = options;
  const startTime = Date.now();

  // Resolve maxAttempts (may be a ${{ }} expression)
  const scope = { input: state.input, steps: state.steps };
  let maxAttempts: number;
  if (loopSpec.attempts) {
    const resolved = resolveExpressions(loopSpec.attempts, scope);
    maxAttempts = Number(resolved);
    if (isNaN(maxAttempts) || maxAttempts < 1) maxAttempts = loopSpec.maxAttempts ?? 3;
  } else {
    maxAttempts = loopSpec.maxAttempts ?? 3;
  }

  const allAttempts: LoopAttempt[] = [];
  let loopStatus: "completed" | "failed" = "failed";  // assume failure until break
  let lastIterationSteps: Record<string, StepResult> = {};

  for (let iteration = 0; iteration < maxAttempts; iteration++) {
    // Check cancellation
    if (signal?.aborted) break;

    const iterationSteps: Record<string, StepResult> = {};
    let shouldBreak = false;
    let iterationFailed = false;

    // Execute sub-steps sequentially
    const subStepEntries = Object.entries(loopSpec.steps);
    for (const [subName, subSpec] of subStepEntries) {
      if (signal?.aborted) break;

      // Build scope with loop context
      const subScope: Record<string, unknown> = {
        input: state.input,
        steps: { ...state.steps, ...iterationSteps },  // see prior sub-steps in this iteration
        loop: {
          iteration,
          maxAttempts,
          priorAttempts: allAttempts,
        },
      };

      // Handle `when` conditional
      if (subSpec.when) {
        const condExpr = subSpec.when.replace(/^\$\{\{\s*/, "").replace(/\s*\}\}$/, "");
        if (!evaluateCondition(condExpr, subScope)) {
          iterationSteps[subName] = {
            step: subName,
            agent: subSpec.agent ?? "skipped",
            status: "skipped",
            usage: zeroUsage(),
            durationMs: 0,
          };
          continue;
        }
      }

      // Execute sub-step based on type
      let result: StepResult;

      if (subSpec.gate) {
        const resolvedCheck = String(resolveExpressions(subSpec.gate.check, subScope));
        result = await executeGate({ ...subSpec.gate, check: resolvedCheck }, subName, { cwd: ctx.cwd, signal });

        // Handle gate pass/fail with break/continue
        const passed = result.output?.passed;
        if (passed && subSpec.gate.onPass === "break") {
          iterationSteps[subName] = result;
          shouldBreak = true;
          loopStatus = "completed";
          break;
        }
        if (!passed) {
          if (subSpec.gate.onFail === "break") {
            iterationSteps[subName] = result;
            shouldBreak = true;
            break;
          }
          if (subSpec.gate.onFail === "fail") {
            // Explicitly set to "fail" — stop the loop
            result.status = "failed";
            iterationSteps[subName] = result;
            iterationFailed = true;
            break;
          }
          // Default inside loops is "continue" — proceed to next sub-step
          // (or end iteration, triggering retry)
        }
      } else if (subSpec.transform) {
        result = executeTransform(subSpec.transform, subName, subScope);
        if (result.status === "failed") {
          iterationSteps[subName] = result;
          iterationFailed = true;
          break;
        }
      } else if (subSpec.agent) {
        // Resolve input, load agent, dispatch
        let resolvedInput: unknown;
        try {
          resolvedInput = resolveExpressions(subSpec.input ?? {}, subScope);
        } catch (err) {
          iterationSteps[subName] = {
            step: subName,
            agent: subSpec.agent,
            status: "failed",
            usage: zeroUsage(),
            durationMs: 0,
            error: err instanceof Error ? err.message : String(err),
          };
          iterationFailed = true;
          break;
        }

        const agentSpec = loadAgent(subSpec.agent);
        const prompt = buildPrompt(subSpec, agentSpec, resolvedInput, runDir, `${stepName}-${iteration}-${subName}`);

        result = await dispatch(subSpec, agentSpec, prompt, {
          cwd: ctx.cwd,
          sessionLogDir: path.join(runDir, "sessions"),
          stepName: `${stepName}-${iteration}-${subName}`,
          signal,
        });

        if (result.status === "failed") {
          iterationSteps[subName] = result;
          iterationFailed = true;
          break;
        }
      } else {
        continue;  // unknown step type, skip
      }

      iterationSteps[subName] = result!;
    }

    // Record this iteration
    lastIterationSteps = iterationSteps;
    allAttempts.push({ iteration, steps: iterationSteps });

    if (shouldBreak) break;
    if (iterationFailed) {
      // Agent step failed within loop — stop the loop (not just the iteration)
      loopStatus = "failed";
      break;
    }

    // End of iteration without break — loop continues to next iteration
  }

  // If loop exhausted without break or failure, run onExhausted
  if (loopStatus !== "completed" && loopSpec.onExhausted) {
    const exhaustedScope: Record<string, unknown> = {
      input: state.input,
      steps: state.steps,
      loop: {
        iteration: allAttempts.length,
        maxAttempts,
        priorAttempts: allAttempts,
        allAttempts,
      },
    };

    let resolvedInput: unknown;
    try {
      resolvedInput = resolveExpressions(loopSpec.onExhausted.input ?? {}, exhaustedScope);
    } catch {
      // Expression error in onExhausted — record and fail
    }

    if (loopSpec.onExhausted.agent) {
      const agentSpec = loadAgent(loopSpec.onExhausted.agent);
      const prompt = buildPrompt(loopSpec.onExhausted, agentSpec, resolvedInput, runDir, `${stepName}-exhausted`);

      const exhaustedResult = await dispatch(loopSpec.onExhausted, agentSpec, prompt, {
        cwd: ctx.cwd,
        sessionLogDir: path.join(runDir, "sessions"),
        stepName: `${stepName}-exhausted`,
        signal,
      });

      // Include exhausted result in the loop's output
      lastIterationSteps["_exhausted"] = exhaustedResult;
    }
  }

  // Aggregate usage across all iterations
  const totalUsage = zeroUsage();
  for (const attempt of allAttempts) {
    for (const result of Object.values(attempt.steps)) {
      totalUsage.input += result.usage.input;
      totalUsage.output += result.usage.output;
      totalUsage.cacheRead += result.usage.cacheRead;
      totalUsage.cacheWrite += result.usage.cacheWrite;
      totalUsage.cost += result.usage.cost;
      totalUsage.turns += result.usage.turns;
    }
  }

  return {
    step: stepName,
    agent: "loop",
    status: loopStatus,
    output: {
      iterations: allAttempts.length,
      maxAttempts,
      attempts: allAttempts,
      lastIteration: lastIterationSteps,
    },
    textOutput: `Loop '${stepName}': ${allAttempts.length}/${maxAttempts} iterations, status: ${loopStatus}`,
    usage: totalUsage,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Build a conservative execution plan that preserves declaration-order
 * sequencing for steps without explicit `${{ steps.X }}` dependencies.
 *
 * Steps with no explicit dependencies implicitly depend on the previous
 * step in declaration order. This ensures backward compatibility with
 * workflows written for sequential execution while still allowing
 * DAG-inferred parallelism for steps that DO have explicit dependencies
 * (e.g., diamond patterns where two steps both depend on an earlier step).
 */
function buildConservativePlan(spec: WorkflowSpec): ExecutionPlan {
  const deps = extractDependencies(spec);
  const allSteps = Object.keys(spec.steps);

  // Add implicit declaration-order dependency for steps with no explicit deps.
  // If a step has no ${{ steps.X }} references at all, it depends on the
  // immediately preceding step in YAML order.
  for (let i = 1; i < allSteps.length; i++) {
    const stepDeps = deps.get(allSteps[i])!;
    if (stepDeps.size === 0) {
      stepDeps.add(allSteps[i - 1]);
    }
  }

  // Topological sort with layer grouping (same algorithm as buildExecutionPlan)
  const plan: ExecutionPlan = [];
  const placed = new Set<string>();

  while (placed.size < allSteps.length) {
    const layer: string[] = [];
    for (const step of allSteps) {
      if (placed.has(step)) continue;
      const stepDeps = deps.get(step) ?? new Set();
      if ([...stepDeps].every((d) => placed.has(d))) {
        layer.push(step);
      }
    }
    if (layer.length === 0) {
      const remaining = allSteps.filter((s) => !placed.has(s));
      throw new Error(`Dependency cycle detected among steps: ${remaining.join(", ")}`);
    }
    plan.push({ steps: layer });
    for (const s of layer) placed.add(s);
  }

  return plan;
}

/** Options passed to single-step and parallel-layer execution helpers. */
interface StepExecOptions {
  ctx: any;
  pi: any;
  signal?: AbortSignal;
  loadAgent: (name: string) => AgentSpec;
  runDir: string;
  spec: WorkflowSpec;
  widgetState: ProgressWidgetState;
}

/**
 * Execute a single step (agent, gate, transform, loop, or parallel).
 *
 * This is the existing per-step logic extracted into a reusable function.
 * Returns true if the workflow should continue, false if it should stop
 * (due to failure, break, or cancellation).
 */
async function executeSingleStep(
  stepName: string,
  stepSpec: StepSpec,
  state: ExecutionState,
  options: StepExecOptions,
): Promise<boolean> {
  const { ctx, signal, loadAgent, runDir, spec, widgetState } = options;

  // Check cancellation
  if (signal?.aborted) {
    state.steps[stepName] = {
      step: stepName,
      agent: stepSpec.agent,
      status: "failed",
      usage: zeroUsage(),
      durationMs: 0,
      error: "Workflow cancelled",
    };
    state.status = "failed";
    return false;
  }

  // Build expression scope
  const scope: ExpressionScope = { input: state.input, steps: state.steps };

  // Evaluate `when` conditional
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
      if (ctx.hasUI) {
        ctx.ui.setWidget("workflow-progress", createProgressWidget(widgetState));
      }
      return true;
    }
  }

  // Update widget: mark this step as current
  widgetState.currentStep = stepName;
  if (ctx.hasUI) {
    ctx.ui.setWidget("workflow-progress", createProgressWidget(widgetState));
  }

  // ── Gate step ──
  if (stepSpec.gate) {
    const resolvedCheck = String(resolveExpressions(stepSpec.gate.check, scope as unknown as Record<string, unknown>));
    const resolvedGate: GateSpec = { ...stepSpec.gate, check: resolvedCheck };
    const gateResult = await executeGate(resolvedGate, stepName, { cwd: ctx.cwd, signal });
    const gateOutput = gateResult.output as { passed: boolean; exitCode: number; output: string };

    if (gateOutput.passed) {
      const onPass = stepSpec.gate.onPass ?? "continue";
      state.steps[stepName] = gateResult;
      writeState(runDir, state);
      if (ctx.hasUI) ctx.ui.setWidget("workflow-progress", createProgressWidget(widgetState));
      return onPass !== "break";
    } else {
      const onFail = stepSpec.gate.onFail ?? "fail";
      if (onFail === "fail") {
        gateResult.status = "failed";
        gateResult.error = `Gate check failed (exit ${gateOutput.exitCode}): ${gateOutput.output}`;
        state.steps[stepName] = gateResult;
        state.status = "failed";
        writeState(runDir, state);
        if (ctx.hasUI) ctx.ui.setWidget("workflow-progress", createProgressWidget(widgetState));
        return false;
      } else if (onFail === "continue") {
        state.steps[stepName] = gateResult;
        writeState(runDir, state);
        if (ctx.hasUI) ctx.ui.setWidget("workflow-progress", createProgressWidget(widgetState));
        return true;
      } else if (onFail === "break") {
        state.steps[stepName] = gateResult;
        writeState(runDir, state);
        if (ctx.hasUI) ctx.ui.setWidget("workflow-progress", createProgressWidget(widgetState));
        return false;
      }
    }
  }

  // ── Transform step ──
  if (stepSpec.transform) {
    const transformResult = executeTransform(stepSpec.transform, stepName, scope as unknown as Record<string, unknown>);
    if (transformResult.output) writeStepOutput(runDir, stepName, transformResult.output);
    state.steps[stepName] = transformResult;
    writeState(runDir, state);
    if (ctx.hasUI) ctx.ui.setWidget("workflow-progress", createProgressWidget(widgetState));
    if (transformResult.status === "failed") {
      state.status = "failed";
      return false;
    }
    return true;
  }

  // ── Loop step ──
  if (stepSpec.loop) {
    const loopResult = await executeLoop(stepSpec.loop, stepName, state, {
      ctx: options.ctx, pi: options.pi, signal, loadAgent, runDir, spec,
    });
    state.steps[stepName] = loopResult;
    writeState(runDir, state);
    if (ctx.hasUI) ctx.ui.setWidget("workflow-progress", createProgressWidget(widgetState));
    if (loopResult.status === "failed") {
      state.status = "failed";
      return false;
    }
    return true;
  }

  // ── Parallel step ──
  if (stepSpec.parallel) {
    const parallelResult = await executeParallelStep(stepSpec.parallel, stepName, state, options);
    state.steps[stepName] = parallelResult;
    writeState(runDir, state);
    if (ctx.hasUI) ctx.ui.setWidget("workflow-progress", createProgressWidget(widgetState));
    if (parallelResult.status === "failed") {
      state.status = "failed";
      return false;
    }
    return true;
  }

  // ── Agent step (default) ──
  let resolvedInput: unknown;
  try {
    resolvedInput = resolveExpressions(stepSpec.input ?? {}, scope);
  } catch (err) {
    state.steps[stepName] = {
      step: stepName,
      agent: stepSpec.agent,
      status: "failed",
      usage: zeroUsage(),
      durationMs: 0,
      error: err instanceof Error ? err.message : String(err),
    };
    state.status = "failed";
    return false;
  }

  const agentSpec = loadAgent(stepSpec.agent);
  const prompt = buildPrompt(stepSpec, agentSpec, resolvedInput, runDir, stepName);

  const result = await dispatch(stepSpec, agentSpec, prompt, {
    cwd: ctx.cwd,
    sessionLogDir: path.join(runDir, "sessions"),
    stepName,
    signal,
    timeoutMs: stepSpec.timeout ? stepSpec.timeout.seconds * 1000 : undefined,
    onEvent: () => {},
  });

  // Validate output against schema (if defined)
  if (stepSpec.output?.schema && result.status === "completed") {
    const schemaPath = resolveSchemaPath(stepSpec.output.schema, spec.filePath);
    try {
      const outputFilePath = path.join(runDir, "outputs", `${stepName}.json`);
      if (fs.existsSync(outputFilePath)) {
        const rawOutput = JSON.parse(fs.readFileSync(outputFilePath, "utf-8"));
        validateFromFile(schemaPath, rawOutput, `step output for '${stepName}'`);
        result.output = rawOutput;
      } else {
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
    writeStepOutput(runDir, stepName, result.output);
  }

  state.steps[stepName] = result;
  writeState(runDir, state);
  if (ctx.hasUI) ctx.ui.setWidget("workflow-progress", createProgressWidget(widgetState));

  if (result.status === "failed") {
    state.status = "failed";
    return false;
  }
  return true;
}

/**
 * Execute all steps in a layer concurrently.
 *
 * All steps start at the same time. If any step fails, remaining steps
 * are cancelled via a shared AbortController. All results are collected
 * before proceeding to the next layer.
 *
 * Parallel steps write to distinct keys in `state.steps`, which is safe
 * in single-threaded Node.js. `writeState` uses atomic write (tmp + rename),
 * so concurrent calls are safe — last one wins.
 */
async function executeParallelLayer(
  layer: ExecutionLayer,
  spec: WorkflowSpec,
  state: ExecutionState,
  options: StepExecOptions,
): Promise<void> {
  const { ctx, signal, widgetState } = options;

  // Create a child AbortController to cancel siblings on failure
  const layerController = new AbortController();
  if (signal) {
    if (signal.aborted) {
      layerController.abort(signal.reason);
    } else {
      signal.addEventListener("abort", () => layerController.abort(signal.reason), { once: true });
    }
  }

  // Update widget to show all parallel steps as running
  widgetState.currentStep = layer.steps.join(", ");
  if (ctx.hasUI) {
    ctx.ui.setWidget("workflow-progress", createProgressWidget(widgetState));
  }

  // Launch all steps concurrently
  const promises = layer.steps.map(async (stepName) => {
    const stepSpec = spec.steps[stepName];
    const success = await executeSingleStep(stepName, stepSpec, state, {
      ...options,
      signal: layerController.signal,
    });
    if (!success && !layerController.signal.aborted) {
      layerController.abort(new Error(`Step '${stepName}' failed`));
    }
    return { stepName, success };
  });

  const results = await Promise.allSettled(promises);

  // Check for failures
  for (const result of results) {
    if (result.status === "rejected") {
      state.status = "failed";
      break;
    }
    if (result.status === "fulfilled" && !result.value.success) {
      state.status = "failed";
      break;
    }
  }
}

/**
 * Execute a parallel step — runs all named sub-steps concurrently.
 *
 * Similar to executeParallelLayer but operates on sub-steps within
 * a single declared step. The parallel step's result aggregates
 * all sub-step results. Sub-step outputs are accessible via
 * `${{ steps.<parallelStepName>.output.<subStepName> }}`.
 */
async function executeParallelStep(
  parallelSpec: Record<string, StepSpec>,
  stepName: string,
  state: ExecutionState,
  options: StepExecOptions,
): Promise<StepResult> {
  const startTime = Date.now();
  const { signal } = options;

  const parallelController = new AbortController();
  if (signal) {
    if (signal.aborted) {
      parallelController.abort(signal.reason);
    } else {
      signal.addEventListener("abort", () => parallelController.abort(signal.reason), { once: true });
    }
  }

  // Sub-steps share the outer state for reading but write to their own keys
  const subResults: Record<string, StepResult> = {};

  const subPromises = Object.entries(parallelSpec).map(async ([subName, subSpec]) => {
    const success = await executeSingleStep(subName, subSpec, state, {
      ...options,
      signal: parallelController.signal,
    });
    subResults[subName] = state.steps[subName];
    if (!success && !parallelController.signal.aborted) {
      parallelController.abort(new Error(`Sub-step '${subName}' failed`));
    }
    return success;
  });

  const settled = await Promise.allSettled(subPromises);

  // Aggregate usage and outputs
  const totalUsage = zeroUsage();
  const subOutputs: Record<string, unknown> = {};
  let anyFailed = false;

  for (const [subName] of Object.entries(parallelSpec)) {
    const sub = subResults[subName];
    if (sub) {
      totalUsage.input += sub.usage.input;
      totalUsage.output += sub.usage.output;
      totalUsage.cacheRead += sub.usage.cacheRead;
      totalUsage.cacheWrite += sub.usage.cacheWrite;
      totalUsage.cost += sub.usage.cost;
      totalUsage.turns += sub.usage.turns;
      subOutputs[subName] = sub.output ?? sub.textOutput;
      if (sub.status === "failed") anyFailed = true;
    }
  }

  // Check for rejected promises too
  for (const s of settled) {
    if (s.status === "rejected") anyFailed = true;
  }

  return {
    step: stepName,
    agent: "parallel",
    status: anyFailed ? "failed" : "completed",
    output: subOutputs,
    textOutput: JSON.stringify(subOutputs, null, 2),
    usage: totalUsage,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Execute a workflow from a parsed spec and validated input.
 *
 * Runs steps sequentially (phase 1), resolving ${{ }} expressions,
 * dispatching subprocesses, validating outputs, persisting state,
 * updating TUI, and injecting the result into the conversation.
 *
 * Supports step types: agent (default), gate, transform, loop.
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
  const runDir = initRunDir(ctx.cwd, spec.name, runId);
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

  // 5. Build execution plan and execute layers
  const plan = buildConservativePlan(spec);
  const stepOpts = { ctx, pi, signal, loadAgent, runDir, spec, widgetState };

  for (const layer of plan) {
    if (signal?.aborted) {
      // Mark first unprocessed step as cancelled
      for (const sn of layer.steps) {
        if (!state.steps[sn]) {
          state.steps[sn] = {
            step: sn,
            agent: spec.steps[sn].agent,
            status: "failed",
            usage: zeroUsage(),
            durationMs: 0,
            error: "Workflow cancelled",
          };
        }
      }
      state.status = "failed";
      break;
    }

    if (layer.steps.length === 1) {
      // Single step — execute exactly as before
      const stepName = layer.steps[0];
      const stepSpec = spec.steps[stepName];
      const cont = await executeSingleStep(stepName, stepSpec, state, stepOpts);
      if (!cont) break;
    } else {
      // Multiple independent steps — execute concurrently
      await executeParallelLayer(layer, spec, state, stepOpts);
      if (state.status === "failed") break;
    }
  }

  // 5. Finalize
  if (state.status === "running") {
    state.status = "completed";
  }
  writeState(runDir, state);
  writeMetrics(runDir, state.steps);

  // 6. Process artifacts
  const writtenArtifacts: Record<string, string> = {};
  if (spec.artifacts) {
    const workflowDir = getWorkflowDir(ctx.cwd, spec.name);
    const artifactScope: Record<string, unknown> = {
      input: state.input,
      steps: state.steps,
      runId,
      runDir,
    };

    for (const [name, artifactSpec] of Object.entries(spec.artifacts)) {
      try {
        // Resolve the output path (may contain expressions)
        // Relative paths resolve against the workflow's output directory
        const resolvedPath = String(resolveExpressions(artifactSpec.path, artifactScope));
        const absolutePath = path.isAbsolute(resolvedPath)
          ? resolvedPath
          : path.resolve(workflowDir, resolvedPath);

        // Resolve the data source — wrap `from` as ${{ from }} for expression resolution
        const fromExpr = artifactSpec.from.startsWith("${{") ? artifactSpec.from : `\${{ ${artifactSpec.from} }}`;
        const data = resolveExpressions(fromExpr, artifactScope);

        // Validate against schema if specified
        if (artifactSpec.schema) {
          const schemaPath = resolveSchemaPath(artifactSpec.schema, spec.filePath);
          validateFromFile(schemaPath, data, `artifact '${name}'`);
        }

        // Write the artifact
        fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
        if (typeof data === "string") {
          fs.writeFileSync(absolutePath, data);
        } else {
          fs.writeFileSync(absolutePath, JSON.stringify(data, null, 2));
        }

        writtenArtifacts[name] = absolutePath;
      } catch (err) {
        // Artifact write failure is non-fatal — log warning, don't fail the workflow
        const msg = err instanceof Error ? err.message : String(err);
        if (ctx.hasUI) {
          ctx.ui.notify(`Artifact '${name}' failed: ${msg}`, "warning");
        }
      }
    }
  }

  // 7. Clean up TUI
  if (ctx.hasUI) {
    ctx.ui.setWidget("workflow-progress", undefined);
    ctx.ui.setWorkingMessage(undefined);
  }

  // 8. Build and inject result
  const result = buildResult(spec, runId, runDir, state, state.status as "completed" | "failed");

  // Attach written artifact paths to the result
  if (Object.keys(writtenArtifacts).length > 0) {
    result.artifacts = writtenArtifacts;
  }
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
