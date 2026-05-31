# Brief: specify a NEW composer-script suite, modeled on `.context-jit-spec-v2`

Produce a SPECIFICATION (not an implementation) for a NEW suite of Claude-Code-side composer scripts under `scripts/orchestrator/`. Write the spec to `/Users/david/Projects/workflowsPiExtension/analysis/2026-05-31-new-composer-suite-spec.md`. Your final message returns ONLY that path + a one-sentence summary; do not inline-dump the spec.

## The directive (do not reinterpret, reduce, or substitute)

Write a NEW suite. Not a modification of existing scripts. Not a generalization of an existing surface. A new suite, modeled specifically on the `.context-jit-spec-v2` substrate.

You may NOT propose "modify the existing scripts instead," "generalize the canonical surface," "add a flag to an existing composer," or any variant that avoids producing a new suite. The decision to build a new suite is already made by the operator and is not yours to revisit. If you find yourself reasoning toward reuse-in-place, stop — that reasoning is out of bounds for this task.

## Hard constraints on your inputs

- **Do NOT read** `scripts/orchestrator/compile-*.ts`, `scripts/orchestrator/inject-context-items.ts`, `scripts/orchestrator/extract-*.ts`, `scripts/orchestrator/gather-execution-context.ts`, or any existing composer/extractor script. They are the prior-art whose shape biases toward the `.project`-only era; reading them is how the operator's intention gets negated. Specify the new suite from the substrate shape, not from the existing scripts.
- **Do NOT read** any file under `analysis/` matching `*composer*` (a prior spec existed and was deleted precisely so it cannot anchor you).
- Your design inputs are: the `.context-jit-spec-v2` substrate itself, its schemas, the pi-context library surface it's built on, and the binding feedback mandates. Nothing else.

## What the suite must do

Render an implementation plan, drawn from `.context-jit-spec-v2` substrate content, into a subagent prompt — MECHANICALLY. Substrate field values reach the prompt verbatim; no LLM sits in the rendering path. The purpose is to bypass LLM hedging / paraphrasing / corner-cutting by making the prompt a deterministic projection of substrate content rather than an LLM-composed summary. This verbatim-projection property is the point of the whole suite; every design choice serves it.

## What to investigate (read; cite file:line for every claim)

1. **The `.context-jit-spec-v2` substrate as it actually is.** Read its `config.json` (block_kinds, relation_types, lenses, invariants). Read every block file it carries (`ls .context-jit-spec-v2/*.json`) and each block's schema under `.context-jit-spec-v2/schemas/`. The implementation-plan-bearing content lives here — work-orders, tasks, features, decisions, concepts, dispatch-modes, axioms, framework-gaps, context-contracts, friction-items, authority-docs, v1-supersessions, relations. Determine which block kind(s) carry a dispatchable implementation plan and what fields each contributes to a subagent prompt. Enumerate every field of the relevant block(s) with type + meaning + a real example value from the substrate.

2. **The pi-context read + validate library surface** the new suite will build on: `packages/pi-context/src/block-api.ts` (readBlock + how it resolves which substrate), `packages/pi-context/src/context-dir.ts` (resolveContextDir + the `.pi-context.json` pointer), `packages/pi-context/src/schema-validator.ts` (the canonical validator). Establish how a script reads a named block from a chosen substrate, and whether reading a specific substrate is possible without mutating the global `.pi-context.json` pointer. Cite signatures.

3. **The closure-table relations** in `.context-jit-spec-v2/relations.json` + the relation_types in its config — how the plan-bearing block connects to the supporting items (decisions it realizes, concepts it references, friction it addresses, etc.), so the suite can pull the connected context into the prompt.

4. **The binding mandates any subagent prompt must carry** so the spec requires them as non-optional, verbatim-injected sections (never paraphrased). Read these feedback files at `~/.claude/projects/-Users-david-Projects-workflowsPiExtension/memory/`: `feedback_constraining_subagent_briefs.md`, `feedback_scope_agents_with_facts.md`, `feedback_dispatch_agent_type_must_match_tool_directives.md`, `feedback_agent_output_to_file.md`, `feedback_subagents_no_npm.md`, `feedback_subagent_commits_per_step.md`, `feedback_runtime_demo_plus_adversarial_per_step.md`, `feedback_orchestrator_owns_subagent_output.md`, `feedback_no_parallel_ungated_paths.md`. The 9 operating mandates (mandate-001..009) arrive via the UserPromptSubmit hook each turn — the spec must state they are carried into every rendered prompt verbatim.

## What the spec must define

- **The suite**: name each new script, its single responsibility, its inputs (flags), which substrate block/relations it reads + how, and its output shape. Cover the full path from "a plan unit in `.context-jit-spec-v2`" to "a complete, dispatch-ready subagent prompt."
- **The substrate-field → prompt-section mapping**: a table — every field of the plan-bearing block → which prompt section it populates → verbatim or transformed (and if transformed, the exact deterministic rule, no LLM).
- **The verbatim-projection guarantee**: precisely how every prompt section is produced without an LLM in the path (template-string literal, verbatim substrate read, or deterministic transform). Name what supplies each section.
- **How the suite targets `.context-jit-spec-v2`** specifically, and how it reads supporting items connected by relations.
- **The binding-preamble requirement**: which mandates + feedback are injected verbatim into every rendered prompt, and how.
- **Provenance**: the rendered prompt must label its actual source substrate (`.context-jit-spec-v2`), never a hardcoded other dir.
- **Dependencies + sequencing**: what must exist before what.
- **Out of scope**: only items a reader would reasonably expect in scope but you deliberately exclude — never invented non-issues, and never "modify the existing scripts" framed as out-of-scope (that option does not exist for this task at all).

## Rules

- Cite file:line for every factual claim. Mark unverifiable items UNVERIFIED.
- Read complete files before characterizing them; do not infer from partial views. If a read truncates, paginate.
- SPEC only — do not write any composer script, do not edit source, do not modify substrate. The single file you write is the spec at the path above.
- No hedging — decisions with rationale, not "consider whether."
- Do not at any point recommend reusing, modifying, or generalizing existing composer scripts. The deliverable is the specification of a new suite.

## Report structure (write to the spec path)
```
# New composer suite for .context-jit-spec-v2 — specification (2026-05-31)
## Plan-bearing block(s) in .context-jit-spec-v2 — fields, types, meanings, real values [file:line]
## pi-context read/validate surface the suite builds on [file:line]
## Supporting-context via relations [file:line]
## The new suite — each script: name / responsibility / flags / substrate-read / output
## Substrate-field → prompt-section mapping [table: field → section → verbatim|transform-rule]
## Verbatim-projection guarantee — how each section is produced with no LLM in the path
## Substrate targeting + supporting-item reads
## Binding preamble — mandates + feedback injected verbatim
## Provenance
## Dependencies + sequencing
## Out of scope
```
