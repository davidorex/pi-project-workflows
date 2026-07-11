# Session dangling-work audit — d3030496-e4e1-4bfa-8df1-1df86bac518a

**Coverage:** all 259 user-channel text messages read verbatim in full (directives separated from embedded task-notifications/command noise); the 3 compaction boundaries located (2026-07-10T04:51Z, 2026-07-11T07:02Z, 2026-07-11T15:53Z) and the record on both sides of each sampled; the assistant record sampled structurally (the 15-item disposition ledger at 2026-07-11T14:38Z, the end-of-session window 21:40–22:15Z, the mandate-p03 exchange 11:03–11:12Z Jul 10, ExitPlanMode plans); the session's own three-pass untied-threads audit and 8 hedge-shard reports used only as thread maps, every load-bearing claim re-verified freshly against substrate (pi-context CLI reads), git at HEAD `4e3619b3`, and the filesystem on 2026-07-12. Not exhaustively read: the ~18k-message assistant/sidechain interior outside those slices.

Session span: 2026-07-09T22:37Z → 2026-07-11T22:15Z (2026-07-10 06:37 → 2026-07-12 06:15 +08). All timestamps below UTC; add 8h for local.

---

## Group A — open engineering backlog (confirmed still open in substrate; tracked, not silently dropped)

