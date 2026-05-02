{#-
  Shared rendering helpers for per-item macros.

  Captures repeated micro-patterns that previously lived inline in every
  per-item macro file under `items/*.md`. The aim is one definition per
  pattern, consumed by every per-item macro that uses it.

  Helpers exported:
    render_id_list_block(label, ids, depth)
    render_id_single_block(label, id, depth)
    render_id_list_inline(label, ids, depth)
    render_id_single_inline(label, id, depth)
    render_optional_scalar(label, value)

  Output convention:
    Block-style helpers emit `<Label>:\n` followed by `  - <id>\n` per entry
    (or `  (none)\n` for present-but-empty arrays). Absent (undefined)
    arrays emit nothing.

    Inline-style helpers emit `  <Label>: <id>[, <id>...]\n` (or `(none)\n`
    for empty). The two-space indent prefix is part of the inline shape used
    by domain.related_requirements, requirements.traces_to/depends_on, and
    tasks.depends_on/verification — it is the indent under a parent list
    bullet, not arbitrary padding.

  Depth contract:
    Each helper that takes `depth` honours the same recursion budget as the
    per-item macros: depth <= 0 emits bare ID text; depth > 0 calls resolve
    + render_recursive (ambient Nunjucks globals registered by compileAgent
    in @davidorex/pi-jit-agents) and falls back to bare-ID on resolve miss.
    Cycles → `[cycle: <id>]` and missing per-item macros → `[unrendered:
    <kind>/<id>]` are produced inside render_recursive itself, not here.

  resolve(id) and render_recursive(loc, depth) are env-level globals
  available to imported macros without re-import.

  Empty-array convention:
    `is defined` discriminates absent vs present. Present-but-empty arrays
    render the label with `(none)`; absent fields render nothing. This
    preserves the per-item macro contract documented in items/decisions.md
    and mirrored across every per-item macro.

  Output equivalence:
    The helper bodies are byte-identical to the patterns they replace. The
    existing render-*.test.ts assertions are the regression net. If a
    helper drifts from the inline pattern's output, those tests break.
-#}

{% macro render_id_list_block(label, ids, depth) %}{% if ids is defined %}{{ label }}:
{% if ids | length > 0 %}{% for id in ids %}{% if depth > 0 %}{% set loc = resolve(id) %}{% if loc %}{{ render_recursive(loc, depth - 1) }}
{% else %}  - {{ id }}
{% endif %}{% else %}  - {{ id }}
{% endif %}{% endfor %}{% else %}  (none)
{% endif %}{% endif %}{% endmacro %}

{% macro render_id_single_block(label, id, depth) %}{% if id is defined and id %}{{ label }}:
{% if depth > 0 %}{% set loc = resolve(id) %}{% if loc %}{{ render_recursive(loc, depth - 1) }}
{% else %}  - {{ id }}
{% endif %}{% else %}  - {{ id }}
{% endif %}{% endif %}{% endmacro %}

{% macro render_id_list_inline(label, ids, depth) %}{% if ids is defined %}  {{ label }}: {% if ids | length > 0 %}{% for id in ids %}{% if depth > 0 %}{% set loc = resolve(id) %}{% if loc %}{{ render_recursive(loc, depth - 1) }}{% else %}{{ id }}{% endif %}{% else %}{{ id }}{% endif %}{% if not loop.last %}, {% endif %}{% endfor %}{% else %}(none){% endif %}
{% endif %}{% endmacro %}

{% macro render_id_single_inline(label, id, depth) %}{% if id %}  {{ label }}: {% if depth > 0 %}{% set loc = resolve(id) %}{% if loc %}{{ render_recursive(loc, depth - 1) }}{% else %}{{ id }}{% endif %}{% else %}{{ id }}{% endif %}
{% endif %}{% endmacro %}

{% macro render_optional_scalar(label, value) %}{% if value %}{{ label }}: {{ value }}
{% endif %}{% endmacro %}
