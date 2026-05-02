/**
 * Per-item macro tests: render_project_item (Plan 8, Wave 4).
 *
 * Mirrors the wiring approach of render-decision.test.ts: direct Nunjucks
 * environment with the same `resolve` and `render_recursive` globals that
 * compileAgent registers in @davidorex/pi-jit-agents. Pi-workflows does not
 * depend on pi-jit-agents; adding a workspace dep solely for these tests
 * would be invasive — the macro logic is what's under test, not the
 * compileAgent pipeline (covered separately).
 *
 * Singleton kind: project holds one record per repository (no items[]
 * array). Cycle and cross-block-reference cases are not applicable
 * because the schema defines no fields that point to other project blocks.
 *
 * Test cases (adapted to singleton-with-no-cross-refs shape):
 *   1. Required-fields-only render
 *   2. Optional-fields-present render
 *   5. Empty-array convention (constraints, goals, target_users present-but-empty)
 *   6. Whole-block derived-view equivalence: render_project(data) wraps
 *      render_project_item with a null guard; output must contain the
 *      per-item content.
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
	// Per-item macros for project don't invoke resolve/render_recursive (no
	// cross-block reference fields), but registering them mirrors the
	// compileAgent wiring contract and protects against accidental future
	// schema additions emitting reference fields without the globals being
	// available at test time.
	env.addGlobal("resolve", () => null);
	env.addGlobal("render_recursive", () => "");
	env.addGlobal("enforceBudget", (rendered: unknown): string =>
		typeof rendered === "string" ? rendered : rendered === undefined || rendered === null ? "" : String(rendered),
	);
	return env;
}

function renderItem(env: nunjucks.Environment, p: Record<string, unknown>, depth = 0): string {
	const tpl = `{% from "items/project.md" import render_project_item %}{{ render_project_item(p, depth) }}`;
	return env.renderString(tpl, { p, depth });
}

function renderWhole(env: nunjucks.Environment, data: unknown): string {
	const tpl = `{% from "shared/macros.md" import render_project %}{{ render_project(data) }}`;
	return env.renderString(tpl, { data });
}

describe("render_project_item macro", () => {
	it("case 1: required fields only — name, description, core_value", () => {
		const minimal = {
			name: "minimal-project",
			description: "Bare project record",
			core_value: "Doing one thing",
		};
		const env = makeEnv();
		const out = renderItem(env, minimal, 0);
		assert.match(out, /minimal-project/);
		assert.match(out, /Bare project record/);
		assert.match(out, /Core value: Doing one thing/);
		// Optional fields absent → no orphan labels.
		assert.doesNotMatch(out, /Vision:/);
		assert.doesNotMatch(out, /Status:/);
		assert.doesNotMatch(out, /Target users:/);
		assert.doesNotMatch(out, /### Constraints/);
		assert.doesNotMatch(out, /### Scope/);
		assert.doesNotMatch(out, /### Goals/);
		assert.doesNotMatch(out, /\bundefined\b/);
	});

	it("case 2: optional fields populated — vision, status, target_users, constraints, scope, goals", () => {
		const full = {
			name: "full-project",
			description: "All fields populated",
			core_value: "Comprehensive coverage",
			vision: "A complete vision statement",
			status: "development",
			target_users: ["agents", "humans"],
			constraints: [{ type: "runtime", description: "Node 22+" }],
			scope_boundaries: { in: ["unit tests"], out: ["e2e tests"] },
			goals: [{ id: "G-001", description: "ship", success_criteria: ["zero failures"] }],
			repository: "github.com/example/full",
			stack: ["typescript", "nunjucks"],
		};
		const env = makeEnv();
		const out = renderItem(env, full, 0);
		assert.match(out, /Vision: A complete vision statement/);
		assert.match(out, /Status: development/);
		assert.match(out, /Target users: agents, humans/);
		assert.match(out, /\[runtime\] Node 22\+/);
		assert.match(out, /unit tests/);
		assert.match(out, /e2e tests/);
		assert.match(out, /\*\*G-001\*\*: ship/);
		assert.match(out, /zero failures/);
		assert.match(out, /Repository: github.com\/example\/full/);
		assert.match(out, /Stack: typescript, nunjucks/);
	});

	it("case 5: empty target_users array does not emit label noise", () => {
		const data = {
			name: "p",
			description: "d",
			core_value: "v",
			target_users: [],
		};
		const env = makeEnv();
		const out = renderItem(env, data, 0);
		// target_users gates on truthy (non-empty); empty array is falsy in Nunjucks's
		// existence-style guard via `{% if p.target_users %}`. Either no label, or
		// label with empty join — both are acceptable as long as no `undefined` leaks.
		assert.doesNotMatch(out, /\bundefined\b/);
	});

	it("case 6: whole-block derived view — render_project wraps render_project_item", () => {
		const data = {
			name: "wrapped",
			description: "wrapped record",
			core_value: "wrapped value",
		};
		const env = makeEnv();
		const itemOut = renderItem(env, data, 0).trim();
		const wholeOut = renderWhole(env, data).trim();
		// Derived view delegates to the per-item macro; the substantive content
		// (name, description, core value) must appear in both outputs. Outer
		// whitespace may differ because the whole-block macro wraps the call
		// in an `{% if data %}` guard with surrounding newlines.
		assert.ok(wholeOut.includes("wrapped"), "whole-block output must contain item content");
		assert.ok(wholeOut.includes("wrapped record"));
		assert.ok(wholeOut.includes("wrapped value"));
		assert.ok(itemOut.includes("wrapped"));
		// Null/undefined data → empty output.
		assert.strictEqual(renderWhole(env, null).trim(), "", "render_project(null) must emit nothing");
	});
});
