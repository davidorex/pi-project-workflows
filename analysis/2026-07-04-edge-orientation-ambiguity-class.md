# Edge orientation ambiguity — a defect CLASS (write-silent + read-silent), 2026-07-04

Investigation to comprehensively characterize a candidate defect class in pi-context so it can be
filed once at the altitude the class warrants. Read/trace/enumerate + empirical reproduction. NO
source changed, NOTHING filed to the substrate. Repo `/Users/david/Projects/workflowsPiExtension`,
main at `aafc8dc`. Substrate reads via the `pi-context` CLI only; code reads via Read/Grep.

Every claim below carries a `file:line` anchor verified against today's code, or a verbatim CLI
output line.

---

## 0. One-sentence class statement

**Edge orientation (which endpoint is stored as `parent` vs `child`) is a convention that neither
the relation_type NAME nor any queryable metadata carries, and NO consuming surface — write/append
or read/walk — signals a wrong-orientation guess: the failure is ALWAYS silent, so backwards edges
(write side) and empty results (read side) accumulate undetected.**

The user's candidate framing ("name-vs-stored-orientation ambiguity that fails SILENTLY on the
wrong guess") is confirmed and SHARPENED: it is not one footgun but a matrix, and the sharpest
evidence is that the framework is INTERNALLY INCONSISTENT about orientation within a single category
(membership `feature_contains_story` stores container=parent, but membership
`task_positioned_in_phase` stores container=CHILD), so any orientation heuristic a caller learns is
wrong for some sibling relation, and every surface stays silent when it is.

---

## 1. Root cause + precise shape

### 1.1 The stored-orientation rule the whole system runs on

An edge is `{parent, child, relation_type}` (`.context/relations.json`). The system's only structural
pin on orientation is the **source/target-kind** check, which maps **parent → `source_kinds`,
child → `target_kinds`**:

- `validateEdgeAgainstRegistry` (`packages/pi-context/src/context-sdk.ts:1568-1601`): the parent's
  resolved block must be in `rt.source_kinds` (`:1590`) and the child's in `rt.target_kinds`
  (`:1595`). The relation_type `canonical_id` is `source_verb_target` by convention, so the intended
  reading is **parent = source, child = target** — e.g. `task_positioned_in_phase` ⇒ parent=task,
  child=phase.

Empirically confirmed by the live edge (§2.1): `task_positioned_in_phase` stores
`{parent: TASK-027, child: PHASE-M5-WRITE-INTEGRITY}` — parent = source-kind (task), child =
target-kind (phase).

### 1.2 Why stored orientation is NOT recoverable from the name

Two independent failures of recoverability, by kind-shape:

**(a) Same-kind relations — orientation is unrecoverable in principle.** When `source_kinds ==
target_kinds` (e.g. `task_depends_on_task`, both `["tasks"]`), the `source_verb_target` name gives
NO information about which of the two same-kind items is parent, and the kind check
(`:1590`/`:1595`) cannot distinguish orientation because both orientations satisfy both sets. The
name is orientation-blind and the only structural guard is orientation-blind too.

**(b) The verb creates a competing, WRONG intuition even when kinds differ.** Two distinct verb-vs-
stored inversions:

- **Ordering / deriver inversion (FGAP-007).** The blocked/ready deriver treats
  `task_depends_on_task {parent: D, child: T}` as "T depends on D, D is the PREREQUISITE"
  (`context-sdk.ts:683-712` docstring; `dependencyPredsOf` at `:801-804` collects `e.parent` for
  edges whose `e.child === itemId` = the prerequisites of the item). But `source_verb_target` reads
  "parent(source) depends_on child(target)" — i.e. parent is the DEPENDER. Name-verb and deriver are
  **opposite**: name says parent is the depender, deriver says parent is the depended-upon.

