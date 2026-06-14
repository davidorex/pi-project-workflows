# Substrate relation-graph completeness audit — absent-but-warranted edges

Date: 2026-06-14
Resolved active substrate: **`.context`** (read from `.pi-context.json` `contextDir` = `.context`; `previous_contextDir` = `.context-jit-spec-v2`). All findings below are against `.context`.
Method: read-only, driven through the globally-installed `pi-context` CLI ops only (`read-block-item`, `find-references`, `read-config`, `context-edges-for-lens`, `filter-block-items`, `context-validate-relations`, `context-status`). No substrate mutation.

---

## Part A — the specific absence (DEC-0018 ↔ FGAP-076)

**The premise of "specific absence" is contradicted by the evidence: the DEC-0018 ↔ FGAP-076 edge is PRESENT, not absent.**

1. **DEC-0018** (`read-block-item --block decisions --id DEC-0018`, status `open`): decides `pi-context update` applies PER-COMPONENT, not whole-run-atomic; its own `decision`/`consequences` text states the partial application "MUST be made legible … tracked as a separate framework-gap." **FGAP-076** (`read-block-item --block framework-gaps --id FGAP-076`, status `identified`, P2): tracks that `update`'s result does not make partial application legible — its `proposed_resolution` is "Premised on DEC-0018 (per-component affirmed)." So FGAP-076 is, by both bodies' own text, the open legibility consequence of DEC-0018.

2. **Edge finding (`find-references --id FGAP-076` and `--id DEC-0018`): PRESENT.** The graph carries:
   - `DEC-0018 --decision_addresses_gap--> FGAP-076` (parent DEC-0018, child FGAP-076).
   This is exactly the decision→gap-consequence edge the brief asked whether existed. It exists.

3. **Which registered relation_type fits the semantics:** `decision_addresses_gap` (config `relation_types[]`: source_kinds `[decisions]`, target_kinds `[framework-gaps]`, category data_flow). The vocabulary also carries a sharper-fit candidate — **`decision_escalates_underdetermined`** (decisions → framework-gaps, "escalates underdetermined choice") — but that type is semantically for a decision *escalating a genuinely-undetermined choice* to a gap, whereas DEC-0018 *resolves* and spawns a *consequence* gap, so `decision_addresses_gap` is the correct fit and is the one filed. **No vocabulary gap here** for this case; the type exists and is used.

4. **Why-absent — N/A (it is present).** Both endpoints are well-related, not orphaned: DEC-0018 carries 4 edges (`research_informs_item` from R-0012; `decision_derived_from_item` → DEC-0017; `decision_addresses_gap` → FGAP-076; `item_governed_by_convention` → `derive-decisions-from-facts`). FGAP-076 carries 2 (the DEC-0018 edge + `research_informs_item` from R-0012). This pair is among the **best-filed** items in the substrate, not a never-filed one — consistent with both being recently authored (2026-06-09), after the filing discipline matured.

5. **R-0012 cross-check: PRESENT on both.** `find-references --id R-0012` shows `R-0012 --research_informs_item--> DEC-0018` and `R-0012 --research_informs_item--> FGAP-076` (plus FGAP-066, FGAP-077, issue-003, and an `item_derived_from_item` → STORY-008). The research→both edges the brief asked about are filed.

**Part A verdict:** the specific case is a *negative* — the warranted edges (DEC-0018→FGAP-076 and R-0012→both) are all present. The instance does not demonstrate the absence class; it demonstrates the substrate's *well-filed* end. The under-filing class is real but lives elsewhere (Part B), concentrated in earlier history.

---

## Part B — the general class: warranted-but-unfiled edges across `.context`

### Root mechanism (drives every category below)
The `config.invariants[]` registry (`read-config --registry invariants`) contains exactly three `requires-edge` invariants that FORCE edge presence at validation:
- `decision-cites-forcing-artifact` (error) → forces every decision to carry `decision_addresses_issue|feature|gap`.
- `completed-task-has-verification` (error) → forces every completed task to carry `verification_verifies_item` (as child).
- `decision-articulates-convention` / `feature-articulates-convention` / `task-articulates-convention` (error) → force a convention edge.
- `decision-shows-derivation` (warning) → `decision_derived_from_item | decision_escalates_underdetermined`.

Every OTHER relation_type is filed only by a manual `append-relation` with **no requires-edge invariant**. The `status-consistency` invariants (`task-completed-gap-closed`, `task-completed-feature-complete`, `task-not-on-superseded-decision`, `verification-passed-task-complete`) only fire *if the edge already exists* — they do not require it. **So edge-presence is enforced exactly where an invariant exists, and under-filed exactly where it does not.** The data below tracks that boundary precisely.

### Per-category table

