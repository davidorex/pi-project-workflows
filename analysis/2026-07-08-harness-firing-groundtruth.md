# Harness firing — ground truth vs the 2026-07-08 reproduction-sequence critique

Verifies each of the 6 claims in `analysis/2026-07-08-harness-operation-gap-reproduction-sequence.md` against this repo's live state. Every verdict rides a quoted source. Read-only investigation; no substrate mutated.

## Contradiction resolved first: where the live "9 mandates" come from

The live Claude Code session shows a "UserPromptSubmit hook success" injecting 9 mandates every turn. Source is NOT this repo:

- `.claude/settings.json` (TRACKED — `git ls-files` lists it) has hooks ONLY for `PreToolUse` (Bash: block-pi-context-glue, gap-register-guard; Write|Edit: block-control-chars, block-substrate-write). **No `UserPromptSubmit`.**
- `.claude/settings.local.json` is git-ignored (`git check-ignore -v` → `.gitignore:4:.claude/*` → `.claude/settings.local.json`) and contains only `permissions` + `outputStyle`. **No hooks at all.**
- The injector is in the GLOBAL user file `~/.claude/settings.json`:
  `"UserPromptSubmit" ... "command": "cat ~/.claude/mandates.jsonl 2>/dev/null; if [ -f .claude/mandates.jsonl ]; then cat .claude/mandates.jsonl; fi"`
- `~/.claude/mandates.jsonl` is a symlink → `/Users/david/Projects/dot-claude/mandates.jsonl`, 9 lines, ids mandate-001..mandate-009. **These are David's personal/global mandates, not project-shaped.**
- The project slot the hook also cats — `.claude/mandates.jsonl` — **does not exist** (`ls` → No such file or directory). Root `MANDATES.md` / `mandates.jsonl` also absent.

**Therefore:** a fresh clone of this repo gets ZERO mandate injection. The 9 live mandates ride entirely on David's machine-global config. This is exactly what R-0028 recorded ("the project mandates.jsonl slot is empty") and what TASK-093 / FEAT-013 R9 exist to fix.

---

## Per-claim verdicts

### Claim 1 — Per-turn mandate injection: **PARTIAL (mechanism exists but is machine-global, not committed; project source empty)**
- Injection MECHANISM real but lives in `~/.claude/settings.json` (global), not tracked in-repo. Project `.claude/settings.json` has no `UserPromptSubmit`.
- Mandate SOURCE for this project (`.claude/mandates.jsonl`) is an EMPTY SLOT (file absent). The 9 injected mandates are the global `dot-claude` set, generic not project-shaped.
- Wiring: **local-only / not reproducible.** A clone gets nothing.
- Tracked by: TASK-093 (in-progress, the in-flight focus) — move hook regs into tracked settings.json + populate `.claude/mandates.jsonl`; FEAT-013 acceptance criterion R9.

### Claim 2 — Audit gate structurally forced: **PARTIAL (verification edge forced; separate-agent + findings-count are prose only)**
- `complete-task --help`: `--taskId` and `--verificationId` BOTH required; verificationId "must have status 'passed'; the op files the linking edge itself." Closure atom. **Structural — TRUE.**
- Invariant `completed-task-has-verification` (from `read-config`): `class: requires-edge`, `where: {status: completed}`, `relation_types: [verification_verifies_item]`, **`severity: error`**. **ERROR-level — TRUE.**
- SEPARATE-agent audit ending in parseable "Total findings: N": **NO mechanism, and not even prose in this repo.** grep of CLAUDE.md for "total findings" → nothing. Closest prose: CLAUDE.md:107 (adversarial verification probe, "fresh-context agent", "a fix ... requires a FRESH re-audit") and convention `subagent-dispatch-fit` (`enforcement: review`). Both are review/honor-system, no parseable findings-count gate.
- Tracked by: FEAT-013 R13-R14 (in-progress) — "findings ledger ... merge and complete-task blocked while the ledger holds open entries"; TASK-099 (planned).

