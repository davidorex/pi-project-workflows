# Cycle-4 / Phase-D (remainder) adversarial audit — substrate registry + aliases + SoT-drift invariant + adopt-path substrate_id wiring

Date: 2026-05-31
Auditor: fresh-context adversarial agent (read-only; no source edits, no build/test/commit)
Scope: `context-registry.ts`, `schemas/context-registry.schema.json` + `FRAMEWORK_SCHEMA_NAMES` entry, SoT-drift invariant in `validateContext` (context-sdk.ts), `adoptConception` mint+register wiring (context.ts), repo-root `.pi-context-registry.json` seed.
Method: source reading + live runtime probes against built `dist/` (not mocks). Default-to-FLAG on uncertainty.

## Verdict summary

ALL NINE PROBES CLEAN. Zero FLAGs (no critical / major / minor). The "green" is real: every claimed property was independently reproduced via live invocation, including the drift matrix, the cwd-form false-positive fix, registry write atomicity + schema rejection, idempotent adopt wiring, and scope containment.

| # | Probe | Verdict |
|---|-------|---------|
| 1 | Drift comparison absoluteness-safe | CLEAN |
| 2 | Drift severity matrix exactly right | CLEAN |
| 3 | Registry write atomic + schema-validated | CLEAN |
| 4 | `resolveSubstrateDir`/`resolveAlias` null-on-miss never throw | CLEAN |
| 5 | `registerSubstrate` idempotent + upsert | CLEAN |
| 6 | `adoptConception` idempotent + side-effect-bounded | CLEAN |
| 7 | Schema pre-registration constrains shape | CLEAN |
| 8 | No-regression + scope | CLEAN |
| 9 | API shape matches F2 resolver future call | CLEAN |

---

## Probe 1 — Drift comparison is absoluteness-safe — CLEAN

context-sdk.ts:1275 `const registeredAbs = path.resolve(cwd, entry.dir);` and :1280 `const activeAbs = path.resolve(resolveContextDir(cwd));` — both sides are `path.resolve`'d. The fix is present.

Adversarial cwd forms (live, `/tmp/probe-drift.mjs`, all returning 0 drift issues against a real adopted substrate):
- trailing slash (`tmp+'/'`) → `cwd_trailingSlash true`
- relative `.` after `process.chdir(tmp)` → `cwd_dotSlash_relativeChdir true` (this is the exact false-positive class the fix targets)
- symlinked cwd (`fs.symlinkSync(tmp, link)`) → `cwd_symlink true`
- symlinked *contextDir* (`.context` is a symlink to a real target dir) → `symlinkedContextDir_drift 0` (`/tmp/probe-edge.mjs`). Lexical `path.resolve` on BOTH sides builds the same path before any realpath, so a symlinked contextDir does not false-drift. No `realpath` divergence reachable because neither side calls `fs.realpathSync`.

No false-positive or false-negative reproduced. `resolveContextDir` (context-dir.ts:104) is byte-identical to the Cycle-3 commit: `git diff 5d57465 -- packages/pi-context/src/context-dir.ts` is empty; `git status` shows context-dir.ts unmodified. NOT changed by Cycle 4.

## Probe 2 — Drift severity matrix exactly right — CLEAN

Reading (context-sdk.ts:1261-1292) + live exercise (`/tmp/probe-drift.mjs`):
- substrate_id present + matching entry → no issue: `MATCHING_clean true`
- present + entry dir mismatch → ERROR `substrate_id_registry_mismatch`: `MISMATCH_error true` (exactly one issue, correct code)
- present + entry absent (registry file exists, key dropped) → ERROR `substrate_id_unregistered`: `UNREGISTERED_noEntry_error true`
- present + NO registry file at all → ERROR `substrate_id_unregistered`: `NOREGFILE_error true` (`registry?.substrates?.[id]` short-circuits to undefined → `!entry` branch)
- substrate_id ABSENT → SKIP, no issue, no throw: `ABSENT_skip_noDrift true`. The code reads `config.substrate_id` directly (:1262) rather than via `substrateIdFor` (which throws on absence) — the comment at :1258-1260 documents this, and the live un-migrated-config case confirms no throw. This is the no-regression property and it holds.

