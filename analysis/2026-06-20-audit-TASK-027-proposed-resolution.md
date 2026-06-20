# Audit — TASK-027 proposed resolution (FGAP-007 ordering-edge direction)

Date: 2026-06-20
Scope: read-only audit of TASK-027's description + acceptance_criteria (the proposed resolution) and the upstream FGAP-007 `proposed_resolution`, against the actual cited code. No mutation, no implementation.

## Verdict: HAS-PROBLEMS

The gap FGAP-007 is real and correctly characterized: `task_depends_on_task` is named source_verb_target so the name reads *parent depends_on child* (parent = depender/dependent), while the deriver treats **parent = prerequisite, child = dependent** (`context-sdk.ts:786-803`, `currentState`). Name and consumed direction are genuinely inverted, and the write path stores backwards edges silently. Fixing it is warranted.

But the proposed resolution carries three poisoned assumptions that would mis-target the implementation. They are corrected below.

---

## Problem 1 (WRONG / architecture-violating): "enforce in append-relation" names a layer that structurally cannot host the check

Both TASK-027 (description) and FGAP-007 (`proposed_resolution`) say to validate/normalize direction **"in append-relation"** / "have appendRelation / append-relation validate … at write time."

The low-level `appendRelation` / `appendRelations` primitives live in `context.ts` and the code documents, verbatim, that they **cannot** perform reference-semantic checks:

> "Reference integrity — endpoints resolve, relation_type is registered, no cycle … — is NOT checked here. This is forced by the layer graph: `appendRelations` lives in context, which imports only block-api; endpoint resolution needs `buildIdIndex` from context-sdk, and importing context-sdk here would invert the dependency direction." (`context.ts:705-720`)

Direction enforcement against endpoint ROLE requires resolving each endpoint to its block/kind and consulting the registry — exactly the `buildIdIndex` capability that `context.ts` is forbidden to import. So the literal instruction "enforce in append-relation" is not implementable at that layer without an architecture inversion.

The instruction also overlooks that the correct host **already exists**. TASK-062 established the write-time edge gate at the porcelain layer:
- `validateEdgeAgainstRegistry(edge, config, resolve)` — the single shared write-time + validate-time edge validator (`context-sdk.ts:1567-1600`)
- `assertEdgeValidForWrite(cwd, edge)` (`context-sdk.ts:1628-1635`) called from `appendRelationByRef` **before any write** (`context-sdk.ts:1665`), dryRun included.

This is the slot the new direction check belongs in — an additional check inside `validateEdgeAgainstRegistry` (so write-time and `validateContext` verdicts stay identical, the property TASK-062 deliberately bought), guarded on the new endpoint-role metadata's presence. TASK-027 never references `validateEdgeAgainstRegistry`, `assertEdgeValidForWrite`, or `appendRelationByRef`; its `files: ["packages/pi-context/src/context-sdk.ts"]` is right by accident but its prose points at the wrong function.

The mis-naming also makes acceptance criterion 3 ("append-relation validates or normalizes …") partly wrong on a second axis — see Problem 3 on normalize-vs-reject.

## Problem 2 (WRONG / scope-creep): criterion 8 mandates enforcement of relation_types that do not exist in this substrate

Criterion 8 requires the enforcement to apply to "every sibling ordering relation_type sharing the inverted-name root: `story_depends_on_story`, `feature_depends_on_item`, `feature_gated_by_item`, `phase_depends_on` — each either carries the endpoint-role metadata and is enforced, or is demonstrably exempt."

