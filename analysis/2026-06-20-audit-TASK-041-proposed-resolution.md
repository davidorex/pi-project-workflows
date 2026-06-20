# Audit — TASK-041 proposed resolution (poisoned-assumptions / code-simplifier lens)

Date: 2026-06-20
Target: TASK-041 "Backfill decision derivation edges, then raise decision-shows-derivation to error"
Scope: read-only audit of the task's proposed resolution (description + acceptance_criteria) against the upstream feature/convention/research and the ACTUAL substrate + op surface. No mutation.

## Verdict: SOUND

Every load-bearing assumption in the proposed resolution was verified against live state and holds. The design is the minimal, config-only, mechanism-correct path; it carries no wrong API assumptions, no over-engineering, and no scope creep. One precision note is offered (not a defect) plus one optional clarity tightening of the acceptance text.

## What the task proposes

1. For each of the warning decisions, add EITHER a `decision_derived_from_item` edge (to the substrate fact the resolution derives from) OR a `decision_escalates_underdetermined` edge (to the framework-gap of a genuinely-underdetermined choice); file a `rationale` item to reify a code/mandate fact that has no existing item.
2. Once `context-validate` shows zero `decision-shows-derivation` warnings, raise that invariant from WARNING to ERROR via `amend-config`.
3. Demonstrate the bite is blocking at error (a new derivation-less decision is rejected).

This is the convention-articulation "clean-after-backfill" pattern applied to decision DERIVATION — the same shape FEAT-007 already shipped for convention articulation.

## Claim-by-claim verification

| Assumption in the task | Verified against | Result |
|---|---|---|
| The invariant is the dedicated structural bite for `derive-decisions-from-facts`, live at WARNING | `read-config invariants/decision-shows-derivation` → `severity: "warning"`, `class: requires-edge`, `relation_types: [decision_derived_from_item, decision_escalates_underdetermined]`, `direction: as_parent`, `block: decisions` | ACCURATE |
| Each decision must carry `decision_derived_from_item` OR `decision_escalates_underdetermined` | requires-edge invariant naming exactly those two relation_types; convention body states the same as-parent OR semantics, "no silent-fork third state" | ACCURATE |
| "17 existing decisions currently warn" | `context-validate` → exactly DEC-0001..DEC-0017 each emit `decision-shows-derivation` warning. Count = 17, contiguous | ACCURATE (exact) |
| `decision_derived_from_item` exists, target `*` | `read-config relation_types/decision_derived_from_item` → `source_kinds:[decisions]`, `target_kinds:[*]` | ACCURATE (target `*` is what lets it point at research/convention/gap/prior-decision/rationale) |
| `decision_escalates_underdetermined` exists, targets framework-gaps | `read-config relation_types/decision_escalates_underdetermined` → `source_kinds:[decisions]`, `target_kinds:[framework-gaps]` | ACCURATE |
| Severity is raised via `amend-config` | `list-ops` → `amend-config — Add/replace/remove one entry in a config.json registry`. Severity is a field on the invariants-registry entry; replacing that entry is exactly amend-config's job | ACCURATE — correct op, no bespoke tooling invented |
| The "warning until backfilled, then raised to error" pattern is the prescribed design, not an invention | `derive-decisions-from-facts` convention body, verbatim: "decision-shows-derivation is severity warning until the existing decisions are backfilled, then raised to error (the convention-articulation clean-after-backfill pattern)" | ACCURATE — the task executes the convention's own stated plan |
| FEAT-007 acceptance asks `.context` to enforce at error after backfill | FEAT-007 criterion: ".context enforces at severity error (clean after backfill); the shipped catalog enforces at severity warning for fresh substrates" | CONSISTENT — TASK-041 is the work that satisfies that FEAT-007 criterion for the derivation bite |
| R-0016 flags this exact pending work | R-0016 findings: "decision-shows-derivation is severity WARNING, not error … (pending TASK-041)" | CONSISTENT — R-0016 is the research that informs TASK-041; no contradiction |

## Code-simplifier / best-practice assessment of the DESIGN

- **No wrong API assumptions.** Every op (`append-relation`, `amend-config`, `context-validate`, `append-block-item` for the rationale item) and every relation_type the plan names exists and has the shape the plan relies on. The edge direction the plan needs (decision-as-parent) matches the invariant's `direction: as_parent`.
- **Not over-complex.** This is config-only + edge-only + (where needed) one rationale item per orphan fact — the leanest possible realization. No validator code change, no new relation_type, no schema change. It reuses the already-shipped FEAT-007 mechanism rather than building a parallel one. There is no simpler existing util that the plan is ignoring; the backfill is irreducibly per-decision (each decision's derivation basis is a human-judgement read of its reasoning, not a mechanizable transform).
- **No scope creep / no fragility.** The plan explicitly guards the one place this design could go wrong — "no fabricated/forced edges": criterion 2 mandates filing a real `rationale` item for any basis lacking a pre-existing item rather than bending an edge to an ill-fitting target. That is the correct anti-fragility guard and matches the convention's intent (derivation must be a genuine fact, not a checkbox edge). The escalation branch (`decision_escalates_underdetermined` → framework-gap) correctly preserves the honest path for a decision that genuinely has no derivable basis, so the backfill cannot launder a real fork into a fake derivation.
- **Demonstration criterion is right.** Criterion 4 (a new derivation-less decision is REJECTED at error) is a runtime-bite demonstration, not a tests-pass proxy — consistent with the project's load-bearing "runtime demo" requirement and the correct way to prove an invariant is actually blocking.

## Precision note (NOT a defect — implementer guidance)

`context-validate` at audit time also emits an unrelated ERROR (`FEAT-010` `feature-articulates-convention`) and several unrelated warnings (`TASK-064/065/020` completion-consistency, `layer-plans` nested-array Phase-H). The task's gate is correctly scoped — its criterion reads "zero **decision-shows-derivation** warnings", not "context-validate fully clean" — so these unrelated issues do not block TASK-041 and the task text already gets this right. The implementer must gate on the `decision-shows-derivation` code specifically and must NOT treat the residual FEAT-010 error or the unrelated warnings as in-scope. Worth stating because criterion 3's phrase "context-validate is clean at error" could be misread as whole-substrate-clean; it means "the decision-shows-derivation invariant produces no error-severity issues after the raise" (i.e. all 17 are backfilled), not "the entire substrate validates clean."

## Optional clarity tightening (not required for soundness)

If the criterion-3 wording is tightened to remove the whole-substrate-clean ambiguity, a drop-in replacement for acceptance_criteria[2]:

> "decision-shows-derivation severity is raised warning -> error via amend-config; after the raise, context-validate emits zero error-severity decision-shows-derivation issues (the 17 backfilled decisions all pass; unrelated pre-existing validate issues such as FEAT-010 are out of scope for this task)."

No other field needs changing. The description and criteria 1, 2, 4 are accurate as written and are fit to be composed verbatim into an implementation brief.
