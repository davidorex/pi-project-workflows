# pi-workflows runner — design support (for plan → explore → impl → adversarial audit)

**Purpose.** Durable, code-grounded support for building a Claude-Code-invokable
runner for pi-workflows — the "no turnkey runner" gap that
`WORKSHOPPING-WORKFLOW-SPEC.md` §1 records. This document captures the exact
findings (with file:line citations) from two read-only investigations so a
later pipeline — **plan mode → explore → write plan → impl → adversarially
audit** — can proceed from evidence rather than re-derive it. It is not a build
authorization; it is the evidence base + recommended shape + the explicit
attack surface for the audit.

**Provenance.** (1) The empirical runtime verification that RAN pi-workflows —
`WORKSHOPPING-WORKFLOW-RUNTIME-VERIFICATION.md` (the ~40-line tsx PoC driver +
A0–A7). (2) A model-analysis pass: to what extent the pi-context orchestration
scripts / `pi-context-cli` model a pi-workflows runner. Both are read-only and
cite real source; every line number below is from that source and **must be
re-confirmed in the explore phase** (the pi extension monorepo is being
finished — code may have moved).

---

## 1. The gap

- pi-workflows is a **library**: `packages/pi-workflows/package.json` has
  `main: ./dist/index.js` and **no `bin`**. `pi-context-cli` surfaces no workflow
  ops. So a workflow runs only inside a live `pi` session (`/workflow run`, via
  the `pi.registerCommand("workflow")` at `src/index.ts:987` and the
  `workflow-execute` tool at `src/index.ts:494`) or via a **hand-written
  programmatic harness** calling `executeWorkflow`.
- The engine functions are **not exported** for out-of-tree use: the package
  `exports` map lists only `.`, `./agent-spec`, `./template`, `./step-shared`,
  `./types`, `./auth-required` — `executeWorkflow` / `parseWorkflowSpec` /
  `findIncompleteRun` / `createAgentLoader` have **no `exports` subpath and are
  not re-exported from the `.` barrel**. The PoC reached them via deep
  `dist/workflow-executor.js` imports **from inside the package dir** (where
  `node_modules`/`dist` resolve). This is a real packaging blocker for any
  external runner.

## 2. What transfers from pi-context (high reuse — the invocation envelope)

The model for the *wrapper around* the engine is `pi-context-cli`
(`packages/pi-context-cli/src/cli.ts` + `bin.ts`):
- **bin + flag envelope.** `bin: { "pi-context": "./dist/bin.js" }`
  (package.json:23); global flags `--cwd` / `--json` / `--yes` / `--force` /
  `--writer` / `--help` (cli.ts:187-217); JSON-or-`@file` arg coercion
  (cli.ts:254); `--json` result envelope `{ok, op, output}` (cli.ts:486); the
  `bin.ts` shim mapping a resolved promise to `process.exitCode`.
- **Auth gate.** `authDecision` (cli.ts:364): non-gated → allow; `--yes` →
  allow; TTY → prompt; non-interactive-without-`--yes` → refuse. Workflows spawn
  `sh -c` (step-command.ts:28) and `pi` subprocesses (dispatch.ts:162) — exactly
  the side-effecting posture this gate is for; pi-workflows already exports
  `./auth-required`.
- **Writer identity.** `resolveIdentity` cascade `git config user.email` →
  `$USER` → `"operator"` (cli.ts:135); the `WriterIdentity` union already has a
  `"workflow"` kind with a `workflow_step_id` slot (cli.ts:327-332).
- **dist/NODE_PATH resolution.** Two known-good patterns: the orchestrator
  scripts borrow `workflowsPiExtension/node_modules` via `NODE_PATH`
  (`/Users/david/Projects/wasc-school-wide-improvement-plan/scripts/orchestrator/*.ts`);
  the CLI is a published package with its own `node_modules` + `bin`.
- **`workflow-list` is the one near-op-shaped surface** (index.ts:651): empty
  params, `discoverWorkflows(ctx.cwd)`; liftable almost verbatim.

