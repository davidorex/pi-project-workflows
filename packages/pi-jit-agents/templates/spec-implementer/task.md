## Plan: {{ spec.name }}

### Intent
{{ spec.intent | default(spec.description, true) }}

{% if spec.tasks %}
### Tasks
{% for task in spec.tasks %}
{{ loop.index }}. {{ task }}
{% endfor %}
{% endif %}

### Files to Change
{% for f in spec.files_to_change | default(spec.files, true) %}
- `{{ f }}`
{% endfor %}

### Acceptance Criteria
{% for criterion in spec.acceptance_criteria %}
- {{ criterion }}
{% endfor %}

{% if spec.context_needed %}
### Context to Read First
{% for ctx in spec.context_needed %}
- `{{ ctx }}`
{% endfor %}
{% endif %}

### Architecture Reference
{% for module in architecture.modules %}
- **{{ module.name }}** ({{ module.file }}): {{ module.responsibility }}
{% endfor %}

### Conventions
{% for rule in conventions.rules %}
- {{ rule.id }}: {{ rule.description }} ({{ rule.enforcement }})
{% endfor %}

## Instructions

Implement this plan. Follow these steps:

1. **Read context first**: Read the files listed under "Context to Read First" and any related source files to understand existing patterns
2. **Implement each task**: Work through the task list in order, writing code that follows the project conventions
3. **Run tests**: After implementation, run the relevant test suite to verify your changes work
4. **Validate acceptance criteria**: Confirm each acceptance criterion is met

Produce a JSON result conforming to this schema:

```json
{{ output_schema }}
```
