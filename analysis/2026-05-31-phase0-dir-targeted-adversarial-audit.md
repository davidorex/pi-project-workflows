# Phase-0 dir-targeted block-api — adversarial audit

Date: 2026-05-31
Scope: Cycle-1/Phase-0 of the content-addressed-substrate-identity arc.
Mode: READ-ONLY. No source edits, no npm/build/test, no commit.
State audited: uncommitted working-tree edits (5 modified src files) + 2 untracked
new files (`block-api-fordir.test.ts`, `runtime-demo-dir-targeted-write.ts`). The
audit is pre-commit; "green" was verified against the actual source/diff, not a
performed claim.

Files:
- packages/pi-context/src/block-api.ts (M)
- packages/pi-context/src/context-dir.ts (M)
- packages/pi-context/src/schema-validator.ts (M)
- packages/pi-context/src/migration-registry-loader.ts (M)
- packages/pi-context/src/migrations-store.ts (M)
- packages/pi-context/src/block-api-fordir.test.ts (new)
- scripts/orchestrator/runtime-demo-dir-targeted-write.ts (new)

---

## Probe 1 — No ForDir body calls a cwd-bound primitive internally — CLEAN

Grepped every `resolveContextDir`/`cwd`-bound call across block-api.ts. All 11
occurrences of `resolveContextDir(cwd)` are inside the 11 cwd wrappers
(readBlock 352, writeBlock 1098, appendToBlock 1158, updateItemInBlock 1194,
upsertItemInBlock 1246, appendToNestedArray 1295, updateNestedArrayItem 1348,
removeFromBlock 1389, removeFromNestedArray 1437, nextId 1589) plus readBlockDir's
`tryResolveContextDir(cwd)` (1491). No `*ForDir` body references `cwd`,
`resolveContextDir`, `readBlock(cwd`, `writeBlock(cwd`, or `nextId(cwd`. ForDir
bodies route exclusively through `blockFilePathForDir`/`blockSchemaPathForDir`/
`existingBlockSchemaPathForDir`/`schemaPathForDir`/the typed-file primitives —
all dir-explicit. The core failure mode (a ForDir silently resolving cwd and
writing the active substrate) is absent.

## Probe 2 — cwd wrapper ≡ ForDir equivalence is real — CLEAN

Read every cwd wrapper body. Each is exactly `assertSubstrateName(blockName);`
followed by `return? fnForDir(resolveContextDir(cwd), …same args in order…);`
with no extra logic, no dropped/reordered args, no divergent stamping/locking/
migration. readBlockDir is the one shape variant: it takes `subdir` (not a block
name), correctly omits the assert, and uses the non-throwing `tryResolveContextDir`
→null→`[]` degrade preserved from the prior surface. ctx is threaded verbatim in
every wrapper.

## Probe 3 — Fix A class-completeness — CLEAN

`assertSubstrateName(blockName)` precedes `resolveContextDir(cwd)` in all 10
block-name cwd wrappers (assert lines 1097/1157/1193/1245/1294/1346/1388/1435/
1588 each immediately before the corresponding resolve) plus readBlock (351→352)
and schemaPath in context-dir.ts (395→396). No block-name cwd wrapper resolves
before asserting. No ForDir body LOST its internal assert: every ForDir taking a
block name reaches `assertSubstrateName` through `blockFilePathForDir`
(block-api.ts:49) or `schemaPathForDir` (context-dir.ts:385). The double-assert
(boundary guard + internal guard) is intentional and harmless, documented at
schemaPath. readBlockDir/readBlockDirForDir correctly carry no assert (subdir,
not block name).

## Probe 4 — Fix B cache coherence — CLEAN

ONE `registryCache` (migration-registry-loader.ts:67). Both readers
(`getProjectMigrationRegistryForDir` keys `path.resolve(substrateDir)` @281;
`getProjectMigrationRegistry` delegates via `resolveContextDir(cwd)` @260) and
both invalidators (`invalidateMigrationRegistryForDir` deletes
`path.resolve(substrateDir)` @298; `invalidateMigrationRegistry` delegates via
`tryResolveContextDir(cwd)` @316-318) converge on `path.resolve(<resolved
substrate dir>)`. Diff confirms the regression: pre-fix the reader/invalidate cwd
forms keyed `path.resolve(cwd)` while the NEW block-writer reader keys the
resolved dir — divergent whenever cwd ≠ substrateDir. Post-fix all four agree.
Adversarial divergence construction: store mutation helpers (migrations-store.ts
179/204/226) operate on `cwd`; they write via `writeMigrationsFile(cwd)` →
`migrationsPath(cwd)` → `resolveContextDir(cwd)` and the block writer reads via
`getProjectMigrationRegistryForDir(resolveContextDir(cwd))` for the active dir —
same key. No path reads under one key while invalidation deletes under another.
The `tryResolveContextDir` null-guard cannot silently skip a needed invalidation
in a real write flow: every store helper first calls `loadMigrationsFile(cwd)` /
`writeMigrationsFile(cwd)`, both of which hard-throw `BootstrapNotFoundError` on
an absent pointer — so by the time `invalidateMigrationRegistry(cwd)` runs the
pointer is provably present and `tryResolveContextDir` returns non-null. The
no-op branch is reachable only when no write occurred.

## Probe 5 — writeBlockForDir migrates against the TARGET dir — CLEAN

