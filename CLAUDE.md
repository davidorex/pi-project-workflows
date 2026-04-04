# pi-project-workflows

Typed, multi-step workflow execution via `.workflow.yaml` specs. Schema-driven project state in `.project/`. Behavior monitors that classify agent activity and steer corrections.

Monorepo: four npm packages (`packages/*`) with lockstep versioning.

| Package | Purpose |
|---------|---------|
| `@davidorex/pi-project` | Block CRUD, schema validation, `/project` command |
| `@davidorex/pi-workflows` | Workflow orchestration, agent dispatch, `/workflow` command |
| `@davidorex/pi-behavior-monitors` | Autonomous monitors, classification, steering |
| `@davidorex/pi-project-workflows` | Meta-package re-exporting all three |

## Commands

```bash
# Build (tsc compiles each package to dist/)
npm run build

# Run all tests (must stay at 0 failures)
npm test

# Lint + typecheck (also runs as pre-commit hook)
npm run check

# Format
npm run format

# Generate SKILL.md files from built extensions (run after build)
npm run skills

# Derive full project state (all metrics, dynamically computed)
npx tsx -e "import{projectState}from'./packages/pi-project/src/project-sdk.js';console.log(JSON.stringify(projectState('.'),null,2))"

# Query SDK vocabulary and discovery (step types, filters, agents, workflows, etc.)
npx tsx -e "import * as sdk from'./packages/pi-workflows/src/workflow-sdk.js';console.log('Steps:',sdk.stepTypes().map(t=>t.name));console.log('Filters:',sdk.filterNames());console.log('Agents:',sdk.availableAgents('.').map(a=>a.name));console.log('Workflows:',sdk.availableWorkflows('.').map(w=>w.name))"
```

## Conventions

- ESM, TypeScript compiled via `tsc` to `dist/`. Pi loads `dist/index.js` from each package.
- Cross-package imports use named subpath exports (e.g., `@davidorex/pi-project/block-api`). pi-project defines explicit exports in package.json — unlisted subpaths are not importable.
- Tests: `tsx --test` for pi-project and pi-workflows, `vitest` for pi-behavior-monitors
- Biome linting (v2.4.9): tab indent, 120-char lines, scoped to `packages/*/src/**` + `scripts/**`. `npm run lint` / `npm run format`
- Husky pre-commit hook runs `npm run check` (biome + tsc --noEmit) before every commit
- GitHub Actions CI runs check + build + test on Node 22/23 for push/PR to main
- SKILL.md files are generated build artifacts (`npm run skills`) — do not edit by hand. Edit `skill-narrative.md` for behavioral documentation. Narratives must use YAML frontmatter (`name`, `description` with trigger conditions) and XML tags for sections (no markdown headings). See pi-behavior-monitors/skill-narrative.md as the canonical reference. The generator emits YAML frontmatter, XML-tagged tool/command/resource sections, vocabulary tables, then appends the narrative body. Resource listings go to `references/bundled-resources.md` (progressive disclosure).
- Lockstep versioning: all packages share a version. Use `npm run release:patch`, `release:minor`, or `release:major` from root. These call `scripts/bump-versions.js` which bumps all package.json files directly via JSON read/write then syncs inter-package dependency references — never use `npm version -ws` directly (it fails on 0.x minor/major bumps because npm runs peer dep resolution between bumping versions and syncing cross-refs).

## Completion Sequence (mandatory after every code change)

Work is not complete until the runtime can load it. Pi loads extensions from `node_modules` via `dist/`, not from source. Every code change must follow this full sequence — no step is optional or deferred:

1. **Edit** source files
2. **Build**: `npm run build`
3. **Check**: `npm run check` (biome + tsc)
4. **Test**: `npm test` (must stay at 0 failures)
5. **Skills**: `npm run skills` (regenerate SKILL.md from built extensions)
6. **Commit**: forensic commit message per global CLAUDE.md guidelines
7. **Merge to main**: if on a feature branch
8. **Release**: `npm run release:patch|minor|major` based on commit type (`fix:` → patch, `feat:` → minor, `feat!:` → major). This bumps versions, commits, and tags.
9. **Publish**: requires interactive `npm login` + OTP — inform user to run `npm publish --workspaces --access public`

Steps 1-8 are the agent's responsibility. Step 9 requires user action. Declaring work "done" before step 8 is a failure — the changes are unreachable at runtime.

