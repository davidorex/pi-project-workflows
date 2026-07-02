#!/usr/bin/env bash
# PreToolUse(Write|Edit|NotebookEdit) guard: reject invisible control characters
# in file-write payloads — C0 controls except tab/LF/CR, plus DEL. Symmetric with
# the Bash tool's own input validation, which rejects commands containing control
# characters; Write/Edit accepted them silently, which is how a literal NUL landed
# in packages/pi-context/src/index.ts (2026-06-06, fixed 07ca9c7) and made the file
# invisible to the harness's ugrep -I search for 26 days. An LLM intending the
# escape SPELLING of a control character (backslash-u-0000 as six keystrokes)
# sometimes emits the raw character instead; this gate converts that silent
# corruption into immediate feedback. It fired on its own drafts: the Writes
# authoring this script twice emitted raw bytes where escape spellings were
# intended, which is why the test below is NUMERIC (codepoint comparison over
# explode) — this file contains no control characters and no escape spellings
# for an LLM's token stream to materialize.
#
# Checked fields: Write.content, Edit.new_string, NotebookEdit.new_source.
# Edit.old_string is deliberately NOT checked — fixing a file that already contains
# control characters requires matching them.
#
# Detection runs inside jq: the harness serializes payloads as JSON (raw control
# bytes arrive as backslash-u escapes), and jq decodes those back into real
# characters in its own string space; explode yields their codepoints. A bash
# variable could not hold a raw NUL, so the payload never transits one.
# Exit 2 => block, stderr fed back to the agent.

input=$(cat)

if printf '%s' "$input" | jq -e '
	[.tool_input.content // empty, .tool_input.new_string // empty, .tool_input.new_source // empty]
	| map(explode | any((. < 32 and . != 9 and . != 10 and . != 13) or . == 127))
	| any
' > /dev/null 2>&1; then
	echo "Blocked: the write payload contains an invisible control character (a C0 control other than tab/LF/CR, or DEL). You almost certainly intended the escape SPELLING (e.g. the six visible characters backslash-u-0-0-0-0) but emitted the raw character instead — re-issue the write with the escape sequence spelled out as visible text. Raw control bytes in text files silently break downstream tools (the harness's grep treats the file as binary and returns empty results)." >&2
	exit 2
fi
exit 0
