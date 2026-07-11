# Dropped left-undone work (.project→.context) — actionable atoms

Source: `analysis/2026-07-11-workflows-audit/project-carryforward-left-undone.md` (verbatim, code/git-anchored). Every atom below is anchored to a report quote + a cited code/git-absence + a `.project` id. No work is invented. Items the report flagged as lower-confidence / likely-superseded are grouped separately and marked `likely-superseded`; the rest are `still-needed` per the report's ranking.

Cross-cutting caveat (from the report's COVERAGE section): `.context` is a fresh rebuild with reused IDs meaning different things — `.project FEAT-001` (agent-consumer migration) ≠ `.context FEAT-001` (substrate clone). Matching is by content, not id. A subagent acting on any atom must confirm the target is the `.project`-sense item, not a same-numbered `.context` item.

## Groups

- GROUP-DW-01: FEAT-001 pi-jit-agents consumer de-duplication cascade — atoms (ordered, dependency-first): ATOM-DW-01 (umbrella) → ATOM-DW-02 (parseModelSpec centralize) → ATOM-DW-03 (model-pin resolution) → ATOM-DW-04 (thinking-seam) → ATOM-DW-05 (pi-workflows consumer cascade) → ATOM-DW-06 (pi-behavior-monitors consumer cascade) → ATOM-DW-07 (story-task decomposition) → ATOM-DW-08 (plan-phase governance)
- GROUP-DW-02: Orchestrator downstream-portability packaging — atoms: ATOM-DW-09
- GROUP-DW-03: pi-workflows capability roadmap (PHASE-001..004) — atoms: ATOM-DW-10, ATOM-DW-11, ATOM-DW-12
- GROUP-DW-04: Substrate-schema evolution (silent data-model regression) — atoms: ATOM-DW-13, ATOM-DW-14
- GROUP-DW-05: Unbuilt vision features — atoms: ATOM-DW-15, ATOM-DW-16, ATOM-DW-17
- GROUP-DW-06: Lower-confidence / likely-superseded (surfaced, not asserted) — atoms: ATOM-DW-18, ATOM-DW-19

## Atoms

### ATOM-DW-01 — FEAT-001 arc umbrella: converge duplicated agent infrastructure to pi-jit-agents
- group: GROUP-DW-01
- confidence: still-needed
- action: Own the umbrella feature — migrate pi-workflows and pi-behavior-monitors to import agent infrastructure from `@davidorex/pi-jit-agents`, resolving provider-pin, thinking-seam, and cross-consumer duplication at the pi-jit-agents boundary. This atom is the coordinating parent; the concrete work is decomposed into ATOM-DW-02..08. Do not treat as done until child atoms verify.
- evidence: "FEAT-001 (proposed) \"pi-jit-agents consumer migration arc\" / \"Migrate pi-workflows and pi-behavior-monitors to import agent infrastructure from @davidorex/pi-jit-agents. Resolve the provider-pin, thinking-seam, and cross-consumer duplication at the correct boundary…\"" — report also states the arc "exists in .project as one feature, 9 feature-stories, 5 tasks, and ~30 story-tasks, and none of it landed" and "the .context rebuild did not carry this arc (its FEAT-001 is unrelated)" (source: project-carryforward-left-undone.md)
- scope: `.project` FEAT-001; packages/pi-workflows, packages/pi-behavior-monitors, packages/pi-jit-agents, packages/pi-agent-dispatch
- verify: All of ATOM-DW-02..06 verify green; the duplicate agent layer (AgentSpec, compileAgentSpec, parseModelSpec×3, synthetic CompiledAgent) no longer exists in the consumer packages and lives once in pi-jit-agents.

### ATOM-DW-02 — Centralize parseModelSpec in pi-jit-agents; remove the three copies
- group: GROUP-DW-01
- confidence: still-needed
- action: Move `parseModelSpec` into `@davidorex/pi-jit-agents` as the single owner, then delete the three existing copies and re-point their call sites to the pi-jit-agents export. This is the regressed item — a third copy was added rather than centralizing.
- evidence: "TASK-087 (blocked) + FSTORY-003 \"Move parseModelSpec to pi-jit-agents.\" Evidence NOT landed, and REGRESSED: `parseModelSpec` is now triplicated — `pi-agent-dispatch/src/call-agent-tool.ts:26`, `pi-workflows/src/step-monitor.ts:371`, `pi-behavior-monitors/index.ts:1176`. It was never centralized in pi-jit-agents; a third copy was added." (source: project-carryforward-left-undone.md)
- scope: `.project` TASK-087 / FSTORY-003; pi-jit-agents (new home), pi-agent-dispatch/src/call-agent-tool.ts:26, pi-workflows/src/step-monitor.ts:371, pi-behavior-monitors/index.ts:1176
- verify: `parseModelSpec` defined once (in pi-jit-agents); grep across the three cited files shows import-from-pi-jit-agents, not local definition.

### ATOM-DW-03 — Resolve model-pin policy (DEC-0001 bare-id resolution) and apply at pi-jit-agents; converge consumer sites
- group: GROUP-DW-01
- confidence: still-needed
- action: Apply DEC-0001 bare-id model resolution at the pi-jit-agents boundary and converge the pi-workflows / pi-behavior-monitors consumer sites so they no longer carry hardcoded model defaults. Note the report's nuance: the blocker FGAP-115 is closed and `.context` TASK-104 re-addressed model resolution inside the NEW pi-agent-dispatch package — but the consumer sites were never converged. Reconcile with pi-agent-dispatch rather than duplicating resolution again.
- evidence: "TASK-085 (blocked) + FSTORY-001 \"Resolve model-pin policy and apply at pi-jit-agents\" (DEC-0001 bare-id resolution). Note: its blocker FGAP-115 is now closed and .context TASK-104 re-addressed model resolution inside the NEW pi-agent-dispatch package — but the pi-workflows/pi-behavior-monitors consumer sites were never converged; classifier YAMLs still carry a hardcoded default (`step-monitor.ts:83` `model: raw.classify.model ?? \"claude-sonnet-4-20250514\"`)." (source: project-carryforward-left-undone.md)
- scope: `.project` TASK-085 / FSTORY-001 / DEC-0001; pi-jit-agents, pi-agent-dispatch (existing resolution), pi-workflows/src/step-monitor.ts:83, pi-behavior-monitors consumer sites, classifier YAMLs
- verify: No hardcoded `?? "claude-sonnet-4-20250514"` (or equivalent bare default) at step-monitor.ts:83 or peer consumer sites; model resolution flows through the canonical resolver.

### ATOM-DW-04 — Apply thinking-seam enforcement in pi-jit-agents (DEC-0002)
- group: GROUP-DW-01
- confidence: still-needed
- action: Implement DEC-0002 thinking-seam enforcement — when forced toolChoice is set, emit a thinking=off warning via the trace-writer (a `thinking_toolchoice_warning` trace-entry kind). None of this exists yet.
- evidence: "TASK-086 (planned) + FSTORY-002 \"Apply thinking-seam enforcement in pi-jit-agents\" (DEC-0002, forced-toolChoice ⇒ thinking=off warning via trace-writer). No thinking/toolChoice enforcement or `thinking_toolchoice_warning` trace-entry kind found." (source: project-carryforward-left-undone.md)
- scope: `.project` TASK-086 / FSTORY-002 / DEC-0002; pi-jit-agents (enforcement + trace-writer)
- verify: A `thinking_toolchoice_warning` trace-entry kind exists and fires when forced toolChoice coincides with thinking; test covering the seam passes.

### ATOM-DW-05 — pi-workflows consumer cascade: consume pi-jit-agents canonical layer, delete duplicate agent-spec
- group: GROUP-DW-01
- confidence: still-needed
- action: Make pi-workflows consume pi-jit-agents' canonical agent layer and delete its duplicate — remove `packages/pi-workflows/src/agent-spec.ts` and the locally-owned `AgentSpec` / `compileAgentSpec` / `createAgentLoader`. Depends on ATOM-DW-02/03/04 landing at the pi-jit-agents boundary first.
- evidence: "TASK-082 (planned) \"Pi-workflows consumer cascade of FEAT-001 — pi-workflows consumes pi-jit-agents' canonical agent layer; deletes its duplicate.\" Evidence NOT landed: `packages/pi-workflows/src/agent-spec.ts` still present; `AgentSpec`/`compileAgentSpec`/`createAgentLoader` still live in pi-workflows src." (source: project-carryforward-left-undone.md)
- scope: `.project` TASK-082; packages/pi-workflows/src/agent-spec.ts and its consumers
- verify: `packages/pi-workflows/src/agent-spec.ts` deleted; `AgentSpec`/`compileAgentSpec`/`createAgentLoader` no longer defined in pi-workflows src (imported from pi-jit-agents); pi-workflows builds/tests green.

### ATOM-DW-06 — pi-behavior-monitors consumer cascade: drop synthetic CompiledAgent build
- group: GROUP-DW-01
- confidence: still-needed
- action: Migrate pi-behavior-monitors off the pi-workflows agent-spec import and remove the synthetic CompiledAgent construction — replace `index.ts:25` `import { createAgentLoader } from "@davidorex/pi-workflows/agent-spec"` and delete the synthetic build at `index.ts:1423`/`1429`, sourcing from pi-jit-agents instead. Depends on ATOM-DW-05.
- evidence: "TASK-083 (planned) \"Pi-behavior-monitors consumer cascade… drops the synthetic CompiledAgent build.\" Evidence NOT landed: `packages/pi-behavior-monitors/index.ts:25` still `import { createAgentLoader } from \"@davidorex/pi-workflows/agent-spec\"`; `index.ts:1423` comment \"Build a synthetic CompiledAgent from the pi-workflows compileAgentSpec\" and `index.ts:1429` `const synthCompiled: CompiledAgent = {…}` still there." (source: project-carryforward-left-undone.md)
- scope: `.project` TASK-083; packages/pi-behavior-monitors/index.ts:25, :1423, :1429
- verify: index.ts:25 no longer imports from `@davidorex/pi-workflows/agent-spec`; the synthetic `CompiledAgent` block (:1423 comment, :1429 const) is gone; pi-behavior-monitors builds/tests green.

### ATOM-DW-07 — Execute the FEAT-001 story-task decomposition (STORY-TASK-0002..0034)
- group: GROUP-DW-01
- confidence: still-needed
- action: Work the 33 granular story-tasks that decompose the arc — bare-id resolution, thinking-seam tests, parseModelSpec export/removal, pi-workflows call-site migration, classifyViaAgent rewrite, five classifier-YAML alignments, duplicate-schema removal, OpenRouter/Kimi empirical verification, and closure of issue-043/045/048/049/050. (issue-049/050 are open code defects noted by the report as another agent's scope — coordinate, do not double-own.)
- evidence: "STORY-TASK-0002 … 0034 (all 33 todo) — the granular decomposition (bare-id resolution, thinking-seam tests, parseModelSpec export/removal, pi-workflows call-site migration, classifyViaAgent rewrite, five classifier-YAML alignments, duplicate-schema removal, OpenRouter/Kimi empirical verification, issue-043/045/048/049/050 closure). None executed." (source: project-carryforward-left-undone.md)
- scope: `.project` STORY-TASK-0002..0034; pi-jit-agents, pi-workflows, pi-behavior-monitors, classifier YAMLs, issues 043/045/048/049/050
- verify: Each story-task's concrete artifact present (tests added, YAMLs aligned, duplicate schema removed, empirical verification recorded); the 33 items reconcile to closed/superseded with evidence.

### ATOM-DW-08 — Land the FEAT-001 plan-phase governance (PLAN-PHASE-003/004/005)
- group: GROUP-DW-01
- confidence: still-needed
- action: Execute the three pending plan-phases that govern the arc — PLAN-PHASE-005 FEAT-001 story execution, PLAN-PHASE-003 design review of jit-agents-spec.md, PLAN-PHASE-004 user-authored transitions on gating decisions DEC-0001/0002/0003.
- evidence: "PLAN-PHASE-005 (pending) \"FEAT-001 story execution\"; PLAN-PHASE-003 (pending) \"Run design review of jit-agents-spec.md\"; PLAN-PHASE-004 (pending) \"User-authored transitions on gating decisions\" DEC-0001/0002/0003." (source: project-carryforward-left-undone.md)
- scope: `.project` PLAN-PHASE-003, PLAN-PHASE-004, PLAN-PHASE-005; jit-agents-spec.md, DEC-0001/0002/0003
- verify: jit-agents-spec.md design review recorded; DEC-0001/0002/0003 carry user-authored transitions; story execution phase reconciles to done once ATOM-DW-02..07 land.

### ATOM-DW-09 — Elevate scripts/orchestrator/ to a published CLI package (TASK-095 / FGAP-180)
- group: GROUP-DW-02
- confidence: still-needed
- action: Elevate the 39 dual-surface Claude-Code-side orchestrator wrappers to a published monorepo package exposing a single CLI binary with subcommands, closing FGAP-180 (orchestrator portability gap) so downstream pi-context consumers can use the canonical surface without copying scripts or running against this repo's path.
- evidence: "TASK-095 (planned) / FGAP-180 — \"Elevate scripts/orchestrator/ (39 dual-surface Claude-Code-side wrappers) to a published monorepo package providing a single CLI binary with subcommands… Closes FGAP-180 (orchestrator portability gap).\" Evidence NOT landed: `scripts/orchestrator/*.ts` still 39 loose scripts; no `packages/*orchestr*` package exists; FGAP-180 still status `identified`; .context tracks only an orchestrator-parity test (TASK-008), not the package elevation." (source: project-carryforward-left-undone.md)
- scope: `.project` TASK-095 / FGAP-180; scripts/orchestrator/*.ts (39 files), new packages/*orchestr* package
- verify: A `packages/*orchestr*` package exists with a single CLI binary + subcommands covering the 39 wrappers; FGAP-180 moved off `identified`; consumable by a downstream project without path-coupling to this repo.

### ATOM-DW-10 — Build the pi-workflows task-execution loop (PHASE-004 do-task)
- group: GROUP-DW-03
- confidence: still-needed
- action: Build the `do-task` workflow and its supporting agents in pi-workflows. Nothing named do-task/doTask exists yet.
- evidence: "PHASE-004 \"Task execution loop\" / \"Build the do-task workflow and supporting agents.\" Evidence NOT landed: no `do-task`/`doTask` anywhere in pi-workflows." (source: project-carryforward-left-undone.md)
- scope: `.project` PHASE-004; packages/pi-workflows/src
- verify: A `do-task`/`doTask` workflow + supporting agents present in pi-workflows/src and exercised by a test.

### ATOM-DW-11 — Add worktree isolation for parallel steps (PHASE-002)
- group: GROUP-DW-03
- confidence: still-needed
- action: Implement worktree isolation for parallel workflow steps in pi-workflows. No worktree reference currently exists in the src.
- evidence: "PHASE-002 \"Expand capabilities\" / \"worktree isolation for parallel steps.\" Evidence NOT landed: no `worktree` reference in `packages/pi-workflows/src`." (source: project-carryforward-left-undone.md)
- scope: `.project` PHASE-002; packages/pi-workflows/src
- verify: `worktree` isolation implemented and referenced in pi-workflows/src; parallel steps run in isolated worktrees under test.

### ATOM-DW-12 — Enforce agent input schema contracts + add recursion/forking/async guards (PHASE-001/003)
- group: GROUP-DW-03
- confidence: still-needed
- action: Make typed composition real (PHASE-001) by enforcing the agent input schema contracts that currently exist only as decorative annotations; add the future-proofing guards from PHASE-003 (recursion depth guard, context forking, async execution). No enforcement or guard evidence was located.
- evidence: "PHASE-001 \"Make typed composition real\" / \"Enforce the agent input schema contracts that currently exist as decorative annotations\"; PHASE-003 \"Future-proofing\" / \"recursion depth guard… context forking, async execution.\" No enforcement/guard evidence located." (source: project-carryforward-left-undone.md)
- scope: `.project` PHASE-001, PHASE-003; packages/pi-workflows/src
- verify: Agent input schemas validated at runtime (violation rejected under test); recursion-depth guard, context forking, and async execution paths present and tested.

### ATOM-DW-13 — decisions-substrate revision: split into recognitions / decisions / substrate-conflicts (FEAT-008)
- group: GROUP-DW-04
- confidence: still-needed
- action: Split the decisions substrate into three blocks — recognitions, decisions, substrate-conflicts — as a deliberate data-model upgrade. The fresh rebuild silently reverted to the old flat shape.
- evidence: "FEAT-008 (proposed) \"decisions-substrate revision — split into 3 blocks (recognitions / decisions / substrate-conflicts).\" Evidence NOT re-done: `.context/decisions.json` is still a single flat `decisions` block; no recognitions/substrate-conflicts block files exist." (source: project-carryforward-left-undone.md)
- scope: `.project` FEAT-008; .context/decisions.json, new recognitions / substrate-conflicts block files
- verify: recognitions and substrate-conflicts block files exist; decisions.json no longer holds the merged flat set; schema/tooling recognizes the three-block model.

### ATOM-DW-14 — AC schema revision: object form {id, text, status} with AC-id addressability (FEAT-009)
- group: GROUP-DW-04
- confidence: still-needed
- action: Upgrade acceptance_criteria from plain `string[]` to the object form `{id, text, status}` giving per-criterion status and AC-id addressability. The rebuild reverted this to the old flat shape.
- evidence: "FEAT-009 (proposed) \"AC schema revision — object form {id, text, status} with AC-id addressability.\" Evidence NOT re-done: `.context` task `acceptance_criteria` are still plain `string[]`." (source: project-carryforward-left-undone.md)
- scope: `.project` FEAT-009; `.context` task acceptance_criteria fields + schema
- verify: `.context` task `acceptance_criteria` entries carry `{id, text, status}`; criteria are addressable by AC-id; schema/validator updated.

### ATOM-DW-15 — In-session jit-agent persona (FEAT-002)
- group: GROUP-DW-05
- confidence: still-needed
- action: Build the in-session jit-agent persona — reshape the main pi agent into one of the jit-agents via extension hooks (before_agent_start → systemPrompt). Absent from `.context/features.json`.
- evidence: "FEAT-002 (proposed) \"In-session jit-agent persona — reshape the main pi agent into one of our jit-agents via extension hooks\" (before_agent_start → systemPrompt)." plus "Evidence NOT re-done: none appear in `.context/features.json` (14 features, none matching persona/context-plugin/JIT-skill)." (source: project-carryforward-left-undone.md)
- scope: `.project` FEAT-002; pi extension hooks (before_agent_start / systemPrompt)
- verify: A before_agent_start hook reshapes the main agent's systemPrompt into a selected jit-agent persona; demonstrated in a running session.

### ATOM-DW-16 — Context plugin: portable installable third-party context models (FEAT-003)
- group: GROUP-DW-05
- confidence: still-needed
- action: Build the context plugin — a portable, installable bundle of config + schemas + starter blocks + macros so third-party context models are shareable. Absent from `.context/features.json`.
- evidence: "FEAT-003 (proposed) \"Context plugin — portable, installable third-party context models\" (config + schemas + starter blocks + macros as a shareable bundle)." plus "Evidence NOT re-done: none appear in `.context/features.json`…" (source: project-carryforward-left-undone.md)
- scope: `.project` FEAT-003; context config + schemas + starter blocks + macros as a distributable bundle
- verify: A shareable/installable context bundle exists (config + schemas + starter blocks + macros) and can be installed into a fresh project.

### ATOM-DW-17 — JIT skills: schema-shaped, macro-rendered, composable-on-demand guidance (FEAT-007)
- group: GROUP-DW-05
- confidence: still-needed
- action: Build JIT skills — schema-shaped, macro-rendered, composable-on-demand guidance delivered via contextBlocks. Absent from `.context/features.json`.
- evidence: "FEAT-007 (proposed) \"JIT skills — schema-shaped, macro-rendered, composable-on-demand guidance via contextBlocks.\"" plus "Evidence NOT re-done: none appear in `.context/features.json`…" (source: project-carryforward-left-undone.md)
- scope: `.project` FEAT-007; contextBlocks, skill schema + macro rendering
- verify: JIT skills render on demand via contextBlocks from a schema-shaped definition; a sample skill composes and renders.

### ATOM-DW-18 — Materialize DEC-0045 DEC↔DEC associative links as decision_relates_to_decision edges (TASK-065)
- group: GROUP-DW-06
- confidence: likely-superseded
- action: (Surfaced for completeness, not asserted as dropped.) Consider materializing DEC-0045's DEC↔DEC associative links as `decision_relates_to_decision` edges. Report notes this is partially realized in `.context` — the relation_type is native and 3 edges exist — but `.context` DEC ids differ, so the specific DEC-0045→DEC-0041/0036/0015 links are not verifiably reconstructed. Verify before acting; may be a no-op if the intent is already covered.
- evidence: "TASK-065 (planned) \"Materialize DEC-0045's DEC<->DEC associative links as decision_relates_to_decision edges.\" Partially realized in .context: the `decision_relates_to_decision` relation_type is now native and 3 such edges exist in `.context/relations.json` — but .context DEC ids differ, so the specific DEC-0045→DEC-0041/0036/0015 links (6 references) are not verifiably reconstructed." (source: project-carryforward-left-undone.md)
- scope: `.project` TASK-065 / DEC-0045; `.context/relations.json`
- verify: Determine whether the DEC-0045→DEC-0041/0036/0015 relationships (by content) are represented among existing `decision_relates_to_decision` edges; only add edges if a genuine gap remains.

### ATOM-DW-19 — FGAP-026 closure phases 5–10 / context-* tooling (TASK-025..030, PHASE-005..010)
- group: GROUP-DW-06
- confidence: likely-superseded
- action: (Surfaced for completeness, not asserted as dropped.) The `.project→.context` migration + context-* tooling phases — report treats these as re-done-by-construction: the pi-context package and its context-* tools exist, and TASK-043's re-derivation arc built `.context` clean, superseding the original in-place plan. Treat as done unless a concrete gap surfaces; do not re-run the in-place migration.
- evidence: "TASK-025..030 / PHASE-005..010 (FGAP-026 closure phases 5–10, the .project→.context migration + context-* tooling): treated as re-done-by-construction — the pi-context package and its context-* tools exist, and TASK-043's re-derivation arc built .context clean, superseding the original in-place plan." (source: project-carryforward-left-undone.md)
- scope: `.project` TASK-025..030 / PHASE-005..010 / FGAP-026; pi-context package + context-* tools
- verify: Confirm pi-context package and context-* tools are present and functional; if so, close as superseded — no action.
