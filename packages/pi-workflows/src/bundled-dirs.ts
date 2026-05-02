/**
 * Resolved paths into this package's bundled defaults directories.
 *
 * Pi loads pi-workflows from `dist/`; the bundled `agents/`, `templates/`,
 * `workflows/`, and `schemas/` directories sit one level above the runtime JS
 * (i.e. at the package root). Every consumer that previously hand-built
 * `path.resolve(import.meta.dirname, "..", "<subdir>")` now routes through
 * `bundledDir(name)` so the relative-path arithmetic exists once. Module-scoped
 * — never re-export from the package barrel, since the value is meaningful
 * only when computed against this file's own location.
 */
import path from "node:path";

const PACKAGE_ROOT = path.resolve(import.meta.dirname, "..");

export function bundledDir(subdir: "agents" | "templates" | "workflows" | "schemas"): string {
	return path.join(PACKAGE_ROOT, subdir);
}
