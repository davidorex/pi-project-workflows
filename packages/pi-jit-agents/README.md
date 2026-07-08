# @davidorex/pi-jit-agents

Agent spec compilation and in-process dispatch runtime. Owns everything between "I have a spec" and "I have a typed result."

## Purpose

JIT agents are named callable units with typed input contracts, typed output contracts, and context-parametric implementations materialized at runtime from project state. This package provides:

- Spec loading with full path resolution and tier-aware discovery
- Template compilation with project block context injection
- In-process LLM dispatch with phantom-tool structured output enforcement
- Agent contract introspection for SDK queries

There is one concept of "agent" regardless of whether a workflow step or a monitor classify call invokes it. Classification is agent execution with a verdict-shaped output schema; it is not a separate primitive.

## Boundary

The package owns four public surfaces:

- `loadAgent(name, ctx) → AgentSpec` — resolves spec from discovery tiers; relative path fields absolutize only where a file exists (beside the spec, or — for builtin-tier specs — at the package-root sibling location), otherwise surviving as loader-resolvable names
- `compileAgent(spec, ctx) → CompiledAgent` — renders templates, injects `contextBlocks` from the substrate directory, composes final prompts
- `executeAgent(compiled, dispatch) → JitAgentResult` — in-process LLM dispatch with phantom tool enforcement; clamps the compiled agent's tool grant to a subset of the caller-supplied parent grant at the dispatch boundary
- `agentContract(spec) → AgentContract` — projection for introspection, no execution

Subprocess dispatch stays in pi-workflows. The package never reads from `.pi/` — that directory is Pi platform territory.

## Tool-grant clamping

`AgentSpec.tools` (operation-granular tool names) threads through `compileAgent` into `CompiledAgent.tools`. At dispatch, `executeAgent` clamps `compiled.tools` to a subset of `DispatchContext.parentGrant` (the caller's own grant; undefined parent grant means the empty set). A child requesting a tool outside the parent grant raises `GrantViolationError`, naming the agent and the violating tools.

## Discovery tiers

Agent specs are searched in this order:

1. `{cwd}/<substrate-dir>/agents/{name}.agent.yaml` — project-level overrides
2. `{userDir ?? ~/.pi/agent/agents/}/{name}.agent.yaml` — user-global overrides
3. `{builtinDir}/{name}.agent.yaml` — consumer-supplied builtins

The framework package itself ships no bundled agent specs. Consumer packages supply their own builtin directory at loader construction time.

## Bundled templates

The agent-template tree ships in this package under `templates/` (relocated here from pi-workflows). `bundledTemplateDir()` returns its absolute path so consumers can discover the bundled templates from either source or built (`dist`) layouts. `templates/shared/macros.md` provides one per-item rendering macro per block kind plus six whole-block delegator macros (`render_decisions`, `render_features`, `render_framework_gaps`, `render_layer_plans`, `render_research`, `render_spec_reviews`) that wrap the per-item macros.

`CANONICAL_MACRO_NAMES` is the registry mapping each block kind to its `{ macro_name, array_key }`, surfacing the cases where the block kind differs from the data key the items live under (e.g. `framework-gaps`→`gaps`, `layer-plans`→`plans`, `spec-reviews`→`reviews`). `createRendererRegistry` builds the kind→macro-ref map consumed during compilation.

## Exports

- `.` — main barrel
- `./types` — type definitions
- `./agent-spec` — `parseAgentYaml`, `createAgentLoader`
- `./template` — `createTemplateEnv`, `renderTemplate`, `renderTemplateFile`
- `./compile` — `compileAgent`, `registerCompositionGlobals`
- `./runtime` — `executeAgent`, `buildPhantomTool`, `normalizeToolChoice`, `GrantViolationError`
- `./introspect` — `agentContract`

The main barrel additionally re-exports the bundled-template entry point (`bundledTemplateDir`), the renderer registry (`CANONICAL_MACRO_NAMES`, `createRendererRegistry`), and `GrantViolationError`.
