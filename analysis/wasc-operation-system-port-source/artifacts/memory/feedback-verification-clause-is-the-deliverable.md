---
name: feedback-verification-clause-is-the-deliverable
description: "when a phase's verification clause states a capability its dev steps don't deliver, amend the steps to deliver it (pre-flight) — never offer a defer-option or hedge with a question; deferring a stated deliverable is mandate-004/007 negligence"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: d7310007-aef3-4e05-a651-d218d1cfd12f
---

A phase MD's "Verification at end" clause is its binding success criterion. When the dev steps don't actually produce what the clause states, that is an internal spec inconsistency the orchestrator closes in pre-flight by amending the steps to deliver the clause — exactly as missing migrate/Layer-A steps get added. It is NOT a scope fork to put to the user, and offering a "defer it" option is the wrong move.

**Why:** shipping the phase with its own verification clause unmet is the discovered-gap deferral mandate-007 forbids ("do not favor deferring discovered issues... do NOT claim out of scope") and the unaddressed-fragility mandate-004 forbids. Delivering what the clause already states is fulfillment, not augmentation (mandate-002) — augmentation is adding what the spec does NOT call for. The batched-verification convention defers *when a human looks*, never *whether the capability is built*; conflating those two is how a defer-option masquerades as policy-compliant.

**How to apply:**
- Read the verification clause as the deliverable. If dev steps fall short, pre-flight amend them to close the gap, then proceed — don't AskUserQuestion.
- A choice is a genuine fork (worth a question) only when mandates + the spec leave it truly undetermined. If one option satisfies the verification clause + mandates and the other defers the clause, it is not a fork — it is determined. Offering it is an unnecessary hedge. [[feedback-no-options-when-path-clear]]
- Sub-choices are often determined too: read the literal word. "language tabs" → modeltranslation `TabbedTranslationAdmin` (tabs), not `TranslationAdmin` (grouped, no tabs).
- Pair with [[feedback-automate-not-human-pass-reminder]]: build the capability AND pull its verification into the automated gate; don't leave it to the skippable human pass.

Concrete instance: Phase 13's clause said "translated fields show language tabs in admin" but its steps only generated .po/.mo and every admin was plain ModelAdmin (no tabs). The derivable answer was to also convert translated-field admins + add an in-phase Client test — not to offer ".po-only, defer tabs." The user twice flagged the AskUserQuestion as an unnecessary hedge (this and the Phase 12/14 gate split). When asked "is there a derivable answer and is this an unnecessary hedge," the honest answer was yes to both.

**Dual / refinement (same Phase 13, next turn):** the clause encodes INTENT; the literal *mechanism* it names can itself be an under-considered spec defect. "language tabs" specifically forced modeltranslation's `TabbedTranslationAdmin`, whose tabs are jQuery UI's `.tabs()` widget sourced from a CDN unreachable on this network and blocked in China — a disproportionate dependency for cosmetic, and at two languages worse-UX, presentation. The intent ("authors edit both languages cleanly") was met dependency-free by grouped `TranslationAdmin`. So: deliver the clause's INTENT, not necessarily its literal mechanism. When a clause's named mechanism carries cost/fragility out of proportion to what it adds, that is a spec-relaxation decision to surface to the user (changing a verification clause is the user's call) — distinct from silently delivering an over-specified mechanism OR silently deferring the deliverable. The tell that a mechanism is over-specified: implementing it literally "starts giving up issues" (here, a CDN dependency) disproportionate to what it accomplishes. Resolution: relax mechanism → intent (commit `6e4d641`). [[feedback-no-options-when-path-clear]]
