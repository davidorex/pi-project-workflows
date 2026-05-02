{#-
  Per-item macro for the `tasks` block (Plan 8 / per-item-macros wave 4).

  Block schema: .project/schemas/tasks.schema.json. Each item is one task
  inside data.tasks[]. Required: id (^TASK-\d{3,}$), description, status.
  Optional: phase (string|integer), files, acceptance_criteria, depends_on
  (other task IDs), assigned_agent, verification (verification ID), notes.

  When status === "completed", schema additionally requires verification
  (the if/then conditional in the schema).

  Macro signature:
    render_task(t, depth=0)
      t     — single task object
      depth — recursion budget for cross-block reference inlining.
              depth <= 0 — emit bare ID strings for depends_on and verification.
              depth >  0 — call resolve(id); on hit, render_recursive(loc,
                           depth - 1) inlines via registered per-item macro.

  Depth contract: mirrors render_decision (Plan 6). resolve and
  render_recursive are ambient Nunjucks globals registered by compileAgent.

  Empty-array convention:
    depends_on present-but-empty renders `(none)`. Absent renders nothing.
    verification is a single string (not an array); when present, it is
    treated as one ID for resolve/inline at depth > 0, bare otherwise.

  Files field:
    files[] is a list of code paths, not project-block IDs. Rendered inline
    as a comma-separated list; never recursed.
-#}

{% macro render_task(t, depth=0) %}
{% if t %}- **{{ t.id }}** [{{ t.status }}]: {{ t.description }}{% if t.phase %} (phase {{ t.phase }}){% endif %}{% if t.files %} — files: {{ t.files | join(", ") }}{% endif %}
{% if t.acceptance_criteria %}  Criteria: {{ t.acceptance_criteria | join("; ") }}
{% endif %}{% if t.assigned_agent %}  Assigned agent: {{ t.assigned_agent }}
{% endif %}{% if t.notes %}  Notes: {{ t.notes }}
{% endif %}{% if t.depends_on is defined %}  Depends on: {% if t.depends_on | length > 0 %}{% for did in t.depends_on %}{% if depth > 0 %}{% set loc = resolve(did) %}{% if loc %}{{ render_recursive(loc, depth - 1) }}{% else %}{{ did }}{% endif %}{% else %}{{ did }}{% endif %}{% if not loop.last %}, {% endif %}{% endfor %}{% else %}(none){% endif %}
{% endif %}{% if t.verification %}  Verification: {% if depth > 0 %}{% set loc = resolve(t.verification) %}{% if loc %}{{ render_recursive(loc, depth - 1) }}{% else %}{{ t.verification }}{% endif %}{% else %}{{ t.verification }}{% endif %}
{% endif %}{% endif %}
{% endmacro %}
