# pi-project-workflows

Typed, multi-step workflow execution via `.workflow.yaml` specs. Schema-driven project state in `.project/`. Behavior monitors that classify agent activity and steer corrections.

Monorepo: npm packages under `packages/*` with lockstep versioning. Inspect `packages/` for the current set; count and names are derivable.

| Package | Purpose |
|---------|---------|
| `@davidorex/pi-context` | Block CRUD, schema validation, `/project` command, install ceremony, lens primitives, PM-lens module, schema-write surface, DispatchContext authorship attestation, typed-file primitives |
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
npx tsx -e "import{projectState}from'./packages/pi-context/src/project-sdk.js';console.log(JSON.stringify(projectState('.'),null,2))"

# Query SDK vocabulary and discovery (step types, filters, agents, workflows, etc.)
npx tsx -e "import * as sdk from'./packages/pi-workflows/src/workflow-sdk.js';console.log('Steps:',sdk.stepTypes().map(t=>t.name));console.log('Filters:',sdk.filterNames());console.log('Agents:',sdk.availableAgents('.').map(a=>a.name));console.log('Workflows:',sdk.availableWorkflows('.').map(w=>w.name))"
```

## Conventions

- ESM, TypeScript compiled via `tsc` to `dist/`. Pi loads `dist/index.js` from each package.
- Cross-package imports use named subpath exports (e.g., `@davidorex/pi-context/block-api`). pi-context defines explicit exports in package.json — unlisted subpaths are not importable.
- Tests: `tsx --test` for pi-context, pi-jit-agents, and pi-workflows; `vitest` for pi-behavior-monitors
- Biome linting: tab indent, 120-char lines, scoped per `biome.json` (`packages/*/src/**` + `scripts/**`); version pinned in root `package.json` devDependencies. `npm run lint` / `npm run format`. `biome.json` declares `vcs.useIgnoreFile: true` so nested `.claude/worktrees/*` configs do not trigger nested-root errors
- Husky pre-commit hook runs `npm run check` (biome + tsc --noEmit) before every commit
- GitHub Actions CI runs check + build + test on Node 22/23 for push/PR to main
- SKILL.md files are generated build artifacts (`npm run skills`) — do not edit by hand. Edit `skill-narrative.md` for behavioral documentation. Narratives must use YAML frontmatter (`name`, `description` with trigger conditions) and XML tags for sections (no markdown headings). See pi-behavior-monitors/skill-narrative.md as the canonical reference. The generator emits YAML frontmatter, XML-tagged tool/command/resource sections, vocabulary tables, then appends the narrative body. Resource listings go to `references/bundled-resources.md` (progressive disclosure).
- Lockstep versioning: all packages share a version. Use `npm run release:patch`, `release:minor`, or `release:major` from root. These call `scripts/bump-versions.js` which bumps all package.json files directly via JSON read/write then syncs inter-package dependency references — never use `npm version -ws` directly (it fails on 0.x minor/major bumps because npm runs peer dep resolution between bumping versions and syncing cross-refs).
- **Orchestrator scripts dual-surface pattern** (per DEC-0014/0016): `scripts/orchestrator/*.ts` are Claude-Code-side ergonomics wrappers over the same block-api library that in-pi harness-confined agents consume via Pi-registered tools. Two consumer surfaces, shared library — new substrate ops add library + Pi tool + CLI script as a unit. Current scripts: `extract-mandates.ts` / `extract-decs.ts` / `extract-feedback.ts` / `build-subagent-preamble.ts` (preamble composer) / `file-block-item.ts` (schema-aware substrate filing with --show-schema, --auto-id, --dry-run, --writer). Use `file-block-item.ts` for FGAP/DEC/issue/task filings instead of hand-constructed tsx eval.

## Completion Sequence (mandatory after every code change)

Work is not complete until the runtime can load it. Pi loads extensions from `node_modules` via `dist/`, not from source. Every code change must follow this full sequence — no step is optional or deferred:

1. **Edit** source files
2. **Build**: `npm run build`
3. **Check**: `npm run check` (biome + tsc)
4. **Test**: `npm test` (must stay at 0 failures) — full output inspection, no pipe-to-tail (pipe masks exit code)
5. **Runtime demonstration** (DEC-0018): exercise the actual feature path end-to-end via real invocation (tsx eval against block-api / pi -p tool dispatch / direct CLI invocation against real substrate). NOT a mocked unit assertion. Capture command + observed output. Tests-pass alone is insufficient.
6. **Adversarial verification probe** (DEC-0018): fresh-context agent (Explore or general-purpose) reads implementation + runtime demo + probes for false-pass scenarios (assertion exercises right path? bypass via fallback? indirect import chain reaches new surface despite no-cascade classification?). Probe verdict required before commit declared green.
7. **Skills**: `npm run skills` (regenerate SKILL.md from built extensions)
8. **Commit**: forensic commit message per global CLAUDE.md guidelines
9. **Status cascade across 3 layers** (Claude Code Tasks + .project/ blocks + HANDOFF.md): include runtime-demo result + adversarial verdict, not just commit SHA + test exit code
10. **Merge to main**: if on a feature branch
11. **Release**: `npm run release:patch|minor|major` based on commit type (`fix:` → patch, `feat:` → minor, `feat!:` → major). This bumps versions, commits, and tags.
12. **Credentialed verification (pre-publish for arc-completion releases)**: for releases that ship new public surface (new SDK exports, new commands, new tools, new schema kinds) or complete a substrate arc, run the canonical verification protocol at `docs/reports/pi-internal-verification-protocol-2026-05-02.md` (or its successor) end-to-end. The protocol uses pi's `auth.json` credentials directly (set up by `pi auth login`); no separate env-var gate. Routine peer-dep bumps and isolated bug-fix releases do not require this gate — the build/check/test sequence catches breakage from there. The previous `jit-runtime.smoke.test.ts` gate was retired in commit `d931dc4` per DEC-0011 (parallel-credential-surface removal); see `feedback_pre_publish_credentialed_smoke.md` for the current rule.
13. **Publish**: requires interactive `npm login` + OTP — inform user to run `npm publish --workspaces --access public`

Steps 1-10 are the agent's responsibility. Step 12 applies to arc-completion releases only; user runs the verification protocol when scope warrants. Step 13 requires user action. Declaring work "done" before step 10 is a failure — the changes are unreachable at runtime AND/OR not yet intent-confirmed per DEC-0018.

**Steps 5+6 are LOAD-BEARING** (DEC-0018 enacted 2026-05-10): every implementation step (sub-section / sub-phase / fix / feature commit) requires runtime demonstration + adversarial probe. NOT skippable for "small change" or "obvious correctness." Tests-pass is necessary, not sufficient — LLMs perform; tests can pass for the wrong reason (side-effect masks feature path; assertion no longer tests what it claims; import silently no-ops; fallback swallows failure). The ff13ff2 incident (committed broken code under false-green pipe-mask) is the forcing event.

## Do Not Touch

- **`.pi/` directory**: User's runtime testing directory. Never create, modify, or delete files there.
- **`docs/` directory**: Gitignored planning docs. Read-only reference.

## Source Layout

Each package lives in `packages/<name>/` with source in `src/` (or root for pi-behavior-monitors).

**pi-context** (`packages/pi-context/src/`):
- `index.ts` — extension entry point (tools, commands, subcommands)
- `block-api.ts` — centralized block I/O with write-time AJV validation; 8 .project/-targeting primitives are thin wrappers over 8 typed-file primitives (writeTypedFile, appendToTypedFile, updateItemInTypedFile, upsertItemInTypedFile, removeFromTypedFile, appendToNestedTypedFile, updateNestedItemInTypedFile, removeFromNestedTypedFile) operating on arbitrary `(filePath, schemaPath)` pairs
- `dispatch-context.ts` — `WriterIdentity` discriminated union + `DispatchContext` interface + `stampItem` helper (per-field-aware authorship attestation per FGAP-004 closure)
- `schema-validator.ts` — AJV-based JSON Schema validation; pre-registers 8 framework schemas at instance construction; `$id`-cache-aware `validate()`; `validateBlockWithMigration` helper
- `schema-write.ts` — `writeSchema`/`updateSchema`/`readSchema` with AJV meta-schema validation (canonical schema-write surface per FGAP-011 closure)
- `schema-migrations.ts` — `MigrationRegistry` + `runMigrations` chain for per-schema version-to-version transitions (FGAP-006 closure)
- `project-context.ts` — substrate SDK: ConfigBlock + RelationTypeDecl + LensSpec types; loadConfig / loadRelations / getProjectContext (mtime cache) / validateRelations (with edge_cycle_detected) / edgesForLens / walkDescendants / groupByLens / displayName / listUncategorized / resolveComposition (composition lens dispatch with cycle detection per FGAP-012 closure)
- `lens-view.ts` — 6 pure functions wrapping the substrate SDK for /project view + /project lens-curate consumption: loadLensView, renderLensView, buildCurationSuggestions, validateProjectRelations, edgesForLensByName, walkLensDescendants
- `lens-validator.ts` — register/get pattern for lens-validator dispatch (Step 7); roadmap-plan registers at module-init via `registerLensValidator({name:"roadmap", validate})`; project-sdk's validateProject iterates `getLensValidators()` rather than hardcoded import
- `roadmap-plan.ts` — PM-lens module (Task #9 / Step 7): RoadmapSpec/PhaseSpec/MilestoneSpec/RoadmapView types; loadRoadmap/listRoadmaps/validateRoadmaps/renderRoadmap; topoSort + rollupPhaseStatus + STATUS_VOCABULARY_DEFAULTS + resolveStatusVocabulary (config.status_buckets merge); diagMessage (config.display_strings resolution); 7 diagnostic codes; pure-textual markdown renderer (no fabricated mermaid)
- `project-sdk.ts` — SDK: vocabulary, discovery, derived state, cross-block validation; iterates lens-validator dispatch
- `project-dir.ts` — `PROJECT_DIR` and `SCHEMAS_DIR` constants
- `block-validation.ts` — post-step block validation: snapshot `.project/*.json` before step, validate after, rollback on failure
- `update-check.ts` — non-blocking npm registry check
- `schemas/` — 8 framework schemas (config, relations + 6 shared enums: priority, status, severity, source, layer, verification-method); each carries `$id` (`pi-context://schemas/<name>`) + `version: "1.0.0"` per FGAP-006
- `registry/schemas/` — 15 user-installable schemas (architecture, audit, conformance-reference, decisions, domain, handoff, issues, phase, plan, project, rationale, requirements, roadmap, tasks, verification); each with `$id`+`version` post-Step-5.1; 3 $ref consolidations to shared enums where vocabularies align
- `registry/blocks/` — 9 starter block files for `/project install` opt-in

**pi-jit-agents** (`packages/pi-jit-agents/src/`) — library package, not a Pi extension. Owns the four boundary surfaces (load, compile, execute, introspect) per `docs/planning/jit-agents-spec.md`:
- `index.ts` — barrel re-exports for all public API
- `types.ts` — `AgentSpec` (with `loadedFrom`), `CompileContext`, `DispatchContext`, `JitAgentResult`, `AgentContract`
- `errors.ts` — `AgentNotFoundError`, `AgentParseError`, `AgentCompileError`, `AgentDispatchError`
- `agent-spec.ts` — `parseAgentYaml` (fully resolves relative paths per D1), `createAgentLoader` (three-tier discovery per D7: `.project/agents/` → `~/.pi/agent/agents/` → consumer builtin; does NOT search `.pi/agents/` per D3)
- `template.ts` — `createTemplateEnv`, `renderTemplate`, `renderTemplateFile` (three-tier search, workflow `${{ }}` expression protection, no `.pi/` reads per D3)
- `compile.ts` — `compileAgent` (renders system + task templates, injects `contextBlocks` from `.project/` via pi-context `readBlock`, wraps injected block content in framework-level anti-injection delimiters)
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

## Project SDK (`packages/pi-context/src/project-sdk.ts`)

Single queryable surface for project state, block discovery, schema vocabulary, and cross-block validation.

- **Vocabulary**: `schemaVocabulary(cwd)`, `schemaInfo(cwd, name)`, `PROJECT_BLOCK_TYPES`
- **Discovery**: `availableBlocks(cwd)`, `availableSchemas(cwd)`, `findAppendableBlocks(cwd)`, `blockStructure(cwd)`
- **Derived state**: `projectState(cwd)` — all project metrics computed at query time
- **Validation**: `validateProject(cwd)` — cross-block referential integrity + iterates registered lens-validators (e.g. roadmap diagnostics from roadmap-plan's module-init `registerLensValidator` call); returns `{ status, issues[] }` where status is `"clean" | "warnings" | "invalid"`. Also available as `/project validate`.
- **Lens-view consumption** (via `lens-view.ts`): `loadLensView(cwd, lensId)`, `renderLensView(view, naming)`, `buildCurationSuggestions(view)`, `validateProjectRelations(cwd)`, `edgesForLensByName(cwd, lensId)`, `walkLensDescendants(cwd, parentId, relationType)` — surfaced via `/project view <lensId>`, `/project lens-curate <lensId>`, and 3 substrate pi tools (project-validate-relations, project-edges-for-lens, project-walk-descendants)
- **PM-lens consumption** (via `roadmap-plan.ts`): `loadRoadmap(cwd, roadmapId)`, `listRoadmaps(cwd)`, `validateRoadmaps(cwd)`, `renderRoadmap(view, naming)` — surfaced via `/project roadmap-list|view|validate` and 4 pi tools (project-roadmap-load/render/validate/list)
- **Composition lens dispatch** (via `project-context.ts`): `resolveComposition(cwd, lens)` walks `lens.members[]` for `kind: "composition"` lenses; emits `composition_cycle_detected` on cycle (FGAP-012 closure surface)
- **Substrate write surfaces** (via `block-api.ts`): 8 .project/-targeting primitives + 8 typed-file primitives; all writes carry optional `DispatchContext` for authorship attestation (FGAP-004 closure)
- **Schema-write** (via `schema-write.ts`): `writeSchema`/`updateSchema`/`readSchema` with AJV meta-schema validation (FGAP-011 closure)
- **Schema migration** (via `schema-migrations.ts`): per-schema version-to-version transitions (FGAP-006 closure)

Use `/project status` to see derived state in conversation.

## Project Blocks (`.project/`)

Typed JSON files with schemas. Use `writeBlock()`/`appendToBlock()`/`updateItemInBlock()`/`upsertItemInBlock()`/etc. from `packages/pi-context/src/block-api.ts` for validated writes — schema validation + DispatchContext authorship stamping are automatic when ctx provided.

**Install ceremony** (DEC-0011 enactment / Step 5):
- `/project init` — minimal directory creation + bootstrap `.project/config.json` skeleton (NOT auto-installing schemas/blocks any more)
- Edit `.project/config.json` to declare `installed_schemas[]` + `installed_blocks[]` from the catalog
- `/project install` — copies declared assets from `packages/pi-context/registry/{schemas,blocks}/` into `.project/`
- `/project install --update` — overwrites destinations; default skip-if-exists is idempotent

**Available block kinds** (from `packages/pi-context/registry/`):
- **project** — identity, vision, goals, constraints, scope, status
- **decisions** — choices with rationale, status (open/enacted/superseded), phase association
- **issues** — open items with priority, category, resolution tracking (GitHub issue pattern)
- **rationale** — design rationale with decision cross-references
- **requirements** — functional/non-functional with MoSCoW priority and lifecycle states
- **architecture** — modules, patterns, boundaries
- **tasks** — standalone task registry with status lifecycle and phase linkage
- **conformance-reference** — executable code conventions with check methods/patterns
- **audit** — structured audit results from running conformance checks
- **domain** — research findings, reference material, domain rules
- **verification** — completion evidence per task/phase/requirement
- **handoff** — session context snapshot
- **phase** — phase records (consumed by roadmap-plan)
- **plan** — plan records with status + phase ordering
- **roadmap** — roadmap records with phases[], milestones[], lens-projection per phase

**Closure-table relations** (DEC-0009): `.project/relations.json` carries edges `{ parent, child, relation_type, ordinal? }` for hierarchical decomposition + cross-block linking. Per-edge relation_type registered in `config.relation_types[]`. Closure-table is the canonical primitive for ALL inter-item relationships per DEC-0013 (edges-only authoring).

All schemas are user-customizable. Edit `.project/schemas/*.schema.json` to add fields or restructure — no code changes needed. Schema versioning ($id + version + $ref + migration registry per FGAP-006) supports per-schema evolution; `validateBlockWithMigration` runs migrations before validation when block file's `schema_version` differs from current.

## Key Architecture

- Each workflow step runs as a subprocess (`pi --mode json`) with its own context window
- Main conversation is the control plane; workflows are subordinate
- DAG planner infers parallelism from `${{ steps.X }}` references and `context: [stepName]` declarations
- Agent specs are `.agent.yaml` only (no `.md` fallback). Compiled to prompts via Nunjucks at dispatch time. Agents declare `inputSchema` (validated at dispatch before subprocess spawn — step fails immediately on mismatch), `contextBlocks` (block names to inject into template context), and `output.format`/`output.schema` (validated after subprocess completes).
- `contextBlocks: [conventions, requirements, conformance-reference]` on an agent YAML causes `compileAgentSpec()` to read each named block from `.project/` and inject it into the Nunjucks template context as `_<name>` (hyphens become underscores). Templates access via `{{ _conventions.rules }}` or `{% from "shared/macros.md" import render_conventions %}{{ render_conventions(_conventions) }}`. Missing blocks are `null`; no `.project/` skips injection. This is how project state flows into agent prompts.
- `templates/shared/macros.md` provides one rendering macro per block schema. Agents import them via `{% from "shared/macros.md" import render_conventions %}`. Resolved via three-tier template search — users override in `.pi/templates/`.
- Monitor specs are `.monitor.json` with required `classify.agent` referencing a `.agent.yaml` spec. The classify call uses the agent spec compilation pipeline (`compileAgentSpec()`, `createAgentLoader()`) and enforces structured output via the phantom tool pattern: a `VERDICT_TOOL` with TypeBox parameters is passed in `Context.tools` with forced `toolChoice` — the LLM produces `ToolCall.arguments` matching `verdict.schema.json` (CLEAN/FLAG/NEW enum). No text parsing, no JSON.parse of free-form output. The forced-toolChoice shape is provider-specific; both `executeAgent` and `classifyViaAgent` route through `normalizeToolChoice(api, toolName)` from `@davidorex/pi-jit-agents` so the right shape reaches each driver (OpenAI for `openai-completions`, Anthropic for `anthropic`, Bedrock for `bedrock-converse-stream`; throws on `openai-responses` family and google providers because forced tool-use is unenforceable on those routes). Collectors populate the template context (same role as `contextBlocks` for workflow agents). The agent's `model:` field selects the dispatch route — bundled classifiers route through openrouter; thinking is force-disabled at classify regardless of YAML setting. The TypeBox `Type` constructor is re-exported by `@earendil-works/pi-ai`; no direct `@sinclair/typebox` import in three of our packages (pi-context imports `typebox` directly). Template search: project `.pi/monitors/` > user `~/.pi/agent/monitors/` > package `examples/`.
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
- DispatchContext (FGAP-004 closure): every block-api write function accepts optional `ctx?: DispatchContext` carrying `WriterIdentity` (kinds: human / agent / monitor / workflow); when provided AND the target schema declares author fields, items are stamped with `created_by`/`created_at`/`modified_by`/`modified_at` per the schema's declared subset (per-field declaration honoring per Step 3.1 fix; upsert pre-merge per Step 6.2 preserves attestation across replacement updates)
- Lens-validator dispatch (Step 7): project-sdk's `validateProject` iterates `getLensValidators()` from `lens-validator.ts`; lens modules (e.g. roadmap-plan) register at module-init via `registerLensValidator({name, validate})`; new lens modules add validators without modifying project-sdk
- Composition lens dispatch (FGAP-012 closure): LensSpec extended with `kind: "target" | "composition"` + `members[]`; `resolveComposition(cwd, lens)` walks members + detects cycles via visited-set; emits `composition_cycle_detected` on cycle; `loadLensView` dispatches on lens.kind
- Monitor write-action routing through block-api (issue-065 closure / Step 6): `executeWriteAction` routes monitor findings via `appendToBlock` / `upsertItemInBlock` with `DispatchContext.writer = { kind: "monitor", monitor_name }`; `MonitorAction.write` shape is `{ block, array_field, merge, template }` (was `{ path, schema, ... }`); side-car state writes (instructions, learned patterns) route through `writeTypedFile` / `appendToTypedFile` against `monitor-{instruction,pattern}-list.schema.json` framework schemas
- Substrate consumption surface (Step 5): `/project view <lensId>` renders a lens projection as markdown; `/project lens-curate <lensId>` uses `pi.sendMessage` follow-up-turn pattern to surface uncategorized items + suggested append-block-item calls; LLM curates via existing append-block-item tool — no new write surface introduced
- pi-mono peer-deps (Step 7.5): all 4 packages declare `@earendil-works/pi-{ai,coding-agent,tui}: ^0.74.0` per upstream namespace migration (was `@mariozechner/*` `^0.70.2`); audit confirmed zero-breaking-impact across the 0.70 → 0.74 span (xiaomi/Gemini/reasoningEffortMap removed surfaces all unconsumed)

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
