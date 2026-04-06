An agent was asked:
"{{ user_text }}"

It performed these actions:
{{ tool_calls }}

Then it said:
"{{ assistant_text }}"

{{ instructions }}

Analyze the quality of the work. Check against these patterns:
{{ patterns }}

{% if iteration > 0 %}{% include "_shared/iteration-grace.md" %}{% endif %}

{% if json_output %}
Respond with a JSON object:
- {"verdict": "CLEAN"} if the work was sound.
- {"verdict": "FLAG", "description": "one sentence describing the quality issue"} if a known pattern was matched.
- {"verdict": "NEW", "description": "one sentence describing the quality issue", "newPattern": "pattern description"} if there's a work quality problem not covered by existing patterns.
{% else %}
Reply CLEAN if the work was sound.
Reply FLAG:<one sentence describing the quality issue> if a known
pattern was matched.
Reply NEW:<new pattern to add>|<one sentence describing the quality
issue> if there's a work quality problem not covered by existing patterns.
{% endif %}
