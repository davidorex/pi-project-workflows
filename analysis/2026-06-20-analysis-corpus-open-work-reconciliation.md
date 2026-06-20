# Analysis-Corpus → Open-Work Reconciliation (2026-06-20)

Reconciliation of the entire `analysis/*.md` corpus against the OPEN tasks, gaps, issues, and features in the active `.context` substrate, so the work can be organized. Read-only; substrate state read through the `pi-context` CLI; corpus read via `Read` on `analysis/*.md`.

## Method + ground truth

Active substrate pointer (`.pi-context.json`): `contextDir = .context`. State read via `pi-context context-status` + `read-block` / `read-block-item` / `read-block-page` / `filter-block-items`. Corpus partitioned across five reading passes by filename date; every substrate linkage claim is a CLI read result or a verbatim md quote.

OPEN work confirmed by CLI at reconciliation time:

- **OPEN tasks (16 planned)**: TASK-003, 004, 005, 021, 022, 027, 041, 044, 047, 054, 055, 056, 057, 058, 066, 067. (TASK-062 verified **completed**, not in-progress; TASK-020 / 033 / 050 / 059 / 065 completed; TASK-060 cancelled.)
- **OPEN issues (3)**: issue-002 (layer-plans nested id-bearing arrays), issue-003 (update refused conventions items), issue-005 (update same-version resync verbatim-overwrites). (issue-001/004/006/007/008/009 all resolved.)
- **PROPOSED (open) features (4)**: FEAT-001 (clone), FEAT-002 (git merge driver), FEAT-003 (sequence CRDT field-kind), FEAT-004 (config-driven state derivation). (FEAT-005..009 complete.)
- **OPEN framework-gaps (48: identified/accepted)** — full catalog in Appendix A.
- **Decisions**: 18, all `enacted`. **Research**: 19, all `complete` (R-0001..R-0019). **Stories**: 14, all `complete`.

The research block (R-0001..R-0019) was read in full; each item's `findings_document` was captured. **This is the dedup spine for the research-surfacing section: an analysis md that is already the `findings_document` of an R-item is NOT a surfacing candidate — it is already surfaced.**

---

## 1. Corpus inventory

~190 `analysis/*.md` files (plus `corpus-index.jsonl`, three `.jsonl` data files, and two `poc*/` dirs not classified here). One line each, grouped by date band.

### 2026-04 (foundational / pre-substrate-arc)

| File | Subject |
|---|---|
| 2026-04-13-spec-loop-derivability.md | SYNTH spec-loop vs framework derivability |
| 2026-04-15-blocks-as-prompt-substrate.md | Macro granularity / blocks-as-prompt-substrate |
| 2026-04-15-expression-language-comparison.md | CEL vs alternatives for invariant/predicate language |
| 2026-04-15-process-articulation.md | Process articulation (workflow vocabulary) |
| 2026-04-15-runtime-step-context.md | Runtime per-step context injection design |
| 2026-04-25-pi-bypass-arc-fragilities.md | Enumerated arc fragilities (F-001..F-011) — holding file |
| 2026-04-27-canonical-loader-replaces-seedExamples.md | Canonical loader replacing seedExamples |
| 2026-04-27-curation-recursion-termination-and-withering.md | Validator/curation termination + withering |
| 2026-04-27-decomposition-methods-and-audit-as-scope-driver.md | Decomposition methods + audit-as-scope-driver |
| 2026-04-27-pi-session-jsonl-substrate-confirmation.md | Pi session JSONL structure confirmation |
| 2026-04-28-context-paths-extension-design.md | context-paths extension design |
| 2026-04-28-pi-mono-alignment-audit.md | Alignment vs canonical pi-mono patterns |
| gsd-2-derivability.md | gsd-2 system vs project derivability |
| gsd-2-foundational-intelligence.md | gsd-2 onboarding/foundational-intelligence patterns |
| openrouter-pi-mono-setup.md | OpenRouter + pi-mono setup notes |
| pi-project-schema-conventions-audit.md | Schema convention audit |
| research-blocks-design.md | research-block kind design |
| context-block-design.md | context-block kind design |
| The Fully-Instrumented Specification Loop.md | SYNTH fully-instrumented spec loop |

### 2026-05-01..05-14 (substrate arc / rename / vocabulary)

