/**
 * Per-item macro tests: render_feature (Plan 7, Wave 4).
 *
 * Stories and tasks are nested sub-shapes on the feature schema (not
 * separate block kinds), so they are rendered inline and never recursed
 * via render_recursive — Plan 7 deliberately does NOT author render_story
 * / render_task.
 *
 * Cross-block reference fields recursing on depth: dependencies, gates,
 * blocks_resolved, decisions.
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
} from "./test-helpers.js";

const FEATURES_MACRO_PATH = itemMacroPath("features");
const DECISIONS_MACRO_PATH = itemMacroPath("decisions");

function renderFeature(
	idIndex: Map<string, FixtureItemLocation>,
	availableMacros: Record<string, string>,
	item: Record<string, unknown>,
	depth: number,
): string {
	return renderItemMacro(makeRendererTestEnv(idIndex, availableMacros), "features", item, depth);
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

		const out = renderFeature(idIndex, { features: FEATURES_MACRO_PATH, decisions: DECISIONS_MACRO_PATH }, feat, 0);

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

		const out = renderFeature(idIndex, { features: FEATURES_MACRO_PATH, decisions: DECISIONS_MACRO_PATH }, feat, 1);

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

		const out = renderFeature(idIndex, { features: FEATURES_MACRO_PATH, decisions: DECISIONS_MACRO_PATH }, feat, 2);

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

		const out = renderFeature(idIndex, { features: FEATURES_MACRO_PATH, decisions: DECISIONS_MACRO_PATH }, feat, 5);

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

		const out = renderFeature(idIndex, { features: FEATURES_MACRO_PATH }, minimal, 0);

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

		const out = renderFeature(idIndex, { features: FEATURES_MACRO_PATH }, feat, 0);

		assert.match(out, /Acceptance criteria:[\s\S]*?\(none\)/, "empty acceptance_criteria must render '(none)'");
		assert.match(out, /Dependencies:[\s\S]*?\(none\)/, "empty dependencies must render '(none)'");
		assert.match(out, /Gates:[\s\S]*?\(none\)/, "empty gates must render '(none)'");
		assert.match(out, /Blocks resolved:[\s\S]*?\(none\)/, "empty blocks_resolved must render '(none)'");
		assert.match(out, /Decisions:[\s\S]*?\(none\)/, "empty decisions must render '(none)'");
		assert.match(out, /Stories:[\s\S]*?\(none\)/, "empty stories must render '(none)'");
		assert.match(out, /Findings:[\s\S]*?\(none\)/, "empty findings must render '(none)'");
	});
});
