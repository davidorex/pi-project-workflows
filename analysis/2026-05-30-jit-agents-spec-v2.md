# pi-jit-agents — Specification v2

**Status:** Living draft. Canonical specification for the `@davidorex/pi-jit-agents` package.
**Supersedes:** v1 at `docs/planning/jit-agents-spec.md` (gitignored archaeological reference; pre-canonical-body-alignment framing). Migration of v1's substance into v2 reflects the canonical body declared across FEAT-005, FEAT-006, DEC-0047, TASK-091, and JI-029 — which v1 contradicted by hedging dispatch to phantom-tool-only.
**Companion substrate work:** decomposition + lens-projection of this spec into substrate items happens in a per-arc substrate (`.context-jit-spec-v2`). This markdown is the persistent shape of v2 content while the substrate decomposition lands.

---

## 0. Foundational Principles

These principles ground every decision in this document. Carried forward from v1 unchanged — they remain canonical.

### P1 — One concept of "agent"

An **agent** is a single, uniform concept. It is a named callable unit with typed inputs, typed outputs, context-parametric implementation, **and capability-granted tool execution when declared**. There is no distinction between "a monitor agent" and "a workflow agent" and "a privileged agent" at the framework level. The same spec format, the same compilation pipeline, the same dispatch runtime, and the same output-validation contract apply to every agent regardless of which consumer invokes it or for what purpose.

Consumers may *use* agents differently — pi-workflows dispatches them as DAG steps, pi-behavior-monitors invokes them as classifiers, pi-agent-dispatch invokes them as agents-as-tools with capability grants — but the agent itself is the same kind of thing.

### P2 — Existing agents are disposable development artifacts

All 31 agent specs currently in the codebase carry fossilized assumptions from the archaeological strata where they were authored. None are durable assets. If the framework is correct, every single one can be recreated on top of the generalized framework. Replacing them, deleting them, or starting over is permissible.

### P3 — Framework correctness implies agent recreatability

The test of whether the framework is built correctly: **can any agent be written against it purely by authoring a `.agent.yaml` file, a template, optionally an output schema, and a capability declaration — with no framework code changes?**

If a new agent requires touching framework code, the framework is insufficiently generalized.

---

## 1. Purpose

`@davidorex/pi-jit-agents` is the package that owns everything between "I have a spec" and "I have a typed result, OR a completed tool-execution sequence with a final result."

JIT agents are **named callable units with typed input contracts, typed output contracts, context-parametric implementations materialized at runtime from project state, and capability-granted tool-execution capability when the spec declares non-empty `tools[]` and the dispatch carries a parent grant covering them.**

The package provides the resolution, compilation, and dispatch runtime for agent specs authored as `.agent.yaml` files. Consumer packages (pi-workflows, pi-behavior-monitors, pi-agent-dispatch) invoke JIT agents.

---

## 2. Boundary Contract

The jit-agents boundary is a function composition:

```
spec name + invocation context → compiled spec → execution (mode-selected) → typed result OR final-assistant-message
```

Consumers interact with jit-agents through four surfaces (D1: specs leave the boundary fully resolved):

1. **Loading**: `loadAgent(name, loaderContext) → AgentSpec` — resolves the spec from the appropriate tier; fully resolves all relative paths within the spec; returns a self-contained spec with no unresolved references.
2. **Compilation**: `compileAgent(spec, invocationContext) → CompiledAgent` — renders templates with the invocation context, produces the final prompt, resolves `contextBlocks`, returns a compiled agent ready to execute.
3. **Execution**: `executeAgent(compiled, dispatchContext) → TypedResult | FinalAssistantMessage` — dispatches the compiled agent via the mode selected from spec shape (see §4 D9); validates output against the declared schema (classifier-mode) or returns the final assistant message after multi-turn tool-execution loop completion (agentic-mode); returns a typed result.
4. **Introspection**: `agentContract(name) → AgentContract` — exposes the spec's input schema, context requirements, capability declaration, and output schema for validation and discovery, without executing anything.

**Key invariant:** Once an `AgentSpec` leaves the jit-agents boundary, every path it references is absolute. Consumers never resolve relative paths themselves.

---

## 2a. Agent signature

The canonical signature reflects the full agent contract including capability-granted tool execution:

```
agent :: (
  input matching inputSchema,
  context matching contextBlocks,
  capabilities matching the intersection of declared tools[] and parent_grant
) → output matching outputSchema (classifier-mode)
  OR final-assistant-message after multi-turn tool-execution loop completion (agentic-mode)
```

