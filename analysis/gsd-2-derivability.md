## gsd-2 vs platonic pi-project-workflows

### What gsd-2 is

gsd-2 is the successor to GSD-1: a "meta-prompting, context engineering, and spec-driven development system" for long-running autonomous coding agents. Its VISION.md declares it extension-first, simplicity-over-abstraction, tests-as-contract, ship-fast, provider-agnostic.

gsd-2 is NOT a pi extension — it is a **fork-and-absorb** of the pi ecosystem. It contains pi-ai, pi-coding-agent, pi-tui, and pi-agent-core as packages in its own monorepo, alongside gsd-specific infrastructure (daemon, mcp-server, native, rpc-client, studio, vscode-extension, web). It has ~2581 files and is a coding agent product, not a library.

### gsd-2's core planning concepts

A strict hierarchy: **Milestone → Slice → Task**
- Milestone = a shippable version (4–10 slices)
- Slice = one demoable vertical capability (1–7 tasks)
- Task = one context-window-sized unit of work

File state in `.gsd/`:
- `STATE.md` — dashboard, always read first (derived cache, gitignored)
- `DECISIONS.md` — append-only decisions register
- `CODEBASE.md` — generated codebase map
- `milestones/M###/` with `-ROADMAP`, `-CONTEXT`, `-RESEARCH`, `-SUMMARY` files
- `slices/S##/` with `-PLAN`, `-CONTEXT`, `-RESEARCH`, `-SUMMARY`, `-UAT`, `continue.md`
- `tasks/T##/` with `-PLAN`, `-SUMMARY`

State is markdown with checkbox parsing (`- [x]` done, `- [ ]` not done). Inline metadata tags (`risk:low`, `depends:[S01]`).

### gsd-2's runtime layers

