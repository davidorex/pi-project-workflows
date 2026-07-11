# Hedge/fork provenance audit — conventions shard (2026-07-11)

Scope: 10 `conventions.json` (`rules`) items scanner-flagged for fork / deferral / modal-hedge. Procedure per `analysis/2026-07-11-gap-fork-provenance-audit-brief-template.md`. Each item read fresh via `pi-context read-block-item --block conventions --id <id> --json`.

Cross-cutting finding: the scanner flags *categories* (presence of `or`, `either`, `until`, `later`, slash-enumeration), not unresolved authorial hedges. Every flagged clause in this shard is one of: (a) a slash-separated enumeration of instances, (b) a conditional rule-branch prescribing complete valid actions per a stated antecedent, (c) a two-legal-state enforcement enumeration that explicitly *closes* the fork, or (d) named lifecycle language (backfill-then-raise / until-guard-exists) recording a standing plan. None is an LLM-invented hedge about a genuinely open design question. The brief's own guidance — "a convention correctly ENUMERATING categories is not the same as a convention HEDGING on which category applies" — governs the self-referential ones (`filing-provenance`, `derive-decisions-from-facts`, `rhetorical-register`). **No corrections made; all 10 grounded.**

---

## actionable-state-renders-name-remedy (flagged: fork) — GROUNDED, no correction
Flagged clause: "The durable form is a shared state->op remedy map consumed by every such render, not per-render hand-written literals whose omission is how coverage drifts."
Verdict: **DERIVABLE / definitional.** This states a single resolved durable form (a shared remedy map) with its negation (not per-render literals) — the "not X" is contrast, not an unresolved alternative. The other slash spans ("drift / validation / install / bootstrap / conflict / blocked", "renderConflicts (-> resolve-conflict) / renderBlocked (-> resolve-blocked)") are instance enumerations, not forks. Enforcement stated definitively ("review at every op-render authoring"). No branch to correct.

## derive-decisions-from-facts (flagged: deferral, fork) — GROUNDED, no correction
Flagged clauses: deferral — "decision-shows-derivation is severity warning until the existing decisions are backfilled, then raised to error (the convention-articulation clean-after-backfill pattern)"; fork — "requires EITHER a decision_derived_from_item edge ... OR a decision_escalates_underdetermined edge ... there is no silent-fork third state."
Verdict: **definitional (both).** The deferral is a *named* lifecycle pattern (backfill-then-raise) recording a standing plan, not an unresolved punt. The "EITHER/OR" enumerates the two legal structural states of the enforcement and explicitly forecloses a third ("there is no silent-fork third state") — this convention IS the anti-fork rule; its category enumeration `(a)/(b)/(c)` of derivation sources is definitional per the brief. No branch to correct.

## error-invariant-transition-atom (flagged: fork) — GROUNDED, no correction
Flagged clause: "No atom → either build the atom first, or declare at warning (observe-only ...)."
Verdict: **definitional decision-procedure branch.** Both arms are complete valid actions the author instructs, conditioned on the stated antecedent (no transition atom exists). This is a rule prescribing the reader's two legitimate paths, not authorial indecision about an open question. Companion clause "the invariant stays warning until that affordance exists" is the same until-affordance lifecycle form. No branch to correct.

## feature-branch-workflow (flagged: modal-hedge) — GROUNDED, no correction
Flagged clause: "The integration branch is whatever the current arc is based on — context-jit-spec-v2 now, main or a dev branch later; the rule is general, not tied to a specific branch name."
Verdict: **generality statement, not a hedge.** "main or a dev branch later" is the convention deliberately abstracting the rule away from a specific branch name (stated explicitly: "the rule is general"). The remaining body is uniformly declarative and imperative (accept/reject procedures, "never on the feature branch"); no weak modal verbs. No branch to correct.

## feature-decomposition (flagged: deferral) — GROUNDED, no correction
Flagged clause: "If a fix needs a design choice that is not yet made, file the choice as a decision first. The task that depends on it stays unwritten until that decision is filed."
Verdict: **sequencing rule.** "stays unwritten until" prescribes ordering (decision precedes dependent task), a rule the author states definitively — not a deferral of unspecified work. No branch to correct.

## filing-provenance (flagged: deferral, fork) — GROUNDED, no correction
Flagged clauses: category enumeration "user-VERBATIM, user-DIRECTED, or DERIVABLE"; example list "a mode, an opt-in, a flag, a tier, a deferral"; "it is either the user's recorded decision (cited) or absent."
Verdict: **definitional (all).** This is the provenance convention itself; its three-way category enumeration and its two-legal-state clause ("recorded decision or absent") are definitional per the brief's explicit priming. The "deferral" token is one *example* of a qualifier kind being listed, not a deferral being made. No branch to correct.

## gap-arc-coherence (flagged: fork) — GROUNDED, no correction
Flagged clauses: "A gap is bound to an arc or explicitly standalone — never an unbound member"; "bind both under a feature per feature-decomposition, or record why they stay standalone."
Verdict: **two-legal-state rule / conditional branch.** First clause enumerates the two legal states of a gap (bound / explicitly-standalone) and forecloses the illegitimate third ("never an unbound member") — the same fork-closing shape as `derive-decisions-from-facts`. Second is a rule-branch prescribing valid actions. No branch to correct.

## op-command-surface-parity (flagged: fork) — GROUNDED, no correction
Flagged clauses: "has a reachable `/context` subcommand, or a recorded reason it is intentionally not operator-facing"; "requires either a `/context` subcommand reaching it or an entry in a recorded intentional-exemption set."
Verdict: **two-legal-state coverage rule; durable form already de-forked.** The "or" clauses enumerate the two compliant states of an operator-action op (has command / recorded exemption). The durable-form sentence is now definitive — "parity-check is extended to the `/context` surface, so an operator-action op with no command and no recorded exemption fails the gate" — with no implementation alternative. Confirmed by commit cac02b9a ("correct ... the guard fix is extending parity-check, not a fork"), which struck the prior co-equal "OR derive /context commands from the op-registry" branch. Current text carries no residual fork. No branch to correct.

## rhetorical-register (flagged: fork) — GROUNDED, no correction
Flagged clause: "No provenance, git, or prior-state narration in block bodies" / "Write for the consumer and the purpose — no more, no less."
Verdict: **slash-enumeration, not a fork.** The flagged "or" is an enumeration of prohibited narration kinds. "no more, no less" is a sufficiency directive, not a choice between alternatives. This convention explicitly bans hedging ("No perambulation, ceremony, recap, or hedging" / "never assert-then-refute") — it contains no unresolved fork of its own. No branch to correct.

## subagent-dispatch-fit (flagged: fork) — GROUNDED, no correction
Flagged clause: "Any task whose decisive step RUNS code or WRITES ... goes to an executing agent (general-purpose) or the orchestrator runs it; never Explore."
Verdict: **enumeration of valid actors / rule.** The "or" enumerates the two legitimate non-Explore destinations for run/write work and forecloses the wrong one ("never Explore"). The "read / trace / enumerate" span is instance enumeration. No unresolved design fork. No branch to correct.
