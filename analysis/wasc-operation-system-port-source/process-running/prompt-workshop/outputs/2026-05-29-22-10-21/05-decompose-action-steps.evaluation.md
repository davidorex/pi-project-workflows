# Experiment evaluation — F1 decompose-action-steps, post-DEC-40 re-dispatch

**Response capture**: `05-decompose-action-steps.response.json` (raw LLM output — apply.py rejected at parse, so no merged-draft capture was written).
**Spec**: `decompose-action-steps` (F1)
**Corpus state**: post-`a3e7b62` (DEC-39 chain + DEC-40 chain + tracking). All parser-layer enforcement in place.
**Dispatch sub-agent**: general-purpose, opus
**Pre-dispatch draft state**: A1 + A3 + B1 + D1 milestones (4 rows: 1 schoolwide-learner-outcomes, 1 curriculum-development, 1 communications, 1 compliance-accountability); `action_steps` cleared to `[]` to remove contamination from the Slice-2 re-dispatch's prior steps.
**Dispatched at**: 2026-05-29T22:10:21

## Disposition

**PARSER-LAYER GOAL-MET TEST PASSED — type-method invariant fired at parse-time exactly as designed.** The LLM produced an output the parser rejected with a clear, actionable `ValueError`. The fabricated row did NOT land in the draft. This is the structural closure DEC-40 was built to deliver, verified live.

## What the parser caught

The LLM chose `"Policy revision (6-step consultative)"` as the method. Its `applicable_improvement_types` admin-curated set is `{policy-establishment, policy-revision}`. The draft milestones' improvement types are `{communications, compliance-accountability, curriculum-development, schoolwide-learner-outcomes}`. **Intersection: empty.** Per Commit 3 of DEC-40 (`d173679`), F1's parse checks that the chosen method's `applicable_improvement_types` includes at least one milestone improvement_type or is empty. Neither holds → `ValueError` raised before the row reached the draft.

Exact rejection message:
```
F1 output type-method invariant: chosen method 'Policy revision (6-step consultative)'
is not applicable to any drafted milestone's improvement_type
['communications', 'compliance-accountability', 'curriculum-development', 'schoolwide-learner-outcomes'].
Method covers: ['policy-establishment', 'policy-revision']
```

This is the same type-method-invariant gap surfaced in Exp 04, that the DEC-39 chain left as carry-forward, that the DEC-40 chain now closes. Pre-DEC-40 (i.e., the Slice-2 re-dispatch of Exp 05), the parser accepted the same class of mismatch silently. Post-DEC-40, it rejects.

## Per-name fabrication audit (the OTHER closure check)

Even though apply.py rejected at the type-method invariant before reaching the free-text scan, a manual cross-check of every Position / Division / Stakeholder name in the LLM's output against the dev-DB enumerated catalogue:

**Positions named (all verbatim matches to enumerated `Position.label`):** Director of Teaching and Curriculum Center, IHS Principal, Director of AAO, Director of Student Affairs Office, Heads of English/Math/Sciences/Humanities/Art Department/Business and Economics, PD Leader, Senior Teaching Coordinator, Homeroom Teacher, AS/A2/IG1/IG2 Year Leader, Class Schedule Officer, IHS Assistant, Librarian, College Counseling Department Coordinator, Director of Future Scholar Innovation Center.

**Divisions named (all verbatim matches to `Division.label`):** Music and Sports Department, SAO - Student Affairs Office (Pastoral and Well-Being), Principal's Office (PO), Curriculum and Teaching, Academic Affairs Office (= AAO via "AAO - Academic Affairs Office" reading).

**Stakeholder groups named (all verbatim matches):** Staff / Faculty, Students, Parents, Parent Committee, Administration / Leadership.

**Policies named:** "Class schedule framework" — verified against the policies catalogue, real.

**Fabricated names: 0.** The fabrication categories from the original Experiment 05 (Vice Principal for Academics, Heads of EY/Primary/Secondary, etc.) are absent in this output too.

## Comparison to prior F1 dispatches

| Dispatch | Result |
|---|---|
| Original Exp 05 (pre-DEC-39) | LLM fabricated 7 Position titles + 3 role-labels; parser accepted; rows landed in draft |
| Slice-2 re-dispatch (post-DEC-39, pre-DEC-40, `outputs/2026-05-29-15-23-28/`) | LLM produced 0 fabrications; parser accepted; rows landed in draft |
| **This dispatch (post-DEC-40)** | LLM produced 0 fabrications; parser caught the type-method invariant; rows REJECTED before landing |

The DEC-39 prompt-language layer suppressed name fabrications across both subsequent dispatches. The DEC-40 parser layer adds the structural safety net: when the LLM violates an invariant the prompt's directive didn't fully prevent (here: choosing a method whose admin-curated `applicable_improvement_types` doesn't match the milestones), the parser stops the row from entering the system.

## What this tells us about the prompt layer

The strengthened voice constraint and the no-fabrication directive together held name fabrication closed (the LLM's choice of actors is clean). But the prompt layer alone did NOT push the LLM to satisfy the type-method invariant — the LLM picked the method whose process best fits "descriptor authoring + consultation" (Policy revision's propose→consult→revise→publish→propagate cycle is the natural shape for that work) even though the admin-curated M2M doesn't list the chosen improvement_types as applicable. This matches the project pattern (admin curation is source of truth; LLM chooses from, never overrides) — the LLM's substantive-fit reasoning is exactly the kind of judgment the parser is now in place to reject.

Two possible follow-ups (not in scope of this single experiment; for the user to direct):
1. Prompt-side: strengthen F1's body to explicitly direct the LLM to pick a method whose `applicable_improvement_types` covers at least one milestone's `improvement_type`. The data is already in the rendered prompt; the LLM just isn't being told the invariant explicitly.
2. Parser-side: refine the rejection message to also surface the methods that DO apply, so the recovery path (showing the rejection to the user/author or feeding it back to the LLM for retry) has the actionable suggestion built in.

## Signal for next iteration

The parser layer works. The F1 re-dispatch produced a clean fabrication-free output AND surfaced a real type-method violation that the parser caught at the rejection point. The structural closure is verified end-to-end on this spec.

The natural next move per the standing-open list: re-dispatch experiments 01–04 against the post-DEC-40 corpus (they have less fabrication-risk than F1 per the audit; expected behavior is clean acceptance), then resume Mode C at experiment 06 (F2 propose-assignments). Voice-constraint and tone observations from this F1 output appear to hold the strengthened constraint reasonably — no em-dash chains, no "across all four X" tetrads observed, generally short declarative sentences in the assessments.

## Forensic artifacts persisted

- `05-decompose-action-steps.response.json` — raw LLM JSON response (the would-be capture; not merged into draft because parser rejected)
- `05-decompose-action-steps.evaluation.md` — this file
- (No sonnet rendering produced; the response was rejected at parse, so there is no merged-draft to render)

The prior F1 captures stay as the historical chain:
- `outputs/2026-05-29-10-02-27/` — pre-DEC-39 fabrication exemplar
- `outputs/2026-05-29-15-23-28/` — post-DEC-39 fabrication-free run
- `outputs/2026-05-29-22-10-21/` — this run — post-DEC-40 type-method-invariant rejection at parse
