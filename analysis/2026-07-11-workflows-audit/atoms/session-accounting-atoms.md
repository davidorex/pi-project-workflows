# Session-accounting — actionable atoms

Derived from three verbatim subagent reports auditing whether issues surfaced in workflowsPiExtension session `d3030496` were accounted for in the `.context` substrate:
- `session-accounting-turn-boundary.md` (TB)
- `session-accounting-forward.md` (FWD)
- `session-accounting-substrate-backward.md` (SB)

Each atom is one discrete unit of disposition, anchored to a verbatim quote from a source report (which itself already cites David's words / the substrate / git). Positive controls (FEAT-011 revision-moved, TASK-090 correctly-open, FGAP-141/TASK-122 live-fix, FGAP-136 report closed, held release currency) are NOT atoms — nothing to dispose.

## Groups
- GROUP-SA-01: TASK-091 landed-but-not-closed residue — atoms: ATOM-SA-01, ATOM-SA-02, ATOM-SA-03
- GROUP-SA-02: Hedge-audit program (unrun body + untracked backlog) — atoms: ATOM-SA-04, ATOM-SA-05
- GROUP-SA-03: Schema-versioning design-intent (punt-and-pivot + source-loss) — atoms: ATOM-SA-06, ATOM-SA-07
- GROUP-SA-04: Filed-but-not-decomposed gaps — atoms: ATOM-SA-08, ATOM-SA-09, ATOM-SA-10, ATOM-SA-11
- GROUP-SA-05: Observed-but-not-filed experience gaps — atoms: ATOM-SA-12, ATOM-SA-13, ATOM-SA-14, ATOM-SA-15
- GROUP-SA-06: Session-terminal substrate amnesia — atoms: ATOM-SA-16, ATOM-SA-17
- GROUP-SA-07: Stale dashboards — atoms: ATOM-SA-18
- GROUP-SA-08: Provenance/attribution field defects — atoms: ATOM-SA-19, ATOM-SA-20, ATOM-SA-21, ATOM-SA-22

## Atoms

### ATOM-SA-01 — TASK-091 reads `planned` while its deliverable is live on main
- group: GROUP-SA-01
- action: Independently run the class-sweep verification TASK-091 requires, then close the task (verification record + complete-task) so stored status matches the landed reality.
- evidence: "TASK-091 substrate work → recovered on main via `b4c9bce1`; convention, FEAT-011 edge flip, and citation all verified live" but "status `planned`; class-sweep never independently verified; no verification/complete-task." (source: session-accounting-forward.md) — corroborated: "TASK-091 status still `planned`; convention `substrate-derived-state` and the FEAT-011 edge flip are on main (commit `b4c9bce1`)" (source: session-accounting-turn-boundary.md)
- scope: `tasks.json` TASK-091; `conventions.json` (`substrate-derived-state`); `features.json` FEAT-011; commit `b4c9bce1`; new record in `verification.json`
- verify: TASK-091 `status: completed` with a linked verification record documenting an independent class-sweep; no residual `planned` for landed work

### ATOM-SA-02 — TASK-091 CHANGELOG entry lost in orphaned commit `d06bf3d3`
- group: GROUP-SA-01
- action: Recover commit `d06bf3d3` (cherry-pick) so the TASK-091 CHANGELOG entry lands on a reachable branch and satisfies TASK-091 criterion-4.
- evidence: "its CHANGELOG entry is orphaned commit `d06bf3d3` — `git branch --contains` returns nothing, absent from CHANGELOG, and TASK-091 criterion-4 requires it." (source: session-accounting-turn-boundary.md) — corroborated: "TASK-091 CHANGELOG entry | **Lost** — orphaned commit `d06bf3d3`, absent from CHANGELOG | Yes — cherry-pick recoverable" (source: session-accounting-forward.md)
- scope: git object `d06bf3d3`; `CHANGELOG.md`; TASK-091 criterion-4
- verify: `git branch --contains d06bf3d3` (or the recovered content) resolves; the entry is present in `CHANGELOG.md`

### ATOM-SA-03 — Stale empty branch `task-091-derived-state-convention` never deleted
- group: GROUP-SA-01
- action: Delete the empty stale branch (after ATOM-SA-02 confirms nothing unique is stranded on it).
- evidence: "Empty branch `task-091-derived-state-convention` never deleted." (source: session-accounting-turn-boundary.md) — corroborated: "Branch `task-091-derived-state-convention` | Exists, empty, stale | Yes — delete" (source: session-accounting-forward.md)
- scope: git branch `task-091-derived-state-convention`
- verify: branch no longer listed in `git branch`

### ATOM-SA-04 — Hedge-audit program ~87 of 90 candidates never run
- group: GROUP-SA-02
- action: Run the templated hedge-audit over the remaining unaudited candidates (the stated end-state: substrate "exactingly audited, validated, and corrected").
- evidence: "90 candidates flagged now; only 6 ever template-audited; ~87 never run." ... "fresh scanner re-run in the audit doc = 505 items / 90 candidates; only 6 templates completed (FGAP-124/125/126/127/085/043)." (source: session-accounting-turn-boundary.md) — corroborated: "89 of 90 [candidates] still unaudited." (source: session-accounting-forward.md)
- scope: `scripts/scan-substrate-hedges.ts` output (505 items / 90 candidates); completed templates FGAP-124/125/126/127/085/043; remaining ~84–87 candidates
- verify: audited-candidate count advances materially past 6; corrections filed per template

### ATOM-SA-05 — No substrate work-item tracks the hedge-audit backlog
- group: GROUP-SA-02
- action: File a substrate work-item (task or gap) that tracks the ongoing hedge-audit backlog, so the recurring program is visible beyond the completed tool-build task.
- evidence: "TASK-120 (\"scripts/scan-substrate-hedges.ts\") = `completed`; a `grep` of tasks/gaps for hedge/de-hedge/candidates finds **only** the tool-building task, none tracking the remaining ~84 items to audit." (source: session-accounting-forward.md)
- scope: `tasks.json`/`framework-gaps.json`; TASK-120 (completed tool-build)
- verify: a new open work-item exists whose scope is the remaining candidate backlog

### ATOM-SA-06 — Schema-versioning design-intent question still unanswered
- group: GROUP-SA-03
- action: Investigate and answer the user's original conceptual question about why only user-stories carry schema versions and whether the version mechanism is a coherent overarching design; write the answer durably.
- evidence: "Schema-versioning design-intent archaeology | Never ran — the agent was dispatched and the punt callout landed 19 seconds later; your original question is still unanswered." (source: session-accounting-turn-boundary.md) — anchor to user's question: "what also of the fact that no other schemas have versions, except user stories. what's up with that." and "i suspect we've partially implemented / unfinished elements thrown around with no clear overarching." (source: session-accounting-turn-boundary.md)
- scope: `schemas/` version fields across block schemas; new `analysis/2026-07-1x-schema-versioning-*.md` (newest extant is June `2026-06-19-block-schema-version-stamping.md`)
- verify: a dated analysis file answers the version-coverage question and the coherence-of-mechanism question

### ATOM-SA-07 — Six-concept version-mechanism code map lost in a subagent sidechain
- group: GROUP-SA-03
- action: Recover/reconstruct the six-concept version-mechanism code map that was produced inside a subagent sidechain and transcribe it to `analysis/`.
- evidence: "The six-concept version-mechanism code map \"exists only in a subagent sidechain — never written to `analysis/`.\"" (source: session-accounting-turn-boundary.md)
- scope: subagent sidechain output for the version-mechanism code map; `analysis/`
- verify: the six-concept map is present as a durable file under `analysis/`

### ATOM-SA-08 — FGAP-125 template-corrected but carries no implementation task
- group: GROUP-SA-04
- action: Decompose FGAP-125 into an owning implementation task (resolving the asymmetry vs. its decomposed siblings).
- evidence: "FGAP-125 was template-corrected but, unlike siblings, carries no implementation task. Verified: FGAP-125 `identified`, no owning TASK; FGAP-126→TASK-118 (`planned`), FGAP-127→TASK-119." (source: session-accounting-turn-boundary.md)
- scope: `framework-gaps.json` FGAP-125; `tasks.json`
- verify: FGAP-125 has a linked owning task (parity with FGAP-126/127)

### ATOM-SA-09 — FGAP-128 filed `identified` with no owning task
- group: GROUP-SA-04
- action: Decompose FGAP-128 into an owning implementation task or explicitly dispose it.
- evidence: "FGAP-128 also `identified`, no task." (source: session-accounting-turn-boundary.md)
- scope: `framework-gaps.json` FGAP-128; `tasks.json`
- verify: FGAP-128 has a linked task or a recorded disposition

### ATOM-SA-10 — FGAP-139 filed but not decomposed
- group: GROUP-SA-04
- action: Decompose FGAP-139 (the x-prompt-budget-on-array-items gap) into an implementation task.
- evidence: "both present, status `identified`, no implementation task — the schema-migration-seeding gaps that the \"i don't want register i want fucking fixed. canonical pipeline\" thread (user 12:47:50 UTC) spun off." (source: session-accounting-turn-boundary.md) — content anchor: user "does not and structurally cannot reach arrays of budgeted PRIMITIVE strings… x-prompt-budget on an array property's own items schema" (source: session-accounting-substrate-backward.md)
- scope: `framework-gaps.json` FGAP-139; `tasks.json`
- verify: FGAP-139 has a linked implementation task

### ATOM-SA-11 — FGAP-140 filed but not decomposed
- group: GROUP-SA-04
- action: Decompose FGAP-140 (fresh-install block-schema migration seeding) into an implementation task.
- evidence: "both present, status `identified`, no implementation task — the schema-migration-seeding gaps..." (source: session-accounting-turn-boundary.md) — corroborated open: "Its sibling **FGAP-140** (fresh-install block-schema seeding) remains correctly `identified`/open." (source: session-accounting-forward.md); content anchor: "installContext/checkStatus never seed block-schema migration declarations… sole starter file with a baked-in version stamp — the other 17 have no version field" (source: session-accounting-substrate-backward.md)
- scope: `framework-gaps.json` FGAP-140; `tasks.json`
- verify: FGAP-140 has a linked implementation task

### ATOM-SA-12 — Mandate-injection global-only gap (from TASK-093) never filed
- group: GROUP-SA-05
- action: File the global-only mandate-injection finding as a framework-gap.
- evidence: "Mandate-injection global-only gap (from TASK-093) | Still true, never filed, orphaned since a completed task." ... "no framework-gaps item covers it (mandate-bearing gaps are only FGAP-071 unrelated / FGAP-072 closed)." (source: session-accounting-turn-boundary.md)
- scope: `framework-gaps.json`; TASK-093 (completed); existing FGAP-071/FGAP-072
- verify: a framework-gaps entry exists covering global-only mandate injection

### ATOM-SA-13 — "validate size-refusal friction" observed but never filed
- group: GROUP-SA-05
- action: File the size-refusal friction as an experience-gap (CLAUDE.md mandates experience-gap filing).
- evidence: "\"validate size-refusal friction\" and \"validate-block-items vs. real-read-path divergence,\" both \"observed in passing, never filed\" (punch list) despite CLAUDE.md requiring experience-gap filing." (source: session-accounting-turn-boundary.md)
- scope: `framework-gaps.json`; original friction: "I never actually got a successful context-validate read (it was refused for size)"
- verify: an experience-gap entry captures the size-refusal friction

### ATOM-SA-14 — "validate-block-items vs. real-read-path divergence" observed but never filed
- group: GROUP-SA-05
- action: File the validate-block-items vs. real-read-path divergence as an experience-gap.
- evidence: "the strings \"real read path\"/\"validate-block-items\" now appear once each in `tasks.json`, but as description text, not a filed gap." (source: session-accounting-turn-boundary.md)
- scope: `framework-gaps.json`; the description-text mentions in `tasks.json`
- verify: a filed gap (not mere description text) captures the divergence

### ATOM-SA-15 — Worktree `core.bare`/`node_modules` friction never confirmed filed
- group: GROUP-SA-05
- action: Confirm whether the worktree friction was filed; if not, file it (user ordered it considered for filing).
- evidence: "The worktree `core.bare`/`node_modules` friction the user ordered considered for filing (03:10:11 UTC, \"this is your failure ... worth filing as its own gap\") likewise is not tracked in the punch list and I did not confirm a filing — probable dangler under category E." (source: session-accounting-turn-boundary.md)
- scope: `framework-gaps.json`; worktree `core.bare`/`node_modules` setup
- verify: either a filing is confirmed present, or a new gap is filed

### ATOM-SA-16 — No session-note exists for this ~14k-message session
- group: GROUP-SA-06
- action: Author a session-note capturing this run (07-10/07-11) into `.context`.
- evidence: "`session-notes.json` newest timestamp is `2026-06-27` — **no session-note exists for this ~14k-message session at all** (neither 07-10 nor 07-11)." (source: session-accounting-forward.md)
- scope: `session-notes.json`; session `d3030496` (2026-07-09T22:37Z → 07-11T14:10Z)
- verify: a `session-notes.json` entry exists dated in the session window

### ATOM-SA-17 — Session's own thread inventory lives only in `analysis/*.md`, never crossed into `.context`
- group: GROUP-SA-06
- action: File the session's end-of-run untied-threads inventory (lost commit, stale branch, hedge backlog) into `.context` as durable substrate items, not just a loose markdown.
- evidence: "the derive-don't-cache substrate has no record that these threads exist; the only durable trace is a gitignored/loose analysis markdown." (source: session-accounting-forward.md) — corroborated: "the session's own untied-threads audit closes loops only by listing them; nearly every item it names remains open work" (source: session-accounting-turn-boundary.md)
- scope: `analysis/2026-07-11-session-untied-threads-audit.md`; `.context` (issues/gaps/tasks/session-notes)
- verify: the inventory's items exist as substrate records (this artifact's atoms are the vehicle); `.context` no longer amnesiac about the residue

