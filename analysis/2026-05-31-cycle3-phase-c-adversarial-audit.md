# Cycle-3 / Phase-C Adversarial Audit — content-addressed substrate identity

Date: 2026-05-31
Auditor: fresh-context adversarial agent (did not implement Cycle 3)
Scope: `iridescent-nibbling-wand.md` plan — OID minting, identity stamping, substrate_id core, mandatory-floor, informed-authorization confirm.
Method: source read (READ-ONLY) + `git diff`/`git show` canonical comparison + `npx tsx` runtime exercises against source + targeted unit-suite runs via tsx/vitest. No source edits, no `npm build`, no commit.

Default posture: FLAG when uncertain. Result: **no high/medium FLAGs. One LOW design observation, one INFO (acceptable divergence).**

---

## Probe 1 — every mutation primitive wired (no unstamped path) — CLEAN

Enumerated all item-birth/mutation primitives in `block-api.ts` and confirmed each identity-declaring path routes through `maybeIdentityStampTypedItem` → `prepareItemIdentityForWrite`:

| primitive | site | stamp call |
|---|---|---|
| `appendToTypedFile` flat-array | block-api.ts:950 | create (gate no-ops; flat arrays never declare identity) |
| `appendToTypedFile` object-array | block-api.ts:972 | create |
| `appendManyToTypedFileIfAbsent` object-array loop | block-api.ts:1071 | create per appended item |
| `updateItemInTypedFile` | block-api.ts:1240 | update, prior=on-disk item |
| `upsertItemInTypedFile` append branch | block-api.ts:1324 (mode `create`, prior `undefined`) | create |
| `upsertItemInTypedFile` replace branch | block-api.ts:1324 (mode `update`, prior=on-disk) | update |
| `appendToNestedTypedFile` | block-api.ts:1431 | create, keyed on nested array |
| `updateNestedItemInTypedFile` | block-api.ts:1509 | update, prior=on-disk nested |
| `writeBlockForDir` whole-block | block-api.ts:1614 → `stampWholeBlockIdentity` (1660) | per array item: create-or-update by oid/id match |
| `removeFromTypedFile` / `removeFromNestedTypedFile` | 1360,1544 | correctly exempt (`void ctx`; nothing to stamp) |
| `nextId` | n/a | correctly exempt |

`appendManyToTypedFileIfAbsent` **flat-array** branch (block-api.ts:1037) pushes `candidate` raw without identity stamping. This is correct by design: flat-array shape is keyed `null`/`__top__`, which the identity cataloguer never visits, so the gate is permanently no-op there — and no flat-array schema declares identity fields (verified: all 38 identity-declaring schemas are object-with-array-field shape).

`writeTypedFile` (the low-level atomic writer, block-api.ts:862) does NOT stamp — it only does envelope author-stamping. Whole-block identity stamping is correctly hoisted into `writeBlockForDir`/`stampWholeBlockIdentity` before the `writeTypedFile` call. No write path to an identity-declaring block file bypasses stamping.

Runtime evidence: a write to a non-identity schema produced no oid/hash and left the object store untouched (Probe 6).

---

## Probe 2 — OID immutability cannot be bypassed — CLEAN (one LOW observation)

Single enforcement point: `prepareItemIdentityForWrite` block-api.ts:698–702 throws when `priorOid !== undefined && incomingOid !== undefined && incomingOid !== priorOid`. Every update path reaches it WITH the prior:
- `updateItemInTypedFile`: prior = `arr[idx]` (the on-disk item) — merge is `{...prior, ...updates}` so prior.oid is carried into the merged item; an `updates.oid` that differs throws.
- `upsertItemInTypedFile` replace: prior = `arr[idx]` passed explicitly (block-api.ts:1330).
- `updateNestedItemInTypedFile`: prior = `priorNested` (block-api.ts:1515).
- `writeBlockForDir` whole-block: prior matched by oid then id in `stampWholeBlockIdentity` (1698–1700); an item carrying a different non-empty oid than its on-disk match throws.

