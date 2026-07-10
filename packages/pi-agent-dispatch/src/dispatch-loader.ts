/**
 * dispatch-loader — the dispatch-side builtin agent tier, wiring the bundled
 * pi-workflows agent specs in as the dispatch loader's last-resort tier so a
 * fresh substrate can still resolve a named target agent.
 *
 * Both dispatch entry points (call-agent, run-work-order-loop) build their
 * pi-jit-agents `createAgentLoader` LoadContext here so the bundled
 * pi-workflows `agents/` directory (26 shipped specs, e.g. `investigator`)
 * becomes the LAST search tier: the active substrate's `<contextDir>/agents/`
 * and the user tier (`~/.pi/agent/agents/`) still win on name collision.
 *
 * This is only the agent-spec RESOLUTION tier. A bundled spec also has to
 * COMPILE from a fresh substrate: both entry points build their template env
 * with `builtinDir = bundledTemplateDir()` so a bundled spec's task/system
 * templates resolve against the bundled pi-jit-agents `templates/` tier (no
 * local copy needed). Model resolution then follows the derived dispatch-model
 * precedence (this project's dispatch model-resolution order, `dispatch-model.ts`):
 * spec → model-config `by_role` →
 * `default`. work-order subprocess dispatch treats a still-null model as
 * "let pi pick its own default" (no `--model` passed); in-process call-agent —
 * which must resolve a concrete model + auth before it can call — keeps an
 * informed throw naming the model-config block as the remedy.
 *
 * pi-behavior-monitors' classifier specs are deliberately NOT on this path —
 * they are monitor-scoped, resolved via that package's own loader.
 */

import type { LoadContext } from "@davidorex/pi-jit-agents/types";
import { bundledDir } from "@davidorex/pi-workflows/bundled-dirs";

export function dispatchLoadContext(cwd: string): LoadContext {
	return { cwd, builtinDir: bundledDir("agents") };
}
