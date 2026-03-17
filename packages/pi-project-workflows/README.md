# @davidorex/pi-project-workflows

Convenience meta-package that re-exports all three [Pi](https://github.com/badlogic/pi-mono) extensions — structured project state, workflow orchestration, and behavior monitoring — in a single install.

## Install

```bash
pi install npm:@davidorex/pi-project-workflows
```

This installs all three extensions:
- **[@davidorex/pi-project](https://github.com/davidorex/pi-project-workflows/tree/main/packages/pi-project)** — schema-driven project state (typed blocks, validation, derived state)
- **[@davidorex/pi-workflows](https://github.com/davidorex/pi-project-workflows/tree/main/packages/pi-workflows)** — workflow orchestration (YAML specs, DAG execution, checkpoint/resume)
- **[@davidorex/pi-behavior-monitors](https://github.com/davidorex/pi-project-workflows/tree/main/packages/pi-behavior-monitors)** — behavior monitors (autonomous watchdogs, pattern classification, steering corrections)

## Getting Started

```
/project init     # scaffolds .project/ with schemas and starter blocks
/workflow init    # scaffolds .workflows/ for run state
/project status   # see derived project state
/workflow list    # discover and run workflows
/monitors         # list all monitors, scope, and state
```

## Documentation

See the package READMEs for full API docs, source maps, and LLM guidance:
- [pi-project README](https://github.com/davidorex/pi-project-workflows/tree/main/packages/pi-project)
- [pi-workflows README](https://github.com/davidorex/pi-project-workflows/tree/main/packages/pi-workflows)
- [pi-behavior-monitors README](https://github.com/davidorex/pi-project-workflows/tree/main/packages/pi-behavior-monitors)
