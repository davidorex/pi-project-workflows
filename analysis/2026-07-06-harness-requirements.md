# Harness requirements — predictable, non-bypassable process enforcement for pi-project-workflows

Derived 2026-07-06 from: project CLAUDE.md (canonical pipeline 0–7, Completion Sequence 1–13, Experience-Gap Handling, subagent dispatch fit); the 14 enforced conventions in the active `.context` conventions block; the 9 injected mandates (`~/.claude/mandates.jsonl` via the user-level UserPromptSubmit hook); the memory feedback corpus (15 `feedback_*.md` files); the 3 live repo hooks + their registrations; husky pre-commit + gate scripts; the substrate's 13 declared invariants and op surface. Directive being served, verbatim: "i cannot rely on claude code deciding to honor and follow requisite policies and conventions on their own … we need to foreclose it mechanistically. … the predictable non-bypassable harness shaped for this project that encodes the canonical valid process for success such that llm laziness and chaos production ends for good."

---

## 1. The canonical process — the state machine the harness encodes

### 1.1 The work unit

The atomic work unit is the substrate **task** (status enum, from `tasks` schema: `planned | in-progress | completed | blocked | cancelled`). Tasks group under phases (`task_positioned_in_phase`), phases under milestones (`phase_positioned_in_milestone`; milestone status is a derived phase-rollup, invariant `milestone-status-converges`). A feature decomposes into tasks per the `feature-decomposition` convention ("one change that one coding-agent brief implements and one runtime demo plus one adversarial audit proves"). Every finding raised mid-pipeline is itself a work unit that re-enters the same machine (CLAUDE.md pipeline step 3: "a discovered divergence is not patched ad hoc, it re-enters the pipeline").

### 1.2 The states and legal transitions

Distilled from CLAUDE.md "Canonical implementation pipeline" 0–7 + "Completion Sequence" 1–13 + the conventions:

```
SURFACED ──> INVESTIGATED ──> FILED ──> GATE-VALIDATED ──> EXPLORED ──> PLANNED
                                                                          │
   ┌──────────────────────────────────────────────────────────────────────┘
   v
BASELINED ──> IMPLEMENTED ──> GATED ──> DEMOED ──> PROBED ──┬── (findings) ──> back to EXPLORED
                                                            │      [scoped to the finding's CLASS]
                                                (clean pass)│
                                                            v
                                             DOCS-SYNCED ──> MERGED ──> CLOSED ──> [RELEASED] ──> [PUBLISHED]
```

Per-state entry conditions (each is a checkable predicate):

