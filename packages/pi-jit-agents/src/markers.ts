/**
 * Composition-time marker formatters.
 *
 * Four marker shapes are produced by both `renderItemById` (pi-workflows) and
 * `render_recursive` (pi-jit-agents/compile.ts) when composition cannot
 * proceed in the happy path:
 *
 *   - `[not-found: <id>]`        — resolver miss; id is not present in the
 *                                  built id-index.
 *   - `[unrendered: <kind>/<id>]`— registry miss; the renderer registry has no
 *                                  per-item macro for the item's block kind.
 *   - `[render_error: <msg>]`    — exception path during macro inline render
 *                                  (file-read failure or Nunjucks render error).
 *                                  The caller composes the contextual prefix
 *                                  (typically `<kind>/<id>: <detail>`) since
 *                                  the prefix shape varies by emit site.
 *   - `[cycle: <id>]`            — back-edge in the cross-reference graph
 *                                  detected during a recursive descent.
 *
 * The output strings are byte-identical to the inline templates these helpers
 * replaced; existing test assertions match the literal forms. Future drift in
 * marker text propagates through these formatters in a single edit.
 */

export function notFoundMarker(id: string): string {
	return `[not-found: ${id}]`;
}

export function unrenderedMarker(kind: string, id: string): string {
	return `[unrendered: ${kind}/${id}]`;
}

export function renderErrorMarker(msg: string): string {
	return `[render_error: ${msg}]`;
}

export function cycleMarker(id: string): string {
	return `[cycle: ${id}]`;
}
