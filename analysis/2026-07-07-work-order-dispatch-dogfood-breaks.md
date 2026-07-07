# Work-order loop dogfood probe — break root-cause analysis

Date: 2026-07-07. Investigating agent: fresh-context executing agent (read-only on substrate; empirical probes via `npx tsx` against built dist). Scope: the five breaks surfaced by the user-directed live probe of `run-work-order-loop` (WO-001) driven from `pi -p` non-interactive dispatch. No fixes applied; no substrate items filed. Probe artifacts preserved: `WO-001` in the `work-orders` block, `.context/agents/wo-demo-writer.agent.yaml`, `.context/agents/wo-demo-task.md`.

## Probe-fact verification (each claimed fact checked against disk/substrate)

| Claimed fact | Verified | Evidence |
|---|---|---|
| WO-001 filed with target_agent `wo-demo-writer`, runtime_demo real-check, scope.files `["tmp/wo-demo.txt"]`, scope.operations `["write"]`, input/output contracts | YES | `pi-context read-block-item --block work-orders --id WO-001 --json` returns exactly those fields |
| author-agent-spec refused non-interactively with the ctx.hasUI=false reason | Consistent with source | The refusal string is the byte template at `packages/pi-agent-dispatch/src/auth-gate.ts:159` |
| Spec hand-written into `.context/agents/` | YES | Both files present; spec declares `model: openrouter/anthropic/claude-haiku-4.5`, `tools: [write, bash]`, task template `wo-demo-task.md` |
| Dispatched agent returned correct JSON + "cannot actually write files" note; file never created | File-absence verified | `tmp/wo-demo.txt` does not exist (`ls tmp/` — no such entry); the agent's self-report was ACCURATE, not a hallucinated refusal (see Break 2) |
| real-check passed:false; final_status `aborted-by-human` | Consistent with source | `work-order-loop.ts:166` (file absent → runtime_demo fails) and `:200-209` + pi's no-UI confirm default (see Break 5) |

---

## Break 1 — author-agent-spec is interactively gated (unusable from `pi -p`)

**Root cause.** `author-agent-spec` is a member of `dispatchGatedTools` at `packages/pi-agent-dispatch/src/auth-gate.ts:67` (`["author-agent-spec", "author-tool-grant", "commit-attested"]`), aggregated into `AUTH_REQUIRED_TOOLS` (auth-gate.ts:91-96). The handler refuses unconditionally when `ctx.hasUI === false` (auth-gate.ts:156-161). `pi -p` runs pi non-interactively — the runner's `hasUI()` is false because no UI context is attached (`node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/runner.js:211-213`; only interactive mode sets `hasUI: true`, `interactive-mode.js:1248`).

**Deliberate gate, by documented design — but with no non-interactive completion path.** The auth-gate header states the intent explicitly: "non-interactive context (ctx.hasUI === false) → unconditional refusal … This closes the JSON-mode / workflow-subprocess bypass" (auth-gate.ts:22-25). So the refusal is not a bug. The gap is that for the 8 pi-only gated tools there is NO alternative sanctioned path: the 13 pi-context auth-gated ops (13 `authGated: true` entries in `packages/pi-context/src/ops-registry.ts`) are also reflected on the `pi-context` CLI, which offers `--yes`/`--force` pre-authorization for non-interactive contexts; `author-agent-spec` / `author-tool-grant` / `commit-attested` / `workflow-execute` / `workflow-resume` / `workflow-init` / `monitors-control` / `monitors-rules` exist only as pi tools and therefore have zero non-interactive invocation route. Hand-writing the spec file (what the probe did) is the only workaround — and it bypasses the sanctioned authoring/validation ceremony entirely.

**Gate-coverage inconsistency (corollary).** The gate operates on tool NAMES at the `pi.on("tool_call")` boundary. `run-work-order-loop` is NOT in the gated set (auth-gate.ts:34 names call-agent / run-real-checks as deliberate pass-throughs; run-work-order-loop is likewise ungated) and it invokes the commit path as a LIBRARY call (`_internals.attestedCommit`, work-order-loop.ts:171), not via the gated `commit-attested` tool. Had the real-check passed, the `pi -p` run would have produced an attested commit with no operator confirm — while the far less consequential spec-authoring was refused. The gate refuses the ceremony but not the composite that embeds the ceremony's effect.

