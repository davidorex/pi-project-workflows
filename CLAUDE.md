# pi-project-workflows

Typed, multi-step workflow execution via `.workflow.yaml` specs. Schema-driven project state in `.project/`. Behavior monitors that classify agent activity and steer corrections.

Monorepo: npm packages under `packages/*` with lockstep versioning. Inspect `packages/` for the current set.

| Package | Purpose |
|---------|---------|
| `@davidorex/pi-context` | Substrate: block CRUD with AJV validation + DispatchContext attestation, schema-write surface, closure-table relations + lens primitives, config-driven substrate-dir resolution (`resolveContextDir`), query primitives (filter / resolve-bulk / walkDescendants / walkAncestors / findReferences), PM-lens module, `/project` command + tool surface |
| `@davidorex/pi-jit-agents` | Library (not extension). Agent spec compilation + in-process dispatch; the four boundary surfaces (load, compile, execute, introspect) per `docs/planning/jit-agents-spec.md` |
| `@davidorex/pi-workflows` | Workflow orchestration, agent dispatch, `/workflow` command, Nunjucks template + macros for block injection |
| `@davidorex/pi-behavior-monitors` | Autonomous monitors, classification (via phantom-tool pattern), steering |
| `@davidorex/pi-project-workflows` | Meta-package re-exporting the three Pi extensions |

## Commands

```bash
npm run build              # tsc compiles each package to dist/
npm test                   # all 4 packages; must stay at 0 failures
npm run check              # biome + tsc --noEmit (also runs as husky pre-commit + npm test)
npm run format             # biome format
npm run skills             # regen SKILL.md from built extensions (run after build)
npm run release:patch|minor|major   # lockstep bump + commit + tag
```

Derive project state at any time:
```bash
npx tsx -e "import{projectState}from'./packages/pi-context/src/project-sdk.js';console.log(JSON.stringify(projectState('.'),null,2))"
```

Project substrate to interactive HTML view (Pattern B build-step generation; static-baked output is self-contained + offline-portable + git-trackable):
```bash
npx tsx scripts/orchestrator/build-html-views.ts          # writes html-views/substrate-overview.html
npx tsx scripts/orchestrator/build-html-views.ts --dry-run # validate substrate readability + report stats
```

Re-run after any `.project/*.json` change to refresh the rendered view.

## Conventions

- ESM, TypeScript compiled via `tsc` to `dist/`. Pi loads `dist/index.js` from each package — runtime needs the build, not source.
- Cross-package imports use named subpath exports (e.g., `@davidorex/pi-context/block-api`). pi-context declares explicit `exports` in `package.json`; unlisted subpaths are not importable.
- Tests: `tsx --test` for pi-context / pi-jit-agents / pi-workflows; `vitest` for pi-behavior-monitors
- Biome: tab indent, 120-char lines, scoped per `biome.json` (`packages/*/src/**` + `scripts/**`). `biome.json` declares `vcs.useIgnoreFile: true` so nested `.claude/worktrees/*` configs don't trigger nested-root errors
- Husky pre-commit runs `npm run check && npm test`. Never `--no-verify`. Fix root cause + new commit on hook failure.
- GitHub Actions CI runs check + build + test on Node 22/23 for push/PR to main
- SKILL.md is generated build artifact (`npm run skills`) — do not edit by hand. Edit `skill-narrative.md` instead; uses YAML frontmatter + XML-tagged sections (no markdown headings).
- Lockstep versioning via `npm run release:*` invoking `scripts/bump-versions.js` (direct JSON read/write per package.json; never `npm version -ws` directly — fails 0.x minor/major bumps)
- **Orchestrator scripts dual-surface** (DEC-0019/0020): `scripts/orchestrator/*.ts` are Claude Code-side ergonomics wrappers over the same block-api / project-sdk library that in-pi harness-confined agents consume via Pi-registered tools. New substrate op = library + Pi tool + CLI script as a unit. Use canonical composer scripts (`compile-*-context.ts` / `compile-task-context.ts` / `inject-context-items.ts` / `file-block-item.ts`) — hand-authored briefs forbidden. Substrate-projection script `build-html-views.ts` reads `.project/*.json` via canonical pi-context block-api + emits self-contained HTML view at `html-views/substrate-overview.html`.
- Dispatch artifacts live under gitignored `compiled-contexts/` (orchestrator-composed agent input + agent-written reports). Project-root `tmp/` is also gitignored for ad-hoc scratch.

