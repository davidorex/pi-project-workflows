# Bundled-spec dispatch: template-resolution + model-resolution divergence

Investigation register. Branch `fix/fgap-127-bundled-agents-tier` @ 68b9451d. Two verified defect classes that make the 26 bundled agent specs undispatchable on the pi-agent-dispatch (jit) path, even though loading (FGAP-127's tier wiring) now succeeds. Every anchor below re-verified by direct read at the time of writing. No fix is asserted to exist; this report is the filing basis for two gap registrations that follow orchestrator-side.

## Scope of the bundled set

- `packages/pi-workflows/agents/` holds 26 `*.agent.yaml` specs (verified: `ls … | wc -l` = 26).
- All 26 carry a `template:` prompt ref (verified: `grep -rl "template:" … ` lists all 26).
- 0 of 26 declare `model:` (verified: `grep -rc "^model:" …` yields no nonzero file).

The two classes are independent gates: Class A stops compilation; Class B stops dispatch even after A is fixed.

---

## CLASS A — template-resolution divergence: every bundled spec is uncompilable on the dispatch path

### Root cause

The jit parser and the workflow-executor parser resolve template refs by **different mechanisms**. Bundled templates are loader-tier resources (they live in a searched builtin directory and use inter-template `extends`), but the jit parser rewrites refs to absolute filesystem paths and the jit renderer reads those absolute paths directly with `fs.readFileSync` — bypassing the three-tier loader entirely. The absolute path it computes points at a per-agent subdir **beside the spec** (`pi-workflows/agents/<name>/task.md`), where the templates do not live; they live under `pi-jit-agents/templates/<name>/`.

### Shape / per-anchor evidence (re-verified)

- `packages/pi-jit-agents/src/agent-spec.ts:41-46` — `resolveSpecPath` returns `block:` sentinels and absolute paths unchanged, but `path.resolve(specDir, value)` for relatives → an ABSOLUTE path.
- `packages/pi-jit-agents/src/agent-spec.ts:191,193` — applied to `systemField.template` and `taskField.template`; the loaded AgentSpec's template fields are thus absolute, specDir-anchored.
- `packages/pi-jit-agents/src/template.ts:116-126` — `renderTemplateFile`: when `path.isAbsolute(templateName)` it does `fs.readFileSync(templateName)` (`:121-123`) and renders the string, never consulting `env`. The loader (and its search tiers) is only reached for non-absolute names (`:125`).
- Template location mismatch (verified by existence test): `packages/pi-jit-agents/templates/investigator/task.md` EXISTS; `packages/pi-workflows/agents/investigator/task.md` MISSING. `investigator.agent.yaml:47` declares `task.template: investigator/task.md`, which `resolveSpecPath` anchors to `pi-workflows/agents/investigator/task.md` — the missing location.

### Reproducible conditions

Fresh substrate → `loadAgent('investigator')` succeeds (parse + tier resolution) → `compileAgent(...)` throws `ENOENT` for `…/pi-workflows/agents/investigator/task.md`. (Reported run twice this session by the prior probe; the file-existence asymmetry above is the static proof of the ENOENT target.)

### The working executor path proves the correct shape

- `packages/pi-workflows/src/agent-spec.ts:123-125` — the executor parser keeps template refs as loader-resolved NAMES (`promptTemplate: system.template`, `taskTemplate: task.template ?? task.inline`); no `path.resolve`.
- `packages/pi-workflows/src/template.ts:26,29,36` — `createTemplateEnv(cwd, builtinDir?)` builds a Nunjucks `FileSystemLoader` over project `.pi/templates` > user `~/.pi/agent/templates` > `defaultBuiltinDir = builtinDir ?? bundledTemplateDir()` (pi-jit-agents' bundled dir). The builtin tier IS the templates home.
- `packages/pi-workflows/src/template.ts:94-100` — its `renderTemplateFile` is `env.render(templateName, …)` with NO absolute bypass; every ref goes through the loader.

### Contributing sub-facts (re-verified)

- Dispatch sites construct the env with NO builtin tier: `packages/pi-agent-dispatch/src/call-agent-tool.ts:79` and `work-order-loop.ts:167` both call `createTemplateEnv({ cwd })` — no builtin/bundled dir passed. So even a correctly-named (non-absolute) `extends` target could not resolve on the dispatch env.
- Three analyzer SYSTEM templates require the loader tier even from an absolute entry: `packages/pi-jit-agents/templates/analyzers/{quality,structure,patterns}.md:1` each begin `{% extends "analyzers/base-analyzer.md" %}` (verified via `head -1`). `extends` is resolved by the environment loader, not by `fs.readFileSync`, so an absolute-entry render still needs the builtin search path.
- `packages/pi-workflows/agents/phase-author.agent.yaml:17` carries `template: templates/phase-author/task.md` — a malformed `templates/` prefix that is broken on BOTH paths (executor loader has no such nested subdir; jit `resolveSpecPath` anchors it to a nonexistent `pi-workflows/agents/templates/phase-author/task.md`).

### Class statement

The two spec pipelines (workflow executor vs jit dispatch) resolve template refs by different mechanisms; bundled templates are loader-tier resources; any consumer of the jit parse + dispatch-env combination inherits the failure. Fixing one spec's path does not close the class — the mechanism divergence + missing builtin tier + `extends` dependency + one malformed prefix are all instances of the same divergence.

---

## CLASS B — dispatch model-resolution divergence: bundled specs are model-less by design; dispatch hard-throws

### Root cause

Bundled specs intentionally omit `model:` — model assignment is a substrate concern (`model-config` block, by role). The workflow-executor honors that with a documented precedence chain and omits `--models` when nothing resolves (pi's own default applies). The jit dispatch sites implement no such fallback: a model-less compiled spec hits a hard `throw`. So the entire bundled set is undispatchable on the jit path.

### Shape / per-anchor evidence (re-verified)

- Model-less by design: 0 of 26 specs declare `model:` (grep, above); `packages/pi-workflows/src/agent-spec.test.ts:291` asserts `spec.model === undefined` with the comment "model comes from .project/model-config.json, not agent spec".
- Both dispatch sites hard-throw: `packages/pi-agent-dispatch/src/call-agent-tool.ts:83-86` (`const modelSpec = compiled.model ?? spec.model; if (!modelSpec) throw …'has no model specified.'`) and `work-order-loop.ts:174-177` (same pattern, `work-order-loop:` message).
- The production precedence exists only on the workflow path: `packages/pi-workflows/src/dispatch.ts:76-85` — `step.model ?? agentSpec.model ?? modelConfig.by_role[role] ?? modelConfig.default`; `--models` is pushed ONLY when a model resolves (`if (model) { … args.push("--models", …) }`), so nothing-resolved → arg OMITTED, pi's default applies.
- `modelConfig` is read from the substrate: `packages/pi-workflows/src/workflow-executor.ts:765-772` — `readBlock(ctx.cwd, "model-config")` (at `:769`), tolerant of absence.
- pi-jit-agents has no model fallback: `packages/pi-jit-agents/src/compile.ts:574` passes `model: spec.model` verbatim into the compiled result; `executeAgent` requires an in-process model.

### Reproducible conditions

Any jit dispatch of a bundled spec: `call-agent`/work-order-loop loads the model-less spec, `compiled.model ?? spec.model` is `undefined`, the guard throws before spawn. Independent of Class A — even with templates resolving, dispatch dies at the model guard.

### Class statement

Dispatch diverges from the proven model-resolution surface (`dispatch.ts:76-85` + substrate `model-config`); every model-less spec — the entire bundled set — is undispatchable even after Class A is fixed.

---

## Prior-art coverage (substrate search reported by this session's probe + evaluation)

- **FGAP-127** (this branch's arc) covers only the loader / agents-tier omission — closed-in-flight by the tier wiring. It does NOT cover template-ref mechanism divergence (Class A) or model fallback (Class B).
- **FEAT-014 criterion 2** ("a dispatched target agent can act… WO-001 recipe passes end to end") is the umbrella these two classes block; it is the acceptance the classes prevent, not a tracker of them.
- **FGAP-124** `closed_by` names residuals 125 / 126 / 127 only — neither class here is among them.
- Neither Class A nor Class B is separately tracked in the substrate. Both are new filings (justified after the search confirmed no existing coverage).

## Test-coverage gap (re-verified)

No test on any path compiles a bundled spec:
- `packages/pi-agent-dispatch/src/dispatch-loader.test.ts` stops at `loadAgent(...)` (`:48,:69,:77`) — no `compileAgent` call.
- `packages/pi-agent-dispatch/src/call-agent-tool.test.ts` uses inline `prompt:` specs (`:43`), not bundled specs.
- `packages/pi-workflows/src/agent-spec.test.ts:282-368` is parse-only (`parseAgentYaml`), and its `compileAgentSpec` tests (`:232-280`) compile INLINE synthetic specs with tmpdir-written templates (`:234,:254,:268`), never a bundled spec.

Consequence: the green suite does not exercise the compile-or-dispatch of a real bundled spec, so both classes pass CI undetected. Regression coverage for either fix must compile/dispatch an actual bundled spec.
