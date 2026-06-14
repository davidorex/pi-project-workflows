# .context substrate — status-validity audit

Date: 2026-06-14 (filename dated 2026-06-13 per the audit request). Branch `context-jit-spec-v2`, active substrate `.context` (confirmed via `.pi-context.json` `contextDir`). Read-only; no substrate item, source, config, or mutating op was touched.

## Method + evidence basis

- Every task enumerated by status partition (`filter-block-items` + full `read-block-page` paging): 60 tasks total (`tasks.json` `total: 60`).
- Verification edges sampled via `find-references --id` (the `verification_verifies_item` edge is the authoritative completed-task evidence) and corroborated by `context-validate` invariants.
- `context-validate --json` run once; folded in below.
- Git cross-check: `git log --grep`, `git tag`, `git rev-list`.
- Features / framework-gaps / stories / research / decisions read by page or by id.

A load-bearing fact governs the whole completed-task layer: **`context-validate` reports zero `completed-task-has-verification`, zero `verification-passed-task-complete`, and zero `task-completed-feature-complete` errors.** Those three invariants are live (config-declared) and would fire on any completed task missing its passing-verification edge, any passed VER pointing at a non-completed task, or any complete feature with an incomplete advancer. Their absence is substrate-wide evidence, not a sample. Per-task `find-references` spot-checks (TASK-001/002/006/007/008/028/033/050/052/059) each confirmed the expected `verification_verifies_item` edge, consistent with the invariant result.

## Per-task verdict

Status distribution: 44 completed, 15 planned, 1 cancelled, 0 in-progress.

