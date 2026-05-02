/**
 * Per-item macro tests: render_requirement (Plan 8, Wave 4).
 *
 * Wiring mirrors render-decision.test.ts. Cross-block reference fields:
 * traces_to (phase/task IDs) and depends_on (other requirement IDs).
 * Plan 8 tests must NOT depend on Plan 7's macros existing — sibling
 * recursion targets are limited to render_decision (Plan 6) and the
 * per-item macros Plan 8 itself ships (requirements among them, so a
 * requirement → requirement recursion is testable).
 */
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import nunjucks from "nunjucks";

const TEMPLATES_DIR = path.resolve(import.meta.dirname, "..", "templates");
const REQUIREMENTS_MACRO_PATH = path.resolve(TEMPLATES_DIR, "items", "requirements.md");

interface ItemLocation {
	block: string;
	arrayKey: string;
	item: Record<string, unknown>;
}

function buildFixtureIdIndex(blocks: Record<string, Array<Record<string, unknown>>>): Map<string, ItemLocation> {
	const index = new Map<string, ItemLocation>();
	for (const [block, items] of Object.entries(blocks)) {
		for (const item of items) {
			const id = item.id;
			if (typeof id === "string") {
				index.set(id, { block, arrayKey: block, item });
			}
		}
	}
	return index;
}

function makeEnv(idIndex: Map<string, ItemLocation>, availableMacros: Record<string, string>): nunjucks.Environment {
	const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(TEMPLATES_DIR), {
		autoescape: false,
		throwOnUndefined: false,
	});

	env.addGlobal("resolve", (id: unknown): ItemLocation | null => {
		if (typeof id !== "string" || id.length === 0) return null;
		return idIndex.get(id) ?? null;
	});

	const visited = new Set<string>();
	env.addGlobal("render_recursive", (loc: unknown, depth: unknown): string => {
		if (!loc || typeof loc !== "object") return "";
		const location = loc as ItemLocation;
		const itemId = (location.item as { id?: unknown })?.id;
		const idStr = typeof itemId === "string" ? itemId : "";
		const blockName = typeof location.block === "string" ? location.block : "?";

		if (idStr.length > 0 && visited.has(idStr)) {
			return `[cycle: ${idStr}]`;
		}

		const macroPath = availableMacros[blockName];
		if (!macroPath) {
			return `[unrendered: ${blockName}/${idStr}]`;
		}

		// Per-item macros use canonical names: requirements → render_requirement (singular).
		const macroNameMap: Record<string, string> = {
			requirements: "render_requirement",
			tasks: "render_task",
			issues: "render_issue",
		};
		const macroName = macroNameMap[blockName] ?? `render_${blockName.replace(/-/g, "_")}`;
		const depthNum = typeof depth === "number" && Number.isFinite(depth) ? depth : 0;
		if (idStr.length > 0) visited.add(idStr);
		try {
			const macroSource = fs.readFileSync(macroPath, "utf-8");
			const inline = `${macroSource}\n{{ ${macroName}(item, depth) }}`;
			return env.renderString(inline, { item: location.item, depth: depthNum });
		} catch (err) {
			return `[render_error: ${blockName}/${idStr}: ${err instanceof Error ? err.message : String(err)}]`;
		} finally {
			if (idStr.length > 0) visited.delete(idStr);
		}
	});

	env.addGlobal("enforceBudget", (rendered: unknown): string =>
		typeof rendered === "string" ? rendered : rendered === undefined || rendered === null ? "" : String(rendered),
	);

	return env;
}

function renderItem(env: nunjucks.Environment, req: Record<string, unknown>, depth = 0): string {
	const tpl = `{% from "items/requirements.md" import render_requirement %}{{ render_requirement(req, depth) }}`;
	return env.renderString(tpl, { req, depth });
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
		const env = makeEnv(new Map(), {});
		const out = renderItem(env, req, 0);
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
		const env = makeEnv(new Map(), {});
		const out = renderItem(env, req, 0);
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
		const env = makeEnv(idIndex, { requirements: REQUIREMENTS_MACRO_PATH });
		const out = renderItem(env, req, 0);
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
		const env = makeEnv(idIndex, { requirements: REQUIREMENTS_MACRO_PATH });
		const out = renderItem(env, req1, 1);
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
		const env = makeEnv(idIndex, { requirements: REQUIREMENTS_MACRO_PATH });
		const out = renderItem(env, req, 1);
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
		const env = makeEnv(idIndex, { requirements: REQUIREMENTS_MACRO_PATH });
		const out = renderItem(env, req1, 5);
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
		const env = makeEnv(new Map(), {});
		const out = renderItem(env, req, 0);
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
		const env = makeEnv(new Map(), {});
		const wholeTpl = `{% from "shared/macros.md" import render_requirements %}{{ render_requirements(data) }}`;
		const wholeOut = env.renderString(wholeTpl, { data });
		const item1Out = renderItem(env, data.requirements[0]!, 0);
		const item2Out = renderItem(env, data.requirements[1]!, 0);
		assert.match(wholeOut, /## Requirements/);
		assert.ok(wholeOut.includes(item1Out.trim().split("\n")[0] ?? ""), "first item rendering present");
		assert.ok(wholeOut.includes("REQ-001"));
		assert.ok(wholeOut.includes("REQ-002"));
		assert.ok(item1Out.includes("first"));
		assert.ok(item2Out.includes("second"));

		// Empty array → no output.
		const emptyTpl = `{% from "shared/macros.md" import render_requirements %}{{ render_requirements(empty) }}`;
		assert.strictEqual(env.renderString(emptyTpl, { empty: { requirements: [] } }).trim(), "");
	});
});
