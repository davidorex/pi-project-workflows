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
 * The "templates" branch was retired per DEC-0049 uniform-agent axiom: the
 * agent-prompt template tree relocated to pi-jit-agents. Consumers needing
 * the bundled template root import `bundledTemplateDir` from
 * `@davidorex/pi-jit-agents/template` instead of asking this helper.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

// fileURLToPath idiom (FGAP-088): this is EAGER (module top-level), so an
// undefined import.meta.dirname under tsx's CJS-interop dist-load would throw at
// import time; import.meta.url is defined in both load paths.
const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function bundledDir(subdir: "agents" | "workflows" | "schemas"): string {
	return path.join(PACKAGE_ROOT, subdir);
}