| id | status | evidence | verdict | note |
|----|--------|----------|---------|------|
| TASK-001 | completed | VER-001 edge; ab05a0e | VALID | |
| TASK-002 | completed | VER-002 edge; 17d9a3b | VALID | |
| TASK-003 | planned | no impl; FEAT-001 proposed | VALID | clone arc unbuilt |
| TASK-004 | planned | no impl; FEAT-002 proposed | VALID | git merge driver unbuilt |
| TASK-005 | planned | no impl; FEAT-003 proposed | VALID | sequence CRDT unbuilt |
| TASK-006 | completed | VER-003 edge; f5b6bd5 | VALID | |
| TASK-007 | completed | VER-004 edge; 56b153d | VALID | closes FGAP-006/009 |
| TASK-008 | completed | VER-005 edge | VALID | |
| TASK-009 | completed | (validate invariant) | VALID | parity-check hardening |
| TASK-010 | completed | (validate invariant); 8fcf02d | VALID | |
| TASK-011 | completed | (validate invariant); 4b72b86 | VALID | |
| TASK-012 | completed | (validate invariant) | VALID | |
| TASK-013 | completed | (validate invariant) | VALID | |
| TASK-014 | completed | (validate invariant) | VALID | |
| TASK-015 | completed | (validate invariant) | VALID | FEAT-008 |
| TASK-016 | completed | (validate invariant) | VALID | FEAT-008 |
| TASK-017 | completed | (validate invariant) | VALID | FEAT-008 |
| TASK-018 | completed | (validate invariant) | VALID | FEAT-008 |
| TASK-019 | completed | (validate invariant) | VALID | FEAT-008 parity gate |
| TASK-020 | planned | no impl; FEAT-004 proposed | VALID | |
| TASK-021 | planned | no impl; FEAT-004 proposed | VALID | |
| TASK-022 | planned | no impl | VALID | |
| TASK-023 | completed | (validate invariant) | VALID | DEC-0010 S1 |
| TASK-024 | completed | (validate invariant) | VALID | DEC-0010 S2 |
| TASK-025 | completed | (validate invariant) | VALID | DEC-0010 S3 |
| TASK-026 | completed | (validate invariant) | VALID | DEC-0010 S4 |
| TASK-027 | planned | no impl | VALID | FGAP-007 open |
| TASK-028 | completed | VER-017 edge | VALID | global pi-context |
| TASK-029 | completed | (validate invariant) | VALID | |
| TASK-030 | completed | (validate invariant) | VALID | pi-bound; FEAT-005 |
| TASK-031 | completed | (validate invariant); b8bd346 | VALID | convention backfill |
| TASK-032 | completed | (validate invariant); b8bd346 | VALID | enacts DEC-0016 |
| TASK-033 | completed | VER-046 edge; b92b58f merge 1383af2 | VALID | FEAT-007; v0.31.0 |
| TASK-034 | completed | (validate invariant) | VALID | FEAT-006 T1 |
| TASK-035 | completed | (validate invariant) | VALID | FEAT-006 T2 |
| TASK-036 | completed | (validate invariant) | VALID | FEAT-006 T3 |
| TASK-037 | completed | (validate invariant) | VALID | FEAT-006 T4 |
| TASK-038 | completed | (validate invariant) | VALID | FEAT-006 T5 |
| TASK-039 | completed | (validate invariant) | VALID | FEAT-006 T6 |
| TASK-040 | completed | (validate invariant) | VALID | FEAT-008 |
| TASK-041 | planned | no impl | VALID | decision-derivation backfill |
| TASK-042 | completed | VER-035 edge (via FGAP-072) | VALID | FEAT-008 |
| TASK-043 | completed | (validate invariant) | VALID | context-lens-view op |
| TASK-044 | planned | no impl; FGAP-074 open | VALID | register-guard broadening |
| TASK-045 | completed | (validate invariant) | VALID | check-changelog fix |
| TASK-046 | completed | (validate invariant) | VALID | FEAT-009; FGAP-066 |
| TASK-047 | planned | no impl; FGAP-082 open | VALID | advancer-completion invariant |
| TASK-048 | completed | (validate invariant) | VALID | FEAT-009; FGAP-077 |
| TASK-049 | completed | VER-043; 814b826; FGAP-030/078 | VALID | FEAT-009 |
| TASK-050 | completed | VER-044 edge; 67d883a merge bd90f85 | VALID | FEAT-009; FGAP-079 |
| TASK-051 | completed | (validate invariant) | VALID | FEAT-009; FGAP-080 |
| TASK-052 | completed | VER-041 edge; 0561929; FGAP-081 | VALID | FEAT-009 |
| TASK-053 | completed | (validate invariant) | VALID | refinement |
| TASK-054 | planned | no impl | VALID | rawWriteBlockText refinement |
| TASK-055 | planned | no impl | VALID | update pre-flight |
| TASK-056 | planned | no impl | VALID | resolve-blocked report |
| TASK-057 | planned | no impl | VALID | read-schema-history |
| TASK-058 | planned | no impl | VALID | walk-migration-chain |
| TASK-059 | completed | VER-045 edge; fee0c3e merge 90c1df9 | VALID | FGAP-088; install op |
| TASK-060 | cancelled | reverted at db4f85d; 5b027b0 sets cancelled | VALID | FGAP-089 left open |

"(validate invariant)" = completed status corroborated by the `completed-task-has-verification` invariant returning clean across the whole block (no per-task `find-references` call was made for that row; the invariant guarantees the edge exists). Rows with an explicit VER-NNN were additionally edge-checked or git-checked by name.

**Result: 60/60 tasks VALID. 0 UNSUPPORTED, 0 CONTRADICTED.** No completed task lacks its verification edge; no planned task has committed implementation it should not (the planned set is the unbuilt FEAT-001/002/003/004 arcs, FGAP-007/074/082 fix-tasks, the operator-story tasks 055-058, and refinement 054 — none has a merge). TASK-060 cancelled matches the git revert exactly.

## TASK-060 — cancellation is honest, with a register note

TASK-060 (scope the PreToolUse hooks to the active substrate) is `cancelled`. Git confirms: `db4f85d` restored both hooks to their pre-TASK-060 baselines, and `5b027b0` set the task cancelled with the note "the active-substrate hook-scoping attempt was reverted; FGAP-089 remains open." The cancellation reflects a genuine non-completion — no faked closure, no verification edge fabricated. FGAP-089 is correctly left `identified` (open). The task body still narrates the intended implementation in present/imperative tense (acceptance criteria phrased as live requirements); this is a rhetorical-register observation, not a status-validity defect — the status is correct.

