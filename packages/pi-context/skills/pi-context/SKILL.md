---
name: pi-context
description: >
  Schema-driven project state management with typed JSON blocks, schema
  validation, substrate config, lens views, closure-table relations, and
  cross-block referential integrity. Use when managing .project/ blocks,
  scaffolding project structure, installing block kinds from the registry,
  validating project state, rendering lens views, or adding work items.
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

<tool name="append-relation">
Append a closure-table relation (edge: parent, child, relation_type, optional ordinal) to relations.json. Shape is AJV-validated; an exact-duplicate edge (same parent+child+relation_type) is a no-op. Reference integrity (endpoints resolve, relation_type registered, no cycle) is NOT checked here — run project-validate after. Creates relations.json if absent.

*Create a relation/edge between two items (parent→child under a relation_type)*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `parent` | string | yes | Canonical id (or lens bin name) of the parent endpoint |
| `child` | string | yes | Canonical id of the child endpoint |
| `relation_type` | string | yes | Registered relation_type canonical_id / hierarchy edge type / lens id |
| `ordinal` | integer | no | Optional sibling-ordering within (parent, relation_type) |
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

<tool name="read-config">
Read the substrate config.json as structured JSON — vocabulary, lenses, relation_types, status_buckets, display_strings, layers, block_kinds, installed_schemas, installed_blocks.

*Read project config — vocabulary, lenses, relation_types, status_buckets*

</tool>

<tool name="context-current-state">
Derive 'where are we + what's next' purely from .project substrate — focus, in-flight tasks, ranked atomic-next actions (open framework-gaps then unblocked planned tasks), and blocked tasks. No writes; nothing hand-stored.

*Derive current project state — focus, in-flight, next actions, blocked*

</tool>

<tool name="rename-canonical-id">
Rename a canonical_id (kind: item | relation_type | lens | layer) from oldId to newId across all substrate surfaces that carry it as DATA — item home block + relations.json edges, or the relevant config registries. Out-of-substrate occurrences (analysis MDs, git history) are REPORTED, never rewritten. block_kind renames are unsupported (filesystem cascade). Use dryRun to preview the would-change counts without writing.

*Rename a canonical_id (item/relation_type/lens/layer) across substrate; dryRun to preview*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `kind` | string | yes | One of: item | relation_type | lens | layer |
| `oldId` | string | yes | Current canonical_id to rename from |
| `newId` | string | yes | New canonical_id to rename to |
| `dryRun` | boolean | no | Compute would-change counts without writing |
</tool>

<tool name="read-schema">
Read a substrate schema by name as parsed JSON. Returns null when the schema file is absent.

*Read a block schema as structured JSON*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `schemaName` | string | yes | Schema name without extension (e.g., 'tasks', 'decisions', 'issues') |
</tool>

<tool name="project-init">
Initialize .project/ directory with default schemas and empty block files.

*Initialize .project/ directory with default schemas and blocks*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `contextDir` | string | yes | Substrate dir name (e.g. .project). Required per DEC-0015 — no default. |
</tool>

<tool name="filter-block-items">
Filter the array items of a block by a single-field predicate (eq / neq / in / matches). Discovers the single top-level array property in the block; items missing the predicate field are never matched. Wraps the canonical readBlock + caller-side filter into one queryable surface; never mutates the block.

*Filter a block's items by a predicate — eq / neq / in / matches against a single field*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `block` | string | yes | Block name (e.g., 'tasks', 'decisions', 'framework-gaps', 'context-contracts') |
| `field` | string | yes | Item field to test (e.g., 'status', 'priority', 'id') |
| `op` | unknown | yes | Comparison operator: eq (===), neq (!==), in (value is array, item[field] in it), matches (regexp test on string) |
| `value` | unknown | yes | Comparison value — scalar for eq/neq, array for in, regexp pattern string for matches |
</tool>

<tool name="resolve-item-by-id">
Look up the block, array key, and item payload for a given ID across all .project/ blocks. Returns null when no item matches. Mirrors the resolveItemById SDK function and shares its prefix-vs-block invariant — IDs whose prefix maps to a known block but live elsewhere throw at index-build time.

