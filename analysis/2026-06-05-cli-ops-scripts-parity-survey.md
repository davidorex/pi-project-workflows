# CLI / Ops / Scripts parity survey

**Date**: 2026-06-05
**Scope**: read-only survey of the three surfaces over pi-context's `block-api` / `context-sdk` library — the in-pi **ops** (`OpDefinition[]`), the **CLI** (`pi-context-cli`, runtime reflection of the ops), the **orchestrator scripts** (`scripts/orchestrator/*.ts`).
**Constraint frame**: in-pi op behavior is FROZEN. The CLI must reach script-capability parity with ZERO change to any op's `run()`/parameters/shared-registry behavior — only CLI-layer additions (pre-call derivation, post-call shaping) or a CLI-only shared helper.

All claims are `file:line`-grounded against the built tree (`packages/*/dist/` present; reflection + library behavior probed live against the active `.context` substrate). Two known FGAPs (FGAP-019, FGAP-020) reproduced empirically; new gaps enumerated.

---

## A. Surface inventory

### A.1 Orchestrator scripts (exhaustive)

`ls scripts/orchestrator/*.ts` → 53 files (24 op-twin parity targets + 16 composer + 12 runtime-demo + 1 launch-support). They fall into four roles; only the **op-twin** role is parity-relevant (a script wrapping a single op/library-fn 1:1). The other three roles (composer / demo / launch-support) have NO op twin by design and are NOT parity targets — enumerated below for completeness, then excluded.

**Non-twin scripts (excluded from parity, enumerated — no silent cap):**

- **Composers (multi-step, hand-ergonomic compositions; no 1:1 op):** `build-html-views`, `compile-explore-context`, `compile-implementation-context`, `compile-preamble-context`, `compile-task-context`, `inject-context-items`, `composite-command-allowlist`, `composite-git-log`, `composite-grep-paths`, `composite-read-files`, `extract-decs`, `extract-feedback`, `extract-mandates`, `extract-markdown-section`, `extract-task-progress`, `extract-test-import-chains`.
- **Runtime demos (DEC-0018 demonstration harnesses, not wrappers):** `runtime-demo-content-addressing`, `runtime-demo-context-registry`, `runtime-demo-context-switch`, `runtime-demo-dir-targeted-write`, `runtime-demo-identity-stamping`, `runtime-demo-nested-id-guard`, `runtime-demo-promote-item`, `runtime-demo-resolve-ref`, `runtime-demo-structured-endpoints`, `runtime-demo-substrate-index`, `runtime-demo-whole-block-delegators`, `runtime-demo-write-ordering`.
- **Launch-support:** `read-config-operations` (projects `config.tool_operations[]` canonical_ids for `launch-constrained-pi.sh`; degrades exit-4 on config-absent — `read-config-operations.ts:60-72`). No op twin; library is `loadContext`. Could be an op but is not one today.

**Op-twin scripts (parity-relevant) — what each DERIVES or ergonomically ADDS beyond raw param pass-through:**

