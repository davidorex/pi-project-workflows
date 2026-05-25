# Pi self-docs + "extend Pi" mechanism — investigation

Date: 2026-05-25
Scope: research-only. No pi-mono / node_modules sources modified.

## Sources + version skew (read this first)

- PRIMARY source: `/Users/david/Projects/pi-mono/packages/coding-agent` — **version 0.62.0** (`packages/coding-agent/package.json` `"version": "0.62.0"`).
- PUBLISHED dist consumed by this repo: `/Users/david/Projects/workflowsPiExtension/node_modules/@earendil-works/pi-coding-agent` — **version 0.75.4**.
- pi-mono is STALE vs the shipped build (0.62.0 vs 0.75.4). The launch-banner string does **not** exist in pi-mono source at all — it was added between 0.62 and 0.75.4. Therefore:
  - Banner / onboarding citations are from the **published dist** (authoritative for shipped behavior).
  - The underlying doc-lookup mechanism (system-prompt text, getDocsPath, skills formatting) exists in BOTH and is **verbatim-stable** across the skew (verified line-by-line below), so pi-mono `src/` citations are used for the mechanism and confirmed against the dist.

---

## 1. The launch banner — where + how

Emitted as a **TUI header element shown to the USER**, not injected into the agent context.

`node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/interactive-mode.js:442`:
```js
const onboarding = theme.fg("dim", `Pi can explain its own features and look up its docs. Ask it how to use or extend Pi.`);
```
Line 443 wires it into `this.builtInHeader = new ExpandableText(...)` (the startup header / logo block), added to `this.headerContainer` (lines 445-447). It is `theme.fg("dim", ...)` styled terminal text. The `else` branch (line 449-452) replaces it with an empty `Text` when the header is silenced.

Startup flow: interactive mode constructs the header during UI setup; banner renders unconditionally unless the header is silenced (quiet/minimal mode). It is **pure display marketing of a capability the system prompt already grants** — it does not itself put any knowledge into the model. The companion line 441 `compactOnboarding` ("Press … to show full startup help and loaded resources.") is also user-facing only.

---

## 2. Docs-lookup mechanism — what it actually is

**Verdict: (c)-as-pointers + the agent's normal `read` tool. There is NO dedicated docs tool, NO docs skill, NO search/index/RAG.**

The system prompt embeds **absolute filesystem paths** to the shipped README, `docs/` dir, and `examples/` dir, plus a topic→file map, and instructs the model to open them with its ordinary `read` tool when (and only when) the user asks about pi.

`pi-mono/packages/coding-agent/src/core/system-prompt.ts:137-143` (identical text in dist `core/system-prompt.js:94-101`):
```
Pi documentation (read only when the user asks about pi itself, its SDK, extensions, themes, skills, or TUI):
- Main documentation: ${readmePath}
- Additional docs: ${docsPath}
- Examples: ${examplesPath} (extensions, custom tools, SDK)
- When asked about: extensions (docs/extensions.md, examples/extensions/), themes (docs/themes.md), skills (docs/skills.md), prompt templates (docs/prompt-templates.md), TUI components (docs/tui.md), keybindings (docs/keybindings.md), SDK integrations (docs/sdk.md), custom providers (docs/custom-provider.md), adding models (docs/models.md), pi packages (docs/packages.md)
- When working on pi topics, read the docs and examples, and follow .md cross-references before implementing
- Always read pi .md files completely and follow links to related docs (e.g., tui.md for TUI API details)
```
The 0.75.4 dist adds ONE extra line (dist `core/system-prompt.js:98`) clarifying path resolution:
```
- When reading pi docs or examples, resolve docs/... under Additional docs and examples/... under Examples, not the current working directory
```

Path construction — the paths point INTO the installed package, computed from the package dir:
- `getDocsPath()` → `resolve(join(getPackageDir(), "docs"))` (`config.ts:147-149`)
- `getReadmePath()` → `…/README.md` (`config.ts:142-144`)
- `getExamplesPath()` → `…/examples` (`config.ts:152-154`)
- `getPackageDir()` walks up from the module dir to the nearest `package.json` (`config.ts:95-103`).

