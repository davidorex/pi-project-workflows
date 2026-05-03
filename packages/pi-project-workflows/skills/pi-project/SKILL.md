---
name: pi-project
description: >
  Schema-driven project state management with typed JSON blocks, schema
  validation, planning lifecycle, and cross-block referential integrity. Use when
  managing .project/ blocks, scaffolding project structure, validating project
  state, or adding work items.
---

<tools_reference>
<tool name="append-block-item">
Append an item to an array in a project block file. Schema validation is automatic.

*Append items to project blocks (issues, decisions, or any user-defined block)*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `block` | string | yes | Block name (e.g., 'issues', 'decisions') |
| `arrayKey` | string | yes | Array key in the block (e.g., 'issues', 'decisions') |
| `item` | unknown | yes | Item object to append — must conform to block schema |
</tool>

<tool name="update-block-item">
Update fields on an item in a project block array. Finds by predicate field match.

*Update items in project blocks — change status, add details, mark resolved*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `block` | string | yes | Block name (e.g., 'issues', 'decisions') |
| `arrayKey` | string | yes | Array key in the block |
| `match` | object | yes | Fields to match (e.g., { id: 'issue-123' }) |
| `updates` | object | yes | Fields to update (e.g., { status: 'resolved' }) |
</tool>

<tool name="append-block-nested-item">
Append an item to a nested array on a parent-array item in a project block. Schema validation is automatic.

*Append items to nested arrays inside parent items (e.g., findings inside a review)*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `block` | string | yes | Block name (e.g., 'spec-reviews') |
| `arrayKey` | string | yes | Parent array key (e.g., 'reviews') |
| `match` | object | yes | Fields to match the parent item (e.g., { id: 'REVIEW-001' }) |
| `nestedKey` | string | yes | Nested array key on the matched parent (e.g., 'findings') |
| `item` | unknown | yes | Item object to append to the nested array — must conform to schema |
</tool>

<tool name="update-block-nested-item">
Update fields on a nested-array item inside a parent-array item in a project block. Finds parent and nested by predicate field match. Throws on parent or nested miss (mirrors update-block-item semantics).

*Update items inside nested arrays — change finding state, mark resolved*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `block` | string | yes | Block name (e.g., 'spec-reviews') |
| `arrayKey` | string | yes | Parent array key (e.g., 'reviews') |
| `match` | object | yes | Fields to match the parent item (e.g., { id: 'REVIEW-001' }) |
| `nestedKey` | string | yes | Nested array key on the matched parent (e.g., 'findings') |
| `nestedMatch` | object | yes | Fields to match the nested item (e.g., { id: 'F-001' }) |
| `updates` | object | yes | Fields to update on the nested item (e.g., { state: 'resolved' }) |
</tool>

<tool name="remove-block-item">
Remove items matching a predicate from a top-level array in a project block. Idempotent — returns { removed: 0 } on no match without throwing. Schema validation runs after removal.

*Remove items from project blocks — prune retracted issues, dedupe entries*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `block` | string | yes | Block name (e.g., 'issues') |
| `arrayKey` | string | yes | Top-level array key (e.g., 'issues') |
| `match` | object | yes | Fields to match (e.g., { id: 'issue-123' }) |
</tool>

<tool name="remove-block-nested-item">
Remove items matching a predicate from a nested array on a parent-array item in a project block. Throws on parent miss; returns { removed: 0 } on nested miss without throwing.

*Remove nested items — drop rejected findings, retract nested references*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `block` | string | yes | Block name (e.g., 'spec-reviews') |
| `arrayKey` | string | yes | Parent array key (e.g., 'reviews') |
| `match` | object | yes | Fields to match the parent item (e.g., { id: 'REVIEW-001' }) |
| `nestedKey` | string | yes | Nested array key on the matched parent (e.g., 'findings') |
| `nestedMatch` | object | yes | Fields to match the nested items to remove (e.g., { id: 'F-001' }) |
</tool>