### Claim 3 — Criteria-first: **PARTIAL (criteria_results field exists; criteria-before-impl is prose/manual only)**
- Tasks schema required fields = `["id","description","status"]`. **`acceptance_criteria` is NOT required.** No hook/invariant forces criteria before implementation.
- Verification schema HAS `criteria_results` (array of `{criterion, status(passed/failed/skipped), evidence}`) — but it matches by `criterion` **string, not by id**, and is **NOT in the verification required set** (`["id","status","method"]`). Field available, not enforced.
- Criteria-first is prose/manual: convention `feature-branch-workflow` (`enforcement: manual`) "file the gap/task/criteria there BEFORE branching"; `milestone-validity-gate` (`enforcement: manual`) validates member `acceptance_criteria` pre-implementation; `filing-provenance` (`enforcement: review`). None is a firing gate.

### Claim 4 — State-continuity surface: **FALSE (critique's premise does not hold in this repo)**
- Critique says `context-current-state` "is config-gated and returns 'state-derivation not configured.'" **Live run `pi-context context-current-state --cwd .` DERIVES CLEANLY:** returns `focus: "in-flight: TASK-093"`, populated `inFlight`, 15 `nextActions`, `blocked`, `milestones`. `context-status` also returns full block summaries (104 tasks, 82 verifications, etc.).
- Reason: FEAT-004 makes derivation config-driven; its criterion 1 preserves full derivation for stock substrates "declaring framework-gaps + tasks" — which this `.context` is. The degraded "not configured" path only fires on custom-vocabulary substrates lacking a state-derivation declaration. **The critique imported a symptom from a different (custom-vocab) substrate.**
- Tracked by: FEAT-004 (in-progress) — but for THIS repo the surface is already healthy; nothing to fix here.

### Claim 5 — Session-start orientation injector: **TRUE that it is ABSENT (largely untracked as an injector)**
- No `orient` skill: `.claude/skills/` = audit-substrate-currency, release, repo-guide, run-pi-project-workflows. No `SessionStart` hook in project `.claude/settings.json` or global `~/.claude/settings.json`. grep CLAUDE.md/skills for orient|session.start → nothing.
- Closest tracked item is TASK-096 (planned) / FEAT-013 R11: a SessionStart hook that seeds/reconciles a machine-readable phase-state file from `context-status`. That is pipeline-state reconciliation for deny-hooks, **not** a live-substrate orientation injector into the model's context. The specific "orient at session start" injector is **untracked**.

### Claim 6 — Agent-dispatch + write conventions as mechanism vs prose: **PROSE/REVIEW only (partly explicitly declined as mechanism)**
- `subagent-dispatch-fit` — `enforcement: review` (Explore read-only, non-inferrable deliverables, orchestrator re-verify).
- `feature-branch-workflow` — `enforcement: manual` ("implement via a foreground coding subagent", clean tree before branching).
- `de-ephemeralize-at-source` — `enforcement: review` (write-your-own-report / read-before conventions).
- "unnamed foreground agents only", "one atomic mutating step per turn", "verify-by-reread", "git commit -F" appear NOWHERE as mechanism (grep CLAUDE.md → none). FEAT-013 explicitly REASONS THESE OUT: "Reasoned omissions from the WASC exemplar: one-bash-per-turn ... and git-tracked rendered prompts." CLAUDE.md:161 documents the `/tmp/<id>.json` then `append-block-item @/tmp/...` write pattern as prose, not a hook.

---

## Existing substrate coverage map

