import type { StepResult } from "./types.ts";
import { formatDuration, formatCost } from "./format.ts";

const EXPR_PATTERN = /\$\{\{\s*(.*?)\s*\}\}/g;

/**
 * Built-in filters for expressions.
 * Applied via pipe syntax: ${{ totalDurationMs | duration }}
 */
const FILTERS: Record<string, (value: unknown) => unknown> = {
  duration: (v) => formatDuration(Number(v)),
  currency: (v) => formatCost(Number(v)),
  json: (v) => JSON.stringify(v, null, 2),
};

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
 * Supports pipe filters: "totalDurationMs | duration"
 *
 * Scope is Record<string, unknown> — accepts ExpressionScope, CompletionScope, or any object.
 *
 * Throws ExpressionError if any segment of the path is undefined or null,
 * or if a filter name is unknown.
 */
export function resolveExpression(expr: string, scope: Record<string, unknown>): unknown {
  // Parse optional filter: "path | filterName"
  const pipeIdx = expr.indexOf("|");
  let pathExpr: string;
  let filterName: string | undefined;
  if (pipeIdx !== -1) {
    pathExpr = expr.slice(0, pipeIdx).trim();
    filterName = expr.slice(pipeIdx + 1).trim();
  } else {
    pathExpr = expr;
  }

  const segments = pathExpr.split(".");
  let current: unknown = scope;
  const traversed: string[] = [];

  for (const segment of segments) {
    // Container is undefined/null — can't traverse further. This is a broken reference.
    if (current === undefined || current === null) {
      const reason = buildErrorReason(segments, traversed, scope);
      throw new ExpressionError(expr, reason);
    }

    current = (current as Record<string, unknown>)[segment];
    traversed.push(segment);

    // Property doesn't exist on the container — return undefined (optional field).
    // But if this is the first segment (root lookup like "steps" or "input"),
    // or if we're looking up a step name that hasn't executed, that's an error.
    if (current === undefined) {
      // Root-level miss (e.g. "typo.something") — always an error
      if (traversed.length === 1) {
        const reason = buildErrorReason(segments, traversed, scope);
        throw new ExpressionError(expr, reason);
      }
      // Step reference that doesn't exist (e.g. "steps.nonexistent") — error
      if (segments[0] === "steps" && traversed.length === 2) {
        const reason = buildErrorReason(segments, traversed, scope);
        throw new ExpressionError(expr, reason);
      }
      // Otherwise: optional field on an existing object — return undefined
      return undefined;
    }
  }

  // Apply filter if specified
  if (filterName) {
    const filterFn = FILTERS[filterName];
    if (!filterFn) {
      throw new ExpressionError(expr, `unknown filter '${filterName}'`);
    }
    current = filterFn(current);
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
export function resolveExpressions(value: unknown, scope: Record<string, unknown>): unknown {
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
function resolveStringExpressions(value: string, scope: Record<string, unknown>): unknown {
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
    if (resolved === undefined || resolved === null) return "";
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
  scope: Record<string, unknown>,
): string {
  const failedSegment = traversed[traversed.length - 1];
  const parentPath = traversed.slice(0, -1).join(".");

  // Special case: referencing a step that doesn't exist in scope.steps
  if (segments[0] === "steps" && traversed.length === 2) {
    const stepName = segments[1];
    const stepsObj = scope.steps as Record<string, StepResult | undefined> | undefined;
    if (stepsObj && !(stepName in stepsObj)) {
      return `step '${stepName}' has not been executed yet`;
    }
  }

  // When the path starts with "steps.", include step status context if available
  if (segments[0] === "steps" && segments.length >= 2) {
    const stepName = segments[1];
    const stepsObj = scope.steps as Record<string, StepResult | undefined> | undefined;
    if (stepsObj) {
      const stepResult = stepsObj[stepName];
      if (stepResult && parentPath) {
        return `property '${failedSegment}' is undefined on ${parentPath} (step '${stepName}' status: ${stepResult.status})`;
      }
    }
  }

  if (parentPath) {
    return `property '${failedSegment}' is undefined on ${parentPath}`;
  }

  return `property '${failedSegment}' is undefined`;
}

/**
 * Evaluate a condition expression and return a boolean.
 *
 * The expression is a property path (same as resolveExpression) that resolves
 * to a value. The value is then coerced to boolean using JavaScript truthiness:
 * - undefined, null, false, 0, "", NaN → false
 * - everything else → true
 *
 * If the expression path fails to resolve (property doesn't exist),
 * the condition evaluates to false rather than throwing.
 */
export function evaluateCondition(expr: string, scope: Record<string, unknown>): boolean {
  try {
    const value = resolveExpression(expr, scope);
    return Boolean(value);
  } catch {
    // Unresolvable path → condition is false
    return false;
  }
}
