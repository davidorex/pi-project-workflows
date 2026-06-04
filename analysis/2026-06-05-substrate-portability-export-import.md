# Substrate portability — export/import bundles vs an external/global substrate dir

Status: exploratory (for further thinking — not a decision, not yet filed as FEAT/DEC). Grounded in three parallel read-only Explore agents over `packages/pi-context/src/`, `packages/pi-context-cli/src/`, `packages/pi-workflows/src/`, and `scripts/` at branch `context-jit-spec-v2` (post-v0.30.0, HEAD `be16688`), 2026-06-05.

Prompt (user, verbatim intent): a `pi-context-cli export [substrate] / import` command for **substrate-model portability** — e.g. a content/PM model you encode once and import into other projects, the CLI command causing it to "just work." Possibly *also* (or instead) a switchable-to substrate that lives at a `path/to/.substrate-dir` — a global location. "Not sure if that or export/import but likely possibly both." Drawn parallel: "pi-workflows can import workflows; pi-context can install/import substrate models."

---

## 0. The load-bearing distinction (read this first)

The two ideas in the prompt are **not interchangeable** — they solve different problems and hit different machinery:

- **Fork 1 — export/import (file bundle):** *transport a copy.* Serialize a substrate (or just its model) to a portable bundle, carry it elsewhere, materialize an **independent** instance in the target project. Each project ends up with its own copy.
- **Fork 2 — external/global `path/to/.substrate-dir`:** *share one live substrate.* Point multiple projects' active-substrate pointer at a single directory outside any one project, so they read/write the **same** live substrate.

The user's marquee example ("a content block that encodes project management you want to import into other projects") is **Fork 1**, and specifically a **model** export (vocabulary), not instance content. The "global location" idea is **Fork 2**.

### Model vs instance — the second load-bearing split

A substrate decomposes into two layers (`packages/pi-context/src/context.ts:39` `ConfigBlock` interface; `:942` `REGISTRY_DESCRIPTORS`):

| Layer | Files / fields | Portable? |
|---|---|---|
| **Model** (vocabulary/structure) | `config.json` registries: `block_kinds`, `relation_types`, `hierarchy`, `lenses`, `invariants`, `layers`, `status_buckets`, `display_strings`, `naming`, `installed_schemas[]`, `installed_blocks[]`, `tool_operations`, `tool_operations_forbidden`; plus `schemas/*.schema.json` | **Yes** |
| **Instance** (filed content) | each block `<name>.json` items; `relations.json` edges; `config.substrate_id`; `config.root` | **No** (substrate-scoped) |
| **System** | `config.schema_version`; `.pi-context.json` bootstrap pointer | n/a |

The user's PM-import case = **model only** (empty or starter blocks). Importing instance *content* is a strictly harder problem (identity reconciliation — see §4).

---

## Fork 1 — export / import (file bundle, transportable)

### 1.1 Import is already half-built (hardcoded source)

The install pipeline **already is** "import from a bundle" — it just reads a hardcoded packaged source:

- `/context init <dir>` → `initProject(cwd, contextDir)` (`packages/pi-context/src/index.ts:250`): writes `.pi-context.json` pointer (`writeBootstrapPointer`, `context-dir.ts:213`), makes substrate + `schemas/` dirs, writes a skeleton `config.json` (`writeSkeletonConfig`, `context.ts:795`) minting a `substrate_id`, registers the substrate in the project-root registry (`registerSubstrate`, `context.ts:909`).
- `/context accept-all` → `adoptConception(cwd): AdoptResult` (`context.ts:873`): never-clobber guard `if (existing && !isSkeletonConfig(existing)) return { adopted: false }` (`:882`; `isSkeletonConfig` at `:750`); reads packaged `samples/conception.json` (`:893`); sets `conception.root = path.relative(cwd, contextDirAbs)` (`:894`); preserves existing `substrate_id` or mints (`:906`); `writeConfig` (AJV-validated atomic, `:908`); re-registers (`:909`).
- `/context install [--update]` → `installContext(cwd, { overwrite })` (`index.ts:334`): resolves substrate dir, loads config, builds `byId: Map<canonical_id,{schema_path,data_path}>` from `samples/conception.json` (`:364`), then **copies** each `config.installed_schemas[]` from `samples/<schema_path>` → `<substrate>/schemas/<name>.schema.json` and each `config.installed_blocks[]` from `samples/blocks/<data_path>` → `<substrate>/<name>.json`, with idempotent skip-if-exists unless `--overwrite` (`:387`–`:393`).

