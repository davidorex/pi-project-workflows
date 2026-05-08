# Config as vocabulary substrate — display-name decoupling architecture

Source: this analysis document persists a conversation-turn response from 2026-05-05. Question posed: "to what extent can we have a config that articulates layer and display names a priori, shipped as a single file a user / llm edits, upon which init / new then renders blocks, and which names/ids/whatever get populated / used downstream, and whereby a display name change doesn't break anything related to block layer or relationships or atomic block content downstream".

Captured factually for reference. No commit step proposed by this document; referencing strategy to be sorted separately.

---

**Extent achievable**: high for display-name mutability; moderate for prefix mutability; structural for adding-new-block-kinds.

**What the config would carry (extension of current `ConfigBlock`)**:

```
layers: [{ id: "L1", display_name: "...", description: "..." }, ...]
block_kinds: [{
  canonical_id: "decisions-block",     // opaque, never user-facing
  display_name: "Design Decisions",    // mutable, never load-bearing
  prefix: "DEC-",                      // opaque token (semi-mutable; see below)
  schema_path: "decisions.schema.json",
  array_key: "decisions",              // opaque (could standardize to "items")
  layer: "L4",                         // FK to layers[].id
  lifecycle: { states: [...], transitions: [...] }  // optional
}, ...]
status_buckets: { open: "todo", enacted: "complete", ... }  // closes FGAP-013
display_strings: { roadmap_lens_missing: "Lens missing", ... }  // validation-code labels
naming: { ... }  // existing block-name aliases (preserved)
```

**Code changes required (one-time substrate work)**:

1. **`ID_PREFIX_TO_BLOCK` derived from `config.block_kinds`** instead of hardcoded — closes issue-089 class structurally; new block kind = config edit, not TS edit.
2. **`STATUS_VOCABULARY` derived from `config.status_buckets`** — FGAP-013 enacted.
3. **Validation codes stay opaque slugs**; surface (`/project roadmap-validate`, tool output) consults `config.display_strings` for labels.
4. **`displayName(cfg, canonical)`** universal lookup — every render path uses it (block name, layer name, status, validation message). Already exists for block names; extend to other identity classes.
5. **`/project init`** writes skeleton config with empty layers + block_kinds.
6. **`/project new <opinionated-template>`** populates layers + block_kinds from a packaged opinionated set (the "Muni five-layer + standard block kinds" preset). Doesn't exist today; ceremony-ideas referenced it.
7. **`/project install` consults `config.block_kinds[].schema_path` + `array_key`** instead of literal filenames — no schema renames touch consumer code.

**Display-rename consequence under this design**:

| Change                                                                          | Breaks                                                         |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `config.naming["decisions-block"]` "Design Decisions" → "Architectural Records" | nothing                                                        |
| `config.block_kinds[].layer: "L4"` → `"L3"`                                     | downstream lens-by-layer projections (semantics, not identity) |
| `config.display_strings["roadmap_lens_missing"]` text edit                      | nothing                                                        |
| `config.status_buckets[]` add/edit/remove a mapping                             | rollup outputs (semantics, not identity)                       |
| Layer rename (`"Strategy"` → `"Direction"`)                                     | nothing                                                        |

**Prefix-rename remains expensive** even under this design, because prefixes appear as substrings in every `relations.json` edge (`parent`/`child`), every cross-reference body, every workflow expression that references an id. Prefix is data, not just metadata. Two ways to handle:

- **Treat prefix as opaque-but-immutable-after-first-write.** New block-kind chooses prefix once; never renamed. Display name ("Design Decisions" vs "Architectural Records") is the freely-mutable surface. This is the pragmatic stance and matches how DEC- has been treated.
- **Add rename machinery** (search-replace across all `.project/*.json` + relations.json + analysis MDs, gated by a `/project rename-prefix <old> <new>` ceremony with full atomic rollback). Doable but high-cost-per-invocation; only worth it if rename is genuinely common.

**What this resolves structurally**:
- issue-089 (`PLAN-` collision): adding the new `plan` block becomes a config-edit that immediately surfaces the prefix conflict at registration time, not at fixture-write time. Resolution = pick a different prefix or merge with `layer-plans`.
- ROADMAP-/PHASE-/MILESTONE- silent gaps: same — config-driven block_kinds means undeclared prefixes can't exist.
- ADR-vs-FGAP terminology pending decision: display-only edit, no code/data change. The cost analysis that deferred the rename evaporates.
- FGAP-013 (status vocabulary registry): closed by `config.status_buckets`.
- Future block-kind addition (e.g., the curation-ceremony block, the monitor-spec block from heuristic-widening): config-edit ceremony, no TS PR.

**What this does NOT resolve**:
- Schema evolution / versioning / migration (FGAP-006 territory). Config-driven block_kinds doesn't address what happens when a schema's required fields change.
- Nested-array traversal blind spot in `buildIdIndex` (separate audit finding).
- Authorship attestation (FGAP-004 territory).

**Achievability summary**: the config-as-source-of-substrate-vocabulary architecture is achievable as an incremental extension of the existing config + SDK. It does NOT require redesigning blocks, schemas, or relations.json. The biggest single-PR scope is migrating `ID_PREFIX_TO_BLOCK` from TS literal to config-derived (touches `project-sdk.ts`, every test that asserts a specific prefix mapping, and the `installProject` flow). After that landing, every subsequent block-kind addition is a config edit and a schema file copy — no more prefix-collision class of failure possible.

maybe we incorporate a raw engineering vocabulary and give each a display name that can be changed. llm and programmatic understandable, configurable for human. ship a skill and script tools to rename based on human prefs.
