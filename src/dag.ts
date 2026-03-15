/**
 * DAG dependency analysis and execution planning for workflow steps.
 * Extracts `${{ steps.X }}` references, builds a dependency graph,
 * and produces layered execution plans for parallel dispatch.
 */
import type { WorkflowSpec, StepSpec } from "./types.ts";

/**
 * A single layer in the execution plan.
 * All steps in a layer are independent and can run concurrently.
 */
export interface ExecutionLayer {
  steps: string[];  // step names in this layer
}

/**
 * The full execution plan: an ordered list of layers.
 * Steps in the same layer have no mutual dependencies.
 * Steps in layer N depend only on steps in layers 0..N-1.
 */
export type ExecutionPlan = ExecutionLayer[];

/**
 * Extract all step dependencies from a workflow spec.
 *
 * Scans all expression-bearing fields in each step:
 * - `input` values (recursive — expressions can be nested in objects/arrays)
 * - `when` condition
 * - `gate.check` (may contain ${{ }})
 * - `transform.mapping` values (recursive)
 * - `loop.attempts` (may be an expression)
 *
 * Does NOT descend into loop sub-steps — a loop step's internal steps
 * are the loop's own concern, not part of the top-level DAG.
 *
 * Returns a map: stepName → Set of step names it depends on.
 */
export function extractDependencies(spec: WorkflowSpec): Map<string, Set<string>> {
  const stepNames = new Set(Object.keys(spec.steps));
  const deps = new Map<string, Set<string>>();

  for (const [name, step] of Object.entries(spec.steps)) {
    const stepDeps = new Set<string>();

    // Collect all expression strings from this step
    const expressions = collectExpressions(step);

    // Parse each expression for `steps.<name>` references
    for (const expr of expressions) {
      const referenced = extractStepReferences(expr, stepNames);
      for (const ref of referenced) {
        if (ref !== name) {  // no self-dependencies
          stepDeps.add(ref);
        }
      }
    }

    deps.set(name, stepDeps);
  }

  return deps;
}

/**
 * Collect all raw expression strings from a step spec.
 * Walks `input`, `when`, `gate.check`, `transform.mapping`, `loop.attempts`.
 */
function collectExpressions(step: StepSpec): string[] {
  const exprs: string[] = [];

  // input values (recursive)
  if (step.input) {
    collectExpressionsFromValue(step.input, exprs);
  }

  // when condition
  if (step.when) {
    exprs.push(step.when);
  }

  // gate check
  if (step.gate) {
    collectExpressionsFromValue(step.gate.check, exprs);
  }

  // transform mapping (recursive)
  if (step.transform) {
    collectExpressionsFromValue(step.transform.mapping, exprs);
  }

  // loop attempts expression
  if (step.loop?.attempts) {
    exprs.push(step.loop.attempts);
  }

  // forEach expression
  if (step.forEach) {
    collectExpressionsFromValue(step.forEach, exprs);
  }

  // command expression (may contain ${{ }} references)
  if (step.command) {
    collectExpressionsFromValue(step.command, exprs);
  }

  return exprs;
}

/**
 * Recursively collect expression strings from a value.
 * Walks objects, arrays, and strings looking for ${{ }} patterns.
 */
function collectExpressionsFromValue(value: unknown, exprs: string[]): void {
  if (typeof value === "string") {
    // Extract all ${{ ... }} patterns from the string
    const regex = /\$\{\{([^}]+)\}\}/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(value)) !== null) {
      exprs.push(match[1].trim());
    }
    // Also handle bare expressions (no ${{ }} wrapper, e.g. in `when`)
    if (!value.includes("${{") && value.includes("steps.")) {
      exprs.push(value);
    }
  } else if (Array.isArray(value)) {
    for (const item of value) {
      collectExpressionsFromValue(item, exprs);
    }
  } else if (value !== null && typeof value === "object") {
    for (const v of Object.values(value)) {
      collectExpressionsFromValue(v, exprs);
    }
  }
}

/**
 * Extract step name references from an expression string.
 *
 * Looks for patterns like:
 * - `steps.diagnose.output`
 * - `steps.diagnose.textOutput`
 * - `steps.diagnose.status`
 *
 * Returns the set of step names referenced.
 */
function extractStepReferences(expr: string, validStepNames: Set<string>): Set<string> {
  const refs = new Set<string>();
  // Match `steps.<name>` — name is a word (alphanumeric + underscore + hyphen)
  const regex = /steps\.([a-zA-Z_][\w-]*)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(expr)) !== null) {
    const name = match[1];
    if (validStepNames.has(name)) {
      refs.add(name);
    }
  }
  return refs;
}

/**
 * Build an execution plan from a pre-computed dependency map.
 * Performs topological sort, grouping independent steps into layers.
 * Throws if the dependency graph contains a cycle.
 */
export function buildPlanFromDeps(
  allSteps: string[],
  deps: Map<string, Set<string>>,
): ExecutionPlan {
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
      throw new Error(
        `Dependency cycle detected among steps: ${remaining.join(", ")}`,
      );
    }

    plan.push({ steps: layer });
    for (const s of layer) {
      placed.add(s);
    }
  }

  return plan;
}

/**
 * Build an execution plan from a workflow spec.
 *
 * Performs topological sort, grouping independent steps into layers.
 * Steps within a layer can execute concurrently.
 *
 * Throws if the dependency graph contains a cycle.
 */
export function buildExecutionPlan(spec: WorkflowSpec): ExecutionPlan {
  const deps = extractDependencies(spec);
  return buildPlanFromDeps(Object.keys(spec.steps), deps);
}

/**
 * Check if an execution plan is fully sequential
 * (every layer has exactly one step).
 */
export function isSequential(plan: ExecutionPlan): boolean {
  return plan.every((layer) => layer.steps.length === 1);
}
