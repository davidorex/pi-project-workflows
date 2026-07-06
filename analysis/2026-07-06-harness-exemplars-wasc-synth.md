# Harness exemplars: WASC phase-pipeline vs SYNTH mechanical work-harness

Characterization of two prior harness implementations, as input to designing a non-bypassable process harness for pi-project-workflows. Read-only investigation, 2026-07-06. All claims anchored to files read directly; quotes are verbatim.

Exemplars:
1. `/Users/david/Projects/wasc-school-wide-improvement-plan` (WASC) — "first model of harness"
2. `/Users/david/Projects/MUSE/SYNTH` (SYNTH) — the variant

---

## Exemplar 1 — WASC: deterministic prompt-rendering phase pipeline + CI-as-commit-gate

### Shape

**Unit of enforced work: the phase.** 16 self-contained phase directives (`phases/phase-00-foundation.md` … `phase-15-final-validation.md`), each executed by one IMPL subagent and optionally checked by one AUDIT subagent. Canonical process lives in three text artifacts, each with a declared non-overlapping role (`phases/PHASE-LAUNCH-CHECKLIST.md:117-124`):

> "It is NOT the source of truth for phase content (that's `phases/phase-NN-{slug}.md`). It is NOT the source of truth for binding patterns (… those live in `phases/00-preamble.md`). It is NOT a per-phase progress log (that's `ORCHESTRATOR-STATE.md`). … It is the operational procedure the orchestrator follows."

**Sequencing is the orchestrator LLM following a codified checklist, feeding subagents prompts built by a deterministic renderer.** The renderer `bin/render-phase-prompt.sh` is explicitly judgment-free:

> "Behavior: cat + sed substitution. No judgment. No LLM. Deterministic." (`bin/render-phase-prompt.sh:20`)

It assembles `templates/impl-static.md` (role + working dir + inlined `MANDATES.md` + stop-on-deficiency + pre-commit check list + commit rules) + the phase MD wrapped in `<phase_content>` + `templates/begin-block.md` ("Read <phase_content>. Execute the numbered steps and Layer additions in order. Commit."). AUDIT mode structurally forces ordering — it refuses to render unless the IMPL prompt was rendered first:

> `error: audit mode requires prior-rendered IMPL prompt at: $impl_prompt` (`bin/render-phase-prompt.sh:122`)

The IMPL/AUDIT role split is a compiled-in behavioral contract, not convention. IMPL: "Execute the numbered dev steps and Layer A/B/C additions in <phase_content> verbatim" plus a hard-stop clause (`templates/impl-static.md:15`): "If the phase content or any spec it depends on is not specific enough to execute without interpretation … STOP. Do not guess. Do not proceed." AUDIT: "Audit what the IMPL subagent did … You may not edit code" and must end with a machine-parsed line (`templates/audit-static.md:45-49`): "End with one line exactly: `Total findings: {N}` The orchestrator parses this line literally."

**GO/NO-GO is computed, not judged** (`CLAUDE.md:121`): "You compute GO/NO-GO from AUDIT's `Total findings: N` line deterministically: count > 0 → NO-GO; count == 0 → GO-RECOMMENDED."

### Enforcement points

Four PreToolUse(Bash) hooks in `.claude/settings.json` make specific actions mechanically impossible (deny JSON / exit 2, reason fed back to the model):

1. **Commit gate = the full CI suite runs inside the hook** (`.claude/hooks/gate-before-commit.sh`): "deny any `git commit` unless the full project gate passes. Gate = the CI step set: ruff check + ruff format --check + mypy . + pytest + make test-js". A red step returns `permissionDecision:"deny"` with the failing tail. Committing on red is impossible, not discouraged.
2. **One Bash call per turn** (`.claude/hooks/one-bash-per-turn.js`): counts `Bash` tool_use blocks in the last assistant transcript message; N>1 → exit 2 for every sibling. Rationale in-file: "Batching is the recurring failure … This guard is deterministic under parallel firing: at PreToolUse time the full assistant message … is already written to the transcript."
3. + 4. **Direct-drive discipline guards** (`block-pi-context-glue.sh`, `block-state-mjs-glue.sh`): block piping the state CLI through `grep/jq/sed/awk/head/tail/…`, silencing stderr, shell loops, stdout-redirect dump-then-read, echo banners / `$?` capture, and (state.mjs) any `;`/`&&`/`||` chaining. Each deny message re-teaches the rule: "friction is a gap to file, not to route around."

