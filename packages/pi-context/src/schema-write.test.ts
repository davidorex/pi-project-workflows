import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { writeConfig } from "./context.js";
import { schemaPath, schemaPathForDir, writeBootstrapPointer } from "./context-dir.js";
import { ValidationError } from "./schema-validator.js";
import {
	findNestedIdBearingArrays,
	readSchema,
	readSchemaForDir,
	updateSchema,
	writeSchema,
	writeSchemaChecked,
	writeSchemaCheckedForDir,
	writeSchemaForDir,
} from "./schema-write.js";

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
		writeConfig(tmpDir, { schema_version: "1.8.0", root: "alt-substrate", block_kinds: [] });

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

	// ── Cycle 9.3 hardening: id declared via forms 9.2 missed ──

	it("flags a nested array whose items declare id via `required` only (no properties.id)", () => {
		const schema = {
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
								// id only in required, NO properties.id
								items: { type: "object", required: ["id"], properties: { name: { type: "string" } } },
							},
						},
					},
				},
			},
		};
		assert.deepStrictEqual(findNestedIdBearingArrays(schema), ["plans.layers"]);
	});

	it("flags a nested array whose items use oneOf with an id-bearing branch", () => {
		const schema = {
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
									oneOf: [
										{ type: "object", properties: { kind: { const: "a" } } },
										{ type: "object", properties: { id: { type: "string" }, kind: { const: "b" } } },
									],
								},
							},
						},
					},
				},
			},
		};
		assert.deepStrictEqual(findNestedIdBearingArrays(schema), ["plans.layers"]);
	});

	it("flags a nested array whose items use anyOf with an id-bearing branch", () => {
		const schema = {
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
									anyOf: [
										{ type: "object", properties: { name: { type: "string" } } },
										{ type: "object", properties: { id: { type: "string" } } },
									],
								},
							},
						},
					},
				},
			},
		};
		assert.deepStrictEqual(findNestedIdBearingArrays(schema), ["plans.layers"]);
	});

	it("flags a nested array whose items use allOf with an id-via-required branch", () => {
		const schema = {
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
									allOf: [
										{ type: "object", properties: { name: { type: "string" } } },
										// id declared via required inside an allOf branch
										{ type: "object", required: ["id"] },
									],
								},
							},
						},
					},
				},
			},
		};
		assert.deepStrictEqual(findNestedIdBearingArrays(schema), ["plans.layers"]);
	});

	it("flags a nested array whose items is a tuple with an id-bearing member", () => {
		const schema = {
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
								items: [
									{ type: "object", properties: { name: { type: "string" } } },
									{ type: "object", properties: { id: { type: "string" } } },
								],
							},
						},
					},
				},
			},
		};
		assert.deepStrictEqual(findNestedIdBearingArrays(schema), ["plans.layers"]);
	});

	it("flags a nested array $ref'ing a $def that carries id via required", () => {
		const schema = {
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
				// id via required only, behind a $ref
				layer: { type: "object", required: ["id"], properties: { name: { type: "string" } } },
			},
		};
		assert.deepStrictEqual(findNestedIdBearingArrays(schema), ["plans.layers"]);
	});

	it("does NOT flag a depth-0 id-bearing composition array (config-shaped invariants)", () => {
		const schema = {
			type: "object",
			properties: {
				invariants: {
					type: "array",
					items: {
						oneOf: [
							{ type: "object", required: ["id"], properties: { id: { type: "string" }, class: { const: "a" } } },
							{ type: "object", required: ["id"], properties: { id: { type: "string" }, class: { const: "b" } } },
						],
					},
				},
			},
		};
		assert.deepStrictEqual(findNestedIdBearingArrays(schema), []);
	});

	it("does NOT flag a nested oneOf/tuple array with NO id branch (work-orders-shaped)", () => {
		const schema = {
			type: "object",
			properties: {
				orders: {
					type: "array",
					items: {
						type: "object",
						properties: {
							id: { type: "string" },
							refs: {
								type: "array",
								items: {
									oneOf: [{ type: "string" }, { type: "object", properties: { name: { type: "string" } } }],
								},
							},
							pairs: {
								type: "array",
								items: [{ type: "string" }, { type: "object", properties: { name: { type: "string" } } }],
							},
						},
					},
				},
			},
		};
		assert.deepStrictEqual(findNestedIdBearingArrays(schema), []);
	});

	it("does NOT hang on a self-referential $ref cycle; returns a correct result", () => {
		const schema = {
			type: "object",
			properties: {
				plans: {
					type: "array",
					items: { type: "object", properties: { id: { type: "string" }, node: { $ref: "#/$defs/A" } } },
				},
			},
			$defs: {
				// A's nested array self-references A — must not loop.
				A: {
					type: "object",
					properties: {
						children: { type: "array", items: { $ref: "#/$defs/A" } },
					},
				},
			},
		};
		// children's items declare no id → no hit; the call must simply return.
		assert.deepStrictEqual(findNestedIdBearingArrays(schema), []);
	});

	it("does NOT hang on an A↔B mutual $ref cycle; returns a correct result", () => {
		const schema = {
			type: "object",
			properties: {
				plans: {
					type: "array",
					items: { type: "object", properties: { id: { type: "string" }, node: { $ref: "#/$defs/A" } } },
				},
			},
			$defs: {
				A: { type: "object", properties: { bs: { type: "array", items: { $ref: "#/$defs/B" } } } },
				// B carries an id and its nested array points back at A (mutual cycle).
				B: {
					type: "object",
					properties: {
						id: { type: "string" },
						as: { type: "array", items: { $ref: "#/$defs/A" } },
					},
				},
			},
		};
		// plans.node.bs is at depth 1 (descended plans.items once); its items ($def B)
		// declare an id → flagged. The mutual cycle must terminate, not hang.
		assert.deepStrictEqual(findNestedIdBearingArrays(schema), ["plans.node.bs"]);
	});

	it("flags a $ref-self-cycle whose $def carries an id (id-peek uses a fresh cycle-guard)", () => {
		// `root` is a depth-0 array (not flaggable). Its items resolve to $def A; A's
		// `kids` is a depth-1 array whose items $ref back to A — and A declares
		// `properties.id`. The id-peek must NOT inherit the structural-descent visited
		// set (which already recorded #/$defs/A while walking into root.items): a shared
		// set would short-circuit the $ref to {} and miss the id. Fresh seed → flagged.
		const schema = {
			type: "object",
			$defs: {
				A: {
					type: "object",
					properties: {
						id: { type: "string" },
						kids: { type: "array", items: { $ref: "#/$defs/A" } },
					},
				},
			},
			properties: {
				root: { type: "array", items: { $ref: "#/$defs/A" } },
			},
		};
		assert.deepStrictEqual(findNestedIdBearingArrays(schema), ["root.kids"]);
	});

	// ── Cycle 9.3 termination: composition-routed `$ref` cycles must RETURN ──
	// Pre-fix the structural composition-branch descent reseeded the pointer-visited
	// set to a throwaway clone AND bypassed every depth/recursion backstop, so a
	// `$ref` cycle routed through anyOf/oneOf/allOf stack-overflowed (RangeError)
	// instead of terminating. Each case asserts the call RETURNS a result (the assert
	// itself fails on a throw/hang) and the traced value is correct. These shapes have
	// NO depth-1 array, so the correct result is [] — termination is the load-bearing
	// property; the value confirms no spurious hit.

	it("RETURNS (no overflow) on a oneOf self-cycle whose items is the composition", () => {
		// `items` is the composition directly (no $ref at items level), so the structural
		// `visited` set holds no ancestor pointer when the composition branch is first
		// reached — the exact shape that overflowed pre-fix.
		const schema = {
			type: "object",
			$defs: { A: { type: "object", oneOf: [{ $ref: "#/$defs/A" }] } },
			properties: { root: { type: "array", items: { oneOf: [{ $ref: "#/$defs/A" }] } } },
		};
		assert.deepStrictEqual(findNestedIdBearingArrays(schema), []);
	});

	it("RETURNS (no overflow) on a oneOf self-cycle ($ref items, self-referential $def)", () => {
		const schema = {
			type: "object",
			$defs: { A: { type: "object", oneOf: [{ $ref: "#/$defs/A" }] } },
			properties: { root: { type: "array", items: { $ref: "#/$defs/A" } } },
		};
		assert.deepStrictEqual(findNestedIdBearingArrays(schema), []);
	});

	it("RETURNS (no overflow) on an allOf self-cycle", () => {
		const schema = {
			type: "object",
			$defs: { A: { type: "object", allOf: [{ $ref: "#/$defs/A" }] } },
			properties: { root: { type: "array", items: { $ref: "#/$defs/A" } } },
		};
		assert.deepStrictEqual(findNestedIdBearingArrays(schema), []);
	});

	it("RETURNS (no overflow) on an A↔B mutual composition cycle", () => {
		const schema = {
			type: "object",
			$defs: {
				A: { type: "object", allOf: [{ $ref: "#/$defs/B" }] },
				B: { type: "object", anyOf: [{ $ref: "#/$defs/A" }] },
			},
			properties: { root: { type: "array", items: { $ref: "#/$defs/A" } } },
		};
		assert.deepStrictEqual(findNestedIdBearingArrays(schema), []);
	});

	it("RETURNS (no overflow) on an allOf self-cycle whose $def ALSO declares id", () => {
		// A carries properties.id AND allOf:[{$ref A}]. `root` is depth-0 (not flaggable)
		// and there is no depth-1 array, so the traced result is []; the point is that the
		// composition cycle terminates rather than overflowing on the id-bearing branch.
		const schema = {
			type: "object",
			$defs: { A: { type: "object", properties: { id: { type: "string" } }, allOf: [{ $ref: "#/$defs/A" }] } },
			properties: { root: { type: "array", items: { $ref: "#/$defs/A" } } },
		};
		assert.deepStrictEqual(findNestedIdBearingArrays(schema), []);
	});

	it("RETURNS (no overflow) on a deep pure-inline composition chain (no $ref)", () => {
		// A pure-inline allOf chain advances neither the array-depth counter nor the
		// pointer-cycle guard ($ref-free) — it terminates ONLY via MAX_STRUCT_RECURSION.
		// 3000 levels is well past the V8 native call-stack ceiling for this recursion
		// shape, so a missing structural-recursion bound would overflow here.
		let inline: Record<string, unknown> = { type: "object", properties: { name: { type: "string" } } };
		for (let i = 0; i < 3000; i++) inline = { type: "object", allOf: [inline] };
		const schema = { type: "object", properties: { root: { type: "array", items: inline } } };
		assert.deepStrictEqual(findNestedIdBearingArrays(schema), []);
	});

	it("RETURNS (no overflow) on a deep pure-inline object-property chain (no $ref)", () => {
		let chain: Record<string, unknown> = { type: "object", properties: { leaf: { type: "string" } } };
		for (let i = 0; i < 3000; i++) chain = { type: "object", properties: { next: chain } };
		const schema = { type: "object", properties: { root: chain } };
		assert.deepStrictEqual(findNestedIdBearingArrays(schema), []);
	});

	it("still terminates AND flags a composition-cycle $def that buries a depth-1 id array", () => {
		// A self-cycles via allOf:[{$ref A}] but ALSO has a `deep` array (depth-1, reached
		// via root.items→A) whose items declare id. Termination must not suppress the hit.
		const schema = {
			type: "object",
			$defs: {
				A: {
					type: "object",
					allOf: [{ $ref: "#/$defs/A" }],
					properties: { deep: { type: "array", items: { type: "object", properties: { id: { type: "string" } } } } },
				},
			},
			properties: { root: { type: "array", items: { $ref: "#/$defs/A" } } },
		};
		assert.deepStrictEqual(findNestedIdBearingArrays(schema), ["root.deep"]);
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

	// ── Cycle 9.3 hardening: oneOf-nested-id + tuple-nested-id rejected at the surface ──

	const oneOfNestedIdSchema = {
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
								oneOf: [
									{ type: "object", properties: { kind: { type: "string" } } },
									{ type: "object", properties: { id: { type: "string" } } },
								],
							},
						},
					},
				},
			},
		},
	};

	const tupleNestedIdSchema = {
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
							items: [
								{ type: "object", properties: { name: { type: "string" } } },
								{ type: "object", properties: { id: { type: "string" } } },
							],
						},
					},
				},
			},
		},
	};

	it("rejects a oneOf-branch nested id-bearing schema (create) — names the path; file NOT created", (t) => {
		const tmpDir = makeTmpDir("oneof-nested-id-reject");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupProjectDir(tmpDir);

		assert.throws(
			() => writeSchema(tmpDir, "carrier", oneOfNestedIdSchema),
			(err: unknown) => {
				assert.ok(err instanceof Error);
				assert.match(err.message, /nested id-bearing arrays are forbidden/);
				assert.match(err.message, /plans\.layers/);
				return true;
			},
		);
		assert.ok(!fs.existsSync(path.join(tmpDir, ".project", "schemas", "carrier.schema.json")));
	});

	it("rejects a tuple-items nested id-bearing schema (create) — names the path; file NOT created", (t) => {
		const tmpDir = makeTmpDir("tuple-nested-id-reject");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupProjectDir(tmpDir);

		assert.throws(
			() => writeSchema(tmpDir, "carrier", tupleNestedIdSchema),
			(err: unknown) => {
				assert.ok(err instanceof Error);
				assert.match(err.message, /nested id-bearing arrays are forbidden/);
				assert.match(err.message, /plans\.layers/);
				return true;
			},
		);
		assert.ok(!fs.existsSync(path.join(tmpDir, ".project", "schemas", "carrier.schema.json")));
	});

	it("rejects a oneOf-branch nested id-bearing schema on replace", (t) => {
		const tmpDir = makeTmpDir("oneof-nested-id-replace");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupProjectDir(tmpDir);

		writeSchema(tmpDir, "carrier", validSchema);
		assert.throws(
			() => writeSchemaChecked(tmpDir, "carrier", oneOfNestedIdSchema, "replace"),
			/nested id-bearing arrays are forbidden/,
		);
		// Prior valid body must remain byte-stable.
		const after = readSchema(tmpDir, "carrier") as Record<string, unknown>;
		assert.deepStrictEqual(after.properties, validSchema.properties);
	});

	it("rejects a tuple-items nested id-bearing schema on dry-run create; nothing written", (t) => {
		const tmpDir = makeTmpDir("tuple-nested-id-dryrun");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupProjectDir(tmpDir);

		assert.throws(
			() => writeSchemaChecked(tmpDir, "carrier", tupleNestedIdSchema, "create", undefined, { dryRun: true }),
			/nested id-bearing arrays are forbidden/,
		);
		assert.ok(!fs.existsSync(path.join(tmpDir, ".project", "schemas", "carrier.schema.json")));
	});

	it("accepts a depth-0 id-bearing composition array (config-shaped invariants)", (t) => {
		const tmpDir = makeTmpDir("depth0-composition-ok");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupProjectDir(tmpDir);

		const configShaped = {
			type: "object",
			properties: {
				invariants: {
					type: "array",
					items: {
						oneOf: [
							{ type: "object", required: ["id"], properties: { id: { type: "string" }, class: { const: "a" } } },
							{ type: "object", required: ["id"], properties: { id: { type: "string" }, class: { const: "b" } } },
						],
					},
				},
			},
		};
		assert.doesNotThrow(() => writeSchema(tmpDir, "ok-config", configShaped));
		assert.ok(fs.existsSync(path.join(tmpDir, ".project", "schemas", "ok-config.schema.json")));
	});
});

