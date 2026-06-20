---
name: audit-task-resolution
description: Audits a pi-context open task's proposed resolution against the codebase and the substrate conventions, then emits corrected, register-compliant, correctness-proven block bodies. Use when reviewing, auditing, or validating a task's proposed resolution before implementation, or when the user asks to check a task (TASK-NNN) for wrong, overly-complex, or non-best-practice assumptions.
---

<objective>
Audit one open task's proposed resolution — its description and acceptance_criteria, plus the proposed_resolution of the gap, decision, or feature it addresses — for wrong, overly-complex, or non-best-practice assumptions, and emit corrected block bodies that pass the substrate's rhetorical-register, filing-provenance, and derive-decisions-from-facts conventions and a fix-correctness proof. One run per task. The agent audits and proposes; it never mutates the substrate. The orchestrator verifies the load-bearing claim and files under the provenance-stop.
</objective>

<quick_start>
Invoke as `/audit-task-resolution TASK-<NNN>`. One read-only agent per task: reads the inputs via the pi-context CLI, verifies every assumption against current source, emits corrected block bodies that clear the zero-tolerance gate, writes the audit MD, and returns a verdict.
</quick_start>

<inputs>
Read via the pi-context CLI, one clean op per question, whole-node reads:
- `read-block-item --block tasks --id TASK-<NNN>` — the proposed resolution under audit.
- `find-references --id TASK-<NNN>`, then `read-block-item` on each addressed framework-gap, decision, and feature — the upstream proposed_resolution.
- `read-block --block conventions` — re-read live each run to catch evolution, then confirm against the `<conventions>` section below. The three governing conventions are reproduced verbatim in `<conventions>`; that text, plus any further convention the item is bound by, is the authoritative standard the corrected bodies and the gate are measured against. On any divergence between the embedded text and the live block, the live block governs and the divergence is reported as a skill-staleness defect to fix.
</inputs>

<conventions>
Verbatim from the active substrate's `conventions` block — the standard the corrected bodies and the zero-tolerance gate are measured against. Re-read live each run; on divergence the live block governs.

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

Find, each with a code citation: wrong assumptions about the code or APIs; over-complexity versus an existing util or pattern the codebase ships (name it); non-best-practice, fragility, or scope-creep; stale anchors; conflict with another open task on the same surface; cascade — every upstream block (gap, decision, feature) the correction must also change.
</audit>

<corrected_bodies>
Emit one body per affected block (task description, task acceptance_criteria, and each cascade block), current-truth only:
- declarative, terse, self-contained, exact;
- no assert-then-refute, no prior-state phrasing, no line numbers or file paths in the body — function-name anchors only;
- rationale lives in the decision body, not the task; a task body is an imperative.

Resolve every choice by derivation, not menu: determinable from registry, code, an existing surface, or a standing mandate → derive and state it with its basis; genuinely underdetermined → escalate to a framework-gap via a `decision_escalates_underdetermined` edge. Never a fork, a hedge, or "confirm with the user" in a body.

Hold provenance: every element is user-VERBATIM, user-DIRECTED, or DERIVABLE from a cited fact, convention, or decision. A story-bound criterion is diffed against the story's verbatim text.

Prove the fix: show against the source that it achieves the gap's goal and reintroduces no bug or sibling. An asserted-but-unproven fix is a failure.

Split the artifacts: refutation, evidence, line numbers, and the proof go in the audit MD; the bodies carry only clean current-truth.
</corrected_bodies>

<validation>
Zero-tolerance gate, run before returning. Measure every proposed body against the `<conventions>` text — rhetorical-register, filing-provenance, derive-decisions-from-facts — as the authoritative standard; the enumerated checks below are that standard's operative form, not a substitute for it. Reject any proposed body containing: a refute or prior-state phrase; a line number or file path; rationale in a task body; a hedge, fork, or unspecified bucket; an element that is not user-VERBATIM, user-DIRECTED, or DERIVABLE; a fix whose correctness is not proved. Re-author until none remain. If a body cannot be both register-clean and a proved-correct fix, stop and report why — never ship deviating or unproven text.
</validation>

<output>
Write `analysis/<YYYY-MM-DD>-audit-TASK-<NNN>-proposed-resolution.md`: the findings with citations, the correctness proof, the gate result, then a delimited corrected-block-bodies section — one fenced body per affected block plus a per-element provenance line.

Return: the MD path, a one-line verdict (SOUND or CORRECTED), the headline findings, the proof verdict, and confirmation the gate passed.
</output>

<constraints>
Drive the pi-context CLI directly, one op per question, whole-node reads. Forbidden (hook-enforced): cat, Read, grep, or jq on `.context`, `config.json`, or `schemas`; piping CLI output; `2>/dev/null`; echo-banner narration. Source and git are readable. No substrate mutation. Every claim is a pasted command result or a source citation; if blocked, stop and report.
</constraints>

<anti_patterns>
- Narrating why the skill or the task exists — the output is current-truth instruction, not history.
- A line number in a block body — they drift; anchor on function names, keep line numbers in the MD.
- Surfacing a derivable choice as a fork or "confirm with the user."
- Relaying a plausible fix without proving it against the source.
</anti_patterns>

<success_criteria>
- The audit MD exists with findings, a correctness proof, and the gate result.
- Every corrected body passes the zero-tolerance gate — no register, provenance, or proof deviation.
- The fix is proved to achieve the gap's goal without reintroducing it; an underdetermined choice is escalated, not menued.
- Cascade blocks are included; an enacted-decision change is flagged.
</success_criteria>
