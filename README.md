# In short

This monorepo is my experimentation lab for crafting a controllable environment for working with llm's to build things in code. 

Everything runs in Pi but can also be run via scripts from Claude Code etc. while Pi is running with the extensions installed. That'll become a cli in the future.

I'm considering renaming it "pi-prometheus-bound." Or maybe just "pi-bound." I currently run it with a script that wholly constrains the main Pi agent to tools given by the extensions, plus read and grep and ls. 

My favorite thing currently is being able to craft and shape context substrates -- /context switch [.dir] -- and model them on the shape of the project's particular current focus. 

Alongside that is attempting to turn "agents" into jit-tool calls context exactingly composed from the context substrate. 

Perhaps I'll be proven wrong, but my working suspicion is that "agents" and even "skills" can be jit-composed from for-purpose atomic context blocks and need not be md files that go stale. DRY, via schemas and macros. The method that works for me is to be quite conversational with the model and then to have a framework that allows me to de-ephemeralize the llm's output at the point of conversation -- "file this...." -- into structured and reusable atomic context elements at the moment. At that point planning becomes structuring context and implementation resolves to composing the context into prompts on the fly.

You should (I hope) be able to create exactly the kind of context substrates you need -- and switch between them, or inter-related them (think git branches, but for substrate shapes in your projects) -- and out of those substrates construct the on-the-fly prompts you need, for the particular purposes you might have.

## Philosophy

> 削斧柯，其则不远
>
> *When cutting wood to make an axe handle, the model is right there in your hand.*

The use of the tool shows you the shape of how to make the version of the tool that you want. Reshape it in-air based on your experience using it.

## Packages

| Package | npm | Description |
|---------|-----|-------------|
| [@davidorex/pi-context](packages/pi-context/) | `npm:@davidorex/pi-context` | Schema-driven project state — typed JSON blocks, write-time validation, generic CRUD tools, dynamically derived state. Add a schema, get a new block type with tooling. No code changes. |
| [@davidorex/pi-jit-agents](packages/pi-jit-agents/) | `npm:@davidorex/pi-jit-agents` | Agent spec compilation and in-process dispatch runtime. Library package (not a Pi extension) that owns loading, compilation, and execution of `.agent.yaml` specs with phantom-tool structured output enforcement. Consumed by pi-workflows and pi-behavior-monitors. |
| [@davidorex/pi-workflows](packages/pi-workflows/) | `npm:@davidorex/pi-workflows` | Schema-driven workflow orchestration — YAML specs, DAG execution, typed step types, typed data flow between agents, expression engine, checkpoint/resume. Output schemas are the enforcement boundary between steps. |
| [@davidorex/pi-behavior-monitors](packages/pi-behavior-monitors/) | `npm:@davidorex/pi-behavior-monitors` | Behavior monitors — autonomous watchdogs that classify agent activity against JSON pattern libraries, steer corrections, and write structured findings. |
| [@davidorex/pi-agent-dispatch](packages/pi-agent-dispatch/) | `npm:@davidorex/pi-agent-dispatch` | In-pi orchestrator surface — privileged agent-as-tool dispatch via `call-agent`, capability-grant authoring via `author-tool-grant`, real-check gate via `run-real-checks`, attested commit via `commit-attested`, bounded loop via `run-work-order-loop`, dynamic composite tools per `config.tool_operations[]`. Per-tool human-authorization gate at the pi-dispatch layer (auth-gate intercepts canonical write-class tools + prompts via `ctx.ui.confirm` + stamps verified operator identity). |

## Quick Start

```bash
# Install all extensions in any Pi project (one command)
pi install npm:@davidorex/pi-project-workflows

# Or install individually
pi install npm:@davidorex/pi-context
pi install npm:@davidorex/pi-workflows
pi install npm:@davidorex/pi-behavior-monitors
pi install npm:@davidorex/pi-agent-dispatch

# Initialize project structure
/context init <substrate-dir>  # bootstrap pointer + substrate/schemas dirs only (no config, no schemas, no blocks)
/context accept-all  # adopt the packaged conception (samples/conception.json) as config.json
/context install     # reconciles the substrate against installed_schemas + installed_blocks in config.json
/workflow init       # creates .workflows/ for run state
```

