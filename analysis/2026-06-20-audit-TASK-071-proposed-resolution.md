# Audit — TASK-071 proposed resolution (config repair path, addresses FGAP-096)

Date: 2026-06-20
Scope: read-only audit of TASK-071's description + acceptance_criteria (its proposed resolution) and the upstream FGAP-096 `proposed_resolution`, verified against the actual cited code in `packages/pi-context/src/context.ts`. No substrate mutation, no implementation.

## Verdict

**HAS-PROBLEMS** — the core design direction (validate-after-mutate / validate-the-RESULT not the stored config) is correct and well-grounded, but the proposed resolution omits the load-bearing precondition that actually makes the deadlock breakable, and leaves a real scope-completeness gap in what the repair grammar can express. Both are concrete, code-confirmed, and should be folded into the task before implementation.

## Code facts verified (claims = citation)

- **`loadConfigForDir` validates the raw config on EVERY load** — `context.ts:565-582`. After `JSON.parse` it calls `validateFromFile(bundledSchemaPath("config"), data, …)` (line 580) and only then returns. An invalid config throws here. Confirms FGAP-096 evidence (564-581) and the "read path and repair path share the same pre-validation" claim.
- **`amendConfigEntryForDir`'s FIRST data step is `loadConfigForDir`** — `context.ts:1251` (`const config = loadConfigForDir(substrateDir);`). The mutation (steps 4) and the result-write (step 5, `context.ts:1377-1383`) are downstream of that load. So an already-invalid config throws at line 1251 BEFORE any corrective mutation can run. Confirms FGAP-096's "validate-before-mutate" root cause exactly.
- **The write side ALREADY validates the result** — `writeConfigForDir` (`context.ts:849-851`) routes through `writeTypedFile(..., bundledSchemaPath("config"), ...)`, i.e. whole-config AJV on write. The dryRun branch (`context.ts:1378-1379`) validates `nextConfig` against the same schema. So "validate the RESULT, not the stored config" is **half-already-present**: the result-validation exists; the missing half is purely the *pre*-load validation that throws first.
- **`adoptConception` (accept-all) never-clobbers a populated config** — `context.ts:996` (`if (existing && !isSkeletonConfig(existing)) return { adopted:false … }`). Confirms FGAP-096's "accept-all is not a recovery path."
- **No raw / non-validating config load exists** — `grep` for `readFileSync.*config | skipValidation | force | recover` in `context.ts` returns nothing. The ONLY config read is the validating `loadConfigForDir`.
- **The amend grammar is scoped, not free-form** — `amendConfigEntryForDir` only expresses `add | replace | remove` against a known registry/key, each guarded by OP-CORRECTNESS throws (add-collision `1279`, replace-missing `1284`, entry-key-mismatch `1270-1276`, etc.). It cannot express an arbitrary body rewrite.

The task/FGAP are NOT poisoned by wrong code assumptions — every cited line and behaviour checks out. The problems are design-completeness, not factual error.

## Problem 1 (load-bearing) — "validate-after-mutate" alone does NOT break the deadlock; the missing primitive is a NON-validating raw load

The task description and FGAP-096 both frame the fix as "applies the corrective mutation and validates the result, rather than loading-and-validating the stored config before the repair." But the result-validation side already exists (`writeConfigForDir` / dryRun branch). The actual brick is the **pre-load** `validateFromFile` inside `loadConfigForDir` at line 580 — the repair op MUST still read the invalid config to mutate it, and the only read path throws.

So the necessary primitive is a **raw, non-validating config load** (parse-only, no AJV) feeding the repair, with validation moved to AFTER the mutation. The proposed resolution names the *symptom* ("don't validate before") but not the *mechanism* ("a parse-only load helper") — an implementer reading it literally could try to reuse `loadConfigForDir` and re-hit the throw, or bolt a `force` flag onto `amendConfigEntryForDir` that still calls `loadConfigForDir` first (no-op). The fix must specify: introduce a parse-only `rawLoadConfigForDir` (JSON.parse, no `validateFromFile`), have the repair path consume IT, and keep the existing result-validation (`writeConfigForDir`) as the single validating gate. AC #2 ("validates the corrected result … does not throw on load before the mutation") gestures at this but does not name the raw-load primitive as a deliverable.

## Problem 2 (scope completeness) — the scoped add/replace/remove grammar cannot express every "invalid config" repair

FGAP-096 enumerates the invalidity sources: "corruption, hand-edit, or a schema change with no registered migration." A corrupt or hand-edited body can be invalid in ways the registry-scoped amend grammar cannot reach: a missing required top-level field, a malformed registry array (not a clean per-entry add/remove delta), an extra/typo'd property, a structurally broken element. `amendConfigEntryForDir` can only `add | replace | remove` a single well-formed entry against a named registry — and each path is OP-CORRECTNESS-guarded (e.g. `replace` throws if the target is "missing", which an invalid body may make undetectable). Bolting `force` onto amend therefore recovers only the subset of invalidity that happens to be one clean registry-delta away from valid. The task's AC #1 ("an invalid config … is restored to validity") over-claims relative to what a force-amend can deliver. The repair surface that actually satisfies AC #1+#3 for arbitrary invalidity is a **whole-config recover write**: accept a full candidate config body, validate it as the RESULT, write atomically — independent of the scoped-delta grammar.

