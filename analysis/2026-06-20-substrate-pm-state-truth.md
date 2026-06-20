# Substrate PM-State Truth — `.context` (2026-06-20)

Read-only mining of the active pi-context substrate. Every fact cites the `pi-context` op
that produced it. Drove the globally-installed reflecting CLI directly, one op per question.

## 0. Active substrate + bootstrap state

- **Active contextDir**: `/Users/david/Projects/workflowsPiExtension/.context`
  (`context-bootstrap-state --json` → `output.contextDir`).
- **Bootstrap state**: `not-installed` — **because the `milestone` block file is declared-but-missing on disk**.
  `context-bootstrap-state --json` → `{"state":"not-installed","missing":{"schemas":[],"blocks":["milestone"]}}`.
  All 17 declared schemas are present; the only missing artifact is `milestone.json`. This single
  absent block is what flips the whole substrate to `not-installed`.

This is the first and central finding for the milestone focus: the milestone block has **no data file at all**
(`read-block --block milestone` → exit 1, `"Block file not found: .../.context/milestone.json"`).

## 1. Per-block state (source: `context-status --json` → `blockSummaries`)

| Block | array_key | Total | Status breakdown | Open / not-closed |
|---|---|---|---|---|
| tasks | tasks | 69 | completed 51, planned 16, in-progress 1, cancelled 1 | 17 (16 planned + 1 in-progress) |
| framework-gaps | gaps | 100 | closed 52, identified 43, accepted 5 | 48 |
| issues | issues | 9 | resolved 6, open 3 | 3 |
| decisions | decisions | 18 | enacted 18 | 0 (all enacted) |
| features | features | 9 | complete 5, proposed 4 | 4 proposed |
| verification | verifications | 57 | passed 54, partial 3 | 3 partial |
| research | research | 19 | complete 19 | 0 |
| story | stories | 14 | complete 14 | 0 |
| conventions | rules | 12 | (no status field) | n/a |
| migrations | migrations | 17 | (registry decls) | n/a |
| session-notes | sessions | 8 | (notes) | n/a |
| **milestone** | milestones | **0 / file absent** | — | **block file missing on disk** |
| **phase** | phases | **0** | — | empty array, file present |
| layer-plans | plans | 0 | — | empty |
| rationale | rationales | 0 | — | empty |
| requirements | requirements | 0 | — | empty |
| spec-reviews | reviews | 0 | — | empty |
| work-orders | work_orders | 0 | — | empty |
| context-contracts | contracts | 0 | — | empty |

Config registry sizes (same op, `config` block): block_kinds 18, relation_types 43, lenses 8,
installed_schemas 17, installed_blocks 17, invariants 12, layers 0.

## 2. Tasks — ready / blocked / in-progress / completed (source: `context-current-state --json` + `context-status`)

- **In-progress (1)**: `TASK-068` — make issues a gap-sibling first-class open-work kind
  (parity vocabulary in live config + packaged catalog; two additive issue-schema fields;
  prerequisite for addressing issue-004 by a task).
- **Completed**: 51. **Cancelled**: 1.
- **Ready set (unblocked planned tasks)** — 14, from `nextActions` (kind=task):
  `TASK-003, TASK-004, TASK-021, TASK-022, TASK-027, TASK-041, TASK-044, TASK-047,
   TASK-054, TASK-055, TASK-056, TASK-057, TASK-058, TASK-066`.
- **Blocked set (2)** (`context-current-state` → `blocked`):
  - `TASK-005` blocked by `TASK-004`
  - `TASK-067` blocked by `TASK-066`
- (16 planned total = 14 ready + 2 blocked.)
- **Next ranked also surfaces** `issue-005` (kind=issue, priority high) as open work alongside the ready tasks —
  issues now rank in `next_ranked` (state_derivation config; see §6).

## 3. Open gaps + issues

