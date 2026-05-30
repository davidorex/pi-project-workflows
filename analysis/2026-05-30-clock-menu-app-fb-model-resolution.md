# Investigation: clock-menu-app FB model-resolution (FB-005 / FB-006 / FB-007)

## FB-005: Model field required at dispatch but optional in AgentSpec type

### Surface confirmed

**File:line citations:**

- `packages/pi-jit-agents/src/types.ts:25` — AgentSpec interface declares: `model?: string;`
- `packages/pi-agent-dispatch/src/call-agent-tool.ts:83` — callAgentTool.execute throws: `if (!modelSpec) { throw new Error(\`call-agent: agent '${params.spec_name}' has no model specified.\`); }`

**Claim refinement:** Claim confirmed exactly. The TypeScript type marks model as optional (`model?: string`), but the runtime dispatch rejects absence with error "no model specified". Type-to-runtime asymmetry is load-bearing: an agent spec with no model field passes TypeScript validation and type-checking but fails at call-agent runtime.

### Root cause

The model field is intentionally optional in the type definition to accommodate scenarios where the dispatch-caller is responsible for model selection (e.g., dispatch-caller supplies model via DispatchContext, or model selection is deferred to runtime policy). However, call-agent-tool.ts hardcodes a "reject if absent" policy at line 83 without attempting fallback to orchestration-agent settings or environment defaults.

**Intention vs. implementation gap:** The optional-type framing suggests 'model may be supplied elsewhere'; the error message "no model specified" states 'model must be specified before dispatch'. No fallback mechanism exists.

### Overlap with existing substrate

**DEC-0001 (enacted bb45880) verbatim:**
> Bare model ids in an agent spec resolve against the current session's configured provider via ExtensionContext. If ExtensionContext cannot supply a current-provider/current-model binding, the dispatch errors with a clear message naming the missing context. Fully-qualified model specs (provider/model) continue to pin the provider regardless of session.

**Verdict:** FB-005 is OUT-OF-SCOPE of DEC-0001/0002/0003 (which govern bare-id semantics, not the optional-vs-required dichotomy). DEC-0001 assumes model is present (either bare or fully-qualified); it does not address the case where the field is absent entirely.

**DEC-0003 (enacted 7ca1a33) widening verbatim:**
> Move parseModelSpec into pi-jit-agents as part of the executeAgent boundary. Remove the CONFIRMED duplicates at TWO sites: (a) packages/pi-behavior-monitors/index.ts:1173 (definition) + 1390 (call site); (b) packages/pi-workflows/src/step-monitor.ts:371 (definition) + 270 (call site). Consequence: pi-behavior-monitors' classifyViaAgent shrinks — it calls executeAgent with a compiled spec and an ExtensionContext, no longer doing its own provider resolution.

**Verdict:** DEC-0003 consolidates parseModelSpec but does not settle the optional-type question. Upstream discussion (FEAT-001, TASK-085) focuses on ExtensionContext.model availability, NOT on whether the spec field should be required.

**FGAP-115 (identified, 2026-05-26) verbatim:**
> DEC-0001 (enacted 2026-05-26) declares: 'Bare model ids in an agent spec resolve against the current session's configured provider via ExtensionContext.' Plan-mode exploration of pi-jit-agents internals (TASK-081 planning, 2026-05-26) empirically verified that pi-coding-agent's ExtensionContext does NOT expose currentModel or currentProvider fields.

**Verdict:** FGAP-115 identifies a blocking gap in DEC-0001 implementation but does not address FB-005's optional-type question.

**TASK-085 (blocked, status pending FGAP-115) verbatim acceptance criterion:**
> Bare model ids (e.g. 'claude-sonnet-4-6') resolve to (provider, modelId) tuple against session-canonical source per FGAP-115-determined mechanism

**Verdict:** TASK-085 assumes model is present (either bare or fully-qualified); it does not handle the optional-absent case.

**Net assessment:** FB-005 (optional-type asymmetry) is NET-NEW. It is not in scope of DEC-0001/0002/0003, FGAP-115, or TASK-085/086/087. It is a separate type-system question: should AgentSpec.model be optional or required in the type, given that call-agent rejects absence?

### Fix layer

