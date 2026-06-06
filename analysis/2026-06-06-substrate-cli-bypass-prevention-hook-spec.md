# Implementation Spec: Substrate CLI-Bypass Prevention Hook

**Date:** 2026-06-06
**Status:** Spec — not installed, not committed. Self-contained build prompt.
**Skill grounded against:** `/Users/david/Projects/dot-claude/skills/create-hooks/` (`SKILL.md` + all `references/*.md`), updated to current Anthropic docs (settings.json config model; exit-code 0/2/other contract; `PreToolUse` `hookSpecificOutput.permissionDecision` allow/deny/ask; current input schemas).

A coder can implement and install the hook from this document with no further research. It contains the full script, the full `settings.json` fragment, the detection rules, the test matrix, and a citation back to the create-hooks skill for every design decision.

---

## 1. What this prevents

The recurring discipline violation (verbatim):

> "I read `.context/relations.json` with `node -e require(...)` — bypassing the CLI, which the direct-drive rule explicitly forbids — and I also guessed its shape wrong (`r.relations` is undefined, so `.filter` blew up). The substrate reads must go through the CLI op, not a raw require."

The rule (project `CLAUDE.md` → "pi-context-cli — direct-drive discipline" + "Project Blocks" + "Do Not Touch"): substrate and schema state must be inspected/mutated **only** through the reflecting `pi-context-cli` (`node packages/pi-context-cli/dist/bin.js <op>` or `pi-context <op>`). Bypassing the CLI to read or mutate the active substrate's `*.json` / `schemas/*.json` by other means is forbidden — `node -e`/`tsx -e` `require`/`readFileSync` of `.context*/**.json`; `cat`/`head`/`tail`/`sed`/`awk`/`jq` on those files; direct redirection writes (`> .context/...json`); and `Read`/`Edit`/`Write` tool calls targeting the active substrate's JSON.

The hook is a **deterministic guardrail** that fires before the bypassing tool call runs and denies it with a message that names the violation and steers to the correct `pi-context <op>`. Per the skill's security guidance, this is a steering layer, not an airtight boundary (see §7).

---

## 2. Design decisions (each cited to the skill)

| Decision | Choice | Skill citation |
|----------|--------|----------------|
| **Event** | `PreToolUse` | SKILL.md `<hook_events>`: PreToolUse is the only event that fires *before* a tool call and can cancel it ("Before a tool call executes" / block via `permissionDecision: "deny"` or exit 2). `PostToolUse` is too late — "the tool already ran" (hook-types.md `## PostToolUse`). |
| **Matcher(s)** | Two groups: `"Bash"` and `"Read\|Edit\|Write"` | matchers.md "Evaluation rules": matcher with only letters/digits/`_`/`\|` is an **exact string or `\|`-separated exact list**. `Bash` matches only `Bash`; `Read\|Edit\|Write` matches those three exactly. (Word-char names are exact — `Write` would NOT catch `TodoWrite`, which is correct here: TodoWrite never touches substrate files.) matchers.md "What the matcher filters": for `PreToolUse` the matcher filters on **tool name**. |
| **Handler type** | `command` (bash + jq) | command-vs-prompt.md decision tree: "Deterministic rule (pattern match, file check) → command". The classification is pure pattern-matching on `tool_input`; no model judgment needed. SKILL.md `<handler_types>`: command is "the default and most common type", fast and free. |
| **Invocation form** | Exec form (`"args": []`) referencing `$CLAUDE_PROJECT_DIR` | SKILL.md `<security>`: "Prefer **exec form** (`"args": [...]`) for any hook that references a path placeholder — each arg is passed literally with no shell tokenization." command-vs-prompt.md "Exec form vs shell form": prefer exec form whenever the command references a path placeholder. |
| **Decision mechanism** | JSON `hookSpecificOutput.permissionDecision: "deny"` + `permissionDecisionReason` on exit 0 | input-output-schemas.md `## PreToolUse` + hook-types.md `## PreToolUse`: the **current** PreToolUse contract is `permissionDecision`. Both files flag the legacy `decision: "approve"\|"block"` shape as "**no longer the PreToolUse contract**". `deny` cancels the call and feeds `permissionDecisionReason` back to Claude; it "runs before permission-mode checks, so it blocks even under `bypassPermissions`". Exit 2 + stderr is the documented alternative but the JSON form is the canonical current mechanism and lets us emit a clean, structured reason. (We do NOT mix exit 2 with JSON — input-output-schemas.md: "JSON on stdout is ignored when you exit 2".) |
| **Allow path** | Exit 0 with no JSON (default proceed) | input-output-schemas.md exit-code table: exit `0` = "No objection; action proceeds." For a non-violating call the script simply exits 0 silently. |
| **Settings file** | `.claude/settings.json` (project-scoped, committed) | SKILL.md `<quick_start>` step 1: "Project (committed): `.claude/settings.json`". The rule is a project discipline that should travel with the repo. (`.claude/settings.local.json` already exists for personal permissions; the hook belongs in the committed file so every checkout enforces it.) |
| **Script location** | `$CLAUDE_PROJECT_DIR/.claude/hooks/block-substrate-cli-bypass.sh` | examples.md "Project-specific hooks": "Keep scripts versioned with the project and reference them via `$CLAUDE_PROJECT_DIR`". SKILL.md `<security>`: "Use absolute paths via `$CLAUDE_PROJECT_DIR`". |
| **Timeout** | `5` seconds | input-output-schemas.md "Timeouts": command default is 600s; this is pure string-matching with no I/O, so a tight 5s timeout bounds any pathological case without ever truncating real work. |
| **Loop guard** | none needed | PreToolUse has no Stop-loop semantics (the `stop_hook_active` guard in troubleshooting.md applies only to `Stop`/`SubagentStop`). |

