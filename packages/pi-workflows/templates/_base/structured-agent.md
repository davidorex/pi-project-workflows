<objective>
{% block objective %}{% endblock %}
</objective>

<workflow>
{% block workflow %}{% endblock %}
</workflow>

<constraints>
{% block base_constraints %}
- Output MUST be valid JSON conforming exactly to the output schema
- Every field marked required in the schema MUST be present
{% endblock %}
{% block constraints %}{% endblock %}
</constraints>

<anti_patterns>
{% block anti_patterns %}{% endblock %}
</anti_patterns>

<success_criteria>
{% block success_criteria %}{% endblock %}
</success_criteria>
