2026-6-05 Extracting all agent concerns from pi-workflows:

---

## Target Architecture

```
┌─────────────────────────────────────────────┐
│  pi-workflows  (pure orchestration)         │
│  ┌───────────────────────────────────────┐  │
│  │ Workflow spec parsing, DAG planning,  │  │
│  │ expression engine, state persistence, │  │
│  │ checkpoint/resume, step dispatch      │  │
│  │ (gate, transform, block, command,     │  │
│  │  pause, loop, parallel, foreach)      │  │
│  └──────────────┬────────────────────────┘  │
│                 │ imports                    │
│                 ▼                            │
│  ┌───────────────────────────────────────┐  │
│  │ Agent step: thin delegate to          │  │
│  │ pi-jit-agents' executeAgentStep()     │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  pi-jit-agents  (agent lifecycle)           │
│  ┌───────────────────────────────────────┐  │
│  │ Agent spec parsing + discovery        │  │
│  │ Template compilation (compileAgent)   │  │
│  │ Template rendering + env              │  │
│  │ Template validation                   │  │
│  │ Prompt building                       │  │
│  │ Subprocess dispatch (pi --mode json)  │  │
│  │ In-process dispatch (executeAgent)    │  │
│  │ Agent step executor                   │  │
│  │ Renderer registry + macros            │  │
│  │ Budget enforcement                    │  │
│  │ All agent templates (templates/)      │  │
│  │ Monitor classification dispatch       │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

---

## Phase 1: Unify Agent Spec Parsing & Discovery → pi-jit-agents

**Move:** `pi-workflows/dist/agent-spec.js` → `pi-jit-agents/src/agent-spec.ts`

**Why first:** Two `parseAgentYaml` implementations exist. pi-workflows' version maps YAML fields to a legacy `AgentSpec` shape (`promptTemplate`, `taskTemplate` as rendered strings). pi-jit-agents' version maps to absolute paths (`systemPromptTemplate`, `taskPromptTemplate`). The unified parser must:

- Produce the pi-jit-agents `AgentSpec` type (with `ContextBlockRef` support)
- Resolve all paths to absolute at parse time (pi-jit-agents contract)
- Handle both YAML prompt forms: `prompt.system: "inline text"` and `prompt.system: {template: "path.md"}`
- pi-workflows deletes its `agent-spec.js` and imports `createAgentLoader` / `parseAgentYaml` from pi-jit-agents

**Why this unblocks everything:** Every consumer of agent specs (workflow validation, template compilation, dispatch) gets a single source of truth with the richer type.

---

## Phase 2: Merge Template Compilation → pi-jit-agents

**Move:** `pi-workflows/dist/step-shared.js` `compileAgentSpec` → merges into `pi-jit-agents/src/compile.ts` `compileAgent`

**Why second:** The two `compileAgent*` functions must become one. The unified `compileAgent` needs to absorb the legacy path's behavior that the modern path doesn't cover:

| Legacy behavior | How to absorb |
|---|---|
| `contextBlocks` as `string[]` | Already handled by `compileAgent` (string entries → whole-block injection) |
| `promptTemplate` → rendered system prompt | Map to `systemPromptTemplate` in unified spec; compileAgent already handles this |
| `taskTemplate` → rendered task prompt | Map to `taskPromptTemplate`; compileAgent already handles this |
| `${{ }}` protection in `renderTemplate` | `compileAgent` templates don't contain `${{ }}`. If they ever do, add the escape/restore wrapper in `compileAgent`'s render path |
| Missing block → null | Already handled (string entries → null on absent substrate) |
| No `templateEnv` → pass-through | compileAgent requires an env. Caller must provide one |

**pi-workflows deletes:** `compileAgentSpec`, its own `renderTemplate`/`renderTemplateFile` (import from pi-jit-agents).

---

## Phase 3: Move Template Infrastructure → pi-jit-agents

**Move:**
- `pi-workflows/dist/template.js` (`createTemplateEnv`, `renderTemplate`, `renderTemplateFile`) → `pi-jit-agents/src/template.ts`
- `pi-workflows/dist/template-validation.js` → `pi-jit-agents/src/template-validation.ts`

**Why third:** Template rendering and validation are agent concerns — they validate and render agent prompts. pi-workflows' `createTemplateEnv` and pi-jit-agents' are nearly identical (same three-tier search) but pi-workflows adds `${{ }}` protection. Unify into one implementation in pi-jit-agents. The `${{ }}` protection can be an option on `renderTemplate` (`protectWorkflowExpressions?: boolean`).

**pi-workflows deletes:** `template.js`, `template-validation.js`. Imports from pi-jit-agents.

---

## Phase 4: Move Prompt Building → pi-jit-agents

**Move:** `pi-workflows/dist/step-shared.js` `buildPrompt` + `resolveSchemaPath` → `pi-jit-agents/src/prompt.ts`

**Why fourth:** `buildPrompt` constructs the final prompt string from compiled templates, output schema instructions, and output path directives. This is agent dispatch concern, not workflow orchestration. `resolveSchemaPath` handles `block:<name>` resolution — already present in pi-jit-agents' `compile.ts` (`resolveOutputSchemaForCompile`). Unify.

**pi-workflows deletes:** `buildPrompt`, `resolveSchemaPath` from `step-shared.js`.

---

## Phase 5: Move Subprocess Dispatch → pi-jit-agents

**Move:** `pi-workflows/dist/dispatch.js` → `pi-jit-agents/src/dispatch-subprocess.ts`

**Why fifth:** `dispatch()` spawns `pi --mode json`, streams stdout JSON events, collects usage, handles timeouts and cancellation. This is the "how to execute a compiled agent" concern. pi-jit-agents already has `executeAgent` for in-process dispatch. Adding a subprocess variant gives:

```typescript
// pi-jit-agents
executeAgent(compiled, dispatch)           // in-process
executeAgentSubprocess(compiled, options)  // subprocess (moved from pi-workflows)
```

Both return `JitAgentResult`. The workflow executor chooses which dispatch strategy to use.

**pi-workflows deletes:** `dispatch.js`. Imports `executeAgentSubprocess` from pi-jit-agents.

---

## Phase 6: Move Agent Step Executor → pi-jit-agents

**Move:** `pi-workflows/dist/step-agent.js` → `pi-jit-agents/src/step-agent.ts`

**Why sixth:** `executeAgentStep` orchestrates: resolve input expressions → load agent spec → validate input against schema → inject output_schema → compile templates → add context/retry context → dispatch → validate output → persist. This is the agent execution lifecycle. pi-workflows should call a single function:

```typescript
// pi-workflows step-agent.js becomes a thin delegate:
import { executeAgentStep } from "@davidorex/pi-jit-agents";