| Claim | Substrate item | Status |
|---|---|---|
| 1 Per-turn mandate injection | TASK-093 (move regs to tracked settings.json + populate `.claude/mandates.jsonl`); FEAT-013 R9 | in-progress (TASK-093 is in-flight focus) |
| 2 Audit gate forced (verification edge) | invariant `completed-task-has-verification` (error) + `complete-task` atom | LIVE / enforced |
| 2 Separate-agent audit + findings-count gate | FEAT-013 R13-R14; TASK-099 (findings ledger) | in-progress / planned (not built) |
| 3 Criteria-first mechanism | FEAT-013 (R7-R8 filing-completeness guard); conventions filing-provenance/milestone-validity-gate | in-progress / manual+review only |
| 3 criteria_results field | verification schema (present, optional) | LIVE (optional) |
| 4 State-continuity surface | FEAT-004 (config-driven derivation) | in-progress; already healthy for this stock substrate |
| 5 Session-start orient injector | TASK-096/FEAT-013 R11 seed phase-state (NOT an injector); dedicated orient injector | UNTRACKED as injector |
| 6 Agent-dispatch/write conventions | subagent-dispatch-fit (review), feature-branch-workflow (manual), de-ephemeralize-at-source (review) | prose/review/manual; one-bash + tracked-prompts explicitly omitted in FEAT-013 |

R-0028 ("Harness requirements", status **stale**) is the parent audit; it already records the exact holes: "the wiring itself (hook registrations live in untracked settings.local.json; the project mandates.jsonl slot is empty)", "no Stop hook exists anywhere", "the ENTIRE verify layer ... iterate-to-zero ... honor-system". FEAT-013 (status **in-progress**) is the tracking feature with acceptance criteria R1-R20 covering claims 1,2,3,5,6.

---

## Change-list, partitioned

### ALREADY PRESENT
- **Committed / reproducible:** `completed-task-has-verification` error invariant + `complete-task` verificationId-required atom (Claim 2 hard core). Tracked `.claude/settings.json` PreToolUse guards (block-pi-context-glue, gap-register-guard, block-control-chars, block-substrate-write). `context-current-state`/`context-status` derive cleanly (Claim 4 — nothing to fix). `criteria_results` field in verification schema (Claim 3, optional). The 14 conventions incl. subagent-dispatch-fit / feature-branch-workflow / milestone-validity-gate (Claim 6 prose).
- **Local-only / NOT reproducible:** the entire per-turn mandate injection (Claim 1) — lives in `~/.claude/settings.json` + `~/.claude/mandates.jsonl` symlink to `dot-claude`; a clone gets none. Project `.claude/mandates.jsonl` absent.

### ALREADY TRACKED in substrate (must build, not re-discover)
- TASK-093 (in-progress) — Claim 1 wiring: move hook regs to tracked settings.json + populate `.claude/mandates.jsonl` with project-shaped mandates. FEAT-013 R9/R17-R20.
- FEAT-013 R13-R14 / TASK-099 (planned) — Claim 2 findings ledger / iterate-to-zero as a merge+complete-task gate.
- FEAT-013 R7-R8 — Claim 3 filing-completeness guard (criteria/provenance at the write guard).
- FEAT-013 R12 / TASK-098 (planned) — Stop-hook ask gate (adjacent to the whole discipline).
- TASK-096 / FEAT-013 R11 (planned) — SessionStart phase-state seed (partial coverage of Claim 5's session-start surface, but not an orient injector).

### GENUINELY MISSING (no committed mechanism AND no precise tracking item)
- A parseable **separate-agent audit terminating in "Total findings: N"** as a machine-checked gate — not present even as prose in CLAUDE.md; FEAT-013's findings-ledger is adjacent but does not specify the separate-agent + parseable-count contract.
- A **session-start orientation injector** (skill/hook that injects live substrate state — `context-current-state` + open issues — into the model's context each session). Claim 5: absent and untracked as an injector (TASK-096 seeds a machine phase-state file for hooks, a different thing).
- **criteria-before-implementation as a firing gate** (hook/invariant), and **criteria_results made required** with per-criterion-by-id matching — today prose/manual + an optional string-matched field.

### Single highest-leverage genuinely-missing change
**Commit the mandate injection into the repo:** add a tracked `UserPromptSubmit` hook to `.claude/settings.json` and populate a tracked, project-shaped `.claude/mandates.jsonl`. This is the critique's step-1 lever and the in-flight TASK-093 — right now the entire per-turn discipline rides on David's machine-global `~/.claude` config and evaporates on a fresh clone. It is the one change that converts "the operator's laptop happens to inject mandates" into "the repo injects mandates," which is the precondition for every other firing claim.
