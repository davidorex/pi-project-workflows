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

The package owns these public surfaces:

- `loadAgent(name, ctx) → AgentSpec` — resolves spec from discovery tiers, fully resolves all path fields to absolute
- `compileAgent(spec, ctx) → CompiledAgent` — renders templates, injects `contextBlocks` from `.project/` (string form for whole-block, object form `{ name, item?, focus?, depth? }` for per-item or scoped injection; multi-entry same-name configs populate `_<name>_items` arrays), composes final prompts. Registers `resolve` / `render_recursive` / `enforceBudget` as Nunjucks globals on the compile env. Surfaces over-budget warnings on `CompiledAgent.budgetWarnings`.
- `executeAgent(compiled, dispatch) → JitAgentResult` — in-process LLM dispatch with phantom tool enforcement; `normalizeToolChoice(api, toolName)` is the single source of forced-tool-use shape across drivers
- `agentContract(spec) → AgentContract` — projection for introspection, no execution
- `createRendererRegistry({ cwd, builtinDir? })` — three-tier per-item-macro lookup; `CANONICAL_MACRO_NAMES` map holds per-kind canonical singular names (e.g. `decisions → render_decision`), with algorithmic fallback for unmapped kinds
- `buildPhantomTool` — JSON-Schema → TypeBox conversion for the verdict-tool pattern
- `enforceBudget(rendered, schema, fieldPath) → BudgetResult` — render-time prompt-budget enforcement against `x-prompt-budget` annotations; tail-truncates with `[…truncated to budget]` marker on overflow
- `expandFieldPathShorthand(input)` — accepts either JSON pointer (`/properties/decisions/items/properties/context`) or dotted shorthand (`decisions.items.context`) and returns the canonical pointer form
- Marker formatters from `markers.ts`: `notFoundMarker(id)`, `unrenderedMarker(kind, id)`, `cycleMarker(id)`, `renderErrorMarker(msg)` — consume these instead of inline-templating marker strings so emit-text and assertion-text stay in sync
- `dispatchInlineMacro(env, templatePath, macroName, item, depth)` — shared inline-template-string render dispatch consumed by `compileAgent`'s `render_recursive` global and by pi-workflows' `renderItemById` helper
- Trace pipeline (`writeAgentTrace`, `loadProjectRedactionConfig`, `BUILTIN_PATTERNS`, `redactSensitiveData`) and trace SDK (`agentTrace`, `agentTraceChildren`, `agentTraceEntry`) — JSONL trace writer + redactor + reader for monitor classify pipelines

Subprocess dispatch stays in pi-workflows. The package never reads from `.pi/` — that directory is Pi platform territory.

## Discovery tiers

Agent specs are searched in this order:

1. `{cwd}/.project/agents/{name}.agent.yaml` — project-level overrides
2. `{userDir ?? ~/.pi/agent/agents/}/{name}.agent.yaml` — user-global overrides
3. `{builtinDir}/{name}.agent.yaml` — consumer-supplied builtins

The framework package itself ships no bundled agent specs. Consumer packages supply their own builtin directory at loader construction time.

## Exports

- `.` — main barrel re-exports all public surfaces
- `./types` — type definitions including `AgentSpec`, `ContextBlockRef`, `CompileContext`, `CompiledAgent` (with optional `budgetWarnings`), `DispatchContext`, `JitAgentResult`, `AgentContract`, `ItemMacroRef`, `RendererRegistry`, `PromptBudget`, `BudgetWarning`, `BudgetResult`
- `./agent-spec` — `parseAgentYaml`, `createAgentLoader`
- `./template` — `createTemplateEnv`, `renderTemplate`, `renderTemplateFile`
- `./compile` — `compileAgent`, `registerCompositionGlobals`
- `./renderer-registry` — `createRendererRegistry`, `CANONICAL_MACRO_NAMES`
- `./budget-enforcer` — `enforceBudget`
- `./field-path` — `expandFieldPathShorthand`
- `./markers` — `notFoundMarker`, `unrenderedMarker`, `cycleMarker`, `renderErrorMarker`
- `./dispatch-inline` — `dispatchInlineMacro`
- `./runtime` (a.k.a `./jit-runtime`) — `executeAgent`, `buildPhantomTool`, `normalizeToolChoice`
- `./introspect` — `agentContract`
- `./trace-writer`, `./trace-redactor`, `./agent-trace-sdk` — trace pipeline + reader
- `./errors` — `AgentNotFoundError`, `AgentParseError`, `AgentCompileError`, `AgentDispatchError`
