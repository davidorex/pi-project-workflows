# @davidorex/pi-project-workflows

Convenience meta-package that re-exports three [Pi](https://github.com/badlogic/pi-mono) extensions plus a shared agent-runtime library — structured project state, workflow orchestration, behavior monitoring, and agent spec compilation — in a single install.

## Install

```bash
pi install npm:@davidorex/pi-project-workflows
```

This installs the four constituent packages:
- **[@davidorex/pi-context](https://github.com/davidorex/pi-project-workflows/tree/main/packages/pi-context)** — schema-driven project state (typed blocks, validation, derived state)
- **[@davidorex/pi-jit-agents](https://github.com/davidorex/pi-project-workflows/tree/main/packages/pi-jit-agents)** — agent spec compilation and in-process dispatch runtime (library, not a Pi extension)
- **[@davidorex/pi-workflows](https://github.com/davidorex/pi-project-workflows/tree/main/packages/pi-workflows)** — workflow orchestration (YAML specs, DAG execution, checkpoint/resume)
- **[@davidorex/pi-behavior-monitors](https://github.com/davidorex/pi-project-workflows/tree/main/packages/pi-behavior-monitors)** — behavior monitors (autonomous watchdogs, pattern classification, steering corrections)

## Getting Started

```
/context init     # scaffolds .project/ with schemas and starter blocks
/workflow init    # scaffolds .workflows/ for run state
/context status   # see derived project state
/workflow list    # discover and run workflows
/monitors         # list all monitors, scope, and state
```

## Documentation

See the package READMEs for full API docs, source maps, and LLM guidance:
- [pi-context README](https://github.com/davidorex/pi-project-workflows/tree/main/packages/pi-context)
- [pi-jit-agents README](https://github.com/davidorex/pi-project-workflows/tree/main/packages/pi-jit-agents)
- [pi-workflows README](https://github.com/davidorex/pi-project-workflows/tree/main/packages/pi-workflows)
- [pi-behavior-monitors README](https://github.com/davidorex/pi-project-workflows/tree/main/packages/pi-behavior-monitors)
