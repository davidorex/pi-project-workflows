# Loop-runaway policy determination — wave 3b (TASK-135 / TASK-137), session d3030496

Determination of (1) which binding policy text licensed the wave-3b audit/fix runaway and (2) the exact before→after text changes that make recurrence a policy violation rather than a judgment call. All session claims below are anchored to the claude-history record of session `d3030496-e4e1-4bfa-8df1-1df86bac518a` (timestamps given in Asia/Shanghai, UTC in parens). Thinking blocks in the record are redacted (empty in DB); the orchestrator's visible per-turn status texts and the verbatim dispatch briefs are the decision-point evidence.

---

## 1. What happened — the decision-point timeline

### Cost (from token_usage, grouped by agent_id; figures are cache_creation_input + output per agent)

11 audit agents: 4,945,230 cache-create + 364,212 output. 8 fix agents: 2,580,328 cache-create + 172,164 output. Total wave-3b audit+fix layer: **~7.5M cache-creation input tokens + ~536k output tokens across 19 subagents**. Per audit round: 321k–530k cache-create (one 1.1M outlier — the re-run after an API death). Everything after each branch's first fix round: **~4.18M cache-create (9 audits) + ~2.0M cache-create (6 fixes)**.

### TASK-135 (`feat/task-135-preview-parity`) — 6 audits, 4 fixes

| # | Local time (UTC) | Dispatch (tool_executions id) | Findings returned / acted on | Tier mix |
|---|---|---|---|---|
| A1 | 14:03 (06:03) | audit (428950) | H1 doc over-claims (README "refuses exactly what the live run refuses"), M1a upsert wording, L1 duplicated throw-prefix literals | 1H / 1M / 1L — docs + one code dedup |
| F1 | 14:24 (06:24) | fix (429014) | fixes H1/M1a/L1 | — |
| A2 | 14:34 (06:34) | re-audit (429075) | L-1 (three source comments), I-2 (op-string "full") | **LOW + INFO only** |
| F2 | 14:48 (06:48) | fix (429159) | fixes L-1/I-2 "including a class sweep" | — |
| A3 | 14:59 (06:59) | re-audit (429230) | H-1 edge-op "reject(s) identically" false on stock catalog (op description strings — authority surface), L-1, L-2 | 1H / 2L |
| F3 | 15:13 (07:13) | fix (429335) | fixes H-1/L-1/L-2 across six carriers | — |
| A4 | 15:23 (07:23) → re-run 15:42 (07:42) | re-audit (429415, died on API error; 429500 re-dispatched same brief) | M-1 (CHANGELOG [Unreleased] clause), L-1 + L-2 (test-file comments), I-2 | **M/L/I — all non-authority text** |
| F4 | 16:10 (08:10) | fix (429538) "meaning-sweep" | fixes M-1/L-1/L-2/I-2 + 4 self-caught variants | — |
| A5 | 16:23 (08:23) | re-audit (429578) | one LOW — "byte-identical … on the same inputs" quantifier false in one doubly-invalid corner | **1 LOW** |
| F5 | 16:39 (08:39) | fix (429622) per-check quantifier rescope | — | — |
| A6 | 16:46 (08:46) | re-audit (429652) | zero → merge 16:58 (08:58) | — |

### TASK-137 (`feat/task-137-residue-docs`) — 4 audits, 3 fixes

| # | Local time (UTC) | Dispatch | Findings | Tier mix |
|---|---|---|---|---|
| A1 | 13:30 (05:30) | audit (428777) | F1–F3, F5, F6 doc claims (incl. a false FILED-text claim → user-granted amendment) | doc-claim mix |
| F1 | 14:40 (06:40) | fix (429099) | — | — |
| A2 | 14:50 (06:50) | re-audit (429176) | NEW-1 HIGH, NEW-2 MEDIUM (fix over-corrected into exclusive under-claims on skill-narrative/SKILL), NEW-3/NEW-4 LOW, INFO(i) | 1H / 1M / 2L / 1I |
| F2 | 15:00 (07:00) | fix (429247) | — | — |
| A3 | 15:11 (07:11) | re-audit (429322) | F-1 MEDIUM (promptSnippet "authored bucket" — the one carrier the class fix missed), F-2 LOW, INFO-ii | 1M / 1L / 1I |
| F3 | 15:19 (07:19) | fix (429382) | — | — |
| A4 | 15:26 (07:26) | re-audit (429441) | zero → merge 15:32 (07:32) | — |

