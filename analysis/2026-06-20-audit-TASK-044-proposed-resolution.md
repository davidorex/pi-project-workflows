# Audit — TASK-044 proposed resolution

**Date:** 2026-06-20
**Auditor lens:** poisoned-assumption / code-simplifier on the DESIGN (read-only, no mutation)
**Target:** TASK-044 "Broaden rhetorical-register guard + clean violating block bodies (FGAP-074)"
**Verdict:** **HAS-PROBLEMS** — Part 1 (guard broadening) rests on a WRONG assumption about the current hook; the actual remaining guard gap is a single block, not seven. Part 2 (cleaning) is sound in intent but carries an enforceability gap the design does not name.

---

## Sources read

- `pi-context read-block-item --block tasks --id TASK-044 --json` — the proposed resolution under audit
- `pi-context find-references --id TASK-044 --json` → `task_addresses_gap` → FGAP-074; `item_governed_by_convention` → feature-decomposition
- `pi-context read-block-item --block framework-gaps --id FGAP-074 --json` — upstream proposed_resolution
- Actual cited code: `.claude/hooks/gap-register-guard.sh` (working tree + committed `db4f85d`), `.claude/hooks/block-pi-context-glue.sh`, `.claude/settings.local.json`
- `git log -- .claude/hooks/gap-register-guard.sh`

---

## Problem 1 — WRONG assumption: the guard already covers all seven blocks (CRITICAL)

TASK-044 description, part (1):

> extend the register-checkpoint hook (.claude/hooks/, currently **framework-gaps-only**) to cover append AND update/closure writes for tasks, verification, decisions, issues, research, features, and framework-gaps

FGAP-074 echoes it:

> the register checkpoint guard covers **only framework-gaps**

**This is false against the actual committed hook.** `gap-register-guard.sh:20-21` (identical in working tree and in the committed baseline `db4f85d`):

```sh
if printf '%s' "$cmd" | grep -Eq '(append-block-item|update-block-item|upsert-block-item)' \
   && printf '%s' "$cmd" | grep -Eq -- '--block[[:space:]]+(framework-gaps|tasks|decisions|features|story|research|issues|conventions)|--arrayKey[[:space:]]+(gaps|tasks|decisions|features|stories|research|issues|rules)'; then
```

The live guard ALREADY:
- matches **append AND update AND upsert** (`append-block-item|update-block-item|upsert-block-item`) — so the task's headline "extend … to cover append AND update/closure writes" is already done;
- matches **tasks, decisions, features, story, research, issues, conventions** in addition to framework-gaps — six of the task's seven targets are already covered, plus two the task does not name (story, conventions).

The "framework-gaps-only" claim describes a much earlier state of the hook. The task (and the gap it closes) were filed against a stale mental snapshot. Implementing part (1) as written would be a near-total no-op dressed as a seven-block extension, and an agent handed this verbatim would either (a) re-add match terms that already exist, or (b) waste a cycle discovering the premise is wrong.

**The ACTUAL remaining guard gap is exactly one block: `verification`.** It is the one block named in the task that is absent from both the `--block` and `--arrayKey` alternations. This matters precisely because FGAP-074's own evidence names verification as the single largest violation source ("35/35 verification items: the evidence field carries git-SHA + probe-loop process narration").

## Problem 2 — the guard is provenance+register combined, not a "register checkpoint" (assumption mismatch)

The task calls it "the register-checkpoint hook" and its sentinel "the review sentinel." The actual hook (`gap-register-guard.sh:1-13, 26-48`) is the **PROVENANCE protocol guard** whose sentinel is `# provenance-reviewed`; register rules R1–R6 are the second half of one combined message. There is no separate register-only hook (confirmed: no deleted/renamed register hook in git history).

Consequence for the acceptance criteria: AC-1 says "the same write with **the review sentinel** passes (exit 0)." The literal sentinel an implementing agent must use is `# provenance-reviewed` (`gap-register-guard.sh:23, 33`). The task's abstract "review sentinel" phrasing is under-specified for verbatim downstream composition — a coding agent handed this could invent a `# register-reviewed` token that the hook does not recognize. The criteria must name the exact existing sentinel.

## Problem 3 — Part 2 cleaning lacks an enforceability hook the design implies (scope/fragility)

AC-4 demands "a fresh substrate-wide re-audit … reports ZERO violations." But the guard is a forcing-function that only presents rules at write time and is satisfied by an LLM self-attesting the sentinel; it does not mechanically detect register violations. So:

- "Zero violations" is an LLM-judgement re-audit, not a mechanical gate. Nothing prevents regression the moment the cleaning pass ends — a future writer appends the sentinel and files narration again. The design treats the guard as if broadening it closes the regression class; it does not. This is the same class as the documented FGAP-089 ("guard fires repo-wide, not substrate-scoped") and the TASK-052 "self-attested register review alone did not stop it" origin noted in the hook header (`gap-register-guard.sh:10-13`). The task should either (a) explicitly scope itself to detection-at-write being out of scope and name the residual regression risk, or (b) not claim the guard broadening addresses regression at all.

