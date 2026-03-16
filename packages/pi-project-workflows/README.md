# @davidorex/pi-project-workflows

One-command install for both [Pi](https://github.com/badlogic/pi-mono) extensions: structured project state management and workflow orchestration.

## Install

```bash
pi install npm:@davidorex/pi-project-workflows
```

This installs both extensions:
- **[@davidorex/pi-project](https://github.com/davidorex/pi-project-workflows/tree/main/packages/pi-project)** — schema-driven project state (typed blocks, validation, derived state)
- **[@davidorex/pi-workflows](https://github.com/davidorex/pi-project-workflows/tree/main/packages/pi-workflows)** — workflow orchestration (YAML specs, DAG execution, checkpoint/resume)

## Getting Started

```
/project init     # scaffolds .project/ with schemas and starter blocks
/workflow init    # scaffolds .workflows/ for run state
/project status   # see derived project state
/workflow list    # discover and run workflows
```

## Documentation

See the package READMEs for full API docs, source maps, and LLM guidance:
- [pi-project README](https://github.com/davidorex/pi-project-workflows/tree/main/packages/pi-project)
- [pi-workflows README](https://github.com/davidorex/pi-project-workflows/tree/main/packages/pi-workflows)
