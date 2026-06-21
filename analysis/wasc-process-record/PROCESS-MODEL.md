# How the process is used — records-grounded model

Scope: the 4 sessions of claude-history project key
`/Users/david/Projects/wasc-school-wide-improvement-plan`
(d7310007, 8c933c8b, bd501b6f, 6e98b2bc), 2026-05-14 → 2026-06-21.
Every statement below is derived from the recorded `tool_executions` /
`message_content` / `messages` rows; the verbatim record is in
`per-session/*.ndjson` and the machine totals in `summary.json`. Counts are the
reconciled figures from `RECONCILIATION.md`. Where the records do not contain
something, that is stated rather than inferred.

## 1. Shape of the activity (totals)

- 4 sessions, contiguous in time (each starts within ~9 min of the prior's last
  message): one continuous line of work split across four session files.
- 106752 messages; 36747 tool calls; 788 Agent (subagent) dispatches.
- Tool calls split **9222 main-thread / 27525 sidechain** — ~75% of all tool
  activity occurred *inside dispatched subagents*, not the orchestrator thread.

## 2. The tool vocabulary actually exercised (grand histogram, all 36747)

| tool | calls | tool | calls |
|---|---|---|---|
| Bash | 18785 | TaskUpdate | 157 |
| Read | 9173 | StructuredOutput | 127 |
| Edit | 4490 | TaskCreate | 67 |
| Write | 1619 | AskUserQuestion | 46 |
| Agent | 788 | mcp…search_messages | 38 |
| WebFetch | 320 | Grep | 33 |
| WebSearch | 270 | Glob | 22 |
| ToolSearch | 219 | SendMessage | 11 |
| mcp__claude-history__execute_sql | 182 | Skill | 10 |
| ExitPlanMode | 168 | TaskList | 9 |
| EnterPlanMode | 162 | Workflow | 5 |

Long tail (each ≤8): `mcp__claude-history__file_history` (8), `bash` lowercase
(5), `mcp__claude-history__list_sessions` (5), `PushNotification` (5),
`TaskStop` (3), `mcp__claude-history__query_messages` (3),
`mcp__claude-history__get_stats` (2), `mcp__claude-history__list_queries` (2),
`mcp__claude_ai_Context7__resolve_library_id` (2), `CronCreate` (2),
`CronDelete` (2), `search_messages` (2), `TaskOutput` (1), `file_history` (1),
`mcp__claude-history__get_plan` (1), `mcp__claude-history__git_log` (1),
`Monitor` (1). Full per-session and per-thread (main/sidechain) histograms are
in `summary.json`.

Observations grounded in the histogram:
- The work is overwhelmingly **filesystem + shell**: Bash + Read + Edit + Write
  = 34067 of 36747 calls (92.7%).
- `EnterPlanMode` (162) / `ExitPlanMode` (168) are heavily used — plan-mode is a
  routine step of the loop, not a rarity.
- The `Task*` family (TaskCreate 67, TaskUpdate 157, TaskList 9, TaskStop 3,
  TaskOutput 1 = 237) and `SendMessage` (11) indicate the FleetView background-
  task / inter-agent-message surface was in active use, distinct from `Agent`
  one-shot dispatch.
- `claude-history` MCP tools were themselves called 243 times (sum of all
  `mcp__claude-history__*` + bare `search_messages`/`file_history`) — the
  process audits its OWN prior sessions as part of running (see §5).

## 3. Subagent dispatch (`Agent`) — how delegation is used

788 dispatches. Verbatim `input` keys present across them:
`description` 788, `prompt` 788, `subagent_type` 702, `model` 106,
`run_in_background` 2, `isolation` 2, `subject` 31. (86 dispatches carry no
`subagent_type` → default.)

### subagent_type distribution (all 788)

| subagent_type | count |
|---|---|
| general-purpose | 416 |
| Explore | 224 |
| (none / default) | 86 |
| claude | 31 |
| Plan | 9 |
| context-currency-auditor | 7 |
| feature-dev:code-architect | 6 |
| audit-slash-command | 3 |
| claude-code-guide | 2 |
| audit-subagent | 2 |
| method-hoard:search | 1 |
| feature-dev:code-explorer | 1 |

So delegation is dominated by `general-purpose` (executing/writing work) and
`Explore` (read-only search/trace) — together 640 of 788 (81%). The remaining
types are specialized auditors/architects/planners used sparingly.

### model pin on dispatch

`model` was specified on 106 of 788 dispatches: `opus` 100, `sonnet` 6; the
other 682 left it unspecified (inherit). `run_in_background:true` on 2;
`isolation` (worktree/remote) on 2; `subject` field on 31.

### Per-session evolution of the dispatch mix (records, not narrative)

- **d7310007** (599 dispatches): general-purpose 343, Explore 166, default 74,
  Plan 7, feature-dev:code-architect 6, code-explorer 1, method-hoard:search 1,
  claude-code-guide 1. — the bulk decompose/build/verify phase.
- **8c933c8b** (25): general-purpose 12, context-currency-auditor 5, Explore 3,
  audit-slash-command 3, audit-subagent 2. — a tooling/audit-heavy session.
