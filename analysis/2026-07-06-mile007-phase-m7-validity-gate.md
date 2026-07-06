# MILE-007 / PHASE-M7-PROCESS-HARNESS — milestone-validity-gate findings

Gate run 2026-07-06 (read-only) per the `milestone-validity-gate` convention, before PHASE-M7's first task (TASK-093) enters plan mode. Members validated: FEAT-013; PHASE-M7-PROCESS-HARNESS; TASK-093…TASK-101; R-0027, R-0028 and their findings docs. Every claim below is anchored to a substrate read (via `pi-context` CLI), a repo file (Read/Grep), or a hook script read directly. Active substrate confirmed `.context` (`.pi-context.json` `contextDir`).

**Method note:** I changed nothing. Findings are for the orchestrator to correct via provenance-gated grants; I do not fix.

---

## Reference-accuracy verification (the load-bearing anchors)

Every filed anchor I could check exists as described. The load-bearing *negatives* the requirements rest on are all CONFIRMED TRUE:

| Filed claim | Verified? | Evidence |
|---|---|---|
| No Stop hook exists anywhere | CONFIRMED | `.claude/settings.local.json` registers only PreToolUse(Bash → glue+gap-guard) and PreToolUse(Write\|Edit\|NotebookEdit → control-chars); `~/.claude/settings.json` hooks = UserPromptSubmit, PermissionRequest, PostToolUse(ExitPlanMode), PreToolUse(SendMessage). No `Stop` key in either. |
| No SessionStart hook exists | CONFIRMED | Same two settings files; no `SessionStart` registration. |
| `.claude/settings.json` (tracked) absent; wiring lives in untracked `settings.local.json` | CONFIRMED | `ls .claude/settings.json` → No such file. `git ls-files .claude/` does not list `settings.local.json`; `git ls-files --error-unmatch .claude/settings.local.json` → "did not match any file(s)". |
| `.claude/mandates.jsonl` (project) absent | CONFIRMED | `ls .claude/mandates.jsonl` → No such file. |
| UserPromptSubmit injection slot exists with the `if [ -f .claude/mandates.jsonl ]` project hook | CONFIRMED | `~/.claude/settings.json` UserPromptSubmit cmd = `cat ~/.claude/mandates.jsonl 2>/dev/null; if [ -f .claude/mandates.jsonl ]; then cat .claude/mandates.jsonl; fi`. |
| `yolo-approve.py` auto-approves all-but-blacklist when `.claude/yolo` exists | CONFIRMED | `~/.claude/hooks/yolo-approve.py`: `check_yolo_mode()` tests `cwd/.claude/yolo`; `is_blocked()` matches `yolo-blacklist.json`; else `approve()`. Registered PermissionRequest matcher `*` in user settings. |
| PostToolUse(ExitPlanMode) is observable/stampable (plan-archive pattern) | CONFIRMED | `~/.claude/hooks/plan-archive.sh` registered PostToolUse(ExitPlanMode). |
| gap-register-guard blocks planning-block appends until `# provenance-reviewed` sentinel | CONFIRMED | `.claude/hooks/gap-register-guard.sh` L20-25: matches `(append\|update\|upsert)-block-item` ∧ `--block (framework-gaps\|tasks\|decisions\|features\|story\|research\|issues\|conventions)`; passes iff `grep -Eq 'provenance-reviewed'`. Sentinel is a constant string (L23) — the same-turn hole R6/TASK-098 target is real. |
| block-pi-context-glue blocks pipe/`2>/dev/null`/loops/redirect/echo-glue | CONFIRMED | `.claude/hooks/block-pi-context-glue.sh` — four regex chokepoints, exit 2, matches filed description verbatim. |
| Substrate Write/Edit hole open (only control-chars runs on Write\|Edit) | CONFIRMED | settings.local.json: the sole Write\|Edit\|NotebookEdit hook is `block-control-chars.sh`. No hook matches paths under `.context/`. TASK-094's premise holds. |
| `driver.mjs` precedent exists | CONFIRMED | `.claude/skills/run-pi-project-workflows/driver.mjs` (git-tracked). |
| `milestone-validity-gate` convention, enforcement `manual` | CONFIRMED | `read-block-item --block conventions --id milestone-validity-gate` → `enforcement: "manual"`, `severity: "error"`. |
| mandate-005 explicit-direction carve-out (TASK-097) | CONFIRMED | `~/.claude/mandates.jsonl` mandate-005: "Manual implementation … Only happens at explicit user direction, never as llm-suggested alternative." |
| mandate-007 "user decides scope" (TASK-099) | CONFIRMED | mandate-007: "…do NOT claim it is out of scope. User decides scope." |

