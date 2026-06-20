---
name: audit-task-resolution
description: Audits a pi-context open task's proposed resolution against the codebase and the substrate conventions, then emits corrected, register-compliant, correctness-proven block bodies. Use when reviewing, auditing, or validating a task's proposed resolution before implementation, or when the user asks to check a task (TASK-NNN) for wrong, overly-complex, or non-best-practice assumptions.
---

<objective>
Audit one open task's proposed resolution — the task's schema-declared fields plus the proposed_resolution of the gap, decision, or feature it addresses — for wrong, overly-complex, or non-best-practice assumptions, and emit corrected block bodies that satisfy every clause of the embedded conventions and a fix-correctness proof. Every correction is operative output; nothing is a prose flag. One run per task. The agent proposes; it never mutates the substrate. The orchestrator executes the filing manifest under the provenance-stop.
</objective>

<quick_start>
Invoke as `/audit-task-resolution TASK-<NNN>`. The invocation itself engages the loop's gate: a `UserPromptSubmit` hook writes the run's active sentinel `tmp/audit-loop-state/active-TASK-<NNN>` before you run — you operate inside an already-engaged gate and never create or own the sentinel. Then: one agent, substrate-read-only, reads the inputs via the pi-context CLI, verifies every assumption against source, and authors one analysis MD containing the corrected bodies, filing manifest, and proofs in the machine format below. The Stop hook running the deterministic checker enforces the loop; after it is clean, dispatch the `audit-critic` subagent, surface its verdict, and await the user's ratification turn.
</quick_start>

<inputs>
Read via the pi-context CLI, one clean op per question, whole-node reads:
- `read-schema --schemaName tasks` — the fields under audit. Audit exactly the fields the schema declares; never assume a field (e.g. acceptance_criteria may live on the feature, not the task).
- `read-block-item --block tasks --id TASK-<NNN>` — the proposed resolution under audit.
- `find-references --itemId TASK-<NNN>`, then `read-block-item` on each addressed framework-gap, decision, and feature — the upstream proposed_resolution.
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
Verify every assumption against the current source in `packages/*/src`. Anchor on the entity name; line numbers are evidence for the MD's evidence appendix only. An unconfirmed claim is "no evidence found," not a finding.

Find, each with a code citation: wrong assumptions about the code or APIs; over-complexity versus a util or pattern the codebase ships (name it); non-best-practice, fragility, or scope-creep; stale anchors; conflict with another open task on the same surface.

Close the cascade: enumerate via the CLI every block that carries the same defective anchor, code-region, or assumption. Each is a corrected body below or an explicit `no-change: <ID> — <reason>` line. A cascade asserted without that enumeration is incomplete.
</audit>

<corrected_bodies>
Emit one operative body per affected field — the task's schema fields and each cascade-block field, including structured fields (an `evidence[].lines` range gets a replacement value). Nothing identified as needing change is a flag or parked; every correction is a body/field value here plus a filing-manifest entry. Each body:
- declarative, terse, self-contained, exact; current-truth only; no assert-then-refute, no prior-state phrasing.
- anchors on the logical entity's registered name — function, type, op, relation_type, schema `$id`/name, block, error-code. Banned: any filesystem path and any line number — name the entity, never its file.
- a task body is an imperative; rationale lives in the decision body.
- every element is user-VERBATIM, user-DIRECTED, or DERIVABLE with cited basis; a story-bound criterion is diffed against the story's verbatim text.
- resolves every choice by derivation; a genuinely underdetermined choice escalates to a framework-gap via a `decision_escalates_underdetermined` edge — never a fork or "confirm with the user."
- proves its fix against the source: it achieves the gap's goal and reintroduces no bug or sibling. An asserted-but-unproven fix fails.

Refutation, evidence, line numbers, and the proof live in the audit MD's evidence appendix; the bodies carry only clean current-truth.
</corrected_bodies>

<output>
Write `analysis/<YYYY-MM-DD>-audit-TASK-<NNN>-proposed-resolution.md`. The deterministic checker parses this exact machine format; emit it field-for-field.

Corrected bodies, between the exact markers:
```
<!-- BEGIN CORRECTED BODIES -->
### <BLOCK-ID> — `<field>`
```
<corrected body text — no filesystem path, no line number>
```
Provenance:
- <element> — <VERBATIM|DIRECTED|DERIVABLE>: <evidence/citation>
- <element> — <VERBATIM|DIRECTED|DERIVABLE>: <evidence/citation>
<!-- END CORRECTED BODIES -->
```
Each entry is a header `### <BLOCK-ID> — \`<field>\`` (em-dash U+2014; field in backticks; BLOCK-ID like FGAP-002 / DEC-0002 / FEAT-001), then exactly one fenced block (non-empty), then a `Provenance:` line followed by one-or-more bullets. Repeat per affected field.

