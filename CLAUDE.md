# pi-project-workflows

Typed, multi-step workflow execution via `.workflow.yaml` specs. Schema-driven project state via pi-context. Behavior monitors that classify agent activity and steer corrections.

Monorepo: npm packages under `packages/*` with lockstep versioning. `ls -d packages/*/` for the set; each `packages/<name>/package.json` `description` + `src/index.ts` re-exports (root for pi-behavior-monitors) for its surface. `pi-project-workflows` is the meta-package re-exporting the Pi extensions; `pi-jit-agents` is a library, not an extension.

# establishing and maintaining context for this project using pi-context

Read `packages/pi-context/skills/pi-context/SKILL.md` — the generated reference for the full pi-context tool + command surface - to establish understanding of pi-context.

Run  
`npx tsx -e "import {listSubstrates} from '@davidorex/pi-context'; console.log(listSubstrates('.'))"` to see the list of available context substrates.

Substrates can be switched (like switching git branches). Switching flips the active-substrate pointer in `.pi-context.json`; subsequent reads/writes target the newly-active substrate. Pass the target substrate name (from the `listSubstrates` output above) as the second argument:

```bash
npx tsx -e "import {flipBootstrapPointer} from '@davidorex/pi-context/context-dir'; flipBootstrapPointer('.', '<target-substrate-dir>', 'human:davidryan@gmail.com')"
```

Replace `<target-substrate-dir>` with the substrate to activate, e.g. `.context` or `.context-jit-spec-v2`. The third argument is the writer identity stamped on the switch.

## Commands

```bash
npm run build              # tsc compiles each package to dist/
npm test                   # all 4 packages; must stay at 0 failures
npm run check              # biome + tsc --noEmit (also runs as husky pre-commit + npm test)
npm run format             # biome format
npm run skills             # regen SKILL.md from built extensions (run after build)
npm run release:patch|minor|major   # lockstep bump + commit + tag
```

