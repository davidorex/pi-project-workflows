# Dependency Alignment Plan: pi-mono Pattern Migration

Aligns the monorepo dependency model with pi-mono conventions: dependencies instead of peerDependencies, named subpath exports, declared transitive deps, readBlock migration. Minor version bump (0.8.0 -> 0.9.0).

---

## Phase 1: Package.json Dependency Model

All four workspace packages are modified. Every `peerDependencies` block is deleted. Platform packages move to `dependencies` with pinned caret ranges.

### Task 1.1: pi-project/package.json — peers to deps

**File:** `packages/pi-project/package.json`

**Remove** (lines 52-55):
```json
"peerDependencies": {
    "@mariozechner/pi-coding-agent": "*",
    "@sinclair/typebox": "*"
}
```

**Add** to existing `"dependencies"` block (after `"ajv": "^8.17.1"`):
```json
"dependencies": {
    "ajv": "^8.17.1",
    "@mariozechner/pi-coding-agent": "^0.63.1",
    "@sinclair/typebox": "^0.34.48"
}
```

### Task 1.2: pi-workflows/package.json — peers to deps, add pi-ai

**File:** `packages/pi-workflows/package.json`

**Remove** entire `peerDependencies` block (lines 46-51):
```json
"peerDependencies": {
    "@mariozechner/pi-coding-agent": "*",
    "@mariozechner/pi-tui": "*",
    "@sinclair/typebox": "*",
    "@davidorex/pi-project": "^0.8.0"
}
```

**Replace** `dependencies` block (lines 43-46) with:
```json
"dependencies": {
    "nunjucks": "^3.2.4",
    "yaml": "^2.7.1",
    "@mariozechner/pi-coding-agent": "^0.63.1",
    "@mariozechner/pi-ai": "^0.63.1",
    "@mariozechner/pi-tui": "^0.63.1",
    "@sinclair/typebox": "^0.34.48",
    "@davidorex/pi-project": "^0.8.0"
}
```

Note: `@mariozechner/pi-ai` is currently undeclared — `step-monitor.ts` lines 13-14 import `complete` and types from it. This task declares it.

### Task 1.3: pi-behavior-monitors/package.json — peers to deps, add pi-project

**File:** `packages/pi-behavior-monitors/package.json`

**Remove** entire `peerDependencies` block (lines 45-50):
```json
"peerDependencies": {
    "@mariozechner/pi-ai": "*",
    "@mariozechner/pi-coding-agent": "*",
    "@mariozechner/pi-tui": "*",
    "@sinclair/typebox": "*"
}
```

**Replace** `dependencies` block (lines 43-45) with:
```json
"dependencies": {
    "nunjucks": "^3.2.4",
    "@mariozechner/pi-ai": "^0.63.1",
    "@mariozechner/pi-coding-agent": "^0.63.1",
    "@mariozechner/pi-tui": "^0.63.1",
    "@sinclair/typebox": "^0.34.48",
    "@davidorex/pi-project": "^0.8.0"
}
```

Note: `@davidorex/pi-project` is a new dependency — needed for Phase 4 (readBlock migration).

### Task 1.4: pi-project-workflows/package.json — no changes needed

**File:** `packages/pi-project-workflows/package.json`

Already has only `dependencies` (no peerDependencies). The `@davidorex/*` refs at `^0.8.0` will be bumped by the release script at the end.

---

## Phase 2: Named Subpath Exports

Replace the wildcard `"./src/*.js"` export with named per-module subpath entries. Each entry corresponds to a source module that pi-workflows imports via subpath.

### Task 2.1: Replace wildcard exports map in pi-project/package.json

**File:** `packages/pi-project/package.json`

**Replace** the `exports` block (lines 19-27):
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

