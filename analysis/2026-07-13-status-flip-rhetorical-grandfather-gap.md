# Status-flip blocked by grandfathered rhetorical violators: item-grain diff-scoping under a growing write-time rule set

Investigation of the experience gap hit on merged main (cb505c31) with the freshly promoted operator CLI: `pi-context complete-task --taskId TASK-131 --verificationId VER-114` exits 1 with `block file 'tasks.json': rhetorical-criteria violation on field 'acceptance_criteria': array element matched prohibited pattern "previously"`. Investigated 2026-07-13 at cb505c31.

## Verdict

Confirmed, reproduced, and class-characterized. "Diff-scoped" enforcement is ITEM-grain, not field-grain: every update primitive threads the WHOLE merged item into the rhetorical gate, so a status-only mutation re-asserts every budgeted field and bare-string-array element of the item against the gate's CURRENT rule set. An item whose text was filed validly before an enforcement extension landed (TASK-130's bare-string-array coverage being the trigger here) cannot receive ANY engine write — including the closure transition every item must eventually receive — without its text being amended first. The substrate does not track this gap; a new class-level FGAP filing is justified.

## 1. Root cause

Two facts compose:

**(a) The update primitives thread the whole merged item as the "changed" unit.**
`updateItemInTypedFile` (`packages/pi-context/src/block-api.ts:1537`) builds `const merged = { ...prior, ...updates }` and passes the entire merged item to the write funnel (`block-api.ts:1547-1549`):

```ts
writeTypedFile(filePath, schemaPath, rewriteParent(patched), undefined, label, [
    { arrayKey: arrayPath ?? "__top__", item: updated },   // <- whole merged item
]);
```

The same shape holds for upsert (`block-api.ts:1658-1660`, whole stamped replacement item) and the nested-item update (`block-api.ts:1849-1851`, whole merged nested item).

**(b) The gate checks every budgeted field of each threaded item.**
`writeTypedFile` runs `validateRhetoricalCriteriaForItems` over `changedItems` (`block-api.ts:1061-1073`). Per item, `checkFieldsAgainstSchema` (`rhetorical-criteria.ts:231-286`) tests EVERY `x-prompt-budget`-bearing string field against word caps and `DEFAULT_PROHIBITED_PATTERNS` (`rhetorical-criteria.ts:65-90`; `\bpreviously\b` at :67), and `walkNestedArrays` (`rhetorical-criteria.ts:317-369`) tests every element of every budgeted bare-string array (the branch at :334-358, added by TASK-130). Nothing in the check path knows which fields the write actually touched — `updates` keys are not threaded, and there is no compare-against-prior.

So "diff-scoped" (the safety property stated at `rhetorical-criteria.ts:25-29` and in the CHANGELOG entries for TASK-121 and TASK-130) means: only the item(s) a write created or merged are checked, never sibling items of the same file. It has never meant field-grain. The stated register is precise about this — CHANGELOG (`packages/pi-context/CHANGELOG.md`, the TASK-121 entry): "a pre-existing grandfathered violator on an untouched ITEM never blocks an unrelated forward write." The touched item's untouched FIELDS have no such protection, and a status flip touches the item by definition.

**Confirmed:** a status-only update re-validates untouched sibling fields of the same item. The grandfathering intent (TASK-121 was explicitly diff-scoped "to avoid bricking future writes on pre-existing violations") was implemented one grain too coarse for the one write class every item must eventually receive: its closure transition.

