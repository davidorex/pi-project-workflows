import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeSchema, type SchemaConflict } from "./schema-merge.js";

// Pure unit suite over mergeSchema (no substrate, no I/O). Every case feeds three
// plain objects (base, ours, theirs) and asserts the merged body + the conflict
// set. Value equality inside the merge is canonical-JSON, so key order is
// irrelevant to these assertions.

describe("mergeSchema — object per-key merge", () => {
	it("disjoint adds: ours adds A, theirs adds B → both present, no conflict", () => {
		const base = { type: "object", properties: {} as Record<string, unknown> };
		const ours = { type: "object", properties: { a: { type: "string" } } };
		const theirs = { type: "object", properties: { b: { type: "number" } } };
		const { merged, conflicts } = mergeSchema(base, ours, theirs);
		assert.deepEqual(conflicts, []);
		assert.deepEqual(merged.properties, { a: { type: "string" }, b: { type: "number" } });
	});

	it("same add on both sides: identical key+value added → present once, no conflict", () => {
		const base = { properties: {} as Record<string, unknown> };
		const add = { properties: { a: { type: "string" } } };
		const { merged, conflicts } = mergeSchema(base, add, add);
		assert.deepEqual(conflicts, []);
		assert.deepEqual(merged.properties, { a: { type: "string" } });
	});

	it("add-vs-add-different: both add key A with different values → conflict at properties.a", () => {
		const base = { properties: {} as Record<string, unknown> };
		const ours = { properties: { a: { type: "string" } } };
		const theirs = { properties: { a: { type: "number" } } };
		const { conflicts } = mergeSchema(base, ours, theirs);
		assert.equal(conflicts.length, 1);
		assert.equal(conflicts[0].path, "properties.a");
		assert.deepEqual(conflicts[0].ours, { type: "string" });
		assert.deepEqual(conflicts[0].theirs, { type: "number" });
	});

	it("delete-vs-unchanged: ours drops key A, theirs leaves it untouched → key removed, no conflict", () => {
		const base = { properties: { a: { type: "string" }, b: { type: "number" } } };
		const ours = { properties: { b: { type: "number" } } };
		const theirs = { properties: { a: { type: "string" }, b: { type: "number" } } };
		const { merged, conflicts } = mergeSchema(base, ours, theirs);
		assert.deepEqual(conflicts, []);
		assert.deepEqual(merged.properties, { b: { type: "number" } });
		assert.ok(!Object.hasOwn(merged.properties as object, "a"), "deleted key must be absent");
	});

	it("delete-vs-modify: ours drops key A, theirs changes A → conflict at properties.a", () => {
		const base = { properties: { a: { type: "string" } } };
		const ours = { properties: {} as Record<string, unknown> };
		const theirs = { properties: { a: { type: "number" } } };
		const { conflicts } = mergeSchema(base, ours, theirs);
		assert.equal(conflicts.length, 1);
		assert.equal(conflicts[0].path, "properties.a");
		assert.deepEqual(conflicts[0].base, { type: "string" });
	});
});

