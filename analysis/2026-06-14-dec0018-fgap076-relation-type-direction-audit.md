# DEC-0018 → FGAP-076 relation_type direction audit

**Date:** 2026-06-14
**Resolved substrate:** `.context` (from `.pi-context.json` `contextDir`; active-substrate pointer confirmed before any read).
**Question:** Is the `decision_addresses_gap` type on the `DEC-0018 → FGAP-076` edge mis-chosen, or does the registry lack a type expressing the true relation?

---

## Verdict

**REGISTRY GAP.** No registered relation_type expresses "a decision RAISES / SPAWNS a consequent gap" or "a decision's enactment is BLOCKED-BY / DEPENDS-ON a gap." The decision↔gap vocabulary holds only the *resolve* direction (`decision_addresses_gap` + its inverse `gap_addressed_by_decision`) plus one name-only escalation type (`decision_escalates_underdetermined`, zero edges, no semantics text). The relation DEC-0018 actually carries — *DEC-0018 raises FGAP-076 as a consequence, and DEC-0018's full enactment depends on FGAP-076's resolution* — is **unexpressible** with a registered type today.

**Deciding fact:** the registry's only decision→framework-gaps "carry value forward to a gap" types are `decision_addresses_gap` (`category: data_flow`) and `decision_escalates_underdetermined` (`category: data_flow`); neither denotes "raises a consequent gap" and neither is an `ordering`-category gate. There is no `decision_raises_gap`, `decision_spawns_gap`, `decision_gated_by_item`, `decision_blocked_by_gap`, or any `gap_blocks_decision` inverse in `config.relation_types[]` (full dump enumerated below). The existing **decision-side gate type does not exist at all** — `*_gated_by_item` / `*_depends_on_*` ordering types are defined only for `features`, `tasks`, `story` source kinds, never `decisions`.

`decision_addresses_gap` is therefore not merely "mis-chosen from an available better type"; it is the *only* registered decision→gap forward type whose endpoints fit, so it was selected as the nearest-available, and it encodes the **inverted** semantics relative to DEC-0018's true relation.

---

## 1. Registered semantics of `decision_addresses_gap`

From `pi-context read-config --registry relation_types --json`:

```json
{"canonical_id":"decision_addresses_gap","display_name":"addresses gap","category":"data_flow","source_kinds":["decisions"],"target_kinds":["framework-gaps"]}
```

- **Parent-kind → child-kind:** `decisions` → `framework-gaps` (source = parent, target = child).
- **Declared semantics text:** NONE. Registry entries carry no `description` field — semantics are encoded entirely by `canonical_id` (`decision_addresses_gap`), `display_name` ("addresses gap"), `category` (`data_flow`), and the endpoint kinds. `pi-context read-schema --schemaName relation_types` returns `schema: null` (relation_types is a config registry, not a block schema), so there is no schema-level direction/inverse metadata either.
- **Inverse/direction metadata:** none on the entry. A separately-registered inverse exists as its own type: `gap_addressed_by_decision` (`framework-gaps` → `decisions`, `data_flow`).
- **Canonical meaning of "addresses":** settled empirically by established usage (§3) as **the decision RESOLVES / answers the gap** — the gap's `proposed_resolution` is the decision. The name `decision_addresses_gap` reads in the source-verb-target convention (per FGAP-007) as "decision (parent/source) addresses gap (child/target)," i.e. parent acts upon and discharges the child. This is the *resolve* direction, opposite to DEC-0018's actual relation.

## 2. Full decision↔gap and item↔gap relation_type vocabulary

Enumerated from the single `read-config --registry relation_types` dump. Every type whose endpoints touch a gap (`framework-gaps`), filtered to decision/item ↔ gap (no descriptions exist; "Denotes" is derived from name + display_name + category + the established-usage check in §3):

