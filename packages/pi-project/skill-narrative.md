---
name: pi-project
description: >
  Schema-driven project state management with typed JSON blocks, schema validation,
  planning lifecycle, and cross-block referential integrity. Use when managing .project/
  blocks, scaffolding project structure, validating project state, or adding work items.
---

<objective>
pi-project manages structured project state in `.project/` — a directory of JSON block files validated against schemas.
</objective>

<block_files>
Blocks are JSON files in `.project/` (e.g., `gaps.json`, `decisions.json`). Each block has a corresponding schema in `.project/schemas/`. When you write to a block via the tools, the data is validated against its schema before persisting. Writes are atomic (tmp file + rename).
</block_files>

<schema_validation>
Every block write validates against the bundled schema at `<package>/defaults/schemas/<blockname>.schema.json`. If no bundled schema matches the block name, writes proceed without validation. Validation errors include the specific JSON Schema violations. Schemas are not user-editable from the project directory — `.project/schemas/` (if present from a prior version) is silently ignored.
</schema_validation>

<two_tier_discovery>
Block files resolve from two tiers, project tier first. The project tier (`<projectRoot>/.project/<name>.json`) is found by walking up from cwd to the first `.git` boundary; the bundled tier (`<package>/defaults/blocks/<name>.json`) ships empty scaffolds for the lifecycle blocks. Reads fall through: project tier wins when present, bundled tier fills in when absent. Throw only when neither tier has the block.

Writes always land in the project tier. On first write to a never-materialized block, `appendToBlock` and `updateItemInBlock` lazy-materialize the bundled scaffold (preserving non-array sibling fields) before applying the change. `writeBlock` writes directly to the project tier and never touches the bundled tier.

There is no init step. A fresh project gets bundled defaults transparently on first read; `.project/` is created lazily when a write happens.
</two_tier_discovery>

<project_status>
`/project status` derives project state dynamically from the filesystem:
- Source file count and line count (`.ts` files excluding tests)
- Test count and test file count
- Schema count, block count, phase count
- Block summaries with array item counts and status distributions
- Requirements summary (total, by status, by priority) — from requirements.json
- Tasks summary (total, by status) — from tasks.json
- Domain entry count — from domain.json
- Verification summary (total, passed, failed) — from verification.json
- Handoff presence — whether handoff.json exists
- Recent git commits
- Current phase detection
</project_status>

<project_add_work>
`/project add-work` discovers appendable blocks (blocks with array schemas), reads their schemas, and sends a structured instruction to the LLM to extract items from the conversation into the typed blocks. This is a follow-up message that triggers the LLM to use the `append-block-item` tool.
</project_add_work>

<duplicate_detection>
`append-block-item` checks for duplicate items by `id` field before appending. If an item with the same `id` already exists in the target array, it returns a message instead of appending.
</duplicate_detection>

<project_validate>
`/project validate` checks cross-block referential integrity:
- task.phase references a valid phase
- task.depends_on references valid task IDs
- decision.phase references a valid phase
- gap.resolved_by references a valid ID
- requirement.traces_to references valid phase/task IDs
- requirement.depends_on references valid requirement IDs
- verification.target references a valid target ID
- rationale.related_decisions references valid decision IDs

Returns errors (broken dependency references) and warnings (unresolved cross-references).
</project_validate>

<planning_lifecycle>
The default schemas support a full planning lifecycle:
- **project.json** — identity, vision, goals, constraints, scope, status
- **domain.json** — research findings, reference material, domain rules
- **requirements.json** — functional/non-functional requirements with MoSCoW priority and lifecycle states
- **architecture.json** — modules, patterns, boundaries
- **phases/** — ordered delivery units with goals, success criteria, inputs/outputs
- **tasks.json** — standalone task registry with status lifecycle and phase linkage
- **decisions.json** — choices with rationale and phase association
- **gaps.json** — open items with priority, category, and resolution tracking
- **rationale.json** — design rationale with decision cross-references
- **handoff.json** — session context snapshot (no bundled scaffold; created on-demand)
- **verification.json** — completion evidence per task/phase/requirement
- **conformance-reference.json** — executable code conventions with principles, rules, check methods (grep/command/ast/inspect), and check patterns. Ships empty, populated per-project by agents or users.
- **audit** (schema only, no default block) — structured audit results produced by running conformance checks.

Schemas resolve from the bundled tier only. To customize the substrate, fork the package or contribute a PR — `.project/schemas/` hand-edits are silently ignored after the two-tier migration.
</planning_lifecycle>

<update_check>
On `session_start`, checks npm registry for newer versions of `@davidorex/pi-project-workflows` and notifies via UI if an update is available. Non-blocking — failures are silently ignored.
</update_check>

<success_criteria>
- Bundled defaults serve transparently from `<package>/defaults/` on first read; `.project/` is created lazily on first write
- Block writes validate against schemas — invalid data rejected with specific error
- `/project status` returns current derived state without errors
- `/project validate` returns no errors for well-formed cross-block references
- `append-block-item` rejects duplicate IDs
- Schema customizations (field additions, enum changes) take effect on next write
</success_criteria>
