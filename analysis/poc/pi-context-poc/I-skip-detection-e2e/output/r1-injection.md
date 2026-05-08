# POC I output — round-1

**fixture:** `data/items-r1.json`  
**total items in fixture:** 8  
**query:** `testing strategy`  
**top-k:** 4  
**ranker keyword-hit candidates:** 5  
**cascade mode:** skip (POC F default)  
**cascade failures:** 0

## selected top-k items (rank order)

| Rank | ID | Total Score | Hits | Cache | Stored Hash | Cached Hash |
|------|----|-------------|------|-------|-------------|-------------|
| 1 | ITEM-002 | 28 | 8 | NEW | 6e1b32cd7776… | (none) |
| 2 | ITEM-003 | 28 | 8 | NEW | 5570eafe8753… | (none) |
| 3 | ITEM-001 | 27 | 7 | NEW | d53c35597028… | (none) |
| 4 | ITEM-007 | 27 | 7 | NEW | 6363cd7b9d7d… | (none) |

## per-item annotations (skip-detection verdicts)

- ITEM-002: rendered (first run, hash 6e1b32cd7776…)
- ITEM-003: rendered (first run, hash 5570eafe8753…)
- ITEM-001: rendered (first run, hash d53c35597028…)
- ITEM-007: rendered (first run, hash 6363cd7b9d7d…)

## injected context (wrapped block delivered to agent)

<<<INJECTED_CONTEXT>>>
- ITEM-002 — Property-based testing complements example testing strategy: Property-based testing layered on top of the example-based testing strategy. fast-check binding for vitest enables invariant assertions. Strategy prefers property tests for pure functions and example tests for IO-bound surfaces. Testing coverage rises measurably.
- ITEM-003 — Testing strategy for fixture-based regression coverage: Testing strategy mandates fixture-based regression coverage for every public surface. The testing harness loads fixtures from data/ uniformly. Strategy keeps fixture scope tight: one testing fixture per behavior. Strategy review enforced at audit time. Reviewed against the canonical schema rules.
- ITEM-001 — Adopt vitest as canonical testing strategy: Selected vitest as the unified testing strategy across all packages. Testing scope covers unit, integration, and snapshot tests. Strategy emphasizes fast feedback and TypeScript-native execution. Replaces ad-hoc testing patterns with one uniform framework.
- ITEM-007 — Testing strategy review under coverage gate: Reviewed the testing strategy against the coverage-gate proposal. Strategy retains 80% line coverage as the minimum bar; testing branches that fall below the threshold trigger CI failure. Strategy review enacted per the conformance audit.
<<<END_INJECTED_CONTEXT>>>
