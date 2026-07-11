# Hedge/fork provenance audit — features shard (2026-07-11)

Procedure: `analysis/2026-07-11-gap-fork-provenance-audit-brief-template.md`, applied per item.
Block `features`, array key `features`. Convention checked against each: `pi-mono-is-exemplar`
(declarative population, editable materialized resources, two-tier config, named-constant
defaults) — silent on every fork below; it does not bear on any of these choices and is not
cited as a tiebreaker. One correction made (FEAT-014); four left untouched.

---

## FEAT-003 — flagged: fork — VERDICT: grounded, no correction

**Flagged clause.** `acceptance_criteria[0]`: "Two divergent versions each insert, delete,
**and/or** move elements in the same collection…". The `and/or` is the fork-shaped token.

**Basis.** FEAT-003 (`status: proposed`, `Per DEC-0005`) is a faithful compression of
**DEC-0005** (`status: enacted`), read fresh. DEC-0005 §1–2 establish insert / delete / move as
the three operations the sequence CRDT resolves (Fugue-class dense position identifiers +
Kleppmann move-CRDT position register, HLC-resolved). The `and/or` is a **test-condition
specification** — the merge test exercises inserts, deletes, and moves in combination — not an
undecided design branch. It is DERIVABLE-from-a-cited-decision-that-supports-it.