- **bd501b6f** (78): general-purpose 42, Explore 22, default 12, Plan 2.
- **6e98b2bc** (86): Explore 33, claude 31, general-purpose 19,
  context-currency-auditor 2, claude-code-guide 1. — the only session using the
  `claude` catch-all type (31×), alongside heavy Explore.

Every dispatch's full verbatim prompt + the agent's verbatim `result_content`
return is in `per-session/<short>-agent-dispatches.ndjson` (788 records,
result_content present on all 788).

## 4. Workflow / Monitor — the pi-workflows orchestration surface in use

The project under work is itself a pi-workflows consumer; the records show the
`Workflow` tool invoked **5 times** and `Monitor` **once**, verbatim inputs
captured in the ndjson. Two distinct invocation shapes appear:

- **Named workflow + args** (2): `deep-research` (6e98b2bc, seq 315) and
  `canonical-pipeline` (d7310007, seq 12891) — invoking a pre-registered
  workflow by `name` with a free-text `args` brief.
- **Inline `script`** (3, all in d7310007, seq 15480, 15481, 19529) — full
  ESM workflow scripts passed inline, using the pi-workflows authoring API:
  `export const meta = {name, description, phases}`, then `phase(...)`,
  `parallel([...])`, `pipeline(sources, writerFn, verifierFn)`, and
  `agent(prompt, {label, phase, schema, agentType})` with explicit JSON
  `schema` (StructuredOutput) and `agentType: 'general-purpose'`. Two of the
  three are successive revisions of the same `decompose-remaining-md` workflow
  (pipeline form → deterministic `parallel` fan form); the third is
  `evaluate-workshopping-workflow-spec` (4 parallel evaluator lenses →
  synthesis agent). `Monitor` (6e98b2bc) was called once with `{bashId:…}`.

This is the load-bearing detail for modeling: when the process needs structured
fan-out with gating, it does not hand-dispatch N `Agent` calls — it authors a
pi-workflow script whose `agent()`/`parallel()`/`pipeline()` calls carry the
schema and the adversarial-verify phase inline.

## 5. Skills invoked (`Skill`, 10 calls)

`create-pi-extension` 2; and 1 each of `create-subagents`,
`audit-context-currency`, `deep-research`, `frontend-design`, `create-hook`,
`update-config`, `create-hooks`, `claude-api`. (Note both `create-hook` and
`create-hooks`, and `deep-research` appears both as a Skill and as a named
Workflow.)

## 6. Errors observed during the run (`is_error=1`)

1349 of 36747 tool calls (3.7%) recorded `is_error=1`. By tool: Bash 710,
Read 254, Edit 149, mcp…execute_sql 51, Write 49, Agent 26, WebFetch 22,
AskUserQuestion 21, Grep 21, ExitPlanMode 13, SendMessage 11, StructuredOutput
7, bash 5, then ≤2 each (search_messages, Context7 resolve, WebSearch,
file_history, Monitor, Workflow, Glob). 26 of the 788 Agent dispatches
themselves returned an error result. These are the raw recorded error flags;
the records carry the error result text in each tool's `result_content` (and in
the ndjson `is_error` field) but assign no cause — root-causing is not in the
data and is not asserted here.

## 7. Git branches touched within the in-scope sessions

The `messages.git_branch` column shows the work fanned across many short-lived
branches inside the sessions (a `seam`/`trio`-per-feature pattern), e.g. in
6e98b2bc: `main`, `seed-leader-head-accountability`, `verify-gated-dev-loop`,
and 16 `trio-*` branches (`trio-a1-title`, `trio-command`,
`trio-draftstate-store`, `trio-finalize`, `trio-gate-closure`,
`trio-per-spec-loop`, `trio-resilience`, `trio-save-draft`, `trio-save-plan`,
`trio-seam-b2-fold`, `trio-seam-form-fold`, `trio-seam-formset-fold`,
`trio-seam-g1-fold`, `trio-seam-multisection-fold`, `trio-seam-stepchild-fold`,
`trio-validator-provider`); bd501b6f spans `main`, `distill-t6-draft`,
`language-polish-pass`, `render-bilingual-display`, `run-skill-prompt-workshop`,
`run-skills-context`; d7310007 spans `main`, `pi-context-update-trial`,
`worktree-agent-ae1e36b358f121c8d`. (8c933c8b stayed on `main`.) Per-branch
message counts are in the extraction output; this confirms a one-branch-per-unit
working style within single sessions.

## 8. What is NOT in the record (stated, not filled)

- The records carry no separate "reasoning/intent" field tying a tool call to a
  goal; assistant `text` blocks adjacent in time exist in `message_content` but
  are not joined into the tool-call record here (they were not requested as part
  of the verbatim tool/agent extraction, and inferring intent from them would be
  invention).
- `result_summary`/`old_content` provenance exists in `file_operations` for
  Edit/Write but the canonical verbatim call input is taken from
  `tool_executions.input_json` (the actual tool call), which is what was
  requested.
- The three worktree sessions under sibling project keys are out of the named
  key's scope (see RECONCILIATION.md); they are not counted in any total above.
