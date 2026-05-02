/**
 * Per-item macro tests: render_requirement (Plan 8, Wave 4).
 *
 * Cross-block reference fields: traces_to (phase/task IDs) and depends_on
 * (other requirement IDs).
 *
 * Setup wiring (Nunjucks env, fixture id-index, per-item / whole-block render
 * helpers) lives in `./test-helpers.js` — every render-*.test.ts shares the
 * same harness so the per-file body holds only the kind-specific assertions.
 */
import assert from "node:assert";
import { describe, it } from "node:test";
import {
	buildFixtureIdIndex,
	type FixtureItemLocation,
	itemMacroPath,
	makeRendererTestEnv,
	renderItemMacro,
	renderWholeBlockMacro,
} from "./test-helpers.js";

const REQUIREMENTS_MACRO_PATH = itemMacroPath("requirements");

function renderItem(
	idIndex: Map<string, FixtureItemLocation>,
	availableMacros: Record<string, string>,
	req: Record<string, unknown>,
	depth = 0,
): string {
	return renderItemMacro(makeRendererTestEnv(idIndex, availableMacros), "requirements", req, depth);
}

describe("render_requirement macro", () => {
	it("case 1: required fields rendered", () => {
		const req = {
			id: "REQ-001",
			description: "Must produce valid JSON",
			type: "functional",
			status: "accepted",
			priority: "must",
		};
		const out = renderItem(new Map(), {}, req, 0);
		assert.match(out, /\*\*REQ-001\*\*/);
		assert.match(out, /\[must\]/);
		assert.match(out, /functional, accepted/);
		assert.match(out, /Must produce valid JSON/);
		assert.doesNotMatch(out, /\bundefined\b/);
	});

	it("case 2: optional fields rendered — acceptance_criteria, source", () => {
		const req = {
			id: "REQ-002",
			description: "Optional path",
			type: "functional",
			status: "proposed",
			priority: "should",
			acceptance_criteria: ["criterion A", "criterion B"],
			source: "agent",
		};
		const out = renderItem(new Map(), {}, req, 0);
		assert.match(out, /Criteria: criterion A; criterion B/);
		assert.match(out, /Source: agent/);
	});

	it("case 3: depth=0 emits bare IDs for traces_to and depends_on", () => {
		const req = {
			id: "REQ-001",
			description: "with refs",
			type: "functional",
			status: "accepted",
			priority: "must",
			traces_to: ["TASK-001", "TASK-002"],
			depends_on: ["REQ-100"],
		};
		const idIndex = buildFixtureIdIndex({
			tasks: [{ id: "TASK-001", description: "should not appear" }],
			requirements: [{ id: "REQ-100", description: "should not appear either" }],
		});
		const out = renderItem(idIndex, { requirements: REQUIREMENTS_MACRO_PATH }, req, 0);
		assert.match(out, /Traces to:.*TASK-001.*TASK-002/, "bare task IDs");
		assert.match(out, /Depends on:.*REQ-100/, "bare requirement ID");
		assert.doesNotMatch(out, /should not appear/, "depth=0 must not inline referenced bodies");
	});

	it("case 3b: depth=1 inlines depends_on through render_requirement (sibling self-recursion)", () => {
		const req1 = {
			id: "REQ-001",
			description: "outer",
			type: "functional",
			status: "accepted",
			priority: "must",
			depends_on: ["REQ-100"],
		};
		const req100 = {
			id: "REQ-100",
			description: "inner-body-text",
			type: "non-functional",
			status: "implemented",
			priority: "should",
		};
		const idIndex = buildFixtureIdIndex({
			requirements: [req1, req100],
		});
		const out = renderItem(idIndex, { requirements: REQUIREMENTS_MACRO_PATH }, req1, 1);
		assert.match(out, /inner-body-text/, "REQ-100 body must be inlined at depth=1");
	});

	it("case 3c: depth=1 with traces_to but no tasks macro → fallback marker (Plan 7/render_task absent at this test boundary)", () => {
		// This test deliberately models the Plan 8 / Plan 7 isolation: the
		// available-macros table only registers requirements (Plan 8 owns).
		// tasks ALSO ships in Plan 8 — but to verify the fallback marker
		// pathway works we exclude it from the available map.
		const req = {
			id: "REQ-001",
			description: "with traces",
			type: "functional",
			status: "accepted",
			priority: "must",
			traces_to: ["TASK-001"],
		};
		const idIndex = buildFixtureIdIndex({
			tasks: [{ id: "TASK-001", description: "irrelevant" }],
		});
		const out = renderItem(idIndex, { requirements: REQUIREMENTS_MACRO_PATH }, req, 1);
		assert.match(out, /\[unrendered: tasks\/TASK-001\]/);
	});

	it("case 4: cycle terminates — REQ-001 depends_on REQ-002, REQ-002 depends_on REQ-001", () => {
		const req1 = {
			id: "REQ-001",
			description: "first",
			type: "functional",
			status: "accepted",
			priority: "must",
			depends_on: ["REQ-002"],
		};
		const req2 = {
			id: "REQ-002",
			description: "second",
			type: "functional",
			status: "accepted",
			priority: "must",
			depends_on: ["REQ-001"],
		};
		const idIndex = buildFixtureIdIndex({ requirements: [req1, req2] });
		const out = renderItem(idIndex, { requirements: REQUIREMENTS_MACRO_PATH }, req1, 5);
		assert.match(out, /\[cycle: REQ-00[12]\]/, "expected cycle marker on the back-edge");
	});

	it("case 5: empty arrays render '(none)'", () => {
		const req = {
			id: "REQ-001",
			description: "empty arrays",
			type: "functional",
			status: "accepted",
			priority: "must",
			traces_to: [],
			depends_on: [],
		};
		const out = renderItem(new Map(), {}, req, 0);
		assert.match(out, /Traces to:.*\(none\)/);
		assert.match(out, /Depends on:.*\(none\)/);
	});

	it("case 6: whole-block derived view — render_requirements maps render_requirement over data.requirements", () => {
		const data = {
			requirements: [
				{ id: "REQ-001", description: "first", type: "functional", status: "accepted", priority: "must" },
				{ id: "REQ-002", description: "second", type: "non-functional", status: "proposed", priority: "should" },
			],
		};
		const env = makeRendererTestEnv(new Map(), {});
		const wholeOut = renderWholeBlockMacro(env, "render_requirements", data);
		const item1Out = renderItem(new Map(), {}, data.requirements[0]!, 0);
		const item2Out = renderItem(new Map(), {}, data.requirements[1]!, 0);
		assert.match(wholeOut, /## Requirements/);
		assert.ok(wholeOut.includes(item1Out.trim().split("\n")[0] ?? ""), "first item rendering present");
		assert.ok(wholeOut.includes("REQ-001"));
		assert.ok(wholeOut.includes("REQ-002"));
		assert.ok(item1Out.includes("first"));
		assert.ok(item2Out.includes("second"));

		// Empty array → no output.
		assert.strictEqual(renderWholeBlockMacro(env, "render_requirements", { requirements: [] }).trim(), "");
	});
});
