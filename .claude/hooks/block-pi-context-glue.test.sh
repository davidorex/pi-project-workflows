#!/usr/bin/env bash
# Runnable regression harness for block-pi-context-glue.sh. Self-contained: pipes synthetic
# PreToolUse tool-input JSON ({"tool_input":{"command":"…"}}) to the hook on stdin and asserts
# the exit code per case (2 => blocked, 0 => allowed). Exits 0 iff ALL cases pass.
# Requires jq (same dependency as the hook).
#
# Hook under test defaults to the sibling live guard; override with GLUE_HOOK to point at a
# work-in-progress COPY (the CLAUDE.md rule: develop/test a guard against a copy, never the live
# file). Example:
#   GLUE_HOOK=/tmp/glue-fix/block-pi-context-glue.sh bash .claude/hooks/block-pi-context-glue.test.sh
#   bash .claude/hooks/block-pi-context-glue.test.sh          # tests the deployed live guard
#
# Coverage centers on the pipe-evasion class this harness was written to lock down: a pi-context
# op whose stdout reaches a shell pipe `|` MUST be blocked regardless of any redirect (2>&1, 1>&2,
# 2>/dev/null, 1>file, >file) wedged between the op and the pipe — the negated-class bridge
# ([^;&|]*) in the pre-fix regex halted at the first `&`, so `2>&1 |` slipped through.

set -u

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
hook="${GLUE_HOOK:-$script_dir/block-pi-context-glue.sh}"
echo "# hook under test: $hook"
echo

pass=0
fail=0

# run_case <expected_exit> <description> <command-string>
run_case() {
	local expected="$1" desc="$2" command="$3" json actual
	json=$(jq -n --arg c "$command" '{tool_input:{command:$c}}')
	printf '%s' "$json" | "$hook" >/dev/null 2>&1
	actual=$?
	if [ "$actual" -eq "$expected" ]; then
		echo "PASS  (exit $actual, want $expected)  $desc"
		pass=$((pass + 1))
	else
		echo "FAIL  (exit $actual, want $expected)  $desc"
		fail=$((fail + 1))
	fi
}

# --- MUST BLOCK (exit 2) ---

# The two verbatim today-evasion strings (2>&1 wedged before the pipe defeated the old regex).
run_case 2 "BLOCK verbatim evasion #1: resolve-items-by-id … --json 2>&1 | npx tsx" \
	"pi-context resolve-items-by-id --ids '[\"TASK-093\",\"TASK-094\"]' --json 2>&1 | npx tsx -e \"process.stdout.write('x')\""

run_case 2 "BLOCK verbatim evasion #2: read-block-item research … --json 2>&1 | npx tsx" \
	"pi-context read-block-item --block research --arrayKey research --match '{\"id\":\"R-0028\"}' --json 2>&1 | npx tsx -e \"process.stdout.write('y')\""

run_case 2 "BLOCK read-block … --json 2>&1 | grep x" \
	"pi-context read-block --block tasks --json 2>&1 | grep x"

run_case 2 "BLOCK … --json 2>&1 | jq ." \
	"pi-context read-block --block tasks --json 2>&1 | jq ."

run_case 2 "BLOCK … | npx tsx -e '…' (plain pipe, no redirect)" \
	"pi-context read-block --block tasks --json | npx tsx -e 'process.stdout.write(String())'"

run_case 2 "BLOCK … 2>/dev/null | head (stderr silenced + pipe)" \
	"pi-context read-block --block tasks --json 2>/dev/null | head"

run_case 2 "BLOCK … 1>&2 | cat" \
	"pi-context read-block --block tasks --json 1>&2 | cat"

run_case 2 "BLOCK … 2>&1 1>/tmp/x (redirect-then-file, was evadable by the &-halt)" \
	"pi-context read-block --block tasks --json 2>&1 1>/tmp/x"

run_case 2 "BLOCK … |& grep x (pipe-both operator)" \
	"pi-context read-block --block tasks --json |& grep x"

run_case 2 "BLOCK stdout redirected to file: … --json > /tmp/x" \
	"pi-context read-block-item --block tasks --id TASK-001 --json > /tmp/x"

run_case 2 "BLOCK for-loop batching the CLI" \
	"for id in TASK-001 TASK-002; do pi-context read-block-item --block tasks --id \$id --json; done"

run_case 2 "BLOCK echo-banner narration wrapping the op" \
	"echo \"=== reading tasks ===\"; pi-context read-block --block tasks --json"

