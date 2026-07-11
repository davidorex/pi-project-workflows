# Validation: dropped left-undone work atoms (re-confirmed against current source)

Input: `analysis/2026-07-11-workflows-audit/atoms/project-dropped-work-atoms.md`
Live target: `/Users/david/Projects/workflowsPiExtension` (branch `main`, HEAD `4575c02f`) — re-verified 2026-07-11.
Method: each verdict below is anchored to a freshly-observed grep result / file:line / substrate read, NOT to the inherited claim. Line numbers are current-source observations.

Note on package inventory (observed): `packages/` now holds `pi-agent-dispatch`, `pi-behavior-monitors`, `pi-context`, `pi-context-cli`, `pi-jit-agents`, `pi-project-workflows`, `pi-workflows`. `pi-project-workflows` is a thin re-export shell (only `*-extension.ts` stubs + `skills/`), not new arc work.

## GROUP-DW-01 — FEAT-001 pi-jit-agents consumer de-duplication cascade

### ATOM-DW-01 — FEAT-001 arc umbrella: converge duplicated agent infrastructure to pi-jit-agents  [VERDICT: still-undone-confirmed]
- prior-confidence: still-needed
- action: Own the umbrella feature — migrate pi-workflows and pi-behavior-monitors to import agent infrastructure from `@davidorex/pi-jit-agents`; the concrete work is decomposed into ATOM-DW-02..08.
- scope: `.project` FEAT-001; pi-workflows, pi-behavior-monitors, pi-jit-agents, pi-agent-dispatch
- observed: All children DW-02..06 verify red (see below). The duplicate agent layer still lives in the consumers: `parseModelSpec` defined 3× (`pi-agent-dispatch/src/call-agent-tool.ts:26`, `pi-behavior-monitors/index.ts:1176`, `pi-workflows/src/step-monitor.ts:371`); `AgentSpec` interface at `pi-workflows/src/types.ts:170`; `createAgentLoader` at `pi-workflows/src/agent-spec.ts:136`; synthetic `CompiledAgent` at `pi-behavior-monitors/index.ts:1429`. pi-jit-agents does own a canonical `agent-spec.ts`/`compile.ts`, but the consumers were NOT re-pointed to it. Umbrella not converged.

### ATOM-DW-02 — Centralize parseModelSpec in pi-jit-agents; remove the three copies  [VERDICT: still-undone-confirmed]
- prior-confidence: still-needed
- action: Move `parseModelSpec` into pi-jit-agents as sole owner; delete the three copies; re-point call sites.
- scope: `.project` TASK-087 / FSTORY-003; pi-jit-agents (new home) + the three cited files
- observed: Still triplicated, each a local `function parseModelSpec`, none importing from pi-jit-agents: `pi-agent-dispatch/src/call-agent-tool.ts:26`, `pi-behavior-monitors/index.ts:1176` (`export function`), `pi-workflows/src/step-monitor.ts:371`. `grep -rn parseModelSpec packages/pi-jit-agents/src` returns zero — pi-jit-agents does NOT define it. Not centralized; regression persists.

### ATOM-DW-03 — Resolve model-pin policy (DEC-0001) at pi-jit-agents; converge consumer sites  [VERDICT: still-undone-confirmed]
- prior-confidence: still-needed
- action: Apply DEC-0001 bare-id resolution at the boundary; converge pi-workflows/pi-behavior-monitors consumer sites off hardcoded defaults; reconcile with pi-agent-dispatch's resolver rather than re-duplicating.
- scope: `.project` TASK-085 / FSTORY-001 / DEC-0001; step-monitor.ts:83 + peer sites; pi-agent-dispatch resolver
- observed: The hardcoded bare default is still present at `pi-workflows/src/step-monitor.ts:83`: `model: raw.classify.model ?? "claude-sonnet-4-20250514"`. `pi-agent-dispatch` does carry a separate resolver (`resolveDispatchModel` imported at `call-agent-tool.ts:24`), but the consumer classifier site was not converged onto it. Consumer convergence undone.

