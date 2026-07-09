# Constraint surface for a project `/orient` skill (2026-07-09)

Scope: map every repo-local constraint that would govern a session-start orientation skill at
`.claude/skills/orient/SKILL.md` injecting live project state via the inline `` !`<command>` ``
expansion form. All claims below are grounded in files read or commands run in this investigation.
No writes were made to any hook, setting, or substrate; the only write is this report.

Method note on the decisive `!`-injection question: I READ the hooks (all four are PreToolUse,
keyed on Bash / Write|Edit|NotebookEdit) and confirmed each depends entirely on a
`.tool_input.*` payload delivered by a PreToolUse event. I did NOT test-fire any hook (forbidden —
FGAP-089, live repo-wide guards). The per-hook verdict below reasons from (a) the verified fact
that these are PreToolUse tool-keyed hooks that only execute when the harness raises a tool-call
event, and (b) the stated `!`-injection mechanic: `!` expansion is preprocessing that runs BEFORE
skill content reaches the model and produces NO `tool_use` block. Where that rests on the stated
mechanic rather than an observation I made, it is flagged.

## 1. Hooks table

Source: `.claude/settings.json` declares ONLY `PreToolUse` hooks (no SessionStart, no
UserPromptSubmit, no PostToolUse, no Stop). Two matchers:
- `matcher: "Bash"` → `block-pi-context-glue.sh`, `block-pathspec-commit.sh`
- `matcher: "Write|Edit|NotebookEdit"` → `block-control-chars.sh`, `block-substrate-write.sh`

| Hook | Event / matcher | Inspects | Blocks | Fires on `` !`…` `` injection? |
|---|---|---|---|---|
| `block-pi-context-glue.sh` | PreToolUse / `Bash` | `.tool_input.command` (string, line 18); quote-strips to a skeleton via perl (line 32); engages only if the skeleton matches `pi-context-cli/dist/bin\.js` or `(^\|[;&\|] )pi-context ` (line 35) | Piping op stdout anywhere / `2>/dev/null` (line 43); `for`/`while … do` loop (line 48); op stdout `>`/`>>`/`1>` to a file (line 59); `echo` narration or `$?` exit-capture (line 64). Exit 2. | NO — decided at line 18. The hook only ever sees a command arriving as `.tool_input.command` in a PreToolUse Bash payload; `!` injection raises no Bash `tool_use`, so no payload is delivered and the script never runs for it. (Rests on stated `!` mechanic; hook-side dependency on `.tool_input.command` is verified.) |
| `block-pathspec-commit.sh` | PreToolUse / `Bash` | `.tool_input.command` (line 26); python3 shlex tokenizer finds a `git … commit` head and walks post-`commit` tokens | A pathspec `git commit` (`git commit -- <path>` or `git commit <path>`); a bare `--` with args or any surviving positional → BLOCK (line 108/116). Fail-open on unparseable. Exit 2. | NO — decided at line 26 (`.tool_input.command`). Same reason: no Bash `tool_use` from `!` injection ⇒ hook never invoked. Also irrelevant to orient content, which reads (`git log`/`git status`), never commits. |
| `block-control-chars.sh` | PreToolUse / `Write\|Edit\|NotebookEdit` | `.tool_input.content` / `.new_string` / `.new_source` decoded in jq; flags C0 controls (except tab/LF/CR) + DEL (line 28-32) | The Write/Edit/NotebookEdit payload if it carries a raw control byte. Exit 2. | NO — wrong tool class entirely; `!` injection is not a Write/Edit/NotebookEdit call and produces no `tool_input.content`. Would only matter to the AUTHORING of `SKILL.md` (a real Write), not to runtime injection. |
| `block-substrate-write.sh` | PreToolUse / `Write\|Edit\|NotebookEdit` | `.tool_input.file_path` / `.notebook_path` (line 26); resolves active substrate via `.pi-context.json` `contextDir`; normalizes path | A Write/Edit landing on `<contextDir>/….json` (substrate JSON is ops-only). Exit 2, fail-open. | NO — wrong tool class; `!` injection is not a file write. Relevant only if the orient skill ever tried to Edit substrate JSON (it must not; reads go through pi-context ops). |

Net: NONE of the four PreToolUse hooks can fire on a `` !`…` ``-injected command, because none of
them is invoked absent a matching `tool_use` event and `!` injection produces none. The Bash pair
is additionally gated by the `.tool_input.command` read (lines 18 / 26); the Write/Edit pair is a
different tool class. The guards DO fire on any real Bash/Write tool call the skill BODY instructs
the model to make — so the reject-list in §2 still governs how the injected command line should be
authored (and would bind if that same line were ever issued as a genuine Bash call).