The `run`/`resume`/`status`/`list` verbs map cleanly onto this CLI skeleton.

## 3. What must be ADDED (the model does not cover the engine)

A pi-context op is `run(cwd, params, ctx?: DispatchContext)` — stateless,
single-shot, file-level, no runtime handle. `executeWorkflow(spec, input,
{ctx, pi, signal, loadAgent, resume?})` (workflow-executor.ts:690;
`ExecuteOptions` :70) needs materially more, none of which any pi-context op has:
1. **`ctx: WorkflowContext`** (types.ts:291) = `{cwd, hasUI, ui:{setWidget,
   notify, setStatus, setWorkingMessage}}`. The executor calls `ctx.ui.*`
   throughout, each guarded by `if (ctx.hasUI)` (workflow-executor.ts:255-257,
   385, 445, 626, 756-762). **Headless = `hasUI:false` + no-op `ui`**, i.e. the
   `mockCtx` factory (test-helpers.ts:21). This is the central adaptation and has
   no pi-context analog.
2. **`pi: WorkflowPI`** (types.ts:303 = `{sendMessage}`). For command/transform/
   gate-only runs `mockPi` (test-helpers.ts:36) suffices. **The model backend is
   NOT this handle** — agent steps `spawn("pi", args)` a real `pi` CLI
   subprocess in JSON mode (dispatch.ts:162; model arg :76-84). So the true
   dependency for agent steps is **`pi` on PATH with a reachable backend**
   (confirmed empirically, A6).
3. **`loadAgent`** = `createAgentLoader(cwd)` (agent-spec.ts:136) — function
   injection; no pi-context op takes one.
4. **Run lifecycle** — checkpoints, `findIncompleteRun(cwd, name)`,
   `validateResumeCompatibility`, `resume:{runId, runDir, state}` (index.ts:
   534-556). pi-context ops have no run identity / checkpoint / resume.
5. **Spec loading** — `parseWorkflowSpec(content, filePath, source)` +
   `findWorkflow(name, cwd)` (index.ts:517); YAML files from `.workflows/` +
   `~/.pi/agent/workflows/`, not config-addressed blocks.
6. **Long-lived, cancellable, side-effecting orchestration** — `AbortSignal`
   threading (dispatch.ts:169-178), `sh -c` subprocesses, block-file
   snapshot/rollback (workflow-executor.ts:250, 290).

So the pi-context scripts model the *invocation envelope*; the *execution engine*
is `executeWorkflow` itself — already built, to be **driven**, not rebuilt.

## 4. What does NOT transfer at all

- **Reflection / auto-surfacing** — `pi-context-cli`'s defining feature. It
  reflects over `ops`, an exported `OpDefinition[]` array
  (`packages/pi-context/src/ops-registry.ts`: `OpDefinition` :103, `surface`
  :111, `ops` :141; `./ops` subpath package.json:99), filtering
  `surface === "use"` (cli.ts:38). pi-workflows registers imperatively on the
  **pi runtime's** host-only tool/command registry (`pi.registerTool` /
  `registerCommand`, index.ts:494/987) — there is **no reflectable array**.
  **Consequence: you cannot get a workflow CLI "for free" the way pi-context
  did; it must be hand-written.**
- **The `op.run(cwd, params)` signature** does not fit `executeWorkflow(spec,
  input, {ctx, pi, loadAgent})` — no flag-derivation produces those handles.
- **Packaging reachability** (§1) — engine fns not in barrel/`exports`; only
  deep `dist/` imports from inside the package work today.

## 5. The embryonic runner (already exists as a PoC)

`WORKSHOPPING-WORKFLOW-RUNTIME-VERIFICATION.md` §"Programmatic-harness
reference" (lines 87-98) documents a ~40-line tsx driver that did the §3 work:
`parseWorkflowSpec` → `createAgentLoader` → build `ctx{hasUI:false}` + `pi` →
`executeWorkflow` → resume via `findIncompleteRun`. It ran real `dist/` code and
confirmed A1–A6 (input validation, command `output:{format:json}` typed
interpolation, `| shell`, fail-fast halt, resume-skips-completed, real agent
dispatch) **and** the two constraints below. It is the runner minus a CLI
envelope, run-dir conventions, and a home.

