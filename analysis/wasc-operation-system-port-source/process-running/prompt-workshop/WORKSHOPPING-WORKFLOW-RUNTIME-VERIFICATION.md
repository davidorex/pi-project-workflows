# pi-workflows runtime verification (companion to WORKSHOPPING-WORKFLOW-SPEC.md)

**What this is.** An empirical record of whether the pi-workflows runtime behaviors
`WORKSHOPPING-WORKFLOW-SPEC.md` depends on actually hold when pi-workflows is
**executed** — distinct from the four prior evaluations, which verified the API
*shape* by reading `packages/pi-workflows/src/*.ts` but never ran it. Every
verdict below is backed by a command run against the **built `dist/`** runtime and
its observed output, not by source inference. Package under test:
`@davidorex/pi-workflows` at `/Users/david/Projects/workflowsPiExtension/packages/pi-workflows`
(`dist/` built current vs `src/`). Scratch drivers were thrown away after the run.

**Headline.** The linear primitives the spec uses are substantiated **by
execution**. Two load-bearing caveats the source-only evals missed: (1) there is
**no turnkey run surface**; (2) the prior blocking claim **A7 (a `command`
sub-step inside a `loop` is silently skipped) is empirically TRUE**. Plus a YAML
authoring foot-gun.

---

## A0 — The run surface (decisive)

There is a usable run surface, but **no shell CLI**:

- **Production surface.** pi-workflows is a pi extension: `dist/index.js`'s
  `pi.extensions` entry registers a `workflow-execute` tool and a `/workflow run
  <name>` command. Driving these the real way needs a live pi extension context
  (`ctx`, `pi`, interactive UI). pi-workflows has **no `bin`**, and pi-context-cli
  surfaces no workflow ops — so a workflow cannot be run from a bare shell command.
- **Programmatic surface (used for this verification).** `dist/` exports:
  - `executeWorkflow(spec, input, { ctx, pi, signal, loadAgent, resume?, ... })` — `dist/workflow-executor.js`
  - `parseWorkflowSpec(content, filePath, source)` — `dist/workflow-spec.js`
  - `createAgentLoader(cwd)` — `dist/agent-spec.js`
  - `findIncompleteRun(cwd, name)` — `dist/checkpoint.js`
  - `mockCtx` / `mockPi` / `makeSpec` test factories — `src/test-helpers.ts` (the
    sanctioned headless-drive path; a mock `ctx` is `{ cwd, hasUI: false, ui: {…} }`).
  A ~40-line tsx driver in the package dir (so `node_modules`/`dist` resolve),
  using exactly these exports, ran real built code.

**Consequence for the spec:** a 14-step run is driven either **inside a live pi
session** (`/workflow run`) or by a **hand-written programmatic harness** calling
`executeWorkflow` against `dist/`. There is no turnkey runner to point at a
`.workflow.yaml` from the shell.

## Test suite (empirical evidence #1)

- `npm test` (`tsx --test src/*.test.ts`) from the package dir → **831 tests,
  829 pass, 0 fail, 2 skipped.**
