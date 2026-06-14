# TASK-062 write-time edge validator — adversarial verification probe

Commit `92dde2d` (`feat/fgap-090-resolution`), parent `a582939`. Probe re-derived independently; implementer claims not relayed.

## Method

- `git show 92dde2d -- packages/pi-context/src/context-sdk.ts` (full diff) + `git show a582939:…` (pre-refactor).
- Fresh `/tmp/t62` substrate: `context-init`/`context-accept-all`/`context-install` via the global CLI; seeded real items (DEC-0001, FGAP-001/002, TASK-001, FEAT-001) by raw fs on the /tmp block files (the project `.context` was never touched; the planning-block + glue PreToolUse hooks fire even against /tmp — see "Hook note" — so CLI write-ops could not seed there).
- Write-time attacks: direct `npx tsx` calls into the built `@davidorex/pi-context/context-sdk` (`appendRelationByRef` / `appendRelationsByRef`), persistence confirmed via `loadRelations` (the relations file is a BARE JSON ARRAY, not `{relations:[]}` — an early counter read the wrong shape; all verdicts below re-confirmed through `loadRelations`).
- Property-1 regression: swapped the parent file into `packages/pi-context/src/`, rebuilt pi-context, ran `validateContext` on the SAME seeded substrate, captured issues; restored current, rebuilt, re-ran. Byte-compared. Working tree confirmed clean after (`git status` empty).

## Per-property verdicts

### Property 1 — validateContext regression: **PASS (no shape regression); one MINOR array-ordering delta**

Empirical before/after on an identical substrate carrying one unregistered-rt edge, one source-kind mismatch, one target-kind mismatch. Both builds emit three issues with **byte-identical** shape:

| edge | severity | code | block | field | message |
|---|---|---|---|---|---|
| unregistered rt | `error` | **undefined (both)** | `relations` | `DEC-0001->FGAP-001` | `Edge relation_type 'totally_made_up_rt' is not registered in config.relation_types` |
| source-kind mismatch | `error` | **undefined (both)** | `relations` | `TASK-001->FGAP-001` | `Edge TASK-001 -> FGAP-001: source kind 'tasks' not in source_kinds [decisions] for relation_type 'decision_raises_gap'` |
| target-kind mismatch | `error` | **undefined (both)** | `relations` | `DEC-0001->FEAT-001` | `Edge DEC-0001 -> FEAT-001: target kind 'features' not in target_kinds [framework-gaps] for relation_type 'decision_raises_gap'` |

The prompt's hypothesis ("PRE-refactor may have carried a code; dropping it is a regression") is **disproved**: the pre-refactor registration + kind issues carried **no `code`** (only `severity`/`message`/`block`/`field`). The post-refactor maps the helper messages to exactly that shape. severity (`error`), message wording (byte-identical), block (`relations`), field (`parent->child`), and absent-code are all preserved. Trigger conditions match (registration by `canonical_id`; presence-gated kind membership with `"*"` wildcard; unregistered short-circuits the kind check via the helper's early return, mirroring the old `if (!rt) continue;`).

**MINOR delta (not a shape regression):** the `issues[]` ARRAY ORDER changed. Pre-refactor used two separate loops — ALL registration errors, then ALL kind errors. Post-refactor uses one per-edge loop, so registration and kind issues interleave in file order. Demonstrated on a 4-edge fixture (kind, reg, kind, reg in file order):
- parent: `reg, reg, kind, kind` (grouped by error type)
- current: `kind, reg, kind, kind→reg` i.e. `kind, reg, kind, reg` (file order)

