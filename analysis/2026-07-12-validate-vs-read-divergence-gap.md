# validate-block-items vs. canonical read-path divergence — false-green on the op surface

**Date:** 2026-07-12
**Investigator:** subagent (experience-gap investigation, per Experience-Gap Handling)
**Verdict:** FILING WARRANTED — distinct from FGAP-140 / FGAP-141 / FGAP-114. The divergence reproduces empirically on a fresh `/context install` substrate.

---

## 1. Root cause

Two op surfaces answer a "is this block's data valid?"-shaped question against **different schema sources and different migration registries**, so one can report `valid:true` on the exact block file the other throws on.

### 1a. The lenient surface — `validate-block-items` → `validateBlockItemsAgainstCatalog`

`packages/pi-context/src/index.ts:1003-1065`. Load pattern and resolution:

```
1013   const { samplesRoot, byId } = resolveCatalog();            // PACKAGED catalog, not installed
1014   const kind = byId.get(blockName);
...
1018   const sourceFile = path.join(samplesRoot, kind.schema_path); // CATALOG schema body
1019   const blockFile = installedBlockDestPath(destRoot, blockName);
...
1044   const catalogSchema = JSON.parse(fs.readFileSync(sourceFile, "utf-8")) ...
1046   if (typeof blockVersion === "string" && catalogVersion !== undefined && blockVersion !== catalogVersion) {
1047      const chain = findCatalogMigrationChain(samplesRoot, blockName, blockVersion, catalogVersion);
1048      if (chain !== null) {
1052         const registry = buildFreshRegistryWithChain(destRoot, chain);   // FRESH registry, self-seeded from CATALOG chain
1053         toValidate = runMigrations(registry, blockName, blockVersion, catalogVersion, blockData);
1054      }
1055   }
1056   validate(catalogSchema, toValidate, blockName);            // validates against CATALOG schema
1057   return { block, from, to, valid: true, failures: [] };
```

- Schema source: **catalog** (`samplesRoot/<kind>.schema.json`, `resolveCatalog()` at `index.ts:658-671` — the packaged `samples/` dir), NOT the installed `<contextDir>/schemas/<name>.schema.json`.
- Migration registry: a **fresh** registry seeded from the **catalog** chain (`findCatalogMigrationChain` reads `samplesRoot/migrations.json`, `index.ts:728-754`; `buildFreshRegistryWithChain` at `migration-registry-loader.ts:301`). It never consults the substrate's on-disk `migrations.json` project registry for whether the hop is registered.
- Version-lag fall-through: when `blockVersion !== catalogVersion` and **no catalog chain exists** (`chain === null`), it does NOT throw — it validates the block **as-is** (`toValidate` stays `blockData`, line 1045 default). No `MigrationRegistry` error is ever raised.

### 1b. The faithful surface — `readBlock` → `readBlockForDir` → `validateBlockWithMigrationForDir`

`packages/pi-context/src/block-api.ts:866-931`. The read gate:

```
901   if (existingBlockSchemaPathForDir(substrateDir, blockName) !== null) {
902      const envelope = data as Record<string, unknown> | null;
903      if (envelope && typeof envelope === "object" && typeof envelope.schema_version === "string") {
904         const registry = getProjectMigrationRegistryForDir(substrateDir);   // PROJECT registry from on-disk migrations.json
905         data = validateBlockWithMigrationForDir(substrateDir, blockName, envelope, registry);
906      }
907   }
```

`validateBlockWithMigrationForDir` (`schema-validator.ts:207-244`):

```
213   const schemaPath = schemaPathForDirHelper(substrateDir, schemaName);       // INSTALLED schema
...
234   if (schemaVersion && blockVersion && schemaVersion !== blockVersion) {
235      if (!registry) {
236         throw new Error(`validateBlockWithMigration: block at ${schemaName} declares schema_version '${blockVersion}' but schema is at '${schemaVersion}' and no MigrationRegistry was supplied`);
239      }
240      toValidate = runMigrations(registry, schemaName, blockVersion, schemaVersion, data);   // THROWS inside if the project registry lacks the hop
241   }
243   return validate(schema, toValidate, schemaName);
```

