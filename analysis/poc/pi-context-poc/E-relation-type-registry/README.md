# POC E — relation-type registry with category dispatch

## What it proves

The candidate articulation claims `config.relation_types[]` is the canonical declaration surface for edges in pi-context, parallel to `block_kinds[]` for items. This POC mechanically demonstrates the load-bearing claim that the **category** field on each relation_type drives validator dispatch, not the relation_type name.

Two relation_types live side-by-side in this fixture:

| relation_type        | category    | cycle_allowed | Validator                                          |
|----------------------|-------------|---------------|----------------------------------------------------|
| `phase_depends_on`   | `ordering`  | `false`       | Topological sort + cycle detection                 |
| `consumes`           | `data_flow` | `false`       | Content-hash propagation simulation                |

The same `render.ts` walks `cfg.relation_types[]`, looks up the matching `CategoryHandler` from a table keyed on `decl.category`, and runs it on the edge subset filtered by `decl.name`. Adding a new `ordering` relation_type (e.g., `task_blocks_on`) requires zero code change — its edges flow through `orderingHandler` automatically. Adding a new category requires registering one new handler in `CATEGORY_HANDLERS`.

## Files

```
config.json                     declares two relation_types, each with category
schemas/relations.schema.json   closure-table edge schema (parent / child / relation_type)
data/items.json                 5 items: PHASE-A through PHASE-E
data/relations.json             4 ordering edges (linear A→B→C→D→E) + 3 data_flow edges (E consumes A, B, C)
render.ts                       loads config + relations + items; dispatches per category; emits both reports
output/ordering-validation.md   topological sort + cycle check for phase_depends_on
output/data-flow-validation.md  upstream-dependency + content-hash propagation report for consumes
```

## How to run

```bash
cd /Users/david/Projects/workflowsPiExtension
npx tsx analysis/poc/pi-context-poc/E-relation-type-registry/render.ts
```

A single invocation produces both `output/*.md` reports (one per relation_type).

## Verification

Per the plan §"POC E" §"Verification":

1. **Both reports exit 0** — single invocation produces both output files; check exit code.
2. **`output/ordering-validation.md` emits topo order `[PHASE-A, PHASE-B, PHASE-C, PHASE-D, PHASE-E]`** — Kahn's algorithm over the linear chain yields the expected sequence.
3. **`output/data-flow-validation.md` identifies PHASE-E as having three upstream dependencies** (PHASE-A, PHASE-B, PHASE-C) — derived from the three `consumes` edges with `child=PHASE-E`.
4. **`config.json`'s `relation_types[].category` field drives dispatch** — `render.ts` defines `CATEGORY_HANDLERS: Record<string, CategoryHandler>` keyed on category strings (`ordering`, `data_flow`), and the dispatch loop calls `CATEGORY_HANDLERS[decl.category]`. There are no `if (decl.name === "phase_depends_on")` or equivalent name-based branches.

Verification commands:

```bash
ls output/
grep -F "[PHASE-A, PHASE-B, PHASE-C, PHASE-D, PHASE-E]" output/ordering-validation.md
grep -F "PHASE-E" output/data-flow-validation.md | grep -F "3 upstream"
grep -nE "CATEGORY_HANDLERS|decl\.category" render.ts
```

## Scope boundary

- No `packages/` or `.project/` touches.
- No third-party deps (Node builtins + JSON only; AJV is excluded at this layer per POC convention — production pi-context layer adds AJV-at-every-write).
- Content-hash uses `node:crypto` SHA-256 truncated to 12 hex chars (illustrative; production would use full digests).
- Composite-hash propagation is the simplest model that demonstrates cache-coherence on `data_flow` edges. POC B owns the full content-hash skip-detection POC; POC E only needs enough to show the `data_flow` handler is non-trivially distinct from the `ordering` handler.
- Cycle handling is one-direction-only (Kahn's). The fixture is acyclic by construction; the report includes a CYCLE-DETECTED branch but it is unreached on the canonical fixture.
