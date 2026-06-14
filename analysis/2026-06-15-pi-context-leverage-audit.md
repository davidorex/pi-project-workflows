# pi-context Leverage Audit — how fully the project dogfoods pi-context for its OWN PM

Date: 2026-06-15. Active substrate: `.context` (per `.pi-context.json` `contextDir`). Subject: how completely *this monorepo* uses pi-context's (the tool's) full capability surface to manage its own development — NOT the tool's quality. Method: op list (`pi-context --help` + `ops-registry.ts`), config registries via CLI, `context-status` block population, lens/edge views, cross-referenced against the project's own open FGAPs/FEATs and `analysis/2026-06-14-gap-task-feature-coverage-audit.md`. Read-only; substrate/config read exclusively via the CLI.

---

## 1. pi-context capability surface (what the tool offers)

**Op families** (`pi-context --help`, ~55 ops):
- *Read/query:* read-block / -page / -item / -dir, read-config, read-schema, read-samples-catalog, read-catalog-schema, resolve-item(s)-by-id, filter-block-items, find-references, join-blocks, walk-ancestors / context-walk-descendants, gather-execution-context.
- *Derivation:* context-status, context-current-state, context-bootstrap-state, context-lens-view, context-edges-for-lens.
- *Relations:* append-relation(s), remove-relation, replace-relation.
- *Block writes:* append / update / upsert / remove (top-level + `*-nested-item`), write-block, promote-item.
- *Schema & config:* write-schema, write-schema-migration, amend-config, rename-canonical-id, update, resolve-conflict, resolve-blocked, validate-block-items, context-check-status.
- *Lifecycle:* context-init / accept-all / install / list / switch / archive.
- *Workflow:* complete-task, context-roadmap-list / -load / -render / -validate, promote-item.
- *Process modes:* pi-bound (embedded bounded-tool agent).

**Vocabulary the catalog/config ships** (`read-config`): 17 block_kinds, 40 relation_types, 6 lenses, 10 invariants (`requires-edge` / `status-consistency` classes), 0 layers, 0 status_buckets registered.

**Block kinds available** (17): decisions, framework-gaps, tasks, verification, issues, features, research, rationale, spec-reviews, layer-plans, requirements, conventions, context-contracts, phase, story, work-orders, session-notes. Plus a **roadmap** surface (`roadmap.json` + `context-roadmap-*` ops; opt-in, not a config block_kind).

**Adjacent capability:** schema versioning + migration registry (17 migrations registered), 3-way `update` merge + blocked/conflict resolution loop, `gather-execution-context` (context-contract-driven bundle composition for dispatch), `promote-item` cross-substrate lineage, HTML view projector (`build-html-views.ts`), sibling extensions (pi-workflows typed execution, pi-behavior-monitors, pi-jit-agents, pi-agent-dispatch).

---

## 2. Current project usage (used vs unused — concrete, from `context-status`)

**Populated blocks:** decisions (18), framework-gaps (93), tasks (64), verification (50, all passed), features (9), research (14), conventions (11), story (14, all complete), issues (3), session-notes (8), migrations (17).

**EMPTY blocks (capability available, zero items):**
- `context-contracts` (0) — so `gather-execution-context` has nothing to drive from.
- `phase` (0) — no phase placement; `task_positioned_in_phase` unused.
- `requirements` (0) — REQ vocabulary + `requirement_depends_on_requirement` unused.
- `rationale` (0) — `rationale_supports_decision` unused; rationale lives inline in decision bodies instead.
- `spec-reviews` (0) — `review_targets_item` + the nested-findings ops unused; adversarial probe verdicts are not filed as substrate reviews.
- `layer-plans` (0), `work-orders` (0).
- `roadmap.json` absent — `context-roadmap-list` returns `[]`; no roadmap models the FEAT-001..004 arc.

**Relation_types: ~13 of 40 carry edges.** Used: verification_verifies_item, item_governed_by_convention, item_acknowledges_missing_convention, task_addresses_gap, task_addresses_feature, gap_addressed_by_feature, task_advances_story, decision_addresses_*, decision_raises_gap, decision_gated_by_item, gap_relates_to_gap, research_informs_item. **Unused/near-unused:** `feature_contains_story` + `story_contains_task` (the containment hierarchy — stories advance via `task_advances_story` only, never contained), `task_positioned_in_phase`, `requirement_depends_on_requirement`, `rationale_supports_decision`, `feature_gated_by_item` / `story_gated_by_item` (only `task_*` gating used, and even that is not honored — see FGAP-061), `session_touches_item`, `item_derived_from_item`, `decision_derived_from_item` (→ 17 open `decision-shows-derivation` warnings), `review_targets_item`, `research_supersedes_research`.

