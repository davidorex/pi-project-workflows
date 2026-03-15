# pi-workflows

Workflow orchestration extension for Pi. Typed, multi-step workflow execution via `.workflow.yaml` specs.

## Commands

```bash
# Run tests (must stay at 0 failures)
node --experimental-strip-types --test src/*.test.ts

# Lint changed files
/Users/david/Projects/pi-extension-linter/pi-extension-lint.sh src/index.ts

# Validate a project block against its schema
node --experimental-strip-types -e "import{validateFromFile}from'./src/schema-validator.ts';import fs from'fs';validateFromFile('.workflow/schemas/BLOCK.schema.json',JSON.parse(fs.readFileSync('.workflow/BLOCK.json','utf8')),'BLOCK');console.log('✓')"

# Derive current project state (test count, gaps, decisions, agents, workflows)
node --experimental-strip-types -e "import{projectState}from'./src/workflow-sdk.ts';console.log(JSON.stringify(projectState('.'),null,2))"

# List step types, filters, expression roots
node --experimental-strip-types -e "import{stepTypes,filterNames,expressionRoots}from'./src/workflow-sdk.ts';console.log('Steps:',stepTypes().map(t=>t.name));console.log('Filters:',filterNames());console.log('Roots:',expressionRoots())"

# List available agents, workflows, schemas, blocks
node --experimental-strip-types -e "import{availableAgents,availableWorkflows,availableSchemas,availableBlocks}from'./src/workflow-sdk.ts';console.log('Agents:',availableAgents('.').map(a=>a.name));console.log('Workflows:',availableWorkflows('.').map(w=>w.name));console.log('Blocks:',availableBlocks('.').map(b=>b.name))"
```

## Conventions

- ESM, TypeScript loaded directly by pi (`--experimental-strip-types`, no build step)
- Extension registers: `workflow` tool + `record-gap` tool + `/workflow` command (subcommands: `run`, `list`, `resume`, `status`, `add-work`)
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
- **Derived state**: `projectState(cwd)` — test count, commit, gaps, decisions, agent/workflow/block counts
- **Introspection**: `extractExpressions(spec)`, `declaredSteps(spec)`, `declaredAgentRefs(spec)`, `declaredSchemaRefs(spec)`

Use `/workflow status` to see derived state in conversation.

## Expression Syntax

- `${{ input.field }}` / `${{ steps.name.output }}` — workflow data flow (property access, no eval)
- `${{ path | filter }}` — pipe filters (run `filterNames()` for current list)
- `{{ var }}` / `{% tag %}` — Nunjucks (prompt templates, separate concern)

## Project Blocks (`.workflow/`)

Typed JSON files with schemas. Source of truth for project state. Run `availableBlocks('.')` for current list.

**Always validate after writing to a block file.** Use `writeBlock()`/`appendToBlock()` from `block-api.ts` for validated writes, or the CLI validate command above.

## Key Architecture

- Each workflow step runs as a subprocess (`pi --mode json`) with its own context window
- Main conversation is the control plane; workflows are subordinate
- DAG planner infers parallelism from `${{ steps.X }}` references
- Agent specs are `.agent.yaml` only (no `.md` fallback). Compiled to prompts via Nunjucks at dispatch time.
- State persisted atomically after each step (tmp + rename). State write failure is fatal.
- Checkpoint/resume: incomplete runs can be resumed from last completed step
- `completion` field controls post-workflow message to main LLM

## Design Decisions & Gaps

Full records in `.workflow/decisions.json` and `.workflow/gaps.json`. Read via `readBlock('.', 'decisions')` / `readBlock('.', 'gaps')`. Key architectural decisions:

- Fail-fast on step failure
- Deterministic validation (AJV) at write time, not via monitors
- Block writes through `block-api.ts` with schema validation
- Extensions communicate via `pi.events.emit/on`, no imports
- Output write failures are non-fatal; state write failures are fatal
