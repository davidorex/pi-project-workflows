/**
 * Render-tests for the 6 whole-block delegators landed in the template-
 * relocation arc (decisions / features / framework-gaps / layer-plans /
 * research / spec-reviews). Each test renders the delegator against the
 * real `.project/<file>.json` data for this repo and asserts the four
 * lens-4 conditions:
 *
 *   1. output is non-empty
 *   2. output contains the conception display_name as a heading
 *   3. output contains at least one ID string from the first 1-2 items
 *   4. output contains neither `[object Object]` nor `undefined`
 *
 * The tests intentionally exercise the same Nunjucks env-construction
 * shape that pi-workflows/src/macros.test.ts uses — direct
 * FileSystemLoader on bundledTemplateDir() plus pass-through globals for
 * `enforceBudget`/`resolve`/`render_recursive` (registered by compileAgent
 * in production but not by this minimal env). The point is to exercise
 * the new delegators end-to-end without going through compileAgent's
 * input/output machinery.
 *
 * Real-substrate reads target this repo's own `.project/*.json` files so
 * the delegator behavior is verified against the live shape the user
 * actually maintains. Per the canonical-resolution analysis: render
 * verification belongs against real substrate, not synthetic fixtures.
 */
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import nunjucks from "nunjucks";
import { bundledTemplateDir } from "./template.js";

// Repo root — the templates directory under packages/pi-jit-agents/ ships
// with this package; the .project/ directory lives at the monorepo root.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const PROJECT_DIR = path.join(REPO_ROOT, ".project");

function loadProjectBlock(filename: string): unknown {
	const filePath = path.join(PROJECT_DIR, filename);
	return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function makeEnv(): nunjucks.Environment {
	const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(bundledTemplateDir()), {
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

function renderDelegator(env: nunjucks.Environment, macroName: string, data: unknown): string {
	const template = `{% from "shared/macros.md" import ${macroName} %}{{ ${macroName}(data) }}`;
	return env.renderString(template, { data });
}

function assertLens4(result: string, displayName: string, firstItemId: string, macroName: string): void {
	assert.ok(result.trim().length > 0, `${macroName}: output is empty`);
	assert.ok(result.includes(displayName), `${macroName}: output missing display-name header "${displayName}"`);
	assert.ok(result.includes(firstItemId), `${macroName}: output missing first-item id "${firstItemId}"`);
	assert.ok(!result.includes("[object Object]"), `${macroName}: output contains [object Object] substring`);
	// Nunjucks-emitted undefined pattern: bare `undefined` produced when
	// `{{ field }}` references a missing key under throwOnUndefined:false.
	// The token appears as a colon-prefixed value or a bullet-list entry —
	// e.g. "**Field:** undefined\n" or "- undefined\n". Real item content
	// can legitimately contain the substring (e.g. a TypeScript type
	// annotation like `Model | undefined`), so the check is narrowed to
	// the Nunjucks-failure signatures rather than a global substring scan.
	const nunjucksUndefinedPatterns = [/:\s*undefined\s*$/m, /^-\s*undefined\s*$/m, /^undefined\s*$/m];
	for (const pat of nunjucksUndefinedPatterns) {
		assert.ok(!pat.test(result), `${macroName}: output contains Nunjucks-emitted undefined matching ${pat}`);
	}
}

describe("6 new whole-block delegators — lens-4 render against real substrate", () => {
	it("render_decisions: real .project/decisions.json", () => {
		const env = makeEnv();
		const data = loadProjectBlock("decisions.json") as { decisions: Array<{ id: string }> };
		assert.ok(Array.isArray(data.decisions) && data.decisions.length > 0, "fixture: decisions.json non-empty");
		const result = renderDelegator(env, "render_decisions", data);
		assertLens4(result, "Decisions", data.decisions[0].id, "render_decisions");
	});

	it("render_features: real .project/features.json", () => {
		const env = makeEnv();
		const data = loadProjectBlock("features.json") as { features: Array<{ id: string }> };
		assert.ok(Array.isArray(data.features) && data.features.length > 0, "fixture: features.json non-empty");
		const result = renderDelegator(env, "render_features", data);
		assertLens4(result, "Features", data.features[0].id, "render_features");
	});

	it("render_framework_gaps: real .project/framework-gaps.json (array_key=gaps divergence)", () => {
		const env = makeEnv();
		const data = loadProjectBlock("framework-gaps.json") as { gaps: Array<{ id: string }> };
		assert.ok(Array.isArray(data.gaps) && data.gaps.length > 0, "fixture: framework-gaps.json non-empty");
		const result = renderDelegator(env, "render_framework_gaps", data);
		assertLens4(result, "Framework Gaps", data.gaps[0].id, "render_framework_gaps");
	});

	it("render_layer_plans: real .project/layer-plans.json (array_key=plans divergence)", () => {
		const env = makeEnv();
		const data = loadProjectBlock("layer-plans.json") as { plans: Array<{ id: string }> };
		assert.ok(Array.isArray(data.plans) && data.plans.length > 0, "fixture: layer-plans.json non-empty");
		const result = renderDelegator(env, "render_layer_plans", data);
		assertLens4(result, "Layer Restructure Plans", data.plans[0].id, "render_layer_plans");
	});

	it("render_research: real .project/research.json", () => {
		const env = makeEnv();
		const data = loadProjectBlock("research.json") as { research: Array<{ id: string }> };
		assert.ok(Array.isArray(data.research) && data.research.length > 0, "fixture: research.json non-empty");
		const result = renderDelegator(env, "render_research", data);
		assertLens4(result, "Research", data.research[0].id, "render_research");
	});

	it("render_spec_reviews: real .project/spec-reviews.json (array_key=reviews divergence)", () => {
		const env = makeEnv();
		const data = loadProjectBlock("spec-reviews.json") as { reviews: Array<{ id: string }> };
		assert.ok(Array.isArray(data.reviews) && data.reviews.length > 0, "fixture: spec-reviews.json non-empty");
		const result = renderDelegator(env, "render_spec_reviews", data);
		assertLens4(result, "Spec Reviews", data.reviews[0].id, "render_spec_reviews");
	});
});