| File | Subject |
|---|---|
| 2026-05-01-blocks-schemas-macros-contract-synthesis.md | blocks↔schemas↔macros contract synthesis |
| 2026-05-01-ceremony-ideas.md | Bootstrap ceremony idea scratch |
| 2026-05-01-github-issues-migration-inventory.md | GitHub-issues migration inventory |
| 2026-05-01-substrate-arc-distillation.md | Distillation of aborted arc (Tier A survives) |
| 2026-05-02-per-item-macros-atomic-plans.md | Per-item macro atomic plans |
| 2026-05-02-per-item-macros-duplication-analysis.md | Per-item macro duplication analysis |
| 2026-05-02-residual-debt-survey.md | Residual debt survey |
| 2026-05-03-context-management-issue-cluster.md | Context-management issue cluster |
| 2026-05-03-monitor-fragility-expected-vs-surprising.md | Monitor write-path fragility audit |
| 2026-05-03-package-issue-clusters.md | Per-package issue clusters |
| 2026-05-03-substrate-arc-frame.md | Substrate arc frame |
| 2026-05-05-config-as-vocabulary-substrate.md | config-as-vocabulary substrate model |
| 2026-05-05-pi-context-executive-summary-candidate.md | pi-context executive summary candidate |
| 2026-05-05-pi-context-rename-decomposition.md | pi-context rename decomposition |
| 2026-05-05-pi-context-rename-touched-items.md | Rename impact / touched items |
| 2026-05-05-pm-vocabulary-prior-art-survey.md | PM-vocabulary prior-art survey |
| 2026-05-06-context-packet-comparison.md | gsd-build/context-packet vs pi-context |
| 2026-05-06-repo-cleaning-guide.md | Repo cleaning guide |
| 2026-05-07-per-file-disposition-synthesis.md | Per-file disposition synthesis (post arc-reset) |
| 2026-05-08-poc-plan-A-fix-forward.md | POC plan A (fix-forward) — superseded by arc reset |
| 2026-05-08-poc-plan-B-revert.md | POC plan B (revert) — superseded by arc reset |
| 2026-05-10-fgap-026-closure-sub-phase-structure.md | FGAP-026 closure sub-phase structure |
| 2026-05-10-fgap-026-implementation-walkthrough.md | FGAP-026 implementation walkthrough |
| 2026-05-10-tool-surface-gap-audit.md | Tool-surface gap audit |
| 2026-05-10-tsx-barrel-pi-coding-agent-flake.md | tsx barrel import-resolution flake (F-001) |
| 2026-05-14-arc-tracking-substrate-decision-sharpening.md | Arc-tracking decision sharpening |
| 2026-05-14-arc-tracking-substrate-open-decisions.md | Arc-tracking open decisions |
| 2026-05-14-milestones-and-roadmap-draft.md | Milestones + roadmap draft |
| 2026-05-14-pm-vocabulary-survey-full-analysis.md | PM-vocabulary survey full analysis |
| 2026-05-14-step-1-config-draft-from-substrate.md | Step-1 config draft from substrate |
| 2026-05-14-step-2-resolution-patterns-from-substrate.md | Step-2 resolution patterns |
| 2026-05-14-substrate-filing-precedents.md | Substrate filing precedents |

### 2026-05-17..05-31 (invariants / jit-agents spec / content-addressed identity)

| File | Subject |
|---|---|
| 2026-05-17-config-declared-invariants-design.md | config.invariants[] design (DEC-0025) |
| 2026-05-21-main-agent-as-jit-agent-feasibility.md | In-session jit-agent persona feasibility |
| 2026-05-21-pi-sdk-0.74-to-0.75-investigation.md | Pi SDK 0.74→0.75 upgrade investigation |
| 2026-05-22-context-plugin-feasibility.md | Context-plugin / third-party conception portability |
| 2026-05-23-fgap-074-rename-decomposition.md | FGAP-074 rename codemod decomposition |
| 2026-05-23-pi-tui-onboarding-banner-research.md | Pi TUI onboarding-hook API surface |
| 2026-05-25-fgap-089-fail-closed-reads.md | FGAP-089-era fail-closed reads runtime demo |
| 2026-05-25-fgap-090-runtime-demo.md | FGAP-090-era eager-orientation runtime demo |
| 2026-05-25-fgap-103-runtime-demo.md | FGAP-103 element-read runtime demo |
| 2026-05-25-list-tools-truncation-observed-behavior.md | Agent partial-read-as-complete under truncation |
| 2026-05-25-pi-self-docs-and-extend-mechanism.md | Pi self-docs / extend mechanism landscape |
| 2026-05-25-skill-collision-fix-runtime.md | Skill-collision fix runtime verification |
| 2026-05-25-system-thesis-jit-everything-vision-candidate.md | System thesis / jit-everything vision |
| 2026-05-26-decisions-block-shape-survey.md | Decisions-block shape variance survey |
| 2026-05-26-decisions-substrate-revision-grounding.md | Decisions-substrate revision (3-artifact split) |
| 2026-05-26-pi-subagents-eval-vs-jit-intentions.md | pi-subagents vs jit user-intentions comparison |
| 2026-05-26-roadmap-by-extension.md | Roadmap by extension (self-marked stale) |
| 2026-05-28-hybrid-3-composite-tools-canon-eval.md | Hybrid-3 composite-tools canon eval |
| 2026-05-28-hybrid-3-refined-composite-tools-design.md | Hybrid-3 refined composite-tools design |
| 2026-05-28-launch-script-harness-canonical-audit.md | Launch-script harness canonical audit |
| 2026-05-29-cc-workflows-vs-pi-workflows-recon.md | Claude-Code workflows vs pi-workflows recon |
| 2026-05-29-fgap-037-canonical-resolution.md | FGAP-037 canonical resolution (macros relocation) |
| 2026-05-29-macros-statements-audit.md | Exhaustive macro-statements corpus audit |
| 2026-05-30 Substrate JIT-Agents Contradiction Audit.md | Substrate vs jit-agents contradiction audit |
| 2026-05-30-clock-menu-app-fb-*.md (4 files) | clock-menu-app dogfooding feedback (authoring / dispatch-runtime / model-resolution / substrate-surfaces) |
| 2026-05-30-fgap-115-pi-latest-impact.md | FGAP-115 pi-latest impact |
| 2026-05-30-jit-agents-30k-foot-breaks.md | jit-agents 8 structural breaks (30k-foot) |
| 2026-05-30-jit-agents-B-C-A-investigation.md | jit-agents B/C/A authoring-quality investigation |
| 2026-05-30-jit-agents-contradiction-audit-verification.md | Contradiction-audit verification |
| 2026-05-30-jit-agents-spec-v2.md | jit-agents Specification v2 (living draft) |
| 2026-05-30-LLM-perspective JIT Agent UX.md | LLM-perspective jit-agent UX |
| 2026-05-30-pi-context-claude-code-howto.md | Claude-Code-side pi-context how-to (interim ref) |
| 2026-05-30-self-documenting-substrate-design.md | Self-documenting substrate design (FGAP-182) |
| 2026-05-30-tool-execution-question.md / -answer.md | Tool-execution Q + A |
| 2026-05-31 PI-CONTEXT Substrate Identity & Integrity — Implementation Specification.md | Substrate-identity impl spec (v-series) |
| 2026-05-31-content-addressed-substrate-identity-EXECUTION-PLAN.md | Content-addressed identity execution ledger |
| 2026-05-31-content-addressed-substrate-identity-implementation-spec(.md/-v2/-v3).md | Identity impl specs v1/v2/v3 |
| 2026-05-31-cycle2..9.2-*-adversarial-audit.md (8 files) | Per-cycle adversarial audits (content-addressed arc) |
| 2026-05-31-new-composer-suite-brief.md / -spec.md | New composer-suite brief + spec |
| 2026-05-31-phase0-dir-targeted-adversarial-audit.md | Phase-0 dir adversarial audit |
| 2026-05-31-substrate-identity-spec-comparison.md | Identity spec comparison |

