/**
 * Per-item macro tests: render_decision (Plan 6, Wave 3).
 *
 * Test approach: direct Nunjucks environment with the same `resolve` and
 * `render_recursive` globals that @davidorex/pi-jit-agents' compileAgent
 * registers (compile.ts §"Nunjucks globals for per-item macro composition").
 * Pi-workflows does not depend on pi-jit-agents, and adding a workspace dep
 * solely for this test would be invasive — the macro logic is what's under
 * test here, not the compileAgent pipeline (which has its own coverage).
 * The brief explicitly authorises this simpler path.
 *
 * The mirror is intentionally faithful: same kind→macro lookup convention
 * (block kind name as filename, default macro name `render_<kind>`), same
 * inline-by-source dispatch (read macro file + append call expression),
 * same per-call visited Set for cycle detection, same fallback markers
 * (`[unrendered: <kind>/<id>]`, `[cycle: <id>]`).
 *
 * Required test cases per Plan 6 brief:
 *   1. depth=0 emits bare IDs (no recursion)
 *   2. depth=1 inlines via render_recursive — fallback markers when sibling
 *      macros (render_issue, render_features) are absent
 *   3. depth=2 recurses one level for decisions→decisions
 *   4. cycle terminates with [cycle: ...] marker
 *   5. optional fields render conditionally (no orphan labels for absent fields)
 *   6. empty-array convention: present-but-empty arrays render "(none)"
 */
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import nunjucks from "nunjucks";

const TEMPLATES_DIR = path.resolve(import.meta.dirname, "..", "templates");
const DECISIONS_MACRO_PATH = path.join(TEMPLATES_DIR, "items", "decisions.md");

interface ItemLocation {
	block: string;
	arrayKey: string;
	item: Record<string, unknown>;
}

/**
 * Build an in-memory id index from a fixture map of block name → items array.
 * Mirrors the buildIdIndex output shape used by pi-project.
 */
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

/**
 * Construct a Nunjucks env mirroring compileAgent's globals registration.
 * `availableMacros`: kind → absolute path of the macro file. Defaults to
 * decisions only (the file Plan 6 ships); other kinds intentionally absent
 * to exercise the `[unrendered: …]` fallback path.
 */
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

		// Mirror @davidorex/pi-jit-agents' renderer-registry canonical-name
		// lookup. Only the kinds this test exercises are listed.
		const canonical: Record<string, string> = { decisions: "render_decision" };
		const macroName = canonical[blockName] ?? `render_${blockName.replace(/-/g, "_")}`;
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

/**
 * Render the decisions macro for `item` at `depth` using the wired-up env.
 * Returns the rendered string for assertions.
 */
function renderDecision(env: nunjucks.Environment, item: Record<string, unknown>, depth: number): string {
	const macroSource = fs.readFileSync(DECISIONS_MACRO_PATH, "utf-8");
	const inline = `${macroSource}\n{{ render_decision(item, depth) }}`;
	return env.renderString(inline, { item, depth });
}

/** Fully-populated DEC-0001 with all required fields. */
function makeFullDecision(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
	return {
		id: "DEC-0001",
		title: "Cross-provider tool-choice normalizer",
		status: "enacted",
		context: "Forced tool-use shape diverges across drivers; consumers shipped a parallel hardcoded shape.",
		decision: "Centralize shape normalization at the executeAgent boundary in pi-jit-agents.",
		consequences: ["Consumers consume normalized shape only", "Driver-add work concentrates in one helper"],
		created_by: "agent",
		created_at: "2026-04-25T12:00:00Z",
		related_findings: ["issue-001"],
		...overrides,
	};
}

