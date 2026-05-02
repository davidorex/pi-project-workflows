{#-
  Per-item macro for the `framework-gaps` block.

  Block schema: .project/schemas/framework-gaps.schema.json (Plan 7 / per-item-macros wave 4).

  Macro signature:
    render_framework_gap(gap, depth=0)
      gap   — single gap object matching .gaps[*] in the schema
      depth — integer recursion budget for cross-block reference inlining

  Naming note:
    The canonical macro name is `render_framework_gap`. The legacy `render_gap`
    macro lives in templates/shared/macros.md and retires under Plan 8 (parallel).
    Plan 7 deliberately does NOT author `render_gap` here.

  Depth contract:
    depth <= 0 — emit bare ID strings for cross-block references
                 (related_features, related_decisions, related_issues).
    depth >  0 — resolve(id) → render_recursive(loc, depth - 1); fall back to
                 bare ID on miss.

  Evidence array:
    Each gap carries an embedded `evidence[]` of {file, lines, reference}
    triples. These are file pointers, NOT block IDs — rendered inline as
    sub-list, never recursed.

  Empty-array convention:
    Present-but-empty arrays render `(none)`. Absent fields render nothing.

  Registry alias:
    The renderer-registry derives `render_framework_gaps` from the
    `framework-gaps` kind (hyphens→underscores). Plan-7 canonical name is
    singular `render_framework_gap`. Alias at the bottom bridges the two.
-#}

{% macro render_framework_gap(gap, depth=0) %}
ID: {{ gap.id }}
Title: {{ gap.title }}
Status: {{ gap.status }}
Package: {{ gap.package }}
Created by: {{ gap.created_by }}
Created at: {{ gap.created_at }}
{% if gap.priority %}Priority: {{ gap.priority }}
{% endif %}{% if gap.layer %}Layer: {{ gap.layer }}
{% endif %}{% if gap.canonical_vocabulary %}Canonical vocabulary: {{ gap.canonical_vocabulary }}
{% endif %}{% if gap.closed_by %}Closed by: {{ gap.closed_by }}
{% endif %}{% if gap.closed_at %}Closed at: {{ gap.closed_at }}
{% endif %}
Description:
{{ enforceBudget(gap.description, "framework-gaps", "gaps.items.description") }}

Impact:
{{ enforceBudget(gap.impact, "framework-gaps", "gaps.items.impact") }}

Proposed resolution:
{{ enforceBudget(gap.proposed_resolution, "framework-gaps", "gaps.items.proposed_resolution") }}

Evidence:
{% if gap.evidence and gap.evidence | length > 0 %}{% for e in gap.evidence %}  - {{ e.file }}{% if e.lines %}:{{ e.lines }}{% endif %} — {{ enforceBudget(e.reference, "framework-gaps", "gaps.items.evidence.items.reference") }}
{% endfor %}{% else %}  (none)
{% endif %}{% if gap.related_features is defined %}Related features:
{% if gap.related_features | length > 0 %}{% for fid in gap.related_features %}{% if depth > 0 %}{% set loc = resolve(fid) %}{% if loc %}{{ render_recursive(loc, depth - 1) }}
{% else %}  - {{ fid }}
{% endif %}{% else %}  - {{ fid }}
{% endif %}{% endfor %}{% else %}  (none)
{% endif %}{% endif %}{% if gap.related_decisions is defined %}Related decisions:
{% if gap.related_decisions | length > 0 %}{% for did in gap.related_decisions %}{% if depth > 0 %}{% set loc = resolve(did) %}{% if loc %}{{ render_recursive(loc, depth - 1) }}
{% else %}  - {{ did }}
{% endif %}{% else %}  - {{ did }}
{% endif %}{% endfor %}{% else %}  (none)
{% endif %}{% endif %}{% if gap.related_issues is defined %}Related issues:
{% if gap.related_issues | length > 0 %}{% for iid in gap.related_issues %}{% if depth > 0 %}{% set loc = resolve(iid) %}{% if loc %}{{ render_recursive(loc, depth - 1) }}
{% else %}  - {{ iid }}
{% endif %}{% else %}  - {{ iid }}
{% endif %}{% endfor %}{% else %}  (none)
{% endif %}{% endif %}{% endmacro %}

{#- Registry alias: derives registry-default `render_framework_gaps` (kind
    `framework-gaps` with hyphens→underscores) and bridges to the canonical
    singular `render_framework_gap`. Keeps render_recursive working when
    loc.block === "framework-gaps". -#}
{% macro render_framework_gaps(gap, depth=0) %}{{ render_framework_gap(gap, depth) }}{% endmacro %}
