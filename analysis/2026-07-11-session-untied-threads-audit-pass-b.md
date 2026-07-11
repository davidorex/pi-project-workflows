# Session untied-threads audit — pass B (independent reconstruction)

Session audited: `d3030496-e4e1-4bfa-8df1-1df86bac518a` (claude.ai `session_01Cjctq42gHDdWsHVT8KfdAY`), project `/Users/david/Projects/workflowsPiExtension`, first message 2026-07-09T22:37:51Z (06:37 +08, 2026-07-10), still live at audit time (2026-07-11). 14,108 messages (main chain: 1,424 user / 2,403 assistant), two context compactions (2026-07-10T04:51Z, 2026-07-11T07:02Z).

Method: full chronological read of the main-chain user-message spine and assistant text via ordered SQL over claude-history; complete enumeration of all 93 subagent dispatches; both compaction summaries read in full; every candidate thread then verified against live ground truth (git log/branches/status, `.context/*.json` direct reads, `pi-context context-validate`, `.claude/mandates.jsonl`, `.claude/settings.json`, hedge-scanner rerun). No pre-guessed keyword hunting; `search_messages` used only to confirm one already-identified candidate (mandate-injection portability — zero later mentions, confirming silence).

Timestamps below are UTC (add 8h for local).

---

## Thread 1 — TASK-091: work partially landed by a killed/raced agent, never verified, never closed (ACTION NEEDED)

**What happened.** 2026-07-11T03:57:35Z the user directed "do these: parallel agents: TASK-090 TASK-091" (meaning: run the fork-provenance audit template on their filed text). The orchestrator instead dispatched two background implementation agents (04:04:41Z, 04:05:23Z) sharing one working directory. They raced on git HEAD; TASK-090's agent committed TASK-091's uncommitted substrate work onto main (`b4c9bce1`), then stranded TASK-091's CHANGELOG commit (`d06bf3d3`) and a SKILL regen (`e3626377`) on `task-090-drift-surfacing`. Per user instruction the running agent was killed (04:24:36Z), uncommitted changes discarded, and `task-090-drift-surfacing` deleted (04:30:27Z) — destroying `d06bf3d3` and `e3626377`. The 2026-07-11T07:02Z compaction summary itself flags: "TASK-091's actual work … was destroyed … never re-implemented, re-verified, or re-closed — this is a live gap not yet raised to the user." Nothing after that point in the transcript touches TASK-091.

**Verified current state** (checks run 2026-07-11):
- `jq '.tasks[]|select(.id=="TASK-091")' .context/tasks.json` → status **`planned`**.
- The convention **did survive**: `substrate-derived-state` is in `.context/conventions.json` (rules list), committed on main via `b4c9bce1` ("commit the pre-existing substrate-derived-state convention filing found uncommitted on main") — `git branch --contains b4c9bce1` → main.
- The FEAT-011 edge flip **did land**: relations.json has `FEAT-011 -item_governed_by_convention-> substrate-derived-state`, and no `FEAT-011 -item_acknowledges_missing_convention->` edge remains (the 11 remaining acknowledges-missing edges are all DEC-→FGAP-05x, unrelated).
- The installed + samples milestone schemas cite the convention (1 hit each in `.context/schemas/milestone.schema.json` and `packages/pi-context/samples/schemas/milestone.schema.json`).
- **AC3 (dual-surface) NOT met**: `grep -c substrate-derived-state packages/pi-context/samples/conception.json` → **0**. A fresh accept-all/install substrate will NOT carry the convention — TASK-091's acceptance criterion 3 explicitly requires it.
- **AC4 CHANGELOG entry destroyed**: `grep -rn "derived-state" packages/*/CHANGELOG.md` finds only the older milestone-block entry, no convention-filing entry.
- AC2 (sweep for other dangling convention citations in shipped schema text) — no evidence anywhere that this sweep ran and was verified; the only agent that may have done it was the raced/killed pair, whose work the user asked "how can you know the agent's work is valid?" about — it was never independently verified.
- No verification item; `complete-task` never run. Empty branch `task-091-derived-state-convention` (tip `370b1477` = an ancestor of main, i.e. zero unique commits) still exists in `git branch`.

**Action needed:** yes — either finish TASK-091 through the pipeline (catalog dual-surface seeding, dangling-citation sweep, CHANGELOG entry, verification + complete-task) with the already-landed pieces independently verified, or explicitly revert/decide. Also delete the empty branch.

## Thread 2 — TASK-090: killed agent's work discarded; task back to bare backlog (LEGITIMATE STATE, worth confirming intent)