The `.agent.yaml` spec declares:
- **Input contract** (`inputSchema`) — validated pre-spawn
- **Context parameterization** (`contextBlocks` — block names injected into the template environment at dispatch time)
- **Capability declaration** (`tools[]` — operations the agent intends to invoke; clamped to parent_grant at dispatch boundary per DEC-0047)
- **Output contract** (`output.format` and `output.schema`)
- **Prompt composition** (system and task templates rendered with Nunjucks)
- **Model + thinking** (model spec resolved against ExtensionContext per DEC-0001; thinking enforcement per DEC-0002)

Given a name, the framework compiles the spec into a concrete prompt by rendering its templates against the supplied input and resolved context blocks, then dispatches per the mode-selection algorithm (§4 D9), then returns either a schema-validated typed result (classifier-mode) or the final assistant message after the multi-turn tool-execution loop terminates (agentic-mode).

---

## 2b. Use sites

### In workflows

A workflow is a DAG of steps. An agent step is a node that:
- Receives its input from `${{ steps.X }}` expressions or workflow-level inputs
- Invokes a named agent (typically agentic-mode when the agent declares tools for in-step work, classifier-mode when the step needs schema-bound structured output)
- Produces an output that other steps can reference

The workflow supplies the input and consumes the output. The agent is the transformation between them.

### In monitors

A monitor is a classifier over collected context. It watches agent conversation activity, collects signals, periodically needs to answer: *is the current activity CLEAN, FLAG, or NEW?*

Answering is an agent invocation in classifier-mode (forced phantom-tool toolChoice on the verdict schema). The monitor supplies the input — a structured bundle of collected signals + patterns + instructions. The agent produces a verdict-shaped output validated against the verdict schema. The monitor consumes the verdict and decides what to do next.

### In agent-as-tool dispatch (pi-agent-dispatch)

A privileged agent invocation is a dispatch carrying a parent_grant + requested_grant. The agent's declared `tools[]` is clamped to the intersection of declared + parent_grant. The dispatch runs in agentic-mode: granted tools are wired into the LLM tool registry; the LLM may emit tool calls which the dispatch executes via ExtensionContext; results thread into message history; the loop continues until end_turn or max-turns. The agent acts on the granted capabilities — this is the operator-direction-driven privileged-agent work loop (FEAT-006 north-star).

### The uniformity (clarified)

The same spec format describes every agent regardless of consumer. The same compilation pipeline produces the same prompt structure. The dispatch runtime selects ONE OF TWO MODES per spec shape (D9). The output validator checks the mode-appropriate result. The typed result is returned.

What differs between use sites is strictly *who supplies the input, who consumes the output, and which mode the spec shape selects*. None of this is a framework concern — it is a consumer concern.

---

## 3. Scope

### What jit-agents OWNS

- **Agent spec parsing** — YAML → typed `AgentSpec`
- **Spec resolution** — tier-aware discovery, relative-to-absolute path resolution
- **Template compilation** — Nunjucks environment construction, prompt template rendering, shared macro library, contextBlocks injection with anti-injection framework-level wrapping
- **Prompt building** — composing system prompt, task prompt, output instructions
- **Mode selection** — per D9 algorithm; spec shape determines classifier-mode vs agentic-mode
- **Classifier-mode in-process dispatch** — `executeAgent` with phantom-tool forced toolChoice for structured-output enforcement (existing implementation; monitor use case)
- **Agentic-mode in-process dispatch** — `executeAgent` with multi-tool dispatch loop: wire `compiled.tools` (intersected with `dispatch.parentGrant`) into the LLM tool registry; iterate over tool-call responses; dispatch tool invocations through ExtensionContext; thread tool results into message history; loop termination on end_turn / max-turns / tool-failure
- **Capability-grant enforcement** — DEC-0047 clamp at executeAgent boundary; granted capabilities exercised at agentic-mode dispatch (not discarded post-clamp as v1 implementation did)
- **Phantom tool construction** — building forced-tool-use shapes from output schemas (classifier-mode only)
- **Output validation** — parsing + validating LLM responses against declared output schemas (classifier-mode); structuring final-assistant-message returns (agentic-mode)
- **Agent contract introspection** — SDK queries about inputSchema, contextBlocks, capabilities, outputFormat, outputSchema
- **Model resolution** — bare model ids resolved against ExtensionContext currentModel/currentProvider per DEC-0001; fully-qualified provider/modelId specs pin the provider regardless of session (interlock with FGAP-115 ExtensionContext-currentModel-absence)

