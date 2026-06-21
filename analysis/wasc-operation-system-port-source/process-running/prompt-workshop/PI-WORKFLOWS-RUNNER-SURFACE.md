# pi-workflows runner — resolved surface (planning/impl contract)

**Purpose.** Resolves the "recommended but not settled" + "explicitly open" items in
`PI-WORKFLOWS-RUNNER-DESIGN.md` into an exact, source-verified contract usable
directly for the runner's plan → impl. Produced by three parallel read-only
investigations against current pi-workflows source.

**HARD CONSTRAINT applied throughout: pi-workflows is FIXED.** No change to it is
assumed or required — no added `bin`, no added `exports` subpaths, no promoted
`test-helpers`. The runner is a pure external consumer. The only warranted-change
exception (something genuinely non-functional/no-op) was checked and **none was
found** (§4).

**Build currency:** `dist/` rebuilt 2026-06-04 18:44, newer than newest non-test
`src` (13:56) — `dist` is current. Re-`npm run build -w @davidorex/pi-workflows`
before relying on these if `src` is later edited. Package `@davidorex/pi-workflows@0.29.0`.

---

## 1. Reachability + home (as-is)

### 1.1 The `exports` map is CLOSED — most engine fns are not bare-importable

`packages/pi-workflows/package.json` `exports` (verbatim, lines 22-47): only
`.`, `./agent-spec`, `./template`, `./step-shared`, `./types`, `./auth-required`.
No `"./dist/*"` wildcard. Node enforces it — any unlisted subpath throws
`ERR_PACKAGE_PATH_NOT_EXPORTED`. The `.` barrel exports **only** `default` (the
extension registrar); `executeWorkflow` is `undefined` off the barrel.

| Engine fn | dist module | Listed subpath? | Bare import |
|---|---|---|---|
| `createAgentLoader` | `dist/agent-spec.js` | **YES** `./agent-spec` | RESOLVES |
| `executeWorkflow` | `dist/workflow-executor.js` | no | `ERR_PACKAGE_PATH_NOT_EXPORTED` |
| `parseWorkflowSpec` | `dist/workflow-spec.js` | no | `ERR_PACKAGE_PATH_NOT_EXPORTED` |
| `findIncompleteRun` | `dist/checkpoint.js` | no | `ERR_PACKAGE_PATH_NOT_EXPORTED` |
| `mockCtx`/`mockPi` (test-helpers) | `dist/test-helpers.js` | no | `ERR_PACKAGE_PATH_NOT_EXPORTED` |

Verified signatures (current `.d.ts`):
- `executeWorkflow(spec: WorkflowSpec, input: unknown, options: ExecuteOptions): Promise<WorkflowResult>`
- `parseWorkflowSpec(content: string, filePath: string, source: "user"|"project"): WorkflowSpec`
- `findIncompleteRun(cwd: string, workflowName: string): IncompleteRun | null`
- `createAgentLoader(cwd: string, builtinDir?: string): (name: string) => AgentSpec`
- also used: `findWorkflow`/`discoverWorkflows` (`workflow-discovery.js`),
  `validateResumeCompatibility(state, spec): string|null` (`checkpoint.ts:79`,
  null = compatible).

### 1.2 What resolves as-is, per home

- **`file://` absolute import bypasses `exports` entirely** (gating applies only
  to bare-specifier resolution, not direct URL/path). Confirmed loading all five
  fns from anywhere:
  ```js
  const base = "file:///Users/david/Projects/workflowsPiExtension/packages/pi-workflows/dist/";
  const { executeWorkflow }   = await import(base + "workflow-executor.js");
  const { parseWorkflowSpec } = await import(base + "workflow-spec.js");
  const { findIncompleteRun } = await import(base + "checkpoint.js");
  const { createAgentLoader } = await import(base + "agent-spec.js");
  ```
  Transitive deps resolve because they're hoisted to `workflowsPiExtension/node_modules`
  (Node walks up from the dist file).
- **`NODE_PATH` does NOT help ESM** — confirmed `ERR_MODULE_NOT_FOUND`. The wasc
  CJS orchestrator scripts borrow `NODE_PATH`; an ESM runner cannot. From the
  wasc repo, bare `@davidorex/pi-workflows/*` does not resolve at all (not in
  wasc `node_modules`); **absolute `file://` is the only path**.