### Why two matcher groups, one shared script

matchers.md "Multiple groups and multiple handlers": you can register multiple matcher groups for one event; all matching hooks run in parallel; "the most restrictive decision wins (`deny` > `ask` > `allow`)." Both groups invoke the **same** script. The script branches on `tool_name`: the `Bash` branch inspects `tool_input.command`; the `Read`/`Edit`/`Write` branch inspects `tool_input.file_path`. One script keeps the detection logic in a single place and is deduplicated cleanly (identical `command`/`args` are deduped — SKILL.md `<context>`).

---

## 3. Detection logic

The active substrate dir is whatever `.pi-context.json` `contextDir` names (currently `.context`). Substrates are the `.context*` family (`.context`, `.context-jit-spec-v2`, …), each with top-level `*.json` block files, a `schemas/*.json` dir, and `relations.json`. The hook matches the **whole `.context*` family** (not just the active one) so a bypass against any substrate dir is caught — reading a non-active substrate's raw JSON is equally forbidden.

### 3.1 Substrate-path recognizer (shared)

A path string targets substrate/schema state when, after stripping a leading `./` and an optional absolute project-dir prefix, it matches:

```
(^|/)\.context[A-Za-z0-9._-]*/.*\.json$
```

- `\.context` then any run of `[A-Za-z0-9._-]` (covers `.context`, `.context-jit-spec-v2`, future `.context-*`).
- followed by `/`… and ending in `.json` (covers both top-level block files like `.context/relations.json` and `schemas/*.json` like `.context/schemas/tasks.schema.json` — `schemas/` is under the `.context*/.../...json` tail).

This is the single regex both branches reuse (call it `SUBSTRATE_JSON_RE`).

### 3.2 Bash branch (`tool_name == "Bash"`)

Input field: `tool_input.command` (input-output-schemas.md "Tool-specific tool_input fields": Bash → `command`).

**Step 1 — ALLOW-FIRST carve-out (check before any block test).** If the command invokes the CLI itself, allow unconditionally even though the command string contains a `.context*` path:

- contains `pi-context ` (the installed CLI shim per FGAP-031), OR
- contains `packages/pi-context-cli/dist/bin.js` (the direct node invocation form).

Rationale: `CLAUDE.md` makes the CLI the **only** sanctioned reader/writer; its own argv legitimately names substrate dirs (`--cwd .context`, op flags). Allowing any command that routes through the CLI is correct by construction and eliminates the largest false-positive class. (CLAUDE.md "direct-drive discipline": the CLI *is* the dogfooding surface.)

**Step 2 — `npx tsx -e` library-fn carve-out.** `CLAUDE.md` ("Project Blocks", `feedback_tsx_eval_for_deterministic_state`) explicitly permits `npx tsx -e` for **library functions that have no CLI op** (e.g. `flipBootstrapPointer`). These are imports from `@davidorex/pi-context/*` subpaths — they do NOT `require`/`readFileSync` a substrate JSON file directly. Carve-out rule: if the command is an `npx tsx -e` / `tsx -e` invocation AND its body does **not** contain a literal `.context*/…json` path inside a `require(`/`readFileSync(`/`readFile(`/`import(` call, allow it. The narrow, blockable case is a `tsx -e`/`node -e` whose eval body reads a substrate file by path (the exact violation that occurred). See Step 3.