| script | op / library fn wrapped | flags parsed | derives / ergonomically adds | exit codes | output shape |
|---|---|---|---|---|---|
| `file-block-item.ts` | `appendToBlock` (op twin: `append-block-item`) | `--block --item --show-schema --auto-id --dry-run --writer --cwd` | **array_key derivation** via `resolveBlockItemSchema` (`file-block-item.ts:102`, key at `:107`); **`--show-schema`** contract preview (`:113-142`); **whole-file `--dry-run`** validation matching write-path AJV (`:240-270`); **AJV error translation** `formatAjvError` (`:184-205`); **auto-stamp `created_at`** (`:226-230`) + **`created_by`** (`:234-238`); **`--writer kind:id` shorthand** parse (`:144-161`) | `2` arg / `3` schema-absent / `4` auto-id / `5` validation | prose append line; `--dry-run` echoes item JSON |
| `upsert-block-item.ts` | `upsertItemInBlock` (op twin: `upsert-block-item`) | `--block --item --id-field --show-schema --dry-run --writer --cwd` | same family as file-block-item: array_key derivation (`resolveBlockItemSchema`), `--show-schema`, `--dry-run`, AJV translation, writer-shorthand | `2`/`3`/`5` | prose upsert line |
| `read-schema.ts` | `readSchema` (op twin: `read-schema`) | `--name --path/--field --raw --cwd` | **terse projection** `renderTerse` (`:81-139`) default; **`--raw`** full dump (`:185-187`); **`--path` returns the FULL addressed subtree** via `JSON.stringify(addr.value)` (`:181`) | `1` not-init / `2` arg / `3` fn | terse markdown / raw JSON / addressed subtree JSON |
| `read-config.ts` | `loadConfig` (op twin: `read-config`) | `--raw --registry --id --cwd` | **terse vocabulary projection** `renderTerse` (`:71-141`) default; `--raw` full dump; `--registry`/`--id` via shared `addressInto` (`:172,178`) returning full subtree | `1`/`2`/`3` | terse markdown / raw JSON / addressed JSON |
| `write-schema.ts` | `writeSchemaChecked` (op twin: `write-schema`) | `--operation --name --schema --writer --dry-run --cwd --format` | `--writer kind:id` shorthand; `--format json\|table`; `--dry-run` (matches op) | `2`/`3`/… | json/table verb line |
| `amend-config.ts` | `amendConfigEntry` (op twin: `amend-config`) | `--registry --operation --key --entry --writer --dry-run --cwd --format` | `--writer` shorthand; `--format json\|table`; `--dry-run` (matches op) | `2`/`3` | json/table verb line |
| `append-relation.ts` | `appendRelationByRef` (op twin: `append-relation`) | `--parent --child --relation-type --ordinal --writer --dry-run --cwd --format` | `--writer` shorthand; `--format json\|table`; kebab `--relation-type` → `relation_type` | `2`/`3` | json/table |
| `append-relations.ts` | `appendRelationsByRef` (op twin: `append-relations`) | `--edges --writer --dry-run --cwd --format` | inline-or-`@file` edges; `--writer`; `--format` | `2`/`3` | json/table count |
| `remove-relation.ts` | `removeRelationByRef` (op twin: `remove-relation`) | `--parent --child --relation-type --writer --dry-run --cwd --format` | `--writer`; `--format` | `2`/`3` | json/table |
| `replace-relation.ts` | `replaceRelationByRef` (op twin: `replace-relation`) | `--old-* --parent --child --relation-type --ordinal --writer --dry-run --cwd --format` | `--writer`; `--format` | `2`/`3` | json/table |
| `read-block-page.ts` | `readBlockPage` (op twin: `read-block-page`) | `--block --offset --limit --format` | **`--format table`** markdown render `renderTable` (`:75-99`); offset/limit validation | `2`/`3` | json / md table + footer |
| `read-block-item.ts` | `readBlockItem` (op twin: `read-block-item`) | `--block --id --format` | `--format table` single-item render | `2`/`3` | json / md table |
| `filter-block-items.ts` | `filterBlockItems` (op twin: `filter-block-items`) | `--block --field --op --value --format` | `--format table`; `--op in` CSV→array (`:74-80`) | `2`/`3` | json / md table |
| `resolve-items-by-id.ts` | `resolveItemsByIds` (op twin: `resolve-items-by-id`) | `--ids --format` | CSV `--ids`; `--format table` location render | `2`/`3` | json map / md table |
| `find-references.ts` | `findReferencesInRepo` (op twin: `find-references`) | `--item-id --direction --format` | `--format table` edge render | `2`/`3` | json Edge[] / table |
| `walk-ancestors.ts` | `walkAncestorsByLens` (op twin: `walk-ancestors`) | `--item-id --relation-type --format` | **`--format chain`** id-chain render | `2`/`3` | json string[] / chain |
| `join-blocks.ts` | `joinBlocks` (op twin: `join-blocks`) | `--left-block --right-block … --where --format` | `--where field:op:value` shorthand; `--format table` pair render | `2`/`3` | json / table |
| `gather-execution-context.ts` | `gatherExecutionContext` (op twin: `gather-execution-context`) | `--unit-id --kind --max-depth --format` | **`--format summary`** bundle render | `2`/`3` | json / summary |
| `current-state.ts` | `currentState` (op twin: `context-current-state`, NAME MISMATCH) | `--cwd --format` | `--format table` state render `renderTable` (`:54-`) | `3` | json / table |
| `bootstrap-state.ts` | `deriveBootstrapState` (op twin: `context-bootstrap-state`, NAME MISMATCH) | `--cwd --format` | `--format table` status render | `3` | json / table |
| `accept-all.ts` | `adoptConception` (op twin: `context-accept-all`, NAME MISMATCH) | `--cwd --format` | `--format table`; exit `4`/`5` granular | `2`/`4`/`5` | json / table |
| `migrate-canonical-id.ts` | `renameCanonicalId` (op twin: `rename-canonical-id`, NAME MISMATCH) | `--kind --old-id --new-id --dry-run --cwd --format` | `--format table` (DEFAULT table) report render; `--dry-run` (matches op) | `2`/`3` | table (default) / json |
| `read-samples-catalog.ts` | `samplesCatalog` (op twin: `read-samples-catalog`) | `--kind --format` | `--format table` catalog render `renderTable` (`:56-`) | `3` | json / table |
| `promote-item.ts` | `promoteItem` (op twin: `promote-item`) | (selectors) `--writer …` | `--writer` shorthand; exit codes | `2`/`3` | json result |

