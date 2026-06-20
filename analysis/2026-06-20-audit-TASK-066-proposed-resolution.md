# Audit — TASK-066 proposed resolution (back-port `task_gated_by_item` + `phase_depends_on` to the catalog)

Date: 2026-06-20
Scope: read-only design audit of TASK-066's description + acceptance_criteria against FGAP-094 (upstream gap), TASK-067 (forward dependent), and the cited code. No mutation, no implementation.

## Verdict: HAS-PROBLEMS (one concrete defect + two underspecifications; core premise sound)

The technical premise is correct and survives verification against the actual catalog + live config + shipped code. The task is NOT poisoned at its core. It carries one factual defect (a stale count) and two underspecified fields that a downstream coding subagent composing this verbatim would either get wrong or have to re-derive.

## What was verified true (premise is sound)

1. **Both relations are genuinely missing from the top-level `relation_types[]` registry of the catalog.**
   - `packages/pi-context/samples/conception.json` registry spans lines 143–400 (37 entries). The only `task_*` entries are `task_addresses_issue`, `task_depends_on_task`, `task_positioned_in_phase`, `task_addresses_gap`, `task_addresses_feature`, `task_governed_by_decision`. `task_gated_by_item` is NOT registered.
   - `task_gated_by_item` appears in the file ONLY as a *reference* inside a state-derivation block — `blocked_by.relation_types` at line 503 — i.e. the catalog already CONSUMES a relation it never REGISTERS. That referenced-but-unregistered state is exactly FGAP-094's drift symptom, confirmed present.
   - `phase_depends_on` has zero occurrences anywhere in the file. Confirmed absent. No equivalent phase-ordering edge exists (only `task_positioned_in_phase`, `phase_positioned_in_milestone`) — not a duplicate.

2. **Per-relation routing is correct.**
   - `pi-context read-config --registry relation_types --id task_gated_by_item` returns `{category: ordering, source_kinds: [tasks], target_kinds: [*]}` from live `.context/config.json` → catalog-only add, as TASK-066 states.
   - `pi-context read-config --registry relation_types --id phase_depends_on` → not found in live config → add to BOTH (catalog + config via amend-config), as TASK-066 states.

