---
name: feedback-only-act-on-explicit-directives
description: Act only on explicit directives-to-action; never infer/propose action from a statement of intent, observation, or rationale
metadata:
  node_type: memory
  type: feedback
  originSessionId: d7310007-aef3-4e05-a651-d218d1cfd12f
---

Do NOT infer any action from the user's statements that is not a direct, explicit directive to act. When the user states intent, rationale, an observation, a preference, or describes "my revisions are to…", that is CONTEXT — not a license to do, propose, plan, or AskUserQuestion a next step. Wait for an explicit directive.

Specifically: don't turn "X should be like Y" / "the goal is Z" / "we'll want to…" into a build/edit/agent-dispatch, and don't manufacture a fork (AskUserQuestion) to tee up action the user didn't ask for. Report/establish only what was asked; then stop.

**Why:** the user corrected this directly — after describing the direction of their template revisions (align to Sample 2, revise its language), I inferred an alignment+rewrite task and asked clarifying questions to drive it. That over-stepped: a statement of intent is not a directive. Relates to [[feedback-narrow-directive-parsing]], [[feedback-user-decision-is-a-directive-to-act]] (its converse: a decision/directive IS to be acted on; a mere statement is NOT), [[feedback-no-options-when-path-clear]], [[feedback-options-proliferation-noise]].
