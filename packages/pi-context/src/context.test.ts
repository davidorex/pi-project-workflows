/**
 * Tests for substrate SDK (context.ts) — covers loaders, mtime cache,
 * synthesis, traversal, projection, display-name resolution, curation
 * surface, and the seven validateRelations issue codes.
 */

import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
	type ConfigBlock,
	displayName,
	type Edge,
	edgesForLens,
	findReferences,
	findUnmaterializedAssets,
	groupByLens,
	type ItemRecord,
	installedBlockDestPath,
	installedSchemaDestPath,
	type LensSpec,
	listUncategorized,
	loadConfig,
	loadContext,
	loadRelations,
	resolveComposition,
	type SubstrateValidationIssue,
	synthesizeFromField,
	validateRelations,
	walkAncestors,
	walkDescendants,
} from "./context.js";
import { resolveContextDir, writeBootstrapPointer } from "./context-dir.js";
import { appendMigrationDeclForDir, seedCatalogConfigMigrationDecls } from "./migrations-store.js";
import { ValidationError } from "./schema-validator.js";

function makeTmpDir(prefix: string): string {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), `pcx-${prefix}-`));
	writeBootstrapPointer(cwd, ".project");
	return cwd;
}

function writeConfig(tmpDir: string, cfg: ConfigBlock | Record<string, unknown>): void {
	const dir = path.join(tmpDir, ".project");
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify(cfg));
}

function writeRelations(tmpDir: string, edges: Edge[]): void {
	const dir = path.join(tmpDir, ".project");
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(path.join(dir, "relations.json"), JSON.stringify(edges));
}

const minimalConfig = (): ConfigBlock => ({
	schema_version: "1.8.0",
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
});

// ── Installed-asset materialization helpers (part of the /context start
// single-entry-point bootstrap state machine, phase 1) ─────────

describe("installed-asset materialization helpers", () => {
	it("dest-path helpers derive resolveContextDir-relative locations (single source shared with installContext)", () => {
		const root = path.join(path.sep, "tmp", "x", ".project");
		assert.strictEqual(installedSchemaDestPath(root, "tasks"), path.join(root, "schemas", "tasks.schema.json"));
		assert.strictEqual(installedBlockDestPath(root, "tasks"), path.join(root, "tasks.json"));
	});

	it("findUnmaterializedAssets returns only the declared-but-absent assets", (t) => {
		const tmp = makeTmpDir("unmaterialized");
		t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
		const cfg: ConfigBlock = {
			schema_version: "1.8.0",
			root: ".project",
			block_kinds: [],
			installed_schemas: ["foo", "bar"],
			installed_blocks: ["baz"],
		};
		writeConfig(tmp, cfg);
		const schemas = path.join(tmp, ".project", "schemas");
		fs.mkdirSync(schemas, { recursive: true });
		fs.writeFileSync(path.join(schemas, "foo.schema.json"), "{}"); // foo present; bar + baz absent
		assert.deepStrictEqual(findUnmaterializedAssets(tmp, cfg), { schemas: ["bar"], blocks: ["baz"] });
	});

	it("findUnmaterializedAssets is empty when nothing is declared", (t) => {
		const tmp = makeTmpDir("unmaterialized-empty");
		t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
		const cfg = minimalConfig();
		writeConfig(tmp, cfg);
		assert.deepStrictEqual(findUnmaterializedAssets(tmp, cfg), { schemas: [], blocks: [] });
	});
});

// ── loadConfig ──────────────────────────────────────────────────────────────

describe("loadConfig", () => {
	it("returns null when config.json is absent", (t) => {
		const tmp = makeTmpDir("load-config-absent");
		t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
		assert.strictEqual(loadConfig(tmp), null);
	});

	it("loads + AJV-validates a minimal valid config", (t) => {
		const tmp = makeTmpDir("load-config-valid");
		t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
		writeConfig(tmp, minimalConfig());
		const cfg = loadConfig(tmp);
		assert.ok(cfg);
		assert.strictEqual(cfg!.schema_version, "1.8.0");
		assert.strictEqual(cfg!.block_kinds.length, 1);
	});

	it("throws ValidationError on schema-invalid config", (t) => {
		const tmp = makeTmpDir("load-config-invalid");
		t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
		// Missing required block_kinds. schema_version matches the bundled schema
		// so the failure exercised is AJV validation, not a version mismatch.
		writeConfig(tmp, { schema_version: "1.8.0", root: ".project" });
		assert.throws(
			() => loadConfig(tmp),
			(err: unknown) => err instanceof ValidationError,
		);
	});

	it("throws helpful error on malformed JSON", (t) => {
		const tmp = makeTmpDir("load-config-bad-json");
		t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
		const dir = path.join(tmp, ".project");
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(path.join(dir, "config.json"), "{not json");
		assert.throws(
			() => loadConfig(tmp),
			(err: unknown) => err instanceof Error && /invalid JSON/i.test(err.message),
		);
	});
});

