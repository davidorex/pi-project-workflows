---
name: pi-project-workflows
description: >
  Meta-package re-exporting pi-project (schema-driven project state),
  pi-workflows (workflow orchestration), and pi-behavior-monitors (autonomous
  behavior monitoring). Install once to get all three extensions.
---

<objective>
This meta-package re-exports all three extensions. Install once to get everything:

```
pi install npm:@davidorex/pi-project-workflows
```
</objective>

<included_extensions>
<extension name="@davidorex/pi-project">
Schema-driven project state management for Pi

**Tools:** `append-block-item`, `update-block-item`, `append-block-nested-item`, `update-block-nested-item`, `remove-block-item`, `remove-block-nested-item`, `read-block-dir`, `read-block`, `write-block`, `project-status`, `project-validate`, `project-init`, `resolve-item-by-id`, `complete-task`, `project-validate-relations`, `project-edges-for-lens`, `project-walk-descendants`
**Commands:** `/project`
</extension>

<extension name="@davidorex/pi-workflows">
Workflow orchestration extension for Pi

**Tools:** `workflow`, `workflow-list`, `workflow-agents`, `workflow-validate`, `workflow-status`, `workflow-init`, `render-item-by-id`, `enforce-budget`
**Commands:** `/workflow`
**Shortcuts:** ctrl+h (Pause running workflow), ctrl+j (Resume paused workflow)
</extension>

<extension name="@davidorex/pi-behavior-monitors">
Behavior monitors for pi that watch agent activity and steer corrections

**Tools:** `monitors-status`, `monitors-inspect`, `monitors-control`, `monitors-rules`, `monitors-patterns`
**Commands:** `/work-quality`, `/monitors`
</extension>

</included_extensions>

*Generated from source by `scripts/generate-skills.js` — do not edit by hand.*
