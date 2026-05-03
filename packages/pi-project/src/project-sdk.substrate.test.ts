import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
	type ConfigBlock,
	displayName,
	type Edge,
	edgesForLens,
	getProjectContext,
	groupByLens,
	type ItemRecord,
	type LensSpec,
	listUncategorized,
	loadConfig,
	loadRelations,
	synthesizeFromField,
	validateRelations,
	walkDescendants,
} from "./project-sdk.js";

let tmpRoot: string;

function makeCwd(): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-project-substrate-"));
	fs.mkdirSync(path.join(dir, ".project"), { recursive: true });
	return dir;
}

function writeConfig(cwd: string, config: ConfigBlock): void {
	fs.writeFileSync(path.join(cwd, ".project", "config.json"), JSON.stringify(config, null, 2));
}

function writeRelations(cwd: string, edges: Edge[]): void {
	fs.writeFileSync(path.join(cwd, ".project", "relations.json"), JSON.stringify({ edges }, null, 2));
}

function minimalConfig(): ConfigBlock {
	return {
		schema_version: "0.2.0",
		root: ".project",
		lenses: [
			{
				id: "by-package",
				target: "issues",
				relation_type: "package-membership",
				derived_from_field: "package",
				bins: ["pi-project", "pi-jit-agents"],
				render_uncategorized: false,
			},
			{
				id: "by-status",
				target: "issues",
				relation_type: "status-class",
				derived_from_field: null,
				bins: ["open", "closed"],
				render_uncategorized: true,
			},
		],
		hierarchy: [{ parent_block: "framework-gaps", child_block: "issues", relation_type: "gap-membership" }],
	};
}

describe("loadConfig", () => {
	beforeEach(() => {
		tmpRoot = makeCwd();
	});
	afterEach(() => {
		fs.rmSync(tmpRoot, { recursive: true, force: true });
	});

	it("returns null when .project/config.json is absent", () => {
		assert.equal(loadConfig(tmpRoot), null);
	});

	it("returns parsed ConfigBlock when present and valid", () => {
		writeConfig(tmpRoot, minimalConfig());
		const cfg = loadConfig(tmpRoot);
		assert.ok(cfg);
		assert.equal(cfg.schema_version, "0.2.0");
		assert.equal(cfg.root, ".project");
		assert.equal(cfg.lenses.length, 2);
	});

	it("throws on schema validation failure", () => {
		fs.writeFileSync(
			path.join(tmpRoot, ".project", "config.json"),
			JSON.stringify({ schema_version: "0.2.0" }), // missing required: root, lenses
		);
		assert.throws(() => loadConfig(tmpRoot), /Validation failed|missing|required/i);
	});
});

describe("loadRelations", () => {
	beforeEach(() => {
		tmpRoot = makeCwd();
	});
	afterEach(() => {
		fs.rmSync(tmpRoot, { recursive: true, force: true });
	});

	it("returns [] when .project/relations.json is absent", () => {
		assert.deepEqual(loadRelations(tmpRoot), []);
	});

	it("returns unwrapped edges when present and valid", () => {
		const edges: Edge[] = [
			{ parent: "pi-project", child: "issue-001", relation_type: "package-membership" },
			{ parent: "pi-jit-agents", child: "issue-002", relation_type: "package-membership" },
		];
		writeRelations(tmpRoot, edges);
		assert.deepEqual(loadRelations(tmpRoot), edges);
	});

	it("throws on schema validation failure (missing required edge field)", () => {
		fs.writeFileSync(
			path.join(tmpRoot, ".project", "relations.json"),
			JSON.stringify({ edges: [{ parent: "x", child: "y" }] }), // missing relation_type
		);
		assert.throws(() => loadRelations(tmpRoot), /Validation failed|missing|required/i);
	});
});

