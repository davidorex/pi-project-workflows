# Substrate arc — unifying frame

**Date:** 2026-05-03
**Status:** Planning substrate. Authoritative for subagent planning and implementation in this worktree until superseded.
**Source basis:** POC v2 (`analysis/poc-degree-zero-lens/`), POC v1+v2 evaluations, integration-map review for jit-agents `compileAgent` path, catalog reframing pass.

---

## 1. The unifying frame

> The architectural arc has a clearer shape. What was a loose collection of FGAPs + issues + planning docs now has a unifying frame: **substrate = config + partitions + lenses + closure-table relations + per-item macros. Six discrete blocks, one coherent contract.** Each open item locates inside that frame as either a closure, a reframing, or unaffected.

The frame is the basis for planning. Every open item in `.project/issues.json` and `.project/framework-gaps.json` should be located against it before being scheduled.

---

## 2. The contract — discrete blocks

The substrate is a single coherent contract composed of named blocks. Each block has a schema, a write surface (block-api), a read surface (project-sdk), and a rendering surface (macros). The blocks compose as follows:

| Block | Role | POC artifact (where proved) |
|---|---|---|
| **config** | Degree-zero substrate config: `root` (relocatable substrate path), `naming` (alias map), `partitions`, `hierarchy` declarations, `lenses` definitions, `schema_version`. Self-bootstrapping: the config that configures the substrate is itself a typed schema-validated block. | `analysis/poc-degree-zero-lens/config.json` + `config-alt.json` (two profiles), `schemas/config.schema.json` |
| **partitions** | Top-level organizational divisions over the substrate. Each partition declares which canonical block ids may live in it. POC degenerate one-partition case validates the shape; multi-partition runtime semantics deferred to production. | Field on config block; not yet runtime-consumed in POC |
| **lenses** | Named projections over a target block, with `relation_type`, `bins`, optional `derived_from_field` (auto-derivation) and `render_uncategorized` policy. Lens views are computed-block injections at agent dispatch time. | `analysis/poc-degree-zero-lens/output/primary/{by-package,context-management}.md` and `output/alt/{by-priority,by-status}.md` |
| **closure-table relations** | Generic edge primitive: `(parent, child, relation_type)` triples in a single block. Multiple parallel hierarchies coexist as different `relation_type` values. Hierarchy edges (parent ∈ canonical ids) and lens edges (parent ∈ lens.bins) share one schema, distinguished by validator at the SDK boundary. Reassignment is a single field-write at block-api. | `analysis/poc-degree-zero-lens/relations.json` (28 authored), `schemas/relations.schema.json`, `validateRelations()` in `render.ts` |
| **per-item macros** | Rendering layer: each schema lands with its per-item macro as a single unit of work. Renderer registry owned by pi-jit-agents per DEC-0003. `render_cluster` composes per-item macros over lens-view groupings. | Not in POC v2 (POC uses inline placeholder format); design canonical at `analysis/2026-05-02-per-item-macros-atomic-plans.md` and `analysis/2026-04-15-blocks-as-prompt-substrate.md` |

The user's framing names this as "six discrete blocks." Five are enumerated above against POC evidence; the sixth block-of-the-contract is preserved as wording per mandate-002 and pending user identification — candidates from the conversation are: schemas-as-substrate, hierarchies-as-distinct-block, or macros split into registry + emitter. Implementation must resolve which sixth block is authoritative before landing.

---

## 3. POC artifacts (what is mechanically proved)

All artifacts live under `analysis/poc-degree-zero-lens/`. Read-only consumption from existing `.project/` and synthetic alt-substrate. Zero edits to `packages/*/src/` or `.project/`. Run via `npx tsx analysis/poc-degree-zero-lens/render.ts [profile]`.