## Do Not Touch

- **`.pi/` directory**: User's runtime testing directory. Never create, modify, or delete files there.
- **`docs/` directory**: Gitignored planning docs. Read-only reference.

## Source Layout

Each package lives in `packages/<name>/` with source in `src/` (or root for pi-behavior-monitors).

**pi-project** (`packages/pi-project/src/`):
- `index.ts` — extension entry point (tools, commands)
- `block-api.ts` — centralized block I/O with write-time schema validation
- `schema-validator.ts` — AJV-based JSON Schema validation
- `project-sdk.ts` — SDK: vocabulary, discovery, derived state, cross-block validation
- `project-dir.ts` — `PROJECT_DIR` and `SCHEMAS_DIR` constants (single source for `.project/` path)
- `block-validation.ts` — post-step block validation: snapshot `.project/*.json` before step, validate changed files after, rollback on failure
- `update-check.ts` — non-blocking npm registry check for newer package versions

**pi-workflows** (`packages/pi-workflows/src/`):
- `index.ts` — extension entry point (tool, command, keybindings)
- `workflow-sdk.ts` — SDK: vocabulary, discovery, derived state, spec introspection
- `workflow-executor.ts` — main orchestration loop
- `workflow-spec.ts` — YAML parsing, `STEP_TYPES` registry
- `expression.ts` — `${{ }}` evaluator, `FILTER_NAMES` export
- `dispatch.ts` — subprocess spawn (`pi --mode json`)
- `dag.ts` — dependency graph, execution plan
- `step-*.ts` — step type executors (one per type, including `step-monitor.ts` for monitor verification gates)
- `templates/shared/macros.md` — Nunjucks macros rendering block data as markdown (`render_conventions`, `render_requirements`, `render_conformance`, `render_architecture`, `render_project`, `render_domain`, `render_decisions`, `render_tasks`, `render_issues`, `render_exploration`, `render_exploration_full`, `render_gap`)

**pi-behavior-monitors** (`packages/pi-behavior-monitors/`):
- `index.ts` — single-file extension (monitors, classification, steering, Nunjucks template rendering)
- `examples/` — bundled monitor JSON specs + Nunjucks `.md` prompt templates (subdirectories per monitor)

## Workflow SDK (`packages/pi-workflows/src/workflow-sdk.ts`)

Single queryable surface for the workflow extension's capabilities. All functions derive dynamically from code registries and filesystem — add a filter, agent, template, or schema and it appears automatically.

- **Vocabulary**: `stepTypes()`, `filterNames()`, `expressionRoots()`
- **Discovery**: `availableAgents(cwd)`, `availableWorkflows(cwd)`, `availableTemplates(cwd)`, `availableSchemas(cwd)`
- **Introspection**: `extractExpressions(spec)`, `declaredSteps(spec)`, `declaredAgentRefs(spec)`, `declaredMonitorRefs(spec)`, `declaredSchemaRefs(spec)`
- **Validation**: `validateWorkflow(spec, cwd)` — composes introspection + discovery to check agent resolution, monitor resolution, schema existence, step references, ordering, filter names. Returns `{ valid, issues[] }`. Also available as `/workflow validate [name]`.

Use `/workflow status` to see derived state in conversation.

## Project SDK (`packages/pi-project/src/project-sdk.ts`)

Single queryable surface for project state, block discovery, schema vocabulary, and cross-block validation.

- **Vocabulary**: `schemaVocabulary(cwd)`, `schemaInfo(cwd, name)`, `PROJECT_BLOCK_TYPES`
- **Discovery**: `availableBlocks(cwd)`, `availableSchemas(cwd)`, `findAppendableBlocks(cwd)`, `blockStructure(cwd)`
- **Derived state**: `projectState(cwd)` — all project metrics computed at query time (source files/lines, tests, phases, blockSummaries, requirements, tasks, domain, verifications, hasHandoff, recent commits)
- **Validation**: `validateProject(cwd)` — cross-block referential integrity (task→phase, decision→phase, gap→resolved_by, requirement→traces_to, verification→target, rationale→related_decisions). Returns `{ valid, issues[] }`. Also available as `/project validate`.

Use `/project status` to see derived state in conversation.

## Project Blocks (`.project/`)

