import { parse as parseYaml } from "yaml";
import type { WorkflowSpec, StepSpec, StepOutputSpec, CompletionSpec, GateSpec, TransformSpec } from "./types.ts";

/**
 * Error class for spec parsing failures.
 */
export class WorkflowSpecError extends Error {
  readonly filePath: string;
  readonly reason: string;

  constructor(filePath: string, reason: string) {
    super(`Invalid workflow spec (${filePath}): ${reason}`);
    this.name = "WorkflowSpecError";
    this.filePath = filePath;
    this.reason = reason;
  }
}

/**
 * Parse a YAML string into a WorkflowSpec.
 * Validates structure (required fields, types).
 * Does NOT validate JSON Schemas or resolve agent references — that happens at execution time.
 *
 * @param content - raw YAML string
 * @param filePath - absolute path to the file (stored on the spec, used in error messages)
 * @param source - "user" or "project"
 * @throws WorkflowSpecError on invalid structure
 */
export function parseWorkflowSpec(content: string, filePath: string, source: "user" | "project"): WorkflowSpec {
  let doc: unknown;
  try {
    doc = parseYaml(content);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new WorkflowSpecError(filePath, `invalid YAML: ${msg}`);
  }

  if (typeof doc !== "object" || doc === null || Array.isArray(doc)) {
    throw new WorkflowSpecError(filePath, "'name' is required");
  }

  const raw = doc as Record<string, unknown>;

  // Validate name
  if (!("name" in raw) || raw.name === undefined || raw.name === null) {
    throw new WorkflowSpecError(filePath, "'name' is required");
  }
  if (typeof raw.name !== "string") {
    throw new WorkflowSpecError(filePath, "'name' is required");
  }

  // Validate steps
  if (!("steps" in raw) || raw.steps === undefined || raw.steps === null) {
    throw new WorkflowSpecError(filePath, "'steps' must be a non-empty object");
  }
  if (typeof raw.steps !== "object" || Array.isArray(raw.steps)) {
    throw new WorkflowSpecError(filePath, "'steps' must be a non-empty object");
  }
  const rawSteps = raw.steps as Record<string, unknown>;
  if (Object.keys(rawSteps).length === 0) {
    throw new WorkflowSpecError(filePath, "'steps' must be a non-empty object");
  }

  // Validate each step
  const steps: Record<string, StepSpec> = {};
  for (const [stepName, stepValue] of Object.entries(rawSteps)) {
    if (typeof stepValue !== "object" || stepValue === null || Array.isArray(stepValue)) {
      throw new WorkflowSpecError(filePath, `step '${stepName}' is missing 'agent'`);
    }
    const rawStep = stepValue as Record<string, unknown>;

    // A step needs either 'agent', 'gate', or 'transform'
    const hasGate = "gate" in rawStep && rawStep.gate !== undefined;
    const hasTransform = "transform" in rawStep && rawStep.transform !== undefined;
    const hasAgent = "agent" in rawStep && typeof rawStep.agent === "string";

    if (!hasAgent && !hasGate && !hasTransform) {
      throw new WorkflowSpecError(filePath, `step '${stepName}' is missing 'agent'`);
    }

    // input must be an object if present
    if ("input" in rawStep && rawStep.input !== undefined) {
      if (typeof rawStep.input !== "object" || rawStep.input === null || Array.isArray(rawStep.input)) {
        throw new WorkflowSpecError(filePath, `step '${stepName}' input must be an object`);
      }
    }

    // output must be an object if present; output.schema must be a string if present
    let output: StepOutputSpec | undefined;
    if ("output" in rawStep && rawStep.output !== undefined) {
      if (typeof rawStep.output !== "object" || rawStep.output === null || Array.isArray(rawStep.output)) {
        throw new WorkflowSpecError(filePath, `step '${stepName}' output must be an object`);
      }
      const rawOutput = rawStep.output as Record<string, unknown>;
      output = {} as StepOutputSpec;
      if ("format" in rawOutput) {
        output.format = rawOutput.format as StepOutputSpec["format"];
      }
      if ("schema" in rawOutput) {
        if (typeof rawOutput.schema !== "string") {
          throw new WorkflowSpecError(filePath, `step '${stepName}' output.schema must be a string`);
        }
        output.schema = rawOutput.schema;
      }
    }

    // model must be a string if present
    if ("model" in rawStep && rawStep.model !== undefined) {
      if (typeof rawStep.model !== "string") {
        throw new WorkflowSpecError(filePath, `step '${stepName}' model must be a string`);
      }
    }

    // Parse gate spec if present
    let gateSpec: GateSpec | undefined;
    if (hasGate) {
      const rawGate = rawStep.gate as Record<string, unknown>;
      if (typeof rawGate !== "object" || rawGate === null || typeof rawGate.check !== "string") {
        throw new WorkflowSpecError(filePath, `step '${stepName}' gate must have a 'check' string`);
      }
      gateSpec = { check: rawGate.check as string };
      if (rawGate.onPass !== undefined) gateSpec.onPass = rawGate.onPass as "continue" | "break";
      if (rawGate.onFail !== undefined) gateSpec.onFail = rawGate.onFail as "fail" | "continue" | "break";
    }

    // Parse transform spec if present
    let transformSpec: TransformSpec | undefined;
    if (hasTransform) {
      const rawTransform = rawStep.transform as Record<string, unknown>;
      if (typeof rawTransform !== "object" || rawTransform === null || !("mapping" in rawTransform)) {
        throw new WorkflowSpecError(filePath, `step '${stepName}' transform must have a 'mapping' object`);
      }
      transformSpec = { mapping: rawTransform.mapping as Record<string, unknown> };
    }

    const step: StepSpec = {
      agent: (rawStep.agent as string) ?? (hasGate ? "gate" : hasTransform ? "transform" : "unknown"),
    };
    if (rawStep.model !== undefined) step.model = rawStep.model as string;
    if (rawStep.input !== undefined) step.input = rawStep.input as Record<string, unknown>;
    if (output !== undefined) step.output = output;
    if (rawStep.when !== undefined) step.when = rawStep.when as string;
    if (rawStep.timeout !== undefined) step.timeout = rawStep.timeout as { seconds: number };
    if (rawStep.loop !== undefined) step.loop = rawStep.loop;
    if (gateSpec !== undefined) step.gate = gateSpec;
    if (transformSpec !== undefined) step.transform = transformSpec;
    if (rawStep.workflow !== undefined) step.workflow = rawStep.workflow as string;

    steps[stepName] = step;
  }

  // Build the spec with defaults
  const spec: WorkflowSpec = {
    name: raw.name as string,
    description: typeof raw.description === "string" ? raw.description : "",
    steps,
    source,
    filePath,
  };

  if (raw.version !== undefined) spec.version = raw.version as string;
  if (raw.input !== undefined) spec.input = raw.input as Record<string, unknown>;
  if (raw.output !== undefined) spec.output = raw.output as Record<string, unknown>;

  // triggerTurn defaults to true
  if (typeof raw.triggerTurn === "boolean") {
    spec.triggerTurn = raw.triggerTurn;
  } else {
    spec.triggerTurn = true;
  }

  // completion (optional)
  if ("completion" in raw && raw.completion !== undefined) {
    if (typeof raw.completion !== "object" || raw.completion === null || Array.isArray(raw.completion)) {
      throw new WorkflowSpecError(filePath, "'completion' must be an object");
    }
    const rawComp = raw.completion as Record<string, unknown>;

    // Mutual exclusivity: template and message cannot coexist
    if ("template" in rawComp && "message" in rawComp) {
      throw new WorkflowSpecError(filePath, "'completion' cannot have both 'template' and 'message'");
    }

    // Must have at least one
    if (!("template" in rawComp) && !("message" in rawComp)) {
      throw new WorkflowSpecError(filePath, "'completion' must have either 'template' or 'message'");
    }

    const completion: CompletionSpec = {};

    if (typeof rawComp.template === "string") {
      completion.template = rawComp.template;
    } else if ("template" in rawComp) {
      throw new WorkflowSpecError(filePath, "'completion.template' must be a string");
    }

    if (typeof rawComp.message === "string") {
      completion.message = rawComp.message;
    } else if ("message" in rawComp) {
      throw new WorkflowSpecError(filePath, "'completion.message' must be a string");
    }

    if ("include" in rawComp) {
      if (!Array.isArray(rawComp.include)) {
        throw new WorkflowSpecError(filePath, "'completion.include' must be an array of strings");
      }
      for (const item of rawComp.include) {
        if (typeof item !== "string") {
          throw new WorkflowSpecError(filePath, "'completion.include' must be an array of strings");
        }
      }
      completion.include = rawComp.include as string[];
    }

    spec.completion = completion;
  }

  return spec;
}
