/**
 * Schema-validation tests for the context-contracts block kind landed
 * in Phase 3 sub-phase 3.1 — the context-contracts substrate schema side of
 * the gather-execution-context primitive's work-unit-context-contract surface.
 *
 * Scope: validates the registry schema at
 * `packages/pi-context/registry/schemas/context-contracts.schema.json`
 * end-to-end against the canonical `validateFromFile` surface — no
 * parallel AJV setup, no fixture-write to a substrate dir. Each test
 * builds a JS object, hands it to `validateFromFile(schemaPath, data,
 * label)`, and asserts pass/fail with the expected AJV diagnostic
 * shape.
 *
 * Coverage per that phase's acceptance criteria:
 *   1. Valid round-trip with the 3 default registry contracts (and
 *      one fully-populated bundle_relation_types entry) → passes.
 *   2. Missing required field (id / unit_kind / bundle_relation_types /
 *      created_by / created_at) → ValidationError citing the missing
 *      property.
 *   3. Id pattern violations: "CTX-1" (too short) and "FOO-001"
 *      (wrong prefix) → ValidationError citing a pattern violation
 *      on /id.
 *   4. bundle_relation_types shape violations: missing relation_type,
 *      direction outside in/out/both, max_depth < 1 → ValidationError.
 *   5. additionalProperties rejection: an extra field on a contract
 *      and on a bundle_relation_types entry → ValidationError citing
 *      additionalProperties.
 */

import assert from "node:assert";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { ValidationError, validateFromFile } from "./schema-validator.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// packages/pi-context/src/ → packages/pi-context/registry/schemas/
const SCHEMA_PATH = path.resolve(__dirname, "..", "registry", "schemas", "context-contracts.schema.json");

function baseContract(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		id: "CTX-001",
		unit_kind: "task",
		bundle_relation_types: [],
		created_by: "agent/pi-context-registry",
		created_at: "2026-05-13T00:00:00Z",
		...overrides,
	};
}

describe("context-contracts schema: valid round-trip", () => {
	it("accepts the 3 default registry contracts (task / decision / verification, empty bundles)", () => {
		const data = {
			contracts: [
				baseContract({ id: "CTX-001", unit_kind: "task" }),
				baseContract({ id: "CTX-002", unit_kind: "decision" }),
				baseContract({ id: "CTX-003", unit_kind: "verification" }),
			],
		};
		const result = validateFromFile(SCHEMA_PATH, data, "context-contracts valid defaults");
		assert.deepStrictEqual(result, data);
	});

	it("accepts a contract with a fully-populated bundle_relation_types entry", () => {
		const data = {
			contracts: [
				baseContract({
					id: "CTX-010",
					unit_kind: "task",
					bundle_relation_types: [
						{
							relation_type: "constrained_by",
							direction: "in",
							max_depth: 3,
							applicability_predicate: "status == 'enacted'",
						},
						{
							relation_type: "addresses",
							direction: "out",
							max_depth: 1,
						},
					],
					description: "Implementation-task bundle: pulls inbound constraint edges + outbound addressed items.",
					notes: "Populated bundle for shape coverage.",
					modified_by: "agent/test",
					modified_at: "2026-05-13T01:00:00Z",
				}),
			],
		};
		const result = validateFromFile(SCHEMA_PATH, data, "context-contracts valid populated");
		assert.deepStrictEqual(result, data);
	});
});

describe("context-contracts schema: required-field rejection", () => {
	const requiredFields: Array<keyof ReturnType<typeof baseContract>> = [
		"id",
		"unit_kind",
		"bundle_relation_types",
		"created_by",
		"created_at",
	];

	for (const field of requiredFields) {
		it(`rejects a contract missing required field '${String(field)}'`, () => {
			const contract = baseContract();
			delete (contract as Record<string, unknown>)[String(field)];
			const data = { contracts: [contract] };
			assert.throws(
				() => validateFromFile(SCHEMA_PATH, data, `missing-${String(field)}`),
				(err: unknown) => {
					assert.ok(err instanceof ValidationError, "expected ValidationError");
					const missingErr = err.errors.find(
						(e) =>
							e.keyword === "required" && (e.params as { missingProperty?: string })?.missingProperty === String(field),
					);
					assert.ok(missingErr, `expected required violation citing ${String(field)}, got: ${err.message}`);
					return true;
				},
			);
		});
	}

	it("rejects top-level data missing the 'contracts' array entirely", () => {
		const data = {};
		assert.throws(
			() => validateFromFile(SCHEMA_PATH, data, "missing-contracts"),
			(err: unknown) => {
				assert.ok(err instanceof ValidationError);
				const missing = err.errors.find(
					(e) =>
						e.keyword === "required" && (e.params as { missingProperty?: string })?.missingProperty === "contracts",
				);
				assert.ok(missing, `expected required violation citing 'contracts', got: ${err.message}`);
				return true;
			},
		);
	});
});

