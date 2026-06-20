---
name: audit-task-resolution
description: Audits a pi-context open task's proposed resolution against the codebase and the substrate conventions, then emits corrected, register-compliant, correctness-proven block bodies. Use when reviewing, auditing, or validating a task's proposed resolution before implementation, or when the user asks to check a task (TASK-NNN) for wrong, overly-complex, or non-best-practice assumptions.
---

<objective>
Audit one open task's proposed resolution — the task's schema-declared fields plus the proposed_resolution of the gap, decision, or feature it addresses — for wrong, overly-complex, or non-best-practice assumptions, and emit corrected block bodies that satisfy every clause of the embedded conventions and a fix-correctness proof. Every correction is operative output; nothing is a prose flag. One run per task. The agent proposes; it never mutates the substrate. The orchestrator executes the filing manifest under the provenance-stop.
</objective>

<quick_start>
Invoke as `/audit-task-resolution TASK-<NNN>`. One agent, substrate-read-only, writes one analysis MD: reads the inputs via the pi-context CLI, verifies every assumption against source, authors corrected bodies plus a filing manifest, and runs the zero-tolerance loop until one full pass clears every criterion.
</quick_start>

<inputs>
Read via the pi-context CLI, one clean op per question, whole-node reads:
- `read-schema --schemaName tasks` — the fields under audit. Audit exactly the fields the schema declares; never assume a field (e.g. acceptance_criteria may live on the feature, not the task).
- `read-block-item --block tasks --id TASK-<NNN>` — the proposed resolution under audit.
- `find-references --id TASK-<NNN>`, then `read-block-item` on each addressed framework-gap, decision, and feature — the upstream proposed_resolution.
</inputs>

<conventions>
Verbatim from the active substrate's `conventions` block — the standard every corrected body, the audit MD, and the return message are measured against, clause by clause.

rhetorical-register:
Every block write follows this register; it also governs communications.
1. Write declarative statements. Not prose, not narration.
2. Be terse and signal-dense. No perambulation, ceremony, recap, or hedging.
3. Make each entry self-contained — the literal instruction a downstream consumer acts on, standing alone.
4. Be exact and concrete. Not opaque, not abstract for its own sake.
5. State current truth only. No provenance, git, or prior-state narration in block bodies; never assert-then-refute — edit to current truth on correction.
6. Write for the consumer and the purpose — no more, no less; appropriate to the block type and its downstream use.

filing-provenance:
Every semantic element of a planning-block filing (criterion, qualifier, mode, flag, scope word, default, tier) carries one of three provenances: user-VERBATIM, user-DIRECTED, or DERIVABLE from a cited fact/convention/decision. Anything else is augmentation and does not go in.
1. A qualifier that narrows or conditions what the user said — a mode, an opt-in, a flag, a tier, a deferral — is never derivable: it is either the user's recorded decision (cited) or absent.
2. An item bound to user stories (task_advances_story / feature_advances_story / item_derived_from_item -> STORY-*) is DIFFED against the stories' verbatim statements at filing: every delta is a cited user decision or a defect in the draft.
3. Updates inherit the test: every element carried forward is re-checked; inherited augmentation is augmentation.
4. Brief-level enforcement: every explore / plan / probe brief for a story-bound item includes the verbatim-delta check — 'do the filed criteria narrow, qualify, or add to the stories' statements? any delta is a filing defect to surface, not a requirement to implement.' A brief that lacks it is incomplete; downstream work that executes an un-cited qualifier is built on a filing defect and does not stand as authority.
5. Write-time enforcement: the planning-block write guard STOPS the write; the model ends its turn presenting the user a per-element provenance table (element -> provenance class -> evidence); the provenance-reviewed sentinel attests the USER's granted permission for that payload, never self-review.
6. Filing permission comes only from the user: re-issuing a guarded write without the user's grant — in the same turn or otherwise — is a violation, not a review.
Filings are composed verbatim into downstream contexts — an augmentation at filing becomes the requirement everywhere it is consumed.

derive-decisions-from-facts:
A design or routing choice determinable from the system's own facts is a decision to DERIVE, RESOLVE, and FILE — never a fork surfaced to the user. Apply when authoring any plan, decision, or report.
1. Before surfacing any 'your call' / 'fork' / 'decide between', run the derivation test: can the choice be determined from (a) the registry / code / data structure, (b) an existing surface or convention, or (c) a standing mandate (best-of-breed / no-deferral / agent-primary)? If yes to ANY, it is a decision to make and state with its derivation shown — not a question to ask.
2. Escalate to the user ONLY a choice genuinely underdetermined by the facts — irreducible taste, or information the system does not contain — and name WHY it is underdetermined; capture it as a framework-gap and mark the decision decision_escalates_underdetermined -> that gap.
3. For grouping / classification / ordering, prefer a pure function over the system's own structure (a reflecting surface derives from its registry); never a hand-curated parallel list that drifts.
4. Surfacing a derivable choice as an open menu is options-proliferation and hedging — the same defect as listing inferior options or deferring known work. Resolve it; do not present it.
</conventions>

