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

- `loadAgent(name, ctx) → AgentSpec` — resolves spec from discovery tiers, fully resolves all path fields to absolute
- `compileAgent(spec, ctx) → CompiledAgent` — renders templates, injects `contextBlocks` from `.project/`, composes final prompts
- `executeAgent(compiled, dispatch) → JitAgentResult` — in-process LLM dispatch with phantom tool enforcement
- `agentContract(spec) → AgentContract` — projection for introspection, no execution

Subprocess dispatch stays in pi-workflows. The package never reads from `.pi/` — that directory is Pi platform territory.

## Discovery tiers

Agent specs are searched in this order:

1. `{cwd}/.project/agents/{name}.agent.yaml` — project-level overrides
2. `{userDir ?? ~/.pi/agent/agents/}/{name}.agent.yaml` — user-global overrides
3. `{builtinDir}/{name}.agent.yaml` — consumer-supplied builtins

The framework package itself ships no bundled agent specs. Consumer packages supply their own builtin directory at loader construction time.

## Exports

- `.` — main barrel
- `./types` — type definitions
- `./agent-spec` — `parseAgentYaml`, `createAgentLoader`
- `./template` — `createTemplateEnv`, `renderTemplate`, `renderTemplateFile`
- `./compile` — `compileAgent`
- `./runtime` — `executeAgent`, `buildPhantomTool`
- `./introspect` — `agentContract`
