import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { writeConfig } from "./context.js";
import { schemaPath, writeBootstrapPointer } from "./context-dir.js";
import { ValidationError } from "./schema-validator.js";
import { findNestedIdBearingArrays, readSchema, updateSchema, writeSchema } from "./schema-write.js";

function makeTmpDir(prefix: string): string {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), `schema-write-${prefix}-`));
	writeBootstrapPointer(cwd, ".project");
	return cwd;
}

function setupProjectDir(tmpDir: string): string {
	const projectDir = path.join(tmpDir, ".project");
	fs.mkdirSync(projectDir, { recursive: true });
	return projectDir;
}

const validSchema = {
	type: "object",
	required: ["id"],
	properties: {
		id: { type: "string" },
		title: { type: "string" },
	},
};

describe("writeSchema", () => {
	it("writes a valid schema to <contextDir>/schemas/<name>.schema.json", (t) => {
		const tmpDir = makeTmpDir("write-valid");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupProjectDir(tmpDir);

		writeSchema(tmpDir, "demo", validSchema);

		const onDiskPath = path.join(tmpDir, ".project", "schemas", "demo.schema.json");
		assert.ok(fs.existsSync(onDiskPath));
		const parsed = JSON.parse(fs.readFileSync(onDiskPath, "utf-8"));
		assert.deepStrictEqual(parsed, validSchema);
	});

	it("creates schemas/ directory when missing", (t) => {
		const tmpDir = makeTmpDir("write-mkdir");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupProjectDir(tmpDir);
		// schemas/ directory intentionally absent

		writeSchema(tmpDir, "demo", validSchema);

		assert.ok(fs.existsSync(path.join(tmpDir, ".project", "schemas")));
		assert.ok(fs.existsSync(path.join(tmpDir, ".project", "schemas", "demo.schema.json")));
	});

	it("overwrites an existing schema", (t) => {
		const tmpDir = makeTmpDir("write-overwrite");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupProjectDir(tmpDir);

		writeSchema(tmpDir, "demo", { type: "object", properties: { v: { type: "number" } } });
		writeSchema(tmpDir, "demo", { type: "object", properties: { v: { type: "string" } } });

		const parsed = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "schemas", "demo.schema.json"), "utf-8"));
		assert.strictEqual((parsed.properties as Record<string, { type: string }>).v.type, "string");
	});

	it("rejects malformed schema (invalid `type` value) — file NOT created", (t) => {
		const tmpDir = makeTmpDir("write-bad-type");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupProjectDir(tmpDir);

		const malformed = { type: "not-a-real-jsonschema-type" };

		assert.throws(
			() => writeSchema(tmpDir, "demo", malformed),
			(err: unknown) => {
				assert.ok(err instanceof ValidationError);
				return true;
			},
		);

		assert.ok(!fs.existsSync(path.join(tmpDir, ".project", "schemas", "demo.schema.json")));
	});

	it("rejects malformed schema (`properties` is not an object) — file NOT created", (t) => {
		const tmpDir = makeTmpDir("write-bad-props");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupProjectDir(tmpDir);

		const malformed = { type: "object", properties: "this should be an object" };

		assert.throws(
			() => writeSchema(tmpDir, "demo", malformed),
			(err: unknown) => {
				assert.ok(err instanceof ValidationError);
				return true;
			},
		);

		assert.ok(!fs.existsSync(path.join(tmpDir, ".project", "schemas", "demo.schema.json")));
	});

	it("write-path === read-path under a non-default config.root (FGAP-079 / DEC-0045)", (t) => {
		const tmpDir = makeTmpDir("write-root-divergence");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupProjectDir(tmpDir);

		// Set config.root to a value DIFFERENT from the pointer dir (.project). Pre
		// DEC-0045 this would make writeSchema (a config.root-honoring path-builder) land under
		// alt-substrate/ while readSchema/schemaPath (pointer-based) look under
		// .project/ — a divergence. Post-unification both resolve to the pointer dir.
		writeConfig(tmpDir, { schema_version: "1.0.0", root: "alt-substrate", block_kinds: [] });

		writeSchema(tmpDir, "demo-kind", validSchema);

		// The schema landed where reads look (the read-side schemaPath), NOT under
		// config.root — proving write resolution == read resolution.
		const readSidePath = schemaPath(tmpDir, "demo-kind");
		assert.ok(fs.existsSync(readSidePath), "schema must land at the read-side schemaPath");
		assert.strictEqual(readSidePath, path.join(tmpDir, ".project", "schemas", "demo-kind.schema.json"));
		assert.deepStrictEqual(readSchema(tmpDir, "demo-kind"), validSchema);
		// config.root's alt-substrate/ dir must NOT have received the schema.
		assert.ok(!fs.existsSync(path.join(tmpDir, "alt-substrate", "schemas", "demo-kind.schema.json")));
	});

	it("no tmp file remains after successful write", (t) => {
		const tmpDir = makeTmpDir("write-notmp");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupProjectDir(tmpDir);

		writeSchema(tmpDir, "clean", validSchema);

		const schemasDir = path.join(tmpDir, ".project", "schemas");
		const files = fs.readdirSync(schemasDir);
		const tmpFiles = files.filter((f) => f.includes(".tmp"));
		assert.strictEqual(tmpFiles.length, 0);
	});

	it("atomic semantics — fs.renameSync failure leaves prior schema byte-identical", (t) => {
		const tmpDir = makeTmpDir("write-atomic");
		const origRenameSync = fs.renameSync;
		t.after(() => {
			fs.renameSync = origRenameSync;
			fs.rmSync(tmpDir, { recursive: true, force: true });
		});
		setupProjectDir(tmpDir);

		// Seed an existing schema so we can verify it's untouched on failure.
		writeSchema(tmpDir, "demo", validSchema);
		const onDiskPath = path.join(tmpDir, ".project", "schemas", "demo.schema.json");
		const originalBytes = fs.readFileSync(onDiskPath, "utf-8");

		fs.renameSync = ((..._args: unknown[]) => {
			throw new Error("simulated rename failure");
		}) as typeof fs.renameSync;

		assert.throws(
			() => writeSchema(tmpDir, "demo", { type: "object", properties: { x: { type: "number" } } }),
			(err: unknown) => {
				assert.ok(err instanceof Error);
				assert.ok(err.message.includes("failed to write"));
				return true;
			},
		);

		const afterBytes = fs.readFileSync(onDiskPath, "utf-8");
		assert.strictEqual(afterBytes, originalBytes);
	});
});

