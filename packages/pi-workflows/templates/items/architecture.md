{#-
  Per-item macro for the `architecture` block (Plan 8 / per-item-macros wave 4).

  Singleton kind: architecture holds one record per repository describing
  modules, patterns, boundaries, and (optionally) compilation_pipeline /
  execution_model / dispatch_design. The "per-item" rendering operates on
  the whole block payload as a single record; the whole-block delegator in
  shared/macros.md passes its data argument straight through.

  Macro signature:
    render_architecture_item(a, depth=0)
      a     — architecture record matching architecture.schema.json
      depth — recursion budget; unused (no cross-block reference fields).
              Accepted for shape-uniformity with the renderer-registry call
              convention.

  No cross-block references:
    Architecture fields point to internal sub-objects (modules, patterns,
    boundaries) and string descriptors, never to IDs in other project
    blocks. resolve / render_recursive are not invoked.
-#}

{% macro render_architecture_item(a, depth=0) %}
{% if a %}
## Architecture
{% if a.overview %}{{ a.overview }}
{% endif %}
{% if a.modules %}
### Modules
{% for m in a.modules %}- **{{ m.name }}** (`{{ m.file }}`{% if m.lines %}, {{ m.lines }} lines{% endif %}): {{ m.responsibility }}{% if m.dependencies %} — deps: {{ m.dependencies | join(", ") }}{% endif %}
{% endfor %}{% endif %}
{% if a.patterns %}
### Patterns
{% for p in a.patterns %}- **{{ p.name }}**: {{ p.description }}{% if p.used_in %} — used in: {{ p.used_in | join(", ") }}{% endif %}
{% endfor %}{% endif %}
{% if a.boundaries %}
### Boundaries
{% for b in a.boundaries %}- {{ b }}
{% endfor %}{% endif %}
{% endif %}
{% endmacro %}
