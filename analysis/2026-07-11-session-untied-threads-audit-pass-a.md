# Session untied-threads audit — independent pass A — 2026-07-11

Session audited: Claude Code session `d3030496-e4e1-4bfa-8df1-1df86bac518a` (claude.ai `session_01Cjctq42gHDdWsHVT8KfdAY`), this project, started 2026-07-10 06:37 +08 (2026-07-09T22:37:51Z), ~14,100 messages, still live at audit time. Method: full chronological read of the main-chain message stream (user text + assistant text + Agent dispatches) via claude-history SQL, ledgering every opened thread against this project's closure signals (git commit on main, substrate status flip, filed verification, explicit user acknowledgment), then verifying each candidate's CURRENT state against live git, the live `.context` substrate, the filesystem, and read-only `pi-context` ops at audit time (2026-07-11 ~22:40 +08). No prior audit's findings were consulted before reconstruction; the transcript's own claims were not trusted — every "current state" below names the check run. Timestamps are UTC (add 8h for local).

Live baseline at audit time: `main` @ `c0d093eb` (TASK-122/FGAP-141 closure), tree clean except `?? analysis/2026-07-11-session-untied-threads-audit.md`, 21 commits ahead of `origin/main` (push HELD per standing release-hold — policy-consistent, not a defect).

---

## Thread 1 — The user's schema-version design-intent question was never answered (dropped at the punt callout)

**What was said/done.** At 12:34:56Z the user asked: "what does the extension code here do and what of the versions. are they to have them? what does claude-history have to say about schema versions and substrate items? i suspect we've have partially implemented / unfinished elements thrown around with no clear overarching understanding of intended end state as revealed in claude-history." Two agents were dispatched to answer it:

- 12:35:34Z — Explore agent "Map current schema-versioning + migration mechanism" (`toolu_0166C8bmXZYcuH61BGXzCuVJ`): a comprehensive map of the whole subsystem, to judge "coherent, intentionally-designed subsystem or an accretion." It RETURNED at 12:42:12Z with a full six-version-concept map. The orchestrator used exactly one datum from it — the live `research.json` read throw — pivoted to "This surfaces something urgent" (12:42:47Z), and the map's actual answer to the user's question was never relayed, in any later message, through end of session.
- 12:43:44Z — claude-history agent "Archaeology of schema-versioning design intent" (`toolu_011tiSMPF75wymnCf4ThyTui`): REJECTED by the user at 12:43:49Z (the interruption that became the punt callout at 12:44:07Z). Never re-dispatched. No later message addresses the design-intent/claude-history half of the question.

The interrupt cascaded into TASK-122/FGAP-141 (correctly closed, see Thread 14), but the originating question — are block schemas supposed to carry versions; is the versioning subsystem designed or accreted; what end state does claude-history reveal — got no answer. This is precisely the structural pattern the user flagged at 13:51:01Z ("before i pointed out your punt you had identified other things needing to be done").

**Verified current state.** Checked every main-chain assistant message after 12:42Z containing "archaeolog"/"design intent"/"accretion" — zero relays of either result before the untied-threads pivot at 13:51Z. The Explore map's full text sits only in the 12:42:12Z tool_result, unread by the user.

**Action needed: YES.** Relay the returned map's verdict; re-dispatch (or fold into other work) the claude-history design-intent archaeology the user asked for.

## Thread 2 — TASK-091: recovered deliverable, but unclosed, unverified sweep, lost CHANGELOG entry, stale branch

**What was said/done.** 03:57:35Z (07-11) user: "do these: parallel agents: TASK-090 TASK-091" — meaning template-style filed-text validation. The orchestrator instead dispatched two background general-purpose implementation agents with full pipeline briefs (branch/commit/merge) — the category error the user then dismantled (04:02–04:28Z). The agents raced in one working tree: TASK-090's agent committed TASK-091's work as `b4c9bce1`, TASK-091's CHANGELOG commit `d06bf3d3` landed on the sibling's branch, TASK-090's agent was killed mid-commit ("kill the running agent," 04:24:36Z), branch `task-090-drift-surfacing` deleted per 04:30:27Z directive.

