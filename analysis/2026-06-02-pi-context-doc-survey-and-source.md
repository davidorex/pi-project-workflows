# pi-context — Documentation Survey + Current Source-of-Truth

Empirical-grounding pass over the pi-context package as it currently IS (2026-06-02). Every claim below cites the file it was read from. PART A inventories the existing reader-facing docs and rates their staleness against current code. PART B states the current source-of-truth content, organized for extraction into a README (overview + quickstart) and the skill narrative (full reference).

Anchor reads: `packages/pi-context/package.json` (exports + version 0.27.0), `src/index.ts` (tool/command registration), `src/block-api.ts` (identity stamping + content projection), `src/content-hash.ts`, `src/object-store.ts`, `src/context-registry.ts`, `src/context-sdk.ts` (`resolveRef`, `buildIdIndex`, `validateContext`), `schemas/relations.schema.json`, `schemas/config.schema.json`, plus the live `.context` substrate + `.pi-context-registry.json`.

---

## PART A — Existing-Doc Inventory + Staleness/Gap Assessment

### A.0 What I confirmed about the CURRENT model first (so staleness is measured against truth, not assumption)

- **Three-layer identity is real and wired.** `src/block-api.ts:75-126` defines `AUTHOR_FIELDS`, `MANDATORY_METADATA_FIELDS = {id, oid, content_hash, content_parent}` (`:90-95`), `DISCRETIONARY_METADATA_FIELDS` (`:107-111`), `DEFAULT_METADATA_FIELDS` (`:123-126`). `mintOid` (`:619-622`) and `prepareItemIdentityForWrite` (`:657+`) mint `oid`, compute `content_hash`, advance `content_parent`. Gated on the schema declaring all three identity fields (`arrayDeclaresIdentityFields`, `:550-554`).
- **Content addressing is real.** `src/content-hash.ts` (RFC 8785 JCS canonicalize → SHA-256, `:39-67`); `src/object-store.ts` writes `<substrateDir>/objects/<contentHash>.json` (`:45-97`). Live substrate `.context/objects/` has 8 objects; `.context-jit-spec-v2/objects/` exists.
- **Registry is real.** `src/context-registry.ts` reads/writes project-root `.pi-context-registry.json` (`:60-62`), `substrate_id → {dir, aliases[]}`, `resolveSubstrateDir`/`resolveAlias` (`:214-236`). Live file has 3 substrates: `.context` (`sub-394aad2658e4d9a7`), `.context-jit-spec-v2` (`sub-2668a102413f6aea`), `.project-migrate` (`sub-0c813fd84348d4c2`, alias `project`).
- **Structured endpoints are real.** `schemas/relations.schema.json:7-42` — dual-form endpoint: legacy string OR `{kind:"item", oid, refname?, substrate_id?, content_hash?}` OR `{kind:"lens_bin", bin}`. Live `.context/relations.json` (37 edges) carries structured `{kind:"item", oid, refname}` parents and foreign `{kind:"item", substrate_id:"sub-0c813fd84348d4c2", oid, refname}` children.
- **`resolveRef` classifies active/foreign/dangling/unregistered.** `src/context-sdk.ts:1489+`.
- **Tool surface = 48 `pi.registerTool` calls.** Enumerated from `src/index.ts` (`grep name:`), full list in PART B §B.7.
- **`/context` subcommands (15):** `init, switch, list, archive, install, accept-all, view, lens-curate, roadmap-list, roadmap-view, roadmap-validate, status, add-work, validate, help` (`src/index.ts:2887+` `CONTEXT_SUBCOMMANDS`).

### A.1 Per-doc table

