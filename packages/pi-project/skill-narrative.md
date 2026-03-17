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
