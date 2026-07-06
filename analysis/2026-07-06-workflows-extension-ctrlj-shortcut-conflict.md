# workflows extension ctrl+j shortcut conflict with pi built-in tui.input.newLine — investigation

Date: 2026-07-06. Trigger: pi startup diagnostic (verbatim):

```
[Extension issues]
  ../../../../../opt/homebrew/lib/node_modules/@davidorex/pi-project-workflows (project)
/opt/homebrew/lib/node_modules/@davidorex/pi-project-workflows/workflows-extension.ts
    Extension shortcut conflict: 'ctrl+j' is built-in shortcut for tui.input.newLine and
/opt/homebrew/lib/node_modules/@davidorex/pi-project-workflows/workflows-extension.ts. Using
/opt/homebrew/lib/node_modules/@davidorex/pi-project-workflows/workflows-extension.ts.
```

All claims below are from directly observed source reads (repo source, promoted install under `/opt/homebrew/lib/node_modules/@davidorex/`, and pi's installed dist under `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/`). No pi interactive session was launched; runtime-behavior statements are code-derived and marked as such.

## 1. Registration site

The loaded artifact `workflows-extension.ts` at the installed meta-package root is a one-line re-export:

```ts
// packages/pi-project-workflows/workflows-extension.ts (identical in the installed copy)
export { default } from "@davidorex/pi-workflows";
```

The meta-package `package.json` declares it under `pi.extensions` (with `project-extension.ts`, `monitors-extension.ts`, `dispatch-extension.ts`). It resolves to `@davidorex/pi-workflows` dist, built from `packages/pi-workflows/src/index.ts`. The registrations (source lines 1034–1082; present in the installed dist at `/opt/homebrew/lib/node_modules/@davidorex/pi-workflows/dist/index.js:839,846`):

```ts
// packages/pi-workflows/src/index.ts:1033-1044  (Key imported from "@earendil-works/pi-tui", line 19)
if (Key) {
	pi.registerShortcut(Key.ctrl("h"), {
		description: "Pause running workflow",
		handler: async (ctx: ExtensionContext) => {
			requestPause();
			ctx.ui.notify("Pause requested — workflow will pause after current step completes.", "info");
		},
	});

	pi.registerShortcut(Key.ctrl("j"), {
		description: "Resume paused workflow",
		handler: async (ctx: ExtensionContext) => { /* scans discoverWorkflows(ctx.cwd) for an
			incomplete run; if none: notify "No paused or incomplete workflows to resume.";
			else executeWorkflow(..., { resume: ... }) */ },
	});
}
```

- **ctrl+j** → resume the first discovered incomplete/paused workflow run.
- **ctrl+h** → request pause of the running workflow.

`/workflow` subcommands are `init, list, run, resume, validate, status, help` (index.ts:922–984): `resume` has a slash equivalent; **pause has none** — ctrl+h is the only pause surface.

## 2. Conflict-resolution mechanism in pi (confirmed from source)

`pi-coding-agent/dist/core/extensions/runner.js:300-316`: at load, each extension shortcut key is checked against `builtinKeybindings` (built from the resolved keybinding config):

- If the colliding built-in id is in `RESERVED_KEYBINDINGS_FOR_EXTENSION_CONFLICTS` (runner.js:7-25 — includes `tui.input.submit`, `app.interrupt`, `tui.input.copy`, `tui.editor.deleteToLineEnd`, etc.), the extension shortcut is **skipped** (built-in wins).
- Otherwise (`restrictOverride === false`) pi emits exactly the observed diagnostic and the **extension wins** (runner.js:309). `tui.input.newLine` is NOT in the reserved list, so ctrl+j falls in this arm.

Runtime precedence confirmed at `dist/modes/interactive/components/custom-editor.js:24-28`: `handleInput(data)` checks `onExtensionShortcut?.(data)` **first**, before app keybindings and before editor text handling — so a matching chord never reaches the built-in action. Dispatch wiring: `interactive-mode.js:1328-1340`.

**No conflict-avoidance affordance for extensions**: `registerShortcut(shortcut: KeyId, options: { description?; handler })` (`dist/core/extensions/types.d.ts:859-862`) returns void; the ExtensionAPI exposes no query of built-in/effective bindings and no register-only-if-free mode. Conflict handling is entirely host-side (skip-or-warn at load). Users can rebind built-ins via `~/.pi/agent/keybindings.json` (`dist/core/keybindings.js:275-279`), but that is a per-user mitigation, not a fix for shipped defaults.

## 3. Built-in default binding for ctrl+j

`pi-tui/dist/keybindings.js:66`:

```js
"tui.input.newLine": { defaultKeys: ["shift+enter", "ctrl+j"], description: "Insert newline" },
```

## 4. Shortcut inventory and collision check (class characterization)

Complete `registerShortcut` inventory across repo source (`grep -rn registerShortcut` over all packages; non-dist, non-test):

| Chord | Extension action | Built-in collision (string level) | Built-in collision (byte level) | Loader-flagged |
|---|---|---|---|---|
| ctrl+j | Resume paused workflow (`pi-workflows/src/index.ts:1042`) | **YES** — `tui.input.newLine` default `["shift+enter","ctrl+j"]` | ctrl+j ≡ 0x0A (LF); matched via `rawCtrlChar` | YES (observed diagnostic; extension wins) |
| ctrl+h | Pause running workflow (`pi-workflows/src/index.ts:1034`) | none — ctrl+h absent from all default keybindings | **LATENT** — ctrl+h ≡ 0x08 (BS). `keys.js` `rawCtrlChar("h")` = 0x08, and `matchesRawBackspace` (keys.js:544-550) treats raw 0x08 as plain `backspace` on non-Windows-Terminal setups / `ctrl+backspace` on Windows Terminal. Extension shortcuts are matched FIRST, so in terminals whose Backspace key emits raw 0x08 (legacy terminals, some tmux configs), Backspace triggers the pause handler instead of `tui.editor.deleteCharBackward` | NO — loader compares chord strings only (runner.js:302-315); byte-level aliasing escapes detection |

The only other `registerShortcut` occurrences are no-op mocks in test harnesses (`pi-context/src/accept-all.test.ts:54`, `pi-context/src/index.test.ts:57`, `pi-workflows/src/index.test.ts:158`).

**Sibling verdict**: ctrl+j is the only loader-flagged collision, but it is not the only defect instance — ctrl+h is a latent byte-level sibling invisible to pi's string-level conflict detection.

**General class (confirmed)**: both chords were authored with no check against pi's built-in default set — there is no collision-avoidance discipline at authoring time, and pi affords none at registration time (no query API, no register-only-if-free). The class framing in the dispatch brief is correct, with one refinement: pi DOES detect and warn on string-level collisions at load (and hard-blocks a reserved subset), so the discipline gap is specifically (a) at authoring time in this repo, and (b) byte-level aliasing (ctrl+h≡BS, ctrl+i≡Tab, ctrl+m≡Enter) which pi's detection cannot see at all.

## 5. Built-in default chord occupancy (for rebind candidates)

From `pi-coding-agent/dist/core/keybindings.js` (KEYBINDINGS) + `pi-tui/dist/keybindings.js` (TUI_KEYBINDINGS), occupied default chords include: escape, enter, shift+enter, tab, shift+tab, backspace, delete, home, end, up/down/pageUp/pageDown, ctrl+a/b/c/d/e/f/g/j/k/l/n/o/p/r/s/t/u/v/w/x/y/z, ctrl+-, ctrl+], ctrl+alt+], shift+ctrl+p, shift+ctrl+o, ctrl+backspace, ctrl+left/right, alt+left/right/up/down, alt+b/d/f/y, alt+enter, alt+backspace, alt+delete, shift+l, shift+t. (ctrl+r/s/x etc. are picker-scoped but still populate the loader's conflict map and would draw the non-reserved diagnostic.)

**Free at both string and byte level**: alt+p, alt+r, alt+j, alt+h, alt+w, alt+g, ctrl+q (ctrl+q carries an XON flow-control caveat on IXON terminals; alt chords carry the standard macOS "Option as Meta" caveat that pi's existing alt+b/alt+f defaults already assume).

## 6. User impact (code-derived; no interactive session launched)

With the extension loaded, pressing ctrl+j in the pi editor runs the resume-workflow handler — typically flashing "No paused or incomplete workflows to resume." (or actually resuming a stale incomplete run) — instead of inserting a newline. Where it bites: multi-line prompt authoring in the TUI. Severity is terminal-dependent: `shift+enter` (the other newLine default) is only matchable via Kitty protocol / modifyOtherKeys / specific terminal mappings (`keys.js:682-700`); in plain legacy terminals shift+enter is indistinguishable from enter, so **ctrl+j is the only newline chord there and the extension removes keyboard newline entry entirely** (paste and external editor `ctrl+g` remain). Additionally the resume handler is armed globally — an accidental ctrl+j (a common terminal reflex for newline) can silently launch a workflow resume.

Stale-string coupling: the pause UX advertises the chord — "Use /workflow resume or Ctrl+J to continue." at `workflow-executor.ts:627,839,966`, `step-pause.ts:3` docstring, and `workflows/pausable-analysis.workflow.yaml:20`. Any rebind must sweep these (docs-surface-sync).

## 7. Prior-art sweep (substrate)

Single-term `filter-block-items --op matches` searches, blocks `issues` + `framework-gaps`, field `title` then `description`:

| Term | issues.title | issues.description | framework-gaps.title | framework-gaps.description |
|---|---|---|---|---|
| shortcut | 0 | 0 | 0 | 0 |
| keybinding | 0 | 0 | 0 | 0 |
| ctrl | 0 | 0 | 0 | 0 (as `ctrl+`) |
| conflict | 0 | — | 2 (unrelated) | — |
| tui | 0 | — | 0 | — |

The two framework-gaps title hits — FGAP-068 (closed) and FGAP-069 (closed) — are schema-merge/update-conflict items, unrelated to shortcuts/keybindings. **Verdict: NEW — the substrate does not track this gap.** Existing issue ids run issue-001..issue-010; next free id is issue-011.

## 8. Proposed resolution (class-correct)

Fix the class, not the flagged symptom: rebind BOTH chords to defaults-free, byte-unambiguous chords, and sweep the advertised strings.

1. **Rebind ctrl+j → alt+r** (resume) and **ctrl+h → alt+p** (pause) — mnemonic, absent from every pi default binding, no control-byte aliasing, consistent with pi's existing alt+letter usage. (ctrl+q rejected: XON; other ctrl+letters all collide at string or byte level.)
2. **Sweep advertised strings**: `workflow-executor.ts:627,839,966`, `step-pause.ts` docstring, `pausable-analysis.workflow.yaml:20`, plus README/SKILL surfaces mentioning the chords (docs-surface-sync convention).
3. **Authoring discipline**: record in the shortcut-registration site a comment naming the constraint (chord must be absent from pi `KEYBINDINGS`/`TUI_KEYBINDINGS` defaults AND not alias a control byte: ctrl+h≡BS, ctrl+i≡Tab, ctrl+j≡LF, ctrl+m≡CR).
4. **Structural (upstream, out of this repo's control)**: pi's `registerShortcut` affords no conflict query or register-only-if-free mode — a register-if-free API with loud fallback is a pi feature request, not implementable repo-side; repo-side the discipline in (3) is the available structural fix. Not proposed: leaving the built-in shadowed (correctness-over-cost) or relying on per-user `~/.pi/agent/keybindings.json` rebinds.

## 9. DRAFT issues-block payload (NOT filed — user-permission-gated)

Authored to the observed item schema (`read-schema --schemaName issues --path properties.issues.items`): required `id,title,body,location,status,category,priority,package`; optional `source`; `oid`/`content_hash` are write-path-stamped. For `append-block-item --autoId true` the id is minted (next: issue-011).

Priority recommendation: **medium** — real, user-visible loss of a core editor function (newline entry; total loss on legacy terminals) plus accidental-resume hazard, but with workarounds (shift+enter on kitty-protocol terminals, paste, ctrl+g external editor) and no data/state corruption.

```json
{
	"id": "issue-011",
	"title": "workflows extension ctrl+j shortcut shadows pi built-in newline (tui.input.newLine); ctrl+h byte-aliases legacy Backspace — chords registered with no built-in-set check",
	"body": "pi-workflows registers two editor-global shortcuts (packages/pi-workflows/src/index.ts:1034,1042; shipped via the meta-package's workflows-extension.ts re-export): ctrl+h = pause running workflow, ctrl+j = resume paused workflow. pi's built-in tui.input.newLine defaults to [shift+enter, ctrl+j] (pi-tui keybindings.js:66). pi's loader resolves non-reserved collisions extension-wins with a startup diagnostic (pi-coding-agent runner.js:309), and the editor checks extension shortcuts before all built-in handling (custom-editor.js:26), so with the extension loaded ctrl+j triggers workflow-resume instead of inserting a newline. On terminals without Kitty/modifyOtherKeys, shift+enter is indistinguishable from enter, making ctrl+j the only newline chord — keyboard newline entry is lost entirely there; an accidental ctrl+j can also silently resume a stale incomplete run. Sibling (latent, not loader-flagged — loader compares chord strings only): ctrl+h emits 0x08, which pi-tui matchesRawBackspace (keys.js:544) treats as plain Backspace on non-Windows-Terminal setups, so terminals whose Backspace sends raw 0x08 trigger the pause handler on Backspace. Class: both chords were authored with no check against pi's default binding set; pi affords no registration-time conflict query (registerShortcut returns void, types.d.ts:859). Resolution: rebind resume to alt+r and pause to alt+p (absent from all pi defaults, no control-byte alias; ctrl+q rejected: XON), sweep the advertised chord strings (workflow-executor.ts:627,839,966; step-pause.ts docstring; pausable-analysis.workflow.yaml:20; README/SKILL surfaces), and comment the registration site with the chord-selection constraint (defaults-free + no control-byte alias: ctrl+h=BS, ctrl+i=Tab, ctrl+j=LF, ctrl+m=CR). Note /workflow has a resume subcommand but no pause subcommand — ctrl+h is the only pause surface. Investigation: analysis/2026-07-06-workflows-extension-ctrlj-shortcut-conflict.md.",
	"location": "packages/pi-workflows/src/index.ts:1042",
	"status": "open",
	"category": "issue",
	"priority": "medium",
	"package": "pi-workflows",
	"source": "agent"
}
```
