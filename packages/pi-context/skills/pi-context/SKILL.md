---
name: pi-context
description: >
  Schema-driven project state management with typed JSON blocks, schema
  validation, substrate config, lens views, closure-table relations, and
  cross-block referential integrity. Use when managing .project/ blocks,
  scaffolding project structure, installing block kinds from the packaged samples
  catalog, validating project state, rendering lens views, or adding work items.
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

<tool name="list-tools">
List every tool bound into the current Pi session — name, description, parameter JSON-schema, and source extension — plus which tools are currently active. Self-introspection of the agent's own tool surface (all loaded extensions + builtins).

*Discover available tools — names, params, descriptions, active set*

</tool>

<tool name="read-samples-catalog">
Enumerate installable sample block kinds (DEC-0037 packaged view): per kind — title, description, item shape, applicable relation_types (as source/target), invariants, lenses — plus top-level relation_type/lens/invariant/layer/status_bucket registries. Package-intrinsic: reads the extension's bundled samples catalog, independent of any project. Optional `kind` returns one packaged kind.

*Discover installable sample block kinds — title, shape, relation_types, invariants, lenses*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `kind` | string | no | Filter to one block_kind canonical_id (e.g. 'tasks') |
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

<tool name="amend-config">
Scoped add / replace / remove of ONE entry in ONE config.json registry (block_kinds, relation_types, lenses, layers, invariants, status_buckets, display_strings, naming, installed_schemas, installed_blocks, hierarchy). The whole resulting config is AJV-validated (SHAPE) and op-correctness is enforced (add ⇒ key absent, replace/remove ⇒ key present). Cross-registry referential integrity (removing a still-referenced relation_type / lens / layer / block_kind) is NOT checked here — run project-validate after. dryRun previews without writing.

*Add/replace/remove one entry in a config.json registry (vocabulary, lenses, invariants, status_buckets)*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `registry` | string | yes | One of: block_kinds | relation_types | lenses | layers | invariants | status_buckets | display_strings | naming | installed_schemas | installed_blocks | hierarchy |
| `operation` | string | yes | add | replace | remove |
| `key` | string | yes | Entry key: id for keyed-array (block_kinds/relation_types/lenses/layers/invariants), map key for map (status_buckets/display_strings/naming), the string value for string-array (installed_schemas/installed_blocks), or a JSON {parent_block, child_block, relation_type} for hierarchy |
| `entry` | unknown | no | Entry payload: object for keyed-array/hierarchy, string for map value; omit for remove. For keyed-array its id field must equal key; for string-array (when given) it must equal key |
| `dryRun` | boolean | no | Preview the op without writing config.json |
</tool>

<tool name="read-schema">
Read a substrate schema by name as parsed JSON. Returns null when the schema file is absent.

*Read a block schema as structured JSON*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `schemaName` | string | yes | Schema name without extension (e.g., 'tasks', 'decisions', 'issues') |
</tool>

<tool name="write-schema">
Create or replace a substrate block-kind JSON Schema. operation 'create' requires the schema absent; 'replace' requires it present. The body is AJV draft-07 meta-validated before an atomic write. CAVEAT: a 'replace' that changes the schema's version does NOT migrate existing block items — read-time validateBlockWithMigration throws a version mismatch until a code-level MigrationFn is registered (no tool surface for that). Registering the block_kind that points at this schema is a separate step (amend-config block_kinds).

*Create or replace a block-kind JSON Schema (meta-validated, atomic)*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `operation` | string | yes | create | replace |
| `schemaName` | string | yes | Schema name without extension (e.g., 'tasks') |
| `schema` | unknown | yes | The whole JSON Schema object (draft-07). Accepts a JSON string. |
| `dryRun` | boolean | no | Meta-validate without writing |
</tool>

<tool name="project-init">
Initialize the substrate dir (bootstrap pointer + dirs only; run accept-all + install to populate).

*Initialize the substrate dir (bootstrap pointer + dirs only; run accept-all + install to populate)*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `contextDir` | string | yes | Substrate dir name (e.g. .project). Required per DEC-0015 — no default. |
</tool>

<tool name="project-accept-all">
Adopt the canonical packaged conception (samples/conception.json) as this substrate's config.json (accept-all). Writes config only — run install after. Idempotent: never overwrites an existing config.

*Adopt the canonical conception as config (accept-all)*

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

<tool name="read-block-item">
Read a single item from a named block by its id — returns the item or null. Block-scoped (unlike resolve-item-by-id, which searches all blocks by kind-prefixed id). Avoids fetching a whole large block to get one item.

