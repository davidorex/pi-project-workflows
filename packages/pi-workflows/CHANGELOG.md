# Changelog

All notable changes to `@davidorex/pi-workflows` are recorded here. Format follows [Keep a Changelog](https://keepachangelog.com/); entries are grounded in commits touching the published surface (`src/`, `schemas/`, `skills/`, `agents/`, `workflows/`). Versions are per-published-npm-release; the last published version is `0.26.0`. Tagged-but-unpublished work (`0.27.0` and later) lives under `[Unreleased]`.

## [Unreleased]

- New `./bundled-dirs` subpath export: `bundledDir(subdir)` resolves this package's bundled `agents/` / `workflows/` / `schemas/` directories for consumers outside the package (module-scoped helper, deliberately kept off the package barrel; pi-agent-dispatch consumes it to supply the bundled `agents/` directory as its dispatch loaders' builtin search tier).
- The bundled `phase-author` agent spec's task-template reference is now `phase-author/task.md` (a path relative to the template search roots) rather than `templates/phase-author/task.md`. The prior `templates/`-prefixed value did not resolve against the bundled pi-jit-agents template tier (whose search root already IS the `templates/` directory), so the spec's task prompt rendered empty when the agent was dispatched from a substrate with no local template copy; the relative reference lets it resolve against the bundled template tier.

## [0.32.0] - 2026-07-05

## [0.31.0] - 2026-06-13

## [0.30.0] - 2026-06-04

### Changed
- Workflow block-write steps now stamp a `workflow`-kind attestation: `step-block` writers and the post-step artifact write thread a `DispatchContext` whose writer is `workflow/<step_id>`, so workflow-written substrate items carry `created_by`/`created_at`

## [0.29.0] - 2026-06-04

## [0.28.1] - 2026-06-03

## [0.28.0] - 2026-06-03

### Added
- Read tools route through the shared `serializeForRead` helper

### Changed
- Agent-template tree relocated out of `packages/pi-workflows/templates/` into `@davidorex/pi-jit-agents`; the five pi-workflows consumer call-sites resolve templates via the new `bundledTemplateDir()` export, and the `templates/` entry left pi-workflows' `files[]`
- Auth gating folded into per-package registry-derived gated-sets (`auth-required` surface)
- Per-item Nunjucks macro readers consume the `array_key`-aware canonical-macro-name registry via the `.macro_name` property
- Regenerated `SKILL.md` to reflect template relocation, new delegators, and registry changes

### Fixed
- Converge `/context init` onto a substrate-dir argument and correct the workflow-sdk scaffold-schemas claim in agent-facing source
- Neutralize `.project/` references in agent-reachable code strings and agent-facing guidance across block-api / lens / roadmap / context / compile / workflow-sdk / template-validation / monitors / index

### Removed
- Scrubbed substrate-identity citations from the bundled agent, template, and render-by-id tool description string

## [0.26.0] - 2026-05-25

### Added
- Block-api surface symmetry: three new block-api primitives, three new `BlockSpec` variants, five new registered tools, and a `readBlockDir` extraction
- `appendToNestedArray` block-api primitive plus the workflow `nestedAppend` `BlockSpec`
- Composition-primitive surface symmetry: three composition tools, a Nunjucks global, macro wiring, and annotation backfill
- Per-item Nunjucks macros for spec-reviews, features, framework-gaps, layer-plans, and research blocks; `render_decision` and `render_conventions` macros for the legacy block library
- `workflow-resume` tool alongside the renamed execute tool

### Changed
- **BREAKING**: workflow tool renamed `workflow` → `workflow-execute`
- Migrated `/project` command/skill surface to `/context`, including the generated skill content
- Migrated pi-mono peer-deps from `@mariozechner/*` to `@earendil-works/*` at `^0.74.0`
- Retired per-item-macro duplication via shared helpers and a canonical-name registry map; retired seven residual debt items in one coordinated cross-package patch