Both branches push `severity: "error"`. Matrix is exactly as specified.

## Probe 3 — Registry write is atomic + schema-validated — CLEAN

`writeRegistry` (context-registry.ts:157) → `writeTypedFile(path, schemaPath, file, ctx, label)` → validates via `validateFromFile` THEN tmp+rename (block-api.ts:884-907). Confirmed live (`/tmp/probe-registry.mjs`):
- bad substrate_id key (`bad-key`) → rejected on write: `badKeyWrite_threw "...: /substrates: must mat[ch pattern]"`
- missing `aliases` → rejected: `missingAliasesWrite_threw`
- extra property → rejected (`additionalProperties:false`): `extraPropWrite_threw`
- prior file byte-identical after a failed write: `priorFileIntactAfterFailedWrite true` (validation throws before the tmp+rename runs, so nothing lands)
- malformed file already on disk → rejected on LOAD: `loadMalformed_threw` (loadRegistry calls `validateFromFile` at :142)
- `loadRegistry` returns null (not throw) when file absent: `loadAbsent null` (existsSync guard at :121)
- read-after-write consistency: `readAfterWrite ".gamma"` and a 5-iteration rapid same-process write→read loop (`/tmp/probe-edge.mjs`) → `rapidWriteReadConsistent true`. The proactive `invalidateRegistry(cwd)` after every write (:159) defeats the 1s mtime-granularity stale-cache risk that an mtime-only check would have. Mirrors migrations-store discipline correctly.

## Probe 4 — Resolvers return null on miss, never throw — CLEAN

`/tmp/probe-registry.mjs`:
- absent registry file: `resolveDirAbsent null`, `resolveAliasAbsent null` (both early-return on `reg === null`, :216 / :231)
- registered-but-unknown id: `resolveDirMissUnknown null`
- unknown alias: `resolveAliasMiss null`
- hits return the stored value: `resolveDirHit ".alpha-renamed"`, `resolveAliasHit "sub-2222222222222222"`

No throw path on a clean miss. Contract the F2 resolver depends on is satisfied.

## Probe 5 — `registerSubstrate` idempotent + upsert — CLEAN

`/tmp/probe-registry.mjs`:
- same (id,dir) twice → one entry: `afterRegIdentical_count 1`
- re-register same id with NEW dir (the rename case) → in-place dir update, still one entry: `afterUpsert_count 2` (across two distinct ids), `afterUpsert_dir ".alpha-renamed"`
- other substrate's entry untouched by the upsert: `otherIntact {"dir":".beta","aliases":["b1"]}`

Load-or-empty → clone → `next.substrates[id] = {dir,aliases}` → write (:201-204) is a clean keyed upsert; other keys are preserved by the deep-clone. No clobber.

## Probe 6 — `adoptConception` wiring idempotent + side-effect-bounded — CLEAN

`/tmp/probe-drift.mjs` + `/tmp/probe-scope2.mjs`:
- fresh accept-all mints a valid id: `mint_matches_pattern true` (`^sub-[0-9a-f]{16}$`)
- second accept-all does NOT re-mint, NOT a duplicate entry: `secondAdopt_adopted false`, `secondAdopt_idStable true`, `secondAdopt_registryUnchanged true`. Mechanism: the existing-config branch returns early at context.ts:519-527 BEFORE the mint block, so a second adopt never reaches mint/register. An already-adopted substrate is correctly a no-op for identity.
- mint guard fires only when substrate_id absent: context.ts:543 `if (typeof conception.substrate_id !== "string" || ...length === 0)`. The packaged conception ships no substrate_id (`conc_has_substrate_id false`), so a fresh adopt always mints.
- config-mutation scope: written config vs `samples/conception.json` diff → `addedKeys ["root","substrate_id"]`, `removedKeys []`, `changedExistingKeys(excl root) []`. `root` is pre-existing Cycle-4-independent behavior (DEC-0041, set at :531); the ONLY Cycle-4 addition is `substrate_id`. No other config field mutated.