*Read one item from a block by id (block-scoped; null if absent)*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `block` | string | yes | Block name (e.g., 'tasks', 'decisions', 'framework-gaps') |
| `id` | string | yes | Item id within the block (e.g., 'TASK-001') |
</tool>

<tool name="read-block-page">
Paginate a block's items: returns { items, total, hasMore }. offset default 0, limit default 50. Use for blocks too large to fetch whole (past the 50KB read-block cap). total is the full item count; hasMore signals another page.

*Paginate a block's items — offset + limit; returns {items,total,hasMore}*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `block` | string | yes | Block name (e.g., 'framework-gaps', 'decisions', 'issues') |
| `offset` | integer | no | Start index (default 0) |
| `limit` | integer | no | Max items to return (default 50) |
</tool>

<tool name="join-blocks">
Join two blocks in one call (FGAP-043). EDGE mode: pass `relationType` — pairs left items with right-block items connected by that relations.json edge (`leftEndpoint` parent|child, default parent). FIELD mode: pass `leftField`+`rightField` — pairs where left[leftField] === right[rightField]. Optional left pre-filter via where{Field,Op,Value}. Returns [{left, right:[]}] (right always an array; one-to-many). Use instead of N+1 read-block + resolve calls.

*Join two blocks in one call — by relation edge or shared field; returns {left,right[]} pairs*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `leftBlock` | string | yes | Left block name (e.g., 'tasks') |
| `rightBlock` | string | yes | Right block name (e.g., 'verification') |
| `relationType` | string | no | Edge mode: relations.json relation_type |
| `leftField` | string | no | Field mode: left item field |
| `rightField` | string | no | Field mode: right item field |
| `leftEndpoint` | unknown | no | Edge mode: is the left item the edge parent (default) or child |
| `whereField` | string | no | Optional left pre-filter field |
| `whereOp` | unknown | no |  |
| `whereValue` | unknown | no | Optional left pre-filter value |
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

Subcommands: `init`, `install`, `accept-all`, `view`, `lens-curate`, `roadmap-list`, `roadmap-view`, `roadmap-validate`, `status`, `add-work`, `validate`, `help`
</command>

</commands_reference>

<events>
`session_start`
</events>

<bundled_resources>
9 schemas, 31 samples bundled.
See references/bundled-resources.md for full inventory.
</bundled_resources>

<installable_blocks>

Names valid for the `installed_blocks` array in `.project/config.json`. Install with `/project install <block>`.

| Block | Source File |
|-------|-------------|
| `decisions` | `samples/blocks/decisions.json` |
| `framework-gaps` | `samples/blocks/framework-gaps.json` |
| `tasks` | `samples/blocks/tasks.json` |
| `verification` | `samples/blocks/verification.json` |
| `issues` | `samples/blocks/issues.json` |
| `features` | `samples/blocks/features.json` |
| `research` | `samples/blocks/research.json` |
| `rationale` | `samples/blocks/rationale.json` |
| `spec-reviews` | `samples/blocks/spec-reviews.json` |
| `layer-plans` | `samples/blocks/layer-plans.json` |
| `requirements` | `samples/blocks/requirements.json` |
| `conventions` | `samples/blocks/conventions.json` |
| `context-contracts` | `samples/blocks/context-contracts.json` |
| `phase` | `samples/blocks/phase.json` |
| `story` | `samples/blocks/story.json` |

</installable_blocks>

<installable_schemas>

Names valid for the `installed_schemas` array in `.project/config.json`. Schemas back block validation; install with `/project install <schema>`.

| Schema | Source File |
|--------|-------------|
| `decisions` | `samples/schemas/decisions.schema.json` |
| `framework-gaps` | `samples/schemas/framework-gaps.schema.json` |
| `tasks` | `samples/schemas/tasks.schema.json` |
| `verification` | `samples/schemas/verification.schema.json` |
| `issues` | `samples/schemas/issues.schema.json` |
| `features` | `samples/schemas/features.schema.json` |
| `research` | `samples/schemas/research.schema.json` |
| `rationale` | `samples/schemas/rationale.schema.json` |
| `spec-reviews` | `samples/schemas/spec-reviews.schema.json` |
| `layer-plans` | `samples/schemas/layer-plans.schema.json` |
| `requirements` | `samples/schemas/requirements.schema.json` |
| `conventions` | `samples/schemas/conventions.schema.json` |
| `context-contracts` | `samples/schemas/context-contracts.schema.json` |
| `phase` | `samples/schemas/phase.schema.json` |
| `story` | `samples/schemas/story.schema.json` |

</installable_schemas>

<planning_vocabulary>

**Block Types:**

