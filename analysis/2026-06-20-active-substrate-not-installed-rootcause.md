# Active `.context` self-reports `not-installed` — root cause: a catalog-added block kind (`milestone`) was declared in config + schema-installed but its data file (`milestone.json`) was never materialized into the live substrate

Date: 2026-06-20
Substrate: `/Users/david/Projects/workflowsPiExtension/.context`
Investigation type: Experience-Gap (CLAUDE.md "Experience-Gap Handling"). No substrate item filed; live substrate not mutated. All install/update lifecycle claims are source-cited; all state claims are actual CLI / git output.

---

## 1. Root cause

`context-bootstrap-state` reports `not-installed` because the bootstrap detector defines "installed" as *every* `config.installed_blocks` entry having its data file present on disk, and the `milestone` block kind — added to config + schema after this substrate was first installed — has a registered config entry and an installed schema but **no data file** (`.context/milestone.json`). No op materializes a newly-declared block's data file into an already-installed substrate.

### 1a. The detector (why `not-installed`)

`deriveBootstrapState` (`packages/pi-context/src/context-sdk.ts:397-413`) calls `findUnmaterializedAssets(cwd, config)` and sets `state: installed ? "ready" : "not-installed"` where `installed = missing.schemas.length === 0 && missing.blocks.length === 0`.

`findUnmaterializedAssets` (`packages/pi-context/src/context.ts:612-620`):

```ts
const blocks = (config.installed_blocks ?? []).filter((name) => !fs.existsSync(installedBlockDestPath(root, name)));
```

`installedBlockDestPath` (`context.ts:599-602`) returns `path.join(root, `${name}.json`)`. So a block is "missing" **iff `<root>/<name>.json` is absent on disk** — independent of config declaration or schema presence.

Actual output:

```
pi-context context-bootstrap-state --json
→ {"state":"not-installed","contextDir":".../.context","missing":{"schemas":[],"blocks":["milestone"]}}
```

`milestone` is the sole missing block; zero missing schemas.

### 1b. Install DOES materialize block data files — but only for blocks present at install time

`installContext` (`packages/pi-context/src/index.ts:1211`, materialization loop `1299-1357`) iterates `config.installed_blocks`, resolves the catalog source `samples/blocks/<data_path>`, and `fs.copyFileSync(sourceFile, destFile)` for a fresh block (`index.ts:1355`) or an empty-and-overwrite block (`1351`); it preserves a populated block (`1333-1336`). Materialization is correct — but it only runs over the `installed_blocks` set as it stands when install is invoked.

### 1c. `update` (catalog→substrate) does NOT materialize a newly-added block's data file

`updateContext` (`packages/pi-context/src/index.ts:1818-2151`) operates on exactly two surfaces:
- **Schemas** — resync / 3-way merge / baseline re-stamp (`index.ts:1864-2010`; writes via `writeSchemaCheckedForDir` `1980`).
- **Config registries** — additive propagation of catalog-new keyed-array entries (`relation_types` / `invariants` / `block_kinds` / `lenses`) via `mergeCatalogRegistries` (`index.ts:2118-2148`).

It contains **zero block-data-file operations** — no `copyFileSync` on a `<name>.json`, no read/write of any block data file, no touch of `installed_blocks`. A catalog-added block kind's `block_kinds` entry is merged into config, but its data file is never created.

### 1d. No op materializes a missing block file into an existing substrate

Full op-registry scan (`packages/pi-context/src/ops-registry.ts`): the only op that materializes a block data file is `context-install`. There is no `materialize-blocks` / `ensure-blocks` / `repair-blocks` / `heal-blocks` op. `append/update/upsert-block-item` and `write-block` require the block to already exist. Once installed, no registry op creates a missing block's data file.

**Confirmed hypothesis:** there is NO op that materializes a newly-catalog-declared block's data file into an already-installed substrate, so a catalog-added block kind leaves the substrate permanently `not-installed`.

### 1e. The historical event that created this exact state

Commit **038c2dc** (2026-06-16, "register milestone vocabulary in the active config; install the milestone schema; ship the catalog starter block (FGAP-037/039/041)") — file list under `.context/`:
- `.context/config.json` (block_kind + installed_blocks/installed_schemas registered)
- `.context/schemas/milestone.schema.json` (schema installed)
- object-store `.json` files
- **NOT `.context/milestone.json`** — the data file was never created.

The "ship the catalog starter block" half landed the starter in `packages/pi-context/samples/blocks/` (catalog), not in the live `.context`. `git ls-files .context/milestone.json` → empty (untracked/absent). So the substrate has been carrying a dangling milestone declaration since 2026-06-16; the milestone catalog/schema/edge-direction work itself closed via 18cca3d / 96d37ee (FGAP-037, VER-052, 2026-06-17).

---

## 2. Shape

