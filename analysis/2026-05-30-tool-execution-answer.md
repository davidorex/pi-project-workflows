# Can extension code execute a registered tool by name and get its result?

**Question** (`analysis/2026-05-30-tool-execution-question.md:1`): Can extension code in pi execute a registered tool by name and get its result? If so how; if not, how do registered tools get executed and by whom? Package: `@earendil-works/pi-coding-agent` (v0.75.4 — `node_modules/@earendil-works/pi-coding-agent/package.json:3`; this is the resolved `pi` binary, `dist/cli.js`, per `which pi`).

## Short answer

**No.** The extension API surface exposes a way to *register* a tool (`registerTool`, returning `void`) but no method to *invoke a registered tool by name and receive its result inline*. Registered tools are executed **by the agent session / agentic loop** — the LLM-driven turn engine that owns the tool collection — when the model emits a tool call. An extension can *cause* a registered tool to run only indirectly, by issuing a follow-up message (`pi.sendMessage`) that prompts the model to call it on its next turn; execution still happens in the loop, not synchronously in extension code. For a direct programmatic result, call the underlying library function the tool wraps, not the registered tool.

## What `registerTool` is and returns

The authoritative type-declaration source is `dist/core/extensions/types.d.ts` (re-exported from the package root, `dist/index.d.ts:6` exports `ExtensionAPI`, `ToolDefinition`, `RegisteredTool`, `ToolInfo`, `ToolExecutionMode`).

A registered tool is a `ToolDefinition` (`dist/core/extensions/types.d.ts:328-359`):

```ts
export interface ToolDefinition<TParams extends TSchema = TSchema, TDetails = unknown, TState = any> {
  name: string;          // used in LLM tool calls
  label: string;         // UI label
  description: string;   // shown to the model
  parameters: TParams;   // TypeBox schema
  execute(toolCallId: string, params: Static<TParams>, signal: AbortSignal | undefined,
          onUpdate: AgentToolUpdateCallback<TDetails> | undefined,
          ctx: ExtensionContext): Promise<AgentToolResult<TDetails>>;
  // renderCall?/renderResult? optional UI hooks
}
```

The registration method is documented "Tool definition for registerTool()" (`dist/core/extensions/types.d.ts:326`) and declared (`dist/core/extensions/types.d.ts:814`):

```ts
registerTool<TParams extends TSchema = TSchema, TDetails = unknown, TState = any>(
  tool: ToolDefinition<TParams, TDetails, TState>
): void;
```

It returns **`void`** — no handle, no executor, no promise of a result. The tool's `execute` function is owned by the tool object itself; the extension hands that object to pi and gets nothing executable back. Every consumer in this repo uses it that way: `packages/pi-context/src/index.ts` calls `pi.registerTool({...})` ~29 times (e.g. line 887) and never receives or stores a return value.

## No by-name executor on the extension API

The full `ExtensionAPI` interface is declared at `dist/core/extensions/types.d.ts:783-929`. Its tool-related members are:

- `registerTool(tool: ToolDefinition): void` (line 814) — register only.
- `getActiveTools(): string[]` (line 855) — currently-active tool **names**.
- `getAllTools(): ToolInfo[]` (line 857) — tool **descriptors**.
- `setActiveTools(toolNames: string[]): void` (line 859) — enable/disable by name.
- `on("tool_call" | "tool_result" | "tool_execution_start" | "tool_execution_update" | "tool_execution_end", ...)` (lines 804-810) — observe execution.

There is **no** `callTool` / `executeTool` / `invokeTool` / `runTool` / `getTool` member on this interface — confirmed by reading the whole interface body (lines 783-937). Critically, the thing `getAllTools()` returns is `ToolInfo[]`, documented as "all configured tools with parameter schema and source metadata" (`dist/core/extensions/types.d.ts:856-857`). `ToolInfo` is defined as `Pick<ToolDefinition, "name" | "description" | "parameters"> & { sourceInfo: SourceInfo }` (`dist/core/extensions/types.d.ts:1034-1036`) — it deliberately picks only name/description/parameters and drops `execute`. (The internal runtime type `RegisteredTool` at `dist/core/extensions/types.d.ts:1004-1006` does wrap a full `ToolDefinition`, but it is not returned by any `ExtensionAPI` method.) So even enumerating tools at runtime gives you names and schemas, not a handle you can call. The package's public exports (`dist/index.d.ts:6-7,15,20`) include tool *factories* and *wrappers* — `defineTool`, `wrapRegisteredTool`, `wrapRegisteredTools`, `createCodingTools`, `createReadOnlyTools`, `createReadTool` … — but **no** name-based execute function.