## 2. pi-context direct-drive guard — exact reject-list (verbatim from `block-pi-context-glue.sh`)

Engage predicate (line 35) — the guard only inspects a command that is a pi-context invocation:
```
pi-context-cli/dist/bin\.js|(^|[;&|]| )pi-context
```
i.e. the `bin.js` path OR the `pi-context <op>` form (note the required TRAILING SPACE after
`pi-context ` — `which pi-context` with no trailing space does not engage it).

Once engaged, after quote-span stripping (line 32, single→`Q`, double→`Q`), it rejects:

1. Pipe / stderr-silence (line 43):
```
(pi-context |bin\.js )([^;&|<>]|>>?&?[0-9-]?|<<?)*\|($|[^|])|2>[[:space:]]*/dev/null
```
— any single `|` pipe after the op (redirect-tolerant; `||` excluded), OR `2>/dev/null`.

2. Shell loop (line 48):
```
(^|[;&|]|[[:space:]])(for|while)[[:space:]].*[[:space:]]do([[:space:]]|;|$)
```

3. Op stdout redirected to a file (line 59):
```
(pi-context |bin\.js )([^;&|<>]|>>?&?[0-9-]?|<<?)*[[:space:]]1?>>?[[:space:]]*[^[:space:]<>&|;]
```
— `pi-context <op> … > file` / `>>` / `1>`. (`2>file` stderr-capture and `--item @file` input
payloads are NOT matched.)

4. echo narration / exit-capture (line 64):
```
(^|[;&|])[[:space:]]*echo([[:space:]]|$)|\$\?
```
— a leading `echo` or `echo` after `;`/`&`/`|`, OR a literal `$?`.

Rejected tokens, plain list: any `|` pipe to any consumer; `2>/dev/null`; `for`/`while … do …`
loops; stdout `>` / `>>` / `1>` file redirect; `echo` (leading or post-separator); `$?`.

NOT rejected by this hook: a bare `&&` / `;` chain of pi-context ops that introduces no echo/pipe/
redirect/$? (the hook enforces a subset of the CLAUDE.md "one op per call" discipline — chaining
per se is not blocked, only glue is); `--json`; `--item @file` input payloads written with
cat/printf; `2>&1` fd-dups that don't terminate in a pipe/file.

Consequence for orient: an injected orient command that calls pi-context must be a bare op (or a
plain `&&`/`;` sequence of bare ops) with `--json` — no `| jq`, no `| head`, no `2>/dev/null`, no
`> file`, no `echo`, no `$?`. For multiple reads, use multiple `` !`…` `` blocks rather than one
piped/glued line.

## 3. Claude Code version + `${CLAUDE_PROJECT_DIR}` in `allowed-tools` verdict

- `claude --version` → `2.1.205 (Claude Code)` (observed).
- Threshold for `${CLAUDE_PROJECT_DIR}` expansion inside skill frontmatter `allowed-tools`: v2.1.196+.
- Verdict: 2.1.205 ≥ 2.1.196 → SUPPORTED. If the orient skill wants to anchor a repo-local
  command in `allowed-tools`, `${CLAUDE_PROJECT_DIR}` will expand at this version.
- Practical note (see §6): the orient skill does not NEED `${CLAUDE_PROJECT_DIR}` for pi-context,
  which is on global PATH; an `allowed-tools: Bash(pi-context *)` entry (as
  `audit-substrate-currency` uses) suffices.

## 4. Existing skill / command surface

Skills under `.claude/skills/` (each a dir with `SKILL.md`):

| Name | Type | `description` (frontmatter) | `disable-model-invocation` | `allowed-tools` | Does |
|---|---|---|---|---|---|
| `audit-substrate-currency` | skill dir | "Audit the active pi-context substrate for currency … enact user-granted corrections…" | (absent) | `Bash(pi-context *)` | Grant-gated currency audit + enactment of corrections via pi-context ops |
| `release` | skill dir | "Cut a release of the pi-project-workflows monorepo — lockstep bump, CHANGELOG, tag…" | `true` | (absent) | Held release process up to human publish/push |
| `repo-guide` | skill dir | "Monorepo organization, package relationships, versioning, publishing, and development workflows…" | (absent) | (absent) | Static repo navigation guide |
| `run-pi-project-workflows` | skill dir | "Build, run, and drive pi-project-workflows…" | (absent) | (absent) | Build + smoke-test both deployable surfaces via `driver.mjs` |

Commands under `.claude/commands/` (legacy `.md` command files):

