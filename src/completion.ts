import type { CompletionSpec, CompletionScope, WorkflowResult } from "./types.ts";
import { resolveExpression, resolveExpressions } from "./expression.ts";

/**
 * Resolve a completion spec into the final message string injected into
 * the main LLM conversation after workflow execution.
 *
 * Two forms:
 * - Template: the template string is resolved with ${{ }} expressions
 *   and returned as the full content.
 * - Message + include: the message is resolved, then each include path
 *   is resolved and appended as structured data.
 *
 * @param spec - the CompletionSpec from the workflow YAML
 * @param result - the completed WorkflowResult
 * @param executionInput - the original workflow input
 * @returns the resolved message string
 */
export function resolveCompletion(
  spec: CompletionSpec,
  result: WorkflowResult,
  executionInput: unknown,
): string {
  const scope: CompletionScope = {
    input: executionInput,
    steps: result.steps,
    totalUsage: result.totalUsage,
    totalDurationMs: result.totalDurationMs,
    runDir: result.runDir,
    runId: result.runId,
    workflow: result.workflow,
    status: result.status,
    output: result.output,
  };

  if (spec.template) {
    const resolved = resolveExpressions(spec.template, scope);
    return String(resolved ?? "");
  }

  // Message form
  const parts: string[] = [];

  if (spec.message) {
    const resolvedMessage = resolveExpressions(spec.message, scope);
    parts.push(String(resolvedMessage ?? ""));
  }

  if (spec.include && spec.include.length > 0) {
    const included: Record<string, unknown> = {};
    for (const path of spec.include) {
      const value = resolveExpression(path, scope);
      included[path] = value;
    }

    parts.push("");
    parts.push("---");
    for (const [path, value] of Object.entries(included)) {
      if (value !== null && typeof value === "object") {
        parts.push(`\n### ${path}\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``);
      } else {
        parts.push(`\n### ${path}\n${String(value ?? "")}`);
      }
    }
  }

  return parts.join("\n");
}
