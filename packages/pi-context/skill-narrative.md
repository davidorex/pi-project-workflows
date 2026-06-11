---
name: pi-context
description: >
  Schema-driven project state management with typed JSON blocks, schema validation,
  substrate config, lens views, closure-table relations, and cross-block referential
  integrity. Use when managing substrate blocks, scaffolding project structure,
  installing block kinds from the packaged samples catalog, validating project state,
  rendering lens views, or adding work items.
---

<objective>
pi-context manages structured project state in the substrate directory — a directory of JSON block files validated against schemas. The substrate (config + lenses + closure-table relations) is degree-zero state that defines where the rest lives and how items group into views.
</objective>

<block_files>
Blocks are JSON files under the substrate root (one per block kind, each an array of items). Each block has a corresponding schema in `<root>/schemas/`. When you write to a block via the tools, the data is validated against its schema before persisting. Writes are atomic (tmp file + rename) and serialised per block via `withBlockLock`. The substrate root is the dir chosen at init (recorded in the `.pi-context.json` bootstrap pointer) and written to `config.json`'s `root` field by `/context accept-all`; the framework ships no default substrate-dir name. block-api routes through `resolveContextDir(cwd)` — which resolves `config.root` when set and otherwise falls back to the pointer — so a relocated root reaches every read/write site.

Each item in an identity-bearing block carries a three-layer identity, not a refname alone: `id` (the mutable human label, e.g. a kind-prefixed refname), `oid` (a content-independent 32-hex identity minted once at the item's birth and immutable thereafter, salted by the substrate's `substrate_id`), `content_hash` (a SHA-256 over the item's content projection — the item minus its metadata fields — so identical content deduplicates), and `content_parent` (the prior version's `content_hash`, forming a per-item version chain that advances only when content actually changed). A write carrying a different incoming `oid` is rejected. Identity stamping is a no-op unless the block's array subschema declares all three identity fields, scoping content-addressing to canonical schemas and leaving bespoke/test schemas untouched.
</block_files>

<content_addressing>
On a stamping write the item's content projection (a shallow copy with the metadata fields removed) is persisted to `<substrate-dir>/objects/<content_hash>.json` — a content-addressed object store (idempotent, atomic tmp+rename; identical content yields a byte-identical file). The store is git-tracked: it is the integrity/version store, and gitignoring it would lose pinning. Object persistence is deferred until after the whole block clears schema validation, so a validation failure never orphans an object. The metadata fields excluded from the content hash are the mandatory floor `{id, oid, content_hash, content_parent}` (never hashable, never pullable into the hash by an override) plus a discretionary set (the author fields and `closed_by`/`closed_at`); a schema's item subschema may redefine the discretionary set via `x-identity.metadata_fields`, but the floor is always unioned in.
</content_addressing>

<schema_validation>
Every block write validates against `<root>/schemas/<blockname>.schema.json`. If the schema file doesn't exist, writes proceed without validation. Validation errors include the specific JSON Schema violations.
</schema_validation>

<context_init>
`/context init <substrate-dir>` creates the substrate skeleton: the `.pi-context.json` bootstrap pointer (declaring the chosen substrate-dir name) plus the substrate root and its `schemas/` directory. Nothing is imposed — no `config.json`, no schemas, and no starter blocks are written (ship-no-defaults). Idempotent: re-running preserves existing dirs. Populate the substrate next with `/context accept-all` (adopt the canonical conception) followed by `/context install`.
</context_init>

