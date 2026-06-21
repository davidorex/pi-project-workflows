---
name: feedback-scope-the-noun-they-named
description: "when the user names a scope (\"code\", \"spec\", \"this file\"), the scope is that noun and ONLY that noun; do not extrapolate to adjacent scopes"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: d7310007-aef3-4e05-a651-d218d1cfd12f
---

When the user names a scope — "in the code", "the spec", "this file", "the phase MDs" — the operative scope is THAT NOUN. Do not extrapolate from "code" to "docs" or from "this file" to "every similar file." Re-read the user's words; identify the literal noun they named; act only within that noun.

**Why:** The user said "i don't want anything saying wasc anywhere in the code." I scrubbed WASC from CLAUDE.md, BACKUPS.md, THREAT-MODEL.md, multiple phase MDs, dev-planning-knowledge-source/ files — none of which are code. The user had to repeat the scope twice. This is exactly the narrow-directive-parsing failure they've flagged multiple times. The cumulative cost of repeating this is high; they were explicit that "i shouldn't have to repeat that ever." Related: [[feedback-narrow-directive-parsing]], [[feedback-honor-literal-commands]].

**How to apply:**
- Read the user's words literally. Identify the noun naming the scope.
- If the noun is "code" → only `.py` / `.toml` / `.yml` / `.sh` / `.sql` / `Dockerfile` etc. Not `.md`, not docs, not specs.
- If the noun is "this file" → only that one file. Not similar files. Not the file's siblings.
- If unsure, ASK — don't extrapolate. Asking is cheap. Cleanup of unauthorized edits is expensive in attention and trust.
- After an edit, re-check: did I edit only the named scope, or did I drift? If drifted, revert before reporting done.
- The user has now said this in three forms (narrow-directive-parsing, honor-literal-commands, scope-the-noun-they-named). The pattern is foundational, not optional.
