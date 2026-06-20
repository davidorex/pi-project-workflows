# TASK-020 criterion 3 — forensic history trace (mechanism vs. outcome)

Date: 2026-06-20
Scope: ONE criterion only — TASK-020 acceptance criterion 3 (the next-actions head-size + ready-tasks-surface-in-the-head outcome). Read-only investigation. No implementation.

Criterion 3 verbatim:
> "The next-actions head-size is config-declared (replacing the hardcoded NEXT_ACTIONS_CAP=15 slice at context-sdk.ts:864-865); with the shipped conception, ready tasks are no longer truncated below open gaps — a runtime demo against .context (>=15 open gaps) surfaces ready tasks in the ranked head"

Sources: claude-history (FTS5 + execute_sql against the session DB), `git log/show` on this working tree, and direct reads of `packages/pi-context/src/context-sdk.ts` + `.test.ts`. Every "done" claim below is backed by BOTH a conversation/tool-call hit AND a git commit or current source state.

---

## (a) Mechanism vs. outcome — what each is, and the done / not-done state

The criterion bundles TWO separable claims. The history shows them resolved to opposite states.

### MECHANISM — DONE (evidenced)

"The next-actions head-size is config-declared (replacing the hardcoded NEXT_ACTIONS_CAP=15 slice)."

