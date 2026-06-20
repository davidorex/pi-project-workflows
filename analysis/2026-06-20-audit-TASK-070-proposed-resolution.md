# Audit — TASK-070 proposed resolution (config migrate-on-load, FGAP-095)

Date: 2026-06-20
Scope: read-only design audit of TASK-070's description + acceptance_criteria and the upstream FGAP-095 proposed_resolution, against the actual cited code. No mutation, no implementation.

## Verdict: HAS-PROBLEMS

The core design (mirror `validateBlockWithMigrationForDir`; reuse the existing declarative-transform engine; add one `map_each` op) is **sound and correctly reuses existing machinery** — it is NOT a new mechanism. But the resolution as written has one **load-bearing wiring defect** that reproduces the exact brick FGAP-095 exists to prevent, plus two scope/clarity issues. The defect lives in the design MD the task delegates to (`analysis/2026-06-18-config-migration-corrected-implementation-steps.md`, Step 6/7), so it is in-scope for the task's proposed resolution.

---

## What is SOUND (verified against code)

- **Reuse, not reinvention.** The declarative-transform engine already exists: `TransformOp` union (`migrations-store.ts:64-68`), `applyOp` switch (`migration-registry-loader.ts:132-182`), `migrationFnFor` deep-clone-then-apply (`:196-218`), `migrations.schema.json` `TransformOp` oneOf, and the `write-schema-migration` op. `map_each` is correctly appended to that union (one new case in `applyOp`, one new oneOf variant) rather than a parallel mechanism. This is the right altitude.
- **Load-path mirror is faithful.** `validateBlockWithMigrationForDir` (`schema-validator.ts:205-242`) reads `schema.version` vs `data.schema_version`, runs `runMigrations` on mismatch, then validates. The design's `loadConfigForDir` patch (MD Step 4) reproduces exactly that shape and correctly notes the one deliberate divergence: it keeps validating against the **bundled** package schema (`bundledSchemaPath("config")`, the current behavior at `context.ts:580`) rather than the substrate-dir schema (`schemaPathForDirHelper`) that `validateBlockWithMigrationForDir` uses. Config has no substrate-copied schema, so the bundled target is correct. Choosing the inline variant over calling `validateBlockWithMigrationForDir` is justified.
- **`getProjectMigrationRegistryForDir` exists** (`migration-registry-loader.ts:313`) and is the cached dir-keyed builder — the MD Step 4 import reference is real and correct (not a phantom API).
- **`runMigrations` no-op path is real** (`schema-migrations.ts:151`): `currentVersion === targetVersion` returns input unmodified, no registry lookup. This satisfies AC4 (current-version config loads byte-unchanged) **only** for the matched-version case — see Problem 2.
- **`walkPath` `$.`-prefix requirement, in-place mutation, absent-path no-op guards** all match what the MD asserts (`applyOp` cases each guard `read.parent === null`).

## PROBLEM 1 (CRITICAL — load-bearing): the config migration decl has no propagation path into a live substrate's `migrations.json`

`loadConfigForDir` reads the registry via `getProjectMigrationRegistryForDir(substrateDir)` → `buildRegistryFromSubstrateForDir` → `loadMigrationsFileForDir(substrateDir)`, which reads **`<substrateDir>/migrations.json`** (`migrations-store.ts:100`, `context-dir.ts:425`). The decl in MD Step 6 is shipped into **`samples/migrations.json`** (the packaged catalog). Nothing copies catalog migrations into a substrate's `migrations.json`:

- `context.ts` contains **zero** references to `migrations` — the installer/updater never materializes `samples/migrations.json`.
- The only writer of substrate `migrations.json` is the `write-schema-migration` op (`appendMigrationDecl`, `write-schema-migration-tool.ts:139`) and the `update` op's per-schema resync, which registers a migration **only for schemas it resyncs** — i.e. members of `installed_schemas`.
- `config` is **NOT** in `installed_schemas` (`samples/conception.json:516-534` lists block schemas only; config has no substrate copy — it validates against the bundled package schema). So the update path never iterates `config` and never registers a `config` edge.

Consequence: after the `config.schema.json` bump to `1.8.0` (MD Step 5), a live substrate whose `config.json` is still at the old version has **no `config` edge in its own `migrations.json`**. `loadConfigForDir` computes `schemaVersion('1.8.0') !== dataVersion(old)`, calls `runMigrations(registry, "config", old, "1.8.0", data)`, and `registry.resolve` throws `no migrations registered for schema 'config'` (`schema-migrations.ts:101`). Every config-loading op exits 5 — **the identical brick FGAP-095 was filed to eliminate, now relocated from "no migration mechanism" to "mechanism present but unreachable."** AC2 ("a config one version behind loads valid, no exit-5 brick") would be FALSE on any real substrate.

The MD's own Step 7 ("DECISION") gestures at the *version-coverage* edge (`1.0.0` vs `1.7.0` inbound chain) but never asks the prior question: **how does any `config` decl reach the substrate's `migrations.json` at all?** Step 6 assumes shipping to `samples/migrations.json` suffices; the read path proves it does not.