The shipped `docs/` dir (29 files, `node_modules/@earendil-works/pi-coding-agent/docs/`) is the corpus: `index.md`, `extensions.md` (97KB), `skills.md`, `sdk.md`, `tui.md`, `themes.md`, `keybindings.md`, `prompt-templates.md`, `custom-provider.md`, `models.md`, `packages.md`, etc., plus `docs.json` (a navigation manifest used by the docs *website*, not by the agent) and an `examples/` sibling dir of working extension/tool/SDK code.

So "look up its docs" = the model issues a `read` (or bash/grep) tool call against those absolute paths and follows the markdown cross-references. The docs are written self-referentially (each `.md` links related `.md`s; the system prompt explicitly says "follow links to related docs").

---

## 3. Self-knowledge injection — the exact text the model sees

The grant lives entirely in the system prompt. Two relevant pieces:

(a) The framing line, `system-prompt.ts:127`:
```
You are an expert coding assistant operating inside pi, a coding agent harness.
```

(b) The docs block quoted in §2. That block is what TELLS the model it can explain pi + where to read to do so. There is **no separate "you can explain pi" sentence** — the capability is implicit in (i) the harness identity, (ii) the absolute doc paths, and (iii) the "read … when the user asks about pi itself" instruction. The model "explains pi's features" by reading the shipped docs on demand and summarizing.

For the "extend pi" half specifically, the docs themselves carry an invitation banner at the TOP of the relevant doc files (these are read by the agent only after it opens the file, so they reinforce on-demand, not eager):
- `docs/extensions.md:1`: `> pi can create extensions. Ask it to build one for your use case.`
- `docs/skills.md:1`: `> pi can create skills. Ask it to build one for your use case.`

---

## 4. Eager vs on-demand — DEFINITIVE VERDICT

**ON-DEMAND. The doc/feature CONTENT is never loaded into the agent context at startup.** What is eager is only a tiny always-present POINTER (the ~8-line docs block of absolute paths + topic map in the system prompt). The bytes of `extensions.md`, `sdk.md`, etc. reach the model only when the model itself issues a `read` tool call.

Evidence:
- The system prompt instruction is explicitly conditional: "read **only when the user asks** about pi itself" (`system-prompt.ts:137`).
- `buildSystemPrompt` (`system-prompt.ts:28-168`) interpolates `${docsPath}` / `${readmePath}` / `${examplesPath}` as **path strings** only. It never calls `readFileSync` on any docs file; no doc body is concatenated into the prompt.
- A repo-wide grep for doc-content reads (`readFileSync.*docs` / `getDocsPath()`) outside system-prompt/config finds only **error-message path references** (e.g. `core/sdk.ts:217`, `core/agent-session.ts:944,962` print `…providers.md` in a "no models" hint) — i.e. paths, never injected content.
- The only thing eagerly read into the prompt are user PROJECT context files (CLAUDE.md/AGENTS.md-style) and skill metadata (name/description/location — not bodies), via `buildSystemPrompt`'s `contextFiles` / `skills` params (`system-prompt.ts:149-161`). Pi's own docs are NOT in that path.

This is a **small-always-present-pointer + on-demand-fetch hybrid**, weighted overwhelmingly to on-demand: the eager part is ~8 lines of pointers; the content is pulled lazily.

---

## 5. End-to-end control + data path

1. Launch → interactive mode builds TUI header incl. the dim banner (`interactive-mode.js:442-447`). User sees "Pi can explain its own features and look up its docs."
2. At session start, `agent-session.ts` builds the base system prompt: `_rebuildSystemPrompt` (`agent-session.ts:836-861`) → `buildSystemPrompt({...skills, contextFiles, selectedTools})`. The prompt now contains the docs-pointer block (absolute paths + topic map) — but NO doc bodies.
3. User asks "how do I use/extend pi?". The model already has in-context: harness identity, the docs-pointer block, the topic→file map, and the `read` tool.
4. Model maps the question to a file via the topic map (e.g. "extend" → `docs/extensions.md`, `examples/extensions/`), then issues a `read` tool call against the absolute `${docsPath}/extensions.md`.
5. The `read` tool returns the markdown body → that is HOW doc content reaches the model (as a tool result, lazily). The model follows `.md` cross-references (instructed to "follow links") with further `read` calls.
6. Model answers from the freshly-read content.

Control plane = system-prompt instruction. Data plane = the generic `read` tool returning file bytes. No bespoke docs API anywhere in the path.

---

## 6. "Extend Pi" specifically