### A1 — TASK-090: FEAT-011 always-on drift surfacing, implementation discarded and never redone
- **Evidence:** user, d3030496 2026-07-11T04:29:59Z: "i don't want fucking anything from this branch." and 04:30:27Z: "delete task-090-drift-surfacing". Earlier scope: FEAT-011 acceptance criterion 7 ("currentState surfaces drift always-on…").
- **Current state:** TASK-090 `planned` (read live); FEAT-011 `in-progress`; branch deleted; no drift-surfacing code in `context-sdk.ts` currentState path filed as done.
- **Verdict:** still-open (open backlog by the user's own kill/discard decision — not a silent drop).
- **Dispatch:** implement TASK-090 per its filed text (files field names `packages/pi-context/src/context-sdk.ts` + tests) via canonical pipeline; done = FEAT-011 criterion 7 met + verification + complete-task.

### A2 — TASK-119: agents-tier seeding per the user's verbatim copy-agents directive
- **Evidence:** user, 2026-07-11T00:07:23Z: "i want it to copy agents. not providing agents that can be edited and changed in the project wanting to use agents is nearly the definition of terrible ux". Session-end assistant status (22:12:05Z) named "agents-tier seeding" FEAT-014's one remaining open acceptance criterion.
- **Current state:** TASK-119 `planned` (its description carries the directive verbatim); FGAP-127 `closed`; FEAT-014 `in-progress`.
- **Verdict:** still-open.
- **Dispatch:** implement TASK-119 (files: `packages/pi-context/src/context.ts`, `samples/conception.json` per its files field); done = install ceremony materializes editable agent spec files; FEAT-014's last criterion met.

### A3 — FGAP-139: rhetorical-criteria enforcement blind to bare-string-array budgets
- **Evidence:** filed this session after the TASK-121 rollout; user's program frame, 2026-07-10T23:45:18Z: "the end result of all of this will be that the substrate has been exactingly audited, validated, and corrected".
- **Current state:** FGAP-139 `identified` P3, no implementing task (no FGAP-143+/TASK-126+ exist).
- **Verdict:** still-open (legitimately filed backlog, unprioritized).
- **Dispatch:** fix `collectWordCaps`/`walkNestedArrays` in `packages/pi-context/src/rhetorical-criteria.ts` to reach `x-prompt-budget` on array-of-string items schemas; done = the four named shipped fields enforced + gap closed.

### A4 — FGAP-140: fresh install never seeds block-schema migration declarations
- **Evidence:** user, 2026-07-11T11:44:40Z: "but this is a gap, no? the underlying gap is general — installContext/checkStatus never seed block-schema migration declarations from the catalog for any schema on a fresh install…"; and 12:47:50Z: "i don't want register i want fucking fixed. canonical pipeline." (that directive's live-defect slice became FGAP-141/TASK-122, fixed and closed; the install-time general gap was filed separately).
- **Current state:** FGAP-140 `identified` P2, no implementing task. FGAP-141 `closed` (update-time registration fixed, verified).
- **Verdict:** still-open — the user's "fixed, not registered" pressure was satisfied only for the update-time half; the install-time seeding half is tracked but unbuilt.
- **Dispatch:** seed catalog block-schema migration chains at install (`installContext`) and/or check-status; done = fresh-install `context-validate` clean for session-notes without manual `write-schema-migration`; FGAP-140 closed.

### A5 — FGAP-093: fork derived into DEC-0024, but the decision is unimplemented and untasked
- **Evidence:** user program frame 2026-07-11T07:35:06Z: "the agent could have determined a canonically valid resolution at that moment and didnt. i want to accelerate valid substrate correcting."
- **Current state:** DEC-0024 filed 2026-07-11T15:01Z (status `open`), decides "Reject unconditionally — add NO opt-out flag" and requires extending the write-time edge guard + rewriting `structured-endpoints.test.ts:288-310`; FGAP-093 still `identified` P2; no implementation task exists; code unchanged.
- **Verdict:** still-open (same task-asymmetry the session itself flagged for FGAP-125 and then fixed there — not fixed here).
- **Dispatch:** file + implement the task enacting DEC-0024 in `packages/pi-context/src/context-sdk.ts` (validateEdgeAgainstRegistry) + test fixture rewrite; done = dangling/unregistered/cycle endpoints throw at write, FGAP-093 closed.

---

## Group B — dropped threads (surfaced in the record, captured nowhere)

### B1 — context-validate "refused for size" friction never filed as an experience gap
- **Evidence:** user, 2026-07-11T12:44:07Z: "\"I never actually got a successful context-validate read (it was refused for size)\" and so you punted and moved on?". The session's own audit (punch item 6b) marked it "Candidate filing"; the 14:38:11Z disposition ledger omitted it entirely.
- **Current state:** fresh title search of framework-gaps (`read cap|size cap|refused|50KB|read-size`, and divergence terms) finds no filing covering it; FGAP-117 (field projection) is adjacent class but does not name the validate-result-over-cap friction. Reproduced live during this audit: a filtered framework-gaps read returned "READ REFUSED — … 69268 bytes, over the 50KB read cap."
- **Verdict:** still-open. Project CLAUDE.md is binding: "Friction hit while driving the CLI is an experience gap — file it … never route around it."
- **Dispatch:** agent investigation (root cause/shape/repro/prior-art per Experience-Gap Handling) then file; done = FGAP filed with the repro observed above.

### B2 — validate-block-items vs read-path registry-resolution divergence never filed
- **Evidence:** session observation quoted in the audit's punch item 6c ("apparently validates against a more lenient/different registry resolution than the actual read path"); same disposition-ledger omission as B1.
- **Current state:** no framework-gaps filing matches (`validate-block-items|read path|registry resolution` → no rows).
- **Verdict:** still-open.
- **Dispatch:** agent investigation: can `validate-block-items` pass where the real read path throws? done = divergence characterized + filed (or disproven with evidence).

### B3 — new tracker-ID comment citations landed after the de-jargon rewrite, inside the gate's blind window
- **Evidence:** user, 2026-07-10T01:05:21Z: "…all code in the repo similarly has all opaque jargon removed and comment semantics in code-valid plain english." The de-jargon rollout (FGAP-136, TASK-108–115) completed 07-10; the delta-scoped gate (TASK-125) landed 07-11T22:00Z.
- **Current state:** commit `75b8775f` (2026-07-11, TASK-121) introduced fresh `FGAP-043` citations into comments: `packages/pi-context/src/block-api.ts:1047,1227,1908,2100` and `packages/pi-context/src/rhetorical-criteria.ts:3`. The gate is staged-delta-scoped, so these already-committed instances will never be flagged.
- **Verdict:** still-open (small, fully enumerated).
- **Dispatch:** rewrite those 5 comment sites to plain English per the FGAP-136 standard (the FGAP-043 meaning is already tabled in the closed gap + `analysis/2026-07-10-fgap-136-*` tables); done = grep of non-test `packages/*/src` comments finds no tracker-ID citations outside the deliberately-excluded illustrative examples.

### B4 — generated commit messages still emit archived-substrate jargon ("FEAT-006")
- **Evidence:** same user standard as B3 ("all opaque jargon removed").
- **Current state:** `packages/pi-agent-dispatch/src/work-order-loop.ts:320` builds runtime commit messages as `feat(work-order-…): completion under FEAT-006 loop (…)` — FEAT-006 here is the *archived* predecessor substrate's work-order feature (line unchanged since 2026-05-28, commit `494357ac`), and the live FEAT-006 is an unrelated pi-context update feature. TASK-118/123/124 edited this same file this session without touching it; FGAP-136's closure scoped itself to comments, so this generated-output instance fell between FGAP-136 (comments) and citation-rot-scanner (tool descriptions/errors/docs).
- **Verdict:** partial — the jargon class is closed for comments and gated for diffs; this runtime-output instance survives ungated.
- **Dispatch:** replace the ID with plain English (or the work-order's own title) in the generated message; done = generated commit messages carry no internal tracker IDs.

---

## Group C — housekeeping danglers (standing-instruction / hygiene)

### C1 — html-views/substrate-overview.html stale against the standing regen instruction
- **Evidence:** project CLAUDE.md (binding standing instruction): "Re-run after any active-substrate `*.json` change to refresh the rendered view."
- **Current state:** last regenerated in `2d3dda8e` (2026-07-11 22:39 +08); ~130 `.context/*` file-changes landed in commits after it (hedge shards, TASK-123/124 filings, all end-of-session closures).
- **Verdict:** still-open (minor, mechanical).
- **Dispatch:** `npx tsx scripts/orchestrator/build-html-views.ts`; done = regenerated + committed.

### C2 — stale merged-empty branch `feat/context-currency-precommit-gate`
- **Evidence:** session housekeeping intent, disposition ledger item 8 (14:38:11Z): "5 worktree branches + empty TASK-091 branch — Delete now — all merged/empty, zero data loss." (assistant text; the named six were deleted).
- **Current state:** `feat/context-currency-precommit-gate` still exists, tip `c792b9fc` 2026-07-07 (predates this session), `git log main..` empty — fully merged, zero unique commits.
- **Verdict:** still-open (minor; the branch predates the session and was outside the six named, so this is fresh observation, not a session drop per se).
- **Dispatch:** `git branch -d feat/context-currency-precommit-gate`.

### C3 — the two triage dashboards were never regenerated after the hedge queue moved
- **Evidence:** user, 2026-07-11T02:05:25Z: "let's now create an artifact the organizes the operation focused candidates — issues, gaps, phases, tasks, milestones, roadmaps — so that I can see and think about which we tackle first in terms of cleaning up context". Assistant disposition (14:38:11Z, item 12): "Will regenerate once the hedge queue below moves."
- **Current state:** artifacts "Substrate Hedge Audit" and "Operational Backlog" last updated 2026-07-11 (pre-shard snapshots, ~01:54Z/02:19Z per the in-session audit); the hedge queue has since been fully disposed (shards + closures), so both snapshots misrepresent current state; their source HTML lived in the now-gone session scratchpad.
- **Verdict:** still-open, user decision — the triage they served is largely done; regenerate only if they remain a standing view.
- **Dispatch (if wanted):** re-run `scripts/scan-substrate-hedges.ts` + rebuild both pages from current substrate; republish to the same artifact URLs.

---

## Group D — open at session end, awaiting the user

### D1 — the user-supplied `analysis/2026-07-11-workflows-audit/` corpus is committed but undirected
- **Evidence:** user, 2026-07-11T21:46:46Z: "note: i have cp'd a dir of analyses to analysis/ dir; you will see them as new files in the git status" and 22:14:00Z: "commit the dir and its files then push". Assistant's final status (22:13:49Z): "remains untracked and untouched, awaiting direction" (then committed+pushed per the directive).
- **Current state:** committed as `4e3619b3` (25 files: session-accounting, project-carryforward, known-broken, intent-signals, atoms, validated subdirs), pushed. No directive exists about consuming its content.
- **Verdict:** still-open (no work was dropped — the thread simply ends at "committed"; what to do with the corpus is the user's next call).

---

## Superseded — for user confirmation, not restoration

### S1 — mandate-p03 was directed removed; it survives narrowed to a two-stop "Ask Gate"
- **Evidence:** user, 2026-07-10T10:58:35Z: "…to remove those elements as well as this: mandate-p03 (\"Every ask in a final message must be one of the three legitimate stops — a pending provenance grant, a genuine scope/value judgment, or a HELD action\"…". Then 11:07:23Z: "why do we still have mandate p03"; after the assistant's structural explanation (provenance-grant leg removed, two stops retained), user 11:08:31Z: "we should not fucking have such fragilities in titles…" and 11:09:49Z: "commit these three files then get back to what the fuck we were focusing on."
- **Current state:** `.claude/mandates.jsonl` carries `mandate-p03` titled "Ask Gate" with a two-stop rule (provenance-grant leg gone); global `~/.claude/mandates.jsonl` verified untouched (mandate-001–009, mtime Dec 2025). Committed at the user's direction.
- **Verdict:** superseded — the later "commit these three files" reads as acceptance of the narrowed p03 rather than deletion; flagged here so the user can confirm that reading rather than the audit restoring the deletion intent. (Note: `~/.claude/.../memory/feedback_plans_and_options.md` still teaches the old three-stop rule including the provenance-grant leg — out-of-repo, inconsistent with the current p03.)

---

## Resolved-since — threads that surfaced and were verified closed against current state

- **R1 TASK-093** ("let's finish task 093", 2026-07-09T22:45:52Z) — `completed`; `.claude/mandates.jsonl` exists; hook registrations tracked.
- **R2 Mandate-injection portability** (surfaced 07-09T23:01Z as "deliberately not acted on"; audit item 7) — resolved by `38fa81f4`: tracked `.claude/settings.json` now carries the `UserPromptSubmit` mandates-injection hook (verified in file). The companion stop-on-ambiguity item was filed into FEAT-013's motivation (FEAT-013 `in-progress`, tracked).
- **R3 De-jargon program** (user 07-10T01:05Z) — FGAP-136 `closed`; TASK-108–115 all `completed` (TASK-114's STORY-010 miss and TASK-111's branch recovery were rerun per the user's 02:29Z "under what policy is task 114 not re-running to completion"); residual new instances are B3/B4 above.
- **R4 Pre-commit jargon gate** (user 07-09T23:56:58Z: "a pre-commit hook that flags the use of such harness jargon in any code comment") — TASK-125/FGAP-142 built, merged, `closed`; `.husky/pre-commit` runs `check-comment-citations.ts` (verified in file).
- **R5 FGAP-138 / revision-moved** (user 07-10T04:30:24Z "this is all llm invented over-complication"; 05:00:08Z "remove it: … FEAT-011 … still names revision-moved") — TASK-117 `completed`, FGAP-138 `closed` (mechanism deleted, not repaired); FEAT-011's acceptance criteria verified free of revision-moved (modified 07-10T05:00:25Z).
- **R6 FGAP-126 correction + implementation** (user 07-10T12:30:20Z "correct fgap-126's proposed_resolution to one resolution"; 23:10:25Z "file the implementation task") — corrected, TASK-118 filed and `completed`, FGAP-126 `closed`.
- **R7 FEAT-014 gap set** (fable's standing recommendation; user 07-10T23:14:30Z "which of the other gaps the feature assembles need the same verification") — FGAP-125 → TASK-123, FGAP-128 → TASK-124, both `completed`, both gaps `closed`, merged `909e5655`, substrate-closed `008036fd`. FEAT-014 honestly `in-progress` on A2 only.
- **R8 Gap-audit invocation template** (user 07-10T23:17:45Z "we need a prepared invocation … on disk simply so that it is pass verbatim"; 07-11T05:12:49Z best-of-breed rewrite directive; 05:19:03Z "commit it") — `analysis/2026-07-11-gap-fork-provenance-audit-brief-template.md` exists, committed, used by all shards.
- **R9 Hedge scanner + its corrections** (user 07-11T00:48:49Z script directive; 01:29:32Z "drop weighting, output plain candidate list including hedging language"; 01:41:21Z "the script should ignore closed"; 01:51:07Z "exclude those clearly terminal") — TASK-120 `completed`; current `scripts/scan-substrate-hedges.ts` verified: verbatim match excerpts, TERMINAL_STATUSES exclusion, no scoring weights.
- **R10 The substrate-wide hedge-audit program** (user 07-10T23:45:18Z end-state statement; 07-11T15:04:11Z "we close this session when the entire list is validly canonically correctly disposed of") — the ~90-candidate queue was disposed via 8 committed shard reports (conventions 10, framework-gaps 20, phase 2, research 6, tasks 9, verification 25, features 5, session-notes 4 = 81) plus the 9 individually-audited items (FGAP-043/085/093/100/124/125/126/127 + TASK-090 scan-check); 2 corrections landed (FEAT-014; one framework-gaps item, `861b4398`); the write-time rhetorical-criteria gate (TASK-121) now enforces the class at write. Items filed after the scan were not in the queue by construction.
- **R11 TASK-091 recovery** — CHANGELOG entry re-landed (verified present in `packages/pi-context/CHANGELOG.md`), sweep independently verified, closed via VER-100 (`9fa8077c`), empty branch deleted.
- **R12 Schema-versioning design-intent question** (user 07-11T12:34:56Z "i suspect we've have partially implemented / unfinished elements thrown around with no clear overarching understanding of intended end state") — archaeology re-dispatched after the drop, answered ("accreted over ~10 weeks… only the innermost primitive was pre-planned"), de-ephemeralized to `analysis/2026-07-11-schema-versioning-design-intent-archaeology.md` (`13a38f99`).
- **R13 FGAP-141 / "i don't want register i want fucking fixed"** (07-11T12:47:50Z) — TASK-122 `completed`, FGAP-141 `closed`, docs synced (`ad5fd025`); the three user-authorized gated schema writes (research resolve-conflict, session-notes write-schema, framework-gaps identity migration) all reflected in current samples/schemas.
- **R14 pi-mono exemplar policy** (user 07-11T00:12:47Z "a golden north star…"; 00:30:52Z "put those in a conventions block") — conventions item `pi-mono-is-exemplar` verified live, 4 numbered principles, severity error.
- **R15 Dashboard scroll bug** (user 07-11T02:18:38Z) — fixed and republished same session ("fix-scroll"); staleness is C3, a separate matter.
- **R16 Final commit+push** (user 07-11T22:14:00Z "commit the dir and its files then push") — done; `main` == `origin/main` at `4e3619b3` (fresh `git status -sb`).

**Pre-existing tracked backlog touched by the session, unchanged and honest (no atoms):** TASK-041 (`planned`, covers the 17 decision-derivation validate warnings), FGAP-085 (`identified` P3, audited this session as grounded), FGAP-117/FGAP-123 (read-surface projection class). Release state: v0.33.0 tag is 141 commits behind HEAD; all session surface sits in CHANGELOG `[Unreleased]` — correct under the standing release HOLD, not a dangler.

---

## Tally

| verdict | count | atoms |
|---|---|---|
| still-open | 12 | A1 A2 A3 A4 A5 B1 B2 B3 C1 C2 C3 D1 |
| partial | 1 | B4 |
| superseded (user to confirm) | 1 | S1 |
| resolved-since | 16 | R1–R16 |

Highest-value dispatches, in rough order: A4/A5 (decided-or-general gaps with no task — the exact asymmetry the session itself fixed for FGAP-125), B1/B2 (binding-convention violations: unfiled experience gaps), A2 (user-verbatim UX directive), B3/B4 (enumerated jargon stragglers), A1/A3 (tracked backlog), C1/C2 (mechanical), C3/D1/S1 (user decisions).
