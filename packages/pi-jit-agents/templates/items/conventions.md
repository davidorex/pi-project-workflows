{#-
  Per-item macro for the `conventions` block (Plan 8 / per-item-macros wave 4).

  Block schema: .project/schemas/conventions.schema.json. Each item is one
  rule object inside data.rules[] (id, description, enforcement, severity).

  No cross-block references — conventions are leaf rules. Depth parameter
  accepted for shape-uniformity; reserved for future schema additions.

  Companion whole-block macro:
    render_conventions(data) in shared/macros.md emits the test_conventions
    and lint_command/lint_scope header fields once, then iterates rules
    through this macro.
-#}

{% macro render_convention(rule, depth=0) %}
{% if rule %}- **{{ rule.id }}** [{{ rule.severity }}, {{ rule.enforcement }}]: {{ enforceBudget(rule.description, "conventions", "rules.items.description") }}
{% endif %}
{% endmacro %}
