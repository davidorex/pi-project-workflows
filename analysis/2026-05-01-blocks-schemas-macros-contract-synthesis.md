# Blocks, schemas, macros — synthesis of the contract direction

Date: 2026-05-01
Status: synthesis of three prior analyses, produced in response to a walk through pi-project's current state and the gap between its storage substrate and the contract substrate the framework implies.

Source documents synthesized:

- `analysis/2026-04-15-blocks-as-prompt-substrate.md` — reframing of blocks as prompt fragments and the macros/contract consequences
- `analysis/research-blocks-design.md` — design of the research block as the factual substrate beneath decisions
- `analysis/pi-project-schema-conventions-audit.md` — audit of pi-project's current schema conventions against canonical engineering practice

---

## Thesis

The three documents converge on a single claim: **blocks, schemas, and macros are a single contract, not three independent systems**, and pi-project today implements only one side of it (write-shape validation at the block API boundary). The other two sides — read-shape (prompt composition via macros) and grounding/lifecycle/authorship (invariants the write path cannot enforce today) — are structurally absent.

Per `2026-04-15-blocks-as-prompt-substrate.md`:

> Block schemas serve three roles simultaneously and the single-source-of-truth framing is load-bearing:
> 1. Read-shape: when compileAgent reads a block and a macro renders it into prompt text
> 2. Write-shape: when a workflow step or monitor produces output that targets a block
> 3. Validate-shape: at rest, block contents conform to the schema
> Every schema IS all three contracts.

pi-project today covers role 3 fully, covers role 2 at the API boundary, and covers role 1 only implicitly through macros that live downstream in pi-workflows with no structural coupling back to the schema.

---

## The pipeline

```
schema ⇄ block JSON ⇄ macro ⇄ agent prompt
```

Read direction (role 1): agent spec declares `contextBlocks: [name, ...]` → `compileAgent` reads blocks via `readBlock` → injects into Nunjucks context as `_<name>` → template imports macros from `packages/pi-workflows/templates/shared/macros.md` → macro renders the block into prompt markdown.

Write direction (role 2): workflow step or monitor produces output → `block:<name>` schema reference resolves to `.project/schemas/<name>.schema.json` → block API validates and writes atomically.

At-rest (role 3): every write goes through `block-api.ts` → `schema-validator.ts` (AJV draft-07) → atomic tmp+rename.

The three documents argue that all three roles should be traceable from a single schema artifact, and that schemas should carry the metadata each role requires.

---

## Document 1 — blocks as prompt substrate

From `analysis/2026-04-15-blocks-as-prompt-substrate.md`.

**Operational consequence of the thesis**: a schema without its per-item macro is unreachable from agent contexts, so it is not really shipped. The document captures this as a principle:

> A schema without its per-item macro is structurally unreachable from agent contexts. A block kind is not "shipped" until an agent can read one of its items from a `contextBlocks` injection. Future enactment of any new block kind must land schema + seed data + per-item macro as a single unit of work.

**Current macro library status**: twelve macros, all plural or whole-block (`render_conventions`, `render_requirements`, `render_conformance`, `render_architecture`, `render_project`, `render_domain`, `render_decisions`, `render_tasks`, `render_issues`, `render_exploration`, `render_exploration_full`, `render_gap`). Every macro takes the entire block as input. Per-item rendering is missing across the entire library.

**Six block kinds are prompt-unreachable today**: decisions (new), spec-reviews, features, framework-gaps, layer-plans, research. They exist as schemas and data but cannot be cleanly injected.

**REVIEW-001 is a compile-chain dependency**: the fresh-context reviewer for `docs/planning/jit-agents-spec.md` needs its `contextBlocks` to inject DEC-0001/0002/0003. Without `render_decision(dec)`, the reviewer cannot read the decisions from its prompt. This is not a scheduling preference; it is a structural blocker.

**Three schema-level extensions proposed**:

1. **Item-level `contextBlocks` selectivity** — current block-name-only mechanism cannot express "inject just FEAT-001 focused on STORY-001." Proposed schema change:

   ```yaml
   contextBlocks:
     - name: features
       item: FEAT-001
       focus:
         story: STORY-001
         task: TASK-001-02
       depth: 1
   ```

2. **First-class depth parameter** — `render_decision(dec, depth=0)` emits cross-references as bare IDs; `depth=1` inlines direct references; higher depths recurse with cycle detection.

3. **Per-field `x-prompt-budget` metadata** — every schema field that renders into a prompt carries `x-prompt-budget: { tokens, words }`. Renderer warns or truncates on overflow; callers composing multi-block prompts sum budgets in advance.

**Rendering-chain traversal subsystem**: per-item macros inlining cross-references require a renderer registry mapping block-item kinds to their per-item macros, a cross-block resolver (given a reference ID, find the block and entry that owns it), depth-aware recursion, and cycle detection. This subsystem lives at the pi-project ⇄ pi-jit-agents boundary. `project-sdk.ts` has cross-block query primitives for validation but does not expose them as a rendering service.

---

## Document 2 — research blocks as factual substrate

From `analysis/research-blocks-design.md`.

