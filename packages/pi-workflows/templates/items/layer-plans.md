{#-
  Per-item macro for the `layer-plans` block.

  Block schema: .project/schemas/layer-plans.schema.json (Plan 7 / per-item-macros wave 4).

  Cross-block reference recursion (related_gaps, related_features,
  related_decisions) is delegated to shared/render-helpers.md — see that
  file for the depth contract, ambient globals, and empty-array convention.

  Nested embedded structures:
    Each plan carries `layers[]` (each with current_blocks/target_blocks
    sub-arrays) and `migration_phases[]`. These are NOT separate block kinds
    — they are sub-shapes on the plan schema and rendered inline. Phase
    `depends_on` references are scoped to phase IDs within the same plan and
    rendered as bare-ID lists (no recursion).
-#}
{% from "shared/render-helpers.md" import render_id_list_block %}

{% macro render_layer_plan(plan, depth=0) %}
ID: {{ plan.id }}
Title: {{ plan.title }}
Status: {{ plan.status }}
Model: {{ plan.model }}
Created by: {{ plan.created_by }}
Created at: {{ plan.created_at }}
{% if plan.description %}
Description:
{{ enforceBudget(plan.description, "layer-plans", "plans.items.description") }}

{% endif %}Layers:
{% if plan.layers and plan.layers | length > 0 %}{% for l in plan.layers %}  - {{ l.id }}: {{ l.name }}
    Purpose: {{ enforceBudget(l.purpose, "layer-plans", "plans.items.layers.items.purpose") }}
{% if l.canonical_vocabulary %}    Canonical vocabulary: {{ l.canonical_vocabulary }}
{% endif %}{% if l.lifetime %}    Lifetime: {{ l.lifetime }}
{% endif %}{% if l.ownership_principle %}    Ownership principle: {{ enforceBudget(l.ownership_principle, "layer-plans", "plans.items.layers.items.ownership_principle") }}
{% endif %}    Current blocks: {% if l.current_blocks | length > 0 %}{% for cb in l.current_blocks %}{{ cb }}{% if not loop.last %}, {% endif %}{% endfor %}{% else %}(none){% endif %}
    Target blocks:
{% if l.target_blocks and l.target_blocks | length > 0 %}{% for tb in l.target_blocks %}      - {{ tb.name }} (shape: {{ tb.shape }}){% if tb.notes %} — {{ tb.notes }}{% endif %}
{% endfor %}{% else %}      (none)
{% endif %}{% endfor %}{% else %}  (none)
{% endif %}Migration phases:
{% if plan.migration_phases and plan.migration_phases | length > 0 %}{% for p in plan.migration_phases %}  - {{ p.id }}: {{ p.name }}{% if p.status %} [{{ p.status }}]{% endif %}
    Description: {{ enforceBudget(p.description, "layer-plans", "plans.items.migration_phases.items.description") }}
    Depends on: {% if p.depends_on | length > 0 %}{% for dep in p.depends_on %}{{ dep }}{% if not loop.last %}, {% endif %}{% endfor %}{% else %}(none){% endif %}
    Exit criteria:
{% if p.exit_criteria | length > 0 %}{% for ec in p.exit_criteria %}      - {{ enforceBudget(ec, "layer-plans", "plans.items.migration_phases.items.exit_criteria.items") }}
{% endfor %}{% else %}      (none)
{% endif %}{% if p.produces is defined %}    Produces: {% if p.produces | length > 0 %}{% for pr in p.produces %}{{ pr }}{% if not loop.last %}, {% endif %}{% endfor %}{% else %}(none){% endif %}
{% endif %}{% endfor %}{% else %}  (none)
{% endif %}{{ render_id_list_block("Related gaps", plan.related_gaps, depth) }}{{ render_id_list_block("Related features", plan.related_features, depth) }}{{ render_id_list_block("Related decisions", plan.related_decisions, depth) }}{% endmacro %}
