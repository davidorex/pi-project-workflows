/**
 * Inline-by-source macro dispatch.
 *
 * Both `renderItemById` (pi-workflows) and `render_recursive` (the Nunjucks
 * global registered by `registerCompositionGlobals` in this package) need to
 * render an item through an absolute-path per-item macro file. The shared
 * approach: read the macro file source, append `{{ <macroName>(item, depth) }}`
 * so the dispatch resolves regardless of the env's FileSystemLoader search
 * paths, then `renderString` against a context that exposes `item` and
 * `depth`. Any failure surfaces as a `[render_error: <errorContext>: <detail>]`
 * marker so the caller's output contract holds.
 *
 * The `errorContext` parameter is the caller-composed prefix that lands inside
 * the `[render_error: …]` marker; emit-site shape varies (`<kind>/<id>`) so
 * the helper keeps it as opaque text.
 */
import fs from "node:fs";
import type nunjucks from "nunjucks";
import { renderErrorMarker } from "./markers.js";

export interface DispatchInlineMacroOptions {
	/** Active Nunjucks environment whose globals the macro is expected to consume. */
	env: nunjucks.Environment;
	/** Absolute path to the per-item macro file. */
	templatePath: string;
	/** Macro name to invoke inside the macro file. */
	macroName: string;
	/** Item payload bound to the macro's `item` parameter. */
	item: unknown;
	/** Recursion depth bound to the macro's `depth` parameter. */
	depth: number;
	/**
	 * Opaque prefix dropped into the `[render_error: <errorContext>: <detail>]`
	 * marker on failure. Typical shape: `<kind>/<id>`.
	 */
	errorContext: string;
}

/**
 * Read the macro source, inline-dispatch the named macro with `item`/`depth`
 * bound, and return the rendered output. On file-read failure or render-time
 * exception, returns the corresponding `[render_error: …]` marker.
 */
export function dispatchInlineMacro(opts: DispatchInlineMacroOptions): string {
	const { env, templatePath, macroName, item, depth, errorContext } = opts;
	let macroSource: string;
	try {
		macroSource = fs.readFileSync(templatePath, "utf-8");
	} catch (err) {
		return renderErrorMarker(
			`${errorContext}: macro file unreadable at ${templatePath}: ${err instanceof Error ? err.message : String(err)}`,
		);
	}
	const inline = `${macroSource}\n{{ ${macroName}(item, depth) }}`;
	try {
		return env.renderString(inline, { item, depth });
	} catch (err) {
		return renderErrorMarker(`${errorContext}: ${err instanceof Error ? err.message : String(err)}`);
	}
}
