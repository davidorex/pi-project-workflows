/**
 * Per-item macro tests: render_spec_review (Plan 7, Wave 4).
 *
 * Mirrors render-decision.test.ts's six-case shape and direct-Nunjucks env
 * approach. Pi-workflows does not depend on pi-jit-agents; the test wires
 * `resolve` and `render_recursive` globals manually to mirror the bindings
 * compileAgent registers on the production Environment.
 *
 * Plan 8 may not yet ship sibling per-item macros; tests must NOT depend on
 * them. Cross-macro inline assertions reference Plan 6's render_decision
 * (which definitely exists) so that the inline path is exercised; absent
 * sibling kinds exercise the `[unrendered: …]` fallback.
 */
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import nunjucks from "nunjucks";

const SPEC_REVIEWS_MACRO_PATH = path.resolve(import.meta.dirname, "..", "templates", "items", "spec-reviews.md");
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

function renderSpecReview(env: nunjucks.Environment, item: Record<string, unknown>, depth: number): string {
	const macroSource = fs.readFileSync(SPEC_REVIEWS_MACRO_PATH, "utf-8");
	const inline = `${macroSource}\n{{ render_spec_review(item, depth) }}`;
	return env.renderString(inline, { item, depth });
}

function makeFullReview(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
	return {
		id: "REVIEW-001",
		target: "docs/planning/jit-agents-spec.md",
		status: "in-progress",
		findings: [
			{
				id: "f-1",
				description: "Ambiguous boundary contract",
				severity: "major",
				category: "ambiguity",
				state: "decided",
				reporter: "reviewer-a",
				created_at: "2026-04-25T00:00:00Z",
				produces_decision: "DEC-0001",
			},
		],
		created_by: "agent",
		created_at: "2026-04-25T12:00:00Z",
		...overrides,
	};
}