> Note on naming: five op-twin scripts carry a name that differs from their op (`file-block-item`↔`append-block-item`; `current-state`↔`context-current-state`; `bootstrap-state`↔`context-bootstrap-state`; `accept-all`↔`context-accept-all`; `migrate-canonical-id`↔`rename-canonical-id`). This is load-bearing for §F (the parity gate keys siblings by exact op-name).

### A.2 `surface:"use"` ops (exhaustive)

All ops live in `packages/pi-context/src/ops-registry.ts`. The registry holds 49 OpDefinitions; one (`list-tools`, `:949` `surface:"process"`) is CLI-excluded by the partition (`cli.ts:44`), leaving 48 `surface:"use"` ops. OpResult shape ∈ `string` (prose) | `{json}` | `{read}` (`:118`). `authGated` ops listed.

| op | required params | optional | run() does | OpResult | authGated |
|---|---|---|---|---|---|
| append-block-item | block, **arrayKey**, item | autoId | parse-if-string item; auto-id; `appendToBlock` | prose | – |
| update-block-item | block, **arrayKey**, match, updates | – | `updateItemInBlock` by predicate | prose | – |
| append-relation | parent, child, relation_type | ordinal, dryRun | `appendRelationByRef` | prose | – |
| remove-relation | parent, child, relation_type | dryRun | `removeRelationByRef` | prose | – |
| replace-relation | old_*, parent, child, relation_type | ordinal, dryRun | `replaceRelationByRef` | prose | – |
| append-relations | edges | dryRun | `appendRelationsByRef` | prose | – |
| upsert-block-item | block, **arrayKey**, item | idField, dryRun | `upsertItemInBlock` | prose | – |
| promote-item | source, destinationSubstrate, writer | newRefname, dryRun | `promoteItem` | `{read}` | – |
| append-block-nested-item | block, **arrayKey**, match, nestedKey, item | – | `appendToNestedArray` | prose | – |
| update-block-nested-item | block, **arrayKey**, match, nestedKey, nestedMatch, updates | – | `updateNestedArrayItem` | prose | – |
| remove-block-item | block, **arrayKey**, match | – | `removeFromBlock` | prose | – |
| remove-block-nested-item | block, **arrayKey**, match, nestedKey, nestedMatch | – | `removeFromNestedArray` | prose | – |
| read-block-dir | subdir | – | `readBlockDir` → `structureForRead` | `{read}` | – |
| read-block | block | – | `readBlock` → `structureForRead` | `{read}` | – |
| write-block | block, data | – | `writeBlock` | prose | **yes** |
| context-status | – | – | `contextState` | `{json}` | – |
| context-validate | – | – | `validateContext` | `{json}` | – |
| read-config | – | registry, id | `loadConfig` + `addressInto` → `structureForRead` | `{read}`/prose | – |
| read-samples-catalog | – | kind | `samplesCatalog` → `structureForRead` | `{read}` | – |
| context-current-state | – | – | `currentState` | `{json}` | – |
| context-bootstrap-state | – | – | `deriveBootstrapState` | `{json}` | – |
| rename-canonical-id | kind, oldId, newId | dryRun | `renameCanonicalId` | `{json}` | **yes** |
| amend-config | registry, operation, key | entry, dryRun | `amendConfigEntry` | prose | **yes** |
| read-schema | schemaName | path | `readSchema` + `addressInto` → `structureForRead` | `{read}`/prose | – |
| write-schema | operation, schemaName | schema, dryRun | `writeSchemaChecked` | prose | **yes** |
| write-schema-migration | operation, schemaName, fromVersion, toVersion, writer | kind, transform | `writeSchemaMigrationExecute` | prose | **yes** |
| context-init | contextDir | – | `initProject` | `{json}` | **yes** |
| context-accept-all | – | – | `adoptConception` | `{json}` | **yes** |
| context-switch | target_dir | create_new, to_previous, writer | switch helpers | `{json}`/prose | **yes** |
| context-list | – | – | `listSubstrates` | `{json}` | – |
| context-archive | target_dir | – | `archiveSubstrate` | `{json}`/prose | **yes** |
| filter-block-items | block, field, op | value | `filterBlockItems` → `structureForRead` | `{read}` | – |
| resolve-item-by-id | id | – | `resolveItemById` → `structureForRead` | `{read}` | – |
| read-block-item | block, id | – | `readBlockItem` → `structureForRead` | `{read}` | – |
| read-block-page | block | offset, limit | `readBlockPage` → `structureForRead` | `{read}` | – |
| join-blocks | leftBlock, rightBlock | relationType, leftField, rightField, leftEndpoint, where* | `joinBlocks` → `structureForRead` | `{read}` | – |
| resolve-items-by-id | ids | – | `resolveItemsByIds` → `structureForRead` | `{read}` | – |
| complete-task | taskId, verificationId | – | `completeTask` | prose | – |
| context-validate-relations | – | – | `validateContextRelations` | `{json}` | – |
| context-edges-for-lens | lensId | – | `edgesForLensByName` → `structureForRead` | `{read}` | – |
| context-walk-descendants | parentId, relationType | – | `walkLensDescendants` | `{json}` | – |
| walk-ancestors | itemId, relationType | – | `walkAncestorsByLens` → `structureForRead` | `{read}` | – |
| find-references | itemId | direction | `findReferencesInRepo` → `structureForRead` | `{read}` | – |
| gather-execution-context | unitId, kind | maxDepth | `gatherExecutionContext` → `structureForRead` | `{read}` | – |
| context-roadmap-load | roadmapId | – | `loadRoadmap` → `structureForRead` | `{read}` | – |
| context-roadmap-render | roadmapId | – | `renderRoadmap` | prose/`{json}` | – |
| context-roadmap-validate | – | roadmapId | `validateRoadmaps` | `{json}` | – |
| context-roadmap-list | – | – | `listRoadmaps` | `{json}` | – |

