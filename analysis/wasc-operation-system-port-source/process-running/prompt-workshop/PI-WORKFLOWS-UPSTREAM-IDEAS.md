# pi-workflows — grounded enhancement ideas (upstream candidates)

**What this is.** Improvement ideas for **pi-workflows itself**, surfaced as a
by-product of designing a Claude-Code runner over it (see
`PI-WORKFLOWS-RUNNER-SURFACE.md` + `WORKSHOPPING-WORKFLOW-RUNTIME-VERIFICATION.md`).
Each is grounded in current source (`@davidorex/pi-workflows@0.29.0`, `dist`
current 2026-06-04) with a file:line and the consumer-pain it addresses.

**Status.** NONE of these are done — the runner work runs under a "no changes to
pi-workflows unless something is a no-op" constraint, and the no-op check found
nothing non-functional, so the runner works *around* these via `file://` deep
imports. These are candidates to file upstream (as FGAPs in the
`workflowsPiExtension` `.project`/`.context` substrate, or raise with the
maintainer). Items already filed there are marked so, to dedupe. Severity is
this analysis's read, not the maintainer's.

---

## A. New from the runner/reachability analysis

### A1 — Export the engine functions (closed `exports` map blocks external embedders). Severity: high (ergonomics; blocks clean reuse)
`package.json` `exports` (lines 22-47) lists only `.`, `./agent-spec`,
`./template`, `./step-shared`, `./types`, `./auth-required`. The `.` barrel
exports only `default` (the extension registrar; `index.ts:1086`). So
`executeWorkflow` (`workflow-executor.js`), `parseWorkflowSpec`
(`workflow-spec.js`), `findIncompleteRun`/`validateResumeCompatibility`
(`checkpoint.js`), and `findWorkflow`/`discoverWorkflows` (`workflow-discovery.js`)
are **not reachable by any bare specifier** — Node throws
`ERR_PACKAGE_PATH_NOT_EXPORTED`. Any out-of-tree embedder must use `file://` /
relative deep imports of `dist/`, which is brittle (absolute paths, no types via
the package). **Idea:** add `exports` subpaths (or `.`-barrel re-exports) for the
engine functions an embedder needs. **Benefit:** makes the "no turnkey runner"
gap closeable cleanly; lets a `pi-workflows-cli` or any host import by specifier
with types.

### A2 — Ship a sanctioned headless-context factory + a `bin`. Severity: high (no turnkey run surface)
There is no public way to run a workflow without a live pi extension host: no
`bin`, and the only context factory (`mockCtx`, `test-helpers.ts:21`) is
test-only and not exported. **Idea:** (a) export a production
`headlessCtx({cwd})` returning a complete, type-correct no-op-UI
`WorkflowContext`; (b) add a `bin` exposing `run`/`resume`/`status`/`list` (the
contract is fully specified in `PI-WORKFLOWS-RUNNER-SURFACE.md §2`). **Benefit:**
every consumer — headless Claude Code, CI, embedders — gets a turnkey, type-safe
entry instead of hand-rolling a driver. (This is the runner the SURFACE doc
designs; doing it upstream serves all consumers, not just this project.)

### A3 — `mockCtx` does not satisfy its own `WorkflowContext` type. Severity: medium (latent footgun)
`WorkflowContext.ui` requires four methods — `setWidget`, `notify`, `setStatus`,
`setWorkingMessage` (`types.ts:294-299`). `mockCtx` provides only three and casts
with `as any` (`test-helpers.ts:30`), so it silently omits `setWorkingMessage`.
Anyone copying `mockCtx` as a ctx template inherits an incomplete object that
only type-checks because of the cast. **Idea:** make `mockCtx` (and any promoted
`headlessCtx`, A2) provide all four methods and drop the `as any`. **Benefit:**
the test helper matches the contract; removes a copy-paste trap.

