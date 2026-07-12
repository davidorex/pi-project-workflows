# block-pathspec-commit.sh false-positives on redirection/heredoc tokens — investigation

Date: 2026-07-12. Experience gap hit independently by two implementation agents this session: legitimate `git commit` invocations blocked by the PreToolUse pathspec guard. Investigation per Experience-Gap Handling; all probing against a scratchpad COPY of the hook (live guard untouched).

## 1. Hook intent

`.claude/hooks/block-pathspec-commit.sh` header (lines 2–19):

> PreToolUse(Bash) guard: reject `git commit` invocations that carry a pathspec.
>
> A pathspec commit — `git commit -- <path>...` or `git commit <path>...` — tells git to commit ONLY the named paths, building a temporary index for that partial set. In the 2026-07-08 session (6f738622) a `git commit -- .husky/pre-commit` built that temp index and hit a stale object reference, producing the spurious "8be85d80" commit failures. A plain `git commit` of the staged set has no temp index and no such failure mode. Staging (`git add`) already scopes a commit; the pathspec form is redundant and carries the failure mode, so it is forbidden here.
>
> Detection (python3 tokenizer, not a regex, so option VALUES are not mistaken for pathspecs):
>   - split the command on shell separators (&& || ; | newline)
>   - in each segment, locate a `git [global-opts] commit` head
>   - walk the post-`commit` tokens: skip options; skip the separate value of a value-taking option (-m/-F/-C/-c/-t/--author/--date/--message/--file/etc.); a bare `--` with anything after it => pathspec => BLOCK; any surviving positional token => pathspec => BLOCK.

Fail-open on unparseable input (line 20–21); exit 2 = block.

## 2. Root cause

The tokenizer splits segments on control operators only and word-splits with `shlex.split`, which is a POSIX **word** splitter, not a shell **grammar** parser — it has no concept of redirection operators or heredoc markers. Every redirection token therefore survives word-splitting as an ordinary word, and the classifier's final rule (line 83–84):

```python
        # a bare, non-option positional token after `commit` is a pathspec
        return True
```

treats it as a pathspec.

The two defective layers, quoted:

**Segment split (line 51–53)** — splits on `&& || ; |` and newlines, never on or around redirections:

```python
def segments(s):
    # split on && || ; | and newlines, keeping it simple and shell-agnostic enough
    return re.split(r"&&|\|\||;|\||\n", s)
```

**Word split (line 87–89)** — `shlex.split(seg)`; observed tokenizations (python3, verbatim):

```
--- shlex tokens for the 2>&1 case:
['git', 'commit', '-F', '/tmp/msg.txt', '2>&1']
--- shlex tokens for the heredoc first segment:
['git', 'commit', '-F', '-', '<<EOF']
--- shlex tokens for the > file case:
['git', 'commit', '-m', 'fix: thing', '>', '/tmp/commit-out.txt']
```

Walking `has_pathspec` (lines 55–85) over each:

- `2>&1` — starts with `2`, not `-`, so it falls to the positional rule → BLOCK. Same for any glued redirect (`2>/dev/null`, `>>log`, `>out.txt`).
- `>` / `<` / `>>` as a standalone token — not `-`-prefixed → positional → BLOCK (and even were it skipped, its target filename token would then be positional).
- `<<EOF` — starts with `<` → positional → BLOCK. This is the actual `-F -` failure: **bare `git commit -F -` is NOT blocked** (line 71–81: `-F` is in `VALUE_SHORT`, cluster ends at `F`, `consumed_next = True`, so the `-` is consumed as its value). The blocked form both agents hit is `git commit -F - <<'EOF' … EOF` — the heredoc marker, not the `-`, is what classifies as a pathspec. Additionally, because segments split on `\n`, every heredoc **body** line becomes its own segment; those lack a `git` head and fall through harmlessly, but the marker on the command line does not.

So: one defect, redirection/heredoc grammar invisible to the tokenizer; three surface symptoms (`2>&1`, `> file`, `<<EOF` after `-F -`).

## 3. Reproduction — scratchpad copy, verbatim transcripts

Hook copied to `<scratchpad>/hook-repro/hook-copy.sh` (byte-identical, `chmod +x`). Input fed as the PreToolUse JSON shape the hook reads (line 24–26: `input=$(cat)`; `jq -r '.tool_input.command // empty'`), built with `jq -n --arg c "$cmd" '{tool_input:{command:$c}}'`.

