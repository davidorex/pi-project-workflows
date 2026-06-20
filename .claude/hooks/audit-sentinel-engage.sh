#!/usr/bin/env bash
# UserPromptSubmit hook: establish the audit-loop's active sentinel at INVOCATION,
# before the authoring agent runs, from something the agent does not author.
#
# When the submitted prompt invokes `/audit-task-resolution <arg>`, write the
# run's active sentinel `tmp/audit-loop-state/active-TASK-NNN`. The authoring agent
# operates inside an already-engaged gate; it never creates or owns the sentinel.
# The deterministic Stop-hook checker clears the sentinel only on clean+ratified.
#
# The argument is accepted in any case and as a bare number: `4`, `004`, `task-4`,
# `TASK-004`, `Task004`, `task004` all mean TASK-004. Normalization: take the
# argument token, extract its digit run, strip leading zeros, zero-pad to a MINIMUM
# width of 3 (4->004, 21->021, 100->100, 1000->1000), prefix `TASK-`. The match
# requires the argument to CARRY DIGITS, so the skill's own template text
# `/audit-task-resolution TASK-<NNN>` (no digits in `<NNN>`) is naturally ignored.
#
# Exit 0 always (a UserPromptSubmit hook that exits non-zero blocks the prompt).

input=$(cat)
prompt=$(printf '%s' "$input" | jq -r '.prompt // empty')
[ -z "$prompt" ] && exit 0

# Capture the argument token after `/audit-task-resolution` (a run of non-space
# characters) and require it to contain at least one digit. `<NNN>` has none, so the
# literal template is not matched.
if [[ "$prompt" =~ /audit-task-resolution[[:space:]]+([^[:space:]]*[0-9][^[:space:]]*) ]]; then
  arg="${BASH_REMATCH[1]}"
  # Extract the digit run from the argument token.
  digits="${arg//[^0-9]/}"
  if [ -n "$digits" ]; then
    # Strip leading zeros (base-10), keeping a single 0 if the run is all zeros.
    num=$((10#$digits))
    # Zero-pad to a MINIMUM width of 3 (printf widens, never truncates >3-digit values).
    task=$(printf 'TASK-%03d' "$num")
    dir="${CLAUDE_PROJECT_DIR:-$(pwd)}/tmp/audit-loop-state"
    mkdir -p "$dir"
    : > "$dir/active-$task"
  fi
fi

exit 0
