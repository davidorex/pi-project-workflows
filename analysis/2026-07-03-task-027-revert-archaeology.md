# TASK-027 / FGAP-007 revert archaeology — the complete session-record facts

Date: 2026-07-03. Source: claude-history database (daemon 0.1.0, `~/.claude/.claude-history.db`), all
quotes verbatim from `message_content.text_content`; commit timestamps from `git log` on main.
All message timestamps are UTC as stored; the user's local clock is UTC+8 (13:00:12Z = 21:00:12
local — the git commits stamp +0800). Everything below occurred inside ONE session,
`8490e49a-7509-477f-9cb5-92f16552090a` (a long-running session, first seen 2026-05-31; no other
session in this project overlaps 2026-06-05..06-08 — `sessions --project workflowsPiExtension`
shows the next session start is 2026-06-20). Purpose: test the MILE-005 gate claim
(analysis/2026-07-03-mile-005-criteria-validation.md, TASK-027 Defect 3) that WHAT the failure
was "is recorded nowhere and is not derivable."

## 1. Timeline (all 2026-06-06 unless noted; session 8490e49a throughout)

| Timestamp (UTC) | Actor | Event / verbatim quote | Source |
|---|---|---|---|
| 12:04:45 | user | "task an agent to establish success criteria for a task focusing on this: 007 │ relation_type name reads opposite the deriver's parent/child contract — mis-specified, not missing" | msg 9cc57ce6 |
| 12:07:09 | user | "file the task for fixing with those success criteria" → TASK-027 filed | msg 971e0e1a; commit f276cac |
| 12:10:14 | user | "fix the description to the rhetorical rules" | msg 7a82f9c1; commit 1912031 (20:10:38 +0800) |
| 12:12:06 | user | "we are testing whether the task block passed verbatim to a subagent succeeds. do so. do not augment or change anything in your invocation of the subagent to complete task 027" — THE EXPERIMENT, defined | msg fba54347 |
| 12:17:33 | assistant | "Test result: **the block, passed verbatim, did not complete the task.**" — first dispatch: the subagent analyzed correctly but implemented nothing (received spec, no imperative) | msg 9373922f |
| 12:22:44 | user | "did \"Complete TASK-027\" not get passed to the agent? was the presumption not that a task means do something?" | msg 895e632b |
| 12:23:24 | assistant | admits "Complete TASK-027" was only the Agent tool's `description` UI label, never delivered to the subagent: "it's my error in how I ran the test" | msg 5f62a5ef |
| 12:23:57 | user | "garbage in/garbage out and the test I specifically said I wanted to conduct remains undone and lots of tokens wasted. do it again." | msg 55f9821b |
| 12:24:37 | user (dispatch content) | "Complete TASK-027." + the full task block verbatim (description + 10 acceptance criteria) — the second dispatch | msg 37d64848 |
| 12:43:47–12:46:59 | subagent aa4ce2c73 | implements, commits `3d7d897` (endpoint_roles into active config, 20:43:47 +0800), `a08e586` (feat: code/tests/docs, 20:44:30), `7968580` (close TASK-027+FGAP-007 via VER-015, 20:46:59); self-closes the task in the substrate | git log; msgs 440878a0, aa07935f |
| 12:48:38 | assistant (orchestrator) | "**Test result: yes.** The verbatim TASK-027 block + the `Complete TASK-027` imperative drove a fresh subagent to complete the task end-to-end … the earlier failure was the missing imperative, not the block." Flags: correctness is subagent self-verification only (no adversarial audit yet); an unfiled experience-gap candidate (success message shows authored, not stored, direction) | msg 447e088f |
| 12:50:37 | user | "run the independent adversarial audit on all committed changes" | msg 91319ae9 |
| 12:57:52 | assistant (audit) | full verdict table: **all 10 acceptance criteria PASS**; one DEFECT-1 (LOW–MEDIUM: `append-relation` success message renders pre-orientation authored selectors while storage is the oriented edge, ops-registry.ts:362-369 then); one residual exposure (unregistered `phase_depends_on` uncoverable by the metadata mechanism); "No CRITICAL: no silent data inversion/loss, integrity intact, no criterion claimed-met-but-not." | msg 463c371a |
| 12:58:29 | assistant (orchestrator summary) | "Audit complete — the committed FGAP-007/TASK-027 fix is **verified clean on all 10 acceptance criteria** … Stopping for your decision on both (fix DEFECT-1; file/handle the `phase_depends_on` residual)." — THIS is what the user was looking at when he issued the verdict | msg f0259f68 |
| 13:00:12 | user | **"i think we'll consider the experiment worth running but a failure implementation wise. what are all the files changed. determine only. no action yet."** — the verdict, 94 seconds after the clean-audit report | msg c47c87e2 |
| 13:00:37 | assistant | enumerates the 17 files changed across the 3 commits (code/schema/test 5, docs 4, substrate 8 incl. 3 objects); "Determination only — nothing changed." | msg 43858bc1 |
| 13:01:08 | user | "what happens to the context objects if we revert to a previous commit" | msg 9a28ecf2 |
| 13:03:07 | user | "and what of the state of dist/ etc. is the new code in the distribution?" (assistant: yes — dist/ is gitignored, revert must be followed by `npm run build`) | msg 05eab590 |
| 13:04:53 | user | "what does this mean and why do you specifically raise a point to say it is not relevant: (Ignoring the auto-surfaced DEC-0012 excision plan…)" — clarity complaint about an assistant aside | msg 45faa1d3 |
| 13:07:06 | user | "you make it so very hard to clearly hear and see signal from noise. what are the 2 git options to roll back. do highly concise." | msg f8e34278 |
| 13:07:29 | user | "what's the benefit of 1" (assistant: revert keeps history, "The work remains recoverable if you want it back.") | msg 7edbeb3e |
| 13:07:55 | user | **"git revert 3d7d897..7968580 and the npm run build"** — the revert authorization | msg c746bc53 |
| 13:08:27 | assistant | corrects the left-exclusive range: "Using `3d7d897^..7968580` to cover all three. Running that + build:" | msg 5581b9b3 |
| 13:08:28–29 | git | revert commits land: `98b6413` (closure), `b80eea7` (feat), `fe676a5` (config) — 21:08:28–29 +0800 | git log |
| 13:08:33 / 13:08:42 | user | [interrupt] then "what does that mean. good christ you make it very difficult." (re the range-correction phrasing) | msgs f2884896, 79feae01 |
| 13:09:08 | user | "verify the substrate state and git status" | msg 248c4603 |
| 13:09:49 | assistant | "Verified. Clean revert, fully consistent … TASK-027: `status: planned` … FGAP-007: `status: accepted` (open again). VER-015: gone … dist/: rebuilt, new code absent." | msg 9b745019 |
| 13:15:18 | user | "we need a way to differentiate in tasks without changing the schema what is an orchestrator level criteria evaluation and which is for the coding subagent" — first post-mortem-adjacent design move (role-tag convention on acceptance_criteria) | msg d4f38116 |
| 23:13:38 | user | "we are in a nested branch context: … I want us to evaluate using branches for the feature work **so we don't even run into the issue we had that led to needing to revert and spend huge time cleaning up the results of dirty state etc.** is that a branch per feature, then merge back to context-jit-spec-v2 (knowing we're in that nested branch context)." — origin of the feature-branch-workflow convention | msg e2d20350 |
| 2026-06-07 00:54:12 | assistant (compaction summary) | "The FGAP-007/TASK-027 experiment: file the task, test whether a verbatim task block drives a subagent, implement the relation-direction fix, adversarially audit it — then REVERT all of it (the user judged the experiment worth running but a failure implementation-wise)." — no reason recorded | msg 7954b43b |
| 2026-06-11 22:33–22:37 | user | "first let's update the Claude Code Tasks list to reflect current reality" → TASK-027 re-listed as an open Task-tool item, no commentary | msgs dc7898e4 + tool result 22:37:38 |

