## Gap to Investigate

**ID:** {{ gap.id }}
**Description:** {{ gap.description }}
**Category:** {{ gap.category }}
**Priority:** {{ gap.priority }}
{% if gap.details %}
**Details:** {{ gap.details }}
{% endif %}

## Instructions

1. Read the files referenced in or related to this gap
2. Understand the current behavior and what needs to change
3. Identify all affected files and their roles
4. List constraints the solution must respect (existing tests, interfaces, conventions)
5. Assess risks — what could break, edge cases, regression concerns
6. Determine if this gap requires external research (knowledge beyond codebase analysis and your training data) — if so, formulate specific research questions
7. Estimate complexity: low (single file, mechanical change), medium (multiple files, design decisions), high (architectural change, new subsystems)

## Output

Produce JSON conforming to the investigation-findings schema. Do not produce a plan or implementation — only findings.
