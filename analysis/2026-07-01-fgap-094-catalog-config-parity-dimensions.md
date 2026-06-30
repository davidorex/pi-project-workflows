# FGAP-094 dimensions audit — is the catalog↔config parity gap relation_types-only?

Date: 2026-07-01
Investigation only. No source edited, no substrate mutated, no filing.

## Question

FGAP-094's `proposed_resolution` scopes both legs — the NOW back-port and the FORWARD build-time parity forcing-function — ENTIRELY to `relation_types`. Does that scope underestimate the true required dimensions of the catalog↔config parity surface? Measure across every config registry; do not assume the answer either way.

## Method (commands actually run)

Live config registries read through the CLI (one bare op per call):
- `pi-context read-config --registry relation_types --json`
- `pi-context read-config --registry invariants --json`
- `pi-context read-config --registry lenses --json`
- `pi-context read-config --registry block_kinds --json`
- `pi-context read-config --registry state_derivation --json`
- `pi-context read-config --registry status_buckets --json` → `{}` (empty)
- `pi-context read-config --registry layers --json` → `[]` (empty)
- `pi-context read-config --registry tool_operations --json` → `[]` (empty)
- `pi-context read-config --registry installed_schemas --json` / `installed_blocks --json` → 17 each

Catalog (packaged template, ordinary repo source — read directly):
- `Read packages/pi-context/samples/conception.json` (block_kinds 3-140, relation_types 141-401, lenses 402-452, layers/status_buckets 453-454, state_derivation 455-515, installed_schemas/blocks 516-553, invariants 554-695, tool_operations 696-697)

Config-schema property surface (the full registry set that CAN drift):
- `Read packages/pi-context/schemas/config.schema.json` (version 1.7.0)

Propagation scope + identity fields:
- `Read packages/pi-context/src/context.ts` 1056-1154 (`REGISTRY_DESCRIPTORS`, `mergeCatalogRegistries`)

Consumption + absence confirmations:
- `grep -n` for each live-only id across `samples/conception.json`
- `grep -rn "state_derivation|blocked_by|next_ranked|invariants|lenses|relation_types"` across `src/context-sdk.ts`
- `git log -S "task_addresses_issue" -- samples/conception.json` and `git log --oneline -- samples/conception.json`

Every count and id below is from these reads, not recollection.

## Per-registry drift table (empirical)