**Directionality today: strictly one-way (packaged catalog → project).** Grep across `packages/pi-context/src/` finds no export/bundle producer; "bundled" appears only in comments. The machinery only *reads* `samples/`.

### 1.2 The packaged catalog shape (what an exported bundle mirrors)

`packages/pi-context/samples/`:
- `conception.json` — top-level keys: `schema_version`, `block_kinds[]` (canonical_id, display_name, prefix, schema_path, array_key, data_path, optional layer), `relation_types[]` (canonical_id, display_name, category ∈ ordering|data_flow|membership, optional source_kinds/target_kinds), `lenses[]`, `invariants[]` (id, class ∈ requires-edge|status-consistency, block, relation_types, direction, severity), `layers`, `status_buckets`.
- `samples/schemas/` — one `*.schema.json` per block kind (draft-07 documents).
- `samples/blocks/` — one starter `*.json` per block kind, each `{ "<array_key>": [] }`.

`samples-catalog.ts:104` reads `conception.json` once and projects per-block-kind metadata. **An export bundle is exactly this three-part shape**, so import can reuse the install reader verbatim once its source path is parameterized.

### 1.3 The seam — two changes

**(a) Generalize the import source (small refactor of existing fns):**
- `adoptConception(cwd, opts?: { conceptionPath?: string; conception?: ConfigBlock })` — default packaged `samples/conception.json` (unchanged behavior); override to a bundle's `conception.json`.
- `installContext(cwd, opts: { overwrite?: boolean; schemasRoot?: string; blocksRoot?: string })` — default `samples/` (unchanged); override to a bundle's `schemas/` + `blocks/`.
- `/context import <bundle-dir>` (+ CLI op) = thin orchestration: `adoptConception(cwd, { conceptionPath })` then `installContext(cwd, { schemasRoot, blocksRoot, overwrite })`. Inherits the existing never-clobber + skip-if-exists + `--update` semantics.

**(b) Add the export direction (net-new):**
- `exportSubstrate(cwd, outDir)`: load substrate `config.json`; **strip instance fields** — set `root` to a placeholder, omit/null `substrate_id`; copy each declared schema from `<substrate>/schemas/` → `<outDir>/schemas/`; copy declared blocks (model-only ⇒ emit empty `{ "<array_key>": [] }` starters; full ⇒ copy item content) → `<outDir>/blocks/`; write the stripped config as `<outDir>/conception.json`. Output mirrors `samples/` so it round-trips through import.

### 1.4 The 50KB output-cap constraint — export must be a file-write op

`OpResult = string | { json: unknown } | { read: ReadStructured }` (`ops-registry.ts:118`); both `renderOpResultText` and `boundedJsonOutput` enforce `DEFAULT_MAX_BYTES = 50*1024` (`truncate.ts:12`) at the emission boundary (`ops-registry.ts:127`–`:199`). A whole-substrate bundle (config + all schemas + all blocks + relations) is routinely **100KB–1MB**, far over the cap. Therefore:

- **`export` must write the bundle to disk and return only metadata/prose** — e.g. `{ read: structureForRead({ path, size }) }` or a `string` ("Exported substrate to `<path>` (523KB)"). It **cannot** stream the bundle through the `{json}` channel; `scripts/parity-check.ts` `checkJsonContentCap` (`:768`–`:827`) would hard-fail an op that returns `{ json: <content-read> }`.
- **`import` fits cleanly as a request→response write op** (params `bundle_path`, `force`; returns a summary). Closest existing template: `amend-config` (`ops-registry.ts:1083`).

### 1.5 Dual-surface parity obligations (both new ops)

`scripts/parity-check.ts` (husky pre-commit) enforces, for any `surface:"use"` op:
- **Writer classification** (`:423`–`:567`): every exported library writer reachable from an op `run()` must be classified (`OpBackedDirect`/`Transitive`/`ForDirTwin`/`IntentionallyUnexposed`/`InternalPrimitive`); unclassified → exit 1. `exportSubstrate`/`importSubstrate` must be op-reachable or allowlisted.
- **Ctx-forwarding** (`:569`–`:614`, fatal): an op `run()` that declares `ctx` and directly calls a ctx-accepting writer must forward it. `import` is write-bearing ⇒ must accept + forward `ctx` to every block/relation write; `export` is read-only ⇒ no ctx.
- **{json}-content-cap** (`:768`–`:827`, fatal): no returning `{ json: readBlock(...) }`-style direct content reads (see §1.4).
- **Dual-surface param parity** (`:735`–`:766`, soft divergence): each optional op param (`dry-run`, `force`) needs a matching flag parsed in the orchestrator-script twin `scripts/orchestrator/{export-substrate,import-substrate}.ts`.

