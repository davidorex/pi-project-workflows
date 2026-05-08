# POC F — cascade fail-stop semantics

Empirically demonstrates that three fail-stop modes for cascade-step failure are
observable on a multi-step injection pipeline.

## What it proves

A four-step pipeline runs over five fixture items:

1. **load** — read `data/items.json`
2. **render** — convert each item to a markdown bullet (rejects bodies containing
   the forbidden `<<UNPARSEABLE>>` token)
3. **budget** — enforce a soft character cap on the joined rendered block
4. **wrap** — surround the budgeted block in framework anti-injection delimiters

Item 3's body contains the forbidden token, so the render step fails on it. The
orchestrator selects one of three failure-handling modes via `process.argv[2]`
and the failed step is observably handled per mode.

## Three-mode invocation table

| Mode       | Command                                                                                | Behavior on render failure                       | Final exit code |
|------------|----------------------------------------------------------------------------------------|--------------------------------------------------|-----------------|
| `skip`     | `npx tsx analysis/poc/pi-context-poc/F-cascade-fail-stop/render.ts skip`               | Drop the failed item, continue downstream        | 0               |
| `fail`     | `npx tsx analysis/poc/pi-context-poc/F-cascade-fail-stop/render.ts fail`               | Halt the cascade at the first failure            | 1 (by design)   |
| `annotate` | `npx tsx analysis/poc/pi-context-poc/F-cascade-fail-stop/render.ts annotate`           | Replace the failed item with a placeholder annotation, continue | 0 |

Default mode (no arg) is `skip`.

## Files

- `cascade.ts` — pipeline steps (`loadItems`, `renderItem`, `applyBudget`,
  `wrapDelimiters`). Each step returns `{ status: "ok" | "fail", output, error? }`.
- `render.ts` — orchestrator. Resolves mode from argv, loops items through
  `renderItem`, applies the per-mode policy, runs downstream steps if not halted,
  emits the final markdown plus a cascade-summary line.
- `data/items.json` — five items; item 3's body contains `<<UNPARSEABLE>>`.
- `output/skip-mode.md` — items 1, 2, 4, 5 rendered; item 3 dropped.
- `output/fail-mode.md` — items 1, 2 rendered before halt; error report.
- `output/annotate-mode.md` — items 1, 2, [annotation], 4, 5 rendered.

## Verification

Per the plan's "Verification" subsection for POC F:

1. `skip` and `annotate` runs exit 0; `fail` exits 1 by design.
2. `grep -c "^- ITEM-" output/skip-mode.md` returns `4`.
3. `grep -c "^- ITEM-" output/fail-mode.md` returns `2` (only items 1, 2 before halt).
4. `grep -cE "^- ITEM-|annotation" output/annotate-mode.md` returns `5` (4 items + 1 annotation).

## Scope boundary

- Node builtins + JSON only (no third-party deps).
- POC stays under `analysis/poc/pi-context-poc/F-cascade-fail-stop/` — no
  `packages/` or `.project/` touches, no commits, no version bumps.
- The render-step failure rule (forbidden `<<UNPARSEABLE>>` token) is a fixture
  device for surfacing failures deterministically; production injection failures
  surface from real schema/template/budget violations.
- The character-budget cap (2000) is comfortably above the fixture's actual
  size; the budget step is part of the pipeline shape but not the failure
  surface in this POC.
