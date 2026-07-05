# Milestone-validity gate — PHASE-M6-CURRENCY-CONVERGENCE (2026-07-05)

Fresh strict validation of all phase members against current code before TASK-084 enters the pipeline. Members read via `pi-context` CLI ops only (resolve-items-by-id, read-config, read-block-item, read-block-page/filter-block-items, read-schema, find-references, context-current-state); code read directly. Every claim below is from a read performed today.

Member set: PHASE-M6-CURRENCY-CONVERGENCE, TASK-084..091, FEAT-011, FGAP-116, design basis `analysis/2026-07-05-currency-foreclosure-shape.md`.

## Verdict

**VALID — no BLOCKING findings. TASK-084 may enter the pipeline.** Three ADVISORY findings (correct at their task's time), one determined open question (the expand-contract gate's verdict for TASK-085, resolved below), zero line-anchor drift.

## 1. Reference accuracy — every file:line anchor holds today

| Anchor (member) | Verified content | Status |
|---|---|---|
| context-sdk.ts:787-790 isCompleted (TASK-084, FGAP-116) | `const isCompleted = (itemId) => { … bucket(loc.item) === "complete" }` — buckets STORED status via `index.byRefname` | HOLDS |
| context-sdk.ts:835-836 unsatisfiedGates (FGAP-116) | `const unsatisfiedGates = (itemId) => gatePredsOf(itemId).filter(… !isCompleted(target))` | HOLDS |
| context-sdk.ts:946-963 milestones rollup (TASK-084, FGAP-116) | `const milestones …` loop over `sd.rollups`, membership edges + `isCompleted(memberId)` per member, derived in memory, never persisted, never consulted by isCompleted | HOLDS |
| context.ts:316-328 InvariantDecl (TASK-085) | interface spans exactly 316-328; `class: "requires-edge" \| "status-consistency"` union | HOLDS |
| context-sdk.ts:2435-2501 validateContext loops (TASK-085) | requires-edge loop 2435-2458; status-consistency loop 2471-2501; forward-compat skip `if (inv.class !== "requires-edge") continue;` at :2436 | HOLDS |
| block-api chokes / lock (TASK-087, shape report) | `withBlockLock` :45 (per-file); append :1055/update :1342/upsert :1404/remove :1494 each wrap `withBlockLock`; writeTypedFile :870-967 with schema_version converge-stamp :898-919 carrying the literal "truthful by construction" comment | HOLDS |
| content-hash.ts:82 `computeFileContentHash` (TASK-089) | `export function computeFileContentHash(filePath: string): string` at :82; consumed by install/update machinery in index.ts | HOLDS |
| block-api.ts:674-676 identity-stamp gating (TASK-089 "mirroring identity-stamp gating") | `if (!arrayDeclaresIdentityFields(schemaPath, arrayKey)) return item;` | HOLDS |
| block-api.ts:734-742 content_parent advance (TASK-087) | advances only on content change; preserved on metadata-only writes | HOLDS |
| samples/schemas/milestone.schema.json status description (TASK-091, FGAP-116) | "authored status is rejected by canon (substrate-derived-state)" — present in BOTH the packaged schema (:42) and the installed copy (read-schema on the live substrate returns identical text) | HOLDS |

No line drift found in any member's cited anchor.

## 2. Mechanism truth