## Completion Sequence (mandatory after every code change)

Work is not complete until the runtime can load it. Pi loads from `dist/`, not source. Every code change follows the full sequence:

1. **Edit** source files
2. **Build**: `npm run build`
3. **Check**: `npm run check` (biome + tsc)
4. **Test**: `npm test` — full output inspection, no pipe-to-tail (pipe masks exit code)
5. **Runtime demonstration** (DEC-0018): exercise the actual feature path end-to-end via real invocation (tsx eval against block-api / pi -p tool dispatch / direct CLI invocation against real substrate). NOT a mocked unit assertion. Tests-pass alone is insufficient.
6. **Adversarial verification probe** (DEC-0018): fresh-context agent (or grep when sufficient) probes for false-pass scenarios. Probe verdict required before commit declared green.
7. **Skills**: `npm run skills` (regen SKILL.md)
8. **Commit**: forensic message per global CLAUDE.md guidelines
9. **Status cascade across 3 layers**: Claude Code Tasks + `.project/` blocks (TASK/FGAP/VER) + HANDOFF.md
10. **Merge to main**: if on a feature branch
11. **Release**: `npm run release:patch|minor|major` based on commit type
12. **Credentialed verification (pre-publish for arc-completion releases)**: run the canonical verification protocol at `docs/reports/pi-internal-verification-protocol-2026-05-02.md` (or successor) when the release ships new public surface; uses pi's `auth.json` directly (no separate env-var gate). Routine bumps don't require this — build/check/test catches breakage there.
13. **Publish**: requires interactive `npm login` + OTP — user action

Steps 1-10 are the agent's responsibility. Step 12 applies to arc-completion releases only. Step 13 requires user action. Declaring work "done" before step 10 is a failure.

**Steps 5+6 are LOAD-BEARING** (DEC-0018): every implementation step requires runtime demo + adversarial probe. Tests-pass is necessary, not sufficient — LLMs perform; tests pass for the wrong reason (side-effect masks feature; assertion no longer tests what it claims; import silently no-ops; fallback swallows failure).

## Do Not Touch

- **`.pi/`**: user's runtime testing directory. Never create / modify / delete files there.
- **`docs/`**: gitignored planning docs. Read-only reference.

## Source Layout

Each package lives in `packages/<name>/` with source in `src/` (or root for pi-behavior-monitors). Read the package's JSDoc / type definitions / `src/index.ts` re-exports for the current surface — do not rely on enumerated file lists here as they go stale.

- **pi-context**: extension entry in `src/index.ts`; canonical surfaces in `block-api.ts` (writes), `schema-validator.ts` (AJV), `schema-write.ts` (schema-write surface), `schema-migrations.ts` (migration chain), `project-dir.ts` (`resolveContextDir` + path-builders; PROJECT_DIR/SCHEMAS_DIR @deprecated), `project-context.ts` (substrate SDK + closure-table primitives), `lens-view.ts` (lens projections + traversal wrappers), `project-sdk.ts` (state + discovery + validation), `roadmap-plan.ts` (PM lens), `lens-validator.ts` (register/dispatch), `execution-context.ts` (gather-execution-context — Phase 3 in flight). `schemas/` ships framework schemas; `samples/` (conception.json + schemas/ + blocks/) ships the packaged conception = the user-installable catalog (DEC-0037; legacy `registry/`+`defaults/` unshipped, on-disk fixtures only per FGAP-087)
- **pi-jit-agents** (library, not extension): boundary surfaces per `docs/planning/jit-agents-spec.md` — `agent-spec.ts` (load), `compile.ts` (compile + contextBlocks injection), `jit-runtime.ts` (execute + `normalizeToolChoice` provider shape normalization at dispatch boundary), `introspect.ts` (contract projection). `schemas/verdict.schema.json` is the phantom-tool classification contract
- **pi-workflows**: extension entry in `src/index.ts`; `workflow-sdk.ts` (queryable surface), `workflow-executor.ts` (orchestration), `workflow-spec.ts` (YAML + STEP_TYPES registry), `expression.ts` (`${{ }}` eval + filters), `dispatch.ts` (subprocess spawn), `dag.ts` (planner), `step-*.ts` (one per step type). `templates/shared/macros.md` carries per-block-kind Nunjucks rendering macros (FGAP-037 tracks pending macros)
- **pi-behavior-monitors**: single-file extension `index.ts`; `agents/*.agent.yaml` (bundled classifiers); `examples/` (monitor specs + Nunjucks prompt templates per monitor)

