# Adversarial Audit: `.context` Fold-In + `verifyDupe` Pointer-Restore Fix

**Auditor role:** fresh-context adversarial. Did not implement; verified with own evidence (git / read / tsx read-only / validateContext), not commit messages.
**Range:** `b874e19..HEAD`, HEAD `902d415`, branch `context-jit-spec-v2`.
**Date:** 2026-06-02.
**Mutation footprint:** none. `.pi-context.json` md5 `c4ca5f4db66a4066b59d73bad6adc370` before and after every pointer-switch; working tree clean at close. No `.project/` / `.pi/` access.

---

## Per-claim verdicts

### Claim 1 — `.context` is genuinely canonical, not masked — **CONFIRMED**

- `config.substrate_id` = `sub-394aad2658e4d9a7` (read `.context/config.json`); registry (`.pi-context-registry.json`) maps `sub-394aad2658e4d9a7` → dir `.context`, aliases `[]`.
- **17 schemas**, ALL declare the 3 identity fields (`oid`/`content_hash`/`content_parent`) directly on the item-array `items.properties` (tsx: located the array property per schema, checked membership — 0 schemas without them on item props).
- **0 nested id-bearing arrays**: `findNestedIdBearingArrays` (from `@davidorex/pi-context/schema-write`) over all 17 schemas returned `[]` for each.
- **8 `session-notes` items**, each carries `oid`+`content_hash` (0 missing). All 8 `content_hash` values name an object file present in `.context/objects/` (8 files, exact filename match). **Integrity re-derived** via canonical `computeContentHash` over each object's content: 8/8 recomputed hash === declared `content_hash` (OK:8 BAD:0). Object store conserved: 8 on disk, 8 referenced, **0 orphans, 0 dangling**.
- **37 `session_touches_item` edges**: relation_type distribution is `{session_touches_item:37}` (no other types). All 37 children are structured `{kind:"item", substrate_id, oid, refname}` — **0 bare strings**. All 37 `substrate_id` = `sub-0c813fd84348d4c2`. Each child `oid` byte-matches that `refname`'s item oid in `.project-migrate` (built id→oid map over 588 `.project-migrate` items): **MATCH 37 / MISMATCH 0 / NOTFOUND 0**. Parents are ALSO structured (local endpoints): all 37 parent oids byte-match the local session-notes items, 0 carry a foreign substrate_id.
- **`validateContext` against `.context`** (pointer-switched in tsx, restored verbatim): `status: "clean"`, **0 issues, 0 blocking**.
- **Count conservation (probe)**: pre-fold-in `.context` (`git show 4be8ba9`) had 8 session items (no oid) and 37 sti edges, all bare-string children (`"FGAP-151"`). Post: same 8 items now backfilled, same 37 edges now structured. Child refname multiset byte-identical pre→post; parent refname multiset byte-identical. Nothing silently skipped or substituted.

  Commands: `computeContentHash` recompute loop; `findNestedIdBearingArrays` loop; edge oid cross-map vs `.project-migrate`; `validateContext(".")` under switched pointer; `git show 4be8ba9:.context/{session-notes,relations}.json` multiset diff.

### Claim 2 — Blast radius — **CONFIRMED**

`git diff --name-only b874e19..HEAD` top-level dirs: `.context`, `.pi-context-registry.json`, `packages`, `scripts` only. Explicit grep for `^\.project/`, `^\.project-migrate/`, `^\.context-jit-spec-v2/` in the arc diff → **NONE**. Code touched: `packages/pi-context/src/migrate-content-addressed.ts` + its `.test.ts`, `scripts/orchestrator/foldin-context.ts` + `canonicalize-substrate.ts`. Data touched: `.context/*` + `.pi-context-registry.json`. Active pointer `.pi-context.json` `contextDir` = `.context-jit-spec-v2` (unchanged; not in arc diff).

### Claim 3 — `register?` opt correctness + generality — **CONFIRMED**

`git show bf0bfc7`: adds `register?:boolean` to opts, `const register = opts?.register ?? true` (default true). The ONLY gated line: `if (!dryRun && register) registerSubstrate(...)` (src line 301; built dist lines 258-259). The mint block (src 276-287) writes `config.substrate_id` gated by `!dryRun` only — independent of `register`, so `register:false` still lands an id. Test `2e6118c` pins exactly this split (mint lands, no registry entry; control default run registers). **No `.context`/`project` hardcoding in the opt.** Engine carries one pre-existing `.project` literal (line 265: default `project` alias when a `.project`-basename substrate is discovered) — inert for the `.context` fold-in (work-dupe was `.context-temp`, not `.project`), and registry confirms `.context` got aliases `[]` (no spurious `project`). Registry maps `sub-394aad…` → `.context` (post-swap registration), not `.context-temp`.

### Claim 4 — `migrations.json` decl faithful, not spurious — **CONFIRMED (with a noted nuance, non-defect)**

`.context/migrations.json` = exactly ONE decl: `framework-gaps` 1.0.0→1.1.0, kind `identity`, by `migrate-content-addressed`. This records a **pre-existing** divergence: at `b874e19` the framework-gaps SCHEMA already declared `version: 1.1.0` while the framework-gaps DATA envelope `schema_version` was already `1.0.0`. The fold-in only RECORDED it (engine step 5 compares data-envelope `schema_version` vs schema-file `version`; 1.0.0 ≠ 1.1.0 → identity decl; data envelope is NOT mutated — correct, an identity decl is a no-op-transform registry entry for `validateBlockWithMigration`).

