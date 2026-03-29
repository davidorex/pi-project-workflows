<objective>
Create a complete implementation plan for restructuring the 6 judgment-as-assumption command steps into agent steps with LLM reasoning, and migrating the 6 silent-degradation command steps to the block step type with explicit failure. This plan will be executed by subagents — every workflow change, agent spec, template, and schema must be concrete and final. Zero open questions. Zero alternatives.
</objective>

<constraints>
These are resolved. Do not revisit, question, or offer alternatives:

- Prerequisites: Plan 1 (dep alignment) and Plan 2 (block step type + expression filters) complete.
- Agent steps (not monitor steps) for judgment operations. Judgments require reading code, examining context, and producing structured reasoning — not binary pattern classification.
- fix-audit route-results: one agent validates the routing manifest, then block steps execute the writes. Agent-then-block pattern.
- Gap `resolved_by` field accepts freeform text — the agent's substantive resolution summary.
- fix-audit inventory/state updates with incorrect heuristics (monotonic increase, unconditional "completed" stamp) are removed entirely. Not replaced.
- `readDir` returns `[]` for missing directories. No mkdir bridge steps needed.
- Block steps with `optional` field for blocks that may not exist. Required blocks fail explicitly.
- No step that affects project state (marks a gap resolved, stamps an audit finding as passed, writes decisions to blocks) may rely solely on exit codes, grep patterns, or JSON parsability as a proxy for semantic correctness.
- Template field names must match workflow step input variable names (template-input validation catches mismatches).
- 3 new agent specs: gap-resolution-assessor, audit-finding-verifier, audit-results-router. Each with .agent.yaml, task template .md, and output schema .schema.json.
</constraints>

<context>
Read all 6 workflows completely:
- packages/pi-workflows/workflows/do-gap.workflow.yaml
- packages/pi-workflows/workflows/gap-to-phase.workflow.yaml
- packages/pi-workflows/workflows/create-phase.workflow.yaml
- packages/pi-workflows/workflows/fix-audit.workflow.yaml
- packages/pi-workflows/workflows/plan-from-requirements.workflow.yaml
- packages/pi-workflows/workflows/create-handoff.workflow.yaml

Read docs/reports/command-step-adequacy-audit.md for the full classification:
- 6 judgment-as-assumption steps (route, route-results, update-audit, verify in fix-audit, write-phase x2)
- 6 silent-degradation steps (load-context x3, load, load-state, load-context in plan-from-requirements)

Read existing agent specs for patterns:
- packages/pi-workflows/agents/verifier.agent.yaml
- packages/pi-workflows/agents/investigator.agent.yaml

Read existing schemas for patterns:
- packages/pi-workflows/schemas/execution-results.schema.json
- packages/pi-workflows/schemas/verifier-output.schema.json
</context>

<output_structure>
Save to: `./prompts/003-judgment-steps-plan/judgment-steps-plan.md`
Save summary to: `./prompts/003-judgment-steps-plan/SUMMARY.md`

Structure per-workflow — all changes for one workflow grouped together so a subagent can work on one workflow at a time. For each workflow:
- Current YAML (relevant steps only)
- Restructured YAML (complete, final — not a proposal)
- New agent specs (complete YAML)
- New templates (complete content)
- New schemas (complete JSON)

SUMMARY.md: one-liner, per-workflow change summary, new artifacts list, token cost table, blockers, no decisions, no open questions.
</output_structure>

<verification>
After plan execution:
- `npm run build` passes
- `npm run check` passes
- `npm test` — all tests pass
- `/workflow validate` passes on all 6 restructured workflows
- `grep -rn 'fs.readFileSync.*\.project\|fs.writeFileSync.*\.project' packages/pi-workflows/workflows/` returns 0 matches
- Every new agent template passes template-input alignment validation
- No command step in any workflow reads or writes .project/ files
</verification>
