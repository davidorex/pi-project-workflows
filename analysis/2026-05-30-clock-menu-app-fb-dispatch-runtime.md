# clock-menu-app FB Dispatch-Runtime Investigation
**2026-05-30 | FB-008, FB-009, FB-015, FB-016, FB-018 + Single-Turn-Dispatch Gap**

---

## FB-008: parent_grant + requested_grant Effectively Required Despite Type.Optional

### Surface Confirmed
**File:** `/Users/david/Projects/workflowsPiExtension/packages/pi-agent-dispatch/src/call-agent-tool.ts` (lines 48-56)
```typescript
parent_grant: Type.Optional(
    Type.Array(Type.String(), { description: "The caller's own tool grant. Default-empty." }),
),
requested_grant: Type.Optional(
    Type.Array(Type.String(), {
        description: "The grant requested for the dispatched sub-agent. Will be clamped to the intersection with parent_grant.",
    }),
),
```

**File:** `/Users/david/Projects/workflowsPiExtension/packages/pi-jit-agents/src/jit-runtime.ts` (lines 488-491)
```typescript
const violating = computeGrantViolation(compiled.tools, dispatch.parentGrant);
if (violating.length > 0) {
    throw new GrantViolationError(compiled.spec.name, violating);
}
```

**File:** `/Users/david/Projects/workflowsPiExtension/packages/pi-jit-agents/src/jit-runtime.ts` (lines 90-95)
```typescript
function computeGrantViolation(childTools: string[] | undefined, parentGrant: string[] | undefined): string[] {
    const child = childTools ?? [];
    const parent = parentGrant ?? [];
    const parentSet = new Set(parent);
    return child.filter((t) => !parentSet.has(t));
}
```

**Confirmed.** Both parameters are `Type.Optional`, but `composeToolGrant` treats missing grants as empty sets (`parentGrant ?? []`). When an agent declares `tools: [read]` and no `parent_grant` is passed, the intersection is empty, triggering `GrantViolationError`. The parameters are type-optional but functionally required when tools are declared.

### Root Cause
Default-empty semantics per DEC-0047 (capability-clamp): neither `parentGrant` nor the agent's `tools` inherit implicitly. The child grant must be an explicit subset of the parent's. When `parentGrant` is absent (defaults to `[]`), no tools can be granted to the child, regardless of what the spec declares.

### Fix Layer
**Tool surface (call-agent-tool.ts):** `parent_grant` parameter description should state: "The caller's own tool grant. **Required when the agent declares tools.** Defaults to empty array; agents cannot acquire tools not explicitly granted by parent." OR: compute `parent_grant` from the orchestration context when absent (pipe through ExtensionContext).

**Alternatively (DEC layer):** Establish a documented axiom that dispatch-sites MUST pass the orchestrator's full tool set as `parent_grant` when dispatching agents that declare tools — make it a schema-level or documentation requirement, not a silent default.

### Related Substrate
- **DEC-0047** (`decisions.json`): "child's tool grant must be a subset of caller's parent grant. Undefined on either side means empty set (default-empty: capability is never implicitly inherited)"
- **TASK-081** (cited in call-agent-tool.ts header): "clamp enforces child ⊆ parent at executeAgent boundary"
- **FEAT-005** (cited in call-agent-tool.ts header): "capability composition (operation-granular from empty)"

---

## FB-009: call-agent Returns Only Status Summary — Agent Output Not Surfaced

### Surface Confirmed
**File:** `/Users/david/Projects/workflowsPiExtension/packages/pi-agent-dispatch/src/call-agent-tool.ts` (lines 109-117)
```typescript
return {
    details: result,
    content: [
        {
            type: "text",
            text: `Dispatched agent '${params.spec_name}' (grant=[${composedGrant.join(", ")}]); result.output type=${typeof result.output}`,
        },
    ],
};
```

**Confirmed.** The tool returns `details: result` (which includes `output`, `raw`, and `usage`) but the `content` array contains only a status string naming the output's type, NOT its actual value. The `details` field is included in the `AgentToolResult` shape but is not rendered to the orchestrator as text/code content.

### Root Cause
`AgentToolResult` from pi-ai carries a `details` field (arbitrary metadata), but pi-ai's tool-result rendering pipeline does not automatically surface `details` as content. The `content` array is the visible surface; `details` is metadata. call-agent embeds the agent's result in `details` but does not transcribe it into `content`. The orchestrator cannot read the agent's output without inspecting the underlying session logs or the `details` field (if the pi harness exposes it).

