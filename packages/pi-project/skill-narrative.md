---
name: pi-project
description: >
  Schema-driven project state management with typed JSON blocks, schema validation,
  substrate config, lens views, closure-table relations, and cross-block referential
  integrity. Use when managing .project/ blocks, scaffolding project structure,
  installing block kinds from the registry, validating project state, rendering
  lens views, or adding work items.
---

<objective>
pi-project manages structured project state in `.project/` — a directory of JSON block files validated against schemas. The substrate (config + lenses + closure-table relations) is degree-zero state that defines where the rest lives and how items group into views.
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

The registry currently ships nine starter blocks (conformance-reference, decisions, domain, issues, project, rationale, requirements, tasks, verification) and thirteen schemas (the same set plus architecture, audit, handoff, phase). Inspect `registry/blocks/` and `registry/schemas/` for the authoritative names — declare any subset in `installed_*` and run `/project install`.
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