- **A monorepo sibling** resolves bare specifiers → `./agent-spec` works bare;
  the three unexported fns still need a relative (`../pi-workflows/dist/…`) or
  `file://` path.
- **A script inside the package dir** reaches all four by short relative imports
  (`./dist/…`) — but adding a file under `packages/pi-workflows/` touches the
  package tree.

### 1.3 Home recommendation (under the constraint)

Reading the HARD CONSTRAINT strictly (do not touch the pi-workflows package
tree), the runner is **external**, and the choice is:

- **Recommended — wasc project-local driver** (`prompt-workshop/dispatch/`):
  zero pi-workflows changes; reaches all four engine fns via **absolute
  `file://`** dynamic import (path from an env var / config, per the documented
  wasc ESM-loader pattern). Keeps the runner beside the rest of the workshop
  tooling. (All four via `file://`, since bare `./agent-spec` doesn't resolve
  from the wasc repo either.)
- Alternative — **new sibling package** `packages/pi-workflows-cli`: adds a
  package (pi-workflows itself untouched), gets bare `./agent-spec` for
  `createAgentLoader`, but still needs relative/`file://` for the other three —
  buys little over the wasc-local driver, adds workspace/build overhead.

The final home is a plan decision; both are constraint-compliant. The exact
import strategy is the same in substance: **`file://` deep import of the four
dist modules** (the alternative narrows only `createAgentLoader` to a bare
specifier).

---

## 2. CLI surface contract

A non-interactive wrapper that mirrors the `pi-context-cli` flag envelope + exit
shim and presents four commands over the engine.

### 2.1 Global flags (reused verbatim from `pi-context-cli/src/cli.ts`)

| Flag | Behavior |
|---|---|
| `--cwd <dir>` | the engine's `cwd` (resolves `.workflows/`, `~/.pi/agent/workflows/`, run-dirs, blocks). Relative → against `process.cwd()`. |
| `--json` | single-line JSON envelope on stdout instead of human text. |
| `--yes` / `--force` | pre-authorize a gated (side-effecting) run in a non-interactive context. |
| `--writer <json\|@file>` | override auto-resolved operator identity. |
| `--help` / `-h` | top-level or per-command help. |

- **`--input`/`--writer` coercion (cli.ts:254-262):** value starting `@` → read
  file + `JSON.parse`; else `JSON.parse` the literal. Parse failure = UsageError
  (exit 2).
- **Identity (`resolveIdentity`, cli.ts:135):** `git config user.email` →
  `$USER` → null.
- **Auth (`authDecision`, cli.ts:364):** `run`/`resume` are gated → `--yes`/
  `--force` allow; interactive TTY without it prompts; **non-interactive without
  `--yes` REFUSES (exit 1)**. A Claude-Code Bash call has no TTY → side-effecting
  runs MUST pass `--yes`. `status`/`list` are read-only → never gated.
- **Exit shim (`bin.ts`):** `0` success, `1` runtime/refusal, `2` usage error.

### 2.2 Per-command contract

| Command | Positional | Flags `[name,type,req,default]` | Engine call(s) | stdout / exit | `--json` envelope |
|---|---|---|---|---|---|
| `run` | `<workflow>` (req) | `--input <json\|@file>` (opt, `{}`); `--fresh` (bool, opt, false); `--yes`/`--force`; globals | `findWorkflow`; if `!fresh`: `findIncompleteRun`+`validateResumeCompatibility`→conditional resume; `executeWorkflow(spec, input, {ctx,pi,loadAgent,[resume]})` | text result; exit 0 if `status==="completed"` else 1 | `{ok:true,op:"run",resumed:<bool>,output:<WorkflowResult>}` / `{ok:false,op:"run",error}` |
| `resume` | `<workflow>` (req), `<runId>` (req) | `--input <json\|@file>` (opt, defaults to original run input); `--yes`/`--force`; globals | `findWorkflow`; `findIncompleteRun` (null→error); reject if `runId` mismatch; `validateResumeCompatibility` (non-null→error); `executeWorkflow(…, resume:{runId,runDir,state})` | text; exit 0 if completed else 1 | `{ok:true,op:"resume",resumed:true,runId,output:<WorkflowResult>}` / `{ok:false,...}` |
| `status` | none | globals | `findIncompleteRun(cwd, name)` / scan; read `state.json` | human summary; exit 0; never gated | `{ok:true,op:"status",output:<IncompleteRun\|IncompleteRun[]\|null>}` |
| `list` | none | globals | `discoverWorkflows(cwd)` | one line per workflow; exit 0 | `{ok:true,op:"list",output:[{name,description,source},…]}` |

