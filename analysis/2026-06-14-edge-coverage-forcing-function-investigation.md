# Edge-coverage forcing-function gap — experience-gap investigation

Date: 2026-06-14
Resolved active substrate: **`.context`** (read from `.pi-context.json` `contextDir` = `.context`; `previous_contextDir` = `.context-jit-spec-v2`). Every finding below is grounded in `pi-context` CLI op output read THIS run, read-only, no substrate mutation.
Method: globally-installed `pi-context` direct-drive — `read-config`, `read-block-item`, `find-references`, `context-validate`, `context-validate-relations`, `read-block-page`. The prior audit (`analysis/2026-06-14-substrate-relation-graph-completeness-audit.md`, committed `7c83e3b`) is re-derived independently, not relied on.

This is the CLAUDE.md Experience-Gap Handling investigation. It produces the grounded substance the FGAP will be composed from. It does **not** file, write, or mutate the substrate — filing is a separate provenance-gated step the orchestrator + user perform.

---

## 1. Root cause (grounded in the actual invariant set)

`read-config --registry invariants` this run returns **11 invariants** in two edge-bearing classes:

**`requires-edge` (FORCE edge presence at validation — flag the ABSENCE):**
| invariant id | block | relation_types required | severity |
|---|---|---|---|
| `completed-task-has-verification` | tasks (status=completed) | `verification_verifies_item` (as_child) | error |
| `decision-cites-forcing-artifact` | decisions | `decision_addresses_issue` \| `_feature` \| `_gap` (as_parent) | error |
| `decision-articulates-convention` | decisions | `item_governed_by_convention` \| `item_acknowledges_missing_convention` | error |
| `feature-articulates-convention` | features | same convention pair | error |
| `task-articulates-convention` | tasks | same convention pair | error |
| `decision-shows-derivation` | decisions | `decision_derived_from_item` \| `decision_escalates_underdetermined` | warning |

**`status-consistency` (compare buckets only IF the edge already exists — do NOT require it):**
`task-completed-gap-closed`, `task-completed-feature-complete`, `verification-passed-task-complete`, `task-not-on-superseded-decision`. Each declares a `relation_types` set but its predicate is a bucket comparison on an existing edge; it never forces the edge to exist.

**The mechanism:** the `requires-edge` class is the only one that flags a *missing* edge. The vocabulary-free requires-edge loop (DEC-0016 names it at `context-sdk.ts:2055-2078`) iterates each item in the invariant's block and, if it carries no edge of the named relation_types in the named direction, emits the issue. An invariant-backed relation_type therefore has a **filing-time forcing function**: `context-validate` (and, for error severity, install/CI) flags any item missing the edge.

**The absence:** every relation_type NOT named in a `requires-edge` invariant has **no forcing function at all**. `read-config --registry relation_types` this run lists 38 relation_types; only those above are invariant-backed. The remainder are filed solely by a manual `append-relation` step that runs AFTER the item write. Nothing — not the write path, not `context-validate` — flags a warranted-but-absent non-invariant edge.

**The exact non-invariant warranted relation_types whose absence goes unflagged:**
- `task_governed_by_decision` (tasks→decisions) — the enacting task of an enacted decision
- `task_addresses_gap` (tasks→framework-gaps) — a task that closed a gap
- `task_addresses_feature` (tasks→features)
- `research_informs_item` (research→*) — a research item that grounds another item
- `task_advances_story` / `feature_advances_story` (well-filed in practice, but unforced)
- the remaining `data_flow` links (`gap_relates_to_issue`, `feature_resolves_issue`, `decision_relates_to_decision`, etc.)

Root cause in one line: **edge-presence is enforced exactly where a `requires-edge` invariant exists and silently under-filed exactly where it does not; warranted non-invariant edges depend entirely on author discipline at the manual post-write `append-relation` step.**

---

## 2. Shape