### What jit-agents DOES NOT own

- **Subprocess dispatch** (`pi --mode json`) — stays in pi-workflows (workflow-specific orchestration)
- **Workflow orchestration** — DAG planning, step execution, state persistence, checkpoint/resume
- **Monitor orchestration** — classification event routing, steering, activation, pattern learning
- **Project block CRUD** — owned by pi-context; jit-agents consumes pi-context's `readBlock()` API for contextBlocks injection
- **Domain specs** — workflow YAMLs and monitor JSONs stay in their consumer packages

---

## 4. Key Decisions

### [DECIDED] D1: Specs leave jit-agents fully resolved

`AgentSpec` returned by `loadAgent()` has all path fields resolved to absolute paths. Consumers never see relative paths.

**Rationale:** Relative paths require consumers to know the directory context the spec was loaded from. That context belongs inside the jit-agents boundary. Leaking relative paths forces every consumer to reimplement resolution logic with mismatched assumptions.

### [DECIDED] D2: The framework package contains only framework

The `@davidorex/pi-jit-agents` package contains only framework code: `agent-spec.ts`, `template.ts`, `compile.ts`, `jit-runtime.ts`, `types.ts`, and any schemas that are part of the framework contract itself.

**Rationale:** The runtime is generic; the domain lives in specs users author. Existing development-era specs are disposable per P2.

### [DECIDED] D3: jit-agents does not read `.pi/`

The runtime does not read from `.pi/agents/`, `.pi/templates/`, or `.pi/monitors/`. User overrides for agents are provided by `.project/agents/` (or whatever the substrate-resolved path is per `resolveContextDir`) + `~/.pi/agent/agents/` user-global + package-builtin tiers per the 3-tier discovery (D7).

### [DECIDED] D4: `executeAgent` is a dual-mode in-process dispatch primitive

The `executeAgent` function supports TWO dispatch modes selected from spec shape per the algorithm in D9:

- **Classifier-mode:** triggered when `outputSchema` is set. Forced phantom-tool toolChoice constrains output to structured payload. Single LLM call. Output extracted and validated against `outputSchema`. Returns typed result. Used by monitors for verdict-shaped output and by workflow steps requiring structured output.

- **Agentic-mode:** triggered when `tools[]` is non-empty and `outputSchema` is absent (or both set per D9 precedence). Declared `tools[]` (intersected with `dispatch.parentGrant` per DEC-0047 clamp) becomes the LLM's tool registry. Multi-turn dispatch loop: LLM emits response; if tool calls present, executeAgent dispatches each through ExtensionContext, threads results into message history, calls LLM again with enriched history; repeats until end_turn or max-turns. Returns the final assistant message. Used by privileged-agent dispatch (pi-agent-dispatch + FEAT-006 north-star + JI-029).

Both modes share: spec loading, template compilation, contextBlocks injection, model resolution, attestation, tracing. They differ only in dispatch surface (single-call + phantom-tool vs multi-turn + declared-tools).

**Replaces v1's D4** (which framed `executeAgent` as phantom-tool-only single-turn). v1's framing was the implementation-default that hedged on FEAT-005/006/DEC-0047/TASK-091/JI-029's commitments.

### [DECIDED] D5: Subprocess dispatch stays in pi-workflows

`pi --mode json` subprocess invocation is workflow orchestration, not agent infrastructure. pi-workflows' `dispatch.ts` does not move to jit-agents.

### [DECIDED] D6: `step-monitor.ts` becomes a thin wrapper over jit-agents + monitor discovery

The monitor classify pathway delegates to `executeAgent` (in classifier-mode) for the LLM call + phantom tool + result extraction. Monitor-specific logic (which collectors to run, how to assemble the input, how to interpret the verdict) stays in pi-behavior-monitors.

### [DECIDED] D7: Agent discovery tier structure

Three-tier search, first match wins:
```
<resolveContextDir(cwd)>/agents/    ← project-level overrides (substrate-tracked)
~/.pi/agent/agents/                  ← user-global overrides
<consumer-package>/agents/           ← builtins
```

Per P1, this single tier structure applies uniformly to all agents regardless of consumer.

### [DECIDED] D8 — NEW per canonical body alignment: Agentic-mode tool execution dispatches through ExtensionContext

In agentic-mode (D4), the agent's declared `tools[]` (clamped per DEC-0047) becomes the LLM's tool registry. When the LLM emits a tool call, `executeAgent` looks up the tool in ExtensionContext's tool registry and dispatches the invocation through it. Tool results are threaded into the LLM's message history; the loop continues with the enriched history.

