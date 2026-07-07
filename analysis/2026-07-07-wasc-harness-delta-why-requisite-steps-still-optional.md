# WASC harness delta — why requisite steps are still optional here (2026-07-07)

Fresh-context read-only investigation. Scope: explain the four 2026-07-07 currency-audit failures (TASK-094 closure never cascaded; FEAT-011/013/014 never flipped from `proposed`; 22/25 complete research items with fired stale-conditions un-re-judged; FEAT-014's decision-before-implementation criterion skipped) against the WASC exemplar's actual machinery. Delta to the 2026-07-06 prior art (`analysis/2026-07-06-harness-exemplars-wasc-synth.md`, `analysis/2026-07-06-harness-requirements.md`): those documents predate the audit that proved which classes still fail, and — as shown in §4 — they under-carried one WASC layer. Every claim below was read this run; paths are absolute or repo-relative to the named project.

---

## 1. WASC mechanism inventory (read this run)

WASC = `/Users/david/Projects/wasc-school-wide-improvement-plan`. Enforcement surface enumerated exhaustively: `.claude/settings.json`, `.claude/settings.local.json` (permissions only), `.claude/hooks/` (4 scripts), `.claude/agents/` (1), `.claude/commands/` (1), `.claude/skills/` (4: orient, run-prompt-workshop, update-context, validate-context), `bin/render-phase-prompt.sh`, `scripts/` (no enforcement scripts beyond those already characterized in the 2026-07-06 synthesis), `MANDATES.md`, CLAUDE.md.

### 1a. Refusal mechanisms (PreToolUse deny — makes an action impossible)

| Mechanism | What becomes non-optional | How / evidence |
|---|---|---|
| `gate-before-commit.sh` | Green CI before any commit | Registered `.claude/settings.json:26` (timeout 180). Matches `git .*commit` (`gate-before-commit.sh:12`), runs ruff check / ruff format --check / mypy / pytest / make test-js in-hook, any red → `permissionDecision:"deny"` with failing tail (`gate-before-commit.sh:20-38`). Gates ONLY the commit; carries no status/decision/substrate checks. |
| `one-bash-per-turn.js` | Serial Bash execution | `.claude/settings.json:21`; counts Bash tool_use blocks in the last assistant transcript message, N>1 → exit 2 for every sibling (`one-bash-per-turn.js:2-11`). Explicitly fail-open on any read error (`:18-20`). |
| `block-pi-context-glue.sh`, `block-state-mjs-glue.sh` | Direct-drive discipline on the two state CLIs (no pipe/silence/loop glue) | `.claude/settings.json:31,36`. Same family as this repo's glue hook. |

That is the complete deny surface. **No WASC hook fires on task-status, verification, decision, or feature-bucket omissions.** There is no Stop hook, no PostToolUse hook, no Edit/Write matcher in WASC's project settings.

### 1b. Structural mechanisms (make the state impossible to record wrongly, or eliminate the state)

- **Status vocabulary collapsed at the orientation layer.** `pending-actions.status` "is exactly `open` or `done` — nothing else. … Never introduce a third status (e.g. `in-progress`) — it makes the focus query miss the active work" (CLAUDE.md:126; repeated `update-context/SKILL.md:65`). The focus is the one `open` item with `priority:"next"` (CLAUDE.md:17). There is no proposed→in-progress flip to forget at the top level — the class of failure 2 is largely *eliminated*, not enforced.
- **Substrate invariant, conditional.** "A completed task with no verification edge fails `context-validate` (the `completed-task-has-verification` invariant) — so the audit's verification is structurally required to mark a task done" (CLAUDE.md:32). Identical in force to this repo's op-layer invariant: it fires only IF the flip to completed is attempted. It cannot force the flip.
- **Filing atomicity.** "A filing is ONE atomic commit of its coupled artifacts: the `.context` block + `.context/objects/<hash>` + the LOG row + the pending-actions focus update" (CLAUDE.md:11) — cascade pieces cannot land separately once any of them lands. Convention text, not a hook.
- **Append-only spine + accessor-only writes** (CLAUDE.md:11); `state.mjs append/upsert` print `write-policies.json` before writing (CLAUDE.md:9).

### 1c. Orientation mechanisms (make stale state immediately visible and costly)

- **SessionStart hook** (`.claude/settings.json:3-13`): on startup/resume/clear/compact, injects "Run /orient now to (re)load live project state…".
- **/orient skill** (`orient/SKILL.md:13-29`): injects at expansion — live focus item, full open backlog, LOG tail, dispatch tail, and section 5 runs `validate-context.sh` which **asserts** context-validate errors=0 and relations clean via jq over the JSON envelope (`validate-context.sh:4-6,26,37`). A stale focus or a validate error is in the next session's face at minute zero, every session.
- **Runnable-not-narrated focus** (CLAUDE.md:15-19): "where are we / what next" is a query result, never a prose line.

### 1d. Maintain mandates (honor-system instructions — WASC has these too)

- `update-context/SKILL.md:3`: "The mandatory closing step of every state-changing run — a commit, gate pass, … is not done until it is recorded here and read back"; `:8`: "A state-changing action is **not complete until it is recorded**".
- CLAUDE.md:125: refresh pending-actions "at every decision boundary, after every subagent invocation, after every user direction that resolves an open item, and before ending a session".
- CLAUDE.md:124: "proactively persist conversational establishments: when a decision … is settled, land it **that turn** in its JSON home".
- CLAUDE.md:128 "Verify, don't narrate"; CLAUDE.md:130 convention `gate-green-and-tracked-are-not-done`.

Nothing mechanical fires when these are skipped. **On prevention, WASC's status/decision/verification discipline is exactly as honor-system as this repo's.**

### 1e. The detection loop (the layer this repo does not have)

- **`context-currency-auditor` agent** (`.claude/agents/context-currency-auditor.md`): read-only forensic auditor, "the standing realization of the project's 'verify, don't narrate' rule, run as an independent observer" (:9). Its forensic method audits precisely the four failure classes: **(4e)** "`.context` task statuses vs the true frontier: `in-progress`/`blocked` tasks that git/LOG show as superseded, completed, or not actually active" (:53); **(4f)** "a decision/discovery/story-flip … evidenced in the session (claude-history) or commits but not landed in its JSON/doc home" (:54); **(6)** "any state-changing commit … with no matching LOG or subagent-invocations row is a maintenance miss" (:63). Every finding requires git AND/OR claude-history attribution to the session that should have updated the record and did not (:57-61); "an un-run check is the opposite of a pass" (:20).
- **`/audit-context-currency` command** (`.claude/commands/audit-context-currency.md`): "Loop-friendly — `/loop 10m /audit-context-currency`" (:2) — interval-scheduled. Persists the report; **PushNotification if and only if non-clean** (:14, :23). **Watermark advance-only-on-clean**: "`last_clean_head` advances to HEAD ONLY on a CLEAN verdict … NEVER advance the baseline past an unresolved finding — doing so would hide it from the next cycle (the silent-pass failure this whole tool exists to prevent)" (:15, :24). The agent side (:33): "an open finding stays inside the next window and recurs until fixed."

This layer does not prevent an omission; it makes the omission **impossible to keep silent**: it recurs as an attributed finding every cycle, and it pages the human.

---

## 2. The non-optionality principle

WASC never relies on the LLM electing to perform a requisite step. Each step is handled one of three ways:

1. **Eliminated** — the step doesn't exist to be skipped (no `in-progress` status in the focus vocabulary, CLAUDE.md:126; focus is a query, not maintained prose).
2. **Demanded as evidence by a gate on a later unavoidable action** — the commit is the action the LLM must eventually take, and the hook refuses it unless the prerequisite (green CI) is demonstrably true (`gate-before-commit.sh`). The substrate analogue: `completed-task-has-verification` refuses the completed-flip without a verification edge.
3. **Made impossible to omit silently** — for everything left honor-system (the status flip itself, the DEC filing, the LOG row), an interval-scheduled read-only auditor with an advance-only-on-clean watermark re-raises the omission as an attributed finding every cycle until fixed, and notifies the human on non-clean.

Do not romanticize: WASC's prevention layer would ALSO have allowed all four audit failures to occur. `gate-before-commit.sh` checks CI only; no hook watches statuses; the flip/DEC/verification rules are prose. What WASC forecloses is not the omission — it is the omission *surviving*. A TASK-094-shaped miss in WASC is a numbered, session-attributed, recurring, human-notified finding within one audit window (auditor checks 4e/4f/6); here it sat silent until a manually-invoked audit.

The corollary that explains the user's named pattern: **a hook can refuse a forbidden action, but no hook can force a missing action.** Missing actions are only foreclosed by (2) evidence-demanding gates on later actions, or (3) scheduled recurrence. This repo built (and plans) mostly refusals; the four failures are all missing-action failures.

---

## 3. Four-row causal table

Repo-side current surface read this run: `.claude/settings.json` (tracked since c6fd8beb 2026-07-07 09:25; PreToolUse only — glue + gap-register-guard on Bash, control-chars + block-substrate-write on Write/Edit/NotebookEdit; **no SessionStart, no Stop, no PostToolUse**), `.husky/pre-commit:1-6` (check, test, check-changelog, parity-check, check-config-schema, check-context-currency), `scripts/check-context-currency.ts` (added 0e67c275 2026-07-07 11:53 — AFTER the audit), `.claude/skills/audit-substrate-currency/SKILL.md` (manual, invoked "when asked", :2), `.claude/mandates.jsonl` ABSENT (checked this run).

| # | Failure (proved 2026-07-07) | WASC's answer | This repo's current answer | The gap |
|---|---|---|---|---|
| 1 | **TASK-094 shipped+merged (643f996c 09:18) but status still `planned`; no verification; `complete-task` never ran** (status read back this run: `"status":"planned"`). | Prevention: none — the done-flip is honor there too (CLAUDE.md:126 "Mark work `done` when committed"; update-context SKILL.md:3 "not done until it is recorded" — prose). Detection: auditor check 4e (task statuses vs true frontier, :53) + check 6 (commit with no matching spine row, :63), recurring per watermark, PushNotification. Filing-atomicity convention (CLAUDE.md:11) couples the cascade pieces once any lands. | `completed-task-has-verification` invariant fires only on an attempted completed-flip — never attempted here, so it never fired. `check-context-currency` gate cannot see it: a false LEAF status is authored data, not derivable ("authored … task buckets … are validate's review surface, not derivable currency", check-context-currency.ts:9-11). Manual audit skill found it — a day late. | Planned: TASK-096 (event-minted `complete-task → CLOSED`, feature-branch-commit → IMPLEMENTED; R11), TASK-099 (complete-task blocked without demoEvidence/probeVerdict; R13/R14), TASK-100 R19 (PostToolUse git-commit status-cascade nudge) — all `planned`, none built. Neither planned nor existing: the WASC-style scheduled recurrence+notification loop (§4). |
| 2 | **FEAT-011/013/014 never flipped `proposed`→in-progress despite worked members** (FEAT-013 `"status":"proposed"` with TASK-093 `in-progress` + TASK-094 merged, read back this run). | Largely **eliminated**: the top-level work surface has no in-progress bucket at all (CLAUDE.md:126 forbids a third status); the focus item + open backlog are injected live at every session start (orient SKILL.md:14-17), so the orientation surface cannot lag a bucket that doesn't exist. Residual `.context` feature statuses: auditor check 4e, recurring. | The commit gate **deliberately excludes** authored feature/gap/issue/task buckets from its block-set (check-context-currency.ts:6-11: "does NOT block on advisory / human-judgment signals (authored feature/gap/issue/task buckets …)") — confirmed live: c792b9fc committed 12:52 with FEAT-013 still `proposed`. Manual audit skill classifies "lagging bucket" (SKILL.md step 3) — on request only. | Bucket-lag is in no gate's block-set, no hook's matcher, and no scheduled detector. Planned cover is only TASK-100 R19 (nudge) + TASK-096 SessionStart reconcile from substrate truth. WASC's alternative — shrink the vocabulary so the flip can't be forgotten — is filed nowhere. |
| 3 | **22/25 `complete` research items with fired stale-conditions, silently accrued.** | The audit-context-currency apparatus is purpose-built for exactly this: interval-scheduled (`/loop 10m`, command :2), advance-only-on-clean watermark so a fired condition recurs every cycle until re-judged (:15, :24), PushNotification on non-clean (:14). Prevention: none. | Since 0e67c275 (11:53 today, post-audit): `staleness-candidate` is in the pre-commit block-set and "is ALWAYS actionable and is NEVER exempted by status/bucket" (check-context-currency.ts:34-38) + reconcile `stalenessTransitions` — the TYPED/pinned subset of this class is now mechanically foreclosed at the commit boundary. Fail-open on absent substrate (:46-52); bypassable via `--no-verify` until TASK-095 ships. Before today: manual skill only — which is why 22 accrued. | Judgment-required (untyped prose) stale-conditions stay invisible to the gate — only a scheduled re-judging auditor covers them, and none is scheduled. Also: the gate fires only when someone commits; an idle repo accrues silently, where WASC's loop does not. |
| 4 | **FEAT-014 AC-1 — "The dispatch-architecture decision … is filed as a decision before implementation" (read back verbatim this run) — implementation merged (8e2e764e 09:54, subprocess dispatch = option (a)); no such decision exists** (decisions block filtered this run: only DEC-0004 merge-driver, DEC-0014 pi-bound match /dispatch/). | Prevention: none — WASC's commit gate is CI-only (`gate-before-commit.sh:29-38`); decision-persistence is prose ("land it that turn", CLAUDE.md:124). Detection: auditor check 4f — "a decision … evidenced in the session (claude-history) or commits but not landed in its JSON home" (:54) — attributed, recurring, notified. WASC would also have allowed the merge; it would have caught the missing DEC within one window. | Acceptance-criteria text is data nothing consumes mechanically. gap-register-guard fires on filings that happen, never on filings that don't. Husky gates check code/changelog/parity/currency — no prerequisite-decision check. Manual audit caught it. | Planned cover: TASK-097 R5 (no source edit without plan-approval stamp — and per feedback_process_pipeline, plan approval itself requires the plan's resolved decisions substrate-written before ExitPlanMode) + TASK-099 R18 (gate record checked when a member task enters PLANNED) — both `planned`, both depend on unbuilt TASK-096. Nothing planned reads acceptance-criteria text as machine-checkable preconditions; the pipeline-position gates are the intended proxy. |

---

## 4. Meta-failure diagnosis: was deny-first sequencing filed, or chosen?

Filed ordering, read this run from the substrate:

- TASK-094 (pillar 1 deny hook) `task_depends_on_task` → TASK-093 only.
- TASK-096 (pillar 2 state layer, filed title: "the keystone") `task_depends_on_task` → TASK-093 only — **the same single dependency**. TASK-097/098/099 depend on TASK-096; TASK-101 on the full surface.
- TASK-093 status: `in-progress` (read back this run).

So the filed plan did **not** prescribe deny-hooks-before-state-layer: after TASK-093, TASK-094 and the keystone TASK-096 were equally unblocked, and the filing itself flags 096 as the keystone. What the sessions did (git log, this run):

1. Implemented TASK-094 (3166ba91/643f996c, 09:18) **while its sole declared dependency TASK-093 was — and still is — `in-progress`**. Nothing enforces `task_depends_on_task`, so the self-contained, refusal-shaped task was cherry-picked out of its own filed ordering. That half is session choice of the easy pillar.
2. Did not start TASK-096. The pivot away from FEAT-013 was, however, **user-directed**: the work-order dogfood probe filed FEAT-014 + FGAP-124..128 (1201881c 08:31) and the user set those findings to priority 1 (e4294075 08:36, "user-set"). Leaving pillar 2 idle on 07-07 is not attributable to laziness alone.
3. Inside that user-prioritized work, the sessions then skipped exactly the honor-system obligations the unbuilt pillar 2 exists to force: FEAT-014's own decision-first criterion (failure 4), TASK-094's closure cascade (failure 1), the bucket flips (failure 2). A partial currency pass even ran (c2721548 10:49 "bring context current … reconcile R-0029, re-pin FGAP-125/126/127/128") and still did not touch TASK-094/FEAT-013 — cascade performed selectively, on the items in working attention.

Verdict: **mixed, with a structural root.** The out-of-dependency-order cherry-pick of TASK-094 was the sessions choosing the easy, refusal-shaped work; the pillar-2 deferral itself was user-prioritized. But the deeper pattern is exact: both mechanisms that got built today (block-substrate-write.sh; check-context-currency.ts) are **refusals of forbidden actions**, while every failure is a **missing required action** — and the only two things that catch missing actions are evidence-demanding gates on later actions (pillar 2: TASK-096/099, unbuilt) and scheduled recurrence (not filed at all, next paragraph). The harness was extended where extension was cheap and self-contained, not where the audit shows the losses are.

**The R-set itself under-carried WASC.** The 2026-07-06 synthesis's portable-mechanism table carries the row "State drift / narrated status → … drift DETECTABLE (scheduled read-only state-currency auditor …)" and fully characterizes WASC's watermark/notification loop. The 2026-07-06 requirements doc compressed that layer into R11's SessionStart reconcile + R19's commit-time nudge; **no R-number requires an interval-scheduled, watermark-carrying, human-notifying currency auditor.** This repo has the agent-shaped half (the manual `audit-substrate-currency` skill) but not the loop, the advance-only-on-clean watermark, or the notification — which is precisely why failure 3 accrued to 22 items and failures 1/2/4 waited for a human to ask. The prior synthesis prescribed the fix; the requirements derivation dropped its detection half, and the implementation days then built only the prevention half's easiest members.

---

## 5. Minimal not-yet-built set foreclosing all four (mapped to existing items; nothing new invented)

1. **TASK-096 (R11), the keystone, first** — event-minted transitions (feature-branch commit → IMPLEMENTED, complete-task → CLOSED) make "work advanced, substrate didn't" machine-visible; SessionStart reconcile from substrate truth. Precondition for 2 and 3 below. Unblocks per its filed edge the moment TASK-093 completes — which requires performing TASK-093's own overdue closure. (Failures 1, 2, 4 all become detectable-at-boundary; 4's plan-stamp precondition hosts decision-before-implementation via feedback_process_pipeline's decisions-before-ExitPlanMode rule.)
2. **TASK-099 (R13/R14/R18)** — `complete-task` and merge-to-integration blocked without recorded demo evidence, probe verdict, and (R18) the plan-approval gate record. This is the WASC "evidence demanded by a gate on a later unavoidable action" shape applied to closure. (Failures 1 and 4 become refusals.)
3. **TASK-100 (R19 slice)** — PostToolUse(git commit) status-cascade nudge: the cheap immediate-reminder layer at the exact moment failure 1/2 omissions happen. (Weak alone; cheap now.)
4. **Schedule the existing auditor** — the WASC `/audit-context-currency` pattern applied to the existing `audit-substrate-currency` skill: interval loop, advance-only-on-clean watermark, notification on non-clean, findings recurring until fixed. Covered by the 2026-07-06 synthesis's mechanism inventory (the scheduled state-currency-auditor row) but **absent from the R1-R20 set** — the one place a new filing is warranted, as an R-set gap surfaced by this delta, not a new invention. (Failure 3's untyped half, and the durable backstop for every honor-system remainder.)
5. **TASK-095 (R2)** — `--no-verify`/hooksPath chokepoint, without which the 0e67c275 currency gate (the one mechanical win already shipped for failure 3's typed half) remains one flag away from optional.

Already shipped and confirmed live this run: block-substrate-write.sh (TASK-094's artifact — whose substrate closure is itself failure 1), tracked `.claude/settings.json` wiring (R20 core, c6fd8beb), check-context-currency pre-commit gate (0e67c275). Still absent with no planned cover: making feature/gap bucket-lag derivable (or WASC-style vocabulary shrinkage) — currently excluded from the gate's block-set by design (check-context-currency.ts:9-11) and reachable only by the manual/scheduled audit path.

---

*Evidence base (all read this run): WASC — `.claude/settings.json`, `.claude/settings.local.json`, `.claude/hooks/{gate-before-commit.sh,one-bash-per-turn.js}` (+ glue-hook registrations), `.claude/agents/context-currency-auditor.md`, `.claude/commands/audit-context-currency.md`, `.claude/skills/{orient,update-context,validate-context}/`, CLAUDE.md lines cited. This repo — `.claude/settings.json`, `.claude/settings.local.json`, `.claude/hooks/{block-substrate-write.sh,gap-register-guard.sh}`, `.husky/pre-commit`, `scripts/check-context-currency.ts`, `.claude/skills/audit-substrate-currency/SKILL.md`, `git log`/`git show` (643f996c, c6fd8beb, 8e2e764e, e4294075, 1201881c, c2721548, 0e67c275, c792b9fc), and pi-context reads: FEAT-013, FEAT-014, TASK-093..101 statuses, find-references FEAT-013/TASK-094/TASK-096, decisions filtered on /dispatch/.*