## 6. Recommended shape + home (for the plan to adopt or revise)

> **SUPERSEDED for this §6 by `PI-WORKFLOWS-RUNNER-SURFACE.md`.** The §6
> recommendation below predates (a) the resolved-surface investigation and (b)
> the "presume no changes to pi-workflows unless something is a no-op"
> constraint. The no-op check found **nothing in pi-workflows non-functional**,
> so **no `bin`/`exports`/`headlessCtx` change is made** — the runner is a pure
> external consumer reaching the engine via absolute `file://` deep imports
> (which bypass the closed `exports` map), and the home is the **wasc-local
> driver** (`prompt-workshop/dispatch/`) or a monorepo sibling. The text below is
> retained for history; the SURFACE doc is authoritative on home + packaging.

**Home: upstream, not project-local.** The gap (no shell entry) is a
pi-workflows-level gap and the capability is generic. Build
`packages/pi-workflows-cli` (mirroring `pi-context-cli`), or minimally add a
`bin` + `exports` to `packages/pi-workflows`. A project-local
`prompt-workshop/dispatch/run_workflow.*` is acceptable only as a **stopgap that
imports the upstream runner**, not as the permanent home.

**Packaging prerequisites — FIRST (the real blockers):**
- Add `exports` subpaths (or `.` barrel re-exports) for `executeWorkflow`,
  `parseWorkflowSpec`, `findIncompleteRun`, `createAgentLoader`, and a
  **non-test `headlessCtx` factory** (promote `mockCtx`, test-helpers.ts:21).
- Add a `bin`.
- Until these land, any runner is stuck with the PoC's "must live inside the
  package dir" constraint.

**Commands (hand-written, not reflected):**
- `run <workflow> [--input <json|@file>] [--fresh]` → `findWorkflow` →
  `parseWorkflowSpec` → `executeWorkflow`, with auto-resume of compatible
  incomplete runs (the `workflow-execute` tool body logic, index.ts:534-556,
  lifted out).
- `resume <workflow> --run-id <id> [--input …]` → the `workflow-resume` body
  (index.ts:588-646).
- `status <workflow>` → `findIncompleteRun` + a read of the run-dir state.
- `list` → `discoverWorkflows` (the near-verbatim lift).

**Flags reused verbatim from pi-context-cli:** `--cwd`, `--json` (emit the
`WorkflowResult` as `{ok, output}`), `--yes`/`--force`, `--help`; the
`parseOpArgs`-style JSON/`@file` coercion; the `bin.ts` exit-code shim.

**ctx / pi acquisition:** `ctx` = headless `{hasUI:false, ui: no-ops}`
(promoted `headlessCtx`); `pi` = `mockPi` for command/transform/gate-only runs,
and for agent steps rely on `pi` on PATH (dispatch spawns it) with a **clear
precondition error when absent**. Thread a real `AbortSignal` from SIGINT.

**Auth:** carry pi-workflows' `auth-required` semantics through the same
`--yes`-or-refuse gate (cli.ts:364); a headless Claude-Code call must pass
`--yes`.

## 7. Known engine constraints the runner must guard/document

- **A7 — `command` sub-step inside a `loop` is silently skipped** (step-loop
  handles only gate/transform/agent; `else { continue }`). Execution-confirmed
  (runtime-verification A7). Any per-element command work must be top-level or
  wrapped in transform/agent/gate.
