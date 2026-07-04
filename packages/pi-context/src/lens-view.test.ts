import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { writeBootstrapPointer } from "./context-dir.js";
import {
	buildCurationSuggestions,
	edgesForLensByName,
	findReferencesInRepo,
	loadLensView,
	renderLensView,
	validateContextRelations,
	walkAncestorsByLens,
	walkLensDescendants,
} from "./lens-view.js";

let tmpRoot: string;

function makeProject(
	opts: {
		lenses?: Array<{
			id: string;
			target?: string;
			relation_type?: string;
			derived_from_field?: string | null;
			bins: string[];
			render_uncategorized?: boolean;
		}>;
		hierarchy?: Array<{ parent_block: string; child_block: string; relation_type: string }>;
		naming?: Record<string, string>;
		issues?: Array<Record<string, unknown>>;
		frameworkGaps?: Array<Record<string, unknown>>;
		relations?: Array<{ parent: string; child: string; relation_type: string }>;
		relation_types?: Array<Record<string, unknown>>;
		// Extra block files keyed by block name → items; each is written as
		// <block>.json = { [block]: items } so buildIdIndex resolves loc.block from
		// the basename (block_kinds is empty in these fixtures).
		blocks?: Record<string, Array<Record<string, unknown>>>;
	} = {},
): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-context-lens-view-"));
	writeBootstrapPointer(dir, ".project");
	fs.mkdirSync(path.join(dir, ".project", "schemas"), { recursive: true });
	const config = {
		schema_version: "1.8.0",
		root: ".project",
		block_kinds: [],
		lenses: opts.lenses ?? [],
		...(opts.relation_types ? { relation_types: opts.relation_types } : {}),
		...(opts.hierarchy ? { hierarchy: opts.hierarchy } : {}),
		...(opts.naming ? { naming: opts.naming } : {}),
	};
	fs.writeFileSync(path.join(dir, ".project", "config.json"), JSON.stringify(config, null, 2));
	for (const [block, items] of Object.entries(opts.blocks ?? {})) {
		fs.writeFileSync(path.join(dir, ".project", `${block}.json`), JSON.stringify({ [block]: items }, null, 2));
	}
	if (opts.issues) {
		fs.writeFileSync(path.join(dir, ".project", "issues.json"), JSON.stringify({ issues: opts.issues }, null, 2));
	}
	if (opts.frameworkGaps) {
		fs.writeFileSync(
			path.join(dir, ".project", "framework-gaps.json"),
			JSON.stringify({ gaps: opts.frameworkGaps }, null, 2),
		);
	}
	if (opts.relations) {
		// pi-context relations.json is a top-level Edge[] (not {edges: [...]}).
		fs.writeFileSync(path.join(dir, ".project", "relations.json"), JSON.stringify(opts.relations, null, 2));
	}
	return dir;
}

describe("loadLensView", () => {
	afterEach(() => {
		if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
	});

	it("returns error when no config exists", () => {
		tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-context-lens-view-noconfig-"));
		writeBootstrapPointer(tmpRoot, ".project");
		fs.mkdirSync(path.join(tmpRoot, ".project"), { recursive: true });
		const result = loadLensView(tmpRoot, "any");
		assert.ok("error" in result);
		assert.match(result.error, /config\.json/);
	});

	it("returns error when lens not found in config", () => {
		tmpRoot = makeProject({
			lenses: [{ id: "by-package", target: "issues", relation_type: "x", derived_from_field: "package", bins: ["a"] }],
		});
		const result = loadLensView(tmpRoot, "missing-lens");
		assert.ok("error" in result);
		assert.match(result.error, /'missing-lens' not found/);
	});

	it("returns error when lens.target block missing", () => {
		tmpRoot = makeProject({
			lenses: [
				{
					id: "by-package",
					target: "nonexistent-block",
					relation_type: "x",
					derived_from_field: "package",
					bins: ["a"],
				},
			],
		});
		const result = loadLensView(tmpRoot, "by-package");
		assert.ok("error" in result);
		assert.match(result.error, /'nonexistent-block'/);
	});

	it("loads + groups items for an auto-derived lens", () => {
		tmpRoot = makeProject({
			lenses: [
				{
					id: "by-package",
					target: "issues",
					relation_type: "package-membership",
					derived_from_field: "package",
					bins: ["pi-context", "pi-jit-agents"],
				},
			],
			issues: [
				{ id: "issue-001", package: "pi-context" },
				{ id: "issue-002", package: "pi-jit-agents" },
			],
		});
		const result = loadLensView(tmpRoot, "by-package");
		assert.ok(!("error" in result));
		assert.equal(result.lens.id, "by-package");
		assert.equal(result.items.length, 2);
		assert.equal(result.edges.length, 2);
		assert.deepEqual(
			result.grouped.get("pi-context")?.map((i) => i.id),
			["issue-001"],
		);
		assert.deepEqual(
			result.grouped.get("pi-jit-agents")?.map((i) => i.id),
			["issue-002"],
		);
		assert.deepEqual(result.uncategorized, []);
	});

	it("identifies uncategorized items for a hand-curated lens with no edges", () => {
		tmpRoot = makeProject({
			lenses: [
				{
					id: "context-management",
					target: "issues",
					relation_type: "context-mgmt-concern",
					derived_from_field: null,
					bins: ["substrate-shape"],
				},
			],
			issues: [{ id: "issue-001" }, { id: "issue-002" }],
		});
		const result = loadLensView(tmpRoot, "context-management");
		assert.ok(!("error" in result));
		assert.equal(result.uncategorized.length, 2);
	});
});