describe("mergeSchema — SET-ARRAY (required / enum / type)", () => {
	it("required: union of disjoint adds (ours adds X, theirs adds Y, base empty)", () => {
		const base = { required: ["id"] };
		const ours = { required: ["id", "x"] };
		const theirs = { required: ["id", "y"] };
		const { merged, conflicts } = mergeSchema(base, ours, theirs);
		assert.deepEqual(conflicts, []);
		assert.deepEqual([...(merged.required as string[])].sort(), ["id", "x", "y"]);
	});

	it("required: ours removes a value (base had it, ours dropped, theirs kept) → removal honored", () => {
		const base = { required: ["id", "drop_me"] };
		const ours = { required: ["id"] }; // dropped drop_me
		const theirs = { required: ["id", "drop_me"] }; // unchanged
		const { merged, conflicts } = mergeSchema(base, ours, theirs);
		assert.deepEqual(conflicts, []);
		assert.deepEqual(merged.required, ["id"], "the value ours removed must be absent");
		assert.ok(!(merged.required as string[]).includes("drop_me"));
	});

	it("enum: both sides widen the enum → union of all added values, no conflict", () => {
		const base = { enum: ["a"] };
		const ours = { enum: ["a", "b"] };
		const theirs = { enum: ["a", "c"] };
		const { merged, conflicts } = mergeSchema(base, ours, theirs);
		assert.deepEqual(conflicts, []);
		assert.deepEqual([...(merged.enum as string[])].sort(), ["a", "b", "c"]);
	});

	it("enum: user narrows while catalog widens → narrowing removal honored AND widening add kept", () => {
		// base [a,b]; ours narrows to [a] (drops b); theirs widens to [a,b,c].
		// (ours \ base)=∅; (theirs\base)={c}; (ours∩theirs)={a}. b: in base, not in
		// ours → ours removed it; in theirs unchanged → removal wins. Result {a,c}.
		const base = { enum: ["a", "b"] };
		const ours = { enum: ["a"] };
		const theirs = { enum: ["a", "b", "c"] };
		const { merged, conflicts } = mergeSchema(base, ours, theirs);
		assert.deepEqual(conflicts, []);
		assert.deepEqual([...(merged.enum as string[])].sort(), ["a", "c"]);
	});

	it("type: an array-valued type (union list) merges as a set", () => {
		const base = { type: ["string"] };
		const ours = { type: ["string", "null"] };
		const theirs = { type: ["string", "number"] };
		const { merged, conflicts } = mergeSchema(base, ours, theirs);
		assert.deepEqual(conflicts, []);
		assert.deepEqual([...(merged.type as string[])].sort(), ["null", "number", "string"]);
	});
});

describe("mergeSchema — atomic 3-way (scalars)", () => {
	it("base==ours → take theirs", () => {
		const { merged, conflicts } = mergeSchema({ title: "x" }, { title: "x" }, { title: "y" });
		assert.deepEqual(conflicts, []);
		assert.equal(merged.title, "y");
	});

	it("base==theirs → take ours", () => {
		const { merged, conflicts } = mergeSchema({ title: "x" }, { title: "mine" }, { title: "x" });
		assert.deepEqual(conflicts, []);
		assert.equal(merged.title, "mine");
	});

	it("all three differ → conflict with the correct path", () => {
		const { conflicts } = mergeSchema({ title: "x" }, { title: "mine" }, { title: "theirs" });
		assert.equal(conflicts.length, 1);
		assert.equal(conflicts[0].path, "title");
		assert.equal(conflicts[0].base, "x");
		assert.equal(conflicts[0].ours, "mine");
		assert.equal(conflicts[0].theirs, "theirs");
	});

	it("nested-path scalar conflict surfaces the full dotted path", () => {
		const base = { properties: { status: { type: "string" } } };
		const ours = { properties: { status: { type: "boolean" } } };
		const theirs = { properties: { status: { type: "number" } } };
		const { conflicts } = mergeSchema(base, ours, theirs);
		assert.equal(conflicts.length, 1);
		assert.equal(conflicts[0].path, "properties.status.type");
	});
});

describe("mergeSchema — determinism", () => {
	it("identical inputs produce deep-equal output across two runs", () => {
		const base = { type: "object", required: ["id"], properties: { a: { type: "string" } } };
		const ours = {
			type: "object",
			required: ["id", "x"],
			properties: { a: { type: "string" }, b: { enum: ["p", "q"] } },
		};
		const theirs = {
			type: "object",
			required: ["id", "y"],
			properties: { a: { type: "string" }, c: { type: "number" } },
		};
		const r1 = mergeSchema(base, ours, theirs);
		const r2 = mergeSchema(base, ours, theirs);
		assert.deepEqual(r1.merged, r2.merged);
		assert.deepEqual(r1.conflicts, r2.conflicts);
		// And the serialized form is byte-identical (stronger determinism check).
		assert.equal(JSON.stringify(r1.merged), JSON.stringify(r2.merged));
	});
});

// Type-only reference so SchemaConflict is exercised by the suite import.
const _typeCheck: SchemaConflict = { path: "", base: 0, ours: 0, theirs: 0 };
void _typeCheck;