**State recording:** originally two MD files — `ORCHESTRATOR-LOG.md` "the **append-only event spine**: one immutable line per event … never rewritten" and `ORCHESTRATOR-STATE.md` "the derived synthesis … reproducible from (1)+(2)" (`ORCHESTRATOR-STATE.md` header) — later decomposed to JSON driven only through an accessor script (`CLAUDE.md:7-11`): "Direct `Edit`/`Write`" is replaced by "`state.mjs` (read / filter / tail / append / upsert …)" and "The event spine is append-only — correct a prior row by appending a new row, never by rewriting." Current focus is a query, not prose (`CLAUDE.md:13`): "**Current focus / next step — runnable, never static:** `node context-migration/scripts/state.mjs filter ORCHESTRATOR-STATE.pending-actions.json status eq open`".

**Verification of step completion:** mechanical where it can be — exit codes of the eight-command gate, plus the literally-parsed `Total findings: N`. Structural where the substrate allows — "A completed task with no verification edge fails `context-validate` (the `completed-task-has-verification` invariant) — so the audit's verification is structurally required to mark a task done" (`CLAUDE.md:32`). Behavioral elsewhere: "Verify, don't narrate: after every context update, RE-RUN the session-start queries … The JSON is the source of truth; state is read back from the scripts, never asserted from working memory" (`CLAUDE.md:128`).

**Mandates as a per-prompt constant:** 9 mandates (`MANDATES.md`) — "binding on every subagent invoked in this project. They are enforced by the AUDIT subagent and by orchestrator-side discipline. Violations are findings." Inlined into every rendered prompt at render time AND injected into every orchestrator turn by the user-global `UserPromptSubmit` hook (`~/.claude/settings.json`: `cat ~/.claude/mandates.jsonl …; if [ -f .claude/mandates.jsonl ]; then cat .claude/mandates.jsonl; fi`).

### Bypass surface

- The sequencing itself is honor-system: nothing mechanically forces the orchestrator to render before dispatching, to dispatch AUDIT at all, or to follow PHASE-LAUNCH-CHECKLIST order. Only the commit is hard-gated.
- AUDIT's count is produced by an LLM; a lazy audit that under-finds passes the deterministic parse. Mitigation is role design (findings are "observable facts" with mandatory evidence pointers, "No severity grades") not mechanism.
- Escape hatch policy is textual: "No `--no-verify`" lives in the IMPL template commit section (`templates/impl-static.md:49`), not in a hook (a `--no-verify` still passes the PreToolUse commit gate since the hook itself is the gate — but nothing blocks `git -c core.hooksPath=… ` style evasions of *repo* hooks; the Claude-hook gate fires regardless of git flags, which is the stronger placement).
- Human authority is a stated boundary, not enforced: "You may not declare a phase complete. Only the human does." / "You may not edit code an IMPL subagent produced unless the human explicitly directs the edit" (`CLAUDE.md:116-118`).

### Operator experience

Human approves the per-phase plan (plan mode), then watches: "the per-phase gate is automated only — no human Part B between phases. Human evaluation + data population happen in a single post-Phase-15 pass" (`PHASE-LAUNCH-CHECKLIST.md:41`). Deviation handling routes upward: "If a subagent returns an issue, STOP. Report to the user. The user decides the next action" (mandate-008). Bounded autonomy was added late and carefully (`CLAUDE.md:117`, DEC-58): autonomous re-dispatch of a fresh IMPL is allowed only "IFF the loop terminates on a DETERMINISTIC gate (an exit code, never an LLM read), is bounded by a hard iteration cap … AND a separate adversarial audit stays mandatory". Re-entry after compaction is a designed path: "A post-compaction Claude reads this file (plus CLAUDE.md, memory, ORCHESTRATOR-STATE.md) and operates without re-discovering the pattern" (`PHASE-LAUNCH-CHECKLIST.md:3`).

