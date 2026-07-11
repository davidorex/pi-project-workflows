# Dropped / unreflected intent (.project→.context) — actionable atoms

Source: `analysis/2026-07-11-workflows-audit/project-carryforward-intent.md` (verbatim report). Every atom carries the report's verdict. Verdicts `dropped`/`contradicted` are reconcile-by-action; `superseded-deliberately` is at most confirm-with-David. No intent is asserted beyond the report's quotes.

## Groups
- GROUP-DI-01: Block-level orphaning in the fresh rebuild (category A) — atoms: ATOM-DI-02, ATOM-DI-03, ATOM-DI-08
- GROUP-DI-02: Greenfield-scoped open decisions the greenfield didn't build (category B) — atoms: ATOM-DI-01, ATOM-DI-04, ATOM-DI-05, ATOM-DI-06
- GROUP-DI-03: Enforcement / gate attrition (category C) — atoms: ATOM-DI-07 (overlaps ATOM-DI-03)
- GROUP-DI-04: Referenceability inverted (category D) — atoms: ATOM-DI-09
- GROUP-DI-05: Deliberately superseded — confirm-only, not restore — atoms: ATOM-DI-10, ATOM-DI-11

## Atoms

### ATOM-DI-01 — DEC-0051 object-form acceptance_criteria never built in the greenfield it was scoped to
- group: GROUP-DI-02
- verdict: dropped
- action: restore — implement the object-form AC schema in `.context/schemas/tasks.schema.json` (items `{id (pattern ^TASK-\d{3,}-AC-\d{2,}$), text, status}`), the shape DEC-0051 scoped to this rebuild "from day one".
- evidence: intent — *"ADOPT object-form acceptance_criteria schema... items {id (pattern ^TASK-\d{3,}-AC-\d{2,}$), text, status}... scoped under .context greenfield transition (no .project migration)"*; consequence — *".context greenfield schema-design absorbs the object-form AC shape from day one."* Current state — `.context/schemas/tasks.schema.json` → `"acceptance_criteria": {"type":"array","items":{"type":"string"...}}` — still `string[]`. (source: project-carryforward-intent.md)
- scope: DEC-0051; target `.context/schemas/tasks.schema.json`
- verify: `acceptance_criteria.items.type` is `object` with `id`/`text`/`status`; `id` carries the `^TASK-\d{3,}-AC-\d{2,}$` pattern; criterion-grain `depends_on` FK becomes expressible (closes the FGAP-114 defect class).

