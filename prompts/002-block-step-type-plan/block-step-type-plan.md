# Block Step Type Implementation Plan

<metadata>
  <confidence>high — all step executors, the STEP_TYPES registry, the dispatch chain, the block API surface, and all 6 bypassing workflows have been read and cross-referenced</confidence>
  <prerequisite>Plan 1 (dependency alignment) must be complete — pi-project is a direct dependency of pi-workflows with named exports: `@davidorex/pi-project/block-api` exports readBlock, writeBlock, appendToBlock, updateItemInBlock; `@davidorex/pi-project/project-dir` exports PROJECT_DIR, SCHEMAS_DIR</prerequisite>
  <assumptions>
    - readBlock throws on missing files (observed in block-api.ts line 29: `throw new Error('Block file not found: ...')`) — this is the explicit failure behavior the block step type will propagate.
    - writeBlock validates against schema before writing and uses atomic tmp+rename — these guarantees transfer automatically when the block step calls the API.
    - Phase files (.project/phases/*.json) live in a subdirectory. readBlock/writeBlock operate on .project/{name}.json (top-level). Phase directory enumeration and phase file writes need special handling — they use fs.readdirSync and computed filenames, which readBlock does not cover. The block step type must provide a `readDir` operation for this pattern.
    - The expression engine (resolveExpressions) handles nested objects, arrays, and string interpolation — the block step spec values go through expression resolution before the block API call.
    - The block validation safety net (snapshotBlockFiles/validateChangedBlocks/rollbackBlockFiles) wraps every step in executeSingleStep. The block step type benefits from this automatically since it runs within the same step execution wrapper.
  </assumptions>
  <open_questions>
    <question id="1">
      **Phase file writes**: The write-phase mechanical steps construct filenames dynamically (.project/phases/{nn}-{name}.json) and create the phases/ directory. The block API's writeBlock writes to .project/{name}.json only. Options: (a) add a `writePhase` operation to the block step type that handles the subdirectory pattern, (b) keep write-phase as a command step until the block API gains subdirectory support, (c) add an optional `subdir` parameter to the block write operation. This plan uses option (c) — a `path` parameter that overrides the default .project/{name}.json path while still using atomic writes. Schema validation uses the `block:phase` schema reference.
    </question>
    <question id="2">
      **Directory enumeration**: .project/phases/ and .project/audits/ are subdirectories containing multiple JSON files. The block API has no directory enumeration. The block step type adds a `readDir` operation that lists and reads all JSON files in a .project/ subdirectory. This fills the gap without modifying the block API itself.
    </question>
  </open_questions>
</metadata>

---

## YAML Syntax Design

The `block` field takes an object with exactly one operation key: `read`, `readDir`, `write`, `append`, or `update`.

### Read — single block

```yaml
load-gap:
  block:
    read: gaps
  output:
    format: json
```

Calls `readBlock(cwd, "gaps")`. Output is the parsed JSON content of `.project/gaps.json`.

Throws (step fails) if the file does not exist or contains invalid JSON. This is the explicit failure behavior — no silent empty default.

### Read — multiple blocks

```yaml
load-context:
  block:
    read: [architecture, conventions, gaps, inventory]
  output:
    format: json
```

Calls `readBlock(cwd, name)` for each block name. Output is an object keyed by block name:

```json
{
  "architecture": { ... },
  "conventions": { ... },
  "gaps": { ... },
  "inventory": { ... }
}
```

**Failure behavior**: If any block file is missing or corrupt, the step fails with an error naming the missing block. No partial results. This eliminates the silent-degradation pattern where `catch {}` returns empty objects.

**Optional blocks**: Some workflows need to proceed when certain blocks are absent (e.g., `inventory` might not exist yet). The `optional` field lists block names that may be missing — these return `null` in the output instead of failing:

```yaml
load-context:
  block:
    read: [architecture, conventions, gaps, inventory]
    optional: [inventory]
  output:
    format: json
```

Here, missing `architecture`, `conventions`, or `gaps` fails the step. Missing `inventory` produces `{ ..., "inventory": null }`. This preserves explicitness — the downstream consumer sees `null` (and knows the block was absent) rather than `{}` (which is ambiguous).

### Read — with expression-resolved block name

```yaml
load-gap:
  block:
    read: "${{ input.block_name }}"
  output:
    format: json
```

Expression resolution happens before the block API call. The resolved value must be a string (single block) or array of strings (multi-block).

### ReadDir — directory enumeration

```yaml
load-phases:
  block:
    readDir: phases
  output:
    format: json
```

Reads all `.json` files in `.project/phases/`, sorted alphabetically. Output is an array of parsed JSON objects:

```json
[
  { "number": 1, "name": "foundation", ... },
  { "number": 2, "name": "migration", ... }
]
```

**Failure behavior**: If the directory does not exist, the step fails. If individual files contain invalid JSON, the step fails naming the corrupt file. No silent filtering.

**Empty directory**: If the directory exists but contains no `.json` files, output is `[]` — this is not an error (the directory was successfully enumerated).

Also supports `.project/audits/` and any other subdirectory:

```yaml
load-latest-audit:
  block:
    readDir: audits
  output:
    format: json
```

### Write — write entire block

```yaml
write-block:
  block:
    write:
      name: tasks
      data: "${{ steps.create-plan.output }}"
  output:
    format: json
```

Calls `writeBlock(cwd, "tasks", data)`. Schema validation and atomic write are automatic. Output is a confirmation object:

```json
{ "written": "tasks", "path": ".project/tasks.json" }
```

Fails if schema validation rejects the data.

### Write — to a subdirectory path (phase files)

```yaml
write-phase:
  block:
    write:
      name: phase
      data: "${{ steps.author.output }}"
      path: "phases/${{ steps.author.output.number | padStart(2, '0') }}-${{ steps.author.output.name | slugify }}"
  output:
    format: json
```

When `path` is specified, the file is written to `.project/{path}.json` instead of `.project/{name}.json`. The `name` field is used for schema resolution (`block:phase` → `.project/schemas/phase.schema.json`). The `path` field supports expressions.

The step ensures the parent directory exists (`mkdirSync` with `{ recursive: true }`). Output:

```json
{ "written": "phase", "path": ".project/phases/01-foundation.json" }
```

### Append — add item to block array

```yaml
add-gap:
  block:
    append:
      name: gaps
      key: gaps
      item: "${{ steps.transform.output.new_gap }}"
  output:
    format: json
```

Calls `appendToBlock(cwd, "gaps", "gaps", item)`. Schema validation covers the entire file after append. Output:

```json
{ "appended": "gaps", "key": "gaps" }
```

### Update — modify item in block array

```yaml
resolve-gap:
  block:
    update:
      name: gaps
      key: gaps
      match:
        id: "${{ input.gap_id }}"
      set:
        status: resolved
        resolved_by: do-gap-workflow
  output:
    format: json
```

Calls `updateItemInBlock(cwd, "gaps", "gaps", predicate, updates)`. The `match` object is converted to a predicate function that checks equality on each specified field. The `set` object is the updates to merge. Output:

```json
{ "updated": "gaps", "key": "gaps", "matched": { "id": "gap-001" } }
```

Fails if no item matches the predicate.

### Expression support summary

All string values in the block spec go through expression resolution before execution:

| Field | Supports expressions | Example |
|-------|---------------------|---------|
| `read` (string) | Yes | `"${{ input.block_name }}"` |
| `read` (array elements) | Yes | `["${{ input.primary }}", "gaps"]` |
| `readDir` | Yes | `"${{ input.subdir }}"` |
| `write.name` | Yes | `"${{ input.block_name }}"` |
| `write.data` | Yes | `"${{ steps.author.output }}"` |
| `write.path` | Yes | `"phases/${{ steps.author.output.number }}"` |
| `append.name` | Yes | — |
| `append.key` | Yes | — |
| `append.item` | Yes | `"${{ steps.transform.output }}"` |
| `update.name` | Yes | — |
| `update.key` | Yes | — |
| `update.match` values | Yes | `"${{ input.gap_id }}"` |
| `update.set` values | Yes | — |
| `optional` (array elements) | No | Static list of block names |

---

## Phase 1: Type Definitions and STEP_TYPES Registration

**Objective**: Add the `BlockSpec` type, register the block step type, and add the `block` field to `StepSpec`. This is pure type/registry work — no executor logic yet.

**Scope**: `types.ts`, `workflow-spec.ts`

**Estimated effort**: Small

### Task 1.1: Add BlockSpec to types.ts

**File**: `packages/pi-workflows/src/types.ts`

Add after `TransformSpec` (around line 74):

```typescript
export interface BlockReadSpec {
  read: string | string[];
  optional?: string[];
}

export interface BlockReadDirSpec {
  readDir: string;
}

export interface BlockWriteSpec {
  write: {
    name: string;
    data: unknown;
    path?: string;
  };
}

export interface BlockAppendSpec {
  append: {
    name: string;
    key: string;
    item: unknown;
  };
}

export interface BlockUpdateSpec {
  update: {
    name: string;
    key: string;
    match: Record<string, unknown>;
    set: Record<string, unknown>;
  };
}

export type BlockSpec = BlockReadSpec | BlockReadDirSpec | BlockWriteSpec | BlockAppendSpec | BlockUpdateSpec;
```

### Task 1.2: Add block field to StepSpec

**File**: `packages/pi-workflows/src/types.ts`

Add to the `StepSpec` interface:

```typescript
block?: BlockSpec;
```

Update the comment to include `block` in the list: "exactly one of agent, gate, transform, loop, parallel, monitor, command, or block must be set."

### Task 1.3: Register in STEP_TYPES

**File**: `packages/pi-workflows/src/workflow-spec.ts`

Add to the `STEP_TYPES` array:

```typescript
{ name: "block", field: "block", retryable: false, supportsInput: true, supportsOutput: true },
```

The `supportsInput: true` allows the step to receive resolved input (for expression context). `supportsOutput: true` allows the output spec for format/path. `retryable: false` because block operations are deterministic — retrying the same read on the same filesystem state will produce the same result.

### Task 1.4: Add block step parsing in validateStep

**File**: `packages/pi-workflows/src/workflow-spec.ts`, in the `validateStep` function

Add a parsing block (following the command step pattern):

```typescript
// Block step
if (hasBlock) {
  if (typeof rawStep.block !== "object" || rawStep.block === null || Array.isArray(rawStep.block)) {
    throw new WorkflowSpecError(filePath, `step '${stepName}' block must be an object`);
  }
  const rawBlock = rawStep.block as Record<string, unknown>;

  // Exactly one operation key
  const ops = ["read", "readDir", "write", "append", "update"].filter(k => k in rawBlock);
  if (ops.length !== 1) {
    throw new WorkflowSpecError(
      filePath,
      `step '${stepName}' block must have exactly one of: read, readDir, write, append, update`
    );
  }

  // Validate each operation shape
  if ("read" in rawBlock) {
    const read = rawBlock.read;
    if (typeof read !== "string" && !Array.isArray(read)) {
      throw new WorkflowSpecError(filePath, `step '${stepName}' block.read must be a string or array of strings`);
    }
    if (Array.isArray(read) && !read.every(r => typeof r === "string")) {
      throw new WorkflowSpecError(filePath, `step '${stepName}' block.read array elements must be strings`);
    }
    if ("optional" in rawBlock && rawBlock.optional !== undefined) {
      if (!Array.isArray(rawBlock.optional) || !rawBlock.optional.every(o => typeof o === "string")) {
        throw new WorkflowSpecError(filePath, `step '${stepName}' block.optional must be an array of strings`);
      }
    }
  }

  if ("readDir" in rawBlock) {
    if (typeof rawBlock.readDir !== "string") {
      throw new WorkflowSpecError(filePath, `step '${stepName}' block.readDir must be a string`);
    }
  }

  if ("write" in rawBlock) {
    if (typeof rawBlock.write !== "object" || rawBlock.write === null || Array.isArray(rawBlock.write)) {
      throw new WorkflowSpecError(filePath, `step '${stepName}' block.write must be an object`);
    }
    const w = rawBlock.write as Record<string, unknown>;
    if (typeof w.name !== "string") {
      throw new WorkflowSpecError(filePath, `step '${stepName}' block.write.name must be a string`);
    }
    if (!("data" in w)) {
      throw new WorkflowSpecError(filePath, `step '${stepName}' block.write must have a 'data' field`);
    }
  }

  if ("append" in rawBlock) {
    if (typeof rawBlock.append !== "object" || rawBlock.append === null || Array.isArray(rawBlock.append)) {
      throw new WorkflowSpecError(filePath, `step '${stepName}' block.append must be an object`);
    }
    const a = rawBlock.append as Record<string, unknown>;
    if (typeof a.name !== "string") {
      throw new WorkflowSpecError(filePath, `step '${stepName}' block.append.name must be a string`);
    }
    if (typeof a.key !== "string") {
      throw new WorkflowSpecError(filePath, `step '${stepName}' block.append.key must be a string`);
    }
    if (!("item" in a)) {
      throw new WorkflowSpecError(filePath, `step '${stepName}' block.append must have an 'item' field`);
    }
  }

  if ("update" in rawBlock) {
    if (typeof rawBlock.update !== "object" || rawBlock.update === null || Array.isArray(rawBlock.update)) {
      throw new WorkflowSpecError(filePath, `step '${stepName}' block.update must be an object`);
    }
    const u = rawBlock.update as Record<string, unknown>;
    if (typeof u.name !== "string") {
      throw new WorkflowSpecError(filePath, `step '${stepName}' block.update.name must be a string`);
    }
    if (typeof u.key !== "string") {
      throw new WorkflowSpecError(filePath, `step '${stepName}' block.update.key must be a string`);
    }
    if (typeof u.match !== "object" || u.match === null || Array.isArray(u.match)) {
      throw new WorkflowSpecError(filePath, `step '${stepName}' block.update.match must be an object`);
    }
    if (typeof u.set !== "object" || u.set === null || Array.isArray(u.set)) {
      throw new WorkflowSpecError(filePath, `step '${stepName}' block.update.set must be an object`);
    }
  }

  step.block = rawBlock as BlockSpec;

  // output spec (optional, same as command)
  if ("output" in rawStep && rawStep.output !== undefined) {
    // ... same output parsing as command step
  }

  // input (optional, for expression resolution context)
  if ("input" in rawStep && rawStep.input !== undefined) {
    // ... same input parsing as command step
  }

  return step;
}
```

The `hasBlock` variable is already derived from the `presentTypes` check at the top of `validateStep` — the STEP_TYPES registry drives the detection.

### Verification

- `tsc --noEmit` passes (types compile)
- Existing tests still pass (no behavioral change)
- `STEP_TYPES` array includes the block entry (SDK reflects it)

---

## Phase 2: Step Executor Implementation

**Objective**: Implement `step-block.ts` — the in-process block I/O executor. Follows the transform step pattern: synchronous execution, no subprocess, no LLM, returns StepResult.

**Scope**: New file `packages/pi-workflows/src/step-block.ts`

**Estimated effort**: Medium

### Task 2.1: Create step-block.ts

**File**: `packages/pi-workflows/src/step-block.ts`

```typescript
/**
 * Block step executor — performs validated, in-process block I/O.
 * No LLM call, no subprocess — calls the block API directly.
 *
 * Operations:
 * - read: single or multi-block read via readBlock()
 * - readDir: directory enumeration for .project/ subdirectories
 * - write: validated write via writeBlock()
 * - append: array append via appendToBlock()
 * - update: item update via updateItemInBlock()
 */

import fs from "node:fs";
import path from "node:path";
import { readBlock, writeBlock, appendToBlock, updateItemInBlock } from "@davidorex/pi-project/block-api";
import { PROJECT_DIR } from "@davidorex/pi-project/project-dir";
import { resolveExpressions } from "./expression.js";
import { persistStepOutput } from "./output.js";
import { zeroUsage } from "./step-shared.js";
import type { BlockSpec, StepResult } from "./types.js";

/**
 * Execute a block step: performs block I/O using the block API.
 * All block names and values are expression-resolved before API calls.
 */
export function executeBlock(
  blockSpec: BlockSpec,
  stepName: string,
  scope: Record<string, unknown>,
  cwd: string,
  runDir?: string,
  outputPath?: string,
): StepResult {
  const startTime = Date.now();
  try {
    // Resolve expressions in the block spec
    const resolved = resolveExpressions(blockSpec, scope) as BlockSpec;

    let output: unknown;

    if ("read" in resolved) {
      output = executeRead(resolved.read, resolved.optional, cwd);
    } else if ("readDir" in resolved) {
      output = executeReadDir(resolved.readDir, cwd);
    } else if ("write" in resolved) {
      output = executeWrite(resolved.write, cwd);
    } else if ("append" in resolved) {
      output = executeAppend(resolved.append, cwd);
    } else if ("update" in resolved) {
      output = executeUpdate(resolved.update, cwd);
    } else {
      throw new Error("Block spec must have one of: read, readDir, write, append, update");
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

/**
 * Read one or more blocks. Single string → single block content.
 * Array → object keyed by block name.
 */
function executeRead(
  read: string | string[],
  optional: string[] | undefined,
  cwd: string,
): unknown {
  const optionalSet = new Set(optional ?? []);

  if (typeof read === "string") {
    // Single block read
    try {
      return readBlock(cwd, read);
    } catch (err) {
      if (optionalSet.has(read)) return null;
      throw err;
    }
  }

  // Multi-block read
  const result: Record<string, unknown> = {};
  for (const name of read) {
    try {
      result[name] = readBlock(cwd, name);
    } catch (err) {
      if (optionalSet.has(name)) {
        result[name] = null;
      } else {
        throw err;
      }
    }
  }
  return result;
}

/**
 * Read all JSON files in a .project/ subdirectory.
 * Returns sorted array of parsed contents.
 */
function executeReadDir(subdir: string, cwd: string): unknown[] {
  const dirPath = path.join(cwd, PROJECT_DIR, subdir);

  let entries: string[];
  try {
    entries = fs.readdirSync(dirPath).filter(f => f.endsWith(".json")).sort();
  } catch {
    throw new Error(`Directory not found: ${PROJECT_DIR}/${subdir}/`);
  }

  const results: unknown[] = [];
  for (const filename of entries) {
    const filePath = path.join(dirPath, filename);
    let content: string;
    try {
      content = fs.readFileSync(filePath, "utf-8");
    } catch {
      throw new Error(`Cannot read file: ${PROJECT_DIR}/${subdir}/${filename}`);
    }
    try {
      results.push(JSON.parse(content));
    } catch {
      throw new Error(`Invalid JSON in: ${PROJECT_DIR}/${subdir}/${filename}`);
    }
  }
  return results;
}

/**
 * Write a block via writeBlock (schema validation + atomic write).
 * Supports optional path override for subdirectory writes.
 */
function executeWrite(
  spec: { name: string; data: unknown; path?: string },
  cwd: string,
): Record<string, string> {
  if (spec.path) {
    // Subdirectory write: use schema from `name`, write to `path`
    return executeSubdirWrite(spec.name, spec.data, spec.path, cwd);
  }

  writeBlock(cwd, spec.name, spec.data);
  return { written: spec.name, path: `${PROJECT_DIR}/${spec.name}.json` };
}

/**
 * Write to a subdirectory path (.project/{path}.json) with schema
 * validation from `name`. Provides atomic writes and directory creation.
 */
function executeSubdirWrite(
  schemaName: string,
  data: unknown,
  subPath: string,
  cwd: string,
): Record<string, string> {
  const filePath = path.join(cwd, PROJECT_DIR, `${subPath}.json`);
  const schemaFile = path.join(cwd, PROJECT_DIR, "schemas", `${schemaName}.schema.json`);

  // Validate against schema if it exists
  if (fs.existsSync(schemaFile)) {
    // Import validateFromFile dynamically to keep the import light
    // Actually, since Plan 1 makes this available, import at top level
    const { validateFromFile } = require("@davidorex/pi-project/schema-validator");
    validateFromFile(schemaFile, data, `block file '${subPath}.json'`);
  }

  // Ensure parent directory exists
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  // Atomic write
  const tmpPath = `${filePath}.block-step-${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2) + "\n", "utf-8");
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    try { fs.unlinkSync(tmpPath); } catch { /* cleanup best-effort */ }
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to write ${PROJECT_DIR}/${subPath}.json: ${msg}`);
  }

  return { written: schemaName, path: `${PROJECT_DIR}/${subPath}.json` };
}

/**
 * Append an item to a block array via appendToBlock.
 */
function executeAppend(
  spec: { name: string; key: string; item: unknown },
  cwd: string,
): Record<string, string> {
  appendToBlock(cwd, spec.name, spec.key, spec.item);
  return { appended: spec.name, key: spec.key };
}

/**
 * Update an item in a block array via updateItemInBlock.
 * The `match` object is converted to a predicate.
 */
function executeUpdate(
  spec: { name: string; key: string; match: Record<string, unknown>; set: Record<string, unknown> },
  cwd: string,
): Record<string, unknown> {
  const predicate = (item: Record<string, unknown>) => {
    return Object.entries(spec.match).every(([k, v]) => item[k] === v);
  };

  updateItemInBlock(cwd, spec.name, spec.key, predicate, spec.set);
  return { updated: spec.name, key: spec.key, matched: spec.match };
}
```

**Design notes**:

1. **Synchronous execution**: Like the transform step, `executeBlock` is synchronous (returns `StepResult`, not `Promise<StepResult>`). All block API operations are synchronous (fs.readFileSync/writeFileSync).

2. **Expression resolution**: The entire `blockSpec` object is passed through `resolveExpressions` before any API call. This means block names, data values, match criteria, and paths can all use `${{ }}` expressions.

3. **Error propagation**: Block API errors (missing file, validation failure, no matching item) propagate as step failures with descriptive error messages. No catch-and-swallow.

4. **Subdirectory write**: The `executeSubdirWrite` function replicates writeBlock's atomic write pattern for paths outside .project/{name}.json. It uses the schema from `name` for validation — so `write.name: phase` validates against `.project/schemas/phase.schema.json` even when writing to `.project/phases/01-foundation.json`.

5. **Import note**: The `require("@davidorex/pi-project/schema-validator")` in `executeSubdirWrite` should be replaced with a top-level import. The plan shows it as require for clarity, but implementation should use: `import { validateFromFile } from "@davidorex/pi-project/schema-validator";` at the top of the file.

### Task 2.2: Add import to step-block.ts top-level

Ensure the top-level imports include:

```typescript
import { validateFromFile } from "@davidorex/pi-project/schema-validator";
```

And replace the dynamic require in `executeSubdirWrite` with the imported function.

### Verification

- `tsc --noEmit` passes
- `npm run build` succeeds (step-block.ts compiles to dist/step-block.js)

---

## Phase 3: Executor Dispatch Integration

**Objective**: Wire the block step executor into the workflow executor's dispatch chain. Add the `executeBlock` call in `executeStepByType`.

**Scope**: `workflow-executor.ts`

**Estimated effort**: Small

### Task 3.1: Add import

**File**: `packages/pi-workflows/src/workflow-executor.ts`

Add import alongside the other step executor imports:

```typescript
import { executeBlock } from "./step-block.js";
```

### Task 3.2: Add dispatch case in executeStepByType

**File**: `packages/pi-workflows/src/workflow-executor.ts`, in the `executeStepByType` function

Add before the transform step case (around line 537), following the same pattern:

```typescript
// ── Block step ──
if (stepSpec.block) {
  const resolvedBlockOutputPath = stepSpec.output?.path
    ? String(resolveExpressions(stepSpec.output.path, scope))
    : undefined;
  // Show block operation in widget while running
  const blockOp = "read" in stepSpec.block ? "read" :
                  "readDir" in stepSpec.block ? "readDir" :
                  "write" in stepSpec.block ? "write" :
                  "append" in stepSpec.block ? "append" : "update";
  widgetState.activities.set(stepName, [{ tool: "block", preview: blockOp, timestamp: Date.now() }]);
  if (ctx.hasUI) ctx.ui.setWidget(WIDGET_ID, createProgressWidget(widgetState));

  const blockResult = executeBlock(
    stepSpec.block,
    stepName,
    scope,
    ctx.cwd,
    runDir,
    resolvedBlockOutputPath,
  );
  persistStep(state, stepName, blockResult, runDir, widgetState, ctx);
  if (blockResult.status === "failed") {
    state.status = "failed";
    return false;
  }
  return true;
}
```

This follows the exact pattern of the transform step dispatch (synchronous call, persistStep, fail/continue check) with the addition of `ctx.cwd` as a parameter (which the block API requires for path resolution) and a widget activity preview showing the operation type.

### Task 3.3: Update BlockSpec import in types re-export

Ensure `BlockSpec` and its sub-types are exported from `types.ts` so that the executor can import the type if needed for type narrowing.

### Verification

- `npm run build` succeeds
- `tsc --noEmit` passes
- Existing tests pass (no behavioral change to existing step types)
- A test workflow YAML with a `block:` step parses correctly

---

## Phase 4: Tests

**Objective**: Comprehensive test coverage for the block step executor. Tests verify all operations, the explicit failure requirement, and expression resolution.

**Scope**: New file `packages/pi-workflows/src/step-block.test.ts`

**Estimated effort**: Medium

### Task 4.1: Create test file with test fixtures

**File**: `packages/pi-workflows/src/step-block.test.ts`

Test setup: create a temporary directory with `.project/` structure including schemas and block files. Tear down after each test.

### Task 4.2: Test cases

| Test | Operation | Assertion |
|------|-----------|-----------|
| reads a single block | `read: "gaps"` | output matches parsed gaps.json content |
| reads multiple blocks | `read: ["gaps", "architecture"]` | output is object with both keys |
| multi-read fails on missing required block | `read: ["gaps", "nonexistent"]` | status: "failed", error names the missing block |
| multi-read with optional missing block | `read: ["gaps", "nonexistent"], optional: ["nonexistent"]` | status: "completed", output.nonexistent is null |
| single read fails on missing block | `read: "nonexistent"` | status: "failed", error: "Block file not found: ..." |
| reads directory entries | `readDir: "phases"` | output is sorted array of phase contents |
| readDir fails on missing directory | `readDir: "nonexistent"` | status: "failed", error names the directory |
| readDir fails on corrupt JSON file | `readDir: "phases"` (with a corrupt file) | status: "failed", error names the corrupt file |
| readDir returns empty array for empty directory | `readDir: "phases"` (empty dir) | output is `[]` |
| writes a block with schema validation | `write: { name: "tasks", data: {...} }` | file written, schema-validated, output confirms |
| write fails on schema violation | `write: { name: "tasks", data: {...invalid...} }` | status: "failed", error mentions validation |
| writes to subdirectory path | `write: { name: "phase", data: {...}, path: "phases/01-test" }` | file at .project/phases/01-test.json, parent dir created |
| appends to block array | `append: { name: "gaps", key: "gaps", item: {...} }` | item added, file valid |
| append fails on nonexistent block | `append: { name: "nonexistent", key: "items", item: {} }` | status: "failed" |
| updates item in block array | `update: { name: "gaps", key: "gaps", match: { id: "g1" }, set: { status: "resolved" } }` | item updated in file |
| update fails when no match | `update: { name: "gaps", key: "gaps", match: { id: "nonexistent" }, set: {...} }` | status: "failed" |
| expression resolution in read block name | `read: "${{ input.blockName }}"` with scope | resolves and reads correctly |
| expression resolution in write data | `write: { name: "test", data: "${{ steps.prev.output }}" }` with scope | writes resolved data |
| output persisted to runDir | any operation with runDir set | outputPath set on result, file exists |

### Task 4.3: Test the validateStep parsing

Add tests to the existing workflow-spec tests (or step-block.test.ts) that verify:

- Valid block step with read operation parses
- Valid block step with write operation parses
- Block step with multiple operation keys fails parse
- Block step with no operation key fails parse
- Block step with invalid read type fails parse

### Verification

- `npm test -w @davidorex/pi-workflows` — all tests pass including the new ones
- Coverage: every operation type has at least one success and one failure test
- The explicit-failure-on-missing-block test is present and passes

---

## Phase 5: Workflow Migrations

**Objective**: Migrate the 5 mechanical command steps to use the block step type. Each migration preserves the same data flow to downstream steps.

**Scope**: 4 workflow YAML files, 5 command steps

### Migration targets (from command step adequacy audit)

| # | Workflow | Step | Current behavior | Block operation |
|---|----------|------|-----------------|-----------------|
| 1 | do-gap | `load` | Read gaps.json, find gap by ID, fail if missing/resolved | `read: gaps` + transform for filtering |
| 2 | gap-to-phase | `load-gap` | Same as do-gap load | `read: gaps` + transform for filtering |
| 3 | gap-to-phase | `load-context` | Read phases dir + 4 blocks with silent catch {} | `readDir: phases` + `read: [architecture, conventions, gaps, inventory]` |
| 4 | gap-to-phase | `write-phase` | mkdir + write to .project/phases/{nn}-{name}.json | `write` with path |
| 5 | create-phase | `write-phase` | Same as gap-to-phase write-phase | `write` with path |

**Note on steps 1 and 2**: These steps do more than just read a block — they also filter to find a specific gap by ID and validate its status. The block step type provides the read; a follow-up transform step (or the existing expression engine) provides the filtering. This splits one command step into two simpler, typed steps: a block read and a transform. This is a net improvement — the read gets block API guarantees, and the filter logic becomes a pure expression.

**Alternative for steps 1 and 2**: If splitting into two steps is undesirable, these could remain as command steps until a `filter` operation is added to the block step type. The plan shows both options; the split approach is recommended because it eliminates the raw fs bypass immediately.

### Migration 1: do-gap `load`

**Before** (command step with raw fs.readFileSync):

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

**After** (block read + transform for filtering):

```yaml
load-blocks:
  block:
    read: gaps
  output:
    format: json

load:
  transform:
    mapping:
      gap: "${{ steps.load-blocks.output.gaps | find('id', input.gap_id) }}"
  when: "${{ steps.load-blocks.output.gaps | find('id', input.gap_id) }}"
```

**Data flow impact**: Downstream steps reference `steps.load.output.gap` — this is preserved. The `load` step still produces `{ gap: {...} }` via the transform mapping.

**Status validation note**: The original command step rejects resolved gaps (`if (gap.status === 'resolved') process.exit(1)`). This can be preserved with a `when` condition or a gate step after the transform. Since this is a validation concern rather than a data-loading concern, the recommended approach is a follow-up gate:

```yaml
load-blocks:
  block:
    read: gaps
  output:
    format: json

load:
  transform:
    mapping:
      gap: "${{ steps.load-blocks.output.gaps | find('id', input.gap_id) }}"

validate-gap:
  gate:
    check: "test '${{ steps.load.output.gap.status }}' != 'resolved'"
    onFail: fail
```

**Expression engine requirement**: The `find` filter is not currently in the expression engine's filter set. Two options: (a) add a `find(array, key, value)` filter, or (b) use a command step for the filter only (the read still goes through block API). The plan recommends option (a) — it's a small, general-purpose filter that benefits other workflows too. If deferred, option (b) keeps the migration viable with a smaller command step that receives the already-validated block data via expression rather than reading from disk.

**Pragmatic alternative if find filter is deferred**:

```yaml
load-blocks:
  block:
    read: gaps
  output:
    format: json

load:
  command: |
    node -e "
      const gaps = JSON.parse(process.argv[1]);
      const gapId = process.argv[2];
      const gap = gaps.gaps.find(g => g.id === gapId);
      if (!gap) { console.error('Gap not found: ' + gapId); process.exit(1); }
      if (gap.status === 'resolved') { console.error('Gap already resolved'); process.exit(1); }
      console.log(JSON.stringify({ gap }));
    " '${{ steps.load-blocks.output | json }}' '${{ input.gap_id }}'
  output:
    format: json
```

This hybrid approach moves the fs.readFileSync to the block step (gaining explicit failure on missing file, PROJECT_DIR indirection) while keeping the in-memory filtering in a command step (no disk I/O, just argument parsing). The block API bypass for reads is eliminated.

### Migration 2: gap-to-phase `load-gap`

Identical to migration 1 — same pattern, same code.

**Before**: Same command step as do-gap `load` (reads gaps.json, finds by ID, rejects if missing/resolved).

**After**: Same as migration 1 (block read + transform/command for filter).

### Migration 3: gap-to-phase `load-context`

**Before** (command step with 5 reads + readdir, all with catch {} → silent degradation):

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

**After** (two block steps: directory read + multi-block read):

```yaml
load-phases:
  block:
    readDir: phases
  output:
    format: json

load-context:
  block:
    read: [architecture, conventions, gaps, inventory]
    optional: [architecture, conventions, inventory]
  output:
    format: json
```

**Data flow impact**: Downstream steps reference `steps.load-context.output.architecture`, etc. These are preserved by the multi-block read's keyed output. The `phases` data moves to `steps.load-phases.output` — the downstream `author` agent input must update from:

```yaml
phases: "${{ steps.load-context.output.phases }}"
```

to:

```yaml
phases: "${{ steps.load-phases.output }}"
```

**Failure behavior change**: The original silently defaults all missing blocks to `{}`. The new version:
- `gaps` is **required** — the workflow needs gap data to function. Missing gaps.json fails the step.
- `architecture`, `conventions`, `inventory` are **optional** — these enrich context but their absence shouldn't block phase creation. They produce `null` instead of `{}`.
- Phases directory: `readDir` fails if the directory doesn't exist. If phases/ may not exist yet (first phase creation), add a `when` condition or make this step optional. Looking at the workflow, `create-phase` creates the phases directory — so on first run, phases/ won't exist. The `readDir` step should handle this. Options: (a) make readDir return `[]` when the directory doesn't exist (weakens the explicit failure guarantee), or (b) split: check if directory exists first, skip readDir if not. Recommend (a) with a flag: `readDir: phases` with `allowEmpty: true` — or simply document that readDir on a nonexistent directory returns `[]` for the specific case of .project/ subdirectories that are created on demand. The plan uses the simpler approach: readDir on a missing directory returns `[]` (analogous to "no .json files found").

**Revised readDir behavior**: If the directory does not exist, return `[]` rather than failing. The directory's absence is semantically "no items yet" for .project/ subdirectories that are created on demand. Individual file read/parse failures within an existing directory still fail explicitly. This distinguishes "directory not yet created" (normal, empty result) from "file is corrupt" (error, explicit failure).

**Gaps filtering note**: The original step filters gaps to `status === 'open'`. This filter moves to either a transform step or the downstream agent input expression:

```yaml
author:
  agent: phase-author
  input:
    gaps: "${{ steps.load-context.output.gaps.gaps | filter('status', 'open') }}"
```

If the `filter` expression filter doesn't exist yet, a transform step handles it.

### Migration 4: gap-to-phase `write-phase`

**Before** (command step with mkdir + writeFileSync, no schema validation, no atomic write):

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

**After** (block write with path override):

```yaml
write-phase:
  block:
    write:
      name: phase
      data: "${{ steps.author.output }}"
      path: "phases/${{ steps.author.output.number | padStart(2, '0') }}-${{ steps.author.output.name | slugify }}"
  output:
    format: json
```

**Data flow impact**: Downstream references `steps.write-phase.output.path`, `steps.write-phase.output.phase_number`, `steps.write-phase.output.spec_count`. The block write output is `{ written: "phase", path: ".project/phases/01-name.json" }`. The `phase_number` and `spec_count` fields are not in the block write output. Options:

(a) Add a transform step after the write to reshape:

```yaml
write-phase:
  block:
    write:
      name: phase
      data: "${{ steps.author.output }}"
      path: "phases/${{ steps.author.output.number | padStart(2, '0') }}-${{ steps.author.output.name | slugify }}"
  output:
    format: json

write-phase-summary:
  transform:
    mapping:
      path: "${{ steps.write-phase.output.path }}"
      phase_number: "${{ steps.author.output.number }}"
      spec_count: "${{ steps.author.output.specs | length }}"
```

(b) Update downstream references (completion template) to pull from `steps.author.output` directly instead of `steps.write-phase.output`:

```yaml
completion:
  message: |
    Phase ${{ steps.author.output.number }} created: ${{ steps.write-phase.output.path }}
    Specs: ${{ steps.author.output.specs | length }}
    From gap: ${{ input.gap_id }}
```

Option (b) is simpler and avoids an extra step. The completion template references are the only downstream consumers.

**Expression engine requirement**: `padStart` and `slugify` filters. `padStart(2, '0')` zero-pads numbers. `slugify` converts "Foundation Setup" to "foundation-setup". If these filters don't exist, inline the logic in the path expression or use a transform step to compute the path first.

**Pragmatic alternative if expression filters are deferred**:

```yaml
compute-phase-path:
  transform:
    mapping:
      filename: "${{ 'phases/' + steps.author.output.number + '-' + steps.author.output.name }}"

write-phase:
  block:
    write:
      name: phase
      data: "${{ steps.author.output }}"
      path: "${{ steps.compute-phase-path.output.filename }}"
  output:
    format: json
```

This uses a transform to compute the filename (where arbitrary JavaScript formatting can happen via expression) and passes the result to the block write.

### Migration 5: create-phase `write-phase`

Identical pattern to migration 4. The only difference is the slugify regex (`/[^a-z0-9]+/g` vs `/\s+/g`) and the trailing newline. The block step's `executeSubdirWrite` always appends `\n`, so the trailing newline difference is absorbed.

**Before**:

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

**After**: Same as migration 4.

### Expression engine additions needed

The migrations surface two categories of expression filter needs:

**Required for full migration** (without workaround steps):
- `find(key, value)` — find item in array by key equality
- `filter(key, value)` — filter array by key equality
- `padStart(length, char)` — zero-pad numbers/strings
- `slugify` — convert string to kebab-case

**Not required** (workarounds exist):
- All of the above can be handled by transform steps or hybrid command steps
- The migrations are viable without any expression engine changes by splitting into block + transform/command pairs

**Recommendation**: Implement the expression filters as a companion change. They're small, general-purpose, and benefit workflows beyond these 5 migrations. But the block step type itself is independently useful without them — the migrations just require an extra transform step as a shim.

### Verification for each migration

For each migrated workflow:

1. Parse the modified YAML: `parseWorkflowSpec` succeeds
2. Validate the workflow: `/workflow validate` reports no issues
3. Run the workflow in a test project with .project/ state
4. Verify downstream steps receive the same data shape
5. Verify explicit failure when a required block is missing (the whole point)

---

## Phase 6: SDK and Validation Integration

**Objective**: Ensure the block step type is visible in the workflow SDK and that `/workflow validate` checks block-specific references.

**Scope**: `workflow-sdk.ts` (validation function)

**Estimated effort**: Small

### Task 6.1: Verify stepTypes() includes block

Since `stepTypes()` returns `STEP_TYPES` directly, and Phase 1 adds the block entry to `STEP_TYPES`, this is automatic. Verify by running:

```bash
npx tsx -e "import{stepTypes}from'./packages/pi-workflows/src/workflow-sdk.js';console.log(stepTypes().map(t=>t.name))"
```

Expect: `["agent", "gate", "transform", "loop", "parallel", "pause", "command", "monitor", "block"]`

### Task 6.2: Add block-specific validation to validateWorkflow

**File**: `packages/pi-workflows/src/workflow-sdk.ts`, in the `validateWorkflow` function

Add checks for block steps:
- If a block step uses `read` with block names, optionally warn if the block name doesn't match any known schema (informational, not blocking — blocks can exist without schemas)
- If a block step uses `readDir`, check that the subdirectory name is reasonable (alphanumeric + hyphens)
- If a block step uses `write.name`, check that a schema exists for that name

These are advisory — block operations are validated at runtime by the block API.

### Task 6.3: Update declaredSchemaRefs to detect block step schema references

Block write steps with `name` field implicitly reference a schema (`block:{name}`). The `declaredSchemaRefs` introspection function should detect these.

### Verification

- `/workflow status` shows the block step type in the vocabulary
- `/workflow validate` catches block step issues (missing schema, etc.)
- All existing workflow validations still pass

---

## Phase 7: Skills Regeneration and Release

**Objective**: Regenerate SKILL.md files to reflect the new step type, commit, and release.

**Scope**: Build artifacts, version bump

### Task 7.1: Full verification pass

```bash
npm run build
npm run check
npm test
npm run skills
```

### Task 7.2: Release

```bash
npm run release:minor
```

Minor release because this adds a new step type (feature addition). No breaking changes to existing step types or workflows.

### Task 7.3: Inform user

Inform user to run `npm publish --workspaces --access public` and update pi installation.

---

## Summary of Changes by File

| File | Phase | Change |
|------|-------|--------|
| `packages/pi-workflows/src/types.ts` | 1 | Add BlockSpec types, add block field to StepSpec |
| `packages/pi-workflows/src/workflow-spec.ts` | 1 | Add to STEP_TYPES, add block parsing in validateStep |
| `packages/pi-workflows/src/step-block.ts` | 2 | New file — block step executor |
| `packages/pi-workflows/src/workflow-executor.ts` | 3 | Add import + dispatch case for block step |
| `packages/pi-workflows/src/step-block.test.ts` | 4 | New file — tests |
| `packages/pi-workflows/workflows/do-gap.workflow.yaml` | 5 | Migrate `load` step |
| `packages/pi-workflows/workflows/gap-to-phase.workflow.yaml` | 5 | Migrate `load-gap`, `load-context`, `write-phase` steps |
| `packages/pi-workflows/workflows/create-phase.workflow.yaml` | 5 | Migrate `load-context`, `write-phase` steps |
| `packages/pi-workflows/src/workflow-sdk.ts` | 6 | Add block-specific validation |
| SKILL.md files | 7 | Regenerated |

## Explicit Failure Guarantee

The block step type's central design commitment: **missing or corrupt blocks fail the step with a descriptive error**. This is the inverse of the `catch {} → empty default` pattern found in 6 of the 17 command steps audited.

The guarantee is provided at three levels:

1. **readBlock** (block-api.ts): `throw new Error('Block file not found: .project/{name}.json')` when the file doesn't exist. `throw new Error('Invalid JSON in block file: ...')` when JSON parsing fails.

2. **executeRead** (step-block.ts): Propagates readBlock errors as step failures. Only blocks explicitly listed in `optional` get null instead of error.

3. **executeReadDir** (step-block.ts): `throw new Error('Directory not found: ...')` — revised: returns `[]` for missing directories (on-demand subdirectories), throws on individual file corruption.

The `optional` escape hatch is deliberate and visible in the YAML — a workflow author must explicitly list which blocks they expect might not exist. This is a design choice: "be explicit about what you're willing to tolerate" rather than "silently tolerate everything."

## Relationship to Other Plans

- **Plan 1 (dep alignment)**: Prerequisite. Provides the named exports that step-block.ts imports.
- **Plan 3 (judgment step restructuring)**: The remaining non-mechanical command steps (verify, route, cluster, route-results) are addressed in Plan 3. They require LLM judgment, not just block I/O. The block step type handles the data loading and writing portions; Plan 3 handles the judgment portions.
- **Expression engine filters**: The `find`, `filter`, `padStart`, `slugify` filters mentioned in the migrations are optional companions. They make the YAML more concise but aren't required — transform steps serve as shims.