<context_accept_all>
`/context accept-all` adopts the package's canonical packaged conception (`samples/conception.json`) as the substrate's `config.json` — the full vocabulary (`block_kinds`, `relation_types`, `lenses`, `invariants`) plus the `installed_schemas` / `installed_blocks` manifest — with `root` set to the actual substrate dir. It writes `config.json` only (run `/context install` after to materialize the schemas + starter blocks) and is idempotent: it never overwrites an existing `config.json` (offer, don't impose). This is the accept-all path; per-entry step-through curation is a separate surface.
</context_accept_all>

<context_install>
`/context install` reconciles the substrate against the `installed_schemas` and `installed_blocks` lists declared in `config.json`. For each declared name it copies the matching asset from the package-shipped samples catalog (`samples/schemas/` for schemas, `samples/blocks/` for starter blocks) into the substrate. Default behavior is skip-if-exists (preserves user edits). Pass `--update` to re-sync installed SCHEMAS through the migration registry: a same-version body change (or a non-versioned schema) is a verbatim re-sync (reported `resynced`); a schema `version` bump forward-migrates the populated block's items through the shipped catalog migration chain and re-validates them against the new schema (reported `migrated`); a bump with no safe migration — no shipped chain reaching the catalog version, or items that would fail the new schema — is refused, leaving BOTH the installed schema file AND the block file byte-unchanged (reported `blocked`). Preview drift first with `/context check-status`. Populated block data is never overwritten — a block holding items is preserved (reported as `preserved`) regardless of `--update`, while empty or absent blocks receive the catalog starter. Sources missing from the catalog are reported as `notFound`. Empty install lists are not an error — the result is a clean no-op message instructing the user to edit `config.json`. Install also records an install baseline in `config.installed_from`: the catalog source (`catalog` = pi-context `name@version`, `catalog_version` = conception `schema_version`), a baseline timestamp, and a per-schema fingerprint (`assets[canonical_id]` = content hash + the schema's own version) of the installed SCHEMAS — the basis for installed-vs-catalog drift detection. The baseline covers schemas only (blocks are user data). A re-install on an unchanged substrate is idempotent: the existing baseline is preserved verbatim (timestamp included) so `config.json` stays byte-identical. `/context check-status` is a separate read-only command that previews drift between the installed schemas and the catalog: it compares each installed schema against its recorded baseline, the catalog's current schema, and the currently-installed file, and reports `in-sync` / `catalog-ahead` (the package shipped a newer schema) / `locally-modified` (the installed file was edited) / `both-diverged` / `no-baseline` / `missing-catalog` / `missing-installed`. For each schema behind the catalog (`catalog-ahead` / `both-diverged`) it additionally surfaces which schema is behind and by what version gap — `behind` plus a `version_delta` carrying the baseline → catalog version pair (a declared version bump) or a content-only basis when the catalog body moved with the version string unchanged. It writes nothing. The reflected CLI op is `pi-context context-check-status --json`.

The installable catalog IS the packaged conception (`samples/conception.json`): its `block_kinds` enumerate the available kinds, each carrying its schema (`samples/schemas/`) and starter block (`samples/blocks/`). The generated installable-catalog table below lists the authoritative names — declare any subset in `installed_*` and run `/context install`, or take the whole conception via `/context accept-all`.
</context_install>

<substrate_config>
`<substrate-dir>/config.json` is the substrate bootstrap. Its `root` field declares where every other block, schema, agent, and template lives — consumers resolve that dir via the `.pi-context.json` pointer plus `config.root`, never by assuming a fixed directory name. Its `substrate_id` field is the per-substrate root identity (pattern `sub-` followed by 16 hex), minted once and immutable on disk; it salts oid minting and identifies the substrate in the project-root registry. `naming` aliases canonical block ids to display names (used by `/context view` rendering). `hierarchy` declares legal closure-table edges (parent block → child block via relation_type). `lenses` declares named projections over a target block. `installed_schemas` / `installed_blocks` are the install manifest consumed by `/context install`. `installed_from` is the optional install baseline `/context install` records — the catalog source plus a per-schema content fingerprint of the installed schemas — for installed-vs-catalog drift detection.

`config.json` and `relations.json` are exempt from `config.root` redirection — they always live at the substrate-dir root (the dir chosen at bootstrap, resolved via the `.pi-context.json` pointer, suggested `.context`) because they are the substrate that defines `root`. The substrate-dir root is whatever was chosen at bootstrap, not necessarily `.project`. All other state lives under `<config.root>/...` per `resolveContextDir(cwd)`. The package ships their schemas in `schemas/` (config.schema.json, relations.schema.json) and resolves them via three-tier search: project override > user override > package-shipped.