describe("getProjectContext", () => {
	beforeEach(() => {
		tmpRoot = makeCwd();
	});
	afterEach(() => {
		fs.rmSync(tmpRoot, { recursive: true, force: true });
	});

	it("returns cached snapshot when mtimes unchanged", () => {
		writeConfig(tmpRoot, minimalConfig());
		writeRelations(tmpRoot, []);
		const first = getProjectContext(tmpRoot);
		const second = getProjectContext(tmpRoot);
		assert.equal(first, second, "second call should return same object reference (cache hit)");
	});

	it("reloads when config mtime changes", async () => {
		writeConfig(tmpRoot, minimalConfig());
		const first = getProjectContext(tmpRoot);
		// Bump mtime forward — real filesystems may collapse same-millisecond writes
		await new Promise((r) => setTimeout(r, 20));
		const updated = minimalConfig();
		updated.naming = { issues: "Issue Tracker" };
		writeConfig(tmpRoot, updated);
		const second = getProjectContext(tmpRoot);
		assert.notEqual(first, second, "second call should return new object after mtime change");
		assert.deepEqual(second.config?.naming, { issues: "Issue Tracker" });
	});

	it("handles absent files (mtime null) without throwing", () => {
		const ctx = getProjectContext(tmpRoot);
		assert.equal(ctx.config, null);
		assert.deepEqual(ctx.relations, []);
		assert.equal(ctx.configMtime, null);
		assert.equal(ctx.relationsMtime, null);
	});
});

describe("synthesizeFromField", () => {
	const lens: LensSpec = {
		id: "by-package",
		target: "issues",
		relation_type: "package-membership",
		derived_from_field: "package",
		bins: ["pi-project", "pi-jit-agents"],
	};

	it("emits edges for items with the derived field", () => {
		const items: ItemRecord[] = [
			{ id: "issue-001", package: "pi-project" },
			{ id: "issue-002", package: "pi-jit-agents" },
		];
		const edges = synthesizeFromField(lens, items);
		assert.deepEqual(edges, [
			{ parent: "pi-project", child: "issue-001", relation_type: "package-membership" },
			{ parent: "pi-jit-agents", child: "issue-002", relation_type: "package-membership" },
		]);
	});

	it("skips items where the derived field is missing or non-string", () => {
		const items: ItemRecord[] = [
			{ id: "issue-001", package: "pi-project" },
			{ id: "issue-002" },
			{ id: "issue-003", package: 42 },
		];
		const edges = synthesizeFromField(lens, items);
		assert.equal(edges.length, 1);
		assert.equal(edges[0]?.child, "issue-001");
	});

	it("returns [] when derived_from_field is null", () => {
		const handCurated: LensSpec = { ...lens, derived_from_field: null };
		assert.deepEqual(synthesizeFromField(handCurated, [{ id: "x" }]), []);
	});
});

describe("edgesForLens", () => {
	it("synthesizes when derived_from_field is set", () => {
		const lens: LensSpec = {
			id: "by-package",
			target: "issues",
			relation_type: "package-membership",
			derived_from_field: "package",
			bins: ["pi-project"],
		};
		const items: ItemRecord[] = [{ id: "issue-001", package: "pi-project" }];
		const authored: Edge[] = [{ parent: "noise", child: "noise", relation_type: "other" }];
		const edges = edgesForLens(lens, items, authored);
		assert.equal(edges.length, 1);
		assert.equal(edges[0]?.relation_type, "package-membership");
	});

	it("filters authored when derived_from_field is null", () => {
		const lens: LensSpec = {
			id: "context-management",
			target: "issues",
			relation_type: "context-mgmt-concern",
			derived_from_field: null,
			bins: ["substrate-shape"],
		};
		const items: ItemRecord[] = [{ id: "issue-001" }];
		const authored: Edge[] = [
			{ parent: "substrate-shape", child: "issue-001", relation_type: "context-mgmt-concern" },
			{ parent: "noise", child: "issue-002", relation_type: "other-relation" },
		];
		const edges = edgesForLens(lens, items, authored);
		assert.equal(edges.length, 1);
		assert.equal(edges[0]?.parent, "substrate-shape");
	});
});

