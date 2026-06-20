# Audit — TASK-003 proposed resolution (substrate clone/import arc)

Date: 2026-06-20
Scope: read-only audit of TASK-003's description + acceptance_criteria (its proposed resolution) against the upstream design (DEC-0002 / FGAP-002 / FEAT-001) and the actual code the resolution touches. No substrate mutation; task not implemented.

## Verdict: HAS-PROBLEMS

The clone-as-fork core (copy content, mint a fresh `substrate_id`, provenance-bearing registry entry, refine the SoT-drift invariant) is sound and matches the code. But the resolution encodes one **wrong/non-representable** assumption that would mislead implementation, plus stale file:line citations and a redundancy that follows from the same wrong assumption.

---

## Problem 1 (CRITICAL — wrong + non-representable): `substrate_derived_from_substrate` as a closure-table relation_type/edge

### The encoded assumption
TASK-003 description: "record a `substrate_derived_from_substrate` edge … register the `substrate_derived_from_substrate` relation_type in config". FEAT-001 acceptance criterion: "a `substrate_derived_from_substrate` edge records destination-derived-from-source lineage". DEC-0002 frames it as "the substrate-level parallel to promoteItem's … `item_derived_from_item`" and "New relation_type `substrate_derived_from_substrate` registered in config".

The assumption is that substrate lineage is recorded the way item lineage is: a `relation_type` registered in `config.relation_types[]` and an edge in a `relations.json` closure table.

### Why it is wrong (code citations)
The closure-table edge model cannot represent an edge whose endpoints are *substrates*:

- `EdgeEndpoint` has exactly two kinds — `item` and `lens_bin` — and nothing else (`packages/pi-context/src/context.ts:344-346`):
  `{ kind: "item"; substrate_id?; oid; refname?; content_hash? } | { kind: "lens_bin"; bin }`.
- The relations schema accepts only those two endpoint forms — `required: ["kind","oid"]` with `kind:{const:"item"}`, or `required:["kind","bin"]` with `kind:{const:"lens_bin"}` (`packages/pi-context/schemas/relations.schema.json:18-37`). A substrate→substrate edge (endpoints are `substrate_id`s, no `oid`, no `bin`) fails AJV at the write boundary.
- `relations.json` is **substrate-relative**, not project-root. There is no project-root relations file. An edge between two substrate-ids has no home file: it does not belong inside either substrate's relations.json (the source substrate is a different project; the destination's relations.json keys on its own items). `promoteItem` files `item_derived_from_item` into the **destination** relations.json precisely because both endpoints are *items addressable from the destination* (`packages/pi-context/src/promote-item.ts:226-238`) — that condition does NOT hold for a substrate→substrate edge.
- `normalizeEndpoint` / `endpointKey` (`context.ts:380-392`) — every relations consumer — only ever produces `item` (keyed on refname/oid) or `lens_bin` keys. A substrate-level edge would be invisible to validation, traversal, and `find-references`.

The "parallel to `item_derived_from_item`" framing is a false analogy: item lineage is item↔item *within one substrate*; substrate lineage is substrate↔substrate *across the project root*. The registry — not the closure table — is the project-root, substrate-keyed layer (`packages/pi-context/src/context-registry.ts:5-17, 70-82`: registry maps `substrate_id → {dir, aliases}` and lives at project root).

### Why it is also redundant
DEC-0002 ALREADY routes the lineage through the registry: "The project-root registry entry gains origin/provenance (minted-here vs **derived-from `<source id>`**, plus imported_at), turning it from a flat dir-map into an identity ledger." A registry provenance field `derived_from: <source substrate_id>` IS the substrate-derived-from-source record, in the one project-root file that is keyed by substrate_id and that the SoT-drift invariant already reads (`context-sdk.ts:2132-2163`). The separate `substrate_derived_from_substrate` relation_type is a second, non-functional encoding of the same fact — it would register a relation_type that no edge can ever legally use.

### Proposed corrected resolution text
Drop the relation_type + edge entirely; record lineage as a registry provenance field.

TASK-003 description — replace the clause:
> "+ Pi tool + CLI + orchestrator script as one dual-surface unit; register the substrate_derived_from_substrate relation_type in config; extend the registry schema/type with origin/provenance fields;"

with:
> "+ Pi tool + CLI + orchestrator script as one dual-surface unit. Record destination→source lineage as registry provenance on the destination's registry entry (NOT as a closure-table edge — `EdgeEndpoint` has only `item`/`lens_bin` kinds (`context.ts:344-346`) and relations.json is substrate-relative, so a substrate→substrate edge is non-representable and homeless): extend `RegistryEntry` (`context-registry.ts:70-73`) + `context-registry.schema.json` with an optional `origin` object — `{ kind: 'minted-here' | 'derived-from', source_substrate_id?: string, imported_at?: string }` — and thread it through `registerSubstrate` (`context-registry.ts:194-205`) so cloneSubstrate writes `kind:'derived-from', source_substrate_id, imported_at` while the existing native call sites (`context.ts:923,960,1023`) record `kind:'minted-here'`."

FEAT-001 acceptance_criteria — replace:
> "a substrate_derived_from_substrate edge records destination-derived-from-source lineage"

with:
> "the destination registry entry's `origin` records `kind:'derived-from'` + `source_substrate_id` = the source's substrate_id (lineage lives in the project-root registry, the substrate-keyed layer — not as a closure-table edge, which cannot represent substrate→substrate endpoints)"

and merge it with the now-overlapping criterion "the destination registry entry carries origin/provenance (derived-from source id + imported_at)" — these two become one.