**Step 3 — BLOCK tests.** Block when, after the carve-outs above, the command matches **any** of:

| # | Pattern (case-sensitive substring/regex on `command`) | Catches |
|---|--------------------------------------------------------|---------|
| B1 | `node` or `tsx` invoked with `-e`/`--eval`/`-p`/`--print` AND the eval body contains a `.context*` JSON path inside `require(`, `readFileSync(`, `readFile(`, `import(`, or `createRequire` | the verbatim `node -e "require('./.context/relations.json')"` |
| B2 | a file-reader/text utility — `cat`, `head`, `tail`, `sed`, `awk`, `jq`, `less`, `more`, `xxd`, `od`, `nl`, `grep`/`rg`/`fgrep`/`egrep` used to print/extract content — whose argument list contains a token matching `SUBSTRATE_JSON_RE` | `cat .context/decisions.json`; `jq '.tasks' .context/tasks.json` |
| B3 | a redirection write whose target matches `SUBSTRATE_JSON_RE`: `>`, `>>`, `tee`, or `cp`/`mv`/`install`/`dd of=` with a `.context*…json` destination | `echo '{}' > .context/phase.json` |
| B4 | a Python/Ruby/Perl one-liner (`python -c`, `python3 -c`, `ruby -e`, `perl -e`) whose body contains a `.context*` JSON path passed to an open/read/load call | scripted bypass via another interpreter |

Detection is over the literal command string. **False-positive note (mention-vs-read):** a command that merely names a substrate path inside an *argument to the CLI* is already allowed by Step 1; a command that names the path only as a string literal NOT passed to a reader (e.g. `echo .context/tasks.json`) does not match B1–B4 because the path is not inside a read/redirect construct — `echo` is not in the B2 utility list and there is no redirection into the file. This is acceptable: `echo`-ing a path is not a substrate read.

### 3.3 Read/Edit/Write branch (`tool_name ∈ {Read, Edit, Write}`)

Input field: `tool_input.file_path` (input-output-schemas.md: Read → `file_path`; Write → `file_path`; Edit → `file_path`).

Block when `file_path` matches `SUBSTRATE_JSON_RE`. There is no carve-out here — `Read`/`Edit`/`Write` on a substrate `*.json`/`schemas/*.json` is never sanctioned (CLAUDE.md: "Direct `Edit`/`Write` on the active substrate's `*.json` is forbidden"; reads must go through CLI read ops). `tmp/` scratch and non-substrate JSON never match the regex, so they pass.

### 3.4 The CLI's own internal fs reads are not in scope

The hook only sees **Claude's tool calls** (Bash/Read/Edit/Write `tool_input`). When the `pi-context` CLI runs and internally `readFileSync`s `.context/relations.json`, that is inside the already-allowed Bash process (Step 1 allowed the whole `pi-context …` command) — the hook fires once, on the outer Bash call, and allows it. The CLI's internal fs is never a separate tool call, so it is never independently evaluated. (No false positive possible there.)

---

## 4. The full hook script

Path: `$CLAUDE_PROJECT_DIR/.claude/hooks/block-substrate-cli-bypass.sh`
Make executable: `chmod +x .claude/hooks/block-substrate-cli-bypass.sh` (troubleshooting.md "Not running at all").

