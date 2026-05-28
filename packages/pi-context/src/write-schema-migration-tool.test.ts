import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { migrationsPath, writeBootstrapPointer } from "./context-dir.js";
import { loadMigrationsFile } from "./migrations-store.js";
import { type WriteSchemaMigrationParams, writeSchemaMigrationExecute } from "./write-schema-migration-tool.js";

function baseParams(over: Partial<WriteSchemaMigrationParams>): WriteSchemaMigrationParams {
	return {
		operation: "create",
		schemaName: "thing",
		fromVersion: "1.0.0",
		toVersion: "2.0.0",
		kind: "identity",
		writer: { kind: "human", user: "davidryan@gmail.com" },
		...over,
	};
}

describe("writeSchemaMigrationExecute", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "write-schema-migration-tool-"));
		writeBootstrapPointer(tmpDir, ".project");
		fs.mkdirSync(path.join(tmpDir, ".project"), { recursive: true });
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("operation=create + kind=identity persists a MigrationDecl with the writer-stamped created_by", async () => {
		const result = await writeSchemaMigrationExecute(tmpDir, baseParams({}));
		const file = loadMigrationsFile(tmpDir);
		assert.ok(file);
		assert.equal(file!.migrations.length, 1);
		const decl = file!.migrations[0]!;
		assert.equal(decl.schemaName, "thing");
		assert.equal(decl.fromVersion, "1.0.0");
		assert.equal(decl.toVersion, "2.0.0");
		assert.equal(decl.kind, "identity");
		assert.equal(decl.created_by, "davidryan@gmail.com");
		assert.ok(decl.created_at.startsWith("20"), "created_at must be ISO-8601");
		assert.match(result.content[0]!.text, /created identity migration/);
		assert.match(result.content[0]!.text, /at .*migrations\.json/);
	});

	it("operation=create + kind=declarative-transform persists transform.operations round-trip", async () => {
		await writeSchemaMigrationExecute(
			tmpDir,
			baseParams({
				kind: "declarative-transform",
				transform: { operations: [{ op: "rename", from: "$.name", to: "$.label" }] },
			}),
		);
		const file = loadMigrationsFile(tmpDir);
		const decl = file!.migrations[0]!;
		assert.equal(decl.kind, "declarative-transform");
		assert.deepEqual(decl.transform, { operations: [{ op: "rename", from: "$.name", to: "$.label" }] });
	});

	it("operation=create + transform supplied as JSON string is parsed", async () => {
		await writeSchemaMigrationExecute(
			tmpDir,
			baseParams({
				kind: "declarative-transform",
				transform: JSON.stringify({ operations: [{ op: "delete", path: "$.gone" }] }),
			}),
		);
		const decl = loadMigrationsFile(tmpDir)!.migrations[0]!;
		assert.deepEqual(decl.transform, { operations: [{ op: "delete", path: "$.gone" }] });
	});

	it("operation=replace overwrites an existing declaration matched by (schemaName, fromVersion)", async () => {
		await writeSchemaMigrationExecute(tmpDir, baseParams({}));
		await writeSchemaMigrationExecute(
			tmpDir,
			baseParams({
				operation: "replace",
				kind: "declarative-transform",
				transform: { operations: [{ op: "set", path: "$.x", value: 1 }] },
			}),
		);
		const file = loadMigrationsFile(tmpDir);
		assert.equal(file!.migrations.length, 1);
		assert.equal(file!.migrations[0]!.kind, "declarative-transform");
	});

	it("operation=remove deletes an existing declaration; subsequent load shows it gone", async () => {
		await writeSchemaMigrationExecute(tmpDir, baseParams({}));
		await writeSchemaMigrationExecute(tmpDir, baseParams({ operation: "remove" }));
		const file = loadMigrationsFile(tmpDir);
		assert.equal(file!.migrations.length, 0);
	});

	it("rejects writer.kind=agent with descriptive message", async () => {
		await assert.rejects(
			writeSchemaMigrationExecute(tmpDir, baseParams({ writer: { kind: "agent", user: "spec-impl-1" } })),
			/writer\.kind must be 'human'/,
		);
		assert.ok(!fs.existsSync(migrationsPath(tmpDir)));
	});

	it("rejects writer.kind=monitor / workflow with descriptive message", async () => {
		await assert.rejects(
			writeSchemaMigrationExecute(tmpDir, baseParams({ writer: { kind: "monitor", user: "x" } })),
			/writer\.kind must be 'human'/,
		);
		await assert.rejects(
			writeSchemaMigrationExecute(tmpDir, baseParams({ writer: { kind: "workflow", user: "x" } })),
			/writer\.kind must be 'human'/,
		);
	});

	it("rejects writer.kind=human but missing user", async () => {
		await assert.rejects(
			writeSchemaMigrationExecute(tmpDir, baseParams({ writer: { kind: "human", user: "" } })),
			/writer\.user is required/,
		);
	});

	it("rejects unknown operation", async () => {
		await assert.rejects(writeSchemaMigrationExecute(tmpDir, baseParams({ operation: "rename" })), /unknown operation/);
	});

	it("rejects kind=declarative-transform with no transform body", async () => {
		await assert.rejects(
			writeSchemaMigrationExecute(tmpDir, baseParams({ kind: "declarative-transform" })),
			/requires a transform body/,
		);
	});

	it("rejects kind=identity with a transform body", async () => {
		await assert.rejects(
			writeSchemaMigrationExecute(tmpDir, baseParams({ kind: "identity", transform: { operations: [] } })),
			/must NOT carry a transform body/,
		);
	});

	it("rejects fromVersion === toVersion on create", async () => {
		await assert.rejects(
			writeSchemaMigrationExecute(tmpDir, baseParams({ fromVersion: "1.0.0", toVersion: "1.0.0" })),
			/must differ from toVersion/,
		);
	});

	it("rejects unknown kind on create", async () => {
		await assert.rejects(
			writeSchemaMigrationExecute(tmpDir, baseParams({ kind: "magic" })),
			/kind must be 'identity' or 'declarative-transform'/,
		);
	});

	it("create-collision: second create with same (schemaName, fromVersion) rejects via migrations-store guard", async () => {
		await writeSchemaMigrationExecute(tmpDir, baseParams({}));
		await assert.rejects(writeSchemaMigrationExecute(tmpDir, baseParams({ toVersion: "2.5.0" })), /collision/);
	});

	it("replace-missing: replace with no prior declaration rejects via migrations-store guard", async () => {
		await assert.rejects(
			writeSchemaMigrationExecute(tmpDir, baseParams({ operation: "replace" })),
			/migrations\.json absent|target missing/,
		);
	});

	it("remove-missing: remove on absent file rejects via migrations-store guard", async () => {
		await assert.rejects(
			writeSchemaMigrationExecute(tmpDir, baseParams({ operation: "remove" })),
			/migrations\.json absent/,
		);
	});
});
