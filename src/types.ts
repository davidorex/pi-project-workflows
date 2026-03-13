// ── Workflow Spec (parsed from YAML) ──

export interface WorkflowSpec {
  name: string;
  description: string;
  version?: string;
  input?: Record<string, unknown>;       // JSON Schema object
  output?: Record<string, unknown>;      // JSON Schema object
  triggerTurn?: boolean;                  // default: true
  steps: Record<string, StepSpec>;       // ordered (YAML preserves insertion order)
  // Set by discovery, not by YAML:
  source: "user" | "project";
  filePath: string;
}

export interface StepSpec {
  agent: string;                         // agent name (required in phase 1)
  model?: string;                        // model override
  input?: Record<string, unknown>;       // values may contain ${{ }} expressions
  output?: StepOutputSpec;
  // Phase 2+:
  when?: string;
  timeout?: { seconds: number };
  loop?: unknown;
  gate?: unknown;
  transform?: unknown;
  workflow?: string;
}

export interface StepOutputSpec {
  format?: "json" | "text";              // default: "text"
  schema?: string;                       // path to JSON Schema file, relative to workflow spec
}

// ── Agent Spec (loaded from .md frontmatter or .agent.yaml) ──

export interface AgentSpec {
  name: string;
  description?: string;
  systemPrompt?: string;
  model?: string;
  thinking?: string;
  tools?: string[];
  extensions?: string[];
  skills?: string[];
  output?: string;                       // output file path
}

// ── Execution State ──

export interface ExecutionState {
  input: unknown;
  steps: Record<string, StepResult>;
  status: "running" | "completed" | "failed";
}

export interface StepResult {
  step: string;
  agent: string;
  status: "completed" | "failed" | "skipped";
  output?: unknown;                      // parsed structured output (if schema-bound)
  textOutput?: string;                   // raw text from last assistant message
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
  status: "completed" | "failed";
  steps: Record<string, StepResult>;
  output?: unknown;                      // final workflow output (last step's output, or explicit)
  totalUsage: StepUsage;
  totalDurationMs: number;
  runDir: string;                        // absolute path to .pi/workflow-runs/<run-id>/
}

// ── Expression Scope (what ${{ }} expressions resolve against) ──

export interface ExpressionScope {
  input: unknown;
  steps: Record<string, StepResult>;
}
