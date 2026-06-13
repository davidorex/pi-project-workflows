#!/usr/bin/env bash
# PreToolUse(Bash) guard: enforce pi-context-cli direct-drive discipline.
# Blocks piping the reflecting pi-context CLI output through post-processing glue
# (grep/jq/sed/awk/head/tail/cut/tr/wc/node), silencing its stderr (2>/dev/null),
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

# Is this a reflecting pi-context CLI invocation? (bin.js path or the `pi-context <op>` form)
if printf '%s' "$cmd" | grep -Eq 'pi-context-cli/dist/bin\.js|(^|[;&|]| )pi-context '; then
  # ...piped into post-processing glue, or stderr silenced?
  if printf '%s' "$cmd" | grep -Eq '\|[[:space:]]*(grep|jq|sed|awk|head|tail|cut|tr|wc|node)([[:space:]]|$)|2>[[:space:]]*/dev/null'; then
    echo "Blocked: do not pipe pi-context CLI output through grep/jq/sed/awk/head/tail/cut/tr/wc/node, nor silence its stderr with 2>/dev/null. Drive one clean CLI op per question and read the whole JSON node (read-block-item / read-block-page / read-schema). This is the pi-context-cli direct-drive discipline; friction is a gap to file, not to route around." >&2
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
  if printf '%s' "$cmd" | grep -Eq '(pi-context |bin\.js )[^;&|]*[[:space:]]1?>>?[[:space:]]*[^[:space:]<>&|;]'; then
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