```
=== CASE: F-file with 2>&1 (reported false positive 1)
--- command: git commit -F /tmp/msg.txt 2>&1
--- exit: 2
--- stderr: Blocked: this is a pathspec git commit (`git commit -- <path>` or `git commit <path>`). Pathspec commits build a temporary partial index and can hit a stale object reference (the 2026-07-08 spurious commit failures came from exactly this). Stage the files you want with `git add`, then run a plain `git commit` of the staged set — staging already scopes the commit.

=== CASE: stdout redirect > file (reported false positive 1b)
--- command: git commit -m "fix: thing" > /tmp/commit-out.txt
--- exit: 2
--- stderr: Blocked: this is a pathspec git commit […same message…]

=== CASE: -F - bare stdin (reported false positive 2)
--- command: git commit -F -
--- exit: 0
--- stderr:

=== CASE: -F - with heredoc
--- command: git commit -F - <<'EOF'
line one
line two
EOF
--- exit: 2
--- stderr: Blocked: this is a pathspec git commit […same message…]

=== CASE: TRUE POSITIVE: git commit path
--- command: git commit foo.txt
--- exit: 2
--- stderr: Blocked: […same message…]

=== CASE: TRUE POSITIVE: git commit -- path
--- command: git commit -- .husky/pre-commit
--- exit: 2
--- stderr: Blocked: […same message…]

=== CASE: clean: git commit -m msg
--- command: git commit -m "fix: thing"
--- exit: 0

=== CASE: clean: git commit -am msg
--- command: git commit -am "fix: thing"
--- exit: 0
```

Supplementary redirect cases (same harness):

```
=== CASE: stdin redirect < file
--- command: git commit -F - < /tmp/msg.txt
--- exit: 2
=== CASE: stderr redirect 2>file
--- command: git commit -m "x" 2>/tmp/err.txt
--- exit: 2
=== CASE: append redirect >>
--- command: git commit -m "x" >> /tmp/log.txt
--- exit: 2
```

Summary: all redirect/heredoc forms false-positive (exit 2); bare `-F -` passes; both true-positive pathspec forms still block; plain `-m`/`-am` commits pass. Intended behavior confirmed intact — the defect is strictly over-blocking.

Note: the shipped test harness `.claude/hooks/block-pathspec-commit.test.sh` (23 cells) contains **zero** redirection or heredoc rows — the entire false-positive class is untested, which is how it shipped green.

## 4. Class verdict

This is an INSTANCE of an established class on this repo's Bash-guard hooks: **shell-command classification by token/pattern inspection without full shell-grammar awareness**. Known instances by grammar dimension:

- **Quote-blindness** — FGAP-120 (closed 2026-07-07): `block-pi-context-glue.sh` matched shell metacharacters that were DATA inside quoted values. Fixed by quote-span stripping at the chokepoint.
- **Redirection/heredoc-blindness** — THIS gap: `block-pathspec-commit.sh` classifies redirection operators, glued redirects, and heredoc markers as pathspec positionals. The hook is quote-aware (shlex) but redirect-blind — the exact complementary blind spot to FGAP-120's (that hook is now redirect-tolerant and quote-aware; this one is quote-aware and redirect-blind).
- **Scope-blindness** — FGAP-089 (open, P3): same hook family fires regardless of target substrate. A sibling class on the same artifacts, orthogonal to command parsing.

Per-hook sweep of the live guards:

- `block-pi-context-glue.sh` — NOT in this instance's class anymore: its op→pipe/redirect bridges are explicitly redirect-tolerant (`([^;&|<>]|>>?&?[0-9-]?|<<?)*`, lines 39–43, 56–59) and quote-aware (line 32, the FGAP-120 fix). It demonstrates the failure mode was already met and solved once on a sibling hook — the fix pattern did not propagate.
- `block-control-chars.sh` — not in class: inspects Write/Edit/NotebookEdit payload strings via jq codepoint tests; parses no shell command.
- `block-substrate-write.sh` — not in class: inspects `file_path`/`notebook_path` with path normalization; parses no shell command.
- `block-sendmessage.sh` — does not exist in `.claude/hooks/` (directory listing 2026-07-12: the four guards above + two `.test.sh` harnesses only).