1. **SURFACED** — a gap/defect/need exists. If surfaced through *using* the tooling it is an experience gap and MUST NOT be self-adjudicated (CLAUDE.md "Experience-Gap Handling": "Do not file an experience gap, or act on it, from ad-hoc self-investigation").
2. **INVESTIGATED** — an agent (never the orchestrator) has produced root-cause + shape + repro + prior-art search ("Explore before file … a precondition of EVERY filing") + class verdict (`gap-explore-surfaces-class`: "the investigation MUST identify and surface whether the specific gap is an INSTANCE of a more general class"), and has written its own report (`de-ephemeralize-at-source`: "An investigating/exploring agent WRITES ITS OWN report file … The agent's transient return … is a pointer + verdict, not the content").
3. **FILED** — the item is in the substrate via CLI ops (AJV-validated, DispatchContext-stamped), after the provenance ceremony (`filing-provenance`: "the planning-block write guard STOPS the write; the model ends its turn presenting the user a per-element provenance table … the provenance-reviewed sentinel attests the USER's granted permission … never self-review"). Features decomposed per `feature-decomposition`; arcs bound per `gap-arc-coherence`; priority recommended at filing (feedback_substrate_pm). Filing commits immediately (feedback_git_discipline: "committing is part of filing").
4. **GATE-VALIDATED** — for a milestone's first task: fresh-agent strict validation of ALL member filed text (`milestone-validity-gate`, enforcement `manual`: "Findings are corrected through provenance-gated grants BEFORE the milestone's first task enters plan mode").
5. **EXPLORED** — plan mode entered via EnterPlanMode; ALL investigation via Explore agents ("the orchestrator never greps as investigation" — CLAUDE.md step 1; feedback_process_pipeline: "the main context (orchestrator) never greps/reads code itself as the investigation step", scope "BROADER than plan mode"). Explore is read-only; empirical steps go to executing agents (`subagent-dispatch-fit`).
6. **PLANNED** — plan written with only resolved decisions (feedback_plans_and_options: "Plans must contain only resolved decisions"), derivable forks derived not surfaced (`derive-decisions-from-facts`), plan's resolved decisions substrate-written BEFORE ExitPlanMode (feedback_process_pipeline: "plan-mode step 1 … = substrate-write the plan's resolved decisions … ExitPlanMode happens after substrate has the decisions, not before"), user approves via ExitPlanMode.
7. **BASELINED** — `git status --porcelain` clean; task set `in-progress`; feature branch off the porcelain-clean integration branch (`feature-branch-workflow`: "CODE goes on the feature branch … The .context SUBSTRATE stays single-writer on the integration branch — file … BEFORE branching, and run the closure cascade … AFTER the code merges").
8. **IMPLEMENTED** — a foreground coding subagent implements from the approved plan ("The orchestrator never hand-writes source" — CLAUDE.md step 1; feedback: "'Small' is not an exception the orchestrator may grant itself"; ad-hoc orchestrator edits are DISCARDED and redone via subagent). Subagent commits forensically per step; subagent never runs npm (feedback_subagent_execution).
9. **GATED** — orchestrator runs `npm run build`, `npm run check`, `npm test` with full-output inspection ("no pipe-to-tail (pipe masks exit code)").
10. **DEMOED** — real end-to-end runtime invocation of the feature path ("NOT a mocked unit assertion. Tests-pass alone is insufficient" — Completion Sequence step 5).
11. **PROBED** — fresh-context adversarial probe, dispatched separately, never self-audit; orchestrator independently re-verifies the probe's load-bearing claims ("Both the adversarial agent and the orchestrator's own probe can under-flag"; "a fix to any audit/probe finding requires a FRESH re-audit of the fix"; class closure only by empty re-enumeration — feedback_verification_gates). Any finding → back to EXPLORED, scoped to the finding's whole class.
12. **DOCS-SYNCED** — `docs-surface-sync` audit: package README + monorepo README checked-not-appended, op `description`/`promptSnippet` strings, `skill-narrative.md` + `npm run skills`, CHANGELOG `[Unreleased]` grown (usage-only docs; fix framing only in CHANGELOG).
13. **MERGED** — merge to integration branch, `npm run build` (pi loads `dist/`), branch deleted.
14. **CLOSED** — verification item filed + `verification_verifies_item` edge + `complete-task` (the transition atom, `error-invariant-transition-atom`); feature set to its TRUE bucket ("`complete` only when its acceptance criteria are actually met"); status cascade both layers (Task tool + substrate — feedback_completion_and_release); `context-validate` clean; substrate changes committed.
15. **RELEASED** — `npm run release:*`. **HELD**: "no `release:*` and no push/publish without explicit per-release authorization" (CLAUDE.md; feedback_completion_and_release: "the step-11 auto-release is SUSPENDED until the user lifts the hold").
16. **PUBLISHED** — user-only (interactive `npm login` + OTP).

Illegal transitions the harness forecloses: any state skip (SURFACED→FILED without INVESTIGATED; PLANNED→IMPLEMENTED by orchestrator hand-edit; GATED→MERGED without DEMOED/PROBED; PROBED-with-findings→DOCS-SYNCED; CLOSED without verification edge); any backward silent transition (dirty revert — `feature-branch-workflow`: "Reject: checkout the integration branch and delete the feature branch — no reverts, no dirty state"); and any exit from the machine that is not one of the three legitimate stops (§3a).

---

## 2. The current enforcement surface

### 2.1 Mechanical inventory

**Repo hooks** (`.claude/hooks/*`, git-tracked; registered in `.claude/settings.local.json`, which is NOT git-tracked — see §5 R20):

| Hook | Event / matcher | Blocks | Escape |
|---|---|---|---|
| `gap-register-guard.sh` | PreToolUse(Bash) | pi-context append/update/upsert-block-item targeting planning blocks (`framework-gaps|tasks|decisions|features|story|research|issues|conventions`) without the sentinel. Stderr: "This is a USER-PERMISSION stop — do NOT re-issue in this same turn" + the P1–P4 provenance classes + R1–R6 register rules. Exit 2. | trailing `# provenance-reviewed` (line 23: `grep -Eq 'provenance-reviewed'` — a CONSTANT string the agent can self-append; the same-turn prohibition is instruction-only) |
| `block-pi-context-glue.sh` | PreToolUse(Bash) | pi-context CLI output piped anywhere, `2>/dev/null`, for/while loops batching the CLI, stdout redirected to file, echo-narration/`$?` glue. Four regex chokepoints, exit 2, stderr teaches the direct-drive discipline ("friction is a gap to file, not to route around"). | none |
| `block-control-chars.sh` | PreToolUse(Write\|Edit\|NotebookEdit) | raw C0 control chars / DEL in write payloads (jq codepoint test). Exit 2. | none |

