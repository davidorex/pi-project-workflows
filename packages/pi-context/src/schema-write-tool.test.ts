import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { writeBootstrapPointer } from "./context-dir.js";
import { createRegistry } from "./schema-migrations.js";
import { ValidationError, validateBlockWithMigration } from "./schema-validator.js";
import { writeSchema, writeSchemaChecked } from "./schema-write.js";

/**
 * Fresh tmp substrate: a `.pi-context.json` bootstrap pointer at `.project`
 * plus the `.project/` directory itself. `writeSchemaChecked` mkdir's the
 * nested `schemas/` dir via writeSchema, so we only need the root present.
 */
function makeTmpDir(prefix: string): string {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), `schema-write-tool-${prefix}-`));
	writeBootstrapPointer(cwd, ".project");
	fs.mkdirSync(path.join(cwd, ".project"), { recursive: true });
	return cwd;
}

function onDisk(cwd: string, name: string): string {
	return path.join(cwd, ".project", "schemas", `${name}.schema.json`);
}

const validSchema = {
	type: "object",
	required: ["id"],
	properties: {
		id: { type: "string" },
		title: { type: "string" },
	},
};

describe("writeSchemaChecked", () => {
	it("create writes a meta-valid schema → {written:true, operation:'create'}; file deep-equals body", (t) => {
		const cwd = makeTmpDir("create-ok");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		const result = writeSchemaChecked(cwd, "demo", validSchema, "create");

		assert.equal(result.written, true);
		assert.equal(result.operation, "create");
		assert.ok(fs.existsSync(onDisk(cwd, "demo")));
		const parsed = JSON.parse(fs.readFileSync(onDisk(cwd, "demo"), "utf-8"));
		assert.deepEqual(parsed, validSchema);
	});

	it("create-collision: an existing schema makes create throw; file byte-unchanged", (t) => {
		const cwd = makeTmpDir("create-collision");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		writeSchema(cwd, "demo", validSchema);
		const before = fs.readFileSync(onDisk(cwd, "demo"), "utf-8");

		assert.throws(() => writeSchemaChecked(cwd, "demo", { type: "object" }, "create"), /create collision/);

		const after = fs.readFileSync(onDisk(cwd, "demo"), "utf-8");
		assert.equal(after, before);
	});

	it("replace overwrites an existing schema → {written:true, operation:'replace'}; on-disk = v2", (t) => {
		const cwd = makeTmpDir("replace-ok");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		const v1 = { type: "object", properties: { v: { type: "number" } } };
		const v2 = { type: "object", properties: { v: { type: "string" } } };
		writeSchema(cwd, "demo", v1);

		const result = writeSchemaChecked(cwd, "demo", v2, "replace");

		assert.equal(result.written, true);
		assert.equal(result.operation, "replace");
		const parsed = JSON.parse(fs.readFileSync(onDisk(cwd, "demo"), "utf-8"));
		assert.deepEqual(parsed, v2);
	});

	it("replace-missing: a missing target makes replace throw; file not created", (t) => {
		const cwd = makeTmpDir("replace-missing");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		assert.throws(() => writeSchemaChecked(cwd, "demo", validSchema, "replace"), /replace target missing/);

		assert.ok(!fs.existsSync(onDisk(cwd, "demo")));
	});

	it("meta-validation reject: a malformed body throws ValidationError and nothing is written / overwritten", (t) => {
		const cwd = makeTmpDir("meta-reject");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		// create-meta-reject: malformed body, file never created.
		assert.throws(
			() => writeSchemaChecked(cwd, "demo", { type: "not-a-real-type" } as any, "create"),
			(err: unknown) => err instanceof ValidationError,
		);
		assert.ok(!fs.existsSync(onDisk(cwd, "demo")));

		// replace-meta-reject: seed a valid schema, then a malformed replace leaves it byte-unchanged.
		writeSchema(cwd, "seeded", validSchema);
		const before = fs.readFileSync(onDisk(cwd, "seeded"), "utf-8");
		assert.throws(
			() => writeSchemaChecked(cwd, "seeded", { type: "still-not-real" } as any, "replace"),
			(err: unknown) => err instanceof ValidationError,
		);
		const after = fs.readFileSync(onDisk(cwd, "seeded"), "utf-8");
		assert.equal(after, before);
	});

	it("dry-run is inert: previews without writing, but still meta-validates", (t) => {
		const cwd = makeTmpDir("dry-run");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		// create dryRun → {written:false}; nothing on disk.
		const created = writeSchemaChecked(cwd, "demo", validSchema, "create", undefined, { dryRun: true });
		assert.equal(created.written, false);
		assert.equal(created.operation, "create");
		assert.ok(!fs.existsSync(onDisk(cwd, "demo")));

		// replace dryRun on a seeded schema → bytes + mtime unchanged.
		writeSchema(cwd, "seeded", validSchema);
		const before = fs.readFileSync(onDisk(cwd, "seeded"), "utf-8");
		const beforeMtime = fs.statSync(onDisk(cwd, "seeded")).mtimeMs;
		const replaced = writeSchemaChecked(
			cwd,
			"seeded",
			{ type: "object", properties: { x: { type: "string" } } },
			"replace",
			undefined,
			{ dryRun: true },
		);
		assert.equal(replaced.written, false);
		assert.equal(fs.readFileSync(onDisk(cwd, "seeded"), "utf-8"), before);
		assert.equal(fs.statSync(onDisk(cwd, "seeded")).mtimeMs, beforeMtime);

		// dry-run create with a malformed body → still meta-validates → throws; nothing written.
		assert.throws(
			() => writeSchemaChecked(cwd, "bad", { type: "nope" } as any, "create", undefined, { dryRun: true }),
			(err: unknown) => err instanceof ValidationError,
		);
		assert.ok(!fs.existsSync(onDisk(cwd, "bad")));
	});

	it("ctx is a no-op: on-disk bytes are identical with and without a DispatchContext", (t) => {
		const cwdWith = makeTmpDir("ctx-with");
		const cwdWithout = makeTmpDir("ctx-without");
		t.after(() => {
			fs.rmSync(cwdWith, { recursive: true, force: true });
			fs.rmSync(cwdWithout, { recursive: true, force: true });
		});

		writeSchemaChecked(cwdWith, "demo", validSchema, "create", { writer: { kind: "agent", agent_id: "x" } });
		writeSchemaChecked(cwdWithout, "demo", validSchema, "create", undefined);

		const withBytes = fs.readFileSync(onDisk(cwdWith, "demo"), "utf-8");
		const withoutBytes = fs.readFileSync(onDisk(cwdWithout, "demo"), "utf-8");
		assert.equal(withBytes, withoutBytes);
	});

	// Nested id-bearing array guard (content-addressed substrate identity, Cycle 9.2).
	// writeSchemaChecked routes create/replace through writeSchema (guarded), and the
	// dry-run branch carries its own guard call — so all three paths must reject a
	// nested id-bearing schema, while the top-level-id validSchema still passes.
	it("nested-id guard: create / replace / dry-run all throw on a nested id-bearing schema; validSchema passes", (t) => {
		const cwd = makeTmpDir("nested-id-guard");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		const nestedIdSchema = {
			type: "object",
			properties: {
				plans: {
					type: "array",
					items: {
						type: "object",
						properties: {
							id: { type: "string" },
							layers: {
								type: "array",
								items: { type: "object", properties: { id: { type: "string" }, name: { type: "string" } } },
							},
						},
					},
				},
			},
		};

		// create → throws, nothing written.
		assert.throws(
			() => writeSchemaChecked(cwd, "carrier", nestedIdSchema, "create"),
			/nested id-bearing arrays are forbidden/,
		);
		assert.ok(!fs.existsSync(onDisk(cwd, "carrier")));

		// create dry-run → throws, nothing written.
		assert.throws(
			() => writeSchemaChecked(cwd, "carrier", nestedIdSchema, "create", undefined, { dryRun: true }),
			/nested id-bearing arrays are forbidden/,
		);
		assert.ok(!fs.existsSync(onDisk(cwd, "carrier")));

		// replace: seed a valid schema, then a nested-id replace throws + leaves it byte-unchanged.
		writeSchema(cwd, "seeded", validSchema);
		const before = fs.readFileSync(onDisk(cwd, "seeded"), "utf-8");
		assert.throws(
			() => writeSchemaChecked(cwd, "seeded", nestedIdSchema, "replace"),
			/nested id-bearing arrays are forbidden/,
		);
		assert.equal(fs.readFileSync(onDisk(cwd, "seeded"), "utf-8"), before);

		// replace dry-run → throws, seeded byte-unchanged.
		assert.throws(
			() => writeSchemaChecked(cwd, "seeded", nestedIdSchema, "replace", undefined, { dryRun: true }),
			/nested id-bearing arrays are forbidden/,
		);
		assert.equal(fs.readFileSync(onDisk(cwd, "seeded"), "utf-8"), before);

		// The top-level-id validSchema still passes on create AND replace AND dry-run.
		assert.doesNotThrow(() => writeSchemaChecked(cwd, "vs", validSchema, "create"));
		assert.doesNotThrow(() => writeSchemaChecked(cwd, "vs", validSchema, "replace"));
		assert.doesNotThrow(() => writeSchemaChecked(cwd, "vs2", validSchema, "create", undefined, { dryRun: true }));
	});

	it("migration boundary: validateBlockWithMigration requires a registry on version-mismatch and succeeds when one is supplied", (t) => {
		const cwd = makeTmpDir("migration-boundary");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		// v1: requires schema_version + name.
		writeSchemaChecked(
			cwd,
			"thing",
			{
				version: "1.0.0",
				type: "object",
				required: ["schema_version", "name"],
				properties: { schema_version: { type: "string" }, name: { type: "string" } },
			},
			"create",
		);

		// v2: version bumped, name → label. Tool scope is the schema write itself.
		const replaced = writeSchemaChecked(
			cwd,
			"thing",
			{
				version: "2.0.0",
				type: "object",
				required: ["schema_version", "label"],
				properties: { schema_version: { type: "string" }, label: { type: "string" } },
			},
			"replace",
		);
		assert.equal(replaced.written, true);

		// A v1 block item against the now-v2 schema fails read-time validation when no
		// MigrationRegistry is supplied — the validator's contract on version-mismatch.
		assert.throws(
			() => validateBlockWithMigration(cwd, "thing", { schema_version: "1.0.0", name: "x" }),
			/MigrationRegistry|migration/i,
		);

		// Positive bookend: supply a registry carrying a MigrationFn for the (schema, from, to)
		// triple and read-time validation passes, returning the migrated shape. This unit
		// exercises the validator boundary directly via in-test registry construction; the
		// substrate-side mechanism that lets operators author and persist such migration
		// declarations (so they populate the registry at load time) is a companion schema-write
		// surface alongside the schema-write tool itself.
		const reg = createRegistry();
		reg.register({
			schemaName: "thing",
			fromVersion: "1.0.0",
			toVersion: "2.0.0",
			migrate: (o: any) => ({ schema_version: "2.0.0", label: o.name }),
		});
		const migrated = validateBlockWithMigration(cwd, "thing", { schema_version: "1.0.0", name: "x" }, reg) as {
			schema_version: string;
			label: string;
		};
		assert.equal(migrated.schema_version, "2.0.0");
		assert.equal(migrated.label, "x");
	});
});
