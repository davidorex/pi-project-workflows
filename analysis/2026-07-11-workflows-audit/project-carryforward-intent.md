---
audit_group: project-carryforward
description: .project->.context dropped/unreflected intent
source_agent: a3ce3d8c4615416b4
extracted_from: /private/tmp/claude-501/-Users-david-Projects-harness-monitor-training/4a529474-bea7-419f-8f8c-bdcdb0aaeb54/tasks/a3ce3d8c4615416b4.output
verbatim: true
---

## COVERAGE

Examined all 52 `.project` decisions (id/title/status enumerated), full bodies of the 9 forward-constraining/open ones (DEC-0005/0014/0016/0044/0047/0033/0034/0050/0051); all 8 rationales (RAT-001..008); all 16 conventions; `project.json` goals/constraints/scope; `architecture.json`+`domain.json` (empty stubs). Cross-referenced against current `.context` (23 decisions all `enacted`; `config.json` registries; 18 block_kinds; 17 schemas; 9 milestones), full `CLAUDE.md`, `.husky/pre-commit`, `scripts/`, `packages/`. Not full-body-read: ~30 enacted decisions whose titles show settled substrate-internal choices the `.context` rebuild re-decided in its own vocabulary (DEC-0026/0027 padding/casing, DEC-0030/0031 naming, DEC-0022/0023 kind-naming) — sampled by title, treated as deliberately re-derived per DEC-0036. Out of scope honored: no writes; defects/undone-work left to other agents.

Structural fact framing every finding: `.context` is a fresh rebuild whose milestones (MILE-001..009) are ALL pi-context substrate-framework; the workflow/monitor/JIT arc from `project.json` is not a current milestone (partly deliberate per DEC-0048 "workflow FRAMEWORK is the only target," DEC-0036 "re-derive clean rather than migrate"). `.context/rationale.json` and `.context/project.json` do not carry `.project` content forward.

## DROPPED / UNREFLECTED INTENT (still needed) — ranked

**1. DEC-0051 (open) — object-form acceptance_criteria, explicitly scoped to this rebuild. DROPPED.**
Verbatim: *"ADOPT object-form acceptance_criteria schema... items {id (pattern ^TASK-\d{3,}-AC-\d{2,}$), text, status}... scoped under .context greenfield transition (no .project migration)"*; its own consequence: *".context greenfield schema-design absorbs the object-form AC shape from day one."*
Current state: `.context/schemas/tasks.schema.json` → `"acceptance_criteria": {"type":"array","items":{"type":"string"...}}` — still `string[]`.
Verdict: **dropped** (the greenfield it was scoped to shipped without it). Matters: partial-completion invisible, no AC-id FK for `depends_on` at criterion grain — the exact FGAP-114 defect it was filed to fix persists in the fresh substrate.

**2. Rationale block emptied + conventions block swapped wholesale — design intent lost its substrate home. DROPPED (block-level).**
`.project/rationale.json` = 8 RAT items; `.context/rationale.json` = `{"rationales":[]}`. `.project/conventions.json` = 16 code-invariant rules (`expression-no-eval`, `fail-fast`, `json-data-bus`, `atomic-state`, `domain-in-specs`, `subprocess-independence`, `three-template-syntaxes`, `nunjucks-composition`, `agent-input-schema`, `parametric-reuse`, `no-flat-duplication`, `no-pi-dir`, `tsc-build`, `esm`, `types-in-types-ts`, `bundled-specs-source-of-truth`); `.context/conventions.json` = a disjoint 18 *process* rules (rhetorical-register, feature-decomposition, docs-surface-sync…). Grep of `.context/conventions.json`+`config.json` for each `.project` code-convention id/keyword = **0 across the board**.
Verdict: **dropped from substrate** (some survive only as `CLAUDE.md` prose: `esm`/`tsc` line 74, atomic-tmp+rename line 199, Nunjucks/inputSchema line 194, `.pi/` line 132; RAT-004/RAT-006 survive only in code — `WorkflowContext` in `packages/pi-workflows/src/types.ts`, `validateWorkflow` in `workflow-sdk.ts`). By the project's own DEC-0040 (*"Substrate is the single source of truth for process; all other surfaces are projections"*) and the binding rule that `.context` filings are composed verbatim into subagent contexts, invariants living only in prose/code are unqueryable and unenforced. Matters: these are still-true runtime invariants (no-eval evaluator, fatal-fast, atomic state, subprocess independence) with no enforced substrate anchor.

**3. RAT-008 (HIGH-confidence) — peer-dependency freshness gate. DROPPED.**
Verbatim: *"check-peer-freshness.js... compares locally installed @mariozechner/pi-coding-agent against the globally installed version... 5 minor versions of drift (0.58.3 -> 0.63.1) hiding a breaking ModelRegistry API change."*
Current state: no peer script in `scripts/`; zero references in `scripts/`/`.husky/`/`package.json`; `.husky/pre-commit` gates are `check`, `test`, `check-changelog`, `parity-check`, `check-config-schema` only.
Verdict: **dropped** (no record of a deliberate retirement found; the rationale documenting the incident is itself orphaned). Matters: the silent-breakage class (local peer types compile clean, global pi SDK breaks at runtime) can recur undetected.