- The literal `NEXT_ACTIONS_CAP = 15` is GONE from source. The cap is now `sd.head_size`, read from the config-declared `state_derivation` registry.
  - Current source: `packages/pi-context/src/context-sdk.ts:909` — `const cappedNextActions = nextActions.slice(0, sd.head_size);` (no `NEXT_ACTIONS_CAP` literal survives anywhere in `packages/pi-context/src/` except the type's doc comment; grep-confirmed in-session at 2026-06-17T08:49:28Z and 09:46:59Z, session `8490e49a`).
  - Type carrier: `packages/pi-context/src/context.ts:137` — `head_size: number;` on the `StateDerivation` interface.
- Commit that did it: **`99f45de`** "rewire currentState to derive focus/inFlight/nextActions/blocked/milestones from the config-declared state_derivation registry" (Wed 2026-06-17 16:45:24 +0800). Its body explicitly lists `nextActions head cap (was 15) -> sd.head_size`.
- The stock registry that ships `head_size:15` was added in **`e3c552e`** "ship the stock state_derivation registry in the packaged catalog" (`samples/conception.json`), and the live `.context/config.json` carries the same (confirmed live at 2026-06-20T01:11:52Z, session `8490e49a`: "head_size:15 ... on the live `.context`").
- Tests cover the mechanism: `context-sdk.test.ts:433` (`head_size: 15` in `STOCK_STATE_DERIVATION`), `:3254` (`head_size: 2` honored → truncates to 2).

Mechanism verdict: **DONE.** This matches the recorded position (VER-056 criterion-3 "mechanism met").

### OUTCOME — NOT DONE (evidenced)

"With the shipped conception, ready tasks are no longer truncated below open gaps — a runtime demo against .context (>=15 open gaps) surfaces ready tasks in the ranked head."

- The deriver iterates `sd.next_ranked` IN ARRAY ORDER, then slices to `head_size`. Current source `context-sdk.ts:855-859`:
  > `// Iterate sd.next_ranked IN ARRAY ORDER — array order IS the cross-kind push order (stock: priority-ranked gaps, then topo-ordered tasks).`
  > `for (const entry of sd.next_ranked) { ... }`
  followed by `:909` `nextActions.slice(0, sd.head_size)`.
  Stock `next_ranked` lists the gaps entry BEFORE the tasks entry, so ALL gaps are pushed before ANY task; with >= head_size open gaps, the slice is 100% gaps and every ready task falls below the head. This ordering was set in `e3c552e` and has NOT been reordered since (no later commit touches `next_ranked` order — see (b)).
- This exact failure is encoded as a passing test, `context-sdk.test.ts:3253-3287`: with `head_size:2` over 3 gaps + 1 task, the head is `["FGAP-1","FGAP-2"]` and "the task is hidden"; only with a head large enough to accommodate ALL gaps does the task appear. The test asserts the truncation-below-gaps behavior as correct-as-built — it does NOT assert ready tasks surfacing within a gap-saturated head. So the shipped behavior is the OPPOSITE of the criterion's outcome whenever open gaps >= head_size.
- Runtime demo against live `.context` (the criterion's own acceptance probe) was RUN on 2026-06-20 and FAILED the outcome:
  - 2026-06-20T01:11:40Z, session `8490e49a` (assistant): "nextActions returned exactly 15 entries, all gaps, and ready tasks are NOT in the head (truncated below)."
  - VER-056 (committed `935bc90`, 2026-06-20T01:21:33Z) records criterion 3 **failed**: "live `.context` (44 open gaps) head is 15 gaps / 0 ready tasks — orchestrator-confirmed via context-current-state."

Outcome verdict: **NOT DONE.** The mechanism made the cap configurable; it did not change the gaps-before-tasks ordering that the outcome requires to be broken.

---

## (b) Chronological evidence — everything touching ranking / head / ordering

All commits authored by `Test`; session ids from claude-history. ISO timestamps.

| Timestamp (ISO) | Session / Commit | What happened | Citation |
|---|---|---|---|
| 2026-05-25T09:48-09:59Z | session `b62c055d` | First inspection of `NEXT_ACTIONS_CAP=15` / the `slice` — pre-TASK-020 reconnaissance, no edit | search hit msg `c75e9f64`, `c010be1d` |
| 2026-06-06T11:31-11:33Z | session `d7310007` | TASK-020 outcome criteria + design decision filed to `.context`; pre-impl framing | msg `6293e4eb`, `e410a1bd` |
| 2026-06-17T00:16-00:26Z | session `8490e49a` / commit **`6803486`** "substrate(.context): fold the hardcoded NEXT_ACTIONS_CAP into FGAP-017 + TASK-020 scope" | The head-size was NOT originally in TASK-020/FGAP-017 scope ("Neither FGAP-017 nor TASK-020 mentions the cap ..." msg `311fc003`, 00:18:34Z). It was ADDED here as a new acceptance criterion: config-declared head-size + "ready tasks no longer truncated below open gaps" + runtime demo against `.context` with >=15 open gaps | msg `e5bd4ead` (00:26:31Z), `41f99820` (00:23:52Z) |
| 2026-06-17T08:20-08:21Z | session `8490e49a` | Branch `feat/task-020-config-derivation` created; impl begins | msg `ac40278e`, `3c5c94cf` |
| 2026-06-17 (commit time 16:45:24 +0800) | commit **`99f45de`** | MECHANISM: rewire to config; `nextActions head cap (was 15) -> sd.head_size`. nextActions cross-kind push order -> `sd.next_ranked` ARRAY ORDER (gaps entry first). This sets the ordering as data but preserves gaps-before-tasks byte-identically | `git show 99f45de` body |
| 2026-06-17 (commit time 17:40:38 +0800) | commit **`9125385`** "TASK-020 iterate-to-zero" | MECHANISM cleanup: moves 3 kind-coupled reason/focus literals to config (`reason_template`, focus prefix). Touches reason strings + `head_size` test, NOT the gaps-before-tasks ordering | `git show 9125385` body + stat |
| 2026-06-17T08:42-09:46Z | session `8490e49a` / commit `05d0e7e` (tests) | Tests added incl. "head_size honored" + the `head_size:2` truncation test (3253-3287) asserting task-hidden-below-gaps as correct | msg `4ab05b73`, `e8565293`, `b2dff20b` |
| 2026-06-17T22:15Z | session `8490e49a` | Real-engine demo of the registry shape (`head_size:15` echoed); mechanism-level, not the outcome probe | msg `6e7497c2` |
| (commit) | **`e3c552e`** "ship the stock state_derivation registry in the packaged catalog" | Sets stock `next_ranked` ORDER (gaps then tasks) in `samples/conception.json`; this is the ordering the outcome needs broken. Never reordered after | `git log -S next_ranked -- samples/conception.json` |
| (commit) | **`4376399`** "TASK-068: make issues a gap-sibling open-work kind ... (config/catalog only, no src change)" | Adds `issues` to `next_ranked` AS ANOTHER open-work kind; explicitly "no src change". Does not reorder gaps-vs-tasks or address head composition | `git log -- samples/conception.json` |
| 2026-06-20T01:11:02-01:11:52Z | session `8490e49a` | Re-derivation/verification pass: located the two impl commits; ran `currentState` against live `.context`; observed 15-entry head, ALL gaps, 0 ready tasks | msg `63ff838a`, `4f93b0bb`, `9eaadcff` |
| 2026-06-20T01:21:16-01:21:33Z | session `8490e49a` / commit **`935bc90`** | VER-056 filed (status `partial`, bound to TASK-020 via `verification_verifies_item`): criterion 3 **failed**, criterion 6 **failed**; 1/2/4/5 passed | msg `43c2304e`, `a4b503ad` |

No commit on any branch after `9125385` modifies the ranking/ordering/head-composition logic in `context-sdk.ts` (`git log --all --since=2026-06-17 -- context-sdk.ts` returns only `99f45de` + `9125385`). No commit reorders `next_ranked` in the catalog after `e3c552e` (TASK-068's `4376399` only appends a kind). The June 20 session produced substrate filings + docs only — no source edit to the deriver.

---

## (c) Pause / pivot determination

**Outcome work was NEVER STARTED.** No interleave/reorder/round-robin/quota change to the head composition was ever attempted in source — there is nothing to have "paused."

Basis:
- The two implementation commits (`99f45de`, `9125385`) deliver ONLY the mechanism: they make the cap and the ordering CONFIG-DRIVEN, preserving the stock gaps-before-tasks order byte-for-byte (commit `99f45de` body: nextActions push order "-> sd.next_ranked array order"; the stock array keeps gaps first). Making the ordering data-driven is not the same as making it surface ready tasks; the stock data still saturates the head with gaps.
- The committed tests (`context-sdk.test.ts:3253-3287`) lock in the truncation-below-gaps behavior as correct-as-built. No test, no source path, and no catalog edit ever attempted "ready tasks within the gap-dominated head."
- The criterion's own outcome was not even part of TASK-020/FGAP-017 until `6803486` (2026-06-17T00:26Z) folded it in as a NEW criterion AFTER the mechanism work was already framed. It was added as a forward deliverable, then the implementation that followed satisfied only the mechanism half.
- The June 20 session explicitly recognized the gap as STILL OPEN rather than abandoned. The load-bearing conversation item, msg `a4b503ad` (2026-06-20T01:21:33Z, session `8490e49a`), verbatim:
  > "Genuine remaining work on TASK-020 (now recorded, not ephemeral): criterion 3 — the stock state_derivation ordering/head must surface ready tasks within the gap-dominated head; criterion 6 — the canonical pipeline closure ..."

So: not paused, not abandoned — the outcome half was scoped in late, never implemented, and is recorded as open in VER-056. The work to date is mechanism-only by construction.

---

## (d) Precise pick-up point

What EXISTS (do not redo):
- `head_size` is config-declared and honored (`context-sdk.ts:909`, `context.ts:137`); stock value 15 in `samples/conception.json` and live `.context/config.json`.
- `next_ranked` is a config-declared ordered list of `{kind,label,bucket,rank_field?,rank_order?,reason_template?}` entries; the deriver pushes them in array order then slices.

What is MISSING (the criterion-3 outcome):
- The head composition has no mechanism to guarantee ready tasks appear when open gaps >= head_size. Stock ordering pushes ALL gaps before ANY task; the slice then drops every task.

Next concrete action (determine-only; not prescribing the design):
1. Decide the head-composition rule that surfaces ready tasks within (or above) a gap-saturated head — e.g. a per-entry head quota/reservation, an interleave/round-robin across `next_ranked` entries, or a guaranteed-minimum task slot — expressed as config on the `state_derivation` registry so it stays vocabulary-agnostic (consistent with the mechanism already shipped). This is a config-schema + deriver change, NOT a new hardcoded rule.
2. Implement it in the `for (const entry of sd.next_ranked)` push/slice region of `context-sdk.ts` (currently `:859-909`), plus the `StateDerivation` type (`context.ts`) and `config.schema.json`, and ship the stock value in `samples/conception.json` + reconcile live `.context/config.json`.
3. Replace/extend the truncation test at `context-sdk.test.ts:3253-3287` so the asserted behavior is the criterion's outcome (ready task present in a head with open gaps >= head_size), and add the runtime demo against live `.context` (>=15 open gaps) showing >=1 ready task in the head — the criterion's literal acceptance probe.
4. Then criterion 6 closure (cross-substrate demo + fresh adversarial audit, complete-task, FGAP-017 closure, merge of `feat/task-020-config-derivation`).

Pick-up branch: `feat/task-020-config-derivation` (the chain through `9125385`), per VER-056.

---

## Confidence + load-bearing evidence

Confidence: HIGH.

Load-bearing evidence (each cross-validated conversation + source/commit):
- Mechanism done: commit `99f45de` body ("nextActions head cap (was 15) -> sd.head_size") + current source `context-sdk.ts:909` / `context.ts:137`.
- Outcome not done: live runtime demo msg `4f93b0bb` (2026-06-20T01:11:40Z) + VER-056 record msg `a4b503ad` (criterion 3 failed) + the truncation test `context-sdk.test.ts:3253-3287` encoding the opposite behavior + the unbroken gaps-first `next_ranked` order (`git log -S next_ranked` shows only `e3c552e` set it, `4376399` only appended).
- Never-started (not paused): `git log --all --since=2026-06-17 -- context-sdk.ts` yields ONLY the two mechanism commits; no source edit ever touched head composition; the remaining-work quote msg `a4b503ad` frames it as open, not abandoned.

No blockers. No substrate/config/schema files were read directly (the live `.context` head observation is quoted from the prior session's own `context-current-state` run, not re-read here).