<tool name="read-block-dir">
Enumerate and parse all .json files in a .project/<subdir>/ directory, returned as a sorted array. Missing directories return [].

*Enumerate project block subdirectories (phases, schemas, etc.) as parsed JSON*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `subdir` | string | yes | Subdirectory under .project/ (e.g., 'phases', 'schemas') |
</tool>

<tool name="read-block">
Read a project block file as structured JSON.

*Read a project block as structured JSON*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `block` | string | yes | Block name (e.g., 'issues', 'tasks', 'requirements') |
</tool>

<tool name="write-block">
Write or replace an entire project block with schema validation.

*Write or replace a project block with schema validation*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `block` | string | yes | Block name (e.g., 'project', 'architecture') |
| `data` | unknown | yes | Complete block data — must conform to block schema |
</tool>

<tool name="project-status">
Get derived project state — source metrics, block summaries, planning lifecycle status.

*Get project state — source metrics, block summaries, planning lifecycle status*

</tool>

<tool name="project-validate">
Validate cross-block referential integrity — check that IDs referenced across blocks exist.

*Validate cross-block referential integrity*

</tool>

<tool name="project-init">
Initialize .project/ directory with default schemas and empty block files.

*Initialize .project/ directory with default schemas and blocks*

</tool>

<tool name="resolve-item-by-id">
Look up the block, array key, and item payload for a given ID across all .project/ blocks. Returns null when no item matches. Mirrors the resolveItemById SDK function and shares its prefix-vs-block invariant — IDs whose prefix maps to a known block but live elsewhere throw at index-build time.

*Resolve a kind-prefixed ID (DEC-/FEAT-/FGAP-/issue-/REQ-/TASK-/etc.) to its owning block and item*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | yes | Kind-prefixed ID, e.g., DEC-0001 / FEAT-001 / FGAP-003 / issue-064 |
</tool>

<tool name="complete-task">
Complete a task with verification gate — requires a passing verification entry targeting the task.

*Complete a task — gates on passing verification before updating status*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `taskId` | string | yes | Task ID to complete |
| `verificationId` | string | yes | Verification entry ID (must target this task with status 'passed') |
</tool>

</tools_reference>

<commands_reference>
<command name="/project">
Project state management

Subcommands: `init`, `status`, `add-work`, `validate`, `help`
</command>

</commands_reference>

<events>
`session_start`
</events>

<bundled_resources>
2 schemas, 22 defaults bundled.
See references/bundled-resources.md for full inventory.
</bundled_resources>

<planning_vocabulary>

**Block Types:**

| Block | Title | Array Key | Item Fields |
|-------|-------|-----------|-------------|
| `architecture` | Architecture | `modules` | name, file, responsibility, dependencies? (array), lines? (integer) |
| `audit` | Audit | `checks` | id, description, status (string (pass|fail|warn|skip)), category?, details? |
| `conformance-reference` | Conformance Reference | `principles` | id, name, description?, rules (array) |
| `decisions` | Decisions | `decisions` | id, decision, rationale, phase? (string|integer), status (string (decided|tentative|revisit|superseded)), context?, task? |
| `domain` | Domain Knowledge | `entries` | id, title, content, category (string (research|reference|domain-rule|prior-art|constraint)), source?, confidence? (string (high|medium|low)), related_requirements? (array), tags? (array) |
| `handoff` | Handoff | `current_tasks` |  |
| `issues` | Issues | `issues` | id, title, body, location, status (string (open|resolved|deferred)), category (string (primitive|issue|cleanup|capability|composition)), priority (string (low|medium|high|critical)), package, source? (string (human|agent|monitor|workflow)), resolved_by? |
| `phase` | Phase | `success_criteria` | criterion, verify_method (string (command|inspect|test)) |
| `project` | Project Identity | `target_users` |  |
| `rationale` | Design Rationale | `rationales` | id, title, narrative, related_decisions? (array), phase? (string|integer), context? |
| `requirements` | Requirements | `requirements` | id, description, type (string (functional|non-functional|constraint|integration)), status (string (proposed|accepted|deferred|implemented|verified)), priority (string (must|should|could|wont)), acceptance_criteria? (array), source? (string (human|agent|analysis)), traces_to? (array), depends_on? (array) |
| `tasks` | Tasks | `tasks` | id, description, status (string (planned|in-progress|completed|blocked|cancelled)), phase? (string|integer), files? (array), acceptance_criteria? (array), depends_on? (array), assigned_agent?, verification?, notes? |
| `verification` | Verification | `verifications` | id, target, target_type (string (task|phase|requirement)), status (string (passed|failed|partial|skipped)), method (string (command|inspect|test)), evidence?, timestamp?, criteria_results? (array) |

