# Canonical resolution to FGAP-037 in vision context

## Frame

The vision (DEC-0049 uniform-agent axiom + JI-010 "everything between I have a spec and I have a typed result" + DEC-0044 narrowed) says: **pi-jit-agents owns the agent layer**; pi-workflows orchestrates DAGs; pi-behavior-monitors classifies; pi-agent-dispatch registers agent-as-tool. Agent-prompt rendering machinery and its template assets are agent-layer concerns. The current location of macros/items/render-helpers at `packages/pi-workflows/templates/` is pre-consolidation legacy.

Per user direction in this session: "the intention is NOT TO HAVE THEM IN WORKFLOWS." Adding 6 wrappers at `packages/pi-workflows/templates/shared/macros.md` closes the literal name-gap but cements the wrong architectural site — explicitly rejected.

## Canonical resolution

**FGAP-037 is mis-scoped against the wrong package.** Its content (6 missing whole-block delegators) is a strict subset of the consumer-cascade relocation work tracked by FEAT-001 / TASK-082 / TASK-083 (workflows + monitors consume canonical pi-jit-agents agent layer; duplicate AgentSpec/loader/compile deleted).

The canonical resolution has six elements:

1. **Relocate the entire agent-template tree** from `packages/pi-workflows/templates/` to `packages/pi-jit-agents/templates/` (or pi-jit-agents' declared template search root). This includes `items/` (14 per-item macros), `shared/macros.md` (10 existing whole-block delegators), and `shared/render-helpers.md` (the scaffold primitives `render_whole_block_truthy` / `render_whole_block_nonempty` / `render_id_list_block` etc.).

2. **Add the 6 missing whole-block delegators at the NEW canonical location** — not at the old. Names follow the verified plural convention in `shared/macros.md`: `render_decisions`, `render_features`, `render_framework_gaps`, `render_layer_plans`, `render_research`, `render_spec_reviews`. Each is a ~2-line wrapper importing the per-item macro from `items/<kind>.md` and delegating through `render_whole_block_truthy`.

3. **Honor the schema array-key divergence** the user identified in the final critique. Block-name ≠ data-key for 3 of 6: `framework-gaps`→`data.gaps`, `layer-plans`→`data.plans`, `spec-reviews`→`data.reviews`. The delegator uses the schema's actual array key, sourced from `packages/pi-context/samples/conception.json`. This belongs documented in `CANONICAL_MACRO_NAMES` registry at `packages/pi-jit-agents/src/renderer-registry.ts` alongside the macro-name mapping — currently the registry maps `block_kind → macro_name` but not `block_kind → array_key`. That missing column is the actual gap FGAP-037 didn't surface.

4. **Consumer-cascade the template-search-path** so the 3-tier resolution (`.pi/templates/` > `~/.pi/agent/` > package) roots the package layer at pi-jit-agents. pi-workflows and pi-behavior-monitors stop shipping agent templates; pi-agent-dispatch consumes from pi-jit-agents like the others.

5. **Re-file FGAP-037** with the corrected body per the user's "What FGAP-037 Should Say" rewrite (6 whole-block delegators missing; per-item macros already exist; plural convention; ~2-line glue each), the corrected target package (pi-jit-agents post-relocation), and an added scope item for the array-key registry. Status moves from `identified` to `superseded_by: <FEAT-001 sub-item>` rather than closed-as-independently-fixed. The 5 disclarities the user identified are corrections to the existing FGAP body, not separate items.

6. **DEC-0049 / FEAT-001 absorb FGAP-037**: it becomes a checklist item under the consumer cascade, not a standalone repair. The macros relocation is one phase of TASK-082 (or a new sibling task if scope warrants split — that's a substrate-shaping call). The 6 missing delegators are added in the same phase that performs the relocation — at the canonical site, in the canonical naming convention, with canonical array-key handling — so the fix and the relocation are atomic.

## What this does NOT do

- Does not patch macros.md at the pi-workflows location (rejected per user direction)
- Does not duplicate macros across pi-jit-agents and pi-workflows during transition (no parallel-paths-then-deprecate — direct relocation per [[feedback_no_parallel_ungated_paths]])
- Does not close FGAP-037 as standalone-fixed (the close is via supersession by FEAT-001 sub-item)
- Does not defer the array-key registry gap to "future work" (added to scope of the same relocation — mandate-007)
- Does not change the per-item macro contents (they exist + work + dispatch through `render-item-by-id`; the relocation moves them unchanged)

## Substrate shape implied

- FGAP-037 body correction (5 disclarities) + status `superseded_by`
- FEAT-001 acquires a sub-item (story or task) for "agent-template relocation including FGAP-037's 6 delegators + array-key registry column"
- TASK-082 (or new sibling) gains the relocation as a phase
- DEC-0049 may want a `consequences` line affirming "agent-template assets live at pi-jit-agents" if not already explicit there
- pi-workflows package.json drops the `templates/` export once relocation lands; pi-jit-agents package.json adds it
