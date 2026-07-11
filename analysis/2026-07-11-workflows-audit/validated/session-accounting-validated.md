# Session-accounting atoms — independent re-validation (2026-07-11)

Each ATOM-SA-NN re-checked against the CURRENT `workflowsPiExtension` substrate (`.context/*.json`), git (branches/commits/`git log`), and filesystem (mtimes), not the inherited claim. Evidence below is freshly observed this pass.

Substrate snapshot: `.context/` mtimes 2026-07-11 23:00–23:35; git HEAD `4575c02f`; branches `main` + `feat/context-currency-precommit-gate` only.

Tally: **closed-since 8 · still-open-confirmed 14 · not-found 0** (of 22).

---

## GROUP-SA-01 — TASK-091 landed-but-not-closed residue

### ATOM-SA-01 — TASK-091 reads `planned` while its deliverable is live on main  [VERDICT: closed-since]
- action: Run the class-sweep verification, then close TASK-091 (verification record + complete-task).
- scope: `tasks.json` TASK-091; `conventions.json` (`substrate-derived-state`); `features.json` FEAT-011; commit `b4c9bce1`; `verification.json`.
- observed: `TASK-091.status == "completed"` in current `tasks.json`. `git log` shows `9fa8077c substrate: close TASK-091 -- VER-100 passed, all 4 acceptance criteria met` and `e1156d77 ... independently verify its dangling-citation sweep`. The independent sweep is durable at `analysis/2026-07-11-task091-dangling-citation-sweep.md` (mtime Jul 11 22:44). `git branch --contains b4c9bce1` → `main`. No residual `planned`.

### ATOM-SA-02 — TASK-091 CHANGELOG entry lost in orphaned commit `d06bf3d3`  [VERDICT: closed-since]
- action: Recover the CHANGELOG entry onto a reachable branch (satisfy criterion-4).
- scope: git object `d06bf3d3`; `CHANGELOG.md`; TASK-091 criterion-4.
- observed: The convention CHANGELOG entry is now present on main at `packages/pi-context/CHANGELOG.md:7` (grep hit for `substrate-derived-state` — full starter-convention paragraph), landed via `e1156d77 substrate: recover TASK-091's lost CHANGELOG entry`. Note: the original orphan commit `d06bf3d3` itself is still unreachable (`git branch --contains d06bf3d3` → empty; object exists, `git cat-file -t` → `commit`), but its content was re-authored onto main, satisfying the verify condition (entry present in CHANGELOG).

### ATOM-SA-03 — Stale empty branch `task-091-derived-state-convention` never deleted  [VERDICT: closed-since]
- action: Delete the empty stale branch.
- scope: git branch `task-091-derived-state-convention`.
- observed: `git branch --list 'task-091*'` → empty; branch absent from `git branch -a` (only `main`, `feat/context-currency-precommit-gate`, and the `origin` remotes remain). Branch no longer exists.

---

## GROUP-SA-02 — Hedge-audit program

### ATOM-SA-04 — Hedge-audit program ~87 of 90 candidates never run  [VERDICT: closed-since]
- action: Run the templated hedge-audit over the remaining unaudited candidates.
- scope: `scripts/scan-substrate-hedges.ts` output; templates FGAP-124/125/126/127/085/043; remaining ~84–87 candidates.
- observed: Eight hedge-audit shard docs now exist under `analysis/` (`2026-07-11-hedge-audit-shard-{conventions,features,framework-gaps,phase,research,session-notes,tasks,verification}.md`), landed via commits `ab811c6c`, `a09d20ed`, `861b4398`. Counting `##` item headers across the shards = **93 candidate items audited** (conventions 10, features 5, framework-gaps 21, phase 2, research 14, session-notes 6, tasks 9, verification 26) — materially past the original 6. Corrections were filed (FEAT-014 in the features shard; 1 correction in the framework-gaps shard). The sweep now spans essentially the whole flagged candidate set.

