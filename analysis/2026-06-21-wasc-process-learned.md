# WASC operation process — learned from the last complete end-to-end run

Derived from `analysis/2026-06-21-wasc-last-complete-run-step-sequence.md` (session 6e98b2bc, run boundaries 2026-06-21T10:06:50.815Z → 10:47:16.346Z, 175 steps). This run's audit returned 0 findings on the first pass — no iterate-to-zero loop exercised.

One slice, plan-mode go-ahead → ending response. 22 orchestrator (MAIN) steps driving 3 dispatched agents (153 sidechain steps):

## Plan
1. `EnterPlanMode`.
2. Dispatch **Explore** (read-only): map the exact caller chain / facts, cite file:line.
3. Orchestrator **independently corroborates** the Explore findings against source (own grep/sed) — doesn't trust the agent.
4. `Write` the plan: Context · Success Criteria · Approach (decided, grounded) · Verification (gate-first) · Discipline · Critical files.
5. `ExitPlanMode` — approval gate.

## File before building
6. `Write` task JSON → `pi-context append-block-item` (TASK) + `append-relations` (`story_contains_task`, `task_addresses_feature`, `task_addresses_gap`) + `context-validate`; `git switch -c` a per-task branch off main.
7. `TaskCreate` + `TaskUpdate` in_progress (the ephemeral Claude task mirror).

## Implement
8. Dispatch a **fresh IMPL** agent (self-contained brief, STOP-on-ambiguity): gate-first — tests first (RED) → implement (GREEN) → `make verify-slice SLICE=…` exit 0 → commit on the branch → report SHA/diff/gate tail. Orchestrator never writes the source.
9. Orchestrator **re-runs the gate independently** at the IMPL's commit — the fix does not inherit the IMPL's green.

## Audit
10. Dispatch a **separate, fresh adversarial audit** agent (read-only): try to break each criterion, probe the riskiest area hardest, enumerate, end `Total findings: N`.
11. **Done = deterministic gate pass AND audit findings == 0** (DEC-58); otherwise loop.

## Cascade (verify, don't narrate)
12. `Write` VER JSON → `append-block-item` (VERIFICATION, criteria_results) + `append-relations` (`verification_verifies_item`) + `update-block-item` (TASK→completed, FGAP→closed) + `context-validate` 0 errors; append `ORCHESTRATOR-LOG` event + `subagent-invocations` row; `TaskUpdate` completed; read+rewrite the focus item's `next_step`.
13. Commit the cascade → `git switch main` → `git merge --ff-only` → `git branch -d` → confirm `git status` clean.

## Close
14. Ending response: what's fixed, verified-through-the-pipeline (Explore→IMPL→independent gate→audit 0→cascade→ff-merge), and the next human confirmation (re-run the real command).

## Spine
explore → corroborate → plan → approve → file → branch → IMPL → independent gate → separate adversarial audit → zero-gate → machine cascade → ff-merge.

Two distinct planes (orchestrator control vs dispatched-agent execution), three roles kept separate (Explore read-only, IMPL writes, Audit adversarial), state carried in two stores (`.context` typed PM + the decomposed-JSON spine) plus the ephemeral task list.