*Resolve a kind-prefixed ID (DEC-/FEAT-/FGAP-/issue-/REQ-/TASK-/etc.) to its owning block and item*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | yes | Kind-prefixed ID, e.g., DEC-0001 / FEAT-001 / FGAP-003 / issue-064 |
</tool>

<tool name="resolve-items-by-id">
Bulk variant of resolve-item-by-id — resolve N kind-prefixed ids against a single buildIdIndex traversal. Returns an object mapping each input id to its ItemLocation (block / arrayKey / item) or null when not found. Coexists with the singular resolve-item-by-id tool; bulk collapses the N×singular-call pattern for callers resolving multiple ids in one render pass.

*Resolve a batch of kind-prefixed ids (DEC-/FGAP-/TASK-/issue-/REQ-/...) in one call*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ids` | array | yes | Array of kind-prefixed ids (DEC-/FGAP-/TASK-/issue-/REQ-/...) to resolve in one call |
</tool>

<tool name="complete-task">
Complete a task with verification gate — requires a passing verification entry targeting the task.

*Complete a task — gates on passing verification before updating status*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `taskId` | string | yes | Task ID to complete |
| `verificationId` | string | yes | Verification entry ID (must target this task with status 'passed') |
</tool>

<tool name="project-validate-relations">
Validate substrate relations.json edges against config-declared lenses + hierarchy + relation_types and the cross-block id index. Returns SubstrateValidationResult with status (clean/warnings/invalid) and per-issue diagnostics.

*Validate substrate relations against config + items*

</tool>

<tool name="project-edges-for-lens">
Materialize the Edge[] for a named lens — synthetic edges from derived_from_field for auto-derived lenses; authored edges filtered by relation_type for hand-curated lenses; unioned items from composition members for kind=composition lenses.

*Materialize edges for a named lens (auto-derived or hand-curated)*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `lensId` | string | yes | Lens id from config.lenses[].id |
</tool>

<tool name="project-walk-descendants">
Walk closure-table descendants of a parent id under a given relation_type. Returns string[] of descendant ids (may be empty if no children or relations.json absent).

*Walk closure-table descendants under a relation_type*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `parentId` | string | yes | Parent id (canonical id or lens bin name) |
| `relationType` | string | yes | Relation type from config.relation_types[].canonical_id |
</tool>

<tool name="walk-ancestors">
Walk closure-table ancestors of an item id under a given relation_type — reverse-direction counterpart to project-walk-descendants. Returns string[] of ancestor ids (may be empty if no parents or relations.json absent).

*Walk closure-table ancestors under a relation_type*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `itemId` | string | yes | Child item id whose ancestors are sought |
| `relationType` | string | yes | Relation type from config.relation_types[].canonical_id |
</tool>

<tool name="find-references">
Find all closure-table edges incident on an item id (inbound, outbound, or both). Returns Edge[] preserving relation_type + ordinal per record — edge-level view, not the id-chain projection that walk-ancestors / project-walk-descendants emit.

*Find closure-table edges incident on an item id*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `itemId` | string | yes | Item id whose incident edges are sought |
| `direction` | unknown | no | inbound: edges where child === itemId; outbound: edges where parent === itemId; both: union (default). |
</tool>

<tool name="gather-execution-context">
Compose a ContextBundle for a work-unit by reading its context-contract (by unit_kind) and walking declared relation_types bidirectionally per direction semantic. Returns unit + perRelationType buckets of resolved items + traversal_depth + scoped_at. Per DEC-0017 substrate primitive serving harness-confined dispatch.

*Compose ContextBundle for unit + context-contract-declared bundle_relation_types*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `unitId` | string | yes | Work-unit id (e.g. TASK-NNN / DEC-NNNN / FGAP-NNN) |
| `kind` | string | yes | Unit-kind type tag (e.g. 'task', 'decision', 'verification') matching a context-contract entry's unit_kind |
| `maxDepth` | integer | no | Override per-relation-type max_depth via Math.min against each spec.max_depth |
</tool>

<tool name="project-roadmap-load">
Load a roadmap by id and return the materialized RoadmapView (phases, lens-views, status rollup, milestone resolution, scoped phase_depends_on edges, topo-ordered phaseOrder + cycles). Per DEC-0012 phase ordering lives in relations.json with relation_type='phase_depends_on'.

*Load a roadmap by id*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `roadmapId` | string | yes | ROADMAP-NNN id from <config.root>/roadmap.json |
</tool>

<tool name="project-roadmap-render">
Render a roadmap by id as pure-textual markdown — phase order list, per-phase adjacency lines (sourced from view.edges, alphabetically sorted), status rollup counts, milestone resolution, exit criteria. NO mermaid / graph syntax: per-phase **Depends on:** lines come strictly from authored phase_depends_on edges scoped to in-roadmap phases.

*Render a roadmap as markdown*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `roadmapId` | string | yes | ROADMAP-NNN id from <config.root>/roadmap.json |
</tool>

<tool name="project-roadmap-validate">
Validate every roadmap × phase × milestone in <config.root>/roadmap.json. Codes: roadmap_lens_missing, roadmap_phase_dep_missing, roadmap_phase_cycle, roadmap_composition_cycle, roadmap_milestone_evidence_block_missing, roadmap_milestone_query_invalid, roadmap_status_unknown_value. Display strings flow through config.display_strings (pi-context divergence). Optional roadmapId filter restricts issue list to a single roadmap.

*Validate roadmaps*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `roadmapId` | string | no | Filter to issues matching this roadmap_id (omit for full-project validation) |
</tool>

<tool name="project-roadmap-list">
List every roadmap in <config.root>/roadmap.json with id, title, optional status, and phase count. Returns [] when roadmap.json absent (opt-in block; absence is the truthful answer).

*List roadmaps*

</tool>

</tools_reference>

<commands_reference>
<command name="/project">
Project state management

Subcommands: `init`, `install`, `view`, `lens-curate`, `roadmap-list`, `roadmap-view`, `roadmap-validate`, `status`, `add-work`, `validate`, `help`
</command>

</commands_reference>

<events>
`session_start`
</events>

<bundled_resources>
9 schemas, 27 registry bundled.
See references/bundled-resources.md for full inventory.
</bundled_resources>

<installable_blocks>

Names valid for the `installed_blocks` array in `.project/config.json`. Install with `/project install <block>`.

| Block | Source File |
|-------|-------------|
| `conformance-reference` | `registry/blocks/conformance-reference.json` |
| `context-contracts` | `registry/blocks/context-contracts.json` |
| `decisions` | `registry/blocks/decisions.json` |
| `domain` | `registry/blocks/domain.json` |
| `issues` | `registry/blocks/issues.json` |
| `project` | `registry/blocks/project.json` |
| `rationale` | `registry/blocks/rationale.json` |
| `requirements` | `registry/blocks/requirements.json` |
| `tasks` | `registry/blocks/tasks.json` |
| `verification` | `registry/blocks/verification.json` |

</installable_blocks>

<installable_schemas>

Names valid for the `installed_schemas` array in `.project/config.json`. Schemas back block validation; install with `/project install <schema>`.

| Schema | Source File |
|--------|-------------|
| `architecture` | `registry/schemas/architecture.schema.json` |
| `audit` | `registry/schemas/audit.schema.json` |
| `conformance-reference` | `registry/schemas/conformance-reference.schema.json` |
| `context-contracts` | `registry/schemas/context-contracts.schema.json` |
| `decisions` | `registry/schemas/decisions.schema.json` |
| `domain` | `registry/schemas/domain.schema.json` |
| `handoff` | `registry/schemas/handoff.schema.json` |
| `issues` | `registry/schemas/issues.schema.json` |
| `phase` | `registry/schemas/phase.schema.json` |
| `plan` | `registry/schemas/plan.schema.json` |
| `project` | `registry/schemas/project.schema.json` |
| `rationale` | `registry/schemas/rationale.schema.json` |
| `requirements` | `registry/schemas/requirements.schema.json` |
| `roadmap` | `registry/schemas/roadmap.schema.json` |
| `story` | `registry/schemas/story.schema.json` |
| `tasks` | `registry/schemas/tasks.schema.json` |
| `verification` | `registry/schemas/verification.schema.json` |

</installable_schemas>

<planning_vocabulary>

**Block Types:**

| Block | Title | Array Key | Item Fields |
|-------|-------|-----------|-------------|
| `architecture` | Architecture | `modules` | name, file, responsibility, dependencies? (array), lines? (integer) |
| `audit` | Audit | `checks` | id, description, status (string (pass|fail|warn|skip)), category?, details? |
| `conformance-reference` | Conformance Reference | `principles` | id, name, description?, rules (array) |
| `context-contracts` | Context contracts | `contracts` | id, unit_kind, bundle_relation_types (array), description?, notes?, created_by, created_at, modified_by?, modified_at? |
| `decisions` | Decisions | `decisions` | id, decision, rationale, phase? (string|integer), status (string (decided|tentative|revisit|superseded)), context?, task? |
| `domain` | Domain Knowledge | `entries` | id, title, content, category (string (research|reference|domain-rule|prior-art|constraint)), source?, confidence? (string (high|medium|low)), related_requirements? (array), tags? (array) |
| `handoff` | Handoff | `current_tasks` |  |
| `issues` | Issues | `issues` | id, title, body, location, status (string (open|resolved|deferred)), category (string (primitive|issue|cleanup|capability|composition)), priority (string (low|medium|high|critical)), package, source? (unknown), resolved_by? |
| `phase` | Phases | `phases` | id, name, intent, goal?, status (string (planned|in-progress|completed)), success_criteria? (array), specs? (array), dependencies? (array), inputs? (array), outputs? (array), artifacts_produced? (array) |
| `plan` | Project plans | `plans` | id, title, description?, status? (string (draft|active|blocked|complete|archived)), roadmap? (string|null), phase? (string|null), items (array) |
| `project` | Project Identity | `target_users` |  |
| `rationale` | Design Rationale | `rationales` | id, title, narrative, related_decisions? (array), phase? (string|integer), context? |
| `requirements` | Requirements | `requirements` | id, description, type (string (functional|non-functional|constraint|integration)), status (string (proposed|accepted|deferred|implemented|verified)), priority (string (must|should|could|wont)), acceptance_criteria? (array), source? (string (human|agent|analysis)), traces_to? (array), depends_on? (array) |
| `roadmap` | Project roadmaps | `roadmaps` | id, title, description?, status? (string (draft|active|paused|complete|archived)), phases (array), milestones? (array) |
| `story` | Stories | `stories` | id, title, status (string (proposed|ready|in-progress|in-review|complete|blocked)), description?, acceptance_criteria? (array), created_by?, created_at?, modified_by?, modified_at? |
| `tasks` | Tasks | `tasks` | id, description, status (string (planned|in-progress|completed|blocked|cancelled)), phase? (string|integer), files? (array), acceptance_criteria? (array), depends_on? (array), assigned_agent?, verification?, notes? |
| `verification` | Verification | `verifications` | id, target, target_type (string (task|phase|requirement)), status (string (passed|failed|partial|skipped)), method (string (command|inspect|test)), evidence?, timestamp?, criteria_results? (array) |

**Status Enums:**

| Block | Field | Values |
|-------|-------|--------|
| `audit` | `status` | pass, fail, warn, skip |
| `decisions` | `status` | decided, tentative, revisit, superseded |
| `domain` | `category` | research, reference, domain-rule, prior-art, constraint |
| `domain` | `confidence` | high, medium, low |
| `issues` | `status` | open, resolved, deferred |
| `issues` | `category` | primitive, issue, cleanup, capability, composition |
| `issues` | `priority` | low, medium, high, critical |
| `phase` | `status` | planned, in-progress, completed |
| `plan` | `status` | draft, active, blocked, complete, archived |
| `project` | `status` | inception, planning, development, maintenance, complete |
| `requirements` | `type` | functional, non-functional, constraint, integration |
| `requirements` | `status` | proposed, accepted, deferred, implemented, verified |
| `requirements` | `priority` | must, should, could, wont |
| `requirements` | `source` | human, agent, analysis |
| `roadmap` | `status` | draft, active, paused, complete, archived |
| `story` | `status` | proposed, ready, in-progress, in-review, complete, blocked |
| `tasks` | `status` | planned, in-progress, completed, blocked, cancelled |
| `verification` | `target_type` | task, phase, requirement |
| `verification` | `status` | passed, failed, partial, skipped |
| `verification` | `method` | command, inspect, test |

</planning_vocabulary>

<objective>
pi-context manages structured project state in `.project/` — a directory of JSON block files validated against schemas. The substrate (config + lenses + closure-table relations) is degree-zero state that defines where the rest lives and how items group into views.
</objective>

<block_files>
Blocks are JSON files under the substrate root (e.g., `gaps.json`, `decisions.json`). Each block has a corresponding schema in `<root>/schemas/`. When you write to a block via the tools, the data is validated against its schema before persisting. Writes are atomic (tmp file + rename) and serialised per block via `withBlockLock`. The substrate root defaults to `.project/` and is declared in `.project/config.json`'s `root` field — block-api routes through `projectRoot(cwd)` so a relocated root reaches every read/write site.
</block_files>

<schema_validation>
Every block write validates against `<root>/schemas/<blockname>.schema.json`. If the schema file doesn't exist, writes proceed without validation. Validation errors include the specific JSON Schema violations.
</schema_validation>

<project_init>
`/project init` creates the substrate skeleton: `.project/`, `.project/schemas/`, `.project/phases/`, and a minimal `.project/config.json` with `schema_version`, `root: ".project"`, and empty `lenses`, `installed_schemas`, `installed_blocks` arrays. No schemas or starter blocks are copied — the registry is opt-in. Idempotent: existing files are preserved (the config is never overwritten, so user edits survive re-running init).
</project_init>

<project_install>
`/project install` reconciles `.project/` against the `installed_schemas` and `installed_blocks` lists declared in `config.json`. For each declared name it copies the matching asset from the package-shipped `registry/schemas/` or `registry/blocks/` directory into the substrate root. Default behavior is skip-if-exists (preserves user edits); pass `--update` to overwrite and report the asset as `updated`. Sources missing from the registry are reported as `notFound`. Empty install lists are not an error — the result is a clean no-op message instructing the user to edit `config.json`.

The registry currently ships nine starter blocks (conformance-reference, decisions, domain, issues, project, rationale, requirements, tasks, verification) and fifteen schemas (the same set plus architecture, audit, handoff, phase, plan, roadmap). Inspect `registry/blocks/` and `registry/schemas/` for the authoritative names — declare any subset in `installed_*` and run `/project install`.
</project_install>

<substrate_config>
`.project/config.json` is the substrate bootstrap. Its `root` field declares where every other block, schema, agent, and template lives — closing the GitHub #3 surface where downstream consumers had to assume `.project/`. `naming` aliases canonical block ids to display names (used by `/project view` rendering). `hierarchy` declares legal closure-table edges (parent block → child block via relation_type). `lenses` declares named projections over a target block. `installed_schemas` / `installed_blocks` are the install manifest consumed by `/project install`.

`config.json` and `relations.json` are exempt from `root` redirection — they always live at `.project/` because they are the substrate that defines `root`. All other state lives under `<config.root>/...` per `projectRoot(cwd)`. The package ships their schemas in `schemas/` (config.schema.json, relations.schema.json) and resolves them via three-tier search: project override > user override > package-shipped.

The `getProjectContext(cwd)` SDK returns an mtime-keyed cached snapshot of `{ config, relations, configMtime, relationsMtime }` for one cwd. Consumers must not mutate.
</substrate_config>

<lens_views>
Lenses are named projections over a target block. A lens declares `id`, `target` (block name), `relation_type`, `derived_from_field` (optional — synthesizes edges from a per-item field instead of requiring authored edges), `bins` (named groupings), and `render_uncategorized`.

Edges live in `.project/relations.json` as a closure table — each row is `{ parent, child, relation_type }`. `parent` is either a canonical id (hierarchy edges) or a lens.bins value (lens edges); disambiguation lives in `validateRelations`.

The lens-view algorithm: `edgesForLens(lens, items, authoredEdges)` returns synthetic edges (when `derived_from_field` is set) or filtered authored edges (otherwise). `groupByLens(items, lens, lensEdges)` produces a `Map<binName, ItemRecord[]>`. `walkDescendants(parentId, relationType, edges)` traverses the closure table from any parent.

`/project view <lensId>` loads the lens via `loadLensView(cwd, lensId)`, runs `groupByLens`, and renders the result as markdown headings + bullet lines (id + status + title) into the conversation via `renderLensView`. `lens.render_uncategorized: false` omits the uncategorized bucket.
</lens_views>

<project_lens_curate>
`/project lens-curate <lensId>` walks items in the lens's target block that have no edge in any declared bin and surfaces bin-assignment suggestions (would-be `relations.json` edge appends) as a follow-up turn. The LLM reads the suggestions and persists the chosen edges via `append-block-item` against `relations.json`. The command itself does not write — curation is a follow-up-turn pattern so the model decides which suggestions to enact.
</project_lens_curate>

<project_view>
`/project view <lensId>` renders a configured lens as markdown into the conversation. Bins become headings, items become bullet lines (id + status + title where present). `naming` aliases from config.json are honored for the target block name. Errors (missing config, unknown lens, unreadable target block, no array property in target) surface via `ctx.ui.notify` with severity `error`.
</project_view>

<substrate_validation>
`validateRelations(cwd)` (exposed as the `project-validate-relations` tool) checks the closure-table edges in `relations.json` against the config + per-block item snapshots. Diagnostics codes: `edge_unknown_relation_type`, `edge_parent_not_in_bins`, `edge_unresolved_parent`, `edge_unresolved_child`, `edge_parent_wrong_block`, `edge_child_wrong_block`, `edge_cycle_detected`. Returns `{ status: "clean" | "warnings" | "invalid", issues[] }` where each issue carries the offending edge or cycle path.

Two derived substrate tools complement validation: `project-edges-for-lens` returns the materialized `Edge[]` for a named lens (synthetic from `derived_from_field` or filtered authored edges); `project-walk-descendants` returns the transitive descendant id list from a parent under a given relation_type.
</substrate_validation>

<project_status>
`/project status` derives project state dynamically from the filesystem:
- Source file count and line count (`.ts` files excluding tests)
- Test count and test file count
- Schema count, block count, phase count
- Block summaries with array item counts and status distributions
- Requirements summary (total, by status, by priority) — from requirements.json (if installed)
- Tasks summary (total, by status) — from tasks.json (if installed)
- Domain entry count — from domain.json (if installed)
- Verification summary (total, passed, failed) — from verification.json (if installed)
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
Two separate validators address two concerns:

`/project validate` (the `project-validate` tool) checks cross-block referential integrity:
- task.phase references a valid phase
- task.depends_on references valid task IDs
- decision.phase references a valid phase
- gap.resolved_by references a valid ID
- requirement.traces_to references valid phase/task IDs
- requirement.depends_on references valid requirement IDs
- verification.target references a valid target ID
- rationale.related_decisions references valid decision IDs

Returns errors (broken dependency references) and warnings (unresolved cross-references).

The `project-validate-relations` tool (see `<substrate_validation>`) validates closure-table edges in `relations.json` — a separate concern from cross-block ID resolution.
</project_validate>

<update_check>
On `session_start`, checks npm registry for newer versions of `@davidorex/pi-project-workflows` and notifies via UI if an update is available. Non-blocking — failures are silently ignored.
</update_check>

<success_criteria>
- `.project/`, `.project/schemas/`, `.project/phases/`, and `.project/config.json` exist after `/project init`
- `installed_schemas` / `installed_blocks` declared in `config.json` are reified by `/project install`; `--update` overwrites
- Block writes validate against schemas — invalid data rejected with specific error
- `/project status` returns current derived state without errors
- `/project validate` returns no errors for well-formed cross-block references
- `project-validate-relations` returns no errors for a well-formed `relations.json`
- `/project view <lensId>` renders the configured projection; `/project lens-curate <lensId>` surfaces suggestions for uncategorized items
- `append-block-item` rejects duplicate IDs
- Schema customizations (field additions, enum changes) take effect on next write
- A relocated `config.root` reaches every read/write because all path construction routes through `projectRoot(cwd)`
</success_criteria>

*Generated from source by `scripts/generate-skills.js` — do not edit by hand.*
