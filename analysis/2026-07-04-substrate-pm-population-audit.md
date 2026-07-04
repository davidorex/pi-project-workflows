# Substrate PM population-completeness audit — milestone → phase → task → (gap/issue/feature)

Date: 2026-07-04
Active substrate: `.context` (`.pi-context.json` `contextDir` = `.context`, verified).
Method: read-only, via the operator `pi-context` CLI only (no direct file reads on `.context/*.json`). Every claim carries the CLI op that produced it.
Question audited: is the milestone→phase→task→(gap/issue/feature) graph completely and canonically populated, or are there population gaps/defects? Deliberate-by-convention (JIT-undecomposed member gaps named in phase `intent`) is distinguished from genuine structural defect.

## Population totals (lens summaries)

- Tasks: 77 total — 19 planned, 56 completed, 2 cancelled, 0 in-progress/blocked (`context-lens-view --lensId tasks-by-status`).
- Framework-gaps: 113 total — 51 identified, 4 accepted, 57 closed, 1 uncategorized (`context-lens-view --lensId gaps-by-status`).
- Issues: 10 total — 4 open, 6 resolved (`context-lens-view --lensId issues-by-status`).
- Features: 10 total — 5 proposed, 5 complete (`context-lens-view --lensId features-by-status`).
- Milestones: 9 (MILE-001..009), ALL status `planned` (`read-block --block milestone`).
- Phases: 11 (`read-block --block phase`) — 9 milestone phases (`planned`) + `PHASE-PORT-OPS` (in-progress) + `PHASE-CATALOG-PRESTANDUP` (completed).

## Convention basis (the JIT membership model)

Per `analysis/2026-07-03-mile-003-criteria-validation.md` and confirmed against the relation registry (`read-config --registry relation_types`): membership of a NON-task item (gap/issue/feature) in a phase is expressed by naming its id verbatim in the phase's `intent` TEXT. There is **no** `gap_positioned_in_phase` / `issue_positioned_in_phase` / `feature_positioned_in_phase` relation_type registered — only `task_positioned_in_phase` and `phase_positioned_in_milestone` connect the spine. A member gap named in an intent without a task is therefore JIT-not-yet-decomposed **by convention**, not by defect.

## Per-milestone table

All 9 milestones are `planned`; each holds exactly one phase (`walk-ancestors --id MILE-00N --relationType phase_positioned_in_milestone` returns one phase per milestone), each phase `planned`. Task membership from `walk-ancestors --id <PHASE> --relationType task_positioned_in_phase`; non-task members parsed from the phase `intent`; statuses from `resolve-items-by-id`.

| Milestone (status) | Phase | Member TASKS + status | Intent-named NON-task members + status + task?/edge? | JIT-undecomposed (open, no task) |
|---|---|---|---|---|
| MILE-001 planned | PHASE-M1-CEREMONY-RECOVERY | TASK-071 planned, TASK-055 planned | FGAP-106 identified (no task) | 1 (FGAP-106) |
| MILE-002 planned | PHASE-M2-CATALOG-PARITY | TASK-067 planned | FGAP-102 identified P0 (NOW-leg addressed by completed TASK-075 via task_addresses_gap; forward parity-gate open), FGAP-067 identified P3 (no task) | 2 (FGAP-102 fwd, FGAP-067) |
| MILE-003 planned | PHASE-M3-DATA-CONVERGENCE | TASK-073 planned, TASK-072 planned | FGAP-105 identified P1, FGAP-107 identified P2, issue-005 open, issue-003 open, FGAP-092 identified P2, FGAP-076 identified P2 (none has a task) | 6 |
| MILE-004 planned | PHASE-M4-INSTALL-COMPLETENESS | TASK-074 planned | FGAP-033 identified P2 (no task; needs a DEC before execution per intent) | 1 (FGAP-033) |
| MILE-005 planned | PHASE-M5-WRITE-INTEGRITY | TASK-027 **completed** | FGAP-093 identified (no task), FGAP-091 identified (completed TASK-064 addresses it, gap stays open for the class), FGAP-085 identified P3 (no task) | 3 |
| MILE-006 planned | PHASE-M6-DERIVATION-TRUTH | TASK-068 planned, TASK-021 planned | FGAP-103 identified P1 (no task), FGAP-061 identified (NOW-leg addressed by completed TASK-065; forward FEAT-004 home open), FEAT-004 proposed (completed TASK-020 + planned TASK-021 address facets; class-level open) | 1 pure (FGAP-103) + 2 partial |
| MILE-007 planned | PHASE-M7-ENFORCEMENT | TASK-047 planned, TASK-041 planned | FGAP-071 identified, FGAP-086 identified, FGAP-087 identified (none has a task) | 3 |
| MILE-008 planned | PHASE-M8-OPERATOR-SURFACE | TASK-022 planned, TASK-057 planned, TASK-058 planned, TASK-054 planned | FGAP-104 identified, FGAP-108 identified, FGAP-044 identified, FGAP-045 identified (none has a task) | 4 |
| MILE-009 planned | PHASE-M9-MULTI-WRITER | TASK-004 planned, TASK-005 planned, TASK-003 planned | FGAP-011 accepted (release vocabulary; no task) | 1 (FGAP-011) |