describe("renderLensView", () => {
	afterEach(() => {
		if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
	});

	it("emits a heading per non-empty bin with item bullets", () => {
		tmpRoot = makeProject({
			lenses: [
				{
					id: "by-package",
					target: "issues",
					relation_type: "package-membership",
					derived_from_field: "package",
					bins: ["pi-context"],
				},
			],
			issues: [{ id: "issue-001", title: "first issue", status: "open", package: "pi-context" }],
		});
		const view = loadLensView(tmpRoot, "by-package");
		assert.ok(!("error" in view));
		const md = renderLensView(view, undefined);
		assert.match(md, /# Lens: by-package/);
		assert.match(md, /## pi-context/);
		assert.match(md, /\*\*issue-001\*\* \[open\] — first issue/);
	});

	it("honors lens.render_uncategorized=false", () => {
		tmpRoot = makeProject({
			lenses: [
				{
					id: "by-package",
					target: "issues",
					relation_type: "package-membership",
					derived_from_field: "package",
					bins: ["pi-context"],
					render_uncategorized: false,
				},
			],
			issues: [
				{ id: "issue-001", package: "pi-context" },
				{ id: "issue-002", package: "unknown-pkg" },
			],
		});
		const view = loadLensView(tmpRoot, "by-package");
		assert.ok(!("error" in view));
		const md = renderLensView(view, undefined);
		assert.match(md, /## pi-context/);
		assert.doesNotMatch(md, /## \(uncategorized\)/);
	});

	it("uses naming aliases for the target block when present", () => {
		tmpRoot = makeProject({
			lenses: [
				{
					id: "by-package",
					target: "issues",
					relation_type: "package-membership",
					derived_from_field: "package",
					bins: ["pi-context"],
				},
			],
			issues: [{ id: "issue-001", package: "pi-context" }],
			naming: { issues: "Issue Tracker" },
		});
		const view = loadLensView(tmpRoot, "by-package");
		assert.ok(!("error" in view));
		const md = renderLensView(view, { issues: "Issue Tracker" });
		assert.match(md, /\*\*Target:\*\* Issue Tracker/);
	});
});

describe("buildCurationSuggestions", () => {
	afterEach(() => {
		if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
	});

	it("emits a per-uncategorized-item suggestion with append-block-item shape", () => {
		tmpRoot = makeProject({
			lenses: [
				{
					id: "context-management",
					target: "issues",
					relation_type: "context-mgmt-concern",
					derived_from_field: null,
					bins: ["substrate-shape"],
				},
			],
			issues: [{ id: "issue-001", title: "an item" }],
		});
		const view = loadLensView(tmpRoot, "context-management");
		assert.ok(!("error" in view));
		const md = buildCurationSuggestions(view);
		assert.match(md, /Lens curation: context-management/);
		assert.match(md, /append-block-item/);
		assert.match(md, /name: "relations"/);
		assert.match(md, /arrayKey: "edges"/);
		assert.match(md, /issue-001/);
	});
});

describe("validateContextRelations", () => {
	afterEach(() => {
		if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
	});

	it("returns invalid + diagnostic when no config exists", () => {
		tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-context-validate-noconfig-"));
		writeBootstrapPointer(tmpRoot, ".project");
		fs.mkdirSync(path.join(tmpRoot, ".project"), { recursive: true });
		const result = validateContextRelations(tmpRoot);
		assert.equal(result.status, "invalid");
		assert.equal(result.issues[0]?.code, "edge_unknown_relation_type");
	});

	it("returns clean when no relations exist and config has no lenses/hierarchy", () => {
		tmpRoot = makeProject();
		const result = validateContextRelations(tmpRoot);
		assert.equal(result.status, "clean");
	});

	it("flags edge_unknown_relation_type for an authored edge with unknown relation_type", () => {
		tmpRoot = makeProject({
			lenses: [{ id: "x", target: "issues", relation_type: "x-rel", derived_from_field: null, bins: ["a"] }],
			issues: [{ id: "issue-001" }],
			relations: [{ parent: "a", child: "issue-001", relation_type: "totally-unknown-relation" }],
		});
		const result = validateContextRelations(tmpRoot);
		assert.equal(result.status, "invalid");
		assert.ok(result.issues.some((i) => i.code === "edge_unknown_relation_type"));
	});
});

describe("edgesForLensByName", () => {
	afterEach(() => {
		if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
	});

	it("returns synthetic edges for an auto-derived lens", () => {
		tmpRoot = makeProject({
			lenses: [
				{
					id: "by-package",
					target: "issues",
					relation_type: "package-membership",
					derived_from_field: "package",
					bins: ["pi-context"],
				},
			],
			issues: [{ id: "issue-001", package: "pi-context" }],
		});
		const result = edgesForLensByName(tmpRoot, "by-package");
		assert.ok(Array.isArray(result));
		assert.equal(result.length, 1);
		assert.equal(result[0]?.parent, "pi-context");
	});

	it("returns authored edges filtered by relation_type for hand-curated lens", () => {
		tmpRoot = makeProject({
			lenses: [{ id: "ctx", target: "issues", relation_type: "ctx-rel", derived_from_field: null, bins: ["a"] }],
			issues: [{ id: "issue-001" }],
			relations: [
				{ parent: "a", child: "issue-001", relation_type: "ctx-rel" },
				{ parent: "noise", child: "noise2", relation_type: "other-rel" },
			],
		});
		const result = edgesForLensByName(tmpRoot, "ctx");
		assert.ok(Array.isArray(result));
		assert.equal(result.length, 1);
		assert.equal(result[0]?.relation_type, "ctx-rel");
	});

	it("returns error on missing config or unknown lens", () => {
		tmpRoot = makeProject({
			lenses: [{ id: "x", target: "issues", relation_type: "x", derived_from_field: null, bins: [] }],
		});
		const result = edgesForLensByName(tmpRoot, "missing");
		assert.ok(typeof result === "object" && "error" in result);
	});
});

describe("walkLensDescendants", () => {
	afterEach(() => {
		if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
	});

	it("walks descendants under matching relation_type", () => {
		tmpRoot = makeProject({
			lenses: [],
			relations: [
				{ parent: "A", child: "B", relation_type: "blocks" },
				{ parent: "B", child: "C", relation_type: "blocks" },
				{ parent: "B", child: "D", relation_type: "other" },
			],
		});
		const result = walkLensDescendants(tmpRoot, "A", "blocks");
		assert.deepEqual(result.sort(), ["B", "C"]);
	});

	it("returns [] when no relations.json exists", () => {
		tmpRoot = makeProject();
		const result = walkLensDescendants(tmpRoot, "A", "blocks");
		assert.deepEqual(result, []);
	});
});

describe("walkAncestorsByLens", () => {
	afterEach(() => {
		if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
	});

	it("walks ancestors under matching relation_type (reverse of walkLensDescendants)", () => {
		tmpRoot = makeProject({
			lenses: [],
			relations: [
				{ parent: "A", child: "B", relation_type: "blocks" },
				{ parent: "B", child: "C", relation_type: "blocks" },
				{ parent: "B", child: "D", relation_type: "other" },
			],
		});
		const result = walkAncestorsByLens(tmpRoot, "C", "blocks");
		// Ancestors of C under "blocks" = B and A (B blocks C; A blocks B).
		assert.deepEqual(result.sort(), ["A", "B"]);
	});

	it("returns [] when no relations.json exists", () => {
		tmpRoot = makeProject();
		const result = walkAncestorsByLens(tmpRoot, "C", "blocks");
		assert.deepEqual(result, []);
	});
});

describe("walk wrong-orientation signal (FGAP-113)", () => {
	afterEach(() => {
		if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
	});

	// A DISJOINT-kind relation: source=phase, target=milestone.
	const disjointFixture = () =>
		makeProject({
			relation_types: [
				{
					canonical_id: "phase_in_milestone",
					display_name: "positioned in",
					category: "membership",
					source_kinds: ["phase"],
					target_kinds: ["milestone"],
					role_direction: "as_child",
				},
			],
			blocks: { phase: [{ id: "PHASE-1" }], milestone: [{ id: "MILE-1" }] },
			relations: [{ parent: "PHASE-1", child: "MILE-1", relation_type: "phase_in_milestone" }],
		});

	it("descendants walk from the TARGET-kind end of a disjoint relation THROWS naming walk-ancestors", () => {
		tmpRoot = disjointFixture();
		assert.throws(
			() => walkLensDescendants(tmpRoot, "MILE-1", "phase_in_milestone"),
			/TARGET endpoint[\s\S]*walk-ancestors/,
		);
	});

	it("ancestors walk from the SOURCE-kind end of a disjoint relation THROWS naming context-walk-descendants", () => {
		tmpRoot = disjointFixture();
		assert.throws(
			() => walkAncestorsByLens(tmpRoot, "PHASE-1", "phase_in_milestone"),
			/SOURCE endpoint[\s\S]*context-walk-descendants/,
		);
	});

	it("the CORRECTLY-oriented walk returns ids (no throw)", () => {
		tmpRoot = disjointFixture();
		// descendants from the SOURCE (phase) → the milestone it is positioned in.
		assert.deepEqual(walkLensDescendants(tmpRoot, "PHASE-1", "phase_in_milestone"), ["MILE-1"]);
		// ancestors from the TARGET (milestone) → the phase positioned in it.
		assert.deepEqual(walkAncestorsByLens(tmpRoot, "MILE-1", "phase_in_milestone"), ["PHASE-1"]);
	});

	it("a SAME-kind relation returns [] (no throw) — structurally un-disambiguatable", () => {
		tmpRoot = makeProject({
			relation_types: [
				{
					canonical_id: "task_before_task",
					display_name: "before",
					category: "ordering",
					source_kinds: ["tasks"],
					target_kinds: ["tasks"],
					role_direction: "as_parent",
				},
			],
			blocks: { tasks: [{ id: "t1" }, { id: "t2" }] },
			relations: [{ parent: "t1", child: "t2", relation_type: "task_before_task" }],
		});
		// Querying from EITHER end never throws for a same-kind relation.
		assert.deepEqual(walkAncestorsByLens(tmpRoot, "t1", "task_before_task"), []); // t1 has no parents
		assert.deepEqual(walkLensDescendants(tmpRoot, "t1", "task_before_task"), ["t2"]);
	});

	it("a WILDCARD-endpoint relation returns [] (no throw) — un-disambiguatable", () => {
		tmpRoot = makeProject({
			relation_types: [
				{
					canonical_id: "item_derived_from_item",
					display_name: "derived from",
					category: "data_flow",
					source_kinds: ["*"],
					target_kinds: ["*"],
					role_direction: "as_child",
				},
			],
			blocks: { tasks: [{ id: "t1" }], gaps: [{ id: "g1" }] },
			relations: [{ parent: "t1", child: "g1", relation_type: "item_derived_from_item" }],
		});
		// "*" endpoints overlap → no orientation signal from either end.
		assert.doesNotThrow(() => walkLensDescendants(tmpRoot, "g1", "item_derived_from_item"));
		assert.deepEqual(walkLensDescendants(tmpRoot, "g1", "item_derived_from_item"), []);
	});
});

describe("findReferencesInRepo", () => {
	afterEach(() => {
		if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
	});

	it("reads .project/relations.json and returns Edge[] equal to findReferences on the same edges", () => {
		const relations = [
			{ parent: "A", child: "B", relation_type: "blocks" },
			{ parent: "B", child: "C", relation_type: "blocks" },
			{ parent: "B", child: "D", relation_type: "other" },
		];
		tmpRoot = makeProject({ lenses: [], relations });
		// Inbound edges on B: one (A -> B).
		const inbound = findReferencesInRepo(tmpRoot, "B", "inbound");
		assert.strictEqual(inbound.length, 1);
		assert.deepEqual(inbound[0], { parent: "A", child: "B", relation_type: "blocks" });
		// Outbound edges from B: two (B -> C, B -> D).
		const outbound = findReferencesInRepo(tmpRoot, "B", "outbound");
		assert.strictEqual(outbound.length, 2);
		// Both: union of the three.
		const both = findReferencesInRepo(tmpRoot, "B", "both");
		assert.strictEqual(both.length, 3);
		// Default direction is 'both'.
		const defaultDir = findReferencesInRepo(tmpRoot, "B");
		assert.deepEqual(defaultDir, both);
	});

	it("returns [] when no relations.json exists", () => {
		tmpRoot = makeProject();
		const result = findReferencesInRepo(tmpRoot, "X", "both");
		assert.deepEqual(result, []);
	});
});
