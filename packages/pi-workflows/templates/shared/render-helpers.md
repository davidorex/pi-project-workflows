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

{#-
  Whole-block list scaffold (Plan 8 follow-up).

  Centralises the truthy-guard + heading + per-item iteration shape that
  previously repeated across the whole-block delegators in shared/macros.md
  for `render_domain`, `render_tasks`, and `render_issues`. Each delegator
  now reduces to one `{% call %}` block that supplies the per-item macro as
  its body — the heading-and-loop chassis lives here once.

  Two variants encode the two empty-handling regimes the legacy delegators
  shipped, kept distinct so output stays byte-identical to the originals:

    `render_whole_block_truthy(heading, items)`
        Heading-and-loop fire whenever `items` is truthy (matches the
        legacy `{% if data and data.<key> %}` guard used by tasks, issues,
        domain). Empty arrays still emit the heading because `[]` is truthy
        in Nunjucks — that surface is preserved deliberately.

    `render_whole_block_nonempty(heading, items)`
        Heading-and-loop fire only when `items | length > 0` (matches the
        legacy `{% if data and data.requirements and data.requirements |
        length > 0 %}` guard used by requirements). Empty arrays produce
        nothing.

  In both, the caller body (`{{ caller(item) }}`) is invoked once per item
  with the item bound to the call-block parameter.
-#}
{% macro render_whole_block_truthy(heading, items) %}{% if items %}
## {{ heading }}
{% for item in items %}{{ caller(item) }}{% endfor %}
{% endif %}{% endmacro %}

{% macro render_whole_block_nonempty(heading, items) %}{% if items and items | length > 0 %}
## {{ heading }}
{% for item in items %}{{ caller(item) }}{% endfor %}
{% endif %}{% endmacro %}