### 2026-06-01..06-09 (CLI elevation / update arc / changelog discipline)

| File | Subject |
|---|---|
| 2026-06-01-cycle10-active-wiring-adversarial-audit.md | Cycle-10 active-wiring audit |
| 2026-06-01-cycle10-project-migrate-canonicalization-adversarial-audit.md | Cycle-10 project-migrate canonicalization audit |
| 2026-06-01-cycle9.3-predicate-harden-adversarial-audit.md | Cycle-9.3 predicate-harden audit (CRITICAL termination finding) |
| 2026-06-01-pi-context-substrate-model-before-after.md | Three-layer identity model narrative |
| 2026-06-02-changelog-backfill-and-forward-discipline.md | Changelog backfill + forward discipline |
| 2026-06-02-context-foldin-and-verifydupe-adversarial-audit.md | Fold-in + verify-dupe audit |
| 2026-06-02-coupling-fix-adversarial-audit.md | Test/substrate coupling-fix audit |
| 2026-06-02-pi-context-doc-survey-and-source.md | pi-context doc survey + source-of-truth |
| 2026-06-02-pi-context-doc-update-adversarial-audit.md | Doc-update audit (HIGH promote-item misdescription) |
| 2026-06-03-changelog-backfill-audit-state.md | Changelog backfill audit state |
| 2026-06-03-merge-release-sequence-backbone.md | Merge→release sequence backbone |
| 2026-06-03-pi-context-cli-design-ledger.md | pi-context-cli design ledger |
| 2026-06-03-using-pi-spec-2.md | using-pi-context block-kind spec |
| 2026-06-04-cli-op-registry-lossy-projection.md | Attestation-blind op-registry projection gap |
| 2026-06-05-cli-ops-scripts-parity-survey.md | CLI↔ops↔scripts parity survey (R-0003) |
| 2026-06-05-disinfect-schema-descriptions.md | Schema-description disinfection guidance |
| 2026-06-05-shared-cli-core-design.md | Shared CLI-core design (R-0001) |
| 2026-06-05-substrate-portability-export-import.md | Substrate export/import portability (R-0002) |
| 2026-06-06-pm-hierarchy-success-criteria-model-draft.md | PM-hierarchy success-criteria model draft |
| 2026-06-06-substrate-cli-bypass-prevention-hook-spec.md | Substrate-CLI-bypass-prevention hook spec |
| 2026-06-07-active-arc-ordering-tracker.md | Active-arc ordering tracker |
| 2026-06-07-cli-write-path-ux-research.md | CLI write-path UX research (R-0007) |
| 2026-06-07-convention-articulation-backfill.md | Convention-articulation backfill (FEAT-007/TASK-033) |
| 2026-06-07-fgap-046-schema-merge-reframe.md | FGAP-046 schema-merge reframe (R-0008) |
| 2026-06-07-pi-cli-command-pattern-heuristic.md | pi CLI command-form heuristic (R-0006) |
| 2026-06-07-pi-context-cli-release-readiness-audit.md | CLI/update release-readiness audit (9 FGAPs named) |
| 2026-06-07-pi-context-global-install-pattern.md | Global-install pattern (R-0005) |
| 2026-06-07-pi-context-pi-bound-cli.md | pi-bound CLI port spec (R-0004) |
| 2026-06-07-update-blast-radius.md | update blast-radius analysis |
| 2026-06-08-Meta-Usage-Statement-Draft-The-Organizing-Principles-of-Framework .md | Framework organizing-principles statement (R-0010) |
| 2026-06-09-cli-help-ux-research.md | CLI help UX research / landscape (R-0011) |
| 2026-06-09-rhetorical-register-block-audit.md | Rhetorical-register violations across 17 block kinds |
| 2026-6-05 Extracting all agent concerns from pi-workflows draft.md | Agent-concern extraction from pi-workflows (draft) |
| june 6 all gaps and issues in the pi-context → jit-agents rendering pipeline.md | jit-agents rendering-pipeline gaps (R-0009) |
| feat-using-pi-context-substrate.md | using-pi-context self-demo block design |
| Pi-Context-Feedback-LLM.md | LLM-perspective pi-context UX feedback |

### 2026-06-10..06-20 (stories / coverage audits / config-migration / process audits)

