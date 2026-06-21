---
name: feedback-user-decision-is-a-directive-to-act
description: "execute the directive the user gave; do NOT invent blockers/concerns they didn't raise, and do NOT re-interpret their clarifying statements as new scope decisions to litigate"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: d7310007-aef3-4e05-a651-d218d1cfd12f
---

The user directed "plan mode the user onboarding." Instead of doing that, I invented a concern ("there's no non-admin front end for a logged-in user to look around") and spun it across several turns into a fake decision about deferring the work / building a front end — none of which the user asked for. The user: "you are inventing a need to litigate and decide a decision/directive i already articulated"; "this is hijacking my authority"; "i fucking did not decide to build the front end."

When the user later said "no one will be logging in before we build a front end," that was DISMISSING my invented concern (so don't worry about it), not a new directive — the actual directive remained: build the user onboarding/login flow.

**Why:** inventing blockers and re-opening settled directives wastes turns and usurps the user's authority (they decide scope; I execute).

**How to apply:**
- Execute the directive as given (e.g. plan mode → ExitPlanMode → IMPL for the named feature).
- Do NOT raise concerns about adjacent/unbuilt things (a future front end, where a user "lands") unless they block correctness; if the user dismisses a concern, drop it completely and proceed.
- A user's clarifying premise resolves the concern; it is not a new fork for me to weigh, defer, or decide.
- Relates to [[feedback-no-options-when-path-clear]], [[feedback-narrow-directive-parsing]], [[feedback-insight-not-reframe]], [[feedback-no-augmenting-user-stories]], [[feedback-scope-the-noun-they-named]].