**Dependency edges (via `find-references`) match the brief's filed structure exactly:** 094→093, 095→093, 096→093, 100→093; 097→096, 098→096, 099→096; 101→097, 101→098, 101→099 (`task_depends_on_task`). No stray or missing task-dependency edges beyond these.

---

## Per-member findings

### FEAT-013 — CLEAN (source text)
Description + 11 acceptance_criteria are internally coherent and trace to the verbatim user directive carried in `motivation`. The criteria map 1:1 onto R1-R20 of R-0028. No augmentation detected between FEAT-013 and R-0028. Fit as the derivation source.

### PHASE-M7-PROCESS-HARNESS — CLEAN
intent/goal/success_criteria restate FEAT-013 faithfully; the three success_criteria are checkable (per-guard live demo; three-stops pass; tracked-wiring/fresh-checkout). No divergence from FEAT-013.

### TASK-093 (wiring + mandates + yolo) — CLEAN
Every anchor confirmed above. Scope is independent of the coherence gaps in 095-099. **This first-task text is fit to enter plan mode as-is.** One NOTE: "yolo auto-approve … disabled in this project" — `yolo-approve.py` is a *user-level* hook (`~/.claude/hooks/`, registered in `~/.claude/settings.json`), so "disable here" can only mean project-local means (ensure `.claude/yolo` absent + fold its blacklist into the R2/R4 chokepoints), not editing the hook registration. The task text ("disabled in this project or its blacklist … subsumed") is consistent with that; flagging so the brief does not attempt a user-global edit.

### TASK-094 (substrate direct-write deny) — CLEAN
Premise (no Write/Edit hook guards `.context/`) CONFIRMED. Criteria testable with named regression cells. Reads `contextDir` from `.pi-context.json` — correct (active substrate is `.context`). Provenance: FEAT-013 criterion 1 / R1.

### TASK-095 (Bash chokepoint: git/pipe/release) — CLEAN on its own axes; participates in a cross-member gap (see Coherence #1)
Anchors (destructive-git list, `--no-verify`, gate-pipe masking, release/push hold, `set -o pipefail` permitted) all trace to R-0028 R2/R3/R4 and R-0027's SYNTH segment-split pattern. Testable. **Gap:** its text is silent on the guard-fired marker that TASK-098 says "TASK-095's Bash guard read[s]" — see Coherence #1.

### TASK-096 (phase-state layer — keystone) — one CORRECTION (see Coherence #2)
Field set `{taskId, state, branch, planStamp, demoEvidence, probeVerdict, findings[]}` is verbatim from R-0028 R11. SessionStart seed from `context-status` traces to R11. **Correction:** criterion 3 "a fresh session reconstructs the true state from substrate truth alone" overclaims — `planStamp`, `demoEvidence`, `probeVerdict`, and the `findings[]` ledger are session-local pipeline artifacts, NOT substrate-native (R-0028 R14 itself defers substrate-native demo/probe evidence to "longer-term per P5"). A from-substrate-only reseed recovers the coarse pipeline *position* (task status, verification edges, branch) but not those evidence fields. As written a downstream brief could read "whole state is substrate-derivable," which is false and collides with TASK-099's closure gates that depend on those fields surviving. See Coherence #2.

### TASK-097 (source-edit gate) — one CORRECTION (see Coherence #3)
Branch/plan-stamp checks and the mandate-005 user-sentinel carve-out are accurate and testable. **Correction:** criterion 2 blocks "while state = implementation-delegated," but TASK-096's field list has no delegation / session-role field, and no state enum value named "implementation-delegated" (the enum is SURFACED…CLOSED; the nearest is IMPLEMENTED). R-0028 R15 grounds the mechanism ("subagent sessions carry their own hook context, so the block scopes to the orchestrator"), but the two task texts do not make the shared datum explicit. See Coherence #3.

### TASK-098 (Stop-hook ask gate + marker) — CLEAN on its own axes; anchors the cross-member gap (Coherence #1)
Three-stops filter, ask-phrase patterns, "regex first / invokeMonitor if too blunt" all trace to R-0028 R12/R6 and §3a verbatim. Testable. **Gap:** criterion 3 asserts "TASK-095's Bash guard read[s] the marker," but neither task assigns who *sets* the marker, and no dependency edge links 095↔098. See Coherence #1.

### TASK-099 (findings ledger + closure evidence + milestone gate) — CLEAN; inherits the TASK-096 evidence-persistence correction
Ledger gates on merge/complete-task, demo+probe required for closure, deprioritization escape (mandate-007), milestone-gate record — all trace to R13/R14/R18 and FEAT-013 criteria 7 + 10. `complete-task` / `context-status` ops confirmed present (CLAUDE.md + settings allowlist). Note the dependency on TASK-096 evidence fields being persisted — see Coherence #2. Minor coherence note: the milestone-gate convention gates the milestone's *first* task once (one record per milestone); TASK-099 criterion 3 phrases it per-member-task ("A milestone-member task entering PLANNED without a milestone-gate record is blocked") — reconcilable (one per-milestone record, checked whenever any member enters PLANNED), but worth tightening so the brief builds a per-milestone record, not a per-task one.

