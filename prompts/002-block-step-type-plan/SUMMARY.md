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
| 2. Step executor implementation | New step-block.ts | Medium |
| 3. Executor dispatch integration | workflow-executor.ts | Small |
| 4. Tests | New step-block.test.ts | Medium |
| 5. Workflow migrations (5 steps) | 3 workflow YAML files | Medium |
| 6. SDK + validation integration | workflow-sdk.ts | Small |
| 7. Skills regeneration + release | Build artifacts | Small |

## Migration Scope — 5 Mechanical Command Steps

| Workflow | Step | Current | After |
|----------|------|---------|-------|
| do-gap | `load` | fs.readFileSync + find/filter | `block: { read: gaps }` + transform |
| gap-to-phase | `load-gap` | fs.readFileSync + find/filter | `block: { read: gaps }` + transform |
| gap-to-phase | `load-context` | 5x readFileSync with catch {} | `block: { readDir: phases }` + `block: { read: [...] }` |
| gap-to-phase | `write-phase` | mkdir + writeFileSync | `block: { write: { name: phase, path: "phases/..." } }` |
| create-phase | `write-phase` | mkdir + writeFileSync | `block: { write: { name: phase, path: "phases/..." } }` |

Additionally, `create-phase` `load-context` follows the same pattern as `gap-to-phase` `load-context` and migrates identically.

## Decisions Embedded in Plan

1. **readDir on missing directory returns `[]`** — on-demand subdirectories (.project/phases/) may not exist yet. Corrupt files within existing directories still fail explicitly.
2. **`optional` field for multi-block read** — required blocks fail, optional ones produce `null`. The YAML makes the choice visible.
3. **Subdirectory write via `path` override** — schema resolved from `name`, file written to `path`. Avoids modifying the block API for phase file patterns.
4. **Synchronous execution** — like transform, no async needed. All block API operations are synchronous.

## Decisions Needed

1. **Expression filters** (`find`, `filter`, `padStart`, `slugify`): Needed for concise migration YAML. Without them, transform steps serve as shims. Recommend implementing as a companion change — they benefit workflows beyond these 5 migrations.
2. **load + filter split vs. hybrid command**: Migrations 1-2 (do-gap `load`, gap-to-phase `load-gap`) can split into block read + transform, or use block read + smaller command step (no disk I/O, just in-memory filter). The split is cleaner but requires the `find` expression filter. Plan shows both options.

## Next Step

Plan 3: Judgment step restructuring — addresses the 6 `judgment-as-assumption` command steps (verify, route, cluster, route-results, update-audit) that require LLM evaluation rather than mechanical block I/O. The block step type handles data loading/writing portions; Plan 3 handles the semantic judgment portions.
