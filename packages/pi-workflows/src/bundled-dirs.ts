/**
 * Resolved paths into the bundled defaults directories.
 *
 * Pi loads pi-workflows from `dist/`; the bundled `workflows/` directory sits
 * one level above the runtime JS (i.e. at this package's root). The canonical
 * bundled AGENT specs and their adjacent output schemas live in the pi-context
 * package's samples catalog (`samples/agents/` + `samples/agents/schemas/`) —
 * the same catalog the install ceremony materializes `installed_agents[]`
 * from — so `bundledDir("agents")` / `bundledDir("schemas")` resolve into the
 * installed pi-context package rather than this one. Every consumer routes
 * through `bundledDir(name)` so the path arithmetic exists once. Module-scoped
 * — never re-export from the package barrel, since the value is meaningful
 * only when computed against this file's own location.
 *
 * The pi-context package root is resolved via `createRequire(import.meta.url)`
 * + `require.resolve("@davidorex/pi-context/package.json")` (the subpath is in
 * pi-context's exports map). Module resolution — not relative path arithmetic
 * across package dirs — is what stays correct under the monorepo workspace
 * symlink layout, a hoisted published install, and a nested (version-conflict)
 * published install alike.
 *
 * The "templates" branch was removed on purpose: agent-prompt templates now
 * live entirely in the pi-jit-agents package. There is exactly one shared
 * "agent" abstraction used uniformly by every consumer (behavior monitors,
 * workflow steps, agent-as-tool dispatch) — no per-consumer agent kind — so
 * pi-workflows no longer keeps its own copy of template-resolution logic.
 * Consumers needing the bundled template root import `bundledTemplateDir`
 * from `@davidorex/pi-jit-agents/template` instead of asking this helper.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

// This line deliberately uses path.dirname(fileURLToPath(import.meta.url))
// instead of the simpler import.meta.dirname, because this call runs eagerly
// at module top-level: import.meta.dirname is undefined when this module gets
// loaded through tsx's CommonJS-interop path, and an eager reference to an
// undefined value throws immediately at import time (this exact failure was
// hit and fixed elsewhere in the codebase). import.meta.url stays defined
// under both load paths, so it's the safe idiom for code that runs at module
// load, not just inside a function.
const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// createRequire (not a bare `require`) for the same dual-load-path reason as
// above: this is an ESM module, and the CJS-interop path has no ambient
// require either. require.resolve follows the workspace symlink to the real
// package dir, so the resolved root is correct in every install layout.
const requireFromHere = createRequire(import.meta.url);
const PI_CONTEXT_ROOT = path.dirname(requireFromHere.resolve("@davidorex/pi-context/package.json"));

export function bundledDir(subdir: "agents" | "workflows" | "schemas"): string {
	if (subdir === "workflows") return path.join(PACKAGE_ROOT, "workflows");
	if (subdir === "agents") return path.join(PI_CONTEXT_ROOT, "samples", "agents");
	return path.join(PI_CONTEXT_ROOT, "samples", "agents", "schemas");
}
