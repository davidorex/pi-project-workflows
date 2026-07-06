---
name: pi-context
description: >
  Schema-driven project state management with typed JSON blocks, schema
  validation, substrate config, lens views, closure-table relations, and
  cross-block referential integrity. Use when managing substrate blocks,
  scaffolding project structure, installing block kinds from the packaged samples
  catalog, validating project state, rendering lens views, or adding work items.
---

<tools_reference>
<tool name="append-block-item">
Append an item to an array in a project block file. Schema validation is automatic. Set autoId:true to allocate the next id from the block's id pattern when the item has no id. Optional relations file the item's BIRTH edges in the same op run, after id allocation — each entry names the relation_type, the other endpoint's selector, and EXACTLY ONE orientation: direction (as_parent | as_child — the raw endpoint the new item occupies) or role (primary | counter — the semantic role the new item holds, mapped via the relation's declared role_direction; required for role-bearing orientation-ambiguous relation_types such as the gated-by / derived-from / supersedes / depends families, where the raw form is rejected). Filing item + edges as one atom lets a new item satisfy error-severity birth-edge invariants (e.g. a decision must cite a forcing artifact) that would refuse the bare item under the write-time gate. Write pipeline: after this op's write, rollup-kind stored statuses converge with their derivation, and the config invariants are re-evaluated delta-scoped — a violation newly introduced by this write refuses it at error severity (substrate byte-restored) or is surfaced on the result at warning severity (write-warning lines / writeWarnings); pre-existing violations never block.

*Append items to project blocks (issues, decisions, or any user-defined block), with optional atomic birth edges*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `block` | string | yes | Block name (e.g., 'issues', 'decisions') |
| `arrayKey` | string | yes | Array key in the block (e.g., 'issues', 'decisions') |
| `item` | unknown | yes | Item object to append — must conform to block schema |
| `autoId` | boolean | no | When true and the item has no id, allocate the next id from the block's id pattern |
| `relations` | array | no | Birth edges filed atomically with the item, after id allocation, via the same validated append-relation porcelain (each entry oriented by direction OR role) |
</tool>

<tool name="update-block-item">
Update fields on an item in a project block array. Finds by predicate field match. Write pipeline: after this op's write, rollup-kind stored statuses converge with their derivation, and the config invariants are re-evaluated delta-scoped — a violation newly introduced by this write refuses it at error severity (substrate byte-restored) or is surfaced on the result at warning severity (write-warning lines / writeWarnings); pre-existing violations never block.

*Update items in project blocks — change status, add details, mark resolved*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `block` | string | yes | Block name (e.g., 'issues', 'decisions') |
| `arrayKey` | string | yes | Array key in the block |
| `match` | object | yes | Fields to match (e.g., { id: 'ISSUE-NNN' }) |
| `updates` | object | yes | Fields to update (e.g., { status: 'resolved' }) |
</tool>

<tool name="append-relation">
Append a closure-table relation (edge: relation_type, optional ordinal) to relations.json. Orient the edge with EITHER raw --parent/--child OR the role-typed --primary/--counter (which maps to parent/child via the relation's declared role_direction); the two pairs are mutually exclusive. A bare --parent/--child append of a relation that is BOTH role-bearing and orientation-ambiguous (its source/target kinds overlap) is rejected — re-issue with --primary/--counter. Shape is AJV-validated; an exact-duplicate edge (same parent+child+relation_type) is a no-op. Reference integrity (endpoints resolve, relation_type registered, no cycle) is NOT checked here — run context-validate after. Creates relations.json if absent. Write pipeline: after this op's write, rollup-kind stored statuses converge with their derivation, and the config invariants are re-evaluated delta-scoped — a violation newly introduced by this write refuses it at error severity (substrate byte-restored) or is surfaced on the result at warning severity (write-warning lines / writeWarnings); pre-existing violations never block.

*Create a relation/edge between two items (raw --parent/--child, or role-typed --primary/--counter mapped via role_direction)*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `parent` | string | no | Parent-endpoint selector (canonical id / <alias>:<refname> / lens bin) — RAW orientation. Mutually exclusive with --primary/--counter. |
| `child` | string | no | Child-endpoint selector — RAW orientation. Mutually exclusive with --primary/--counter. |
| `primary` | string | no | Selector of the endpoint holding the relation's PRIMARY semantic role (ROLE-TYPED orientation; mapped to parent/child via the relation's declared role_direction). Requires --counter; the relation_type must declare role_direction. |
| `counter` | string | no | Selector of the endpoint holding the relation's COUNTER role (ROLE-TYPED orientation). Requires --primary. |
| `relation_type` | string | yes | Registered relation_type canonical_id / hierarchy edge type / lens id |
| `ordinal` | integer | no | Optional sibling-ordering within (parent, relation_type) |
| `dryRun` | boolean | no | Preview without writing relations.json |
</tool>

<tool name="remove-relation">
Remove the single closure-table relation (edge) matching parent+child+relation_type from relations.json. Matches on the SAME (parent, child, relation_type) dedup identity append-relation uses, so it is the symmetric inverse of append-relation (ordinal is NOT part of identity). An absent edge is an idempotent no-op. Reference integrity is NOT checked here — run context-validate after if the removal changes resolvability. Write pipeline: after this op's write, rollup-kind stored statuses converge with their derivation, and the config invariants are re-evaluated delta-scoped — a violation newly introduced by this write refuses it at error severity (substrate byte-restored) or is surfaced on the result at warning severity (write-warning lines / writeWarnings); pre-existing violations never block.

*Remove a relation/edge between two items (the inverse of append-relation)*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `parent` | string | yes | Canonical id (or lens bin name) of the parent endpoint |
| `child` | string | yes | Canonical id of the child endpoint |
| `relation_type` | string | yes | Registered relation_type canonical_id / hierarchy edge type / lens id |
| `dryRun` | boolean | no | Preview without writing relations.json |
</tool>

<tool name="replace-relation">
Atomically replace one closure-table relation with another in a SINGLE write (no half-state: the old edge and the new edge never coexist on disk). The old edge is matched on the (parent, child, relation_type) dedup identity; the new edge is written with its optional ordinal. If the old edge is absent the call is effectively an append of the new edge. This op takes RAW parent/child (old + new) and BYPASSES the write-time orientation gate that append-relation applies — it writes the endpoints verbatim, so it is the affordance for re-orienting an existing edge; reference integrity is NOT checked here — run context-validate after. Write pipeline: after this op's write, rollup-kind stored statuses converge with their derivation, and the config invariants are re-evaluated delta-scoped — a violation newly introduced by this write refuses it at error severity (substrate byte-restored) or is surfaced on the result at warning severity (write-warning lines / writeWarnings); pre-existing violations never block.

*Atomically swap one relation/edge for another in a single write*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `old_parent` | string | yes | Parent endpoint selector of the edge to remove |
| `old_child` | string | yes | Child endpoint selector of the edge to remove |
| `old_relation_type` | string | yes | relation_type of the edge to remove |
| `parent` | string | yes | Parent endpoint selector of the replacement edge |
| `child` | string | yes | Child endpoint selector of the replacement edge |
| `relation_type` | string | yes | relation_type of the replacement edge |
| `ordinal` | integer | no | Optional sibling-ordering within (parent, relation_type) for the new edge |
| `dryRun` | boolean | no | Preview without writing relations.json |
</tool>