| canonical_id | parent → child | category | Denotes | Raises/spawns? | Blocked-by/gate? |
|---|---|---|---|---|---|
| `decision_addresses_gap` | decisions → framework-gaps | data_flow | decision **resolves** the gap | no | no |
| `gap_addressed_by_decision` | framework-gaps → decisions | data_flow | gap **resolved by** the decision (inverse of above) | no | no |
| `decision_escalates_underdetermined` | decisions → framework-gaps | data_flow | decision **escalates an underdetermined choice** to a gap | partial — closest existing analog, but name-only, zero edges, and means "escalate a deferred choice," not "raise a consequent legibility requirement"; no gate/dependency semantics | no |
| `task_addresses_gap` | tasks → framework-gaps | data_flow | task **resolves** the gap | no | no |
| `gap_addressed_by_feature` | framework-gaps → features | data_flow | gap **resolved by** a feature | no | no |
| `gap_relates_to_issue` | framework-gaps → issues | data_flow | gap relates to an issue (associative) | no | no |
| `item_acknowledges_missing_convention` | decisions/features/tasks → framework-gaps | data_flow | item flags a *missing convention* as a gap | partial — "acknowledges a missing convention," a specific raise-shaped link, but scoped to convention-gaps, not a general consequent-gap raise, and `data_flow` not a gate | no |
| `research_informs_item` | research → * (incl. gaps) | data_flow | research informs the item | no | no |
| `item_governed_by_convention` | decisions/features/tasks → conventions | data_flow | governance, not gap | n/a | n/a |

**Item↔gap GATE / dependency types — the readiness-relevant `ordering` category:**

| canonical_id | parent → child | category | source kinds include `decisions`? |
|---|---|---|---|
| `task_gated_by_item` | tasks → * | ordering | no |
| `feature_gated_by_item` | features → * | ordering | no |
| `story_gated_by_item` | story → * | ordering | no |
| `feature_depends_on_item` | features → * | ordering | no |
| `task_depends_on_task` | tasks → tasks | ordering | no |
| `story_depends_on_story` | story → story | ordering | no |
| `requirement_depends_on_requirement` | requirements → requirements | ordering | no |

**Key finding:** every `ordering` (gate/dependency) type targeting `*` is defined ONLY for `features`/`tasks`/`story`/`requirements` as source — **`decisions` is not a source kind of any `*_gated_by_item` or `*_depends_on_*` ordering type.** A decision cannot today be typed as "gated by / depends on" anything, gap or otherwise. So neither half of DEC-0018's true relation (the *raise* nor the *enactment-dependency*) has a registered type.

## 3. Established usage of `decision_addresses_gap` — DEC-0018's use is anomalous

Existing decision↔gap edges (via `find-references` per item + the `read-block --block relations` enumeration):

- `DEC-0001 → FGAP-001` (`decision_addresses_gap`): DEC-0001 status **enacted**; FGAP-001 status **closed**. DEC-0001's `decision` body IS FGAP-001's `proposed_resolution` verbatim (skeleton-config bootstrap). The decision **resolves** the gap. ✔ name-consistent.
- `DEC-0002 → FGAP-002` (`decision_addresses_gap`): FGAP-002's `proposed_resolution` ends "**See DEC-0002.**" — DEC-0002 is the gap's answer. The decision **resolves** the gap. ✔ name-consistent.
- `FGAP-003 → DEC-0003` (`gap_addressed_by_decision`): the inverse type, same resolve semantics in gap-first direction. ✔ name-consistent.
- `DEC-0018 → FGAP-076` (`decision_addresses_gap`): **ANOMALOUS.** DEC-0018 does NOT resolve FGAP-076. DEC-0018's `decision` body: *"it carries the consequence that the partial application MUST be made legible … tracked as a separate framework-gap."* FGAP-076 IS that consequent gap (title: "update result does not make partial application legible"). FGAP-076's `proposed_resolution`: *"Premised on DEC-0018 (per-component affirmed)"*; FGAP-076 status is **identified** (unbuilt). DEC-0018 **raises** FGAP-076 and its own legibility consequence **depends on** FGAP-076's resolution.

**Conclusion:** `decision_addresses_gap` is used consistently elsewhere to mean "this decision resolves this gap," matching its name. DEC-0018's edge uses it for the inverse relation (decision raises gap / is gated by it). The type was not used loosely — the established convention is the resolve direction, and DEC-0018's filing diverges from it because the registry offers no raise/gate alternative.

## 4. Correct typing for DEC-0018 → FGAP-076

The edge should carry TWO relations, neither expressible today:

1. **The raise:** `decision_raises_gap` (or `decision_spawns_gap`), parent → child = `DEC-0018 → FGAP-076`, `category: data_flow`. Denotes "DEC-0018's enactment produces FGAP-076 as a consequent requirement." (`decision_escalates_underdetermined` is the nearest existing shape but means escalating a *deferred/underdetermined choice*, not raising a *consequent legibility requirement*, and carries no edges or semantics text — adopting it would overload it.)
2. **The enactment dependency (gate):** a `category: ordering` gate with `decisions` added as a source kind — e.g. `decision_gated_by_item` (parent → child = `DEC-0018 → FGAP-076`, meaning DEC-0018 is gated/blocked until FGAP-076 closes), parallel to the existing `task_gated_by_item` / `feature_gated_by_item` / `story_gated_by_item` family. This is the edge a gate-aware deriver must consume to compute "DEC-0018 open BECAUSE blocked-on FGAP-076."

`decision_addresses_gap` should be REMOVED from this edge — it asserts the false claim that DEC-0018 closes FGAP-076.

**Registry can express it today:** NO. Requires (a) a new `data_flow` `decision_raises_gap`/`decision_spawns_gap` type, and (b) extending the `*_gated_by_item` ordering family to admit `decisions` as a source kind (or a dedicated `decision_gated_by_item`).

## 5. Gate-aware-derivation consumption (FGAP-061)

FGAP-061 (status **identified**, `canonical_vocabulary`: "gate-aware readiness derivation"): the sole ready/blocked deriver `currentState` (context-sdk.ts:682) folds in only `task_depends_on_task` and ignores the `*_gated_by_item` gating relations; its `proposed_resolution` is to fold `task_gated_by_item` parents into `depParentsOf`, and FORWARD (FEAT-004) make the blocked-by relation_type a **config-declared SET** including the gating relations across all kinds.

For a gate-aware deriver to compute "DEC-0018 open BECAUSE blocked-on FGAP-076":

- It must consume an **`ordering`-category gate edge** whose parent is the blocked item (DEC-0018) and child is the blocker (FGAP-076), resolving the child to a complete/closed bucket — exactly the `*_gated_by_item` shape FGAP-061 names.
- **`decision_addresses_gap` is NOT and must NOT be such a type.** It is `data_flow`, not `ordering`; FGAP-061's deriver does not (and should not) treat it as a gate. If a future deriver *did* fold `decision_addresses_gap` in, it would read the edge **backwards** — treating FGAP-076 as a prerequisite DEC-0018 satisfies (resolves), the inverse of the truth (FGAP-076 blocks DEC-0018). The `data_flow`/`ordering` category split is the firewall preventing that, but only because the edge is currently mistyped into `data_flow` where it is inert to the deriver; the cost is that the real gate is **invisible** to derivation.
- **The gate edge needs a dedicated `ordering` type with `decisions` as a source kind** (none exists — see §2). Until both the type exists and FGAP-061/FEAT-004 land, "DEC-0018 blocked-on FGAP-076" is underivable: there is no edge of a type the deriver consumes, and decisions aren't bucketed by `currentState` at all (it buckets only the tasks block).

This is the "verify before FGAP-061 can correctly gate" answer: FGAP-061's fix is necessary but **not sufficient** for this case — it presumes the gate edge exists in a consumable `ordering` type. Here the type itself is missing (decision-source gate) AND the edge is mistyped as `data_flow` resolve. Both must be fixed for the deriver to see the gate.

## 6. Prior-art result

- **FGAP-007** (status **accepted**; TASK-027 **planned**) — "Ordering relation_type names read opposite to the parent/child convention (task_depends_on_task footgun) — backwards edges file silently." Tracks name-vs-stored-direction inversion for **`ordering`** edges and write-time direction enforcement (endpoint-role metadata in `append-relation`). **Related but distinct:** FGAP-007 is scoped to ordering edges whose *verb* inverts against the deriver's parent=prerequisite contract; the DEC-0018 case is a **`data_flow` edge typed in the wrong semantic direction (raise filed as resolve)** AND a **missing decision-source gate type** — neither is an ordering-edge-name footgun. The DEC-0018 finding INFORMS FGAP-007's class (both are "edge direction diverges from true semantics, accepted silently at write") but is not covered by it.
- **FGAP-061** (status **identified**) — gate-aware derivation. The CONSUMER of any fix here; informed in §5, not duplicated.
- **No existing item** tracks "decision_addresses_gap misuse," "data_flow raise-vs-resolve direction," or "missing decision-source gate / raise relation_type." This finding is **not already tracked**; a new filing is justified (subject to the §7 class scoping). Relate it to FGAP-007 (`research_informs_item` or an edge) rather than refiling FGAP-007's enforcement scope.

## 7. Class characterization + root cause

