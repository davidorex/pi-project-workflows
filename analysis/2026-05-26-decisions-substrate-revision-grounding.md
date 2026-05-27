# Decisions-Substrate Revision Grounding (2026-05-26)

Source document for planning + execution of the decisions-substrate revision arc. Filed as analysis because the substrate-shape revision IS the work — filing as `.project/decisions.json` itself would be self-referential. Reify into appropriate blocks once revision direction settles and target surface exists.

## Purpose

Carries the side-quest articulations needed to ground:
- Planning of the decisions-substrate revision FEAT
- Per-step execution discipline for processing pre-decisions in the meantime
- Migration design of 49 existing entries into the revised shape

Fresh contexts reading this should get the full picture without re-deriving.

---

## The semantic gap

**Block-name vs content mismatch.** The block `decisions.json` carries the colloquial meaning "what has been decided." The schema declares `status: open | enacted | superseded` — `open` entries are explicitly "decisions that need to be made and gate work." So the block contains pre-decisions and actual decisions simultaneously; the name lies about half the content.

**Schema's own stretched definition.** The schema description (verbatim): "Live decision log. Each entry is a decision either open (needs to be made and gates work), enacted (ratified by user authority...), or superseded (withdrawn without enactment...)." The schema knows it's stretching "decision" to cover the entire deliberation→ratification→supersession arc. Stipulatively coherent; at odds with the word it uses.

**Granularity gap inside `open`.** The single `open` state collapses at least three operationally-distinct sub-states:
- **recognized** — decision-need identified, no canon-derived answer drafted
- **drafted** — `decision` field carries canon-derived answer, awaiting user review (DEC-0001/0002 current state at this writing)
- **reviewed-and-revised** — user has reviewed, may have widened/refined scope, only enactment stamp pending (DEC-0003 current state after commit `cfbb211`)

From substrate-query perspective, all three report `status: open` — indistinguishable. Cognitive-load problem: a fresh context cannot tell ready-to-enact from still-needs-framing.

---

## Empirical evidence (shape survey)

See `analysis/2026-05-26-decisions-block-shape-survey.md` (commit `4900a34`) for the raw enumeration. 49 entries surveyed; 20 emergent shape-clusters identified. Headline variance:

- Writer-identity format variance: `user` / `human/email` / `human:email` / `bare-email` / `agent/...`
- enacted-tuple completeness variance (some entries with enacted_by but no enacted_at, etc.)
- options_considered / rejected_reason coverage variance
- Timestamp granularity variance
- Commit-reference notation variance (free-text in prose vs structured)
- Null-state convention variance (empty-array vs key-absent)
- In-field stacked revision prose ("Amendment", "Widening", "narrowed") — survey flagged DEC-0040 amendment block, DEC-0044 narrowing prose
- Open DEC entries with drafted answers vs without
- Decision-as-question vs decision-as-answer
- Superseded-as-consequence retrospective pattern
- FGAP-filing-as-consequence pattern

---

## Data-room lens mapping

The data-room metaphor (per `/Users/david/Projects/data-room-pi-context.md`) proposes three first-class artifacts for the orchestrator/LLM working environment:

| Data-room artifact | Our current state | Revised target |
|---|---|---|
| **Decisions** (settled, authoritative) | `decisions.json` enacted+superseded entries | `decisions.json` (scope-narrowed) |
| **Missing-context list** (referenced/needed but unresolved) | `decisions.json` open entries (mis-filed) | `recognitions.json` (NEW) |
| **Conflict log** (where sources contradict) | No canonical home; surfaces as in-body "Amendment"/"Widening" stacking | `substrate-conflicts.json` (NEW) |

The 20 emergent shape-clusters from the survey cluster cleanly into these three artifact-kinds when re-read through the data-room lens. The conflation is not a slight semantic stretch — it's three distinct artifacts living in one block.

---

## Proposed revision

### Block split (3 blocks)

**1. `recognitions.json` (NEW)** — pre-decisions / decision-needs.
- status: `recognized | drafted | reviewed | ready_for_enactment | withdrawn`
- on ready_for_enactment + user enact action → promotes a new entry into `decisions.json` with `enacted_from` link; recognition entry stays for lineage, status flips to terminal `enacted`

**2. `decisions.json` (scope-narrowed)** — ratified entries only.
- status: `enacted | superseded`
- required: `enacted_from` (recognition id), `enacted_by`, `enacted_at`
- block name no longer lies — every entry IS a decision

**3. `substrate-conflicts.json` (NEW)** — first-class home for in-substrate contradictions.
- structured per-conflict entries with `affected_ids`, `conflict_kind`, `resolution_state`
- replaces the practice of layering revisions inside a single field

### Uniform field tightening (across all three blocks)