- **Membership / hierarchy inversion (the read instance).** `task_positioned_in_phase` stores
  parent=task(member), child=phase(container) (§2.1). The closure-table intuition "a container is an
  ANCESTOR of its members" says a phase (container) should be the parent/ancestor. The stored
  orientation is the OPPOSITE — the member points UP to the container as its `child`. The verb
  "positioned_in" reads the task as subordinate/contained (intuitively the child), which is stored-
  faithful — yet the SAME category's `feature_contains_story` (`source=[features] target=[story]`)
  stores container=parent (feature contains story ⇒ parent contains child). So within `membership`:
  `contains`/`includes` ⇒ container=PARENT; `positioned_in` ⇒ container=CHILD. Orientation flips on
  the verb, and nothing but the English verb signals it.

### 1.3 Why every surface fails SILENTLY on a wrong guess

- **Write/append does no orientation check at all.** `appendRelationByRef` (`context-sdk.ts:1650-`)
  calls `assertEdgeValidForWrite` (`:1629-1636`) → `validateEdgeAgainstRegistry`, which checks ONLY
  (a) relation_type registration (`:1577-1583`) and (b) source/target-KIND membership
  (`:1586-1599`). There is NO direction/role/orientation check. Consequence: a backwards edge whose
  kinds still satisfy the sets is accepted and persisted with `appended: true` and no signal. This
  is unconditional for same-kind relations and for both-wildcard relations (`item_derived_from_item`,
  `source=[*] target=[*]` — neither endpoint kind constrains orientation).

- **Read/walk is a bare direction primitive.** `walkDescendants` (`context.ts:1550-1567`) follows
  `e.parent === node`; `walkAncestors` (`context.ts:1585-1602`) follows `e.child === node`. Neither
  knows a relation's orientation convention; a wrong-direction call simply matches no edge and
  returns `[]`. Empty is indistinguishable from "no such membership/dependency exists." The same
  silent-empty is inherited by every consumer of these primitives:
  `gatherExecutionContext` in/out walks (`execution-context.ts:189-195`), the lens walkers
  (`lens-view.ts:263`, `:273-275`), and the reflected CLI ops `walk-ancestors` /
  `context-walk-descendants` (`ops-registry.ts:1959-1971`, `:1940-`).