<tool name="append-relations">
Append MANY closure-table relations to relations.json in a single write. Each edge is an object with { relation_type, ordinal? } plus EITHER a raw { parent, child } pair OR the role-typed { primary, counter } pair (mapped to parent/child via the relation's declared role_direction); the two pairs are mutually exclusive per edge, and a bare { parent, child } for an orientation-ambiguous role-bearing relation rejects the whole batch before any write. Per-(parent, child, relation_type) duplicates are skipped (against on-disk edges AND earlier edges in the same batch). Returns appended/skipped counts. Reference integrity is NOT checked here — run context-validate after. Creates relations.json if absent. Write pipeline: after this op's write, rollup-kind stored statuses converge with their derivation, and the config invariants are re-evaluated delta-scoped — a violation newly introduced by this write refuses it at error severity (substrate byte-restored) or is surfaced on the result at warning severity (write-warning lines / writeWarnings); pre-existing violations never block.

*Create many relations/edges between items in one write (raw or role-typed per edge)*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `edges` | unknown | yes | JSON array of edge objects. Each edge is { relation_type, ordinal? } plus EITHER a raw { parent, child } pair OR the role-typed { primary, counter } pair (mapped to parent/child via the relation's declared role_direction); the two orientation pairs are mutually exclusive per edge. Selectors are id / <alias>:<refname> / lens-bin. |
| `dryRun` | boolean | no | Preview without writing relations.json |
</tool>

<tool name="upsert-block-item">
Append-or-replace an item in a project block array by id: if an item with the same idField value exists it is REPLACED (full-shape replacement, not shallow-merge — use update-block-item for merge); otherwise the item is appended. Schema validation is automatic. idField defaults to 'id'. Optional relations file BIRTH edges in the same op run when the upsert resolves to an APPEND — each entry names the relation_type, the other endpoint's selector, and EXACTLY ONE orientation: direction (as_parent | as_child, raw) or role (primary | counter, mapped via the relation's declared role_direction; required for role-bearing orientation-ambiguous relation_types) — one atom under the write-time gate, so a new filing can satisfy error-severity birth-edge invariants. dryRun previews the upsert AND runs the same orientation guard over the entries (a preview refuses what the live run would orientation-refuse; endpoint resolution stays out — the item is unwritten). When the upsert resolves to a REPLACE, supplying relations refuses the write (birth edges are for new items; file edges on an existing item via append-relation). Write pipeline: after this op's write, rollup-kind stored statuses converge with their derivation, and the config invariants are re-evaluated delta-scoped — a violation newly introduced by this write refuses it at error severity (substrate byte-restored) or is surfaced on the result at warning severity (write-warning lines / writeWarnings); pre-existing violations never block.

*Append-or-replace a full block item by id (replacement, not merge), with optional atomic birth edges*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `block` | string | yes | Block name (e.g., 'issues', 'decisions') |
| `arrayKey` | string | yes | Array key in the block (e.g., 'issues', 'decisions') |
| `item` | unknown | yes | Full item object to upsert — must conform to block schema |
| `idField` | string | no | Field used as the upsert key (default 'id') |
| `dryRun` | boolean | no | Preview the upsert without writing |
| `relations` | array | no | Birth edges filed atomically with an APPEND-mode upsert, each entry oriented by direction OR role (refused on replace mode — use append-relation for existing items) |
</tool>

<tool name="promote-item">
Promote a substrate item into another (registered) substrate as a NEW content-addressed item, recording the 'item_derived_from_item' lineage edge in the destination relations.json (parent = the new derived item, child = the source, carrying the source content_hash). The destination write-path mints a fresh oid + content_hash + content object. When the source block's status enum supports it, the source is marked superseded. Preconditions (unresolvable/non-item source, unregistered destination alias, unregistered destination relation_type, refname collision) throw. Pass dryRun to compute the destination without writing. Write pipeline: after this op's write, rollup-kind stored statuses converge with their derivation, and the config invariants are re-evaluated delta-scoped — a violation newly introduced by this write refuses it at error severity (substrate byte-restored) or is surfaced on the result at warning severity (write-warning lines / writeWarnings); pre-existing violations never block.

*Promote an item into another substrate as a derived copy with a lineage edge*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `source` | string | yes | Source item selector (bare refname / <alias>:<refname>) |
| `destinationSubstrate` | string | yes | Registered destination substrate alias |
| `newRefname` | string | no | Explicit destination refname (else allocated from the dest block id pattern) |
| `dryRun` | boolean | no | Compute the destination without writing any channel |
| `writer` | object | yes | DispatchContext.writer per pi-context/src/dispatch-context.ts. |
</tool>

<tool name="append-block-nested-item">
Append an item to a nested array on a parent-array item in a project block. Schema validation is automatic.

*Append items to nested arrays inside parent items (e.g., findings inside a review)*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `block` | string | yes | Block name (e.g., 'spec-reviews') |
| `arrayKey` | string | yes | Parent array key (e.g., 'reviews') |
| `match` | object | yes | Fields to match the parent item (e.g., { id: 'REVIEW-NNN' }) |
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
| `match` | object | yes | Fields to match the parent item (e.g., { id: 'REVIEW-NNN' }) |
| `nestedKey` | string | yes | Nested array key on the matched parent (e.g., 'findings') |
| `nestedMatch` | object | yes | Fields to match the nested item (e.g., { id: 'F-001' }) |
| `updates` | object | yes | Fields to update on the nested item (e.g., { state: 'resolved' }) |
</tool>

<tool name="remove-block-item">
Remove items matching a predicate from a top-level array in a project block. Idempotent — returns { removed: 0 } on no match without throwing. Schema validation runs after removal. Write pipeline: after this op's write, rollup-kind stored statuses converge with their derivation, and the config invariants are re-evaluated delta-scoped — a violation newly introduced by this write refuses it at error severity (substrate byte-restored) or is surfaced on the result at warning severity (write-warning lines / writeWarnings); pre-existing violations never block.

*Remove items from project blocks — prune retracted issues, dedupe entries*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `block` | string | yes | Block name (e.g., 'issues') |
| `arrayKey` | string | yes | Top-level array key (e.g., 'issues') |
| `match` | object | yes | Fields to match (e.g., { id: 'ISSUE-NNN' }) |
</tool>

<tool name="remove-block-nested-item">
Remove items matching a predicate from a nested array on a parent-array item in a project block. Throws on parent miss; returns { removed: 0 } on nested miss without throwing.

*Remove nested items — drop rejected findings, retract nested references*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `block` | string | yes | Block name (e.g., 'spec-reviews') |
| `arrayKey` | string | yes | Parent array key (e.g., 'reviews') |
| `match` | object | yes | Fields to match the parent item (e.g., { id: 'REVIEW-NNN' }) |
| `nestedKey` | string | yes | Nested array key on the matched parent (e.g., 'findings') |
| `nestedMatch` | object | yes | Fields to match the nested items to remove (e.g., { id: 'F-001' }) |
</tool>

<tool name="read-block-dir">
Enumerate and parse all .json files in a <substrate-dir>/<subdir>/ directory, returned as a sorted array. Missing directories return [].

*Enumerate project block subdirectories (phases, schemas, etc.) as parsed JSON*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `subdir` | string | yes | Subdirectory under the substrate dir (e.g., 'phases', 'schemas') |
</tool>

<tool name="read-block">
Read a project block file as structured JSON.

*Read a project block as structured JSON*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `block` | string | yes | Block name (e.g., 'issues', 'tasks', 'requirements') |
</tool>

<tool name="write-block">
Write or replace an entire project block with schema validation. Write pipeline: after this op's write, rollup-kind stored statuses converge with their derivation, and the config invariants are re-evaluated delta-scoped — a violation newly introduced by this write refuses it at error severity (substrate byte-restored) or is surfaced on the result at warning severity (write-warning lines / writeWarnings); pre-existing violations never block.

*Write or replace a project block with schema validation*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `block` | string | yes | Block name (e.g., 'project', 'architecture') |
| `data` | unknown | yes | Complete block data — must conform to block schema |
</tool>

<tool name="context-status">
Get derived context state — source metrics, block summaries, planning lifecycle status.

*Get context state — source metrics, block summaries, planning lifecycle status*

</tool>

<tool name="context-check-status">
Read-only installed-vs-catalog schema drift report — per installed schema the drift state, the baseline and catalog versions, and for behind schemas (catalog-ahead / both-diverged) the version delta (baseline -> catalog) or the content-only basis when the version string is unchanged. The front of the check-status -> update --dryRun -> update sequence. Like every substrate-lifecycle ceremony it seeds the catalog's config migration declarations into migrations.json (idempotent) before its first config read, so a version-lagging legacy substrate is diagnosable; beyond that seed it writes nothing.

*Report installed-vs-catalog schema drift + the version gap for behind schemas (read-only)*

</tool>

<tool name="context-validate">
Validate cross-block referential integrity — check that IDs referenced across blocks exist.

*Validate cross-block referential integrity*

</tool>

<tool name="read-config">
Read the substrate config.json as structured JSON — vocabulary, lenses, relation_types, status_buckets, display_strings, layers, block_kinds, installed_schemas, installed_blocks. Address ONE registry/map via `registry` (e.g. relation_types) and ONE entry within it via `id` (canonical_id) instead of reading the whole config.

*Read project config — vocabulary, lenses, relation_types, status_buckets*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `registry` | string | no | Address ONE config registry/map by key (e.g. 'relation_types', 'lenses', 'block_kinds', 'status_buckets') |
| `id` | string | no | With `registry`: address ONE entry within it by canonical_id |
</tool>

<tool name="list-tools">
Discover the agent's own tool surface (all loaded extensions + builtins). Default returns a COMPACT index — one line per tool (name · param-count · one-line description) plus the active set — not the full JSON-schemas. Pass `name` to fetch ONE tool's full descriptor (name + description + parameter JSON-schema + sourceInfo). Index-then-detail pattern.

*Discover available tools — compact index, or one tool's full descriptor via `name`*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | no | Address ONE tool by name → full descriptor (params schema + sourceInfo) |
</tool>

<tool name="read-samples-catalog">
Enumerate installable sample block kinds (packaged view): per kind — title, description, item shape, applicable relation_types (as source/target), invariants, lenses — plus top-level relation_type/lens/invariant/layer/status_bucket registries. Package-intrinsic: reads the extension's bundled samples catalog, independent of any project. Optional `kind` returns one packaged kind.

*Discover installable sample block kinds — title, shape, relation_types, invariants, lenses*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `kind` | string | no | Filter to one block_kind canonical_id (e.g. 'tasks') |
</tool>

<tool name="read-catalog-schema">
Fetch and print the verbatim catalog schema body (raw JSON Schema: properties/definitions/$id) for a named block kind — diffable locally against the installed `<substrate>/schemas/<name>.schema.json` without touching node_modules. Read-only; the projection-returning sibling is read-samples-catalog.

*Fetch and print the verbatim catalog schema body for a named block kind (raw JSON Schema, diffable locally)*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `kind` | string | yes | Catalog block_kind canonical_id (e.g. 'tasks') |
</tool>

<tool name="context-current-state">
Derive 'where are we + what's next' purely from the substrate — focus, in-flight items, ranked atomic-next actions, blocked items, and milestone rollups. Every facet derives from the config-declared `state_derivation` registry: which block kinds + status bucket count as in-flight, the focus fallback kind + bucket, the ordered cross-kind next-actions push order with per-entry ranking (a named field + ordered value list, e.g. gap priority P0..P3) or topo ordering over the blocking-relation graph, the relation_types whose edges contribute blockers (the stock set being `task_depends_on_task` dependencies + `task_gated_by_item` gates), the membership rollups (e.g. milestones over `phase_positioned_in_milestone`) with their complete/incomplete status strings, and the next-actions head-size cap. A blocked item's dependency/gate target that is not complete is reported in blockedBy and held out of nextActions; completeness follows the target kind's truth model — a rollup-declared kind (state_derivation.rollups, e.g. milestone) completes by its DERIVED membership rollup, the same verdict the milestones facet reports, so one read never self-contradicts and a derived-status kind's stored status field is never consulted; every other kind completes by its status bucketing to complete. A substrate whose config declares no `state_derivation` reports focus 'state-derivation not configured' with empty arrays. No writes; nothing hand-stored.

*Derive current project state from the config-declared state_derivation registry — focus, in-flight, ranked next actions, blocked, milestone rollups*

</tool>

<tool name="context-bootstrap-state">
Derive the substrate bootstrap state for the cwd, purely from the filesystem: 'no-pointer' | 'no-config' | 'skeleton' | 'not-installed' | 'ready', plus the resolved contextDir and any declared-but-unmaterialized installed assets. Bootstrap (/context init or /context switch -c <new-dir>) now writes a minimal schema-valid config empty of vocabulary, so a freshly-bootstrapped substrate lands at 'skeleton' — onward via /context accept-all (adopt the packaged catalog, then /context install) OR amend-config / edit (build a custom vocabulary). Unlike every other tool, this NEVER throws on an un-bootstrapped substrate — it returns 'no-pointer' so you can detect a fresh substrate and tell the user to run /context init <substrate-dir> → /context accept-all → /context install (bootstrap requires user authorization via interactive confirmation). No writes.

*Derive substrate bootstrap state — no-pointer | no-config | skeleton | not-installed | ready (never throws pre-bootstrap)*

</tool>

<tool name="rename-canonical-id">
Rename a canonical_id (kind: item | relation_type | lens | layer) from oldId to newId across all substrate surfaces that carry it as DATA — item home block + relations.json edges, or the relevant config registries. Out-of-substrate occurrences (analysis MDs, git history) are REPORTED, never rewritten. block_kind renames are unsupported (filesystem cascade). Use dryRun to preview the would-change counts without writing. Write pipeline: after this op's write, rollup-kind stored statuses converge with their derivation, and the config invariants are re-evaluated delta-scoped — a violation newly introduced by this write refuses it at error severity (substrate byte-restored) or is surfaced on the result at warning severity (write-warning lines / writeWarnings); pre-existing violations never block.

*Rename a canonical_id (item/relation_type/lens/layer) across substrate; dryRun to preview*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `kind` | string | yes | One of: item | relation_type | lens | layer |
| `oldId` | string | yes | Current canonical_id to rename from |
| `newId` | string | yes | New canonical_id to rename to |
| `dryRun` | boolean | no | Compute would-change counts without writing |
</tool>

<tool name="amend-config">
Scoped add / replace / remove of ONE entry in ONE config.json registry (block_kinds, relation_types, lenses, layers, invariants, status_buckets, display_strings, naming, installed_schemas, installed_blocks, hierarchy). The whole resulting config is AJV-validated (SHAPE) and op-correctness is enforced (add ⇒ key absent, replace/remove ⇒ key present). Cross-registry referential integrity (removing a still-referenced relation_type / lens / layer / block_kind) is NOT checked here — run context-validate after. dryRun previews without writing.

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
Read a substrate schema by name as parsed JSON. Returns null when the schema file is absent. Address ONE property via `path` (dotted/bracket, e.g. properties.tasks.items.properties.status) instead of reading the whole schema.

*Read a block schema as structured JSON — optionally address one property via `path`*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `schemaName` | string | yes | Schema name without extension (e.g., 'tasks', 'decisions', 'issues') |
| `path` | string | no | Address ONE property by dotted/bracket path (e.g. 'properties.tasks.items.properties.status') |
</tool>

<tool name="write-schema">
Create or replace a substrate block-kind JSON Schema. operation 'create' requires the schema absent; 'replace' requires it present. The body is AJV draft-07 meta-validated before an atomic write. Schema version bumps require a companion migration declaration via write-schema-migration; without one, read/write of items declaring an older schema_version throws version-mismatch. Registering the block_kind that points at this schema is a separate step (amend-config block_kinds).

*Create or replace a block-kind JSON Schema (meta-validated, atomic)*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `operation` | string | yes | create | replace |
| `schemaName` | string | yes | Schema name without extension (e.g., 'tasks') |
| `schema` | unknown | yes | The whole JSON Schema object (draft-07). Accepts a JSON string. |
| `dryRun` | boolean | no | Meta-validate without writing |
</tool>

<tool name="resolve-conflict">
Commit the reconciliation of a schema merge conflict surfaced by update. Run this AFTER reconciling a both-diverged conflict update reported: it writes the reconciled schema body (meta-validated, atomic, operation 'replace') AND advances the merge base for that schema to the packaged catalog body. Advancing the base is the step a bare write-schema lacks — without it, update's 3-way merge re-derives the SAME conflict on every subsequent run because the base never moves off the original pre-conflict body. With the base advanced to the catalog, the next update sees the schema as locally-modified (base === catalog ≠ your body) and the deterministic merge takes your reconciled body (base === theirs → ours) — auto-merging with zero conflicts and preserving your resolution. If schema is omitted, the current on-disk schema is treated as already reconciled and only the base is advanced. The calling agent runs this; no subordinate resolver is spawned.

*Commit a reconciled schema conflict: write the resolved body + advance the merge base to the catalog so update stops re-reporting it (run after reconciling an update conflict)*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `schemaName` | string | yes | Schema name without extension (e.g., 'tasks') |
| `schema` | unknown | no | The reconciled schema body R (whole JSON Schema object, draft-07; accepts a JSON string). If omitted, the current on-disk schema is treated as already reconciled and only the merge base is advanced. |
</tool>

<tool name="resolve-blocked">
Commit the resolution of a blocked schema surfaced by update. Run AFTER fixing the block's items (or widening the local schema): when the block file carries git-style failure markers (written by update), strips the full-line marker sentinels first, then re-validates the corrected block against the pinned target schema from the pending-blocked record; on pass registers the migration chain, writes the target schema, advances the merge base to the target (so a subsequent update converges instead of re-blocking), and clears the pending entry; on fail reports the remaining per-item failures and writes nothing. The commit is all-or-nothing: a throw partway through it restores every touched file byte-exact — migrations.json, the installed schema, the block file, config.json, and the pending record — and reports the failure, never a partial commit. On a substrate whose config carries no substrate_id, resolve-blocked establishes the identity at entry (mints, persists, registers) before the commit's stamping write and reports it under substrateIdEstablished.

*Commit a blocked schema's resolution: strip any git-style failure markers, re-validate the corrected block against the pinned target, then write the target schema + advance the base + clear the pending record (run after fixing the items update reported blocked)*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `schemaName` | string | yes | Schema name with a pending-blocked entry (from update's blocked report) |
</tool>