describe("schema-write ForDir twins", () => {
	const nestedIdShape = {
		type: "object",
		properties: {
			plans: {
				type: "array",
				items: {
					type: "object",
					required: ["id"],
					properties: {
						id: { type: "string" },
						layers: {
							type: "array",
							items: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
						},
					},
				},
			},
		},
	};

	it("writeSchemaCheckedForDir + readSchemaForDir write/read a TARGET dir's schemas/ — active pointer unmoved", (t) => {
		// cwd carries an active pointer at `.project`; the target substrate is a
		// SEPARATE dir under cwd. The ForDir write must land in the target dir and
		// leave the cwd pointer file byte-identical.
		const tmpDir = makeTmpDir("fordir-target");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		const pointerPath = path.join(tmpDir, ".pi-context.json");
		const pointerBefore = fs.readFileSync(pointerPath, "utf-8");

		const targetDir = path.join(tmpDir, ".foreign-substrate");
		fs.mkdirSync(targetDir, { recursive: true });

		const res = writeSchemaCheckedForDir(targetDir, "widget", validSchema, "create");
		assert.strictEqual(res.written, true);
		assert.strictEqual(res.operation, "create");
		assert.strictEqual(res.schemaPath, schemaPathForDir(targetDir, "widget"));

		// Landed in the TARGET dir, NOT the active `.project` dir.
		assert.ok(fs.existsSync(path.join(targetDir, "schemas", "widget.schema.json")));
		assert.ok(!fs.existsSync(path.join(tmpDir, ".project", "schemas", "widget.schema.json")));

		// Active pointer file untouched.
		assert.strictEqual(fs.readFileSync(pointerPath, "utf-8"), pointerBefore);

		// readSchemaForDir round-trips the same body.
		assert.deepStrictEqual(readSchemaForDir(targetDir, "widget"), validSchema);
		// readSchemaForDir against an absent name → null.
		assert.strictEqual(readSchemaForDir(targetDir, "ghost"), null);
	});

	it("cwd writeSchemaChecked is byte-identical to writeSchemaCheckedForDir(resolveContextDir) via the wrapper", (t) => {
		const tmpDir = makeTmpDir("fordir-wrapper-parity");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupProjectDir(tmpDir);

		// Write via the cwd form; the wrapper resolves the active `.project` dir.
		writeSchemaChecked(tmpDir, "parity", validSchema, "create");
		const viaCwd = fs.readFileSync(path.join(tmpDir, ".project", "schemas", "parity.schema.json"), "utf-8");

		// Write the SAME body via the ForDir form against the SAME `.project` dir
		// (replace, since the cwd form already created it) — bytes must match.
		writeSchemaCheckedForDir(path.join(tmpDir, ".project"), "parity", validSchema, "replace");
		const viaForDir = fs.readFileSync(path.join(tmpDir, ".project", "schemas", "parity.schema.json"), "utf-8");
		assert.strictEqual(viaForDir, viaCwd);
	});

	it("nested-id guard still fires through writeSchemaForDir + writeSchemaCheckedForDir", (t) => {
		const tmpDir = makeTmpDir("fordir-nested-guard");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		const targetDir = path.join(tmpDir, ".target");
		fs.mkdirSync(targetDir, { recursive: true });

		assert.throws(
			() => writeSchemaForDir(targetDir, "carrier", nestedIdShape),
			/nested id-bearing arrays are forbidden/,
		);
		assert.throws(
			() => writeSchemaCheckedForDir(targetDir, "carrier", nestedIdShape, "create"),
			/nested id-bearing arrays are forbidden/,
		);
		// dry-run preview rejects identically.
		assert.throws(
			() => writeSchemaCheckedForDir(targetDir, "carrier", nestedIdShape, "create", undefined, { dryRun: true }),
			/nested id-bearing arrays are forbidden/,
		);
		assert.ok(!fs.existsSync(path.join(targetDir, "schemas", "carrier.schema.json")));
	});

	it("writeSchemaCheckedForDir replace-missing throws; create-existing throws", (t) => {
		const tmpDir = makeTmpDir("fordir-presence");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		const targetDir = path.join(tmpDir, ".target");
		fs.mkdirSync(targetDir, { recursive: true });

		// replace on an absent target → throws.
		assert.throws(
			() => writeSchemaCheckedForDir(targetDir, "missing", validSchema, "replace"),
			/replace target missing/,
		);
		// create then create again → collision throws.
		writeSchemaCheckedForDir(targetDir, "dup", validSchema, "create");
		assert.throws(() => writeSchemaCheckedForDir(targetDir, "dup", validSchema, "create"), /create collision/);
	});
});