The only object holding an executable `execute` is the `ToolDefinition` itself (the object you author and pass to `registerTool`). Its `execute` signature is `execute(toolCallId, params, signal, onUpdate, ctx): Promise<AgentToolResult>` (`dist/core/extensions/types.d.ts:353-354`). An extension could of course keep a reference to a tool object it authored and call that object's `execute` directly — but that is calling your own function, not "executing a registered tool by name through pi," and it requires constructing a valid `toolCallId` + `ExtensionContext` yourself.

## Who executes registered tools, and how

Tools run inside the **agent session**. Custom/extension tools are supplied to session creation and executed by the session's turn loop, not by extensions:

- `createAgentSession(options)` accepts `customTools?: ToolDefinition[]` — "Custom tools to register (in addition to built-in tools)" — and `tools?: string[]`, an allowlist of enabled tool **names** (`dist/core/sdk.d.ts:44-46`). The session, given these definitions, is what calls each tool's `execute`.
- When the model emits a tool call, the session resolves the call to its `ToolDefinition` and awaits `execute(toolCallId, params, signal, onUpdate, ctx)` (`dist/core/extensions/types.d.ts:354`), returning an `AgentToolResult`. The result is delivered back into the conversation as a tool result message, not returned to extension code.
- Tool-call lifecycle is surfaced to extensions only as **observation events**, not invocation hooks: the `on("tool_call" | "tool_result" | "tool_execution_start" | "tool_execution_update" | "tool_execution_end", handler)` subscriptions (`dist/core/extensions/types.d.ts:804-810`). Extensions can watch tools execute (and the `tool_call`/`tool_result` handlers can return a `*Result` to intercept/modify), but there is no API to *originate* a registered-tool execution by name and read its return value.

So the executor is the agent session, triggered by the model's tool-call decisions; the name→tool collection is internal to that machinery and is not exposed to extensions as an executor.

## The supported indirect path: sendMessage

An extension that wants a registered tool to run uses `pi.sendMessage(...)` to inject a follow-up turn that leads the model to call the tool. This project does exactly this for `/context lens-curate`, which "uses the `pi.sendMessage` follow-up-turn pattern to surface uncategorized items + suggested calls — LLM curates via existing `append-block-item` tool" (`CLAUDE.md`, Key Architecture / Substrate consumption surface; call sites `packages/pi-context/src/index.ts:162,240`). The extension does not execute `append-block-item`; the model does, on its next loop turn. Results go to the conversation/model, not back as a synchronous value to the extension.

## How this project does programmatic cross-component invocation instead

Because by-name in-process tool execution is unavailable, this codebase reaches functionality two other ways, both bypassing the tool-registration layer:

- **Subprocess dispatch**: spawn `pi -p "prompt" --mode json`; that child process runs its own agent session that executes the tools (`CLAUDE.md`, CLI Access from Other Agents; same mechanism the workflow executor uses for step dispatch).
- **Direct library calls**: call the underlying function the tool wraps (e.g. block-api primitives `appendToBlock` etc.), or a sibling runtime such as `invokeMonitor(name, context?)` from pi-behavior-monitors (`packages/pi-behavior-monitors/index.ts:1644`), which runs the monitor's classify pipeline directly — not by dispatching a registered Pi tool by name.

## Bottom line

- An extension **cannot** execute a registered tool *by name through the `pi` API* and get its result inline. The `ExtensionAPI` (`dist/core/extensions/types.d.ts:783-937`) exposes `registerTool` (returns `void`, line 814), `getActiveTools`/`getAllTools`/`setActiveTools` (names + metadata only, lines 855-859), and tool-lifecycle `on(...)` observers (lines 804-810) — but no `callTool`/`executeTool`/`getTool`/`invokeTool`/`runTool`, and `getAllTools()` returns non-invocable `ToolInfo` descriptors (lines 856-857).
- Registered tools are executed by the **agent session**, which holds the tool collection (`customTools`/`tools` at `createAgentSession`, `dist/core/sdk.d.ts:44-46`) and awaits each tool's `execute(toolCallId, params, signal, onUpdate, ctx)` (`dist/core/extensions/types.d.ts:354`) when the model issues a tool call; extensions only observe this via the tool events.
- To *make* a registered tool run from an extension, use `pi.sendMessage(...)` to prompt the model (this project's `/context lens-curate` pattern). For a direct, synchronous result, call the underlying library function the tool wraps — or, if the extension authored the `ToolDefinition`, call that object's own `execute` directly (you must supply `toolCallId` + `ExtensionContext` yourself).

---
Note: this analysis is drawn from the package's shipped TypeScript declaration files (`dist/**/*.d.ts` for `@earendil-works/pi-coding-agent` v0.75.4), which are the authoritative API contract.
