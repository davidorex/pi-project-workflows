## Task: {{ task.id }}

### Description
{{ task.description }}

{% if task.phase %}
### Phase
{{ task.phase }}
{% endif %}

### Files
{% for f in task.files %}
- `{{ f }}`
{% endfor %}

### Acceptance Criteria
{% for criterion in task.acceptance_criteria %}
- [ ] {{ criterion }}
{% endfor %}

{% if task.depends_on %}
### Dependencies (completed)
{% for dep in task.depends_on %}
- {{ dep }}
{% endfor %}
{% endif %}

{% if task.notes %}
### Notes
{{ task.notes }}
{% endif %}

{% if context %}
### Context
{{ context }}
{% endif %}

## Instructions

Implement this task. Follow these steps:

1. **Read the target files** listed above to understand the current state
2. **Implement changes** that satisfy each acceptance criterion
3. **Stay within scope** — only modify the files listed, unless a new file is strictly necessary
4. **Run tests** after implementation to verify nothing is broken
5. **Validate each criterion** — confirm every acceptance criterion is addressed

Produce a JSON result conforming to this schema:

```json
{{ output_schema }}
```
