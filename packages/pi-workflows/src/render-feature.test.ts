/**
 * Per-item macro tests: render_feature (Plan 7, Wave 4).
 *
 * Mirrors render-decision.test.ts. Stories and tasks are nested sub-shapes
 * on the feature schema (not separate block kinds), so they are rendered
 * inline and never recursed via render_recursive — Plan 7 deliberately does
 * NOT author render_story / render_task.
 *
 * Cross-block reference fields recursing on depth: dependencies, gates,
 * blocks_resolved, decisions.
 */
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import nunjucks from "nunjucks";

const FEATURES_MACRO_PATH = path.resolve(import.meta.dirname, "..", "templates", "items", "features.md");
const DECISIONS_MACRO_PATH = path.resolve(import.meta.dirname, "..", "templates", "items", "decisions.md");

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
	const env = new nunjucks.Environment(undefined, { autoescape: false, throwOnUndefined: false });

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

		const macroName = `render_${blockName.replace(/-/g, "_")}`;
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

function renderFeature(env: nunjucks.Environment, item: Record<string, unknown>, depth: number): string {
	const macroSource = fs.readFileSync(FEATURES_MACRO_PATH, "utf-8");
	const inline = `${macroSource}\n{{ render_feature(item, depth) }}`;
	return env.renderString(inline, { item, depth });
}

function makeFullFeature(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
	return {
		id: "FEAT-001",
		title: "Consumer migration arc",
		status: "in-progress",
		layer: "L3",
		description: "Migrate consumer extensions to pi-jit-agents.",
		acceptance_criteria: ["both consumers import normalizeToolChoice from package barrel"],
		stories: [
			{
				id: "story-1",
				title: "First story",
				status: "in-progress",
				tasks: [{ id: "task-1", title: "Sub-task A", status: "todo" }],
			},
		],
		findings: [],
		dependencies: ["DEC-0001"],
		created_by: "agent",
		created_at: "2026-04-25T12:00:00Z",
		...overrides,
	};
}