(`list-tools` excluded — `surface:"process"`, CLI-partitioned out at `cli.ts:44`.)

### A.3 CLI mechanics

**What it reflects** (`packages/pi-context-cli/src/cli.ts`): `useOps = ops.filter(o=>o.surface==="use")` (`:44`). Per-op flags derived from each op's typebox `parameters` (`fieldType` `:104-120`): scalar → `--field value`, boolean → presence flag, object/array/unknown → JSON arg (`--field '<json>'` or `--field @file`). Required flags from `schema.required` minus `writer` (`:278-282`). String-enum unions coerce as verbatim strings (`stringEnumValues` `:68-87`, DEFECT-1 fix).

**What it adds (CLI-only):**
- `{ ok, op, output }` JSON envelope (`:504`) with `boundedJsonOutput` 50KB cap (`:503`); default text surface via `renderOpResultText` (`:508`).
- Globals `--cwd / --json / --yes / --writer / --help` (`:199-222`).
- Schema-driven writer auto-injection from resolved git/USER identity (`injectWriter` `:293-303`); `buildCliDispatchContext` attestation (`:321-330`); `assertWriterIdentity` (`:346-359`).
- authGated handling: `--yes/--force` / TTY prompt / non-interactive refusal (`authDecision` `:370-379`).
- Number/enum coercion + `@file` JSON loading (`:249-268`).

**What the CLI structurally CANNOT do that a script can** (the parity deficit, root-localized):
1. **No pre-call input derivation.** The CLI passes parsed flags 1:1 to `op.run`. It has no seam that derives a value (e.g. `arrayKey` from config) before invocation. Every op-`required` flag is mandatory (`:277-282`). → FGAP-019.
2. **No op-output reshaping for reads.** The CLI emits exactly what `op.run` returns (`renderOpResultText` / `boundedJsonOutput`). A read op routes addressed values through `structureForRead`, which PAGES the single top-level array of any object node — the CLI faithfully relays the paged projection. → FGAP-020.
3. **No human-render mode.** No `--format table|chain|summary|csv`, no terse `renderTerse`, no `--raw` toggle. The script-only render helpers (`renderTable`/`renderTerse`/`renderRoadmap`-style) have no CLI counterpart.
4. **No `--show-schema` contract preview** and **no AJV error translation** (`formatAjvError`).
5. **No `created_at`/`created_by` auto-stamp** beyond what the op's DispatchContext stamps.

---

## B. Capability matrix

Rows = each distinct capability a script provides beyond raw pass-through. Columns = script provides? / op provides? / CLI exposes?.

