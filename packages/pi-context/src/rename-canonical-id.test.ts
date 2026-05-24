/**
 * Tests for the FGAP-060 / DEC-0035 canonical_id rename engine.
 *
 * Fixture pattern mirrors context.test.ts / context-sdk.test.ts:
 * mkdtemp + writeBootstrapPointer(".project") + raw-write config.json /
 * relations.json / block files. writeConfig / writeRelations (the engine's
 * write path) validate against the BUNDLED config / relations schemas, so
 * every fixture config must satisfy config.schema.json and every fixture
 * relations array must satisfy relations.schema.json.
 *
 * The item-rename home-block write goes through updateItemInBlock, which uses
 * the block's `.project/schemas/<block>.schema.json` IF present, else null
 * (skip AJV). The fixtures intentionally ship no per-block schema so the home
 * write is unvalidated — isolating the test to the rename logic itself.
 */

import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import type { ConfigBlock, Edge } from "./context.js";
import { writeBootstrapPointer } from "./context-dir.js";
import { renameCanonicalId } from "./rename-canonical-id.js";

function makeTmpDir(prefix: string): string {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), `rename-${prefix}-`));
	writeBootstrapPointer(cwd, ".project");
	return cwd;
}

function writeConfig(cwd: string, cfg: ConfigBlock | Record<string, unknown>): void {
	const dir = path.join(cwd, ".project");
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify(cfg, null, 2));
}

function writeRelations(cwd: string, edges: Edge[]): void {
	const dir = path.join(cwd, ".project");
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(path.join(dir, "relations.json"), JSON.stringify(edges, null, 2));
}

function writeBlockFile(cwd: string, blockName: string, data: unknown): void {
	const dir = path.join(cwd, ".project");
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(path.join(dir, `${blockName}.json`), JSON.stringify(data, null, 2));
}

function readBlockFile(cwd: string, blockName: string): Record<string, unknown> {
	return JSON.parse(fs.readFileSync(path.join(cwd, ".project", `${blockName}.json`), "utf-8"));
}

function readConfigFile(cwd: string): ConfigBlock {
	return JSON.parse(fs.readFileSync(path.join(cwd, ".project", "config.json"), "utf-8"));
}

function readRelationsFile(cwd: string): Edge[] {
	return JSON.parse(fs.readFileSync(path.join(cwd, ".project", "relations.json"), "utf-8"));
}

/** Minimal config satisfying config.schema.json with a DEC- block_kind so an
 * item id "DEC-0001" found in decisions.json passes buildIdIndex's
 * prefix-vs-block invariant. */
function itemConfig(): ConfigBlock {
	return {
		schema_version: "1.0.0",
		root: ".project",
		block_kinds: [
			{
				canonical_id: "decisions",
				display_name: "Design Decisions",
				prefix: "DEC-",
				schema_path: "schemas/decisions.schema.json",
				array_key: "decisions",
				data_path: "decisions.json",
			},
		],
	};
}

// ── item rename ──────────────────────────────────────────────────────────────

describe("renameCanonicalId — item", () => {
	it("rewrites home block id + all incident edges", (t) => {
		const cwd = makeTmpDir("item");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		writeConfig(cwd, itemConfig());
		writeBlockFile(cwd, "decisions", { decisions: [{ id: "DEC-0001", title: "first" }, { id: "DEC-0002" }] });
		writeRelations(cwd, [
			{ parent: "DEC-0001", child: "DEC-0002", relation_type: "supersedes" },
			{ parent: "DEC-0002", child: "DEC-0001", relation_type: "refines" },
		]);

		const report = renameCanonicalId(cwd, "item", "DEC-0001", "DEC-0100");

		// Home block id rewritten
		const decisions = readBlockFile(cwd, "decisions").decisions as Array<Record<string, unknown>>;
		assert.ok(decisions.some((d) => d.id === "DEC-0100"));
		assert.ok(!decisions.some((d) => d.id === "DEC-0001"));
		// title preserved (id-only patch is a shallow merge)
		assert.strictEqual(decisions.find((d) => d.id === "DEC-0100")!.title, "first");

		// Edges rewritten — no edge references DEC-0001, both reference DEC-0100
		const edges = readRelationsFile(cwd);
		assert.ok(!edges.some((e) => e.parent === "DEC-0001" || e.child === "DEC-0001"));
		assert.strictEqual(edges.filter((e) => e.parent === "DEC-0100" || e.child === "DEC-0100").length, 2);

		// Report counts
		const idRewrite = report.substrateRewrites.find((r) => r.file === "decisions.json" && r.field === "id");
		assert.ok(idRewrite);
		assert.strictEqual(idRewrite!.count, 1);
		const edgeRewrite = report.substrateRewrites.find((r) => r.file === "relations.json");
		assert.ok(edgeRewrite);
		assert.strictEqual(edgeRewrite!.count, 2); // DEC-0001 appears once as parent, once as child
	});
});

// ── relation_type rename ─────────────────────────────────────────────────────

