# Relation-graph completeness finding — prior-art investigation

Date: 2026-06-14
Resolved active substrate: **`.context`** (`.pi-context.json` `contextDir` = `.context`; `previous_contextDir` = `.context-jit-spec-v2`). Read-only; driven through the globally-installed `pi-context` CLI ops (`read-block-item`, `find-references`). No substrate mutation. No filing — this is the prior-art precondition (CLAUDE.md Experience-Gap Handling: "Explore before file") for the relation-graph completeness finding raised by `analysis/2026-06-14-substrate-relation-graph-completeness-audit.md`.

## The candidate finding (restated)
Warranted non-invariant closure-table edges are under-filed: edges an item's own text entails are absent because only relation_types backed by a `requires-edge` invariant are enforced at validation. Concrete missing edges named by the audit: TASK-010→DEC-0008 (`task_governed_by_decision`), TASK-010→FGAP-012 (`task_addresses_gap`), TASK-012→DEC-0009, TASK-012→FGAP-015, TASK-014→FGAP-014.

---

## Prior-art determination: ALREADY TRACKED — FGAP-091 is a near-verbatim match

**FGAP-091** ("no forcing function for warranted non-invariant closure-table edges", status `identified`, created `2026-06-14T02:08:01Z` THIS session) FULLY covers the finding. It was filed AFTER the completeness audit md (whose own Part C prior-art search predates FGAP-091 and therefore concluded "no existing item tracks the class" — that conclusion is now stale; the audit's recommended NEW filing was, in fact, made, and IS FGAP-091).

Element-by-element coverage of the candidate finding against FGAP-091's filed body:

| Finding element | FGAP-091 coverage |
|---|---|
| Root mechanism (edge-presence forced only for `requires-edge`-backed relation_types) | VERBATIM: "Closure-table edge presence is enforced only for relation_types backed by a requires-edge invariant… Every other warranted relation_type — task_governed_by_decision, task_addresses_gap, task_addresses_feature, research_informs_item, the data_flow links — has no requires-edge invariant" |
| Both-surface absence (no write-time completeness check; no validate rule for absent non-invariant edge) | VERBATIM: "The forcing-function absence is both-surface: write-time has no completeness check tying an item's filed body to the edges its text entails, and context-validate has no rule flagging a missing non-invariant edge" |
| The five concrete missing edges | VERBATIM, named as the triggering instance: "the five missing TASK->decision/gap edges (TASK-010->DEC-0008 and ->FGAP-012, TASK-012->DEC-0009 and ->FGAP-015, TASK-014->FGAP-014) are the triggering instance" — exactly the audit's set |
| "Warranted" ≠ universal (not every task addresses a gap) | VERBATIM: "Warranted means entailed by an item's filed text or by the relation_type's intended population — not universal… so a blanket requires-edge invariant is not the answer for every type" |
| Concentration in pre-discipline history | VERBATIM: "concentrated in pre-discipline history" |
| Remediation axis (generalize TASK-041 / DEC-0016 backfill-then-raise; text-entailment validator where conditional) | VERBATIM in `proposed_resolution`: per-type requires-edge where universally entailed (gated behind backfill, warning→error), text-entailment check ("'closes FGAP-...', 'per DEC-...'") where conditional |
| Relations to TASK-041 / DEC-0016 / FGAP-082 | Named in `proposed_resolution`: "Relate to TASK-041 (per-type precedent), DEC-0016 (mechanism), FGAP-071 (contained instance), FGAP-082 (engine axis)" |

There is no residual element of the finding that FGAP-091 omits. The finding and FGAP-091 are the same gap.

## TASK-041 — per-type instance, not the class (consistent with both audits)
TASK-041 ("Backfill decision derivation edges, raise decision-shows-derivation to error", `planned`) is the SAME backfill-then-raise pattern applied to ONE relation_type (`decision_derived_from_item`) backed by ONE already-live invariant (`decision-shows-derivation`, at warning). It does NOT touch `task_governed_by_decision` / `task_addresses_gap` / `research_informs_item` and does NOT name the five missing edges. FGAP-091 explicitly cites TASK-041 as "the per-type precedent." TASK-041 is a contained sibling, not coverage of the finding.

## Spot-confirmation: the named missing edges are still absent
- `find-references --id TASK-010` → 3 edges: `verification_verifies_item` (VER-009), `item_governed_by_convention` (feature-branch-workflow, cli-command-form). **No edge to DEC-0008; no edge to FGAP-012.** Entailment: TASK-010's description names "Per DEC-0008 / FGAP-012" (per FGAP-091 evidence); FGAP-012's `proposed_resolution` names TASK-010 as a closer (per the completeness audit). Edge warranted, absent — confirmed.
- `find-references --id TASK-014` → 2 edges: `verification_verifies_item` (VER-008), `item_governed_by_convention` (feature-branch-workflow). **No edge to FGAP-014.** Entailment: TASK-014's description names "Closes FGAP-014"; FGAP-014's `closed_by` names "TASK-014." Edge warranted, absent — confirmed.

(TASK-012→DEC-0009/FGAP-015 not re-probed here; the audit and FGAP-091's evidence array both independently confirm them via `find-references TASK-012` → VER-007 + two conventions only.)

## Class verdict (gap-explore-surfaces-class)
The finding is NOT a narrow symptom needing generalization — FGAP-091 ALREADY files at the class level. FGAP-091's `canonical_vocabulary` is "forcing-function coverage for warranted non-invariant closure-table edges"; its `impact` states the absences "accumulate silently as item counts grow." It treats the five edges as the triggering instance of a structural class spanning every non-invariant warranted relation_type. The completeness audit (Part C) independently reached the identical class characterization. Two independent investigations converged on the same class, and the class is filed. No broader class is unnamed.

## Residual check — is anything NOT covered?
Two candidate residuals, neither a new gap:

1. **The concrete missing-edge BACKFILL itself.** Writing the five (plus TASK-011→FGAP-012/DEC-0008, the symmetric co-closer from the audit) edges is remediation WORK under FGAP-091, not a separate gap. It is a TASK under FGAP-091 (the `task_addresses_gap` / `task_governed_by_decision` analog of TASK-041's derivation backfill), to be filed only when the user directs remediation. It is NOT a gap and NOT yet a filed task. FGAP-091 has zero edges currently (`find-references --id FGAP-091` → empty), so no backfill task is yet related to it.

2. **The R-0014 zero-edges candidate** (audit Part B) — `research_informs_item` from R-0014 to FGAP-089 etc. This is one more instance of the SAME class FGAP-091 names (`research_informs_item` is in FGAP-091's enumerated under-filed set). Not a distinct gap; another triggering instance, and remediation belongs to the same backfill work.

Neither residual warrants a new framework-gap.

---

## VERDICT
**ALREADY TRACKED — do not file a new gap; inform FGAP-091.** FGAP-091 (filed this session, `identified`) is a near-verbatim match to the relation-graph completeness finding: same root mechanism (edge-presence forced only for `requires-edge`-backed relation_types), same both-surface absence, the same five concrete missing edges named as its triggering instance, the same "warranted ≠ universal" scoping, and the same TASK-041/DEC-0016/FGAP-082 remediation relations. The completeness audit's Part C "no existing item tracks the class → file new" conclusion is stale (it predates FGAP-091); the new filing it recommended was made and IS FGAP-091. TASK-041 remains the per-type derivation-edge instance, not coverage of the class. The only forward work is remediation — a backfill TASK under FGAP-091 to write the five (plus symmetric TASK-011) warranted edges, filed when the user directs it — which is a task, not a gap, because writing entailed edges is remediation of a tracked gap, not a newly-discovered divergence. Spot-confirmed still-absent: TASK-010→{DEC-0008,FGAP-012} and TASK-014→FGAP-014.

Class verdict: the finding is the class FGAP-091 already names; no broader unnamed class.
