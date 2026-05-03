# Package Issue Clusters — pi-jit-agents, pi-behavior-monitors, pi-workflows

**Date:** 2026-05-03
**Source:** filtered enumeration of `.project/issues.json` open entries against per-package boundary lenses.
**Companion to:** `2026-05-03-context-management-issue-cluster.md` (which organizes the same issue set against the cross-cutting context-management lens).

The four analyses (context-management + the three packages below) cover every open issue once each in its primary domicile, with cross-listings noted at the end.

---

## pi-jit-agents — agent-dispatch substrate

The boundary contract lens: load → compile → execute → introspect.

### Load (agent-spec discovery + parsing)

- issue-048 — .pi/agents reads contradict README directory ownership
- issue-067 — agent-spec discovery path split (pi-workflows uses .pi/agents/, pi-jit-agents uses .project/agents/ three-tier)
- issue-006 — No recursion depth guard for nested workflow agent invocation

### Compile (template + contextBlocks + schema injection)

- issue-020 — contextBlocks injection only reads static files (no computed blocks at dispatch time)
- issue-041 — Scoped/filtered contextBlocks reads (subsets, not whole blocks)
- issue-045 — Framework-level anti-injection wrapping for contextBlocks
- issue-049 — step-loop.ts:187 calls compileAgentSpec without cwd — agents in loop steps never receive contextBlocks data
- issue-034 — Agent templates with tool-use should drop output-format instructions (template focuses on reasoning, tool definition handles output contract)

### Execute (dispatch, forced tool-use, model resolution)

- issue-032 — Tool-use structured output for workflow agent steps that declare output.schema
- issue-052 — Dynamic model selection via expressions in agent spec model field
- issue-053 — Pre-execution monitors — gate agent completion on required tool calls
- issue-054 — Per-agent tool-call budget tracking
- issue-062 — parseModelSpec defaults bare model ids to provider='anthropic' (execute-boundary policy)
- issue-064 — pi-workflows dispatch.ts lacks per-step provider/model override
- issue-066 — Workflow executor crashes `name.replace is not a function` on agent dispatch

### Introspect

- (no open issues against agentContract projection)

### Cross-cutting (spec ↔ execution consistency)

- issue-005 — Parallel agent steps share working tree (cwd model)
- issue-033 — Expression-level field validation in workflow step input blocks (input contract)
- issue-043 — Summary/body output contract on StepResult (output contract)
- issue-044 — Semantic input hash for idempotent skip (input identity)
- issue-047 — Structured artifacts[] on StepResult (output shape)
- issue-063 — Dead `thinking: on` config in five bundled classifier YAMLs silently dropped by classify path (spec-vs-execute drift)

### Cluster density

**Highest:** execute-boundary policy issues (032, 052, 054, 062, 064, 066) — these all converge on the executeAgent surface as the single point where dispatch contracts must be enforced consistently.

**Secondary:** compile-tier issues (020, 041, 045, 049) — all about contextBlocks injection completeness.

---

## pi-behavior-monitors — classification & steering substrate

The monitor-lifecycle lens: collect → classify → act → debug.

### Classification (the agent that judges activity)

- issue-023 — Monitor classify produces no debug output (misfires uninspectable)
- issue-036 — Execution trace debugger for classify chain
- issue-050 — step-monitor.ts ignores classify.agent — workflow monitor verification gates silently return CLEAN
- issue-053 — Pre-execution monitors — gate completion on required tool calls before final output
- issue-062 — Monitor provider-pin in parseModelSpec
- issue-063 — Dead `thinking: on` config silently dropped

### Configuration / authoring

- issue-035 — Per-monitor configurable collector parameters (context window tunable from YAML without code changes)
- issue-038 — Monitor tuning tools (command-mediated parameter changes for collector config, classify template, agent YAML)
- issue-039 — Monitor spec validator (validateMonitor against schemas + collectors)
- issue-040 — Skill generator coverage for monitor classify template variables, collector output shapes, tuning commands

### Write-actions (steering + persistence)

- issue-030 — Writeback monitor — persist structured summaries to project blocks
- issue-065 — Write-action path bypasses block-api → silent schema drift from destination blocks

### Observability

- issue-016 — No TUI visibility into monitor token usage and cost (side-channel LLM calls invisible)

### Primitive expansion

- issue-051 — Directory-watching monitor (general filesystem observation primitive)

### Cluster density

**Highest:** classification visibility (023, 036, 050, 063) — multiple distinct ways the classify path silently misbehaves.

**Secondary:** authoring/tooling (035, 038, 039, 040) — making monitors editable as first-class artifacts.

---

## pi-workflows — orchestration substrate

The orchestration lens: spec → DAG → step execute → output → integration.

### Authoring / spec shape

- issue-002 — Template composition (extends/blocks/macros) used in only 1 of 22 template families
- issue-003 — Agent reuse across workflows is structural repetition, not parametric recombination
- issue-004 — No ad-hoc agent invocation path — every use requires a .workflow.yaml spec
- issue-006 — No recursion depth guard for nested workflow invocation (Phase 6)

### DAG semantics

- issue-005 — Parallel agent steps share working tree — filesystem conflicts in concurrent file-writing workflows
- issue-031 — Scheduled workflow re-execution — time-based or event-based triggers for compounding context loop
- issue-046 — Explicit depends_on vs consumes edge types — no first-class ordering-only edge

### Step execution / dispatch boundary

- issue-049 — step-loop.ts cwd bug — agents in loop steps never receive contextBlocks
- issue-050 — step-monitor.ts ignores classify.agent — silent CLEAN
- issue-052 — Dynamic model selection via expressions in agent spec
- issue-054 — Per-agent tool-call budget tracking
- issue-064 — dispatch.ts lacks per-step provider/model override
- issue-066 — Workflow executor crashes `name.replace is not a function`
- issue-067 — agent-spec discovery path split

### Step input / output contracts

- issue-033 — Expression-level field validation against source schemas in workflow step input blocks
- issue-042 — Token budgeting across DAG edges (upstream output interpolated verbatim)
- issue-043 — Summary/body output contract on StepResult
- issue-044 — Semantic input hash for idempotent skip
- issue-047 — Structured artifacts[] on StepResult

### Workflow ↔ project-state integration (writeback)

- issue-008 — No automatic decision recording during agent execution
- issue-009 — No phase-level verification rollup
- issue-010 — Issue lifecycle not connected to task completion
- issue-011 — Agent execution metadata not persisted to project blocks
- issue-028 — Agent steps should declare block write-back targets
- issue-029 — Artifact format rendering — editable surfaces from schema-validated block data
- issue-037 — SDK query surface for execution history (lastRunResult, stepTrace, executionHistory)

### Cluster density

**Highest:** workflow ↔ project-state integration (008, 009, 010, 011, 028, 029, 037) — every one of these is "work happens but its result doesn't land in the typed substrate."

**Secondary:** step dispatch boundary (049, 050, 052, 064, 066, 067) — spec-vs-runtime contract enforcement at dispatch time.

---

## Cross-package observations

Several issues appear in multiple lenses; their owner is the receiving package by API surface, while the originating side reports against the consumer:

- issue-049, issue-066, issue-067 — dispatch boundary; surface in jit-agents and workflows
- issue-050 — classify wiring; surfaces in monitors and workflows
- issue-062, issue-063 — model spec policy; surface in jit-agents and monitors