Live `.context/config.json` registries vs packaged `samples/conception.json`. "Live-only" = present in live config, absent from catalog. Zero catalog-only entries were found in any registry (catalog ⊆ live everywhere — pure subset drift, consistent with FGAP-094's framing).

| Registry | Live count | Catalog count | Live-only ids (the drift) | Propagated on `update`? | Consumed by shipped code? |
|---|---|---|---|---|---|
| relation_types | 42 | 38 | `task_gated_by_item`, `session_touches_item`, `decision_derived_from_item`, `decision_escalates_underdetermined`, `task_advances_story`, `feature_advances_story` (6) | YES | YES — write-gate `validateEdgeAgainstRegistry` (context-sdk.ts:1576-1578); `state_derivation.blocked_by` consumes `task_gated_by_item` (currentState, 784-860) |
| invariants | 12 | 11 | `decision-shows-derivation` (1) | YES | YES — `validateProject` (context-sdk.ts:2298-2336). This invariant's `relation_types` are the two live-only `decision_derived_from_item` / `decision_escalates_underdetermined` |
| lenses | 8 | 4 | `gaps-by-priority`, `features-by-status`, `story-advancers`, `story-advancers-features` (4) | YES | YES — lens-view / bin disambiguation (context-sdk.ts:1461) |
| block_kinds | 18 | 17 | `session-notes` (1) | YES | YES — block resolution; `session_touches_item` (live-only relation) targets it |
| state_derivation | present | present | (singleton, see below) | YES (whole-or-nothing) | YES — currentState (context-sdk.ts:784-860) |
| status_buckets | `{}` | `{}` | none | NO | bucket normalization (empty both sides) |
| layers | `[]` | `[]` | none | NO | layer graph (empty both sides) |
| naming | absent | absent | none | NO | alias map |
| display_strings | absent | absent | none | NO | label map |
| hierarchy | absent | absent | none | NO | edge-legality |
| tool_operations | `[]` | `[]` | none | NO | composite-tool loader |
| tool_operations_forbidden | absent | `[]` | none | NO | grant guard |
| installed_schemas | 17 | 17 | none | NO | install set |
| installed_blocks | 17 | 17 | none | NO | install/materialize set |

Note: FGAP-094's snapshot recorded catalog relation_types = 34. It is now 38 because commit `4376399` (TASK-068) back-ported `task_addresses_issue` + `issue_relates_to_issue` (and the issues lenses/invariant/state_derivation entry). The 6 live-only relation_types FGAP-094 names are unchanged and confirmed.

## Four registries drift, not one

The drift is NOT confined to `relation_types`. FOUR keyed registries currently drift live-only, every one consumed by shipped code:

1. `relation_types` — 6 live-only (FGAP-094's scope)
2. `invariants` — 1 live-only (`decision-shows-derivation`)
3. `lenses` — 4 live-only
4. `block_kinds` — 1 live-only (`session-notes`)

A parity forcing-function scoped to `relation_types` alone passes while `decision-shows-derivation`, the four live-only lenses, and `session-notes` remain catalog-absent — i.e. it would green a catalog that still drifts on three other consumed registries.

## Propagation-vs-parity-scope map

`mergeCatalogRegistries` (context.ts:1121-1154) propagates on `update` exactly:
- The four keyed-array registries: `relation_types`, `invariants`, `block_kinds`, `lenses` (additive-only, by `REGISTRY_DESCRIPTORS[reg].idField`).
- `state_derivation`: inherited whole-object ONLY when the substrate lacks one; an existing one is never reconciled.

NOT propagated by any op: `status_buckets`, `naming`, `display_strings`, `layers`, `hierarchy`, `tool_operations`, `tool_operations_forbidden`, `installed_schemas`, `installed_blocks` (the last two are install-ceremony scope; FGAP-065 covers block-data materialization).

The parity ⊇ target ("catalog ⊇ consumed vocabulary") must therefore hold across the FOUR propagated keyed registries AND `state_derivation` — five surfaces, not one. A consumed entry that is neither in the catalog nor propagated is missing on every fresh `accept-all`/`install` substrate and never repaired by `update`; the four keyed registries at least propagate live→? no — propagation is catalog→substrate, so a live-only entry absent from the catalog is exactly what never reaches a fresh substrate. That is the FGAP-094 brick, and it is reproducible for all four keyed registries plus the state_derivation interaction below.

## state_derivation interaction — the decisive multi-registry finding

The catalog ALREADY ships an internally-inconsistent `state_derivation`. Confirmed empirically: `grep -n "task_gated_by_item" samples/conception.json` returns exactly ONE line — 503 — inside `state_derivation.blocked_by.relation_types`. `task_gated_by_item` is ABSENT from the catalog's own `relation_types[]` (lines 141-401).

Consequence on a fresh `accept-all` substrate (which inherits the catalog's whole `state_derivation` plus its `relation_types`):
- currentState's blocker derivation (context-sdk.ts:794, `blockedByRels = new Set(sd.blocked_by.relation_types)`) carries `task_gated_by_item` — but no such relation_type is registered, so any `task_gated_by_item` edge is rejected at write by `validateEdgeAgainstRegistry` (context-sdk.ts:1576-1578) and `assertEdgeValidForWrite`.
- So the brick FGAP-094 describes is reachable through the catalog ITSELF, not only through live-config hand-edits: the shipped catalog's state_derivation consumes a relation_type the shipped catalog's relation_types does not declare.

No validator closes this. The only relation_type registration check (context-sdk.ts:1576-1578) runs at EDGE-WRITE against live config; nothing validates that `state_derivation.blocked_by` / `next_ranked.kind` reference registered relation_types/block_kinds, and nothing validates the catalog at all. This is a second axis the relation_types-only framing misses: parity must include the consistency of `state_derivation`'s references against `relation_types`/`block_kinds` — a cross-registry referential check, not a flat per-registry ⊇.

## FGAP-098 corroboration

FGAP-098's `proposed_resolution` prescribes, as one filed change, a catalog back-port spanning: relation_types (`task_addresses_issue` + `issue_relates_to_issue`), an invariant (`task-completed-issue-resolved`), lenses (`issues-by-status` + `issues-by-priority`), and a `state_derivation.next_ranked` issues entry. Its own text states: "The catalog back-port leg interacts with FGAP-094: a new live relation_type absent from the packaged catalog makes a fresh accept-all substrate reject its edge at write."

This is independent, already-filed evidence the parity surface is multi-registry: a single coherent feature's back-port leg spanned relation_types + invariants + lenses + state_derivation. Commit `4376399` (TASK-068) has since landed that back-port into the catalog — confirming in git that the real back-port unit was four registries wide, not one. A parity check scoped to relation_types would have greened TASK-068's catalog state while the invariant/lens/state_derivation legs were still pending.

## Prior-art / class coverage

| Item | Status | Overlap / bound on the class |
|---|---|---|
| FGAP-094 | identified | THE item. Scopes both legs to relation_types only — the narrow instance. |
| FGAP-098 | identified | Multi-registry back-port (relation_types+invariant+lenses+state_derivation); names the FGAP-094 interaction explicitly. Corroborates multi-registry parity but is itself scoped to the issues-sibling change, not to a general parity forcing-function. |
| FGAP-067 | identified | Catalog↔config DIVERGENT-BODY reconciliation (3-way merge for a present-but-changed entry). Orthogonal axis: FGAP-094 is about ABSENT entries (additive ⊇); FGAP-067 is about changed bodies of present entries. Both live in `mergeCatalogRegistries`. Together they bound "catalog currency" but neither covers the multi-registry ⊇ forcing-function. |
| FGAP-065 | identified | New catalog block_kind has no data-file materialization path into an installed substrate. Sibling: block_kinds drift (`session-notes`) is partly FGAP-065 territory for the data-file leg, but the config-registry ⊇ leg (block_kinds entry present in catalog) is FGAP-094's class. |
| FGAP-095 | identified | Config-schema evolution has no load-time migration. Different layer (schema shape, not vocabulary content). Build-time-gate family sibling. |
| FGAP-096 | identified | No config recovery path once config invalid. Recovery-side sibling; not parity. |
| FGAP-097 | identified | No additive/expand-contract discipline + build-time breaking-diff gate for config-SCHEMA. Closest structural sibling on the FORWARD leg: it proposes a build-time gate on `config.schema.json` shape; FGAP-094's FORWARD leg proposes a build-time gate on catalog↔config VOCABULARY content. Same gate FAMILY, different target (schema shape vs registry membership). FGAP-097 explicitly says it is "Distinct from FGAP-094, which is vocabulary/catalog-superset-config drift." Neither is generalized to "one build-time catalog/config parity gate covering both shape and all-registry vocabulary." |
| FGAP-010 | closed | The PRECEDENT the FGAP-094 FORWARD leg cites: `scripts/parity-check.ts`, a source-intrinsic build gate that AST-enumerates the library/op/script trio and fails on drift. Structural template for the FORWARD forcing-function — but for the CODE-surface trio, not the catalog↔config vocabulary surface. |

Class verdict: FGAP-094 as written is a NARROW (relation_types-only) instance of a more general gap — "the packaged catalog must be a superset of every config registry the shipped library/derivations consume, AND state_derivation's references must resolve against the registered relation_types/block_kinds, with a build-time forcing-function." That general gap is NOT fully tracked elsewhere: FGAP-098 instantiates it for one change, FGAP-067 covers the divergent-body axis, FGAP-097 covers the config-SCHEMA-shape gate, FGAP-010 is the code-surface precedent — but no item tracks the multi-registry vocabulary ⊇ forcing-function as its own class. (No filing performed; coverage reported per instruction.)

## Verdict

**Underestimates: YES.** FGAP-094's relation_types-only scope underestimates the required dimensions on both legs.

True dimensions, each backed by an empirical read above:

1. **Back-port (NOW) spans four keyed registries, not one.** Four registries currently drift live-only, every one consumed by shipped code: relation_types (6), invariants (1: `decision-shows-derivation`), lenses (4: gaps-by-priority, features-by-status, story-advancers, story-advancers-features), block_kinds (1: `session-notes`). Each requires the same catalog-worthy-vs-substrate-local triage FGAP-094 applies to relation_types alone.

2. **The parity forcing-function (FORWARD) must assert ⊇ across all four propagated keyed registries plus state_derivation** — i.e. the same five surfaces `mergeCatalogRegistries` propagates — not relation_types only. A relation_types-scoped check greens a catalog that still drifts on invariants/lenses/block_kinds.

3. **The forcing-function must also include a cross-registry referential check on `state_derivation`.** The catalog's shipped `state_derivation.blocked_by` references `task_gated_by_item`, which the catalog's own `relation_types[]` does not declare (grep: sole occurrence at conception.json:503). No validator catches this. "catalog ⊇ consumed vocabulary" is necessary but not sufficient — the catalog's state_derivation references must resolve against the catalog's own relation_types/block_kinds, or a fresh accept-all substrate ships a blocker derivation pointing at an unregistered (unwritable) relation.

4. **The non-propagated registries are correctly OUT of the back-port/⊇ scope today** (status_buckets/layers/naming/display_strings/hierarchy/tool_operations are empty or absent on both sides — zero drift). They are named here only to bound the surface: if any gains consumed entries later, the same ⊇ obligation extends to it. This is a boundary statement, not invented scope.

The relation_types-only framing is the narrow triggering instance (and the highest-stakes one, because `task_gated_by_item` is hard-rejected at write). The class is "multi-registry catalog↔config vocabulary parity (four propagated keyed registries + state_derivation referential consistency), enforced by a build-time forcing-function mirroring FGAP-010's scripts/parity-check.ts." The class is genuinely broader than FGAP-094 as written and is not fully tracked by any existing item.