- **Where the forcing function is missing:** at BOTH write-time and validate-time, for every non-invariant relation_type. Write-time: `append-relation` is a separate call from the item write — no write-time completeness check ties an item's filed body to the edges its text entails. Validate-time: `context-validate` runs requires-edge + status-consistency + structural checks (the issues it emitted this run, §3) but has no rule that flags a *missing* non-invariant edge. So the gap is **both-surface**: neither the authoring write nor the integrity validate catches it.
- **What "warranted" means operationally:** an edge whose presence is entailed by an item's own filed text or by the relation_type's intended population — e.g. a task whose `description`/`closed_by`/`acceptance_criteria` names the gap it closes or the decision it enacts; a research item whose subject grounds a named gap. Warranted ≠ universal: not every task addresses a gap, so a blanket requires-edge invariant cannot be the answer for every type (see §5/§7).
- **Boundary of the affected set:** the union of all relation_types minus the requires-edge-backed set. Population correlates precisely with the boundary: invariant-backed types are fully populated; non-invariant types are inconsistently populated, with absences concentrated in earlier history (TASK-010/012/014 — authored before discipline matured) vs later items (TASK-038/045/059 carry the edges).

---

## 3. Reproducible conditions (the validate asymmetry, with op output)

Established read-only from current state — no mutation constructs the repro.

**Positive contrast (invariant-backed absence IS flagged).** `context-validate` this run returns `status: warnings` and emits, among others, **17 `decision-shows-derivation` warnings** (DEC-0001..DEC-0017), each: *"Decision 'DEC-000N' shows no derivation basis — add a decision_derived_from_item edge … or a decision_escalates_underdetermined edge …"*. This is the requires-edge class flagging a MISSING edge: the `decision_derived_from_item` / `decision_escalates_underdetermined` edge is absent on those decisions and the invariant surfaces it.

**Negative case (non-invariant warranted absence is NOT flagged).** The same `context-validate` run emits **zero** issues about `task_governed_by_decision` or `task_addresses_gap` absences. Yet those edges are demonstrably absent and warranted:

| Item | filed text entails | warranted edge (relation_type) | `find-references` this run | flagged by validate? |
|---|---|---|---|---|
| TASK-010 | description: *"Per DEC-0008 / FGAP-012"* | TASK-010→DEC-0008 (`task_governed_by_decision`) | edges: VER-009 (`verification_verifies_item`), `feature-branch-workflow` + `cli-command-form` (`item_governed_by_convention`) — **no decision/gap edge** | **no** |
| TASK-010 | — | TASK-010→FGAP-012 (`task_addresses_gap`) | same — absent | **no** |
| TASK-012 | description: *"FGAP-013 fix … FGAP-013 closed with the 4 closure fields"* | TASK-012→DEC-0009 (`task_governed_by_decision`) | edges: VER-007 + the two conventions — **no decision/gap edge** | **no** |
| TASK-012 | — | TASK-012→FGAP-015 (`task_addresses_gap`) | same — absent | **no** |
| TASK-014 | description: *"Closes FGAP-014"* | TASK-014→FGAP-014 (`task_addresses_gap`) | edges: VER-008 (`verification_verifies_item`), `feature-branch-workflow` (`item_governed_by_convention`) — **no gap edge** | **no** |

(`context-validate-relations` this run separately returns `invalid` with 29 `edge_parent_not_in_bins` issues on the `story-advancers` / `story-advancers-features` lenses — a lens-bin-population anomaly on edges that ARE filed, distinct from the missing-edge class here. Noted, not part of this gap.)

**The asymmetry is empirical and exact:** an absent `requires-edge`-backed edge is flagged (the 17 decision-shows-derivation warnings); an absent warranted non-invariant edge (the five above) is not flagged by any surface. The targets all exist (DEC-0008, DEC-0009, FGAP-012, FGAP-014, FGAP-015 are valid filed items), so the edges are expressible — they are simply unfiled with nothing to force or flag them.

---

## 4. Prior-art table (precondition — searched before concluding a new filing is warranted)

Paged all 90 `framework-gaps` (`read-block-page` offsets 0–90 this run) and read the named relatives in full.