```bash
#!/usr/bin/env bash
# block-substrate-cli-bypass.sh
# PreToolUse hook. Denies tool calls that read/mutate pi-context substrate or
# schema JSON by any means OTHER than the reflecting pi-context CLI.
# Enforces CLAUDE.md "pi-context-cli — direct-drive discipline".
# Decision mechanism: PreToolUse hookSpecificOutput.permissionDecision="deny"
# on exit 0 (the current contract; the legacy decision:"block" is retired).
set -euo pipefail

input=$(cat)

tool_name=$(printf '%s' "$input" | jq -r '.tool_name // empty')

# Regex matching any .context* substrate/schema JSON path (active or not).
# After stripping a leading ./ this matches both top-level block files and
# schemas/*.json (schemas/ falls under the .context*/.../...json tail).
SUBSTRATE_JSON_RE='(^|/)\.context[A-Za-z0-9._-]*/.*\.json$'
# Looser variant for scanning a token *inside* a larger command string
# (no end-anchor, the token may be followed by quotes/parens/whitespace).
SUBSTRATE_JSON_IN_CMD='\.context[A-Za-z0-9._-]*/[A-Za-z0-9._/-]*\.json'

deny() {
  # $1 = reason string. Emit the current PreToolUse deny contract and exit 0.
  jq -nc --arg r "$1" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $r
    }
  }'
  exit 0
}

allow() { exit 0; }   # silent proceed (input-output-schemas.md: exit 0 = no objection)

STEER='Substrate/schema JSON must be read or mutated ONLY through the reflecting pi-context CLI (CLAUDE.md "pi-context-cli — direct-drive discipline"). Do not read it with node/tsx -e require/readFileSync, cat/head/tail/sed/awk/jq, or Read/Edit/Write. Use a CLI op instead: `pi-context read-block --block <name>` (whole block) or `read-block-item` / `read-block-page` for items; relations are read via `pi-context find-references --id <id>`, `walk-ancestors`, `context-walk-descendants`, `context-edges-for-lens`, or `context-validate-relations` — relations.json has NO single read-relations op and is NOT shaped `{relations:[...]}`. Writes go through append-block-item / update-block-item / append-relation etc. (See `node packages/pi-context-cli/dist/bin.js --help`.)'

case "$tool_name" in
  Bash)
    command=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')
    [ -z "$command" ] && allow

    # --- Step 1: ALLOW-FIRST — the CLI itself is the sanctioned surface ---
    if printf '%s' "$command" | grep -qE 'pi-context[[:space:]]' \
       || printf '%s' "$command" | grep -qF 'packages/pi-context-cli/dist/bin.js'; then
      allow
    fi

    # --- Step 2: npx tsx -e library-fn carve-out ---
    # tsx -e is permitted for library fns with NO CLI op (e.g. flipBootstrapPointer),
    # which import @davidorex/pi-context/* — NOT raw-read a .context* JSON path.
    # Only block a tsx/node eval when its body reads a substrate file by path (Step 3 B1).
    is_eval=false
    if printf '%s' "$command" | grep -qE '(^|[[:space:]])(node|npx[[:space:]]+tsx|tsx)([[:space:]].*)?[[:space:]]-(e|p|-eval|-print)([[:space:]]|=)'; then
      is_eval=true
    fi

    # --- Step 3: BLOCK tests ---

    # B1: node/tsx eval whose body reads a substrate JSON path
    if [ "$is_eval" = true ]; then
      if printf '%s' "$command" | grep -qE "(require|readFileSync|readFile|import|createRequire)[^;]*${SUBSTRATE_JSON_IN_CMD}"; then
        deny "Raw require/readFileSync of substrate JSON via node/tsx -e. $STEER"
      fi
    fi

    # B4: other interpreters reading a substrate JSON path inline
    if printf '%s' "$command" | grep -qE '(python3?|ruby|perl)[[:space:]]+-(e|c)'; then
      if printf '%s' "$command" | grep -qE "${SUBSTRATE_JSON_IN_CMD}"; then
        deny "Inline interpreter read of substrate JSON. $STEER"
      fi
    fi

    # B2: file-reader/text utility printing or extracting a substrate JSON file
    if printf '%s' "$command" | grep -qE '(^|[[:space:]]|[|;&(])(cat|head|tail|sed|awk|jq|less|more|xxd|od|nl|grep|rg|egrep|fgrep)([[:space:]])'; then
      if printf '%s' "$command" | grep -qE "${SUBSTRATE_JSON_IN_CMD}"; then
        deny "Reading substrate JSON with a shell text utility (cat/head/tail/sed/awk/jq/grep/…). $STEER"
      fi
    fi

    # B3: redirection / copy WRITE targeting a substrate JSON path
    if printf '%s' "$command" | grep -qE ">>?[[:space:]]*['\"]?${SUBSTRATE_JSON_IN_CMD}"; then
      deny "Redirection write into substrate JSON. $STEER"
    fi
    if printf '%s' "$command" | grep -qE '(^|[[:space:]]|[|;&(])(tee|cp|mv|install)[[:space:]]'; then
      if printf '%s' "$command" | grep -qE "${SUBSTRATE_JSON_IN_CMD}"; then
        deny "Copy/move/tee write into substrate JSON. $STEER"
      fi
    fi
    if printf '%s' "$command" | grep -qE "dd[[:space:]].*of=['\"]?${SUBSTRATE_JSON_IN_CMD}"; then
      deny "dd write into substrate JSON. $STEER"
    fi

    allow
    ;;

  Read|Edit|Write)
    file_path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')
    [ -z "$file_path" ] && allow
    # Strip a leading project-dir prefix and ./ so the anchored regex applies to
    # both absolute and relative paths.
    rel="${file_path#"$CLAUDE_PROJECT_DIR"/}"
    rel="${rel#./}"
    if printf '%s' "$rel" | grep -qE "$SUBSTRATE_JSON_RE"; then
      deny "$tool_name on substrate/schema JSON ($file_path) is forbidden. $STEER"
    fi
    allow
    ;;

  *)
    allow
    ;;
esac
```

