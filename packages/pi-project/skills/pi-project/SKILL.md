# @davidorex/pi-project

> Schema-driven project state management for Pi

## Tools

### append-block-item

Append an item to an array in a project block file. Schema validation is automatic.

*Append items to project blocks (gaps, decisions, or any user-defined block)*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `block` | string | yes | Block name (e.g., 'gaps', 'decisions') |
| `arrayKey` | string | yes | Array key in the block (e.g., 'gaps', 'decisions') |
| `item` | unknown | yes | Item object to append — must conform to block schema |

### update-block-item

Update fields on an item in a project block array. Finds by predicate field match.

*Update items in project blocks — change status, add details, mark resolved*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `block` | string | yes | Block name (e.g., 'gaps', 'decisions') |
| `arrayKey` | string | yes | Array key in the block |
| `match` | object | yes | Fields to match (e.g., { id: 'gap-123' }) |
| `updates` | object | yes | Fields to update (e.g., { status: 'resolved' }) |

## Commands

### /project

Project state management

Subcommands: `init`, `status`, `add-work`, `validate`

## Events

- `session_start`

## Bundled Resources

### defaults/ (26 files)

- `defaults/blocks/decisions.json`
- `defaults/blocks/domain.json`
- `defaults/blocks/gaps.json`
- `defaults/blocks/project.json`
- `defaults/blocks/rationale.json`
- `defaults/blocks/requirements.json`
- `defaults/blocks/tasks.json`
- `defaults/blocks/verification.json`
- `defaults/schemas/architecture.schema.json`
- `defaults/schemas/audit.schema.json`
- `defaults/schemas/conformance-reference.schema.json`
- `defaults/schemas/conventions.schema.json`
- `defaults/schemas/decisions.schema.json`
- `defaults/schemas/domain.schema.json`
- `defaults/schemas/gaps.schema.json`
- `defaults/schemas/handoff.schema.json`
- `defaults/schemas/inventory.schema.json`
- `defaults/schemas/phase.schema.json`
- `defaults/schemas/project.schema.json`
- `defaults/schemas/rationale.schema.json`
- `defaults/schemas/reference-contracts.schema.json`
- `defaults/schemas/requirements.schema.json`
- `defaults/schemas/runtime-spec.schema.json`
- `defaults/schemas/state.schema.json`
- `defaults/schemas/tasks.schema.json`
- `defaults/schemas/verification.schema.json`

---

## How It Works

pi-project manages structured project state in `.project/` — a directory of JSON block files validated against schemas.

### Block Files

Blocks are JSON files in `.project/` (e.g., `gaps.json`, `decisions.json`). Each block has a corresponding schema in `.project/schemas/`. When you write to a block via the tools, the data is validated against its schema before persisting. Writes are atomic (tmp file + rename).

### Schema Validation

Every block write validates against `.project/schemas/<blockname>.schema.json`. If the schema file doesn't exist, writes proceed without validation. Validation errors include the specific JSON Schema violations.

### /project init

Scaffolds the `.project/` directory with default schemas and empty block files from the package's `defaults/` directory. Idempotent — skips files that already exist.

### /project status

Derives project state dynamically from the filesystem:
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

### /project add-work

Discovers appendable blocks (blocks with array schemas), reads their schemas, and sends a structured instruction to the LLM to extract items from the conversation into the typed blocks. This is a follow-up message that triggers the LLM to use the `append-block-item` tool.

### Duplicate Detection

`append-block-item` checks for duplicate items by `id` field before appending. If an item with the same `id` already exists in the target array, it returns a message instead of appending.

### /project validate

Checks cross-block referential integrity:
- task.phase references a valid phase
- task.depends_on references valid task IDs
- decision.phase references a valid phase
- gap.resolved_by references a valid ID
- requirement.traces_to references valid phase/task IDs
- requirement.depends_on references valid requirement IDs
- verification.target references a valid target ID
- rationale.related_decisions references valid decision IDs

Returns errors (broken dependency references) and warnings (unresolved cross-references).

### Planning Lifecycle Blocks

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
- **handoff.json** — session context snapshot (created on-demand, not by /project init)
- **verification.json** — completion evidence per task/phase/requirement

All schemas are user-customizable. Edit `.project/schemas/*.schema.json` to add fields, change enums, or restructure blocks without modifying code.

### Update Check

On `session_start`, checks npm registry for newer versions of `@davidorex/pi-project-workflows` and notifies via UI if an update is available. Non-blocking — failures are silently ignored.

---

*Generated from source by `scripts/generate-skills.js` — do not edit by hand.*
