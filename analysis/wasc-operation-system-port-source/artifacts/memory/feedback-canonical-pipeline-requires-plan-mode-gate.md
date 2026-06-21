---
name: feedback-canonical-pipeline-requires-plan-mode-gate
description: "the canonical pipeline's step 1 MUST run in plan mode with an ExitPlanMode approval gate BEFORE any IMPL dispatch; writing a plan file is NOT the plan-mode phase; skipping the gate breeds dirty unverified residue"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: d7310007-aef3-4e05-a651-d218d1cfd12f
---

Run every canonical-pipeline task IN PLAN MODE: **EnterPlanMode** → dispatch Explore agents → corroborate every load-bearing fact against current source AND git ground-truth (`git status`/`log`/`diff` — an Explore can be flatly contradicted by the actual tree) → write the plan to the plan file → **ExitPlanMode to surface it for the user's APPROVAL** → only on approval dispatch the IMPL → separate adversarial audit → cascade. Writing a plan FILE to `~/.claude/plans/` is NOT the plan-mode phase; the gate is the ExitPlanMode approval BEFORE any IMPL agent runs.

**Why:** I ran TASK-044/045/046 and the first TASK-047 attempt OUT of plan mode, dispatching the IMPL with no approval gate. User: "why are you not in plan mode if this is canonical pipeline" and "canonical process is the only determinator of success and deviation allows for chaos." The deviation's concrete chaos: the first TASK-047 IMPL was INTERRUPTED mid-flight and left uncommitted, unverified edits (preamble + snippet 05 + `.workshopping`) that a file-read alone made look "already done"; only `git status`/`diff` revealed it was unverified residue from an interrupted agent — which then had to be discarded (`git restore` + `rm`, never `git reset` — honor the literal verb) and the task re-run cleanly.

**How to apply:** on "TASK-XXX canonical pipeline," FIRST `EnterPlanMode`; never dispatch an IMPL agent until `ExitPlanMode` is approved; corroborate with git ground-truth, not just file reads or Explore claims. Links: [[feedback-no-pipeline-step-skipping]] [[feedback-corroborate-consumer-chain-of-changed-return-shape]] [[feedback-honor-literal-commands]] [[project-no-resume-quiescent-agent]].
