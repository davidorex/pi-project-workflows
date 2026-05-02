/**
 * Per-item macro tests: render_task (Plan 8, Wave 4).
 *
 * Cross-block reference fields: depends_on (other task IDs), verification
 * (single verification ID, not array).
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

const TASKS_MACRO_PATH = itemMacroPath("tasks");

function renderItem(idIndex: Map<string, FixtureItemLocation>, t: Record<string, unknown>, depth = 0): string {
	return renderItemMacro(makeRendererTestEnv(idIndex, { tasks: TASKS_MACRO_PATH }), "tasks", t, depth);
}

describe("render_task macro", () => {
	it("case 1: required fields rendered", () => {
		const t = { id: "TASK-001", description: "Implement macros", status: "in-progress" };
		const out = renderItem(new Map(), t, 0);
		assert.match(out, /\*\*TASK-001\*\*/);
		assert.match(out, /\[in-progress\]/);
		assert.match(out, /Implement macros/);
		assert.doesNotMatch(out, /\bundefined\b/);
	});

	it("case 2: optional fields — phase, files, criteria, notes, assigned_agent", () => {
		const t = {
			id: "TASK-002",
			description: "Wire up registry",
			status: "completed",
			phase: 2,
			files: ["src/registry.ts", "src/index.ts"],
			acceptance_criteria: ["builds clean", "tests green"],
			assigned_agent: "implementer",
			notes: "Block on Plan 1",
			verification: "VER-001",
		};
		const out = renderItem(new Map(), t, 0);
		assert.match(out, /\(phase 2\)/);
		assert.match(out, /files: src\/registry\.ts, src\/index\.ts/);
		assert.match(out, /Criteria: builds clean; tests green/);
		assert.match(out, /Assigned agent: implementer/);
		assert.match(out, /Notes: Block on Plan 1/);
		assert.match(out, /Verification: VER-001/);
	});

	it("case 3: depth=0 emits bare IDs for depends_on and verification", () => {
		const t = {
			id: "TASK-003",
			description: "with deps",
			status: "planned",
			depends_on: ["TASK-001", "TASK-002"],
			verification: "VER-001",
		};
		const idIndex = buildFixtureIdIndex({
			tasks: [
				{ id: "TASK-001", description: "leak A" },
				{ id: "TASK-002", description: "leak B" },
			],
		});
		const out = renderItem(idIndex, t, 0);
		assert.match(out, /Depends on:.*TASK-001/);
		assert.match(out, /TASK-002/);
		assert.match(out, /Verification: VER-001/);
		assert.doesNotMatch(out, /leak A/);
		assert.doesNotMatch(out, /leak B/);
	});

	it("case 3b: depth=1 inlines depends_on through render_task (sibling self-recursion)", () => {
		const t1 = {
			id: "TASK-001",
			description: "outer",
			status: "planned",
			depends_on: ["TASK-100"],
		};
		const t100 = {
			id: "TASK-100",
			description: "INNER-BODY",
			status: "completed",
		};
		const idIndex = buildFixtureIdIndex({ tasks: [t1, t100] });
		const out = renderItem(idIndex, t1, 1);
		assert.match(out, /INNER-BODY/);
	});

	it("case 4: cycle terminates — TASK-001 depends_on TASK-002, TASK-002 depends_on TASK-001", () => {
		const t1 = { id: "TASK-001", description: "a", status: "planned", depends_on: ["TASK-002"] };
		const t2 = { id: "TASK-002", description: "b", status: "planned", depends_on: ["TASK-001"] };
		const idIndex = buildFixtureIdIndex({ tasks: [t1, t2] });
		const out = renderItem(idIndex, t1, 5);
		assert.match(out, /\[cycle: TASK-00[12]\]/);
	});

	it("case 5: empty depends_on renders '(none)'", () => {
		const t = {
			id: "TASK-001",
			description: "empty",
			status: "planned",
			depends_on: [],
		};
		const out = renderItem(new Map(), t, 0);
		assert.match(out, /Depends on:.*\(none\)/);
	});

	it("case 6: whole-block derived view — render_tasks maps render_task over data.tasks", () => {
		const data = {
			tasks: [
				{ id: "TASK-001", description: "first", status: "planned" },
				{ id: "TASK-002", description: "second", status: "in-progress" },
			],
		};
		const env = makeRendererTestEnv(new Map(), {});
		const wholeOut = renderWholeBlockMacro(env, "render_tasks", data);
		assert.match(wholeOut, /## Tasks/);
		assert.match(wholeOut, /\*\*TASK-001\*\*/);
		assert.match(wholeOut, /\*\*TASK-002\*\*/);

		const item1Out = renderItem(new Map(), data.tasks[0]!, 0).trim();
		assert.ok(wholeOut.includes(item1Out.split("\n")[0] ?? ""));
	});
});
