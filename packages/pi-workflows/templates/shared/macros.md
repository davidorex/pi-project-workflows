{#- Block rendering macros — one per schema with agent prompt use cases.
    Import via: {% from "shared/macros.md" import render_project, render_architecture %}
    Each macro: null guard, markdown heading, field rendering. Missing data renders nothing. -#}

{% macro render_project(data) %}
{% if data %}
## Project
**{{ data.name }}** — {{ data.description }}
{% if data.core_value %}Core value: {{ data.core_value }}{% endif %}
{% if data.vision %}
Vision: {{ data.vision }}{% endif %}
{% if data.status %}Status: {{ data.status }}{% endif %}
{% if data.target_users %}
Target users: {{ data.target_users | join(", ") }}{% endif %}
{% if data.constraints %}
### Constraints
{% for c in data.constraints %}- [{{ c.type }}] {{ c.description }}
{% endfor %}{% endif %}
{% if data.scope_boundaries %}
### Scope
**In:** {% for s in data.scope_boundaries.in %}{{ s }}{% if not loop.last %}, {% endif %}{% endfor %}

**Out:** {% for s in data.scope_boundaries.out %}{{ s }}{% if not loop.last %}, {% endif %}{% endfor %}
{% endif %}
{% if data.goals %}
### Goals
{% for g in data.goals %}- **{{ g.id }}**: {{ g.description }}{% if g.success_criteria %} — criteria: {{ g.success_criteria | join("; ") }}{% endif %}
{% endfor %}{% endif %}
{% endif %}
{% endmacro %}

{% macro render_architecture(data) %}
{% if data %}
## Architecture
{% if data.overview %}{{ data.overview }}
{% endif %}
{% if data.modules %}
### Modules
{% for m in data.modules %}- **{{ m.name }}** (`{{ m.file }}`{% if m.lines %}, {{ m.lines }} lines{% endif %}): {{ m.responsibility }}{% if m.dependencies %} — deps: {{ m.dependencies | join(", ") }}{% endif %}
{% endfor %}{% endif %}
{% if data.patterns %}
### Patterns
{% for p in data.patterns %}- **{{ p.name }}**: {{ p.description }}{% if p.used_in %} — used in: {{ p.used_in | join(", ") }}{% endif %}
{% endfor %}{% endif %}
{% if data.boundaries %}
### Boundaries
{% for b in data.boundaries %}- {{ b }}
{% endfor %}{% endif %}
{% endif %}
{% endmacro %}

{% macro render_requirements(data) %}
{% if data and data.requirements and data.requirements | length > 0 %}
## Requirements
{% for r in data.requirements %}- **{{ r.id }}** [{{ r.priority }}] ({{ r.type }}, {{ r.status }}): {{ r.description }}{% if r.acceptance_criteria %}
  Criteria: {{ r.acceptance_criteria | join("; ") }}{% endif %}
{% endfor %}
{% endif %}
{% endmacro %}

{% macro render_conformance(data) %}
{% if data and data.principles %}
## Conformance Reference
{% if data.name %}**{{ data.name }}**{% endif %}
{% for p in data.principles %}
### {{ p.id }}: {{ p.name }}
{% if p.description %}{{ p.description }}{% endif %}
{% for r in p.rules %}- **{{ r.id }}**: {{ r.rule }}{% if r.severity %} [{{ r.severity }}]{% endif %}{% if r.check_method %} — check: {{ r.check_method }}{% endif %}
{% if r.anti_patterns %}  Anti-patterns: {{ r.anti_patterns | join("; ") }}
{% endif %}{% endfor %}
{% endfor %}
{% endif %}
{% endmacro %}

{% macro render_domain(data) %}
{% if data and data.entries %}
## Domain Knowledge
{% for e in data.entries %}- **{{ e.id }}** [{{ e.category }}]: {{ e.title }}
  {{ e.content }}{% if e.tags %} — tags: {{ e.tags | join(", ") }}{% endif %}
{% endfor %}
{% endif %}
{% endmacro %}

{% macro render_decisions(data) %}
{% if data and data.decisions %}
## Decisions
{% for d in data.decisions %}- **{{ d.id }}** ({{ d.status }}): {{ d.decision }}
  Rationale: {{ d.rationale }}{% if d.context %} — context: {{ d.context }}{% endif %}
{% endfor %}
{% endif %}
{% endmacro %}

{% macro render_tasks(data) %}
{% if data and data.tasks %}
## Tasks
{% for t in data.tasks %}- **{{ t.id }}** [{{ t.status }}]: {{ t.description }}{% if t.phase %} (phase {{ t.phase }}){% endif %}{% if t.files %} — files: {{ t.files | join(", ") }}{% endif %}
{% endfor %}
{% endif %}
{% endmacro %}

{% macro render_issues(data) %}
{% if data and data.issues %}
## Issues
{% for i in data.issues %}- **{{ i.id }}** [{{ i.priority }}, {{ i.status }}]: {{ i.title }}
  {{ i.body }}{% if i.location %} — {{ i.location }}{% endif %}{% if i.package %} ({{ i.package }}){% endif %}
{% endfor %}
{% endif %}
{% endmacro %}

{% macro render_exploration(exploration) %}
{% if exploration %}
{% if exploration.files is defined %}
## Prior Exploration
{% for file in exploration.files %}- `{{ file.path }}` ({{ file.lines | default("?") }} lines){% if file.exports %}: {{ file.exports | length }} exports{% endif %}
{% endfor %}{% endif %}
{% if exploration.types is defined %}
### Known Types
{% for t in exploration.types %}- `{{ t.name }}` ({{ t.kind }}) in `{{ t.file }}`
{% endfor %}{% endif %}
{% endif %}
{% endmacro %}

{% macro render_exploration_full(exploration) %}
{% if exploration %}
{% if exploration.files is defined %}
### Files{% if exploration.files | length > 20 %} ({{ exploration.files | length }} total){% endif %}
{% for file in exploration.files %}- `{{ file.path }}` ({{ file.language | default("unknown") }}, {{ file.lines | default("?") }} lines){% if file.exports %} — {{ file.exports | length }} exports{% endif %}
{% endfor %}{% endif %}
{% if exploration.types is defined %}
### Types
{% for t in exploration.types %}- `{{ t.name }}` ({{ t.kind }}) in `{{ t.file }}`
{% endfor %}{% endif %}
{% if exploration.dependencies is defined %}
### Dependencies
{% for d in exploration.dependencies %}- `{{ d.from }}` → `{{ d.to }}` ({{ d.type | default("import") }})
{% endfor %}{% endif %}
{% if exploration.entryPoints is defined %}
### Entry Points
{% for ep in exploration.entryPoints %}- `{{ ep }}`
{% endfor %}{% endif %}
{% endif %}
{% endmacro %}

{% macro render_gap(gap) %}
{% if gap %}
**ID:** {{ gap.id }}
**Description:** {{ gap.description }}
**Category:** {{ gap.category | default("unspecified") }}
**Priority:** {{ gap.priority | default("unspecified") }}
{% if gap.details %}**Details:** {{ gap.details }}{% endif %}
{% endif %}
{% endmacro %}
