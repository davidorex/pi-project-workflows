# Dropped known-broken — independent re-validation against CURRENT code

Re-validated: 2026-07-11. Code oracle: `/Users/david/Projects/workflowsPiExtension/packages/*/src` (live Read/Grep, not inherited citations).
Substrate stores: `/Users/david/Projects/workflowsPiExtension/.project` (old) vs `.context` (rebuild).

Verdict vocabulary: `still-broken-confirmed` | `already-fixed` | `not-found` | `moved`.
Every "observed" line below is freshly read from current source in this pass.

---

## GROUP-DKB-02 — Fix-landed-in-one-caller, twin-still-broken

### ATOM-DKB-01 — step-loop compiles agent specs without cwd; loop-step agents run context-blind  [VERDICT: still-broken-confirmed]
- prior-confidence: code-verified
- action: Pass `cwd` (loop `ctx.cwd`) as 4th arg to `compileAgentSpec` in `step-loop.ts:187`, mirroring `step-agent.ts:133`.
- scope: `pi-workflows/src/step-loop.ts:187` (cf. `step-agent.ts:133`, `step-shared.ts`) / .project issue-049 (critical, open)
- observed: `step-loop.ts:187` — `agentSpec = compileAgentSpec(agentSpec, resolvedInput, options.templateEnv);` (3 args, no cwd). Sibling `step-agent.ts:133` — `agentSpec = compileAgentSpec(agentSpec, resolvedInput, templateEnv, ctx.cwd);` (4th arg present). `step-shared.ts:172` gates injection on cwd: `if (agentSpec.contextBlocks && agentSpec.contextBlocks.length > 0 && cwd)`. Signature `step-shared.ts:151` declares `cwd?: string` optional, so the 3-arg loop call compiles silently and skips injection. Defect intact.

### ATOM-DKB-02 — resolvePromptField misclassifies single-line inline prompts containing "/" as template paths  [VERDICT: still-broken-confirmed]
- prior-confidence: code-verified
- action: Tighten the heuristic at `agent-spec.ts:25` so a single-line inline prompt containing `/` is not treated as a template file path.
- scope: `pi-jit-agents/src/agent-spec.ts:25` / .project FGAP-153 (P0, identified)
- observed: `agent-spec.ts:25` — `if (value.endsWith(".md") || value.endsWith(".txt") || (value.includes("/") && !value.includes("\n"))) {` — byte-identical to the cited defect. The `/`-in-single-line branch still classifies as template path. Defect intact.

---

## GROUP-DKB-03 — Silent-wrong-default behavioral bugs

