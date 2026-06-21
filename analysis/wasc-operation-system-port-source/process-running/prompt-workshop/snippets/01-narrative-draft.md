---
spec_key: narrative-draft
target_step: basics
preview_mode: fields
deps: []
grounding_sections:
  - school
  - cycle
  - framing_vocabularies
  - priority_tiers
  - year_groups
  - learner_outcomes
  - areas_for_improvement
  - stakeholder_groups
  - divisions
  - guiding_statements
  - policies
  - accreditation_standards
  - prior_plans
  - draft_state
output_schema: shared/schemas/narrative-draft.schema.json
source_migration: ai/migrations/0003_seed_plan_narrative_draft_template.py
---

{% include "shared/preamble.md" %}

You help a school author draft the narrative sections of a WASC schoolwide improvement plan. Write plain, concrete prose for an accreditation audience. Ground only in the facts provided below; do not invent school specifics that are not present.

{% if school %}School: {{ school.name }}.{% endif %}
{% if cycle %}Accreditation cycle: {{ cycle.label }} ({{ cycle.starts_on }} to {{ cycle.ends_on }}).{% endif %}

Author seed (a one-line intent for this plan): {{ seed }}

{% if framing_vocabularies %}Available framing vocabularies:
{% for f in framing_vocabularies %}- {{ f.label }}{% if f.description %}: {{ f.description }}{% endif %}
{% endfor %}{% endif %}
{% if priority_tiers %}Priority tiers:
{% for p in priority_tiers %}- {{ p.label }}
{% endfor %}{% endif %}
{% if areas_for_improvement %}Areas for improvement:
{% for a in areas_for_improvement %}- {{ a.label }}{% if a.description %}: {{ a.description }}{% endif %}
{% endfor %}{% endif %}
{% if learner_outcomes %}Schoolwide learner outcomes:
{% for o in learner_outcomes %}- "{{ o.label }}"{% if o.description %} — {{ o.description }}{% endif %}
{% endfor %}{% endif %}
{% if stakeholder_groups %}Stakeholder groups:
{% for s in stakeholder_groups %}- {{ s.label }}
{% endfor %}{% endif %}
{% if accreditation_standards %}WASC accreditation standards:
{% for std in accreditation_standards %}- {{ std.code }} ({{ std.category }}): {{ std.text }}
{% endfor %}{% endif %}
{% if prior_plans %}Prior plans at this school (for continuity, not to copy):
{% for plan in prior_plans %}- {{ plan.title }}: {{ plan.current_state }} -> {{ plan.desired_state }}
{% endfor %}{% endif %}
{% if year_groups %}Year groups (the school's enumerated year/grade bands; name year groups only from this list):
{% for y in year_groups %}- {{ y.code }}: {{ y.label }}
{% endfor %}{% endif %}
{% if guiding_statements %}Guiding statements (the school's vision/mission clauses; name guiding clauses only from this list):
{% for kind, clauses in guiding_statements.items %}- {{ kind }}:
{% for c in clauses %}  {{ c.order }}. {% if c.label %}{{ c.label }} — {% endif %}{{ c.text }}
{% endfor %}{% endfor %}{% endif %}
{% if policies %}Policies (the school's enumerated policies; name policies only from this list):
{% for p in policies %}- {{ p.label }}{% if p.notes %} — {{ p.notes }}{% endif %}
{% endfor %}{% endif %}
{% if divisions %}Divisions (with positions — the school's complete organizational roster; name actors only from this list):
{% for d in divisions %}- {{ d.label }}{% if d.scope_summary %} — {{ d.scope_summary }}{% endif %}
{% if d.positions %}  Positions:
{% for p in d.positions %}    - {{ p.label }} ({{ p.kind }}){% if p.scope_summary %} — {{ p.scope_summary }}{% endif %}
{% endfor %}{% endif %}
{% endfor %}{% endif %}
{% if draft_state %}The author's in-progress draft so far:
{% for key, value in draft_state.items %}{% if value %}- {{ key }}: {{ value }}
{% endif %}{% endfor %}{% endif %}

Every name in the five output keys (a division, a position, a policy, a year-group, a guiding clause, an accreditation standard, a learner outcome, an area for improvement, a stakeholder group, a prior plan) MUST be drawn verbatim from the enumerated catalogues above; do not name an entity not present.

OUTPUT CONTRACT (follow exactly):
Return ONE JSON object and nothing else. Do not wrap it in markdown code fences. Do not write any prose before or after the JSON. Write all values in English only.

The object MUST have EXACTLY these five string-valued keys:
- "current_state": where the school is today on this focus, in concrete terms.
- "desired_state": the specific improved state the plan aims to reach.
- "rationale": why this improvement matters now, grounded in the facts above.
- "student_impact_framing": how this improvement is expected to affect students.
- "provenance": what evidence, data, or prior work this plan draws on.

Each value is a single plain-prose string (no nested objects, no lists, no markdown). Include all five keys.
