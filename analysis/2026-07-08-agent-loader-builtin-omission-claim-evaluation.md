# Evaluation: "agent loaders omit the builtin dir discovery includes" claim

Date: 2026-07-08 · Evaluator: fresh-context session · Branch main @ dddecc20
Verdict headline: **correct-with-major-corrections** — the class as stated is wrong (conflates two loader families with opposite default semantics); only 2 of the 4 alleged omission sites are real; the substrate already tracks the real class as **FGAP-127**.

## Loader-family anatomy (two distinct implementations)

There are two `createAgentLoader` functions, with OPPOSITE meaning for an absent `builtinDir`.

### Family A — pi-jit-agents (`packages/pi-jit-agents/src/agent-spec.ts:219`)
`createAgentLoader(ctx: LoadContext)` — object arg. Tiers (agent-spec.ts:228-236):
1. `tryResolveContextDir(cwd)` → `<contextDir>/agents/<name>.agent.yaml` (project tier; agent-spec.ts:226,231)
2. `{ctx.userDir ?? ~/.pi/agent/agents}/<name>.agent.yaml` (agent-spec.ts:220,233)
3. `{ctx.builtinDir}/<name>.agent.yaml` — **ONLY when `ctx.builtinDir` is supplied** (agent-spec.ts:234-236). No default.
- **pi-jit-agents ships NO bundled agents dir** (`ls packages/pi-jit-agents/agents/` → none). So a caller that passes no `builtinDir` has NO builtin tier at all.
- Note: docblock at agent-spec.ts:212/216 and types.ts:96 say project tier is `{cwd}/.project/agents/`; the code resolves `<contextDir>/agents` via `tryResolveContextDir`. Stale docblock (already noted in FGAP-127 evidence).

### Family B — pi-workflows (`packages/pi-workflows/src/agent-spec.ts:136`)
`createAgentLoader(cwd: string, builtinDir?: string)` — string arg. Tiers (agent-spec.ts:140-144):
1. `{cwd}/.pi/agents/<name>.agent.yaml`
2. `~/.pi/agent/agents/<name>.agent.yaml`
3. `{builtinDir ?? bundledDir("agents")}/<name>.agent.yaml` — **DEFAULTS** to the package's bundled agents dir (agent-spec.ts:137).
- `bundledDir("agents")` = `packages/pi-workflows/agents/` (bundled-dirs.ts:23-27), which **contains 26 builtin `.agent.yaml` specs** (verified `ls`).
- Omitting `builtinDir` here does **NOT** drop builtins — they are searched by default.

**Crux:** the claim's "same omission" premise is false. Family A omission = no builtin tier. Family B omission = builtins still searched (default). Omitting `builtinDir` means opposite things in the two families.

## Per-site verdicts (import + arg re-derived this run)

| # | Site | Loader family (import) | Arg | Builtins searched? | Real omission? |
|---|------|------------------------|-----|--------------------|----------------|
| 1 | `packages/pi-agent-dispatch/src/call-agent-tool.ts:73` | A (`@davidorex/pi-jit-agents/agent-spec`, import :9) | `{ cwd: ctx.cwd }` | **NO** (no builtinDir, jit ships none) | **YES** |
| 2 | `packages/pi-agent-dispatch/src/work-order-loop.ts:164` | A (import :32) | `{ cwd }` | **NO** | **YES** |
| 3 | `packages/pi-workflows/src/index.ts:325,346,381,428,554,629,1071` | B (`./agent-spec.js`, import :20) | `createAgentLoader(ctx.cwd)` | **YES** (defaults bundledDir) | **NO** |
| 4 | `packages/pi-workflows/src/workflow-sdk.ts:432` (`validateWorkflow`) | B (import :12) | `createAgentLoader(cwd)` | **YES** (defaults bundledDir) | **NO** |

Correct-path sites cited by the claim (confirmed, both Family B): `packages/pi-behavior-monitors/index.ts:1356,1965` pass `AGENTS_DIR` (= `PACKAGE_ROOT/agents`, index.ts:54); `packages/pi-workflows/src/template-validation.ts:456` passes `builtinDir` passthrough. These pass an *explicit* builtinDir but, being Family B, would have defaulted to bundled anyway — the explicit pass is belt-and-suspenders, not a fix for an omission.

