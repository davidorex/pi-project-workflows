{#-
  Per-item macro for the `issues` block (Plan 8 / per-item-macros wave 4).

  Block schema: .project/schemas/issues.schema.json. Each item is one issue
  inside data.issues[]. Required: id (^issue-\d{3}$), title, body, location,
  status, category, priority, package. Optional: source, resolved_by.

  No cross-block references in current schema — resolved_by is a free-form
  commit reference, not a project-block ID. Depth parameter accepted for
  renderer-registry shape-uniformity; reserved for future schema additions
  (e.g., resolved_by_pr or related_decisions[]).
-#}

{% macro render_issue(i, depth=0) %}
{% if i %}- **{{ i.id }}** [{{ i.priority }}, {{ i.status }}]: {{ i.title }}
  {{ enforceBudget(i.body, "issues", "issues.items.body") }}{% if i.location %} — {{ i.location }}{% endif %}{% if i.package %} ({{ i.package }}){% endif %}
{% if i.category %}  Category: {{ i.category }}
{% endif %}{% if i.source %}  Source: {{ i.source }}
{% endif %}{% if i.resolved_by %}  Resolved by: {{ i.resolved_by }}
{% endif %}{% endif %}
{% endmacro %}
