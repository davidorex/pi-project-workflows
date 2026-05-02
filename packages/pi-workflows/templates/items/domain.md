{#-
  Per-item macro for the `domain` block (Plan 8 / per-item-macros wave 4).

  Block schema: .project/schemas/domain.schema.json. Each item is one
  knowledge entry inside data.entries[]. Required: id, title, content,
  category. Optional: source, confidence, related_requirements (array of
  REQ- IDs), tags.

  Cross-block reference recursion (related_requirements) is delegated to
  shared/render-helpers.md — see that file for the depth contract, ambient
  globals, and empty-array convention.
-#}
{% from "shared/render-helpers.md" import render_id_list_inline %}

{% macro render_domain_entry(e, depth=0) %}
{% if e %}- **{{ e.id }}** [{{ e.category }}]: {{ e.title }}
  {{ enforceBudget(e.content, "domain", "entries.items.content") }}{% if e.tags %} — tags: {{ e.tags | join(", ") }}{% endif %}
{% if e.source %}  Source: {{ e.source }}
{% endif %}{% if e.confidence %}  Confidence: {{ e.confidence }}
{% endif %}{{ render_id_list_inline("Related requirements", e.related_requirements, depth) }}{% endif %}
{% endmacro %}