### TASK-100 (guard extensions + nudges) — CLEAN; one mechanism assumption (see Mechanism §)
Extends gap-register-guard (confirmed extensible), deferral lexical list matches R-0028 §3f, PostToolUse(Agent) checklist + PostToolUse(git commit) reminder trace to R10/R19. Block-vs-nudge severities align with P4. Assumption: PostToolUse(Agent) matcher — see Mechanism §.

### TASK-101 (session driver) — CLEAN; one testability NOTE
Driver walks SURFACED…CLOSED, dispatches state-appropriate agent kinds, mints transitions, refuses out-of-order — traces to R17 and the driver.mjs precedent. **Note:** criterion 3 "demonstrably the lowest-friction path … (compliance by construction, not by recall)" is subjective — no crisp checkable condition. Suggest restating as an observable (e.g., "the driver performs each state's required dispatch/gate without the operator issuing the underlying commands manually").

### R-0027 / R-0028 — CLEAN (grounding)
Both findings docs read in full. The tasks are faithful derivations; I found no task element that narrows or adds beyond FEAT-013 + these reports. R-0028's own honesty about deferred substrate-native evidence (R14) and unused Stop hook (§4) is what surfaces Coherence #2 and the Mechanism assumptions — i.e., the reports flagged these; the task texts partially re-tightened them into overclaims.

---

## Cross-member coherence