3. **`phase_depends_on` is genuinely consumed by shipped, reachable code — NOT dead.** The "confirm not dead code, else surface as the finding" instruction resolves to *register it*:
   - `roadmap-plan.ts:329–334` (`loadRoadmap`) filters `ctx.relations` on `e.relation_type === "phase_depends_on"` to build the topo-sort dependency graph.
   - `roadmap-plan.ts:507–512` (`validateRoadmaps`) re-filters the same relation for dangling-edge + cycle diagnostics.
   - Both functions are imported into the reflected op surface: `ops-registry.ts:94` imports `loadRoadmap`/`validateRoadmaps`/`renderRoadmap`/`listRoadmaps`; `ops-registry.ts:2115` invokes `validateRoadmaps(cwd)`. Reachable, shipped.
   - (Note: the relevant function is `loadRoadmap` at :283, not `loadRoadmapView`; TASK-066's line citations 329/505/528 land inside the right functions.)

4. **Field shape is correct.** Existing registry entries are `{canonical_id, display_name, category, source_kinds, target_kinds}` (e.g. lines 395–399). Matches TASK-066's prescribed shape.

## Problem 1 (DEFECT — must fix): the count-pin instruction is stale by 3

TASK-066 says: *"Update the samples-catalog.test.ts relation_type count pin (mirror TASK-061's 31→34 bump)."* This is wrong by inspection of the live test:

- `samples-catalog.test.ts:50` already asserts `c.relationTypes.length === 37` (and :48 title text says "37 relation_types"). The catalog moved from 34 to 37 after TASK-066 was filed (commits `a582939` TASK-061, `958102a` convention-articulation vocab, etc.). The header comment at :6 still says "34 relation_types" — itself stale.
- Adding 2 relations means the pin goes **37 → 39**, NOT 34 → 36. A subagent composing the "mirror 31→34" instruction verbatim would set a wrong expected value, and the build would fail on the assertion — OR worse, the agent would "fix" it to 36 and mask the real count.
- Two assertion sites move together: `:50` numeric pin AND the `:48` describe-string "37 relation_types"; plus the stale `:6` header comment "34 relation_types" should be corrected to 39 in the same edit (it is documentation of the pinned count).

## Problem 2 (UNDERSPECIFICATION): `phase_depends_on` entry shape left to the agent

TASK-066 gives `task_gated_by_item`'s shape concretely (via "already in live config") but specifies `phase_depends_on` only as *"per its roadmap-plan usage"* and the criterion as *"phase_depends_on: per its roadmap-plan usage."* The substrate is composed VERBATIM into the implementing subagent's context; "per its usage" forces re-derivation. The shape IS derivable and should be stated:

- From `roadmap-plan.ts:329–334`/`507–512`: the edge is phase→phase (both `e.parent` and `e.child` are roadmap phase ids; the `phase` kind exists at conception.json:109).
- It is a dependency/ordering edge feeding `topoSort` → `category: "ordering"`.
- Concrete: `{ "canonical_id": "phase_depends_on", "display_name": "depends on", "category": "ordering", "source_kinds": ["phase"], "target_kinds": ["phase"] }`.

## Problem 3 (REDUNDANT GATE / minor scope-friction): the "confirm not dead code" pre-step is already discharged

TASK-066 makes registering `phase_depends_on` conditional: *"Before adding phase_depends_on, confirm roadmap-plan.ts … is shipped/reachable, not dead code — if dead, surface that as the finding instead of registering the relation."* This audit already discharged that check (Problem-free item 3: shipped + reachable). Leaving the conditional in the task body invites a downstream agent to re-run an Explore pass that is now answered. Replace the open conditional with the resolved fact + the still-useful instruction (register it; the consuming code is `loadRoadmap`/`validateRoadmaps`, reflected at ops-registry.ts:2115).

## Not problems (explicitly cleared)

- **Two-relation scope** is correct and minimal — it is the catalog-worthy subset FGAP-094's `proposed_resolution` names ("at minimum task_gated_by_item, the relation a shipped derivation consumes"); `phase_depends_on` is the second shipped-consumed one. The other 4 live-only relations are correctly deferred to TASK-067's substrate-local-vs-catalog classification record, not silently dropped.
- **amend-config for the live `phase_depends_on` add** is the right surface (config mutation via the reflected op, not direct Edit on `.context/config.json`).
- **No over-engineering**: TASK-066 is a pure data back-port; it does not reach for the forcing-function (correctly held in TASK-067). The split is clean.

## Proposed corrected fields (ready to replace TASK-066's, pending user authorization — NOT applied here)

### description (replacement)

> Back-port the two shipped-consumed relation_types missing from the packaged catalog `packages/pi-context/samples/conception.json` `relation_types[]` registry (the single source of truth): `task_gated_by_item` (already registered in live `.context/config.json` as `{category: ordering, source_kinds: [tasks], target_kinds: [*]}` — catalog-only add; note it is already *referenced* in the catalog at `blocked_by.relation_types` (conception.json:503) while UNregistered, which is the FGAP-094 drift symptom) and `phase_depends_on` (in NEITHER catalog nor live config — add to BOTH; the config add via `amend-config`). `phase_depends_on` is confirmed shipped/reachable, not dead: consumed by literal string in `roadmap-plan.ts:329–334` (`loadRoadmap` topo-sort graph) and `:507–512` (`validateRoadmaps` dangling/cycle diagnostics), both reflected on the op surface (`ops-registry.ts:94` import, `:2115` `validateRoadmaps` invocation) — so register it. Registry entry shape (per existing entries, e.g. conception.json:395–399): `{canonical_id, display_name, category, source_kinds, target_kinds}`. The two entries: `task_gated_by_item` = `{display_name: "gated by", category: ordering, source_kinds: [tasks], target_kinds: [*]}` (verbatim from live config); `phase_depends_on` = `{display_name: "depends on", category: ordering, source_kinds: [phase], target_kinds: [phase]}` (phase→phase, derived from its topoSort usage). Update the `samples-catalog.test.ts` relation_type count pin from its CURRENT value 37 to 39 (`:50` numeric assertion AND the `:48` describe-string "37 relation_types" → "39 relation_types"); correct the stale `:6` header comment "34 relation_types" to "39 relation_types". NOW back-port slice of FGAP-094; mirrors TASK-061/TASK-033 (ship vocabulary in the catalog).

### acceptance_criteria (replacement)

1. `read-samples-catalog` lists `task_gated_by_item` and `phase_depends_on` in `relation_types[]` with the exact `{canonical_id, display_name, category, source_kinds, target_kinds}` shape — `task_gated_by_item`: `ordering`, `tasks`→`*`; `phase_depends_on`: `ordering`, `phase`→`phase`.
2. A fresh `/tmp` substrate (context-init → context-accept-all → context-install) carries both relation_types — the original FGAP-094 symptom resolved: a `task_gated_by_item` edge is writable on a fresh substrate (no write-time rejection).
3. Live `.context/config.json` carries `phase_depends_on` (added via `amend-config`) with `{category: ordering, source_kinds: [phase], target_kinds: [phase]}`; `task_gated_by_item` already present there is unchanged.
4. `samples-catalog.test.ts` relation_type count pin updated 37→39 (numeric `:50` + describe-string `:48`); stale `:6` header comment corrected to 39; build/check/test green; `context-validate` clean.
5. Edges: `task_addresses_gap` → FGAP-094; `item_governed_by_convention` → feature-branch-workflow.

(Note: TASK-067's acceptance criterion that the parity gate must FAIL on a removed consumed relation independently validates that `phase_depends_on` + `task_gated_by_item` are in the consumed set the gate enumerates — the two tasks are mutually consistent on these two relations.)
