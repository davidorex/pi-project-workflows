# Zoom-out — blocks are the prompt substrate for pi-jit-agents

Date: 2026-04-15
Status: zoom-out reframing, follow-on to the process articulation

The `.project/` blocks are not state storage separate from agent work. They are **composable prompt fragments** that pi-jit-agents injects into agent contexts via `contextBlocks`. This reframes their shape, their cross-references, their token budget, and exposes missing rendering infrastructure.

---

## Today's injection mechanism

1. Agent spec declares `contextBlocks: [conventions, requirements, conformance-reference]`
2. `compileAgent` reads each named block via pi-project's `readBlock`
3. Content injected into Nunjucks context as `_<name>` with hyphens → underscores
4. Framework-level anti-injection delimiters wrap the injected content (post-issue-045)
5. Templates render via macros at `packages/pi-workflows/templates/shared/macros.md`

---

## The critical observation — existing macros render whole blocks, not per-item

The current library has twelve macros: `render_conventions`, `render_requirements`, `render_conformance`, `render_architecture`, `render_project`, `render_domain`, `render_decisions`, `render_tasks`, `render_issues`, `render_exploration`, `render_exploration_full`, `render_gap`. Every name is plural or whole-block. Every macro takes the entire block as input and renders every item.

**Atomic composability requires per-item rendering.** An agent working on STORY-001 does not need every feature in `features.json` — it needs FEAT-001 and the specific story and tasks it is working on. An agent reading a single decision does not need every decision in the log. The current library operates at the wrong granularity for the injection patterns the L2/L3 blocks demand.

**The granularity mismatch is itself a framework gap.** Every existing macro needs a per-item sibling (or a refactor that accepts an item filter), and every new block kind must land with per-item macros from the start. Per-item rendering is the precondition for any scoped injection.

---

## Macros library status for all block kinds

| Block kind | Whole-block macro | Per-item macro | Block landed | Prompt-injectable today |
|---|---|---|---|---|
| project.json | `render_project` | missing | yes | whole-only |
| conventions.json | `render_conventions` | missing | yes | whole-only |
| domain.json | `render_domain` | missing | yes | whole-only |
| requirements.json | `render_requirements` | missing | yes | whole-only |
| architecture.json | `render_architecture` | missing | yes | whole-only |
| decisions.json (existing flat) | `render_decisions` | missing | yes | whole-only |
| tasks.json | `render_tasks` | missing | yes | whole-only |
| issues.json | `render_issues` | missing | yes | whole-only |
| conformance-reference.json | `render_conformance` | missing | yes | whole-only |
| exploration | `render_exploration`, `render_exploration_full` | missing | yes | whole-only |
| gap (legacy cross-block validation concept) | `render_gap` | missing | yes | whole-only |
| **decisions.json (new)** | missing | missing | yes | **no** |
| **spec-reviews.json (new)** | missing | missing | yes | **no** |
| **features.json (new)** | missing | missing | yes | **no** |
| **framework-gaps.json (new)** | missing | missing | yes | **no** |
| **layer-plans.json (new)** | missing | missing | yes | **no** |
| **research.json (pending)** | missing | missing | no | **no** |

Six new block kinds are prompt-unreachable. Every existing block can only be whole-block injected. The `render_gap` name is occupied by a legacy cross-block validation concept that folds into `issues` under the canonical vocabulary direction, freeing the name for the new `framework-gaps.json` per-item macro once the legacy concept retires.

---

## `contextBlocks` needs item-level selectivity

The current block-name-only mechanism cannot express "inject just FEAT-001 focused on STORY-001." Required extension to agent spec schema:

```yaml
contextBlocks:
  - name: features
    item: FEAT-001
    focus:
      story: STORY-001
      task: TASK-001-02
    depth: 1
```

Schema change to agent spec. No alternative — a typed structured field is the only correct shape for an agent spec.

---

## Depth control

`render_decision(dec, depth=0)` emits the decision with cross-references as bare IDs. `depth=1` inlines direct references. `depth=2` recurses one level. `depth=∞` traverses the full graph. Depth is a first-class parameter threaded through every per-item macro and through the `contextBlocks` declaration.

---

## Token budget hints

Every schema field that gets rendered into a prompt carries an `x-prompt-budget` metadata annotation:

```json
"findings_summary": {
  "type": "string",
  "x-prompt-budget": { "tokens": 1000, "words": 800 }
}
```

The renderer reads `x-prompt-budget` and warns or truncates on overflow. Callers composing multi-block prompts sum budgets in advance.

