Following the poc-degree-zero-lens shape (self-contained `analysis/poc-<name>/` with fixture data, runnable via tsx, multi-profile where applicable, empirical mechanical proof of one architectural concept):

**A. `poc-identity-display-decoupling`** — Two-profile demo: same fixture data, two `config.json` files declaring different `display_name` + `prefix` for the same `canonical_id`. Renders both via the same SDK code. Proves: rename happens in config, no data migration. Closes the vocabulary-decision-pending question empirically. **Highest leverage** — this is pi-context's headline architectural claim.

**B. `poc-content-hash-skip-detection`** — Lift context-packet's 28-line timestamp-stripped canonicalization. Write items with `content_hash` field, mutate one, run a hypothetical cascade, show only mutated item re-renders. Proves: cache-coherence works across the substrate; makes Angle A (`before_agent_start` cascade) tractable at scale.

**C. `poc-two-phase-token-budget`** — Fixture with N items each carrying summary + body fields with `x-prompt-budget` annotations. Run the budget allocator at varying caps. Show trim behavior. Proves: always-keep-summaries semantics; operationalizes the candidate's "aggregate token budgeting" with concrete trim ordering.

**D. `poc-coverage-rank-over-typed-substrate`** — Lift context-packet's coverage-rank ranker (the 4.8KB non-embedding selection), run against a `buildIdIndex`-shaped Map. Take a query string, emit ranked id list. Proves: non-embedding query-driven retrieval works on typed-substrate shape; defers the vector-DB question by demonstrating the cheaper-tier solution.

**E. `poc-relation-type-registry`** — `config.relation_types[]` declares two entries with different `category` (`ordering`, `data_flow`). Authored edges in `relations.json` use both. Validator dispatches per category (e.g., ordering edges run topological sort + cycle detection; data_flow edges run upstream-content-hash propagation). Proves: canonical registry pattern works for relations alongside block_kinds.

**F. `poc-cascade-fail-stop`** — Assemble a multi-step injection (load N items → render via macros → apply budget → wrap in delimiters). Inject a failing step. Demonstrate three modes: skip-failed-section / fail-entire-injection / annotate-and-continue. Proves: the fail-stop semantic question has a tractable test bed; lets the user pick the default by observing each mode's output.

**G. `poc-auto-extract-with-ajv-gate`** — Synthetic session-JSONL fragment in. Run a stub classifier (no real LLM call — fake the candidate emission). AJV-validate candidates against target schemas. Show accepted vs rejected with diagnostics. Proves: the schema-strict variant of pi-memctx's auto-learn is mechanically feasible without committing to the round-trip cost; demonstrates the AJV-gate is the right ingress discipline.

**H. `poc-producer-vs-observer-status`** — Items declare optional `producer_status` (PASS/FAIL/PARTIAL). Substrate-derived `status` field separately tracks lifecycle (open/enacted/etc). Validator surfaces mismatches (e.g., `producer_status: PASS` but `status: open` is a flag). Proves: the two-status distinction adds queryable signal without changing existing lifecycle.

**I. `poc-skip-detection-end-to-end`** — Combines B + D + F. Run a cascade twice; mutate one upstream item between runs; show selective re-render. Demonstrates cache-coherence in the realistic injection path.

**Suggested first POC**: A (identity-display decoupling). It's the smallest fixture, the highest-leverage architectural claim, and directly informs whether the rename + config-driven block_kinds direction holds — same role poc-degree-zero-lens played for `config.root` relocation. The other POCs build on its config-driven substrate pattern.

Each POC is self-contained, ~50-200 lines of TS + small fixtures, runnable via `npx tsx analysis/poc-<name>/run.ts`, and intended to stay in `analysis/` as the empirical demonstration even after production code lands as fresh implementation (per the precedent set by poc-degree-zero-lens).