- **The derivers are internally CORRECT but they are the SURFACING point, not a guard.**
  `currentState` hardcodes the right direction per relation — dependency preds `:801-804`, gate preds
  `:805-809` (parent=task/child=gate), membership rollup `:913-927` (members = `e.parent` of edges
  whose `e.child === container`). `roadmap-plan.ts` likewise hardcodes member=parent for
  `task_positioned_in_phase` / `phase_positioned_in_milestone` (`:147-166`, `:386-397`). Because they
  hardcode, they cannot detect a wrongly-oriented edge — they simply consume it and emit wrong
  blocked/ready/roadmap state with no signal (exactly FGAP-007's "surfaces only in derived state").

- **`context-validate` does not check orientation.** Its edge loop (`context-sdk.ts:2179-`) checks
  endpoint existence (`edge_endpoint_dangling` `:2201`), alias registration
  (`edge_endpoint_unregistered` `:2193`), source/target KIND (via the shared
  `validateEdgeAgainstRegistry`, `:2251`), and merges cycle detection — but NEVER a semantic
  direction/role. A backwards same-kind edge is validate-CLEAN. A backwards CROSS-kind edge is caught
  only INCIDENTALLY, because swapping endpoints happens to violate the kind sets — not by any
  orientation-aware rule.

**Net mechanism:** orientation is knowable only out-of-band (read the deriver source, or know the
implicit source→parent rule AND that the verb may invert it). The name is an unreliable cue, there is
no machine-readable orientation metadata to query, and no surface — write, read, or validate — raises
a signal when a caller guesses wrong. Both the write footgun and the read footgun are the same
missing thing seen from two sides.

---

## 2. Empirical reproduction (verbatim)

### 2.1 READ side — silent-empty membership walk (LIVE, reproduced today)

Stored orientation: `task_positioned_in_phase` = {parent: task, child: phase}. The name/containment
intuition says "walk up from the task to find its phase" — which is `walk-ancestors`, and it returns
SILENT EMPTY:

```
$ pi-context walk-ancestors --id TASK-027 --relationType task_positioned_in_phase --json
{"ok":true,"op":"walk-ancestors","output":{"data":[],"total":0,"hasMore":false,"truncated":false,"totalBytes":2,"complete":true}}
```

The correct walk (member is the PARENT, so descend from it) returns the phase:

```
$ pi-context context-walk-descendants --parentId TASK-027 --relationType task_positioned_in_phase --json
{"ok":true,"op":"context-walk-descendants","output":["PHASE-M5-WRITE-INTEGRITY"]}
```

`data: [], total: 0` is indistinguishable from "TASK-027 is in no phase." No error, no orientation
hint. Confirmed instance.

### 2.2 WRITE side — silent backwards ordering edge (FGAP-007, cited not re-run)

`FGAP-007` (status `accepted`) records: `append-relation does no semantic direction check, so a
backwards ordering edge is accepted silently and only surfaces in derived state — it just produced a
backwards TASK-004/TASK-005 dependency, corrected at 5621c2a`. The correcting commit is real:

```
5621c2a fix(context): correct the TASK-004/TASK-005 dependency direction (was filed backwards)
```

The FGAP-007 resolution (endpoint_roles metadata + write-time validate/normalize) was implemented and
reverted the same day — commits confirmed present in git:

```
a08e586 feat(pi-context): FGAP-007 ordering-edge direction enforcement via endpoint_roles (TASK-027)
7968580 substrate(.context): close TASK-027 + FGAP-007 (endpoint_roles direction enforcement)
b80eea7 Revert "feat(pi-context): FGAP-007 ordering-edge direction enforcement via endpoint_roles (TASK-027)"
98b6413 Revert "substrate(.context): close TASK-027 + FGAP-007 (endpoint_roles direction enforcement)"
fe676a5 Revert "substrate(.context): add FGAP-007 endpoint_roles to inverted-name ordering relation_types"
```

The reverted implementation remains recoverable at `a08e586`. Per instruction, no write was re-run.

### 2.3 Bounding the class — where a wrong guess fails LOUD (write side, cross-kind)

Not re-run destructively; established by reading the write gate. For a CROSS-kind non-wildcard
relation (e.g. `task_positioned_in_phase`, source=[tasks] target=[phase]), a fully-swapped edge
`{parent: phase, child: task}` has parent-kind `phase` ∉ `source_kinds [tasks]`, so
`validateEdgeAgainstRegistry` (`context-sdk.ts:1590`) rejects it LOUD at write
(`assertEdgeValidForWrite` throws, `:1634`). This is why the membership footgun bites on the READ
side but not the write side: the kind check incidentally guards cross-kind write orientation. It does
NOT guard same-kind or both-wildcard write orientation, and it never guards ANY read.

---

## 3. Full axis enumeration — relation_type × surface matrix

Source: `pi-context read-config --registry relation_types --json` (43 registered types). "Stored
orientation" = parent=source_kind, child=target_kind (§1.1). "Kind-shape" drives write-side silence.

### 3.1 Per-relation write-side orientation guard (does a fully-swapped edge get rejected?)

| kind-shape | example relation_types | swapped edge at write | write-silent? |
|---|---|---|---|
| **same-kind** (source==target) | `task_depends_on_task`, `story_depends_on_story`, `requirement_depends_on_requirement`, `decision_supersedes_decision`, `research_supersedes_research`, `milestone_precedes_milestone`, `decision_relates_to_decision`, `gap_relates_to_gap`, `research_relates_to_research`, `issue_relates_to_issue`, `feature_contains_story`? (no: features/story cross) | both orientations satisfy both sets | **YES — always silent** |
| **both-wildcard** (`[*]`/`[*]`) | `item_derived_from_item` | neither endpoint kind constrains orientation | **YES — always silent** |
| **wildcard target** (`src`/`[*]`) | `feature_depends_on_item`, `feature_gated_by_item`, `story_gated_by_item`, `task_gated_by_item`, `decision_gated_by_item`, `research_informs_item`, `review_targets_item`, `session_touches_item`, `story_includes_item`, `decision_derived_from_item` | silent IFF the swapped-into-parent endpoint's kind still ∈ source_kinds (e.g. a gate target that is itself a task); else loud | **CONDITIONAL** |
| **cross-kind non-wildcard** | `task_positioned_in_phase`, `phase_positioned_in_milestone`, `feature_contains_story`, `decision_addresses_gap`, `verification`? , `item_governed_by_convention`, `gap_addressed_by_feature`, most data_flow | parent gets target-kind ∉ source_kinds → rejected | **NO — loud (incidental)** |

### 3.2 Per-surface behavior on a naive (name-faithful) orientation guess

| surface (AXIS A) | mechanism anchor | behavior on wrong orientation |
|---|---|---|
| write / `append-relation`, `append-relations` | `context-sdk.ts:1629-1636`, `:1650-1666`, `appendRelationsByRef :1811` | **silent-accept** for same-kind + both-wildcard + conditionally wildcard-target; loud only when kinds differ |
| read / `walk-ancestors` (`walkAncestors`) | `context.ts:1585-1602`; op `ops-registry.ts:1959-1971` | **silent-empty `[]`** for ALL relation_types |
| read / `context-walk-descendants` (`walkDescendants`) | `context.ts:1550-1567`; op `ops-registry.ts:1940-` | **silent-empty `[]`** for ALL relation_types |
| read / `gather-execution-context` in\|out | `execution-context.ts:189-195` | inherits silent-empty (calls the two walkers) |
| read / lens walkers | `lens-view.ts:263`, `:273-275` | inherits silent-empty |
| derive / `currentState` blocked/ready | `context-sdk.ts:683-712`, `:801-809` | **correct-by-hardcode**; but consumes a silently-backwards edge → wrong blocked/ready, no signal (surfacing point) |
| derive / roadmap-plan rollups | `roadmap-plan.ts:147-166`, `:386-397`; `currentState :913-927` | **correct-by-hardcode**; same surfacing property |
| validate / `context-validate` | `context-sdk.ts:2179-`, `:2251` | checks kind/existence/cycle; **NO orientation check** → backwards same-kind edge validate-clean |

### 3.3 Silent-failure CELL inventory (the class membership)

**Write-side, UNCONDITIONALLY silent + consequential** (backwards edge changes derived meaning):

1. `task_depends_on_task` — wrong blocked/ready. *(FGAP-007 named instance)*
2. `story_depends_on_story` — wrong story ordering.
3. `requirement_depends_on_requirement` — wrong requirement ordering.
4. `milestone_precedes_milestone` — wrong roadmap topo (`roadmap-plan` preds).
5. `decision_supersedes_decision` — wrong supersession chain.
6. `research_supersedes_research` — wrong supersession chain.
7. `item_derived_from_item` — wrong provenance direction; **strictly worse than #1**: both endpoints
   `[*]`, so NOTHING (not even same-kind restriction) constrains it. **NEW instance.**

*(Write-side, unconditionally silent but semantically symmetric — stored-direction-silent, low harm:
`decision_relates_to_decision`, `gap_relates_to_gap`, `research_relates_to_research`,
`issue_relates_to_issue` — a backwards "relates" is harmless to meaning but STILL returns silent-empty
on a wrong-direction walk.)*

**Write-side, CONDITIONALLY silent** (wildcard-target ordering/gate/flow relations, silent when the
swapped endpoint's kind coincidentally satisfies source_kinds): `feature_depends_on_item`,
`feature_gated_by_item`, `story_gated_by_item`, `task_gated_by_item`, `decision_gated_by_item`,
`research_informs_item`, `story_includes_item`, `review_targets_item`, `session_touches_item`,
`decision_derived_from_item`.

**Read-side, silent-empty on a wrong-direction walk — UNIVERSAL** across the walk porcelain (§3.2),
i.e. every one of the 43 relation_types is a read-side class member when consumed via
`walk-ancestors`/`context-walk-descendants`/`gather-execution-context`/lens walks. The concrete,
high-risk, demonstrated cells:

8. `task_positioned_in_phase` — member=parent/container=child, counter to containment intuition.
   *(demonstrated §2.1 — the read instance)*
9. `phase_positioned_in_milestone` — identical shape (member=parent). **NEW (sibling of #8).**

**Structural amplifier (NEW finding):** within `category: membership`, orientation is INCONSISTENT —
`feature_contains_story` / `story_includes_item` store container=PARENT, while
`task_positioned_in_phase` / `phase_positioned_in_milestone` store container=CHILD. A caller who
learns "container is the ancestor" from `contains`/`includes` walks the WRONG way on `positioned_in`
and gets silent-empty. The class is therefore not merely "name doesn't carry orientation" but "the
framework's own orientation is verb-dependent and internally inconsistent, with no surface to detect
the mismatch."

**Count of silent-failure cells found:** 7 unconditional-consequential write cells (incl. 1 new:
`item_derived_from_item`) + 4 symmetric write cells + ~10 conditional write cells + a universal
read-side surface with 2 demonstrated/high-risk membership cells (both `positioned_in` relations) +
the membership-orientation-inconsistency amplifier. Beyond the 2 originally-known instances
(`task_depends_on_task` write, `task_positioned_in_phase` read), the material NEW members are
`item_derived_from_item` (unconstrained silent write), `phase_positioned_in_milestone` (sibling read),
`milestone_precedes_milestone` / `*_supersedes_*` (same-kind ordering write siblings), and the
`contains`/`includes`-vs-`positioned_in` orientation inconsistency.

---

## 4. Prior-art coverage map

Enumerated all 112 framework-gaps (`pi-context read-block-page --block framework-gaps`, full title
sweep). Every item touching edge direction/orientation/parent-child/name-vs-deriver/walk/silent-
write/silent-read/endpoint-resolution/membership/registry-coverage, with scope:

| id | status | what it covers | covers THIS class? |
|---|---|---|---|
| **FGAP-007** | accepted | ordering relation_type name reads opposite the deriver; backwards ordering edge files silently; write-time endpoint-role metadata + direction enforcement | **the WRITE-ordering instance only** — not read, not membership, not the general "silent on both sides" class |
| **FGAP-090** | closed | registry coverage gaps + write-time edge KIND/registration validator (TASK-062) | write-side KIND/registration; **explicitly defers direction to FGAP-007** ("pairs with FGAP-007 … endpoint-role metadata + write-time direction enforcement"). Its kind check is exactly what makes cross-kind swaps loud — but it is not orientation-aware. |
| **FGAP-093** | identified | write-time guard accepts dangling/unregistered-alias endpoint or a cycle — write↔validate parity for endpoint EXISTENCE + cycle | endpoint existence, not orientation; **explicitly "pairs with FGAP-007/TASK-027 (sibling write-time edge-direction guard)"** |
| **FGAP-061** | identified | ready/blocked deriver honors only `task_depends_on_task`, ignores `*_gated_by_item` | which relations the deriver CONSULTS, not orientation ambiguity; tangential |
| **FGAP-032** | closed | id-flag divergence across walk ops (`--itemId` vs `--parentId`) | touches the walk ops but is flag-NAMING, not orientation; **does not cover read-side silent-empty** |
| **FGAP-006** | closed | no scoped remove/replace edge op — a mis-directed edge is uncorrectable | remediation of a wrong edge, not detection of wrong orientation |
| **FGAP-091** | identified | no forcing function for warranted absent edges | edge ABSENCE, not orientation |
| **FGAP-017** | closed | currentState silent-empty on custom vocab | different silent-empty cause (hardcoded kinds) |
| **FGAP-094/102** | superseded/identified | catalog↔config relation_type registry drift | registry parity, not orientation |

**Verdict: the general class is UNCOVERED.** FGAP-007 owns exactly ONE cell (write-side, ordering,
same-kind). No item owns the READ-side silent-empty orientation ambiguity, the membership-orientation
inconsistency, the `item_derived_from_item` unconstrained silent write, or the class-level statement
that orientation is uncarried and silent on BOTH write and read. FGAP-090 and FGAP-093 both explicitly
point AT FGAP-007 as the direction gap and scope themselves away from orientation. No existing item is
secretly the class-level item.

---

## 5. Class-level framing (`gap-explore-surfaces-class`)

The two known instances are members of **ONE general class**, joined by a single missing capability
seen from two sides:

- **Unifying defect:** edge orientation is a per-relation convention that (i) the `source_verb_target`
  name does not reliably carry (unrecoverable for same-kind; verb-inverted for ordering-vs-deriver;
  verb-inconsistent for membership), (ii) is not exposed as queryable role metadata, and (iii) is
  checked by NO surface for a wrong guess — write accepts a backwards edge silently (same-kind /
  wildcard), read returns silent-empty on a wrong-direction walk (all relations), and validate never
  inspects orientation. Because every failure is silent, backwards edges (write) and false-empty
  results (read) accumulate undetected and surface only later, in derived state or not at all.

- **Membership (from the matrix):** §3.3 — write-side unconditional-consequential cells (7, incl. the
  new `item_derived_from_item`), conditional wildcard-target cells (~10), symmetric-relates cells (4),
  and a UNIVERSAL read-side surface (all 43 relation_types via the walk porcelain) with the two
  `positioned_in` membership cells demonstrated/high-risk, plus the `contains`/`includes`-vs-
  `positioned_in` orientation-inconsistency amplifier.

- **Shared root cause:** the closure-table stores a directed edge whose direction is meaningful, but
  the direction is pinned only incidentally (by the kind check, and only when kinds differ) and
  communicated only implicitly (name convention + hardcoded deriver knowledge). There is no first-
  class, machine-readable statement of "for relation R, endpoint role A is parent, role B is child,"
  and therefore nothing for write, read, or validate to enforce or normalize against.

- **Instance labels:** FGAP-007 / TASK-027 = the **write-ordering-same-kind** instance;
  `task_positioned_in_phase` walk-ancestors silent-empty = the **read-membership** instance;
  `item_derived_from_item` = the **wildcard-unconstrained write** instance;
  membership-orientation inconsistency = the **naming-inconsistency amplifier**.

- **What a single class-level resolution must ADDRESS** (characterization, NOT a proposed decision):
  1. **Orientation/role metadata on each relation_type** naming which endpoint plays which role
     (prerequisite/dependent, member/container, source/derivative), independent of the verb and of
     whether kinds coincide — extending, not colliding with, the existing `source_kinds`/`target_kinds`
     (this is the endpoint_roles shape the reverted `a08e586` attempted; the revert's recorded verdict
     — "worth running but a failure implementation wise" — carries no articulated failure reason, so
     whether the DESIGN or its unisolated EXECUTION failed is an open user determination).
  2. **Symmetric consumption of that metadata on BOTH sides:** write-time reject-or-normalize a
     wrong-orientation edge for ALL relations (not only cross-kind-incidental; explicitly covering
     same-kind and both-wildcard), AND a read surface addressable by ROLE ("from X, give its
     container / its members / its prerequisites") so a caller never guesses parent/child — or,
     minimally, a wrong-direction walk that ERRORS instead of returning silent-empty.
  3. **Reconciling the intra-category orientation inconsistency** (`contains`/`includes` container=
     parent vs `positioned_in` container=child) so a learned heuristic is not wrong for siblings.
  4. **Validate-time orientation check** so a backwards same-kind edge is not validate-clean — closing
     the write↔validate parity on the orientation axis, as FGAP-093 does for the existence axis.

**Recommended filing altitude:** ONE class-level FGAP — "edge orientation is an uncarried convention;
no write or read surface signals a wrong-orientation guess; the failure is always silent" — with
FGAP-007/TASK-027 RELATED as its write-ordering instance (not duplicated; FGAP-007 stays as filed),
the `task_positioned_in_phase` read-membership case as its triggering read instance, and
`item_derived_from_item` + `phase_positioned_in_milestone` + the membership-orientation inconsistency
named as additional members. Relate (not merge) FGAP-090 (closed, kind/registration write parity),
FGAP-093 (identified, existence/cycle write parity), and FGAP-061 (deriver relation-set coverage) as
adjacent partial coverage on the same write/validate/derive machinery. The filing itself is a later
provenance-gated step for the orchestrator + user; nothing is filed here.