| File | Subject |
|---|---|
| 2026-06--08-pi-monitors-rhetorical-register-ideas.md | Monitor rhetorical-register ideas |
| 2026-06-10-array-param-csv-shorthand-gap.md | CLI CSV-shorthand experience gap (→FGAP-084) |
| 2026-06-10-block-name-vs-kind-id-resolution-gap.md | --block name-vs-kind resolution gap (→FGAP-083) |
| 2026-06-10-story-completion-invariant-engine-audit.md | Story-completion invariant-engine audit (→TASK-047/FGAP-082) |
| 2026-06-10-update-blocked-diagnostic-task-DRAFT.md | update blocked-diagnostic task draft |
| 2026-06-10-update-dryrun-live-and-transactional-seams.md | update dry/live transactional seams (R-0012) |
| 2026-06-10-user-stories-block-DRAFT.md | user-stories block proposal draft |
| 2026-06-10-user-stories-intention-and-detangle.md | user-stories intention detangle |
| 2026-06-13-context-status-validity-audit.md | Status-validity audit (all items VALID) |
| 2026-06-13-docs-coherence-readmes-vs-skills.md | README↔SKILL coherence audit (6 drift gaps) |
| 2026-06-13-hook-edit-forensic-trace-for-excision.md | TASK-060 hook-edit forensic excision trace |
| 2026-06-13-install-surface-and-guard-scope-gaps.md | Install-surface + guard-scope gaps (R-0014) |
| 2026-06-13-pi-tool-surface-and-pi-bound-exclusion.md | pi tool surface + pi-bound exclusion (R-0013) |
| 2026-06-14-conversation-signal-vs-chaos-detangle.md | Session signal/noise detangle |
| 2026-06-14-dec0018-fgap076-relation-type-direction-audit.md | DEC-0018↔FGAP-076 relation-type direction audit (→FGAP-090) |
| 2026-06-14-decisions-open-but-decided-audit.md | Decisions open-but-decided audit (none found) |
| 2026-06-14-edge-coverage-forcing-function-investigation.md | Edge-coverage forcing-function investigation (→FGAP-091) |
| 2026-06-14-gap-task-feature-coverage-audit.md | Gap→Task→Feature→Release coverage audit |
| 2026-06-14-relation-graph-completeness-prior-art-investigation.md | Relation-graph completeness prior-art (→FGAP-091) |
| 2026-06-14-session-process-violations-audit.md | Session process-violations audit |
| 2026-06-14-substrate-relation-graph-completeness-audit.md | Relation-graph completeness audit (→FGAP-091) |
| 2026-06-14-task-062-write-validator-adversarial-probe.md | TASK-062 edge write-validator probe |
| 2026-06-15-context-contracts-plan-forensic-evaluation.md | Context-contracts plan forensic eval (R-0016) |
| 2026-06-15-pi-context-leverage-audit.md | pi-context leverage audit (R-0015) |
| 2026-06-16-best-next-steps-determination.md | Best-next-steps sequencing (R-0019) |
| 2026-06-16-milestone-block-spec-FGAP-037-evaluation.md | Milestone-block spec / FGAP-037 evaluation |
| 2026-06-16-phase-block-dev-process-control-plane.md | Phase-block control-plane validation (R-0018) |
| 2026-06-16-task-gated-by-item-catalog-config-drift.md | Catalog↔config relation-type drift (R-0017) |
| 2026-06-17-task020-orchestrator-deviation-audit.md | TASK-020 orchestrator-deviation audit |
| 2026-06-18-config-migration-corrected-implementation-steps.md | Config-migration corrected impl steps (FGAP-095) |
| 2026-06-18-config-migration-design-feasibility.md | Config-migration design feasibility (FGAP-095) |
| 2026-06-18-config-migration-proposal-validation.md | Config-migration proposal validation (FGAP-095/099) |
| 2026-06-18-isolated-proving-ground-method.md | Proving-ground method (issue-004 fix) |
| 2026-06-18-proving-ground-prior-art-research.md | Proving-ground prior-art (issue-004/006/007 fix) |
| 2026-06-19-block-schema-version-stamping.md | Block schema_version stamping (FGAP-099) |
| 2026-06-19-config-schema-evolution-gap-decomposition.md | Config-schema-evolution gap decomposition (FGAP-095/096/097) |
| 2026-06-19-field-of-view.md | Project field-of-view meta |
| 2026-06-19-gaps-issues-sibling-parity-shape.md | Gaps↔issues sibling-parity shape (FGAP-098) |
| 2026-06-19-invalid-item-effect.md | Effect of an invalid item on substrate |
| 2026-06-19-pi-monitors-deterministic-draft-1.md | Deterministic pi-monitors draft |
| 2026-06-19-promote-cli-prefix-poisoning-safety-defect.md | promote-cli prefix-poisoning defect (issue-006) |
| 2026-06-19-sub-element-identity-gap.md | Sub-element identity gap (FGAP-100) |
| 2026-06-19-task068-update-impact.md | TASK-068 update impact |
| 2026-06-19-task069-process-failure-audit.md | TASK-069 process-failure audit |
| 2026-06-20-canonical-process-steps-catalog.md | Canonical dev-pipeline 14-step catalog |
| 2026-06-20-fgap017-criterion3-pain-archaeology.md | FGAP-017 criterion-3 pain archaeology |
| 2026-06-20-issue-006-fix-determination.md | issue-006 fix determination |
| 2026-06-20-repo-current-state.md | Repo current-state snapshot |
| 2026-06-20-task020-criterion3-history-trace.md | TASK-020 criterion-3 history trace |
| 2026-06-20-task069-status-and-failure-signal.md | TASK-069 status + failure-signal |

