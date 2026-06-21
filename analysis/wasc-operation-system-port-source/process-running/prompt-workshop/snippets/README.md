# Snippets

One MD file per spec, numbered by dependency order (so `ls` lists them in execution order).

Naming convention: `NN-<spec-key>.md` where NN is 01..15 and `<spec-key>` matches the production `AssistSpec` key (e.g. `01-narrative-draft.md`, `07-propose-assignments.md`, `15-whole-plan-composer.md`).

## Snippet shape

```markdown
---
spec_key: narrative-draft
target_step: basics
preview_mode: fields
deps: []                       # list of spec_keys this snippet's grounding depends on (their outputs must be in draft_state before this runs)
grounding_sections:            # list of grounding emitter names from ai/services/grounding.py
  - school
  - framing_vocabularies
  - priority_tiers
  - areas_for_improvement
  - learner_outcomes
  - mission_areas
  - stakeholder_groups
  - accreditation_standards
  - prior_plans
  - draft_state
output_schema: shared/schemas/narrative-draft.schema.json
source_migration: ai/migrations/0003_seed_prompt_template_narrative_draft.py   # the production migration this snippet's body initially came from / will land back into
---

{% include "shared/preamble.md" %}

You help a school author draft the narrative sections of a WASC...

[full Django template body — same {{ var }} / {% if %} / {% for %} as production PromptTemplate.body]

Author seed: {{ seed }}

Return ONE JSON object with EXACTLY these keys:
- current_state
- desired_state
- rationale
- student_impact_framing
- provenance
```

## Why MD + YAML frontmatter

- **Body is verbatim Django template syntax.** The `ai/0018+` migration that lands validated bodies into production reads each snippet's body block as a string and `UPDATE`s the corresponding `PromptTemplate.body` field. No format translation; the snippet body IS the production prompt.
- **Frontmatter is human-readable + machine-parsable.** The dispatch scripts read frontmatter to know which grounding sections to emit, what schema to validate against, and which prior outputs must be in the draft before this snippet runs.
- **Shared preamble lands once.** Every snippet body opens with `{% include "shared/preamble.md" %}` so the audit-gap #8/#9/#10/#11 corrections (general success criteria + zero-hedging + operational policies + current→desired meta-framing) apply uniformly across all 14 (or 15) prompts. Edit the preamble once → all 14 prompts uplifted.

## Bootstrap: initial-state of each snippet

Each snippet's body starts as a verbatim copy of the production `ai/000N` migration's template body. First-iteration outputs reproduce production behavior, providing a baseline diff target for iteration. The shared preamble starts populated with the audit-gap corrections (already done — see `shared/preamble.md`).

## Iteration order suggestion

Per the audit's per-spec rating table:

1. Start with the strongest prompts to confirm baseline rendering works: A3-post-0016 (`13-propose-domain-alignment.md`), US-LLM-27 (`11-propose-responsibilities.md`), F1 (`02-decompose-action-steps.md`), B1 (`03-draft-success-criteria.md`).
2. Iterate on the weakest: F2 (`07-propose-assignments.md`), F3 (`08-propose-timelines.md`), B2 (`06-bind-measurement-channels.md`), D1 (`04-propose-milestones.md`).
3. Then the middle band.
4. Finally the new 15th: whole-plan-composer (`15-whole-plan-composer.md`) — audit gap #1.

## What lives here

This README + the per-spec snippet files. No code. No outputs. Just the editable prompt sources.
