# Block Step Type — Implementation Plan

## Overview

A new `block` step type that runs in-process (like `transform`) to read and write `.project/` block files through the block API. Eliminates the need for command steps that spawn `node -e` subprocesses for mechanical block I/O. All block API guarantees (schema validation, atomic writes, `PROJECT_DIR` indirection) flow through automatically.

**Prerequisite:** Plan 1 (dep alignment) complete. `@davidorex/pi-project` is a direct dependency of `pi-workflows` with named exports available via `@davidorex/pi-project/src/block-api.js` and `@davidorex/pi-project/src/project-dir.js`.

---

## Phase 1: Types and Registry

### Task 1.1: Add `BlockSpec` and `BlockOperation` types to `types.ts`

**File:** `packages/pi-workflows/src/types.ts`

Add after the `TransformSpec` interface:

```typescript
export interface BlockSpec {
  read?: BlockReadSpec[];
  readDir?: string;
  write?: BlockWriteSpec;
  append?: BlockAppendSpec;
  update?: BlockUpdateSpec;
}

export interface BlockReadSpec {
  name: string;
  optional?: boolean;
}

export interface BlockWriteSpec {
  name: string;
  data: unknown; // ${{ }} expression
  path?: string; // subdirectory override (e.g. "phases")
}

export interface BlockAppendSpec {
  name: string;
  arrayKey: string;
  item: unknown; // ${{ }} expression
}

export interface BlockUpdateSpec {
  name: string;
  arrayKey: string;
  match: Record<string, unknown>; // field-value pairs for predicate, values may be ${{ }} expressions
  set: Record<string, unknown>; // field-value pairs for updates, values may be ${{ }} expressions
}
```

Add `block?: BlockSpec;` to the `StepSpec` interface, in the same position as the other step-type fields (after `transform`, before `parallel`).

Update the `StepSpec` comment to include `block` in the "exactly one of" list.

### Task 1.2: Register block in `STEP_TYPES`

**File:** `packages/pi-workflows/src/workflow-spec.ts`

Add to the `STEP_TYPES` array:

```typescript
{ name: "block", field: "block", retryable: false, supportsInput: false, supportsOutput: true },
```

Place it after the `transform` entry (index 3), before `loop`. The `retryable: false` because block operations are deterministic. `supportsInput: false` because data comes from the block spec itself (expressions resolved from scope). `supportsOutput: true` because read operations produce structured output.

### Task 1.3: Add `block` parsing to `validateStep` in `workflow-spec.ts`

**File:** `packages/pi-workflows/src/workflow-spec.ts`

Add a parsing block after the transform section (after the `if (hasTransform)` block, before `if (hasLoop)`). The parser handles all five operations:

```typescript
// Block step
if (hasBlock) {
  if (typeof rawStep.block !== "object" || rawStep.block === null || Array.isArray(rawStep.block)) {
    throw new WorkflowSpecError(filePath, `step '${stepName}' block must be an object`);
  }
  const rawBlock = rawStep.block as Record<string, unknown>;

  // Exactly one operation
  const ops = ["read", "readDir", "write", "append", "update"].filter(
    (op) => op in rawBlock && rawBlock[op] !== undefined,
  );
  if (ops.length === 0) {
    throw new WorkflowSpecError(
      filePath,
      `step '${stepName}' block must have exactly one of: read, readDir, write, append, update`,
    );
  }
  if (ops.length > 1) {
    throw new WorkflowSpecError(
      filePath,
      `step '${stepName}' block must have exactly one of: read, readDir, write, append, update`,
    );
  }

  const block: BlockSpec = {};

  if (ops[0] === "read") {
    if (!Array.isArray(rawBlock.read)) {
      throw new WorkflowSpecError(filePath, `step '${stepName}' block.read must be an array`);
    }
    block.read = [];
    for (const item of rawBlock.read) {
      if (typeof item === "string") {
        block.read.push({ name: item });
      } else if (typeof item === "object" && item !== null && !Array.isArray(item)) {
        const obj = item as Record<string, unknown>;
        if (typeof obj.name !== "string") {
          throw new WorkflowSpecError(filePath, `step '${stepName}' block.read item must have a 'name' string`);
        }
        block.read.push({
          name: obj.name,
          optional: obj.optional === true ? true : undefined,
        });
      } else {
        throw new WorkflowSpecError(
          filePath,
          `step '${stepName}' block.read items must be strings or objects with 'name'`,
        );
      }
    }
  }

  if (ops[0] === "readDir") {
    if (typeof rawBlock.readDir !== "string") {
      throw new WorkflowSpecError(filePath, `step '${stepName}' block.readDir must be a string`);
    }
    block.readDir = rawBlock.readDir;
  }

  if (ops[0] === "write") {
    if (typeof rawBlock.write !== "object" || rawBlock.write === null || Array.isArray(rawBlock.write)) {
      throw new WorkflowSpecError(filePath, `step '${stepName}' block.write must be an object`);
    }
    const rawWrite = rawBlock.write as Record<string, unknown>;
    if (typeof rawWrite.name !== "string") {
      throw new WorkflowSpecError(filePath, `step '${stepName}' block.write must have a 'name' string`);
    }
    if (!("data" in rawWrite)) {
      throw new WorkflowSpecError(filePath, `step '${stepName}' block.write must have a 'data' field`);
    }
    block.write = {
      name: rawWrite.name,
      data: rawWrite.data,
      path: typeof rawWrite.path === "string" ? rawWrite.path : undefined,
    };
  }

  if (ops[0] === "append") {
    if (typeof rawBlock.append !== "object" || rawBlock.append === null || Array.isArray(rawBlock.append)) {
      throw new WorkflowSpecError(filePath, `step '${stepName}' block.append must be an object`);
    }
    const rawAppend = rawBlock.append as Record<string, unknown>;
    if (typeof rawAppend.name !== "string") {
      throw new WorkflowSpecError(filePath, `step '${stepName}' block.append must have a 'name' string`);
    }
    if (typeof rawAppend.arrayKey !== "string") {
      throw new WorkflowSpecError(filePath, `step '${stepName}' block.append must have an 'arrayKey' string`);
    }
    if (!("item" in rawAppend)) {
      throw new WorkflowSpecError(filePath, `step '${stepName}' block.append must have an 'item' field`);
    }
    block.append = {
      name: rawAppend.name,
      arrayKey: rawAppend.arrayKey,
      item: rawAppend.item,
    };
  }

  if (ops[0] === "update") {
    if (typeof rawBlock.update !== "object" || rawBlock.update === null || Array.isArray(rawBlock.update)) {
      throw new WorkflowSpecError(filePath, `step '${stepName}' block.update must be an object`);
    }
    const rawUpdate = rawBlock.update as Record<string, unknown>;
    if (typeof rawUpdate.name !== "string") {
      throw new WorkflowSpecError(filePath, `step '${stepName}' block.update must have a 'name' string`);
    }
    if (typeof rawUpdate.arrayKey !== "string") {
      throw new WorkflowSpecError(filePath, `step '${stepName}' block.update must have an 'arrayKey' string`);
    }
    if (typeof rawUpdate.match !== "object" || rawUpdate.match === null || Array.isArray(rawUpdate.match)) {
      throw new WorkflowSpecError(filePath, `step '${stepName}' block.update must have a 'match' object`);
    }
    if (typeof rawUpdate.set !== "object" || rawUpdate.set === null || Array.isArray(rawUpdate.set)) {
      throw new WorkflowSpecError(filePath, `step '${stepName}' block.update must have a 'set' object`);
    }
    block.update = {
      name: rawUpdate.name,
      arrayKey: rawUpdate.arrayKey,
      match: rawUpdate.match as Record<string, unknown>,
      set: rawUpdate.set as Record<string, unknown>,
    };
  }

  step.block = block;
}
```

Also update the `const hasBlock = presentTypes[0].field === "block";` line in the existing `hasAgent/hasGate/...` declaration block.

Add `BlockSpec` to the import from `./types.js`.

---

## Phase 2: Step Executor

### Task 2.1: Create `step-block.ts`

**File:** `packages/pi-workflows/src/step-block.ts` (new file)

This executor follows the `step-transform.ts` pattern: synchronous, in-process, no LLM, no subprocess. It imports from `@davidorex/pi-project/src/block-api.js` and `@davidorex/pi-project/src/project-dir.js`.

