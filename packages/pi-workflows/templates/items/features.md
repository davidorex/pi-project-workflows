{#-
  Per-item macro for the `features` block.

  Block schema: .project/schemas/features.schema.json (Plan 7 / per-item-macros wave 4).

  Macro signature:
    render_feature(feat, depth=0)
      feat  — single feature object matching .features[*] in the schema
      depth — integer recursion budget for cross-block reference inlining

  Depth contract:
    depth <= 0 — emit bare ID strings for cross-block references
                 (dependencies, gates, blocks_resolved, decisions).
    depth >  0 — call resolve(id) → render_recursive(loc, depth - 1) for each
                 cross-block reference, falling back to bare ID on miss.

  Nested embedded structures:
    Each feature carries nested `stories[]` (with embedded `tasks[]`) and
    `findings[]` (scoped-finding shape). These are NOT separate block kinds —
    they are sub-shapes on the feature schema and have no per-item macro of
    their own. They are rendered inline as sub-lists under the feature body.
    Per the Plan 7 brief, no separate render_story / render_task macros are
    authored at this time. Story-level `depends_on`/`gates` are rendered as
    bare-ID lists (story IDs are scoped to the feature, not in the global
    index).

  Cross-block reference fields recursing on depth:
    dependencies, gates, blocks_resolved, decisions — all hold IDs of other
    blocks (features, decisions, framework-gaps, spec-reviews, issues).

  Empty-array convention:
    Optional arrays present-but-empty render `(none)`. Absent fields render
    nothing.

  Registry alias:
    The renderer-registry derives `render_features` from the `features` kind.
    Canonical Plan-7 name is `render_feature` (singular). Alias at the bottom
    bridges the two for render_recursive use.
-#}

{% macro render_feature(feat, depth=0) %}
ID: {{ feat.id }}
Title: {{ feat.title }}
Status: {{ feat.status }}
Layer: {{ feat.layer }}
Created by: {{ feat.created_by }}
Created at: {{ feat.created_at }}
{% if feat.modified_by %}Modified by: {{ feat.modified_by }}
{% endif %}{% if feat.modified_at %}Modified at: {{ feat.modified_at }}
{% endif %}{% if feat.approved_by %}Approved by: {{ feat.approved_by }}
{% endif %}{% if feat.approved_at %}Approved at: {{ feat.approved_at }}
{% endif %}
Description:
{{ feat.description }}

{% if feat.motivation %}Motivation:
{{ feat.motivation }}

{% endif %}Acceptance criteria:
{% if feat.acceptance_criteria and feat.acceptance_criteria | length > 0 %}{% for ac in feat.acceptance_criteria %}  - {{ ac }}
{% endfor %}{% else %}  (none)
{% endif %}{% if feat.dependencies is defined %}Dependencies:
{% if feat.dependencies | length > 0 %}{% for did in feat.dependencies %}{% if depth > 0 %}{% set loc = resolve(did) %}{% if loc %}{{ render_recursive(loc, depth - 1) }}
{% else %}  - {{ did }}
{% endif %}{% else %}  - {{ did }}
{% endif %}{% endfor %}{% else %}  (none)
{% endif %}{% endif %}{% if feat.gates is defined %}Gates:
{% if feat.gates | length > 0 %}{% for gid in feat.gates %}{% if depth > 0 %}{% set loc = resolve(gid) %}{% if loc %}{{ render_recursive(loc, depth - 1) }}
{% else %}  - {{ gid }}
{% endif %}{% else %}  - {{ gid }}
{% endif %}{% endfor %}{% else %}  (none)
{% endif %}{% endif %}{% if feat.blocks_resolved is defined %}Blocks resolved:
{% if feat.blocks_resolved | length > 0 %}{% for bid in feat.blocks_resolved %}{% if depth > 0 %}{% set loc = resolve(bid) %}{% if loc %}{{ render_recursive(loc, depth - 1) }}
{% else %}  - {{ bid }}
{% endif %}{% else %}  - {{ bid }}
{% endif %}{% endfor %}{% else %}  (none)
{% endif %}{% endif %}{% if feat.decisions is defined %}Decisions:
{% if feat.decisions | length > 0 %}{% for did in feat.decisions %}{% if depth > 0 %}{% set loc = resolve(did) %}{% if loc %}{{ render_recursive(loc, depth - 1) }}
{% else %}  - {{ did }}
{% endif %}{% else %}  - {{ did }}
{% endif %}{% endfor %}{% else %}  (none)
{% endif %}{% endif %}Stories:
{% if feat.stories and feat.stories | length > 0 %}{% for s in feat.stories %}  - {{ s.id }} [{{ s.status }}] {{ s.title }}
{% if s.description %}    Description: {{ s.description }}
{% endif %}{% if s.acceptance_criteria is defined %}    Acceptance criteria: {% if s.acceptance_criteria | length > 0 %}{% for ac in s.acceptance_criteria %}{{ ac }}{% if not loop.last %}; {% endif %}{% endfor %}{% else %}(none){% endif %}
{% endif %}{% if s.depends_on is defined %}    Depends on: {% if s.depends_on | length > 0 %}{% for dep in s.depends_on %}{{ dep }}{% if not loop.last %}, {% endif %}{% endfor %}{% else %}(none){% endif %}
{% endif %}{% if s.gates is defined %}    Gates: {% if s.gates | length > 0 %}{% for g in s.gates %}{{ g }}{% if not loop.last %}, {% endif %}{% endfor %}{% else %}(none){% endif %}
{% endif %}    Tasks:
{% if s.tasks and s.tasks | length > 0 %}{% for t in s.tasks %}      - {{ t.id }} [{{ t.status }}] {{ t.title }}
{% if t.description %}        Description: {{ t.description }}
{% endif %}{% if t.files is defined %}        Files: {% if t.files | length > 0 %}{% for f in t.files %}{{ f }}{% if not loop.last %}, {% endif %}{% endfor %}{% else %}(none){% endif %}
{% endif %}{% if t.acceptance %}        Acceptance: {{ t.acceptance }}
{% endif %}{% if t.depends_on is defined %}        Depends on: {% if t.depends_on | length > 0 %}{% for dep in t.depends_on %}{{ dep }}{% if not loop.last %}, {% endif %}{% endfor %}{% else %}(none){% endif %}
{% endif %}{% if t.assigned_to %}        Assigned to: {{ t.assigned_to }}
{% endif %}{% endfor %}{% else %}      (none)
{% endif %}{% endfor %}{% else %}  (none)
{% endif %}Findings:
{% if feat.findings and feat.findings | length > 0 %}{% for f in feat.findings %}  - {{ f.id }} [{{ f.severity }}/{{ f.state }}] reporter={{ f.reporter }} at={{ f.created_at }}
    Description: {{ f.description }}
{% if f.evidence %}    Evidence: {{ f.evidence }}
{% endif %}{% if f.category %}    Category: {{ f.category }}
{% endif %}{% if f.resolution %}    Resolution: {{ f.resolution }}
{% endif %}{% if f.resolved_by %}    Resolved by: {{ f.resolved_by }}
{% endif %}{% if f.resolved_at %}    Resolved at: {{ f.resolved_at }}
{% endif %}{% endfor %}{% else %}  (none)
{% endif %}{% endmacro %}

{#- Registry alias: derives the registry default name `render_features` from
    the `features` kind. Bridges to canonical Plan-7 singular name. -#}
{% macro render_features(feat, depth=0) %}{{ render_feature(feat, depth) }}{% endmacro %}