**Notes on the script**
- `set -euo pipefail` with `grep -q` is safe: `grep -q` returns non-zero on no-match, which under `set -e` would abort — but each `grep` is inside an `if`/`||` test, where a non-zero exit is consumed by the conditional and does NOT trip `set -e`. (Bash exempts commands in `if`/`while`/`&&`/`||`/`!` from `errexit`.)
- All output is a single JSON object on stdout (the deny contract) **or** nothing (allow). We never write to stderr and never exit 2 — we use the JSON `permissionDecision` form exclusively, so there is no exit-2/JSON mixing (input-output-schemas.md "Don't mix exit 2 with JSON").
- `jq -nc` builds the JSON safely with `--arg` so the steering text (which contains backticks, quotes, parentheses) is correctly escaped.
- Guard against a profile-`echo` corrupting stdout: this is an **exec-form** hook (see §5), so no login shell sources a profile before it. (SKILL.md `<security>` / troubleshooting.md "JSON validation failed".) Even so, the script itself emits nothing but the jq JSON.

---

## 5. The full settings.json fragment

Add to the **project-committed** `/Users/david/Projects/workflowsPiExtension/.claude/settings.json` (create the file if absent; it currently does not exist — only `.claude/settings.local.json` does). If `.claude/settings.json` already has a `hooks` block, merge the two `PreToolUse` groups into the existing `PreToolUse` array rather than replacing it.

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/block-substrate-cli-bypass.sh",
            "args": [],
            "timeout": 5
          }
        ]
      },
      {
        "matcher": "Read|Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/block-substrate-cli-bypass.sh",
            "args": [],
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

- `"args": []` switches the handler to **exec form** — the script is spawned directly with no shell, so `$CLAUDE_PROJECT_DIR` in `command` is resolved by Claude Code's placeholder substitution (not by a shell), and there is zero shell-quoting risk (command-vs-prompt.md "Exec form vs shell form"; SKILL.md `<security>`). The `$CLAUDE_PROJECT_DIR` placeholder is documented as usable in `command` and is also exported as an env var to the hook process (SKILL.md `<environment>`), which is why the script can also reference `$CLAUDE_PROJECT_DIR` internally for the prefix-strip.
- Two matcher groups, one event, same script — matchers.md "Multiple groups and multiple handlers".
- Validate after editing: `jq . .claude/settings.json` (SKILL.md `<security>`: trailing commas / comments are not allowed).

### Install steps (for the implementer)

```bash
mkdir -p .claude/hooks
# write block-substrate-cli-bypass.sh (§4) to .claude/hooks/
chmod +x .claude/hooks/block-substrate-cli-bypass.sh
# create/merge .claude/settings.json (§5)
jq . .claude/settings.json            # validate JSON
# verify it loaded:
#   run /hooks in Claude Code → confirm both PreToolUse groups appear (troubleshooting.md)
```

---

## 6. Test matrix

Each case is run in isolation against the script (troubleshooting.md "Isolate the script"):

```bash
echo '<INPUT_JSON>' | .claude/hooks/block-substrate-cli-bypass.sh; echo "exit=$?"
```

`CLAUDE_PROJECT_DIR` must be exported for the Read/Edit/Write cases (the install env exports it; in a manual test do `export CLAUDE_PROJECT_DIR=/Users/david/Projects/workflowsPiExtension`).

**Expected outcome legend:** BLOCK = stdout is a JSON object with `permissionDecision: "deny"`, exit 0. PASS = no stdout, exit 0.

### Must BLOCK

| # | Input JSON (stdin) | Expected |
|---|--------------------|----------|
| K1 | `{"tool_name":"Bash","tool_input":{"command":"node -e \"require('./.context/relations.json')\""}}` | BLOCK (B1 — the verbatim violation) |
| K2 | `{"tool_name":"Bash","tool_input":{"command":"cat .context/decisions.json"}}` | BLOCK (B2) |
| K3 | `{"tool_name":"Read","tool_input":{"file_path":"/Users/david/Projects/workflowsPiExtension/.context/tasks.json"}}` | BLOCK (Read branch, absolute path) |
| K4 | `{"tool_name":"Read","tool_input":{"file_path":".context/tasks.json"}}` | BLOCK (Read branch, relative path) |
| K5 | `{"tool_name":"Bash","tool_input":{"command":"jq '.tasks[]' .context/tasks.json"}}` | BLOCK (B2 — jq) |
| K6 | `{"tool_name":"Bash","tool_input":{"command":"npx tsx -e \"const r=require('./.context/relations.json'); console.log(r)\""}}` | BLOCK (B1 — tsx eval reading a substrate path) |
| K7 | `{"tool_name":"Bash","tool_input":{"command":"echo '{}' > .context/phase.json"}}` | BLOCK (B3 — redirection write) |
| K8 | `{"tool_name":"Edit","tool_input":{"file_path":".context/schemas/tasks.schema.json"}}` | BLOCK (Edit branch — schema file under schemas/) |
| K9 | `{"tool_name":"Bash","tool_input":{"command":"sed -n '1,5p' .context-jit-spec-v2/decisions.json"}}` | BLOCK (B2 + non-active substrate dir) |
| K10 | `{"tool_name":"Write","tool_input":{"file_path":".context/relations.json"}}` | BLOCK (Write branch) |
| K11 | `{"tool_name":"Bash","tool_input":{"command":"python3 -c \"import json; print(json.load(open('.context/features.json')))\""}}` | BLOCK (B4) |
| K12 | `{"tool_name":"Bash","tool_input":{"command":"cp .context/tasks.json /tmp/x.json"}}` | BLOCK (B2/B-copy — reading substrate as cp source; cp matches the copy rule) |

### Must PASS

| # | Input JSON (stdin) | Expected | Why |
|---|--------------------|----------|-----|
| P1 | `{"tool_name":"Bash","tool_input":{"command":"node packages/pi-context-cli/dist/bin.js read-block --block tasks --cwd .context --json"}}` | PASS | Step 1 — direct CLI invocation |
| P2 | `{"tool_name":"Bash","tool_input":{"command":"pi-context read-block-item --block relations --arrayKey relations --match '{\"id\":\"x\"}' --json"}}` | PASS | Step 1 — `pi-context ` shim |
| P3 | `{"tool_name":"Bash","tool_input":{"command":"pi-context find-references --id TASK-001 --cwd .context --json"}}` | PASS | Step 1 — even though it names `.context`, it routes through the CLI |
| P4 | `{"tool_name":"Bash","tool_input":{"command":"cat package.json"}}` | PASS | non-substrate JSON; no `.context*` path |
| P5 | `{"tool_name":"Read","tool_input":{"file_path":"/Users/david/Projects/workflowsPiExtension/tmp/scratch.json"}}` | PASS | `tmp/` scratch; not a `.context*` path |
| P6 | `{"tool_name":"Read","tool_input":{"file_path":".pi-context.json"}}` | PASS | the active-substrate pointer is NOT a `.context*/…json` path (no `/` after `.context`); reading the pointer is allowed |
| P7 | `{"tool_name":"Bash","tool_input":{"command":"npx tsx -e \"import {flipBootstrapPointer} from '@davidorex/pi-context/context-dir'; flipBootstrapPointer('.', '.context', 'human:x')\""}}` | PASS | Step 2 — tsx -e of a library fn with no CLI op; body has no substrate JSON path in a read call |
| P8 | `{"tool_name":"Bash","tool_input":{"command":"git log .context/tasks.json"}}` | PASS | `git log` names the path but is neither a reader utility (B2 list) nor a redirect; git is the VCS, not a substrate-content read. (Acceptable; see §7 limits.) |
| P9 | `{"tool_name":"Bash","tool_input":{"command":"ls .context/*.json"}}` | PASS | `ls` lists, does not read content; not in B2 list |
| P10 | `{"tool_name":"TodoWrite","tool_input":{"todos":[]}}` | PASS | `TodoWrite` is not matched by `Read\|Edit\|Write` (exact-list matcher) and not Bash; falls through `*) allow` |

A correct implementation passes **all** of K1–K12 (deny JSON, exit 0) and P1–P10 (no output, exit 0). The implementer should run the full matrix and paste the actual outputs before declaring done.

---

## 7. Limits — what this hook cannot catch

Per SKILL.md `<security>` ("Hooks are best-effort, not a security boundary") and the matchers.md `if`-filter "fails open" guidance, this is a **steering guardrail**, not airtight enforcement. Known gaps, stated honestly:

1. **Obfuscated / indirected commands.** The Bash branch matches the literal command string. A path built from a variable (`F=.context/tasks.json; cat "$F"`), base64-decoded, assembled by `printf`, or globbed (`cat .context/*.json` — actually B2 catches the `cat` + the glob token does contain `.context…json`? No: `*.json` does not match `SUBSTRATE_JSON_IN_CMD`, which requires a literal `.json` after a path segment — `*.json` has no preceding path token matching `[A-Za-z0-9._/-]*` ending in a concrete filename. So `cat .context/*.json` is NOT caught). Variable-indirected and glob-only paths slip through.
2. **Other read tools / channels.** Only `Bash`, `Read`, `Edit`, `Write` are matched. A future tool, an MCP server tool, or a subagent's own tool calls reading substrate JSON are out of scope (a subagent's `Bash` would fire the hook if the same settings apply, but a non-Bash MCP read tool would not).
3. **The CLI's correctness is assumed.** The hook steers to `pi-context` ops but cannot verify the agent then uses them correctly (e.g. guessing `relations.json` shape). The steering text mitigates the specific `{relations:[...]}` shape error by naming the real relations ops, but the hook cannot enforce correct op choice.
4. **`git`/`ls` and metadata commands pass** (P8, P9) — they name substrate paths without reading content. Intentional: they are not substrate-content bypasses.
5. **`deny` does not override a settings `allow` rule's siblings, and another hook's `allow` cannot suppress this `deny`** (matchers.md: most-restrictive wins, `deny` > `ask` > `allow`) — so this hook's deny is authoritative among hooks, but a hard guarantee would require the permission system, not a hook (SKILL.md `<security>`).