- The 2 skips are the **entire `executeWorkflow` integration suite and the
  `dispatch` suite**, gated behind `RUN_INTEGRATION=1` (skip reason "pi not
  available"). So the default green suite covers per-module step executors,
  expressions, DAG, state, checkpoint, and template — but **NOT the end-to-end
  executor loop.**
- `RUN_INTEGRATION=1 npx tsx --test src/workflow-executor.test.ts` → **36 tests,
  36 pass, 0 fail** — covering command steps, loops with a gate break,
  transform+loop+artifacts, parallel/DAG, fail-fast, `onExhausted`,
  resume-skips-completed, and a self-implement workflow. These use **mock agent
  dispatch** (not real models) but exercise the real orchestration loop.
- There IS a passing test "skips completed steps when resuming after failure"
  (relevant to A5). There is **no test for a `command` sub-step inside a `loop`**
  (relevant to A7).

So the "working code" guarantee for the orchestration loop rests on the 36
`RUN_INTEGRATION` tests (mock dispatch) plus the A1–A7 executions below — **not**
on the default green suite, which skips the executor.

## A1–A7 — observed runtime behavior (empirical evidence #2)

| # | Behavior | Verdict | Observed |
|---|----------|---------|----------|
| A1 | `input` JSON-Schema validation | **HOLDS** | `{"count":"not-a-number"}` → `ValidationError: /count: must be integer`; `{}` → `must have required property 'count'`; `{"count":5}` → ran to `completed`. |
| A2 | `command` + `output:{format:json}` → typed output | **HOLDS** | With it: `output={"answer":42,"label":"hi"}`; `${{ steps.with_json.output.answer }}`→`42`, `.label`→`hi`. Without it: `output={"text":"{\"answer\": 42}"}` — `.output.answer` undefined, `.output.text` reachable. Both branches proven. |
| A3 | interpolation + `\| shell` escaping | **HOLDS** | `it's a "test"` via `${{ input.danger \| shell }}` and `it's a "q"` via `${{ steps.produce.output.v \| shell }}` both ran to `completed` inside single-quoted `sh -c` args; the single quote survived. The `shell` filter JSON-stringifies the value first (wraps strings in `"`), then escapes `'` as `'\''`. |
| A4 | non-zero command exit halts the run | **HOLDS** | `boom` (exit 7) → step `failed`, `error=Command failed (exit 7): about to fail`; run `status=failed`; downstream `after` never ran and its sentinel was never created. |
| A5 | checkpoint/resume skips completed steps | **HOLDS** | Phase 1 failed at `flaky`; `completed_once` wrote exactly **1** sentinel line. Phase 2 resumed via `findIncompleteRun` + `resume:{…}`: `flaky` re-ran + completed, `final` ran, run `completed` — and `completed_once`'s sentinel **still had 1 line with the same timestamp**, proving the completed step's command was not re-executed. |
| A6 | `agent` step runs against a real model | **HOLDS** | Backend reachable (`pi --mode json -p …` → `PONG`, openrouter, model `auto`→gpt-5.5). One-step agent workflow (`.pi/agents/pinger.agent.yaml`, `output:{format:json}`) ran through the real `pi` subprocess: `status=completed`, `output={"reply":"PONG","echo":7}`; `${{ input.n }}`→7 reached the agent; JSON auto-parsed into typed output. **Caveat:** agent-step `input` must be a key/value object — a freeform string `input` is rejected at parse with "step input must be an object". |
| A7 | `command` sub-step inside a `loop` runs | **FAILS (claim CONFIRMED)** | A `loop` with a `command` sub-step (`write_sentinel`) + a gate ran 1 iteration, `status=completed`, but the recorded attempt steps contained **only the gate (`check`)** — `write_sentinel` was absent and its sentinel was never created. Matches `dist/step-loop.js`, which handles only `gate`/`transform`/`agent` and ends `else { continue; // unknown step type, skip }`. **A command step inside a loop does not run.** |

## Incidental finding — YAML authoring foot-gun

Inline JSON in a `command:` value (e.g. `command: echo '{"ok":true}'`) fails YAML
parsing ("Nested mappings not allowed in compact mappings"). Commands containing
`{` / `"` must be **single-quoted scalars or block scalars** (`|` / heredoc). The
14-step spec shells JSON in several places; the draft-path-threading model reduces
inline JSON but does not eliminate it, so this rule must be observed when authoring
the workflow YAML.

## Programmatic-harness reference (if the spec is built without a live pi session)

To run a workflow headless, a driver:
1. `parseWorkflowSpec(content, filePath, source)` → spec.
2. `createAgentLoader(cwd)` → `loadAgent`.
3. build a `ctx` (`{ cwd, hasUI: false, ui: {…} }`) and a `pi` handle (real `pi`
   for agent steps; `mockPi` from `test-helpers` for deterministic command-only runs).
4. `executeWorkflow(spec, input, { ctx, pi, signal, loadAgent })` → result.
5. resume: `findIncompleteRun(cwd, name)` → pass `resume: {…}` to `executeWorkflow`.

Note: agent steps require a reachable model backend; the env probed here had one
(openrouter via `pi`). Absent a backend, only command/transform/gate steps run.

## Overall verdict

The spec's reliance on pi-workflows as a working execution harness is
**substantially substantiated for the linear primitives it needs** — input-schema
validation, command-step JSON output + typed cross-step interpolation, the
`| shell` escape, fail-fast halting, real agent dispatch against a reachable
model, and checkpoint/resume that skips completed steps all **hold by execution**.

Two caveats are load-bearing for the design, and one authoring rule:

1. **No turnkey run surface.** Drive a 14-step run inside a live pi session
   (`/workflow run`) or via a hand-written programmatic harness (above). The
   default test suite does not cover the end-to-end executor (it is
   `RUN_INTEGRATION`-gated); the orchestration-loop guarantee rests on the 36
   integration tests (mock dispatch) plus the runs recorded here.
2. **A7 is a real constraint, confirmed by execution.** Any `command` work the
   spec wants *inside a `loop`* will silently no-op. Per-element command steps
   must live at top level, or be wrapped in `transform`/`agent`/`gate`, or use
   `foreach` rather than `loop` — whichever the spec relies on must be re-checked
   against this. (This corroborates the spec's revision, which already descoped
   loop-based retry to fail-and-resume.)
3. **YAML authoring rule.** JSON inside a `command:` value needs single-quoted or
   block scalars.

These findings imply two spec edits (held for direction): the §1 "what is built"
framing should record that there is no turnkey runner (run via live pi session or
programmatic harness), and a build note should state the JSON-in-`command` YAML
rule.
