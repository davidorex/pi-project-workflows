# POC D — Coverage-rank ranker over typed substrate

## What this proves

Non-embedding query-driven retrieval works mechanically over the typed-substrate item shape (id + kind + title + body). The ranker is lifted in shape from `gsd-build/context-packet`'s retrieval pattern as documented in `analysis/2026-05-06-context-packet-comparison.md` (§3 reusable patterns enumeration), then adapted to perform **set-covering selection rather than naive top-k similarity**: items that contribute new query-keyword coverage rank above items that merely repeat already-covered keywords. The signal triplet (keyword-hit count, position-weighted score, frequency score) is exposed per-item so callers can audit ranking decisions.

POC scope is the ranker mechanism. Production pi-context's `buildIdIndex` walks `.project/*.json` per `block_kinds[]`; here the equivalent is a single fixture-file load. POC A (identity-display decoupling) demonstrates the multi-block id-index shape.

## Files

- `coverage-rank.ts` — the ranker (~135 lines)
- `data/items.json` — 15 mixed-kind items: 3 DEC-, 3 FEAT-, 3 R-, 3 FGAP-, 3 issue-. Topic clusters: testing, performance, scheduling, naming, security
- `render.ts` — driver: builds id index, runs ranker against one of three preset queries, emits ranked markdown report
- `output/query-testing.md` — query "testing strategy"
- `output/query-performance.md` — query "performance optimization"
- `output/query-naming.md` — query "naming conventions"

## How to run

```bash
cd analysis/poc/pi-context-poc/D-coverage-rank
npx tsx render.ts testing
npx tsx render.ts performance
npx tsx render.ts naming
```

Each invocation writes one report under `output/`.

## Expected results

| Query | Expected top-3 (by id) | Reason |
|-------|------------------------|--------|
| `testing strategy` | DEC-0101, R-0301, issue-0501 | DEC-0101 has both keywords in title/body; R-0301 covers testing libraries with strategy mention; issue-0501 covers test-suite reliability |
| `performance optimization` | FEAT-0203, FEAT-0201, R-0302 / FGAP-0403 | FEAT-0203 has both keywords in body; FEAT-0201 has performance throughout; R-0302 / FGAP-0403 cover performance |
| `naming conventions` | DEC-0102, FGAP-0401, issue-0502 | DEC-0102 has both keywords; FGAP-0401 names the gap; issue-0502 is a naming-collision issue |

The expected sets allow for some tied-score rearrangement at ranks 3-5; the verification is set membership of top-3 against the expected cluster, not exact ordinal match.

## Verification

Per plan §POC D §Verification:

1. **All three queries exit 0** — `for q in testing performance naming; do npx tsx render.ts $q || exit 1; done`
2. **Each query output ranks items most-relevant-first** — ranked markdown table in each output file orders rows by selection sequence (set-covering with score tiebreak).
3. **Top-3 items per query are semantically consistent with the query** — manual inspection per the expected-results table above.
4. **Coverage signal includes keyword-hit count, position-weighted score, total rank score** — each row of the ranked table emits all three; the per-item breakdown section emits them named.
5. **No third-party deps in render.ts or coverage-rank.ts** — `grep "import" *.ts | grep -v "node:" | grep -v "\\./"` returns empty.

## Scope boundary

- Does NOT touch `packages/`, `.project/`, or any other path outside `analysis/poc/pi-context-poc/D-coverage-rank/`.
- Does NOT install dependencies. Node builtins + JSON only.
- Does NOT commit or push.
- Single-file id index is intentional: cross-block id-index resolution is POC A's surface; this POC's surface is the ranker.
- Token budget allocation is POC C's surface. Here ranked output is unbounded; production callers would slice top-k.
- Content-hash skip-detection is POC B's surface. Re-running this POC always re-renders.

## Articulation context

The candidate articulation at `analysis/2026-05-05-pi-context-executive-summary-candidate.md` (Retrieval section) names coverage-rank as the non-embedding retrieval primitive. This POC mechanically demonstrates the algorithm shape on typed-substrate items, with set-covering selection chosen over top-k similarity to bias toward query-keyword coverage breadth rather than ranking dominance by a single high-frequency match.