describe("readSchema", () => {
	it("returns null when the schema file is absent", (t) => {
		const tmpDir = makeTmpDir("read-absent");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupProjectDir(tmpDir);

		const result = readSchema(tmpDir, "nonexistent");
		assert.strictEqual(result, null);
	});

	it("returns parsed schema object when present", (t) => {
		const tmpDir = makeTmpDir("read-present");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupProjectDir(tmpDir);
		writeSchema(tmpDir, "demo", validSchema);

		const result = readSchema(tmpDir, "demo");
		assert.deepStrictEqual(result, validSchema);
	});

	it("throws on invalid JSON in the schema file", (t) => {
		const tmpDir = makeTmpDir("read-badjson");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		const projectDir = setupProjectDir(tmpDir);
		const schemasDir = path.join(projectDir, "schemas");
		fs.mkdirSync(schemasDir, { recursive: true });
		fs.writeFileSync(path.join(schemasDir, "broken.schema.json"), "not json{{");

		assert.throws(
			() => readSchema(tmpDir, "broken"),
			(err: unknown) => {
				assert.ok(err instanceof Error);
				assert.ok(err.message.includes("invalid JSON"));
				return true;
			},
		);
	});
});

describe("updateSchema", () => {
	it("applies mutator and persists the result", (t) => {
		const tmpDir = makeTmpDir("upd-happy");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupProjectDir(tmpDir);
		writeSchema(tmpDir, "demo", validSchema);

		updateSchema(tmpDir, "demo", (cur) => {
			const c = cur as Record<string, unknown>;
			const props = (c.properties as Record<string, unknown>) ?? {};
			return {
				...c,
				properties: { ...props, status: { type: "string", enum: ["open", "closed"] } },
			};
		});

		const after = readSchema(tmpDir, "demo") as { properties: Record<string, unknown> };
		assert.ok("status" in after.properties);
		assert.ok("id" in after.properties); // pre-existing field preserved
	});

	it("throws when the schema does not exist (caller must writeSchema first)", (t) => {
		const tmpDir = makeTmpDir("upd-absent");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupProjectDir(tmpDir);

		assert.throws(
			() => updateSchema(tmpDir, "demo", (c) => c),
			(err: unknown) => {
				assert.ok(err instanceof Error);
				assert.ok(err.message.includes("does not exist"));
				return true;
			},
		);
	});

	it("rejects mutator output that violates meta-schema — original unchanged", (t) => {
		const tmpDir = makeTmpDir("upd-bad");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupProjectDir(tmpDir);
		writeSchema(tmpDir, "demo", validSchema);

		const onDiskPath = path.join(tmpDir, ".project", "schemas", "demo.schema.json");
		const originalBytes = fs.readFileSync(onDiskPath, "utf-8");

		assert.throws(
			() => updateSchema(tmpDir, "demo", () => ({ type: "this-is-not-a-valid-jsonschema-type" })),
			(err: unknown) => {
				assert.ok(err instanceof ValidationError);
				return true;
			},
		);

		const afterBytes = fs.readFileSync(onDiskPath, "utf-8");
		assert.strictEqual(afterBytes, originalBytes);
	});

	it("preserves history through mutator — old fields keep their definitions", (t) => {
		const tmpDir = makeTmpDir("upd-preserve");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupProjectDir(tmpDir);
		writeSchema(tmpDir, "demo", validSchema);

		updateSchema(tmpDir, "demo", (cur) => {
			const c = cur as Record<string, unknown>;
			return { ...c, description: "added by mutator" };
		});

		const after = readSchema(tmpDir, "demo") as Record<string, unknown>;
		assert.strictEqual(after.description, "added by mutator");
		assert.deepStrictEqual(after.required, ["id"]);
		assert.deepStrictEqual(after.properties, validSchema.properties);
	});
});

