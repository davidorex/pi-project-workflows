---
spec_key: propose-review-loop
target_step: review
preview_mode: review-loop
deps: [propose-milestones, suggest-feedback-channels]
grounding_sections:
  - school
  - cycle
  - divisions
  - stakeholder_groups
  - frequencies
  - accreditation_standards
  - draft_state
output_schema: shared/schemas/propose-review-loop.schema.json
source_migration: ai/migrations/0015_seed_propose_review_loop_template.py
success_criteria:
  - {"id": "review_cadence", "kind": "structural", "params": {}}
---

{% include "shared/preamble.md" %}

You help a school draft the WHOLE review loop of a schoolwide improvement plan, coherently and all at once, so the pieces refer to each other correctly. The review loop has three parts: stakeholder communications, review events, and revision rules. You are given the plan draft so far, the school's divisions, stakeholder groups, and communication frequencies, and (from the draft state) the milestones and feedback channels the plan has already drafted. Ground only in the facts provided; do not invent labels.

{% if school %}School: {{ school.name }}.{% endif %}

{% if seed %}Author refinement (an optional steer for the review loop): {{ seed }}{% endif %}

{% if stakeholder_groups %}Stakeholder groups (choose a communication's audience by EXACT label):
{% for s in stakeholder_groups %}- {{ s.label }}
{% endfor %}{% endif %}

{% if divisions %}Divisions (choose an owner / responsible unit by EXACT label):
{% for d in divisions %}- "{{ d.label }}"{% if d.scope_summary %} ({{ d.scope_summary }}){% endif %}
{% endfor %}{% endif %}

{% if frequencies %}Frequencies (choose a periodic cadence by EXACT code):
{% for f in frequencies %}- "{{ f.code }}" ({{ f.label }})
{% endfor %}{% endif %}

{% if cycle %}Accreditation cycle: {{ cycle.label }} ({{ cycle.starts_on }} to {{ cycle.ends_on }}).{% endif %}

{% if accreditation_standards %}WASC accreditation standards (the global standards catalogue; cite standards only by code from this list):
{% for s in accreditation_standards %}- {{ s.code }} ({{ s.category }}): {{ s.text }}
{% endfor %}{% endif %}

{% if draft_state %}The plan draft so far (the milestones and feedback channels you may reference BY INDEX, plus context prose):
{% for key, value in draft_state.items %}{% if value %}- {{ key }} = {{ value }}
{% endif %}{% endfor %}{% endif %}

Draft the whole review loop. The milestones and feedback channels are listed in the draft above in their create order, 0-based: refer to a milestone by its 0-based "milestone_index" and to a feedback channel by its 0-based "channel_index". Refer to one of YOUR OWN review events by its 0-based "trigger_index" (its position in the review_events array you return).

Per-kind timing:
- A communication is "periodic" (carries a "frequency" code, no milestone), "one-off" (carries neither), or "milestone" (carries a "milestone_index", no frequency).
- A review event is "scheduled" (carries a "scheduled_date" in YYYY-MM-DD, no milestone) or "milestone" (carries a "milestone_index", no scheduled_date).

The review events are the plan's evaluate-and-adjust checkpoints; produce AT LEAST FOUR of them, spaced roughly one per quarter across the accreditation cycle, with the EARLIEST scheduled BEFORE 1 December of the cycle's first year — do not back-load the first checkpoint toward the year's end. Each checkpoint runs a measure-then-diagnose-then-adjust pass: it draws on the feedback channels' evidence (its `inputs`), its `scheduled_note` names what that evidence shows, and its paired revision rule's `action` decides the adjustment. Each later checkpoint re-examines the focuses raised at the earlier checkpoints — carrying them forward under continued review rather than dropping them for entirely new topics. Frame every adjustment as evidence-driven course-correction, the review system working as intended, never as failure.

If `condition` references a WASC standard threshold, cite the standard by code from the accreditation_standards catalogue; if `action` invokes a division, use the verbatim label from the divisions catalogue.

Before you emit, confirm review_events contains at least four checkpoints and the earliest scheduled_date falls before 1 December of the cycle's first year; if not, add or rebalance checkpoints so it does.

OUTPUT CONTRACT (follow exactly):
Return ONE JSON object and nothing else. Do not wrap it in markdown code fences. Do not write any prose before or after the JSON.

The object MUST have exactly these three keys, each a NON-EMPTY JSON array:

"communications": a non-empty array of objects, each with:
  - "audience": a stakeholder-group label from the list above.
  - "channel": a short free-text channel name (e.g. "Newsletter", "Town hall meeting").
  - "timing_kind": one of "periodic", "one-off", "milestone".
  - "frequency": a frequency CODE from the list above — ONLY when timing_kind is "periodic".
  - "milestone_index": a 0-based integer index into the drafted milestones — ONLY when timing_kind is "milestone".
  - "owner_division": a division label from the list above.

"review_events": a non-empty array of objects, each with:
  - "label": a short free-text label for the review event.
  - "timing_kind": one of "scheduled", "milestone".
  - "scheduled_date": a YYYY-MM-DD date — ONLY when timing_kind is "scheduled".
  - "milestone_index": a 0-based integer index into the drafted milestones — ONLY when timing_kind is "milestone".
  - "scheduled_note": an OPTIONAL short free-text note (may be omitted or "").
  - "responsible_division": a division label from the list above.
  - "inputs": a NON-EMPTY array of objects, each {"channel_index": <0-based integer index into the drafted feedback channels>}. Every review event MUST draw on at least one drafted feedback channel.

"revision_rules": a non-empty array of objects, each with:
  - "trigger_index": a 0-based integer index into the review_events array you return above.
  - "condition": free text naming the threshold or finding that triggers a revision.
  - "action": free text naming what reviewers should do when the condition is met.

Use ONLY the division / stakeholder / frequency labels and codes listed above. channel_index and milestone_index index the drafted rows listed in the draft state; trigger_index indexes your own review_events array. Do not name an owner or responsible person. No extra keys, no markdown, no prose outside the JSON.
