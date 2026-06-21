---
name: feedback-one-bash-call-per-turn
description: Never batch dependent/mutating Bash calls in one message; one tool call per turn
metadata: 
  node_type: memory
  type: feedback
  originSessionId: d7310007-aef3-4e05-a651-d218d1cfd12f
---

Do NOT issue multiple Bash calls in a single message when they are sequential, dependent, or mutate files. In this harness the first call's nonzero exit CANCELS the remaining parallel calls, repeatedly producing wasted turns and harness errors. Issue ONE Bash call, see its result, then issue the next.

**Why:** Repeatedly batched backup→mutate→verify→restore sequences where an earlier call's failure cancelled the rest. User: "unacceptable repeated failures. immediately change your operating heuristic." Earlier same session: "get yourself under control"; "if you cannot constrain yourself we are dead in the water."

**How to apply:** Default to one tool call per turn. Only batch when calls are genuinely independent AND read-only. Anything that writes, deletes, restores, or depends on a prior call's effect goes one-per-turn. Verify state with a single command, not a chain. Relates to [[feedback-no-meta-commentary]] and the no-noise discipline.
