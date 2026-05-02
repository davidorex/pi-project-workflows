/**
 * Per-item macro tests: render_framework_gap (Plan 7, Wave 4).
 *
 * Mirrors render-decision.test.ts. Cross-block reference fields:
 * related_features, related_decisions, related_issues — all recurse on depth.
 *
 * Naming: macro is `render_framework_gap` (singular). The legacy `render_gap`
 * macro lives in templates/shared/macros.md and retires under Plan 8.
 */
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import nunjucks from "nunjucks";

const FRAMEWORK_GAPS_MACRO_PATH = path.resolve(import.meta.dirname, "..", "templates", "items", "framework-gaps.md");
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

function renderFrameworkGap(env: nunjucks.Environment, item: Record<string, unknown>, depth: number): string {
	const macroSource = fs.readFileSync(FRAMEWORK_GAPS_MACRO_PATH, "utf-8");
	const inline = `${macroSource}\n{{ render_framework_gap(item, depth) }}`;
	return env.renderString(inline, { item, depth });
}

function makeFullGap(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
	return {
		id: "FGAP-001",
		title: "Nested blocks",
		status: "identified",
		package: "pi-project",
		description: "Block schemas cannot express nested arrays.",
		evidence: [{ file: "schemas/x.json", lines: "10-20", reference: "demonstrates limit" }],
		impact: "Forces flat-only modeling.",
		proposed_resolution: "Extend AJV with subschema $ref support.",
		created_by: "agent",
		created_at: "2026-04-25T12:00:00Z",
		...overrides,
	};
}

describe("render_framework_gap macro", () => {
	it("case 1: depth=0 emits bare IDs for cross-block references", () => {
		const gap = makeFullGap({
			related_features: ["FEAT-001"],
			related_decisions: ["DEC-0001"],
			related_issues: ["ISSUE-001"],
		});
		const idIndex = buildFixtureIdIndex({
			"framework-gaps": [gap],
			features: [{ id: "FEAT-001", title: "should not appear" }],
			decisions: [{ id: "DEC-0001", title: "should not appear", status: "enacted" }],
			issues: [{ id: "ISSUE-001", title: "should not appear" }],
		});
		const env = makeEnv(idIndex, { "framework-gaps": FRAMEWORK_GAPS_MACRO_PATH, decisions: DECISIONS_MACRO_PATH });

		const out = renderFrameworkGap(env, gap, 0);

		assert.match(out, /\bFEAT-001\b/);
		assert.match(out, /\bDEC-0001\b/);
		assert.match(out, /\bISSUE-001\b/);
		assert.doesNotMatch(out, /should not appear/, "depth=0 must not render referenced item bodies");
	});

	it("case 2: depth=1 inlines via render_recursive into render_decision; absent sibling kinds → fallback marker", () => {
		const gap = makeFullGap({
			related_decisions: ["DEC-0001"],
			related_features: ["FEAT-001"], // no render_features registered → fallback
		});
		const dec = {
			id: "DEC-0001",
			title: "Related decision title",
			status: "enacted",
			context: "ctx",
			decision: "decision body text",
			consequences: ["c1"],
			created_by: "agent",
			created_at: "2026-04-25T00:00:00Z",
			related_findings: ["whatever"],
		};
		const idIndex = buildFixtureIdIndex({
			"framework-gaps": [gap],
			decisions: [dec],
			features: [{ id: "FEAT-001", title: "should not leak" }],
		});
		const env = makeEnv(idIndex, { "framework-gaps": FRAMEWORK_GAPS_MACRO_PATH, decisions: DECISIONS_MACRO_PATH });

		const out = renderFrameworkGap(env, gap, 1);

		assert.match(out, /Title: Related decision title/);
		assert.match(out, /decision body text/);
		assert.match(out, /\[unrendered: features\/FEAT-001\]/);
		assert.doesNotMatch(out, /should not leak/);
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
		const gap = makeFullGap({ related_decisions: ["DEC-0001"] });
		const idIndex = buildFixtureIdIndex({
			"framework-gaps": [gap],
			decisions: [decOuter, decInner],
		});
		const env = makeEnv(idIndex, { "framework-gaps": FRAMEWORK_GAPS_MACRO_PATH, decisions: DECISIONS_MACRO_PATH });

		const out = renderFrameworkGap(env, gap, 2);

		assert.match(out, /Title: Outer decision/);
		assert.match(out, /Title: Inner decision/);
		assert.match(out, /inner body/);
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
			supersedes: ["DEC-0001"],
		};
		const gap = makeFullGap({ related_decisions: ["DEC-0001"] });
		const idIndex = buildFixtureIdIndex({
			"framework-gaps": [gap],
			decisions: [decA, decB],
		});
		const env = makeEnv(idIndex, { "framework-gaps": FRAMEWORK_GAPS_MACRO_PATH, decisions: DECISIONS_MACRO_PATH });

		const out = renderFrameworkGap(env, gap, 5);

		assert.match(out, /Title: A/);
		assert.match(out, /Title: B/);
		assert.match(out, /\[cycle: DEC-000[12]\]/);
	});

	it("case 5: optional fields absent from output when undefined (no orphan labels, no 'undefined')", () => {
		const minimal = {
			id: "FGAP-099",
			title: "minimal",
			status: "identified",
			package: "pi-project",
			description: "minimal desc",
			evidence: [{ file: "x.ts", reference: "minimal evidence" }],
			impact: "low",
			proposed_resolution: "tbd",
			created_by: "agent",
			created_at: "2026-05-02T00:00:00Z",
		};
		const idIndex = buildFixtureIdIndex({ "framework-gaps": [minimal] });
		const env = makeEnv(idIndex, { "framework-gaps": FRAMEWORK_GAPS_MACRO_PATH });

		const out = renderFrameworkGap(env, minimal, 0);

		assert.match(out, /ID: FGAP-099/);
		assert.match(out, /Title: minimal/);
		assert.doesNotMatch(out, /Priority:/, "absent priority must not render label");
		assert.doesNotMatch(out, /^Layer:/m, "absent layer must not render label");
		assert.doesNotMatch(out, /Canonical vocabulary:/, "absent canonical_vocabulary must not render label");
		assert.doesNotMatch(out, /Closed by:/, "absent closed_by must not render label");
		assert.doesNotMatch(out, /Closed at:/, "absent closed_at must not render label");
		assert.doesNotMatch(out, /Related features:/, "absent related_features must not render label");
		assert.doesNotMatch(out, /Related decisions:/, "absent related_decisions must not render label");
		assert.doesNotMatch(out, /Related issues:/, "absent related_issues must not render label");
		assert.doesNotMatch(out, /\bundefined\b/);
	});

	it("case 6: empty-array convention — present-but-empty arrays render '(none)'", () => {
		const gap = makeFullGap({
			related_features: [],
			related_decisions: [],
			related_issues: [],
			evidence: [],
		});
		const idIndex = buildFixtureIdIndex({ "framework-gaps": [gap] });
		const env = makeEnv(idIndex, { "framework-gaps": FRAMEWORK_GAPS_MACRO_PATH });

		const out = renderFrameworkGap(env, gap, 0);

		assert.match(out, /Evidence:[\s\S]*?\(none\)/, "empty evidence must render '(none)'");
		assert.match(out, /Related features:[\s\S]*?\(none\)/);
		assert.match(out, /Related decisions:[\s\S]*?\(none\)/);
		assert.match(out, /Related issues:[\s\S]*?\(none\)/);
	});
});
