/**
 * dispatch-loader — the dispatch-side builtin agent tier (FGAP-127).
 *
 * Both dispatch entry points (call-agent, run-work-order-loop) build their
 * pi-jit-agents `createAgentLoader` LoadContext here so the bundled
 * pi-workflows `agents/` directory (26 shipped specs, e.g. `investigator`)
 * becomes the LAST search tier: the active substrate's `<contextDir>/agents/`
 * and the user tier (`~/.pi/agent/agents/`) still win on name collision — a
 * fresh substrate with no local specs can dispatch the bundled set out of the
 * box without copying files. pi-behavior-monitors' classifier specs are
 * deliberately NOT on this path — they are monitor-scoped, resolved via that
 * package's own loader.
 */

import type { LoadContext } from "@davidorex/pi-jit-agents/types";
import { bundledDir } from "@davidorex/pi-workflows/bundled-dirs";

export function dispatchLoadContext(cwd: string): LoadContext {
	return { cwd, builtinDir: bundledDir("agents") };
}