---

## 2. Analysis → open-work matrix

Files that relate to an OPEN substrate item (task / gap / issue / feature), with the CLI-confirmed item + status, and whether the analysis content is **absorbed** into that item or still lives **only in the md**.

| Analysis file | Open item (CLI-confirmed) | Absorbed vs only-in-md |
|---|---|---|
| 2026-06-07-pi-context-pi-bound-cli.md → … | — | (FEAT-005 complete; not open) |
| 2026-06-05-cli-ops-scripts-parity-survey.md | FGAP-019/020 **closed**; surveyed gaps 021–026 **closed** | Absorbed (R-0003); the *parity-gate* residual lives in FEAT-008 (complete) |
| 2026-06-04-cli-op-registry-lossy-projection.md | **No open item** — proposes 3 FGAPs (attestation/registry-coverage/parity) never filed | **Only in md** (see §3) |
| 2026-06-07-pi-context-cli-release-readiness-audit.md | FGAP-021..026/062/063/064 **closed**; FGAP-031 **closed**; FEAT-006 **complete** | Absorbed; named FGAPs now closed |
| 2026-06-07-fgap-046-schema-merge-reframe.md | FGAP-046 **closed** (resolved by FEAT-009/update arc) | Absorbed (R-0008); decision routes now historical |
| 2026-06-10-update-dryrun-live-and-transactional-seams.md | FGAP-066 **closed**; surfaces partial-application-legibility = FGAP-076 **identified (OPEN)** | Partly absorbed (R-0012); FGAP-076 carries the open residual |
| 2026-06-10-story-completion-invariant-engine-audit.md | **TASK-047 (planned)** / FGAP-082 (identified) | Absorbed — scopes TASK-047 to a config-declared `advancer-completion` class |
| 2026-06-09-rhetorical-register-block-audit.md | **TASK-044 (planned)** / FGAP-074 (identified) | Partly absorbed — broaden-targets + closure-time-mutation finding live mostly in md (see §4) |
| 2026-06-14-edge-coverage-forcing-function-investigation.md | **FGAP-091 (identified, OPEN)**; relates to **TASK-041 (planned)** | Absorbed — FGAP-091 is the class filing; TASK-041 is the precedent pattern |
| 2026-06-14-substrate-relation-graph-completeness-audit.md | **FGAP-091 (identified, OPEN)** | Absorbed (Part B/C); Part A premise stale (see §5) |
| 2026-06-14-relation-graph-completeness-prior-art-investigation.md | **FGAP-091 (identified, OPEN)** | Absorbed (prior-art precondition); stale Part-C conclusion |
| 2026-06-14-dec0018-fgap076-relation-type-direction-audit.md | **FGAP-090 closed**; relates to **FGAP-076 (OPEN)** | Absorbed — FGAP-090 filed + closed from this audit |
| 2026-06-16-task-gated-by-item-catalog-config-drift.md | **FGAP-094 (identified, OPEN)** → **TASK-066 + TASK-067 (planned)** | Absorbed (R-0017); plus folds in phase_depends_on |
| 2026-06-16-phase-block-dev-process-control-plane.md | **TASK-020 (completed)** + **TASK-066 (planned)** + TASK-047 (planned); FGAP-017 | Absorbed (R-0018); phase-positioning focus gated on now-completed TASK-020 |
| 2026-06-16-best-next-steps-determination.md | DAG over OPEN tasks: TASK-020→021, TASK-004→005, TASK-066→067; FGAP-089 | Absorbed (R-0019) as advisory sequencing |
| 2026-06-15-pi-context-leverage-audit.md | FGAP-011 (accepted), **FGAP-061** (identified), FEAT-004 (proposed), **FGAP-091** (identified) | Absorbed (R-0015); discipline-vs-gap split |
| 2026-06-15-context-contracts-plan-forensic-evaluation.md | Names: work_order_dispatches_task unregistered; relates **TASK-041 (planned)** | Absorbed (R-0016) |
| 2026-06-14-gap-task-feature-coverage-audit.md | Coverage map over OPEN FEAT-001..004 + TASK-003/004/005/020/021/022/027/044/047 + ~38 open gaps | Cited by R-0015; structural coverage observations |
| 2026-06-18-config-migration-* (3 files) | **FGAP-095 (identified, OPEN)**; FGAP-099 (identified) | **Only in md** (design complete, not yet a TASK; see §3) |
| 2026-06-19-config-schema-evolution-gap-decomposition.md | **FGAP-095/096/097 (all identified, OPEN)** | **Only in md** — decomposition not yet tasked |
| 2026-06-19-block-schema-version-stamping.md | **FGAP-099 (identified, OPEN)** | **Only in md** |
| 2026-06-19-sub-element-identity-gap.md | **FGAP-100 (identified, OPEN)** | Absorbed — FGAP-100 is the filing |
| 2026-06-19-gaps-issues-sibling-parity-shape.md | **FGAP-098 (identified, OPEN)** | Absorbed — spec for FGAP-098; not yet tasked |
| 2026-06-10-array-param-csv-shorthand-gap.md | **FGAP-084 (identified, OPEN)** | Absorbed — FGAP-084 is the class filing |
| 2026-06-10-block-name-vs-kind-id-resolution-gap.md | **FGAP-083 (identified, OPEN)** | Absorbed — FGAP-083 is the class filing |
| 2026-06-13-install-surface-and-guard-scope-gaps.md | FGAP-088 **closed** (TASK-059); **FGAP-089 (identified, OPEN)** | Absorbed (R-0014); FGAP-089 open, sole addresser TASK-060 cancelled |
| 2026-06-13-hook-edit-forensic-trace-for-excision.md | **FGAP-089 (OPEN)**; TASK-060 **cancelled** | Absorbed — excision recipe for the cancelled-task reversion |
| 2026-06-19-promote-cli-prefix-poisoning-safety-defect.md | issue-006 **resolved** | Absorbed — defect closed |
| 2026-06-18-isolated-proving-ground-method.md / -prior-art | issue-004 **resolved** (TASK-069) | Absorbed — method behind the promote-cli fix |
| 2026-06-19-task069-process-failure-audit.md / 2026-06-20-task069-* | TASK-069 (issue-004 fix) | Process audits of a completed fix |
| 2026-06-20-fgap017-criterion3-pain-archaeology.md / 2026-06-20-task020-criterion3-history-trace.md | TASK-020 **completed** / FGAP-017 **identified** | Archaeology behind the just-completed TASK-020 |
| 2026-05-23-fgap-074-rename-decomposition.md | FGAP-074 (identified, OPEN) — relates TASK-044 | Execution plan; rename arc largely landed, TASK-044 carries the residual broaden |
| 2026-05-17-config-declared-invariants-design.md | DEC-0025 (enacted) | Spec material; invariant engine shipped |

