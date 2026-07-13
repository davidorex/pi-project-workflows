---
name: pi-agent-dispatch
description: >
  Sibling Pi extension that registers in-pi agent-as-tool dispatch, capability
  composition, real-check execution, attested commits, and the bounded north-star
  work-order loop. Use when authoring agent specs, granting tool capabilities,
  running deterministic checks, committing with writer attestation, loading
  config-declared composite operations, or driving end-to-end work-orders through
  their bounded retry loop.
---

<tools_reference>
<tool name="author-agent-spec">
Write a new .agent.yaml spec to the agents tier. Requires user authorization via interactive confirmation at the pi-dispatch auth-gate; on confirm, the verified terminal-operator identity is stamped as writer. The written file is AJV-validated against AgentSpec before persisting.

*Author a privileged JIT-agent spec — declares input, prompts, tools grant, output schema, contextBlocks.*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | yes | Agent name (becomes <name>.agent.yaml filename + AgentSpec.name). |
| `spec` | unknown | yes | AgentSpec object body (will be serialized to YAML). Must conform to AgentSpec shape. |
| `writer` | object | yes | DispatchContext.writer payload; see pi-context/src/dispatch-context.ts for the discriminated union. |
</tool>

<tool name="call-agent">
Dispatch a privileged JIT-agent as a typed tool call. Loads the named .agent.yaml, compiles with input, composes the tool grant (intersection of caller's parentGrant and the agent's requestedGrant), and executes via pi-jit-agents executeAgent (clamp enforces child ⊆ parent at dispatch boundary).

*Dispatch a typed sub-agent with scoped capability grant.*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `spec_name` | string | yes | Name of the agent spec to load (resolves to <name>.agent.yaml searched across the substrate agents/ dir, then ~/.pi/agent/agents/, then the bundled pi-workflows agents). |
| `input` | unknown | yes | Typed input passed to the agent's compileAgent context. |
| `parent_grant` | array | no | The caller's own tool grant. Default-empty. |
| `requested_grant` | array | no | The grant requested for the dispatched sub-agent. Will be clamped to the intersection with parent_grant. |
| `max_tokens` | number | no | Max tokens for the LLM call. Defaults to 1024. |
</tool>

<tool name="run-real-checks">
Run the deterministic real-checks declared on a work-order (build/check/test exit + runtime-demo + adversarial-probe). Returns a structured RealCheckResult. NEVER LLM self-report; verdict is the actual exit code.

*Run a work-order's declared real-checks for verdict gating.*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `work_order_id` | string | yes | ID of the work-order whose real_check_criteria to run (e.g. 'WO-NNN'). |
| `max_check_time_ms` | number | no | Max total time per check in milliseconds. Defaults to 600000 (10 minutes). |
</tool>

<tool name="commit-attested">
Stage declared files + invoke git commit with DispatchContext writer.kind=agent attestation footer. Husky pre-commit runs as backup gate; never bypass (--no-verify forbidden per feedback_no_destructive_git_ops). The primary gate is run-real-checks called BEFORE this tool.

*Commit agent-authored work-product files with attestation footer.*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `files` | array | yes | Files to stage + commit. Empty array refused. |
| `message` | string | yes | Commit message body (the attestation footer is appended automatically). |
| `agent_id` | string | yes | Agent id for writer.kind=agent attestation (e.g. 'spec-implementer-001'). |
| `work_order_id` | string | no | Optional work-order id for the attestation footer. |
</tool>

<tool name="author-tool-grant">
Add or remove an entry in config.tool_operations[] or config.tool_operations_forbidden[]. Requires user authorization via interactive confirmation at the pi-dispatch auth-gate; on confirm, the verified terminal-operator identity is stamped as writer. Refuses any attempt to register a framework-forbidden wholesale token.

*Author a config tool-grant entry (operation registration or project-forbidden token).*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `target` | unknown | yes | Which config registry to mutate. |
| `operation` | unknown | yes | amendConfigEntry operation. |
| `key` | string | yes | For tool_operations: the canonical_id (must match entry.canonical_id). For tool_operations_forbidden: the token string. |
| `entry` | unknown | no | ToolOperationDecl object — required for target=tool_operations + operation=add. |
| `writer` | object | yes | DispatchContext.writer payload; see pi-context/src/dispatch-context.ts for the discriminated union. |
</tool>

