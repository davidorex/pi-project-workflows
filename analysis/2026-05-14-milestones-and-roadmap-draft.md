# Milestones + Roadmap — first draft from substrate + analysis + dialogue

Drafted 2026-05-14 from current `.project/` substrate state, analysis/ files, and 2026-05-13 → 2026-05-14 dialogue. By-hand-fileable as initial substrate; shape feedback sharpens config.json authoring.

## Source materials

- `.project/decisions.json` — DEC-0001..0025 (3 open / 22 enacted / 0 superseded)
- `.project/framework-gaps.json` — FGAP-001..059 (~30 closed / ~29 identified)
- `.project/tasks.json` — TASK-001..042 (active: TASK-042; FGAP-026 arc TASK-021..030)
- `.project/features.json` — FEAT-001 (consumer migration arc)
- `.project/verification.json` — VER-001..015 (Phase 1-4 evidence)
- `.project/research.json` — R-0001..0011
- `.project/layer-plans.json` — PLAN-001 (Muni L1-L5 restructure)
- analysis/2026-04-15 process-articulation + blocks-as-prompt-substrate + runtime-step-context
- analysis/2026-05-01 substrate-arc-distillation + ceremony-ideas + blocks-schemas-macros-contract-synthesis
- analysis/2026-05-10 fgap-026-closure-sub-phase-structure + tool-surface-gap-audit
- analysis/2026-05-14 step-1-config-draft + step-2-resolution-patterns + arc-tracking-substrate-decision-sharpening + pm-vocabulary-survey-full-analysis + substrate-filing-precedents
- 2026-05-14 dialogue — vocabulary settlement direction; milestones-as-anchor model; roadmap thinning

---

## Milestones

### MILESTONE-001 — Substrate canon principles enacted in code

```yaml
id: MILESTONE-001
name: Substrate canon principles enacted in code
status: active
description: |
  DEC-0013 (closure-table canonical primitive) + DEC-0014 (harness-confined main LLM) +
  DEC-0015 (substrate location is config-driven) + DEC-0017 (work-unit context composition)
  are not just enacted-as-decisions but enforced-in-source: no .project/ hardcodes anywhere
  in pi-context / pi-jit-agents / pi-workflows / pi-behavior-monitors; resolveContextDir
  hard-throws on absent bootstrap pointer; F-006 bypass pattern eliminated; closure-table
  edges canonical for all inter-item relationships.
criterion: |
  All FGAP-026 arc Phases 1..10 (Steps 8.7.1..8.7.10) close; substrate canon DECs are
  source-enforced; main LLM in pi-runtime cannot bash/read/write/edit; .project/ literal
  appears nowhere except .pi-context.json bootstrap pointer + canonical migration script.
evidence_block: verification
evidence_query:
  - target_in: [TASK-021, TASK-022, TASK-023, TASK-024, TASK-025, TASK-026, TASK-027, TASK-028, TASK-029, TASK-030]
  - status: passed
related_decisions: [DEC-0013, DEC-0014, DEC-0015, DEC-0017, DEC-0021]
related_gaps: [FGAP-026, FGAP-028, FGAP-035, FGAP-036, FGAP-038, FGAP-039]
canonical_vocabulary: substrate-canon-source-enforcement, harness-confined-LLM, config-driven-substrate-dir
```

### MILESTONE-002 — Vocabulary settlement complete

```yaml
id: MILESTONE-002
name: Vocabulary settlement complete
status: active
description: |
  All vocabulary surfaces (block-kind display names; ID prefix conventions; relation_type
  canonical_ids; lens IDs; layer registry; status-bucket mapping; phase block-kind binding;
  conventions schema relational completeness) settled via DEC entries enacted at user
  direction. config.json authorable end-to-end without improvisation. Drift items
  (FGAP-048 / FGAP-049 / FGAP-050 / FGAP-051) addressed via DEC enacted + migration plan
  or canon-going-forward declaration.
criterion: |
  TASK-042 closes; FGAP-047 closes; config.json authored with all block_kinds[] +
  relation_types[] + lenses[] + layers[] + status_buckets[] entries referencing settled DEC canon;
  no improvised vocabulary remains in any block instance.
evidence_block: verification
evidence_query:
  - target: TASK-042
  - status: passed
related_decisions: [DEC-0022, DEC-0023]
related_gaps: [FGAP-016, FGAP-021, FGAP-047, FGAP-048, FGAP-049, FGAP-050, FGAP-051, FGAP-052]
canonical_vocabulary: vocabulary-settlement, config-canon-completeness
```

