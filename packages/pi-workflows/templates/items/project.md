{#-
  Per-item macro for the `project` block (Plan 8 / per-item-macros wave 4).

  Singleton kind: the project block holds one record per repository (no
  homogeneous items[] array). The "per-item" rendering thus operates on the
  whole block payload as a single record. The whole-block delegator in
  shared/macros.md passes its data argument straight through.

  Macro signature:
    render_project_item(p, depth=0)
      p     — the project record matching project.schema.json
      depth — recursion budget; unused at present (no cross-block reference
              fields exist in the schema). Accepted for shape-uniformity with
              other per-item macros so the renderer-registry can invoke every
              kind through the same calling convention.

  Empty-array convention:
    Optional list/object fields render their label only when populated. The
    project schema makes `name`, `description`, and `core_value` required and
    the rest optional; bare-required output is the predictable shape for
    minimal records.

  No cross-block references:
    The schema has no fields that reference other blocks; resolve and
    render_recursive are not invoked. The depth parameter is reserved for
    future schema additions without breaking the registry call shape.
-#}

{% macro render_project_item(p, depth=0) %}
{% if p %}
## Project
**{{ p.name }}** — {{ p.description }}
{% if p.core_value %}Core value: {{ p.core_value }}{% endif %}
{% if p.vision %}
Vision: {{ p.vision }}{% endif %}
{% if p.status %}Status: {{ p.status }}{% endif %}
{% if p.target_users %}
Target users: {{ p.target_users | join(", ") }}{% endif %}
{% if p.constraints %}
### Constraints
{% for c in p.constraints %}- [{{ c.type }}] {{ c.description }}
{% endfor %}{% endif %}
{% if p.scope_boundaries %}
### Scope
**In:** {% for s in p.scope_boundaries.in %}{{ s }}{% if not loop.last %}, {% endif %}{% endfor %}

**Out:** {% for s in p.scope_boundaries.out %}{{ s }}{% if not loop.last %}, {% endif %}{% endfor %}
{% endif %}
{% if p.goals %}
### Goals
{% for g in p.goals %}- **{{ g.id }}**: {{ g.description }}{% if g.success_criteria %} — criteria: {{ g.success_criteria | join("; ") }}{% endif %}
{% endfor %}{% endif %}
{% if p.repository %}Repository: {{ p.repository }}
{% endif %}{% if p.stack %}Stack: {{ p.stack | join(", ") }}
{% endif %}
{% endif %}
{% endmacro %}