**Lenses:** 6 declared, all consumed (the coverage audit uses `gaps-by-status`; `story-advancers`/`-features` carry edges). No custom lens beyond the shipped set.

**Invariants:** 10 active and enforcing — `context-validate` currently returns **warnings** (17 `decision-shows-derivation`, 1 `task-completed-gap-closed` on TASK-064, 2 `nested_id_bearing_array` on the empty layer-plans schema). So the validation surface is live and the project reads it.

**Derivation reliance:** `context-status` is used (HTML view projector + audits). **`context-current-state` is effectively NOT relied on** — it returns `"focus": "no active focus"` and a flat P2 gap list, because gate-aware derivation is unimplemented (FGAP-061); the project routes around it with the TEMPORARY hand-maintained active-arc tracker in CLAUDE.md.

**Schema/config ops:** write-schema + migration + `update`/`resolve-*` are heavily exercised (that arc IS the dev work). `amend-config` / `rename-canonical-id` used. `promote-item` exists with a runtime-demo but no live cross-substrate promotion in `.context`. `pi-bound` shipped, not used for the project's own PM.

**Workflows/monitors for own dev:** none — pi-workflows / pi-behavior-monitors are developed here but not driving the project's own development loop (consistent with the standing "no Claude Code dynamic workflows" constraint).

---

## 3. Leverage-gap report (prioritized)

Each: (a) capability + shipped-or-planned; (b) current non-use; (c) leverage; (d) discipline-only vs needs-a-tracked-gap-landed.

### P1 — high leverage, mostly closable by discipline today

**L1 — `context-contracts` + `gather-execution-context` (SHIPPED, block empty).**
(b) 0 contracts filed; the orchestrator hand-composes subagent context via `scripts/orchestrator/compile-*-context.ts` instead. (c) The project's central activity is composing DRY substrate text VERBATIM into subagent briefs (CLAUDE.md "Intended audience" binding). `gather-execution-context` is the *native* surface for exactly this: declare a `context-contract` per unit_kind (task / decision / verification) naming the `bundle_relation_types`, and the op walks the closure table to assemble the bundle. (d) **Discipline** — file context-contracts for the recurring unit_kinds; the op already exists.

**L2 — `feature_contains_story` / `story_contains_task` containment hierarchy (SHIPPED, unused).**
(b) The 5 orphan addressing-tasks (TASK-027/022/044/047/064) carry no feature; stories advance via `task_advances_story` but are never *contained* (`feature_contains_story`/`story_contains_task` = 0 edges per the coverage audit §2). (c) Without containment, tasks/stories don't roll up under features, so "what's in this feature" and release-pinning have no structural answer — the coverage audit §2/§3 documents 5 orphan tasks + 39 gaps un-rolled-up. (d) **Discipline** — add the membership edges; vocabulary is registered.

**L3 — under-filed warranted non-invariant edges (TRACKED: FGAP-091, P-unset; TASK-041 for the decision-derivation slice).**
(b) `task_governed_by_decision`, `task_addresses_gap`, `research_informs_item`, `decision_derived_from_item` are inconsistently populated; `task_addresses_gap` has only ~6 live edges across 45 open gaps; 17 decisions trip `decision-shows-derivation`. (c) Every graph consumer (gate-aware derivation, lineage walks, "what addressed this gap") gets partial answers; the absences are invisible. (d) **Mixed** — backfilling the *existing* edges is discipline (do it now); a *forcing function* so they can't be omitted needs FGAP-091's mechanism landed (the requires-edge/text-entailment generalization) — TASK-041 is the decision-derivation instance.

### P2 — high leverage, needs a tracked capability gap landed

**L4 — release/version vocabulary (TRACKED: FGAP-011, accepted).**
(b) No `release` block kind, no version field, no `*_shipped_in_release` relation — in the substrate OR the packaged conception. Releases are tracked ad-hoc (overloaded phase/story + a DEC + CHANGELOG.md), disconnected from substrate task/gap closure. (c) The project ships lockstep npm releases and the coverage audit §3 had to hand-derive "which features can pin a next release" because nothing binds version → completed dev-items → changelog lines. This is the single biggest structural absence for a release-cadence project. (d) **Needs FGAP-011 landed** (new block kind + relation + ops, dual-surface).

**L5 — gate-aware `context-current-state` (TRACKED: FGAP-061, P2; FEAT-004).**
(b) `context-current-state` returns "no active focus" and ignores `*_gated_by_item`; the project substitutes the hand-maintained CLAUDE.md active-arc tracker (explicitly "retire when FGAP-061 lands"). (c) The derivation op — the whole point of substrate-as-PM — is not load-bearing for the project's own focus/status; a manually-maintained narrative shadows it (the exact thing DEC-0040 "substrate is single source of truth" forbids). (d) **Needs FGAP-061 landed** (and the broader FEAT-004 config-driven derivation), then the CLAUDE.md tracker retires.