describe("walkDescendants", () => {
	it("returns descendants under matching relation_type", () => {
		const edges: Edge[] = [
			{ parent: "A", child: "B", relation_type: "r" },
			{ parent: "B", child: "C", relation_type: "r" },
			{ parent: "B", child: "D", relation_type: "other" },
		];
		const out = walkDescendants("A", "r", edges);
		assert.deepEqual(out.sort(), ["B", "C"]);
	});

	it("terminates on cycles via visited-set guard", () => {
		const edges: Edge[] = [
			{ parent: "A", child: "B", relation_type: "r" },
			{ parent: "B", child: "C", relation_type: "r" },
			{ parent: "C", child: "A", relation_type: "r" },
		];
		const out = walkDescendants("A", "r", edges);
		assert.deepEqual(out.sort(), ["A", "B", "C"]);
	});

	it("returns [] for unknown root", () => {
		assert.deepEqual(walkDescendants("nope", "r", []), []);
	});
});

describe("groupByLens", () => {
	it("places items into bins per edge.parent and uncategorized otherwise", () => {
		const lens: LensSpec = {
			id: "context-management",
			target: "issues",
			relation_type: "context-mgmt-concern",
			derived_from_field: null,
			bins: ["substrate-shape", "context-projection"],
		};
		const items: ItemRecord[] = [{ id: "issue-001" }, { id: "issue-002" }, { id: "issue-003" }];
		const edges: Edge[] = [
			{ parent: "substrate-shape", child: "issue-001", relation_type: "context-mgmt-concern" },
			{ parent: "context-projection", child: "issue-002", relation_type: "context-mgmt-concern" },
		];
		const grouped = groupByLens(items, lens, edges);
		assert.deepEqual(
			grouped.get("substrate-shape")?.map((i) => i.id),
			["issue-001"],
		);
		assert.deepEqual(
			grouped.get("context-projection")?.map((i) => i.id),
			["issue-002"],
		);
		assert.deepEqual(
			grouped.get("(uncategorized)")?.map((i) => i.id),
			["issue-003"],
		);
	});

	it("pre-populates declared bins even when empty", () => {
		const lens: LensSpec = {
			id: "x",
			target: "items",
			relation_type: "r",
			derived_from_field: null,
			bins: ["a", "b"],
		};
		const grouped = groupByLens([], lens, []);
		assert.deepEqual([...grouped.keys()].sort(), ["(uncategorized)", "a", "b"]);
	});

	it("silently skips edges whose parent is not in lens.bins", () => {
		const lens: LensSpec = {
			id: "x",
			target: "items",
			relation_type: "r",
			derived_from_field: null,
			bins: ["a"],
		};
		const items: ItemRecord[] = [{ id: "i1" }];
		const edges: Edge[] = [{ parent: "z-not-a-bin", child: "i1", relation_type: "r" }];
		const grouped = groupByLens(items, lens, edges);
		assert.deepEqual(grouped.get("a"), []);
		assert.deepEqual(
			grouped.get("(uncategorized)")?.map((i) => i.id),
			["i1"],
		);
	});
});