User verdicts: 17:32 (09:32) "That's an insane mismanagement of judgment and cost."; 18:09 (10:09) "Again, intolerably wasteful. …"

### Was each re-dispatch REQUIRED, PERMITTED, or policy-silent?

Every one of the 17 post-A1 dispatches was **REQUIRED by policy as written** — none was merely permitted, and surfacing instead of re-dispatching was itself framed as a violation:

- Every fix dispatch (any tier): required by CLAUDE.md autonomous-loop — "A finding from the audit/probe is work the loop closes autonomously, scoped to the finding's whole class, not an issue handed to the user" — reinforced by the scope-and-completeness memory tier ("audit findings are work to fix"; "nothing is trivial").
- Every fresh full re-audit after every fix (any tier of fix): required by mandate-p04 ("A fix does not inherit the prior green -- it requires a fresh adversarial re-audit before being declared closed") and Completion Sequence step 6 ("a fix to **any** audit/probe finding requires a FRESH re-audit of the fix").
- Continuation past LOW-only rounds (135 A2→F2, A5→F5; 137 A3→F3 tail): required by the tier-blind terminator "done ≡ (deterministic gate exit 0) AND (adversarial-audit findings == 0)" — a single LOW keeps the loop open with the same force as a CRITICAL.
- Stopping was foreclosed: "surfaces to the user ONLY at a genuine LLM-judgement fork … or the iteration cap" + "handing a policy-determined fix to the user instead of looping it is the mandate-008 misread this exception forecloses" + mandate-p03 ("resolve it by acting, not asking"). As written, **the wasteful continuation was the compliant path and terminating early was the violation.**
- Policy-SILENT points (the three degrees of freedom that set the spend per round): (a) the "hard iteration cap" is named in CLAUDE.md but **no number exists anywhere** — grep of CLAUDE.md, the mandates file, and the full conventions block confirms no cap value is defined, so the cap was unenforceable; (b) re-audit SCOPE is unspecified, and the orchestrator's briefs defaulted every round to branch-wide (A4 brief: "determine whether it is FINALLY closed branch-wide"; A5 brief scope item 3: "your own branch-wide MEANING-level sweep: read every sentence about dryRun/preview behavior in both packages (src incl. tests, both CHANGELOGs' [Unreleased] sections, both READMEs, root README, skill-narrative, SKILL.md)"); (c) fix-brief composition is unspecified — fixes re-composed register sentences instead of copying canonical ones, and the re-composition itself generated the next round's findings (137 NEW-1 HIGH was the F1 fix "over-correcting into the opposite defect"; 135 A3's H-1 and A4's M/L set were carriers the previous "whole-class" sweep missed or variants the fix introduced).

Honest tier picture: not every post-round-1 finding was LOW — 135 A3 (H-1 on op description strings) and 137 A2 (NEW-1 HIGH on skill-narrative/SKILL) were authority-surface catches with real value. But both were products of the loop's own mechanics (a missed carrier from a "whole-class" sweep; a defect the previous fix introduced by re-composing), and rounds 135 A2/A4/A5 and 137 A3 were LOW/comment/CHANGELOG-tier rounds that each bought a fresh 250–530k-token full-scope audit + a fix agent.

### The self-feeding structure

Four interacting rules made the loop generate its own inputs: (1) tier-blind zero-findings terminator + (2) fresh FULL re-audit mandatory after ANY fix + (3) briefs instructing a branch-wide (later meaning-level) sweep EVERY round — fresh eyes on the whole branch's prose reliably return something — + (4) fixes re-composing sentences, minting new variants for the next sweep to find. With no cap number and surfacing prohibited, termination required a round to find literally nothing — an asymptote for prose, as the retrospective memory rule now states ("prose can always be found subtly improvable; code behavior can't").

---

## 2. The licensing sentences — exact text, exact mechanism

**L1 — CLAUDE.md, "Autonomous-loop authorization" paragraph (line 100):**
> "`done ≡ (deterministic gate exit 0) AND (adversarial-audit findings == 0)`"

Mechanism: tier-blind terminator. A LOW comment finding and a CRITICAL behavior defect hold the loop open identically.

