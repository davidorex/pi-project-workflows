# pi-project-workflows

Typed, multi-step workflow execution via `.workflow.yaml` specs. Schema-driven project state in `.project/`. Behavior monitors that classify agent activity and steer corrections.

Monorepo: npm packages under `packages/*` with lockstep versioning. Inspect `packages/` for the current set; count and names are derivable.

| Package | Purpose |
|---------|---------|
| `@davidorex/pi-project` | Block CRUD, schema validation, `/project` command |
| `@davidorex/pi-jit-agents` | Agent spec compilation + in-process dispatch runtime (library, not an extension) |
| `@davidorex/pi-workflows` | Workflow orchestration, agent dispatch, `/workflow` command |
| `@davidorex/pi-behavior-monitors` | Autonomous monitors, classification, steering |
| `@davidorex/pi-project-workflows` | Meta-package re-exporting the three Pi extensions |

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
- Biome linting: tab indent, 120-char lines, scoped per `biome.json` (`packages/*/src/**` + `scripts/**`); version pinned in root `package.json` devDependencies. `npm run lint` / `npm run format`. `biome.json` declares `vcs.useIgnoreFile: true` so nested `.claude/worktrees/*` configs do not trigger nested-root errors
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
9. **Credentialed verification (pre-publish for arc-completion releases)**: for releases that ship new public surface (new SDK exports, new commands, new tools, new schema kinds) or complete a substrate arc, run the canonical verification protocol at `docs/reports/pi-internal-verification-protocol-2026-05-02.md` (or its successor) end-to-end. The protocol uses pi's `auth.json` credentials directly (set up by `pi auth login`); no separate env-var gate. Routine peer-dep bumps and isolated bug-fix releases do not require this gate — the build/check/test sequence catches breakage from there. The previous `jit-runtime.smoke.test.ts` gate was retired in commit `d931dc4` per DEC-0011 (parallel-credential-surface removal); see `feedback_pre_publish_credentialed_smoke.md` for the current rule.
10. **Publish**: requires interactive `npm login` + OTP — inform user to run `npm publish --workspaces --access public`

Steps 1-8 are the agent's responsibility. Step 9 applies to arc-completion releases only; user runs the verification protocol when scope warrants. Step 10 requires user action. Declaring work "done" before step 8 is a failure — the changes are unreachable at runtime.

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

**pi-jit-agents** (`packages/pi-jit-agents/src/`) — library package, not a Pi extension. Owns the four boundary surfaces (load, compile, execute, introspect) per `docs/planning/jit-agents-spec.md`:
- `index.ts` — barrel re-exports for all public API
- `types.ts` — `AgentSpec` (with `loadedFrom`), `CompileContext`, `DispatchContext`, `JitAgentResult`, `AgentContract`
- `errors.ts` — `AgentNotFoundError`, `AgentParseError`, `AgentCompileError`, `AgentDispatchError`
- `agent-spec.ts` — `parseAgentYaml` (fully resolves relative paths per D1), `createAgentLoader` (three-tier discovery per D7: `.project/agents/` → `~/.pi/agent/agents/` → consumer builtin; does NOT search `.pi/agents/` per D3)
- `template.ts` — `createTemplateEnv`, `renderTemplate`, `renderTemplateFile` (three-tier search, workflow `${{ }}` expression protection, no `.pi/` reads per D3)
- `compile.ts` — `compileAgent` (renders system + task templates, injects `contextBlocks` from `.project/` via pi-project `readBlock`, wraps injected block content in framework-level anti-injection delimiters)
- `jit-runtime.ts` — `executeAgent` (unified in-process dispatch, phantom-tool enforcement via forced `toolChoice`, `completeFn` injection for testing), `buildPhantomTool` (JSON Schema → TypeBox converter for the common shape), `normalizeToolChoice(api, toolName)` (provider-aware shape normalizer at the dispatch boundary — emits OpenAI shape for `openai-completions`, Anthropic shape for `anthropic`, Bedrock shape for `bedrock-converse-stream`, throws on unsupported drivers; canonical surface for forced-tool-use, no parallel hardcoded shapes anywhere)
- `introspect.ts` — `agentContract` (projection for SDK queries, hides internal `loadedFrom`)
- `test-fixtures/` (outside `src/`) — minimal fixtures for unit tests, not bundled in `dist/`
- `schemas/verdict.schema.json` — framework-contract schema for the phantom-tool classification pattern.