| Name | Type | `description` | `allowed-tools` | Does |
|---|---|---|---|---|
| `audit-context-currency` | legacy command file | "Read-only forensic audit of this project's substrate context currency + completeness (dispatches the context-currency-auditor agent…). Loop-friendly — /loop 10m /audit-context-currency." | `[Agent, Bash(date:*), Bash(mkdir:*), Bash(git rev-parse:*), Read(tmp/context-audits/**), Write(tmp/context-audits/**), PushNotification]` | Read-only: dispatches `context-currency-auditor` agent, persists report, notifies if non-clean |

CLAUDE.md references both `/audit-context-currency` (the read-only detector command above) and
`/audit-substrate-currency` (the grant-gated enactment skill above). Both exist and are distinct
surfaces (detect vs. enact). Also present: agent `.claude/agents/context-currency-auditor.md`.

Session-orientation surface: NONE exists. No `orient` skill/command; the four skills + one command
are audit / release / repo-guide / run-driver. There is no session-start state-injection surface —
the `/orient` skill would be net-new.

## 5. PATH / anchoring findings

- `which pi-context` → `/opt/homebrew/bin/pi-context` (observed). pi-context is on global PATH.
  Injected orient commands calling `pi-context <op>` need NO path anchoring — unlike the wasc
  project which had to anchor a repo-local `node …/state.mjs`.
- Repo-local (would need cwd=repo-root or `${CLAUDE_PROJECT_DIR}` if invoked): the `.pi-context.json`
  active-substrate pointer, the `.context` (or other) substrate dirs, `scripts/orchestrator/*.ts`
  (run via `npx tsx`), and `npx tsx -e` SDK calls into `@davidorex/pi-context/context-sdk`. BUT the
  pi-context CLI ops (`context-status`, `context-current-state`, `context-bootstrap-state`,
  `context-validate`) resolve the substrate from cwd `.`, and skills run with cwd = project root,
  so those ops need no anchoring. A state-injection orient built from `pi-context` CLI ops + `git`
  (`git log`, `git status`) is fully cwd-relative and requires no `${CLAUDE_PROJECT_DIR}`. Anchoring
  would only be needed if orient chose to run a repo-local script (e.g. `build-html-views.ts`).

## 6. SessionStart hook collision

`.claude/settings.json` declares ONLY `PreToolUse` hooks (two matcher groups; §1). There is NO
`SessionStart` hook (and no UserPromptSubmit/Stop/PostToolUse). A SessionStart nudge added for
orient would NOT collide with any existing SessionStart hook — the `hooks` object would gain a new
`SessionStart` key alongside the existing `PreToolUse` key. (An `/orient` skill invoked via `!`
injection needs no SessionStart hook at all; this only matters if an auto-nudge were added.)

## 7. Gitignore tracking verdict

`.gitignore` (repo root) relevant lines:
```
4  .claude/*
5  !.claude/hooks/
6  !.claude/settings.json
7  !.claude/agents/
8  !.claude/commands/
9  !.claude/skills/
10 .claude/skills/*
11 !.claude/skills/audit-task-resolution/
12 !.claude/skills/run-pi-project-workflows/
13 !.claude/skills/audit-substrate-currency/
14 !.claude/skills/release/
```

This is a negation-list `.gitignore` — the exact wasc trap. Line 4 ignores everything under
`.claude/`; lines 5-9 re-include hooks/settings/agents/commands/skills; line 10 RE-IGNORES
everything under `skills/`; lines 11-14 re-include only four named skill dirs. A new skill dir NOT
in that list falls back through line 10 and is silently ignored. (`repo-guide/` is itself already
untracked for this reason — it is not in the negation list; confirmed by `git ls-files`, which
lists only audit-substrate-currency, release, run-pi-project-workflows skill files.)

Per-path verdict if created today:
- `.claude/settings.json` → TRACKED (negated by line 6). `git check-ignore -v` returns nothing.
- `.claude/hooks/*` → TRACKED (negated by line 5). `git check-ignore -v` returns nothing.
- `.claude/skills/orient/*` → IGNORED. Would need a new `!.claude/skills/orient/` negation line to
  be trackable. Silent fall-through otherwise.

`git check-ignore -v` evidence (observed):
```
.gitignore:10:.claude/skills/*	.claude/skills/orient/SKILL.md
.gitignore:10:.claude/skills/*	.claude/skills/repo-guide/SKILL.md
(.claude/settings.json, .claude/hooks/…, .claude/commands/…, .claude/skills/audit-substrate-currency/… : no output — NOT ignored)
```
`git ls-files .claude/` confirms tracked set: agents/context-currency-auditor.md,
commands/audit-context-currency.md, hooks/*.sh (+ .test.sh), settings.json, and only the
audit-substrate-currency / release / run-pi-project-workflows skill files.

Action required for orient: add `!.claude/skills/orient/` to `.gitignore` (before or after lines
11-14) or the new SKILL.md will never be staged.

## Blockers
None. All items resolved from read files and observed command output.