Typed JSON files with schemas. Use `writeBlock()`/`appendToBlock()`/`updateItemInBlock()` from `packages/pi-project/src/block-api.ts` for validated writes — schema validation is automatic.

Default planning lifecycle blocks (scaffolded by `/project init`):
- **project** — identity, vision, goals, constraints, scope, status
- **domain** — research findings, reference material, domain rules
- **requirements** — functional/non-functional with MoSCoW priority and lifecycle states
- **architecture** — modules, patterns, boundaries
- **tasks** — standalone task registry with status lifecycle and phase linkage
- **decisions** — choices with rationale and phase association
- **gaps** — open items with priority, category, resolution tracking
- **rationale** — design rationale with decision cross-references
- **verification** — completion evidence per task/phase/requirement
- **handoff** — session context snapshot (schema only, created on-demand)
- **conformance-reference** — executable code conventions with check methods/patterns (ships empty, populated per-project)
- **audit** — structured audit results from running conformance checks (schema only, no default block)

All schemas are user-customizable. Edit `.project/schemas/*.schema.json` to add fields, change enums, or restructure — no code changes needed.

## Key Architecture

- Each workflow step runs as a subprocess (`pi --mode json`) with its own context window
- Main conversation is the control plane; workflows are subordinate
- DAG planner infers parallelism from `${{ steps.X }}` references and `context: [stepName]` declarations
- Agent specs are `.agent.yaml` only (no `.md` fallback). Compiled to prompts via Nunjucks at dispatch time. Agents declare `inputSchema` (validated at dispatch before subprocess spawn — step fails immediately on mismatch), `contextBlocks` (block names to inject into template context), and `output.format`/`output.schema` (validated after subprocess completes).
- `contextBlocks: [conventions, requirements, conformance-reference]` on an agent YAML causes `compileAgentSpec()` to read each named block from `.project/` and inject it into the Nunjucks template context as `_<name>` (hyphens become underscores). Templates access via `{{ _conventions.rules }}` or `{% from "shared/macros.md" import render_conventions %}{{ render_conventions(_conventions) }}`. Missing blocks are `null`; no `.project/` skips injection. This is how project state flows into agent prompts.
- `templates/shared/macros.md` provides one rendering macro per block schema. Agents import them via `{% from "shared/macros.md" import render_conventions %}`. Resolved via three-tier template search — users override in `.pi/templates/`.
- Monitor specs are `.monitor.json`. Classify prompts can be Nunjucks `.md` templates (`promptTemplate`) or inline strings (`prompt`). Template search: project `.pi/monitors/` > user `~/.pi/agent/monitors/` > package `examples/`.
- Monitor step type: workflows can invoke monitors as verification gates via `monitor: <name>`. CLEAN → completed, FLAG/NEW → failed.
- `block:<name>` schema references: `output.schema: block:project` resolves to `.project/schemas/project.schema.json` from cwd. Portable across install methods — use for any workflow step or artifact that targets a project block.
- State persisted atomically after each step (tmp + rename). State write failure is fatal.
- Block artifact writes are fatal — if a `.project/*.json` artifact fails schema validation, the workflow fails. Non-block artifacts remain non-fatal. On resume, all steps are preserved; only artifact processing re-runs.
- Agent step JSON output validation is fatal — if a step declares `output.format: json` or `output.schema` and the agent produces unparseable JSON (including markdown-fenced JSON), the step fails. Same contract as block writes: declared format must be honored.
- Checkpoint/resume: incomplete runs can be resumed from last completed step
- Agent step `context: string[]` inlines prior step `textOutput` into dispatch prompt as labeled markdown sections — complements expression-based structured data flow with narrative text inlining
- Agent output instructions (`buildPrompt` in step-shared.ts) tell agents: "raw JSON only, no markdown fences." File-write instruction is secondary ("if you have write access"). Most JSON-producing agents lack write tools — textOutput is their only output channel.
- `invokeMonitor(name, context?)` export from pi-behavior-monitors enables programmatic classification without activate() side effects — returns `ClassifyResult` directly for pre-dispatch gating
- `completion` field controls post-workflow message to main LLM. Completion only fires when `state.status === "completed"` — failed workflows use `formatResult()` which renders "Workflow X failed at step Y" with error details.

## Design Decisions & Gaps

Read via `readBlock('.', 'decisions')` / `readBlock('.', 'gaps')`, or `/workflow status` for a summary.