### Fix Layer
**Tool surface (call-agent-tool.ts, line 114):** Include the agent's actual output in the `content` array:
```typescript
const outputText = typeof result.output === "string" 
    ? result.output 
    : JSON.stringify(result.output, null, 2);
content: [
    {
        type: "text",
        text: `Dispatched agent '${params.spec_name}' (grant=[${composedGrant.join(", ")}]):\n\n${outputText}`,
    },
],
```

This surfaces the agent's output directly in the tool result without requiring session log inspection.

### Related Substrate
- **TASK-081** (call-agent-tool.ts header): dispatch boundary
- **Issue-009** (FB-009 usage-feedback): "call-agent returns status summary only"

---

## FB-015: Zero-Token Dispatches with Wrong Model Produce No Error — Silent Empty Output

### Surface Confirmed
**File:** `/Users/david/Projects/workflowsPiExtension/packages/pi-agent-dispatch/src/call-agent-tool.ts` (lines 85-90)
```typescript
const { provider, modelId } = parseModelSpec(modelSpec);
const model = ctx.modelRegistry.find(provider, modelId);
if (!model) {
    throw new Error(`call-agent: model '${modelSpec}' not found in modelRegistry for agent '${params.spec_name}'.`);
}
```

**Partially confirmed.** If the model string fails to parse or is not in the registry, an error is thrown BEFORE dispatch. However, the concern in FB-015 is that a model-string that parses but resolves to an invalid provider/modelId pair may not error at the framework level — the API call may succeed with zero tokens and empty content, reported as success.

Tracing through: `parseModelSpec` (line 19-23) defaults bare ids to `provider: "anthropic"`. If `"claude-sonnet-4-20250514"` is used without a provider prefix, it resolves to `{ provider: "anthropic", modelId: "claude-sonnet-4-20250514" }`. If that model is not in the registry, line 87 throws. If the model IS in the registry but the API returns zero tokens (e.g., model not available in the provider), there is no framework-level zero-token detection.

**Framework zero-token handling:**
**File:** `/Users/david/Projects/workflowsPiExtension/packages/pi-jit-agents/src/jit-runtime.ts` (lines 404-417)
```typescript
function usageFromMessage(msg: AssistantMessage): JitAgentResult["usage"] {
    const usage = emptyUsage();
    if (!msg.usage) return usage;
    usage.input = msg.usage.input ?? 0;
    usage.output = msg.usage.output ?? 0;
    // ... cost calculation
    return usage;
}
```

No check for `usage.output === 0` or `usage.input === 0`. The result is returned unchanged. Wrapped by call-agent (line 114), a zero-token response reports as `result.output type=string` (or type=object if schema-bound) with empty content.

### Root Cause
Framework-level zero-token responses (input=0, output=0) are treated as successful dispatches, not errors. The pi-ai `complete` call succeeds but returns an empty AssistantMessage. ExecuteAgent extracts text or validates schema but does not check whether the API actually produced tokens. A silent API failure (model not available, provider quota exhausted, etc.) looks identical to a successful dispatch that produced no output.

### Fix Layer
**Runtime boundary (jit-runtime.ts, after line 640):** After extracting `usage`, check for zero-token responses:
```typescript
const usage = usageFromMessage(response);
if (usage.totalTokens === 0) {
    throw new AgentDispatchError(
        compiled.spec.name,
        `zero-token response from model ${modelToString(dispatch.model)} — possible API failure or model unavailability`,
        { stopReason: response.stopReason }
    );
}
```

### Related Substrate
- **Issue-015** (FB-015 usage-feedback): "zero-token dispatches silent"

---

## FB-016: Session Logs Are Only Place to See Dispatch Details — No Query Tool

### Surface Confirmed
**File:** `/Users/david/Projects/workflowsPiExtension/packages/pi-jit-agents/src/jit-runtime.ts` (lines 204-212)
```typescript
function safeWriteTrace(entry: unknown, tracePath: string): void {
    try {
        writeAgentTrace(entry, { tracePath });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[pi-jit-agents] trace write failed (${tracePath}): ${msg}`);
    }
}
```

**Confirmed.** Dispatch details are written to `.pi/agent/sessions/<project>/<timestamp>.jsonl` via `safeWriteTrace`. There is no tool to query or list recent dispatch results. The orchestrator must grep the JSONL files manually or rely on call-agent's returned `details` field (which FB-009 shows is not surfaced as content).

### Root Cause
The trace pipeline (`writeAgentTrace`, `trace-writer.ts`) is designed for post-hoc analysis and audit, not real-time query. There is no indexing, no query surface, no tool to fetch recent dispatch details by agent name or timestamp. The framework assumes orchestrators will either (a) read the trace files themselves, (b) rely on tool result content (which doesn't include agent output per FB-009), or (c) inspect session logs.

### Fix Layer
**Tool surface (pi-agent-dispatch):** Create a new tool `query-agent-dispatch` that reads recent dispatch traces and returns them as filtered, paginated results:
```
query-agent-dispatch(agent_name?: string, limit?: 10, offset?: 0) 
  -> { dispatches: [{timestamp, agent, model, output, usage, stopReason}] }
