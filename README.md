# pi-project-workflows

Monorepo for two [Pi](https://github.com/badlogic/pi-mono) extensions that give Pi agents structured project state and multi-step workflow orchestration.

## Packages

| Package | npm | Description |
|---------|-----|-------------|
| [@davidorex/pi-project](packages/pi-project/) | `npm:@davidorex/pi-project` | Schema-driven project state management — typed JSON blocks with write-time validation, generic CRUD tools, dynamically derived state |
| [@davidorex/pi-workflows](packages/pi-workflows/) | `npm:@davidorex/pi-workflows` | Workflow orchestration — YAML specs, DAG execution, 8 step types, expression engine, checkpoint/resume |

## Quick Start

```bash
# Install both extensions in any Pi project
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

# Run all tests (600 total: 58 pi-project + 542 pi-workflows)
npm test

# Run per-package
npm test -w packages/pi-project
npm test -w packages/pi-workflows

# Run integration tests (requires pi on PATH, spawns LLM subprocesses)
RUN_INTEGRATION=1 npm test -w packages/pi-workflows

# Derive project state
node --experimental-strip-types -e "
  import { projectState } from './packages/pi-project/src/project-sdk.ts';
  console.log(JSON.stringify(projectState('.'), null, 2));
"
```

## Architecture

- **ESM, TypeScript** loaded directly by Pi via `--experimental-strip-types` (no build step)
- **npm workspaces** — cross-package imports via workspace symlinks (`@davidorex/pi-project/src/...`)
- **pi-workflows depends on pi-project** as a peer dependency. pi-project has no knowledge of workflows.
- **Atomic writes** — all block and state persistence uses tmp file + rename for crash safety
- **Three-tier resource search** — project `.pi/` > user `~/.pi/agent/` > package builtin (agents, templates, workflows)
- **Subprocess dispatch** — each workflow step spawns `pi --mode json` as a child process. Main conversation is the control plane.

## For LLMs

When working in this repository:

- **Read package READMEs** for detailed API docs: [pi-project](packages/pi-project/README.md), [pi-workflows](packages/pi-workflows/README.md)
- **`packages/pi-project/src/project-sdk.ts`** — derived state, block discovery, the `projectState()` function
- **`packages/pi-project/src/block-api.ts`** — block CRUD with schema validation
- **`packages/pi-workflows/src/workflow-sdk.ts`** — vocabulary, discovery, introspection for workflows
- **`packages/pi-workflows/src/workflow-spec.ts`** — YAML parsing and `STEP_TYPES` registry
- **`packages/pi-workflows/src/expression.ts`** — expression evaluator and filter registry
- **`.project/`** contains this project's own block data (gaps, decisions, architecture, inventory) — useful for understanding the extension's development state
- Use `/project status` to see derived metrics. Use `/workflow list` to see available workflows.

## Release

Each package has changelogen-based release scripts:

```bash
cd packages/pi-project
npm run release:patch    # bump, changelog, commit, tag
npm run release:push     # push commit + tag
npm publish --access public

cd packages/pi-workflows
npm run release:patch
npm run release:push
npm publish --access public
```

Publish pi-project first (pi-workflows depends on it as a peer).

## License

MIT