Consumer migration arc (FEAT-001) is in progress: `pi-behavior-monitors` already imports `normalizeToolChoice` from this package's barrel; full `classifyViaAgent` → `executeAgent` consolidation is still ahead. Wholesale agent-infrastructure consolidation across pi-workflows and pi-behavior-monitors continues incrementally.

**pi-workflows** (`packages/pi-workflows/src/`):
- `index.ts` — extension entry point (tool, command, keybindings)
- `workflow-sdk.ts` — SDK: vocabulary, discovery, derived state, spec introspection
- `workflow-executor.ts` — main orchestration loop
- `workflow-spec.ts` — YAML parsing, `STEP_TYPES` registry
- `expression.ts` — `${{ }}` evaluator, `FILTER_NAMES` export
- `dispatch.ts` — subprocess spawn (`pi --mode json`)
- `dag.ts` — dependency graph, execution plan
- `step-*.ts` — step type executors (one per type, including `step-monitor.ts` for monitor verification gates)
- `templates/shared/macros.md` — Nunjucks macros rendering block data as markdown (one macro per supported block kind; current set is derivable from the file). Per-item macros for newer block kinds (decisions, spec-reviews, features, framework-gaps, layer-plans, research) are pending — REVIEW-001 is gated on `render_decision`

**pi-behavior-monitors** (`packages/pi-behavior-monitors/`):
- `index.ts` — single-file extension (monitors, classification, steering, Nunjucks template rendering). `classifyViaAgent` consumes `normalizeToolChoice` from `@davidorex/pi-jit-agents` for forced-tool-use shape — no hardcoded toolChoice literals
- `agents/*-classifier.agent.yaml` — bundled classifier agents; current set routes through openrouter (`model: openrouter/anthropic/claude-sonnet-4.6`) because `~/.pi/agent/auth.json` carries only an openrouter key in the canonical setup. Provider routing is encoded in the YAML's `model:` field per DEC-0003's execute-boundary principle
- `examples/` — bundled monitor JSON specs + Nunjucks `.md` prompt templates (subdirectories per monitor)

## Workflow SDK (`packages/pi-workflows/src/workflow-sdk.ts`)

Single queryable surface for the workflow extension's capabilities. All functions derive dynamically from code registries and filesystem — add a filter, agent, template, or schema and it appears automatically.

- **Vocabulary**: `stepTypes()`, `filterNames()`, `expressionRoots()`, `validationChecks()` — check descriptors (id, name, severity, description) derived from the validator's code registry; current count is derivable
- **Discovery**: `availableAgents(cwd)`, `availableWorkflows(cwd)`, `availableTemplates(cwd)`, `availableSchemas(cwd)`
- **Contracts**: `agentContracts(cwd)` — per-agent projection of inputSchema (required/optional fields), contextBlocks, outputFormat/Schema. `agentsByBlock(cwd, blockName)` — which agents declare a given block in contextBlocks.
- **Introspection**: `extractExpressions(spec)`, `declaredSteps(spec)`, `declaredAgentRefs(spec)`, `declaredMonitorRefs(spec)`, `declaredSchemaRefs(spec)`
- **Validation**: `validateWorkflow(spec, cwd)` — composes introspection + discovery to check agent resolution, monitor resolution, schema existence, step references, ordering, filter names, StepType metadata (retry/input/output flag enforcement), inputSchema required-key matching, contextBlocks existence in `.project/`, template-input alignment (including contextBlocks-injected variables, block-read schema tracing, guarded-undefined escalation, and actionable suggestions for untraceable field access). Returns `{ status, issues[] }` where status is `"clean" | "warnings" | "invalid"`. Also available as `/workflow validate [name]`.

Use `/workflow status` to see derived state in conversation — includes typed agents (those with inputSchema), context-aware agents (those with contextBlocks), and validation check count.

## Project SDK (`packages/pi-project/src/project-sdk.ts`)

Single queryable surface for project state, block discovery, schema vocabulary, and cross-block validation.