### ATOM-SA-18 — Dashboards stale with no regen mechanism
- group: GROUP-SA-07
- action: Regenerate the stale dashboards and establish/record the regeneration mechanism the standing instruction requires.
- evidence: "`html-views/substrate-overview.html` = Jul 9 07:51 (predates every write of this 07-09→11 session); `html-views/milestones-and-roadmap.html` = May 25. Standing instruction is to regenerate; punch list: \"no update mechanism.\"" (source: session-accounting-turn-boundary.md)
- scope: `html-views/substrate-overview.html`, `html-views/milestones-and-roadmap.html`; regen mechanism
- verify: dashboard mtimes refreshed to current substrate; a repeatable regen path exists

### ATOM-SA-19 — `created_at` systematically date-floored across every in-window item
- group: GROUP-SA-08
- action: Decide and apply a correction/policy for the date-floored `created_at` provenance field (values have no basis in the true creation instant).
- evidence: "FGAP-139/140/141 `created_at:\"2026-07-11T00:00:00.000Z\"`; FGAP-136/137/138 and TASK-107→117 `created_at:\"2026-07-10\"`. Record: object mtimes place true creation at FGAP-139 07-11 18:55, FGAP-140 19:45, FGAP-141 21:47 (Shanghai) — off by ~11h and floored to a UTC-midnight/date stamp." (source: session-accounting-substrate-backward.md)
- scope: `framework-gaps.json`, `tasks.json` (FGAP-136–141, TASK-107→117); the pi-context filer that stamps `created_at`
- verify: filer behavior corrected (or a documented decision to accept), with true-instant provenance available

