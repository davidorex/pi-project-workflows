#!/usr/bin/env bash
# Runnable regression harness for block-substrate-write.sh. Self-contained: pipes synthetic
# PreToolUse tool-input JSON to the hook and asserts the exit code per case. Exits 0 iff ALL
# cases pass, nonzero otherwise. Requires jq (same dependency as the hook).
#
# CLAUDE_PROJECT_DIR is derived from this script's own location (repo root = two dirs up from
# .claude/hooks/), then exported so the hook resolves .pi-context.json and normalizes paths
# against the real repo — the substrate dir name is read live from the pointer, not assumed.

set -u

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
repo_root=$(cd "$script_dir/../.." && pwd)
export CLAUDE_PROJECT_DIR="$repo_root"
hook="$script_dir/block-substrate-write.sh"

# The active substrate dir the hook will read — surfaced for transparency; cases below use
# ".context" literally because that is what the pointer currently names. If the pointer is
# switched, the ".context"-targeted BLOCK cases would need to track it; that is by design
# (the guard follows the pointer).
sub=$(jq -r '.contextDir // empty' "$repo_root/.pi-context.json" 2>/dev/null)
echo "# active substrate dir (from .pi-context.json contextDir): ${sub:-<none>}"
echo

pass=0
fail=0

# run_case <expected_exit> <description> <json>
run_case() {
	local expected="$1" desc="$2" json="$3" actual
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

# --- BLOCK cases (expect exit 2) ---
run_case 2 "BLOCK Write .context/tasks.json" \
	"$(jq -n '{tool_name:"Write",tool_input:{file_path:".context/tasks.json",content:"{}"}}')"

run_case 2 "BLOCK Edit .context/schemas/tasks.schema.json" \
	"$(jq -n '{tool_name:"Edit",tool_input:{file_path:".context/schemas/tasks.schema.json",old_string:"a",new_string:"b"}}')"

run_case 2 "BLOCK Write absolute \$CLAUDE_PROJECT_DIR/.context/relations.json" \
	"$(jq -n --arg fp "$repo_root/.context/relations.json" '{tool_name:"Write",tool_input:{file_path:$fp,content:"{}"}}')"

run_case 2 "BLOCK NotebookEdit notebook_path .context/foo.json" \
	"$(jq -n '{tool_name:"NotebookEdit",tool_input:{notebook_path:".context/foo.json",new_source:"x"}}')"

run_case 2 "BLOCK Write .context/objects/OBJ-1.json (nested objects/)" \
	"$(jq -n '{tool_name:"Write",tool_input:{file_path:".context/objects/OBJ-1.json",content:"{}"}}')"

run_case 2 "BLOCK Edit via .. traversal into substrate (.context/../.context/config.json)" \
	"$(jq -n '{tool_name:"Edit",tool_input:{file_path:".context/../.context/config.json",old_string:"a",new_string:"b"}}')"

# --- PASS cases (expect exit 0) ---
run_case 0 "PASS  Edit packages/pi-context/src/index.ts (package source)" \
	"$(jq -n '{tool_name:"Edit",tool_input:{file_path:"packages/pi-context/src/index.ts",old_string:"a",new_string:"b"}}')"

run_case 0 "PASS  Write analysis/2026-07-07-note.md (analysis md)" \
	"$(jq -n '{tool_name:"Write",tool_input:{file_path:"analysis/2026-07-07-note.md",content:"# note"}}')"

run_case 0 "PASS  Write .context/notes.md (substrate dir, not .json)" \
	"$(jq -n '{tool_name:"Write",tool_input:{file_path:".context/notes.md",content:"# note"}}')"

run_case 0 "PASS  Write docs/x.json (.json outside substrate dir)" \
	"$(jq -n '{tool_name:"Write",tool_input:{file_path:"docs/x.json",content:"{}"}}')"

echo
echo "SUMMARY: $pass passed, $fail failed, $((pass + fail)) total"
[ "$fail" -eq 0 ]
