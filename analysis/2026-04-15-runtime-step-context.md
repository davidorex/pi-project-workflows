# Per-step prompt composition — what each agent needs and what it does not

Date: 2026-04-15
Status: runtime-step context articulation, follow-on to the blocks-as-prompt-substrate zoom-out

A prompt to an agent is one step in a runtime. Each step has a narrow role and produces a specific artifact. Each step's prompt should contain exactly the context needed to produce that artifact. Over-context inflates tokens, introduces instruction-following confusion, and weakens fresh-context adversarial reviews. Under-context leaves the agent guessing.

---

## Context classes

| Class | Source | How injected |
|---|---|---|
| **Ambient** | L5 memory (mandates), framework delimiters, output-format instructions | System prompt (every agent gets these) |
| **Block-item injected** | One entry from a block (FEAT-001, DEC-0001, R-0008) | `contextBlocks` with `name + item + focus + depth` |
| **Block-whole injected** | Whole block (conventions.json, patterns library) | `contextBlocks` with `name` only |
| **Collector-populated** | Session data (user_text, tool_calls, conversation_history) | Monitor collectors populate template context |
| **Tool-access granted** | Ability to read files, run commands, call APIs | Dispatch context `tools` field, not prompt content |

Five distinct channels. Each agent role uses a specific subset.

---

## Ambient context — every agent gets

- The nine mandates (L5 memory, injected into system prompt)
- Framework-level anti-injection delimiters wrapping all block-injected content
- Output format contract (plain text / JSON / tool call via phantom tool)
- The agent's own role statement (from the agent spec's `role` field)

No agent gets less than this. No agent needs more than this at the ambient level.

---

## Process agents — the ten-phase lifecycle

### 1. Intention-capture agent

**Produces**: feature / story / task draft with acceptance criteria

**Context needed**:

- `project.json` (whole, depth=0) — charter, constraints, scope
- `conventions.json` (whole, depth=0) — coding standards
- `domain.json` (whole, depth=0) — glossary
- `features.json` (whole, depth=0, items as IDs+titles only) — to avoid duplication, find related features
- User's request text

**Tool access**: none (produces a draft, does not execute)

**Explicitly excluded**: existing decisions, research entries, other features' internals, verification records, framework gaps, plans, tasks, reviews. The intention is new — decisions, research, and plans all come after.

### 2. Research agent

**Produces**: research entry with `findings_summary`, `citations`, `grounding`, `stale_conditions`

**Context needed**:

- The research question (from task spawning it)
- Method declaration (code-inspection / empirical-test / web-fetch / etc.)
- `research.json` (whole, depth=0, items as IDs+titles only) — to avoid duplication and link to related research

**Tool access**: Bash, Grep, Read, WebFetch, Glob (the tools required to actually do the investigation)

**Explicitly excluded**: features, decisions, reviews, framework gaps, conventions, domain. Research grounds downstream artifacts — it does not itself consume them. Exception: when the research is revising an existing decision's grounding, then that specific decision (depth=1) is input.

### 3. Spec-drafting (decision-record) agent

**Produces**: decision record with `context`, `options_considered`, `decision`, `consequences`

**Context needed**:

- The question being decided (from spawning task)
- Research entries grounding the decision (depth=1 — `findings_summary` inlined, citations as references)
- Related prior decisions that this might supersede (depth=0 — IDs + titles + status)
- `project.json` (depth=0) — constraints bounding the decision
- `architecture.json` (depth=0) — existing structure to not violate

**Tool access**: none (produces a draft)

**Explicitly excluded**: features, plans, tasks, implementation details, monitor configurations. Spec drafting happens before plans exist.

### 4. Spec-review agent (fresh-context adversarial)

**Produces**: review findings against a decision record or spec doc

**Context needed**:

