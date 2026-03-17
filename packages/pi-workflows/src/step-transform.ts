/**
 * Transform step executor — produces output by resolving expressions in a mapping.
 * No LLM call, no subprocess, no shell command — pure expression resolution.
 */

import { resolveExpressions } from "./expression.js";
import { persistStepOutput } from "./output.js";
import { zeroUsage } from "./step-shared.js";
import type { StepResult, TransformSpec } from "./types.js";

/**
 * Execute a transform step: produces output by resolving expressions in the mapping.
 * No LLM call, no subprocess, no shell command — pure expression resolution.
 */
export function executeTransform(
	transform: TransformSpec,
	stepName: string,
	scope: Record<string, unknown>,
	runDir?: string,
	outputPath?: string,
): StepResult {
	const startTime = Date.now();
	try {
		const output = resolveExpressions(transform.mapping, scope);
		const result: StepResult = {
			step: stepName,
			agent: "transform",
			status: "completed",
			output,
			textOutput: JSON.stringify(output, null, 2),
			usage: zeroUsage(),
			durationMs: Date.now() - startTime,
		};
		if (runDir) {
			result.outputPath = persistStepOutput(runDir, stepName, output, undefined, outputPath);
		}
		return result;
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
