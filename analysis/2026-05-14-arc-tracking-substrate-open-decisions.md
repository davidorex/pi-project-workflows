Grounded against current monorepo state at HEAD `93a997f`:

**1. Block-kind set.** `.project/schemas/` is missing `config.schema.json` + `relations.schema.json` + `roadmap.schema.json` (verified via `ls .project/schemas/`). pi-context/registry/schemas/ holds all three plus `bootstrap.schema.json`, `plan.schema.json`, `priority.schema.json`, `severity.schema.json`, `source.schema.json`, `status.schema.json`, `verification-method.schema.json`, `layer.schema.json`, `context-contracts.schema.json`. `phase.schema.json` and `context-contracts.schema.json` ARE in `.project/schemas/`. So authoring config.json + relations.json + roadmap.json requires installing schemas first (registry → `.project/schemas/`). Decision is therefore: install which schemas now, author which instances now.

**2. Arc scope.** `.project/tasks.json` carries TASK-021..041 (FGAP-026 closure arc). Claude Code Tasks #2..#20 (pre-FGAP-026 pi-extension build, all completed) have no TASK-NNN substrate mirror — pi-extension build was tracked in Claude Code Task tool only. `.project/phases/{1..4}.json` carry content from that pre-FGAP-026 build with status="planned" never closed. Decision: roadmap covers (a) FGAP-026 closure arc only, (b) full project history including pre-FGAP-026 pi-extension build with retroactive status reconciliation, or (c) FGAP-026 arc + future arcs only.

**3. Dogfood depth.** Phase 2 query primitives (filter / walk-ancestors / find-references) and Phase 3 gatherExecutionContext currently runtime-demo only against per-test fixtures (per DEC-0021 fixture-cascade pattern). CTX-001..003 in `.project/context-contracts.json` carry `bundle_relation_types: []` — empty contracts return unit-only bundles. Decision: minimum-viable (just enough to bind one runtime demo of gatherExecutionContext against real TASK-025 substrate) vs comprehensive (config.relation_types + relations.json edges + populated contracts + roadmap + phases sufficient for harness-confined LLM in Phase 6+ to query meaningfully).

**4. ID conventions.** Three styles in code:
- `packages/pi-context/src/roadmap-plan.test.ts` uses `PHASE-A`, `PHASE-B`, `PHASE-C`, `PHASE-D` (letter-suffix).
- LLM-filed commit body `f3d6e41` + TASK-025 acceptance_criteria use `PHASE-006..010` (numeric-suffix zero-padded).
- `phase.schema.json` discriminator is `number: integer`; file-per-phase at `.project/phases/{number}.json`.

roadmap.schema.json pattern `^PHASE-[A-Z0-9-]+$` permits any suffix. No DEC binds suffix style or PHASE-NNN↔number binding. Decision: suffix convention + integer-↔-string binding convention.

**5. FK-as-field migration.** Every TASK-021..041 in `.project/tasks.json` carries `phase: "8.7.N"` inline (free-text label, not a PHASE-NNN reference). TASK-031, 033, 034, 035, 036, 037, 038, 039, 040, 041 also carry inline `depends_on: ["TASK-NNN"]` arrays. DEC-0013 (enacted): closure-table is canonical primitive for ALL inter-item relationships; FK-as-field forbidden. FGAP-040 + FGAP-046 file these violations. Decision: migrate now (remove inline fields, write equivalent relations.json edges with new relation_types) — DEC-0013's "ALL" leaves no partial path.

**6. Pre-existing `.project/phases/{1..4}.json`.** Last touched at `190f648` (pre-FGAP-026). Content: phase 1 "Make typed composition real" (agent-input-schema enforcement, template inheritance), phase 2 onward (not yet read). Status="planned" never closed. Some content describes work shipped in pi-jit-agents (typed composition / inputSchema enforcement) — status didn't track shipping. `number=1..4` slots collide with any FGAP-026 phase numbering starting low. Decision: retroactively close them as completed-where-shipped + open-where-not, archive entirely, or repurpose slots.

**7. `config.lenses[]` content.** `roadmap.phases[].lens` is required-field. `packages/pi-context/src/lens-view.ts` registers lens-validator dispatch; `roadmap-plan.ts groupByLens` projects items per lens spec (kind: target | composition). No lens declarations exist for THIS repo. Decision: which lenses to declare. Candidates surfaced by current substrate shape: tasks-by-phase (group TASK-NNN), decisions-by-status, fgaps-by-status, verifications-by-target.

**8. Sequencing.** User msg b9732e3a says "arc-tracking blocks authored mid-arc as dogfood substrate" + msg fb1fc662 says migration "last". This grounds order: Phase 5 (mid-arc) → Phases 6/7/8/9 → Phase 10 (migration last). Sequencing is user-anchored at coarse level; no decision needed beyond the three explicit anchor points.

Item 8 is grounded; items 1-7 are the open decisions.