## Features

| id | status | advancers | verdict | note |
|----|--------|-----------|---------|------|
| FEAT-001 | proposed | TASK-003 (planned) | VALID | clone arc unbuilt |
| FEAT-002 | proposed | TASK-004 (planned) | VALID | merge driver unbuilt |
| FEAT-003 | proposed | TASK-005 (planned) | VALID | sequence CRDT unbuilt |
| FEAT-004 | proposed | TASK-020/021 (planned) | VALID | config-driven state unbuilt |
| FEAT-005 | complete | TASK-030 (completed) | VALID | pi-bound |
| FEAT-006 | complete | TASK-034..039 (completed) | VALID | update command |
| FEAT-007 | complete | TASK-033 (completed) | VALID | convention-articulation |
| FEAT-008 | complete | TASK-015/016/017/018/019/040/042 (all completed) | VALID | best-of-breed CLI |
| FEAT-009 | complete | TASK-046/048/049/050/051/052 (all completed); STORY-001..014 (all complete) | VALID | blocked-diagnostic arc |

No complete feature has an incomplete advancer (corroborated by the `task-completed-feature-complete` invariant returning clean). FEAT-009's completion criterion is "every advanced story met"; all 14 stories are `complete` and each is advanced by a completed task, so FEAT-009 complete is supported. Caveat on the enforcement basis: the `advancer-completion` invariant (TASK-047 / FGAP-082) is **not yet implemented** — `context-validate` does not currently enforce story-met-on-feature-complete, so FEAT-009's "complete" rests on the directly-verified story statuses here, not on a live invariant.

## Framework-gaps (closure-field completeness)

89 gaps (`gaps-by-status` lens): 47 closed, 37 identified, 5 accepted, 0 in-progress, 0 wontfix. Closed-gap closure fields were spot-checked by id across the arc range; the pattern is consistent — every closed gap sampled carries `status: closed` + `closed_by` (a VER/TASK citation or a human-writer credit) + `closed_at` + a closing-citation string:

| id | status | closure fields | verdict |
|----|--------|----------------|---------|
| FGAP-012 | closed | closed_by=human + closed_at + TASK-010/011 citation | VALID |
| FGAP-072 | closed | closed_by=VER-035/TASK-042 + closed_at | VALID |
| FGAP-081 | closed | closed_by=VER-041/TASK-052 + closed_at | VALID |
| FGAP-088 | closed | closed_by=VER-045/TASK-059 + closed_at; git fee0c3e | VALID |
| FGAP-089 | identified (open) | no closure fields (correct) | VALID |

FGAP-089 open is correct (its fix-task TASK-060 was cancelled). No closed gap sampled was missing a closure field; no open gap sampled was actually resolved. Note: there is no live `framework-gap` closure-field invariant in `context-validate`, so closure-field completeness is not machine-enforced — this audit's basis is the sampled reads, not a validator guarantee. The closed set is large (47) and was not exhaustively read field-by-field; the sampled-pattern conclusion is "consistent, no exception found," not "all 47 individually confirmed."

## Stories

All 14 (STORY-001..014) are `complete`. Each has a completed advancer (`task_advances_story` from TASK-046/048/049/050/051/052 and `feature_advances_story` from FEAT-009). Verdict: VALID for all 14.

## Research

R-0001..R-0007 read in full; all `status: complete` and each carries both `findings_summary` and `findings_document` (the research-complete requirements). R-0008..R-0014 are the same kind and were filed by the same arc (R-0013/R-0014 the most recent, git `79038c0`/`1dbb991`); the pattern is homogeneous. Verdict: VALID (sampled R-0001..0007 confirmed; R-0008..0014 inferred from consistent shape + git filing trace, not each read in full).

## Decisions

