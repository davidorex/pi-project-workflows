/**
 * Per-item macro tests: render_issue (Plan 8, Wave 4).
 *
 * The issues schema has no cross-block reference fields (resolved_by is
 * free-form text — commit SHA or message reference, not a project-block
 * ID). Cycle and recursion cases do not apply.
 *
 * Setup wiring (Nunjucks env, fixture id-index, per-item / whole-block render
 * helpers) lives in `./test-helpers.js` — every render-*.test.ts shares the
 * same harness so the per-file body holds only the kind-specific assertions.
 */
import assert from "node:assert";
import { describe, it } from "node:test";
import { buildFixtureIdIndex, makeRendererTestEnv, renderItemMacro, renderWholeBlockMacro } from "./test-helpers.js";

function renderItem(i: Record<string, unknown>, depth = 0): string {
	return renderItemMacro(makeRendererTestEnv(buildFixtureIdIndex({}), {}), "issues", i, depth);
}

function renderWhole(data: unknown): string {
	return renderWholeBlockMacro(makeRendererTestEnv(buildFixtureIdIndex({}), {}), "render_issues", data);
}

describe("render_issue macro", () => {
	it("case 1: required fields rendered", () => {
		const i = {
			id: "issue-001",
			title: "Template underuse",
			body: "Only analyzers use composition",
			location: "templates/",
			status: "open",
			category: "issue",
			priority: "high",
			package: "pi-workflows",
		};
		const out = renderItem(i, 0);
		assert.match(out, /\*\*issue-001\*\*/);
		assert.match(out, /\[high, open\]/);
		assert.match(out, /Template underuse/);
		assert.match(out, /Only analyzers use composition/);
		assert.match(out, /\(pi-workflows\)/);
		assert.match(out, /Category: issue/);
		assert.doesNotMatch(out, /\bundefined\b/);
	});

	it("case 2: optional fields — source, resolved_by", () => {
		const i = {
			id: "issue-002",
			title: "F-019",
			body: "Resolved fragility",
			location: "packages/pi-jit-agents/src/jit-runtime.ts:120",
			status: "resolved",
			category: "primitive",
			priority: "high",
			package: "pi-jit-agents",
			source: "monitor",
			resolved_by: "abc1234",
		};
		const out = renderItem(i, 0);
		assert.match(out, /Source: monitor/);
		assert.match(out, /Resolved by: abc1234/);
	});

	it("case 6: whole-block derived view — render_issues maps render_issue over data.issues", () => {
		const data = {
			issues: [
				{
					id: "issue-001",
					title: "first",
					body: "first body",
					location: "a.ts:1",
					status: "open",
					category: "issue",
					priority: "high",
					package: "pkg-a",
				},
				{
					id: "issue-002",
					title: "second",
					body: "second body",
					location: "b.ts:2",
					status: "open",
					category: "issue",
					priority: "low",
					package: "pkg-b",
				},
			],
		};
		const wholeOut = renderWhole(data);
		assert.match(wholeOut, /## Issues/);
		assert.match(wholeOut, /\*\*issue-001\*\*/);
		assert.match(wholeOut, /\*\*issue-002\*\*/);

		const item1Out = renderItem(data.issues[0]!, 0).trim();
		assert.ok(wholeOut.includes(item1Out.split("\n")[0] ?? ""));

		assert.strictEqual(renderWhole(null).trim(), "");
	});
});
