import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { writeBootstrapPointer } from "./project-dir.js";
import { createRegistry } from "./schema-migrations.js";
import { ValidationError, validate, validateBlockWithMigration, validateFromFile } from "./schema-validator.js";

describe("validate", () => {
	it("passes valid data through", () => {
		const schema = {
			type: "object",
			required: ["name"],
			properties: { name: { type: "string" } },
		};
		const data = { name: "test" };
		const result = validate(schema, data, "test");
		assert.deepStrictEqual(result, data);
	});

	it("throws ValidationError on invalid data", () => {
		const schema = {
			type: "object",
			required: ["name"],
			properties: { name: { type: "string" } },
		};
		assert.throws(
			() => validate(schema, { name: 123 }, "test input"),
			(err: unknown) => {
				assert.ok(err instanceof ValidationError);
				assert.ok(err.message.includes("test input"));
				assert.ok(err.message.includes("/name"));
				return true;
			},
		);
	});

	it("throws ValidationError for missing required fields", () => {
		const schema = {
			type: "object",
			required: ["name", "age"],
			properties: {
				name: { type: "string" },
				age: { type: "integer" },
			},
		};
		assert.throws(
			() => validate(schema, {}, "person"),
			(err: unknown) => {
				assert.ok(err instanceof ValidationError);
				assert.ok(err.errors.length >= 2); // allErrors: true
				return true;
			},
		);
	});

	it("accepts data with no schema constraints (empty schema)", () => {
		const result = validate({}, { anything: "goes" }, "open");
		assert.deepStrictEqual(result, { anything: "goes" });
	});
});

describe("validateFromFile", () => {
	it("validates against a schema file", () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-test-"));
		const schemaPath = path.join(tmpDir, "test.schema.json");
		fs.writeFileSync(
			schemaPath,
			JSON.stringify({
				type: "object",
				required: ["id"],
				properties: { id: { type: "string" } },
			}),
		);

		const result = validateFromFile(schemaPath, { id: "abc" }, "test");
		assert.deepStrictEqual(result, { id: "abc" });

		fs.rmSync(tmpDir, { recursive: true });
	});

	it("throws on missing schema file", () => {
		assert.throws(
			() => validateFromFile("/nonexistent/schema.json", {}, "test"),
			(err: unknown) => err instanceof Error && err.message.includes("Schema file not found"),
		);
	});

	it("throws on invalid JSON in schema file", () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-test-"));
		const schemaPath = path.join(tmpDir, "bad.schema.json");
		fs.writeFileSync(schemaPath, "not json{{{");

		assert.throws(
			() => validateFromFile(schemaPath, {}, "test"),
			(err: unknown) => err instanceof Error && err.message.includes("Invalid JSON"),
		);

		fs.rmSync(tmpDir, { recursive: true });
	});
});

describe("framework schema $ref resolution", () => {
	it("resolves a $ref to pi-context://schemas/priority synchronously", () => {
		// A user-defined schema can reference one of the pre-registered
		// framework enum schemas by URN; AJV resolves it without an async hook.
		const composing = {
			type: "object",
			required: ["p"],
			properties: { p: { $ref: "pi-context://schemas/priority" } },
		};
		const ok = validate(composing, { p: "p-high" }, "priority-host");
		assert.deepStrictEqual(ok, { p: "p-high" });
	});

	it("rejects a value outside the priority enum via $ref", () => {
		const composing = {
			type: "object",
			required: ["p"],
			properties: { p: { $ref: "pi-context://schemas/priority" } },
		};
		assert.throws(
			() => validate(composing, { p: "urgent" }, "priority-host"),
			(err: unknown) => err instanceof ValidationError,
		);
	});

	it("resolves $ref to status enum (validates allowed value, rejects unknown)", () => {
		const composing = {
			type: "object",
			required: ["s"],
			properties: { s: { $ref: "pi-context://schemas/status" } },
		};
		assert.deepStrictEqual(validate(composing, { s: "in_progress" }, "status-host"), { s: "in_progress" });
		assert.throws(
			() => validate(composing, { s: "wip" }, "status-host"),
			(err: unknown) => err instanceof ValidationError,
		);
	});
});

