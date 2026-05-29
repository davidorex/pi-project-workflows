{#-
  Per-item macro for the `conformance-reference` block (Plan 8 / per-item-macros wave 4).

  Block schema: .project/schemas/conformance-reference.schema.json. The
  block holds a name, scope, and principles[]. Each principle has nested
  rules[]. The "per-item" granularity here is one principle (with its
  rules) — the natural unit for prompt injection per the substrate spec.

  No cross-block references — references are to source material (sources[]
  at the block level), not to other block items. Depth parameter accepted
  for renderer-registry shape-uniformity.

  Companion whole-block macro:
    render_conformance(data) in shared/macros.md emits the block-level
    name + scope header, then iterates principles through this macro.
-#}

{% macro render_conformance_principle(p, depth=0) %}
{% if p %}
### {{ p.id }}: {{ p.name }}
{% if p.description %}{{ enforceBudget(p.description, "conformance-reference", "principles.items.description") }}{% endif %}
{% for r in p.rules %}- **{{ r.id }}**: {{ enforceBudget(r.rule, "conformance-reference", "principles.items.rules.items.rule") }}{% if r.severity %} [{{ r.severity }}]{% endif %}{% if r.check_method %} — check: {{ r.check_method }}{% endif %}
{% if r.anti_patterns %}  Anti-patterns: {{ r.anti_patterns | join("; ") }}
{% endif %}{% endfor %}
{% endif %}
{% endmacro %}
