{#-
  Per-item macro for the `conventions` block (Plan 8 / per-item-macros wave 4).

  Block schema: .project/schemas/conventions.schema.json. Each item is one
  rule object inside data.rules[] (id, description, enforcement, severity).

  Macro signature:
    render_convention(rule, depth=0)
      rule  — single rule object; required: id, description, enforcement, severity
      depth — recursion budget; unused (no cross-block reference fields).
              Accepted for shape-uniformity with the renderer-registry call
              convention.

  No cross-block references:
    Conventions are leaf rules — they do not reference items in other blocks.
    The depth parameter is reserved for future schema additions.

  Companion whole-block macro:
    render_conventions(data) in shared/macros.md emits the test_conventions
    and lint_command/lint_scope header fields once, then iterates rules
    through this macro. Authored fresh in Plan 8 (no prior render_conventions
    existed despite README references implying otherwise).
-#}

{% macro render_convention(rule, depth=0) %}
{% if rule %}- **{{ rule.id }}** [{{ rule.severity }}, {{ rule.enforcement }}]: {{ enforceBudget(rule.description, "conventions", "rules.items.description") }}
{% endif %}
{% endmacro %}

{#- Registry alias: derives `render_conventions` from the `conventions` kind,
    bridges to canonical singular `render_convention`. -#}
{% macro render_conventions(rule, depth=0) %}{{ render_convention(rule, depth) }}{% endmacro %}
