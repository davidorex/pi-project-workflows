# Feasibility: Main Interactive Agent BECOMING One of Our pi-jit-agents (extension-only, pi 0.75.4, no fork)

Date: 2026-05-21
Scope: read-only investigation. No source edits, no npm/git. SDK install version 0.75.4 (local `node_modules` and global `/opt/homebrew/...` are byte-identical aside from owner; same `dist`).
Question: can a pi EXTENSION reshape the live main session (the harness-confined main LLM the user talks to) to assume one of our compiled `AgentSpec`s — system prompt, injected contextBlocks, tool surface, model/thinking, output contract — with no fork to pi?

---

## 1. Verdict

**Feasible to a HIGH but PARTIAL degree, extension-only, no fork.** The main session can be reshaped to wear an entire jit-agent spec's *behavioral* facets — system prompt, context-block injection, tool surface, model, thinking — through documented, runtime-honored SDK hooks. What is NOT achievable extension-only is the **hard output contract** (forced-toolChoice / schema-guaranteed JSON) for the interactive main agent, and a small set of edge limits (true tool-set narrowing below the configured-tool universe, provider-specific forced-tool gaps inherited from F-012).

Decisive enabling hooks (the 2 that carry the design):

1. **`before_agent_start` → `result.systemPrompt`** — runtime-honored: `agent-session.js:791-797` sets `this.agent.state.systemPrompt = result.systemPrompt`, which is snapshotted into the loop at `pi-agent-core/dist/agent.js:273` and sent to the wire at `pi-agent-core/dist/agent-loop.js:182`. This REPLACES the main system prompt for the entire prompt-to-completion arc (all tool-use turns of one user turn). This is the single most important lever — it lets our compiled `systemPrompt` (which already carries contextBlocks via Nunjucks injection) become the main agent's system prompt verbatim.
2. **`pi.setActiveTools` + `pi.setModel` + `pi.setThinkingLevel`** (from a `registerCommand` handler) — runtime-honored mutators that pin the tool surface (`agent-session.js:528-542` rebuilds `agent.state.tools`), model (`:1078-1090`), and thinking level (`:1155-1174`). These shape the remaining spec facets.

Decisive hard limits (the 2 that block "full"):

1. **No forced-toolChoice / output schema enforcement on the main interactive agent.** Our `executeAgent` enforces `output.schema` by passing a phantom tool + forced `toolChoice` directly to pi-ai's `complete` (`jit-runtime.ts:526-532`). The interactive main loop builds its own provider payload from `agent.state` and the *active tool registry*; an extension cannot inject a forced single-tool `toolChoice` for the next main turn through any typed result field. The only wire-level seam (`before_provider_request` / `onPayload`, `anthropic.js:325`) is `payload: unknown` — usable but provider-shape-specific and unsupported-as-contract. So the spec's `output.format: json` / `output.schema` becomes prompt *instruction*, not a *guarantee*, for the main agent.
2. **F-012 inheritance.** Even via the wire seam, forced tool-use is unenforceable on `openai-responses`-family + Google providers (`jit-runtime.ts:264-296`); the main agent under those providers cannot get even best-effort forced output.

In short: the main agent can *behave as* a jit-agent (prompt + context + tools + model + thinking) seamlessly; it cannot be *contractually bound to a jit-agent's typed output* the way `executeAgent` binds an in-process dispatch.

---

## 2. SDK lever ↔ jit-agent-facet mapping

Facet column = a field of our `AgentSpec` / `CompiledAgent` (`packages/pi-jit-agents/src/types.ts`). "Mutates live session?" = does the hook change what the *next main turn* actually sends, not merely observe. Seam: seamless / partial / impossible-without-fork.

