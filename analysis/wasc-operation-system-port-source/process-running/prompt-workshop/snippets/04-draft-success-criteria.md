---
spec_key: draft-success-criteria
target_step: criteria
preview_mode: fields
deps: [narrative-draft]
grounding_sections:
  - school
  - cycle
  - learner_outcomes
  - guiding_statements
  - areas_for_improvement
  - divisions
  - policies
  - draft_state
output_schema: shared/schemas/draft-success-criteria.schema.json
source_migration: ai/migrations/0005_seed_draft_success_criteria_template.py
---

{% include "shared/preamble.md" %}

You help a school author draft the success criteria for a WASC schoolwide improvement plan. You are given the plan's draft desired state and rationale plus the school's schoolwide learner outcomes and areas for improvement. Your job is to draft 3 to 6 observable success criteria that would show this plan's desired state has been reached. Ground only in the facts provided below; do not invent school specifics that are not present.

{% if school %}School: {{ school.name }}.{% endif %}
{% if cycle %}Accreditation cycle: {{ cycle.label }} ({{ cycle.starts_on }} to {{ cycle.ends_on }}).{% endif %}

{% if seed %}Author refinement (an optional steer for the criteria): {{ seed }}{% endif %}

{% if draft_state %}The plan draft so far (the desired state + rationale to draw criteria from):
{% for key, value in draft_state.items %}{% if value %}- {{ key }}: {{ value }}
{% endif %}{% endfor %}{% endif %}

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
{% if divisions %}Divisions (with positions — the school's complete organizational roster; name actors only from this list):
{% for d in divisions %}- {{ d.label }}{% if d.scope_summary %} — {{ d.scope_summary }}{% endif %}
{% if d.positions %}  Positions:
{% for p in d.positions %}    - {{ p.label }} ({{ p.kind }}){% if p.scope_summary %} — {{ p.scope_summary }}{% endif %}
{% endfor %}{% endif %}
{% endfor %}{% endif %}
{% if policies %}Policies (the school's enumerated policies; name policies only from this list):
{% for p in policies %}- {{ p.label }}{% if p.notes %} — {{ p.notes }}{% endif %}
{% endfor %}{% endif %}

Draft 3 to 6 success criteria, each written as a concrete, observable statement of what will be true when this plan succeeds. TYPE each criterion by how it will be verified, choosing exactly one verification kind:
- "inspection": verification is the PRESENCE of a named artifact (e.g. a published policy, a completed document). No number.
- "judgment": verification is a QUALITATIVE assessment by a named reviewer or rubric. No number.
- "target": verification is a QUANTITATIVE threshold — and ONLY then does the criterion carry a number. A target criterion MUST state a numeric "target_value", a "target_unit" naming what is measured, and a numeric "baseline" (the current level the target moves from).

Quantify a criterion ONLY by making it a "target"-kind criterion; numbers belong inside a target criterion's three target fields and nowhere else. Do not introduce key performance indicators or any standalone metric. Prefer a mix of kinds where the plan warrants it.

For inspection-kind: if the `text` names a policy or document, that policy MUST appear in the policies catalogue above; if it names a reviewer, that reviewer's division/position MUST appear in the divisions catalogue. For judgment-kind: the named reviewer or rubric-applier MUST be a division or position from the divisions catalogue above.

OUTPUT CONTRACT (follow exactly):
Return ONE JSON object and nothing else. Do not wrap it in markdown code fences. Do not write any prose before or after the JSON. Write all values in English only.

The object MUST have EXACTLY one key:
- "criteria": a JSON array of 3 to 6 elements. Each element is an object describing one success criterion:
  - "text": the criterion as a concrete, observable statement (required, non-empty).
  - "verification_kind": exactly one of "inspection", "judgment", or "target" (required).
  - For a "target" criterion ONLY, also include:
    - "target_value": a number (the threshold).
    - "target_unit": a non-empty string naming what is measured.
    - "baseline": a number (the current level).
  - For an "inspection" or "judgment" criterion, OMIT "target_value", "target_unit", and "baseline" entirely (or set them to null).

No extra keys, no nested objects beyond this shape, no markdown.