<audit>
Verify every assumption against the current source in `packages/*/src`. Anchor on the entity name; line numbers are evidence for the MD only. An unconfirmed claim is "no evidence found," not a finding.

Find, each with a code citation: wrong assumptions about the code or APIs; over-complexity versus a util or pattern the codebase ships (name it); non-best-practice, fragility, or scope-creep; stale anchors; conflict with another open task on the same surface.

Close the cascade: enumerate via the CLI every block that carries the same defective anchor, code-region, or assumption. Each is a corrected body below or an explicit no-change with its reason. A cascade asserted without that enumeration is incomplete.
</audit>

<corrected_bodies>
Emit one operative body per affected field — the task's schema fields and each cascade-block field, including structured fields (an `evidence[].lines` range gets a replacement value). Nothing identified as needing change is left as a flag or parked out of scope; every correction is a body/field value here plus a filing-manifest entry. Each body:
- declarative, terse, self-contained, exact; current-truth only; no assert-then-refute, no prior-state phrasing.
- anchors on the logical entity's registered name — function, type, op, relation_type, schema `$id`/name, block, error-code. Banned: any filesystem path and any line number — name the entity, never its file.
- a task body is an imperative; rationale lives in the decision body.
- every element is user-VERBATIM, user-DIRECTED, or DERIVABLE with cited basis; a story-bound criterion is diffed against the story's verbatim text.
- resolves every choice by derivation; a genuinely underdetermined choice escalates to a framework-gap via a `decision_escalates_underdetermined` edge — never a fork, hedge, or "confirm with the user."
- proves its fix against the source: it achieves the gap's goal and reintroduces no bug or sibling. An asserted-but-unproven fix fails.

Refutation, evidence, line numbers, and the proof live in the audit MD; the bodies carry only clean current-truth.
</corrected_bodies>

<zero_tolerance_loop>
The criteria enforce the rules above:
- C1 every body, the audit MD, and the return satisfy every numbered clause of the `<conventions>` text — measured clause by clause, not by summary. The MD and return are a report + communication: derive-decisions-from-facts and register clauses 1-4,6 bind them; the body-only rules (clause 5 current-truth, the no-path/no-line-number anchor ban) are relaxed for the MD's evidence layer.
- C2 every anchor is a registered entity name; no body contains a filesystem path or line number.
- C3 every body element is provenance-classed with cited basis.
- C4 each body's fix is proved against the source.
- C5 every correction is an emitted body/field plus a manifest entry; no flag, nothing parked out of scope.
- C6 the cascade is enumerated and every carrying block accounted.

Author the bodies, the MD, the manifest, and the return; run a full pass over C1-C6; on any violation re-author the offending artifact and re-run the entire pass from C1; exit only on one complete pass with zero violations. Never return on a violation — re-author it. A proposed approach that cannot be both register-clean and proved-correct converges to the sound alternative stated in the body; an unsound resolution is a converged verdict, never a gate-stop.
</zero_tolerance_loop>

<output>
Write `analysis/<YYYY-MM-DD>-audit-TASK-<NNN>-proposed-resolution.md`: findings with citations, the cascade enumeration, the per-body correctness proof, a delimited corrected-block-bodies section (one fenced body per field plus a per-element provenance line), then a filing manifest — an ordered list of `block -> field -> operation -> guard` the orchestrator executes verbatim to file the corrections, enacted-decision changes routed through the provenance-stop.

Return: the MD path, the verdict (SOUND or CORRECTED), the headline findings, the proof verdict, and confirmation the loop converged — one full pass, zero violations across C1-C6.
</output>

<constraints>
Drive the pi-context CLI directly, one op per question, whole-node reads. Forbidden (hook-enforced): cat, Read, grep, or jq on `.context`, `config.json`, or `schemas`; piping CLI output; `2>/dev/null`; echo-banner narration. Source and git are readable. No substrate mutation. Every claim is a pasted command result or a source citation; if blocked, stop and report.
</constraints>

<success_criteria>
The zero-tolerance loop converged: one full pass over C1-C6 with zero violations across every body, the audit MD, and the return.
</success_criteria>
