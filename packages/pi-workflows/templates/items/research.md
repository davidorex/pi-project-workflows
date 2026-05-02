{#-
  Per-item macro for the `research` block.

  Block schema: .project/schemas/research.schema.json (Plan 7 / per-item-macros wave 4).

  Macro signature:
    render_research(r, depth=0)
      r     — single research object matching .research[*] in the schema
      depth — integer recursion budget for cross-block reference inlining

  Depth contract:
    depth <= 0 — emit bare ID strings for cross-block references
                 (related_research, informed_by, informs, produces_findings,
                 supersedes, superseded_by).
    depth >  0 — resolve(id) → render_recursive(loc, depth - 1); fall back to
                 bare ID on miss.

  Embedded substructures:
    `grounding` is an object with dependencies/revisions/external_refs string
    arrays — rendered inline as labelled sub-lists, never recursed.
    `citations[]` carries label/path/lines/url/retrieved_at — labelled
    pointers to source material, not block IDs; rendered inline.
    `stale_conditions[]` and `scope[]` are simple string arrays rendered as
    bullet sub-lists.

  x-prompt-budget integration:
    The schema annotates `findings_summary`, `question`, `method` with
    `x-prompt-budget`. Per the Plan 7 brief, budget enforcement is intended to
    happen at an outer compile-pass (Plan 5's `enforceBudget` primitive is
    exported but not yet wired into per-item macros). Plan 6's render_decision
    chose the simpler integration path: emit content directly. This macro
    follows the same convention.

  Empty-array convention:
    Present-but-empty arrays render `(none)`. Absent fields render nothing.

  Registry alias:
    Renderer-registry derives `render_research` from the `research` kind
    (no hyphen, no plural transformation needed). The canonical singular
    name is also `render_research`, so no alias is strictly necessary, but
    one is provided for symmetry with the other Plan-7 macros and to make
    the registry contract explicit.
-#}

{% macro render_research(r, depth=0) %}
ID: {{ r.id }}
Title: {{ r.title }}
Status: {{ r.status }}
Layer: {{ r.layer }}
Type: {{ r.type }}
Created by: {{ r.created_by }}
Created at: {{ r.created_at }}
{% if r.modified_by %}Modified by: {{ r.modified_by }}
{% endif %}{% if r.modified_at %}Modified at: {{ r.modified_at }}
{% endif %}{% if r.conducted_by %}Conducted by: {{ r.conducted_by }}
{% endif %}{% if r.conducted_at %}Conducted at: {{ r.conducted_at }}
{% endif %}{% if r.grounded_at %}Grounded at: {{ r.grounded_at }}
{% endif %}
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
{% endif %}{% endif %}{% if r.informs is defined %}Informs:
{% if r.informs | length > 0 %}{% for iid in r.informs %}{% if depth > 0 %}{% set loc = resolve(iid) %}{% if loc %}{{ render_recursive(loc, depth - 1) }}
{% else %}  - {{ iid }}
{% endif %}{% else %}  - {{ iid }}
{% endif %}{% endfor %}{% else %}  (none)
{% endif %}{% endif %}{% if r.informed_by is defined %}Informed by:
{% if r.informed_by | length > 0 %}{% for iid in r.informed_by %}{% if depth > 0 %}{% set loc = resolve(iid) %}{% if loc %}{{ render_recursive(loc, depth - 1) }}
{% else %}  - {{ iid }}
{% endif %}{% else %}  - {{ iid }}
{% endif %}{% endfor %}{% else %}  (none)
{% endif %}{% endif %}{% if r.related_research is defined %}Related research:
{% if r.related_research | length > 0 %}{% for rid in r.related_research %}{% if depth > 0 %}{% set loc = resolve(rid) %}{% if loc %}{{ render_recursive(loc, depth - 1) }}
{% else %}  - {{ rid }}
{% endif %}{% else %}  - {{ rid }}
{% endif %}{% endfor %}{% else %}  (none)
{% endif %}{% endif %}{% if r.produces_findings is defined %}Produces findings:
{% if r.produces_findings | length > 0 %}{% for fid in r.produces_findings %}{% if depth > 0 %}{% set loc = resolve(fid) %}{% if loc %}{{ render_recursive(loc, depth - 1) }}
{% else %}  - {{ fid }}
{% endif %}{% else %}  - {{ fid }}
{% endif %}{% endfor %}{% else %}  (none)
{% endif %}{% endif %}{% if r.supersedes is defined %}Supersedes:
{% if r.supersedes | length > 0 %}{% for sid in r.supersedes %}{% if depth > 0 %}{% set loc = resolve(sid) %}{% if loc %}{{ render_recursive(loc, depth - 1) }}
{% else %}  - {{ sid }}
{% endif %}{% else %}  - {{ sid }}
{% endif %}{% endfor %}{% else %}  (none)
{% endif %}{% endif %}{% if r.superseded_by is defined and r.superseded_by %}Superseded by:
{% if depth > 0 %}{% set loc = resolve(r.superseded_by) %}{% if loc %}{{ render_recursive(loc, depth - 1) }}
{% else %}  - {{ r.superseded_by }}
{% endif %}{% else %}  - {{ r.superseded_by }}
{% endif %}{% endif %}{% endmacro %}

{#- Registry alias: kind `research` derives registry-default `render_research`,
    which is also the canonical Plan-7 macro name. Alias is included for
    symmetry with sibling Plan-7 macros and to make the registry contract
    explicit. -#}
{% macro render_researches(r, depth=0) %}{{ render_research(r, depth) }}{% endmacro %}
