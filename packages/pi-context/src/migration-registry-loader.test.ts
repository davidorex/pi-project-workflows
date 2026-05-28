import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { writeBootstrapPointer } from "./context-dir.js";
import {
	buildRegistryFromSubstrate,
	getProjectMigrationRegistry,
	invalidateMigrationRegistry,
	migrationFnFor,
} from "./migration-registry-loader.js";
import { appendMigrationDecl, type MigrationDecl } from "./migrations-store.js";
import { runMigrations } from "./schema-migrations.js";

function makeTmpDir(prefix: string): string {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), `migration-loader-${prefix}-`));
	writeBootstrapPointer(cwd, ".project");
	fs.mkdirSync(path.join(cwd, ".project"), { recursive: true });
	return cwd;
}

function declIdentity(schemaName: string, from: string, to: string): MigrationDecl {
	return {
		schemaName,
		fromVersion: from,
		toVersion: to,
		kind: "identity",
		created_by: "t@e",
		created_at: "2026-05-29T00:00:00.000Z",
	};
}

describe("migrationFnFor: identity", () => {
	it("returns a function that yields the input reference unchanged (no-op)", () => {
		const fn = migrationFnFor(declIdentity("thing", "1.0.0", "2.0.0"));
		const input = { a: 1, b: { c: 2 } };
		const output = fn(input);
		// identity branch is a strict reference pass-through; that is the
		// efficient case the operator opts into when shape is unchanged.
		assert.strictEqual(output, input);
	});

	it("throws for unknown kind (defensive — future-additive guard)", () => {
		assert.throws(() => migrationFnFor({ ...declIdentity("x", "1.0.0", "2.0.0"), kind: "weird" as never }));
	});
});

describe("migrationFnFor: declarative-transform 'rename' op", () => {
	it("renames a top-level field", () => {
		const fn = migrationFnFor({
			schemaName: "thing",
			fromVersion: "1.0.0",
			toVersion: "2.0.0",
			kind: "declarative-transform",
			transform: { operations: [{ op: "rename", from: "$.name", to: "$.label" }] },
			created_by: "t@e",
			created_at: "2026-05-29T00:00:00.000Z",
		});
		const out = fn({ name: "x", keep: 1 }) as Record<string, unknown>;
		assert.equal(out.label, "x");
		assert.equal(out.keep, 1);
		assert.ok(!("name" in out));
	});

	it("renames a nested field, preserving siblings", () => {
		const fn = migrationFnFor({
			schemaName: "thing",
			fromVersion: "1.0.0",
			toVersion: "2.0.0",
			kind: "declarative-transform",
			transform: { operations: [{ op: "rename", from: "$.outer.inner", to: "$.outer.renamed" }] },
			created_by: "t@e",
			created_at: "2026-05-29T00:00:00.000Z",
		});
		const out = fn({ outer: { inner: 42, sibling: 7 }, top: "x" }) as Record<string, Record<string, unknown>>;
		assert.equal(out.outer!.renamed, 42);
		assert.equal(out.outer!.sibling, 7);
		assert.equal(out.top as unknown, "x");
		assert.ok(!("inner" in out.outer!));
	});

	it("no-ops when the source field is absent", () => {
		const fn = migrationFnFor({
			schemaName: "thing",
			fromVersion: "1.0.0",
			toVersion: "2.0.0",
			kind: "declarative-transform",
			transform: { operations: [{ op: "rename", from: "$.missing", to: "$.elsewhere" }] },
			created_by: "t@e",
			created_at: "2026-05-29T00:00:00.000Z",
		});
		const out = fn({ keep: 1 });
		assert.deepEqual(out, { keep: 1 });
	});
});

describe("migrationFnFor: declarative-transform 'set' op", () => {
	it("sets a top-level field with the provided value", () => {
		const fn = migrationFnFor({
			schemaName: "thing",
			fromVersion: "1.0.0",
			toVersion: "2.0.0",
			kind: "declarative-transform",
			transform: { operations: [{ op: "set", path: "$.flag", value: true }] },
			created_by: "t@e",
			created_at: "2026-05-29T00:00:00.000Z",
		});
		const out = fn({ a: 1 });
		assert.deepEqual(out, { a: 1, flag: true });
	});

	it("creates intermediate object parents as needed when setting a nested path", () => {
		const fn = migrationFnFor({
			schemaName: "thing",
			fromVersion: "1.0.0",
			toVersion: "2.0.0",
			kind: "declarative-transform",
			transform: { operations: [{ op: "set", path: "$.deeply.nested.path", value: 42 }] },
			created_by: "t@e",
			created_at: "2026-05-29T00:00:00.000Z",
		});
		const out = fn({});
		assert.deepEqual(out, { deeply: { nested: { path: 42 } } });
	});

	it("overwrites an existing leaf value at the set path", () => {
		const fn = migrationFnFor({
			schemaName: "thing",
			fromVersion: "1.0.0",
			toVersion: "2.0.0",
			kind: "declarative-transform",
			transform: { operations: [{ op: "set", path: "$.x", value: "new" }] },
			created_by: "t@e",
			created_at: "2026-05-29T00:00:00.000Z",
		});
		const out = fn({ x: "old" });
		assert.deepEqual(out, { x: "new" });
	});
});

