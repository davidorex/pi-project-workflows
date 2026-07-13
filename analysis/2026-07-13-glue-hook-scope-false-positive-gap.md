# Glue-hook false positive on a multi-line quoted command with no pi-context op

Investigation of an experience gap hit live this session (twice): `.claude/hooks/block-pi-context-glue.sh`
blocked a `git commit` command that contains no pi-context CLI invocation at all. Read-only investigation;
the live guard was never modified — all reproduction ran against a scratchpad COPY.

## Verdict

The block is **not** command-wide glue scanning and **not** FGAP-089's substrate-scope axis. It is a
**residual of FGAP-120 (quote-blindness), restricted to its multi-line dimension**: the quote-strip on
line 32 uses `perl -pe`, which iterates **line by line**, so a quoted span that crosses a newline is never
collapsed. Its interior — including a literal `pi-context` mention and any `echo`/`$?`/`|` metacharacters —
survives into the skeleton. The recognizer (line 35) then reads the surviving `pi-context ` mention as a
real invocation, and a glue branch matches the surviving metacharacters. FGAP-120 closed the *single-line*
quoted-mention case; the *multi-line* case regresses to the exact false positive FGAP-120 set out to remove.
Fix: change the line-32 strip to slurp mode (`perl -0777 -pe`) so quoted spans collapse across newlines.

## 1. Root cause

### 1a. Matcher structure — glue patterns ARE gated on a pi-context invocation

All four glue branches sit **inside** the recognizer `if` (line 35). Verbatim:

- Line 35 recognizer: `grep -Eq 'pi-context-cli/dist/bin\.js|(^|[;&|]| )pi-context '`
- Line 43 pipe/stderr-silence, line 48 for/while loop, line 59 stdout-to-file, line 64 echo-narration/`$?` — each an
  `if … exit 2` nested under line 35.

So the glue patterns do **not** fire command-wide; they only run once the recognizer decides the command is a
pi-context invocation. This was proven empirically (CONTROL A below): the identical
`npm run build > log 2>&1; echo "BUILD:$?"; git commit …` glue shape with **no** `pi-context` text anywhere
passes cleanly (exit 0). The team-lead hypothesis — "same glue, genuinely no pi-context anywhere; if it still
blocks, the matcher is scope-blind" — tested **FALSE**. The matcher is not command-wide scope-blind. The defect
is upstream, in the recognizer's quote-strip.

### 1b. The quote-strip is line-scoped

Line 32 (the FGAP-120 fix):

```
cmd=$(printf '%s' "$cmd" | perl -pe "s/'[^']*'|\"(?:\\\\.|[^\"\\\\])*\"/Q/g")
```

`perl -pe` wraps the substitution in an implicit `while (<>) { …; print }` — it reads and substitutes **one
line at a time**. A single- or double-quoted span that opens on one physical line and closes on a later line is
therefore never matched: on the opening line the closing quote is absent, so the alternation fails and the span
is left un-stripped; the interior lines have no enclosing quote of their own and pass through verbatim.

The blocked command was a multi-line commit message: `git commit -m "$(cat <<'EOF' … EOF )"`. The heredoc body
(line 4 of the command) reads `The 26 bundled agent specs relocate to the pi-context samples catalog`. Because
the enclosing `"…"` spans ~30 lines, line 32 never collapses it. The observed skeleton (from running line 32's
exact perl on the real command):

```
npm run build > /tmp/mid-merge-build.log 2>&1; echo Q; git commit -m "$(cat <<Q
merge: install ceremony materializes editable agent specs (single canonical tier)

The 26 bundled agent specs relocate to the pi-context samples catalog
…
keeping both branchesQs first gate run          <- apostrophe-span 'branches' entries. The merge commit'  collapsed
…
```

- Line-1 `echo "BUILD:$?"` correctly collapses to `echo Q` (same-line double-quote span).
- The multi-line `-m "…"` does **not** collapse — its `"` opens on line 1, closes ~30 lines later.
- Body apostrophes (`substrate's`, `commit's`, `branches' entries`) are matched by the single-quote alternative
  `'[^']*'` on their own lines, spuriously pairing across words — cosmetic here, but confirms per-line operation.