**Extensions** (beyond pi-coding-agent's): async-jobs, bg-shell, browser-tools, claude-code-cli, cmux, github-sync, google-search, mac-tools, mcp-client, ollama, remote-questions, search-the-web, slash-commands, subagent, ttsr, voice, universal-config, **gsd** itself.

**The `gsd` extension** is the planning runtime. ~60+ TypeScript files including:
- `custom-workflow-engine.ts` + `dev-workflow-engine.ts` — **two workflow engines**
- `parallel-orchestrator.ts` + `slice-parallel-orchestrator.ts` — parallel execution
- `auto-*.ts` — 20+ files for autonomous behaviors: dispatch, budget, dashboard, recovery, timers, observability, verification, supervisor, worktree, post-unit, start, timeout-recovery, tool-tracking, unit-closeout
- `bootstrap/*.ts` — write-gate, tool-call-loop-guard, notify-interceptor, provider-error-resume, register-hooks

### Derivability test: what maps cleanly

| gsd-2 concept | platonic pi-project-workflows expression |
|---|---|
| Milestone schema | `.project/schemas/milestone.schema.json` |
| Slice schema | `.project/schemas/slice.schema.json` |
| Task schema | `.project/schemas/task.schema.json` |
| `M###-ROADMAP.md` | rendered view of `.project/milestones.json` via a macro |
| `DECISIONS.md` append-only | `.project/decisions.json` block (already exists) |
| `STATE.md` dashboard | `projectState()` SDK rendered to markdown |
| `CODEBASE.md` generated map | `.project/architecture.json` block populated by a code-analysis workflow |
| `M###-CONTEXT.md` / `S##-CONTEXT.md` | `contextBlocks` injection from scoped block subsets |
| `-SUMMARY.md` files | render workflow reading `verification` + `tasks` blocks |
| `-UAT.md` files | render workflow reading `verification` block |
| `continue.md` resume | our checkpoint/resume (`state.json` + run directories) |
| Milestone creation workflow | `.workflows/create-milestone.workflow.yaml` |
| Slice decomposition | `.workflows/decompose-slice.workflow.yaml` |
| Task execution | `.workflows/execute-task.workflow.yaml` with agent steps |
| Slice parallel execution | DAG parallelism in pi-workflows |
| Verification gates | `monitor:` step type with verifier agent |

All of this is straightforwardly derivable. gsd-2 has implemented a planning methodology by writing TypeScript; our platonic form expresses the same methodology as **schemas + YAML + agent specs**, with TypeScript being only the framework that reads those specs. The methodology is the content; the framework is outcome-agnostic.

### Derivability test: what maps but reveals our gaps

gsd-2's 20+ `auto-*.ts` files are the most interesting case. Each one is an autonomous behavior that runs alongside the main agent. In our platonic form, each becomes a monitor:

| gsd-2 auto file | platonic monitor/step |
|---|---|
| `auto-detect-stuck.ts` | stuck-detection monitor |
| `auto/loop.ts`, `tool-call-loop-guard.ts` | loop-detection monitor |
| `auto-budget.ts` | token-budget monitor |
| `auto-recovery.ts`, `auto-timeout-recovery.ts` | recovery workflows triggered by monitor FLAG verdicts |
| `auto-verification.ts` | `monitor:` step type (**our broken issue 042**) |
| `auto-dispatch.ts`, `auto-direct-dispatch.ts` | workflow step with agent routing |
| `auto-worktree.ts` | workflow step type for worktree creation |
| `auto-post-unit.ts`, `auto-unit-closeout.ts` | post-task workflows |
| `auto-dashboard.ts` | `projectState()` derived state rendering |
| `auto-observability.ts`, `auto-tool-tracking.ts` | execution trace debugger (**our issue 036**) |
| `write-gate.ts` | write-gating monitor |
| `provider-error-resume.ts` | workflow executor retry/resume policy |

gsd-2 has implemented each of these as imperative TypeScript. The platonic form expresses each as a monitor spec (`.monitor.json` + agent YAML) or a workflow step. But that expression requires our framework to have:

1. **Working monitor verification gates** (issue 042 blocks this)
2. **Execution trace debugger** (issue 036)
3. **Block write-back from agent steps** (issue 028)
4. **Writeback monitor** (issue 030)
5. **Scheduled workflow re-execution** (issue 031)
6. **Token budgeting across step boundaries** (latent gap from context-packet analysis)
7. **Per-monitor configurable collector parameters** (issue 035)
8. **Monitor tuning tools** (issue 038)
9. **SDK query for execution history** (issue 037)

Every one of these is in our open issues list. gsd-2 has built each capability directly in TypeScript because our framework does not yet provide it as a spec-driven primitive.

### Derivability test: layers adjacent to the framework

Nothing in gsd-2's orchestration layer is out of scope for pi-project-workflows. What varies is the *relationship* to the framework — content that runs on it, tools it consumes, or applications that consume it:

**Content that runs ON the framework** (derivable as schemas + workflows + agents + monitors):
- **Daemon orchestration logic** — the scheduled workflow execution, polling, and re-dispatch logic that the daemon hosts is derivable as scheduled workflows (issue-031). The daemon PROCESS (launchd plist, systemd unit, Docker entrypoint) is platform-specific hosting — it starts our workflow runner, not replaces it.
- **Discord bot** — a notification channel. Expressible as a monitor action (post to Discord on FLAG) or a `step-command` that calls a Discord webhook. The notification logic is content; the bot hosting is platform delivery.
- **Multi-provider model routing** — gsd-2's `auto-model-selection.ts` and capability-aware routing are derivable as dynamic model selection in agent specs. An agent spec's `model` field could resolve via expression (`model: ${{ registry.best(capability: "thinking", budget: "standard") }}`). The model registry lives in pi-ai; the dispatch decision is orchestration.
- **Provider-specific error recovery** — `provider-error-resume.ts` classifies errors into recoverable/not-recoverable. Expressible as a monitor that classifies errors combined with workflow executor retry policy.
- **CI/CD release workflows** — the release logic (version bump, build, test, publish, tag) IS a workflow. `scripts/release.mjs` in our own repo should itself be expressible as a `.workflow.yaml`. The GitHub Actions YAML is a platform-specific invocation wrapper.

**Tools that the framework CONSUMES** (available to workflow steps, not replaced by them):
- **Native performance package** — clipboard, diff, grep, glob, ast, gsd-parser. Workflow steps invoke these via `step-command` or subprocess dispatch. They are a tool layer workflows use.

**Applications that CONSUME the framework** (read `.project/`, `.workflows/`, call SDK):
- **Studio + vscode-extension + web** — UI surfaces that display and manipulate what the framework produces. The framework provides ALL the data they display via SDK queries and block reads. The hosting (VSCode extension API, browser runtime, Electron) is a separate application layer.

**User-rejected approaches** (not "out of scope" but decided against):
- **MCP server** — per `feedback_no_mcp.md`, the user has directed never to propose MCP as architecture or integration approach. The framework could express MCP integration but we do not build it because the user has decided against it.

### The honest assessment

**gsd-2's planning methodology IS derivable from platonic pi-project-workflows.** The milestone/slice/task hierarchy, context files, decisions register, codebase map, roadmaps, summaries, UAT scripts, parallel execution, and verification gates — all of it maps to schemas, workflows, agents, and monitors in our framework. The methodology is content; the framework runs the content.

**gsd-2's autonomous "auto mode" is ALSO derivable — but exposes every gap we know about.** The 20+ imperative TypeScript files for stuck detection, loop guards, budget tracking, recovery, verification, observability, dispatch, worktree management, and write gating are exactly what our monitor + workflow layer is supposed to produce from spec files. We cannot derive them today because our monitors are partially broken (issue 042), our debugger doesn't exist (issue 036), our write-back mechanism is absent (issue 028, 030), and our token budgeting is latent.

**gsd-2 has built, in imperative code, the things our platonic form would build in declarative specs.** That is the precise sense in which gsd-2 should be derivable from pi-project-workflows: when the framework is complete, each `auto-*.ts` file collapses into a monitor spec or workflow step, each `M###-ROADMAP.md` template collapses into a block render macro, each workflow engine variant collapses into the single workflow executor. The methodology survives; the imperative code evaporates.

**The implication for our roadmap:** every open issue in our framework that gsd-2 has worked around with imperative code is a proof that the issue is real and load-bearing. The list above is not an abstract wishlist — it is the exact set of capabilities gsd-2 demonstrates are necessary for autonomous long-running coding work. Closing those issues would make gsd-2 re-expressible as a pi-project-workflows project.

gsd-2 has two workflow engines (`custom-workflow-engine.ts` and `dev-workflow-engine.ts`) because they tried to build the framework inside their application. Our platonic form is what that framework should have been.