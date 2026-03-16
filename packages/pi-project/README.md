# pi-project

Schema-driven project state management for [Pi](https://github.com/badlogic/pi-mono). Typed JSON block files with write-time validation, generic CRUD tools, and dynamically derived project state.

## Install

```bash
pi install pi-project
```

## What It Does

pi-project manages structured project data in `.project/` — JSON files validated against JSON Schemas. Users define their own block types by adding schemas; no code changes needed.

**Tools registered:**
- `append-block-item` — append an item to any block array (schema validation automatic)
- `update-block-item` — update fields on a block item by predicate match

**Commands registered:**
- `/project status` — display derived project state (source files, tests, phases, block summaries, recent commits)
- `/project add-work` — extract items from conversation into typed blocks

## Directory Layout

```
.project/
  schemas/          — JSON Schema files (*.schema.json)
  phases/           — phase specs (NN-name.json)
  *.json            — block data files (e.g., gaps.json, decisions.json)
```

Users add schemas to `.project/schemas/`. A block file is any `.project/*.json` — if a matching `.project/schemas/{name}.schema.json` exists, all writes are validated against it.

## Source Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Extension entry point — tool and command registration |
| `src/block-api.ts` | Block CRUD: `readBlock`, `writeBlock`, `appendToBlock`, `updateItemInBlock` |
| `src/schema-validator.ts` | AJV wrapper: `validate`, `validateFromFile`, `ValidationError` |
| `src/block-validation.ts` | Post-step validation: `snapshotBlockFiles`, `validateChangedBlocks`, `rollbackBlockFiles` |
| `src/project-sdk.ts` | Derived state: `projectState`, `availableBlocks`, `availableSchemas`, `findAppendableBlocks` |
| `src/project-dir.ts` | Constants: `PROJECT_DIR` (`.project`), `SCHEMAS_DIR` (`schemas`) |

## API

### Block I/O (`src/block-api.ts`)

```typescript
readBlock(cwd: string, blockName: string): unknown
writeBlock(cwd: string, blockName: string, data: unknown): void
appendToBlock(cwd: string, blockName: string, arrayKey: string, item: unknown): void
updateItemInBlock(cwd: string, blockName: string, arrayKey: string, predicate: (item) => boolean, updates: Record<string, unknown>): void
```

All writes are atomic (tmp file + rename). If a schema exists for the block, validation runs before the write — invalid data is never persisted.

### Schema Validation (`src/schema-validator.ts`)

```typescript
validate(schema: Record<string, unknown>, data: unknown, label: string): unknown
validateFromFile(schemaPath: string, data: unknown, label: string): unknown
```

Throws `ValidationError` with structured AJV error details on failure.

### Derived State (`src/project-sdk.ts`)

```typescript
projectState(cwd: string): ProjectState
availableBlocks(cwd: string): BlockInfo[]
availableSchemas(cwd: string): string[]
findAppendableBlocks(cwd: string): Array<{ block, arrayKey, schemaPath }>
```

`projectState()` computes everything fresh on each call — no cache, no stale data. Returns: `testCount`, `sourceFiles`, `sourceLines`, `lastCommit`, `recentCommits`, `blockSummaries` (with per-array item counts and status distribution), `phases`, `blocks`, `schemas`.

### Block Validation (`src/block-validation.ts`)

Used by workflow executors for post-step integrity checks:

```typescript
snapshotBlockFiles(cwd: string): Map<string, Buffer>
validateChangedBlocks(cwd: string, snapshot: Map<string, Buffer>): void
rollbackBlockFiles(cwd: string, snapshot: Map<string, Buffer>): void
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

Runs `node --experimental-strip-types --test src/*.test.ts`. Test files: `block-api.test.ts`, `block-tools.test.ts`, `schema-validator.test.ts`, `block-validation.test.ts`, `project-sdk.test.ts`.
