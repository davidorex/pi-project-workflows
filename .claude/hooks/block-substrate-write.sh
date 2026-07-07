#!/usr/bin/env bash
# PreToolUse(Write|Edit|NotebookEdit) guard: reject direct file-writes that land on the
# active substrate's JSON. The active substrate dir is named by .pi-context.json's
# contextDir field (an active-substrate pointer that can be switched, like a git branch),
# so this guard resolves it at runtime — it is NOT hardcoded to ".context".
#
# The op-layer (pi-context CLI append/update/upsert/complete-task) validates every
# substrate write against its AJV schema, stamps DispatchContext attestation, and enforces
# invariants + closure-table + gate ceremonies. A raw Edit/Write on a substrate *.json
# bypasses ALL of that — a parallel ungated path around the op-layer's gates. This hook
# closes that hole: substrate JSON is ops-only. A genuinely missing op is an FGAP to file,
# not a bypass to reach for. There is no escape sentinel.
#
# Scope: BLOCK iff the normalized target path is under $CLAUDE_PROJECT_DIR/$contextDir/ AND
# ends in .json. This covers top-level substrate JSON (tasks.json, config.json,
# relations.json, objects/*.json) and schemas/*.json (they live under the substrate dir).
# A .md/.ts/etc. under the substrate dir is NOT blocked; a .json outside it is NOT blocked.
#
# Fail-open, matching the sibling hooks (block-control-chars.sh, gap-register-guard.sh):
# jq-absent, malformed input, or an absent/empty contextDir pointer => exit 0 (a broken
# hook must never brick all edits). Exit 2 => block, stderr fed back to the agent.

input=$(cat)

# Target path: file_path (Edit/Write) OR notebook_path (NotebookEdit), whichever is present.
target=$(printf '%s' "$input" | jq -r '.tool_input.file_path // .tool_input.notebook_path // empty' 2>/dev/null)
[ -z "$target" ] && exit 0

# Active substrate dir name from the pointer. Absent/empty => nothing to guard.
contextDir=$(jq -r '.contextDir // empty' "$CLAUDE_PROJECT_DIR/.pi-context.json" 2>/dev/null)
[ -z "$contextDir" ] && exit 0

# Normalize to an absolute path rooted at the repo. The target may not exist yet (a Write
# creates it), so do NOT realpath the target — string-prefix comparison on normalized paths.
case "$target" in
	/*) abs_target="$target" ;;
	*)  abs_target="$CLAUDE_PROJECT_DIR/$target" ;;
esac

# The substrate root, also normalized to absolute. contextDir is repo-relative in practice
# but tolerate an absolute value too.
case "$contextDir" in
	/*) abs_substrate="$contextDir" ;;
	*)  abs_substrate="$CLAUDE_PROJECT_DIR/$contextDir" ;;
esac

# Collapse any ".." / "." / redundant-slash segments so a path like
# $CLAUDE_PROJECT_DIR/.context/../.context/tasks.json can't slip the prefix test.
normalize() {
	local path="$1" out=() seg IFS='/'
	for seg in $path; do
		case "$seg" in
			''|.) ;;                          # drop empty + "."
			..)  [ ${#out[@]} -gt 0 ] && unset 'out[${#out[@]}-1]' ;;
			*)   out+=("$seg") ;;
		esac
	done
	printf '/%s' "${out[@]}"
}
abs_target=$(normalize "$abs_target")
abs_substrate=$(normalize "$abs_substrate")

# BLOCK iff under the substrate dir AND ends in .json.
case "$abs_target" in
	"$abs_substrate"/*.json)
		cat >&2 <<MSG
Blocked: a direct Edit/Write on the active substrate's JSON ($contextDir/… .json) is forbidden. The substrate is the project-management system and its JSON is ops-only.

Substrate writes go THROUGH the pi-context CLI ops (append-block-item / update-block-item / upsert-block-item / append-relation / complete-task), which validate against the block's AJV schema, stamp DispatchContext attestation, and enforce the invariant + closure-table + gate ceremonies. A raw Edit/Write bypasses ALL of that — the exact parallel ungated path this guard closes.

Re-issue this change as the corresponding pi-context op:
  pi-context append-block-item --block <name> --arrayKey <key> --autoId true --item @/tmp/<id>.json --writer '{"kind":"human","user":"davidryan@gmail.com"}' --json
  pi-context update-block-item --block <name> --arrayKey <key> --match '{"id":"…"}' --updates '{…}' --writer … --json

If NO op exists for the write you need, that is a framework gap to file (FGAP), not a bypass to reach for. There is no escape sentinel.
MSG
		exit 2
		;;
esac

exit 0
