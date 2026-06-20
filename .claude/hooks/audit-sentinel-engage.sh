#!/usr/bin/env bash
# UserPromptSubmit hook: establish the audit-loop's active sentinel at INVOCATION,
# before the authoring agent runs, from something the agent does not author.
#
# When the submitted prompt invokes `/audit-task-resolution TASK-NNN`, write the
# run's active sentinel `tmp/audit-loop-state/active-TASK-NNN`. The authoring agent
# operates inside an already-engaged gate; it never creates or owns the sentinel.
# The deterministic Stop-hook checker clears the sentinel only on clean+ratified.
#
# Exit 0 always (a UserPromptSubmit hook that exits non-zero blocks the prompt).

input=$(cat)
prompt=$(printf '%s' "$input" | jq -r '.prompt // empty')
[ -z "$prompt" ] && exit 0

# Match `/audit-task-resolution TASK-<NNN>` and capture the task id.
if [[ "$prompt" =~ /audit-task-resolution[[:space:]]+(TASK-[0-9]+) ]]; then
  task="${BASH_REMATCH[1]}"
  dir="${CLAUDE_PROJECT_DIR:-$(pwd)}/tmp/audit-loop-state"
  mkdir -p "$dir"
  : > "$dir/active-$task"
fi

exit 0
