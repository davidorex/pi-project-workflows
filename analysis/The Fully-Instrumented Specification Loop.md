# The Fully-Instrumented Specification Loop

## About this document

This document describes a specification-conformance verification loop: a pattern for keeping intent, specs, plans, implementation, and verification artifacts in deliberate alignment through named transitions with explicit authority boundaries.

It combines two sources:

- **Top-down derivation** of the pattern's structural elements from first principles
- **Evidence from the `/Users/david/Projects/MUSE/SYNTH` project**, the concrete instance from which the adversarial-audit command and its surrounding workflow actually arose, recovered by querying `~/.claude/cache/chb/ClaudeHistory.sqlite` (Claude History Browser's Core Data store) and reading memory files at `~/.claude/projects/-Users-david-Projects-MUSE-SYNTH/memory/`

Provenance is marked inline with `[S#]` tags, resolved in the Sources section at the end. Where SYNTH's instantiation made a structural element visible that the top-down derivation initially missed, the element is present in its logical position with a provenance note. Where SYNTH's instantiation confirms or specifies a top-down element, the confirmation appears inline with the element.

The pattern is not ahistorical. SYNTH evidence shows it was built layer by layer in response to specific verification failures `[S1]`, not designed upfront. The order of discovery matters for anyone adopting the pattern — see §7 "Growth order."

---

## §1. Artifact chain

The full loop maintains these artifacts in deliberate relationships. Each artifact is both a deliverable from one transition and a precursor to the next.

### §1.1 Pre-flight (stable, rarely changes)

| # | Artifact | Purpose | Shape |
|---|---|---|---|
| 0 | **Intent** | Why this project exists, problems it solves, what success looks like, explicit non-goals | Prose, goal list |
| 1 | **Constraints** | Operating rules, design principles, forbidden patterns, team/tool conventions `[S2]` | Imperative rules (SYNTH: `CLAUDE.md`, 433 lines) |
| 2 | **Glossary** | Shared vocabulary — what each project-specific word means | Term → definition |

### §1.2 Specification (authoritative intent, granular)

| # | Artifact | Purpose | Shape |
|---|---|---|---|
| 3 | **Domain model** | Entities, relationships, invariants | Types, relations, rules |
| 4 | **Architecture spec** `[S3]` | Components, boundaries, integration points | Component diagram + contracts (SYNTH: `skill/SYNTH-RUNTIME.md`) |
| 5 | **Runtime contract** `[S3]` | How the system behaves at runtime, data flow, lifecycle | Behavior specs, state machines |
| 6 | **API contract** | External surfaces, versioning commitments | Type signatures, schemas |
| 7 | **Non-functional spec** | Performance, security, availability, usability requirements | Measurable thresholds |

### §1.3 Decomposition (spec → work)

| # | Artifact | Purpose | Shape |
|---|---|---|---|
| 8 | **Work breakdown** `[S3]` | Named work units covering the spec | Named units with scope + acceptance criteria (SYNTH: `skill/SYNTH-PLANS-DECOMPOSITION.md`) |
| 9 | **Dependency graph** | Which units block which | DAG |
| 10 | **Sequencing plan** | Order of delivery, parallelization opportunities | Ordered list |
| 11 | **Deferral log** | Things intentionally pushed out of current cycle | List with rationale |

### §1.4 Pre-implementation verification artifacts `[S4][S5]`

A layer SYNTH instantiated that sits between decomposition and planning. Detects drift *before* implementation begins, so plan mode doesn't execute against incoherent assumptions.

| # | Artifact | Purpose | Shape |
|---|---|---|---|
| 12 | **Foundation disclarity ledger** `[S5]` | Cross-document inconsistencies, silent universal assumptions, spec-vs-code drift, orphaned features for an entire phase | JSONL, 18 fields per entry, `.planning/<phase>-foundation-disclarities.jsonl` |
| 13 | **Per-plan assumption ledger** `[S4]` | Validated assumptions for a single target plan before plan mode entry | JSONL, 18 fields per entry, `.planning/plan-NN-audit-findings.jsonl` |
| 14 | **Resolution task ledger** `[S6]` | Findings clustered by root cause into composable agent tasks | JSONL, 15 fields per task entry, `.planning/<phase>-foundation-resolution-tasks.jsonl` |

The foundation and per-plan audits share 16 of 18 fields (see §3.1). The resolution task ledger clusters findings from both into 8-15 tasks per audit (see §1.7 for clustering rationale).

### §1.5 Planning (per-unit execution design)

| # | Artifact | Purpose | Shape |
|---|---|---|---|
| 15 | **Unit plan** `[S3]` | Execution steps, file targets, interfaces, verification criteria (SYNTH: `skill/SYNTH-PLAN.md`, `.claude/plans/*.md`) | Steps + targets |
| 16 | **Test plan** | What will be tested and how | Test specs tied to plan steps |
| 17 | **Integration plan** | How this unit fits with existing/pending units | Interface contracts |

### §1.6 Execution (the actual building)

| # | Artifact | Purpose | Shape |
|---|---|---|---|
| 18 | **Implementation** | Source code | Files |
| 19 | **Test suite** | Executable verification | Files |
| 20 | **Build artifacts** | Compiled/rendered outputs | Binaries, bundles |
| 21 | **Commit log** `[S2]` | Change history with intent (SYNTH: "forensic commit messages, aims not certainties") | Git log |
| 22 | **Demonstrations** `[S7]` | Human-verifiable runtime artifacts (SYNTH: rendered WAV files via hound; "human ear is the verifier") | Playable output files |

### §1.7 Verification (gap detection between upstream and built state)

| # | Artifact | Purpose | Shape |
|---|---|---|---|
| 23 | **Verification manifest** | What was checked, when, by which verifier | Per-run records |
| 24 | **Findings registry** `[S3]` | Gaps, discrepancies, partial-fulfillment records (SYNTH: `ISSUES.jsonl`, append-only, shared across multiple agent types) | Structured JSONL |
| 25 | **Health attestation** `[S3]` | Build/test/static-analysis state at verification time (SYNTH: `cargo test` + `cargo check` results) | Pass/fail + counts |

The findings registry is a **shared schema artifact**: multiple verifier types write to it (SYNTH `[S3]`: adversarial-audit, walkthrough-review, plan-checker all append entries with `found_by` attribution). The schema is owned by the registry, not any single writer. See §3 for the cross-audit schema alignment invariant.

**Findings carry a `failure_kind` taxonomy** `[S4]` (shared across pre-implementation and verification audits):

| Value | Meaning | Required follow-up |
|---|---|---|
| `null` | Status is HOLDS, no failure | None |
| `unverified` | Claim plausible but not empirically or structurally tested | Research agent designs verification |
| `spec-conflict` | Two sources of truth disagree (spec-vs-spec OR spec-vs-code) | Spec-authority arbitration; requires `conflict_parties` sub-field |
| `spec-silent` | Spec specifies outcome but not mechanism/value | Research agent proposes mechanism with cited evidence |
| `spec-omission` | Spec forgot an obvious bullet every analogous plan contains | Research agent writes the missing text |
| `scope-undefined` | Two plans plausibly own a piece of work | Architectural arbitration assigns ownership |
| `scope-creep-risk` | Feature exists in design-decision doc but no plan owns it | Assign to dependency-appropriate plan |

Invariants: `status == "HOLDS"` iff `failure_kind is null`. `failure_kind == "spec-conflict"` iff `conflict_parties is not null`.

**Findings lifecycle as an explicit state machine** `[S4]`:

```
audited → researching → proposed → decided → implementing → resolved
```

Transition gates:
- `audited → researching` — orchestrator dispatches research task
- `researching → proposed` — research agent writes `resolution_proposals` into the finding
- `proposed → decided` — **user selects** `resolution_chosen` (hard forbidden action for agents `[S10]`: "stripping options ≠ selecting the survivor")
- `decided → implementing` — orchestrator dispatches implementation task
- `implementing → resolved` — implementation completes, tests pass, build green

The state machine is what makes the "every finding has a disposition" invariant actually enforceable. Without explicit state tracking, findings can be silently advanced (or silently dropped).

### §1.8 Triage (what to do about findings)

| # | Artifact | Purpose | Shape |
|---|---|---|---|
| 26 | **Disposition log** `[S3]` | Per-finding decision (SYNTH: `absorb` / `plan` / `blocked` attached to each finding) | Finding ID → disposition |
| 27 | **Amendment queue** | Pending changes to upstream artifacts | Target artifact + diff |

**Disposition vocabulary** `[S3]`:
- `absorb` — fits within an existing plan's scope; addendum on affected plans
- `plan` — needs its own sideline plan (Plan S1, S2…)
- `blocked` — cannot proceed without user decision

**Task lifecycle for resolution tasks** `[S6]` (parallel to findings lifecycle):

```
not_started → in_progress → completed (or blocked)
```

### §1.9 Historical (append-only memory)

| # | Artifact | Purpose | Shape |
|---|---|---|---|
| 28 | **Completion log** | Finished work units with dates | Append-only list |
| 29 | **Decision log (ADRs)** | Architectural decisions with rationale | Numbered records |
| 30 | **Postmortems** | What went wrong, lessons extracted | Per-incident |
| 31 | **Feedback memory** `[S11]` | Per-project operational rules discovered through incident (SYNTH: 27 `feedback_*.md` files in memory dir) | Per-rule markdown with why + how-to-apply |

---

## §2. Transitions (named operations)

Each transition is a named node with a stance, precursors, authority, and handoff.

### §2.1 Establishment transitions

| Operation | From | To | Stance |
|---|---|---|---|
| **capture-intent** | (user) | Intent | Interviewer |
| **capture-constraints** | Intent, experience | Constraints | Pedagogue |
| **build-glossary** | Spec drafts, domain research | Glossary | Lexicographer |

### §2.2 Specification transitions

| Operation | From | To | Stance |
|---|---|---|---|
| **model-domain** | Intent, constraints | Domain model | Ontologist |
| **specify-architecture** | Domain model, constraints | Architecture spec | Architect |
| **specify-runtime** | Architecture | Runtime contract | Systems designer |
| **specify-api** | Architecture, domain model | API contract | Interface designer |
| **specify-non-functional** | Intent, constraints | Non-functional spec | Measurement-oriented |

### §2.3 Decomposition transitions

| Operation | From | To | Stance |
|---|---|---|---|
| **decompose** | Spec (all) | Work breakdown | Strategic reducer |
| **graph-dependencies** | Work breakdown | Dependency graph | Sequencer |
| **sequence-work** | Dependency graph, constraints | Sequencing plan | Scheduler |
| **defer** | Any spec artifact | Deferral log | Disciplined prioritizer |

### §2.4 Pre-implementation verification transitions `[S4][S5][S6]`

These transitions run *before* plan mode entry. They prevent cascading failures from implementing against incoherent upstream state. In SYNTH evidence, each was added in response to a specific incident (§7 Growth order).

| Operation | From | To | Stance |
|---|---|---|---|
| **foundation-disclarity-audit** `[S5]` | Entire phase's authoritative docs + supporting research + existing code + upstream types + prior art | Foundation disclarity ledger | Cross-cutting auditor |
| **per-plan-assumption-audit** `[S4]` | Single target plan's spec section + related docs + codebase + prior art | Per-plan assumption ledger | Scoped auditor |
| **cluster-findings** `[S6]` | Foundation/per-plan ledger | Resolution task ledger (8-15 tasks per audit) | Root-cause clusterer |

**Task kinds** (produced by `cluster-findings`, drive agent prompt shape) `[S6]`:

| Kind | Behavior |
|---|---|
| `research` | Agent investigates; writes resolution proposals into findings; does not modify docs/code |
| `research-and-implementation` | Obvious path from cited evidence; no architectural decision required |
| `implementation` | Agent executes an already-decided resolution (user has selected `resolution_chosen`) |
| `verification` | Agent writes empirical probes for `unverified` findings |
| `documentation` | Agent adds purely additive spec text for `spec-omission` findings |

**Task entry fields** `[S6]` (15 fields per task, so the orchestrator composes agent prompts mechanically from the entry without re-reading the source audit):

- `id`, `title`, `task_kind`, `addresses_findings`, `related_findings`, `cluster_rationale`
- `inputs.required_reading`, `inputs.prior_art`, `inputs.authority_boundaries`
- `outputs.files_to_modify`, `files_to_create`, `commits_expected`, `jsonl_mutations`
- `outcome_shape.required_decisions`, `required_changes`, `required_state_after`
- `verification_criteria`, `prompt_scoping.required_sections`, `stop_rules`
- `dependencies`, `blocks_planning`, `status`

### §2.5 Planning transitions

| Operation | From | To | Stance |
|---|---|---|---|
| **plan-unit** | Work breakdown unit, spec, constraints, resolved findings `[S9]` | Unit plan | Tactical planner |
| **plan-tests** | Unit plan | Test plan | Test architect |
| **plan-integration** | Unit plan, dependency graph | Integration plan | Systems integrator |

Plan mode entry is **gated** by resolved pre-implementation findings `[S5]`: any `blocks_planning=true` or `blocks_plan_NN_start=true` finding must reach `resolved` before plan mode can begin. Architectural-severity findings should also resolve before the first sub-plan they affect starts.

### §2.6 Execution transitions

| Operation | From | To | Stance |
|---|---|---|---|
| **execute** `[S11]` | Unit plan | Implementation | Builder (SYNTH rule: orchestrator never edits code directly, always delegates to subagent) |
| **write-tests** | Test plan | Test suite | Test writer |
| **demonstrate** `[S7]` | Implementation | Demonstrations | Rendering craftsman |
| **commit** `[S2]` | Implementation delta | Commit log entry | Forensic historian |
| **build** | Implementation | Build artifacts | Automation |

### §2.7 Verification transitions (10 verifier boundaries)

Each verifier transition detects drift at a specific boundary between artifact layers.

| # | Verifier | Checks drift at | SYNTH instantiation |
|---|---|---|---|
| V1 | **intent-coherence-verifier** | Spec vs Intent — does spec actually solve the stated problem? | Not instantiated |
| V2 | **constraint-compliance-verifier** | Spec vs Constraints — does spec respect the rules? | Not instantiated |
| V3 | **domain-completeness-verifier** | Domain model vs Spec — does the model cover the full problem? | Partially covered by foundation disclarity audit `[S5]` |
| V4 | **decomposition-coverage-verifier** | Decomposition vs Spec — does the breakdown cover the full spec? | Partially covered by foundation disclarity audit `[S5]` |
| V5 | **plan-fidelity-verifier** | Unit plan vs Work unit — does the plan deliver the unit? | Covered by per-plan assumption audit `[S4]` |
| V6 | **implementation-plan-conformance-verifier** | Code vs Unit plan — does the code do what the plan said? | Covered by showboat-walkthrough `[S3]` (after adversarial audit + issue resolution) |
| V7 | **implementation-spec-conformance-verifier** | Code vs Spec — does the code satisfy the spec? | Covered by adversarial-audit command `[S1]` |
| V8 | **integration-verifier** | Multiple implementations vs each other — do the pieces fit? | Partial via `cargo check` at V9 level |
| V9 | **health-verifier** | Implementation runnable state — does it build, test, lint? | Covered: `cargo test` + `cargo check` + WAV rendering via hound `[S3][S7]` |
| V10 | **disposition-closure-verifier** | Dispositions vs Amendments — were findings actually resolved? | Partial via `resolved` state transition check `[S4]` |

Each verifier has the same six internal elements (extract, bind, verify, classify, capture, route) applied to a different boundary.

**Adversarial audit as a specific V7 instantiation** `[S1]`: the adversarial audit command was created 2026-04-03 23:50 in response to a failed use of showboat-walkthrough as an audit tool. The critique enumerated 7 deficiencies (summarized in §6 Failure modes, SYNTH-origin row). The command embeds 6 structural constraints:

1. **Checklist-first**: builds verification checklist from specs *before* looking at code
2. **Three verdicts only**: `PASS` / `FAIL` / `PARTIAL` — no invented minimization categories
3. **Downstream trace**: every new API element is traced forward to consumers; a field that exists but is never populated is `PARTIAL`, not `PASS`
4. **Structured findings**: spec reference + code reference + gap + impact + severity — not prose narration
5. **Every non-PASS becomes an ISSUE**: no exceptions, no "observations"
6. **Structured report format**: counts, failures list, issues created — not walkthrough narrative

**Adversarial audit uses a fresh-context subagent, not a separate session** `[S3]`: "Adversarial audits work well as fresh-context opus subagents — no need for separate session. Agent reads spec + code + runs tests, reports findings as `ISSUES.jsonl` entries. The agent has zero context from the implementation conversation — it didn't write the code, so it audits without confirmation bias. Works as well as a separate session with less overhead."

The orchestrator composes the prompt with (1) exact spec file paths, (2) exact implementation file paths, (3) instruction to run `cargo test` + `cargo check`, (4) `ISSUES.jsonl` format for findings, (5) "do NOT fix anything — report only" `[S3]`.

### §2.8 Triage transitions

| Operation | From | To | Stance |
|---|---|---|---|
| **triage** | Findings registry | Disposition log | Judge |
| **queue-amendment** | Disposition | Amendment queue | Editor |
| **escalate** `[S12]` | Blocked disposition | (user) | Escalator (SYNTH rule: "If a subagent returns an issue: STOP. Report to user. User decides next action.") |

### §2.9 Loop-back transitions

| Operation | From | To | Stance |
|---|---|---|---|
| **amend-plan** `[S9]` | Amendment queue | Unit plan | Reviser (SYNTH: per-sub-plan audit with cascading updates — audit after EACH sub-plan, resolve issues immediately, update downstream sub-plans if APIs change) |
| **amend-spec** | Amendment queue | Spec (any) | Re-architect |
| **amend-decomposition** | Amendment queue | Work breakdown | Re-decomposer |
| **amend-constraints** | Amendment queue | Constraints | Rule-editor |

### §2.10 Historical transitions

| Operation | From | To | Stance |
|---|---|---|---|
| **complete-unit** | Verified implementation | Completion log | Closer |
| **decide** | Any decision-bearing moment | Decision log (ADR) | Record-keeper |
| **postmortem** | Completed/failed work | Postmortems | Reflective analyst |
| **codify-feedback** `[S11]` | Observed incident | Feedback memory | Rule-extractor (SYNTH pattern: incidents produce `feedback_*.md` files that accumulate project operational knowledge) |

---

## §3. Meta-infrastructure (substrate the flow runs on)

These aren't artifacts in the flow — they're the invariants the flow depends on.

| # | Meta-element | Purpose |
|---|---|---|
| M1 | **Schema registry** `[S5]` | Owns the shape of structured artifacts. Multiple writers share one schema. **Cross-audit schema alignment is load-bearing**: SYNTH foundation and per-plan audits share 16 of 18 JSONL fields (differing only in `blocks_plan_NN_start` ↔ `blocks_planning` and `affected_plan` ↔ `affected_plans`). This enables the resolution task ledger (§1.4) to cluster findings across audit types into single tasks. Without alignment, cross-audit clustering requires lossy translation. |
| M2 | **ID authority** | Monotonic ID allocation for findings, decisions, work units. Prevents collision when multiple nodes write. |
| M3 | **Naming authority** `[S3]` | Scope labels ("Phase 0", "Plan 11D") are first-class references, not free-form. Something owns the namespace. SYNTH: scope labels resolve to specific sections of `SYNTH-PLANS-DECOMPOSITION.md`. |
| M4 | **Authority matrix** `[S11][S12]` | Which node can write which artifact. Prevents verifiers from auto-fixing, prevents planners from rewriting specs. SYNTH rules: "orchestrator never edits code directly, always delegates"; "agents cannot declare issues out of scope, only the user decides scope." |
| M5 | **Handoff protocol** | How one node signals completion to the next. Explicit, not magical. Usually artifact-shape + marker. |
| M6 | **Session boundary** `[S12]` | Fresh context for each independent verification. SYNTH observation: can be achieved via fresh-context subagent (no conversation history from the implementation context) without requiring a separate Claude Code session. |
| M7 | **Time discipline** | All artifacts are dated, monotonically. Enables "when did this drift appear" queries. |
| M8 | **Source discipline** | All artifacts in version control, or explicitly out with justification. See §9 portability gap. |
| M9 | **Concurrency protocol** | Multiple parallel writes to shared artifacts don't corrupt. Either serialized, or CRDT-shaped, or append-only. |
| M10 | **Authorship attestation** `[S3]` | Each artifact records who/what produced it. SYNTH: `found_by` field in `ISSUES.jsonl` records which audit type wrote each finding — enables independence checking and cross-writer attribution. |
| M11 | **Orchestrator-subagent boundary** `[S11]` | Orchestrator reads, plans, coordinates, reviews, reports. All implementation — including mechanical one-line changes — is delegated to subagents. The orchestrator never edits code directly. This boundary exists specifically to prevent the orchestrator from accumulating authorial context that would compromise downstream verification independence. |

---

## §4. Agent stance taxonomy

The pattern distinguishes stances to prevent contamination. One agent can wear multiple hats across sessions, but never in one session.

| Stance | Role | What it does | What it must not do |
|---|---|---|---|
| **Visionary** | Intent capture | Articulate why | Specify how |
| **Pedagogue** | Constraints | Teach the rules | Question the rules |
| **Lexicographer** | Glossary | Define terms | Introduce new concepts |
| **Ontologist** | Domain model | Map entities and relations | Design implementation |
| **Architect** | Spec | Design components and contracts | Write implementation code |
| **Strategic reducer** | Decomposition | Break work into units | Plan unit execution |
| **Cross-cutting auditor** `[S5]` | Foundation audit | Find corpus-level disclarities across Tier-1 docs | Propose fixes (that's research agent's job) |
| **Scoped auditor** `[S4]` | Per-plan assumption audit | Find plan-scoped assumption failures | Expand scope beyond the target plan |
| **Root-cause clusterer** `[S6]` | Cluster findings into tasks | Group findings sharing a fix, file, or decision | Implement tasks |
| **Tactical planner** | Per-unit plans | Sequence execution steps | Execute the steps |
| **Builder** `[S11]` | Execution | Write code per plan | Verify own code; act without explicit authorization; edit outside plan scope |
| **Adversarial auditor** `[S1]` | Code-to-spec verification | Find gaps | Fix gaps; minimize findings; praise implementation; suggest fixes |
| **Narrative verifier** `[S3]` | Showboat walkthrough (post-audit) | Narrate compliance of remediated code | Discover new findings (that's the adversarial auditor's role, at a different layer boundary) |
| **Research agent** `[S4]` | Per-finding investigation | Write `resolution_proposals` with cited evidence | Select among proposals (user does) |
| **Judge** | Triage | Decide disposition | Discover new findings |
| **Reviser** | Loop-back | Amend upstream artifacts | Re-decide dispositions |
| **Historian** | Completion/ADR/postmortem | Record what happened | Change what happened |
| **Rule-extractor** `[S11]` | Feedback memory codification | Extract operational rules from incidents | Enforce rules (that's for a later cycle) |

The pattern's correctness depends on keeping stances separate. SYNTH evidence `[S11]` shows specific failures when stances collapse: when the orchestrator takes builder-stance (writing code directly instead of delegating), downstream adversarial verification loses authorial independence.

---

## §5. Invariants

1. **Append-only upstream.** Specs amend, don't mutate. Plans accrue addenda. Constraints get new rules, old rules never vanish — they get superseded with explicit records.

2. **Self-evident artifacts.** Every artifact is interpretable without its author present. No "ask the author" dependencies.

3. **Scope labels are references, not prose.** Every transition operates on named scope that resolves to a specific artifact or work unit. `[S3]`

4. **Forward-only flow except findings.** Artifacts flow downstream. Only findings flow backward, and only through triage + amendment.

5. **Schemas at shared artifacts are registry-owned.** Multiple writers share one schema. Writers conform; writers don't own. **Cross-audit schema alignment is load-bearing** `[S5]` — see §3 M1.

6. **Authority is explicit per node.** Each transition declares what it reads and what it writes. No implicit mutation. `[S11][S12]`

7. **Handoffs are explicit.** No "and then magic happens." Every transition has a defined precursor check and a defined successor signal.

8. **Every layer boundary has a verifier** (or is flagged as not-yet-instrumented). Drift only accumulates at boundaries without instrumentation. Full instrumentation means 10 verifiers (V1-V10). SYNTH currently instruments V5, V6, V7, V9 explicitly, with partial coverage of V3, V4, V8, V10.

9. **Every finding advances through its state machine** `[S4]`. The state machine (`audited → researching → proposed → decided → implementing → resolved`) is what makes "every finding has a disposition" enforceable. Silent advancement or silent drops are forbidden.

10. **Findings cluster into tasks before dispositions** `[S6]`. The clustering step is distinct from triage. 30-80 findings become 8-15 tasks. Collapsing findings directly into dispositions loses the root-cause clustering that enables mechanical prompt composition.

11. **Every loop closes.** Findings either resolve (amendment queued and applied), escalate (human decision artifact), or block (explicit blocker record). Nothing evaporates.

12. **Session boundaries (or fresh-context subagents) are load-bearing** `[S3][S12]`. Verifications run with zero authorial context. Authorial independence is enforced by substrate, not promised by instruction. Fresh-context subagents achieve independence without requiring separate Claude Code sessions.

13. **Time is monotonic.** Artifacts are dated, decisions are dated, findings are dated. Reconstruction of historical state is always possible.

14. **Schema stability under version.** When a shared schema changes, old records remain valid (or get migrated forward in an explicit migration artifact).

15. **Every stance has a corresponding verifier.** If there's a builder-stance, there's an auditor-stance that checks builder output. No stance is self-verifying.

16. **Each audit layer earns its existence through a documented incident** `[S1][S4][S5]`. Audit layers are added in response to observed failure modes, not designed speculatively. See §7 Growth order.

17. **The user owns decisions** `[S8][S10][S12]`. Agents cannot declare issues out of scope, advance findings from `proposed` to `decided`, or resolve blocked dispositions. This is codified in per-project feedback memory (SYNTH) and lifted to global behavioral mandates (dot-claude `mandates.jsonl`).

18. **Demonstrations produce runtime evidence**, not just test assertions `[S7]`. For systems with human-perceptible output (audio, visual, UX), passing tests are necessary but insufficient. A human-verifier pass (listen, watch, try) is a separate phase in the loop.

---

## §6. Failure modes (what breaks when you skip elements)

Failures documented here include both general failure modes of the pattern and specific incidents from SYNTH that motivated pattern layers.

| Missing | Immediate failure | Eventual failure | SYNTH incident origin |
|---|---|---|---|
| Intent | Scope creep | Project becomes unrecognizable | |
| Constraints | Session-to-session inconsistency | Technical debt accumulates silently | |
| Glossary | Terminology drift | Specs become ambiguous | |
| Domain model | Spec skips foundational entities | Integration breaks across components | |
| Architecture spec | Nothing to audit against | Implementation ossifies around first decisions | |
| Runtime contract | Behavioral bugs undetected | Production incidents | |
| Non-functional spec | Performance/security never tested | Latent quality failures | |
| Decomposition | Work unit size unbounded | Planning becomes monolithic | |
| Dependency graph | Work sequence arbitrary | Blocking discovered late | |
| Unit plan | Implementation ad-hoc | Verification has no plan to check against | |
| Test plan | Tests ad-hoc | Coverage gaps unknown | |
| Commit log | Change history opaque | Bisection impossible | |
| Demonstrations | Tests pass but output wrong | Shipped code fails human verification | `[S7]` |
| Findings registry | Verifications ephemeral | Drift detection lost between sessions | |
| Verification manifest | Don't know what was checked | Don't know what wasn't checked | |
| Health attestation | Runnable state unknown | Broken builds merged | |
| Findings state machine | Findings silently advance or drop | "Every finding has a disposition" becomes performative | `[S10]` |
| Resolution task ledger | Findings processed one-by-one | Root-cause clusters fragment into overlapping fixes | `[S6]` |
| Disposition log | Findings accumulate without decision | Registry becomes write-only | |
| Amendment queue | Decisions don't propagate | Upstream stays stale | |
| Completion log | Don't know what's done | Re-do work | |
| Decision log | Rationale lost | Decisions re-litigated | |
| Postmortems | Lessons lost | Same mistakes repeat | |
| Feedback memory | Operational knowledge dies with session | Each new phase re-learns old lessons | `[S11]` |
| Schema registry | Writers drift | Findings become untrusted | |
| Cross-audit schema alignment | Findings silo by audit type | Resolution clustering impossible across audits | `[S5]` |
| Authority matrix | Agents overreach | Trust loss | `[S11]` |
| Session boundary / fresh context | Verifier bias | Adversarial stance is performative | `[S12]` |
| Orchestrator-subagent boundary | Orchestrator accumulates authorial context | Downstream verification compromised | `[S11]` |
| Pre-implementation audit | Implementation executes against incoherent assumptions | Plan 11D-class failure: agent writes code against wrong contracts | `[S4]` |
| Foundation disclarity audit | Phase corpus internal drift not caught until per-plan audits discover it one-by-one | GUI-phase-class failure: 64 latent disclarities cause cascading sub-plan thrash | `[S5]` |
| Adversarial audit with proper stance | Audit becomes narration | SYNTH 2026-04-03 incident: `/showboat-walkthrough` used as audit, agent invented "minor/observation/expected" severity categories, real issues minimized | `[S1]` |

**The 2026-04-03 adversarial audit failure enumerated 7 specific deficiencies** `[S1]` that any would-be audit implementation should avoid:

1. **Walkthrough ≠ audit.** Willison-method narration and adversarial compliance review are different activities. An agent asked to do both defaults to the easier (narration).
2. **No checklist from plan.** Agent has to discover requirements by reading files, which lets it skip items. Checklist items must be explicit and pre-built from the spec.
3. **No severity framework.** Without a closed enum (PASS/FAIL/PARTIAL), agents invent gradations ("minor/observation/expected") that allow dismissal.
4. **No downstream impact analysis.** Structural verification ("field exists") without behavioral verification ("does anything write real values to it") lets unpopulated fields pass.
5. **Spec content not in prompt.** Telling the agent to go read spec files burns context on file reading instead of analysis. Relevant spec sections should be pasted into the prompt.
6. **No structured findings output.** Prose findings require lossy translation by the orchestrator to produce `ISSUES.jsonl` entries, and minimization happens in the translation.
7. **Walkthrough file format incentivizes narration over critique.** The output format shapes the behavior. An audit needs a structured findings table, not prose paragraphs.

---

## §7. Growth order (how the pattern accumulates layers)

SYNTH evidence `[S1][S4][S5]` shows the pattern was built layer by layer in response to specific incidents. Any project adopting the pattern should consider adding layers in this order, with each layer earning its existence by naming the failure it prevents.

| Date | Incident | Layer added |
|---|---|---|
| 2026-04-03 | `/showboat-walkthrough` used as audit tool produced narration instead of gap detection; agent invented minimization categories | `/adversarial-audit` command (V7: code → spec conformance) |
| 2026-04-10 | Plan 11D (GUI) began implementation against incoherent assumptions: A15 bridge protocol mismatch, A32 knob label vs ISSUE-056 sibling pattern; implementing agent wrote code against wrong contracts | Pre-implementation assumption audit (V5: plan → spec coherence) |
| 2026-04-10 | GUI phase Tier-1 docs had 64 latent disclarities — 19 blocking — that would have been discovered one-by-one during per-plan audits, causing cascading sub-plan thrash | Foundation disclarity audit (V3/V4: spec corpus internal coherence) |

**Implication for generalization**: a project adopting the pattern top-down may build verification scaffolding that doesn't yet match its own failure modes. Start with the boundary producing the most failures; add layers only when new failure modes appear. Each added layer should carry a feedback memory file naming the incident that prompted it `[S11]`.

---

## §8. The verifier grid

The complete verification surface at full instrumentation. Rows are "what's being verified" (produced by an upstream transition); columns are "against what" (the authoritative referent).

```
                INTENT   CONSTR   DOMAIN   ARCH   RUNTIME   API    NFR   DECOMP   PLAN   CODE
       INTENT    ·        V2
      CONSTR              ·
      DOMAIN    V1                  ·
        ARCH    V1        V2       V3       ·
     RUNTIME    V1        V2                V3      ·
         API    V1        V2                V3                ·
         NFR    V1        V2                                         ·
      DECOMP                                V4     V4       V4    V4    ·
        PLAN                                                                    V5     ·
        CODE              V2                V7     V7       V7    V7           V6     V7 + V9
```

Each cell is a potential drift detector. The diagonal is the artifact itself. Below the diagonal is verification.

**SYNTH's current instrumentation** `[S1][S3][S4][S5]`:
- **V5**: per-plan assumption audit (partial — covers plan-to-spec coherence for a target plan)
- **V6**: showboat walkthrough (post-remediation narrative compliance check)
- **V7**: adversarial audit (primary code-to-spec conformance verifier)
- **V9**: `cargo test` + `cargo check` + WAV demonstrations
- **V3/V4 partial**: foundation disclarity audit (covers some cross-document and decomposition-coverage checks but doesn't fully separate them)

**SYNTH's uninstrumented cells**: V1 (intent coherence), V2 (constraint compliance), V8 (inter-implementation integration), V10 (disposition closure — tracked implicitly via state machine but not verified as a separate pass).

The grid shows how much more verification surface exists in a fully-instrumented loop than SYNTH currently occupies. Each uninstrumented cell is a potential source of drift that can only be detected by filling the cell.

---

## §9. Portability and the gitignored-operational-knowledge problem

SYNTH evidence raises a question the abstract pattern must answer explicitly: **where does the pattern's own state live?**

In SYNTH, nothing about the verification apparatus is committed to the SYNTH git repository `[S2]`:

- `.claude/commands/adversarial-audit.md` — gitignored
- `.claude/plans/*.md` — gitignored
- `.planning/*.jsonl` (foundation audits, assumption audits, resolution task ledgers) — gitignored
- `ISSUES.jsonl` — gitignored
- `feedback_*.md`, `project_*.md`, `reference_*.md` files in `~/.claude/projects/-Users-david-Projects-MUSE-SYNTH/memory/` — in global Claude Code state, not in the SYNTH repo

This creates a **portability gap**:
- A fresh checkout of SYNTH does not carry the verification apparatus
- Another developer cannot reproduce the workflow without reconstructing the entire `.claude/`, `.planning/`, and memory layer
- The pattern survives only as long as the user's local state survives
- The pattern's history (27 feedback memory files documenting incidents and rules) is not part of the project's own record

**For any adoption of this pattern, the decision must be explicit.** Three defensible choices:

1. **Commit everything.** `.claude/`, `.planning/`, `ISSUES.jsonl`, and memory files all enter git. Full reproducibility; operational state visible to every contributor; history preserved.

2. **Commit infrastructure, ignore state.** Commands, schemas, protocols are committed; per-cycle findings and state remain local. Portable pattern template without exposing active workflow noise.

3. **Separate pattern infrastructure from pattern state.** Commands and schemas live in a dedicated repo (e.g., dot-claude). Per-project operational knowledge stays local. Pattern is reusable across projects but each instance owns its own incident record.

SYNTH's current choice is effectively "ignore everything." The pattern is project-local folklore.

---

## §10. Definition of "done" for a cycle

A cycle is complete when:

1. Intent, constraints, glossary exist and are stable
2. All specs derive from intent and respect constraints (V1, V2 pass — or are explicitly not-yet-instrumented)
3. Foundation audit has run for the current phase and all `blocks_planning=true` findings are `resolved` `[S5]`
4. Decomposition covers the full spec (V4 passes)
5. Per-plan assumption audit has run for each plan and all `blocks_plan_NN_start=true` findings are `resolved` `[S4]`
6. Every work unit has a plan that satisfies it (V5 passes)
7. Every plan has an implementation produced by a subagent (orchestrator-subagent boundary honored) `[S11]`
8. TDD cycle has run for each implementation (tests before code, green before refactor) `[S3]`
9. Demonstrations are rendered where applicable and human-verified (V9 + human ear/eye check) `[S7]`
10. Adversarial audit has run in fresh context for each sub-plan (V7 passes) `[S1][S12]`
11. Every finding from every audit has advanced through the lifecycle to `resolved` or is explicitly `blocked` awaiting user decision `[S4]`
12. Resolution task ledger shows every task `completed` or `blocked` `[S6]`
13. Showboat walkthrough has run after issue remediation (V6 passes) `[S3]`
14. Integration points agree across units (V8 passes — or explicitly deferred)
15. Health attestation is green at the time of verification (V9 passes)
16. Amendments are applied and the loop quiesces (no new findings on re-verification)
17. Completion log records the cycle
18. Decisions are logged as ADRs
19. Postmortem extracts lessons if the cycle surfaced any failure modes
20. Incident-derived operational rules have been codified as feedback memory files `[S11]`

Anything short of all twenty is an incomplete cycle — the pattern flags it as such, and the incompleteness itself becomes a finding for the next cycle.

---

## Sources

Provenance tags used throughout the document:

- **`[S1]`** — Session `2939e786-d946-4a46-aaf9-b1f81d81dd94`, 2026-04-03 23:38–23:54. The 7-deficiency critique of showboat-walkthrough-as-audit (23:38:14) and the `/adversarial-audit` command creation (23:50:56). Recovered from `ZCDFRAGMENT` table in `~/.claude/cache/chb/ClaudeHistory.sqlite`. First invocation at 23:54:07 (`/adversarial-audit Phase 0`).

- **`[S2]`** — `/Users/david/Projects/MUSE/SYNTH/CLAUDE.md` (433 lines). Project constraints, commit message rules ("aims not certainties"), gitignore conventions for `.claude/`, `.planning/`, `ISSUES.jsonl`.

- **`[S3]`** — `~/.claude/projects/-Users-david-Projects-MUSE-SYNTH/memory/feedback_adversarial_audit_pattern.md`. Fresh-context opus subagent pattern with explicit instruction set: exact spec file paths, exact implementation file paths, `cargo test` + `cargo check`, `ISSUES.jsonl` format, "do NOT fix anything — report only." Plus operational protocol from session `62ce645b-e2c9-43f9-80ef-70e7ad24faeb` 2026-04-05 10:09 describing the 10-step plan lifecycle (3a-3j) with adversarial audit at step 3g.

- **`[S4]`** — `~/.claude/projects/-Users-david-Projects-MUSE-SYNTH/memory/project_preimplementation_audit_methodology.md`. Failure_kind taxonomy (6 values + null), 18-field JSONL ledger format, finding state machine (`audited → researching → proposed → decided → implementing → resolved`), `blocks_plan_NN_start` gating rule. First applied to Plan 11D on 2026-04-10.

- **`[S5]`** — `~/.claude/projects/-Users-david-Projects-MUSE-SYNTH/memory/project_foundation_disclarity_audit.md`. Corpus-level audit scope, schema alignment with per-plan audit (16 of 18 fields shared), two field renames (`blocks_plan_NN_start` ↔ `blocks_planning`, `affected_plan` ↔ `affected_plans`). First applied to GUI phase 2026-04-10 with 64 findings, 19 blocking.

- **`[S6]`** — `~/.claude/projects/-Users-david-Projects-MUSE-SYNTH/memory/project_resolution_task_ledger.md`. 15-field task entry schema, 5 task kinds, 8-15 tasks per 30-80 finding audit rule, task lifecycle state machine, cross-audit finding references. First applied to GUI foundation audit 2026-04-10 (64 findings → 13 tasks: 3 research, 4 research-and-implementation, 3 implementation, 2 documentation, 1 verification).

- **`[S7]`** — `~/.claude/projects/-Users-david-Projects-MUSE-SYNTH/memory/feedback_dsp_demonstration.md`. Demonstration = playable WAV files via hound, not test assertions. Human ear is the verifier. Applies to any system with human-perceptible output.

- **`[S8]`** — Operational protocol section 1 from session `62ce645b-e2c9-43f9-80ef-70e7ad24faeb` 2026-04-05 10:09: "The user decides everything. The orchestrator (me) never acts without explicit user authorization." Origin of global mandate-001.

- **`[S9]`** — `~/.claude/projects/-Users-david-Projects-MUSE-SYNTH/memory/feedback_per_subplan_audit.md`. Per-sub-plan audit with cascading updates to downstream sub-plans when APIs change. Plus `feedback_audit_agent_read_before_write.md`: read ALL code before writing findings.

- **`[S10]`** — `~/.claude/projects/-Users-david-Projects-MUSE-SYNTH/memory/feedback_never_infer_decisions.md`. "Stripping options ≠ selecting the survivor; never set `resolution_chosen` without explicit user selection; hard forbidden action." Origin rule behind the `proposed → decided` state transition gate.

- **`[S11]`** — `~/.claude/projects/-Users-david-Projects-MUSE-SYNTH/memory/feedback_subagents_for_all_implementation.md` and MEMORY.md index. The orchestrator-subagent boundary rule: "orchestrator never edits code directly, always delegates." Plus the pattern of 27 `feedback_*.md` files accumulating incident-derived rules.

- **`[S12]`** — Session `b9bf0dce-2f2c-49c8-96d2-7579100c1ad7`, 2026-04-04 23:59:30: "Adversarial audit is next — that should start in a fresh context session for proper separation between implementation and review. The audit agent needs to not have written the code it's reviewing." Plus `ISSUES.jsonl` protocol: "If a subagent returns an issue: STOP. Report to user. User decides next action." Origin of global mandate-008.

All session-based evidence was recovered by direct SQLite queries against `~/.claude/cache/chb/ClaudeHistory.sqlite`, a Core Data store maintained by the Claude History Browser macOS app (source at `/Users/david/Projects/cc-browser`) via incremental JSONL parsing. The cc-history-api CLI's own SQLite database (`~/.claude/.claude-history.db`, source at `/Users/david/Projects/cc-history-api`) did not have SYNTH sessions indexed at the time of investigation and was not synced.
