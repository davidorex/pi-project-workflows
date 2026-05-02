/**
 * Schema-field path expansion helpers.
 *
 * Translation between the readable dotted shorthand callers prefer
 * (`decisions.items.context`) and the JSON-pointer form the budget enforcer
 * and other JSON-Schema-aware consumers consume
 * (`/properties/decisions/items/properties/context`). Pulled out of compile.ts
 * so the canonical implementation lives in one place — pi-workflows'
 * test-helpers consumes the export rather than re-implementing the same
 * expansion locally.
 */

/**
 * Translate a dotted shorthand schema-field reference into a JSON-pointer path.
 *
 * Accepts either:
 *   - JSON pointer (`/properties/decisions/items/properties/context`) — passes through.
 *   - Dotted shorthand (`decisions.items.context`) — expands each segment as a
 *     `properties/<segment>` pair, with `items` translated literally to the
 *     `items` keyword (the standard JSON-Schema array-element key). The
 *     shorthand expansion is idempotent for inputs that already begin with
 *     `/`, so callers can pass either form without ceremony.
 *
 * Examples:
 *   "decisions.items.context"
 *     → "/properties/decisions/items/properties/context"
 *   "decisions.items.consequences.items"
 *     → "/properties/decisions/items/properties/consequences/items"
 *   "/properties/foo/properties/bar"
 *     → "/properties/foo/properties/bar"           (unchanged)
 */
export function expandFieldPathShorthand(fieldPathOrShorthand: string): string {
	if (fieldPathOrShorthand.startsWith("/")) return fieldPathOrShorthand;
	if (fieldPathOrShorthand === "") return "";
	const segments = fieldPathOrShorthand.split(".");
	const out: string[] = [];
	for (const seg of segments) {
		if (seg === "items") {
			out.push("items");
		} else {
			out.push("properties", seg);
		}
	}
	return `/${out.join("/")}`;
}
