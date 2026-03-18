# @davidorex/pi-project-workflows

> Pi extensions for structured project state, workflow orchestration, and behavior monitoring — single install for all three

This meta-package re-exports all three extensions. Install once to get everything:

```
pi install npm:@davidorex/pi-project-workflows
```

## Included Extensions

### @davidorex/pi-project

Schema-driven project state management for Pi

**Tools:** `append-block-item`, `update-block-item`, `read-block`, `write-block`, `project-status`, `project-validate`, `project-init`
**Commands:** `/project`

See full skill: [pi-project/SKILL.md](../packages/pi-project/../skills/pi-project/SKILL.md)

### @davidorex/pi-workflows

Workflow orchestration extension for Pi

**Tools:** `workflow`, `workflow-list`, `workflow-agents`, `workflow-validate`, `workflow-status`, `workflow-init`
**Commands:** `/workflow`
**Shortcuts:** ctrl+h (Pause running workflow), ctrl+j (Resume paused workflow)

See full skill: [pi-workflows/SKILL.md](../packages/pi-workflows/../skills/pi-workflows/SKILL.md)

### @davidorex/pi-behavior-monitors

Behavior monitors for pi that watch agent activity and steer corrections

**Tools:** `monitors-status`, `monitors-inspect`, `monitors-control`, `monitors-rules`, `monitors-patterns`
**Commands:** `/monitors`

See full skill: [pi-behavior-monitors/SKILL.md](../packages/pi-behavior-monitors/../skills/pi-behavior-monitors/SKILL.md)

---

*Generated from source by `scripts/generate-skills.js` — do not edit by hand.*
