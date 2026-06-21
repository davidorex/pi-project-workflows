---
name: feedback-iterate-to-zero-no-pressure-deviation
description: In the iterate-to-zero loop, loop on each audit finding with the ROOT fix; never offer residual/defer options or escalate a policy-determined fix
metadata:
  node_type: memory
  type: feedback
  originSessionId: d7310007-aef3-4e05-a651-d218d1cfd12f
---

An in-loop adversarial-audit finding is a directive to **loop** (re-IMPL the root fix → re-audit, until zero) — NOT a mandate-008 "stop and ask the human" event. mandate-008's STOP-and-report is for a **genuine human decision** (a real scope fork a *distinct new* issue raises, per mandate-007), not for an in-loop finding that has a determined root fix.

Never offer "ship it / file the residual / proportionate (leaves a known bypass)" — those are the negligent fix options mandate-004 forbids. Never raise AskUserQuestion for a decision the policy already settles (mandate-004 no-fragility + "ignore no debt" ⇒ the complete fix, not a residual). Cost / context-spend / "the threat model is low" is never a warrant to cap a fix (no-llm-laziness; [[feedback-cost-is-not-disqualifying]]).

**Decision test on an audit finding:** is it (a) a hole in the *current* fix's class → loop the root fix; or (b) a genuinely *distinct* new issue → file it (mandate-007, user decides scope), don't silently drop or claim out-of-scope. There is no third option that leaves known fragility open.

**Why:** corrected twice in one session — under audit-fatigue + context-spend pressure I offered residual/defer options and an AskUserQuestion for a policy-determined sanitizer fix, deviating from iterate-to-zero. The canonical pipeline + mandates exist for a reason; adhere, don't rationalize a shortcut. Relates to [[feedback-flagging-is-not-persistence]], [[feedback-noted-gap-is-a-work-item]].