run_case 2 "BLOCK \$? exit-capture glue after the op" \
	"pi-context read-block --block tasks --json; echo \"exit=\$?\""

# --- MUST STILL BLOCK after quote-stripping (genuine unquoted glue survives the strip) ---

# A real pipe to grep with an unquoted op must still block once quoted spans are replaced by Q.
run_case 2 "BLOCK genuine pipe to grep survives quote-strip (… --json | grep x)" \
	"pi-context read-block --block tasks --json | grep x"

# 2>&1 | tsx (redirect-then-pipe) must still block after stripping (no quotes to strip here).
run_case 2 "BLOCK 2>&1 | tsx survives quote-strip" \
	"pi-context read-block --block tasks --json 2>&1 | npx tsx -e \"process.stdout.write('z')\""

# --- MUST PASS (exit 0) ---

run_case 0 "PASS  bare op (no pipe/redirect/glue)" \
	"pi-context read-block-item --block tasks --id TASK-001 --json"

run_case 0 "PASS  non-pi-context command containing a pipe (ls | grep foo)" \
	"ls | grep foo"

run_case 0 "PASS  logical-OR is not keyed as a pipe (… --json || true)" \
	"pi-context read-block-item --block tasks --id TASK-001 --json || true"

run_case 0 "PASS  input-payload write: cat > file <<heredoc authoring an --item payload" \
	"$(printf 'cat > /tmp/p.json <<'\''JSON'\''\n{"id":"X-1"}\nJSON')"

run_case 0 "PASS  input-payload carve-out: append-block-item … --item @/tmp/p.json --json" \
	"pi-context append-block-item --block research --arrayKey research --item @/tmp/p.json --json"

# --- MUST NOW PASS: quote-FP (a metacharacter that is DATA inside a quoted value) ---
# These were false-positives before the quote-strip; the strip replaces each quoted span with Q so
# the heuristics no longer see the data metacharacters as shell syntax.

# Alternation `|` inside a single-quoted --value (the CLI's own `matches` narrowing tool).
run_case 0 "PASS  quoted alternation in --value ('\"hook|guard\"')" \
	"pi-context filter-block-items --block framework-gaps --field description --op matches --value '\"hook|guard\"' --json"

# Alternation `|` inside a double-quoted --value (escaped inner quotes).
run_case 0 "PASS  quoted alternation in double-quoted --value" \
	"pi-context filter-block-items --block framework-gaps --field description --op matches --value \"\\\"termA|termB\\\"\" --json"

# Literal text 2>/dev/null inside a quoted JSON payload (prose, not stderr-silence).
run_case 0 "PASS  literal 2>/dev/null inside quoted payload" \
	"pi-context append-block-item --block framework-gaps --arrayKey gaps --item '{\"description\":\"agents silence stderr with 2>/dev/null\"}' --json"

# Prose 'for x do' inside a quoted --value (not a shell loop).
run_case 0 "PASS  prose 'for x do' inside quoted value" \
	"pi-context filter-block-items --block framework-gaps --field description --op matches --value '\"loop for x do something here\"' --json"

# ` > ` inside a quoted JSON payload (not a stdout redirect).
run_case 0 "PASS  ' > ' inside quoted JSON payload" \
	"pi-context update-block-item --block framework-gaps --arrayKey gaps --match '{\"id\":\"FGAP-001\"}' --updates '{\"note\":\"threshold a > b applies\"}' --json"

# \$? inside a quoted payload (not exit-capture).
run_case 0 "PASS  \$? inside quoted payload" \
	"pi-context append-block-item --block framework-gaps --arrayKey gaps --item '{\"description\":\"exit code via \$? is unreliable here\"}' --json"

# '; echo ' inside a quoted value (anchor char satisfied from inside quotes pre-strip).
run_case 0 "PASS  '; echo ' inside quoted value" \
	"pi-context filter-block-items --block framework-gaps --field description --op matches --value '\"run it; echo the result\"' --json"

# A NON-pi-context command whose quoted text merely MENTIONS the CLI + a pipe (recognizer FP).
run_case 0 "PASS  non-pi-context git commit -m mentioning 'pi-context … |'" \
	"git commit -m \"guard: pi-context output must not be piped | glue discipline\""

echo
echo "SUMMARY: $pass passed, $fail failed, $((pass + fail)) total"
[ "$fail" -eq 0 ]