**Files relating only to CLOSED / completed / cancelled work** (historical, not open): the entire 2026-05-31 content-addressed-identity arc (execution-plan + identity specs v1/v2/v3 + cycle2–9.2 + phase0 audits + spec-comparison), the 2026-06-01 cycle-10 audits, 2026-06-02 fold-in / coupling / doc-update audits, 2026-05-25 fgap-089/090/103 runtime demos, 2026-05-25 skill-collision-fix, the rename-decomposition / rename-touched-items pair, 2026-05-29-fgap-037-canonical-resolution (FGAP-037 closed), 2026-06-07-convention-articulation-backfill (FEAT-007 complete), 2026-06-13-context-status-validity-audit + 2026-06-14-decisions-open-but-decided-audit (clean audits), 2026-06-14-task-062-write-validator-adversarial-probe (TASK-062 completed).

---

## 3. Unaddressed operational problems (documented defect/gap, NO corresponding open substrate item)

| Analysis file | Problem | Tracking status |
|---|---|---|
| **2026-06-04-cli-op-registry-lossy-projection.md** | ~10 write ops drop `DispatchContext`/writer in the op-registry projection; on attestation-required schemas they write unattested. Proposes 3 parent FGAPs (attestation channel; op-registry library-write coverage; parity enforcement). | **No FGAP filed.** The three proposed gaps were never created. **Verify against the current open-gap set before filing** (prior-art precondition) — FGAP-093 (dangling-endpoint write guard) and FGAP-094 (catalog⊇consumed parity) are adjacent but not the same class. |
| **2026-06-17-task020-orchestrator-deviation-audit.md** | A behavioral divergence between TASK-020's implementation and its filed acceptance criteria, found post-merge. TASK-020 is **completed** in the substrate; the deviation is not surfaced as an issue/gap. This is a closure-verification gap, not a code gap. | **No open item.** Needs a decision: re-verify TASK-020 against criteria, or file the divergence. Pair with 2026-06-20-task020-criterion3-history-trace.md. |
| **2026-06-02-pi-context-doc-update-adversarial-audit.md** | HIGH: `promote-item` misdescribed (nested-array→top-level role actually belongs to `canonicalize-substrate`) across ~5 doc spots (pkg README + skill-narrative + SKILL.md) in a shipped release. | **No open issue.** A docs-correction; confirm whether later doc work already fixed it before filing. |
| **2026-06-13-docs-coherence-readmes-vs-skills.md** | 6 README↔SKILL drift gaps (stale `.project`→`.context` refs, missing bootstrap/accept-all step, extension undercount, README asymmetry). | **No open item.** Candidate decomposition under the docs-surface-sync convention. |
| 2026-05-21-main-agent-as-jit-agent-feasibility.md | In-session jit-agent persona feasibility (HIGH-but-partial; no forced-output-contract on the interactive main agent). | No FGAP/FEAT — research-only; file only if pursued. |
| 2026-05-22-context-plugin-feasibility.md | Third-party portable conception install (multi-source onboarding + provenance + conflict resolution); names a candidate decision. | No DEC/FEAT filed for the multi-source policy. (Partially overlaps FEAT-001 clone + R-0002 export/import, which are filed.) |
| 2026-05-23-pi-tui-onboarding-banner-research.md | No dedicated pi-TUI onboarding-banner injection API for extensions. | No FGAP — research-only; file only if onboarding flow needs it. |
| 2026-05-10-tsx-barrel-pi-coding-agent-flake.md | tsx barrel-import resolution flake affecting CLAUDE.md example paths. | No TASK/FGAP; "candidate paths" only. |

Lower-confidence / likely-already-tracked but worth a prior-art check: 2026-05-03-monitor-fragility-expected-vs-surprising.md (monitor write-path defects). The 2026-06-19-config-schema-evolution / block-schema-version-stamping / config-migration files document FGAP-095/096/097/099 which ARE filed (identified) — the gap there is **no TASK decomposition yet**, not missing tracking.

---

## 4. Research-surfacing candidates (per the "Analysis-MD → Research block" heuristic)

The heuristic: grounded investigations / feasibility / comparisons / audits / landscapes are research candidates; plans / execution-ledgers / specs / cycle-reports / roadmaps / decision-frames / scratch are NOT.

