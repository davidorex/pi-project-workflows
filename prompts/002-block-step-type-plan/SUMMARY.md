# Block Step Type — Plan Summary

**One-liner**: An in-process step type that calls the block API directly for validated, atomic .project/ I/O — replacing raw fs operations with schema-checked, explicitly-failing block reads and writes.

## YAML Syntax Overview

```yaml
# Read single block (fails if missing)
load: { block: { read: gaps }, output: { format: json } }

# Read multiple blocks (optional ones produce null, required ones fail)
load: { block: { read: [arch, gaps], optional: [arch] }, output: { format: json } }

# Read directory (.project/phases/*.json → sorted array)
load: { block: { readDir: phases }, output: { format: json } }

# Write with schema validation + atomic write
save: { block: { write: { name: tasks, data: "${{ steps.plan.output }}" } } }

# Write to subdirectory path
save: { block: { write: { name: phase, data: "${{ ... }}", path: "phases/01-name" } } }

# Append to block array
add: { block: { append: { name: gaps, key: gaps, item: "${{ ... }}" } } }

# Update item in block array
fix: { block: { update: { name: gaps, key: gaps, match: { id: g1 }, set: { status: resolved } } } }
```

## Phase Breakdown

| Phase | Scope | Effort |
|-------|-------|--------|
| 1. Type definitions + STEP_TYPES registration | types.ts, workflow-spec.ts | Small |
| 2. Step executor implementation | New step-block.ts, expression.ts (3 zero-arg filters) | Medium |
| 3. Executor dispatch integration | workflow-executor.ts (dispatch + isRetryableStepType) | Small |
| 4. Tests | New step-block.test.ts | Medium |
| 5. Workflow migrations (6 steps) | 3 workflow YAML files | Medium |
| 6. SDK + validation integration | workflow-sdk.ts | Small |
| 7. Skills regeneration + release | Build artifacts | Small |

## Migration Scope — 6 Mechanical Command Steps

| Workflow | Step | Current | After |
|----------|------|---------|-------|
| do-gap | `load` | fs.readFileSync + find/filter | `block: { read: gaps }` + command step shim for find/validate |
| gap-to-phase | `load-gap` | fs.readFileSync + find/filter | `block: { read: gaps }` + command step shim for find/validate |
| gap-to-phase | `load-context` | 5x readFileSync with catch {} | `block: { readDir: phases }` + `block: { read: [...] }` + command step shim for gaps filtering |
| gap-to-phase | `write-phase` | mkdir + writeFileSync | command step for path computation + `block: { write: { name: phase, path: "..." } }` |
| create-phase | `load-context` | 5x readFileSync with catch {} | Same pattern as gap-to-phase |
| create-phase | `write-phase` | mkdir + writeFileSync | Same pattern as gap-to-phase |

## Design

- `readDir` on missing directory returns `[]`. Corrupt files in existing directories fail.
- `optional` field for multi-block read — required blocks fail, optional ones produce `null`.
- Subdirectory write via `path` override — schema resolved from `name`, file written to `path`.
- Synchronous execution — like transform, no async.
- Three zero-arg filters added to expression.ts: `last`, `first`, `slugify`. Parametric filters out of scope — migrations use command step shims for find/filter/padStart.

## Next Step

Plan 3: Judgment step restructuring — addresses the 6 `judgment-as-assumption` command steps (verify, route, cluster, route-results, update-audit) that require LLM evaluation rather than mechanical block I/O. The block step type handles data loading/writing portions; Plan 3 handles the semantic judgment portions.
