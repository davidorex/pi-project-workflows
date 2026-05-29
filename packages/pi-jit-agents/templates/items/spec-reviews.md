{#-
  Per-item macro for the `spec-reviews` block.

  Block schema: .project/schemas/spec-reviews.schema.json (Plan 7 / per-item-macros wave 4).

  Findings:
    Each review carries an embedded findings registry (definitions/finding
    in the schema). Findings are rendered inline as a sub-list under the
    review body — they are not block items in their own right and have no
    per-item macro of their own. Each finding's `produces_decision` (when
    present and depth > 0) recurses into the decisions block via
    resolve/render_recursive — that pattern stays inline because it has a
    deeper indent (4 spaces) than the helper convention assumes and is
    embedded in a finding-iteration loop rather than a top-level field.
    `related_findings` on a finding refer to sibling findings within the
    same review by their string ids; they are emitted as bare IDs (no
    recursion — finding IDs are scoped to the review and not in the global
    ID index).

  Optional review-level scalars (target_revision, reviewer, completed_at,
  clean) and the method body delegate to shared/render-helpers.md
  render_optional_scalar where the shape matches.
-#}
{% from "shared/render-helpers.md" import render_optional_scalar %}

{% macro render_spec_review(rev, depth=0) %}
ID: {{ rev.id }}
Target: {{ rev.target }}
Status: {{ rev.status }}
Created by: {{ rev.created_by }}
Created at: {{ rev.created_at }}
{{ render_optional_scalar("Target revision", rev.target_revision) }}{{ render_optional_scalar("Reviewer", rev.reviewer) }}{{ render_optional_scalar("Completed at", rev.completed_at) }}{% if rev.clean is defined %}Clean: {{ rev.clean }}
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
