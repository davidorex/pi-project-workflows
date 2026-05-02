/**
 * Per-item macro tests: render_layer_plan (Plan 7, Wave 4).
 *
 * Cross-block reference fields: related_gaps, related_decisions,
 * related_features. Layers and migration phases are nested sub-shapes on the
 * plan schema; rendered inline, never recursed.
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

const LAYER_PLANS_MACRO_PATH = itemMacroPath("layer-plans");
const DECISIONS_MACRO_PATH = itemMacroPath("decisions");

function renderLayerPlan(
	idIndex: Map<string, FixtureItemLocation>,
	availableMacros: Record<string, string>,
	item: Record<string, unknown>,
	depth: number,
): string {
	return renderItemMacro(makeRendererTestEnv(idIndex, availableMacros), "layer-plans", item, depth);
}

function makeFullPlan(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
	return {
		id: "PLAN-001",
		title: "Muni five-layer restructure",
		status: "in-progress",
		model: "Muni five-layer",
		layers: [
			{
				id: "L1",
				name: "Identity",
				purpose: "What the project is.",
				current_blocks: ["project"],
				target_blocks: [{ name: "project", shape: "flat" }],
			},
		],
		migration_phases: [
			{
				id: "phase-1",
				name: "Bootstrap",
				description: "Initial scaffolding.",
				depends_on: [],
				exit_criteria: ["scaffolding complete"],
			},
		],
		created_by: "agent",
		created_at: "2026-04-25T12:00:00Z",
		...overrides,
	};
}

describe("render_layer_plan macro", () => {
	it("case 1: depth=0 emits bare IDs for cross-block references", () => {
		const plan = makeFullPlan({
			related_gaps: ["FGAP-001"],
			related_features: ["FEAT-001"],
			related_decisions: ["DEC-0001"],
		});
		const idIndex = buildFixtureIdIndex({
			"layer-plans": [plan],
			"framework-gaps": [{ id: "FGAP-001", title: "should not appear" }],
			features: [{ id: "FEAT-001", title: "should not appear" }],
			decisions: [{ id: "DEC-0001", title: "should not appear", status: "enacted" }],
		});

		const out = renderLayerPlan(
			idIndex,
			{ "layer-plans": LAYER_PLANS_MACRO_PATH, decisions: DECISIONS_MACRO_PATH },
			plan,
			0,
		);

		assert.match(out, /\bFGAP-001\b/);
		assert.match(out, /\bFEAT-001\b/);
		assert.match(out, /\bDEC-0001\b/);
		assert.doesNotMatch(out, /should not appear/);
	});

	it("case 2: depth=1 inlines via render_recursive into render_decision; absent sibling kinds → fallback marker", () => {
		const plan = makeFullPlan({
			related_decisions: ["DEC-0001"],
			related_gaps: ["FGAP-001"], // no render_framework_gap registered → fallback
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
			"layer-plans": [plan],
			decisions: [dec],
			"framework-gaps": [{ id: "FGAP-001", title: "should not leak" }],
		});

		const out = renderLayerPlan(
			idIndex,
			{ "layer-plans": LAYER_PLANS_MACRO_PATH, decisions: DECISIONS_MACRO_PATH },
			plan,
			1,
		);

		assert.match(out, /Title: Related decision title/);
		assert.match(out, /decision body text/);
		assert.match(out, /\[unrendered: framework-gaps\/FGAP-001\]/);
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
		const plan = makeFullPlan({ related_decisions: ["DEC-0001"] });
		const idIndex = buildFixtureIdIndex({
			"layer-plans": [plan],
			decisions: [decOuter, decInner],
		});

		const out = renderLayerPlan(
			idIndex,
			{ "layer-plans": LAYER_PLANS_MACRO_PATH, decisions: DECISIONS_MACRO_PATH },
			plan,
			2,
		);

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
		const plan = makeFullPlan({ related_decisions: ["DEC-0001"] });
		const idIndex = buildFixtureIdIndex({
			"layer-plans": [plan],
			decisions: [decA, decB],
		});

		const out = renderLayerPlan(
			idIndex,
			{ "layer-plans": LAYER_PLANS_MACRO_PATH, decisions: DECISIONS_MACRO_PATH },
			plan,
			5,
		);

		assert.match(out, /Title: A/);
		assert.match(out, /Title: B/);
		assert.match(out, /\[cycle: DEC-000[12]\]/);
	});

	it("case 5: optional fields absent from output when undefined (no orphan labels, no 'undefined')", () => {
		const minimal = {
			id: "PLAN-099",
			title: "minimal",
			status: "draft",
			model: "minimal model",
			layers: [
				{
					id: "L1",
					name: "L1",
					purpose: "purpose",
					current_blocks: [],
					target_blocks: [],
				},
			],
			migration_phases: [
				{
					id: "phase-1",
					name: "phase",
					description: "desc",
					depends_on: [],
					exit_criteria: [],
				},
			],
			created_by: "agent",
			created_at: "2026-05-02T00:00:00Z",
		};
		const idIndex = buildFixtureIdIndex({ "layer-plans": [minimal] });

		const out = renderLayerPlan(idIndex, { "layer-plans": LAYER_PLANS_MACRO_PATH }, minimal, 0);

		assert.match(out, /ID: PLAN-099/);
		assert.match(out, /Title: minimal/);
		assert.match(out, /Model: minimal model/);
		assert.doesNotMatch(out, /^Description:/m, "absent description must not render label");
		assert.doesNotMatch(out, /Related gaps:/, "absent related_gaps must not render label");
		assert.doesNotMatch(out, /Related features:/, "absent related_features must not render label");
		assert.doesNotMatch(out, /Related decisions:/, "absent related_decisions must not render label");
		assert.doesNotMatch(out, /\bundefined\b/);
	});

	it("case 6: empty-array convention — present-but-empty arrays render '(none)'", () => {
		const plan = makeFullPlan({
			layers: [],
			migration_phases: [],
			related_gaps: [],
			related_features: [],
			related_decisions: [],
		});
		const idIndex = buildFixtureIdIndex({ "layer-plans": [plan] });

		const out = renderLayerPlan(idIndex, { "layer-plans": LAYER_PLANS_MACRO_PATH }, plan, 0);

		assert.match(out, /Layers:[\s\S]*?\(none\)/);
		assert.match(out, /Migration phases:[\s\S]*?\(none\)/);
		assert.match(out, /Related gaps:[\s\S]*?\(none\)/);
		assert.match(out, /Related features:[\s\S]*?\(none\)/);
		assert.match(out, /Related decisions:[\s\S]*?\(none\)/);
	});
});
