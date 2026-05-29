{#-
  Per-item macro for the `features` block.

  Block schema: .project/schemas/features.schema.json (Plan 7 / per-item-macros wave 4).

  Cross-block reference recursion (dependencies, gates, blocks_resolved,
  decisions) is delegated to shared/render-helpers.md — see that file for
  the depth contract, ambient globals, and empty-array convention.

  Nested embedded structures:
    Each feature carries nested `stories[]` (with embedded `tasks[]`) and
    `findings[]` (scoped-finding shape). These are NOT separate block kinds
    — they are sub-shapes on the feature schema and have no per-item macro
    of their own. They are rendered inline as sub-lists under the feature
    body. Story-level `depends_on`/`gates` are rendered as bare-ID lists
    (story IDs are scoped to the feature, not in the global index) and stay
    inline because they use a deeper indent (4 spaces) than the helper
    convention assumes.
-#}
{% from "shared/render-helpers.md" import render_id_list_block, render_optional_scalar %}

{% macro render_feature(feat, depth=0) %}
ID: {{ feat.id }}
Title: {{ feat.title }}
Status: {{ feat.status }}
Layer: {{ feat.layer }}
Created by: {{ feat.created_by }}
Created at: {{ feat.created_at }}
{{ render_optional_scalar("Modified by", feat.modified_by) }}{{ render_optional_scalar("Modified at", feat.modified_at) }}{{ render_optional_scalar("Approved by", feat.approved_by) }}{{ render_optional_scalar("Approved at", feat.approved_at) }}
Description:
{{ enforceBudget(feat.description, "features", "features.items.description") }}

{% if feat.motivation %}Motivation:
{{ enforceBudget(feat.motivation, "features", "features.items.motivation") }}

{% endif %}Acceptance criteria:
{% if feat.acceptance_criteria and feat.acceptance_criteria | length > 0 %}{% for ac in feat.acceptance_criteria %}  - {{ ac }}
{% endfor %}{% else %}  (none)
{% endif %}{{ render_id_list_block("Dependencies", feat.dependencies, depth) }}{{ render_id_list_block("Gates", feat.gates, depth) }}{{ render_id_list_block("Blocks resolved", feat.blocks_resolved, depth) }}{{ render_id_list_block("Decisions", feat.decisions, depth) }}Stories:
{% if feat.stories and feat.stories | length > 0 %}{% for s in feat.stories %}  - {{ s.id }} [{{ s.status }}] {{ s.title }}
{% if s.description %}    Description: {{ enforceBudget(s.description, "features", "features.items.stories.items.description") }}
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
    Description: {{ enforceBudget(f.description, "features", "features.items.findings.items.description") }}
{% if f.evidence %}    Evidence: {{ f.evidence }}
{% endif %}{% if f.category %}    Category: {{ f.category }}
{% endif %}{% if f.resolution %}    Resolution: {{ f.resolution }}
{% endif %}{% if f.resolved_by %}    Resolved by: {{ f.resolved_by }}
{% endif %}{% if f.resolved_at %}    Resolved at: {{ f.resolved_at }}
{% endif %}{% endfor %}{% else %}  (none)
{% endif %}{% endmacro %}
