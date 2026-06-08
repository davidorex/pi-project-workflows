/**
 * pi-context CLI render + error-shaping helpers.
 *
 * This module hosts the CLI-side presentation layer that the in-pi dispatch path
 * intentionally never touches: a generic markdown-table renderer (lifted from the
 * orchestrator script twin) and an AJV ValidationError translator that turns the
 * raw AJV message into field-named guidance. Both are pure functions — no I/O, no
 * substrate access — so they unit-test in isolation and the op-registry stays
 * byte-unchanged.
 */
import type { ValidationError } from "@davidorex/pi-context/schema-validator";
import type { ErrorObject } from "ajv";

/**
 * Structural guard for a pi-context {@link ValidationError}.
 *
 * `instanceof ValidationError` is UNRELIABLE across this package boundary: the op
 * registry reaches `schema-validator` through one module-resolution path and the
 * CLI imports the class through the `@davidorex/pi-context/schema-validator`
 * subpath export — Node can give these two distinct class objects, so a real
 * ValidationError thrown by an op fails `instanceof` here (observed: `e.name` ===
 * "ValidationError" yet `e instanceof ValidationError` === false). Detect by the
 * stable shape instead: a `name` of "ValidationError" carrying the `errors`
 * (AJV `ErrorObject[]`) and `label` fields `formatAjvError` reads.
 */
export function isValidationError(err: unknown): err is ValidationError {
	return (
		err instanceof Error &&
		err.name === "ValidationError" &&
		Array.isArray((err as { errors?: unknown }).errors) &&
		typeof (err as { label?: unknown }).label === "string"
	);
}

/**
 * Render an array of objects as a compact markdown table.
 *
 * Lifted from `scripts/orchestrator/filter-block-items.ts`'s `renderTable` so the
 * `--format table` CLI surface produces the same projection the script twin does.
 * Column selection is best-effort terse: `id` first when present, then up to three
 * more keys from the first row (≤4 columns total); if the first row has no `id`,
 * the first four keys. Cells: null/undefined → empty; strings verbatim; non-string
 * values `JSON.stringify`'d; internal newlines collapsed to a single space; capped
 * at 80 chars (>80 → first 77 + "...").
 *
 * Non-array / empty inputs are NOT a table: an empty array (or any non-array) yields
 * the sentinel `"(no rows)"` so the dispatch layer can fall back to text rather than
 * emit a degenerate table.
 */
export function renderTable(rows: unknown): string {
	if (!Array.isArray(rows) || rows.length === 0) return "(no rows)";
	const first = rows[0] as Record<string, unknown>;
	const keys = Object.keys(first);
	const hasId = keys.includes("id");
	const others = keys.filter((k) => k !== "id").slice(0, 3);
	const cols = hasId ? ["id", ...others] : keys.slice(0, 4);
	const header = `| ${cols.join(" | ")} |`;
	const sep = `| ${cols.map(() => "---").join(" | ")} |`;
	const body = rows.map((raw) => {
		const it = raw as Record<string, unknown>;
		return `| ${cols
			.map((c) => {
				const v = it[c];
				if (v === undefined || v === null) return "";
				const s = typeof v === "string" ? v : JSON.stringify(v);
				const oneLine = s.replace(/\s*\n\s*/g, " ");
				return oneLine.length > 80 ? `${oneLine.slice(0, 77)}...` : oneLine;
			})
			.join(" | ")} |`;
	});
	return [header, sep, ...body].join("\n");
}

/**
 * Translate an AJV {@link ValidationError} into field-named guidance.
 *
 * The raw `ValidationError.message` concatenates AJV's terse `instancePath: message`
 * fragments (e.g. "must have required property 'package'"), which name the JSON
 * pointer but bury the actionable field name and constraint. This re-shapes each
 * `err.errors[]` AJV `ErrorObject` into one guidance line per error, keyword-aware:
 *   - required             → `<path>`: missing required field `<missingProperty>`
 *   - type                 → `<path>`: expected <type>
 *   - enum                 → `<path>`: must be one of <allowedValues…>
 *   - additionalProperties → `<path>`: unexpected property `<additionalProperty>`
 *   - (any other keyword)  → `<path>`: <raw message>
 * Segments join with "; " — one segment per error, so the error COUNT is never
 * dropped — and the whole is prefixed `validation failed for <label>: …`.
 */
export function formatAjvError(err: ValidationError): string {
	const segments = err.errors.map((e: ErrorObject) => {
		const at = e.instancePath || "/";
		const params = (e.params ?? {}) as Record<string, unknown>;
		switch (e.keyword) {
			case "required":
				return `\`${at}\`: missing required field \`${String(params.missingProperty)}\``;
			case "type":
				return `\`${at}\`: expected ${String(params.type)}`;
			case "enum": {
				const allowed = Array.isArray(params.allowedValues) ? params.allowedValues.join(", ") : "";
				return `\`${at}\`: must be one of ${allowed}`;
			}
			case "additionalProperties":
				return `\`${at}\`: unexpected property \`${String(params.additionalProperty)}\``;
			default:
				return `\`${at}\`: ${e.message ?? "invalid"}`;
		}
	});
	return `validation failed for ${err.label}: ${segments.join("; ")}`;
}
