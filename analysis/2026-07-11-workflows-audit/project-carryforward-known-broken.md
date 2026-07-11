---
audit_group: project-carryforward
description: .project->.context dropped known-broken
source_agent: a1b078b62529176dd
extracted_from: /private/tmp/claude-501/-Users-david-Projects-harness-monitor-training/4a529474-bea7-419f-8f8c-bdcdb0aaeb54/tasks/a1b078b62529176dd.output
verbatim: true
---

I have enough code-anchored evidence. Compiling the final report.

---

# Audit: dropped known-broken debt (.project → .context)

## 1. COVERAGE

- **Universe:** 278 items — `.project/framework-gaps.json` (187 gaps: 113 identified, 71 closed, 2 superseded, 1 in-progress) + `.project/issues.json` (91 issues: 68 open, 23 resolved).
- **Method:** enumerated every `.project` title; matched by **content/topic** against all 141 `.context` gaps + 12 `.context` issues (id-blind, per instruction); code-verified the high-severity cross-package items directly in `packages/*/src`.
- **Code-verified individually (15):** FGAP-144, FGAP-140, FGAP-141, FGAP-143, FGAP-153, FGAP-168, FGAP-154, FGAP-160, issue-005, issue-049, issue-050, issue-062, issue-063, issue-065, plus monitor `parseModelSpec`/write-path.
- **The decisive structural finding is a package-coverage collapse** (counts below), which lets me make a class-level claim about the dropped remainder without re-reading all 278 bodies. Items I did **not** open line-by-line: the long tail of P2/P3 pi-workflows/pi-jit-agents/pi-agent-dispatch capability gaps — I assert these are dropped (topic-absent from `.context` + package still exists) but did not confirm each is still live in code.
- **`pi-project` package no longer exists** — absorbed into `pi-context`; its 15 gaps / 32 issues must be re-checked against `pi-context`, and many *were* re-established there. I did not fully reconcile that rename, so `pi-project` items are reported conservatively.

**Package-coverage collapse (the core evidence):**

| package | .project gaps | .context gaps | .project issues | .context issues |
|---|---|---|---|---|
| pi-behavior-monitors | 2 | **0** | 19 | **0** |
| pi-workflows | 16 | **2** | 32 | **1** |
| pi-jit-agents | 20 | 2 | 4 | 0 |
| pi-agent-dispatch | 18 | 4 | 0 | 1 |
| pi-context (+cli) | 106 | 130 | 1 | 10 |

`.context` re-grew the `pi-context` substrate debt (106→130) while **near-zeroing** monitors, workflows, jit-agents, and dispatch. That is where the dropped known-broken debt lives.

**Re-established (NOT dropped — excluded):** `.project` FGAP-169/178 → `.context` FGAP-124; FGAP-172 → FGAP-129; FGAP-157 → FGAP-130; FGAP-125→125, FGAP-128→128, FGAP-131→131, FGAP-132→132.
**Resolved in code (excluded, per scope):** **issue-065** — monitor write-path now routes through `@davidorex/pi-context/block-api` (`pi-behavior-monitors/index.ts:188` "closes issue-065").

---

## 2. DROPPED KNOWN-BROKEN (still live, not re-established) — most severe first

**issue-049 (critical, open, pi-workflows)** — *"step-loop.ts:187 calls compileAgentSpec without cwd — agents in loop steps never receive contextBlocks data."*
- **Live:** `pi-workflows/src/step-loop.ts:187` — `compileAgentSpec(agentSpec, resolvedInput, options.templateEnv)` — 3 args, no `cwd`. Compare the sibling `step-agent.ts:133` which passes `ctx.cwd` (4th arg). `step-shared.ts:147` documents contextBlocks inject only "if … a .project/ directory exists **at cwd**." Omitting cwd silently skips injection. The fix landed in step-agent but not step-loop.
- **.context absence:** no `.context` item names contextBlocks-in-loop or compileAgentSpec.
- *Loop-dispatched agents run context-blind — silent, not an error.*

**issue-062 (high, open, pi-behavior-monitors)** — *"Monitor provider-pin — parseModelSpec defaults bare model ids to provider='anthropic'."*
- **Live:** `pi-behavior-monitors/index.ts:1181` — `return { provider: "anthropic", modelId: spec };` for any slash-less model id.
- **.context absence:** topic search `provider`+`anthropic` and `parseModelSpec` → NONE; 0 behavior-monitor items in `.context`.
- *A bare non-Anthropic model id is silently misrouted to the Anthropic provider.*

