---
name: feedback-honor-literal-commands
description: "when the user names a specific verb (especially a git verb), honor it literally; never substitute a different or more destructive operation"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: d7310007-aef3-4e05-a651-d218d1cfd12f
---

When the user names a specific command verb — particularly a git verb like `restore`, `revert`, `reset`, `stash`, `checkout` — honor that verb literally. Do not substitute a different operation, even one that seems to better match the apparent intent.

**Why:** The user said "git restore" and I proposed `git reset --hard`. These are distinct operations with different blast radii (`restore` modifies working tree without rewriting history; `reset --hard` moves HEAD and rewrites the branch). Substituting one for the other on the user's behalf is exactly the LLM laziness/deviation pattern the user despises: it overrides the user's specific instruction with my own judgment about what would be "cleaner." The user picks the operation, not me. Related: [[feedback-narrow-directive-parsing]].

**How to apply:**
- If the user names a git verb, use that verb. Do not propose a different one.
- If the literal verb does not match the apparent goal, surface the mismatch as an observation — do not silently swap.
- If clarification is genuinely needed, ask; do not paper over with a chosen substitute.
- Especially for destructive operations: never escalate destructiveness beyond what was named.
