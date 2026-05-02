{#- Block rendering macros — whole-block forms as derived views over per-item macros.

    Plan 8 (Wave 4) refactor: each whole-block macro that has a per-item sibling
    in templates/items/<kind>.md delegates to that per-item macro by mapping
    over the items array. Per-item macros own field rendering; whole-block macros
    own the surrounding heading and the null/empty guard.

    v0.24.2 follow-up (Item 3 of 2026-05-02 residual-debt patch): the
    repeated `{% if data and data.<key> [and data.<key> | length > 0] %}` +
    `## <Heading>` + `{% for x in data.<key> %}{{ render_<kind>_item(x) }}
    {% endfor %}` shape that previously lived inline in render_requirements,
    render_domain, render_tasks, and render_issues now routes through the
    `render_whole_block_truthy` / `render_whole_block_nonempty` scaffolds in
    shared/render-helpers.md. The guard / heading / loop chassis lives once
    in render-helpers; each whole-block macro here is the per-kind binding
    (heading text, items slice, per-item macro inside the `{% call %}` body).
    Output stays byte-identical to the prior inline shape — the two
    truthy-vs-nonempty helpers preserve the empty-array surface each
    delegator originally shipped (tasks/issues/domain emit `## <Heading>`
    with empty array; requirements emits nothing — both regimes are kept
    explicitly so existing consumers see no diff).

    Imports for downstream consumers (unchanged signatures):
        {% from "shared/macros.md" import render_project, render_architecture,
                                          render_requirements, render_conformance,
                                          render_domain, render_tasks, render_issues,
                                          render_conventions,
                                          render_exploration, render_exploration_full %}

    Each macro:
      - null/empty guard via the helper or local conditional,
      - markdown heading (via the helper for list kinds; inline for the
        singletons and the heading-bearing block-level shapes),
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

{% from "shared/render-helpers.md" import render_whole_block_truthy, render_whole_block_nonempty %}

{% from "items/project.md" import render_project_item %}
{% macro render_project(data) %}
{% if data %}{{ render_project_item(data) }}{% endif %}
{% endmacro %}

{% from "items/architecture.md" import render_architecture_item %}
{% macro render_architecture(data) %}
{% if data %}{{ render_architecture_item(data) }}{% endif %}
{% endmacro %}

{% from "items/requirements.md" import render_requirement %}
{% macro render_requirements(data) %}{% call(req) render_whole_block_nonempty("Requirements", data.requirements if data else None) %}{{ render_requirement(req) }}{% endcall %}{% endmacro %}

{% from "items/conformance.md" import render_conformance_principle %}
{% macro render_conformance(data) %}
{% if data and data.principles %}
## Conformance Reference
{% if data.name %}**{{ data.name }}**{% endif %}
{% for p in data.principles %}{{ render_conformance_principle(p) }}{% endfor %}
{% endif %}
{% endmacro %}

{% from "items/domain.md" import render_domain_entry %}
{% macro render_domain(data) %}{% call(e) render_whole_block_truthy("Domain Knowledge", data.entries if data else None) %}{{ render_domain_entry(e) }}{% endcall %}{% endmacro %}

{% from "items/tasks.md" import render_task %}
{% macro render_tasks(data) %}{% call(t) render_whole_block_truthy("Tasks", data.tasks if data else None) %}{{ render_task(t) }}{% endcall %}{% endmacro %}

{% from "items/issues.md" import render_issue %}
{% macro render_issues(data) %}{% call(i) render_whole_block_truthy("Issues", data.issues if data else None) %}{{ render_issue(i) }}{% endcall %}{% endmacro %}

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
