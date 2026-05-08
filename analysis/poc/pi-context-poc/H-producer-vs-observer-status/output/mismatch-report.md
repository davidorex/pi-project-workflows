# POC H — Producer-vs-Observer Status Mismatch Report

Each row pairs the observer-derived lifecycle (`status`) against the
producer-asserted self-report (`producer_status`). The verdict column
is derived by `classifyConsistency()` in `render.ts`.

| ID | Title | observer status | producer_status | Verdict |
|----|-------|------------------|-----------------|---------|
| ITEM-001 | Producer claims PASS, observer sees enacted | enacted | PASS | CONSISTENT |
| ITEM-002 | Producer claims FAIL, observer sees superseded | superseded | FAIL | CONSISTENT |
| ITEM-003 | Producer claims PASS, observer sees open | open | PASS | MISMATCH |
| ITEM-004 | Producer claims FAIL, observer sees enacted | enacted | FAIL | MISMATCH |
| ITEM-005 | Observer-only entry, no producer claim | open | (none) | OBSERVER-ONLY |

## Per-item rationale

- **ITEM-001** — producer PASS aligns with observer enacted (both indicate completion)
- **ITEM-002** — producer FAIL aligns with observer superseded (both indicate non-completion)
- **ITEM-003** — producer claims PASS while observer lifecycle is still 'open' — work asserted complete but not yet enacted
- **ITEM-004** — producer claims FAIL while observer lifecycle records 'enacted' — work asserted failed but lifecycle disagrees
- **ITEM-005** — no producer_status filed; observer status is 'open'

## Summary

- verdict_consistent: 2
- verdict_mismatch: 2
- verdict_observer_only: 1
- total items: 5