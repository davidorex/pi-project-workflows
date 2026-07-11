# Session untied-threads audit — 2026-07-11

Session audited: Claude Code session `d3030496-e4e1-4bfa-8df1-1df86bac518a` (claude.ai id `session_01Cjctq42gHDdWsHVT8KfdAY`), started 2026-07-10 06:38 +08, ~13,855 messages, still live at audit time. Every "current state" below is verified against the live substrate (via pi-context read ops), git, or the filesystem at audit time (2026-07-11 ~22:00 +08) — not against what the session transcript claims. claude-history quotes carry UTC timestamps; add 8h for local.

Working-tree state at audit: clean, `main`, ahead of `origin/main` by 21 commits, nothing pushed.

---

## 1. TASK-090 / TASK-091 shared-checkout race and branch deletion

**What happened (from history):** At 2026-07-11 03:57 UTC the user directed "do these: parallel agents: TASK-090 TASK-091", meaning template-audit runs of the two filings. The orchestrator instead dispatched two background general-purpose implementation agents into ONE shared checkout with full write+commit briefs. They raced: TASK-090's agent found TASK-091's uncommitted substrate work in the tree, committed it as `b4c9bce1`, then switched the shared checkout to `task-090-drift-surfacing`, stranding TASK-091's branch empty. TASK-091's agent separately committed `d06bf3d3` (its CHANGELOG entry) and `e3626377` (a SKILL.md regen) onto `task-090-drift-surfacing`. The user killed the running agent, discarded the uncommitted working-tree changes ("i don't want fucking anything from this branch"), and directed "delete task-090-drift-surfacing" (04:30 UTC).

**Verified current state:**