DEC-0002 itself carries the false-parallel framing ("substrate-level parallel to … item_derived_from_item", consequence "New relation_type substrate_derived_from_substrate registered in config"). Implementing TASK-003 correctly requires the decision body to be corrected too (a separate substrate-write, surfaced to the user) — the relation_type consequence should be struck and folded into the registry-provenance consequence. Flag for user: the decision is enacted; correcting it is a record-correction, not a re-decision.

---

## Problem 2 (stale citations — would misdirect the implementer): wrong file:lines for the SoT-drift invariant and registerSubstrate call sites

### The encoded assumption
TASK-003 / DEC-0002 / FGAP-002 cite "the SoT-drift invariant (context-sdk.ts:1685+)" and FGAP-002 evidence cites registerSubstrate call sites at "context.ts:759,822".

### Why it is wrong (code citations)
The code has moved since filing (2026-06-03):
- The SoT-drift invariant is now at `packages/pi-context/src/context-sdk.ts:2123-2163` (emits `substrate_id_unregistered` at line 2143 and `substrate_id_registry_mismatch` at 2158). Line 1685 is now unrelated relation-porcelain (`removeRelationByRef`).
- The `registerSubstrate` call sites are now `packages/pi-context/src/context.ts:923` (`writeSkeletonConfig`), `:960` (`reconcileActiveSubstrateRegistration`), `:1023` (`adoptConception`) — not 759/822. There are THREE native call sites, not the two FGAP-002 implies; the resolution must update all three to stamp `origin: minted-here`.

### Proposed corrected resolution text
In TASK-003 description, change "refine the SoT-drift invariant (context-sdk.ts:1685+)" to "refine the SoT-drift invariant (context-sdk.ts:2123-2163, codes `substrate_id_unregistered` / `substrate_id_registry_mismatch`)". Add to the implementation note: "stamp `origin:'minted-here'` at all three native `registerSubstrate` call sites — `writeSkeletonConfig` (context.ts:923), `reconcileActiveSubstrateRegistration` (:960), `adoptConception` (:1023)." (Line numbers will drift again; the function names are the durable anchors — cite those.)

---

## Problem 3 (under-specified — risks an anti-pattern): "extend the registry schema/type with origin/provenance fields" with no shape, and a 3-state drift refinement with no decision procedure

### The encoded assumption
TASK-003: "extend the registry schema/type with origin/provenance fields … refine the SoT-drift invariant … to distinguish native-lost-registry / foreign-import / genuine drift." Per the substrate's own `filing-provenance` / "self-sufficient instruction for a downstream subagent" convention, a field-shape and a decision procedure left implicit is a filing defect — the implementing subagent gets the verbatim text as its operating context.

### Why it is non-best-practice (code citation)
The current invariant (`context-sdk.ts:2137-2161`) has exactly TWO branches: entry-absent → `substrate_id_unregistered` (error); dir-mismatch → `substrate_id_registry_mismatch` (error). "Distinguish native-lost-registry / foreign-import / genuine drift" is a THREE-way refinement of the *entry-absent* branch, but the resolution states no rule for how the invariant tells them apart when the entry is, by definition, absent (there is no registry row to read `origin` from). Without a stated procedure the implementer will invent one — the exact augmentation-at-filing the substrate's conventions forbid.

### Proposed corrected resolution text
Specify the decision procedure and the field shape in the task body:

> "Registry `origin` shape: `{ kind: 'minted-here' | 'derived-from', source_substrate_id?: string, imported_at?: string }` (optional; absent `origin` ⇒ treat as legacy `minted-here` for back-compat). SoT-drift refinement (entry-ABSENT branch only; the dir-mismatch branch is unchanged genuine drift): the invariant cannot read `origin` from a missing row, so it classifies by what IS on disk — (a) active config has a `substrate_id` AND that id equals NO registered entry's `source_substrate_id` anywhere in the registry ⇒ `substrate_id_unregistered` (native-lost-registry; the existing auto-register-on-switch path via `reconcileActiveSubstrateRegistration` resolves it); (b) the active id appears as some entry's `source_substrate_id` (it is a known *source* whose own entry is absent) ⇒ a distinct `substrate_source_unregistered` code routing to clone/import, NOT blind register. If the design genuinely needs a third state, name it with its on-disk discriminator or DROP it — do not leave 'genuine drift' as an unspecified bucket. Confirm this procedure with the user before implementation (it elaborates DEC-0002's one-line 'refined to provenance-aware states')."

This makes the three-way split a derivable, stated rule rather than implementer invention; if the user's intent differs, the delta surfaces at filing instead of in code.

---

## What is SOUND (do not change)
- **Fork semantics** (copy content into a NEW dir + mint a FRESH `substrate_id`, never duplicate an id across dirs) — correct and necessary; matches the one-id↔one-dir SoT invariant the drift check enforces (`context-sdk.ts:2146-2160`). Mirror semantics are rightly rejected.
- **Copy set** "config + all blocks + relations.json + objects/" — correct; that is the full substrate content surface (config vocabulary, block files, the closure table, the content-object store).
- **Dual-surface unit** (library `cloneSubstrate` + Pi tool + CLI + orchestrator script landed together) — correct per the repo's op-surface convention; matches how `promoteItem` and the switch ops are surfaced (`ops-registry.ts`).
- **Provenance-bearing registry as the identity ledger** — correct and is in fact the right home for the lineage that Problem 1 mis-routes to a closure-table edge.
- **`context-validate` clean on the clone** — correct closure criterion.
- **mintSubstrateId reuse** — the clone should reuse `mintSubstrateId()` (`context-dir.ts:470`), the same minting the native paths use; the resolution implies this and it is right.
