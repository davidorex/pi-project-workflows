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
 *   - `dispatchInlineMacro`      — pi-jit-agents, single inline-by-source
 *                                  macro dispatch shared with `render_recursive`
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

import type { BudgetWarning } from "@davidorex/pi-jit-agents";
import {
	createRendererRegistry,
	createTemplateEnv,
	dispatchInlineMacro,
	notFoundMarker,
	registerCompositionGlobals,
	unrenderedMarker,
} from "@davidorex/pi-jit-agents";
import { buildIdIndex, type ItemLocation } from "@davidorex/pi-project";
import { bundledDir } from "./bundled-dirs.js";

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
		return notFoundMarker(id);
	}

	const builtinDir = bundledDir("templates");
	const registry = createRendererRegistry({ cwd, builtinDir });
	const macroRef = registry.lookup(loc.block);
	if (!macroRef) {
		return unrenderedMarker(loc.block, id);
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

	// Inline-by-source dispatch via the shared dispatchInlineMacro helper —
	// the same approach `render_recursive` uses. Reads the macro file content
	// and appends a call expression so absolute macro paths from the registry
	// dispatch directly without going through the env's FileSystemLoader (the
	// loader is anchored to the three-tier search dirs configured at
	// createTemplateEnv time, which may not contain the absolute macro paths
	// the registry returns).
	return dispatchInlineMacro({
		env,
		templatePath: macroRef.templatePath,
		macroName: macroRef.macroName,
		item: loc.item,
		depth,
		errorContext: `${loc.block}/${id}`,
	});
}

export type { ItemLocation };
