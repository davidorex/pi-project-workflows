---
name: feedback-cost-is-not-disqualifying
description: "implementation cost/size/effort is never a disqualifying or cautionary metric for the right design; presenting 'cost'/'heaviest lift'/'largest remodel' as a counterweight is LLM laziness undermining user+project intent"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: d7310007-aef3-4e05-a651-d218d1cfd12f
---

When the correct design is identified, do NOT weigh its implementation cost/size/effort against it. Phrases like "the cost is the remodel itself," "heaviest lift," "largest remodel," "con: big change" presented as a counterweight are LLM laziness that actively undermines user and project intentions. State the right design and the work to do it fully; size is just the work, not a reason to hesitate or hedge.

**Why:** user — "don't hedge and don't consider 'cost' as a disqualifying metric. that's llm laziness actively undermining user and project intentions." Said after I appended "the cost is the remodel itself" to an otherwise-decisive design.

**How to apply:**
- Pick and state the single best-for-project-context decision; no options-as-hedges (pairs with [[feedback-no-options-when-path-clear]]).
- Drop pro/con "cost"/"effort"/"lift" framing entirely. If effort must be named, name it as the work plan (steps to do), never as a caution against doing it.
- Legitimate data-loss / correctness checks (e.g. "verify no rows before a destructive migration") are NOT cost-hedges — keep those; they protect intent (mandate-007).
- Do not attribute your own generated framing or option text to the user (don't say "your text"/"your option" for wording you produced).