describe("render_spec_review macro", () => {
	it("case 1: depth=0 emits bare IDs for cross-block references", () => {
		const rev = makeFullReview();
		const idIndex = buildFixtureIdIndex({
			"spec-reviews": [rev],
			decisions: [{ id: "DEC-0001", title: "should not appear", status: "enacted" }],
		});
		const env = makeEnv(idIndex, {
			"spec-reviews": SPEC_REVIEWS_MACRO_PATH,
			decisions: DECISIONS_MACRO_PATH,
		});

		const out = renderSpecReview(env, rev, 0);

		assert.match(out, /\bDEC-0001\b/, "expected bare DEC-0001 reference for produces_decision");
		assert.doesNotMatch(out, /should not appear/, "depth=0 must not render referenced item bodies");
		assert.doesNotMatch(out, /Title: should not appear/, "depth=0 must not inline produces_decision target");
	});

	it("case 2: depth=1 inlines via render_recursive into render_decision; absent sibling kinds → fallback marker", () => {
		// produces_decision recurses into decisions where render_decision exists;
		// add a second finding whose produces_decision points into a kind with no
		// macro registered to exercise the fallback marker.
		const rev = makeFullReview({
			findings: [
				{
					id: "f-1",
					description: "ambig",
					severity: "major",
					category: "ambiguity",
					state: "decided",
					reporter: "reviewer-a",
					created_at: "2026-04-25T00:00:00Z",
					produces_decision: "DEC-0001",
				},
				{
					id: "f-2",
					description: "missing",
					severity: "minor",
					category: "omission",
					state: "decided",
					reporter: "reviewer-a",
					created_at: "2026-04-25T01:00:00Z",
					produces_decision: "ISSUE-XXX", // resolves to issues block; no render_issue available
				},
			],
		});
		const decTarget = {
			id: "DEC-0001",
			title: "Decision body title text",
			status: "enacted",
			context: "ctx",
			decision: "decision body text",
			consequences: ["c1"],
			created_by: "agent",
			created_at: "2026-04-25T00:00:00Z",
			related_findings: ["whatever"],
		};
		const idIndex = buildFixtureIdIndex({
			"spec-reviews": [rev],
			decisions: [decTarget],
			issues: [{ id: "ISSUE-XXX", title: "should not leak" }],
		});
		// decisions macro registered; issues intentionally absent.
		const env = makeEnv(idIndex, {
			"spec-reviews": SPEC_REVIEWS_MACRO_PATH,
			decisions: DECISIONS_MACRO_PATH,
		});

		const out = renderSpecReview(env, rev, 1);

		assert.match(out, /Title: Decision body title text/, "DEC-0001 body must be inlined via render_decision");
		assert.match(out, /decision body text/, "DEC-0001 decision content must appear");
		assert.match(out, /\[unrendered: issues\/ISSUE-XXX\]/, "absent issues macro must yield fallback marker");
		assert.doesNotMatch(out, /should not leak/, "fallback path must not leak issues item body");
	});

	it("case 3: depth=2 lets the inlined decision render its OWN cross-refs at depth=1", () => {
		// The render_recursive global descends from depth=2 to call the decisions
		// macro with depth=1; that decisions macro then inlines its own
		// related_findings. We use a chain decisions → decisions to prove the
		// budget threads through. See render-decision.test.ts case 3 for the
		// depth-budget reasoning.
		const decInner = {
			id: "DEC-0009",
			title: "Inner decision title",
			status: "enacted",
			context: "ctx-inner",
			decision: "inner body",
			consequences: ["ic"],
			created_by: "agent",
			created_at: "2026-04-20T00:00:00Z",
			related_findings: ["whatever"],
		};
		const decOuter = {
			id: "DEC-0001",
			title: "Outer decision title",
			status: "enacted",
			context: "ctx-outer",
			decision: "outer body",
			consequences: ["oc"],
			created_by: "agent",
			created_at: "2026-04-25T00:00:00Z",
			related_findings: ["whatever"],
			supersedes: ["DEC-0009"],
		};
		const rev = makeFullReview();
		const idIndex = buildFixtureIdIndex({
			"spec-reviews": [rev],
			decisions: [decOuter, decInner],
		});
		const env = makeEnv(idIndex, {
			"spec-reviews": SPEC_REVIEWS_MACRO_PATH,
			decisions: DECISIONS_MACRO_PATH,
		});

		const out = renderSpecReview(env, rev, 2);

		assert.match(out, /Title: Outer decision title/, "DEC-0001 must be inlined at depth=2");
		assert.match(
			out,
			/Title: Inner decision title/,
			"DEC-0009 must be inlined via DEC-0001's supersedes (chain length 2)",
		);
		assert.match(out, /inner body/, "inner decision body must appear");
	});

	it("case 4: cycle terminates with [cycle: …] marker on back-edge", () => {
		// Build a decisions cycle reachable from the spec-review's produces_decision.
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
			supersedes: ["DEC-0001"], // back-edge → cycle
		};
		const rev = makeFullReview();
		const idIndex = buildFixtureIdIndex({
			"spec-reviews": [rev],
			decisions: [decA, decB],
		});
		const env = makeEnv(idIndex, {
			"spec-reviews": SPEC_REVIEWS_MACRO_PATH,
			decisions: DECISIONS_MACRO_PATH,
		});

		const out = renderSpecReview(env, rev, 5);

		assert.match(out, /Title: A/, "DEC-0001 body must appear");
		assert.match(out, /Title: B/, "DEC-0002 body must appear via supersedes");
		assert.match(out, /\[cycle: DEC-000[12]\]/, "cycle marker must terminate the back-edge");
	});

	it("case 5: optional fields absent from output when undefined (no orphan labels, no 'undefined')", () => {
		const minimal = {
			id: "REVIEW-099",
			target: "docs/planning/whatever.md",
			status: "not-started",
			findings: [],
			created_by: "agent",
			created_at: "2026-05-02T00:00:00Z",
		};
		const idIndex = buildFixtureIdIndex({ "spec-reviews": [minimal] });
		const env = makeEnv(idIndex, { "spec-reviews": SPEC_REVIEWS_MACRO_PATH });

		const out = renderSpecReview(env, minimal, 0);

		assert.match(out, /ID: REVIEW-099/);
		assert.match(out, /Target: docs\/planning\/whatever.md/);
		assert.match(out, /Status: not-started/);
		assert.doesNotMatch(out, /Target revision:/, "absent target_revision must not render label");
		assert.doesNotMatch(out, /Reviewer:/, "absent reviewer must not render label");
		assert.doesNotMatch(out, /Completed at:/, "absent completed_at must not render label");
		assert.doesNotMatch(out, /Method:/, "absent method must not render label");
		assert.doesNotMatch(out, /Scope:/, "absent scope must not render label");
		assert.doesNotMatch(out, /Clean:/, "absent clean must not render label");
		assert.doesNotMatch(out, /\bundefined\b/, "no field should render the literal string 'undefined'");
	});

	it("case 6: empty-array convention — present-but-empty arrays render '(none)'", () => {
		const rev = {
			id: "REVIEW-002",
			target: "docs/planning/x.md",
			status: "in-progress",
			scope: [], // present-but-empty
			findings: [], // present-but-empty
			created_by: "agent",
			created_at: "2026-05-02T00:00:00Z",
		};
		const idIndex = buildFixtureIdIndex({ "spec-reviews": [rev] });
		const env = makeEnv(idIndex, { "spec-reviews": SPEC_REVIEWS_MACRO_PATH });

		const out = renderSpecReview(env, rev, 0);

		assert.match(out, /Scope:[\s\S]*?\(none\)/, "empty scope must render '(none)'");
		assert.match(out, /Findings:[\s\S]*?\(none\)/, "empty findings must render '(none)'");
	});
});
