# Arc-tracking substrate authoring — analysis-doc evidence map

**NOTE ON OUTPUT LOCATION**: Task brief specified output at `/Users/david/Projects/workflowsPiExtension/analysis/2026-05-14-arc-tracking-substrate-decision-sharpening.md`. Plan mode is active and restricts writes to this plan file path only. Content is identical to what would have been written to the analysis path; relocate via `mv` after plan-mode exits.

- Investigation timestamp: 2026-05-13T20:54:53Z (date reset to 2026-05-14 mid-investigation per system reminder)
- Repo HEAD: `93a997ff3b3b02738e68172883c398be7fb735f7` (branch `pi-context-rebuild`)
- Docs analyzed: 21
- Substrate blocks queried: `decisions.json`, `framework-gaps.json`, `tasks.json`, `research.json`, `features.json`, `spec-reviews.json`, `layer-plans.json`, `verification.json`, `phases/{1,2,3,4}.json`, `conformance-reference.json`, `conventions.json`, `issues.json`, `architecture.json`, `domain.json`, `requirements.json`, `rationale.json`, `project.json`

---

## Part A — Doc content not yet in substrate

### A.1 — `analysis/context-block-design.md`

| Proposition | Reified? | Substrate-block:item OR "not reified" |
|---|---|---|
| Live block kind inventory with array_key + ID prefix + layer (lines 17-43); claims `roadmap` / `phase` / `plan` are "registry only — not installed" | Partial | `phases/{1..4}.json` exist (pre-FGAP-026) but registry-version-of-roadmap/plan absent; not yet authored to substrate as a block-kind registry item |
| Layer assignments L1-L5 across block kinds (lines 49-54) | Not reified | No `config.json` carrying `config.layers[]` exists; not in any block |
| Closure-table relations as canonical primitive per DEC-0009+DEC-0013 (line 58) | Reified | `decisions.json:DEC-0009` (enacted), `decisions.json:DEC-0013` (enacted) |
| Open question: plan-mode plan-content reification slot (line 70) | Not reified | No FGAP filed; surfaces `feedback_plan_mode_step_one_substrate_write.md` already |
| Open question: item-level context injection projection shape — partial-rendering 4th shape (line 74) | Not reified | FGAP-038 closed but partial-render variant not surfaced as new FGAP |
| Open question: explore-output as block kind (line 78) | Not reified | FGAP-034 filed (orchestrator-side intermediates lack block kinds); broader explore-block question not separately filed |
| Open question: subagent dispatch records as block kind (line 82) | Not reified | Not filed |
| Design discipline reminder: schema lands with macro as unit (line 91) | Partial | FGAP-037 filed (per-block-kind macros missing for 6 newer kinds) |
| `source_id` field is DEC-0013 violation (line 92) | Partial | DEC-0013 covers FK-as-field forbiddance; specific `source_id` instance not catalogued |

### A.2 — `analysis/2026-05-05-config-as-vocabulary-substrate.md`

| Proposition | Reified? | Substrate-block:item OR "not reified" |
|---|---|---|
| Config carries `layers[]` / `block_kinds[]` / `status_buckets` / `display_strings` / `naming` (lines 13-27) | Not reified | No `config.json` exists in this repo's `.project/`; schema absent from `.project/schemas/` per `2026-05-14-arc-tracking-substrate-open-decisions.md:3` |
| `ID_PREFIX_TO_BLOCK` derived from `config.block_kinds` closes issue-089 class structurally (line 31) | Not reified | issue-089 not visible in `issues.json` (91 items but no issue-089 surfaced); claim itself not in substrate |
| `STATUS_VOCABULARY` derived from `config.status_buckets` enacts FGAP-013 (line 32) | Partial | `framework-gaps.json:FGAP-013` already `closed`; mechanism implementation not in substrate as TASK |
| Prefix-rename is expensive because prefix appears as substring in every relations.json edge (line 49) | Not reified | Architectural claim not filed as DEC or FGAP |
| Two prefix-rename mitigation paths: opaque-immutable vs rename machinery `/project rename-prefix` (lines 51-52) | Not reified | Not a DEC; ceremony not filed |
| Resolves issue-089 PLAN- collision / ROADMAP-/PHASE-/MILESTONE- silent gaps / ADR-vs-FGAP terminology / FGAP-013 (lines 54-58) | Partial | FGAP-013 closed; PLAN- collision class not separately filed |
| Does NOT resolve FGAP-006 / nested-array `buildIdIndex` blind spot / FGAP-004 (lines 61-64) | Partial | FGAP-006 closed; FGAP-004 closed; `buildIdIndex` blind spot not filed |
| Closing note: ship engineering vocabulary + display name overlay + skill + script tools to rename per human prefs (line 68) | Not reified | Not filed |

### A.3 — `analysis/2026-05-01-blocks-schemas-macros-contract-synthesis.md`

| Proposition | Reified? | Substrate-block:item OR "not reified" |
|---|---|---|
| Blocks/schemas/macros are one contract; only validate-shape implemented (line 16) | Partial | DEC-0013 + DEC-0017 + DEC-0020 enact substrate-canon; principle itself not stated as DEC |
| Three simultaneous schema roles: read / write / validate (lines 18-24) | Not reified | "Bidirectional schema contract" principle not in `decisions.json` |
| Six structural gaps: hierarchical / per-scope findings / materialized views / authorship / state-machine / schema versioning (lines 130-143) | Partial | FGAP-001 closed, FGAP-002 identified, FGAP-003 identified, FGAP-004 closed, FGAP-005 identified, FGAP-006 closed |
| Naming mismatches: decisions=ADR / rationale duplicates ADR / phase=informal vs milestone (line 144) | Not reified | Vocabulary decision still open per HANDOFF; not filed as DEC |
| `analysis/` markdowns are de facto research layer with no schema (line 86) | Reified | `research.json:R-0001..R-0011` enacts research substrate |
| FGAP-007 staleness engine — runtime that reads stale_conditions + transitions automatically (line 120) | Reified | `framework-gaps.json:FGAP-007` identified |
| Authorship + grounding + state-transition validation are same gap from three angles (line 158) | Not reified as single DEC | FGAP-004 closed, FGAP-005 + FGAP-024 identified; unifying framing not filed |

### A.4 — `analysis/2026-05-01-substrate-arc-distillation.md`

| Proposition | Reified? | Substrate-block:item OR "not reified" |
|---|---|---|
| F-019 biome.json schema URL pin drift (line 30) | Not reified | Not in `issues.json` / `framework-gaps.json` |
| F-020 D3 project-tier shadows half-implemented across 3 packages (line 44) | Not reified | Not filed |
| F-021 monitor-finding writes bypass block-api.ts (line 54) | Reified | issue-065 in `issues.json` (resolved) + DEC-0021 |
| F-022 `~/.pi/agent/templates/` zero-consumer (line 65) | Not reified | Not filed |
| F-023 synthesis-doc audit-gap canonicality binding (line 76) | Not reified | Not filed |
| F-024 JSON Schema draft-07 precludes `$vocabulary` (line 87) | Not reified | Not filed |
| F-025 agent runtime keeps foreground-completed agents resumable; no ListTasks (line 99) | Not reified | Harness-level; not filed in substrate |
| B-1 cascade R1/R2/R3 root causes (line 116) | Not reified | Methodology meta-finding; not in substrate by design |
| B-3 extraction-first methodology Phase 0..6 (line 128) | Not reified | Methodology meta-finding; not in substrate by design |
| Q1 macro tier — collapse to two-tier (line 158) | Not reified | Tier-D research caveat; not filed |
| Q3 authored_by source — plumb WriteContext (line 163) | Reified | DispatchContext attestation enacted in `block-api.ts`; not surfaced as DEC explicitly |
| Q4 `target` topology — explicit `x-` keyword (line 168) | Not reified | Not filed; F-024 territory |
| Q6 form-supported schema subset — pi-tui (line 174) | Not reified | Not filed |
| Q7 cross-reference dispatcher factoring — three primitives (line 180) | Partial | DEC-0017 + closure-table walks enacted; factoring rationale not in substrate |
| Q9 migration field operations DSL (line 188) | Not reified | Not filed |

