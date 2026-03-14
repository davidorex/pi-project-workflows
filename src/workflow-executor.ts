/**
 * Workflow executor — orchestrates step execution with DAG-based layering,
 * parallel dispatch, timeout enforcement, state persistence, and TUI updates.
 */
import fs from "node:fs";
import path from "node:path";
import type { WorkflowSpec, WorkflowResult, AgentSpec, ExecutionState, ExpressionScope, StepSpec } from "./types.ts";
import type { ProgressWidgetState } from "./tui.ts";
import { validate, validateFromFile } from "./schema-validator.ts";
import { resolveExpressions, evaluateCondition } from "./expression.ts";
import { dispatch } from "./dispatch.ts";
import { generateRunId, initRunDir, getWorkflowDir, writeState, writeStepOutput, writeMetrics, buildResult, formatResult } from "./state.ts";
import { resolveCompletion } from "./completion.ts";
import { createProgressWidget } from "./tui.ts";
import { extractDependencies, buildPlanFromDeps } from "./dag.ts";
import type { ExecutionPlan } from "./dag.ts";
import { zeroUsage, resolveSchemaPath, persistStep, WIDGET_ID, SIGKILL_GRACE_MS } from "./step-shared.ts";
import { createTemplateEnv } from "./template.ts";
import type nunjucks from "nunjucks";
import { executeGate } from "./step-gate.ts";
import { executeTransform } from "./step-transform.ts";
import { executeLoop } from "./step-loop.ts";
import { executeParallelLayer, executeParallelStep } from "./step-parallel.ts";
import { executeAgentStep } from "./step-agent.ts";

// Re-export SIGKILL_GRACE_MS so tests that grep this file still find it
export { SIGKILL_GRACE_MS };

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

  return buildPlanFromDeps(allSteps, deps);
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
  templateEnv?: nunjucks.Environment;
}

/**
 * Execute a single step (agent, gate, transform, loop, or parallel).
 *
 * This is the central step type dispatcher. It delegates to the appropriate
 * step executor module based on the step spec type.
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
    const shouldRun = evaluateCondition(conditionExpr, scope);
    if (!shouldRun) {
      persistStep(state, stepName, {
        step: stepName,
        agent: stepSpec.agent ?? "skipped",
        status: "skipped",
        usage: zeroUsage(),
        durationMs: 0,
      }, runDir, widgetState, ctx);
      return true;
    }
  }

  // Update widget: mark this step as current
  widgetState.currentStep = stepName;
  if (ctx.hasUI) {
    ctx.ui.setWidget(WIDGET_ID, createProgressWidget(widgetState));
  }

  // ── Gate step ──
  if (stepSpec.gate) {
    const resolvedCheck = String(resolveExpressions(stepSpec.gate.check, scope));
    const resolvedGate = { ...stepSpec.gate, check: resolvedCheck };
    const gateResult = await executeGate(resolvedGate, stepName, {
      cwd: ctx.cwd,
      signal,
      timeoutMs: stepSpec.timeout ? stepSpec.timeout.seconds * 1000 : undefined,
    });
    const gateOutput = gateResult.output as { passed: boolean; exitCode: number; output: string };

    if (gateOutput.passed) {
      const onPass = stepSpec.gate.onPass ?? "continue";
      persistStep(state, stepName, gateResult, runDir, widgetState, ctx);
      return onPass !== "break";
    } else {
      const onFail = stepSpec.gate.onFail ?? "fail";
      if (onFail === "fail") {
        gateResult.status = "failed";
        gateResult.error = `Gate check failed (exit ${gateOutput.exitCode}): ${gateOutput.output}`;
        persistStep(state, stepName, gateResult, runDir, widgetState, ctx);
        state.status = "failed";
        return false;
      } else if (onFail === "continue") {
        persistStep(state, stepName, gateResult, runDir, widgetState, ctx);
        return true;
      } else if (onFail === "break") {
        persistStep(state, stepName, gateResult, runDir, widgetState, ctx);
        return false;
      }
    }
  }

  // ── Transform step ──
  if (stepSpec.transform) {
    const transformResult = executeTransform(stepSpec.transform, stepName, scope);
    if (transformResult.output) writeStepOutput(runDir, stepName, transformResult.output);
    persistStep(state, stepName, transformResult, runDir, widgetState, ctx);
    if (transformResult.status === "failed") {
      state.status = "failed";
      return false;
    }
    return true;
  }

  // ── Loop step ──
  if (stepSpec.loop) {
    const loopResult = await executeLoop(stepSpec.loop, stepName, state, {
      ctx, pi: options.pi, signal, loadAgent, runDir, spec,
      dispatchAgent: (s, a, p, o) => dispatch(s, a, p, o),
      templateEnv: options.templateEnv,
    });
    persistStep(state, stepName, loopResult, runDir, widgetState, ctx);
    if (loopResult.status === "failed") {
      state.status = "failed";
      return false;
    }
    return true;
  }

  // ── Parallel step ──
  if (stepSpec.parallel) {
    const parallelResult = await executeParallelStep(
      stepSpec.parallel, stepName, state, executeSingleStep, options,
    );
    persistStep(state, stepName, parallelResult, runDir, widgetState, ctx);
    if (parallelResult.status === "failed") {
      state.status = "failed";
      return false;
    }
    return true;
  }

  // ── Agent step (default) ──
  const agentResult = await executeAgentStep(stepName, stepSpec, state, {
    ctx, signal, loadAgent, runDir,
    specFilePath: spec.filePath,
    widgetState,
    templateEnv: options.templateEnv,
  });
  persistStep(state, stepName, agentResult, runDir, widgetState, ctx);
  if (agentResult.status === "failed") {
    state.status = "failed";
    return false;
  }
  return true;
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
    ctx.ui.setWidget(WIDGET_ID, createProgressWidget(widgetState));
  }

  // 4. Set working message
  if (ctx.hasUI) {
    ctx.ui.setWorkingMessage(`Running ${spec.name} workflow...`);
  }

  // 5. Build execution plan and execute layers
  const plan = buildConservativePlan(spec);
  const templateEnv = createTemplateEnv(ctx.cwd);
  const stepOpts: StepExecOptions = { ctx, pi, signal, loadAgent, runDir, spec, widgetState, templateEnv };

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
      await executeParallelLayer(layer, spec, state, executeSingleStep, stepOpts);
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
    ctx.ui.setWidget(WIDGET_ID, undefined);
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