The `loadContext(cwd)` SDK returns an mtime-keyed cached snapshot of `{ config, relations, configMtime, relationsMtime }` for one cwd. Consumers must not mutate.
</substrate_config>

<cross_substrate>
A project can carry multiple substrates. The `.pi-context.json` bootstrap pointer names the single ACTIVE substrate dir; a separate project-root, git-tracked `.pi-context-registry.json` enumerates ALL substrates — a version plus `substrates: { <substrate_id>: { dir, aliases[] } }`. `resolveSubstrateDir(cwd, substrate_id)` and `resolveAlias(cwd, alias)` look up the registry and return null on a clean miss.

`resolveRef(cwd, ref)` classifies any endpoint into one of four statuses: `active` — resolved in the active substrate's index (a bare oid/refname, or any lens_bin endpoint, which is always active without an item lookup); `foreign` — a structured endpoint carrying a `substrate_id`, or an `<alias>:<refname>` string whose alias is registered, resolved in the foreign substrate's index; `dangling` — a locator naming a registered substrate where the oid/refname is absent; `unregistered` — a `substrate_id` or alias the registry does not carry. A string with a NON-leading `:` (the parse gates on `colon > 0`) is first attempted as an `<alias>:<refname>` parse; a leading-colon string is not alias-parsed.

Source-of-truth-drift invariant: `validateContext` requires the active `config.substrate_id` to have a registry entry whose `dir` resolves to the active substrate. A mismatch yields `substrate_id_registry_mismatch`; a missing entry yields `substrate_id_unregistered`.
</cross_substrate>

<schema_versioning>
Schemas are draft-07 JSON-Schema, one per block kind, under `<substrate-dir>/schemas/`. Package-shipped substrate-singleton schemas carry a `pi-context://schemas/<name>` `$id` plus a `version`. `<substrate-dir>/migrations.json` is the per-substrate schema-version migration registry. A schema `version` bump REQUIRES a companion migration declared via the `write-schema-migration` tool; without one, reading or writing an item that declares an older `schema_version` throws a version mismatch. Migration kinds are `identity` (shape-compatible, no transform) or `declarative-transform` (a TransformSpec of rename/set/delete/coerce on dotted paths). The loaded registry resolves the migration edge at the next read/write, so items walk forward without a process restart. A `block:<name>` reference resolves to `<contextDir>/schemas/<name>.schema.json`.
</schema_versioning>

<lens_views>
Lenses are named projections over a target block. A lens declares `id`, `target` (block name), `relation_type`, `derived_from_field` (optional — synthesizes edges from a per-item field instead of requiring authored edges), `bins` (named groupings), and `render_uncategorized`.

Edges live in `<substrate-dir>/relations.json` as a closure table — each row is `{ parent, child, relation_type, ordinal? }`. `relation_type` is a lens id, a hierarchy edge type, or a registered `relation_types[].canonical_id`; `ordinal` orders siblings within `(parent, relation_type)`. Endpoints (both `parent` and `child`) are dual-form: a legacy string (a canonical id, a lens bin name, or an `<alias>:<refname>` cross-substrate sentinel; disambiguation lives in `validateRelations`), OR a structured item endpoint `{ kind: "item", oid, refname?, substrate_id?, content_hash? }` where a present `substrate_id` marks a foreign endpoint and `content_hash` is carried for drift detection, OR a structured lens-bin endpoint `{ kind: "lens_bin", bin }` — a virtual parent that never resolves to an item.

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
- `<substrate-dir>/`, `<substrate-dir>/schemas/`, and the `.pi-context.json` bootstrap pointer exist after `/context init <substrate-dir>` (init is skeleton-only: no `config.json`, no schemas, no blocks until accept-all + install). Phases are not a directory — they live as an in-block array under `phase.json` (plural `phases` key); there is no `phases/` dir.
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