| Element | State | Evidence |
|---|---|---|
| `block_kinds[milestone]` config entry | PRESENT | `read-config --registry block_kinds --id milestone` → `{canonical_id:"milestone", schema_path:"schemas/milestone.schema.json", array_key:"milestones", data_path:"milestone.json", ...}` |
| `installed_blocks` includes `milestone` | PRESENT (last entry) | `read-config --registry installed_blocks` → `[..., "milestone"]` |
| `.context/schemas/milestone.schema.json` | PRESENT | dir listing; `missing.schemas: []` |
| `.context/milestone.json` (data file) | **ABSENT** | dir listing (no milestone.json among 20 block files); `git ls-files` empty |
| bootstrap state | `not-installed`, `missing.blocks:["milestone"]` | `context-bootstrap-state` |

**User-facing symptom:** an otherwise fully-working live substrate (decisions, tasks, gaps, etc. all reading/writing normally) self-reports `not-installed`. The substrate is the project's single source of truth and `context-bootstrap-state` is the canonical "is this substrate usable" signal (CLAUDE.md "derive it, never cache it" → "Install state: `pi-context context-bootstrap-state`"). A stale `not-installed` makes that signal lie: any consumer (operator, CI gate, a fresh-checkout bootstrap check, an agent verifying substrate readiness) reads the substrate as un-bootstrapped. It does NOT block reads/writes to the *existing* blocks (those work), but it does mean the `milestone` block itself is unusable — `append-block-item --block milestone --autoId` would throw on a non-existent data file, so milestones cannot be filed despite the kind being declared and schema-present.

---

## 3. Reproducible conditions

### 3a. Live deterministic repro (read-only, on the live substrate)

```
pi-context context-bootstrap-state --json
→ state "not-installed", missing.blocks ["milestone"]

pi-context read-config --registry installed_blocks --json
→ [..., "milestone"]   (declared)

pi-context read-config --registry block_kinds --id milestone --json
→ data_path "milestone.json"   (the expected-but-absent file)
```

Directory listing of `.context/` shows `schemas/milestone.schema.json` present and no `milestone.json` data file.

### 3b. Constructed repro (the lifecycle, on a throwaway substrate — NOT run here to avoid the active-substrate guard hooks (FGAP-089), but fully determined by source)

On a `/tmp` substrate: `context-init` → `context-accept-all` → `context-install` materializes all then-declared block data files (`installContext` loop, `index.ts:1299-1357`) → state `ready`. Add a new block kind to the catalog `conception.json` `block_kinds[]` + `installed_blocks[]` + a `samples/schemas/<kind>.schema.json` + `samples/blocks/<kind>.json`, then `pi-context update`: `updateContext` (`index.ts:1818-2151`) merges the `block_kinds` config entry and resyncs the schema, but creates no `<kind>.json` data file → `context-bootstrap-state` now reports `not-installed` with `missing.blocks:[<kind>]`. This is the exact live state, reached deterministically through the sanctioned lifecycle.

---

## 4. Prior-art search — TRACKED (relate, do not refile)

Searched `framework-gaps` via `filter-block-items` (title regex `milestone|materializ|not-installed|unmaterialized|catalog-added`) and `resolve-items-by-id`.

| ID | Title (abbrev) | Status | Relationship to this gap |
|---|---|---|---|
| **FGAP-065** | "pi-context update merges a new block_kind config declaration but does not materialize its schema/starter — a dangling declaration until install" | **identified** (open, no edges — `find-references FGAP-065` → 0) | **EXACT root-cause coverage.** Its body: "an additively-merged new block_kind is a dangling declaration: config declares the kind, but its schema is not copied and no starter block exists, until a subsequent install." Created 2026-06-08, P3. |
| FGAP-037 | "No milestones block — add a milestone block kind (samples catalog + active .context)" | closed (18cca3d / 96d37ee, VER-052) | The catalog change that, on closure (038c2dc), produced the dangling milestone declaration. Its body explicitly says milestone "Lands in both the packaged samples catalog AND the active .context substrate" — the `.context` data-file materialization was the unfulfilled half. |
| FGAP-088 | install ceremony has no reflected CLI op | closed (TASK-059) | Adjacent (bootstrap completability); distinct — it added the `context-install` op, not block re-materialization on an installed substrate. |
| FGAP-089 | PreToolUse hooks scope on op-shape not target-substrate | identified | Why 3b's constructed repro was not run on a real `/tmp` substrate via the CLI here. Not this gap. |
| FGAP-094 | catalog `relation_types` ⊂ live config — vocabulary drift | identified | Sibling in the catalog↔substrate-currency class (see §5). Vocabulary-registry drift, not block-file materialization. |
| FGAP-095/096/097/099 | config/block schema-evolution: no load-time migration / no repair path / no expand-contract discipline / no schema_version envelope | identified | Sibling class (catalog/schema evolution has no propagation-to-existing-substrate path). Schema/migration surface, not block-data-file materialization. |

