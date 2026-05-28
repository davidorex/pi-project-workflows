# @davidorex/pi-project-workflows

Convenience meta-package that re-exports FOUR [Pi](https://github.com/badlogic/pi-mono) extensions plus the shared pi-jit-agents library. The four: pi-context (substrate), pi-workflows (orchestration), pi-behavior-monitors (classification/steering), pi-agent-dispatch (in-pi agent-as-tool dispatch + capability composition + the bounded north-star work-order loop). pi-jit-agents is a library consumed directly by pi-workflows and pi-agent-dispatch (no separate extension registration).

## Install

```bash
pi install npm:@davidorex/pi-project-workflows
```

This installs the five constituent packages (four Pi extensions plus the shared library):
- **[@davidorex/pi-context](https://github.com/davidorex/pi-project-workflows/tree/main/packages/pi-context)** — schema-driven project state (typed blocks, validation, derived state)
- **[@davidorex/pi-jit-agents](https://github.com/davidorex/pi-project-workflows/tree/main/packages/pi-jit-agents)** — agent spec compilation and in-process dispatch runtime (library, not a Pi extension)
- **[@davidorex/pi-workflows](https://github.com/davidorex/pi-project-workflows/tree/main/packages/pi-workflows)** — workflow orchestration (YAML specs, DAG execution, checkpoint/resume)
- **[@davidorex/pi-behavior-monitors](https://github.com/davidorex/pi-project-workflows/tree/main/packages/pi-behavior-monitors)** — behavior monitors (autonomous watchdogs, pattern classification, steering corrections)
- **[@davidorex/pi-agent-dispatch](https://github.com/davidorex/pi-project-workflows/tree/main/packages/pi-agent-dispatch)** — in-pi agent-as-tool dispatch + capability composition + bounded work-order loop (call-agent / author-agent-spec / run-real-checks / commit-attested / author-tool-grant / run-work-order-loop; dynamic composite-loader)

## Getting Started

```
/context init <substrate-dir>   # create the empty substrate skeleton (pointer + dirs only; no config/schemas/blocks)
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
- [pi-agent-dispatch README](https://github.com/davidorex/pi-project-workflows/tree/main/packages/pi-agent-dispatch)