## Workflow SDK (`packages/pi-workflows/src/workflow-sdk.ts`)

Single queryable surface for the workflow extension. All functions derive from code registries + filesystem — add a filter / agent / template / schema and it appears automatically.

- **Vocabulary**: `stepTypes()`, `filterNames()`, `expressionRoots()`, `validationChecks()`
- **Discovery**: `availableAgents(cwd)`, `availableWorkflows(cwd)`, `availableTemplates(cwd)`, `availableSchemas(cwd)`
- **Contracts**: `agentContracts(cwd)` — per-agent inputSchema + contextBlocks + output; `agentsByBlock(cwd, blockName)`
- **Introspection**: `extractExpressions(spec)`, `declaredSteps(spec)`, `declaredAgentRefs(spec)`, `declaredMonitorRefs(spec)`, `declaredSchemaRefs(spec)`
- **Validation**: `validateWorkflow(spec, cwd)` — agent + monitor + schema + step + filter + StepType metadata + contextBlocks + template-input alignment. Returns `{ status, issues[] }`. Surfaced as `/workflow validate [name]`.

Use `/workflow status` for derived state in conversation.

## Project SDK (`packages/pi-context/src/project-sdk.ts`)

Single queryable surface for project state, block discovery, schema vocabulary, cross-block validation.

- **Vocabulary**: `schemaVocabulary(cwd)`, `schemaInfo(cwd, name)`, `PROJECT_BLOCK_TYPES`
- **Discovery**: `availableBlocks(cwd)`, `availableSchemas(cwd)`, `findAppendableBlocks(cwd)`, `blockStructure(cwd)`
- **Derived state**: `projectState(cwd)`
- **Validation**: `validateProject(cwd)` — cross-block referential integrity + lens-validator dispatch
- **Query primitives**: `filterBlockItems(cwd, blockName, predicate)`, `resolveItemById(cwd, id)`, `resolveItemsByIds(cwd, ids)`
- **Lens-view consumption** (via `lens-view.ts`): `loadLensView`, `renderLensView`, `buildCurationSuggestions`, `validateProjectRelations`, `edgesForLensByName`, `walkLensDescendants`, `walkAncestorsByLens`, `findReferencesInRepo`
- **Closure-table primitives** (via `project-context.ts`): `walkDescendants`, `walkAncestors`, `findReferences`, `loadRelations`, `edgesForLens`, `resolveComposition`
- **PM-lens** (via `roadmap-plan.ts`): `loadRoadmap`, `listRoadmaps`, `validateRoadmaps`, `renderRoadmap`
- **Write surfaces** (via `block-api.ts`): 8 `.project/`-targeting primitives wrapping 8 typed-file primitives operating on arbitrary `(filePath, schemaPath)` pairs; all writes accept optional `DispatchContext` for authorship attestation
- **Schema-write** (via `schema-write.ts`): `writeSchema` / `updateSchema` / `readSchema` with AJV meta-validation
- **Schema migration** (via `schema-migrations.ts`): per-schema version-to-version transitions
- **Substrate-dir resolution** (via `project-dir.ts`): `resolveContextDir(cwd)` hard-throws on absent `.pi-context.json`; `writeBootstrapPointer(cwd, contextDir)` for fresh-repo bootstrap; path-builders cascade through resolver
- **Execution-context** (via `execution-context.ts` — Phase 3 in flight): `gatherExecutionContext(cwd, args)` composes ContextBundle per declared context-contract for the unit-kind

Use `/project status` for derived state in conversation.

## Project Blocks (`.project/`)

Typed JSON files with schemas. Substrate writes via block-api primitives (validated + DispatchContext-stamped). Direct `Edit` / `Write` on `.project/*.json` is forbidden (F-006). `pi -p "call append-block-item"` is registered but effectively retired (last 2026-04-25); do not use.

**Canonical filing patterns** (per precedent archaeology `analysis/2026-05-14-substrate-filing-precedents.md`):

- **Append** (new item): write JSON to `/tmp/<id>.json` heredoc, then
  ```bash
  npx tsx scripts/orchestrator/file-block-item.ts \
    --block <name> --writer human:davidryan@gmail.com --auto-id --item @/tmp/<id>.json
  ```
  Use `--show-schema` first when unfamiliar with the block's required fields; `--dry-run` to validate without writing.
