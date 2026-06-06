# Update blast radius — pi-context install ceremony vs user customizations

Date: 2026-06-07
Scope: code-grounded enumeration of every install/update code path and every user-customizable substrate surface, with the exact clobber semantics each path applies. Read-only investigation; no source/config changes.

## Code paths traced

All install-ceremony writes are confined to three entry points plus their helpers. There is no fourth path that writes config/schemas/blocks during install.

| Entry point | Library fn | File:line |
|---|---|---|
| `/context install` / `context-install` op | `installContext(cwd, { overwrite:false })` | `packages/pi-context/src/index.ts:1470-1520` (command dispatch), `:596-787` (fn) |
| `/context install --update` | `installContext(cwd, { overwrite:true })` — flag parse `/(^|\s)--update(\s|$)/` | `packages/pi-context/src/index.ts:1474-1475`; per-schema helper `resyncSchema` `:464-583` |
| `/context accept-all` / `context-accept-all` op | `adoptConception(cwd)` | `packages/pi-context/src/context.ts:892-936`; op `ops-registry.ts:1303-1324` |
| `/context init` (precursor, completeness) | `initProject` → `writeSkeletonConfig` | `index.ts:256-314`; `context.ts:814-830` |
| `/context switch -c` (precursor, completeness) | `switchAndCreate` → `writeSkeletonConfig` | `index.ts:1123-1164` |

The only file writes any of these perform:
- `installContext`: `fs.copyFileSync` of schema files (`index.ts:658, 535(via resyncSchema), 479`); `fs.copyFileSync` of block files (`index.ts:722, 726`); `writeConfig(cwd, {...config, installed_from})` (`index.ts:784`); `writeBlockForDir` only on a successful schema version-bump migration (`index.ts:563`); `appendMigrationDeclForDir` into `migrations.json` on a version-bump chain (`index.ts:508`).
- `adoptConception`: a single `writeConfig(cwd, conception)` (`context.ts:927`) — whole-config replacement, guarded.
- `writeSkeletonConfig`: a single `writeConfigForDir` of the empty skeleton, never-clobber (`context.ts:817-827`).

## The single load-bearing config fact

`installContext` does NOT touch any config registry. Its only config write is:

```ts
writeConfig(cwd, { ...(config as ConfigBlock), installed_from });   // index.ts:784
```

The object spread copies `config` verbatim — every registry (`block_kinds`, `relation_types`, `lenses`, `hierarchy`, `invariants`, `layers`, `status_buckets`, `display_strings`, `naming`, `installed_schemas`, `installed_blocks`, `tool_operations`, `tool_operations_forbidden`, `substrate_id`, `root`, `schema_version`) — and overwrites ONLY the `installed_from` baseline key (`index.ts:738-784`). So `install` / `install --update` never rewrites, merges, or drops a single registry entry. User edits to registries, and user-added registry entries, are untouched by both install paths. `installed_from` is recomputed each run (idempotency-preserved when unchanged, `index.ts:770-782`).

`adoptConception` is the ONLY install-ceremony path that can write registries, and it is guarded by never-clobber: it writes the catalog conception (replacing ALL registries) ONLY when the on-disk config is absent or a SKELETON (`context.ts:901` `if (existing && !isSkeletonConfig(existing)) return adopted:false`). A SKELETON is a config with zero content in EVERY registry (`isSkeletonConfig`, `context.ts:769-789`, derived from `REGISTRY_DESCRIPTORS`). The moment any registry is non-empty, `adoptConception` is a pure no-op and overwrites nothing. The on-disk `substrate_id` is read + preserved across the overwrite (`context.ts:925-926`).

Net: NO install-ceremony path overwrites a user's edit to a populated config, and NONE drops a user-added registry entry. The config-registry clobber the prompt asked us to hunt for does not exist in this code.

## User-customizable surfaces (derived from code)

Surfaces enumerated from the `ConfigBlock` interface (`context.ts:39-83`), the `REGISTRY_DESCRIPTORS` map (`context.ts:961-975`, the canonical addressable-registry set), the schemas dir, and the block data files.

