# Shared CLI core across monorepo packages — design thinking

Status: exploratory (for further thinking — not a decision, not filed as FEAT/DEC yet).
Prompt: we'll eventually want a `pi-workflows` CLI (and possibly a jit-agent-dispatch CLI). What are the underlying commonalities any package CLI needs so we don't duplicate code — a single source for what's best single-source-editable, with each package adding its particulars? Minimalist best-practices view.

Grounded in exploration of `pi-context-cli` + the op/tool registration shapes of pi-workflows / pi-agent-dispatch / pi-behavior-monitors / pi-jit-agents (2026-06-05).

---

## 1. The corrective finding (don't build on the wrong seam)

`OpDefinition` is **not** a shared monorepo contract. It is pi-context's *internal* wrapper (`packages/pi-context/src/ops-registry.ts` ~`:201-210`); `registerAll(pi)` wraps each `OpDefinition` into a `pi.registerTool(...)` call. The other three extensions never import it.

The contract that is *already* single-sourced (in-pi) is **pi-mono's `pi.registerTool` / `AgentToolResult`** (`@earendil-works/pi-coding-agent`). All four extensions register identically:

```ts
pi.registerTool({ name, label, description, promptSnippet?, parameters: TSchema,
  async execute(toolCallId, params, signal, onUpdate, ctx: ExtensionContext): Promise<AgentToolResult<T>> })
```

So there is **no in-pi duplication to remove**. The duplication risk is entirely in the **CLI layer** — the machinery `pi-context-cli` already has and a second CLI would otherwise copy.

## 2. What's genuinely common (the CLI reflection engine)

From `packages/pi-context-cli/src/{bin,cli}.ts`, everything except the ops-import and the writer/identity model is generic:

- **argv → params** purely from the op's typebox `parameters` schema — `--field` convention, `@file`, scalar/number/boolean/string-enum/JSON coercion, required-field checking (`parseOpArgs`, `fieldType`, `stringEnumValues`). No pi-context field-name knowledge.
- **global flags** `--cwd` / `--json` / `--yes`|`--force` / `--help`.
- **auth-decision** logic: `authDecision(op, {yes})` — gates on the op's `authGated` boolean + `--yes` + TTY. (The *policy* — which ops are gated — is the op data; the *logic* is generic.)
- **help** generation (top-level + per-op), **exit codes**, the `{ok,op,output}` / `{ok,op,error}` **envelope**.
- **output layer**: `OpResult = string | {json} | {read}`, `renderOpResultText`, `boundedJsonOutput`, and the **50KB cap enforced at the output boundary**. This session showed the cap is bug-prone (the `{json}` channel bypass + the read-`.data` leak, FGAP-013/015); single-sourcing it means no CLI can re-open that class.

