# POC: Degree-zero config + closure-table relations + lens rendering

**Date:** 2026-05-03
**Scope:** worktree-only proof of concept. No edits to `packages/*/src/`, no edits to `.project/`.
**Status:** v2 — runnable. Closes seven of nine evaluation gaps in-POC; two remain package-bound.

## v2 closures over v1

| Gap | Closure mechanism in v2 |
|---|---|
| #14 referential integrity | `validateRelations()` joins authored edges to a cross-block id index, emits typed issue codes |
| #16 bins enum drift | Same validator enforces lens-edge `parent ∈ lens.bins` |
| #17 hierarchy field semantics | `hierarchy[]` entries declare `parent_block` / `child_block` / `relation_type`; validator distinguishes hierarchy-edges from lens-edges by relation_type |
| #18 auto-derived edge materialization | `edgesForLens()` and `synthesizeFromField()` provide one query surface for both authored and synthetic edges; `walkDescendants` works uniformly across both |
| #21 edge schema disambiguation | Final decision: schema permissive on `parent`; SDK validation enforces (cross-doc constraint, not intra-doc shape) |
| #22 render_uncategorized policy | `lens.render_uncategorized` field on lens spec; renderer respects (`by-package` runs with `false`, `context-management` with `true`) |
| #23 naming alias threading | `displayName(canonicalId, naming)` consumed by renderer; output now shows aliased "Issue Tracker" rather than canonical "issues" |

## Remaining package-bound gaps (cannot meaningfully close in POC)

| Gap | Why package-bound |
|---|---|
| #15 curation surface (full ceremony) | A `/project lens-curate <lensId>` slash command needs registration in pi-project's command surface. POC closes the *shape* via `listUncategorized()` + `suggestionTemplate()` (emits the would-be edge-append payload); the ceremony itself is integration work. |
| #20 AJV cache integration | Pure integration into `packages/pi-project/src/schema-validator.ts`. POC's standalone AJV is correct for POC scope; nothing demonstrable at POC layer. |

## What this POC proves

1. **Degree-zero config** — `config.json` is a typed, schema-validated block describing the substrate (root directory, naming aliases, partitions, declared hierarchy edges, lens definitions). Self-bootstrapping: the config that configures the substrate is itself a block under the same write-time guarantee model.
2. **Closure-table relations as substrate primitive** — `relations.json` carries `(parent, child, relation_type)` triples. Multiple parallel hierarchies (organizational, lens, dependency) coexist as different `relation_type` values over the same items. Reassignment is a single field-write at the block-api layer.
3. **Lens projection deterministic, no LLM in the loop** — `groupByLens()` in `render.ts` projects items into bins from either an auto-derived field on the item or hand-curated edges. Same signature handles both modes.
4. **Two lenses, one render pipeline** —
   - `by-package` (auto-derived from `issue.package` field)
   - `context-management` (hand-curated edges in `relations.json`, ten sub-concern bins from `analysis/2026-05-03-context-management-issue-cluster.md`)
5. **Consumer-shape preservation** — function signatures (`loadConfig`, `groupByLens`, `walkDescendants`, `renderClusterView`) are the shapes envisioned for the eventual pi-project SDK surface. A downstream consumer (agent template, `/project view <lens>` command, human-rendered markdown) re-points at the real SDK with no consumer-shape change.

## How to run

```bash
# Primary profile: real .project/ data, two lenses (by-package + context-management)
npx tsx analysis/poc-degree-zero-lens/render.ts        # → output/primary/

# Alt profile: synthetic substrate at non-default root, two different lenses (by-priority + by-status)
npx tsx analysis/poc-degree-zero-lens/render.ts alt    # → output/alt/
```

Reads `config[-<suffix>].json` + `relations[-<suffix>].json` (validates against POC schemas via AJV). Reads `<config.root>/issues.json` and `<config.root>/framework-gaps.json` (read-only). Writes per-profile markdown under `output/<profile>/`. Filters resolved items.

## Two-profile demonstration (closes GitHub issue #3 surface empirically)

| Aspect | Primary profile | Alt profile |
|---|---|---|
| `root` | `.project` | `analysis/poc-degree-zero-lens/alt-substrate` |
| Substrate | real, 67 issues + 6 gaps | synthetic, 5 issues + 0 gaps |
| Naming aliases | `issues → Issue Tracker`, `framework-gaps → Framework Gaps` | `issues → Bug Tracker`, `framework-gaps → Capability Gaps` |
| Lens 1 | `by-package` (auto, hides uncategorized) | `by-priority` (auto, hides uncategorized) |
| Lens 2 | `context-management` (hand-curated, shows uncategorized) | `by-status` (auto, shows uncategorized) |
| Authored edges | 28 (including hierarchy `gap-membership`) | 0 |
| Renderer | identical | identical |

The alt profile demonstrates that substrate location is fully relocatable — issue #3's request ("i don't want the files in .project") becomes a single field change in `config.json`, and every downstream consumer (renderer, validator, traversal) honors it through the canonical `root` field. No code change. Same renderer code emits "Bug Tracker" vs "Issue Tracker" purely from configured naming aliases.

