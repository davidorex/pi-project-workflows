// Minimal stub — satisfies value imports from `@mariozechner/pi-ai` used
// at module load in index.ts (notably the `Type` / `StringEnum` builders
// referenced by the `_VERDICT_TOOL` documentation Tool definition). No
// runtime behaviour needed; tests never call into the real pi-ai SDK or
// the phantom-tool path.

export function complete() {
	throw new Error("pi-ai stub: complete() should not be called in tests");
}

// `Type` is the TypeBox builder.  `_VERDICT_TOOL` only constructs a schema
// at module load and never round-trips it through any validator in the
// test path, so we return inert plain-object placeholders that are
// structurally schema-shaped enough to satisfy the value-level evaluation.
type SchemaShape = Record<string, unknown>;
function makeSchema(shape: SchemaShape): SchemaShape {
	return shape;
}
export const Type = {
	Object: (props: Record<string, SchemaShape>): SchemaShape =>
		makeSchema({ type: "object", properties: props }),
	String: (opts?: SchemaShape): SchemaShape => makeSchema({ type: "string", ...opts }),
	Optional: (inner: SchemaShape): SchemaShape => makeSchema({ ...inner, optional: true }),
};

// `StringEnum` is a thin enum-string helper in pi-ai.  Only the value
// import is observed at module load; tests never invoke the resulting
// schema, so we return an inert placeholder.
export function StringEnum(values: readonly string[]): SchemaShape {
	return { type: "string", enum: [...values] };
}