### MILESTONE-003 — Milestone-as-anchor model enacted in framework

```yaml
id: MILESTONE-003
name: Milestone-as-anchor model enacted in framework
status: planned
description: |
  Per DEC-0024, milestones are the primary declarative-organizing anchor. Framework
  delivers milestone block-kind elevation (FGAP-053): MILESTONE-NNN top-level + queryable
  via filter-block-items / walk-ancestors / find-references. CTX-NNN context-contract for
  unit_kind=milestone authored (FGAP-054); gatherExecutionContext --unit-id MILESTONE-NNN
  returns substantive bundle (research + decisions + framework-gaps + features + phases +
  verifications cascade). Roadmap shape thins post-elevation (FGAP-055) to {id, title,
  description, status} + relations.json edges + lens spec.
criterion: |
  FGAP-053 + FGAP-054 + FGAP-055 close; milestone schema installed in .project/schemas/;
  milestones.json instance authored; CTX-NNN for unit_kind=milestone populated;
  gatherExecutionContext on MILESTONE-NNN returns non-degenerate bundle; roadmap.schema.json
  migrated; relations.json carries roadmap_contains_milestone + phase_culminates_at_milestone
  + milestone_depends_on edges.
evidence_block: verification
evidence_query:
  - related_gaps_includes: [FGAP-053, FGAP-054, FGAP-055]
  - status: passed
related_decisions: [DEC-0024]
related_gaps: [FGAP-053, FGAP-054, FGAP-055]
canonical_vocabulary: milestone-as-anchor, milestone-elevation, milestone-context-contract, roadmap-thinning
```

### MILESTONE-004 — Harness-confined LLM dogfood-dispatch dry-run passes

```yaml
id: MILESTONE-004
name: Harness-confined LLM dogfood-dispatch dry-run passes
status: planned
description: |
  FGAP-028 closure: pi-runtime main LLM, restricted to pi-context's tool surface (no
  bash/read/write/edit), can author substrate items + query existing substrate + dispatch
  workflows + handle the seventeen agent roles per analysis/2026-04-15-runtime-step-context.md
  without falling back to forbidden tools. Tool-discovery surface (FGAP-044) shipped so
  the harness-confined LLM can introspect available tools without external documentation.
criterion: |
  Run FGAP-028 dry-run protocol; main LLM completes a substrate authoring + query +
  workflow-dispatch + monitor-classification cycle entirely through pi-context tool surface;
  no bash/read/write/edit tool calls; all writes route through DispatchContext-stamped
  block-api primitives; verdict logged.
evidence_block: verification
evidence_query:
  - target: TASK-030
  - status: passed
related_decisions: [DEC-0014, DEC-0017]
related_gaps: [FGAP-028, FGAP-044]
canonical_vocabulary: harness-confined-dispatch-dry-run, dogfood-completeness
```

### MILESTONE-005 — Vocabulary-neutral substrate canon delivered

```yaml
id: MILESTONE-005
name: Vocabulary-neutral substrate canon delivered
status: planned
description: |
  Per DEC-0025, pi-context substrate canon must operate on canonical_id-keyed registries
  derived purely from loaded config + schemas + macros — no built-in vocabulary commitments
  in source. Built-in defaults under packages/pi-context/registry/ remain as user-OPTIONAL
  shipped examples; user with wholly-different substrate conception (initiatives / OKRs /
  experiments / hypotheses / etc.) bootstraps + operates without modifying pi-context source.
  Memory shape arises from user/LLM use, not from hardcoded canon.
criterion: |
  PROJECT_BLOCK_TYPES const removed from project-sdk.ts (FGAP-056); macro library bootstrap
  surface lands for user-added kinds with documented authoring + auto-discovery + fallback
  render (FGAP-057); universalization integration test exercises pi-context against a fully-
  different substrate vocabulary end-to-end (FGAP-058) — block-api / lens / closure-table /
  query primitives / execution-context all operate vocabulary-neutrally; runtime layer-aware
  + lens-validator config-registration land (FGAP-052); 'bring-your-own-substrate' workflow
  documented in CLAUDE.md + skill-narratives + README.
evidence_block: verification
evidence_query:
  - related_gaps_includes: [FGAP-052, FGAP-056, FGAP-057, FGAP-058]
  - status: passed
related_decisions: [DEC-0025]
related_gaps: [FGAP-052, FGAP-056, FGAP-057, FGAP-058]
canonical_vocabulary: vocabulary-neutral-substrate, bring-your-own-substrate, universalization-evidence
```

