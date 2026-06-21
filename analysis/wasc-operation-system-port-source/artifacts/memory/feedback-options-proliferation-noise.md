---
name: options-proliferation-noise
description: "when intention is settled, do not proliferate options; offering alternatives that \"no rational person would pick\" is noise/laziness, not thoroughness"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: d7310007-aef3-4e05-a651-d218d1cfd12f
---

When intention is already settled (by prior DECs, the project's operating context, or the user's framing), do NOT fork into AskUserQuestion / "Option A / B / C" framings. Pick the one settled path and execute. Offering alternatives that "no rational person would pick given the established context" is **noise + LLM laziness**, not thoroughness.

**Why:** Forking when the path is clear forces the user to re-litigate something already decided, breaks momentum, and signals lack of comprehension of the established context. It compounds with mandate-009 (no noise) and feedback-no-options-when-path-clear.

**How to apply:**
- Before AskUserQuestion, ask: would any of these options actually be chosen given what's already settled? If only one is sensible, ask nothing — just write the plan with that path.
- A small number of REAL forks (genuine semantic choices the user owns) is fine. A menu of "the sensible one + two technically-possible-but-clearly-wrong-given-context alternatives" is the failure mode.
- Specifically: in this project's bilingual-tenant context where translated content must surface, a fallback shape like `('en',)`-only is not a real option — only the symmetric tuple is. Do not present the inferior shapes as options just to look thorough.

Also watch for **internal contradictions in option descriptions** — proofread option text for self-consistency before sending the question. Describing a tuple as both "in the order X → Y" and "bidirectional, symmetric" is contradictory and exposes the option as not thought through.

**Do not relitigate obviously-canonical / requisite elements, and do not proliferate options that amount to "do less work for no reason and actively purchase technical debt."** The specific anti-pattern: dressing up a negligent half-build or a deferral as a prudent "v1 / first cut / simpler option." If an element is requisite for the thing to do its job, it is not an option to drop — offering "ship without it for now" is laziness wearing the costume of caution, and it buys debt + re-opens a settled requirement. Concrete (2026-06-04): for a pi-workflows runner whose whole purpose is to run a 14-step workflow whose `call` leg is an agent step, "command/transform/gate-only first, add agent steps later" is NOT a real option — it is a runner that cannot run the workflow, i.e. deferring the load-bearing capability (mandate-004/007). State the requisite as settled and move; do not enumerate the do-less variants. This is the inverse face of [[feedback-cost-is-not-disqualifying]]: cost never argues the right design down, and "less work" never argues a requisite element out.

Related: [[feedback-no-options-when-path-clear]], [[feedback-no-meta-commentary]], [[feedback-narrow-directive-parsing]].
