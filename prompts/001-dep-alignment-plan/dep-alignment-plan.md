# Dependency Alignment Plan: pi-mono Pattern

<metadata>
  <confidence>high — all source files, imports, and package.json files have been read and cross-referenced</confidence>
  <assumptions>
    - npm workspace hoisting means packages in the same monorepo resolve each other from the workspace root node_modules, so `dependencies` entries for sibling packages work both in development (workspace link) and after publish (npm install resolves the version range).
    - pi's runtime loads extensions from node_modules — it does NOT re-resolve their peer dependencies separately. Moving peers to deps should not change runtime behavior.
    - The pi SDK packages (@mariozechner/pi-coding-agent, pi-ai, pi-tui, @sinclair/typebox) are bundled with the global pi install and hoisted into node_modules when pi resolves extensions. Declaring them as `dependencies` instead of `peerDependencies` should not cause duplicate copies because npm deduplicates when the same version satisfies both the hoisted copy and the declared range. However, if pi ships a newer version than the pinned range, npm may install two copies. Using `"*"` ranges (as currently done for peer deps) should be preserved as dep ranges to avoid this — but `"*"` in `dependencies` is unusual. See open questions.
    - The wildcard subpath export `"./src/*.js"` currently maps to `"./dist/*.js"`. Replacing it with named exports means any consumer importing an unlisted subpath will break at resolution time. The plan must account for all import sites.
    - pi-behavior-monitors' tsconfig.build.json sets `rootDir: "."` with source at `index.ts` — it compiles to `dist/index.js`. Named export paths from pi-project will resolve correctly since pi-behavior-monitors imports will go through node_modules.
  </assumptions>
  <resolved_constraints>
    - Version ranges: concrete caret ranges per pi-mono (`"^0.63.1"` for @mariozechner/*, `"^0.34.48"` for typebox, `"^0.8.0"` for inter-package)
    - Dependencies only, no peerDependencies. pi-mono pattern, no dual peer+dep.
    - Replace wildcard tsconfig paths with per-subpath mappings. No TypeScript project references.
    - Fix undeclared pi-ai dependency in pi-workflows — included in scope.
    - Minor version bump — no external consumers of unlisted subpaths.
  </resolved_constraints>
</metadata>

---

## Current State Inventory

### Package dependency graph (before)

```
@davidorex/pi-project@0.8.0
  dependencies: ajv
  peerDependencies: @mariozechner/pi-coding-agent *, @sinclair/typebox *
  exports: "." → dist/index.js, "./src/*.js" → dist/*.js (wildcard)

@davidorex/pi-workflows@0.8.0
  dependencies: nunjucks, yaml
  peerDependencies: @mariozechner/pi-coding-agent *, @mariozechner/pi-tui *, @sinclair/typebox *, @davidorex/pi-project ^0.8.0
  NOTE: imports @mariozechner/pi-ai in step-monitor.ts but does NOT declare it

@davidorex/pi-behavior-monitors@0.8.0
  dependencies: nunjucks
  peerDependencies: @mariozechner/pi-ai *, @mariozechner/pi-coding-agent *, @mariozechner/pi-tui *, @sinclair/typebox *
  NOTE: no dependency on pi-project — reads .project/ files with raw fs.readFileSync

@davidorex/pi-project-workflows@0.8.0 (meta-package)
  dependencies: @davidorex/pi-project ^0.8.0, @davidorex/pi-workflows ^0.8.0, @davidorex/pi-behavior-monitors ^0.8.0
```

### Import sites: pi-project subpath imports from pi-workflows

| File | Import path | Symbols |
|------|-------------|---------|
| `src/workflow-executor.ts:7` | `@davidorex/pi-project/src/block-api.js` | readBlock, writeBlock |
| `src/workflow-executor.ts:8-12` | `@davidorex/pi-project/src/block-validation.js` | rollbackBlockFiles, snapshotBlockFiles, validateChangedBlocks |
| `src/workflow-executor.ts:13` | `@davidorex/pi-project/src/project-dir.js` | PROJECT_DIR |
| `src/workflow-executor.ts:14` | `@davidorex/pi-project/src/schema-validator.js` | validate, validateFromFile |
| `src/step-agent.ts:6` | `@davidorex/pi-project/src/schema-validator.js` | validateFromFile |
| `src/index.ts:8` | `@davidorex/pi-project/src/sync-skills.js` | syncSkillsToUser |
| `src/graduated-failure.test.ts:10` | `@davidorex/pi-project/src/block-validation.js` | rollbackBlockFiles, snapshotBlockFiles |
| `src/block-validation.test.ts:10` | `@davidorex/pi-project/src/block-validation.js` | snapshotBlockFiles, validateChangedBlocks |
| `src/verifier-schema.test.ts:4` | `@davidorex/pi-project/src/schema-validator.js` | validateFromFile |

### Import sites: pi-behavior-monitors raw .project/ reads

| File | Line | What it reads | Block API equivalent |
|------|------|---------------|---------------------|
| `index.ts:499-500` | `collectProjectVision()` | `.project/project.json` → parses vision, core_value, name | `readBlock(cwd, 'project')` |
| `index.ts:513-514` | `collectProjectConventions()` | `.project/conformance-reference.json` → parses items[].name | `readBlock(cwd, 'conformance-reference')` |

### Export surface: pi-project public API (all modules)

| Subpath | Exported symbols |
|---------|-----------------|
| `/block-api` | `readBlock`, `writeBlock`, `appendToBlock`, `updateItemInBlock` |
| `/schema-validator` | `ValidationError`, `validate`, `validateFromFile` |
| `/block-validation` | `BlockFileSnapshot` (type), `BlockSnapshot` (type), `snapshotBlockFiles`, `validateChangedBlocks`, `rollbackBlockFiles` |
| `/project-dir` | `PROJECT_DIR`, `SCHEMAS_DIR` |
| `/project-sdk` | `BlockInfo` (type), `availableBlocks`, `availableSchemas`, `findAppendableBlocks`, `PROJECT_BLOCK_TYPES`, `SchemaProperty` (type), `SchemaInfo` (type), `schemaInfo`, `schemaVocabulary`, `BlockStructure` (type), `blockStructure`, `ArraySummary` (type), `BlockSummary` (type), `ProjectState` (type), `projectState`, `ProjectValidationIssue` (type), `ProjectValidationResult` (type), `validateProject` |
| `/sync-skills` | `syncSkillsToUser` |

### Peer freshness gate references

| Location | Content |
|----------|---------|
| `package.json:26` | `"check": "node scripts/check-peer-freshness.js && ..."` |
| `CLAUDE.md` (5 references) | Documents the gate in Commands, Conventions, and Completion Sequence sections |
| `.husky/pre-commit` | `npm run check` (indirect — runs the check script) |
| `scripts/check-peer-freshness.js` | The gate script itself |

---

## Phase 1: Named Subpath Exports for pi-project

**Objective**: Replace the wildcard subpath export with named exports that define an explicit public API contract. This is prerequisite for all other phases — import paths must be stable before consumers update their references.

**Scope**: pi-project package.json, root tsconfig.json paths

**Estimated effort**: Small (configuration only, no source changes)

### Task 1.1: Replace wildcard exports with named exports in pi-project/package.json

**File**: `packages/pi-project/package.json` (lines 19-27)

Replace the current exports field:
```json
"exports": {
  ".": {
    "types": "./dist/index.d.ts",
    "default": "./dist/index.js"
  },
  "./src/*.js": {
    "types": "./dist/*.d.ts",
    "default": "./dist/*.js"
  }
}
```

With named exports:
```json
"exports": {
  ".": {
    "types": "./dist/index.d.ts",
    "default": "./dist/index.js"
  },
  "./block-api": {
    "types": "./dist/block-api.d.ts",
    "default": "./dist/block-api.js"
  },
  "./schema-validator": {
    "types": "./dist/schema-validator.d.ts",
    "default": "./dist/schema-validator.js"
  },
  "./block-validation": {
    "types": "./dist/block-validation.d.ts",
    "default": "./dist/block-validation.js"
  },
  "./project-dir": {
    "types": "./dist/project-dir.d.ts",
    "default": "./dist/project-dir.js"
  },
  "./project-sdk": {
    "types": "./dist/project-sdk.d.ts",
    "default": "./dist/project-sdk.js"
  },
  "./sync-skills": {
    "types": "./dist/sync-skills.d.ts",
    "default": "./dist/sync-skills.js"
  }
}
```

**Rationale**: Named exports make the public API explicit. Consumers can only import listed subpaths. New internal modules don't leak. Matches pi-mono pattern.

### Task 1.2: Update root tsconfig.json paths for named exports

**File**: `tsconfig.json` (lines 6-8)

The current paths mapping:
```json
"@davidorex/pi-project": ["./packages/pi-project/src/index.ts"],
"@davidorex/pi-project/*": ["./packages/pi-project/*"]
```

Needs to become:
```json
"@davidorex/pi-project": ["./packages/pi-project/src/index.ts"],
"@davidorex/pi-project/block-api": ["./packages/pi-project/src/block-api.ts"],
"@davidorex/pi-project/schema-validator": ["./packages/pi-project/src/schema-validator.ts"],
"@davidorex/pi-project/block-validation": ["./packages/pi-project/src/block-validation.ts"],
"@davidorex/pi-project/project-dir": ["./packages/pi-project/src/project-dir.ts"],
"@davidorex/pi-project/project-sdk": ["./packages/pi-project/src/project-sdk.ts"],
"@davidorex/pi-project/sync-skills": ["./packages/pi-project/src/sync-skills.ts"]
```

Remove the wildcard `@davidorex/pi-project/*` path — enforces the named-export contract at the TypeScript level.

### Task 1.3: Verify build still produces correct dist/ files

Run `npm run build -w @davidorex/pi-project` and verify that `dist/block-api.js`, `dist/schema-validator.js`, `dist/block-validation.js`, `dist/project-dir.js`, `dist/project-sdk.js`, `dist/sync-skills.js` all exist with their `.d.ts` counterparts. The tsconfig.build.json compiles `src/**/*.ts` to `dist/` — this should already produce these files. No tsconfig changes expected.

### Verification

- `npm run build -w @davidorex/pi-project` succeeds
- `tsc --noEmit` succeeds (type checking with new paths)
- No other package builds yet (import paths not yet updated)

---

## Phase 2: Update Import Paths in pi-workflows

**Objective**: Migrate all pi-project subpath imports from `@davidorex/pi-project/src/<module>.js` to `@davidorex/pi-project/<module>` (named exports).

**Scope**: pi-workflows source files and test files (9 import sites)

**Estimated effort**: Small (mechanical find-replace)

### Task 2.1: Update source file imports

**Files and changes** (each line is a single import statement to update):

| File | Line | From | To |
|------|------|------|----|
| `packages/pi-workflows/src/workflow-executor.ts` | 7 | `@davidorex/pi-project/src/block-api.js` | `@davidorex/pi-project/block-api` |
| `packages/pi-workflows/src/workflow-executor.ts` | 8-12 | `@davidorex/pi-project/src/block-validation.js` | `@davidorex/pi-project/block-validation` |
| `packages/pi-workflows/src/workflow-executor.ts` | 13 | `@davidorex/pi-project/src/project-dir.js` | `@davidorex/pi-project/project-dir` |
| `packages/pi-workflows/src/workflow-executor.ts` | 14 | `@davidorex/pi-project/src/schema-validator.js` | `@davidorex/pi-project/schema-validator` |
| `packages/pi-workflows/src/step-agent.ts` | 6 | `@davidorex/pi-project/src/schema-validator.js` | `@davidorex/pi-project/schema-validator` |
| `packages/pi-workflows/src/index.ts` | 8 | `@davidorex/pi-project/src/sync-skills.js` | `@davidorex/pi-project/sync-skills` |

**Note on .js extension removal**: The current imports use `.js` extensions as required by Node16 module resolution for relative imports. However, subpath exports are resolved via the package's exports map, not the filesystem — the `.js` suffix is not needed and should not be included. `@davidorex/pi-project/block-api` resolves to the `"./block-api"` export entry which points to `./dist/block-api.js`.

### Task 2.2: Update test file imports

| File | Line | From | To |
|------|------|------|----|
| `packages/pi-workflows/src/graduated-failure.test.ts` | 10 | `@davidorex/pi-project/src/block-validation.js` | `@davidorex/pi-project/block-validation` |
| `packages/pi-workflows/src/block-validation.test.ts` | 10 | `@davidorex/pi-project/src/block-validation.js` | `@davidorex/pi-project/block-validation` |
| `packages/pi-workflows/src/verifier-schema.test.ts` | 4 | `@davidorex/pi-project/src/schema-validator.js` | `@davidorex/pi-project/schema-validator` |

### Verification

- `npm run build` (all packages)
- `tsc --noEmit` (full typecheck)
- `npm test -w @davidorex/pi-workflows` (all workflow tests pass)
- Biome lint passes (import ordering may change — run `npm run format` if needed)

---

## Phase 3: Dependency Model Migration

**Objective**: Move pi SDK packages from peerDependencies to dependencies across all three packages. Add pi-project as a dependency of pi-behavior-monitors. Fix the undeclared pi-ai dependency in pi-workflows.

**Scope**: package.json files for pi-project, pi-workflows, pi-behavior-monitors

**Estimated effort**: Small (JSON edits)

### Task 3.1: Migrate pi-project dependencies

**File**: `packages/pi-project/package.json`

Move from peerDependencies to dependencies:
- `@mariozechner/pi-coding-agent`: `"*"` — used in `index.ts` (truncateHead) and `sync-skills.ts` (getAgentDir)
- `@sinclair/typebox`: `"*"` — used in `index.ts` (Type)

After:
```json
"dependencies": {
  "ajv": "^8.17.1",
  "@mariozechner/pi-coding-agent": "^0.63.1",
  "@sinclair/typebox": "^0.34.48"
},
"peerDependencies": {}
```

Remove the empty `peerDependencies` field entirely after migration.

### Task 3.2: Migrate pi-workflows dependencies

**File**: `packages/pi-workflows/package.json`

Move from peerDependencies to dependencies:
- `@mariozechner/pi-coding-agent`: `"*"` — used in index.ts, workflow-executor.ts, tui.ts
- `@mariozechner/pi-tui`: `"*"` — used in index.ts (Key), tui.ts (Component, TUI)
- `@sinclair/typebox`: `"*"` — used in index.ts (Type)
- `@davidorex/pi-project`: `"^0.8.0"` — used in 6 source files + 3 test files

Add (currently undeclared):
- `@mariozechner/pi-ai`: `"*"` — used in step-monitor.ts (complete, type imports)

After:
```json
"dependencies": {
  "nunjucks": "^3.2.4",
  "yaml": "^2.7.1",
  "@davidorex/pi-project": "^0.8.0",
  "@mariozechner/pi-ai": "^0.63.1",
  "@mariozechner/pi-coding-agent": "^0.63.1",
  "@mariozechner/pi-tui": "^0.63.1",
  "@sinclair/typebox": "^0.34.48"
},
"peerDependencies": {}
```

Remove the empty `peerDependencies` field entirely.

### Task 3.3: Migrate pi-behavior-monitors dependencies and add pi-project

**File**: `packages/pi-behavior-monitors/package.json`

Move from peerDependencies to dependencies:
- `@mariozechner/pi-ai`: `"*"` — used in index.ts (complete, StringEnum, type imports)
- `@mariozechner/pi-coding-agent`: `"*"` — used in index.ts (getAgentDir, type imports)
- `@mariozechner/pi-tui`: `"*"` — used in index.ts (Box, Text)
- `@sinclair/typebox`: `"*"` — used in index.ts (Type)

Add new dependency:
- `@davidorex/pi-project`: `"^0.8.0"` — will be used for readBlock in Phase 5

After:
```json
"dependencies": {
  "nunjucks": "^3.2.4",
  "@davidorex/pi-project": "^0.8.0",
  "@mariozechner/pi-ai": "^0.63.1",
  "@mariozechner/pi-coding-agent": "^0.63.1",
  "@mariozechner/pi-tui": "^0.63.1",
  "@sinclair/typebox": "^0.34.48"
},
"peerDependencies": {}
```

Remove the empty `peerDependencies` field entirely.

### Task 3.4: Verify meta-package remains correct

**File**: `packages/pi-project-workflows/package.json`

The meta-package currently declares all three packages as dependencies. This remains correct — no changes needed. The meta-package does not declare pi SDK packages because it delegates to the child packages. After this change, each child package brings its own pi SDK deps.

### Task 3.5: Run npm install to update lockfile

After all package.json changes, run `npm install` to regenerate the lockfile and ensure workspace resolution works correctly.

### Verification

- `npm install` succeeds without warnings about unmet peer deps
- `npm run build` succeeds
- `npm test` (all 589 tests pass)
- `tsc --noEmit` succeeds

---

## Phase 4: Remove Peer Freshness Gate

**Objective**: Delete the peer freshness gate script and remove all references to it. With direct dependencies, the version is locked by npm install — no drift possible.

**Scope**: Script file, package.json check command, CLAUDE.md documentation, pi-behavior-monitors CLAUDE.md

**Estimated effort**: Small (deletions)

### Task 4.1: Delete the freshness gate script

**File**: `scripts/check-peer-freshness.js` — delete entirely.

### Task 4.2: Update root package.json check command

**File**: `package.json` (line 26)

Change from:
```json
"check": "node scripts/check-peer-freshness.js && npx @biomejs/biome check . && tsc --noEmit"
```

To:
```json
"check": "npx @biomejs/biome check . && tsc --noEmit"
```

### Task 4.3: Update CLAUDE.md — remove freshness gate documentation

**File**: `CLAUDE.md`

Five locations to update:

1. **Commands section** (around line 23): Remove the line:
   ```
   # Verify peer deps match globally installed pi (included in npm run check)
   node scripts/check-peer-freshness.js
   ```

2. **Commands section** (around line 25): Change comment on check command from:
   ```
   # Lint + typecheck + peer freshness gate (also runs as pre-commit hook)
   ```
   to:
   ```
   # Lint + typecheck (also runs as pre-commit hook)
   ```

3. **Conventions section** (around line 48): Change:
   ```
   - Husky pre-commit hook runs `npm run check` (freshness gate + biome + tsc --noEmit) before every commit
   ```
   to:
   ```
   - Husky pre-commit hook runs `npm run check` (biome + tsc --noEmit) before every commit
   ```

4. **Conventions section** (around line 50): Remove the entire bullet:
   ```
   - Peer freshness gate (`scripts/check-peer-freshness.js`): compares local `node_modules/@mariozechner/pi-coding-agent` version against globally installed pi. Fails if they differ — run `npm update` to fix. Prevents compiling against stale types while runtime loads current ones.
   ```

5. **Completion Sequence section** (around line 60): Change:
   ```
   3. **Check**: `npm run check` (freshness gate + biome + tsc)
   ```
   to:
   ```
   3. **Check**: `npm run check` (biome + tsc)
   ```

### Task 4.4: Update pi-behavior-monitors CLAUDE.md

**File**: `packages/pi-behavior-monitors/CLAUDE.md`

The Dependencies section states:
```
No runtime dependencies. Peer dependencies on pi's bundled packages (`@mariozechner/pi-ai`, `@mariozechner/pi-coding-agent`, `@mariozechner/pi-tui`, `@sinclair/typebox`).
```

Update to reflect new dependency model:
```
Runtime dependencies: nunjucks, @davidorex/pi-project, @mariozechner/pi-ai, @mariozechner/pi-coding-agent, @mariozechner/pi-tui, @sinclair/typebox.
```

### Task 4.5: Remove Key Files entry from memory

**File**: User's memory file references `scripts/check-peer-freshness.js` as a key file. The user should be informed so they can update memory if desired. (Agent should NOT modify memory files.)

### Verification

- `npm run check` succeeds (biome + tsc only)
- `git diff` shows no references to `check-peer-freshness`
- Pre-commit hook (`npm run check`) still works
- `npm test` still passes

---

## Phase 5: Migrate pi-behavior-monitors to Block API

**Objective**: Replace raw `fs.readFileSync` calls that read `.project/` files with `readBlock` from the now-available `@davidorex/pi-project/block-api` dependency.

**Scope**: `packages/pi-behavior-monitors/index.ts` — two collector functions

**Estimated effort**: Small (2 function rewrites)

### Task 5.1: Add readBlock import to index.ts

**File**: `packages/pi-behavior-monitors/index.ts`

Add import (place with other package imports, around line 15-29):
```typescript
import { readBlock } from "@davidorex/pi-project/block-api";
```

### Task 5.2: Rewrite collectProjectVision

**File**: `packages/pi-behavior-monitors/index.ts` (lines 497-509)

Current:
```typescript
function collectProjectVision(_branch: SessionEntry[]): string {
    try {
        const projectPath = path.join(process.cwd(), ".project", "project.json");
        const raw = JSON.parse(fs.readFileSync(projectPath, "utf-8"));
        const parts: string[] = [];
        if (raw.vision) parts.push(`Vision: ${raw.vision}`);
        if (raw.core_value) parts.push(`Core value: ${raw.core_value}`);
        if (raw.name) parts.push(`Project: ${raw.name}`);
        return parts.join("\n");
    } catch {
        return "";
    }
}
```

Rewrite to:
```typescript
function collectProjectVision(_branch: SessionEntry[]): string {
    try {
        const raw = readBlock(process.cwd(), "project") as Record<string, unknown>;
        const parts: string[] = [];
        if (raw.vision) parts.push(`Vision: ${raw.vision}`);
        if (raw.core_value) parts.push(`Core value: ${raw.core_value}`);
        if (raw.name) parts.push(`Project: ${raw.name}`);
        return parts.join("\n");
    } catch {
        return "";
    }
}
```

**Note**: `readBlock` returns `unknown` (the parsed JSON content of the block file). The cast to `Record<string, unknown>` maintains the same type-safety level as the original code. `readBlock` throws if the file doesn't exist, which the `catch` already handles.

### Task 5.3: Rewrite collectProjectConventions

**File**: `packages/pi-behavior-monitors/index.ts` (lines 511-522)

Current:
```typescript
function collectProjectConventions(_branch: SessionEntry[]): string {
    try {
        const confPath = path.join(process.cwd(), ".project", "conformance-reference.json");
        const raw = JSON.parse(fs.readFileSync(confPath, "utf-8"));
        if (Array.isArray(raw.items)) {
            return raw.items.map((item: Record<string, unknown>) => `- ${item.name ?? item.id}`).join("\n");
        }
        return "";
    } catch {
        return "";
    }
}
```

Rewrite to:
```typescript
function collectProjectConventions(_branch: SessionEntry[]): string {
    try {
        const raw = readBlock(process.cwd(), "conformance-reference") as Record<string, unknown>;
        if (Array.isArray(raw.items)) {
            return raw.items.map((item: Record<string, unknown>) => `- ${item.name ?? item.id}`).join("\n");
        }
        return "";
    } catch {
        return "";
    }
}
```

### Task 5.4: Update root tsconfig.json for pi-project paths used by pi-behavior-monitors

The root `tsconfig.json` paths must include the pi-project named export mappings (already done in Phase 1, Task 1.2). Verify that `tsc --noEmit` resolves the new import from pi-behavior-monitors correctly.

### Task 5.5: Evaluate remaining fs.readFileSync calls

The other `readFileSync` calls in pi-behavior-monitors (`index.ts` lines 258, 609, 622, 988) read:
- **Line 258**: monitor JSON spec files (`.monitor.json`) — NOT project blocks, no change needed
- **Lines 609, 622**: monitor pattern and instruction files — NOT project blocks, no change needed
- **Line 988**: findings output files (monitor write targets) — NOT project blocks, no change needed

These are correctly using `fs.readFileSync` because they read monitor infrastructure files, not `.project/` block files. No migration needed.

### Verification

- `npm run build` succeeds (all packages)
- `npm test` (all tests pass — pi-behavior-monitors tests use vitest with stubs for pi-ai/pi-tui/pi-coding-agent; need to verify whether readBlock import requires a new stub or whether the workspace resolution handles it)
- `tsc --noEmit` succeeds
- Manual verification: activate the monitors extension in a project with `.project/project.json` and `.project/conformance-reference.json` — the `project_vision` and `project_conventions` collectors should produce the same output as before

---

## Phase 6: Cleanup and Release

**Objective**: Final verification, version bump, and documentation sync.

**Scope**: All packages, CLAUDE.md, SKILL.md generation

### Task 6.1: Full verification pass

```bash
npm run build
npm run check
npm test
npm run skills
```

All must pass with zero failures.

### Task 6.2: Update bump-versions.js if needed

**File**: `scripts/bump-versions.js` — currently iterates over `dependencies`, `peerDependencies`, `devDependencies` for sync. After removing all peerDependencies, the iteration over that key is harmless (it simply won't find any). No change needed.

### Task 6.3: Update sync-versions.js if needed

**File**: `scripts/sync-versions.js` — same as above, iterates over all dep types. No change needed.

### Task 6.4: Commit with forensic message

Commit all changes with a message that documents:
- What was moved (peers → deps)
- What was added (pi-project dep in pi-behavior-monitors, pi-ai dep in pi-workflows)
- What was removed (wildcard export, freshness gate)
- What was migrated (raw fs reads → readBlock)
- Why (pi-mono pattern alignment, block API access, stable API contract)

### Task 6.5: Release

Run `npm run release:minor` — this is a minor release because:
- New named exports are a new public API surface (feature)
- New dependency on pi-project from pi-behavior-monitors enables new capability
- No breaking changes to existing consumers (the named exports cover all previously-used subpaths)

Minor bump — no external consumers of unlisted subpaths. pi-workflows is the only consumer and all imports are covered by the named exports.

### Task 6.6: Post-release CLAUDE.md update

After release, update the version references in CLAUDE.md if any are hardcoded (the `^0.8.0` references in the plan are illustrative — the actual version will be whatever the release produces).

### Verification

- `git log --oneline -1` shows the release commit
- `git tag -l` includes the new version tag
- `npm pack --dry-run -w @davidorex/pi-project` shows the expected files
- `npm pack --dry-run -w @davidorex/pi-behavior-monitors` shows the expected files

---

## Target State (after)

### Package dependency graph (after)

```
@davidorex/pi-project@0.9.0
  dependencies: ajv, @mariozechner/pi-coding-agent, @sinclair/typebox
  exports: "." + 6 named subpath exports

@davidorex/pi-workflows@0.9.0
  dependencies: nunjucks, yaml, @davidorex/pi-project, @mariozechner/pi-ai, @mariozechner/pi-coding-agent, @mariozechner/pi-tui, @sinclair/typebox

@davidorex/pi-behavior-monitors@0.9.0
  dependencies: nunjucks, @davidorex/pi-project, @mariozechner/pi-ai, @mariozechner/pi-coding-agent, @mariozechner/pi-tui, @sinclair/typebox

@davidorex/pi-project-workflows@0.9.0 (meta-package, unchanged structure)
  dependencies: @davidorex/pi-project, @davidorex/pi-workflows, @davidorex/pi-behavior-monitors
```

### What was eliminated

- Wildcard subpath export (`"./src/*.js"`) — replaced with 6 named exports
- All peerDependencies across all 3 packages
- Peer freshness gate script and all references
- Raw `fs.readFileSync` of `.project/` files in pi-behavior-monitors (2 sites)
- Undeclared pi-ai dependency bug in pi-workflows

### What this enables (downstream plans)

- **Plan 2 (block step type)**: pi-behavior-monitors can now import block-api, schema-validator, etc. from pi-project — enabling a `block:` step type that reads/writes project blocks within workflow steps
- **Plan 3 (judgment step restructuring)**: The 56 block API bypass instances in workflow YAML files can be replaced with structured block operations once the block step type exists
