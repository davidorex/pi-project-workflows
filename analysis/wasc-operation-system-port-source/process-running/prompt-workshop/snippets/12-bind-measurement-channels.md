---
spec_key: bind-measurement-channels
target_step: criteria
preview_mode: bindings
deps: [draft-success-criteria, suggest-feedback-channels]
grounding_sections:
  - school
  - draft_state
output_schema: shared/schemas/bind-measurement-channels.schema.json
source_migration: ai/migrations/0008_seed_bind_measurement_channels_template.py
---

{% include "shared/preamble.md" %}

You help a school author bind the success criteria of a WASC schoolwide improvement plan to the feedback channels that measure them. You are given the plan's draft so far: a list of success criteria and a list of feedback channels, each already drafted by the author. Your job is to decide, for EACH success criterion, which feedback channel(s) provide the evidence that measures it. A criterion may be measured by one channel, by several channels, or — if no drafted channel fits — by none. Ground only in the facts provided below; do not invent criteria or channels that are not present, and refer to a channel only by its index in the list provided.

{% if school %}School: {{ school.name }}.{% endif %}

{% if seed %}Author refinement (an optional steer for the bindings): {{ seed }}{% endif %}

{% if draft_state %}The plan draft so far:

Success criteria (each line is "<criterion_index>: <text>"; criterion_index is the 0-based position you must use):
{% for key, value in draft_state.items %}{% if value %}{% if "-text" in key and "criteria-" in key and "_zh_hans" not in key %}- {{ key }} = {{ value }}
{% endif %}{% endif %}{% endfor %}

Feedback channels (each line is "<channel_index>: <label>"; channel_index is the 0-based position you must use in channel_indices):
{% for key, value in draft_state.items %}{% if value %}{% if "-label" in key and "feedback-" in key and "_zh_hans" not in key %}- {{ key }} = {{ value }}
{% endif %}{% endif %}{% endfor %}{% endif %}

For EACH success criterion, decide which feedback channel(s) measure it:
- Use the criterion's 0-based create-order index as "criterion_index".
- List the 0-based create-order index/es of the measuring channel(s) as "channel_indices".
- Bind a criterion to MORE THAN ONE channel when several channels together provide its evidence.
- OMIT a criterion entirely (do not emit a binding for it) when no drafted channel fits — never invent a channel.
- Use ONLY indices that exist in the draft above. Do not refer to a criterion or channel index that is not listed.

OUTPUT CONTRACT (follow exactly):
Return ONE JSON object and nothing else. Do not wrap it in markdown code fences. Do not write any prose before or after the JSON.

The object MUST have EXACTLY one key:
- "bindings": a JSON array. Each element is an object binding one criterion to its measuring channel(s):
  - "criterion_index": a 0-based integer index of a success criterion listed above (required).
  - "channel_indices": a non-empty JSON array of 0-based integer indices of the feedback channels that measure that criterion (required; at least one).

Use only indices that exist in the draft. No extra keys, no nested objects beyond this shape, no markdown.