CLI exposure itself is automatic: `useOps = ops.filter(o => o.surface === "use")` (`packages/pi-context-cli/src/cli.ts:44`); a new `surface:"use"` op becomes a CLI command with zero CLI edits (`bin.ts`, `cli.ts` `main()` `:435`, `parseOpArgs` `:182`).

---

## Fork 2 — external/global `path/to/.substrate-dir`

### 2.1 Verdict: NOT resolvable today

`resolveContextDir(cwd): string` is unconditionally `return path.join(cwd, contextDir)` (`packages/pi-context/src/context-dir.ts:104`, the join at `:142`). There is **no `path.isAbsolute` check and no `~` expansion**. On POSIX `path.join('/base','/abs') → '/base/abs'` — an absolute `contextDir` is treated as a *relative segment* and silently **nested under cwd** (`/Users/x/proj` + `/tmp/sub` → `/Users/x/proj/tmp/sub`), not the intended `/tmp/sub`. The bootstrap schema (`packages/pi-context/schemas/bootstrap.schema.json`) puts **no pattern constraint** on `contextDir` — it accepts any string — so this fails silently, not loudly.

Every path builder chains through that one resolver, so all inherit the breakage: `configPath`/`relationsPath` (`context.ts:382`–`:397`), `schemasDir`/`schemaPath` (`context-dir.ts:375`–`:399`), `migrationsPath` (`:424`), `agentsDir`/`contextTemplatesDir` (`:401`–`:407`), block files (`block-api.ts:57`), object store (`object-store.ts:45`), and all tmp+rename writers + the `withBlockLock` lock path (`block-api.ts:45`, `:925`).

Discovery is also cwd-bound: `listSubstrates(cwd)` enumerates `fs.readdirSync(cwd)` and matches by **bare directory name** (`index.ts:675`, `:692`, `:709`), so an external dir is never listed or flagged active. `flipBootstrapPointer(cwd, newContextDir, writerIdentity)` (`context-dir.ts:283`) does **not** validate the target exists (by design — caller's job); `switchToExisting` (`index.ts:617`) checks `path.join(cwd, targetDir, "config.json")` (assumes relative); `switchAndCreate` (`index.ts:563`) explicitly *rejects* path separators / `..` / absolute prefixes (`context-dir.ts:566`–`:571`).

### 2.2 What enabling Fork 2 requires (no debt left)

1. **Resolver:** branch on `path.isAbsolute(contextDir)` (and optionally `~`-expand) in `resolveContextDir` + `tryResolveContextDir`, returning the path directly when absolute.
2. **Bootstrap-schema policy:** decide + encode whether absolute `contextDir` is allowed (pattern/format), so it validates intentionally rather than silently mis-joining.
3. **Switch paths:** `switchToExisting` + `switchAndCreate` must handle absolute/external targets (validation currently assumes relative).
4. **Discovery:** `listSubstrates` can't find external dirs by cwd scan — needs an external-substrate registry/index or an explicit "register external location" step, else external substrates are unswitchable-by-name.
5. **Locking (the real gap):** see §2.3.

### 2.3 Cross-project shared-substrate concurrency — partial safety, real gap

Per-block file locks (`withBlockLock`, `block-api.ts:45`, `lockfile.lockSync(filePath,{stale:10000})`) use the **absolute** block-file path, so two projects writing the same block via the same external substrate **would serialize correctly**. But there is **no substrate-level lock**: `config.json`, `relations.json`, and `migrations.json` are written **without** `withBlockLock` protection. Concurrent multi-project mutation of those global files **races**. The resolver `bootstrapCache` is process-local (keyed by `path.resolve(cwd)`), so cross-process cache coherence relies on pointer-file mtime re-stat (safe for reads). **A production Fork 2 needs a substrate-level lock** serializing all mutations, not just per-block writes.

### 2.4 The pi-workflows parallel — reality check

"pi-workflows can import workflows" is actually **directory-scan discovery**, not an import command. `discoverWorkflows(cwd, builtinDir?)` (`packages/pi-workflows/src/workflow-discovery.ts`) scans three tiers — project `.workflows/` > user `~/.pi/agent/workflows/` > bundled package `workflows/` — for `*.workflow.yaml`, parses each (`scanDirectory`, silent-skip-on-parse-failure `:109`–`:112`), dedups by name (project shadows user shadows builtin), returns sorted `WorkflowSpec[]`; `findWorkflow(name, cwd)` filters by name. Drop a spec file in a scanned dir ⇒ it is discovered. **No explicit import, no file-bundle transport.**

So the pi-workflows model is prior art for **Fork 2's discovery angle** (a known/global location that's scanned), **not** for Fork 1's bundle export/import. The substrate transport need (cross-machine, zip, distribution) is genuinely new relative to anything in pi-workflows.

