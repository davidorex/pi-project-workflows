/**
 * Agent step executor — dispatches an LLM subprocess and validates output.
 */
import fs from "node:fs";
import path from "node:path";
import type { StepSpec, AgentSpec, StepResult, ExecutionState, ExpressionScope } from "./types.ts";
import type { ProgressWidgetState } from "./tui.ts";
import { resolveExpressions } from "./expression.ts";
import { dispatch } from "./dispatch.ts";
import { validateFromFile } from "./schema-validator.ts";
import { persistStepOutput } from "./output.ts";
import { zeroUsage, resolveSchemaPath, buildPrompt, compileAgentSpec } from "./step-shared.ts";
import type nunjucks from "nunjucks";

export interface AgentStepOptions {
  ctx: any;
  signal?: AbortSignal;
  loadAgent: (name: string) => AgentSpec;
  runDir: string;
  specFilePath: string;
  widgetState: ProgressWidgetState;
  templateEnv?: nunjucks.Environment;
  dispatchFn?: typeof dispatch;   // injectable for testing; defaults to real dispatch
  modelConfig?: import("./dispatch.ts").ModelConfig;
}

/**
 * Execute an agent step: resolve input, render templates, dispatch subprocess,
 * validate output, persist result.
 *
 * Returns the StepResult.
 */
export async function executeAgentStep(
  stepName: string,
  stepSpec: StepSpec,
  state: ExecutionState,
  options: AgentStepOptions,
): Promise<StepResult> {
  const { ctx, signal, loadAgent, runDir, specFilePath, templateEnv } = options;
  const scope: ExpressionScope = { input: state.input, steps: state.steps };

  // Resolve input expressions
  let resolvedInput: unknown;
  try {
    resolvedInput = resolveExpressions(stepSpec.input ?? {}, scope);
  } catch (err) {
    return {
      step: stepName,
      agent: stepSpec.agent,
      status: "failed",
      usage: zeroUsage(),
      durationMs: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // Load and optionally render agent template
  let agentSpec: AgentSpec;
  try {
    agentSpec = loadAgent(stepSpec.agent);
  } catch (err) {
    return {
      step: stepName,
      agent: stepSpec.agent,
      status: "failed",
      usage: zeroUsage(),
      durationMs: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
  agentSpec = compileAgentSpec(agentSpec, resolvedInput, templateEnv);

  const prompt = buildPrompt(stepSpec, agentSpec, resolvedInput, runDir, stepName);

  const dispatchFn = options.dispatchFn ?? dispatch;
  const result = await dispatchFn(stepSpec, agentSpec, prompt, {
    cwd: ctx.cwd,
    sessionLogDir: path.join(runDir, "sessions"),
    stepName,
    signal,
    timeoutMs: stepSpec.timeout ? stepSpec.timeout.seconds * 1000 : undefined,
    onEvent: () => {},
    modelConfig: options.modelConfig,
  });

  // Resolve output path from spec (may contain ${{ }} expressions)
  const resolvedOutputPath = stepSpec.output?.path
    ? String(resolveExpressions(stepSpec.output.path, scope))
    : undefined;

  // Validate output against schema (if defined)
  if (stepSpec.output?.schema && result.status === "completed") {
    const schemaPath = resolveSchemaPath(stepSpec.output.schema, specFilePath);
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
          result.outputPath = persistStepOutput(runDir, stepName, parsed, undefined, resolvedOutputPath);
        } catch {
          result.status = "failed";
          result.error = `Step '${stepName}' has output schema but no valid JSON output was produced`;
        }
      }
    } catch (err) {
      result.status = "failed";
      result.error = err instanceof Error ? err.message : String(err);
    }
  } else {
    result.outputPath = persistStepOutput(runDir, stepName, result.output, result.textOutput, resolvedOutputPath);
  }

  return result;
}
