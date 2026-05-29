{#-
  Per-item macro for the `tasks` block (Plan 8 / per-item-macros wave 4).

  Block schema: .project/schemas/tasks.schema.json. Each item is one task
  inside data.tasks[]. Required: id (^TASK-\d{3,}$), description, status.
  Optional: phase (string|integer), files, acceptance_criteria, depends_on
  (other task IDs), assigned_agent, verification (verification ID), notes.

  When status === "completed", schema additionally requires verification
  (the if/then conditional in the schema).

  Cross-block reference recursion (depends_on, verification) is delegated to
  shared/render-helpers.md — see that file for the depth contract, ambient
  globals, and empty-array convention. verification is rendered as a single
  inline reference (one ID) rather than a list.

  Files field:
    files[] is a list of code paths, not project-block IDs. Rendered inline
    as a comma-separated list; never recursed.
-#}
{% from "shared/render-helpers.md" import render_id_list_inline, render_id_single_inline %}

{% macro render_task(t, depth=0) %}
{% if t %}- **{{ t.id }}** [{{ t.status }}]: {{ enforceBudget(t.description, "tasks", "tasks.items.description") }}{% if t.phase %} (phase {{ t.phase }}){% endif %}{% if t.files %} — files: {{ t.files | join(", ") }}{% endif %}
{% if t.acceptance_criteria %}  Criteria: {% for ac in t.acceptance_criteria %}{{ enforceBudget(ac, "tasks", "tasks.items.acceptance_criteria.items") }}{% if not loop.last %}; {% endif %}{% endfor %}
{% endif %}{% if t.assigned_agent %}  Assigned agent: {{ t.assigned_agent }}
{% endif %}{% if t.notes %}  Notes: {{ enforceBudget(t.notes, "tasks", "tasks.items.notes") }}
{% endif %}{{ render_id_list_inline("Depends on", t.depends_on, depth) }}{{ render_id_single_inline("Verification", t.verification, depth) }}{% endif %}
{% endmacro %}
