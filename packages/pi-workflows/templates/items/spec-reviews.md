{#-
  Per-item macro for the `spec-reviews` block.

  Block schema: .project/schemas/spec-reviews.schema.json (Plan 7 / per-item-macros wave 4).

  Macro signature:
    render_spec_review(rev, depth=0)
      rev   — single review object matching .reviews[*] in the schema
      depth — integer recursion budget for cross-block reference inlining

  Depth contract (mirrors render_decision):
    depth <= 0 — emit bare ID strings for cross-block references
                 (each finding's `produces_decision` is the only ID-bearing
                 cross-reference field on this block); the `target` field is
                 a doc path, NOT an ID, so it is always rendered as text.
    depth >  0 — call resolve(id) to look up the referenced item; on hit,
                 render_recursive(loc, depth - 1) inlines via the registry;
                 on miss, fall back to bare ID text.

  resolve(id) and render_recursive(loc, depth) are Nunjucks globals registered
  by compileAgent in @davidorex/pi-jit-agents. NOT imported here — ambient on
  the Environment. Cycles → `[cycle: <id>]`; missing kind macros →
  `[unrendered: <kind>/<id>]`. Documented fallbacks, not failures.

  Empty-array convention:
    Optional arrays render the field label with `(none)` rather than omitting
    the line, when present-but-empty. Absent fields (undefined) render nothing.

  Findings:
    Each review carries an embedded findings registry (definitions/finding in
    the schema). Findings are rendered inline as a sub-list under the review
    body — they are not block items in their own right and have no per-item
    macro of their own. Each finding's `produces_decision` (when present and
    depth > 0) does recurse into the decisions block via resolve/render_recursive.
    `related_findings` on a finding refer to sibling findings within the same
    review by their string ids; they are emitted as bare IDs (no recursion —
    finding IDs are scoped to the review and not in the global ID index).

  Registry alias:
    The renderer-registry derives macro names by prefixing the block kind with
    `render_` (so `spec-reviews` → `render_spec_reviews` after hyphen→underscore).
    The canonical Plan-7 name is `render_spec_review` (singular). The alias
    `render_spec_reviews(rev, depth=0)` at the bottom bridges the two so that
    `render_recursive(loc, depth)` works when loc.block === "spec-reviews".
-#}

{% macro render_spec_review(rev, depth=0) %}
ID: {{ rev.id }}
Target: {{ rev.target }}
Status: {{ rev.status }}
Created by: {{ rev.created_by }}
Created at: {{ rev.created_at }}
{% if rev.target_revision %}Target revision: {{ rev.target_revision }}
{% endif %}{% if rev.reviewer %}Reviewer: {{ rev.reviewer }}
{% endif %}{% if rev.completed_at %}Completed at: {{ rev.completed_at }}
{% endif %}{% if rev.clean is defined %}Clean: {{ rev.clean }}
{% endif %}{% if rev.method %}Method:
{{ enforceBudget(rev.method, "spec-reviews", "reviews.items.method") }}

{% endif %}{% if rev.scope is defined %}Scope:
{% if rev.scope | length > 0 %}{% for s in rev.scope %}  - {{ s }}
{% endfor %}{% else %}  (none)
{% endif %}{% endif %}Findings:
{% if rev.findings and rev.findings | length > 0 %}{% for f in rev.findings %}  - {{ f.id }} [{{ f.severity }}/{{ f.category }}/{{ f.state }}] reporter={{ f.reporter }} at={{ f.created_at }}
    Description: {{ enforceBudget(f.description, "spec-reviews", "reviews.items.findings.items.description") }}
{% if f.evidence %}    Evidence: {{ f.evidence }}
{% endif %}{% if f.location %}    Location: {{ f.location }}
{% endif %}{% if f.resolution %}    Resolution: {{ f.resolution }}
{% endif %}{% if f.resolved_by %}    Resolved by: {{ f.resolved_by }}
{% endif %}{% if f.resolved_at %}    Resolved at: {{ f.resolved_at }}
{% endif %}{% if f.produces_decision %}    Produces decision: {% if depth > 0 %}{% set loc = resolve(f.produces_decision) %}{% if loc %}
{{ render_recursive(loc, depth - 1) }}{% else %}{{ f.produces_decision }}{% endif %}{% else %}{{ f.produces_decision }}{% endif %}
{% endif %}{% if f.related_findings is defined %}    Related findings: {% if f.related_findings | length > 0 %}{% for rf in f.related_findings %}{{ rf }}{% if not loop.last %}, {% endif %}{% endfor %}{% else %}(none){% endif %}
{% endif %}{% endfor %}{% else %}  (none)
{% endif %}{% endmacro %}

{#- Registry alias: bridges registry default name (`render_spec_reviews`,
    derived from `spec-reviews` with hyphens→underscores) to the canonical
    Plan-7 macro name `render_spec_review` (singular). Keeps render_recursive
    working when loc.block === "spec-reviews". -#}
{% macro render_spec_reviews(rev, depth=0) %}{{ render_spec_review(rev, depth) }}{% endmacro %}
