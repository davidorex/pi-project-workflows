# Config-schema-evolution failure — gap decomposition

Date: 2026-06-19
Method: read of real `packages/pi-context/src` + `schemas/` (no mutation); a `/tmp` repro exercising the REAL `loadConfigForDir` / `amendConfigEntryForDir` against a corrupt-config fixture (`/tmp/config-gap-investigation/repro2.ts`); prior-art search of the active `.context` substrate via `pi-context` read ops + grep of `analysis/*.md`. No live substrate, src, schemas, samples, or pointer touched; no build run.

This is the gap-explore investigation that PRECEDES filing. It establishes the count of INDEPENDENT gaps (criterion: distinct mechanism + distinct fix + non-subsumption proven), the class determination, and prior-art coverage. It files nothing.

## The incident (restated)

A config-schema bump to `state_derivation.blocked_by` shape made the live `config.json` fail validation against the rebuilt CLI: exit 5, unrecoverable. The decomposition asks whether that is 1, 2, or 3 independent gaps.

---

## PART 1 — confirm each mechanism in code (file:line)

### #1 — No load-time config migration. CONFIRMED.

`loadConfigForDir` (`packages/pi-context/src/context.ts:564-581`) reads + JSON-parses `config.json`, then at `:579`:

```
validateFromFile(bundledSchemaPath("config"), data, `config.json (${p})`);
```

This is the NON-migrating validator. It does not read `data.schema_version`, does not compare it to the bundled config schema's `version`, and does not call `runMigrations`. `loadConfig` (`:549-552`) is a thin pointer-resolving wrapper over it; every config read funnels through this one path.

Contrast: block data HAS a migration-aware load. `validateBlockWithMigrationForDir` (`schema-validator.ts:205-242`) reads `data.schema_version` (`:226-229`), compares to `schema.version` (`:225,232`), and on a delta runs `runMigrations(registry, schemaName, blockVersion, schemaVersion, data)` (`:238`) BEFORE validating. Config has no equivalent. The generic migration machinery is schema-name-keyed and not block-special-cased — `createRegistry`/`resolve`/`runMigrations` (`schema-migrations.ts:76-159`) key on `schemaName`, and `"config"` is cited as a valid id in the doc comment (`schema-migrations.ts:49`) — so the mechanism CAN serve config; `loadConfigForDir` simply never invokes it.

The config envelope is already present: `schemas/config.schema.json:8` requires `["schema_version", "block_kinds"]`; `:11-14` declares `schema_version` (`pattern ^\d+\.\d+\.\d+$`); `:4` carries `"version": "1.7.0"`. So the missing piece is migration-ON-LOAD, not the version field.

### #2 — Validate-before-repair deadlock. CONFIRMED.

`amendConfigEntryForDir` (`context.ts:1221-1392`) step (2) at `:1250`:

```
const config = loadConfigForDir(substrateDir);
if (!config) { throw new Error("amendConfigEntry: no config.json"); }
```

The FIRST substantive act of the repair surface is `loadConfigForDir` — which validates (`:579`). An already-invalid config therefore throws at load, before any mutation/locate/SHAPE-validate logic (`:1261-1382`) runs. The only options surface is `{ dryRun?: boolean }` (`:1228`) — there is no `force` / `repair` / `skipValidation` flag (grep of `context.ts` + `ops-registry.ts` for those terms returns no config-repair path).

The only other config-ORIGINATING op cannot repair either: `adoptConception` (accept-all, `context.ts:986-1003`) never-clobbers a populated config — `:995` `if (existing && !isSkeletonConfig(existing)) return { adopted: false, ... }`. An invalid populated config is "existing" and non-skeleton, so accept-all declines. Net: an invalid `config.json` is unrepairable through every CLI write surface.

### #3 — No additive / expand-contract discipline. CONFIRMED.

