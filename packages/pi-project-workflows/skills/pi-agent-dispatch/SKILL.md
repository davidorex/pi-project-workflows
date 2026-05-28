---
name: pi-agent-dispatch
description: >
  Sibling Pi extension that registers in-pi agent-as-tool dispatch, capability
  composition, real-check execution, attested commits, and the FEAT-006 north-star
  work-order loop. Use when authoring agent specs, granting tool capabilities,
  running deterministic checks, committing with writer attestation, loading
  config-declared composite operations, or driving end-to-end work-orders through
  their bounded retry loop.
---

<tools_reference>
<tool name="author-agent-spec">
Write a new .agent.yaml spec to the agents tier under writer.kind=human enforcement (DEC-0047: capability/spec authoring is human-only). The written file is AJV-validated against AgentSpec before persisting.

*Author a privileged JIT-agent spec — declares input, prompts, tools grant, output schema, contextBlocks.*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | yes | Agent name (becomes <name>.agent.yaml filename + AgentSpec.name). |
| `spec` | unknown | yes | AgentSpec object body (will be serialized to YAML). Must conform to AgentSpec shape. |
| `writer` | object | yes | DispatchContext.writer per pi-context/src/dispatch-context.ts. |
</tool>

<tool name="call-agent">
Dispatch a privileged JIT-agent as a typed tool call (FEAT-004 / narrowed DEC-0044). Loads the named .agent.yaml, compiles with input, composes the tool grant (intersection of caller's parentGrant and the agent's requestedGrant per FEAT-005), and executes via pi-jit-agents executeAgent (TASK-081 clamp enforces child ⊆ parent at dispatch boundary).

*Dispatch a typed sub-agent with scoped capability grant.*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `spec_name` | string | yes | Name of the agent spec to load (resolves to <name>.agent.yaml in the agents tier). |
| `input` | unknown | yes | Typed input passed to the agent's compileAgent context. |
| `parent_grant` | array | no | The caller's own tool grant. Default-empty per DEC-0047. |
| `requested_grant` | array | no | The grant requested for the dispatched sub-agent. Will be clamped to the intersection with parent_grant. |
| `max_tokens` | number | no | Max tokens for the LLM call. Defaults to 1024. |
</tool>

<tool name="run-real-checks">
Run the deterministic real-checks declared on a work-order (build/check/test exit + runtime-demo + adversarial-probe per DEC-0018). Returns a structured RealCheckResult. NEVER LLM self-report per FGAP-102 + DEC-0047 clause 5.

*Run a work-order's declared real-checks for verdict gating.*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `work_order_id` | string | yes | ID of the work-order whose real_check_criteria to run (e.g. 'WO-001'). |
| `max_check_time_ms` | number | no | Max total time per check in milliseconds. Defaults to 600000 (10 minutes). |
</tool>

<tool name="commit-attested">
Stage declared files + invoke git commit with DispatchContext writer.kind=agent attestation footer (DEC-0047). Husky pre-commit runs as backup gate; never bypass (--no-verify forbidden per feedback_no_destructive_git_ops). The primary gate is run-real-checks (TASK-090) called BEFORE this tool.

*Commit agent-authored work-product files with attestation footer.*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `files` | array | yes | Files to stage + commit. Empty array refused. |
| `message` | string | yes | Commit message body (the attestation footer is appended automatically). |
| `agent_id` | string | yes | Agent id for writer.kind=agent attestation per DEC-0047 (e.g. 'spec-implementer-001'). |
| `work_order_id` | string | no | Optional work-order id for the attestation footer. |
</tool>

<tool name="author-tool-grant">
Add or remove an entry in config.tool_operations[] or config.tool_operations_forbidden[] under writer.kind=human enforcement (DEC-0047). Refuses any attempt to register a framework-forbidden wholesale token.

*Author a config tool-grant entry (operation registration or project-forbidden token).*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `target` | unknown | yes | Which config registry to mutate. |
| `operation` | unknown | yes | amendConfigEntry operation. |
| `key` | string | yes | For tool_operations: the canonical_id (must match entry.canonical_id). For tool_operations_forbidden: the token string. |
| `entry` | unknown | no | ToolOperationDecl object — required for target=tool_operations + operation=add. |
| `writer` | object | yes | DispatchContext.writer per pi-context/src/dispatch-context.ts. |
</tool>