### MILESTONE-006 — pi-context v1.0.0 publishable

```yaml
id: MILESTONE-006
name: pi-context v1.0.0 publishable
status: planned
description: |
  All 4 packages (pi-context / pi-jit-agents / pi-workflows / pi-behavior-monitors) green
  on Node 22+23 CI; lockstep version 1.0.0 ready; substrate canon arc closed; vocabulary-
  neutrality delivered; documentation refreshed (Phase 9 / TASK-029); skill-narratives
  regenerated; canonical verification protocol per docs/reports/pi-internal-verification-
  protocol-* executed for arc-completion release; pre-publish credentialed smoke test passes.
criterion: |
  Substrate-canon arc + vocabulary settlement + milestone-as-anchor + dogfood dry-run +
  vocabulary-neutrality all satisfied; npm run check + npm test green for all 4 packages;
  release script ready; user-action npm publish gated only by interactive OTP.
evidence_block: verification
evidence_query:
  - milestones_satisfied: [MILESTONE-001, MILESTONE-002, MILESTONE-003, MILESTONE-004, MILESTONE-005]
related_decisions: [DEC-0013, DEC-0014, DEC-0015, DEC-0017, DEC-0024, DEC-0025]
related_gaps: []
canonical_vocabulary: arc-completion-release, lockstep-versioning, pre-publish-credentialed-smoke
```

### MILESTONE-007 — Substrate self-direction operational

```yaml
id: MILESTONE-007
name: Substrate self-direction operational
status: planned
description: |
  Operational evidence of the substrate canon: a single canonical primitive answers
  "what should we do next, atomically" given current substrate state. Composes open DECs
  (P0 — user enactment gates everything) + blocking framework-gaps (P1) + unblocked planned
  tasks (P2) + in-progress tasks (P3) into a deterministic FrontierBundle. Harness-confined
  LLM (DEC-0014) navigates substrate canonically via this primitive without improvisation.
  HANDOFF refresh + ceremonies (/context status / /context what-next) call it.
criterion: |
  FGAP-059 closes; nextAtomicWork(cwd) primitive lands in pi-context; pi-registered tool
  'next-atomic-work' + orchestrator script scripts/orchestrator/next-atomic-work.ts available;
  query returns deterministic frontier across runs; derivable purely from substrate
  (no improvisation); harness-confined LLM dogfood-dispatch (MILESTONE-004) demonstrates
  navigation via this primitive end-to-end.
evidence_block: verification
evidence_query:
  - related_gaps_includes: [FGAP-046, FGAP-059]
  - status: passed
related_decisions: [DEC-0014, DEC-0017, DEC-0024, DEC-0025]
related_gaps: [FGAP-046, FGAP-059]
canonical_vocabulary: substrate-self-direction, atomic-next-work, frontier-projection, canonical-orchestration-primitive
```

### MILESTONE-008 — Consumer migration arc complete (FEAT-001)

```yaml
id: MILESTONE-008
name: Consumer migration arc complete
status: planned
description: |
  FEAT-001's 9 stories close: pi-jit-agents adopted as canonical agent-spec compilation +
  in-process dispatch surface across pi-workflows / pi-behavior-monitors / consumer projects;
  legacy workflow-step.dispatch path retired; model-pin policy applied at jit-agents execute
  boundary; thinking-seam enforcement landed; parseModelSpec ownership at execute boundary.
criterion: |
  All FEAT-001 stories status=complete; verification entries cite each story's
  acceptance_criteria satisfaction; legacy dispatch code paths removed.
evidence_block: verification
evidence_query:
  - feature: FEAT-001
  - story_status_all: complete
related_decisions: [DEC-0001, DEC-0002, DEC-0003]
related_gaps: []
canonical_vocabulary: consumer-migration-arc, jit-agents-consumer-adoption
```

---

## Roadmap

### ROADMAP-001 — pi-context substrate canon delivery + first dogfood

