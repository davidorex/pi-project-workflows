{#-
  Per-item macro for the `domain` block (Plan 8 / per-item-macros wave 4).

  Block schema: .project/schemas/domain.schema.json. Each item is one
  knowledge entry inside data.entries[]. Required: id, title, content,
  category. Optional: source, confidence, related_requirements (array of
  REQ- IDs), tags.

  Macro signature:
    render_domain_entry(e, depth=0)
      e     — single domain entry object
      depth — recursion budget for cross-block reference inlining.
              depth <= 0 — emit bare ID strings for related_requirements.
              depth >  0 — call resolve(id); on hit, render_recursive(loc,
                           depth - 1) inlines via registered per-item macro.

  Depth contract: mirrors render_decision (Plan 6). resolve and
  render_recursive are ambient Nunjucks globals registered by compileAgent.

  Empty-array convention:
    related_requirements present-but-empty renders `(none)`. Absent renders
    nothing.
-#}

{% macro render_domain_entry(e, depth=0) %}
{% if e %}- **{{ e.id }}** [{{ e.category }}]: {{ e.title }}
  {{ enforceBudget(e.content, "domain", "entries.items.content") }}{% if e.tags %} — tags: {{ e.tags | join(", ") }}{% endif %}
{% if e.source %}  Source: {{ e.source }}
{% endif %}{% if e.confidence %}  Confidence: {{ e.confidence }}
{% endif %}{% if e.related_requirements is defined %}  Related requirements: {% if e.related_requirements | length > 0 %}{% for rid in e.related_requirements %}{% if depth > 0 %}{% set loc = resolve(rid) %}{% if loc %}{{ render_recursive(loc, depth - 1) }}{% else %}{{ rid }}{% endif %}{% else %}{{ rid }}{% endif %}{% if not loop.last %}, {% endif %}{% endfor %}{% else %}(none){% endif %}
{% endif %}{% endif %}
{% endmacro %}

{#- Registry alias: derives `render_domain` from the `domain` kind, bridges
    to canonical `render_domain_entry` for per-item dispatch. -#}
{% macro render_domain(e, depth=0) %}{{ render_domain_entry(e, depth) }}{% endmacro %}
