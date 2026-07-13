#!/usr/bin/env bash
# PreToolUse(Bash) guard: enforce pi-context-cli direct-drive discipline.
# Blocks piping the reflecting pi-context CLI output through ANY post-processor
# (its own stdout piped anywhere — a chokepoint, not a tool denylist), silencing its stderr (2>/dev/null),
# wrapping it in a shell loop (for/while … do … done) that batches the CLI
# instead of one clean op per question, REDIRECTING ITS STDOUT TO A FILE
# (pi-context <op> … > /tmp/x) to dump-then-read elsewhere, or WRAPPING IT IN echo
# NARRATION / EXIT-CAPTURE GLUE (echo "=== … ===" banners, `; echo "exit=$?"`, `$?`)
# instead of running ONE bare op whose raw output is the evidence and whose exit the
# harness reports — all of which bypass direct inline consumption and suppress the
# friction signal that feeds dev possibilities.
# Discipline: one clean op per question; the output lands inline and is read directly;
# narrow large results with the op itself (filter-block-items / read-block-page --limit /
# read-schema --path / read-block-item); bulk via resolve-items-by-id.
# Exit 2 => block, stderr fed back to the agent.

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')
[ -z "$cmd" ] && exit 0

# Quote-awareness: strip quoted spans to a skeleton BEFORE any heuristic runs, so shell
# metacharacters that are DATA inside quoted argument values (e.g. a `|` in a --value regex,
# ` > ` / `2>/dev/null` / `; echo ` / `$?` / prose `for … do` inside a JSON payload) are no longer
# visible as shell syntax. A single left-to-right COMBINED substitution replaces each single-quoted
# span and each double-quoted span (honoring `\"` escapes) with the placeholder `Q`; combined
# left-to-right matching is load-bearing — a two-pass strip mishandles interleaved quotes and `\"`
# escapes. Inter-token shell operators OUTSIDE quotes survive, so genuine glue still blocks. The
# recognizer below also matches this skeleton, so a quoted MENTION of `pi-context` in an unrelated
# command (e.g. `git commit -m "… pi-context … |"`) becomes `Q` and is NOT pulled into the guard.
# Degradation on exotic/unbalanced quoting is FAIL-CLOSED (over-block, never under-block): stripping
# only ever removes text a pattern could match. Requires perl (already the hook depends on jq).
# SLURP MODE (-0777) is load-bearing: plain -pe substitutes line by line, so a quoted span that
# opens on one physical line and closes on a later one is never collapsed — its interior (a literal
# CLI-name mention in a multi-line commit message; data `|`/`>`/`$?` in a multi-line --item payload)
# leaks into the skeleton and false-positives the recognizer and glue branches. -0777 reads the whole
# command as ONE record so the negated classes ([^'], [^"\\] — both match newline) collapse a
# multi-line span exactly as a single-line one. An unterminated quote finds no close in the whole
# record either, stays visible, and over-blocks — same fail-closed contract.
cmd=$(printf '%s' "$cmd" | perl -0777 -pe "s/'[^']*'|\"(?:\\\\.|[^\"\\\\])*\"/Q/g")