```yaml
id: ROADMAP-001
title: pi-context substrate canon delivery + first dogfood
status: active
description: |
  Deliver pi-context substrate canon (DEC-0013..0024) end-to-end: principles
  source-enforced; vocabulary settled; milestone-as-anchor model operative;
  harness-confined LLM dogfood-dispatch passes; v1.0.0 publishable.

ordered_milestones:
  - MILESTONE-001  # substrate canon principles enacted in code
  - MILESTONE-002  # vocabulary settlement complete
  - MILESTONE-003  # milestone-as-anchor model enacted
  - MILESTONE-004  # harness-confined LLM dogfood-dispatch passes
  - MILESTONE-005  # vocabulary-neutral substrate canon delivered
  - MILESTONE-007  # substrate self-direction operational (atomic-next-work query)
  - MILESTONE-006  # pi-context v1.0.0 publishable

dependencies:  # encoded as relations.json edges post-milestone-elevation
  - parent: MILESTONE-001, child: MILESTONE-002, relation_type: milestone_depends_on
  - parent: MILESTONE-001, child: MILESTONE-003, relation_type: milestone_depends_on
  - parent: MILESTONE-002, child: MILESTONE-003, relation_type: milestone_depends_on
  - parent: MILESTONE-002, child: MILESTONE-005, relation_type: milestone_depends_on
  - parent: MILESTONE-003, child: MILESTONE-004, relation_type: milestone_depends_on
  - parent: MILESTONE-003, child: MILESTONE-005, relation_type: milestone_depends_on
  - parent: MILESTONE-003, child: MILESTONE-007, relation_type: milestone_depends_on
  - parent: MILESTONE-004, child: MILESTONE-007, relation_type: milestone_depends_on
  - parent: MILESTONE-005, child: MILESTONE-007, relation_type: milestone_depends_on
  - parent: MILESTONE-007, child: MILESTONE-006, relation_type: milestone_depends_on

lens:  # config.lenses[] entry post-elevation
  id: lens-roadmap-001-milestones
  kind: composition
  members:
    - { from: milestones, where: { roadmap: ROADMAP-001 } }
```

### ROADMAP-002 — pi-jit-agents consumer migration

```yaml
id: ROADMAP-002
title: pi-jit-agents consumer migration
status: planned
description: |
  Migrate all consumers (pi-workflows / pi-behavior-monitors + downstream projects) onto
  pi-jit-agents as canonical agent-spec + dispatch surface. Retire legacy paths. Lands
  AFTER ROADMAP-001 (substrate canon stable required for consumer migration to be safe).

ordered_milestones:
  - MILESTONE-008  # consumer migration arc complete (FEAT-001)

dependencies:
  - parent: MILESTONE-006, child: MILESTONE-008, relation_type: milestone_depends_on

lens:
  id: lens-roadmap-002-milestones
  kind: composition
  members:
    - { from: milestones, where: { roadmap: ROADMAP-002 } }
```

---

## Cascade map (per milestone, what decomposes from it)

### MILESTONE-001 cascade
- Decisions: DEC-0013 / DEC-0014 / DEC-0015 / DEC-0017 / DEC-0021 (enacted)
- Framework-gaps: FGAP-026 / FGAP-028 / FGAP-035 / FGAP-036 / FGAP-038 / FGAP-039
- Tasks: TASK-021..030 (FGAP-026 closure phases 1-10)
- Verifications: VER-001..015 (Phase 1-4 evidence; remaining VER per Phase 5-10 closure)

### MILESTONE-002 cascade
- Decisions: DEC-0022 / DEC-0023 (enacted); +N open DECs per vocabulary question
- Framework-gaps: FGAP-016 (closed) / FGAP-021 / FGAP-047 / FGAP-048 / FGAP-049 / FGAP-050 / FGAP-051 / FGAP-052
- Tasks: TASK-042 (in-progress)
- Conventions rules added per enacted DEC
- config.json authored

### MILESTONE-003 cascade
- Decisions: DEC-0024 (enacted)
- Framework-gaps: FGAP-053 / FGAP-054 / FGAP-055
- New schema: milestones.schema.json installed; PROJECT_BLOCK_TYPES extended
- New block instance: .project/milestones.json
- Roadmap schema migration; roadmap-plan.ts cascade
- relations.json populated with milestone-cascade edges

### MILESTONE-004 cascade
- Framework-gaps: FGAP-028 / FGAP-044
- Tools: tool-discovery surface shipped in pi-context
- Tasks: TASK-030 (Phase 10 final dispatch dry-run)
- Documentation: docs/reports/pi-internal-verification-protocol-* updated for milestone-anchored cascade

