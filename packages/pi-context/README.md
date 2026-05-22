# pi-context

Schema-driven project state management for [Pi](https://github.com/badlogic/pi-mono).

Schemas are the design language. You define what your project tracks by writing JSON Schemas, and the entire system — tools, validation, derived state, workflow integration — adapts automatically. Drop a new `.schema.json` file into `.project/schemas/` and it instantly becomes an addressable block type with write-time validation, discovery, and generic CRUD tooling. No code changes.

## Install

```bash
pi install npm:@davidorex/pi-context
```

## Getting Started

```
/project init       # create the empty substrate skeleton
/project install    # reconcile .project/ against installed_* lists in config.json
```

`init` is intentionally minimal: it writes the bootstrap pointer + substrate/schemas dirs only — no config, no schemas, no starter blocks (DEC-0011 ship-no-defaults). Adopt the packaged conception with `/project accept-all` (writes `config.json` from `samples/conception.json`), or hand-declare `config.json`'s `installed_schemas` / `installed_blocks`, then run `/project install` (opt-in install ceremony, idempotent, `--update` overwrites). The package-shipped samples catalog (`samples/blocks/` and `samples/schemas/`, per DEC-0037) is the source.

## How It Works

Project data lives under the substrate root (the dir chosen at init and recorded in `config.json`'s `root` field by accept-all; no default is shipped — DEC-0015) as typed JSON block files. Each block has a corresponding JSON Schema that defines its shape. All writes — whether from tools, workflows, or agents — are validated against the schema before data hits disk. Invalid data is never persisted.

After `/project init` the substrate skeleton is just the dirs (no config, no schemas, no blocks):

```
.project/
  schemas/                    — empty until accept-all + install
```

After `/project accept-all` (writes `config.json` from the packaged conception) + `/project install` (with declared entries) and any user authoring, the directory typically grows:

```
.project/
  config.json                 — substrate bootstrap (always at .project/, exempt from root redirection)
  relations.json              — closure-table edges (always at .project/, exempt from root redirection)
  schemas/<name>.schema.json  — installed from samples/schemas/, plus any user-authored schemas
  <name>.json                 — installed from samples/blocks/, plus any user-authored blocks
```

The schema is the contract. When pi-workflows agents produce output that writes to project blocks, the schema enforces the shape. When `/project add-work` extracts items from conversation, the schema constrains what gets written. When `projectState()` derives block summaries, it reads the typed data the schemas guarantee.

**Tools registered:** the tool surface grows with the package — read the generated `skills/pi-context/SKILL.md` for the current set, or call the `list-tools` tool at runtime (in-pi) / `grep pi.registerTool packages/pi-context/src/index.ts` (source). Families: block CRUD (read/write/append/update/remove, top-level + nested), item-level read (`read-block-item`, `read-block-page`), query (`filter-block-items`, `resolve-item(s)-by-id`, `find-references`, `walk-ancestors`, `project-walk-descendants`), substrate write (`append-relation`, `amend-config`, `write-schema`, `rename-canonical-id`), discovery/introspection (`read-config`, `read-schema`, `read-samples-catalog`, `list-tools`, `context-current-state`), lifecycle (`project-init`, `project-accept-all`, `project-status`, `project-validate`, `project-validate-relations`, `complete-task`).

**Commands registered:**
- `/project init <dir>` — bootstrap pointer + substrate/schemas dirs only (no config, no defaults)
- `/project accept-all` — adopt `samples/conception.json` as `config.json` (idempotent; never overwrites an existing config)
- `/project install [--update]` — reconcile the substrate against `installed_schemas` / `installed_blocks` in `config.json` by copying assets from the samples catalog (skip-if-exists by default; `--update` overwrites)
- `/project view <lensId>` — render a configured lens (groupByLens projection) into the conversation as markdown
- `/project lens-curate <lensId>` — surface bin-assignment suggestions for uncategorized items as a follow-up turn; the LLM persists chosen edges via `append-block-item` against `relations.json`
- `/project status` — derived project state (source metrics, test counts, block summaries, git state)
- `/project add-work` — extract structured items from conversation into typed blocks
- `/project validate` — cross-block referential integrity checks

## Source Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Extension entry point — tool and command registration |
| `src/block-api.ts` | Block CRUD: `readBlock`, `writeBlock`, `appendToBlock`, `updateItemInBlock`, `appendToNestedArray`, `updateNestedArrayItem`, `removeFromBlock`, `removeFromNestedArray`, `readBlockDir` |
| `src/schema-validator.ts` | AJV wrapper: `validate`, `validateFromFile`, `ValidationError` |
| `src/block-validation.ts` | Post-step validation: `snapshotBlockFiles`, `validateChangedBlocks`, `rollbackBlockFiles` |
| `src/project-sdk.ts` | Derived state + cross-block resolver: `projectState`, `availableBlocks`, `availableSchemas`, `findAppendableBlocks`, `validateProject`, `buildIdIndex`, `resolveItemById`, `completeTask`. Re-exports the substrate API from `project-context.ts` (config/relations loaders, lens algorithms, validators, `projectRoot`) so existing consumers get one import surface. |
| `src/project-context.ts` | Substrate bootstrap: `loadConfig`, `loadRelations`, `getProjectContext` (mtime-keyed cache), `projectRoot(cwd)` (the `config.root` resolver every path helper routes through), the lens algorithms (`edgesForLens`, `synthesizeFromField`, `walkDescendants`, `groupByLens`, `listUncategorized`, `displayName`), `validateRelations`. Type exports: `ConfigBlock`, `HierarchyDecl`, `LensSpec`, `Edge`, `ItemRecord`, `ProjectContext`, `SubstrateValidationIssue`, `SubstrateValidationResult`, `CurationSuggestion`. |
| `src/lens-view.ts` | Lens-view consumption surface — pure functions for `/project view` + `/project lens-curate`: `loadLensView`, `renderLensView`, `buildCurationSuggestions`, `validateProjectRelations`, `edgesForLensByName`, `walkLensDescendants`. |
| `src/project-dir.ts` | Constants `PROJECT_DIR` / `SCHEMAS_DIR`. Path-builders that route through `projectRoot(cwd)` now live in `project-context.ts`: `projectDir`, `schemasDir`, `schemaPath`, `agentsDir`, `projectTemplatesDir`. |
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

### Derived State + Cross-Block Resolver (`src/project-sdk.ts`)

```typescript
projectState(cwd: string): ProjectState
availableBlocks(cwd: string): BlockInfo[]
availableSchemas(cwd: string): string[]
findAppendableBlocks(cwd: string): Array<{ block, arrayKey, schemaPath }>
validateProject(cwd: string): { status: "clean" | "warnings" | "invalid"; issues: ValidationIssue[] }
buildIdIndex(cwd: string): Map<string, ItemLocation>
resolveItemById(cwd: string, id: string): ItemLocation | null
completeTask(cwd, taskId, verificationId): CompleteTaskResult
```

`projectState()` computes everything fresh on each call — no cache, no stale data. `buildIdIndex` / `resolveItemById` enforce kind-prefix consistency (a `DEC-` id found in a non-decisions block throws), so the cross-block-reference plumbing in pi-jit-agents and pi-workflows can rely on the prefix invariant.

### Substrate API (`src/project-context.ts`, re-exported from `src/project-sdk.ts`)

```typescript
// Bootstrap loaders
loadConfig(cwd: string): ConfigBlock | null
loadRelations(cwd: string): Edge[]
getProjectContext(cwd: string): ProjectContext   // mtime-keyed cached snapshot
projectRoot(cwd: string): string                 // resolves config.root, falls back to PROJECT_DIR

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

`config.root` is the substrate's "where do I live" answer — block-api, schemas-discovery, phase-discovery, and every other path consumer route through `projectRoot(cwd)` so a relocated root reaches the runtime instead of being trapped in the SDK. `config.json` and `relations.json` themselves are exempt — they always live at `.project/` because they are the substrate that defines `root`.

### Lens View Consumption (`src/lens-view.ts`)

```typescript
loadLensView(cwd: string, lensId: string): LoadedLensView | { error: string }
renderLensView(view: LoadedLensView, naming: Record<string, string> | undefined): string
buildCurationSuggestions(view: LoadedLensView): string
validateProjectRelations(cwd: string): SubstrateValidationResult
edgesForLensByName(cwd: string, lensId: string): Edge[] | { error: string }
walkLensDescendants(cwd: string, parentId: string, relationType: string): string[]
```

Pure functions consumed by the `/project view`, `/project lens-curate`, `project-edges-for-lens`, `project-walk-descendants`, and `project-validate-relations` shells in `index.ts`. Tests call them directly without an `ExtensionCommandContext`.

### `.project` Path Surface (`src/project-context.ts`)

```typescript
PROJECT_DIR: ".project"                 // bootstrap-fixed location of config.json + relations.json
SCHEMAS_DIR: "schemas"
projectRoot(cwd): string                // resolves config.root; falls back to PROJECT_DIR
projectDir(cwd): string                 // <cwd>/<projectRoot>
schemasDir(cwd): string                 // <cwd>/<projectRoot>/schemas
schemaPath(cwd, blockName): string      // <cwd>/<projectRoot>/schemas/<name>.schema.json
agentsDir(cwd): string                  // <cwd>/<projectRoot>/agents
projectTemplatesDir(cwd): string        // <cwd>/<projectRoot>/templates
```

Canonical builders consumed across pi-jit-agents and pi-workflows for any substrate-root path construction. The constants (`PROJECT_DIR`, `SCHEMAS_DIR`) still live in `src/project-dir.ts`; the path-builders moved to `project-context.ts` so they can route through `projectRoot(cwd)` without forming an import cycle through `project-sdk.ts`. Replace inline `path.join(cwd, ".project", ...)` with these.

### Block Validation (`src/block-validation.ts`)

Used by workflow executors for post-step integrity checks:

```typescript
snapshotBlockFiles(cwd: string): BlockSnapshot   // Map<string, BlockFileSnapshot>
validateChangedBlocks(cwd: string, snapshot: BlockSnapshot): void
rollbackBlockFiles(cwd: string, snapshot: BlockSnapshot): string[]
```

## For LLMs

When working with this extension:

- **Read `src/project-sdk.ts`** to understand what project state is available and how it's computed
- **Read `src/block-api.ts`** to understand the CRUD operations and validation behavior
- **Read `src/index.ts`** to see tool parameter schemas and command handler logic
- Use the `append-block-item` tool to add items — it handles schema validation, duplicate checking, and atomic writes
- Use the `update-block-item` tool with a `match` predicate (e.g., `{ id: "gap-123" }`) and `updates` object
- Block schemas define the contract — consult `.project/schemas/*.schema.json` to understand what fields are required
- `projectState(cwd)` is the single source of truth for project metrics — prefer it over manual filesystem inspection

## Tests

```bash
npm test
```

Runs `tsx --test src/*.test.ts`. Test files: `block-api.test.ts`, `block-tools.test.ts`, `schema-validator.test.ts`, `project-sdk.test.ts`.

## Development

Part of the [`pi-project-workflows`](../../README.md) monorepo. All four packages (pi-context, pi-jit-agents, pi-workflows, pi-behavior-monitors) plus the pi-project-workflows meta-package are versioned in lockstep (current version in each `package.json`).

`npm run build` compiles TypeScript to `dist/` via `tsc`. The package ships `dist/`, not `src/` — the `pi.extensions` entry point is `./dist/index.js`.