// ── loadConfig migration-aware path (the load-time config-migration path:
// reads the config's schema_version and, on mismatch, walks the migration
// chain forward before validating) ──────────────────

describe("loadConfig: migration-aware version-mismatch path", () => {
	const laggingConfig = (): ConfigBlock => ({ ...minimalConfig(), schema_version: "1.0.0" });

	it("version mismatch + seeded chain loads; in-memory schema_version stays '1.0.0' (identity migrates nothing)", (t) => {
		const tmp = makeTmpDir("load-config-migrated");
		t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
		writeConfig(tmp, laggingConfig());
		seedCatalogConfigMigrationDecls(path.join(tmp, ".project"));
		const cfg = loadConfig(tmp);
		assert.ok(cfg);
		// The identity migration passes the data through unchanged; the migrated
		// form is carried in memory only, never written back to disk.
		assert.strictEqual(cfg!.schema_version, "1.0.0");
		const onDisk = JSON.parse(fs.readFileSync(path.join(tmp, ".project", "config.json"), "utf-8"));
		assert.strictEqual(onDisk.schema_version, "1.0.0");
	});

	it("version mismatch + NO migrations.json throws plain Error (fail-fast), not ValidationError", (t) => {
		const tmp = makeTmpDir("load-config-nochain");
		t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
		writeConfig(tmp, laggingConfig());
		assert.throws(
			() => loadConfig(tmp),
			(err: unknown) => err instanceof Error && !(err instanceof ValidationError),
		);
	});

	it("version mismatch + chain not reaching the bundled version throws", (t) => {
		const tmp = makeTmpDir("load-config-partialchain");
		t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
		writeConfig(tmp, laggingConfig());
		appendMigrationDeclForDir(path.join(tmp, ".project"), {
			schemaName: "config",
			fromVersion: "1.0.0",
			toVersion: "1.2.0",
			kind: "identity",
			created_by: "t@e",
			created_at: "2026-07-02T00:00:00.000Z",
		});
		assert.throws(
			() => loadConfig(tmp),
			(err: unknown) => err instanceof Error && !(err instanceof ValidationError),
		);
	});

	it("cache-staleness regression: a failed load (registry cached empty), then seed, then reload SAME process succeeds", (t) => {
		const tmp = makeTmpDir("load-config-cachestale");
		t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
		writeConfig(tmp, laggingConfig());
		// First load warms the registry cache with the empty (no migrations.json)
		// registry and throws on the unresolvable chain.
		assert.throws(() => loadConfig(tmp));
		// Seeding writes through the writeMigrationsFileForDir funnel, which
		// invalidates the cached registry — the reload must see the new chain.
		seedCatalogConfigMigrationDecls(path.join(tmp, ".project"));
		const cfg = loadConfig(tmp);
		assert.ok(cfg);
		assert.strictEqual(cfg!.schema_version, "1.0.0");
	});

	it("current-version config + schema-invalid poison migrations.json loads fine (registry never consulted)", (t) => {
		const tmp = makeTmpDir("load-config-poison");
		t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
		writeConfig(tmp, minimalConfig());
		// Poison: violates the migrations schema (missing required migrations[]).
		// A version-matched config load must never read it.
		fs.writeFileSync(path.join(tmp, ".project", "migrations.json"), JSON.stringify({ schema_version: "1.0.0" }));
		const cfg = loadConfig(tmp);
		assert.ok(cfg);
		const onDisk = JSON.parse(fs.readFileSync(path.join(tmp, ".project", "config.json"), "utf-8"));
		assert.deepStrictEqual(cfg, onDisk);
	});
});

// ── loadRelations ───────────────────────────────────────────────────────────

describe("loadRelations", () => {
	it("returns [] when relations.json is absent", (t) => {
		const tmp = makeTmpDir("load-rel-absent");
		t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
		assert.deepStrictEqual(loadRelations(tmp), []);
	});

	it("loads + AJV-validates a valid relations array", (t) => {
		const tmp = makeTmpDir("load-rel-valid");
		t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
		const edges: Edge[] = [{ parent: "DEC-0001", child: "DEC-0002", relation_type: "supersedes" }];
		writeRelations(tmp, edges);
		const got = loadRelations(tmp);
		assert.deepStrictEqual(got, edges);
	});

	it("throws ValidationError on edges missing required fields", (t) => {
		const tmp = makeTmpDir("load-rel-invalid");
		t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
		const dir = path.join(tmp, ".project");
		fs.mkdirSync(dir, { recursive: true });
		// Missing relation_type
		fs.writeFileSync(path.join(dir, "relations.json"), JSON.stringify([{ parent: "a", child: "b" }]));
		assert.throws(
			() => loadRelations(tmp),
			(err: unknown) => err instanceof ValidationError,
		);
	});
});

// ── resolveContextDir ─────────────────────────────────────────────────────────────