### ATOM-DW-04 — Apply thinking-seam enforcement in pi-jit-agents (DEC-0002)  [VERDICT: partially-done]
- prior-confidence: still-needed
- action: Implement DEC-0002 — forced toolChoice ⇒ thinking=off warning emitted via trace-writer as a `thinking_toolchoice_warning` trace-entry kind.
- scope: `.project` TASK-086 / FSTORY-002 / DEC-0002; pi-jit-agents (enforcement + trace-writer)
- observed: The seam *behavior* now exists — `pi-jit-agents/src/jit-runtime.ts:15` documents and implements "Thinking: NOT passed. Anthropic's API rejects thinking + forced toolChoice" (thinking is omitted under forced toolChoice). BUT the atom's specific deliverable is absent: `grep -rn thinking_toolchoice_warning packages/pi-jit-agents` returns zero — no such trace-entry kind, and no warning is emitted via the trace-writer. Enforcement-by-omission present; the warning/observability seam is not built.

### ATOM-DW-05 — pi-workflows consumer cascade: consume canonical layer, delete duplicate agent-spec  [VERDICT: still-undone-confirmed]
- prior-confidence: still-needed
- action: Make pi-workflows consume pi-jit-agents' canonical layer; delete `agent-spec.ts` and the local `AgentSpec`/`compileAgentSpec`/`createAgentLoader`.
- scope: `.project` TASK-082; pi-workflows/src/agent-spec.ts + consumers
- observed: `packages/pi-workflows/src/agent-spec.ts` still present (5118 bytes, mtime May 26). `createAgentLoader` defined at `agent-spec.ts:136`; `parseAgentYaml` at `:88`; `AgentSpec` interface at `types.ts:170`; `compileAgentSpec` still exported from pi-workflows (`step-shared`, imported by behavior-monitors). No migration to pi-jit-agents. Undone.

### ATOM-DW-06 — pi-behavior-monitors consumer cascade: drop synthetic CompiledAgent build  [VERDICT: still-undone-confirmed]
- prior-confidence: still-needed
- action: Migrate off the pi-workflows agent-spec import; delete the synthetic CompiledAgent construction; source from pi-jit-agents.
- scope: `.project` TASK-083; pi-behavior-monitors/index.ts:25/:1423/:1429
- observed: `pi-behavior-monitors/index.ts:25` still `import { createAgentLoader } from "@davidorex/pi-workflows/agent-spec"` (plus `:26` `compileAgentSpec` from `pi-workflows/step-shared`, `:27` `AgentSpec` from `pi-workflows/types`). Synthetic build intact: `:1423` comment "Build a synthetic CompiledAgent from the pi-workflows compileAgentSpec", `:1429` `const synthCompiled: CompiledAgent = {`, `:1462` `await executeAgent(synthCompiled, dispatch)`. Undone. (Line drift vs prior claim: synth const now :1429 vs :1429 — matches.)

### ATOM-DW-07 — Execute the FEAT-001 story-task decomposition (STORY-TASK-0002..0034)  [VERDICT: still-undone-confirmed]
- prior-confidence: still-needed
- action: Work the 33 granular story-tasks (bare-id resolution, thinking-seam tests, parseModelSpec export/removal, call-site migration, classifyViaAgent rewrite, five classifier-YAML alignments, duplicate-schema removal, empirical Kimi/OpenRouter verification, issue closure).
- scope: `.project` STORY-TASK-0002..0034
- observed: The load-bearing concrete artifacts are unbuilt as shown by DW-02..06: parseModelSpec neither exported from pi-jit-agents nor removed from the 3 sites; no `thinking_toolchoice_warning` test/kind; pi-workflows call sites not migrated. The granular decomposition's central deliverables are unexecuted. (Individual YAML-alignment / issue-closure sub-items are `.project`-substrate tracked and not all separately code-observable, but every code-anchored sub-item checked is red.)