<tool name="run-work-order-loop">
Execute the bounded work-order loop: dispatch target_agent (via direct pi-jit-agents library) → run-real-checks (deterministic verdict — the actual exit code, never an LLM self-report) → on-pass commit-attested → on-fail human-OK retry at the iteration boundary. Bounded iterations (default 3); human-OK gate governs retry.

*Execute the end-to-end work-order loop for a declared spec.*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `work_order_id` | string | yes | ID of the work-order to execute (loads from the substrate's work-orders block). |
| `max_iterations` | number | no | Max iteration count before fail-final. Default 3. |
| `agent_grant` | array | no | Tool grant for the dispatched privileged agent (capability composition). Default empty. |
</tool>

</tools_reference>

<events>
`tool_call`, `tool_result`
</events>

<objective>
pi-agent-dispatch is the harness-confined orchestrator's in-pi surface. It registers Pi tools the orchestrator agent invokes to dispatch sub-agents, author specs and tool grants, run deterministic checks the executive cannot fake, commit with writer attestation, and drive bounded work-order loops. It is the sibling-consumer registration site; pi-jit-agents stays a library consumed directly by this package and by pi-workflows.
</objective>

<dispatch_tools>
| Tool | Purpose |
|------|---------|
| `call-agent` | Dispatch a declared agent spec with a composed tool grant (parent ∩ requested ∩ spec.tools). |
| `author-agent-spec` | Write an `.agent.yaml` spec to the substrate. Human-authorized via auth-gate confirm at the pi-dispatch layer; the verified terminal-operator identity is stamped as writer on confirm. |
| `run-work-order-loop` | Execute the bounded work-order loop: dispatch → run-real-checks → on-pass commit-attested → on-fail human-OK retry. |
</dispatch_tools>

<real_check_tools>
| Tool | Purpose |
|------|---------|
| `run-real-checks` | Execute declared deterministic checks (build/check/test exit codes, schema validations, git diff probes, runtime event probes). Verdict is the actual exit code, never an LLM self-report. |
| `commit-attested` | Stage + commit with writer-identity footer. Refuses on missing agent_id, files, or message. |
</real_check_tools>

<capability_authoring>
Tool grants are config-declared (bounded composites) and authored only via the `author-tool-grant` Pi tool, which is human-authorized at the pi-dispatch auth-gate (interactive confirmation; on confirm the verified terminal-operator identity is stamped as writer). Default grant is empty; widening goes through the auth-gate. The FORBIDDEN_WHOLESALE_OPERATIONS set blocks shipping wholesale L1 surfaces (bash, write, edit) as a single composite token; the L1 ∪ L5 forbidden union check refuses tokens that already appear on the L1 wholesale-forbidden list.
</capability_authoring>

<composite_loader>
On extension load, `composite-loader` reads the active substrate's `config.tool_operations[]` and dynamically registers each declared bounded composite as a Pi tool. Config-absent (no pointer or unbootstrapped substrate) degrades gracefully: extension still registers the 6 static tools; the absence is observed via the `extension_load_warning` TraceEntry and (when available) surfaced through `pi.ui.notify`. The substrate is the single source of truth — no parallel ungated path widens capability outside the loader.
</composite_loader>

<canonical_intention>
Anchors:
- Harness-confined orchestrator (positive clause: substrate-write + call-agent + author-agent-spec + run-real-checks + commit-attested + author-tool-grant + run-work-order-loop + declared composites; negative clause: NO bash/edit/write).
- Sibling-consumer scope; pi-jit-agents stays a library.
- Human-authorized authoring at the pi-dispatch auth-gate; default empty; terminal verdict = real deterministic checks.
- Capability composition + end-to-end work-order loop + bounded-composite vocabulary + launch-chain integration.
- Orchestrator uses jit-agents directly; capability composition lives in the dispatch layer.
</canonical_intention>

<success_criteria>
- 6 static tools register on every load: call-agent, author-agent-spec, author-tool-grant, run-real-checks, commit-attested, run-work-order-loop.
- Composite tools register from config.tool_operations[] when present; load proceeds with warning when absent.
- Every write-bearing tool routes through the pi-dispatch auth-gate; the verified terminal-operator identity is stamped as writer on confirm.
- Work-order loop honors max_iterations + human-OK retry gate + on-pass attested commit.
</success_criteria>

*Generated from source by `scripts/generate-skills.js` — do not edit by hand.*
