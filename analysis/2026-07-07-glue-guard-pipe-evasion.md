# block-pi-context-glue.sh pipe-evasion — root cause, repro, fix

Date: 2026-07-07
File under repair: `.claude/hooks/block-pi-context-glue.sh` (LIVE, repo-wide PreToolUse(Bash) guard)
Harness added: `.claude/hooks/block-pi-context-glue.test.sh`
Backs a later FGAP filing.

## What the guard is for

`block-pi-context-glue.sh` enforces pi-context-cli direct-drive discipline: a reflecting
pi-context CLI invocation (`pi-context <op>` or `…/pi-context-cli/dist/bin.js`) must run as ONE
bare op whose raw stdout lands inline and is read directly. It blocks four evasion classes:
(1) stdout piped to any post-processor OR stderr silenced `2>/dev/null`; (2) a for/while loop
batching the CLI; (3) stdout redirected to a file (dump-then-read); (4) echo-narration / `$?`
exit-capture glue. Exit 2 => blocked, stderr fed back to the agent.

## The defect (root cause — confirmed empirically, not assumed)

The pipe-detection regex (block 1) was:

    (pi-context |bin\.js )[^;&|]*\|

The bridge `[^;&|]*` between the op token and the terminating `\|` is a NEGATED CHARACTER
CLASS that matches any run of characters EXCEPT `;`, `&`, or `|`. Consequently the match run
HALTS at the first `&`. A redirect that contains `&` — canonically `2>&1` (merge stderr into
stdout), also `1>&2`, or any `>&fd` fd-duplication — wedged between the op and the pipe stops the
bridge before it ever reaches the `|`. The pipe is therefore NOT detected and the command is
allowed through.

Empirical confirmation (old regex, run directly against the two forms):

    printf '%s' 'pi-context resolve-items-by-id --ids ... --json 2>&1 | npx tsx -e "x"' \
      | grep -Eq '(pi-context |bin\.js )[^;&|]*\|'   ->  NO MATCH (evades)
    printf '%s' 'pi-context read-block --json | grep x' \
      | grep -Eq '(pi-context |bin\.js )[^;&|]*\|'   ->  MATCH (plain pipe still caught)

So the class is precise: any `pi-context <op> … <&-bearing-token> | <post-processor>` slips the
pipe branch. `2>&1 |` is the common instance; `1>&2 |` and a stray `&`/`>&`-bearing token before
the pipe are the same mechanism. `2>&1` merging stderr into the piped stream is itself part of the
evasion class, not incidental.

### Today's verbatim evasion strings (run today, slipped through unblocked)

    pi-context resolve-items-by-id --ids '["TASK-093","TASK-094"]' --json 2>&1 | npx tsx -e "…"
    pi-context read-block-item --block research --arrayKey research --match '{"id":"R-0028"}' --json 2>&1 | npx tsx -e "…"

Both are now primary regression cases in the harness (BLOCK / exit 2).

## Did blocks (2), (3), (4) share the fragility?

- **Block (3) — stdout-to-file — YES, shared it.** Its bridge was the identical `[^;&|]*`:

      (pi-context |bin\.js )[^;&|]*[[:space:]]1?>>?[[:space:]]*[^[:space:]<>&|;]

  So `pi-context <op> 2>&1 1>/tmp/x` (fd-dup wedged before the file redirect) halted the bridge
  at the `&` and evaded the stdout-to-file block. Confirmed by the harness against the pre-fix
  live guard: the `2>&1 1>/tmp/x` case returned exit 0 (want 2).

- **Block (2) — for/while loop — NO.** Its regex
  `(^|[;&|]|[[:space:]])(for|while)[[:space:]].*[[:space:]]do…` uses `.*` (unrestricted) between
  `for/while` and `do`, not an op-anchored negated-class bridge. An `&`-bearing token does not
  halt `.*`. Left unchanged.

- **Block (4) — echo/`$?` glue — NO.** Its regex
  `(^|[;&|])[[:space:]]*echo([[:space:]]|$)|\$\?` has no op->target negated-class bridge; it keys
  on `echo` at command-start/after-separator or a literal `$?` anywhere. No `&`-halt surface.
  Left unchanged.

Only blocks (1) and (3) carried the negated-class bridge, so only they were fixed.

## The fix

Replace the fragile bridge `[^;&|]*` in BOTH blocks (1) and (3) with a redirect-TOLERANT bridge:

    ([^;&|<>]|>>?&?[0-9-]?|<<?)*

- `[^;&|<>]` — ordinary argument characters (now also excludes `<`/`>` so redirect operators are
  only ever matched by the explicit alternatives below, never as stray arg chars).
- `>>?&?[0-9-]?` — an output-redirect / fd-duplication operator: `>`, `>>`, `>&1`, `>&-`, etc.
  Crucially this alternative CONSUMES the `&` of a fd-dup, so `2>&1` (the `2` is an ordinary arg
  char, then `>&1` via this alt) no longer halts the bridge.
