---
name: pi-behavior-monitors
description: >
  Behavior monitors that watch agent activity and steer corrections when issues are detected.
  Monitors are JSON files (.monitor.json) in .pi/monitors/ with classify, patterns, actions,
  and scope blocks. Patterns and instructions are JSON arrays. Use when creating, editing,
  debugging, or understanding behavior monitors.
---

<objective>
Monitors are autonomous watchdogs that observe agent activity, classify it against a
JSON pattern library using a side-channel LLM call, and either steer corrections or
write structured findings to JSON files for downstream consumption.
</objective>

<monitor_locations>
Monitors are discovered from two locations, checked in order:

1. **Project**: `.pi/monitors/*.monitor.json` (walks up from cwd to find `.pi/`)
2. **Global**: `~/.pi/agent/monitors/*.monitor.json` (via `getAgentDir()`)

Project monitors take precedence — if a project monitor has the same `name` as a global
one, the global monitor is ignored. The extension silently exits if zero monitors are
discovered after checking both locations.
</monitor_locations>

<seeding>
On first run in a project, the extension seeds bundled example monitors into
`.pi/monitors/` if ALL of the following are true:

- `discoverMonitors()` finds zero monitors (neither project nor global)
- The `examples/` directory exists in the extension package
- The target `.pi/monitors/` directory contains no `.monitor.json` files

Seeding copies all `.json` files from `examples/` (monitor definitions, patterns, and
instructions files) into `.pi/monitors/`. It skips files that already exist at the
destination. The user is notified: "Edit or delete them to customize."

To customize seeded monitors, edit the copies in `.pi/monitors/` directly. To remove a
bundled monitor, delete its three files (`.monitor.json`, `.patterns.json`,
`.instructions.json`). Seeding never re-runs once any monitors exist.
</seeding>

<file_structure>
Each monitor is a triad of JSON files sharing a name prefix:

```
.pi/monitors/
├── fragility.monitor.json       # Monitor definition (classify + patterns + actions + scope)
├── fragility.patterns.json      # Known patterns (JSON array, grows automatically)
├── fragility.instructions.json  # User corrections (JSON array, optional)
```

The instructions file is optional. If omitted, the extension defaults the path to
`${name}.instructions.json` and treats a missing file as an empty array.
</file_structure>

<monitor_definition>
A `.monitor.json` file conforms to `schemas/monitor.schema.json`:

```json
{
  "name": "my-monitor",
  "description": "What this monitor watches for",
  "event": "message_end",
  "when": "has_tool_results",
  "scope": {
    "target": "main",
    "filter": { "agent_type": ["audit-fixer"] }
  },
  "classify": {
    "model": "claude-sonnet-4-20250514",
    "context": ["tool_results", "assistant_text"],
    "excludes": ["other-monitor"],
    "prompt": "Classification prompt with {tool_results} {assistant_text} {patterns} {instructions} placeholders.\n\nReply CLEAN, FLAG:<desc>, or NEW:<pattern>|<desc>."
  },
  "patterns": {
    "path": "my-monitor.patterns.json",
    "learn": true
  },
  "instructions": {
    "path": "my-monitor.instructions.json"
  },
  "actions": {
    "on_flag": {
      "steer": "Fix the issue.",
      "write": {
        "path": ".workflow/gaps.json",
        "merge": "append",
        "array_field": "gaps",
        "template": {
          "id": "monitor-{finding_id}",
          "description": "{description}",
          "status": "open",
          "category": "monitor",
          "source": "monitor"
        }
      }
    },
    "on_new": {
      "steer": "Fix the issue.",
      "learn_pattern": true,
      "write": { "...": "same as on_flag" }
    },
    "on_clean": null
  },
  "ceiling": 5,
  "escalate": "ask"
}
```
</monitor_definition>

<fields>

**Top-level fields:**

| Field | Default | Description |
|-------|---------|-------------|
| `name` | (required) | Monitor identifier. Must be unique across project and global. |
| `description` | `""` | Human-readable description. Also used as command description for `event: command` monitors. |
| `event` | `message_end` | When to fire: `message_end`, `turn_end`, `agent_end`, or `command`. |
| `when` | `always` | Activation condition (see below). |
| `ceiling` | `5` | Max consecutive steers before escalation. |
| `escalate` | `ask` | At ceiling: `ask` (confirm with user) or `dismiss` (silence for session). |

**Scope block:**

| Field | Default | Description |
|-------|---------|-------------|
| `scope.target` | `main` | What to observe: `main`, `subagent`, `all`, `workflow`. |
| `scope.filter.agent_type` | — | Only monitor agents with these names. |
| `scope.filter.step_name` | — | Glob pattern for workflow step names. |
| `scope.filter.workflow` | — | Glob pattern for workflow names. |

