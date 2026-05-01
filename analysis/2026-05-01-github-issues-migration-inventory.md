# GitHub Issues migration inventory

Date: 2026-05-01
HEAD: `64716ea`
Scope: enumerate every item in `/Users/david/Projects/workflowsPiExtension/` that is a candidate for migration to GitHub Issues. Inventory only — no migration plan, no label scheme.

Convention: a block-item is an issue candidate if it is **work-tracked** (has current/target state, lifecycle, candidate resolution paths, or assignment shape). Documentation, identity records, and project-state metadata are NOT candidates.

---

## 1. Issue candidates

### 1.1 `.project/issues.json` — issues array (66 items)

| id | title | status | priority | category | source |
|---|---|---|---|---|---|
| issue-001 | Agent input schemas are parsed but never validated at dispatch time | resolved | critical | primitive | `.project/issues.json` |
| issue-002 | Template composition (extends/blocks/macros) used in only 1 of 22 template families | open | high | composition | `.project/issues.json` |
| issue-003 | Agent reuse across workflows is structural repetition, not parametric recombination | open | medium | composition | `.project/issues.json` |
| issue-004 | No ad-hoc agent invocation path — every use requires a .workflow.yaml spec | open | high | capability | `.project/issues.json` |
| issue-005 | Parallel agent steps share working tree — filesystem conflicts | open | high | issue | `.project/issues.json` |
| issue-006 | No recursion depth guard for nested workflow invocation | open | medium | capability | `.project/issues.json` |
| issue-007 | assigned_agent field on tasks is decorative — nothing routes work based on it | open | medium | primitive | `.project/issues.json` |
| issue-008 | No automatic decision recording during agent execution | open | high | primitive | `.project/issues.json` |
| issue-009 | No phase-level verification rollup | open | high | capability | `.project/issues.json` |
| issue-010 | Issue lifecycle not connected to task completion — resolved_by manual | open | high | primitive | `.project/issues.json` |
| issue-011 | Agent execution metadata not persisted to project blocks | open | medium | capability | `.project/issues.json` |
| issue-012 | Completion message fires on workflow failure | resolved | critical | issue | `.project/issues.json` |
| issue-013 | Agent output instructions tell agents to write files they cannot write | resolved | critical | issue | `.project/issues.json` |
| issue-014 | Format-json output path silently swallows JSON parse failures | resolved | critical | primitive | `.project/issues.json` |
| issue-015 | Classify prompt lacks conversation history | resolved | critical | issue | `.project/issues.json` |
| issue-016 | No TUI visibility into monitor token usage and cost | open | high | capability | `.project/issues.json` |
| issue-017 | No state coherence monitor | open | high | capability | `.project/issues.json` |
| issue-018 | Hedge monitor classifies tool-call-heavy responses as empty | resolved | critical | issue | `.project/issues.json` |
| issue-019 | Skill generator cannot introspect validator phases or SDK query functions | resolved | high | capability | `.project/issues.json` |
| issue-020 | contextBlocks injection only reads static files | open | high | capability | `.project/issues.json` |
| issue-021 | Architecture block is manually maintained | open | medium | capability | `.project/issues.json` |
| issue-022 | Domain block reference entries duplicate SDK query results | open | medium | capability | `.project/issues.json` |
| issue-023 | Monitor classify calls produce no debug output | open | critical | capability | `.project/issues.json` |
| issue-024 | Classify calls with thinking enabled return empty text | resolved | critical | issue | `.project/issues.json` |
| issue-025 | Monitor classify calls reinvent agent infrastructure | resolved | high | capability | `.project/issues.json` |
| issue-026 | Structured output via tool-use enforcement for monitor classify | resolved | critical | issue | `.project/issues.json` |
| issue-027 | extractResponseText() uses wrong property name for ThinkingContent | resolved | critical | issue | `.project/issues.json` |
| issue-028 | Agent steps should declare block write-back targets | open | high | capability | `.project/issues.json` |
| issue-029 | Artifact format rendering — markdown/CSV/HTML from schema-validated block data | open | medium | capability | `.project/issues.json` |
| issue-030 | Writeback monitor — persist structured summaries to project blocks | open | high | capability | `.project/issues.json` |
| issue-031 | Scheduled workflow re-execution — time/event-based triggers | open | medium | capability | `.project/issues.json` |
| issue-032 | Tool-use structured output for workflow agent steps with output.schema | open | high | capability | `.project/issues.json` |
| issue-033 | Expression-level field validation against source schemas in workflow step input blocks | open | high | capability | `.project/issues.json` |
| issue-034 | Agent templates with tool-use output enforcement should drop output format instructions | open | medium | capability | `.project/issues.json` |
| issue-035 | Per-monitor configurable collector parameters | open | high | capability | `.project/issues.json` |
| issue-036 | Execution trace debugger — full input→template→LLM→parse→result chain | open | critical | capability | `.project/issues.json` |
| issue-037 | SDK query surface for execution history | open | high | capability | `.project/issues.json` |
| issue-038 | Monitor tuning tools — command-mediated parameter changes | open | high | capability | `.project/issues.json` |
| issue-039 | Monitor spec validator — validateMonitor() | open | high | capability | `.project/issues.json` |
| issue-040 | Skill generator coverage — classify template variables, collector shapes, debug paths | open | high | capability | `.project/issues.json` |
| issue-041 | Scoped/filtered contextBlocks reads | open | high | capability | `.project/issues.json` |
| issue-042 | Token budgeting across DAG edges | open | high | capability | `.project/issues.json` |
| issue-043 | Summary/body output contract — StepResult lacks budget-safe summary | open | high | capability | `.project/issues.json` |
| issue-044 | Semantic input hash for idempotent skip | open | high | capability | `.project/issues.json` |
| issue-045 | Framework-level anti-injection wrapping for contextBlocks | open | high | issue | `.project/issues.json` |
| issue-046 | Explicit depends_on vs consumes edge types | open | medium | capability | `.project/issues.json` |
| issue-047 | Structured artifacts[] on StepResult | open | medium | capability | `.project/issues.json` |
| issue-048 | .pi/agents reads contradict README directory ownership declaration | open | high | issue | `.project/issues.json` |
| issue-049 | step-loop.ts:187 calls compileAgentSpec without cwd | open | critical | issue | `.project/issues.json` |
| issue-050 | step-monitor.ts ignores classify.agent | open | critical | issue | `.project/issues.json` |
| issue-051 | Directory-watching monitor — general filesystem observation primitive | open | medium | capability | `.project/issues.json` |
| issue-052 | Dynamic model selection via expressions in agent spec model field | open | medium | capability | `.project/issues.json` |
| issue-053 | Pre-execution monitors — gate agent completion on required tool calls | open | medium | capability | `.project/issues.json` |
| issue-054 | Per-agent tool-call budget tracking | open | medium | capability | `.project/issues.json` |
| issue-055 | FGAP-001 — pi-project does not support hierarchical/nested block storage | open | high | capability | `.project/issues.json` |
| issue-056 | FGAP-002 — no per-scope finding registries on block kinds | open | high | capability | `.project/issues.json` |
| issue-057 | FGAP-003 — no materialized views over scoped blocks | open | medium | capability | `.project/issues.json` |
| issue-058 | FGAP-004 — no authorship attestation at block write time | open | high | primitive | `.project/issues.json` |
| issue-059 | FGAP-005 — no state-machine validation on enum-field transitions | open | high | capability | `.project/issues.json` |
| issue-060 | FGAP-006 — no schema versioning or evolution protocol | open | medium | capability | `.project/issues.json` |
| issue-061 | FGAP-007 — no staleness engine for research blocks | open | medium | capability | `.project/issues.json` |
| issue-062 | Monitor provider-pin — parseModelSpec defaults bare model ids to provider='anthropic' | open | high | issue | `.project/issues.json` |
| issue-063 | Dead 'thinking: on' config in five bundled classifier agent YAMLs | open | medium | cleanup | `.project/issues.json` |
| issue-064 | pi-workflows dispatch.ts lacks per-step provider/model override | open | medium | capability | `.project/issues.json` |
| issue-065 | pi-behavior-monitors write-action path bypasses block-api | open | high | issue | `.project/issues.json` |
| fragility-fragility-mohud6vz | Agent silently skipped JSONDecodeError on session-reading; proposed console.error fallback as deferred work | open | warning | fragility | `.project/issues.json` |