The config schema root is closed: `schemas/config.schema.json:9` `"additionalProperties": false` (and `:36,:50,:73,...` close the nested objects). A schema change that REPLACES a key (the incident: `blocked_by.relation_types` → a new `blocked_by.relations` shape) under a closed object makes every prior-shape config instantly invalid. Nothing in the authoring/build surface flags a non-additive (breaking) config-schema diff:

- `mergeCatalogRegistries` (`context.ts:1117-1153`) is additive-only at the DATA layer and PURE (no migration, no breaking-diff check); it preserves an existing `state_derivation` verbatim (`:1148-1151`) — it does not police schema shape changes.
- There is no `scripts/`-level catalog⊇/diff gate for the config SCHEMA shape. (`scripts/parity-check.ts` is the code-surface trio precedent cited by FGAP-010/FGAP-094, not a config-schema-shape additivity gate.)

The fix is authoring/build-time (a breaking-diff detector / expand-contract convention on config-schema edits), not a runtime load behavior.

---

## PART 2 — independence tests (pairwise)

### #1 vs #2 — does load-time migration make #2's trigger vanish?

PARTIALLY, for the version-gap case ONLY. The incident's trigger is a VERSION DELTA (config schema bumped; on-disk config still old shape + old `schema_version`). If `loadConfigForDir` migrates-then-validates (#1's fix), a version-gap config is carried forward in-memory and never seen invalid — the deadlock never arises for that case. This is exactly what the existing feasibility analysis names: `2026-06-18-config-migration-design-feasibility.md` §C3 — "the no-deadlock claim holds ONLY once `loadConfigForDir` itself calls `migrateConfigIfNeeded`."

But #2 has an INDEPENDENT residual that #1's fix does NOT reach: a config invalid for a NON-migration reason. Migration is gated on a version DELTA (`schema-validator.ts:232` `schemaVersion !== blockVersion`; `runMigrations` is a no-op when versions match). A config whose `schema_version` EQUALS the current schema but whose body violates the schema (corruption, a bad hand-edit, or a schema change with NO registered migration) is never migrated — yet still fails load-validate, and is still unrepairable.

REPRO (`/tmp/config-gap-investigation/repro2.ts`, run via `npx tsx` against repo `src/`, no live substrate):

Fixture: a `/tmp` substrate `config.json` = `{ schema_version: "1.7.0" (== bundled current), block_kinds: [], __corruption__: "..." }` — an extra root key under the root `additionalProperties:false`. `schema_version` is EQUAL to current, so no migration applies even if one were registered.

Observed output (verbatim):
```
bundled config schema version: 1.7.0
wrote corrupt config (schema_version == current, extra root key under additionalProperties:false)
LOAD: THROWS -> Validation failed for config.json (/tmp/config-gap-investigation/sub-context/config.json): : must NOT have additional properties
AMEND(repair): THROWS -> Validation failed for config.json (/tmp/config-gap-investigation/sub-context/config.json): : must NOT have additional properties
amendConfigEntryForDir opts surface: { dryRun?: boolean } only — no force/skipValidate flag
```

Both `loadConfigForDir` AND the repair path `amendConfigEntryForDir` throw at load-validate; no CLI path recovers it (accept-all declines per `:995`). #1's load-time migration cannot reach this — there is no version delta to migrate across.

VERDICT: #2 STANDS ALONE. It is not subsumed by #1. #1 fixes the version-gap subset of the deadlock; #2's residual (no-version-delta invalidity → no repair surface) survives #1 fully. The fixes differ: #1 = migrate-on-load; #2 = a load-validate-bypassing repair surface (force/repair mode, or routing repair through accept-all-style replacement that does not pre-validate the existing file).

### #1 vs #3 — independent.

#1 is runtime (load behavior). #3 is authoring/build-time (preventing/flagging a breaking config-schema diff before it ships). Even with #1's migration on load, a breaking schema change with NO registered migration still bricks load (the migration registry must be authored to match the bump — #1 provides the mechanism, not the guarantee that an author supplies the edge). #3 is the discipline that the bump is either additive or accompanied by a migration. Distinct mechanism, distinct fix, neither resolves the other.

