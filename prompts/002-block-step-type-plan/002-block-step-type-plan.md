<objective>
Create a complete implementation plan for a new `block` step type in the workflow executor. This plan will be executed by a subagent — every task must be specific, every file must be named, every YAML syntax example must be final. Zero open questions. Zero alternatives.
</objective>

<constraints>
These are resolved. Do not revisit, question, or offer alternatives:

- Prerequisite: Plan 1 (dep alignment) complete. pi-project is a direct dependency with named exports.
- The block step type runs in-process like transform. No LLM. No subprocess.
- YAML syntax: `block: { read: [...] }`, `block: { readDir: ... }`, `block: { write: {...} }`, `block: { append: {...} }`, `block: { update: {...} }`.
- `optional` field for multi-block reads. Required blocks fail explicitly. Optional blocks produce null.
- `readDir` returns `[]` for missing directories. Corrupt files in existing directories fail.
- Subdirectory writes use `path` override. Schema resolved from `name`.
- Synchronous execution. All block API calls are synchronous.
- Expression filters (`find`, `filter`, `padStart`, `slugify`) ARE in scope — they are needed for concise migrations and benefit all workflows. Implement as part of this plan in expression.ts.
- Migrations use block read + expression filters. No transform step shims. No command step shims.
- Status validation (rejecting resolved gaps) uses a gate step after the block read.
- 5 mechanical command steps migrate to block steps. Before/after YAML for each.
- STEP_TYPES registration, validateStep parsing, executeSingleStep dispatch, SDK reflection, template-input validation integration.
</constraints>

<context>
Read these files:
- packages/pi-workflows/src/step-transform.ts (closest pattern)
- packages/pi-workflows/src/workflow-spec.ts (STEP_TYPES, validateStep)
- packages/pi-workflows/src/workflow-executor.ts (executeSingleStep dispatch)
- packages/pi-workflows/src/expression.ts (FILTER_NAMES, filter implementation)
- packages/pi-workflows/src/types.ts (StepSpec, StepResult)
- packages/pi-project/src/block-api.ts (readBlock, writeBlock, appendToBlock, updateItemInBlock)
- packages/pi-project/src/project-dir.ts (PROJECT_DIR)

Read the 5 mechanical command steps to migrate:
- packages/pi-workflows/workflows/do-gap.workflow.yaml (load step)
- packages/pi-workflows/workflows/gap-to-phase.workflow.yaml (load-gap, load-context, write-phase steps)
- packages/pi-workflows/workflows/create-phase.workflow.yaml (load-context, write-phase steps)

Read docs/reports/command-step-adequacy-audit.md for the mechanical classification.
Read docs/reports/block-api-bypass-audit.md for the bypass inventory.
</context>

<output_structure>
Save to: `./prompts/002-block-step-type-plan/block-step-type-plan.md`
Save summary to: `./prompts/002-block-step-type-plan/SUMMARY.md`

Structure as phases. Every task names the file and exact change. YAML examples are final syntax, not proposals. Before/after for every migrated step.

SUMMARY.md: one-liner, YAML syntax reference, phase table, migration table, blockers, next step. No decisions. No open questions.
</output_structure>

<verification>
After plan execution:
- `npm run build` passes
- `npm run check` passes
- `npm test` — all existing + new tests pass, 0 failures
- New step type appears in `/workflow status` output
- `/workflow validate` checks block step operations
- `grep -rn 'fs.readFileSync.*\.project' packages/pi-workflows/workflows/do-gap.workflow.yaml` returns only non-mechanical steps
- Expression filters `find`, `filter`, `padStart`, `slugify` exist in FILTER_NAMES
</verification>
