# pi-project-workflows

Three [Pi](https://github.com/badlogic/pi-mono) extensions: typed, multi-step workflow execution via `.workflow.yaml` specs; schema-driven project state in `.project/`; and behavior monitors that classify agent activity and steer corrections.

Schemas are the contract layer. In pi-project, you define what your project tracks by writing JSON Schemas — the tools, validation, and derived state adapt automatically. In pi-workflows, agent steps declare output schemas that enforce the shape of data flowing through the pipeline. In pi-behavior-monitors, JSON pattern libraries define what to detect and how to respond. The three extensions form a typed loop: project state → workflow input → agent output → validated project state → monitor classification → steering.

## Philosophy

> 削斧柯，其则不远
>
> *When cutting wood to make an axe handle, the model is right there in your hand.*

If pi-project-workflows is done right, users need not wait for developers to implement changes that they find through use that they need. The use of the tool shows you the shape of how to make the version of the tool that you want.

Add a JSON Schema — get a new block type with tools, validation, and derived state. Write a `.workflow.yaml` — get a new multi-step pipeline with typed data flow and checkpoint/resume. Drop a `.monitor.json` with a Nunjucks template — get an autonomous watchdog that classifies, learns, and steers. Author an `.agent.yaml` — get a typed agent contract compiled to prompts at dispatch time. The runtime is generic; the domain lives in specs, schemas, and templates that users create without touching TypeScript.

## Packages

| Package | npm | Description |
|---------|-----|-------------|
| [@davidorex/pi-project](packages/pi-project/) | `npm:@davidorex/pi-project` | Schema-driven project state — typed JSON blocks, write-time validation, generic CRUD tools, dynamically derived state. Add a schema, get a new block type with tooling. No code changes. |
| [@davidorex/pi-workflows](packages/pi-workflows/) | `npm:@davidorex/pi-workflows` | Schema-driven workflow orchestration — YAML specs, DAG execution, 8 step types, typed data flow between agents, expression engine, checkpoint/resume. Output schemas are the enforcement boundary between steps. |
| [@davidorex/pi-behavior-monitors](packages/pi-behavior-monitors/) | `npm:@davidorex/pi-behavior-monitors` | Behavior monitors — autonomous watchdogs that classify agent activity against JSON pattern libraries, steer corrections, and write structured findings. |

## Quick Start

```bash
# Install both extensions in any Pi project (one command)
pi install npm:@davidorex/pi-project-workflows

# Or install individually
pi install npm:@davidorex/pi-project
pi install npm:@davidorex/pi-workflows

# Initialize project structure
/project init     # creates .project/ with schemas and empty blocks
/workflow init    # creates .workflows/ for run state
```

## Directory Ownership

After initialization, three directories coexist in a project:

```
.pi/            — Pi platform (agents, skills, settings). Managed by Pi itself.
.project/       — pi-project (schemas, block data, phases). Created by /project init.
  schemas/      — JSON Schema files defining block types
  phases/       — phase specification files
  *.json        — block data files (gaps, decisions, rationale, project, etc.)
.workflows/     — pi-workflows (run state). Created by /workflow init.
  runs/         — workflow execution state, session logs, outputs
```

`.pi/` is Pi's territory — neither extension writes to it. `.project/` is tracked in git (schemas and blocks are source). `.workflows/` is gitignored (runtime state).

## What Each Extension Provides

### pi-project

**Tools:** `append-block-item`, `update-block-item`, `read-block`, `write-block`, `project-status`, `project-validate`, `project-init` — generic block CRUD with automatic schema validation

**Commands:**
- `/project init` — scaffold `.project/` with 13 default schemas and 4 starter blocks
- `/project status` — derived project state (source metrics, test counts, block summaries, git state)
- `/project add-work` — extract structured items from conversation into typed blocks
- `/project validate` — cross-block referential integrity checks
- `/project help` — show available subcommands

**Key concept:** Users define block types by adding JSON Schemas to `.project/schemas/`. Any `.project/*.json` file with a matching schema gets automatic write-time validation. No code changes needed to add new block types.

### pi-workflows

**Tools:** `workflow`, `workflow-list`, `workflow-agents`, `workflow-validate`, `workflow-status`, `workflow-init`

**Commands:**
- `/workflow init` — scaffold `.workflows/` directory
- `/workflow list` — discover and select a workflow to run
- `/workflow run <name>` — execute a workflow (tab-completes with discovered workflow names)
- `/workflow resume <name>` — resume from checkpoint
- `/workflow validate [name]` — validate workflow specs
- `/workflow status` — show workflow vocabulary and discovery
- `/workflow help` — show available subcommands

**Keybindings:** `Ctrl+H` pause, `Ctrl+J` resume

**Key concept:** Workflows are `.workflow.yaml` specs with typed data flow between steps. Each step runs as a subprocess with its own context window. The DAG planner infers parallelism from `${{ steps.X }}` expression references and `context` declarations. Agent steps support `context: [stepName]` to inline prior step narrative text into the dispatch prompt, complementing expression-based structured data flow. The `monitor` step type integrates behavior classification as a verification gate. Bundled agents, schemas, and templates ship with the package; users override by placing files in `.pi/agents/`, `.pi/templates/`.

### pi-behavior-monitors

**Tools:** `monitors-status`, `monitors-inspect`, `monitors-control`, `monitors-rules`, `monitors-patterns`

**Commands:**
- `/monitors on|off` — enable/disable all monitoring
- `/monitors <name>` — inspect a monitor
- `/monitors <name> rules|patterns|dismiss|reset` — manage monitor state
- `/monitors help` — show available commands

**Programmatic API:** `invokeMonitor(name, context?)` — exported function for synchronous classification without event-handler side effects. Returns `ClassifyResult` directly.

**Key concept:** Monitors are `.monitor.json` specs with Nunjucks classify templates. They observe agent activity via Pi event handlers (`message_end`, `turn_end`, `agent_end`), classify against JSON pattern libraries using side-channel LLM calls, and steer corrections or write structured findings. Verdicts: CLEAN (no issue), FLAG (known pattern), NEW (unknown pattern, optionally learned).

## Development

```bash
# Install dependencies
npm install

# Build all packages (tsc compiles to dist/)
npm run build

# Run all tests
npm test

# Run per-package
npm test -w packages/pi-project
npm test -w packages/pi-workflows
npm test -w packages/pi-behavior-monitors

# Run integration tests (requires pi on PATH, spawns LLM subprocesses)
RUN_INTEGRATION=1 npm test -w packages/pi-workflows

# Lint and format (uses Biome)
npm run lint       # check for lint issues
npm run format     # auto-fix formatting
npm run check      # lint + typecheck (biome check + tsc --noEmit)

# Clean build artifacts
npm run clean

# Derive project state
npx tsx -e "
  import { projectState } from './packages/pi-project/src/project-sdk.js';
  console.log(JSON.stringify(projectState('.'), null, 2));
"
```

## Architecture

- **Main conversation is the control plane; workflows are subordinate.** Each workflow step runs as a subprocess (`pi --mode json`) with its own context window. The main LLM orchestrates; step agents execute.
- **Agent specs are `.agent.yaml` only** (no `.md` fallback). Compiled to prompts via Nunjucks at dispatch time.
- **DAG planner infers parallelism** from `${{ steps.X }}` expression references and `context: [stepName]` declarations. Steps without explicit dependencies run sequentially by declaration order.
- **Context injection** — agent steps with `context: [step1, step2]` get prior step `textOutput` inlined into their dispatch prompt as labeled markdown sections. Complements expression-based structured data flow with narrative text inlining.
- **Monitor step type** — workflows can invoke monitors as verification gates via `monitor: <name>`. CLEAN → completed, FLAG/NEW → failed.
- **Atomic writes** — all block and state persistence uses tmp file + rename for crash safety. State write failure is fatal.
- **Checkpoint/resume** — incomplete runs can be resumed from last completed step. `completion` field controls post-workflow message to main LLM.
- **Three-tier resource search** — project `.pi/` > user `~/.pi/agent/` > package builtin (agents, templates, workflows)
- **Workflow SDK** (`packages/pi-workflows/src/workflow-sdk.ts`) — single queryable surface for the extension's capabilities. All functions derive dynamically from code registries and filesystem — add a filter, agent, template, or schema and it appears automatically.
- **ESM, TypeScript** compiled via `tsc` to `dist/`. Pi loads compiled JS from each package's `dist/index.js`. Cross-package imports use `.js` extensions for Node16 module resolution.
- **pi-workflows depends on pi-project** as a peer dependency. pi-project has no knowledge of workflows. pi-behavior-monitors is independent of both.

## For LLMs

When working in this repository:

- **Read package READMEs** for detailed API docs: [pi-project](packages/pi-project/README.md), [pi-workflows](packages/pi-workflows/README.md), [pi-behavior-monitors](packages/pi-behavior-monitors/README.md)
- **`packages/pi-project/src/project-sdk.ts`** — derived state, block discovery, the `projectState()` function
- **`packages/pi-project/src/block-api.ts`** — block CRUD with schema validation
- **`packages/pi-workflows/src/workflow-sdk.ts`** — vocabulary, discovery, introspection for workflows
- **`packages/pi-workflows/src/workflow-spec.ts`** — YAML parsing and `STEP_TYPES` registry
- **`packages/pi-workflows/src/expression.ts`** — expression evaluator and filter registry
- **`packages/pi-behavior-monitors/index.ts`** — single-file extension: monitors, classification, steering, `invokeMonitor()` export
- **`.project/`** contains this project's own block data (gaps, decisions, architecture, inventory) — useful for understanding the extension's development state
- Use `/project status` to see derived metrics. Use `/workflow list` to see available workflows.

## Release

All packages use lockstep versioning — every release bumps all three packages to the same version. Run from the repo root:

```bash
npm run release:patch    # bump all packages patch, update CHANGELOGs, commit, tag, publish, push
npm run release:minor    # bump all packages minor
npm run release:major    # bump all packages major
```

This invokes `scripts/release.mjs`, which: bumps versions across all workspaces (via `scripts/sync-versions.js`), stamps `[Unreleased]` CHANGELOG sections with the new version and date, commits, tags `vX.Y.Z`, publishes all packages to npm, adds fresh `[Unreleased]` sections, commits again, and pushes.

## License

MIT