## 2. What the record establishes

1. **What the experiment was** (user-verbatim, 12:12:06): whether a filed task block, passed
   verbatim and unaugmented to a subagent, drives completion. First run failed to even conduct the
   test (imperative never delivered — orchestrator error, admitted); second run (block +
   "Complete TASK-027.") succeeded end-to-end, including subagent self-closure of the substrate.
2. **What the user was shown immediately before the verdict**: the adversarial audit's clean
   verdict — 10/10 acceptance criteria PASS, one LOW–MEDIUM user-facing display defect (DEFECT-1),
   one out-of-scope residual (`phase_depends_on`) — ending "Stopping for your decision on both."
   The verdict was NOT a response to a failed audit, failing tests, or a broken demo. The verdict
   arrived 94 seconds later and did not answer the decision that was posed (fix DEFECT-1 /
   handle the residual); it redirected to files-changed determination.
3. **Everything the user said between the feat landing (12:44:30Z) and reverts completing
   (13:08:29Z)** is in the timeline above — it is entirely: the verdict sentence, mechanics
   questions (objects, dist/), two clarity complaints, and the rollback-option exchange. No
   statement in that window characterizes any defect of the implementation.
4. **The revert authorization** (user-verbatim, 13:07:55): "git revert 3d7d897..7968580 and the
   npm run build". The assistant corrected the left-exclusive range to `3d7d897^..7968580`;
   three revert commits landed 13:08:28–29Z; dist rebuilt; substrate read back at 13:09:49Z as
   TASK-027=planned, FGAP-007=accepted, VER-015 gone, context-validate 0 errors.
5. **Nothing was filed to capture the judgment.** `file_operations` for session 8490e49a shows
   zero `.context` writes between 13:09 and 14:30 UTC; the next substrate commit (13:52,
   FGAP-040 story-schema type field) is unrelated. The revert commits carry no rationale text.
   TASK-027's filed text was left as the pre-attempt (1912031) version — consistent with the
   MILE-005 gate finding that the filed text carries no signal the attempt/judgment ever happened.