**Required correction (must be in the task's acceptance criteria, not deferred):** the resolution must specify the propagation path. Options, to be DERIVED not left open:
- (a) Make `loadConfigForDir` build its registry from the **catalog** `samples/migrations.json` (the bundled file, alongside `bundledSchemaPath("config")`) rather than the substrate's — config's schema is bundled, so its migration chain should be bundled too. This is the internally-consistent choice: config is a package-owned schema, not a substrate-installed one, so both its schema AND its migration chain live in the package. `buildFreshRegistryWithChain` / a bundled-migrations loader variant is the seam.
- (b) Add `config` to the install/update materialization so the catalog `config` edge is copied into `<substrateDir>/migrations.json` at install/update — larger blast radius (config becomes installed-asset-shaped) and still leaves pre-update substrates bricked until they run update; rejected as inferior.

(a) is the derivable answer and the one matching the existing "config validates against bundled, not substrate" invariant. The task must name it.

## PROBLEM 2 (correctness gap in AC4 wording): "byte-unchanged" only holds at version-match, not "when versions match" as the only carve-out

AC4 reads "A current-version config loads byte-unchanged: no migration applied when versions match." That is correct for the equal-version path. But the task/MD must also state the **post-migration** invariant: when a migration DOES run, the in-memory result is carried forward but the on-disk `config.json` is **not** rewritten (the load path validates `toValidate` and returns it; it never persists). `validateBlockWithMigrationForDir`'s own contract is explicit about this (`schema-validator.ts:202-203`: "Out of scope: writing the migrated form back to disk"). Without stating it, a reader/implementer may add a write-back, turning a read into a mutation (and a write into the active substrate's `config.json` — forbidden outside the block-write surface). AC should assert: migrated config is carried in memory only; `config.json` on disk is untouched by load.

## PROBLEM 3 (scope/sequencing not bound by the AC): the schema bump + decl + hook must ship atomically, and the AC omits this

MD Steps 4/5/6 + the Step-7 version-coverage decision **must ship together** (MD "Sequencing" §, and the `1.0.0` inbound-chain hazard). The TASK-070 acceptance_criteria enumerate the mechanism (read version / walk chain / `map_each` / no-op-on-match) but do **not** encode: "the registered config edge covers the real on-disk `schema_version` of every live substrate (`1.0.0` per `conception.json:2`), not merely the `1.7.0→1.8.0` step." A partial ship — `map_each` engine + hook + a lone `1.7.0→1.8.0` edge — bricks every substrate still at `1.0.0` (no inbound chain → `resolve` throws). The AC must include a covering-chain criterion tied to the actual catalog config `schema_version`.

Note: Problems 1 and 3 compound — even after fixing propagation (Problem 1), the chain must still cover `1.0.0`.

---

## Proposed replacement text (ready to drop into TASK-070)

**description (replace):**

> Make config load migration-aware by mirroring validateBlockWithMigrationForDir (schema-validator.ts:205-242) inside loadConfigForDir (context.ts:565-582): read the config's schema_version, and on mismatch with the bundled config schema's version (bundledSchemaPath("config")), walk the registered "config" migration chain forward via runMigrations, then validate the migrated shape against the bundled schema — carrying the migrated config in memory only, never rewriting config.json on disk. Reuse the EXISTING declarative-transform engine (migrations-store.ts TransformOp union + migration-registry-loader.ts applyOp + migrationFnFor); add exactly one new op, map_each, to that union and switch (no new registry, no new file). Because config is a PACKAGE-owned schema validated against the bundled schema (NOT a member of installed_schemas — conception.json:516-534 — and never copied into a substrate's schemas/ or migrations.json), the config migration chain is loaded from the BUNDLED catalog migrations (alongside bundledSchemaPath("config")), NOT from <substrateDir>/migrations.json: the substrate update path only registers migrations for installed block schemas and would never propagate a config edge, so reading the substrate file would throw "no migrations registered for schema 'config'" and reproduce the FGAP-095 brick. The shipped catalog config chain MUST cover the real on-disk config schema_version of live substrates (1.0.0 per conception.json:2), not only the latest version step.

**acceptance_criteria (replace):**

1. loadConfigForDir reads config schema_version and, on mismatch with the bundled config schema version, walks the "config" migration chain (loaded from the BUNDLED catalog migrations, not the substrate's migrations.json) before validating against the bundled config schema.
2. A live substrate whose config.json lags the bundled config schema by the shipped chain (including a substrate at the catalog-default 1.0.0) loads valid — carried forward IN MEMORY — with no exit-5 brick and no rewrite of config.json on disk.
3. The map_each declarative-transform op is added to the EXISTING TransformOp union + applyOp switch (table mode and set-on-each mode), with the migrations.schema.json oneOf variant; no new migration mechanism, registry, or file is introduced.
4. A current-version config (schema_version equals bundled schema version) loads byte-unchanged: runMigrations short-circuits (currentVersion === targetVersion), no chain consulted, config.json untouched.
5. The catalog config migration chain resolves from every live on-disk config schema_version (1.0.0) to the bumped bundled version; a partial chain that leaves any shipped on-disk version without an inbound edge is a failing condition (resolve throws → brick).

**files (add):** `packages/pi-context/samples/migrations.json` (the bundled config decl), `packages/pi-context/schemas/migrations.schema.json` (map_each oneOf variant), `packages/pi-context/src/migrations-store.ts` (TransformOp union), `packages/pi-context/src/migration-registry-loader.ts` (applyOp case + bundled-catalog registry seam) — in addition to the two already listed (context.ts, schema-migrations.ts; note the engine changes are in migration-registry-loader.ts, not schema-migrations.ts).

---

## One residual the implementer must resolve in plan mode (not a defect, a real fork the design left open)

Problem 1 fix (a) requires a registry built from the BUNDLED `samples/migrations.json`. The existing builders (`buildRegistryFromSubstrateForDir`, `getProjectMigrationRegistryForDir`) read the SUBSTRATE file and are cache-keyed by substrate dir. A bundled-catalog config chain needs either a new small loader (read `samples/migrations.json`, filter to `schemaName==="config"`, build a fresh registry) or a generalization of the existing loader to accept an explicit migrations-file path. This is a genuine implementation-shape decision (new function vs parameterize existing) and belongs in the plan, but the AC above pins the REQUIRED behavior (bundled source) so the decision cannot regress to the bricking substrate-file read.