### 1.2 `.project/framework-gaps.json` — gaps array (6 items)

| id | title | status | priority | summary | source |
|---|---|---|---|---|---|
| FGAP-001 | Hierarchical / nested block storage | identified | P1 | pi-project flat-only — no nested folders / subfile shape | `.project/framework-gaps.json` |
| FGAP-002 | Per-scope finding registries | identified | P1 | no findings array embeddable per block scope | `.project/framework-gaps.json` |
| FGAP-003 | Materialized views over scoped blocks | identified | P2 | no derived view kind | `.project/framework-gaps.json` |
| FGAP-004 | Authorship attestation at write time | identified | P1 | block writes lack authored_by | `.project/framework-gaps.json` |
| FGAP-005 | State-machine validation on enum-field transitions | identified | P1 | enum mutations unguarded | `.project/framework-gaps.json` |
| FGAP-006 | Schema versioning and evolution | identified | P2 | no $version or migration protocol | `.project/framework-gaps.json` |

(Note: FGAP-007 staleness engine is referenced by `issue-061` and `analysis/research-blocks-design.md` but is NOT present in `framework-gaps.json` — known absence.)

### 1.3 `.project/spec-reviews.json` — reviews + nested findings (1 review, 0 findings)

| id | title | status | findings | summary | source |
|---|---|---|---|---|---|
| REVIEW-001 | Design review of `docs/planning/jit-agents-spec.md` | not-started | 0 | Fresh-context independent reviewer not yet spawned | `.project/spec-reviews.json` |