<tool name="write-schema-migration">
Declare a schema version-bump migration into substrate (migrations.json). operation 'create' appends a new declaration; 'replace' overwrites an existing declaration matched by (schemaName, fromVersion); 'remove' drops a declaration. kind='identity' asserts the bump is shape-compatible (no data transform); kind='declarative-transform' carries a TransformSpec of rename/set/delete/coerce/map_each operations on dotted JSON paths; map_each addresses an array — table mode maps each string element through a lookup (unmatched elements become {relation_type, item_endpoint} with parent/child fallback), set-on-each mode sets a field on every object element. The loaded MigrationRegistry resolves the recorded edge at next read/write so block items declaring an older schema_version walk forward without process restart. Requires user authorization via interactive confirmation at the pi-dispatch auth-gate; on confirm, the verified terminal-operator identity is stamped as writer.

*Declare a schema version-bump migration (identity or declarative-transform) into migrations.json*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `operation` | string | yes | create | replace | remove |
| `schemaName` | string | yes | Schema name without extension (e.g., 'tasks'). |
| `fromVersion` | string | yes | Source schema semver this migration walks forward FROM. |
| `toVersion` | string | yes | Destination schema semver this migration produces. Must differ from fromVersion. Ignored for operation=remove. |
| `kind` | string | no | identity | declarative-transform. Required for operation=create/replace; ignored for remove. |
| `transform` | unknown | no | TransformSpec body — required when kind='declarative-transform'; forbidden when kind='identity'. Accepts a JSON string. |
| `writer` | object | yes | DispatchContext.writer per pi-context/src/dispatch-context.ts. |
</tool>

<tool name="context-init">
Initialize the substrate dir: bootstrap pointer + dirs + a minimal schema-valid SKELETON config empty of vocabulary. Lands at the 'skeleton' bootstrap state — onward via accept-all (adopt the packaged catalog, then install) OR amend-config / edit (build a custom vocabulary).

*Initialize the substrate dir (bootstrap pointer + dirs + skeleton config; onward via accept-all OR amend-config/edit)*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `contextDir` | string | yes | Substrate dir name (e.g. .context). Required — no default. |
</tool>

<tool name="context-accept-all">
Adopt the canonical packaged conception (samples/conception.json) as this substrate's config.json (accept-all). Writes config only — run install after. Skeleton-aware: overwrites a SKELETON config (the empty-of-vocabulary config init / switch -c writes) but never a POPULATED one.

*Adopt the canonical conception as config (accept-all)*

</tool>

<tool name="context-install">
Install (materialize) the schemas and starter blocks declared in config.json's installed_schemas / installed_blocks from the package samples catalog. Default skip-if-exists (installed files never overwritten without --update); populated block data is always preserved (even with --update); empty or absent blocks get the catalog starter. Records the install baseline (config.installed_from: catalog source + per-schema fingerprint) for installed-vs-catalog drift detection (schemas only). A re-install on an unchanged substrate is idempotent. On a substrate whose config carries no substrate_id, install establishes the identity at entry (mints, persists to config.json, registers in the project registry) and reports it under substrateIdEstablished; an established identity is never re-minted.