`validateContext` returns `issues[]` UNSORTED and no caller/op sorts it. No test asserts the order of these issues (`lens-view.test.ts:267`'s `issues[0]` assertion is on `validateRelations`, a different function). So the delta is unobserved by the suite and by the per-issue acceptance bar. Recorded as a behavioral note: a consumer snapshotting/indexing the raw `issues[]` array would see a different order; the set of issues is identical.

### Property 2 — write-time false-pass: **PASS (no false-pass)**

All three rejectable single-edge cases threw `Edge rejected at write time (...)` and persisted nothing (`loadRelations` count unchanged):
- parent-kind not in source_kinds (`TASK-001 --decision_raises_gap--> FGAP-001`) → threw `source kind 'tasks' not in source_kinds [decisions]`.
- child-kind not in target_kinds (`DEC-0001 --decision_raises_gap--> FEAT-001`) → threw `target kind 'features' not in target_kinds [framework-gaps]`.
- unregistered relation_type (`totally_made_up_rt`) → threw `not registered in config.relation_types`.

Batch all-or-nothing: a 2-edge batch `[valid decision_addresses_gap, bad source-kind decision_raises_gap]` threw and persisted **neither** edge (the valid one did not leak through). Confirmed clean via `loadRelations`.

### Property 3 — write-time over-reject: **PASS (no spurious rejection)**

All accepted and persisted (verified on disk via `loadRelations`):
- `decision_raises_gap` DEC-0001→FGAP-001 (decisions→framework-gaps).
- `gap_relates_to_gap` FGAP-001→FGAP-002 (framework-gaps→framework-gaps).
- `decision_gated_by_item` DEC-0001→TASK-001 (decisions→`*`).
- `item_derived_from_item` TASK-001→FEAT-001 (`*`→`*`).

Helper-level coverage (synthetic resolver, exercising cases the catalog cannot — the catalog has NO relation_type with neither kind set):
- **NEITHER source_kinds nor target_kinds set → PASS** (presence gate; `[]` returned). This is the gate the catalog can't reach; the helper honors it correctly.
- `source_kinds:["*"]` → any parent kind passes; mismatch on the OTHER (target) set still caught.
- multi-kind `["decisions","features","tasks"]` → one-of passes; non-member rejected.
- only one set present → the other endpoint unchecked.
- empty array `source_kinds:[]` (present-but-empty) → REJECTS (membership in `[]` is false). Consistent with pre-refactor (`[]` is truthy, gate does not skip).

### Property 4 — parity write-time ↔ validate-time: **PASS**

Both paths call the same `validateEdgeAgainstRegistry` with equivalent resolvers. For the bad single edges, write throws on exactly the messages validateContext emits. For the dangling-endpoint edge (Property 5 below) both paths AGREE the kind/registration check passes (validateContext adds only its own `edge_endpoint_dangling`, which is outside the shared helper's remit by design). No edge found where write rejects but validate would not flag, or vice-versa, on the registration/kind axis.

### Property 5 — dryRun + selector resolution: **PASS, with one documented write-time gap (below)**

- `dryRun:true` on a bad edge → THREW (the gate runs before the dryRun branch), persisted nothing.
- `dryRun:true` on a good edge → no throw, `appended:true` preview, persisted nothing.
- Unresolvable parent selector `NOPE-999` → see gap.

## Documented write-time gap (NOT a property failure, but a real surface limitation worth surfacing)

**A kind-constrained relation_type can be written with a dangling (non-existent) endpoint.** `appendRelationByRef(cwd, {parent:'NOPE-999', child:'FGAP-001', relation_type:'decision_raises_gap'})` was **ACCEPTED and persisted**, even though `decision_raises_gap` requires source kind `decisions` and `NOPE-999` is no item at all. Cause: the helper's kind check is gated on `parentLoc` being truthy; a dangling endpoint resolves to no `loc`, so the source-kind membership check is skipped. `validateContext` later flags this same edge as `edge_endpoint_dangling` (error) — so it is caught at validate time, never at write time.

This is the **documented** design (the helper's JSDoc: "A lens_bin / dangling / unregistered endpoint carries no `loc` and is skipped for the kind check (endpoint-resolution failures are validateContext's own surface, not this helper's)"), and `structured-endpoints.test.ts:288` RELIES on it (FGAP-1/FGAP-2 dangle, so only registration passes). It is parity-consistent (write and validate agree on the kind axis). But it means the write-time gate does NOT prevent persisting a kind-violating edge whose offending endpoint is simply absent — the write porcelain performs registration + present-endpoint kind checks only, not endpoint-existence. The TASK-062 framing ("a kind-mismatched … edge throws and is never persisted") holds only for edges whose endpoints RESOLVE. Recommend the orchestrator decide whether write-time should additionally reject dangling endpoints (would close this gap; would also change the `structured-endpoints.test.ts` dangling-append behavior).

## Hook note (incidental)

The `gap-register-guard.sh` and `block-pi-context-glue.sh` PreToolUse hooks fire on `--cwd /tmp/t62` invocations too (not scoped to the active substrate) — the open FGAP-089 class. It blocked CLI write-ops and `--show-schema` against the throwaway substrate; worked around by raw-fs seeding of the /tmp block files (project `.context` never touched).

## Test suite

Full `pi-context` suite green on current build: 1147 pass / 0 fail / 2 skipped (pre-existing). New `edge-write.test.ts` + the `structured-endpoints.test.ts:288` fix pass (38/38 in those two files).

## Bottom line

No false-pass, no over-reject, no parity break, and **no validateContext shape regression** (the registration/kind issues carried no `code` before and after; severity/message/block/field identical — byte-verified on identical substrate across both builds). One MINOR unobserved `issues[]` array-ordering delta. One real-but-documented write-time limitation: dangling-endpoint edges bypass the kind gate (caught later by validate).