### 1.4 `.project/features.json` — features + nested stories + tasks (1 feature, 9 stories, 28 tasks, 0 findings)

Feature row:

| id | title | status | layer | summary | source |
|---|---|---|---|---|---|
| FEAT-001 | pi-jit-agents consumer migration arc | proposed | L3 | Migrate pi-workflows + pi-behavior-monitors to import agent infrastructure from `@davidorex/pi-jit-agents`; close issues 043, 045, 048, 049, 050 | `.project/features.json` |

Stories within FEAT-001:

| id | title | status | depends_on | source |
|---|---|---|---|---|
| STORY-001 | Resolve model-pin policy and apply at pi-jit-agents | proposed | — | `.project/features.json` |
| STORY-002 | Apply thinking-seam enforcement in pi-jit-agents | proposed | STORY-001 | `.project/features.json` |
| STORY-003 | Move parseModelSpec to pi-jit-agents | proposed | STORY-001 | `.project/features.json` |
| STORY-004 | Migrate pi-workflows agent infrastructure to pi-jit-agents | proposed | STORY-003 | `.project/features.json` |
| STORY-005 | Migrate pi-behavior-monitors classifyViaAgent to pi-jit-agents | proposed | STORY-003 | `.project/features.json` |
| STORY-006 | Align bundled classifier YAMLs with decided policies | proposed | STORY-001/002 | `.project/features.json` |
| STORY-007 | Remove duplicate schema copies per issue-043 | proposed | STORY-004/005 | `.project/features.json` |
| STORY-008 | Empirical verification against OpenRouter and Kimi | proposed | STORY-005/006 | `.project/features.json` |
| STORY-009 | Close or migrate resolved issues | proposed | STORY-007/008 | `.project/features.json` |

Tasks within FEAT-001 stories:

| id | parent story | title | status | source |
|---|---|---|---|---|
| TASK-001-01 | STORY-001 | Verify ExtensionContext exposes currentModel | todo | `.project/features.json` |
| TASK-001-02 | STORY-001 | Implement bare-id resolution in pi-jit-agents | todo | `.project/features.json` |
| TASK-001-03 | STORY-001 | Unit tests for model resolution | todo | `.project/features.json` |
| TASK-002-01 | STORY-002 | Add pre-dispatch check in executeAgent | todo | `.project/features.json` |
| TASK-002-02 | STORY-002 | Define structured diagnostic channel | todo | `.project/features.json` |
| TASK-002-03 | STORY-002 | Unit tests for thinking-seam enforcement | todo | `.project/features.json` |
| TASK-003-01 | STORY-003 | Export parseModelSpec from pi-jit-agents | todo | `.project/features.json` |
| TASK-003-02 | STORY-003 | Remove duplicate from pi-behavior-monitors | todo | `.project/features.json` |
| TASK-003-03 | STORY-003 | Audit pi-workflows for equivalent parsing | todo | `.project/features.json` |
| TASK-004-01 | STORY-004 | Map pi-workflows agent-infrastructure surface to pi-jit-agents | todo | `.project/features.json` |
| TASK-004-02 | STORY-004 | Migrate call sites in pi-workflows step executors | todo | `.project/features.json` |
| TASK-004-03 | STORY-004 | Remove migrated helpers from pi-workflows | todo | `.project/features.json` |
| TASK-004-04 | STORY-004 | Update pi-workflows package.json dependencies | todo | `.project/features.json` |
| TASK-004-05 | STORY-004 | Run pi-workflows test suite | todo | `.project/features.json` |
| TASK-005-01 | STORY-005 | Rewrite classifyViaAgent against executeAgent | todo | `.project/features.json` |
| TASK-005-02 | STORY-005 | Remove pi-workflows dependency | todo | `.project/features.json` |
| TASK-005-03 | STORY-005 | Add pi-jit-agents dependency | todo | `.project/features.json` |
| TASK-005-04 | STORY-005 | Run pi-behavior-monitors test suite | todo | `.project/features.json` |
| TASK-006-01 | STORY-006 | Update hedge-classifier.agent.yaml | todo | `.project/features.json` |
| TASK-006-02 | STORY-006 | Update commit-hygiene-classifier.agent.yaml | todo | `.project/features.json` |
| TASK-006-03 | STORY-006 | Update fragility-classifier.agent.yaml | todo | `.project/features.json` |
| TASK-006-04 | STORY-006 | Update work-quality-classifier.agent.yaml | todo | `.project/features.json` |
| TASK-006-05 | STORY-006 | Update unauthorized-action-classifier.agent.yaml | todo | `.project/features.json` |
| TASK-007-01 | STORY-007 | Identify duplicate schema copies | todo | `.project/features.json` |
| TASK-007-02 | STORY-007 | Remove duplicates | todo | `.project/features.json` |
| TASK-007-03 | STORY-007 | Update imports to use canonical owner | todo | `.project/features.json` |
| TASK-008-01 | STORY-008 | Run hedge against openrouter/anthropic/claude-sonnet-4.6 | todo | `.project/features.json` |
| TASK-008-02 | STORY-008 | Run hedge against a Kimi model | todo | `.project/features.json` |
| TASK-008-03 | STORY-008 | Document verification outcomes | todo | `.project/features.json` |
| TASK-009-01 | STORY-009 | Close issue-043 | todo | `.project/features.json` |
| TASK-009-02 | STORY-009 | Close issue-045 | todo | `.project/features.json` |
| TASK-009-03 | STORY-009 | Close issue-048 | todo | `.project/features.json` |
| TASK-009-04 | STORY-009 | Close issue-049 | todo | `.project/features.json` |
| TASK-009-05 | STORY-009 | Close issue-050 | todo | `.project/features.json` |

### 1.5 `.project/tasks.json` — tasks array

| id | title | status | priority | summary | source |
|---|---|---|---|---|---|
| (empty) | — | — | — | tasks array is `[]` | `.project/tasks.json` |

### 1.6 `.project/requirements.json` — requirements array

| id | title | status | priority | summary | source |
|---|---|---|---|---|---|
| (empty) | — | — | — | requirements array is `[]` | `.project/requirements.json` |

### 1.7 `.project/verification.json` — verifications array

| id | title | status | priority | summary | source |
|---|---|---|---|---|---|
| (empty) | — | — | — | verification array is `[]` | `.project/verification.json` |

### 1.8 `.project/audit.json` — checks array

| id | title | status | priority | summary | source |
|---|---|---|---|---|---|
| (file absent) | — | — | — | `.project/audit.json` does not exist | `.project/audit.json` |

### 1.9 `.project/layer-plans.json` — plans + nested phases (1 plan, 7 phases)

Plan row:

| id | title | status | model | summary | source |
|---|---|---|---|---|---|
| PLAN-001 | Muni five-layer enactment for `.project/` | draft | Muni five-layer | Restructure flat-block storage into layered model with scope-owned findings; hand-enacted until framework gaps close | `.project/layer-plans.json` |

Phases within PLAN-001 (ambiguity flagged in §6 — milestones vs issues):