Why TASK-131 specifically: `tasks.acceptance_criteria` is a budgeted bare-string array (`packages/pi-context/samples/schemas/tasks.schema.json`, `properties.tasks.items.properties.acceptance_criteria.items` carries `x-prompt-budget: {words: 800}`). Its criteria were filed before TASK-130 extended enforcement to bare-string-array elements (per FGAP-139's closure: the mechanism was "structurally blind" to that shape before). The moment TASK-130 merged, that filed-valid text became a write-blocker on the item.

## 2. Shape — affected and unaffected surfaces

Every caller of the merge/replace update primitives is affected. Enumerated from a full caller sweep (non-test):

| Surface | Site | Effect of a grandfathered violator on the target item |
|---|---|---|
| `complete-task` op | `context-sdk.ts:3443` (`updateItemInBlock(... { status: "completed" })`) | Closure REFUSED — the reported symptom. Note the closure atom is non-atomic under failure: the `verification_verifies_item` edge is appended at :3435 BEFORE the status flip, so a refused flip leaves the edge filed and the task un-completed. |
| `update-block-item` op | `ops-registry.ts:702` | Any field update refused, incl. status-only. |
| `context-reconcile` staleness sweep | `index.ts:3225` (`applyStalenessTransitions`) | A live converge run WEDGES: the throw propagates out of the per-transition loop, aborting `reconcileContext` mid-sweep with earlier writes already applied and later ones (plus the result report) lost. Trigger requires a complete-bucket, `stale_conditions`-bearing item (research is the only bearer, and its `question`/`method`/`findings_summary` are budgeted scalars) carrying a prohibited token. The active substrate holds research items matching `DEFAULT_PROHIBITED_PATTERNS` in `findings_summary` (R-0004, R-0017 — both already `stale`, so today's complete→stale sweep skips them, but they wedge any other update, and FGAP-074's audit found 11/11 research items carrying rule-5 narration). |
| `context-reconcile` derived-status deltas | `index.ts:3292` (`applyDerivedStatusDeltas`) | Same wedge shape, currently LATENT: the only rollup kind is `milestone` (conception.json `state_derivation.rollups` + the sole `derived-status` invariant `milestone-status-converges`), and the milestone item schema — active copy read via `read-schema` — declares no `x-prompt-budget` anywhere. Becomes live the day any budgeted kind becomes a rollup kind. |
| Converge-on-write hook | `index.ts:3320-3334` (`convergeDerivedStatusAfterWrite`) | Worse than a wedge: the catch-all swallows the `RhetoricalValidationError`, so convergence SILENTLY fails, permanently, for an affected rollup item — stored/derived divergence with no error surface (latent for the same milestone-schema reason). |
| `promote-item` | `promote-item.ts:276-283` | Step (10) marks the SOURCE superseded via status-only update — promotion refused when the source item is a grandfathered violator. |
| `rename-canonical-id` | `rename-canonical-id.ts:118` | An id-only rename refused. |
| Workflow block steps | `packages/pi-workflows/src/step-block.ts:234` (update), `:275` (updateNested) | A workflow's block-update step fails; block artifact write failures are fatal to the workflow. |
| `upsert-block-item` op / `upsertItemInBlock` | `ops-registry.ts:1073` → `block-api.ts:1658` | Replacement semantics: the supplied full item is threaded, so a read-modify-write that carries the old text forward to change one field is refused. (Arguably closer to correct — the payload re-authors the text — but it makes single-field maintenance via upsert equally impossible.) |
| Nested-item update | `block-api.ts:1849-1851` | Same item-grain issue one level down: the whole merged NESTED item is threaded. |

**Not affected:** append paths (`appendToTypedFile`, `appendToBlockForDir` at `block-api.ts:2120-2128`) thread only the genuinely new item — enforcement at the causal write, working as designed (verified live, see §4); remove paths (`removeFromTypedFile`, `block-api.ts` — its `writeTypedFile` call passes no `changedItems`); genuine whole-block overwrites (`writeBlock`/`writeBlockForDir` with no `changedItems` — bulk import, migration reconciliation, `/context update`); relation/edge writes (relations carry no budgeted fields and thread no items).

## 3. Minimal reproduction

Scratch substrate (no MAIN-substrate writes), driving the real library write path (`updateItemInBlockForDir` → `updateItemInTypedFile` → `writeTypedFile` → `validateRhetoricalCriteriaForItems`) from the current build's dist:

1. `repro-substrate/` containing:
   - `schemas/tasks.schema.json` — verbatim copy of `packages/pi-context/samples/schemas/tasks.schema.json` (v1.1.0)
   - `config.json` — `{"substrate_id": "sub-0123456789abcdef"}` (identity stamping refuses to write without it)
   - `tasks.json` — envelope `schema_version: "1.1.0"`, two items, both `status: "in-progress"`:
     - `TASK-001` with `acceptance_criteria: ["op output matches what was previously documented for the flag"]` (the grandfathered violator, written directly to disk — exactly how pre-enforcement content exists)
     - `TASK-002` with clean `acceptance_criteria` (control)

2. `npx tsx -e "import { updateItemInBlockForDir } from '@davidorex/pi-context/block-api'; updateItemInBlockForDir(dir, 'tasks', 'tasks', t => t.id === 'TASK-001', { status: 'completed' })"`

Observed (verbatim):

```
TASK-001 status flip: THREW RhetoricalValidationError -- block file 'tasks.json': rhetorical-criteria violation on field 'acceptance_criteria': array element matched prohibited pattern "previously" — prior-state narration ('previously') — state current content, not its history
TASK-002 status flip: SUCCEEDED
```

Identical error text to the reported `complete-task` failure — same code path (`completeTask` calls the same primitive with the same `{status}` update at `context-sdk.ts:3443`). The clean control succeeding isolates the untouched violating field as the sole cause.

## 4. Controls — the gate is correct at the causal write; the workaround exists

Same scratch substrate, same session:

- **Append of a NEW violator is refused** (`appendToBlockForDir` with `acceptance_criteria: ["matches what was previously documented"]` → same `RhetoricalValidationError`). This is the gate's purpose working: new prohibited text is stopped at the write that authors it. It also establishes that grandfathered violators can only date from before an enforcement extension — the gate does not let new ones in.
- **Amend-text-plus-flip in ONE write succeeds** (`updates: { status: 'completed', acceptance_criteria: ['op output matches the documented flag behavior'] }` → SUCCEEDED). Text-amendment-first is the live workaround, and it needs no second write.

## 5. Class (gap-explore-surfaces-class)

This is an INSTANCE of a general class, not atomic:

**Retroactive write-time content-gate extension under item-grain diff-scoping.** Two structural facts, each general:

1. The diff-scoping grain is the item: any single-field engine mutation re-asserts the entire merged item against whatever the gate enforces NOW.
2. The gate's rule set grows over time with no grandfather baseline: TASK-121 (budgeted scalars) → nested-object descent → TASK-130 (bare-string-array elements); `DEFAULT_PROHIBITED_PATTERNS` itself is an extensible list. Schema SHAPE changes have a versioning + migration discipline (expand-contract, `validateBlockWithMigration`); register-rule extensions have nothing analogous — no version, no migration, no baseline.

Their product: **every enforcement extension retroactively converts filed-valid text into a blocker on all subsequent item-touching engine writes** — and the closure transition is the one write every item must eventually receive, so the blockage concentrates exactly on task/gap/feature closure and on deterministic engine loops (reconcile, converge, promote, rename, workflow steps). Each future extension (a new prohibited pattern, a newly budgeted field, a tightened cap) re-creates the same wedge over a new stratum of grandfathered content. Filing the TASK-131 symptom alone would leave the class as architectural debt and invite duplicate sibling filings on the next extension.

**Filing level:** one class-level FGAP — item-grain diff-scoping makes write-time content-gate extensions retroactive, blocking engine status transitions on grandfathered items — with the TASK-131 `complete-task` refusal as the triggering instance and the §2 table as the affected-surface enumeration. Relate to: FGAP-139/TASK-130 (the triggering extension), FGAP-043/TASK-121 (the grandfathering intent, stated and tested only at item grain), FGAP-074/TASK-044 (the grandfathered-content stock; its cleanup is complementary work, not a substitute for the grain fix — cleanup empties the current stratum, the grain fix stops every future stratum from wedging).

## 6. Prior art (substrate search, bare ops)

Searched `framework-gaps` (description, title, proposed_resolution), `tasks` (description), `decisions` (decision) via `pi-context filter-block-items --op matches`:

| Item | Status | Coverage |
|---|---|---|
| FGAP-043 | closed (TASK-121, VER-098) | The enforcement mechanism itself. Its resolution text mandates diff-scoping "to avoid bricking future writes on pre-existing violations" — the intent this gap shows was under-implemented. TASK-121's scoping-safety acceptance criterion tests only the cross-ITEM case ("unrelated item in a block with a pre-existing violator still writes successfully"). |
| FGAP-139 | closed (TASK-130, VER-109) | The bare-string-array extension that triggered the symptom. Both its closure text and TASK-130's acceptance criteria state grandfathering at item grain ("only written/changed items are checked"; "untouched pre-existing items never block an unrelated write") — factually accurate, and exactly the grain that leaves this gap open. |
| FGAP-074 | identified (P2) | The grandfathered-content stock: ~197 register violations across ~118 items, substrate-wide audit (`analysis/2026-06-09-rhetorical-register-block-audit.md`). Tracks the CONTENT, not the scoping grain. |
| TASK-044 | planned | FGAP-074's cleanup (broaden the review-checkpoint hook + rewrite the ~118 violating bodies). Would empty the active substrate's current violator stock but does not fix the grain, does not cover other substrates, and does not protect against the next enforcement extension. |
| FGAP-014 | closed | complete-task's earlier unrelated breakage (schema-field migration). Not this. |

No existing FGAP/TASK/DEC tracks the diff-scoping grain, grandfathered-content write-blocking, or engine-transition wedging. **New filing justified.**

## 7. Disposition options (grounded in the code)

1. **Value-grain diff-scoping (recommended shape).** Thread the PRIOR on-disk item alongside the merged item in each `changedItems` entry (the three threading sites already hold it in hand: `prior` at `block-api.ts:1536`, `priorForIdentity` at :1629, `priorNested` at :1831), and in `checkFieldsAgainstSchema` / `walkNestedArrays` skip any field (and any bare-string-array element, or whole array) whose value deep-equals the prior value. Enforcement then fires on exactly the text that DIFFERS from what is on disk — the causal write of new prose — which is the gate's stated purpose. Status flips, reconcile, converge, promote, rename, and workflow steps pass over grandfathered text untouched; editing a violating field still trips the gate; upsert's carried-forward unchanged fields skip while genuinely edited text checks; appends have no prior, so every field is new and the current behavior is preserved. Tradeoff: violating text persists until deliberately amended — which is precisely FGAP-074/TASK-044's job, and the grandfathering intent of record; plus a per-field deep-equality cost on updates.
2. **Key-grain diff-scoping** (check only fields named in `updates`). Simpler thread (the update key set), but upsert has no key set (full replacement — everything counts as changed, so upsert stays item-grain), and a read-modify-write that re-sends an unchanged value still blocks. Strictly weaker than option 1 for equal wiring effort.
3. **Engine-write exemption for pure status/lifecycle transitions** (skip the gate when `updates` keys ⊆ an enumerated lifecycle-field set, or an internal flag on engine callers). Unblocks the enumerated engine paths but leaves every other single-field maintenance edit wedged (e.g. updating `notes` on an item with grandfathered `acceptance_criteria`), and creates a maintained exempt-list — a parallel semi-gated path, the pattern this project's architecture feedback forbids.
4. **Grandfather baseline by enforcement version** (enforce only content authored after the rule landed). Requires stamping a rule-set version per item/field and comparing at check time — machinery duplicating what option 1's value comparison gets for free, dependent on attestation timestamps that are not universally present on legacy items.
5. **Text-amendment-first as permanent policy (status quo).** Keeps maximum pressure toward FGAP-074 cleanup and needs no code. Costs: deterministic engine loops break (a live reconcile aborts mid-sweep with partial application; the converge hook fails silently forever for an affected rollup item); `complete-task` becomes non-atomic under refusal (edge filed at `context-sdk.ts:3435`, flip refused at :3443); and amending `acceptance_criteria` is not the engine's call to make — under the filing-provenance convention, requirement text carries user filing-authority, so closure would be coupled to an authored prose edit that may need user review. The one-write amend+flip (§4) mitigates ceremony cost but not the authority or engine-loop problems.

Against the gate's purpose — stopping NEW prohibited text at the causal write — option 1 is the only disposition that both preserves that purpose exactly and closes the whole class (every current and future enforcement extension inherits the value-grain skip with no per-extension work).

## Repro artifacts

`/private/tmp/claude-501/-Users-david-Projects-workflowsPiExtension/d3030496-e4e1-4bfa-8df1-1df86bac518a/scratchpad/repro-substrate/` (scratch; session-scoped).