- Topic map routes "extensions" → `docs/extensions.md` + `examples/extensions/`; "skills" → `docs/skills.md`; "SDK" → `docs/sdk.md`; "custom providers" → `docs/custom-provider.md`; "themes/keybindings/models/packages/prompt-templates" → their respective files (all enumerated in `system-prompt.ts:141`).
- `docs/extensions.md` (97KB) is the authoring guide: `pi.registerTool()`, `pi.registerCommand()`, event interception, `ctx.ui`, placement (`~/.pi/agent/extensions/` or `.pi/extensions/`), `/reload`, and a Table of Contents with anchor cross-refs. Top line invites: "pi can create extensions. Ask it to build one for your use case." (`docs/extensions.md:1`). It points to `examples/extensions/` for runnable implementations.
- So the "extend" path is the same on-demand `read` mechanism, just routed to the authoring docs + worked examples.

This is the direct analogue of our "guide the user to author their own config/conception" need: ship the authoring docs + examples in the package, embed absolute pointers + a topic map in the prompt, and let the model read them on demand.

---

## 7. Tools vs skills at the context level

Skills follow the **same on-demand pattern** as docs, and are likewise pointer-eager / content-lazy:
- Skills are surfaced in the system prompt only as **metadata** (name + description + location), via `formatSkillsForPrompt` (`core/skills.ts:339-365`):
  ```
  The following skills provide specialized instructions for specific tasks.
  Use the read tool to load a skill's file when the task matches its description.
  …
  <available_skills>
    <skill><name>…</name><description>…</description><location>…</location></skill>
  </available_skills>
  ```
  The skill BODY is loaded only when the model `read`s the `<location>` path — explicitly "Use the read tool to load a skill's file when the task matches its description" (`skills.ts:348`).
- Skills with `disableModelInvocation=true` are excluded from the prompt entirely (model-invisible; only `/skill:name` invokable) — `skills.ts:336-340`.
- Skills are gated by `--no-skills` / `-ns` (`src/cli/args.ts:143-144`, help text `args.ts:220`), threaded `main.ts:668` → `resource-loader.ts` `noSkills` (`resource-loader.ts:219`), which sets `includeDefaults: false` and skips default skill dirs (`resource-loader.ts:408,458-465`). When skills are off, the `<available_skills>` block is simply absent (empty `formatSkillsForPrompt` returns `""`, `skills.ts:342-344`).
- Skill load locations: `~/.pi/agent/skills/`, `~/.agents/skills/`, `.pi/skills/` (`docs/skills.md`).

**Tools**, by contrast, are listed by name + one-line snippet directly in the prompt's "Available tools" section (`system-prompt.ts:85-88,129-130`) and are callable immediately — no read step. So: tools = name+snippet eager, callable now; skills = metadata eager, body on-demand via `read`; docs = path pointers eager, body on-demand via `read`. The docs are NOT gated by `--no-skills` (they are unconditional prompt text, independent of the skills subsystem).

---

## Most adoptable patterns for our onboarding

1. **Pointer-eager / content-lazy.** Put only a small fixed block in the always-present context: absolute paths to the shipped catalog/docs + a topic→file map. Let the in-pi LLM pull bodies via its existing `read` tool when the user asks. Zero token cost until needed; the corpus can be arbitrarily large.
2. **Topic→file routing map in the system prompt.** The single highest-leverage line is `system-prompt.ts:141` — it pre-resolves "user concept → exact file path" so the model never has to discover the layout. For us: map "what blocks exist / how do I add a block kind / how do I write a conception" → `samples/conception.json`, the relevant schema files, the authoring how-to.
3. **Self-documenting corpus + invitation banners.** Ship docs that cross-link each other ("follow links to related docs") and open authoring docs with a one-line invitation ("pi can create extensions. Ask it to build one."). The agent then needs no bespoke tooling — only `read` + good internal links. The user-facing TUI banner is independent marketing; the actual capability is the prompt pointer block.

Counter-note for us: this means we likely do NOT need a dedicated "explain-the-framework" tool/skill. A pointer block in the in-pi system context + a shipped, cross-linked docs corpus (with a topic map) + the existing read tool reproduces pi's mechanism exactly.

---

## Extension-API replication (0.75.4)

Date: 2026-05-25. Sources: shipped `node_modules/@earendil-works/pi-coding-agent` (`package.json` `"version": "0.75.4"`) — `dist/core/extensions/types.d.ts`, `dist/core/extensions/runner.js`, `dist/core/agent-session.js`, `dist/core/resource-loader.js`, `dist/core/skills.js`, and `docs/extensions.md`. pi-mono (0.62.0) NOT consulted for this section — shipped dist/docs are authoritative.