**Already surfaced (NOT candidates — they ARE the `findings_document` of an R-item):** the 19 files mapped to R-0001..R-0019 in §1 (e.g. shared-cli-core-design, substrate-portability, cli-ops-scripts-parity-survey, pi-bound-cli, global-install-pattern, cli-command-pattern-heuristic, cli-write-path-ux-research, fgap-046-schema-merge-reframe, jit-agents-rendering-pipeline, Meta-Usage-Statement, cli-help-ux-research, update-dryrun-live, pi-tool-surface, install-surface-and-guard-scope, pi-context-leverage-audit, context-contracts-forensic-eval, task-gated-by-item-drift, phase-block-control-plane, best-next-steps-determination).

**Genuine research-surfacing candidates (grounded investigation/audit/comparison/landscape NOT yet an R-item):**

| File | Type | Why a candidate |
|---|---|---|
| 2026-05-26-pi-subagents-eval-vs-jit-intentions.md | comparison | Field-standard dispatch (pi-subagents) vs jit user-intentions; adopt/diverge verdicts; grounds FEAT-004/005 design. |
| 2026-05-30-jit-agents-30k-foot-breaks.md | audit (framework-gap) | 8 structural breaks across jit-agents; grounds the agent-layer parity gap set. |
| 2026-05-30 Substrate JIT-Agents Contradiction Audit.md (+ -verification.md) | audit | Substrate↔jit-agents contradiction enumeration, independently verified. |
| 2026-05-29-cc-workflows-vs-pi-workflows-recon.md | comparison | Claude-Code workflows API vs pi-workflows engine inventory. |
| 2026-05-28-launch-script-harness-canonical-audit.md | audit | Empirical tool-surface vs canonical intention (DEC-0014/0044/0047). |
| 2026-05-28-hybrid-3-composite-tools-canon-eval.md | audit | Composite-tools design vs canon coherence grid. |
| 2026-05-25-list-tools-truncation-observed-behavior.md | observational audit | Agent partial-read-as-complete failure mode under truncation. |
| 2026-05-25-pi-self-docs-and-extend-mechanism.md | landscape | Pi's doc-lookup / "extend pi" mechanism (no dedicated docs service). |
| 2026-05-06-context-packet-comparison.md | comparison | gsd-build/context-packet vs pi-context. |
| 2026-05-05-pm-vocabulary-prior-art-survey.md / 2026-05-14-pm-vocabulary-survey-full-analysis.md | landscape | PM-vocabulary prior-art survey (large, grounded). |
| 2026-04-15-expression-language-comparison.md | comparison/feasibility | CEL-vs-alternatives for the predicate language. |
| 2026-04-28-pi-mono-alignment-audit.md | audit | Alignment vs canonical pi-mono patterns. |
| 2026-06-18-proving-ground-prior-art-research.md | landscape | Proving-ground prior-art (pytest/Terraform/Docker); method behind issue-004 fix. |
| 2026-06-19-invalid-item-effect.md | grounded-investigation | Effect of an invalid item across substrate ops (if grounded against code). |

Borderline (propose, do not auto-file): 2026-05-21-pi-sdk-0.74-to-0.75-investigation.md (version landscape), 2026-05-22-context-plugin-feasibility.md (feasibility), 2026-05-25-system-thesis-jit-everything-vision-candidate.md (vision, not strictly research), 2026-05-26-decisions-substrate-revision-grounding.md (substrate-semantics audit). Per the heuristic the user decides each; this report only nominates.

---

## 5. Stale / superseded

| File | Reason | Superseded by |
|---|---|---|
| 2026-05-08-poc-plan-A-fix-forward.md | Arc-envelope plan voided by the arc reset to 04907f3 | 2026-05-01-substrate-arc-distillation.md |
| 2026-05-08-poc-plan-B-revert.md | Same arc reset | 2026-05-01-substrate-arc-distillation.md |
| 2026-05-26-roadmap-by-extension.md | Self-marked stale; per-extension status snapshot lags reality | live `context-status` + later coverage audits |
| 2026-05-30-jit-agents-B-C-A-investigation.md | Investigation-phase; shape-variance not applied; no substrate filing | jit-agents-spec-v2 + later agent-layer work |
| 2026-06-03-merge-release-sequence-backbone.md | Process ledger; releases since superseded | CHANGELOG + release history |
| 2026-06-03-changelog-backfill-audit-state.md | Audit closed | 2026-06-02-changelog-backfill-and-forward-discipline.md (resolved) |
| 2026-06-14-relation-graph-completeness-prior-art-investigation.md (Part A) + 2026-06-14-substrate-relation-graph-completeness-audit.md (Part A) | Part-A premise (DEC-0018↔FGAP-076 edge absent) is CONTRADICTED — the edge is present; Part-C "file if not tracked" conclusion is stale (FGAP-091 IS the filing) | FGAP-091 |
| 2026-06-08-Meta-Usage-Statement-Draft (R-0010) | 3 incorrect + 2 stale claims (non-existent `open` status bucket; FGAP-017/018 misattribution; defaults-scope; roadmap.json absent) — corrected in-body | corrections embedded; R-0010 notes them |
| 2026-05-31 content-addressed-identity arc (execution-plan, identity specs v1/v2/v3, cycle2–9.2 audits, phase0, spec-comparison) | Cycle/verification ledgers for a SHIPPED+MERGED arc | the merged arc itself |
| 2026-06-01 cycle-10 audits + 2026-06-02 fold-in/coupling/doc-update audits | Cycle-closure ledgers, arc complete | merged work |

