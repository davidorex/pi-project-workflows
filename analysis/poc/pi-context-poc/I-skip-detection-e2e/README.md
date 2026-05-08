# POC I — skip-detection end-to-end

Empirically demonstrates the cache-coherence claim from
`analysis/2026-05-05-pi-context-executive-summary-candidate.md` in a realistic
multi-stage injection pipeline rather than as an isolated mechanism. Combines
three previously-isolated POC primitives into one cascade and shows that
selective re-rendering follows the upstream content-hash signal: items whose
hash is unchanged from the prior round are cache hits ("cached"); the single
mutated item is re-rendered.

## Multi-POC integration

| Primitive | Source POC | File |
|-----------|------------|------|
| Content-hash skip-detection | POC B | `hash.ts` (byte-identical copy) |
| Coverage-rank ranker | POC D | `coverage-rank.ts` (byte-identical copy) |
| Cascade fail-stop pipeline (skip-mode default) | POC F | `cascade.ts` (byte-identical copy) |

Per the precedent's self-containment discipline (see plan §"Precedent"), the
three helper modules are duplicated into this POC directory rather than
imported from sibling POC dirs. Verify with:

```
diff hash.ts ../B-content-hash-skip-detection/hash.ts
diff coverage-rank.ts ../D-coverage-rank/coverage-rank.ts
diff cascade.ts ../F-cascade-fail-stop/cascade.ts
```

All three diffs return empty.

## Pipeline per round

1. Load `data/items-rN.json` (8 items, each carrying a `content_hash` field
   computed via the POC B canonicalizer).
2. Run `coverageRank()` (POC D) against the fixed query `"testing strategy"`.
3. Take the top-k (k=4) ranked items as the selected injection set.
4. Run the cascade (POC F primitives `renderItem` → `applyBudget` →
   `wrapDelimiters`) over the selected set in skip-mode. No items in the
   fixture trigger render failure, so the skip-mode contract is exercised but
   no items are dropped here.
5. For each selected item, compare its current `content_hash` against the
   cached value (loaded from `output/.cache-hashes.json`); annotate verdict
   `rendered` (no cache entry — first run), `cached` (hash matches), or
   `re-rendered` (hash differs).
6. Emit final markdown injection at `output/rN-injection.md` and update the
   shared cache file with the round's hashes.

## Query and stable top-k

The query `"testing strategy"` was chosen so the top-k id set is stable across
rounds. All four selected items (`ITEM-001`, `ITEM-002`, `ITEM-003`,
`ITEM-007`) carry strong "testing" + "strategy" coverage in title and body;
`ITEM-005` ranks fifth and `ITEM-004`/`ITEM-006`/`ITEM-008` fall outside the
keyword-hit candidate pool entirely. The mutation between rounds is confined
to a single sentence in `ITEM-003`'s body that contains neither "testing" nor
"strategy", so the keyword-hit count and position-weighted score for
`ITEM-003` are byte-identical across rounds and rank ordering does not shift.

## Mutation between rounds

Round 2's `data/items-r2.json` is byte-identical to round 1's `items-r1.json`
except for `ITEM-003`'s body, which replaces the sentence
`"Reviewed against the canonical schema rules."` with
`"Updated 2026-05-04 to reflect the canonical schema rules audit refresh."`.
The mutation:

- Does not contain "testing" or "strategy" (preserves rank stability)
- Changes content semantically (recomputed `content_hash` differs from r1's)
- Is the ONLY divergence between r1 and r2 fixtures (other 7 items'
  `content_hash` values are byte-identical across rounds)

## Run

```
npx tsx render.ts        # round 1, default profile, writes output/r1-injection.md
npx tsx render.ts r2     # round 2, writes output/r2-injection.md
```

Round 1 must run first to populate the cache file; round 2 reads it.

## Verification

Plan §"POC I" §"Verification" mandates five checks:

1. Both runs exit 0.
2. Same query returns same top-k id set across r1 and r2 (verifies coverage-rank
   stability when mutations do not shift rank).
3. `grep -c "cached" output/r2-injection.md` is greater than 0 (cache hits
   observed in round 2).
4. `grep -c "re-rendered" output/r2-injection.md` returns exactly 1 (one
   mutated item, one re-render verdict).
5. The "re-rendered" item id matches the mutated item's id (`ITEM-003`).

The render module emits verdict words (`rendered`/`cached`/`re-rendered`)
exclusively in the per-item annotation block. The summary table uses
`HIT`/`MISS`/`NEW` labels in its Cache column to avoid substring collisions on
the verdict-word grep counts.

## Scope boundary

This POC stays empirical-only. No `packages/` touches, no `.project/`
mutations, no installations beyond `tsx`. Intentional non-goals:

- Real LLM dispatch — the cascade renders to plain markdown bullets only.
- Production-shape `buildIdIndex` — fixture is a single JSON file, not a
  multi-block walk over `.project/`.
- Persistent-cache invalidation policy — the cache is overwritten on every
  run; production would need TTL + integrity rules out of scope here.
- Cross-cascade-mode behavior — only skip-mode is exercised. POC F covers all
  three modes in isolation; combining mode-switching with skip-detection is
  scope creep.
