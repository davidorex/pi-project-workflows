# Cycle 8 / Phase F2 — resolveRef + validator severity split + cross-substrate resolution — adversarial audit

**Date:** 2026-05-31
**Auditor:** fresh-context adversarial agent (did NOT implement)
**Scope:** `resolveRef` + `foreignIndexFor` (context-sdk.ts), the validateContext edge severity split, the validateRelations `resolve?` thread, and the golden delta on the real `.context-jit-spec-v2` substrate.
**Mode:** READ-ONLY (Read / Grep / tsx-eval against built dist + source; no source edits, no build/test orchestration mutation, no commit).
**Verdict:** **8 CLEAN / 1 CLEAN-with-note** (probe 1 carries a non-blocking stale-comment finding). **0 FLAG-error, 0 FLAG-warn.** Total FLAGs: **0**.

Evidence base: built `dist/context-sdk.js` carries the new code (3 `edge_endpoint_unregistered` occurrences); pi-context suite **872/872 pass**; the new `resolve-ref.test.ts` (untracked) **15/15 pass**; live golden + 9-case synthetic 4-status probe + cache/throw probes + the runtime demo all reproduced independently.

---

## Probe 1 — resolveRef algorithm correctness (4 statuses) — CLEAN (with a stale-comment note)

Read `resolveRef` (context-sdk.ts:1488-1584) + `foreignIndexFor` (:1433-1453). The three-branch algorithm matches the locked design exactly:

- (1) structured `{kind:"lens_bin"}` → `{status:"active", endpointKind:"lens_bin"}`, no item lookup (:1497-1499).
- (2) item with locator (structured `substrate_id`, OR string `<alias>:<refname>` whose alias resolves) → `foreignIndexFor` → unregistered substrate_id → `unregistered`; registered → lookup by `oid` (`byOid`) else by `refname` (`byRefname`) → found `foreign` / absent `dangling` (:1556-1574). Foreign lookup confirmed to consume BOTH `byOid` (:1570) AND `byRefname` (:1571) of the Cycle-7 SubstrateIndex.
- (3) no-locator (bare oid / refname / `:`-string whose prefix is NOT a registered alias) → ACTIVE index only → `active`/`dangling` (:1577-1583).

Independently exercised all 9 cases via tsx against a synthetic project (active substrate + registered foreign substrate `sub-bbbb…` alias `other`):

| ref | status | endpointKind | loc.block |
|---|---|---|---|
| `"DEC-0001"` (active present) | active | item | decisions |
| `"DEC-9999"` (active absent) | dangling | item | — |
| `{kind:lens_bin}` | active | lens_bin | — |
| `"other:FGAP-9"` (alias reg, present) | foreign | item | decisions |
| `"other:FGAP-404"` (alias reg, absent) | dangling | item | — |
| `"project:FGAP-153"` (alias UNreg) | unregistered | item | — |
| `{substrate_id, refname:FGAP-9}` (present) | foreign | item | decisions |
| `{substrate_id, refname:FGAP-404}` (absent) | dangling | item | — |
| `{substrate_id: sub-zzzz…}` (unreg) | unregistered | item | — |

All correct.

**NOTE (non-blocking, doc-only):** the doc-comment at context-sdk.ts:1475-1482 describes the *rejected* alternative — it says an unregistered-alias string "falls through to step 3 and resolves against the active index by the WHOLE string as refname → absent → `dangling`." The CODE does the opposite (:1519,1529-1535,1550-1552 set `aliasUnregistered` → return `unregistered`), which matches the plan's locked decision 1 and the live golden. This is a stale comment contradicting its own function body; it is harmless to runtime behavior but is misleading documentation. Recommend correcting the comment to state the implemented `unregistered` outcome. (Reported as a note, not a FLAG, because behavior is correct and tested.)

## Probe 2 — the alias-string classification — CLEAN