Recognizer match on the skeleton (line 35 regex, `grep -no`): `4: pi-context ` — the literal mention on body
line 4 is read as an unquoted invocation. Glue match (line 64 regex): `1:; echo` — the surviving `; echo Q`
from the build pipeline trips the echo-narration branch. The guard fires and returns the echo/`$?` block message,
though the command contains no pi-context op.

### 1c. Class

The general class is: **the quote-strip neutralizes only single-line quoted spans; any quoted span crossing a
newline leaks its interior into the skeleton.** The multi-line commit message is one instance. The class is
broader than the recognizer: a genuinely multi-line **single-quoted `--item` payload on a real op** (e.g.
`pi-context append-block-item --item '{"a":"b\nc|d"}'`) leaks its interior `|` and would false-positive the pipe
branch under line-scoping — a payload-side instance of the same defect. Slurp mode closes both.

## 2. Shape — distinct vs FGAP-089, residual-of vs FGAP-120

Both read fresh from the active substrate (`.context`).

- **FGAP-089** (identified, P3) — *target-substrate* scope-blindness: the hooks match op-shape / CLI-invocation
  shape and never inspect `--cwd` or the `.pi-context.json` active-substrate pointer, so a write/invocation
  against a throwaway `--cwd` substrate is blocked like one against the active substrate. That is a **different
  axis**: it presumes the command *is* a real pi-context op and asks *which substrate* it targets. The present
  gap is that the command is **not a pi-context op at all** (a `git commit`), yet the recognizer fires. **Distinct.**

