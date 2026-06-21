#!/usr/bin/env bash
# PreToolUse(Bash) gate: deny any `git commit` unless the full project gate passes.
# Gate = the CI step set: ruff check + ruff format --check + mypy . + pytest + make test-js,
# run from school-improvement-plans/. Non-commit Bash calls pass through untouched.
# Output: a PreToolUse permissionDecision JSON ("deny" blocks the commit; silent exit 0 allows).
set -uo pipefail

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // ""' 2>/dev/null || printf '')

# Only gate actual git commits.
if ! printf '%s' "$cmd" | grep -Eq 'git[[:space:]].*commit'; then
  exit 0
fi

proj="${CLAUDE_PROJECT_DIR:-}"
sip="$proj/school-improvement-plans"
out=$(mktemp)

deny() {
  jq -n --arg r "$1" \
    '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
  exit 0
}

[ -d "$sip" ] || deny "gate hook: cannot find $sip"
cd "$sip" || deny "gate hook: cannot cd to $sip"

uv run ruff check . ../prompt-workshop/dispatch          >"$out" 2>&1 || deny "GATE BLOCKED — ruff check failed:
$(tail -5 "$out")"
uv run ruff format --check . ../prompt-workshop/dispatch >"$out" 2>&1 || deny "GATE BLOCKED — ruff format --check failed:
$(tail -5 "$out")"
uv run mypy .                    >"$out" 2>&1 || deny "GATE BLOCKED — mypy . failed:
$(tail -5 "$out")"
uv run pytest -q                 >"$out" 2>&1 || deny "GATE BLOCKED — pytest failed:
$(tail -5 "$out")"
make test-js                     >"$out" 2>&1 || deny "GATE BLOCKED — make test-js failed:
$(tail -5 "$out")"

# All green → allow.
exit 0
