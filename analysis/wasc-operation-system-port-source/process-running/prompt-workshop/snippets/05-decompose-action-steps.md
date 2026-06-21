---
spec_key: decompose-action-steps
target_step: steps
preview_mode: fields
deps: [propose-milestones]
grounding_sections:
  - school
  - cycle
  - improvement_types
  - planning_methods
  - areas_for_improvement
  - learner_outcomes
  - guiding_statements
  - stakeholder_groups
  - divisions
  - division_responsibility_summary
  - policies
  - draft_state
output_schema: shared/schemas/decompose-action-steps.schema.json
source_migration: ai/migrations/0004_seed_decompose_action_steps_template.py
success_criteria:
  - {"id": "min_list_size", "kind": "structural", "params": {"field": "action_steps", "min": 1}}
---

{% include "shared/preamble.md" %}

You help a school author break a WASC schoolwide improvement plan into concrete action steps. You are given the plan's draft shape and the school's own planning-method recipes. Your job is to SELECT the single best-fitting method for this plan and EXPAND that method's ordered step templates into concrete, plan-specific action steps. Ground only in the facts provided below; do not invent school specifics that are not present, and do not invent methodology.

{% if school %}School: {{ school.name }}.{% endif %}
{% if cycle %}Accreditation cycle: {{ cycle.label }} ({{ cycle.starts_on }} to {{ cycle.ends_on }}).{% endif %}

{% if seed %}Author refinement (an optional steer for the steps): {{ seed }}{% endif %}

{% if draft_state %}The plan draft so far (the shape to fit a method to):
{% for key, value in draft_state.items %}{% if value %}- {{ key }}: {{ value }}
{% endif %}{% endfor %}{% endif %}