**L2 — same paragraph:**
> "Autonomous re-dispatch of a FRESH agent (a fix agent, then a fresh adversarial re-audit) IS permitted and REQUIRED iff the loop terminates on a DETERMINISTIC gate … AND a SEPARATE fresh adversarial audit (not the implementer) reaches zero findings; it is bounded by a hard iteration cap, on hitting which the orchestrator STOPS and escalates per `mandate-008`."

Mechanism: "REQUIRED" makes every re-dispatch mandatory; "a hard iteration cap" has no number defined on any surface — a cap that binds nothing.

**L3 — same paragraph:**
> "A finding from the audit/probe is work the loop closes autonomously, scoped to the finding's whole class, not an issue handed to the user; handing a policy-determined fix to the user instead of looping it is the mandate-008 misread this exception forecloses."

Mechanism: makes surfacing low-tier residue a named policy violation. The one action that would have stopped the waste was the one the text forbade.

**L4 — CLAUDE.md pipeline steps 3–4 (lines 94–95):**
> "**Iterate to zero — every finding re-enters this same pipeline.** A divergence/defect surfaced by verify or the probe goes back through explore → plan → approve → agent, scoped to the finding's whole **class** …" / "A fix does NOT inherit the prior green: re-run the runtime demo + a FRESH adversarial re-audit of the fix specifically. Loop 2→3→4 until a pass finds nothing new."

Mechanism: "every finding" (tier-blind) × "whole class" (forces branch-wide scoping) × "until a pass finds nothing new" (asymptotic terminator for prose).

**L5 — CLAUDE.md Completion Sequence step 6 (line 117):**
> "a fix to any audit/probe finding requires a FRESH re-audit of the fix (a CRITICAL especially) … Loop fix→re-verify→re-audit until a pass finds nothing new."

Mechanism: "any" makes a comment-tier text fix buy the same fresh full audit as a behavior fix.

**L6 — mandate-p04, `.claude/mandates.jsonl` line 4 (injected every turn):**
> "A divergence or defect surfaced by verification re-enters the pipeline scoped to its whole class. A fix does not inherit the prior green -- it requires a fresh adversarial re-audit before being declared closed."

Mechanism: the always-injected tier-blind form of L4+L5; the orchestrator cited exactly this rule shape at every fix→re-audit hand-off ("Gates at HEAD, then its fresh re-audit" — 15:10, 15:25 etc.).

**L7 — `.context` conventions, `docs-surface-sync` item, rule 6 (composed verbatim into every surface-change brief):**
> "A brief that lacks it is incomplete; an adversarial probe that finds stale docs is an unconverged iterate-to-zero loop, not an acceptable residue."

Mechanism: elevates any stale-text finding — including comments/CHANGELOG prose in practice — to loop-blocking status. Both wave-3b tasks were docs/text tasks; this sentence made their text residue structurally indistinguishable from behavior defects.

**L8 — the memory tier (interacting, not primary):** scope-and-completeness ("audit findings are work to fix", "nothing is trivial…", "the class is the goal, not the token pattern that found it" — the last one directly motivated the meaning-level branch sweeps of rounds A4–A6) and verification-gates ("class fix closed only by empty re-enumeration"; "expect multiple passes; treat each new residual as the process working, not failure"). These reinforce continuation and contain no spend bound. `feedback_loop_economics.md` (filed retrospectively from this session) now carries the counter-rule, but memory is recall-dependent guidance — the binding surfaces themselves must carry the bound.

---

## 3. Exact changes — before → after

The changes below introduce one shared vocabulary (finding tiers), one hard number (audit-round cap), one scope rule (delta+class re-audits), and one terminal action (low-tier-only ⇒ one scoped fix + delta verification + surface). Iterate-to-zero is preserved in full for code behavior and authority surfaces.

### 3.1 CLAUDE.md — new binding vocabulary block (insert immediately before the "Autonomous-loop authorization" paragraph)

**Add:**

