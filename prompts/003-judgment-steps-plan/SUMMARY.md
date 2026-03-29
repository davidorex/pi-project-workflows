# Judgment Steps Restructuring — Summary

Restructures 12 workflow steps (6 judgment-as-assumption + 6 silent-degradation) across 6 workflows. Judgment operations get LLM reasoning via agent steps. Silent degradation gets explicit failure via block steps.

## Per-workflow summary

| Workflow | Steps changed | What changes |
|----------|--------------|--------------|
| **do-gap** | `verify` → `run-checks` + `assess-resolution`; `route` → block update | New agent assesses whether implementation addresses gap's root cause before marking resolved. |
| **gap-to-phase** | `load-context` → block reads with optional/required distinction | Missing blocks produce explicit null. Corrupt files fail. |
| **create-phase** | `load-context` → block reads | Same pattern as gap-to-phase. |
| **fix-audit** | 5 steps restructured | `verify` → agent. `route-results` → agent validation + block writes. Incorrect inventory/state heuristics removed. |
| **plan-from-requirements** | `load-context` → block steps | Requirements required (fails if missing). Architecture, project optional. |
| **create-handoff** | `load-state` → block steps | All blocks optional. `blocks_status` manifest tells handoff-writer which blocks are available/absent. |

## New artifacts

- 3 agent specs: `gap-resolution-assessor`, `audit-finding-verifier`, `audit-results-router`
- 3 templates in `packages/pi-workflows/templates/`
- 3 schemas in `packages/pi-workflows/schemas/`
- 1 template update: `handoff-writer/task.md`

## Token cost

+3 agent invocations across 2 workflows (do-gap, fix-audit). 4 other workflows gain explicit failure at zero additional token cost.

## Design

- Agent steps for judgment, not monitor steps.
- Agent-then-block pattern for validated routing.
- Gap `resolved_by` accepts freeform text.
- `readDir` returns `[]` for missing directories (Plan 2).
- fix-audit inventory/state incorrect heuristics removed, not replaced.

## Blockers

- Plan 1 (dependency alignment) must be complete
- Plan 2 (block step type) must be complete

## Next Step

Execute Plan 1.