**Framing**: decisions today are ungrounded assertions because there is no structured layer beneath them capturing what is true about the problem, environment, or options. The `analysis/` markdowns are the de facto research layer but have no schema, no lifecycle, no cross-references, no staleness signaling. The document proposes `research.json` as the factual substrate under decisions.

**Two orthogonal dimensions**:

- **Layer informed** — L1 Identity (project-lifetime), L2 Specification (per-design-cycle), L3 Work (per-feature), L4 Execution (per-task, ephemeral), L5 Memory (post-incident accumulator). Research runs across the five Muni layers rather than being a sixth layer.
- **Research type** — `investigative`, `comparative`, `empirical`, `historical`, `audit`, `landscape`, `feasibility`, `curation`. Each type has different reliability characteristics and different staleness behavior.

**Critical composability fields**:

- `findings_summary` — self-contained, prompt-injectable, approximately 300–800 words. This is what gets pasted into an agent's context when the research is cited.
- `findings_document` — pointer to the full markdown in `analysis/` for deep reads.
- `citations` — array of source references with file+line or URL+retrieval-time. Every factual claim in the summary traces back to a citation.
- `grounding` — version-pinned deps, retrieved revisions, dated external refs. This is what staleness tracks.
- `stale_conditions` — explicit list of "if these change, this research is no longer authoritative."
- `informs` / `informed_by` — bidirectional edges to decisions, features, reviews, gaps, plans, other research.

**Placement**: flat collection at `.project/research.json`, not embedded inside decisions or features. Rationale: research is N:M with what it informs, has its own lifecycle orthogonal to what it informs, and needs to be queryable across layers. Requires an additive `research_sources: [R-NNNN]` back-edge on the existing five L2/L3 schemas (`decisions`, `features`, `spec-reviews`, `framework-gaps`, `layer-plans`).

**Method enum is load-bearing**: reliability varies across `code-inspection` (high), `empirical-test` (high), `web-fetch` (medium-high), `web-search` (medium), `llm-query` (low-medium), etc. Low-reliability methods should carry a `cross-checked_against` field listing higher-reliability verifications.

**Cross-layer traceability is the entire point**:

```
FEAT-001 → research_sources → R-0001 → citations → file paths + line numbers → ground truth
```

And backward:

```
file change in pi-ai 0.64 → stale_conditions match → R-0001 goes stale → informs: DEC-0001 → DEC-0001 grounding lost → user decision required
```

Without this walk, research becomes write-once archives. With it, research becomes an active substrate that self-invalidates when the world changes.

**New framework gap surfaced — FGAP-007 staleness engine**: a runtime that reads every research entry's `stale_conditions` and compares them against current state (installed dep versions, git revisions, external-URL content hashes), transitions entries to `stale` automatically, and propagates invalidation through `informs` edges to flag affected decisions as needing re-grounding. Currently staleness must be checked by hand.

---

## Document 3 — pi-project schema conventions audit

From `analysis/pi-project-schema-conventions-audit.md`.

**What pi-project does well today**: JSON Schema draft-07 + AJV is canonical, kebab-case file naming is canonical, validate-on-write at the API boundary is correct, `block:<name>` schema reference is a clean abstraction, user-customizable schemas without code changes is the right philosophy, and ADR-flavored descriptions already read like rationale.

**Six structural gaps** measured against canonical engineering practice:

1. **Hierarchical / nested blocks** — no `tasks/{id}.json` per task, no `epics/{id}/stories/{id}/tasks/{id}.json` tree. The canonical `roadmap → milestone → epic → story → task` decomposition cannot be expressed as schemas today; it would have to be smuggled into a flat array with denormalized parent references.

2. **Per-scope finding registries** — a spec contradiction discovered during a design review of `jit-agents-spec.md` has nowhere to live except the global `issues.json`, where it mixes with task-level bugs and feature-level scope conflicts. No convention for a block carrying its own embedded `findings: [...]` array.

3. **Materialized views** — `projectState()` does in-memory aggregation but it is not a persisted, addressable, schema-validated block. No derived block kind. No way to declare "global `issues_view.json` is a derived index over per-scope finding registries."

4. **Authorship attestation as a write-time invariant** — only `issues.schema.json` has a `source` enum (human/agent/monitor/workflow); `tasks.schema.json` has `assigned_agent` (a different concept — assignment, not authorship); `block-api.ts` does not stamp authorship on writes. Cannot enforce "only the user advances a finding from `proposed` to `decided`" because the writer's identity isn't recorded.

5. **State-machine validation on enum transitions** — AJV draft-07 validates current value membership; it cannot express "this transition is allowed only from `proposed` to `decided`." Would need custom AJV keywords, a validation layer above the schema, or a dedicated state-machine primitive in pi-project.

6. **Schema versioning / evolution** — no `version` field, no `$id`, no `$ref` composition, no migration story, no schema registry. Schemas drift silently per project. A schema rename has no backward-compatibility story.