# Is this a reflecting pi-context CLI invocation? (bin.js path or the `pi-context <op>` form)
if printf '%s' "$cmd" | grep -Eq 'pi-context-cli/dist/bin\.js|(^|[;&|]| )pi-context '; then
  # ...piped into ANY post-processor (the pi-context invocation's own stdout piped
  # anywhere — chokepoint, not a denylist of specific tools), or stderr silenced?
  # The op->pipe bridge is redirect-TOLERANT: ([^;&|<>]|>>?&?[0-9-]?|<<?)* consumes any
  # intervening redirect (2>&1, 1>&2, 2>/dev/null, 1>file, >file) — the `&` in a fd-dup is
  # matched by the >>?&?[0-9-]? alt, so it no longer halts the bridge as the prior [^;&|]*
  # did (that halt let `2>&1 |` evade). The terminating \|($|[^|]) requires a genuine single
  # pipe: `[^|]`/end-of-line after `|` excludes logical-OR `||` (|| is not keyed as a pipe).
  if printf '%s' "$cmd" | grep -Eq '(pi-context |bin\.js )([^;&|<>]|>>?&?[0-9-]?|<<?)*\|($|[^|])|2>[[:space:]]*/dev/null'; then
    echo "Blocked: do not pipe pi-context CLI output through ANYTHING (no | after the op — not grep/jq/awk/node/python3/perl/xargs/tee or any other), nor silence its stderr with 2>/dev/null. pi-context output must land inline and be read directly; narrow a large result with the op itself (filter-block-items / read-block-page --limit / read-schema --path / read-block-item), never post-process it in the shell. This is the pi-context-cli direct-drive discipline; friction is a gap to file, not to route around." >&2
    exit 2
  fi
  # ...or wrapped in a shell loop (for/while … do … done) batching the CLI?
  if printf '%s' "$cmd" | grep -Eq '(^|[;&|]|[[:space:]])(for|while)[[:space:]].*[[:space:]]do([[:space:]]|;|$)'; then
    echo "Blocked: do not wrap the pi-context CLI in a shell loop (for/while … do … done) to batch reads/writes. One clean op answers one question. For many ids use the bulk op (resolve-items-by-id); otherwise issue separate single invocations — never a loop. This is the pi-context-cli direct-drive discipline; friction is a gap to file, not to route around." >&2
    exit 2
  fi
  # ...or its STDOUT redirected to a file (the dump-then-read bypass)? Anchored to the
  # pi-context command's own stdout redirect (`pi-context <op> … > file` / `>>` / `1>`),
  # so a separate `cat > /tmp/x.json` input-payload write or `--item @file` does NOT trip it.
  # `2>file` (stderr capture) is not stdout and is not matched here.
  # Same redirect-tolerant bridge as the pipe branch: an fd-dup like `2>&1` wedged before the
  # file redirect (e.g. `pi-context <op> 2>&1 1>/tmp/x`) no longer defeats detection — the
  # prior [^;&|]* halted at the `&` and let that form evade the stdout-to-file block.
  if printf '%s' "$cmd" | grep -Eq '(pi-context |bin\.js )([^;&|<>]|>>?&?[0-9-]?|<<?)*[[:space:]]1?>>?[[:space:]]*[^[:space:]<>&|;]'; then
    echo "Blocked: do not redirect pi-context CLI stdout to a file (e.g. pi-context <op> … > /tmp/x) to read it elsewhere — that bypasses direct inline consumption and suppresses the friction signal that feeds dev possibilities. Let the output land inline in the command result and read it directly; for a large result, NARROW the op itself (filter-block-items / read-block-page --limit / read-schema --path / read-block-item) rather than dump-and-read. (Input payloads via --item @file / --updates @file are fine — write them with cat/printf, never by redirecting pi-context.) This is the pi-context-cli direct-drive discipline; friction is a gap to file, not to route around." >&2
    exit 2
  fi
  # ...or wrapped in echo narration / banners or exit-capture glue ($?), instead of a bare op?
  if printf '%s' "$cmd" | grep -Eq '(^|[;&|])[[:space:]]*echo([[:space:]]|$)|\$\?'; then
    echo "Blocked: run ONE bare clean pi-context op per Bash call — no echo narration or banners (echo \"=== … ===\"), no exit-capture glue (echo \"exit=\$?\" or \$?), no ancillary commands wrapping the op. The raw output IS the evidence and the harness reports the exit code itself; wrapping the CLI in echo/\$? obscures whether you are actually using and evaluating it. This is the pi-context-cli direct-drive discipline; friction is a gap to file, not to route around." >&2
    exit 2
  fi
fi
exit 0