## Problem 3 (mechanism still unresolved, but that is by-design) — DECISION-first is correct; sharpen what it decides

The task correctly defers the mechanism (force flag vs recover op vs validate-after-mutate) to a filed DECISION (notes + AC framing). That deferral is sound and should stay. But given Problems 1+2, the DECISION is now a sharper, derivable choice, not an open three-way fork: a `force` flag on the scoped `amendConfigEntryForDir` is **eliminable** — it cannot express arbitrary invalidity (Problem 2) and still needs the raw-load anyway (Problem 1). The decision reduces to: **a dedicated whole-config recover op** (`recover-config` / `repair-config`) that (a) raw-loads OR accepts a full candidate body, (b) validates the RESULT via the existing `writeConfigForDir` gate, (c) writes atomically. The DECISION should record that derivation, not re-pose the force-flag option the facts rule out.

## Proposed corrected fields (ready to replace TASK-071's)

### description (replacement)

> Add a sanctioned whole-config recovery op (a `recover-config` / `repair-config` write) that restores any invalid `config.json` to validity without a forbidden direct edit. The op (a) reads the stored config via a NEW parse-only, non-validating raw load (`rawLoadConfigForDir` — `JSON.parse` with NO `validateFromFile`, the gap that `loadConfigForDir` at context.ts:580 lacks) and/or accepts a full candidate config body, (b) applies the corrective change, then (c) validates the RESULT through the existing `writeConfigForDir` / `writeTypedFile` whole-config-AJV gate (context.ts:849-851) — never validating the pre-existing stored config on load. Scope: any invalid config regardless of `schema_version`, distinct from the FGAP-095 version-gap migration, and BROADER than the scoped `add|replace|remove` amend grammar (which cannot express a malformed-body repair). The scoped `amendConfigEntryForDir` is NOT the recovery surface and is not given a `force` flag (a force-amend still raw-loads anyway and cannot reach arbitrary invalidity). The exact op shape (raw-load-then-edit vs accept-full-candidate-body, op name, CLI reflection) is resolved as a filed DECISION before implementation.

### acceptance_criteria (replacement)

> 1. An invalid `config.json` — including `schema_version` equal to current with an invalid body, AND invalidity the scoped add/replace/remove amend grammar cannot express (missing required field, malformed registry array, extra/typo property) — is restored to validity through the new sanctioned recovery op, with no forbidden direct edit of `config.json`.
> 2. The recovery op reads the stored config through a parse-only path that does NOT AJV-validate on load (a new `rawLoadConfigForDir` or equivalent), so it does not throw on the pre-existing invalid state; validation happens ONLY against the corrected RESULT, reusing the existing `writeConfigForDir` whole-config-AJV gate (no parallel validation re-implementation).
> 3. Both the FGAP-095 version-gap subset and the no-version-delta body invalidity are recoverable through this op; the scoped `amendConfigEntryForDir` is left unchanged (no `force` flag added to it).

### notes (replacement)

> Mechanism filed as a DECISION before implementation. The DECISION is a derived (not open) choice: a `force` flag on `amendConfigEntryForDir` is eliminated — it still hits the validating `loadConfigForDir` (context.ts:1251) and the scoped delta grammar cannot express arbitrary invalidity (FGAP-096 enumerates corruption / hand-edit / unmigratable). The decision records the recover-op shape only: raw-load-then-edit vs accept-full-candidate-body, op name, CLI reflection.

### files (add)

> `packages/pi-context/src/context.ts` (unchanged) PLUS the CLI op-registry reflection surface (`packages/pi-context-cli` ops-registry) since a new recover op is user-facing CLI surface; the DECISION should name whether the raw-load helper lives beside `loadConfigForDir` in context.ts.

## What is sound (keep as-is)

- The core insight — validate the RESULT, not the stored config — is correct and matches the code (`writeConfigForDir` already validates the result; the gap is the pre-load throw).
- Scoping the repair as distinct from FGAP-095's version-gap migration is correct: line 580 validates unconditionally with no `schema_version` branch, so a no-version-delta invalid body is genuinely unrecoverable independent of migration. The sibling framing is accurate.
- Deferring the mechanism to a filed DECISION before implementation is the right discipline; the correction sharpens what the DECISION decides, it does not remove the DECISION gate.
- Every code line and behaviour the FGAP/task cite was verified accurate — no poisoned factual assumptions.
