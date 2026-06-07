# Active-arc tracker — best-of-breed `pi-context` CLI surface + `pi-context update` completion

Date opened: 2026-06-07 (reframed from the global-CLI → pi-bound → update → governance arc, now largely landed)
Substrate: `.context`
**Standard: the monorepo is best-of-breed with a superior user experience, period.** Priorities sequence the work; nothing here is acceptable to ship against, and no item is "polish" or "ship-after" (see memory `feedback_best_of_breed_not_minimal_release`).
Purpose: the actionable, topologically-ordered "what's next", hand-maintained until the readiness deriver consumes gating relations + a roadmap lens exists (FGAP-061/037/042). The `.context` edges remain the source of truth; this is the only place the current focus + cross-arc ordering is actionable.

## Current focus — two active arcs

**A. `pi-context update` (FEAT-006) — ✓ COMPLETE** (VER-027). All six slices done + verified: T1 shell (TASK-034) · T2 base-stamp (TASK-035) · T3 merge (TASK-036) · T4 resolver (TASK-037) · T5 config-registry propagation (TASK-038) · T6 surfaced reporting + idempotent block skip (TASK-039). `update` consults checkStatus per schema, resyncs in-sync/catalog-ahead, 3-way merges locally-modified preserving edits (conflicts → pi-bound mergetool or report), additively propagates catalog config registries preserving user entries, enumerates every mutation (incl. `migrationsRegistered`), and `--dryRun` previews all while writing nothing — a customization is never silently clobbered. FGAP-046/049/050/051/060 closed. **One filed follow-up: FGAP-065** (a newly-merged block_kind's schema/starter materialization — the complement to T5's declaration-only scope). **Arc A is closed; the active focus is now arc B.**

**B. The best-of-breed `pi-context` CLI surface.** 10 open `pi-context-cli` UX gaps. Grounded in `analysis/2026-06-07-pi-context-cli-release-readiness-audit.md` (real runtime evidence + the complete set). Candidate to bind as a `best-of-breed CLI surface` feature and decompose into pipelineable tasks per the `feature-decomposition` convention:
- **Help / discovery** — FGAP-062 (scannable grouped `--help`; surface `promptSnippet`; expose `pi-bound`).
- **Flag normalization** — FGAP-064 + FGAP-032 (one kebab→camel / alias layer: `--dry-run`, `--id` across ops).
- **Validation guidance** — FGAP-023 (field-named errors, not raw AJV instancePaths).
- **Version** — FGAP-063 (`--version` / `-v`).
- **Exit codes** — FGAP-026 (granular error classes, not 0/1/2).
- **Human render** — FGAP-021 (`--format` / `--raw`).
- **Write safety** — FGAP-022 (`--show-schema` contract preview), FGAP-024 (append dry-run).
- **Input ergonomics** — FGAP-025 (`--writer kind:id`, `--where field:op:value`, CSV `--op in`).

**Adjacent (not arc A/B):** TASK-033 (ship the convention-articulation governance vocabulary to the samples catalog, completes FEAT-007; gated behind FEAT-006, release-held). C4 governance tail — FGAP-052..059 missing-convention authoring (independent, anytime).

## Landed (recent arc, committed)
- Global `pi-context` on PATH + `pi-bound`: TASK-028/029/030 (VER-017/018/019); **FEAT-005 complete** (VER-024, operator-confirmed live constrained-session smoke). FGAP-031/047/048 closed.
- FEAT-006 hybrid T1–T4: TASK-034/035/036/037 (VER-020/021/022/023); **FGAP-046 + FGAP-049 closed**; DEC-0017 enacted (R-0008 grounding).
- Convention-articulation enforcement LIVE in `.context` (error): TASK-031/032 (VER-015/016), DEC-0016; FEAT-007 in-progress (catalog half = TASK-033).
- `docs-surface-sync` convention filed; the package + monorepo READMEs, the `update` op-description/promptSnippet, and the generated SKILL.md refreshed for the update + pi-bound surface.

## Gates not yet derived (FGAP-061)
`currentState` (context-sdk.ts:727-730) consumes only `task_depends_on_task`; the `task_gated_by_item` / `feature_gated_by_item` gates are stored-but-inert. So `/context status` under-reports the ordering AND does not surface arc B (the CLI gaps are gaps, not yet tasks under a feature). **This tracker is the only place the current focus is actionable** until FGAP-061 lands (extend `currentState` for task gates; FEAT-004 config-declared gate-aware derivation for feature/story gates).

## Standing constraints
- Releases HELD — no `release:*` without explicit per-release authorization; npm publish needs the operator's OTP.
- `feature-branch-workflow`: implementation on a feature branch off the porcelain-clean integration branch; substrate single-writer on the integration branch.
- Standard: best-of-breed + superior UX; sequence by priority, defer nothing as acceptable.