describe("render_feature macro", () => {
	it("case 1: depth=0 emits bare IDs for cross-block references", () => {
		const feat = makeFullFeature({
			dependencies: ["DEC-0001"],
			gates: ["FGAP-001"],
			blocks_resolved: ["ISSUE-001"],
			decisions: ["DEC-0002"],
		});
		const idIndex = buildFixtureIdIndex({
			features: [feat],
			decisions: [
				{ id: "DEC-0001", title: "dep should not appear", status: "enacted" },
				{ id: "DEC-0002", title: "decision should not appear", status: "enacted" },
			],
			"framework-gaps": [{ id: "FGAP-001", title: "gap should not appear" }],
			issues: [{ id: "ISSUE-001", title: "issue should not appear" }],
		});
		const env = makeEnv(idIndex, { features: FEATURES_MACRO_PATH, decisions: DECISIONS_MACRO_PATH });

		const out = renderFeature(env, feat, 0);

		assert.match(out, /\bDEC-0001\b/, "expected bare DEC-0001");
		assert.match(out, /\bFGAP-001\b/, "expected bare FGAP-001");
		assert.match(out, /\bISSUE-001\b/, "expected bare ISSUE-001");
		assert.match(out, /\bDEC-0002\b/, "expected bare DEC-0002");
		assert.doesNotMatch(out, /should not appear/, "depth=0 must not render referenced item bodies");
	});

	it("case 2: depth=1 inlines via render_recursive into render_decision; absent sibling kinds → fallback marker", () => {
		const feat = makeFullFeature({
			dependencies: ["DEC-0001"],
			gates: ["FGAP-001"], // no render_framework_gap registered → fallback
		});
		const dec = {
			id: "DEC-0001",
			title: "Dependency decision title",
			status: "enacted",
			context: "ctx",
			decision: "decision body text",
			consequences: ["c1"],
			created_by: "agent",
			created_at: "2026-04-25T00:00:00Z",
			related_findings: ["whatever"],
		};
		const idIndex = buildFixtureIdIndex({
			features: [feat],
			decisions: [dec],
			"framework-gaps": [{ id: "FGAP-001", title: "should not leak" }],
		});
		const env = makeEnv(idIndex, { features: FEATURES_MACRO_PATH, decisions: DECISIONS_MACRO_PATH });

		const out = renderFeature(env, feat, 1);

		assert.match(out, /Title: Dependency decision title/, "DEC-0001 body inlined via render_decision");
		assert.match(out, /decision body text/, "DEC-0001 decision body inlined");
		assert.match(out, /\[unrendered: framework-gaps\/FGAP-001\]/, "absent framework-gaps macro → fallback marker");
		assert.doesNotMatch(out, /should not leak/, "fallback path must not leak referenced item body");
	});

	it("case 3: depth=2 lets the inlined decision render its own cross-refs at depth=1", () => {
		const decInner = {
			id: "DEC-0009",
			title: "Inner decision",
			status: "enacted",
			context: "inner ctx",
			decision: "inner body",
			consequences: ["ic"],
			created_by: "agent",
			created_at: "2026-04-20T00:00:00Z",
			related_findings: ["whatever"],
		};
		const decOuter = {
			id: "DEC-0001",
			title: "Outer decision",
			status: "enacted",
			context: "outer ctx",
			decision: "outer body",
			consequences: ["oc"],
			created_by: "agent",
			created_at: "2026-04-25T00:00:00Z",
			related_findings: ["whatever"],
			supersedes: ["DEC-0009"],
		};
		const feat = makeFullFeature({ dependencies: ["DEC-0001"] });
		const idIndex = buildFixtureIdIndex({
			features: [feat],
			decisions: [decOuter, decInner],
		});
		const env = makeEnv(idIndex, { features: FEATURES_MACRO_PATH, decisions: DECISIONS_MACRO_PATH });

		const out = renderFeature(env, feat, 2);

		assert.match(out, /Title: Outer decision/, "outer decision body inlined");
		assert.match(out, /Title: Inner decision/, "inner decision inlined via supersedes (chain length 2)");
		assert.match(out, /inner body/, "inner decision body content present");
	});

	it("case 4: cycle terminates with [cycle: …] marker on back-edge", () => {
		const decA = {
			id: "DEC-0001",
			title: "A",
			status: "enacted",
			context: "ctxA",
			decision: "bodyA",
			consequences: ["ca"],
			created_by: "agent",
			created_at: "2026-04-25T00:00:00Z",
			related_findings: ["whatever"],
			supersedes: ["DEC-0002"],
		};
		const decB = {
			id: "DEC-0002",
			title: "B",
			status: "enacted",
			context: "ctxB",
			decision: "bodyB",
			consequences: ["cb"],
			created_by: "agent",
			created_at: "2026-04-25T00:00:00Z",
			related_findings: ["whatever"],
			supersedes: ["DEC-0001"], // cycle
		};
		const feat = makeFullFeature({ dependencies: ["DEC-0001"] });
		const idIndex = buildFixtureIdIndex({
			features: [feat],
			decisions: [decA, decB],
		});
		const env = makeEnv(idIndex, { features: FEATURES_MACRO_PATH, decisions: DECISIONS_MACRO_PATH });

		const out = renderFeature(env, feat, 5);

		assert.match(out, /Title: A/);
		assert.match(out, /Title: B/);
		assert.match(out, /\[cycle: DEC-000[12]\]/, "cycle marker must terminate the back-edge");
	});

	it("case 5: optional fields absent from output when undefined (no orphan labels, no 'undefined')", () => {
		const minimal = {
			id: "FEAT-099",
			title: "minimal",
			status: "proposed",
			layer: "L3",
			description: "minimal desc",
			acceptance_criteria: ["ac"],
			stories: [],
			findings: [],
			created_by: "agent",
			created_at: "2026-05-02T00:00:00Z",
		};
		const idIndex = buildFixtureIdIndex({ features: [minimal] });
		const env = makeEnv(idIndex, { features: FEATURES_MACRO_PATH });

		const out = renderFeature(env, minimal, 0);

		assert.match(out, /ID: FEAT-099/);
		assert.match(out, /Title: minimal/);
		assert.match(out, /Status: proposed/);
		assert.match(out, /Layer: L3/);
		assert.doesNotMatch(out, /Motivation:/, "absent motivation must not render label");
		assert.doesNotMatch(out, /Modified by:/, "absent modified_by must not render label");
		assert.doesNotMatch(out, /Modified at:/, "absent modified_at must not render label");
		assert.doesNotMatch(out, /Approved by:/, "absent approved_by must not render label");
		assert.doesNotMatch(out, /Approved at:/, "absent approved_at must not render label");
		assert.doesNotMatch(out, /Dependencies:/, "absent dependencies must not render label");
		assert.doesNotMatch(out, /Gates:/, "absent gates must not render label");
		assert.doesNotMatch(out, /Blocks resolved:/, "absent blocks_resolved must not render label");
		assert.doesNotMatch(out, /Decisions:/, "absent decisions must not render label");
		assert.doesNotMatch(out, /\bundefined\b/, "no field should render the literal string 'undefined'");
	});

	it("case 6: empty-array convention — present-but-empty arrays render '(none)'", () => {
		const feat = makeFullFeature({
			dependencies: [],
			gates: [],
			blocks_resolved: [],
			decisions: [],
			acceptance_criteria: [],
			stories: [],
			findings: [],
		});
		const idIndex = buildFixtureIdIndex({ features: [feat] });
		const env = makeEnv(idIndex, { features: FEATURES_MACRO_PATH });

		const out = renderFeature(env, feat, 0);

		assert.match(out, /Acceptance criteria:[\s\S]*?\(none\)/, "empty acceptance_criteria must render '(none)'");
		assert.match(out, /Dependencies:[\s\S]*?\(none\)/, "empty dependencies must render '(none)'");
		assert.match(out, /Gates:[\s\S]*?\(none\)/, "empty gates must render '(none)'");
		assert.match(out, /Blocks resolved:[\s\S]*?\(none\)/, "empty blocks_resolved must render '(none)'");
		assert.match(out, /Decisions:[\s\S]*?\(none\)/, "empty decisions must render '(none)'");
		assert.match(out, /Stories:[\s\S]*?\(none\)/, "empty stories must render '(none)'");
		assert.match(out, /Findings:[\s\S]*?\(none\)/, "empty findings must render '(none)'");
	});
});