`project:FGAP-153` pre-registration → `unregistered` confirmed (synthetic probe + resolve-ref.test.ts:154-166 + live golden's 30 edges). The parser treats ANY string with a colon at index > 0 as an `<alias>:<refname>` candidate (:1521-1522); the prefix is looked up via `resolveAlias` — registered → foreign locator, unregistered → `unregistered`. Adversarial check on colon-in-refname mis-classification: enumerated all `.context-jit-spec-v2` `block_kinds` — **0** have a colon in `prefix` or `id_pattern` (DEC-/FGAP-/TASK-/… are all colon-free). So no legitimate refname can be mis-read as alias-form. Leading-colon (`:foo`, index 0) falls to bare-refname active lookup (`> 0` guard). The "any `:`-string is alias-form" rule is safe given the real id-patterns and is symmetric with the write-side `resolveRelationSelector` (:1325-1340).

## Probe 3 — F2 pull-forward intentionally reversed, complete — CLEAN

validateContext now consults the registry/foreign index via the per-pass `resolve` closure (:1715) bound to the foreign cache. The Cycle-5 "foreign stays unresolved" test was correctly rewritten (structured-endpoints.test.ts:228-277): it now asserts a registered+populated foreign endpoint resolves `foreign` CLEAN and emits NO endpoint error, with a direct `resolveRef(...).status === "foreign"` assertion. No leftover path treats a registered-foreign endpoint as unresolved: the only foreign-resolution sites are `resolveRef` (validation) and `resolveRelationSelector` (write-side, which already formed foreign endpoints in Cycle 5). The endpoint-kind loop (:1781-1815) also reads the resolved `loc` for foreign items.

## Probe 4 — golden delta exactly right — CLEAN

Independently reproduced `validateContext('.')` on the active `.context-jit-spec-v2` substrate:

- **56 issues / 53 errors / 3 warnings — status `invalid`** (matches claim).
- **30** errors coded `edge_endpoint_unregistered`, **0** `edge_endpoint_dangling`. All 30 fields reference `project:` strings (`FB-00x->project:FGAP-15x` …); 30/30 contain `project:`.
- The other **23** errors: 11 endpoint-kind (TASK→FEAT target-kind ×5, WO→TASK source-kind ×6), 10 `decision-cites-forcing-artifact`, 1 `completed-task-has-verification`, 1 `resolved-friction-has-verification-edge`. These are invariant/kind codes produced by a separate generic loop the F2 diff did not touch (verified the diff only edits `resolveRef`, the edge-resolution loop, and the endpoint-kind check) → byte-identical.
- **3** warnings: `decision-grounded-by-axiom-or-friction-or-authority` ×2, `concept-referenced-by-decision-or-grounded` ×1 — unchanged.

NO same-substrate edge changed classification: 0 `edge_endpoint_dangling` in real data confirms every same-substrate edge still resolves `active` (no same-substrate dangling exists, as expected). The 30 cross-substrate edges are exactly the old "does not resolve" set, now reclassified to `unregistered` (count/severity/total preserved).

## Probe 5 — foreign-index cache perf + safety — CLEAN

`foreignIndexFor` (:1433-1453) memoizes per substrate_id in the per-pass `foreignCache` Map. Synthetic probe: 2 edges into the same foreign substrate → `cache.size === 1`, both resolve `foreign` from one index (also resolve-ref.test.ts:249-271, asserting size 1 + both refnames resolve from the cached object). A foreign build that throws is caught (:1447-1451) → returns null → caller resolves `dangling`. Independently triggered a genuine `buildIdIndexForDir` throw: foreign dir with a config mapping `FGAP-`→friction while `FGAP-77` sits in `decisions.json` (prefix-vs-block invariant) → `resolveRef` returned `dangling`, **no crash**, and `cache.has(badId) === false` (throw NOT cached; a second call also degrades cleanly). resolve-ref.test.ts:198-246 proves the throw genuinely fires (explicit `assert.throws(..., /Prefix-vs-block/)` on the same config the production `loadConfigForDirBestEffort` loads) and that `resolveRef` does not propagate it. The non-cached throw is harmless (bounded re-cost per edge into the bad substrate). The unregistered-vs-throw disambiguation (:1558-1566 re-checks `resolveSubstrateDir`) correctly distinguishes the two null returns.

## Probe 6 — validateRelations parity — CLEAN

`validateRelations` gains optional `resolve?: (ref) => RelationResolveView` (context.ts:1232). The default path is byte-identical: `resolveBlock` (context.ts:1271-1276) returns `idIndex.get(key)` when `resolve` is undefined. With `resolve` supplied, an `active`/`foreign` item contributes `loc.block`; otherwise undefined (same "not found" semantics). resolve-ref.test.ts:339-386 pins both directions (no-resolve → `edge_unresolved_child` today-behavior; with-resolve → foreign child resolves CLEAN; control confirms the resolver did the work). Layering: context.ts has **no `import` from context-sdk** (all `context-sdk` mentions are comments); the minimal `RelationResolveView` interface (context.ts:1219-1230) mirrors only `{status, loc.block}`, into which the full `ResolvedRef` closure is structurally assignable. validateContext supplies the bound resolver at context-sdk.ts:1827.

## Probe 7 — endpoint-kind check uses resolved loc — CLEAN

The endpoint-kind loop (context-sdk.ts:1781-1815) calls `resolve(edge.parent/child)` and reads `.loc` for item endpoints (active OR foreign), kind-checking `loc.block` against `source_kinds`/`target_kinds`. A lens_bin endpoint carries no `loc` (resolveRef returns `{status:active, endpointKind:lens_bin}` with `loc` undefined) → `parentLoc`/`childLoc` falsy → skipped, never kind-checked. The 11 live endpoint-kind errors fire on resolved active items (TASK/WO/FEAT), demonstrating the resolved-loc path works. lens-bin parent discrimination in validateRelations stays on the `endpointBin(...) ?? parentKey` / `lens.bins.includes` path (context.ts:1294), never routing a lens_bin through `resolveBlock`.

## Probe 8 — scope + layering — CLEAN

Working-tree changes: `packages/pi-context/src/{context-sdk.ts, context.ts, index.ts}` (M), `structured-endpoints.test.ts` (M), `resolve-ref.test.ts` (new), `scripts/orchestrator/runtime-demo-resolve-ref.ts` (new). `README.md` carries an unrelated staged prose edit (philosophical musing) — out-of-scope but benign. **No `.project`/`.context*` substrate file modified** (`git status` shows NONE). No migration, no alias registration — the real `project` alias stays unregistered, which is precisely why the 30 are `unregistered`. **pi-jit-agents and pi-workflows untouched** (NONE). index.ts re-exports `resolveRef` + types `ResolvedRef`/`ResolveStatus`.

## Probe 9 — Phase-H readiness — CLEAN

The mechanism is genuinely ready. The runtime demo (`runtime-demo-resolve-ref.ts`) PASS-markers prove the load-bearing property: **(b.2) registering the `project` alias ALONE flips a `project:FGAP-7` STRING from `unregistered` → `foreign` CLEAN** with no validateContext endpoint error — *without* rewriting the 30 to structured form. So Phase H's alias registration is sufficient to clear all 30 even before data migration. The data rewrite remains correct/idempotent on top: my synthetic probe confirmed both structured `{substrate_id, refname}` and `{substrate_id, oid}` forms resolve `foreign` once the substrate_id is registered (resolveRef looks up `byOid` first, then `byRefname`), so a migrated `{kind:item, substrate_id, oid}` endpoint resolves `foreign` identically. The cache builds the `.project` index once for all 30 post-H edges (one substrate → one build).

---

## Summary

The load-bearing resolver is correct and complete. All four statuses classify exactly as the locked algorithm specifies; the alias-string decision (`project:FGAP-153` → `unregistered`) is implemented per locked decision 1 and is safe given colon-free real id-patterns; the foreign cache builds once and degrades a throwing foreign substrate to `dangling` without crashing (and without poison-caching the failure); validateRelations is byte-identical without `resolve` and respects the layering constraint (no context-sdk import); the endpoint-kind check reads resolved loc and skips lens_bin; the golden delta is exactly 56/53/3 with the 30 reclassified to `edge_endpoint_unregistered`, 0 dangling, the 23 invariant/kind errors and 3 warnings byte-identical; and the Phase-H-preview proves alias-registration alone clears the 30.

**Single most important finding:** the only defect is a stale doc-comment (context-sdk.ts:1475-1482) that describes the *rejected* active-dangling alternative while the code correctly returns `unregistered` — misleading documentation, zero runtime impact, tests + golden confirm the implemented behavior. Recommend a comment correction; not a blocker for green.