*Install declared schemas + starter blocks from the samples catalog (skip-if-exists; --update re-syncs schemas + replaces empty blocks; records the config.installed_from baseline)*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `update` | boolean | no | When true, re-sync existing installed schemas (migration-aware) and replace empty blocks with the catalog starter; populated block data is never overwritten. When false (default), skip existing files. |
</tool>

<tool name="update">
Bring the installed substrate model (schemas) current with the packaged catalog. Per installed schema, consults the read-only drift check and routes by state: an already-current (in-sync) schema is a no-op; a schema the package shipped a newer version of (catalog-ahead) is re-synced through the migration-aware path; a schema edited locally (locally-modified / both-diverged) is reconciled by a deterministic 3-way merge of base (the as-installed body in the object store, keyed by the recorded baseline content_hash) × ours (the installed schema) × theirs (the catalog schema) — disjoint edits auto-merge so both the user's and the catalog's changes survive (required / enum / array-valued type nodes merge as sets), and a schema with irreconcilable per-path conflicts is left unmodified — the conflict set is returned in the op output (under conflicts) alongside a readable report, and the calling agent reconciles it then commits via resolve-conflict — which writes the reconciled body AND advances the merge base to the catalog so update stops re-reporting it (no subordinate resolver is spawned); undecidable / absent schemas (no-baseline / missing-catalog / missing-installed) are reported, not touched. Update also additively propagates catalog-new config-registry entries (relation_types / invariants / block_kinds / lenses) that are absent from the substrate config, preserving every user-authored entry and any locally-diverged body of an existing entry (additive-only — present entries are never overwritten). Update reports, under migrationsRegistered, the migration declarations a version-bump resync registers into migrations.json (each as schema / from / to). A blocked (refused) catalog-ahead schema additionally carries its diagnostic detail under blockedDetail (one entry per blocked schema): the refusal reason — no-migration-chain (no shipped chain reaches the catalog version) vs validation-failed (the forward-migrated items fail the catalog schema) vs write-failed (a non-validation throw at the write boundary, e.g. the block writer's duplicate-item-id guard; the failures entry carries the thrown message, the items were NOT flagged invalid, and no markers or pending-blocked record are produced) — the installed -> catalog version pair, and for a validation failure the per-item failures naming the failing item id, field, and constraint. A live blocked resync also persists a pending-blocked record (pinning the target catalog schema + the chain reaching it) consumable by resolve-blocked, which commits the resolution once the block's items are fixed. Pass dryRun to preview the per-schema action plan; dryRun predicts the precise per-schema catalog-ahead outcome (resync / migrate / block / merge / conflict) by running the forward-migration + re-validation in memory, the per-blocked-schema diagnostic detail, the config-registry entries that would be added, AND the migration declarations that would be registered, writing nothing beyond the idempotent ceremony seed of the catalog's config migration declarations into migrations.json (every substrate-lifecycle ceremony seeds at entry, before its first config read, so a version-lagging legacy substrate heals instead of throwing). When a catalog-ahead resync is blocked because the block's items fail the catalog schema (validation-failed), update inscribes git-style failure markers INTO the block file at the offending items (full-line `<<<<<<< BLOCKED …` / `>>>>>>> target: …` sentinels), pinning the pre-marker bytes so resolve-blocked can strip the markers and re-validate; the schema and migrations.json stay byte-unchanged. A dryRun preview writes no markers. Because update applies per-component (a blocked schema rolls back only itself; the additive registry propagation writes regardless), a run that refuses any schema while applying registry additions or other-schema resyncs/migrations/merges reports the partiality under partialApplication — applied and notApplied channel mirrors plus a one-line summary naming what was applied alongside what was refused and why — so a blocked run never reads as a no-op; dryRun reports the predicted partiality in the same shape. On a substrate whose config carries no substrate_id, a LIVE update establishes the identity at entry (mints, persists to config.json, registers in the project registry) before its first identity-stamping write — so a pre-identity substrate heals on the ceremony instead of refusing — and reports it under substrateIdEstablished; an established identity is never re-minted, and dryRun (no stamping writes) establishes nothing.

*Update the installed schema model from the catalog (3-way merges locally-modified schemas, preserving non-conflicting edits; conflicts → returned in the op output + a report for the calling agent to reconcile and commit via resolve-conflict; a blocked resync carries blockedDetail — reason (no-migration-chain / validation-failed / write-failed for a non-validation write-boundary throw), version pair, per-item failures — and a validation-failed block persists a pending-blocked record (target catalog schema + the chain reaching it) resolved via resolve-blocked once the block's items are fixed; a validation-failed block is marked in place with git-style failure markers (recoverable; stripped + re-validated by resolve-blocked); --dry-run predicts the precise per-schema outcome — resync / migrate / block / merge / conflict — via in-memory forward-migration + re-validation, writing nothing; a run that refuses any schema while applying registry additions or other-schema updates surfaces the partiality under partialApplication with a one-line summary, so a blocked run never reads as a no-op)*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `dryRun` | boolean | no | Preview the per-schema action plan without writing anything. |
</tool>

<tool name="context-reconcile">
Converge stored substrate state with its derivation (the repair half of the derived-status invariant class). For every block kind a derived-status invariant declares (paired with its state_derivation.rollups entry), computes each item's stored-vs-derived status delta using the SAME completeness helper the state derivation's gate satisfaction and context-validate use — the preview, the detector, and the repair cannot disagree. --dryRun returns the exact delta set a live run would apply (id, block, from stored value, to derived value, declaring invariant), writing nothing. A live run applies exactly that set through the standard validated write path — identity-stamped, envelope-stamped, attested to the invoking writer — and reports the applied count; a converge-write is not authoring, the written value IS the derivation. Scope: derived-status deltas ONLY — the op never writes an authored-status kind (feature/gap/issue/task buckets are human judgment) and never touches prose; those classes are flagged for review by context-validate, not auto-repaired. Ceremony discipline: seeds the catalog config migration declarations at entry, and a live run on a substrate with no substrate_id establishes the identity first (reported under substrateIdEstablished). A converged substrate is a clean no-op both ways.

*Converge stored rollup-kind statuses with their derivation (--dryRun previews the exact delta set; live applies it through the validated write path; never touches authored statuses or prose)*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `dryRun` | boolean | no | Preview the exact delta set without writing anything. |
</tool>

<tool name="validate-block-items">
Validate a block's items against the catalog schema version — returns the per-item failures (item id, field, constraint) without writing. Resolves the block's catalog block_kind, loads the installed block, forward-migrates its items in memory through the shipped chain when the block lags the catalog version (a fresh registry; never warms the project's cache), and validates against the catalog schema body. Returns block / from (the block's declared version) / to (the catalog version) / valid / failures[] (each: itemId — the failing item's id when the instancePath resolves to one — instancePath, keyword, message). Read-only: never overwrites the schema, the block, or migrations.json. An unknown block or a missing installed block file throws.

*Validate a block's items against the catalog schema version — returns the per-item failures (item id, field, constraint) without writing*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `block` | string | yes | Block name (e.g. 'tasks') |
</tool>

<tool name="context-switch">
Flip the bootstrap pointer to a different substrate dir (parallel to git switch). Default: flip to an existing substrate at target_dir (requires config.json present). create_new=true: bootstrap a fresh substrate at target_dir AND flip in one operation. to_previous=true: flip back to the pointer's previous_contextDir (target_dir ignored).

*Switch the bootstrap pointer to a different substrate dir*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `target_dir` | string | yes | Substrate dir name to switch to (e.g. '.context'). Required for default + create_new modes; ignored for to_previous mode. |
| `create_new` | boolean | no | When true, bootstrap target_dir as a fresh substrate (dirs + a minimal schema-valid SKELETON config empty of vocabulary — onward via accept-all OR amend/edit) AND flip the pointer in one operation (parallel to 'git switch -c <branch>'). Default false (flip to existing substrate; fails if target_dir lacks config.json). |
| `to_previous` | boolean | no | When true, flip the pointer back to its previous_contextDir (parallel to 'git switch -'). Requires the pointer to carry a previous_contextDir (a prior switch must have populated it). When true, target_dir is ignored. |
| `writer` | object | no | DispatchContext.writer — stamped by auth-gate on operator confirm; in-body trusts the stamped value. |
</tool>

<tool name="context-list">
Enumerate top-level dirs under cwd containing a config.json (switchable substrates). Marks the active one with isActive=true. Read-only.

*List switchable substrate dirs under cwd*

</tool>

<tool name="context-archive">
Move a non-active substrate dir to archive/<dir>/. Refuses to archive the active substrate (the dir the bootstrap pointer currently names) or to clobber an existing archive/<dir>/.

*Archive a non-active substrate dir to archive/<dir>/*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `target_dir` | string | yes | Substrate dir name to archive (e.g. '.project'). Refused if it is the active substrate. |
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
Look up the block, array key, and item payload for a given ID across all blocks in the substrate dir. Returns null when no item matches. Mirrors the resolveItemById SDK function and shares its prefix-vs-block invariant — IDs whose prefix maps to a known block but live elsewhere throw at index-build time.

*Resolve a kind-prefixed ID (DEC-/FEAT-/FGAP-/issue-/REQ-/TASK-/etc.) to its owning block and item*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | yes | Kind-prefixed ID, e.g., DEC-NNNN / FEAT-NNN / FGAP-NNN / ISSUE-NNN |
</tool>

<tool name="read-block-item">
Read a single item from a named block by its id — returns the item or null. Block-scoped (unlike resolve-item-by-id, which searches all blocks by kind-prefixed id). Avoids fetching a whole large block to get one item.

*Read one item from a block by id (block-scoped; null if absent)*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `block` | string | yes | Block name (e.g., 'tasks', 'decisions', 'framework-gaps') |
| `id` | string | yes | Item id within the block (e.g., 'TASK-NNN') |
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
Join two blocks in one call. EDGE mode: pass `relationType` — pairs left items with right-block items connected by that relations.json edge (`leftEndpoint` parent|child, default parent). FIELD mode: pass `leftField`+`rightField` — pairs where left[leftField] === right[rightField]. Optional left pre-filter via where{Field,Op,Value}. Returns [{left, right:[]}] (right always an array; one-to-many). Use instead of N+1 read-block + resolve calls.

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
Complete a task with verification gate — the closure ATOM. Requires a passing verification entry, then FILES the verification_verifies_item edge itself (idempotent — a pre-existing exact edge is a no-op) and flips the task status to completed in one op run, so the write-time invariant gate judges the joint end-state. No prior append-relation step is needed (a standalone edge or status write would be refused by error-severity closure invariants; this op IS the legal transition). Write pipeline: after this op's write, rollup-kind stored statuses converge with their derivation, and the config invariants are re-evaluated delta-scoped — a violation newly introduced by this write refuses it at error severity (substrate byte-restored) or is surfaced on the result at warning severity (write-warning lines / writeWarnings); pre-existing violations never block.

*Complete a task — gates on passing verification, files the verification edge itself, then flips status (one atom)*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `taskId` | string | yes | Task ID to complete |
| `verificationId` | string | yes | Verification entry ID (must have status 'passed'; the op files the linking edge itself) |
</tool>

<tool name="context-validate-relations">
Validate substrate relations.json edges against config-declared lenses + hierarchy + relation_types and the cross-block id index. Returns SubstrateValidationResult with status (clean/warnings/invalid) and per-issue diagnostics.

*Validate substrate relations against config + items*

</tool>

<tool name="context-edges-for-lens">
Materialize the Edge[] for a named lens — synthetic edges from derived_from_field for auto-derived lenses; authored edges filtered by relation_type for hand-curated lenses; unioned items from composition members for kind=composition lenses.

*Materialize edges for a named lens (auto-derived or hand-curated)*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `lensId` | string | yes | Lens id from config.lenses[].id |
</tool>

<tool name="context-lens-view">
Project a config-declared lens (config.lenses[]) as a binned item-view. Without --bin, a bin->count summary (always under the read cap). With --bin, that bin's items paged by --offset/--limit. Serves target, composition, and hand-curated lenses.

*Project a config-declared lens as a binned item-view — bin->count summary, or one bin's items paged*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `lensId` | string | yes | Lens id from config.lenses[].id |
| `bin` | string | no | Return this bin's items paged; omit for a bin->count summary |
| `offset` | integer | no | Per-bin page start index (default 0) |
| `limit` | integer | no | Per-bin page size (default 50) |
</tool>

<tool name="context-walk-descendants">
Walk closure-table descendants of a parent id under a given relation_type. Returns string[] of descendant ids (may be empty if no children or relations.json absent). For a DISJOINT-kind relation, querying from the wrong (target-kind) end THROWS naming walk-ancestors instead of silently returning []; same-kind / wildcard relations return [] honestly.

*Walk closure-table descendants under a relation_type*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `parentId` | string | yes | Parent id (canonical id or lens bin name) |
| `relationType` | string | yes | Relation type from config.relation_types[].canonical_id |
</tool>

<tool name="walk-ancestors">
Walk closure-table ancestors of an item id under a given relation_type — reverse-direction counterpart to context-walk-descendants. Returns string[] of ancestor ids (may be empty if no parents or relations.json absent). For a DISJOINT-kind relation, querying from the wrong (source-kind) end THROWS naming context-walk-descendants instead of silently returning []; same-kind / wildcard relations return [] honestly.

*Walk closure-table ancestors under a relation_type*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `itemId` | string | yes | Child item id whose ancestors are sought |
| `relationType` | string | yes | Relation type from config.relation_types[].canonical_id |
</tool>

<tool name="find-references">
Find all closure-table edges incident on an item id (inbound, outbound, or both). Returns Edge[] preserving relation_type + ordinal per record — edge-level view, not the id-chain projection that walk-ancestors / context-walk-descendants emit.

*Find closure-table edges incident on an item id*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `itemId` | string | yes | Item id whose incident edges are sought |
| `direction` | unknown | no | inbound: edges where child === itemId; outbound: edges where parent === itemId; both: union (default). |
</tool>

<tool name="gather-execution-context">
Compose a ContextBundle for a work-unit by reading its context-contract (by unit_kind) and walking declared relation_types bidirectionally per direction semantic. Returns unit + perRelationType buckets of resolved items + traversal_depth + scoped_at. Substrate primitive serving harness-confined dispatch.

*Compose ContextBundle for unit + context-contract-declared bundle_relation_types*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `unitId` | string | yes | Work-unit id (e.g. TASK-NNN / DEC-NNNN / FGAP-NNN) |
| `kind` | string | yes | Unit-kind type tag (e.g. 'task', 'decision', 'verification') matching a context-contract entry's unit_kind |
| `maxDepth` | integer | no | Override per-relation-type max_depth via Math.min against each spec.max_depth |
</tool>

<tool name="context-roadmap-load">
Load the derived roadmap view over the milestone_precedes_milestone DAG: milestone-block items topo-ordered by the authored precedes edges (order + cycles), each milestone carrying its derived status/phaseCount (currentState's milestone rollup), its member phases (parents of phase_positioned_in_milestone edges), each phase's tasks (parents of task_positioned_in_phase edges), and per-phase + per-milestone status rollups. Adjacency comes strictly from the authored edges — never inferred from order. Zero milestones is a valid empty view.

*Load the derived milestone roadmap view*

</tool>

<tool name="context-roadmap-render">
Render the derived roadmap as pure-textual markdown — milestone order list (topo over the authored milestone_precedes_milestone edges), per-milestone sections with **Preceded by:** adjacency lines sourced strictly from those edges (alphabetically sorted; '—' when none), per-milestone rollup counts, and per-phase task tables. Cycle participants surface under a separate heading with a Cycles-detected line. NO mermaid / graph syntax; adjacency is never inferred from order consecutive pairs.

*Render the derived milestone roadmap as markdown*

</tool>

<tool name="context-roadmap-validate">
Validate the derived roadmap over the milestone_precedes_milestone edges. Error codes: roadmap_precedes_endpoint_missing (a precedes-edge endpoint that is not a milestone-block item), roadmap_milestone_cycle (a cycle in the precedes graph), roadmap_milestone_missing (a phase_positioned_in_milestone edge whose child is not a known milestone). Warning: roadmap_status_unknown_value (a member phase whose task rollup buckets unknown with items present). Info: roadmap_milestone_isolated (a milestone with zero precedes edges while others are ordered) — info never affects status: invalid iff any error-code issue, warnings iff any warning-code issue, else clean. Display strings flow through config.display_strings (pi-context divergence).

*Validate the derived milestone roadmap*

</tool>

</tools_reference>

<commands_reference>
<command name="/context">
Context state management

Subcommands: `init`, `switch`, `list`, `archive`, `install`, `check-status`, `accept-all`, `view`, `lens-curate`, `roadmap-view`, `roadmap-validate`, `status`, `add-work`, `validate`, `help`
</command>

</commands_reference>

<events>
`session_start`, `before_agent_start`, `resources_discover`
</events>

<bundled_resources>
12 schemas, 38 samples bundled.
See references/bundled-resources.md for full inventory.
</bundled_resources>

<installable_blocks>

Names valid for the `installed_blocks` array in `<substrate-dir>/config.json`. Install with `/context install <block>`.

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
| `milestone` | `samples/blocks/milestone.json` |
| `work-orders` | `samples/blocks/work-orders.json` |
| `session-notes` | `samples/blocks/session-notes.json` |

</installable_blocks>

<installable_schemas>

Names valid for the `installed_schemas` array in `<substrate-dir>/config.json`. Schemas back block validation; install with `/context install <schema>`.

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
| `milestone` | `samples/schemas/milestone.schema.json` |
| `work-orders` | `samples/schemas/work-orders.schema.json` |
| `session-notes` | `samples/schemas/session-notes.schema.json` |

</installable_schemas>

<planning_vocabulary>

**Block Types:**

| Block | Title | Array Key | Item Fields |
|-------|-------|-----------|-------------|
| `decisions` | Decisions | `decisions` | id, title, status (string (open|enacted|superseded)), context, decision, options_considered? (array), consequences (array), references? (array), created_by, created_at, enacted_by?, enacted_at?, oid?, content_hash?, content_parent? |
| `framework-gaps` | Framework Gaps | `gaps` | id, title, status (string (identified|accepted|in-progress|closed|wontfix|superseded_by)), priority? (string (P0|P1|P2|P3)), package, layer? (string (L1|L2|L3|L4|L5)), description, evidence (array), impact, canonical_vocabulary?, proposed_resolution, related_features? (array), related_decisions? (array), related_issues? (array), created_by, created_at, closed_by?, closed_at?, oid?, content_hash?, content_parent? |
| `tasks` | Tasks | `tasks` | id, description, status (string (planned|in-progress|completed|blocked|cancelled)), files? (array), acceptance_criteria? (array), assigned_agent?, notes?, oid?, content_hash?, content_parent? |
| `verification` | Verification | `verifications` | id, status (string (passed|failed|partial|skipped)), method (string (command|inspect|test)), evidence?, timestamp?, criteria_results? (array), oid?, content_hash?, content_parent? |
| `issues` | Issues | `issues` | id, title, body, location, status (string (open|resolved|deferred)), category (string (primitive|issue|cleanup|capability|composition)), priority (string (low|medium|high|critical)), package, source? (string (human|agent|monitor|workflow)), resolved_by?, resolved_at?, oid?, content_hash?, content_parent? |
| `features` | Features | `features` | id, title, status (string (proposed|approved|in-progress|in-review|complete|blocked|cancelled)), layer (string (L1|L2|L3|L4|L5)), description, motivation?, acceptance_criteria (array), created_by, created_at, modified_by?, modified_at?, approved_by?, approved_at?, oid?, content_hash?, content_parent? |
| `research` | Research | `research` | id, title, status (string (planned|in-progress|complete|stale|superseded|revised)), layer (string (L1|L2|L3|L4|L5)), type (string (investigative|comparative|empirical|historical|audit|landscape|feasibility|curation)), question, method, scope? (array), findings_summary, findings_document?, grounding? (object), grounded_at?, stale_conditions? (array), citations? (array), conducted_by?, conducted_at?, created_by, created_at, modified_by?, modified_at?, oid?, content_hash?, content_parent? |
| `rationale` | Design Rationale | `rationales` | id, title, narrative, phase? (integer), oid?, content_hash?, content_parent? |
| `spec-reviews` | Spec Reviews | `reviews` | id, target, target_revision?, reviewer?, status (string (not-started|in-progress|complete|abandoned)), scope? (array), method?, clean? (boolean), created_by, created_at, completed_at?, oid?, content_hash?, content_parent? |
| `layer-plans` | Layer Restructure Plans | `plans` | id, title, status (string (draft|proposed|decided|in-progress|complete|abandoned)), model, description?, layers (array), migration_phases (array), created_by, created_at, oid?, content_hash?, content_parent? |
| `requirements` | Requirements | `requirements` | id, description, type (string (functional|non-functional|constraint|integration)), status (string (proposed|accepted|deferred|implemented|verified)), priority (string (must|should|could|wont)), acceptance_criteria? (array), source? (string (human|agent|analysis)), oid?, content_hash?, content_parent? |
| `conventions` | Conventions | `rules` | id, description, enforcement (string (lint|test|review|manual)), severity (string (error|warning|info)), oid?, content_hash?, content_parent? |
| `context-contracts` | Context contracts | `contracts` | id, unit_kind, bundle_relation_types (array), description?, notes?, created_by, created_at, modified_by?, modified_at?, oid?, content_hash?, content_parent? |
| `phase` | Phases | `phases` | id, name, intent, goal?, status (string (planned|in-progress|completed)), success_criteria? (array), specs? (array), artifacts_produced? (array), oid?, content_hash?, content_parent? |
| `story` | Stories | `stories` | id, title, user_kind?, status (string (proposed|ready|in-progress|in-review|complete|blocked)), description?, acceptance_criteria? (array), created_by?, created_at?, modified_by?, modified_at?, oid?, content_hash?, content_parent? |
| `milestone` | Milestones | `milestones` | id, name, status (string (planned|reached)), release?, created_by?, created_at?, modified_by?, modified_at?, oid?, content_hash?, content_parent? |
| `work-orders` | Work Orders | `work_orders` | id, title, status (string (proposed|in-progress|real-check-passed|real-check-failed|completed|cancelled)), target_agent, input_contract (object), context_blocks (array), output_contract (object), scope (object), real_check_criteria (object), description?, created_by?, created_at?, modified_by?, modified_at?, oid?, content_hash?, content_parent? |
| `session-notes` | Session Notes | `sessions` | id, timestamp, focus, discoveries? (array), questions? (array), decisions_made? (array), current_status, next_steps (array), oid?, content_hash?, content_parent? |

**Status Enums:**

| Block | Field | Values |
|-------|-------|--------|
| `decisions` | `status` | open, enacted, superseded |
| `framework-gaps` | `status` | identified, accepted, in-progress, closed, wontfix, superseded_by |
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
| `milestone` | `status` | planned, reached |
| `work-orders` | `status` | proposed, in-progress, real-check-passed, real-check-failed, completed, cancelled |

</planning_vocabulary>

<objective>
pi-context manages structured project state in the substrate directory — a directory of JSON block files validated against schemas. The substrate (config + lenses + closure-table relations) is degree-zero state that defines where the rest lives and how items group into views.
</objective>

<block_files>
Blocks are JSON files under the substrate root (one per block kind, each an array of items). Each block has a corresponding schema in `<root>/schemas/`. When you write to a block via the tools, the data is validated against its schema before persisting. Writes are atomic (tmp file + rename) and serialised per block via `withBlockLock`. The substrate root is the dir chosen at init (recorded in the `.pi-context.json` bootstrap pointer) and written to `config.json`'s `root` field at init (skeleton config) and again by `/context accept-all`; the framework ships no default substrate-dir name. block-api routes through `resolveContextDir(cwd)` — which resolves `config.root` when set and otherwise falls back to the pointer — so a relocated root reaches every read/write site.

Each item in an identity-bearing block carries a three-layer identity, not a refname alone: `id` (the mutable human label, e.g. a kind-prefixed refname), `oid` (a content-independent 32-hex identity minted once at the item's birth and immutable thereafter, salted by the substrate's `substrate_id`), `content_hash` (a SHA-256 over the item's content projection — the item minus its metadata fields — so identical content deduplicates), and `content_parent` (the prior version's `content_hash`, forming a per-item version chain that advances only when content actually changed). A write carrying a different incoming `oid` is rejected. Identity stamping is a no-op unless the block's array subschema declares all three identity fields, scoping content-addressing to canonical schemas and leaving bespoke/test schemas untouched.
</block_files>

<content_addressing>
On a stamping write the item's content projection (a shallow copy with the metadata fields removed) is persisted to `<substrate-dir>/objects/<content_hash>.json` — a content-addressed object store (idempotent, atomic tmp+rename; identical content yields a byte-identical file). The store is git-tracked: it is the integrity/version store, and gitignoring it would lose pinning. Object persistence is deferred until after the whole block clears schema validation, so a validation failure never orphans an object. The metadata fields excluded from the content hash are the mandatory floor `{id, oid, content_hash, content_parent}` (never hashable, never pullable into the hash by an override) plus a discretionary set (the author fields and `closed_by`/`closed_at`); a schema's item subschema may redefine the discretionary set via `x-identity.metadata_fields`, but the floor is always unioned in.
</content_addressing>

<schema_validation>
Every block write validates against `<root>/schemas/<blockname>.schema.json`. If the schema file doesn't exist, writes proceed without validation. Validation errors include the specific JSON Schema violations.
</schema_validation>

<context_init>
`/context init <substrate-dir>` creates the substrate skeleton: the `.pi-context.json` bootstrap pointer (declaring the chosen substrate-dir name), the substrate root and its `schemas/` directory, a minimal SKELETON `config.json` (`schema_version`, empty `block_kinds`, `root`, and a minted + project-registered `substrate_id` — no vocabulary), and the catalog's `config` migration declarations seeded into `migrations.json`. No catalog vocabulary, schemas, or starter blocks are imposed (ship-no-defaults). Idempotent: re-running preserves existing dirs and never clobbers an existing `config.json`. Populate the substrate next with `/context accept-all` (adopt the canonical conception) followed by `/context install`.
</context_init>

<context_accept_all>
`/context accept-all` adopts the package's canonical packaged conception (`samples/conception.json`) as the substrate's `config.json` — the full vocabulary (`block_kinds`, `relation_types`, `lenses`, `invariants`) plus the `installed_schemas` / `installed_blocks` manifest — with `root` set to the actual substrate dir. It writes `config.json` only (run `/context install` after to materialize the schemas + starter blocks) and is idempotent: it never overwrites a populated `config.json` (offer, don't impose); the vocabulary-empty skeleton `config.json` written by init IS overwritten by the catalog, with the skeleton's on-disk `substrate_id` preserved. This is the accept-all path; per-entry step-through curation is a separate surface.
</context_accept_all>

<context_install>
`/context install` (reflected CLI op: `pi-context context-install [--update]`, `authGated`) reconciles the substrate against the `installed_schemas` and `installed_blocks` lists declared in `config.json`. The slash command and the CLI op run the same install engine — the op's `--update` maps to the same migration-aware overwrite the slash command's `--update` does. For each declared name it copies the matching asset from the package-shipped samples catalog (`samples/schemas/` for schemas, `samples/blocks/` for starter blocks) into the substrate. Default behavior is skip-if-exists (preserves user edits). Pass `--update` to re-sync installed SCHEMAS through the migration registry: a same-version body change (or a non-versioned schema) is a verbatim re-sync (reported `resynced`); a schema `version` bump forward-migrates the populated block's items through the shipped catalog migration chain and re-validates them against the new schema (reported `migrated`); a bump with no safe migration — no shipped chain reaching the catalog version, or items that would fail the new schema — is refused, leaving BOTH the installed schema file AND the block file byte-unchanged (reported `blocked`). Preview drift first with `/context check-status`. Populated block data is never overwritten — a block holding items is preserved (reported as `preserved`) regardless of `--update`, while empty or absent blocks receive the catalog starter. Sources missing from the catalog are reported as `notFound`. Empty install lists are not an error — the result is a clean no-op message instructing the user to edit `config.json`. Install also records an install baseline in `config.installed_from`: the catalog source (`catalog` = pi-context `name@version`, `catalog_version` = conception `schema_version`), a baseline timestamp, and a per-schema fingerprint (`assets[canonical_id]` = content hash + the schema's own version) of the installed SCHEMAS — the basis for installed-vs-catalog drift detection. The baseline covers schemas only (blocks are user data). A re-install on an unchanged substrate is idempotent: the existing baseline is preserved verbatim (timestamp included) so `config.json` stays byte-identical. `/context check-status` is a separate read-only command that previews drift between the installed schemas and the catalog: it compares each installed schema against its recorded baseline, the catalog's current schema, and the currently-installed file, and reports `in-sync` / `catalog-ahead` (the package shipped a newer schema) / `locally-modified` (the installed file was edited) / `both-diverged` / `no-baseline` / `missing-catalog` / `missing-installed`. For each schema behind the catalog (`catalog-ahead` / `both-diverged`) it additionally surfaces which schema is behind and by what version gap — `behind` plus a `version_delta` carrying the baseline → catalog version pair (a declared version bump) or a content-only basis when the catalog body moved with the version string unchanged. It writes nothing. The reflected CLI op is `pi-context context-check-status --json`.

The installable catalog IS the packaged conception (`samples/conception.json`): its `block_kinds` enumerate the available kinds, each carrying its schema (`samples/schemas/`) and starter block (`samples/blocks/`). The generated installable-catalog table below lists the authoritative names — declare any subset in `installed_*` and run `/context install`, or take the whole conception via `/context accept-all`. To inspect a catalog schema body itself, `pi-context read-catalog-schema --kind <canonical_id>` fetches and prints the verbatim bundled `*.schema.json` (the raw JSON Schema — `properties` / `definitions` / `$id`, distinct from the `read-samples-catalog` summary projection), so after `/context check-status` flags a schema behind the catalog you can diff that body locally against the installed `<substrate>/schemas/<name>.schema.json` without hunting through `node_modules`. It is read-only and package-intrinsic (reads the bundled catalog, mutates nothing).
</context_install>

<substrate_config>
`<substrate-dir>/config.json` is the substrate bootstrap. Its `root` field declares where every other block, schema, agent, and template lives — consumers resolve that dir via the `.pi-context.json` pointer plus `config.root`, never by assuming a fixed directory name. Its `substrate_id` field is the per-substrate root identity (pattern `sub-` followed by 16 hex), minted once and immutable on disk; it salts oid minting and identifies the substrate in the project-root registry. `naming` aliases canonical block ids to display names (used by `/context view` rendering). `hierarchy` declares legal closure-table edges (parent block → child block via relation_type). `lenses` declares named projections over a target block. `installed_schemas` / `installed_blocks` are the install manifest consumed by `/context install`. `installed_from` is the optional install baseline `/context install` records — the catalog source plus a per-schema content fingerprint of the installed schemas — for installed-vs-catalog drift detection.

A fresh substrate adopted via `/context accept-all` carries advisory (severity-`warning`) convention-articulation invariants: every decision, feature, and task should carry an `item_governed_by_convention` edge to a convention it follows, or an `item_acknowledges_missing_convention` edge to a missing-convention gap. `context-validate` reports an artifact that articulates neither as a warning (it does not error), so the advice surfaces without blocking writes; satisfy it by filing one of those two edges as a birth relation on the filing itself (`append-block-item --relations`; each entry oriented by `direction: as_parent|as_child` for raw appends, or `role: primary|counter` for role-bearing orientation-ambiguous relation_types such as the gated-by / derived-from / supersedes / depends families, mapped via the relation's declared `role_direction`) or by `append-relation` when amending an existing artifact. On a substrate that raises a birth-edge invariant to `error`, the atomic filing form is the only path the write-time gate accepts — a bare filing is refused, and the edge cannot be added afterward because the intermediate state is itself the violation. Task closure has the same shape: `complete-task` files the `verification_verifies_item` edge itself and flips the task status in one gate-judged run, so no standalone `append-relation` precedes it.

`config.json` and `relations.json` are exempt from `config.root` redirection — they always live at the substrate-dir root (the dir chosen at bootstrap, resolved via the `.pi-context.json` pointer, suggested `.context`) because they are the substrate that defines `root`. The substrate-dir root is whatever was chosen at bootstrap, not necessarily `.project`. All other state lives under `<config.root>/...` per `resolveContextDir(cwd)`. The package ships their schemas in `schemas/` (config.schema.json, relations.schema.json) and resolves them via three-tier search: project override > user override > package-shipped.

The `loadContext(cwd)` SDK returns an mtime-keyed cached snapshot of `{ config, relations, configMtime, relationsMtime }` for one cwd. Consumers must not mutate.
</substrate_config>

<cross_substrate>
A project can carry multiple substrates. The `.pi-context.json` bootstrap pointer names the single ACTIVE substrate dir; a separate project-root, git-tracked `.pi-context-registry.json` enumerates ALL substrates — a version plus `substrates: { <substrate_id>: { dir, aliases[] } }`. `resolveSubstrateDir(cwd, substrate_id)` and `resolveAlias(cwd, alias)` look up the registry and return null on a clean miss.

`resolveRef(cwd, ref)` classifies any endpoint into one of four statuses: `active` — resolved in the active substrate's index (a bare oid/refname, or any lens_bin endpoint, which is always active without an item lookup); `foreign` — a structured endpoint carrying a `substrate_id`, or an `<alias>:<refname>` string whose alias is registered, resolved in the foreign substrate's index; `dangling` — a locator naming a registered substrate where the oid/refname is absent; `unregistered` — a `substrate_id` or alias the registry does not carry. A string with a NON-leading `:` (the parse gates on `colon > 0`) is first attempted as an `<alias>:<refname>` parse; a leading-colon string is not alias-parsed.

Source-of-truth-drift invariant: `validateContext` requires the active `config.substrate_id` to have a registry entry whose `dir` resolves to the active substrate. A mismatch yields `substrate_id_registry_mismatch`; a missing entry yields `substrate_id_unregistered`.
</cross_substrate>

<schema_versioning>
Schemas are draft-07 JSON-Schema, one per block kind, under `<substrate-dir>/schemas/`. Package-shipped substrate-singleton schemas carry a `pi-context://schemas/<name>` `$id` plus a `version`. `<substrate-dir>/migrations.json` is the per-substrate schema-version migration registry. A schema `version` bump REQUIRES a companion migration declared via the `write-schema-migration` tool; without one, reading or writing an item that declares an older `schema_version` throws a version mismatch. Migration kinds are `identity` (shape-compatible, no transform) or `declarative-transform` (a TransformSpec of rename/set/delete/coerce/map_each on dotted paths; `map_each` addresses an array — table mode maps each string element through a lookup, with unmatched elements becoming `{relation_type, item_endpoint}` under a parent/child fallback, and set-on-each mode sets a field on every object element). The loaded registry resolves the migration edge at the next read/write, so items walk forward without a process restart. Config loading is migration-aware: a `config.json` whose `schema_version` lags the bundled config schema is walked forward through the `config` migration chain in memory at load (the on-disk file is never rewritten); every substrate-lifecycle ceremony — init / accept-all / install / update / check-status / switch (existing-target and switch-back forms; the target substrate is seeded right after the pointer flip) / resolve-conflict / resolve-blocked — seeds the catalog's `config` identity declaration into `migrations.json` (idempotent) before its first config read, and a version mismatch with no resolvable chain throws. The ceremonies that reach identity-stamping writes (update, install, resolve-blocked) also establish substrate identity at entry: a config carrying no `substrate_id` gets one minted, persisted, and registered before the first stamping write — a pre-identity substrate heals on the sanctioned ceremony instead of refusing — reported in the ceremony result under `substrateIdEstablished` (live runs only; an established identity is never re-minted). On the write side, versioned-document envelopes converge: every block schema declares an optional top-level `schema_version`, and the write path stamps it (config.json's and migrations.json's included) to the owning schema's current `version` on every sanctioned write — an incoming envelope claiming an older version is first walked forward through the registered chain (or refused with the file left byte-unchanged when no chain reaches the current version), then persisted at the current version; reads of a stamped block validate the whole envelope migration-aware. A substrate whose installed schemas predate the `schema_version` property keeps writing unchanged until `/context update` lands it. A `block:<name>` reference resolves to `<contextDir>/schemas/<name>.schema.json`.
</schema_versioning>

<lens_views>
Lenses are named projections over a target block. A lens declares `id`, `target` (block name), `relation_type`, `derived_from_field` (optional — synthesizes edges from a per-item field instead of requiring authored edges), `bins` (named groupings), and `render_uncategorized`.

Edges live in `<substrate-dir>/relations.json` as a closure table — each row is `{ parent, child, relation_type, ordinal? }`. `relation_type` is a lens id, a hierarchy edge type, or a registered `relation_types[].canonical_id`; `ordinal` orders siblings within `(parent, relation_type)`. Endpoints (both `parent` and `child`) are dual-form: a legacy string (a canonical id, a lens bin name, or an `<alias>:<refname>` cross-substrate sentinel; disambiguation lives in `validateRelations`), OR a structured item endpoint `{ kind: "item", oid, refname?, substrate_id?, content_hash? }` where a present `substrate_id` marks a foreign endpoint and `content_hash` is carried for drift detection, OR a structured lens-bin endpoint `{ kind: "lens_bin", bin }` — a virtual parent that never resolves to an item.

Edge orientation is declared once, read everywhere. Storage is uniform (`edge.parent` = source endpoint, `edge.child` = target endpoint); which endpoint holds a relation's PRIMARY semantic role (prerequisite/predecessor/gate for `ordering`, container for `membership`, source for `data_flow`) is `config.relation_types[].role_direction` — `as_parent` (primary at `edge.parent`) or `as_child` (primary at `edge.child`), optional and set only for relations with a per-role consumer. The `primaryEndpoint(edge, role_direction)` / `counterEndpoint(edge, role_direction)` helpers read the endpoint under that declaration, and the blocked/ready deriver (`state_derivation.blocked_by` gate-vs-dependency split), the milestone rollup, the derived roadmap (precedes + membership), and `promote-item`'s lineage edge all route through it rather than hardcoding parent/child. Authoring: `append-relation` / `append-relations` take EITHER raw `--parent`/`--child` OR role-typed `--primary`/`--counter` (mapped to parent/child via `role_direction`; mutually exclusive) — a bare `--parent`/`--child` append of a relation that is BOTH role-bearing and orientation-ambiguous (its source/target kinds overlap, incl. `"*"`) is rejected in favor of `--primary`/`--counter`, while a role-less or disjoint-kind relation appends bare unchanged. Reading: `context-walk-descendants` / `walk-ancestors` on a disjoint-kind relation queried from the wrong endpoint THROWS naming the correct op instead of returning an ambiguous `[]`. `replace-relation` writes raw endpoints verbatim (bypassing the orientation gate) — the re-orient affordance; run `context-validate` after.

The single-form rule: ALL inter-item relationships are closure-table edges. Embedded nested id-bearing arrays and FK-as-field are forbidden — a nested id-bearing array in a schema is flagged `nested_id_bearing_array` by `validateContext` with the remediation "promote to a top-level entity + membership edge". Containment is a membership edge carrying `ordinal`; the nested id-bearing array → top-level entity block + ordinal-bearing membership edges promotion is performed by the canonicalizer (the context-dir-migration `canonicalizeSubstrate` machinery, run as a repo-side migration script under `scripts/migration/` — not a packaged pi-context tool). (Distinct from the `promote-item` tool, which is a cross-substrate derivation: it promotes a substrate item INTO another registered substrate as a new content-addressed item, recording an `item_derived_from_item` lineage edge in the destination.)

The lens-view algorithm: `edgesForLens(lens, items, authoredEdges)` returns synthetic edges (when `derived_from_field` is set) or filtered authored edges (otherwise). `groupByLens(items, lens, lensEdges)` produces a `Map<binName, ItemRecord[]>`. `walkDescendants(parentId, relationType, edges)` traverses the closure table from any parent.

`/context view <lensId>` loads the lens via `loadLensView(cwd, lensId)`, runs `groupByLens`, and renders the result as markdown headings + bullet lines (id + status + title) into the conversation via `renderLensView`. `lens.render_uncategorized: false` omits the uncategorized bucket.
</lens_views>

<context_lens_curate>
`/context lens-curate <lensId>` walks items in the lens's target block that have no edge in any declared bin and surfaces bin-assignment suggestions (would-be `relations.json` edge appends) as a follow-up turn. The LLM reads the suggestions and persists the chosen edges via `append-block-item` against `relations.json`. The command itself does not write — curation is a follow-up-turn pattern so the model decides which suggestions to enact.
</context_lens_curate>

<context_view>
`/context view <lensId>` renders a configured lens as markdown into the conversation. Bins become headings, items become bullet lines (id + status + title where present). `naming` aliases from config.json are honored for the target block name. Errors (missing config, unknown lens, unreadable target block, no array property in target) surface via `ctx.ui.notify` with severity `error`.
</context_view>

<substrate_validation>
`validateRelations(cwd)` (exposed as the `context-validate-relations` tool) checks the closure-table edges in `relations.json` against the config + per-block item snapshots, with the `resolveRef` hook classifying foreign endpoints. Diagnostics codes: `edge_unknown_relation_type`, `edge_parent_not_in_bins`, `edge_unresolved_parent`, `edge_unresolved_child`, `edge_parent_wrong_block`, `edge_child_wrong_block`, `edge_cycle_detected`. Returns `{ status: "clean" | "warnings" | "invalid", issues[] }` where each issue carries the offending edge or cycle path.

`validateContext(cwd)` (the `context-validate` tool) layers the registry/identity invariants over cross-block referential integrity: `substrate_id_unregistered` and `substrate_id_registry_mismatch` (the source-of-truth-drift guard on the active substrate), `edge_endpoint_dangling` and `edge_endpoint_unregistered` (a structured endpoint naming a registered-but-absent or unregistered substrate), and `nested_id_bearing_array` (a schema embedding an id-bearing array instead of using a membership edge). Config-declared `invariants[]` and registered lens-validators are checked in the same pass.

Three derived substrate tools complement validation: `context-edges-for-lens` returns the materialized `Edge[]` for a named lens (synthetic from `derived_from_field` or filtered authored edges); `context-lens-view` projects a config-declared lens as a binned item-view — a bin→count summary, or one bin's items paged by `offset`/`limit`; `context-walk-descendants` returns the transitive descendant id list from a parent under a given relation_type.
</substrate_validation>

<block_item_reads>
Item-level reads complement whole-block `read-block` (which is all-or-nothing and caps at the 50KB read limit): `read-block-item` returns one item from a named block by its id (block-scoped — null if absent; distinct from `resolve-item-by-id`, which searches every block by kind-prefixed id). `read-block-page` paginates a block too large to fetch whole — `{ items, total, hasMore }` where `total` is the full item count and pagination uses `offset`/`limit` (defaults 0/50).
`join-blocks` — one-call cross-block join, EDGE mode (relations.json relation_type, leftEndpoint parent|child) or FIELD mode (shared field value), optional left pre-filter; returns {left, right[]} pairs; replaces N+1 read+resolve.
</block_item_reads>

<context_status>
`/context status` derives project state dynamically from the filesystem:
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
</context_status>

<context_add_work>
`/context add-work` discovers appendable blocks (blocks with array schemas), reads their schemas, and sends a structured instruction to the LLM to extract items from the conversation into the typed blocks. This is a follow-up message that triggers the LLM to use the `append-block-item` tool.
</context_add_work>

<duplicate_detection>
`append-block-item` checks for duplicate items by `id` field before appending. If an item with the same `id` already exists in the target array, it returns a message instead of appending.
</duplicate_detection>

<context_validate>
Two surfaces address related concerns. Cross-block referential integrity is EDGE-based: there are no per-block inline-FK field checks (no `task.phase`, `task.depends_on`, `decision.phase`, `gap.resolved_by`, `requirement.traces_to`/`depends_on`, `verification.target`, `rationale.related_decisions` scans) — `relations.json` closure-table edges are the sole reference surface.

`/context validate` (the `context-validate` tool → `validateContext`) is the project-wide check. It runs:
- Source-of-truth drift: when the active `config.substrate_id` is set, the project-root `.pi-context-registry.json` must carry an entry whose dir resolves to the active substrate dir (`substrate_id_unregistered`, `substrate_id_registry_mismatch`).
- Edge integrity: each edge's `parent`/`child` is classified via the unified id index across substrates — an endpoint naming an unregistered substrate alias/id errors (`edge_endpoint_unregistered`), one that resolves to no item errors (`edge_endpoint_dangling`); a `relation_type` absent from `config.relation_types[]` errors; when a relation_type declares `source_kinds`/`target_kinds`, an endpoint whose resolved block kind is outside the (non-`*`) declared set errors.
- Cycle detection: delegated to `validateRelations`; only its `edge_cycle_detected` diagnostics are merged in.
- Config-declared invariants: `requires-edge` and `status-consistency` classes are enforced generically from `config.invariants[]` DATA — no block/status/relation_type vocabulary is hardcoded in source; each invariant's emitted code is its own `inv.id`.
- Status-vocabulary: an item `status` value with no key in the declared vocabulary is a warning (`status_unknown_value`).
- Nested id-bearing array: a schema array at nesting depth ≥ 1 whose item shape carries an `id` is a warning to promote it to a top-level entity + membership edge (`nested_id_bearing_array`).
- Lens validators: every validator registered via `registerLensValidator` is dispatched and its issues merged; a throwing validator surfaces as a warning (`lens_validator_failed:<name>`).

Returns issues with `severity` error/warning; status is `invalid` (any error), `warnings`, or `clean`.

The lower-level `context-validate-relations` tool (→ `validateRelations`, see `<substrate_validation>`) checks the closure-table edges in `relations.json` in isolation: unregistered relation_type (`edge_unknown_relation_type`), lens-bin parent not among a lens's bins (`edge_parent_not_in_bins`), unresolved/wrong-block parent or child (`edge_unresolved_parent`, `edge_unresolved_child`, `edge_parent_wrong_block`, `edge_child_wrong_block`), and cycles (`edge_cycle_detected`).
</context_validate>

<update_check>
On `session_start`, checks npm registry for newer versions of `@davidorex/pi-project-workflows` and notifies via UI if an update is available. Non-blocking — failures are silently ignored.
</update_check>

<success_criteria>
- `<substrate-dir>/`, `<substrate-dir>/schemas/`, the `.pi-context.json` bootstrap pointer, a skeleton `config.json`, and a seeded `migrations.json` exist after `/context init <substrate-dir>` (init imposes no catalog: no vocabulary, no schemas, no blocks until accept-all + install). Phases are not a directory — they live as an in-block array under `phase.json` (plural `phases` key); there is no `phases/` dir.
- `installed_schemas` / `installed_blocks` declared in `config.json` are reified by `/context install`; `--update` re-syncs installed schemas through the migration registry (forward-migrate block items on a version bump, or refuse and leave unchanged when items can't be safely migrated), but populated block data is never overwritten (preserved) — only empty or absent blocks receive the catalog starter
- Block writes validate against schemas — invalid data rejected with specific error
- `/context status` returns current derived state without errors
- `/context validate` returns no errors for well-formed cross-block references
- `context-validate-relations` returns no errors for a well-formed `relations.json`
- `/context view <lensId>` renders the configured projection; `/context lens-curate <lensId>` surfaces suggestions for uncategorized items
- `append-block-item` rejects duplicate IDs
- Schema customizations (field additions, enum changes) take effect on next write
- A relocated `config.root` reaches every read/write because all path construction routes through `resolveContextDir(cwd)`
</success_criteria>

*Generated from source by `scripts/generate-skills.js` — do not edit by hand.*