**Reproducible conditions.** `pi -p "call author-agent-spec with name X and spec {...}" --mode json` → tool_call blocked with `tool author-agent-spec requires interactive user-confirm; current context is non-interactive (ctx.hasUI=false)`.

**Class.** Yes — instance of a known, previously-filed class: "auth-gated tool invoked from a hasUI=false pi session is structurally refused." **Prior-art: FGAP-068 (closed)** — the update-conflict resolver spawned a `pi -p` subordinate whose `write-schema` was auth-gate-refused; its resolution vocabulary is `caller-as-reconciler` (move the gated act back to the calling interactive agent instead of a subordinate spawn). FGAP-069 (closed) is the follow-on. DEC-0017's R2 rejection (cited inside FGAP-068) already recorded that `pi -p` sessions cannot pass the auth-gate. The author-agent-spec INSTANCE is untracked; the class is tracked-and-closed for the schema-conflict instance only. The FGAP-068 resolution shape (caller authors, gated tool confirmed in the caller's interactive session) maps directly: the interactive orchestrator should author the spec; a `pi -p` harness step should never need to.

---

## Break 2 — the dispatched agent had NO executable tools (highest-value finding)

**Root cause.** `executeAgent` (`packages/pi-jit-agents/src/jit-runtime.ts:432-738`) is a single-turn LLM completion primitive, not an agentic executor. It never binds tool implementations:

- `compiled.tools` is consumed at exactly one point — the DEC-0047 grant-subset check (`computeGrantViolation`, jit-runtime.ts:488-491). It gates NAMES; it materializes nothing.
- The only tool ever passed to the LLM is the phantom output-schema tool, and only when `compiled.outputSchema` is set (jit-runtime.ts:566-570). It "is never executed — it exists only as a schema constraint" (jit-runtime.ts:231).
- There is no tool-execution loop: one `completeFn(...)` call (jit-runtime.ts:572), then output extraction. A `toolCall` in the response is only ever read as phantom-tool arguments.
- `DispatchContext` (types.ts:195-234) has no channel for tool implementations at all — model, auth, parentGrant (names), maxTokens, signal, trace fields. `CompiledAgent.tools` is documented as "Tool grant … the clamp at executeAgent enforces child ⊆ parent" (types.ts:188-189) — grant vocabulary, not capability.

**Empirical demonstration (observed, not inferred).** Instrumented `completeFn` run against the built dist with the actual probe spec (scratchpad `repro-jit-tools.mts`):

```
SPEC tools: ["write","bash"]
COMPILED tools: ["write","bash"] outputSchema: undefined
OBSERVED tool surface given to child LLM: {"toolsPassedToLLM":"UNDEFINED (no tools)","toolChoice":"none"}
```

The grant `["write","bash"]` passes the clamp (it equals the composed parentGrant) and is then discarded. The child LLM receives a bare text prompt instructing it to write a file, with zero tools. The probe agent's appended note — "I'm a language model and cannot actually write files to your filesystem" — was therefore a TRUE statement of its situation, not a hallucinated refusal. It then performed the only thing it could: emit the requested output JSON as text. `tmp/wo-demo.txt` absent on disk corroborates.

**Why it's shaped this way.** `executeAgent` implements D4 of `docs/planning/jit-agents-spec.md` ("unified in-process dispatch. Phantom tool enforcement…"), generalized from the monitor classifier path (`classifyViaAgent` → `executeJitAgent`, spec §156). Every prior consumer — monitor classifiers, schema-bound workflow-step output — needs structured OUTPUT, never tool ACTION. The work-order loop (TASK-091 era, commit 494357ac, 2026-05-28) is the first consumer that dispatches an agent whose job is to ACT, and it reused the act-less primitive (`work-order-loop.ts:110-142` — load, compile, composeToolGrant, executeAgent). The FEAT-005/DEC-0047 capability-composition machinery (`capability-composer.ts:15-19`) was built as if a capability surface existed underneath; nothing implements it in-process. Real tool execution exists in exactly one place in this architecture: a pi subprocess (`pi --mode json` / `pi -p`), which is how workflow steps get real tools — and precisely what the jit in-process path was built to avoid (per JI-021 / "pi-jit-agents stays a library", work-order-loop.ts:8-9).