Block kinds reach the substrate only by declaring their names in `config.json`'s `installed_*` arrays (via `/context accept-all` or by hand) and running `/context install`, which copies them from the package-shipped samples catalog (`samples/`). The substrate (config + lenses + closure-table relations) is degree-zero state that defines where the rest lives and how items group into views.

### Substrate-management primitive (`/context switch` family)

A substrate-dir is selected by the `.pi-context.json` pointer (`contextDir` field). `/context switch` is the substrate-management primitive parallel to `git switch`:

```bash
/context switch <existing-dir>    # flip pointer to an existing substrate dir
/context switch -c <new-dir>      # bootstrap a fresh substrate dir + flip pointer in one operation
/context switch -                 # round-trip to previous_contextDir
/context list                     # enumerate substrate dirs with config.json (active marked)
/context archive <dir>            # move a (non-active) substrate dir to archive/
```

Pointer-flip mutations (`context-switch` / `context-archive` / `context-init` / `context-accept-all` and other write-class tools) route through the pi-agent-dispatch auth-gate, which prompts via `ctx.ui.confirm` and stamps the verified operator identity on the substrate write — agent-issued tool calls become human-authorized at the pi-dispatch boundary regardless of caller-supplied writer fields.

This enables the **per-arc substrate engagement pattern**: significant design/spec arcs (multi-step feature work, spec drafting, dependency migrations) get their own `.context-<arc-name>/` substrate dir with bespoke vocabulary (custom block kinds + relation_types + lenses) decomposing the design space. The substrate IS the spec; the markdown form at `analysis/*.md` is source-of-content; the substrate is source-of-structure + cross-references.

## Directory Ownership

After initialization, three directories coexist in a project:

```
.pi/            — Pi platform (agents, skills, settings). Managed by Pi itself.
.pi-context.json          — bootstrap pointer naming the single ACTIVE substrate dir (contextDir)
.pi-context-registry.json — project-root registry enumerating ALL substrates by substrate_id (git-tracked)
<substrate-dir>/ — pi-context. Created by /context init <substrate-dir> (skeleton-only).
  config.json   — substrate bootstrap: root, substrate_id, naming, hierarchy, lenses, installed_*
  relations.json — closure-table edges (created on first authored edge)
  migrations.json — per-substrate schema-version migration registry
  schemas/      — JSON Schema files (empty until /context install reifies declared names)
  objects/      — content-addressed object store, one objects/<content_hash>.json per content version (git-tracked)
  <name>.json   — block data files (each a /context install target or user-authored)
.workflows/     — pi-workflows (run state). Created by /workflow init.
  runs/         — workflow execution state, session logs, outputs
```

`.pi/` is Pi's territory — neither extension writes to it. The substrate directory is tracked in git (substrate, schemas, and blocks are source). `.workflows/` is gitignored (runtime state). `config.json` and `relations.json` always live at the substrate-dir root (the bootstrap-chosen dir, pointer-resolved; they define `root`); everything else lives under `<config.root>/...` and a relocated root reaches every read/write because all path construction routes through `resolveContextDir(cwd)`.

## What Each Extension Provides

### pi-context

**Tool families:** block CRUD (`read/write/append/update/remove-block-item`, top-level + nested), item-level read/query (`read-block-item`, `read-block-page`, `filter-block-items`, `resolve-item(s)-by-id`, `join-blocks`, `find-references`, `walk-ancestors`, `context-walk-descendants`, `context-edges-for-lens`, `gather-execution-context`), substrate writes (`append-relation`, `amend-config`, `write-schema`, `write-schema-migration`, `rename-canonical-id`), content-addressing lifecycle (`promote-item`, `migrate-content-addressed`, `canonicalize-substrate`), discovery/introspection (`read-config`, `read-schema`, `read-samples-catalog`, `list-tools`, `context-current-state`, `context-bootstrap-state`), lifecycle/state (`context-status`, `context-validate`, `context-validate-relations`, `complete-task`), substrate management (`context-init`, `context-accept-all`, `context-switch`, `context-list`, `context-archive`), and roadmap (`context-roadmap-load/render/validate/list`) — all writes carry automatic schema validation. Read `packages/pi-context/skills/pi-context/SKILL.md` or call `list-tools` for the current set.