describe("resolveContextDir", () => {
	it("falls back to <cwd>/.project when no config", (t) => {
		const tmp = makeTmpDir("root-fallback");
		t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
		assert.strictEqual(resolveContextDir(tmp), path.join(tmp, ".project"));
	});

	it("ignores config.root for resolution — pointer-canonical (DEC-0045 / FGAP-079)", (t) => {
		const tmp = makeTmpDir("root-override");
		t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
		const cfg = minimalConfig();
		cfg.root = "alt-substrate";
		writeConfig(tmp, cfg);
		// config.root is NOT a path input — resolveContextDir returns the .pi-context.json
		// pointer dir regardless of config.root (honoring it would split the substrate).
		assert.strictEqual(resolveContextDir(tmp), path.join(tmp, ".project"));
	});
});

// ── loadContext (mtime cache) ─────────────────────────────────────────

describe("loadContext", () => {
	it("caches and returns identical reference when files unchanged", (t) => {
		const tmp = makeTmpDir("ctx-cache-hit");
		t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
		writeConfig(tmp, minimalConfig());
		const a = loadContext(tmp);
		const b = loadContext(tmp);
		assert.strictEqual(a, b, "cache hit returns same reference");
	});

	it("invalidates when config.json mtime changes", async (t) => {
		const tmp = makeTmpDir("ctx-cache-miss-config");
		t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
		writeConfig(tmp, minimalConfig());
		const a = loadContext(tmp);

		// Bump mtime by writing a new config (sleep 10ms to ensure mtime tick on
		// filesystems that quantize to ms; node test runners run fast).
		await new Promise((res) => setTimeout(res, 15));
		const cfg2 = minimalConfig();
		cfg2.naming = { decisions: "Decisions" };
		writeConfig(tmp, cfg2);

		const b = loadContext(tmp);
		assert.notStrictEqual(a, b, "cache invalidates on config mtime change");
		assert.deepStrictEqual(b.config?.naming, { decisions: "Decisions" });
	});

	it("invalidates when relations.json mtime changes", async (t) => {
		const tmp = makeTmpDir("ctx-cache-miss-rel");
		t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
		writeConfig(tmp, minimalConfig());
		writeRelations(tmp, []);
		const a = loadContext(tmp);

		await new Promise((res) => setTimeout(res, 15));
		writeRelations(tmp, [{ parent: "x", child: "y", relation_type: "rt" }]);
		const b = loadContext(tmp);
		assert.notStrictEqual(a, b);
		assert.strictEqual(b.relations.length, 1);
	});
});

// ── synthesizeFromField / edgesForLens ──────────────────────────────────────

describe("synthesizeFromField + edgesForLens", () => {
	const items: ItemRecord[] = [
		{ id: "issue-1", package: "pi-context" },
		{ id: "issue-2", package: "pi-workflows" },
		{ id: "issue-3" }, // no package
	];

	it("synthesizeFromField yields one edge per item with the field", () => {
		const lens: LensSpec = {
			id: "by-package",
			derived_from_field: "package",
			relation_type: "package-membership",
			bins: ["pi-context", "pi-workflows"],
		};
		const edges = synthesizeFromField(lens, items);
		assert.strictEqual(edges.length, 2);
		assert.deepStrictEqual(edges[0], { parent: "pi-context", child: "issue-1", relation_type: "package-membership" });
	});

	it("synthesizeFromField returns [] when derived_from_field is null", () => {
		const lens: LensSpec = { id: "x", derived_from_field: null, bins: ["a"] };
		assert.deepStrictEqual(synthesizeFromField(lens, items), []);
	});

	it("edgesForLens dispatches to synth for derived lens", () => {
		const lens: LensSpec = {
			id: "by-package",
			derived_from_field: "package",
			relation_type: "package-membership",
			bins: ["pi-context"],
		};
		const edges = edgesForLens(lens, items, []);
		assert.strictEqual(edges.length, 2);
	});

	it("edgesForLens filters authored edges for null-derived lens", () => {
		const lens: LensSpec = {
			id: "context-mgmt",
			derived_from_field: null,
			relation_type: "context-mgmt-concern",
			bins: ["substrate-shape"],
		};
		const authored: Edge[] = [
			{ parent: "substrate-shape", child: "issue-1", relation_type: "context-mgmt-concern" },
			{ parent: "other-bin", child: "issue-2", relation_type: "different-rt" },
		];
		const edges = edgesForLens(lens, items, authored);
		assert.strictEqual(edges.length, 1);
		assert.strictEqual(edges[0].child, "issue-1");
	});
});

// ── walkDescendants ─────────────────────────────────────────────────────────