### A4 — A `command` sub-step inside a `loop` is silently skipped. Severity: high (silent misbehavior — runtime-confirmed)
`step-loop` executes only `gate`/`transform`/`agent` sub-steps; a `command`
sub-step hits the final `else { continue }` and is dropped with no output and no
error (runtime-verified — `WORKSHOPPING-WORKFLOW-RUNTIME-VERIFICATION.md` A7: the
sub-step's sentinel file was never written). An author who puts a `command` in a
loop gets a silent no-op. **Idea:** either execute `command` sub-steps in loops,
or **reject them at `parseWorkflowSpec`/validation (fail-loud)** so the author is
told at author-time. **Benefit:** eliminates a whole silent-misbehavior class
(the same class as the `output:{format:json}` traps). Adjacent to FGAP-140
(loop-termination) but distinct — this is the sub-step-type gap, not the
termination-predicate gap.

### A5 — Command-step stdout impurity silently breaks `.output.<field>`. Severity: medium (silent misbehavior)
With `output:{format:json}`, a command step's non-JSON stdout is wrapped as
`{text: stdout}` without failing (`step-command.ts:108-114`), so any stray
stdout line makes `${{ steps.X.output.<field> }}` resolve to `undefined`
silently. **Idea:** when `output.format === "json"` and stdout does not parse as
JSON, fail the step (or emit a loud warning) rather than silently wrapping.
**Benefit:** removes another silent no-op; turns a downstream mystery into an
at-source error.

### A6 — Surface/document the `dispatchFn` injection seam (decouple from a `pi` binary). Severity: medium (embeddability)
Agent steps reach the model via `dispatchFn ?? dispatch` (`step-agent.ts:172`),
where the default `dispatch` **spawns a `pi` CLI subprocess** inheriting
`process.env` (`dispatch.ts:162`). `ExecuteOptions` already has a `dispatchFn`
slot (`workflow-executor.ts:70-93`), but it is undocumented and not part of the
public/exported surface. So headless/embedded callers are implicitly forced to
have `pi` on PATH + an ambient backend. **Idea:** document and export the
`dispatchFn` contract so an embedder can inject its own model dispatch
(in-process, or its own client) without the `pi`-subprocess precondition.
**Benefit:** decouples embedded use from a `pi` binary; lets a host (e.g. a
Django service, or a Claude-Code runner) supply dispatch directly. (The runner
SURFACE §3.4 currently relies on the subprocess + a pre-flight; this would offer
a cleaner alternative.)

### A7 — `monitor` steps forward `ctx` to a separate module; confirm headless-safety. Severity: low/medium (unverified hole)
The executor's own `ctx.ui.*` calls are all `hasUI`-guarded (verified, SURFACE
§3.1), making `hasUI:false` safe — **except** a `monitor:` step casts `ctx` to
`ExtensionContext` and hands it to `executeMonitor`
(`workflow-executor.ts:522`), whose internal `ctx.ui` guarding was not
confirmed. **Idea:** audit `executeMonitor` to guarantee it guards `ctx.ui`
under `hasUI:false` (or document the requirement). **Benefit:** closes the one
remaining hole in the otherwise-verified headless-safety guarantee.

---

## B. Already filed in the workflowsPiExtension substrate (cited, not re-raised)

- **FGAP-140** — `LoopSpec` lacks expression-based termination predicates
  (`until` / `untilBudgetRemaining`); `maxAttempts`/gate-break only. (Surfaced by
  the workflow-spec evaluation; the reason in-harness parser-gated retry is
  unbuildable.)
- **FGAP-142** — agent `output.schema` is validated POST-execution (after tokens
  are spent), not StructuredOutput-forcing.
- **FGAP-165** — an empty / zero-token agent dispatch reports as success, so an
  empty generation surfaces downstream as an apply-step parse failure,
  misattributing the failure location.

---

## C. Note on the "no-op verdict" vs these ideas

The runner analysis's no-op verdict ("nothing in pi-workflows is non-functional,
so no change is warranted *for the runner under the constraint*") is about
**necessity for the runner**, which works around everything via `file://`. These
ideas are **enhancements** (ergonomics, embeddability) and **safety** fixes (the
silent-skip items A4/A5, the type mismatch A3, the monitor hole A7) that would
benefit pi-workflows and all its consumers — they are not required for the
runner, and they are not made here. They are recorded for upstream
consideration.
