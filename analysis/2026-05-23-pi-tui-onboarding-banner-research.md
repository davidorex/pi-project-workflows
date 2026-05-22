# pi/pi-tui SDK Research: Onboarding First-Step Command in TUI Startup Display

Date: 2026-05-23
Scope: How a loaded extension can present an onboarding first-step command in the pi TUI startup region — the same screen area where pi shows its "an update is available, run X" notice.
SDK versions read: `@earendil-works/pi-coding-agent` v0.75.4, `@earendil-works/pi-tui` (sibling), in `node_modules/`.
Method: read the actual `.d.ts` and compiled `.js`. EMPIRICAL = found in SDK source; INFERRED = reasoned from it.

---

## A. ExtensionAPI event surface

**Verdict:** `pi.on(...)` accepts a fixed union of ~30 event names. The earliest startup-relevant one an extension can hook is `session_start` (reason `"startup"`). Its handler receives `(event: SessionStartEvent, ctx: ExtensionContext)`. There is no separate "load"/"ready"/"activate"/"UI-ready" event — `session_start` IS the startup hook.

Evidence — the `on()` overload set (`core/extensions/types.d.ts:783-812`):

```ts
export interface ExtensionAPI {
    on(event: "resources_discover", handler: ExtensionHandler<ResourcesDiscoverEvent, ResourcesDiscoverResult>): void;
    on(event: "session_start", handler: ExtensionHandler<SessionStartEvent>): void;
    on(event: "session_before_switch", ...): void;
    on(event: "session_before_fork", ...): void;
    on(event: "session_before_compact", ...): void;
    on(event: "session_compact", ...): void;
    on(event: "session_shutdown", ...): void;
    on(event: "session_before_tree", ...): void;
    on(event: "session_tree", ...): void;
    on(event: "context", ...): void;
    on(event: "before_provider_request", ...): void;
    on(event: "after_provider_response", ...): void;
    on(event: "before_agent_start", ...): void;
    on(event: "agent_start", ...): void;
    on(event: "agent_end", ...): void;
    on(event: "turn_start" | "turn_end" | "message_start" | "message_update" | "message_end", ...): void;
    on(event: "tool_execution_start" | "tool_execution_update" | "tool_execution_end", ...): void;
    on(event: "model_select" | "thinking_level_select", ...): void;
    on(event: "tool_call" | "tool_result" | "user_bash" | "input", ...): void;
    ...
}
```

Handler signature (`types.d.ts:779`):

```ts
export type ExtensionHandler<E, R = undefined> = (event: E, ctx: ExtensionContext) => Promise<R | void> | R | void;
```

`SessionStartEvent` payload (`types.d.ts:382-388`):

```ts
export interface SessionStartEvent {
    type: "session_start";
    reason: "startup" | "reload" | "new" | "resume" | "fork";
    previousSessionFile?: string;
}
```

**ctx type for a `session_start` handler = `ExtensionContext`** (`types.d.ts:207-236`). It carries `ui: ExtensionUIContext`, `hasUI: boolean`, `cwd: string`, `sessionManager`, `model`, plus `isIdle()/abort()/shutdown()/getContextUsage()/compact()/getSystemPrompt()`. (The richer `ExtensionCommandContext` with `newSession/fork/reload/waitForIdle` is passed only to *command* handlers, not event handlers — `types.d.ts:241-276`.)

Note `resources_discover` (`types.d.ts:369-379`) fires *after* `session_start` and only returns resource paths — not a UI hook.

INFERRED: to gate to first startup only, branch on `event.reason === "startup"` (skips reload/new/resume/fork). EMPIRICAL that those reason values exist; INFERRED that this is the correct gate.

---

## B. ctx.ui surface (full enumeration)

**Verdict:** `ExtensionUIContext` is large. Beyond `notify` (transient log line) it exposes TWO persistent startup-region surfaces an extension CAN drive: **`setHeader(factory)`** (replaces the startup header above chat) and **`setWidget(key, content, opts)`** (a persistent row above/below the editor). It also has `setStatus` (footer text). There is NO API to inject into pi's own update-banner region specifically.