describe("registry schema $ref resolution (FGAP-017 closure)", () => {
	// Registry schemas at packages/pi-context/registry/schemas/ now $ref the
	// shared enum schemas pre-registered on the AJV instance. These tests load
	// the on-disk registry schemas and validate items that exercise the $ref
	// path — failure indicates the URN is unreachable to the AJV instance or
	// strict-mode rejected the cross-schema reference.
	const __dirnameTest = path.dirname(fileURLToPath(import.meta.url));
	// __dirnameTest = packages/pi-context/src; registry schemas live at
	// packages/pi-context/registry/schemas/
	const REGISTRY_SCHEMAS = path.resolve(__dirnameTest, "..", "registry", "schemas");

	it("issues.schema.json: source field validates 'monitor' via $ref to pi-context://schemas/source", () => {
		const schemaPath = path.join(REGISTRY_SCHEMAS, "issues.schema.json");
		const data = {
			issues: [
				{
					id: "issue-001",
					title: "test",
					body: "body",
					location: "src/foo.ts:1",
					status: "open",
					category: "issue",
					priority: "high",
					package: "pi-context",
					source: "monitor",
				},
			],
		};
		const out = validateFromFile(schemaPath, data, "issues-source-ref");
		assert.deepStrictEqual(out, data);
	});

	it("audit.schema.json: finding severity validates 'error' via $ref to pi-context://schemas/severity", () => {
		const schemaPath = path.join(REGISTRY_SCHEMAS, "audit.schema.json");
		const data = {
			subject: { project: "pi-context", files: ["src/foo.ts"] },
			auditor: { name: "test-auditor" },
			timestamp: "2026-05-09T00:00:00Z",
			findings: [
				{
					id: "F-001",
					severity: "error",
					principle: "type-safety",
					description: "missing return type",
					locations: [{ file: "src/foo.ts", snippet: "function f() { return 1; }" }],
					fix: { suggestion: "annotate return", verify_method: "inspect" },
				},
			],
			summary: { errors: 1, warnings: 0, infos: 0 },
		};
		const out = validateFromFile(schemaPath, data, "audit-severity-ref");
		assert.deepStrictEqual(out, data);
	});

	it("conformance-reference.schema.json: rule severity validates 'warning' via $ref to pi-context://schemas/severity", () => {
		const schemaPath = path.join(REGISTRY_SCHEMAS, "conformance-reference.schema.json");
		const data = {
			name: "pi-extension-conventions",
			scope: { type: "pi-extension" },
			principles: [
				{
					id: "P1",
					name: "Type Safety",
					rules: [
						{
							id: "P1.1",
							rule: "All exported functions declare return types",
							severity: "warning",
						},
					],
				},
			],
		};
		const out = validateFromFile(schemaPath, data, "conformance-severity-ref");
		assert.deepStrictEqual(out, data);
	});
});

describe("validateBlockWithMigration", () => {
	function setupTmpProject(schemaContent: object): { tmpDir: string; schemaName: string } {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-mig-"));
		writeBootstrapPointer(tmpDir, ".project");
		const schemasDir = path.join(tmpDir, ".project", "schemas");
		fs.mkdirSync(schemasDir, { recursive: true });
		const schemaName = "thing";
		fs.writeFileSync(path.join(schemasDir, `${schemaName}.schema.json`), JSON.stringify(schemaContent));
		return { tmpDir, schemaName };
	}

	it("passes through when schema and block versions match (no registry needed)", () => {
		const { tmpDir, schemaName } = setupTmpProject({
			$id: "test://thing",
			version: "1.0.0",
			type: "object",
			required: ["schema_version", "name"],
			properties: { schema_version: { type: "string" }, name: { type: "string" } },
		});
		const data = { schema_version: "1.0.0", name: "x" };
		const out = validateBlockWithMigration(tmpDir, schemaName, data);
		assert.deepStrictEqual(out, data);
		fs.rmSync(tmpDir, { recursive: true });
	});

	it("runs registered migration when schema version is ahead of block version", () => {
		const { tmpDir, schemaName } = setupTmpProject({
			version: "2.0.0",
			type: "object",
			required: ["schema_version", "label"],
			properties: { schema_version: { type: "string" }, label: { type: "string" } },
		});
		const reg = createRegistry();
		// 1.0.0 had `name`; 2.0.0 renamed it to `label` and bumped schema_version.
		reg.register({
			schemaName,
			fromVersion: "1.0.0",
			toVersion: "2.0.0",
			migrate: (d) => {
				const o = d as { schema_version: string; name: string };
				return { schema_version: "2.0.0", label: o.name };
			},
		});
		const out = validateBlockWithMigration(tmpDir, schemaName, { schema_version: "1.0.0", name: "renamed-from" }, reg);
		assert.deepStrictEqual(out, { schema_version: "2.0.0", label: "renamed-from" });
		fs.rmSync(tmpDir, { recursive: true });
	});

	it("throws when versions differ and no registry is supplied", () => {
		const { tmpDir, schemaName } = setupTmpProject({
			version: "2.0.0",
			type: "object",
			required: ["schema_version"],
			properties: { schema_version: { type: "string" } },
		});
		assert.throws(
			() => validateBlockWithMigration(tmpDir, schemaName, { schema_version: "1.0.0" }),
			/no MigrationRegistry was supplied/,
		);
		fs.rmSync(tmpDir, { recursive: true });
	});

	it("throws when schema file is missing on disk", () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-mig-"));
		writeBootstrapPointer(tmpDir, ".project");
		assert.throws(() => validateBlockWithMigration(tmpDir, "missing", {}), /schema file not found/);
		fs.rmSync(tmpDir, { recursive: true });
	});

	it("validates as-is when block omits schema_version (pre-versioned data)", () => {
		const { tmpDir, schemaName } = setupTmpProject({
			version: "1.0.0",
			type: "object",
			required: ["name"],
			properties: { name: { type: "string" } },
		});
		const data = { name: "no-version" };
		const out = validateBlockWithMigration(tmpDir, schemaName, data);
		assert.deepStrictEqual(out, data);
		fs.rmSync(tmpDir, { recursive: true });
	});
});
