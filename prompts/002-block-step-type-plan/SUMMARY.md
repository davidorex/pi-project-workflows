# Block Step Type — Plan Summary

**One-liner:** In-process `block` step type that reads/writes `.project/` files through the block API, replacing command-step `node -e` subprocesses for mechanical block I/O.

## YAML Syntax Reference

```yaml
# Read one or more blocks
step-name:
  block:
    read:
      - gaps                              # required — fails if missing
      - { name: architecture, optional: true }  # optional — null if missing

# Read all .json files from a .project/ subdirectory
step-name:
  block:
    readDir: phases                        # returns [] for missing dir

# Write a top-level block (schema validated, atomic)
step-name:
  block:
    write:
      name: gaps
      data: "${{ steps.transform.output }}"

# Write to a subdirectory (schema from name, path from path/filename)
step-name:
  block:
    write:
      name: phase
      path: phases
      filename: "${{ output.number | padStart(2, '0') }}-${{ output.name | slugify }}"
      data: "${{ steps.author.output }}"

# Append item to array within a block
step-name:
  block:
    append:
      name: gaps
      arrayKey: gaps
      item: "${{ steps.create.output }}"

# Update item by predicate match
step-name:
  block:
    update:
      name: gaps
      arrayKey: gaps
      match: { id: "${{ input.gap_id }}" }
      set: { status: resolved, resolved_by: do-gap-workflow }
```

## Phases

| # | Phase | Files | Tasks |
|---|-------|-------|-------|
| 1 | Types + Registry | `types.ts`, `workflow-spec.ts` | `BlockSpec` types, `STEP_TYPES` entry, `validateStep` parsing |
| 2 | Step Executor | `step-block.ts` (new), `workflow-executor.ts` | Executor module, `executeStepByType` dispatch, `isRetryableStepType` |
| 3 | Expression Filters | `expression.ts` | `find(key, value)`, `padStart(len, fill)`, `slugify`, filter argument syntax |
| 4 | SDK + Validation | `workflow-sdk.ts` | Block operation validation in `validateWorkflow` |
| 5 | Tests | `step-block.test.ts` (new), `workflow-spec.test.ts`, `expression.test.ts` | Read/write/append/update tests, parsing tests, filter tests |
| 6 | Workflow Migrations | 3 workflow YAML files | 5 command steps → block steps |
| 7 | Completion Updates | 3 workflow YAML files | Fix step output references broken by migrations |
| 8 | Skills Regen | Generated files | `npm run skills` |

## Migrations

| Workflow | Step | Operation | Notes |
|----------|------|-----------|-------|
| `do-gap` | `load` | `block: { read: [gaps] }` + transform + gates | Expands to 4 steps (read, extract via `find`, validate existence, validate status) |
| `gap-to-phase` | `load-gap` | `block: { read: [gaps] }` + transform + gates | Same pattern as do-gap load |
| `gap-to-phase` | `load-context` | `block: { read: [..., optional] }` + `block: { readDir: phases }` + transform | Replaces silent-degradation try/catch pattern with optional reads |
| `gap-to-phase` | `write-phase` | `block: { write: { name: phase, path: phases, filename: "...", data: "..." } }` | Gains schema validation + atomic write |
| `create-phase` | `load-context` + `write-phase` | Same patterns as gap-to-phase | Identical migration shape |

## New Expression Filters

| Filter | Syntax | Purpose |
|--------|--------|---------|
| `find` | `${{ arr \| find('key', value) }}` | Find first array item matching field/value |
| `padStart` | `${{ val \| padStart(2, '0') }}` | Pad string to length with fill character |
| `slugify` | `${{ val \| slugify }}` | Lowercase kebab-case conversion |

Filter argument syntax `filterName(arg1, arg2)` is new — existing filters continue to work without arguments.

## Blockers

None. Plan 1 (dep alignment) is the prerequisite and is assumed complete.

## Next Step

Execute this plan. Phase 1 (types + registry) and Phase 3 (expression filters) can run in parallel as neither depends on the other. All other phases have sequential dependencies as shown in the plan's execution order table.