Full method list (`types.d.ts:67-191`, `ExtensionUIContext`):

| Method | Signature (verbatim, abbreviated) | Persistence |
|--------|-----------------------------------|-------------|
| `select` | `select(title, options: string[], opts?): Promise<string \| undefined>` | modal dialog |
| `confirm` | `confirm(title, message, opts?): Promise<boolean>` | modal dialog |
| `input` | `input(title, placeholder?, opts?): Promise<string \| undefined>` | modal dialog |
| `notify` | `notify(message: string, type?: "info" \| "warning" \| "error"): void` | transient (see C/below) |
| `onTerminalInput` | `onTerminalInput(handler): () => void` | raw input listener |
| `setStatus` | `setStatus(key: string, text: string \| undefined): void` — "Set status text in the footer/status bar." | persistent (footer) |
| `setWorkingMessage` / `setWorkingVisible` / `setWorkingIndicator` | streaming-loader controls | streaming only |
| `setHiddenThinkingLabel` | label tweak | n/a |
| `setWidget` | `setWidget(key, content: string[] \| undefined, options?: ExtensionWidgetOptions): void` AND a `(tui, theme) => Component` factory overload | **persistent** above/below editor |
| `setFooter` | `setFooter(factory \| undefined): void` | persistent footer |
| `setHeader` | `setHeader(factory: ((tui, theme) => Component & {dispose?}) \| undefined): void` | **persistent header, "shown at startup, above chat"** |
| `setTitle` | terminal window title | n/a |
| `custom<T>` | full-screen/overlay focusable component | modal/overlay |
| `pasteToEditor` / `setEditorText` / `getEditorText` / `editor` | editor manipulation | n/a |
| `addAutocompleteProvider` / `setEditorComponent` / `getEditorComponent` | editor extension | n/a |
| `theme` / `getAllThemes` / `getTheme` / `setTheme` | theming | n/a |
| `getToolsExpanded` / `setToolsExpanded` | tool-output toggle | n/a |

Doc-comment on the two key persistent surfaces:

```ts
// types.d.ts:95-96
/** Set a widget to display above or below the editor. Accepts string array or component factory. */
setWidget(key: string, content: string[] | undefined, options?: ExtensionWidgetOptions): void;

// types.d.ts:109-112
/** Set a custom header component (shown at startup, above chat), or undefined to restore the built-in header. */
setHeader(factory: ((tui: TUI, theme: Theme) => Component & { dispose?(): void; }) | undefined): void;
```

`ExtensionWidgetOptions` / placement (`types.d.ts:41-47`):

```ts
export type WidgetPlacement = "aboveEditor" | "belowEditor";
export interface ExtensionWidgetOptions { placement?: WidgetPlacement; } // defaults "aboveEditor"
```

**`notify` rendering semantics (EMPIRICAL — traced into compiled interactive mode):**

`notify` is wired to `showExtensionNotify` (`modes/interactive/interactive-mode.js:1538`):

```js
notify: (message, type) => this.showExtensionNotify(message, type),
```

`showExtensionNotify` (`interactive-mode.js:1771-1781`) routes by level:

```js
showExtensionNotify(message, type) {
    if (type === "error") { this.showError(message); }
    else if (type === "warning") { this.showWarning(message); }
    else { this.showStatus(message); }   // "info" (default) path
}
```

- `info` → `showStatus` (`interactive-mode.js:2438-2449`): appends a `Spacer` + dim `Text` to `chatContainer`; if the previous status row is identical it updates in place. It is a line in the scrolling chat log (a "status" line), NOT a persistent banner.
- `warning` → `showWarning` (`interactive-mode.js:2950-2953`): appends `Spacer` + `Text(theme.fg("warning", "Warning: " + msg))` to `chatContainer`.
- `error` → `showError` (`interactive-mode.js:2944-2948`): appends to `chatContainer` as `Error: ...`.

