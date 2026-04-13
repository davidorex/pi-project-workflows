I have the full document. Now let me evaluate it against our platonic framework.

## The Fully-Instrumented Specification Loop vs our platonic pi-project-workflows

### What the document describes

A specification-conformance verification loop with **31 artifact types**, **~40 named transitions**, **10 verifier boundaries (V1–V10)**, **18 invariants**, **~15 agent stances**, and **11 meta-infrastructure elements**. Built incrementally in a separate project (SYNTH) in response to specific failure incidents. Key substrate: JSONL-shaped findings/tasks with stable cross-audit schema alignment, explicit state machines for findings and tasks, fresh-context subagent authorial independence, and per-project feedback memory that accumulates operational rules. It is explicitly **folklore** — in SYNTH, almost none of the apparatus is committed to git.

### The mapping: every element of the loop lands in our framework

**Artifact chain (31 artifacts, §1.1–§1.9)** → schema-driven blocks under `.project/` + workflow run artifacts under `.workflows/`. Every one of:

| Category | Count | Maps to |
|---|---|---|
| Pre-flight (Intent / Constraints / Glossary) | 3 | `.project/project.json`, `.project/conventions.json`, `.project/domain.json` (currently empty per our cleanup — the schema exists) |
| Specification (5 artifacts) | 5 | `.project/schemas/` + new schemas users author (domain-model, architecture, runtime-contract, api-contract, non-functional) |
| Decomposition (4) | 4 | `.project/` blocks: work-breakdown, dependency-graph, sequencing-plan, deferral-log |
| **Pre-implementation verification (3)** | 3 | New `.project/` blocks for `foundation-disclarities`, `plan-audits`, `resolution-tasks` — all JSONL-shaped, schema-validated |
| Planning (3) | 3 | `.project/plans/`, `.project/test-plans/`, `.project/integration-plans/` |
| Execution (5) | 5 | `.project/implementation/`, test suite (workspace), commit log (git), `.workflows/runs/*/outputs/` for demonstrations |
| Verification (3) | 3 | `.project/verification.json` + `findings-registry` + `health-attestation` — blocks |
| Triage (2) | 2 | `.project/dispositions.json`, `.project/amendments.json` |
| Historical (4) | 4 | `.project/completion-log.json`, `.project/decisions.json` (exists), `.project/postmortems.json`, `.project/feedback-memory.json` |

**Zero of these require TypeScript.** Each is a JSON Schema authored by the user. pi-project's generic block-CRUD tools handle read/write/validate. `projectState()` derives cross-block state automatically.

**Transitions (§2, ~40 named operations)** → `.workflow.yaml` specs. Each transition has:
- `from` (precursors) → step inputs / `contextBlocks`
- `to` (artifacts produced) → step outputs + block write-back (issue-028)
- `stance` → the agent spec (`.agent.yaml`) the step invokes
- Authority boundaries → `inputSchema` + `output.schema` declarations

Every `capture-intent`, `specify-architecture`, `decompose`, `foundation-disclarity-audit`, `adversarial-audit`, `cluster-findings`, `plan-unit`, `execute`, `triage`, `amend-plan`, `codify-feedback` is a workflow step — likely just a single `agent` step with a specific agent spec. The "stance" distinction is just the agent's prompt and output contract.

**Verifier grid (V1–V10, §8)** → 10 monitor specs. Per our P1 "an agent is an agent regardless of consumer," each verifier is:
- An `.agent.yaml` with a verdict-shaped output schema
- Invoked either by a workflow step (pre-implementation: V3, V4, V5) or as a live monitor (V6, V7, V9, V10)
- The verdict drives disposition via downstream steps

