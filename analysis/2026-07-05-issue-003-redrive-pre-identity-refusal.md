# issue-003 re-drive: the refusal is identity-stamping, not validation — and the diagnostics misattribute it

**Date:** 2026-07-05. **Investigator:** orchestrator (Fable-direct), runtime experiment + code read. **Reproduction:** `scratchpad/issue003-redrive.ts` (two-cell fixture, deterministic).

## Question

issue-003's filed residual: re-drive the operator-substrate reproduction (conventions installed at 1.0.0, 45 valid rules; dry-run predicted resynced, live refused) with the since-shipped `blockedDetail` diagnostic, and fix or retire on the evidence.

## Method

Two identical scratch substrates — conventions schema installed at 1.0.0 (catalog body, version pinned back), a 45-rule block valid against 1.0.1 by construction, install baseline recorded — differing in exactly one variable: cell A's `config.json` carries **no `substrate_id`** (the pre-identity operator-substrate shape); cell B carries one. `updateContext` dry then live on each, real built dist.

## Result (observed)

| Cell | dry | live |
|---|---|---|
| A: no `substrate_id` | `migrated: ["conventions"]` | `blocked: ["conventions"]`, reason `validation-failed`, synthetic failure `keyword: "error"`, message `substrateIdForDir: config.json … has no valid substrate_id (expected ^sub-[0-9a-f]{16}$, got undefined)`; `premarker_hash` present (markers live-inscribed into the block); partialApplication reports registry additions applied alongside the block |
| B: `substrate_id` present | `migrated: ["conventions"]` | `migrated: ["conventions"]`, nothing blocked |

Root cause **confirmed** by single-variable isolation: the refusal is the mandatory identity stamp (DEC-0012, "no lazy mint on write") — `writeBlockForDir`'s `substrateIdForDir` throw inside `resyncSchema`'s catch (index.ts:1242-1270) — not item validation. The items were never invalid; dry-run diverges because `simulateResyncOutcome` runs migration + re-validation in memory and never exercises the write/stamp precondition.

## Follow-through experiment: the routed remedy dead-ends with a partial commit

The blocked path inscribes markers and persists a pending-blocked record routing the operator to `resolve-blocked`. Run on cell A's post-block state, `resolveBlocked(dir, "conventions")`:

- before: block marked, schema 1.0.0, pending-blocked present
- **threw uncaught**: `substrateIdForDir: … no valid substrate_id …`
- after: markers **stripped**, schema **advanced to 1.0.1**, block **unwritten/unstamped**, pending entry **still present**

The commit sequence (index.ts:2652-2688 — schema write, raw marker-strip write, `writeBlockForDir`, base advance, pending clear) runs outside the function's validation try; the stamping throw aborts it midway. On the substrate class where the blocked refusal itself is stamping-caused, the prescribed remedy always reaches this state.

## Findings

1. **issue-003 root cause = FGAP-033's mechanism** (already filed, `identified`, P2: pre-identity substrate schema re-sync is unsupported; DEC-0012's named deferred consequence). The issue is an instance; no separate fix belongs on the issue.
2. **Untracked class — refusal-cause conflation in the blocked pipeline.** `resyncSchema`'s catch classifies every throw as `validation-failed`, and everything downstream trusts that classification:
   - `blockedDetail` tells the operator to fix items that are valid (synthetic `keyword: "error"` failure carrying an infrastructure message in a validation costume);
   - failure **markers are inscribed into a fully-valid block file**;
   - the pending-blocked record routes to `resolve-blocked`, which on the same substrate **throws uncaught mid-commit and leaves partial state** — the only known violation of the per-component byte-exact refusal discipline (DEC-0017/DEC-0018);
   - the closed FGAP-066 guarantee ("dry predicts the precise outcome") is silently violated for exactly this class (dry `migrated`, live `blocked`).
3. **Prior-art coverage:** FGAP-033 covers the unsupported pre-identity path (design decision pending); FGAP-066 (closed) covers migrate/block prediction, not the stamping precondition; nothing covers the misattribution/markers/partial-commit facets. FGAP-076/FGAP-092 (closed today) cover partial-application legibility/contract, not this.

## Disposition (proposed, pending grants)

- issue-003 → `resolved`: root cause determined (FGAP-033 mechanism), reproducible conditions established, no validation defect exists.
- Relate issue-003 to FGAP-033 (`gap_relates_to_issue`).
- File ONE new class-level gap: non-validation throws in the resync/resolve pipeline are classified, diagnosed, marked, and routed as item-validation failures — with the four facets above as evidence and issue-003 as triggering instance; its fix is upstream classification at the catch, which also restores FGAP-066's guarantee derivatively.
