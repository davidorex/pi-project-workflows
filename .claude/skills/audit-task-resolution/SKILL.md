---
name: audit-task-resolution
description: Audits a pi-context open task's proposed resolution against the codebase and the substrate conventions, then emits corrected, register-compliant, correctness-proven block bodies. Use when reviewing, auditing, or validating a task's proposed resolution before implementation, or when the user asks to check a task (TASK-NNN) for wrong, overly-complex, or non-best-practice assumptions.
---

<objective>
Audit one open task's proposed resolution — the task's own schema-declared fields plus the proposed_resolution of the gap, decision, or feature it addresses — for wrong, overly-complex, or non-best-practice assumptions, and emit corrected block bodies that pass every clause of the embedded register, filing-provenance, and derive-decisions-from-facts conventions and a fix-correctness proof. Every correction is emitted as operative output; nothing is left as a prose flag. One run per task. The agent audits and proposes; it never mutates the substrate. The orchestrator executes the filing manifest under the provenance-stop.
</objective>

<quick_start>
Invoke as `/audit-task-resolution TASK-<NNN>`. One read-only agent per task: reads the inputs via the pi-context CLI, verifies every assumption against current source, authors corrected block bodies plus a filing manifest, runs the zero-tolerance loop until one full pass finds no violation of any requisite criterion, writes the audit MD, and returns a verdict.
</quick_start>

<inputs>
Read via the pi-context CLI, one clean op per question, whole-node reads:
- `read-schema --schemaName tasks` — the fields under audit. Audit exactly the fields the schema declares; never assume a field (e.g. acceptance_criteria may live on the feature, not the task).
- `read-block-item --block tasks --id TASK-<NNN>` — the proposed resolution under audit.
- `find-references --id TASK-<NNN>`, then `read-block-item` on each addressed framework-gap, decision, and feature — the upstream proposed_resolution.
- `read-block --block conventions` — re-read live each run, then confirm against the `<conventions>` section below. The conventions are reproduced verbatim in `<conventions>`; that text, plus any further convention the item is bound by, is the authoritative standard. On any divergence between the embedded text and the live block, the live block governs and the divergence is reported as a skill-staleness defect to fix.
</inputs>

<conventions>
Verbatim from the active substrate's `conventions` block — the standard every corrected body, the audit MD, and the return message are measured against, clause by clause. Re-read live each run; on divergence the live block governs.

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
Verify every assumption against the current source in `packages/*/src`. Anchor on function names; line numbers are evidence for the MD only. An unconfirmed claim is "no evidence found," not a finding.

Find, each with a code citation: wrong assumptions about the code or APIs; over-complexity versus an existing util or pattern the codebase ships (name it); non-best-practice, fragility, or scope-creep; stale anchors; conflict with another open task on the same surface.

Close the cascade exhaustively: for every defect, enumerate via the CLI every block that carries the same defective anchor, code-region, or assumption (the addressed gap/decision/feature and any sibling on the same surface). Each enumerated block is either a corrected body below or an explicit no-change with its reason. A cascade asserted without that enumeration is incomplete.
</audit>

<corrected_bodies>
Emit one operative body per affected block field — the task's schema fields, and each cascade block field, including structured fields (e.g. an `evidence[].lines` range gets a replacement value). Current-truth only:
- declarative, terse, self-contained, exact;
- anchor on canonical identifiers only — function, type, op, relation_type, block, error-code, or named substrate artifact (relations.json, objects/, config.json). Banned: line numbers, line ranges, and source-tree file paths (anything under packages/, including a .ts or .schema.json filename) — name the type/op, not its file.
- no assert-then-refute, no prior-state phrasing;
- rationale lives in the decision body, not the task; a task body is an imperative.

Resolve every choice by derivation, not menu: determinable from registry, code, an existing surface, or a standing mandate → derive and state it with its basis; genuinely underdetermined → escalate to a framework-gap via a `decision_escalates_underdetermined` edge. Never a fork, a hedge, or "confirm with the user" in a body.

Hold provenance: every element is user-VERBATIM, user-DIRECTED, or DERIVABLE from a cited fact, convention, or decision. A story-bound criterion is diffed against the story's verbatim text.