> **Finding tiers (binding vocabulary for the loop).** *Authority surfaces*: op `description`/`promptSnippet` strings in ops-registry.ts, `skill-narrative.md`/SKILL.md, package + monorepo READMEs — text composed verbatim into agent contexts — plus filed substrate text. *Material finding*: any finding against code behavior (source, test assertions, gate scripts), or a finding of MEDIUM severity or above on an authority surface. *Low-tier finding*: LOW/INFO findings, and ANY-severity finding whose only carriers are source/test comments, CHANGELOG prose, commit messages, or other non-authority text. Tier is determined by carrier + severity as filed by the audit; the orchestrator may promote a finding to material, never demote one.

### 3.2 CLAUDE.md — pipeline step 3 (line 94)

**Before:**
> **Iterate to zero — every finding re-enters this same pipeline.** A divergence/defect surfaced by verify or the probe goes back through explore → plan → approve → agent, scoped to the finding's whole **class** (Explore enumerates the class; fix the class, not the one symptom).

**After:**
> **Iterate to zero on material findings — every MATERIAL finding re-enters this same pipeline.** A material divergence/defect surfaced by verify or the probe goes back through explore → plan → approve → agent, scoped to the finding's whole **class** (Explore enumerates the class; fix the class, not the one symptom). A round whose findings are ALL low-tier terminates the loop instead: ONE scoped fix pass (canonical sentences copied verbatim, both claim directions verified before writing), delta-scoped verification of the fixed hunks — never a further full-scope round — then the residue and verdict are surfaced to the user as the loop's terminal report. Low-tier findings are still fixed (this governs spend shape, never scope); dispatching another full-scope audit round on low-tier-only findings is a policy violation.

### 3.3 CLAUDE.md — pipeline step 4 (line 95)

**Before:**
> **Re-verify the fix — fresh, non-inherited.** A fix does NOT inherit the prior green: re-run the runtime demo + a FRESH adversarial re-audit of the fix specifically. Loop 2→3→4 until a pass finds nothing new.

**After:**
> **Re-verify the fix — fresh, non-inherited, delta-scoped.** A fix to a material finding does NOT inherit the prior green: re-run the runtime demo + a FRESH adversarial re-audit scoped to the fix's delta plus the finding's class — never a repeat branch-wide sweep (a branch-wide meaning-level sweep runs in the FIRST audit only; at most one more at declared convergence). A fix whose findings were all low-tier gets delta verification per step 3, not a fresh audit. Loop 2→3→4 until a pass finds no material finding, within the hard three-audit cap below.

### 3.4 CLAUDE.md — "Autonomous-loop authorization" paragraph (line 100), three sentence replacements

**Before (a):**
> … AND a SEPARATE fresh adversarial audit (not the implementer) reaches zero findings; it is bounded by a hard iteration cap, on hitting which the orchestrator STOPS and escalates per `mandate-008`.

**After (a):**
> … AND a SEPARATE fresh adversarial audit (not the implementer) reaches zero MATERIAL findings; it is bounded by a hard cap of THREE audits per branch per task (the initial audit + at most two re-audits) — dispatching a fourth audit on a branch autonomously is a policy violation, not a judgment call; on reaching the cap with material findings still open the orchestrator STOPS and escalates per `mandate-008`.

**Before (b):**
> `done ≡ (deterministic gate exit 0) AND (adversarial-audit findings == 0)`.

**After (b):**
> `done ≡ (deterministic gate exit 0) AND (zero material findings in the latest audit) AND (any low-tier residue fixed in one scoped pass, delta-verified, and surfaced in the terminal report)`.

**Before (c):**
> A finding from the audit/probe is work the loop closes autonomously, scoped to the finding's whole class, not an issue handed to the user; handing a policy-determined fix to the user instead of looping it is the mandate-008 misread this exception forecloses.

**After (c):**
> A MATERIAL finding from the audit/probe is work the loop closes autonomously, scoped to the finding's whole class, not an issue handed to the user; handing a policy-determined material fix to the user instead of looping it is the mandate-008 misread this exception forecloses. The converse binds identically: a round returning ONLY low-tier findings is the diminishing-returns signal and MUST be surfaced in the SAME turn it appears — one scoped fix + delta verification, then the terminal report; continuing full-scope past it is the same class of violation as skipping a required re-audit. The loop's legitimate surfacing points are therefore three: a genuine LLM-judgement fork (scope/value/authority, e.g. a HELD merge or release), the three-audit cap, and the low-tier-only termination.

