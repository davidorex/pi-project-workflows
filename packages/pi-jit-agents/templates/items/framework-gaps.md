{#-
  Per-item macro for the `framework-gaps` block.

  Block schema: .project/schemas/framework-gaps.schema.json (Plan 7 / per-item-macros wave 4).

  Cross-block reference recursion (related_features, related_decisions,
  related_issues) is delegated to shared/render-helpers.md — see that file
  for the depth contract, ambient globals, and empty-array convention.

  Naming note:
    The canonical macro name is `render_framework_gap`. The legacy
    `render_gap` macro lives in templates/shared/macros.md and retires
    under Plan 8 (parallel). Plan 7 deliberately does NOT author
    `render_gap` here.

  Evidence array:
    Each gap carries an embedded `evidence[]` of {file, lines, reference}
    triples. These are file pointers, NOT block IDs — rendered inline as
    sub-list, never recursed.
-#}
{% from "shared/render-helpers.md" import render_id_list_block, render_optional_scalar %}

{% macro render_framework_gap(gap, depth=0) %}
ID: {{ gap.id }}
Title: {{ gap.title }}
Status: {{ gap.status }}
Package: {{ gap.package }}
Created by: {{ gap.created_by }}
Created at: {{ gap.created_at }}
{{ render_optional_scalar("Priority", gap.priority) }}{{ render_optional_scalar("Layer", gap.layer) }}{{ render_optional_scalar("Canonical vocabulary", gap.canonical_vocabulary) }}{{ render_optional_scalar("Closed by", gap.closed_by) }}{{ render_optional_scalar("Closed at", gap.closed_at) }}
Description:
{{ enforceBudget(gap.description, "framework-gaps", "gaps.items.description") }}

Impact:
{{ enforceBudget(gap.impact, "framework-gaps", "gaps.items.impact") }}

Proposed resolution:
{{ enforceBudget(gap.proposed_resolution, "framework-gaps", "gaps.items.proposed_resolution") }}

Evidence:
{% if gap.evidence and gap.evidence | length > 0 %}{% for e in gap.evidence %}  - {{ e.file }}{% if e.lines %}:{{ e.lines }}{% endif %} — {{ enforceBudget(e.reference, "framework-gaps", "gaps.items.evidence.items.reference") }}
{% endfor %}{% else %}  (none)
{% endif %}{{ render_id_list_block("Related features", gap.related_features, depth) }}{{ render_id_list_block("Related decisions", gap.related_decisions, depth) }}{{ render_id_list_block("Related issues", gap.related_issues, depth) }}{% endmacro %}