Derive context state at any time. `contextState('.')` reads the currently-active substrate (whichever `.pi-context.json` points at). To inspect a different substrate, switch to it first (see switch command above), then run:
```bash
npx tsx -e "import {contextState} from '@davidorex/pi-context/context-sdk'; console.log(JSON.stringify(contextState('.'), null, 2))"
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
- **Orchestrator scripts dual-surface**: `scripts/orchestrator/*.ts` are Claude Code-side ergonomics wrappers over the same block-api / context-sdk library that in-pi harness-confined agents consume via Pi-registered tools. New substrate op = library + Pi tool + CLI script as a unit. Use canonical composer scripts (`compile-*-context.ts` / `compile-task-context.ts` / `inject-context-items.ts` / `file-block-item.ts`) — hand-authored briefs forbidden. Substrate-projection script `build-html-views.ts` reads `.project/*.json` via canonical pi-context block-api + emits self-contained HTML view at `html-views/substrate-overview.html`.
- Dispatch artifacts live under gitignored `compiled-contexts/` (orchestrator-composed agent input + agent-written reports). Project-root `tmp/` is also gitignored for ad-hoc scratch.

## Completion Sequence (mandatory after every code change)

Work is not complete until the runtime can load it. Pi loads from `dist/`, not source. Every code change follows the full sequence:

1. **Edit** source files
2. **Build**: `npm run build`
3. **Check**: `npm run check` (biome + tsc)
4. **Test**: `npm test` — full output inspection, no pipe-to-tail (pipe masks exit code)
5. **Runtime demonstration**: exercise the actual feature path end-to-end via real invocation (tsx eval against block-api / pi -p tool dispatch / direct CLI invocation against real substrate). NOT a mocked unit assertion. Tests-pass alone is insufficient.
6. **Adversarial verification probe**: fresh-context agent (or grep when sufficient) probes for false-pass scenarios. Probe verdict required before commit declared green. **Both the adversarial agent and the orchestrator's own probe can under-flag** — each constructs only the cases it thought of, so neither alone is sufficient: the orchestrator independently re-verifies the audit's load-bearing claims (don't relay a verdict), and the audit independently re-derives the orchestrator's. When either finds a defect, fixing it does NOT inherit the prior green — **a fix to any audit/probe finding requires a FRESH re-audit of the fix** (a CRITICAL especially), because the fix can introduce its own defect or close only the reported instance of a class. Loop fix→re-verify→re-audit until a pass finds nothing new.
7. **Skills**: `npm run skills` (regen SKILL.md)
8. **Commit**: forensic message per global CLAUDE.md guidelines
9. **Status cascade across 3 layers**: Claude Code Tasks + `.project/` blocks (TASK/FGAP/VER) + HANDOFF.md
10. **Merge to main**: if on a feature branch
11. **Release**: `npm run release:patch|minor|major` based on commit type
12. **Credentialed verification (pre-publish for arc-completion releases)**: run the canonical verification protocol at `docs/reports/pi-internal-verification-protocol-2026-05-02.md` (or successor) when the release ships new public surface; uses pi's `auth.json` directly (no separate env-var gate). Routine bumps don't require this — build/check/test catches breakage there.
13. **Publish**: requires interactive `npm login` + OTP — user action

Steps 1-10 are the agent's responsibility. Step 12 applies to arc-completion releases only. Step 13 requires user action. Declaring work "done" before step 10 is a failure.

**Steps 5+6 are LOAD-BEARING**: every implementation step requires runtime demo + adversarial probe. Tests-pass is necessary, not sufficient — LLMs perform; tests pass for the wrong reason (side-effect masks feature; assertion no longer tests what it claims; import silently no-ops; fallback swallows failure).

## Do Not Touch

- **`.pi/`**: user's runtime testing directory. Never create / modify / delete files there.
- **`docs/`**: gitignored planning docs. Read-only reference.

## Workflow SDK

`packages/pi-workflows/src/workflow-sdk.ts` is the single queryable surface (vocabulary / discovery / contracts / introspection / validation), all derived from code + filesystem. Read its `src/index.ts` exports for the function set; use `/workflow status` for derived state in conversation.

## Context SDK

`packages/pi-context/src/context-sdk.ts` is the single queryable surface for project state, block discovery, schema vocabulary, and cross-block validation (it re-exports the lens-view / closure-table / PM-lens / write / schema-write / migration / dir-resolution / execution-context primitives). Read its `src/index.ts` exports for the function set; use `/context status` for derived state in conversation.

## Project Blocks (`.project/`)

Typed JSON files with schemas. Substrate writes via block-api primitives (validated + DispatchContext-stamped). Direct `Edit` / `Write` on `.project/*.json` is forbidden. `pi -p "call append-block-item"` is retired; do not use.

**Canonical filing patterns**:

- **Append** (new item): write JSON to `/tmp/<id>.json` heredoc, then
  ```bash
  npx tsx scripts/orchestrator/file-block-item.ts \
    --block <name> --writer human:davidryan@gmail.com --auto-id --item @/tmp/<id>.json
  ```
  Use `--show-schema` first when unfamiliar with the block's required fields; `--dry-run` to validate without writing.
- **Status mutation / field update**: `npx tsx -e` with `updateItemInBlock` from `@davidorex/pi-context/block-api`. Pass `DispatchContext` for attestation stamping.
- **Separate Bash invocations per operation** — one write per Bash call (chained heredoc + mutate fails on string-termination).
- **Per-item dispatch:** each block-api write is one item; loops happen at the orchestrator level, not inside one tsx-eval invocation.

**Install ceremony** (per `/context init`). The canonical catalog is the packaged conception `packages/pi-context/samples/conception.json`; legacy `registry/`+`defaults/` are unshipped on-disk test fixtures only:
- `/context init <dir>` — bootstrap `.pi-context.json` pointer + substrate/schemas dirs only (no config, no defaults)
- `/context accept-all` — adopt `samples/conception.json` as `config.json` (full vocabulary + `installed_*`, root-overridden, idempotent never-clobber); writes config only
- `/context install` — copies declared `installed_schemas[]`/`installed_blocks[]` from the samples catalog (`samples/schemas/` + `samples/blocks/`); `--update` overwrites
- Or hand-author `config.json`'s `installed_*` then `/context install`

**Block kinds**: query the samples catalog via the `read-samples-catalog` tool (or read `samples/conception.json` `block_kinds[]`) for the canonical set + descriptions. Each schema declares its array_key + required fields + ID pattern.

**Closure-table relations**: `.project/relations.json` carries edges `{ parent, child, relation_type, ordinal? }` for ALL inter-item relationships. Per-edge `relation_type` registered in `config.relation_types[]`. FK-as-field on item schemas is forbidden.

**Schema versioning** ($id + version + $ref + migration registry): per-schema evolution; `validateBlockWithMigration` runs migrations when block file's `schema_version` differs from current.

## Key Architecture

Load-bearing architectural rules (not change-history):

- Each workflow step runs as a subprocess (`pi --mode json`) with its own context window. Main conversation is control plane; workflows are subordinate.
- Agent specs are `.agent.yaml` only (no `.md` fallback). Compiled to prompts via Nunjucks at dispatch time. Specs declare `inputSchema` (validated pre-spawn), `contextBlocks` (block names injected as `_<name>` into template context with framework anti-injection delimiters), `output.format`/`output.schema` (validated post-completion).
- `templates/shared/macros.md` provides one rendering macro per block kind. Agents import via `{% from "shared/macros.md" import render_<kind> %}`. Three-tier template search: project `.pi/templates/` > user `~/.pi/agent/monitors/` > package `examples/`.
- Monitor specs are `.monitor.json` with required `classify.agent` → `.agent.yaml` spec. Classify enforces structured output via the phantom tool pattern: forced `toolChoice` on a `VERDICT_TOOL` whose params match `verdict.schema.json` (CLEAN/FLAG/NEW). Forced-toolChoice shape is provider-specific; route through `normalizeToolChoice(api, toolName)` from `@davidorex/pi-jit-agents` — no hardcoded toolChoice shapes at consumer call sites. Forced tool-use unenforceable on `openai-responses` family + google providers.
- Monitor step type: workflows invoke monitors as verification gates via `monitor: <name>`. CLEAN → completed; FLAG/NEW → failed.
- `block:<name>` schema references resolve to `<contextDir>/schemas/<name>.schema.json` per the resolver — portable across substrate-dir names.
- State persisted atomically (tmp + rename) after each step. State write failure is fatal.
- Block artifact writes are fatal — schema-validation failure on a `.project/*.json` artifact fails the workflow. Non-block artifacts remain non-fatal. On resume, all steps are preserved; only artifact processing re-runs.
- Agent step JSON output validation is fatal — declared `output.format: json` or `output.schema` must be honored; markdown-fenced JSON fails.
- Agent step `context: string[]` inlines prior step `textOutput` into dispatch prompt as labeled markdown sections.
- Agent output instructions tell agents: "raw JSON only, no markdown fences." File-write is secondary; most JSON-producing agents lack write tools — textOutput is the only output channel.
- `invokeMonitor(name, context?)` export from pi-behavior-monitors enables programmatic classification without `activate()` side effects.
- DispatchContext attestation: every block-api write accepts optional `ctx?: DispatchContext` with `WriterIdentity` (kinds: human / agent / monitor / workflow). When provided AND the target schema declares author fields, items are stamped per the schema's declared subset (per-field declaration honored; upsert pre-merge preserves attestation across replacement updates).

## CLI Access from Other Agents

Pi tools accessible from any LLM with shell access via `pi -p "prompt" --mode json`. Subprocess loads all extensions, executes tool calls, returns newline-delimited JSON events. Same mechanism the workflow executor uses for step dispatch.

**Cost-control discipline**: always pin a fast non-agentic model + restrict tool surface unless write is required:

```bash
pi -p "..." --mode json --tools read --no-skills --model openrouter/anthropic/claude-haiku-4.5
```

For write tools, restrict to minimum (`--tools read,write` or omit `--tools` if prompt needs broader access); always retain `--model` pin. Wrap long invocations in `gtimeout 120 pi -p ...`.

To enumerate available tools at any time: query `/workflow status` + `/context status` or grep `pi.registerTool` across `packages/*/src/`.

## Substrate authorship semantics

All substrate content — block items, schemas, analysis MDs, commit bodies, plan files, decompositions, acceptance criteria, ID ranges, sub-phase numbering, relation_type names, FGAP/DEC/TASK field text, etc. — is LLM-authored unless verbatim quoted from a user message. User authorization operates at the directive level (verbatim instructions to file / proceed / decide); the LLM composes content under that authorization.

Filed substrate carries user filing-authority. It is the **working baseline** — reviewable against verbatim user-message direction at the point of action when re-anchoring matters, never invalidated wholesale. Do NOT pole-swing between treating filed content as "canonical-unquestionable" and "fabricated-untrustworthy". Steady state: working baseline + targeted review at the action point.

When archaeology (e.g. `claude-history` queries) distinguishes verbatim-user-directed content from LLM-composed-under-filing-authority content, report the distinction as targeted-review information for the user to anchor specific elements, not as baseline-discard. Never introduce authorship-archaeology unprompted in routine work; surface it when explicitly asked or when an action genuinely requires re-anchoring.
- Feedback (behavioral mandates): `~/.claude/projects/-Users-david-Projects-workflowsPiExtension/memory/feedback_*.md` — indexed by MEMORY.md; binding, not suggestion
