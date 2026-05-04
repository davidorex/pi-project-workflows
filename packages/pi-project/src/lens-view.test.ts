import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import {
	buildCurationSuggestions,
	edgesForLensByName,
	loadLensView,
	renderLensView,
	validateProjectRelations,
	walkLensDescendants,
} from "./lens-view.js";

let tmpRoot: string;

function makeProject(
	opts: {
		lenses?: Array<{
			id: string;
			target: string;
			relation_type: string;
			derived_from_field: string | null;
			bins: string[];
			render_uncategorized?: boolean;
		}>;
		hierarchy?: Array<{ parent_block: string; child_block: string; relation_type: string }>;
		naming?: Record<string, string>;
		issues?: Array<Record<string, unknown>>;
		frameworkGaps?: Array<Record<string, unknown>>;
		relations?: Array<{ parent: string; child: string; relation_type: string }>;
	} = {},
): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-project-lens-view-"));
	fs.mkdirSync(path.join(dir, ".project", "schemas"), { recursive: true });
	const config = {
		schema_version: "0.2.0",
		root: ".project",
		lenses: opts.lenses ?? [],
		...(opts.hierarchy ? { hierarchy: opts.hierarchy } : {}),
		...(opts.naming ? { naming: opts.naming } : {}),
	};
	fs.writeFileSync(path.join(dir, ".project", "config.json"), JSON.stringify(config, null, 2));
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
		fs.writeFileSync(path.join(dir, ".project", "relations.json"), JSON.stringify({ edges: opts.relations }, null, 2));
	}
	return dir;
}

describe("loadLensView", () => {
	afterEach(() => {
		if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
	});

	it("returns error when no config exists", () => {
		tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-project-lens-view-noconfig-"));
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
					bins: ["pi-project", "pi-jit-agents"],
				},
			],
			issues: [
				{ id: "issue-001", package: "pi-project" },
				{ id: "issue-002", package: "pi-jit-agents" },
			],
		});
		const result = loadLensView(tmpRoot, "by-package");
		assert.ok(!("error" in result));
		assert.equal(result.lens.id, "by-package");
		assert.equal(result.items.length, 2);
		assert.equal(result.edges.length, 2);
		assert.deepEqual(
			result.grouped.get("pi-project")?.map((i) => i.id),
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
					bins: ["pi-project"],
				},
			],
			issues: [{ id: "issue-001", title: "first issue", status: "open", package: "pi-project" }],
		});
		const view = loadLensView(tmpRoot, "by-package");
		assert.ok(!("error" in view));
		const md = renderLensView(view, undefined);
		assert.match(md, /# Lens: by-package/);
		assert.match(md, /## pi-project/);
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
					bins: ["pi-project"],
					render_uncategorized: false,
				},
			],
			issues: [
				{ id: "issue-001", package: "pi-project" },
				{ id: "issue-002", package: "unknown-pkg" },
			],
		});
		const view = loadLensView(tmpRoot, "by-package");
		assert.ok(!("error" in view));
		const md = renderLensView(view, undefined);
		assert.match(md, /## pi-project/);
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
					bins: ["pi-project"],
				},
			],
			issues: [{ id: "issue-001", package: "pi-project" }],
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

describe("validateProjectRelations", () => {
	afterEach(() => {
		if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
	});

	it("returns invalid + diagnostic when no config exists", () => {
		tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-project-validate-noconfig-"));
		fs.mkdirSync(path.join(tmpRoot, ".project"), { recursive: true });
		const result = validateProjectRelations(tmpRoot);
		assert.equal(result.status, "invalid");
		assert.equal(result.issues[0]?.code, "edge_unknown_relation_type");
	});

	it("returns clean when no relations exist and config has no lenses/hierarchy", () => {
		tmpRoot = makeProject();
		const result = validateProjectRelations(tmpRoot);
		assert.equal(result.status, "clean");
	});

	it("flags edge_unknown_relation_type for an authored edge with unknown relation_type", () => {
		tmpRoot = makeProject({
			lenses: [{ id: "x", target: "issues", relation_type: "x-rel", derived_from_field: null, bins: ["a"] }],
			issues: [{ id: "issue-001" }],
			relations: [{ parent: "a", child: "issue-001", relation_type: "totally-unknown-relation" }],
		});
		const result = validateProjectRelations(tmpRoot);
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
					bins: ["pi-project"],
				},
			],
			issues: [{ id: "issue-001", package: "pi-project" }],
		});
		const result = edgesForLensByName(tmpRoot, "by-package");
		assert.ok(Array.isArray(result));
		assert.equal(result.length, 1);
		assert.equal(result[0]?.parent, "pi-project");
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
