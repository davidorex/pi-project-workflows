# Config-schema-migration design — feasibility verification

Date: 2026-06-18
Method: read of real `packages/pi-context/src` + `schemas/` (no mutation) plus a throwaway empirical probe at `/tmp/config-migration-probe/` exercising the REAL transform engine (`migrationFnFor`) and the REAL validator (`validateFromFile`) against an in-memory fixture. No live substrate, src, schemas, or samples touched; no build run.

The design under test proposes a config-schema migration mechanism mirroring the block-schema migration pattern (schema_version field; `schema:"config"` migration decls; load-time `migrateConfigIfNeeded`; `update` op write-back; one new `map_each` transform primitive), with a worked 1.7.0→1.8.0 `state_derivation` example.

---

## PART A — premise-by-premise

### A1. "Config currently validated raw, no version envelope; config DATA carries no `schema_version`." — REFUTED (split verdict)

- CONFIRMED half: `loadConfigForDir` validates with the NON-migrating `validateFromFile`, not a migrating validate.
  `src/context.ts:579`: `validateFromFile(bundledSchemaPath("config"), data, \`config.json (${p})\`);` — and `loadConfig` (`:549-552`) is a thin wrapper delegating to it. There is no migration hook on the config load path. This half of the premise holds.
- REFUTED half: config DATA already carries `schema_version`, and the config schema already REQUIRES it.
  `schemas/config.schema.json:8`: `"required": ["schema_version", "block_kinds"]`. `:4`: `"version": "1.7.0"`. `:11-14`: the `schema_version` property is declared (`pattern ^\d+\.\d+\.\d+$`, "Semver of this config schema. Surfaces the schema-versioning gateway at the meta-layer."). So the "no version envelope" claim is wrong — the envelope field exists and is mandatory.
- Consequence: the design's step 1 ("Add a `schema_version` field to config.json data") is ALREADY DONE. What is actually missing is only the migration-on-load behavior, not the field. Also note a live drift surfaced incidentally: the packaged `samples/conception.json` ships `schema_version: "1.0.0"` while `config.schema.json` is at `"1.7.0"` — i.e. the config schema has been bumped six times with no migration mechanism and no catalog re-stamp, which is precisely the latent breakage this design addresses (and which the missing load-time migration would today turn into a hard load failure if the schema required a shape the 1.0.0 catalog lacked).

### A2. Declarative-transform engine — EXISTS; vocabulary is `rename`/`set`/`delete`/`coerce` (no `map_each`); paths are dotted `$.`-anchored with array-index addressing EXPLICITLY REJECTED. — CONFIRMED with a critical caveat.

- Engine location: `src/migration-registry-loader.ts`, function `applyOp` (`:132-182`). Dispatch (`:133`): `switch (op.op) { case "rename": ... case "set": ... case "delete": ... case "coerce": ... }`. All four named ops exist exactly as the design assumes. TransformOp union (`src/migrations-store.ts:64-68`) and the on-disk `oneOf` (`schemas/migrations.schema.json:71-120`) carry the same four — `map_each` is NOT among them.
- Path addressing: `walkPath` (`:80-124`). Paths MUST start with `$` (`:85-86`). Dotted segments only. CRITICAL: `:97-101` rejects any segment containing `[` or `]`: `migration path '${dottedPath}' contains array-element addressing ('[...]'); not supported in v1`. So `$.arr[0]` and `$.arr[*]` are unrepresentable. No wildcard, no index. Confirmed empirically in Part B.

### A3. Migration registry keyed by schema NAME; `schema:"config"` decl would slot in; `resolve`/`runMigrations` would walk a config chain. — CONFIRMED.

- `schemas/migrations.schema.json` MigrationDecl (`:22-57`) keys on a free-form `schemaName` string ("Canonical schema id ... matches the schema's $id minus the URN prefix"). It is NOT block-only and NOT hardcoded to block schema names — `"config"` is a valid `schemaName` value at the schema level.
- The registry is schema-name-generic: `createRegistry().register` (`src/schema-migrations.ts:82-94`) maps `schemaName → fromVersion → edge`; `resolve` (`:96-131`) walks per-`schemaName` edges; `runMigrations` (`:144-159`) applies the chain. None of these special-case block schemas. `buildRegistryFromSubstrateForDir` (`migration-registry-loader.ts:231-245`) registers every decl in `migrations.json` regardless of schemaName. A `schema:"config"` decl would register and resolve identically to a block decl.

### A4. Integration points. — CONFIRMED (load path is single-funnel; update op exists with dryRun).