| Facet | SDK hook | Mutates live session? | Seam | Cite |
|---|---|---|---|---|
| **systemPrompt** (replace) | `before_agent_start` → `BeforeAgentStartEventResult.systemPrompt` | YES — replaces for the whole user-turn arc | seamless | result type field `types.d.ts:735-739` ("Replace the system prompt for this turn. If multiple extensions return this, they are chained."); honored `agent-session.js:791-797`; snapshot `pi-agent-core/agent.js:273`; wire `pi-agent-core/agent-loop.js:182`; assembled into `params.system` `pi-ai/providers/anthropic.js:686-699` |
| **systemPrompt** (append) | `BuildSystemPromptOptions.appendSystemPrompt` | indirectly — only via base rebuild | partial | `system-prompt.d.ts:14-15`, `system-prompt.js:16,102-104`. Reachable by an extension only through `_rebuildSystemPrompt` (`agent-session.js:621-636`) which the extension does not call directly; the loader's `getAppendSystemPrompt()` feeds it. `before_agent_start.systemPrompt` is the direct replace path; append is a base-construction concern, not a per-turn extension lever |
| **contextBlocks injection** (compose into system prompt) | `before_agent_start.systemPrompt` (carries our already-rendered `compiled.systemPrompt`, which Nunjucks-injects `_<name>` blocks wrapped `<context_block role="data">`) | YES | seamless | our injection: `compile.ts:162-187,407-502`; delivered as part of replaced system prompt per row 1 |
| **contextBlocks injection** (per-turn, as a message) | `context` event → `ContextEventResult.messages` | YES — runs every turn | seamless (data plane) | `types.d.ts:451-455,710-712`; runtime `runner.js:639-666`; wired as `transformContext` `sdk.js:235-240`; invoked every turn `pi-agent-core/agent-loop.js:175-176`. Returns the full replacement message array; an extension can prepend a synthetic context message |
| **contextBlocks injection** (one-shot alongside user msg) | `pi.sendMessage(..., {deliverAs:"nextTurn"})` / `BeforeAgentStartEventResult.message` | YES, once | seamless | `types.d.ts:832-836,735-736`; nextTurn injection `agent-session.js:770-789` |
| **tool surface** (constrain to spec.tools) | `pi.setActiveTools(names)` | YES — rebuilds `agent.state.tools` + base prompt; next turn | seamless *within configured universe* | `types.d.ts:858-859`; impl `agent-session.js:528-542` ("Changes take effect on the next agent turn"); snapshot to wire `pi-agent-core/agent.js:275`, `agent-loop.js:184`. Constraint: only names already in `_toolRegistry` survive (`:531-537`) — cannot enable a tool the session was not configured with |
| **tool surface** (enumerate / restore) | `pi.getActiveTools()`, `pi.getAllTools()` | observe only | seamless | `types.d.ts:855-857`; `agent-session.js:1741-1742` |
| **tool surface** (veto/rewrite a call) | `tool_call` event → `ToolCallEventResult.block` + in-place `event.input` mutation | YES (per call) | seamless | `types.d.ts:622-628,714-718` ("event.input is mutable… mutate in place… No re-validation"). A coarser secondary lever; `setActiveTools` is the primary one |
| **model** (pin to spec.model) | `pi.setModel(Model)` (resolve string→Model via `ctx.modelRegistry`) | YES — sets `agent.state.model`; next turn | seamless | `types.d.ts:862-863`; impl `agent-session.js:1078-1090,1746-1751`; resolve-by-string `model-resolver.d.ts:19,39` (`findExactModelReferenceMatch`/`parseModelPattern`) against `modelRegistry.getAvailable()` (`model-registry.d.ts:56`); registry on ctx `types.d.ts:216-217`. Returns false / throws if no API key (`:1079-1081`) |
| **thinking** (pin to spec.thinking) | `pi.setThinkingLevel(level)` | YES — clamped to model caps; next turn | seamless | `types.d.ts:865-867`; impl `agent-session.js:1155-1174`; snapshot path `agent.js:138-143` (`reasoning`) |
| **output.format / output.schema** (hard JSON / forced tool) | none typed for main agent; only `before_provider_request`/`onPayload` wire seam | PARTIAL — wire payload mutable but `unknown`, provider-shape-specific, not a contract | impossible-without-fork (as a *guarantee*); partial (as best-effort + prompt instruction) | result type `BeforeProviderRequestEventResult = unknown` (`types.d.ts:713`); runtime `runner.js:668-699`; wired `sdk.js:216-222`; call site `pi-ai/providers/anthropic.js:325`. No `toolChoice`-injecting typed field exists for the interactive loop. Contrast our enforcing path: `jit-runtime.ts:526-532` |
| **role / inputSchema** | n/a (consumer-side metadata; no live-session analogue) | — | n/a | `types.ts:24,38`; `role` only steers model-by-role in subprocess dispatch `dispatch.ts:80` |
| **skills** (scope to spec.skills) | no per-turn mutator; skills are baked at base-prompt build | partial | partial | `system-prompt.js:33-37,114-117` append skills into base prompt; an extension replacing `systemPrompt` via `before_agent_start` can simply omit/include skill text itself — so functionally reachable through row 1, not through a dedicated skills lever |
| **extensions** (scope to spec.extensions) | n/a live | impossible-without-fork (mid-session) | impossible | extension set is resolved at load (`--no-extensions`/`--extension` flags, `dispatch.ts:103-106`); `ctx.reload()` exists (`types.d.ts:275`) but reloads from disk config, not to an arbitrary spec-declared set |

---

## 3. Cleanest extension design sketch (IF pursued)

A "be-this-jit-agent" extension that reshapes the main session, using only the seamless hooks above. This is a design sketch for edification, not an authorization to build.