- **FGAP-120** (closed, P2) — *quote-blindness*: introduced the line-32 strip so shell metacharacters that are
  DATA inside quoted values stop matching as shell syntax. Its closure note and acceptance matrix (harness rows
  in `block-pi-context-glue.test.sh`) explicitly include "a non-pi-context git commit -m mentioning the CLI" —
  but that row (test line 145) is **single-line**, which the per-line strip handles. FGAP-120's fix and its
  acceptance matrix contain **no multi-line row**, so the line-scoping of `perl -pe` was never exercised. The
  present gap is the **same class (quote-blindness), same artifact (line 32), same author-intended behavior**,
  differing only in the multi-line dimension FGAP-120 left untested. **Not a new independent class and not
  FGAP-089 — it is the residual multi-line facet of FGAP-120.** Recommended filing form: a new FGAP that names
  FGAP-120 as the parent whose fix it completes (relate, do not refile FGAP-089's class).

## 3. Reproduction transcripts (verbatim, against a scratchpad copy)

Hook copy = byte-identical `cp` of the live guard. PreToolUse input shape = `{"tool_input":{"command":…}}`.

### Case (1) — the exact command blocked live this session

Command (from claude-history, tool_execution that returned the echo/`$?` block):
```
npm run build > /tmp/mid-merge-build.log 2>&1; echo "BUILD:$?"; git commit -m "$(cat <<'EOF'
merge: install ceremony materializes editable agent specs (single canonical tier)
…
The 26 bundled agent specs relocate to the pi-context samples catalog
… the substrate's agents/ dir … the loader's project tier … the orchestrator's own ceremony demo.
…
EOF
)"
```
Result against the copy:
```
Blocked: run ONE bare clean pi-context op per Bash call — no echo narration or banners …
EXITCODE=2
```

### Control matrix (hook COPY; token rehydrated in a runner file so the runner's own argv carries no trigger)

```
PASS  exit=0 want=0  CONTROL A: glue shape, NO trigger-word text anywhere
FAIL  exit=2 want=0  CONTROL B: multi-line commit body MENTIONS the CLI + has echo, no real op
PASS  exit=0 want=0  CONTROL C: single-line same text (strip works on one line)
PASS  exit=2 want=2  TRUE-POSITIVE: real op + ancillary echo (discipline forbids wrapping)
PASS  exit=2 want=2  TRUE-POSITIVE: real op piped to grep
```
- CONTROL A isolates: glue alone, no mention → passes (glue is recognizer-gated).
- CONTROL B is the reduced repro (2-line `-m "…"` mentioning the CLI, interior `echo`) → false-positive block.
- CONTROL C is CONTROL B's text on ONE line → passes. The single delta B↔C is the newline → confirms line-scoping
  as the sole cause.
- Both true positives still block.

CONTROL B command (real token shown):
```
git commit -m "line one about pi-context samples
line two; echo done"
```

## 4. Proposed fix shape

Change line 32 to slurp the whole command before substituting:

```
cmd=$(printf '%s' "$cmd" | perl -0777 -pe "s/'[^']*'|\"(?:\\\\.|[^\"\\\\])*\"/Q/g")
```

`-0777` sets the input record separator to undef, so perl reads the entire command as one record and the
substitution runs once over multi-line text. Negated classes (`[^']`, `[^"\\]`) already match newlines, so a
multi-line quoted span collapses to `Q` exactly as a single-line one does.

Properties verified against the copy:
- **Closes the class**: case (1) → exit 0; CONTROL B → exit 0; the multi-line single-quoted-payload instance
  (`--item '{"…\n…|…"}'`) also collapses (strictly better than line-scoping, which would leak its `|`).
- **No true-positive loss**: real-op + ancillary echo → still exit 2; real-op piped → still exit 2.
- **No regression**: the full existing harness runs 28/28 against the slurp copy (identical to the live guard's
  current 28/28).
- **Fail-closed preserved**: an unbalanced/unterminated quote still fails to match under slurp (no closing quote
  in the whole record), so it is left visible → over-block, never under-block, matching FGAP-120's stated
  degradation contract. A real op is never inside a quoted span, so slurp cannot swallow a genuine invocation.

Note on the team-lead-proposed shape ("gate every glue pattern on the command containing a pi-context
invocation; scope the `$?`/banner checks to segments around the invocation"): the glue patterns are already
recognizer-gated (CONTROL A), so no gating needs adding — the defect is the recognizer's quote-strip. And
**segment-scoping the `$?`/banner checks would regress a true positive**: the discipline is "one bare op per
call — no ancillary commands wrapping the op," so a real op sharing a command with unrelated `echo "…$?"` in
another segment is a *deliberate* block (the true-positive rows). Narrowing glue to the op's own segment would
let `pi-context <op>; npm run build; echo "$?"` through, weakening the one-bare-op rule. The correct, narrower
fix is the whole-command strip alone.

### Test harness (`block-pi-context-glue.test.sh`) — rows a fix must add

Existing harness has no multi-line row (the coverage hole that let FGAP-120 close with the defect latent). Add:

- MUST PASS (exit 0): multi-line double-quoted commit message that mentions `pi-context` and contains an interior
  `echo`/`$?`/`|` — i.e. the case-(1) shape and the CONTROL-B reduction.
- MUST PASS (exit 0): multi-line single-quoted `--item` payload whose interior contains `|`, ` > `, `$?`
  (data metacharacters across a newline).
- MUST STILL BLOCK (exit 2, regression guard): a genuine multi-line true positive — a real op with an actual
  unquoted trailing `| grep x` split across a line continuation — to prove slurp does not swallow real glue.
- Retain all 28 current rows unchanged (verified green under slurp).

## 5. Proposed FGAP filing (rhetorical-register-compliant; propose, do not file)

- **title**: `block-pi-context-glue.sh quote-strip is line-scoped (perl -pe) — a quoted span crossing a newline is not neutralized, so a multi-line quoted CLI mention (e.g. a git-commit message) false-positives the recognizer and glue heuristics`
- **status**: `identified`  **priority**: `P2`  **package**: `pi-context`
- **canonical_vocabulary**: `multi-line quote-aware hook pattern matching`
- **description**: `The FGAP-120 quote-strip at .claude/hooks/block-pi-context-glue.sh line 32 uses perl -pe, which substitutes line by line, so a single- or double-quoted span that opens on one physical line and closes on a later line is never collapsed to the 'Q' placeholder — its interior leaks into the skeleton the recognizer (line 35) and the four glue heuristics (lines 43/48/59/64) consume. Confirmed live twice this session: git commit -m "$(cat <<'EOF' … the pi-context samples catalog … EOF )" was blocked with the echo/$? message though it contains no pi-context op — the multi-line -m "…" is not stripped, the body's literal 'pi-context' mention matches the recognizer, and the build pipeline's '; echo "BUILD:$?"' matches the echo branch. Reduced repro: a 2-line double-quoted commit message mentioning the CLI blocks (exit 2); the identical text on ONE line passes (exit 0) — the sole delta is the newline. Class: the quote-strip neutralizes only single-line quoted spans; any quoted span crossing a newline leaks its interior metacharacters and CLI-name mentions, false-matching both the recognizer and (for a multi-line single-quoted --item payload on a real op) the glue branches. This is the residual multi-line facet of FGAP-120 (quote-blindness, closed) on the same artifact and line — FGAP-120's fix and acceptance matrix (harness) tested only single-line quoted mentions. Distinct from FGAP-089 (target-substrate scope-blindness, a different axis).`
- **evidence**:
  - `{file: .claude/hooks/block-pi-context-glue.sh, lines: "32", reference: "perl -pe strips per line; multi-line quoted spans never collapse"}`
  - `{file: .claude/hooks/block-pi-context-glue.sh, lines: "35", reference: "recognizer matches the surviving 'pi-context ' mention in an un-stripped multi-line quoted body"}`
  - `{file: .claude/hooks/block-pi-context-glue.test.sh, lines: "145-146", reference: "the FGAP-120 recognizer-FP row is single-line only — no multi-line row exercises the line-scoping"}`
  - `{file: analysis/2026-07-13-glue-hook-scope-false-positive-gap.md, reference: "investigation: skeleton dump, CONTROL A/B/C boundary matrix, slurp-mode fix verified 28/28 + controls + true positives, fail-closed argument"}`
- **impact**: `Any Bash command that both mentions pi-context inside a multi-line quoted argument (a git commit describing pi-context work; a heredoc/JSON payload discussing the CLI) and contains a shell metacharacter elsewhere is blocked though it invokes no pi-context op. Observed blocking legitimate mid-merge build+commit work twice this session. Because the multi-line dimension is where forensic commit messages about this very tooling live, the guard most often misfires on commits describing pi-context changes.`
- **proposed_resolution**: `Make the line-32 strip whole-command: perl -0777 -pe (slurp) so the substitution runs once over the full multi-line command and negated-class quoted spans collapse across newlines exactly as single-line spans do. Verified on a scratchpad COPY: case (1) and the CONTROL-B reduction pass (exit 0); a multi-line single-quoted --item payload with an interior | also passes; both true positives (real op + ancillary echo; real op piped) still block; the full existing harness is 28/28; degradation on unbalanced quoting stays fail-closed (an unterminated quote finds no close in the whole record, is left visible, over-blocks). Reject the alternative "segment-scope the glue checks" — the glue branches are already recognizer-gated (a no-mention control passes), and segment-scoping would let real-op + ancillary-glue-in-another-segment through, regressing the one-bare-op rule. Extend block-pi-context-glue.test.sh with multi-line rows (double-quoted commit-message mention → pass; multi-line single-quoted payload with data | / > / $? → pass; a genuine multi-line true-positive pipe → block). Develop against a COPY, never the live guard. Relate to FGAP-120 as the parent quote-blindness class this completes; distinct from FGAP-089. Grounding: analysis/2026-07-13-glue-hook-scope-false-positive-gap.md.`
- **relations (proposed)**: relate to FGAP-120 (same class/artifact, completes its multi-line facet); relate to FGAP-089 as sibling-on-artifact, distinct class.