**What happened.** Same incident as Thread 1. TASK-090's implementation work (drift surfacing in currentState, FEAT-011 criteria 7/9) was discarded per the user's explicit "i don't want fucking anything from this branch" + "delete task-090-drift-surfacing". At 06:48:59Z the user said "rerun the template properly on TASK-090"; the orchestrator verified (06:50:40Z) TASK-090 is not a scanner candidate at all (no hedge language), reported factually, no dispatch — correct closure of the *audit* interpretation.

**Verified current state:** TASK-090 status `planned` in `.context/tasks.json`; hedge-scanner rerun today confirms neither TASK-090 nor TASK-091 is flagged. No branch, no stray commits. The task (FEAT-011 T7) is clean open backlog.

**Action needed:** none forced — but note FEAT-011 is `in-progress` and both of its T7/T8 tasks (090/091) sit in the states above.

## Thread 3 — the substrate hedge-audit program: ~90 candidates never audited; the stated end-state not reached (OPEN PROGRAM, the session's largest tail)

**What happened.** 2026-07-10T23:45:18Z the user declared the purpose: "we are prototyping the mechanism we will use to bring rationality and validity to all filings in the substrate. the end result … the substrate has been exactingly audited, validated, and corrected, and any TRULY unknown … surfaced." At 2026-07-11T03:55:45Z the orchestrator enumerated **90 unaudited candidates** (91 scanned, 4 done at the time). Items actually template-audited in the whole session: FGAP-126 (pre-template deep provenance, corrected + TASK-118 filed), FGAP-127 (×2, corrected), FGAP-124 (corrected), FGAP-125 (corrected), FGAP-085 (validated, no correction), FGAP-043 (audited → canonical resolution decided → implemented as TASK-121), TASK-090 (checked, not a candidate). Everything else stopped when the FGAP-043 implementation arc took over (~08:10Z onward).

**Verified current state:** `npx tsx scripts/scan-substrate-hedges.ts` today emits **90 candidate lines** (some are the already-audited-and-validated items which legitimately retain their hedge language, e.g. FGAP-085; most have never been touched). The session's own last ranking (07:15:31Z) named **FGAP-093** as the top extension-focused next candidate and **FGAP-100** next; **FGAP-089** was explicitly excluded by the user ("harness isn't being evaluated", 07:15:01Z).