### A.5 — `analysis/2026-05-01-ceremony-ideas.md`

| Proposition | Reified? | Substrate-block:item OR "not reified" |
|---|---|---|
| `/project new` schemas-first onboarding ceremony (line 15) | Partial | `/project install` + `context-init` (TASK-026 Phase 6) covers this; ceremony not filed as FGAP |
| `/project new-phase` item-authoring ceremony (line 19) | Not reified | Not filed; relevant to Decision 4 + 7 |
| `/project edit-item` future ceremony (line 23) | Not reified | Not filed |
| `/project archive-item` future ceremony (line 27) | Not reified | Not filed |

### A.6 — `analysis/2026-05-01-github-issues-migration-inventory.md`

| Proposition | Reified? | Substrate-block:item OR "not reified" |
|---|---|---|
| Issue candidate enumeration (125 total) (line 296) | Partial | issues.json has 91 items (snapshot drift since 2026-05-01) |
| Ambiguity: PHASE-NNN milestones vs issues (line 320) | Not reified | Open ambiguity; relevant to Decision 6 |
| Ambiguity: FEAT-001 stories — epics or issues (line 321) | Not reified | Not filed |
| Ambiguity: R-NNNN staleness triggers (line 322) | Not reified | FGAP-007 identified; ambiguity not separately filed |
| Ambiguity: resolved issue/fragility migration treatment (line 323) | Not reified | Not filed |
| `fragility-fragility-mohud6vz` doubly-prefixed schema anomaly (line 324) | Not reified | Not filed |
| Empty blocks `tasks.json`, `requirements.json`, `verification.json` (line 325) | Stale | tasks.json now has 21 items + verification.json populated post-FGAP-026 |
| `audit.json` absence (line 326) | Not reified | Not filed |

### A.7 — `analysis/2026-05-02-residual-debt-survey.md`

| Proposition | Reified? | Substrate-block:item OR "not reified" |
|---|---|---|
| Item 3: 9× whole-block scaffolding duplication in shared/macros.md (line 4) | Not reified | Not filed |
| Item 4: 14× test scaffolding duplication; test-helpers under-consumed (line 7) | Not reified | Not filed |
| Item 5: dispatchInlineMacro byte-similar copies (line 10) | Not reified | Not filed |
| Item 6: 7× BUNDLED_TEMPLATES_DIR duplication (line 13) | Not reified | Not filed |
| Item 7: 9× `path.join(cwd, ".project", ...)` cross-cutting hand-built path surface (line 16) | Reified | DEC-0015 enacts resolver-cascade; FGAP-026 enacts substrate canon; FGAP-035 closure delivered cascade |
| Item 8: expandFieldPathShorthand vs expandShorthand parallel (line 19) | Not reified | Not filed |
| Item 9: markers module 4 shapes × 5 emit sites (line 22) | Not reified | Not filed |

### A.8 — `analysis/2026-05-03-substrate-arc-frame.md`

| Proposition | Reified? | Substrate-block:item OR "not reified" |
|---|---|---|
| Substrate = config + partitions + lenses + closure-table relations + per-item macros = six discrete blocks one contract (line 11) | Partial | Closure-table + lenses + macros components reified via DEC-0009/0013/0017; six-block framing itself filed as DEC-0006 (superseded) |
| Heuristic-widening: one heuristic for hierarchical context (line 19) | Not reified | Framing not filed as DEC |
| Mandates as in-scope blocks (line 22) | Reified | `framework-gaps.json:FGAP-008` identified |
| Monitor specs as typed blocks (line 23) | Reified | `framework-gaps.json:FGAP-009` identified |
| POC v2 mechanically proves config.root relocation closes GitHub #3 (line 73) | Reified | DEC-0015 + FGAP-026 closure cascade enacts substrate-dir resolver |
| Closure: GitHub #3 / issue-020 / issue-029 / issue-041 / issue-045 / FGAP-002 / FGAP-003 / FGAP-006 close when production lands substrate (lines 91-100) | Partial | FGAP-002+003 still identified; FGAP-006 closed |
| Reframing: FGAP-001 closure-table only via DEC-0009 (line 106) | Reified | `framework-gaps.json:FGAP-001` closed; `decisions.json:DEC-0009` enacted |
| Five top decisions DEC-0006/0007/0008/0009/0010 (line 165) | Reified | DEC-0006/0007/0010 superseded; DEC-0008/0009 enacted |
| Gap #34 prompt-composition contract (DEC-0007) (line 156) | Reified | DEC-0007 superseded |
| FGAP-008 mandate-block + FGAP-009 monitor-spec + FGAP-010 applicability (lines 158-160) | Reified | All three identified in `framework-gaps.json` |
| Cache placement #25 / synthetic-edge cardinality #26 / cycle composition #27 / cycle detection #28 / bare-string vs typed contextBlocks #29 / lens-view filter param #30 / seedExamples migration #31 / block-api register config #32 / partitions runtime semantics #33 (lines 149-158) | Partial | DEC-0008 (typed contextBlocks) enacted; DEC-0011 (retire packaged defaults) enacted; remaining items not separately filed as issues |

### A.9 — `analysis/2026-05-05-pm-vocabulary-prior-art-survey.md`

| Proposition | Reified? | Substrate-block:item OR "not reified" |
|---|---|---|
| Comprehensive PM-vocab enumeration: PMBOK / PRINCE2 / ITIL / ISO 21500-family / Scrum / SAFe / DA / Kanban / Shape Up / LeSS / GTD (lines 1-200+) | Not reified | Survey itself filed at `analysis/` only; no DEC anchors a canonical-vocabulary choice |
| ADR Nygard + MADR conventions (line 196) | Partial | `decisions.json` uses ADR-flavored fields; no DEC formally adopts ADR/MADR vocabulary |
| C4 / DDD / Event Storming / semver / Conventional Commits / Keep a Changelog / RFC / PEP / EIP / Diátaxis / Backstage etc. | Not reified | Survey is reference-only; no synthesis filed as DEC selecting vocabulary canon |

### A.10 — `analysis/2026-05-05-pi-context-executive-summary-candidate.md`

| Proposition | Reified? | Substrate-block:item OR "not reified" |
|---|---|---|
| Rename `@davidorex/pi-project` → `@davidorex/pi-context` (line 5) | Reified | Package rename landed; `package.json` and CLAUDE.md confirm |
| Substrate primitives: typed memory + closure-table + lens + canonical-macro registry + cross-block resolver (lines 13-19) | Partial | DEC-0009/0013/0017 enact relations + lens; canonical-macro registry across packages not in substrate as DEC |
| Vocabulary surface = config (layers / block_kinds / status_buckets / display_strings / naming) (line 23) | Not reified | No `config.json` exists |
| Identity opaque / display mutable principle (line 30) | Not reified | Not filed as DEC |
| Coverage-rank ranker + before_agent_start cascade hook (line 35) | Not reified | Not filed |
| Aggregate token budgeting (line 37) | Not reified | Not filed; FGAP-014 identified for render-time pagination |
| Auto-extract pipeline session_before_compact (line 38) | Not reified | Not filed |
| Substrate-arc landings carrying forward: 70%/25%/5% absorption split (line 57) | Not reified | Not filed |

### A.11 — `analysis/2026-05-05-pi-context-rename-decomposition.md`

