---
name: pi-agent-dispatch
description: >
  Sibling Pi extension that registers in-pi agent-as-tool dispatch, capability
  composition, real-check execution, attested commits, and the bounded
  north-star work-order loop. Use when authoring agent specs, granting tool
  capabilities, running deterministic checks, committing with writer attestation,
  loading config-declared composite operations, or driving end-to-end
  work-orders through their bounded retry loop.
---

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