**User-level hooks** (`~/.claude/settings.json`):

| Hook | Event | Function |
|---|---|---|
| mandates injection | UserPromptSubmit | `cat ~/.claude/mandates.jsonl … ; if [ -f .claude/mandates.jsonl ] … cat` — injects the 9 mandates into every prompt's context. Project-scoped `.claude/mandates.jsonl` slot exists but the project file is ABSENT. Delivery is mechanical; compliance is honor. |
| `yolo-approve.py` | PermissionRequest | when `.claude/yolo` exists, auto-approves everything not on a blacklist — a permission-widening hook, not an enforcement hook. |
| `plan-archive.sh` | PostToolUse(ExitPlanMode) | archives approved plans — proves PostToolUse can observe/stamp plan approval. |
| `block-sendmessage.sh` | PreToolUse(SendMessage) | blocks SendMessage (no-background-subagents mandate). |

**Husky pre-commit** (`.husky/pre-commit`, 5 lines): `npm run check` → `npm test` → `check-changelog.ts` (published-surface change must grow `[Unreleased]`; derives watch set from package.json `files[]`) → `parity-check.ts` (op↔CLI parity) → `check-config-schema.ts` (non-additive config.schema.json diff needs version advance + migration). Fires only at `git commit`; `--no-verify` is forbidden by convention text only — nothing blocks it, and `Bash(git:*)` is permission-allowlisted in `settings.local.json`.

**Substrate write-path enforcement**: CLI ops → block-api: AJV schema validation, DispatchContext writer stamping, and the write-time invariant gate (`error-invariant-transition-atom` rule 1: "The write-time gate refuses any write that introduces an error-severity violation"). 13 declared invariants (`read-config --registry invariants`), error-severity among them: `completed-task-has-verification` (a task cannot go `completed` through the ops layer without a `verification_verifies_item` edge — `complete-task` is the atom), `decision-cites-forcing-artifact`, `decision/feature/task-articulates-convention`, `verification-passed-task-complete`, `reached-milestone-phases-complete`. Auth-gated ops: `context-switch` (seeded ceremony path; raw `flipBootstrapPointer` forbidden).

### 2.2 Classification of every canonical-process state