describe("validateRelations — existing checks", () => {
	const config: ConfigBlock = {
		schema_version: "0.2.0",
		root: ".project",
		lenses: [
			{
				id: "context-management",
				target: "issues",
				relation_type: "context-mgmt-concern",
				derived_from_field: null,
				bins: ["substrate-shape"],
			},
		],
		hierarchy: [{ parent_block: "framework-gaps", child_block: "issues", relation_type: "gap-membership" }],
	};
	const itemsByBlock: Record<string, ItemRecord[]> = {
		issues: [{ id: "issue-001" }, { id: "issue-002" }],
		"framework-gaps": [{ id: "FGAP-001" }],
	};

	it("clean status when all edges valid", () => {
		const edges: Edge[] = [
			{ parent: "substrate-shape", child: "issue-001", relation_type: "context-mgmt-concern" },
			{ parent: "FGAP-001", child: "issue-002", relation_type: "gap-membership" },
		];
		const result = validateRelations(config, edges, itemsByBlock);
		assert.equal(result.status, "clean");
		assert.equal(result.issues.length, 0);
	});

	it("edge_unknown_relation_type", () => {
		const edges: Edge[] = [{ parent: "x", child: "y", relation_type: "nope-not-a-real-relation" }];
		const result = validateRelations(config, edges, itemsByBlock);
		assert.equal(result.status, "invalid");
		assert.ok(result.issues.some((i) => i.code === "edge_unknown_relation_type"));
	});

	it("edge_parent_not_in_bins", () => {
		const edges: Edge[] = [{ parent: "typo-bin", child: "issue-001", relation_type: "context-mgmt-concern" }];
		const result = validateRelations(config, edges, itemsByBlock);
		assert.ok(result.issues.some((i) => i.code === "edge_parent_not_in_bins"));
	});

	it("edge_unresolved_child for lens edge", () => {
		const edges: Edge[] = [{ parent: "substrate-shape", child: "issue-9999", relation_type: "context-mgmt-concern" }];
		const result = validateRelations(config, edges, itemsByBlock);
		assert.ok(result.issues.some((i) => i.code === "edge_unresolved_child"));
	});

	it("edge_parent_wrong_block for hierarchy edge", () => {
		const edges: Edge[] = [{ parent: "issue-001", child: "issue-002", relation_type: "gap-membership" }];
		const result = validateRelations(config, edges, itemsByBlock);
		assert.ok(result.issues.some((i) => i.code === "edge_parent_wrong_block"));
	});
});

