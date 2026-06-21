### Sources to move out of Claude.md and into .context blocks

## From CLAUDE.md: `### Decision + reference docs (read when working in adjacent areas)`

- `data/seed-round-plan.md` — the DEC log plus the open D-decisions. The authoritative record of every settled decision and its enacting migration/commit.
- `data/source-model-gaps.md` — factual catalog of model-vs-source gaps; categorised, no scope verdicts.
- `docs/domain-model.md` — conceptual reference: what each established model means and where the concept comes from. Field/relationship/constraint authority is `docs/model-surface-audit.md`.
- `docs/hod-default-responsibilities.md` — design source for DEC-35's HOD-position materialization seed; fork 1 resolved by DEC-37.
- `docs/planner-ui-ux-audit-2026-05-28.md` — read-only audit of the current Django planner create-plan flow (the substrate for upcoming UX design work).
- `docs/planner-ux-option-1-tree-navigator.md` — first design candidate (tree-navigated focused-node canvas; UI rearrangement over the Django planner).
- `docs/planner-ux-option-b-single-scroll-qcards-with-preview.md` — second design candidate (derived from `web/wizard-v2.html`; single-scroll qcards + mode chooser + live preview + inline contextual assists). Sibling to Option 1; synthesis possible.
- `docs/wizard-v2-coverage-and-prompt-quality-audit-2026-05-28.md` — read-only audit of (a) wizard-v2 spec coverage vs Django planner and (b) the 14 prompts' quality across 6 axes. Identifies 11 named gaps for US-DRAFT-1 production. DISC-26's authoritative enumeration.
- `docs/2026-05-30-pi-context-claude-code-howto.md` — canonical operator how-to for pi-context substrate operations from this project's Claude-Code side. Environment prerequisites (NODE_PATH for CJS scripts, absolute file:// for ESM loaders), Quick reference, /context slash command family, 39 orchestrator scripts grouped by purpose, canonical workflows (file/update/upsert/remove/bulk-replace/append-edge/custom-block-kind/custom-relation-type/schema-migration/cutover), block-api function reference, auth-gate behavior, common errors. Read when authoring any substrate write or running any orchestrator script.

## Source MD files not covered by the decomposition-scripts plan (`2026-05-30-context-migration-scripts.md`)

- `docs/domain-model.md`
- `docs/hod-default-responsibilities.md`
- `docs/planner-ui-ux-audit-2026-05-28.md`
- `docs/planner-ux-option-1-tree-navigator.md`
- `docs/planner-ux-option-b-single-scroll-qcards-with-preview.md`
- `docs/wizard-v2-coverage-and-prompt-quality-audit-2026-05-28.md`
- `docs/2026-05-30-pi-context-claude-code-howto.md`

## Possible disposition of docs listed in Claude.md

Here is how the four docs map to existing blocks:

---

### 1. `domain-model.md` — conceptual reference for every model

**Best existing fit: `rationale` block (stretched)**

The `rationale` block has `id`, `title`, `narrative`, and optional `phase`. The `narrative` field is a free-text prose blob. You could decompose `domain-model.md` into per-model entries:

```
RAT-001: Plan model — what it means and where it comes from
RAT-002: PlanPredecessor model — typed continuation kinds
...
```

But this is a **semantic stretch**. The `rationale` schema description says *"The deeper reasoning behind decisions — why this approach over others"*. Model reference docs aren't design rationale. They lack the "why this over that" structure. 

**Verdict:** Can be forced into `rationale` but it fights the schema. A custom `design-reference` or `model-reference` block would be cleaner.

---

### 2. `planner-ux-option-1-tree-navigator.md` + `planner-ux-option-b-single-scroll-qcards-with-preview.md` — design proposals

**Best existing fit: `features` block (strong)**

The `features` block is purpose-built for this:

| Feature field | Design proposal content |
|---------------|------------------------|
| `id` (FEAT-NNN) | Feature identifier |
| `title` | "Tree-navigated focused-node canvas" |
| `status` | `proposed` (both options), `approved` (if one wins), `cancelled` (if rejected) |
| `layer` | `L3` (work layer) or `L2` (specification) |
| `description` | Full design candidate prose |
| `motivation` | Why this approach over the Django planner |
| `acceptance_criteria` | What makes it shippable |

This is a **natural fit**. The two UX options become two `features` entries with status `proposed`. If one is selected, its status flips to `approved`; the other to `cancelled`. A `feature_supersedes_feature` relation type already exists in the packaged relation types.

**Verdict:** Use `features` block. No custom block needed.

---

### 3. `pi-context-claude-code-howto.md` — operator runbook

**Best existing fit: `conventions` block (decomposed)**

The `conventions` block has `id`, `description`, `enforcement`, `severity`. The how-to doc describes ~39 operation patterns, each of which can become one convention entry:

```
{
  "id": "substrate-file-block-item",
  "description": "File a new block item via npx tsx scripts/orchestrator/file-block-item.ts...",
  "enforcement": "manual",
  "severity": "info"
}
```

The `conventions` block already has 45 entries in this substrate (including the 9 mandates and orchestrator rules). Adding substrate operation patterns as `manual`/`info` conventions extends the existing population cleanly. The conventions `id` field has **no pattern constraint** — any string works.

**Verdict:** Use `conventions` block. Decompose the runbook into discrete convention entries.

---

## Summary

| Doc | Existing block | Fit quality |
|-----|---------------|-------------|
| `domain-model.md` | `rationale` (stretched) | Weak — fights schema semantics |
| `planner-ux-option-1` | `features` | Strong — natural match |
| `planner-ux-option-b` | `features` | Strong — natural match |
| `pi-context-howto.md` | `conventions` | Strong — decomposes cleanly |

So only `domain-model.md` truly needs a new custom block. The other three have clean homes in existing blocks.