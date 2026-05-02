{#-
  Per-item macro for the `project` block (Plan 8 / per-item-macros wave 4).

  Singleton kind: the project block holds one record per repository (no
  homogeneous items[] array). The "per-item" rendering thus operates on the
  whole block payload as a single record. The whole-block delegator in
  shared/macros.md passes its data argument straight through.

  No cross-block references — depth parameter accepted for shape-uniformity
  with other per-item macros; no helpers from shared/render-helpers.md are
  needed at present.

  Empty-array convention:
    Optional list/object fields render their label only when populated. The
    project schema makes `name`, `description`, and `core_value` required and
    the rest optional; bare-required output is the predictable shape for
    minimal records.
-#}

{% macro render_project_item(p, depth=0) %}
{% if p %}
## Project
**{{ p.name }}** — {{ enforceBudget(p.description, "project", "description") }}
{% if p.core_value %}Core value: {{ enforceBudget(p.core_value, "project", "core_value") }}{% endif %}
{% if p.vision %}
Vision: {{ enforceBudget(p.vision, "project", "vision") }}{% endif %}
{% if p.status %}Status: {{ p.status }}{% endif %}
{% if p.target_users %}
Target users: {{ p.target_users | join(", ") }}{% endif %}
{% if p.constraints %}
### Constraints
{% for c in p.constraints %}- [{{ c.type }}] {{ enforceBudget(c.description, "project", "constraints.items.description") }}
{% endfor %}{% endif %}
{% if p.scope_boundaries %}
### Scope
**In:** {% for s in p.scope_boundaries.in %}{{ s }}{% if not loop.last %}, {% endif %}{% endfor %}

**Out:** {% for s in p.scope_boundaries.out %}{{ s }}{% if not loop.last %}, {% endif %}{% endfor %}
{% endif %}
{% if p.goals %}
### Goals
{% for g in p.goals %}- **{{ g.id }}**: {{ enforceBudget(g.description, "project", "goals.items.description") }}{% if g.success_criteria %} — criteria: {% for sc in g.success_criteria %}{{ enforceBudget(sc, "project", "goals.items.success_criteria.items") }}{% if not loop.last %}; {% endif %}{% endfor %}{% endif %}
{% endfor %}{% endif %}
{% if p.repository %}Repository: {{ p.repository }}
{% endif %}{% if p.stack %}Stack: {{ p.stack | join(", ") }}
{% endif %}
{% endif %}
{% endmacro %}