describe("validateRelations — cycle detection", () => {
	const baseConfig: ConfigBlock = {
		schema_version: "0.2.0",
		root: ".project",
		lenses: [],
		hierarchy: [{ parent_block: "issues", child_block: "issues", relation_type: "blocks" }],
	};
	const itemsByBlock: Record<string, ItemRecord[]> = {
		issues: [{ id: "A" }, { id: "B" }, { id: "C" }, { id: "D" }],
	};

	it("detects 2-node cycle", () => {
		const edges: Edge[] = [
			{ parent: "A", child: "B", relation_type: "blocks" },
			{ parent: "B", child: "A", relation_type: "blocks" },
		];
		const result = validateRelations(baseConfig, edges, itemsByBlock);
		const cycleIssues = result.issues.filter((i) => i.code === "edge_cycle_detected");
		assert.equal(cycleIssues.length, 1);
		assert.equal(cycleIssues[0]?.relation_type, "blocks");
		assert.ok(cycleIssues[0]?.cycle?.length === 3); // [A, B, A] or [B, A, B]
	});

	it("detects 3-node cycle", () => {
		const edges: Edge[] = [
			{ parent: "A", child: "B", relation_type: "blocks" },
			{ parent: "B", child: "C", relation_type: "blocks" },
			{ parent: "C", child: "A", relation_type: "blocks" },
		];
		const result = validateRelations(baseConfig, edges, itemsByBlock);
		const cycleIssues = result.issues.filter((i) => i.code === "edge_cycle_detected");
		assert.equal(cycleIssues.length, 1);
		assert.equal(cycleIssues[0]?.cycle?.length, 4); // start..start
	});

	it("detects self-loop", () => {
		const edges: Edge[] = [{ parent: "A", child: "A", relation_type: "blocks" }];
		const result = validateRelations(baseConfig, edges, itemsByBlock);
		const cycleIssues = result.issues.filter((i) => i.code === "edge_cycle_detected");
		assert.equal(cycleIssues.length, 1);
		assert.deepEqual(cycleIssues[0]?.cycle, ["A", "A"]);
	});

	it("detects cycle in only one component of a multi-component graph", () => {
		const edges: Edge[] = [
			{ parent: "A", child: "B", relation_type: "blocks" }, // acyclic
			{ parent: "C", child: "D", relation_type: "blocks" },
			{ parent: "D", child: "C", relation_type: "blocks" }, // cycle
		];
		const result = validateRelations(baseConfig, edges, itemsByBlock);
		const cycleIssues = result.issues.filter((i) => i.code === "edge_cycle_detected");
		assert.equal(cycleIssues.length, 1);
		const cycle = cycleIssues[0]?.cycle ?? [];
		const cycleNodes = new Set(cycle);
		assert.ok(cycleNodes.has("C"));
		assert.ok(cycleNodes.has("D"));
		assert.ok(!cycleNodes.has("A"));
		assert.ok(!cycleNodes.has("B"));
	});

	it("does not emit cycle issues for acyclic graphs", () => {
		const edges: Edge[] = [
			{ parent: "A", child: "B", relation_type: "blocks" },
			{ parent: "B", child: "C", relation_type: "blocks" },
			{ parent: "B", child: "D", relation_type: "blocks" },
		];
		const result = validateRelations(baseConfig, edges, itemsByBlock);
		const cycleIssues = result.issues.filter((i) => i.code === "edge_cycle_detected");
		assert.equal(cycleIssues.length, 0);
	});

	it("partitions cycles by relation_type — same nodes in different relation_types do not cross-detect", () => {
		const config: ConfigBlock = {
			schema_version: "0.2.0",
			root: ".project",
			lenses: [],
			hierarchy: [
				{ parent_block: "issues", child_block: "issues", relation_type: "blocks" },
				{ parent_block: "issues", child_block: "issues", relation_type: "supersedes" },
			],
		};
		const edges: Edge[] = [
			{ parent: "A", child: "B", relation_type: "blocks" },
			{ parent: "B", child: "A", relation_type: "supersedes" }, // not a cycle in either subgraph alone
		];
		const result = validateRelations(config, edges, itemsByBlock);
		const cycleIssues = result.issues.filter((i) => i.code === "edge_cycle_detected");
		assert.equal(cycleIssues.length, 0);
	});
});

describe("displayName", () => {
	it("returns canonical id when naming is undefined", () => {
		assert.equal(displayName("issues", undefined), "issues");
	});

	it("returns alias when present", () => {
		assert.equal(displayName("issues", { issues: "Issue Tracker" }), "Issue Tracker");
	});

	it("returns canonical id when alias absent", () => {
		assert.equal(displayName("issues", { other: "Other" }), "issues");
	});
});

describe("listUncategorized", () => {
	const lens: LensSpec = {
		id: "x",
		target: "items",
		relation_type: "r",
		derived_from_field: null,
		bins: ["a", "b"],
	};

	it("returns empty uncategorized list when grouped has none", () => {
		const grouped = new Map<string, ItemRecord[]>([["(uncategorized)", []]]);
		const { uncategorized, suggestionTemplate } = listUncategorized(lens, grouped);
		assert.deepEqual(uncategorized, []);
		assert.equal(typeof suggestionTemplate, "function");
	});

	it("emits a curation suggestion with correct payload shape", () => {
		const grouped = new Map<string, ItemRecord[]>([["(uncategorized)", [{ id: "issue-001" }]]]);
		const { uncategorized, suggestionTemplate } = listUncategorized(lens, grouped);
		assert.equal(uncategorized.length, 1);
		const item = uncategorized[0];
		assert.ok(item, "uncategorized list must contain at least one item for this assertion");
		const suggestion = suggestionTemplate("a", item);
		assert.equal(suggestion.would_append_to, "relations.json#/edges");
		assert.deepEqual(suggestion.payload, {
			parent: "a",
			child: "issue-001",
			relation_type: "r",
		});
	});
});
