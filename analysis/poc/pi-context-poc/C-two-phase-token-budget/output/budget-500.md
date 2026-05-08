Budget cap 500; used 278 (278 summary + 0 body); retained 5, body-full 0, body-trimmed 5, dropped 5.
- ITEM-001 (p1): summary kept, body trimmed
S: Relations across typed substrate use a single closure-table format with relation_type, source_id, target_id columns. This collapses parallel edge stores into one queryable surface, enables generic walkers, and lets per-category dispatch run from the registry instead of from hardcoded conditionals scattered across the SDK.
- ITEM-002 (p2): summary kept, body trimmed
S: The injection-time allocator runs in two phases. Phase one reserves summary-segment space for every selected item; phase two fills body-segment space per priority order until the budget exhausts. This guarantees summaries survive trim pressure and body content degrades gracefully rather than items disappearing entirely.
- ITEM-003 (p3): summary kept, body trimmed
S: Non-embedding query-driven retrieval works on typed-substrate shape via coverage-rank: keyword overlap plus position weighting plus frequency, selecting a set whose union covers the query terms. No model calls, no embedding store, deterministic on identical inputs.
- ITEM-004 (p4): summary kept, body trimmed
S: Cache-coherence across the substrate uses a content_hash field per item, computed via timestamp-stripped canonicalization. On re-render, the renderer compares each item's stored content_hash to the freshly computed value; matching items emit cached annotation, mismatching items emit re-rendered annotation with the changed item id named explicitly.
- ITEM-005 (p5): summary kept, body trimmed
S: Multi-step injection cascades support three fail-stop modes for individual step failures. Skip mode drops the failed section and continues; fail mode halts the entire injection on first failure; annotate mode replaces the failed section with a diagnostic placeholder and continues. Mode is selected per invocation.
- ITEM-006: item dropped
- ITEM-007: item dropped
- ITEM-008: item dropped
- ITEM-009: item dropped
- ITEM-010: item dropped