```

Internally: scan `.pi/agent/sessions/` directories, parse JSONL entries, filter by agent_name, sort by timestamp descending, return paginated results.

### Related Substrate
- **Issue-016** (FB-016 usage-feedback): "no tool to query dispatch details"
- **DEC-0005** (pi-jit-agents header comment): "intentional independence of trace from classify"

---

## FB-018: output.format: text Combined with tools Biases Model Toward Prose Instead of Tool Invocation

### Surface Confirmed
**File:** `/Users/david/Projects/workflowsPiExtension/packages/pi-jit-agents/src/jit-runtime.ts` (lines 566-570)
```typescript
if (compiled.outputSchema) {
    const phantomTool = buildPhantomTool(compiled.outputSchema);
    context.tools = [phantomTool];
    options.toolChoice = normalizeToolChoice(dispatch.model.api, phantomTool.name);
}
```

**Confirmed.** When `compiled.outputSchema` is set, a phantom tool is registered and forced toolChoice is enabled. However, the system prompt and task prompt are rendered from the agent spec's `systemPrompt` and `taskPrompt` fields — which may contain explicit guidance about tool use. When the spec also declares `output.format: text`, the model may interpret the format constraint as primary and treat the tool-use instructions as secondary guidance.

In the case of spec-requirements-miner: `output.format: text` with `tools: [read, append-block-item]` produced prose description ("I will start by reading...") with zero tool calls, despite explicit tool-use instructions in the system prompt.

### Root Cause
The `output.format` field is a compile-time hint that **does not** affect the dispatch. It is NOT passed to the pi-ai `complete` call. The format is intended for post-hoc validation or result interpretation by the agent author, not for the LLM. However, the text format may be present in the rendered prompt (if the template includes a statement like "output as plain text"), which biases the model away from structured tool use. Alternatively, the format may be baked into the system prompt as part of the agent's declared instructions, creating a conflict with the forced toolChoice semantic (which signals to the model that tool invocation is the primary output form).

The framework does not enforce consistency: `output.format: text` + `tools: [...]` is a valid agent spec per the schema, but it produces incoherent dispatch behavior — the format says "text", the tools say "structured calls".

### Fix Layer
**Compile-time validation (compile.ts, compileAgent function):** Add a check after compilation:
```typescript
if (spec.outputSchema && spec.outputFormat === "text") {
    throw new AgentCompileError(
        spec.name,
        `conflicting output.format 'text' and outputSchema (or tools with inferred schema). Use output.format 'json' or remove outputSchema.`
    );
}
if (spec.tools && spec.tools.length > 0 && spec.outputFormat === "text") {
    console.warn(`[pi-jit-agents] agent '${spec.name}': output.format 'text' with tools[] may bias model away from tool use. Consider output.format 'json'.`);
}
```

**Alternatively (schema level):** Make `outputSchema` and `outputFormat: text` mutually exclusive in the AgentSpec schema, or require `outputFormat: json` when tools are declared.

### Related Substrate
- **Issue-018** (FB-018 usage-feedback): "text format + tools biases against tool invocation"
- **DEC-0002** (decisions.json): "thinking-seam enforcement" — similar config-interaction enforcement pattern

---

## Suspected Gap: Single-Turn Dispatch (No Tool-Result Loop)

### Surface: executeAgent Loop Structure

**File:** `/Users/david/Projects/workflowsPiExtension/packages/pi-jit-agents/src/jit-runtime.ts` (lines 432-738)

**Critical finding:** `executeAgent` contains **NO LOOP** over tool calls and results. The structure is:

1. **Line 550:** `let response: AssistantMessage;`
2. **Lines 551-617:** Single `try` block with ONE call to `completeFn` (pi-ai complete):
   ```typescript
   response = await completeFn(dispatch.model as Model<Api>, context, options);
   ```
3. **Lines 619-638:** Emit classify_response trace entry ONE TIME.
4. **Lines 642-695:** Extract output from response (ONE-SHOT):
   - If `compiled.outputSchema`: find ONE toolCall in response.content, extract arguments
   - Else: extract text from response (ONE pass over content array)
5. **Lines 701-735:** Emit verdict_decision and trace_end.
6. **Line 737:** `return result;` — function exits.

**No loop detected.** Grep confirms no `while`, `for`, or iteration over tool calls:
```
for (let i = 9; i >= 0; i--) ...  // ULID generation, not tool loop
for (let i = 0; i < 16; i++) ...  // ULID generation, not tool loop
for (const [k, v] of Object.entries(...)) ...  // deepRedact utility, not tool loop
for (const [collectorId, collectedValue] of Object.entries(...)) ...  // context collection, not tool loop
for (const [key, propSchema] of Object.entries(...)) ...  // schema parsing, not tool loop
```

No tool-call iteration. No dispatch loop that reads tool results and sends them back to the model.

### Agentic Loop Verification

Per jit-agents-spec.md §4 (cited in jit-runtime.ts header), the "unified executeAgent primitive" is described as a dispatch boundary that "executes" an agent. The spec does NOT promise multi-turn or agentic-loop semantics — only that it produces a result after one LLM call with optional forced toolChoice.

Comparison to standard agentic loop (e.g., Claude SDK agents example):
1. Call model with tools
2. Extract tool calls from response
3. Execute each tool call
4. Append tool results to message history
5. Call model again with enriched history
6. Repeat until stop_reason is "end_turn" or similar

executeAgent (jit-runtime.ts) does NONE of steps 3-6. It stops after step 2 (extract from single response).

### Root Cause
**Architectural decision:** The phantom-tool pattern (jit-runtime.ts lines 566-570) uses forced toolChoice to constrain the model's output to a single predetermined tool. When a tool is "forced", the model CANNOT emit free text and MUST emit a tool call. The resulting dispatch is therefore always single-turn: the model emits one response (which, under forced toolChoice, must be a tool call), and the framework extracts it.

Multi-turn dispatch would require the framework to actually INVOKE the tools (call `read`, `append-block-item`, etc. in the orchestration context), which is not the responsibility of a JIT (Just-In-Time) agent runtime that lives inside a consumer tool (pi-agent-dispatch, pi-workflows, pi-behavior-monitors). Those consumers own tool invocation.

**Implication:** When an agent spec declares `output.format: text` + `tools: [read, append-block-item]`, the combination is incoherent:
- `output.format: text` signals free-form prose output expected
- `tools: [...]` signals tool invocation expected
- No `outputSchema` → no forced toolChoice → model is free to emit text
- Model sees conflicting signals and chooses text (FB-018 outcome)

If `outputSchema` were set (forced toolChoice), the model would be forced to call the phantom tool, not the declared tools. The declared `tools` array in the spec is purely declarative — it declares what tools the agent intends to use, but executeAgent does NOT wire them to the model.

### Verdict: CONFIRMED (with architectural context)

**Single-turn dispatch is real and intentional.** The dispatch is single-turn because:
1. ExecuteAgent makes one call to `complete()`
2. Phantom-tool forced toolChoice produces one ToolCall in response
3. ExecuteAgent extracts that call's arguments and returns
4. No loop. No tool invocation. No message history enrichment.

Tool invocation is the responsibility of the ORCHESTRATOR (the caller of executeAgent), not executeAgent itself. An orchestrator that wants multi-turn agentic semantics must implement its own loop: call executeAgent, extract output, dispatch tools declared in the output, collect results, call executeAgent again with enriched context, repeat.

**FB-018 is a misuse**: declaring both `output.format: text` (signals prose) and `tools: [...]` (signals tool invocation) is contradictory. The spec author expected executeAgent to invoke the tools and return results, but executeAgent is single-turn and tool-agnostic. The tools were never wired to the model.

### Related Substrate
- **jit-agents-spec.md §4** (header comment, line 4-7): "unified executeAgent primitive"
- **DEC-0049** (implied in FEAT-001, features.json): "uniform-agent axiom forbids the duplication"
- **TASK-081** (call-agent-tool.ts header): "dispatch boundary" (not agentic-loop boundary)

---

## Cross-Cutting Synthesis

### Compounding Failure Patterns

1. **"Agent never wrote anything" end state:**
   - FB-018: `output.format: text` + `tools: [...]` → no tool calls because tools not wired
   - **Single-turn dispatch** (confirmed): no loop to retry/re-invoke after tool results
   - **Result:** Agent renders prose description, zero tool invocations, orchestrator sees "output type=string" with empty or descriptive text

2. **"Orchestrator can't see what happened" end state:**
   - FB-009: call-agent returns status summary, agent output NOT in content
   - FB-015: zero-token response looks like success, no warning
   - FB-016: session logs are only audit trail, no query tool
   - **Result:** Orchestrator receives `result.output type=string` from call-agent, cannot see the actual content without grepping logs or unpacking `details` field

3. **FB-008 orthogonal:** Grant violation is unrelated to output surfacing or dispatch turns. It is a capability-grant enforcement that fires BEFORE dispatch, preventing tool-enabled agents from running without explicit parent grant.

### Canonical Fix Proposal

**Layer 1: Agent Authoring (FB-018 fix)**
- Agent schema validation: reject `output.format: text` + `tools: [...]` combination
- Guidance: use `output.format: text` for free-form text agents; use `outputSchema` + forced toolChoice for structured-output agents. Do not mix.

**Layer 2: Dispatch Output Surfacing (FB-009 fix)**
- call-agent-tool.ts: Include agent's actual output in `content` array, not just `details` metadata
- Orchestrator receives both status + actual output in one tool result

**Layer 3: Zero-Token Detection (FB-015 fix)**
- jit-runtime.ts: After response received, check `usage.totalTokens === 0`
- Throw AgentDispatchError instead of returning success with empty content

**Layer 4: Query Infrastructure (FB-016 fix)**
- Implement `query-agent-dispatch` tool to read recent traces
- Orchestrator can query dispatch history without grepping logs

**Layer 5: Grant Defaults (FB-008 fix)**
- call-agent-tool.ts documentation: clearly state that `parent_grant` is required when agent declares tools
- OR: compute parent_grant from orchestration context when absent (if ExtensionContext exposes caller's tool set)

### Single-Turn Dispatch Constraint (Architectural)

- **Do NOT attempt to add a loop inside executeAgent.** Single-turn is correct per the phantom-tool architecture.
- **Orchestrators that need agentic loops must implement them:** call executeAgent, extract output, dispatch declared tools, collect results, loop.
- **Future work (post-Mandate-004):** Consider an orchestrator-level `run-work-order-loop` or similar that wraps executeAgent with agentic semantics.

---

## Discovered Gaps (Mandate-7)

1. **Grant defaults interaction:** When agent declares tools, parent_grant becomes functionally required but is type-optional. No framework-level default from orchestration context (ExtensionContext). Schema mismatch is silent.

2. **Format-vs-tools conflict:** No compile-time or runtime check for contradictory `output.format: text` + `tools: [...]`. Agent authors can declare both unknowingly.

3. **Zero-token silent success:** API calls that return empty responses (model unavailable, provider quota, etc.) are indistinguishable from successful empty output. Framework should error on zero-token responses.

4. **Output not surfaced:** Dispatch result `output` field is embedded in `details` metadata, not in `content` array. Orchestrator cannot read output without accessing details or logs.

5. **No dispatch query tool:** Session logs are write-only audit trail. No tool to read recent dispatch results or filter by agent/timestamp.

---

## Summary Table

| FB | Issue | Fix Layer | Root Cause | Severity |
|---|---|---|---|---|
| FB-008 | Grant violation without parent_grant | Tool surface / Schema | Type-optional but functionally required; no context default | Friction |
| FB-009 | Agent output not surfaced | Tool surface (call-agent-tool.ts) | Output in details, not content | Friction |
| FB-015 | Zero-token silent success | Runtime (jit-runtime.ts) | No zero-token detection | Friction |
| FB-016 | No dispatch query tool | Tool surface (new tool) | Trace is audit-only, no query | Friction |
| FB-018 | text format + tools incoherent | Schema + compile-time validation | Conflicting signals, no enforcement | Blocking |
| Single-turn | No tool-result loop | *Architectural (intentional)* | Phantom-tool single-shot; agentic loop is orchestrator's job | N/A (confirmed intentional) |

---

**Generated:** 2026-05-30  
**Verbatim code citations:** call-agent-tool.ts (lines 48-56, 109-117, 85-90, 19-23); jit-runtime.ts (lines 488-491, 90-95, 404-417, 640, 550-617, 642-695, 701-735, 737, 566-570); capability-composer.ts (lines 14-18); compile.ts  
**Related substrate items:** DEC-0047 (capability-clamp), DEC-0002 (thinking-seam), DEC-0049 (uniform-agent), FEAT-005 (capability composition), FEAT-001 (jit-agents consumer migration), TASK-081 (dispatch boundary), TASK-091 (run-work-order-loop)  
**Discovered gaps:** 5 (grant defaults, format-tools conflict, zero-token silent, output not surfaced, no dispatch query)
