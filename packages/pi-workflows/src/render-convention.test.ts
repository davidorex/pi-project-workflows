/**
 * Per-item macro tests: render_convention (Plan 8, Wave 4).
 *
 * Conventions are leaf rules with no cross-block reference fields; cycle and
 * recursion cases do not apply.
 *
 * Setup wiring (Nunjucks env, fixture id-index, per-item / whole-block render
 * helpers) lives in `./test-helpers.js` — every render-*.test.ts shares the
 * same harness so the per-file body holds only the kind-specific assertions.
 *
 * Test cases:
 *   1. Required fields only — id, description, enforcement, severity
 *   2. (No optional fields beyond required exist in the schema; case omitted)
 *   6. Whole-block derived-view equivalence — render_conventions(data)
 *      emits block-level header (test_conventions, lint_command, lint_scope)
 *      then iterates rules through render_convention.
 *
 *   Plus: render_conventions was authored fresh in Plan 8 (it never previously
 *   existed in macros.md despite README references). Verify existence + shape.
 */
import assert from "node:assert";
import { describe, it } from "node:test";
import { buildFixtureIdIndex, makeRendererTestEnv, renderItemMacro, renderWholeBlockMacro } from "./test-helpers.js";

function renderItem(rule: Record<string, unknown>, depth = 0): string {
	return renderItemMacro(makeRendererTestEnv(buildFixtureIdIndex({}), {}), "conventions", rule, depth);
}

function renderWhole(data: unknown): string {
	return renderWholeBlockMacro(makeRendererTestEnv(buildFixtureIdIndex({}), {}), "render_conventions", data);
}

describe("render_convention macro", () => {
	it("case 1: required fields rendered — id, description, enforcement, severity", () => {
		const rule = {
			id: "C-001",
			description: "No console.error as diagnostic capture",
			enforcement: "review",
			severity: "error",
		};
		const out = renderItem(rule, 0);
		assert.match(out, /\*\*C-001\*\*/);
		assert.match(out, /No console\.error as diagnostic capture/);
		assert.match(out, /\[error, review\]/);
		assert.doesNotMatch(out, /\bundefined\b/);
	});

	it("case 6: whole-block derived view — render_conventions header + per-rule iteration", () => {
		const data = {
			rules: [
				{ id: "C-001", description: "rule one", enforcement: "lint", severity: "error" },
				{ id: "C-002", description: "rule two", enforcement: "test", severity: "warning" },
			],
			test_conventions: { runner_command: "npm test", file_pattern: "**/*.test.ts" },
			lint_command: "npm run lint",
			lint_scope: "packages/*/src/**",
		};
		const out = renderWhole(data);

		// Block-level header surfaces.
		assert.match(out, /## Conventions/);
		assert.match(out, /Tests:.*npm test.*\*\*\/\*\.test\.ts/, "test_conventions header must surface");
		assert.match(out, /Lint:.*npm run lint/, "lint_command header must surface");
		assert.match(out, /scope: packages\/\*\/src\/\*\*/, "lint_scope must surface");

		// Each rule appears.
		assert.match(out, /\*\*C-001\*\*/);
		assert.match(out, /\*\*C-002\*\*/);
		assert.match(out, /rule one/);
		assert.match(out, /rule two/);
		assert.match(out, /\[error, lint\]/);
		assert.match(out, /\[warning, test\]/);

		// Equivalence: per-rule output appears in whole-block output.
		const rule1Out = renderItem(data.rules[0]!, 0).trim();
		assert.ok(out.includes(rule1Out.split("\n")[0] ?? ""), "first rule's per-item output must appear in whole-block");
	});

	it("case 6b: render_conventions emits nothing for null/empty rules", () => {
		assert.strictEqual(renderWhole(null).trim(), "");
		assert.strictEqual(renderWhole({}).trim(), "");
	});

	it("case 6c: render_conventions header optional fields render only when present", () => {
		const data = {
			rules: [{ id: "C-001", description: "minimal", enforcement: "manual", severity: "info" }],
		};
		const out = renderWhole(data);
		assert.doesNotMatch(out, /Tests:/);
		assert.doesNotMatch(out, /Lint:/);
		assert.match(out, /\*\*C-001\*\*/);
	});
});
