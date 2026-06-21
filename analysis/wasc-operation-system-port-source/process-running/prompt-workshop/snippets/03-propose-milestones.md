---
spec_key: propose-milestones
target_step: milestones
preview_mode: fields
deps: [narrative-draft]
grounding_sections:
  - school
  - cycle
  - improvement_types
  - planning_methods
  - learner_outcomes
  - guiding_statements
  - areas_for_improvement
  - draft_state
output_schema: shared/schemas/propose-milestones.schema.json
source_migration: ai/migrations/0006_seed_propose_milestones_template.py
success_criteria:
  - {"id": "min_list_size", "kind": "structural", "params": {"field": "milestones", "min": 2}}
---

{% include "shared/preamble.md" %}

You help a school author propose the milestones for a WASC schoolwide improvement plan. You are given the plan's draft so far and the school's own improvement types and planning methods. Your job is to PROPOSE 2 to 4 milestones — aspirational checkpoints that mark intended levels of work complete on the way to the plan's desired state. Ground only in the facts provided below; do not invent school specifics that are not present, and choose only from the provided codes and method names.

{% if school %}School: {{ school.name }}.{% endif %}
{% if cycle %}Accreditation cycle: {{ cycle.label }} ({{ cycle.starts_on }} to {{ cycle.ends_on }}). Every milestone's target date must fall within this window.{% endif %}

{% if seed %}Author refinement (an optional steer for the milestones): {{ seed }}{% endif %}

{% if draft_state %}The plan draft so far (the desired state + success criteria to set milestones toward):
{% for key, value in draft_state.items %}{% if value %}- {{ key }}: {{ value }}
{% endif %}{% endfor %}{% endif %}

{% if improvement_types %}Improvement types at this school (CHOOSE each milestone's improvement_type by its CODE from this list):
{% for it in improvement_types %}- "{{ it.code }}" ({{ it.label }}){% if it.requires_planning_method %} (REQUIRES a planning method){% else %} (no planning method required){% endif %}
{% endfor %}{% endif %}
{% if planning_methods %}The school's planning methods (CHOOSE a planning_method by its NAME from this list, only when the chosen improvement type requires one):
{% for m in planning_methods %}- "{{ m.name }}"{% if m.applicable_improvement_types %} (applies to types: {{ m.applicable_improvement_types|join:", " }}){% else %} (applies to any type){% endif %}
{% endfor %}{% endif %}
{% if learner_outcomes %}Schoolwide learner outcomes:
{% for o in learner_outcomes %}- "{{ o.label }}"{% if o.description %} — {{ o.description }}{% endif %}
{% endfor %}{% endif %}
{% if guiding_statements %}Guiding statements (the school's vision/mission clauses; name guiding clauses only from this list):
{% for kind, clauses in guiding_statements.items %}- {{ kind }}:
{% for c in clauses %}  {{ c.order }}. {% if c.label %}{{ c.label }} — {% endif %}{{ c.text }}
{% endfor %}{% endfor %}{% endif %}
{% if areas_for_improvement %}Areas for improvement:
{% for a in areas_for_improvement %}- {{ a.label }}{% if a.description %}: {{ a.description }}{% endif %}
{% endfor %}{% endif %}

Propose 2 to 4 milestones in the order they would be reached. For EACH milestone:
- Write a concise "label" describing the checkpoint (English only).
- Choose an "improvement_type" — exactly one of the CODES listed above.
- Set a "target_date" as a "YYYY-MM-DD" string within the accreditation cycle window; if you have no basis for a date, set it to null.
- Include a "planning_method" — one of the method NAMES above — ONLY when the chosen improvement type REQUIRES a planning method, AND only a method that applies to that type (a method linked to that type, or one that applies to any type). When the chosen type does NOT require a planning method, OMIT "planning_method" (or set it to null).

OUTPUT CONTRACT (follow exactly):
Return ONE JSON object and nothing else. Do not wrap it in markdown code fences. Do not write any prose before or after the JSON. Write all values in English only.

The object MUST have EXACTLY one key:
- "milestones": a JSON array of 2 to 4 elements. Each element is an object describing one milestone:
  - "label": the checkpoint as a concise statement (required, non-empty).
  - "target_date": a "YYYY-MM-DD" date string within the cycle window, or null.
  - "improvement_type": exactly one of the improvement-type CODES provided above (required).
  - "planning_method": one of the planning-method NAMES provided above, included ONLY when the chosen improvement type requires one (otherwise omit it or set it to null).

Choose only from the provided codes and names. No extra keys, no nested objects beyond this shape, no markdown.