describe("migrationFnFor: declarative-transform 'delete' op", () => {
	it("removes a top-level field", () => {
		const fn = migrationFnFor({
			schemaName: "thing",
			fromVersion: "1.0.0",
			toVersion: "2.0.0",
			kind: "declarative-transform",
			transform: { operations: [{ op: "delete", path: "$.gone" }] },
			created_by: "t@e",
			created_at: "2026-05-29T00:00:00.000Z",
		});
		const out = fn({ gone: 1, keep: 2 });
		assert.deepEqual(out, { keep: 2 });
	});

	it("removes a nested field", () => {
		const fn = migrationFnFor({
			schemaName: "thing",
			fromVersion: "1.0.0",
			toVersion: "2.0.0",
			kind: "declarative-transform",
			transform: { operations: [{ op: "delete", path: "$.outer.inner" }] },
			created_by: "t@e",
			created_at: "2026-05-29T00:00:00.000Z",
		});
		const out = fn({ outer: { inner: 1, sibling: 2 } });
		assert.deepEqual(out, { outer: { sibling: 2 } });
	});

	it("no-ops when path is absent", () => {
		const fn = migrationFnFor({
			schemaName: "thing",
			fromVersion: "1.0.0",
			toVersion: "2.0.0",
			kind: "declarative-transform",
			transform: { operations: [{ op: "delete", path: "$.never.was" }] },
			created_by: "t@e",
			created_at: "2026-05-29T00:00:00.000Z",
		});
		const out = fn({ a: 1 });
		assert.deepEqual(out, { a: 1 });
	});
});

describe("migrationFnFor: declarative-transform 'coerce' op", () => {
	it("coerces to string", () => {
		const fn = migrationFnFor({
			schemaName: "thing",
			fromVersion: "1.0.0",
			toVersion: "2.0.0",
			kind: "declarative-transform",
			transform: { operations: [{ op: "coerce", path: "$.n", type: "string" }] },
			created_by: "t@e",
			created_at: "2026-05-29T00:00:00.000Z",
		});
		const out = fn({ n: 42 });
		assert.deepEqual(out, { n: "42" });
	});

	it("coerces to number", () => {
		const fn = migrationFnFor({
			schemaName: "thing",
			fromVersion: "1.0.0",
			toVersion: "2.0.0",
			kind: "declarative-transform",
			transform: { operations: [{ op: "coerce", path: "$.s", type: "number" }] },
			created_by: "t@e",
			created_at: "2026-05-29T00:00:00.000Z",
		});
		const out = fn({ s: "7" });
		assert.deepEqual(out, { s: 7 });
	});

	it("coerces to boolean", () => {
		const fn = migrationFnFor({
			schemaName: "thing",
			fromVersion: "1.0.0",
			toVersion: "2.0.0",
			kind: "declarative-transform",
			transform: { operations: [{ op: "coerce", path: "$.b", type: "boolean" }] },
			created_by: "t@e",
			created_at: "2026-05-29T00:00:00.000Z",
		});
		assert.deepEqual(fn({ b: 1 }), { b: true });
		assert.deepEqual(fn({ b: 0 }), { b: false });
	});

	it("coerces a scalar to a single-element array", () => {
		const fn = migrationFnFor({
			schemaName: "thing",
			fromVersion: "1.0.0",
			toVersion: "2.0.0",
			kind: "declarative-transform",
			transform: { operations: [{ op: "coerce", path: "$.items", type: "array" }] },
			created_by: "t@e",
			created_at: "2026-05-29T00:00:00.000Z",
		});
		assert.deepEqual(fn({ items: "x" }), { items: ["x"] });
		// existing array passes through unchanged.
		assert.deepEqual(fn({ items: ["a", "b"] }), { items: ["a", "b"] });
	});

	it("coerces a scalar to a (boxed) Object form", () => {
		const fn = migrationFnFor({
			schemaName: "thing",
			fromVersion: "1.0.0",
			toVersion: "2.0.0",
			kind: "declarative-transform",
			transform: { operations: [{ op: "coerce", path: "$.b", type: "object" }] },
			created_by: "t@e",
			created_at: "2026-05-29T00:00:00.000Z",
		});
		// Object(value) keeps an object reference identity for objects, boxes
		// primitives. The assertion below confirms the result is object-typed.
		const out = fn({ b: { x: 1 } }) as { b: { x: number } };
		assert.equal(typeof out.b, "object");
		assert.equal(out.b.x, 1);
	});
});