**Item identity + cross-substrate.** Identity-bearing items carry a three-layer identity — a mutable `id` refname, a content-independent `oid` minted once and immutable, a `content_hash` over the item's content projection (persisted to a git-tracked `objects/<content_hash>.json` store), and a `content_parent` version chain. Each substrate's `config.json` carries a `substrate_id`; a project-root `.pi-context-registry.json` enumerates all substrates by `substrate_id` so closure-table edges can point across substrates (a `{kind:"item", oid, substrate_id}` endpoint), resolved/classified by `resolveRef` as active/foreign/dangling/unregistered.

**Commands:**
- `/context init <substrate-dir>` — write the substrate skeleton (bootstrap pointer + dirs; no config, no schemas, no blocks); refuses with loud error when the existing pointer's `contextDir` differs from the caller's argument (points to `/context switch -c <new-dir>` as the correct command for that operation)
- `/context accept-all` — adopt the packaged conception (samples/conception.json) as config.json
- `/context install [--update]` — reconcile `<substrate-dir>/` against `installed_schemas` / `installed_blocks` declared in `config.json` from the package registry
- `/context switch <dir> | -c <new-dir> | -` — substrate-management primitive: flip pointer to existing dir, bootstrap-and-flip in one op, or round-trip to `previous_contextDir`
- `/context list` — enumerate substrate dirs with `config.json` (active marked)
- `/context archive <dir>` — move a (non-active) substrate dir to `archive/`
- `/context view <lensId>` — render a configured lens (groupByLens projection) into the conversation
- `/context lens-curate <lensId>` — surface bin-assignment suggestions for uncategorized items as a follow-up turn
- `/context status` — derived project state (source metrics, test counts, block summaries, git state)
- `/context add-work` — extract structured items from conversation into typed blocks
- `/context validate` — cross-block referential integrity checks
- `/context help` — show available subcommands

**Key concept:** Users define block types by adding JSON Schemas to `<substrate-dir>/schemas/`. Any `<substrate-dir>/*.json` file with a matching schema gets automatic write-time validation. No code changes needed to add new block types.

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

### pi-agent-dispatch

**Tools (static):** `call-agent`, `author-agent-spec`, `author-tool-grant`, `run-real-checks`, `commit-attested`, `run-work-order-loop`, `write-schema-migration`

**Tools (dynamic):** composite Pi tools registered per `config.tool_operations[]` entries (kind-typed: read-files / git-log / grep-paths / command-allowlist). Each closure-binds its `instance_params` and is granted via `--tools <canonical_id>` like any built-in.

**Dispatch-layer event handlers:**
- **auth-gate** (`tool_call` handler) — intercepts canonical write-class tools (`author-agent-spec` / `author-tool-grant` / `commit-attested` / `write-schema` / `write-schema-migration` / `amend-config` / `write-block` / `rename-canonical-id` / `context-init` / `context-accept-all` / `context-switch` / `context-archive` / `workflow-execute` / `workflow-resume` / `workflow-init` / `monitors-control` / `monitors-rules`); refuses non-interactive contexts unconditionally; calls `ctx.ui.confirm` interactively; on confirm, stamps verified operator identity (git config user.email → process.env.USER cascade) onto `event.input.writer`. Substrate attestation reflects actually-confirming-user, not agent-supplied claim.
- **read-truncation-gate** (`tool_result` handler) — hard-refuses pi built-in `read` truncation by replacing `event.content` with single-text-item carrying canonical directive (paginate / grep / sed byte-range as appropriate per `TruncationResult` shape).

**Key concept:** an in-pi orchestrator authors agent specs + composes operation-granular capability grants, dispatches a privileged sub-agent under a bounded grant clamped to the parent's grant at dispatch, runs deterministic real-checks (build / typecheck / test / runtime demo / adversarial probe) as the terminal verdict (no LLM in the gate loop), and commits the agent's per-file changes with an `Attested-by: agent/<id>` footer. `run-work-order-loop` provides bounded iteration with a human-OK gate at iteration boundaries.

## Development

```bash
# Install dependencies
npm install

# Build all packages (tsc compiles to dist/)
npm run build

# Run all tests
npm test

# Run per-package
npm test -w packages/pi-context
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
  import { contextState } from './packages/pi-context/src/context-sdk.js';
  console.log(JSON.stringify(contextState('.'), null, 2));
"
```