| capability | script provides | op provides | CLI exposes |
|---|---|---|---|
| array_key derivation from schema | YES `file-block-item.ts:102,107` (`resolveBlockItemSchema`); `upsert-block-item.ts:24` | NO — `arrayKey` is a `required` param (`ops-registry.ts:248,290,550,653,…`) | NO — required flag enforced `cli.ts:277-282` |
| addressed read returns FULL subtree of an object node | YES `read-schema.ts:181` (`JSON.stringify(addr.value)`) | NO — `structureForRead` pages the node's single array (`read-element.ts:266-285,202-227`), op at `ops-registry.ts:1166` | NO — relays the op's paged `data` (`cli.ts:503-504`) |
| terse vocabulary/schema projection (default human view) | YES `read-config.ts:71-141`, `read-schema.ts:81-139` | NO — op returns `{read}` structured JSON | NO |
| `--raw` full-dump toggle | YES `read-config.ts:190`, `read-schema.ts:185` | partial — op default IS whole-or-addressed | partial — `--json` emits structured value, no `--raw` semantics |
| `--format table\|chain\|summary\|csv` human render | YES (15+ scripts; `renderTable`/`renderTerse`/chain/summary) | NO | NO |
| `--show-schema` contract preview | YES `file-block-item.ts:113-142`; `upsert-block-item.ts` | NO (closest: `read-schema` op) | NO (could call read-schema, but not a one-shot preview) |
| whole-file `--dry-run` pre-validation for block append | YES `file-block-item.ts:240-270` | NO — `append-block-item`/`upsert` op has no dryRun for append (upsert op HAS dryRun `ops-registry.ts:553`; append op does NOT) | NO |
| AJV error translation (`formatAjvError`) | YES `file-block-item.ts:184-205` | NO — op surfaces raw AJV throw | NO |
| auto-stamp `created_at` / `created_by` | YES `file-block-item.ts:226-238` | partial — DispatchContext stamps declared author fields (`buildDispatchContextFromExecute`) but not `created_at` value-fill | partial — same DispatchContext path `cli.ts:321` |
| `--writer kind:id` shorthand | YES `file-block-item.ts:144-161` etc. | NO — op `writer` is a `{kind,user}` object param | partial — `--writer <json>` only (`cli.ts:213-221`); no `kind:id` shorthand |
| `--op in` CSV→array coercion | YES `filter-block-items.ts:74-80` | NO — op `value` is `Unknown` (caller passes JSON array) | partial — `--value '["a","b"]'` JSON only |
| `--where field:op:value` shorthand | YES `join-blocks.ts` | NO — op takes `whereField/whereOp/whereValue` separately | partial — three separate flags |
| granular exit codes (1/2/3/4/5) | YES (per-script) | N/A (in-process) | partial — CLI uses 0/1/2 only (`cli.ts:450,461,466,510,518`) |

---

## C. Parity-gap list

A gap = the CLI is below script-capability. Root locus named per gap.

**GAP-1 (FGAP-019) — array_key required though derivable.** *CLASS, 7 ops.*
Script: derives `arrayKey` from the block schema via `resolveBlockItemSchema` (`file-block-item.ts:102`), so callers pass only `--block`. Op: declares `arrayKey` as a `required` param across **7 block-mutation ops** — `append-block-item` (`:248`), `update-block-item` (`:290`), `upsert-block-item` (`:550`), `append-block-nested-item` (`:653`), `update-block-nested-item` (`:694`), `remove-block-item` (`:750`), `remove-block-nested-item` (`:773`). CLI: enforces it required (`cli.ts:277-282`). Confirmed live: `append-block-item --help` lists `--arrayKey (required)`.
Root locus: **CLI required-flag derivation absent** — the op's `required` includes `arrayKey`; the CLI has no pre-call seam to fill it.

**GAP-2 (FGAP-020) — read-schema --path projects an object node to its array name-list.**
Script: `read-schema.ts:181` returns `JSON.stringify(addr.value)` — the FULL addressed subtree. Op: `read-schema` (`ops-registry.ts:1166`) wraps `addr.value` in `structureForRead`, which (`read-element.ts:266-285`) calls `resolveCollection` → discovers the node's single top-level array and PAGES it, projecting the whole object node down to just that array's slice.
**Reproduced live** at `properties.decisions.items` (an object whose only array property is `required`): op `--json` `output.data` = `["id","title","status","context","decision","consequences","created_by","created_at"]` (the `required` name-list, `total:8`); script = the full object `{type, additionalProperties, required, properties:{…}}`.
Root locus: **op-output shape** — `structureForRead`'s collection-paging fires on an incidental array field of an addressed object node. read-config `--registry` does NOT exhibit this (probed: registries are top-level arrays/maps, legitimately paged or unaffected) — the defect is **read-schema-specific** because only it addresses arbitrary nested object nodes.