So **all three `notify` levels append into the scrolling `chatContainer`** — they scroll away as the conversation grows; they are not a fixed/persistent banner. (This is the surface our `index.ts:459-461` currently uses via `checkForUpdates`.)

---

## C. pi's own "update available" notice

**Verdict:** pi renders its update banner with PI-INTERNAL TUI components (`DynamicBorder` + `Text` + `Markdown`) appended directly to the private `chatContainer`, fired from `InteractiveMode.run()`. It does NOT go through `ctx.ui.notify` or any extension-reachable API. An extension cannot target that exact bordered "Update Available" box.

The trigger (`modes/interactive/interactive-mode.js:505-509`, inside `run()`):

```js
checkForNewPiVersion(this.version).then((newRelease) => {
    if (newRelease) {
        this.showNewVersionNotification(newRelease);
    }
});
```

`checkForNewPiVersion` comes from `utils/version-check.js` (`interactive-mode.js:34`), declared `utils/version-check.d.ts:14`:

```ts
export declare function checkForNewPiVersion(currentVersion: string): Promise<LatestPiRelease | undefined>;
```

The renderer `showNewVersionNotification` (`interactive-mode.js:2955-2977`) — verbatim core:

```js
showNewVersionNotification(release) {
    const action = theme.fg("accent", `${APP_NAME} update`);
    const updateInstruction = theme.fg("muted", `New version ${release.version} is available. Run `) + action;
    ...
    this.chatContainer.addChild(new Spacer(1));
    this.chatContainer.addChild(new DynamicBorder((text) => theme.fg("warning", text)));
    this.chatContainer.addChild(new Text(`${theme.bold(theme.fg("warning", "Update Available"))}\n${updateInstruction}`, 1, 0));
    if (note) {
        this.chatContainer.addChild(new Spacer(1));
        this.chatContainer.addChild(new Markdown(note, 1, 0, this.getMarkdownThemeWithSettings(), {...}));
        this.chatContainer.addChild(new Spacer(1));
    }
    this.chatContainer.addChild(new Text(changelogLine, 1, 0));
    this.chatContainer.addChild(new DynamicBorder((text) => theme.fg("warning", text)));
    this.ui.requestRender();
}
```

The sibling "Package Updates Available" box (`interactive-mode.js:2978-2987`) uses the same `DynamicBorder`-wrapped `chatContainer.addChild` pattern.

`DynamicBorder` is imported pi-internally (`interactive-mode.js:45`: `import { DynamicBorder } from "./components/dynamic-border.js";`) — it lives under `modes/interactive/components/`, NOT exported from `@earendil-works/pi-tui` (see D). `chatContainer` is a private field of `InteractiveMode`; extensions have no handle to it.

**Conclusion (EMPIRICAL):** the exact update-banner region is a pi-internal render in `chatContainer`, unreachable by extensions. The closest an extension gets to the *same visual treatment* is reimplementing a bordered box itself via `setHeader`/`setWidget`/`custom` with `Box` from pi-tui — its own component, placed in an extension-owned slot, not in pi's banner slot.

---

## D. pi-tui primitives

**Verdict:** pi-tui exports a real component toolkit (Box, Text, Markdown, Spacer, TruncatedText, SelectList, Loader, etc.) plus the `TUI`/`Component`/`Container` core. An extension CAN import pi-tui directly and build components — but it can only mount them through `ctx.ui` factory slots (`setHeader`/`setWidget`/`setFooter`/`custom`), which receive a `(tui, theme) => Component`. There is no extension API to add a free-floating child to the root TUI at startup; you are confined to the `ctx.ui` mount points.

pi-tui public exports (`pi-tui/dist/index.d.ts:1-22`) — components relevant to a banner:

