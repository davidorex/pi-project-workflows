#!/usr/bin/env bash
# Test harness for block-pathspec-commit.sh — feeds Bash tool_input.command
# payloads and asserts the guard's exit code. 0 = allowed, 2 = blocked.
# HOOK_PATH env override points the harness at a development COPY of the guard
# (the guard-development rule: never iterate against the live hook).
set -u

HOOK="${HOOK_PATH:-$(cd "$(dirname "$0")" && pwd)/block-pathspec-commit.sh}"
pass=0
fail=0

run() { # $1=command string ; prints exit code
	printf '{"tool_input":{"command":%s}}' "$(printf '%s' "$1" | jq -Rs .)" | "$HOOK" >/dev/null 2>&1
	echo $?
}

expect() { # $1=label $2=expected-code $3=command
	got=$(run "$3")
	if [ "$got" = "$2" ]; then
		pass=$((pass+1))
	else
		fail=$((fail+1))
		printf 'FAIL: %s\n  cmd: %s\n  expected %s got %s\n' "$1" "$3" "$2" "$got"
	fi
}

# --- must BLOCK (exit 2): pathspec commits ---
expect "explicit -- separator"          2 'git commit -- .husky/pre-commit'
expect "-- with -m before"              2 'git commit -m "msg" -- file.txt'
expect "bare positional path"           2 'git commit file.txt'
expect "bare path after -m value"       2 'git commit -m "wip" src/index.ts'
expect "multiple paths"                 2 'git commit -- a.ts b.ts'
expect "chained after add"              2 'git add -A && git commit -- foo'
expect "global opt then pathspec"       2 'git -c core.editor=true commit -- foo'
expect "absolute git path"              2 '/usr/bin/git commit -- foo'

# --- must ALLOW (exit 0): non-pathspec commits and non-commits ---
expect "plain staged commit"            0 'git commit'
expect "commit with -m"                 0 'git commit -m "message"'
expect "commit -am"                     0 'git commit -am "message"'
expect "commit --amend --no-edit"       0 'git commit --amend --no-edit'
expect "commit -F file"                 0 'git commit -F /tmp/msg.txt'
expect "commit --author= inline"        0 'git commit -m x --author="A <a@b.c>"'
expect "commit --message= inline"       0 'git commit --message="hi"'
expect "commit --fixup sha"             0 'git commit --fixup abc123'
expect "commit --squash sha"            0 'git commit --squash abc123'
expect "commit -C sha"                  0 'git commit -C HEAD'
expect "git status not commit"          0 'git status'
expect "git add path"                   0 'git add file.txt'
expect "commit -m then chained status"  0 'git commit -m "x" && git status'
expect "commit with -S sign"            0 'git commit -S -m "signed"'
expect "no command"                     0 'ls -la'

# --- must ALLOW (exit 0): redirection / heredoc grammar is not a pathspec ---
# (analysis/2026-07-12-pathspec-hook-false-positive-gap.md — shlex.split emits
# redirect operators, glued redirects, and heredoc markers as ordinary words,
# which the positional rule then classified as pathspecs)
expect "commit -F file with 2>&1"       0 'git commit -F /tmp/msg.txt 2>&1'
expect "commit -m with > file"          0 'git commit -m "x" > /tmp/out'
expect "commit -F - heredoc message"    0 $'git commit -F - <<\'EOF\'\nfeat: subject line\n\nbody paragraph\nEOF'
expect "commit -F - with < file"        0 'git commit -F - < /tmp/msg'
expect "commit -m with 2>file glued"    0 'git commit -m "x" 2>/tmp/err'
expect "commit -m with >> append"       0 'git commit -m "x" >> /tmp/log'
# heredoc BODY lines are not independent segments: prose mentioning a
# pathspec-shaped commit inside a non-git heredoc must not block
expect "heredoc body prose non-git"     0 $'cat > /tmp/x <<\'EOF\'\ngit commit foo.txt was blocked here\nEOF'

echo "---"
echo "pass=$pass fail=$fail"
[ "$fail" = "0" ]