writeBlockForDir (block-api.ts:1068-1093) resolves schema via
`existingBlockSchemaPathForDir(substrateDir, blockName)` (1070), builds the
registry via `getProjectMigrationRegistryForDir(substrateDir)` (1088), and
validates via `validateBlockWithMigrationForDir(substrateDir, …)` (1089). The
latter (schema-validator.ts:204-241) resolves the schema path through
`schemaPathForDirHelper(substrateDir, schemaName)` (210) — no `cwd`, no
`resolveContextDir`, no active-pointer read anywhere in the chain. readBlockForDir's
read-time migration hook (327-328) is likewise dir-keyed. Load-bearing migration
correctness for Cycle H holds.

## Probe 6 — Export completeness — CLEAN

All 11 block-level ForDir variants are `export function` exactly once each
(readBlockForDir, readBlockDirForDir, writeBlockForDir, appendToBlockForDir,
updateItemInBlockForDir, upsertItemInBlockForDir, appendToNestedArrayForDir,
updateNestedArrayItemForDir, removeFromBlockForDir, removeFromNestedArrayForDir,
nextIdForDir). package.json declares the `./block-api` subpath
(types+default → dist). A Cycle-F/H consumer can import every variant via
`@davidorex/pi-context/block-api`. The runtime demo already imports
appendToBlockForDir/nextIdForDir/readBlockForDir/writeBlockForDir via that subpath.

## Probe 7 — Test honesty — CLEAN

Equivalence tests (block-api-fordir.test.ts:181-310): each compares
`fs.readFileSync(blockPath(a), "utf-8")` against `fs.readFileSync(blockPath(b),
"utf-8")` — real on-disk byte comparison across two independent tmp projects,
one driven by the cwd form, the other by `fnForDir(resolveContextDir(cwd))`. Not
trivially equal: distinct dirs, distinct invocations, no swallowed errors. No
ctx passed → no timestamp non-determinism to mask a difference. Result objects
(upsert/remove/nested-remove) additionally `deepStrictEqual`'d.

Isolation test (315-363): asserts `.subB` got the write (length 1, id FGAP-001)
AND `.subA` byte-identical to a pre-write snapshot (348) AND `.subA` parses empty
(350) AND `path.basename(resolveContextDir)` is still `.subA` before+after (336,
353) AND the cwd-form write still lands in `.subA` while `.subB` is unaffected
(356-362). Comprehensive — not just "did .subB get the write".

Migration test (368-470): the target-vs-active distinction is genuinely
load-bearing. Success case sets active `.subA` schema to v3.0.0 with NO migration
and target `.subB` to v2.0.0 WITH a v1→v2 identity migration; if the code read the
active dir it would compare data v1 vs schema v3 with no migration and throw —
instead it succeeds against `.subB` (422-424) and `.subA/thing.json` never lands
(426). Throw case inverts it: active `.subA` HAS a v1→v2 migration, target `.subB`
has none; a wrong active-dir read would wrongly succeed — instead it throws
matching `/MigrationRegistry|migration/i` (the real `runMigrations`→`resolve`
message "MigrationRegistry: no migrations registered…", confirmed in
schema-migrations.ts:101-102) and `.subB/thing.json` does not land (468). The
regex matches the genuine no-migration throw, not an unrelated error.

## Probe 8 — Hidden regression sweep — CLEAN

- Lock acquisition: `withBlockLock` keys on the absolute file path; ForDir forms
  pass `blockFilePathForDir(substrateDir, …)` which equals the old
  `blockFilePath(cwd, …)` absolute path when substrateDir is the resolved active
  dir. Lock identity preserved.
- schemaCache: keyed on `path.resolve(schemaPath)` (absolute), independent of
  cwd-vs-dir entry — identical key on the active path.
- DispatchContext stamping order: stamping lives in the shared typed-file
  primitives; cwd wrappers pass ctx through unchanged. Order unchanged.
- FGAP-018 created_* carry-forward: lives in `upsertItemInTypedFile`
  (block-api.ts:793-812), shared by both cwd and ForDir forms.
- Multi-match stderr warnings: in shared typed-file bodies; identical text,
  identical trigger.
- readBlockDir null→[] guard: cwd form uses `tryResolveContextDir`→null→`[]`
  (1491-1493); ForDir returns `[]` on missing dir (1467-1470). Both preserved.

No behavior on the active path could differ from the pre-Phase-0 surface; the cwd
forms are byte-faithful thin wrappers.

---

## Verdict summary

| Probe | Verdict |
|---|---|
| 1 No cwd-bound call in ForDir | CLEAN |
| 2 cwd ≡ ForDir equivalence | CLEAN |
| 3 Fix A class-completeness | CLEAN |
| 4 Fix B cache coherence | CLEAN |
| 5 writeBlockForDir targets dir | CLEAN |
| 6 Export completeness | CLEAN |
| 7 Test honesty | CLEAN |
| 8 Hidden regression sweep | CLEAN |

Total FLAGs: 0 (none at any severity).

Confidence basis: the audit read full function bodies for every cwd wrapper and
every ForDir variant (not just signatures), grepped to enumerate all 11
resolveContextDir uses and confirm none leak into ForDir bodies, traced all four
cache-key sites to one `path.resolve(resolvedDir)` convergence, read both
migration tests against the real throw message, and verified both fixes against
the working-tree diff (not just the final state). The two regressions described
(A: assert-before-resolve ordering; B: registry cache-key unification on the
resolved dir) are present and correct in source, and their guarding tests
genuinely distinguish the failure mode they target.
