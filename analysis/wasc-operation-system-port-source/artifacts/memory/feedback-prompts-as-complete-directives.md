---
name: feedback-prompts-as-complete-directives
description: "each phase prompt is a complete, self-contained directive; IMPL executes, never interprets or makes calls; the set of all prompts must add up to the user stories working"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: d7310007-aef3-4e05-a651-d218d1cfd12f
---

Each phase prompt is a complete, self-contained directive. IMPL executes it; IMPL never decides, interprets, or "makes calls" that depend on bigger-picture context. If a prompt forces IMPL to make a call, the prompt is wrong and must be rewritten.

The set of all phase prompts, taken together, must add up to the user stories being live and working. Nothing more, nothing less.

**Why:** I framed the second root issue as "IMPL can't see the bigger picture, so it can't make good calls." Wrong frame. The user does not want IMPL making calls at all. The fix is not to give IMPL more context to interpret — it is to make each prompt complete enough that no interpretation is needed. The discovery/audit/layer machinery exists to support that outcome, not to perform rigor for its own sake. Related: [[feedback-narrow-directive-parsing]], [[feedback-no-meta-commentary]].

**How to apply:**
- When a phase produces ambiguity or interpretive load on IMPL, treat that as a prompt defect; amend the source artifacts (specs + phase MDs) so the next render of the prompt is unambiguous.
- Never propose "give IMPL more context" as the fix; the fix is "make the prompt complete."
- Audit the workflow scaffolding against the test: does this element help one prompt become a complete directive, or does it look like rigor without doing work. The latter is bureaucracy and should be cut.