- **TASK-091's substantive deliverable IS on main and live.** `b4c9bce1` sits in main's history (parent `370b1477`). Verified directly against the live substrate:
  - conventions item `substrate-derived-state` exists (read via `read-block-item`),
  - FEAT-011 carries `item_governed_by_convention -> substrate-derived-state` and NO remaining `item_acknowledges_missing_convention` edge (read via `find-references`) — the edge flip happened,
  - the milestone schema's "canon (substrate-derived-state)" citation resolves in BOTH `packages/pi-context/samples/schemas/milestone.schema.json` and the installed schema (read via `read-schema`),
  - the catalog mirror `samples/blocks/conventions.json` carries the item (part of `b4c9bce1`'s diff).
  - Caveat: `b4c9bce1`'s commit message misattributes the work ("filed by a prior session... committed here as-is") — it was TASK-091's own agent's same-session uncommitted work, as `d06bf3d3`'s full forensic message (33 seconds later, same content basis) proves.
- **TASK-091's CHANGELOG entry is LOST and was never re-landed.** `d06bf3d3` (+1 line to `packages/pi-context/CHANGELOG.md`: the substrate-derived-state catalog-convention entry) exists as a git object but `git branch -a --contains d06bf3d3` returns nothing — orphaned since the branch delete. The entry is absent from main's current CHANGELOG (grep confirms no substrate-derived-state entry under `[Unreleased]`). TASK-091 acceptance criterion 4 explicitly requires a CHANGELOG entry. **Recoverable:** `git cherry-pick d06bf3d3` (object still present).
- `e3626377` (SKILL regen catch-up) is likewise orphaned; SKILL.md was regenerated again later in the TASK-121/122 docs passes, so this one is plausibly superseded — not independently diffed.
- **TASK-091 status: `planned`** (read live). Never set in-progress, never closed — no verification item, no `complete-task`, despite the deliverable substantively landed. Its criterion-2 class sweep ("zero other dangling convention citations") exists only as agent self-report (documented in `d06bf3d3`'s message); never independently re-verified.
- **Branch `task-091-derived-state-convention` still exists**, empty (tip = old main commit `370b1477`, zero unique commits). Leftover; never deleted.
- **TASK-090 status: `planned`** (read live). Its implementation (drift surfacing in currentState, FEAT-011 criterion 7) was wholly discarded with the branch, per the user's directive. Status is honest. The template-audit the user actually asked for was later checked (06:50 UTC): the scanner does not flag TASK-090's text at all, so no template run applies — that directive is legitimately closed. TASK-091 never got the equivalent check or a template run.
- **FEAT-011 remains `in-progress`**; TASK-084–089 completed, TASK-090 + TASK-091 are its open tail.

**Needs action:** re-land the CHANGELOG entry (cherry-pick `d06bf3d3` or rewrite), independently verify the criterion-2 sweep, close TASK-091 (verification + complete-task), delete the empty `task-091-derived-state-convention` branch. TASK-090 is open implementation work (FEAT-011 criterion 7).

---

## 2. Hedge-scanner backlog — the stated substrate-wide audit program, largely unrun

**Scanner history (from session):** built as TASK-120 (completed, closed, VER-097). Counts moved as the user corrected it: 496 items/142 candidates (min-score 2) → 143 → scoring layer removed per user callout ("when did i direct the script to include urgency weighting") → 160 → closed-items excluded → 130 → all terminal statuses excluded → **91**. At 03:55 UTC the assistant answered "what is our current list of non-checked items to check" with: **90 candidates not yet audited (91 total, 4 done: FGAP-124/125/126/127)**.

**Template runs actually completed this session (6):** FGAP-124 (left standing, later closed), FGAP-125 (corrected — `370b1477`), FGAP-126 (corrected; implementation task TASK-118 filed), FGAP-127 (audited; TASK-119 filed per user's copy-agents directive), FGAP-085 (confirmed user-DIRECTED, honest placeholder, no correction; underlying shallow-spread defect at `block-api.ts:1486` confirmed still unfixed), FGAP-043 (audited → canonical resolution decided → implemented as TASK-121, closed).

**Verified current state:** I re-ran the scanner fresh (read-only): **505 items scanned, 90 candidates flagged** (report: `tmp/substrate-hedge-scans/scan-2026-07-11T14-00-46-612Z.json`). Of the 90, only 3 are previously-audited items (FGAP-085 — grounded, expected to flag; FGAP-125 — corrected but still carries flagged language; FGAP-093 — never touched). **~87 candidates have never been run through the template**, including the two highest-ranked genuine candidates the session itself named as "new territory" (FGAP-093 — live status `identified` P2; FGAP-032 — since closed), all 10 flagged conventions items (including `filing-provenance` and `derive-decisions-from-facts`), 23 verification items, 12 research items, tasks, phases, session-notes.

**Stated intent:** user, 2026-07-10 23:45 UTC, verbatim: "we are prototyping the mechanism we will use to bring rationality and validity to all filings in the substrate. the end result of all of this will be that the substrate has been exactingly audited, validated, and corrected, and any TRULY unknown ... surfaced." Assistant, 01:10 UTC: candidates "ready to work through with the fork-provenance-audit template whenever you want to proceed."

**Needs action:** yes — this is the largest stated-but-undone body of work: ~87 template runs against the generalized brief (`analysis/2026-07-11-gap-fork-provenance-audit-brief-template.md`, generalized beyond framework-gaps in `c9eb33a7`).

---

## 3. The two dashboards — stale snapshots, no update mechanism

**Verified current state:**

- `substrate-hedge-audit.html` (artifact `b14ac0fb-5b18-4dc7-8af0-5073601c3389`): last published 2026-07-11 01:54 UTC ("exclude-all-terminal", 91 candidates). Not republished since.
- `operational-backlog.html`: last published 02:19 UTC ("fix-scroll"). Not republished since.
- Substrate changes since those publishes: FGAP-043 closed, FGAP-085 confirmed-grounded, FGAP-125 further corrected, FGAP-139/FGAP-140/FGAP-141 filed, FGAP-141 closed, TASK-118/119/121/122 filed, TASK-121/122 completed, VER-098/099 filed. Both dashboards are stale for their stated purpose (the user's manual triage of what to tackle next).
- No stated intention anywhere in the session to keep them updated — they were one-off snapshots. The source HTML files live in the session scratchpad (`/private/tmp/claude-501/.../scratchpad/`), which is session-ephemeral — the generation inputs will vanish with the scratchpad; only the published artifacts persist.
- Related, same class: `html-views/substrate-overview.html` was last generated 2026-07-09 07:51 +08 — before every substrate write of this session. Project CLAUDE.md directs "Re-run after any active-substrate `*.json` change to refresh the rendered view." Stale by standing instruction, not just by intent.

**Needs action:** user decision. If the dashboards are to serve the ongoing triage program (thread 2), they need regeneration from a fresh scan + current substrate; `substrate-overview.html` regeneration is directed by standing instruction regardless.

---

## 4. FGAP-139 and FGAP-140 — filed, legitimate, unaddressed

**Verified current state (read live):**

- **FGAP-139** — `identified`, P3, pi-context. Rhetorical-criteria enforcement (FGAP-043/TASK-121) structurally cannot reach `x-prompt-budget` declared directly on a bare-string array's items schema (`collectWordCaps` reads only named object properties; `walkNestedArrays` skips non-object elements). Four concrete shipped fields affected (acceptance_criteria in tasks/requirements, decisions consequences, layer-plans exit_criteria). Filed 2026-07-11 after a prior-art search; no implementation task exists.
- **FGAP-140** — `identified`, P2, pi-context. No install/update/status path ever seeds a fresh substrate's `migrations.json` with the catalog's block-schema migration declarations; manifests today as a fresh-install `context-validate` error for session-notes (sole starter with a baked-in `schema_version`), latent for the other 17. Filed 2026-07-11; no implementation task exists. Distinct from FGAP-141 (update-time registration), which WAS fixed and closed (TASK-122, VER-099).
- Neither is flagged by the hedge scanner (their `proposed_resolution` fields carry an explicit "Requires determination:" frame rather than hedge-pattern language).

**Needs action:** these are correctly-filed open gaps awaiting prioritization — not defects of process. The user should know both exist, are unaddressed, and have no tasks.

---

## 5. The schema-versioning meta-question — identified, then orphaned by the punt pivot

This is the cluster the user pointed at ("before i pointed out your punt you had identified other things needing to be done").

**What was identified (12:34–12:44 UTC):** the user asked, verbatim: "what does claude-history have to say about schema versions and substrate items? i suspect we've have partially implemented / unfinished elements thrown around with no clear overarching understanding of intended end state as revealed in claude-history." Two agents were dispatched:

1. **Code-map agent** (12:35 UTC) — completed. Produced a comprehensive map: **six genuinely distinct version-shaped concepts** (schema file `version`, block `schema_version` envelope, config `schema_version`, migrations.json envelope, migration declarations, installed_schemas/installed_blocks + installed_from baseline) with per-concept read/write/enforcement analysis and the finding that no design doc states a unified contract. It also surfaced the live research.json read-throw.
2. **Archaeology agent** (12:43:48 UTC, "Archaeology of schema-versioning design intent") — **has zero output messages in history**. It was dispatched and never ran to completion (the punt callout landed 19 seconds later and the session pivoted into the FGAP-141 fix pipeline).

**Verified current state:**

- Only the two urgent slices were extracted and handled: the live read-throws → FGAP-141/TASK-122 (fixed, closed, verified); the install-seeding gap → FGAP-140 (filed).
- The code-map agent's full report exists **only in the session sidechain** — never written to `analysis/` (no file exists; violates the de-ephemeralize-at-source convention, which was in force for exactly this kind of output), never relayed to the user beyond the urgent-throw slice, never filed as research.
- The archaeology half — was the versioning mechanism ever designed to a stated end state, or accreted piecemeal — was **never investigated at all**. The user's 12:34 question stands unanswered.

**Needs action:** yes, if the user still wants the answer: re-dispatch the archaeology investigation (its full brief is preserved in history), have the agent write its own report, and recover/de-ephemeralize the code-map into `analysis/` (retrievable verbatim from the session sidechain).

---

## 6. The context-validate punt itself — remedied; two small residues

**Verified current state:**

- `pi-context context-validate --json` now runs and returns: **status `warnings`, zero errors, 37 warnings** — 17 `decision-shows-derivation` (DEC-0001–0017), 3 `task-completed-gap-closed` (TASK-064/065/075), 15 `task-completed-feature-complete` (mostly FEAT-011/FEAT-013 members), 2 layer-plans `nested_id_bearing_array`.
- The 17 decision-derivation warnings are tracked: **TASK-041** (`planned`, pre-existing) covers the backfill + severity raise. The task-status-cascade warnings largely reflect FEAT-011's honest in-progress state (thread 1) and gaps legitimately still open behind completed tasks.
- Residue A: the friction that caused the punt — the validate read "refused for size" — was never filed as an experience gap (searched framework-gaps: no match). Project CLAUDE.md: "Friction hit while driving the CLI is an experience gap — file it ... never route around it." Routing around it is precisely what happened.
- Residue B: the punt's substitute check (`validate-block-items` passing where the real read path threw) implies the two surfaces can disagree; the session identified this in passing ("apparently validates against a more lenient/different registry resolution than the actual read path") and never filed or investigated it.

**Needs action:** the fix itself is done (TASK-122 closed, independently verified this session). Residues A and B are unfiled candidate gaps.

---

## 7. TASK-093 investigation residuals (from the session's first hour)

At 2026-07-09 23:01 UTC the assistant flagged two items "deliberately not acted on":

1. **Missing stop-on-ambiguity mandate vs the WASC exemplar** — dispositioned: after the punt-escape-hatch discussion, the user's verbatim concern was filed into FEAT-013's `motivation` (commit `e43c1bd2`), binding R12's eventual implementation to the three-legitimate-stops filter. Parked in a filed feature; legitimately fine as-is (FEAT-013 R12 remains future work).
2. **Mandate-injection hook lives only in global `~/.claude/settings.json`** — a fresh clone arms the tracked PreToolUse guards but gets NO mandate injection until the user's global dotfiles exist. **Verified still true right now**: `UserPromptSubmit` appears 1× in `~/.claude/settings.json`, 0× in the project's tracked `.claude/settings.json`; `.claude/mandates.jsonl` (p01–p04) is tracked but nothing in-repo injects it. **Never dispositioned, never filed anywhere** (framework-gaps search: no match). TASK-093 is `completed`; this residual is orphaned. Untied.

---

## 8. Filed-this-session implementation tasks not started (legitimate, for awareness)

- **TASK-118** (`planned`) — implements FGAP-126's corrected resolution (caller-as-reconciler shape for run-work-order-loop; gated commit routing). FGAP-126 live status: `identified`.
- **TASK-119** (`planned`) — implements FGAP-127's remaining disjunct per the user's verbatim copy-agents directive (install ceremony materializes editable agent spec files). Note the asymmetry: FGAP-127's live status is `closed` while its implementation task is `planned`.
- **FGAP-125** (`identified`, P1) — its proposed_resolution was corrected to a single resolution (`370b1477`) but, unlike 126/127, **no implementation task was ever filed for it**. Still flagged by the current scanner run. Untied relative to its siblings.

---

## 9. Release / push state (expected-pending, not a defect)

- `main` ahead of `origin/main` by **21 commits**; nothing pushed.
- Version 0.33.0 across packages; tag `v0.33.0` exists but is NOT on HEAD — the session's shipped surface (TASK-117 revision-moved removal, TASK-120 scanner, TASK-121 rhetorical-criteria + 18-schema rollout, TASK-122 migration-registration, FGAP-125/126 corrections, convention filings) is all unreleased and sits in CHANGELOG `[Unreleased]`.
- Operator CLI: re-promoted at 13:45 UTC after the final TASK-122 merge (`npm run promote:cli`); `pi-context --version` → 0.33.0; current with the working tree. Not stale.
- Per project policy releases are HELD pending explicit authorization; push was previously authorized in general per memory but none has been made this session. Reported as state, not as a finding.

---

## Punch list (condensed)

| # | Thread | Verified current state | Action? |
|---|--------|------------------------|---------|
| 1a | TASK-091 substrate deliverable | Recovered on main (`b4c9bce1`); convention + edge flip + citation all verified live | No (landed) |
| 1b | TASK-091 CHANGELOG entry | LOST — `d06bf3d3` orphaned, entry absent from main | Yes — re-land |
| 1c | TASK-091 closure | Status `planned`; sweep unverified; no verification/complete-task | Yes |
| 1d | Branch `task-091-derived-state-convention` | Exists, empty, stale | Yes — delete |
| 1e | TASK-090 | `planned`; implementation discarded per user directive; FEAT-011 criterion 7 open | Open work |
| 2 | Hedge-audit program | 90 candidates flagged now; 6 audited ever; ~87 never run; end-state explicitly stated by user | Yes — largest undone body |
| 3a | substrate-hedge-audit.html | Snapshot of 01:54 UTC (91 candidates); stale | User decision |
| 3b | operational-backlog.html | Snapshot of 02:19 UTC; stale vs ~10 substrate changes since | User decision |
| 3c | html-views/substrate-overview.html | Generated Jul 9, predates all session writes; standing instruction says regenerate | Yes |
| 4 | FGAP-139 / FGAP-140 | Both `identified`, no tasks; legitimately filed future work | Prioritize when ready |
| 5a | Schema-versioning code map | Exists only in session sidechain; never de-ephemeralized/filed | Yes — recover |
| 5b | Schema-versioning design-intent archaeology | Agent never ran; user's 12:34 question unanswered | Yes — re-dispatch |
| 6a | context-validate | 0 errors / 37 warnings; punt's defect fixed + closed (TASK-122) | No |
| 6b | validate size-refusal friction | Never filed as experience gap | Candidate filing |
| 6c | validate-block-items vs read-path divergence | Observed, never filed | Candidate filing |
| 7 | Mandate-injection global-only residual | Still true; never filed; TASK-093 completed around it | Candidate filing |
| 8 | TASK-118 / TASK-119 planned; FGAP-125 has no task | Verified live | FGAP-125 task = gap in symmetry |
| 9 | Release/push | 21 ahead, unpushed, unreleased at 0.33.0; operator CLI current | Expected (HELD) |