- The target item (depth=2 — full decision + inlined research grounding + inlined options_considered)
- The review scope and method (from the spec-review entry's `scope` and `method` fields)
- `project.json` (depth=0) — to evaluate relevance to project goals
- `conventions.json` (depth=0) — to check against standards
- Existing findings already on this review target (depth=0 — to avoid redundant findings)

**Tool access**: Read (for reading the target if it is a file), Grep (for checking claims against the codebase)

**Explicitly excluded**: prior conversation, implementation hints, "this is the right answer" framing, related features, plans, tasks, other unrelated decisions. The whole value of this agent is independent adversarial critique — its prompt must carry no opinion about the target except the target itself and the scope to evaluate it against. **Fresh context is structural, not optional.**

### 5. Plan-drafting agent

**Produces**: story / task decomposition under a feature

**Context needed**:

- The decision being implemented (depth=1 — full decision + inlined consequences; research NOT inlined because the consequences field distills it)
- The feature this plan belongs to (depth=1 — feature description, motivation, acceptance criteria, but NOT other stories)
- `architecture.json` (depth=0) — module map, file paths, boundaries
- `conventions.json` (depth=0)
- Existing stories in the same feature (depth=0 — titles + dependencies only)

**Tool access**: Read, Grep, Glob (to verify file paths and find related code)

**Explicitly excluded**: research details (consequences section distills them), other features, completed tasks in unrelated work, monitor configurations, reviews.

### 6. Plan-review agent (fresh-context adversarial)

**Produces**: findings against the story/task decomposition

**Context needed**:

- The plan target (depth=2 — full feature + stories + tasks + dependencies + acceptance_criteria)
- The decisions gating the feature (depth=1)
- `architecture.json` (depth=0)
- `conventions.json` (depth=0)
- `project.json` (depth=0)

**Tool access**: Read, Grep (to verify plan claims against code)

**Explicitly excluded**: implementation details (implementation has not happened yet), other features, monitor configs, session state from other work. Same fresh-context requirement as spec-review.

### 7. Implementation agent

**Produces**: code changes (commits)

**Context needed**:

- The specific task (depth=0 — single task entry with files[], acceptance, depends_on)
- The story it belongs to (depth=0 — title + acceptance_criteria only)
- The feature (depth=0 — title + description only)
- The decisions gating the task (depth=1 — full decisions + inlined consequences)
- `conventions.json` (depth=0)
- `architecture.json` (depth=0)
- Relevant file contents (via Read tool on demand, not contextBlocks injection)

**Tool access**: Read, Edit, Write, Bash, Grep, Glob

**Explicitly excluded**: other tasks in other features, other decisions not gating this task, research details (consequences distilled them), reviews of other work, postmortems, monitor patterns, verification records. Implementation agents drown in wide context — focused scope produces focused code.

### 8. Implementation-review agent (fresh-context adversarial)

**Produces**: findings against committed code

**Context needed**:

- The task that was implemented (depth=0)
- The story acceptance criteria (depth=0)
- The decisions gating the task (depth=1 — full consequences section)
- The commit range (via `git diff` / `git log`, not contextBlocks)
- `conventions.json` (depth=0) — style standards
- Existing findings already raised on the same task (depth=0 — to avoid redundancy)

**Tool access**: Read, Grep, Bash (for running `git` commands)

**Explicitly excluded**: other features, plan review history, research details, monitor patterns, other tasks. Fresh context against the committed diff and the specific task is the whole role.

### 9. Verification agent

**Produces**: verification record for one acceptance criterion

**Context needed**:

- The specific acceptance criterion (single string, NOT the whole feature)
- The verification method declared for that criterion (unit-test / integration-test / manual / empirical)
- The task's `files` list (to know what to verify)
- The relevant test files / runbook / observation method

**Tool access**: Bash (to run tests or observations), Read (to inspect state)

**Explicitly excluded**: the whole feature context, other acceptance criteria, decisions, research, implementation history. Verification is narrow by design — one criterion, one pass/fail, one record.

### 10. Learning-capture agent

**Produces**: feedback memory entries / postmortem entries

**Context needed**:

- The incident/failure description (from user input or postmortem template)
- Existing feedback memory entries (depth=0 — to find duplicates and related rules)
- The session/task/commit that triggered the incident (depth=0 — context for the rule's `applies_to` field)

**Tool access**: none (distillation, not execution)

**Explicitly excluded**: features, decisions, research, architecture, conventions. Learning capture is post-hoc rule distillation from an incident — it does not need forward-looking project context.

---

## Monitor classify agents — runtime step at `turn_end` or `message_end`

All five current classifiers (hedge, fragility, work-quality, commit-hygiene, unauthorized-action) share the same dispatch shape: they are agents whose output is a phantom-tool verdict (CLEAN / FLAG / NEW). Their context differs.

### 11. Hedge classifier

**Produces**: verdict on whether the assistant deviated from what the user said

**Context needed**:

- Collector-populated: `user_text`, `assistant_text`, `tool_calls`, `tool_results`, `custom_messages`, `conversation_history`
- Pattern library (from `hedge.patterns.json`, block-whole injection)
- Instructions (from `hedge.instructions.json`, block-whole injection)
- Iteration grace partial (shared template fragment)
- `json_output: true` flag (template context)

**Tool access**: phantom `VERDICT_TOOL` via forced `toolChoice`

**Explicitly excluded**: project state, features, decisions, research, framework gaps, conventions, architecture, other monitor patterns. Classifiers are narrow — they compare session data to a pattern library and emit a verdict. Project state would pollute the signal.

### 12. Fragility classifier

**Produces**: verdict on whether the agent left broken state behind

**Context needed**:

- Collector-populated: `assistant_text`, `tool_calls`, `tool_results`
- Fragility patterns + instructions (block-whole)

**Tool access**: phantom `VERDICT_TOOL`

**Explicitly excluded**: `conversation_history` (too noisy for this signal), project features, decisions, research.

### 13. Work-quality classifier

**Produces**: verdict on whether the work was done well

**Context needed**:

- Collector-populated: `user_text`, `assistant_text`, `tool_calls`, `tool_results`
- Work-quality patterns + instructions (block-whole)
- **Gap**: the current task's acceptance criteria (if the classifier is task-scoped) — not currently wired, but this is the obvious enhancement once FEAT-001's L3 work nesting lands natively

**Tool access**: phantom `VERDICT_TOOL`

**Explicitly excluded**: deep project state, other features, unrelated decisions.

### 14. Commit-hygiene classifier

**Produces**: verdict on whether the pending commit message is well-formed

**Context needed**:

- The pending commit message (from the `git commit` pipeline)
- Recent commit history (via git collector, depth=0 — last 5 commits)
- Commit-hygiene patterns + instructions

**Tool access**: phantom `VERDICT_TOOL`

**Explicitly excluded**: code diff (commit message is the focus, not the changes), project state, features, decisions. Commit-hygiene is a message-shape check, not a code review.

### 15. Unauthorized-action classifier

**Produces**: verdict on whether the agent acted without user authorization

**Context needed**:

- Collector-populated: `user_text` (to know what was actually authorized) + `assistant_text` + `tool_calls` (to know what was done)
- The nine mandates (ambient, already in system prompt)
- Unauthorized-action patterns + instructions

**Tool access**: phantom `VERDICT_TOOL`

**Explicitly excluded**: project state, features, decisions, research. The classifier compares user intent to agent action — that is a narrow two-variable check.

---

## Query / introspection agents

### 16. Status summarizer

**Produces**: conversation-facing summary of current project state

**Context needed**:

- `project.json` (depth=0)
- The currently-active feature (depth=0 — feature title + status + blocked_on fields only)
- Derived counts: open issues, open gaps, reviews in progress, tasks todo/in-progress/done (via materialized view — pending FGAP-003)
- Recent commits (last 5, via git collector)

**Tool access**: Read (to check files if needed), Bash (for `git log`)

**Explicitly excluded**: full contents of any feature, decision, or review; full issue or gap lists; full research history. Summaries describe shape, not content. Per-item rendering is never invoked by this agent.

### 17. Triage agent

**Produces**: clustered and prioritized findings (either new or re-triaging existing ones)

**Context needed**:

- The findings to triage (depth=0 — finding IDs, descriptions, severity, scope)
- Existing findings in the same scope (depth=0 — to find duplicates and natural clusters)
- `conventions.json` (depth=0) — severity rubric, category definitions

**Tool access**: none (classification and grouping, not execution)

**Explicitly excluded**: full feature context, decisions, research, implementation details. Triage is a grouping operation over findings — extra context dilutes the clustering.

---

## The minimal-context principle

The pattern repeated across all seventeen roles:

- **Work-scoped context** (the specific item being worked on) is always present, always depth=0 for the primary item and depth=1 for items it directly depends on
- **Role-scoped context** (what the agent's role requires at all times) is always present at depth=0 (references resolved as IDs only)
- **Ambient context** (mandates, framework delimiters, output format) is always present
- **Everything else is excluded**

The minimum is the agent spec's declared `contextBlocks` list plus the ambient system prompt. Nothing else gets through.

---

## What this vindicates in the prior zoom-out

Every shortcoming surfaced in `analysis/2026-04-15-blocks-as-prompt-substrate.md` is load-bearing for this articulation:

1. **Per-item macros** are the only way to inject a single item without polluting the prompt with whole-block content. Every process agent above that requires "depth=1" on a decision or feature requires per-item rendering. Seventeen of seventeen agent kinds require per-item rendering somewhere.

2. **`contextBlocks` item-level selectivity** is the only way to express "FEAT-001 focused on STORY-001 + TASK-001-02" — which is the exact shape an implementation agent needs. Every process agent from plan-drafting onward requires item-level selectivity.

3. **Rendering depth control** is the difference between inlining a related decision's consequences (depth=1) and emitting just its ID (depth=0). Every cross-reference in every agent's context requires an explicit depth choice.

4. **Per-field token budget hints** are the only way to know in advance whether a composed prompt fits the agent's context window. A plan-drafting prompt that injects FEAT-001 (depth=1) + DEC-0001/0002/0003 (depth=1) + architecture.json + conventions.json + project.json needs a budget computation upfront.

5. **Rendering-chain traversal subsystem** is what executes depth=1 on related_decisions or related_findings — it walks the edge and invokes the target item's per-item macro. Without it, depth control is a declaration the renderer cannot fulfill.

6. **Bidirectional schema contract** is why the same schema that injects a decision into spec-drafting-agent's context also validates the output of spec-drafting-agent's new decision. One schema, three contracts.

---

## What this surfaces as new process refinements

1. **Agent spec must declare `contextBlocks` with item-level selectivity, depth, and focus** — the current block-name-only shape is insufficient for 17 of 17 agent kinds. Schema extension to agent spec is a prerequisite for every other step.

2. **Collectors must be first-class in pi-jit-agents**, not pi-behavior-monitors-only. Process agents (research, verification) need collectors for session state (task context, commit range, current file). Today collectors live inside the monitor extension. The concept belongs at the jit-agents boundary.

3. **Exclusion must be explicit in the agent spec** — an agent spec should declare not just what it needs but what it refuses. `context_excludes: [research, reviews]` on an implementation agent's spec is load-bearing, because it guarantees the dispatch pipeline doesn't accidentally inject something noisy. This is new — no current agent spec has an exclusion field.

4. **Ambient context composition must be declarative** — today the nine mandates are prepended to every session as prose. Under the block substrate, they should be an L5 block injected into every agent's system prompt via an ambient contextBlocks declaration. Currently happens by convention, not by mechanism.

5. **Per-agent-role token budgets should be pre-computed** — before dispatch, compute the sum of budget hints from every field the contextBlocks declaration injects. If the sum exceeds the agent's model context window minus output budget, fail before dispatch with a clear error naming the over-budget blocks. This is the `x-prompt-budget` metadata being used as a dispatch-time validator.

---

## Summary table — context shape per agent role

Compact view. `I` = item-injected (depth=0). `I+` = item-injected (depth=1). `W` = whole-block injected. `C` = collector-populated. `T` = tool access. `—` = excluded.

| Agent | project | conventions | architecture | domain | decisions | features | reviews | research | findings | gaps | patterns | session | tools |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Intention-capture | W | W | — | W | — | W (titles) | — | — | — | — | — | — | — |
| Research | — | — | — | — | — | — | — | W (titles) | — | — | — | — | Read/Grep/WebFetch/Bash |
| Spec-drafting | W | — | W | — | I (related) | — | — | I+ (grounding) | — | — | — | — | — |
| Spec-review | W | W | — | — | I+ (target at depth=2) | — | I (target) | — | I (existing on target) | — | — | — | Read/Grep |
| Plan-drafting | — | W | W | — | I+ (gating) | I+ (parent) | — | — | — | — | — | — | Read/Grep/Glob |
| Plan-review | W | W | W | — | I+ (gating) | I+ (target at depth=2) | — | — | I (existing on target) | — | — | — | Read/Grep |
| Implementation | — | W | W | — | I+ (gating) | I (parent — titles only) | — | — | — | — | — | — | Read/Edit/Write/Bash/Grep/Glob |
| Impl-review | — | W | — | — | I+ (gating) | I (parent — titles only) | — | — | I (existing on task) | — | — | — | Read/Grep/Bash |
| Verification | — | — | — | — | — | — | — | — | — | — | — | — | Bash/Read |
| Learning-capture | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Hedge classify | — | — | — | — | — | — | — | — | — | — | W | C | VERDICT_TOOL |
| Fragility classify | — | — | — | — | — | — | — | — | — | — | W | C (subset) | VERDICT_TOOL |
| Work-quality classify | — | — | — | — | — | — | — | — | — | — | W | C | VERDICT_TOOL |
| Commit-hygiene classify | — | — | — | — | — | — | — | — | — | — | W | C (commit msg + git log) | VERDICT_TOOL |
| Unauthorized-action classify | — | — | — | — | — | — | — | — | — | — | W | C | VERDICT_TOOL |
| Status summarizer | W | — | — | — | — | I (active only) | — | — | — | — | — | — | Read/Bash |
| Triage | — | W | — | — | — | — | — | — | I (existing in scope) | — | — | — | — |

Every column that does not appear in a row is explicitly excluded — the agent spec for that role must either not list it in `contextBlocks` or must list it in `context_excludes` once that field exists.

---

## Consequence for agent spec evolution

The current agent spec surface supports:

- `name`, `role`, `description`, `model`, `thinking`
- `output.format`, `output.schema`
- `prompt.task.template`
- `inputSchema`
- `contextBlocks: string[]` (block names only)

The minimum viable agent spec for this runtime articulation requires additions:

- `contextBlocks: (string | { name, item?, focus?, depth? })[]` — item-level selectivity
- `context_excludes: string[]` — explicit refusal list for safety
- `tool_access: string[]` — declared tool capabilities (already partially supported)
- `budget: { max_tokens, max_prompt_tokens }` — budget declaration for pre-dispatch validation

Schema evolution to the agent spec itself is a prerequisite for enacting this runtime articulation. The agent spec is authored in pi-jit-agents per the spec's §2 boundary contract. The change is at the `parseAgentYaml` / `AgentSpec` type / `compileAgent` surface, not at the consumer packages.