**Prior-art verdict: TRACKED.** FGAP-065 (status `identified`, P3, no addressing task, no edges) is the exact gap — the `update`-doesn't-materialize-a-new-block's-schema/starter root cause this milestone symptom triggers. Do NOT refile. The milestone case is the **first live triggering instance** of FGAP-065 and supplies (a) a concrete reproducible occurrence on the active substrate and (b) intel that FGAP-065's proposed scope under-covers: FGAP-065 frames the remedy as "materialize on update," but the live milestone state was produced by the **install-ceremony closure commit 038c2dc itself** (config + schema written without the data file), so the gap is broader than `update` — there is no materialize path for a newly-declared block on ANY post-install operation. Recommended action: refine FGAP-065 (broaden its description/`proposed_resolution` to "no op materializes a newly-declared block's data file into an already-installed substrate — neither `update` NOR the partial install-ceremony write that declared it"), add the milestone live instance as its triggering evidence, and (optionally) a `research_informs_item` / refinement edge from this analysis md.

---

## 5. Class

**General, not atomic.** This is one instance of the class **"catalog evolution (new block kind / new schema / new vocabulary) has no propagation path that brings an already-installed substrate current"** — and within that, the narrower sub-class FGAP-065 already names: a newly-declared `block_kind`'s schema + data file are not materialized into an existing substrate.

Sibling map of the class:
- **FGAP-065** — new block_kind: schema + starter data file not materialized into existing substrate (THIS gap's direct class).
- **FGAP-094** — new `relation_types` (vocabulary registry) not back-ported catalog→config; no parity forcing-function.
- **FGAP-095** — config-schema evolution: no load-time migration path.
- **FGAP-096** — invalid config: no repair path (validate-before-mutate).
- **FGAP-097** — no additive/expand-contract discipline for config-schema changes.
- **FGAP-099** — block data carries no `schema_version`: read-time validation + migration inert.

These all share the architectural root: **the catalog (packaged conception + samples schemas/blocks) evolves, but the only path that materializes catalog content into a substrate is the initial `context-install`; subsequent catalog growth (a new block kind, a new relation_type, a schema bump) has no sanctioned op that brings a pre-existing substrate fully current.** `update` partially closes it for schemas + config-registries but explicitly omits block-data-file materialization (§1c).

**File-at-level verdict:** do NOT file a new milestone-specific FGAP. The block-data-file-materialization slice is already owned by FGAP-065 (refine it with this live instance + the broadened "any post-install op, not just update" scope). The broader "no catalog→existing-substrate currency path" class is collectively held by FGAP-065/094/095/096/097/099; if the user wants that class named as a single umbrella, that is a decision-level (DEC) framing over the existing six gaps, not a seventh sibling FGAP.

---

## 6. History

- **2026-06-06** — FGAP-037 filed: "add a milestone block kind … Lands in both the packaged samples catalog AND the active .context substrate." FGAP-065 filed 2026-06-08 (the update-materialization gap), independently of milestone.
- **2026-06-16, commit 038c2dc** — "register milestone vocabulary in the active config; install the milestone schema; ship the catalog starter block (FGAP-037/039/041)." Touched `.context/config.json` + `.context/schemas/milestone.schema.json` + object store; **did not create `.context/milestone.json`.** This is the moment the live substrate went `not-installed`. The "starter block" shipped to `samples/blocks/` (catalog), never materialized into `.context`.
- **2026-06-17, commits 18cca3d / 96d37ee** — milestone block kind + schema + derived reached-rollup + invariant shipped; FGAP-037 closed (VER-052); a direction-correction (`phase_positioned_in_milestone` edge + milestone `data_path`). The catalog/schema work was completed and verified; the active-`.context` data-file gap was not part of that closure's verification.
- **2026-06-20 (today)** — a session queried `git ls-files .context/milestone.json` (empty) and `git show 18cca3d:packages/pi-context/samples/blocks/milestone.json`, indicating the milestone-materialization question was already being probed before this investigation.
- The **dropped "make milestones part of the canonical sample" follow-up**: `search_messages` for milestone/canonical-sample follow-up returned no conversational thread; the trace is in git (038c2dc shipped the catalog starter but left the live `.context` data file unmaterialized) rather than in a recorded message. The follow-up that was dropped is precisely the active-substrate `milestone.json` materialization — the FGAP-037 body promised it ("Lands in … the active .context substrate") but the closure commit delivered only config + schema.

---

## Appendix — exact source citations

| Claim | File:line |
|---|---|
| `not-installed` = any installed_block data file absent | `packages/pi-context/src/context-sdk.ts:397-413` (`deriveBootstrapState`); `packages/pi-context/src/context.ts:612-620` (`findUnmaterializedAssets`); `context.ts:599-602` (`installedBlockDestPath`) |
| install materializes block data files (install-time set only) | `packages/pi-context/src/index.ts:1211` (`installContext`), loop `1299-1357`, copy `1355`/`1351`, preserve `1333-1336` |
| `update` touches schemas + config-registries only, no block data file | `packages/pi-context/src/index.ts:1818-2151`; registry merge `2118-2148` (`mergeCatalogRegistries`) |
| only `context-install` materializes block files; no repair/heal op | `packages/pi-context/src/ops-registry.ts` (full scan) |
| live state | `context-bootstrap-state` / `read-config installed_blocks` / `read-config block_kinds --id milestone` actual output (§2/§3) |
| historical event | commit 038c2dc (file list `.context/config.json` + `schemas/milestone.schema.json` + objects, NO `milestone.json`); `git ls-files .context/milestone.json` empty |