- **Required input headless:** the engine cannot prompt (`promptForInput` needs
  `hasUI`); a spec with required input fields must get them via `--input` or the
  engine's input-schema validation fails the run loudly (exit 1).
- **Auto-resume vs explicit (from `index.ts:533-556`, `595-635`):** `run`
  auto-resumes a compatible incomplete run and **silently falls back to fresh**
  on incompatibility (or `--fresh` skips the probe). `resume` resumes only the
  exact `runId`, **failing loudly** on absence / mismatch / incompatibility.

### 2.3 The `--json` envelope shape (pinned to real types)

`output` for `run`/`resume` is the engine `WorkflowResult` (`types.ts:244`):
```ts
interface WorkflowResult {
  workflow: string; runId: string;
  status: "completed" | "failed" | "paused";
  steps: Record<string, StepResult>;
  output?: unknown; totalUsage: StepUsage; totalDurationMs: number;
  runDir: string; artifacts?: Record<string,string>; warnings?: string[];
}
interface StepResult {            // types.ts:215
  step: string; agent: string;
  status: "completed" | "failed" | "skipped";
  output?: unknown; textOutput?: string; outputPath?: string; sessionLog?: string;
  usage: StepUsage; durationMs: number; error?: string; truncated?: boolean;
  warnings?: string[]; attempt?: number; totalAttempts?: number; priorErrors?: string[];
}
interface StepUsage { input:number; output:number; cacheRead:number; cacheWrite:number; cost:number; turns:number; }  // types.ts:233
```
`status` output = `IncompleteRun` (`checkpoint.ts:13`): `{runId, runDir, state, completedSteps, failedStep?, updatedAt?}`. `list` output = `{name, description, source:"project"|"user"}[]`.

### 2.4 Runner-doc warnings (engine properties; NOT pi-workflows changes)

1. A `command` sub-step inside a `loop` is **silently skipped** — author command steps top-level.
2. JSON inside a `command:` YAML value needs a **single-quoted or block (`|`) scalar**.
3. A command step's **stdout must be pure JSON** (diagnostics to stderr) or `.output.<field>` silently breaks.

---

## 3. ctx / pi construction (headless) + agent-step backend

### 3.1 `hasUI:false` is SAFE — every `ctx.ui.*` call is guarded

Every `ctx.ui.*` access in `workflow-executor.ts` is behind `if (ctx.hasUI)`
(verified at 255-258, 385-387, 445, 487, 515, 559, 626-628, 654-656, 665-667,
756-758, 761-763, 834-840, 920-928, 941-943, 948-952). **No unguarded call
exists.** A no-op `ui` is therefore never actually invoked. One caveat: a
`monitor:` step forwards `ctx` to a separate `executeMonitor` module
(`workflow-executor.ts:522`) — verify that module's guarding **only if** the
runner uses monitor steps; for command/transform/gate/block/agent/loop/parallel/
pause/forEach (the workshop set), `hasUI:false` is provably safe.

### 3.2 Exact headless `ctx` literal

`WorkflowContext` (`types.ts:291`) requires four `ui` methods (note: `mockCtx`
omits `setWorkingMessage` behind `as any` — a typed literal must include it):
```ts
const ctx: WorkflowContext = {
  cwd: "<substrate/project root the run resolves against>",
  hasUI: false,
  ui: {
    setWidget:        (_id, _content) => {},
    notify:           (_message, _level) => {},
    setStatus:        (_key, _text) => {},
    setWorkingMessage:(_message) => {},
  },
};
```
`cwd` resolves relative paths, block I/O (`.context` via `readBlock`/`writeBlock`),
run-dir creation (`initRunDir`), and the artifact path-traversal guard. For the
workshop run this is the project/substrate root (for the Django-grounding side,
the same `school-improvement-plans` env the bridge scripts use applies to the
command steps, not to `ctx.cwd`).