```typescript
/**
 * Block step executor — reads and writes .project/ block files via the block API.
 * No LLM call, no subprocess — synchronous in-process execution.
 */

import fs from "node:fs";
import path from "node:path";
import { readBlock, writeBlock, appendToBlock, updateItemInBlock } from "@davidorex/pi-project/src/block-api.js";
import { PROJECT_DIR } from "@davidorex/pi-project/src/project-dir.js";
import { resolveExpressions } from "./expression.js";
import { persistStepOutput } from "./output.js";
import { zeroUsage } from "./step-shared.js";
import type { BlockSpec, StepResult } from "./types.js";

/**
 * Execute a block step: reads or writes .project/ block files through the block API.
 *
 * Operations:
 * - read: reads one or more blocks, returns { blockName: data, ... }
 * - readDir: reads all .json files from a .project/ subdirectory, returns array
 * - write: writes a block file (schema validated, atomic)
 * - append: appends an item to an array within a block
 * - update: updates an item in an array within a block by predicate match
 */
export function executeBlock(
  block: BlockSpec,
  stepName: string,
  scope: Record<string, unknown>,
  cwd: string,
  runDir?: string,
  outputPath?: string,
): StepResult {
  const startTime = Date.now();
  try {
    let output: unknown;

    if (block.read) {
      const result: Record<string, unknown> = {};
      for (const spec of block.read) {
        try {
          result[spec.name] = readBlock(cwd, spec.name);
        } catch (err) {
          if (spec.optional) {
            result[spec.name] = null;
          } else {
            throw err;
          }
        }
      }
      output = result;
    } else if (block.readDir !== undefined) {
      const dirPath = path.join(cwd, PROJECT_DIR, block.readDir);
      if (!fs.existsSync(dirPath)) {
        output = [];
      } else {
        const files = fs.readdirSync(dirPath).filter((f) => f.endsWith(".json")).sort();
        const items: unknown[] = [];
        for (const file of files) {
          const filePath = path.join(dirPath, file);
          const content = fs.readFileSync(filePath, "utf-8");
          items.push(JSON.parse(content));
        }
        output = items;
      }
    } else if (block.write) {
      const resolvedData = resolveExpressions(block.write.data, scope);
      if (block.write.path) {
        // Subdirectory write: schema resolved from name, path determines directory
        const subDir = path.join(cwd, PROJECT_DIR, block.write.path);
        fs.mkdirSync(subDir, { recursive: true });
        // The name is used as the filename within the subdirectory
        // Resolve name through expressions in case it contains ${{ }}
        const resolvedName = typeof block.write.name === "string" && block.write.name.includes("${{")
          ? String(resolveExpressions(block.write.name, scope))
          : block.write.name;
        const filePath = path.join(subDir, `${resolvedName}.json`);
        // Use writeBlock for schema validation (schema resolved from the base name)
        // For subdirectory writes, we write directly but validate against the schema if present
        const schemaDir = path.join(cwd, PROJECT_DIR, "schemas");
        const schemaFile = path.join(schemaDir, `${block.write.name.replace(/\$\{\{.*?\}\}/g, "").trim()}.schema.json`);
        if (fs.existsSync(schemaFile)) {
          const { validateFromFile } = await import("@davidorex/pi-project/src/schema-validator.js");
          validateFromFile(schemaFile, resolvedData, `block file '${resolvedName}.json'`);
        }
        const tmpPath = `${filePath}.block-step-${process.pid}.tmp`;
        fs.writeFileSync(tmpPath, JSON.stringify(resolvedData, null, 2), "utf-8");
        fs.renameSync(tmpPath, filePath);
        output = { path: filePath };
      } else {
        writeBlock(cwd, block.write.name, resolvedData);
        output = { written: block.write.name };
      }
    } else if (block.append) {
      const resolvedItem = resolveExpressions(block.append.item, scope);
      appendToBlock(cwd, block.append.name, block.append.arrayKey, resolvedItem);
      output = { appended: block.append.name, arrayKey: block.append.arrayKey };
    } else if (block.update) {
      const resolvedMatch = resolveExpressions(block.update.match, scope) as Record<string, unknown>;
      const resolvedSet = resolveExpressions(block.update.set, scope) as Record<string, unknown>;
      const predicate = (item: Record<string, unknown>) => {
        for (const [key, value] of Object.entries(resolvedMatch)) {
          if (item[key] !== value) return false;
        }
        return true;
      };
      updateItemInBlock(cwd, block.update.name, block.update.arrayKey, predicate, resolvedSet);
      output = { updated: block.update.name, arrayKey: block.update.arrayKey };
    } else {
      throw new Error("Block step has no operation (read, readDir, write, append, update)");
    }

    const result: StepResult = {
      step: stepName,
      agent: "block",
      status: "completed",
      output,
      textOutput: JSON.stringify(output, null, 2),
      usage: zeroUsage(),
      durationMs: Date.now() - startTime,
    };
    if (runDir) {
      result.outputPath = persistStepOutput(runDir, stepName, output, undefined, outputPath);
    }
    return result;
  } catch (err) {
    return {
      step: stepName,
      agent: "block",
      status: "failed",
      usage: zeroUsage(),
      durationMs: Date.now() - startTime,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
```

**Important design note on subdirectory writes:** The `path` override case needs refinement. Since `executeBlock` must be synchronous (like `executeTransform`), and `validateFromFile` from `block-api.ts` is synchronous, the dynamic import shown above will not work. The actual implementation must use a static import:

```typescript
import { validateFromFile } from "@davidorex/pi-project/src/schema-validator.js";
```

at the top of the file (alongside the other pi-project imports). The code in the `block.write.path` branch then calls `validateFromFile(schemaFile, resolvedData, ...)` directly without `await`.

**Schema resolution for subdirectory writes:** When `block.write.path` is set (e.g., `path: "phases"`), the schema name is derived from a convention. The `write.name` field will typically be an expression like `${{ ... | padStart }}...` that resolves to a filename. The schema is resolved from the *directory name* as the block type. For `path: "phases"`, the schema is `.project/schemas/phase.schema.json` (singular). This requires the `name` field in BlockWriteSpec to serve two roles: the filename (after expression resolution) and the schema lookup key (the raw base name).

**Refined approach:** Split the concern. The `write` operation for subdirectory blocks takes:
- `name`: the schema name (e.g., `"phase"`) — used for schema resolution
- `path`: the subdirectory (e.g., `"phases"`) — determines target directory
- `filename`: expression resolving to the file's base name (e.g., `"${{ ... }}"`) — determines the `.json` filename within `path`
- `data`: the data to write