// ── Nested id-bearing array guard (content-addressed substrate identity, Cycle 9.2) ──

// A top-level block whose items each embed an id-bearing array (`plans[].layers`,
// shaped like the real layer-plans carrier). The nested `layers` items carry an
// `id` → relationship-as-embedding → forbidden.
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
						items: {
							type: "object",
							properties: { id: { type: "string" }, name: { type: "string" } },
						},
					},
				},
			},
		},
	},
};

// Same outer shape, but the nested array's items carry NO `id` — a legitimate
// embedded value list, must pass.
const nestedNonIdSchema = {
	type: "object",
	properties: {
		plans: {
			type: "array",
			items: {
				type: "object",
				properties: {
					id: { type: "string" },
					tags: {
						type: "array",
						items: { type: "object", properties: { name: { type: "string" } } },
					},
				},
			},
		},
	},
};

// Depth-0 id array: a top-level `items[]` array whose items carry `id`. This is
// the normal block-item shape and must NOT be flagged.
const topLevelIdArraySchema = {
	type: "object",
	properties: {
		items: {
			type: "array",
			items: {
				type: "object",
				properties: { id: { type: "string" }, title: { type: "string" } },
			},
		},
	},
};

describe("findNestedIdBearingArrays", () => {
	it("flags a nested id-bearing array by its dotted path", () => {
		assert.deepStrictEqual(findNestedIdBearingArrays(nestedIdSchema), ["plans.layers"]);
	});

	it("does NOT flag a nested NON-id array", () => {
		assert.deepStrictEqual(findNestedIdBearingArrays(nestedNonIdSchema), []);
	});

	it("does NOT flag a depth-0 (top-level) id array", () => {
		assert.deepStrictEqual(findNestedIdBearingArrays(topLevelIdArraySchema), []);
	});

	it("resolves a one-level $ref on nested items", () => {
		const refSchema = {
			type: "object",
			properties: {
				plans: {
					type: "array",
					items: {
						type: "object",
						properties: {
							id: { type: "string" },
							layers: { type: "array", items: { $ref: "#/$defs/layer" } },
						},
					},
				},
			},
			$defs: {
				layer: { type: "object", properties: { id: { type: "string" }, name: { type: "string" } } },
			},
		};
		assert.deepStrictEqual(findNestedIdBearingArrays(refSchema), ["plans.layers"]);
	});
});

describe("writeSchema nested-id-bearing-array guard", () => {
	it("rejects a schema with a nested id-bearing array — message names the path; file NOT created", (t) => {
		const tmpDir = makeTmpDir("nested-id-reject");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupProjectDir(tmpDir);

		assert.throws(
			() => writeSchema(tmpDir, "carrier", nestedIdSchema),
			(err: unknown) => {
				assert.ok(err instanceof Error);
				assert.match(err.message, /nested id-bearing arrays are forbidden/);
				assert.match(err.message, /plans\.layers/);
				return true;
			},
		);
		assert.ok(!fs.existsSync(path.join(tmpDir, ".project", "schemas", "carrier.schema.json")));
	});

	it("accepts a schema with a nested NON-id array", (t) => {
		const tmpDir = makeTmpDir("nested-nonid-ok");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupProjectDir(tmpDir);

		assert.doesNotThrow(() => writeSchema(tmpDir, "ok-nonid", nestedNonIdSchema));
		assert.ok(fs.existsSync(path.join(tmpDir, ".project", "schemas", "ok-nonid.schema.json")));
	});

	it("accepts a schema with a depth-0 (top-level) id array", (t) => {
		const tmpDir = makeTmpDir("toplevel-id-ok");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupProjectDir(tmpDir);

		assert.doesNotThrow(() => writeSchema(tmpDir, "ok-toplevel", topLevelIdArraySchema));
		assert.ok(fs.existsSync(path.join(tmpDir, ".project", "schemas", "ok-toplevel.schema.json")));
	});

	it("still accepts a plain valid schema (no array at all)", (t) => {
		const tmpDir = makeTmpDir("plain-still-ok");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupProjectDir(tmpDir);

		assert.doesNotThrow(() => writeSchema(tmpDir, "plain", validSchema));
		assert.ok(fs.existsSync(path.join(tmpDir, ".project", "schemas", "plain.schema.json")));
	});
});
