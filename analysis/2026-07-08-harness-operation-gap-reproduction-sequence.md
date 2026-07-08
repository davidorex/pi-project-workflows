Survey's key finding reframes the task: `../workflowsPiExtension` isn't a failed clone of this harness — it's the **upstream pi-context dev repo**, and most of the scaffolding is native and, for the substrate, richer than wasc's. So your "woefully unfinished and unsuccessful" is not about missing files. It's the gap between *having the scaffolding* and *the loop actually firing session-to-session*. That gap is what to fix, and it's a short list.

## Critical evaluation — why the operation doesn't reproduce (not the files, the firing)

**1. No per-turn mandate injection — the single biggest lever.** Here, a `UserPromptSubmit` hook re-injects the 9 mandates on *every* turn. That is why, across ~20 IMPL/audit cycles this session, I never once drifted into "good enough," never stopped-and-asked on an in-loop finding, never accepted a non-zero audit. Upstream keeps its "behavioral mandates" in indexed memory files (`CLAUDE.md:228`) — read at session start, then *forgotten mid-session*. Without the every-turn reminder the LLM regresses to its defaults: patch-and-move-on, self-certify, treat one green as done. Iterate-to-zero dies of attrition, not ignorance.

**2. The audit gate isn't structurally *forced*.** Here, "done" is machine-refused without proof: `complete-task` files the `verification_verifies_item` edge and the `completed-task-has-verification` invariant makes `context-validate` fail a completed task with no VER. And the audit is a **separate agent from the implementer**, ending in a literal `Total findings: N` the orchestrator parses. Upstream has the invariant (survey: enforced) but the *discipline* — separate-agent audit, findings-count gate — lives only in prose. Prose discipline is optional under pressure; a failing `context-validate` is not. If the loop can self-declare done, it will.

**3. Criteria-first is the contract iterate-to-zero verifies against.** Here, acceptance_criteria are filed into `.context` **before** any IMPL, then the audit and the VER `criteria_results` check *each one by id*. That's what gives the loop a target — "zero" means "every criterion, verified." Without criteria-before-IMPL, an audit has nothing to iterate *toward*, so it degenerates into vibes.

**4. State-continuity: "derive, never cache" only works if derivation works.** Upstream's model (`CLAUDE.md:51`, derive from `.context`, no cached spine) is elegant *if* `context-current-state` actually derives — but here that op is config-gated and returns "state-derivation not configured." If it's degraded upstream too, every session re-discovers state → the operation *feels* unfinished because there's no reliable "where are we / what next" surface. wasc's decomposed-JSON spine (`pending-actions` focus + `ORCHESTRATOR-LOG` + `subagent-invocations`) is the cheap, always-current answer to that — the thing you just asked me to guarantee zero-loss on.

## Exact reproduction sequence

Do these in order in `workflowsPiExtension`; 1–3 are the ones that make iterate-to-zero actually fire.

1. **Add `MANDATES.md` + a `UserPromptSubmit` hook that injects it every turn.** Copy wasc's `MANDATES.md` (9 mandates) and `.claude/settings.json`'s `UserPromptSubmit` hook verbatim; adapt paths. This alone converts the mandates from "read once" to "binding each turn." Non-negotiable — it's the operational spine of the discipline.

2. **Encode iterate-to-zero as a *gated procedure*, not prose.** In its `CLAUDE.md`, state the loop explicitly: audit finding → re-explore the finding's root → corroborate vs source → re-plan → re-IMPL → **separate-agent** re-audit → repeat until `Total findings: 0`; `done ≡ (deterministic gate exit 0) AND (audit findings == 0)`; in-loop findings loop, distinct new issues file per mandate-007, never stop-and-ask a policy-determined fix. Add the DEC-58 rule (bounded autonomous re-dispatch only on a deterministic gate, hard iteration cap, separate audit still mandatory).

3. **Make the audit structurally unavoidable.** Confirm `complete-task` requires a `verificationId` and that `completed-task-has-verification` is an *error* (not warning) in its `.context/config.json` invariants (it is, per survey — keep it). Add the convention: the auditor is a fresh unnamed agent, never the implementer, ending in `Total findings: N`. File `acceptance_criteria` on every task **before** IMPL; require the VER to carry `criteria_results` verifying each by id.

4. **Fix or replace the state-continuity surface.** Test `pi-context context-current-state --cwd .` there. If it derives cleanly → adopt an `orient` skill that injects it at session start (port wasc's `orient` pattern). If it's degraded → either wire its `state_derivation` config, or add a thin cached spine (a `pending-actions`/focus + append-only event log) as wasc did. Either way there must be a one-command "where are we / what next."

5. **Add the missing session skills.** Port `orient` (session-start live-state injector — the zero-loss entry point) and a `validate-context`/currency-audit runner. Upstream already has `audit-substrate-currency` + `repo-guide`; the gap is specifically the **session-start orientation injector**.

6. **Adopt the agent-dispatch + write conventions that keep the loop mechanical.** Unnamed foreground agents only (a named teammate idles and its report is unreachable — the loop silently stalls); `git commit -F` from a system tmp file; one atomic mutating step per turn, read-before-edit, observed-green-before-commit, verify-by-reread. These are why the loop here never left a dirty tree or a false-green.

The upstream got the hard parts (substrate, pipeline shape, invariants, guard hooks) — it's steps **1, 2, 3** that turn a documented harness into one that *operates*: mandates forced every turn, the loop gated on a separate audit reaching zero, and a criteria contract for it to reach zero *against*.

**Context note:** I'm at ~94% and autocompact is imminent. This analysis concerns `workflowsPiExtension`, not wasc, so it isn't in wasc's spine; if you want it durable, say the word and I'll drop it into a file (its natural home is a doc in that repo, or your findings ledger) before compaction takes it.