| State / rule | Class | Mechanism / hole |
|---|---|---|
| FILED: schema-valid, stamped, invariant-clean writes **via ops** | MECHANICAL | AJV + write-time gate + DispatchContext |
| FILED: provenance = USER grant | PARTIAL | guard fires mechanically; sentinel is a constant string — self-attestation in the same turn is mechanically possible, forbidden only by the stderr text + `filing-provenance` rule 6 |
| FILED: direct `Edit`/`Write` on active-substrate `*.json` forbidden | **HONOR** | no hook matches Write/Edit on `.context/**` — only control-chars runs. The op-layer gate is bypassable by the parallel path (exactly `feedback_architecture_enforcement`'s "no parallel ungated paths": "If the generic API remains unrestricted, the gate is decorative") |
| FILED: explore-before-file, class-surfacing, agent investigation | HONOR | conventions `enforcement: review` |
| GATE-VALIDATED (milestone gate) | HONOR | convention `enforcement: manual` |
| EXPLORED: plan-mode-first, explore-agents-only | HONOR | nothing prevents orchestrator Edit of source or Grep-as-investigation |
| PLANNED: resolved-decisions-only, substrate-write-before-exit, no forks | PARTIAL | filed decisions are structurally forced to be resolved (schema requires `decision/context/consequences`; `decision-shows-derivation` invariant) — but the PRE-filing surface (plan text, chat asks) is unguarded |
| BASELINED: clean tree + feature branch | HONOR | |
| IMPLEMENTED: via foreground coding subagent, per-step commits, no subagent npm | HONOR | brief-level only |
| GATED: check/test/changelog/parity/config-schema at commit | MECHANICAL (at commit) | `--no-verify` unblocked; gates don't run between commits; `npm test \| tail` exit-masking unblocked |
| DEMOED: runtime demo | **HONOR** | nothing observes whether a real invocation ran |
| PROBED: fresh adversarial + orchestrator re-verify + fresh re-audit of fixes + empty re-enumeration | **HONOR** | entirely |
| Findings iterate-to-zero (no deferral) | **HONOR** | mandate-007 injected, nothing checks |
| DOCS-SYNCED | PARTIAL | CHANGELOG mechanical (check-changelog); READMEs/op-strings/SKILL audit honor |
| MERGED + rebuild dist | HONOR | |
| CLOSED: verification + complete-task + true buckets + validate | MECHANICAL **via ops only** | error invariants + `complete-task` atom; same direct-edit hole as FILED |
| Status cascade (Task tool + substrate per step) | HONOR | |
| RELEASED: HELD until authorized | **HONOR** | `Bash(npm run:*)` allowlisted; nothing blocks `npm run release:*` |
| PUBLISHED: user-only | MECHANICAL | OTP interactivity |
| Subagent claims verified before relay | HONOR | |
| Ask gate / no relitigation at turn end | **HONOR** | no Stop hook exists at all |
| Destructive git ops only on direction | **HONOR** | `Bash(git:*)` allowlisted |
| pi-context direct-drive discipline | MECHANICAL | glue hook (Bash chokepoint) |
| Control-char payloads | MECHANICAL | control-chars hook |

Honest-summary: the mechanical surface concentrates at exactly two points — **the substrate op write path** and **the commit boundary**. Everything between user prompt and commit — investigation discipline, plan mode, subagent-primary implementation, runtime demo, adversarial probe, iterate-to-zero, docs audit, status cascade, ask-vs-proceed at turn end, release hold — is honor-system.

---

## 3. Failure modes to foreclose, with their observable signals

Per `feedback_architecture_enforcement`, the threat model for all of these is "a COOPERATIVE but LAZY agent that cuts corners / hedges / handwaves / punts — NOT a malicious adversary"; defenses that only matter against sabotage are over-engineering to strip.

**(a) Relitigation of governed decisions at turn boundaries.** The observed shape (feedback_plans_and_options "pre-send ask gate", two same-day corrections 2026-07-06): "mid-work, conventions are applied without asking; at the END of a work unit, report-composition mode reframes findings as asks." Instances: "on your go", "now or later", "shall I", "want me to" for work already governed by convention/mandate/in-session precedent. User verbatim: "the relitigating of things as though no policies or conventions exist proliferates chaos actively instead of creating actionable clarity."
*Signal:* the final assistant message text (ask-shaped closers) + harness state (is an in-progress task open? is a findings ledger non-empty? did a guard fire this turn?). *Point:* **Stop hook** (receives transcript path; exit 2 blocks ending the turn and feeds stderr back). The three legitimate stops that must PASS the gate: (1) a provenance-gated write awaiting the user's grant; (2) a genuine scope/value judgment underdetermined by cited facts (the `derive-decisions-from-facts` escalation test, failed honestly — and its complement: "never launder genuine scope/value judgments as derived"); (3) an action explicitly HELD (release, publish, unauthorized push). Everything else: "DELETE the ask and do the work."

**(b) Skipped pipeline steps** (ad-hoc fixes bypassing explore/plan/file-first; orchestrator hand-edits; implementation on the integration branch; dirty baseline).
*Signal:* PreToolUse(Edit|Write) on `packages/**` source while: no approved plan this session (observable — `plan-archive.sh` proves ExitPlanMode is stampable), current branch = integration branch (`git rev-parse --abbrev-ref HEAD`), no substrate task `in-progress`, or `git status --porcelain` dirty at declared baseline time. The orchestrator-vs-subagent distinction is also mechanically visible: a subagent session has its own hook context; a phase-state file scoped to the orchestrator session can record "implementation delegated", making orchestrator source-edits blockable while the state says a coding subagent owns the edit.
*Point:* PreToolUse(Edit|Write|MultiEdit) + a phase-state file.

**(c) Self-adjudication of experience gaps** ("working as designed" / instant diagnosis without agent investigation).
*Signal:* weakly observable at tool level; strongly observable at the filing pipeline: a gap filing whose payload carries no investigation artifact (no `analysis/<date>-<slug>.md` citation in evidence, no `research_informs_item`/findings_document). Pre-filing self-adjudication in chat is monitor/review territory (`feedback_architecture_enforcement`: "Reserve 'review/monitor' for genuinely off-substrate artifacts").
*Point:* the gap-register-guard (extend: require an investigation-report path in the payload) + Stop-hook text classifier as nudge; the project's own `invokeMonitor(name, context?)` export is purpose-built for this classification.

**(d) Deferred / dropped findings** (probe or demo surfaces a divergence; it is narrated, labeled "minor/cosmetic/later/out of scope", and the loop is declared converged). Mandate-007; feedback_scope_and_completeness ("audit findings are work to fix"; "nothing is trivial when process is everything").
*Signal:* a findings ledger — every probe/demo/audit finding recorded as an entry that closes only by a task-id or fix-commit; non-empty ledger at merge/close/turn-end is the signal. Deferral vocabulary in filings/plans ("for at least", "later", "polish", "out of scope", "deferred") is a secondary lexical signal.
*Point:* Stop hook (ledger check) + PreToolUse on merge/complete-task (ledger check) + lexical nudge on planning-block payloads and ExitPlanMode plan text.

**(e) Unverified subagent claims relayed** (feedback_subagent_execution: "The user must never be the first verifier"; the probe itself can under-flag).
*Signal:* an Agent tool result containing claim-language ("committed", "passed", "complete", "deviation", "minor", "had to") followed by a final message with no intervening verification tool calls (git log / grep / read-back). Fully mechanical proof is impossible; the sequence-shape is observable.
*Point:* PostToolUse(Agent) — inject a verification checklist as feedback; Stop hook — refuse turn-end when an agent result arrived this turn and zero verification commands ran after it (coarse but laziness-matched).

**(f) Scope reduction** ("at least the 13 definite ones", degraded-state fixes, minimal-release framing). Mandates 004/007; feedback_scope_and_completeness.
*Signal:* lexical markers in plan text and filing payloads ("for at least", "smallest", "minimal", "acceptable subset", "ship without"); structurally, a class-finding closed by a single-instance fix (re-enumeration ledger non-empty).
*Point:* PostToolUse(ExitPlanMode) scan + gap-register-guard payload scan (nudge severity — false-positive-prone, and the threat model forbids punishing legitimate cooperative content).

---

## 4. Enforcement affordances available

**Claude Code hooks** (all patterns proven in this repo or the user config):
- **UserPromptSubmit** — inject text into context every prompt (mandates injection, live). Carries per-turn governance; cannot block.
- **PreToolUse** — see full tool input; exit 2 blocks the call and feeds stderr to the agent (all three repo hooks); regex chokepoints over Bash commands (glue hook); sentinel escapes (`# provenance-reviewed`); "USER-PERMISSION stop" turn-ending semantics (gap-register-guard stderr).
- **PostToolUse** — observe results and stamp state (plan-archive.sh on ExitPlanMode); can inject feedback to the agent.
- **Stop** — currently UNUSED anywhere in this setup; can read the transcript, block turn-end with exit 2 + stderr instruction. This is the only mechanical point that sees the final message — the relitigation/ask failure mode (§3a) lives exactly here.
- **PermissionRequest** — programmatic allow/deny (yolo-approve.py) — i.e., permission decisions are scriptable, including denying by default what settings currently allowlist.
- **SessionStart** — can seed/reset a session phase-state file.

**The substrate as harness state:** task status enum + `in-progress` marker; the write-time gate refusing error-invariant violations; `complete-task` as the only legal completion transition (via ops); relations as evidence edges (`verification_verifies_item`); `context-validate` as an integrity oracle; DispatchContext writer identity distinguishing human/agent/workflow writes; `filter-block-items`/`context-status` as cheap hook-side queries. `feedback_architecture_enforcement`: "the filing act itself is the checkable moment" — required fields + requires-edge invariants encode process rules as data (the `decision-shows-derivation` invariant already encodes "derive, don't fork" structurally).

**A driver/runner:** the repo already runs each workflow step as a subprocess with the main conversation as control plane, and `.claude/skills/run-pi-project-workflows/driver.mjs` exists as a driver precedent. A session driver can own the state machine: mint state transitions into a phase-state file that hooks consult, so hooks enforce "the current tool call is legal in the current state" instead of re-deriving process from scratch.

**Existing gates to build on:** husky's five commit gates; the glue hook's chokepoint style ("its own stdout piped anywhere — a chokepoint, not a tool denylist"); the monitors package's `invokeMonitor` for text classification where regex is too blunt.

---

## 5. Requirements

Design principles binding all requirements:
- **P1 (threat model):** target the lazy cooperative agent; strip any defense that only matters under sabotage (`feedback_architecture_enforcement`). Deterministic checker the agent doesn't control + loop that blocks exit until clean + human ratifier for irreducible judgment; "Engagement and release sit OUTSIDE the agent."
- **P2 (no parallel ungated paths):** every rule is enforced at a chokepoint covering ALL paths to the guarded effect, or it is decorative ("If the generic API remains unrestricted, the gate is decorative").
- **P3 (preserve the three legitimate stops):** the harness must never auto-proceed (1) provenance grants, (2) honestly-underdetermined scope/value escalations, (3) HELD actions. It forecloses everything else that halts.
- **P4 (block vs nudge):** deterministic predicates block (exit 2); lexical/heuristic signals nudge (stderr feedback, non-blocking), because false-positive blocking punishes legitimate cooperative content (P1).
- **P5 (filing pipeline first):** before adding a hook for a substrate-authoring rule, encode it as schema `required` / invariant / edge — the write-time gate already refuses violations mechanically.

### 5.1 Enforceable TODAY (hooks + substrate state as they exist; only new hook scripts needed)

- **R1 — Close the substrate direct-write hole.** Rule: direct `Edit`/`Write`/`NotebookEdit` on the active substrate's `*.json` + `schemas/*.json` is forbidden (CLAUDE.md "Project Blocks"). Signal: tool file_path under the dir named by `.pi-context.json` `contextDir`. Point: PreToolUse(Edit|Write|NotebookEdit). **Block.** Escape: none (repair flows through ops; a genuinely missing op is an FGAP, not a bypass). This converts the op-layer's mechanical gates (AJV, invariants, stamping, complete-task atom) from "strong on one path" to non-bypassable (P2). Also blocks `Read` substitutes for CLI reads only via nudge (read path is discipline, not integrity).
- **R2 — `--no-verify` and destructive-git chokepoint.** Rule: never `--no-verify` (CLAUDE.md Conventions); no `git reset --hard` / `rebase` / `push --force` / `tag -d` / branch-delete-of-unmerged without explicit user direction (feedback_git_discipline). Signal: Bash command regex. Point: PreToolUse(Bash). **Block.** Escape: user-granted sentinel per invocation (same ceremony shape as gap-register-guard, same-turn re-issue forbidden).
- **R3 — Exit-code-masking guard.** Rule: verification-gate commands (`npm test|run check|run build`) never piped/truncated (feedback_verification_gates: "pipe masks npm exit code"). Signal: Bash regex `npm (test|run (check|build|skills)) … \|`. Point: PreToolUse(Bash). **Block.** Escape: none (`set -o pipefail` variants permitted by the regex).
- **R4 — Release/push hold.** Rule: `npm run release:*`, `npm publish`, `git push` (beyond durably-authorized routine push) blocked without explicit per-release authorization (CLAUDE.md: "Releases are HELD"). Signal: Bash regex + absence of a user-minted hold-release flag file. Point: PreToolUse(Bash). **Block.** Escape: the user's explicit authorization, recorded as the flag (P3 stop #3 preserved: the agent stops and asks; the harness makes proceeding-without-grant impossible rather than relying on the agent remembering the hold).
- **R5 — Source-edit gate v1 (branch + plan).** Rule: no source edit on the integration branch; no source edit without an approved plan (pipeline step 1; `feature-branch-workflow`). Signal: Edit/Write path under `packages/**` (excluding tests-fixture dirs the plan names) ∧ (`git rev-parse --abbrev-ref HEAD` = integration branch ∨ no plan-approval stamp this session). Point: PreToolUse(Edit|Write); PostToolUse(ExitPlanMode) writes the approval stamp (plan-archive.sh pattern). **Block.** Escape: user sentinel for genuinely plan-exempt edits (harness files, analysis MDs are path-excluded, not sentinel-escaped).
- **R6 — Same-turn sentinel self-attestation fix.** Rule: `filing-provenance` rule 6 ("re-issuing a guarded write without the user's grant — in the same turn or otherwise — is a violation"). Signal: gap-register-guard fired (write a `guard-fired` marker on block) and a sentinel-bearing re-issue arrives before a turn boundary. Point: PreToolUse(Bash) checks the marker; **Stop hook clears it** (turn genuinely ended = user saw the table). **Block** the same-turn re-issue. Escape: the user's grant in the next user message (the only path that reaches a cleared marker). Note the residue: a next-turn sentinel without an actual textual grant is still honor — closing that fully requires the driver (R13) or user-side ack; per P1 the turn-boundary check is the laziness-matched core.
- **R7 — Filing-completeness at the guard.** Rule: experience-gap filings cite their agent investigation (Experience-Gap Handling; §3c); gap payloads carry the class verdict (`gap-explore-surfaces-class`: "a filed gap whose body does not address the class question is incomplete") and a recommended priority (feedback_substrate_pm). Signal: payload regex/jq over the guarded append (analysis-path citation present; priority field present). Point: extend gap-register-guard. **Block** for missing investigation citation on `framework-gaps`; **nudge** for the lexical class-verdict check. Escape: the provenance ceremony itself (the user can grant a payload the guard questions).
- **R8 — Deferral/scope-reduction lexical scan.** Rule: mandates 004/007; no "later"/"for at least"/"minimal"/"polish"/"out of scope" framings in filings and plans (§3f). Signal: payload/plan text regex. Point: gap-register-guard payload + PostToolUse(ExitPlanMode) plan text. **Nudge** (stderr listing the flagged phrases + the governing mandate; P4 — high false-positive class).
- **R9 — Project mandates file.** Rule: the per-prompt injection slot for project mandates exists and is empty (`if [ -f .claude/mandates.jsonl ]` — file absent). Populate it with the project-shaped mandates (pipeline-first, explore-agents-only, ask-gate three-stops, iterate-to-zero) so every prompt carries them without depending on CLAUDE.md attention. Point: UserPromptSubmit (existing hook). **Nudge by construction** (context, not gate) — but it is the cheap predictable layer under every blocking layer.
- **R10 — Subagent-relay verification nudge.** Rule: orchestrator verifies every subagent claim before relaying (feedback_subagent_execution). Signal: Agent tool result this turn. Point: PostToolUse(Agent) injects the verification checklist ("git log for commit claims, grep for code-presence claims, read-back for filing claims; 'deviation/minor/had to' = hard pause"). **Nudge** (mechanical proof of verification is not derivable; P1 says the reminder-at-the-moment is the laziness-matched form; R12 adds the turn-end backstop).

### 5.2 Requires NEW machinery (phase-state file, Stop-hook gates, findings ledger, driver)

- **R11 — Phase-state file (the keystone).** A machine-readable per-work-unit pipeline state (`.claude/state/pipeline.json` or a substrate-native work-order item): `{taskId, state: SURFACED…CLOSED, branch, planStamp, demoEvidence, probeVerdict, findings[]}`. Transitions minted only by the driver (R13) or by hook-verified events (ExitPlanMode → PLANNED; commit on feature branch → IMPLEMENTED; …). Hooks stop re-deriving process and instead check "is this tool call legal in this state" — the mechanical embodiment of the §1.2 machine. SessionStart hook seeds/reconciles it from substrate truth (`context-status`), never from narrative (derive-don't-cache).
- **R12 — Stop-hook ask gate.** Rule: §3a — every ask in a final message passes the three-stops filter; non-passing asks are relitigation, deleted, and the work proceeds. Signal: transcript final message ask-patterns ("on your go", "now or later", "shall I", "want me to", "when you're ready") ∧ state (guard-fired marker ⇒ stop #1 legitimate; HELD-action pending ⇒ stop #3 legitimate; explicit `decision_escalates_underdetermined`-shaped escalation text ⇒ stop #2 legitimate). Point: **Stop hook**, exit 2, stderr: "this ask fails the three-stops gate — proceed per <convention/mandate id>". Regex first; `invokeMonitor` classification if regex proves too blunt. **Block.** Escapes preserved: exactly the three stops (P3).
- **R13 — Findings ledger + convergence gate.** Rule: iterate-to-zero; a probe/demo finding either closes (fix commit + fresh re-audit entry) or becomes a filed task — never narrated away (§3d). Machinery: findings appended to the phase-state file by the orchestrator as probes/demos return (schema-shaped, mechanical). Gates: PreToolUse(Bash) blocks `git merge` into integration and `pi-context complete-task` while ledger has open entries; Stop hook warns (nudge) on open entries at turn end mid-arc. **Block** at merge/close; **nudge** at turn-end. Escape: the user's explicit deprioritization, recorded on the entry (mandate-007: "User decides scope").
- **R14 — Demo/probe evidence required for closure.** Rule: Completion Sequence 5–6 are load-bearing; CLOSED requires demo + probe evidence, not tests-green. Signal: phase-state carries `demoEvidence` (the actual invocation + output pointer) and `probeVerdict` (fresh-context agent id + verdict) before `complete-task` runs. Point: PreToolUse(Bash) on `complete-task`; longer-term per P5, a verification-schema field (demo command + probe attestation) making the invariant substrate-native. **Block.** Escape: none — a task without a demoable surface takes a user-granted waiver recorded in the verification item.
- **R15 — Orchestrator-implements gate.** Rule: implementation via foreground coding subagent; orchestrator never hand-writes source (pipeline step 1). Signal: state = IMPLEMENTED-delegated ∧ orchestrator-session Edit/Write on `packages/**`. Point: PreToolUse(Edit|Write) consulting phase-state (subagent sessions carry their own hook context, so the block scopes to the orchestrator). **Block.** Escape: user sentinel (explicit direction for an orchestrator-direct edit is the user's to give — mandate-005's "explicit user direction" carve-out).
- **R16 — Investigation-delegation gate.** Rule: ALL investigation via Explore agents; orchestrator Grep/Read of source as investigation is forbidden; the one allowed direct read is re-verifying a subagent's specific claim (feedback_process_pipeline). Signal: orchestrator Grep/Read bursts over `packages/**` while state ∉ {verifying-claim (post-Agent-return window), plan-approved}. Point: PreToolUse(Grep|Read) with state + recency heuristics. **Nudge** (the legitimate re-verification carve-out makes a hard block false-positive-prone; P1/P4). The block-strength form belongs to the driver (R17).
- **R17 — Session driver.** A driver skill/command (precedent: `.claude/skills/run-pi-project-workflows/driver.mjs`; the workflow executor's control-plane/subordinate-subprocess architecture) that walks a work unit through §1.2: prompts the state's required action, dispatches the right agent kind per state (Explore for EXPLORED, general-purpose for IMPLEMENTED, fresh-context for PROBED), runs the npm gates itself, mints phase-state transitions, and refuses out-of-order actions. With R11 it makes the state machine the interface rather than a policy the model recalls. This is the "predictable" half of the directive: hooks make deviation fail; the driver makes compliance the path of least resistance.
- **R18 — Milestone-gate enforcement.** Rule: `milestone-validity-gate` (currently `enforcement: manual`). Signal: first task of a milestone entering PLANNED without a gate-validation record. Machinery: a gate-run record (verification item or phase-state flag) + PreToolUse/driver check at plan approval for milestone-member tasks. **Block** once the record type exists; today it is honor.
- **R19 — Status-cascade completeness.** Rule: per-step dual-layer cascade (feedback_completion_and_release). Signal: commit landed on feature branch ∧ no substrate write within the step window. Point: PostToolUse(Bash git commit) **nudge** listing the cascade checklist; driver (R17) performs it deterministically. Mechanical block is wrong-shaped here (ordering, not integrity).
- **R20 — Track the enforcement wiring.** The hook scripts are git-tracked but their registrations live in untracked `.claude/settings.local.json` — the harness currently exists only on this machine and can silently diverge. Requirement: move hook registrations (and the R1–R16 additions) into tracked `.claude/settings.json`; keep permissions-allowlist local. A non-bypassable harness whose wiring is untracked is a predictability defect. Also: reconcile the `yolo-approve.py`/`.claude/yolo` auto-approve path with the harness — a blanket PermissionRequest auto-allow under a blacklist is a standing parallel ungated path if enabled in this project (P2); the harness must either disable it here or fold its blacklist into the R2/R4 chokepoints.

### 5.3 What the harness must PRESERVE (the three legitimate stops)

1. **Provenance grants** — the gap-register-guard ceremony stays; R6 hardens it. The USER's grant is the only path to a planning-block write; the harness must never auto-grant, and R12 must classify a pending provenance table as a legitimate turn-end.
2. **Genuine scope/value escalations** — `derive-decisions-from-facts` rule 2 + "don't launder scope judgment as derived": a choice honestly underdetermined by cited facts goes to the user, and the structural encoding already exists (`decision_escalates_underdetermined`). R12's gate must pass an ask that names why the choice is underdetermined.
3. **HELD actions** — release/publish/push holds: R4 makes the hold mechanical; the ask "authorize release?" is a legitimate stop; proceeding without the grant becomes impossible rather than impolite.

Everything else that halts, forks, defers, re-asks, or self-adjudicates is foreclosed by R1–R19.

---

## 6. Verdict

The canonical process is a single-track state machine per atomic task — SURFACED → INVESTIGATED → FILED(provenance) → GATE-VALIDATED → EXPLORED → PLANNED → BASELINED → IMPLEMENTED(subagent) → GATED → DEMOED → PROBED → (findings loop, class-scoped) → DOCS-SYNCED → MERGED → CLOSED → [HELD: RELEASED → PUBLISHED] — with three and only three legitimate exits to the user. Current mechanical enforcement covers exactly two chokepoints (the substrate op write path with its AJV/invariant/atom gates, and the husky commit boundary) plus three PreToolUse guards; the biggest honor-system holes are: direct Edit/Write on substrate JSON (the op gates' parallel ungated path), the entire verify layer (runtime demo, adversarial probe, iterate-to-zero, subagent-claim verification), plan-mode/subagent-primary implementation discipline, the release hold, and — the observed chaos driver — the absence of any Stop-hook ask gate, so relitigation at turn boundaries is currently unobserved by any mechanism. Roughly half the requirement set (R1–R10) is enforceable today with new hook scripts over existing affordances; the load-bearing remainder (R11–R17: phase-state file, Stop-hook ask/convergence gates, findings ledger, session driver) needs the new state layer that lets hooks check "is this action legal in this state" instead of re-deriving process per call.