### ATOM-DKB-03 — parseModelSpec pins bare (slash-less) model ids to provider="anthropic"  [VERDICT: still-broken-confirmed]
- prior-confidence: code-verified
- action: Stop defaulting slash-less model ids to `anthropic`; require explicit provider or registry resolution.
- scope: `pi-behavior-monitors/index.ts:1181` / .project issue-062 (high, open)
- observed: `pi-behavior-monitors/index.ts:1176-1181` — `parseModelSpec(spec)` finds first `/`; when `slashIndex === -1` it falls through to `return { provider: "anthropic", modelId: spec };`. Defect intact. (Note: an independent twin of this exact default now also exists at `pi-agent-dispatch/src/call-agent-tool.ts:29` — same silent misroute, out of this atom's cited scope.)

### ATOM-DKB-04 — output.format:text combined with tools[] produces prose-only output with no compile-time conflict check  [VERDICT: still-broken-confirmed]
- prior-confidence: code-verified
- action: Add a compile-time conflict check rejecting/warning when `output.format: text` combines with non-empty `tools[]`.
- scope: `pi-jit-agents/src/agent-spec.ts`, `pi-jit-agents/src/compile.ts` / .project FGAP-168 (P0, identified)
- observed: Re-grep of `agent-spec.ts` + `compile.ts` for a format×tool conflict rule returns nothing; the only `output.format` touch is a passthrough at `agent-spec.ts:252` — `outputFormat: spec.output?.format,`. No conflict guard present. Defect intact. (FGAP-124 tool-execution status not re-adjudicated here; the missing-check gap stands on its own.)

---

## GROUP-DKB-04 — Observability/debug surfaces for side-channel LLM calls

### ATOM-DKB-05 — monitor classify calls emit no debug/trace output; misfires uninspectable  [VERDICT: already-fixed]
- prior-confidence: code-verified (report noted: sampled, not exhaustively code-traced)
- action: Add an inspectable classify trace/debug surface in `pi-behavior-monitors`.
- scope: `pi-behavior-monitors/index.ts` (classify path) / .project issue-023 (critical, open)
- observed: A classify trace surface now exists and is wired live. `pi-behavior-monitors/index.ts:1299 resolveTraceSettings()` resolves a `tracePath` from `--trace`/`--no-trace`/`--trace-dir`/`--trace-filter` CLI flags and `PI_AGENT_TRACE_DIR`/`PI_AGENT_TRACE_FILTER` env (default `.workflows/monitors/<name>/`), then `index.ts:1440-1462` builds a `DispatchContext` carrying `tracePath, redactionConfigPath, monitorName` and calls `executeAgent(synthCompiled, dispatch)`. Inside `pi-jit-agents/src/jit-runtime.ts:433 executeAgent` (`tracingEnabled` gate at :445) emits per-classify entries `classify_call` (:517), `context_collection` (:536), `classify_response` (:627), `verdict_decision` (:585/672/714). The report's original grep tokens (`traceClassify`/`DEBUG`/`PI_MONITOR`) never matched because the landed implementation uses different names (`TraceWriter`/`--trace`/`PI_AGENT_TRACE_DIR`). Defect no longer present as described.

### ATOM-DKB-06 — no execution-trace debugger capturing input→template→LLM→parse→result chain  [VERDICT: already-fixed]
- prior-confidence: code-verified (report noted: sampled; pi-workflows trace hits limited to template-validation.ts)
- action: Add end-to-end trace capturing input→template→LLM→parse→result for side-channel LLM calls.
- scope: `pi-behavior-monitors/index.ts`, `pi-workflows/src/*` / .project issue-036 (critical, open)
- observed: A full-chain execution-trace capability now ships in `pi-jit-agents`. Write side: `trace-writer.ts` (`writeAgentTrace`) + emission inside `executeAgent` covering the ordered chain `session_start → classify_call (input+rendered prompt) → context_collection (resolved context values) → classify_response (raw LLM response) → verdict_decision (parse/verdict) → trace_end` (jit-runtime.ts:468-727), schema `pi-jit-agents/schemas/agent-trace.schema.json`, redaction via `trace-redactor.ts`. Read side: `agent-trace-sdk.ts` header states its purpose verbatim — capturing "the rendered prompt, the raw LLM response, the resolved context values, the verdict decision … in particular a monitor's classify call." This is the input→template→LLM→parse→result chain the atom said did not exist. pi-workflows still traces only `template-validation.ts`, but the debugger the atom asks for was built one tier down (jit-agents) and consumed by the monitor classify path. Defect no longer present as described.

---

## GROUP-DKB-05 — Declared-but-unimplemented spec features

### ATOM-DKB-07 — nested "workflow" step type declared in spec but rejected at parse time  [VERDICT: still-broken-confirmed]
- prior-confidence: code-verified
- action: Implement (or explicitly de-scope) the nested `workflow` step type.
- scope: `pi-workflows/src/workflow-spec.ts:292` / .project FGAP-144 (P1, identified)
- observed: `workflow-spec.ts:290-292` — `// Reject workflow (not yet supported)` / `if ("workflow" in rawStep && rawStep.workflow !== undefined) {` / `throw new WorkflowSpecError(filePath, `step '${stepName}': nested workflows ('workflow') are not yet supported`);`. Throw intact. Defect intact.

### ATOM-DKB-08 — LoopSpec lacks expression-based termination (until / untilBudgetRemaining)  [VERDICT: still-broken-confirmed]
- prior-confidence: code-verified
- action: Add `until` / `untilBudgetRemaining` predicates to `LoopSpec` and honor them in `step-loop`.
- scope: `pi-workflows/src/types.ts:56`, `pi-workflows/src/step-loop.ts` / .project FGAP-140 (P1, identified)
- observed: `types.ts:56-61` `LoopSpec` fields are exactly `maxAttempts`, `attempts` (a `${{ }}` override of the count — not a predicate), `steps`, `onExhausted`. No `until`/`untilBudgetRemaining`. `step-loop.ts:77` loops `for (let iteration = 0; iteration < maxAttempts; iteration++)`; grep for `until`/`budgetRemaining` in step-loop finds only prose in comments. Termination remains count + gate-break only. Defect intact.

### ATOM-DKB-09 — no workflow-level aggregate token budget (budget.maxTokens / spent() / remaining())  [VERDICT: still-broken-confirmed]
- prior-confidence: code-verified
- action: Add a WorkflowSpec-level token-budget accumulator (`maxTokens`/`spent()`/`remaining()`).
- scope: `pi-workflows/src/index.ts:883`, `workflow-spec.ts`, `state.ts` / .project FGAP-141 (P2, identified)
- observed: Grep for `budget`/`maxTokens`/`spent`/`remaining` in `workflow-spec.ts` and `state.ts` returns nothing — no budget field on the spec or execution state. The only `budget` in the package is the per-render `enforce-budget` tool at `index.ts:883-889` (checks text against an `x-prompt-budget` schema annotation, tail-truncates) — a per-render truncator, not a workflow-wide accumulator. Defect intact.

### ATOM-DKB-10 — parallel agent steps share one working tree; no worktree isolation option  [VERDICT: still-broken-confirmed]
- prior-confidence: code-verified
- action: Add per-step worktree isolation for parallel/concurrent file-writing steps.
- scope: `pi-workflows/src/step-parallel.ts:84,141` / .project issue-005 (high P2, open) + FGAP-143
- observed: `step-parallel.ts:84` `const results = await Promise.allSettled(promises);` and `:141` `const settled = await Promise.allSettled(subPromises);` fan out sub-steps that each receive `{ ...options, signal }` — i.e. the same `ctx.cwd`; sub-steps "share the outer state" (comment at :127). Grep `worktree`/`isolat` across `pi-workflows/src` matches only a comment in `render-requirement.test.ts:109` ("Plan 8 / Plan 7 isolation"), no implementation. Defect intact.

---

## GROUP-DKB-01 — Whole-package amnesia (class-level dropped remainder)

Method for this group: `.context/framework-gaps.json` DOES reuse `FGAP-NNN` ids (145 of them) but renumbers topics vs `.project` (188), so id-equality across stores is not a reliable drop test. Verdicts below are anchored to CURRENT CODE for the code-anchored carve-outs each atom names, plus representative capability probes. Exhaustive per-id confirmation across all listed ids is not achievable in one pass and is called out where it applies.

### ATOM-DKB-11 — pi-workflows P1/P2 gap+issue cluster dropped wholesale  [VERDICT: still-broken-confirmed (class-level, with carve-outs already fixed)]
- prior-confidence: class-level-needs-confirmation
- action: Re-file each pi-workflows P1/P2 item against `.context`, then code-confirm each is still live before fixing.
- scope: `pi-workflows/src/*` / .project FGAP-099,102,139,142,145-150 + issues 002-004,008,009,011,020,028,029,031-033,037,042-048,051-054,064,066,087
- observed:
  - FGAP-099 (child tool-surface not clamped to parent) — NOW IMPLEMENTED. `pi-jit-agents/src/jit-runtime.ts:484-485` "capability-clamp: Child's tool grant must be a subset of caller's parent grant"; violation throws at :79 "not in parent grant (DEC-0047 clamp at executeAgent boundary)". This specific cluster member is already-fixed at the executeAgent boundary that workflows dispatch through.
  - FGAP-102 (autonomous loop validates via LLM self-report) — partial dispatch-tier analog confirmed present: `pi-agent-dispatch/src/run-real-checks-tool.ts`, `real-check-runner.ts`, `attested-commit.ts` exist. Matches the atom's own note; reconcile before treating as pure gap.
  - FGAP-142 (post-exec schema validation) — grep for output-schema post-exec validation in `pi-workflows/src` finds nothing; still-live.
  - FGAP-145-150 representatives (streaming DAG, content cache, determinism) — no implementation in `pi-workflows/src` (only a path string in `bundled-dirs.ts`); still-live.
  - Net: cluster is broadly still-live, but is NOT an untouched whole — FGAP-099 landed and FGAP-102 has an analog. Per-issue (002-087) bodies not individually opened.

### ATOM-DKB-12 — pi-behavior-monitors gap+issue set dropped wholesale  [VERDICT: still-broken-confirmed (class-level) — but the trace sub-cluster is already-fixed]
- prior-confidence: class-level-needs-confirmation
- action: Re-file each pi-behavior-monitors item against `.context`, then code-confirm each is still live.
- scope: `pi-behavior-monitors/*` / .project FGAP-009 + issues 016,017,030,035,038,039
- observed:
  - `validateMonitor` — absent (grep count 0 in `index.ts`); no `state-coherence`/`writeback`/`tuning` monitor files. Named capabilities (no state-coherence monitor, no writeback monitor, no monitor tuning tools, no `validateMonitor()`) still absent → those cluster members still-live.
  - issue-065 — resolved in code (two "closes issue-065" markers, `index.ts:188` + closure narrative at :1564-1589); already excluded by the atom, re-confirmed.
  - Important correction to the "deepest amnesia / whole package near-zeroed" framing: the observability sub-cluster the report split into issue-023/036 (= ATOM-DKB-05/06) HAS landed (full classify trace via `resolveTraceSettings`→`executeAgent`→`TraceWriter`). So the whole-package claim is partly overstated — the monitor tracing debt was paid.

### ATOM-DKB-13 — pi-jit-agents capability-gap tail dropped  [VERDICT: still-broken-confirmed (class-level, mixed) — one member already-fixed, several MOVED package]
- prior-confidence: class-level-needs-confirmation
- action: Re-file each pi-jit-agents tail gap against `.context`, then code-confirm each is still live.
- scope: `pi-jit-agents/src/*` / .project FGAP-154,155,156,161,162,163,165,170,171,176,177
- observed:
  - FGAP-154 (author-agent-spec YAML folds multi-line prompts to one line) — already-fixed. The author tool now serializes with the `yaml` library: `author-agent-spec-tool.ts:16` `import { stringify as yamlStringify } from "yaml";`, `:88` `const yamlContent = yamlStringify(specObj);` (block scalars preserve newlines). Exclude, per the atom's own flag.
  - Scope drift: the author-agent-spec tool the tail gaps (FGAP-154/155/173/174/175) describe now lives in `pi-agent-dispatch/src/author-agent-spec-tool.ts`, NOT `pi-jit-agents/src`. Those members are MOVED; the atom's `pi-jit-agents/src/*` scope is stale for them.
  - FGAP-170 (no JSON Schema file for AgentSpec) — still-live: `pi-jit-agents/schemas/` holds only `agent-trace.schema.json`, `trace-config.schema.json`, `verdict.schema.json`; no AgentSpec schema.
  - FGAP-155/156/171 (resolvePromptField misclass / type-vs-YAML asymmetry) — consistent with the still-broken ATOM-DKB-02; still-live.
  - FGAP-165 (zero-token dispatch reports success) — no explicit zero-token guard found in `jit-runtime.ts`; not decisively traced, provisionally still-live.
  - Net: class still-live overall, but not homogeneous — FGAP-154 fixed, author-tool gaps moved to pi-agent-dispatch.

### ATOM-DKB-14 — pi-agent-dispatch capability-gap tail dropped  [VERDICT: still-broken-confirmed (class-level)]
- prior-confidence: class-level-needs-confirmation
- action: Re-file each pi-agent-dispatch tail gap against `.context`, then code-confirm each is still live.
- scope: `pi-agent-dispatch/src/*` / .project FGAP-158,159,160,166,173-175,180-187
- observed:
  - FGAP-159 (call-agent `parent_grant`/`requested_grant` Type.Optional but functionally required) — still-live: `call-agent-tool.ts:56` `parent_grant: Type.Optional(` and `:59` `requested_grant: Type.Optional(`.
  - FGAP-160 (call-agent returns only status summary; agent output buried) — CODE still-live: `call-agent-tool.ts:128-133` returns `{ details: result, content: [{ text: `Dispatched agent … result.output type=${typeof result.output}` }] }` — the output is still described by type only, buried in `details`. The literal id `FGAP-160` appears 0 times in `.context`; the atom's "topic strings appear in .context — possibly re-established" refers to topic prose, not a code fix. Not excludable on code evidence.
  - FGAP-158 (no tool to discover dispatch-registry models) / FGAP-166 (no tool to query dispatch history) — no such discovery/history tool found among `pi-agent-dispatch/src/*.ts`; still-live.
  - Net: cluster still-live; FGAP-160 remains a live code defect regardless of the `.context` topic note.

---

## Tally

- Atoms validated: 14 (10 code-verified, 4 class-level).
- Verdicts: still-broken-confirmed 10 (DKB-01,02,03,04,07,08,09,10,11,14) + 2 class-level still-broken (DKB-12,13, each with fixed/moved members); already-fixed 2 (DKB-05, DKB-06); not-found 0.
- Class-level (4) confirmed vs refuted: 4 confirmed still-live (as clusters), 0 fully refuted. Each carries carve-out members already fixed or moved: DKB-11 (FGAP-099 fixed, FGAP-102 analog), DKB-12 (its issue-023/036 trace items fixed = DKB-05/06), DKB-13 (FGAP-154 fixed; author-tool gaps MOVED to pi-agent-dispatch), DKB-14 (all sampled members still-live).
- Cross-cutting correction: the two "code-verified" observability atoms (DKB-05, DKB-06) were the ones that FLIPPED — a trace/execution-debugger surface landed since the report, under different names (`TraceWriter`/`--trace`/`PI_AGENT_TRACE_DIR`) than the report grepped for. The 8 other code-verified atoms all still hold verbatim.