Checked against the active `.context` registry (`read-config --registry relation_types`):
- `task_depends_on_task` — present (`category: ordering`, `source_kinds:[tasks]`, `target_kinds:[tasks]`).
- `feature_gated_by_item` — present (`category: ordering`, `source_kinds:[features]`, `target_kinds:[*]`). This is GATE-direction, NOT dependency-direction: the deriver reads `*_gated_by_item` as `{parent=gated, child=gate-target}` (`context-sdk.ts:804-808`). Its name ("gated by") already reads parent→child correctly (parent is gated, child is what it waits on). It is therefore in the *demonstrably-exempt* branch, not a defect to repair.
- `phase_depends_on` — **not registered** in this substrate. Back-porting it is the separate open TASK-066 (FGAP-094). It cannot be "enforced" here because it does not exist here.
- `story_depends_on_story`, `feature_depends_on_item` — **not registered** in this substrate.

So three of the four named siblings are absent from the active substrate. Criterion 8 as written demands acting on vocabulary that isn't installed, inviting either fabricated "exemptions" for non-existent relations or scope-creep into TASK-066's territory. The enforcement must be **registry-driven** (apply to whatever ordering relation_types carry the new metadata, present-gated), not hard-coded against a fixed name list.

## Problem 3 (NON-BEST-PRACTICE / fragility): "reject OR auto-orient" offers silent data mutation as an equal option

Criterion 3 and FGAP-007 both phrase the remedy as "rejected (or auto-oriented) at append." Auto-orienting — silently swapping parent/child on write — is a footgun of the same family as the one being fixed: it mutates the caller's stated intent without signal, and `ordinal`/sibling-order semantics on ordering edges make a silent swap ambiguous. The TASK-062 gate it should extend is a **reject-with-message** gate (`assertEdgeValidForWrite` throws; `context.ts:705-720` defers nothing silently). Best practice and consistency with the existing gate is **reject with a direction-naming error**, leaving auto-orientation out. Keep the remedy single-valued: reject.

## Problem 4 (UNDER-SPECIFIED): "endpoint-role metadata extending source_kinds/target_kinds" names no field

Criterion 2 says to add metadata "extending the existing source_kinds/target_kinds metadata" but names no field. The registry decl type is `RelationTypeDecl` (`context.ts:268-269` carries `source_kinds?`/`target_kinds?`; `category` already exists). The new field should be explicit and config-schema-validated (a `RelationTypeDecl` addition + the relation_types config schema), or it is unenforceable metadata an author can typo. The corrected text below names it.

---

## Proposed replacement text (ready to drop into TASK-027)

### description (replace)

> Resolve FGAP-007 (name-vs-deriver direction inversion on ordering relations). Add an explicit endpoint-role field to the relation_type registry decl identifying which edge endpoint is the prerequisite and which is the dependent, and extend the EXISTING write-time edge gate (`validateEdgeAgainstRegistry` in context-sdk.ts, called via `assertEdgeValidForWrite` from `appendRelationByRef`/`appendRelationsByRef` — the TASK-062 gate, NOT the layer-restricted `appendRelation` primitive in context.ts) to reject a backwards ordering edge at write time, present-gated on the new field. The deriver's `{parent=prerequisite, child=dependent}` contract (context-sdk.ts:786-803) is the canonical direction; the write gate enforces the SAME contract so name and stored direction cannot diverge. Migrate any already-inverted edge in relations.json to the correct orientation.

### files (correct)

> `["packages/pi-context/src/context-sdk.ts", "packages/pi-context/src/context.ts", ".context/config.json", "packages/pi-context/schemas/*"]`
> (context-sdk.ts: the gate + deriver-contract assertion; context.ts: the `RelationTypeDecl` field; config.json: the metadata on the live relation_type(s); schema: validate the new field. context.ts hosts the TYPE only — NOT the runtime check.)

### acceptance_criteria (replace the problematic items)

