# POC C — two-phase token budget

## What this proves

The candidate articulation (`analysis/2026-05-05-pi-context-executive-summary-candidate.md`) claims an "always-keep-summaries" trim ordering as a load-bearing property of the pi-context injection-time budget allocator. This POC demonstrates the property mechanically with no model in the loop.

Each item in the fixture declares `summary` and `body` fields. The schema annotates both with an `x-prompt-budget` vendor extension. The allocator runs in two phases:

1. **Phase 1 — reserve summary segment.** Sum the per-item summary token estimates. If the total fits the budget, every selected item keeps its summary. If the total exceeds the budget, drop items in **reverse-priority order** (lowest priority first) until the remaining summaries fit.
2. **Phase 2 — fill body segment.** Walk surviving items in **priority order** (highest priority first); include each item's body if it fits the remaining budget; otherwise mark the body trimmed but keep the summary.

The resulting injection always names every selected item and always carries its summary. Body content degrades gracefully; items only disappear under extreme budget pressure where even summaries do not fit.

## Token estimation

A simple word-count × 1.3 heuristic, no `tiktoken` dependency. Token counts are estimates, not exact; the allocator's correctness does not depend on absolute accuracy because the same heuristic is used everywhere (allocation decisions and output verification are internally consistent).

## Wrapper-overhead deduction

The renderer emits a small file-level header line plus a per-surviving-item marker line and `S:` / `B:` label prefixes. Those bytes are not free under the heuristic — typical figures: ~30 tokens for the header, ~14 tokens per item. The allocator deducts a wrapper reserve from the caller's budget before phase 1 so the file-level token count never exceeds the cap. Because the per-item reserve depends on survivor count and survivor count depends on phase 1 trim decisions, the allocator iterates (at most twice in practice — drops only shrink survivor count, so deduction monotonically grows or holds and the fixed point is reached quickly).

Deducting wrapper overhead is the difference between an allocator that satisfies an internal accounting invariant and one that satisfies the file-level `wc -w` × 1.3 cap. The POC chose the latter so verification check 5 holds against the rendered file directly rather than against a sidecar token-accounting record.

## Files

| Path | Purpose |
|------|---------|
| `schemas/item.schema.json` | Declares `summary` + `body` fields with `x-prompt-budget` annotations |
| `data/items.json` | 10 items, summaries 50–100 tokens, bodies 200–500 tokens, priorities 1–10 |
| `render.ts` | Token estimator + two-phase allocator + markdown emitter |
| `output/budget-500.md` | Run at 500-token cap (insufficient for all summaries — phase 1 trim active) |
| `output/budget-1k.md` | Run at 1000-token cap (fits all summaries, few bodies) |
| `output/budget-3k.md` | Run at 3000-token cap (fits all summaries, most bodies) |

## Run

```bash
cd analysis/poc/pi-context-poc/C-two-phase-token-budget/
npx tsx render.ts 500
npx tsx render.ts 1000
npx tsx render.ts 3000
```

Each invocation writes one file under `output/` named per the budget.

## Expected results

| Budget | Items retained | Bodies kept | Items dropped | Phase active |
|--------|----------------|-------------|---------------|---------------|
| 500    | 5              | 0           | 5             | Phase 1 trim — even summaries do not fit; lowest-priority items dropped |
| 1000   | 10             | 1           | 0             | Phase 2 fill — all summaries kept; only highest-priority body fits |
| 3000   | 10             | 10          | 0             | Phase 2 complete — every item gets full body |

Exact `bodies kept` figure at the 1000-token cap depends on the synthetic body sizes in `data/items.json`; current data places the threshold so one body fits.

## Verification

1. All three runs exit 0.
2. `grep -c "summary kept" output/budget-3k.md` returns 10 — at 3000 tokens every item keeps its summary.
3. `grep -c "body kept" output/budget-1k.md` is less than 10 — at 1000 tokens bodies are trimmed first.
4. `grep -c "summary kept" output/budget-500.md` is less than 10 — at 500 tokens even the summary segment does not fit, so phase 1 drops lowest-priority items.
5. Total token count per output ≤ the cap, computed via the same word-count heuristic on the rendered injection content.

## Scope boundary

POC-empirical only. No `packages/` or `.project/` touches. Node builtins + JSON only — no `tiktoken`, no AJV, no third-party deps. The allocator is illustrative; production pi-context will add per-block-kind budget overrides, hierarchical reservation, and integration with the coverage-rank ranker (POC D), none of which this POC demonstrates.
