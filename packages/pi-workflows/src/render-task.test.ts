/**
 * Per-item macro tests: render_task (Plan 8, Wave 4).
 *
 * Cross-block reference fields: depends_on (other task IDs), verification
 * (single verification ID, not array).
 */
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import nunjucks from "nunjucks";

const TEMPLATES_DIR = path.resolve(import.meta.dirname, "..", "templates");
const TASKS_MACRO_PATH = path.resolve(TEMPLATES_DIR, "items", "tasks.md");

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

		const macroNameMap: Record<string, string> = {
			tasks: "render_task",
			requirements: "render_requirement",
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

	return env;
}

function renderItem(env: nunjucks.Environment, t: Record<string, unknown>, depth = 0): string {
	const tpl = `{% from "items/tasks.md" import render_task %}{{ render_task(t, depth) }}`;
	return env.renderString(tpl, { t, depth });
}

describe("render_task macro", () => {
	it("case 1: required fields rendered", () => {
		const t = { id: "TASK-001", description: "Implement macros", status: "in-progress" };
		const env = makeEnv(new Map(), {});
		const out = renderItem(env, t, 0);
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
		const env = makeEnv(new Map(), {});
		const out = renderItem(env, t, 0);
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
		const env = makeEnv(idIndex, { tasks: TASKS_MACRO_PATH });
		const out = renderItem(env, t, 0);
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
		const env = makeEnv(idIndex, { tasks: TASKS_MACRO_PATH });
		const out = renderItem(env, t1, 1);
		assert.match(out, /INNER-BODY/);
	});

	it("case 4: cycle terminates — TASK-001 depends_on TASK-002, TASK-002 depends_on TASK-001", () => {
		const t1 = { id: "TASK-001", description: "a", status: "planned", depends_on: ["TASK-002"] };
		const t2 = { id: "TASK-002", description: "b", status: "planned", depends_on: ["TASK-001"] };
		const idIndex = buildFixtureIdIndex({ tasks: [t1, t2] });
		const env = makeEnv(idIndex, { tasks: TASKS_MACRO_PATH });
		const out = renderItem(env, t1, 5);
		assert.match(out, /\[cycle: TASK-00[12]\]/);
	});

	it("case 5: empty depends_on renders '(none)'", () => {
		const t = {
			id: "TASK-001",
			description: "empty",
			status: "planned",
			depends_on: [],
		};
		const env = makeEnv(new Map(), {});
		const out = renderItem(env, t, 0);
		assert.match(out, /Depends on:.*\(none\)/);
	});

	it("case 6: whole-block derived view — render_tasks maps render_task over data.tasks", () => {
		const data = {
			tasks: [
				{ id: "TASK-001", description: "first", status: "planned" },
				{ id: "TASK-002", description: "second", status: "in-progress" },
			],
		};
		const env = makeEnv(new Map(), {});
		const wholeTpl = `{% from "shared/macros.md" import render_tasks %}{{ render_tasks(data) }}`;
		const wholeOut = env.renderString(wholeTpl, { data });
		assert.match(wholeOut, /## Tasks/);
		assert.match(wholeOut, /\*\*TASK-001\*\*/);
		assert.match(wholeOut, /\*\*TASK-002\*\*/);

		const item1Out = renderItem(env, data.tasks[0]!, 0).trim();
		assert.ok(wholeOut.includes(item1Out.split("\n")[0] ?? ""));
	});
});
