# POC B — content-hash skip-detection

Empirical demonstration that cache-coherence across the pi-context substrate is
mechanically achievable with a 28-line canonicalizer + SHA-256 wrapper. Lifts
the pattern from `gsd-build/context-packet` (`src/hasher.ts`, MIT) per
`analysis/2026-05-06-context-packet-comparison.md` §"Pattern 2".

## What this proves

- Items carry a `content_hash` field computed via timestamp-stripped
  canonicalization (recursive sorted-keys JSON → SHA-256).
- Mutating one item's body changes only that item's hash; byte-identical
  items across rounds produce byte-identical hashes.
- A second-round render that consults the prior round's cached hashes can
  cleanly discriminate "skip — content unchanged" from "re-render — content
  mutated", per item.
- No external deps. `node:crypto` only.

## How to run

From the repo root:

```bash
# round 1: writes output/round1.md, populates output/.cache-hashes.json
npx tsx analysis/poc/pi-context-poc/B-content-hash-skip-detection/render.ts

# round 2: writes output/round2.md, comparing per-item hashes against the cache
npx tsx analysis/poc/pi-context-poc/B-content-hash-skip-detection/render.ts r2
```

Run round 1 first; round 2 reads the cache that round 1 writes.

Profile-resolution mirrors POC A: `process.argv[2]` selects fixture round.
Default (no argv) = round 1.

## Files

- `hash.ts` — 28-line canonicalizer (`canonicalize`, `stripForHash`,
  `computeContentHash`). `stripForHash` removes `created_at` and the prior
  `content_hash` field before hashing so logically-equal items at different
  times produce identical hashes.
- `data/items-r1.json` — 5 items with computed `content_hash` field.
- `data/items-r2.json` — same 5 items; `ITEM-003.body` is mutated; only its
  `content_hash` is recomputed. Other 4 items are byte-identical to r1.
- `render.ts` — loads round + cache, classifies each item as rendered/cached/
  re-rendered, writes markdown output, updates cache.
- `output/round1.md` — first-render output (5 items "rendered", no prior cache).
- `output/round2.md` — re-render output (4 "cached", 1 "re-rendered" naming
  ITEM-003).
- `output/.cache-hashes.json` — per-id cached content_hash map; written by
  every run, consumed by the next.

## Verification

After running both rounds:

```bash
cd /Users/david/Projects/workflowsPiExtension

# 1. Both invocations exit 0
npx tsx analysis/poc/pi-context-poc/B-content-hash-skip-detection/render.ts; echo "r1 exit=$?"
npx tsx analysis/poc/pi-context-poc/B-content-hash-skip-detection/render.ts r2; echo "r2 exit=$?"

# 2. Round 2 has 4 cached items
grep -c "cached" analysis/poc/pi-context-poc/B-content-hash-skip-detection/output/round2.md  # → 4

# 3. Round 2 has 1 re-rendered item
grep -c "re-rendered" analysis/poc/pi-context-poc/B-content-hash-skip-detection/output/round2.md  # → 1

# 4. The re-rendered line names the mutated item id
grep "re-rendered" analysis/poc/pi-context-poc/B-content-hash-skip-detection/output/round2.md  # → mentions ITEM-003

# 5. content_hash values for unmutated items are byte-identical between r1 and r2
diff <(jq -r '.items[].content_hash' analysis/poc/pi-context-poc/B-content-hash-skip-detection/data/items-r1.json) \
     <(jq -r '.items[].content_hash' analysis/poc/pi-context-poc/B-content-hash-skip-detection/data/items-r2.json)
# → exactly one differing line (ITEM-003 row, position 3)
```

## Scope boundary

- No `packages/` touches; no `.project/` touches; no commits.
- POC stays empirical-only. Production integration of `content_hash` into
  pi-project's block-API ingress is a separate decision/work-unit.
- Cache storage form (sidecar JSON map vs embedded per-item `content_hash`
  field on disk) is a downstream design choice. This POC uses both: per-item
  field on disk in the fixture (forensic readability) and a separate cache
  map written by the renderer (simulates per-render-round cache).
- No tokenizer, no budget, no projection. POC C handles two-phase budget;
  POC I composes B + D + F end-to-end.
- POC G is the only POC with a third-party dep (AJV); POC B is node-builtins-only.