**Claim line-number accuracy:** call-agent-tool.ts:73 ✓. work-order-loop.ts:164 ✓ (claim said 164; FGAP-127's own text says :116 — stale, see prior-art). index.ts lines 325/346/381/428/554/629/1071 ✓. workflow-sdk.ts:432 ✓. workflow-sdk.ts:118 `availableAgents(cwd, builtinDir?)` ✓.

## Completeness verdict

Independent grep (`packages/`, excluding `/dist/`, `.test.ts`, `__tests__`): the ONLY production `createAgentLoader` call sites are the four above plus behavior-monitors:1356/1965 and template-validation:456. Two definitions (jit :219, workflows :136) and the barrel re-export (pi-jit-agents/src/index.ts:8). **No other production call sites.** Claim's completeness assertion holds. But it is completeness over a mis-drawn class: only sites 1–2 are genuine omissions.

## Asymmetry consequence (task 3) — REFUTED for the pair the claim names

Claim/premise: `availableAgents` (workflow-sdk.ts:118) defaults builtinDir while `validateWorkflow` (:432) omits it, so `workflow-agents` could list an agent that `workflow-execute`/`validateWorkflow` cannot load.
- `availableAgents` searches `.pi/agents` + `~/.pi/agent/agents` + `bundledDir("agents")` default (workflow-sdk.ts:119-124).
- `validateWorkflow` calls Family B `createAgentLoader(cwd)` (:432) → same three tiers incl. bundled default (agent-spec.ts:137).
- `workflow-execute`/resume/slash (index.ts) call Family B `createAgentLoader(ctx.cwd)` → same.
All three resolve the identical tier set. **They are SYMMETRIC; the asymmetry is refuted by source.** An agent `workflow-agents` lists (from bundled or `.pi/agents` or user tier) is loadable by `validateWorkflow` and `workflow-execute`. (Conclusion from source reading; no runtime eval run — the three defaults are literal and unconditional, so dist-staleness is immaterial to the conclusion.)

The **real** asymmetry is across families, not within Family B: the `call-agent` tool and work-order dispatch (Family A) resolve from `<contextDir>/agents` + user + (absent) builtin, and therefore **cannot reach the 26 bundled `pi-workflows/agents/` specs** (nor `.pi/agents`, since Family A uses `<contextDir>/agents` as its project tier). `workflow-execute` can load those 26; `call-agent`/work-order cannot. That cross-family divergence is the genuine defect.

## Prior-art coverage table

| Substrate item | Status | Covers |
|----------------|--------|--------|
| **FGAP-127** (framework-gaps) | identified, P1 | THE item. Names both real sites (call-agent-tool.ts:73 + work-order-loop; description body cites work-order-loop.ts:**116** — stale, now :164), the Family-A tier structure (`<contextDir>/agents`; builtinDir 3rd only when supplied), the 30+ packaged specs in pi-workflows/agents + pi-behavior-monitors/agents being unreachable for dispatch, the stale `.project/agents` docblock, and proposes wiring a bundled builtinDir into the dispatch loaders and/or seeding an agents tier. Frames the class as "install ceremony seeds a subset of the surfaces the runtime resolves from." |
| FGAP-126 | identified, P1 | Auth-gate non-interactive refusal for the dispatch ceremony. Adjacent (same 2026-07-07 dogfood), NOT the loader-builtin class. |
| issue-012 | open, critical | Stale `.project`-era provenance IDs in pi-agent-dispatch comments. Not the loader omission. |
| issue-012 / FGAP-106 / FGAP-072 / FGAP-008 | — | Surfaced by term sweeps ("seed"/"loader"); none touch the agent-loader builtin surface. |
| decisions matching "loader" | — | None. |

**Tracked portion:** the entire genuine class (Family A dispatch loaders — call-agent-tool.ts:73 + work-order-loop.ts:164 — omitting the builtin tier, and the resolution to wire a bundled builtinDir) is covered by FGAP-127.
**Untracked remainder:** none that is a genuine defect. Sites 3–4 (index.ts, workflow-sdk.ts:432) are not defects (Family B defaults bundled), so their absence from any filing is correct. The only currency defect is *internal to FGAP-127*: its description cites `work-order-loop.ts:116` where the loader construction now sits at `:164` (stale line ref, not a new gap).

## Corrected class statement (what I would file — but it is already FGAP-127, do not refile)

NOT "agent dispatch/validation loaders omit the package builtin directory that agent discovery includes" (false — discovery=Family B and validation=Family B share the same default; they do not diverge).

The true class: **two agent-loader families with divergent default resolution surfaces.** Family B (pi-workflows: workflow-execute, validateWorkflow, monitors, `availableAgents`) defaults `builtinDir` to the 26-spec bundled dir and uses `.pi/agents` as project tier; Family A (pi-jit-agents: `call-agent`, work-order dispatch) ships no bundled agents, defaults no builtin tier, and uses `<contextDir>/agents` as project tier — so agents reachable by the workflow surface are unreachable by the dispatch surface. FGAP-127 already files exactly this (as the ceremony-seeding framing, with the loader-wiring resolution). Correct action: **relate to / refine FGAP-127** (e.g. re-pin its stale `:116`→`:164`, and note the Family-B sites are non-defects to forestall a duplicate sibling filing), not a new item.