**Activation seam — a slash command.** `registerCommand("be-agent", …)` (`types.d.ts:816`). The command handler receives `ExtensionCommandContext` and runs in the control plane while idle. It is the clean enter point because the user types `/be-agent <name>` and state mutations it performs (model/tools/thinking) take effect on the *next* turn — exactly the SDK's documented timing.

Handler lifecycle:

1. **Load + compile our spec.** `createAgentLoader({cwd}).(name)` → `compileAgent(spec, {env, input, cwd})` (`agent-spec.ts:219`, `compile.ts:217`). This yields `compiled.systemPrompt` (already carrying `<context_block role="data">`-wrapped contextBlocks) + `compiled.spec.tools/model/thinking`.
2. **Pin model + thinking.** Resolve `spec.model` string → `Model` via `ctx.modelRegistry` + `findExactModelReferenceMatch`; `await pi.setModel(model)`; `pi.setThinkingLevel(spec.thinking ?? "off")`.
3. **Constrain tools.** `pi.setActiveTools(spec.tools ?? [])` (names must pre-exist in the registry).
4. **Impose the system prompt per turn.** Register a persistent `before_agent_start` handler that, while "agent mode" is active, returns `{ systemPrompt: compiled.systemPrompt }` every turn (`types.d.ts:796`, honored `agent-session.js:791-797`). Store the active compiled spec in extension state; the handler is a no-op when inactive. (Alternatively/additionally a `context` handler to inject fresh contextBlocks each turn as a synthetic message — useful if blocks change mid-session.)
5. **Output contract — best effort only.** Append to the imposed system prompt a hard instruction ("respond with raw JSON matching <schema>, no fences") and, if the provider is Anthropic-family, optionally an `before_provider_request` handler that rewrites `payload` to add `tool_choice` for a phantom tool (mirrors `normalizeToolChoice` Anthropic branch, `jit-runtime.ts:284-286`). This is unsupported-shape territory; treat as degraded, not guaranteed.

**Exit / state restore.** `/be-agent off`: deactivate the `before_agent_start` flag (next turn falls back to base prompt automatically — `agent-session.js:794-796` resets to `_baseSystemPrompt` when no extension returns a systemPrompt); call `pi.setActiveTools(savedToolNames)` and `pi.setModel(savedModel)` / `setThinkingLevel(savedLevel)` captured at activation. Tool/model/thinking do NOT auto-restore — the extension must snapshot-and-restore them explicitly (capture `getActiveTools()`/`ctx.model`/`getThinkingLevel()` at step 0). System prompt self-restores; the three mutators do not.

**Persistence across sessions/compaction.** `pi.appendEntry(customType, data)` (`types.d.ts:844-845`) can persist "currently being agent X" so a resumed session re-applies. `session_start` (`types.d.ts:381-388`) is the re-apply hook. Compaction (`session_compact`) does not touch the live `agent.state.systemPrompt`, so the imposed prompt survives a compaction within the same run.

---

## 4. Hard limits / what needs a pi fork

Specific, cited, honest:

1. **Output-schema GUARANTEE for the main agent.** There is no typed extension result that forces the interactive loop's next provider call to use a forced `toolChoice`. `BeforeProviderRequestEventResult` is `unknown` (`types.d.ts:713`) — you *can* mutate the wire payload (`runner.js:668-699`, `anthropic.js:325`) but (a) the shape is provider-specific and undocumented as a stable contract, and (b) nothing re-validates the model's output against the schema in the interactive path the way `executeAgent` does post-hoc (`jit-runtime.ts:604-617`). Guaranteed structured output for the main agent needs a fork (or pi adding a typed `toolChoice`/output-schema field to a per-turn result type).
2. **F-012 provider gaps** persist even through the wire seam: `openai-responses` / `openai-codex-responses` / `azure-openai-responses` drop or hardcode `tool_choice`; Google accepts only string mode (`jit-runtime.ts:262-296`). Forced output is unenforceable there regardless of fork-vs-extension at the consumer layer — it is a pi-ai upstream gap.
3. **True tool-set widening below/above the configured universe.** `setActiveTools` filters to names already registered (`agent-session.js:531-537`). An extension cannot grant the main agent a tool the session was not started with (it *can* register its OWN tools via `pi.registerTool`, `types.d.ts:813-814` — those then become eligible). Narrowing is fine; arbitrary widening to a spec's tool list that includes never-loaded extension tools requires those extensions to be loaded at startup.
4. **Mid-session extension-set swap** to match `spec.extensions`. Only `ctx.reload()` (disk config) exists (`types.d.ts:275`); there is no API to load an arbitrary extension set for the live session. Fork territory if the spec's `extensions` must be honored dynamically.
5. **`appendSystemPrompt` as a per-turn lever.** It is a *base-construction* input (`system-prompt.js:16`), reachable by the extension only indirectly; the per-turn replace lever is `before_agent_start.systemPrompt`. Not a limit on capability (replace subsumes append), but a limit on using `appendSystemPrompt` specifically.