- `<<?` — input redirect `<` / `<<` (completeness; a determined `<`-bearing token can't halt it
  either).

Block (1) terminator, unchanged in intent but now reached through the tolerant bridge, plus an
explicit logical-OR guard:

    …\|($|[^|])

`\|` followed by end-of-line or a non-`|` char requires a GENUINE single pipe. `||` (logical-OR)
is excluded: after the first `|` the next char is `|`, which fails `[^|]`, and the bridge cannot
consume a `|` to re-anchor. This satisfies "distinguish a real pipe `|` from logical-OR `||` — do
not let `||` be the thing you key on." The `2>[[:space:]]*/dev/null` stderr-silence alternative is
preserved verbatim.

Block (3) terminator (`[[:space:]]1?>>?[[:space:]]*[^[:space:]<>&|;]`) is unchanged — only its
bridge was swapped. It still matches an stdout `>`/`>>`/`1>` to a filename and still does NOT
match `2>file` (stderr capture, whose `>` is preceded by `2`, not by space/`1`) nor `>&fd`
fd-dup (the `[^…&…]` after the redirect rejects `&`). POSIX ERE backtracking frees a bridge-
consumed trailing `>` so the redirect the block is looking for is still found.

Full deployed regexes:

    block 1: (pi-context |bin\.js )([^;&|<>]|>>?&?[0-9-]?|<<?)*\|($|[^|])|2>[[:space:]]*/dev/null
    block 3: (pi-context |bin\.js )([^;&|<>]|>>?&?[0-9-]?|<<?)*[[:space:]]1?>>?[[:space:]]*[^[:space:]<>&|;]

## Carve-out preserved (verbatim behavior, no new exception invented)

The one documented pass-case is unchanged: writing a payload FILE to feed INTO an op —
`--item @file` / `--updates @file`, and a separate `cat >file` / `printf >file` / heredoc that
authors an input payload (NOT redirecting a pi-context op's own stdout). Neither block fires on it
because it carries no pi-context-stdout pipe and no pi-context-stdout `>` redirect. Confirmed by
harness cases. No pass-case beyond the existing carve-out was added.

## Behavior change worth noting (tightening + one corrected mis-classification)

- **Tightening:** the redirect-tolerant bridge catches strictly MORE — every `<redirect> |` and
  `<redirect> >file` form that the `&`-halt previously let through is now blocked.
- **Corrected mis-classification:** the OLD block-1 regex matched `||` as if it were a pipe
  (`[^;&|]*\|` stops at the first `|` of `||`), so `pi-context <op> || cmd` was blocked as a
  "pipe". The fix stops keying on `||`, per the explicit instruction to distinguish it; such a
  command now passes the pipe branch (it does not route stdout anywhere). This is compliance with
  the distinguish-`||` requirement, not a weakening of pipe detection — a genuine stdout pipe is
  still always caught.

## Test matrix (harness: `.claude/hooks/block-pi-context-glue.test.sh`)

The harness resolves the hook under test from `GLUE_HOOK` (default = live sibling), so the same
cases ran against the WIP copy, then the deployed live file. Both: 18 passed, 0 failed.

MUST BLOCK (exit 2): verbatim evasion #1 (`resolve-items-by-id … 2>&1 | npx tsx`); verbatim
evasion #2 (`read-block-item research … 2>&1 | npx tsx`); `… 2>&1 | grep x`; `… 2>&1 | jq .`;
`… | npx tsx -e` (plain pipe); `… 2>/dev/null | head`; `… 1>&2 | cat`; `… 2>&1 1>/tmp/x`
(block-3 fd-dup-before-file, was evadable); `… |& grep x`; `… --json > /tmp/x`; for-loop over the
CLI; echo-banner; `$?` exit-capture.

MUST PASS (exit 0): bare op; non-pi-context command with a pipe (`ls | grep foo`); logical-OR
`… --json || true`; input-payload heredoc write (`cat > file <<'JSON' …`); carve-out append
`… --item @/tmp/p.json --json`.

Discrimination check: the SAME harness run against the PRE-fix live guard reported 7 failures —
all six redirect-wedged pipe/file evasions returned exit 0 (leaked), and `|| true` returned exit 2
(the old `||`-as-pipe mis-classification) — proving the harness is not a no-op and the leak was
real.

## Scope / constraints honored

Changes confined to `.claude/hooks/block-pi-context-glue.sh` (final live deploy only, after the
copy passed), the new `.claude/hooks/block-pi-context-glue.test.sh`, and this analysis md.
Development and iteration were done against a copy at `/tmp/glue-fix/block-pi-context-glue.sh`; the
live file was overwritten only once the copy passed its full matrix, then re-tested live. No git
commit, no npm, no substrate/`.pi/`/package-source touched.