**4. DEC-0050 (open) — recognitions + substrate-conflicts blocks. DROPPED (partial).**
Verbatim: *"(1) recognitions.json (NEW)... (3) substrate-conflicts.json (NEW) — first-class home for in-substrate contradictions... replace the in-body Amendment/Widening prose-stacking pattern."*
Current state: `.context` block_kinds (18) contains neither `recognitions` nor `substrate-conflicts`; no such files. The narrowing half IS honored — `.context/decisions.json` is ratified-only (all 23 `enacted`, no `open`).
Verdict: **dropped** for the two new blocks / **honored** for decisions-narrowing. Matters: no lifecycle home for pre-decisions and no structured home for substrate contradictions (the pattern is again handled ad hoc).

**5. DEC-0034 (open) — conventions schema relational facets. Mostly DROPPED.**
Verbatim: *"Missing facets: title... category / domain... applies_to... related_decisions (closure-table edge home); status / lifecycle."*
Current state: `.context/schemas/conventions.schema.json` contains `title` (present) but NOT `category`/`domain`/`applies_to`/`related_decisions`/`status`; `.context/conventions.json` items still expose only `id`/`description`/`enforcement`/`severity`.
Verdict: **mostly dropped** (title added; relational/lens/lifecycle facets not). Matters: conventions remain grep-on-description, no `convention_emerges_from_decision` edge home, no lens-by-category — the discoverability DEC-0034 targeted.

**6. DEC-0033 (open) — status_buckets normalization mapping. PARTIALLY SUPERSEDED / mapping dropped.**
Verbatim intent: declare `config.status_buckets` bridging per-block enums to canonical buckets.
Current state: `config.status_buckets = {}` (empty). Bucket labels (`in_progress`/`todo`/`blocked`) DO appear, but inside `config.state_derivation` (in_flight/next_ranked/rollups), which references buckets without a declared enum→bucket map.
Verdict: **partially superseded** by `state_derivation`, but the explicit cross-block enum-normalization map is unreflected — cross-block "is X complete?" still lacks the declared bridge. (Cause-neutral: could be intentional consolidation.)

**7. project.json goals/constraints/scope_boundaries — no substrate home. DROPPED (structural).**
Verbatim: scope out = *"No pi-subagents dependency — extensions own their own dispatch"*, *"No runtime TypeScript for domain logic"*; core_value = *"the domain lives in specs, schemas, and templates."*
Current state: no `.context/project.json`; `requirements.json`/`spec-reviews.json`/`work-orders.json` are empty stubs. ESM/lockstep survive in `CLAUDE.md`; the scope boundaries and core_value have no substrate anchor.
Verdict: **dropped** (project-identity block not carried forward). Matters: the load-bearing negative constraints ("no pi-subagents dep," "no runtime TS for domain") are the guardrails most easily violated by a fresh contributor, now unfiled.

**8. Referenceability of frozen .project — ORPHANED, not referenced-as-authority.**
David's stated intent: *frozen-but-referenceable — "we can refer to elements in frozen .project in new context blocks."*
Current state: `.context` does mention `.project` (decisions×1, framework-gaps×9, tasks×5, session-notes×11), but sampled content shows these are **deprecation/cleanup** references — scrubbing stale `.project/` paths from templates, ID-collision notes ("frozen .project-era IDs that now collide"), citations to `.project-archived`. None are authority citations pulling a `.project` decision/rationale forward into a new block.
Verdict: **orphaned** — the frozen substrate is cited to be removed/deconflicted, not to be honored as standing authority. Matters: the authority-bearing filings ("filing means it has my authority") are being treated as disposable, contradicting the referenceable-authority intent.

Note (reflected, not dropped): DEC-0014/0016 (harness-confined, no-direct-substrate-edits) are strongly carried forward — `CLAUDE.md` §"pi-context-cli direct-drive discipline" + Forbidden list. DEC-0018 (runtime-demo + adversarial probe) fully reflected (Completion Sequence steps 5-6). DEC-0047 human-ratification-of-capability-mutation survives in spirit as grant-gated corrections (`audit-substrate-currency` grant-gated), though the literal `constitutional`/`ratification`/`tool_operations_forbidden` registry is empty/absent — borderline deferred-implementation, cause-neutral. DEC-0011 (ships no seed) appears deliberately superseded by the catalog-install model (DEC-0037/0043; `installed_schemas`/`installed_blocks` populated).

## EMERGENT CATEGORIES

- **A. Block-level orphaning in the fresh rebuild.** The three intent-bearing blocks least tied to the pi-context arc — `rationale` (emptied), `conventions` (replaced wholesale with process rules), `project.json` (not recreated) — dropped their `.project` content. Intent survived, if at all, only as `CLAUDE.md` prose or in code, i.e. demoted out of the queryable/enforced substrate that DEC-0040 declares the single source of truth. (Findings 2, 7)
- **B. Greenfield-scoped open decisions the greenfield didn't build.** The substrate-shape migration family (DEC-0051 explicit "from day one," DEC-0050, DEC-0034, DEC-0033) was scoped precisely to the `.context` transition and largely not implemented there. (Findings 1, 4, 5, 6)
- **C. Enforcement/gate attrition.** A recorded-incident enforcement gate (RAT-008 peer-freshness) and enforced code conventions (`expression-no-eval` test-gate, `fail-fast`) survive as description or not at all — no enforced substrate/hook anchor. (Findings 2, 3)
- **D. Referenceability inverted.** Frozen `.project` is cited for removal/deconfliction, not honored as standing authority — the opposite of the frozen-but-referenceable intent. (Finding 8)