### ATOM-DI-02 — `.project/rationale.json` (8 RAT items) emptied with no substrate home in `.context`
- group: GROUP-DI-01
- verdict: dropped
- action: re-file — restore the design rationales into `.context/rationale.json` (or the substrate's rationale home) so still-true rationale is queryable, per DEC-0040 (substrate is the single source of truth for process). RAT-004/RAT-006 currently survive only in code (`WorkflowContext` in `packages/pi-workflows/src/types.ts`, `validateWorkflow` in `workflow-sdk.ts`).
- evidence: *".project/rationale.json = 8 RAT items; .context/rationale.json = {"rationales":[]}"*; *"By the project's own DEC-0040 ('Substrate is the single source of truth for process; all other surfaces are projections')... invariants living only in prose/code are unqueryable and unenforced."* (source: project-carryforward-intent.md)
- scope: RAT-001..008 (excluding RAT-008 → ATOM-DI-07); target `.context/rationale.json`
- verify: `.context/rationale.json` is non-empty and carries the still-applicable RAT items; each is discoverable by substrate query rather than only by reading `CLAUDE.md` prose or source.

### ATOM-DI-03 — 16 code-invariant conventions dropped from substrate; conventions block swapped wholesale for process rules
- group: GROUP-DI-01
- verdict: dropped
- action: re-file + enforce — restore the still-true code-invariant conventions into `.context/conventions.json`/`config.json` (candidates: `expression-no-eval`, `fail-fast`, `json-data-bus`, `atomic-state`, `domain-in-specs`, `subprocess-independence`, `three-template-syntaxes`, `nunjucks-composition`, `agent-input-schema`, `parametric-reuse`, `no-flat-duplication`, `no-pi-dir`, `tsc-build`, `esm`, `types-in-types-ts`, `bundled-specs-source-of-truth`) so runtime invariants have an enforced substrate anchor, not only `CLAUDE.md` prose (`esm`/`tsc` line 74, atomic-tmp+rename line 199, Nunjucks/inputSchema line 194, `.pi/` line 132).
- evidence: *".project/conventions.json = 16 code-invariant rules... .context/conventions.json = a disjoint 18 process rules... Grep of .context/conventions.json+config.json for each .project code-convention id/keyword = 0 across the board."* Matters: *"still-true runtime invariants (no-eval evaluator, fatal-fast, atomic state, subprocess independence) with no enforced substrate anchor."* (source: project-carryforward-intent.md)
- scope: 16 `.project` conventions ids listed above; target `.context/conventions.json` + `.context/config.json`
- verify: each restored code-invariant id/keyword returns a hit in `.context/conventions.json`/`config.json` (grep no longer 0); at least the enforced ones (`expression-no-eval`, `fail-fast`) map to a live gate.

### ATOM-DI-04 — DEC-0050 `recognitions.json` and `substrate-conflicts.json` blocks not built
- group: GROUP-DI-02
- verdict: dropped (partial — the decisions-narrowing half is honored, not an atom)
- action: restore — add the two `.context` block_kinds `recognitions` and `substrate-conflicts` (and their files) so pre-decisions have a lifecycle home and in-substrate contradictions have a structured first-class home, replacing the ad-hoc in-body Amendment/Widening prose-stacking pattern.
- evidence: intent — *"(1) recognitions.json (NEW)... (3) substrate-conflicts.json (NEW) — first-class home for in-substrate contradictions... replace the in-body Amendment/Widening prose-stacking pattern."* Current — *".context block_kinds (18) contains neither recognitions nor substrate-conflicts; no such files."* Honored half — *".context/decisions.json is ratified-only (all 23 enacted, no open)."* (source: project-carryforward-intent.md)
- scope: DEC-0050; target `.context` block_kinds registry + new `recognitions.json` / `substrate-conflicts.json`
- verify: `recognitions` and `substrate-conflicts` appear in the block_kinds set; the files exist and are wired as the home for pre-decisions and substrate contradictions.

### ATOM-DI-05 — DEC-0034 conventions-schema relational facets mostly not added
- group: GROUP-DI-02
- verdict: dropped (mostly — `title` added; relational/lens/lifecycle facets not)
- action: re-file — extend `.context/schemas/conventions.schema.json` with the missing facets `category`/`domain`, `applies_to`, `related_decisions` (closure-table edge home), and `status`/lifecycle, so conventions are discoverable by lens/category and can carry a `convention_emerges_from_decision` edge rather than grep-on-description.
- evidence: intent — *"Missing facets: title... category / domain... applies_to... related_decisions (closure-table edge home); status / lifecycle."* Current — *".context/schemas/conventions.schema.json contains title (present) but NOT category/domain/applies_to/related_decisions/status; .context/conventions.json items still expose only id/description/enforcement/severity."* (source: project-carryforward-intent.md)
- scope: DEC-0034; target `.context/schemas/conventions.schema.json` (+ `.context/conventions.json` items)
- verify: schema admits `category`/`domain`/`applies_to`/`related_decisions`/`status`; a convention can express a `related_decisions` edge and be filtered by category.

### ATOM-DI-06 — DEC-0033 `status_buckets` enum→bucket normalization map absent
- group: GROUP-DI-02
- verdict: superseded-deliberately (partial — report marks it partially-superseded by `state_derivation`; cause-neutral, could be intentional consolidation)
- action: confirm-with-David — confirm whether `config.state_derivation` (in_flight/next_ranked/rollups) is accepted as the replacement for the explicit `config.status_buckets` enum→bucket map, or whether the declared cross-block enum-normalization bridge must be restored.
- evidence: intent — *"declare config.status_buckets bridging per-block enums to canonical buckets."* Current — *"config.status_buckets = {} (empty). Bucket labels (in_progress/todo/blocked) DO appear, but inside config.state_derivation... which references buckets without a declared enum→bucket map."* Verdict — *"partially superseded by state_derivation, but the explicit cross-block enum-normalization map is unreflected... (Cause-neutral: could be intentional consolidation.)"* (source: project-carryforward-intent.md)
- scope: DEC-0033; target `.context/config.json` (`status_buckets` / `state_derivation`)
- verify: David rules — either the atom closes as ratified-supersession (no map needed), or `status_buckets` is populated with the declared enum→bucket bridge so cross-block "is X complete?" has an explicit map.

### ATOM-DI-07 — RAT-008 peer-dependency freshness gate (`check-peer-freshness.js`) dropped
- group: GROUP-DI-03
- verdict: dropped
- action: restore + enforce — reinstate the `check-peer-freshness.js` gate and wire it into `.husky/pre-commit`, guarding the recorded silent-breakage class (local peer types compile clean while the global pi SDK breaks at runtime).
- evidence: intent — *"check-peer-freshness.js... compares locally installed @mariozechner/pi-coding-agent against the globally installed version... 5 minor versions of drift (0.58.3 -> 0.63.1) hiding a breaking ModelRegistry API change."* Current — *"no peer script in scripts/; zero references in scripts/.husky/package.json; .husky/pre-commit gates are check, test, check-changelog, parity-check, check-config-schema only."* Verdict — *"dropped (no record of a deliberate retirement found; the rationale documenting the incident is itself orphaned)."* (source: project-carryforward-intent.md)
- scope: RAT-008; target `scripts/check-peer-freshness.js` + `.husky/pre-commit`
- verify: the peer-freshness script exists and runs; `.husky/pre-commit` invokes it; a synthetic local/global version drift is detected and blocks.

### ATOM-DI-08 — `project.json` goals/constraints/scope_boundaries have no substrate home
- group: GROUP-DI-01
- verdict: dropped (structural — project-identity block not carried forward)
- action: re-file — anchor the load-bearing negative constraints and core_value into the substrate (no current `.context/project.json`; `requirements.json`/`spec-reviews.json`/`work-orders.json` are empty stubs) so the guardrails a fresh contributor most easily violates are filed and queryable.
- evidence: intent — scope out = *"No pi-subagents dependency — extensions own their own dispatch"*, *"No runtime TypeScript for domain logic"*; core_value = *"the domain lives in specs, schemas, and templates."* Current — *"no .context/project.json; requirements.json/spec-reviews.json/work-orders.json are empty stubs. ESM/lockstep survive in CLAUDE.md; the scope boundaries and core_value have no substrate anchor."* Verdict — *"the load-bearing negative constraints ('no pi-subagents dep,' 'no runtime TS for domain') are the guardrails most easily violated by a fresh contributor, now unfiled."* (source: project-carryforward-intent.md)
- scope: `project.json` goals/constraints/scope_boundaries/core_value; target a `.context` project-identity/constraints home
- verify: the negative constraints ("no pi-subagents dependency", "no runtime TS for domain logic") and the specs/schemas/templates core_value are recoverable from substrate, not only `CLAUDE.md`.

### ATOM-DI-09 — Frozen `.project` cited for removal/deconfliction, not honored as standing authority (referenceability inverted)
- group: GROUP-DI-04
- verdict: contradicted
- action: confirm-with-David + enforce — David's stated intent is frozen-but-referenceable authority; current references invert it (deprecation/cleanup only). Confirm the intent still holds, then establish the practice/convention that `.project` authority-bearing filings are cited to be honored (pulled forward) as standing authority, not merely scrubbed.
- evidence: intent — *"frozen-but-referenceable — 'we can refer to elements in frozen .project in new context blocks.'"* Current — *".context does mention .project... but sampled content shows these are deprecation/cleanup references — scrubbing stale .project/ paths... citations to .project-archived. None are authority citations pulling a .project decision/rationale forward into a new block."* Verdict — *"orphaned — the frozen substrate is cited to be removed/deconflicted, not to be honored as standing authority, contradicting the referenceable-authority intent."* (source: project-carryforward-intent.md)
- scope: Finding 8 (referenceability); target `.context` referencing practice + at least one authority citation pulling a `.project` decision/rationale forward
- verify: David confirms the frozen-but-referenceable intent still stands; at least one `.context` block cites a `.project` decision/rationale as standing authority (not for removal), or the intent is ratified as retired.

### ATOM-DI-10 — DEC-0011 "ships no seed" superseded by catalog-install model
- group: GROUP-DI-05
- verdict: superseded-deliberately
- action: confirm-with-David — the report reads this as a deliberate supersession (catalog-install per DEC-0037/0043; `installed_schemas`/`installed_blocks` populated). Confirm the supersession is intended and ratify; do not restore.
- evidence: *"DEC-0011 (ships no seed) appears deliberately superseded by the catalog-install model (DEC-0037/0043; installed_schemas/installed_blocks populated)."* (source: project-carryforward-intent.md)
- scope: DEC-0011 vs DEC-0037/0043; no target file unless David reverses
- verify: David affirms DEC-0011 is superseded by the catalog-install model; atom closes as ratified-supersession.

### ATOM-DI-11 — DEC-0047 human-ratification-of-capability-mutation registry empty/absent (deferred vs superseded)
- group: GROUP-DI-05
- verdict: superseded-deliberately (borderline deferred-implementation, cause-neutral)
- action: confirm-with-David — DEC-0047 survives in spirit as grant-gated corrections (`audit-substrate-currency` grant-gated), but the literal `constitutional`/`ratification`/`tool_operations_forbidden` registry is empty/absent. Confirm whether the registry is deferred (to build) or the grant-gated form is accepted as the reflection.
- evidence: *"DEC-0047 human-ratification-of-capability-mutation survives in spirit as grant-gated corrections (audit-substrate-currency grant-gated), though the literal constitutional/ratification/tool_operations_forbidden registry is empty/absent — borderline deferred-implementation, cause-neutral."* (source: project-carryforward-intent.md)
- scope: DEC-0047; target the `constitutional`/`ratification`/`tool_operations_forbidden` registry (if David rules "build")
- verify: David rules deferred-build (registry gets populated) or accepted-as-reflected (grant-gated form ratified); atom closes accordingly.