**Step-6 contradiction check.** DEC-0005 is enacted but latent ("Latent until the structure-aware
git merge driver (FGAP-004) exists"); FEAT-003 proposed. No shipped/verified state is contradicted
by the clause. **No correction.**

---

## FEAT-011 — flagged: fork, modal-hedge — VERDICT: grounded design statement, no correction

**Flagged clauses.** (i) `acceptance_criteria[4]`: a write that introduces a violation "surfaces
on the op result (**warning** severity) **or** is refused (**error** severity)"; and the
description Class-B counterpart. (ii) `acceptance_criteria[5]`: "the complete-to-stale transition
is applied by reconcile **or** a human, never silently"; description Class-C: "transitioned via
reconcile or human confirmation".

**Basis.** Both are verbatim-grounded in the cited design source
`analysis/2026-07-05-currency-foreclosure-shape.md` (the feature's own "composed recommendation"):
- warning/error two-tier — line 72 ("`error` rejects; `warning` returns a surfaced advisory on the
  op result"), line 103 ("write-time gate (delta-scoped, warning-severity results surfaced…)"),
  line 120. The two-tier maps onto the project's **existing** invariant-severity model
  (error-severity refuses, warning-severity surfaces). Not an open fork — a specified severity
  design covering two invariant classes.
- reconcile-or-human — line 78(iii) ("the actual complete→stale transition applied by the reconcile
  op (S9) **or** a human"), line 105 ("repaired/transitioned via S9 **or** human confirmation").
  This is the Class-C **truth-class** rule: the engine never fabricates an authored transition;
  only the reconcile op or a human applies it (line 94, 103–105). Two legitimate actors named by
  design, not invented uncertainty.

**In-progress caveat honored.** FEAT-011 is `in-progress` with real open sub-tasks; these clauses
describe genuine designed behavior, not a hedge over still-open work. **No correction.**

---

## FEAT-012 — flagged: deferral, fork — VERDICT: genuine open fork, correctly routed to a pending DECISION, no correction

**Flagged clauses.** `description`/`acceptance_criteria[6]`: "The foreign-resolution SEMANTICS —
live cross-substrate status read **vs** derive-as-blocked-until-resolved **vs** flagged-exclusion …
is recorded as a DECISION … before implementation lands"; and the "shipped foreign IDENTITY … and
stopped before consumption" **deferral**.

**Basis.** Verbatim-grounded in `analysis/2026-07-06-foreign-status-derivation-blindness.md`:
- line 228: "These are genuinely different foreign-resolution semantics (live cross-substrate read
  **vs** conservative local-only **vs** labeled exclusion) with real trade-offs (freshness, cost,
  offline substrates, trust in sibling-substrate status vocabularies). **That choice is DEC-shaped
  and should be recorded as a decision, not buried in an implementation.**"
- line 250 (FGAP proposed_resolution) restates the same three-way choice "lands as a DECISION first".
- The deferral is factual: the arc shipped foreign IDENTITY (structured EdgeEndpoint / registry /
  resolveRef classification / promote-item) and the investigation found the consumption layer
  "unfiled and undesigned."

**Step-8 standing check.** No decision resolves this fork: a decisions-block title sweep
(`foreign|cross-substrate|work-order|dispatch|sequence|currency`) returned only DEC-0005, DEC-0022,
DEC-0023 — none for foreign-resolution semantics. FEAT-012 is `proposed` (no implementation). The
fork is a real, source-established, explicitly-DEC-shaped undetermined choice with **no retraction**
— it remains standing, undeclined, directed intent, deriving from
`analysis/2026-07-06-foreign-status-derivation-blindness.md` §Recommendation. **No correction.**

---

## FEAT-013 — flagged: deferral, fork — VERDICT: reasoned decisive omission, grounded, no correction

**Flagged clause.** `description`: "**Reasoned omissions** from the WASC exemplar: one-bash-per-turn
(no observed failure of that class in this project's record; parallel independent calls are the
operating style) **and** git-tracked rendered prompts (claude-history is this project's forensic
layer for dispatch reconstruction)."

**Basis.** Both omitted features exist in the cited exemplar and the omission carries stated,
project-grounded rationale (the opposite of an invented hedge — a decisive exclusion with reason):
- `analysis/2026-07-06-harness-exemplars-wasc-synth.md` documents "One Bash call per turn"
  (line 36) and "tracked rendered prompts as forensic artifacts" (lines 58, 78) as the exemplar
  features being reasoned about.
- The omission rationale aligns with this project's own operating context: parallel independent
  tool calls are the project's stated operating style (root CLAUDE.md), and claude-history is the
  project's established forensic/development-intelligence layer (global CLAUDE.md).

**In-progress caveat honored.** FEAT-013 is `in-progress`; this clause is a scoping decision, not a
hedge over open work. **No correction.**

---

## FEAT-014 — flagged: deferral, fork — VERDICT: genuine fork SINCE RESOLVED by DEC-0022 → CORRECTED

**Flagged clause (pre-edit).** `description`, second paragraph: "First decomposition step is a
DECISION on the dispatch architecture (**the underdetermined choice** from
analysis/2026-07-07-work-order-dispatch-dogfood-breaks.md §cross-cutting): (a) dispatch target
agents as pi subprocesses (where real tools exist; executeAgent stays a classify/structured-output
primitive), (b) grow executeAgent a real tool-execution loop, **or** (c) re-scope work-orders to
output-only agents (contradicts the schema's scope contract). Implementation follows the decided
shape."

**The fork was genuine, not invented.** It is verbatim-grounded in
`analysis/2026-07-07-work-order-dispatch-dogfood-breaks.md` line 115 ("either (a) … or (b) … or (c)
… That choice is the user's, not this report's") — a real, source-established, user-owned
undetermined choice.

**But it is now RESOLVED and enacted (step-6 contradiction).** Read fresh:
- **DEC-0022** (`status: enacted`, 2026-07-07): "Acting work-order agents are dispatched as pi
  subprocesses (pi --mode json -p …); executeAgent remains a single-turn classify/structured-output
  primitive and is not grown a tool-execution loop. Work-orders are not re-scoped to output-only."
  This is **option (a)**. Context: shipped on main (merge 8e2e764e), filed retroactively under user
  grant after the 2026-07-07 currency audit.
- **FGAP-124** (`status: closed`, `closed_at: 2026-07-07`): `closed_by` records the subprocess
  dispatch shipped on main (merge 8e2e764e), WO-001 probe wrote `out.txt='FGAP-124-PROVEN'`, real-
  check passed, `final_status=completed`, re-verified independently by the orchestrator.

Branches (b) and (c) therefore contradict already-shipped, verified state; the clause presenting the
choice as "underdetermined" with three open branches is stale. Per template step 56 (state only the
resolution the sources actually support), the fork collapses to option (a).

**Correction applied** (`description` field only; every other field byte-identical, confirmed on
read-back; `content_parent` chains from prior `content_hash` 109e3d6f…).

Before (2nd paragraph):
> First decomposition step is a DECISION on the dispatch architecture (the underdetermined choice
> from analysis/2026-07-07-work-order-dispatch-dogfood-breaks.md §cross-cutting): (a) dispatch
> target agents as pi subprocesses (where real tools exist; executeAgent stays a
> classify/structured-output primitive), (b) grow executeAgent a real tool-execution loop, or (c)
> re-scope work-orders to output-only agents (contradicts the schema's scope contract).
> Implementation follows the decided shape.

After (2nd paragraph):
> The dispatch architecture is decided (DEC-0022, enacted): acting work-order agents dispatch as pi
> subprocesses (pi --mode json), where real tools exist, and executeAgent stays the
> classify/structured-output primitive; work-orders are not re-scoped to output-only. Implementation
> follows this shape (option a of analysis/2026-07-07-work-order-dispatch-dogfood-breaks.md
> §cross-cutting), shipped on main and verified end to end (FGAP-124 closed).

The first description paragraph (the contract-engine-gap statement) is unchanged; FEAT-014 remains
`in-progress` (FGAP-125/126/127 residuals per DEC-0022 consequences), which the corrected text does
not misrepresent.

**Out-of-scope observations (not edited — flagged for orchestrator):**
- `acceptance_criteria[0]` ("The dispatch-architecture decision … is filed as a decision before
  implementation") is now **satisfied** by DEC-0022. As a criterion statement it is not stale text,
  and it is a separate field outside the flagged clause; left untouched.
- FEAT-014's `motivation` cites "the DEC-0047 clamp"; `pi-context read-block-item --block decisions
  --id DEC-0047` returns null (DEC-0047 absent from the decisions block). This is a possible dangling
  citation in `motivation`, outside the flagged `description` clause; not edited.
