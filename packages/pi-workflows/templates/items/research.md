{#-
  Per-item macro for the `research` block.

  Block schema: .project/schemas/research.schema.json (Plan 7 / per-item-macros wave 4).

  Cross-block reference recursion (informs, informed_by, related_research,
  produces_findings, supersedes, superseded_by) is delegated to
  shared/render-helpers.md — see that file for the depth contract, ambient
  globals, and empty-array convention.

  Embedded substructures:
    `grounding` is an object with dependencies/revisions/external_refs
    string arrays — rendered inline as labelled sub-lists, never recursed.
    `citations[]` carries label/path/lines/url/retrieved_at — labelled
    pointers to source material, not block IDs; rendered inline.
    `stale_conditions[]` and `scope[]` are simple string arrays rendered as
    bullet sub-lists.

  x-prompt-budget integration:
    The schema annotates `findings_summary`, `question`, `method` with
    `x-prompt-budget`. enforceBudget is wired for these per Plan 5.
-#}
{% from "shared/render-helpers.md" import render_id_list_block, render_id_single_block, render_optional_scalar %}

{% macro render_research(r, depth=0) %}
ID: {{ r.id }}
Title: {{ r.title }}
Status: {{ r.status }}
Layer: {{ r.layer }}
Type: {{ r.type }}
Created by: {{ r.created_by }}
Created at: {{ r.created_at }}
{{ render_optional_scalar("Modified by", r.modified_by) }}{{ render_optional_scalar("Modified at", r.modified_at) }}{{ render_optional_scalar("Conducted by", r.conducted_by) }}{{ render_optional_scalar("Conducted at", r.conducted_at) }}{{ render_optional_scalar("Grounded at", r.grounded_at) }}
Question:
{{ enforceBudget(r.question, "research", "research.items.question") }}

Method:
{{ enforceBudget(r.method, "research", "research.items.method") }}

{% if r.scope is defined %}Scope:
{% if r.scope | length > 0 %}{% for s in r.scope %}  - {{ s }}
{% endfor %}{% else %}  (none)
{% endif %}{% endif %}Findings summary:
{{ enforceBudget(r.findings_summary, "research", "research.items.findings_summary") }}

{% if r.findings_document %}Findings document: {{ r.findings_document }}
{% endif %}{% if r.grounding is defined %}Grounding:
{% if r.grounding.dependencies is defined %}  Dependencies: {% if r.grounding.dependencies | length > 0 %}{% for d in r.grounding.dependencies %}{{ d }}{% if not loop.last %}, {% endif %}{% endfor %}{% else %}(none){% endif %}
{% endif %}{% if r.grounding.revisions is defined %}  Revisions: {% if r.grounding.revisions | length > 0 %}{% for rv in r.grounding.revisions %}{{ rv }}{% if not loop.last %}, {% endif %}{% endfor %}{% else %}(none){% endif %}
{% endif %}{% if r.grounding.external_refs is defined %}  External refs: {% if r.grounding.external_refs | length > 0 %}{% for er in r.grounding.external_refs %}{{ er }}{% if not loop.last %}, {% endif %}{% endfor %}{% else %}(none){% endif %}
{% endif %}{% endif %}{% if r.stale_conditions is defined %}Stale conditions:
{% if r.stale_conditions | length > 0 %}{% for sc in r.stale_conditions %}  - {{ sc }}
{% endfor %}{% else %}  (none)
{% endif %}{% endif %}{% if r.citations is defined %}Citations:
{% if r.citations | length > 0 %}{% for c in r.citations %}  - {{ c.label }}{% if c.path %} — path: {{ c.path }}{% if c.lines %}:{{ c.lines }}{% endif %}{% endif %}{% if c.url %} — url: {{ c.url }}{% endif %}{% if c.retrieved_at %} — retrieved_at: {{ c.retrieved_at }}{% endif %}
{% endfor %}{% else %}  (none)
{% endif %}{% endif %}{{ render_id_list_block("Informs", r.informs, depth) }}{{ render_id_list_block("Informed by", r.informed_by, depth) }}{{ render_id_list_block("Related research", r.related_research, depth) }}{{ render_id_list_block("Produces findings", r.produces_findings, depth) }}{{ render_id_list_block("Supersedes", r.supersedes, depth) }}{{ render_id_single_block("Superseded by", r.superseded_by, depth) }}{% endmacro %}
