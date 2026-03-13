# pi-workflows

Workflow orchestration extension for Pi. Adds composable, typed, multi-step workflow execution via `.workflow.yaml` specs.

## Project Structure

```
pi-workflows/
  docs/planning/              — design documents (read-only reference, gitignored)
    workflow-extension.md     — extension architecture, phase 2 artifacts spec
    workflows.md              — workflow format, ${{ }} expressions, step types
    impl/01-07               — phase 1 implementation specs
  src/
    index.ts                  — extension entry point (tool, commands)
    types.ts                  — all shared interfaces
    schema-validator.ts       — AJV wrapper
    expression.ts             — ${{ }} expression evaluator with pipe filters
    workflow-spec.ts          — YAML parsing (incl. completion field)
    workflow-discovery.ts     — directory scanning for .workflow.yaml
    dispatch.ts               — subprocess spawn (pi --mode json)
    state.ts                  — run directory, state persistence
    format.ts                 — shared formatDuration/formatCost utilities
    completion.ts             — completion field resolution (template + message forms)
    tui.ts                    — progress widget with token display
    workflow-executor.ts      — main orchestration loop
  demo/
    explore-summarize.workflow.yaml
    test-gaps.workflow.yaml
    agents/                   — demo agent specs
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

1. **Foundation** (implemented, 135 tests): sequential steps, typed data flow, expression resolution, subprocess dispatch, TUI widget, state persistence, completion field, expression filters
2. Control flow + artifacts: `when`, gates, transforms, loops, persistent artifact files at user-defined paths
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
- Expression filters via pipe syntax: `${{ path | duration }}`, `${{ path | currency }}`, `${{ path | json }}`
- Output validation: post-hoc AJV in phase 1, in-loop validation planned for later
- State persisted after each step via atomic write (tmp + rename)
- `completion` field: workflow authors control post-completion message to main LLM. Two mutually exclusive forms: `template` (inline interpolation) or `message` + `include` (instruction text with data attachments). Uses `${{ }}` syntax consistently (not `{{ }}`). Resolves against CompletionScope which extends ExpressionScope with WorkflowResult fields.
- `artifacts` (phase 2): persistent files written to user-defined paths after workflow completion. Supports `latest` overwrite pattern and `runId`-stamped history accumulation. Spec in docs/planning/workflow-extension.md.