**Reproducible conditions.** Any `call-agent` or `run-work-order-loop` dispatch of a spec declaring `tools:` with any grant: the child receives no tools. Minimal: the scratchpad repro above; or live: `pi -p "call run-work-order-loop with work_order_id WO-001 and agent_grant ['write','bash']" --mode json …` → iteration 0 output JSON without file side-effect.

**Class.** Yes — the class is "in-process jit dispatch cannot execute tools; the grant machinery (composeToolGrant + GrantViolationError clamp) gates a capability that does not exist." Members: `call-agent` (call-agent-tool.ts:107 — same executeAgent), `run-work-order-loop` (work-order-loop.ts:141), and any future consumer treating an `.agent.yaml` `tools:` list as executable capability. NOT members: monitor classify calls and phantom-tool structured-output steps (no action expected — the primitive fits them). **Prior-art: untracked** — searches of framework-gaps titles (agent / grant / dispatch), issues (agent) found nothing covering it. Note a structural sibling in FGAP-008 (closed): "op-execution contract carries no DispatchContext channel" — same failure signature of a contract lacking the channel its consumers assume.

**Severity note.** This voids the work-order loop's core promise ("dispatch the work-order's target_agent" to do work): iteration 0 can never pass a real check that requires a side-effect, so every honest work-order fails/aborts, and the deterministic real-check (which worked correctly) is the only reason this surfaced as a clean failure instead of a false pass.

---

## Break 3 — the loop ignores four schema-required work-order fields

**Verification against current source (all claims re-checked, quotes):**

- Schema requires (read via `pi-context read-schema --schemaName work-orders --path properties.work_orders.items.required`): `["id","title","status","target_agent","input_contract","context_blocks","output_contract","scope","real_check_criteria"]`.
- `WorkOrderRecord` (work-order-loop.ts:73-78) declares only `id`, `target_agent`, `real_check_criteria?`, `scope?` — `input_contract` / `context_blocks` / `output_contract` are absent from the type and from the whole of pi-agent-dispatch loop sources (grep over work-order-loop.ts, run-work-order-loop-tool.ts, real-check-runner.ts: zero hits).
- Input hardcoded: `compileAgent(spec, { env, input: { work_order_id: wo.id }, cwd })` (work-order-loop.ts:119). `input_contract` never validated against anything.
- `context_blocks` never read (no reference anywhere).
- `output_contract` never validated: `agentResult.output` is stored raw into the iteration record (work-order-loop.ts:163, 181/192).
- Scope clamp: `composeToolGrant(agentGrant, spec.tools)` (work-order-loop.ts:134) intersects the TOOL-PARAM `agent_grant` (run-work-order-loop-tool.ts:32-36) with the spec's tools. `wo.scope.operations` is never an operand; `wo.scope` is consumed only as `wo.scope?.files` for the commit file list (work-order-loop.ts:167). The schema's own `scope` description PROMISES otherwise: "Bounds within which the agent may make edits / run commands. Used by the capability composer to clamp the agent's grant at dispatch" (read via read-schema `…properties.scope`). The engine does not honor the schema's stated contract.

**Root cause: schema authored ahead of the engine, never reconciled.** Git dates settle the direction: the work-orders schema landed 2026-05-27 as a full v1 contract (`7d06f616` "add work-orders block schema for FEAT-006 orchestrator-authored spec blocks (TASK-088)", mirrored to the samples catalog 2026-05-28 `b107fadd`); the loop landed one day later as the demo slice (`494357ac` 2026-05-28, TASK-091) implementing dispatch-by-name + real-check + commit + retry gate only. The contract fields (typed input, context injection, output validation, operation-scope clamp) were declared and shipped into the installable catalog (`packages/pi-context/samples/schemas/work-orders.schema.json`) with no engine behind them.