- **Status mutation / field update**: `npx tsx -e` with `updateItemInBlock` from `@davidorex/pi-context/block-api`. Pass `DispatchContext` for attestation stamping.
- **Separate Bash invocations per operation** — chained heredoc + mutate fails on string-termination (observed 2026-05-13). One write per Bash call.
- **Per-item dispatch:** each block-api write is one item; loops happen at the orchestrator level, not inside one tsx-eval invocation.

**Install ceremony** (per `/context init` future Phase 6; currently `/project` legacy). The canonical catalog is the packaged conception `packages/pi-context/samples/conception.json` (DEC-0037); legacy `registry/`+`defaults/` were dropped from the shipped `files[]` (retained on disk only as test fixtures, FGAP-087):
- `/project init <dir>` — bootstrap `.pi-context.json` pointer + substrate/schemas dirs only (no config, no defaults; DEC-0011)
- `/project accept-all` — adopt `samples/conception.json` as `config.json` (full vocabulary + `installed_*`, root-overridden, idempotent never-clobber); writes config only
- `/project install` — copies declared `installed_schemas[]`/`installed_blocks[]` from the samples catalog (`samples/schemas/` + `samples/blocks/`); `--update` overwrites
- Or hand-author `config.json`'s `installed_*` then `/project install`

**Block kinds**: query the samples catalog via the `read-samples-catalog` tool (or read `samples/conception.json` `block_kinds[]`) for the canonical set + descriptions. Each schema declares its array_key + required fields + ID pattern.

**Closure-table relations** (DEC-0013): `.project/relations.json` carries edges `{ parent, child, relation_type, ordinal? }` for ALL inter-item relationships. Per-edge `relation_type` registered in `config.relation_types[]`. FK-as-field on item schemas is forbidden.

**Schema versioning** ($id + version + $ref + migration registry): per-schema evolution; `validateBlockWithMigration` runs migrations when block file's `schema_version` differs from current.

## Key Architecture

Load-bearing architectural rules (not change-history):

- Each workflow step runs as a subprocess (`pi --mode json`) with its own context window. Main conversation is control plane; workflows are subordinate.
- DAG planner infers parallelism from `${{ steps.X }}` references and `context: [stepName]` declarations.
- Agent specs are `.agent.yaml` only (no `.md` fallback). Compiled to prompts via Nunjucks at dispatch time. Specs declare `inputSchema` (validated pre-spawn), `contextBlocks` (block names injected as `_<name>` into template context with framework anti-injection delimiters), `output.format`/`output.schema` (validated post-completion).
- `templates/shared/macros.md` provides one rendering macro per block kind. Agents import via `{% from "shared/macros.md" import render_<kind> %}`. Three-tier template search: project `.pi/templates/` > user `~/.pi/agent/monitors/` > package `examples/`.
- Monitor specs are `.monitor.json` with required `classify.agent` → `.agent.yaml` spec. Classify enforces structured output via the phantom tool pattern: forced `toolChoice` on a `VERDICT_TOOL` whose params match `verdict.schema.json` (CLEAN/FLAG/NEW). Forced-toolChoice shape is provider-specific; route through `normalizeToolChoice(api, toolName)` from `@davidorex/pi-jit-agents` — no hardcoded toolChoice shapes at consumer call sites. Forced tool-use unenforceable on `openai-responses` family + google providers (F-012).
- Monitor step type: workflows invoke monitors as verification gates via `monitor: <name>`. CLEAN → completed; FLAG/NEW → failed.
- `block:<name>` schema references resolve to `<contextDir>/schemas/<name>.schema.json` per the resolver — portable across substrate-dir names.
- State persisted atomically (tmp + rename) after each step. State write failure is fatal.
- Block artifact writes are fatal — schema-validation failure on a `.project/*.json` artifact fails the workflow. Non-block artifacts remain non-fatal. On resume, all steps are preserved; only artifact processing re-runs.
- Agent step JSON output validation is fatal — declared `output.format: json` or `output.schema` must be honored; markdown-fenced JSON fails.
- Agent step `context: string[]` inlines prior step `textOutput` into dispatch prompt as labeled markdown sections.
- Agent output instructions tell agents: "raw JSON only, no markdown fences." File-write is secondary; most JSON-producing agents lack write tools — textOutput is the only output channel.
- `invokeMonitor(name, context?)` export from pi-behavior-monitors enables programmatic classification without `activate()` side effects.
- `completion` field controls post-workflow message to main LLM. Fires only on `state.status === "completed"`; failed workflows render via `formatResult()`.
- DispatchContext attestation: every block-api write accepts optional `ctx?: DispatchContext` with `WriterIdentity` (kinds: human / agent / monitor / workflow). When provided AND the target schema declares author fields, items are stamped per the schema's declared subset (per-field declaration honored; upsert pre-merge preserves attestation across replacement updates).
- Lens-validator dispatch: project-sdk's `validateProject` iterates `getLensValidators()`; lens modules register at module-init via `registerLensValidator({name, validate})`.
- Composition lens dispatch: LensSpec carries `kind: "target" | "composition"` + `members[]`; `resolveComposition` walks members with cycle detection; emits `composition_cycle_detected` on cycle.
- Monitor write-action routing through block-api: `executeWriteAction` routes findings via `appendToBlock` / `upsertItemInBlock` with `DispatchContext.writer = { kind: "monitor", monitor_name }`; side-car state via `writeTypedFile` / `appendToTypedFile`.
- Substrate consumption surface: `/project view <lensId>` renders lens projection as markdown; `/project lens-curate <lensId>` uses `pi.sendMessage` follow-up-turn pattern to surface uncategorized items + suggested calls — LLM curates via existing `append-block-item` tool.

