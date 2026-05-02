/**
 * Composition-time helper: render a project block item by ID through its
 * registered per-item macro.
 *
 * Composes the substrate primitives:
 *   - `buildIdIndex(cwd)`        — pi-project, locates the item by ID
 *   - `createRendererRegistry`   — pi-jit-agents, resolves the per-item macro
 *   - `createTemplateEnv`        — pi-jit-agents, constructs the Nunjucks env
 *   - `registerCompositionGlobals` — pi-jit-agents, installs the same
 *                                  resolve / render_recursive / enforceBudget
 *                                  globals that compileAgent installs
 *
 * The single source of truth for the composition-globals contract is
 * `registerCompositionGlobals` in pi-jit-agents — both compileAgent and this
 * helper consume it. A new global, a signature change, or a fallback-marker
 * adjustment lands once and propagates to every caller.
 *
 * Output contract:
 *   - happy path:    renders the item via the registry's macro for the item's
 *                    block kind, with cycle detection across recursive sibling
 *                    references, returning the rendered string.
 *   - resolver miss: returns `[not-found: <id>]` — the ID does not exist in any
 *                    indexed block.
 *   - registry miss: returns `[unrendered: <kind>/<id>]` — the registry has no
 *                    per-item macro for the item's block kind. Mirrors the
 *                    `render_recursive` fallback marker so a caller comparing
 *                    output across direct invocation vs recursive-from-macro
 *                    sees the same shape.
 *
 * The `builtinDir` for the renderer registry resolves to this package's
 * bundled `templates/` directory (the Plan 6/7/8 per-item macros), the third
 * tier in the registry's project / user / builtin search.
 */

import fs from "node:fs";
import path from "node:path";
import type { BudgetWarning } from "@davidorex/pi-jit-agents";
import { createRendererRegistry, createTemplateEnv, registerCompositionGlobals } from "@davidorex/pi-jit-agents";
import { buildIdIndex, type ItemLocation } from "@davidorex/pi-project";

/**
 * Absolute path to the bundled per-item macros directory inside this package.
 *
 * Resolution: `dist/render-by-id.js` is at runtime location, two levels up
 * lands at the package root, then `templates/` for the macros. The renderer
 * registry expects `<builtinDir>/items/<kind>.md` so this path is the
 * `<builtinDir>` value, not the full items path.
 */
function bundledTemplatesDir(): string {
	return path.resolve(import.meta.dirname, "..", "templates");
}

/**
 * Render the item identified by `id` via its registered per-item macro.
 *
 * @param cwd   project root used for `.project/` block reads, schema lookups
 *              for `enforceBudget`, and the project tier of registry / template
 *              discovery.
 * @param id    kind-prefixed item ID (DEC-/FEAT-/FGAP-/issue-/REQ-/TASK-/...).
 * @param depth recursion budget for cross-block reference inlining inside the
 *              macro. 0 = bare-ID refs (no recursion); 1 = inline direct refs;
 *              2+ = recursive descent up to the budget. The macro's own
 *              `depth > 0` guards control fan-out, then `render_recursive`
 *              propagates `depth - 1` per descent.
 *
 * @returns rendered string per the output contract documented at file head:
 *          `[not-found: <id>]` on resolver miss,
 *          `[unrendered: <kind>/<id>]` on registry miss,
 *          rendered text on happy path.
 *
 * Side-effect: budget warnings collected by the `enforceBudget` global during
 * rendering are silently discarded by this entry point. A future surface may
 * propagate them through the return shape; the current contract returns only
 * the rendered string for parity with `render_recursive`.
 */
export function renderItemById(cwd: string, id: string, depth: number = 0): string {
	const idIndex = buildIdIndex(cwd);
	const loc = idIndex.get(id);
	if (!loc) {
		return `[not-found: ${id}]`;
	}

	const builtinDir = bundledTemplatesDir();
	const registry = createRendererRegistry({ cwd, builtinDir });
	const macroRef = registry.lookup(loc.block);
	if (!macroRef) {
		return `[unrendered: ${loc.block}/${id}]`;
	}

	const env = createTemplateEnv({ cwd, builtinDir });

	// Composition globals — single source per registerCompositionGlobals.
	// Pass a getIdIndex closure that returns the already-built index so the
	// resolve/render_recursive globals do not rebuild it on each call.
	const warnings: BudgetWarning[] = [];
	registerCompositionGlobals({
		env,
		cwd,
		rendererRegistry: registry,
		getIdIndex: () => idIndex,
		warningsCollector: warnings,
	});

	// Inline-by-source dispatch — the same approach `render_recursive` uses.
	// Read the macro file content and append a call expression so absolute
	// macro paths from the registry are dispatched directly without going
	// through the env's FileSystemLoader (the loader is anchored to the
	// three-tier search dirs configured at createTemplateEnv time, which may
	// not contain the absolute macro paths the registry returns).
	let macroSource: string;
	try {
		macroSource = fs.readFileSync(macroRef.templatePath, "utf-8");
	} catch (err) {
		return `[render_error: ${loc.block}/${id}: macro file unreadable at ${macroRef.templatePath}: ${
			err instanceof Error ? err.message : String(err)
		}]`;
	}
	const inline = `${macroSource}\n{{ ${macroRef.macroName}(item, depth) }}`;
	try {
		return env.renderString(inline, { item: loc.item, depth });
	} catch (err) {
		return `[render_error: ${loc.block}/${id}: ${err instanceof Error ? err.message : String(err)}]`;
	}
}

export type { ItemLocation };