Runtime evidence (all PASS): update injecting a different oid throws; whole-block write injecting a different oid throws; whole-block write that DROPS an item's oid re-preserves it from the prior (matched by id); rejected mutations leave the on-disk oid unchanged.

**LOW observation (block-api.ts:707–711):** in the `update` branch, when the prior has NO oid (`priorOid === undefined`) AND the incoming item carries a well-formed oid (`OID_PATTERN` matches), neither preserve nor mint fires, so the caller-supplied oid is KEPT verbatim. Runtime-confirmed: `prepareItemIdentityForWrite(..., "update", priorWithoutOid)` with an incoming `abcdef…` oid returned that exact oid. This is not an immutability violation (there is no prior oid to change), but it lets a caller assign an arbitrary oid on the first stamping write of a previously-unstamped item, rather than minting one. The reachable path is an update whose `updates` payload (or whole-block item) injects an oid onto an item that predates stamping. Impact is bounded: it only affects never-before-stamped items, the oid must already match the 32-hex shape, and there is no cross-item collision check anywhere in the model. Recommended fix: in the no-prior-oid update branch, always mint (ignore/strip an incoming oid) so oid provenance is always substrate-minted, never caller-asserted. Severity LOW — not a regression and not an immutability bypass; a provenance-tightening.

---

## Probe 3 — content_parent correctness — CLEAN

`prepareItemIdentityForWrite` (block-api.ts:684–735):
- **create**: mints oid, computes hash, `putObject`, sets NO `content_parent` (687 comment + no assignment). Runtime: v1 item had `content_parent === undefined`. PASS.
- **content change on update**: `content_parent = priorHash` when `priorHash !== hash` (726). Runtime: after body change, `content_parent === prior.content_hash`, hash moved, oid stable. PASS.
- **no-op-content write (metadata-only / author re-stamp)**: parent NOT advanced — prior's own `content_parent` is PRESERVED (728–729). Runtime: a `modified_by`-only update left `content_hash` unchanged AND `content_parent` unchanged (preserved, not dropped, not advanced). PASS. The Merkle chain is not truncated by metadata churn.
- v1 no-op re-stamp (no prior hash, no prior parent): `content_parent` deleted so no stale value lingers (733).

Divergence #3 (content_parent PRESERVED on no-op) is the correct, chain-preserving behavior and matches the plan's locked decision 3.

---

## Probe 4 — floor cannot be un-excluded — CLEAN

`metadataFieldsForSchema` (block-api.ts:389–395) = `MANDATORY ∪ (override ?? DISCRETIONARY)`; `MANDATORY = {id,oid,content_hash,content_parent}` is unioned back AFTER the override replaces the discretionary set, so no override can pull a floor field into the content. The override collector (`collectArrayItemMetadataOverrides`, consumed at 391) reads the RAW `x-identity.metadata_fields` value; the union is over the override itself, not a defaulted value (confirmed: `metadataFieldsByArrayKey` cache at 516–519 resolves through the same single function).

Runtime evidence (all PASS): an override `metadata_fields: ["modified_by"]` (omitting id/oid/content_hash/content_parent) still reported all four floor fields as metadata; two items identical-but-for-`id` produced byte-equal content projections under that override.

---

## Probe 5 — substrate_id throws, not degrades — CLEAN

`substrateIdForDir` (context-dir.ts:471–501) throws on: absent config.json, unreadable file, invalid JSON, and missing/pattern-invalid `substrate_id` (validates `^sub-[0-9a-f]{16}$` via `SUBSTRATE_ID_PATTERN`). No fallback, no lazy mint, no config write on the read path. `substrateIdFor(cwd)` = `substrateIdForDir(resolveContextDir(cwd))`.

Runtime evidence (PASS): `substrateIdForDir` throws when config lacks substrate_id and when config is absent (identity-stamp.test.ts).

Config state: active `.context-jit-spec-v2/config.json` carries `substrate_id: "sub-2668a102413f6aea"` (valid). `.project/config.json` and `.context/config.json` carry NO substrate_id and are NOT in `git diff` (untouched). Aligns with the plan's "stamping only fires where substrate_id already exists" — `.project`/`.context` schemas lack identity fields (Probe 6), so the gate never fires there and the throw never triggers.