**Status Enums:**

| Block | Field | Values |
|-------|-------|--------|
| `audit` | `status` | pass, fail, warn, skip |
| `audit` | `severity` | error, warning, info |
| `decisions` | `status` | decided, tentative, revisit, superseded |
| `domain` | `category` | research, reference, domain-rule, prior-art, constraint |
| `domain` | `confidence` | high, medium, low |
| `issues` | `status` | open, resolved, deferred |
| `issues` | `category` | primitive, issue, cleanup, capability, composition |
| `issues` | `priority` | low, medium, high, critical |
| `issues` | `source` | human, agent, monitor, workflow |
| `phase` | `status` | planned, in-progress, completed |
| `phase` | `verify_method` | command, inspect, test |
| `phase` | `status` | planned, in-progress, completed |
| `project` | `status` | inception, planning, development, maintenance, complete |
| `requirements` | `type` | functional, non-functional, constraint, integration |
| `requirements` | `status` | proposed, accepted, deferred, implemented, verified |
| `requirements` | `priority` | must, should, could, wont |
| `requirements` | `source` | human, agent, analysis |
| `tasks` | `status` | planned, in-progress, completed, blocked, cancelled |
| `verification` | `target_type` | task, phase, requirement |
| `verification` | `status` | passed, failed, partial, skipped |
| `verification` | `method` | command, inspect, test |

</planning_vocabulary>

<objective>
pi-project manages structured project state in `.project/` — a directory of JSON block files validated against schemas.
</objective>

<block_files>
Blocks are JSON files in `.project/` (e.g., `gaps.json`, `decisions.json`). Each block has a corresponding schema in `.project/schemas/`. When you write to a block via the tools, the data is validated against its schema before persisting. Writes are atomic (tmp file + rename).
</block_files>

<schema_validation>
Every block write validates against `.project/schemas/<blockname>.schema.json`. If the schema file doesn't exist, writes proceed without validation. Validation errors include the specific JSON Schema violations.
</schema_validation>

<project_init>
`/project init` scaffolds the `.project/` directory with default schemas and empty block files from the package's `defaults/` directory. Idempotent — skips files that already exist.
</project_init>

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
- **handoff.json** — session context snapshot (created on-demand, not by /project init)
- **verification.json** — completion evidence per task/phase/requirement
- **conformance-reference.json** — executable code conventions with principles, rules, check methods (grep/command/ast/inspect), and check patterns. Ships empty, populated per-project by agents or users.
- **audit** (schema only, no default block) — structured audit results produced by running conformance checks.

All schemas are user-customizable. Edit `.project/schemas/*.schema.json` to add fields, change enums, or restructure blocks without modifying code.
</planning_lifecycle>

<update_check>
On `session_start`, checks npm registry for newer versions of `@davidorex/pi-project-workflows` and notifies via UI if an update is available. Non-blocking — failures are silently ignored.
</update_check>

<success_criteria>
- `.project/` directory exists with schemas and block files after `/project init`
- Block writes validate against schemas — invalid data rejected with specific error
- `/project status` returns current derived state without errors
- `/project validate` returns no errors for well-formed cross-block references
- `append-block-item` rejects duplicate IDs
- Schema customizations (field additions, enum changes) take effect on next write
</success_criteria>

*Generated from source by `scripts/generate-skills.js` — do not edit by hand.*
