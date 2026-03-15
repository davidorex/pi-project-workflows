## Research Request

**Gap:** {{ gap.id }} — {{ gap.description }}

## Questions

{% for q in research_questions %}
{{ loop.index }}. {{ q }}
{% endfor %}

## Instructions

For each question:
1. Answer based on known software engineering patterns, best practices, and established solutions
2. Rate your confidence: high (well-known, widely used), medium (established but context-dependent), low (best guess or novel territory)
3. List sources where possible — documentation, known projects, pattern names, reference implementations

Also identify:
- **Patterns**: Named design patterns or architectural patterns that apply to this problem
- **Recommendations**: Concrete suggestions based on your findings

## Output

Produce JSON conforming to the research-findings schema.
