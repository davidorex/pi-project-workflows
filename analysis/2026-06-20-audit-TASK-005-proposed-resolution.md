# Audit — TASK-005 proposed resolution (convergent ordered-sequence field-kind)

**Date:** 2026-06-20
**Scope:** design-altitude audit of TASK-005's proposed resolution (its `description` + `acceptance_criteria`) and the upstream `proposed_resolution` it composes verbatim from FGAP-005 / DEC-0005 / FEAT-003. Read-only; no mutation, no implementation.
**Lens:** code-simplifier applied to the DESIGN — wrong assumptions, overly-complex-vs-existing, non-best-practice / scope-creep.

## Verdict: HAS-PROBLEMS

The CRDT machinery (Fugue-class non-interleaving sequence + Kleppmann move-register + HLC) is a sound, best-practice answer to the abstract problem it names. But the proposed resolution is built on a **mis-stated substrate fact**: it targets a representation ("a plain ordered array of refs on the owning item" — `fragment_refs` / `phase-order` / `step-list`) that **does not exist in this substrate**. The live ordering mechanism is the `ordinal` integer on closure-table edges in `relations.json`. Because the target is wrong, the field-kind / schema / `<block>.json`-state design is bolted to the wrong surface, and the headline acceptance criteria describe a merge that the real substrate never performs in the place they say it does. The chain is internally consistent (TASK-005 faithfully composes DEC-0005, which faithfully composes FGAP-005) — the poison is at the FGAP-005 root and propagates verbatim.

---

## Grounding (actual code, cited)

1. **Ordering is carried by `ordinal` on edges, not by an item-level ref-array.**
   - `packages/pi-context/schemas/relations.schema.json:56-59` — the only `ordinal` in any schema: `"ordinal": { "type":"integer", "description":"Optional sibling-ordering within (parent, relation_type)." }` on the closure-table edge object.
   - `packages/pi-context/src/context.ts:693-696` — `ordinal` is **intentionally NOT part of edge identity**; "two edges differing only in `ordinal` are the same relationship for dedup."
   - `ordinal` is the live, consumed sibling-order key across the SDK relation surface (`context-sdk.ts:1532,1651-1659,1727-1801`; `ops-registry.ts:354-550`).

2. **The cited item-level ordered ref-array fields do not exist.** Grepping `samples/schemas/*.json` + `schemas/*.json` for `fragment_refs` / `step_list` / `phase-order` / "ordered ref" returns nothing. The `"type":"array"` fields that DO exist on item schemas (`features.evidence`, `decisions.consequences`, etc.) are arrays of strings / nested objects — not ordered collections of item-refs requiring convergent reconciliation. FGAP-005's own evidence cites `context.ts` and `block-api.ts` generically ("a `fragment_refs` / phase-order / step-list field") — i.e. **hypothetical exemplars, not real fields.**

3. **The host merge driver does not yet exist** (`TASK-004` / `FEAT-002`, both `planned`). TASK-005 correctly declares `task_depends_on_task` → TASK-004 and DEC-0005 correctly marks the capability "latent until the structure-aware git merge driver exists." This gating is *sound* — not a problem.

---

## Problems

### P1 (headline, CRITICAL) — wrong representational target ("plain ordered ref-array on the owning item")

The whole resolution is shaped to convert "a plain ordered ref-array on the owning item" into a CRDT stored "in the owning `<block>.json`." That array does not exist. Where ordering actually needs to converge — roadmaps, phase sequences, milestone sequences, step lists — order is `ordinal` on `(parent, relation_type)` sibling edges in **`relations.json`**, a single shared file, not the owning block file.

