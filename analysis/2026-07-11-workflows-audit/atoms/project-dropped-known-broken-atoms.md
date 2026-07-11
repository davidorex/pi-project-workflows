# Dropped known-broken (.project→.context) — actionable atoms

Source: `analysis/2026-07-11-workflows-audit/project-carryforward-known-broken.md` (verbatim, code-anchored).
Code oracle base: `/Users/david/Projects/workflowsPiExtension/packages/`.
Each atom = a defect established in `.project`, still live in code, dropped by the `.context` rebuild.
Confidence axis: `code-verified` (report opened the callsite) | `class-level-needs-confirmation` (topic-absent from `.context` + package still ships, but not each body re-confirmed live).

## Groups
- GROUP-DKB-01: Whole-package amnesia (class-level dropped remainder) — atoms: ATOM-DKB-11, ATOM-DKB-12, ATOM-DKB-13, ATOM-DKB-14
- GROUP-DKB-02: Fix-landed-in-one-caller, twin-still-broken — atoms: ATOM-DKB-01, ATOM-DKB-02
- GROUP-DKB-03: Silent-wrong-default behavioral bugs — atoms: ATOM-DKB-03, ATOM-DKB-04
- GROUP-DKB-04: Observability/debug surfaces for side-channel LLM calls — atoms: ATOM-DKB-05, ATOM-DKB-06
- GROUP-DKB-05: Declared-but-unimplemented spec features — atoms: ATOM-DKB-07, ATOM-DKB-08, ATOM-DKB-09, ATOM-DKB-10

## Atoms

### ATOM-DKB-01 — step-loop compiles agent specs without cwd; loop-step agents run context-blind
- group: GROUP-DKB-02
- confidence: code-verified
- action: Pass `cwd` (the loop `ctx.cwd`) as the 4th arg to `compileAgentSpec` in `step-loop.ts:187`, mirroring the sibling fix already in `step-agent.ts:133`, so contextBlocks injection is not silently skipped for loop-dispatched agents.
- evidence: "`pi-workflows/src/step-loop.ts:187` — `compileAgentSpec(agentSpec, resolvedInput, options.templateEnv)` — 3 args, no `cwd`. Compare the sibling `step-agent.ts:133` which passes `ctx.cwd` (4th arg). `step-shared.ts:147` documents contextBlocks inject only 'if … a .project/ directory exists at cwd.' Omitting cwd silently skips injection. The fix landed in step-agent but not step-loop." / ".context absence: no `.context` item names contextBlocks-in-loop or compileAgentSpec." (source: project-carryforward-known-broken.md)
- scope: `pi-workflows/src/step-loop.ts:187` (cf. `step-agent.ts:133`, `step-shared.ts:147`) / .project issue-049 (critical, open)
- verify: Confirm `step-loop.ts:187` still passes 3 args; add a loop-step regression that asserts contextBlocks reach the agent when a `.project/` dir exists at cwd.

### ATOM-DKB-02 — resolvePromptField misclassifies single-line inline prompts containing "/" as template paths
- group: GROUP-DKB-02
- confidence: code-verified
- action: Tighten the heuristic at `agent-spec.ts:25` so a single-line inline prompt containing `/` is not treated as a template file path (the newline-guard alone is insufficient); disambiguate inline vs file-path prompts explicitly.
- evidence: "`pi-jit-agents/src/agent-spec.ts:25` — `if (value.endsWith(\".md\") || value.endsWith(\".txt\") || (value.includes(\"/\") && !value.includes(\"\\n\")))` treats a single-line inline prompt containing `/` as a template path. Only a newline-guard was added; the `/`-in-single-line case is still misclassified." / ".context absence: `resolvePromptField` → NONE." (source: project-carryforward-known-broken.md)
- scope: `pi-jit-agents/src/agent-spec.ts:25` / .project FGAP-153 (P0, identified)
- verify: Confirm the `value.includes("/") && !value.includes("\n")` branch remains; add a case where a one-line inline prompt with a slash dispatches as inline text, not a missing template file.