**GAP-3 (NEW) — no human-render mode (`--format`/terse/`--raw`).**
Script: 15+ op-twins provide `--format table|chain|summary|csv` plus `renderTerse` default + `--raw` for config/schema. Op: returns structured JSON only. CLI: `--json` envelope or `renderOpResultText` (the op's own text) — no human-render layer.
Root locus: **CLI lacks a post-call render layer.**

**GAP-4 (NEW) — no `--show-schema` contract preview.**
Script: `file-block-item.ts:113-142` prints array_key + required + field types + id-pattern before a write. CLI: no equivalent one-shot preview.
Root locus: **CLI-only ergonomic absent.**

**GAP-5 (NEW) — no AJV error translation.**
Script: `formatAjvError` (`file-block-item.ts:184-205`) turns raw AJV `instancePath`/`schemaPath` into field-named guidance. CLI: surfaces the raw thrown `.message` (`cli.ts:512`).
Root locus: **CLI error-shaping absent.**

**GAP-6 (NEW) — no append-time whole-file `--dry-run` for `append-block-item`.**
Script: `file-block-item.ts:240-270` builds the prospective whole file and validates it (dry-run PASS == write PASS). Op `append-block-item` has NO `dryRun` param (`upsert-block-item` op DOES, `:553`; the asymmetry is real). CLI therefore cannot offer append dry-run.
Root locus: **op param set** (append op lacks dryRun) — see §D for the constraint verdict.

**GAP-7 (NEW) — no `--writer kind:id` / `--where field:op:value` / `--op in` CSV shorthands.**
Script: ergonomic shorthands (`file-block-item.ts:144`, `join-blocks.ts`, `filter-block-items.ts:74`). CLI: full-JSON / separate-flag forms only.
Root locus: **CLI input-coercion absent.**

**GAP-8 (NEW) — coarse exit codes.**
Scripts: 1/2/3/4/5 granularity. CLI: 0/1/2 only (`cli.ts`). Diagnostic granularity below the scripts.
Root locus: **CLI exit-code mapping.**

---

## D. Parity-restoration categorization (the core deliverable)

For EACH gap in §C, the single category under the frozen-ops constraint, plus the concrete CLI-side mechanism (file + insertion seam).

**GAP-1 (FGAP-019) → `CLI-pre-call`.**
The CLI derives `arrayKey` from config/schema before invoking the unchanged op (which still declares it required). Mechanism: in `cli.ts`, after `parseOpArgs` and before `op.run` (around `:469-471`), add a CLI-only pre-call derivation: for ops whose schema declares an `arrayKey` property AND a `block` property, if `--arrayKey` was not passed, resolve it via `resolveBlockItemSchema(loadBlockSchema(cwd, block))` (the exact path `file-block-item.ts:89-107` uses) and inject into `parsed.params.arrayKey`. To make `--arrayKey` OPTIONAL at the parse boundary (so the missing-required check at `:277-282` does not reject it first), the derivation must run BEFORE that check OR the CLI must treat `arrayKey` like `writer` (the existing exemption at `:278` is the precedent: `required.filter(r => r !== "writer")`). Extend that filter to also exempt a CLI-derivable param set `{ writer, arrayKey }`, then fill `arrayKey` in an `injectArrayKey(op, params, cwd)` helper mirroring `injectWriter` (`:293-303`). Op behavior unchanged — it still receives `arrayKey` and still requires it; the CLI just supplies it. **Seam: `cli.ts` `parseOpArgs` required-filter (`:278`) + a new `injectArrayKey` helper called alongside `injectWriter` (`:470`).** This reverses FGAP-019's earlier "change the op" resolution: the derivation moves CLI-side.

**GAP-2 (FGAP-020) → `CLI-post-call`.**
The CLI reshapes the op's read output for the addressed-node case, mirroring `read-schema.ts:181` (full subtree). But the op returns `{read: ReadStructured}` whose `data` is ALREADY the paged projection — the full subtree is lost inside the op before the CLI sees it. So a pure post-call reshape on the op's `data` cannot recover it. The CLI-side fix is to NOT rely on the op for the addressed case: when the invoked op is `read-schema` (or any read op) AND a `--path`/`--registry` address was passed, the CLI re-reads via the library and re-addresses WITHOUT `structureForRead`'s collection paging — i.e. a **`CLI-only-shared-helper`** that calls `readSchema(cwd, name)` + `addressInto(schema, {path})` + `structureForRead(addr.value, { whole: true, … })`. The `whole:true` flag (`read-element.ts:147,268`) FORCES whole-object serialization and skips collection discovery — so the addressed object node serializes intact, exactly the subtree the script returns, while STILL applying the 50KB cap. **This is genuinely `CLI-post-call` in effect but `CLI-only-shared-helper` in mechanism**: the cleanest seam is a CLI helper that re-runs the addressed read with `whole:true`. Categorize as **`CLI-only-shared-helper`** (a helper the CLI uses that in-pi dispatch never touches), since reshaping the op's already-projected `data` post-call is insufficient. **Seam: a `cli.ts` `addressedReadOverride(op, params, cwd)` that, for read ops carrying a path/registry/id address, performs the read+address+`structureForRead({whole:true})` itself and returns that envelope instead of calling `op.run`.** Op behavior frozen.
*Caveat surfaced for the user:* this means the CLI diverges from the in-pi op on addressed reads — the in-pi agent still gets the paged name-list. If the desired end-state is that BOTH surfaces return the full subtree, that requires an op change (passing `whole:true` in the op at `:1166`) and lands in REQUIRES-OP-CHANGE. Under the frozen constraint, only the CLI surface is corrected.

**GAP-3 (human-render `--format`/terse/`--raw`) → `CLI-only-shared-helper`.**
A CLI render layer the in-pi op never touches. Mechanism: a `--format` global flag (parsed in `parseOpArgs` alongside `--json`, `:199`) selecting `text|json|table`; a CLI render module that, given the op name + the op's structured output, dispatches to a per-op or per-shape renderer (the script `renderTable`/`renderTerse` bodies are the reference implementations — they can be lifted into a CLI-shared `render/` module without touching ops). **Seam: new `--format` flag in `parseOpArgs`; new `cli.ts` render dispatch before `:504/:508`.** Op frozen.

**GAP-4 (`--show-schema`) → `CLI-only-shared-helper`.**
A CLI pre-action that prints the contract and exits, before any `op.run`. Mechanism: a `--show-schema` global recognized in `parseOpArgs`; when present on a block-mutation op, call the same `loadBlockSchema`/`resolveBlockItemSchema` path (lifted into a CLI-shared helper) and print the §A.1 preview, return 0. **Seam: `parseOpArgs` flag + early branch in `main` mirroring the `parsed.help` branch (`:464-467`).** Op frozen.

**GAP-5 (AJV error translation) → `CLI-post-call`** (post-call on the error path).
Mechanism: wrap the `catch` at `cli.ts:511-518` so that when `err` is an AJV ValidationError (has `.errors[]`), the CLI runs `formatAjvError` (lifted from `file-block-item.ts:184-205` into a CLI-shared helper) over each `.errors[]` entry, using the op's `parameters`/block schema for field context. **Seam: `cli.ts` catch block (`:511`).** Op throws unchanged; the CLI shapes the message.

**GAP-6 (append `--dry-run`) → `REQUIRES-OP-CHANGE (CONSTRAINT CONFLICT)`.** ⚠️
The script's append dry-run validates the **prospective whole block** built from on-disk existing items + the new item (`file-block-item.ts:247-255`). The CLI could replicate this CLIENT-side WITHOUT the op (read block, build prospective, `validateFromFile`) — and THAT path IS `CLI-only-shared-helper`. **But** if the goal is parity *through the op* (a `--dry-run` flag on the `append-block-item` op surface), the op has no `dryRun` param and adding one changes op behavior. **Resolution under the frozen constraint:** the CLI replicates the whole-file validation itself as a `CLI-only-shared-helper` (read + build prospective + `validateFromFile`, never calling `appendToBlock`) — so GAP-6 is in fact closable CLI-side and is **NOT** a true conflict. It is flagged here only to be explicit: the conflict exists ONLY if "parity" is read as "the op gains a dryRun param." Recommended: `CLI-only-shared-helper` (client-side prospective-validate), no op change. **Seam: a `cli.ts` pre-call branch for `append-block-item --dry-run` that runs the lifted `file-block-item.ts:247-255` validation and returns without invoking the op.**

**GAP-7 (input shorthands) → `CLI-pre-call`.**
The CLI normalizes shorthand input into the op's declared param shape before invocation. Mechanism: in `parseOpArgs`, accept `--writer kind:id` (parse to `{kind,user}` via the lifted `parseWriter`, `file-block-item.ts:144-161`), `--where field:op:value` (split into `whereField/whereOp/whereValue`), `--op in` CSV (split to array for `value`). Each is a pre-call transform of an already-supported op param. **Seam: `parseOpArgs` per-flag handling (`:227-268`).** Op frozen.

**GAP-8 (exit codes) → `CLI-only-shared-helper`.**
A CLI exit-code mapping the op never sees. Mechanism: map error classes (arg/usage → 2, not-initialized/BootstrapNotFoundError → 1, schema-absent → 3, validation → 5) in `main`'s catch + the `UsageError` branch (`:456-462,511-518`). **Seam: `cli.ts` catch/return sites.** Op frozen.

---

## E. Categorical verdict

**Can the CLI reach FULL script-capability parity with ZERO in-pi op changes? — YES, with ONE explicit caveat the user must decide on.**

Every gap in §C is closable CLI-side under the frozen-ops constraint:
- GAP-1, GAP-7 → `CLI-pre-call` (derive/normalize input before the unchanged op).
- GAP-2, GAP-3, GAP-4, GAP-6, GAP-8 → `CLI-only-shared-helper` (a helper in-pi dispatch never touches).
- GAP-5 → `CLI-post-call` (error reshape).

**No gap lands in `REQUIRES-OP-CHANGE`** when "parity" means "the CLI exposes the script's capability." GAP-6 is the only one that *touches* the conflict boundary, and only under a stricter reading ("the op itself gains a dryRun param"); under the operative reading it is `CLI-only-shared-helper` and needs no op change.

**The residual / caveat (GAP-2, must be surfaced):** closing FGAP-020 CLI-side corrects ONLY the CLI surface. The in-pi op continues to return the paged name-list for addressed object-node reads (`structureForRead` paging at `read-element.ts:266-285`). If the desired end-state is that the **in-pi op** also returns the full subtree, that requires passing `whole:true` at `ops-registry.ts:1166` — an op change that conflicts with constraint #1. **The user must decide** whether FGAP-020's intended fix is "CLI returns the subtree" (closable now, CLI-side) or "both surfaces return the subtree" (needs the op change). The earlier FGAP-019/020 "change the op" resolutions are re-derivable CLI-side for the CLI surface; the in-pi behavioral correction for FGAP-020 is the one residual that cannot move CLI-side.

---

## F. Regression mechanism

A behavioral parity gate that catches this whole class at commit, composed with the existing static gate.

**What `scripts/parity-check.ts` does today (static, no behavioral diff):**
- Enumerates library writers from source (AST), classifies each into the FGAP-009 coverage classes (`classifyAll` `:555`).
- ctx-forwarding fatal guard (`checkCtxForwarding` `:592`).
- `{json}`-content-cap guard (`checkJsonContentCap` `:798`).
- **Dual-surface optional-param parity** (`checkDualSurfaceParity` `:738`) — compares op schema vs `scripts/orchestrator/<op.name>.ts` for `{dryRun, ordinal, idField}` (`DUAL_SURFACE_OPTIONAL_PARAMS` `:79`).

**The blind spot that lets FGAP-019/020 + GAP-3..8 escape the gate:**
`checkDualSurfaceParity` keys the sibling by **exact op-name** (`join(scriptsDir, `${run.opName}.ts`)` `:748`). Confirmed: **29 of 48 use-ops have NO same-named script**, including the entire block-mutation family (`append-block-item`↔`file-block-item.ts`, plus `update-/remove-/nested-` ops with no twin at all) and the five name-mismatched twins (`context-current-state`↔`current-state.ts`, etc.). So the parity gate **never compares** the exact ops where FGAP-019 lives, and it checks only 3 optional params — never `arrayKey` (a REQUIRED param), never output shape, never render parity.

**What the behavioral gate needs beyond the static checks:**
1. **A script↔op name map** (explicit, since names diverge): a table pairing each op-twin script to its op (the §A.1 "NAME MISMATCH" rows). Without it, the sibling lookup is structurally incomplete.
2. **Fixtures + an execution harness.** For each op with a script twin: a tiny fixture substrate (schemas + a few block items + config), then RUN both surfaces on identical input and diff:
   - **required-but-derivable check:** assert no op-twin's `required` param is one the script DERIVES (array_key) — i.e. cross-reference each op's `schema.required` against the script's derivation calls (`resolveBlockItemSchema`/`discoverArrayKey`). A required param the script derives is a FGAP-019-class gap → FAIL.
   - **output-shape diff:** run op `--json` and the script's machine output (`--format json`) on the same read/address and assert the structured payloads match (modulo render). The `read-schema --path properties.X.items` case is the canonical fixture — it FAILs today (op → name-list, script → subtree), catching FGAP-020.
3. **Render-parity assertion (looser):** assert the CLI exposes a `--format`/render path for every op whose twin script offers one (catches GAP-3 as a presence check, not a byte-diff).

**How it composes with the existing gates:** add a new behavioral phase to `parity-check.ts`'s `main` (`:831`) AFTER the static classification/ctx/json-cap checks pass — same exit-1-on-violation aggregation (`:878-882`). The static checks stay as the fast pre-filter (they need no fixtures); the behavioral phase runs the fixture diffs only when statics pass. The script↔op name map also repairs `checkDualSurfaceParity`'s coverage (feed it the map instead of name-equality at `:748`), so the existing dual-surface check starts covering the 29 currently-invisible ops for free.

---

## Appendix — empirical probes (this survey)

- **FGAP-020 reproduced**: `addressInto(decisions-schema, {path:"properties.decisions.items"})` → op `structureForRead.data = ["id",…]` (8-element `required` name-list); script `JSON.stringify(addr.value)` = full object subtree. CLI `--json` envelope confirmed relaying the name-list (`output.data:["id",…],"total":8`).
- **FGAP-019 reproduced**: `append-block-item --help` lists `--arrayKey (required)`; CLASS confirmed across 7 ops by schema scan.
- **read-config NOT affected**: `--registry status_buckets|relation_types|block_kinds` — op `structured.data === raw addressed value` (no mis-paging); naming registry absent in this substrate.
- **dryRun lockstep**: no op with a same-named script diverges on `--dry-run` (the static gate holds where it can see; the gap is the 29 unseen ops).
- **name-mapping scan**: 29 use-ops with no same-named script; 5 op-twin scripts with mismatched names.