**Code** — change AgentSpec.model from `model?: string` to `model: string` (required in type). Alternatively, call-agent-tool.ts must provide a fallback resolution path when model is absent. The optional type is misleading if dispatch requires the field. Pick one:
- Option A: make type required; cascade impacts all agent spec authors (all existing .agent.yaml files without model must be updated)
- Option B: provide fallback in call-agent (e.g. defer to orchestration-agent's default model if absent); keep type optional and honor the semantics

No amendment to DEC/FGAP/TASK substrate needed IF option B (fallback) is chosen and surfaces as a call-agent behavior contract. If option A (required type), this becomes a breaking change to AgentSpec that TASK-085/087 must account for when they refactor model resolution.

---

## FB-006: Model string requires provider prefix; no fallback to session-configured provider

### Surface confirmed

**File:line citations:**

- `packages/pi-agent-dispatch/src/call-agent-tool.ts:22` — parseModelSpec function: `if (slashIndex !== -1) return { provider: spec.slice(0, slashIndex), modelId: spec.slice(slashIndex + 1) }; return { provider: "anthropic", modelId: spec };`

**Claim refinement:** Claim confirmed exactly. Bare model strings without '/' are silently routed to `provider: "anthropic"` as a hardcoded fallback. A dispatch with model='deepseek-v4-pro' (no prefix) resolves to `{ provider: "anthropic", modelId: "deepseek-v4-pro" }`, which is not a valid Anthropic model. The error message "not found in modelRegistry" appears only at registry-lookup time (line 87), not at parse time. No fallback to orchestration-agent settings (ExtensionContext) is attempted.

### Root cause

**Direct cause:** parseModelSpec at call-agent-tool.ts:22 has a hardcoded fallback. The function does not have access to ExtensionContext or session provider information; it only sees the bare string.

**Architectural cause:** parseModelSpec is currently in call-agent-tool.ts (caller layer), not in pi-jit-agents/runtime (execute boundary). DEC-0001 and DEC-0003 both enact moving parseModelSpec to the execute boundary INSIDE pi-jit-agents, where (potentially) ExtensionContext is accessible. Until that move happens, parseModelSpec has no path to session-provider context.

**Control-flow gap:** Even AFTER the move to pi-jit-agents (per DEC-0003 enactment 7ca1a33), FGAP-115 identifies that ExtensionContext does not expose currentModel/currentProvider. The move alone does NOT solve FB-006 unless FGAP-115 resolution adds the ExtensionContext fields or relocates the canonical source.

### Overlap with existing substrate

**DEC-0001 (enacted bb45880) verbatim:**
> Bare model ids in an agent spec resolve against the current session's configured provider via ExtensionContext.

**DEC-0003 (enacted 7ca1a33 and widened cfbb211) verbatim consequence:**
> pi-jit-agents gains model-spec-parsing inside the executeAgent dispatch path — as an internal (non-exported) helper at the executeAgent boundary. The four-boundary-surfaces declaration of jit-agents-spec.md §2 stands; the 'either helper / or inlined' hedge is resolved to the inlined-or-internal-helper form by canon.

**FGAP-115 (identified 2026-05-26) verbatim:**
> The canonical-source DEC-0001 assumed does not exist where canon thought it did. Three resolution paths: (a) extend pi-coding-agent's ExtensionContext to expose currentModel/currentProvider — upstream dependency change; (b) sourceful resolution from auth.json + env at jit-agents level (no ExtensionContext dependency); (c) re-anchor DEC-0001 to reflect actual resolution source (Model<Api> already pre-resolved in DispatchContext; the 'bare model id' problem disappears because resolution happens BEFORE executeAgent receives the dispatch).

**TASK-085 (blocked) verbatim:**
> HARD-BLOCKED until FGAP-115 resolves; status:blocked reflects that. Implementation surface determined post-FGAP-115.

**TASK-087 (blocked) verbatim:**
> NOTE the entanglement with FGAP-115: if executeAgent owns model resolution internally, it needs access to the canonical session-source (auth.json / ExtensionContext / re-anchored alternative). The FGAP-115 resolution determines what source the internal helper consumes.

**Net assessment:** FB-006 is DIRECTLY IN SCOPE of DEC-0001, DEC-0003, FGAP-115, and TASK-085/087. It is the exact problem DEC-0001 enacts, but the enactment is BLOCKED by FGAP-115 (ExtensionContext.currentModel does not exist). FB-006 is NOT net-new; it is a CURRENTLY-BLOCKED substrate item. The substrate acknowledges the gap and has filed it as a P1 blocker (FGAP-115 status="identified", priority="P1").

### Fix layer

**DEC-level (via FGAP-115 resolution)** — User decision required on FGAP-115 path selection: (a) extend pi-coding-agent ExtensionContext, (b) read auth.json directly in pi-jit-agents, (c) re-anchor DEC-0001 to reflect actual call-site responsibility. Post-resolution, TASK-085/087 implement the model-resolution mechanism at the correct boundary. No code path currently unblocks FB-006 without FGAP-115 closure.

---

## FB-007: No tool to discover dispatch-registry models; user-level models.json not consulted

### Surface confirmed

**File:line citations:**

- No tool exists in pi-agent-dispatch to list available models in the dispatch registry
- `packages/pi-agent-dispatch/src/call-agent-tool.ts:86` — model lookup: `const model = ctx.modelRegistry.find(provider, modelId);` followed by error "not found in modelRegistry"
- Verified via codebase search: no `list-models` / `list-dispatch-models` / `discover-models` Pi tool registered

**Claim refinement:** Claim confirmed exactly. There is no discoverable interface to show which (provider, modelId) combinations are valid for agent dispatch. The modelRegistry is populated by pi-agent-core (ExtensionContext.modelRegistry) and is opaque to the author. A user-level models.json exists but is never consulted by the dispatch path (parseModelSpec + modelRegistry.find()).

### Root cause

**Direct cause:** The modelRegistry is an in-memory collection provided by pi-agent-core at dispatch time. It is populated from configuration sources unknown to pi-agent-dispatch (likely pi's auth.json or equivalent). There is no tool surface to query it, and no integration with the user-level models.json substrate block.

**Architectural cause:** Pi-agent-dispatch (the call-agent tool) lives in the harness; the modelRegistry lives in the orchestrator (pi-agent-core). The two operate at different layers. There is no bridge tool to surface modelRegistry contents to the user or to the main LLM.

**Policy gap:** Even if the tool existed, it is unclear whether it should show (a) all models in the global modelRegistry (orchestrator view), (b) models available under the current auth config (session-scoped view), or (c) models declared in user-level models.json (substrate view). The three views can differ significantly.

### Overlap with existing substrate

**FGAP-115 (identified 2026-05-26) verbatim note:**
> Unknown where the dispatch model registry is populated from. The ExtensionContext.modelRegistry is provided by the pi framework. models.json exists at user level but dispatch doesn't appear to use it.

**Verdict:** FGAP-115 identifies the same gap: "dispatch doesn't appear to use [models.json]". However, FGAP-115 is filed against the currentModel/currentProvider ExtensionContext question (DEC-0001 implementation blocker), NOT against the discovery-tool question.

**Existing substrate scope:** No DEC, FGAP, TASK, or FEAT item explicitly covers tool-surface discovery of dispatch models. This is net-new relative to the filed substrate.

### Fix layer

**Tool surface** — Create a new Pi tool (e.g. `list-dispatch-models` / `discover-agent-models`) in pi-agent-dispatch/index.ts that queries ctx.modelRegistry and returns (provider, modelId, provider/modelId combined) tuples. Per DEC-0019/0020 dual-surface canon, also create a scripts/orchestrator/list-dispatch-models.ts CLI script. Documentation should clarify: (a) the tool shows models available at dispatch time under the current auth config (not a static list), (b) users cannot pre-author an exhaustive model list because the modelRegistry is orchestrator-populated. Optionally: integrate models.json if a design decision makes it a registry source (would require DEC amendment to clarify policy).

---

## Cross-cutting synthesis: FB-006 and FB-015 (zero-token silent success)

**FB-015 (from parallel investigation) verbatim:**
> When call-agent dispatches with a model string that parseModelSpec resolves incorrectly (e.g., no '/' defaults to anthropic), the dispatch 'succeeds' but the API returns zero tokens with empty content. The tool reports 'Dispatched agent X; result.output type=string' — no error is raised. The session log shows content: [], usage: { input: 0, output: 0 }. The orchestrator has no indication that the agent produced nothing.

**Chain mapping:**

1. **Model string parsing (FB-006):** `model: 'deepseek-v4-pro'` → parseModelSpec → `{ provider: 'anthropic', modelId: 'deepseek-v4-pro' }`
2. **Model lookup fails silently:** `ctx.modelRegistry.find('anthropic', 'deepseek-v4-pro')` → returns undefined (model not in registry)
3. **Current call-agent behavior (line 87):** throws error "model not found in modelRegistry"
4. **Expected behavior per FB-015 report:** dispatch succeeds with zero tokens + empty output (contradicts current throw at line 87)

**Resolution:** The contradiction between FB-006's reported error ("not found in modelRegistry") and FB-015's reported success (zero-token dispatch) suggests either: (a) FB-015 is from a different code path (e.g. call-agent-tool.ts pre-line 87, or a different dispatch surface like work-order-loop.ts), (b) the zero-token success happens at a different layer (pi-ai completion returns empty array instead of throwing). Investigation required. Assumed path for canonical fix:

- **Layer 1 (FB-006 root):** parseModelSpec defaults to 'anthropic' → DEC-0001/FGAP-115 fix moves model resolution to execute boundary with fallback to session provider
- **Layer 2 (FB-015 consequence):** API call receives incorrect model (anthropic when session is openrouter) → API rejects silently or returns zero tokens → need to detect and error (not silently succeed)
- **Canonical fix:** (1) Resolve FGAP-115 so model resolution uses session provider, eliminating the anthropic default; (2) Add validation after model-registry lookup to catch missing models and error before dispatch (call-agent-tool.ts already does this at line 87; ensure no path bypasses it)

---

## Mandate-7: Other gaps discovered during investigation

### Gap 1: parseModelSpec is call-site-duplicated

**Evidence:** DEC-0003 widening (cfbb211, 2026-05-26) identified TWO additional parseModelSpec implementations:
- packages/pi-behavior-monitors/index.ts:1173 (definition) + 1390 (call site)
- packages/pi-workflows/src/step-monitor.ts:371 (definition) + 270 (call site)

**Status:** Acknowledged in DEC-0003 enacted and widened. TASK-087 is filed to move both to pi-jit-agents as an internal helper. Currently blocked on FGAP-115.

### Gap 2: ExtensionContext.currentModel does not exist (FGAP-115)

**Evidence:** TASK-081 plan-mode exploration (2026-05-26) verified that pi-coding-agent's ExtensionContext does NOT expose currentModel or currentProvider fields.

**Current status:** FGAP-115 filed at P1, status="identified". TASK-085/086/087 all blocked. User decision required on resolution path.

### Gap 3: call-agent-tool returns only status summary, not agent output

**Evidence:** From FB-009 in usage-feedback.json:
> call-agent returns a success message like 'Dispatched agent X (grant=[...]); result.output type=string' but does not include the agent's actual output content.

**Relation to FB-005/006/007:** Not directly related. However, combined with FB-015 (zero-token success), this means the orchestrator cannot detect when an agent produced nothing. The tool result should include the output or flag emptiness explicitly.

**Surface:** call-agent-tool.ts line 114 returns only summary text; agent output is in result.output but not surfaced.

### Gap 4: Type vs. runtime asymmetry on optional fields is structural

**Evidence:** AgentSpec has multiple optional fields (model?, thinking?, tools?, extensions?, skills?) that are effectively required at dispatch or have silent fallbacks:
- model: required at dispatch (error "no model specified") — FB-005
- thinking: silently dropped when toolChoice is forced — DEC-0002 (enacted, fix in TASK-086)
- tools: empty array is a valid runtime state, no error (not a gap)
- extensions / skills: unclear if optional or required; needs audit

**Relation to FB-005:** This is a broader class of which FB-005 is one instance. The pattern suggests a need for clearer contract between AgentSpec type definition and runtime enforcement.

---

## Summary table: Fix-layer verdict per FB item

| FB ID | Issue | Root cause | Fix layer | Status | Blocker |
|-------|-------|-----------|-----------|--------|---------|
| FB-005 | model field optional in type, required at dispatch | Type-vs-runtime asymmetry; no fallback semantics defined | Code (call-agent-tool.ts line 83: add fallback or require type) | NEW | None — decision point |
| FB-006 | Bare model strings default to anthropic; no session-provider fallback | parseModelSpec hardcoded fallback + moved to wrong layer + ExtensionContext.currentModel doesn't exist | DEC-level (FGAP-115 resolution determines source); then Code (TASK-085/087) | BLOCKED | FGAP-115 (P1) |
| FB-007 | No tool to discover dispatch-registry models | modelRegistry is opaque; no query interface exists | Tool surface (list-dispatch-models + dual-surface CLI) | NEW | None — straightforward implementation |

---

## Substrate-overlap matrix

| Item | DEC-0001 | DEC-0002 | DEC-0003 | FGAP-115 | TASK-085 | TASK-086 | TASK-087 | Scope outcome |
|------|----------|----------|----------|----------|----------|----------|----------|---------------|
| FB-005 | No | No | No | No | No | No | No | **Net-new.** No substrate item addresses optional-vs-required dichotomy. |
| FB-006 | YES direct scope | No (thinking-seam only) | YES (parseModelSpec move) | YES blocking | YES blocked | No | YES blocked | **In substrate (blocked).** DEC-0001/0003 enact fix; FGAP-115/TASK-085/087 implement. Waiting on FGAP-115 user decision. |
| FB-007 | No | No | No | No | No | No | No | **Net-new.** No substrate item covers dispatch-model discovery tool surface. |

**Discovered-gaps count:** 4
1. parseModelSpec is duplicated at 2 call sites (acknowledged in substrate, TASK-087 scope)
2. ExtensionContext.currentModel does not exist (FGAP-115, P1 blocker)
3. call-agent does not surface agent output (FB-009, separate defect)
4. Type-vs-runtime asymmetry is structural; FB-005 is one instance; audit needed for other optional fields