Non-milestone phases (no `phase_positioned_in_milestone` edge — see cross-cutting #1):

| Phase (status) | Member TASKS | Intent-named non-task | Notes |
|---|---|---|---|
| PHASE-PORT-OPS in-progress | none (`walk-ancestors` → []) | none | Historical WASC port; incident edges are research_informs_item (R-0020..0024) + session_touches_item (SESSION-009). Filed in-progress but per FGAP-103 actually user-paused. |
| PHASE-CATALOG-PRESTANDUP completed | TASK-075 completed, TASK-076 completed | FGAP-101 (closed), FGAP-102 (NOW-leg) named in goal | Pre-standup catalog fixes; both member tasks completed, phase completed. |

Classification of every non-task member (deliverable point 3): (a) already closed → FGAP-101 only (and it is named in a completed phase's goal, not a forward member). (b) has a task (decomposed / partially) → FGAP-102, FGAP-061, FEAT-004, FGAP-091 each carry a `task_addresses_*` edge from a COMPLETED task that did a NOW leg, with the forward leg remaining open. (c) open with NO task (pure JIT-undecomposed) → FGAP-106, FGAP-067, FGAP-105, FGAP-107, issue-005, issue-003, FGAP-092, FGAP-076, FGAP-033, FGAP-093, FGAP-085, FGAP-103, FGAP-071, FGAP-086, FGAP-087, FGAP-104, FGAP-108, FGAP-044, FGAP-045, FGAP-011 (20 items).

## Cross-cutting checks (genuine-defect candidates)

### 1. Orphans

**Phases with no milestone (2):** `find-references --id PHASE-PORT-OPS` and `--id PHASE-CATALOG-PRESTANDUP` return NO `phase_positioned_in_milestone` edge. Both are historical/transitional (the WASC port and the pre-standup catalog fixes) predating the MILE-001..009 forward spine. Structurally orphan on the milestone graph; arguably by-design (they are not forward roadmap), but nothing records that they sit outside the roadmap.

**Tasks with no phase (57 of 77):** the milestone spine attaches only 20 tasks (union of the 11 `walk-ancestors` results). The other 57 carry no `task_positioned_in_phase` edge. Of these 57: 53 are completed and 2 cancelled (TASK-060, TASK-066) — historical work done before the milestone/phase spine existed, benign. **Only 2 are OPEN (planned) forward tasks with no phase — genuine unplaced work:**
- TASK-044 (planned) — closes FGAP-074 (register-checkpoint guard broadening + atom cleanup); carries `task_addresses_gap`→FGAP-074 and `item_governed_by_convention` but NO `task_positioned_in_phase` (`find-references --id TASK-044`).
- TASK-056 (planned) — resolve-blocked success-report enrichment; carries only `item_governed_by_convention`→docs-surface-sync, NO phase edge, NO addressing edge (`find-references --id TASK-056`).

These two corroborate the earlier observation that TASK-044/TASK-056 carry no phase edge; they are the complete set of open orphan tasks.

### 2. Milestone/phase status coherence

- All 9 milestones and their 9 phases are `planned` — coherent with an unstarted forward roadmap, with ONE exception: PHASE-M5-WRITE-INTEGRITY / MILE-005 remain `planned` while their only member task TASK-027 is `completed` (`resolve-item-by-id --id TASK-027`). Mild incoherence: a phase with a completed member reads as not-started. (The phase is genuinely incomplete — FGAP-093/091/085 remain open — so `in-progress` would be the more truthful status.)
- PHASE-PORT-OPS is `in-progress` while, per the filed gap FGAP-103 (identified, P1), it is user-paused with no representable `paused` status on the phase kind — a known, tracked false-active representation, not a fresh finding.
- `context-validate` emits 5 `task-completed-*` warnings where a completed task addresses a still-open target: TASK-064→FGAP-091, TASK-065→FGAP-061, TASK-075→FGAP-102 (all open gaps), TASK-020→FEAT-004, TASK-070→(feature) (features not complete). These are legitimate NOW-leg-done / forward-leg-open partial addresses, consistent with the JIT model, but they mean several phase-intent "non-task members" are partially decomposed rather than untouched.

### 3. Missing warranted edges (the FGAP-091 class)

- `context-validate-relations` returns **clean** (no dangling, mis-directed, or unregistered edges).
- Sampled attached tasks that name a gap carry the corresponding `task_addresses_gap` edge: TASK-068→FGAP-098, TASK-047→FGAP-082 (`find-references`). TASK-057/TASK-055 name no gap in intent and correctly carry none.
- `context-validate` emits 17 `decision-shows-derivation` warnings (DEC-0001..0017 lack a `decision_derived_from_item`/`decision_escalates_underdetermined` edge). This is exactly the missing-warranted-edge class; it is ALREADY tracked as forward work — the raise-to-error + backfill is TASK-041 (FEAT-007), a member of PHASE-M7, and the general forcing-function is the open gap FGAP-091 (M5 member). So the class is filed, not an un-tracked defect.
- 2 structural `nested_id_bearing_array` warnings on `layer-plans` (plans.layers, plans.migration_phases) — unrelated to the milestone/phase/task graph.

### 4. Roadmap ordering (milestone_precedes_milestone DAG)

Edges collected via `find-references` per milestone:
- MILE-003 → MILE-004, MILE-003 → MILE-006, MILE-003 → MILE-009
- MILE-004 → MILE-001, MILE-004 → MILE-007
- MILE-001 → MILE-002
- MILE-005 → MILE-007, MILE-005 → MILE-009

**8 of 9 milestones are on the precedence DAG.** Two roots (no incoming): MILE-003 (Lane A spine start) and MILE-005 (Lane B parallel). **MILE-008 is an ORPHAN on the DAG — it carries ZERO `milestone_precedes_milestone` edges** (`find-references --id MILE-008` returns only its `phase_positioned_in_milestone` edge). Per PHASE-M8's intent this is "Lane C: parallel with Lanes A and B from the start," so its disconnection is intended in spirit; however, it is inconsistently encoded — MILE-005 is ALSO described as parallel ("Lane B") yet is DAG-connected via outgoing edges to MILE-007/MILE-009, whereas MILE-008 floats with no ordering relative to anything. PHASE-M8's own intent states FGAP-104 (hermetic SKILL generation) "lands FIRST in this lane; every other lane ceremonially runs the generator," which reads as a dependency other lanes have on M8 — i.e. a `milestone_precedes_milestone` edge from MILE-008 is arguably warranted and absent.

## Summary

**Decomposed-into-tasks vs named-only-in-intent (forward roadmap):**
- Tasks positioned in a phase: 20 (17 planned + 3 completed: TASK-027, TASK-075, TASK-076).
- Non-task members named only in phase intents: 24 references (20 pure JIT-undecomposed open gaps/issues + FGAP-011 accepted + 3 partially-decomposed via a completed NOW-leg task + FGAP-101 closed). No `*_positioned_in_phase` edge exists for non-task kinds, so their membership is intent-text only — by convention, correct.

**What is deliberate-JIT (convention-compliant):** the 20 pure-open non-task members named in phase intents without a task (FGAP-106, FGAP-067, FGAP-105, FGAP-107, issue-005, issue-003, FGAP-092, FGAP-076, FGAP-033, FGAP-093, FGAP-085, FGAP-103, FGAP-071, FGAP-086, FGAP-087, FGAP-104, FGAP-108, FGAP-044, FGAP-045, FGAP-011). These are JIT-not-yet-decomposed by the documented membership model, NOT defects. The partial-address cases (FGAP-102/FGAP-061/FEAT-004/FGAP-091) are also convention-consistent (NOW leg done, forward leg is the roadmap member). `context-validate-relations` clean; the forward spine's statuses are internally coherent.

**Genuine population defects (distinct from JIT):**
1. **MILE-008 orphan on the precedence DAG** — zero `milestone_precedes_milestone` edges; not sequenced relative to any milestone, and inconsistent with how the other parallel lane (MILE-005) is encoded; PHASE-M8's own "lands FIRST … every other lane ceremonially runs the generator" implies a precedence edge that is absent.
2. **Two open forward tasks unplaced** — TASK-044 and TASK-056 (both `planned`) carry no `task_positioned_in_phase` edge; open work not attached to any phase/milestone.
3. **Two phases outside the milestone graph** — PHASE-PORT-OPS and PHASE-CATALOG-PRESTANDUP have no `phase_positioned_in_milestone` edge (historical/transitional; arguably by-design but structurally orphan and unrecorded as such).
4. **Minor status incoherence** — PHASE-M5-WRITE-INTEGRITY / MILE-005 stay `planned` despite a completed member task (TASK-027); PHASE-PORT-OPS is `in-progress` while actually user-paused (tracked by FGAP-103).

**Verdict:** the core milestone→phase→task JIT-decomposition IS canonically populated per the documented convention — the forward spine (MILE-001..009, one phase each, 20 attached tasks, intent-named non-task members, coherent statuses, clean relations) is JIT-complete. The user's observation that it is "not correctly and canonically populated, completely" is corroborated in four specific structural respects above (chiefly the MILE-008 DAG orphan, the two unplaced open tasks TASK-044/TASK-056, and the two milestone-less phases) — real population gaps sitting alongside a convention-compliant JIT core, not a broken graph.