### ATOM-DW-08 — Land the FEAT-001 plan-phase governance (PLAN-PHASE-003/004/005)  [VERDICT: still-undone-confirmed]
- prior-confidence: still-needed
- action: Execute PLAN-PHASE-005 (story execution), PLAN-PHASE-003 (design review of jit-agents-spec.md), PLAN-PHASE-004 (user-authored transitions on DEC-0001/0002/0003).
- scope: `.project` PLAN-PHASE-003/004/005; jit-agents-spec.md; DEC-0001/0002/0003
- observed: These are `.project`-substrate planning artifacts, not directly present in the live `.context` (which reuses ids for unrelated substrate features — see DW-19 caveat). Code-side proxy: the arc these phases govern has not landed (DW-02..06 red), so the story-execution phase cannot have reconciled to done. Governance phases remain unexecuted by construction. (Not independently re-derivable from live code beyond the arc's non-landing.)

## GROUP-DW-02 — Orchestrator downstream-portability packaging

### ATOM-DW-09 — Elevate scripts/orchestrator/ to a published CLI package (TASK-095 / FGAP-180)  [VERDICT: still-undone-confirmed]
- prior-confidence: still-needed
- action: Elevate the dual-surface orchestrator wrappers to a published monorepo package with a single CLI binary + subcommands; close FGAP-180.
- scope: `.project` TASK-095 / FGAP-180; scripts/orchestrator/*.ts; new packages/*orchestr* package
- observed: `scripts/orchestrator/*.ts` = 54 loose files (grown from the 39 the report cited; still loose scripts). `ls packages/*orchestr*` → no match; no orchestrator package exists. `grep FGAP-180 .context/framework-gaps.json` → zero. `.context` `TASK-095` is a reused-id item of unrelated content ("Bash chokepoint hook … FEAT-013 pillar 1+4", status planned) — NOT the orchestrator elevation. The only CLI package (`pi-context-cli`, bin `pi-context`) covers context, not orchestrator. Undone.

## GROUP-DW-03 — pi-workflows capability roadmap (PHASE-001..004)

### ATOM-DW-10 — Build the pi-workflows task-execution loop (PHASE-004 do-task)  [VERDICT: still-undone-confirmed]
- prior-confidence: still-needed
- action: Build the `do-task` workflow + supporting agents in pi-workflows.
- scope: `.project` PHASE-004; pi-workflows/src
- observed: `grep -rln "do-task|doTask|do_task" packages/` → zero matches anywhere in the monorepo. No do-task workflow. Undone.

### ATOM-DW-11 — Add worktree isolation for parallel steps (PHASE-002)  [VERDICT: still-undone-confirmed]
- prior-confidence: still-needed
- action: Implement worktree isolation for parallel workflow steps in pi-workflows.
- scope: `.project` PHASE-002; pi-workflows/src
- observed: `grep -rln worktree packages/pi-workflows/src` → zero; `grep -rln worktree packages/ --include=*.ts` → zero across all packages. No worktree isolation. Undone.

### ATOM-DW-12 — Enforce agent input schema contracts + recursion/forking/async guards (PHASE-001/003)  [VERDICT: still-undone-confirmed]
- prior-confidence: still-needed
- action: Make typed composition real by enforcing the (currently decorative) agent input schema contracts; add recursion-depth guard, context forking, async execution (PHASE-003).
- scope: `.project` PHASE-001, PHASE-003; pi-workflows/src
- observed: `inputSchema` is still carried only as a decorative field — `agent-spec.ts:126` `inputSchema: spec.input` stores it; no runtime validation/rejection of agent input against it (`grep validateInput|input schema validat` → no enforcement path). Recursion depth appears only as a render-side cross-reference inlining budget + cycle detector (`render-by-id.ts:56`, index.ts:856), NOT an agent-composition depth guard. No `context forking` / `async execution` paths located. PHASE-001 enforcement and PHASE-003 guards absent. Undone.

## GROUP-DW-04 — Substrate-schema evolution

### ATOM-DW-13 — decisions-substrate revision: split into recognitions/decisions/substrate-conflicts (FEAT-008)  [VERDICT: still-undone-confirmed]
- prior-confidence: still-needed
- action: Split the decisions substrate into three blocks — recognitions, decisions, substrate-conflicts.
- scope: `.project` FEAT-008; .context/decisions.json + new block files
- observed: `.context/decisions.json` is a single flat object with keys `['decisions', 'schema_version']` — one merged `decisions` block. `ls .context | grep -iE "recogn|conflict"` → zero; no recognitions or substrate-conflicts block files exist. Three-block model not present. Undone. (Note: live `.context` FEAT-008 is a reused-id unrelated feature — "pi-context-cli best-of-breed surface"; the `.project` FEAT-008 data-model split is genuinely absent.)

### ATOM-DW-14 — AC schema revision: object form {id,text,status} with AC-id addressability (FEAT-009)  [VERDICT: still-undone-confirmed]
- prior-confidence: still-needed
- action: Upgrade `acceptance_criteria` from `string[]` to `{id,text,status}` objects.
- scope: `.project` FEAT-009; `.context` task acceptance_criteria + schema
- observed: `.context/tasks.json` `TASK-009` `acceptance_criteria` is a `list` of `str` (plain strings). Not object-shaped; no per-criterion id/status; no AC-id addressability. Undone. (Live FEAT-009 reused id = unrelated "update blocked-diagnostic loop".)

## GROUP-DW-05 — Unbuilt vision features

### ATOM-DW-15 — In-session jit-agent persona (FEAT-002)  [VERDICT: still-undone-confirmed]
- prior-confidence: still-needed
- action: Reshape the main pi agent into a jit-agent persona via before_agent_start → systemPrompt.
- scope: `.project` FEAT-002; pi extension hooks
- observed: `.context/features.json` holds 14 features (FEAT-001..014), enumerated — none is a persona/before_agent_start feature (they are pi-context substrate features: clone, merge-driver, CRDT field-kind, update, chokepoint harness, work-order dispatch, etc.). No persona hook found. Undone. (`.context` FEAT-002 reused id = "pi-context git merge driver".)

### ATOM-DW-16 — Context plugin: portable installable third-party context models (FEAT-003)  [VERDICT: still-undone-confirmed]
- prior-confidence: still-needed
- action: Build a portable installable bundle (config + schemas + starter blocks + macros) so third-party context models are shareable.
- scope: `.project` FEAT-003; distributable context bundle
- observed: None of the 14 live features matches a shareable context-plugin bundle (`.context` FEAT-003 reused id = "Convergent ordered-sequence field-kind"). No installable context-model bundle located. Undone.

### ATOM-DW-17 — JIT skills: schema-shaped, macro-rendered, composable-on-demand guidance (FEAT-007)  [VERDICT: still-undone-confirmed]
- prior-confidence: still-needed
- action: Build JIT skills rendered on demand via contextBlocks from a schema-shaped definition.
- scope: `.project` FEAT-007; contextBlocks + skill schema + macro rendering
- observed: No JIT-skill feature among the 14 (`.context` FEAT-007 reused id = "Convention-articulation enforcement"). `pi-project-workflows/skills/` exists but is a static skills dir, not schema-shaped macro-rendered contextBlock skills. Undone.

## GROUP-DW-06 — Lower-confidence / likely-superseded (re-checked)

### ATOM-DW-18 — Materialize DEC-0045 DEC↔DEC links as decision_relates_to_decision edges (TASK-065)  [VERDICT: superseded]
- prior-confidence: likely-superseded
- action: Consider materializing DEC-0045's DEC↔DEC links as `decision_relates_to_decision` edges; only if a genuine gap remains.
- scope: `.project` TASK-065 / DEC-0045; .context/relations.json
- observed: `relations.json` is a flat list; the `decision_relates_to_decision` relation_type is native and exactly 3 edges exist: DEC-0003→DEC-0002, DEC-0005→DEC-0004, DEC-0004→DEC-0002 (parent/child/relation_type shape). The `.project` targets DEC-0045→DEC-0041/0036/0015 do not correspond to any current edge — `.context` DEC ids are an entirely different, low-numbered content set. The mechanism the atom wanted is realized; the specific `.project` links have no live counterpart to reconstruct (no genuine gap in current substrate). No action — superseded by the native relation_type + re-derived DEC set.

### ATOM-DW-19 — FGAP-026 closure phases 5–10 / context-* tooling (TASK-025..030, PHASE-005..010)  [VERDICT: superseded]
- prior-confidence: likely-superseded
- action: Confirm pi-context package + context-* tools present/functional; close as superseded if so; do not re-run in-place migration.
- scope: `.project` TASK-025..030 / PHASE-005..010 / FGAP-026; pi-context package + context-* tools
- observed: `packages/pi-context` and `packages/pi-context-cli` both present and built (`pi-context-cli` exposes bin `pi-context` → `./dist/bin.js`, with `src/cli.ts`/`dist/cli.js`). A fully-populated `.context/` substrate exists (24 block files: decisions, features, tasks, relations, migrations, schemas, …). The reused-id collision is directly demonstrated (see DW-09/13/14: live TASK-095 / FEAT-008 / FEAT-009 are unrelated content), confirming `.context` is a clean re-derivation, not the in-place migration. Re-done-by-construction. No action — superseded.

## Verdict tally

- still-undone-confirmed: **16** — DW-01, DW-02, DW-03, DW-05, DW-06, DW-07, DW-08, DW-09, DW-10, DW-11, DW-12, DW-13, DW-14, DW-15, DW-16, DW-17
- partially-done: **1** — DW-04
- superseded: **2** — DW-18, DW-19
- already-done: **0**
- total: 19