describe("render_decision macro", () => {
	it("case 1: depth=0 emits bare IDs for cross-block references", () => {
		const dec = makeFullDecision({
			related_findings: ["issue-001"],
			related_features: ["FEAT-001"],
			supersedes: ["DEC-0002"],
		});
		const idIndex = buildFixtureIdIndex({
			decisions: [dec, { id: "DEC-0002", title: "older", status: "enacted" }],
			issues: [{ id: "issue-001", title: "should not appear" }],
			features: [{ id: "FEAT-001", title: "should not appear either" }],
		});
		// At depth 0 the macro must NOT call resolve/render_recursive at all.
		// Provide the decisions macro so a stray recursion would be visible if it happened.
		const env = makeEnv(idIndex, { decisions: DECISIONS_MACRO_PATH });

		const out = renderDecision(env, dec, 0);

		assert.match(out, /\bissue-001\b/, "expected bare issue-001 reference");
		assert.match(out, /\bFEAT-001\b/, "expected bare FEAT-001 reference");
		assert.match(out, /\bDEC-0002\b/, "expected bare DEC-0002 reference for supersedes");
		// Body of the referenced items must NOT appear.
		assert.doesNotMatch(out, /should not appear/, "depth=0 must not render referenced item bodies");
		// And the supersedes path must not have inlined DEC-0002's title.
		assert.doesNotMatch(out, /Title: older/, "depth=0 must not inline supersedes target");
	});

	it("case 2: depth=1 inlines via render_recursive; fallback markers when sibling macros absent", () => {
		const dec2 = {
			id: "DEC-0002",
			title: "Older decision title text",
			status: "enacted",
			context: "older context",
			decision: "older decision body",
			consequences: ["older consequence"],
			created_by: "agent",
			created_at: "2026-04-20T00:00:00Z",
			related_findings: ["issue-001"], // schema requires at least one of related_*
		};
		const dec1 = makeFullDecision({
			related_findings: ["issue-001"],
			related_features: ["FEAT-001"],
			supersedes: ["DEC-0002"],
		});
		const idIndex = buildFixtureIdIndex({
			decisions: [dec1, dec2],
			issues: [{ id: "issue-001", title: "issue body text" }],
			features: [{ id: "FEAT-001", title: "feature body text" }],
		});
		// Plan 7/8 macros not yet shipped — only decisions has an item-macro.
		const env = makeEnv(idIndex, { decisions: DECISIONS_MACRO_PATH });

		const out = renderDecision(env, dec1, 1);

		// related_findings → issues: render_issue does not exist → fallback.
		assert.match(
			out,
			/\[unrendered: issues\/issue-001\]/,
			"expected [unrendered: issues/issue-001] when render_issue absent",
		);
		// related_features → features: render_features does not exist → fallback.
		assert.match(
			out,
			/\[unrendered: features\/FEAT-001\]/,
			"expected [unrendered: features/FEAT-001] when render_features absent",
		);
		// supersedes → decisions: render_decision DOES exist (Plan 6 ships it) → full inline.
		assert.match(out, /Title: Older decision title text/, "expected DEC-0002 title inlined for supersedes at depth=1");
		assert.match(out, /older decision body/, "expected DEC-0002 decision body inlined for supersedes at depth=1");
		// Sibling-macro fallback bodies must not have leaked the actual referenced data.
		assert.doesNotMatch(out, /issue body text/, "render_issue fallback must not leak the resolved item body");
		assert.doesNotMatch(out, /feature body text/, "render_features fallback must not leak the resolved item body");
	});

	it("case 3: depth=2 recurses through a supersedes chain; cross-refs at depth=0 stay bare", () => {
		// NOTE on depth semantics (reconciled with case 2's expectation):
		//   The macro guards calls to render_recursive with `depth > 0`. The
		//   render_recursive global itself unconditionally renders the located
		//   item's body — its `depth` parameter governs whether THAT item's
		//   own outgoing cross-refs may fan out further. So at outer depth=N,
		//   a chain produces up to N+1 inlined bodies (the outer macro is the
		//   root; each render_recursive descent adds one inlined body below).
		//
		//   Case 2 explicitly required that depth=1 fully render DEC-0002's
		//   body via supersedes — i.e. one render_recursive descent produces
		//   one inlined body. Composed with that, depth=2 produces a two-link
		//   chain inlined fully. The "depth budget exhausts at 0" guard then
		//   kicks in only when the deepest reached item itself has outgoing
		//   cross-refs — those stay bare because the deepest macro evaluates
		//   with depth=0.
		//
		//   The fixture below puts a `related_features` reference on DEC-0003
		//   so we can prove the depth=0 guard works: DEC-0003 renders body,
		//   but its `related_features: [DEEP-FEAT]` reference must stay bare
		//   because DEC-0003's macro evaluates with depth=0. If the guard
		//   failed, render_recursive would emit `[unrendered: features/...]`
		//   (no features macro registered) instead of bare-ID text.
		const dec3 = {
			id: "DEC-0003",
			title: "Oldest decision",
			status: "enacted",
			context: "ctx 3",
			decision: "decision body 3",
			consequences: ["consequence 3"],
			created_by: "agent",
			created_at: "2026-04-10T00:00:00Z",
			related_findings: ["issue-001"],
			related_features: ["DEEP-FEAT"], // budget-exhaustion probe
		};
		const dec2 = {
			id: "DEC-0002",
			title: "Middle decision",
			status: "enacted",
			context: "ctx 2",
			decision: "decision body 2",
			consequences: ["consequence 2"],
			created_by: "agent",
			created_at: "2026-04-15T00:00:00Z",
			related_findings: ["issue-001"],
			supersedes: ["DEC-0003"],
		};
		const dec1 = makeFullDecision({
			related_findings: ["issue-001"],
			supersedes: ["DEC-0002"],
		});
		const idIndex = buildFixtureIdIndex({
			decisions: [dec1, dec2, dec3],
			issues: [{ id: "issue-001", title: "irrelevant" }],
			features: [{ id: "DEEP-FEAT", title: "feature-body-text-must-not-leak" }],
		});
		// Only decisions has an item-macro; features intentionally absent so a
		// render at depth>0 for DEEP-FEAT would emit [unrendered: features/...]
		// rather than bare-ID text. Bare-ID presence is therefore a positive
		// signal that the macro's own depth guard refused the descent.
		const env = makeEnv(idIndex, { decisions: DECISIONS_MACRO_PATH });

		const out = renderDecision(env, dec1, 2);

		// DEC-0001 body present (depth=2, root).
		assert.match(out, /ID: DEC-0001/, "DEC-0001 own body must be rendered");
		// DEC-0002 inlined via supersedes (one descent, depth-1=1 inside).
		assert.match(out, /Title: Middle decision/, "DEC-0002 must be inlined at depth=2");
		assert.match(out, /decision body 2/, "DEC-0002 decision body must be inlined");
		// DEC-0003 inlined via DEC-0002's supersedes (two descents, depth-2=0 inside).
		assert.match(out, /Title: Oldest decision/, "DEC-0003 must be inlined at depth=2 (chain length 2)");
		assert.match(out, /decision body 3/, "DEC-0003 decision body must be inlined");
		// DEC-0003 evaluates its own related_features at depth=0 → bare-ID emission.
		assert.match(out, /\bDEEP-FEAT\b/, "DEEP-FEAT must appear as bare ID (depth budget exhausted)");
		assert.doesNotMatch(
			out,
			/\[unrendered: features\/DEEP-FEAT\]/,
			"depth=0 inside DEC-0003 must not invoke render_recursive at all (no fallback marker)",
		);
		assert.doesNotMatch(
			out,
			/feature-body-text-must-not-leak/,
			"DEEP-FEAT body content must not appear (no descent past depth=0)",
		);
	});

	it("case 4: cycle terminates with [cycle: …] marker on back-edge", () => {
		// NOTE on cycle-marker identity:
		//   The visited Set lives on the render_recursive global; the OUTER
		//   call (direct env.renderString from this test, mirroring how
		//   compileAgent renders the agent's own template) does NOT pass
		//   through render_recursive and therefore does NOT seed the visited
		//   Set. Only nested cross-reference descents add to visited.
		//
		//   Trace for this fixture (depth=5):
		//     1. outer renderDecision(dec1, 5)            visited={}
		//     2. dec1.supersedes → render_recursive(dec2, 4)
		//        visited={DEC-0002}; renders dec2 body
		//     3. dec2.supersedes → render_recursive(dec1, 3)
		//        DEC-0001 not yet in visited (outer was direct, not via
		//        render_recursive) so descent proceeds.
		//        visited={DEC-0002, DEC-0001}; renders dec1 body again
		//     4. dec1.supersedes → render_recursive(dec2, 2)
		//        DEC-0002 IS in visited → returns "[cycle: DEC-0002]"
		//
		//   So the cycle marker on the back-edge is `[cycle: DEC-0002]`.
		//   The test just needs to confirm that termination occurred and
		//   that *some* cycle marker fired in the chain.
		const dec1 = makeFullDecision({
			related_findings: ["issue-001"],
			supersedes: ["DEC-0002"],
		});
		const dec2 = {
			id: "DEC-0002",
			title: "Mutually superseding decision",
			status: "enacted",
			context: "ctx 2",
			decision: "body 2",
			consequences: ["c2"],
			created_by: "agent",
			created_at: "2026-04-15T00:00:00Z",
			related_findings: ["issue-001"],
			supersedes: ["DEC-0001"], // back-edge to dec1 — cycle
		};
		const idIndex = buildFixtureIdIndex({
			decisions: [dec1, dec2],
			issues: [{ id: "issue-001", title: "irrelevant" }],
		});
		const env = makeEnv(idIndex, { decisions: DECISIONS_MACRO_PATH });

		// High depth — relies on cycle detector, not depth budget, to terminate.
		const out = renderDecision(env, dec1, 5);

		// Outer DEC-0001 body present.
		assert.match(out, /ID: DEC-0001/);
		// Inlined DEC-0002 body present.
		assert.match(out, /Title: Mutually superseding decision/);
		// Termination via cycle marker. The visited-Set seeding rule (above)
		// produces `[cycle: DEC-0002]` on the third descent. The assertion
		// is on cycle-detection occurrence, not the specific id, since the
		// id is determined by the visited-Set seeding semantics rather than
		// by the macro itself.
		assert.match(out, /\[cycle: DEC-000[12]\]/, "expected a [cycle: …] termination marker on the back-edge");
	});

	it("case 5: optional fields are absent from output when undefined (no orphan labels, no 'undefined')", () => {
		// Minimal decision: only schema-required fields plus the schema-required
		// at-least-one-of (related_findings carries a single ID).
		const minimal = {
			id: "DEC-0099",
			title: "minimal",
			status: "open",
			context: "minimal context",
			decision: "minimal decision",
			consequences: ["one consequence"],
			created_by: "agent",
			created_at: "2026-05-02T00:00:00Z",
			related_findings: ["issue-001"],
		};
		const idIndex = buildFixtureIdIndex({
			decisions: [minimal],
			issues: [{ id: "issue-001", title: "irrelevant" }],
		});
		const env = makeEnv(idIndex, { decisions: DECISIONS_MACRO_PATH });

		const out = renderDecision(env, minimal, 0);

		// Required fields rendered.
		assert.match(out, /ID: DEC-0099/);
		assert.match(out, /Title: minimal/);
		assert.match(out, /Status: open/);
		assert.match(out, /Context:[\s\S]*minimal context/);
		assert.match(out, /Decision:[\s\S]*minimal decision/);
		assert.match(out, /Consequences:[\s\S]*one consequence/);
		// related_findings IS present in this minimal fixture (schema demands one of).
		assert.match(out, /Related findings:/);
		// Optional fields absent: no orphan labels, no "undefined" leakage.
		assert.doesNotMatch(out, /Options considered:/, "absent options_considered must not render label");
		assert.doesNotMatch(out, /Supersedes:/, "absent supersedes must not render label");
		assert.doesNotMatch(out, /Superseded by:/, "absent superseded_by must not render label");
		assert.doesNotMatch(out, /Related features:/, "absent related_features must not render label");
		assert.doesNotMatch(out, /Related gaps:/, "absent related_gaps must not render label");
		assert.doesNotMatch(out, /^References:/m, "absent references must not render label");
		assert.doesNotMatch(out, /Enacted by:/, "absent enacted_by must not render label");
		assert.doesNotMatch(out, /Enacted at:/, "absent enacted_at must not render label");
		assert.doesNotMatch(out, /\bundefined\b/, "no field should render the literal string 'undefined'");
	});

	it("case 6: empty-array convention — present-but-empty arrays render '(none)'", () => {
		const dec = makeFullDecision({
			related_findings: ["issue-001"], // schema floor — keep one
			related_features: [], // present but empty — must render "(none)"
			related_gaps: [], // present but empty — must render "(none)"
			references: [], // present but empty — must render "(none)"
		});
		const idIndex = buildFixtureIdIndex({
			decisions: [dec],
			issues: [{ id: "issue-001", title: "irrelevant" }],
		});
		const env = makeEnv(idIndex, { decisions: DECISIONS_MACRO_PATH });

		const out = renderDecision(env, dec, 0);

		// Each present-but-empty array surfaces its label with the (none) sentinel.
		assert.match(out, /Related features:[\s\S]*?\(none\)/, "empty related_features must render '(none)'");
		assert.match(out, /Related gaps:[\s\S]*?\(none\)/, "empty related_gaps must render '(none)'");
		assert.match(out, /References:[\s\S]*?\(none\)/, "empty references must render '(none)'");
	});
});