describe("migrationFnFor: composed multi-op chain", () => {
	it("applies rename + set in declaration order in the same TransformSpec", () => {
		const fn = migrationFnFor({
			schemaName: "thing",
			fromVersion: "1.0.0",
			toVersion: "2.0.0",
			kind: "declarative-transform",
			transform: {
				operations: [
					{ op: "rename", from: "$.name", to: "$.label" },
					{ op: "set", path: "$.added", value: 42 },
				],
			},
			created_by: "t@e",
			created_at: "2026-05-29T00:00:00.000Z",
		});
		const out = fn({ name: "x" });
		assert.deepEqual(out, { label: "x", added: 42 });
	});

	it("rejects array-element addressing in any path segment", () => {
		const fn = migrationFnFor({
			schemaName: "thing",
			fromVersion: "1.0.0",
			toVersion: "2.0.0",
			kind: "declarative-transform",
			transform: { operations: [{ op: "set", path: "$.arr[0]", value: 1 }] },
			created_by: "t@e",
			created_at: "2026-05-29T00:00:00.000Z",
		});
		assert.throws(() => fn({}), /array-element addressing/);
	});
});

describe("buildRegistryFromSubstrate + getProjectMigrationRegistry", () => {
	it("missing migrations.json yields an empty registry (no error)", (t) => {
		const cwd = makeTmpDir("empty-reg");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		const reg = buildRegistryFromSubstrate(cwd);
		// resolve(same, same) returns []; that proves it's a valid registry.
		assert.deepEqual(reg.resolve("anything", "1.0.0", "1.0.0"), []);
	});

	it("registry walks identity then declarative-transform chain end-to-end via runMigrations", (t) => {
		const cwd = makeTmpDir("e2e-chain");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		appendMigrationDecl(cwd, declIdentity("thing", "1.0.0", "2.0.0"));
		appendMigrationDecl(cwd, {
			schemaName: "thing",
			fromVersion: "2.0.0",
			toVersion: "3.0.0",
			kind: "declarative-transform",
			transform: { operations: [{ op: "rename", from: "$.name", to: "$.label" }] },
			created_by: "t@e",
			created_at: "2026-05-29T00:00:00.000Z",
		});
		const reg = buildRegistryFromSubstrate(cwd);
		const out = runMigrations(reg, "thing", "1.0.0", "3.0.0", { name: "x" });
		assert.deepEqual(out, { label: "x" });
	});

	it("cache: getProjectMigrationRegistry returns the same registry instance until invalidated", (t) => {
		const cwd = makeTmpDir("cache");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		const reg1 = getProjectMigrationRegistry(cwd);
		const reg2 = getProjectMigrationRegistry(cwd);
		assert.strictEqual(reg1, reg2);
		invalidateMigrationRegistry(cwd);
		const reg3 = getProjectMigrationRegistry(cwd);
		assert.notStrictEqual(reg1, reg3);
	});

	it("mutation helpers (appendMigrationDecl) auto-invalidate the cache so a fresh read reflects the new decl", (t) => {
		const cwd = makeTmpDir("auto-invalidate");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		// Warm cache before any decls land — empty registry cached.
		const before = getProjectMigrationRegistry(cwd);
		assert.throws(() => before.resolve("thing", "1.0.0", "2.0.0"));

		// Mutation → invalidation hook fires inside appendMigrationDecl.
		appendMigrationDecl(cwd, declIdentity("thing", "1.0.0", "2.0.0"));

		// Subsequent read returns a NEW registry that resolves the new chain.
		const after = getProjectMigrationRegistry(cwd);
		assert.notStrictEqual(before, after);
		const chain = after.resolve("thing", "1.0.0", "2.0.0");
		assert.equal(chain.length, 1);
	});
});