| id | status | covers | stops short of |
|---|---|---|---|
| **TASK-041** | planned | Backfills the missing `decision_derived_from_item` edges for the 17 warning decisions, THEN raises `decision-shows-derivation` warning→error so a fork-as-decision is unfileable. The proven backfill-then-raise template — for **ONE** relation_type that **already has** a requires-edge invariant. | The general class. It remediates the derivation-edge subset where the invariant already exists; it does not address the relation_types with **no** invariant at all (`task_governed_by_decision`, `task_addresses_gap`, `research_informs_item`, …). |
| **DEC-0016** | enacted | The keystone mechanism: states the requires-edge invariant engine (vocabulary-free loop, `context-sdk.ts:2055-2078`) enforces edge-presence as pure config, no validator code; `decision-cites-forcing-artifact` is the living template. | It is the ENABLER, not a tracker of this gap. Its scope is convention-articulation; it does not enumerate which other warranted relation_types lack the forcing function. The gap IS the absence of DEC-0016's mechanism on the under-filed types. |
| **FGAP-090** | identified | relation_type registry coverage + write-time direction enforcement: three relations the registry CANNOT express (decision-raises-gap, decision-gated-by-item, gap→gap) + name-only unchecked edge direction. | A DIFFERENT axis: expressibility (the type does not exist) + direction-correctness (a written edge points the wrong way). Here the type EXISTS and points correctly; it is simply not WRITTEN. Adjacent, not overlapping. |
| **FGAP-007** | accepted | Ordering-edge name reads opposite to parent/child; a backwards ordering edge files silently; proposes write-time direction enforcement. | About the DIRECTION of an edge that IS filed (ordering types). Not about a warranted edge never filed at all. Sibling on the "write-time edge guard" theme; different defect. |
| **FGAP-082** | identified | Adds a config-declarable `advancer-completion` invariant class — an aggregate-over-incoming-edges quantifier the engine cannot yet express (every advanced story must have a complete advancer). | An invariant-engine EXTENSION axis. Relevant only if a completeness rule for this gap needs to quantify over edges; it does not itself track under-filed edges. |
| **FGAP-071** | identified | Closest sibling: gap-arc-coherence is enforcement:review-only; proposes a requires-edge invariant (modeled on FEAT-007) requiring every non-closed framework-gap to carry `gap_addressed_by_feature` \| `task_addresses_gap` \| a new standalone-ack edge. | Scoped to ONE relation family (gap→arc binding), from the gap side. It is itself an INSTANCE of the general under-filing class (a warranted edge with no forcing function) — it does not generalize to the other under-filed types (`task_governed_by_decision`, `research_informs_item`, the data_flow links). The general gap would subsume FGAP-071's mechanism as one application. |

Also searched `decisions` and `research` (prior audit Part C, re-confirmed by the full framework-gaps page-through this run): no item titles the under-filing/edge-coverage class.

**Prior-art conclusion: NOT tracked.** No substrate item tracks "warranted non-invariant edges have no forcing function and accumulate absences silently" as a class. TASK-041 and FGAP-071 are per-type INSTANCES of it; DEC-0016 is the mechanism it would generalize; FGAP-090/FGAP-007 are adjacent edge-write axes (expressibility / direction), not this (presence). A new filing is justified; it must RELATE to TASK-041 (per-type precedent), DEC-0016 (mechanism), FGAP-071 (a contained instance), and FGAP-082 (the engine-extension axis), and must NOT duplicate any of them.

---

## 5. Class verdict + level

**GENERAL class, not atomic.** The triggering symptom (the five missing TASK→decision/gap edges) is one instance of: *edge-presence has a filing-time forcing function only for relation_types named in a `requires-edge` invariant; every other warranted relation_type depends on manual post-write `append-relation` discipline and accumulates absences with no surface flagging the gap.*

Evidence it is a class, not a one-off: the population correlation is exact (invariant-backed types 100% populated across probed items; non-invariant types inconsistently populated), and the same mechanism explains both the well-filed end (DEC-0018/FGAP-076 — recently authored, both endpoints invariant-touched, fully edged) and the under-filed end (TASK-010/012/014 — early, non-invariant edges absent). The symptom recurs across at least three distinct relation_types (`task_governed_by_decision`, `task_addresses_gap`, `research_informs_item`) and FGAP-071 is a fourth instance already filed narrowly.