| Block | Title | Array Key | Item Fields |
|-------|-------|-----------|-------------|
| `decisions` | Decisions | `decisions` | id, title, status (string (open|enacted|superseded)), context, decision, options_considered? (array), consequences (array), references? (array), created_by, created_at, enacted_by?, enacted_at? |
| `framework-gaps` | Framework Gaps | `gaps` | id, title, status (string (identified|accepted|in-progress|closed|wontfix)), priority? (string (P0|P1|P2|P3)), package, layer? (string (L1|L2|L3|L4|L5)), description, evidence (array), impact, canonical_vocabulary?, proposed_resolution, created_by, created_at, closed_by?, closed_at? |
| `tasks` | Tasks | `tasks` | id, description, status (string (planned|in-progress|completed|blocked|cancelled)), files? (array), acceptance_criteria? (array), assigned_agent?, notes? |
| `verification` | Verification | `verifications` | id, status (string (passed|failed|partial|skipped)), method (string (command|inspect|test)), evidence?, timestamp?, criteria_results? (array) |
| `issues` | Issues | `issues` | id, title, body, location, status (string (open|resolved|deferred)), category (string (primitive|issue|cleanup|capability|composition)), priority (string (low|medium|high|critical)), package, source? (string (human|agent|monitor|workflow)), resolved_by? |
| `features` | Features | `features` | id, title, status (string (proposed|approved|in-progress|in-review|complete|blocked|cancelled)), layer (string (L1|L2|L3|L4|L5)), description, motivation?, acceptance_criteria (array), created_by, created_at, modified_by?, modified_at?, approved_by?, approved_at? |
| `research` | Research | `research` | id, title, status (string (planned|in-progress|complete|stale|superseded|revised)), layer (string (L1|L2|L3|L4|L5)), type (string (investigative|comparative|empirical|historical|audit|landscape|feasibility|curation)), question, method, scope? (array), findings_summary, findings_document?, grounding? (object), grounded_at?, stale_conditions? (array), citations? (array), conducted_by?, conducted_at?, created_by, created_at, modified_by?, modified_at? |
| `rationale` | Design Rationale | `rationales` | id, title, narrative, phase? (integer) |
| `spec-reviews` | Spec Reviews | `reviews` | id, target, target_revision?, reviewer?, status (string (not-started|in-progress|complete|abandoned)), scope? (array), method?, clean? (boolean), created_by, created_at, completed_at? |
| `layer-plans` | Layer Restructure Plans | `plans` | id, title, status (string (draft|proposed|decided|in-progress|complete|abandoned)), model, description?, layers (array), migration_phases (array), created_by, created_at |
| `requirements` | Requirements | `requirements` | id, description, type (string (functional|non-functional|constraint|integration)), status (string (proposed|accepted|deferred|implemented|verified)), priority (string (must|should|could|wont)), acceptance_criteria? (array), source? (string (human|agent|analysis)) |
| `conventions` | Conventions | `rules` | id, description, enforcement (string (lint|test|review|manual)), severity (string (error|warning|info)) |
| `context-contracts` | Context contracts | `contracts` | id, unit_kind, bundle_relation_types (array), description?, notes?, created_by, created_at, modified_by?, modified_at? |
| `phase` | Phases | `phases` | id, name, intent, goal?, status (string (planned|in-progress|completed)), success_criteria? (array), specs? (array), artifacts_produced? (array) |
| `story` | Stories | `stories` | id, title, status (string (proposed|ready|in-progress|in-review|complete|blocked)), description?, acceptance_criteria? (array), created_by?, created_at?, modified_by?, modified_at? |

**Status Enums:**

| Block | Field | Values |
|-------|-------|--------|
| `decisions` | `status` | open, enacted, superseded |
| `framework-gaps` | `status` | identified, accepted, in-progress, closed, wontfix |
| `framework-gaps` | `priority` | P0, P1, P2, P3 |
| `framework-gaps` | `layer` | L1, L2, L3, L4, L5 |
| `tasks` | `status` | planned, in-progress, completed, blocked, cancelled |
| `verification` | `status` | passed, failed, partial, skipped |
| `verification` | `method` | command, inspect, test |
| `issues` | `status` | open, resolved, deferred |
| `issues` | `category` | primitive, issue, cleanup, capability, composition |
| `issues` | `priority` | low, medium, high, critical |
| `issues` | `source` | human, agent, monitor, workflow |
| `features` | `status` | proposed, approved, in-progress, in-review, complete, blocked, cancelled |
| `features` | `layer` | L1, L2, L3, L4, L5 |
| `research` | `status` | planned, in-progress, complete, stale, superseded, revised |
| `research` | `layer` | L1, L2, L3, L4, L5 |
| `research` | `type` | investigative, comparative, empirical, historical, audit, landscape, feasibility, curation |
| `spec-reviews` | `status` | not-started, in-progress, complete, abandoned |
| `layer-plans` | `status` | draft, proposed, decided, in-progress, complete, abandoned |
| `requirements` | `type` | functional, non-functional, constraint, integration |
| `requirements` | `status` | proposed, accepted, deferred, implemented, verified |
| `requirements` | `priority` | must, should, could, wont |
| `requirements` | `source` | human, agent, analysis |
| `conventions` | `enforcement` | lint, test, review, manual |
| `conventions` | `severity` | error, warning, info |
| `phase` | `status` | planned, in-progress, completed |
| `story` | `status` | proposed, ready, in-progress, in-review, complete, blocked |

