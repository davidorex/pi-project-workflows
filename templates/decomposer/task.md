## Decomposition Request

**Gap:** {{ gap.id }} — {{ gap.description }}

## Investigation Findings

**Complexity:** {{ investigation.complexity }}
**Summary:** {{ investigation.summary }}

### Affected Files
{% for f in investigation.affected_files %}
- `{{ f.path }}` — {{ f.role }}: {{ f.current_behavior }}
{% endfor %}

### Constraints
{% for c in investigation.constraints %}
- {{ c }}
{% endfor %}

### Risks
{% for r in investigation.risks %}
- {{ r }}
{% endfor %}

{% if research %}
## Research Findings

### Patterns
{% for p in research.patterns %}
- **{{ p.name }}**: {{ p.description }} — {{ p.applicability }}
{% endfor %}

### Recommendations
{% for r in research.recommendations %}
- {{ r }}
{% endfor %}
{% endif %}

## Instructions

Decompose this gap into implementation specs. Each spec is a unit of work for a single implementing agent with its own context window.

1. Break the work into the smallest meaningful units
2. Declare file targets for each spec
3. Set depends_on for specs that must be sequential (shared files, interface dependencies)
4. Mark parallel_safe for specs that can run concurrently
5. Write acceptance criteria that are verifiable (grep patterns, test commands, not just "it works")
6. Estimate complexity per spec

Explain your ordering rationale — why this structure, why these parallelization decisions.

## Output

Produce JSON conforming to the decomposition-specs schema.
