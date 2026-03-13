# pi-workflows

Workflow orchestration extension for Pi. Adds composable, typed, multi-step workflow execution via `.workflow.yaml` specs.

## Project Structure

```
pi-workflows/
  docs/planning/              — design documents (read-only reference)
    schema-bound-agents.md    — typed agent output, AJV validation
    composable-agent-specs.md — typed agent input, JIT instantiation
    unified-agent-system.md   — agent roles, prompt fragments, compilation pipeline
    workflows.md              — DAG orchestration, ${{ }} expressions, step types
    gsd-as-workflow.md        — GSD-2 proof case (loops, gates, timeouts, durability)
    jinja-templates.md        — Nunjucks template inheritance for prompts
    example-bugfix-workflow.md — lightweight reactive workflow stress test
    workflow-extension.md     — extension architecture, subprocess dispatch model
    impl/01-07               — phase 1 implementation specs
  index.ts                    — extension entry point (tool, commands)
  types.ts                    — all shared interfaces
  schema-validator.ts         — AJV wrapper
  expression.ts               — ${{ }} expression evaluator
  workflow-spec.ts            — YAML parsing
  workflow-discovery.ts       — directory scanning for .workflow.yaml
  dispatch.ts                 — subprocess spawn (pi --mode json)
  state.ts                    — run directory, state persistence
  tui.ts                      — progress widget
  workflow-executor.ts        — main orchestration loop
  package.json
```

## Key Concepts

- **Workflow**: a `.workflow.yaml` file with named steps, typed input/output schemas, and `${{ }}` expression-based data flow between steps
- **Agent Spec**: an `.agent.yaml` or `.md` file defining a typed function (InputSchema -> OutputSchema) with model, tools, prompt template
- **Step types** (phase 1: agent only; later: transform, gate, loop, sub-workflow)
- **Expression syntax**: `${{ input.field }}`, `${{ steps.name.output }}` — property access into scope, no eval()
- **Subprocess dispatch**: each step spawns `pi --mode json` as a child process with its own context window
- **Three template syntaxes**: `{{ var }}` / `{% tag %}` (Nunjucks, prompt rendering), `${{ expr }}` (workflow data flow)

## Implementation Phases

1. **Foundation** (current): sequential steps, typed data flow, expression resolution, subprocess dispatch, TUI widget, state persistence
2. Control flow: `when`, gates, transforms, loops
3. Parallelism: DAG inference, concurrent steps, timeouts
4. Durability: checkpoints, resume, budget tracking
5. Templates: Nunjucks integration, `{% extends %}` / `{% block %}`
6. Composition: workflow inheritance, nesting, custom TUI

## Dependencies

- `ajv` — JSON Schema validation
- `yaml` — YAML parsing
- Peer deps: `@mariozechner/pi-coding-agent`, `@mariozechner/pi-tui`, `@sinclair/typebox`

## Conventions

- ESM (`"type": "module"`)
- TypeScript loaded directly by pi (no build step, `--experimental-strip-types`)
- Tests: `node --experimental-strip-types --test *.test.ts`
- Integration tests require `pi` on PATH
- Extension registers: `workflow` tool + `/workflow` command

## File Locations

- Project workflows: `.pi/workflows/*.workflow.yaml`
- User workflows: `~/.pi/agent/workflows/*.workflow.yaml`
- Project agents: `.pi/agents/*.md`
- User agents: `~/.pi/agent/agents/*.md`
- Run state: `.pi/workflow-runs/<run-id>/` (state.json, sessions/, outputs/, metrics.json)

## Do Not Touch

- **`.pi/` directory**: Never create, copy, modify, or delete files in `.pi/`. This is the user's runtime testing directory. The user manages it manually. Source of truth for demo files is `demo/`.

## Design Decisions

- Extension owns its own subprocess dispatch — independent of pi-subagents
- Main conversation is the control plane; workflows are subordinate work
- Fail-fast on step failure (phase 1)
- Expression evaluator: property access only, no arithmetic/logic (transforms handle that)
- Output validation: post-hoc AJV in phase 1, in-loop validation planned for later
- State persisted after each step via atomic write (tmp + rename)