### ATOM-SA-05 — No substrate work-item tracks the hedge-audit backlog  [VERDICT: still-open-confirmed]
- action: File a task/gap tracking the ongoing hedge-audit backlog.
- scope: `tasks.json`/`framework-gaps.json`; TASK-120 (completed tool-build).
- observed: Scanning current `tasks.json` + `framework-gaps.json` for `hedge`/`de-hedge`/`scan-substrate` yields only `TASK-120` (`completed`, the tool-build) and `FGAP-142` (`identified`, "Delta-scoped comment-citation gate" — unrelated). No open work-item whose scope is the audit backlog exists. (The backlog it would have tracked was instead consumed directly by the SA-04 shards, so the item is largely moot — but literally still absent.)

---

## GROUP-SA-03 — Schema-versioning design-intent

### ATOM-SA-06 — Schema-versioning design-intent question still unanswered  [VERDICT: closed-since]
- action: Investigate/answer why only user-stories carry schema versions + whether the mechanism is coherent; write durably.
- scope: `schemas/` version fields; new dated analysis under `analysis/`.
- observed: `analysis/2026-07-11-schema-versioning-design-intent-archaeology.md` exists and directly answers the user's verbatim question. It enumerates the six version-shaped concepts (schema `version`, block `schema_version`, config `schema_version`, migrations.json envelope, per-schema `fromVersion`/`toVersion`, install-baseline `installed_schemas`/`installed_blocks`/`installed_from`), gives a verdict ("Corroborated, with one qualification" — accreted piecemeal over ten weeks), a dated timeline, and a bottom-line answer to the coverage/coherence question. Committed via `13a38f99 analysis: schema-versioning design-intent archaeology`.

### ATOM-SA-07 — Six-concept version-mechanism code map lost in a subagent sidechain  [VERDICT: closed-since]
- action: Recover/reconstruct the six-concept code map into `analysis/`.
- scope: subagent sidechain output; `analysis/`.
- observed: The same archaeology file transcribes the six-concept inventory durably, with code anchors — schema `$id`/`version`, `schema-migrations.ts` (`MigrationFn`/`MigrationRegistryEntry`/`createRegistry`/`resolve`/`runMigrations`), `validateBlockWithMigration`, block-wide `schema_version` envelope, and the install-baseline concepts — no longer confined to a sidechain. (Caveat: it is embedded in the archaeology narrative rather than a standalone code-location map, and states "no code was re-derived," but the six concepts + their code identifiers are present on disk.)

---

## GROUP-SA-04 — Filed-but-not-decomposed gaps

### ATOM-SA-08 — FGAP-125 template-corrected but carries no implementation task  [VERDICT: closed-since]
- action: Decompose FGAP-125 into an owning implementation task.
- scope: `framework-gaps.json` FGAP-125; `tasks.json`.
- observed: `FGAP-125.status` still `identified`, but two owning tasks now reference it: `TASK-123` (`planned`, desc "Implement FGAP-125's remaining two legs under FEAT-014...") and `TASK-124`. Filed via `1e5040ae substrate: file TASK-123 (FGAP-125) and TASK-124 (FGAP-128) under FEAT-014`. Parity with FGAP-126→TASK-118 / FGAP-127→TASK-119 now holds.

### ATOM-SA-09 — FGAP-128 filed `identified` with no owning task  [VERDICT: closed-since]
- action: Decompose FGAP-128 into an owning task or dispose it.
- scope: `framework-gaps.json` FGAP-128; `tasks.json`.
- observed: `FGAP-128.status` still `identified`, but `TASK-124` (`planned`, desc "Implement FGAP-128's remainder under FEAT-014...") now owns it — the only task referencing FGAP-128. Filed via `1e5040ae`.