| Proposition | Reified? | Substrate-block:item OR "not reified" |
|---|---|---|
| One package pi-context absorbs substrate + lenses + injection (line 1) | Reified | Package rename landed; consumers cascade |
| Four-workspace monorepo stays at four packages (line 12) | Reified | `packages/` confirms 4 packages |
| Macros location migration from pi-workflows to pi-context (line 35) | Not reified | Open — `templates/shared/macros.md` still in pi-workflows |
| Internal source file naming `project-sdk.ts` → `context-sdk.ts` etc. (line 36) | Partial | TASK-026 Phase 6.6 schedules this rename |

### A.12 — `analysis/2026-05-05-pi-context-rename-touched-items.md`

| Proposition | Reified? | Substrate-block:item OR "not reified" |
|---|---|---|
| Open FGAP-006/008/009/011/013/003/010/014 touched by rename (lines 3-12) | Reified | All present in `framework-gaps.json` with appropriate statuses |
| Open issue-020/028/038/042/045/046/074/089 touched (lines 13-21) | Partial | issue-020/028/038/042/045/046 visible in `issues.json`; issue-074/089 not visible |
| Zero open decisions at time-of-doc; rename needed DEC-0013 entry (line 23) | Reified | DEC-0013 enacted (closure-table generalization, semantically different from rename DEC) |

### A.13 — `analysis/2026-05-10-fgap-026-closure-sub-phase-structure.md`

| Proposition | Reified? | Substrate-block:item OR "not reified" |
|---|---|---|
| 10-phase sub-phase structure with serial/parallel matrix (lines 7-19) | Partial | TASK-021..030 phase-tasks in `tasks.json`; sub-phases tracked via TASK-031..041 + Claude Code Tasks |
| DEC-0021 atomic 3-gate per-package boundary (lines 21-34) | Reified | `decisions.json:DEC-0021` enacted |
| Phase 1.2 C.* atomic-unit landings at HEAD 3bd6534 (line 38) | Reified | VER-001 (TASK-031) + later VER entries pin commit evidence |
| Phase-level tasks NOT filed as separate task entries; sub-task hierarchy belongs as relations.json edges per DEC-0013 = Phase 5 territory (line 77) | Not reified | Note itself a binding constraint; not formally filed; directly relevant to Decision 5 |
| Phase 7 RETIRED per DEC-0021; FGAP-032 standalone pi-jit-agents (line 16) | Reified | DEC-0021 enacted; FGAP-032 identified |

### A.14 — `analysis/2026-05-10-fgap-026-implementation-walkthrough.md`

| Proposition | Reified? | Substrate-block:item OR "not reified" |
|---|---|---|
| context-init prompts for dirName; no default (line 5) | Reified | TASK-031 closed with criterion 5 evidence (handleInit requires arg) |
| `.pi-context.json` bootstrap pointer (line 7) | Reified | `bootstrap.schema.json` shipped per `2026-05-14-arc-tracking-substrate-open-decisions.md:3`; FGAP-035 closed |
| context-migrate tool for `.project/` → user-chosen rename (line 13) | Partial | Scheduled in TASK-030 Phase 10; not yet implemented |
| Code-cascade enumeration across pi-context + pi-jit-agents + pi-workflows + pi-behavior-monitors (lines 17-25) | Reified | DEC-0021 atomic 3-gate cascades closed per VER-001+ |

### A.15 — `analysis/2026-05-10-tool-surface-gap-audit.md`

| Proposition | Reified? | Substrate-block:item OR "not reified" |
|---|---|---|
| filter-block-items P1-DIRECT (line 4) | Reified | TASK-034 closed |
| resolve-items-by-id P1-DIRECT (line 5) | Reified | TASK-035 closed |
| read-config P1 / read-schema P1 (line 116) | Reified | Phase 1.3 tools per TASK-021 |
| schema-write tools P1 (line 117) | Partial | `schema-write.ts` JS surface enacted; pi tool exposure status unclear |
| project-install tool P1 (line 118) | Not reified | Subcommand-only per audit; tool not yet wrapped |
| render-lens tool P1 (line 119) | Not reified | Subcommand-only |
| Workflow/agent discovery tools P1 (line 120) | Partial | `workflow-execute` + `workflow-resume` per TASK-041; available-workflows/agents/contracts not exposed |
| append-relation / remove-relation atomic P1 (line 121) | Not reified | Not filed; directly relevant to Decision 1 + 5 |
| project-discovery aggregator P1 (line 122) | Not reified | Not filed |
| find-references P1 (line 123) | Reified | TASK-037 closed |
| walk-ancestors / walk-siblings P2 (line 124) | Reified | TASK-036 closed (walk-ancestors); walk-siblings not separately filed |
| read-item-by-id (full payload) P2 (line 125) | Not reified | FGAP-045 identified (item-level read at tool surface) |
| upsert-block-item / upsert-block-nested-item P2 (line 126) | Not reified | Not filed |
| Recursive nested update P2 (line 127) | Not reified | Not filed |
| schema-enum-values P2 (line 128) | Not reified | Not filed |
| render-item-markdown P2 (line 129) | Partial | FGAP-037 identified (per-block-kind macros); render-item tool not separately filed |
| validate-item before write P3 (line 130) | Not reified | Not filed |
| transition-item-status with state-machine P3 (line 131) | Partial | FGAP-005 identified; tool not filed |
| project-context-dump P3 (line 133) | Not reified | Not filed |
| read-installed-schemas / add-installed-schema P3 (line 134) | Not reified | Not filed |
| block-history / block-diff P3 (line 135) | Not reified | Not filed |
| read-block truncation handling P3 (line 136) | Not reified | FGAP-045 partial coverage |
| Meta-FGAP: pi tool surface systematically lags JS export surface (line 159) | Reified | FGAP-028 identified (substrate-completeness measured by dogfood-dispatch) + FGAP-044 (no tool discovery for harness-confined LLM) |

### A.16 — `analysis/pi-project-schema-conventions-audit.md`

| Proposition | Reified? | Substrate-block:item OR "not reified" |
|---|---|---|
| JSON Schema draft-07 + no $id/$ref/composition (lines 19-22) | Reified | FGAP-006 closed (schema versioning + $id + $ref + migration) |
| State enums per-block; no global lifecycle vocabulary (lines 45-53) | Reified | FGAP-013 closed (status vocabulary registry); FGAP-016 closed (enum-vocab divergence); FGAP-021 identified |
| Authorship attestation partial; block-api doesn't stamp (lines 68-72) | Reified | FGAP-004 closed (DispatchContext) |
| `additionalProperties: false` only on issues (lines 75-77) | Not reified | Not filed |
| 6 framework gaps per L1-L5 vocabulary direction (lines 162-189) | Reified | FGAP-001..006 all filed |
| Naming mismatches table: decisions=ADR / phase=informal / rationale duplicates / etc. (lines 132-146) | Not reified | Vocabulary decision still open; not in `decisions.json` |
| Three application choices: address-in-scope vs parallel-track vs defer (line 194) | Not reified | Choice not filed as DEC |

### A.17 — `analysis/2026-04-15-blocks-as-prompt-substrate.md`

