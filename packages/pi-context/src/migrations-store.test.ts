import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { migrationsPath, migrationsPathForDir, writeBootstrapPointer } from "./context-dir.js";
import {
	appendMigrationDecl,
	appendMigrationDeclForDir,
	loadMigrationsFile,
	loadMigrationsFileForDir,
	MIGRATIONS_FILE_VERSION,
	type MigrationDecl,
	removeMigrationDecl,
	replaceMigrationDecl,
	seedCatalogConfigMigrationDecls,
	writeMigrationsFile,
	writeMigrationsFileForDir,
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

describe("migrations-store: dir-targeted forms (Phase H)", () => {
	it("writeMigrationsFileForDir targets an arbitrary dir; loadMigrationsFileForDir round-trips it", (t) => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "migrations-fordir-write-"));
		t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
		const original = {
			schema_version: MIGRATIONS_FILE_VERSION,
			migrations: [declIdentity("thing", "1.0.0", "2.0.0")],
		};
		writeMigrationsFileForDir(dir, original);
		assert.ok(fs.existsSync(migrationsPathForDir(dir)));
		assert.deepEqual(loadMigrationsFileForDir(dir), original);
	});

	it("appendMigrationDeclForDir creates + appends against a target dir", (t) => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "migrations-fordir-append-"));
		t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
		const a = declIdentity("thing", "1.0.0", "2.0.0");
		const b = declIdentity("thing", "2.0.0", "3.0.0");
		appendMigrationDeclForDir(dir, a);
		appendMigrationDeclForDir(dir, b);
		assert.deepEqual(loadMigrationsFileForDir(dir)?.migrations, [a, b]);
	});

	it("appendMigrationDeclForDir throws on (schemaName, fromVersion) collision, file untouched", (t) => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "migrations-fordir-collision-"));
		t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
		appendMigrationDeclForDir(dir, declIdentity("thing", "1.0.0", "2.0.0"));
		const before = fs.readFileSync(migrationsPathForDir(dir), "utf-8");
		assert.throws(() => appendMigrationDeclForDir(dir, declIdentity("thing", "1.0.0", "2.5.0")), /collision/);
		assert.equal(fs.readFileSync(migrationsPathForDir(dir), "utf-8"), before);
	});

	it("cwd forms are byte-identical to ForDir on the active substrate dir", (t) => {
		// Two parallel substrates: one written via the cwd wrapper, one via ForDir
		// against the same relative dir name. The on-disk bytes must match.
		const viaCwd = makeTmpDir("byte-cwd");
		const viaDir = makeTmpDir("byte-dir");
		t.after(() => {
			fs.rmSync(viaCwd, { recursive: true, force: true });
			fs.rmSync(viaDir, { recursive: true, force: true });
		});
		const decl = declIdentity("thing", "1.0.0", "2.0.0");
		appendMigrationDecl(viaCwd, decl);
		appendMigrationDeclForDir(path.join(viaDir, ".project"), decl);
		const cwdBytes = fs.readFileSync(path.join(viaCwd, ".project", "migrations.json"), "utf-8");
		const dirBytes = fs.readFileSync(path.join(viaDir, ".project", "migrations.json"), "utf-8");
		assert.equal(cwdBytes, dirBytes);
	});
});

describe("migrations-store: map_each TransformOp schema variant", () => {
	it("a map_each declarative-transform decl round-trips append→load (table mode with fallback)", (t) => {
		const cwd = makeTmpDir("map-each-roundtrip");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		const decl = declTransform("thing", "1.0.0", "2.0.0", [
			{
				op: "map_each",
				path: "$.relations",
				table: { blocks: { relation_type: "task_gated_by_item", item_endpoint: "parent" } },
				fallback: "child",
			},
		]);
		appendMigrationDecl(cwd, decl);
		const round = loadMigrationsFile(cwd);
		assert.deepEqual(round?.migrations[0], decl);
	});

	it("a map_each decl carrying BOTH table and field is rejected by AJV validation (table XOR field+value)", (t) => {
		const cwd = makeTmpDir("map-each-both");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		const decl = declTransform("thing", "1.0.0", "2.0.0", [
			{
				op: "map_each",
				path: "$.relations",
				table: { blocks: { relation_type: "task_gated_by_item", item_endpoint: "parent" } },
				field: "kind",
				value: "tasks",
			},
		]);
		assert.throws(
			() => appendMigrationDecl(cwd, decl),
			(err: unknown) => err instanceof ValidationError,
		);
		assert.ok(!fs.existsSync(migrationsPath(cwd)));
	});
});

describe("migrations-store: seedCatalogConfigMigrationDecls (ceremony seeding)", () => {
	it("fresh substrate: seeds exactly the catalog's config decl(s)", (t) => {
		const cwd = makeTmpDir("seed-fresh");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		const substrateDir = path.join(cwd, ".project");
		const appended = seedCatalogConfigMigrationDecls(substrateDir);
		assert.equal(appended.length, 1);
		assert.equal(appended[0]?.schema, "config");
		assert.equal(appended[0]?.from, "1.0.0");
		const round = loadMigrationsFileForDir(substrateDir);
		assert.equal(round?.migrations.length, 1);
		assert.equal(round?.migrations[0]?.schemaName, "config");
		assert.equal(round?.migrations[0]?.fromVersion, "1.0.0");
	});

	it("second call appends nothing (idempotent), file byte-identical", (t) => {
		const cwd = makeTmpDir("seed-idempotent");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		const substrateDir = path.join(cwd, ".project");
		seedCatalogConfigMigrationDecls(substrateDir);
		const before = fs.readFileSync(migrationsPathForDir(substrateDir), "utf-8");
		const second = seedCatalogConfigMigrationDecls(substrateDir);
		assert.deepEqual(second, []);
		assert.equal(fs.readFileSync(migrationsPathForDir(substrateDir), "utf-8"), before);
	});

	it("a pre-existing (config, 1.0.0) decl is preserved byte-identical and nothing appended", (t) => {
		const cwd = makeTmpDir("seed-preexisting");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		const substrateDir = path.join(cwd, ".project");
		// A user-authored config decl at the same (schemaName, fromVersion) — a
		// DIFFERENT toVersion proves the seed never replaces an existing entry.
		appendMigrationDeclForDir(substrateDir, declIdentity("config", "1.0.0", "9.9.9"));
		const before = fs.readFileSync(migrationsPathForDir(substrateDir), "utf-8");
		const appended = seedCatalogConfigMigrationDecls(substrateDir);
		assert.deepEqual(appended, []);
		assert.equal(fs.readFileSync(migrationsPathForDir(substrateDir), "utf-8"), before);
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
