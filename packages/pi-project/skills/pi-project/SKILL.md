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
| `item` | any | yes | Item object to append — must conform to block schema |

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

Subcommands: `init`, `status`, `add-work`

## Events

- `session_start`

## Bundled Resources

### defaults/ (17 files)

- `defaults/blocks/decisions.json`
- `defaults/blocks/gaps.json`
- `defaults/blocks/project.json`
- `defaults/blocks/rationale.json`
- `defaults/schemas/architecture.schema.json`
- `defaults/schemas/audit.schema.json`
- `defaults/schemas/conformance-reference.schema.json`
- `defaults/schemas/conventions.schema.json`
- `defaults/schemas/decisions.schema.json`
- `defaults/schemas/gaps.schema.json`
- `defaults/schemas/inventory.schema.json`
- `defaults/schemas/phase.schema.json`
- `defaults/schemas/project.schema.json`
- `defaults/schemas/rationale.schema.json`
- `defaults/schemas/reference-contracts.schema.json`
- `defaults/schemas/runtime-spec.schema.json`
- `defaults/schemas/state.schema.json`

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
- Recent git commits
- Current phase detection

### /project add-work

Discovers appendable blocks (blocks with array schemas), reads their schemas, and sends a structured instruction to the LLM to extract items from the conversation into the typed blocks. This is a follow-up message that triggers the LLM to use the `append-block-item` tool.

### Duplicate Detection

`append-block-item` checks for duplicate items by `id` field before appending. If an item with the same `id` already exists in the target array, it returns a message instead of appending.

### Update Check

On `session_start`, checks npm registry for newer versions of `@davidorex/pi-project-workflows` and notifies via UI if an update is available. Non-blocking — failures are silently ignored.

---

*Generated from source by `scripts/generate-skills.js` — do not edit by hand.*