**With:**
```json
"exports": {
    ".": {
        "types": "./dist/index.d.ts",
        "default": "./dist/index.js"
    },
    "./src/schema-validator.js": {
        "types": "./dist/schema-validator.d.ts",
        "default": "./dist/schema-validator.js"
    },
    "./src/block-api.js": {
        "types": "./dist/block-api.d.ts",
        "default": "./dist/block-api.js"
    },
    "./src/block-validation.js": {
        "types": "./dist/block-validation.d.ts",
        "default": "./dist/block-validation.js"
    },
    "./src/project-dir.js": {
        "types": "./dist/project-dir.d.ts",
        "default": "./dist/project-dir.js"
    },
    "./src/sync-skills.js": {
        "types": "./dist/sync-skills.d.ts",
        "default": "./dist/sync-skills.js"
    }
}
```

These 5 subpaths are the exact set imported by `packages/pi-workflows/src/`:
- `schema-validator.js` — imported by `step-agent.ts`, `workflow-executor.ts`, `verifier-schema.test.ts`
- `block-api.js` — imported by `workflow-executor.ts`
- `block-validation.js` — imported by `workflow-executor.ts`, `block-validation.test.ts`, `graduated-failure.test.ts`
- `project-dir.js` — imported by `workflow-executor.ts`
- `sync-skills.js` — imported by `index.ts`

### Task 2.2: Replace wildcard tsconfig paths with per-subpath mappings

**File:** `tsconfig.json`

**Replace** (lines 6-9):
```json
"@davidorex/pi-project": ["./packages/pi-project/src/index.ts"],
"@davidorex/pi-project/*": ["./packages/pi-project/*"],
```

**With:**
```json
"@davidorex/pi-project": ["./packages/pi-project/src/index.ts"],
"@davidorex/pi-project/src/schema-validator.js": ["./packages/pi-project/src/schema-validator.ts"],
"@davidorex/pi-project/src/block-api.js": ["./packages/pi-project/src/block-api.ts"],
"@davidorex/pi-project/src/block-validation.js": ["./packages/pi-project/src/block-validation.ts"],
"@davidorex/pi-project/src/project-dir.js": ["./packages/pi-project/src/project-dir.ts"],
"@davidorex/pi-project/src/sync-skills.js": ["./packages/pi-project/src/sync-skills.ts"],
```

Also remove the wildcard mappings for the other packages (lines 10-11):
```json
"@davidorex/pi-workflows/*": ["./packages/pi-workflows/*"],
"@davidorex/pi-behavior-monitors/*": ["./packages/pi-behavior-monitors/*"]
```

These wildcards are unused — no cross-package subpath imports target pi-workflows or pi-behavior-monitors. Final `paths` block:
```json
"paths": {
    "@davidorex/pi-project": ["./packages/pi-project/src/index.ts"],
    "@davidorex/pi-project/src/schema-validator.js": ["./packages/pi-project/src/schema-validator.ts"],
    "@davidorex/pi-project/src/block-api.js": ["./packages/pi-project/src/block-api.ts"],
    "@davidorex/pi-project/src/block-validation.js": ["./packages/pi-project/src/block-validation.ts"],
    "@davidorex/pi-project/src/project-dir.js": ["./packages/pi-project/src/project-dir.ts"],
    "@davidorex/pi-project/src/sync-skills.js": ["./packages/pi-project/src/sync-skills.ts"],
    "@davidorex/pi-workflows": ["./packages/pi-workflows/src/index.ts"],
    "@davidorex/pi-behavior-monitors": ["./packages/pi-behavior-monitors/index.ts"]
}
```

---

## Phase 3: Remove Peer Freshness Gate

Delete the script, remove all references from root package.json, CLAUDE.md, and README.md.

### Task 3.1: Delete check-peer-freshness.js

**File:** `scripts/check-peer-freshness.js`

Delete this file entirely.

### Task 3.2: Remove freshness gate from root check script

**File:** `package.json` (root)

**Replace** (line 26):
```json
"check": "node scripts/check-peer-freshness.js && npx @biomejs/biome check . && tsc --noEmit",
```

**With:**
```json
"check": "npx @biomejs/biome check . && tsc --noEmit",
```

### Task 3.3: Remove freshness gate references from CLAUDE.md

**File:** `CLAUDE.md`

Six changes:

1. **Line 23** — Replace:
   ```
   # Lint + typecheck + peer freshness gate (also runs as pre-commit hook)
   ```
   With:
   ```
   # Lint + typecheck (also runs as pre-commit hook)
   ```

2. **Lines 28-30** — Remove these three lines entirely:
   ```
   # Verify peer deps match globally installed pi (included in npm run check)
   node scripts/check-peer-freshness.js
   ```
   (blank line before + the comment + the command)

3. **Line 48** — Replace:
   ```
   - Husky pre-commit hook runs `npm run check` (freshness gate + biome + tsc --noEmit) before every commit
   ```
   With:
   ```
   - Husky pre-commit hook runs `npm run check` (biome + tsc --noEmit) before every commit
   ```

4. **Line 50** — Remove this entire line:
   ```
   - Peer freshness gate (`scripts/check-peer-freshness.js`): compares local `node_modules/@mariozechner/pi-coding-agent` version against globally installed pi. Fails if they differ — run `npm update` to fix. Prevents compiling against stale types while runtime loads current ones.
   ```

5. **Line 60** — Replace:
   ```
   3. **Check**: `npm run check` (freshness gate + biome + tsc)
   ```
   With:
   ```
   3. **Check**: `npm run check` (biome + tsc)
   ```

### Task 3.4: Remove freshness gate references from README.md

**File:** `README.md`

Two changes:

1. **Line 125** — Replace:
   ```
   npm run check      # peer freshness gate + lint + typecheck
   ```
   With:
   ```
   npm run check      # lint + typecheck
   ```

2. **Line 150** — Remove this entire line:
   ```
   - **Peer freshness gate** — `npm run check` verifies local `node_modules/@mariozechner/pi-coding-agent` matches the globally installed pi version. Prevents compiling against stale types.
   ```

---

## Phase 4: Migrate pi-behavior-monitors .project/ Reads to readBlock

Two functions in `packages/pi-behavior-monitors/index.ts` use raw `fs.readFileSync` to read `.project/` block files. Migrate them to `readBlock` from `@davidorex/pi-project/src/block-api.js`.

### Task 4.1: Add block-api import to pi-behavior-monitors/index.ts

**File:** `packages/pi-behavior-monitors/index.ts`

Add after the existing import block (after line ~29, after the `@sinclair/typebox` import):
```typescript
import { readBlock } from "@davidorex/pi-project/src/block-api.js";
```

Note: This import uses the named subpath export defined in Phase 2, Task 2.1. The pi-project dependency was added in Phase 1, Task 1.3.

### Task 4.2: Migrate collectProjectVision to readBlock

**File:** `packages/pi-behavior-monitors/index.ts`

**Replace** `collectProjectVision` function (lines 497-508):
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

**With:**
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

### Task 4.3: Migrate collectProjectConventions to readBlock

**File:** `packages/pi-behavior-monitors/index.ts`

**Replace** `collectProjectConventions` function (lines 511-521):
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

**With:**
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

### Task 4.4: Add subpath export for block-api.js to pi-project exports

This is already handled in Phase 2, Task 2.1. The named export `"./src/block-api.js"` is included there. No additional task needed.

### Task 4.5: Add tsconfig path for pi-behavior-monitors subpath import resolution

The pi-behavior-monitors vitest config (at `packages/pi-behavior-monitors/vitest.config.ts`) already stubs `@mariozechner/*` but does not stub `@davidorex/pi-project`. Since pi-behavior-monitors uses `vitest` (not `tsx --test`), module resolution for `@davidorex/pi-project/src/block-api.js` must resolve correctly.

In the monorepo workspace, npm workspaces symlink `@davidorex/pi-project` into `node_modules`, and the named export will resolve through that symlink to `dist/block-api.js`. This works if pi-project is built before pi-behavior-monitors tests run. The existing root `npm run build` command already builds pi-project first. No vitest config change needed.

However, the root `tsconfig.json` needs no additional path for this — the `@davidorex/pi-behavior-monitors` barrel path already resolves via the existing entry. The subpath `@davidorex/pi-project/src/block-api.js` path added in Task 2.2 covers typecheck resolution.