Updated `BlockWriteSpec`:

```typescript
export interface BlockWriteSpec {
  name: string;      // block/schema name (e.g. "gaps", "phase")
  data: unknown;     // ${{ }} expression for the data
  path?: string;     // subdirectory within .project/ (e.g. "phases")
  filename?: string; // filename expression for subdirectory writes (e.g. "${{ ... }}")
}
```

When `path` is set, `filename` is required and determines the `.json` file basename. Schema validation uses `name`. When `path` is absent, `writeBlock(cwd, name, data)` is called directly (top-level block write).

The parsing in `validateStep` enforces: if `path` is present, `filename` must also be present.

### Task 2.2: Wire block executor into `executeStepByType`

**File:** `packages/pi-workflows/src/workflow-executor.ts`

Add import at top:

```typescript
import { executeBlock } from "./step-block.js";
```

Add dispatch block after the `// ── Transform step ──` section and before `// ── Loop step ──`:

```typescript
// ── Block step ──
if (stepSpec.block) {
  const resolvedBlockOutputPath = stepSpec.output?.path
    ? String(resolveExpressions(stepSpec.output.path, scope))
    : undefined;
  const blockResult = executeBlock(stepSpec.block, stepName, scope, ctx.cwd, runDir, resolvedBlockOutputPath);
  persistStep(state, stepName, blockResult, runDir, widgetState, ctx);
  if (blockResult.status === "failed") {
    state.status = "failed";
    return false;
  }
  return true;
}
```

### Task 2.3: Add block to `isRetryableStepType`

**File:** `packages/pi-workflows/src/workflow-executor.ts`

Update the `isRetryableStepType` function to include `stepSpec.block`:

```typescript
function isRetryableStepType(stepSpec: StepSpec): boolean {
  if (stepSpec.command || stepSpec.gate || stepSpec.transform || stepSpec.monitor || stepSpec.block) return false;
  return true;
}
```

---

## Phase 3: Expression Filters

### Task 3.1: Add `find`, `filter`, `padStart`, `slugify` filters to `expression.ts`

**File:** `packages/pi-workflows/src/expression.ts`

Add four new entries to the `FILTERS` record:

```typescript
const FILTERS: Record<string, (value: unknown, ...args: unknown[]) => unknown> = {
  // ... existing filters ...
  find: (v, ...args) => {
    // find filter: ${{ steps.load.output.gaps | find('id', input.gap_id) }}
    // For expression-level use, this operates on pre-resolved values.
    // In practice, the find filter takes an array and returns the first item
    // matching a field/value pair. The args are resolved by the caller.
    // Simple mode: ${{ arrayExpr | find }} — not useful
    // This requires argument support in the filter pipeline (see below).
    if (!Array.isArray(v)) return undefined;
    return v.find(Boolean); // fallback: first truthy element
  },
  padStart: (v, ...args) => {
    const str = String(v);
    const len = typeof args[0] === "number" ? args[0] : 2;
    const fill = typeof args[1] === "string" ? args[1] : "0";
    return str.padStart(len, fill);
  },
  slugify: (v) => {
    return String(v).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "").replace(/^-+/, "");
  },
};
```

**Filter argument syntax:** The existing filter system uses `${{ expr | filterName }}` with no arguments. The `find` and `padStart` filters need arguments. Extend the filter resolution to support `${{ expr | filterName(arg1, arg2) }}`:

Update `resolveExpression` to parse filter arguments:

```typescript
// Parse optional filter: "path | filterName" or "path | filterName(arg1, arg2)"
const pipeIdx = expr.indexOf("|");
let pathExpr: string;
let filterName: string | undefined;
let filterArgs: unknown[] = [];
if (pipeIdx !== -1) {
  pathExpr = expr.slice(0, pipeIdx).trim();
  const filterExpr = expr.slice(pipeIdx + 1).trim();
  const parenIdx = filterExpr.indexOf("(");
  if (parenIdx !== -1 && filterExpr.endsWith(")")) {
    filterName = filterExpr.slice(0, parenIdx).trim();
    const argsStr = filterExpr.slice(parenIdx + 1, -1).trim();
    if (argsStr.length > 0) {
      // Parse comma-separated arguments, resolving each against scope
      filterArgs = argsStr.split(",").map((a) => {
        const trimmed = a.trim();
        // String literals
        if ((trimmed.startsWith("'") && trimmed.endsWith("'")) ||
            (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
          return trimmed.slice(1, -1);
        }
        // Number literals
        const num = Number(trimmed);
        if (!Number.isNaN(num) && trimmed !== "") return num;
        // Expression path (resolve against scope)
        return resolveExpression(trimmed, scope);
      });
    }
  } else {
    filterName = filterExpr;
  }
} else {
  pathExpr = expr;
}
```

And update the filter invocation:

```typescript
if (filterName) {
  const filterFn = FILTERS[filterName];
  if (!filterFn) {
    throw new ExpressionError(expr, `unknown filter '${filterName}'`);
  }
  current = filterFn(current, ...filterArgs);
}
```

**Updated FILTERS with argument support:**

```typescript
const FILTERS: Record<string, (value: unknown, ...args: unknown[]) => unknown> = {
  duration: (v) => formatDuration(Number(v)),
  currency: (v) => formatCost(Number(v)),
  json: (v) => JSON.stringify(v, null, 2),
  length: (v) => (Array.isArray(v) ? v.length : typeof v === "string" ? v.length : 0),
  keys: (v) => (typeof v === "object" && v !== null ? Object.keys(v) : []),
  filter: (v) => (Array.isArray(v) ? v.filter(Boolean) : v),
  find: (v, key, value) => {
    if (!Array.isArray(v)) return undefined;
    if (key === undefined) return v.find(Boolean);
    return v.find((item) =>
      typeof item === "object" && item !== null && (item as Record<string, unknown>)[String(key)] === value,
    );
  },
  padStart: (v, len, fill) => {
    const str = String(v);
    const padLen = typeof len === "number" ? len : 2;
    const padFill = typeof fill === "string" ? fill : "0";
    return str.padStart(padLen, padFill);
  },
  slugify: (v) => {
    return String(v)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-+$/, "")
      .replace(/^-+/, "");
  },
};
```

### Task 3.2: Update `FILTER_NAMES` export

No code change needed — `FILTER_NAMES` is derived from `Object.keys(FILTERS)`, so adding entries to `FILTERS` automatically updates it.

---

## Phase 4: SDK and Validation

### Task 4.1: Add block operation validation to `validateWorkflow`

**File:** `packages/pi-workflows/src/workflow-sdk.ts`

Add a new validation pass (section 6) to `validateWorkflow` that checks block step operations:

```typescript
// 6. Block step validation — check block references
for (const [stepName, stepSpec] of Object.entries(spec.steps)) {
  if (!stepSpec.block) continue;

  if (stepSpec.block.write?.path && !stepSpec.block.write.filename) {
    issues.push({
      severity: "error",
      message: `Block write with 'path' requires 'filename'`,
      field: `steps.${stepName}.block.write`,
    });
  }

  // For readDir, check that the directory name looks reasonable (no leading slashes, no ..)
  if (stepSpec.block.readDir !== undefined) {
    if (stepSpec.block.readDir.includes("..") || stepSpec.block.readDir.startsWith("/")) {
      issues.push({
        severity: "error",
        message: `Block readDir must be a relative subdirectory name (got '${stepSpec.block.readDir}')`,
        field: `steps.${stepName}.block.readDir`,
      });
    }
  }
}
```

### Task 4.2: Add block to `declaredSteps` introspection helpers

**File:** `packages/pi-workflows/src/workflow-sdk.ts`

No change needed. `declaredSteps` iterates `Object.keys(spec.steps)` — block steps are already included because they are entries in `spec.steps`.

### Task 4.3: Verify SDK reflection

The `stepTypes()` function returns `STEP_TYPES` directly. Since Task 1.2 adds block to `STEP_TYPES`, it will appear in `/workflow status` output automatically. No additional SDK changes needed.

---

## Phase 5: Tests

### Task 5.1: Create `step-block.test.ts`

**File:** `packages/pi-workflows/src/step-block.test.ts` (new file)

Test structure follows `step-transform.test.ts` pattern. Uses `node:test` + `node:assert`. Creates temporary directories with `.project/` scaffolding for each test.

Test cases:

**Read operations:**
- reads a single block by name, returns `{ blockName: data }`
- reads multiple blocks, returns all in output object
- required block that doesn't exist → status: "failed" with error
- optional block that doesn't exist → `null` in output, status: "completed"
- invalid JSON in block file → status: "failed" with error

**ReadDir operations:**
- reads all `.json` files from a subdirectory, returns sorted array
- missing directory → returns `[]`, status: "completed"
- corrupt file in existing directory → status: "failed" with error
- empty directory → returns `[]`

**Write operations:**
- writes block data with schema validation (create temp schema)
- top-level write calls `writeBlock` (verify file exists and is valid JSON after)
- subdirectory write with `path` and `filename`
- write with expression in data field resolves correctly
- write with invalid data against schema → status: "failed"

**Append operations:**
- appends item to existing array in block
- append to non-existent block → status: "failed"
- append to non-array key → status: "failed"

**Update operations:**
- updates matching item in block array
- match with expression-resolved values
- no matching item → status: "failed"

**General:**
- agent field is "block"
- usage is zero
- durationMs is non-negative
- output persists to runDir when provided
- output persists to custom outputPath when provided

### Task 5.2: Add block parsing tests to spec parsing tests

**File:** `packages/pi-workflows/src/workflow-spec.test.ts` (or wherever spec parsing tests live — check existing test file)