### ATOM-SA-20 — Verification records use inconsistent/absent `timestamp` fields
- group: GROUP-SA-08
- action: Backfill/normalize verification-record provenance timestamps (VER-096/098 carry none; VER-087…094 are date-only).
- evidence: "VER-096/098 carry no timestamp at all; VER-087…094 carry date-only `\"2026-07-10\"`." (source: session-accounting-substrate-backward.md)
- scope: `verification.json` VER-087,088,089,091,092,094,096,098
- verify: every VER record carries a consistent provenance timestamp field

### ATOM-SA-21 — TASK-117 folds an assistant-originated analogy into a "User's explicit call:" sentence
- group: GROUP-SA-08
- action: Correct the TASK-117 filing so the content_pin analogy is not attributed to the user (the core "remove it" directive is user-verbatim; the analogy is assistant-supplied).
- evidence: "Filed (DESC): \"User's explicit call: this is LLM-invented over-complication, remove it — **the same disposition content_pin received for the identical reason.**\" Record: ... the content_pin analogy is **assistant-supplied** ... not in any user message." (source: session-accounting-substrate-backward.md)
- scope: `tasks.json` TASK-117 DESC field
- verify: TASK-117 no longer attributes the content_pin analogy to the user while preserving the verbatim directive

### ATOM-SA-22 — TASK-107 acceptance criteria unreconciled with a later user preference
- group: GROUP-SA-08
- action: Reconcile TASK-107's filed audit/probe acceptance criteria against the user's stated preference against performative auditing (decide keep or amend).
- evidence: "criteria mandate a `.test.ts` harness and \"A fresh adversarial probe independently confirms…\". Record: user 23:53:36 \"we do not need performative bureaucracy of auditing. the running of the script will serve as auditing.\"" (source: session-accounting-substrate-backward.md)
- scope: `tasks.json` TASK-107 acceptance criteria
- verify: criteria are explicitly reconciled with the stated preference (amended or a recorded decision to retain)
