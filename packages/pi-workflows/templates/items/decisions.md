{#-
  Per-item macro for the `decisions` block.

  Block schema: .project/schemas/decisions.schema.json (Plan 6 / per-item-macros wave 3).

  Macro signature:
    render_decision(dec, depth=0)
      dec   — single decision object matching .decisions[*] in the schema
      depth — integer recursion budget for cross-block reference inlining

  Cross-block reference recursion (supersedes, superseded_by, related_findings,
  related_features, related_gaps) is delegated to shared/render-helpers.md —
  see that file for the depth contract, ambient globals, and empty-array
  convention shared across all per-item macros.

  References array (`references[]`):
    Labelled pointers (label + optional path/lines/commit). NOT recursable —
    references point to code paths, research docs, commit SHAs, external specs,
    none of which are project blocks. Rendered inline as one bullet per ref.
-#}
{% from "shared/render-helpers.md" import render_id_list_block, render_id_single_block, render_optional_scalar %}

{% macro render_decision(dec, depth=0) %}
ID: {{ dec.id }}
Title: {{ dec.title }}
Status: {{ dec.status }}
Created by: {{ dec.created_by }}
Created at: {{ dec.created_at }}
{{ render_optional_scalar("Enacted by", dec.enacted_by) }}{{ render_optional_scalar("Enacted at", dec.enacted_at) }}
Context:
{{ enforceBudget(dec.context, "decisions", "decisions.items.context") }}

Decision:
{{ enforceBudget(dec.decision, "decisions", "decisions.items.decision") }}

Consequences:
{% if dec.consequences and dec.consequences | length > 0 %}{% for c in dec.consequences %}  - {{ enforceBudget(c, "decisions", "decisions.items.consequences.items") }}
{% endfor %}{% else %}  (none)
{% endif %}{% if dec.options_considered is defined %}Options considered:
{% if dec.options_considered | length > 0 %}{% for opt in dec.options_considered %}  - {{ opt.label }}: {{ opt.description }}
{% if opt.tradeoffs %}    Tradeoffs: {{ opt.tradeoffs }}
{% endif %}{% if opt.rejected_reason %}    Rejected reason: {{ opt.rejected_reason }}
{% endif %}{% endfor %}{% else %}  (none)
{% endif %}{% endif %}{{ render_id_list_block("Supersedes", dec.supersedes, depth) }}{{ render_id_single_block("Superseded by", dec.superseded_by, depth) }}{{ render_id_list_block("Related findings", dec.related_findings, depth) }}{{ render_id_list_block("Related features", dec.related_features, depth) }}{{ render_id_list_block("Related gaps", dec.related_gaps, depth) }}{% if dec.references is defined %}References:
{% if dec.references | length > 0 %}{% for ref in dec.references %}  - {{ ref.label }}{% if ref.path %} — path: {{ ref.path }}{% if ref.lines %}:{{ ref.lines }}{% endif %}{% endif %}{% if ref.commit %} — commit: {{ ref.commit }}{% endif %}
{% endfor %}{% else %}  (none)
{% endif %}{% endif %}{% endmacro %}
