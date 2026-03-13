import { parse as parseYaml } from "yaml";
import type { WorkflowSpec, StepSpec, StepOutputSpec, CompletionSpec, ArtifactSpec, LoopSpec, GateSpec, TransformSpec } from "./types.ts";

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
    steps[stepName] = validateStep(stepValue, stepName, filePath);
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

  // artifacts (optional)
  if ("artifacts" in raw && raw.artifacts !== undefined) {
    if (typeof raw.artifacts !== "object" || raw.artifacts === null || Array.isArray(raw.artifacts)) {
      throw new WorkflowSpecError(filePath, "'artifacts' must be an object");
    }
    const rawArtifacts = raw.artifacts as Record<string, unknown>;
    const artifacts: Record<string, ArtifactSpec> = {};
    for (const [artName, artValue] of Object.entries(rawArtifacts)) {
      if (typeof artValue !== "object" || artValue === null || Array.isArray(artValue)) {
        throw new WorkflowSpecError(filePath, `artifact '${artName}' must be an object`);
      }
      const rawArt = artValue as Record<string, unknown>;
      if (typeof rawArt.path !== "string") {
        throw new WorkflowSpecError(filePath, `artifact '${artName}' must have a 'path' string`);
      }
      if (typeof rawArt.from !== "string") {
        throw new WorkflowSpecError(filePath, `artifact '${artName}' must have a 'from' string`);
      }
      const artifact: ArtifactSpec = {
        path: rawArt.path,
        from: rawArt.from,
      };
      if (rawArt.schema !== undefined) {
        if (typeof rawArt.schema !== "string") {
          throw new WorkflowSpecError(filePath, `artifact '${artName}' schema must be a string`);
        }
        artifact.schema = rawArt.schema;
      }
      artifacts[artName] = artifact;
    }
    spec.artifacts = artifacts;
  }

  return spec;
}

/**
 * Validate and parse a single step from raw YAML data.
 * Enforces that exactly one of agent, gate, transform, or loop is set.
 * Rejects steps with `workflow` (not yet supported).
 * Recursively validates sub-steps within loops.
 */
