{#-
  Per-item macro for the `requirements` block (Plan 8 / per-item-macros wave 4).

  Block schema: .project/schemas/requirements.schema.json. Each item is one
  requirement inside data.requirements[]. Required: id (^REQ-\d{3,}$),
  description, type, status, priority. Optional: acceptance_criteria,
  source, traces_to (phase/task IDs), depends_on (other requirement IDs).

  Macro signature:
    render_requirement(req, depth=0)
      req   — single requirement object
      depth — recursion budget for cross-block reference inlining.
              depth <= 0 — emit bare ID strings for traces_to and depends_on.
              depth >  0 — call resolve(id) on each ID; render_recursive(loc,
                           depth - 1) inlines the resolved item via the
                           registered per-item macro for that kind.

  Depth contract (mirrors render_decision pattern from Plan 6):
    On miss (resolve returns null), fall back to bare ID text. resolve and
    render_recursive are ambient Nunjucks globals registered by compileAgent
    in @davidorex/pi-jit-agents (compile.ts).

  Empty-array convention:
    Optional reference arrays present-but-empty render the field label with
    `(none)`. Absent (undefined) fields render nothing.
-#}

{% macro render_requirement(req, depth=0) %}
{% if req %}- **{{ req.id }}** [{{ req.priority }}] ({{ req.type }}, {{ req.status }}): {{ req.description }}{% if req.acceptance_criteria %}
  Criteria: {{ req.acceptance_criteria | join("; ") }}{% endif %}
{% if req.source %}  Source: {{ req.source }}
{% endif %}{% if req.traces_to is defined %}  Traces to: {% if req.traces_to | length > 0 %}{% for tid in req.traces_to %}{% if depth > 0 %}{% set loc = resolve(tid) %}{% if loc %}{{ render_recursive(loc, depth - 1) }}{% else %}{{ tid }}{% endif %}{% else %}{{ tid }}{% endif %}{% if not loop.last %}, {% endif %}{% endfor %}{% else %}(none){% endif %}
{% endif %}{% if req.depends_on is defined %}  Depends on: {% if req.depends_on | length > 0 %}{% for did in req.depends_on %}{% if depth > 0 %}{% set loc = resolve(did) %}{% if loc %}{{ render_recursive(loc, depth - 1) }}{% else %}{{ did }}{% endif %}{% else %}{{ did }}{% endif %}{% if not loop.last %}, {% endif %}{% endfor %}{% else %}(none){% endif %}
{% endif %}{% endif %}
{% endmacro %}