Caveat on runtime-honoring confidence: the systemPrompt-replace path is confirmed end-to-end in code (result field → `agent.state.systemPrompt` → loop snapshot → wire). The `before_provider_request` payload mutation is confirmed *invoked* (`anthropic.js:325`) but I did NOT execute a live turn to confirm a `toolChoice` injection is honored by every provider's downstream serialization — treat the output-contract wire seam as code-plausible, not runtime-verified.

---

## 5. Relation to our existing dispatch model — is in-session reshaping a 3rd modality?

We have two dispatch modalities today:

- **Subprocess** (`pi-workflows/src/dispatch.ts`): `pi --mode json` child process; spec facets imposed via CLI flags — `--models model:thinking` (`dispatch.ts:82-85`), `--tools`/`--extension` (`:88-106`), `--append-system-prompt` tmpfile (`:153-160`), `-p` task prompt. Fresh context window, full isolation, the main conversation is the control plane.
- **In-process** (`pi-jit-agents/src/jit-runtime.ts` `executeAgent`): direct pi-ai `complete` call; spec facets imposed as a constructed `context` ({messages, systemPrompt, tools}) + `ProviderStreamOptions`; **hard output contract via phantom tool + forced toolChoice** (`:526-532`); post-hoc schema validation (`:604-617`). No session, no TUI, no tool-execution loop — single completion.

**In-session reshaping would be a genuine 3rd modality** with a distinct property neither existing one has: the spec runs in the *user's live, interactive, persistent session* — same context window the user is in, full TUI, full tool-execution loop, user can converse mid-task and exit back to the base agent. Subprocess = isolated + fresh; in-process = isolated + single-shot; in-session = shared + interactive + reversible.

Its decisive *weakness* vs the other two: it inherits the interactive loop's inability to bind a hard output contract (§4.1). Subprocess can pass `--output`-style structured constraints and in-process has the phantom-tool guarantee; in-session can only instruct + best-effort-wire-mutate. So it is strong exactly where the others are weak (live interactivity, zero spawn cost, context continuity) and weak exactly where they are strong (typed output guarantee).

**Assessment: worth a future FGAP, not a dead end** — but framed honestly. It is a real third modality with a clear use-case (turn the main agent into a specialized jit-agent for a stretch of interactive work — e.g. "be the roadmap-curation agent now" — without spawning or losing context). It is NOT a replacement for `executeAgent`'s contract path: anything that needs a *validated typed result* should stay on subprocess or in-process. A FGAP should scope it as "interactive in-session jit-agent persona" with the §4 limits stated as accepted constraints, and should explicitly defer the output-contract piece to either (a) the prompt-instruction degraded mode or (b) an upstream pi request for a per-turn typed output-schema field. It also pairs naturally with P1 (one uniform agent concept): the same `AgentSpec` would now drive a third consumer (the live session) with no new spec shape — which is exactly the P3 recreatability test, applied to a new invocation site.

---

### Appendix — primary citations (verbatim load-bearing)

- `before_agent_start` result honored: `agent-session.js:791-793` — `if (result?.systemPrompt) { this.agent.state.systemPrompt = result.systemPrompt; }` ... `:796` else resets to `_baseSystemPrompt`.
- result type: `extensions/types.d.ts:737-738` — `/** Replace the system prompt for this turn. If multiple extensions return this, they are chained. */ systemPrompt?: string;`
- chaining: `extensions/runner.js:728-731` — later handlers see earlier `currentSystemPrompt`.
- per-turn snapshot: `pi-agent-core/dist/agent.js:273` — `systemPrompt: this._state.systemPrompt` (createContextSnapshot); held constant across the inner tool loop (`agent-loop.js:77-167` never re-reads systemPrompt).
- wire: `pi-agent-core/dist/agent-loop.js:182` — `systemPrompt: context.systemPrompt`; assembled `pi-ai/providers/anthropic.js:686-699`.
- context event per turn: `agent-loop.js:175-176` — `if (config.transformContext) messages = await config.transformContext(messages, signal);` wired `sdk.js:235-240`.
- before_provider_request wire seam: `sdk.js:216-222`, call site `pi-ai/providers/anthropic.js:325`, result `unknown` `types.d.ts:713`.
- setActiveTools: `agent-session.js:528-542`; setModel `:1078-1090`; setThinkingLevel `:1155-1174`.
- our enforcing output path (contrast): `pi-jit-agents/src/jit-runtime.ts:526-532` + post-hoc validate `:604-617`.
