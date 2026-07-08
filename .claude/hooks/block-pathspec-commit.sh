#!/usr/bin/env bash
# PreToolUse(Bash) guard: reject `git commit` invocations that carry a pathspec.
#
# A pathspec commit — `git commit -- <path>...` or `git commit <path>...` — tells
# git to commit ONLY the named paths, building a temporary index for that partial
# set. In the 2026-07-08 session (6f738622) a `git commit -- .husky/pre-commit`
# built that temp index and hit a stale object reference, producing the spurious
# "8be85d80" commit failures. A plain `git commit` of the staged set has no temp
# index and no such failure mode. Staging (`git add`) already scopes a commit; the
# pathspec form is redundant and carries the failure mode, so it is forbidden here.
#
# Detection (python3 tokenizer, not a regex, so option VALUES are not mistaken for
# pathspecs):
#   - split the command on shell separators (&& || ; | newline)
#   - in each segment, locate a `git [global-opts] commit` head
#   - walk the post-`commit` tokens: skip options; skip the separate value of a
#     value-taking option (-m/-F/-C/-c/-t/--author/--date/--message/--file/etc.);
#     a bare `--` with anything after it => pathspec => BLOCK; any surviving
#     positional token => pathspec => BLOCK.
# Anything unparseable falls through to exit 0 (fail-open: this is a workflow guard,
# not a security boundary — see the create-hooks security note).
# Exit 2 => block, stderr fed back to the agent.

input=$(cat)

command=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')
[ -z "$command" ] && exit 0

verdict=$(printf '%s' "$command" | python3 -c '
import sys, shlex, re

cmd = sys.stdin.read()

# Options that consume a SEPARATE following token as their value. The inline
# --opt=value form needs no skip and is handled by the "=" check below.
VALUE_OPTS = {
    "-m", "--message",
    "-F", "--file",
    "-C", "--reuse-message",
    "-c", "--reedit-message",
    "-t", "--template",
    "--author", "--date",
    "--fixup", "--squash",
    "--cleanup", "--pathspec-from-file",
    "--trailer",
}
# Short options that consume a value; may appear inside a clustered token
# (e.g. -am => -a -m <value>, -mfoo => -m with inline value "foo").
VALUE_SHORT = set("mFCct")

def segments(s):
    # split on && || ; | and newlines, keeping it simple and shell-agnostic enough
    return re.split(r"&&|\|\||;|\||\n", s)

REDIR = re.compile(r"^(\d*|&)?(>>|<<-?|<|>)")

def has_pathspec(tokens):
    # tokens are the args AFTER the "commit" subcommand
    i = 0
    n = len(tokens)
    while i < n:
        t = tokens[i]
        if REDIR.match(t):
            # a shell redirection / heredoc (e.g. <<EOF, >, 2>, >>): its operand is
            # a redirect target or heredoc body, never a git pathspec. Stop here.
            return False
        if t == "--":
            # explicit pathspec separator: anything after it is a path
            return len(tokens) > i + 1
        if t.startswith("--"):
            # long option: --opt=val is self-contained; --opt val skips its value
            if "=" in t or t not in VALUE_OPTS:
                i += 1
            else:
                i += 2
            continue
        if t.startswith("-") and t != "-":
            # short option or cluster: find the first value-taking short flag
            cluster = t[1:]
            consumed_next = False
            for k, ch in enumerate(cluster):
                if ch in VALUE_SHORT:
                    # value is the rest of the cluster if present, else next token
                    if k == len(cluster) - 1:
                        consumed_next = True
                    break
            i += 2 if consumed_next else 1
            continue
        # a bare, non-option positional token after `commit` is a pathspec
        return True
    return False

for seg in segments(cmd):
    try:
        toks = shlex.split(seg)
    except ValueError:
        continue
    # find a `git ... commit` head, tolerating global opts like `git -c x=y commit`
    for gi, tok in enumerate(toks):
        base = tok.rsplit("/", 1)[-1]
        if base != "git":
            continue
        # walk forward from git to the first non-option token = the subcommand
        j = gi + 1
        while j < len(toks) and toks[j].startswith("-"):
            # a git global value-opt (-c/-C/--exec-path/--git-dir/--work-tree...)
            if toks[j] in ("-c", "-C", "--exec-path", "--git-dir",
                           "--work-tree", "--namespace") and "=" not in toks[j]:
                j += 2
            else:
                j += 1
        if j < len(toks) and toks[j] == "commit":
            if has_pathspec(toks[j+1:]):
                print("BLOCK")
                sys.exit(0)
        break  # only inspect the first git head per segment

print("OK")
' 2>/dev/null)

if [ "$verdict" = "BLOCK" ]; then
	echo "Blocked: this is a pathspec git commit (\`git commit -- <path>\` or \`git commit <path>\`). Pathspec commits build a temporary partial index and can hit a stale object reference (the 2026-07-08 spurious commit failures came from exactly this). Stage the files you want with \`git add\`, then run a plain \`git commit\` of the staged set — staging already scopes the commit." >&2
	exit 2
fi
exit 0