1. (keep) Name and the currentState deriver agree on parent/child direction: explicit endpoint-role metadata makes the depender/depended-upon endpoint unambiguous regardless of the verb; the canonical direction is the deriver's existing `{parent=prerequisite, child=dependent}` (context-sdk.ts:786-803).
2. (revise) The `RelationTypeDecl` registry shape gains a NAMED endpoint-role field (e.g. `ordering_role: { prerequisite: "parent"|"child", dependent: "parent"|"child" }`), validated by the relation_types config schema; `task_depends_on_task`'s registry entry sets it to `{prerequisite: "parent", dependent: "child"}` matching the deriver.
3. (revise) The write-time gate `validateEdgeAgainstRegistry` (NOT `appendRelation`) gains a direction check that REJECTS a backwards ordering edge with a direction-naming error before any write — dryRun included — keeping write-time and `validateContext` verdicts byte-identical (the TASK-062 invariant). No auto-orientation: reject only.
4. (keep) The new check fires ONLY for relation_types carrying the endpoint-role field; ordering relation_types without it and non-ordering relation_types are unaffected (no new false-positive rejections) — present-gated exactly like the source_kinds/target_kinds gate at context-sdk.ts:1585.
5. (keep) Every existing `task_depends_on_task` edge in relations.json remains valid after the fix; any edge stored backwards under the corrected contract is migrated to the correct orientation; already-correct edges unchanged.
6. (keep) `context-validate` / `context-validate-relations` pass after the fix and after any edge migration, no new integrity findings.
7. (keep) The deriver's blocked/ready output is unchanged where edges were already correct and corrected only where an edge was inverted.
8. (replace) Enforcement is REGISTRY-DRIVEN: it applies to whatever relation_types in THIS substrate's `config.relation_types[]` carry the endpoint-role field — not a hard-coded name list. Of the relations present today: `task_depends_on_task` carries the field and is enforced; `feature_gated_by_item` is gate-direction with a name already consistent with the deriver (`{parent=gated, child=gate-target}`, context-sdk.ts:804-808) and is demonstrably exempt. `phase_depends_on` / `story_depends_on_story` / `feature_depends_on_item` are NOT registered in this substrate (phase_depends_on back-port is the separate TASK-066/FGAP-094) and are out of scope here; the registry-driven design means they are enforced automatically if/when back-ported with the field.
9. (keep) Tests assert: a backwards ordering edge is REJECTED at write time, a forwards edge is accepted, the metadata-absent gate holds (no enforcement when the field is absent), the deriver continues to treat `{parent=prerequisite, child=dependent}` correctly.
10. (keep) Build, check, full test suite at zero failures with the change in dist/.

---

## Sound elements (kept as-is)

- The core diagnosis (name/deriver inversion, silent backwards write) is accurate and well-cited.
- The migration requirement (criteria 5/6/7) is correctly conservative: migrate inverted edges, leave correct ones, re-validate.
- The metadata-presence gate (criterion 4) is the right design and matches the existing source_kinds/target_kinds present-gate.
- The test matrix (criterion 9) is well-shaped once "reject" replaces "reject/normalize."

## Code citations

- `context.ts:705-720` — appendRelation cannot host reference-semantic checks (layer graph); guards deferred.
- `context.ts:766-780` — `appendRelation`/`appendRelationForDir` primitives (shape + dedup only).
- `context.ts:268-269` — `RelationTypeDecl` carries `source_kinds?`/`target_kinds?` (+ `category`).
- `context-sdk.ts:1567-1600` — `validateEdgeAgainstRegistry`, the shared write+validate edge gate (TASK-062).
- `context-sdk.ts:1628-1635` — `assertEdgeValidForWrite` (throws on bad edge).
- `context-sdk.ts:1649-1680` — `appendRelationByRef` calls `assertEdgeValidForWrite` before write (dryRun included).
- `context-sdk.ts:786-808` — deriver direction contract: dependency `{parent=prereq, child=dependent}`; gate `{parent=gated, child=target}`.
- `read-config relation_types`: `task_depends_on_task {category:ordering, source_kinds:[tasks], target_kinds:[tasks]}`; `feature_gated_by_item {category:ordering, source_kinds:[features], target_kinds:[*]}`; `phase_depends_on` NOT FOUND.
