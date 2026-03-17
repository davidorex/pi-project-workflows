# pi-project-workflows

Two [Pi](https://github.com/badlogic/pi-mono) extensions that give Pi agents structured, schema-driven project state and typed workflow orchestration.

Schemas are the contract layer. In pi-project, you define what your project tracks by writing JSON Schemas — the tools, validation, and derived state adapt automatically. In pi-workflows, agent steps declare output schemas that enforce the shape of data flowing through the pipeline. The two extensions form a typed loop: project state → workflow input → agent output → validated project state.

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

**Tools:** `append-block-item`, `update-block-item` — generic block CRUD with automatic schema validation

**Commands:**
- `/project init` — scaffold `.project/` with 13 default schemas and 4 starter blocks
- `/project status` — derived project state (source metrics, test counts, block summaries, git state)
- `/project add-work` — extract structured items from conversation into typed blocks

**Key concept:** Users define block types by adding JSON Schemas to `.project/schemas/`. Any `.project/*.json` file with a matching schema gets automatic write-time validation. No code changes needed to add new block types.

### pi-workflows

**Tool:** `workflow` — run a named workflow with typed input

**Commands:**
- `/workflow init` — scaffold `.workflows/` directory
- `/workflow list` — discover and select a workflow to run
- `/workflow run <name>` — execute a workflow
- `/workflow resume <name>` — resume from checkpoint

**Keybindings:** `Ctrl+H` pause, `Ctrl+J` resume

**Key concept:** Workflows are `.workflow.yaml` specs with typed data flow between steps. Each step runs as a subprocess with its own context window. The DAG planner infers parallelism from `${{ steps.X }}` expression references. Bundled agents, schemas, and templates ship with the package; users override by placing files in `.pi/agents/`, `.pi/templates/`.

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

- **ESM, TypeScript** compiled via `tsc` to `dist/`. Pi loads compiled JS from each package's `dist/index.js`.
- **npm workspaces** — cross-package imports via workspace symlinks, using `.js` extensions for Node16 module resolution (e.g., `@davidorex/pi-project/src/block-api.js` in source, resolving to `dist/` in published packages)
- **pi-workflows depends on pi-project** as a peer dependency. pi-project has no knowledge of workflows.
- **Atomic writes** — all block and state persistence uses tmp file + rename for crash safety
- **Three-tier resource search** — project `.pi/` > user `~/.pi/agent/` > package builtin (agents, templates, workflows)
- **Subprocess dispatch** — each workflow step spawns `pi --mode json` as a child process. Main conversation is the control plane.

## For LLMs

When working in this repository:

- **Read package READMEs** for detailed API docs: [pi-project](packages/pi-project/README.md), [pi-workflows](packages/pi-workflows/README.md), [pi-behavior-monitors](packages/pi-behavior-monitors/README.md)
- **`packages/pi-project/src/project-sdk.ts`** — derived state, block discovery, the `projectState()` function
- **`packages/pi-project/src/block-api.ts`** — block CRUD with schema validation
- **`packages/pi-workflows/src/workflow-sdk.ts`** — vocabulary, discovery, introspection for workflows
- **`packages/pi-workflows/src/workflow-spec.ts`** — YAML parsing and `STEP_TYPES` registry
- **`packages/pi-workflows/src/expression.ts`** — expression evaluator and filter registry
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
