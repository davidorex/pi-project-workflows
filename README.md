# pi-project-workflows

Three [Pi](https://github.com/badlogic/pi-mono) extensions plus a shared agent-runtime library: typed, multi-step workflow execution via `.workflow.yaml` specs; schema-driven project state in `.project/`; behavior monitors that classify agent activity and steer corrections; and a library package that owns everything between "I have a spec" and "I have a typed result."

Schemas are the contract layer. In pi-project, you define what your project tracks by writing JSON Schemas — the tools, validation, and derived state adapt automatically. In pi-workflows, agent steps declare output schemas that enforce the shape of data flowing through the pipeline. In pi-behavior-monitors, JSON pattern libraries define what to detect and how to respond. In pi-jit-agents, agent specs are compiled to typed results with phantom-tool structured output enforcement. The three extensions form a typed loop: project state → workflow input → agent output → validated project state → monitor classification → steering.

## Philosophy

> 削斧柯，其则不远
>
> *When cutting wood to make an axe handle, the model is right there in your hand.*

If pi-project-workflows is done right, users need not wait for developers to implement changes that they find through use that they need. The use of the tool shows you the shape of how to make the version of the tool that you want.

Add a JSON Schema — get a new block type with tools, validation, and derived state. Write a `.workflow.yaml` — get a new multi-step pipeline with typed data flow and checkpoint/resume. Drop a `.monitor.json` with a Nunjucks template — get an autonomous watchdog that classifies, learns, and steers. Author an `.agent.yaml` — get a typed agent contract compiled to prompts at dispatch time. The runtime is generic; the domain lives in specs, schemas, and templates that users create without touching TypeScript.

The framework is outcome-agnostic — not a coding agent extension. Blocks can track sales pipelines, lesson plans, research findings, compliance audits. Workflows can orchestrate document review, data analysis, meeting preparation. Monitors can classify any agent behavior against any pattern library. Artifacts are any verifiable output: updated spreadsheets, reports, specifications, not just code.

## Packages

| Package | npm | Description |
|---------|-----|-------------|
| [@davidorex/pi-project](packages/pi-project/) | `npm:@davidorex/pi-project` | Schema-driven project state — typed JSON blocks, write-time validation, generic CRUD tools, dynamically derived state. Add a schema, get a new block type with tooling. No code changes. |
| [@davidorex/pi-jit-agents](packages/pi-jit-agents/) | `npm:@davidorex/pi-jit-agents` | Agent spec compilation and in-process dispatch runtime. Library package (not a Pi extension) that owns loading, compilation, and execution of `.agent.yaml` specs with phantom-tool structured output enforcement. Consumed by pi-workflows and pi-behavior-monitors. |
| [@davidorex/pi-workflows](packages/pi-workflows/) | `npm:@davidorex/pi-workflows` | Schema-driven workflow orchestration — YAML specs, DAG execution, 9 step types, typed data flow between agents, expression engine, checkpoint/resume. Output schemas are the enforcement boundary between steps. |
| [@davidorex/pi-behavior-monitors](packages/pi-behavior-monitors/) | `npm:@davidorex/pi-behavior-monitors` | Behavior monitors — autonomous watchdogs that classify agent activity against JSON pattern libraries, steer corrections, and write structured findings. |

## Quick Start

```bash
# Install both extensions in any Pi project (one command)
pi install npm:@davidorex/pi-project-workflows

# Or install individually
pi install npm:@davidorex/pi-project
pi install npm:@davidorex/pi-workflows

# Initialize project structure
/project init     # writes the substrate skeleton + minimal .project/config.json (no schemas, no blocks)
/project install  # reconciles .project/ against installed_schemas + installed_blocks declared in config.json
/workflow init    # creates .workflows/ for run state
```

Block kinds reach `.project/` only by declaring their names in `config.json`'s `installed_*` arrays and running `/project install` against the package-shipped `registry/`. The substrate (config + lenses + closure-table relations) is degree-zero state that defines where the rest lives and how items group into views.

## Directory Ownership

After initialization, three directories coexist in a project:

```
.pi/            — Pi platform (agents, skills, settings). Managed by Pi itself.
.project/       — pi-project. Created by /project init (skeleton-only).
  config.json   — substrate bootstrap: root, naming, hierarchy, lenses, installed_*
  relations.json — closure-table edges (created on first authored edge)
  schemas/      — JSON Schema files (empty until /project install reifies declared names)
  phases/       — phase specification files (empty until populated)
  <name>.json   — block data files (each a /project install target or user-authored)
.workflows/     — pi-workflows (run state). Created by /workflow init.
  runs/         — workflow execution state, session logs, outputs
```

`.pi/` is Pi's territory — neither extension writes to it. `.project/` is tracked in git (substrate, schemas, and blocks are source). `.workflows/` is gitignored (runtime state). `config.json` and `relations.json` always live at `.project/` (they define `root`); everything else lives under `<config.root>/...` and a relocated root reaches every read/write because all path construction routes through `projectRoot(cwd)`.

## What Each Extension Provides

### pi-project

**Tools:** `append-block-item`, `update-block-item`, `read-block`, `write-block`, `read-block-dir`, `append-block-nested-item`, `update-block-nested-item`, `remove-block-item`, `remove-block-nested-item`, `resolve-item-by-id`, `project-status`, `project-validate`, `project-init`, `project-validate-relations`, `project-edges-for-lens`, `project-walk-descendants`, `complete-task` — block CRUD (top-level + nested array operations) with automatic schema validation, plus cross-block ID resolution and substrate (closure-table relations + lens) tooling

**Commands:**
- `/project init` — write the substrate skeleton + minimal `config.json` bootstrap (no schemas, no starter blocks)
- `/project install [--update]` — reconcile `.project/` against `installed_schemas` / `installed_blocks` declared in `config.json` from the package registry
- `/project view <lensId>` — render a configured lens (groupByLens projection) into the conversation
- `/project lens-curate <lensId>` — surface bin-assignment suggestions for uncategorized items as a follow-up turn
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

# Lint and format (Biome v2.4.9, scoped to packages/ + scripts/)
npm run lint       # check for lint issues
npm run format     # auto-fix formatting
npm run check      # lint + typecheck

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
- **Agent specs are `.agent.yaml` only** (no `.md` fallback). Compiled to prompts via Nunjucks at dispatch time. Agents declare `inputSchema` for typed input validation at dispatch, `contextBlocks` to inject project block data into templates, and `output.format`/`output.schema` for output validation.
- **`contextBlocks`** — an agent YAML field. Each entry is either a bare block-name string (whole-block injection) or an object `{ name, item?, focus?, depth? }` (per-item or scoped injection). At dispatch time, string entries inject the whole block under `_<name>` (hyphens become underscores). Object entries with `item` resolve the ID via the cross-block resolver and inject under `_<name>_item` (single-entry case) or `_<name>_items` array (multi-entry case for the same name — e.g., three decisions in one contextBlocks array). `depth` controls cross-reference recursion; `focus` carries kind-specific scope hints. Templates access block data via `{{ _conventions.rules }}` or render via the per-item macros under `templates/items/` (e.g., `{% from "items/conventions.md" import render_convention %}{{ render_convention(rule) }}`). Whole-block delegators in `templates/shared/macros.md` map over items. Missing blocks are `null`; templates guard with `{% if _conventions %}`. No `.project/` directory means injection is skipped entirely. This is how project state flows into agent prompts declaratively.
- **`inputSchema`** — an agent YAML field defining a JSON Schema for the agent's input. Validated at dispatch time before the agent subprocess is spawned. If validation fails, the step fails immediately — no LLM call is made.
- **Per-item macros** (`templates/items/<kind>.md`) — one per block kind, each rendering a single item. Macro names follow canonical singular convention (e.g. `render_decision`, `render_feature`, `render_framework_gap`, `render_convention`); the renderer registry maps each kind to its canonical macro via `CANONICAL_MACRO_NAMES`. Macros are depth-aware: cross-block ID references inline via the `resolve` and `render_recursive` Nunjucks globals when `depth > 0`, fall back to bare-ID emission at `depth = 0`, and produce the named `cycleMarker` / `unrenderedMarker` / `notFoundMarker` sentinels on cycles, missing macros, or unresolved IDs. Budget-annotated fields render through the `enforceBudget` Nunjucks global; warnings surface on `CompiledAgent.budgetWarnings`.
- **Whole-block delegators** (`templates/shared/macros.md`) — thin `for x in data.<key> { render_<kind>_item(x) }` wrappers over the per-item macros, for callers that want to dump a whole block.
- **Shared render-helpers** (`templates/shared/render-helpers.md`) — helper macros for the recursion / optional-array / optional-scalar patterns. Per-item macros import what they need; new block kinds added later get the same recursion behavior without copy-pasting the pattern.
- All resolved via three-tier template search — users override by placing alternate macro files in `.pi/templates/items/<kind>.md` or `.pi/templates/shared/...`.
- **DAG planner infers parallelism** from `${{ steps.X }}` expression references and `context: [stepName]` declarations. Steps without explicit dependencies run sequentially by declaration order.
- **Step context injection** — agent steps with `context: [step1, step2]` get prior step `textOutput` inlined into their dispatch prompt as labeled markdown sections. Complements expression-based structured data flow with narrative text inlining.
- **Monitor step type** — workflows can invoke monitors as verification gates via `monitor: <name>`. CLEAN → completed, FLAG/NEW → failed.
- **Atomic writes** — all block and state persistence uses tmp file + rename for crash safety. State write failure is fatal.
- **Checkpoint/resume** — incomplete runs can be resumed from last completed step. `completion` field controls post-workflow message to main LLM.
- **Three-tier resource search** — project `.pi/` > user `~/.pi/agent/` > package builtin (agents, templates, workflows)
- **Workflow SDK** (`packages/pi-workflows/src/workflow-sdk.ts`) — single queryable surface for the extension's capabilities. All functions derive dynamically from code registries and filesystem. Vocabulary: `stepTypes()`, `filterNames()`, `validationChecks()`. Discovery: `availableAgents()`, `availableWorkflows()`. Contracts: `agentContracts(cwd)` projects each agent's inputSchema, contextBlocks, and output format; `agentsByBlock(cwd, blockName)` finds agents consuming a given block. Validation: `validateWorkflow()` checks 11 dimensions including inputSchema required-key matching, contextBlocks existence, StepType metadata enforcement, and template-input alignment with contextBlocks-injected variables.
- **ESM, TypeScript** compiled via `tsc` to `dist/`. Pi loads compiled JS from each package's `dist/index.js`. Cross-package imports use `.js` extensions for Node16 module resolution.
- **Skill self-install** — each extension copies its `skills/` directory to `~/.pi/agent/skills/` on activation, ensuring skills are discoverable regardless of install method.
- **Pre-commit hook** (husky) runs `npm run check` before every commit. **CI** (GitHub Actions) runs check + build + test on Node 22/23.
- All four packages use **direct dependencies**. pi-jit-agents depends on pi-project for block-api reads during contextBlocks injection. pi-workflows and pi-behavior-monitors depend on pi-project for block state; consumer migration to adopt pi-jit-agents as their agent runtime is tracked in `docs/planning/jit-agents-spec.md`. pi-project has no knowledge of workflows, monitors, or jit-agents.

## For LLMs

When working in this repository:

- **Read package READMEs** for detailed API docs: [pi-project](packages/pi-project/README.md), [pi-workflows](packages/pi-workflows/README.md), [pi-behavior-monitors](packages/pi-behavior-monitors/README.md)
- **`packages/pi-project/src/project-sdk.ts`** — derived state, block discovery, the `projectState()` function
- **`packages/pi-project/src/block-api.ts`** — block CRUD with schema validation
- **`packages/pi-workflows/src/workflow-sdk.ts`** — vocabulary, discovery, introspection for workflows
- **`packages/pi-workflows/src/workflow-spec.ts`** — YAML parsing and `STEP_TYPES` registry
- **`packages/pi-workflows/src/expression.ts`** — expression evaluator and filter registry
- **`packages/pi-behavior-monitors/index.ts`** — single-file extension: monitors, classification, steering, `invokeMonitor()` export
- **`.project/`** contains this project's own block data (issues, decisions, architecture, inventory) — useful for understanding the extension's development state
- Use `/project status` to see derived metrics. Use `/workflow list` to see available workflows.

## Release

All packages use lockstep versioning — every release bumps all packages to the same version. Run from the repo root:

```bash
npm run release:patch    # bump all packages patch, update CHANGELOGs, commit, tag
npm run release:minor    # bump all packages minor
npm run release:major    # bump all packages major
```

This invokes `scripts/release.mjs`, which: checks for uncommitted changes, bumps versions across all workspaces (via `scripts/bump-versions.js`), stamps `[Unreleased]` CHANGELOG sections with the new version and date, commits, and tags `vX.Y.Z`. The script does not publish or push — after it completes, the human must run `npm publish --workspaces --access public` (requires npm login + OTP) and `git push origin main && git push origin v<version>`.

## License

MIT