Consequences of the mis-target, all of which make the design wrong or needlessly hard:
- **Wrong file.** "authoritative CRDT state carried in the owning `<block>.json`" is the wrong location; the data lives in `relations.json`. A field-kind keyed to an item schema field cannot see edge ordinals.
- **Wrong merge-dispatch unit.** DEC-0005 / TASK-004 describe field-kind dispatch on `git %O/%A/%B` of "the owning block file." The contested ordering is in `relations.json` — an *edge set*, which TASK-004 already separately enumerates ("edge-set merge on relations.json"). So the sequence field-kind as designed and the relations edge-set merge are aimed at two different surfaces, and the *real* ordering convergence falls to the relations edge-set merge, which DEC-0005's field-kind does not touch.
- **Mis-framed CRDT carrier.** A Fugue position identifier is meant to replace an array index. The live carrier is already a *detached integer* (`ordinal`) on an edge whose identity is `(parent, child, relation_type)` and is *ordinal-insensitive*. The element identity problem the move-CRDT solves ("a move never duplicates or drops the element") is **already solved** by the closure-table model: the element is the edge, its identity is the triple, and a reorder is a pure `ordinal` rewrite that the existing identity-dedup treats as the same edge. What is missing is only **convergent reconciliation of two concurrently-rewritten `ordinal` values for the same `(parent, relation_type)` sibling set** — a far smaller problem than "non-interleaving sequence CRDT over item-refs with insert-mints-immutable-dense-position-ids."

### P2 (over-complex vs. the real problem) — full Fugue + move-register may exceed what edge-ordinals need

Because the element (the edge) already has stable triple-identity and insert/delete are already first-class edge append/remove, the residual problem is narrow: **concurrent re-ordinaling of a sibling set under one `(parent, relation_type)`**. That is a *position-register-per-edge* problem (resolve two concurrent `ordinal` writes for the same edge deterministically) plus a *dense-rank / tie-break* for concurrent inserts into the same gap — not necessarily the full non-interleaving Fugue sequence CRDT over minted dense position identifiers. The move-CRDT half (Kleppmann position register + HLC) is plausibly the *whole* answer once the carrier is recognized as the edge-ordinal; the Fugue half may be redundant machinery for a collection whose elements already carry external stable identity. The proposed resolution should be re-derived against the edge-ordinal carrier and justify each CRDT component against *that* problem, rather than inheriting the array-index framing wholesale.

### P3 (scope / location drift) — "declared sequence-field kind recognized by schema" presumes a field that isn't there

TASK-005's acceptance includes "declared sequence-field kind recognized by schema" and "CRDT state stored in the owning `<block>.json`." With the carrier being edge ordinals in `relations.json`, this introduces a **new item-level field-kind and per-block CRDT state that nothing currently produces or consumes**, i.e. building the convergence machine for a representation that would itself have to be invented first (migrating roadmaps/phases off edge-ordinals onto item-level ref-arrays). That migration is unstated, unscoped, and arguably undesirable (it would abandon the closure-table's already-good edge identity). Either way it is hidden scope the task does not name.

### P4 (relation to TASK-027) — the live ordering surface is being separately hardened, unreconciled

`TASK-027` (FGAP-007) is actively adding endpoint-role metadata + write-time direction enforcement to **ordering relation_types on edges** — i.e. it treats edge-ordering as the real ordering surface. TASK-005 / DEC-0005 treat item-level ref-arrays as the ordering surface. These two live tasks model "ordering" on two different carriers with no cross-reference. Whichever is canonical, the other's framing needs correcting; they cannot both be the ordering substrate.

---

## What is SOUND (keep)

- **The gating** (`task_depends_on_task` → TASK-004; "latent until the merge driver exists") is correct and should stay.
- **The CRDT family choice** — non-interleaving sequence CRDT for insert-convergence, a move-register resolved by a hybrid logical clock for move-convergence, HLC for replica-independent total order, sort-on-read projection for legibility — is best-practice for the *abstract* "convergent ordered collection" problem. The defect is the *target*, not the algorithmic family.
- **"Convergence in the stored representation, legibility in the projection"** is a sound principle and survives re-targeting (the projection just emits ordered edges/refs from converged ordinals instead of from a minted-id array).

---

## Proposed corrected text (ready to replace TASK-005 fields)