describe("walkDescendants", () => {
	it("walks a linear chain", () => {
		const edges: Edge[] = [
			{ parent: "a", child: "b", relation_type: "rt" },
			{ parent: "b", child: "c", relation_type: "rt" },
			{ parent: "c", child: "d", relation_type: "rt" },
		];
		const desc = walkDescendants("a", "rt", edges);
		assert.deepStrictEqual(desc.sort(), ["b", "c", "d"]);
	});

	it("is cycle-safe (does not loop on back-edges)", () => {
		const edges: Edge[] = [
			{ parent: "a", child: "b", relation_type: "rt" },
			{ parent: "b", child: "a", relation_type: "rt" }, // cycle
		];
		const desc = walkDescendants("a", "rt", edges);
		// Termination is the property under test; both nodes appear once each.
		assert.ok(desc.length <= 4);
		assert.ok(desc.includes("b"));
	});

	it("ignores edges with mismatched relation_type", () => {
		const edges: Edge[] = [
			{ parent: "a", child: "b", relation_type: "rt-1" },
			{ parent: "a", child: "c", relation_type: "rt-2" },
		];
		assert.deepStrictEqual(walkDescendants("a", "rt-1", edges), ["b"]);
	});
});

// ── walkAncestors ───────────────────────────────────────────────────────────
// Reverse-direction counterpart to walkDescendants; mirrors its cycle-safety
// and relation-type-filter semantics. Phase 2 sub-phase 2.3 — closure-table
// parent-direction traversal.

describe("walkAncestors", () => {
	it("walks a linear ancestor chain (A → B → C → D; ancestors of D = [C, B, A])", () => {
		const edges: Edge[] = [
			{ parent: "a", child: "b", relation_type: "rt" },
			{ parent: "b", child: "c", relation_type: "rt" },
			{ parent: "c", child: "d", relation_type: "rt" },
		];
		const anc = walkAncestors("d", "rt", edges);
		assert.deepStrictEqual(anc.sort(), ["a", "b", "c"]);
	});

	it("walks a branching DAG (C has parents A and B; ancestors include both)", () => {
		const edges: Edge[] = [
			{ parent: "a", child: "c", relation_type: "rt" },
			{ parent: "b", child: "c", relation_type: "rt" },
		];
		const anc = walkAncestors("c", "rt", edges);
		assert.deepStrictEqual(anc.sort(), ["a", "b"]);
	});

	it("is cycle-safe (does not loop on back-edges)", () => {
		const edges: Edge[] = [
			{ parent: "a", child: "b", relation_type: "rt" },
			{ parent: "b", child: "a", relation_type: "rt" }, // cycle
		];
		const anc = walkAncestors("b", "rt", edges);
		// Termination is the property under test; both nodes appear once each.
		assert.ok(anc.length <= 4);
		assert.ok(anc.includes("a"));
	});

	it("returns [] for an item with no ancestors", () => {
		const edges: Edge[] = [{ parent: "a", child: "b", relation_type: "rt" }];
		assert.deepStrictEqual(walkAncestors("a", "rt", edges), []);
	});

	it("ignores edges with mismatched relation_type", () => {
		const edges: Edge[] = [
			{ parent: "a", child: "c", relation_type: "rt-1" },
			{ parent: "b", child: "c", relation_type: "rt-2" },
		];
		assert.deepStrictEqual(walkAncestors("c", "rt-1", edges), ["a"]);
	});
});

// ── findReferences ──────────────────────────────────────────────────────────
// Edge-level inspection primitive — returns Edge[] (NOT string[]) for
// callers that need relation_type + ordinal preserved per record.
// Phase 2 sub-phase 2.4. Coexists with walkAncestors/walkDescendants which
// return projected id chains; semantic divergence is intentional.

describe("findReferences", () => {
	it("returns only inbound edges (edges where child === itemId) under direction='inbound'", () => {
		const edges: Edge[] = [
			{ parent: "a", child: "x", relation_type: "rt" }, // inbound on x
			{ parent: "b", child: "x", relation_type: "rt" }, // inbound on x
			{ parent: "x", child: "c", relation_type: "rt" }, // outbound from x
		];
		const result = findReferences("x", edges, "inbound");
		assert.strictEqual(result.length, 2);
		assert.ok(result.every((e) => e.child === "x"));
	});

	it("returns only outbound edges (edges where parent === itemId) under direction='outbound'", () => {
		const edges: Edge[] = [
			{ parent: "a", child: "x", relation_type: "rt" },
			{ parent: "b", child: "x", relation_type: "rt" },
			{ parent: "x", child: "c", relation_type: "rt" }, // outbound from x
		];
		const result = findReferences("x", edges, "outbound");
		assert.strictEqual(result.length, 1);
		assert.strictEqual(result[0].parent, "x");
		assert.strictEqual(result[0].child, "c");
	});

	it("returns the union of inbound + outbound under direction='both' (default)", () => {
		const edges: Edge[] = [
			{ parent: "a", child: "x", relation_type: "rt" },
			{ parent: "b", child: "x", relation_type: "rt" },
			{ parent: "x", child: "c", relation_type: "rt" },
		];
		const result = findReferences("x", edges); // default 'both'
		assert.strictEqual(result.length, 3);
		const resultExplicit = findReferences("x", edges, "both");
		assert.deepStrictEqual(resultExplicit, result);
	});

	it("returns [] for an item with no incident edges", () => {
		const edges: Edge[] = [{ parent: "a", child: "b", relation_type: "rt" }];
		assert.deepStrictEqual(findReferences("z", edges, "both"), []);
		assert.deepStrictEqual(findReferences("z", edges, "inbound"), []);
		assert.deepStrictEqual(findReferences("z", edges, "outbound"), []);
	});

	it("preserves multiple relation_types between the same pair as DISTINCT entries", () => {
		const edges: Edge[] = [
			{ parent: "a", child: "b", relation_type: "decomposes" },
			{ parent: "a", child: "b", relation_type: "blocks" },
		];
		const result = findReferences("b", edges, "inbound");
		assert.strictEqual(result.length, 2);
		const rels = result.map((e) => e.relation_type).sort();
		assert.deepStrictEqual(rels, ["blocks", "decomposes"]);
	});

	it("returns a self-loop edge EXACTLY ONCE under direction='both' (parent===child===itemId)", () => {
		// Self-loop semantic: an edge where parent === child === itemId matches
		// both the inbound and outbound filters. The implementation iterates
		// once with an OR predicate, so the edge appears exactly once under
		// 'both' — never duplicated. Cleaner option per JSDoc contract.
		const edges: Edge[] = [
			{ parent: "x", child: "x", relation_type: "self" },
			{ parent: "a", child: "x", relation_type: "rt" },
		];
		const bothResult = findReferences("x", edges, "both");
		const selfLoopMatches = bothResult.filter((e) => e.parent === "x" && e.child === "x");
		assert.strictEqual(selfLoopMatches.length, 1);
		// Inbound includes self-loop (child === itemId).
		const inbound = findReferences("x", edges, "inbound");
		assert.strictEqual(inbound.filter((e) => e.parent === "x" && e.child === "x").length, 1);
		// Outbound includes self-loop (parent === itemId).
		const outbound = findReferences("x", edges, "outbound");
		assert.strictEqual(outbound.filter((e) => e.parent === "x" && e.child === "x").length, 1);
	});
});