## Probe 7 — Schema pre-registration constrains shape — CLEAN

- `"context-registry"` is in `FRAMEWORK_SCHEMA_NAMES` (schema-validator.ts:39).
- `schemas/context-registry.schema.json:3` `"$id": "pi-context://schemas/context-registry"`.
- module-init loop (schema-validator.ts:54-77) globs `${name}.schema.json`, throws if missing, `ajv.addSchema`s it.
- the seeded repo-root `.pi-context-registry.json` validates against it (probe 8).
- constraint strength proven by REJECTIONS in probe 3: `propertyNames.pattern ^sub-[0-9a-f]{16}$` rejects `bad-key`/`BADKEY`; `RegistryEntry.required ["dir","aliases"]` rejects missing aliases; `additionalProperties:false` (both at top level :9 and on RegistryEntry :30) rejects extra props. A garbage registry is rejected on both write and load.

## Probe 8 — No-regression + scope — CLEAN

- `git status` working tree exactly the planned set: NEW `context-registry.ts`, `context-registry.schema.json`, `context-registry.test.ts`, `runtime-demo-context-registry.ts`, repo-root `.pi-context-registry.json`; MODIFIED `package.json`, `accept-all.test.ts`, `context-sdk.test.ts`, `context-sdk.ts`, `context.ts`, `index.ts`, `schema-validator.ts`. `git diff --stat 5d57465` = +222/-2 across 7 tracked files. No other-substrate / resolver / cross-edge code touched (Cycles 8/10 untouched).
- seeded repo registry correct: one entry, `sub-2668a102413f6aea → .context-jit-spec-v2`, aliases `[]`. `.project`/`.context` NOT registered.
- active pointer (`.pi-context.json`) names `.context-jit-spec-v2` — matches the seeded entry, so live `validateContext('.')` → `driftIssueCount 0`. The 56 total issues are pre-existing substrate-content issues unrelated to Cycle 4 (substrate_id drift count is the Cycle-4-relevant metric, and it is 0).
- The existing runtime demo `runtime-demo-context-registry.ts` runs to `ALL PASS` exit 0.

## Probe 9 — API shape matches F2 resolver future call — CLEAN

Exported signatures (context-registry.ts, re-exported index.ts:2992-2999, subpath `./context-registry` in package.json:48):
- `resolveSubstrateDir(cwd: string, substrate_id: string): string | null` (:214)
- `resolveAlias(cwd: string, alias: string): string | null` (:229)

Match the plan's stated F2 calls `resolveSubstrateDir(cwd, substrate_id)` / `resolveAlias(cwd, alias)`. Cycle 8 is not blocked by a signature mismatch. Subpath export `@davidorex/pi-context/context-registry` is declared, so the separate Cycle-8 consumer can import it.

---

## Out-of-scope items a reader might expect

- Alias uniqueness is intentionally NOT enforced this cycle (context-registry.ts:225-227 first-match-wins, documented). Not a defect — Cycle 4 ships empty aliases; Phase-H populates `project:`.
- `ctx?: DispatchContext` stamping is a structural no-op because the registry schema declares no envelope author fields (context-registry.ts:152-155). Accepted for call-site parity; verified harmless (writeTypedFile only stamps when `declaredAuthorFieldsForEnvelope` is non-empty, block-api.ts:877-882).

## Bottom line

Green is real. The relative-cwd false-positive is genuinely fixed (both sides `path.resolve`'d) and resists trailing-slash / `./` / symlinked-cwd / symlinked-contextDir variants. The drift matrix, registry atomicity + schema rejection, resolver null-on-miss, register upsert idempotency, adopt mint-once + bounded config mutation, schema pre-registration, scope containment, and F2 API shape all reproduced under live invocation. No FLAGs.