- **YAML inline-JSON-in-`command`** fails parsing ("nested mappings not allowed
  in compact mappings"); use single-quoted or block scalars.
- **Command-step stdout purity** — the executor wraps non-JSON stdout as
  `{text:…}` without failing, so a stray stdout print silently breaks
  `.output.<field>`; diagnostics must go to stderr.

## 8. For the build pipeline

**EXPLORE must (re-)confirm against live source (do not trust this doc's line
numbers blind — the extension is being finished):**
- Every cited file:line in §§1–7 still holds; `dist/` currency vs `src/`.
- Whether `bin` / engine `exports` / a `pi-workflows-cli` have appeared since.
- Whether `ctx.ui` is called anywhere NOT guarded by `if (ctx.hasUI)` (an
  unguarded call would break a headless run — §3.1 is the load-bearing
  assumption).
- How `pi` (the model backend) is obtained in a headless Claude-Code run, and
  whether the auth gate fires for the workflow's side effects.

**PLAN must decide:** upstream `pi-workflows-cli` vs `bin`+`exports` on
pi-workflows vs project-local stopgap; the exact command set + flags; the
`headlessCtx` export location; `mockPi` vs a real `pi` handle for agent steps;
the relationship to the DEC-29 orchestration trio (US-LLM-23/24/25) — is this
runner a dev-time harness only, or a step toward that production service.

**IMPL must:** land the packaging prerequisites (§6) FIRST, then the CLI
commands reusing the pi-context-cli envelope; document the §7 guards; observed-
green before commit; STOP on any ambiguity.

**ADVERSARIAL AUDIT must attack (the load-bearing unknowns):**
- **Headless sufficiency at scale.** The PoC ran command-only + ONE agent step,
  not a full multi-step real-`pi` run. Attack: does `hasUI:false` suffice for a
  full run; is there any `ctx.ui.*` call reachable without the `hasUI` guard;
  does a long agent-heavy run behave.
- **Resume across a real interruption.** Attack a genuinely interrupted
  long run (not a synthetic two-phase) — does `findIncompleteRun` +
  `validateResumeCompatibility` re-enter correctly; does it skip completed steps
  without recompute; does a spec-version/name change correctly invalidate resume.
- **Silent no-op class.** Re-run the A7 + stdout-purity + YAML guards against the
  actual built runner; confirm nothing the runner relies on silently skips.
- **Packaging completeness.** Confirm no deep `dist/` import remains and the
  runner resolves the engine purely by package specifier after the `exports`
  fix.
- **Auth + backend failure modes.** Confirm a missing model backend or a denied
  auth gate surfaces a clear error, not an opaque non-zero command exit.

## File / line reference index (re-verify in explore)
- `packages/pi-context-cli/src/cli.ts` — reflection :38; identity :135; flags
  :187-217; arg coercion :254; auth :364; writer kinds :327-332; run :485;
  envelope :486. `src/bin.ts` — exit-code shim. `package.json:23` — bin.
- `packages/pi-context/src/ops-registry.ts` — `OpDefinition` :103; `surface`
  :111; `ops` :141. `package.json:99` — `./ops` subpath.
- `packages/pi-workflows/src/index.ts` — `workflow-execute` :494;
  `workflow-resume` :574; `workflow-list` :651; `registerCommand("workflow")`
  :987; `findWorkflow` :517; resume logic :534-556; resume body :588-646.
  `package.json` — `main`, no `bin`, exports omit engine fns.
- `packages/pi-workflows/src/workflow-executor.ts` — `ExecuteOptions` :70;
  `executeWorkflow` :690; `ctx.hasUI` guards :255-257, 385, 445, 626, 756-762;
  block snapshot/rollback :250, 290.
- `packages/pi-workflows/src/types.ts` — `WorkflowContext` :291; `WorkflowPI`
  :303.
- `packages/pi-workflows/src/dispatch.ts` — spawn `pi` :162; model arg :76-84;
  AbortSignal :169-178. `src/step-command.ts` — spawn `sh -c` :28; stdio (no
  stdin). `src/step-loop.ts` — gate/transform/agent only; `else { continue }`.
- `packages/pi-workflows/src/test-helpers.ts` — `mockCtx` :21; `mockPi` :36.
  `src/agent-spec.ts` — `createAgentLoader` :136.
- `prompt-workshop/WORKSHOPPING-WORKFLOW-RUNTIME-VERIFICATION.md` — PoC harness
  ref :87-98; A1–A7.
- `scripts/orchestrator/*.ts` (wasc repo) — the NODE_PATH-borrowing orchestrator
  scripts.
