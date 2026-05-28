import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { migrationsPath, writeBootstrapPointer } from "./context-dir.js";
import {
	appendMigrationDecl,
	loadMigrationsFile,
	MIGRATIONS_FILE_VERSION,
	type MigrationDecl,
	removeMigrationDecl,
	replaceMigrationDecl,
	writeMigrationsFile,
} from "./migrations-store.js";
import { ValidationError } from "./schema-validator.js";

function makeTmpDir(prefix: string): string {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), `migrations-store-${prefix}-`));
	writeBootstrapPointer(cwd, ".project");
	fs.mkdirSync(path.join(cwd, ".project"), { recursive: true });
	return cwd;
}

function declIdentity(schemaName: string, fromVersion: string, toVersion: string): MigrationDecl {
	return {
		schemaName,
		fromVersion,
		toVersion,
		kind: "identity",
		created_by: "test@example",
		created_at: "2026-05-29T00:00:00.000Z",
	};
}

function declTransform(
	schemaName: string,
	fromVersion: string,
	toVersion: string,
	operations: MigrationDecl["transform"] extends infer T ? (T extends { operations: infer O } ? O : never) : never,
): MigrationDecl {
	return {
		schemaName,
		fromVersion,
		toVersion,
		kind: "declarative-transform",
		transform: { operations },
		created_by: "test@example",
		created_at: "2026-05-29T00:00:00.000Z",
	};
}

describe("migrations-store: load + writeMigrationsFile", () => {
	it("loadMigrationsFile returns null when file absent (pre-write state)", (t) => {
		const cwd = makeTmpDir("load-absent");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		assert.equal(loadMigrationsFile(cwd), null);
	});

	it("writeMigrationsFile + loadMigrationsFile round-trips an identity decl byte-faithfully", (t) => {
		const cwd = makeTmpDir("round-trip");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		const original = {
			schema_version: MIGRATIONS_FILE_VERSION,
			migrations: [declIdentity("thing", "1.0.0", "2.0.0")],
		};
		writeMigrationsFile(cwd, original);
		const round = loadMigrationsFile(cwd);
		assert.deepEqual(round, original);
	});

	it("loadMigrationsFile rejects a malformed payload with ValidationError (AJV)", (t) => {
		const cwd = makeTmpDir("malformed");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		// Hand-write an on-disk migrations.json that violates the schema (missing
		// required migrations[] field) — bypasses writeMigrationsFile so the AJV
		// validation runs at load time.
		fs.writeFileSync(migrationsPath(cwd), JSON.stringify({ schema_version: "1.0.0" }), "utf-8");
		assert.throws(
			() => loadMigrationsFile(cwd),
			(err: unknown) => err instanceof ValidationError,
		);
	});

	it("writeMigrationsFile is atomic: a malformed file fails before disk landing", (t) => {
		const cwd = makeTmpDir("atomic-fail");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		// Seed a valid file.
		const seeded = {
			schema_version: MIGRATIONS_FILE_VERSION,
			migrations: [declIdentity("thing", "1.0.0", "2.0.0")],
		};
		writeMigrationsFile(cwd, seeded);
		const before = fs.readFileSync(migrationsPath(cwd), "utf-8");

		// Attempt to write a payload missing the required migrations field.
		assert.throws(
			() => writeMigrationsFile(cwd, { schema_version: "1.0.0" } as never),
			(err: unknown) => err instanceof ValidationError,
		);
		const after = fs.readFileSync(migrationsPath(cwd), "utf-8");
		assert.equal(after, before, "writeMigrationsFile must not have touched the file on validation failure");
	});
});