## CLI Access from Other Agents

Pi tools accessible from any LLM with shell access via `pi -p "prompt" --mode json`. Subprocess loads all extensions, executes tool calls, returns newline-delimited JSON events. Same mechanism the workflow executor uses for step dispatch.

**Cost-control discipline** (F-006 mitigation, mandatory for write tools): the default openrouter model in pi config is agentic; unrestricted `pi -p "..." --no-skills` produces tool-call loops (observed: 15+ min silent hang on 6KB prompt). Always pin a fast non-agentic model + restrict tool surface unless write is required:

```bash
pi -p "..." --mode json --tools read --no-skills --model openrouter/anthropic/claude-haiku-4.5
```

For write tools, restrict to minimum (`--tools read,write` or omit `--tools` if prompt needs broader access); always retain `--model` pin. Wrap long invocations in `gtimeout 120 pi -p ...` so silent loops surface as exit codes.

To enumerate available tools at any time: query `/workflow status` + `/project status` or grep `pi.registerTool` across `packages/*/src/`.

## Design Decisions & Gaps

- DECs (architectural canon): `.project/decisions.json` — query via `readBlock` or `pi -p "call read-block with name decisions"` / `npx tsx scripts/orchestrator/extract-decs.ts`
- FGAPs (open framework gaps): `.project/framework-gaps.json` — query via `readBlock` or canonical script
- Tasks (in-flight + planned): `.project/tasks.json` — `status: in-progress` items are active focus
- Verifications (completion evidence): `.project/verification.json` — VER-NNN entries cite criteria_results per closed TASK

## Substrate authorship semantics

All substrate content — block items, schemas, analysis MDs, commit bodies, plan files, decompositions, acceptance criteria, ID ranges, sub-phase numbering, relation_type names, FGAP/DEC/TASK field text, etc. — is LLM-authored unless verbatim quoted from a user message. User authorization operates at the directive level (verbatim instructions to file / proceed / decide); the LLM composes content under that authorization.

Filed substrate carries user filing-authority. It is the **working baseline** — reviewable against verbatim user-message direction at the point of action when re-anchoring matters, never invalidated wholesale. Do NOT pole-swing between treating filed content as "canonical-unquestionable" and "fabricated-untrustworthy". Steady state: working baseline + targeted review at the action point.

When archaeology (e.g. `claude-history` queries) distinguishes verbatim-user-directed content from LLM-composed-under-filing-authority content, report the distinction as targeted-review information for the user to anchor specific elements, not as baseline-discard. Never introduce authorship-archaeology unprompted in routine work; surface it when explicitly asked or when an action genuinely requires re-anchoring.
- Feedback (behavioral mandates): `~/.claude/projects/-Users-david-Projects-workflowsPiExtension/memory/feedback_*.md` — indexed by MEMORY.md; binding, not suggestion