function validateStep(stepValue: unknown, stepName: string, filePath: string): StepSpec {
  if (typeof stepValue !== "object" || stepValue === null || Array.isArray(stepValue)) {
    throw new WorkflowSpecError(filePath, `step '${stepName}' must be an object`);
  }
  const rawStep = stepValue as Record<string, unknown>;

  // Reject workflow (not yet supported)
  if ("workflow" in rawStep && rawStep.workflow !== undefined) {
    throw new WorkflowSpecError(filePath, `step '${stepName}': nested workflows ('workflow') are not yet supported`);
  }

  // Count step types
  const hasAgent = "agent" in rawStep && rawStep.agent !== undefined;
  const hasGate = "gate" in rawStep && rawStep.gate !== undefined;
  const hasTransform = "transform" in rawStep && rawStep.transform !== undefined;
  const hasLoop = "loop" in rawStep && rawStep.loop !== undefined;

  const typeCount = [hasAgent, hasGate, hasTransform, hasLoop].filter(Boolean).length;

  if (typeCount === 0) {
    throw new WorkflowSpecError(filePath, `step '${stepName}' must have exactly one of: agent, gate, transform, or loop`);
  }
  if (typeCount > 1) {
    throw new WorkflowSpecError(filePath, `step '${stepName}' must have exactly one of: agent, gate, transform, or loop`);
  }

  const step: StepSpec = {};

  // Common optional fields
  if (rawStep.when !== undefined) step.when = rawStep.when as string;
  if (rawStep.timeout !== undefined) step.timeout = rawStep.timeout as { seconds: number };

  // Agent step
  if (hasAgent) {
    if (typeof rawStep.agent !== "string") {
      throw new WorkflowSpecError(filePath, `step '${stepName}' agent must be a string`);
    }
    step.agent = rawStep.agent;

    // model must be a string if present
    if ("model" in rawStep && rawStep.model !== undefined) {
      if (typeof rawStep.model !== "string") {
        throw new WorkflowSpecError(filePath, `step '${stepName}' model must be a string`);
      }
      step.model = rawStep.model;
    }

    // input must be an object if present
    if ("input" in rawStep && rawStep.input !== undefined) {
      if (typeof rawStep.input !== "object" || rawStep.input === null || Array.isArray(rawStep.input)) {
        throw new WorkflowSpecError(filePath, `step '${stepName}' input must be an object`);
      }
      step.input = rawStep.input as Record<string, unknown>;
    }

    // output must be an object if present
    if ("output" in rawStep && rawStep.output !== undefined) {
      if (typeof rawStep.output !== "object" || rawStep.output === null || Array.isArray(rawStep.output)) {
        throw new WorkflowSpecError(filePath, `step '${stepName}' output must be an object`);
      }
      const rawOutput = rawStep.output as Record<string, unknown>;
      const output: StepOutputSpec = {};
      if ("format" in rawOutput) {
        output.format = rawOutput.format as StepOutputSpec["format"];
      }
      if ("schema" in rawOutput) {
        if (typeof rawOutput.schema !== "string") {
          throw new WorkflowSpecError(filePath, `step '${stepName}' output.schema must be a string`);
        }
        output.schema = rawOutput.schema;
      }
      step.output = output;
    }
  }

  // Gate step
  if (hasGate) {
    if (typeof rawStep.gate !== "object" || rawStep.gate === null || Array.isArray(rawStep.gate)) {
      throw new WorkflowSpecError(filePath, `step '${stepName}' gate must be an object`);
    }
    const rawGate = rawStep.gate as Record<string, unknown>;
    if (typeof rawGate.check !== "string") {
      throw new WorkflowSpecError(filePath, `step '${stepName}' gate must have a 'check' string`);
    }
    const gate: GateSpec = { check: rawGate.check };
    if (rawGate.onPass !== undefined) gate.onPass = rawGate.onPass as GateSpec["onPass"];
    if (rawGate.onFail !== undefined) gate.onFail = rawGate.onFail as GateSpec["onFail"];
    step.gate = gate;
  }

  // Transform step
  if (hasTransform) {
    if (typeof rawStep.transform !== "object" || rawStep.transform === null || Array.isArray(rawStep.transform)) {
      throw new WorkflowSpecError(filePath, `step '${stepName}' transform must be an object`);
    }
    const rawTransform = rawStep.transform as Record<string, unknown>;
    if (typeof rawTransform.mapping !== "object" || rawTransform.mapping === null || Array.isArray(rawTransform.mapping)) {
      throw new WorkflowSpecError(filePath, `step '${stepName}' transform must have a 'mapping' object`);
    }
    step.transform = { mapping: rawTransform.mapping as Record<string, unknown> };
  }

  // Loop step
  if (hasLoop) {
    if (typeof rawStep.loop !== "object" || rawStep.loop === null || Array.isArray(rawStep.loop)) {
      throw new WorkflowSpecError(filePath, `step '${stepName}' loop must be an object`);
    }
    const rawLoop = rawStep.loop as Record<string, unknown>;

    // Must have maxAttempts (number) or attempts (string expression)
    const hasMaxAttempts = "maxAttempts" in rawLoop && typeof rawLoop.maxAttempts === "number";
    const hasAttempts = "attempts" in rawLoop && typeof rawLoop.attempts === "string";
    if (!hasMaxAttempts && !hasAttempts) {
      throw new WorkflowSpecError(filePath, `step '${stepName}' loop must have 'maxAttempts' (number) or 'attempts' (expression)`);
    }

    // Must have non-empty steps
    if (!("steps" in rawLoop) || typeof rawLoop.steps !== "object" || rawLoop.steps === null || Array.isArray(rawLoop.steps)) {
      throw new WorkflowSpecError(filePath, `step '${stepName}' loop must have a non-empty 'steps' object`);
    }
    const rawLoopSteps = rawLoop.steps as Record<string, unknown>;
    if (Object.keys(rawLoopSteps).length === 0) {
      throw new WorkflowSpecError(filePath, `step '${stepName}' loop must have a non-empty 'steps' object`);
    }

    // Recursively validate sub-steps
    const loopSteps: Record<string, StepSpec> = {};
    for (const [subName, subValue] of Object.entries(rawLoopSteps)) {
      loopSteps[subName] = validateStep(subValue, `${stepName}.loop.${subName}`, filePath);
    }

    const loop: LoopSpec = {
      maxAttempts: hasMaxAttempts ? rawLoop.maxAttempts as number : 0,
      steps: loopSteps,
    };
    if (hasAttempts) loop.attempts = rawLoop.attempts as string;
    if (hasMaxAttempts) loop.maxAttempts = rawLoop.maxAttempts as number;

    // onExhausted is an optional step
    if ("onExhausted" in rawLoop && rawLoop.onExhausted !== undefined) {
      loop.onExhausted = validateStep(rawLoop.onExhausted, `${stepName}.loop.onExhausted`, filePath);
    }

    step.loop = loop;
  }

  return step;
}
