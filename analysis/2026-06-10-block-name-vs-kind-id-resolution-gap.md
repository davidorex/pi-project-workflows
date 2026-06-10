# Block-name vs kind-id resolution gap — `read-block-item --block <singular>` errors without leveraging the config-declared prefix→block mapping

Experience-gap investigation. Surfaced while wiring edges via the CLI: `read-block-item --block task --id TASK-046` exits 1 with a bare "Block file not found" naming a file that cannot exist, even though config already maps the id's prefix (`TASK-`) to the correct block name (`tasks`).

Read-only investigation: bare CLI against `.context`; source read via Read/grep. No source edits, no substrate writes.

## Repro (verbatim)

```
$ pi-context read-block-item --block task --id TASK-046 --json
{"ok":false,"op":"read-block-item","error":"Block file not found: /Users/david/Projects/workflowsPiExtension/.context/task.json"}
```

Exit code 1. Identical shape for `--block decision --id DEC-NNNN` → `decision.json` not found. The correct block names are `tasks` / `decisions` (the plural `canonical_id`); the item-id prefixes are singular (`TASK-` / `DEC-`). Driving the CLI, the singular guess off the id-prefix is natural and fails with no corrective hint.

## Root cause

The `--block` value flows verbatim to the filesystem path with no normalization and no prefix-aware error enrichment.

1. **Op handler** — `read-block-item` passes `params.block` straight through:
   - `packages/pi-context/src/ops-registry.ts:1645-1646` — `run(cwd, params) { const result = readBlockItem(cwd, params.block, params.id); … }`. No config consultation, no fallback.
   - `packages/pi-context/src/ops-registry.ts:1641` — the parameter is declared `block: Type.String({ description: "Block name (e.g., 'tasks', 'decisions', 'framework-gaps')" })`; the description carries the plural convention but nothing enforces or repairs a singular input.

2. **SDK** — `readBlockItem` reads the named block directly:
   - `packages/pi-context/src/context-sdk.ts:916-924` — `const data = readBlock(cwd, blockName) …`. Docstring (`:910`) states it is "Block-scoped (no cross-substrate idIndex, no prefix-vs-block invariant — that is resolveItemById)", i.e. it deliberately does not consult the prefix registry.

3. **Error site** — the file-open failure is raised generically, before any block-name knowledge is applied:
   - `packages/pi-context/src/block-api.ts:759-765` — `readBlockForDir` builds `filePath = blockFilePathForDir(substrateDir, blockName)` then `try { fs.readFileSync(filePath) } catch { throw new Error("Block file not found: " + filePath) }`.
   - `packages/pi-context/src/block-api.ts:57-60` — `blockFilePathForDir` is pure path join: `path.join(substrateDir, blockName + ".json")`. The string `task` becomes `task.json` with no validation that `task` is a registered `canonical_id`.

The error names the missing file but has, at that frame, no access to (and makes no use of) the registry that would say "no block `task`; the id prefix you'd use is `TASK-`, which maps to block `tasks`."

### The mapping the error path ignores already exists, fully built

- **Config carries both halves of the mapping for every kind.** `packages/pi-context/samples/conception.json` — each `block_kinds[]` entry declares `canonical_id` (the block/file name) AND `prefix` (the id prefix): `tasks`/`TASK-` (`:21,:23`), `decisions`/`DEC-` (`:5,:7`), `framework-gaps`/`FGAP-` (`:13,:15`), `issues`/`issue-` (`:37,:39`), `verification`/`VER-` (`:29,:31`), etc. The active `.context` config is installed from this catalog.
- **A ready-made resolver exists.** `packages/pi-context/src/context-sdk.ts:1110-1128` — `expectedBlockForId(id, cfg)` scans `cfg.block_kinds[]` for the longest-matching `prefix` and returns its `canonical_id`. `expectedBlockForId("TASK-046", cfg)` returns `"tasks"` directly. It is config-driven (`:1103`), longest-prefix-wins (`:1107-1108`, so `R-`/`REVIEW-` disambiguate), and already exported + used by `buildIdIndex`'s prefix-vs-block invariant (`:1215`). Nothing in the `read-block-item` / `readBlockItem` / `readBlockForDir` error path calls it.

