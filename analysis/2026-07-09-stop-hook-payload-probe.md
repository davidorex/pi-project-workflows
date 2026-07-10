# Stop Hook Payload Probe — Empirical Capture

Date: 2026-07-09
Claude Code version: **2.1.205 (Claude Code)** (`claude --version`)
Scratch dir (left intact, evidence inspectable): `/private/tmp/claude-501/-Users-david-Projects-workflowsPiExtension/8d078a22-702b-4a14-a127-757ca040c0e2/scratchpad/stop-probe`
Captured payloads: `<scratch>/stop-payloads.jsonl` (3 lines)

Isolation held: nothing under `/Users/david/Projects/workflowsPiExtension/.claude/` or `/.pi/` was created, modified, or read for writing. All hook wiring lives in the scratch dir's own `.claude/`.

## Setup

- `git init -q` inside scratch dir.
- `<scratch>/.claude/settings.json` registered a single `Stop` hook. Shape that WORKED (no `matcher` key, group is just `{"hooks":[...]}`):

```json
{
  "hooks": {
    "Stop": [
      { "hooks": [ { "type": "command", "command": "<scratch>/.claude/hooks/probe.sh", "timeout": 30 } ] }
    ]
  }
}
```

- `<scratch>/.claude/hooks/probe.sh` (chmod +x): `input=$(cat); printf '%s\n' "$input" >> <scratch>/stop-payloads.jsonl; exit 0`.

The hook fired on the very first run — no trust prompt, no `--settings` flag, no extra flags needed in headless `-p` mode. Project-local `.claude/settings.json` is honored directly.

## What I ran (exact commands + exit codes + stdout)

All run with cwd = scratch dir.

1. `claude -p "Reply with exactly the word: banana"` — exit **0**, stdout: `banana`. (First run emitted a benign `Warning: no stdin data received in 3s` because I did not redirect stdin; subsequent runs used `< /dev/null`.) → appended 1 line (total 1).
2. `claude -p "Reply with exactly the word: banana" < /dev/null` — exit **0**, stdout: `banana`. → appended 1 line (total 2).
3. `claude -p "Run the bash command 'echo hello' and then tell me what it printed." --allowedTools Bash < /dev/null` — exit **0**, stdout: `It printed \`hello\`.` → appended **1** line (total 3).

Tool-permit flag established from `claude --help`: **`--allowedTools, --allowed-tools <tools...>`** (comma/space-separated tool names, e.g. `--allowedTools Bash`). The tool call executed (final answer references the echoed `hello`), confirming a real tool round-trip occurred within run 3.

## Top-level keys present in the Stop payload (identical across all 3 lines)

Complete sorted union of top-level keys observed across all captured payloads:

```
background_tasks
cwd
effort
hook_event_name
last_assistant_message
permission_mode
prompt_id
session_crons
session_id
stop_hook_active
transcript_path
```

Full payload (banana run 1), string fields truncated to 200 chars, nothing structural redacted:

```json
{
  "session_id": "2094f889-0901-4a33-b331-bffcea7b8a37",
  "transcript_path": "/Users/david/.claude/projects/-private-tmp-claude-501--Users-david-Projects-workflowsPiExtension-8d078a22-702b-4a14-a127-757ca040c0e2-scratchpad-stop-probe/2094f889-0901-4a33-b331-bffcea7b8a37.jsonl",
  "cwd": "/private/tmp/claude-501/-Users-david-Projects-workflowsPiExtension/8d078a22-702b-4a14-a127-757ca040c0e2/scratchpad/stop-probe",
  "prompt_id": "b28022b4-dce4-46e6-adbb-e5aba555adcc",
  "permission_mode": "acceptEdits",
  "effort": { "level": "high" },
  "hook_event_name": "Stop",
  "stop_hook_active": false,
  "last_assistant_message": "banana",
  "background_tasks": [],
  "session_crons": []
}
```

## Q1 — `last_assistant_message`

**Exists.** Exact spelling/casing: `last_assistant_message` (snake_case). Value is a plain **STRING** (Python `str`), not an object/array.

- Banana run 1: `"last_assistant_message": "banana"`
- Banana run 2: `"last_assistant_message": "banana"`
- Tool run: `"last_assistant_message": "It printed \`hello\`."`

It holds the final assistant text of the turn (the tool run's value is the post-tool final answer, not tool output).

## Q2 — `prompt_id` (and `session_id`) across invocations

**Both keys exist.** Exact spellings: `prompt_id`, `session_id`. Both are UUID strings.

| run | session_id | prompt_id |
|-----|-----------|-----------|
| banana 1 | `2094f889-0901-4a33-b331-bffcea7b8a37` | `b28022b4-dce4-46e6-adbb-e5aba555adcc` |
| banana 2 | `3629e92d-d429-4d69-8cbd-1a9207972317` | `c0612e2a-062a-42a1-9a00-13070cc20ccb` |
| tool run | `fda34591-4f32-4f2b-9e38-1c6076d37d38` | `2da8c21f-d03c-43bf-a2ec-cdd665aaa63a` |

Between the two separate `claude -p` banana invocations, **BOTH `session_id` AND `prompt_id` differ.**

Interpretation for a guard keyed on `session_id`+`prompt_id` (stated honestly with the caveat this probe can/can't support):
- Each headless `claude -p` invocation is its OWN session (fresh `session_id`) AND carries a distinct `prompt_id`. So across separate `-p` calls the compound key resets on BOTH components.
- `prompt_id` is unique per user prompt/turn. In a persistent interactive session (multiple turns, one stable `session_id`), `prompt_id` is the component that changes per turn, so a `session_id`+`prompt_id` key **would reset per user turn**. CAVEAT: I did not observe two turns sharing one `session_id`, because each `-p` invocation spawns a new session — I cannot from this capture directly prove `session_id` stability across turns within one interactive session; the per-turn-uniqueness of `prompt_id` is what is directly observed (3 distinct values for 3 turns).

## Q3 — Does `Stop` fire once per turn, or also on tool-call pauses?

**Once per turn — end-of-turn only.** Observed count for the single tool-calling invocation (run 3, which executed a real Bash tool call before answering): **exactly 1** appended line. Line counts: 1 after run 1, 2 after run 2, 3 after run 3. The tool round-trip did NOT produce an extra `Stop`. `last_assistant_message` on that single fire was the final post-tool answer `"It printed \`hello\`."`, not the tool invocation or its output.

Observed count: **1** Stop fire per invocation, including the tool-using turn.

## Q4 — `stop_hook_active` / re-entry detection

**Present.** Key exists verbatim as `stop_hook_active`, value **`false`** (boolean) in all 3 payloads. Despite not being documented for the installed version, it IS emitted. It signals hook re-entry (would be `true` when the Stop hook itself caused continuation), and was `false` here since none of these runs re-entered.

No other re-entry-suggesting key appears. Full sorted top-level key set (see list above) is the complete surface.

## Blockers

None. The hook fired on first attempt in headless mode; all four questions answered from real captured JSON.
