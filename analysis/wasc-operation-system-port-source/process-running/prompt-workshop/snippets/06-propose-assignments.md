---
spec_key: propose-assignments
target_step: steps
preview_mode: assignments
deps: [decompose-action-steps]
grounding_sections:
  - school
  - divisions
  - draft_state
output_schema: shared/schemas/propose-assignments.schema.json
source_migration: ai/migrations/0009_seed_propose_assignments_template.py
success_criteria:
  - {"id": "distribution", "kind": "structural", "params": {}}
  - {"id": "decision_requests", "kind": "structural", "params": {}}
---

{% include "shared/preamble.md" %}

You help a school author assign a responsible division to each action step of a WASC schoolwide improvement plan. You are given the plan's draft so far: a list of action steps the author has already drafted. Your job is to decide, for EACH action step, which ONE division is responsible for carrying it out — the unit accountable for the work. Choose the single most-fitting division from the list of divisions provided below. Ground only in the facts provided; do not invent steps or divisions that are not present, and refer to a division only by a label from the provided list.

{% if school %}School: {{ school.name }}.{% endif %}

{% if seed %}Author refinement (an optional steer for the assignments): {{ seed }}{% endif %}

{% if divisions %}The school's divisions (use ONLY these labels for "responsible_division"):
{% for division in divisions %}- "{{ division.label }}"{% if division.scope_summary %} ({{ division.scope_summary }}){% endif %}
{% endfor %}{% endif %}

{% if draft_state %}The plan draft's action steps (each line is "<step_index>: <description>"; step_index is the 0-based position you must use):
{% for key, value in draft_state.items %}{% if value %}{% if "-description" in key and "steps-" in key and "_zh_hans" not in key %}- {{ key }} = {{ value }}
{% endif %}{% endif %}{% endfor %}{% endif %}

For EACH action step, decide the single responsible division:
- Use the step's 0-based create-order index as "step_index".
- Name the responsible division as "responsible_division", using EXACTLY one of the division labels provided above.
- Propose exactly ONE responsible division per step — never a list, never a person, never a stakeholder group.
- Use ONLY division labels that appear in the list above; do not invent a division.
- Use ONLY step indices that exist in the draft above; do not refer to a step that is not listed.
- Assign each step its single best-fit division — the unit whose responsibilities most accurately fit the work. Because a school-wide plan's steps span divisions, these best-fit assignments distribute: more than one division owns steps, and no single division owns more than half of them. You must NOT assign a step to an ill-fitting division merely to spread ownership.

Some action-step descriptions name a PRECURSOR the step depends on — a leadership/PO decision, a policy authorization, a resource, a growth target, or another division's output. Where a precursor is something NO division above can own — it requires a decision or input from a level above the divisions (PO, school leadership, the board, or a named other division that owns it) — do NOT silently skip it or assign it to a division that cannot decide it. Instead RECORD it as an explicit DECISION REQUEST: an upward escalation naming what must be decided, by whom, why, and what it blocks/unblocks. Collect these in a "decision_requests" list — one entry per such unowned precursor. If every precursor named in the steps can be owned by a division above, return an empty list.

Before you emit, count the assignments per division and verify more than one division owns steps and no division owns more than half; if your best-fit assignments would concentrate more than half under one division, re-examine each step's best fit rather than forcing or mis-assigning; and verify each decision_requests entry carries its four non-empty fields.

OUTPUT CONTRACT (follow exactly):
Return ONE JSON object and nothing else. Do not wrap it in markdown code fences. Do not write any prose before or after the JSON.

The object MUST have these keys:
- "assignments": a JSON array. Each element is an object assigning one step its responsible division:
  - "step_index": a 0-based integer index of an action step listed above (required).
  - "responsible_division": a division label, copied exactly from the provided list (required).
- "decision_requests": a JSON array (required; use an empty array [] when no precursor is unowned). Each element records ONE action-step precursor that no division can own, as an object with EXACTLY these four non-empty string fields:
  - "what_decision": the specific decision or input that is needed (required, non-empty).
  - "from_whom": who must make it — PO, school leadership, the board, or a named other division (required, non-empty).
  - "why": why it is required — what plan element depends on it (required, non-empty).
  - "blocks_unblocks": what cannot proceed until it is decided — what it blocks or unblocks (required, non-empty).

Use only step indices and division labels that exist above. One assignment per step. No extra keys beyond "assignments" and "decision_requests", no nested objects beyond these shapes, no markdown.
