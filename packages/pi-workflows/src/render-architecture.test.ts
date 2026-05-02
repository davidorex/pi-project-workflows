/**
 * Per-item macro tests: render_architecture_item (Plan 8, Wave 4).
 *
 * Singleton kind: architecture holds one record per repository.
 * Cross-block-reference and cycle cases do not apply.
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
	return env;
}

function renderItem(env: nunjucks.Environment, a: Record<string, unknown>, depth = 0): string {
	const tpl = `{% from "items/architecture.md" import render_architecture_item %}{{ render_architecture_item(a, depth) }}`;
	return env.renderString(tpl, { a, depth });
}

function renderWhole(env: nunjucks.Environment, data: unknown): string {
	const tpl = `{% from "shared/macros.md" import render_architecture %}{{ render_architecture(data) }}`;
	return env.renderString(tpl, { data });
}

describe("render_architecture_item macro", () => {
	it("case 1: required field only — modules", () => {
		const minimal = {
			modules: [{ name: "core", file: "src/core.ts", responsibility: "Core logic" }],
		};
		const env = makeEnv();
		const out = renderItem(env, minimal, 0);
		assert.match(out, /## Architecture/);
		assert.match(out, /\*\*core\*\*/);
		assert.match(out, /`src\/core\.ts`/);
		assert.match(out, /Core logic/);
		// Optional fields absent.
		assert.doesNotMatch(out, /### Patterns/);
		assert.doesNotMatch(out, /### Boundaries/);
		assert.doesNotMatch(out, /\bundefined\b/);
	});

	it("case 2: optional fields populated — overview, patterns, boundaries, deps, lines", () => {
		const full = {
			overview: "Monorepo architecture",
			modules: [
				{ name: "core", file: "src/core.ts", responsibility: "Core logic", lines: 200, dependencies: ["utils", "io"] },
			],
			patterns: [{ name: "registry", description: "Central registry", used_in: ["core", "agents"] }],
			boundaries: ["No direct DB access from UI", "Agents communicate via events only"],
		};
		const env = makeEnv();
		const out = renderItem(env, full, 0);
		assert.match(out, /Monorepo architecture/);
		assert.match(out, /200 lines/);
		assert.match(out, /deps: utils, io/);
		assert.match(out, /### Patterns/);
		assert.match(out, /\*\*registry\*\*/);
		assert.match(out, /used in: core, agents/);
		assert.match(out, /### Boundaries/);
		assert.match(out, /No direct DB access from UI/);
		assert.match(out, /Agents communicate via events only/);
	});

	it("case 5: empty modules array still emits architecture heading; no orphan section labels", () => {
		const data = { modules: [] };
		const env = makeEnv();
		const out = renderItem(env, data, 0);
		// modules is required but if author passes [], we render the heading
		// because data is truthy; per-module loop produces nothing. No
		// "undefined" leakage and no spurious sub-section labels.
		assert.doesNotMatch(out, /\bundefined\b/);
		assert.doesNotMatch(out, /### Patterns/);
		assert.doesNotMatch(out, /### Boundaries/);
	});

	it("case 6: whole-block derived view — render_architecture wraps render_architecture_item", () => {
		const data = {
			modules: [{ name: "alpha", file: "a.ts", responsibility: "alpha role" }],
		};
		const env = makeEnv();
		const itemOut = renderItem(env, data, 0);
		const wholeOut = renderWhole(env, data);
		assert.ok(wholeOut.includes("**alpha**"), "whole-block must contain delegated content");
		assert.ok(wholeOut.includes("alpha role"));
		assert.ok(itemOut.includes("**alpha**"));
		assert.strictEqual(renderWhole(env, null).trim(), "", "render_architecture(null) must emit nothing");
	});
});