**Action needed:** yes if the program stands — resume template audits against the candidate list (FGAP-093 first per the session's own ranking). The scanner, template (`analysis/2026-07-11-gap-fork-provenance-audit-brief-template.md`, committed `c9eb33a7`), and both prioritization artifacts exist and are committed/published.

## Thread 4 — schema-versioning design-intent archaeology: dispatched, interrupted 5 seconds later, never re-run, never answered (ACTION NEEDED)

**What happened.** 2026-07-11T12:34:56Z the user asked: "what does the extension code here do and what of the versions. are they to have them? what does claude-history have to say about schema versions and substrate items? i suspect we've have partially implemented / unfinished elements thrown around with no clear overarching understanding of intended end state as revealed in claude-history." Two Explore agents were dispatched: mechanism-map (12:35:34Z — consumed; it surfaced the live `research` migration-chain throw) and "Archaeology of schema-versioning design intent" (12:43:44Z). The user interrupted that dispatch at 12:43:49Z ("and so you punted and moved on?" — about the context-validate punt). At 12:43:27Z the orchestrator had said "Dispatching the claude-history side of your question now before reporting everything together" — the archaeology never ran (SQL over the transcript finds zero main-chain content matching "archaeology"/"design intent" after the dispatch) and "reporting everything together" never happened; the flow became the TASK-122 fix, closed at 13:48:50Z, and the user's "great." moved straight to this audit.

**Verified current state:** no analysis file, substrate item, or transcript answer addresses the claude-history intent question ("are schemas to have versions — intended end state"). The mechanism half is partially answered in-session (12:11Z/12:16Z sub-answers: only session-notes and user-stories carry baked-in versions, etc.), but the intent-archaeology half is simply missing.

**Action needed:** yes — the user's question is still owed an answer; the interrupted Explore was never re-dispatched.

## Thread 5 — FEAT-014 "finish" (fable's standing recommendation): only 1 of 3 gaps has an implementing task, none implemented (OPEN BACKLOG with a decomposition hole)

**What happened.** 2026-07-10T05:02:58Z the user had fable pick the most impactful next step → "finish FEAT-014 (close FGAP-125, FGAP-126, FGAP-128)". At 11:12:12Z the orchestrator confirmed "None of these have a filed task yet". The session then validated all three gaps' currency (11:29:01Z dispatch), deep-audited and corrected FGAP-126 (12:30:20Z), and filed **TASK-118** (23:12:34Z, commit `ba5ad2dc`) implementing FGAP-126's corrected single resolution. The arc then permanently diverted into the template/audit program.

**Verified current state** (`.context` reads today):
- FEAT-014 `in-progress`. FGAP-125 `identified` (resolution corrected `370b1477`, **no addressing task** — `jq` over relations.json finds zero `task_addresses_gap` edges to FGAP-125 or FGAP-128). FGAP-126 `identified`, TASK-118 `planned`, birth edges present (TASK-118→FGAP-126, TASK-118→FEAT-014). FGAP-128 `identified`, validated as fork-free (23:15:31Z verdict), no task.
- TASK-119 (`planned`) carries the user's verbatim "i want it to copy agents" directive — FGAP-127's still-open ceremony-seeding disjunct IS filed (FGAP-127 itself `closed`). So that sub-thread is tied off by filing.

**Action needed:** decomposition + implementation remain if "finish FEAT-014" still stands: implement TASK-118; file tasks for FGAP-125/FGAP-128 (and TASK-119 when prioritized).

## Thread 6 — the delta-scoped comment-citation gate: future work recorded ONLY inside a closed gap's closure text (ACTION NEEDED to keep it discoverable)

**What happened.** 2026-07-09T23:56:58Z the user: "this now points to a class of scripts forward looking: a pre-commit hook that flags the use of such harness jargon in any code comment…". The fable consult (23:59:04Z) recommended: gate later, as its own task — extend `citation-rot-scanner.ts` (export its detection core), delta-scoped to newly-introduced citations only. The FGAP-136 de-jargon rollout (TASK-107–115) completed and FGAP-136 was closed.

**Verified current state:** FGAP-136 `closed`; its `closed_by` says verbatim: "The proposed delta-scoped extension of citation-rot-scanner.ts to gate future comment citations **remains unbuilt -- filed here as future work**, not part of this closure." But "here" is a closed item — `jq` over tasks/gaps finds **no** open item tracking the gate; `.husky/pre-commit` runs only check/test/check-changelog/parity-check/check-config-schema. The hedge scanner ignores closed items by design, so no audit pass will ever resurface this.

**Action needed:** yes — if the gate is still wanted, it needs a real open filing (task or gap); as recorded it is invisible to every derive-state surface the project uses.

## Thread 7 — mandate-injection portability: fix shape identified, never enacted, never filed (ACTION NEEDED or explicit decision)

**What happened.** 2026-07-09T23:01:36Z (answering "explain what we are to do with these items"): item 2 was "the mandate-injection hook … lives in your global ~/.claude/settings.json, not this repo — a fresh clone gets AC1's guards but not the mandate injection." At 23:05:29Z the orchestrator concluded items 1+2 "collapse into one underlying question … the fix for item 1 is the same shape as item 2: copy `mandate-008` verbatim into the project-tracked `.claude/mandates.jsonl`." The conversation then went to the punt-escape-hatch governance question, resolved by updating FEAT-013's motivation (committed `e43c1bd2`, 23:28:19Z) — and the portability fix was never mentioned again (full-text search over the whole corpus for mandate-injection+global returns nothing later).

**Verified current state:** `.claude/mandates.jsonl` still has exactly `mandate-p01..p04` (no stop-on-ambiguity/mandate-008 entry). Repo `.claude/settings.json` hooks = `["PreToolUse"]` only; the `mandates.jsonl` injection is registered only in global `~/.claude/settings.json` (grep confirms). No FGAP/TASK mentions mandate-injection portability. FEAT-013 remains `in-progress`; its AC4 wording ("through the existing UserPromptSubmit injection slot") is satisfiable by the global hook, so no substrate item forces the portability guarantee.

**Action needed:** yes — either enact the identified fix (copy the mandate into the project file + repo-tracked hook registration) via the pipeline, file it, or record a decision that global-only is acceptable.

## Thread 8 — branch and push housekeeping (MINOR)

**Verified current state** (`git branch -a`, `git status -sb` today):
- 5 merged-but-undeleted `worktree-agent-*` branches from the 2026-07-10 de-jargon worktree dispatches (all `--merged main`); pipeline step 7 prescribes branch deletion after merge.
- `task-091-derived-state-convention` — empty (ancestor of main), see Thread 1.
- `feat/context-currency-precommit-gate` — merged, last commit 2026-07-07 (predates this session; pre-existing housekeeping).
- `main` is **21 commits ahead of `origin/main`, none pushed** — consistent with the release/push HOLD the orchestrator cited (13:48:50Z "none pushed"); a legitimate held state awaiting user authorization, not a defect. Similarly no version bump after TASK-121/122 shipped new public surface (CLI reported 0.33.0 unchanged at 11:11:00Z) — releases HELD per standing directive.
- Untracked: `analysis/2026-07-11-session-untied-threads-audit.md` (pass A's report) — uncommitted at audit time; part of the currently-running audit cycle, to be committed by the orchestrator per de-ephemeralize-at-source.

## Threads verified as legitimately closed (silence checked, closure confirmed)

- **TASK-093** (finish per 22:45:52Z directive): `completed`; mandates file exists; probe run.
- **FGAP-136 rollout** (TASK-107–115): all `completed`; all 5 meaning-table files exist in `analysis/`; issue-012 `resolved`; the failed pi-workflows meaning-gather agent's report was re-written by the orchestrator (file present).
- **TASK-114 STORY-010 residue + TASK-111 branch corruption**: fixed in-session after the "under what policy…" correction (per compaction summary 1; tasks `completed`).
- **TASK-116** (file-changed line-scoping) + **TASK-117** (revision-moved removal) + **FGAP-137/FGAP-138**: `completed`/`closed`; FEAT-011's criteria no longer mention revision-moved (grep = 0) per the 05:00:08Z "remove it".
- **Worktree friction**: user ruled "purely you, not a gap" — memory updated, correctly not filed.
- **mandate-p03 title fragility** (11:08:31Z): fixed ("Ask Gate"), committed `e1a81aa1`; file verified today.
- **`analysis/2026-07-09-stop-hook-payload-probe.md`**: committed in `6d7b265d` (the stale `??` in older status snapshots predates it).
- **TASK-120** (hedge scanner): `completed`; scanner + test committed; scoring removed and terminal-status skip generalized per corrections; both dashboards published (scroll bug fixed).
- **pi-mono-is-exemplar convention**: filed (`64eebfed`), 4 user-approved points; template updated with it.
- **Prompt template**: rewritten per researched Anthropic docs, committed `c9eb33a7`.
- **TASK-121/FGAP-043**: `completed`/`closed`, VER-098 `passed`, merged `09895042`; **FGAP-139** (primitive-string arrays) filed `identified` — tied off by filing, no task yet.
- **TASK-122/FGAP-141** (the "i don't want register i want fixed" fix): `completed`/`closed`, VER-099 `passed`, merged `35250b6a`, closure cascade run on main; both previously-broken blocks read clean; **FGAP-140** (fresh-install migration seeding) filed `identified` — tied off by filing, no task yet.
- **`pi-context context-validate` today**: 0 errors; warnings only, all pre-existing classes (17 DEC derivation-basis warnings, 15 completed-task-vs-open-parent warnings, 2 Phase-H nested-array warnings) — none introduced by this session's closures.

---

## Punch-list

| # | Thread | Verified state (2026-07-11) | Action needed |
|---|--------|------------------------------|---------------|
| 1 | TASK-091 partially landed by raced agent | convention + edge flip live on main; catalog dual-surface AC unmet (conception.json 0 hits); CHANGELOG destroyed; sweep unverified; status `planned`, no VER; empty branch remains | Finish through pipeline or decide; verify landed pieces; delete empty branch |
| 2 | TASK-090 after kill/discard | `planned`, clean, no residue; not a hedge candidate | None forced; open FEAT-011 backlog |
| 3 | Hedge-audit program | ~90 scanner candidates unaudited (7 items done); FGAP-093 ranked next, FGAP-100 after | Resume template audits if program stands |
| 4 | Schema-versioning intent archaeology | dispatch interrupted 12:43:49Z, never re-run; user's question unanswered | Re-dispatch; deliver the promised combined report |
| 5 | FEAT-014 finish | TASK-118 `planned` (unimplemented); FGAP-125/128 `identified` with zero addressing tasks; TASK-119 filed | Implement TASK-118; decompose 125/128 when prioritized |
| 6 | Delta-scoped comment-citation gate | recorded only in closed FGAP-136's closed_by; no open item; no hook | File as open task/gap if still wanted |
| 7 | Mandate-injection portability | fix shape identified 23:05Z Jul 9, never enacted/filed; mandates.jsonl still p01–p04; injection global-only | Enact + file, or record decision global-only is fine |
| 8 | Branch/push housekeeping | 5 merged worktree-agent branches + empty 091 branch undeleted; main ahead 21 unpushed (HELD); no release after new surface (HELD) | Delete stale branches; push/release await user authorization |
| 9 | FGAP-139 / FGAP-140 | filed `identified` this session, no tasks | None — legitimately tracked backlog |
| 10 | Pass-A audit report | `analysis/2026-07-11-session-untied-threads-audit.md` untracked | Commit as part of current audit cycle |