The hook closes the **exact recurring violation** (raw `node -e require` of substrate JSON, plus the common `cat`/`jq`/`Read`/`Edit`/`Write` channels) and steers to the correct surface. It does not claim to stop a determined obfuscated bypass.

---

## 8. Ambiguities flagged (skill did not fully resolve)

1. **`$CLAUDE_PROJECT_DIR` resolution in exec form.** SKILL.md `<environment>` shows `$CLAUDE_PROJECT_DIR` used inside a shell-form `command` string (`{ "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/validate.sh" }`) and separately states placeholders are "usable in `command`/`args`". It does not show an explicit exec-form example combining `"args": []` with a `$CLAUDE_PROJECT_DIR` placeholder in `command`. I have assumed Claude Code substitutes the placeholder in the `command` field **before** spawning (placeholder substitution is a Claude Code feature, independent of shell tokenization), which is consistent with `<environment>` listing it as usable in `command`. **If the implementer finds the exec-form `command` is passed literally without substitution**, the fallback is shell form: drop `"args": []` and quote the path — `"command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/block-substrate-cli-bypass.sh"` (the script emits only jq JSON, so profile-echo corruption is the only shell-form risk, mitigated by the troubleshooting.md interactive-shell guard if the user's profile echoes). This is a verify-at-install point, not a guess to bake in silently.
2. **No `read-relations` op exists.** The steering message originally suggested by the task (`pi-context read-relations …`) does **not** correspond to any real op — `node packages/pi-context-cli/dist/bin.js --help` shows relations are read via `find-references` / `walk-ancestors` / `context-walk-descendants` / `context-edges-for-lens` / `context-validate-relations`, and whole blocks via `read-block`. The steering text in §4 names the **real** ops and explicitly corrects the `{relations:[...]}` shape misconception. Flagged because the prompt's example op name would have been wrong if copied verbatim.
3. **`if`-field alternative not used.** matchers.md documents an `if` permission-rule filter (`"if": "Bash(...)"`) that could pre-filter by command shape, but it "fails open" and requires v2.1.85+. I deliberately do all filtering in the script (more precise, version-independent) rather than relying on `if`. Noted as a considered-and-rejected option, not an oversight.
```