So among live hooks the redirection-blindness instance is confined to `block-pathspec-commit.sh`. Forward propagation risk: TASK-095 (planned) specifies another PreToolUse(Bash) chokepoint "segment-split on ;&|" — the same segment grammar, redirections unaddressed in its filed text. A class-level fix should produce a shared, reusable command-tokenization prelude (or at minimum a documented pattern) that TASK-095 consumes, not a third hand-rolled parser.

## 5. Prior-art verdict

Substrate searched via bare pi-context ops (`filter-block-items --block framework-gaps --field title|description --op matches`, terms: hook, pathspec, commit, redirect, false-positive, tokeniz; `--block tasks` for hook/pathspec/guard):

- **FGAP-089** (read fresh, status `identified`) — hooks fire on non-active-substrate targets. DISTINCT: scope of enforcement, not command parsing; nothing in its text covers tokenization or redirection. Sibling class on the same hook family; relate, don't merge.
- **FGAP-120** (closed) — quote-blindness in `block-pi-context-glue.sh`. Nearest prior art; explicitly self-described as a class ("any hook pattern element not lexically confined to inter-token shell syntax matches identical characters occurring as data"), but its closure fixed only the glue hook's quote dimension. Does not cover this hook or the redirect dimension.
- **TASK-095** (planned) — future Bash chokepoint hook; related family, does not track this defect.
- No framework-gaps item mentions `block-pathspec-commit.sh`, redirection false-positives, or this hook's tokenizer. **No existing coverage; a new filing is justified**, related to FGAP-089 (sibling class, same artifact family) and FGAP-120 (same general class, adjacent dimension, closed).

## 6. Proposed fix shape (not implemented here)

Close the whole redirection-grammar dimension at the tokenizer, not the three symptoms:

