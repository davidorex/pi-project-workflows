Verify whether the following task implementation satisfies its acceptance criteria.

## Task: {{ task_id }}

## Acceptance Criteria

{% for criterion in acceptance_criteria %}
{{ loop.index }}. {{ criterion }}
{% endfor %}

## Implementation Changes

{% if changes is mapping %}
{% if changes.tasks is defined %}
### Worker Results
- Status: {{ changes.status | default("unknown") }}
{% for t in changes.tasks %}
- **{{ t.name }}**: {{ t.status }}{% if t.files_modified %} (files: {{ t.files_modified | join(", ") }}){% endif %}
{% if t.notes %} — {{ t.notes }}{% endif %}
{% endfor %}
{% else %}
```json
{{ changes | dump(2) }}
```
{% endif %}
{% else %}
{{ changes }}
{% endif %}

## Instructions

For EACH acceptance criterion above:

1. Read the relevant source files to understand the current code state
2. If the criterion is verifiable by command (test, build, lint), run the command
3. If the criterion requires code inspection, read the files and assess
4. Record your verdict: `passed`, `failed`, or `skipped`
5. Provide specific evidence (file:line references, command output, code snippets)

Then produce a JSON verification entry:

```json
{{ output_schema }}
```
