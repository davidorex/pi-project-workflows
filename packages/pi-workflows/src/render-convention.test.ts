/**
 * Per-item macro tests: render_convention (Plan 8, Wave 4).
 *
 * Wiring mirrors render-decision.test.ts. Conventions are leaf rules with
 * no cross-block reference fields; cycle and recursion cases do not apply.
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
import path from "node:path";
import { describe, it } from "node:test";
import nunjucks from "nunjucks";

const TEMPLATES_DIR = path.resolve(import.meta.dirname, "..", "templates");

function makeEnv(): nunjucks.Environment {
	const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(TEMPLATES_DIR), {
		autoescape: false,
		throwOnUndefined: false,
	});
	env.addGlobal("resolve", () => null);
	env.addGlobal("render_recursive", () => "");
	env.addGlobal("enforceBudget", (rendered: unknown): string =>
		typeof rendered === "string" ? rendered : rendered === undefined || rendered === null ? "" : String(rendered),
	);
	return env;
}

function renderItem(env: nunjucks.Environment, rule: Record<string, unknown>, depth = 0): string {
	const tpl = `{% from "items/conventions.md" import render_convention %}{{ render_convention(rule, depth) }}`;
	return env.renderString(tpl, { rule, depth });
}

function renderWhole(env: nunjucks.Environment, data: unknown): string {
	const tpl = `{% from "shared/macros.md" import render_conventions %}{{ render_conventions(data) }}`;
	return env.renderString(tpl, { data });
}

describe("render_convention macro", () => {
	it("case 1: required fields rendered — id, description, enforcement, severity", () => {
		const rule = {
			id: "C-001",
			description: "No console.error as diagnostic capture",
			enforcement: "review",
			severity: "error",
		};
		const env = makeEnv();
		const out = renderItem(env, rule, 0);
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
		const env = makeEnv();
		const out = renderWhole(env, data);

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
		const rule1Out = renderItem(env, data.rules[0]!, 0).trim();
		assert.ok(out.includes(rule1Out.split("\n")[0] ?? ""), "first rule's per-item output must appear in whole-block");
	});

	it("case 6b: render_conventions emits nothing for null/empty rules", () => {
		const env = makeEnv();
		assert.strictEqual(renderWhole(env, null).trim(), "");
		assert.strictEqual(renderWhole(env, {}).trim(), "");
	});

	it("case 6c: render_conventions header optional fields render only when present", () => {
		const data = {
			rules: [{ id: "C-001", description: "minimal", enforcement: "manual", severity: "info" }],
		};
		const env = makeEnv();
		const out = renderWhole(env, data);
		assert.doesNotMatch(out, /Tests:/);
		assert.doesNotMatch(out, /Lint:/);
		assert.match(out, /\*\*C-001\*\*/);
	});
});
