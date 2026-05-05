# POC H — Producer-vs-Observer Status

## What this proves

The candidate articulation (`analysis/2026-05-05-pi-context-executive-summary-candidate.md`) claims that two status signals exist on a typed item and must remain distinct:

- **Observer-derived `status`** — the substrate's lifecycle field (`open` / `enacted` / `superseded`), authored by curators or lifecycle transitions.
- **Producer-asserted `producer_status`** — the writing agent's own self-report (`PASS` / `FAIL` / `PARTIAL`), authored by whichever agent produced the work.

The two are independently authored. A validator can then surface mismatches as a derived signal — a producer claiming `PASS` while the lifecycle still reads `open` is a flag worth showing, not silently coerced into agreement.

This POC mechanically demonstrates:

1. The schema declares both fields as siblings with disjoint enums (no field can substitute for the other).
2. Five fixture items cover the relevant combinations.
3. A standalone `classifyConsistency()` rule emits one of three verdicts per item: `CONSISTENT`, `MISMATCH`, or `OBSERVER-ONLY`.
4. A markdown report renders all five items with both fields and the verdict.

## Mismatch table (expected verdicts)

| ID       | observer `status` | `producer_status` | Verdict        | Why                                                   |
|----------|-------------------|-------------------|----------------|-------------------------------------------------------|
| ITEM-001 | enacted           | PASS              | CONSISTENT     | both indicate completion                              |
| ITEM-002 | superseded        | FAIL              | CONSISTENT     | both indicate non-completion                          |
| ITEM-003 | open              | PASS              | MISMATCH       | producer claims done; lifecycle has not transitioned  |
| ITEM-004 | enacted           | FAIL              | MISMATCH       | producer claims failed; lifecycle records enactment   |
| ITEM-005 | open              | (none)            | OBSERVER-ONLY  | no producer claim filed                               |

## How to run

```
cd analysis/poc/pi-context-poc/H-producer-vs-observer-status
npx tsx render.ts
```

Writes `output/mismatch-report.md`. Console echoes the per-item verdict.

## Verification

```
# 1. Run exits 0
npx tsx render.ts; echo "exit=$?"

# 2. MISMATCH count = 2
grep -c "MISMATCH" output/mismatch-report.md

# 3. CONSISTENT count = 2
grep -c "CONSISTENT" output/mismatch-report.md

# 4. OBSERVER-ONLY count = 1
grep -c "OBSERVER-ONLY" output/mismatch-report.md
```

The grep counts match the per-item verdict tallies because the renderer confines each verdict literal (`CONSISTENT`, `MISMATCH`, `OBSERVER-ONLY`) to the table column. The rationale section omits the verdict prefix, and the summary section uses lowercase `verdict_*` labels. If the renderer is restructured to repeat the verdict words elsewhere, the literal grep counts will diverge from the per-item counts — recount and reconcile before treating that as a failure.

## Scope boundary

- Validates one rule (status-consistency) over five fixture items.
- Does not enforce the rule at write time.
- Does not file issues for mismatches.
- Does not model the curator workflow that resolves a flagged mismatch.
- Schema is documentary; AJV-at-write is upstream production-layer concern (F-006).

## Files

- `schemas/item.schema.json` — declares both status fields as siblings with disjoint enums.
- `data/items.json` — five fixture items covering all relevant combinations.
- `render.ts` — loads items, classifies each via `classifyConsistency()`, writes the report.
- `output/mismatch-report.md` — generated report (table + per-item rationale + tallies).