// ── groupByLens ─────────────────────────────────────────────────────────────

describe("groupByLens", () => {
	const items: ItemRecord[] = [{ id: "i1" }, { id: "i2" }, { id: "i3" }];

	it("groups items into bins by edge.parent", () => {
		const lens: LensSpec = { id: "l", derived_from_field: null, bins: ["A", "B"] };
		const edges: Edge[] = [
			{ parent: "A", child: "i1", relation_type: "l" },
			{ parent: "B", child: "i2", relation_type: "l" },
		];
		const grouped = groupByLens(items, lens, edges);
		assert.strictEqual(grouped.get("A")!.length, 1);
		assert.strictEqual(grouped.get("B")!.length, 1);
		assert.strictEqual(grouped.get("(uncategorized)")!.length, 1);
		assert.strictEqual(grouped.get("(uncategorized)")![0].id, "i3");
	});

	it("composition lens (no target) places by bin membership", () => {
		const lens: LensSpec = { id: "comp", kind: "composition", derived_from_field: null, bins: ["A"] };
		const edges: Edge[] = [{ parent: "A", child: "i1", relation_type: "comp" }];
		const grouped = groupByLens(items, lens, edges);
		assert.strictEqual(grouped.get("A")!.length, 1);
	});
});

// ── displayName ─────────────────────────────────────────────────────────────

describe("displayName", () => {
	it("returns canonical id when cfg is null", () => {
		assert.strictEqual(displayName(null, "DEC-0001"), "DEC-0001");
	});

	it("uses naming alias when present", () => {
		const cfg = minimalConfig();
		cfg.naming = { decisions: "Choices" };
		assert.strictEqual(displayName(cfg, "decisions"), "Choices");
	});

	it("falls back to block_kinds[].display_name", () => {
		const cfg = minimalConfig();
		assert.strictEqual(displayName(cfg, "decisions"), "Design Decisions");
	});

	it("falls back to canonical id when nothing matches", () => {
		const cfg = minimalConfig();
		assert.strictEqual(displayName(cfg, "unknown-block"), "unknown-block");
	});
});

// ── listUncategorized ───────────────────────────────────────────────────────

describe("listUncategorized", () => {
	it("returns uncategorized items + suggestion template", () => {
		const lens: LensSpec = { id: "l", derived_from_field: null, relation_type: "rt", bins: ["A"] };
		const grouped = new Map<string, ItemRecord[]>([
			["A", [{ id: "i1" }]],
			["(uncategorized)", [{ id: "i2" }]],
		]);
		const { uncategorized, suggestionTemplate } = listUncategorized(lens, grouped);
		assert.strictEqual(uncategorized.length, 1);
		const sug = suggestionTemplate("A", uncategorized[0]);
		assert.deepStrictEqual(sug.payload, { parent: "A", child: "i2", relation_type: "rt" });
		assert.ok(typeof sug.reason === "string" && sug.reason.length > 0);
	});

	it("handles empty uncategorized", () => {
		const lens: LensSpec = { id: "l", derived_from_field: null, bins: ["A"] };
		const grouped = new Map<string, ItemRecord[]>([["A", [{ id: "i1" }]]]);
		const { uncategorized } = listUncategorized(lens, grouped);
		assert.deepStrictEqual(uncategorized, []);
	});
});