| Proposition | Reified? | Substrate-block:item OR "not reified" |
|---|---|---|
| Whole-block macros wrong granularity; per-item macros precondition for scoped injection (lines 20-26) | Reified | FGAP-037 identified |
| Six block kinds prompt-unreachable: decisions / spec-reviews / features / framework-gaps / layer-plans / research (line 30) | Reified | FGAP-037 lists exactly these |
| `contextBlocks` item-level selectivity with name/item/focus/depth (line 56) | Reified | FGAP-032 identified |
| Depth control first-class parameter (line 74) | Not reified | Not filed |
| Per-field `x-prompt-budget` metadata (line 80) | Not reified | FGAP-014 identified for render-time pagination — adjacent |
| Rendering-chain traversal subsystem at pi-context⇄pi-jit-agents boundary (line 95) | Partial | Closure-table walks per FGAP-029 closed; rendering-traversal subsystem not separately filed |
| Bidirectional schema contract as principle / decision proposal (line 108) | Not reified | Principle not filed as DEC |
| REVIEW-001 blocked on render_decision macro (line 120) | Reified | `spec-reviews.json:REVIEW-001` status `not-started`; blocker captured via FGAP-037 |
| Nine new shortcomings to capture in framework-gaps.json (line 163) | Partial | FGAP-032 + FGAP-037 cover subset; depth control + x-prompt-budget + rendering-traversal subsystem + bidirectional-schema-contract DEC remain unfiled |
| Principle: every schema lands with its per-item macro as single unit of work (line 158) | Not reified | Principle not filed as DEC |

### A.18 — `analysis/2026-04-15-process-articulation.md`

| Proposition | Reified? | Substrate-block:item OR "not reified" |
|---|---|---|
| Ten-phase unit-of-work lifecycle: intention → research → spec → audit → plan → audit → implementation → audit → verification → learning (lines 26-150) | Not reified | No DEC formally adopts the ten-phase lifecycle as canon |
| Hierarchy-of-intent: project → goals → milestones → roadmap → feature → story → task (line 14) | Not reified | No DEC formally adopts; directly relevant to Decision 1 + 4 |
| Goals block missing (line 263) | Not reified | Not filed as FGAP |
| Milestones block missing — `phase.json` informal partial replacement (line 265) | Reified partial | `phase.schema.json` ships in registry; `roadmap.schema.json` ships; FGAP-040 + FGAP-046 file phase-FK violations |
| Roadmap block missing — `features.json` flat (line 267) | Reified partial | `roadmap.schema.json` ships in registry per `2026-05-14-arc-tracking-substrate-open-decisions.md:3` |
| Verification criteria taxonomy: `kind` field + `verification_target` (line 38) | Not reified | Not filed; verification.json schema has `method` enum but not `kind`-per-criterion |
| Review target-kind ambiguity (line 105) | Not reified | Not filed |
| Review iteration chain — `previous_review` field (line 82) | Not reified | Not filed |
| Task git provenance — `implemented_by: string[]` commit SHAs (line 117) | Not reified | Not filed |
| Verification.json schema depth: link to criteria + method + grounding (line 139) | Partial | VER-001 evidence shows `criteria_results[]` and `evidence` populated; schema enhancement not filed as FGAP |
| Lessons / feedback memory block (line 145) | Not reified | feedback_*.md remain unstructured |
| Postmortem block (line 280) | Not reified | Not filed |
| State machine + user-gated transitions per artifact (line 241) | Reified partial | FGAP-005 identified (state-machine validation); FGAP-024 identified (write-authority enforcement) |
| Traceability graph spec (lines 174-218) | Not reified | Graph not formally encoded as DEC |
| Process applies fractally at every scale (line 156) | Not reified | Not filed as DEC |
| STORY-001 concrete walk-through (lines 286-349) | Not reified | Walk-through is illustrative; no separate substrate captures it |

### A.19 — `analysis/2026-04-15-runtime-step-context.md`

| Proposition | Reified? | Substrate-block:item OR "not reified" |
|---|---|---|
| 17 agent roles with per-role context shape (lines 36-303) | Not reified | DEC-0017 + context-contracts substrate (TASK-038/039/040) enact unit-kind context contracts; 17 specific roles not encoded |
| Ambient / block-item-injected / block-whole-injected / collector / tool-access — five channels (line 11) | Reified | DEC-0017 contract surface enacts; channel taxonomy itself not formal DEC |
| Minimal-context principle (line 307) | Reified | DEC-0017 + FGAP-031 closed enact gather-execution-context per work-unit |
| Agent spec needs item-level `contextBlocks` selectivity (line 340) | Reified | FGAP-032 identified |
| `context_excludes` explicit refusal list (line 343) | Not reified | Not filed |
| Collectors first-class at pi-jit-agents boundary (line 341) | Not reified | Not filed |
| Pre-dispatch token-budget validation (line 347) | Not reified | FGAP-014 adjacent |
| Ambient context composition must be declarative (mandates as L5 block) (line 345) | Reified | FGAP-008 identified |
| Compact summary table per-role columns (lines 356-374) | Not reified | Not in substrate |

### A.20 — `analysis/research-blocks-design.md`

| Proposition | Reified? | Substrate-block:item OR "not reified" |
|---|---|---|
| `.project/research.json` schema design (line 67) | Reified | `research.schema.json` shipped; `research.json:R-0001..R-0011` populated |
| Two orthogonal dimensions: Layer × Type (line 26) | Partial | Schema carries `layer` + `type` enums; framing not in DEC |
| Critical composability fields: findings_summary / grounding / stale_conditions / informs / informed_by (line 110) | Reified | Schema enforces these |
| Flat collection with cross-references (line 122) | Reified | research.json is flat array |
| FGAP-007 staleness engine (line 200) | Reified | `framework-gaps.json:FGAP-007` identified |
| Back-edge `research_sources: [R-NNNN]` on existing five schemas (line 132) | Not reified | Verify via `decisions.schema.json` / `features.schema.json` etc.; FGAP not filed if absent |
| Seed entries R-0001..R-0011 (line 224) | Reified | All 11 in `research.json` |
| Method enum reliability table (line 162) | Reified | Schema enforces method enum |
| Lifecycle state machine for research (line 137) | Reified | Schema enforces `status` enum |

### A.21 — `analysis/2026-05-14-arc-tracking-substrate-open-decisions.md`