- **writer-identity:** enum/pattern `kind:identifier` (e.g., `human:davidryan@gmail.com`) — kills variance
- **commit references:** structured `commits[]: [{sha, label}]` — kills free-text "commit a71c782 ..." in prose
- **null-state convention:** empty-array required when field allowed; key-absent forbidden — kills absent-vs-empty ambiguity
- **evolution-tracking:** first-class `evolution_log[]: [{date, kind: widening|narrowing|amendment|correction, by, summary, commits[]}]` — replaces in-body stacked revisions
- **options_considered:** schema's existing soft convention preserved (populated only when multiple mandate-compliant candidates genuinely compete). NO rejected_reason requirement added — the chosen option's rationale + `consequences[]` already telegraph why others lost; rejected_reason is staleness-prone redundancy with low marginal mandate-004 value.

---

## Canon-mapping (every revision element ↔ established canon)

Nothing here is fresh architectural invention. Each revision element applies already-established canon to a block that predates it.

| Revision element | Established canon |
|---|---|
| 3-block split | data-room three-artifact frame; DEC-0040 (substrate = single source of truth — decisions.json becomes actually-only-truth) |
| Recognitions block | data-room "missing-context-list"; mirrors FGAP-111 raw-tier-with-decomposition (raw → curated via promotion) applied to deliberation pipeline |
| Decisions block (narrowed) | data-room "decisions" proper; DEC-0040 source-of-truth canon |
| Substrate-conflicts block | data-room "conflict-log"; addresses FGAP-098 genus (substrate-substrate cross-reference affordance) |
| Writer-identity standardization | DispatchContext attestation canon (already established but inconsistently honored — survey evidence) |
| Structured commits[] | existing references[] pattern in current schema; normalizes prose-rot commit mentions to it |
| Null-state convention | FGAP-110 per-item valid/current discipline applied at field level |
| Evolution_log[] | feedback_substrate_blocks_not_changelogs verbatim: "Block bodies are current-truth guidance, not changelogs; never assert-then-refute within a block; on correction EDIT to current-truth (preserve still-true facts), keep the journey in git/analysis, don't append-stack CORRECTION/RE-WEIGHT layers." evolution_log[] is the structured "git/analysis" form INSIDE the substrate. |

---

## Process discipline established this side-quest

- **Cognitive-load: one decision at a time, in dependency order.** Batching three DECs as "the executeAgent canon gate" was framing convenience, not project canon. Each is a discrete review-and-enact unit.
- **Context hygiene IS prerequisite** for canonically informed work, not subordinate. Closing FGAP-112 + narrowing DEC-0044 + refreshing the roadmap projection were prerequisites for moving to DEC-0003 widening, not optional cleanup.
- **Empirical verification before architectural assertion.** The "DEC-0003 widening" surfaced a third parseModelSpec duplicate at `pi-workflows/src/step-monitor.ts:371` that the original DEC-0003 text only "audited" for; grep verified it; substrate widened to confirm.
- **Recognitions carry their own canon-derivation when applicable.** DEC-0001/0002/0003 are canon-derivable (jit-agents-spec §2 + JI-010 + DEC-0049 determine the answers); they're not architectural choices awaiting deliberation, just substrate-recorded code-cascade-recognitions awaiting enactment stamp.

---

## Open question (explicitly unanswered)

What is fileable RIGHT NOW into substrate, given we're planning to revise what we file and how we file it.

Cannot answer until revision direction settles, because:
- Filing into `decisions.json` as-is perpetuates the conflation we just diagnosed
- Filing into not-yet-existent `recognitions.json` requires the schema + block to exist first
- Holding everything as analysis/ + memory until the new shape lands risks losing structured queryability for the interim

This document IS the holding pattern — it persists the work-in-progress articulations so they survive between sessions without being prematurely shoehorned into a substrate shape that's about to change.

Reify into the appropriate blocks once revision direction settles. Until then: analysis/ is the holding place per `feedback_catalog_as_holding_place`.

---

## Companion artifacts

- `analysis/2026-05-26-decisions-block-shape-survey.md` (commit `4900a34`) — raw shape enumeration; the empirical basis
- `analysis/2026-05-26-roadmap-by-extension.md` (last refresh commit `be42a27`) — broader roadmap; decisions-substrate revision should be added as a new FEAT in pi-context section
- `.project/decisions.json` — the block being revised; current commits as of this writing: DEC-0044 narrowing `a71c782`, DEC-0003 widening `cfbb211`
- `.project/framework-gaps.json` — FGAP-112 closed `71a7ea2` (narrowed Path A canonical); FGAP-098/110/111 still identified (cited above)
- This session's reasoning is preserved in conversation transcript at `/Users/david/.claude/projects/-Users-david-Projects-workflowsPiExtension/b62c055d-3d2e-45fd-ab2b-3829067b41bd.jsonl` for archaeology if needed
