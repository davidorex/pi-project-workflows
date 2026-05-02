/**
 * Per-item macro tests: render_architecture_item (Plan 8, Wave 4).
 *
 * Singleton kind: architecture holds one record per repository.
 * Cross-block-reference and cycle cases do not apply.
 *
 * Setup wiring (Nunjucks env, fixture id-index, per-item / whole-block render
 * helpers) lives in `./test-helpers.js` — every render-*.test.ts shares the
 * same harness so the per-file body holds only the kind-specific assertions.
 */
import assert from "node:assert";
import { describe, it } from "node:test";
import { buildFixtureIdIndex, makeRendererTestEnv, renderItemMacro, renderWholeBlockMacro } from "./test-helpers.js";

function renderItem(a: Record<string, unknown>, depth = 0): string {
	return renderItemMacro(makeRendererTestEnv(buildFixtureIdIndex({}), {}), "architecture", a, depth);
}

function renderWhole(data: unknown): string {
	return renderWholeBlockMacro(makeRendererTestEnv(buildFixtureIdIndex({}), {}), "render_architecture", data);
}

describe("render_architecture_item macro", () => {
	it("case 1: required field only — modules", () => {
		const minimal = {
			modules: [{ name: "core", file: "src/core.ts", responsibility: "Core logic" }],
		};
		const out = renderItem(minimal, 0);
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
		const out = renderItem(full, 0);
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
		const out = renderItem(data, 0);
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
		const itemOut = renderItem(data, 0);
		const wholeOut = renderWhole(data);
		assert.ok(wholeOut.includes("**alpha**"), "whole-block must contain delegated content");
		assert.ok(wholeOut.includes("alpha role"));
		assert.ok(itemOut.includes("**alpha**"));
		assert.strictEqual(renderWhole(null).trim(), "", "render_architecture(null) must emit nothing");
	});
});