// ── validateRelations (seven issue codes) ───────────────────────────────────

function configWithLensAndHierarchy(): ConfigBlock {
	return {
		schema_version: "1.8.0",
		root: ".project",
		block_kinds: [
			{
				canonical_id: "issues",
				display_name: "Issues",
				prefix: "issue-",
				schema_path: "schemas/issues.schema.json",
				array_key: "issues",
				data_path: "issues.json",
			},
			{
				canonical_id: "framework-gaps",
				display_name: "Framework Gaps",
				prefix: "FGAP-",
				schema_path: "schemas/framework-gaps.schema.json",
				array_key: "gaps",
				data_path: "framework-gaps.json",
			},
		],
		lenses: [
			{
				id: "context-mgmt",
				kind: "target",
				target: "issues",
				relation_type: "context-mgmt-concern",
				derived_from_field: null,
				bins: ["substrate-shape", "context-projection"],
			},
		],
		hierarchy: [{ parent_block: "framework-gaps", child_block: "issues", relation_type: "gap-membership" }],
		relation_types: [{ canonical_id: "supersedes", display_name: "Supersedes", category: "ordering" }],
	};
}

const itemsByBlock: Record<string, ItemRecord[]> = {
	issues: [{ id: "issue-1" }, { id: "issue-2" }, { id: "issue-3" }],
	"framework-gaps": [{ id: "FGAP-001" }, { id: "FGAP-002" }],
};

function find(issues: SubstrateValidationIssue[], code: SubstrateValidationIssue["code"]) {
	return issues.find((i) => i.code === code);
}

