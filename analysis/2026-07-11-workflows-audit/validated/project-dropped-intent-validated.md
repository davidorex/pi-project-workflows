# Dropped / unreflected intent — re-validated against CURRENT state

Re-confirmation of every atom in `atoms/project-dropped-intent-atoms.md` against the live substrate at `/Users/david/Projects/workflowsPiExtension/.context/` (schemas, `config.json`, `decisions.json`, `conventions.json`, `rationale.json`, block_kinds registry), `CLAUDE.md`, `.husky/pre-commit`, and `scripts/`. Each atom carries its original id/group/verdict-from-atom/action/scope; the intent quote is preserved verbatim. A freshly-observed current-state verdict + evidence is added per atom. Nothing reconciled.

Note on decision IDs: the atoms cite `.project`-era DEC numbers; `.context` carries its own independent renumbering (24 decisions, a different DEC-0011). Current-state verdicts are anchored to observed substrate state, not to DEC-number matching.

## GROUP-DI-01 — Block-level orphaning in the fresh rebuild (category A)

### ATOM-DI-02 — `.project/rationale.json` (8 RAT items) emptied with no substrate home in `.context`  [VERDICT: unreflected-confirmed]
- intent (verbatim, unchanged): *".project/rationale.json = 8 RAT items; .context/rationale.json = {"rationales":[]}"*; *"By the project's own DEC-0040 ('Substrate is the single source of truth for process; all other surfaces are projections')... invariants living only in prose/code are unqueryable and unenforced."*
- action: re-file — restore the design rationales into `.context/rationale.json` (or the substrate's rationale home) so still-true rationale is queryable, per DEC-0040.
- scope: RAT-001..008 (excluding RAT-008 → ATOM-DI-07); target `.context/rationale.json`
- observed: `.context/rationale.json` reads exactly `{ "rationales": [] }` (empty array) as of 2026-07-11 23:00. The `rationale` block_kind IS registered (block_kinds entry: `canonical_id: rationale`, `prefix: RAT-`, `data_path: rationale.json`) and is in `installed_blocks`, so the home exists but holds zero items. No RAT items are queryable from substrate. Absence verified.

### ATOM-DI-03 — 16 code-invariant conventions dropped from substrate; conventions block swapped wholesale for process rules  [VERDICT: unreflected-confirmed]
- intent (verbatim, unchanged): *".project/conventions.json = 16 code-invariant rules... .context/conventions.json = a disjoint 18 process rules... Grep of .context/conventions.json+config.json for each .project code-convention id/keyword = 0 across the board."* Matters: *"still-true runtime invariants (no-eval evaluator, fatal-fast, atomic state, subprocess independence) with no enforced substrate anchor."*
- action: re-file + enforce — restore the still-true code-invariant conventions into `.context/conventions.json`/`config.json`.
- scope: 16 `.project` conventions ids; target `.context/conventions.json` + `.context/config.json`
- observed: grep of all 16 ids/keywords (`expression-no-eval`, `fail-fast`, `json-data-bus`, `atomic-state`, `domain-in-specs`, `subprocess-independence`, `three-template-syntaxes`, `nunjucks-composition`, `agent-input-schema`, `parametric-reuse`, `no-flat-duplication`, `no-pi-dir`, `tsc-build`, `esm`, `types-in-types-ts`, `bundled-specs-source-of-truth`) across `.context/conventions.json` + `.context/config.json` returns 0 for every id. `.context/conventions.json` now holds 19 process rules (e.g. `cli-command-form`); item keys are only `id/description/enforcement/severity` (+ `oid/content_hash/content_parent` metadata) — a disjoint process set. Zero code-invariant anchor confirmed.

### ATOM-DI-08 — `project.json` goals/constraints/scope_boundaries have no substrate home  [VERDICT: unreflected-confirmed]
- intent (verbatim, unchanged): scope out = *"No pi-subagents dependency — extensions own their own dispatch"*, *"No runtime TypeScript for domain logic"*; core_value = *"the domain lives in specs, schemas, and templates."*
- action: re-file — anchor the load-bearing negative constraints and core_value into the substrate.
- scope: `project.json` goals/constraints/scope_boundaries/core_value; target a `.context` project-identity/constraints home
- observed: no `.context/project.json` exists (directory listing confirms absence). `.context/requirements.json` = `{ "requirements": [] }`, `.context/spec-reviews.json` = `{ "reviews": [] }`, `.context/work-orders.json` = `{ "work_orders": [] }` — all empty stubs. No block_kind carries project-identity/constraints; the negative constraints and specs/schemas/templates core_value have no substrate anchor and are recoverable only from `CLAUDE.md` prose. Absence verified.

## GROUP-DI-02 — Greenfield-scoped open decisions the greenfield didn't build (category B)

### ATOM-DI-01 — DEC-0051 object-form acceptance_criteria never built in the greenfield it was scoped to  [VERDICT: unreflected-confirmed]
- intent (verbatim, unchanged): *"ADOPT object-form acceptance_criteria schema... items {id (pattern ^TASK-\d{3,}-AC-\d{2,}$), text, status}... scoped under .context greenfield transition (no .project migration)"*; consequence — *".context greenfield schema-design absorbs the object-form AC shape from day one."*
- action: restore — implement the object-form AC schema in `.context/schemas/tasks.schema.json` (items `{id, text, status}`).
- scope: DEC-0051; target `.context/schemas/tasks.schema.json`
- observed: `.context/schemas/tasks.schema.json` (v1.1.0) still defines `acceptance_criteria` as `{"type":"array","items":{"type":"string", "x-prompt-budget":...}}` (lines 54–63). Items are plain strings; no `id`/`text`/`status` object shape, no `^TASK-\d{3,}-AC-\d{2,}$` pattern, no criterion-grain FK surface. String[] form confirmed unchanged.

### ATOM-DI-04 — DEC-0050 `recognitions.json` and `substrate-conflicts.json` blocks not built  [VERDICT: unreflected-confirmed]
- intent (verbatim, unchanged): *"(1) recognitions.json (NEW)... (3) substrate-conflicts.json (NEW) — first-class home for in-substrate contradictions... replace the in-body Amendment/Widening prose-stacking pattern."* Honored half — *".context/decisions.json is ratified-only (all 23 enacted, no open)."*
- action: restore — add the two `.context` block_kinds `recognitions` and `substrate-conflicts` (and their files).
- scope: DEC-0050; target `.context` block_kinds registry + new files
- observed: `config.json` `block_kinds` holds 18 kinds (decisions, framework-gaps, tasks, verification, issues, features, research, rationale, spec-reviews, layer-plans, requirements, conventions, context-contracts, phase, story, work-orders, session-notes, milestone) — neither `recognitions` nor `substrate-conflicts` present; JSON-substring search for both across `config.json` returns false; no such files in `.context/`. Absence confirmed. Fresh note on the honored-half: `.context/decisions.json` now holds 24 decisions — 23 `enacted` + 1 `open` (DEC-0024, edge write-guard) — so the "no open" characterization is now marginally stale, but the core recognitions/substrate-conflicts absence stands.

### ATOM-DI-05 — DEC-0034 conventions-schema relational facets mostly not added  [VERDICT: unreflected-confirmed]
- intent (verbatim, unchanged): *"Missing facets: title... category / domain... applies_to... related_decisions (closure-table edge home); status / lifecycle."*
- action: re-file — extend `.context/schemas/conventions.schema.json` with `category`/`domain`, `applies_to`, `related_decisions`, `status`/lifecycle.
- scope: DEC-0034; target `.context/schemas/conventions.schema.json` (+ items)
- observed: `.context/schemas/conventions.schema.json` (v1.1.0) rule-item `properties` are only `id`, `description`, `enforcement` (enum lint/test/review/manual), `severity` (enum error/warning/info), plus `oid`/`content_hash`/`content_parent`. No `category`, `domain`, `applies_to`, `related_decisions`, or `status`/lifecycle. (The atom noted `title` as "present"; it is now also absent from the item schema.) `.context/conventions.json` items expose only `id/description/enforcement/severity`. Relational/lens/lifecycle facets confirmed unbuilt.

### ATOM-DI-06 — DEC-0033 `status_buckets` enum→bucket normalization map absent  [VERDICT: superseded-noted]
- intent (verbatim, unchanged): *"declare config.status_buckets bridging per-block enums to canonical buckets."*
- action: confirm-with-David — confirm whether `config.state_derivation` is accepted as the replacement for `config.status_buckets`, or the enum→bucket bridge must be restored.
- scope: DEC-0033; target `.context/config.json` (`status_buckets` / `state_derivation`)
- observed: `config.json` line 751 `"status_buckets": {}` (empty map). `config.json` line 1030 `state_derivation` is populated with keys `in_flight`, `focus_fallback`, `next_ranked`, `blocked_by`, `rollups`, `head_size`. The bucket-referencing derivation lives in `state_derivation`; the explicit cross-block enum→bucket map (`status_buckets`) remains empty. Current superseding state confirmed as the report described; no restore asserted — David's ruling pending.

## GROUP-DI-03 — Enforcement / gate attrition (category C)

### ATOM-DI-07 — RAT-008 peer-dependency freshness gate (`check-peer-freshness.js`) dropped  [VERDICT: unreflected-confirmed]
- intent (verbatim, unchanged): *"check-peer-freshness.js... compares locally installed @mariozechner/pi-coding-agent against the globally installed version... 5 minor versions of drift (0.58.3 -> 0.63.1) hiding a breaking ModelRegistry API change."*
- action: restore + enforce — reinstate the gate and wire it into `.husky/pre-commit`.
- scope: RAT-008; target `scripts/check-peer-freshness.js` + `.husky/pre-commit`
- observed: no `check-peer-freshness*` file anywhere in the repo (find, excluding node_modules, returns nothing); no `peer-freshness`/`check-peer` reference in `scripts/`, `.husky/`, or `package.json`. `.husky/pre-commit` runs exactly five gates: `npm run check`, `npm test`, `npx tsx scripts/check-changelog.ts`, `npx tsx scripts/parity-check.ts`, `npx tsx scripts/check-config-schema.ts`. No peer-freshness gate. Absence confirmed; no retirement record observed in-substrate.

## GROUP-DI-04 — Referenceability inverted (category D)

### ATOM-DI-09 — Frozen `.project` cited for removal/deconfliction, not honored as standing authority  [VERDICT: contradicted-confirmed]
- intent (verbatim, unchanged): *"frozen-but-referenceable — 'we can refer to elements in frozen .project in new context blocks.'"*
- action: confirm-with-David + enforce — confirm the frozen-but-referenceable intent still holds, then establish the practice that `.project` authority-bearing filings are cited to be honored (pulled forward), not merely scrubbed.
- scope: Finding 8 (referenceability); target `.context` referencing practice + at least one authority citation pulling a `.project` decision/rationale forward
- observed: every current `.project` mention in `.context/*.json` is deprecation/cleanup or historical status, not authority: `issues.json` issue-012 flags "frozen .project-era IDs... that collide" to be scrubbed (`resolved_by` TASK-108); `framework-gaps.json` FGAP entries flag ".project/" leakage in schema descriptions to genericize; `verification.json`/`tasks.json` describe correcting the literal `.project/work-orders.json` path string and removing `.project/agents` docblock wording; `session-notes.json` records ".project frozen" / "lazy-migration... content moves only on first canonical need" and a cross-substrate consultation tool "deferred until first .context item cites .project archaeology." No `.context` block cites a `.project` decision/rationale forward as standing authority. The referenceable-authority direction is inverted (cite-to-remove); the honoring mechanism is conceived-but-unexercised. Contradiction confirmed; David's confirmation of the intent still pending.

## GROUP-DI-05 — Deliberately superseded — confirm-only, not restore

### ATOM-DI-10 — DEC-0011 "ships no seed" superseded by catalog-install model  [VERDICT: superseded-noted]
- intent (verbatim, unchanged): *"DEC-0011 (ships no seed) appears deliberately superseded by the catalog-install model (DEC-0037/0043; installed_schemas/installed_blocks populated)."*
- action: confirm-with-David — confirm the supersession is intended and ratify; do not restore.
- scope: DEC-0011 vs DEC-0037/0043; no target file unless David reverses
- observed: `config.json` `installed_schemas` (line 752) holds 17 entries and `installed_blocks` (line 771) holds 17 entries (`decisions, framework-gaps, tasks, verification, issues, features, research, rationale, spec-reviews, layer-plans, requirements, conventions, context-contracts, phase, story, work-orders, milestone`). The catalog-install model is materially in effect: the substrate ships a populated installed catalog rather than "no seed." Superseding state confirmed; no restore asserted — David's ratification pending.

### ATOM-DI-11 — DEC-0047 human-ratification-of-capability-mutation registry empty/absent  [VERDICT: superseded-noted]
- intent (verbatim, unchanged): *"DEC-0047 human-ratification-of-capability-mutation survives in spirit as grant-gated corrections (audit-substrate-currency grant-gated), though the literal constitutional/ratification/tool_operations_forbidden registry is empty/absent — borderline deferred-implementation, cause-neutral."*
- action: confirm-with-David — confirm whether the registry is deferred (to build) or the grant-gated form is accepted as the reflection.
- scope: DEC-0047; target the `constitutional`/`ratification`/`tool_operations_forbidden` registry
- observed: `config.json` line 952 `"tool_operations_forbidden": []` (empty array); no `constitutional` or standalone `ratification` registry key exists in `config.json` (the only `ratification`-adjacent hits are prose inside a decision body describing config registries). The grant-gated form IS present in spirit: `config.json` describes a user-minted "grant object" that write-shields HELD actions with a "cross-check that each grant open corresponds to a user message... natural home the audit-substrate-currency skill," and `tasks.json` carries the `audit-substrate-currency`/context-currency-auditor apparatus. Literal registry empty/absent confirmed; grant-gated reflection present. Deferred-vs-accepted ruling pending David.

---

## Verdict tally (11 atoms)
- unreflected-confirmed: 7 — ATOM-DI-01, -02, -03, -04, -05, -07, -08
- contradicted-confirmed: 1 — ATOM-DI-09
- superseded-noted: 3 — ATOM-DI-06, -10, -11
- actually-reflected (refuted): 0
