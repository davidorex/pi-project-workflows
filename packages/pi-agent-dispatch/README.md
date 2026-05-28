# @davidorex/pi-agent-dispatch

In-pi agent-as-tool dispatch + capability composition + the bounded north-star work-order loop. Sibling Pi extension to pi-context / pi-workflows / pi-behavior-monitors; consumes pi-jit-agents as a library (no separate extension registration for the agent runtime).

## Boundary

This package is the sub-agent agent-as-tool registration site for the harness-confined orchestrator. The orchestrator's positive clause — substrate-write + call-agent + author-agent-spec + run-real-checks + commit-attested + author-tool-grant + run-work-order-loop + declared composites — fires through tools registered here. The negative clause forbids the orchestrator from running bash / edit / write directly; capability widening is gated by writer.kind=human authoring.

## Public Pi tools (6 static + dynamic composites)

| Tool | Purpose |
|------|---------|
| `call-agent` | Dispatch a declared agent spec with a composed grant (parent ∩ requested ∩ spec.tools). |
| `author-agent-spec` | Write an `.agent.yaml` spec to the substrate. writer.kind=human enforced. |
| `author-tool-grant` | Add/remove `config.tool_operations[]` entries. Refuses non-human writers + forbidden-wholesale tokens (bash/edit/write) + L1 ∪ L5 forbidden union violations. |
| `run-real-checks` | Execute declared build/check/test + runtime-demo + adversarial-probe checks for a work-order. Verdict is the actual exit code per the deterministic-real-check governance — never an LLM self-report. |
| `commit-attested` | Stage + commit declared files with `Attested-by: agent/<id>` + `Work-order: <id>` footer. Refuses on missing agent_id / files / message. |
| `run-work-order-loop` | Single-call wrapper for the bounded north-star loop: dispatch target_agent → run-real-checks → on-pass commit-attested → on-fail human-OK retry. Bounded iterations (default 3). |

In addition, `composite-loader` reads the active substrate's `config.tool_operations[]` on extension load and dynamically registers each declared bounded composite as a Pi tool. Forbidden tokens in the L1 (framework wholesale) ∪ L5 (project-declared) forbidden union are refused. Config-absent loads degrade quietly: the 6 static tools remain available; the absence is surfaced via the `extension_load_warning` TraceEntry.

## Capability composition

Tool grants are operation-granular. Defaults are EMPTY. At each dispatch the grant is composed as `parent ∩ requested`; at the runtime boundary the JIT-runtime clamp enforces `child ⊆ parent`. The `FORBIDDEN_WHOLESALE_OPERATIONS` set rejects shipping wholesale L1 surfaces as a single composite token; L5 project-declared forbidden tokens add to the union. Capability widening goes through `author-tool-grant` with writer.kind=human, never agent / monitor / workflow.

## Work-order loop closure

The `run-work-order-loop` tool consolidates the orchestrator's prior per-iteration chain (call-agent → run-real-checks → on-pass commit-attested → on-fail decide-to-retry) into one Pi call. Every gate the prior chain enforced — capability composition at the call boundary, deterministic real-check verdict, writer-attestation footer, human-OK retry at the iteration boundary via `ctx.ui.confirm` — fires from inside the wrapped library. No path bypasses them.

## Canonical rules

- Harness-confined orchestrator (positive + negative clauses).
- Sibling-consumer scope; pi-jit-agents stays a library.
- writer.kind=human authoring; default-empty grants; terminal verdict = real deterministic checks the executive cannot fake.
- Capability composition + end-to-end work-order loop + bounded-composite vocabulary + launch-chain integration.
- Orchestrator uses jit-agents directly (no wrapping extension).
- Capability composition lives in the dispatch layer.