**Nuance probed:** TWO blocks carry a data `schema_version` envelope: `framework-gaps` (1.0.0) AND `session-notes` (1.0.0). No missing decl for session-notes — its SCHEMA declares NO `version` field (both pre `b874e19` and post), so the engine's `blockVersion && schemaVersion && blockVersion !== schemaVersion` guard never fires (schemaVersion undefined). All other 15 blocks have no data `schema_version` envelope → no comparison fires. So exactly one decl is correct.

### Claim 5 — `verifyDupe` fix verbatim + complete — **CONFIRMED**

`git show 902d415`: in BOTH `canonicalize-substrate.ts` and `foldin-context.ts`, `verifyDupe` now captures `originalBytes = readFileSync(...)` (or null) BEFORE the switch, and the `finally` does `fs.writeFileSync(pointerPath, originalBytes)` when present, else `fs.unlinkSync` if the switch created one — NOT `writeBootstrapPointer(cwd, original)`. The switch-TO-dupe line (`writeBootstrapPointer(cwd, workDirRel)`) is unchanged. `readActivePointer` deleted from both — **0 grep matches in `scripts/`**. `validateContext` / BLOCKING_CODES / `{ok,issues}` shape unchanged.

**Re-enumeration of switch-then-restore sites:** `writeBootstrapPointer` across `scripts/**` — the only switch-then-restore-the-live-pointer sites are these two `verifyDupe` functions. The other 13 call sites are all `runtime-demo-*.ts` operating on ephemeral `mkdtempSync` tmp/scratch dirs (never `.` / process.cwd / the real pointer); 0 target the real project cwd. **No third un-fixed site.** `packages/pi-context/src/context-dir.ts` `writeBootstrapPointer` is byte-unchanged in the arc (`git diff b874e19..HEAD -- context-dir.ts` empty) — correct, it must keep writing the minimal object for real switches.

**Empirical round-trip:** simulated the exact capture/switch/restore against a tmp `.pi-context.json` carrying the real switch-history fields. During the `writeBootstrapPointer` switch the file LOSES `previous_contextDir`/`switched_at`/`switched_by` (demonstrating the original bug the fix addresses). After the verbatim-bytes restore: `before === after` TRUE (lossless). Absent-case: a pointer the switch created is removed (`!exists` TRUE). Real `.pi-context.json` never touched.

### Claim 6 — No regression on the real swap path — **CONFIRMED**

`git show 902d415 -- foldin-context.ts` hunk headers are `@@ -85,25` and `@@ -121,9` — both inside parseArgs..verifyDupe. The swap (rename substrate→`.bak-<stamp>`, workDir→substrate, rm `.bak`, rollback on failure; src 277-285), the post-swap `registerSubstrate(args.cwd, substrateId, args.substrate, [])` (src 301), and the `migrateToContentAddressed(args.cwd, {register:false})` call (src 249) are all OUTSIDE the fix's hunks → unchanged. The `.context` apply at `af93ee1` is evidence the harness ran end-to-end (substrate now content-addressed; registered post-swap with empty aliases, matching the registry). Note: `foldin-context.ts` has no `--dry-run` mode (by design, docstring line 44).

### Claim 7 — Idempotency — **CONFIRMED**

`migrateToContentAddressed(".", {onlySubstrates:[".context"], dryRun:true})`: `items_oid_minted: 0`, `edges_rewritten: 0`, `objects_stored: 0`, `cross_substrate_edges: 0`, `unresolved: []`. (`items_hashed: 8` is a dryRun re-hash count with `objects_stored:0` — no-op detection, not a mutation.) Pointer md5 unchanged after the run.

---

## Findings

| # | Severity | Description | Evidence | Verdict |
|---|----------|-------------|----------|---------|
| 1 | INFO | framework-gaps data envelope remains `schema_version: 1.0.0` post-fold-in (not bumped to 1.1.0). This is intended: the identity decl in `migrations.json` is the registry entry `validateBlockWithMigration` runs when envelope (1.0.0) ≠ current schema (1.1.0); `validateContext` returns clean. | engine step 5 (src 477-509) does not mutate the envelope; `validateContext` status `clean`. | Not a defect — concrete delta is: divergence persists by design and is covered by the decl. |
| 2 | INFO | The pre-existing `.project` default-alias literal (migrate-content-addressed.ts:265) is a dir-name literal in the engine, separate from the `register` opt. | grep `"\.project"` in engine; read lines 258-268. | Not a defect for this arc — inert (no `.project`-basename substrate in the `.context` fold-in); `.context` registered with aliases `[]`. |

No CRITICAL / HIGH / MEDIUM / LOW findings. No masked failure, no edge resolving to a wrong oid, no silently-skipped item, no register pointing at the wrong dir, no `verifyDupe` that still clobbers, no second un-fixed switch-restore site.

---

## Overall verdict

**PASS.** All 7 claims CONFIRMED with independent evidence. `.context` is genuinely canonical and content-addressed (8 items / 8 objects integrity-verified, 37 edges structured + oid-byte-matched to `.project-migrate`, validateContext clean). Blast radius is exactly as claimed; `.project` / `.project-migrate` / `.context-jit-spec-v2` byte-untouched; active pointer unchanged. The `register?` opt and the `verifyDupe` verbatim-bytes restore are correct, general, and complete (empirically lossless round-trip; no remaining lossy or un-fixed site). Idempotent on re-run. Two INFO observations, both non-defects.
