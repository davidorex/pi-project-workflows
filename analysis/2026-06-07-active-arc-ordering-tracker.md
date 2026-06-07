# Active-arc ordering tracker — global CLI → pi-bound → update → governance release

Date opened: 2026-06-07
Substrate: `.context`
Purpose: the actionable, topologically-ordered sequence for the current arc, derived from the substrate edges. A hand-maintained tracker until the deriver consumes gating relations + a roadmap lens exists (FGAP-037/042). Update statuses here as work lands; the edges in `.context` remain the source of truth.

End state (the milestone, unbuilt as a block — FGAP-037): a user runs `pi-context pi-bound` and `pi-context update` from a global install, with convention-articulation governance enforced locally and propagated to existing substrates.

## Ordering (critical path)

| # | Item | Status | Gated by / depends on | Resolves | Next action |
|---|---|---|---|---|---|
| 1 | **TASK-028** make pi-context globally installable (`chmod +x dist/bin.js` + npm link) | **COMPLETED** (VER-017, `a5055ad`; FGAP-047 closed) | — (root) | FGAP-047 ✓closed | done — global `pi-context` works |
| 2 | **TASK-029** declare `@davidorex/pi-project-workflows` dep | **COMPLETED** (VER-018, `dafa2c6`; FGAP-048 closed) | — | FGAP-048 ✓closed | done — meta-package resolves |
| 3 | **TASK-030** implement `pi-context pi-bound` | planned · **READY** | TASK-028 ✓, TASK-029 ✓ | FEAT-005 | **DO NEXT** — feature branch off integration branch |
| 4 | **FEAT-006 decomposition** — file its ~5 tasks | proposed · undecomposed | gated on FGAP-047 (=TASK-028) | — | file tasks once #1 lands |
| 5 | **FEAT-006 tasks** — unified update (command shell · schema drift-merge · config-registry propagation · surfaced reporting/idempotent skip · dry-run + demos) | not filed | FEAT-006 decomposition; needs TASK-028 | FGAP-046, 049, 050, 051, 060 | after #4 |
| 6 | **TASK-033** ship governance vocab to catalog (warning) + release | planned · BLOCKED | FEAT-006 (`task_gated_by_item`) | completes FEAT-007 | after #5; release authorization-gated |
| 7 | **C4 governance tail** — author the 8 missing conventions, re-point decisions, close gaps | identified | — (independent) | FGAP-052..059 | anytime; grounded per-domain |

## Done (this arc, committed)
- Convention-articulation enforcement LIVE in `.context` (error): relation_types + 3 invariants + 73 backfill edges + 8 missing-convention gaps. TASK-031, TASK-032 completed (VER-015/016); DEC-0016 enacted; FEAT-007 in-progress (catalog half = TASK-033, item #6).
- pi-bound recast to a bare subcommand (DEC-0014, spec, FEAT-005, TASK-030).
- Dependency recorded: TASK-033 → FEAT-006 → FGAP-047.

## Gates not yet derived (confirmed — FGAP-061)
Verified: `currentState` (context-sdk.ts:727-730) consumes only `task_depends_on_task`; the `task_gated_by_item` / `feature_gated_by_item` gates above are stored-but-inert — no readiness deriver honors them, and no feature/story-level readiness derivation exists at all. So a "what's ready" query under-reports these gates, and **this tracker is the only place the gating ordering is actionable** until FGAP-061's fix lands (extend `currentState` now for task gates; FEAT-004 config-declared gate-aware derivation for feature/story gates).

## Standing constraints
- Releases HELD (no `release:*` without explicit authorization; npm publish needs OTP).
- Per `feature-branch-workflow`: implementation on a feature branch off the integration branch; substrate single-writer on the integration branch.