Package-specific is small: the **ops registry**, a **`buildContext` callback** (pi-context's `DispatchContext` + `resolveIdentity` git-email→$USER + `WriterIdentity`), the **writer-kind vocabulary** (`WRITER_KIND_IDENTIFIER_FIELD`), and **which ops are `authGated`**.

## 3. Minimalist shape

One small **`cli-core`** package, generic over a context type `Ctx` and a minimal op shape:

```ts
interface CliOp<Ctx> { name; description; parameters: TSchema; surface: "use"|"process";
  authGated?: boolean; run(cwd: string, params: P, ctx: Ctx): OpResult | Promise<OpResult> }

runCli({ programName, ops, buildContext, writerKinds?, authPolicy? })   // each package's bin.ts ≈ this single call
```

`cli-core` owns: parse/coerce, global flags, `authDecision`, help, exit codes. pi-context's existing `OpDefinition` already *is* an instance of `CliOp` — its CLI shrinks to a few lines (import ops + `buildCliDispatchContext` + call `runCli`).

### Layering subtlety (the load-bearing nuance)

`OpResult` + `renderOpResultText` + `boundedJsonOutput` + the cap are used by **both** the CLI **and** pi-context's in-pi `registerAll` (it renders tool text via `renderOpResultText`). So they must live in a base **both the extension and the CLI depend on** — putting them inside the CLI package would invert the dependency (extension → CLI).

Cleanest: a tiny **`op-io`** base (just `OpResult` + render + the boundary cap), depended on by:
- the extension's `registerAll` (in-pi tool text), and
- `cli-core` (CLI `--json` + text).

This is also where the cap-at-boundary invariant (FGAP-015) becomes structurally un-bypassable for *any* future surface.

## 4. The honest scope limit (do NOT over-build)

A reflection CLI only serves **request→response** ops. pi-context fits cleanly. The other packages' *marquee* surfaces do **not**, and sharing cannot change that:

| Package | Fits reflection CLI? | Why / why not |
|---|---|---|
| **pi-context** | Yes (today) | ops are sync request→response pure-library `run(cwd, params, ctx?)` |
| **pi-workflows** | Partial | simple ops reflect (`workflow-list`/`validate`/`status`/`agents`, `render-item-by-id`, `enforce-budget`); but `workflow-execute`/`resume` are long-running subprocess dispatch + checkpoint state + TUI (`ctx.ui`) — need a bespoke entry point, not reflection |
| **pi-agent-dispatch** | No (as-is) | gating is a pi-runtime `pi.on('tool_call')` handler; not reproducible outside pi |
| **pi-behavior-monitors** | No | tools read runtime state mutated by `agent_end` handlers; nothing to reflect outside pi |
| **pi-jit-agents** | N/A | pure library, no registered tools, no CLI |

So `cli-core` is the single source for the **request→response CLI projection** — pi-context now, the request→response subset of pi-workflows later. It is **not** a uniform CLI across all four. (Consistent with the per-package-CLI decision in `analysis/2026-06-03-pi-context-cli-design-ledger.md` point 1c.)

## 5. Single-source-editable vs per-package particulars

| Edited ONCE (`cli-core` / `op-io`) | Provided by each package |
|---|---|
| flag grammar + `--cwd`/`--json`/`--yes`/`--help` semantics | its ops registry (`CliOp<Ctx>[]`) |
| typebox→flag coercion (`@file`, enum, required) | `buildContext(explicitWriter, identity)` |
| `--json` structured + **cap-bounded** envelope; text render | writer-kind vocabulary + which ops are `authGated` |
| `authDecision` logic; help format; exit codes | a `tools → CliOp` adapter (trivial for pi-context; partial for pi-workflows) |

## 6. The adapter seam

To onboard a package: provide an adapter `tools → CliOp<Ctx>[]`.
- pi-context: identity (its `OpDefinition[]` already conforms).
- pi-workflows: wrap each *request→response* tool's `execute(toolCallId, params, signal, onUpdate, ctx)` → `run(cwd, params, ctx)`, dropping the toolCallId/signal/onUpdate it doesn't need; skip the long-running executors.

The pi-mono `registerTool` shape is the universal in-pi source; `CliOp` is the **CLI-facing projection of the request→response subset** of it.

---

## Open questions for further thinking

1. **`op-io` boundary.** Is a separate `op-io` package warranted, or should `OpResult`+render+cap live in pi-mono-adjacent shared utils, or stay in pi-context with `cli-core` taking them as injected fns? The deciding factor is who else (besides pi-context `registerAll` + `cli-core`) needs the cap-at-boundary; if pi-workflows' in-pi tool text should also be cap-bounded, `op-io` shared is the answer.
2. **`Ctx` genericity vs a shared `DispatchContext`.** Each package has its own run-context (pi-context: `DispatchContext`/`WriterIdentity`). Is there a *shared* attestation/identity model worth lifting (writer kinds, `resolveIdentity` git-email→$USER), or does each package keep its own and `cli-core` stays fully generic over `Ctx`? `resolveIdentity` looks genuinely shareable; the `WriterIdentity` *type* is pi-context's.
3. **pi-workflows long-running surface.** `workflow-execute`/`resume` need streaming/subprocess/state/TUI — out of scope for `cli-core`. Does pi-workflows-cli get TWO entry styles (reflected simple ops via `cli-core` + a bespoke `run`/`resume` command), or is the executor CLI a separate concern entirely. Risk: a half-reflected CLI that's inconsistent.
4. **Auth policy as a pluggable hook.** pi-context uses an `authGated` boolean per op + `--yes`; pi-agent-dispatch uses a runtime handler. If a dispatch CLI ever exists, `cli-core`'s `authPolicy?` hook would need to express "confirm interactively / refuse non-interactive" without the pi-runtime handler. Worth designing the hook shape once.
5. **The parity-check gate generalization.** `scripts/parity-check.ts` enforces op-coverage + ctx-forwarding + the cap + dual-surface dryRun parity for pi-context. If `cli-core` + `CliOp` become the contract, should the gate generalize to enforce the same invariants for *any* package adopting `cli-core` (e.g. a pi-workflows-cli)? That keeps the dual-surface + cap invariants monorepo-wide rather than pi-context-only.
6. **Naming / package count.** `cli-core` + `op-io` is two new small packages; lockstep-versioned with the rest. Is that the right granularity, or fold into one `cli-kit`. Minimalism argues for the fewest packages that don't invert dependencies.

## Verification note

The "what fits / what doesn't" table is empirically grounded (the registration shapes + execution models were read from each package's `src/`), but the `cli-core`/`op-io` split is a *proposal* — before any implementation it would go through the canonical pipeline (plan → coding subagent → adversarial audit), starting by re-confirming the `registerAll`↔CLI shared-output coupling and whether pi-workflows' simple ops truly reflect without their `ExtensionContext` UI dependencies.
