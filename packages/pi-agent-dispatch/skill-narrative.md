---
name: pi-agent-dispatch
description: >
  Sibling Pi extension that registers in-pi agent-as-tool dispatch, capability
  composition, real-check execution, attested commits, and the FEAT-006
  north-star work-order loop. Use when authoring agent specs, granting tool
  capabilities, running deterministic checks, committing with writer attestation,
  loading config-declared composite operations, or driving end-to-end
  work-orders through their bounded retry loop.
---

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