**Reproducible conditions.** File any schema-valid work-order whose `input_contract` requires fields beyond `work_order_id`, or whose `output_contract` the agent's output violates, or whose `scope.operations` is narrower than the caller's `agent_grant`: the loop dispatches identically, validates nothing, and clamps only against the caller's param. WO-001 itself demonstrates the scope case: `scope.operations: ["write"]` while the invocation granted `["write","bash"]` — `bash` survived composition.

**Class.** Yes — "schema-contract ahead of engine" recurs in this stack: `ContextBlockRef` in pi-jit-agents is a parsing-time contract whose compile semantics were deferred ("compileAgent does not yet honour these fields; this interface defines the parsing-time contract only" — types.ts:77-80, that one at least documented as deferred). The work-orders case is worse in kind because the schema text asserts present-tense engine behavior ("Used by the capability composer to clamp…") that does not exist, and the schema is catalog-installable into any substrate. **Prior-art: untracked in the active substrate.** The IDs the code cites (FEAT-006 "north-star loop", TASK-088, TASK-091, DEC-0044/0047/0018/0014-as-dispatch-decisions) belong to the FROZEN `.project`-era substrate: in the active `.context`, `resolve-items-by-id` returns DEC-0044/DEC-0047 = null, FEAT-006 = the pi-context `update` feature, TASK-088 = write-time invariant evaluation — an ID-collision trap for anyone tracing the loop's provenance from the active substrate (the tool's own doc still says "loads from .project/work-orders.json", run-work-order-loop-tool.ts:4).

---

## Break 4 — the agents tier didn't exist (target_agent unresolvable on the live substrate)

