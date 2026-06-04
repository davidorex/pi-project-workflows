import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { writeBootstrapPointer } from "./context-dir.js";
import type { DispatchContext } from "./dispatch-context.js";
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

/**
 * The attestation DispatchContext threaded as the 3rd arg post-TASK-006. In
 * production registerAll (in-pi) / the CLI build this from the auth-gate-stamped
 * writer; here we derive a human ctx from the params writer so the recorded
 * `created_by` continues to be the bare human user.
 */
const HUMAN_CTX: DispatchContext = { writer: { kind: "human", user: "davidryan@gmail.com" } };

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
		const result = await writeSchemaMigrationExecute(tmpDir, baseParams({}), HUMAN_CTX);
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
			HUMAN_CTX,
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
			HUMAN_CTX,
		);
		const decl = loadMigrationsFile(tmpDir)!.migrations[0]!;
		assert.deepEqual(decl.transform, { operations: [{ op: "delete", path: "$.gone" }] });
	});

	it("operation=replace overwrites an existing declaration matched by (schemaName, fromVersion)", async () => {
		await writeSchemaMigrationExecute(tmpDir, baseParams({}), HUMAN_CTX);
		await writeSchemaMigrationExecute(
			tmpDir,
			baseParams({
				operation: "replace",
				kind: "declarative-transform",
				transform: { operations: [{ op: "set", path: "$.x", value: 1 }] },
			}),
			HUMAN_CTX,
		);
		const file = loadMigrationsFile(tmpDir);
		assert.equal(file!.migrations.length, 1);
		assert.equal(file!.migrations[0]!.kind, "declarative-transform");
	});

	it("operation=remove deletes an existing declaration; subsequent load shows it gone", async () => {
		await writeSchemaMigrationExecute(tmpDir, baseParams({}), HUMAN_CTX);
		await writeSchemaMigrationExecute(tmpDir, baseParams({ operation: "remove" }), HUMAN_CTX);
		const file = loadMigrationsFile(tmpDir);
		assert.equal(file!.migrations.length, 0);
	});

	it("body trusts writer field as-is (auth-gate at pi-dispatch is the canonical identity check); writer.kind=agent passes through to the persistence path without throwing", async () => {
		// Canonical model post-FGAP-134: tool body does NOT re-check
		// writer.kind. The auth-gate handler registered by pi-agent-
		// dispatch is the structural identity check; once the operator
		// has authorized, the body trusts the (possibly auth-gate-
		// mutated) writer field. In production the auth-gate overwrites
		// writer to the verified-operator identity; here we bypass the
		// gate to confirm the body imposes no in-body kind check.
		const result = await writeSchemaMigrationExecute(
			tmpDir,
			baseParams({ writer: { kind: "agent", user: "agent-id-1" } }),
			{ writer: { kind: "agent", agent_id: "agent-id-1" } },
		);
		assert.match(result.content[0]!.text, /created identity migration/);
		const file = loadMigrationsFile(tmpDir);
		assert.equal(file!.migrations.length, 1);
	});

	it("rejects when no DispatchContext is threaded (the post-TASK-006 'writer required' guard)", async () => {
		await assert.rejects(writeSchemaMigrationExecute(tmpDir, baseParams({})), /a DispatchContext writer is required/);
	});

	it("rejects unknown operation", async () => {
		await assert.rejects(
			writeSchemaMigrationExecute(tmpDir, baseParams({ operation: "rename" }), HUMAN_CTX),
			/unknown operation/,
		);
	});

	it("rejects kind=declarative-transform with no transform body", async () => {
		await assert.rejects(
			writeSchemaMigrationExecute(tmpDir, baseParams({ kind: "declarative-transform" }), HUMAN_CTX),
			/requires a transform body/,
		);
	});

	it("rejects kind=identity with a transform body", async () => {
		await assert.rejects(
			writeSchemaMigrationExecute(tmpDir, baseParams({ kind: "identity", transform: { operations: [] } }), HUMAN_CTX),
			/must NOT carry a transform body/,
		);
	});

	it("rejects fromVersion === toVersion on create", async () => {
		await assert.rejects(
			writeSchemaMigrationExecute(tmpDir, baseParams({ fromVersion: "1.0.0", toVersion: "1.0.0" }), HUMAN_CTX),
			/must differ from toVersion/,
		);
	});

	it("rejects unknown kind on create", async () => {
		await assert.rejects(
			writeSchemaMigrationExecute(tmpDir, baseParams({ kind: "magic" }), HUMAN_CTX),
			/kind must be 'identity' or 'declarative-transform'/,
		);
	});

	it("create-collision: second create with same (schemaName, fromVersion) rejects via migrations-store guard", async () => {
		await writeSchemaMigrationExecute(tmpDir, baseParams({}), HUMAN_CTX);
		await assert.rejects(
			writeSchemaMigrationExecute(tmpDir, baseParams({ toVersion: "2.5.0" }), HUMAN_CTX),
			/collision/,
		);
	});

	it("replace-missing: replace with no prior declaration rejects via migrations-store guard", async () => {
		await assert.rejects(
			writeSchemaMigrationExecute(tmpDir, baseParams({ operation: "replace" }), HUMAN_CTX),
			/migrations\.json absent|target missing/,
		);
	});

	it("remove-missing: remove on absent file rejects via migrations-store guard", async () => {
		await assert.rejects(
			writeSchemaMigrationExecute(tmpDir, baseParams({ operation: "remove" }), HUMAN_CTX),
			/migrations\.json absent/,
		);
	});
});
