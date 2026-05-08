# Coverage-rank query: "testing strategy"

**Query slug:** `query-testing`  
**Items scored (with at least one keyword hit):** 3

Ranked most-relevant-first by set-covering selection: each row's
`new coverage` column shows which query keywords this item adds
that no higher-ranked item already covered.

| Rank | ID | Kind | Title | Hits | Pos | Freq | Total | New coverage |
|------|----|----|-------|------|-----|------|-------|--------------|
| 1 | DEC-0101 | decision | Adopt vitest for unit testing strategy | 7 | 6 | 7 | 27 | testing, strategy |
| 2 | R-0301 | research | Survey of property-based testing libraries | 5 | 5 | 5 | 23 | — |
| 3 | issue-0501 | issue | Test suite intermittently fails on Node 23 macOS | 3 | 3 | 3 | 17 | — |

## Coverage signals (top 5)

### 1. DEC-0101 — Adopt vitest for unit testing strategy

- **kind:** `decision`
- **keyword-hit count:** 7
- **position-weighted score:** 6
- **frequency score:** 7
- **total rank score:** 27
- **unique keywords matched:** testing, strategy
- **new coverage contributed at this rank:** testing, strategy

### 2. R-0301 — Survey of property-based testing libraries

- **kind:** `research`
- **keyword-hit count:** 5
- **position-weighted score:** 5
- **frequency score:** 5
- **total rank score:** 23
- **unique keywords matched:** testing, strategy
- **new coverage contributed at this rank:** (none — already covered above)

### 3. issue-0501 — Test suite intermittently fails on Node 23 macOS

- **kind:** `issue`
- **keyword-hit count:** 3
- **position-weighted score:** 3
- **frequency score:** 3
- **total rank score:** 17
- **unique keywords matched:** testing, strategy
- **new coverage contributed at this rank:** (none — already covered above)