```ts
export { Box } from "./components/box.ts";
export { Loader, type LoaderIndicatorOptions } from "./components/loader.ts";
export { type DefaultTextStyle, Markdown, type MarkdownTheme } from "./components/markdown.ts";
export { type SelectItem, SelectList, ... } from "./components/select-list.ts";
export { Spacer } from "./components/spacer.ts";
export { Text } from "./components/text.ts";
export { TruncatedText } from "./components/truncated-text.ts";
export { Input } from "./components/input.ts";
export { Editor, ... } from "./components/editor.ts";
export { Image, ... } from "./components/image.ts";
export { type Component, Container, CURSOR_MARKER, type Focusable, ..., type OverlayHandle, type OverlayOptions, ..., TUI } from "./tui.ts";
```

NOT exported: `DynamicBorder` (pi's banner border — it lives in `modes/interactive/components/dynamic-border.js`, internal). So an extension wanting the same border would use `Box` (which renders its own border) instead.

Confirmation extensions are meant to use pi-tui components in factories — `setHeader`/`setWidget`/`setFooter`/`custom` all take `(tui: TUI, theme: Theme) => Component` (`types.d.ts:96-126`), and the factory's `Component` type is exactly the pi-tui `Component` (imported `types.d.ts:12`). The `setWidget` string-array overload even auto-wraps strings in `Text` components internally (`interactive-mode.js:1361-1370`).

**Conclusion (EMPIRICAL):** extensions import pi-tui freely for component construction, but mount only via `ctx.ui` slots. No direct root-TUI child injection is exposed.

---

## E. Conditional display + cwd

**Verdict:** Yes. `ExtensionContext.cwd` is available in the `session_start` handler, so the handler can read `.pi-context.json` / `config.json` presence (our existing `resolveContextDir(ctx.cwd)` / `loadConfig(ctx.cwd)`) and only show the hint in a fresh dir.

Evidence (`types.d.ts:213`):

```ts
/** Current working directory */
cwd: string;
```

Within `ExtensionContext` (`types.d.ts:207-236`), present alongside `ui` and `hasUI`. Also `hasUI: boolean` (`types.d.ts:211`) — gate UI calls on `ctx.hasUI` so the hint is skipped in print/RPC mode (where `setHeader`/`setWidget` are no-ops or absent).

INFERRED (consistent with our known facts, not re-derived): branch `try { resolveContextDir(ctx.cwd) } catch (BootstrapNotFoundError) { showHint() }`, or `if (loadConfig(ctx.cwd) === null) showHint()`. The SDK side (cwd availability) is EMPIRICAL; the bootstrap-detection calls are our own code per the brief.

---

## F. Actionable affordance

**Verdict:** The startup *banner/header/widget/notify* surfaces are TEXT-ONLY — they cannot carry a clickable button or auto-run a command. The only interactive startup affordances are (1) modal dialogs (`select`/`confirm`/`input`/`custom`) which steal focus, and (2) an extension can PREFILL the editor with the command text (`setEditorText`/`pasteToEditor`) so the user just presses Enter, or auto-run via `pi.sendUserMessage` (but that runs without consent). There is no "suggested command chip / one-tap run" primitive.

Evidence:
- `notify`/`setStatus`/`setHeader`/`setWidget` all take strings or render `Component`s — no action/callback param (`types.d.ts:75,78-79,96-112`). Pi's own banner is likewise pure text ("Run `pi update`" is a string, not a button — `interactive-mode.js:2957`); the only interactivity is an OSC-8 terminal hyperlink for the changelog when `getCapabilities().hyperlinks` is true (`interactive-mode.js:2959-2961`), which opens a URL, not a command.
- Editor prefill (no auto-run): `setEditorText(text)` (`types.d.ts:130`) / `pasteToEditor(text)` (`types.d.ts:128`). User then submits.
- Direct dispatch (auto-run, no user gate): `pi.sendUserMessage(content, {deliverAs?})` (`types.d.ts:841-843`) — "Always triggers a turn." This is the orchestrator's existing follow-up-turn mechanism; it would run the onboarding command without a confirmation step.
- Focus-stealing interactive prompt: `ctx.ui.select(title, options, opts?)` / `confirm` / `custom<T>(...)` (`types.d.ts:69-71,116-126`) — can offer "Run onboarding now? [yes/no]" at startup but interrupts with a modal.
- `registerShortcut(KeyId, {handler})` (`types.d.ts:818-821`) — can bind a key to run onboarding, but that is not a startup-visible affordance unless advertised in banner text.

**Conclusion:** closest to "actionable" without a modal = banner/widget text that names the command + `setEditorText` prefill so Enter runs it; or a `confirm`/`select` modal at startup for true one-action. No inline button primitive exists.

---

## G. Net mechanism + limitations

### Net mechanism (confirmed-possible today)

Hook `session_start` (already done in `index.ts:459`). In the handler, gate on `event.reason === "startup"` + `ctx.hasUI` + fresh-dir detection (`resolveContextDir(ctx.cwd)` throw / `loadConfig(ctx.cwd) === null`). Then present the onboarding first-step command via ONE of:

1. **`ctx.ui.notify(msg, "warning")`** — least work, matches the *current* update-check precedent. Renders as a `Warning:` line in the scrolling chat (NOT a persistent bordered banner; scrolls away). EMPIRICAL: `interactive-mode.js:1771-1781,2950-2953`.
2. **`ctx.ui.setWidget(key, ["…run /project init…"], {placement:"aboveEditor"})`** — persistent row pinned above the editor; survives scroll; dismissible by calling `setWidget(key, undefined)` later. Closest *persistent* analog to a banner. EMPIRICAL: `types.d.ts:96`, `interactive-mode.js:1346-1378`.
3. **`ctx.ui.setHeader((tui, theme) => new Box(...))`** — replaces the startup header block above chat with a custom component built from pi-tui `Box`/`Text`/`Markdown`. Highest visual fidelity to the bordered banner, BUT it REPLACES pi's built-in header (logo + key hints, `interactive-mode.js:443-447`); restore with `setHeader(undefined)`. EMPIRICAL: `types.d.ts:109-112`, `interactive-mode.js:1478-1515`.

To make it actionable: pair any of the above with `ctx.ui.setEditorText("/project init")` so Enter runs it (no API to auto-run safely; `sendUserMessage` auto-runs without consent).

Timing (EMPIRICAL): `run()` calls `await this.init()` (which starts the UI then `rebindCurrentSession()` → emits `session_start` to extensions) at `interactive-mode.js:503`, THEN fires the version-banner check at `:505`. So an extension's `session_start` UI calls land at startup, just before pi's own update banner — same screen phase.

### Limitations / would-need-SDK-change

- **The exact update-banner region is NOT extension-addressable.** It is `chatContainer.addChild(DynamicBorder + Text + Markdown)` inside private `InteractiveMode` state, fired from `run()`, bypassing all `ctx.ui` APIs (`interactive-mode.js:505-509,2955-2977`). `DynamicBorder` is not exported from pi-tui (`pi-tui/dist/index.d.ts`). To inject into that precise slot would require a pi-SDK feature (e.g. an `ctx.ui.banner(...)` or an extension-contributed-startup-notice hook). None exists in v0.75.4.
- **`notify` is transient, not a banner.** All three levels append to the scrolling chat log; they are not pinned. If "same region as the update notice" means *persistent + bordered*, `notify` does not match; use `setWidget` (persistent, unbordered unless you build a `Box`) or `setHeader` (persistent, can be bordered, but replaces the built-in header).
- **No actionable/button primitive.** Startup text surfaces are non-interactive; the only one-action paths are a focus-stealing modal (`confirm`/`select`/`custom`) or editor prefill + user Enter.
- **No auto-run-with-consent built in.** `sendUserMessage` runs immediately without a gate; there is no "suggested command, click to run" affordance.

### Meta-package vs single-package: which session_start fires

- The onboarding handler must live in **`@davidorex/pi-context`** (its `index.ts:459` already registers `session_start`). EMPIRICAL: the meta-package re-exports pi-context's default extension verbatim — `packages/pi-project-workflows/project-extension.ts`: `export { default } from "@davidorex/pi-context";`, and `package.json` `pi.extensions` lists `./project-extension.ts` (plus workflows + monitors).
- Therefore the SAME pi-context `session_start` handler fires under BOTH install shapes (meta-package load of `project-extension.ts`, and direct `@davidorex/pi-context` install). No duplication risk for the hint from pi-context. (Workflows/monitors extensions are separate factories; if they ever registered their own startup hint, both would fire under the meta-package — but only pi-context carries the bootstrap-detection code per the brief.)
- INFERRED: keep the onboarding hint solely in pi-context's handler so it fires once regardless of install shape; do not duplicate it into the workflows/monitors extensions.

---

## EMPIRICAL vs INFERRED ledger

| Claim | Status | Citation |
|-------|--------|----------|
| `session_start` is the earliest extension UI hook; no load/ready/activate event | EMPIRICAL | `types.d.ts:783-812` |
| `session_start` ctx = `ExtensionContext` (not Command ctx) | EMPIRICAL | `types.d.ts:785,779,207-236` |
| `SessionStartEvent.reason` includes `"startup"` | EMPIRICAL | `types.d.ts:382-388` |
| Branch on `reason==="startup"` is the fresh-startup gate | INFERRED | reasoned from reason union |
| `ctx.ui` full method set incl. `setHeader`/`setWidget`/`setStatus`/`notify` | EMPIRICAL | `types.d.ts:67-191` |
| `notify` all levels append to scrolling `chatContainer` (transient, not pinned) | EMPIRICAL | `interactive-mode.js:1771-1781,2438-2449,2944-2953` |
| `setWidget` = persistent row above/below editor | EMPIRICAL | `types.d.ts:96`, `interactive-mode.js:1346-1378` |
| `setHeader` = persistent, replaces built-in header above chat | EMPIRICAL | `types.d.ts:109-112`, `interactive-mode.js:1478-1515` |
| pi update banner = internal `DynamicBorder`+`Text`+`Markdown` on private `chatContainer`, from `run()` | EMPIRICAL | `interactive-mode.js:505-509,2955-2987` |
| Update-banner region NOT reachable via `ctx.ui` | EMPIRICAL | absence in `types.d.ts` ExtensionUIContext + private chatContainer |
| `DynamicBorder` not exported by pi-tui | EMPIRICAL | `pi-tui/dist/index.d.ts:1-22` |
| pi-tui exports Box/Text/Markdown/Spacer/SelectList/TUI/Component etc. | EMPIRICAL | `pi-tui/dist/index.d.ts:1-22` |
| Extensions mount components only via `ctx.ui` factory slots; no root-TUI child API | EMPIRICAL | `types.d.ts:96-126` (factory slots); absence of add-child API |
| `ctx.cwd` available in session_start handler | EMPIRICAL | `types.d.ts:213` |
| `ctx.hasUI` available to gate print/RPC | EMPIRICAL | `types.d.ts:211` |
| Bootstrap-detection via resolveContextDir/loadConfig on ctx.cwd | INFERRED (our code, per brief) | brief known-facts |
| Startup text surfaces are non-interactive (no button/action param) | EMPIRICAL | `types.d.ts:75,78,96,109` |
| Update banner's only interactivity = OSC-8 changelog hyperlink | EMPIRICAL | `interactive-mode.js:2959-2961` |
| `setEditorText`/`pasteToEditor` prefill (user Enter to run) | EMPIRICAL | `types.d.ts:128,130` |
| `sendUserMessage` auto-runs without consent | EMPIRICAL | `types.d.ts:841-843` |
| `select`/`confirm`/`custom` = focus-stealing modal alternatives | EMPIRICAL | `types.d.ts:69-71,116-126` |
| session_start emitted (init) before version banner, same startup phase | EMPIRICAL | `interactive-mode.js:503-509,465-469` |
| Meta-package re-exports pi-context default extension verbatim | EMPIRICAL | `pi-project-workflows/project-extension.ts`, `package.json` pi.extensions |
| Same pi-context session_start fires under both install shapes | EMPIRICAL | re-export identity above |
| Keep hint solely in pi-context to fire once | INFERRED | reasoned from re-export identity |