### Deciding question answered: YES — an extension CAN inject eager, always-present system-prompt context

There are TWO independent extension channels that put eager (model-visible-without-being-asked) content into the agent, plus tool descriptions as a third. The decisive one is the `before_agent_start` event's `systemPrompt` return field.

#### Channel 1 (primary) — `before_agent_start` returns `{ systemPrompt }` — full system-prompt rewrite/append, chained

The event interface, `dist/core/extensions/types.d.ts:468-478`:
```ts
export interface BeforeAgentStartEvent {
    type: "before_agent_start";
    prompt: string;                              // raw user prompt (after expansion)
    images?: ImageContent[];
    systemPrompt: string;                        // the fully assembled system prompt string
    systemPromptOptions: BuildSystemPromptOptions;
}
```
The result interface, `types.d.ts:735-739`:
```ts
export interface BeforeAgentStartEventResult {
    message?: Pick<CustomMessage, "customType" | "content" | "display" | "details">;
    /** Replace the system prompt for this turn. If multiple extensions return this, they are chained. */
    systemPrompt?: string;
}
```
Registration, `types.d.ts:796`:
```ts
on(event: "before_agent_start", handler: ExtensionHandler<BeforeAgentStartEvent, BeforeAgentStartEventResult>): void;
```

Runtime proof of chaining + application:
- `dist/core/extensions/runner.js:700-752` `emitBeforeAgentStart`: seeds `currentSystemPrompt = systemPrompt`, loops every extension's `before_agent_start` handlers, and on each non-undefined `result.systemPrompt` does `currentSystemPrompt = result.systemPrompt; systemPromptModified = true;` (lines 728-731) — so each handler receives the prior handler's modified prompt (line 719 passes `systemPrompt: currentSystemPrompt` into the next event). Returns the final `currentSystemPrompt` (line 749).
- `dist/core/agent-session.js:776` calls `emitBeforeAgentStart(...)` per user prompt; `:791-792` applies it: `if (result?.systemPrompt) { this.agent.state.systemPrompt = result.systemPrompt; }`. The `else` (`:794-796`) resets to `this._baseSystemPrompt`.

Authoritative doc, `docs/extensions.md:466-501`. Quoting the canonical example (`:486-495`):
```ts
return {
  message: { customType: "my-extension", content: "Additional context for the LLM", display: true },
  systemPrompt: event.systemPrompt + "\n\nExtra instructions for this turn...",
};
```
And `:501`: "Inside `before_agent_start`, `event.systemPrompt` and `ctx.getSystemPrompt()` both reflect the chained system prompt as of the current handler. Later `before_agent_start` handlers can still modify it again."

Caveat (per-turn, not at session construction): this fires "after user submits prompt, before agent loop" (`docs/extensions.md:468`; runtime `agent-session.js:775-776`). So the append is re-applied every turn (and is reset to base each turn if not re-returned, `agent-session.js:794-796`). It is eager (present before the model responds to that prompt, the model is never asked) but re-computed per turn rather than baked once at session start. For an always-present pointer block this is functionally equivalent to core's static block — just append our pointer block to `event.systemPrompt` on every `before_agent_start`. `systemPromptOptions` (`types.d.ts:476-477`, doc `:476-484`) lets us inspect what pi already loaded (`.skills`, `.contextFiles`, `.toolSnippets`, `.selectedTools`) so we can append without clobbering.

This is the EXACT equivalent of core's pointer block, available to an extension.

#### Channel 2 — `resources_discover` returns `{ skillPaths }` — extension-shipped skills reach the prompt via the SAME core path as built-in skills

Event + result, `types.d.ts:369-380`:
```ts
export interface ResourcesDiscoverEvent { type: "resources_discover"; cwd: string; reason: "startup" | "reload"; }
export interface ResourcesDiscoverResult { skillPaths?: string[]; promptPaths?: string[]; themePaths?: string[]; }
```
Registration, `types.d.ts:784`:
```ts
on(event: "resources_discover", handler: ExtensionHandler<ResourcesDiscoverEvent, ResourcesDiscoverResult>): void;
```
Doc, `docs/extensions.md:339-353`: "Fired after `session_start` so extensions can contribute additional skill, prompt, and theme paths." Lifecycle ordering shows `resources_discover { reason: "startup" }` runs at startup (`docs/extensions.md:274`).