| Mechanism | Demonstrated by |
|---|---|
| Degree-zero config self-validation | AJV compiles `config.schema.json`, validates `config.json` cleanly |
| `config.root` relocation (closes GitHub issue #3) | Two-profile demo: `config.root=".project"` reads 67 real issues; `config-alt.json` `root="analysis/poc-degree-zero-lens/alt-substrate"` reads 5 synthetic issues — same renderer, different on-disk substrate |
| Closure-table edges | 28 authored edges across 2 relation_types (lens edges + hierarchy edges) |
| Auto-derived lens (`by-package`, `by-priority`, `by-status`) | `synthesizeFromField()` synthesizes edges from item fields at query time |
| Hand-curated lens (`context-management`) | Edges authored in relations.json, 10 sub-concern bins matching `analysis/2026-05-03-context-management-issue-cluster.md` |
| Unified edges accessor | `edgesForLens()` returns synthetic OR authored edges through one signature; `walkDescendants` consumes both uniformly (3 ids over synthetic, 1 id over authored) |
| Cross-doc validation | `validateRelations()` catches: typo bin (`edge_parent_not_in_bins`), unresolved child (`edge_unresolved_child`), unknown relation_type (`edge_unknown_relation_type`), wrong-block hierarchy edge (`edge_parent_wrong_block`) |
| Naming alias threading | `displayName()` consumed by renderer; output reads "Issue Tracker" / "Bug Tracker" instead of canonical `issues` |
| `render_uncategorized` policy | Per-lens field; primary's `by-package` runs false (clean view), `context-management` runs true (curation-ready view) |
| Curation surface shape (#15 partial) | `listUncategorized()` + `suggestionTemplate()` emit would-be edge-append payloads without persisting |
| Token economy | `context-management.md` ≈ 8.6KB vs raw issues ≈ 62KB — empirical 86% reduction for agents needing the organized view only |

---

## 4. Open-item map

Every open entry in `.project/issues.json` and `.project/framework-gaps.json` locates as one of three:

### 4.1 Closures (resolved when production lands the substrate)

| Item | Closure mechanism |
|---|---|
| GitHub [#3](https://github.com/davidorex/pi-project-workflows/issues/3) | `config.root` field, demonstrated empirically |
| issue-020 | `_lens:<id>` IS the computed-block injection at dispatch time |
| issue-029 | `renderClusterView` IS the artifact-rendering primitive |
| issue-041 | A lens with predicate IS a scoped/filtered contextBlocks read |
| issue-045 | Lens views inherit framework-level anti-injection wrapping |
| FGAP-002 | `partitions` + lens `bins` ARE per-scope finding registries |
| FGAP-003 | `groupByLens` output IS the materialized view |
| FGAP-006 | `config.schema_version` IS the meta-anchor for schema versioning |
| issue-056, 057, 060 | Mirrors of FGAP-002/003/006; close with parents |

### 4.2 Reframings (resolution path changes; original shape no longer canonical)

| Item | New framing |
|---|---|
| FGAP-001 | Closure-table relations as alternative to subpath block names. Decision pending: closure-table only, subpath only, or both. POC argues closure-table covers most originally-cited motivations; subpath remains relevant for genuine work-decomposition with atomic-per-item writes. |
| issue-042 | Lens views drop pressure 86%; explicit budgeting still needed but urgency reduced |
| issue-046 | Closure-table is a generic edge primitive that could subsume DAG edge typing if `relation_type` extends to DAG semantics. Convergence is now an option |
| issue-061 | Lens substrate provides surface for staleness; staleness engine itself remains separate work |
| issue-008, 030 | Writeback now has new target shape (closure-table edges); decision authoring becomes "write item + write edges that locate it in lenses" |
| FGAP-004, issue-058 | Authorship attestation gains a new artifact target (the config block itself) |
| issue-055 | Mirror of FGAP-001; same reframing |

### 4.3 Unaffected (still real, still need their own work)

| Cluster | Items |
|---|---|
| Bug fixes | issue-049, issue-050, issue-066 |
| Monitor primitives | issue-023, 030, 035, 038, 039, 040, 051, 053, 054 |
| Execution metadata / writeback / dispatch | issue-009, 010, 011, 028, 032, 036, 037, 047 |
| Provider/model policy | issue-052, 062, 063, 064, GitHub [#1](https://github.com/davidorex/pi-project-workflows/issues/1) |
| Path/discovery | issue-048, 067 |
| Schema/validation orthogonal to lens | FGAP-005, issue-021, 022, 033, 034, 043, 044 |
| Misc | issue-002, 003, 004, 005, 006, 007, 016, 017, 031 |

---

## 5. New gaps surfaced by this arc (mandate-007)

These did not exist before the substrate work. Each must be located in `framework-gaps.json` (substrate-shape concerns) or `issues.json` (implementation-level concerns) when the catalog is updated.

| # | Source | Item | Status |
|---|---|---|---|
| 14 | POC v1 eval | Referential integrity for edges | Closed in POC v2 via `validateRelations` |
| 15 | POC v1 eval | Lens curation ceremony | Shape closed in POC v2; full ceremony package-bound |
| 16 | POC v1 eval | Bins enum drift | Closed in POC v2 |
| 17 | POC v1 eval | Hierarchy field semantics | Closed in POC v2 (constraint declaration) |
| 18 | POC v1 eval | Auto-derived edge materialization strategy | Closed in POC v2 (query-time synthetic edges) |
| 19 | POC v1 eval | Format choice (YAML vs JSON) | Closed (JSON, parallels other blocks) |
| 20 | POC v1 eval | AJV cache integration | Package-bound |
| 21 | POC v1 eval | Edge schema disambiguation | Closed in POC v2 (schema permissive, SDK validates) |
| 22 | POC v1 eval | `render_uncategorized` policy | Closed in POC v2 |
| 23 | POC v1 eval | Naming alias unused in renderer | Closed in POC v2 |
| 24 | Integration map | Config discovery anchor | Open — needs decision before code lands |
| 25 | Integration map | Cross-package cache placement | Open — design decision |
| 26 | Integration map | Synthetic edge cardinality bound | Open — lazy-per-lens vs eager-all |
| 27 | Integration map | Cycle composition (walk + recursive render) | Open |
| 28 | Integration map | Cycle detection in `validateRelations` | Open — extend POC validator |
| 29 | Integration map | Bare-string `_lens:` vs typed contextBlocks | Open — conflicts with per-item-macros plan #3 |
| 30 | Integration map | Lens-view filter parameterization channel | Open |
| 31 | Integration map | seedExamples migration for new config + schemas | Open — already-seeded projects don't get new files |
| 32 | Integration map | block-api registration of `config` as typed block | Open — implicit via dynamic schema discovery, unverified |
| 33 | Integration map | `partitions` field runtime semantics | Open — commit or drop |

---

## 6. Package-bound vs POC-absorbable distinction

POC v2 absorbed 7 of 9 evaluation gaps without touching `packages/*/src/`. Two are inherently package-bound:

| Gap | Why package-bound |
|---|---|
| #15 (full curation ceremony) | Needs `/project lens-curate <lensId>` slash command registered in pi-project's command surface |
| #20 (AJV cache) | Pure integration into `packages/pi-project/src/schema-validator.ts` |

All integration-map gaps (#24–#33) require package edits to advance. They are *design decisions* rather than POC-demonstrable mechanisms. Each must resolve before code lands.

---

## 7. Cross-references

### POC artifacts
- `analysis/poc-degree-zero-lens/README.md` — POC v2 documentation, two-profile demo
- `analysis/poc-degree-zero-lens/config.json` + `config-alt.json` — two configs, two profiles
- `analysis/poc-degree-zero-lens/relations.json` + `relations-alt.json`
- `analysis/poc-degree-zero-lens/schemas/{config,relations}.schema.json`
- `analysis/poc-degree-zero-lens/render.ts` — SDK-shape signatures: `loadConfig`, `loadRelations`, `groupByLens`, `walkDescendants`, `validateRelations`, `edgesForLens`, `synthesizeFromField`, `renderClusterView`, `displayName`, `listUncategorized`
- `analysis/poc-degree-zero-lens/output/{primary,alt}/*.md` — generated lens views

### Existing analysis docs that compose with this frame
- `analysis/2026-05-03-context-management-issue-cluster.md` — reproduced mechanically by primary profile's `context-management.md` lens render
- `analysis/2026-05-03-package-issue-clusters.md` — reproduced mechanically by primary profile's `by-package.md` lens render
- `analysis/2026-05-02-per-item-macros-atomic-plans.md` — per-item macros restructure (waves 1–8); complementary to substrate arc, not superseded
- `analysis/2026-05-02-per-item-macros-duplication-analysis.md` — macros library deduplication
- `analysis/2026-05-02-residual-debt-survey.md` — debt-survey item 7 (canonical `.project/` path builders) is a precondition for #14 SDK validator integration
- `analysis/2026-05-01-blocks-schemas-macros-contract-synthesis.md` — blocks/schemas/macros = one contract framing; this arc realizes it
- `analysis/2026-05-01-substrate-arc-distillation.md` — Tier-A FGAPs F-019..F-025 (reification format); intersecting concern
- `analysis/2026-05-01-github-issues-migration-inventory.md` — migration premise weakens because lens substrate provides in-substrate organization
- `analysis/2026-05-01-ceremony-ideas.md` — `/project new`, `/project new-phase`, `/project edit-item`, `/project archive-item` — sibling ceremony surface; lens-curate joins this set
- `analysis/2026-04-28-context-paths-extension-design.md` — separate concern (claude-side context paths) but shares three-tier loader DNA
- `analysis/2026-04-15-blocks-as-prompt-substrate.md` — blocks ARE the prompt substrate; this arc operationalizes that thesis
- `analysis/2026-04-15-runtime-step-context.md` — seventeen agent roles, per-agent context needs; minimal-context principle aligns with lens views

### Active project blocks
- `.project/issues.json` — 67 entries, ~60 open; canonical issue catalog
- `.project/framework-gaps.json` — FGAP-001..006; substrate-shape concerns
- `.project/decisions.json` — DEC-0001/0002/0003 govern the consumer migration arc
- `.project/spec-reviews.json` — REVIEW-001 blocked on `render_decision` per per-item-macros plan
- `.project/features.json` — FEAT-001 consumer migration arc
- `.project/layer-plans.json` — PLAN-001 7-phase Muni restructure
- `.project/research.json` — R-0001..R-0011 substrate

### External issues
- GitHub [#3](https://github.com/davidorex/pi-project-workflows/issues/3) — folder placement; closed by `config.root`
- GitHub [#1](https://github.com/davidorex/pi-project-workflows/issues/1) — parseModelSpec defaults; unaffected by this arc

---

## 8. Subagent usage notes

### What this doc is
Authoritative planning substrate for the substrate arc on this worktree. Synthesizes POC v2 mechanics + integration-map analysis + catalog reframing into a single navigable frame. Should be read before any planning, scoping, or implementation work that touches: contextBlocks, lens-view rendering, closure-table relations, the config block, partitions, per-item macros, or the resolution of any open item enumerated in §4.

### What this doc is not
- Not authorization to implement. Implementation requires explicit user authorization for any package-source edit.
- Not a final spec. The sixth block of the contract is unresolved (§2). Decisions on #24–#33 are unresolved (§5). FGAP-001 fork is unresolved (§4.2).
- Not a plan. A plan would order work, assign waves, gate on credentialed smoke. This doc is upstream of any such plan.

### Read-order for fresh subagent
1. This doc (the frame)
2. `analysis/poc-degree-zero-lens/README.md` (the proven artifact)
3. `analysis/2026-05-02-per-item-macros-atomic-plans.md` (the complementary arc)
4. The relevant `.project/` blocks (issues.json or framework-gaps.json) for the specific item being planned
5. The integration-map review section in conversation history if doing jit-agents `compileAgent` planning

### Authoritative facts vs. open decisions
- §2 column "POC artifact" — authoritative (mechanically proved)
- §3 — authoritative (mechanically proved, runnable)
- §4.1 closures — authoritative *as targets*; closure happens when production lands
- §4.2 reframings — authoritative direction, original framings should not be planned against
- §4.3 unaffected — authoritative; these items proceed on their own paths
- §5 gaps marked "Closed in POC v2" — authoritative (mechanically proved)
- §5 gaps marked "Open" — explicit decisions pending; do not plan past them without resolution
- The user's framing in §1 is verbatim and authoritative; the sixth block of the contract is wording-preserved per mandate-002 and remains pending user identification

### Discipline
- Every planning increment must locate against §4. New items not enumerated here go into `.project/` blocks or back into a follow-on analysis doc; do not let work float free of the catalog.
- Every implementation increment must close one §5-Open decision before code lands; mandate-007 forbids deferring discovered debt.
- The two-profile POC is the empirical baseline for any "before/after" comparison.