### MILESTONE-005 cascade
- Decisions: DEC-0025 (vocabulary-neutral substrate canon)
- Framework-gaps: FGAP-052 (config-declared-but-unconsumed) / FGAP-056 (PROJECT_BLOCK_TYPES const removal) / FGAP-057 (macro library bootstrap) / FGAP-058 (universalization integration test)
- Source changes: project-sdk.ts const removal cascade; macro auto-discovery fallback; runtime layer-aware behavior; lens-validator config-registration
- Documentation: 'bring-your-own-substrate' workflow in CLAUDE.md + skill-narratives + README
- Test: packages/pi-context/src/vocabulary-neutrality.integration.test.ts (new)

### MILESTONE-006 cascade
- All prior milestones satisfied
- Tasks: TASK-029 (Phase 9 docs refresh) + TASK-030 (Phase 10 migration + dry-run) + Step 9 + Step 10 (release)
- Release protocol per scripts/release.mjs
- Pre-publish credentialed smoke per docs/reports/

### MILESTONE-007 cascade
- Decisions: DEC-0014 / DEC-0017 / DEC-0024 / DEC-0025 (foundations)
- Framework-gaps: FGAP-046 (depends_on inline → closure-table) / FGAP-059 (atomic-next-work primitive)
- Source: pi-context/src/atomic-next.ts new; project-sdk export; Pi tool registration; orchestrator script next-atomic-work.ts
- Acceptance: deterministic FrontierBundle returned across runs; harness-confined LLM uses it for navigation

### MILESTONE-008 cascade
- Feature: FEAT-001 with 9 stories
- Decisions: DEC-0001 (model-pin policy) / DEC-0002 (thinking-seam) / DEC-0003 (parseModelSpec ownership)
- Stories STORY-001..009 close; their nested tasks complete

---

## Open shape questions surfaced by drafting

1. **Milestone status enum** — "active" used here for in-progress; canonical lifecycle (aspirational/active/satisfied/archived) needs DEC.
2. **Roadmap status enum** — current schema declares draft/active/paused/complete/archived; aligns with milestone? Or differs?
3. **Evidence_query DSL** — sketched here as inline objects (target / target_in / status / milestones_satisfied / feature / story_status_all / related_gaps_includes); current schema only declares it as object passthrough, no canonical predicate vocabulary. FGAP-027 territory.
4. **Cross-roadmap milestone references** — MILESTONE-006 depends on MILESTONE-005 from ROADMAP-001; relations.json edge crosses roadmap boundaries cleanly.
5. **Roadmap.lens mapping** — lens id naming convention (lens-roadmap-001-milestones) is a candidate; alternative shapes exist.
6. **PHASE binding** — these milestones don't reference PHASE-NNN currently because phase block kind is in flux per FGAP-049. Once resolved, phase_culminates_at_milestone edges would tie phases to milestones (likely TASK-021..030 closure becomes phases under MILESTONE-001).
7. **Project goals → milestones** — project.json has goals[] (workflow-orchestration / behavior-monitoring / etc.). Edge from project_goal → milestone (relation_type: project_goal_served_by_milestone) not yet declared.

---

## How this draft sharpens config.json authoring

- **block_kinds[]** needs addition: `milestones` entry (canonical_id / display_name / prefix MILESTONE- / schema_path / array_key / data_path)
- **relation_types[]** needs population with at minimum: milestone_depends_on / roadmap_contains_milestone / phase_culminates_at_milestone / milestone_grounded_by_research / milestone_addressed_by_decision / milestone_blocked_by_gap / milestone_delivered_by_feature / milestone_verified_by / project_goal_served_by_milestone (plus task_in_phase / task_depends_on / decision_supersedes / etc. per FGAP-040/046)
- **lenses[]** needs at least: lens-roadmap-001-milestones (composition kind binning milestones for ROADMAP-001) + lens-roadmap-002-milestones; lens-milestones-by-status (target kind on milestones bin by status); plus existing-block lenses (tasks-by-status / decisions-by-status / etc.)
- **status_buckets** map needs the milestone enum normalized too
- **layers[]** L1..L5 substrate/query/composition/dispatch/surface (already inferred); milestone block-kind layer assignment per FGAP-052 once consumed at runtime
- **hierarchy[]** legal triples: (roadmap, milestone, roadmap_contains_milestone) / (milestone, phase, phase_culminates_at_milestone) / (project, milestone, project_goal_served_by_milestone) / etc.

This shape gives the config authoring concrete structure to fill rather than improvising from blank.