### Framework-gaps (source: `context-status`; one detail page via `filter-block-items`)
- Open total: **48** = identified 43 + accepted 5. Closed 52.
- Priority bins are config-declared `P0..P3` (`read-config --registry lenses` → `gaps-by-priority`).
  Spot reads: `filter-block-items --field priority --op eq --value '"P0"'` → 1 item, **closed** (FGAP-029,
  the substrate-wiping `--update` gap, closed). `--value '"P1"'` → 4 items, of which 3 closed
  (FGAP-014, FGAP-015, FGAP-070) and **1 open** — `FGAP-099` (identified, P1): "Block data carries no
  schema_version — read-time validation and migration are inert for all blocks."
- (Full per-priority split of the 48 open gaps was not exhaustively enumerated: the open-gap filter
  returns full item bodies and exceeds the 125 KB read cap — `filter-block-items --field status --op in
  --value '["identified","accepted"]'` → `total:48, truncated:true, complete:false`. The 48 open count
  and the status split are authoritative; a complete priority histogram would require paged reads.)

### Issues (source: `read-block --block issues --json`, full block)
- Open total: **3** of 9.
  - `issue-002` (low, open) — layer-plans schema nests id-bearing arrays (`plans.layers`,
    `plans.migration_phases`) instead of top-level entities + membership edges. Schema-only fix; 0 items.
  - `issue-003` (medium, open) — conventions 1.0.0→1.0.1 forward-migration refused items that by
    inspection satisfy 1.0.1; root cause undetermined; not reproducible against this repo's `.context`.
  - `issue-005` (high, open) — same-version resync verbatim-overwrites the installed schema with no
    block-item re-validation; a narrowing catalog change silently invalidates existing items (catalog
    story schema omits `user_kind` while 14 live story items carry it). This is the high-priority open
    issue surfaced in `next_ranked`.
- Resolved 6: issue-001, issue-004 (critical), issue-006/007/008/009 (all critical, the promote-cli
  hardening cluster).

## 4. MILESTONES — the focus

### Config rollup rule (source: `read-config --registry state_derivation --json` → `rollups`)
```json
"rollups":[{"kind":"milestone","membership_relation":"phase_positioned_in_milestone",
            "complete_status":"reached","incomplete_status":"planned"}]
```
Milestone status is a **pure phase-rollup, derived not authored** (confirmed by the milestone schema,
`read-schema --schemaName milestone`): a milestone is **`reached` iff ≥1 phase is positioned in it via a
`phase_positioned_in_milestone` edge (phase = parent, milestone = child) AND the parent phase of every
such edge buckets to `complete`; else `planned`**. The schema states "a milestone carries no work of its
own; authored status is rejected by canon."

The membership relation is registered (`read-config --registry relation_types --id
phase_positioned_in_milestone`): category `membership`, source_kinds `[phase]`, target_kinds `[milestone]`.

### Actual current state
- **Milestones filed: ZERO.** The block has no data file at all — `milestone.json` is absent
  (`read-block --block milestone` → "Block file not found"; `context-bootstrap-state` lists it as the sole
  `missing.blocks` entry). `context-current-state` → `"milestones":[]`.
- **Phases filed: ZERO.** `read-block --block phase` → `{"total":0}` (empty array, file present).
- **`phase_positioned_in_milestone` edges: ZERO** — necessarily, since both endpoint kinds are empty.
  (`context-validate-relations` lists no edge of that type; the only edge issues are `task_advances_story` /
  `feature_advances_story` lens-bin warnings — see §5.)
- **No milestone lens** is configured (`read-config --registry lenses` → 8 lenses, none for milestone/phase);
  the rollup is driven directly off `state_derivation.rollups` + the relations table, not a lens.

### Verdict: why milestones have never been active
Milestones are not "stuck" or mis-statused — **nothing has ever been filed into the milestone OR phase
chain.** There are zero milestones, zero phases, and therefore zero positioning edges. With no phase
positioned in any milestone, the rollup predicate ("≥1 phase positioned AND all complete") is vacuously
unsatisfiable, so no milestone could ever derive `reached`. On top of that the milestone data file does
not even exist on disk, which is what holds the whole substrate at `not-installed`.

### Concrete steps to make milestones active/meaningful
Grounded in the rollup rule + schemas above. All writes via canonical block-api / reflecting CLI
(direct Edit on substrate `*.json` is forbidden):