(The existing "surfaces to the user ONLY at a genuine LLM-judgement fork … or the iteration cap" clause earlier in the paragraph gains "or the low-tier-only termination" — without this, mandate-p03's ask-gate reading of surfacing-as-relitigation re-licenses the runaway.)

### 3.5 CLAUDE.md — Completion Sequence step 6 (line 117)

**Before:**
> When either finds a defect, fixing it does NOT inherit the prior green — **a fix to any audit/probe finding requires a FRESH re-audit of the fix** (a CRITICAL especially), because the fix can introduce its own defect or close only the reported instance of a class. Loop fix→re-verify→re-audit until a pass finds nothing new.

**After:**
> When either finds a defect, fixing it does NOT inherit the prior green — **a fix to a MATERIAL audit/probe finding requires a FRESH re-audit of the fix** (a CRITICAL especially), scoped to the fix's delta plus the finding's class, because the fix can introduce its own defect or close only the reported instance of a class. A fix whose findings were all low-tier gets delta-scoped verification (the fixed hunks read against the findings), not a fresh audit. Text-fix briefs instruct: copy the canonical register sentence verbatim rather than re-composing, and verify the claim in BOTH directions before writing (re-composition and one-directional correction each mint the next round's findings). Loop fix→re-verify→re-audit until a pass finds no material finding, within the three-audit cap.

### 3.6 mandate-p04 — `.claude/mandates.jsonl` line 4

The file header of record states its content "was already approved by the user in plan-mode review; write it verbatim" — this change therefore requires an explicit user grant before writing.

**Before (rule field):**
> A divergence or defect surfaced by verification re-enters the pipeline scoped to its whole class. A fix does not inherit the prior green -- it requires a fresh adversarial re-audit before being declared closed.

**After (rule field):**
> A material divergence or defect surfaced by verification -- code behavior, or MEDIUM+ on an authority surface -- re-enters the pipeline scoped to its whole class. A fix to a material finding does not inherit the prior green -- it requires a fresh adversarial re-audit scoped to the fix's delta plus the finding's class, within the hard cap of three audits per branch per task. A round returning only low-tier findings (LOW/INFO, or any finding carried solely by comments, test comments, CHANGELOG prose, or commit messages) terminates the loop: one scoped fix, delta verification, surface the residue -- a further full-scope audit round violates this mandate.

### 3.7 `.context` conventions — amend `docs-surface-sync` rule 6 (via `update-block-item`, user grant per filing authority)

**Before (final sentence of rule 6):**
> A brief that lacks it is incomplete; an adversarial probe that finds stale docs is an unconverged iterate-to-zero loop, not an acceptable residue.

**After:**
> A brief that lacks it is incomplete. An adversarial probe that finds a stale statement on an authority surface (op description/promptSnippet, SKILL/skill-narrative, README) is an unconverged iterate-to-zero loop; stale text whose only carriers are comments, test comments, or CHANGELOG prose is low-tier residue — fixed in one scoped pass with delta verification and surfaced in the terminal report, never a trigger for a further full-scope audit round.

### 3.8 `.context` conventions — NEW convention item to file (via `append-block-item`, user grant)

**id:** `loop-round-budget`  **enforcement:** review  **severity:** error

**description (verbatim proposed):**
> Iterate-to-zero spend is bounded per branch per task; the bound is hard, not judgment. Apply at every audit/fix dispatch inside the autonomous loop.
> 1. Tiers: a MATERIAL finding is code behavior, or MEDIUM+ on an authority surface (op description/promptSnippet, SKILL/skill-narrative, READMEs, filed substrate text). A LOW-TIER finding is LOW/INFO, or any-severity text whose only carriers are comments, test comments, CHANGELOG prose, or commit messages. Promote-only: the orchestrator may raise a finding's tier, never lower it.
> 2. Cap: at most THREE audits per branch per task run autonomously — the initial audit plus two re-audits. A fourth audit dispatch requires the user's in-session authorization. On cap with material findings open: STOP, escalate.
> 3. Scope: the FIRST audit sweeps branch-wide (meaning-level). Every re-audit is scoped to the fix's delta plus the finding's class. At most one additional branch-wide sweep, at declared convergence.
> 4. Termination: a round whose findings are all low-tier ends the loop — one scoped fix pass, delta verification of the fixed hunks, terminal report to the user naming the residue. Continuing full-scope past a low-tier-only round is a violation, equal in kind to skipping a required re-audit.
> 5. Text-fix briefs: copy canonical register sentences verbatim, never re-compose; verify each corrected claim in both directions before writing. Re-composition and one-directional correction are the loop's own finding generators.
> 6. Parallel branches: identical finding classes are batched into one fix pass + one audit across branches, never fixed per-branch in parallel rounds.
> 7. Surface the diminishing-returns signal the round it appears, in-flight, never in a retrospective.
> 8. This bounds spend shape only — low-tier findings are still fixed (one pass) and never dropped; it is not scope reduction.

### 3.9 Why CLAUDE.md must carry this rather than memory

`feedback_loop_economics.md` already states the proportionality rule, but memory files are recall-dependent guidance loaded per-session and are not part of the always-injected mandate/CLAUDE.md surface the orchestrator cited at each decision point. Every decision point in section 1 shows the orchestrator following the injected surfaces (CLAUDE.md loop text + mandate-p04) — so the tier vocabulary (3.1), the cap number (3.4a), the low-tier terminator (3.2/3.4c), and the delta-scope rule (3.3) must live in CLAUDE.md + mandates.jsonl + the conventions block, where they are structurally present in every turn and every composed brief. The memory rule then remains as reinforcement, not as the sole carrier.

---

## 4. Other enabling surfaces and their exact fixes

**4.1 Audit-brief scope instruction (orchestrator-authored, no template file).** Every wave-3b re-audit brief instructed a branch-wide sweep: A4 "determine whether it is FINALLY closed branch-wide"; A5 "THE deciding leg — your own branch-wide MEANING-level sweep: read every sentence about dryRun/preview behavior in both packages (src incl. tests, both CHANGELOGs' [Unreleased] sections, both READMEs, root README, skill-narrative, SKILL.md)". Branch-wide prose sweeps by fresh agents reliably return new low-tier findings — this is the round generator. Fix: convention rule 3 (3.8) + CLAUDE.md step 4 (3.3) make delta+class the required re-audit scope; a re-audit brief containing a branch-wide sweep instruction outside the first audit / declared-convergence slots is an incomplete brief.

**4.2 Fix-agent re-composition.** 137's round-2 HIGH (NEW-1) was the round-1 fix "over-correcting into the opposite defect: its replacement sentences use exclusive negatives … that deny detection paths validate actually has" (orchestrator text, 15:01 local). 135's rounds 4–5 chased "gerund forms, accept-direction clauses, CHANGELOG entries" minted by earlier rewrites. Fix: convention rule 5 (3.8) + the copy-canonical/both-directions sentence added to Completion Sequence step 6 (3.5).

**4.3 Absence of a per-branch audit-round budget.** The cap was named but numberless on every surface (confirmed by grep of CLAUDE.md, mandates.jsonl, and the full 19-item conventions block — no cap value exists anywhere). Fix: the number THREE, stated identically in CLAUDE.md (3.4a), mandate-p04 (3.6), and the new convention (3.8), with the fourth dispatch defined as a violation requiring in-session user authorization — a form the orchestrator cannot re-interpret.

**4.4 mandate-p03 / ask-gate interaction.** "Resolve it by acting, not asking" + the autonomous-loop's "surfaces to the user ONLY at …" jointly framed early surfacing as relitigation. Fix: 3.4c names the low-tier-only termination as a legitimate surfacing point; no change to mandate-p03 itself is needed (the terminal report is a report, not an ask).

**4.5 Memory-tier reinforcers.** scope-and-completeness ("the class is the goal, not the token pattern") and verification-gates ("expect multiple passes; treat each new residual as the process working, not failure") remain correct for material findings and need no text change once the binding surfaces carry the tier split — loop-economics' own "Related" note already records the reconciliation: spend shape, never scope reduction.

---

## Authorization notes

- CLAUDE.md edits (3.1–3.5): tracked file, normal edit + forensic commit.
- mandates.jsonl (3.6): content is user-approved-verbatim by record — requires explicit user grant before rewriting.
- Conventions amend + new filing (3.7, 3.8): substrate writes via `update-block-item` / `append-block-item` with `--writer` identity; conventions carry filing authority — file under user grant, then `context-validate`.
- Nothing in this report was committed; the file is the only write performed.
