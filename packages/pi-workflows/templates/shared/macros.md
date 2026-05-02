{#- Block rendering macros — whole-block forms as derived views over per-item macros.

    Plan 8 (Wave 4) refactor: each whole-block macro that has a per-item sibling
    in templates/items/<kind>.md now delegates to that per-item macro by mapping
    over the items array. Per-item macros own field rendering; whole-block macros
    own the surrounding heading and the null/empty guard.

    Imports for downstream consumers (unchanged signatures):
        {% from "shared/macros.md" import render_project, render_architecture,
                                          render_requirements, render_conformance,
                                          render_domain, render_tasks, render_issues,
                                          render_conventions,
                                          render_exploration, render_exploration_full %}

    Each macro:
      - null/empty guard up front so "absent block" emits nothing,
      - markdown heading once,
      - delegation loop calling the per-item macro per item.

    Retired in Plan 8:
      - render_decisions(data) — legacy whole-block decisions macro deleted.
        The new lifecycle decisions block has its own per-item macro
        (templates/items/decisions.md ships render_decision + alias
        render_decisions). The legacy macro rendered fields (decision,
        rationale) that no longer match the current decisions.schema.json.
      - render_gap(gap) — legacy single-item validation-concept macro deleted.
        The framework-gaps.json block uses Plan 7's render_framework_gap in
        templates/items/framework-gaps.md.

    Retained as-is:
      - render_exploration(exploration) and render_exploration_full(exploration)
        are workflow-step output formatters (rendering exploration payloads
        emitted by exploration agents), not project-block renderers. They do
        not fit the per-item refactor pattern and stay unchanged. -#}

{% from "items/project.md" import render_project_item %}
{% macro render_project(data) %}
{% if data %}{{ render_project_item(data) }}{% endif %}
{% endmacro %}

{% from "items/architecture.md" import render_architecture_item %}
{% macro render_architecture(data) %}
{% if data %}{{ render_architecture_item(data) }}{% endif %}
{% endmacro %}

{% from "items/requirements.md" import render_requirement %}
{% macro render_requirements(data) %}
{% if data and data.requirements and data.requirements | length > 0 %}
## Requirements
{% for req in data.requirements %}{{ render_requirement(req) }}{% endfor %}
{% endif %}
{% endmacro %}

{% from "items/conformance.md" import render_conformance_principle %}
{% macro render_conformance(data) %}
{% if data and data.principles %}
## Conformance Reference
{% if data.name %}**{{ data.name }}**{% endif %}
{% for p in data.principles %}{{ render_conformance_principle(p) }}{% endfor %}
{% endif %}
{% endmacro %}

{% from "items/domain.md" import render_domain_entry %}
{% macro render_domain(data) %}
{% if data and data.entries %}
## Domain Knowledge
{% for e in data.entries %}{{ render_domain_entry(e) }}{% endfor %}
{% endif %}
{% endmacro %}

{% from "items/tasks.md" import render_task %}
{% macro render_tasks(data) %}
{% if data and data.tasks %}
## Tasks
{% for t in data.tasks %}{{ render_task(t) }}{% endfor %}
{% endif %}
{% endmacro %}

{% from "items/issues.md" import render_issue %}
{% macro render_issues(data) %}
{% if data and data.issues %}
## Issues
{% for i in data.issues %}{{ render_issue(i) }}{% endfor %}
{% endif %}
{% endmacro %}

{#- Authored fresh in Plan 8: render_conventions did not previously exist in
    macros.md despite README references implying it did. The block-level
    header surfaces test_conventions, lint_command, and lint_scope (all
    optional) before iterating rules through render_convention.

    Block schema: .project/schemas/conventions.schema.json. Required: rules.
    Optional: test_conventions { runner_command, file_pattern }, lint_command,
    lint_scope. -#}
{% from "items/conventions.md" import render_convention %}
{% macro render_conventions(data) %}
{% if data and data.rules %}
## Conventions
{% if data.test_conventions %}
**Tests:** `{{ data.test_conventions.runner_command }}` (pattern: `{{ data.test_conventions.file_pattern }}`)
{% endif %}{% if data.lint_command %}**Lint:** `{{ data.lint_command }}`{% if data.lint_scope %} (scope: {{ data.lint_scope }}){% endif %}
{% endif %}
{% for rule in data.rules %}{{ render_convention(rule) }}{% endfor %}
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
