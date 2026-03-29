Verify whether the following audit findings have been resolved.

## Audit Findings

{% for finding in audit.findings %}
### Finding: {{ finding.id }}

**Description**: {{ finding.description }}
**Severity**: {{ finding.severity | default("unspecified") }}
**Category**: {{ finding.category | default("unspecified") }}
**Principle**: {{ finding.principle | default("unspecified") }}

**Locations**:
{% for loc in finding.locations %}
- `{{ loc.file }}` {% if loc.line %}line {{ loc.line }}{% endif %} {% if loc.description %} — {{ loc.description }}{% endif %}
{% endfor %}

{% if finding.fix %}
**Fix suggestion**: {{ finding.fix.suggestion | default("none") }}
{% endif %}

{% if finding.resolution and finding.resolution.status == 'passed' %}
*Previously marked as resolved — re-verify.*
{% endif %}
---
{% endfor %}

## Implementation Results

{% if implementation_results is iterable and implementation_results is not string %}
{% for result in implementation_results %}
- {{ result.spec_name | default(result.name | default("task")) }}: {{ result.status | default("unknown") }}
{% endfor %}
{% else %}
```json
{{ implementation_results | dump(2) }}
```
{% endif %}

{% if conformance_reference %}
## Conformance Reference

```json
{{ conformance_reference | dump(2) }}
```
{% endif %}

## Instructions

For EACH finding above:

1. Read the code at the referenced location(s)
2. Determine if the finding's described issue is addressed
3. Record your verdict: `passed`, `failed`, or `needs_inspect`
4. Provide specific evidence (code snippet, file:line reference)

Do NOT use grep exit codes as evidence. Read the code and assess whether the issue described in the finding is genuinely resolved.

Produce JSON output with a `findings` array containing one entry per finding, plus summary statistics.
