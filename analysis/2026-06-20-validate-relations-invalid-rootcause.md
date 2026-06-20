# `context-validate-relations` = `invalid`: root cause of the spurious `edge_parent_not_in_bins` story-advancer backlog

Date: 2026-06-20
Investigator: experience-gap investigation (read-only; live `.context` not mutated)
Substrate: `/Users/david/Projects/workflowsPiExtension`, active `.context`

## Verdict (one line)

The failure is **spurious**. The 29 `edge_parent_not_in_bins` issues are legitimate content edges (real `task_advances_story` / `feature_advances_story` advancer edges) wrongly judged by `validateRelations`, which has no way to distinguish an **edge-materialization lens** (a lens declared only so `context-edges-for-lens` can list its edges; `derived_from_field: null`, `bins: []`) from a **binning-projection lens** (bins are real label sets). Every lens is treated as a binning lens, so every advancer edge — whose parent is an item id, never a bin label — fails the `parent ∈ bins` check against an empty `bins` array. The whole-substrate verdict is therefore `invalid` on edges that are structurally correct.

## 1. Root cause (mechanism, with citations)

### The validator

`validateRelations` (`packages/pi-context/src/context.ts:1712-1906`) builds a relation_type→lens map with **no filter**:

```
packages/pi-context/src/context.ts:1720-1724
  const lensesByRelType = new Map<string, LensSpec>();
  for (const l of config.lenses ?? []) {
    const rt = l.relation_type ?? l.id;
    lensesByRelType.set(rt, l);     // EVERY lens, regardless of kind / derived_from_field / bins
  }
```

For each authored edge, if its `relation_type` matches any lens, it enters the lens branch unconditionally (`context.ts:1738`, `1771`):

```
packages/pi-context/src/context.ts:1771-1783
  if (lens) {
    const parentBin = endpointBin(edge.parent) ?? parentKey;   // an item parent → its refname (e.g. "TASK-046")
    if (!lens.bins.includes(parentBin)) {                      // [] .includes(anything) === false
      issues.push({ code: "edge_parent_not_in_bins",
        message: `lens-edge parent '${parentBin}' is not in lens '${lens.id}' bins` });
    }
    ...
  }
```

A content advancer edge has a **structured item parent** (`{kind:"item", refname:"TASK-046"}`). `endpointBin` returns null for an item parent, so `parentBin` falls back to the refname (`parentKey`). `lens.bins` is `[]`. `[].includes("TASK-046")` is always `false` → `edge_parent_not_in_bins`. This is exactly the documented fall-through at `context.ts:1772-1776`:

```
context.ts:1774-1776
  // A structured ITEM parent (endpointBin null) keys on its refname/oid and
  // fails the includes test → edge_parent_not_in_bins (never an idIndex.get).
```

`edge_parent_not_in_bins` is in `errorCodes` (`context.ts:1894-1902`), so `hasErrors` is true and `status` becomes `"invalid"` (`context.ts:1903-1904`).

### The config that triggers it

Both story-advancer lenses are `kind: target` with **empty bins** over relation_types that carry real content edges (live `.context` config, read via `pi-context read-config --registry lenses`):

```
story-advancers:           { id, kind:"target", target:"story", relation_type:"task_advances_story",    derived_from_field:null, bins:[] }
story-advancers-features:  { id, kind:"target", target:"story", relation_type:"feature_advances_story", derived_from_field:null, bins:[] }
```

`derived_from_field: null` + `bins: []` means: not a status/priority binning lens at all — a **hand-curated-edge lens** (per `lens-view.ts:121-124`, `derived_from_field` null renders as "hand-curated edges in relations.json"). It was authored purely as an edge-materialization handle, NOT to bin items into label buckets.

The relation_types are normal data_flow content relations (`pi-context read-config --registry relation_types`):

```
task_advances_story:     { category:"data_flow", source_kinds:["tasks"],    target_kinds:["story"] }
feature_advances_story:  { category:"data_flow", source_kinds:["features"], target_kinds:["story"] }
```

### Why this is the exact mechanism — author's own acknowledgement

The lens-declaring commit message states the conflict outright:

```
git log -S 'story-advancers' -- .context/config.json
  f2b8f91 substrate(.context): declare the story-advancers lens ...
    context-edges-for-lens --lensId story-advancers materializes every task->story criteria binding;
    lens-view binning inapplicable (bins are edge-parent labels, an open task-id set)
  a7831ae substrate(.context): declare the story-advancers-features lens ... currently empty (no feature bindings yet)
```