**FGAP-153 (P0, identified, pi-jit-agents)** — *"resolvePromptField heuristic misclassifies inline prompts containing '/' as template file paths."*
- **Live:** `pi-jit-agents/src/agent-spec.ts:25` — `if (value.endsWith(".md") || value.endsWith(".txt") || (value.includes("/") && !value.includes("\n")))` treats a single-line inline prompt containing `/` as a template path. Only a newline-guard was added; the `/`-in-single-line case is still misclassified.
- **.context absence:** `resolvePromptField` → NONE.
- *A one-line inline prompt with a slash is read as a missing template file — dispatch fails.*

**FGAP-144 (P1, identified, pi-workflows)** — *"pi-workflows workflow: step type is declared in spec but REJECTED at parse time (phase-6, not yet implemented)."*
- **Live:** `pi-workflows/src/workflow-spec.ts:292` — `throw new WorkflowSpecError(filePath, "step '…': nested workflows ('workflow') are not yet supported")`.
- **.context absence:** "nested"+"workflow" only hits `.context` FGAP-008 (unrelated monitor-spec block).
- *Workflow-of-workflows composition remains inexpressible.*

**FGAP-140 (P1, identified, pi-workflows)** — *"pi-workflows LoopSpec lacks expression-based termination predicates (until / untilBudgetRemaining); maxAttempts hardcoding cannot express loop-until-dry."*
- **Live:** `pi-workflows/src/types.ts:56` `LoopSpec` has only `maxAttempts`, `attempts`, `steps`, `onExhausted` — no `until`. `step-loop.ts:77` loops `for (…; iteration < maxAttempts; …)`; termination is count + gate-break only.
- **.context absence:** "loop"+"until" hits are false positives (FGAP-119/122).
- *Loop-until-condition patterns need manual gate+break shims.*

**issue-005 / FGAP-143 (high P2, open/identified, pi-workflows)** — *"Parallel agent steps share working tree — filesystem conflicts in concurrent file-writing workflows"* / *"dispatch does not surface worktree isolation as a step opt."*
- **Live:** `pi-workflows/src/step-parallel.ts:84,141` — `Promise.allSettled(promises)` fans out with a single shared `ctx.cwd`; grep for `worktree`/`isolat` across `pi-workflows/src` → none.
- **.context absence:** `worktree` → NONE.
- *Concurrent file-writing steps race on one tree with no framework isolation.*

**issue-023 (critical, open, pi-behavior-monitors)** — *"Monitor classify calls produce no debug output — misfires are uninspectable."* and **issue-036 (critical, open)** *"Execution trace debugger — capture full input→template→LLM→parse→result chain."*
- **Live (sampled):** no classify trace/debug surface in `pi-behavior-monitors/index.ts` (searched `traceClassify`/`DEBUG`/`PI_MONITOR` → none; only `console.error` on parse failure). `pi-workflows/src` trace hits are only `template-validation.ts`.
- **.context absence:** `classify` → NONE; 0 monitor items in `.context`.
- *Monitor misfires remain uninspectable; noted as sampled, not exhaustively code-traced.*

**FGAP-141 (P2, identified, pi-workflows)** — *"pi-workflows has no aggregate token-budget surface … no WorkflowSpec-level budget.maxTokens / spent() / remaining()."*
- **Live:** the only `budget` in `pi-workflows` is the per-render `enforce-budget` tool / `x-prompt-budget` text truncation (`index.ts:883`), not a workflow-wide token accumulator; `workflow-spec.ts`/`state.ts` carry no budget field.
- **.context absence:** `.context` FGAP-139 "budget" is `x-rhetorical-criteria` string budgets — different concept.
- *Budget-aware termination / fail-on-overspend is unavailable.*

