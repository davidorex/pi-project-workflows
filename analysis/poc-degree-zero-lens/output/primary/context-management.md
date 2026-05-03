# Lens: context-management

**Target block:** Issue Tracker  
**Relation type:** context-mgmt-concern  
**Source:** hand-curated edges in relations.json
**Render uncategorized:** true

## substrate-integrity

- **issue-017** [open] — `pi-behavior-monitors` — No state coherence monitor — project blocks drift from source as development proceeds
- **issue-021** [open] — `pi-project` — Architecture block is manually maintained — modules, dependencies, and patterns are derivable from package.json and source
- **issue-022** [open] — `pi-project` — Domain block reference entries duplicate SDK query results — agent counts, workflow counts, step types go stale
- **issue-065** [open] — `pi-behavior-monitors` — pi-behavior-monitors write-action path bypasses block-api and drifts silently from destination block schemas

## provenance

- **issue-011** [open] — `pi-workflows` — Agent execution metadata (model, cost, duration) not persisted to project blocks
- **issue-036** [open] — `pi-project-workflows` — Execution trace debugger — capture full input→template→LLM→parse→result chain for workflow steps and monitor classify calls
- **issue-037** [open] — `pi-workflows` — SDK query surface for execution history — lastRunResult, stepTrace, executionHistory functions
- **issue-047** [open] — `pi-workflows` — Structured artifacts[] on StepResult — no first-class pointer to files a step produced

## automatic-capture

- **issue-008** [open] — `pi-workflows` — No automatic decision recording during agent execution — decisions block task field exists but nothing populates it
- **issue-028** [open] — `pi-workflows` — Agent steps should declare block write-back targets — memory accumulates as side effect of work, not separate task
- **issue-030** [open] — `pi-behavior-monitors` — Writeback monitor — observe agent execution results and persist structured summaries to project blocks
- **issue-032** [open] — `pi-workflows` — Tool-use structured output for workflow agent steps that declare output.schema — in-process dispatch for schema-bound non-tool-using agents

## context-projection

- **issue-020** [open] — `pi-workflows` — contextBlocks injection only reads static files — no support for computed blocks derived at dispatch time
- **issue-029** [open] — `pi-workflows` — Artifact format rendering — produce editable surfaces (markdown, CSV, HTML) from schema-validated block data
- **issue-041** [open] — `pi-jit-agents` — Scoped/filtered contextBlocks reads — agents cannot request subsets of block data
- **issue-043** [open] — `pi-workflows` — Summary/body output contract — StepResult lacks a budget-safe summary field distinct from full body
- **issue-045** [open] — `pi-jit-agents` — Framework-level anti-injection wrapping — contextBlocks injection not systematically wrapped in delimiters

## context-window

- **issue-035** [open] — `pi-behavior-monitors` — Per-monitor configurable collector parameters — context window tunable from YAML without code changes
- **issue-042** [open] — `pi-workflows` — Token budgeting across DAG edges — upstream output is interpolated verbatim with no budget

## lifecycle-linkage

- **issue-009** [open] — `pi-workflows` — No phase-level verification rollup — individual task verification exists but nothing aggregates to phase success_criteria
- **issue-010** [open] — `pi-project` — Issue lifecycle not connected to task completion — resolved_by must be set manually

## identity-idempotence

- **issue-044** [open] — `pi-workflows` — Semantic input hash for idempotent skip — no mechanism to detect equivalent inputs and skip re-execution

## visibility

- **issue-023** [open] — `pi-behavior-monitors` — Monitor classify calls produce no debug output — misfires are uninspectable
- **issue-033** [open] — `pi-workflows` — Expression-level field validation against source schemas in workflow step input blocks

## reachability

- **issue-067** [open] — `pi-workflows` — agent-spec discovery path split — pi-workflows uses .pi/agents/, pi-jit-agents uses .project/agents/ three-tier

## (uncategorized)

