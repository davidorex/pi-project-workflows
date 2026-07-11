---
audit_group: session-accounting
description: d3030496 forward structural
source_agent: adcaebdaea3163142
extracted_from: /private/tmp/claude-501/-Users-david-Projects-harness-monitor-training/4a529474-bea7-419f-8f8c-bdcdb0aaeb54/tasks/adcaebdaea3163142.output
verbatim: true
---

# COVERAGE

Structural blocks read from session d3030496 (14,069 msgs; bounds 2026-07-09T22:37Z → 07-11T14:10Z, i.e. 07-10 06:37 → 07-11 22:10 Shanghai):

- **Largest text blocks**: dumped the top 30 by length; read in full the top 6 distinct (ranks 00/01 are one logical block — the FGAP-136 meaning-table, subagent result + assistant relay; 02 = compaction summary #2 @07-11T07:02; 03 = compaction summary #1 @07-10T04:51; 05 = schema-versioning accretion analysis @07-11T12:42; 06 = `writeTypedFile` code report @07-11T08:20). Did **not** individually read ranks 7–29 (blocks 04, 07–29) — relied on the two compaction summaries, which exhaustively enumerate the 07-09/07-10 arcs, for that interval.
- **End-of-turn stream**: read all ~90 assistant-final / user-directive messages from 07-11T13:00Z→14:13Z (the session's finale) via SQL, ordered by time.
- **Substrate cross-ref**: framework-gaps (141), issues (12), tasks (122), decisions (23), conventions, session-notes (9) read/queried directly by id and content.
- **Not covered**: mid-session turn-ends 07-10T05:00→07-11T07:00 except as compressed by the two compaction summaries; blocks ranked 7–29.

A decisive structural fact shaped this audit: **the session audited its own untied threads at the very end** (user @13:51: "task a fable agent to... identify all untied threads / un-done work from this session"), producing `analysis/2026-07-11-session-untied-threads-audit.md`, then (@14:12) launched the exact inductive 2-agent method this task uses. So the session's own loose-end inventory is available and I cross-referenced it against `.context`.

# FINDINGS (most severe first)

**F1 — The session's own end-of-run thread inventory was never written into `.context`; it lives only in an `analysis/*.md` file.** Surfaced (assistant @07-11T14:10:24Z, verified punch-list): "TASK-091 CHANGELOG entry | **Lost** — orphaned commit `d06bf3d3`, absent from CHANGELOG | Yes — cherry-pick recoverable"; "Branch `task-091-derived-state-convention` | Exists, empty, stale | Yes — delete"; "**Hedge-audit program** | 90 candidates flagged now; only 6 ever template-audited". Substrate status: **not filed.** `grep 'd06bf3d3' .context/*.json` → absent. `session-notes.json` newest timestamp is `2026-06-27` — **no session-note exists for this ~14k-message session at all** (neither 07-10 nor 07-11). Characterization: the derive-don't-cache substrate has no record that these threads exist; the only durable trace is a gitignored/loose analysis markdown.

**F2 — TASK-091 is filed-but-inaccurate: its deliverable landed and was verified live, yet the task still reads `planned` with no verification.** Surfaced (assistant @14:09:42Z): "TASK-091 substrate work → recovered on main via `b4c9bce1`; convention, FEAT-011 edge flip, and citation all verified live" but "status `planned`; class-sweep never independently verified; no verification/complete-task." Substrate confirms both halves: `conventions.json` **does** contain the `substrate-derived-state` convention (the deliverable), while `tasks.json` TASK-091 = `status: planned`, `closed_at: null`. Characterization: stored status diverges from the true landed state — precisely the "currency by construction" drift class the project itself tracks as FEAT-011, occurring in its own bookkeeping.

**F3 — No substrate work-item tracks the hedge-audit backlog the session built tooling to drive.** Surfaced (compaction summary @07-11T07:02, "Pending Tasks"): "89 of 90 [candidates] still unaudited." Substrate: TASK-120 ("scripts/scan-substrate-hedges.ts") = `completed`; a `grep` of tasks/gaps for hedge/de-hedge/candidates finds **only** the tool-building task, none tracking the remaining ~84 items to audit. Characterization: capability filed as done, the ongoing program it exists to serve is invisible to the substrate.

**F4 — TASK-090 accurately open.** Surfaced same punch-list: "TASK-090 → `planned`; implementation wholly discarded with the deleted branch." Substrate: TASK-090 = `planned`, description = FEAT-011 criterion-7 drift-surfacing. Characterization: correctly reflects "not done" — a *correct* accounting instance (the work was destroyed in the git-race incident and the task honestly remains open).

**F5 — The live substrate breakage surfaced mid-session WAS fully accounted for and closed.** Surfaced (assistant @07-11T12:42:06Z, live reproduction): "THREW: MigrationRegistry: no path from 1.2.0 to 1.4.0 for schema 'research'" — the project's own `research.json`/`session-notes.json` unreadable through the canonical path. Substrate + finale stream: FGAP-141 filed and then `closed`; TASK-122 = `completed` (`registerCatalogMigrationChainIfKnown` wired into the 3 unregistered write paths, `research`/`session-notes` data-repaired and re-read clean on main @13:31–13:46, independent adversarial audit "zero defects," docs-surface-synced). Characterization: exemplary full accounting — surfaced, filed, fixed, verified, closed. Its sibling **FGAP-140** (fresh-install block-schema seeding) remains correctly `identified`/open.

**F6 — The FGAP-136 report-file loose end (subagent could not Write) was closed.** Surfaced (subagent @07-10T02:04:34Z): "no report file exists at `analysis/2026-07-10-fgap-136-pi-context-meaning-table.md` — I was structurally unable to create it... must be transcribed by whichever agent... has file-write permission." Substrate/summary: FGAP-136 = `closed`; compaction summary confirms the orchestrator persisted the 5 per-package meaning tables. Accounted.

# EMERGENT CATEGORIES (grown from the findings)

- **C1 — Session-terminal loss (F1):** threads the session itself explicitly enumerated at close never crossed from `analysis/*.md` into `.context` (no session-note, no issue). The substrate is structurally amnesiac about the run's own residue — the single largest accounting failure, and it recurred across three distinct threads (lost CHANGELOG commit, stale empty branch, hedge backlog).
- **C2 — Status lag / under-closure (F2):** a deliverable lands (even reaching `conventions.json`) while the task tracking it stays `planned` with no verification. Stored status < reality — the project's own FEAT-011 defect class, self-inflicted.
- **C3 — Program-without-tracker (F3):** tooling filed as a completed task, but the recurring work it was built to perform has no backlog item — the substrate sees the instrument, not the job.
- **C4 — Git-artifact orphans (F1):** lost commits and stale branches are real loose ends with no substrate hook; they can only be caught by a git/claude-history sweep, never by reading `.context`.

Counter-pattern worth naming: when a defect surfaced *mid-arc* and the user pressed on it (F5, F6), accounting was thorough to exemplary. The failures cluster at **turn/session boundaries** — what surfaced late, or as a byproduct of an incident, is what the substrate failed to capture.
