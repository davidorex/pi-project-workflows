---
name: pi-workflows
description: >
  Orchestrates multi-step agent workflows defined in YAML with DAG-based
  execution, typed data flow, checkpoint/resume, and output validation. Use when
  running workflows, authoring workflow specs, debugging step failures, or
  inspecting agent configurations.
---

<tools_reference>
<tool name="workflow">
Run a named workflow with typed input. Discovers workflows from .workflows/ and ~/.pi/agent/workflows/.

*Run a multi-step workflow with typed data flow between agents*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workflow` | string | yes | Name of the workflow to run |
| `input` | unknown | no | Input data for the workflow (validated against workflow's input schema) |
| `fresh` | string | no | Set to 'true' to start a fresh run, ignoring any incomplete prior runs |
</tool>

<tool name="workflow-list">
List available workflows with names, descriptions, and sources.

*List available workflows with names, descriptions, and sources*

</tool>

<tool name="workflow-agents">
List available agents with full specs, or inspect a single agent by name. Returns role, description, model, tools, output format/schema, prompt template paths.

*List available agents with specs, or inspect a single agent by name*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | no | Agent name to inspect (omit to list all) |
</tool>

<tool name="workflow-validate">
Validate workflow specs — check agents, schemas, step references, and filters.

*Validate workflow specs — check agents, schemas, step references, filters*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | no | Workflow name to validate (omit to validate all) |
</tool>

<tool name="workflow-status">
Get workflow vocabulary — step types, filters, available agents, workflows, schemas, templates.

*Get workflow vocabulary — step types, filters, available agents, workflows, schemas*

</tool>

<tool name="workflow-init">
Initialize .workflows/ directory for workflow run state.

*Initialize .workflows/ directory for workflow run state*

</tool>

</tools_reference>

<commands_reference>
<command name="/workflow">
List and run workflows

Subcommands: `init`, `list`, `run`, `resume`, `validate`, `status`, `help`
</command>

</commands_reference>

<keyboard_shortcuts>
- **ctrl+h** — Pause running workflow
- **ctrl+j** — Resume paused workflow
</keyboard_shortcuts>

<bundled_resources>
24 agents, 14 schemas, 14 workflows, 31 templates bundled.
See references/bundled-resources.md for full inventory.
</bundled_resources>

<objective>
pi-workflows orchestrates multi-step agent workflows defined in YAML. Workflows are DAGs of typed steps with data flow via `${{ }}` expressions.
</objective>

<workflow_discovery>
Workflows are discovered from three locations (first match wins):
1. `.workflows/*.workflow.yaml` — project-level
2. `~/.pi/agent/workflows/*.workflow.yaml` — user-level
3. Package bundled `workflows/` — built-in
</workflow_discovery>

<step_types>
| Type | Field | Description |
|------|-------|-------------|
| agent | `agent: name` | Dispatch an LLM subprocess via `pi --mode json` |
| command | `command: "..."` | Run a shell command, capture stdout as output |
| monitor | `monitor: name` | Run a monitor classification as a verification gate |
| transform | `transform: { mapping: {...} }` | Pure data transformation via expressions, no LLM |
| gate | `gate: { check: "..." }` | Shell command exit code as pass/fail boolean |
| loop | `loop: { maxAttempts, steps }` | Repeat sub-steps until gate breaks or max reached |
| parallel | `parallel: { a: ..., b: ... }` | Run named sub-steps concurrently |
| pause | `pause: true` or `pause: "message"` | Pause execution, resumable later |
| forEach | `forEach: "${{ expr }}"` | Iterate over an array, executing the step per element |
</step_types>

<expression_syntax>
`${{ expression }}` resolves against scope: `input`, `steps`, `loop`, `forEach`.

Access step outputs: `${{ steps.investigate.output.findings }}`
Filters: `${{ steps.analyze.output | json }}`, `${{ items | length }}`, `${{ name | upper }}`

Available filters: length, keys, filter, json, upper, lower, trim, default, first, last, join, split, replace, includes, map, sum, min, max, sort, unique, flatten, zip, group_by, count_by, chunk, pick, omit, entries, from_entries, merge, values, not, and, or.
</expression_syntax>

<agent_resolution>
Agent specs (`.agent.yaml`) are resolved from three locations (first match wins):
1. `.pi/agents/<name>.agent.yaml` — project-level
2. `~/.pi/agent/agents/<name>.agent.yaml` — user-level
3. Package bundled `agents/<name>.agent.yaml` — built-in

Agent specs define: model, thinking level, tools, system prompt (or template), task template, output format/schema.
</agent_resolution>

<execution_model>
1. Steps are ordered by YAML declaration order
2. DAG planner infers parallelism from `${{ steps.X }}` references
3. Steps without explicit dependencies run after their predecessor (conservative sequential)
4. Each step's result is persisted atomically to `<runDir>/state.json`
5. TUI progress widget shows real-time step status, cost, and timing
</execution_model>

<checkpoint_resume>
Incomplete runs (failed or paused) are detected on next invocation. If the workflow spec hasn't changed incompatibly, execution resumes from the last completed step. Failed steps are re-executed. Use `fresh: "true"` to force a new run.
</checkpoint_resume>

<output_validation>
Steps with `output.schema` validate the agent's JSON output against a JSON Schema file. Validation failure marks the step as failed.

Use `block:<name>` to reference project block schemas portably: `output.schema: block:project` resolves to `.project/schemas/project.schema.json` from cwd. Works across monorepo, npm install, and user-customized schemas. Combined with `retry: { maxAttempts: 2 }`, the agent gets the schema validation error injected into its retry prompt and can self-correct.
</output_validation>

<retry>
Steps with `retry: { maxAttempts: N }` are re-executed on failure. Between retries:
- Project block files are rolled back to pre-attempt state
- Prior error messages are injected into the prompt
- Optional `steeringMessage` provides custom retry guidance
</retry>

<completion_messages>
After execution, the workflow result is injected into the main LLM conversation. The `completion` field controls this: either a `template` (full `${{ }}` template) or `message` + `include` (message text plus resolved data paths).
</completion_messages>

<artifacts>
Workflows can write post-completion files via the `artifacts` field. Paths may contain `${{ }}` expressions. Artifacts targeting `.project/*.json` are routed through `writeBlock()` for schema validation.

Block artifact write failures are fatal — if the data doesn't conform to the block's schema, the workflow fails. Non-block artifact failures remain non-fatal (warning). On resume, all steps are preserved; only artifact processing re-runs, so fixing the schema issue or agent output and resuming avoids re-running expensive LLM steps.
</artifacts>

<validation>
`validateWorkflow(spec, cwd)` runs authoring-time checks without executing the workflow:

1. **Agent resolution** — all referenced agents exist in the three-tier search
2. **Monitor resolution** — all referenced monitors exist in .pi/monitors/ or built-in examples
3. **Schema resolution** — all output schema file paths resolve to existing files
4. **Step reference validity** — `${{ steps.X }}` expressions reference declared steps
5. **Step ordering** — referenced steps are declared before the referencing step
6. **Filter name validity** — `${{ value | filter }}` uses known filter names

Returns `{ valid: boolean, issues: ValidationIssue[] }` where each issue has severity, message, and field path. Use `/workflow validate` or `/workflow validate <name>` to run from the command line.
</validation>

<success_criteria>
- Workflow completes all steps without unhandled failures
- Step outputs match declared output schemas
- State is persisted atomically after each step
- Completion message is delivered to main conversation
- `/workflow validate` returns no errors for authored specs
- Checkpoint/resume recovers from the last completed step
</success_criteria>

*Generated from source by `scripts/generate-skills.js` — do not edit by hand.*
