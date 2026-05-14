## Layers (L6) — observed

Inferred from FGAP `layer` field usage: L1, L2, L3, L4. From `layer-plans.json` PLAN-001 covers L1-L5 Muni restructure. No `layer.schema.json` exists in registry (referenced in MEMORY.md as FGAP-016 surface, unauthored).

| canonical_id | display_name (inferred from PLAN-001 / FGAP usage)                      |
| ------------ | ----------------------------------------------------------------------- |
| L1           | substrate (block storage / schemas / closure-table primitives)          |
| L2           | query (filter / resolve / walk / find-references)                       |
| L3           | composition (lenses / roadmap-plan / execution-context)                 |
| L4           | dispatch (jit-agents / workflow orchestration / monitor classification) |
| L5           | surface (commands / tools / ceremonies / display)                       |

Source: `analysis/gsd-2-foundational-intelligence.md` + `analysis/gsd-2-derivability.md` lay out Muni L1-L5; PLAN-001 in layer-plans.json carries layer definitions.

## Status (L5) — observed enums across blocks

| Block          | Enum                                                                    |
| -------------- | ----------------------------------------------------------------------- |
| decisions      | open / enacted / superseded                                             |
| framework-gaps | identified / closed                                                     |
| tasks          | planned / completed (+ schema allows in-progress / blocked / cancelled) |
| verifications  | passed (+ schema allows failed / skipped)                               |
| issues         | open / resolved                                                         |
| roadmap        | draft / active / paused / complete / archived (per schema)              |
| phase          | planned / in-progress / completed                                       |
| research       | complete / superseded (per schema; supersedes lifecycle)                |
| spec-reviews   | (per schema, clean / blocked when has findings)                         |

**Reconciliation patterns visible:**
- Three lifecycle families: workflow-state (planned/in-progress/completed), gate-state (open/closed or identified/closed), authority-state (open/enacted/superseded).
- config.status_buckets normalizes raw → bucket (complete / in_progress / blocked / todo / unknown) — single normalization surface bridges the three families.
- FGAP-021 carries the open reconciliation task.

## Relation_types (L3) — derivable

From code (test fixtures + project-context.ts):
- `phase_depends_on` (PHASE→PHASE ordering)
- `phase_member` (item → PHASE virtual-parent membership via lens-bin)

From inline FK violations + edge-shaped schema fields:

| Source field                                                         | relation_type candidate                                                          |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `tasks[].phase`                                                      | task_in_phase                                                                    |
| `tasks[].depends_on`                                                 | task_depends_on                                                                  |
| `decisions[].supersedes` + `superseded_by`                           | decision_supersedes                                                              |
| `decisions[].related_decisions`                                      | decision_relates_to                                                              |
| `decisions[].related_findings` / `related_features` / `related_gaps` | decision_addresses_finding / decision_addresses_feature / decision_addresses_gap |
| `framework-gaps[].related_decisions`                                 | gap_addressed_by_decision                                                        |
| `framework-gaps[].related_features` / `related_issues`               | gap_addressed_by_feature / gap_addressed_by_issue                                |
| `features[].blocks_resolved`                                         | feature_resolves_block                                                           |
| `features[].depends_on` (epic + story)                               | feature_depends_on / story_depends_on                                            |
| `features[].resolved_by` (findings)                                  | finding_resolved_by                                                              |
| `issues[].resolved_by`                                               | issue_resolved_by                                                                |
| `rationale[].related_decisions`                                      | rationale_supports_decision                                                      |
| `requirements[].depends_on`                                          | requirement_depends_on                                                           |
| `research[].supersedes` / `superseded_by`                            | research_supersedes                                                              |
| `spec-reviews[].resolved_by` (findings)                              | review_finding_resolved_by                                                       |
| `verifications[].target` (TASK reference)                            | verification_verifies                                                            |
| `layer-plans[].related_decisions`                                    | plan_relates_to_decision                                                         |
| `layer-plans[].phases[].depends_on`                                  | plan_phase_depends_on                                                            |

Plus DEC-0017 work-unit context bundle relation_types (declared in context-contracts):
- declared per unit-kind in `context-contracts.bundle_relation_types[]`; currently empty for CTX-001..003

## Lenses (L4) — derivable

From `roadmap-plan.test.ts` patterns + current substrate:

| Lens id                 | kind        | target/members               | bins                                       |
| ----------------------- | ----------- | ---------------------------- | ------------------------------------------ |
| tasks-by-phase          | target      | tasks                        | PHASE-005..PHASE-014 (or future phase ids) |
| decisions-by-status     | target      | decisions                    | open / enacted / superseded                |
| gaps-by-status          | target      | framework-gaps               | identified / closed                        |
| issues-by-status        | target      | issues                       | open / resolved                            |
| verifications-by-target | target      | verifications                | TASK-NNN ids                               |
| features-by-status      | target      | features                     | per status enum                            |
| decisions-by-layer      | target      | decisions                    | L1..L5                                     |
| gaps-by-layer           | target      | framework-gaps               | L1..L5                                     |
| arc-rollup-by-phase     | composition | tasks + verifications + gaps | per PHASE                                  |
| decision-context        | composition | decisions + research + gaps  | per DEC                                    |
| spec-reviews-by-target  | target      | spec-reviews                 | spec doc paths                             |

## Resolution patterns visible

**Pattern 1 — every inline FK-as-field maps 1:1 to a relation_type.**
The current FK violations enumerate the relation_type registry. DEC-0013 forces this mapping; FGAP-040 + FGAP-046 explicitly track tasks-block violations. Same migration applies to decisions / features / framework-gaps / rationale / requirements / research / spec-reviews / layer-plans / issues — all carry inline FK-shaped fields.

**Pattern 2 — relation_type names follow `<source>_<verb>_<target>` or `<source>_<verb>` shape.**
Code already uses `phase_depends_on`, `phase_member`. The depends_on / supersedes / related_X / resolved_by inline fields name the verbs; converting to relation_type slugs preserves the verb.

**Pattern 3 — category bucketing per config.relation_types[].category.**
Three categories declared in config.schema.json: ordering / data_flow / membership.
- ordering: depends_on / supersedes / phase_depends_on
- membership: task_in_phase / phase_member / blocks_resolved
- data_flow: research_grounds / verification_verifies / rationale_supports

**Pattern 4 — lenses use status enums + ID prefixes as bin sources.**
Every status enum + every layer registry entry + every PHASE id can become a lens bin. Lens kind (target vs composition) depends on whether projection spans one block or many.

**Pattern 5 — status reconciliation through config.status_buckets.**
Each raw enum value maps to {complete / in_progress / blocked / todo / unknown}. This is the bridge across the three lifecycle families.

**Pattern 6 — closure-table edges replace inline arrays.**
For every block kind, the FK-as-field → relations.json migration is mechanical: drop inline field + write N edges per item. New relation_type canonical_ids needed for each replaced inline field name.

**Pattern 7 — DEC-0017 work-unit context contracts declare which relation_types are bundle-relevant per unit-kind.**
Once relation_types are registered, the context-contract entries (CTX-001 task / CTX-002 decision / CTX-003 verification) populate their `bundle_relation_types[]` with the subset that composes a unit's execution context.