Config registries (all live in `config.json`): `block_kinds`, `relation_types`, `lenses`, `layers`, `invariants`, `status_buckets`, `display_strings`, `naming`, `installed_schemas`, `installed_blocks`, `hierarchy`, `tool_operations`, `tool_operations_forbidden`. Config scalars: `schema_version`, `root`, `substrate_id`. Baseline: `installed_from`.
Non-config: `schemas/<name>.schema.json` files; block data files `<name>.json`; `relations.json`; `migrations.json`.

## Blast-radius matrix (surface × path → behavior, with file:line)

| Surface | `install` (no overwrite) | `install --update` | `accept-all` |
|---|---|---|---|
| config.json — ANY registry, populated (user-edited catalog entry OR user-added entry) | UNTOUCHED — verbatim spread `index.ts:784` | UNTOUCHED — same spread `index.ts:784` | UNTOUCHED — never-clobber no-op `context.ts:901` |
| config.json — ANY registry, on a SKELETON config | UNTOUCHED (spread preserves empty registries) | UNTOUCHED | **OVERWRITTEN** with catalog conception `context.ts:927` (intended: skeleton has nothing to protect) |
| config.json `installed_from` | RECOMPUTED/rewritten (idempotent if unchanged) `index.ts:738-784` | RECOMPUTED/rewritten | NOT written by accept-all (conception ships none; `installed_from` set only by install) |
| config.json `substrate_id` | preserved (spread) | preserved (spread) | preserved from on-disk if present, else minted `context.ts:925-926` |
| config.json `root` | preserved (spread) | preserved (spread) | SET to resolved substrate dir `context.ts:913` |
| schemas/<name> — catalog-origin, user-edited, dest exists | SKIP-IF-EXISTS → `skipped` `index.ts:651-653` | **OVERWRITE** via `resyncSchema`: same-version = verbatim overwrite `index.ts:478-481`; version-bump = migrate-or-refuse `index.ts:486-582` (success overwrites schema; refuse leaves byte-unchanged) | n/a (accept-all copies no assets) |
| schemas/<name> — catalog-origin, not yet installed | INSTALL verbatim copy `index.ts:655-660` | INSTALL verbatim copy (dest absent → straight copy) `index.ts:655-660` | n/a |
| schemas/<name> — user-ADDED, no catalog block_kind | UNTOUCHED — only iterates `installed_schemas` entries that resolve via `byId` (`index.ts:635-678`); a name with no catalog kind → `notFound`, no write | UNTOUCHED — same | UNTOUCHED |
| block data <name>.json — POPULATED (any array length>0) | PRESERVE — never overwrites populated `index.ts:694-717` (`preserved`) | PRESERVE — same populated-guard fires before overwrite `index.ts:703-717` | n/a |
| block data <name>.json — catalog-origin, EMPTY, dest exists | SKIP-IF-EXISTS → `skipped` `index.ts:718-720` | **OVERWRITE** with catalog starter `index.ts:721-723` (`updated`) — empty starter over empty, no data loss | n/a |
| block data <name>.json — catalog-origin, not yet installed | INSTALL verbatim `index.ts:726-727` | INSTALL verbatim | n/a |
| block data <name>.json — user-ADDED, no catalog block_kind | UNTOUCHED — `byId` miss → `notFound`, no write `index.ts:683-685` | UNTOUCHED | UNTOUCHED |
| relations.json | UNTOUCHED by all install paths | UNTOUCHED | UNTOUCHED |
| migrations.json | UNTOUCHED | APPENDED catalog chain decls on a schema version-bump `index.ts:508`; restored byte-exact on refuse `index.ts:572-579`; untouched on same-version | UNTOUCHED |

Safety defaults worth noting: an unreadable block is treated as POPULATED and preserved (`index.ts:703-713, 524-528`); a corrupt installed schema is skipped from baselining without crashing (`index.ts:744-753`).

## Customizations that are SILENTLY destroyed — and by which path

1. **A user's edits to a catalog-shipped schema file (`schemas/<name>.schema.json`) — destroyed by `install --update`.** `resyncSchema` overwrites the installed schema with the catalog copy: same-version is a verbatim `fs.copyFileSync` (`index.ts:478-481`), version-bump is migrate-or-refuse with overwrite on success (`index.ts:535`). There is no merge of the user's local schema edits against the catalog change — update is replace. This is FGAP-046 (see below). Plain `install` does not destroy it (skip-if-exists), so the destruction requires `--update`.