Add test cases for `validateStep` with block specs:
- valid block read spec parses correctly
- valid block readDir spec parses correctly
- valid block write spec parses correctly
- valid block append spec parses correctly
- valid block update spec parses correctly
- block with multiple operations → throws WorkflowSpecError
- block with no operations → throws WorkflowSpecError
- block with invalid read (not array) → throws
- block with readDir (not string) → throws
- block with write missing name → throws
- block with write missing data → throws
- block with append missing arrayKey → throws
- block with update missing match → throws
- block with update missing set → throws

### Task 5.3: Add expression filter tests

**File:** `packages/pi-workflows/src/expression.test.ts`

Add test cases for new filters:
- `find` with key/value arguments returns matching item
- `find` with no arguments returns first truthy item
- `find` on non-array returns undefined
- `padStart` pads with zeros by default
- `padStart` with custom length and fill character
- `slugify` converts to lowercase kebab-case
- `slugify` strips leading/trailing hyphens
- filter argument parsing: `filterName(arg1, arg2)` syntax
- filter argument parsing: string literal arguments
- filter argument parsing: number arguments
- filter argument parsing: expression path arguments resolved against scope

---

## Phase 6: Workflow Migrations

Five mechanical command steps migrate to block steps. Each migration preserves the step's functional contract while gaining block API guarantees (schema validation, atomic writes, `PROJECT_DIR` indirection).

### Migration 6.1: `do-gap.workflow.yaml` — `load` step

**File:** `packages/pi-workflows/workflows/do-gap.workflow.yaml`

**Before:**
```yaml
  load:
    command: |
      node --experimental-strip-types -e "
        import fs from 'fs';
        const gapId = process.argv[1];
        const data = JSON.parse(fs.readFileSync('.project/gaps.json', 'utf8'));
        const gap = data.gaps.find(g => g.id === gapId);
        if (!gap) { console.error('Gap not found: ' + gapId); process.exit(1); }
        if (gap.status === 'resolved') { console.error('Gap already resolved: ' + gapId); process.exit(1); }
        console.log(JSON.stringify({ gap }));
      " '${{ input.gap_id }}'
    output:
      format: json
```

**After:**
```yaml
  load:
    block:
      read:
        - gaps
    output:
      format: json

  extract-gap:
    transform:
      mapping:
        gap: "${{ steps.load.output.gaps.gaps | find('id', input.gap_id) }}"

  validate-gap:
    gate:
      check: "test '${{ steps.extract-gap.output.gap }}' != 'undefined'"
      onFail: fail

  check-status:
    gate:
      check: "test '${{ steps.extract-gap.output.gap.status }}' != 'resolved'"
      onFail: fail
```

**Note:** This migration expands one command step into four steps: a block read, a transform to extract the specific gap using the `find` filter, and two gates for validation. The existing step was doing four things (read, find, validate existence, validate status) — separating concerns makes each step's failure mode explicit.

Downstream references change from `steps.load.output.gap` to `steps.extract-gap.output.gap`.

**Alternative (simpler, fewer steps):** If the `find` filter returns `undefined` for no match, and the gate can check for undefined, the validate-gap gate is sufficient. The status check could be a `when` condition on the next step instead of a separate gate. But the explicit gates match the existing behavior where the command step called `process.exit(1)` on both conditions.

### Migration 6.2: `gap-to-phase.workflow.yaml` — `load-gap` step

**File:** `packages/pi-workflows/workflows/gap-to-phase.workflow.yaml`

**Before:**
```yaml
  load-gap:
    command: |
      node --experimental-strip-types -e "
        import fs from 'fs';
        const gapId = process.argv[1];
        const data = JSON.parse(fs.readFileSync('.project/gaps.json', 'utf8'));
        const gap = data.gaps.find(g => g.id === gapId);
        if (!gap) { console.error('Gap not found: ' + gapId); process.exit(1); }
        if (gap.status === 'resolved') { console.error('Gap already resolved: ' + gapId); process.exit(1); }
        console.log(JSON.stringify({ gap }));
      " '${{ input.gap_id }}'
    output:
      format: json
```

**After:**
```yaml
  load-gap:
    block:
      read:
        - gaps
    output:
      format: json

  extract-gap:
    transform:
      mapping:
        gap: "${{ steps.load-gap.output.gaps.gaps | find('id', input.gap_id) }}"

  validate-gap:
    gate:
      check: "test '${{ steps.extract-gap.output.gap }}' != 'undefined'"
      onFail: fail

  check-gap-status:
    gate:
      check: "test '${{ steps.extract-gap.output.gap.status }}' != 'resolved'"
      onFail: fail
```

Downstream references change from `steps.load-gap.output.gap` to `steps.extract-gap.output.gap`.

### Migration 6.3: `gap-to-phase.workflow.yaml` — `load-context` step

**File:** `packages/pi-workflows/workflows/gap-to-phase.workflow.yaml`