---

## Probe 6 — no surprise stamping (regression guard) — CLEAN

Schema-gate `arrayDeclaresIdentityFields` (block-api.ts:550–554) returns true only when an array's item subschema declares ALL THREE of oid/content_hash/content_parent (`collectArrayItemIdentityDecisions`, 342–368). `prepareItemIdentityForWrite` short-circuits to a pass-through (returns the original `item`, no substrate_id read, no hash, no `putObject`) when the gate is false (672–674).

Exactly **38** schema files declare the identity fields repo-wide: 22 in `.context-jit-spec-v2/schemas/` + 16 in `packages/pi-context/samples/schemas/` (grep for `"content_parent"`, node_modules excluded). NO `.project/schemas/`, `.context/schemas/`, or `registry/` schema is edited (`git diff --name-only` filtered: NONE).

Runtime evidence (all PASS): a write through a non-identity schema produced no `oid`, no `content_hash`, and left the object store directory untouched (object count unchanged). The behavior change is scoped exactly to the 38 edited schemas.

---

## Probe 7 — schema edits semantically additive-only — CLEAN

38 edited schema files (16 samples + 22 jit-spec-v2), matching the plan. Per-file canonical comparison (`jq -S` of `git show HEAD:` vs working tree, diffing sorted-key forms) shows the ONLY semantic delta in every file is the addition of the three optional item properties (`oid`/`content_hash`/`content_parent`, each `type: string` + pattern + description) plus a `version` bump. The raw `git diff` "suspicious" `required`/`enum`/`additionalProperties`/`pattern` lines were pure reserialization (matched +/- pairs that cancel in canonical form), exactly as the implementer flagged (divergence #2 — cosmetic).

Confirmed NOT changed: no identity field appears in any `required` array (jq scan of every `required[]` across all 38: empty). No enum, pattern (on pre-existing fields), or other property altered. Version bumps verified (e.g. tasks 1.0.0→1.0.1, framework-gaps 1.1.0→1.1.1, phase 2.0.0→2.0.1).

---

## Probe 8 — migration decls present + valid — CLEAN

Two new (untracked) migration files: `packages/pi-context/samples/migrations.json` (16 decls) + `.context-jit-spec-v2/migrations.json` (22 decls). Every bumped schema has a matching `identity`-kind decl with `fromVersion`/`toVersion` exactly equal to the schema's old→new version (38/38 cross-checked OK; no MISSING DECL, no MISMATCH). `identity` is a valid `kind` per `packages/pi-context/schemas/migrations.schema.json` enum (`identity`, `declarative-transform`).

Existing-item reads validate: `readBlockForDir` over real jit-spec-v2 blocks (decisions 11, framework-gaps 1, features 5, tasks 6, concepts 5, axioms 3 — all 0 pre-stamped) succeeded. Blocks without an envelope `schema_version` (most) validate directly against current schema (identity fields optional → existing unstamped items pass); `concepts`/`axioms` carry envelope `schema_version: 1.0.0` and route through the 1.0.0→1.0.1 identity migration without throwing — which also exercised `getProjectMigrationRegistryForDir`, confirming the new migrations.json loads and validates via the registry loader.

`created_by` in the migration decls is `human/davidryan@gmail.com` (slash). Initially suspected an inconsistency vs the `human:` form in block items, but this is the CANONICAL form: `writerToString` (dispatch-context.ts:80) serializes human writers as `human/${user}`. The `human:` in some block items is the CLI literal-writer-string convention, not the DispatchContext serialization. The migrations.json form is correct; the schema places no pattern constraint on `created_by`.

---

## Probe 9 — informed-confirm scoping — CLEAN

`auth-gate.ts` diff is exactly: one import (`describeIdentityOverride` from `@davidorex/pi-context/block-api`) + an enrichment block (156–179). The enrichment fires only when `event.input.schema !== undefined` AND `describeIdentityOverride(parsed) !== null`. When there is no schema payload (write-schema-migration) or no override, `message` is the unchanged `tool ${toolName} requested; args: ${argSummary}` — byte-identical to pre-Cycle-3. No other `summarizeArgs`/confirm/identity-mutation logic changed. pi-agent-dispatch has only `auth-gate.ts` + `auth-gate.test.ts` modified (`git diff --name-only`).

`describeIdentityOverride` (block-api.ts:418–439) is pure: no fs/process/cache (grep of body region empty), inspects only the passed schema via `collectArrayItemMetadataOverrides` (the SAME traversal the projection uses) and reports drops/adds against the SAME `MANDATORY_METADATA_FIELDS`/`DISCRETIONARY_METADATA_FIELDS` constants — one source of truth, no drift.

Test evidence (all 5 new vitest cases PASS): override → enriched; JSON-string override → enriched; no override → byte-identical (explicit `strictEqual`); write-schema-migration no-payload → byte-identical; non-JSON-string schema → not enriched. (vitest also emitted a spurious "No test suite found" Failed-Suites line for the file — a harness artifact; every assertion in the file ran and passed. The implementer's 91/91 derives from the proper `npm test` run, not this single-file invocation.)

---

## Probe 10 — divergence assessment

1. **Direct `migrations.json` write (no ForDir variant of `appendMigrationDecl`).** ACCEPTABLE for this cycle, with a follow-up. The only canonical writer is `appendMigrationDecl(cwd, decl, ctx)` (migrations-store.ts:168) — cwd-resolved via the active pointer; there is genuinely no `appendMigrationDeclForDir`. Writing to a non-active substrate's migrations.json (e.g. samples while the pointer is on jit-spec-v2) therefore has no canonical surface. The resulting files are structurally valid and load/validate via the registry loader (proven in Probe 8). This is a real missing-primitive gap (an FGAP-worthy `appendMigrationDeclForDir`, mirroring the block-api ForDir family) — recommend filing it — but does not compromise Cycle-3 correctness. The `created_by` form is canonical (Probe 8).
2. **Schema-file reserialization (cosmetic diff expansion).** ACCEPTABLE. Canonical jq-sorted comparison confirms the only semantic change per file is the 3 optional props + version bump (Probe 7). The whitespace/key-order churn is noise, not behavior.
3. **content_parent PRESERVED on no-op-content write.** ACCEPTABLE and correct — it is the chain-non-truncating behavior the plan's locked decision 3 specifies (Probe 3). Not a divergence in substance; the plan text and the code agree.
4. **`describeIdentityOverride` consumed via the `@davidorex/pi-context/block-api` subpath (not index.ts).** ACCEPTABLE. The subpath is a declared export (package.json `exports["./block-api"]`); the plan said "exported via index.ts/subpath" — subpath satisfies it. No public-surface concern.

---

## Summary

All 10 probes CLEAN. Green is real: the dedicated identity-stamp suite (17/17), content-projection+content-hash (16/16), and the auth-gate informed-confirm cases (5/5) pass via tsx/vitest; runtime exercises confirm create/update/no-op/immutability/floor/no-surprise-stamping behave as specified against real substrate state and a scratch substrate. The invariants hold: single oid-immutability enforcement point reached with prior on every update path; content_parent set-on-change / absent-v1 / preserved-on-no-op; floor unconditionally excluded; substrate_id throw-not-degrade; stamping scoped to exactly 38 edited schemas with 38 matching identity migration decls; auth-gate non-override confirm byte-identical.

**FLAGs by severity:** 0 high, 0 medium, 1 low.
- **LOW (block-api.ts:707–711):** update on a never-stamped item with a well-formed incoming oid keeps the caller-asserted oid rather than minting. Provenance-tightening, not an immutability bypass. Recommend: always mint in the no-prior-oid update branch.

**INFO / follow-up:** file a `appendMigrationDeclForDir` gap (divergence #1) — non-active-substrate migration declarations currently have no canonical write surface.