| id | name | status | depends_on | source |
|---|---|---|---|---|
| PHASE-1 | New L2 schemas in place | complete | — | `.project/layer-plans.json` |
| PHASE-2 | Seed initial L2/L3 artifacts | in-progress | PHASE-1 | `.project/layer-plans.json` |
| PHASE-3 | Run design review of jit-agents-spec.md | pending | PHASE-2 | `.project/layer-plans.json` |
| PHASE-4 | User-authored transitions on gating decisions | pending | PHASE-3 | `.project/layer-plans.json` |
| PHASE-5 | FEAT-001 story execution | pending | PHASE-4 | `.project/layer-plans.json` |
| PHASE-6 | Retroactive issue migration | pending | PHASE-5 | `.project/layer-plans.json` |
| PHASE-7 | Framework gap closure | pending | PHASE-5 | `.project/layer-plans.json` |

---

## 2. Fragility-catalog candidates

### 2.1 `analysis/2026-04-25-pi-bypass-arc-fragilities.md` — F-001..F-018

| id | title (truncated) | status (per file) | source |
|---|---|---|---|
| F-001 | tsx -e import resolution non-deterministic on Node 23.7 | open | `analysis/2026-04-25-pi-bypass-arc-fragilities.md:9` |
| F-002 | Five monitor classifier YAMLs use `model: claude-sonnet-4-6` w/ no provider field | resolved (`7edf3a2`) | `analysis/2026-04-25-pi-bypass-arc-fragilities.md:21` |
| F-003 | `thinking: "on"` is dead config in all five monitor classifier YAMLs | open | `analysis/2026-04-25-pi-bypass-arc-fragilities.md:38` |
| F-004 | `parseModelSpec` silent default to `anthropic` for unprefixed model strings | open | `analysis/2026-04-25-pi-bypass-arc-fragilities.md:47` |
| F-005 | `includeFallback: false` blocks env-var fallback for monitor classify | open | `analysis/2026-04-25-pi-bypass-arc-fragilities.md:57` |
| F-006 | Default openrouter model agentic; tool-call loops compound prompt size | open | `analysis/2026-04-25-pi-bypass-arc-fragilities.md:67` |
| F-007 | `~/.pi/agent/models.json` declares `kimi-k2.6:cloud` on ollama; absent locally | open | `analysis/2026-04-25-pi-bypass-arc-fragilities.md:77` |
| F-008 | pi-ai/pi-coding-agent at 0.63.1; latest 0.70.2 | resolved (`11a4069`) | `analysis/2026-04-25-pi-bypass-arc-fragilities.md:86` |
| F-009 | Model-id format dash/dot inconsistency provider-direct vs openrouter | open | `analysis/2026-04-25-pi-bypass-arc-fragilities.md:98` |
| F-010 | Project's own write-surface bootstrapping fragile within framework being built | open | `analysis/2026-04-25-pi-bypass-arc-fragilities.md:108` |
| F-011 | Forced-toolChoice protocol divergence; Anthropic-format hardcoded | resolved (`ce37772`) | `analysis/2026-04-25-pi-bypass-arc-fragilities.md:118` |
| F-012 | pi-ai 0.70.2 responses-family drivers do not honor `options.toolChoice` | open (structural) | `analysis/2026-04-25-pi-bypass-arc-fragilities.md:134` |
| F-013 | `jit-runtime.smoke.test.ts` constructed `Model<Api>` without `api` field | open | `analysis/2026-04-25-pi-bypass-arc-fragilities.md:144` |
| F-014 | `collectAssistantText` backward-walk + extractText can return empty | resolved (`0b50241`) | `analysis/2026-04-25-pi-bypass-arc-fragilities.md:154` |
| F-015 | Prompt-level guards advisory; LLM may reason past them | resolved (`affe992`) | `analysis/2026-04-25-pi-bypass-arc-fragilities.md:167` |
| F-016 | Branch state at session resume / mid-session restart unspecified | open | `analysis/2026-04-25-pi-bypass-arc-fragilities.md:178` |
| F-017 | Classifier templates inject `{{ assistant_text }}` w/ no empty-guard | open | `analysis/2026-04-25-pi-bypass-arc-fragilities.md:188` |
| F-018 | Multi-message turn "latest response" semantics undefined | resolved (decided by F-014 fix) | `analysis/2026-04-25-pi-bypass-arc-fragilities.md:198` |