Runtime proof these reach the agent prompt identically to core skills:
- `agent-session.js:1630-1638`: if any extension has a `resources_discover` handler, calls `emitResourcesDiscover(cwd, reason)` and feeds the returned `skillPaths` into `buildExtensionResourcePaths(skillPaths)`.
- `runner.js:754-790` `emitResourcesDiscover`: collects each extension's `result.skillPaths` (tagged with `extensionPath`).
- `resource-loader.js:184-209` `extendResources`: merges extension `skillPaths` into `lastSkillPaths` then calls `updateSkillsFromPaths` (`:198-199`), which `:344-353` invokes `loadSkills({ ..., skillPaths })` (import `resource-loader.js:13` from `./skills.js`).
- `skills.js:258-279` `formatSkillsForPrompt`: emits the eager `<available_skills>` block (name + description + location) into the system prompt for every skill whose `disableModelInvocation` is falsy (`:259`).

So extension skills ARE surfaced eagerly as metadata in the system prompt — same channel as core skills — and their BODIES load on demand via `read` of `<location>`. This DIRECTLY refutes-with-nuance the prior "authored SKILL.md does not reach the in-pi agent passively" finding: a bare on-disk SKILL.md is invisible, but a skill path contributed through `resources_discover` IS registered and its metadata IS injected eagerly (gated only by `--no-skills` via `resource-loader.js` `noSkills`, and by per-skill `disable-model-invocation: true` frontmatter which excludes it from the prompt per `skills.js:255-256,259`).

#### What an extension CAN inject into the agent's context — full enumeration

| What | API (citation) | Eager into model context? |
|---|---|---|
| System-prompt text (append/replace, chained) | `pi.on("before_agent_start", h)` → return `{ systemPrompt }` (`types.d.ts:796, 735-739`; runtime `runner.js:728-731`, `agent-session.js:791-792`) | YES — re-applied every turn, before the model responds |
| Skills (metadata eager, body lazy) | `pi.on("resources_discover", h)` → return `{ skillPaths }` (`types.d.ts:784, 376-380`; runtime `agent-session.js:1633-1638` → `resource-loader.js:198-199, 350-353` → `skills.js:258-279`) | YES (metadata block); body on-demand via `read` |
| Prompt templates / themes | same `resources_discover` → `promptPaths` / `themePaths` (`types.d.ts:378-379`; `resource-loader.js:201-208`) | Prompts/themes — not auto-injected as agent context (user-invoked); not an eager-context channel |
| LLM-callable tool (name + description + optional snippet) | `pi.registerTool(def)` (`types.d.ts:814`); `ToolDefinition.description` (`:334`), `.promptSnippet` (`:335-336`), `.promptGuidelines` (`:337-338`) | YES — tool name/desc always callable; `promptSnippet` adds the "Available tools" one-liner; `promptGuidelines` appends Guidelines bullets when active |
| A persistent message into the session/LLM | `before_agent_start` return `{ message }` (`types.d.ts:736`; `agent-session.js:778-789`) OR `pi.sendMessage(...)` (`types.d.ts:833-836`) / `pi.sendUserMessage(...)` (`:841-843`) / `pi.appendEntry(...)` (`:845`) | YES (message/sendUserMessage reach the LLM); `appendEntry` is state-only, NOT sent to LLM (`:844`) |
| Per-call messages array rewrite | `pi.on("context", h)` → return `{ messages }` (`types.d.ts:793, 710-712`; doc `:589-598`) | YES — fires before each LLM call; can add/prune/transform messages (deep copy, non-destructive) |
| Raw provider payload rewrite | `pi.on("before_provider_request", h)` (`types.d.ts:794`; doc `:601-616`) | YES but provider-level; "can rewrite provider-level system instructions" (doc `:605`) — low-level, not reflected by `ctx.getSystemPrompt()` |
| Commands / shortcuts / CLI flags | `registerCommand` (`:816`) / `registerShortcut` (`:818`) / `registerFlag` (`:823`) | NO — user-invoked, not eager model context |
| `ctx.ui.*` | `ExtensionUIContext` (`types.d.ts:67-191`) | NO — TUI-only, never reaches the model |