## Architecture

- **Main conversation is the control plane; workflows are subordinate.** Each workflow step runs as a subprocess (`pi --mode json`) with its own context window. The main LLM orchestrates; step agents execute.
- **Agent specs are `.agent.yaml` only** (no `.md` fallback). Compiled to prompts via Nunjucks at dispatch time. Agents declare `inputSchema` for typed input validation at dispatch, `contextBlocks` to inject project block data into templates, and `output.format`/`output.schema` for output validation.
- **`contextBlocks`** — an agent YAML field. Each entry is either a bare block-name string (whole-block injection) or an object `{ name, item?, focus?, depth? }` (per-item or scoped injection). At dispatch time, string entries inject the whole block under `_<name>` (hyphens become underscores). Object entries with `item` resolve the ID via the cross-block resolver and inject under `_<name>_item` (single-entry case) or `_<name>_items` array (multi-entry case for the same name — e.g., three decisions in one contextBlocks array). `depth` controls cross-reference recursion; `focus` carries kind-specific scope hints. Templates access block data via `{{ _conventions.rules }}` or render via the per-item macros under `templates/items/` (e.g., `{% from "items/conventions.md" import render_convention %}{{ render_convention(rule) }}`). Whole-block delegators in `templates/shared/macros.md` map over items. Missing blocks are `null`; templates guard with `{% if _conventions %}`. No substrate directory means injection is skipped entirely. This is how project state flows into agent prompts declaratively.
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
- All packages use **direct dependencies**. pi-jit-agents depends on pi-context for block-api reads during contextBlocks injection. pi-workflows and pi-behavior-monitors depend on pi-context for block state; consumer migration to adopt pi-jit-agents as their agent runtime is tracked in the jit-agents v2 spec at `analysis/2026-05-30-jit-agents-spec-v2.md` (markdown source-of-content) + `.context-jit-spec-v2/` (substrate source-of-structure: 3 axioms + 10 decisions + 5 concepts + 2 dispatch-modes + 6 v1-supersessions + open-question FGAPs + inter-entity edges + `full-spec-render` composition lens). pi-agent-dispatch depends on pi-context + pi-jit-agents. pi-context has no knowledge of workflows, monitors, jit-agents, or agent-dispatch.

## For LLMs

When working in this repository:

- **Read package READMEs** for detailed API docs: [pi-context](packages/pi-context/README.md), [pi-jit-agents](packages/pi-jit-agents/README.md), [pi-workflows](packages/pi-workflows/README.md), [pi-behavior-monitors](packages/pi-behavior-monitors/README.md), [pi-agent-dispatch](packages/pi-agent-dispatch/README.md)
- **`packages/pi-context/src/context-sdk.ts`** — derived state, block discovery, the `contextState()` function
- **`packages/pi-context/src/block-api.ts`** — block CRUD with schema validation
- **`packages/pi-workflows/src/workflow-sdk.ts`** — vocabulary, discovery, introspection for workflows
- **`packages/pi-workflows/src/workflow-spec.ts`** — YAML parsing and `STEP_TYPES` registry
- **`packages/pi-workflows/src/expression.ts`** — expression evaluator and filter registry
- **`packages/pi-behavior-monitors/index.ts`** — single-file extension: monitors, classification, steering, `invokeMonitor()` export
- **`.project/`** contains this project's own block data (issues, decisions, architecture, inventory) — useful for understanding the extension's development state
- Use `/context status` to see derived metrics. Use `/workflow list` to see available workflows.

## Release

All packages use lockstep versioning — every release bumps all packages to the same version. Run from the repo root:

```bash
npm run release:patch    # bump all packages patch, update CHANGELOGs, commit, tag
npm run release:minor    # bump all packages minor
npm run release:major    # bump all packages major
```

This invokes `scripts/release.mjs`, which: checks for uncommitted changes, bumps versions across all workspaces (via `scripts/bump-versions.js`), stamps `[Unreleased]` CHANGELOG sections with the new version and date, commits, and tags `vX.Y.Z`. The script does not publish or push — after it completes, the human must run `npm publish --workspaces --access public` (requires npm login + OTP) and `git push origin main && git push origin v<version>`.

## License

MIT.
