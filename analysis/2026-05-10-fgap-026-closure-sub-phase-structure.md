**FGAP-026 closure plan — sub-phase structure** (under DEC-0014/0015/0016/0017/0018/0019/0020/0021 canon + FGAP-028 dogfood-completeness gate; per user direction 2026-05-10 for atomic sub-phases reducing error possibility surface + parallel implementation where conflict-free)

**Revision 2026-05-12 per DEC-0021**: Phase 7 (cross-package source cascade) retired as a separate stage. Hard-throw substrate primitive (resolveContextDir per DEC-0015) cascades per-package atomically — source + absent-substrate-catch + fixture together — per DEC-0021. Phase 1.2 C.* sections redefined as per-package atomic units encompassing all 3 gates. Phase 8 retained but scope shrunk to comprehensive-sweep / consistency-review post-atomic-unit-landings.

## Sub-phase enumeration with parallel opportunities

| Phase | Sub-phases | Serial / parallel |
|-------|------------|-------------------|
| **1** | 1.1 bootstrap.schema.json + .pi-context.json atomic-safety • 1.2 resolveContextDir + pi-context internal cascade • 1.3 read-config + read-schema tools | Serial 1.1→1.2→1.3 |
| **1.2 C.*** (per-package atomic per DEC-0021) | C.1 pi-context fixtures (within pi-context cascade) • C.2 pi-jit-agents atomic 3-gate unit (source + absent-substrate-catch + fixture) • C.3 pi-workflows atomic 3-gate unit • C.4 pi-behavior-monitors atomic 3-gate unit • D pi-jit-agents static test-fixtures pointer files • E husky-gate extension • F project-dir.test.ts | Each C.* package atomic per DEC-0021. D follows C.2. E re-rolls after C.2/C.3/C.4/D land. F any time after Section A. |
| **2** | 2.1 filter-block-items • 2.2 resolve-items-by-id • 2.3 walk-ancestors • 2.4 walk-by-relation • 2.5 find-references | Parallel JS authoring; serial commits per index.ts registrations |
| **3** | 3.1 context-contract substrate (FGAP-030) • 3.2 gather-execution-context primitive (FGAP-031) • 3.3 tool wrapper + integration test | Serial 3.1→3.2→3.3 |
| **4** | 4.1 workflow-execute • 4.2 workflow-list • 4.3 workflow-status • 4.4 subcommand-only tool wrappers | 4.1/4.2/4.3 parallel; 4.4 follows |
| **5** | 5.1 config.json • 5.2 relations.json bootstrap • 5.3 roadmap.json • 5.4 phase.json • 5.5 context-contracts • 5.6 update tasks.json with phase edges | Serial 5.1→5.2→5.3→5.4→5.5→5.6 (each depends on prior) |
| **6** | 6.1 /project → /context subcommand rename • 6.2 project-* → context-* tool rename • 6.3 context-init (PROMPTS for substrate dir name AND block-kind selection — canonical_id/prefix/display_name per kind — so user never hand-authors config; basename/canonical_id binding realized by workflow construction) • 6.4 context-install (reads context-init-produced config + creates files matching declared canonical_ids) • 6.5 context-migrate | 6.1/6.2 serialize per index.ts; 6.3/6.4/6.5 parallel-authorable |
| **7** | **RETIRED per DEC-0021** — cross-package source cascade was the wrong abstraction; source-cascade is absorbed into per-package C.* atomic units in Phase 1.2. Concerns reframed: FGAP-032 item-level contextBlocks remains as a standalone pi-jit-agents concern, retracked under Phase 6.5 or its own sub-phase. | — |
| **8** | Post-atomic-units sweep (post-revision; scope shrunk per DEC-0021): comprehensive consistency review across all 4 packages' source + fixtures + absent-substrate-handling AFTER C.* atomic units land. Catches any residual misclassification / missed cascade site / inconsistency. Scope of work in Phase 8 depends on whether C.* atomic units found everything. | **Parallel** per-package; or single sweep if surface is small |
| **9** | 9.1 CLAUDE.md • 9.2 root README • 9.3 per-package READMEs • 9.4 per-package skill-narratives • 9.5 npm run skills regen | 9.1-9.4 parallel-authorable (different files); 9.5 follows |
| **10** | 10.1 context-migrate execution • 10.2 verify post-migration • 10.3 final FGAP-028 dogfood-dispatch dry-run • 10.4 FGAP-026 closure transition + HANDOFF refresh | Strictly serial |

## DEC-0021 atomic 3-gate per-package boundary

When hard-throw substrate primitive (resolveContextDir) lands, each consumer-package cascade is atomic per DEC-0021 — three gates land together per arc (single commit OR sequential commits within one sub-phase):

| Gate | Surface | Implementation pattern |
|------|---------|------------------------|
| **Gate 1 (source cascade)** | Production source hardcoded substrate-dir literals | Replace `path.join(... ".project" ...)` with resolver-cascaded helpers (`projectDir(cwd)`, `schemasDir(cwd)`, `schemaPath(cwd, blockName)`, etc.) from `@davidorex/pi-context/project-dir` |
| **Gate 2 (absent-substrate-catch)** | Production code paths that gracefully-degraded pre-hard-throw via null-return / try-null / fs.existsSync-false fallback | Wrap resolver-cascading calls in try/catch; on `BootstrapNotFoundError` preserve skip semantic (set null / set flag / return empty / etc.). Same pattern as audit-fix cluster D-B-3/D-B-4 at `7cd3c6c` |
| **Gate 3 (fixture cascade)** | Tests that exercise resolver-cascading paths (direct OR transitive) | Insert `writeBootstrapPointer(tmpDir, ".project")` after each `mkdtempSync(...)`; tests asserting on absent-substrate behavior keep config absent but write bootstrap pointer |