| Category | relation_type | Forced by invariant? | Population finding | Confident missing edges |
|---|---|---|---|---|
| decision → forcing gap/feature/issue | `decision_addresses_gap` etc. | **Yes (error)** | All 18 decisions carry one (probed DEC-0001..0009, 0016, 0018) | none — invariant-enforced |
| decision → convention | `item_governed_by_convention` / `item_acknowledges_missing_convention` | **Yes (error)** | All probed decisions carry one | none — invariant-enforced |
| completed task → verification | `verification_verifies_item` | **Yes (error)** | All 46 verifications edged to their task (probed TASK-010/012/014/038/045/059) | none — invariant-enforced |
| **decision → enacting task** | `task_governed_by_decision` | **No** | Inconsistent: DEC-0001/0002/0004/0005/0006 carry enacting-task edges; **DEC-0008, DEC-0009 do NOT** though their tasks shipped | TASK-010→DEC-0008; TASK-012→DEC-0009 |
| **task → addresses gap** | `task_addresses_gap` | **No** | Inconsistent: TASK-038/045/059 carry it; early tasks **TASK-010/012/014 do NOT** though they closed gaps | TASK-010→FGAP-012; TASK-012→FGAP-015; TASK-014→FGAP-014 |
| research → informs item | `research_informs_item` | **No** | R-0012 richly edged (6 edges); **R-0014 has ZERO edges** though it grounds the FGAP-089 / install-surface arc | R-0014 → (FGAP-089 + the install-surface gaps it investigates) — *candidate, see note* |
| task/feature → advances story | `task_advances_story` / `feature_advances_story` | No (but well-filed) | 15 task-advances + 14 feature-advances edges present (`context-edges-for-lens`); covers STORY-001..014 | none confident; but see lens-bin integrity issue below |
| verification → verifies item | `verification_verifies_item` | Yes (via task invariant) | 46/46 edged | none |

### Concrete confident missing edges (entailed by the two items' own filed text)

1. **TASK-010 → DEC-0008** `task_governed_by_decision` — DEC-0008 decomposes its work into TASK-009/010/011; DEC-0008's siblings DEC-0001/0002/0004/0005/0006 all carry `task_governed_by_decision` from their enacting tasks. TASK-010's only edges are `verification_verifies_item` (VER-009) + two conventions. **Missing.**
2. **TASK-012 → DEC-0009** `task_governed_by_decision` — DEC-0009 is enacted by TASK-012 (VER-007 verifies it); TASK-012 carries no governing-decision edge. **Missing.**
3. **TASK-010 → FGAP-012** `task_addresses_gap` — FGAP-012's own `proposed_resolution` text: "CLOSED across TASK-010 (8fcf02d, the 4 relation ops) + TASK-011." FGAP-012's only incoming edge is `decision_addresses_gap` from DEC-0008; neither TASK-010 nor TASK-011 carries `task_addresses_gap` to it. **Missing (both TASK-010 and TASK-011).**
4. **TASK-012 → FGAP-015** `task_addresses_gap` — DEC-0009 addresses FGAP-015; TASK-012 is DEC-0009's enacting task (VER-007). No `task_addresses_gap` edge from TASK-012 to FGAP-015. **Missing.**
5. **TASK-014 → FGAP-014** `task_addresses_gap` — FGAP-014's own `closed_by` text: "CLOSED at d0ab83d (TASK-014)." TASK-014's only edges are VER-008 + a convention. No `task_addresses_gap`. **Missing.**

These five are the high-confidence core: in each, one endpoint's filed text names the other as the thing it closes/enacts, yet the edge is absent. They cluster in the early task range (TASK-010/011/012/014) — authored before `task_addresses_gap` / `task_governed_by_decision` were filed consistently (TASK-038/045/059 onward carry them).

### Candidate (needs author judgment, not asserted)
- **R-0014 → FGAP-089 (and the install-surface gaps)** `research_informs_item` — R-0014 has **zero** edges (`find-references --id R-0014` → empty). Per CLAUDE.md and the recent commit log, R-0014 is the "install-surface + guard-scope gap investigation" grounding FGAP-089. The grounding is plain in the project narrative, but R-0014's body was not read in full here and the exact set of gaps it informs should be confirmed from its `findings_summary` before filing — hence candidate, not confident.
- **TASK-011 → FGAP-012 / TASK-011 → DEC-0008** — symmetric to TASK-010 (FGAP-012 names TASK-011 as a co-closer). Confident by the same evidence; listed here to keep the TASK-010 row primary.

### Lens-bin integrity (separate, already-surfaced anomaly)
`context-validate-relations` returns **invalid** with 29 `edge_parent_not_in_bins` issues: the `task_advances_story` / `feature_advances_story` edges exist but their parents (TASK-046/048/049/050/051/052, FEAT-009) are not in the `story-advancers` / `story-advancers-features` lens bins (both lenses have empty `bins: []`). This is a lens-population gap, not a missing relation edge — the advances-story EDGES are filed (15 + 14 of them); the LENS bins are not derived. Noted as adjacent, not part of the missing-edge class.

---

## Part C — prior-art + class characterization

