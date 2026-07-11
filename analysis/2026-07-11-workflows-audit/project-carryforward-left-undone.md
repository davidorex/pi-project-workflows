---
audit_group: project-carryforward
description: .project->.context dropped left-undone work
source_agent: a17c63c49c405ca72
extracted_from: /private/tmp/claude-501/-Users-david-Projects-harness-monitor-training/4a529474-bea7-419f-8f8c-bdcdb0aaeb54/tasks/a17c63c49c405ca72.output
verbatim: true
---

COVERAGE

Examined every non-terminal work item across the eight .project block files, cross-referenced to .context (122 tasks / 14 features / phases M1–M9) and to live code (`packages/*/src`) + git. Non-terminal inventory: tasks 15 (11 planned, 2 in-progress, 2 blocked), features 7 (6 proposed, 1 in-progress), feature-story 9 (all proposed), story-task 33 (todo), phase 6 (4 planned, 2 in-progress), plan-phase 6, plan-layer 5 (statusless), layer-plans 1 (draft). Also spot-checked whether completed items' deliverables are physically present in code. Verification-oracle used to confirm terminal items. .context is a fresh rebuild with reused IDs meaning different things (e.g. .project FEAT-001 = agent-consumer migration; .context FEAT-001 = substrate clone) — matched by content, not ID. Not exhaustively re-verified: the two open code defects (issue-049/050) since defects are another agent's scope; TASK-042/043 (vocabulary-settlement + re-derivation machinery) treated as re-done-by-construction because .context exists.

DROPPED LEFT-UNDONE WORK (still needed) — ranked

1. The entire FEAT-001 "pi-jit-agents consumer migration arc" — dedup + DEC-0001/0002/0003 enactment. This is the single largest dropped cluster; it exists in .project as one feature, 9 feature-stories, 5 tasks, and ~30 story-tasks, and none of it landed.
- FEAT-001 (proposed) "pi-jit-agents consumer migration arc" / "Migrate pi-workflows and pi-behavior-monitors to import agent infrastructure from @davidorex/pi-jit-agents. Resolve the provider-pin, thinking-seam, and cross-consumer duplication at the correct boundary…"
- TASK-082 (planned) "Pi-workflows consumer cascade of FEAT-001 — pi-workflows consumes pi-jit-agents' canonical agent layer; deletes its duplicate." Evidence NOT landed: `packages/pi-workflows/src/agent-spec.ts` still present; `AgentSpec`/`compileAgentSpec`/`createAgentLoader` still live in pi-workflows src.
- TASK-083 (planned) "Pi-behavior-monitors consumer cascade… drops the synthetic CompiledAgent build." Evidence NOT landed: `packages/pi-behavior-monitors/index.ts:25` still `import { createAgentLoader } from "@davidorex/pi-workflows/agent-spec"`; `index.ts:1423` comment "Build a synthetic CompiledAgent from the pi-workflows compileAgentSpec" and `index.ts:1429` `const synthCompiled: CompiledAgent = {…}` still there.
- TASK-087 (blocked) + FSTORY-003 "Move parseModelSpec to pi-jit-agents." Evidence NOT landed, and REGRESSED: `parseModelSpec` is now triplicated — `pi-agent-dispatch/src/call-agent-tool.ts:26`, `pi-workflows/src/step-monitor.ts:371`, `pi-behavior-monitors/index.ts:1176`. It was never centralized in pi-jit-agents; a third copy was added.
- TASK-086 (planned) + FSTORY-002 "Apply thinking-seam enforcement in pi-jit-agents" (DEC-0002, forced-toolChoice ⇒ thinking=off warning via trace-writer). No thinking/toolChoice enforcement or `thinking_toolchoice_warning` trace-entry kind found.
- TASK-085 (blocked) + FSTORY-001 "Resolve model-pin policy and apply at pi-jit-agents" (DEC-0001 bare-id resolution). Note: its blocker FGAP-115 is now closed and .context TASK-104 re-addressed model resolution inside the NEW pi-agent-dispatch package — but the pi-workflows/pi-behavior-monitors consumer sites were never converged; classifier YAMLs still carry a hardcoded default (`step-monitor.ts:83` `model: raw.classify.model ?? "claude-sonnet-4-20250514"`).
- STORY-TASK-0002 … 0034 (all 33 todo) — the granular decomposition (bare-id resolution, thinking-seam tests, parseModelSpec export/removal, pi-workflows call-site migration, classifyViaAgent rewrite, five classifier-YAML alignments, duplicate-schema removal, OpenRouter/Kimi empirical verification, issue-043/045/048/049/050 closure). None executed.
- PLAN-PHASE-005 (pending) "FEAT-001 story execution"; PLAN-PHASE-003 (pending) "Run design review of jit-agents-spec.md"; PLAN-PHASE-004 (pending) "User-authored transitions on gating decisions" DEC-0001/0002/0003.
Why it still matters: the duplicated agent layer the arc set out to delete is not only intact but has grown a third parseModelSpec copy; three enacted decisions (DEC-0001/0002/0003) have no code enactment; the .context rebuild did not carry this arc (its FEAT-001 is unrelated).