| id | status | verdict / note |
|----|--------|----------------|
| DEC-0001..0012 | enacted | VALID — coherent (DEC-0010/0012 carry enacted_by/enacted_at) |
| DEC-0013 | open | STATUS LAG — governs the publish-unit for the global `pi-context` command; FEAT-005/TASK-028/030 (its consumers) are complete, so it is enacted-in-practice but the status field was never advanced |
| DEC-0014 | open | STATUS LAG — "pi-bound is a CLI process mode"; FEAT-005 complete (TASK-030 shipped pi-bound exactly as decided), enacted-in-practice, status not advanced |
| DEC-0015 | open | STATUS LAG — "compose context in-process via loadContext"; shipped in TASK-030, enacted-in-practice, status not advanced |
| DEC-0016 | enacted | VALID — enacted by TASK-032 |
| DEC-0017 | enacted | VALID — enacted_by/enacted_at present; FEAT-006 shipped it |
| DEC-0018 | open | VALID — affirms current per-component update behavior, explicitly awaiting enactment (matches the tracker) |

All 18 decisions also carry the pre-existing `decision-shows-derivation` warning (see below). DEC-0013/0014/0015 are the one genuine status-currency observation: three decisions whose load-bearing content was implemented and shipped (FEAT-005 / pi-bound is `complete`) but whose status remains `open`. This is a status-lag, not a contradiction — the decisions are not wrong, their lifecycle field trails the work. DEC-0018 `open` is correct by design (it affirms current behavior and names its own pending enactment).

## context-validate result (folded in)

`pi-context context-validate --json` → `status: "warnings"` (not `error`, not clean). 19 issues, all pre-existing / expected, none a status-validity error:

- **17 × `decision-shows-derivation` (warning)** — DEC-0001..DEC-0017 each lack a `decision_derived_from_item` / `decision_escalates_underdetermined` edge. This is exactly the backlog TASK-041 (planned) exists to clear; the invariant is intentionally at WARNING until that backfill raises it to error. Pre-existing, tracked, expected.
- **2 × `nested_id_bearing_array` (warning)** — `layer-plans` `plans.layers` and `plans.migration_phases`, the Phase-H promotion advisory. Pre-existing, long-standing.

No `completed-task-has-verification`, `verification-passed-task-complete`, or `task-completed-feature-complete` errors — the three status-validity invariants are clean. No new warning classes vs the known baseline.

## Discrepancies

No status is contradicted or unsupported by evidence. The status layer carries no false completions, no faked closures, no planned-but-implemented or in-progress-but-done traps. The only items where status arguably trails reality:

| item | recorded | observation | corrective (if any) |
|------|----------|-------------|---------------------|
| DEC-0013 | open | consumer FEAT-005 complete; enacted-in-practice | advance to `enacted` (user-decided; not an error) |
| DEC-0014 | open | pi-bound shipped exactly as decided (TASK-030) | advance to `enacted` (user-decided) |
| DEC-0015 | open | in-process loadContext shipped (TASK-030) | advance to `enacted` (user-decided) |

These are status-currency lags on enacted-in-practice decisions, not validity defects. Advancing them is a substrate-write decision for the user, outside this read-only audit.

## Bottom line

The `.context` status layer is **trustworthy as-is for a fresh session.** All 60 tasks are status-valid and evidence-backed; every completed task carries its passing-verification edge (machine-guaranteed by the live `completed-task-has-verification` invariant, sample-confirmed by `find-references`); the recent arc (TASK-033/049/050/052/059 completed + merged, TASK-060 cancelled-after-revert, FGAP-088 closed / FGAP-089 open, FEAT-007/008/009 complete, v0.31.0 = 307199a) matches git exactly. Closed framework-gaps carry full closure fields in every sample; all 14 stories are complete with completed advancers; research items are complete with findings. `context-validate` is at `warnings` with only the two known pre-existing classes (decision-derivation backfill + the layer-plans nested-array advisory), neither a status-validity error. The single non-defect worth surfacing to the user: **DEC-0013/0014/0015 read `open` though their decided work (pi-bound / global install) shipped and FEAT-005 is complete** — an enacted-in-practice status lag, correctable by advancing those three to `enacted`. Nothing requires correction for the status layer to be reliable; this is the only item the user may wish to reconcile.