1. **Create the milestone block file.** `milestone.json` must exist (even as `{"milestones":[]}`) to clear
   the `not-installed` / missing-block state. The canonical path is the install ceremony copying the
   declared `installed_blocks[]` starter, or filing the first milestone item (which materializes the file).
2. **File ≥1 phase** (`phase` block, schema `PHASE-NNN`, required `id/name/intent/status`; status ∈
   `planned|in-progress|completed`). A milestone can only become `reached` once its member phases are
   `completed`.
3. **File ≥1 milestone** (`milestone` block, schema `MILE-NNN`, required `id/name/status`; `status` is
   DERIVED — file it `planned`, never hand-author `reached`).
4. **Append the membership edge(s)** `phase_positioned_in_milestone` with **phase as parent, milestone as
   child** (`append-relation --relation_type phase_positioned_in_milestone`). The direction is load-bearing:
   the schema specifies the phase is the parent and the milestone the child.
5. **Drive the phase(s) to `completed`.** Once every phase positioned in a given milestone buckets to
   complete, the rollup deriver flips that milestone to `reached` automatically; until then it reads
   `planned`. Then `context-current-state` → `milestones[]` is non-empty and milestone rollup becomes live.
6. Run `context-validate` / `context-validate-relations` after the edge writes.

Minimal activation = at least one phase + one milestone + one correctly-directed positioning edge, with the
phase completed. The substrate has none of these today.

## 5. Integrity

### `context-validate --json` → status **`warnings`** (no errors)
21 warnings, all advisory:
- **17 × `decision-shows-derivation`** (warning) — every decision `DEC-0001..DEC-0017` shows no derivation
  basis (missing a `decision_derived_from_item` or `decision_escalates_underdetermined` edge). Block:
  `decisions`. (TASK-041 is the planned remediation: backfill the edges, then raise this to error.)
- **2 × `task-completed-gap-closed`** (warning) — completed `TASK-064` and `TASK-065` each address a gap
  that is not closed. Block: `tasks`.
- **1 × `task-completed-feature-complete`** (warning) — completed `TASK-020` addresses a feature that is not
  complete. Block: `tasks`.
- **2 × `nested_id_bearing_array`** (warning) — `layer-plans` block: `plans.layers` and
  `plans.migration_phases` are nested id-bearing arrays that should be promoted to top-level entities +
  membership edges (this is issue-002). Block: `layer-plans`.

### `context-validate-relations --json` → status **`invalid`**
29 issues, **all the same code `edge_parent_not_in_bins`** — lens-membership warnings where a
`task_advances_story` / `feature_advances_story` edge's parent is not present in the target lens's bins:
- `story-advancers` lens (relation `task_advances_story`): parents `TASK-046, TASK-048 (×6), TASK-049,
  TASK-050, TASK-051 (×4), TASK-052 (×2)` not in bins.
- `story-advancers-features` lens (relation `feature_advances_story`): parent `FEAT-009` against
  `STORY-001..014` (14 edges) not in bins.

These are lens-binning consistency issues (a parent item not appearing in the lens it's edged into), not
structural FK breakage. No dangling-endpoint or orphan-edge errors were reported. **No milestone/phase edge
appears in either validator** — consistent with §4 (none exist).

---

## Op provenance index
- `context-bootstrap-state --json` — active dir, not-installed, missing milestone block.
- `context-status --json` — all block totals + byStatus.
- `context-current-state --json` — focus/in-flight, ready (nextActions), blocked, milestones[]=[].
- `read-block --block milestone` (file-not-found) / `read-block --block phase` (total 0).
- `read-block --block issues --json` — full issue bodies + statuses.
- `read-config --registry state_derivation` — rollups rule.
- `read-config --registry block_kinds --id milestone|phase` — block defs (data_path, array_key).
- `read-config --registry relation_types --id phase_positioned_in_milestone` — membership edge def.
- `read-config --registry lenses` — 8 lenses (no milestone lens), gap/issue priority bins.
- `read-schema --schemaName milestone|phase` — derived-status canon + required fields.
- `filter-block-items --block framework-gaps --field priority --op eq` (P0/P1) — gap detail.
- `context-validate --json` — 21 warnings, status `warnings`.
- `context-validate-relations --json` — 29 `edge_parent_not_in_bins`, status `invalid`.