**Verified current state.**
- `git log`: `b4c9bce1` ("substrate+catalog: file the substrate-derived-state convention…") IS on `main`. Convention `substrate-derived-state` exists in `.context/conventions.json`; edge `FEAT-011 --item_governed_by_convention--> substrate-derived-state` exists in `.context/relations.json`; catalog `milestone.schema.json` carries the citation (grep: 1 hit). Deliverable live.
- `git cat-file -t d06bf3d3` → commit; `git branch --contains d06bf3d3` → NO branch. `grep "derived-state" packages/pi-context/CHANGELOG.md` → zero hits. **The TASK-091 CHANGELOG entry is lost on main** (recoverable: the orphan commit still exists, cherry-pickable until gc).
- `.context/tasks.json`: TASK-091 status **`planned`**. No verification item, no complete-task. Its AC "a shipped-schema-text sweep finds zero other dangling convention citations" was only ever the killed-arc agent's self-report — the orchestrator said explicitly at 04:24:19Z "I've only relayed the agent's self-report… That verification is exactly what I'm holding" and it was never subsequently run.
- `git branch`: `task-091-derived-state-convention` still exists, 0 commits ahead of main — empty, stale.

**Action needed: YES** — independent sweep verification + CHANGELOG recovery (cherry-pick `d06bf3d3` or re-add entry) + verification/complete-task closure + delete the empty branch. Note the user's 06:48:59Z "rerun the template properly" covered TASK-090 only; TASK-091's filed text was never template-audited either.

## Thread 3 — TASK-090: open by user decision, but still bare `planned` with FEAT-011 criterion 7 unmet

**What was said/done.** TASK-090 (always-on drift surfacing in currentState, FEAT-011 criteria 7/9) — its agent was killed mid-commit; the user rejected everything on the branch ("i don't want fucking anything from this branch," 04:29:59Z); branch deleted. At 06:48:59Z "rerun the template properly on TASK-090" → orchestrator checked (06:50:40Z): TASK-090 carries no hedge match, nothing for the template to audit — accepted by the user moving on (06:52:11Z).

**Verified current state.** `.context/tasks.json`: TASK-090 `planned`, filed text intact. FEAT-011 `in-progress`, criterion 7 (drift surfacing) present and unimplemented. Working tree clean — the killed agent's uncommitted edits (context-sdk.ts etc.) are gone, per directive.

**Action needed: open work, deliberately.** The implementation was discarded by explicit user decision, so not a silent drop — but the task is real FEAT-011 remainder with no plan attached.

## Thread 4 — The substrate-wide hedge-audit program: ~90 of ~96 candidates never audited

**What was said/done.** The user's stated program (23:45:18Z 07-10): "we are prototyping the mechanism we will use to bring rationality and validity to all filings in the substrate. the end result of all of this will be that the substrate has been exactingly audited, validated, and corrected, and any TRULY unknown… surfaced." Items actually run through the audit (template or equivalent): FGAP-126 (manual; both forks corrected, `12609fa1`), FGAP-127 (v1+v2, no correction), FGAP-124 (no correction), FGAP-125 (one arm dropped, `370b1477`), FGAP-085 (user-DIRECTED, no correction), FGAP-043 (user-VERBATIM; then resolved + implemented as TASK-121), TASK-090 (checked: not flagged). At 03:55:45Z the orchestrator enumerated **90 candidates not yet audited**.

**Verified current state.** Ran `npx tsx scripts/scan-substrate-hedges.ts` live: **90 candidates currently flagged** (closed/terminal items excluded per the 01:41/01:51Z directives — exclusion commits `173de1c5`, `6c2d54f5` verified on main). The program's end state is nowhere near reached; no queue, plan, or task tracks the remaining ~90.

**Action needed: YES** — this is the largest open program of the session. The tooling (scanner + generalized Anthropic-structured template `analysis/2026-07-11-gap-fork-provenance-audit-brief-template.md`, committed `c9eb33a7`) is ready; the work is not scheduled anywhere.

## Thread 5 — FGAP-100: the identified boilerplate sibling of FGAP-043, never revisited

**What was said/done.** At 07:19:59Z the orchestrator reported the "actual laziness fingerprint": FGAP-043 and FGAP-100 carry the **byte-identical** placeholder `proposed_resolution` — "Resolution not yet determined; to be filed as a separate decision." — appearing exactly twice in the substrate. The user chose 043 (07:21:50Z "let's do 043"); FGAP-043 went the full distance (resolution decided, TASK-121 implemented, closed). FGAP-100 was never mentioned again.

