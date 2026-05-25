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
```

`init` is intentionally minimal: it writes the bootstrap pointer + substrate/schemas dirs only — no config, no schemas, no starter blocks (DEC-0011 ship-no-defaults). Adopt the packaged conception with `/context accept-all` (writes `config.json` from `samples/conception.json`), or hand-declare `config.json`'s `installed_schemas` / `installed_blocks`, then run `/context install` (opt-in install ceremony, idempotent, `--update` overwrites). The package-shipped samples catalog (`samples/blocks/` and `samples/schemas/`, per DEC-0037) is the source.

## How It Works

Project data lives under the substrate root (the dir chosen at init and recorded in `config.json`'s `root` field by accept-all; no default is shipped — DEC-0015) as typed JSON block files. Each block has a corresponding JSON Schema that defines its shape. All writes — whether from tools, workflows, or agents — are validated against the schema before data hits disk. Invalid data is never persisted.

After `/context init <substrate-dir>` the substrate skeleton is just the dirs (no config, no schemas, no blocks):

```
<substrate-dir>/
  schemas/                    — empty until accept-all + install
```

After `/context accept-all` (writes `config.json` from the packaged conception) + `/context install` (with declared entries) and any user authoring, the directory typically grows:

```
<substrate-dir>/
  config.json                 — substrate bootstrap (always at the substrate-dir root (your chosen dir), exempt from `config.root` redirection)
  relations.json              — closure-table edges (always at the substrate-dir root (your chosen dir), exempt from `config.root` redirection)
  schemas/<name>.schema.json  — installed from samples/schemas/, plus any user-authored schemas
  <name>.json                 — installed from samples/blocks/, plus any user-authored blocks
```

The schema is the contract. When pi-workflows agents produce output that writes to project blocks, the schema enforces the shape. When `/context add-work` extracts items from conversation, the schema constrains what gets written. When `contextState()` derives block summaries, it reads the typed data the schemas guarantee.

**Tools registered:** the tool surface grows with the package — read the generated `skills/pi-context/SKILL.md` for the current set, or call the `list-tools` tool at runtime (in-pi) / `grep pi.registerTool packages/pi-context/src/index.ts` (source). Families: block CRUD (read/write/append/update/remove, top-level + nested), item-level read (`read-block-item`, `read-block-page`), query (`filter-block-items`, `resolve-item(s)-by-id`, `find-references`, `walk-ancestors`, `context-walk-descendants`), substrate write (`append-relation`, `amend-config`, `write-schema`, `rename-canonical-id`), discovery/introspection (`read-config`, `read-schema`, `read-samples-catalog`, `list-tools`, `context-current-state`), lifecycle (`context-init`, `context-accept-all`, `context-status`, `context-validate`, `context-validate-relations`, `complete-task`).

**Commands registered:**
- `/context init <substrate-dir>` — bootstrap pointer + substrate/schemas dirs only (no config, no defaults)
- `/context accept-all` — adopt `samples/conception.json` as `config.json` (idempotent; never overwrites an existing config)
- `/context install [--update]` — reconcile the substrate against `installed_schemas` / `installed_blocks` in `config.json` by copying assets from the samples catalog (skip-if-exists by default; `--update` overwrites)
- `/context view <lensId>` — render a configured lens (groupByLens projection) into the conversation as markdown
- `/context lens-curate <lensId>` — surface bin-assignment suggestions for uncategorized items as a follow-up turn; the LLM persists chosen edges via `append-block-item` against `relations.json`
- `/context status` — derived project state (source metrics, test counts, block summaries, git state)
- `/context add-work` — extract structured items from conversation into typed blocks
- `/context validate` — cross-block referential integrity checks

## Source Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Extension entry point — tool and command registration |
| `src/block-api.ts` | Block CRUD: `readBlock`, `writeBlock`, `appendToBlock`, `updateItemInBlock`, `appendToNestedArray`, `updateNestedArrayItem`, `removeFromBlock`, `removeFromNestedArray`, `readBlockDir` |
| `src/schema-validator.ts` | AJV wrapper: `validate`, `validateFromFile`, `ValidationError` |
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

Pure functions consumed by the `/context view`, `/context lens-curate`, `context-edges-for-lens`, `context-walk-descendants`, and `context-validate-relations` shells in `index.ts`. Tests call them directly without an `ExtensionCommandContext`.

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
- Use the `append-block-item` tool to add items — it handles schema validation, duplicate checking, and atomic writes
- Use the `update-block-item` tool with a `match` predicate (e.g., `{ id: "gap-123" }`) and `updates` object
- Block schemas define the contract — consult `<substrate-dir>/schemas/*.schema.json` to understand what fields are required
- `contextState(cwd)` is the single source of truth for project metrics — prefer it over manual filesystem inspection

## Tests

```bash
npm test
```

Runs `tsx --test src/*.test.ts`. Test files: `block-api.test.ts`, `block-tools.test.ts`, `schema-validator.test.ts`, `context-sdk.test.ts`.

## Development

Part of the [`pi-project-workflows`](../../README.md) monorepo. All four packages (pi-context, pi-jit-agents, pi-workflows, pi-behavior-monitors) plus the pi-project-workflows meta-package are versioned in lockstep (current version in each `package.json`).

`npm run build` compiles TypeScript to `dist/` via `tsc`. The package ships `dist/`, not `src/` — the `pi.extensions` entry point is `./dist/index.js`.