**#1 — The guard-fired marker: SET responsibility unassigned; scope stated inconsistently; coupling not in the dependency graph.** (correction)
FEAT-013 criterion 2 / R6: "a guard-fired marker set on any provenance-guard block is cleared only by the Stop hook … a sentinel-bearing re-issue before the marker clears is blocked." The marker lifecycle spans members:
- CLEAR — assigned (TASK-098 criterion 3, Stop hook).
- READ — assigned (TASK-098 criterion 3: "TASK-095's Bash guard reading the marker").
- SET — **assigned to no task's acceptance criteria.** TASK-095 never mentions the marker; TASK-100 (which extends the *provenance* guard, gap-register-guard) never mentions it; TASK-097 (which adds a *third* sentinel surface — the mandate-005 orchestrator-direct-edit escape) never mentions it.
Also the marker's **scope** is stated inconsistently: FEAT-013/R6 say "any provenance-guard block" (implying the existing gap-register-guard planning-block sentinel — the original documented same-turn hole), whereas TASK-098 ties the marker exclusively to "TASK-095's Bash guard" (git/release sentinels). Whether the gap-register-guard provenance sentinel and TASK-097's source-edit sentinel participate in the same marker is undefined.
Finally, the marker couples TASK-095 and TASK-098 but there is **no dependency edge** between them (095→093 only; 098→096 only), so the coupling is invisible to the graph a decomposition/sequencing brief would read.
*Suggested correction:* name the writer, event, and file of the marker in one place (likely TASK-096's phase-state or a dedicated `.claude/state/` marker), state that ALL three sentinel surfaces (gap-register-guard provenance, TASK-095 git/release, TASK-097 source-edit) set-and-read it, and add the 095↔098 (and 097↔098) dependency edge(s) or fold the marker into the TASK-096 keystone so the dependency flows through 096.

**#2 — Phase-state persistence vs "reconstruct from substrate alone."** (correction)
TASK-096 criterion 3 ("fresh session reconstructs the true state from substrate truth alone") is in tension with TASK-096's own evidence fields and with TASK-099's closure gates. `planStamp`/`demoEvidence`/`probeVerdict`/`findings[]` are not substrate-native (R-0028 R14 defers that). If SessionStart reseeds strictly "from substrate truth," a session restart mid-pipeline (post-DEMO, pre-CLOSE) loses demo/probe evidence and the ledger, and TASK-099's `complete-task` gate re-blocks. Either (a) accept and state that evidence must be reproduced per session (coarse position from substrate; fine evidence ephemeral), or (b) specify where the ledger/evidence persist across sessions. As written, TASK-096 criterion 3 and TASK-099's closure criteria presuppose different persistence models.

**#3 — "implementation-delegated" datum not defined in the keystone.** (correction)
TASK-097 criterion 2 reads a state the phase-state does not define. TASK-096's `state` enum is SURFACED…CLOSED with no delegation/session-role field. Add the delegation marker (or the orchestrator-vs-subagent session distinguisher R-0028 R15 relies on) to TASK-096's field set, or restate TASK-097's predicate in terms of a field TASK-096 actually carries.

**No double-coverage found.** FEAT-013 criterion 8 (R10/R15/R16) is split cleanly — R15/R16 to TASK-097, R10 to TASK-100 — with disjoint pieces. No two tasks claim the same guard.

---

## Mechanism truth — assumptions to verify (not blockers)

The following presupposed Claude Code hook events are documented CC events (the `create-hooks` skill enumerates PreToolUse, PostToolUse, UserPromptSubmit, Stop, SessionStart) but are **NOT exercised anywhere in this repo or user config today**, so their exact behavior is an assumption the first wiring task must verify empirically, not a proven fact:

- **Stop hook** (TASK-098) — never wired here. Must verify it fires at turn boundary, receives the transcript/final-message, and that exit 2 blocks turn-end with stderr fed back.
- **SessionStart hook** (TASK-096) — never wired here. Must verify it fires and can seed a file before the first tool call.
- **PostToolUse(Agent)** (TASK-100) — never wired here (only PostToolUse(ExitPlanMode) is proven, via plan-archive). Must verify PostToolUse fires for the Agent/Task tool, exposes the agent result, and that a PostToolUse feedback/`additionalContext` channel injects to the orchestrator.

PROVEN affordances the tasks rely on: PreToolUse(Bash/Write/Edit/NotebookEdit) block+stderr; PostToolUse(ExitPlanMode) stamping; UserPromptSubmit injection; PermissionRequest allow/deny; the substrate write-time invariant gate + `complete-task` atom + `context-status` (all CLI-confirmed).

Minor: the "integration branch" name TASK-095/097 gate against is unspecified in the task text but derivable (`feature-branch-workflow`; currently `main`). Note-level; name it in the brief.

---

## VERDICT

Findings, most-severe first:

| # | Severity | Member(s) | Axis | What | Suggested correction |
|---|---|---|---|---|---|
| 1 | correction | TASK-095, TASK-098, TASK-097, TASK-100 | coherence | Guard-fired marker: SET action assigned to no task; scope ("any provenance-guard block" vs "TASK-095's guard") inconsistent; 095↔098 coupling absent from dependency graph. | Name writer+event+file of the marker once; state all sentinel surfaces participate; add the 095↔098/097↔098 edge or route the marker through TASK-096. |
| 2 | correction | TASK-096, TASK-099 | coherence / testability | "Fresh session reconstructs true state from substrate alone" contradicts non-substrate-native planStamp/demo/probe/findings (R-0028 R14) that TASK-099 closure depends on. | State the persistence model: coarse position from substrate; specify where evidence/ledger persist (or that they are per-session and must be reproduced). |
| 3 | correction | TASK-096, TASK-097 | coherence | TASK-097 gates on "state = implementation-delegated," a datum not in TASK-096's field set / state enum. | Add the delegation/session-role marker to TASK-096, or restate TASK-097's predicate over an existing field. |
| 4 | note | TASK-098, TASK-096, TASK-100 | mechanism | Stop, SessionStart, PostToolUse(Agent) are documented CC events but unexercised here — assumptions, not proven. | First task wiring each verifies the event fires + exposes the assumed data before building on it; state so in the brief. |
| 5 | note | TASK-099 | testability | Milestone-gate criterion phrased per-member-task; convention is per-milestone-once. | Build one per-milestone gate record, checked when any member enters PLANNED. |
| 6 | note | TASK-101 | testability | Criterion 3 "demonstrably lowest-friction" is subjective. | Restate as an observable (driver performs each dispatch/gate without manual command issuance). |
| 7 | note | TASK-093 | reference | "yolo disabled in this project" — hook is user-global; only project-local means apply. | Brief targets `.claude/yolo` absence + blacklist subsumption, not a user-global registration edit. |
| 8 | note | TASK-095, TASK-097 | reference | "integration branch" name unspecified. | Name it (`main`) in the brief. |

**No blockers.** Reference accuracy is high — every anchor checked exists as described, and all load-bearing negatives (no Stop hook, no SessionStart hook, tracked settings.json absent, settings.local.json untracked, project mandates.jsonl absent) are confirmed true. Provenance is clean: the nine tasks faithfully derive from FEAT-013 + R-0027/R-0028 with no augmentation. The dependency graph matches the filed structure exactly. The three corrections are cross-member design-coherence gaps (the guard-fired-marker lifecycle, phase-state persistence semantics, the delegation datum) that would under-specify the TASK-095/096/097/098/099 implementation briefs — they should be granted before those briefs are composed. TASK-093 (the milestone's first task) is itself clean and fit to enter plan mode; the corrections touch downstream members, so per the convention they are best resolved as one provenance-gated grant batch before the phase proceeds.