For a cascade block covered but unchanged, a line anywhere in the MD:
```
no-change: <ID> — <reason>
```

Filing manifest, between the exact markers — exactly one row per corrected (BLOCK-ID, field) and vice-versa (the checker asserts the bijection); four `->`-separated non-empty cells per row:
```
<!-- BEGIN FILING MANIFEST -->
- <block-kind> -> <field> -> <operation> -> <guard>
<!-- END FILING MANIFEST -->
```

Optional evidence appendix, between the exact markers — the ONLY place exempt from the hedge scan, and where line numbers, file references, refutation, and `Proof:` lines live (corrected bodies are NEVER exempt):
```
<!-- BEGIN EVIDENCE APPENDIX -->
Proof: <BLOCK-ID> — <how the fix achieves the gap's goal against the cited entity; reintroduces no bug or sibling>
<findings with citations, the cascade enumeration, per-body line-number evidence>
<!-- END EVIDENCE APPENDIX -->
```
Every identifier cited in a Provenance bullet or a `Proof:` line must resolve: substrate ids via the substrate index; `block:<name>` to a schema file; `pi-context://schemas/<name>` to that schema $id; a backtick-quoted token to a relation_type, block kind, schema name/$id, or an exported source function/type/interface. An unresolved citation fails the checker.

Return: the MD path, the verdict (SOUND or CORRECTED), the headline findings, the proof verdict, the checker's clean result, and the `audit-critic`'s per-clause verdict surfaced for the user.
</output>

<zero_tolerance_loop>
The loop is enforced by the Stop / SubagentStop hook running the deterministic checker; the authoring agent CANNOT self-exit. The criteria:
- C1 every body, the audit MD, and the return satisfy every numbered clause of the `<conventions>` text — measured clause by clause. The MD and return are a report + communication: derive-decisions-from-facts and register clauses 1-4,6 bind them; the body-only rules (register clause 5 current-truth, the no-path/no-line-number anchor ban) are relaxed for the MD's evidence appendix.
- C2 every anchor is a registered entity name; no body contains a filesystem path or line number.
- C3 every body element is provenance-classed with cited basis that actually holds.
- C4 each body's fix is proved against the source and the proof holds.
- C5 every correction is an emitted body/field plus exactly one manifest row, and vice-versa.
- C6 the cascade is enumerated and every carrying block is a corrected body or an explicit no-change.

C2, C5, C6, identifier resolution, the hedge/punt scan, and structure are checked deterministically by the Stop hook; on any violation the hook BLOCKS the turn and feeds the violation set back — the agent re-authors the offending artifact and the loop re-enters. There is no failure-exit: a violation re-enters; it never aborts. When the same violation set persists across 3 consecutive checks the hook escalates to the human with the persistent set and STILL re-enters — it does not abort.

C1, C3, C4 are judgment criteria. After the deterministic checks pass, dispatch the `audit-critic` subagent (fresh context — not the author, not the orchestrator) to judge C1/C3/C4 per clause against the verbatim conventions. Surface its per-clause verdict to the user. The user grants ratification by a turn that names TASK-<NNN> and approves it in natural language (ratify / approve / looks good / lgtm / sign off); only a genuine `user`-role turn clears the gate — an agent-written line never satisfies it.
</zero_tolerance_loop>

<scope>
Your task is to author the audit MD only. The loop's gate — the deterministic checker, the Stop / SubagentStop and UserPromptSubmit hooks, `.claude/settings.json`, and the `audit-critic` — is not part of your task; do not edit it. Your only output is the analysis MD.
</scope>

<constraints>
Drive the pi-context CLI directly, one op per question, whole-node reads. Forbidden (hook-enforced): cat, Read, grep, or jq on `.context`, `config.json`, or `schemas`; piping CLI output; `2>/dev/null`; echo-banner narration. Source and git are readable. No substrate mutation. Every claim is a pasted command result or a source citation. If a pi-context op denies ACCESS, report the access failure.
</constraints>

<success_criteria>
The deterministic checker is clean, the `audit-critic`'s C1/C3/C4 verdict is surfaced, and the user has granted ratification in a turn that names TASK-<NNN> and approves it — the only exit from the loop.
</success_criteria>