These remain useful as historical/forensic reference; "stale" = content no longer describes current truth, not "delete."

---

## Appendix A — OPEN framework-gaps catalog (identified / accepted)

`id | status | title`

- FGAP-002 | accepted | No substrate clone/import — cross-project substrate reuse has no op-driven path
- FGAP-004 | accepted | No structure-aware git merge driver — substrate files fall to git line-merge
- FGAP-005 | accepted | Ordered item-ref collections need a convergent sequence field-kind
- FGAP-007 | accepted | Ordering relation_type names read opposite to the parent/child convention
- FGAP-011 | accepted | No release/version vocabulary — releases + changelog grouping not bindable
- FGAP-016 | identified | Read cap measures pretty/line form while --json emits compact
- FGAP-017 | identified | context-current-state hardcodes framework-gaps/tasks/phase — inert on custom vocab
- FGAP-018 | identified | context-status lifecycle metrics special-case stock kinds
- FGAP-033 | identified | Pre-identity substrate schema re-sync unsupported
- FGAP-034 | identified | Phase schema carries no success_criteria field
- FGAP-035 | identified | Task success_criteria are objects, replacing acceptance_criteria
- FGAP-036 | identified | Phase/task criteria must be binary outcome-based or invalid
- FGAP-038 | identified | Verification block retired; proof lives on the task criterion
- FGAP-040 | identified | Story schema: id, description, status, type
- FGAP-042 | identified | Roadmap is a view over ordered milestones; ordering is a relation
- FGAP-043 | identified | Schema descriptions carry no per-block rhetorical criteria
- FGAP-044 | identified | No field-granular schema-edit op
- FGAP-045 | identified | No one-step block-kind rename tool
- FGAP-052 | identified | No convention governs substrate bootstrap-state provisioning
- FGAP-053 | identified | No convention governs substrate data-model representation + field-kinds
- FGAP-054 | identified | No convention governs release cadence + changelog-accrual
- FGAP-055 | identified | No convention governs where the read/output safety cap is enforced
- FGAP-056 | identified | No convention governs op/script/CLI surface topology + duplication
- FGAP-057 | identified | No convention governs canonical-process governance vs unplanned arch change
- FGAP-058 | identified | No convention governs npm publish-unit / package topology
- FGAP-059 | identified | No convention governs implementation-mechanism choice (in-process vs subprocess)
- FGAP-061 | identified | ready/blocked derivation ignores *_gated_by_item gating relations (FORWARD slice)
- FGAP-065 | identified | update merges a new block_kind config decl but does not …
- FGAP-067 | identified | update does not reconcile a catalog registry entry whose body diverged
- FGAP-071 | identified | gap-arc-coherence is a review convention but unenforced (no invariant)
- FGAP-074 | identified | Past-filed context atoms violate rhetorical-register at scale
- FGAP-076 | identified | update result does not make partial application legible
- FGAP-082 | identified | Invariant engine cannot express exists-a-complete-advancer rules
- FGAP-083 | identified | --block-taking ops ignore the config-declared prefix→block mapping
- FGAP-084 | identified | CSV shorthand is a one-param special case, not type-driven normalization
- FGAP-085 | identified | update-block-item cannot delete a field
- FGAP-086 | identified | AJV validator cache keyed by unversioned $id
- FGAP-087 | identified | A block whose array key holds a non-array value takes the no-items resync path
- FGAP-089 | identified | PreToolUse enforcement hooks scope on op-shape + block-name, not target substrate
- FGAP-091 | identified | No forcing function for warranted non-invariant closure-table edges
- FGAP-092 | identified | update has no specified transactional boundary (schema loop vs registry)
- FGAP-093 | identified | Write-time edge guard accepts a dangling/non-existent endpoint
- FGAP-094 | identified | Packaged catalog relation_types is a strict subset of live config
- FGAP-095 | identified | Config-schema evolution has no load-time migration path
- FGAP-096 | identified | Config repair impossible once stored config is invalid (validate-before-repair)
- FGAP-097 | identified | No additive / expand-contract discipline for config-schema changes
- FGAP-098 | identified | Issues are not a gap-sibling first-class open-work kind
- FGAP-099 | identified | Block data carries no schema_version
- FGAP-100 | identified | A sub-element of a substrate item has no identity

(48 items. FGAP-019..032, 037, 039, 041, 046–051, 060, 062–064, 066, 068–070, 072–073, 075, 077–081, 088, 090 are CLOSED; FGAP-001/003 closed.)

## Appendix B — Research block index (R-0001..R-0019, all complete) → findings_document

R-0001 shared-cli-core-design · R-0002 substrate-portability-export-import · R-0003 cli-ops-scripts-parity-survey · R-0004 pi-context-pi-bound-cli · R-0005 pi-context-global-install-pattern · R-0006 pi-cli-command-pattern-heuristic · R-0007 cli-write-path-ux-research · R-0008 fgap-046-schema-merge-reframe · R-0009 june-6 jit-agents rendering pipeline · R-0010 Meta-Usage-Statement-Draft · R-0011 cli-help-ux-research · R-0012 update-dryrun-live-and-transactional-seams · R-0013 pi-tool-surface-and-pi-bound-exclusion · R-0014 install-surface-and-guard-scope-gaps · R-0015 pi-context-leverage-audit · R-0016 context-contracts-plan-forensic-evaluation · R-0017 task-gated-by-item-catalog-config-drift · R-0018 phase-block-dev-process-control-plane · R-0019 best-next-steps-determination.
