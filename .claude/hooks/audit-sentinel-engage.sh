#!/usr/bin/env bash
# UserPromptSubmit hook: write the audit-loop's active sentinel
# tmp/audit-loop-state/active-TASK-NNN when the prompt invokes
# /audit-task-resolution with a task number. The authoring agent never creates
# or owns the sentinel; the SubagentStop checker clears it on machine-clean.
#
# A /audit-task-resolution invocation reaches this hook in one of three forms:
#   1. slash-command tags: <command-name>/audit-task-resolution</command-name>
#                          <command-args>003</command-args>
#   2. expanded skill body ending: ARGUMENTS: 003
#   3. raw inline prose: /audit-task-resolution 003
# Extract the digit run from whichever is present (priority 1,2,3), normalize to
# TASK- + the digits with leading zeros stripped, zero-padded to a minimum width
# of 3 (4->004, 21->021, 100->100, 1000->1000). The skill's own template text
# `/audit-task-resolution TASK-<NNN>` carries no digits and is ignored.
#
# Exit 0 always (a UserPromptSubmit hook that exits non-zero blocks the prompt).

input=$(cat)
prompt=$(printf '%s' "$input" | jq -r '.prompt // empty')
[ -z "$prompt" ] && exit 0

digits=""

# Form 1: slash-command tags. Bind <command-args> to the audit command-name so a
# different command's args cannot trigger it. [[:space:]]* spans the newline.
if [[ "$prompt" =~ \<command-name\>/audit-task-resolution\</command-name\>[[:space:]]*\<command-args\>([^\<]*)\</command-args\> ]]; then
  digits="${BASH_REMATCH[1]//[^0-9]/}"
fi

# Form 2: expanded skill body trailing "ARGUMENTS: <n>", only when the audit
# command is named in the prompt.
if [ -z "$digits" ] && [[ "$prompt" == *"/audit-task-resolution"* ]] && [[ "$prompt" =~ ARGUMENTS:[[:space:]]*([0-9][0-9]*) ]]; then
  digits="${BASH_REMATCH[1]}"
fi

# Form 3: raw inline `/audit-task-resolution 003`. The argument token must carry a
# digit, so the `<NNN>` template is not matched.
if [ -z "$digits" ] && [[ "$prompt" =~ /audit-task-resolution[[:space:]]+([^[:space:]]*[0-9][^[:space:]]*) ]]; then
  digits="${BASH_REMATCH[1]//[^0-9]/}"
fi

if [ -n "$digits" ]; then
  num=$((10#$digits))
  task=$(printf 'TASK-%03d' "$num")
  dir="${CLAUDE_PROJECT_DIR:-$(pwd)}/tmp/audit-loop-state"
  mkdir -p "$dir"
  : > "$dir/active-$task"
fi

exit 0