- Single load funnel: `loadConfig` (`context.ts:549`) → `loadConfigForDir` (`:564`). Every config read goes through `loadConfigForDir` (`loadConfig` is its only non-test caller wrapper; `amendConfigEntryForDir:1250`, `mergeCatalogRegistries` callers, and the cache populate at `:1459` all read config via `loadConfig`/`loadConfigForDir`). One migration hook inside `loadConfigForDir` (immediately before the `:579` validate) would cover all reads — the design's step-3 placement is sound.
- The catalog `update` op surface is `mergeCatalogRegistries` (`context.ts:1120-1153`), additive-only, with explicit `state_derivation` whole-or-nothing handling (`:1149-1151`: inherits catalog's `state_derivation` only when the substrate LACKS one; an existing one is preserved verbatim). `--dryRun` is honored in the sibling `amendConfigEntryForDir` (`:1377-1378`: under dryRun it validates the would-be config but writes nothing). So a migration step CAN "slot in before validation" structurally. CAVEAT: `mergeCatalogRegistries` is PURE (no I/O) and does NOT migrate — it only merges registries; the design's step-4 write-back is net-new code, not an existing path it slots into.

### A5. Is `map_each` the ONLY missing primitive for the worked example? — REFUTED.

Two primitives/capabilities are missing, not one:
1. `map_each` for the `blocked_by.relation_types` string[]→object[] element transform (genuinely absent; confirmed A2).
2. Array-ELEMENT addressing for the rollups `rollup_endpoint` add. The rollups change is "set `rollup_endpoint` on each EXISTING rollup OBJECT." `set` cannot reach `$.state_derivation.rollups[0].rollup_endpoint` (array-index rejected, A2/Part B). And `map_each` as the design SPECIFIES it (string array → object array; "elements already objects pass through unchanged") would PASS THE ROLLUP OBJECTS THROUGH UNCHANGED — it sets nothing on them. So neither the existing engine nor the proposed `map_each` can produce the rollups 1.8.0 shape. A third capability (a `map_each` variant that mutates object elements by setting a field, or array-wildcard `set`) is required.

---

## PART B — empirical demonstration (`/tmp/config-migration-probe/probe.ts`, run via `npx tsx`)

Fixture OLD-shape (1.7.0) `state_derivation`: `blocked_by:{relation_types:["task_depends_on_task","task_gated_by_item"]}` + one stock rollup WITHOUT `rollup_endpoint`. Transform sequence: prototyped `map_each` on `blocked_by.relation_types`, then the REAL engine (`migrationFnFor` → `applyOp`) applied `rename relation_types→relations` + `set schema_version=1.8.0`. Validation against a /tmp copy of `config.schema.json` hand-edited to the 1.8.0 shape (blocked_by.relations + rollups[].rollup_endpoint required) with a unique `$id` (so AJV compiles it fresh rather than reusing the bundled 1.7.0 validator cached by `$id`).

Observed output (verbatim, abridged to the load-bearing lines):

```
ASSERT blocked_by.relations + schema_version: PASS
ROLLUP set via real engine rejected: migration path '$.state_derivation.rollups[0].rollup_endpoint' contains array-element addressing ('[...]'); not supported in v1
map_each over rollups (object elements) changed them?: false
VALIDATE against 1.8.0 schema: PASS        (after HAND-setting rollup_endpoint)
=== idempotency re-run ===
map_each idempotent on already-object array: true
VALIDATE re-run against 1.8.0 schema: PASS
```

Migrated `blocked_by` (REAL engine produced the rename; map_each produced the elements):
```
"blocked_by": { "relations": [
  { "relation_type": "task_depends_on_task", "item_endpoint": "child" },
  { "relation_type": "task_gated_by_item",  "item_endpoint": "parent" } ] }
```
`schema_version` set to `1.8.0` by the real `set` op. ✔ matches intended 1.8.0 shape.

Results:
- B2/B3 (blocked_by): the REAL `rename` + `set` ops + the prototyped `map_each` produce the EXACT intended 1.8.0 `blocked_by.relations` and `schema_version`, and the result VALIDATES. ✔
- B (rollups): the design's transform CANNOT produce `rollup_endpoint`. The real engine's `set` with `[0]` addressing was REJECTED at runtime (the actual error string is pasted above). `map_each` over the rollups object array changed nothing (`changed them?: false`). The probe had to HAND-set `rollup_endpoint="child"` outside the design's vocabulary to reach a validating object. This is the A5/Part-C defect, empirically reproduced.
- B4 (idempotency): re-running `map_each` on the already-migrated object array left it byte-identical (`idempotent: true`) and it re-validated. The "elements already objects pass through unchanged" idempotency rule holds AS WRITTEN — but that same pass-through is exactly why it cannot set `rollup_endpoint` on object elements.

Note on the first probe run: VALIDATE initially FAILED because the /tmp schema copy still carried `$id: "pi-context://schemas/config"`; `validate` (`schema-validator.ts:112-123`) reuses the cached compiled validator when `$id` matches a pre-registered framework schema, so AJV validated against the BUNDLED 1.7.0 schema. Giving the /tmp copy a unique `$id` fixed it. This is itself a design-relevant hazard (Part C).

---

## PART C — design defects

### C1. The rollups transform in the worked example is unachievable with the proposed vocabulary. (CRITICAL)
The real 1.7.0→1.8.0 rollups change is ADDING `rollup_endpoint:"child"` to each existing rollup OBJECT. The design offers only `map_each` (specified for STRING arrays, with object elements passing through unchanged) and the existing `set` (which cannot address an array element — `[...]` rejected at `walkPath:97-101`). Empirically (Part B) neither sets the field: `set $.…rollups[0].rollup_endpoint` throws, and `map_each` over the object array is a no-op. The design as written produces a rollups array that FAILS 1.8.0 validation. Correction required: either (a) a `set_each {path, field, value}` primitive that sets a field on every object element of an array, or (b) extend `map_each` to a per-object field-merge mode, or (c) add array-wildcard path support (`$.…rollups[*].rollup_endpoint`) to `walkPath` + `set`. Option (c) is the broadest fix and also unblocks future array migrations generally.

### C2. The `map_each` spec conflates two endpoint values via a single `fallback`. (correctness)
The worked example needs DIFFERENT endpoints per relation: `task_depends_on_task → child`, `task_gated_by_item → parent`. The design's `map_each {path, table, fallback}` can express this ONLY by putting both full objects in `table` (which the probe did) — the `fallback` is a single scalar and cannot encode per-element endpoint logic. So `table` must enumerate every relation explicitly; `fallback` is a degenerate catch-all that, for any relation not in `table`, assigns a possibly-wrong endpoint. For the stock two-relation case this works, but the primitive does not derive endpoints — it requires the migration author to hand-supply the full mapping. Not a blocker, but the worked example only succeeds because `table` is exhaustive; the `fallback` branch is untested against real endpoint semantics.

### C3. The no-deadlock claim holds ONLY once `loadConfigForDir` itself calls `migrateConfigIfNeeded`. (ordering — confirmed sound conditionally)
Today `loadConfigForDir` validates RAW (`context.ts:579`) with no migration. If `config.schema.json`'s `version` is bumped (e.g. to 1.8.0 with `blocked_by.relations` required) and a substrate's `config.json` still declares the old `schema_version`/shape, EVERY config read fails AJV at `:579` — and because essentially everything funnels through `loadConfig`, the whole tool surface is bricked until migration runs. The design's "CLI rebuilt AFTER migration declared — no deadlock" is sound IFF the migration hook is added to `loadConfigForDir` BEFORE (or in the same change as) the schema bump, so the load path migrates-then-validates. Precisely: the no-deadlock guarantee requires `loadConfigForDir` to (1) read `schema_version` off the data, (2) compare to the config schema's `version`, (3) `runMigrations("config", dataVer, schemaVer, data)` via the project registry, (4) validate the MIGRATED data — all before returning. Until that load-path change ships, declaring a config migration does nothing on read and any schema bump is a hard breakage. The design's step 3 names this; the risk is purely sequencing — the schema bump must NOT land ahead of the load-path hook.

### C4. `validate`'s `$id`-keyed validator cache means a config-schema bump needs care. (integration hazard, surfaced empirically)
`schema-validator.ts:54-77` pre-registers `config` by `$id "pi-context://schemas/config"` at module init and `validate:115-123` reuses that cached compiled validator for ANY schema carrying that `$id`. The migrated-config validate must target the CURRENT bundled schema (which it will, since `loadConfigForDir` reads the bundled path) — so in-process this is fine. The hazard is for any migration-testing/dryRun path that loads an ALTERNATE config schema version by file: if it shares the `$id`, AJV silently validates against the cached version, not the file. The probe hit exactly this (Part B note). A config-migration `--dryRun` preview that validates against a "target" schema must not rely on `validateFromFile` resolving the on-disk file when the `$id` collides with the pre-registered one.

### C5. `map_each` must be added to FOUR places in lockstep, not one. (scope)
Adding the primitive touches: (a) the `TransformOp` union (`migrations-store.ts:64-68`), (b) the on-disk `oneOf` (`migrations.schema.json:71-120`), (c) the `applyOp` switch (`migration-registry-loader.ts:132-182`), and (d) the write-schema-migration Pi tool's presence/absence guard (referenced at `migrations.schema.json:46`). The design's "ONE new transform primitive" understates the surface: it is one primitive across four coordinated edits. Plus, `walkPath` would need the array-addressing extension for C1 option (c), which is currently a deliberate hard rejection (`:97-101`) the author chose to fail-closed.

---

## VERDICT

FEASIBLE WITH CORRECTIONS. Required corrections: (1) the worked example's rollups step is unachievable as written — add a primitive/path-capability that sets a field on each object element of an array (C1, CRITICAL); (2) recognize `schema_version` already exists and is required — design step 1 is a no-op, the real gap is migration-on-load (A1); (3) the load-path hook must land before/with any config-schema bump or the no-deadlock claim fails (C3); (4) `map_each` is one primitive across four lockstep edits, and `table` must enumerate per-relation endpoints (the `fallback` is a degenerate catch-all) (C2/C5). The core mechanism — declarative transform engine + name-keyed registry + chain walk for `schema:"config"` — is REAL and was empirically demonstrated to migrate `blocked_by` old→new and validate, idempotently (Part B).

File: /Users/david/Projects/workflowsPiExtension/analysis/2026-06-18-config-migration-design-feasibility.md