- **state_derivation.rollups (live config, read-config)**: one entry — `{kind: "milestone", membership_relation: "phase_positioned_in_milestone", complete_status: "reached", incomplete_status: "planned"}`. TASK-084/085/086/087's config-declared trigger/kind set exists as described.
- **role_direction (live config)**: `task_gated_by_item` = as_child, `task_depends_on_task` = as_parent, `phase_positioned_in_milestone` = as_child. TASK-087's trigger derivation basis (`sd.rollups` + `role_direction`) is real; currentState already partitions by it (context-sdk.ts:816-832, :948).
- **Live invariants (read-config)**: 12 declared, matching the shape report's enumeration. `reached-milestone-phases-complete` carries `when_bucket: "complete"` — one-directional exactly as FGAP-116/TASK-085 state. `task-completed-feature-complete` exists, warning severity, block tasks — TASK-088's demo target is real.
- **Expand-contract gate verdict for TASK-085 (determined — the task left it "per the gate's verdict")**: `scripts/check-config-schema.ts` `diffSchemaShapes` walks ONLY the `properties` trees and `items` (walk(), :61-87), recursing through nested `properties`/`items`; it never descends into `oneOf` arrays. A new oneOf branch under `properties.invariants.items.oneOf` therefore produces ZERO findings → **the gate passes with NO version advance and NO migration declaration required**. Current schema version is "1.8.0" and invariants are already oneOf-discriminated by `const class` (config.schema.json:4, :166-192). The shape report's "1.8.0→1.9.0" is optional discipline, not gate-forced; if the implementer advances the version anyway, a packaged config migration reaching the new version is needed for gate pairing and for stamped substrates to keep loading. The implementer is not guessing: additive branch alone = gate-clean at 1.8.0.
- **Per-file lock discipline (TASK-087)**: real — every item-grain choke wraps its read-modify-write in `withBlockLock(filePath, …)` (block-api.ts:45, :1064, :1352, :1421, :1506); writeTypedFile deliberately does not lock (callers hold the lock, :861-868). Cross-file fan-out = sequential acquisition of distinct file locks; no lock ordering topology exists today to deadlock against — TASK-087's criterion (sequential acquisition + fan-out test) is the correct demand.
- **DispatchContext / attestation (TASK-086)**: writeTypedFile ctx-stamps when the envelope declares author fields (:884-890); `prepareItemIdentityForWrite` :662-744 as described.
- **auth-gating precedent (TASK-086 "auth-gated as a write ceremony")**: `authGated: true` is set on the mutating ops in ops-registry.ts (:944, :1216, :1258, :1348, :1396, :1416, :1458, :1493, :1508, …) — the qualifier is derivable from parity with existing write ops. (Incidental: the file-head comment ops-registry.ts:14-16 still says "authGated is left unset in this phase" — stale comment, contradicted by the entries; not a member-text defect.)
- **Parity gate (TASK-086)**: `scripts/parity-check.ts` exists and runs in `.husky/pre-commit`.
- **Ops the demos need**: `context-current-state`, `context-status`, `context-validate` all reflected (ops-registry.ts:952, :978, :1173). No `context-reconcile` exists yet (correct — TASK-086 creates it).
- **Schemas for TASK-089**: research `stale_conditions` items are bare `{"type":"string"}` (research.schema.json:144-149); `citations` items require only `label`, optional `path`/`lines`/`url`/`retrieved_at`, `additionalProperties: false` (:151-177); framework-gaps `evidence` items require `file`+`reference`, `additionalProperties: false` (:81-107). The additive oneOf + optional-pin plan is shape-accurate; `additionalProperties: false` means the pin field must be added to the schemas (both are in TASK-089's files list).

## 3. Live-instance truth

- **MILE-003 stored status = "planned"** (read-block-item) while `context-current-state` derives MILE-003 `reached` in milestones[] AND lists it in blocked[].blockedBy of TASK-003, TASK-004, TASK-021, TASK-068, TASK-074 — FGAP-116's live instance verified end-to-end today.
- **TASK-084 criterion 1's named set is exactly right**: TASK-021/068/074 are blocked SOLELY by MILE-003 (would derive unblocked); TASK-003/004 are additionally blocked by MILE-005 (derives planned — would stay blocked). The criterion's choice to name only 021/068/074 is the correct derivation, not a narrowing defect.
- **Dependency edges match the notes**: TASK-086/087/088/090 each blocked by TASK-085; TASK-089 blocked by TASK-086; TASK-084, TASK-085, TASK-091 unblocked (context-current-state blocked[]). Matches every task's stated dependency.
- **Edges**: all 8 tasks `task_positioned_in_phase` → PHASE-M6-CURRENCY-CONVERGENCE; phase `phase_positioned_in_milestone` → MILE-006; TASK-084..087 `task_addresses_gap` → FGAP-116; all 8 `task_addresses_feature` → FEAT-011; FGAP-116 `gap_addressed_by_feature` → FEAT-011 (find-references).
- **No substrate-derived-state convention exists**: filter-block-items on conventions (id matches "derived") returns empty; the citation is dangling in both packaged and installed milestone schema — TASK-091's premise verified.

## 4. Cross-member coherence

- **T1 (084) vs T4 (087) layering — complementary, and the texts say so**: T1 makes gate satisfaction consult the derivation within the read (self-consistency regardless of storage); T4 makes storage converge on engine writes; T2 (085) detects out-of-band divergence both directions; T3 (086) repairs it. TASK-087 explicitly assigns out-of-band drift to "the invariant class + reconcile's territory"; the phase intent orders members by this dependency. T1 is NOT redundant after T4: hand edits/merges can still desynchronize storage, and T1 keeps the read truthful anyway. No two members assume conflicting derived-status semantics: the rollup emits the config-declared `complete_status`/`incomplete_status` raw values, comparisons route through the shared bucket vocabulary everywhere (currentState :757-758, validateContext :2469-2470), and TASK-085's stored-vs-derived comparison is well-defined against those raw values.
- **T3 (086) "designed for extension" ↔ T6 (089) "extends its sweep"**: bidirectionally stated — TASK-086 names the typed-staleness task as the extender; TASK-089 names context-reconcile as the transition applier. Coherent; dependency edge (089 ← 086) matches.
- **T5 (088) delta-scoping vs T2 (085) invariant class**: shared-helper identical-verdict demanded by both; the edge-gate precedent (assertEdgeValidForWrite :1663-1670 sharing validateEdgeAgainstRegistry :1602-1635 with validateContext) verified real. The write path already pays buildIdIndex on relation appends (buildWriteTimeEdgeValidator :1651) — TASK-088's cost claim verified.
- **T7 (090) driftWarnings classification "matching validateContext's"** depends on T2's vocabulary — dependency edge exists. build-html-views.ts consumes the roadmap-plan milestone view, not currentState's payload (grep: zero currentState reads) — the additive-shape tolerance claim is trivially satisfied for that consumer.
- **Phase goal ↔ criterion 9**: residue statements ride TASK-086 (op surface) and TASK-090 (op strings) — both tasks carry the residue deliverable. Coherent.

## 5. Testability

Every acceptance criterion names an observable (a CLI read result, an on-disk value, a test, a gate outcome, an op-result field). No vibes-criteria found. Two criteria need the corrections below to stay demonstrable as written (findings 1 and 3).

## 6. Provenance (task text vs FEAT-011 criterion + shape report)

Diffed each task against its cited criterion and the shape report section. All augment-looking elements trace: non-rollup/no-state_derivation regression clauses (feature invariant + shape §5); TASK-086's "v1 scope" split (the phase intent itself names "context-reconcile op v1" and typed-staleness as separate members); "auth-gated" (parity with existing authGated write ops, above); TASK-089's gap-evidence pins (feature description Class C/D + shape S6); TASK-091's "authored writes to a derived field are refused" (the milestone schema's own "authored status is rejected by canon" text); TASK-091's other-dangling-citations sweep (fix-the-class convention, cited in-text). **No unowned narrowing or augmentation found.**

