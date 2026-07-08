# pi-workflows: expression-filter documentation & bundled-spec validation — claim evaluation

Date: 2026-07-08
Scope: EVALUATION + ROOT-CAUSE only (no fixes, no substrate writes). Read-only.
Active substrate: `.context` (confirmed via `.pi-context.json` `contextDir`).

---

## CLAIM 1 — expression filters are drastically misdocumented — **VERDICT: TRUE**

### Actual registered filters (the `${{ }}` expression layer)

`packages/pi-workflows/src/expression.ts:10-29`, the `FILTERS` map, registers exactly **10**:

```
duration, currency, json, length, keys, filter, last, first, slugify, shell
```

(`FILTER_NAMES = Object.keys(FILTERS)` at `expression.ts:32`; `workflow-sdk.ts:103-105` re-exports it as the SDK's `filterNames()` and the `filter-names` validation check consumes the same set.)

This matches the claim's "only 10" list verbatim.

### What the docs advertise (the ~30-filter list), all attached to the `${{ }}` layer

Three surfaces carry the same 30-name list, each explicitly in the `${{ }}` *expression* context (not a `{{ }}` template context):

- `packages/pi-workflows/README.md:95-104` — heading "`${{ }}` expressions access step outputs, inputs, and apply filters", then: `length, keys, filter, json, upper, lower, trim, default, first, last, join, split, replace, includes, map, sum, min, max, sort, unique, flatten, zip, group_by, count_by, chunk, pick, omit, entries, from_entries, merge, values, not, and, or`
- `packages/pi-workflows/skills/pi-workflows/SKILL.md:286-288` — "Filters: `${{ steps.analyze.output | json }}` … Available filters: length, keys, filter, json, upper, lower, trim, default, …, not, and, or."
- `packages/pi-workflows/skill-narrative.md:40-42` — identical list (SKILL.md is generated from this narrative; `npm run skills`).

### Advertised-minus-registered (the phantom filters)

Documented but NOT registered (20): `upper, lower, trim, default, join, split, replace, includes, map, sum, min, max, sort, unique, flatten, zip, group_by, count_by, chunk, pick, omit, entries, from_entries, merge, values, not, and, or`. (Registered-but-undocumented: `duration, currency, slugify, shell` — the docs' list omits these four.)

### Runtime-failure claim — CONFIRMED (mechanically), but LATENT for shipped specs

`expression.ts:110-114`: an unrecognized filter throws
```
throw new ExpressionError(expr, `unknown filter '${filterName}'`);
```
So a spec using e.g. `${{ x | upper }}` throws at runtime. Two mitigating facts:

- Authoring-time validation only **warns** (does not invalidate): `workflow-sdk.ts:558-568`, `filter-names` check, `severity:"warning"`, message `Unknown filter '<name>'. Available: <10-list>`.
- **No bundled spec uses a phantom filter.** Every `| filter }}` occurrence across `workflows/*.workflow.yaml` uses only registered names: `length`, `shell`, `last`, `json` (grep of the 15 specs). So the trap is latent — it bites an author who trusts the docs and writes a NEW spec with a documented-but-unregistered filter; it does not break any shipped workflow.

### Root cause & class

**Genuine stale / aspirational documentation of a surface that does not exist — not a two-layer conflation.** The decisive test: `template.ts` (the Nunjucks `{{ }}` agent-prompt layer, `packages/pi-workflows/src/template.ts:26-45`) registers **zero** custom filters — it is a stock `nunjucks.Environment`. So the phantom names are not "real Nunjucks filters the docs mislabeled." Cross-checking the 20 phantom names against stock Nunjucks builtins: Nunjucks does provide `upper, lower, trim, default, join, replace, sum, sort` — but a large residual (`keys, filter, split, includes, map, min, max, unique, flatten, zip, group_by, count_by, chunk, pick, omit, entries, from_entries, merge, values, not, and, or`) exists in **neither** the expression layer **nor** Nunjucks. The list reads as an imagined lodash/Jinja-superset that was never implemented in either rendering context.

Class: *docs describe a capability surface the code never grew* (documentation-ahead-of-implementation). The `${{ }}` filter registry is a deliberately minimal 10-entry set (duration/currency/slugify/shell are domain-specific to this engine); the doc list was authored against an aspirational spec and never reconciled to `FILTER_NAMES`, even though the SDK deliberately derives `filterNames()` from the registry so the *machine* list stays honest — the prose list bypasses that single source of truth.

---

## CLAIM 2 — most bundled workflow specs fail validation — **VERDICT: TRUE** (per-spec breakdown exact; causal attribution needs one refinement)

### Method

Ran the real SDK validator (`validateWorkflow` from `packages/pi-workflows/dist/workflow-sdk.js`) against all 15 discovered bundled specs, cwd = repo root (active `.context` substrate). Full raw output retained during the session. Status buckets:

| Spec | Status | errors | warnings | Claim says |
|---|---|---|---|---|
| analyze-existing-project | **invalid** | 4 | 19 | failing ✓ |
| create-phase | **invalid** | 1 | 6 | failing ✓ |
| do-gap | **invalid** | 5 | 15 | failing ✓ |
| fix-audit | **invalid** | 3 | 8 | failing ✓ |
| gap-to-phase | **invalid** | 1 | 6 | failing ✓ |
| init-new-project | **invalid** | 1 | 26 | failing ✓ |
| pausable-analysis | **invalid** | 2 | 15 | failing ✓ |
| resumable-analysis | **invalid** | 2 | 15 | failing ✓ |
| create-handoff | warnings | 0 | 9 | passes w/ warnings ✓ |
| execute-task | warnings | 0 | 7 | passes w/ warnings ✓ |
| parallel-analysis | warnings | 0 | 7 | passes w/ warnings ✓ |
| parallel-explicit | warnings | 0 | 5 | passes w/ warnings ✓ |
| plan-from-requirements | warnings | 0 | 9 | passes w/ warnings ✓ |
| self-implement | warnings | 0 | 8 | (not named) |
| typed-analysis | warnings | 0 | 7 | (not named) |

All 8 specs the claim names as failing are `invalid`; all 5 it names as passing-with-warnings are `warnings` (0 errors). The two the claim omits (self-implement, typed-analysis) are also warnings-only. **The claim's per-spec breakdown is exactly right.**

### Missing block schemas — confirmed absent from THIS substrate

`pi-context read-config --registry installed_blocks` returns:
```
decisions, framework-gaps, tasks, verification, issues, features, research,
rationale, spec-reviews, layer-plans, requirements, conventions,
context-contracts, phase, story, work-orders, milestone
```
`project`, `architecture`, `handoff`, `inventory` are **all absent**. The validator emits `Block schema not found: block:<name> (resolved to .context/schemas/<name>.schema.json)` for each where referenced (analyze-existing-project → project+architecture; init-new-project → project+architecture; create-handoff → handoff; create-phase/gap-to-phase → architecture+inventory via template field access; plan-from-requirements → project+architecture).

### Refinement to the causal attribution (the one place the claim over-simplifies)

The claim implies the missing block schemas are what fail these specs. They are **not** the trigger of `invalid` status: `block:` schema references are deliberately downgraded to **warnings** (`workflow-sdk.ts:483-492`, `severity: isBlock ? "warning" : "error"`, rationale "project may not be initialized yet"). What actually makes the 8 specs `invalid` (error-severity) is the **input-contract / template-alignment** checks:

- **inputSchema-required** (`workflow-sdk.ts:597-614`): e.g. analyze-existing-project — `Step 'infer-project' is missing required input 'analysis' for agent 'project-inferrer'` (×3 agents); pausable/resumable-analysis — `Step 'synthesize' is missing required input 'patterns' for agent 'synthesizer'`.
- **template-alignment** (`validateTemplateAlignment`, `workflow-sdk.ts:651-652`): e.g. create-phase/gap-to-phase — `Template 'phase-author/task.md' references 'gaps' but step 'author' does not declare it in input`; fix-audit — references `finding`/`principle` not declared; init-new-project — references `goal` not declared.
- **stale schema shape** (the sharpest instance, do-gap `steps.implement`): `Template 'spec-implementer/task.md' references 'spec.intent' but schema has no field 'intent'. Available: [name, description, files, depends_on, acceptance_criteria, parallel_safe, estimated_complexity]` — plus `spec.tasks`, `spec.context_needed` identically. The spec-implementer template was written against an older spec/layer-plan schema shape that no longer exists.

### Class characterization — three distinct classes, all present

- **(a) catalog-fit / substrate-vocabulary drift (dominant, warning-level):** the analysis/init/handoff/phase workflows were authored against a catalog that carried `project`/`architecture`/`handoff`/`inventory` block kinds. This substrate installs a *later, different* vocabulary (`milestone`, `story`, `work-orders`, `phase`, `requirements`, `conventions`, `context-contracts`, …). The specs reference block kinds this install doesn't carry → `block:` warnings. This is the same *catalog-evolution-has-no-propagation-path* family as FGAP-065, but on the workflow-spec side rather than the pi-context block-materialization side.
- **(b) genuinely stale schema shape (error-level, do-gap):** `spec.intent`/`spec.tasks`/`spec.context_needed` reference fields absent from the current schema — a spec written against a shape that changed. Not a catalog-fit issue; a true stale-spec defect.
- **(c) input-contract drift (error-level, dominant error source):** agent `inputSchema.required` keys and template variable references that the workflow step no longer provides — the agent specs/templates evolved, the workflow specs weren't updated in lockstep.

Is validation stricter than runtime? For **block schemas** validation is *more lenient* (warning); runtime would fail hard only when a step actually writes to an uninstalled `block:` target. For **input-contract/template** errors validation catches at authoring-time what runtime would hit at dispatch/render — same strictness, earlier surface.

---

## Prior-art search (precondition; nothing filed)

Searched `.context` via `pi-context filter-block-items` (matches/eq predicates) across `framework-gaps` (title + description), `issues` (title), `tasks` (title), and `read-config installed_blocks`.

**No existing item covers either claim.** Neither the filter-documentation mismatch nor the bundled-workflow-spec validation failures are tracked. Closest adjacencies (NOT duplicates):

- **FGAP-065** (identified, P2, pi-context) — "No op materializes a newly-declared block's data file into an already-installed substrate." Same *catalog-evolution-has-no-propagation-path* theme as Claim 2's class (a), but scoped to pi-context block-data materialization, not pi-workflows spec-vs-catalog fit.
- **TASK-103** (completed) / **FGAP-127** — wired a bundled-agents tier into pi-agent-dispatch loaders so pi-workflows' bundled *agent specs* resolve on a fresh substrate. Concerns AGENT-spec *resolution* (AgentNotFoundError), not WORKFLOW-spec *validation* nor filter docs.
- **issue-011** (open, pi-workflows) — ctrl+j/ctrl+h shortcut shadowing; unrelated.
- **FGAP-104** (identified) — SKILL.md generation coupling to live substrate; a docs-generation gap but not this filter-list staleness.

A new filing for each claim would be justified (no existing coverage); relating Claim 2's class (a) to FGAP-065 as a sibling would be appropriate. (No filing performed — evaluation only.)

---

## Evidence index (file:line)

- `packages/pi-workflows/src/expression.ts:10-29` — the 10-filter `FILTERS` map
- `packages/pi-workflows/src/expression.ts:110-114` — `unknown filter` throw
- `packages/pi-workflows/src/expression.ts:32` — `FILTER_NAMES = Object.keys(FILTERS)`
- `packages/pi-workflows/src/template.ts:26-45` — stock Nunjucks env, zero custom filters
- `packages/pi-workflows/README.md:95-104` — 30-filter advertised list (`${{ }}` context)
- `packages/pi-workflows/skills/pi-workflows/SKILL.md:286-288` — same list
- `packages/pi-workflows/skill-narrative.md:40-42` — same list (SKILL source)
- `packages/pi-workflows/src/workflow-sdk.ts:558-568` — filter-names check (warning)
- `packages/pi-workflows/src/workflow-sdk.ts:483-492` — block: schema ref → warning
- `packages/pi-workflows/src/workflow-sdk.ts:597-614` — inputSchema-required (error)
- `packages/pi-workflows/src/workflow-sdk.ts:651-652` — template-alignment (error)
- `pi-context read-config installed_blocks` — project/architecture/handoff/inventory absent