### #2 vs #3 — independent.

#2 is a runtime recovery surface (repair an already-invalid config). #3 is a prevention/authoring discipline (don't ship a breaking config-schema diff). #3 reduces how OFTEN #2 is needed but never removes the need: corruption and bad hand-edits are #2 triggers that no authoring discipline prevents (the repro's corruption is not a schema change at all). Distinct mechanism, distinct fix.

---

## PART 3 — decomposition (the count)

THREE independent gaps. Criterion applied per pair: distinct mechanism + distinct fix + non-subsumption (proven by the /tmp repro for the load-bearing #1⊅#2 case).

| Gap | Mechanism (file:line) | Fix surface | Independence |
|---|---|---|---|
| #1 No load-time config migration | `loadConfigForDir` validates raw, no `schema_version`→migration hook (`context.ts:579`); block path has it (`schema-validator.ts:205-242`) | RUNTIME: add migrate-then-validate to `loadConfigForDir` (the existing schema-name-keyed registry already supports `"config"`) | Fixes the version-gap deadlock subset; leaves #2's no-delta residual (repro) + #3's breaking-diff prevention |
| #2 Validate-before-repair deadlock | `amendConfigEntryForDir` step (2) loads (→validates) before mutating (`context.ts:1250`); no force/skip flag (`:1228`); accept-all never-clobbers (`:995`) | RUNTIME: a load-validate-bypassing repair path (force/repair mode) | Independent residual REPRODUCED: schema_version==current + invalid body is unmigratable AND unrepairable; #1 cannot reach it |
| #3 No additive / expand-contract discipline | config root `additionalProperties:false` (`config.schema.json:9`); no breaking-diff gate on config-schema edits (no `scripts/` config-schema-shape parity check; `mergeCatalogRegistries` is additive-data-only, `context.ts:1117-1153`) | AUTHORING/BUILD: breaking-config-schema-diff detector + expand-contract convention | Breaking changes remain possible with #1+#2 fixed; its fix is not runtime |

Do not collapse into one umbrella: the three fixes live in three different surfaces (load path / repair op / build-time author gate) and none subsumes another. Do not split further: each is one mechanism.

---

## PART 4 — class determination (gap-explore-surfaces-class)

The set is an INSTANCE of a broader class for #1, but #2 and #3 are config-specific siblings.

- #1 is squarely an instance of a **"schema-evolution safety spanning block + config"** class: block schemas ALREADY migrate (`validateBlockWithMigrationForDir`); config does not. The asymmetry is the class — the migration mechanism is schema-name-generic (`schema-migrations.ts` keys on `schemaName`, `"config"` is a valid id) but only block load-paths invoke it. #1 should be framed as "extend the existing block-schema-evolution-safety mechanism to the config schema," not as a net-new config-only capability. The class is "every versioned schema that participates in load-validate must have a migrate-on-load hook"; config is the one that lacks it.
- #2 is config-specific in its acuteness: a block file failing validation does not brick the whole tool surface, whereas config does (everything funnels through `loadConfig`). The "validate-before-repair" shape COULD generalize (any validated-on-load artifact with no repair-bypass), but the bricking blast-radius and the absent-force-flag are config-specific here. Frame #2 as config-specific with a noted generalization, not forced into the block+config umbrella.
- #3 is config-specific: it is the authoring discipline for config-SCHEMA edits under `additionalProperties:false`. Block schemas have the same closed-object exposure, so an expand-contract convention is arguably class-wide, but the incident and the missing gate are config-schema-shaped.

Recommended framing: file #1 at the CLASS level (schema-evolution safety: extend migrate-on-load to config), with #2 and #3 as distinct config-specific gaps that the class fix does not cover (proven independent above).

---

## PART 5 — prior-art coverage (mandatory search)

Searched `.context` via `pi-context read-block-page`/`read-block-item` (framework-gaps, tasks) + grep of `analysis/*.md`. Per-gap verdict:

### #1 — load-time config migration: NOT FILED as a substrate gap; SUBSTANTIAL unfiled analysis exists.

No framework-gap/task in `.context` covers config migration-on-load. BUT three `analysis/` docs (2026-06-18) already investigate and DESIGN exactly #1:
- `analysis/2026-06-18-config-migration-design-feasibility.md` — empirical feasibility (REAL transform engine + validator probe); confirms `loadConfigForDir` is the single funnel for the hook; §C3 analyzes the deadlock-sequencing (overlaps #2's version-gap subset); names the `map_each` primitive gap + the rollups-transform CRITICAL defect.
- `analysis/2026-06-18-config-migration-proposal-validation.md`
- `analysis/2026-06-18-config-migration-corrected-implementation-steps.md` — corrected end-to-end transform sequence, validated.

These are implementation-spec / feasibility, NOT yet a filed gap or task. Canonical action: file #1 as the gap and RELATE it to these analysis docs (research_informs_item / findings_document) rather than re-deriving — the design intel already exists.

### #2 — validate-before-repair deadlock: GENUINELY UNFILED.

No item covers the repair-surface deadlock. Adjacent-but-distinct: FGAP-029 (closed) / FGAP-046 (closed) / FGAP-060 (closed) concern `install --update` block-data / schema-customization / catalog-config-additions — none is the `amendConfigEntry` pre-validate-blocks-repair shape. `2026-06-18-...feasibility.md` §C3 touches the deadlock but only for the migration (version-gap) case, which #1 resolves; the no-delta residual proven here is uncovered.

### #3 — additive / expand-contract discipline: GENUINELY UNFILED for config-schema shape.

FGAP-094 (`identified`, P2) is the closest and is DISTINCT: it covers catalog↔config relation_types VOCABULARY drift (the packaged catalog `relation_types[]` is a strict subset of live config; 6 live-only) with a proposed build-time catalog⊇consumed-vocabulary parity gate (TASK-066 back-port, TASK-067 the gate). That is a vocabulary-completeness axis, NOT breaking-CHANGE discipline on schema KEYS under `additionalProperties:false`. FGAP-010 is cited as the `scripts/parity-check.ts` precedent for the code-surface trio. No item flags non-additive config-SCHEMA shape changes. Canonical action: file #3 fresh; relate to FGAP-094/FGAP-010 as the parity-gate precedent family (gap_relates_to_gap), do not refile under them.

### Adjacent schema-versioning/migration items (filed)

- TASK-057 (pending) — read-schema-history op + applied-at stamp + baseline lineage (G2): a read-only INSPECTION surface over schema migration history. Does NOT deliver config migrate-on-load or repair.
- TASK-058 (pending) — walk-migration-chain read-only op (the git-bisect analog, G4): read-only chain INSPECTION. Does NOT deliver config migrate-on-load or repair.
- FGAP-033 (identified) — pre-identity substrate re-sync unsupported; FGAP-046/060/029 (closed) — `install --update` block-data / schema-customization / catalog-additions. All adjacent, none covering #1/#2/#3.

---

## VERDICT

THREE independent gaps. #1 No load-time config migration (RUNTIME; class-level — extend block-schema-evolution-safety to config; design already in three 2026-06-18 analysis docs, relate-not-refile). #2 Validate-before-repair deadlock (RUNTIME; independent no-version-delta residual REPRODUCED in `/tmp` — unmigratable AND unrepairable; genuinely unfiled). #3 No additive/expand-contract discipline (AUTHORING/BUILD-time; genuinely unfiled; distinct from FGAP-094's vocabulary-drift axis — relate to FGAP-094/FGAP-010 parity-gate family). Criterion: distinct mechanism + distinct fix + non-subsumption proven by the #1⊅#2 repro.