- Schema source: **installed** (`<contextDir>/schemas/<name>.schema.json`).
- Migration registry: the **project** registry (`getProjectMigrationRegistryForDir`, `migration-registry-loader.ts:352`), loaded from the substrate's on-disk `migrations.json`.
- Version-lag behavior: when the block's `schema_version` differs from the installed schema and the project registry has **no** hop, `runMigrations` throws `MigrationRegistry: no migrations registered for schema '<name>' (need <from> → <to>)`.

### 1c. The three divergence axes

| Axis | `validate-block-items` | canonical read path |
|---|---|---|
| Schema body | catalog (`samples/`) | installed (`<ctx>/schemas/`) |
| Migration registry | fresh, self-seeded from catalog chain | project on-disk `migrations.json` |
| No hop available | validates as-is, **no throw** | **throws** `MigrationRegistry` |

The op is documented (`index.ts:974-1001`) to answer a deliberately different question — *"would these items pass the catalog schema after the shipped forward-migration?"*, an update-preview mirroring `resyncSchema`'s catalog-ahead arm. That resolution is correct **for that question**. The gap is that the surface's name (`validate-block-items`) and `promptSnippet` ("Validate a block's items … returns the per-item failures") read as a generic "are my items valid / readable" check, and its `valid:true` is over-consumable as "this block reads," which it does not guarantee.

---

## 2. Shape + empirical reproduction (real, run — not inferred)

Fresh faithful substrate built with the real global `pi-context` CLI ceremony (`context-init` → `context-accept-all` → `context-install`) in scratch, one task item appended via `append-block-item`. On a fresh install the project `migrations.json` carried **1** decl (config only) and **zero** `tasks` hops — i.e. the fresh-install project registry does not know the `tasks` 1.0.0→1.0.1→1.1.0 chain the catalog ships.

The block `tasks.json` was set to `schema_version: "1.0.0"` (an item block lagging the installed schema, which is at 1.1.0 — the exact condition that made research/session-notes reads throw in a prior session). Then both surfaces were run against the **identical** file:

```
$ pi-context validate-block-items --block tasks --json
{"ok":true,"op":"validate-block-items","output":{"block":"tasks","from":"1.0.0","to":"1.1.0","valid":true,"failures":[]}}

$ pi-context read-block --block tasks --json
{"ok":false,"op":"read-block","error":"MigrationRegistry: no migrations registered for schema 'tasks' (need 1.0.0 → 1.1.0)"}
```

**FALSE-GREEN CONFIRMED.** The op reports the block valid; every real read of the same file fails.