- **issue-002** [open] — `pi-workflows` — Template composition (extends/blocks/macros) used in only 1 of 22 template families
- **issue-003** [open] — `pi-workflows` — Agent reuse across workflows is structural repetition, not parametric recombination
- **issue-004** [open] — `pi-workflows` — No ad-hoc agent invocation path — every use requires a .workflow.yaml spec
- **issue-005** [open] — `pi-workflows` — Parallel agent steps share working tree — filesystem conflicts in concurrent file-writing workflows
- **issue-006** [open] — `pi-workflows` — No recursion depth guard for future nested workflow invocation (Phase 6)
- **issue-007** [open] — `pi-project` — assigned_agent field on tasks is decorative — nothing routes work based on it
- **issue-016** [open] — `pi-behavior-monitors` — No TUI visibility into monitor token usage and cost — side-channel LLM calls are invisible
- **issue-031** [open] — `pi-workflows` — Scheduled workflow re-execution — time-based or event-based triggers for the compounding context loop
- **issue-034** [open] — `pi-project-workflows` — Agent templates with tool-use output enforcement should drop output format instructions — template focuses on reasoning, tool definition handles output contract
- **issue-038** [open] — `pi-behavior-monitors` — Monitor tuning tools — command-mediated parameter changes for collector config, classify template, agent YAML
- **issue-039** [open] — `pi-behavior-monitors` — Monitor spec validator — validateMonitor() checking spec + agent YAML + classify template against schemas and available collectors
- **issue-040** [open] — `pi-project-workflows` — Skill generator coverage — surface classify template variables, collector output shapes, tuning commands, debug query paths
- **issue-046** [open] — `pi-workflows` — Explicit depends_on vs consumes edge types — no first-class ordering-only edge
- **issue-048** [open] — `pi-workflows` — .pi/agents reads contradict README directory ownership declaration — framework code violates stated architecture
- **issue-049** [open] — `pi-workflows` — step-loop.ts:187 calls compileAgentSpec without cwd — agents in loop steps never receive contextBlocks data
- **issue-050** [open] — `pi-workflows` — step-monitor.ts ignores classify.agent — workflow monitor verification gates silently return CLEAN
- **issue-051** [open] — `pi-behavior-monitors` — Directory-watching monitor — general filesystem observation primitive for skill discovery, dependency drift, external artifact arrival
- **issue-052** [open] — `pi-jit-agents` — Dynamic model selection via expressions in agent spec model field
- **issue-053** [open] — `pi-behavior-monitors` — Pre-execution monitors — gate agent completion on required tool calls before final output
- **issue-054** [open] — `pi-behavior-monitors` — Per-agent tool-call budget tracking — framework-level counting and enforcement of tool-call budgets
- **issue-055** [open] — `pi-project` — Framework gap FGAP-001 — pi-project does not support hierarchical/nested block storage
- **issue-056** [open] — `pi-project` — Framework gap FGAP-002 — no per-scope finding registries on block kinds
- **issue-057** [open] — `pi-project` — Framework gap FGAP-003 — no materialized views over scoped blocks
- **issue-058** [open] — `pi-project` — Framework gap FGAP-004 — no authorship attestation at block write time
- **issue-059** [open] — `pi-project` — Framework gap FGAP-005 — no state-machine validation on enum-field transitions
- **issue-060** [open] — `pi-project` — Framework gap FGAP-006 — no schema versioning or evolution protocol
- **issue-062** [open] — `pi-behavior-monitors` — Monitor provider-pin — parseModelSpec defaults bare model ids to provider='anthropic'
- **issue-063** [open] — `pi-behavior-monitors` — Dead 'thinking: on' config in five bundled classifier agent YAMLs — silently dropped by classify path
- **issue-064** [open] — `pi-workflows` — pi-workflows dispatch.ts lacks per-step provider/model override
- **issue-066** [open] — `pi-workflows` — workflow executor crashes with `name.replace is not a function` on any agent dispatch
- **issue-068** [open] — `pi-project` — Lens curation ceremony — slash command for binning uncategorized items
- **issue-069** [open] — `pi-project` — Route POC AJV instance through pi-project schema-validator's cache
- **issue-070** [open] — `pi-project` — Cross-package cache surface for config + relations + synthesized edges
- **issue-071** [open] — `pi-project` — Bound synthetic-edge synthesis: lazy per-lens vs eager union
- **issue-072** [open] — `pi-jit-agents` — Cycle handling composes between walkDescendants visited-guard and render_recursive depth-guard
- **issue-073** [open] — `pi-project` — Extend validateRelations to detect cycles in authored relations
- **issue-074** [open] — `pi-project` — seedExamples short-circuit blocks new substrate files from reaching already-seeded projects
- **issue-075** [open] — `pi-project` — Verify writeBlock dynamic schema discovery accepts config as a typed block
- **issue-076** [open] — `pi-project` — partitions field on config block: commit to runtime semantics or drop from schema

---

**Total items rendered:** 64