The author *knew* binning was inapplicable and deliberately left `bins: []` — intending the lens only for `context-edges-for-lens`. The validator has no representation for "edge-materialization-only lens," so it imposes the binning contract (`parent ∈ bins`) on a lens whose parents are by-design an open item-id set. **A single relation_type is overloaded as both a content relation (carrying real TASK→STORY edges) and a lens projection axis, and the validator only models the latter.**

## 2. Shape

- **29 issues**, all `edge_parent_not_in_bins`, status `invalid` (live `pi-context context-validate-relations`).
- Two relation_types / two lenses:
  - `task_advances_story` → lens `story-advancers`: 13 edges (parents TASK-046, TASK-048×6, TASK-049, TASK-050, TASK-051×4, TASK-052×2).
  - `feature_advances_story` → lens `story-advancers-features`: 14 edges (parent FEAT-009 → STORY-001..014, one per story).
- **Spurious, not a real structural break.** Each flagged edge is a legitimate content edge: source kind matches the relation_type's `source_kinds`, target is a `story`, the edge expresses a true advancer relationship. The edges are correct; the verdict is wrong. No data is malformed; no edge points at a non-existent item (those would be `edge_endpoint_dangling`, not present here).
- The failure scales with real work: every new task/feature→story advancer edge adds another false `invalid`. The backlog grew from 1 (TASK-046, 2026-06-14) toward 29 as FEAT-009 + its tasks were decomposed.

## 3. Reproducible conditions

Deterministic, against the live substrate (read-only):

```
pi-context context-validate-relations --json
→ {"status":"invalid","issues":[{"code":"edge_parent_not_in_bins",
   "message":"lens-edge parent 'TASK-046' is not in lens 'story-advancers' bins", ...}, ... 29 total]}
```

Minimal constructed repro (the mechanism in isolation; build on a throwaway `/tmp` substrate, never `.context`):
1. Declare a `kind:target` lens `L` with `relation_type: R`, `derived_from_field: null`, `bins: []`.
2. Register `R` as a data_flow relation_type with matching source/target kinds.
3. Append one real edge `{parent: <item-id>, child: <item-id>, relation_type: R}`.
4. `context-validate-relations` → `invalid`, one `edge_parent_not_in_bins` on that edge.

The fault reproduces from config + one edge; no special item state required. (Not executed on a constructed substrate in this investigation — the live substrate already exhibits it deterministically and the source path at `context.ts:1720-1783` is unconditional, so the constructed case is mechanically entailed.)

## 4. Prior-art search (precondition of filing)

Searched the live substrate via the reflecting CLI (whole-node / filtered reads):
- `read-block issues` — 9 items; none about lens-bin validation. (resync/promote-cli issues only.)
- `read-block-page framework-gaps` + `filter-block-items --block framework-gaps --field title --op matches` on `lens|bins|advancer|validate-relations|story-advancers|relation_type` — 8 matched FGAPs, individually inspected.

Nearest neighbors (NONE covers this gap):

| id | status | what it is | why not this gap |
|----|--------|-----------|------------------|
| FGAP-073 | closed | "reflecting CLI has no op to project a config-declared lens as a binned item-view" → added `context-lens-view` | About *rendering* a lens, not *validating* edges; closed; orthogonal surface |
| FGAP-082 | identified | "invariant engine cannot express exists-a-complete-advancer rules" | About the **invariant** engine's missing aggregate class for the advancer-completion *rule*; unrelated to `validateRelations`' lens-bin check. Mentions the same relation_types incidentally |
| FGAP-090 | closed | relation_type registry coverage + write-time edge-direction | About missing relation_types + direction, not lens-bin validation |
| FGAP-091 | identified | forcing-function for warranted non-invariant edges | About *missing* edges, the inverse axis |
| FGAP-093 | identified | write-time/validate-time edge-guard parity (dangling/unregistered/cycle) | Parity on endpoint-existence + cycle codes; does NOT include `edge_parent_not_in_bins` / lens-axis-vs-content-relation conflation |
| FGAP-094 | identified | catalog↔config relation_type drift; lists `task_advances_story`/`feature_advances_story` as live-only | About catalog parity of vocabulary, not the validator's lens-bin semantics |

**Prior-art verdict: UNTRACKED.** No FGAP, issue, or task covers "a lens over a content relation_type with empty bins yields spurious `edge_parent_not_in_bins`" / "validateRelations conflates a content relation with a lens-axis relation." This is a relate-to-neighbors, NOT a refile. On filing, relate to: FGAP-093 (sibling write/validate edge-guard axis), FGAP-073 (the lens-view surface that legitimized edge-materialization lenses), FGAP-082 (same relation_types, different engine).

