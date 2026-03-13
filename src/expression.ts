import type { ExpressionScope, StepResult } from "./types.ts";

const EXPR_PATTERN = /\$\{\{\s*(.*?)\s*\}\}/g;

/**
 * Error class for expression resolution failures.
 * Contains the original expression and a diagnostic reason.
 */
export class ExpressionError extends Error {
  readonly expression: string;
  readonly reason: string;

  constructor(expression: string, reason: string) {
    super(`Expression error in '\${{ ${expression} }}': ${reason}`);
    this.name = "ExpressionError";
    this.expression = expression;
    this.reason = reason;
  }
}

/**
 * Resolve a single expression string (without the ${{ }} delimiters).
 * E.g. "steps.diagnose.output.rootCause" walks scope.steps.diagnose.output.rootCause
 *
 * Throws ExpressionError if any segment of the path is undefined or null.
 */
export function resolveExpression(expr: string, scope: ExpressionScope): unknown {
  const segments = expr.split(".");
  let current: unknown = scope;
  const traversed: string[] = [];

  for (const segment of segments) {
    if (current === undefined || current === null) {
      const reason = buildErrorReason(segments, traversed, scope);
      throw new ExpressionError(expr, reason);
    }

    const parent = current;
    current = (current as Record<string, unknown>)[segment];
    traversed.push(segment);

    if (current === undefined || current === null) {
      const reason = buildErrorReason(segments, traversed, scope);
      throw new ExpressionError(expr, reason);
    }
  }

  return current;
}

/**
 * Resolve all ${{ }} expressions in a value.
 *
 * - If `value` is a string containing `${{ expr }}`, resolve the expression.
 * - If `value` is a string that IS entirely `${{ expr }}`, return the resolved value
 *   (preserving its type -- object, array, number, etc.).
 * - If `value` is a string with `${{ expr }}` embedded in other text,
 *   stringify the resolved value and interpolate.
 * - If `value` is an object, recursively resolve all values.
 * - If `value` is an array, recursively resolve all elements.
 * - If `value` is anything else (number, boolean, null), return as-is.
 *
 * Throws ExpressionError if a property path doesn't resolve.
 */
export function resolveExpressions(value: unknown, scope: ExpressionScope): unknown {
  if (typeof value === "string") {
    return resolveStringExpressions(value, scope);
  }

  if (Array.isArray(value)) {
    return value.map((element) => resolveExpressions(element, scope));
  }

  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      result[key] = resolveExpressions(val, scope);
    }
    return result;
  }

  // number, boolean, null, undefined — pass through
  return value;
}

/**
 * Resolve expressions within a string value.
 * Handles whole-value expressions (type-preserving) and embedded expressions (string interpolation).
 */
function resolveStringExpressions(value: string, scope: ExpressionScope): unknown {
  // Check if the entire string is a single whole-value expression
  const wholeMatch = value.match(/^\$\{\{\s*(.*?)\s*\}\}$/);
  if (wholeMatch) {
    return resolveExpression(wholeMatch[1], scope);
  }

  // Check if there are any expressions at all
  if (!value.includes("${{")) {
    return value;
  }

  // Embedded expressions: resolve each and interpolate as strings
  return value.replace(EXPR_PATTERN, (_match, expr: string) => {
    const resolved = resolveExpression(expr, scope);
    return stringify(resolved);
  });
}

/**
 * Stringify a resolved value for embedding in a larger string.
 * Objects and arrays use JSON.stringify; primitives use String().
 */
function stringify(value: unknown): string {
  if (value !== null && typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

/**
 * Build a diagnostic error reason based on the path traversal state.
 * Provides context about step status when the path starts with "steps.".
 */
function buildErrorReason(
  segments: string[],
  traversed: string[],
  scope: ExpressionScope,
): string {
  const failedSegment = traversed[traversed.length - 1];
  const parentPath = traversed.slice(0, -1).join(".");

  // Special case: referencing a step that doesn't exist in scope.steps
  if (segments[0] === "steps" && traversed.length === 2) {
    const stepName = segments[1];
    const stepsObj = scope.steps as Record<string, StepResult | undefined>;
    if (!(stepName in stepsObj)) {
      return `step '${stepName}' has not been executed yet`;
    }
  }

  // When the path starts with "steps.", include step status context if available
  if (segments[0] === "steps" && segments.length >= 2) {
    const stepName = segments[1];
    const stepsObj = scope.steps as Record<string, StepResult | undefined>;
    const stepResult = stepsObj[stepName];
    if (stepResult && parentPath) {
      return `property '${failedSegment}' is undefined on ${parentPath} (step '${stepName}' status: ${stepResult.status})`;
    }
  }

  if (parentPath) {
    return `property '${failedSegment}' is undefined on ${parentPath}`;
  }

  return `property '${failedSegment}' is undefined`;
}
