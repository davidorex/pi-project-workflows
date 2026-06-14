# Gap → Task → Feature → Release Coverage Audit (.context substrate)

Date: 2026-06-14. Active substrate: `.context` (per `.pi-context.json` `contextDir`). Method: per-gap / per-task `find-references` over the closure table; bin counts from the `gaps-by-status` lens. Open work = status ∈ {identified, accepted, in-progress}.

Gap status bins (lens `gaps-by-status`): identified 40, accepted 5, in-progress 0, **closed 48**, wontfix 0 — **total 93, open 45**.

Edge vocabulary used: `task_addresses_gap` (tasks→framework-gaps), `gap_addressed_by_feature` (framework-gaps→features), `task_addresses_feature` (tasks→features). Note: `item_acknowledges_missing_convention` (decision→gap) and `decision_addresses_gap` / `decision_raises_gap` / `gap_relates_to_gap` are NOT task-coverage edges.

---

## 1. Gap → task coverage

A gap is "task-covered" iff it carries ≥1 incoming `task_addresses_gap` edge **from a non-cancelled task**.

### COVERED (gap → addressing task[s]) — 7 of 45

| Gap | status | addressing task | task status |
|---|---|---|---|
| FGAP-007 | accepted | TASK-027 | planned/pending |
| FGAP-016 | identified | TASK-022 | planned/pending |
| FGAP-017 | identified | TASK-020 | planned/pending |
| FGAP-018 | identified | TASK-021 | planned/pending |
| FGAP-074 | identified | TASK-044 | planned/pending |
| FGAP-082 | identified | TASK-047 | planned/pending |
| FGAP-091 | identified | TASK-064 | **completed** |

### UNCOVERED (open gap, no live `task_addresses_gap` edge) — 38 of 45

| Gap | status | note |
|---|---|---|
| FGAP-089 | identified | only addressing task TASK-060 is **cancelled** → effectively uncovered |
| FGAP-002 | accepted | feature-bound (FEAT-001) + TASK-003 via `task_addresses_feature`, but NO `task_addresses_gap` edge |
| FGAP-004 | accepted | feature-bound (FEAT-002) + TASK-004 via feature edge; no gap edge |
| FGAP-005 | accepted | feature-bound (FEAT-003) + TASK-005 via feature edge; no gap edge |
| FGAP-011 | accepted | only DEC-0007 (`decision_addresses_gap`); no task, no feature |
| FGAP-061 | identified | feature-bound (FEAT-004); no addressing task |
| FGAP-071 | identified | feature-bound (FEAT-007, complete); no task |
| FGAP-033 | identified | no edges |
| FGAP-034 | identified | no edges |
| FGAP-035 | identified | no edges |
| FGAP-036 | identified | no edges |
| FGAP-037 | identified | no edges |
| FGAP-038 | identified | no edges |
| FGAP-039 | identified | no edges |
| FGAP-040 | identified | no edges |
| FGAP-041 | identified | no edges |
| FGAP-042 | identified | no edges |
| FGAP-043 | identified | no edges |
| FGAP-044 | identified | no edges |
| FGAP-045 | identified | no edges |
| FGAP-052 | identified | only `item_acknowledges_missing_convention` ← DEC-0001/DEC-0003 |
| FGAP-053 | identified | only `item_acknowledges_missing_convention` ← DEC-0005 |
| FGAP-054 | identified | only `item_acknowledges_missing_convention` ← DEC-0007 |
| FGAP-055 | identified | only `item_acknowledges_missing_convention` ← DEC-0009 |
| FGAP-056 | identified | only `item_acknowledges_missing_convention` ← DEC-0011 |
| FGAP-057 | identified | only `item_acknowledges_missing_convention` ← DEC-0012/DEC-0016 |
| FGAP-058 | identified | only `item_acknowledges_missing_convention` ← DEC-0013 |
| FGAP-059 | identified | only `item_acknowledges_missing_convention` ← DEC-0015 |
| FGAP-065 | identified | no edges |
| FGAP-067 | identified | no edges |
| FGAP-076 | identified | R-0012 informs; DEC-0018 `decision_raises_gap` + `decision_gated_by_item`; no task/feature |
| FGAP-083 | identified | no edges |
| FGAP-084 | identified | no edges |
| FGAP-085 | identified | no edges |
| FGAP-086 | identified | no edges |
| FGAP-087 | identified | no edges |
| FGAP-092 | identified | only DEC-0018 `decision_addresses_gap`; no task/feature |
| FGAP-093 | identified | only `gap_relates_to_gap` → FGAP-090/FGAP-007; no task/feature |

Covered 7 / open 45 → **38 uncovered (84%)**. (Counting FGAP-002/004/005 as covered-by-feature-only still leaves 35 uncovered.)

---

## 2. Task → feature organization

The tasks that address open gaps (the addressing-task set) and their feature rollup via `task_addresses_feature`:

| Addressing task | addresses gap | `task_addresses_feature` | featured? |
|---|---|---|---|
| TASK-020 | FGAP-017 | FEAT-004 | YES |
| TASK-021 | FGAP-018 | FEAT-004 | YES |
| TASK-003 | (FEAT-001 only; no gap edge) | FEAT-001 | YES |
| TASK-004 | (FEAT-002 only; no gap edge) | FEAT-002 | YES |
| TASK-005 | (FEAT-003 only; no gap edge) | FEAT-003 | YES |
| TASK-027 | FGAP-007 | — | **NO feature** |
| TASK-022 | FGAP-016 | — | **NO feature** |
| TASK-044 | FGAP-074 | — | **NO feature** |
| TASK-047 | FGAP-082 | — | **NO feature** |
| TASK-064 | FGAP-091 | — | **NO feature** (completed; standalone) |

Featured addressing-tasks: 5 (all on FEAT-001..004). Orphan (no feature) addressing-tasks: 5 (TASK-027, TASK-022, TASK-044, TASK-047, TASK-064). The substrate rolls tasks up via `task_addresses_feature` (the `feature_contains_story`/`story_contains_task` path is unused for these arcs). No phase placement either.

---

## 3. Feature → release-pinning

Features block (9 total) and status:

| Feature | status | release-pinnable? |
|---|---|---|
| FEAT-001 — substrate clone/import | proposed | YES |
| FEAT-002 — git merge driver | proposed | YES |
| FEAT-003 — convergent ordered-sequence field-kind | proposed | YES |
| FEAT-004 — substrate-derived state (config-driven) | proposed | YES |
| FEAT-005 — pi-bound launch | complete | no (shipped) |
| FEAT-006 — pi-context update | complete | no (shipped) |
| FEAT-007 — convention-articulation enforcement | complete | no (shipped) |
| FEAT-008 — pi-context-cli best-of-breed surface | complete | no (shipped) |
| FEAT-009 — update blocked-diagnostic + resolution loop | complete | no (shipped) |

### Release-pinnable features (proposed = unshipped) and their gap/task rollup

| Feature | covers gaps | covers tasks | task status |
|---|---|---|---|
| FEAT-001 | FGAP-002 | TASK-003 | planned |
| FEAT-002 | FGAP-004 | TASK-004 | planned |
| FEAT-003 | FGAP-005 | TASK-005 | planned |
| FEAT-004 | FGAP-017, FGAP-018, FGAP-061 | TASK-020, TASK-021 | planned (FGAP-061 has NO addressing task) |

Four proposed features can pin a next release. Together they roll up **6 open gaps** (FGAP-002, 004, 005, 017, 018, 061) and **5 tasks** (TASK-003/004/005/020/021). FEAT-004 is the largest arc; FGAP-061 is gap-bound to it but task-less.

### Open gaps NOT rolled up under any feature (cannot be release-pinned as-is) — 39 of 45

All open gaps except the 6 under FEAT-001..004 (and FGAP-071, which is bound to the already-**complete** FEAT-007 so it cannot pin a NEW release):

FGAP-007, FGAP-011, FGAP-016, FGAP-033, FGAP-034, FGAP-035, FGAP-036, FGAP-037, FGAP-038, FGAP-039, FGAP-040, FGAP-041, FGAP-042, FGAP-043, FGAP-044, FGAP-045, FGAP-052, FGAP-053, FGAP-054, FGAP-055, FGAP-056, FGAP-057, FGAP-058, FGAP-059, FGAP-065, FGAP-067, FGAP-071 (bound only to complete FEAT-007), FGAP-074, FGAP-076, FGAP-082, FGAP-083, FGAP-084, FGAP-085, FGAP-086, FGAP-087, FGAP-089, FGAP-091, FGAP-092, FGAP-093.

Of these, 7 carry a live task (FGAP-007/016/074/082/091 + the cancelled-task FGAP-089) but no feature, so they are task-tracked yet release-unpinnable without a feature container. The rest are bare (gap-only, or convention-debt acknowledged by a decision).

---

## Structural observations

- **`task_addresses_gap` is sparse**: only 6 live such edges across 45 open gaps; even the feature-arc gaps (FGAP-002/004/005) lack a direct gap→task edge — the link is gap→feature→task. This is the exact under-filing FGAP-091 names (warranted-but-absent non-invariant edges; no forcing function flags the absence).
- **Convention-debt gaps** (FGAP-052..059) are a self-contained class: each is `item_acknowledges_missing_convention`'d by a decision, none task-addressed, none feature-bound — tracked debt, not actionable work.
- **Schema-model gaps** (FGAP-033..045) are bare — no task, no feature, no decision — a flat unbound cluster (the FGAP-071 drift pattern).
- **FGAP-089 regression risk**: its sole addressing task TASK-060 is cancelled; FGAP-089 reads as task-covered to a naive `task_addresses_gap` scan but is not actionably covered.