### 2.2 `analysis/2026-05-01-substrate-arc-distillation.md` — F-019..F-025

| id | title (truncated) | status | source |
|---|---|---|---|
| F-019 | `biome.json` `$schema` URL pin and biome devDependency drift independently | proposed (Tier A) | `analysis/2026-05-01-substrate-arc-distillation.md:30` |
| F-020 | D3 (project-tier shadows bundled) half-implemented across three packages | proposed (Tier A) | `analysis/2026-05-01-substrate-arc-distillation.md:43` |
| F-021 | Monitor-finding writes bypass `block-api.ts` | proposed (Tier A) | `analysis/2026-05-01-substrate-arc-distillation.md:54` |
| F-022 | `~/.pi/agent/templates/` is theoretical capability with zero current consumers | proposed (Tier A) | `analysis/2026-05-01-substrate-arc-distillation.md:65` |
| F-023 | `blocks-schemas-macros-contract-synthesis.md` Document 3 audit-gap canonicality | proposed (Tier A) | `analysis/2026-05-01-substrate-arc-distillation.md:76` |
| F-024 | JSON Schema draft-07 precludes `$vocabulary` declaration | proposed (Tier A) | `analysis/2026-05-01-substrate-arc-distillation.md:87` |
| F-025 | Agent runtime keeps foreground-completed agents resumable; no `ListTasks` primitive | proposed (Tier A) | `analysis/2026-05-01-substrate-arc-distillation.md:99` |

---

## 3. Documentation blocks (NOT candidates)

| block | item count | reason-not-candidate | source |
|---|---|---|---|
| decisions | 5 (DEC-0001..0005) | ADR pattern; file-based by convention; not work-tracked issues | `.project/decisions.json` |
| rationale | 0 (empty) | decision-adjacent design rationale; reference, not work | `.project/rationale.json` |
| conformance-reference | 0 principles | executable conventions registry; reference material | `.project/conformance-reference.json` |
| architecture | 0 (empty array) | modules/patterns; project-state metadata | `.project/architecture.json` |
| domain | 0 entries | research findings/glossary; reference, not work | `.project/domain.json` |
| project | charter (1 record) | identity record (vision/goals/scope); not work-tracked | `.project/project.json` |
| research | 11 entries (R-0001..R-0011) | factual/analytical substrate; agent-readable, reference-like | `.project/research.json` |
| conventions | 4 categories | coding conventions registry; reference | `.project/conventions.json` |

---

## 4. Analysis MDs (reference material, NOT candidates)

| filename | one-line topic | classification |
|---|---|---|
| `2026-04-13-spec-loop-derivability.md` | Map "Fully-Instrumented Specification Loop" against pi-project-workflows platonic ideal | analysis-doc |
| `2026-04-15-blocks-as-prompt-substrate.md` | Blocks as prompt substrate for pi-jit-agents — rendering gaps for new schemas | synthesis |
| `2026-04-15-expression-language-comparison.md` | Custom evaluator vs CEL adoption — comparative research | research |
| `2026-04-15-process-articulation.md` | Ten-phase unit-of-work lifecycle mapped to block substrate | synthesis |
| `2026-04-15-runtime-step-context.md` | Per-step prompt composition for 17 agent kinds | design-spec |
| `2026-04-25-pi-bypass-arc-fragilities.md` | F-001..F-018 catalog (sourced in §2.1 above) | fragility-catalog |
| `2026-04-27-canonical-loader-replaces-seedExamples.md` | Canonical pi-mono loader pattern replaces `seedExamples()` | design-spec |
| `2026-04-27-curation-recursion-termination-and-withering.md` | Curation recursion / withering thesis | synthesis |
| `2026-04-27-decomposition-methods-and-audit-as-scope-driver.md` | Scored/ranked decomposition; wiki-trap anti-pattern | analysis-doc |
| `2026-04-27-pi-session-jsonl-substrate-confirmation.md` | pi-mono session JSONL is already the substrate | analysis-doc |
| `2026-04-28-context-paths-extension-design.md` | Pi extension exposing claude-side context paths | design-spec |
| `2026-04-28-pi-mono-alignment-audit.md` | Bundled-content + runtime resource discovery vs pi-mono core | audit |
| `2026-05-01-blocks-schemas-macros-contract-synthesis.md` | Blocks/schemas/macros — contract direction synthesis | synthesis |
| `2026-05-01-ceremony-ideas.md` | Surface ceremony ideas — pre-design conversation note | ceremony-idea |
| `2026-05-01-substrate-arc-distillation.md` | Distillation of substrate-arc — Tier A/B/D findings (Tier A sourced in §2.2 above) | distillation |
| `corpus-index.jsonl` | JSONL index of project documentation | index |
| `gsd-2-derivability.md` | gsd-2 derivable from platonic pi-project-workflows | analysis-doc |
| `gsd-2-foundational-intelligence.md` | gsd-2 four-layer project onboarding pipeline | analysis-doc |
| `openrouter-pi-mono-setup.md` | OpenRouter API key + model selection for pi-mono / pi-ai | research |
| `pi-project-schema-conventions-audit.md` | Current `.project/` schema conventions + framework-gap inventory | audit |
| `research-blocks-design.md` | Design doc for `.project/research.json` block kind | design-spec |
| `The Fully-Instrumented Specification Loop.md` | Source document — spec-conformance verification loop pattern | synthesis (source) |