**Before:**
```yaml
  load-context:
    command: |
      node --experimental-strip-types -e "
        import fs from 'fs';
        import path from 'path';

        const phases = [];
        const phasesDir = '.project/phases';
        if (fs.existsSync(phasesDir)) {
          for (const f of fs.readdirSync(phasesDir).filter(f => f.endsWith('.json')).sort()) {
            phases.push(JSON.parse(fs.readFileSync(path.join(phasesDir, f), 'utf8')));
          }
        }

        let architecture = {};
        try { architecture = JSON.parse(fs.readFileSync('.project/architecture.json', 'utf8')); } catch {}
        let conventions = {};
        try { conventions = JSON.parse(fs.readFileSync('.project/conventions.json', 'utf8')); } catch {}
        let gaps = { gaps: [] };
        try { gaps = JSON.parse(fs.readFileSync('.project/gaps.json', 'utf8')); } catch {}
        let inventory = {};
        try { inventory = JSON.parse(fs.readFileSync('.project/inventory.json', 'utf8')); } catch {}

        console.log(JSON.stringify({ phases, architecture, conventions, gaps: gaps.gaps.filter(g => g.status === 'open'), inventory }));
      "
    output:
      format: json
```

**After:**
```yaml
  load-context:
    block:
      read:
        - { name: architecture, optional: true }
        - { name: conventions, optional: true }
        - { name: gaps, optional: true }
        - { name: inventory, optional: true }
    output:
      format: json

  load-phases:
    block:
      readDir: phases
    output:
      format: json

  prepare-context:
    transform:
      mapping:
        phases: "${{ steps.load-phases.output }}"
        architecture: "${{ steps.load-context.output.architecture }}"
        conventions: "${{ steps.load-context.output.conventions }}"
        gaps: "${{ steps.load-context.output.gaps.gaps | filter }}"
        inventory: "${{ steps.load-context.output.inventory }}"
```

