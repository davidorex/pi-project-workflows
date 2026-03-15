# pi-workflows

Workflow orchestration extension for Pi. Typed, multi-step workflow execution via `.workflow.yaml` specs.

## Commands

```bash
# Run tests (must stay at 0 failures)
node --experimental-strip-types --test src/*.test.ts

# Lint changed files
/Users/david/Projects/pi-extension-linter/pi-extension-lint.sh src/index.ts

# Derive full project state (all metrics, dynamically computed)
node --experimental-strip-types -e "import{projectState}from'./src/workflow-sdk.ts';console.log(JSON.stringify(projectState('.'),null,2))"

# Query SDK vocabulary and discovery (step types, filters, agents, workflows, etc.)
node --experimental-strip-types -e "import * as sdk from'./src/workflow-sdk.ts';console.log('Steps:',sdk.stepTypes().map(t=>t.name));console.log('Filters:',sdk.filterNames());console.log('Agents:',sdk.availableAgents('.').map(a=>a.name));console.log('Workflows:',sdk.availableWorkflows('.').map(w=>w.name))"
```

## Conventions

- ESM, TypeScript loaded directly by pi (`--experimental-strip-types`, no build step)
- Extension registers: `workflow` tool + `record-gap` tool + `update-gap` tool + `/workflow` command (subcommands: `run`, `list`, `resume`, `status`, `add-work`)
- Tests: node test runner, `src/*.test.ts`
- All warnings from linter must be resolved

## Do Not Touch

- **`.pi/` directory**: User's runtime testing directory. Never create, modify, or delete files there.
- **`docs/` directory**: Gitignored planning docs. Read-only reference.

## Source Layout

`ls src/*.ts` for current files. Key modules:

- `index.ts` — extension entry point (tools, commands, keybindings)
- `workflow-sdk.ts` — SDK: vocabulary, discovery, derived state, spec introspection
- `workflow-executor.ts` — main orchestration loop
- `workflow-spec.ts` — YAML parsing, `STEP_TYPES` registry
- `block-api.ts` — centralized block I/O with write-time schema validation
- `expression.ts` — `${{ }}` evaluator, `FILTER_NAMES` export
- `dispatch.ts` — subprocess spawn (`pi --mode json`)
- `dag.ts` — dependency graph, execution plan
- `step-*.ts` — step type executors (one per type)

## Workflow SDK (`src/workflow-sdk.ts`)

Single queryable surface for the extension's capabilities. All functions derive dynamically from code registries and filesystem — add a filter, agent, template, or schema and it appears automatically.

- **Vocabulary**: `stepTypes()`, `filterNames()`, `expressionRoots()`
- **Discovery**: `availableAgents(cwd)`, `availableWorkflows(cwd)`, `availableTemplates(cwd)`, `availableSchemas(cwd)`, `availableBlocks(cwd)`
- **Derived state**: `projectState(cwd)` — all project metrics computed at query time (source files/lines, tests, phases, gaps, decisions, agents, workflows, schemas, templates, blocks, recent commits)
- **Introspection**: `extractExpressions(spec)`, `declaredSteps(spec)`, `declaredAgentRefs(spec)`, `declaredSchemaRefs(spec)`

Use `/workflow status` to see derived state in conversation.

## Project Blocks (`.workflow/`)

Typed JSON files with schemas. Use `writeBlock()`/`appendToBlock()`/`updateItemInBlock()` from `block-api.ts` for validated writes — schema validation is automatic.

## Key Architecture

- Each workflow step runs as a subprocess (`pi --mode json`) with its own context window
- Main conversation is the control plane; workflows are subordinate
- DAG planner infers parallelism from `${{ steps.X }}` references
- Agent specs are `.agent.yaml` only (no `.md` fallback). Compiled to prompts via Nunjucks at dispatch time.
- State persisted atomically after each step (tmp + rename). State write failure is fatal.
- Checkpoint/resume: incomplete runs can be resumed from last completed step
- `completion` field controls post-workflow message to main LLM

## Design Decisions & Gaps

Read via `readBlock('.', 'decisions')` / `readBlock('.', 'gaps')`, or `/workflow status` for a summary.