describe("renameCanonicalId — relation_type", () => {
	it("rewrites config relation_types + invariants + lenses + hierarchy + edges", (t) => {
		const cwd = makeTmpDir("reltype");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		const cfg: ConfigBlock = {
			schema_version: "1.0.0",
			root: ".project",
			block_kinds: [
				{
					canonical_id: "decisions",
					display_name: "Design Decisions",
					prefix: "DEC-",
					schema_path: "schemas/decisions.schema.json",
					array_key: "decisions",
					data_path: "decisions.json",
				},
			],
			relation_types: [{ canonical_id: "old_rel", display_name: "Old Rel", category: "membership" }],
			invariants: [
				{
					id: "INV-1",
					class: "requires-edge",
					block: "decisions",
					relation_types: ["old_rel"],
					direction: "as_child",
				},
			],
			lenses: [{ id: "some-lens", bins: ["a"], relation_type: "old_rel" }],
			hierarchy: [{ parent_block: "decisions", child_block: "decisions", relation_type: "old_rel" }],
		};
		writeConfig(cwd, cfg);
		writeRelations(cwd, [{ parent: "a", child: "DEC-0001", relation_type: "old_rel" }]);

		const report = renameCanonicalId(cwd, "relation_type", "old_rel", "new_rel");

		const out = readConfigFile(cwd);
		assert.strictEqual(out.relation_types![0].canonical_id, "new_rel");
		assert.deepStrictEqual(out.invariants![0].relation_types, ["new_rel"]);
		assert.strictEqual(out.lenses![0].relation_type, "new_rel");
		assert.strictEqual(out.hierarchy![0].relation_type, "new_rel");

		const edges = readRelationsFile(cwd);
		assert.strictEqual(edges[0].relation_type, "new_rel");

		// oldId is gone from every config surface
		const json = JSON.stringify(out) + JSON.stringify(edges);
		assert.ok(!json.includes("old_rel"));

		// Report surfaces every rewritten surface
		const fields = report.substrateRewrites.map((r) => r.field);
		assert.ok(fields.includes("relation_types[].canonical_id"));
		assert.ok(fields.includes("invariants[].relation_types[]"));
		assert.ok(fields.includes("lenses[].relation_type"));
		assert.ok(fields.includes("hierarchy[].relation_type"));
		assert.ok(fields.includes("relation_type"));
	});
});

// ── lens rename ──────────────────────────────────────────────────────────────

describe("renameCanonicalId — lens", () => {
	it("rewrites lens id + composition member references", (t) => {
		const cwd = makeTmpDir("lens");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		const cfg: ConfigBlock = {
			schema_version: "1.0.0",
			root: ".project",
			block_kinds: [
				{
					canonical_id: "decisions",
					display_name: "Design Decisions",
					prefix: "DEC-",
					schema_path: "schemas/decisions.schema.json",
					array_key: "decisions",
					data_path: "decisions.json",
				},
			],
			lenses: [
				{ id: "old-lens", bins: ["a"], kind: "target", target: "decisions" },
				{ id: "combo", bins: [], kind: "composition", members: [{ lens: "old-lens" }] },
			],
		};
		writeConfig(cwd, cfg);

		const report = renameCanonicalId(cwd, "lens", "old-lens", "new-lens");

		const out = readConfigFile(cwd);
		assert.ok(out.lenses!.some((l) => l.id === "new-lens"));
		assert.ok(!out.lenses!.some((l) => l.id === "old-lens"));
		const combo = out.lenses!.find((l) => l.id === "combo")!;
		assert.strictEqual(combo.members![0].lens, "new-lens");

		const fields = report.substrateRewrites.map((r) => r.field);
		assert.ok(fields.includes("lenses[].id"));
		assert.ok(fields.includes("lenses[].members[].lens"));
	});
});

// ── layer rename ─────────────────────────────────────────────────────────────

describe("renameCanonicalId — layer", () => {
	it("rewrites layer id + block_kinds[].layer FK", (t) => {
		const cwd = makeTmpDir("layer");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		const cfg: ConfigBlock = {
			schema_version: "1.0.0",
			root: ".project",
			layers: [{ id: "L1", display_name: "Layer One" }],
			block_kinds: [
				{
					canonical_id: "decisions",
					display_name: "Design Decisions",
					prefix: "DEC-",
					schema_path: "schemas/decisions.schema.json",
					array_key: "decisions",
					data_path: "decisions.json",
					layer: "L1",
				},
			],
		};
		writeConfig(cwd, cfg);

		const report = renameCanonicalId(cwd, "layer", "L1", "L1-renamed");

		const out = readConfigFile(cwd);
		assert.strictEqual(out.layers![0].id, "L1-renamed");
		assert.strictEqual(out.block_kinds[0].layer, "L1-renamed");

		const fields = report.substrateRewrites.map((r) => r.field);
		assert.ok(fields.includes("layers[].id"));
		assert.ok(fields.includes("block_kinds[].layer"));
	});
});

// ── dryRun ───────────────────────────────────────────────────────────────────