## 5. Class

**This is a general gap, not atomic.** The class:

> **The lens/relation model conflates two distinct roles a `relation_type` + lens can play — a content relation (carrying real inter-item edges) and a lens projection axis (whose edges are bin-label→item) — and `validateRelations` unconditionally imposes the binning contract (`edge.parent ∈ lens.bins`) on every edge whose relation_type matches any lens, with no representation for an edge-materialization lens (`derived_from_field: null`, `bins: []`).**

Sibling instances the class covers (current + latent):
- `story-advancers` / `task_advances_story` (13 edges) — triggering instance.
- `story-advancers-features` / `feature_advances_story` (14 edges) — same class, already live.
- **Any future hand-curated edge-materialization lens** over a content relation_type with an open item-id parent set (the pattern the author deliberately used and `context-edges-for-lens` is built to serve) will reproduce it. The class is open-ended: each such lens added is another spurious `invalid`.

The atomic symptom ("these 29 edges fail") is the wrong filing level — fixing only the symptom (e.g. backfilling bins, or deleting the lenses) leaves the validator unable to model edge-materialization lenses and invites duplicate sibling filings the moment another such lens is declared. **File at the class level: the validator must distinguish lens roles** (e.g. skip the `parent ∈ bins` check for a lens with `derived_from_field: null` AND `bins: []` whose edges are content edges, or introduce an explicit lens-kind/flag marking an edge-materialization lens; or, dually, only treat an edge as a lens-bin edge when its parent is structurally a `lens_bin` endpoint, not an item endpoint).

## 6. History (when the verdict appeared; whether dismissed as baseline)