**L6 — config-declared derivation registry / lifecycle metrics (TRACKED: FEAT-004 → TASK-020/021/022, FGAP-016/017/018, all planned).**
(b) State-derivation and the read-cap measurement basis are hardcoded, not config-declared. (c) Generalizes L5 across all kinds (feature/story readiness, not just tasks). (d) **Needs FEAT-004 landed** — already decomposed into planned tasks.

### P3 — moderate leverage, discipline-closable

**L7 — `spec-reviews` block + `review_targets_item` (SHIPPED, empty).**
(b) The mandatory adversarial-probe verdicts (Completion Sequence step 6) are returned as agent text and folded into commits, never filed as substrate `spec-reviews` with nested findings. (c) The project runs a fresh-context adversarial probe on *every* code change; filing those as reviews would make verification history queryable and tie findings to the items reviewed — currently that signal is lost to prose. (d) **Discipline** — block + relation + nested-item ops all shipped.

**L8 — `phase` placement + roadmap surface (SHIPPED, empty).**
(b) 0 phases; `roadmap.json` absent; `context-roadmap-*` ops unused. (c) The FEAT-001..004 unshipped arc (coverage audit §3) has no phase ordering or roadmap projection; ordering lives in the CLAUDE.md tracker prose. A roadmap would render the arc + exit criteria natively. (d) **Discipline** — author phases + a roadmap; ties to L5 once gate-aware derivation lands.

**L9 — `session-notes` + `session_touches_item` (SHIPPED, 8 items, under-edged).**
(b) 8 session notes filed but `session_touches_item` largely unused — sessions aren't edge-linked to the items they touched. (c) Cheap provenance ("which session produced this filing"); low priority. (d) **Discipline.**

**L10 — `rationale` / `requirements` blocks (SHIPPED, empty).** Rationale lives inline in decision bodies; no REQ items. Lower leverage — the inline pattern is defensible; note as available, not urgent. (d) Discipline if adopted.

---

## 4. Split: discipline-closable today vs needs-a-tracked-gap landed

**Pure usage gaps (a SHIPPED capability the project simply isn't using — closable by filing-discipline alone, no code):**
- L1 context-contracts + gather-execution-context
- L2 feature/story containment edges
- L3a backfill the existing warranted edges (the non-forcing-function half)
- L7 spec-reviews for adversarial-probe verdicts
- L8 phase placement + roadmap authoring
- L9 session_touches_item edges
- L10 rationale/requirements (optional)

**Blocked on a tracked capability gap landing (cannot be closed by discipline; the tool lacks the surface):**
- L4 release/version vocabulary → **FGAP-011** (accepted)
- L5 gate-aware focus/status derivation → **FGAP-061** (identified, P2)
- L6 config-driven derivation + metrics → **FEAT-004** / TASK-020/021/022, FGAP-016/017/018 (planned)
- L3b forcing function for warranted edges → **FGAP-091** (identified)

No untracked capability gap was found: every "the tool can't do this" item is already a filed FGAP/FEAT. The discipline-closable items are pure dogfooding-discipline gaps, not tool gaps.

---

## Verdict

The project leverages pi-context **substantially but unevenly**: it drives the read/query, block-write, relation, and schema-evolution surfaces hard (93 gaps, 64 tasks, 50 verifications, 17 migrations, live invariant enforcement, the whole `update`/`resolve-*` arc IS the dev work), but it under-uses the *organizational and derivational* surfaces — roughly **7 of 17 block kinds sit empty** and **~13 of 40 relation_types carry edges**. The top leverage gaps: (1) **release/version vocabulary** — no first-class binding of version→done-items→changelog for a lockstep-release project [FGAP-011]; (2) **gate-aware `context-current-state`** is non-load-bearing, shadowed by a hand-maintained CLAUDE.md tracker that violates substrate-as-single-source [FGAP-061/FEAT-004]; (3) **`context-contracts` + `gather-execution-context`** sit empty while the orchestrator hand-composes the very subagent bundles that op exists to assemble [SHIPPED — discipline]; (4) **feature/story containment edges + spec-reviews + phases/roadmap** are shipped-but-empty, leaving 5 orphan tasks and the unshipped FEAT-001..004 arc with no structural rollup [SHIPPED — discipline]; (5) **warranted non-invariant edges** are systematically under-filed [FGAP-091 for the forcing function; backfill is discipline]. Of the ~10 leverage gaps, **6 are shipped-but-unused (closable by filing-discipline today)** and **4 are blocked on a tracked capability gap landing** (FGAP-011, FGAP-061, FEAT-004, FGAP-091). No untracked capability gap surfaced.

Report: `analysis/2026-06-15-pi-context-leverage-audit.md`
