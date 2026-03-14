// ── Workflow Spec (parsed from YAML) ──

export interface WorkflowSpec {
  name: string;
  description: string;
  version?: string;
  input?: Record<string, unknown>;       // JSON Schema object
  output?: Record<string, unknown>;      // JSON Schema object
  triggerTurn?: boolean;                  // default: true
  completion?: CompletionSpec;           // controls post-completion message to main LLM
  steps: Record<string, StepSpec>;       // ordered (YAML preserves insertion order)
  artifacts?: Record<string, ArtifactSpec>; // persistent files written after workflow completion
  // Set by discovery, not by YAML:
  source: "user" | "project";
  filePath: string;
}

export interface ArtifactSpec {
  path: string;                          // destination path, may contain ${{ }} expressions
  from: string;                          // ${{ }} expression for the data source
  schema?: string;                       // optional JSON Schema to validate before writing
}

export interface StepSpec {
  agent?: string;                        // optional — not needed for gate/transform steps
  model?: string;                        // model override
  input?: Record<string, unknown>;       // values may contain ${{ }} expressions
  output?: StepOutputSpec;
  when?: string;                         // ${{ }} expression, evaluated as truthy/falsy
  timeout?: { seconds: number };
  loop?: LoopSpec;
  gate?: GateSpec;
  transform?: TransformSpec;
  parallel?: Record<string, StepSpec>;   // named sub-steps to run concurrently
  pause?: string | boolean;              // pause step — string is message to display, true = pause with no message
  command?: string;                      // shell command to run (captures stdout as output)
  forEach?: string;                      // ${{ }} expression resolving to an array
  as?: string;                           // variable name to bind each element (default: "item")
  workflow?: string;                     // phase 6 — not yet supported
}
// Note: exactly one of agent, gate, transform, loop, or parallel must be set.
// workflow is phase 6.

export interface LoopSpec {
  maxAttempts: number;                   // max iterations (required)
  attempts?: string;                     // ${{ }} expression overriding maxAttempts at runtime
  steps: Record<string, StepSpec>;       // steps to execute each iteration
  onExhausted?: StepSpec;               // step to run if all attempts fail
}

export interface GateSpec {
  check: string;                         // shell command to run
  onPass?: "continue" | "break";         // default: "continue" (proceed to next step)
  onFail?: "continue" | "break" | "fail"; // default: "fail" (stop the workflow)
}

export interface TransformSpec {
  /**
   * A mapping of output field names to ${{ }} expressions.
   * The result is an object with each field resolved.
   * No LLM invocation — pure data transformation.
   */
  mapping: Record<string, unknown>;
}

export interface StepOutputSpec {
  format?: "json" | "text";              // default: "text"
  schema?: string;                       // path to JSON Schema file, relative to workflow spec
  path?: string;                         // output file path — may contain ${{ }} expressions
}

// ── Agent Spec (loaded from .md frontmatter or .agent.yaml) ──

export interface AgentSpec {
  name: string;
  description?: string;
  role?: string;                         // sensor | reasoning | action | quality
  systemPrompt?: string;                 // compiled system prompt (from template rendering)
  promptTemplate?: string;               // system prompt template path
  taskTemplate?: string;                 // task prompt template path
  model?: string;
  thinking?: string;
  tools?: string[];
  extensions?: string[];
  skills?: string[];
  output?: string;                       // output file path
  inputSchema?: Record<string, unknown>; // JSON Schema for input
  outputFormat?: "json" | "text";        // what the agent produces
  outputSchema?: string;                 // path to output JSON Schema
}

// ── Execution State ──

export interface ExecutionState {
  input: unknown;
  steps: Record<string, StepResult>;
  status: "running" | "completed" | "failed" | "paused";
  loop?: LoopState;                      // set when inside a loop
  // Resume support:
  workflowName?: string;       // which workflow this run belongs to
  specVersion?: string;        // workflow spec version at time of run
  startedAt?: string;          // ISO timestamp of run start
  updatedAt?: string;          // ISO timestamp of last state write
}

export interface LoopState {
  stepName: string;                      // name of the loop step
  iteration: number;                     // current iteration (0-based)
  maxAttempts: number;
  priorAttempts: LoopAttempt[];          // results from previous iterations
}

export interface LoopAttempt {
  iteration: number;
  steps: Record<string, StepResult>;     // results of all steps in this iteration
}

export interface StepResult {
  step: string;
  agent: string;
  status: "completed" | "failed" | "skipped";
  output?: unknown;                      // parsed structured output (if schema-bound)
  textOutput?: string;                   // raw text from last assistant message
  outputPath?: string;                   // absolute path to persisted output JSON
  sessionLog?: string;                   // path to session log file
  usage: StepUsage;
  durationMs: number;
  error?: string;                        // error message if failed
}

export interface StepUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  turns: number;
}

// ── Workflow Result (returned to caller) ──

export interface WorkflowResult {
  workflow: string;
  runId: string;
  status: "completed" | "failed" | "paused";
  steps: Record<string, StepResult>;
  output?: unknown;                      // final workflow output (last step's output, or explicit)
  totalUsage: StepUsage;
  totalDurationMs: number;
  runDir: string;                        // absolute path to .pi/workflow-runs/<name>/runs/<run-id>/
  artifacts?: Record<string, string>;    // name → absolute path of written artifact files
}

// ── Completion Spec ──

export interface CompletionSpec {
  message?: string;                      // LLM instruction text (may contain ${{ }} expressions)
  include?: string[];                    // expression paths to resolve and attach as data
  template?: string;                     // full template with ${{ }} (mutually exclusive with message)
}

// ── Expression Scope (what ${{ }} expressions resolve against) ──

export interface ExpressionScope {
  input: unknown;
  steps: Record<string, StepResult>;
  [key: string]: unknown;  // allows use as Record<string, unknown>
}

// ── Completion Scope (wider scope for completion templates) ──

export interface CompletionScope {
  input: unknown;
  steps: Record<string, StepResult>;
  totalUsage: StepUsage;
  totalDurationMs: number;
  runDir: string;
  runId: string;
  workflow: string;
  status: "completed" | "failed";
  output?: unknown;
  [key: string]: unknown;  // allows use as Record<string, unknown>
}