---

## 3. Identity & portability crux (governs whether instance content can move)

- **`oid`** = `sha256([substrate_id, nonce]).slice(0,32)` (`mintOid`, `block-api.ts:624`) — **substrate-scoped**. Re-importing the same item into a different substrate (different `substrate_id`) yields a **different** oid. oids are not globally unique.
- **`content_hash`** = `sha256(canonicalJson(contentProjection))` (`computeContentHash`, `content-hash.ts:65`) — **globally stable** (content-only). Same item content ⇒ same hash in any substrate. This is what enables dedup + integrity-verification on import (`objects/<content_hash>.json` store, `object-store.ts:45`; idempotent write).
- Stamping is gated on the schema declaring all three identity fields (`oid`/`content_hash`/`content_parent`) — `prepareItemIdentityForWrite` (`block-api.ts:662`); `substrate_id` read via `substrateIdForDir` (`context-dir.ts:471`, pattern `^sub-[0-9a-f]{16}$`).

**Consequence:** Fork 1 **model** export is identity-clean (no items ⇒ no oids to reconcile). Fork 1 **content** export, and Fork 2 sharing, both need a defined policy: re-mint oids under the target `substrate_id`, keyed on `content_hash` for cross-substrate dedup/recognition. Relations endpoints already carry an optional `substrate_id` on foreign endpoints (`relations.json` `RawEndpoint`), which is the hook for cross-substrate edges.

---

## 4. Decomposition (separable; the two forks need not land together)

**Fork 1 — model export/import (lowest-risk; mostly generalization of existing machinery):**
- F1-a `exportSubstrate(cwd, outDir)` — net-new, file-write op, model-only first (strip `root`/`substrate_id`, empty starter blocks). + `export-substrate` op (`surface:"use"`, returns `{read}`/prose) + orchestrator twin.
- F1-b parameterize `adoptConception(cwd, {conceptionPath?})` — source generalization.
- F1-c parameterize `installContext(cwd, {schemasRoot?, blocksRoot?})` — source generalization.
- F1-d `/context import <bundle>` + `import-substrate` op (write op, `ctx`-forwarding) + orchestrator twin, orchestrating F1-b+F1-c.
- (later) F1-e content export/import with the oid-reconciliation policy from §3.

**Fork 2 — external/global substrate dir (higher-risk; touches the resolver everything chains through):**
- F2-a `resolveContextDir` / `tryResolveContextDir` `isAbsolute` (+`~`) branch.
- F2-b bootstrap-schema absolute-path policy.
- F2-c `switchToExisting` / `switchAndCreate` external-target handling.
- F2-d external-substrate discovery/registry (so external dirs are switchable-by-name).
- F2-e substrate-level lock for cross-project shared mutation of `config.json`/`relations.json`/`migrations.json`.
- F2-f oid-reconciliation/sharing policy (shared `substrate_id` ⇒ consistent oids; §3).

Each F2 item is a prerequisite for safe sharing; none is optional if Fork 2 is pursued (no parallel ungated path, no silent-race residual).

---

## 5. Verification note

The "what exists / what's one-directional / what breaks" claims are empirically grounded (registration shapes, resolver code, and install/adopt flow read directly from `src/`, file:line cited). The `exportSubstrate`/`importSubstrate` shapes and the `adoptConception`/`installContext` parameterization are **proposals** — before implementation they go through the canonical pipeline (plan → coding subagent → adversarial audit), re-confirming the install reader truly reuses for arbitrary bundle paths and that the 50KB cap forces export to file-write under the parity gate.