Steering (injecting messages into the conversation) only fires for `main` scope.
Non-main scopes can still write findings to JSON files.

**Classify block:**

| Field | Default | Description |
|-------|---------|-------------|
| `classify.model` | `claude-sonnet-4-20250514` | Model for classification. Plain model ID uses `anthropic` provider. Use `provider/model` for other providers. |
| `classify.context` | `["tool_results", "assistant_text"]` | Conversation parts to collect. |
| `classify.excludes` | `[]` | Monitor names — skip activation if any of these already steered this turn. |
| `classify.prompt` | (required) | Classification prompt template with `{placeholders}`. |

**Actions block** — per verdict (`on_flag`, `on_new`, `on_clean`):

| Field | Description |
|-------|-------------|
| `steer` | Message to inject into conversation. `null` = no steering. Only effective for `scope.target: "main"`. |
| `write.path` | JSON file to write findings to. Relative paths resolve from `process.cwd()`, not from the monitor directory. |
| `write.merge` | `append` (add to array) or `upsert` (update by matching `id` field). |
| `write.array_field` | Which field in target JSON holds the array (e.g. `"gaps"`, `"findings"`). |
| `write.template` | Template mapping with `{finding_id}`, `{description}`, `{severity}`, `{monitor_name}`, `{timestamp}`. |
| `write.schema` | Optional schema path for documentation. Not enforced at runtime. |
| `learn_pattern` | If true, add new pattern to patterns file on `new` verdict. |

`on_clean` can be configured with a `write` action to log clean verdicts. Setting it to
`null` means no action on clean (the default behavior).
</fields>

<when_conditions>
- `always` — fire every time the event occurs
- `has_tool_results` — fire only if tool results are present since last user message
- `has_file_writes` — fire only if `write` or `edit` tool was called since last user message
- `has_bash` — fire only if `bash` tool was called since last user message
- `tool(name)` — fire only if a specific named tool was called since last user message
- `every(N)` — fire every Nth activation within the same user prompt (counter resets when user text changes)
</when_conditions>

<context_collectors>
| Collector | Placeholder | What it collects | Limits |
|-----------|-------------|------------------|--------|
| `user_text` | `{user_text}` | Most recent user message text (walks back past assistant to find preceding user message) | — |
| `assistant_text` | `{assistant_text}` | Most recent assistant message text | — |
| `tool_results` | `{tool_results}` | Tool results with tool name and error status | Last 5, each truncated to 2000 chars |
| `tool_calls` | `{tool_calls}` | Tool calls and their results interleaved | Last 20, each truncated to 2000 chars |
| `custom_messages` | `{custom_messages}` | Custom extension messages since last user message | — |

Built-in placeholders (always available, not listed in `classify.context`):
- `{patterns}` — formatted from patterns JSON as numbered list: `1. [severity] description`
- `{instructions}` — formatted from instructions JSON as bulleted list with preamble "Operating instructions from the user (follow these strictly):" — empty string if no instructions
- `{iteration}` — current consecutive steer count (0-indexed)
</context_collectors>

<patterns_file>
JSON array conforming to `schemas/monitor-pattern.schema.json`:

```json
[
  {
    "id": "empty-catch",
    "description": "Silently catching exceptions with empty catch blocks",
    "severity": "error",
    "category": "error-handling",
    "examples": ["try { ... } catch {}"],
    "source": "bundled"
  },
  {
    "id": "learned-pattern-abc",
    "description": "Learned pattern from runtime detection",
    "severity": "warning",
    "source": "learned",
    "learned_at": "2026-03-15T02:30:00.000Z"
  }
]
```

| Field | Required | Description |
|-------|----------|-------------|
| `id` | yes | Stable identifier for dedup. Auto-generated for learned patterns: lowercased, non-alphanumeric replaced with hyphens, truncated to 60 chars. |
| `description` | yes | What this pattern detects. Used for dedup (exact match) when learning. |
| `severity` | no | `"error"`, `"warning"`, or `"info"`. Defaults to `"warning"` in prompt formatting. |
| `category` | no | Grouping key (e.g. `"error-handling"`, `"avoidance"`, `"deferral"`). |
| `examples` | no | Example manifestations. Stored but not surfaced in classification prompts. |
| `source` | no | `"bundled"`, `"learned"`, or `"user"`. Learned patterns are tagged `"learned"`. |
| `learned_at` | no | ISO timestamp for learned patterns. |

Patterns grow automatically when `learn_pattern: true` and a `NEW:` verdict is returned.
Dedup is by exact `description` match — duplicates are silently skipped.

**Critical**: If the patterns array is empty (file missing, empty array, or unparseable),
classification is skipped entirely for that activation. A monitor with no patterns does nothing.
</patterns_file>

