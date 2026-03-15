# pi-workflows

Workflow orchestration extension for Pi. Typed, multi-step workflow execution via `.workflow.yaml` specs.

## Commands

```bash
# Run tests (590+, must stay at 0 failures)
node --experimental-strip-types --test src/*.test.ts

# Lint changed files
/Users/david/Projects/pi-extension-linter/pi-extension-lint.sh src/index.ts

# Validate a project block against its schema
node --experimental-strip-types -e "import{validateFromFile}from'./src/schema-validator.ts';import fs from'fs';validateFromFile('.workflow/schemas/BLOCK.schema.json',JSON.parse(fs.readFileSync('.workflow/BLOCK.json','utf8')),'BLOCK');console.log('✓')"
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

```
src/
  index.ts              — extension entry point (workflow tool, record-gap tool, /workflow command)
  types.ts              — all shared interfaces
  workflow-executor.ts  — main orchestration loop
  workflow-spec.ts      — YAML parsing, STEP_TYPES registry
  workflow-discovery.ts — directory scanning
  workflow-sdk.ts       — SDK: vocabulary, discovery, spec introspection
  dag.ts                — dependency graph, execution plan
  dispatch.ts           — subprocess spawn (pi --mode json)
  expression.ts         — ${{ }} evaluator with pipe filters, FILTER_NAMES export
  template.ts           — Nunjucks environment (three-tier search)
  agent-spec.ts         — .agent.yaml loader and compilation
  step-agent.ts         — agent step executor
  step-foreach.ts       — forEach iteration
  step-command.ts       — shell command steps
  step-gate.ts          — gate (pass/fail check)
  step-transform.ts     — data transform steps
  step-loop.ts          — retry loop steps
  step-shared.ts        — shared step utilities, prompt compilation
  state.ts              — run directory, state persistence
  checkpoint.ts         — checkpoint/resume
  output.ts             — output persistence
  completion.ts         — completion field resolution
  block-api.ts          — centralized block I/O with write-time schema validation
  schema-validator.ts   — AJV wrapper
  format.ts             — formatDuration/formatCost
  tui.ts                — progress widget
```

## Step Types

`agent`, `command`, `transform`, `gate`, `loop`, `forEach` (wraps any step type)

## Expression Syntax

- `${{ input.field }}` / `${{ steps.name.output }}` — workflow data flow (property access, no eval)
- `${{ path | filter }}` — pipe filters: `json`, `duration`, `currency`, `keys`, `length`, `filter`
- `{{ var }}` / `{% tag %}` — Nunjucks (prompt templates, separate concern)

## Project Blocks (`.workflow/`)

Typed JSON files with schemas. Source of truth for project state.

```
.workflow/
  schemas/              — 13 JSON Schema files (architecture, audit, gaps, decisions, etc.)
  audits/               — conformance audit instances
  phases/               — phase specs (NN-name.json)
  model-config.json     — role → model mapping (resolution: step > agent > by_role > default)
  gaps.json             — capability gaps, issues, cleanup items
  decisions.json        — design decisions with rationale
  rationale.json        — narrative design rationale
  architecture.json     — module inventory
  inventory.json        — test counts, step types, agents
  state.json            — session state
  conventions.json      — project conventions
  conformance-reference.json — 10 principles, 29 rules
```

**Always validate after writing to a block file.**

## Demo Assets

```
demo/
  agents/               — 13 .agent.yaml specs (investigator, decomposer, phase-author, etc.)
  schemas/              — output schemas (investigation-findings, execution-results, etc.)
  do-gap.workflow.yaml
  gap-to-phase.workflow.yaml
  create-phase.workflow.yaml
  fix-audit.workflow.yaml
  self-implement.workflow.yaml
  typed-analysis.workflow.yaml
templates/              — Nunjucks templates (referenced by agent specs, relative to this dir)
```

## Key Architecture

- Each workflow step runs as a subprocess (`pi --mode json`) with its own context window
- Main conversation is the control plane; workflows are subordinate
- DAG planner infers parallelism from `${{ steps.X }}` references (scans input, when, forEach, command, gate, transform, loop fields)
- Agent specs are `.agent.yaml` only (no `.md` fallback). Compiled to prompts via Nunjucks at dispatch time.
- Output persistence: step output → JSON file in run dir. `output.path` for user-defined paths.
- State persisted atomically after each step (tmp + rename). State write failure is fatal.
- Checkpoint/resume: incomplete runs can be resumed from last completed step
- `completion` field controls post-workflow message to main LLM (template or message+include form)

## Design Decisions & Gaps

Full records in `.workflow/decisions.json` (46 decisions) and `.workflow/gaps.json`. Key decisions:

- Fail-fast on step failure. No graduated retry yet (gap: `graduated-failure`).
- forEach `when:` is global (before iteration, not per-item)
- Command step fails on non-zero exit
- Output write failures are non-fatal; state write failures are fatal
- Deterministic validation (AJV) at write time, not via monitors
- Block writes via `block-api.ts` (readBlock/writeBlock/appendToBlock) with schema validation
- Extensions communicate via `pi.events.emit/on`, no imports
- `/workflow add-work` appends to array blocks (gaps, decisions, rationale). Phase creation and architecture refresh are separate workflows.
- `record-gap` tool enables agents to record gaps mid-task via appendToBlock
- Workflow SDK (`workflow-sdk.ts`) provides dynamic vocabulary, discovery, and spec introspection for authoring and validation
