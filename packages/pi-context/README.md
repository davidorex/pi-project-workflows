# pi-context

Schema-driven project state management for [Pi](https://github.com/badlogic/pi-mono).

Schemas are the design language. You define what your project tracks by writing JSON Schemas, and the entire system — tools, validation, derived state, workflow integration — adapts automatically. Drop a new `.schema.json` file into `<substrate-dir>/schemas/` and it instantly becomes an addressable block type with write-time validation, discovery, and generic CRUD tooling. No code changes.

## Install

```bash
pi install npm:@davidorex/pi-context
```

## Getting Started

```
/context init <substrate-dir>   # create the empty substrate skeleton
/context install    # reconcile <substrate-dir>/ against installed_* lists in config.json
/context check-status   # read-only: preview installed-vs-catalog schema drift (writes nothing)
/context update [--dryRun]   # bring the installed schema model current with the catalog, preserving local edits (3-way merge); --dryRun previews
/context resolve-conflict --schemaName <name> [--schema <reconciled>]   # commit a reconciled merge conflict: write the resolved body + advance the merge base to the catalog
```

`init` (and `switch -c`) is intentionally minimal: it writes the bootstrap pointer, the substrate/schemas dirs, and a minimal schema-valid **skeleton config** (`schema_version` + empty `block_kinds` + `root` + a minted, registered `substrate_id`) — no schemas, no starter blocks (ship-no-defaults). The skeleton is never-clobbered: an idempotent re-init leaves an existing config untouched. From the skeleton there are two onward paths: adopt the packaged conception with `/context accept-all` (overwrites a skeleton config, never a populated one; writes `config.json` from `samples/conception.json` and preserves the skeleton's `substrate_id`), then `/context install`; or build a custom vocabulary directly via `amend-config` / `write-schema` / `append-block-item` (no catalog adoption). The opt-in install ceremony copies the `installed_schemas` / `installed_blocks` declared in `config.json` from the package samples catalog (`samples/blocks/` and `samples/schemas/`); it is idempotent. Populated block data is never overwritten (reported as `preserved`), while empty or absent blocks get the catalog starter. Install records an **install baseline** (`config.installed_from`) — the catalog source + a per-schema content fingerprint of the installed schemas — for installed-vs-catalog drift detection; the baseline covers schemas only.

`/context update` is the drift-aware, customization-preserving path for bringing the installed schema model current with the catalog (it supersedes the former `/context install --update`). Per installed schema it consults the drift classification: an `in-sync` schema is a no-op; a `catalog-ahead` schema re-syncs through the migration-aware path; a `locally-modified` / `both-diverged` schema is reconciled by a deterministic 3-way merge of base (the as-installed schema body in the object store, keyed by the recorded baseline `content_hash`) × ours (the installed schema) × theirs (the catalog schema) — disjoint edits auto-merge so both the user's and the catalog's changes survive (`required` / `enum` / array-valued `type` nodes merge as sets), and a schema with irreconcilable per-path conflicts is left unmodified — the conflict set is returned in the op output (under `conflicts`) alongside a readable report, and the calling agent reconciles it then commits via `/context resolve-conflict` (no subordinate resolver is spawned). `update` also additively propagates catalog-new config-registry entries (`relation_types` / `invariants` / `block_kinds` / `lenses`) absent from the config, preserving every user-authored entry and any locally-diverged body of an existing entry (additive-only; the added ids are reported under `registryAdditions`). A version-bump `catalog-ahead` resync registers the shipped catalog migration chain's declarations into `migrations.json`, reported under `migrationsRegistered` (each `{ schema, from, to }`). `--dryRun` predicts the precise per-schema outcome (resync / migrate / block / merge / conflict) by running the forward-migration and re-validation in memory, alongside the config-registry entries that would be added and the migration declarations that would be registered, writing nothing. Preview drift first with `/context check-status`.

## How It Works

Project data lives under the substrate root (the dir chosen at init and recorded in `config.json`'s `root` field by accept-all; no default is shipped) as typed JSON block files. Each block has a corresponding JSON Schema that defines its shape. All writes — whether from tools, workflows, or agents — are validated against the schema before data hits disk. Invalid data is never persisted.

After `/context init <substrate-dir>` the substrate skeleton is the dirs plus a minimal skeleton `config.json` (schema-valid, empty of vocabulary, carrying a minted/registered `substrate_id`) — no schemas, no blocks:

```
<substrate-dir>/
  config.json                 — skeleton: schema_version + empty block_kinds + root + substrate_id
  schemas/                    — empty until accept-all + install (or custom authoring)
```

After `/context accept-all` (writes `config.json` from the packaged conception) + `/context install` (with declared entries) and any user authoring, the directory typically grows:

```
<substrate-dir>/
  config.json                 — substrate bootstrap + substrate_id (always at the substrate-dir root (your chosen dir), exempt from `config.root` redirection)
  relations.json              — closure-table edges (always at the substrate-dir root (your chosen dir), exempt from `config.root` redirection)
  migrations.json             — per-substrate schema-version migration registry
  schemas/<name>.schema.json  — installed from samples/schemas/, plus any user-authored schemas
  objects/<content_hash>.json — content-addressed object store (one file per content version; git-tracked)
  <name>.json                 — installed from samples/blocks/, plus any user-authored blocks

<project-root>/
  .pi-context.json            — bootstrap pointer naming the single ACTIVE substrate dir (contextDir)
  .pi-context-registry.json   — project-root registry enumerating ALL substrates by substrate_id (git-tracked)
```

The schema is the contract. When pi-workflows agents produce output that writes to project blocks, the schema enforces the shape. When `/context add-work` extracts items from conversation, the schema constrains what gets written. When `contextState()` derives block summaries, it reads the typed data the schemas guarantee.

### Item identity + content-addressing

Every item in an identity-bearing block carries a three-layer identity (the block's schema must declare all three identity fields, or stamping is a no-op):

- **`id` (refname)** — the human label, a kind-prefixed refname (e.g. a `DEC-`/`TASK-` id). Mutable; a label, not an identity.
- **`oid`** — a content-independent 32-hex id minted once at the item's birth and immutable thereafter, salted by the substrate's `substrate_id` so two substrates never collide. A write that carries a different incoming `oid` is rejected.
- **`content_hash`** — a SHA-256 over the item's *content projection* (the item minus its metadata fields). Identical content yields an identical hash, so duplicate content deduplicates.
- **`content_parent`** — the prior version's `content_hash`, forming a per-item version chain. It advances only when content actually changed; a metadata-only write carries the prior parent forward.

On a stamping write, the content projection is persisted to `<substrate-dir>/objects/<content_hash>.json` — a content-addressed, git-tracked object store (one file per content version). The metadata fields excluded from the hash are the mandatory floor `{id, oid, content_hash, content_parent}` plus a discretionary set (the author fields and `closed_by`/`closed_at`); a schema's item subschema may redefine the discretionary set via `x-identity.metadata_fields`, but the floor is always excluded.

`/context install` and `/context update` also base-stamp each as-installed / resynced schema body into `objects/<content_hash>.json`, keyed by the schema's baseline `content_hash` recorded in `config.installed_from.assets`. This stamped body is the merge BASE the `/context update` 3-way merge reconstructs for a locally-modified schema.

### Cross-substrate: substrate_id + registry

Each substrate's `config.json` carries a `substrate_id` (pattern `sub-` + 16 hex), minted once and immutable on disk. A project-root, git-tracked `.pi-context-registry.json` enumerates *all* substrates by `substrate_id` (each mapped to its `dir` and any `aliases`), distinct from the `.pi-context.json` pointer which names only the one active substrate. `resolveRef(cwd, ref)` classifies any endpoint as `active` (resolved in the active substrate), `foreign` (a registered `substrate_id` or `<alias>:<refname>` resolved in another substrate), `dangling` (a registered substrate that lacks the named item), or `unregistered` (a substrate_id/alias the registry does not carry). `validateContext` requires the active `config.substrate_id` to have a matching registry entry, guarding against source-of-truth drift.

### Relations: closure-table edges, structured endpoints

All inter-item relationships are closure-table edges in `<substrate-dir>/relations.json` — `{parent, child, relation_type, ordinal?}` rows. Endpoints are dual-form: a legacy string (a canonical id, a lens bin name, or an `<alias>:<refname>` cross-substrate sentinel), or a structured `{kind:"item", oid, refname?, substrate_id?, content_hash?}` (where `substrate_id` marks a foreign endpoint), or a structured `{kind:"lens_bin", bin}` virtual parent. Embedded nested id-bearing arrays and FK-as-field are forbidden (`validateContext` flags `nested_id_bearing_array`); containment is a membership edge carrying `ordinal`. `promote-item` is the cross-substrate derivation tool (an item promoted into another registered substrate as a new content-addressed item).

### Schema versioning + migrations

`<substrate-dir>/migrations.json` is the per-substrate migration registry. A schema `version` bump requires a companion migration declared via `write-schema-migration` — without one, reading or writing an item with an older `schema_version` throws a version mismatch. Migration kinds are `identity` (shape-compatible, no transform) or `declarative-transform` (a spec of rename/set/delete/coerce on dotted paths). The loaded registry walks items forward at the next read/write without a process restart.

**Tools registered:** the tool surface grows with the package — read the generated `skills/pi-context/SKILL.md` for the current set, or call the `list-tools` tool at runtime (in-pi) / `grep pi.registerTool packages/pi-context/src/index.ts` (source). Families:

- **Block CRUD** — `read-block`, `write-block`, `read-block-dir`, `append-block-item`, `update-block-item`, `upsert-block-item` (validated find-or-append), `remove-block-item`, and the nested-array variants (`append/update/remove-block-nested-item`).
- **Item-level read/query** — `read-block-item`, `read-block-page`, `filter-block-items`, `resolve-item-by-id`, `resolve-items-by-id`, `join-blocks`, `find-references`, `walk-ancestors`, `context-walk-descendants`, `context-edges-for-lens`, `context-lens-view`, `gather-execution-context`.
- **Substrate writes** — `append-relation`, `append-relations` (bulk edge append), `remove-relation`, `replace-relation` (single-write atomic re-orient), `amend-config`, `write-schema`, `write-schema-migration`, `rename-canonical-id`.
- **Content-addressing lifecycle** — `promote-item` (cross-substrate derivation: promote an item into another registered substrate as a new content-addressed item + `item_derived_from_item` lineage edge; `dryRun` previews the destination write without persisting).
- **Discovery/introspection** — `read-config`, `read-schema`, `read-samples-catalog`, `list-tools`, `context-current-state`, `context-bootstrap-state`.
- **Lifecycle/state** — `context-status`, `context-validate`, `context-validate-relations`, `complete-task` (gates on a passing `verification_verifies_item` edge — verification=parent, task=child).
- **Substrate management** — `context-init`, `context-accept-all`, `context-switch`, `context-list`, `context-archive`.
- **Roadmap** — `context-roadmap-load`, `context-roadmap-render`, `context-roadmap-validate`, `context-roadmap-list`.

The relation byRef ops (`append-relation` / `remove-relation` / `replace-relation` / `append-relations`) and `upsert-block-item` accept a `dryRun` flag: it resolves the operation and validates the prospective whole file under the SAME write-path validation, returning the would-decision (`{ ..., dryRun: true }`) while writing nothing. The same shared library path backs both the op (`--dryRun`) and the orchestrator scripts — one implementation, not a script-only preview.

**Op output.** Every op's `run` returns a structured `OpResult` (`string | { json } | { read }`) — data ops carry their un-stringified value, read ops a `ReadStructured`. The runtime-reflecting CLI's `--json` envelope emits `output` as a real JSON value (no double-encode); the default CLI text surface and the in-pi Pi-tool text surface route through `renderOpResultText`. The 50KB read cap is enforced at the OUTPUT BOUNDARY across all three channels (CLI `--json`, CLI text, in-pi text) via `boundedJsonOutput` / `renderOpResultText` — an over-cap payload fails closed (`--json` → `{ data: null, truncated: true, totalBytes, complete: false }`; text → a no-payload REFUSAL) rather than leaking unbounded substrate content.

**Op attestation.** Write ops are auto-attested: `OpDefinition.run` takes an optional `ctx?: DispatchContext` that `registerAll` builds per dispatch — the auth-gate-stamped `params.writer` (a verified human) when present, else an agent identity from `ctx.model` — and forwards to the block-api/context call, so in-pi op writes stamp `created_by` / `created_at` (and `modified_*` on update) when the target schema declares author fields.

**Op-coverage contract.** Every library write function is accounted for by `OP_COVERAGE_RULE` (a 5-class disjunction: op-backed-direct | op-backed-transitive | for-dir-twin | intentionally-unexposed | internal-primitive) — it is either reachable through an op or deliberately withheld via the `INTENTIONALLY_UNEXPOSED_WRITERS` allowlist (each entry carrying a justification). Both are exported from the `./ops` subpath. The contract is enforced by the source-intrinsic `scripts/parity-check.ts` build gate (husky pre-commit + CI): it enumerates library writers from the AST and fails on an unclassified writer or a silent `ctx` drop.

**Commands registered:**
- `/context init <substrate-dir>` — bootstrap pointer + substrate/schemas dirs + a never-clobber skeleton `config.json` (schema-valid, empty of vocabulary, minted `substrate_id`); onward via accept-all OR amend-config / edit
- `/context accept-all` — adopt `samples/conception.json` as `config.json` (idempotent; never overwrites an existing config)
- `/context install` — reconcile the substrate against `installed_schemas` / `installed_blocks` in `config.json` by copying assets from the samples catalog (skip-if-exists by default). Populated block data is never overwritten (reported as `preserved`), and empty or absent blocks get the catalog starter. Install also base-stamps each as-installed schema body into the object store and records an **install baseline** in `config.installed_from` — the catalog source (`name@version` + conception `schema_version`) plus a per-schema fingerprint (content hash + declared version) of the installed schemas — used for installed-vs-catalog drift detection. The baseline covers schemas only (blocks are user data); a re-install on an unchanged substrate is idempotent (byte-identical `config.json`, `at` preserved). (Bringing the installed schema model current is now `/context update`, below.)
- `/context check-status` — read-only: previews drift between the installed schemas and the catalog, reporting each as `in-sync` / `catalog-ahead` / `locally-modified` / `both-diverged` / `no-baseline` / `missing-catalog` / `missing-installed`; writes nothing
- `/context update [--dryRun]` (CLI: `pi-context update [--dryRun]`) — bring the installed schema model current with the catalog, routing each schema by its drift state: `in-sync` no-op; `catalog-ahead` resync (migration-aware); `locally-modified` / `both-diverged` reconciled by a deterministic 3-way merge of base (the as-installed body in the object store, keyed by the baseline `content_hash`) × ours (installed schema) × theirs (catalog schema) — disjoint edits auto-merge (`required` / `enum` / array-`type` nodes merge as sets), and a schema with irreconcilable per-path conflicts is left unmodified — the conflict set is returned in the op output (under `conflicts`) alongside a readable report, and the calling agent reconciles it then commits via `/context resolve-conflict` (below; no subordinate resolver is spawned). Update also additively propagates catalog-new config-registry entries (`relation_types` / `invariants` / `block_kinds` / `lenses`) absent from the config, preserving user-authored entries and any locally-diverged body of an existing entry (reported under `registryAdditions`). A version-bump `catalog-ahead` resync registers the shipped catalog migration chain's declarations into `migrations.json`; these are reported under `migrationsRegistered` (each `{ schema, from, to }`). `--dryRun` predicts the precise per-schema outcome (resync / migrate / block / merge / conflict) by running the forward-migration and re-validation in memory, alongside the config-registry entries that would be added and the migration declarations that would be registered, and writes nothing. Each auto-merged / resynced schema refreshes its baseline so a follow-up `/context check-status` reports it `in-sync`; a schema left as a `conflict` is NOT brought current by update — it stays unmodified until `/context resolve-conflict` commits the reconciliation
- `/context resolve-conflict --schemaName <name> [--schema <reconciled>]` (CLI: `pi-context resolve-conflict --schemaName <name> [--schema <reconciled>]`) — commit the reconciliation of a merge conflict `update` surfaced. Run after reconciling a `both-diverged` conflict: it writes the reconciled schema body (meta-validated, atomic) AND advances the merge base for that schema to the catalog body, so the next `update` sees the schema as `locally-modified` and its deterministic merge takes the reconciled body (base === theirs → ours) — auto-merging with zero conflicts and preserving the resolution. Without advancing the base a bare `write-schema` leaves the baseline on the original pre-conflict body and `update` re-derives the same conflict on every run. If `--schema` is omitted the current on-disk schema is treated as already reconciled and only the base is advanced
- `/context view <lensId>` — render a configured lens (groupByLens projection) into the conversation as markdown
- `/context lens-curate <lensId>` — surface bin-assignment suggestions for uncategorized items as a follow-up turn; the LLM persists chosen edges via `append-block-item` against `relations.json`
- `/context status` — derived project state (source metrics, test counts, block summaries, git state)
- `/context add-work` — extract structured items from conversation into typed blocks
- `/context validate` — cross-block referential integrity checks
- `/context roadmap-list` — list every roadmap in `<config.root>/roadmap.json` (id, title, status, phase count)
- `/context roadmap-view <ROADMAP-id>` — render a roadmap as pure-textual markdown (phase order, per-phase adjacency from authored `phase_depends_on` edges, status rollup, milestone resolution; no mermaid)
- `/context roadmap-validate [ROADMAP-id]` — validate every roadmap (or one) and surface structured issues
- `/context switch <existing-dir> | -c <new-dir> | -` — flip the bootstrap pointer (to an existing substrate, bootstrap-new-and-flip, or back to `previous_contextDir`)
- `/context list` — enumerate top-level dirs containing `config.json` (switchable substrates); marks the active one
- `/context archive <dir>` — move a non-active substrate dir to `archive/<dir>/`

**Constrained pi session.** The standalone `@davidorex/pi-context-cli` also provides `pi-context pi-bound` — a process mode that launches a `pi` coding-agent session restricted to the composed pi-extension tool surface. See the [pi-context-cli README](../pi-context-cli/README.md#pi-context-pi-bound--constrained-pi-session).

## Source Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Extension entry point — tool and command registration |
| `src/block-api.ts` | Block CRUD + identity stamping: `readBlock`, `writeBlock`, `appendToBlock`, `updateItemInBlock`, `appendToNestedArray`, `updateNestedArrayItem`, `removeFromBlock`, `removeFromNestedArray`, `readBlockDir`; mints `oid`/`content_hash`/`content_parent` (`mintOid`, `prepareItemIdentityForWrite`, `contentProjection`), reads `substrate_id` (`substrateIdForDir`). Exported subpath `./block-api`. |
| `src/content-hash.ts` | RFC 8785 JCS canonicalization → SHA-256 content hashing for the content projection. Exported subpath `./content-hash`. |
| `src/object-store.ts` | Content-addressed object store: writes/reads `<substrate-dir>/objects/<content_hash>.json` (idempotent, atomic tmp+rename). Exported subpath `./object-store`. |
| `src/context-registry.ts` | Project-root `.pi-context-registry.json` reader/writer: `substrate_id → { dir, aliases[] }`, `resolveSubstrateDir`, `resolveAlias`. Exported subpath `./context-registry`. |
| `src/promote-item.ts` | Cross-substrate derivation: promotes a substrate item into another registered substrate as a new content-addressed item, recording an `item_derived_from_item` lineage edge in the destination (`promote-item` tool; `dryRun` previews without writing). Exported subpath `./promote-item`. |
| `src/schema-write.ts` | Schema create/replace authoring backing `write-schema`. Exported subpath `./schema-write`. |
| `src/schema-migrations.ts` | Schema version-bump migration engine (`identity` / `declarative-transform`), backed by `migrations.json`. Exported subpath `./schema-migrations`. |
| `src/read-element.ts` | Element-level substrate read helper: `structureForRead` / `renderReadText` (the structure/render split), `serializeForRead` (preserved for external callers), `addressInto` (element addressing), and the `ReadStructured` envelope (`data` + `truncated`/`hasMore`/`total`/`complete`). Over-cap reads fail closed. Exported subpath `./read-element`. |
| `src/dispatch-context.ts` | `DispatchContext` / `WriterIdentity` attestation types stamped onto block-api writes (`created_by` / `created_at`). In-pi op writes are auto-attested: `OpDefinition.run` takes an optional `ctx?: DispatchContext` that `registerAll` builds per dispatch (auth-gate-verified `params.writer` when present, else an agent identity from `ctx.model`) and forwards to the block-api/context call; exported helper `buildDispatchContextFromExecute(params, extCtx)`. Exported subpath `./dispatch-context`. |
| `src/rename-canonical-id.ts` | Renames a canonical id across blocks + relations (`rename-canonical-id` tool). Exported subpath `./rename-canonical-id`. |
| `src/samples-catalog.ts` | Reads the packaged conception/samples catalog. Exported subpath `./samples-catalog`. |
| `src/schema-validator.ts` | AJV wrapper: `validate`, `validateFromFile`, `ValidationError`. Exported subpath `./schema-validator`. |
| `src/block-validation.ts` | Post-step validation: `snapshotBlockFiles`, `validateChangedBlocks`, `rollbackBlockFiles` |
| `src/context-sdk.ts` | Derived state + cross-block resolver: `contextState`, `availableBlocks`, `availableSchemas`, `findAppendableBlocks`, `validateContext`, `buildIdIndex`, `resolveItemById`, `completeTask`. Re-exports the substrate API from `context.ts` (config/relations loaders, lens algorithms, validators, `resolveContextDir`) so existing consumers get one import surface. |
| `src/context.ts` | Substrate bootstrap: `loadConfig`, `loadRelations`, `loadContext` (mtime-keyed cache), `resolveContextDir(cwd)` (the `config.root` resolver every path helper routes through), the lens algorithms (`edgesForLens`, `synthesizeFromField`, `walkDescendants`, `groupByLens`, `listUncategorized`, `displayName`), `validateRelations`. Type exports: `ConfigBlock`, `HierarchyDecl`, `LensSpec`, `Edge`, `ItemRecord`, `ContextData`, `SubstrateValidationIssue`, `SubstrateValidationResult`, `CurationSuggestion`. |
| `src/lens-view.ts` | Lens-view consumption surface — pure functions for `/context view` + `/context lens-curate`: `loadLensView`, `renderLensView`, `buildCurationSuggestions`, `validateContextRelations`, `edgesForLensByName`, `walkLensDescendants`. |
| `src/context-dir.ts` | Path-builders that route through `resolveContextDir(cwd)`: `schemasDir`, `schemaPath`, `agentsDir`, `contextTemplatesDir`. |
| `src/update-check.ts` | Checks for updates to `@davidorex/pi-project-workflows` on session start |

## API

### Block I/O (`src/block-api.ts`)

```typescript
readBlock(cwd: string, blockName: string): unknown
readBlockDir(cwd: string, subdir: string): unknown[]
writeBlock(cwd: string, blockName: string, data: unknown): void
appendToBlock(cwd: string, blockName: string, arrayKey: string, item: unknown): void
updateItemInBlock(cwd: string, blockName: string, arrayKey: string, predicate, updates): void
appendToNestedArray(cwd, blockName, parentArrayKey, parentPredicate, nestedArrayKey, item): void
updateNestedArrayItem(cwd, blockName, parentArrayKey, parentPredicate, nestedArrayKey, nestedPredicate, updates): void
removeFromBlock(cwd, blockName, arrayKey, predicate): { removed: number }
removeFromNestedArray(cwd, blockName, parentArrayKey, parentPredicate, nestedArrayKey, nestedPredicate): { removed: number }
```

All writes are atomic (tmp file + rename) and serialised per block via `withBlockLock`. If a schema exists for the block, validation runs before the write — invalid data is never persisted. `update*` operations throw on no-match; `remove*` operations are idempotent (`{ removed: 0 }` on no-match).

### Schema Validation (`src/schema-validator.ts`)

```typescript
validate(schema: Record<string, unknown>, data: unknown, label: string): unknown
validateFromFile(schemaPath: string, data: unknown, label: string): unknown
```

Throws `ValidationError` with structured AJV error details on failure.

### Derived State + Cross-Block Resolver (`src/context-sdk.ts`)

```typescript
contextState(cwd: string): ContextState
availableBlocks(cwd: string): BlockInfo[]
availableSchemas(cwd: string): string[]
findAppendableBlocks(cwd: string): Array<{ block, arrayKey, schemaPath }>
validateContext(cwd: string): { status: "clean" | "warnings" | "invalid"; issues: ValidationIssue[] }
buildIdIndex(cwd: string): Map<string, ItemLocation>
resolveItemById(cwd: string, id: string): ItemLocation | null
completeTask(cwd, taskId, verificationId): CompleteTaskResult
```

`contextState()` computes everything fresh on each call — no cache, no stale data. `buildIdIndex` / `resolveItemById` enforce kind-prefix consistency (a `DEC-` id found in a non-decisions block throws), so the cross-block-reference plumbing in pi-jit-agents and pi-workflows can rely on the prefix invariant.

### Substrate API (`src/context.ts`, re-exported from `src/context-sdk.ts`)

```typescript
// Bootstrap loaders
loadConfig(cwd: string): ConfigBlock | null
loadRelations(cwd: string): Edge[]
loadContext(cwd: string): ContextData            // mtime-keyed cached snapshot
resolveContextDir(cwd: string): string           // resolves config.root, falls back to the bootstrap pointer

// Lens algorithms (pure, callable directly with loaded inputs)
synthesizeFromField(lens: LensSpec, items: ItemRecord[]): Edge[]
edgesForLens(lens: LensSpec, items: ItemRecord[], authoredEdges: Edge[]): Edge[]
walkDescendants(parentId: string, relationType: string, edges: Edge[]): string[]
groupByLens(items: ItemRecord[], lens: LensSpec, lensEdges: Edge[]): Map<string, ItemRecord[]>
listUncategorized(lens, grouped): { uncategorized: ItemRecord[]; suggestionTemplate: ... }

// Validation + display
validateRelations(cwd, options?): SubstrateValidationResult
displayName(canonicalId: string, naming: Record<string, string> | undefined): string
```

`config.root` is the substrate's "where do I live" answer — block-api, schemas-discovery, phase-discovery, and every other path consumer route through `resolveContextDir(cwd)` so a relocated root reaches the runtime instead of being trapped in the SDK. `config.json` and `relations.json` themselves are exempt — they always live at the substrate-dir root (the bootstrap-chosen dir, pointer-resolved, suggested `.context`) because they are the substrate that defines `root`.

### Lens View Consumption (`src/lens-view.ts`)

```typescript
loadLensView(cwd: string, lensId: string): LoadedLensView | { error: string }
renderLensView(view: LoadedLensView, naming: Record<string, string> | undefined): string
buildCurationSuggestions(view: LoadedLensView): string
validateContextRelations(cwd: string): SubstrateValidationResult
edgesForLensByName(cwd: string, lensId: string): Edge[] | { error: string }
walkLensDescendants(cwd: string, parentId: string, relationType: string): string[]
```

Pure functions consumed by the `/context view`, `/context lens-curate`, `context-edges-for-lens`, `context-lens-view`, `context-walk-descendants`, and `context-validate-relations` shells in `index.ts`. Tests call them directly without an `ExtensionCommandContext`.

### Substrate Path Surface (`src/context-dir.ts`)

```typescript
resolveContextDir(cwd): string          // resolves config.root; falls back to the bootstrap pointer
schemasDir(cwd): string                 // <cwd>/<resolveContextDir>/schemas
schemaPath(cwd, blockName): string      // <cwd>/<resolveContextDir>/schemas/<name>.schema.json
agentsDir(cwd): string                  // <cwd>/<resolveContextDir>/agents
contextTemplatesDir(cwd): string        // <cwd>/<resolveContextDir>/templates
```

Canonical builders consumed across pi-jit-agents and pi-workflows for any substrate-root path construction. All path-builders route through `resolveContextDir(cwd)` so a relocated root reaches every consumer. Replace inline `path.join(cwd, ".project", ...)` with these.

### Block Validation (`src/block-validation.ts`)

Used by workflow executors for post-step integrity checks:

```typescript
snapshotBlockFiles(cwd: string): BlockSnapshot   // Map<string, BlockFileSnapshot>
validateChangedBlocks(cwd: string, snapshot: BlockSnapshot): void
rollbackBlockFiles(cwd: string, snapshot: BlockSnapshot): string[]
```

## For LLMs

When working with this extension:

- **Read `src/context-sdk.ts`** to understand what project state is available and how it's computed
- **Read `src/block-api.ts`** to understand the CRUD operations and validation behavior
- **Read `src/index.ts`** to see tool parameter schemas and command handler logic
- Use the `append-block-item` tool to add items — it handles schema validation, duplicate checking, atomic writes, and (for identity-bearing schemas) minting `oid`/`content_hash`/`content_parent` + persisting the content projection to `objects/`
- Use the `update-block-item` tool with a `match` predicate (e.g., `{ id: "gap-123" }`) and `updates` object — `oid` is immutable, so a mismatched incoming `oid` is rejected
- Block schemas define the contract — consult `<substrate-dir>/schemas/*.schema.json` to understand what fields are required; a schema declaring all three identity fields opts the block into content-addressing
- Items reference each other only through closure-table edges in `relations.json` (structured `{kind:"item", oid, refname?, substrate_id?}` or `{kind:"lens_bin", bin}` endpoints) — no FK-as-field, no nested id-bearing arrays
- Cross-substrate endpoints resolve through `.pi-context-registry.json`; use `resolveRef(cwd, ref)` to classify a reference as active/foreign/dangling/unregistered
- `contextState(cwd)` is the single source of truth for project metrics — prefer it over manual filesystem inspection

## Tests

```bash
npm test
```

Runs `tsx --test src/*.test.ts` — every `*.test.ts` under `src/` (block I/O + identity, schema validation + versioning/migrations, content-hashing + object store, the op-registry, substrate switch/registry/resolve-ref, lens-view, roadmap, and more).

## Development

Part of the [`pi-project-workflows`](../../README.md) monorepo. All four packages (pi-context, pi-jit-agents, pi-workflows, pi-behavior-monitors) plus the pi-project-workflows meta-package are versioned in lockstep (current version in each `package.json`).

`npm run build` compiles TypeScript to `dist/` via `tsc`. The package ships `dist/`, not `src/` — the `pi.extensions` entry point is `./dist/index.js`.
