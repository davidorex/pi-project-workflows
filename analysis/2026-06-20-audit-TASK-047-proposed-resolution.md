# Audit — TASK-047 proposed resolution (advancer-completion invariant class)

Read-only design audit of TASK-047's description + acceptance_criteria (the proposed resolution) against the upstream gap (FGAP-082), its related gap (FGAP-101), the cited code (`context.ts` `InvariantDecl`, `context-sdk.ts` `validateContext` invariant loops), and the engine audit md. Code-simplifier lens on the DESIGN. No mutation, no implementation.

## Verdict: HAS-PROBLEMS

The core design — a third config-declarable `advancer-completion` invariant class, vocabulary-neutral, evaluated by a third loop in `validateContext` parallel to the two existing ones, post-hoc `error` at `context-validate`, write-time block out of scope — is SOUND and well-grounded by the engine audit (`analysis/2026-06-10-story-completion-invariant-engine-audit.md`). The architectural classification (a new `class`, not a hardcoded check, per DEC-0025) is correct.

But the task's filed proposed-resolution text carries three concrete defects: a wrong code citation, a wrong claim about what config the task lands, and a missing dependency/sequencing on FGAP-101 that — left unaddressed — makes acceptance criterion 2/6 unobservable as filed. None are fatal to the approach; each is a correction to the task fields.

---

## Problem 1 — WRONG code citation (`context.ts:202-214`)

The description and FGAP-082 both anchor the change to "InvariantDecl (context.ts:202-214)". That line range is wrong in the current tree:

- `InvariantDecl` is at **`context.ts:297-309`** (verified: the interface opens at 297, `class: "requires-edge" | "status-consistency"` at 299, closes at 309).
- `context.ts:202-214` is the **`ToolOperationDecl` close (202) + the `AmendRegistry` union (210-224)** — unrelated vocabulary.

The drifted citation propagated verbatim from FGAP-082 and the engine audit (both written 2026-06-10) into the task. Per the verbatim-composition mandate (filings are handed to subagents unaltered), a coding subagent told to "extend InvariantDecl (context.ts:202-214)" lands at the wrong region. This is a filing defect to correct, not a requirement to implement around. The doc-comment to update is at **`context.ts:278-309`** (the `InvariantDecl` JSDoc enumerating the two classes), not `:184-200`.

The executor loops are likewise re-anchored in the current tree: `requires-edge` loop at **`context-sdk.ts:2298-2321`**, `status-consistency` loop at **`:2334-2364`** (engine audit cited `:2055-2078` / `:2091-2121`; `validateContext` opens later than its cited `:1849`). The new loop goes after `:2364`, before the status-vocab check at `:2373`.

## Problem 2 — WRONG claim: "the rule's config declaration lands with this task"

The notes field states: "Enables enforcement of the user-stories completion rule … the rule's config declaration lands with this task." This is stale. The substrate ALREADY carries the rule's relational vocabulary:

- `relation_types[]` already declares **`task_advances_story`** (tasks→story) and **`feature_advances_story`** (features→story) — both present, with `source_kinds`/`target_kinds` set (verified via `read-config --registry relation_types`).
- The `story` block kind already exists (`read-config --registry block_kinds`: `canonical_id: story`, `prefix: STORY-`).
- 29 live advancer edges already exist (13 `task_advances_story` + 14 `feature_advances_story`, per FGAP-101's evidence).

So the relation types and the story block are NOT part of this task's delta — only (a) the new `advancer-completion` invariant `class` in source, and (b) the two `invariants[]` config declarations (`block: tasks`, `block: features`) plus their `samples/conception.json` catalog mirror. The engine audit's "What a validator extension would touch" section (lines 212-218) over-scopes by listing the relation-type additions as if new; they are already shipped. The task should scope to the class + the two invariant declarations + the catalog mirror, and NOT re-add relation types.

## Problem 3 — MISSING dependency on FGAP-101 (criterion 2/6 unobservable as filed)

This is the load-bearing finding. FGAP-101 (filed 2026-06-20, `gap_relates_to_gap` → FGAP-082) establishes that **`context-validate-relations` already returns `invalid` on this exact substrate** because the two story-advancer lenses (`story-advancers`, `story-advancers-features`, both `derived_from_field: null`, `bins: []`) are edge-materialization lenses declared over the same content relation_types; `validateRelations` has no representation for that and fires a spurious `edge_parent_not_in_bins` (an `errorCodes` member) on every one of the 29 real advancer edges.

TASK-047's acceptance criteria are phrased against **`context-validate`** (the invariant engine), and FGAP-101 is against **`context-validate-relations`** (the relation engine) — different ops, so they do not literally collide. But they share the substrate and the assertion idiom, and there are two concrete consequences the task text does not acknowledge:

1. **Criterion 6 ("CLI-provable … via pi-context context-validate … build + check + full test green") is anchored to a substrate whose sibling integrity gate is already red.** Any verification that runs the canonical pipeline's integrity step (`context-validate` + `context-validate-relations`) on the live `.context` will see FGAP-101's pre-existing `invalid` and cannot cleanly attribute green/red to TASK-047's new invariant. The task's own acceptance is observable on a SEEDED throwaway substrate (criteria 2-5 describe seeded fixtures), but the live-substrate demonstration the pipeline expects is contaminated.

2. **Ordering risk.** If TASK-047 lands its two `advancer-completion` declarations against the LIVE `.context` (the `block: tasks` + `block: features` instances, `when_bucket: complete`, `met_bucket: complete`), it begins firing `error`-severity invariant diagnostics against the live advancer graph at the same time FGAP-101's relation-validation error is unresolved — two independent red signals on one substrate, each masking the other during verification. FGAP-101 should be sequenced BEFORE or WITH TASK-047 (it is the cheaper fix and is the precondition for a clean live demonstration), and TASK-047's criteria should name the seeded-substrate isolation explicitly so the demonstration is not run against contaminated live state.

The task currently has no `task_gated_by_item`/`task_depends_on` edge to FGAP-101's fix and no mention of it in notes. That omission is the poisoned assumption: the task reads as if `context-validate` on the real substrate is a clean canvas, when the sibling gate is already failing on the very edges this invariant operates over.

## Design-soundness checks that PASS (no change needed)

- **`self_satisfies` / no-deadlock construct** — sound. The single-advancer case (a task that is its sole story's only advancer, completing, must meet that story) genuinely cannot be expressed by `status-consistency` (it reads only the target's own `status`, and a story carries no met-field). A self-counts clause in the new loop is the minimal correct construct. Criterion 3 (self_satisfies, no-deadlock) correctly isolates it.
- **`error` severity at `context-validate`, write-time block out of scope** — sound and consistent with the engine reality (the engine audit's enforcement-point table shows no write-time invariant hook and no feature-side `completeTask` exist; adding one is a larger, separate change that would also re-introduce source vocabulary). The scope cut is correct, not a scope-dodge.
- **Two config instances (`block: tasks` + `block: features`)** rather than a `blocks: string[]` — consistent with how `*-articulates-convention` ships one entry per block today (three entries: decision/feature/task). Acceptable; a `blocks: string[]` variant is a defensible simplification but not required and not better-of-breed-obligatory here.
- **Vocabulary-neutrality** (every block/status/relation literal from `inv` DATA; reuse the in-scope `vocab`/`bucketOf`, `index.byRefname`, `relations`) — sound, matches the existing two loops exactly, DEC-0025-compliant.
- **No over-engineering in the field shape.** Reusing `relation_types` + `direction` + adding `met_bucket` + `self_satisfies` (rather than minting parallel `advances_relation_types`/`advancer_direction`) is the simpler, DRY-er field set and is one of the two options the audit already offers — prefer it.

## Concrete corrected proposed-resolution text (ready to replace the task fields)

**description** (replace):

> Add the advancer-completion invariant class to the validator — closes FGAP-082. Extend InvariantDecl (context.ts:297-309) and validateContext's invariant executor (the third loop, after the status-consistency loop at context-sdk.ts:2334-2364) with a third config-declarable class: for a source item entering when_bucket (complete), every target reached via the declared relation_types (task_advances_story / feature_advances_story) must be met — met = at least one incoming advancer edge whose endpoint item is in met_bucket (complete) — with self_satisfies so the completing item counts as its own stories' advancer (the single-advancer case must not deadlock). Reuse the existing relation_types + direction fields and add met_bucket + self_satisfies (no parallel advances_relation_types/advancer_direction). Vocabulary-neutral: reuse the in-scope vocab/bucketOf, index.byRefname, relations. Severity error at context-validate. The advancer relation_types and the story block ALREADY exist in config (29 live advancer edges); this task adds ONLY the new class in source + two invariants[] declarations (block tasks, block features) + the samples/conception.json catalog mirror — it does NOT re-add relation types or the story block. Update the InvariantDecl doc-comment (context.ts:278-309). Code change: full canonical pipeline.

**notes** (replace):

> Closes FGAP-082. The user-stories completion rule's relational vocabulary (task_advances_story, feature_advances_story, story block) is ALREADY shipped; this task lands only the invariant class + its two config declarations + catalog mirror. Engine grounding: analysis/2026-06-10-story-completion-invariant-engine-audit.md (note: its file:line citations predate current-tree drift — InvariantDecl is at context.ts:297-309, executor loops at context-sdk.ts:2298-2321/2334-2364). Write-time blocking (a completeTask/write-path hook) is out of scope — context-validate error only. DEPENDENCY: FGAP-101 (sibling, gap_relates_to_gap) — context-validate-relations already returns invalid on the 29 live advancer edges (spurious edge_parent_not_in_bins from the edge-materialization story-advancer lenses). Sequence FGAP-101's fix before/with this task so the live-substrate integrity demonstration is not contaminated by a pre-existing red; and demonstrate criteria 2-5 on a SEEDED throwaway substrate, never the contaminated live .context.

**acceptance_criteria** (replace criterion 6; criteria 1-5 are sound as filed):

> CLI-provable: criteria 2-5 demonstrated on a SEEDED throwaway substrate via pi-context context-validate --json (presence/absence of code advancer-meets-every-story in issues[]); build + check + full test green; fresh adversarial probe; FGAP-082 closed via verification_verifies_item + complete-task. The live-substrate context-validate-relations red attributable to FGAP-101 (not this task) is resolved or explicitly sequenced first, so this task's green/red is cleanly attributable.

Add a `task_depends_on`-class edge (or note-level dependency) from TASK-047 to FGAP-101's closing task once that task exists; the dependency must be represented, not left implicit.

## Summary

Approach SOUND; filed text HAS-PROBLEMS: (1) wrong code citation 202-214 → 297-309; (2) stale "config declaration lands with this task" — relation types + story block already shipped, scope is class + two invariant decls + catalog mirror; (3) missing FGAP-101 dependency that contaminates the live-substrate demonstration and risks two masking red signals. Corrected description/notes/criterion-6 text supplied above, ready to replace the task fields.
