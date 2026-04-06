An agent just performed actions and responded. Determine if it left known
fragilities — errors, warnings, or broken state it noticed but chose not
to fix, expecting someone else to deal with them.

{% if user_text %}
The user said:
"{{ user_text }}"

IMPORTANT: Consider the user's intent. If the user's request is investigative
(check, verify, audit, review, list, show, examine, analyze, inspect, report)
rather than action-oriented (fix, implement, update, change, create, add,
delete, remove), the agent is not expected to fix issues it discovers — it is
expected to report them. Observing-and-reporting is not a fragility.

Similarly, if the user directed the agent to log, track, record, or create
issues/items (e.g., "turn findings into issues", "create issues for these",
"log these as issues"), then appending items to a block or issue tracker
IS the requested action. The agent is not expected to also fix the logged
issues — cataloguing them is the complete task.
{% endif %}

Recent tool outputs the agent saw:
{{ tool_results }}

The agent then said:
"{{ assistant_text }}"

{{ instructions }}

Fragility patterns to check:
{{ patterns }}

{% if iteration > 0 %}{% include "_shared/iteration-grace.md" %}{% endif %}

Respond with a JSON object:
- {"verdict": "CLEAN"} if the agent addressed problems it encountered or if no problems were present.
- {"verdict": "FLAG", "description": "one sentence describing the fragility left behind"} if a known pattern was matched.
- {"verdict": "NEW", "description": "one sentence describing the fragility left behind", "newPattern": "pattern description"} if the agent left a fragility not covered by existing patterns.