</planning_vocabulary>

<objective>
pi-context manages structured project state in `.project/` — a directory of JSON block files validated against schemas. The substrate (config + lenses + closure-table relations) is degree-zero state that defines where the rest lives and how items group into views.
</objective>

<block_files>
Blocks are JSON files under the substrate root (e.g., `gaps.json`, `decisions.json`). Each block has a corresponding schema in `<root>/schemas/`. When you write to a block via the tools, the data is validated against its schema before persisting. Writes are atomic (tmp file + rename) and serialised per block via `withBlockLock`. The substrate root is the dir chosen at init (recorded in the `.pi-context.json` bootstrap pointer) and written to `config.json`'s `root` field by `/project accept-all`; the framework ships no default (DEC-0015). block-api routes through `projectRoot(cwd)` — which resolves `config.root` when set and otherwise falls back to the pointer — so a relocated root reaches every read/write site.
</block_files>

<schema_validation>
Every block write validates against `<root>/schemas/<blockname>.schema.json`. If the schema file doesn't exist, writes proceed without validation. Validation errors include the specific JSON Schema violations.
</schema_validation>

<project_init>
`/project init <dir>` creates the substrate skeleton: the `.pi-context.json` bootstrap pointer (declaring the substrate-dir name per DEC-0015) plus the substrate root and its `schemas/` directory. Nothing is imposed — no `config.json`, no schemas, and no starter blocks are written (DEC-0011 ship-no-defaults). Idempotent: re-running preserves existing dirs. Populate the substrate next with `/project accept-all` (adopt the canonical conception) followed by `/project install`.
</project_init>

<project_accept_all>
`/project accept-all` adopts the package's canonical packaged conception (`samples/conception.json`) as the substrate's `config.json` — the full vocabulary (`block_kinds`, `relation_types`, `lenses`, `invariants`) plus the `installed_schemas` / `installed_blocks` manifest — with `root` set to the actual substrate dir. It writes `config.json` only (run `/project install` after to materialize the schemas + starter blocks) and is idempotent: it never overwrites an existing `config.json` (offer, don't impose). This is the accept-all path; per-entry step-through curation is a separate surface.
</project_accept_all>

<project_install>
`/project install` reconciles the substrate against the `installed_schemas` and `installed_blocks` lists declared in `config.json`. For each declared name it copies the matching asset from the package-shipped samples catalog (`samples/schemas/` for schemas, `samples/blocks/` for starter blocks) into the substrate. Default behavior is skip-if-exists (preserves user edits); pass `--update` to overwrite and report the asset as `updated`. Sources missing from the catalog are reported as `notFound`. Empty install lists are not an error — the result is a clean no-op message instructing the user to edit `config.json`.

The installable catalog IS the packaged conception (`samples/conception.json`): its `block_kinds` enumerate the available kinds, each carrying its schema (`samples/schemas/`) and starter block (`samples/blocks/`). The generated installable-catalog table below lists the authoritative names — declare any subset in `installed_*` and run `/project install`, or take the whole conception via `/project accept-all`.
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

<block_item_reads>
Item-level reads complement whole-block `read-block` (which is all-or-nothing and caps at the 50KB read limit): `read-block-item` returns one item from a named block by its id (block-scoped — null if absent; distinct from `resolve-item-by-id`, which searches every block by kind-prefixed id). `read-block-page` paginates a block too large to fetch whole — `{ items, total, hasMore }` where `total` is the full item count and pagination uses `offset`/`limit` (defaults 0/50).
`join-blocks` — one-call cross-block join, EDGE mode (relations.json relation_type, leftEndpoint parent|child) or FIELD mode (shared field value), optional left pre-filter; returns {left, right[]} pairs; replaces N+1 read+resolve.
</block_item_reads>

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