**Pre-dispatch audit per consumer package**:
- Gate 1 grep: `path\.\(join\|resolve\).*['"]\.project['"]` in production source (excluding *.test.ts)
- Gate 2 enumeration: trace `loadConfig`/`readBlock`/`projectDir`/`schemaPath`/etc. calls; identify graceful-skip code paths
- Gate 3 enumeration: every `mkdtempSync` / `vi.spyOn(process, "cwd")` / similar fixture site with independent import-chain trace for transitive resolver reach

## Phase 1.2 atomic-unit landings (current state at HEAD 3bd6534)

| Section | Package | Gate 1 | Gate 2 | Gate 3 | Commits |
|---------|---------|--------|--------|--------|---------|
| C.1 | pi-context (self-cascade) | landed in Section B `9846b90` | landed in Section B + audit-fix cluster | landed `8f33a38` | A `bb2c7d5` + B `9846b90` + C.1 `8f33a38` + audit-fix cluster `1a98345`/`e780db0`/`7cd3c6c`/`b94264b` |
| C.2 | pi-jit-agents | PASS (no defects found) | `ba58d78` closes 2 defects (compile.ts:223 + 228 BNF catches) | `99436c3` 3 helpers + audit confirmed 4 no-resolver-reach sibling files correctly classified | `99436c3` + audit `/tmp/c2-retroactive-audit.md` + Gate-2 closure `ba58d78` |
| C.3 | pi-workflows | step-shared.ts already cascaded; 3 test rewrites at `856e139` | `856e139` compileAgentSpec BNF catch | `856e139` 4 sites loop/resume + `f4dd1a2` macOS realpath fix | `d64cb33` PARTIAL → `856e139` + `f4dd1a2` COMPLETION |
| C.4 | pi-behavior-monitors | PASS (no defects) | PASS (already wrapped) | `3274466` 4 fixture sites cascaded | audit `/tmp/c4-pre-dispatch-audit.md` + Gate-3 closure `3274466` |

**All 4 packages green post-atomic-unit-landings**:
- pi-context 390/0/0
- pi-jit-agents 150/0/1
- pi-workflows 824/0/2
- pi-behavior-monitors 157/157

**Ahead in Phase 1.2**: D pi-jit-agents static test-fixtures (likely empty per C.2 audit which found static `test-fixtures/` referenced as static file paths NOT cwds); F project-dir.test.ts (NEW 7 tests); Section E husky-gate re-roll (extend pre-commit to `npm run check && npm test`); Phase 1.3 read-config + read-schema tools.

## Plan-mode-per-sub-phase protocol

Each sub-phase = one plan file iteration (overwriting `~/.claude/plans/idempotent-dancing-wilkes.md`) + ExitPlanMode for approval + foreground subagent dispatch (per `feedback_no_background_subagents.md`) + verify-before-relay + per-sub-phase forensic commit + HANDOFF Active Task Ledger update naming the sub-phase progress under the parent task entry.

Agent-context compilation via `scripts/orchestrator/compile-*-context.ts` per DEC-0019 + DEC-0020 (mirrors pi-jit-agents `compileAgent` vocabulary). Explore-agent context via `compile-explore-context.ts` with TABLES-ONLY rule. Implementation-agent context via `compile-implementation-context.ts`. Implementer task-block via `compile-task-context.ts`. Atomic substrate filings via `file-block-item.ts`. Item-level substrate projection via `inject-context-items.ts`.

Where parallel possible: batch parallel agent dispatches in a single Agent-tool-call message; each parallel agent gets its own sub-brief; convergence commit at end of phase OR per-package commits if truly independent (preferred for forensic traceability).

## Why per-package atomic boundary per DEC-0021

- Hard-throw substrate primitive is atomic across all consumers; phase-split-by-concern-type is fictional
- Tests exercise production code paths; if source cascade is deferred, fixture cascade alone cannot fix production-source-driven failures
- Pre-hard-throw graceful-degrade paths (null-return / existsSync-false) must transition to typed-error catches in the same arc as fixture cascade
- C.3 partial-fail at `d64cb33` (20/826 fails: 16 cascade misclassifications + 3 production-source hardcode + 1 absent-substrate-graceful-skip) was the forcing observation

## Why sub-phases reduce error possibility surface

- Smaller scope per subagent brief → less compound-error risk per dispatch
- Atomic commits per sub-phase → easier rollback if any sub-phase produces a regression
- Clearer per-sub-phase capability gate → harness-confined-capability check at finer granularity (FGAP-028 dogfood-dispatchability proven incrementally not in big-bang)
- Parallel opportunities surface explicitly → cross-package + cross-doc work proceeds concurrently where conflict-free

## Task ledger note

Phase-level tasks (TASK-021..TASK-030 in .project/tasks.json + Claude Code Tasks #21-#30) stay as the canonical tracking units. Sub-phases tracked inline during each phase's plan-mode + commit cycle via the plan file iteration + HANDOFF Active Task Ledger updates. NOT filed as separate task entries in tasks.json (would force dotted-notation schema migration; sub-task hierarchy properly belongs as relations.json edges per DEC-0013 — Phase 5 territory if explicit hierarchy tracking becomes needed).