There is NO `pi.appendSystemPrompt(...)`, `pi.registerSkill(...)`, `pi.registerSystemPrompt(...)`, or `pi.addSystemPrompt(...)` method on `ExtensionAPI` (confirmed: grep for `appendSystemPrompt|registerSkill|registerPrompt|registerSystemPrompt|addSystemPrompt` in `types.d.ts` returns zero hits). `appendSystemPrompt` appears only as `systemPromptOptions.appendSystemPrompt` = read-only inspection of text from the user's `--append-system-prompt` CLI flags (doc `:481`), and as `resource-loader.js:181-182` `getAppendSystemPrompt()` which is core-internal, not on the extension API. So the programmatic system-prompt channel for an extension is exclusively the `before_agent_start` return value.

#### Lifecycle hooks — context-influence vs UI/side-effect only

Full event union, `types.d.ts:709`. Per hook, can its handler influence the agent's CONTEXT/system-prompt:
- `resources_discover` (`:784`) — YES: returns skill/prompt/theme paths → skills reach the eager prompt block.
- `before_agent_start` (`:796`) — YES: returns `{ systemPrompt, message }` → the primary eager channel.
- `context` (`:793`) — YES: returns `{ messages }` → rewrites the per-call message array.
- `before_provider_request` (`:794`) — YES (provider-payload level): can rewrite serialized system instructions (doc `:605`).
- `session_start` (`:785`) — NO direct return-value injection (its result is `void`, `:785`); side-effect only. It can call `pi.sendMessage`/`sendUserMessage` but those are message channels, not system-prompt.
- `agent_start`/`agent_end`/`turn_start`/`turn_end`/`message_*`/`tool_execution_*`/`model_select`/`thinking_level_select` (`:797-808`) — NO: observational; handlers are `ExtensionHandler<E>` with `void` result.
- `tool_call` (`:809`) — can block/mutate tool args, NOT system prompt. `tool_result` (`:810`) — can rewrite a tool result's content, NOT system prompt. `user_bash` (`:811`) / `input` (`:812`) — intercept user input, not system prompt.
- `ctx.ui.*` everywhere — TUI-only (`types.d.ts:67-191`); `ctx.getSystemPrompt()` (`:235`) is READ-only.

### VERDICT — definitive

**YES.** An extension in pi 0.75.4 can replicate pi-core's eager-pointer / content-lazy docs mechanism in full, without touching pi-core. The faithful replication uses BOTH extension channels:

1. **Eager pointer block** — register a `before_agent_start` handler that returns `{ systemPrompt: event.systemPrompt + OUR_POINTER_BLOCK }`. `OUR_POINTER_BLOCK` = the same shape as core's block: absolute paths to our shipped conception/catalog/docs + a topic→file map + "read only when the user asks about the framework; follow cross-references." This is present every turn before the model responds — the precise analogue of core's static block (`agent-session.js:791-792`, doc `extensions.md:486-501`).
   - Exact call: `pi.registerTool` is NOT what does this; use `pi.on("before_agent_start", async (event) => ({ systemPrompt: event.systemPrompt + "\n\n" + POINTER }))`.
2. **(Optional, complementary) eager skill metadata** — register a `resources_discover` handler returning `{ skillPaths: [<our skills dir>] }` so framework "how-to" skills appear in the eager `<available_skills>` block, bodies pulled on demand. (`pi.on("resources_discover", async () => ({ skillPaths: [absDir] }))`.)
3. **Content stays lazy** — the model opens our conception/schema/doc files with its ordinary `read` tool on demand, exactly as core does for `docs/`.

What is NOT lost vs pi-core: eager always-present pointer text, topic→file routing, content-lazy fetch, and skill-metadata eagerness are all reproducible. Minor deltas from core: (a) core bakes its block once into the base prompt at construction (`system-prompt.js`), whereas an extension re-appends per turn via `before_agent_start` — same observable eagerness, slightly different timing/reset semantics (must re-return each turn); (b) an extension cannot edit the base `_baseSystemPrompt` string itself, only append/replace at `before_agent_start` (no `pi.appendSystemPrompt` API exists). Neither delta degrades the mechanism. Tool descriptions (`registerTool` `description`/`promptSnippet`/`promptGuidelines`) are an ADDITIONAL eager channel but are NOT the only one — the `before_agent_start.systemPrompt` return is the direct, full-fidelity equivalent of core's pointer block.