**Findings state machine (§1.7, invariant #9)** → this is the missing piece in our current framework but it is expressible as:
- `findings` block with `status` field constrained by the schema enum (`audited | researching | proposed | decided | implementing | resolved`)
- Cross-block validation (`validateProject()`) enforces the "every finding has a disposition" invariant
- Workflow steps advance findings via `update-block-item` with schema validation ensuring only valid transitions

**Cross-audit schema alignment (M1, invariant #5)** → the schema registry IS `.project/schemas/`. Shared fields across foundation-audit and per-plan-audit are a single schema inherited/referenced from a common base. This is a JSON Schema design problem, not a framework gap.

**Orchestrator-subagent boundary (M11, invariant #15)** → our subprocess-isolated step dispatch already enforces this. The orchestrating conversation is the control plane; every workflow step runs as a subprocess. The pi-jit-agents extraction we just landed reinforces this: `executeAgent` has no access to the caller's session — it runs in a clean context every time.

**Fresh-context verifier subagents (M6, invariant #12)** → pi-jit-agents' `executeAgent` IS this. Each invocation is a new in-process LLM call with no conversation history. Subprocess dispatch via `pi --mode json` adds an even stronger boundary.

**Feedback memory codification (§2.10, artifact #31)** → `codify-feedback` is a workflow that reads a postmortem block and writes to a `feedback-memory` block. The JSONL-shaped feedback rules become queryable structured data, not folklore markdown.

### Where the document's framework has pieces our framework lacks today

**1. Pre-implementation audit layers (§1.4) as first-class artifacts.** We do not yet have foundation-disclarity or per-plan-assumption blocks or the associated agents/workflows. These are not framework primitives — they are content authored against the framework. But the *schema registry design* for 18-field findings, 15-field resolution tasks, and the cross-audit field alignment is real intellectual work that would inform concrete `.project/schemas/` design.

**2. Explicit findings state machine.** Our issues block (`.project/issues.json`) has `status: open | resolved | deferred` — three states, not six. The full state machine (`audited → researching → proposed → decided → implementing → resolved`) with gated transitions (only user can advance `proposed → decided`) is more granular and load-bearing than what we have. **Enforceability** requires framework support: cross-block validation would need to enforce transition rules per field value, which is stronger than current `validateProject()` checks.

**3. Schema-enforced authority matrix.** M4 "authority matrix" says "which node can write which artifact." In our framework, nothing currently enforces "only the user can flip a finding from `proposed` to `decided`." Agents have write access to blocks via `append-block-item` / `update-block-item`. Schema enum constraints don't express "this transition requires user authorship." This is a framework gap — validation that would need to inspect *who* wrote the change, not just *what* they wrote.

**4. Fresh-context authorial attestation (M10).** `found_by` attribution records which agent wrote which finding. We could support this via a standard field in every write-back block, but we have no convention for it today.

**5. Clustering step as a distinct transition (invariant #10).** "30-80 findings → 8-15 tasks" is a specific transformation that our framework would implement as a workflow step running a clustering agent whose output is schema-validated resolution-task entries. No framework gap — just content.

**6. The growth-order discipline (§7).** The document says audit layers must earn their existence through documented incidents, not speculative design. This is an operational principle that our framework could support via a `feedback-memory → incident-log → audit-layer` cross-reference, but it is not currently modeled.

### Where our framework has pieces the document's framework lacks

**1. Typed workflows as first-class artifacts.** The document describes transitions as named operations but does not model them as executable, typed `.workflow.yaml` specs with DAG parallelism and checkpoint/resume. Our framework makes transitions executable as code, not just descriptive.

**2. Schema-validated block writes.** The document describes "JSONL, 18 fields per entry" as a convention. Our framework makes the schema authoritative: `writeBlock` / `appendToBlock` enforce the schema at write time, failures are fatal, there is no "JSONL by convention" — there is "JSONL validated at every write."

**3. Cross-block referential integrity.** `validateProject()` already enforces task→phase, decision→phase, requirement→traces_to, verification→target, rationale→related_decisions. Adding finding→resolution_task, task→addresses_findings, disposition→finding is the same pattern.

**4. Template composition via Nunjucks shared macros.** The document says agents have "stances" with prompt contracts but doesn't address prompt authoring. Our shared macros library + template inheritance is the mechanism by which a stance becomes a reusable, composable prompt.

**5. Context injection from durable state (`contextBlocks`).** The document says "Relevant spec sections should be pasted into the prompt" (deficiency #5 of the adversarial audit failure). Our `contextBlocks` mechanism does this declaratively — the agent spec lists block names, the framework reads them at dispatch and renders them through shared macros.

**6. Unified dispatch primitive.** Per P1 and the pi-jit-agents extraction, there is ONE classify path, ONE execute path. The document mentions this as an invariant (#15 "every stance has a corresponding verifier; no stance is self-verifying") but doesn't provide a framework for enforcing it — in SYNTH, each verifier is a separately-coded agent with its own output handling.

**7. Portability by construction.** §9 names the portability gap in SYNTH: "the pattern is project-local folklore." Our framework is published to npm. The pattern infrastructure IS the framework. The pattern state (schemas, workflows, agents, blocks) lives in `.project/` and is git-tracked. §9's choice 1 ("commit everything") is what our framework does by default.

### The assessment

**The document's loop is derivable from our platonic ideal.** Every artifact, every transition, every verifier, every invariant, and every meta-element maps to a combination of schemas + workflows + agents + monitors + blocks in our framework. The work SYNTH did manually — authoring `/adversarial-audit`, writing 27 feedback memory files, instantiating JSONL registries with cross-audit schema alignment — is exactly the content users of our framework would author, using our framework's primitives, with the framework enforcing the invariants that SYNTH enforces through discipline and folklore.

**Our framework is not yet complete enough to enforce every invariant the document describes.** Specific capability gaps surfaced:

- Schema-enforced authority matrix (M4) — "only user can advance finding to `decided`" is not expressible via `.project/schemas/` alone. This is a framework gap, worth a new issue.
- `found_by` / authorship attestation as a convention — worth codifying.
- Finding state machine with transition gates — expressible as schema enums today, but transition *validity* (not just state membership) needs either cross-block validation extension or a dedicated state-machine primitive in pi-project.
- Clustering and resolution-task artifacts — not framework gaps, but strongly suggested as canonical bundled schemas shipped with the framework so users don't reinvent the 18-field format.

**The document validates our direction.** Every open issue in our framework (issue-028 block write-back, issue-030 writeback monitor, issue-031 scheduled re-execution, issue-036 execution trace debugger, issue-041 scoped contextBlocks, issue-045 anti-injection, issue-050 unified classify) is something SYNTH had to build by hand in imperative TypeScript scaffolding or in folklore memory files. Closing those issues does not give us SYNTH's loop — it gives users the substrate to build SYNTH's loop (or any variant) by authoring schemas + workflows + agents, not by forking framework code.

**The SYNTH pattern's strongest claim — "each audit layer earns its existence through a documented incident" (§7)** — is something our framework can enforce better than SYNTH does. SYNTH's feedback memory is gitignored markdown. Our `.project/feedback-memory.json` (which does not yet exist as a block) with a schema for `{ incident, date, rule, why, how_to_apply }` and a cross-reference to `issues.json` entries would make every framework change auditably tied to its originating incident.

### Concrete work this evaluation surfaces

Not to execute, just to note — each is a potential new issue:

1. **Cross-block state machine validation.** Given a block field that is an enum, enforce allowed state transitions. Currently schema validation accepts any enum value on any write; it cannot express "status can only go from `open` to `resolved`."
2. **Authorship attestation as a write-time convention.** Every block write records `written_by` (agent name, user, or subprocess identifier). Cross-block validation can check "fields advanced to state X must have written_by == 'user'."
3. **Bundled canonical schemas for the audit pattern.** Ship `foundation-disclarity-finding.schema.json`, `resolution-task.schema.json`, `finding-lifecycle-state.schema.json` as default schemas in pi-project. Users adopt them or customize.
4. **Incident cross-reference in feedback-memory block.** Standard schema for `feedback-memory.json` with `incident_session`, `date`, `rule`, `applies_to_issues`, `applies_to_blocks` fields.
5. **Verifier grid as a validator category.** The 10 verifier boundaries (V1–V10) could be the canonical validation check registry in pi-workflows' `validateProject()` — today we have 11 dimension checks, SYNTH's grid has 10 cross-layer drift checks. Not identical but complementary.

The document's loop and our framework are the same thing viewed from different angles: the document is "what you build on top of the framework to get a correct development process." Our framework is "the substrate that makes that pattern expressible as configuration rather than code." The gap between them is exactly the set of open issues we already track, plus the five additional items above.