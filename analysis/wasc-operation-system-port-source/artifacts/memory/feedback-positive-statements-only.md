---
name: feedback-positive-statements-only
description: "state what IS; never enumerate what is NOT (no \"does not apply to\" lists, no \"these are excluded\" sections); absence is implicit"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: d7310007-aef3-4e05-a651-d218d1cfd12f
---

State only what IS. Never enumerate what is NOT.

Wrong: "Pattern applies to A, B, C. Pattern does NOT apply to D, E, F."
Right: "Pattern applies to A, B, C." (D, E, F are silent by default; that IS the exclusion.)

**Why:** The user called out my edits as inane for explicitly specifying non-existence ("these do not get X"). Listing what something excludes is bureaucratic ceremony — the positive list already excludes everything else by definition. Negative lists double the surface area, double the maintenance cost, and signal performance of rigor without adding information. Related: [[feedback-prompts-as-complete-directives]], [[feedback-plain-diction]].

**How to apply:**
- When writing a spec or directive, name the in-scope set positively and stop.
- Do not write "X does not apply to Y" sections.
- Do not preface lists with "the following are excluded:" or "these do not:" or "out of scope:" — if it's not named in the positive list, it's already out.
- Exception: if a reader's default expectation strongly implies inclusion and the spec needs to override that expectation, one short clarifying sentence is acceptable. Not a section. Not a bullet list.
