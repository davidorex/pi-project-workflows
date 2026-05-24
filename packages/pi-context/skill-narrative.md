---
name: pi-context
description: >
  Schema-driven project state management with typed JSON blocks, schema validation,
  substrate config, lens views, closure-table relations, and cross-block referential
  integrity. Use when managing .project/ blocks, scaffolding project structure,
  installing block kinds from the packaged samples catalog, validating project state,
  rendering lens views, or adding work items.
---

<objective>
pi-context manages structured project state in `.project/` — a directory of JSON block files validated against schemas. The substrate (config + lenses + closure-table relations) is degree-zero state that defines where the rest lives and how items group into views.
</objective>

<block_files>
Blocks are JSON files under the substrate root (e.g., `gaps.json`, `decisions.json`). Each block has a corresponding schema in `<root>/schemas/`. When you write to a block via the tools, the data is validated against its schema before persisting. Writes are atomic (tmp file + rename) and serialised per block via `withBlockLock`. The substrate root is the dir chosen at init (recorded in the `.pi-context.json` bootstrap pointer) and written to `config.json`'s `root` field by `/context accept-all`; the framework ships no default (DEC-0015). block-api routes through `resolveContextDir(cwd)` — which resolves `config.root` when set and otherwise falls back to the pointer — so a relocated root reaches every read/write site.
</block_files>

<schema_validation>
Every block write validates against `<root>/schemas/<blockname>.schema.json`. If the schema file doesn't exist, writes proceed without validation. Validation errors include the specific JSON Schema violations.
</schema_validation>

<context_init>
`/context init <dir>` creates the substrate skeleton: the `.pi-context.json` bootstrap pointer (declaring the substrate-dir name per DEC-0015) plus the substrate root and its `schemas/` directory. Nothing is imposed — no `config.json`, no schemas, and no starter blocks are written (DEC-0011 ship-no-defaults). Idempotent: re-running preserves existing dirs. Populate the substrate next with `/context accept-all` (adopt the canonical conception) followed by `/context install`.
</context_init>

<context_accept_all>
`/context accept-all` adopts the package's canonical packaged conception (`samples/conception.json`) as the substrate's `config.json` — the full vocabulary (`block_kinds`, `relation_types`, `lenses`, `invariants`) plus the `installed_schemas` / `installed_blocks` manifest — with `root` set to the actual substrate dir. It writes `config.json` only (run `/context install` after to materialize the schemas + starter blocks) and is idempotent: it never overwrites an existing `config.json` (offer, don't impose). This is the accept-all path; per-entry step-through curation is a separate surface.
</context_accept_all>

<context_install>
`/context install` reconciles the substrate against the `installed_schemas` and `installed_blocks` lists declared in `config.json`. For each declared name it copies the matching asset from the package-shipped samples catalog (`samples/schemas/` for schemas, `samples/blocks/` for starter blocks) into the substrate. Default behavior is skip-if-exists (preserves user edits); pass `--update` to overwrite and report the asset as `updated`. Sources missing from the catalog are reported as `notFound`. Empty install lists are not an error — the result is a clean no-op message instructing the user to edit `config.json`.

The installable catalog IS the packaged conception (`samples/conception.json`): its `block_kinds` enumerate the available kinds, each carrying its schema (`samples/schemas/`) and starter block (`samples/blocks/`). The generated installable-catalog table below lists the authoritative names — declare any subset in `installed_*` and run `/context install`, or take the whole conception via `/context accept-all`.
</context_install>

<substrate_config>
`.project/config.json` is the substrate bootstrap. Its `root` field declares where every other block, schema, agent, and template lives — closing the GitHub #3 surface where downstream consumers had to assume `.project/`. `naming` aliases canonical block ids to display names (used by `/context view` rendering). `hierarchy` declares legal closure-table edges (parent block → child block via relation_type). `lenses` declares named projections over a target block. `installed_schemas` / `installed_blocks` are the install manifest consumed by `/context install`.

`config.json` and `relations.json` are exempt from `root` redirection — they always live at `.project/` because they are the substrate that defines `root`. All other state lives under `<config.root>/...` per `resolveContextDir(cwd)`. The package ships their schemas in `schemas/` (config.schema.json, relations.schema.json) and resolves them via three-tier search: project override > user override > package-shipped.

The `loadContext(cwd)` SDK returns an mtime-keyed cached snapshot of `{ config, relations, configMtime, relationsMtime }` for one cwd. Consumers must not mutate.
</substrate_config>

<lens_views>
Lenses are named projections over a target block. A lens declares `id`, `target` (block name), `relation_type`, `derived_from_field` (optional — synthesizes edges from a per-item field instead of requiring authored edges), `bins` (named groupings), and `render_uncategorized`.

Edges live in `.project/relations.json` as a closure table — each row is `{ parent, child, relation_type }`. `parent` is either a canonical id (hierarchy edges) or a lens.bins value (lens edges); disambiguation lives in `validateRelations`.

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
`validateRelations(cwd)` (exposed as the `context-validate-relations` tool) checks the closure-table edges in `relations.json` against the config + per-block item snapshots. Diagnostics codes: `edge_unknown_relation_type`, `edge_parent_not_in_bins`, `edge_unresolved_parent`, `edge_unresolved_child`, `edge_parent_wrong_block`, `edge_child_wrong_block`, `edge_cycle_detected`. Returns `{ status: "clean" | "warnings" | "invalid", issues[] }` where each issue carries the offending edge or cycle path.

Two derived substrate tools complement validation: `context-edges-for-lens` returns the materialized `Edge[]` for a named lens (synthetic from `derived_from_field` or filtered authored edges); `context-walk-descendants` returns the transitive descendant id list from a parent under a given relation_type.
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
Two separate validators address two concerns:

`/context validate` (the `context-validate` tool) checks cross-block referential integrity:
- task.phase references a valid phase
- task.depends_on references valid task IDs
- decision.phase references a valid phase
- gap.resolved_by references a valid ID
- requirement.traces_to references valid phase/task IDs
- requirement.depends_on references valid requirement IDs
- verification.target references a valid target ID
- rationale.related_decisions references valid decision IDs

Returns errors (broken dependency references) and warnings (unresolved cross-references).

The `context-validate-relations` tool (see `<substrate_validation>`) validates closure-table edges in `relations.json` — a separate concern from cross-block ID resolution.
</context_validate>

<update_check>
On `session_start`, checks npm registry for newer versions of `@davidorex/pi-project-workflows` and notifies via UI if an update is available. Non-blocking — failures are silently ignored.
</update_check>

<success_criteria>
- `.project/`, `.project/schemas/`, `.project/phases/`, and `.project/config.json` exist after `/context init`
- `installed_schemas` / `installed_blocks` declared in `config.json` are reified by `/context install`; `--update` overwrites
- Block writes validate against schemas — invalid data rejected with specific error
- `/context status` returns current derived state without errors
- `/context validate` returns no errors for well-formed cross-block references
- `context-validate-relations` returns no errors for a well-formed `relations.json`
- `/context view <lensId>` renders the configured projection; `/context lens-curate <lensId>` surfaces suggestions for uncategorized items
- `append-block-item` rejects duplicate IDs
- Schema customizations (field additions, enum changes) take effect on next write
- A relocated `config.root` reaches every read/write because all path construction routes through `resolveContextDir(cwd)`
</success_criteria>
