/**
 * Per-item macro tests: render_research (Plan 7, Wave 4).
 *
 * Cross-block reference fields: related_research, informed_by, informs,
 * produces_findings, supersedes, superseded_by — all recurse on depth.
 *
 * x-prompt-budget integration: per the Plan 7 brief, the macro emits content
 * directly (matching Plan 6's choice). enforceBudget is exported but not
 * wired into per-item macros at this time.
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

const RESEARCH_MACRO_PATH = itemMacroPath("research");
const DECISIONS_MACRO_PATH = itemMacroPath("decisions");

function renderResearch(
	idIndex: Map<string, FixtureItemLocation>,
	availableMacros: Record<string, string>,
	item: Record<string, unknown>,
	depth: number,
): string {
	return renderItemMacro(makeRendererTestEnv(idIndex, availableMacros), "research", item, depth);
}

function makeFullResearch(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
	return {
		id: "R-0001",
		title: "Provider routing landscape",
		status: "complete",
		layer: "L2",
		type: "comparative",
		question: "How do providers route forced tool-use?",
		method: "code-inspection of pi-ai drivers",
		findings_summary: "Three drivers diverge in tool-choice shape...",
		created_by: "agent",
		created_at: "2026-04-25T12:00:00Z",
		...overrides,
	};
}

describe("render_research macro", () => {
	it("case 1: depth=0 emits bare IDs for cross-block references", () => {
		const r = makeFullResearch({
			related_research: ["R-0002"],
			informs: ["DEC-0001"],
			informed_by: ["R-0003"],
			produces_findings: ["finding-x"],
			supersedes: ["R-0099"],
			superseded_by: "R-0100",
		});
		const idIndex = buildFixtureIdIndex({
			research: [
				r,
				{ id: "R-0002", title: "should not appear" },
				{ id: "R-0003", title: "should not appear" },
				{ id: "R-0099", title: "should not appear" },
				{ id: "R-0100", title: "should not appear" },
			],
			decisions: [{ id: "DEC-0001", title: "should not appear", status: "enacted" }],
		});

		const out = renderResearch(idIndex, { research: RESEARCH_MACRO_PATH, decisions: DECISIONS_MACRO_PATH }, r, 0);

		assert.match(out, /\bR-0002\b/);
		assert.match(out, /\bDEC-0001\b/);
		assert.match(out, /\bR-0003\b/);
		assert.match(out, /\bR-0099\b/);
		assert.match(out, /\bR-0100\b/);
		assert.doesNotMatch(out, /should not appear/);
	});

	it("case 2: depth=1 inlines via render_recursive into render_decision; absent sibling kinds → fallback marker", () => {
		const r = makeFullResearch({
			informs: ["DEC-0001"],
			produces_findings: ["finding-x"], // resolves to a non-decisions kind below; no macro registered
		});
		const dec = {
			id: "DEC-0001",
			title: "Informed decision",
			status: "enacted",
			context: "ctx",
			decision: "decision body text",
			consequences: ["c1"],
			created_by: "agent",
			created_at: "2026-04-25T00:00:00Z",
			related_findings: ["whatever"],
		};
		const idIndex = buildFixtureIdIndex({
			research: [r],
			decisions: [dec],
			"spec-reviews": [{ id: "finding-x", title: "should not leak" }],
		});

		const out = renderResearch(idIndex, { research: RESEARCH_MACRO_PATH, decisions: DECISIONS_MACRO_PATH }, r, 1);

		assert.match(out, /Title: Informed decision/);
		assert.match(out, /decision body text/);
		assert.match(out, /\[unrendered: spec-reviews\/finding-x\]/);
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
		const r = makeFullResearch({ informs: ["DEC-0001"] });
		const idIndex = buildFixtureIdIndex({
			research: [r],
			decisions: [decOuter, decInner],
		});

		const out = renderResearch(idIndex, { research: RESEARCH_MACRO_PATH, decisions: DECISIONS_MACRO_PATH }, r, 2);

		assert.match(out, /Title: Outer decision/);
		assert.match(out, /Title: Inner decision/);
		assert.match(out, /inner body/);
	});

	it("case 4: cycle terminates with [cycle: …] marker on back-edge", () => {
		// Build a research↔research cycle via supersedes.
		const rA = makeFullResearch({
			id: "R-0001",
			title: "A",
			supersedes: ["R-0002"],
		});
		const rB = makeFullResearch({
			id: "R-0002",
			title: "B",
			supersedes: ["R-0001"], // back-edge → cycle
		});
		const idIndex = buildFixtureIdIndex({
			research: [rA, rB],
		});

		const out = renderResearch(idIndex, { research: RESEARCH_MACRO_PATH }, rA, 5);

		assert.match(out, /Title: A/);
		assert.match(out, /Title: B/);
		assert.match(out, /\[cycle: R-000[12]\]/);
	});

	it("case 5: optional fields absent from output when undefined (no orphan labels, no 'undefined')", () => {
		const minimal = {
			id: "R-0099",
			title: "minimal",
			status: "planned",
			layer: "L2",
			type: "investigative",
			question: "what",
			method: "how",
			findings_summary: "summary",
			created_by: "agent",
			created_at: "2026-05-02T00:00:00Z",
		};
		const idIndex = buildFixtureIdIndex({ research: [minimal] });

		const out = renderResearch(idIndex, { research: RESEARCH_MACRO_PATH }, minimal, 0);

		assert.match(out, /ID: R-0099/);
		assert.match(out, /Title: minimal/);
		assert.doesNotMatch(out, /Modified by:/, "absent modified_by must not render label");
		assert.doesNotMatch(out, /Modified at:/, "absent modified_at must not render label");
		assert.doesNotMatch(out, /Conducted by:/, "absent conducted_by must not render label");
		assert.doesNotMatch(out, /Conducted at:/, "absent conducted_at must not render label");
		assert.doesNotMatch(out, /Grounded at:/, "absent grounded_at must not render label");
		assert.doesNotMatch(out, /Scope:/, "absent scope must not render label");
		assert.doesNotMatch(out, /Findings document:/, "absent findings_document must not render label");
		assert.doesNotMatch(out, /Grounding:/, "absent grounding must not render label");
		assert.doesNotMatch(out, /Stale conditions:/, "absent stale_conditions must not render label");
		assert.doesNotMatch(out, /Citations:/, "absent citations must not render label");
		assert.doesNotMatch(out, /Informs:/, "absent informs must not render label");
		assert.doesNotMatch(out, /Informed by:/, "absent informed_by must not render label");
		assert.doesNotMatch(out, /Related research:/, "absent related_research must not render label");
		assert.doesNotMatch(out, /Produces findings:/, "absent produces_findings must not render label");
		assert.doesNotMatch(out, /Supersedes:/, "absent supersedes must not render label");
		assert.doesNotMatch(out, /Superseded by:/, "absent superseded_by must not render label");
		assert.doesNotMatch(out, /\bundefined\b/);
	});

	it("case 6: empty-array convention — present-but-empty arrays render '(none)'", () => {
		const r = makeFullResearch({
			scope: [],
			stale_conditions: [],
			citations: [],
			informs: [],
			informed_by: [],
			related_research: [],
			produces_findings: [],
			supersedes: [],
			grounding: { dependencies: [], revisions: [], external_refs: [] },
		});
		const idIndex = buildFixtureIdIndex({ research: [r] });

		const out = renderResearch(idIndex, { research: RESEARCH_MACRO_PATH }, r, 0);

		assert.match(out, /Scope:[\s\S]*?\(none\)/);
		assert.match(out, /Stale conditions:[\s\S]*?\(none\)/);
		assert.match(out, /Citations:[\s\S]*?\(none\)/);
		assert.match(out, /Informs:[\s\S]*?\(none\)/);
		assert.match(out, /Informed by:[\s\S]*?\(none\)/);
		assert.match(out, /Related research:[\s\S]*?\(none\)/);
		assert.match(out, /Produces findings:[\s\S]*?\(none\)/);
		assert.match(out, /Supersedes:[\s\S]*?\(none\)/);
		assert.match(out, /Dependencies:[\s\S]*?\(none\)/);
		assert.match(out, /Revisions:[\s\S]*?\(none\)/);
		assert.match(out, /External refs:[\s\S]*?\(none\)/);
	});
});
