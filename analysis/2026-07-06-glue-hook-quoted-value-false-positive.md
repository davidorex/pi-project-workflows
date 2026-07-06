# block-pi-context-glue.sh false-positives on shell metacharacters inside quoted argument values

Investigation of an experience gap: the PreToolUse guard `.claude/hooks/block-pi-context-glue.sh` blocks legitimate pi-context CLI invocations when a QUOTED argument value contains characters that merely look like shell syntax. Observed live (twice by prior sessions, once during this investigation): regex alternation `|` inside a single-quoted `--value` argument of `filter-block-items` is blocked as shell piping, forcing agents into degraded single-term substrate searches.

Date: 2026-07-06. Investigator: subagent (read-only investigation; no hook modified, no substrate item filed). All probes were run against a scratchpad COPY of the hook (`/private/tmp/claude-501/-Users-david-Projects-workflowsPiExtension/ac1621b3-a1ff-49c8-93dd-7095ccd4bf1e/scratchpad/hook-copy.sh`) driven with synthetic PreToolUse tool-input JSON, except the one live reproduction noted below. The live hook was never touched.

## 1. Root cause

The hook (`.claude/hooks/block-pi-context-glue.sh`) reads `tool_input.command` from stdin and runs four `grep -Eq` heuristics against the RAW command string. grep has no shell-lexical model: it cannot distinguish a `|` that is pipeline syntax from a `|` that is data inside a quoted argument. Every heuristic therefore treats metacharacters inside quoted values as if they were shell syntax.

The four checks, verbatim from the hook, with the failure mode of each:

**Recognizer (line 22)** — decides whether the guard applies at all:
```
pi-context-cli/dist/bin\.js|(^|[;&|]| )pi-context '
```
Quote-blind: the literal text `pi-context ` inside a quoted string of an UNRELATED command (e.g. a `git commit -m` message discussing the discipline) enters the guard (probe FP-recognizer-in-git-commit-msg below).

**Check 1 — pipe / stderr-silence (line 25):**
```
(pi-context |bin\.js )[^;&|]*\||2>[[:space:]]*/dev/null
```
The first alternative matches `pi-context ` followed by any run of non-`;&|` characters, then a `|`. In `pi-context filter-block-items … --value '"termA|termB"'`, `[^;&|]*` consumes everything up to the `|` INSIDE the quoted value, and `\|` matches it — `[^;&|]*` is the only "don't cross a command boundary" device and it cannot tell a data `|` from a pipe. The second alternative (`2>/dev/null`) is entirely unanchored: it matches the literal text `2>/dev/null` anywhere, including inside a quoted JSON payload describing that very glue pattern.

**Check 2 — shell loop (line 30):**
```
(^|[;&|]|[[:space:]])(for|while)[[:space:]].*[[:space:]]do([[:space:]]|;|$)
```
Matches the whitespace-delimited words `for`/`while` … `do` anywhere in the string — including English prose inside a quoted value (`'"wait for the gate, then do the merge"'`).

**Check 3 — stdout redirect (line 38):**
```
(pi-context |bin\.js )[^;&|]*[[:space:]]1?>>?[[:space:]]*[^[:space:]<>&|;]
```
Matches a whitespace-preceded `>` after the op — including a `>` inside a quoted JSON payload (`'{"note":"threshold a > b applies"}'`). The hook's own comment (lines 34–37) claims quoted `--item @file` payload writes do not trip it; a payload whose TEXT contains ` > ` does.

**Check 4 — echo narration / exit capture (line 43):**
```
(^|[;&|])[[:space:]]*echo([[:space:]]|$)|\$\?
```
Split behavior, which delineates the class boundary precisely: the `echo` alternative is command-position anchored (`^` or `;&|` before it) and does NOT fire on the bare word "echo" inside a value — but a quoted value containing `; echo ` satisfies the anchor from inside the quotes and fires. The `\$\?` alternative is entirely unanchored and fires on `$?` anywhere, including inside a quoted description discussing exit codes.

Root cause, one sentence: all four heuristics (and the recognizer) pattern-match the raw command string with no quote-span awareness, so any pattern not anchored to true command position — and even anchored ones, when the anchor character itself appears inside quotes — matches data inside quoted argument values.

## 2. Live reproduction (real hook, real repo)

Method (a): the investigator's own Bash tool call passes through the live hook. Attempted:

```
pi-context filter-block-items --block framework-gaps --field description --op matches --value '"hook|guard"' --json
```

