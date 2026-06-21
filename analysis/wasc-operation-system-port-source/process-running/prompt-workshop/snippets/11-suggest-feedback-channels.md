---
spec_key: suggest-feedback-channels
target_step: feedback
preview_mode: fields
deps: [narrative-draft, propose-milestones]
grounding_sections:
  - school
  - cycle
  - stakeholder_groups
  - divisions
  - frequencies
  - draft_state
output_schema: shared/schemas/suggest-feedback-channels.schema.json
source_migration: ai/migrations/0007_seed_suggest_feedback_channels_template.py
success_criteria:
  - {"id": "three_view", "kind": "structural", "params": {}}
  - {"id": "bilingual_views", "kind": "structural", "params": {}}
---

{% include "shared/preamble.md" %}

You help a school author suggest the feedback channels for a WASC schoolwide improvement plan. You are given the plan's draft so far and the school's own stakeholder groups, divisions, and frequencies. Your job is to SUGGEST one feedback channel per engaged stakeholder — a stream of feedback the plan intends to consult (a survey, interview, dashboard, log, …), sourced from a stakeholder group, owned by a division, and anchored in time. Ground only in the facts provided below; do not invent school specifics that are not present, and choose only from the provided labels and codes.

{% if school %}School: {{ school.name }}.{% endif %}
{% if cycle %}Accreditation cycle: {{ cycle.label }} ({{ cycle.starts_on }} to {{ cycle.ends_on }}).{% endif %}

{% if seed %}Author refinement (an optional steer for the channels): {{ seed }}{% endif %}

{% if draft_state %}The plan draft so far (the engaged stakeholders to source feedback from, and the milestones a milestone-anchored channel may reference):
{% for key, value in draft_state.items %}{% if value %}- {{ key }}: {{ value }}
{% endif %}{% endfor %}{% endif %}

{% if stakeholder_groups %}Stakeholder groups at this school (CHOOSE each channel's stakeholder by its LABEL from this list):
{% for s in stakeholder_groups %}- "{{ s.label }}"
{% endfor %}{% endif %}
{% if divisions %}Divisions at this school (CHOOSE each channel's owner_division by its LABEL from this list):
{% for d in divisions %}- "{{ d.label }}"{% if d.scope_summary %} ({{ d.scope_summary }}){% endif %}
{% endfor %}{% endif %}
{% if frequencies %}Frequencies at this school (CHOOSE a periodic channel's frequency by its CODE from this list):
{% for f in frequencies %}- "{{ f.code }}" ({{ f.label }})
{% endfor %}{% endif %}

Suggest feedback channels that together let the plan measure progress from THREE points of view: (1) student outcomes — what students achieve or experience; (2) staff / adult practice — how teachers and adults change what they do; and (3) parent / stakeholder awareness — how parents and the wider community see and respond to the work. Produce at least one channel for EACH of the three views. Produce a parent / stakeholder channel even when parents were not "engaged" upstream in the draft — parent / stakeholder awareness is itself a measured outcome, not merely an audience to inform. For EACH channel:
- Write a concise "label" describing the channel (English only).
- Choose a "stakeholder" — exactly one of the LABELS listed above (the group the feedback comes from).
- ALWAYS choose an "owner_division" — exactly one of the division LABELS listed above (the accountable unit). This is REQUIRED on every channel.
- Choose a "timing_kind" — one of "periodic", "one-off", or "milestone":
  - "periodic": set "frequency" to one of the frequency CODES above; do NOT set "milestone_index".
  - "one-off": set NEITHER "frequency" NOR "milestone_index".
  - "milestone": set "milestone_index" to a 0-based integer index into the milestones listed in the draft above (0 is the first milestone); do NOT set "frequency".
- Write a concise "instrument" naming how the feedback is collected, e.g. a survey, interview, dashboard, or log (English only).

Then declare, in a "measurement_views" object, how each of the three views is covered. The three keys are FIXED: "student_outcomes", "staff_practice", "parent_stakeholder". For each key set EITHER the 0-based index of the channel that covers that view (an integer into the "channels" array above) OR, only when a view is genuinely deferred this cycle, an object {"gap": "<short reason>"}. Every one of the three keys MUST be present.

This is an always-bilingual school, so the plan MUST measure bilingual language improvement as its own strand — separate from, and in addition to, any "Bilingual Communicators" learner-outcome the plan targets. That strand has TWO sides: (1) a STAFF English-usage measure — how much English the adults actually use and nudge outside lessons (e.g. a staff English-usage survey channel); and (2) a STUDENT bilingual-progress measure — students' progress against the English-department vocabulary/skeletons (e.g. a student bilingual-progress instrument channel). Produce a channel covering EACH side. Then declare, in a "bilingual_views" object, how each side is covered. The two keys are FIXED: "staff_english_usage", "student_bilingual_progress". For each key set EITHER the 0-based index of the channel that covers that side (an integer into the "channels" array above) OR, only when a side is genuinely deferred this cycle, an object {"gap": "<short reason>"}. Both keys MUST be present. The "bilingual_views" map is DISTINCT from the "measurement_views" three-view map and from any Bilingual-Communicators learner-outcome coverage.

Before you emit, confirm measurement_views has exactly its three keys (student_outcomes, staff_practice, parent_stakeholder) and bilingual_views exactly its two (staff_english_usage, student_bilingual_progress), each set to a channel index or a {gap}, and that a channel exists for every view and bilingual side you did not explicitly defer.

OUTPUT CONTRACT (follow exactly):
Return ONE JSON object and nothing else. Do not wrap it in markdown code fences. Do not write any prose before or after the JSON. Write all values in English only.

The object MUST have these keys:
- "channels": a JSON array. Each element is an object describing one feedback channel:
  - "label": the channel as a concise statement (required, non-empty).
  - "stakeholder": exactly one of the stakeholder-group LABELS provided above (required).
  - "owner_division": exactly one of the division LABELS provided above (required on every channel).
  - "timing_kind": one of "periodic", "one-off", "milestone" (required).
  - "frequency": one of the frequency CODES provided above — present ONLY for a "periodic" channel; otherwise omit it.
  - "milestone_index": a 0-based integer index into the listed milestones — present ONLY for a "milestone" channel; otherwise omit it.
  - "instrument": how the feedback is collected (required, non-empty).
- "measurement_views": a JSON object with EXACTLY the three keys "student_outcomes", "staff_practice", "parent_stakeholder" (required). Each value is EITHER a 0-based integer index into the "channels" array (the channel that covers that view) OR an object {"gap": "<short reason>"} when that view is genuinely deferred this cycle.
- "bilingual_views": a JSON object with EXACTLY the two keys "staff_english_usage", "student_bilingual_progress" (required). Each value is EITHER a 0-based integer index into the "channels" array (the channel that covers that side of the bilingual strand) OR an object {"gap": "<short reason>"} when that side is genuinely deferred this cycle.

Choose only from the provided labels and codes. No extra keys beyond "channels", "measurement_views", and "bilingual_views", no nested objects beyond the shapes above, no markdown.