| Doc (path) | What it covers about pi-context | STALE (describes a model that no longer holds — cite) | MISSING (current model absent) | Editable vs Generated |
|---|---|---|---|---|
| `packages/pi-context/skills/pi-context/SKILL.md` | The skill the in-pi agent loads. Has a CURRENT `<tools_reference>` (45 tool descriptors), `<commands_reference>`, full `<planning_vocabulary>` table (block kinds, array keys, item fields, status enums), `<installable_blocks>`/`<installable_schemas>` tables. | Prose sections describe the PRE-content-addressed model. `<objective>`/`<block_files>`/`<substrate_config>` (`:622-654`) speak of items only by refname/`id`; **no oid/content_hash/content_parent/objects**. `<lens_views>`/`<substrate_validation>` (`:656-678`) describe relations endpoints as bare strings (`{parent,child,relation_type}`) and the `parent` as "canonical id or lens.bins value" — does not mention structured `EdgeEndpoint`. `<success_criteria>:731` still asserts a `<substrate-dir>/phases/` dir exists after init (phases are an in-block array under `phase.json`, not a dir — `buildIdIndex` comment `src/context-sdk.ts:1113-1115`). | No three-layer identity; no content-addressing/`objects/`; no `substrate_id`; no registry/`.pi-context-registry.json`; no cross-substrate endpoints / `resolveRef` four-way classification; no no-nested-id / no-FK rule; no `migrations.json`/schema-versioning narrative; the prose omits the 3 content-addressing tools the tools_reference itself also omits (`promote-item`, `migrate-content-addressed`, `canonicalize-substrate`). | **GENERATED** — footer `:743` "Generated from source by `scripts/generate-skills.js` — do not edit by hand." Regenerate via `npm run skills`. Note: the generated artifact lags source (its tools_reference lists 45 of the 48 registered tools and its prose lags `skill-narrative.md`'s own staleness — a rebuild is required and is itself insufficient; the SOURCE narrative must be updated first). |
| `packages/pi-context/skill-narrative.md` | The hand-edited SOURCE the skill prose is generated FROM (frontmatter + XML-tagged sections, no markdown headings). Covers objective, block files, schema validation, init/accept-all/install, lens views/curate/view, substrate validation, item reads, status, add-work, duplicate detection, validate, update-check, success criteria. | Same staleness as SKILL prose (it IS the source of it). `<block_files>:16` identity = "e.g. `gaps.json`" by refname only. `<substrate_config>:38` lists config keys without `substrate_id`. `<lens_views>:48` "each row is `{parent, child, relation_type}`" — bare strings, no structured endpoint. `<substrate_validation>:64` lists 7 edge codes but omits the registry-resolution codes (`substrate_id_registry_mismatch`, `edge_endpoint_dangling/unregistered`, `nested_id_bearing_array`). `<success_criteria>:120` again names a `phases/` dir. | Same as SKILL.md MISSING list. This is the file to EDIT to fix the skill. | **EDITABLE** — this is the authoritative narrative source. After editing, run `npm run skills` to regenerate SKILL.md. |
| `packages/pi-context/README.md` | Package README. Schemas-as-design-language pitch, install, getting-started (init→accept-all→install), how-it-works, tools-registered summary, commands, source-file table, API reference (block-api / schema-validator / context-sdk / context.ts / lens-view / context-dir / block-validation). | The API reference and "Source Files" table are pre-arc. **No `content-hash.ts`/`object-store.ts`/`context-registry.ts` rows** though all three are exported subpaths. Tools-registered summary (`:45`) enumerates families but omits `promote-item`/`migrate-content-addressed`/`canonicalize-substrate`/`context-switch`/`context-list`/`context-archive`/`gather-execution-context`/roadmap tools/`join-blocks`/`walk-ancestors`/`find-references`/`resolve-items-by-id`/`filter-block-items`. "For LLMs" (`:178`) references an `append-block-item` tool but says nothing about identity/registry. | No identity model, no content-addressing, no registry, no structured endpoints, no `substrate_id`, no migrations narrative. The exported subpaths `./content-hash`, `./object-store`, `./context-registry`, `./promote-item`, `./migrate-content-addressed`, `./canonicalize-substrate`, `./schema-migrations`, `./land-identity-fields`, `./read-element`, `./dispatch-context` are undocumented. | **EDITABLE** — hand-maintained. |
| Root `README.md` | Repo-level overview. Strong on substrate-switching (`:9-15,58-70`), per-arc substrate pattern (`:70`), auth-gate routing (`:68`), layout (`:78-88`), config/relations exemption + `resolveContextDir` (`:88`). pi-context tools/commands section (`:92-102`). | Tools line (`:94`) lists ~17 tools — stale subset (missing the entire identity/content-addressing/query/roadmap families). No mention of `.pi-context-registry.json` in the layout (`:78-88`) though it is a tracked project-root file. | The three-layer identity, content-addressing, registry, structured endpoints are absent from the repo overview. `objects/` and `migrations.json` not shown in the substrate layout. | **EDITABLE** — hand-maintained. |
| `analysis/2026-06-01-pi-context-substrate-model-before-after.md` | Current-model cross-check (the AFTER half is accurate to code). | n/a — accurate; used as cross-check, not a target. Its before→after framing is for transition narrative only; the artifact here states current truth. | n/a | EDITABLE analysis (gitignored-status note: `analysis/` is tracked per CLAUDE.md). Not a doc-update target — it is a reference. |
| `analysis/2026-05-30-pi-context-claude-code-howto.md` | Interim Claude-Code-side how-to (per MEMORY.md, interim until self-documenting substrate per FGAP-182). Not re-read in full this pass; flagged as a candidate that may carry pre-arc SDK usage. | UNCONFIRMED in detail this pass — read before relying on it; likely pre-arc in the identity/registry dimensions given its date precedes the arc-completion. | UNCONFIRMED. | EDITABLE analysis. Lower priority than README + skill-narrative. |
| CLAUDE.md (project) | Operating rules; "Context SDK" + "Project Blocks" sections describe filing patterns + closure-table + schema-versioning + DispatchContext. | Largely current (it already states closure-table edges, FK-as-field forbidden, schema versioning). Does not enumerate the identity model or registry, but it is a rules doc, not a pi-context reference. | Identity/registry not stated, by design (rules-only). | EDITABLE but OUT OF SCOPE as a "pi-context doc" — it's the operating-rules doc. Noted for completeness. |

**Biggest staleness findings:** (1) The skill (both generated SKILL.md and its source `skill-narrative.md`) describes the entire substrate as pre-content-addressed — no oid/content_hash/content_parent, no objects/, no substrate_id, no registry, relations endpoints described as bare strings. (2) Both READMEs omit the three exported content-addressing/registry modules and a large fraction of the registered tools. (3) Two leftover assertions of a `<substrate-dir>/phases/` directory that does not exist (phases are an in-block array). (4) SKILL.md is a stale generated artifact: even after `npm run skills` it inherits the narrative's staleness, so the SOURCE must be fixed first.

---

## PART B — Current Source-of-Truth Content

Written for both audiences. Each subsection is sized to drop into the README (concise) or the skill narrative (full). Every claim cites its source file.

### B.1 What pi-context is + substrate layout

pi-context is the schema-driven project-state extension. Project state lives in a **substrate**: a directory of typed JSON **blocks** (each an array of items) plus substrate singletons. Schemas are the design language — drop a `<name>.schema.json` into the substrate's `schemas/` and that block kind gets write-time validation + generic tooling with no code change (`packages/pi-context/README.md:5`).

**Substrate layout** (confirmed against live `.context/` + path resolvers `src/context-dir.ts`, `src/object-store.ts:45`, `src/context-registry.ts:60`):

```
<substrate-dir>/                 (e.g. .context — name chosen at init, pointer-recorded)
  config.json                    substrate singleton — vocabulary + substrate_id + root  (root-exempt)
  relations.json                 substrate singleton — closure-table edges (array)        (root-exempt)
  migrations.json                substrate singleton — schema version-bump registry
  <block>.json                   one per block kind: { "<arrayKey>": [ ...items ] }
  schemas/<block>.schema.json     one JSON-Schema per block kind
  objects/<content_hash>.json     content-addressed object store (one file per content version)

<project-root>/
  .pi-context.json               bootstrap pointer — names the single ACTIVE substrate dir (contextDir field)
  .pi-context-registry.json      project-root registry — enumerates ALL substrates by substrate_id
```

- `config.json` and `relations.json` are **exempt from `config.root` redirection** — they always live at the substrate-dir root (the bootstrap-chosen dir), because they define `root` (`skill-narrative.md:40`; README `:134`). Every other path routes through `resolveContextDir(cwd)`, which resolves `config.root` and falls back to the pointer (`src/context-dir.ts`; README `:120,151-159`).
- `objects/` is tracked in git — it is the integrity/version store; gitignoring it would lose pinning (`src/object-store.ts:16-18`).
- `.pi-context-registry.json` is a project-root, git-tracked file, distinct from the pointer: the pointer names the one active substrate; the registry enumerates all of them (`src/context-registry.ts:12-18,54-62`).

### B.2 Three-layer item identity + content-addressing

Every item in an identity-bearing block carries (confirmed `src/block-api.ts:90-95`, sample schema `samples/schemas/decisions.schema.json` declares all three, live `.context/session-notes.json` item `SESSION-001` carries `oid` + `content_hash`):

- **`id` (refname)** — the human label (`DEC-0001`, `TASK-021`). Mutable; a label, not an identity.
- **`oid`** — 32-hex, content-INDEPENDENT, **minted once at birth, immutable**. `mintOid(substrateId, nonce?)` = first 32 hex of `sha256Hex(canonicalJson([substrateId, nonce ?? randomUUID()]))` — salted by `substrate_id` so two substrates minting with the same nonce get distinct oids (`src/block-api.ts:619-622`). On update, a different incoming oid throws (immutability guard, `:697-701`).
- **`content_hash`** — 64-hex SHA-256 of the item's **content projection** (a shallow copy with the metadata fields deleted). Identical content ⇒ identical hash ⇒ dedup (`src/content-hash.ts:65-67`, `contentProjection` `src/block-api.ts:453-464`).
- **`content_parent`** — the prior version's `content_hash`; the per-item version chain. Advances only when content actually changed; a metadata-only write carries the prior parent forward (does not truncate the chain) (`src/block-api.ts:715-729`).

**Metadata partition** (excluded from the content hash): the **mandatory floor** `{id, oid, content_hash, content_parent}` is never hashable and an override can never pull it in (`MANDATORY_METADATA_FIELDS`, `src/block-api.ts:78-95`); the **discretionary** set is the four author fields + `closed_by`/`closed_at` (`:107-111`). A schema's item subschema may redefine the discretionary set via `x-identity.metadata_fields` (`readItemMetadataFieldsOverride`, `:267+`); the floor is still unioned in (`metadataFieldsForSchema`, `:389-395`).

**Content store:** on a stamping write the content projection is persisted to `<substrate>/objects/<content_hash>.json` (idempotent, atomic tmp+rename, content-addressed so identical content ⇒ byte-identical file) — `src/object-store.ts:76-97`. Object persistence is deferred until AFTER the whole block clears AJV so a validation failure never orphans an object (`src/block-api.ts:688-691`).

**Stamping gate:** identity stamping is a no-op unless the item's array subschema declares all three identity fields (`arrayDeclaresIdentityFields`, `src/block-api.ts:550-554,666-671`). This scopes identity to canonical schemas and leaves bespoke/test schemas untouched.

### B.3 Relations — closure-table edges, structured endpoints, no-nested-id / no-FK

All inter-item relationships are **closure-table edges** in `<substrate>/relations.json`, an array of `{parent, child, relation_type, ordinal?}` rows (`schemas/relations.schema.json:44-61`). `relation_type` is a lens id, hierarchy edge type, or registered `relation_types[].canonical_id`; `ordinal` orders siblings within `(parent, relation_type)`.

**Endpoints are dual-form** (`schemas/relations.schema.json:7-42`):
- a **legacy string** — a canonical id or a lens bin name (disambiguated cross-document at `validateRelations`); a `<alias>:<refname>` string is a cross-substrate sentinel;
- a structured **item endpoint** `{kind:"item", oid (required), refname?, substrate_id?, content_hash?}` — `substrate_id` present ⇒ foreign; `content_hash` carried for drift detection;
- a structured **lens_bin endpoint** `{kind:"lens_bin", bin}` — a virtual parent that NEVER resolves to an item.

Live `.context/relations.json` confirms both: same-substrate parents `{kind:"item", oid, refname:"SESSION-001"}` and foreign children `{kind:"item", substrate_id:"sub-0c813fd84348d4c2", oid, refname:"FGAP-151"}`.

**Forbidden representations** (the single-form rule): **no embedded nested id-bearing arrays** and **no FK-as-field**. A nested id-bearing array in a schema is flagged `nested_id_bearing_array` by `validateContext` with the remediation "promote to a top-level entity + membership edge" (`src/context-sdk.ts:1970-1978`). Containment is a membership edge carrying `ordinal`; the nested id-bearing array → top-level entity block + ordinal-bearing membership edges promotion is performed by the canonicalizer (`canonicalize-substrate` tool; `src/canonicalize-substrate.ts:10-12`). The `promote-item` tool is a separate cross-substrate derivation (item → another registered substrate as a new content-addressed item + `item_derived_from_item` lineage edge; `src/index.ts:1035`, `src/promote-item.ts:129`), NOT a nested-array promoter.

### B.4 Cross-substrate — substrate_id + registry + aliases + resolveRef

- **`config.substrate_id`** — per-substrate root identity, pattern `^sub-[0-9a-f]{16}$`, minted once, immutable on disk; `substrateIdForDir` reads it and throws loudly when absent (no degraded fallback) — `schemas/config.schema.json` substrate_id description; `src/block-api.ts` (`substrateIdForDir`).
- **Registry** `.pi-context-registry.json` — project-root, version + `substrates: { <substrate_id>: { dir, aliases[] } }` (`src/context-registry.ts:70-88`; `propertyNames` enforces the `sub-` pattern). `resolveSubstrateDir(cwd, substrate_id)` and `resolveAlias(cwd, alias)` return null on a clean miss (`:214-236`).
- **`resolveRef(cwd, ref, opts?)`** classifies any endpoint into four `ResolveStatus` values (`src/context-sdk.ts:1401,1489+`):
  - `active` — resolved in the active substrate index (a bare oid/refname, or a lens_bin which is always active without item lookup);
  - `foreign` — a structured `substrate_id` locator, or a `<alias>:<refname>` whose alias is registered, resolved in the foreign index;
  - `dangling` — locator names a registered substrate but the oid/refname is absent there (or the foreign index build throws);
  - `unregistered` — a `substrate_id`/alias the registry does not carry.
  The `<alias>:<refname>` parse is attempted first on a string with a NON-leading `:` (the parse gates on `colon > 0`, so a leading-colon string is not alias-parsed) (`:1521-1546`).

**SoT-drift invariant:** `validateContext` requires the active `config.substrate_id` to have a registry entry whose `dir` resolves to the active substrate; mismatch ⇒ `substrate_id_registry_mismatch`, missing ⇒ `substrate_id_unregistered` (`src/context-sdk.ts:1661-1696`).

### B.5 Schemas, `$id`, versioning + migrations

- Schemas are draft-07 JSON-Schema, one per block kind, in `<substrate>/schemas/`. Package-shipped substrate-singleton schemas carry a `pi-context://schemas/<name>` `$id` + a `version` (e.g. `config.schema.json:3-4` `$id pi-context://schemas/config`, version `1.5.0`; `relations.schema.json:3-4` version `2.0.0`).
- **Schema versioning + migrations:** `migrations.json` is the per-substrate migration registry. A schema version bump REQUIRES a companion migration declaration via the `write-schema-migration` tool; without one, read/write of an item declaring an older `schema_version` throws version-mismatch (`src/index.ts` `write-schema` + `write-schema-migration` tool descriptions; `src/schema-migrations.ts`, `src/migrations-store.ts`). Migration kinds: `identity` (shape-compatible, no transform) or `declarative-transform` (a TransformSpec of rename/set/delete/coerce on dotted paths). The loaded registry resolves the edge at next read/write so items walk forward without a process restart.
- `block:<name>` references resolve to `<contextDir>/schemas/<name>.schema.json` (CLAUDE.md key-architecture rule).

### B.6 Config (block_kinds / relation_types / invariants / lenses / substrate_id)

`config.json` is the substrate vocabulary + bootstrap. Confirmed top-level props (`schemas/config.schema.json`, version 1.5.0): `schema_version, root, substrate_id, naming, layers, block_kinds, status_buckets, display_strings, relation_types, invariants, hierarchy, lenses, installed_schemas, installed_blocks, tool_operations, tool_operations_forbidden`. Live `.context/config.json` additionally confirms population counts (17 block_kinds, 29 relation_types, 2 lenses, 6 invariants).

- **`block_kinds[]`** — the installable/declared kinds; each carries its schema + starter block + applicable relation_types + lenses (the installable catalog; `read-samples-catalog` tool).
- **`relation_types[]`** — registered edge types by `canonical_id`; every `relations.json` edge's `relation_type` must be registered.
- **`invariants[]`** — config-declared cross-block invariants checked by `validateContext` (e.g. cross-block status drift, `src/context-sdk.ts:1876+`).
- **`lenses[]`** — named projections over a target block: `id`, `target`, `relation_type`, optional `derived_from_field` (synthesize edges from a per-item field), `bins`, `render_uncategorized`, and `kind:composition` (union of member lenses) — `skill-narrative.md:46`; `context-edges-for-lens` tool.
- **`naming`/`display_strings`** — alias canonical ids to display names for rendering.
- **`hierarchy`** — declares legal parent-block → child-block edges via relation_type.
- **`substrate_id`** + **`root`** — see B.4/B.1.

### B.7 Usage surface — both audiences

**In-pi LLM/agent — registered Pi tools (48, from `src/index.ts`).** Families:
- Block CRUD: `append-block-item`, `update-block-item`, `remove-block-item`, `write-block`, `read-block`, `read-block-dir`, `append-block-nested-item`, `update-block-nested-item`, `remove-block-nested-item`.
- Item-level read/query: `read-block-item`, `read-block-page`, `filter-block-items`, `resolve-item-by-id`, `resolve-items-by-id`, `join-blocks`, `find-references`, `walk-ancestors`, `context-walk-descendants`, `context-edges-for-lens`, `gather-execution-context`.
- Substrate writes: `append-relation`, `amend-config`, `write-schema`, `write-schema-migration`, `rename-canonical-id`.
- Content-addressing lifecycle: **`promote-item`** (cross-substrate derivation: promote an item into another registered substrate as a new content-addressed item + `item_derived_from_item` lineage edge), **`migrate-content-addressed`** (backfill identity), **`canonicalize-substrate`** (one-time canonicalizer; promotes each nested id-bearing array → top-level entity block + ordinal-bearing membership edges).
- Discovery/introspection: `read-config`, `read-schema`, `read-samples-catalog`, `list-tools`, `context-current-state`, `context-bootstrap-state`.
- Lifecycle/state: `context-status`, `context-validate`, `context-validate-relations`, `complete-task`.
- Substrate management: `context-init`, `context-accept-all`, `context-switch`, `context-list`, `context-archive`.
- Roadmap: `context-roadmap-load`, `context-roadmap-render`, `context-roadmap-validate`, `context-roadmap-list`.

(Three of these — `promote-item`, `migrate-content-addressed`, `canonicalize-substrate` — are registered in `index.ts` but absent from the current generated SKILL.md `<tools_reference>`, which carries 45; the regeneration gap noted in PART A.)

**In-pi LLM/agent — `/context` subcommands (15, `src/index.ts:2887+`):** `init <dir>`, `switch <dir> | -c <new-dir> | -`, `list`, `archive <dir>`, `install [--update]`, `accept-all`, `view <lensId>`, `lens-curate <lensId>`, `roadmap-list`, `roadmap-view`, `roadmap-validate`, `status`, `add-work`, `validate`, `help`.

**Human / Claude-Code — SDK via `npx tsx -e`.** Exported subpaths (from `package.json` `exports`): `.` (index), `./block-api`, `./content-hash`, `./object-store`, `./schema-validator`, `./block-validation`, `./context-dir`, `./context-registry`, `./context-sdk`, `./context`, `./promote-item`, `./migrate-content-addressed`, `./canonicalize-substrate`, `./dispatch-context`, `./schema-write`, `./schema-migrations`, `./lens-view`, `./rename-canonical-id`, `./samples-catalog`, `./read-element`, `./land-identity-fields`, plus `./schemas/*.schema.json` direct file exports (config, context-registry, relations, priority, status, severity, source, layer, verification-method). Unlisted subpaths are not importable. Example: `npx tsx -e "import {contextState} from '@davidorex/pi-context/context-sdk'; ..."`.

**Human / Claude-Code — orchestrator scripts** (`scripts/orchestrator/*.ts`, dual-surface ergonomics wrappers over the same block-api/context-sdk library the in-pi tools consume). Substrate ops have a script twin: `file-block-item.ts`, `append-relation.ts`, `amend-config.ts`, `write-schema.ts`, `read-config.ts`, `read-schema.ts`, `promote-item.ts`, `migrate-content-addressed.ts`, `canonicalize-substrate.ts`, `land-identity-fields.ts`, `gather-execution-context.ts`, `join-blocks.ts`, `walk-ancestors.ts`, `find-references.ts`, `resolve-items-by-id.ts`, `filter-block-items.ts`, `read-block-item.ts`, `read-block-page.ts`, `current-state.ts`, `bootstrap-state.ts`, `build-html-views.ts`, plus `runtime-demo-*.ts` exercising each primitive end-to-end. (Per CLAUDE.md: new substrate op = library + Pi tool + CLI script as a unit.)

**Canonical filing patterns + the direct-Edit prohibition.** All substrate writes go through block-api primitives (validated + DispatchContext-stamped + atomic tmp+rename + per-block lock, `src/block-api.ts` `withBlockLock`; README `:87`). **Direct `Edit`/`Write` of `.project/*.json` (or any substrate JSON) is forbidden** (CLAUDE.md "Project Blocks"). Append: write JSON to `/tmp/<id>.json`, then `npx tsx scripts/orchestrator/file-block-item.ts --block <name> --writer human:... --auto-id --item @/tmp/<id>.json`. Field updates: `npx tsx -e` with `updateItemInBlock` from `@davidorex/pi-context/block-api`. Write-class tools (and pointer mutations: `context-switch`/`context-archive`/`context-init`/`context-accept-all`) route through the pi-agent-dispatch auth-gate, which prompts via `ctx.ui.confirm` and stamps the verified operator identity (root README `:68`).

**DispatchContext attestation:** every block-api write accepts `ctx?: DispatchContext` with a `WriterIdentity` (human/agent/monitor/workflow). When provided AND the schema declares author fields, items are stamped per the schema's declared subset (`src/block-api.ts` `maybeStampItem`; CLAUDE.md).

### B.8 Validation

- **`validateContext(cwd)`** (`src/context-sdk.ts`; tool `context-validate`) — cross-block referential integrity + config invariants + the registry/identity invariants. Returns `{status: "clean"|"warnings"|"invalid", issues[]}`. Issue codes confirmed in source include: `substrate_id_unregistered`, `substrate_id_registry_mismatch` (`:1681,1696`); `edge_endpoint_dangling`, `edge_endpoint_unregistered` (`:1734-1759`); `edge_cycle_detected` (`:1830`); `nested_id_bearing_array` (`:1976`). Config-declared `invariants[]` (e.g. cross-block status drift) are checked in the same pass (`:1876+`). Registered lens-validators are merged in (`:1983+`).
- **`validateRelations(cwd)`** (tool `context-validate-relations`) — closure-table edge codes: `edge_unknown_relation_type`, `edge_parent_not_in_bins`, `edge_unresolved_parent`, `edge_unresolved_child`, `edge_parent_wrong_block`, `edge_child_wrong_block`, `edge_cycle_detected` (`skill-narrative.md:64`), now with the `resolveRef` hook classifying foreign endpoints.
- **`buildIdIndex(cwd)` prefix invariant** — an id whose prefix maps to a registered `block_kinds[]` canonical_id but is found in a different block throws at index-build time (`src/context-sdk.ts:1117-1124`). Phases participate as an ordinary array block under `phase.json` (plural `phases` key) — there is no per-phase file branch (`:1113-1115`); contradicts the leftover "`phases/` dir" claims in the skill.

---

## Doc-Update Targets

| File | Action | Hand-edited vs Regenerated |
|---|---|---|
| `packages/pi-context/skill-narrative.md` | Update prose to the B-sections: add identity/content-addressing (B.2), structured endpoints + no-nested-id/no-FK (B.3), substrate_id/registry/resolveRef (B.4), migrations (B.5), substrate_id config key (B.6); fix the `phases/` dir claim; add the full edge/identity validation codes (B.8). | **Hand-edited** (this is the source). |
| `packages/pi-context/skills/pi-context/SKILL.md` | Regenerate AFTER editing the narrative; verify the regeneration also emits the 3 missing content-addressing tools. | **Regenerated** via `npm run skills` — never hand-edit. |
| `packages/pi-context/README.md` | Add `content-hash.ts`/`object-store.ts`/`context-registry.ts` (+ the other undocumented subpaths) to Source Files + API; replace the stale tool families summary with B.7's 48-tool list; add the identity/registry/content-addressing model to "How It Works" + "For LLMs". | **Hand-edited.** |
| Root `README.md` | Refresh the pi-context tools line (`:94`) to the current families; add `.pi-context-registry.json` + `objects/` + `migrations.json` to the substrate layout (`:78-88`); one-paragraph mention of the three-layer identity + cross-substrate registry. | **Hand-edited.** |
| `analysis/2026-05-30-pi-context-claude-code-howto.md` | Read in full and reconcile against B.7 (SDK/orchestrator usage) before relying on it; likely pre-arc. Lower priority. | **Hand-edited** (analysis). |

(`analysis/2026-06-01-...before-after.md` is a reference/cross-check, not a target. CLAUDE.md is the operating-rules doc, out of scope as a pi-context reference.)