Observed tool-result (the live hook's block, verbatim):

```
PreToolUse:Bash hook error: ["$CLAUDE_PROJECT_DIR"/.claude/hooks/block-pi-context-glue.sh]: Blocked: do not pipe pi-context CLI output through ANYTHING (no | after the op — not grep/jq/awk/node/python3/perl/xargs/tee or any other), nor silence its stderr with 2>/dev/null. pi-context output must land inline and be read directly; narrow a large result with the op itself (filter-block-items / read-block-page --limit / read-schema --path / read-block-item), never post-process it in the shell. This is the pi-context-cli direct-drive discipline; friction is a gap to file, not to route around.
```

The `|` is data inside a single-quoted JSON-string argument consumed by the op's own `matches` operator — exactly the "narrow with the op itself" path the block message prescribes. The false positive blocks the prescribed remedy.

## 3. Synthetic probe matrix (scratchpad hook COPY, current behavior)

Each case feeds `{"tool_input":{"command":…}}` (built with `jq -n`) to the copied hook on stdin; exit 2 = block, exit 0 = pass. Observed outputs, verbatim (stderr truncated to first line by the harness):

```
=== TP-pipe (genuine pipe, must block)
    cmd: pi-context read-block --block framework-gaps --json | head -20
    exit: 2
    stderr: Blocked: do not pipe pi-context CLI output through ANYTHING (no | after the op — not grep/jq/awk/node/python...
=== TP-stderr-silence (must block)
    cmd: pi-context context-validate --json 2>/dev/null
    exit: 2
    stderr: Blocked: do not pipe pi-context CLI output through ANYTHING (no | after the op — not grep/jq/awk/node/python...
=== TP-echo-banner (must block)
    cmd: echo "=== validate ==="; pi-context context-validate --json
    exit: 2
    stderr: Blocked: run ONE bare clean pi-context op per Bash call — no echo narration or banners (echo "=== … ==="),...
=== TP-exit-capture (must block)
    cmd: pi-context context-validate --json; echo "exit=$?"
    exit: 2
    stderr: Blocked: run ONE bare clean pi-context op per Bash call — no echo narration or banners (echo "=== … ==="),...
=== TP-stdout-redirect (must block)
    cmd: pi-context read-block --block framework-gaps --json > /tmp/dump.json
    exit: 2
    stderr: Blocked: do not redirect pi-context CLI stdout to a file (e.g. pi-context <op> … > /tmp/x) to read it elsewh...
=== CLEAN-read (must pass)
    cmd: pi-context read-block-item --block framework-gaps --id FGAP-089 --json
    exit: 0
=== CLEAN-filter-single-term (must pass)
    cmd: pi-context filter-block-items --block framework-gaps --field title --op matches --value '"hook"' --json
    exit: 0
=== CLEAN-non-pi-context pipe (must pass)
    cmd: ls /tmp | head
    exit: 0
=== FP-alternation-in-value
    cmd: pi-context filter-block-items --block framework-gaps --field description --op matches --value '"termA|termB"' --json
    exit: 2
    stderr: Blocked: do not pipe pi-context CLI output through ANYTHING (no | after the op — not grep/jq/awk/node/python...
=== FP-dollar-question-in-payload
    cmd: pi-context append-block-item --block framework-gaps --arrayKey gaps --item '{"description":"exit code via $? is unreliable here"}' --json
    exit: 2
    stderr: Blocked: run ONE bare clean pi-context op per Bash call — no echo narration or banners (echo "=== … ==="),...
=== FP-gt-in-quoted-string
    cmd: pi-context update-block-item --block framework-gaps --arrayKey gaps --match '{"id":"FGAP-001"}' --updates '{"note":"threshold a > b applies"}' --json
    exit: 2
    stderr: Blocked: do not redirect pi-context CLI stdout to a file (e.g. pi-context <op> … > /tmp/x) to read it elsewh...
=== FP-2devnull-as-literal-text
    cmd: pi-context append-block-item --block framework-gaps --arrayKey gaps --item '{"description":"agents silence stderr with 2>/dev/null"}' --json
    exit: 2
    stderr: Blocked: do not pipe pi-context CLI output through ANYTHING (no | after the op — not grep/jq/awk/node/python...
=== FP-for-do-in-prose-value
    cmd: pi-context filter-block-items --block framework-gaps --field description --op matches --value '"wait for the gate, then do the merge"' --json
    exit: 2
    stderr: Blocked: do not wrap the pi-context CLI in a shell loop (for/while … do … done) to batch reads/writes. One...
=== FP-echo-word-in-value
    cmd: pi-context filter-block-items --block framework-gaps --field description --op matches --value '"the echo narration ban"' --json
    exit: 0
=== PROBE-hash-in-payload
    cmd: pi-context append-block-item --block framework-gaps --arrayKey gaps --item '{"description":"see item #42 for context"}' --json
    exit: 0
```

Boundary probes (second run):

```
=== FP-recognizer-in-git-commit-msg
    cmd: git commit -m 'guard: pi-context output must not be piped | glue discipline'
    exit: 2
    stderr: Blocked: do not pipe pi-context CLI output through ANYTHING (no | after the op — not gre...
=== FP-semicolon-echo-in-value
    cmd: pi-context filter-block-items --block framework-gaps --field description --op matches --value '"run it; echo the result"' --json
    exit: 2
    stderr: Blocked: run ONE bare clean pi-context op per Bash call — no echo narration or banners (...
=== FP-alternation-double-quoted
    cmd: pi-context filter-block-items --block framework-gaps --field description --op matches --value "\"termA|termB\"" --json
    exit: 2
    stderr: Blocked: do not pipe pi-context CLI output through ANYTHING (no | after the op — not gre...
```

## 4. Class characterization

**Verdict: this is the general quoted-value-parsing class, not the narrow alternation case.** Evidence: all four block heuristics false-positive on quoted-value content through at least one of their alternatives, and the recognizer itself is quote-blind:

| Check | FP payload shape observed | Probe |
|---|---|---|
| 1 pipe | `\|` inside quoted `--value` (single- AND double-quoted forms) | FP-alternation-in-value, FP-alternation-double-quoted, live repro |
| 1 stderr-silence | literal text `2>/dev/null` inside quoted payload | FP-2devnull-as-literal-text |
| 2 loop | prose `for … do` inside quoted `--value` | FP-for-do-in-prose-value |
| 3 redirect | ` > ` inside quoted JSON payload | FP-gt-in-quoted-string |
| 4 exit-capture | `$?` inside quoted payload (unanchored alternative) | FP-dollar-question-in-payload |
| 4 echo | `; echo ` inside quoted value (anchor char satisfied from inside quotes) | FP-semicolon-echo-in-value |
| recognizer | `pi-context … \|` inside a quoted string of a NON-pi-context command | FP-recognizer-in-git-commit-msg |

Non-members, confirming the boundary is quote-awareness, not "the hook blocks everything": bare word `echo` inside a value passes (the command-position anchor works when no `;&|` precedes it inside the quotes — FP-echo-word-in-value, exit 0); `#` in a payload passes (the hook has no comment heuristic — PROBE-hash-in-payload, exit 0). The class is exactly: **any hook pattern element not lexically confined to inter-token shell syntax matches identical characters occurring as data inside quoted argument values.** Anchoring reduces but does not eliminate membership (the `; echo` case shows the anchor character itself can occur inside quotes).

Practical severity concentrates on Check 1 + `--value`: `matches` alternation is the CLI's own prescribed narrowing tool, so the guard blocks the exact remedy its message prescribes, degrading substrate search to one term per invocation. Checks 3/4 bite on any filed payload whose TEXT discusses shell glue — which this project's gap filings routinely do (this very report's draft item below would trip Checks 1, 3 and 4 if filed via an inline `--item` payload rather than `--item @file`).

The true-positive and clean rows above are the regression set for any fix: TP-pipe, TP-stderr-silence, TP-echo-banner, TP-exit-capture, TP-stdout-redirect must still exit 2; CLEAN-read, CLEAN-filter-single-term, CLEAN-non-pi-context-pipe must still exit 0.

## 5. Prior-art search (substrate)

Searches run (single-term — the alternation form is itself the blocked case), all via `pi-context filter-block-items … --json`:

- `title matches "hook"` → 1 hit: **FGAP-089** (status `identified`, P3, pi-context). Read in full. It covers a DIFFERENT defect class in the SAME hooks: enforcement scoped by op-shape rather than target substrate — the hooks fire on writes/invocations against throwaway/non-active substrates (`--cwd`), outside the convention they protect. Its evidence line for block-pi-context-glue.sh states the block tests "inspect only command-string glue, never --cwd" — scope-blindness, not quote-blindness. It does NOT track the quoted-value false positive. The two gaps are complementary: FGAP-089 is "the guard fires against the wrong TARGET"; this gap is "the guard misparses the COMMAND STRING itself".
- `title matches "guard"` → FGAP-051 (closed; install --update block-file rewrite — unrelated) and FGAP-093 (identified; write-time edge-guard parity in context-sdk — unrelated, different guard concept entirely).
- `title matches "glue"` → 0 hits.
- `description matches "false positive"` → 0 hits.
- `description matches "quoted"` → 0 hits.
- `description matches "alternation"` → FGAP-072 (closed; per-op --help template — the word appears in "@file alternation" in a synopsis-notation context; unrelated).
- `description matches "block-pi-context-glue"` → FGAP-089 only (confirming no other filing references this hook).

**Conclusion: the substrate does not track this defect.** A new filing is justified. It should relate to FGAP-089 (same artifact, sibling defect class — e.g. `gap_relates_to_gap`), not merge into it: fixing FGAP-089's scope defect would not fix this, and vice versa.

## 6. Proposed resolution shapes (class-closing)

Constraint: the fix must close the whole class (quote-blind matching in ALL five pattern sites, recognizer included), while the regression set in §4 keeps blocking. Two shapes, both root-cause-level; the first is prototyped and empirically validated.

**Shape A (prototyped, validated): strip quoted spans before pattern-matching.** Insert one preprocessing line after `cmd` extraction; run all existing regexes unchanged against the stripped skeleton:

```sh
cmd=$(printf '%s' "$cmd" | perl -pe "s/'[^']*'|\"(?:\\\\.|[^\"\\\\])*\"/Q/g")
```

A single left-to-right combined pattern (single-quoted span | double-quoted span with backslash-escape handling) replaced by a placeholder. Left-to-right combined matching is load-bearing twice over: (a) it handles interleaved quoting (`"don't"` — a two-pass strip-singles-then-doubles version would mispair the apostrophe); (b) the `(?:\\.|[^"\\])*` element handles `\"` escapes inside double quotes — a naive `"[^"]*"` two-pass version left the FP-alternation-double-quoted case blocked when prototyped (observed: exit 2 under the sed two-pass; exit 0 after the combined-pattern upgrade). Full matrix against the upgraded prototype (scratchpad `hook-stripped.sh`), observed: **all 5 TP cases exit 2 with the correct block message, all 3 CLEAN cases exit 0, all 9 FP cases exit 0.** Known residual imperfection, acceptable for a cooperative-agent guard (this repo's enforcement targets a lazy cooperative agent, not an adversary): unbalanced quotes or exotic `$'…'` quoting degrade to the current (over-blocking, fail-closed) behavior — never to under-blocking, because stripping only ever removes text a pattern could match.

**Shape B (heavier, fully faithful): tokenize with a real shell lexer.** Replace the grep heuristics with a parse of the command line (e.g. python3 `shlex` split preserving operators, or bash's own parser via `bash -n` + word-splitting introspection), then inspect only inter-token operator positions for `|`, `>`, `;`-joined `echo`, `for/do`, and `$?` outside quoted words. Exactly faithful to shell semantics (handles `$'…'`, nesting, escapes) at the cost of a rewrite of all five pattern sites and a new runtime dependency in the hook path. Shape A achieves the same observed matrix result with a one-line change; Shape B is the fallback if future probes surface quoting forms Shape A's regex misses in the under-blocking direction (none observed).

Either shape also fixes the recognizer FP (a quoted mention of `pi-context …` in an unrelated command no longer enters the guard — observed under the Shape A prototype: FP-recognizer-in-git-commit-msg exit 0). The fix flows through the canonical implementation pipeline (explore → plan → approve → agent; hook changes developed against a COPY, never the live guard), with §4's probe matrix as the acceptance test: every TP row exit 2, every CLEAN and FP row exit 0.

Scratchpad artifacts (session-local, not repo files): `hook-copy.sh` (verbatim copy), `hook-stripped.sh` (Shape A prototype), `probe.sh` / `probe2.sh` (matrix harness), `probe-stripped.sh` / `probe2-stripped.sh` (matrix vs prototype), under `/private/tmp/claude-501/-Users-david-Projects-workflowsPiExtension/ac1621b3-a1ff-49c8-93dd-7095ccd4bf1e/scratchpad/`.

---

## DRAFT framework-gaps item (NOT filed — for orchestrator to present to the user; filing is user-permission-gated)

```json
{
	"title": "block-pi-context-glue.sh pattern-matches shell metacharacters inside QUOTED argument values as shell syntax — regex alternation in --value is blocked as piping, and every heuristic false-positives on quoted-payload text",
	"status": "identified",
	"priority": "P2",
	"package": "pi-context",
	"canonical_vocabulary": "quote-aware hook pattern matching",
	"description": ".claude/hooks/block-pi-context-glue.sh runs all four block heuristics (pipe/stderr-silence line 25, for/while-do loop line 30, stdout-redirect line 38, echo/$? line 43) and the pi-context invocation recognizer (line 22) as grep -E over the RAW tool_input.command string with no quote-span awareness, so metacharacters that are DATA inside quoted argument values match as shell syntax. Confirmed false-positive matrix (scratchpad hook copy + one live block): | inside a quoted --value (single- and double-quoted, incl. escaped \\\") blocks as piping; literal 2>/dev/null text in a quoted payload blocks as stderr-silence; prose 'for … do' in a quoted value blocks as a loop; ' > ' inside a quoted JSON payload blocks as redirect; $? in a quoted payload blocks as exit-capture; '; echo ' inside a quoted value satisfies the echo anchor from inside the quotes; and the recognizer fires on a NON-pi-context command (git commit -m) whose quoted message mentions 'pi-context … |'. Non-members confirming the boundary: bare word 'echo' in a value passes (command-position anchor holds); '#' in a payload passes (no comment heuristic). Class: any hook pattern element not lexically confined to inter-token shell syntax matches identical characters occurring as data inside quoted values. Distinct from FGAP-089 (same hooks, sibling class: target-substrate scope-blindness; this gap is command-string quote-blindness — fixing one does not fix the other).",
	"evidence": [
		{
			"file": ".claude/hooks/block-pi-context-glue.sh",
			"lines": "25",
			"reference": "(pi-context |bin\\.js )[^;&|]*\\| — [^;&|]* crosses into the quoted value and \\| matches a data pipe; the 2>/dev/null alternative is fully unanchored"
		},
		{
			"file": ".claude/hooks/block-pi-context-glue.sh",
			"lines": "30, 38, 43",
			"reference": "loop / redirect / $?-capture patterns each matched inside quoted payload text in the probe matrix; the echo alternative's (^|[;&|]) anchor is satisfiable from inside quotes ('; echo ')"
		},
		{
			"file": ".claude/hooks/block-pi-context-glue.sh",
			"lines": "22",
			"reference": "recognizer (^|[;&|]| )pi-context  matches a quoted MENTION of pi-context in an unrelated command, pulling it into the guard"
		},
		{
			"file": "analysis/2026-07-06-glue-hook-quoted-value-false-positive.md",
			"reference": "the investigation: live block transcript for filter-block-items --value '\"hook|guard\"', 12-case FP/TP/CLEAN probe matrix against a scratchpad hook copy, class verdict, prior-art sweep (FGAP-089 sibling-not-duplicate), and a validated one-line quote-span-stripping prototype (all 5 TPs still block, all 9 FPs pass)"
		}
	],
	"impact": "Substrate search via filter-block-items --op matches cannot use regex alternation — the guard blocks the exact narrowing remedy its own block message prescribes — degrading every multi-term substrate query (incl. the mandatory prior-art sweep before any filing) to one term per invocation. Any inline --item/--updates payload whose text discusses shell glue (which gap filings about this discipline necessarily do) trips the redirect/pipe/exit-capture checks. Observed blocking live work at least three times (two prior sessions + this investigation's live repro).",
	"proposed_resolution": "Make the hook quote-aware at the chokepoint, closing the class for all five pattern sites at once: strip quoted spans from the command string with a single left-to-right combined substitution (perl -pe \"s/'[^']*'|\\\"(?:\\\\\\\\.|[^\\\"\\\\\\\\])*\\\"/Q/g\") immediately after extracting tool_input.command, then run the existing regexes unchanged against the stripped skeleton. Prototyped on a scratchpad copy: all 5 true-positive glue forms still exit 2 with the correct message, all 3 clean forms and all 9 false-positive forms exit 0; left-to-right combined matching is required (two-pass stripping mishandles interleaved quotes and \\\" escapes — the escaped-double-quote case stayed blocked under a naive two-pass sed and passed only after the combined-pattern upgrade). Degradation on exotic quoting is fail-closed (over-block, never under-block), proportionate to the cooperative-agent enforcement target. Fallback if under-blocking ever surfaces: tokenize with a real shell lexer and inspect only inter-token operators. Acceptance test = the investigation's probe matrix (every TP row exit 2, every CLEAN and FP row exit 0). Develop against a COPY, never the live guard; relate to FGAP-089 as sibling class on the same artifact. Grounding: analysis/2026-07-06-glue-hook-quoted-value-false-positive.md."
}
```
