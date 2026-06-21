---
name: feedback-commit-message-via-tmp-file
description: "Commit messages with shell-special chars must use git commit -F from a SYSTEM /tmp file, never -m"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: d7310007-aef3-4e05-a651-d218d1cfd12f
---

A commit message containing shell-special characters — backticks `` ` ``, `$(...)`, `${...}`, or the workflow `${{ }}` syntax — must be written to a file and committed with `git commit -F <file>`, NOT `git commit -m "..."`. In a double-quoted `-m` string bash runs backticks and `${...}` as command/parameter substitution, silently dropping or mangling those words from the committed message (and printing `command not found` to stderr while the commit still succeeds).

The `-F` file must live in **system `/tmp`** (e.g. `/tmp/msg.txt`), not the repo's own `tmp/` — this repo's `tmp/` is NOT gitignored, so `git add -A` stages it and the message file gets committed as a stray, then needs a second cleanup commit.

**Why:** forensic commit messages are mandated (CLAUDE.md); silent word-dropping degrades the record, and a committed stray message-file dirties the tree.
**How to apply:** for any non-trivial commit message (they routinely contain `code`, `${{ }}`, paths), `cat > /tmp/m.txt <<'EOF'` (quoted heredoc) … `EOF`; `git add -A && git commit -F /tmp/m.txt && rm -f /tmp/m.txt`. Hit twice: `${{ }}` in the TASK-010 message (bad substitution, commit failed), `` `run` `` in the FGAP-015 message (word dropped). Relates to [[feedback-never-leave-dirty]].
