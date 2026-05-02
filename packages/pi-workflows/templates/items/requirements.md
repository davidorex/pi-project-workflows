{#-
  Per-item macro for the `requirements` block (Plan 8 / per-item-macros wave 4).

  Block schema: .project/schemas/requirements.schema.json. Each item is one
  requirement inside data.requirements[]. Required: id (^REQ-\d{3,}$),
  description, type, status, priority. Optional: acceptance_criteria,
  source, traces_to (phase/task IDs), depends_on (other requirement IDs).

  Cross-block reference recursion (traces_to, depends_on) is delegated to
  shared/render-helpers.md — see that file for the depth contract, ambient
  globals, and empty-array convention shared across all per-item macros.
-#}
{% from "shared/render-helpers.md" import render_id_list_inline %}

{% macro render_requirement(req, depth=0) %}
{% if req %}- **{{ req.id }}** [{{ req.priority }}] ({{ req.type }}, {{ req.status }}): {{ enforceBudget(req.description, "requirements", "requirements.items.description") }}{% if req.acceptance_criteria %}
  Criteria: {% for ac in req.acceptance_criteria %}{{ enforceBudget(ac, "requirements", "requirements.items.acceptance_criteria.items") }}{% if not loop.last %}; {% endif %}{% endfor %}{% endif %}
{% if req.source %}  Source: {{ req.source }}
{% endif %}{{ render_id_list_inline("Traces to", req.traces_to, depth) }}{{ render_id_list_inline("Depends on", req.depends_on, depth) }}{% endif %}
{% endmacro %}