**Search order, confirmed (packages/pi-jit-agents/src/agent-spec.ts:219-243):** (1) `<contextDir>/agents/<name>.agent.yaml` (project tier — resolved via `tryResolveContextDir`, so `.context/agents/` here; the docblock's "{cwd}/.project/agents/" is stale wording from the `.project` era), (2) `~/.pi/agent/agents/`, (3) `builtinDir` **only when the caller supplies it**. `.pi/agents/` deliberately excluded (D3).

**Root cause is consumer wiring + install ceremony, not the loader.** The work-order loop and call-agent both construct the loader as `createAgentLoader({ cwd })` (work-order-loop.ts:116, call-agent-tool.ts:73) — no `builtinDir` — so tier 3 is skipped entirely. The 30+ real packaged specs live in `packages/pi-workflows/agents/` and `packages/pi-behavior-monitors/agents/`, but those are resolved by pi-workflows' SEPARATE loader whose builtin tier defaults to its own bundle (`packages/pi-workflows/src/agent-spec.ts:137` — `builtinDir ?? bundledDir("agents")`) and by monitors passing `AGENTS_DIR` explicitly (pi-behavior-monitors/index.ts:1356). pi-agent-dispatch ships no packaged agents and points at no bundle. Net: for work-order dispatch, `<contextDir>/agents/` is the only realistic tier — and nothing creates or seeds it:

- `context-init` / `accept-all` / `install` materialize the substrate dir, config, schemas, and starter blocks only (`packages/pi-context/src/context.ts:976, 1062`; install copies `installed_schemas[]`/`installed_blocks[]`). No `agents/` concept exists in the install ceremony or the samples catalog.
- The only in-band materializer of the tier is `author-agent-spec` itself, which mkdirs it on first authoring (`author-agent-spec-tool.ts:82-83`) — and that tool is interactively gated (Break 1). On a fresh substrate driven from `pi -p`, there is no path to a resolvable `target_agent` at all: Breaks 1 and 4 compound into "the loop's precondition cannot be produced in the loop's own operating context."

**Deliberate vs gap.** The three-tier design (D7) with consumer-supplied builtinDir is deliberate. The gap is the composition: a work-order engine whose target agents can only live in a tier that no ceremony seeds and whose sanctioned author is unreachable non-interactively.

**Reproducible conditions.** Fresh substrate (or delete `.context/agents/`), invoke run-work-order-loop → `AgentNotFoundError` listing exactly two search paths (`<contextDir>/agents/…`, `~/.pi/agent/agents/…`).

**Class.** Instance of "install ceremony seeds a subset of the surfaces the runtime resolves from" — schemas and blocks are seeded, agents are not (templates likewise have a project tier but ship package defaults). Also touches the FGAP-074-C3 loader-degradation lineage noted in the source comment (agent-spec.ts:222-225), which handled pointer-less repos but not empty-tier substrates. **Prior-art: untracked** (framework-gaps "tier" search: zero hits).

---

## Break 5 — final_status "aborted-by-human" with no human present

**Root cause.** On real-check failure before the last iteration, the loop calls `ctx.ui.confirm(...)` (work-order-loop.ts:200-209) and maps a falsy answer to `finalStatus = "aborted-by-human"`. In a `pi -p` session no UI context is attached, so `ctx.ui` is the runner's `noOpUIContext` whose `confirm: async () => false` (`runner.js:59-61`; `hasUI()` = `uiContext !== noOpUIContext`, runner.js:211-213). The gate silently auto-declines.

**Shape.** Two distinct defects share the line:

1. **Semantic mislabel:** no human was consulted; an environment default is recorded as a human decision. The result object is the loop's durable verdict (and a candidate harness input per FEAT-013's phase-state direction) — it lies about the actor. Contrast the auth-gate, which checks `ctx.hasUI` FIRST and emits a structurally distinct non-interactive reason (auth-gate.ts:156-161); the loop never inspects `hasUI` before asking.
2. **Retry path unreachable non-interactively:** `max_iterations > 1` is dead weight in exactly the context the harness would drive the loop from — every non-interactive run is single-shot, abort-on-first-failure. As pure degradation this direction is fail-SAFE (it never burns iterations unmonitored), so the current behavior is defensible as a default; but it is neither chosen nor reported as a policy, and there is no way to opt into non-interactive bounded retry (e.g. an explicit `on_fail: retry|abort` on the work-order — notably the sort of field the v1 schema contract would carry, tying this to Break 3's class).

**Reproducible conditions.** Any `pi -p` invocation of run-work-order-loop with a failing real check and `max_iterations ≥ 2` → exactly 1 iteration, `final_status: "aborted-by-human"`. The WO-001 probe is the standing reproduction.

**Class.** Instance of the FGAP-068 class (interactive-ceremony dependence inside a surface that is drivable non-interactively), plus a distinguishable sub-class: "ui.confirm's no-UI default is indistinguishable from an operator decline" — any `ctx.ui.confirm` call site that doesn't pre-check `hasUI` inherits it. Enumeration of that call-site class across packages was not performed here (fix-time Explore should sweep `ui.confirm` consumers). **Prior-art:** class tracked via FGAP-068 (closed, different instance); this instance and the mislabel untracked.

---

## Cross-cutting: the v1-contract / engine-subset diagnosis

Breaks 2, 3, and 5 are one architectural fact seen from three sides: **the work-order schema is a v1 contract whose engine implements a demo slice, sitting on a dispatch primitive that cannot act.** The schema (2026-05-27) declares typed input, context injection, output validation, and operation-scoped capability; the loop (2026-05-28) implements dispatch-by-name + deterministic real-check + attested commit + a retry gate; the primitive underneath (D4 executeAgent) was designed for classifiers and cannot execute a tool. The probe's outcome — correct-shaped output, no side-effect, honest real-check failure, mislabeled abort — is exactly what this stack must produce for ANY real work-order. Breaks 1 and 4 compound at the boundary: the only sanctioned way to produce a dispatchable agent is interactively gated, and no ceremony seeds the tier it must land in.

A fix at the level of any single symptom (e.g. wiring scope.operations into the clamp) leaves the load-bearing defect (no tool execution) untouched. The decision the orchestrator faces is architectural: either (a) the work-order loop dispatches its target agent as a pi SUBPROCESS (the one place real tools exist — the same mechanism workflow steps use), keeping executeAgent for classify/structured-output surfaces; or (b) executeAgent grows a real tool-execution loop with bound implementations (a major scope change to a deliberately-minimal library); or (c) work-orders are re-scoped to output-only agents (which contradicts the schema's scope/operations contract). That choice is the user's, not this report's.

Also worth surfacing: the loop/tool/type doc comments cite frozen-substrate IDs (`.project`-era FEAT-006 / TASK-088 / TASK-091 / DEC-0044 / DEC-0047 / DEC-0018 / DEC-0014) that now collide with unrelated active-substrate items of the same IDs — a provenance trap for future archaeology.

**CLI friction observed during this investigation (experience-gap data for the orchestrator, not filed):** `filter-block-items --op matches` compiles the value as a JS RegExp — `(?i)` is rejected, so case-insensitive prior-art search requires `[Ww]ord` workarounds; and the block-pi-context-glue hook rejects any `--value` containing `|`, making regex ALTERNATION inexpressible in a single sanctioned op call (multiple single-term calls are the workaround; the hook fired on a legitimate non-piped invocation).

## Findings table

| # | Break | Root cause (anchor) | Class | Prior-art | Severity |
|---|---|---|---|---|---|
| 2 | Dispatched agent cannot act — no tools bound | executeAgent is a single-turn completion primitive; `compiled.tools` consumed only by the grant clamp (jit-runtime.ts:488), never materialized; DispatchContext has no implementation channel (types.ts:195-234). Empirically: grant ["write","bash"] → child LLM receives ZERO tools | Yes — all in-process jit dispatch (call-agent, run-work-order-loop); grant machinery gates a nonexistent capability | UNTRACKED (FGAP-008 is a structural sibling, closed) | CRITICAL — loop's core promise void; every real work-order must fail |
| 3 | Four schema-required fields never consumed | Schema authored 1 day ahead of loop (7d06f616 2026-05-27 vs 494357ac 2026-05-28) as full v1 contract; loop implements subset — input hardcoded (:119), context_blocks/output_contract zero references, clamp uses tool param not wo.scope.operations (:134) while the schema's scope description promises the clamp | Yes — "schema-contract ahead of engine" (sibling: ContextBlockRef, types.ts:77) ; schema is catalog-installable with false present-tense contract text | UNTRACKED in active substrate (cited IDs are frozen-substrate) | HIGH — dead contract fields; schema text asserts a scope clamp that doesn't run |
| 1 | author-agent-spec refused in `pi -p` | Deliberate auth-gate: dispatchGatedTools (auth-gate.ts:67) + unconditional hasUI=false refusal (:156-161); no non-interactive alternative exists for the 8 pi-only gated tools (pi-context's 13 have CLI `--yes`) | Yes — hasUI=false auth-gate refusal class; plus gate-coverage inconsistency (ungated run-work-order-loop internally library-calls the commit the gated commit-attested tool protects, work-order-loop.ts:171) | TRACKED-CLOSED as class instance FGAP-068/FGAP-069 (caller-as-reconciler resolution); this instance untracked | MED-HIGH — sanctioned authoring path unusable in the loop's own operating context; forces hand-written bypass |
| 4 | Agents tier absent; target_agent unresolvable | jit loader project tier = `<contextDir>/agents/` (agent-spec.ts:226-232); loop/call-agent pass no builtinDir (:116/:73); no ceremony seeds the tier (install copies schemas+blocks only); only materializer is the gated author tool (author-agent-spec-tool.ts:82-83) | Yes — install-ceremony seeds a subset of runtime-resolved surfaces; compounds with Break 1 | UNTRACKED | MEDIUM — fresh-substrate loop precondition unproducible non-interactively |
| 5 | "aborted-by-human" with no human | `ctx.ui.confirm` on noOpUIContext resolves false (runner.js:59-61); loop maps false → aborted-by-human without checking hasUI (work-order-loop.ts:200-209) | Yes — FGAP-068 interactivity class + "no-UI confirm indistinguishable from decline" sub-class (all unchecked ui.confirm call sites) | Class TRACKED-CLOSED (FGAP-068); instance + mislabel untracked | MEDIUM — fail-safe direction but dishonest status; retry path structurally dead non-interactively |