- **Vocabulary**: `schemaVocabulary(cwd)`, `schemaInfo(cwd, name)`, `PROJECT_BLOCK_TYPES`
- **Discovery**: `availableBlocks(cwd)`, `availableSchemas(cwd)`, `findAppendableBlocks(cwd)`, `blockStructure(cwd)`
- **Derived state**: `projectState(cwd)` — all project metrics computed at query time (source files/lines, tests, phases, blockSummaries, requirements, tasks, domain, verifications, hasHandoff, recent commits)
- **Validation**: `validateProject(cwd)` — cross-block referential integrity (task→phase, decision→phase, gap→resolved_by, requirement→traces_to, verification→target, rationale→related_decisions). Returns `{ status, issues[] }` where status is `"clean" | "warnings" | "invalid"`. Also available as `/project validate`.

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
- **issues** — open items with priority, category, resolution tracking (GitHub issue pattern)
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
- Monitor specs are `.monitor.json` with required `classify.agent` referencing a `.agent.yaml` spec. The classify call uses the agent spec compilation pipeline (`compileAgentSpec()`, `createAgentLoader()`) and enforces structured output via the phantom tool pattern: a `VERDICT_TOOL` with TypeBox parameters is passed in `Context.tools` with forced `toolChoice` — the LLM produces `ToolCall.arguments` matching `verdict.schema.json` (CLEAN/FLAG/NEW enum). No text parsing, no JSON.parse of free-form output. The forced-toolChoice shape is provider-specific; both `executeAgent` and `classifyViaAgent` route through `normalizeToolChoice(api, toolName)` from `@davidorex/pi-jit-agents` so the right shape reaches each driver (OpenAI for `openai-completions`, Anthropic for `anthropic`, Bedrock for `bedrock-converse-stream`; throws on `openai-responses` family and google providers because forced tool-use is unenforceable on those routes). Collectors populate the template context (same role as `contextBlocks` for workflow agents). The agent's `model:` field selects the dispatch route — bundled classifiers route through openrouter; thinking is force-disabled at classify regardless of YAML setting. The TypeBox `Type` constructor is re-exported by `@mariozechner/pi-ai`; no direct `@sinclair/typebox` import in three of our packages (pi-project imports `typebox` directly). Template search: project `.pi/monitors/` > user `~/.pi/agent/monitors/` > package `examples/`.
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

## CLI Access from Other Agents

Pi tools are accessible from any LLM with shell access via `pi -p "prompt" --mode json`. The subprocess loads all extensions, executes tool calls, and returns newline-delimited JSON events. This is the same mechanism the workflow executor uses for step dispatch.

**Cost-control discipline (F-006 mitigation, mandatory for write tools).** The default openrouter model in pi config is agentic; an unrestricted `pi -p "..." --no-skills` invocation gives the model access to all default tools (`read`, `bash`, `edit`, `write`) and produces tool-call loops that compound prompt size into runaway runtime — observed as a 15+ minute silent "hang" on a 6KB prompt. Always pin a fast non-agentic model and restrict the tool surface unless write capability is explicitly required:

```
pi -p "..." --mode json --tools read --no-skills --model openrouter/anthropic/claude-haiku-4.5
```

For write tools, restrict to the minimum required: `--tools read,write` or omit `--tools` if the prompt's tool call needs broader access, but always retain the `--model` pin. Wrap long-running invocations with `gtimeout 120 pi -p ...` so silent loops surface as exit codes.

Read-only queries (safe, no state changes — append `--model openrouter/anthropic/claude-haiku-4.5` for fast deterministic dispatch):
- `pi -p "call the project-status tool" --mode json --tools read --no-skills` — derived project state
- `pi -p "call the project-validate tool" --mode json --tools read --no-skills` — cross-block integrity
- `pi -p "call the workflow-validate tool" --mode json --tools read --no-skills` — workflow validation (three-state status, actionable suggestions)
- `pi -p "call the workflow-status tool" --mode json --tools read --no-skills` — vocabulary, agents, contracts
- `pi -p "call the workflow-agents tool" --mode json --tools read --no-skills` — agent discovery
- `pi -p "call the read-block tool with name requirements" --mode json --tools read --no-skills` — read any block
- `pi -p "call the monitors-status tool" --mode json --tools read --no-skills` — monitor state

Write operations (modify `.project/` or `.workflows/` — `--model` pin is mandatory; the agentic-loop trap was observed specifically on write-tool invocations):
- `pi -p "call the append-block-item tool with name tasks and key tasks and item {json}" --mode json --no-skills --model openrouter/anthropic/claude-haiku-4.5` — add items to blocks
- `pi -p "call the project-init tool" --mode json --no-skills --model openrouter/anthropic/claude-haiku-4.5` — scaffold `.project/`
- `pi -p "call the workflow-init tool" --mode json --no-skills --model openrouter/anthropic/claude-haiku-4.5` — scaffold `.workflows/`

## Design Decisions & Gaps

Read via `readBlock('.', 'decisions')` / `readBlock('.', 'issues')`, or `/workflow status` for a summary.
