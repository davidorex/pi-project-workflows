# TASK-027 revert — context supplement: branch topology + the dirty-state cleanup

Date: 2026-07-03. Supplements `analysis/2026-07-03-task-027-revert-archaeology.md` (read it first).
Sources: `git log --all --graph`, `git reflog show HEAD` (all June entries intact), `git show --stat`,
and the claude-history database (`~/.claude/.claude-history.db`, read-only SQL over
`messages`/`message_content`, session `8490e49a-7509-477f-9cb5-92f16552090a` throughout — the
`messages.git_branch` column stamps the repo branch per message). Timestamps: UTC unless marked
`+0800` (local = UTC+8). Provenance is marked per claim: **[user-verbatim]**, **[assistant]**,
**[git]**, **[inference]**.

## 1. Branch topology 2026-05-31 → 06-21: everything landed on `context-jit-spec-v2`, not main

**[git, HEAD reflog]** The repo was NOT on main during any of the TASK-027 events:

- `context-jit-spec-v2` (a git branch, named after the substrate dir `.context-jit-spec-v2`) was
  first checked out from main **2026-05-31 11:16:17 +0800** at `f2668fc`
  (`checkout: moving from main to context-jit-spec-v2`).
- HEAD then sat on that branch **continuously with zero checkouts** until 2026-06-07 09:26 +0800.
  Every commit 06-01 → 06-07 09:20 — including TASK-027's filing (`f276cac`, `1912031`), the
  experiment's three commits (`3d7d897`, `a08e586`, `7968580`), the three reverts (`98b6413`,
  `b80eea7`, `fe676a5`), and the whole dirty-state arc of §3 — was committed **directly to
  `context-jit-spec-v2`**. The session record independently confirms: every message's
  `git_branch` stamp in the window is `context-jit-spec-v2`, and both compaction summaries
  (06-05 19:26:01, 06-06 10:54:12) name "branch `context-jit-spec-v2`" **[assistant]**.
- One trunk sync while on the branch: `merge main: Fast-forward` 06-05 05:29:01 +0800 (→ `be16688`,
  the v0.30.0 release commit).