export async function executeAgentStep(stepName, stepSpec, state, options) {
  return executeAgentStep(stepName, stepSpec, state, options);
}
```

Or better, pi-workflows calls `executeAgentStep` directly without a wrapper file.

The function needs: expression scope (from pi-workflows), step spec, state, and dispatch options. These are data, not pi-workflows internals. The return is a `StepResult` — this type should move to a shared types package or be defined in both packages with a compatibility contract.

**pi-workflows deletes:** `step-agent.js` (or reduces to a re-export).

---

## Phase 7: Move Monitor Step → pi-jit-agents (or pi-behavior-monitors)

**Move:** `pi-workflows/dist/step-monitor.js` → `pi-jit-agents/src/step-monitor.ts`

**Why seventh:** Monitor classification is agent dispatch with a verdict-shaped output. It has its own spec discovery, template rendering, and LLM dispatch — entirely separate from the workflow agent pipeline. Moving it to pi-jit-agents gives it access to the unified template env, budget enforcement, and `executeAgent`. Alternatively, move to pi-behavior-monitors since that package owns the monitor spec format and pattern library.

**pi-workflows deletes:** `step-monitor.js`. Imports `executeMonitor` from pi-jit-agents or pi-behavior-monitors.

---

## Phase 8: Clean Up pi-workflows Types

**Remove from `pi-workflows/dist/types.d.ts`:**
- `AgentSpec` — now imported from pi-jit-agents
- `JitAgentAuth`, `DispatchContext` — now in pi-jit-agents

**Keep in pi-workflows:**
- `WorkflowSpec`, `StepSpec`, all step sub-types (`GateSpec`, `TransformSpec`, `BlockSpec`, etc.)
- `ExecutionState`, `StepResult`, `StepUsage`
- `WorkflowContext`, `WorkflowPI`
- `ExpressionScope`, `CompletionScope`
- `RetryConfig`

**Add to pi-workflows:** Import of `AgentSpec` from pi-jit-agents for use in validation and SDK.

---

## What pi-workflows Looks Like After

```
pi-workflows/dist/
  index.js                  — extension entry point (tools, commands, keybindings)
  workflow-executor.js      — main orchestration loop
  workflow-spec.js          — YAML parsing for workflows, STEP_TYPES registry
  workflow-discovery.js     — workflow spec discovery
  workflow-sdk.js           — SDK vocabulary, validation
  expression.js             — ${{ }} evaluator, filters
  dag.js                    — dependency graph
  state.js                  — run state persistence
  checkpoint.js             — checkpoint/resume
  completion.js             — completion message resolution
  output.js                 — step output persistence
  step-block.js             — block I/O step
  step-command.js           — shell command step
  step-gate.js              — gate step
  step-transform.js         — transform step
  step-pause.js             — pause step
  step-loop.js              — loop orchestration (agent dispatch delegates)
  step-parallel.js          — parallel orchestration
  step-foreach.js           — foreach orchestration
  format.js                 — formatting utilities
  tui.js                    — progress widget
  workflows-dir.js          — .workflows constant
  bundled-dirs.js           — package directory resolution
  types.d.ts                — workflow-only types

