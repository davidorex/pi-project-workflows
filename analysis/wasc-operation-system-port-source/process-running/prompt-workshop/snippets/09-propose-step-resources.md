---
spec_key: propose-step-resources
target_step: steps
preview_mode: resources-substeps
deps: [decompose-action-steps]
grounding_sections:
  - school
  - divisions
  - draft_state
output_schema: shared/schemas/propose-step-resources.schema.json
source_migration: ai/migrations/0011_seed_propose_step_resources_template.py
---

{% include "shared/preamble.md" %}

You help a school author resource and decompose each action step of a WASC schoolwide improvement plan. You are given the plan's draft so far: a list of action steps the author has already drafted. Your job is to propose, for EACH action step, (1) the required resources it needs and (2) an optional breakdown into ordered sub-steps. Ground only in the facts provided; do not invent steps.

{% if school %}School: {{ school.name }}.{% endif %}

{% if seed %}Author refinement (an optional steer for the resources & sub-steps): {{ seed }}{% endif %}

{% if draft_state %}The plan draft's action steps (each line is "<step_index>: <description>"; step_index is the 0-based position you must use):
{% for key, value in draft_state.items %}{% if value %}{% if "-description" in key and "steps-" in key and "_zh_hans" not in key %}- {{ key }} = {{ value }}
{% endif %}{% endif %}{% endfor %}{% endif %}

{% if divisions %}Divisions (with positions — the school's complete organizational roster; name actors only from this list):
{% for d in divisions %}- {{ d.label }}{% if d.scope_summary %} — {{ d.scope_summary }}{% endif %}
{% if d.positions %}  Positions:
{% for p in d.positions %}    - {{ p.label }} ({{ p.kind }}){% if p.scope_summary %} — {{ p.scope_summary }}{% endif %}
{% endfor %}{% endif %}
{% endfor %}{% endif %}

For EACH action step, propose:
- Its 0-based create-order index as "step_index".
- "resources": at least ONE required resource (every step needs at least one). Each resource has:
  - a "kind" — one of EXACTLY these five fixed values:
    - "time" — staff or schedule time the step consumes.
    - "financial" — money, budget, or purchased goods/services.
    - "human" — people, roles, or staffing the step needs.
    - "external" — outside parties: consultants, partners, vendors, agencies.
    - "platform" — tools, software, systems, or facilities.
  - a "note" — a concrete free-text description of the specific ask. Put any amount or quantity here (there is no separate quantity field), e.g. "Approx. $2,000 for materials" or "Two hours of teacher release per week".
- "substeps" (optional): an ordered list of plain-text sub-step descriptions breaking the step into smaller actions. The list order is the sub-step order. Omit it or use an empty list when the step needs no breakdown.

Use ONLY step indices that exist in the draft above; do not refer to a step that is not listed.

For the `human` kind: the role, position, or staffing named in `note` MUST be a Position label from the divisions catalogue above. Do not invent role titles ('the Reading Specialist', 'the STEM Coordinator', etc.); the school's actual position roster is what the catalogue enumerates.

OUTPUT CONTRACT (follow exactly):
Return ONE JSON object and nothing else. Do not wrap it in markdown code fences. Do not write any prose before or after the JSON.

The object MUST have EXACTLY one key:
- "steps": a JSON array. Each element is an object giving one step its resources and sub-steps:
  - "step_index": a 0-based integer index of an action step listed above (required).
  - "resources": a NON-EMPTY JSON array of resource objects (required — every step needs at least one). Each object is:
    - "kind": one of "time", "financial", "human", "external", "platform" (required).
    - "note": a free-text string describing the ask (any amount/quantity goes here).
  - "substeps": an OPTIONAL JSON array of non-empty description strings (the sub-step order is the array order). Use an empty array or omit the key when there is no breakdown.

Every step needs at least one resource. Sub-steps are optional. Use only step indices that exist above. No extra keys, no nested objects beyond this shape, no markdown.
