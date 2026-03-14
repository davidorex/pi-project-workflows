/**
 * Transform step executor — produces output by resolving expressions in a mapping.
 * No LLM call, no subprocess, no shell command — pure expression resolution.
 */
import type { TransformSpec, StepResult } from "./types.ts";
import { resolveExpressions } from "./expression.ts";
import { zeroUsage } from "./step-shared.ts";

/**
 * Execute a transform step: produces output by resolving expressions in the mapping.
 * No LLM call, no subprocess, no shell command — pure expression resolution.
 */
export function executeTransform(
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
