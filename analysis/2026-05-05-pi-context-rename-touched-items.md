Open items in `.project/` blocks touched by the persisted MD:

**`.project/framework-gaps.json`** (open):
- **FGAP-006** (schema versioning / evolution / `$ref` composition; explicit "schema rename or field rename has no backward-compatibility path") — directly load-bearing for the npm rename ceremony the MD proposes.
- **FGAP-008** (mandates as typed block under substrate contract) — pi-context as substrate package matches the framing; mandates become typed-substrate consumers.
- **FGAP-009** (monitor specs as typed blocks) — same; monitor specs become typed-substrate consumers under the rename.
- **FGAP-011** (no canonical schema-write surface; schemas mutated via direct Edit, F-006 parallel ungated path) — schema-write surface absorption is in scope of pi-context's substrate-and-validated-writing claim.
- **FGAP-013** (status vocabulary registry hardcoded in TS, not user-extensible) — vocabulary-decoupling architecture in pi-context structurally closes this.
- **FGAP-003** (materialized views over scoped blocks) — indirect; lens projections via `config.block_kinds[]` are the framework's view-block analog.
- **FGAP-010** (applicability predicate language) — tangential; lens config could carry applicability predicates.
- **FGAP-014** (render-time pagination) — Angle D (aggregate budgeting) addresses scoping.

**`.project/issues.json`** (open):
- **issue-020** (contextBlocks injection reads static files only — no computed blocks at dispatch time) — Angle B (coverage-rank query-driven selection) addresses this.
- **issue-028** (agent steps should declare block write-back targets — memory accumulates as side effect) — Angle C (auto-extract pipeline) directly addresses; AJV-gate routing through block-api single-ingress matches.
- **issue-038** (monitor spec validator) — tangential; cleaner substrate clarifies what `validateMonitor()` would consume.
- **issue-042** (scoped/filtered contextBlocks reads — agents cannot request subsets) — Angle B addresses subset-by-query.
- **issue-045** (framework-level anti-injection wrapping not systematically applied to contextBlocks) — Angle A (cascade injection) explicitly invokes the canonical anti-injection delimiters; closes when injection becomes the canonical entry point.
- **issue-046** (step-loop.ts:187 compileAgentSpec without cwd — loop steps never receive contextBlocks) — not directly touched but related to making contextBlocks reachable from more entry points.
- **issue-074** (seedExamples short-circuit) — relevant if rename re-touches install/seed semantics; otherwise historical.
- **issue-089** (PLAN- prefix collision) — vocabulary-decoupling closes structurally per the MD's "config.block_kinds drives the prefix→block table" claim.

**`.project/decisions.json`** — zero open. The rename itself would need a new DEC entry (DEC-0013 territory), not yet filed.

**`.project/spec-reviews.json`** — REVIEW-001 (jit-agents-spec) is open; touches because spec surfaces (renderer registry, dispatch-inline, markers) currently live across pi-jit-agents + pi-workflows + pi-project — rename pulls on that boundary question.

**`.project/features.json`** — FEAT-001 (consumer migration arc) — touches because macros migration from pi-workflows to pi-context is consolidation work in this arc; pi-jit-agents consolidation similarly.

**`.project/layer-plans.json`** — PLAN-001 + L1-L5 + PHASE-1..7 — not directly touched (Muni layer model migrates independently of rename), but the layer-plans block itself is the original canonical-vocabulary alongside the proposed `config.layers[]` registry.

**Memory (HANDOFF.md, not in a block)**:
- "Vocabulary decision pending" — directly touched. MD claims the rename to pi-context plus config-driven block_kinds makes the deferred ADR/FGAP rename cascade structurally cheap (display-only edits).

**Audit findings from `2026-05-05-pm-vocabulary-prior-art-survey.md`'s sibling audit (4 undeclared prefixes, 2 drift cases, 3 structural fragilities)** — none yet filed as canonical issues; vocabulary-decoupling closes the prefix subset structurally per the MD.