### Fixed
- Empty-prefix guard, cross-block status-vocabulary check, and name-based error catches
- Module hygiene: `fileURLToPath` idiom and name-based error catches
- Completion atomic gates: test rewrites, `compileAgentSpec` BNF catch, loop/resume fixture cascade
- Canonicalize `tmpDir` via `fs.realpathSync` in the `step-shared` `resolveSchemaPath` `process.cwd`-fallback test

## [0.14.6] - 2026-04-28

### Changed
- Bumped pi-mono `0.63.1` → `0.70.2`; migrated TypeBox `v0.34` → `v1.x` via a hybrid import strategy

## [0.14.4] - 2026-04-07

Lockstep release; no `@davidorex/pi-workflows` published-surface changes since 0.14.2.

## [0.14.2] - 2026-04-06

Lockstep release; no `@davidorex/pi-workflows` published-surface changes since 0.14.1.

## [0.14.1] - 2026-04-06

Lockstep release; no `@davidorex/pi-workflows` published-surface changes since 0.13.0.

## [0.13.0] - 2026-04-06

Lockstep release; no `@davidorex/pi-workflows` published-surface changes since 0.12.0.

## [0.12.0] - 2026-04-06

### Added
- Validation vocabulary surfaced in the skill generator (validator check registry); agent vocabulary extraction added to the skill generator
- `agentContracts()` and `validationChecks()` SDK functions; `/workflow status` enhanced with agent contracts and a validation-check count
- `contextBlocks` agent field plus shared block-rendering macros; static `inputSchema` required-key checking, `StepType` metadata validation, `contextBlocks` existence validation, and block-read schema tracing in the workflow validator
- Integration tests for `inputSchema` rejection and end-to-end workflow execution

### Changed
- Three-state validation status (clean / warnings / invalid) replaces the binary `valid` flag; the `valid` boolean removed in favor of the `status` field as sole signal
- Template validation is `contextBlocks`-aware, eliminating false positives; guarded-undefined template variables escalated from warning to error; null-schema warnings carry actionable suggestions

## [0.11.3] - 2026-04-04

### Fixed
- Guard completion on workflow success, enforce JSON output validation, and correct agent prompt instructions

## [0.11.0] - 2026-04-04

### Added
- `execute-task` workflow closing the task → verify → persist loop
- `task-worker` and `task-verifier` agent specs with templates and a verification schema
- `inputSchema` validation for agent steps, closing cross-block validation gaps

## [0.10.5] - 2026-04-02

### Fixed
- Added a `shell` expression filter to prevent single-quote injection in command steps

## [0.10.3] - 2026-04-02

Lockstep release; no `@davidorex/pi-workflows` published-surface changes since 0.10.2.

## [0.10.2] - 2026-04-02

Lockstep release; no `@davidorex/pi-workflows` published-surface changes since 0.10.1.

## [0.10.1] - 2026-04-02

### Changed
- Removed redundant `syncSkillsToUser` skill seeding to eliminate pi skill collisions

## [0.10.0] - 2026-04-02

### Added
- Completed five remaining issues: tool_call blocking, explicit template syntax, workflow YAML alignment
- Workflow-validation enhancements: textOutput type detection, array type checking, error accumulation

### Changed
- **BREAKING**: renamed the `gaps` block to `issues` with a new schema carrying `title`/`body`/`location`/`package` fields

### Fixed
- Resolved 17 issues across batches 1A/2A/3B/4A (template alignment, monitor safety, executor guards, test coverage) and 7 catalogued gaps across pi-project and pi-workflows
- Addressed three create-phase workflow gaps: template null guards, null traversal, spec freezing

## [0.9.2] - 2026-03-31

Lockstep release; no `@davidorex/pi-workflows` published-surface changes since 0.9.1.

## [0.9.1] - 2026-03-31

### Fixed
- DAG: surface invalid step references instead of silently dropping them; restrict bare `steps.` expression fallback to bare-expression contexts
- State: warn when `buildResult` uses output from a non-last step
- Workflow-spec: reject nested loop and parallel steps inside loop sub-steps; extracted `parseOutputSpec` helper
- step-monitor: extract token usage from `complete()` response; log error when `promptTemplate` render fails
- TUI: dispose previous widget pulse interval before creating a replacement
- workflow-discovery: log error on directory-scan failure instead of returning silently empty
- index: signal auto-resume via a `resumed` field in the workflow tool result
- types: `@deprecated` JSDoc on `StepSpec.workflow`