---

## 5. Total counts

| section | count |
|---|---|
| Issue candidates from `.project/issues.json` | 66 (65 issue-NNN + 1 fragility-NNN) |
| Issue candidates from `framework-gaps.json` | 6 |
| Issue candidates from `spec-reviews.json` (reviews) | 1 (REVIEW-001), 0 nested findings |
| Issue candidates from `features.json` | 1 feature + 9 stories + 33 tasks = 43 work-tracked items |
| Issue candidates from `tasks.json` | 0 (empty) |
| Issue candidates from `requirements.json` | 0 (empty) |
| Issue candidates from `verification.json` | 0 (empty) |
| Issue candidates from `audit.json` | 0 (file absent) |
| Issue candidates from `layer-plans.json` | 1 plan + 7 phases = 8 (phases ambiguous — see §6) |
| **Total block-derived issue candidates** | **125** (66 + 6 + 1 + 43 + 0+0+0+0 + 8 + 1 nested in §1.1) — fragility-mohud6vz already counted in 66 |
| Fragility candidates F-001..F-018 | 18 (5 already resolved in tree) |
| Fragility candidates F-019..F-025 | 7 (proposed Tier A) |
| **Total fragility candidates** | **25** |
| Documentation blocks (not candidates) | 8 |
| Analysis MDs (not candidates) | 22 |

---

## 6. Open ambiguities

| ambiguity | note |
|---|---|
| `layer-plans.json` PHASE-NNN entries — milestones or issues? | The 7 phases under PLAN-001 are framed as ordered exit-criteria gates with status (`complete`/`in-progress`/`pending`). They are work-tracked but milestone-shaped (each enables the next). Could map to GH milestones rather than issues, or could each become a tracking-issue. |
| FEAT-001 stories — epics or issues? | 9 stories carry their own status + dependency edges + nested tasks. Either: 1 epic-issue (FEAT-001) with sub-issues per story; OR each story = its own GH issue with task checklists. |
| `R-0001..R-0011` research entries | Marked NOT-candidate above as reference substrate, but each carries a `stale_conditions` field per `analysis/research-blocks-design.md` — staleness triggers could read as work. Currently no staleness engine exists (FGAP-007 absence). |
| Resolved issue/fragility entries | issues 001/012/013/014/015/018/019/024/025/026/027 (11) and F-002/F-008/F-011/F-014/F-015/F-018 (6) are already resolved. Migration may want them as closed-on-arrival, or may exclude them. |
| `fragility-fragility-mohud6vz` | Has no `title` field; description-only. ID is also doubly-prefixed. Schema/data anomaly. |
| Empty blocks (`tasks.json`, `requirements.json`, `verification.json`) | Schemas exist; no items written. May indicate the work tracker is currently centralized in `issues.json` + `features.json` and these blocks are awaiting future routing. |
| `audit.json` absence | Schema exists per CLAUDE.md but file not present. May or may not need scaffolding before migration. |
| Stories under FEAT-001 carry `tasks` arrays without explicit `findings` arrays elsewhere | `findings: []` exists at feature level; no story-level findings registry yet despite the architectural intent in PLAN-001. |
