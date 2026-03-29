# Judgment Steps Restructuring — Summary

Restructures 12 workflow steps (6 judgment-as-assumption + 6 silent-degradation) across 6 workflows to eliminate hardcoded semantic judgments and silent failure modes. Judgment operations get LLM reasoning via agent steps; silent degradation gets explicit failure via block steps.

## Per-workflow summary

| Workflow | Steps changed | What changes |
|----------|--------------|--------------|
| **do-gap** | `verify` → `run-checks` + `assess-resolution`; `route` → block update | New agent assesses whether implementation addresses gap's root cause before marking resolved. Mechanical checks still run but feed into agent judgment, not gate directly. |
| **gap-to-phase** | `load-context` → `load-phases` (readDir) + `load-context` (block read) | Missing blocks produce explicit null. Corrupt files fail the step. Gaps block is required; architecture/conventions/inventory are optional. |
| **create-phase** | `load-context` → `load-phases` (readDir) + `load-context` (block read) | Identical pattern to gap-to-phase. All context blocks optional (this workflow doesn't originate from a gap). |
| **fix-audit** | 5 steps restructured | `cluster` drops grep-based pre-filtering. `verify` → agent step (`audit-finding-verifier`). `route-results` → agent validation (`audit-results-router`) + block appends. `update-audit` writes agent-verified evidence. `load` → block readDir + optional conformance ref. |
| **plan-from-requirements** | `load-context` → 3 block steps | Requirements block is required (fails if missing). Architecture, project are optional. Phases readDir is optional. Prevents planning from empty requirements. |
| **create-handoff** | `load-state` → 4 steps | All blocks optional with explicit null. New `blocks_status` manifest tells handoff-writer which blocks are available/absent. Git operations independent (one failure doesn't lose both). Template updated. |

## New artifacts

**3 agent specs** (in `packages/pi-workflows/agents/`):
- `gap-resolution-assessor.agent.yaml` — assesses gap resolution semantic adequacy
- `audit-finding-verifier.agent.yaml` — verifies findings by reading code (replaces grep)
- `audit-results-router.agent.yaml` — validates routing manifest before block writes

**3 templates** (in `packages/pi-workflows/templates/`):
- `gap-resolution-assessor/task.md`
- `audit-finding-verifier/task.md`
- `audit-results-router/task.md`

**3 schemas** (in `packages/pi-workflows/schemas/`):
- `resolution-assessment.schema.json`
- `finding-verification.schema.json`
- `audit-routing-manifest.schema.json`

**1 template update**:
- `templates/handoff-writer/task.md` — blocks_status section, guard fixes

## Token cost implications

| Workflow | New agent steps | Removed command steps | Estimated additional tokens |
|----------|----------------|----------------------|----------------------------|
| do-gap | +1 (gap-resolution-assessor) | -1 (verify → run-checks is still command) | ~8k-15k per run |
| gap-to-phase | 0 | -1 | 0 |
| create-phase | 0 | -1 | 0 |
| fix-audit | +2 (finding-verifier, results-router) | -2 (cluster grep, verify grep) | ~8k-28k per run |
| plan-from-requirements | 0 | -1 | 0 |
| create-handoff | 0 | -1 | 0 |

Total: +3 agent invocations across 2 workflows. The 4 other workflows gain explicit failure at zero additional token cost.

## Decisions needed

1. **Gap `resolved_by` field format**: Should it accept freeform text (agent's resolution summary) or remain a short identifier? The plan uses freeform text from the agent. Affects the gaps block schema.

2. **Plan 2 amendment for readDir optional directories**: Three workflows need `readDir: phases` to succeed when the phases directory doesn't exist (normal for new projects). Options: (a) amend plan 2 to add `optional: true` for readDir, (b) use mkdir bridge command steps. The plan recommends option (a).

3. **fix-audit inventory and state updates**: The plan removes the inventory monotonic-increase heuristic and the unconditional "completed" state stamp. These were identified as incorrect in the audit. If the user wants inventory/state updates preserved with corrected logic, that scope should be specified.

## Blockers

- Plan 1 (dependency alignment) must be complete
- Plan 2 (block step type) must be complete
- Plan 2 readDir behavior for missing directories needs resolution (amendment or bridge pattern)
