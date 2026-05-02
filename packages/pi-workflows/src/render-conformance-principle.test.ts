/**
 * Per-item macro tests: render_conformance_principle (Plan 8, Wave 4).
 *
 * Conformance principles have no cross-block reference fields; cycle and
 * recursion cases do not apply.
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

function renderItem(env: nunjucks.Environment, p: Record<string, unknown>, depth = 0): string {
	const tpl = `{% from "items/conformance.md" import render_conformance_principle %}{{ render_conformance_principle(p, depth) }}`;
	return env.renderString(tpl, { p, depth });
}

function renderWhole(env: nunjucks.Environment, data: unknown): string {
	const tpl = `{% from "shared/macros.md" import render_conformance %}{{ render_conformance(data) }}`;
	return env.renderString(tpl, { data });
}

describe("render_conformance_principle macro", () => {
	it("case 1: required fields rendered — id, name, rules", () => {
		const principle = {
			id: "P1",
			name: "Type Safety",
			rules: [{ id: "P1.1", rule: "No any types" }],
		};
		const env = makeEnv();
		const out = renderItem(env, principle, 0);
		assert.match(out, /### P1: Type Safety/);
		assert.match(out, /\*\*P1\.1\*\*/);
		assert.match(out, /No any types/);
		assert.doesNotMatch(out, /\bundefined\b/);
	});

	it("case 2: optional fields — description, rule severity/check_method/anti_patterns", () => {
		const principle = {
			id: "P2",
			name: "Error Handling",
			description: "All errors must be typed exceptions",
			rules: [
				{
					id: "P2.1",
					rule: "Throw typed errors",
					severity: "error",
					check_method: "grep",
					anti_patterns: ["throw new Error(", "throw 'string'"],
				},
				{ id: "P2.2", rule: "Catch and re-throw with context" },
			],
		};
		const env = makeEnv();
		const out = renderItem(env, principle, 0);
		assert.match(out, /All errors must be typed exceptions/);
		assert.match(out, /\[error\]/);
		assert.match(out, /check: grep/);
		assert.match(out, /Anti-patterns: throw new Error\(; throw 'string'/);
		assert.match(out, /\*\*P2\.2\*\*/);
	});

	it("case 5: empty rules array — heading rendered, no rule entries leak undefined", () => {
		const principle = { id: "P3", name: "Empty", rules: [] };
		const env = makeEnv();
		const out = renderItem(env, principle, 0);
		assert.match(out, /### P3: Empty/);
		assert.doesNotMatch(out, /\bundefined\b/);
	});

	it("case 6: whole-block derived view — render_conformance header + per-principle iteration", () => {
		const data = {
			name: "Pi Extension Standards",
			principles: [
				{ id: "P1", name: "Type Safety", rules: [{ id: "P1.1", rule: "No any types" }] },
				{ id: "P2", name: "Boundaries", rules: [{ id: "P2.1", rule: "No layer skipping" }] },
			],
		};
		const env = makeEnv();
		const out = renderWhole(env, data);
		assert.match(out, /## Conformance Reference/);
		assert.match(out, /\*\*Pi Extension Standards\*\*/);
		assert.match(out, /### P1: Type Safety/);
		assert.match(out, /### P2: Boundaries/);
		assert.match(out, /No any types/);
		assert.match(out, /No layer skipping/);

		// Equivalence: per-principle output appears in whole-block.
		const item1Out = renderItem(env, data.principles[0]!, 0);
		const principle1Heading = item1Out.match(/### .+/)?.[0];
		assert.ok(principle1Heading);
		assert.ok(out.includes(principle1Heading));

		assert.strictEqual(renderWhole(env, null).trim(), "");
	});
});