### ATOM-SA-10 — FGAP-139 filed but not decomposed  [VERDICT: still-open-confirmed]
- action: Decompose FGAP-139 (x-prompt-budget-on-array-items) into a task.
- scope: `framework-gaps.json` FGAP-139; `tasks.json`.
- observed: `FGAP-139.status == "identified"`. Scanning all of `tasks.json` for `FGAP-139` returns **zero** owning tasks. (TASK-121 appears in FGAP-139's own `description`/`reference` text but is FGAP-043's implementation task, not an owner of FGAP-139.) Still undecomposed.

### ATOM-SA-11 — FGAP-140 filed but not decomposed  [VERDICT: still-open-confirmed]
- action: Decompose FGAP-140 (fresh-install block-schema migration seeding) into a task.
- scope: `framework-gaps.json` FGAP-140; `tasks.json`.
- observed: `FGAP-140.status == "identified"`. The only task referencing FGAP-140 is `TASK-122` (`completed`), whose own body states verbatim "CHANGELOG entry naming this does **not** close FGAP-140" — i.e., explicitly not an owner. No decomposing implementation task exists.

---

## GROUP-SA-05 — Observed-but-not-filed experience gaps

### ATOM-SA-12 — Mandate-injection global-only gap (from TASK-093) never filed  [VERDICT: still-open-confirmed]
- action: File the global-only mandate-injection finding as a framework-gap.
- scope: `framework-gaps.json`; TASK-093 (completed); FGAP-071/072.
- observed: No gap in current `framework-gaps.json` references `TASK-093`. The only `mandate`+`inject` hit is `FGAP-072` (`closed`, about per-op `--help` templates — unrelated); `FGAP-071` (`identified`) is gap-arc-coherence, also unrelated. No entry covers global-only mandate injection.

### ATOM-SA-13 — "validate size-refusal friction" observed but never filed  [VERDICT: still-open-confirmed]
- action: File the size-refusal friction as an experience-gap.
- scope: `framework-gaps.json`; friction "context-validate read refused for size".
- observed: No gap newly filed for this friction. The nearest existing item, `FGAP-016` (`identified`, "Read cap measures the pretty/line-counted form ... conservative over-refusal"), covers the size-over-refusal *class* but was created `2026-06-04` — it predates this session and was not filed from this friction. No in-window experience-gap captures the specific validate-read refusal.

### ATOM-SA-14 — "validate-block-items vs. real-read-path divergence" observed but never filed  [VERDICT: still-open-confirmed]
- action: File the divergence as an experience-gap.
- scope: `framework-gaps.json`; description-text mentions in `tasks.json`.
- observed: Searching `framework-gaps.json` for `real read path` → none; for `validate-block-items` → only `FGAP-077` and `FGAP-114`, both `closed` and about *absence* of per-item schema validation, not the read-path divergence. No filed gap captures the divergence.

### ATOM-SA-15 — Worktree `core.bare`/`node_modules` friction never confirmed filed  [VERDICT: still-open-confirmed]
- action: Confirm/File the worktree friction.
- scope: `framework-gaps.json`; worktree `core.bare`/`node_modules` setup.
- observed: `framework-gaps.json` search for `core.bare` → zero hits; for `worktree`+`node_modules` → zero hits. No filing present.

---

## GROUP-SA-06 — Session-terminal substrate amnesia

### ATOM-SA-16 — No session-note exists for this ~14k-message session  [VERDICT: still-open-confirmed]
- action: Author a session-note for the 07-10/07-11 run into `.context`.
- scope: `session-notes.json`; session `d3030496`.
- observed: `.context/session-notes.json` date range is `2026-05-30 … 2026-06-27` (newest stamp `2026-06-27`). No entry falls in the 07-09→07-11 window. Still amnesiac about this session.