**Level to file at:** the **general gap** — "no forcing function for warranted non-invariant closure-table edges" — with the five missing TASK→decision/gap edges as the triggering instance, and FGAP-071 (gap→arc binding) noted as a contained sibling instance. Filing only the five symptom edges (or only one relation_type) would leave the class as architectural debt and invite duplicate per-type sibling filings (the `gap-explore-surfaces-class` convention's exact warning).

**Could-be-narrower consideration (surfaced, rejected):** one might file only `task_addresses_gap` + `task_governed_by_decision` under-filing. Rejected: `research_informs_item` (R-0014 has zero edges per the prior audit's candidate row) and the general data_flow types share the identical root (no requires-edge invariant), so the narrow filing would under-describe the mechanism and the remediation axis.

---

## 6. Relation-targeting feasibility (can a new FGAP for this be typed-linked to its relatives?)

Checked against `read-config --registry relation_types` this run. A new item in `framework-gaps` would want edges to TASK-041 (a task), DEC-0016 (a decision), FGAP-071/FGAP-082/FGAP-090 (framework-gaps).

- **framework-gaps → framework-gaps** (to FGAP-071/082/090): the registry has **no** `framework-gaps`-source type targeting `framework-gaps` (only `gap_addressed_by_decision`, `gap_addressed_by_feature`, `gap_relates_to_issue`). This is **exactly the (C) sub-gap FGAP-090 names** ("no gap→gap relation exists"). However, **`item_derived_from_item`** is registered with `source_kinds: ["*"]`, `target_kinds: ["*"]` — a generic wildcard data_flow type — so a `framework-gaps → framework-gaps` lineage/relates edge IS expressible via `item_derived_from_item` if the semantics fit ("derived from"). A dedicated `gap_relates_to_gap` (semantically "sibling/relates") does NOT exist (FGAP-090's proposed_resolution would add it).
- **framework-gaps → tasks** (to TASK-041): no `framework-gaps`-source type targets `tasks`. But `item_derived_from_item` (`*`→`*`) can express it if the relation is a derivation/relates; there is no semantically-precise "this gap's remediation is precedented by that task" type.
- **framework-gaps → decisions** (to DEC-0016): the registered `framework-gaps`→`decisions` type is **`gap_addressed_by_decision`** — meaning the decision RESOLVES the gap. That is the WRONG semantics for "this gap relates to / generalizes the mechanism that decision established" (DEC-0016 does not resolve this gap). `item_derived_from_item` (`*`→`*`) is the only expressible alternative, and "derived from DEC-0016" is a defensible read (the gap is the absence-of DEC-0016's mechanism). No "relates-to / informed-by" decision-target type exists.

**Feasibility conclusion:** the relate-to-relatives edges are **partially expressible** — only via the generic wildcard `item_derived_from_item`, and only where "derived from" fits the semantics. There is **no** precise "relates/informed-by" type for gap→gap, gap→task, or gap→decision; `gap_addressed_by_decision` would mistype the DEC-0016 link as a resolution (the inverse). This intersects FGAP-090 (which proposes `gap_relates_to_gap` + a write-time direction check). **Do not fabricate an edge** for the filing: relate via `research_informs_item` from the grounding research (if this analysis is surfaced as research) and/or `item_derived_from_item` where "derived from" is honest; flag the missing precise relates-types as an FGAP-090 intersection rather than forcing `gap_addressed_by_decision`.

---

## 7. Filing raw material (rhetorical-register-ready; orchestrator composes the payload + runs the provenance-stop)

**Root-cause statement (for the gap body):**
Closure-table edge presence is enforced only for relation_types backed by a `requires-edge` invariant (`completed-task-has-verification`, `decision-cites-forcing-artifact`, the three `*-articulates-convention`, `decision-shows-derivation`); the vocabulary-free requires-edge loop (DEC-0016; `context-sdk.ts:2055-2078`) flags an item missing such an edge at `context-validate`. Every other warranted relation_type — `task_governed_by_decision`, `task_addresses_gap`, `task_addresses_feature`, `research_informs_item`, the data_flow links — has no requires-edge invariant, so it is filed only by a manual post-write `append-relation` and no surface flags a warranted-but-absent edge. Edges an item's own filed text entails are written inconsistently or omitted, concentrated in pre-discipline history.

**Shape:** both-surface forcing-function absence (write-time: no completeness check ties an item's body to its entailed edges; validate-time: `context-validate` has no missing-non-invariant-edge rule). Affected set = all relation_types minus the requires-edge-backed set. Warranted = entailed by filed text or by the type's intended population; not universal (not every task addresses a gap), so a blanket requires-edge invariant is not the answer for every type.

**Impact:** the closure-table graph is systematically incomplete for non-invariant relations — `task_governed_by_decision`, `task_addresses_gap`, `research_informs_item` are inconsistently populated. Any consumer that reads the graph for provenance/derivation (gate-aware derivation FGAP-061, lineage walks, "what addressed this gap") gets a partial answer; the absences are invisible (no flag), so they accumulate silently as item counts only grow — the same flat-list-drift pattern FGAP-071 names for gaps, generalized to all warranted edges.

**Evidence items (each cited to op output read this run or a committed artifact):**
1. `read-config --registry invariants` (this run): exactly six `requires-edge` invariants; the `status-consistency` ones compare buckets on existing edges only — they do not require edge presence.
2. `read-config --registry relation_types` (this run): 38 relation_types; only the six requires-edge-named ones are forced; `task_governed_by_decision` / `task_addresses_gap` / `research_informs_item` carry no invariant.
3. `context-validate` (this run): emits 17 `decision-shows-derivation` warnings (an invariant-backed ABSENCE flagged) and ZERO warnings for any absent `task_governed_by_decision` / `task_addresses_gap` edge — the asymmetry.
4. `find-references --id TASK-010` (this run): edges = VER-009 + two conventions; no edge to DEC-0008 or FGAP-012, though TASK-010.description = "Per DEC-0008 / FGAP-012".
5. `find-references --id TASK-012` (this run): edges = VER-007 + two conventions; no edge to DEC-0009 or FGAP-015, though TASK-012 is FGAP-013's fix / DEC-0009's enacting task.
6. `find-references --id TASK-014` (this run): edges = VER-008 + one convention; no edge to FGAP-014, though TASK-014.description = "Closes FGAP-014".
7. `read-block-page --block framework-gaps` offsets 0–90 (this run): no item titles the under-filing/edge-coverage class; TASK-041 + FGAP-071 are per-type instances, DEC-0016 the mechanism.

**Proposed-resolution shape (axis, not a committed mechanism — author judgment frontier):**
Generalize the TASK-041 / DEC-0016 pattern to the under-filed warranted relation_types. Per relation_type, choose:
(a) where presence is universally entailed (a completed task that closed a gap; an enacting task of an enacted decision), add a `requires-edge` invariant making the edge unfileable-without — gated behind a backfill (the TASK-041 clean-after-backfill template), severity warning→error after backfill; or
(b) where presence is conditional (not every task addresses a gap), add a validator advisory that flags an item whose body text names a closure/enactment (e.g. "closes FGAP-…", "per DEC-…") without the corresponding edge — a text-entailment check rather than a blanket requirement.
Whether any rule needs the FGAP-082 aggregate-over-edges invariant class to express it is part of the author-judgment frontier. Relate the filing to TASK-041 (per-type precedent), DEC-0016 (mechanism), FGAP-071 (contained instance), FGAP-082 (engine axis), via `item_derived_from_item` / `research_informs_item` only where semantically honest (§6) — not `gap_addressed_by_decision`.

---

## CLI-surface notes (experience-gap candidates — surfaced, not filed, not routed around)

- **No op materializes all edges of an arbitrary relation_type.** Auditing population of `task_addresses_gap` / `task_governed_by_decision` / `research_informs_item` required per-item `find-references` probing; `context-edges-for-lens --lensId` only serves relation_types that happen to have a registered lens (`story-advancers`, `story-advancers-features`). A global "all edges of type X" read op would make relation-completeness auditing first-class. Candidate experience-gap.
- **`read-block-page` byte cap forces tiny pages + persists oversized output to a file.** Scanning the 90 framework-gaps for prior-art required 8–10-item pages; a 25-item page returned `data:null, truncated:true`, and one page was auto-persisted to a tool-results file (it exceeded the inline limit). Expected behavior of the DEC-0009 boundary cap, but there is no field-projection (`read-block-page --fields`/`--select` both rejected this run with `unknown flag`) to fetch id+title cheaply — so title-scanning a large block hits the cap repeatedly. Candidate friction (intersects the prior audit's same note); not filed.
- **`filter-block-items` flag shape.** First attempt used `--predicate` (rejected: `unknown flag`); the op takes `--field`/`--op`/`--value`. Minor — the `--help` output is precise. Noted, not a gap.
