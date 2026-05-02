{#-
  Per-item macro for the `decisions` block.

  Block schema: .project/schemas/decisions.schema.json (Plan 6 / per-item-macros wave 3).

  Macro signature:
    render_decision(dec, depth=0)
      dec   — single decision object matching .decisions[*] in the schema
      depth — integer recursion budget for cross-block reference inlining

  Depth contract:
    depth <= 0 — emit bare ID strings for cross-block references (related_findings,
                 related_features, related_gaps, supersedes, superseded_by).
                 No further block reads happen.
    depth >  0 — call resolve(id) to look up the referenced item; on hit,
                 call render_recursive(loc, depth - 1) to inline the body via
                 the renderer-registry's per-item macro for that kind; on miss
                 (resolve returns null), fall back to bare ID text.

  resolve(id) and render_recursive(loc, depth) are Nunjucks globals registered
  by compileAgent in @davidorex/pi-jit-agents (compile.ts). They are NOT
  imported here; they are ambient globals on the Nunjucks Environment.
  Cycles produce `[cycle: <id>]`; missing per-item macros for a kind produce
  `[unrendered: <kind>/<id>]`. Both are documented fallbacks, not failures.

  Empty-array convention:
    Optional cross-reference and references arrays render the field label with
    `(none)` rather than omitting the line, when present-but-empty. Absent
    fields (undefined) render nothing — they were not specified by the author.
    This preserves prompt-shape predictability for downstream prompt-template
    consumers without polluting output for fields the author did not populate.

  References array (`references[]`):
    Labelled pointers (label + optional path/lines/commit). NOT recursable —
    references point to code paths, research docs, commit SHAs, external specs,
    none of which are project blocks. Rendered inline as one bullet per ref.

  Aliases:
    `render_decisions(dec, depth=0)` is a one-line alias. The renderer-registry
    derives macro names by prefixing the block kind with `render_` (so
    `decisions` → `render_decisions`); the canonical name for this macro is
    `render_decision` (singular) per Plan 6, so the alias bridges the registry
    convention without forcing a registry-side rename.
-#}

{% macro render_decision(dec, depth=0) %}
ID: {{ dec.id }}
Title: {{ dec.title }}
Status: {{ dec.status }}
Created by: {{ dec.created_by }}
Created at: {{ dec.created_at }}
{% if dec.enacted_by %}Enacted by: {{ dec.enacted_by }}
{% endif %}{% if dec.enacted_at %}Enacted at: {{ dec.enacted_at }}
{% endif %}
Context:
{{ dec.context }}

Decision:
{{ dec.decision }}

Consequences:
{% if dec.consequences and dec.consequences | length > 0 %}{% for c in dec.consequences %}  - {{ c }}
{% endfor %}{% else %}  (none)
{% endif %}
{% if dec.options_considered is defined %}Options considered:
{% if dec.options_considered | length > 0 %}{% for opt in dec.options_considered %}  - {{ opt.label }}: {{ opt.description }}
{% if opt.tradeoffs %}    Tradeoffs: {{ opt.tradeoffs }}
{% endif %}{% if opt.rejected_reason %}    Rejected reason: {{ opt.rejected_reason }}
{% endif %}{% endfor %}{% else %}  (none)
{% endif %}{% endif %}
{% if dec.supersedes is defined %}Supersedes:
{% if dec.supersedes | length > 0 %}{% for sid in dec.supersedes %}{% if depth > 0 %}{% set loc = resolve(sid) %}{% if loc %}{{ render_recursive(loc, depth - 1) }}
{% else %}  - {{ sid }}
{% endif %}{% else %}  - {{ sid }}
{% endif %}{% endfor %}{% else %}  (none)
{% endif %}{% endif %}
{% if dec.superseded_by is defined and dec.superseded_by %}Superseded by:
{% if depth > 0 %}{% set loc = resolve(dec.superseded_by) %}{% if loc %}{{ render_recursive(loc, depth - 1) }}
{% else %}  - {{ dec.superseded_by }}
{% endif %}{% else %}  - {{ dec.superseded_by }}
{% endif %}{% endif %}
{% if dec.related_findings is defined %}Related findings:
{% if dec.related_findings | length > 0 %}{% for fid in dec.related_findings %}{% if depth > 0 %}{% set loc = resolve(fid) %}{% if loc %}{{ render_recursive(loc, depth - 1) }}
{% else %}  - {{ fid }}
{% endif %}{% else %}  - {{ fid }}
{% endif %}{% endfor %}{% else %}  (none)
{% endif %}{% endif %}
{% if dec.related_features is defined %}Related features:
{% if dec.related_features | length > 0 %}{% for fid in dec.related_features %}{% if depth > 0 %}{% set loc = resolve(fid) %}{% if loc %}{{ render_recursive(loc, depth - 1) }}
{% else %}  - {{ fid }}
{% endif %}{% else %}  - {{ fid }}
{% endif %}{% endfor %}{% else %}  (none)
{% endif %}{% endif %}
{% if dec.related_gaps is defined %}Related gaps:
{% if dec.related_gaps | length > 0 %}{% for gid in dec.related_gaps %}{% if depth > 0 %}{% set loc = resolve(gid) %}{% if loc %}{{ render_recursive(loc, depth - 1) }}
{% else %}  - {{ gid }}
{% endif %}{% else %}  - {{ gid }}
{% endif %}{% endfor %}{% else %}  (none)
{% endif %}{% endif %}
{% if dec.references is defined %}References:
{% if dec.references | length > 0 %}{% for ref in dec.references %}  - {{ ref.label }}{% if ref.path %} — path: {{ ref.path }}{% if ref.lines %}:{{ ref.lines }}{% endif %}{% endif %}{% if ref.commit %} — commit: {{ ref.commit }}{% endif %}
{% endfor %}{% else %}  (none)
{% endif %}{% endif %}
{% endmacro %}

{#- Registry alias: the renderer-registry default macro-name derivation
    (`render_<kind>` with hyphens→underscores) maps the `decisions` kind to
    `render_decisions`. The canonical Plan-6 name is `render_decision`, so
    this alias bridges the two without forcing the registry to special-case
    pluralisation. Keeps `render_recursive(loc, depth)` working when loc.block
    === "decisions". -#}
{% macro render_decisions(dec, depth=0) %}{{ render_decision(dec, depth) }}{% endmacro %}
