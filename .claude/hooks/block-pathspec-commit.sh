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
#   - walk the command line by line, tracking heredoc bodies: lines inside a
#     heredoc (from a `<<DELIM` marker to its terminator line) are DATA, never
#     classified as command segments; terminator matching mirrors bash — exact
#     column-0 match for `<<`, tab-stripped match for `<<-`
#   - split each non-body line on shell separators (&& || ; |)
#   - shlex-split each segment, then strip redirection grammar from the token
#     stream (strip_redirections below) — shlex.split is a POSIX word splitter
#     with no redirection concept, so `2>&1`, `>out`, a bare `>` and its target,
#     and heredoc markers all survive as ordinary words that the positional rule
#     would otherwise misclassify as pathspecs
#   - in each cleaned segment, locate a `git [global-opts] commit` head
#   - walk the post-`commit` tokens: skip options; skip the separate value of a
#     value-taking option (-m/-F/-C/-c/-t/--author/--date/--message/--file/etc.);
#     a bare `--` with anything after it => pathspec => BLOCK; any surviving
#     positional token => pathspec => BLOCK.
# Anything unparseable falls through to exit 0 (fail-open: this is a workflow guard,
# not a security boundary — see the create-hooks security note). Accepted residual
# of that posture: a genuine pathspec whose filename lexes like a redirect (a file
# literally named `2>&1`) is invisible to the guard — under-block, not over-block.
#
# REUSABLE RECIPE — shell-grammar-aware command classification for Bash guards.
# Any PreToolUse(Bash) hook that classifies commands by token inspection should
# reuse this pipeline rather than hand-rolling another parser (the planned
# Bash-chokepoint hook included): (1) line loop with heredoc-body exclusion,
# (2) segment split on control operators, (3) shlex.split, (4) strip_redirections,
# then (5) the hook's domain-specific token classification. Steps 1-4 are the
# self-contained, lift-able classify_segments(cmd, callback) function below
# (with its helpers segments + strip_redirections), which has no coupling to the
# git-commit rule; step 5 is supplied as the per-segment callback — here
# is_pathspec_commit. A future guard reuses steps 1-4 verbatim and writes only
# its own callback. Prior art for why: FGAP-120
# (quote-blindness, block-pi-context-glue.sh) and FGAP-147 (redirect/heredoc-
# blindness, this hook) are one class — shell-command classification by
# token/pattern inspection without shell-grammar awareness.
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

# ---- reusable shell-grammar tokenization (steps 1-4 of the header recipe) ----

# Redirection operator at the start of a token: optional fd digits, then one of
# >> > <<< <<- << <  (longest alternatives first so <<< wins over << over <).
REDIR_OP = re.compile(r"^[0-9]*(>>|>|<<<|<<-|<<|<)")

def strip_redirections(tokens):
    """Drop redirection grammar from a shlex token list.

    Returns (clean_tokens, heredoc_delims):
      - self-contained redirect tokens dropped: 2>&1, >&2, 2>/dev/null,
        >out.txt, >>log, <<<word
      - bare operator tokens (>, >>, <, 2>, >&, <<<) dropped together with
        their following target/word token
      - &>word dropped; bare &> / &>> dropped with their target token
      - heredoc marker (<<DELIM / << DELIM / <<-DELIM): the delimiter is
        recorded as a (delimiter, is_dash) pair — is_dash True for `<<-`,
        whose terminator bash matches tab-stripped, vs column-0-exact for
        `<<` (shlex already stripped any quoting on the delimiter) — and
        classification of the segment STOPS at the marker: no token after it
        is emitted; further heredoc delimiters on the same segment are still
        collected so their body lines can be excluded too
    """
    out = []
    delims = []
    classifying = True
    i = 0
    n = len(tokens)
    while i < n:
        t = tokens[i]
        if t.startswith("&>"):
            i += 2 if t in ("&>", "&>>") else 1
            continue
        m = REDIR_OP.match(t)
        if m:
            op = m.group(1)
            rest = t[m.end():]
            if op in ("<<", "<<-"):
                d = rest if rest else (tokens[i + 1] if i + 1 < n else "")
                delims.append((d.strip("\x27\x22"), op == "<<-"))
                classifying = False
                i += 1 if rest else 2
                continue
            if rest and rest != "&":
                i += 1      # self-contained: 2>&1, >&2, >out.txt, <<<word
            else:
                i += 2      # bare operator: drop it and its target token
            continue
        if classifying:
            out.append(t)
        i += 1
    return out, delims

def segments(line):
    # split one non-heredoc-body line on control operators && || ; |
    return re.split(r"&&|\|\||;|\|", line)

def has_pathspec(tokens):
    # tokens are the args AFTER the "commit" subcommand
    i = 0
    n = len(tokens)
    while i < n:
        t = tokens[i]
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

def classify_segments(cmd, classify_segment):
    """Steps 1-4 of the header recipe, decoupled from any domain rule.

    Walks cmd line by line with heredoc-body exclusion — body lines between a
    heredoc marker and its terminator are data, never command segments (the
    delimiter queue is FIFO: bash consumes heredoc bodies in marker order; a
    `<<` terminator must match at column 0 exactly, a `<<-` terminator matches
    after stripping leading tabs) — splits each command line on control
    operators, shlex-splits each segment, strips redirection grammar, then
    hands each cleaned token list to classify_segment (step 5, the domain
    rule of the calling guard). Returns True as soon as the callback does,
    else False.
    """
    pending = []  # FIFO of (delimiter, is_dash) pairs
    for line in cmd.split("\n"):
        if pending:
            delim, is_dash = pending[0]
            terminator = line.lstrip("\t") if is_dash else line
            if terminator == delim:
                pending.pop(0)
            continue
        for seg in segments(line):
            try:
                toks = shlex.split(seg)
            except ValueError:
                continue
            toks, delims = strip_redirections(toks)
            pending.extend(delims)
            if classify_segment(toks):
                return True
    return False

# ---- domain rule (step 5): pathspec-carrying `git commit` in a segment ----

def is_pathspec_commit(toks):
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
        if j < len(toks) and toks[j] == "commit" and has_pathspec(toks[j+1:]):
            return True
        return False  # only inspect the first git head per segment
    return False

print("BLOCK" if classify_segments(cmd, is_pathspec_commit) else "OK")
' 2>/dev/null)

if [ "$verdict" = "BLOCK" ]; then
	echo "Blocked: this is a pathspec git commit (\`git commit -- <path>\` or \`git commit <path>\`). Pathspec commits build a temporary partial index and can hit a stale object reference (the 2026-07-08 spurious commit failures came from exactly this). Stage the files you want with \`git add\`, then run a plain \`git commit\` of the staged set — staging already scopes the commit." >&2
	exit 2
fi
exit 0