6. **The nearest contemporaneous framing** (user-verbatim, 23:13:38, ~10 h later): the episode is
   referenced as "the issue we had that led to needing to revert and spend huge time cleaning up
   the results of dirty state etc." while instituting branch-per-feature — i.e., the user's
   recorded takeaway is about the COST of rejecting trunk-committed work, and the recorded
   process changes that followed the same day are (a) the feature-branch-workflow convention and
   (b) the orchestrator-vs-subagent split of acceptance criteria (13:15:18). Neither statement
   names what was wrong with the endpoint_roles implementation itself.
7. **"Worth running" has a recorded referent**: the experiment's positive result was explicitly
   reported (12:48:38) as "the filed block functions as sufficient DRY context to drive completion
   once paired with the do-it imperative; the earlier failure was the missing imperative, not the
   block."

## 3. What the record does NOT contain

**No user or assistant statement, anywhere in the session history, articulates WHY the
implementation was judged a failure** — not at the verdict, not during the revert, not later in
session 8490e49a (scanned through 2026-06-07), not in any later session. The MILE-005 gate claim
is CONFIRMED for the session record as well as for disk: the failure reasons were never
articulated, so they are unrecoverable from the record. Searches that establish each absence
(all against fts_message_content / messages / file_operations via `claude-history`
`queries run fts-search` and `execute_sql`):

- `MATCH '"worth running but a failure"'` → 1 hit: the verdict message itself (c47c87e2).
- `MATCH '"worth running" OR "failure implementation" OR "implementation wise"'`, all types, all
  dates → only the verdict, the 06-07 compaction summaries (which repeat the sentence without a
  reason), and unrelated projects.
- `MATCH '"endpoint_roles"'`, user messages after 13:10Z → only commit-log echoes inside tool
  results (06-20, 07-02, 07-03 archaeology itself); zero user-authored statements.
- `MATCH '"TASK-027"'` and `MATCH '"FGAP-007"'`, user messages after 13:10Z, this project → only
  tool-result echoes, the 06-11 mechanical Tasks-list refresh, and a 06-14 filing-mechanics
  question; the `d7310007` hits are a DIFFERENT project's TASK-027 (wasc improvement plan).
- `MATCH '"auto-orient" OR "auto-orients" OR "auto-orientation" OR "dirty state"'`, user, this
  project → only the 23:13:38 branch-workflow message (quoted above) and pre-June dirty-state
  complaints unrelated to TASK-027.
- `MATCH 'experiment AND (verbatim OR subagent OR task)'`, user, this project, 06-06→06-30 → empty.
- `MATCH 'revert OR reverted OR reverting'`, user, this project, after 06-07 → two hits, both
  unrelated (a 06-17 checkout question; a 06-21 feature-demote reversal).
- `MATCH 'failure AND (experiment OR endpoint OR ordering OR direction)'`, user, after the
  verdict, all projects → empty.
- Time-window sweep (no keywords): every user message in session 8490e49a from 13:00:12Z to
  2026-06-07 00:00Z was read (two windows, 13:00–14:30 and 14:30–24:00) — the full set is in the
  timeline/§2; none states a reason.
- `file_operations` on `%.context%`, session 8490e49a, 13:09–14:30Z → zero rows (nothing filed).
- The 06-07 00:54 and 07:56 compaction summaries (assistant-authored) both record the judgment
  verbatim-by-paraphrase with no reason attached.

**Specifically not present anywhere**: any evaluation by the user of the auto-orientation (vs
reject) choice, the endpoint_roles metadata shape, the six-sibling scope, DEFECT-1, the
`phase_depends_on` residual, the subagent's self-closure of the substrate, or any code-level
property of a08e586. Whether any of these motivated the verdict is not decidable from the record.

## 4. Implications for the TASK-027 re-anchor

The record fully grounds: the experiment's definition and outcome, the exact artifact rejected
(commits 3d7d897/a08e586/7968580, 17 files), the audit state at the moment of judgment (10/10
PASS + DEFECT-1 + residual), the revert's authorization/execution/verification, and that the
judgment was never filed. The record constrains interpretation — the verdict followed a clean
audit, and the user's only recorded retrospective framing is process-cost ("huge time cleaning
up the results of dirty state"), followed same-day by two process reforms (feature branches;
orchestrator/subagent criteria split) — but constraint is not articulation. The following remain
answerable ONLY by the user:

1. **What "a failure implementation wise" refers to**: the endpoint_roles/auto-orientation
   mechanism itself, some property of the code produced, or the way the work was executed
   (trunk commits, subagent self-closure, cleanup cost)? The clean 10/10 audit plus the
   process-framing at 23:13:38 are consistent with a process/execution reading, but the sentence
   grammatically attaches "failure" to the implementation and no recorded statement resolves it.
2. **Whether the design filed in TASK-027 criteria 2–3 (endpoint-role metadata +
   validate-or-normalize at append) is itself rejected** — i.e., may a re-implementation reuse
   the reverted mechanism (recoverable at b80eea7^ = a08e586), or must the approach change?
3. **Whether DEFECT-1 (authored-vs-stored success message) and the `phase_depends_on` residual
   played any role in the verdict**, and whether their handling is a requirement of any re-attempt.
4. **What of the experiment's positive finding is to be preserved as convention** — the recorded
   lesson ("verbatim block + imperative suffices") was never filed either.
