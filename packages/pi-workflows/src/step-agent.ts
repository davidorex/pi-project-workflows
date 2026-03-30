/**
 * Agent step executor — dispatches an LLM subprocess and validates output.
 */
import fs from "node:fs";
import path from "node:path";
import { validateFromFile } from "@davidorex/pi-project/schema-validator";
import type nunjucks from "nunjucks";
import { dispatch } from "./dispatch.js";
import { resolveExpressions } from "./expression.js";
import { persistStepOutput } from "./output.js";
import { buildPrompt, compileAgentSpec, resolveSchemaPath, zeroUsage } from "./step-shared.js";
import type { ProgressWidgetState } from "./tui.js";
import type { AgentSpec, ExecutionState, ExpressionScope, StepResult, StepSpec, WorkflowContext } from "./types.js";

/** Retry context passed from the executor on retry attempts. */
export interface RetryContext {
	attempt: number;
	priorErrors: string[];
	steeringMessage?: string;
}

export interface AgentStepOptions {
	ctx: WorkflowContext;
	signal?: AbortSignal;
	loadAgent: (name: string) => AgentSpec;
	runDir: string;
	specFilePath: string;
	widgetState: ProgressWidgetState;
	templateEnv?: nunjucks.Environment;
	dispatchFn?: typeof dispatch; // injectable for testing; defaults to real dispatch
	modelConfig?: import("./dispatch.js").ModelConfig;
	retryContext?: RetryContext; // set on retry attempts (attempt > 1)
	onStepActivity?: (activity: { tool: string; preview: string; timestamp: number }) => void;
	onStepUsageUpdate?: (update: { input: number; output: number; cost: number; turns: number }) => void;
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
	const agentName = stepSpec.agent!;
	const scope: ExpressionScope = { input: state.input, steps: state.steps };

	// Expose forEach bindings (as name + forEach metadata) if present on the state
	const stateAny = state as unknown as Record<string, unknown>;
	if (stateAny.forEach !== undefined) {
		scope.forEach = stateAny.forEach;
	}
	for (const key of Object.keys(stateAny)) {
		if (
			key !== "input" &&
			key !== "steps" &&
			key !== "status" &&
			key !== "loop" &&
			key !== "workflowName" &&
			key !== "specVersion" &&
			key !== "startedAt" &&
			key !== "updatedAt" &&
			key !== "forEach"
		) {
			scope[key] = stateAny[key];
		}
	}

	// Resolve input expressions
	let resolvedInput: unknown;
	try {
		resolvedInput = resolveExpressions(stepSpec.input ?? {}, scope);
	} catch (err) {
		return {
			step: stepName,
			agent: agentName,
			status: "failed",
			usage: zeroUsage(),
			durationMs: 0,
			error: err instanceof Error ? err.message : String(err),
		};
	}

	// Load and optionally render agent template
	let agentSpec: AgentSpec;
	try {
		agentSpec = loadAgent(agentName);
	} catch (err) {
		return {
			step: stepName,
			agent: agentName,
			status: "failed",
			usage: zeroUsage(),
			durationMs: 0,
			error: err instanceof Error ? err.message : String(err),
		};
	}
	// Track non-fatal issues to attach to the StepResult
	const warnings: string[] = [];

	// Inject output schema into template context if available
	if (stepSpec.output?.schema && typeof resolvedInput === "object" && resolvedInput !== null) {
		const schemaPath = resolveSchemaPath(stepSpec.output.schema, options.specFilePath, options.ctx.cwd);
		try {
			const schemaContent = fs.readFileSync(schemaPath, "utf8");
			(resolvedInput as Record<string, unknown>).output_schema = schemaContent;
		} catch {
			warnings.push(`Output schema not found at ${schemaPath} — template will render without output_schema`);
		}
	}
	agentSpec = compileAgentSpec(agentSpec, resolvedInput, templateEnv);

	let prompt = buildPrompt(stepSpec, agentSpec, resolvedInput, runDir, stepName, ctx.cwd);

	// Inject context from prior steps (narrative text inlining)
	if (stepSpec.context && stepSpec.context.length > 0) {
		const contextParts: string[] = [];
		for (const ctxStepName of stepSpec.context) {
			const ctxResult = state.steps[ctxStepName];
			if (!ctxResult?.textOutput) continue;
			contextParts.push(`### ${ctxStepName}\n`);
			contextParts.push(ctxResult.textOutput);
			contextParts.push("");
		}
		if (contextParts.length > 0) {
			prompt = `## Context from Prior Steps\n\n${contextParts.join("\n")}\n---\n\n${prompt}`;
		}
	}

	// Inject retry context if this is a retry attempt
	if (options.retryContext) {
		const rc = options.retryContext;
		const retryParts: string[] = [];
		retryParts.push(`## Retry Context (attempt ${rc.attempt})\n`);
		retryParts.push("Your previous attempt failed. The filesystem has been rolled back to its pre-attempt state.\n");
		retryParts.push("### Prior Errors");
		for (let i = 0; i < rc.priorErrors.length; i++) {
			retryParts.push(`${i + 1}. ${rc.priorErrors[i]}`);
		}
		retryParts.push("");
		if (rc.steeringMessage) {
			retryParts.push("### Steering");
			retryParts.push(rc.steeringMessage);
			retryParts.push("");
		}
		retryParts.push("---\n");
		prompt = retryParts.join("\n") + prompt;
	}

	const dispatchFn = options.dispatchFn ?? dispatch;
	const result = await dispatchFn(stepSpec, agentSpec, prompt, {
		cwd: ctx.cwd,
		sessionLogDir: path.join(runDir, "sessions"),
		stepName,
		signal,
		timeoutMs: stepSpec.timeout ? stepSpec.timeout.seconds * 1000 : undefined,
		onEvent: (event) => {
			if (event.type === "tool_execution_start" && event.toolName && options.onStepActivity) {
				options.onStepActivity({
					tool: event.toolName,
					preview: event.toolArgs || "",
					timestamp: Date.now(),
				});
			}
			if (event.type === "message_end" && event.usage && options.onStepUsageUpdate) {
				options.onStepUsageUpdate({
					input: event.usage.input ?? 0,
					output: event.usage.output ?? 0,
					cost: event.usage.cost ?? 0,
					turns: 1,
				});
			}
		},
		modelConfig: options.modelConfig,
	});

	// Resolve output path from spec (may contain ${{ }} expressions)
	const resolvedOutputPath = stepSpec.output?.path
		? String(resolveExpressions(stepSpec.output.path, scope))
		: undefined;

	// Validate output against schema (if defined)
	if (stepSpec.output?.schema && result.status === "completed") {
		const schemaPath = resolveSchemaPath(stepSpec.output.schema, specFilePath, ctx.cwd);
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
		// Auto-parse JSON output when agent or step declares json format (even without schema).
		// This populates result.output so downstream steps can access structured fields
		// via ${{ steps.<name>.output.<field> }} instead of getting undefined.
		const isJsonOutput = stepSpec.output?.format === "json" || agentSpec.outputFormat === "json";
		if (isJsonOutput && result.status === "completed" && result.textOutput) {
			try {
				result.output = JSON.parse(result.textOutput);
			} catch {
				/* Not valid JSON — leave output undefined, textOutput still available */
			}
		}
		result.outputPath = persistStepOutput(runDir, stepName, result.output, result.textOutput, resolvedOutputPath);
	}

	if (warnings.length > 0) {
		result.warnings = [...(result.warnings ?? []), ...warnings];
	}

	return result;
}
