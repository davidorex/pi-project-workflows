---
name: plan-file-structure
description: "the portable shape a plan file (~/.claude/plans/*.md) should take — Context, a Success Criteria checklist (the task's acceptance_criteria), decisive line-anchored fix, mirrors named patterns, tests+runtime-demo+adversarial-audit-loop, a Discipline section"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: d7310007-aef3-4e05-a651-d218d1cfd12f
---

The user expects plan files (`~/.claude/plans/*.md`, written in plan mode) to follow ONE portable structure across all projects — they were "surprised there's such variation between different Claude Code structuring of plans across different projects." The reference exemplar they endorsed: `/Users/david/.claude/plans/iridescent-nibbling-wand.md` (a pi-context TASK-011 plan). Match its shape.

**Why:** A plan is an execution contract for an IMPL subagent, not a sketch. Vague/hedged plans ("check if X then maybe Y", options menus, no anchors) force the implementer to re-decide what planning was supposed to settle, and produce drift. The exemplar's value is that it is *decisive and executable as written*.

**How to apply** — a plan file should have:
- **Lead with `## Context`** — why the change is being made (the problem/need, what prompted it, intended outcome), not what it is.
- **`## Success Criteria`** (right after Context) — the task's `acceptance_criteria` (the `.context` schema field; the plan SECTION is titled "Success Criteria" regardless of the schema name) rendered as a concrete, verifiable checklist. This is the done-contract: the Verification section proves each item and the VER `criteria_results` records the per-criterion pass; loop (re-IMPL → re-audit) until ALL are met; a task with any unmet criterion is not done. If the task carries no `acceptance_criteria`, that is an incomplete filing — populate the `.context` field at pre-impl, don't invent plan-only criteria.
- **Decisive fix, no forks** — the approach is RESOLVED. No "check if…", no options-as-ceremony. If a decision hinged on a fact, go read the source and resolve it in-plan (e.g. "`apply.py` is `__main__`-guarded `:370` so the import is side-effect-free — confirmed by read, not assumed"). Resolving forks requires reading the real files for exact anchors BEFORE writing the plan.
- **Exact file:line anchors + the function/utility to reuse** — name `path:line` for every reused symbol and every edit site (clickable, and pins the implementer). Actively prefer reuse over new code.
- **Mirror existing patterns by name** — "mirrors `render.py:59-115`", "mirrors `amendConfigEntry`" — point the implementer at the precedent to copy.
- **Verification section** — tests + a **runtime demo** (actually run it / use the tool, not just unit tests) + a **fresh adversarial audit by a separate agent** + an explicit **fix → re-verify → re-audit loop until zero findings**.
- **`## Discipline` section** — pin the canonical execution: substrate/bookkeeping-write-first → one foreground coding subagent per subsystem → orchestrator owns npm/git/gate/re-audit (subagent forbidden git+gate+banner narration) → CLI status cascade only after green+validated → releases/commits held to the end.
- **`## Critical files`** — the closing list of touched files with their role.

This is the same canonical pipeline this project's CLAUDE.md "Active-phase-management" already mandates (plan → explore → pre-impl file `.context` → IMPL → separate-agent adversarial audit → status cascade, iterate to zero); the exemplar is its plan-file rendering. Relates to [[feedback-options-proliferation-noise]] (the no-forks point) and [[feedback-no-options-when-path-clear]].