2. TASK-095 (planned) / FGAP-180 — "Elevate scripts/orchestrator/ (39 dual-surface Claude-Code-side wrappers) to a published monorepo package providing a single CLI binary with subcommands… Closes FGAP-180 (orchestrator portability gap)." Evidence NOT landed: `scripts/orchestrator/*.ts` still 39 loose scripts; no `packages/*orchestr*` package exists; FGAP-180 still status `identified`; .context tracks only an orchestrator-parity test (TASK-008), not the package elevation. Why it still matters: downstream pi-context consumers (clock-menu-app + future projects) cannot use the Claude-Code-side canonical surface without copying scripts or running against this repo's path.

3. pi-workflows capability roadmap — PHASE-001..004 (all planned), never carried into .context (whose phases are entirely pi-context milestones M1–M9).
- PHASE-004 "Task execution loop" / "Build the do-task workflow and supporting agents." Evidence NOT landed: no `do-task`/`doTask` anywhere in pi-workflows.
- PHASE-002 "Expand capabilities" / "worktree isolation for parallel steps." Evidence NOT landed: no `worktree` reference in `packages/pi-workflows/src`.
- PHASE-001 "Make typed composition real" / "Enforce the agent input schema contracts that currently exist as decorative annotations"; PHASE-003 "Future-proofing" / "recursion depth guard… context forking, async execution." No enforcement/guard evidence located. Why it still matters: pi-workflows' own forward roadmap (execution loop, parallel-step isolation, schema enforcement) is unowned in the new substrate.

4. Substrate-schema evolution features never built and not re-done in .context:
- FEAT-008 (proposed) "decisions-substrate revision — split into 3 blocks (recognitions / decisions / substrate-conflicts)." Evidence NOT re-done: `.context/decisions.json` is still a single flat `decisions` block; no recognitions/substrate-conflicts block files exist.
- FEAT-009 (proposed) "AC schema revision — object form {id, text, status} with AC-id addressability." Evidence NOT re-done: `.context` task `acceptance_criteria` are still plain `string[]`.
Why it still matters: both were deliberate data-model upgrades (per-criterion status, decision/recognition/conflict separation) the fresh rebuild silently reverted to the old flat shape.

5. Vision features proposed, never built, absent from .context:
- FEAT-002 (proposed) "In-session jit-agent persona — reshape the main pi agent into one of our jit-agents via extension hooks" (before_agent_start → systemPrompt).
- FEAT-003 (proposed) "Context plugin — portable, installable third-party context models" (config + schemas + starter blocks + macros as a shareable bundle).
- FEAT-007 (proposed) "JIT skills — schema-shaped, macro-rendered, composable-on-demand guidance via contextBlocks."
Evidence NOT re-done: none appear in `.context/features.json` (14 features, none matching persona/context-plugin/JIT-skill). Why it still matters: these are the stated extension-direction of the system; nothing in the rebuild preserves them.

Lower-confidence / likely superseded (surfaced for completeness, not asserting dropped):
- TASK-065 (planned) "Materialize DEC-0045's DEC<->DEC associative links as decision_relates_to_decision edges." Partially realized in .context: the `decision_relates_to_decision` relation_type is now native and 3 such edges exist in `.context/relations.json` — but .context DEC ids differ, so the specific DEC-0045→DEC-0041/0036/0015 links (6 references) are not verifiably reconstructed.
- TASK-025..030 / PHASE-005..010 (FGAP-026 closure phases 5–10, the .project→.context migration + context-* tooling): treated as re-done-by-construction — the pi-context package and its context-* tools exist, and TASK-043's re-derivation arc built .context clean, superseding the original in-place plan.

EMERGENT CATEGORIES of dropped work

- Enacted-decision-without-code-enactment: DEC-0001/0002/0003 reached enacted status in .project but their implementing tasks (085/086/087) never ran; the rebuild carried the decisions' echoes but not the code.
- Cross-package de-duplication cascades: the costliest omissions — pi-workflows and pi-behavior-monitors still own duplicate agent infrastructure (AgentSpec, compileAgentSpec, parseModelSpec×3, synthetic CompiledAgent); the consolidation to a single canonical owner was designed in full (FEAT-001 + 9 stories + 33 story-tasks) and executed zero.
- Downstream-portability packaging: orchestrator-script → published CLI (TASK-095/FGAP-180) — internal convenience never made consumable by the projects that are supposed to consume this repo.
- Roadmap-phase abandonment on substrate swap: pi-workflows' own capability roadmap (PHASE-001..004) had no home in the pi-context-centric .context phase model and simply vanished.
- Silent data-model regression: substrate-schema upgrades (FEAT-008 decisions split, FEAT-009 AC object form) were reverted to the older flat shapes by the fresh rebuild.
- Unbuilt vision features: persona/context-plugin/JIT-skills (FEAT-002/003/007) — proposed, decomposed no further, dropped without a carry-forward.