This realizes FEAT-005 ("subagent receives its OWN tools, JIT-composed per invocation, scoped to EXACTLY the operations the task needs") at the agent-tier dispatch boundary — closing the gap FGAP-169 named (compiled.tools structurally unreachable from LLM in v1 implementation).

**Interlocks:** FGAP-115 (ExtensionContext.currentModel/currentProvider absence) needs resolution so that ExtensionContext can be relied upon at executeAgent for both model resolution AND tool-execution surface routing. Both interlocks close together.

### [DECIDED] D9 — NEW: Mode selection algorithm

The dispatch mode is selected at compile time from spec shape:

| spec.outputSchema | spec.tools[] | Selected mode |
|---|---|---|
| Set | Empty/absent | Classifier-mode |
| Set | Non-empty | **Agentic-mode**; outputSchema becomes post-hoc validation on the final assistant message after the tool-execution loop completes |
| Absent | Empty/absent | Classifier-mode with text-format output (no phantom tool; raw text return) |
| Absent | Non-empty | Agentic-mode |

Mode selection is structural — operator authorship of the spec determines the dispatch shape; there is no per-invocation mode override. This makes the dispatch semantic predictable from the spec alone.

The `output.format: "text"` field is informational about the expected output shape; it does not alter mode selection. An agent declaring `tools: [read, append-block-item]` with `output.format: "text"` runs in agentic-mode (per the table above) and produces a final assistant message after the tool-execution loop — the prior anti-pattern of declaring tools[] alongside text-format without expecting tool execution is closed by this algorithm.

### [DECIDED] D10 — NEW: ExtensionContext as the canonical tool-execution surface

Agentic-mode tool execution (D8) dispatches through `ExtensionContext.dispatchTool(toolName, params)` (or equivalent surface). Tools are not directly imported by jit-agents; they are resolved at runtime per the ExtensionContext registry the dispatch carries.