> NOTE: TASK-005's body is composed verbatim from FGAP-005 `proposed_resolution` / DEC-0005. The correction is at the **FGAP-005 root**; TASK-005 + FEAT-003 then re-derive from the corrected decision. Surfacing the corrected *task* text below; the same re-target must flow up to FGAP-005.proposed_resolution and DEC-0005.decision (and FEAT-003) so the verbatim-composition chain stays consistent. Present this to the user as a provenance-reviewed re-derivation, not an in-place edit, because it narrows scope (a qualifier change), which is never DERIVABLE — it is a user decision.

### TASK-005 `description` (proposed replacement)

> Implement the convergent ordered-sequence field-kind per DEC-0005 / FGAP-005 / FEAT-003, **targeting the substrate's actual ordering carrier: the `ordinal` integer on `(parent, relation_type)` sibling edges in `relations.json`** (NOT a hypothetical item-level ordered ref-array — no such field exists; ordering is closure-table edge sibling-order, ordinal-insensitive edge identity per context.ts:693). The element is the edge; its identity is the `(parent, child, relation_type)` triple, already stable, so insert = edge append, delete = edge remove, move = `ordinal` rewrite. The residual convergence problem is: two divergent versions that each re-ordinal and/or insert/delete edges under the same `(parent, relation_type)` must merge to one replica-independent sibling order with every insert present, no edge duplicated or dropped, and concurrently-inserted runs non-interleaved. Resolve concurrent same-edge `ordinal` rewrites via a position register keyed on edge identity resolved by hybrid logical clock (Kleppmann move-CRDT); resolve concurrent same-gap inserts via dense, immutable, replica-independent position keys with HLC tie-break (Fugue-class non-interleaving) — but justify each CRDT component against the edge-ordinal carrier, dropping any made redundant by the edge's pre-existing external identity. Authoritative CRDT position state carried in `relations.json` (the file whose edge-set merge TASK-004 already owns), reconciled by the relations.json edge-set field-merge dispatch — NOT a per-`<block>.json` item field. Sort-on-read projection emits the resolved sibling order as a plain ordered ref-list for reading/editing; an array-position hand-edit translates to ordinal/position-key CRDT ops through block-api. Plugs into the substrate merge driver's relations.json field-merge dispatch (TASK-004 / FEAT-002). Reconcile with TASK-027 (FGAP-007), which hardens the same edge-ordering surface — they must agree on edge-ordering as the canonical carrier. Full completion sequence. Via coding subagent; orchestrator runs all npm + is sole git writer; per-step commit. Depends on the substrate merge driver (TASK-004).

### TASK-005 `acceptance_criteria` (proposed replacement)

> 1. Two divergent versions each insert / delete / re-ordinal edges under the same `(parent, relation_type)` in `relations.json`; the merge yields one replica-independent sibling order containing all inserts, with no edge duplicated or lost and no interleaving of concurrently-inserted runs.
> 2. An insert mints one dense, immutable, replica-independent position key and rewrites no sibling's key.
> 3. A move rewrites one edge's position register; two concurrent moves of the same edge (same `(parent, child, relation_type)` triple) resolve to one position deterministically by hybrid logical clock.
> 4. The sort-on-read projection reproduces single-writer authoring order identically to today's `ordinal`-sorted sibling order, and accepts an array-position hand-edit translated to position/ordinal CRDT ops through block-api.
> 5. The field-merge is dispatched by the TASK-004 relations.json edge-set merge (not a per-`<block>.json` item field); state lives in `relations.json`.
> 6. No new item-level field-kind or per-block CRDT state is introduced unless DEC-0005 is first re-decided to migrate ordering off edge-ordinals onto item ref-arrays (that migration, if wanted, is its own explicitly-scoped task — not smuggled into this one).

---

## If the user instead intends item-level ref-arrays as a *future* representation

Then the correction is different but still required: FGAP-005 must state plainly that the target field-kind **does not yet exist** and name the prerequisite that introduces it (a schema field + a migration moving ordering off edge-ordinals), as an explicit dependency — rather than implying the array is the current authoritative representation ("Order is a plain ordered array of refs on the owning item ... authoritative by design", which the substrate does not bear out). Surfacing this as a fork is appropriate here because it is a genuine user design decision (carrier choice), not derivable from the code.
