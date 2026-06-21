# Reconciliation & coverage demonstration

Project key (confirmed exact, from `claude-history` `projects` table):
`/Users/david/Projects/wasc-school-wide-improvement-plan`
(display_name `wasc-school-wide-improvement-plan`, `session_count` = 4).

Database: `~/.claude/.claude-history.db` (5.05 GB), queried directly via `sqlite3`
(the MCP `execute_sql` passthrough has a 5-second timeout that aborts large
aggregations; identical SQL run through `sqlite3` returns the same numbers).

## Scope decision (stated, not silently narrowed)

The named key resolves to **exactly 4 sessions** whose `project_path` is the key
string. The `projects` table also lists *separate* project keys that are
sub-paths of the same physical directory tree but are distinct `project_path`
values, NOT this key:

| project_path | session_count |
|---|---|
| `…/wasc-school-wide-improvement-plan` (THE key) | 4 |
| `…/web`, `…/web/drafts`, `…/school-improvement-plans`, `…/prompt-workshop`, `…/prompt-workshop/dispatch` | 0 each |
| `…/.claude/worktrees/wizardly-bose-1f49b1` | 1 |
| `…/.claude/worktrees/mystifying-poitras-5e8bf6` | 1 |
| `…/.claude/worktrees/naughty-perlman-3cd64b` | 1 |
| `…/.claude/worktrees/agent-ae1e36b358f121c8d`, `…/agent-a2659bc07e2a04983` | 0 each |

This record covers **the named key (4 sessions)**. The three worktree sessions
(`79b83e54`, `b6e27a2d`, `1b17261e`; 152 + 137 + 0 = 289 tool calls, 2 Agent
calls total) are under DIFFERENT project keys and are therefore out of the named
key's scope. They are listed here so their existence is not silently dropped;
they are not folded into the totals below. (Inside the 4 in-scope sessions,
worktree *branches* appear as `git_branch` values on sidechain work — those ARE
covered, because they belong to sessions under the named key.)

## The four in-scope sessions

| short | session_id | first_seen (UTC) | span (first→last message) | version | messages | tool calls | Agent dispatches |
|---|---|---|---|---|---|---|---|
| d7310007 | d7310007-aef3-4e05-a651-d218d1cfd12f | 2026-05-14T22:00:21Z | 2026-05-14T22:00:21 → 2026-06-14T01:40:08 | 2.1.139 | 85650 | 29865 | 599 |
| 8c933c8b | 8c933c8b-770a-4c3b-b6b7-7be63588f244 | 2026-06-14T01:48:39Z | 2026-06-14T01:48:39 → 2026-06-15T09:41:15 | 2.1.166 | 2758 | 812 | 25 |
| bd501b6f | bd501b6f-4d77-4c99-ab21-3b1f5e497c5a | 2026-06-15T09:41:48Z | 2026-06-15T09:41:48 → 2026-06-20T02:42:16 | 2.1.177 | 7656 | 2438 | 78 |
| 6e98b2bc | 6e98b2bc-7540-47e7-be51-97919a8cb9f2 | 2026-06-20T02:42:48Z | 2026-06-20T02:42:48 → 2026-06-21T10:47:16 | 2.1.178 | 10684 | 3632 | 86 |
| **TOTAL** | | | 2026-05-14 → 2026-06-21 | | **106752** | **36747** | **788** |

The four sessions are contiguous (each begins within ~9 minutes of the prior
one's last message), i.e. this is one continuous line of work split across four
session files.

## Totals (reconciled four independent ways)

- **Sessions: 4**
- **Messages: 106752** (includes sidechain / subagent-internal messages)
- **Tool calls: 36747**
- **Agent (subagent) dispatches: 788**

### Tool-call reconciliation — four counts that must agree, and do

| method | count |
|---|---|
| `COUNT(*)` of `tool_executions` joined to the 4 sessions | 36747 |
| `COUNT(*)` of `message_content` rows with `block_type='tool_use'` in the 4 sessions | 36747 |
| Sum of the extractor's per-tool histogram | 36747 |
| Lines actually written across the four `*-tool-calls.ndjson` files | 36747 |

A two-way EXCEPT check confirmed the `tool_executions` set and the
`message_content` tool_use-block set are in perfect 1:1 correspondence — **zero
rows in either table lack a partner in the other** (no dropped, no orphan, no
duplicate). Per-session line counts: 29865 + 812 + 2438 + 3632 = 36747.

### Agent-dispatch reconciliation

| method | count |
|---|---|
| `COUNT(*)` where `tool_name='Agent'` over the 4 sessions | 788 |
| Extractor's Agent counter | 788 |
| Lines written across the four `*-agent-dispatches.ndjson` files | 788 |

Per-session: 599 + 25 + 78 + 86 = 788. Every one of the 788 dispatch records
carries verbatim `input` (full `description` + `prompt` + any of
`subagent_type` / `model` / `run_in_background` / `isolation` / `subject`) AND
the agent's verbatim return in `result_content` (present on all 788).

`run_query`/`extract.py` ends with `assert tool_calls_match and
agent_calls_match` — the run printed `RECONCILED OK`, so the assertions held.

### Main-thread vs sidechain split of the 36747 tool calls

- Main thread (orchestrator's own calls, `is_sidechain=0`): **9222**
- Sidechain (subagent-internal calls, `is_sidechain=1`): **27525**
- 9222 + 27525 = 36747.

This split is itself a finding: ~75% of all tool activity happened *inside
dispatched subagents*, not in the orchestrator thread.

## Faithfulness of the extraction

- Each tool call is emitted as one NDJSON line with: `seq` (chronological,
  ordered by `timestamp`, then `block_index`, then `tool_executions.id`, then
  `message_uuid`), `session`, `timestamp`, `is_sidechain`, `agent_id`,
  `msg_type`, `message_uuid`, `block_index`, `tool_use_id`, `tool_name`,
  `is_error`, and `input` (the verbatim parsed `input_json`). If a row's
  `input_json` is null/non-JSON it is preserved raw under `_raw_input_json`
  (none occurred in this dataset; every row parsed).
- Values are reproduced as stored. The only transform is JSON parse →
  re-serialize (UTF-8, `ensure_ascii=false`), which preserves every string
  byte-for-byte; no truncation, normalization, paraphrase, or cleanup.
- No grouping/category/schema was imposed on the data files beyond the columns
  the database itself carries.

## How to read the record

```
# every tool call, in order, for the largest session:
jq -c 'select(.tool_name=="Bash") | .input.command' per-session/d7310007-tool-calls.ndjson

# every subagent dispatch with its prompt and return:
jq -c '{seq, type:.input.subagent_type, model:.input.model, desc:.input.description}' \
   per-session/d7310007-agent-dispatches.ndjson

# machine-readable totals + per-session/per-tool histograms:
cat summary.json
```