### 3.3 Exact `pi` literal — no-op for ALL run kinds

`WorkflowPI` (`types.ts:303`) = `{ sendMessage(message, options?) }`. The handle's
ONLY use is `pi.sendMessage(...)` at end-of-run (`workflow-executor.ts:967/991`)
to inject the result back into a calling pi conversation — **it is never the
model path**. A no-op suffices for every run kind:
```ts
const pi: WorkflowPI = { sendMessage: (_message, _options) => {} };
```

### 3.4 Agent-step model backend — the real precondition

Agent steps reach a model by **spawning the `pi` CLI as a subprocess**, not via
the handle: `dispatch` does `spawn("pi", ["--mode","json","--session-dir",…, ("--models",<model>)…], { cwd, env: process.env, stdio:["ignore","pipe","pipe"] })`
(`dispatch.ts:162`; args `:70-85`). This reconciles exactly with runtime-
verification A6 ("`pi --mode json -p` → PONG, openrouter"). Preconditions for any
agent/loop step:
1. **`pi` on PATH** (bare `spawn("pi",…)`; absent → `ENOENT`).
2. **A configured, reachable backend in `process.env`** (the subprocess inherits
   the runner's env).
3. **A resolvable model** — `step.model ?? agentSpec.model ?? modelConfig.by_role[role] ?? modelConfig.default`; absent all, the spawned `pi` uses its own default (A6: `auto`→gpt-5.5).
4. **Loadable agent specs** — `createAgentLoader(cwd)` searches `<cwd>/.pi/agents/<name>.agent.yaml`, `~/.pi/agent/agents/…`, then bundled; miss → failed StepResult.

**No-silent-failure handling:** `dispatch` pre-checks none of this — failures
surface only as a failed `StepResult` after the spawn. So the runner MUST
**pre-flight** when the spec contains any agent/loop step: scan `spec.steps`
(incl. nested `loop`/`parallel`/`forEach`) for an `agent` field; if any, verify
`pi` resolves on PATH (`pi --version` / catch `ENOENT`) and abort with a clear
precondition error if not. Backend reachability is fully verifiable only by a
probe (a one-step pinger / `pi --mode json -p ping`); surface a clear error on
non-zero. Command/transform/gate-only specs skip this entirely.

### 3.5 `test-helpers` verdict

`mockCtx`/`mockPi` are in `dist/` but **not in `exports`** → not externally
importable (`ERR_PACKAGE_PATH_NOT_EXPORTED`). The runner builds the §3.2/§3.3
literals inline (and must add `setWorkingMessage`, which `mockCtx` omits).

---

## 4. No-op verdict (the constraint's exception, checked)

**Nothing the runner needs is non-functional as shipped.** All four engine fns +
the two test-helpers are present and callable in the current `dist/` (all
exercised via `file://`). The only friction is the closed `exports` map (a
missing ergonomic export) — explicitly classified by the constraint as
work-around-able, not a warranted change. The barrel exposing only `default` is
correct-by-design for a pi extension entry. **No pi-workflows change is flagged;
the runner is a pure external consumer via `file://` deep imports.**

---

## 5. What is now exact vs. still a plan decision

**Exact (impl can build against these):** the import strategy (`file://` deep
imports; §1.2); the four engine signatures (§1.1); the headless `ctx`/`pi`
literals (§3.2/§3.3); the agent-step subprocess precondition + pre-flight
(§3.4); the CLI command/flag/envelope contract (§2); the `WorkflowResult` shape
(§2.3); the runner-doc warnings (§2.4).

**Still a plan decision:**
- **Home** — wasc-local driver (`prompt-workshop/dispatch/`, `file://`) vs a
  monorepo sibling package. Both constraint-compliant; substance identical.
- **`cwd` value** for `ctx` (project root vs substrate root) — fix per where the
  run's blocks/paths resolve.
- **Agent-step scope for the first runner** — whether v1 supports agent steps
  (requires the §3.4 pre-flight + a reachable `pi` backend) or ships
  command/transform/gate-only first and adds agent support after.
- The line numbers above are current as of 2026-06-04; the explore phase
  re-confirms before impl (esp. the `ctx.ui` guard table and the `exports` map).