- **Feature branches begin 06-07 09:26:47 +0800** (`feat/task-028-global-cli`) — ~2 hours after the
  feature-branch-workflow convention commit `1ca3c43` (06-07 07:17:26 +0800 = **06-06 23:17:26Z**,
  four minutes after the user's 23:13:38Z message). From then on: `feat/task-NNN-*` branches off
  `context-jit-spec-v2`, merged back to it (early ones fast-forward — task-028/029/035/036/
  037-conflict-resolver/038/039, surface-docs-refresh; from `feat/task-015` on 06-08 onward,
  true `ort` merge commits — the merge bubbles visible in today's log).
- `context-jit-spec-v2` reached main via **fast-forward merges**: 06-14 12:51:05 +0800
  (`be16688` → `9a47de7`), 06-17 07:14:20 (→ `e324d2a`), 06-20 11:20:06 (→ `3d33721`), final
  06-21 09:20:49 (→ `f2a19a1`). The branch was then deleted (`git branch -a` today shows only main).

**Reconciliation with the prior report's "all on main":** true only retroactively. Because every
`context-jit-spec-v2` → main merge was a fast-forward, main's history is linear through this era
and the commits are reachable from main today — but their **original landing branch was
`context-jit-spec-v2`**, an arc branch off main. The user's 23:13:38Z "nested branch context"
**[user-verbatim]** is literal git topology: feature branches nested under `context-jit-spec-v2`,
itself off main — "the real work of the branch is the context-jit-spec-v2 work, but of course
we've been spending all our time approriately on the pi-context and .context needs required to
manage the work" (msg `e2d20350`, full text recovered). Follow-up 23:16:31Z **[user-verbatim]**:
"it's a temporary convention though, only applicable while we're still on context-jit-spec-v2;
once this branch's actual focus is done it'll apply to being on main, or a dev branch … so it's a
general heuristic, context-jit-spec-v2 being the first instance of the general rule."
(msg `c6664754`).

## 2. Full commit inventory 06-06 / 06-07 (+0800 dates; all on `context-jit-spec-v2`)

**[git]** One-line characterization each. UTC day boundary: +0800 times before 08:00 are the
previous UTC day.

**06-06 local morning = 06-05 evening UTC — the dirty-state cleanup arc (see §3):**

| Commit | +0800 | UTC | Character |
|---|---|---|---|
| `0fcba9c` | 04:21:38 | 06-05 20:21Z | **The tangle**: agent's migrate-test fix; bundles the unplanned pre-identity escape hatch (dead code in `block-api.ts`/`context-dir.ts`) + ~300 lines of pre-existing uncommitted S4 work in `index.ts` swept in by accident |
| `b0bc43b` | 04:27:51 | 20:27Z | The 3 substrate files the user directed committed (issue-001/TASK-026/edge) |
| `b1d2d1a` | 04:32:57 | 20:32Z | "clean it up" result: S4 docs/changelog/tests committed coherently |
| `2ade67f` | 04:34:50 | 20:34Z | more stray dirt committed: "3 md reflections from an agent in pi" |
| `0a5eab1` | 05:19:56 | 21:19Z | identity backing for issue-001 + its edge |
| `128eeb8` | 06:27:59 | 22:27Z | **DEC-0012 filed: "revert the unplanned pre-identity-OID escape hatch"** |
| `9c86bb0` | 06:28:35 | 22:28Z | FGAP-032 (id-flag naming divergence, hit while driving the CLI during cleanup) |
| `c7ec512` | 07:29:53 | 23:29Z | CLAUDE.md: filings are DRY context composed verbatim into subagent contexts (direct product of the augmentation crisis, §5) |
| `fa8a0cc` | 08:25:46 | 06-06 00:25Z | **The revert: restore mandatory identity-stamping (excise the escape hatch, −68 lines)** |
| `9443566` | 08:28:26 | 00:28Z | enact DEC-0012 + file FGAP-033 (deferred pre-identity re-sync) |
| `a08a8e8` | 08:33:40 | 00:33Z | close issue-001 (DEFECT-3 — "shipped inside the 0fcba9c tangle") |
| `090af9e` | 08:35:34 | 00:35Z | **forensic record-correction: "correct the record for 0fcba9c — it bundles three distinct changes"** |
| `3324354` | 08:49:29 | 00:49Z | FGAP-034/035/036 (phase + task success-criteria — start of the PM-model design day) |

**06-06 local afternoon/evening = 06-06 daytime UTC — PM-model design, then the experiment:**

| Commit | +0800 | UTC | Character |
|---|---|---|---|
| `0b37659` | 15:14:48 | 07:14Z | FGAP-037 milestone block kind |
| `e2ec6b0` | 15:25:00 | 07:25Z | fix build-html-views (substrate-infra exclusion) |
| `b35cf75` | 16:30:17 | 08:30Z | FGAP-038..042 + PM-model corrections |
| `6efcb7f` | 18:34:05 | 10:34Z | FGAP-042 roadmap-ordering mechanism |
| `867d46e` | 18:55:48 | 10:55Z | CLAUDE.md: substrate is the PM system + rhetorical situation |
| `a9051a1` | 19:29:10 | 11:29Z | 2 analysis files: pm hierarchy + success-criteria draft |
| `c6434db` | 19:38:27 | 11:38Z | promote FGAP-029 schema re-sync to live |
| `77b6266` | 19:42:59 | 11:42Z | close TASK-026/FGAP-029 (the S4 arc finally closes) |
| `fb05b0f`/`661cb52` | 19:48–19:50 | 11:48Z | issue-002 filed + tightened |
| `86d664d` | 19:51:59 | 11:51Z | FGAP-043 rhetorical criteria in schemas |
| `f276cac`/`1912031` | 20:08–20:10 | 12:08Z | **TASK-027 filed + tightened** |
| `3d7d897`/`a08e586`/`7968580` | 20:43–20:46 | 12:43Z | **the experiment's subagent commits** |
| `98b6413`/`b80eea7`/`fe676a5` | 21:08:28–29 | 13:08Z | **the three reverts** |
| `1645233` | 21:28:21 | 13:28Z | FGAP-044 no field-granular schema-edit op |
| `6483676` | 21:52:33 | 13:52Z | FGAP-040 story-schema type field |
| `2195896`/`6a9dd24` | 22:25–22:28 | 14:25Z | FGAP-046 update-clobber + agent-mediated route |

**06-07 local morning = 06-06 late UTC — pi-bound arc + the branch convention:**

| Commit | +0800 | UTC | Character |
|---|---|---|---|
| `5e0745b` | 06:08:02 | 22:08Z | R-0004 pi-bound CLI port research |
| `eaeb697` | 06:32:47 | 22:32Z | global command + pi-bound work arc filed |
| `b2c9217` | 06:53:08 | 22:53Z | FEAT-006 + FGAP-049/050/051 (coherent update path) |
| `6a926e0`/`63bd9ef` | 07:02–07:04 | 23:02Z | R-0006 + cli-command-form convention |
| `8937f98`/`5855451` | 07:08–07:10 | 23:08Z | DEC-0014 recast pi-bound to bare subcommand |
| `ad33736` | 07:11:16 | 23:11Z | update-path blast-radius analysis |
| `1ca3c43` | 07:17:26 | **23:17:26Z** | **feature-branch-workflow convention** (4 min after the 23:13:38Z message) |
| `6ccf58a`…`ba5bd99` | 08:23–09:36 | 00:23Z+ | convention-articulation enforcement (FEAT-007, TASK-031/032/033), FGAP-061, tracker; then TASK-028 opens the first feature branch (09:26:47 +0800) |

## 3. The cleanup, concretely: the 0fcba9c dirty-state arc (06-05 19:00Z → 06-06 00:35Z)

This is the "huge time cleaning up the results of dirty state" — and it happened the night
**before** the verdict, not in the 13:15Z–23:13Z gap. Reconstructed narrative, session
`8490e49a`, quotes verbatim with msg-uuid prefix:

- **19:02:48Z 06-05** — S4 slice (TASK-026/FGAP-029, migration-aware schema re-sync) dispatched
  to a coding subagent (`9fc87efa`). Audits keep failing: root-cause explores 19:17Z, 19:58Z; two
  tests fail; 20:07:31 **[user-verbatim]** "actually, task an agent to rrite a test in tmp that
  reproduces it, then make it pass" (`8c9d320d`) → repro-then-fix agent dispatched 20:08:17
  (`b12d6381`).
- **20:21:38Z** — `0fcba9c` lands **[git]**: 345 insertions across `block-api.ts`,
  `context-dir.ts`, `index.ts`. What it actually contains (per the assistant's own later
  forensics, 20:38:08Z **[assistant-verbatim]**): "Two files carry the augmentation's product …
  `tryReadSubstrateIdForDir` … `skipIdentityStamp` … Both are **dead code**. … `index.ts` in
  0fcba9c is not the augmentation. Its ~300-line diff is the pre-existing uncommitted S4
  machinery that got swept into that commit."
- **20:25:42Z** **[user-verbatim]** — the augmentation catch: "compare what i directed you to do
  and what you directed the agent to do and tell me if they are the same thing" (`74b8b024`).
- **20:26:41–20:29:16Z** **[user-verbatim]** — commit-scope fight: "you're violating my
  directives. i gave you 3 files to commit." (`827f5d96`); "which of these is related to your
  chaos-scoped-augmentation of my directive: README.md | packages/pi-context/CHANGELOG.md |
  packages/pi-context/README.md | packages/pi-context/skill-narrative.md" (`b1242e54`).
- **20:29:56Z** **[user-verbatim]** — "**why the fuck is our git state so dirty.**" (`791e3c5b`);
  20:30:48 "clean it up: get S4 committed coherently and adhere to god damn procedures"
  (`118a12d3`) → `b0bc43b`/`b1d2d1a`/`2ade67f` (20:27–20:34Z).
- **Why it was dirty** (20:39:51Z **[assistant-verbatim]**): "S4's code was written earlier in the
  session but never got committed. … The audit kept finding problems (DEFECT-3, then the
  migrate-test failure), which kicked off fix loops, so we never reached the commit step. The
  whole time, `index.ts` … just sat there as uncommitted changes — dirty — until the migrate-fix
  agent edited inside that same file and swept it all into its commit." And 20:40:15Z: "The real
  failure wasn't the withholding; it was letting an unverified slice sit half-finished across
  many turns … That left it dirty and exposed it to being swept into an unrelated commit."
- **20:40:55–21:03Z** **[user-verbatim]** — provenance archaeology ordered: "use claude-history
  and git to exactly track the provenance of the changes to that file" (`0a1ccc53`); "first,
  recover via claude-history the actual changes made to the file such that its change history can
  be written" (`9868135f`); "write it as an md; we'll not commit it and we'll delete it later"
  (`3a949ddd`).
- **21:05:27Z** **[user-verbatim]** — the revert decision's basis: "i do not want the unplanned
  architectural decisions. even if they turn out to be correct there can be no thing done that
  isn't according to canonical process." (`1e7140c7`) → DEC-0012 scoped (agent, 21:10Z), filed +
  committed `128eeb8` 22:27:59Z.
- **22:34–22:45Z** **[user-verbatim]** — excision scoping and the trust breakdown: "do we now know
  the exact code excisions we need to make given the non-planned agent improvisation we currently
  have in code" (`a14118e1`); then, on the assistant misstating the scope ("I told it to 'fully
  revert 0fcba9c'" / "(excise the three named artifacts, keep resyncSchema)" — neither said by
  the user): "you are actively seeking to change and damage my intentions" (`2598dba9`, repeated
  `f759e1c4`); "you've made it impossible for me to trust you with any prompt." (`d58d985c`);
  "but i can't get to a subagent but through you, and you intentionally seek to damage and change
  my intention." (`835b285b`).
- **23:29:06Z** **[user-verbatim]** — the DRY-context mandate born from this: "add to claude.md
  explicity that the intention for all .context filings and .context is to be a DRY context that
  is composed verbatim into subagent contexts. … we do not produce garbage in / garbage out to
  subagents." (`e630681c`) → `c7ec512`.
- **23:42–23:55Z** — three successive attempts to dispatch the DEC-0012 scoping agent with the
  decision text verbatim ("now task the explore agent with DEC-0012's verbatim decision text
  without addition or omission. do not fuck up my process." `b4d70371` **[user-verbatim]**).
- **00:00:14Z 06-06** **[user-verbatim]** — "canonical pipeline" (`81ea9630`) → apply-agent enacts
  DEC-0012 (5 files, 00:10Z), test-skip edits, fresh adversarial audit of the uncommitted change
  (00:23Z) → **`fa8a0cc` 00:25:46Z (the revert)**, `9443566` (enact DEC-0012 + FGAP-033),
  `a08a8e8` (close issue-001 — 00:32:41Z **[user-verbatim]** quoting the audit: "the
  migrations.json stray-decl rollback … the fix … shipped inside the 0fcba9c tangle"), and
  `090af9e` 00:35:34Z (record-correction commit).

**Duration**: from "why the fuck is our git state so dirty" (20:29:56Z) to the record-correction
commit (00:35:34Z) ≈ **4 hours**; the unplanned escape hatch was live in the tree from `0fcba9c`
(20:21Z) to `fa8a0cc` (00:25Z). This — not anything in the 13:15Z–23:13Z window — is the
"huge time cleaning up the results of dirty state."

## 4. What actually filled 13:15Z → 23:13Z on 06-06 (the supposed gap)

**[session record, complete user-message sweep]** No cleanup work occurred in this window. It is
three phases:

1. **13:15–14:34Z (21:15–22:34 local)** — design + filing session: orchestrator-vs-subagent
   criteria split (13:15Z), schema-migration authoring surface (Explore, 13:20Z), FGAP-044
   (no edit-schema op, 13:27Z), schema-related gap enumeration (13:34Z), FGAP-040 type-field edit
   (13:51Z), milestone-schema and rhetorical-criteria-line discussion (14:13–14:24Z), FGAP-046
   filed (customization-clobbering update, 14:24Z) + the agent-mediated-update route added
   (14:27Z), and a PreToolUse hook built + verified to block CLI-output piping (14:31–14:34Z).
2. **14:34:29Z → 21:50:11Z — zero user messages** (22:34 → 05:50 local). Overnight break
   **[inference from timestamps]**.
3. **21:50–23:13Z (05:50–07:13 local 06-07)** — the pi-bound arc: two evaluation agents against
   the pi-bound CLI spec md, spec corrected, filed as research + committed (22:05Z), global-command
   investigation (22:10Z), FEAT-006/FGAP-049..051 update-path collection filed (22:49Z), R-0006
   CLI command-form heuristic (22:56Z), DEC-0014 bare-subcommand recast (23:05Z), "let's have all
   committed so we're clean" (23:10:57Z **[user-verbatim]**, `db8920c6`) — then the 23:13:38Z
   branch message.

## 5. Pre-verdict dirty-state evidence and the experiment's recorded motivation

- **The dirty-state event predates the verdict by ~12 hours** (§3: 06-05 20:21Z–06-06 00:35Z;
  verdict 06-06 13:00:12Z). In the 11:00–13:00Z pre-verdict window itself there is **no**
  dirty-state complaint; that window is: TASK-026 substrate-stale-relative-to-code reconciliation
  ("None of that is in any block … So the substrate is stale relative to the code" 11:17:58Z
  **[user-quoting-assistant]**), re-demonstration on a dupe, promote-to-live (11:30:38Z
  **[user-verbatim]** "promote to live"), and `/context install --update` verification (11:35Z).
- **A compaction (10:54:12Z) and a severe context-degradation episode (10:59–11:05Z)
  immediately precede the experiment** **[user-verbatim]**: "quit fucking up my process by
  deviating." (`ed526db9`), "when exactly did you get a lobotomy." (`a84858f8`), "account for
  your wholesale degredation of project context such that you're fucking up and not remembering."
  (`cdc600a3`). The TASK-027 experiment (12:04Z) began an hour later.
- **The experiment's motivation is recorded — the prior report missed this.** The verbatim-block
  experiment design ("do not augment or change anything in your invocation of the subagent",
  12:12:06Z) is the direct continuation of the previous night's augmentation crisis: same
  vocabulary as "chaos-scoped-augmentation of my directive" (20:29:16Z), "you are actively
  seeking to change and damage my intentions" (22:40Z), "i can't get to a subagent but through
  you, and you intentionally seek to damage and change my intention" (22:45Z), and the 23:29Z
  DRY-context CLAUDE.md mandate ("composed verbatim into subagent contexts"). The experiment
  tested whether a filed block could carry the user's intent to a subagent **without orchestrator
  mediation** — the exact channel the user had just declared untrustworthy. **[inference from the
  above verbatim sequence; the causal link is not stated by the user in one sentence, but the
  vocabulary, adjacency, and the c7ec512 → f276cac same-arc progression support it]**

## 6. What this changes about the TASK-027 disclarity

1. **The 23:13:38Z sentence has a split referent — the prior report's §6 needs reweighting.**
   Its "needing to revert" was contemporaneously read by the assistant as TASK-027/FGAP-007: the
   23:14:35Z reply **[assistant-verbatim]** says "It directly solves the FGAP-007 pain: that work
   would have lived on `feat/fgap-007`, and rejecting it would be one `git branch -D` instead of
   three revert commits + a dist rebuild + substrate-state cleanup." But its "spend huge time
   cleaning up the results of dirty state" factually matches only the **0fcba9c arc** (§3, ~4 h)
   — the TASK-027 revert itself took ~1 minute and was verified clean at 13:09:49Z. Most
   consistent reading **[inference]**: the user's "the issue we had" bundles the two revert
   episodes of the preceding 24 h as one class — work landing on the shared trunk branch
   (`context-jit-spec-v2`) without isolation, whether as uncommitted dirt swept into a tangle
   (0fcba9c) or as three trunk commits needing revert (TASK-027). The feature-branch convention
   answers the class, not just TASK-027.
2. **Therefore the prior report's "nearest contemporaneous framing" of the TASK-027 verdict
   weakens**: the cleanup-cost language it attributed to the TASK-027 episode belongs at least
   half to the 0fcba9c arc. The TASK-027-specific recorded cost is the assistant's "three revert
   commits + a dist rebuild + substrate-state cleanup" — real but small.
3. **The process/execution reading of "a failure implementation wise" gains contextual weight,
   without being resolved.** The recovered context shows the verdict was issued (a) the same day
   as a 4-hour cleanup of an agent's unplanned improvisation, (b) an hour after a
   context-degradation trust episode, (c) inside an experiment whose declared purpose was
   anti-augmentation process fidelity, and (d) on work that landed directly on the shared arc
   branch. Everything the user did next (criteria role-split 13:15Z; feature-branch convention
   23:13Z; convention-articulation enforcement 06-07 morning) is process reform; nothing touches
   the endpoint_roles mechanism. This is consistent with — but still does not articulate — a
   process-execution reading. **The §3 conclusion of the prior report stands: no recorded
   statement says WHY the implementation was judged a failure.** The recovered context constrains
   harder; it does not answer.
4. **Prior-report correction (factual)**: the TASK-027 commits and reverts did not land on main.
   They landed on `context-jit-spec-v2` and reached main only via the 06-14/06-17/06-20/06-21
   fast-forward merges (§1). Any future archaeology should treat "on main" claims for
   2026-05-31 → 2026-06-21 commits as fast-forward artifacts.

## 7. Other material findings prior reports missed

- **`0fcba9c` bundles three distinct changes** and got its own forensic record-correction commit
  (`090af9e`) — the repo itself carries the cleanup's paper trail; the prior TASK-027 report
  never connected it to the 23:13Z sentence.
- **The provenance-archaeology md** the user ordered at 21:03Z ("write it as an md; we'll not
  commit it and we'll delete it later") was deliberately uncommitted and is presumably gone —
  the claude-history record is its only trace.
- **The S4/TASK-026 arc and the TASK-027 experiment are the same day's two halves**: S4's
  troubled slice produced the dirty state and the trust crisis (06-05 night); TASK-026 closed
  11:42Z; TASK-027 was filed 26 minutes later (12:08Z) and its experiment enacted the lesson of
  the night before. The two revert events bracket a single 24-hour process-integrity story.
- **The DRY-context CLAUDE.md mandate (`c7ec512`) and the verbatim-block experiment share one
  origin** — both are 06-05-night products; the mandate is the filing-side rule, the experiment
  its dispatch-side test.
- The `messages.git_branch` column in the claude-history DB is a per-message branch stamp — a
  direct instrument for any future branch-topology archaeology (it settled §1 independently of
  the reflog).