### Prior-art search (mandatory)
Searched `framework-gaps`, `decisions`, `research` for an existing item tracking relation-graph completeness / edges-under-filed / relation-coverage:
- `filter-block-items --block framework-gaps --field title --op matches --value "relation|edge|derivation|graph"` → 11 hits, **none** about under-filed warranted edges. They concern relation *mechanics*: FGAP-006 (no remove/replace edge op, closed), FGAP-007 (ordering-edge direction footgun, accepted), FGAP-012 (dry-run op asymmetry, closed), FGAP-014 (completeTask edge-migration, closed), FGAP-039/041/042 (new relation_types for milestones/stories/roadmap), FGAP-060 (config-registry propagation, closed), FGAP-061 (gate-aware derivation), FGAP-075 (changelog surface), FGAP-082 (advancer-completion invariant class).
- `filter-block-items --block decisions … "relation|edge|graph|completeness"` → DEC-0002 (clone lineage), DEC-0016 (convention-articulation invariants). 
- `filter-block-items --block research … "relation|edge|graph|completeness|under-filed"` → **0 hits.**

**No existing item tracks "warranted relations never filed" as a class.** The closest adjacent items are:
- **TASK-041** ("Backfill decision derivation edges, raise decision-shows-derivation to error") — the SAME pattern applied to ONE relation_type (`decision_derived_from_item`): backfill the missing edges, then raise the invariant warning→error so the edge becomes UNFILEABLE-without. This is the proven remediation template for one edge type.
- **DEC-0016** — the keystone: states the `requires-edge` invariant engine is precisely how edge-presence is enforced ("Conventions … are only passively composed into context, so an LLM can skip them"), and enforces it as config (no validator code). This is the existing mechanism that, by its absence on the under-filed types, IS the root cause.
- **FGAP-082** — adds a NEW invariant class (advancer-completion) for an aggregate-over-incoming-edges rule the engine can't yet express; relevant if a completeness invariant needs to quantify over edges.

This audit should therefore **inform a NEW filing** (no existing item covers the general under-filing class) — and relate it to TASK-041 (the per-type precedent), DEC-0016 (the enforcement mechanism), and FGAP-082 (the invariant-engine extension axis). It should NOT duplicate TASK-041, which only covers the derivation-edge subset.

### Is it atomic or a structural class?
**Structural class, not a one-off.** Root cause: relations are filed by a separate, manual `append-relation` step that runs AFTER the item write, and only the relation_types backed by a `requires-edge` invariant (`decision_addresses_*`, `verification_verifies_item`, the `*-articulates-convention` family, the warning-level `decision-shows-derivation`) have a filing-time forcing function. Every other warranted relation_type — `task_governed_by_decision`, `task_addresses_gap`, `task_addresses_feature`, `research_informs_item`, `task_advances_story`/`feature_advances_story` — has NO presence invariant, so its filing depends entirely on author discipline at the moment of item creation. The evidence is the exact correlation: invariant-backed edge types are 100% populated across the items probed; non-invariant edge types are inconsistently populated, with the gaps concentrated in earlier history (TASK-010/012/014) before discipline matured. The DEC-0018/FGAP-076 case from Part A is the *counter*-example that proves the same mechanism: recently authored, both endpoints invariant-touched (DEC-0018 forced to carry a forcing-artifact + convention + derivation edge), and consequently fully filed.

**Class characterization for filing:** "Warranted relation edges are under-filed because edge-presence has a filing-time forcing function only for the relation_types named in a `requires-edge` invariant; all other warranted relation_types depend on manual post-write `append-relation` discipline and accumulate absences silently (no validator flags a *missing* non-invariant edge)." The remediation axis is the proven TASK-041 / DEC-0016 pattern generalized: for each warranted relation_type whose presence is structurally entailed (a completed task that closed a gap; an enacting task of an enacted decision; a research item that grounds another item), either (a) add a `requires-edge` invariant making the edge unfileable-without (as TASK-041 does for derivation, gated behind a backfill), or (b) where presence can't be made universally mandatory (not every task addresses a gap), add a validator advisory that flags an item whose *body text* names a closure/enactment without the corresponding edge. The choice between (a) and (b) per relation_type, and whether the invariant engine needs the FGAP-082 aggregate class to express any of them, is the author-judgment frontier this audit hands off.

---

## CLI-surface notes (experience-gap candidates)
- **No op materializes ALL edges of an arbitrary relation_type.** `context-edges-for-lens --lensId` only works for the two relation-type lenses that happen to be registered (`story-advancers`, `story-advancers-features`); auditing population of `task_addresses_gap` / `task_governed_by_decision` / `research_informs_item` across the whole graph required per-item `find-references` probing. A global "all edges of type X" read op (or a relations-block read op) would make relation-completeness auditing first-class rather than O(items) probing. Reproduction: `pi-context context-edges-for-lens --lensId story-advancers` works; there is no equivalent for a relation_type lacking a lens. This is a candidate experience-gap; not filed here.
- `read-block --block <large>` returns `data:null` + `truncated:true` for blocks over the emit cap (decisions 64KB, research 95KB) — expected behavior of the boundary cap (DEC-0009); paginate with `read-block-page --offset --limit` or narrow with `read-block-item` / `filter-block-items`. Not a gap.
- `filter-block-items` has no field-projection (`--select` rejected); it returns whole items, so id+title listings of large blocks hit the emit cap. Minor friction; narrowing via `--field`/`--op` mitigates. Candidate, not filed.