**FGAP-168 (P0, identified, pi-jit-agents)** — *"output.format: text combined with tools[] is structurally allowed but produces prose-only output — no compile-time conflict check."*
- **Live:** no conflict check in `agent-spec.ts`/`compile.ts` (grep `format`+`tool`/`conflict` → none). (Partially mooted by re-established FGAP-124: in-process jit can't execute tools at all.)
- **.context absence:** `output.format` → NONE.

**Class-level dropped remainder (topic-absent from `.context`, package still shipping; not each code-confirmed):**
- **pi-workflows P1/P2 cluster** FGAP-099 (child tool-surface not clamped to parent), FGAP-102 (autonomous loop validates via LLM self-report — note partial dispatch-tier analog now exists: `pi-agent-dispatch` `run-real-checks-tool.ts` / `attested-commit.ts`), FGAP-139 (quality-pattern templates), FGAP-142 (post-exec schema validation), FGAP-145–150 (streaming DAG, eager parallel, content cache, agentType hint, slash-command discoverability, determinism enforcement); plus issues 002-004,008,009,011,020,028,029,031-033,037,042-048,051-054,064,066,087.
- **pi-behavior-monitors** FGAP-009 (monitor specs as typed substrate blocks) + issues 016,017,030,035,038,039 (no TUI cost surface, no state-coherence monitor, no writeback monitor, no per-monitor YAML collector params, no monitor tuning tools, no `validateMonitor()`).
- **pi-jit-agents** FGAP-154,155,156,161,162,163,165,170,171,176,177.
- **pi-agent-dispatch** FGAP-158,159,160,166,173-175,180-187 (note FGAP-160 topic strings *do* appear in `.context` — treat as possibly re-established).

**Spot-checks that came back NOT-dropped/uncertain (reported for honesty):**
- **issue-065** resolved in code (above).
- **FGAP-154** likely resolved: `author-agent-spec-tool.ts:88` uses the `yaml` package `stringify`, which emits literal block scalars preserving newlines by default — the single-line fold defect appears gone.
- **issue-063** likely addressed: the 5 classifier YAMLs still carry `thinking: "on"` (`agents/*.agent.yaml:6`), but the classify path now *extracts* verdicts from thinking blocks (`index.ts:1197`), so the "silently dropped" premise no longer holds.
- **issue-050** changed: `step-monitor.ts:298` now calls `complete()` and returns `failed` on non-clean verdict (`:354`) — the "silently return CLEAN" behavior looks addressed (though `classify.agent` reference vs inline was not fully traced).

---

## 3. EMERGENT CATEGORIES of dropped defect

1. **Whole-package amnesia.** `pi-behavior-monitors` (0/141 gaps, 0/12 issues) and `pi-workflows` (2 gaps, 1 issue vs 48 items) were essentially not carried forward. The `.context` rebuild re-derived the `pi-context` substrate layer and dropped the orchestration/monitor layers.
2. **Fix-landed-in-one-caller, twin-still-broken.** The strongest live defects are asymmetric fixes: contextBlocks-cwd fixed in `step-agent` but not `step-loop` (issue-049); jit `/`-misclassification patched for newlines but not slashes (FGAP-153). The `.context` rebuild, being topic-derived, cannot see these residual per-callsite breaks.
3. **Silent-wrong-default behavioral bugs.** Provider-pin to `anthropic` (issue-062), prose-only on text+tools (FGAP-168) — fail-silently, exactly the class that needs a tracked ticket to resurface.
4. **Observability/debug surfaces for side-channel LLM calls.** Monitor classify + workflow step tracing (issue-023, issue-036) — dropped wholesale with the monitor package.
5. **Declared-but-unimplemented spec features.** `workflow:` step (FGAP-144), loop `until` predicate (FGAP-140), aggregate budget (FGAP-141), worktree isolation (issue-005/FGAP-143) — the spec advertises them, the parser/runtime rejects or lacks them, and `.context` no longer tracks the gap.

**Files of record:** `.project/framework-gaps.json`, `.project/issues.json`; `.context/framework-gaps.json`, `.context/issues.json`; code oracle: `/Users/david/Projects/workflowsPiExtension/packages/pi-workflows/src/{step-loop.ts:187,workflow-spec.ts:292,types.ts:56,step-parallel.ts:84,step-shared.ts:147}`, `/Users/david/Projects/workflowsPiExtension/packages/pi-jit-agents/src/agent-spec.ts:25`, `/Users/david/Projects/workflowsPiExtension/packages/pi-behavior-monitors/index.ts:{1181,188,1197}`.