**This is a CLASS, not atomic.** Two intersecting classes:

**Class A — semantic-direction inversion of `data_flow` edges, accepted silently at write.** `append-relation` performs no semantic-direction check on `data_flow` edges (it doesn't on `ordering` ones either — that's FGAP-007). A single forward type (`decision_addresses_gap`) is **overloaded to express both "resolves" and, by absence of an alternative, "raises"** — opposite data-flow directions filed under one type. Any decision that *spawns a consequent gap* (rather than resolving a pre-existing one) is forced onto the resolve-direction type. DEC-0018→FGAP-076 is the triggering instance; the class is "no vocabulary distinguishes resolve-a-gap from raise-a-gap, so raise-edges are mistyped as resolve-edges and read backwards by any consumer." Sibling risk: `item_acknowledges_missing_convention` already carved out ONE raise-shaped link (convention-gaps) — evidence the raise direction recurs and was point-patched narrowly rather than generalized.

**Class B — `decisions` is absent from every `ordering` (gate/dependency) relation_type.** Features, tasks, stories, requirements all have `*_gated_by_item` / `*_depends_on_*`; decisions have none. So a decision whose enactment depends on other work (a common shape — DEC-0018 affirmed-on-enactment, gated on FGAP-076) **cannot be typed as gated at all**, and is invisible to readiness derivation (which compounds FGAP-061: even a fixed deriver has no decision-gate edges to read). The triggering instance is DEC-0018; the class is "decision enactment-ordering is unexpressible."

**Root cause (both classes):** the relation_type registry was grown *resolve-first and kind-by-kind* — each kind got the data_flow "addresses/resolves" type it immediately needed and the ordering types were added only for the kinds the deriver buckets (tasks, then features/stories). The **inverse data-flow direction (raise/spawn)** and **decision-side ordering** were never added because no edge had yet needed them at filing time; DEC-0018 is the first decision to *raise + depend on* a gap, exposing both omissions at once. The registry encodes direction purely in the type name with no inverse/role metadata and no write-time direction check, so the missing-type condition silently degrades to "pick the nearest forward type," producing a backwards edge.

**File at the class level:** a registry-gap FGAP covering (A) a `decision_raises_gap`/`decision_spawns_gap` data_flow type + (B) decision-source gate/dependency ordering type(s), with DEC-0018→FGAP-076 as the triggering instance, related to FGAP-007 (write-time direction enforcement) and FGAP-061 (gate consumption). Not the narrow "retype this one edge."

---

## CLI friction (experience-gap candidates)

- **`filter-block-items` flag shape:** the canonical filing-pattern docs (CLAUDE.md) and prior muscle memory suggest `--arrayKey`/`--predicate`; the op actually takes `--field`/`--op`/`--value`. First three invocations failed with `unknown flag: --arrayKey` (exit 2). Repro: `pi-context filter-block-items --block relations --arrayKey relations --predicate '{...}'`. Low severity (help text is clear), but a CLAUDE.md/SKILL drift candidate if the filing-pattern prose implies the predicate/arrayKey form for this op.
- **`filter-block-items` cannot query the relations closure table by `relation_type`:** `--block relations --field relation_type --op eq --value '"decision_addresses_gap"'` returns `total: 0` even though such edges exist, because `filter-block-items` "discovers the single top-level array property" and the relations file's edge records don't expose `relation_type` as a flat filterable field in the discovered array the same way. Edge enumeration by type required `read-block --block relations` (returns nested `{parent,child,relation_type}` objects) or per-item `find-references`. Repro above. Medium-relevance gap: there is **no first-class op to enumerate relations by `relation_type`** — `find-references` is id-scoped, `filter-block-items` doesn't reach the edge field. A `filter-relations --relation_type <t>` (or `find-references --relation_type`) op would close it. Worth filing if not already tracked.
- **`read-block-page --block relations --offset 50` returned `total: 0 / hasMore: false`** while `read-block --block relations` reported `total: 435 / hasMore: true` — the two read ops disagree on the relations block's pagination/total. Possible off-by-surface inconsistency (read-block paginates internally and truncates the rendered slice; read-block-page reported empty past offset 0). Repro: compare `read-block --block relations` vs `read-block-page --block relations --offset 50 --limit 200`. Medium: inconsistent total/pagination across two read ops on the same block is a legibility gap; candidate for agent-investigated FGAP if not tracked.