describe("renameCanonicalId — dryRun", () => {
	it("performs ZERO writes but still reports would-change counts", (t) => {
		const cwd = makeTmpDir("dry");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		writeConfig(cwd, itemConfig());
		writeBlockFile(cwd, "decisions", { decisions: [{ id: "DEC-0001" }] });
		writeRelations(cwd, [{ parent: "DEC-0001", child: "DEC-0002", relation_type: "supersedes" }]);

		const configBefore = fs.readFileSync(path.join(cwd, ".project", "config.json"), "utf-8");
		const relationsBefore = fs.readFileSync(path.join(cwd, ".project", "relations.json"), "utf-8");
		const blockBefore = fs.readFileSync(path.join(cwd, ".project", "decisions.json"), "utf-8");

		const report = renameCanonicalId(cwd, "item", "DEC-0001", "DEC-0100", { dryRun: true });

		// Files byte-identical
		assert.strictEqual(fs.readFileSync(path.join(cwd, ".project", "config.json"), "utf-8"), configBefore);
		assert.strictEqual(fs.readFileSync(path.join(cwd, ".project", "relations.json"), "utf-8"), relationsBefore);
		assert.strictEqual(fs.readFileSync(path.join(cwd, ".project", "decisions.json"), "utf-8"), blockBefore);

		// oldId still present
		assert.ok(blockBefore.includes("DEC-0001"));

		// Report still shows would-change counts
		assert.strictEqual(report.dryRun, true);
		assert.ok(report.substrateRewrites.find((r) => r.file === "decisions.json" && r.field === "id"));
		const edgeRewrite = report.substrateRewrites.find((r) => r.file === "relations.json");
		assert.ok(edgeRewrite);
		assert.strictEqual(edgeRewrite!.count, 1);
	});
});

// ── guards: collision ────────────────────────────────────────────────────────

describe("renameCanonicalId — collision", () => {
	it("throws when newId already exists (item)", (t) => {
		const cwd = makeTmpDir("collide");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		writeConfig(cwd, itemConfig());
		writeBlockFile(cwd, "decisions", { decisions: [{ id: "DEC-0001" }, { id: "DEC-0002" }] });

		assert.throws(() => renameCanonicalId(cwd, "item", "DEC-0001", "DEC-0002"), /collision/);
	});

	it("throws when newId already exists (relation_type)", (t) => {
		const cwd = makeTmpDir("collide-rt");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		const cfg: ConfigBlock = {
			schema_version: "1.0.0",
			root: ".project",
			block_kinds: itemConfig().block_kinds,
			relation_types: [
				{ canonical_id: "a", display_name: "A", category: "membership" },
				{ canonical_id: "b", display_name: "B", category: "membership" },
			],
		};
		writeConfig(cwd, cfg);

		assert.throws(() => renameCanonicalId(cwd, "relation_type", "a", "b"), /collision/);
	});
});

// ── guards: missing ──────────────────────────────────────────────────────────

describe("renameCanonicalId — missing", () => {
	it("throws when oldId is not present (item)", (t) => {
		const cwd = makeTmpDir("missing");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		writeConfig(cwd, itemConfig());
		writeBlockFile(cwd, "decisions", { decisions: [{ id: "DEC-0001" }] });

		assert.throws(() => renameCanonicalId(cwd, "item", "DEC-9999", "DEC-0002"), /not found/);
	});
});

// ── guards: block_kind unsupported ───────────────────────────────────────────

describe("renameCanonicalId — block_kind", () => {
	it("throws 'not supported' before any substrate access", (t) => {
		const cwd = makeTmpDir("blockkind");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		writeConfig(cwd, itemConfig());

		assert.throws(() => renameCanonicalId(cwd, "block_kind", "decisions", "decs"), /not supported/);
	});

	it("throws on unknown kind", (t) => {
		const cwd = makeTmpDir("unknown");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		writeConfig(cwd, itemConfig());
		writeBlockFile(cwd, "decisions", { decisions: [{ id: "DEC-0001" }] });

		assert.throws(() => renameCanonicalId(cwd, "wat", "DEC-0001", "DEC-0002"), /unknown kind/);
	});
});

// ── out-of-substrate (report-only) ───────────────────────────────────────────

describe("renameCanonicalId — out-of-substrate", () => {
	it("reports analysis md matches without rewriting the md", (t) => {
		const cwd = makeTmpDir("oos");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		writeConfig(cwd, itemConfig());
		writeBlockFile(cwd, "decisions", { decisions: [{ id: "DEC-0001" }] });
		writeRelations(cwd, []);

		const analysisDir = path.join(cwd, "analysis");
		fs.mkdirSync(analysisDir, { recursive: true });
		const mdPath = path.join(analysisDir, "x.md");
		const mdContent = "# notes\n\nThis references DEC-0001 in prose.\n";
		fs.writeFileSync(mdPath, mdContent);

		const report = renameCanonicalId(cwd, "item", "DEC-0001", "DEC-0100");

		// Report carries an entry for the analysis md
		assert.ok(report.outOfSubstrate.some((o) => o.source.includes("x.md")));

		// The md file is UNCHANGED (report-only)
		assert.strictEqual(fs.readFileSync(mdPath, "utf-8"), mdContent);
	});
});