describe("migrations-store: appendMigrationDecl", () => {
	it("creates migrations.json when absent and inserts the decl", (t) => {
		const cwd = makeTmpDir("append-fresh");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		assert.ok(!fs.existsSync(migrationsPath(cwd)));

		const decl = declIdentity("thing", "1.0.0", "2.0.0");
		appendMigrationDecl(cwd, decl);

		const round = loadMigrationsFile(cwd);
		assert.deepEqual(round?.migrations, [decl]);
		assert.equal(round?.schema_version, MIGRATIONS_FILE_VERSION);
	});

	it("appends a second decl preserving the first", (t) => {
		const cwd = makeTmpDir("append-second");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		const a = declIdentity("thing", "1.0.0", "2.0.0");
		const b = declIdentity("thing", "2.0.0", "3.0.0");
		appendMigrationDecl(cwd, a);
		appendMigrationDecl(cwd, b);
		const round = loadMigrationsFile(cwd);
		assert.deepEqual(round?.migrations, [a, b]);
	});

	it("throws on (schemaName, fromVersion) collision with byte-identical file state", (t) => {
		const cwd = makeTmpDir("append-collision");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		const a = declIdentity("thing", "1.0.0", "2.0.0");
		appendMigrationDecl(cwd, a);
		const before = fs.readFileSync(migrationsPath(cwd), "utf-8");

		assert.throws(() => appendMigrationDecl(cwd, declIdentity("thing", "1.0.0", "2.5.0")), /collision/);
		const after = fs.readFileSync(migrationsPath(cwd), "utf-8");
		assert.equal(after, before);
	});

	it("persists a declarative-transform decl with TransformSpec round-trip", (t) => {
		const cwd = makeTmpDir("append-transform");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		const decl = declTransform("thing", "1.0.0", "2.0.0", [
			{ op: "rename", from: "$.name", to: "$.label" },
			{ op: "set", path: "$.added", value: 42 },
		]);
		appendMigrationDecl(cwd, decl);
		const round = loadMigrationsFile(cwd);
		assert.deepEqual(round?.migrations[0], decl);
	});
});

describe("migrations-store: replaceMigrationDecl", () => {
	it("overwrites an existing decl matched by (schemaName, fromVersion)", (t) => {
		const cwd = makeTmpDir("replace-ok");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		appendMigrationDecl(cwd, declIdentity("thing", "1.0.0", "2.0.0"));
		const next = declTransform("thing", "1.0.0", "2.0.0", [{ op: "delete", path: "$.unused" }]);
		replaceMigrationDecl(cwd, next);
		const round = loadMigrationsFile(cwd);
		assert.deepEqual(round?.migrations, [next]);
	});

	it("throws when migrations.json is absent (use append to introduce)", (t) => {
		const cwd = makeTmpDir("replace-absent");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		assert.throws(() => replaceMigrationDecl(cwd, declIdentity("thing", "1.0.0", "2.0.0")), /migrations\.json absent/);
	});

	it("throws when target (schemaName, fromVersion) missing inside an existing file", (t) => {
		const cwd = makeTmpDir("replace-missing");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		appendMigrationDecl(cwd, declIdentity("thing", "1.0.0", "2.0.0"));
		assert.throws(() => replaceMigrationDecl(cwd, declIdentity("thing", "2.0.0", "3.0.0")), /target missing/);
	});
});

describe("migrations-store: removeMigrationDecl", () => {
	it("removes an existing decl, preserving the rest", (t) => {
		const cwd = makeTmpDir("remove-ok");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		const a = declIdentity("thing", "1.0.0", "2.0.0");
		const b = declIdentity("thing", "2.0.0", "3.0.0");
		appendMigrationDecl(cwd, a);
		appendMigrationDecl(cwd, b);
		removeMigrationDecl(cwd, "thing", "1.0.0");
		const round = loadMigrationsFile(cwd);
		assert.deepEqual(round?.migrations, [b]);
	});

	it("throws when migrations.json is absent", (t) => {
		const cwd = makeTmpDir("remove-absent");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		assert.throws(() => removeMigrationDecl(cwd, "thing", "1.0.0"), /migrations\.json absent/);
	});

	it("throws on missing target pair", (t) => {
		const cwd = makeTmpDir("remove-missing");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		appendMigrationDecl(cwd, declIdentity("thing", "1.0.0", "2.0.0"));
		assert.throws(() => removeMigrationDecl(cwd, "thing", "9.9.9"), /target missing/);
	});
});

describe("migrations-store: path-builder lands at substrate root", () => {
	it("writes to <substrateDir>/migrations.json (pointer-canonical)", (t) => {
		const cwd = makeTmpDir("path-check");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		appendMigrationDecl(cwd, declIdentity("thing", "1.0.0", "2.0.0"));
		const expected = path.join(cwd, ".project", "migrations.json");
		assert.ok(fs.existsSync(expected));
		assert.equal(migrationsPath(cwd), expected);
	});
});