This keeps jit-agents tool-agnostic (no per-tool imports; matches D5's separation-of-concerns discipline) AND enables consumer-supplied tool surfaces (workflows can route tool dispatches through workflow-specific routing; monitor agents can have restricted tool sets; pi-agent-dispatch composite tools per FEAT-010 register naturally).

**Interlocks** with FGAP-115 (ExtensionContext gap) + TASK-089/092 (composite tool infrastructure already landed; needs the dispatch surface this decision names).

---

## 5. Success Criteria

The framework is correct only if ALL of these hold:

1. **Single resolution point:** `outputSchema`, template paths, and `contextBlocks` paths are resolved in exactly one place (inside jit-agents' `loadAgent()`). Consumers contain zero path resolution logic for agent specs.

2. **No `.pi/` reads from our packages:** grep returns zero results in pi-jit-agents, pi-workflows, pi-behavior-monitors source.

3. **Unified dispatch path:** all agent invocations execute through `executeAgent`. Mode selection per D9 routes to classifier-mode or agentic-mode; no consumer reimplements dispatch.

4. **No duplicate implementations:** `parseModelSpec`, Nunjucks env creation, phantom tool construction, verdict parsing each exist exactly once.

5. **Artifacts live in consumer packages:** workflow agent specs in pi-workflows; monitor classifier specs in pi-behavior-monitors; pi-agent-dispatch composite-tool specs in pi-agent-dispatch.

6. **Runtime validation passes:** `workflow-validate` reports clean against all bundled workflows; `monitors-status` returns complete monitor state.

7. **Loop-step contextBlocks injection works:** agents in loop steps receive `.project/` block data.

8. **Tier-aware resolution:** user-provided agent overrides correctly resolve template and schema references against the override directory.

9. **Zero circular deps:** pi-jit-agents depends on pi-context only. Consumers depend on pi-jit-agents.

10. **All tests pass:** including tests for mode-selection routing + agentic-mode tool execution + classifier-mode phantom-tool dispatch.

11. **Agentic-mode dispatch correctness — NEW:** agents declaring non-empty `tools[]` invoke those tools through executeAgent's multi-turn loop; ExtensionContext tool-execution dispatch fires; granted capabilities (DEC-0047) are exercised at runtime, not just clamped at dispatch boundary. **Verification:** clock-menu-app's 4 agent specs (spec-issues-miner / spec-decisions-drafter / spec-requirements-miner / test-reader) succeed in what their tools[] declarations promise (re-run as regression-positives).

12. **Capability-grant infrastructure is no-op-free at agent dispatch — NEW:** composeToolGrant + 55-operation vocabulary + Hybrid-3-v2 composite-tool infrastructure (per FEAT-004 / FEAT-005 / DEC-0047 / TASK-089 / TASK-092) produce value at agentic-mode runtime, not only at clamp-time. Closes FGAP-178 dormancy.

---

## 6. Non-Goals

This specification does NOT:

- Add features beyond the canonical body declarations — the multi-tool dispatch loop + ExtensionContext tool-execution surface realize what FEAT-005 / FEAT-006 / DEC-0047 / TASK-091 / JI-029 already commit to.
- Change the `.agent.yaml` spec format incompatibly (existing specs must still parse; agentic-mode dispatch selection per D9 reads existing tools[] field; no new required spec fields)
- Change the workflow YAML format
- Change the monitor JSON format
- Resolve open architectural issues not caused by the agent-tier (e.g., issue-005 parallel step filesystem conflicts is out of scope)
- Address issues 028, 030, 031 (block write-back, writeback monitor, scheduled re-execution) — those are downstream work enabled by this spec

---

## 7. Implementation Status

### What is implemented (as of v2 authoring)

- §2 Boundary contract — all four surfaces public: `createAgentLoader` / `parseAgentYaml`, `compileAgent`, `executeAgent`, `agentContract`
- §2b uniformity at the dispatch path for workflow-invoked + monitor-invoked agents
- D1 — `AgentSpec.loadedFrom` populated by `parseAgentYaml`; template and schema paths resolved to absolute at load time
- D2 — package ships framework code + `schemas/verdict.schema.json` only
- D3 — `createAgentLoader` and `createTemplateEnv` do NOT search `.pi/`
- **D4 classifier-mode** — `executeAgent` with phantom tool enforcement via `buildPhantomTool` + forced `toolChoice`; single LLM call; output extraction; verdict-shaped result
- D5 — no subprocess dispatch
- D7 (provisional) — three-tier discovery materialized
- Framework-level anti-injection wrapping for `contextBlocks` content in `compileAgent`

### What is NOT yet implemented

- **D4 agentic-mode** — multi-tool dispatch loop in `executeAgent`. Currently `compiled.tools` is consumed at `packages/pi-jit-agents/src/jit-runtime.ts:488` for grant-clamp check then discarded; the LLM receives only the phantom tool at line 568 (when outputSchema set) or no tool at all (when outputSchema absent). Closure tracked by FGAP-169 (sharpened body) + FGAP-178 (capability-grant dormancy) + this spec's D4/D8/D9/D10.
- **D9 mode selection algorithm** — currently the implementation only ever takes the classifier-mode path; mode selection by spec shape is absent.
- **D10 ExtensionContext.dispatchTool** — the tool-execution surface this spec names does not yet exist on ExtensionContext per the verified gap; interlocks with FGAP-115.
- **Consumer migration** — `pi-workflows` still owns its own `agent-spec.ts`, `template.ts`, and `step-shared.ts` agent helpers per FEAT-001 / TASK-082 / TASK-083 / which remain planned. Both consumers will migrate to import from `pi-jit-agents` in a subsequent work arc.

### Implementation arc

The path from current state (classifier-mode-only, capability-grant-dormant-at-dispatch) to v2-canonical (dual-mode with agentic-mode tool execution exercising granted capabilities) is tracked by:
- FGAP-169 (sharpened) — implementation gap; multi-tool dispatch loop is the work
- FGAP-178 — operational consequence; closes when D4 agentic-mode lands
- FGAP-115 — ExtensionContext gap; load-bearing for D10
- FEAT-001 — consumer cascade
- TASK-082 / TASK-083 — consumer-side migration

When the implementation arc completes, this spec moves from "v2 draft with implementation gap named" to "v2 canonical fully realized."

---

## Living document notes

- This spec is authored as a markdown file for persistence + readability. Substrate decomposition (axioms + decisions + concepts + open-questions as substrate items in `.context-jit-spec-v2`) is a parallel arc; this markdown is the source of truth for content until that substrate work lands + a lens projection generates this document on demand from substrate items.
- Authored: 2026-05-30
- v1 reference: `docs/planning/jit-agents-spec.md` (gitignored; archaeological)
- Canonical body anchoring v2: FEAT-005 + FEAT-006 + DEC-0047 + TASK-091 + JI-029 (queryable via substrate readBlock)