1. **Strip redirection grammar from the token stream before `has_pathspec` walks it.** After `shlex.split`, drop (a) any token matching the redirect-operator grammar `^[0-9]*(>>?|<<?<?)(&[0-9-]+|&?-)?$` — when it is a bare operator needing a target (`>`, `>>`, `<`, `2>`, `&>`), also drop the FOLLOWING token (the target filename / heredoc delimiter); (b) any glued self-contained redirect token, prefix-matched `^[0-9]*(>>?|<<?<?)` (`2>&1`, `>&2`, `2>/dev/null`, `>out.txt`, `>>log`, `<<EOF`, `<<<word`). Equivalent alternative: tokenize with `shlex.shlex(..., punctuation_chars=True)`, which emits `>` `>>` `<` `<<` as distinct operator tokens, then filter operator+operand pairs — a real lexer feature rather than a second regex.
2. **Heredoc termination:** on encountering a heredoc marker (`<<WORD` glued, or `<<` + delimiter token), stop classifying that segment at the marker; the newline segment-split already isolates body lines (no `git` head → fall through), so only the marker and delimiter need dropping.
3. **No `-F -` allowlist needed** — repro shows the bare form already passes; it fails only via the heredoc marker, which (1)/(2) removes.
4. **Regression cells:** extend `.claude/hooks/block-pathspec-commit.test.sh` with the full matrix from §3 — the five false-positive rows (`-F file 2>&1`, `-m msg > file`, `-F - <<'EOF'…`, `-F - < file`, `2>file`, `>>file`) expecting 0, plus the existing true-positive rows unchanged at 2. Acceptance = every row green.
5. **Known residual, fail-open by design:** a genuine pathspec whose filename lexes like a redirect (a file literally named `2>&1`) becomes invisible to the guard — acceptable under-block for a workflow guard targeting a cooperative agent (the hook's own header states this posture; FGAP-120's closure applied the same reasoning inverted).
6. **Guard-development rule:** develop and validate against a scratchpad COPY, never the live guard (this investigation's copy + harness are the starting point); consider extracting the corrected tokenizer as the shared prelude TASK-095's chokepoint will need.

## 7. Proposed FGAP filing (rhetorical-register-compliant; not filed — user decides)

- **title**: block-pathspec-commit.sh classifies redirection operators and heredoc markers as pathspecs — `git commit … 2>&1`, `… > file`, and `-F - <<'EOF'` are blocked as pathspec commits
- **package**: pi-context
- **priority (recommended)**: P2 — blocked live commit invocations from two implementation agents in one session; both worked around it (unredirected commits, message files instead of stdin), degrading commit ergonomics silently.
- **canonical_vocabulary**: shell-grammar-aware hook tokenization
- **description**: .claude/hooks/block-pathspec-commit.sh word-splits each command segment with shlex.split (line 89) — a POSIX word splitter with no redirection grammar — and its segment split (line 53) divides only on `&& || ; |` and newlines, so every redirection token survives as an ordinary word and the classifier's positional rule (lines 83–84: "a bare, non-option positional token after `commit` is a pathspec") blocks it. Confirmed false-positive matrix (scratchpad hook copy, PreToolUse JSON stdin): `git commit -F /tmp/msg.txt 2>&1` blocks (`2>&1` tokenizes as one word); `git commit -m "x" > /tmp/out` blocks (both the standalone `>` and its target word are positionals); `git commit -F - <<'EOF' … EOF` blocks (the `<<EOF` token — bare `git commit -F -` passes: `-F` consumes the `-`, so the reported "-F - blocked" symptom is the heredoc marker, not the dash); `< file`, `2>file`, `>>file` all block. True positives intact: `git commit foo.txt` and `git commit -- .husky/pre-commit` still exit 2; `-m`/`-am` commits pass. The shipped test harness (block-pathspec-commit.test.sh, 23 cells) contains zero redirection/heredoc rows — the class was never tested. Class: shell-command classification by token inspection without shell-grammar awareness — the redirect-blindness dimension of the class whose quote-blindness dimension was FGAP-120 (closed; block-pi-context-glue.sh is now quote-aware AND redirect-tolerant, so the solved pattern exists in a sibling hook and did not propagate). Distinct from FGAP-089 (same hook family, orthogonal target-substrate scope-blindness). Among live hooks the instance is confined to block-pathspec-commit.sh (block-control-chars.sh / block-substrate-write.sh parse no shell command); TASK-095's planned Bash chokepoint specifies the same segment-split approach, so the fix should yield a reusable tokenization pattern, not a third hand-rolled parser.
- **evidence**:
  - `.claude/hooks/block-pathspec-commit.sh` lines 51–53 — segment split on `&&|\|\||;|\||\n` only; redirections never delimited
  - `.claude/hooks/block-pathspec-commit.sh` lines 87–89 + 83–84 — shlex.split word-splitting feeds redirect tokens to the positional→pathspec rule
  - `.claude/hooks/block-pathspec-commit.test.sh` — 23 cells, zero redirection/heredoc rows
  - `analysis/2026-07-12-pathspec-hook-false-positive-gap.md` — the investigation: verbatim repro transcripts (5 FP forms exit 2, bare `-F -` exit 0, both TP forms exit 2), token-level demonstration, class + prior-art verdicts, fix shape
- **impact**: Any commit whose Bash invocation carries a redirect or a heredoc commit message is refused with a misleading "pathspec commit" message — two implementation agents in the 2026-07-12 session independently hit it and silently worked around it (message files instead of `-F -` heredoc; dropping `2>&1`), which both degrades commit ergonomics and suppresses the friction signal (neither agent filed the gap).
- **proposed_resolution**: Strip redirection grammar from the token stream before classification, closing the dimension for all redirect forms at once: post-shlex, drop self-contained redirect tokens (prefix `^[0-9]*(>>?|<<?<?)` — covers `2>&1`, `2>/dev/null`, `>out`, `>>log`, `<<EOF`, `<<<w`) and drop bare-operator tokens (`>`, `>>`, `<`, `2>`, `&>`) together with their following target/delimiter token; alternatively lex with `shlex.shlex(punctuation_chars=True)` and filter operator+operand pairs. On a heredoc marker, stop classifying the segment (newline segment-split already isolates body lines). No `-F -` allowlist — the bare form already passes. Residual under-block (a file literally named like a redirect) is acceptable fail-open per the hook's stated workflow-guard posture. Acceptance = the extended test harness: existing 23 cells plus the investigation's redirect/heredoc FP rows all green. Develop against a COPY, never the live guard (FGAP-089's live-fire caveat applies). Relate: FGAP-120 (same class, adjacent dimension, closed), FGAP-089 (sibling class, same artifact family, open); coordinate the tokenization pattern with TASK-095's planned chokepoint. Grounding: analysis/2026-07-12-pathspec-hook-false-positive-gap.md.
