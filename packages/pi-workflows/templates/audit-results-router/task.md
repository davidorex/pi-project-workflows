Review the audit fix results and produce a routing manifest.

## Implementation Results

{% if implementation_results is iterable and implementation_results is not string %}
{% for result in implementation_results %}
### Task: {{ result.spec_name | default(result.name | default("unnamed")) }}

- Status: {{ result.status | default("unknown") }}
{% if result.decisions %}
- Decisions: {{ result.decisions | length }}
{% endif %}
{% if result.issues %}
- Issues flagged: {{ result.issues | length }}
{% endif %}
{% endfor %}
{% else %}
```json
{{ implementation_results | dump(2) }}
```
{% endif %}

## Verification Results

```json
{{ verification | dump(2) }}
```

## Instructions

Produce a routing manifest with:

1. **decisions** — validated decisions from implementation results (with complete id, description, rationale fields)
2. **new_gaps** — genuine issues that should be tracked (with stable id, description, status: "open", category, priority)
3. **summary** — accurate summary of what was completed, what failed, what needs inspection

Only include items that are well-formed and represent genuine project artifacts. Do not route items that are missing required fields or describe hypothetical concerns.