describe("validateRelations", () => {
	it("clean status when all edges resolve", () => {
		const cfg = configWithLensAndHierarchy();
		const edges: Edge[] = [
			{ parent: "substrate-shape", child: "issue-1", relation_type: "context-mgmt-concern" },
			{ parent: "FGAP-001", child: "issue-2", relation_type: "gap-membership" },
		];
		const r = validateRelations(cfg, edges, itemsByBlock);
		assert.strictEqual(r.status, "clean");
		assert.deepStrictEqual(r.issues, []);
	});

	it("edge_unknown_relation_type", () => {
		const cfg = configWithLensAndHierarchy();
		const edges: Edge[] = [{ parent: "x", child: "issue-1", relation_type: "no-such-rt" }];
		const r = validateRelations(cfg, edges, itemsByBlock);
		assert.strictEqual(r.status, "invalid");
		assert.ok(find(r.issues, "edge_unknown_relation_type"));
	});

	it("edge_parent_not_in_bins", () => {
		const cfg = configWithLensAndHierarchy();
		const edges: Edge[] = [
			{ parent: { kind: "lens_bin", bin: "typo-bin" }, child: "issue-1", relation_type: "context-mgmt-concern" },
		];
		const r = validateRelations(cfg, edges, itemsByBlock);
		assert.ok(find(r.issues, "edge_parent_not_in_bins"));
	});

	it("edge-materialization lens with item-parent content edges does not false-invalidate (FGAP-101)", () => {
		const cfg: ConfigBlock = {
			schema_version: "1.8.0",
			root: ".project",
			block_kinds: [
				{
					canonical_id: "tasks",
					display_name: "Tasks",
					prefix: "TASK-",
					schema_path: "schemas/tasks.schema.json",
					array_key: "tasks",
					data_path: "tasks.json",
				},
				{
					canonical_id: "story",
					display_name: "Stories",
					prefix: "STORY-",
					schema_path: "schemas/story.schema.json",
					array_key: "stories",
					data_path: "story.json",
				},
			],
			lenses: [
				{
					id: "story-advancers",
					kind: "target",
					target: "story",
					relation_type: "task_advances_story",
					derived_from_field: null,
					bins: [],
				},
			],
			relation_types: [
				{
					canonical_id: "task_advances_story",
					display_name: "advances story",
					category: "data_flow",
					source_kinds: ["tasks"],
					target_kinds: ["story"],
				},
			],
		};
		const items: Record<string, ItemRecord[]> = {
			tasks: [{ id: "TASK-046" }, { id: "TASK-047" }],
			story: [{ id: "STORY-021" }],
		};
		const edges: Edge[] = [
			{ parent: "TASK-046", child: "STORY-021", relation_type: "task_advances_story" },
			{ parent: "TASK-047", child: "STORY-021", relation_type: "task_advances_story" },
		];
		const r = validateRelations(cfg, edges, items);
		assert.strictEqual(r.status, "clean");
		assert.strictEqual(find(r.issues, "edge_parent_not_in_bins"), undefined);
	});

	it("edge_unresolved_child (lens edge)", () => {
		const cfg = configWithLensAndHierarchy();
		const edges: Edge[] = [{ parent: "substrate-shape", child: "issue-9999", relation_type: "context-mgmt-concern" }];
		const r = validateRelations(cfg, edges, itemsByBlock);
		assert.ok(find(r.issues, "edge_unresolved_child"));
	});

	it("edge_unresolved_parent (hierarchy edge)", () => {
		const cfg = configWithLensAndHierarchy();
		const edges: Edge[] = [{ parent: "FGAP-9999", child: "issue-1", relation_type: "gap-membership" }];
		const r = validateRelations(cfg, edges, itemsByBlock);
		assert.ok(find(r.issues, "edge_unresolved_parent"));
	});

	it("edge_parent_wrong_block", () => {
		const cfg = configWithLensAndHierarchy();
		// issue-1 lives in 'issues' but hierarchy expects parent in 'framework-gaps'
		const edges: Edge[] = [{ parent: "issue-1", child: "issue-2", relation_type: "gap-membership" }];
		const r = validateRelations(cfg, edges, itemsByBlock);
		assert.ok(find(r.issues, "edge_parent_wrong_block"));
	});

	it("edge_child_wrong_block", () => {
		const cfg = configWithLensAndHierarchy();
		// FGAP-001 is in framework-gaps, but lens.target is 'issues'
		const edges: Edge[] = [{ parent: "substrate-shape", child: "FGAP-001", relation_type: "context-mgmt-concern" }];
		const r = validateRelations(cfg, edges, itemsByBlock);
		assert.ok(find(r.issues, "edge_child_wrong_block"));
	});

	it("edge_cycle_detected on a hierarchy relation_type", () => {
		// Hierarchy with parent_block === child_block to allow same-block edges
		const cfg: ConfigBlock = {
			schema_version: "1.8.0",
			root: ".project",
			block_kinds: [
				{
					canonical_id: "tasks",
					display_name: "Tasks",
					prefix: "TASK-",
					schema_path: "schemas/tasks.schema.json",
					array_key: "tasks",
					data_path: "tasks.json",
				},
			],
			hierarchy: [{ parent_block: "tasks", child_block: "tasks", relation_type: "task_depends_on" }],
		};
		const edges: Edge[] = [
			{ parent: "TASK-1", child: "TASK-2", relation_type: "task_depends_on" },
			{ parent: "TASK-2", child: "TASK-3", relation_type: "task_depends_on" },
			{ parent: "TASK-3", child: "TASK-1", relation_type: "task_depends_on" },
		];
		const items: Record<string, ItemRecord[]> = {
			tasks: [{ id: "TASK-1" }, { id: "TASK-2" }, { id: "TASK-3" }],
		};
		const r = validateRelations(cfg, edges, items);
		const cycleIssue = find(r.issues, "edge_cycle_detected");
		assert.ok(cycleIssue, "cycle should be detected");
		assert.ok(Array.isArray(cycleIssue!.cycle));
		assert.strictEqual(cycleIssue!.relation_type, "task_depends_on");
	});

	it("relation_types declared with cycle_allowed=true skips cycle check", () => {
		const cfg: ConfigBlock = {
			schema_version: "1.8.0",
			root: ".project",
			block_kinds: [
				{
					canonical_id: "tasks",
					display_name: "Tasks",
					prefix: "TASK-",
					schema_path: "x",
					array_key: "tasks",
					data_path: "tasks.json",
				},
			],
			hierarchy: [{ parent_block: "tasks", child_block: "tasks", relation_type: "loopy" }],
			relation_types: [{ canonical_id: "loopy", display_name: "Loopy", category: "data_flow", cycle_allowed: true }],
		};
		// Note: hierarchy + relation_types both register 'loopy'; cycle_allowed=true
		// in relation_types causes cycle check to be skipped.
		const edges: Edge[] = [
			{ parent: "TASK-1", child: "TASK-2", relation_type: "loopy" },
			{ parent: "TASK-2", child: "TASK-1", relation_type: "loopy" },
		];
		const items: Record<string, ItemRecord[]> = { tasks: [{ id: "TASK-1" }, { id: "TASK-2" }] };
		const r = validateRelations(cfg, edges, items);
		assert.strictEqual(find(r.issues, "edge_cycle_detected"), undefined);
	});
});

// ── resolveComposition ──────────────────────────────────────────────────────

