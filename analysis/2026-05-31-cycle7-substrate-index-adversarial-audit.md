# Cycle 7 / Phase F1 — SubstrateIndex split — Adversarial Audit

**Date:** 2026-05-31
**Auditor:** fresh-context adversarial agent (read-only on source; tsx-against-source + git stash for golden reproduction; no build/test/commit)
**Subject:** `SubstrateIndex` refactor — separate `byRefname`/`byOid` lookup maps from the `items[]` iteration surface. Behavior-preserving; the whole point is INERTNESS.
**Plan:** `~/.claude/plans/iridescent-nibbling-wand.md`
**Change set:** working-tree (uncommitted). 7 modified + 2 new files. `git status --porcelain`:
- M `packages/pi-context/src/context-sdk.ts` (primary)
- M `packages/pi-context/src/rename-canonical-id.ts` (consumer NOT in plan's enumerated lists — correctly caught)
- M `packages/pi-jit-agents/src/compile.ts` (cross-package)
- M `packages/pi-workflows/src/render-by-id.ts` (cross-package)
- M 3 test files (context-sdk.test.ts, resolve-id.test.ts, compile.test.ts)
- ?? `packages/pi-context/src/substrate-index.test.ts` (new)
- ?? `scripts/orchestrator/runtime-demo-substrate-index.ts` (new)
- **`context.ts` UNTOUCHED** (empty diff — confirms probe 6)
- **No `.project`/`.context*` substrate file touched** (probe 10)

## Verdict summary

All 10 probes **CLEAN**. **0 FLAGs**. The refactor is inert: `validateContext('.')` on the real `.context-jit-spec-v2` substrate is **byte-identical** pre/post (independently reproduced via `git stash`).

---

## Probe 1 — deviation correct + behavior-preserving — CLEAN

**The KEY DEVIATION is correct.** Production iteration uses `index.byRefname.values()` (deduped, scan/insertion order), NOT the plan's literal `index.items`. All 8 iteration sites in `context-sdk.ts` converted to `byRefname.values()`:
- `currentState`: inFlight `:686`, plannedTasks `:710`, openGaps `:739`, in-progress-phase `:791` (the `break`/first-match loop — order-stable on Map insertion order)
- `validateContext`: itemsByBlock build `:1587`, status-vocab invariant `:1621`, status-consistency invariant `:1652`, status-vocab warning `:1691`

`byRefname` is a `Map`, so `.values()` yields entries in insertion order = the old scan order. First-writer-wins on collision = the old single-Map dedup. This exactly reproduces the old `for (const [id,loc] of idIndex)` (the old Map was deduped first-writer-wins, same order). `loc.id` substitutes the old destructured key (the new additive `ItemLocation.id` field, set to `item.id` at build, `context-sdk.ts:1199`).

**Why the deviation is REQUIRED:** the real substrate carries a refname collision (two `FB-001` in `friction-items.json` — see Probe 9). The plan's literal `.items` (1-per-physical-item) would visit FB-001 **twice** → golden-breaking. `byRefname.values()` visits it once. `.items` is retained as the F2/migration physical-item seam.

**Golden, independently reproduced** (tsx against source; `git stash`/pop for pre-refactor):
- post-refactor: `validateContext('.')` → **56 issues / 53 errors / 30 does-not-resolve**
- pre-refactor (stash): **56 / 53 / 30**
- normalized full issue list (337-line sorted JSON) **`diff` = BYTE-IDENTICAL** (`/tmp/golden-pre.json` == `/tmp/golden-post.json`)

FB-001 handled identically pre/post: parent of edge `FB-001->project:FGAP-153`, resolves via `byRefname.has` (dedup-agnostic), visited once in validation.

## Probe 2 — no double-count / no miss — CLEAN

Empirically, on the real substrate via `buildIdIndex('.')`:
- `items.length === 89`, `byRefname.size === 88`, **diff === 1** (exactly the FB-001 dup)
- formula `items.length === byRefname.size + (colliding dups)` holds
- FB-001 in `items[]`: 2 occurrences; in `byRefname`: 1 (deduped)
- the invariant loops (requires-edge, status-consistency, status-vocab) all iterate `byRefname.values()` → FB-001 validated **once** (anti-double-count property holds)
- no iteration site uses `.items` (negative grep over `packages/*/src/` non-test: zero `index.items`/`.items` iteration in production; the `.items` matches at `context-sdk.ts:214` are a local block-scan var, `:1026` a doc comment)

## Probe 3 — all consumers migrated (completeness) — CLEAN

Every `buildIdIndex(`/`buildIdIndexForDir(` result use across all packages + scripts migrated. Negative grep `buildIdIndex(...).{get|has|values|entries|keys|size|forEach}` excluding `byRefname`/`byOid` → **NONE**. Migrated lookup sites:
- `context-sdk.ts`: `:702`/`:710` (currentState dep checks), `joinBlocks :1007`, `resolveItemById :1227`, `resolveItemsByIds :1267`, `resolveRelationSelector foreignIndex :1335` + active `:1350`, validateContext edge-integrity `:1515`/`:1523`, status-vocab `:1557`/`:1558`, status-consistency `:1661`
- **cross-package:** `pi-jit-agents/src/compile.ts:245` (`buildIdIndex(ctx.cwd).byRefname` — downstream `getIdIndex` closure contracts a refname-keyed `Map`, shape preserved; the `ctx.idIndex` supplied-cache path stays a raw `Map` — consistent), `pi-workflows/src/render-by-id.ts:77` (`buildIdIndex(cwd).byRefname`)
- **`rename-canonical-id.ts:107`** — a consumer the plan's site-lists OMITTED; the implementer correctly caught it (compiler-as-checklist worked): `idx.get`/`idx.has` → `.byRefname`. This is completeness, not scope creep.

Cross-package consumer tests green against source: resolve-id 5/5, render-by-id 7/7, compile 27/27.

## Probe 4 — byOid populated but DORMANT — CLEAN

- **Populated, not deferred:** `context-sdk.ts:1208-1213` — `if (typeof oidVal === "string" && oidVal.length > 0 && !byOid.has(oidVal)) byOid.set(oidVal, loc)`. First-writer-wins on oid collision (the `!byOid.has` guard), mirroring `byRefname`.
- **Sparse on real data:** `buildIdIndex('.').byOid.size === 0` (no stamped items in `.context-jit-spec-v2` yet).
- **No production READS:** grep `byOid` over `packages/*/src/` non-test → only the constructor sites (`:667`/`:1134` empty-state, `:1159`/`:1165`/`:1211-1212` build). No `.byOid.get`/`.has`/iteration in any production consumer. Reads exist only in the new test + demo. Dormant seam confirmed.

## Probe 5 — resolve* wrappers unchanged signatures — CLEAN

- `resolveItemById(cwd: string, id: string): ItemLocation | null` (`:1226`) — body `buildIdIndex(cwd).byRefname.get(id) ?? null`
- `resolveItemsByIds(cwd: string, ids: string[]): Map<string, ItemLocation | null>` (`:1261`) — `index.byRefname.get(id)`
- `expectedBlockForId(id: string, cfg: ConfigBlock | null): string | null` (`:1086`) — untouched (it never consumed buildIdIndex)

All external signatures + return types identical; only the internal `.get` → `.byRefname.get` changed.

## Probe 6 — validateRelations inline index untouched — CLEAN

`context.ts` has an **empty diff** (untouched). The inline `idIndex = new Map<string, string>()` at `context.ts:1236` is unchanged. It receives `itemsByBlock` built at `context-sdk.ts:1587` from `byRefname.values()` (deduped) — so it is fed the same deduped data as pre-refactor. Unifying it onto the resolver is explicitly F2's job.

## Probe 7 — collision + scan-order semantics + additive id field — CLEAN

- `byRefname` first-writer-wins: empirically `byRefname.get('FB-001') === items[0]` (the FIRST physical FB-001 wins). `items` keeps both in scan order.
- shared `ItemLocation` (incl. new `id`): the locator object stored in `byRefname`/`byOid` is the SAME reference pushed to `items` on first write (`context-sdk.ts:1198-1206`) — iteration and lookup share identity.
- `ItemLocation.id` is **additive** and doesn't break tool JSON output: `resolve-item-by-id` (`index.ts:2187-2191`) and bulk `resolve-items-by-id` (`:2345-2354`) `JSON.stringify` the locator verbatim (now also carrying `id`); the tests assert fields **individually** (`typeof probe.block`, `probe.id === "DEC-0001"`) — no deep-equal that an extra field would break.

## Probe 8 — buildIdIndexForDir signature — CLEAN

- `buildIdIndexForDir(substrateDir: string, _cwd: string, cfg: ConfigBlock | null): SubstrateIndex` (`:1152`) — 3-arg; `_cwd` retained for F2, currently unused (body reads config via `cfg`). Underscore-prefixed = deliberately-unused convention.
- `buildIdIndex(cwd): SubstrateIndex` (`:1128`) wraps it; when pointer absent returns `{ dir: cwd, byRefname: new Map(), byOid: new Map(), items: [] }` (`:1134`) — well-formed empty SubstrateIndex mirroring the prior empty-Map return. Test `context-sdk.test.ts` asserts the empty-pointer case.

## Probe 9 — FB-001 duplicate characterization — CLEAN (pre-existing DATA anomaly, neither introduced nor worsened by Cycle 7)

`.context-jit-spec-v2/friction-items.json` `items[]` (19 entries) has TWO `FB-001` at array indices 0 and 1. They are **byte-identical** (`JSON.stringify(fb[0]) === JSON.stringify(fb[1]) === true`) — an **accidental verbatim duplicate**, NOT two genuinely-distinct items. Both:

> `"id": "FB-001"`, `"title": "resolvePromptField heuristic misclassifies inline prompts as template file paths"`, `"severity": "blocking"`, `"status": "open"`, `source.repo: "clock-menu-app"`, `created_by: "human:davidryan@gmail.com"`, identical `description`/`actual_behavior`/`expected_behavior`/`reproduction`/`workaround`/`code_references` (`agent-spec.ts:30`, symbol `resolvePromptField`).

**Cycle 7 neither introduced nor worsened it:** the old single-Map also deduped first-writer-wins, so old + new code both visit FB-001 once. The byte-identical golden is the proof. The dup currently causes **no validation issue of its own** — it is **silently hidden by first-writer-wins** (this audit surfaced it only by direct file inspection). The one FB-001-adjacent issue (`Edge child 'project:FGAP-153' ... does not resolve`) concerns its edge's cross-substrate CHILD sentinel, not the dup. **This is a latent data anomaly the operator may wish to clean up; it is OUT OF SCOPE for F1's inertness guarantee and correctly left untouched here.**

## Probe 10 — scope — CLEAN

Only source/test/script files in the planned packages changed (+ the correctly-caught `rename-canonical-id.ts` consumer). `context.ts` untouched. **No `.project`/`.context*` substrate file touched.** No behavior change anywhere — the inertness guarantee holds, proven by the byte-identical golden + the deterministic-twice-run inertness test + live demo.

## Cross-cutting verification run (against SOURCE via tsx, not dist)

- new `substrate-index.test.ts`: **8/8 pass** (structure invariants, first-writer-wins collision incl. oid, validateContext-inertness-twice)
- live demo `runtime-demo-substrate-index.ts`: **exit 0**, all PASS markers (a–e: byRefname.size===items.length, byOid-only-stamped, each-item-once, collision-first-writer, validateContext-twice-byte-identical)
- cross-package: resolve-id 5/5, render-by-id 7/7, compile 27/27

## Conclusion

**Genuinely inert + clean.** The KEY DEVIATION (`byRefname.values()` for iteration, not `.items`) is not merely acceptable — it is the **correct** choice and the only one that preserves the golden in the presence of the real FB-001 refname collision. The implementer's adversarial discovery of that collision, and the consequent retention of `.items` as the F2 physical-item seam, is exactly right. `byOid` is populated-but-dormant. The independently-reproduced `validateContext('.')` golden is **byte-identical** pre/post (56/53/30, 337-line diff clean). 0 FLAGs.
