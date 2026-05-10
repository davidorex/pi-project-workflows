**FGAP-026 closure plan — sub-phase structure** (under DEC-0014/0015/0016/0017 canon + FGAP-028 dogfood-completeness gate; per user direction 2026-05-10 for atomic sub-phases reducing error possibility surface + parallel implementation where conflict-free)

## Sub-phase enumeration with parallel opportunities

| Phase | Sub-phases | Serial / parallel |
|-------|------------|-------------------|
| **1** | 1.1 bootstrap.schema.json + .pi-context.json atomic-safety • 1.2 resolveContextDir + cascade • 1.3 read-config + read-schema tools | Serial 1.1→1.2→1.3 |
| **2** | 2.1 filter-block-items • 2.2 resolve-items-by-id • 2.3 walk-ancestors • 2.4 walk-by-relation • 2.5 find-references | Parallel JS authoring; serial commits per index.ts registrations |
| **3** | 3.1 context-contract substrate (FGAP-030) • 3.2 gather-execution-context primitive (FGAP-031) • 3.3 tool wrapper + integration test | Serial 3.1→3.2→3.3 |
| **4** | 4.1 workflow-execute • 4.2 workflow-list • 4.3 workflow-status • 4.4 subcommand-only tool wrappers | 4.1/4.2/4.3 parallel; 4.4 follows |
| **5** | 5.1 config.json • 5.2 relations.json bootstrap • 5.3 roadmap.json • 5.4 phase.json • 5.5 context-contracts • 5.6 update tasks.json with phase edges | Serial 5.1→5.2→5.3→5.4→5.5→5.6 (each depends on prior) |
| **6** | 6.1 /project → /context subcommand rename • 6.2 project-* → context-* tool rename • 6.3 context-init (PROMPTS for substrate dir name AND block-kind selection — canonical_id/prefix/display_name per kind — so user never hand-authors config; basename/canonical_id binding realized by workflow construction) • 6.4 context-install (reads context-init-produced config + creates files matching declared canonical_ids) • 6.5 context-migrate | 6.1/6.2 serialize per index.ts; 6.3/6.4/6.5 parallel-authorable |
| **7** | 7.1 pi-jit-agents (incl. FGAP-032) • 7.2 pi-workflows • 7.3 pi-behavior-monitors | **Parallel** — 3 separate packages, no source overlap |
| **8** | 8.1 pi-context fixtures • 8.2 pi-jit-agents fixtures • 8.3 pi-workflows fixtures • 8.4 pi-behavior-monitors fixtures | **Parallel** — 4 separate packages |
| **9** | 9.1 CLAUDE.md • 9.2 root README • 9.3 per-package READMEs • 9.4 per-package skill-narratives • 9.5 npm run skills regen | 9.1-9.4 parallel-authorable (different files); 9.5 follows |
| **10** | 10.1 context-migrate execution • 10.2 verify post-migration • 10.3 final FGAP-028 dogfood-dispatch dry-run • 10.4 FGAP-026 closure transition + HANDOFF refresh | Strictly serial |

## Plan-mode-per-sub-phase protocol

Each sub-phase = one plan file iteration (overwriting `~/.claude/plans/idempotent-dancing-wilkes.md`) + ExitPlanMode for approval + foreground subagent dispatch (per `feedback_no_background_subagents.md`) + verify-before-relay + per-sub-phase forensic commit + HANDOFF Active Task Ledger update naming the sub-phase progress under the parent task entry.

Where parallel possible: batch parallel agent dispatches in a single Agent-tool-call message per the established discipline; each parallel agent gets its own sub-brief; convergence commit at end of phase OR per-package commits if truly independent (preferred for forensic traceability).

## Why sub-phases reduce error possibility surface

- Smaller scope per subagent brief → less compound-error risk per dispatch
- Atomic commits per sub-phase → easier rollback if any sub-phase produces a regression
- Clearer per-sub-phase capability gate → harness-confined-capability check at finer granularity (FGAP-028 dogfood-dispatchability proven incrementally not in big-bang)
- Parallel opportunities surface explicitly → cross-package + cross-doc work proceeds concurrently where conflict-free

## Task ledger note

Phase-level tasks (TASK-021..TASK-030 in .project/tasks.json + Claude Code Tasks #21-#30) stay as the canonical tracking units. Sub-phases tracked inline during each phase's plan-mode + commit cycle via the plan file iteration + HANDOFF Active Task Ledger updates. NOT filed as separate task entries in tasks.json (would force dotted-notation schema migration; sub-task hierarchy properly belongs as relations.json edges per DEC-0013 — Phase 5 territory if explicit hierarchy tracking becomes needed).
