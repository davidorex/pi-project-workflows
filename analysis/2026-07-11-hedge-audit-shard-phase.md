# Hedge-audit shard — block `phase` (2026-07-11)

Procedure: `analysis/2026-07-11-gap-fork-provenance-audit-brief-template.md`, applied per item.
Both items read fresh via `pi-context read-block-item --block phase`. Neither was corrected.

Shared provenance (both items): filed in session `91b2dd60-da37-4c86-802b-7ed68129adde` on
2026-07-02 (~10:06–10:07 Asia/Shanghai +8 → the UTC stamps are 02:06–02:07; the filing script
tool_input timestamps are 2026-07-02T10:06:00Z per the DB, matching the append). The nine
milestones + their phases + the parallel-Lane structure were produced by an **Analysis agent**
dispatched at 2026-07-02T09:52:30Z whose brief was "Compute the FILE-FOOTPRINT CONFLICT MATRIX …
to derive safe parallel lanes." The user directed the decomposition verbatim at
2026-07-02T09:51:30Z — *"that sounds like 9 milestones. and ideally they'd be decomposed so that
parallel work can be carefully managed and run and create zero worktree merge problems / zero
build problems"* — and authorized filing at 2026-07-02T10:01:40Z — *"file as delineated"*. The
user did NOT dictate the specific clause wordings under audit; per this repo's substrate-authorship
semantics they are LLM-composed under the user's filing authority. The audit question is therefore
the narrow one: is each flagged clause DERIVABLE from a cited source, or LLM-augmentation-with-no-basis.

---

## PHASE-M1-CEREMONY-RECOVERY — flagged: `fork`

**Flagged clause** (field `intent`, verbatim current):
> "Config always loads or is sanctionedly recoverable."
(The `goal` field carries a second "or": "An invalid **or** lagging config recovers through a
sanctioned CLI path that validates the result …".)

**Step 1–2 (filing session / user direction).** Filed by the serial-phase-append script in session
`91b2dd60`. No user message in the session from decomposition-dispatch (09:52:30Z) to filing
(10:01:40Z) proposes or discusses this specific wording; the user's instructions were the
decomposition directive (09:51:30Z) and the filing grant "file as delineated" (10:01:40Z). Clause
is LLM-composed under filing authority.

**Step 3 (source material — the Analysis-agent brief, 2026-07-02T09:52:30Z).** The brief's M1 line:
*"M1 ceremony-brick-closure: TASK-071 (FGAP-096 config repair: parse-only rawLoadConfigForDir +
whole-config recover op), FGAP-106 (remediation hint in unresolvable-chain error), TASK-055 (update
pre-flight dirty-check)."* The phase's own member list matches this exactly. The "loads … or …
recoverable" disjunction maps one-to-one onto the members: normal load, else the sanctioned
whole-config recover op (TASK-071 / FGAP-096) with a validating CLI path. One recommendation, not a
menu of undecided options.

**Step 4 (cited precedents).** The clause cites no other gap/decision by ID for this wording; its
grounding is entirely the phase's own member items (above).

**Step 5 (`pi-mono-is-exemplar`).** Read fresh. It governs declarative population, locally-editable
installed resources, two-tier config, and named default constants. It is **silent** on a
config-recovery invariant and favors neither reading; not cited as a tiebreaker.

**Step 6 (code / shipped-state contradiction).** The phase is `status: planned` (unbuilt future
work); its `intent`/`goal` describe the phase's target invariant, not shipped state, so no closed
item / met criterion / passing test is contradicted. (`rawLoadConfigForDir` + a whole-config recover
op are the planned deliverables of TASK-071, not yet-shipped surface.)

**Step 7 — verdict.** The "or" is NOT an undetermined choice-hedge (the sense the `fork` flag would
target). It is a **designed two-state robustness invariant** — config loads normally, *or* when
invalid recovers through a sanctioned CLI path — and it is **DERIVABLE** directly from the phase's
own member items and restated determinately in the `goal`. Not LLM-augmentation-with-no-basis.