<tool name="run-work-order-loop">
Execute the bounded FEAT-006 loop for a work-order: dispatch target_agent (via direct pi-jit-agents library per DEC-0044 narrowed / JI-021) → run-real-checks (deterministic verdict per DEC-0018 + DEC-0047 clause 5) → on-pass commit-attested → on-fail human-OK retry at the iteration boundary. Bounded iterations (default 3); human-OK gate per DEC-0047 governance.

*Execute the end-to-end work-order loop for a declared spec.*

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `work_order_id` | string | yes | ID of the work-order to execute (loads from .project/work-orders.json per TASK-088 schema). |
| `max_iterations` | number | no | Max iteration count before fail-final. Default 3. |
| `agent_grant` | array | no | Tool grant for the dispatched privileged agent (per FEAT-005 capability composition). Default empty. |
</tool>

</tools_reference>

<objective>
pi-agent-dispatch is the harness-confined orchestrator's in-pi surface. It registers Pi tools the orchestrator agent invokes to dispatch sub-agents, author specs and tool grants, run deterministic checks the executive cannot fake, commit with writer attestation, and drive bounded work-order loops. Per narrowed DEC-0044 it is the sibling-consumer registration site; pi-jit-agents stays a library consumed directly by this package and by pi-workflows (JI-021).
</objective>

<dispatch_tools>
| Tool | Purpose |
|------|---------|
| `call-agent` | Dispatch a declared agent spec with a composed tool grant (parent ∩ requested ∩ spec.tools). |
| `author-agent-spec` | Write an `.agent.yaml` spec to the substrate. writer.kind=human enforced. |
| `run-work-order-loop` | Execute the bounded FEAT-006 loop for a work-order: dispatch → run-real-checks → on-pass commit-attested → on-fail human-OK retry. |
</dispatch_tools>

<real_check_tools>
| Tool | Purpose |
|------|---------|
| `run-real-checks` | Execute declared deterministic checks (build/check/test exit codes, schema validations, git diff probes, runtime event probes). Verdict is the actual exit code, never an LLM self-report. |
| `commit-attested` | Stage + commit with writer-identity footer. Refuses on missing agent_id, files, or message. |
</real_check_tools>

<capability_authoring>
Tool grants are config-declared (FEAT-010 bounded composites) and authored only via the `author-tool-grant` Pi tool with writer.kind=human enforcement (DEC-0047). Default grant is empty; widening goes through the human writer gate. The FORBIDDEN_WHOLESALE_OPERATIONS set blocks shipping wholesale L1 surfaces (bash, write, edit) as a single composite token; the L1 ∪ L5 forbidden union check refuses tokens that already appear on the L1 wholesale-forbidden list.
</capability_authoring>

<composite_loader>
On extension load, `composite-loader` reads the active substrate's `config.tool_operations[]` and dynamically registers each declared bounded composite as a Pi tool. Config-absent (no pointer or unbootstrapped substrate) degrades gracefully: extension still registers the 6 static tools; the absence is observed via the `extension_load_warning` TraceEntry and (when available) surfaced through `pi.ui.notify`. Per DEC-0040 the substrate is the single source of truth — no parallel ungated path widens capability outside the loader.
</composite_loader>

<canonical_intention>
Anchors:
- DEC-0014 harness-confined orchestrator (positive clause: substrate-write + call-agent + author-agent-spec + run-real-checks + commit-attested + author-tool-grant + run-work-order-loop + declared composites; negative clause: NO bash/edit/write).
- DEC-0044 narrowed: sibling-consumer scope; pi-jit-agents stays a library.
- DEC-0047 writer.kind=human authoring; default empty; terminal verdict = real deterministic checks.
- FEAT-005 capability composition; FEAT-006 end-to-end work-order loop; FEAT-010 bounded-composite vocabulary; FEAT-011 launch-chain integration.
- JI-021 orchestrator uses jit-agents directly; JI-023 capability composition lives in the dispatch layer.
</canonical_intention>

<success_criteria>
- 6 static tools register on every load: call-agent, author-agent-spec, author-tool-grant, run-real-checks, commit-attested, run-work-order-loop.
- Composite tools register from config.tool_operations[] when present; load proceeds with warning when absent.
- Every write-bearing tool refuses non-human writers per DEC-0047.
- Work-order loop honors max_iterations + human-OK retry gate + on-pass attested commit.
</success_criteria>

*Generated from source by `scripts/generate-skills.js` — do not edit by hand.*
