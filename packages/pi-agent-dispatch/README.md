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

## Dispatch resolution tiers

Both dispatch entry points (`call-agent`, `run-work-order-loop`) resolve an agent for dispatch across layered searches, so a fresh substrate with no local files can resolve and compile the bundled agent set from the bundled tiers while a local or user copy of the same name still wins. (Compiling and dispatching are distinct: `call-agent` additionally requires a resolvable model — see the **Model** axis — so on a fresh substrate with no `model-config`, a bundled spec that carries no `model` compiles but `call-agent` still errors for want of a model; `run-work-order-loop` omits `--model` and lets the subprocess pick its default.)

- **Agent spec** — `<contextDir>/agents/` → `~/.pi/agent/agents/` → bundled pi-workflows `agents/`.
- **Templates** (the spec's task/system prompt bodies) — a relative template ref is first absolutized at parse when an adjacent file exists (or, for a spec matched from the bundled tier, when a package-root sibling file exists); otherwise it stays a bare name resolved through the Nunjucks loader's tiers: `<contextDir>/templates/` → `~/.pi/agent/templates/` → bundled pi-jit-agents `templates/`.
- **Output schema** (the spec's `output.schema`) — a `block:<name>` sentinel resolves to the active substrate's `<contextDir>/schemas/<name>.schema.json`; a relative path is resolved at parse against the spec's own directory first, then — for a spec matched from the bundled tier only — the spec directory's PARENT (the package-root sibling `schemas/` dir the bundled `agents/`+`schemas/` layout uses), absolutized to the first that exists on disk. The parent-sibling probe is bundled-tier-only, so a local/user spec's relative ref never absolutizes onto a same-basename substrate block schema or user-config sibling. Unlike templates, an output-schema ref gets no downstream loader-tier search — a relative ref that resolves at neither probe stays a bare name whose read fails loudly when the phantom validation tool is built.
- **Model** — the spec's own `model` → substrate `model-config` `by_role[role]` → `model-config` `default`. When none resolves, subprocess dispatch (`run-work-order-loop`) omits `--model` and pi picks its own default inside the subprocess; in-process dispatch (`call-agent`), which must resolve a concrete model + auth before it can call, instead requires a spec or `model-config` model and errors otherwise.

## Canonical rules

- Harness-confined orchestrator (positive + negative clauses).
- Sibling-consumer scope; pi-jit-agents stays a library.
- writer.kind=human authoring; default-empty grants; terminal verdict = real deterministic checks the executive cannot fake.
- Capability composition + end-to-end work-order loop + bounded-composite vocabulary + launch-chain integration.
- Orchestrator uses jit-agents directly (no wrapping extension).
- Capability composition lives in the dispatch layer.