Prove the fix: show against the source that it achieves the gap's goal and reintroduces no bug or sibling. An asserted-but-unproven fix is a failure.

Split the artifacts: refutation, evidence, line numbers, and the proof go in the audit MD; the bodies carry only clean current-truth.

Nothing identified as needing change is left as a flag or parked "out of scope." Every correction is an emitted body or field value here, plus an entry in the filing manifest. "Out of scope" lists only items that genuinely need no change.
</corrected_bodies>

<zero_tolerance_loop>
Requisite criteria — the full set every artifact is measured against:
- C1 Register: every body, the audit MD, and the return message satisfy EVERY numbered clause of the `<conventions>` text — rhetorical-register 1-6, filing-provenance 1-6, derive-decisions-from-facts 1-4. Measure clause by clause against the verbatim text, not a summary. The MD and return are a report and a communication: derive-decisions-from-facts and the communications register bind them in full; only the no-line-number / current-truth-only body rules are relaxed for the MD's evidence layer.
- C2 Anchors: no body contains a banned anchor (line number, line range, source-tree file path); every reference is a canonical identifier.
- C3 Provenance: every element of every body is user-VERBATIM, user-DIRECTED, or DERIVABLE with its basis cited.
- C4 Proof: each body's fix is proved against the source to achieve the goal and reintroduce no bug or sibling.
- C5 Operative: every identified correction is an emitted body/field value and a manifest entry; no prose flag, no correction parked out of scope.
- C6 Cascade: every block carrying the defect is enumerated and accounted (corrected body or explicit no-change reason).

Loop: author the bodies, the MD, the manifest, and the return. Run a full pass over C1-C6 against every artifact. On ANY violation, re-author the offending artifact, then re-run the ENTIRE pass from C1. Repeat until one complete pass finds zero violations across all criteria. Only a fully clean pass exits the loop. Never return on a violation; never report a violation as a terminal state — a discovered violation is re-authored, not surfaced as failure. If a body cannot be both register-clean and a proved-correct fix under the proposed approach, the corrected body states the sound alternative approach and the loop continues on that — the resolution being unsound is a converged audit verdict, never a gate-stop.
</zero_tolerance_loop>

<output>
Write `analysis/<YYYY-MM-DD>-audit-TASK-<NNN>-proposed-resolution.md`: the findings with citations, the cascade enumeration, the correctness proof per body, then a delimited corrected-block-bodies section — one fenced body per affected field plus a per-element provenance line — then a filing manifest: an ordered list of `block -> field -> operation -> guard` the orchestrator executes verbatim to file the corrections (enacted-decision changes routed through the provenance-stop).

Return: the MD path, a one-line verdict (SOUND or CORRECTED), the headline findings, the proof verdict, and confirmation the zero-tolerance loop converged — one full pass, zero violations across C1-C6.
</output>

<constraints>
Drive the pi-context CLI directly, one op per question, whole-node reads. Forbidden (hook-enforced): cat, Read, grep, or jq on `.context`, `config.json`, or `schemas`; piping CLI output; `2>/dev/null`; echo-banner narration. Source and git are readable. No substrate mutation. Every claim is a pasted command result or a source citation; if blocked, stop and report.
</constraints>

<anti_patterns>
- Grading bodies against a summarized checklist instead of clause-by-clause against the verbatim `<conventions>` — the checklist drifts narrower than the standard.
- A flag, "out of scope" parking, or any non-operative note standing in for a correction that an emitted body/field + manifest entry should carry.
- Narrating why the skill or the task exists — the output is current-truth instruction, not history.
- A line number or source-tree file path in a block body — anchor on canonical identifiers; keep line numbers in the MD.
- Surfacing a derivable choice as a fork or "confirm with the user."
- Returning on a violation instead of re-authoring and re-running the loop to zero.
</anti_patterns>

<success_criteria>
- The zero-tolerance loop converged: one full pass over C1-C6 with zero violations across every body, the MD, and the return.
- Every body satisfies every clause of the embedded register, every anchor is canonical, every element is provenance-classed, every fix is proved.
- Every identified correction is operative — an emitted body/field plus a manifest entry; nothing flagged, nothing parked.
- The cascade is enumerated and closed; an enacted-decision change is routed through the provenance-stop in the manifest.
</success_criteria>