### ATOM-SA-17 — Session's own thread inventory lives only in `analysis/*.md`, never crossed into `.context`  [VERDICT: still-open-confirmed]
- action: File the end-of-run untied-threads inventory into `.context` as durable substrate items.
- scope: `analysis/2026-07-11-session-untied-threads-audit.md`; `.context`.
- observed: The inventory remains as three loose analysis markdowns (`2026-07-11-session-untied-threads-audit.md` + `-pass-a` + `-pass-b`), committed as analysis (`619f700a analysis: three-pass independent untied-threads audit`). Several named threads *did* subsequently earn substrate records (TASK-091 completed; TASK-123/124 filed), but the inventory as a whole is not crossed in: no session-note (SA-16), and SA-05/12/13/14/15/19/20/21/22 remain unfiled. `.context` is only partially de-amnesiac.

---

## GROUP-SA-07 — Stale dashboards

### ATOM-SA-18 — Dashboards stale with no regen mechanism  [VERDICT: still-open-confirmed]
- action: Regenerate the stale dashboards; establish/record the regen mechanism.
- scope: `html-views/substrate-overview.html`, `html-views/milestones-and-roadmap.html`; regen mechanism.
- observed: Partial. `substrate-overview.html` mtime is now `Jul 11 22:39` (regenerated via `2d3dda8e chore: regenerate substrate-overview.html`), and a repeatable regen path exists (`scripts/orchestrator/build-html-views.ts`). But `html-views/milestones-and-roadmap.html` mtime is still `May 25 06:27` (last git touch `51ccdc89`) — never refreshed this session. One of the two named dashboards remains stale, so the atom is not fully discharged.

---

## GROUP-SA-08 — Provenance/attribution field defects

### ATOM-SA-19 — `created_at` systematically date-floored across every in-window item  [VERDICT: still-open-confirmed]
- action: Decide/apply a correction/policy for the date-floored `created_at`.
- scope: `framework-gaps.json`, `tasks.json` (FGAP-136–141, TASK-107→117); the pi-context filer.
- observed: Values unchanged. `FGAP-139/140/141.created_at == "2026-07-11T00:00:00.000Z"`; `FGAP-136/137/138.created_at == "2026-07-10"`; `TASK-107/117.created_at == "2026-07-10"`. Still UTC-midnight/date-floored; no true-instant provenance added.

### ATOM-SA-20 — Verification records use inconsistent/absent `timestamp` fields  [VERDICT: still-open-confirmed]
- action: Backfill/normalize VER provenance timestamps.
- scope: `verification.json` VER-087,088,089,091,092,094,096,098.
- observed: `VER-096` and `VER-098` still carry `timestamp == null` (no field). `VER-087/088/089/091/092/094` still carry date-only `"2026-07-10"`. Additionally, the newly-added `VER-100` (closing TASK-091 this session) *also* has no timestamp — the inconsistency persists and has propagated to the newest record.

### ATOM-SA-21 — TASK-117 folds an assistant-originated analogy into a "User's explicit call:" sentence  [VERDICT: still-open-confirmed]
- action: Correct TASK-117 so the content_pin analogy is not attributed to the user.
- scope: `tasks.json` TASK-117 DESC.
- observed: The DESC still reads verbatim: "User's explicit call: this is LLM-invented over-complication, remove it -- **the same disposition content_pin received for the identical reason.**" The assistant-supplied content_pin analogy is still folded inside the user-attributed sentence. Uncorrected.

### ATOM-SA-22 — TASK-107 acceptance criteria unreconciled with a later user preference  [VERDICT: still-open-confirmed]
- action: Reconcile TASK-107's audit/probe criteria against the anti-performative-auditing preference.
- scope: `tasks.json` TASK-107 acceptance criteria.
- observed: Criteria still mandate the harness: "scripts/scan-comment-citations.test.ts exists with unit cells ... plus a live-repo integration cell..." and the body contains an "adversarial probe" confirmation clause. No mention of `performative`/`bureaucracy`/"running of the script will serve as auditing" anywhere in TASK-107, and no recorded decision to retain. Unreconciled.