- "~118 items" / "~197 violations" are point-in-time audit counts (`analysis/2026-06-09-rhetorical-register-block-audit.md`, eleven days stale at this audit). Per the no-stale-stats discipline, the cleaning brief should re-derive the violation set at execution time from a fresh audit, not anchor on the frozen 118. The acceptance criterion correctly says "a fresh … re-audit," but the description's "~118 items in the FGAP-074 audit" hard-codes the stale count as the work scope.

## What is sound

- The **intent** of part 2 — declaratively rewrite violating bodies with zero load-bearing signal loss, session-notes excluded per R6 — is correct and matches the rhetorical-register convention. AC-5 (adversarial per-item original-vs-cleaned diff; context-validate clean; closure/verification invariants intact) is a strong, well-shaped no-signal-loss gate.
- Excluding session-notes (rule 6, narrative is its purpose) is correct and consistent with the guard, which never matched session-notes.
- FGAP-074 closure mechanics (AC-7: verification_verifies_item + complete-task) are canonical.

---

## Proposed corrected proposed-resolution text (ready to replace task fields)

### `description` (replace)

> Close the residual rhetorical-register gap left by the provenance/register checkpoint guard and clean the existing violating context atoms. Closes FGAP-074. Two parts: (1) The provenance/register guard at `.claude/hooks/gap-register-guard.sh` already matches append/update/upsert writes for framework-gaps, tasks, decisions, features, story, research, issues, and conventions; the ONE covered planning block it omits is `verification`. Add `verification` to both the `--block` alternation and `verifications` to the `--arrayKey` alternation (confirm the verification block's array_key via `read-config --registry block_kinds --id verification` before editing). Do NOT re-add the already-present terms. session-notes stays excluded (narrative is its purpose, R6). (2) Re-run the rhetorical-register audit fresh at execution time (do not anchor on the stale 2026-06-09 count) and rewrite every currently-violating block body to declarative current-truth per R1–R6, preserving all load-bearing content. Note: the guard is a write-time forcing-function satisfied by the `# provenance-reviewed` sentinel (LLM-attested), not a mechanical violation detector — it presents the rules, it does not block narration that an author files anyway; mechanical detection-at-write is OUT OF SCOPE here and the post-clean zero-violation state is not regression-proof.

### `acceptance_criteria` (replace items 1–4; keep 5 and 7; revise 6)

1. The provenance/register guard matches append AND update writes for `verification` (the one previously-omitted covered block). Provable: an un-acknowledged `pi-context append-block-item`/`update-block-item --block verification` blocks (exit 2, register/provenance rules on stderr); the same write with a trailing `# provenance-reviewed` sentinel passes (exit 0). The seven already-covered blocks (framework-gaps, tasks, decisions, features, story, research, issues) continue to block un-acknowledged and pass acknowledged (no regression).
2. session-notes writes are NOT guarded (narrative is its purpose, R6). Provable: an un-acknowledged `pi-context append --block session-notes` passes (exit 0).
3. The guard fires on closure/update writes for `verification`, not only append. Provable: an un-acknowledged `update-block-item --block verification` setting evidence/notes/status blocks (exit 2).
4. A fresh substrate-wide re-audit against R1–R6 reports ZERO violations in the covered blocks (session-notes excluded). Provable: re-run the audit at execution time; zero violations across verification, tasks, decisions, issues, research, features, framework-gaps, story, conventions. (Acknowledged non-goal: this is a point-in-time clean, not a mechanical regression gate; the guard presents rules at write time but does not detect violations.)
5. *(unchanged — the no-signal-loss diff gate)*
6. The guard change is tested in isolation: un-acknowledged `verification` append AND update → block (exit 2); the same with `# provenance-reviewed` → pass (exit 0); session-notes append → pass; reads and the already-covered-block writes → unchanged (regression check). Test against a COPY of the hook, never the live guard (FGAP-089: the guard fires repo-wide).
7. *(unchanged — FGAP-074 closed via verification_verifies_item + complete-task)*

### FGAP-074 `proposed_resolution` (replace)

> The provenance/register checkpoint guard already covers append/update/upsert for framework-gaps, tasks, decisions, features, story, research, issues, and conventions; the single remaining omitted covered block is `verification`. Add it to the guard's match-set, then clean every currently-violating body (fresh audit at execution time) to declarative current-truth with no signal loss, session-notes excluded (R6). Mechanical detection-at-write of register violations is a separate, larger concern (the guard is an LLM-attested forcing-function, not a detector) and is not in scope for this gap. Tracked by the broadening + remediation task.

---

## One-line summary for the task block (if a notes correction is filed)

The "framework-gaps-only" premise is stale: the live guard already covers seven of the eight named blocks plus story+conventions; the real delta is adding `verification` alone. The sentinel is `# provenance-reviewed`. The post-clean zero-violation state is not regression-proof (guard presents rules, does not detect) — name that limit rather than imply the broadening closes the class.
