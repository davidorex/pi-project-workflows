---
name: feedback-no-options-when-path-clear
description: "when the root cause is identified and one path is mandate-compliant, present that one path and execute; do not list rejected options for ceremony"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: d7310007-aef3-4e05-a651-d218d1cfd12f
---

When a problem's root cause is identified and the mandates rule out all but one path, present that one path and proceed. Do not enumerate the rejected options as if they were genuine choices.

**Why:** The user directed: "do not present such options again in the future when the root cause and known best path is clear." Listing options 1–4 when mandate-004 ("no negligent fix options") and mandate-007 ("no deferring discovered issues") rule out 1, 2, and 4 is decision-theater. It pushes the burden onto the user to re-validate the mandates I already applied. The honest report is: "Root cause is X; mandate-compliant path is Y; executing Y." Related: [[feedback-prompts-as-complete-directives]], [[feedback-positive-statements-only]].

**How to apply:**
- Apply the mandates myself before presenting options to the user.
- If only one option survives mandate filtering, present that option and act on it.
- If the user direction is genuinely needed (e.g. scope, priority, or a real architectural fork), present the genuine fork — not strawman alternatives.
- "I considered options A, B, C, but mandate-N rules out A and B" — fine, one short clause for traceability. Not a full options table.
- The exception is genuine equally-valid alternatives where the user's preference (cost, risk, time horizon) is the decision criterion. Those are real options.