DELETED:
  agent-spec.js             → pi-jit-agents
  dispatch.js               → pi-jit-agents
  step-agent.js             → pi-jit-agents
  step-monitor.js           → pi-jit-agents or pi-behavior-monitors
  template.js               → pi-jit-agents
  template-validation.js    → pi-jit-agents
  render-by-id.js           → pi-jit-agents
  step-shared.js            → dissolved (pieces to pi-jit-agents)
  test-helpers.js           → pi-jit-agents

IMPORTS from pi-jit-agents:
  createAgentLoader, AgentSpec, AgentNotFoundError
  compileAgent, CompiledAgent
  executeAgent, executeAgentSubprocess
  executeAgentStep
  executeMonitor
  createTemplateEnv
  renderItemById, enforceBudget
```

---

## Dependency Graph After

```
pi-context
  ↑
pi-jit-agents     ← owns: agent spec, compilation, templates, dispatch, monitoring
  ↑
pi-workflows      ← owns: workflow orchestration, step types, expressions, state
```

pi-workflows imports from both but owns no agent logic. pi-jit-agents imports from pi-context (for block reads, schemas, idIndex, budget enforcement). Clean unidirectional dependency.

---

## Rationale for Order

| Phase | Rationale |
|---|---|
| 1. Unify agent spec | Foundation — every subsequent phase depends on a single AgentSpec type |
| 2. Merge compilation | The critical convergence point. Without this, two paths persist |
| 3. Template infra | Templates are agent prompts. Must live where compilation lives |
| 4. Prompt building | Naturally follows compilation — post-compile prompt assembly |
| 5. Subprocess dispatch | Bridges compiled output → execution. Must live where execution lives |
| 6. Agent step executor | Orchestrates 1–5. Moves after its dependencies are relocated |
| 7. Monitor step | Independent agent dispatch path. Moves after main path is stable |
| 8. Type cleanup | Mechanical removal of now-external types. Last — no behavioral changes |