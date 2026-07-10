/**
 * Resolved paths into this package's bundled defaults directories.
 *
 * Pi loads pi-workflows from `dist/`; the bundled `agents/`, `workflows/`, and
 * `schemas/` directories sit one level above the runtime JS (i.e. at the
 * package root). Every consumer that previously hand-built
 * `path.resolve(import.meta.dirname, "..", "<subdir>")` now routes through
 * `bundledDir(name)` so the relative-path arithmetic exists once. Module-scoped
 * — never re-export from the package barrel, since the value is meaningful
 * only when computed against this file's own location.
 *
 * The "templates" branch was removed on purpose: agent-prompt templates now
 * live entirely in the pi-jit-agents package. There is exactly one shared
 * "agent" abstraction used uniformly by every consumer (behavior monitors,
 * workflow steps, agent-as-tool dispatch) — no per-consumer agent kind — so
 * pi-workflows no longer keeps its own copy of template-resolution logic.
 * Consumers needing the bundled template root import `bundledTemplateDir`
 * from `@davidorex/pi-jit-agents/template` instead of asking this helper.
 */
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

export function bundledDir(subdir: "agents" | "workflows" | "schemas"): string {
	return path.join(PACKAGE_ROOT, subdir);
}