### What generalizes

Portable: deterministic prompt renderer (byte-identical prompts, mandates inlined because subagents don't get the UserPromptSubmit injection); IMPL/AUDIT role split with stop-on-ambiguity + machine-parsed audit output; CI-inside-the-commit-hook; append-only event spine + derived synthesis + accessor-only writes; runnable-not-narrated status; discoveries ledger (append-only DISC rows with `resolved_by` fill-in); checklist-as-code for the orchestrator procedure; tracked rendered prompts as forensic artifacts. Project-specific: the phase MD corpus, Django gate command set, the specific glue-pattern regexes.

---

## Exemplar 2 — SYNTH: failure-pattern-derived mechanical work-harness with authorization grants

### Shape

**Unit of enforced work: the plan / work unit, moving through a gated lifecycle.** The lifecycle is stated in `CLAUDE.md` §Plan Execution Protocol: enter plan mode (mechanically gated on spec currency) → failing tests first → **open the authorization grant** (user-directed only) → implement via rendered one-unit dispatches → `gate.sh` green → commit (hook re-runs the gate regardless).

**Canonical process lives in code + a self-describing manifest.** The harness is explicitly a compiled response to mined history (`CLAUDE.md` §Work Harness): "The harness converts recurring operational failure patterns into deterministic mechanical checks at tool-use boundaries. OH-F IDs refer to the failure-pattern catalog in `.planning/operations-history-audit-2026-07-05.md`." Every hook and script header carries a `Trace:` line back to a specific failure ID and its historical count (e.g. `guard-reads-and-paths.sh`: "oversized Read without offset/limit — 248 historical occurrences of this error class"; "7 historical tool errors used /Users/david/Projects/MUSE/synth-primitives"). Every mechanism declares an explicit **fail-open/fail-closed split** in its header: "fail-OPEN — infrastructure absent … fail-CLOSED — gated condition" (`gate-before-commit.sh:10-15` and all four sibling hooks).

**Sequencing:** hooks refuse out-of-order actions at five tool boundaries (`.claude/settings.json` wires PreToolUse for `Bash`, `Read|Grep`, `EnterPlanMode`, `Agent|Task`, `Write|Edit`); a renderer constrains dispatch shape; 11 mandates (`.claude/mandates.jsonl`) are injected per-prompt globally and inlined per-dispatch; a Phase A–G XML template system binds multi-phase audit processes structurally (`.planning/process-templates/README.md`): "Memory rules alone are recall-required; these templates bind the same invariants structurally so the orchestrator copies a skeleton verbatim rather than re-deriving it under audit pressure."

### Enforcement points

1. **Commit gate + authorization grant** (`.claude/hooks/gate-before-commit.sh`): intercepts `git commit` (segment-splitting on `;&|` so chained commits are caught), classifies the change scope via `scripts/gate.sh --classify` (docs/harness/rust/gui/full, "Stricter class always wins"), then (a) **denies any non-docs commit without a covering open grant** — "COMMIT BLOCKED — no open authorization grant covers scope '$scope' at HEAD. Grants are opened only at explicit user direction via scripts/grant.sh open. (OH-F-01)" — and (b) runs the scoped gate, denying on red. The coverage predicate is git-anchored, not textual: "per distinct grant_id, take its LAST ledger line; require status=='open'; require `git merge-base --is-ancestor <granted_at_head> HEAD`; require expires unmet (until-closed … ; commits:N unmet iff `git rev-list --count` < N)" (`gate-before-commit.sh:62-66`). Grants expire by commit budget or explicit close.
2. **Grant ledger shield, three layers deep**: `protect-grants.sh` denies any Write/Edit of `.planning/authorization-grants.jsonl` ("Direct Write/Edit is never permitted"); `guard-reads-and-paths.sh` Guard 3 denies Bash write-forms (`>>`, `>`, `tee`, `sed -i`, `mv`, `cp`, `truncate`, `perl -i`) targeting the ledger unless the command IS `scripts/grant.sh`; and `grant.sh` itself refuses to append onto a dirty ledger — "An edit-then-launder sequence (hand-edit the ledger, then run grant.sh so the append looks like the only change) would otherwise let a doctored ledger ride into the same commit as a legitimate append" (`grant.sh:54-58`).
3. **Gate driver discipline** (`scripts/gate.sh`): "Verdict is derived from exit codes only, never from grep of free-form text. Every step runs under a per-step wall-clock cap (perl alarm), so the driver self-limits (OH-F-08)." Steps log to `tmp/gate-logs/`; the verdict is exactly one `GATE VERDICT: PASS|FAIL` line. Mandate synth-004 closes the timeout hole: "A timed-out or cut-off gate is NOT a pass — rerun longer. Never hand-compose the gate command set."
4. **Plan-entry gate** (`spec-currency-on-plan.sh`, PreToolUse(EnterPlanMode)): plan mode is impossible unless (a) `scripts/spec-gate.sh` passes structurally, (b) `skill/` has no uncommitted edits, and (c) `git rev-parse HEAD:skill` equals the semantic-audit watermark: "PLAN ENTRY BLOCKED — skill/ tree $cur differs from last clean semantic audit". The watermark (`.planning/spec-audit/watermark.json`) is advance-only-on-clean: "only the Phase A-G semantic audit clean exit writes this file."
5. **Dispatch shape** (`scripts/render-dispatch.sh`): "One work unit per rendered prompt: the --unit-id contract makes for-each dispatches structurally impossible"; a second `--unit-id` or a list/range/glob/whitespace id hard-errors; anchors must match "exactly 1" line; mandates are inlined "because subagents do not receive the UserPromptSubmit injection"; "any remaining ${identifier} placeholder aborts the render — no partially-parameterized prompt can be emitted." "Byte-deterministic: identical inputs produce byte-identical output."
6. **Dispatch serialization** (`one-agent-per-turn.js`, PreToolUse(Agent|Task)): denies `run_in_background: true` and >1 agent dispatch per turn, via message-id-aggregated transcript counting with a 2000 ms `Atomics.wait` settle delay to defeat the transcript write race — a documented live failure mode ("each sibling counts <=1 and a parallel dispatch passes the gate") with a documented residual: "the earliest sibling fails open … — fail-open direction, accepted and documented." Plan-mode fan-out is exempt.
7. **Ergonomics guards** (`guard-reads-and-paths.sh`): wrong-path deny, oversized-Read deny — the harness also protects the agent from its own historical tool-error classes, with counts cited in the deny text.
8. **Closure-count determinism** (`scripts/spec-gate.sh`): replaces "hand-written `grep -c` closure tests (OH-F-07 …)" with a sourceable five-tolerance library (`sg_flat`, `sg_count_both_forms`, …) and structural checks emitting `SPEC-GAP:` lines and exactly one `SPEC-GATE VERDICT:` line. Its negation-window heuristic carries a calibration note from mutation testing (an injected TBD "silently swallowed" → marker tiers tightened, `spec-gate.sh:66-77`) — the gate itself is adversarially tested.

**Verification of completion:** exit-code gates + a mandatory per-plan **adversarial audit by a separate subagent** ("The audit agent did not write the implementation code. Its job is to find problems … **STOP if issues are found.** The user decides disposition … The audit agent never fixes"), findings routed to the append-only `ISSUES.jsonl` (resolution appends a new line, "Original entry is never modified"), plus non-mechanical perceptual verification as first-class: "The human ear is the verifier. If it sounds wrong, the implementation is wrong regardless of what tests say" (§Audio Demonstrations), mirrored for GUI demo blocks. Defect fixes require class analysis in `.planning/defect-classes.jsonl` — "fixing the single site in isolation is the whack-a-mole anti-pattern" — with a "deterministic `enumeration_cmd` plus a per-member proof/probe/fixed verdict."

**State:** `PROJECT-STATUS.md` (narrative), `ISSUES.jsonl` + `defect-classes.jsonl` + `authorization-grants.jsonl` (append-only ledgers), audit watermarks (advance-only-on-clean), and a **state-currency auditor** agent whose brief is exactly the derive-don't-cache test: "can a fresh session, reading only the on-file state records at HEAD, reconstruct the true state of the SYNTH project?" — read-only by construction, evidence-or-UNVERIFIED ("A finding without a git SHA/date AND/OR a claude-history session/timestamp citation is an impression, not a finding"), loop-schedulable with push notification on non-clean.

### Bypass surface — explicitly theorized

SYNTH's most distinctive property: the bypass surface is analyzed inside the mechanism instead of ignored. `grant.sh:11-18`:

> "Design acknowledgment: hooks cannot prove authorship. Nothing here can make grant forgery impossible — any agent with shell access can append to the ledger directly. The aim is narrower and honest: unauthorized implementation commits are blocked-by-default, and grant forgery is DETECTABLE — the state-currency auditor cross-checks ledger appends against claude-history user messages to confirm each open was preceded by explicit user direction … an open without a matching user message is itself forensic evidence of a protocol violation."

Escape hatches are user-attributed and self-expiring: the spec-currency override is "USER ONLY writes this file", gitignored, matches one exact tree hash so it "self-expir[es] on any `skill/` change, and [is] forensically attributed by the state-currency auditor" (`CLAUDE.md` §spec-currency hook). Residual soft spots: `scripts/grant.sh open` sits in the permissions allowlist only as `status` (`settings.json:33-34` allow `grant.sh status`) but an agent could still invoke `open` via Bash with approval — the defense is detection; mandates synth-004/-007 (rerun timed-out gates; use the library) remain behavioral; hooks fail open when jq/gate.sh are absent (bootstrap), so deleting the infrastructure would disarm it — but that deletion is a `harness`-scope change which itself requires a grant + gate.

### Operator experience

The human is a **grantor**: work is blocked-by-default and proceeds only inside a user-opened, git-anchored, expiring grant (ledger sample: `{"grant_id":"GRANT-002","scope":"Plan 11E implementation per approved plan sharded-discovering-lemon (user plan approval 2026-07-05; covers units A-F commits + remediation)","expires":"until-closed","status":"open"}`). The human also adjudicates every audit finding ("Agents cannot declare issues out of scope. Only the user decides scope"), owns the two override channels, and is the perceptual verifier for audio/GUI. Between those points the machine runs the gates. The harness even schedules its own decay review — "Every 3rd corpus-closure cycle, the orchestrator removes one phase template element … and runs the cycle against a known-good corpus" (`process-templates/README.md` §Harness Regression Testing), countering harness bloat as models improve.

### What generalizes

Portable: grant ledger + git-ancestry coverage predicate + triple write-shield + dirty-ledger anti-launder; scope-classified gate with per-step wall-clock caps and exit-code-only verdicts; plan-entry gated on spec currency via advance-only-on-clean watermarks; one-unit dispatch renderer with abort-on-unexpanded-placeholder; transcript-based dispatch/Bash serialization; fail-open(infrastructure)/fail-closed(gated-condition) doctrine; every guard traced to a mined failure ID with counts; forgery-detectable-not-preventable + forensic auditor; append-only ledgers with last-line-wins status; defect-class registry with deterministic enumeration; harness regression testing. Project-specific: the scope path regexes, the particular OH-F catalog, spec-gate's tolerance heuristics, audio/GUI demo conventions.

---

## Comparison — what the variant changed, and what that says the author valued

Both are the same architecture: **an LLM orchestrator whose canonical process lives in committed text/code, whose subagent inputs are built by deterministic renderers with mandates inlined, whose commits are gated by a full test suite running inside a PreToolUse hook, whose progress lives in append-only ledgers + derived synthesis, and whose completion claims are verified by a separate adversarial agent and exit codes, with the human as scope authority.** Shared verbatim DNA: the `deny()`-JSON commit-gate hook shape, one-X-per-turn transcript counting, mandate JSONL + UserPromptSubmit injection + render-time inlining, append-only ledger with append-a-new-line resolution, "STOP, the user decides" posture, deterministic renderer ("No judgment. No LLM." → "byte-deterministic").

The SYNTH deltas:

1. **From procedure-as-prose to procedure-as-refusal.** WASC's sequence (checklist → render → dispatch → verify → refresh state) is codified but obeyed; only the commit is hard-gated. SYNTH moves the gates upstream to more tool boundaries: plan entry (spec currency), agent dispatch (count, foreground, one unit), file writes (ledger shield), reads (size/path). What WASC asked the orchestrator to remember, SYNTH makes the harness deny.
2. **Authorization became a first-class mechanical object.** WASC's mandate-001 ("Never act without user authorization") is prose enforced by audit. SYNTH reifies it: a git-anchored grant ledger, a coverage predicate the hook evaluates, expiry, and blocked-by-default implementation commits — provenance explicitly the 30c0bce unauthorized-commit incident ("reverted, 38-finding audit").
3. **Empirical derivation.** WASC's rules accreted from DISCs as they happened; SYNTH's harness was designed in one pass FROM a quantified failure catalog mined out of claude-history (OH-F IDs, "248 historical occurrences", "recurred 43 times"), and each rule was triaged hook-vs-mandate by cost/benefit ("a preventive hook would carry false-positive risk exceeding its benefit").
4. **Honest threat model.** WASC does not discuss its own bypasses. SYNTH states them in the mechanism ("hooks cannot prove authorship … forgery is DETECTABLE — not preventable") and pairs every unpreventable bypass with a forensic detector (state-currency auditor cross-checking claude-history) and user-only, self-expiring overrides.
5. **Watermarked prerequisites.** WASC gates on current-state checks (suite green now). SYNTH adds monotonic memory: advance-only-on-clean watermarks tie "the specs were audited clean" to an exact tree hash, so any spec drift re-arms the gate.
6. **Fail-direction doctrine + self-testing.** Every SYNTH hook declares its fail-open/fail-closed split; the race in agent-counting is measured and mitigated with a documented residual; spec-gate heuristics are mutation-tested; templates get scheduled regression-removal trials.

What the evolution implies the author valued: **enforcement at the tool boundary over instruction in the prompt; detection + forensics where prevention is impossible; explicit, user-owned escape hatches over implicit trust; rules justified by mined incident data over rules asserted; and a harness that audits and prunes itself.** Sophistication migrated from prompt engineering (WASC's strength — the IMPL/AUDIT contract) to mechanism engineering (SYNTH's strength — the deny surface), while the prompt layer was kept, not replaced.

---

## Portable harness pattern (mechanism inventory)

The distilled composite. "Bypass-resistance": IMPOSSIBLE = mechanically denied; DETECTABLE = possible but leaves forensic evidence a scheduled auditor flags; BEHAVIORAL = prompt/mandate-level only.

| Enforcement point | Mechanism | Bypass-resistance |
|---|---|---|
| Commit on red / untested | PreToolUse(Bash) hook detects `git commit` (segment-split for chains), runs the full scoped gate in-hook, denies with failing tail | IMPOSSIBLE (fail-open only if gate infra absent; guard the infra as gated scope) |
| Unauthorized implementation work | Blocked-by-default commit for non-docs scopes; append-only grant ledger; coverage = last-line status open ∧ `merge-base --is-ancestor` ∧ expiry unmet; grants opened only at user direction | IMPOSSIBLE at the commit; grant forgery DETECTABLE (auditor cross-checks ledger appends vs user-message history) |
| Tampering with the authority record | Triple shield: Write/Edit deny + Bash write-form deny + driver refuses appends on a dirty ledger (anti-launder) | IMPOSSIBLE via tools; residual raw-shell paths DETECTABLE |
| Planning against stale/dirty specs | PreToolUse(EnterPlanMode) hook: structural spec gate + porcelain-clean spec dir + `HEAD:<specdir>` tree hash == advance-only-on-clean watermark written solely by the audit's clean exit | IMPOSSIBLE; USER-ONLY override file, hash-pinned so it self-expires, forensically attributed |
| Batched / parallel / background dispatch | Transcript-count hooks (message-id aggregation + settle delay for the write race); deny `run_in_background`; plan-mode exemption for read-only fan-out | IMPOSSIBLE within documented race residual (earliest sibling fails open) |
| Hand-composed / multi-unit subagent prompts | Deterministic renderer: single `--unit-id` (lists/globs hard-error), unique-anchor extraction, mandates inlined (subagents miss prompt-injection hooks), abort on any unexpanded placeholder, byte-deterministic output | IMPOSSIBLE through the renderer; using the renderer at all is BEHAVIORAL (mandate) |
| Subagent improvisation | Compiled role contracts: IMPL "execute verbatim + STOP on ambiguity, do not guess"; AUDIT read-only, evidence-per-finding, no severity grades, machine-parsed terminal count line | BEHAVIORAL, but verification is mechanical (count parsed literally; GO/NO-GO computed) |
| Self-attested completion | Separate adversarial audit agent (never the implementer, never fixes) + exit-code gates; completed-status structurally requires a verification edge (substrate invariant) | Audit quality BEHAVIORAL; the requirement-to-run-it can be made IMPOSSIBLE via status invariants |
| Fix-the-symptom-only | Defect-class registry: every confirmed defect joins/founds a class with a deterministic `enumeration_cmd` + per-member verdicts; gate checks enumeration/member reconciliation | DETECTABLE→IMPOSSIBLE at the gate |
| State drift / narrated status | Append-only event ledgers (correct by appending, never rewriting) + derived synthesis + accessor-only writes + runnable focus query; guards deny post-processing glue around the accessor | Glue bypass IMPOSSIBLE; drift DETECTABLE (scheduled read-only state-currency auditor: "fresh session reconstructs true state from files at HEAD", evidence-or-UNVERIFIED) |
| Known tool-error classes | Cheap targeted denies (oversized Read, wrong path) carrying the historical count in the deny text; classes that self-correct in-turn stay mandate-only by explicit cost/benefit triage | IMPOSSIBLE for hooked classes; BEHAVIORAL by design for the rest |
| Gate wedging / false-pass | Per-step wall-clock caps (perl alarm) in the driver; exit-code-only verdicts, never grep of prose; "timed-out gate is NOT a pass" | IMPOSSIBLE (cap) + BEHAVIORAL (rerun rule) |
| Harness rot | Fail-open(infrastructure)/fail-closed(gated-condition) declared per mechanism; mutation-testing of gate heuristics; scheduled element-removal regression trials; evaluator firing logs driving downgrade/removal | Meta-level; keeps the IMPOSSIBLE column honest over time |

Design invariants that make the pattern cohere: (1) the deny message is a teaching message — every block restates the rule and the sanctioned alternative; (2) every mechanism cites the incident that justified it; (3) prevention where the tool boundary allows, detection + forensics where it cannot, and never silence about which is which; (4) escape hatches exist, are user-only, expire on state change, and leave evidence; (5) the human's role is compressed to the highest-leverage points: plan approval, grants, finding disposition, perceptual verification.

---

*Files read (anchors): WASC — `.claude/settings.json`, `.claude/hooks/{gate-before-commit.sh,one-bash-per-turn.js,block-pi-context-glue.sh,block-state-mjs-glue.sh}`, `bin/render-phase-prompt.sh`, `templates/{impl-static,audit-static,begin-block}.md`, `MANDATES.md`, `phases/PHASE-LAUNCH-CHECKLIST.md`, `CLAUDE.md`, `ORCHESTRATOR-STATE.md` (header), `.claude/settings.local.json`. SYNTH — `.claude/settings.json`, `.claude/hooks/{gate-before-commit.sh,protect-grants.sh,guard-reads-and-paths.sh,spec-currency-on-plan.sh,one-agent-per-turn.js}`, `.claude/mandates.jsonl`, `scripts/{gate.sh,grant.sh,render-dispatch.sh,spec-gate.sh}`, `CLAUDE.md`, `.planning/process-templates/README.md`, `.planning/spec-audit/watermark.json`, `.planning/authorization-grants.jsonl`, `.claude/agents/state-currency-auditor.md`, `.claude/commands/adversarial-audit.md`, `.planning/operations-history-audit-2026-07-05.md` (header). Global — `~/.claude/settings.json` hooks (UserPromptSubmit mandate injection).*
