# Sub-element identity gap (MODEL)

Date: 2026-06-19. Active substrate: `.context`. Status: capability gap, resolution TBD.

## The capability we lack

A sub-element of a substrate item has no identity, so it cannot be individually
referenced, related, verified, or tracked across edits. Items have ids; the
meaningful parts INSIDE an item — held as entries in a nested array — do not.
Nothing can point at one such part, bind to it, or recognize it as the same part
after its content changes. The part's only handle is its position (array index,
which moves on insert/delete/reorder) or its prose (which changes when reworded).
Neither is a stable identity.

## Acute instance — task criteria + per-criterion verification

- `tasks.acceptance_criteria` is an `array` of plain `string` (schema-verified
  2026-06-19: `properties.tasks.items.properties.acceptance_criteria` → `{type:
  array, items:{type:string}}`). No per-criterion id.
- `verification.criteria_results[]` items are `{criterion: string, status:
  passed|failed|skipped, evidence?: string}` (schema-verified:
  `properties.verifications.items.properties.criteria_results.items`). A
  per-criterion verification result is keyed on the criterion's TEXT, not an id.

So the only join between a task's criterion and its verification result is exact
prose match. A criterion is identified by what it says.

## Reproduction — TASK-069 criterion rewording

During TASK-069, success criteria were edited to current truth (criteria
reworded across iterate-to-zero loops). Because a criterion has no identity apart
from its prose, editing its wording orphans / silently mismatches its
`criteria_results` entry: the reworded criterion no longer text-matches the
result that verified its prior wording, and nothing can establish that the
reworded criterion is the same criterion. Per-criterion verification is therefore
not durable across the very edits the canonical iterate-to-zero process requires.

## Partial existing recognition — `nested_id_bearing_array` validator

`context-validate`'s `nested_id_bearing_array` check (context-sdk.ts:2390-2428,
`findNestedIdBearingArrays`) enumerates installed schemas and flags every array
property at nesting depth ≥ 1 whose item shape ALREADY carries an `id` —
"promote to a top-level entity + membership edge (Phase H)". It fired on
`plans.layers` and `plans.migration_phases` (its message text references "Phase
H"). It is structural and partial:

- It recognizes the SHAPE (a nested id-bearing array) and names the general
  direction (promote-to-entity + membership edge), but only for arrays whose
  items ALREADY bear an id.
- `acceptance_criteria` (string array) and `criteria_results` (objects with NO
  `id` field) are not flagged — they bear no `id`, so the check does not cover
  them. It detects items that have identity-shaped fields but are nested; it does
  NOT detect parts that lack identity and need it.

"Phase H" is an off-substrate content-addressed-identity arc milestone
(`analysis/2026-05-31-content-addressed-substrate-identity-EXECUTION-PLAN.md`),
not a filed substrate gap.

## Prior art in the substrate

The schema-model cluster (all `identified`, P2) is adjacent but distinct — it
proposes restructuring criteria into richer objects with INLINE proof; none of it
gives a criterion a stable IDENTITY:

- FGAP-035 — replace `acceptance_criteria` (string array) with `success_criteria`
  of objects `{statement, status, verified_by, verified_at, evidence}`. Inlines
  proof onto the criterion object; the criterion is still keyed by `statement`
  prose, no id. OVERLAPS the acute instance's surface; does NOT confer identity.
- FGAP-036 — constrain those criteria to binary outcome-based. Adjacent.
- FGAP-038 — retire the `verification` block; fold proof onto the criterion
  inline. Eliminates the text-keyed cross-item join by removing the second
  construct, but the surviving criterion still has no id (so cross-edit identity
  is still absent). OVERLAPS; orthogonal to identity.

The general MODEL class (sub-element / nested-array identity) is NOT tracked. No
FGAP or DEC frames "a part inside an item needs its own stable identity." The
`nested_id_bearing_array` validator is the only artifact in the codebase pointing
at the promote-to-entity direction, and it covers only already-id-bearing nested
arrays.

## Class

This is a general MODEL capability gap, not the criteria instance alone. Criteria
are one instance; any meaningful nested-array part lacking identity is the same
class (e.g. evidence entries, options_considered, consequences, criteria_results
themselves). The acute instance triggers it; the gap is the missing capability.

Resolution: NOT determined here.