The divergence is not confined to the hand-degraded `tasks` block. `session-notes` shipped from the **fresh install untouched** already lagging (block `schema_version` 1.0.0, installed schema 1.1.0, no project hop — this is FGAP-140's named symptom):

```
$ pi-context validate-block-items --block session-notes --json
{"ok":true,"op":"validate-block-items","output":{"block":"session-notes","from":"1.0.0","to":"1.1.0","valid":true,"failures":[]}}

$ pi-context read-block --block session-notes --json
{"ok":false,"op":"read-block","error":"MigrationRegistry: no migrations registered for schema 'session-notes' (need 1.0.0 → 1.1.0)"}
```

So the false-green is reachable **out of the box** on any current fresh install, with no manual fixture manipulation.

---

## 3. Reproducible conditions

```bash
SCRATCH=/tmp/repro-substrate; rm -rf "$SCRATCH"; mkdir -p "$SCRATCH"; cd "$SCRATCH"
W='{"kind":"human","user":"davidryan@gmail.com"}'
pi-context context-init --contextDir .ctx --writer "$W" --json --yes
pi-context context-accept-all --writer "$W" --json --yes
pi-context context-install --writer "$W" --json --yes
# session-notes already lags out of the box; observe directly:
pi-context validate-block-items --block session-notes --json   # -> valid:true
pi-context read-block --block session-notes --json             # -> throws MigrationRegistry
```
To reproduce on `tasks`: append one item, then set `tasks.json`'s envelope `schema_version` to `"1.0.0"`, and run the same two ops.

Minimal predicate for the divergence: a block whose envelope `schema_version` differs from its **installed** schema version, where the **project** `migrations.json` lacks the bridging hop but the **catalog** `migrations.json` ships a complete chain to the catalog schema version, and the migrated data satisfies the catalog schema. (When the catalog chain is content-transforming rather than identity and the migrated data would fail, `validate-block-items` reports `valid:false` — still divergent from the read path's throw, but not a false-*green*.)

---

## 4. Prior-art search (precondition of filing)

Searched `framework-gaps` via bare CLI ops (`read-block-item`, `filter-block-items --op matches` on `description` and `title`). Relevant items, read fresh:

- **FGAP-140** (open, "Fresh install never seeds block-schema migration declarations from the catalog for any schema"): the **write/install-path cause** — why the project registry lacks the chain. Names `session-notes` as today's live symptom. Concerns the seeding of `migrations.json`, NOT the validation op's resolution semantics. This gap is the *consumer-side* twin: even after FGAP-140 is fixed, `validate-block-items` would still resolve against the catalog + a self-seeded registry and could still diverge from the read path (e.g. installed schema locally modified away from catalog).
- **FGAP-141** (closed, TASK-122/VER-099, "Update-time schema-version-advancing write paths never register a migration declaration"): the update-path cause. Same write-side family as FGAP-140. Not the validation op.
- **FGAP-114** (closed, TASK-078/VER-065, "context-validate performs no block-item schema validation"): gave `context-validate` a substrate-wide schema-validity sweep via `validateBlockWithMigrationForDir` — i.e. it aligned `context-validate` **with** the read path. Its filed text documents the historical divergence in the **inverse** direction (`validate-block-items` reporting invalid while `context-validate` reported clean), and the fix made `context-validate` faithful to the read path. It does NOT address `validate-block-items`' own catalog-based resolution producing a false-**green** against the read path. Confirmed empirically: post-FGAP-114, `context-validate` on the repro flags both blocks as `block_schema_invalid` (agreeing with `read-block`), while `validate-block-items` reports `valid:true`.
- FGAP-014 (closed): unrelated (completeTask reading undeclared verification fields).
- FGAP-032 (closed): unrelated (CLI id-flag naming divergence).

**Verdict: distinct.** No existing item tracks "the `validate-block-items` op resolves against the catalog schema + a self-seeded fresh catalog-chain registry, so it reports `valid:true` on a block the canonical read path (and, post-FGAP-114, `context-validate`) throws `MigrationRegistry` on." 140/141 are the write-side causes; 114 aligned a *different* op. Relate the new filing to FGAP-140 (shared root condition) and FGAP-114 (prior instance of the same class), do not fold into either.

---

## 5. Class verdict

Empirical class sweep on the repro (all against the identical lagging block file):

| Surface | Resolution | Verdict on lagging block |
|---|---|---|
| `read-block` | installed schema + project registry | THROWS |
| `read-block-item` | (routes through `readBlockForDir`) | THROWS |
| `read-block-page` | (routes through `readBlockForDir`) | THROWS |
| `filter-block-items` | (routes through `readBlockForDir`) | THROWS |
| `context-validate` | installed schema + project registry (FGAP-114 sweep) | flags `block_schema_invalid` (agrees) |
| **`validate-block-items`** | **catalog schema + fresh catalog-chain registry** | **`valid:true` (false-green)** |

**`validate-block-items` is the single outlier** among the read/validation ops. Every other read op and `context-validate` resolve against the canonical (installed schema + project registry) path and agree; only `validate-block-items` uses the catalog resolution.

The general class: **a validity/read op whose surfaced name/description does not disclose which schema+registry resolution it uses, so its verdict is mis-consumed as a canonical-read verdict.** This class already bit once — FGAP-114's history is the prior instance (the same `validate-block-items` vs. `context-validate` seam, then in the opposite direction). FGAP-114 closed the divergence by bringing `context-validate` to the read-path resolution but left `validate-block-items` itself as the standing catalog-resolution outlier. The class is therefore recurring, currently with exactly one live member on the read side (`validate-block-items`). The specific gap should be filed as that member, with the class named so the fix addresses disclosure/faithfulness, not just this one symptom.

Not filed as a broad multi-op class gap because the empirical sweep found no *other* current divergent read/validation op — the sibling read ops all delegate to `readBlockForDir`. Filing the broad class with no second instance would be speculative; the correct level is the concrete `validate-block-items` gap with the class characterized in its body.

---

## 6. Proposed FGAP filing (register-compliant; orchestrator files)

**title:** `validate-block-items reports valid:true on a block the canonical read path throws on — it resolves against the catalog schema + a self-seeded catalog-chain registry, not the installed schema + project registry`

**status:** identified
**priority:** P2
**package:** pi-context

**description:** `validateBlockItemsAgainstCatalog` (index.ts:1003-1065) validates a block against the **catalog** schema body (`resolveCatalog()`, `samplesRoot/<kind>.schema.json`) after migrating its items through a **fresh registry self-seeded from the catalog migration chain** (`findCatalogMigrationChain` + `buildFreshRegistryWithChain`). The canonical read path — `readBlockForDir` (block-api.ts:901-906) → `validateBlockWithMigrationForDir` (schema-validator.ts:207-244), shared by read-block / read-block-item / read-block-page / filter-block-items — validates against the **installed** schema (`<ctx>/schemas/<name>.schema.json`) using the **project** registry loaded from the substrate's on-disk `migrations.json`, and throws `MigrationRegistry: no migrations registered for schema '<name>' (need <from> → <to>)` when the block's envelope `schema_version` lags the installed schema and the project registry lacks the hop. When the catalog ships the chain but the project `migrations.json` does not (the fresh-install condition of FGAP-140), `validate-block-items` returns `valid:true` while every real read of the same file throws. The op's documented purpose is a deliberate catalog-forward update-preview, but its name and promptSnippet read as a generic item-validity check, so `valid:true` is over-consumed as "this block reads."

**evidence:**
- `packages/pi-context/src/index.ts` (1013-1057): resolves catalog schema + catalog chain via `resolveCatalog`/`findCatalogMigrationChain`/`buildFreshRegistryWithChain`; on no chain validates as-is (no throw).
- `packages/pi-context/src/block-api.ts` (901-906): read gate calls `getProjectMigrationRegistryForDir` + `validateBlockWithMigrationForDir` — installed schema, project registry.
- `packages/pi-context/src/schema-validator.ts` (234-241): throws on version mismatch when the supplied (project) registry lacks the hop.
- Empirical (fresh `/context install`, scratch): `validate-block-items --block session-notes` → `valid:true`; `read-block --block session-notes` → `MigrationRegistry: no migrations registered for schema 'session-notes' (need 1.0.0 → 1.1.0)`. Same for a `tasks` block set to `schema_version:1.0.0`. `context-validate` flags both as `block_schema_invalid`, agreeing with the read path.

**impact:** An operator running `validate-block-items` to check a block's health is told `valid:true` for a block that is unreadable through every read op and flagged `block_schema_invalid` by `context-validate`. The false-green is reachable out of the box: `session-notes` ships lagging from a fresh install (FGAP-140). Any closure/verification surface that cites a `validate-block-items` pass as block readability over-reads the verdict. `validate-block-items` is the single read/validation op whose schema+registry resolution diverges from the canonical read path; the other read ops all delegate to `readBlockForDir` and agree.

**proposed_resolution:** Requires determination between (a) re-surfacing the op so its verdict is not mis-consumed — rename/relabel to disclose the catalog-forward-preview semantics (e.g. an explicit "would-survive-catalog-update" framing) and/or return the resolution basis (`catalog` vs `installed`) in the result envelope; and (b) providing a read-path-faithful per-block diagnostic — a non-throwing op that validates a block against the **installed** schema + **project** registry (the `validateBlockWithMigrationForDir` resolution `context-validate`'s sweep already uses substrate-wide), so an operator can get a clean `valid/invalid` for "does this block read?" without triggering a throw. Relate to FGAP-140 (shared fresh-install root condition; note this consumer-side gap persists even after 140's write-side seeding fix when installed and catalog schemas diverge) and FGAP-114 (prior instance of the same disclosure/faithfulness class, which aligned `context-validate` but left `validate-block-items` as the standing outlier). Class-correct fix addresses disclosure/faithfulness of the op surface, not only this one lag symptom.

**suggested birth relations:** `framework_gap_relates_to_gap` → FGAP-140; `framework_gap_relates_to_gap` → FGAP-114 (confirm the relation_type name against `config.relation_types[]` at filing).