{% if improvement_types %}Improvement types in play at this school:
{% for it in improvement_types %}- {{ it.code }}: {{ it.label }}
{% endfor %}{% endif %}
{% if areas_for_improvement %}Areas for improvement:
{% for a in areas_for_improvement %}- {{ a.label }}{% if a.description %}: {{ a.description }}{% endif %}
{% endfor %}{% endif %}
{% if learner_outcomes %}Schoolwide learner outcomes:
{% for o in learner_outcomes %}- "{{ o.label }}"{% if o.description %} — {{ o.description }}{% endif %}
{% endfor %}{% endif %}
{% if guiding_statements %}Guiding statements (the school's vision/mission clauses; name guiding clauses only from this list):
{% for kind, clauses in guiding_statements.items %}- {{ kind }}:
{% for c in clauses %}  {{ c.order }}. {% if c.label %}{{ c.label }} — {% endif %}{{ c.text }}
{% endfor %}{% endfor %}{% endif %}

{% if planning_methods %}The school's planning-method recipes (CHOOSE EXACTLY ONE by its name; do not invent a method):
{% for m in planning_methods %}- "{{ m.name }}"{% if m.rationale %} ({{ m.rationale }}){% endif %}{% if m.applicable_improvement_types %} (applies to: {{ m.applicable_improvement_types|join:", " }}){% endif %}
{% if m.steps %}  Ordered step templates (context to expand into concrete plan-specific steps — do not copy verbatim):
{% for tpl in m.steps %}    {{ forloop.counter }}. ({{ tpl }})
{% endfor %}{% endif %}{% endfor %}{% endif %}

{% if stakeholder_groups %}Stakeholder groups (the school's enumerated audiences; name stakeholder groups only from this list):
{% for s in stakeholder_groups %}- {{ s.label }}
{% endfor %}{% endif %}
{% if divisions %}Divisions (with positions — the school's complete organizational roster; name actors only from this list):
{% for d in divisions %}- {{ d.label }}{% if d.scope_summary %} — {{ d.scope_summary }}{% endif %}
{% if d.positions %}  Positions:
{% for p in d.positions %}    - {{ p.label }} ({{ p.kind }}){% if p.scope_summary %} — {{ p.scope_summary }}{% endif %}
{% endfor %}{% endif %}
{% endfor %}{% endif %}
{% if division_responsibility_summary %}Division responsibilities (each division's purview — generate distinct actions across these):
{% for d in division_responsibility_summary %}- {{ d.division }}: {% for r in d.responsibilities %}{{ r }}{% if not forloop.last %}; {% endif %}{% endfor %}
{% endfor %}{% endif %}
{% if policies %}Policies (the school's enumerated policies; name policies only from this list):
{% for p in policies %}- {{ p.label }}{% if p.notes %} — {{ p.notes }}{% endif %}
{% endfor %}{% endif %}

First SELECT the single method whose process best fits this plan's draft and improvement types. **The chosen method's `applies to:` list MUST include at least one of the draft milestones' improvement_type codes, or be empty (meaning the method applies to any type).** This is an admin-curated invariant: a method's applicable improvement_types is a deliberate constraint set by the school's admin; pick a method that admits at least one of the milestones' actual improvement_types, do not pick a method whose process merely "feels like the right shape" if its `applies to:` doesn't cover any milestone improvement_type. Read each method's `(applies to: ...)` clause above against the `milestones-N-improvement_type` lines in the draft state; the intersection must be non-empty (or the method's `applies to:` must be empty / any-type). The chosen method names the school's PROCESS DISCIPLINE — its approach to driving change — and you report it in the output; it does NOT dictate how many steps you produce or a one-step-per-template shape. Choose ONLY from the provided methods; do not invent methodology.

GENERATE the step set FROM the division-responsibility map above. Produce DISTINCT, substantive action steps spread ACROSS the divisions whose responsibilities bear on this plan's desired state. Each step is a concrete thing a SPECIFIC division does, grounded in that division's own responsibility; the division it serves is named in the step. Cover BOTH in-class (lesson) purviews AND out-of-lesson purviews — the school's non-lesson actors (Student Affairs Office, Homeroom Teacher, Year Group Leader, Dormitory Teacher, and the other pastoral / well-being / boarding roles enumerated above) own out-of-lesson actions and must carry their share. NO single division owns a majority of the steps; the spread follows the responsibility map, not a single method's process. Write each step's "description" as the concrete work to do; write each step's "assessment" as how completion of that step will be checked (an empty string is acceptable when no assessment is warranted). Within each step's "description", state the precursor(s) the step depends on — what must be in place first for the work to be possible (data, a tool, training, coordination, another division's output, a policy) — or state plainly that none are needed. A step that assumes its precursors are already met without saying so is incomplete; name what must precede the work, or affirm that nothing must.

Every actor, unit, role, position-title, or owning body named in `description` or `assessment` MUST be a verbatim match to a Division or Position label from the divisions catalogue above; every stakeholder named MUST be a label from the stakeholder_groups catalogue; every policy named MUST be a label from the policies catalogue. The school's organizational roster is exactly what the catalogues enumerate; do not name roles, departments, or offices not present.

Write the step set for a SCHOOL-WIDE plan. Let the steps span diverse improvement areas and types, not one repeated focus. State the HOW in each step's "description" — the concrete mechanism or method by which the work is done, not just the intended outcome. Where a step advances bilingual (Chinese–English) language development, frame it as serving a dual purpose: fostering the learner outcome AND improving bilingual language use.

OUTPUT CONTRACT (follow exactly):
Return ONE JSON object and nothing else. Do not wrap it in markdown code fences. Do not write any prose before or after the JSON. Write all values in English only.

The object MUST have EXACTLY these two keys:
- "method": the exact name of the single chosen method, copied verbatim from one of the provided method names above.
- "steps": a non-empty JSON array, one element per the chosen method's step templates, in template order. Each element is an object with EXACTLY two string keys:
  - "description": the concrete action step for this plan.
  - "assessment": how completion of this step is checked (may be an empty string).

No nested objects beyond this shape, no extra keys, no markdown.