## [0.9.0] - 2026-03-29

### Added
- `block` step type: types, executor, dispatch, and expression filters; block-write schema detection in `validateWorkflow`; template-input alignment validation
- Migrated six workflow command steps to the block step type

### Changed
- Executed Plan 3 judgment-step restructuring across six workflows; aligned dependencies to the pi-mono pattern

### Fixed
- Reverted relaxed analysis output schemas (the relaxation was rolled back)

## [0.6.1] - 2026-03-28

### Added
- Support for array label fields in the workflow source picker for composite display

### Fixed
- Auto-parse JSON output into `result.output` when an agent/step declares `json` format
- Migrated parallel-analysis to typed output refs; parse string items in `append-block-item`

## [0.5.0] - 2026-03-28

### Changed
- Redesigned the workflow TUI with per-step colored bars and live metrics (plus conformance fixes)

## [0.4.1] - 2026-03-27

### Changed
- Applied biome v2.4.9 auto-fixes; added the CI workflow and husky pre-commit, upgrading biome to v2.4.9

## [0.4.0] - 2026-03-27

### Added
- Sync extension skills to `~/.pi/agent/skills/` on activation

### Fixed
- Migrated `getApiKey(model)` to `getApiKeyAndHeaders(model)` for pi 0.63.1

## [0.3.4] - 2026-03-27

### Fixed
- Addressed five conformance audit findings across the extension packages
- Replaced package-specifier imports with Node builtins in workflow command steps
- Regenerated `SKILL.md` after conformance fixes

## [0.3.2] - 2026-03-26

### Fixed
- Replaced relative source imports with package specifiers in workflow command steps

## [0.3.1] - 2026-03-25

### Added
- `block:` schema-resolution prefix; `context` field on agent steps for narrative-flow injection
- Missing artifacts sections to four planning workflows

### Changed
- Refactored command registration to dispatch tables with dynamic completions and help
- Rewrote the skill generator for pi-compliant `SKILL.md` output (YAML frontmatter + XML tags)

### Fixed
- Made block artifact writes fatal

## [0.3.0] - 2026-03-18

## [0.2.0] - 2026-03-17

### Added
- Monorepo integration as workspace package
- Bundled workflow YAML schema path resolution relative to package

## [0.1.0] - 2026-03-14

### Added
- Workflow orchestration via `.workflow.yaml` specs with DAG-based execution planning
- Step types: agent, command, transform, gate, parallel, foreach, loop, pause
- Expression evaluator (`${{ }}`) with filters: length, keys, filter, json, upper, lower, trim, default, first, last, join, split, replace, includes, map, sum, min, max, sort, unique, flatten, zip, group_by, count_by, chunk, pick, omit, entries, from_entries, merge, values, not, and, or
- Agent dispatch via subprocess (`pi --mode json`) with thinking inheritance
- Nunjucks template compilation for agent prompts with template inheritance
- Agent spec loader (`.agent.yaml` format with model, thinking, tools, output schema)
- DAG planner inferring parallelism from `${{ steps.X }}` references
- Atomic state persistence after each step (tmp + rename, failure is fatal)
- Checkpoint/resume: incomplete runs resume from last completed step
- `completion` field for post-workflow messages to main LLM
- Workflow SDK: `stepTypes()`, `filterNames()`, `expressionRoots()`, vocabulary discovery
- Workflow discovery: `availableAgents(cwd)`, `availableWorkflows(cwd)`, `availableTemplates(cwd)` with three-tier search (project > user > package builtin)
- Spec introspection: `extractExpressions`, `declaredSteps`, `declaredAgentRefs`, `declaredSchemaRefs`
- `/workflow` command with `run`, `list`, `resume` subcommands
- TUI progress widget for workflow execution
- Bundled agents: investigator, decomposer, executor, verifier, refresher
- Bundled workflows: do-gap, gap-to-phase, create-phase, refresh-blocks
- Bundled output schemas and Nunjucks templates