The 7 open decisions doc itself: 8 sections (decisions 1-7 + sequencing anchor #8). Decisions 1-7 are by definition unreified (they ARE the open decisions). Sequencing anchor #8 is user-grounded but not filed as DEC.

### A.flat — High-impact non-reified items (ranked)

1. **Ten-phase unit-of-work lifecycle as DEC** (`2026-04-15-process-articulation.md`) — overarching process canon never formally enacted
2. **Hierarchy-of-intent (project→goals→milestones→roadmap→feature→story→task) as DEC** (`2026-04-15-process-articulation.md:14`) — directly informs Decisions 1 + 4
3. **Goals block kind** (process-articulation:263) — top-of-hierarchy block missing
4. **Bidirectional schema contract DEC** (`2026-04-15-blocks-as-prompt-substrate.md:108`, `2026-05-01-synthesis.md:18`) — load-bearing principle never filed
5. **Every-schema-lands-with-its-macro principle as DEC** (`2026-04-15-blocks-as-prompt-substrate.md:158`) — explicit unit-of-work discipline
6. **`/project new-phase` ceremony** (`2026-05-01-ceremony-ideas.md:19`) — directly relevant to Decision 6 + 7
7. **`/project edit-item` + `/project archive-item` ceremonies** (`2026-05-01-ceremony-ideas.md:23,27`)
8. **Subagent dispatch records block kind** (`context-block-design.md:82`)
9. **Explore-output as block kind** (`context-block-design.md:78`) — FGAP-034 partial coverage only
10. **F-019 biome.json drift / F-020 D3 three-package split / F-022 zero-consumer templates dir / F-023 audit-gap canonicality binding / F-024 draft-07 vocabulary / F-025 ListTasks** (`2026-05-01-substrate-arc-distillation.md`) — six fragility-catalog items unreified
11. **`x-prompt-budget` per-field metadata** (`blocks-as-prompt-substrate.md:80`) — token-economy primitive
12. **Depth control as first-class parameter** (`blocks-as-prompt-substrate.md:74`)
13. **`context_excludes` field on agent spec** (`runtime-step-context.md:343`)
14. **Collectors first-class at pi-jit-agents boundary** (`runtime-step-context.md:341`)
15. **Pre-dispatch token-budget validation** (`runtime-step-context.md:347`)
16. **Verification criteria `kind` taxonomy + `verification_target`** (`process-articulation.md:38`)
17. **Review target-kind ambiguity** (`process-articulation.md:105`)
18. **Review iteration chain (`previous_review` field)** (`process-articulation.md:82`)
19. **Task git provenance (`implemented_by: [SHA]`)** (`process-articulation.md:117`)
20. **Lessons / feedback memory as structured block** (`process-articulation.md:145`)
21. **Postmortem block kind** (`process-articulation.md:280`)
22. **Naming mismatches → vocabulary canon DEC** (`pi-project-schema-conventions-audit.md:132`, `pm-vocabulary-prior-art-survey.md`) — ADR vs decisions / phase vs milestone vs epic terminology never formally chosen
23. **Six PM-survey vocabulary anchors as DEC** (`pm-vocabulary-prior-art-survey.md`) — survey done but no DEC selects ADR/MADR or PMBOK/Scrum/SAFe vocabulary
24. **Pi-context executive-summary capability extensions: coverage-rank ranker / before_agent_start cascade hook / auto-extract pipeline / aggregate token budgeting** (`pi-context-executive-summary-candidate.md:35-38`) — four pi-memctx-derived capabilities never filed as FGAP cluster
25. **Identity-opaque / display-mutable principle as DEC** (`pi-context-executive-summary-candidate.md:30`, `config-as-vocabulary-substrate.md`) — config-vocabulary discipline never filed
26. **Macros location migration from pi-workflows to pi-context** (`pi-context-rename-decomposition.md:35`) — open per doc

---

## Part B — Decision-by-decision sharpening

### Decision 1: Block-kind set

#### Direct answers
- **Doc**: `2026-05-14-arc-tracking-substrate-open-decisions.md:3`
  - **Quote**: "`.project/schemas/` is missing `config.schema.json` + `relations.schema.json` + `roadmap.schema.json`. pi-context/registry/schemas/ holds all three plus `bootstrap.schema.json`, `plan.schema.json`, `priority.schema.json`, `severity.schema.json`, `source.schema.json`, `status.schema.json`, `verification-method.schema.json`, `layer.schema.json`, `context-contracts.schema.json`."
  - **How it answers**: Names the exact deficit + the exact registry set available — the decision space is which of these N candidates to install + author.
- **Doc**: `2026-05-03-substrate-arc-frame.md:31`
  - **Quote**: "substrate = config + partitions + lenses + closure-table relations + per-item macros. Six discrete blocks, one coherent contract"
  - **How it answers**: Names a canonical six-block target set; DEC-0006 attempted to formalize the sixth block then was superseded.
- **Doc**: `2026-05-05-pi-context-executive-summary-candidate.md:23-27`
  - **Quote**: "A single config (`<config.root>/config.json`) declares everything identity-bearing: layers[] / block_kinds[] / status_buckets / display_strings / naming"
  - **How it answers**: config is foundational + carries the block-kind registry that drives all other authoring.

#### Constraints
- **Doc**: `2026-05-14-open-decisions.md:5`
  - **Quote**: "Decision is therefore: install which schemas now, author which instances now."
  - **How it constrains**: The block-kind set splits into two sub-questions (schemas vs instances).
- **Doc**: `context-block-design.md:21-22`
  - **Quote**: "roadmap | (registry only — not installed) | roadmaps | ROADMAP- | L1 ... phase | (registry only — not installed) | phases | PHASE- | L1"
  - **How it constrains**: At least roadmap + phase schemas needed for any arc-tracking; config + relations are PM-lens-prerequisites.
- **Doc**: `2026-05-10-fgap-026-closure-sub-phase-structure.md:14`
  - **Quote**: "Phase 5: 5.1 config.json • 5.2 relations.json bootstrap • 5.3 roadmap.json • 5.4 phase.json • 5.5 context-contracts • 5.6 update tasks.json with phase edges | Serial 5.1→5.2→5.3→5.4→5.5→5.6"
  - **How it constrains**: Existing FGAP-026 phase plan declares the authoring order as 5 schemas + tasks.json migration; this is the canonical answer.

#### Framework/vocabulary
- **Doc**: `2026-05-05-pm-vocabulary-prior-art-survey.md` (lines 13-200+)
  - **Vocabulary**: PMBOK hierarchy (project/phase/deliverable/work-package/activity); PRINCE2 (programme/project/stage/work-package/product); Scrum (product-backlog/sprint-backlog/increment); SAFe (theme/portfolio-epic/capability/feature/story/task); Shape Up (pitch/bet/project/scope/task); ADR (Nygard 5-section / MADR 10-section)
  - **How it frames**: Multiple canonical PM vocab choices exist; this repo's substrate must pick a vocabulary anchor.
- **Doc**: `2026-04-15-process-articulation.md:14`
  - **Quote**: "project → ultimate goals → milestones → roadmap → element X (feature/epic) → milestone a,b,c for X (stories) → work inside a story (tasks)"
  - **How it frames**: Project's own platonic hierarchy is enumerated; goals block + milestone block + roadmap block all flagged as "gap".

#### Sub-decisions raised
- Which of the 9 registry schemas (`bootstrap` + `plan` + `priority` + `severity` + `source` + `status` + `verification-method` + `layer` + `context-contracts`) are arc-tracking concerns vs orthogonal? (per `2026-05-14-open-decisions.md:3`)
- Whether to file `goals` block (currently `project.json.goals: string[]`) per `process-articulation.md:263`
- Whether to add `milestone` block per `process-articulation.md:265` or treat `phase.json` as milestone
- Whether to add `subagent dispatch records` block per `context-block-design.md:82`
- Whether to add `explore-output` block per `context-block-design.md:78` (FGAP-034 partial)
- Macros co-shipment: every new schema requires per-item macro (FGAP-037 binding) — `blocks-as-prompt-substrate.md:158` principle

#### Synthesis (no hedging)
- **Decided from docs alone**: The minimum set is `config + relations + roadmap + phase + context-contracts` per `2026-05-10-fgap-026-closure-sub-phase-structure.md:14`. Bootstrap shipped already (FGAP-035 closure). context-contracts already enacted (TASK-038).
- **Remaining open**: Whether ALSO to install `priority` / `severity` / `source` / `status` / `verification-method` / `layer` / `plan` schemas. Whether to additionally author `goals` / `milestones` / `subagent-dispatch` / `explore-output` blocks (none in registry). Whether per-item macros for newly-installed kinds land in same sub-phase (FGAP-037 binding suggests yes).

### Decision 2: Arc scope

#### Direct answers
- **Doc**: `2026-05-14-open-decisions.md:5`
  - **Quote**: "Decision: roadmap covers (a) FGAP-026 closure arc only, (b) full project history including pre-FGAP-026 pi-extension build with retroactive status reconciliation, or (c) FGAP-026 arc + future arcs only."
  - **How it answers**: States the three-way choice explicitly.

#### Constraints
- **Doc**: `2026-05-14-open-decisions.md:5`
  - **Quote**: "Claude Code Tasks #2..#20 (pre-FGAP-026 pi-extension build, all completed) have no TASK-NNN substrate mirror — pi-extension build was tracked in Claude Code Task tool only. `.project/phases/{1..4}.json` carry content from that pre-FGAP-026 build with status=\"planned\" never closed."
  - **How it constrains**: Pre-FGAP-026 history is in two split surfaces (Claude Code Tasks + `phases/{1..4}.json` planned). Retroactive reconciliation has source material; greenfield-only avoids it.
- **Doc**: `2026-05-10-fgap-026-closure-sub-phase-structure.md:77`
  - **Quote**: "Phase-level tasks (TASK-021..TASK-030 in .project/tasks.json + Claude Code Tasks #21-#30) stay as the canonical tracking units."
  - **How it constrains**: Existing canon already treats TASK-021..030 as the canonical units of the FGAP-026 arc; pre-arc tasks are explicitly outside.

#### Framework/vocabulary
- **Doc**: `2026-04-15-process-articulation.md:156`
  - **Quote**: "Fractal. The blocks support nested application of the same pattern because every artifact kind has a finding registry, every artifact has a state machine, and every artifact can cite research, decisions, and other artifacts. The pattern is the same; the scope differs."
  - **How it frames**: Roadmap can be authored at any scope; project-wide vs single-arc are both first-class.

#### Sub-decisions raised
- If (b) full history: who reconciles status of pre-FGAP-026 phases (claim closure-where-shipped vs leave planned vs archive)?
- If (c) FGAP-026 + future: where do dependent future arcs hang (subagent-discoverable schedule slot or speculative)?

#### Synthesis (no hedging)
- **Decided from docs alone**: No doc directly answers; the choice is user-anchored. Existing canon (FGAP-026 sub-phase doc:77) treats TASK-021..030 as the canonical unit, which is consistent with option (a) or (c).
- **Remaining open**: Three-way choice requires user direction.

### Decision 3: Dogfood depth

#### Direct answers
- **Doc**: `2026-05-14-open-decisions.md:7`
  - **Quote**: "Decision: minimum-viable (just enough to bind one runtime demo of gatherExecutionContext against real TASK-025 substrate) vs comprehensive (config.relation_types + relations.json edges + populated contracts + roadmap + phases sufficient for harness-confined LLM in Phase 6+ to query meaningfully)."
  - **How it answers**: Two-way choice stated.

#### Constraints
- **Doc**: `2026-05-14-open-decisions.md:7`
  - **Quote**: "CTX-001..003 in `.project/context-contracts.json` carry `bundle_relation_types: []` — empty contracts return unit-only bundles."
  - **How it constrains**: Minimum-viable risks empty bundles continuing to ship; the demo claim depends on populated relation_types.
- **Doc**: `decisions.json:DEC-0018`
  - **Quote** (from `decisions.json`): "Tests-pass alone is insufficient — every implementation step requires runtime demonstration + adversarial verification probe"
  - **How it constrains**: DEC-0018 binding requires runtime demo per step; minimum-viable must still pass demo gate.
- **Doc**: `framework-gaps.json:FGAP-028` (identified)
  - **Quote**: "Substrate completeness measured by harness-confined-LLM arc-dispatch capability, not by isolated tool/primitive existence"
  - **How it constrains**: FGAP-028 explicitly forbids per-primitive substrate completeness claims; comprehensive depth aligns better.

#### Framework/vocabulary
- **Doc**: `2026-05-03-substrate-arc-frame.md:81`
  - **Quote**: "Token economy | context-management.md ≈ 8.6KB vs raw issues ≈ 62KB — empirical 86% reduction for agents needing the organized view only"
  - **How it frames**: Comprehensive depth has empirical token-economy upside.

#### Sub-decisions raised
- What's the dispatch test target? (TASK-025 vs Phase 6 retrospective vs explore-implementer pipeline replay)
- What population counts as "comprehensive enough"? (one populated contract / N edges / N PHASE entries / etc.)

#### Synthesis (no hedging)
- **Decided from docs alone**: FGAP-028 + DEC-0018 binding pushes toward comprehensive: minimum-viable that ships empty bundles fails the "dogfood-dispatch-capability" gate. The doc itself frames this as comprehensive-preferred.
- **Remaining open**: User must define "comprehensive enough" threshold and dispatch test target.

### Decision 4: ID conventions

#### Direct answers
- **Doc**: `2026-05-14-open-decisions.md:9-14`
  - **Quote**: "Three styles in code: `packages/pi-context/src/roadmap-plan.test.ts` uses `PHASE-A`, `PHASE-B`, `PHASE-C`, `PHASE-D` (letter-suffix). LLM-filed commit body `f3d6e41` + TASK-025 acceptance_criteria use `PHASE-006..010` (numeric-suffix zero-padded). `phase.schema.json` discriminator is `number: integer`; file-per-phase at `.project/phases/{number}.json`. roadmap.schema.json pattern `^PHASE-[A-Z0-9-]+$` permits any suffix."
  - **How it answers**: Three styles enumerated; schema permits any suffix; no canon binds the binding.

#### Constraints
- **Doc**: `2026-05-14-open-decisions.md:14`
  - **Quote**: "No DEC binds suffix style or PHASE-NNN↔number binding. Decision: suffix convention + integer-↔-string binding convention."
  - **How it constrains**: The decision has two parts (suffix-style + integer-binding).
- **Doc**: `pm-vocabulary-prior-art-survey.md` ADR section (line 203)
  - **Quote**: "`ADR-NNN` or `NNNN-title-with-dashes.md` (zero-padded sequential id)"
  - **How it constrains**: Canonical ADR convention is zero-padded numeric — supports PHASE-006 pattern.
- **Doc**: `pm-vocabulary-prior-art-survey.md` RFC section (line 295)
  - **Quote**: "`RFC-NNNN` (sequentially numbered; never reused; once published, immutable)"
  - **How it constrains**: RFC canon is zero-padded 4-digit; further supports numeric pattern.

#### Framework/vocabulary
- **Doc**: `pi-context-executive-summary-candidate.md:30`
  - **Quote**: "Identity is opaque, display is mutable."
  - **How it frames**: Prefix-suffix is identity; once chosen should be immutable. Display label is mutable.
- **Doc**: `config-as-vocabulary-substrate.md:49`
  - **Quote**: "Prefix-rename remains expensive even under this design, because prefixes appear as substrings in every relations.json edge"
  - **How it frames**: Picking the suffix convention is one-shot; rename is structurally expensive.

#### Sub-decisions raised
- Letter-suffix (`PHASE-A`) vs numeric-suffix-padded (`PHASE-006`) vs unpadded (`PHASE-6`)
- Does `phase.json.number: integer` field exist alongside `PHASE-NNN` id, or is id-only the convention?
- File-per-phase at `phases/{number}.json` vs flat `phases.json` array
- Existing data: `phases/{1..4}.json` use `number: integer`; `tasks.json` uses `phase: "8.7.1"` free-text labels (FGAP-040)

#### Synthesis (no hedging)
- **Decided from docs alone**: Prior-art (ADR/RFC) overwhelmingly favors zero-padded numeric. Existing `phase.schema.json` uses `number: integer` discriminator. Existing `phases/{1..4}.json` files use integer 1/2/3/4. Existing usage in `tasks.json` "phase=8.7.N" violates schema. The convergent answer is numeric (padded or unpadded) with id ↔ number binding.
- **Remaining open**: Zero-pad width (3-digit `006` vs 4-digit `0006` vs unpadded `6`). File-per-phase vs flat-array. PHASE-NNN-string vs integer-only-discriminator. User direction needed on width + on whether to keep file-per-phase pattern.

### Decision 5: FK-as-field migration

#### Direct answers
- **Doc**: `2026-05-14-open-decisions.md:16`
  - **Quote**: "DEC-0013 (enacted): closure-table is canonical primitive for ALL inter-item relationships; FK-as-field forbidden. FGAP-040 + FGAP-046 file these violations. Decision: migrate now (remove inline fields, write equivalent relations.json edges with new relation_types) — DEC-0013's \"ALL\" leaves no partial path."
  - **How it answers**: Doc explicitly states "migrate now"; DEC-0013's binding leaves no alternative.
- **Doc**: `decisions.json:DEC-0013` (enacted)
  - **Quote**: "Edges-only authoring generalized: all inter-item relationships go through config-declared relation_types"
  - **How it answers**: Confirms binding canon.

#### Constraints
- **Doc**: `2026-05-14-open-decisions.md:16`
  - **Quote**: "Every TASK-021..041 in `.project/tasks.json` carries `phase: \"8.7.N\"` inline (free-text label, not a PHASE-NNN reference). TASK-031, 033, 034, 035, 036, 037, 038, 039, 040, 041 also carry inline `depends_on: [\"TASK-NNN\"]` arrays."
  - **How it constrains**: 21 tasks × 2 fields (phase + depends_on) = 42 inline-FK sites that need migration.
- **Doc**: `framework-gaps.json:FGAP-040` (identified)
  - **Quote**: "tasks[].phase carries free-text sub-phase labels (e.g. \"8.7.1\") instead of FK references to PHASE-NNN phase block items"
- **Doc**: `framework-gaps.json:FGAP-046` (identified)
  - **Quote**: "tasks[].depends_on inline FK array — third instance of FGAP-040/041 DEC-0013 violation pattern; substrate-wide audit needed"
- **Doc**: `framework-gaps.json:FGAP-041` (identified)
  - **Quote**: "issues[].resolved_by carries free-text (commit SHAs / commit messages) instead of VER-NNN verification-entry references"
- **Doc**: `2026-05-10-fgap-026-closure-sub-phase-structure.md:77`
  - **Quote**: "Phase-level tasks ... NOT filed as separate task entries in tasks.json (would force dotted-notation schema migration; sub-task hierarchy properly belongs as relations.json edges per DEC-0013 — Phase 5 territory if explicit hierarchy tracking becomes needed)."
  - **How it constrains**: Phase 5 (the current sub-phase 8.7.5) is explicitly the migration territory.

#### Framework/vocabulary
- **Doc**: `2026-05-03-substrate-arc-frame.md:38`
  - **Quote**: "closure-table relations | Generic edge primitive: (parent, child, relation_type) triples in a single block. Multiple parallel hierarchies coexist as different relation_type values. Hierarchy edges (parent ∈ canonical ids) and lens edges (parent ∈ lens.bins) share one schema, distinguished by validator at the SDK boundary."
  - **How it frames**: Edge-shape is single-table; per-edge `relation_type` distinguishes hierarchies. Migration becomes: define relation_types `parent_phase` + `depends_on` + `resolved_by` and emit edges.

#### Sub-decisions raised
- Which relation_type names? (`parent_phase` / `phase_contains` / `belongs_to_phase` / etc. for tasks↔phases; `depends_on` / `blocked_by` for tasks↔tasks; `resolved_by` for issues↔verifications)
- Should `tasks[].phase` field be removed entirely or kept as derived/cached?
- Sequencing: migrate before or after roadmap+phase authoring? (Phase 5.2 vs 5.6 per sub-phase doc)

#### Synthesis (no hedging)
- **Decided from docs alone**: Migration is mandatory per DEC-0013 binding. Sequencing per `2026-05-10-fgap-026-closure-sub-phase-structure.md:14`: 5.1 config → 5.2 relations.json bootstrap → 5.3 roadmap → 5.4 phase → 5.5 context-contracts → 5.6 update tasks.json. Field removal is implied by DEC-0013.
- **Remaining open**: relation_type names + whether `tasks[].phase` is removed-vs-derived-view. User direction needed on relation_type vocabulary.

### Decision 6: Pre-existing `.project/phases/{1..4}.json` disposition

#### Direct answers
- **Doc**: `2026-05-14-open-decisions.md:18`
  - **Quote**: "Last touched at `190f648` (pre-FGAP-026). Content: phase 1 \"Make typed composition real\" (agent-input-schema enforcement, template inheritance), phase 2 onward (not yet read). Status=\"planned\" never closed. Some content describes work shipped in pi-jit-agents (typed composition / inputSchema enforcement) — status didn't track shipping. `number=1..4` slots collide with any FGAP-026 phase numbering starting low. Decision: retroactively close them as completed-where-shipped + open-where-not, archive entirely, or repurpose slots."
  - **How it answers**: Three-way choice stated. Substrate query confirms file content matches.

#### Constraints
- **Doc**: `phase.schema.json` discriminator is `number: integer` (per `2026-05-14-open-decisions.md:12`)
  - **How it constrains**: `number=1..4` occupy low slots; new FGAP-026 phases starting at 5+ avoid collision.
- **Doc**: substrate read confirms `phases/1.json:status="planned"` and content "Make typed composition real" — the work shipped in pi-jit-agents (DEC-0001 family / FEAT-001 stories) but no `phase.status: completed` transition occurred.

#### Framework/vocabulary
- **Doc**: `2026-04-15-process-articulation.md:241`
  - **Quote**: "User-gated transitions per artifact"
  - **How it frames**: Closing a planned phase to completed requires user authority.

#### Sub-decisions raised
- If repurpose: rename slots PHASE-001..004 to something else first (avoid collision with PHASE-1..4 in `phase.schema.json:number`)
- If retroactively-close: who writes the verification entries citing the shipped commits?
- If archive entirely: where does the historical content live (analysis/ doc vs deleted)?

#### Synthesis (no hedging)
- **Decided from docs alone**: No doc directly answers; all three options are admissible.
- **Remaining open**: Three-way choice requires user direction. If (b) full project history per Decision 2, retroactive-close likely fits; if (a) FGAP-026-only per Decision 2, archive or repurpose fits.

### Decision 7: `config.lenses[]` content set

#### Direct answers
- **Doc**: `2026-05-14-open-decisions.md:20`
  - **Quote**: "Candidates surfaced by current substrate shape: tasks-by-phase (group TASK-NNN), decisions-by-status, fgaps-by-status, verifications-by-target."
  - **How it answers**: Four candidate lenses named.

#### Constraints
- **Doc**: `2026-05-14-open-decisions.md:20`
  - **Quote**: "`roadmap.phases[].lens` is required-field. `packages/pi-context/src/lens-view.ts` registers lens-validator dispatch; `roadmap-plan.ts groupByLens` projects items per lens spec (kind: target | composition). No lens declarations exist for THIS repo."
  - **How it constrains**: At least one lens must exist per roadmap phase; bare-minimum scope is one.
- **Doc**: `2026-05-03-substrate-arc-frame.md:37`
  - **Quote**: "lenses | Named projections over a target block, with `relation_type`, `bins`, optional `derived_from_field` (auto-derivation) and `render_uncategorized` policy."
  - **How it constrains**: Each lens needs target + bins + optional derivation source.

#### Framework/vocabulary
- **Doc**: `2026-05-03-substrate-arc-frame.md` POC artifacts table (line 73)
  - **Quote**: "Auto-derived lens (by-package, by-priority, by-status) | synthesizeFromField() synthesizes edges from item fields at query time. Hand-curated lens (context-management) | Edges authored in relations.json, 10 sub-concern bins"
  - **How it frames**: Two lens shapes: auto-derived from existing field vs curated edges.

#### Sub-decisions raised
- For tasks-by-phase: auto-derive from `tasks[].phase` field OR curated edges in relations.json (the FK-as-field migration of Decision 5 directly intersects)
- For decisions-by-status: auto-derive from `decisions[].status` enum (open / enacted / superseded)
- For fgaps-by-status: auto-derive from `framework-gaps[].status` (identified / closed)
- For verifications-by-target: auto-derive from `verification[].target` cross-block reference
- Additional candidates: tasks-by-status (todo/in-progress/completed), decisions-by-phase (DEC-NNNN → which arc-phase decided it), research-by-layer (R-NNNN → L1/L2/L3/L4/L5)
- Should `context-management` (substrate-arc-frame.md POC artifact) be reproduced for this repo?

#### Synthesis (no hedging)
- **Decided from docs alone**: Doc-listed four candidates are non-controversial first picks given current substrate shape. Decision 5 migration (tasks.phase → relations edges) directly determines whether tasks-by-phase is auto-derive or curated.
- **Remaining open**: Lens-count (4 candidates vs broader set) + per-lens shape (auto-derive vs curated). User direction needed.

---

## Part C — Cross-cut findings

### Multi-decision items

- **Decision 4 ↔ 5 ↔ 7 share PHASE-NNN binding**: ID convention (Dec 4), FK-as-field migration (Dec 5), and lens-content (Dec 7 — tasks-by-phase) all hinge on how PHASE-NNN binds to `phase.json:number`. Resolving Dec 4 first cascades into Dec 5's relation_type choice and Dec 7's lens-shape.
- **Decision 1 ↔ 3 share completeness threshold**: Block-kind set (Dec 1) determines what's available to populate; dogfood depth (Dec 3) determines how much population suffices. FGAP-028 binding ("dogfood-dispatch capability") makes them co-decided.
- **Decision 2 ↔ 6 share scope**: Arc scope (Dec 2) directly determines disposition of `phases/{1..4}.json` (Dec 6). If (a) FGAP-026-only → archive or repurpose. If (b) full history → retroactively close.

### Contradictions across documents

- **Macros location**: `context-block-design.md:91` says "Per-block-kind macros land alongside schemas — FGAP-037 captures the 6 missing." `pi-context-rename-decomposition.md:35` says macros migration from pi-workflows → pi-context is open. The two docs agree macros need to move; neither says they HAVE moved. Substrate FGAP-037 identified, not closed.
- **Six-block contract identity**: `2026-05-03-substrate-arc-frame.md:11` claims "six discrete blocks" but enumerates only five with POC evidence (config / partitions / lenses / relations / per-item-macros). DEC-0006 attempted to formalize the sixth (prompt-composition contract OR scopes) and is now `superseded` — meaning the sixth-block question is unresolved and the contract enumeration sits at five+open.
- **Plan-mode plan reification**: `context-block-design.md:70` flags plan-mode content reification as an open question. `feedback_plan_mode_step_one_substrate_write.md` (memory layer per CLAUDE.md) mandates substrate-write of plan-mode decisions BEFORE composing briefs. The contradiction: feedback binds the practice but no DEC formalizes the schema slot; in-substrate, plan-mode resolved decisions land in TASK `notes` free-text fields per current TASK-021..041 entries.

### Framing shifts between earlier (2026-04) and later (2026-05) docs

- **2026-04-15 process-articulation** frames the substrate as supporting a ten-phase lifecycle with hierarchy-of-intent + traceability graph. Heavy on what the substrate WOULD support; FGAP-001..007 captured the gaps blocking it.
- **2026-05-01 distillation + ceremony-ideas + synthesis** shift to methodology-meta-findings: extraction-first, R1/R2/R3 cascade root causes, cascade-tainted-Tier-C discarded. Less optimistic about hand-authored substrate; explicitly defers ceremony-implementation to post-extraction-first.
- **2026-05-03 substrate-arc-frame** introduces the "six discrete blocks one contract" frame + heuristic-widening to mandates+monitors. Reorients from "address gaps" to "every open item locates against the frame."
- **2026-05-05 pi-context-rename + config-as-vocabulary** reframes the package identity itself (pi-project → pi-context); config-as-vocabulary makes display-rename structurally cheap.
- **2026-05-10 FGAP-026 closure + tool-surface gap audit** narrows to implementation discipline: DEC-0021 atomic per-package cascade, FGAP-028 dogfood-dispatch completeness, FGAP-044 tool discovery. Less about new frames, more about closing the rebuild arc.

The frame has consistently sharpened from "vision" (April) → "diagnosis + methodology" (early May) → "rename + capability extension" (mid May) → "atomic implementation + dogfood gate" (mid-late May). The 7 open decisions are the residue at the implementation atomicity level — choices needed before the FGAP-026 closure arc can declare itself dogfood-ready.

### Notable non-contradictions

- DEC-0013's "ALL inter-item relationships go through config-declared relation_types" + DEC-0015's "config drives substrate location" + DEC-0017's "work-unit context composed via bidirectional traversal of config-declared relation_types" form a consistent triad: config is the substrate-vocabulary-authoring surface; relations is the substrate-edge-storage; gather-execution-context is the substrate-projection-runtime. All three enacted.
- DEC-0018 (runtime demo + adversarial probe per step) + DEC-0020 (per-layer work-unit outputs are typed substrate blocks) + FGAP-028 (substrate completeness = dogfood-dispatch capability) form a consistent gate-architecture: substrate canon is operational, not just structural.

---

## Synthesis (overall)

### Decisions answered by docs (no further user input needed)

- **Decision 5 (FK-as-field migration)**: `2026-05-14-open-decisions.md:16` + DEC-0013 binding → migrate now. **What remains**: relation_type vocabulary choice (sub-decision; constrained but not answered).
- **Decision 3 (Dogfood depth — direction only)**: FGAP-028 + DEC-0018 + sub-phase-doc 5.X enumeration → comprehensive (not minimum-viable). **What remains**: comprehensive-enough threshold + dispatch test target.

### Decisions sharpened but still requiring user direction

- **Decision 1 (Block-kind set)**: Doc-evidence sets minimum-floor at `config + relations + roadmap + phase + context-contracts` (4 to install; context-contracts already done). **User direction needed on**: whether to additionally install `priority` / `severity` / `source` / `status` / `verification-method` / `layer` / `plan`; whether to author NEW kinds (`goals` / `milestones` / `subagent-dispatch` / `explore-output` / `lessons` / `postmortem`); whether per-item macros co-ship in same sub-phase.
- **Decision 4 (ID conventions)**: Prior-art (ADR/RFC) + existing `phase.schema.json:number:integer` + four `phases/{1..4}.json` files using integer = converging signal toward zero-padded numeric with integer-binding. **User direction needed on**: zero-pad width (3 / 4 / unpadded); file-per-phase vs flat-array; PHASE-NNN-string vs integer-only-discriminator.
- **Decision 7 (config.lenses[] content)**: Four candidates surfaced. **User direction needed on**: lens-count (the 4 vs broader); per-lens auto-derive vs curated (intersects Dec 5).

### Decisions docs don't touch

- **Decision 2 (Arc scope)**: Three-way (a/b/c) choice has no doc-evidence answer. Existing canon treats TASK-021..030 as the arc-tracking unit (FGAP-026 sub-phase-doc:77), which is consistent with (a) or (c) but not dispositive. **User direction needed on**: three-way choice.
- **Decision 6 (`phases/{1..4}.json` disposition)**: Three-way (close / archive / repurpose) choice has no doc-evidence answer. **User direction needed on**: three-way choice (cascades from Dec 2).

---

## Verification notes

- Every doc in the source list (21 entries) has rows in Part A or is explicitly handled (Doc 21 = the open-decisions doc itself, noted as definitionally unreified).
- Every Part B section has all 5 subsections populated.
- Every "answered" claim in synthesis cites doc + section/line + substrate-block lookup result.
- Substrate counter-checks performed: `decisions.json` 21 DEC entries with statuses; `framework-gaps.json` 46 FGAP entries; `tasks.json` 21 TASK entries with phase/depends_on inline-FKs; `verification.json` populated; `phases/{1..4}.json` confirmed planned-status; no `config.json` + no `relations.json` exist.
