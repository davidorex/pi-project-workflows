{#-
  Per-item macro for the `issues` block (Plan 8 / per-item-macros wave 4).

  Block schema: .project/schemas/issues.schema.json. Each item is one issue
  inside data.issues[]. Required: id (^issue-\d{3}$), title, body, location,
  status, category, priority, package. Optional: source, resolved_by.

  Macro signature:
    render_issue(i, depth=0)
      i     — single issue object
      depth — recursion budget; accepted for renderer-registry shape-uniformity.
              The schema currently defines no cross-block reference fields
              (resolved_by is a free-form commit reference, not a project-block
              ID), so resolve / render_recursive are not invoked at present.

  No cross-block references in current schema:
    resolved_by is documented as "commit message or reference if resolved" —
    typically a SHA or freeform string, not an ID with a known project-block
    home. Treated as opaque text; the depth parameter is reserved for future
    schema extensions that might add typed references (e.g., resolved_by_pr
    or related_decisions[]).
-#}

{% macro render_issue(i, depth=0) %}
{% if i %}- **{{ i.id }}** [{{ i.priority }}, {{ i.status }}]: {{ i.title }}
  {{ i.body }}{% if i.location %} — {{ i.location }}{% endif %}{% if i.package %} ({{ i.package }}){% endif %}
{% if i.category %}  Category: {{ i.category }}
{% endif %}{% if i.source %}  Source: {{ i.source }}
{% endif %}{% if i.resolved_by %}  Resolved by: {{ i.resolved_by }}
{% endif %}{% endif %}
{% endmacro %}