## File layout

```
analysis/poc-degree-zero-lens/
  README.md                   # this file
  config.json                 # primary profile: degree-zero config pointing root → .project
  config-alt.json             # alt profile: degree-zero config pointing root → alt-substrate/
  relations.json              # primary closure-table edges (28 hand-curated)
  relations-alt.json          # alt closure-table edges (empty; alt uses auto-derived lenses)
  alt-substrate/
    issues.json               # synthetic 5-issue dataset for the alt profile
    framework-gaps.json       # empty
  schemas/
    config.schema.json        # validates either config[-alt].json
    relations.schema.json     # validates either relations[-alt].json
  render.ts                   # tsx-runnable; profile selected via argv[2]
  output/
    primary/
      by-package.md           # primary auto-derived lens
      context-management.md   # primary hand-curated lens
    alt/
      by-priority.md          # alt auto-derived lens (priority field)
      by-status.md             # alt auto-derived lens (status field)
```

## What this POC does NOT touch

- No edits to `packages/pi-project/src/` (or any other package)
- No edits to `.project/*.json` or `.project/schemas/*`
- No new monorepo package, no `dist/` output, no version bumps, no skills regen
- No changes to existing imports/exports of any package
- POC reads `.project/issues.json` and `.project/framework-gaps.json` directly via `fs.readFileSync` rather than dynamically importing pi-project's `readBlock` — keeps POC stand-alone with zero coupling to internal package APIs

## Format note

POC uses `config.json` rather than `config.yaml` because `js-yaml` is not in `devDependencies` and adding it would constitute state change beyond POC scope. The principle ("typed schema-validated config block") is identical regardless of serialization format. A production form could choose YAML for human-editing ergonomics; POC chose JSON to keep dep surface at zero new packages.

## What this POC does NOT prove (and would require subsequent work)

- Hierarchical *write* semantics with cycle detection (POC reads only)
- `validateProject` cross-block walking through configured hierarchy
- Macro-render of clusters via per-item macro registry (per-item-macros restructure is the canonical path; POC uses inline markdown emission)
- `seedExamples()` migration story for users with existing `.project/`
- Bootstrap ordering when config is absent vs. present-but-invalid
- Materialized-view caching strategy (FGAP-003 details)
- Auto-derivation from arbitrary field paths (POC handles top-level scalar field; nested paths and array-membership pending)

## Mapping to existing planning surface

- Closes [GitHub issue #3](https://github.com/davidorex/pi-project-workflows/issues/3) (folder placement config) at the surface level — `root` field demonstrates the configurable-root mechanism.
- Sets up closure for **FGAP-001** (hierarchical/nested block storage) — declared hierarchy edges + closure-table edges show the substrate shape.
- Sets up closure for **FGAP-002** (per-scope finding registries) — partitions are scopes; lens bins are sub-scope registries.
- Sets up closure for **FGAP-003** (materialized views over scoped blocks) — `groupByLens()` is the projection primitive.
- Sets up closure for **FGAP-006** (schema versioning) — `schema_version` field on the config block is the meta-layer entry point.
- Aligns with `analysis/2026-05-03-context-management-issue-cluster.md` (same bins, same membership, regenerable).
- Aligns with `analysis/2026-05-03-package-issue-clusters.md` (auto-derived `by-package` lens reproduces the per-package partitioning).
- Aligns with debt-survey item 7 (canonical `.project/` path builders) — the `root` field is the single resolution point that the eventual canonical builder consumes.

## Output stats (current run)

- 67 issues + 6 framework-gaps read from `.project/`
- 28 hand-curated edges across 2 relation_types
- `validateRelations`: status=clean, 0 issues
- `by-package.md`: 5 bins, every issue placed; uncategorized bucket suppressed (`render_uncategorized: false`)
- `context-management.md`: 10 bins, 25 issues placed, 31 in `(uncategorized)`; bucket rendered (`render_uncategorized: true`)
- `walkDescendants('pi-jit-agents', 'package-membership')` over unified edges → 3 issue ids
- `walkDescendants('FGAP-001', 'gap-membership')` → `[issue-055]` from authored hierarchy edges
- Validation demo on synthetic bad edges catches: typo bin, unresolved child id, unknown relation_type, hierarchy edge with parent in wrong block

## Validation demo

`render.ts` includes `runValidationDemo()` that constructs four synthetic bad edges and verifies the validator catches each:

```text
Status: invalid (expected: invalid)
  - edge_parent_not_in_bins:    typo-bin → issue-008 : context-mgmt-concern
  - edge_unresolved_child:      context-projection → issue-9999 : context-mgmt-concern
  - edge_unknown_relation_type: FGAP-001 → issue-055 : unknown-relation
  - edge_parent_wrong_block:    issue-001 → issue-002 : gap-membership (expected parent in framework-gaps)
```
