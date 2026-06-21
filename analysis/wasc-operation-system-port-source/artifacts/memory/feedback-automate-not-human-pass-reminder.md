---
name: feedback-automate-not-human-pass-reminder
description: "when a fragility is reachable only through a skippable human verification step, pull it into the automated gate — never \"resolve\" it by adding a human-pass reminder"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: d7310007-aef3-4e05-a651-d218d1cfd12f
---

When a known fragility is reachable in production only through a verification step that a human performs (and can silently skip), the mandate-compliant fix is to pull that check into the automated, non-skippable gate — not to add a line item to the human pass.

**Why:** "covered by the human pass" is not coverage if the pass is skippable-without-signal — nothing fails if the human never does it. A skippable safety net over known fragility is exactly the unaddressed-fragility that mandate-004 prohibits. Adding a human-pass reminder is the negligent path dressed as diligence.

**How to apply:**
- Distinguish configuration (declarative, battle-tested framework defaults — fine to leave to a deferred human/browser pass) from behavior/code (custom logic — must be machine-tested).
- For anything that is code, find the automated mechanism that exercises it without a human (e.g. Django `test.Client` for admin actions/views, not just unit-testing the underlying service the admin calls).
- Do not propose a bespoke "remember to check X in the post-pass" item when X is automatable — that is redundant ceremony AND leaves the fragility skippable. [[feedback-no-options-when-path-clear]]

Concrete instance: Phase 12's custom `advance_plan_status` admin action (intermediate page → service) was tested only at the service layer; the action wiring lived solely in the deferred browser pass. Fix was an automated `Client` test (commit `ecb28dc`), and the config-vs-behavior rule was codified in PHASE-LAUNCH-CHECKLIST. The wrong first instinct — "it's covered by the post-Phase-15 US-22 walkthrough" — was correctly rejected by the user. See also [[feedback-no-meta-commentary]] on stating the corrected position without hedging.
