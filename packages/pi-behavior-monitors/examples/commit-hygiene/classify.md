An agent made file changes (write/edit tool calls detected). Review the tool call history below.

{{ tool_calls }}

{% if user_text %}
The user said:
"{{ user_text }}"

IMPORTANT: Consider the user's intent. If the user explicitly said not to
commit yet, or if the work is exploratory (check, verify, audit, review,
analyze, investigate), the agent may legitimately defer committing. Do not
flag deferred commits when the user's request implies more work is coming.
{% endif %}

Known commit anti-patterns:
{{ patterns }}

{{ instructions }}

Determine:
1. Did the agent run a git commit? Look for [call bash] with git commit in the arguments.
2. If committed, was the commit message detailed and specific? Generic messages like 'update files', 'fix bug', 'changes' are violations.
3. If committed, does the message avoid prohibited language (see patterns)?

{% if iteration > 0 %}{% include "_shared/iteration-grace.md" %}{% endif %}

Respond with a JSON object:
- {"verdict": "CLEAN"} if changes were committed with a proper message.
- {"verdict": "FLAG", "description": "what was wrong"} if a known pattern was matched (no commit, generic message, prohibited language).
- {"verdict": "NEW", "description": "what was wrong", "newPattern": "pattern description"} if an issue not covered by patterns was detected.