That is the ONLY silent destruction in the install ceremony. Specifically NOT destroyed (verified against code):
- config registries (any), populated — untouched by all paths;
- user-added config registry entries — never dropped (no path rewrites registries except guarded accept-all);
- populated block data — preserved by the populated-guard under every path;
- user-added schemas / block files with no catalog counterpart — never iterated, never touched;
- relations.json — never touched.

One adjacent NON-silent case: a SKELETON config is overwritten by `accept-all` (`context.ts:927`). This is intended (a skeleton holds no vocabulary) and is not user customization loss — but it is the one place accept-all writes registries, so it bounds the claim "accept-all never clobbers."

## Relation to FGAP-046

FGAP-046 (`framework-gaps`, status `identified`, P2) is titled "install --update clobbers user schema customizations; no customization-preserving merge." Its body already states exactly the destruction in item 1 above: `install --update` overwrites each installed schema with the catalog copy (verbatim same-version resync, migrate-or-refuse on version gap) so a user's edits to a shipped block schema are lost; it explicitly notes block-item data is preserved (S1) and a user-added custom block kind is untouched. Its `canonical_vocabulary` is "three-way merge on update"; proposed resolution offers a deterministic three-way merge OR an agent-mediated reconcile against updated samples.

What FGAP-046 ALREADY covers:
- the schema-file overwrite under `--update` (verbatim + migrate-or-refuse) with no merge path;
- the observation that block data and user-added (non-catalog) kinds are safe.

What is NEW (NOT covered by FGAP-046), as a result of this trace:
- **Confirmation (negative finding) that config-registry clobbering does NOT exist.** No install-ceremony path overwrites a populated config registry or drops a user-added registry entry; `installContext` preserves config via verbatim spread, writing only `installed_from`. This closes the open question the investigation was scoped to. It is not a gap to file — it is the confirmed absence of one. Worth recording so a future agent does not re-investigate "does update clobber my block_kinds edits" (it does not).
- **The catalog-shipped EMPTY-block overwrite under `--update`** (`index.ts:721-723`): an empty catalog block whose dest is also empty is overwritten with the empty starter. No data loss (both empty), but it IS a write to a user-present file under `--update` and is not enumerated in FGAP-046. Low severity; arguably benign.
- **`migrations.json` append under `--update`** on a schema version-bump (`index.ts:508`): catalog migration decls are appended to the user's migrations.json. Idempotent (skip-if-present) and restored on refuse, but a side-write to a user-owned file FGAP-046 does not mention.
- **No drift signal feeds the update decision.** `checkStatus` (`index.ts:858-949`) can classify a schema `locally-modified` / `both-diverged`, but `install --update` does not consult it — it overwrites `locally-modified` schemas with no warning at the overwrite site. FGAP-046 frames the fix as a merge; it does not separately note that the existing drift detector is not wired into the update path as even a pre-overwrite guard/prompt.

## Implied gaps (enumeration only — NOT filed)

- `install --update` overwrites a `locally-modified` catalog schema with no merge and no pre-overwrite drift check, silently destroying user schema edits (the core of FGAP-046 — already filed; this is its existing scope).
- `install --update` does not consult `checkStatus` drift classification before overwriting a schema, so a `locally-modified` / `both-diverged` schema is clobbered without warning even though the detector could flag it.
- `install --update` overwrites a catalog-origin EMPTY block file that already exists on disk with the empty catalog starter (`index.ts:721-723`) — a write to a user-present file, currently benign but unguarded by drift signal.
- `install --update` appends catalog migration declarations into the user's `migrations.json` (`index.ts:508`) as a side-effect of a schema version-bump, with no user-facing surfacing of that side-write.
- No positive guarantee is surfaced to the user that config-registry customizations survive update (the negative finding is correct but undocumented in user-facing surfaces); absent that, users may run plain `install` defensively and forgo schema re-sync unnecessarily.
