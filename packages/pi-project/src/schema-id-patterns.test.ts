/**
 * Tests for top-level `id` pattern enforcement on the nine block schemas
 * tightened by Plan 0 of the per-item-macros work. Each schema is loaded
 * from `.project/schemas/<kind>.schema.json` at the repo root and validated
 * via the canonical `validateFromFile` surface — no parallel AJV setup.
 *
 * Per kind the test asserts:
 *   - a fixture object with a conforming top-level `id` validates clean
 *   - a fixture object with a malformed top-level `id` rejects with
 *     ValidationError
 *
 * Nested IDs (story/task IDs inside features, finding IDs inside reviews,
 * layer/phase IDs inside layer-plans) are out of scope for Plan 0 and are
 * therefore not exercised here. Only top-level item `id` constraints are
 * under test.
 */

import assert from "node:assert";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { ValidationError, validateFromFile } from "./schema-validator.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// repo root is three levels above packages/pi-project/src/
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const SCHEMAS_DIR = path.join(REPO_ROOT, ".project", "schemas");

interface Case {
	kind: string;
	arrayKey: string;
	validId: string;
	invalidId: string;
	/** Builder produces a single item object with the supplied id. */
	makeItem: (id: string) => Record<string, unknown>;
}

// Each builder returns the minimal-required shape per the schema in question.
// Required-field shapes intentionally mirror the schema's `required` array so
// that the only validation failure on the negative case is the id pattern.
const CASES: Case[] = [
	{
		kind: "tasks",
		arrayKey: "tasks",
		validId: "TASK-001",
		invalidId: "task-1",
		makeItem: (id) => ({
			id,
			description: "stub task",
			status: "planned",
		}),
	},
	{
		kind: "requirements",
		arrayKey: "requirements",
		validId: "REQ-001",
		invalidId: "REQUIREMENT-1",
		makeItem: (id) => ({
			id,
			description: "stub requirement",
			type: "functional",
			status: "proposed",
			priority: "must",
		}),
	},
	{
		kind: "verification",
		arrayKey: "verifications",
		validId: "VER-001",
		invalidId: "verification-1",
		makeItem: (id) => ({
			id,
			target: "TASK-001",
			target_type: "task",
			status: "passed",
			method: "test",
		}),
	},
	{
		kind: "rationale",
		arrayKey: "rationales",
		validId: "RAT-001",
		invalidId: "RAT-1",
		makeItem: (id) => ({
			id,
			title: "stub rationale",
			narrative: "stub narrative",
		}),
	},
	{
		kind: "spec-reviews",
		arrayKey: "reviews",
		validId: "REVIEW-001",
		invalidId: "REV-001",
		makeItem: (id) => ({
			id,
			target: "docs/planning/stub.md",
			status: "not-started",
			findings: [],
			created_by: "agent",
			created_at: "2026-05-02T00:00:00Z",
		}),
	},
	{
		kind: "features",
		arrayKey: "features",
		validId: "FEAT-001",
		invalidId: "FEATURE-1",
		makeItem: (id) => ({
			id,
			title: "stub feature",
			status: "proposed",
			layer: "L3",
			description: "stub description",
			acceptance_criteria: [],
			stories: [],
			findings: [],
			created_by: "agent",
			created_at: "2026-05-02T00:00:00Z",
		}),
	},
	{
		kind: "layer-plans",
		arrayKey: "plans",
		validId: "PLAN-001",
		invalidId: "plan-1",
		makeItem: (id) => ({
			id,
			title: "stub plan",
			status: "draft",
			model: "stub model",
			layers: [],
			migration_phases: [],
			created_by: "agent",
			created_at: "2026-05-02T00:00:00Z",
		}),
	},
	{
		kind: "issues",
		arrayKey: "issues",
		validId: "issue-001",
		invalidId: "ISSUE-001",
		makeItem: (id) => ({
			id,
			title: "stub issue",
			body: "stub body",
			location: "packages/pi-project/src/stub.ts:1",
			status: "open",
			category: "issue",
			priority: "low",
			package: "pi-project",
		}),
	},
	{
		kind: "research",
		arrayKey: "research",
		validId: "R-0001",
		invalidId: "R-1",
		makeItem: (id) => ({
			id,
			title: "stub research",
			status: "planned",
			layer: "L2",
			type: "investigative",
			question: "stub question",
			method: "stub method",
			findings_summary: "stub summary",
			created_by: "agent",
			created_at: "2026-05-02T00:00:00Z",
		}),
	},
];

describe("schema id-pattern enforcement (Plan 0)", () => {
	for (const c of CASES) {
		const schemaPath = path.join(SCHEMAS_DIR, `${c.kind}.schema.json`);

		it(`${c.kind}: accepts ${c.validId} as a conforming top-level id`, () => {
			const data = { [c.arrayKey]: [c.makeItem(c.validId)] };
			const result = validateFromFile(schemaPath, data, `${c.kind} valid`);
			assert.deepStrictEqual(result, data);
		});

		it(`${c.kind}: rejects ${c.invalidId} as a malformed top-level id`, () => {
			const data = { [c.arrayKey]: [c.makeItem(c.invalidId)] };
			assert.throws(
				() => validateFromFile(schemaPath, data, `${c.kind} invalid`),
				(err: unknown) => {
					assert.ok(err instanceof ValidationError, "expected ValidationError");
					// At least one AJV error should reference the id field via pattern keyword.
					const idPatternErr = err.errors.find(
						(e) => e.keyword === "pattern" && (e.instancePath ?? "").endsWith("/id"),
					);
					assert.ok(idPatternErr, `expected a pattern violation on /id, got: ${err.message}`);
					return true;
				},
			);
		});
	}
});