### ATOM-DKB-03 — parseModelSpec pins bare (slash-less) model ids to provider="anthropic"
- group: GROUP-DKB-03
- confidence: code-verified
- action: Stop defaulting slash-less model ids to `anthropic` in `parseModelSpec`; require an explicit provider or resolve it from a model registry so a bare non-Anthropic id is not silently misrouted.
- evidence: "`pi-behavior-monitors/index.ts:1181` — `return { provider: \"anthropic\", modelId: spec };` for any slash-less model id." / ".context absence: topic search `provider`+`anthropic` and `parseModelSpec` → NONE; 0 behavior-monitor items in `.context`." (source: project-carryforward-known-broken.md)
- scope: `pi-behavior-monitors/index.ts:1181` / .project issue-062 (high, open)
- verify: Confirm the `return { provider: "anthropic", modelId: spec }` default at :1181; add a test that a bare non-Anthropic model id is either rejected or routed to its correct provider.

### ATOM-DKB-04 — output.format:text combined with tools[] produces prose-only output with no compile-time conflict check
- group: GROUP-DKB-03
- confidence: code-verified
- action: Add a compile-time conflict check (in `agent-spec.ts`/`compile.ts`) that rejects or warns when `output.format: text` is combined with a non-empty `tools[]`. Note the report flags this as partially mooted by re-established FGAP-124 (in-process jit can't execute tools at all) — reconcile scope before fixing.
- evidence: "no conflict check in `agent-spec.ts`/`compile.ts` (grep `format`+`tool`/`conflict` → none). (Partially mooted by re-established FGAP-124: in-process jit can't execute tools at all.)" / ".context absence: `output.format` → NONE." (source: project-carryforward-known-broken.md)
- scope: `pi-jit-agents/src/agent-spec.ts`, `pi-jit-agents/src/compile.ts` / .project FGAP-168 (P0, identified)
- verify: Re-grep `format`+`tool`/`conflict` in `agent-spec.ts`/`compile.ts`; first confirm current FGAP-124 (re-established) tool-execution status to decide whether this is still a distinct live gap.

### ATOM-DKB-05 — monitor classify calls emit no debug/trace output; misfires uninspectable
- group: GROUP-DKB-04
- confidence: code-verified (report notes: sampled, not exhaustively code-traced)
- action: Add an inspectable classify trace/debug surface in `pi-behavior-monitors` (e.g. a `PI_MONITOR`/`DEBUG`-gated trace of the classify input→verdict) so monitor misfires are diagnosable.
- evidence: "no classify trace/debug surface in `pi-behavior-monitors/index.ts` (searched `traceClassify`/`DEBUG`/`PI_MONITOR` → none; only `console.error` on parse failure). … Monitor misfires remain uninspectable; noted as sampled, not exhaustively code-traced." / ".context absence: `classify` → NONE; 0 monitor items in `.context`." (source: project-carryforward-known-broken.md)
- scope: `pi-behavior-monitors/index.ts` (classify path) / .project issue-023 (critical, open)
- verify: Re-grep `traceClassify`/`DEBUG`/`PI_MONITOR` in `index.ts` to confirm still absent (report sampled, not exhaustive); then design the trace surface.

### ATOM-DKB-06 — no execution-trace debugger capturing input→template→LLM→parse→result chain
- group: GROUP-DKB-04
- confidence: code-verified (report notes: sampled; `pi-workflows` trace hits limited to template-validation.ts)
- action: Add an end-to-end execution-trace capability that records the full input→template→LLM→parse→result chain for side-channel LLM calls (monitor classify + workflow steps).
- evidence: "no classify trace/debug surface … `pi-workflows/src` trace hits are only `template-validation.ts`." / issue-036 title: "Execution trace debugger — capture full input→template→LLM→parse→result chain." / ".context absence: `classify` → NONE; 0 monitor items in `.context`." (source: project-carryforward-known-broken.md)
- scope: `pi-behavior-monitors/index.ts`, `pi-workflows/src/*` (only `template-validation.ts` currently traces) / .project issue-036 (critical, open)
- verify: Confirm no existing full-chain tracer beyond `template-validation.ts` in `pi-workflows/src`; scope shared surface with ATOM-DKB-05.

### ATOM-DKB-07 — nested "workflow" step type is declared in spec but rejected at parse time
- group: GROUP-DKB-05
- confidence: code-verified
- action: Implement (or explicitly de-scope) the nested `workflow` step type so workflow-of-workflows composition is expressible; currently the parser throws.
- evidence: "`pi-workflows/src/workflow-spec.ts:292` — `throw new WorkflowSpecError(filePath, \"step '…': nested workflows ('workflow') are not yet supported\")`." / ".context absence: 'nested'+'workflow' only hits `.context` FGAP-008 (unrelated monitor-spec block)." (source: project-carryforward-known-broken.md)
- scope: `pi-workflows/src/workflow-spec.ts:292` / .project FGAP-144 (P1, identified)
- verify: Confirm the throw at :292; implement nested-workflow expansion or document the de-scope decision.

### ATOM-DKB-08 — LoopSpec lacks expression-based termination (until / untilBudgetRemaining)
- group: GROUP-DKB-05
- confidence: code-verified
- action: Add expression-based loop termination predicates (`until` / `untilBudgetRemaining`) to `LoopSpec` and honor them in the `step-loop` runtime, replacing count+gate-break-only termination.
- evidence: "`pi-workflows/src/types.ts:56` `LoopSpec` has only `maxAttempts`, `attempts`, `steps`, `onExhausted` — no `until`. `step-loop.ts:77` loops `for (…; iteration < maxAttempts; …)`; termination is count + gate-break only." / ".context absence: 'loop'+'until' hits are false positives (FGAP-119/122)." (source: project-carryforward-known-broken.md)
- scope: `pi-workflows/src/types.ts:56`, `pi-workflows/src/step-loop.ts:77` / .project FGAP-140 (P1, identified)
- verify: Confirm `LoopSpec` at types.ts:56 has no `until` field; add predicate evaluation to the loop and a loop-until-dry test.

### ATOM-DKB-09 — no workflow-level aggregate token budget (budget.maxTokens / spent() / remaining())
- group: GROUP-DKB-05
- confidence: code-verified
- action: Add a WorkflowSpec-level token-budget surface (accumulator with `maxTokens`/`spent()`/`remaining()`) enabling budget-aware termination / fail-on-overspend; distinct from the per-render `enforce-budget` truncation.
- evidence: "the only `budget` in `pi-workflows` is the per-render `enforce-budget` tool / `x-prompt-budget` text truncation (`index.ts:883`), not a workflow-wide token accumulator; `workflow-spec.ts`/`state.ts` carry no budget field." / ".context absence: `.context` FGAP-139 'budget' is `x-rhetorical-criteria` string budgets — different concept." (source: project-carryforward-known-broken.md)
- scope: `pi-workflows/src/index.ts:883`, `pi-workflows/src/workflow-spec.ts`, `pi-workflows/src/state.ts` / .project FGAP-141 (P2, identified)
- verify: Confirm `workflow-spec.ts`/`state.ts` carry no budget field; ensure the new surface is not conflated with `x-prompt-budget` truncation.

### ATOM-DKB-10 — parallel agent steps share one working tree; no worktree isolation option
- group: GROUP-DKB-05
- confidence: code-verified
- action: Add per-step worktree isolation for parallel/concurrent file-writing steps so `step-parallel` fan-out does not race on a single shared `ctx.cwd`.
- evidence: "`pi-workflows/src/step-parallel.ts:84,141` — `Promise.allSettled(promises)` fans out with a single shared `ctx.cwd`; grep for `worktree`/`isolat` across `pi-workflows/src` → none." / ".context absence: `worktree` → NONE." (source: project-carryforward-known-broken.md)
- scope: `pi-workflows/src/step-parallel.ts:84,141` / .project issue-005 (high P2, open) + FGAP-143 (identified)
- verify: Confirm shared `ctx.cwd` at step-parallel.ts:84,141 and re-grep `worktree`/`isolat` absent; add isolation as a step opt.

### ATOM-DKB-11 — pi-workflows P1/P2 gap+issue cluster dropped wholesale
- group: GROUP-DKB-01
- confidence: class-level-needs-confirmation
- action: Re-file each pi-workflows P1/P2 item against `.context`, then code-confirm each is still live before fixing. Report asserts dropped (topic-absent + package ships) but did not open each body.
- evidence: "pi-workflows P1/P2 cluster FGAP-099 (child tool-surface not clamped to parent), FGAP-102 (autonomous loop validates via LLM self-report — note partial dispatch-tier analog now exists: `pi-agent-dispatch` `run-real-checks-tool.ts` / `attested-commit.ts`), FGAP-139 (quality-pattern templates), FGAP-142 (post-exec schema validation), FGAP-145–150 (streaming DAG, eager parallel, content cache, agentType hint, slash-command discoverability, determinism enforcement); plus issues 002-004,008,009,011,020,028,029,031-033,037,042-048,051-054,064,066,087." / package-coverage collapse: "pi-workflows | 16 | 2 | 32 | 1". (source: project-carryforward-known-broken.md)
- scope: `pi-workflows/src/*` / .project FGAP-099,102,139,142,145-150 + issues 002-004,008,009,011,020,028,029,031-033,037,042-048,051-054,064,066,087
- verify: For each id, confirm topic still absent in `.context/framework-gaps.json`/`issues.json` and confirm still-live in `pi-workflows/src` before treating as fix-ready. FGAP-102 has a partial dispatch-tier analog (`run-real-checks-tool.ts`/`attested-commit.ts`) — reconcile.

### ATOM-DKB-12 — pi-behavior-monitors gap+issue set dropped wholesale (0/141 gaps, 0/12 issues carried)
- group: GROUP-DKB-01
- confidence: class-level-needs-confirmation
- action: Re-file each pi-behavior-monitors item against `.context`, then code-confirm each is still live before fixing. This is the deepest amnesia (whole package near-zeroed).
- evidence: "pi-behavior-monitors FGAP-009 (monitor specs as typed substrate blocks) + issues 016,017,030,035,038,039 (no TUI cost surface, no state-coherence monitor, no writeback monitor, no per-monitor YAML collector params, no monitor tuning tools, no `validateMonitor()`)." / package-coverage collapse: "pi-behavior-monitors | 2 | 0 | 19 | 0". (source: project-carryforward-known-broken.md)
- scope: `pi-behavior-monitors/*` / .project FGAP-009 + issues 016,017,030,035,038,039
- verify: Confirm topic absence in `.context` and still-live in code for each. Exclude issue-065 (resolved in code: `pi-behavior-monitors/index.ts:188` "closes issue-065"). Report also flags issue-023/036/050/062/063 individually — treat those as their own atoms, not this class item.

### ATOM-DKB-13 — pi-jit-agents capability-gap tail dropped
- group: GROUP-DKB-01
- confidence: class-level-needs-confirmation
- action: Re-file each pi-jit-agents tail gap against `.context`, then code-confirm each is still live before fixing.
- evidence: "pi-jit-agents FGAP-154,155,156,161,162,163,165,170,171,176,177." / package-coverage collapse: "pi-jit-agents | 20 | 2 | 4 | 0". (source: project-carryforward-known-broken.md)
- scope: `pi-jit-agents/src/*` / .project FGAP-154,155,156,161,162,163,165,170,171,176,177
- verify: Confirm topic absence in `.context` and still-live per id. Report flags FGAP-154 likely resolved (`author-agent-spec-tool.ts:88` uses `yaml` `stringify`, block scalars preserve newlines) — verify and exclude if so.

### ATOM-DKB-14 — pi-agent-dispatch capability-gap tail dropped
- group: GROUP-DKB-01
- confidence: class-level-needs-confirmation
- action: Re-file each pi-agent-dispatch tail gap against `.context`, then code-confirm each is still live before fixing.
- evidence: "pi-agent-dispatch FGAP-158,159,160,166,173-175,180-187 (note FGAP-160 topic strings *do* appear in `.context` — treat as possibly re-established)." / package-coverage collapse: "pi-agent-dispatch | 18 | 4 | 0 | 1". (source: project-carryforward-known-broken.md)
- scope: `pi-agent-dispatch/src/*` / .project FGAP-158,159,160,166,173-175,180-187
- verify: Confirm topic absence in `.context` and still-live per id. FGAP-160 topic strings appear in `.context` — treat as possibly re-established and exclude if confirmed.