**FGAP-116 proposed_resolution coverage**: four mechanism elements → TASK-084 (isCompleted consults rollup), TASK-087 (converge-on-write), TASK-085 (invariant class both directions), TASK-086 (reconcile); the dangling-canon correction → TASK-091. No resolution element unowned; no task element outside the resolution + feature basis.

## 7. Findings

| # | Severity | Member | Finding |
|---|---|---|---|
| 1 | ADVISORY (correct at TASK-089 time) | TASK-089, FEAT-011 motivation | **R-0012 is no longer `complete` — it reads `status: "stale"` (modified 2026-07-05T06:53Z, human writer), and its stale_conditions are still bare strings.** TASK-089's criterion "the R-0012 case ({item-status, FGAP-066, complete}) is expressible and fires against the live substrate" is no longer demonstrable as written: the flag targets *complete* research with a fired typed condition, and R-0012 is stale. The case stays expressible; the live-fire demo needs a fixture (or a criterion correction to "expressible; fires on a fixture reproducing the R-0012 shape"). FEAT-011's motivation clause ("R-0012 sat complete 25 days…") is now historical narrative — accurate about the audit moment, not current state. |
| 2 | RESOLVED DETERMINATION | TASK-085 | **The expand-contract gate's verdict, determined**: `diffSchemaShapes` (check-config-schema.ts:61-87) never descends into `oneOf` — an additive invariants oneOf branch yields zero findings, so **no version advance and no packaged migration are required by the gate**. Advancing the version anyway (the shape report's optional 1.9.0) would require a packaged config migration declaration reaching the new version. Implementer guidance: additive branch at version "1.8.0" is gate-clean. |
| 3 | ADVISORY (correct at TASK-091 time) | TASK-091 | **FEAT-011's existing `item_acknowledges_missing_convention` edge targets FGAP-052** (find-references), whose subject is the *bootstrap-state/identity* missing-convention — not a gap tracking the missing substrate-derived-state convention. The acknowledgment is mis-anchored today. TASK-091's flip instruction is still executable (the edge exists and gets replaced by `item_governed_by_convention` → the new convention), but the implementer must know the edge to remove is the FGAP-052-targeted one, and should not "fix" FGAP-052 in passing (its own resolution belongs to DEC-0001/DEC-0003). |
| 4 | ADVISORY (correct at TASK-089 time) | TASK-089 | Criterion "Both schema changes pass the expand-contract/narrowing gates" — **no commit-time shape gate covers `samples/schemas/*.schema.json`**; check-config-schema.ts is scoped to `packages/pi-context/schemas/config.schema.json` only (SCHEMA_PATH :31). The narrowing protection for installed block schemas lives in the `/context update` resync validation path (narrowing same-version resync blocks — install-subcommand.test.ts:711). The criterion's observable should be restated as: additive change validates existing data unchanged + `/context update` resync accepts it; there is no pre-commit gate to "pass" for these files. |

Incidental (not member text, not gated here): ops-registry.ts:14-16 head-comment claims authGated is unset across ops while 10+ entries set `authGated: true` — stale code comment, candidate for cleanup whenever ops-registry.ts is next touched.

## 8. Gate disposition

TASK-084's every anchor, mechanism presupposition, criterion observable, and provenance element verified against today's code and substrate: **clear to enter the pipeline**. Findings 1/3/4 attach to TASK-089 and TASK-091 and are corrections to apply (provenance-gated grants) at or before those tasks' pipeline entry; finding 2 removes TASK-085's one deliberately-open question.