**Verified current state.** `.context/framework-gaps.json`: FGAP-100 status `identified`, `proposed_resolution` still the verbatim placeholder. (Caveat from the FGAP-043 audit: that same phrase turned out to be user-authored for 043 — FGAP-100 needs its own provenance check before assuming it's a punt.)

**Action needed: YES** — run the template on FGAP-100; then, per the user's 07:33–07:35Z instruction ("the end state is that gaps have valid canonical resolutions… accelerate valid substrate correcting"), drive it to a canonical resolution.

## Thread 6 — Mandate-injection repo-portability (item 2 of the TASK-093 findings): silence-dropped

**What was said/done.** After TASK-093 closed (22:57Z 07-09), two unresolved findings were reported (23:01:36Z). Item 1 (the "missing 5th mandate") was resolved through the mandate-008 discussion → FEAT-013 motivation edit, committed `e43c1bd2`. Item 2: **"Injection mechanism isn't repo-portable"** — `.claude/mandates.jsonl` only reaches prompts because the machine-global `~/.claude/settings.json` registers the UserPromptSubmit hook; "a fresh clone of this repo… would get zero mandate injection"; explicit tension with FEAT-013 R17 (harness wiring fully portable). The user's 23:03:22Z reply addressed item 1 only. Item 2 never appears again in the session (FTS: zero hits for repo-portable/R17/bare-clone after 23:02Z).

**Verified current state.** No FGAP tracks it (latest is FGAP-141); no task; FEAT-013 in-progress with R17 tension undocumented as a gap. Context: at 07:15:01Z (07-11) the user said "ignore any having to do with non extensions focus. harness isn't being evaluated" — that governed hedge-audit candidate ranking, not this finding; nothing explicitly closed it.

**Action needed: user call.** Either file it (via Experience-Gap agent investigation, per convention) or explicitly waive it as harness-out-of-scope. Currently it exists only in a 2026-07-09 chat message.

## Thread 7 — The comment-citation enforcement gate exists only inside a CLOSED gap's prose

**What was said/done.** 23:56:58Z 07-09, user: "this now points to a class of scripts forward looking: a pre-commit hook that flags the use of such harness jargon in any code comment…". The FGAP-136 rollout (TASK-108–115) rewrote all 588 citations and closed the gap (03:09Z 07-10).

**Verified current state.** FGAP-136 is `closed`; its `proposed_resolution`/`closed_by` state verbatim: "Eventual enforcement: extend citation-rot-scanner.ts's detection surface to also cover code comments… delta-scoped… This gate is filed as future work, not built" and "remains unbuilt — filed here as future work, not part of this closure." `.husky/pre-commit` contains no such gate; no open FGAP/TASK tracks it. "Future work filed inside a closed item" is untracked work by this project's own PM model — closed items are not a work queue.

**Action needed: YES (small)** — give the delta-scoped gate an open home (task or gap) or explicitly decline it.

## Thread 8 — FEAT-014 remainder: interrupted by the audit program, never resumed; two of three gaps have no task

**What was said/done.** Fable's 05:07Z 07-10 recommendation — "finish FEAT-014 (close FGAP-125, FGAP-126, FGAP-128)" — set the day's focus. The path there: substrate readiness validation (FGAP-126 citation fix `cf6fbec0`), FGAP-126 fork-provenance correction (`12609fa1`), TASK-118 filed to implement it (`ba5ad2dc`), TASK-119 filed for install-time agent materialization (`e5a8acca`). Then the session pivoted permanently into the filing-audit program; no FEAT-014 implementation ever ran.

**Verified current state.** `.context`: FGAP-125 `identified` (corrected resolution, standing per DEC-0022), FGAP-126 `identified`, FGAP-128 `identified`; TASK-118 `planned` (edge `task_addresses_gap → FGAP-126` verified in relations.json), TASK-119 `planned`; relations show **no task for FGAP-125 and none for FGAP-128**. FEAT-014 `in-progress`. Success criteria for the three gap-tasks were derived in-chat (11:44:56Z) and explicitly "Not yet filed" — only FGAP-126's made it into TASK-118.

**Action needed: YES** — implement TASK-118/119 or re-prioritize explicitly; file the FGAP-125/FGAP-128 tasks (criteria already drafted in-transcript at 11:44:56Z 07-10).

## Thread 9 — FGAP-140: fresh-install migration seeding still broken in the product, tracked but untasked

**What was said/done.** The other-project paste (11:20–11:44Z 07-11) exposed the general defect: `installContext`/`checkStatus` never seed block-schema migration declarations on fresh install. TASK-122/FGAP-141 fixed the three UPDATE-time write paths only; the INSTALL-time gap was filed separately as FGAP-140 (`2d3d3076`).

**Verified current state.** FGAP-140 `identified`, resolution "Requires determination…", relations show only `gap_relates_to_gap` edges (→FGAP-043, ←FGAP-141) — **no task addresses it**. Every fresh `/context install` from current code still reproduces the other-project failure mode for any version-stamped starter.

**Action needed: YES** — a live product defect with a filed gap and no implementation path. (The user's "i don't want register i want fucking fixed" applied to the live substrate breaks, which TASK-122 fixed; the install-path class remains.)

## Thread 10 — Five stale `worktree-agent-*` branches contradict the "no worktrees remain" closure claim

**What was said/done.** The FGAP-136 rollout ran 5 implementation agents in worktrees (02:07Z 07-10); closure claimed "no worktrees remain" (03:09Z).

**Verified current state.** `git worktree list` → only main (worktrees pruned, claim true for worktrees). `git branch` → **five leftover branches**: `worktree-agent-a31700ae3fe3c1c70`, `worktree-agent-a3c41eb5ba403a12b`, `worktree-agent-a43cc28cccef23e68`, `worktree-agent-a9386a59105b5f915`, `worktree-agent-a953f616ecb92ae6a` (agent-ids match the de-jargon task-notifications, e.g. a9386a59 = TASK-112's agent, a3c41eb5 = TASK-110's). One of these lineages contains the corrupted "baseline" commit (~5,337 deletions) the session vowed never to merge. Also present: `feat/context-currency-precommit-gate` (2026-07-07, PRE-dates this session — separate housekeeping, not this session's thread).

**Action needed: YES (housekeeping)** — delete the five agent branches (user authorization for branch deletion per git-discipline memory).

## Thread 11 — `framework-gaps` schema `locally-modified` divergence: acknowledged, left standing, unfiled

**What was said/done.** During TASK-121 closure (09:40:27Z 07-11) the orchestrator noted "context-check-status shows 16/17 in-sync + only the pre-existing `framework-gaps` local-modification (unrelated to this task)" and moved on.

**Verified current state.** Ran `pi-context context-check-status --json` live: `framework-gaps` `locally-modified` (`installed_modified: true`, baseline 1.3.0 = catalog 1.3.0 — content divergence, not version), 16/17 in-sync. No gap/task references this divergence; nothing schedules its reconciliation.

**Action needed: minor** — reconcile via `/context update` mergetool path or file it; currently it's a standing unreconciled delta acknowledged only in chat.

## Thread 12 — Pass-1 untied-threads report uncommitted

**Verified current state.** `git status` → `?? analysis/2026-07-11-session-untied-threads-audit.md`. Every other agent-written analysis artifact of this session was committed (14 tracked `analysis/2026-07-1[01]-*` files verified via `git ls-files`); the de-ephemeralize convention has the orchestrator verify-and-commit. This one wasn't (session still mid-flight on the three-pass comparison, but it's the live gap in the pattern).

**Action needed: YES (trivial)** — commit it (and this pass-A report, and pass B's) once the comparison concludes.

## Threads verified CLOSED (no action) — closure signals confirmed against live state

| Thread | Closure verified |
|---|---|
| TASK-093 (mandates slot) | `completed` in tasks.json; merged `ce560a98` |
| Item 1 of TASK-093 findings (5th mandate) | FEAT-013 motivation edit committed `e43c1bd2`; mandate-008 already global |
| TASK-107/TASK-108 + issue-012 | issue-012 `resolved` in issues.json; merged `93ee0073`; scanner on main |
| TASK-109–115 + FGAP-136 rollout | FGAP-136 `closed`; the 03:16Z currency auditor independently verified all 10 tasks completed w/ verification edges |
| Currency-audit finding 1 (R-0030 fired condition) | FGAP-137/TASK-116 `closed`; line-scoped hashing shipped |
| Currency-audit finding 2 (uncommitted stop-hook-probe md) | `git ls-files` → tracked (committed with FGAP-138 filing) |
| FGAP-138/TASK-117 (revision-moved removal) | both `closed`; commits `3095e9cb`/`1ff3b460`; FEAT-011 AC6 no longer names revision-moved (verified in features.json) |
| Node-modules-pinning removal + worktree friction | user ruled "your failure, not a gap" — explicitly not filed, per directive (03:10:45Z) |
| Dead provenance-guard prose + mandate-p03 title fragility | 3 files committed on user direction (11:09Z 07-10, "All 4 commits landed") |
| FEAT-014 graph-currency edges (TASK-103, DEC-0022 → FEAT-014) | edges granted + committed (10:46–11:12Z 07-10) |
| FGAP-126 two invented forks | corrected `12609fa1`; both provenance reports tracked in analysis/ |
| FGAP-127 (v1+v2), FGAP-124, FGAP-085, FGAP-043 provenance audits | all run; reports tracked; corrections where warranted (FGAP-125 `370b1477`) |
| TASK-119's origin (copy-agents directive) | filed `e5a8acca` (implementation itself = Thread 8) |
| `pi-mono-is-exemplar` convention | present in conventions.json; template updated `a49d18d7` |
| Hedge scanner (TASK-120) + de-weighting + closed/terminal skip | `completed` + VER-097; commits `860e4c43`/`173de1c5`/`6c2d54f5` on main; verbatim hedge output confirmed by live run |
| Both artifacts (hedge output; substrate organizer) + scroll bug | published; fix redeployed same URL (02:19Z 07-11) |
| Brief template generalization + Anthropic-practices restructure | committed `c9eb33a7` per "commit it" (05:19Z) |
| TASK-121/FGAP-043 (x-rhetorical-criteria) | both closed; VER-098; merged `09895042`; FGAP-139 follow-on class filed (`identified`, by design) |
| TASK-122/FGAP-141 (migration registration) | both closed; VER-099; merged `35250b6a`; research + session-notes read clean via canonical path (session verified pre/post merge) |
| 21 unpushed commits on main | policy-consistent: push/release HELD absent per-release authorization |

---

## Punch list

| # | Thread | Verified state (now) | Action needed |
|---|---|---|---|
| 1 | Schema-version design-intent question (12:34Z 07-11) | Explore map returned, never relayed; archaeology agent rejected, never re-run; question unanswered | Yes — relay map + redo archaeology |
| 2 | TASK-091 closure | `planned`; deliverable live on main (`b4c9bce1`); sweep AC never independently verified; CHANGELOG entry lost (orphan `d06bf3d3`); empty branch remains | Yes — verify sweep, recover entry, close, delete branch |
| 3 | TASK-090 / FEAT-011 crit 7 | `planned`; implementation discarded by user decision | Open work (deliberate) |
| 4 | Substrate hedge-audit program | 90 candidates flagged live; ~6 ever audited; no queue/plan | Yes — schedule the program |
| 5 | FGAP-100 placeholder resolution | `identified`; still verbatim "Resolution not yet determined…" | Yes — template audit → canonical resolution |
| 6 | Mandate-injection repo-portability (finding 2, 07-09) | Never filed/mentioned again; no substrate item | User call — file or waive |
| 7 | Comment-citation enforcement gate | Lives only in closed FGAP-136's prose; no open item; not in pre-commit | Yes — give it an open home or decline |
| 8 | FEAT-014 remainder (TASK-118/119; FGAP-125/128 untasked) | All `planned`/`identified`; zero implementation | Yes — implement or re-prioritize; file 125/128 tasks |
| 9 | FGAP-140 fresh-install migration seeding | `identified`, untasked; defect live in product | Yes — task + fix |
| 10 | 5 `worktree-agent-*` stale branches | Exist on main repo; worktrees pruned, branches not | Yes — delete (needs authorization) |
| 11 | framework-gaps `locally-modified` divergence | Still present (16/17 in-sync), unfiled | Minor — reconcile or file |
| 12 | Pass-1 audit report uncommitted | `??` in git status | Trivial — commit with the pass reports |