---

## Rendering-chain traversal subsystem

Per-item macros that inline cross-references require:

1. A **renderer registry** mapping block-item kinds to their per-item macros
2. A **cross-block query**: given a reference ID (e.g. `REV-001-F003`), find the block and entry that owns it
3. **Depth-aware recursion**: each recursive call decrements depth; at 0, emit only the ID
4. **Cycle detection**: prevent infinite recursion when references loop

This is a substantive new subsystem. pi-project's `project-sdk.ts` has cross-block query primitives for validation, but they are not exposed as a rendering service, and the macros library has no registry. The subsystem lives at the boundary between pi-project (data + schemas) and pi-jit-agents (prompt composition).

---

## Bidirectional schema contract as principle

Block schemas serve three roles simultaneously and the single-source-of-truth framing is load-bearing:

1. **Read-shape**: when `compileAgent` reads a block and a macro renders it into prompt text
2. **Write-shape**: when a workflow step or monitor produces output that targets a block
3. **Validate-shape**: at rest, block contents conform to the schema

Every schema IS all three contracts. Capturing this as a decision record commits the framework to schema-as-central-pivot. Proposed as a future decision entry once a forcing issue or gap warrants promotion; stands as research-level articulation until then.

---

## REVIEW-001 is blocked on decision-record macro existence

The fresh-context independent reviewer subagent for `docs/planning/jit-agents-spec.md` is an agent. Its `contextBlocks` must inject the three proposed decision records (DEC-0001/0002/0003) for the reviewer to evaluate them. Without a per-item decision macro, the reviewer agent cannot read the decisions from its prompt. The design review cannot run until at least `render_decision(dec)` exists.

**Path D ordering consequence**: macros extension for `render_decision` precedes REVIEW-001 execution. This is not a preference — it is a compile-chain dependency.

---

## What this means for the research block enactment

`analysis/research-blocks-design.md` specifies `findings_summary` as prompt-injectable content. The design is incomplete without `render_research(r)`. Research block enactment must land the macro alongside the schema and seed data, not as a follow-on epic.

**Per principle**: every schema lands with its per-item macro. Schema and macro are a single unit of work. A schema without its macro is structurally unreachable and therefore not shipped.

---

## New discovered shortcomings from the zoom-out

1. **Per-item rendering missing across every existing macro.** The library renders whole blocks only. Per-item is the precondition for scoped injection. Either every existing macro gains a per-item sibling, or the whole library is refactored to accept item filters.

2. **Six per-item macros missing for the new block kinds.** `render_decision`, `render_spec_review`, `render_feature`, `render_framework_gap`, `render_layer_plan`, `render_research`. None exist. All six new block kinds are prompt-unreachable.

3. **`contextBlocks` agent-spec schema needs item-level selectivity** with `name`, `item`, `focus`, and `depth` fields. Current block-name-only mechanism is insufficient.

4. **Rendering depth as a first-class parameter** threaded through every per-item macro and every `contextBlocks` declaration.

5. **Per-field token budget annotations** on every schema field that renders into prompts. `x-prompt-budget: { tokens, words }` metadata.

6. **Rendering-chain traversal subsystem**: registry, cross-block query, depth-aware recursion, cycle detection. Lives at the pi-project / pi-jit-agents boundary.

7. **Bidirectional schema contract not captured as a principle**. Decision record proposed to codify schema-as-central-pivot.

8. **`render_gap` name occupied by legacy concept that retires** under the canonical vocabulary direction. The name frees for the new `framework-gaps.json` per-item macro when the legacy validation `gap` concept folds into `issues`.

9. **REVIEW-001 blocked on `render_decision`.** Compile-chain dependency. Macros extension precedes design review execution on the critical path of Path D.

---

## Principle — every schema lands with its per-item macro

A schema without its per-item macro is structurally unreachable from agent contexts. A block kind is not "shipped" until an agent can read one of its items from a `contextBlocks` injection. Future enactment of any new block kind must land schema + seed data + per-item macro as a single unit of work. This principle is proposed for ratification once a forcing artifact promotes it to a live decision.

---

## User decisions this surfaces

1. **Ratify the reframe**: blocks are prompt substrate; every new block ships with its per-item macro as a single unit of work
2. **Acknowledge REVIEW-001 blocker**: macros extension for `render_decision` precedes design review execution
3. **Commit the bidirectional schema contract principle** as a new decision record
4. **Capture the nine new shortcomings** in `framework-gaps.json` (pending vocabulary decision for naming)