So the friction is not missing capability — the prefix→block function is present, exported, and exercised elsewhere. The `--block`-taking read path simply does not reach for it, neither to repair the input nor to enrich the error.

## Class (gap-explore-surfaces-class)

This is an **instance of a general class**, not atomic. The class:

> **Ops that take a block *name* do not leverage the config-declared `prefix → canonical_id` mapping (`expectedBlockForId`) — neither as input normalization (accept a kind-prefixed id or a singular guess and resolve it) nor as error enrichment (when the named block is absent, name the prefix→block mapping that would have worked).**

Evidence the class is broad and the bridge is recognized-but-partial:

- **Two sibling resolution idioms coexist, and the substrate already documents the split.** `resolve-item-by-id` exists *precisely to bridge* kind-prefixed id → owning block. Its description (`packages/pi-context/src/ops-registry.ts:1610-1611`): *"Look up the block, array key, and item payload for a given ID across all blocks in the substrate dir … Mirrors the resolveItemById SDK function and shares its prefix-vs-block invariant."* And `read-block-item`'s own description contrasts itself against it (`:1637`): *"Block-scoped (unlike resolve-item-by-id, which searches all blocks by kind-prefixed id)."* The system therefore has a kind-id→block resolver (`resolve-item-by-id` / `resolveItemById`, `context-sdk.ts:1250-1251`) and a name-scoped reader (`read-block-item`) — but the name-scoped reader's *failure* path does not fall back to, or even cite, the resolver's mapping.

- **The block-name parameter is pervasive.** Every block-scoped op takes `--block` as a raw name with the same plural convention and the same no-normalization handling: `read-block` (`ops-registry.ts:878`), `read-block-page` (`:1654`), `filter-block-items` (`:1571`), `read-block-item` (`:1634`), and the block-mutation ops (`append-/update-/upsert-/remove-block-item`). Any of these, given the singular kind name or fed a `--block` derived from an id-prefix, produces the same uninformative "Block file not found".

### The general fix surface (characterization, not prescription)

Two distinct, compatible affordances the class admits — both keyed on the already-built `expectedBlockForId`:

1. **Error enrichment (minimum).** When `readBlockForDir` (or the op layer) hits "Block file not found" for a name not in `config.block_kinds[].canonical_id`, append a corrective hint derived from the registry: if the supplied name singular-matches a known `canonical_id` (or the supplied `--id`'s prefix maps via `expectedBlockForId`), state the right block name. E.g. *"No block `task`; did you mean `tasks`? (id prefix `TASK-` → block `tasks`)."* This requires the error frame to see the config — today `block-api.ts` `readBlockForDir` does not load it, so enrichment likely belongs at the op layer (which has `cwd` and can `loadConfig`), mirroring how FGAP-019's arrayKey-derivation fix was placed in the op `run()` bodies / CLI pre-call rather than deep in `block-api`.

2. **Input normalization (stronger UX).** Accept a kind-prefixed id or singular kind-name as `--block` and resolve it to the canonical block before the read — i.e. let `read-block-item --block TASK-046 --id TASK-046` (or `--block task`) resolve `tasks` via `expectedBlockForId` / a singular→plural `canonical_id` match. This parallels FGAP-032's `--id` aliasing (CLI input-normalization layer) and FGAP-019's config-derived arrayKey: the same pattern of "the CLI/op derives a config-declared value the caller half-stated" applied to the block name.

The class warrants filing at the class level (the prefix-mapping is unused across the `--block`-taking ops in errors and as input), with `read-block-item --block task` as the triggering instance. Filing only the single-op symptom would leave the sibling `--block` readers to surface the same papercut and invite duplicate per-op filings.

## Prior-art (searched framework-gaps via bare CLI `filter-block-items` against `.context`)

No existing framework-gap covers this prefix→block error-hint / `--block` normalization. Adjacent items (all **closed**), reported so the new filing relates rather than duplicates:

| id | status | relation to this gap |
|----|--------|----------------------|
| **FGAP-032** | closed | Same INPUT-NORMALIZATION class, sibling axis. The `--id`-flag-naming divergence; closed by a CLI normalization layer aliasing `--id` to each op's native id-param (VER-029/TASK-015). Establishes the precedent of a CLI-side normalization layer. Does NOT touch `--block` block-name resolution. |
| **FGAP-019** | closed | Same CONFIG-DERIVATION class, sibling axis. Block-mutation ops required `arrayKey` though derivable from `config.block_kinds[].array_key`; fixed by deriving array_key from config at the CLI pre-call (VER-029/TASK-015). Direct precedent for "derive a config-declared block value the caller half-stated"; the block-name resolution is the analogous derivation that remains undone. |
| **FGAP-062** | closed | CLI help scannability; unrelated mechanism, shares the "CLI is the dogfooding entry point" framing. |
| **FGAP-022** | closed | `--show-schema` contract preview before writes; adjacent CLI-ergonomics, not block-name resolution. |
| **FGAP-029** | closed | `install --update` data-loss; unrelated. |
| **FGAP-045** | closed?/identified | Block-KIND rename tooling; surfaced only on a keyword collision, unrelated. |

Net: the **error-hint / block-name-normalization** behavior for `--block`-taking ops is **not tracked**. A new filing is justified; relate it to FGAP-032 and FGAP-019 as the established input-normalization / config-derivation precedents it extends to the block-name axis.

## CLI-provable verification conditions (for a fixing task)

All checkable through the bare CLI against a real substrate (read-only ops):

1. `read-block-item --block task --id TASK-046 --json` resolves to the `tasks` item (no "Block file not found") OR, if input-normalization is out of scope, exits with an `error` string that names the corrective block (`tasks`) and the prefix mapping (`TASK- → tasks`) — assert the substring is present.
2. Same for `--block decision --id DEC-NNNN` → `decisions`, `--block gap`/`framework-gap` → `framework-gaps`, `--block issue` → `issues` — exhaustive over the singular/plural and prefix-derived guesses, not the single seed (class closure).
3. A genuinely unknown block (e.g. `--block nonsense --id X-1`) still errors, and the hint degrades cleanly (no false suggestion) — the empty-prefix blocks (`conventions`, `prefix: ""`, conception.json `:95`) must not be offered as a catch-all (the `expectedBlockForId` `:1120` `if (!bk.prefix) continue` guard must hold).
4. The correct existing path is unbroken: `read-block-item --block tasks --id TASK-046 --json` still returns the item; `resolve-item-by-id --id TASK-046 --json` still resolves `tasks`.
5. If normalization is chosen: confirm parity across the sibling `--block` readers (`read-block`, `read-block-page`, `filter-block-items`) — the same singular/prefix input resolves consistently, or a parity-check asserts it (mirroring FGAP-019's parity-gate extension).

---

**Verdict (3 sentences).** Root cause: `read-block-item` passes `--block` verbatim through `readBlockItem` → `readBlockForDir`, which raises a generic "Block file not found" (`block-api.ts:764`) without consulting the config-declared `prefix → canonical_id` mapping — even though `expectedBlockForId` (`context-sdk.ts:1110`) already computes `TASK-046 → tasks` from config that carries both `canonical_id` and `prefix` for every kind. Class: this is an instance of the general class "`--block`-taking ops do not leverage the prefix→block mapping, neither as input normalization (accept a kind-prefixed id / singular name) nor as error enrichment (name the block that would have worked)" — `resolve-item-by-id` exists precisely to bridge kind-id→block, but the name-scoped readers' failure path never reaches for it; file at the class level with `--block task` as the triggering instance. Prior-art: no framework-gap tracks this; the nearest are the closed FGAP-032 (`--id` flag normalization) and FGAP-019 (config-derived arrayKey), the input-normalization / config-derivation precedents the new filing should relate to and extend to the block-name axis.