---

## Phase 5: Update Documentation References

### Task 5.1: Update pi-behavior-monitors CLAUDE.md

**File:** `packages/pi-behavior-monitors/CLAUDE.md`

**Replace** (line 48):
```
No runtime dependencies. Peer dependencies on pi's bundled packages (`@mariozechner/pi-ai`, `@mariozechner/pi-coding-agent`, `@mariozechner/pi-tui`, `@sinclair/typebox`).
```

**With:**
```
Runtime dependencies: `nunjucks`, `@mariozechner/pi-ai`, `@mariozechner/pi-coding-agent`, `@mariozechner/pi-tui`, `@sinclair/typebox`, `@davidorex/pi-project`. No peerDependencies.
```

### Task 5.2: Update root README.md architecture line about peer dep

**File:** `README.md`

**Replace** (line 152):
```
- **pi-workflows depends on pi-project** as a peer dependency. pi-project has no knowledge of workflows. pi-behavior-monitors is independent of both.
```

**With:**
```
- **pi-workflows depends on pi-project** as a direct dependency. pi-project has no knowledge of workflows. pi-behavior-monitors depends on pi-project for block reads.
```

---

## Phase 6: Build, Check, Test, Release

### Task 6.1: npm install

Run `npm install` to regenerate `package-lock.json` with the new dependency structure (peers removed, deps added).

### Task 6.2: Build

Run `npm run build` — must pass. This compiles all three packages in dependency order.

### Task 6.3: Check

Run `npm run check` — must pass. Now runs only `biome check . && tsc --noEmit` (no freshness gate).

### Task 6.4: Test

Run `npm test` — must pass with 589+ tests, 0 failures.

### Task 6.5: Skills

Run `npm run skills` — regenerate SKILL.md files from built extensions.

### Task 6.6: Commit

Forensic commit with message describing the dependency model alignment.

### Task 6.7: Release

Run `npm run release:minor` — bumps 0.8.0 -> 0.9.0 across all packages, commits, tags.

---

## Verification Checklist

After execution, all of the following must hold:

```bash
# Build passes
npm run build

# Check passes (no freshness gate in pipeline)
npm run check

# All tests pass
npm test
# Expected: 589+ tests, 0 failures

# No peerDependencies in any package
grep -rn 'peerDependencies' packages/*/package.json
# Expected: 0 matches

# No freshness gate references anywhere
grep -rn 'check-peer-freshness' .
# Expected: 0 matches (excluding prompts/)

# No wildcard subpath imports from pi-project
grep -rn 'from "@davidorex/pi-project/src/' packages/pi-workflows/src/
# Expected: matches use named subpaths that resolve through exports map

# No raw fs.readFileSync for .project/ in pi-behavior-monitors
grep -rn 'fs.readFileSync.*\.project' packages/pi-behavior-monitors/
# Expected: 0 matches

# @mariozechner/pi-ai declared in pi-workflows
grep '"@mariozechner/pi-ai"' packages/pi-workflows/package.json
# Expected: 1 match in dependencies
```

---

## File Inventory

Files modified:
- `packages/pi-project/package.json`
- `packages/pi-workflows/package.json`
- `packages/pi-behavior-monitors/package.json`
- `packages/pi-behavior-monitors/index.ts`
- `packages/pi-behavior-monitors/CLAUDE.md`
- `tsconfig.json`
- `package.json` (root)
- `CLAUDE.md`
- `README.md`

Files deleted:
- `scripts/check-peer-freshness.js`

Files unchanged:
- `packages/pi-project-workflows/package.json` (no peers to remove; inter-package refs bumped by release script)
- `scripts/bump-versions.js` (iterates depTypes including peerDependencies — benign no-op when absent)
- `scripts/sync-versions.js` (same — benign no-op)
- `.github/workflows/ci.yml` (calls `npm run check` which is already updated)
- `.husky/pre-commit` (calls `npm run check` which is already updated)