describe("resolveComposition", () => {
	function writeBlock(tmpDir: string, name: string, payload: unknown): void {
		const dir = path.join(tmpDir, ".project");
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(payload));
	}

	it("resolves a single 'from' member with no where clause", (t) => {
		const tmp = makeTmpDir("rc-single-from");
		t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
		const cfg: ConfigBlock = {
			...minimalConfig(),
			lenses: [
				{
					id: "all-tasks",
					kind: "composition",
					bins: [],
					members: [{ from: "tasks" }],
				},
			],
		};
		writeConfig(tmp, cfg);
		writeBlock(tmp, "tasks", {
			tasks: [
				{ id: "TASK-1", description: "x", status: "planned" },
				{ id: "TASK-2", description: "y", status: "completed" },
			],
		});
		const result = resolveComposition(tmp, cfg.lenses![0]);
		assert.strictEqual(result.members.length, 1);
		assert.strictEqual(result.unionedItems.length, 2);
		assert.strictEqual(result.perItemOrigin.get("TASK-1"), "tasks");
		assert.strictEqual(result.perItemOrigin.get("TASK-2"), "tasks");
	});

	it("filters members by where-clause field equality", (t) => {
		const tmp = makeTmpDir("rc-where");
		t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
		const cfg: ConfigBlock = {
			...minimalConfig(),
			lenses: [
				{
					id: "completed-tasks",
					kind: "composition",
					bins: [],
					members: [{ from: "tasks", where: { status: "completed" } }],
				},
			],
		};
		writeConfig(tmp, cfg);
		writeBlock(tmp, "tasks", {
			tasks: [
				{ id: "TASK-1", description: "x", status: "planned" },
				{ id: "TASK-2", description: "y", status: "completed" },
				{ id: "TASK-3", description: "z", status: "completed" },
			],
		});
		const result = resolveComposition(tmp, cfg.lenses![0]);
		assert.strictEqual(result.unionedItems.length, 2);
		assert.deepStrictEqual(result.unionedItems.map((i) => i.id).sort(), ["TASK-2", "TASK-3"]);
	});

	it("detects composition cycle (lens A → lens B → lens A)", (t) => {
		const tmp = makeTmpDir("rc-cycle");
		t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
		const cfg: ConfigBlock = {
			...minimalConfig(),
			lenses: [
				{
					id: "lens-a",
					kind: "composition",
					bins: [],
					members: [{ lens: "lens-b" }],
				},
				{
					id: "lens-b",
					kind: "composition",
					bins: [],
					members: [{ lens: "lens-a" }],
				},
			],
		};
		writeConfig(tmp, cfg);
		assert.throws(() => resolveComposition(tmp, cfg.lenses![0]), /composition_cycle_detected/);
	});

	it("throws when a member references an unknown sub-lens", (t) => {
		const tmp = makeTmpDir("rc-missing-sublens");
		t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
		const cfg: ConfigBlock = {
			...minimalConfig(),
			lenses: [
				{
					id: "outer",
					kind: "composition",
					bins: [],
					members: [{ lens: "does-not-exist" }],
				},
			],
		};
		writeConfig(tmp, cfg);
		assert.throws(() => resolveComposition(tmp, cfg.lenses![0]), /member references unknown lens 'does-not-exist'/);
	});

	it("resolves a target sub-lens by reading its target block", (t) => {
		const tmp = makeTmpDir("rc-sublens-target");
		t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
		const cfg: ConfigBlock = {
			...minimalConfig(),
			lenses: [
				{
					id: "inner",
					kind: "target",
					target: "tasks",
					bins: [],
				},
				{
					id: "outer",
					kind: "composition",
					bins: [],
					members: [{ lens: "inner" }],
				},
			],
		};
		writeConfig(tmp, cfg);
		writeBlock(tmp, "tasks", {
			tasks: [{ id: "TASK-1", description: "x", status: "planned" }],
		});
		const result = resolveComposition(tmp, cfg.lenses![1]);
		assert.strictEqual(result.unionedItems.length, 1);
		assert.strictEqual(result.perItemOrigin.get("TASK-1"), "tasks");
	});

	it("throws when the lens passed in is not kind=composition", (t) => {
		const tmp = makeTmpDir("rc-wrong-kind");
		t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
		const cfg: ConfigBlock = {
			...minimalConfig(),
			lenses: [{ id: "target-only", kind: "target", target: "tasks", bins: [] }],
		};
		writeConfig(tmp, cfg);
		assert.throws(() => resolveComposition(tmp, cfg.lenses![0]), /is not kind=composition/);
	});
});

describe("loaders degrade gracefully when no .pi-context.json pointer exists (tryResolveContextDir class fix)", () => {
	// Deliberately NO writeBootstrapPointer — the loaders must self-degrade rather
	// than hard-throw BootstrapNotFoundError on the absent-pointer branch.
	function makePointerlessDir(prefix: string): string {
		return fs.mkdtempSync(path.join(os.tmpdir(), `pcx-noptr-${prefix}-`));
	}

	it("loadConfig returns null when no pointer exists", (t) => {
		const tmp = makePointerlessDir("loadconfig");
		t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
		assert.strictEqual(loadConfig(tmp), null);
	});

	it("loadRelations returns [] when no pointer exists", (t) => {
		const tmp = makePointerlessDir("loadrelations");
		t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
		assert.deepEqual(loadRelations(tmp), []);
	});

	// Chokepoint: loadContext calls the throwing configPath/relationsPath
	// for its mtime cache keys; the top-of-function tryResolveContextDir guard must
	// degrade to an empty context rather than throw (introduced as part of the
	// /project→/context source-identifier rename's consumer-migration chunk).
	it("loadContext returns { config: null, relations: [] } when no pointer exists", (t) => {
		const tmp = makePointerlessDir("loadcontext");
		t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
		assert.deepStrictEqual(loadContext(tmp), { config: null, relations: [] });
	});
});