**Naming mismatches** against canonical engineering vocabulary: `decisions.json` is an ADR log (Nygard 2011) not named as such; `rationale.json` duplicates ADR-level rationale and should fold into `decisions`; `phase.json` is informal where canon is milestone or epic; the term `gap` survives in the `resolved_by` validation check despite not being a current block name (legacy overlapping `issues`); `conformance-reference.json` overlaps `conventions.json`; several schemas (`inventory`, `runtime-spec`, `state`, `reference-contracts`) have unclear canonical equivalents.

**Application choice**: the six gaps are not novel asks from SYNTH folklore; they are existing shortcomings measured against canonical practice. The consumer migration arc must either address them in scope, track them as a parallel L2 work track the migration consumes, or defer them with explicit acknowledgement. The choice is the user's per mandate-007 (no deferring discovered issues without the user deciding scope) and mandate-004 (no negligent fix paths).

---

## Where the three agree

**pi-project's block I/O is sound; its contract model is incomplete.** Validate-on-write works. The gap is that schemas don't carry enough metadata (prompt budget, lifecycle transitions, authorship, versioning, grounding) to serve all three of their contracts.

**Macros are the read-side of the schema contract, not a pi-workflows concern.** They must be co-shipped with schemas at per-item granularity with depth control. The "schema + seed data + per-item macro as a single unit of work" principle from `2026-04-15-blocks-as-prompt-substrate.md` is the consequence.

**The flat-array-per-block assumption is the biggest structural constraint.** It blocks hierarchy (audit gap 1), per-scope findings (audit gap 2), materialized views (audit gap 3), and the layered L1–L5 artifact model (research document, entire framing). Every proposed extension — research, features, framework-gaps, layer-plans — works around flatness rather than with it.

**Staleness, authorship, and transition-validation are the same underlying gap** viewed from three angles. Research grounding (document 2), audit authorship attestation and state-machine enums (document 3, gaps 4 and 5). pi-project's write path today does not know who wrote what transition at what grounding.

---

## Net direction implied

A future pi-project would:

- Ship schemas plus per-item macros as a single unit of work, at per-item granularity, with depth control and cycle detection.
- Stamp authorship and grounding on every write via `block-api.ts`, making "who wrote this" and "what is this grounded against" first-class fields on every item.
- Validate state transitions (not just current values) via a state-machine primitive above or alongside AJV.
- Carry schema versions with `$id` and a migration story; stop silent drift.
- Support nested and hierarchical blocks so the canonical `roadmap → milestone → epic → story → task` decomposition can be expressed natively.
- Expose the rendering-chain traversal subsystem (registry, cross-block resolver, depth-aware recursion, cycle detection) that sits at the pi-project ⇄ pi-jit-agents boundary.
- Add per-field `x-prompt-budget` metadata so multi-block prompt composition can stay within budget.

Current pi-project is the **storage substrate**. The three documents together argue for promoting it to the **contract substrate** — the single source of truth that all three schema roles (read, write, validate) derive from.

---

## Cross-reference index

Document-specific anchors for traceability:

| Claim in this synthesis | Source |
|---|---|
| Three simultaneous schema roles | `2026-04-15-blocks-as-prompt-substrate.md` § "Bidirectional schema contract as principle" |
| Twelve whole-block macros, no per-item | `2026-04-15-blocks-as-prompt-substrate.md` § "The critical observation" |
| Six prompt-unreachable block kinds | `2026-04-15-blocks-as-prompt-substrate.md` § "Macros library status" table |
| REVIEW-001 blocked on render_decision | `2026-04-15-blocks-as-prompt-substrate.md` § "REVIEW-001 is blocked on decision-record macro existence" |
| Item-level contextBlocks selectivity | `2026-04-15-blocks-as-prompt-substrate.md` § "contextBlocks needs item-level selectivity" |
| Per-field x-prompt-budget metadata | `2026-04-15-blocks-as-prompt-substrate.md` § "Token budget hints" |
| Rendering-chain traversal subsystem | `2026-04-15-blocks-as-prompt-substrate.md` § "Rendering-chain traversal subsystem" |
| Research as factual substrate | `research-blocks-design.md` § "Framing" |
| L1–L5 layer × type dimensions | `research-blocks-design.md` § "Two orthogonal dimensions" |
| findings_summary / grounding / stale_conditions | `research-blocks-design.md` § "Shape — required fields" |
| Flat collection with cross-references | `research-blocks-design.md` § "Placement" |
| Method enum reliability table | `research-blocks-design.md` § "Method field — reliability implications" |
| FGAP-007 staleness engine | `research-blocks-design.md` § "Staleness enforcement" |
| research_sources back-edges on 5 schemas | `research-blocks-design.md` § "Integration" |
| Six structural gaps | `pi-project-schema-conventions-audit.md` § "Framework gaps surfaced" |
| Authorship not stamped at write time | `pi-project-schema-conventions-audit.md` § "Authorship attestation" |
| State-machine validation absent | `pi-project-schema-conventions-audit.md` § "State-machine validation on enum transitions" |
| No schema versioning / migration | `pi-project-schema-conventions-audit.md` § "Schema evolution" |
| Naming mismatches vs canonical vocabulary | `pi-project-schema-conventions-audit.md` § "Naming mismatches" |
| Consumer migration arc scope choice | `pi-project-schema-conventions-audit.md` § "Application to the consumer migration arc" |