From `claude-history search`:
- **First live appearance** of this `invalid` verdict: **2026-06-14T00:45:36Z** (session `8490e49a`), right after the first `TASK-046 task_advances_story STORY-008` edge was wired (`58069d8`). (Earlier 2026-05-31 / 2026-06-02 hits are the validator's own unit-test fixtures + source, not the live substrate.)
- **Repeatedly observed and dismissed as "pre-existing backlog," never investigated or filed**, across at least: 2026-06-14, 06-18 (×4), 06-19 (×2), 06-20 (×3). Verbatim dismissals:
  - 2026-06-19T14:17:38Z (assistant): *"`context-validate-relations` reports `invalid`, but every issue is a pre-existing `edge_parent_not_in_bins` warning on the `story-advancers`/`story-advancers-features` lenses (TASK...)."*
  - 2026-06-20T03:05:58Z (assistant): *"all 30 violations are the **pre-existing** story-advancer `edge_parent_not_in_bins` backlog (TASK-046/048/049/050/051/052, FEAT-009...)."*
  - 2026-06-20T03:28:21Z (assistant): *"every `task_advances_story` / `feature_advances_story` edge parent is flagged ... because there are no bins for the parent to belong to."*
- The lenses were declared deliberately with `bins: []` (`f2b8f91`, `a7831ae`) with the commit message acknowledging "lens-view binning inapplicable (bins are edge-parent labels, an open task-id set)" — i.e. the conflict was foreseen at authoring time but never tracked as a validator gap.

Net: the verdict is well-aged (≈6 days, ≥10 observations) and has been consistently routed around as "baseline," exactly the dismissal pattern this investigation exists to convert into a filed gap.

---

## Proposed FGAP (ready to file — do NOT file from this report; provenance review required)

- **title:** `validateRelations conflates content relations with lens-axis relations: a hand-curated edge-materialization lens (derived_from_field null, bins []) over a content relation_type yields spurious edge_parent_not_in_bins on every real advancer edge, forcing context-validate-relations to invalid`
- **description:** `validateRelations (context.ts:1712-1906) maps EVERY config.lenses[] entry by its relation_type with no filter (1720-1724) and, for any edge whose relation_type matches a lens, unconditionally applies the binning contract: edge.parent must be a declared lens bin (1771-1783). It has no representation for an edge-materialization lens — a hand-curated lens (derived_from_field: null) declared only so context-edges-for-lens can materialize its edges, whose parents are an open item-id set, not a fixed bin-label set. The two story-advancer lenses are exactly this: story-advancers (relation_type task_advances_story) and story-advancers-features (relation_type feature_advances_story), both kind:target, derived_from_field:null, bins:[]. Their relation_types also carry the real content advancer edges (TASK->STORY, FEAT->STORY). For each such content edge the structured item parent (e.g. TASK-046) is not a bin label, [].includes(...) is false, and an edge_parent_not_in_bins error fires (an errorCodes member), so context-validate-relations returns invalid on structurally-correct edges. 29 live spurious issues (13 task_advances_story + 14 feature_advances_story). The lens author foresaw this — commit f2b8f91 states "lens-view binning inapplicable (bins are edge-parent labels, an open task-id set)" — but the validator has no way to honor it. General class: a single relation_type overloaded as both a content relation and a lens projection axis, where validateRelations only models the projection axis.`
- **evidence:**
  - `{ file: "packages/pi-context/src/context.ts", lines: "1720-1724", reference: "lensesByRelType maps EVERY config.lenses[] by relation_type with no kind/derived_from_field/bins filter — an edge-materialization lens is registered identically to a binning lens" }`
  - `{ file: "packages/pi-context/src/context.ts", lines: "1771-1783", reference: "the lens branch unconditionally requires edge.parent ∈ lens.bins; a structured item parent falls back to its refname (1774-1776) and [].includes(refname) is false → edge_parent_not_in_bins" }`
  - `{ file: "packages/pi-context/src/context.ts", lines: "1894-1904", reference: "edge_parent_not_in_bins ∈ errorCodes → hasErrors → status 'invalid' (not a warning)" }`
  - `{ file: ".context/config.json", reference: "lenses story-advancers (relation_type task_advances_story) and story-advancers-features (relation_type feature_advances_story): both kind:target, target:story, derived_from_field:null, bins:[] — read via pi-context read-config --registry lenses" }`
  - `{ file: ".context/config.json", reference: "relation_types task_advances_story / feature_advances_story: category data_flow, source_kinds tasks/features, target_kinds story — content relations, not lens-axis-only" }`
  - `{ file: "packages/pi-context/src/lens-view.ts", lines: "121-124", reference: "derived_from_field:null is the hand-curated-edge lens marker ('hand-curated edges in relations.json'), confirming these lenses are edge-materialization, not status/priority binning" }`
  - `{ file: ".context/config.json (git f2b8f91)", reference: "lens-declaring commit message: 'context-edges-for-lens --lensId story-advancers materializes every task->story criteria binding; lens-view binning inapplicable (bins are edge-parent labels, an open task-id set)' — the conflict acknowledged at authoring" }`
- **impact:** `context-validate-relations returns invalid on a substrate whose edges are all structurally correct, so the integrity gate is unusable as a green/red signal: every real advancer edge added (each task/feature->story) increases the false count (29 live, was 1 on 2026-06-14). For ~6 days the invalid verdict has been routed around as a 'pre-existing backlog' in every session that ran the gate, masking any genuine relation defect that the same op would surface. Any consumer trusting context-validate-relations status (closure gate, CI, the canonical pipeline's integrity step) gets a false negative on the substrate's health. The pattern recurs for every hand-curated edge-materialization lens declared over a content relation_type.`
- **proposed_resolution:** `Make validateRelations distinguish a content relation from a lens projection axis so an edge-materialization lens does not impose the parent∈bins contract on content edges. Two candidate mechanisms (the closing task decides): (a) skip the parent∈bins check for a lens with derived_from_field:null AND bins:[] (an explicit edge-materialization lens), treating its edges as content edges validated on kind/endpoint-existence only; or (b) — preferred for precision — only treat an edge as a lens-bin edge when its parent is structurally a lens_bin endpoint (endpointBin non-null), so a structured item parent never enters the bins check regardless of lens kind, and add an explicit lens flag/kind marking edge-materialization lenses for clarity. Either way: re-derive the correct status for the 29 live story-advancer edges (they become clean), and add a test fixture: a hand-curated lens over a content relation_type with item-parent edges must validate clean. Relate to FGAP-093 (sibling write/validate edge-guard parity axis), FGAP-073 (the context-lens-view surface that serves edge-materialization lenses), FGAP-082 (same relation_types, invariant-engine axis).`
- **canonical_vocabulary:** `content-relation vs lens-axis-relation conflation in validateRelations (edge-materialization lens)`
- **suggested priority:** `P2` (spurious failure of a core integrity gate, long-standing, masks real defects; not data-destructive, hence not P1)

### Filing verdicts (summary)
- **Prior-art: UNTRACKED.** No existing FGAP/issue/task covers the lens-bin/content-relation conflation. Relate to FGAP-093 / FGAP-073 / FGAP-082; do not refile under any of them.
- **Class: GENERAL, file at class level.** Not atomic — `story-advancers` is the triggering instance of "a lens over a content relation with empty bins / open item-id parents yields spurious invalid"; `story-advancers-features` is an already-live sibling; any future edge-materialization lens reproduces it. File the class with the story-advancer lenses as triggering instances, not the 29 edges as the unit.