<instructions_file>
JSON array of user rules (called "instructions" on disk, "rules" in the command surface):

```json
[
  { "text": "grep exit code 1 is not an error", "added_at": "2026-03-15T02:30:00.000Z" },
  { "text": "catch-and-log in event handlers is correct for non-critical extensions", "added_at": "2026-03-15T03:00:00.000Z" }
]
```

Manage via `/monitors <name> rules` (list), `/monitors <name> rules add <text>` (add),
`/monitors <name> rules remove <n>` (remove by number), `/monitors <name> rules replace <n> <text>`
(replace by number). The LLM can also edit the `.instructions.json` file directly.

Rules are injected into the classification prompt under a preamble
"Operating instructions from the user (follow these strictly):" — only if the array is
non-empty. An empty array or missing file produces no rules block in the prompt.
</instructions_file>

<verdict_format>
The classification LLM must respond with one of:

- `CLEAN` — no issue detected. Resets consecutive steer counter to 0.
- `FLAG:<description>` — known pattern matched. Triggers `on_flag` action.
- `NEW:<pattern>|<description>` — novel issue. The text before `|` becomes the learned pattern description; the text after `|` becomes the finding description. If no `|` is present, the full text after `NEW:` is used for both. Triggers `on_new` action.

Any response that does not start with `CLEAN`, `FLAG:`, or `NEW:` is treated as `CLEAN`.

Classification calls use `maxTokens: 150`.
</verdict_format>

<runtime_behavior>

**Dedup**: A monitor will not re-classify the same user text. Once a user message has been
classified, the monitor skips until the user text changes. This prevents redundant
side-channel LLM calls within the same user turn.

**Ceiling and escalation**: After `ceiling` consecutive steers (flag/new verdicts without
an intervening clean), the monitor escalates. With `escalate: "ask"`, the user is prompted
to continue or dismiss. With `escalate: "dismiss"`, the monitor is silently dismissed for
the session. A `CLEAN` verdict resets the consecutive steer counter.

**Turn exclusion**: The `excludes` array prevents double-steering. If monitor A steers in
a turn, and monitor B has `"excludes": ["A"]`, monitor B skips that turn. Exclusion tracking
resets at `turn_start`.

**Buffered steer delivery**: Monitors on `message_end` or `turn_end` buffer their steer
messages and deliver them at `agent_end`. This is because pi's async event queue processes
extension handlers after the agent loop has already checked for steering messages. The
buffer is drained at `agent_end` — only the first buffered steer fires per agent run; the
corrected response re-triggers monitors naturally for any remaining issues. Monitors on
`agent_end` or `command` events deliver steers immediately (they already run post-loop).

**Abort**: Classification calls are aborted when the agent ends (via `agent_end` event).
Aborted classifications produce no verdict and no action.

**Write action**: Relative `write.path` values resolve from `process.cwd()`, not from the
monitor directory. Parent directories are created automatically. If the target file doesn't
exist or is unparseable, a fresh object is created. The `upsert` merge strategy matches on
the `id` field of array entries.
</runtime_behavior>

<commands>
All monitor management is through the `/monitors` command. Subcommands are
discoverable via pi's TUI autocomplete — typing `/monitors ` shows available
monitor names and global commands; selecting a monitor shows its verbs.

| Command | Description |
|---------|-------------|
| `/monitors` | List all monitors with global on/off state and per-monitor status |
| `/monitors on` | Enable all monitoring (session default) |
| `/monitors off` | Pause all monitoring for this session |
| `/monitors <name>` | Inspect a monitor: description, event, state, rule count, pattern count |
| `/monitors <name> rules` | List current rules (numbered) |
| `/monitors <name> rules add <text>` | Add a rule to calibrate the classifier |
| `/monitors <name> rules remove <n>` | Remove a rule by number |
| `/monitors <name> rules replace <n> <text>` | Replace a rule by number |
| `/monitors <name> patterns` | List current patterns (numbered, with severity and source) |
| `/monitors <name> dismiss` | Dismiss a monitor for this session |
| `/monitors <name> reset` | Reset a monitor's state and un-dismiss it |

Monitors with `event: "command"` also register `/<name>` as a programmatic trigger
for other extensions or workflows to invoke classification directly.
</commands>

<bundled_monitors>
Three example monitors ship in `examples/` and are seeded on first run:

**fragility** (`message_end`, `when: has_tool_results`)
Watches for unaddressed fragilities after tool use — errors, warnings, or broken state the
agent noticed but chose not to fix. Steers with "Fix the issue you left behind." Writes
findings to `.workflow/gaps.json` under `category: "fragility"`. Excludes: none. Ceiling: 5.
12 bundled patterns across categories: avoidance (dismiss-preexisting, not-my-change,
blame-environment, workaround-over-root-cause, elaborate-workaround-for-fixable),
error-handling (empty-catch, happy-path-only, early-return-on-unexpected,
undocumented-delegation, silent-fallback), deferral (todo-instead-of-fix,
prose-without-action).

**hedge** (`turn_end`, `when: always`)
Detects when the assistant deviates from what the user actually said — substituting
questions, projecting intent, or deflecting instead of answering. Steers with "Address
what the user actually said." Does not write to files (steer-only). Excludes: `["fragility"]`
(skips if fragility already steered this turn). Ceiling: 3.
8 bundled patterns across categories: substitution (rephrase-question, reinterpret-words),
projection (assume-intent, attribute-position), augmentation (add-questions),
deflection (ask-permission, qualify-yesno, counter-question).

**work-quality** (`command`, `when: always`)
On-demand work quality analysis invoked via `/work-quality`. Analyzes user request, tool
calls, and assistant response for quality issues. Writes findings to `.workflow/gaps.json`
under `category: "work-quality"`. Ceiling: 3.
11 bundled patterns across categories: methodology (trial-and-error, symptom-fix,
double-edit, edit-without-read, insanity-retry, no-plan), verification (no-verify),
scope (excessive-changes, wrong-problem), quality (copy-paste), cleanup (debug-artifacts).
</bundled_monitors>

<disabling_monitors>
**Session-level** (temporary):
- `/monitors off` — pauses all monitoring for the current session
- `/monitors <name> dismiss` — silences a single monitor for the session
- `/monitors <name> reset` — un-dismisses and resets a monitor's state

**Permanent**:
- Delete its `.monitor.json` file (and optionally its `.patterns.json` and `.instructions.json`)
- Or empty its patterns array — a monitor with zero patterns skips classification entirely
- To disable all monitoring: remove all `.monitor.json` files from `.pi/monitors/` and
  `~/.pi/agent/monitors/`. The extension exits silently when zero monitors are discovered.

Monitors also auto-silence at their ceiling. With `escalate: "ask"`, the user is prompted
to continue or dismiss. With `escalate: "dismiss"`, the monitor silences automatically.
</disabling_monitors>

<example_creating>
1. Create `.pi/monitors/naming.monitor.json`:

```json
{
  "name": "naming",
  "description": "Detects poor naming choices in code changes",
  "event": "turn_end",
  "when": "has_file_writes",
  "scope": { "target": "main" },
  "classify": {
    "model": "claude-sonnet-4-20250514",
    "context": ["tool_calls"],
    "excludes": [],
    "prompt": "An agent made code changes. Check if any new identifiers have poor names.\n\nActions taken:\n{tool_calls}\n\n{instructions}\n\nNaming patterns to check:\n{patterns}\n\nReply CLEAN if all names are clear.\nReply FLAG:<description> if a known naming pattern matched.\nReply NEW:<pattern>|<description> if a naming issue not covered by existing patterns."
  },
  "patterns": { "path": "naming.patterns.json", "learn": true },
  "instructions": { "path": "naming.instructions.json" },
  "actions": {
    "on_flag": { "steer": "Rename the poorly named identifier." },
    "on_new": { "steer": "Rename the poorly named identifier.", "learn_pattern": true },
    "on_clean": null
  },
  "ceiling": 3,
  "escalate": "ask"
}
```

2. Create `.pi/monitors/naming.patterns.json`:

```json
[
  { "id": "single-letter", "description": "Single-letter variable names outside of loop counters", "severity": "warning", "source": "bundled" },
  { "id": "generic-names", "description": "Generic names like data, info, result, value, temp without context", "severity": "warning", "source": "bundled" },
  { "id": "bool-not-question", "description": "Boolean variables not phrased as questions (is, has, can, should)", "severity": "info", "source": "bundled" }
]
```

3. Create `.pi/monitors/naming.instructions.json`:

```json
[]
```
</example_creating>

<success_criteria>
- Monitor `.monitor.json` validates against `schemas/monitor.schema.json`
- Patterns `.patterns.json` validates against `schemas/monitor-pattern.schema.json`
- Patterns array is non-empty (empty patterns = monitor does nothing)
- Classification prompt includes `{patterns}` placeholder and verdict format instructions (CLEAN/FLAG/NEW)
- Actions specify `steer` for `scope.target: "main"` monitors, `write` for findings output
- `write.path` is set relative to project cwd, not monitor directory
- `excludes` lists monitors that should not double-steer in the same turn
- Instructions file exists (even if empty `[]`) to enable `/monitors <name> rules add <text>` calibration
</success_criteria>