**Note:** The original step filtered gaps to `status === 'open'`. The `filter` built-in filter removes falsy values but doesn't do field matching. Two options:
1. Accept that the `author` agent receives all gaps (it can filter itself — it's an LLM agent with judgment).
2. The open-gap filter can remain in the transform using a more specific expression if the filter system supports a `where` or keyed `filter` variant.

For now, pass all gaps to the agent. The agent's context includes the gaps with their statuses, and it can filter by status. This is actually an improvement over the original behavior, which silently swallowed errors — now, corrupt files fail explicitly (required blocks) or produce `null` (optional blocks) rather than empty objects.

Downstream references change from `steps.load-context.output.X` to `steps.prepare-context.output.X`.

### Migration 6.4: `gap-to-phase.workflow.yaml` — `write-phase` step

**File:** `packages/pi-workflows/workflows/gap-to-phase.workflow.yaml`

**Before:**
```yaml
  write-phase:
    command: |
      node --experimental-strip-types -e "
        import fs from 'fs';
        const phase = JSON.parse(process.argv[1]);
        const num = String(phase.number).padStart(2, '0');
        const name = phase.name.toLowerCase().replace(/\s+/g, '-');
        const filename = '.project/phases/' + num + '-' + name + '.json';
        fs.mkdirSync('.project/phases', { recursive: true });
        fs.writeFileSync(filename, JSON.stringify(phase, null, 2));
        console.log(JSON.stringify({ path: filename, phase_number: phase.number, spec_count: (phase.specs || []).length }));
      " '${{ steps.author.output | json }}'
    output:
      format: json
```

**After:**
```yaml
  write-phase:
    block:
      write:
        name: phase
        path: phases
        filename: "${{ steps.author.output.number | padStart(2, '0') }}-${{ steps.author.output.name | slugify }}"
        data: "${{ steps.author.output }}"
    output:
      format: json
```

**Note:** The `filename` field uses two expression interpolations with the new `padStart` and `slugify` filters. The block step executor resolves these, constructs the path `.project/phases/{filename}.json`, validates against `.project/schemas/phase.schema.json`, and writes atomically. The output will contain `{ path: "..." }` from the write operation.

Downstream references to `steps.write-phase.output.path` change to use the block step's output. The `phase_number` and `spec_count` fields from the old output can be derived via a follow-up transform if the completion template needs them, or the completion can reference `steps.author.output.number` and `steps.author.output.specs | length` directly.

### Migration 6.5: `create-phase.workflow.yaml` — `load-context` and `write-phase` steps

**File:** `packages/pi-workflows/workflows/create-phase.workflow.yaml`

**Before (load-context):**
```yaml
  load-context:
    command: |
      node --experimental-strip-types -e "
        import fs from 'fs';
        import path from 'path';
        const phasesDir = '.project/phases';
        let phases = [];
        try {
          phases = fs.readdirSync(phasesDir)
            .filter(f => f.endsWith('.json'))
            .map(f => JSON.parse(fs.readFileSync(path.join(phasesDir, f), 'utf8')));
        } catch {}
        let arch = {};
        try { arch = JSON.parse(fs.readFileSync('.project/architecture.json', 'utf8')); } catch {}
        let conv = {};
        try { conv = JSON.parse(fs.readFileSync('.project/conventions.json', 'utf8')); } catch {}
        let gapsData = { gaps: [] };
        try { gapsData = JSON.parse(fs.readFileSync('.project/gaps.json', 'utf8')); } catch {}
        let inv = {};
        try { inv = JSON.parse(fs.readFileSync('.project/inventory.json', 'utf8')); } catch {}
        console.log(JSON.stringify({ phases, architecture: arch, conventions: conv, gaps: gapsData.gaps, inventory: inv }));
      "
    output:
      format: json
```

**After:**
```yaml
  load-blocks:
    block:
      read:
        - { name: architecture, optional: true }
        - { name: conventions, optional: true }
        - { name: gaps, optional: true }
        - { name: inventory, optional: true }
    output:
      format: json

  load-phases:
    block:
      readDir: phases
    output:
      format: json

  load-context:
    transform:
      mapping:
        phases: "${{ steps.load-phases.output }}"
        architecture: "${{ steps.load-blocks.output.architecture }}"
        conventions: "${{ steps.load-blocks.output.conventions }}"
        gaps: "${{ steps.load-blocks.output.gaps.gaps }}"
        inventory: "${{ steps.load-blocks.output.inventory }}"
```

**Before (write-phase):**
```yaml
  write-phase:
    command: |
      node --experimental-strip-types -e "
        import fs from 'fs';
        const phase = JSON.parse(process.argv[1]);
        const filename = '.project/phases/' + String(phase.number).padStart(2, '0') + '-' + phase.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '') + '.json';
        fs.mkdirSync('.project/phases', { recursive: true });
        fs.writeFileSync(filename, JSON.stringify(phase, null, 2) + '\n');
        console.log(JSON.stringify({ path: filename, phase_number: phase.number, spec_count: phase.specs.length }));
      " '${{ steps.author.output | json }}'
    output:
      format: json
```

**After:**
```yaml
  write-phase:
    block:
      write:
        name: phase
        path: phases
        filename: "${{ steps.author.output.number | padStart(2, '0') }}-${{ steps.author.output.name | slugify }}"
        data: "${{ steps.author.output }}"
    output:
      format: json
```

---

## Phase 7: Completion Template Updates

### Task 7.1: Update completion references in migrated workflows

The completion templates in `gap-to-phase.workflow.yaml` and `create-phase.workflow.yaml` reference `steps.write-phase.output.phase_number`, `steps.write-phase.output.spec_count`, and `steps.write-phase.output.path`. The block write step's output format is `{ path: "..." }`, not `{ path, phase_number, spec_count }`.

Update completions to reference `steps.author.output` for the data:

**gap-to-phase.workflow.yaml completion:**
```yaml
completion:
  message: |
    Phase ${{ steps.author.output.number }} created: ${{ steps.write-phase.output.path }}
    Specs: ${{ steps.author.output.specs | length }}
    From gap: ${{ input.gap_id }}
  include:
    - steps.author.output
```

**create-phase.workflow.yaml completion:**
```yaml
completion:
  message: |
    Phase ${{ steps.author.output.number }} created at ${{ steps.write-phase.output.path }}
    Contains ${{ steps.author.output.specs | length }} specs.
  include:
    - steps.author.output.success_criteria
    - steps.author.output.specs
```

### Task 7.2: Update `do-gap.workflow.yaml` downstream references

All downstream steps that reference `steps.load.output.gap` must be updated to reference `steps.extract-gap.output.gap`. Affected steps: `investigate`, `research`, `decompose`, `implement`.

---

## Phase 8: Skills Regeneration

### Task 8.1: Regenerate SKILL.md files

After build, run `npm run skills` to regenerate SKILL.md files. The block step type will appear in the workflow extension's vocabulary listing because it is registered in `STEP_TYPES`.

---

## Verification Criteria

After all phases are complete:

1. `npm run build` passes
2. `npm run check` passes (biome + tsc + peer freshness)
3. `npm test` — all existing + new tests pass, 0 failures
4. New step type "block" appears in `stepTypes()` output and `/workflow status`
5. `/workflow validate` checks block step operations (path/filename consistency, readDir safety)
6. Expression filters `find`, `filter`, `padStart`, `slugify` exist in `FILTER_NAMES`
7. Migrated workflows parse without error: `parseWorkflowSpec` succeeds on all `.workflow.yaml` files
8. The `do-gap.workflow.yaml` `load` step no longer contains `fs.readFileSync.*\.project`

---

## Execution Order Dependencies

| Phase | Depends on | Can parallel with |
|-------|-----------|-------------------|
| 1 (Types + Registry) | — | — |
| 2 (Executor) | Phase 1 | Phase 3 |
| 3 (Filters) | — | Phase 2 |
| 4 (SDK) | Phase 1 | Phase 2, 3 |
| 5 (Tests) | Phase 1, 2, 3 | — |
| 6 (Migrations) | Phase 2, 3 | Phase 5 |
| 7 (Completions) | Phase 6 | — |
| 8 (Skills) | Phase 1-7 | — |