describe("context-contracts schema: id-pattern rejection", () => {
	const invalidIds = [
		{ id: "CTX-1", reason: "too short (needs >= 3 digits)" },
		{ id: "CTX-12", reason: "still too short" },
		{ id: "FOO-001", reason: "wrong prefix" },
		{ id: "ctx-001", reason: "lowercase prefix" },
		{ id: "CTX001", reason: "missing hyphen" },
	];

	for (const { id, reason } of invalidIds) {
		it(`rejects id '${id}' (${reason})`, () => {
			const data = { contracts: [baseContract({ id })] };
			assert.throws(
				() => validateFromFile(SCHEMA_PATH, data, `invalid-id-${id}`),
				(err: unknown) => {
					assert.ok(err instanceof ValidationError);
					const patternErr = err.errors.find((e) => e.keyword === "pattern" && (e.instancePath ?? "").endsWith("/id"));
					assert.ok(patternErr, `expected pattern violation on /id, got: ${err.message}`);
					return true;
				},
			);
		});
	}
});

describe("context-contracts schema: bundle_relation_types shape rejection", () => {
	it("rejects a bundle_relation_types entry missing 'relation_type'", () => {
		const data = {
			contracts: [
				baseContract({
					bundle_relation_types: [{ direction: "in", max_depth: 2 }],
				}),
			],
		};
		assert.throws(
			() => validateFromFile(SCHEMA_PATH, data, "missing-relation_type"),
			(err: unknown) => {
				assert.ok(err instanceof ValidationError);
				const missing = err.errors.find(
					(e) =>
						e.keyword === "required" && (e.params as { missingProperty?: string })?.missingProperty === "relation_type",
				);
				assert.ok(missing, `expected required violation citing 'relation_type', got: ${err.message}`);
				return true;
			},
		);
	});

	it("rejects an invalid 'direction' enum value", () => {
		const data = {
			contracts: [
				baseContract({
					bundle_relation_types: [{ relation_type: "constrained_by", direction: "sideways", max_depth: 1 }],
				}),
			],
		};
		assert.throws(
			() => validateFromFile(SCHEMA_PATH, data, "invalid-direction"),
			(err: unknown) => {
				assert.ok(err instanceof ValidationError);
				const enumErr = err.errors.find((e) => e.keyword === "enum" && (e.instancePath ?? "").endsWith("/direction"));
				assert.ok(enumErr, `expected enum violation on /direction, got: ${err.message}`);
				return true;
			},
		);
	});

	it("rejects max_depth < 1 (zero)", () => {
		const data = {
			contracts: [
				baseContract({
					bundle_relation_types: [{ relation_type: "constrained_by", direction: "in", max_depth: 0 }],
				}),
			],
		};
		assert.throws(
			() => validateFromFile(SCHEMA_PATH, data, "zero-max_depth"),
			(err: unknown) => {
				assert.ok(err instanceof ValidationError);
				const minErr = err.errors.find((e) => e.keyword === "minimum" && (e.instancePath ?? "").endsWith("/max_depth"));
				assert.ok(minErr, `expected minimum violation on /max_depth, got: ${err.message}`);
				return true;
			},
		);
	});

	it("rejects max_depth as non-integer (e.g. 1.5)", () => {
		const data = {
			contracts: [
				baseContract({
					bundle_relation_types: [{ relation_type: "constrained_by", direction: "in", max_depth: 1.5 }],
				}),
			],
		};
		assert.throws(
			() => validateFromFile(SCHEMA_PATH, data, "non-integer-max_depth"),
			(err: unknown) => {
				assert.ok(err instanceof ValidationError);
				const typeErr = err.errors.find((e) => e.keyword === "type" && (e.instancePath ?? "").endsWith("/max_depth"));
				assert.ok(typeErr, `expected type violation on /max_depth, got: ${err.message}`);
				return true;
			},
		);
	});
});

describe("context-contracts schema: additionalProperties rejection", () => {
	it("rejects an extra field on a contract item", () => {
		const data = { contracts: [baseContract({ unexpected_field: "noise" })] };
		assert.throws(
			() => validateFromFile(SCHEMA_PATH, data, "extra-contract-field"),
			(err: unknown) => {
				assert.ok(err instanceof ValidationError);
				const addl = err.errors.find((e) => e.keyword === "additionalProperties");
				assert.ok(addl, `expected additionalProperties violation, got: ${err.message}`);
				return true;
			},
		);
	});

	it("rejects an extra field on a bundle_relation_types entry", () => {
		const data = {
			contracts: [
				baseContract({
					bundle_relation_types: [
						{
							relation_type: "constrained_by",
							direction: "in",
							max_depth: 1,
							rogue_key: "unexpected",
						},
					],
				}),
			],
		};
		assert.throws(
			() => validateFromFile(SCHEMA_PATH, data, "extra-relation-field"),
			(err: unknown) => {
				assert.ok(err instanceof ValidationError);
				const addl = err.errors.find((e) => e.keyword === "additionalProperties");
				assert.ok(addl, `expected additionalProperties violation, got: ${err.message}`);
				return true;
			},
		);
	});
});