**Step 8.** Not applicable (no unbuilt-but-undetermined branch: both states are the phase's declared
deliverable, both grounded in members).

**Correction: none.** Clause left untouched.

---

## PHASE-M8-OPERATOR-SURFACE — flagged: `deferral`

**Flagged clauses** (field `intent`, verbatim current):
> (a) "FGAP-045 (block-kind rename cascade — locus undetermined, resolved at its plan step)"
> (b) "TASK-057 waits for the MILE-003 plan step to decide the FGAP-105 fold-locus if it touches
>      migrations-store."

**Step 1–2 (filing session / user direction).** Same session `91b2dd60`, same serial-append filing,
same "file as delineated" grant. No user message dictates either deferral's wording; LLM-composed
under filing authority.

**Step 3 (source material — the Analysis-agent brief).** The brief's M8 line names the members
(*"FGAP-044/045 (schema-edit/rename ops: ops-registry + lib) … TASK-057/058 (schema-history audit
ops)"*) and its M3 line names the fold-locus branches explicitly: *"TASK-073 (FGAP-099 block
schema_version stamping: writeTypedFile/block-api), FGAP-105 (writeConfigForDir version stamp)."*
The brief's whole task was to derive serializations from shared file touch-sets — i.e. to surface
exactly this kind of "decide the locus at the plan step, then sequence dependents" dependency. The
sibling phase PHASE-M3-DATA-CONVERGENCE carries the reciprocal note in its own `intent`: *"FGAP-105
fold-locus (writeConfigForDir vs generic writeTypedFile) is decided at this phase plan step, before
TASK-057 dispatches."* Clause (b) is the cross-referenced downstream half of that single decision.

**Step 4 (cited precedents).** The clauses cite MILE-003 / FGAP-105 / FGAP-045 / TASK-057 by ID.
FGAP-105's fold-locus is itself an open determination assigned to M3's plan step (per M3's intent,
above) — it points one direction (decide-at-plan-step), consistent with clause (b), not against it.

**Step 5 (`pi-mono-is-exemplar`).** Read fresh; silent on implementation-locus sequencing and on the
rename-cascade locus. Favors neither branch; not cited as a tiebreaker.

**Step 6 (code / shipped-state contradiction).** Verified the fold-locus is a real, code-grounded
either/or: `writeTypedFile` (the shared block-api write funnel, `block-api.ts:987`) and
`migrations-store.ts` both exist; the generic funnel is adjacent to the migrations-store surface that
TASK-057's schema-history audit would read, so "if it touches migrations-store" is a genuine
technical conditional. `writeConfigForDir` does NOT yet exist — consistent with FGAP-105 being
unbuilt/planned and the fold-locus being genuinely open. Neither deferral contradicts any shipped,
verified state; the phase is `status: planned`.

**Step 7 — verdict.** Both deferrals are **DERIVABLE**: (1) the canonical implementation pipeline
resolves implementation locus at the explore→plan step, not at decomposition, so "locus undetermined,
resolved at its plan step" restates a binding project convention, not an invented hedge; (2) clause
(b) encodes a real, code-grounded cross-phase sequencing dependency (M3's plan step decides FGAP-105's
fold between `writeConfigForDir` and the shared `writeTypedFile` funnel; TASK-057 consumes the
outcome). Not LLM-augmentation-with-no-basis.

**Step 8 (standing / underdetermined call).** Both branches are genuinely unbuilt-but-not-contradicted
(deferred, not rejected). No user statement in any session since the 2026-07-02 filing retracts,
deprioritizes, or declines either deferral; the phase is still `planned` and no member has advanced
into its plan step, so the determinations remain undischarged **by design**. Plainly: no retraction
found — these remain standing, undeclined, directed-intent deferrals to the pipeline's plan step,
each deriving from a cited source (the canonical pipeline convention for (a); MILE-003's plan step /
FGAP-105 fold-locus for (b)). Genuinely underdetermined *until the plan step*, not underdetermined
because unsupported.

**Correction: none.** Both clauses left untouched.
