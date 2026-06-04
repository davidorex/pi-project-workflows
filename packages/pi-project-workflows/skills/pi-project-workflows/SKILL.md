---
name: pi-project-workflows
description: >
  Meta-package re-exporting pi-context (schema-driven project state),
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
<extension name="@davidorex/pi-context">
Schema-driven project state management for Pi

**Tools:** `append-block-item`, `update-block-item`, `append-relation`, `remove-relation`, `replace-relation`, `append-relations`, `upsert-block-item`, `promote-item`, `append-block-nested-item`, `update-block-nested-item`, `remove-block-item`, `remove-block-nested-item`, `read-block-dir`, `read-block`, `write-block`, `context-status`, `context-validate`, `read-config`, `list-tools`, `read-samples-catalog`, `context-current-state`, `context-bootstrap-state`, `rename-canonical-id`, `amend-config`, `read-schema`, `write-schema`, `write-schema-migration`, `context-init`, `context-accept-all`, `context-switch`, `context-list`, `context-archive`, `filter-block-items`, `resolve-item-by-id`, `read-block-item`, `read-block-page`, `join-blocks`, `resolve-items-by-id`, `complete-task`, `context-validate-relations`, `context-edges-for-lens`, `context-walk-descendants`, `walk-ancestors`, `find-references`, `gather-execution-context`, `context-roadmap-load`, `context-roadmap-render`, `context-roadmap-validate`, `context-roadmap-list`
**Commands:** `/context`
</extension>

<extension name="@davidorex/pi-workflows">
Workflow orchestration extension for Pi

**Tools:** `workflow-execute`, `workflow-resume`, `workflow-list`, `workflow-agents`, `workflow-validate`, `workflow-status`, `workflow-init`, `render-item-by-id`, `enforce-budget`
**Commands:** `/workflow`
**Shortcuts:** ctrl+h (Pause running workflow), ctrl+j (Resume paused workflow)
</extension>

<extension name="@davidorex/pi-behavior-monitors">
Behavior monitors for pi that watch agent activity and steer corrections

**Tools:** `monitors-status`, `monitors-inspect`, `monitors-control`, `monitors-rules`, `monitors-patterns`
**Commands:** `/work-quality`, `/monitors`
</extension>

<extension name="@davidorex/pi-agent-dispatch">
In-pi agent-as-tool dispatch + capability composition extension

**Tools:** `author-agent-spec`, `call-agent`, `run-real-checks`, `commit-attested`, `author-tool-grant`, `run-work-order-loop`
</extension>

</included_extensions>

*Generated from source by `scripts/generate-skills.js` — do not edit by hand.*
