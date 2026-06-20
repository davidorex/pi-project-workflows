# Audit — TASK-068 proposed resolution (gaps↔issues sibling parity)

**Date:** 2026-06-20
**Active substrate:** `.context`
**Scope:** read-only design audit of TASK-068's description + acceptance_criteria against the upstream FGAP-098 proposed_resolution, the cited code, and the live registry. No mutation, no implementation.

**Verdict: SOUND** (with three non-blocking notes — one of them a state observation that the live-config leg is already implemented).

The design rests on a single load-bearing premise — *the derivation/lens engines are already config-driven and kind-general, so issue-sibling parity is config/catalog vocabulary, not deriver code* — and that premise verifies against the actual source. The criteria are accurately scoped, the divergences are correctly preserved, and the one place the criteria are NARROWER than the investigation (dropping the "route closure fields through stamping" leg) is the correct call, not a regression.

---

## What was verified against actual code/registry (not relayed)

| Claim in the resolution | Verification | Holds? |
|---|---|---|
| `currentState` deriver is kind-general; `nextActions` matches any `entry.kind` from `next_ranked` | `context-sdk.ts:859-906` — field-ranked branch selects `loc.block === entry.kind` / `bucket(loc.item) === entry.bucket`, ranks by `entry.rank_field` vs `entry.rank_order`; no kind literal | YES |
| Adding an issues `next_ranked` entry needs NO deriver code change | The selection + ranking path (`context-sdk.ts:860-890`) is purely `entry.*`-driven; an issues entry is a data-only addition | YES |
| `issues.status: open` already buckets to `todo`, so `bucket: todo` selects open issues with zero status-vocab change | `status-vocab.ts:84` `open: "todo"` | YES |
| `issues.status: resolved` buckets to `complete`, so `task-completed-issue-resolved` with `require_target_bucket: complete` works unchanged | `status-vocab.ts:58` `resolved: "complete"` | YES |
| lens engine is config-bin-generic (issues lens pair = pure config) | `lens-view.ts:130-144` renders from `view.lens.bins`; no kind-specific code | YES |
| `gap_relates_to_gap` exists, `issue_relates_to_issue` was the missing sibling | live `relation_types` registry — `gap_relates_to_gap` present | YES |
| issues schema lacks `resolved_at` and an `x-lifecycle`; framework-gaps has `x-lifecycle` | `read-schema issues` (no `resolved_at`, no `x-lifecycle`); `read-schema framework-gaps --path x-lifecycle` returns a transition state-machine | YES |
| schema additions are additive-only (existing issue items validate) | `resolved_at` optional + `x-lifecycle` is metadata; `additionalProperties:false` on the items object means the new field MUST be declared in `properties` (it will be) — no existing item carries it, so all validate unchanged | YES |

No WRONG assumptions about code/APIs were found. No OVERLY-COMPLEX restatement of an existing simpler util was found (the design explicitly leans on the existing config-driven engines rather than adding code). No scope-creep into deriver/lens/op source.

---

## Note 1 (STATE, not a design defect) — the live-config relation_types leg is ALREADY implemented

The live `relation_types` registry already carries the last two entries:
- `task_addresses_issue` (tasks→issues, data_flow)
- `issue_relates_to_issue` (issues→issues, data_flow)

TASK-068 is `in-progress`, so this is expected partial progress, but criterion 1's *live-config* half is already satisfied; the remaining criterion-1 work is the **catalog back-port** (`samples/conception.json`) + the fresh-accept-all proof. This is a status observation for the implementer/verifier (don't re-add the live entries; verify the catalog half), **not** a flaw in the proposed resolution. The criterion text already reads "registered in live config **and** samples/conception.json," so the criterion correctly still gates on the catalog leg.

## Note 2 (design — the criteria are CORRECTLY narrower than the investigation; keep them)

The FGAP-098 investigation's axis-4 finding (d) said to *"route `resolved_by`/`resolved_at` through the same closure-field stamping"* (mirroring gaps' `closed_by`/`closed_at`). TASK-068's criterion 4 DROPPED that leg and asks only for additive `resolved_at` + `x-lifecycle`. Auditing the actual stamping mechanism shows the criteria are RIGHT to drop it:

- Closure-field stamping is a **global hardcoded default**, not a per-schema declaration: `block-api.ts:107-111` hardcodes `DISCRETIONARY_METADATA_FIELDS = AUTHOR_FIELDS ∪ {closed_by, closed_at}`. The framework-gaps schema declares **no** `x-identity` block and does **not** list `closed_by`/`closed_at` in its `properties` at all (verified: `read-schema framework-gaps --path x-identity` → not found).
- So to "route `resolved_by`/`resolved_at` through stamping," one would have to edit the hardcoded `DISCRETIONARY_METADATA_FIELDS` set (a code change to a shared partition affecting every schema) or add an `x-identity.metadata_fields` override to the issues schema — neither is "additive schema," and gaps themselves don't do it as a schema declaration. Pulling that into TASK-068 would be **scope-creep + a non-additive code change** mislabeled "two additive schema fields."

The criteria's narrower framing ("two additive issue-schema fields … Existing issue items validate unchanged") is the more-correct, lower-risk scoping. No change needed; if anything this is a point where the task improved on the upstream proposed_resolution.

## Note 3 (design — `next_ranked` array position is a real decision the criteria leave implicit)

Criterion 3 specifies the issues `next_ranked` entry's `kind/label/bucket/rank_field/rank_order/reason_template` but not its **array position** relative to the existing gaps and tasks entries. The deriver pushes `nextActions` in `next_ranked` ARRAY ORDER (`context-sdk.ts:856-860` — "array order IS the cross-kind push order"), so position is behaviorally load-bearing for what surfaces first in "what's next." The investigation (axis 3, line 80) flagged this as "a decision to make … default after gaps." Criterion 3 is otherwise complete but silent here, leaving an under-specified point that a downstream implementing subagent would have to invent. This is a precision gap in the criterion, not a wrong assumption.

---

## Divergence preservation (criterion 7) — correct

Criterion 7 holds the right line: issues status labels (open/resolved/deferred), priority scale (low..critical), category facet, and the escalation-sink asymmetry (no `decision_raises_issue`, no issue-targeted `item_acknowledges_missing_convention`, no `decision_escalates_underdetermined` issue analog) are all preserved. Verified against the live registry: gaps remain the sole target of `decision_raises_gap`, `decision_escalates_underdetermined`, and `item_acknowledges_missing_convention`. Force-symmetrizing those would be the over-reach criterion 7 explicitly prevents. Sound.

---

## Proposed concrete change (one — to criterion 3 only)

Everything else is sound as written. The single proposed refinement makes the array-position decision explicit so a downstream brief doesn't invent it. Replace criterion 3 with:

> `state_derivation.next_ranked` has an issues entry: `kind` issues, `label` issue, `bucket` todo, `rank_field` priority, `rank_order` [critical, high, medium, low], `reason_template` — in live config and catalog. **The entry is positioned immediately after the framework-gaps entry and before the topo-ordered tasks entry, so cross-kind push order is gaps → issues → ready-tasks (array order is the push order per the deriver).** currentState ranks an open issue in nextActions, ordered after open gaps and before ready tasks. No deriver code change.

(If the project's intent is issues-before-gaps precedence, swap the two; the point is that the criterion must NAME the position rather than leave it to the implementer — it is behaviorally load-bearing.)

No other field of TASK-068 requires correction. Criteria 1, 2, 4, 5, 6, 7, 8 are accurate and correctly scoped; the description is accurate.
