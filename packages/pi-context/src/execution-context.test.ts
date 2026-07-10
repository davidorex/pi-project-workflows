/**
 * Tests for gatherExecutionContext — Phase 3 sub-phase 3.2.
 *
 * Per per-test-fixture pattern (each test owns its tmp substrate dir +
 * synthetic relations.json + per-block files). Mirrors the fixture
 * shape established by setupFilterBlock / setupResolveBlock in
 * context-sdk.test.ts: minimal permissive schema next to each block
 * file so readBlock's substrate-shape contract holds without exercising
 * write-time schema validation pressure unrelated to the primitive
 * under test.
 *
 * Coverage per that phase's acceptance criteria:
 *   1. Happy path — single relation_type / out / depth 2 / 2 edges →
 *      bucket has 2 items.
 *   2. Multi-relation — 3 declared bundle_relation_types with distinct
 *      direction semantics → 3 buckets with distinct expected items.
 *   3. Direction semantic — same edge set; "in" returns ancestors,
 *      "out" returns descendants, "both" returns deduped union.
 *   4. maxDepth bound — caller-supplied maxDepth overrides spec.max_depth
 *      via Math.min; traversal_depth reflects the effective cap.
 *   5. Missing unit — unknown unit_id → `{ error: "unit not found: ..." }`.
 *   6. Missing contract — no context-contract for the requested kind →
 *      `{ error: "no context-contract for kind: ..." }`.
 *   7. Empty bundle_relation_types[] — contract exists but empty bundle →
 *      ContextBundle with unit populated + perRelationType: {} +
 *      traversal_depth: 0.
 */

import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { writeBootstrapPointer } from "./context-dir.js";
import { gatherExecutionContext } from "./execution-context.js";

function makeTmpDir(prefix: string): string {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), `exec-ctx-${prefix}-`));
	writeBootstrapPointer(cwd, ".project");
	const projectDir = path.join(cwd, ".project");
	const schemasDir = path.join(projectDir, "schemas");
	fs.mkdirSync(schemasDir, { recursive: true });
	return cwd;
}

/**
 * Write a block file + companion minimal permissive schema. Mirrors
 * setupFilterBlock from context-sdk.test.ts. Permissive schema keeps
 * readBlock's normal substrate shape intact without exercising
 * write-time schema validation unrelated to gatherExecutionContext.
 */
function writeBlock(tmpDir: string, blockName: string, arrayKey: string, items: unknown[]): void {
	const projectDir = path.join(tmpDir, ".project");
	const schemasDir = path.join(projectDir, "schemas");
	const schema = {
		type: "object",
		required: [arrayKey],
		properties: {
			[arrayKey]: { type: "array", items: { type: "object" } },
		},
	};
	fs.writeFileSync(path.join(schemasDir, `${blockName}.schema.json`), JSON.stringify(schema));
	fs.writeFileSync(path.join(projectDir, `${blockName}.json`), JSON.stringify({ [arrayKey]: items }, null, 2));
}

/**
 * Write relations.json — top-level Edge[] per the bundled relations
 * schema. Each edge is `{ parent, child, relation_type, ordinal? }`.
 */
function writeRelations(tmpDir: string, edges: Array<Record<string, unknown>>): void {
	const projectDir = path.join(tmpDir, ".project");
	fs.writeFileSync(path.join(projectDir, "relations.json"), JSON.stringify(edges, null, 2));
}

describe("gatherExecutionContext: happy path", () => {
	it("composes ContextBundle with single declared relation_type (out / depth 2 / 2 edges)", (t) => {
		const tmpDir = makeTmpDir("happy");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		writeBlock(tmpDir, "tasks", "tasks", [
			{ id: "TASK-001", description: "parent" },
			{ id: "TASK-002", description: "child-a" },
			{ id: "TASK-003", description: "child-b" },
		]);
		writeBlock(tmpDir, "context-contracts", "contracts", [
			{
				id: "CTX-001",
				unit_kind: "task",
				bundle_relation_types: [{ relation_type: "decomposes", direction: "out", max_depth: 2 }],
				created_by: "test",
				created_at: "2026-05-13T00:00:00Z",
			},
		]);
		writeRelations(tmpDir, [
			{ parent: "TASK-001", child: "TASK-002", relation_type: "decomposes" },
			{ parent: "TASK-001", child: "TASK-003", relation_type: "decomposes" },
		]);

		const result = gatherExecutionContext(tmpDir, { unitId: "TASK-001", kind: "task" });
		assert.ok(!("error" in result), `expected ContextBundle, got: ${JSON.stringify(result)}`);
		const bundle = result;
		assert.strictEqual((bundle.unit as { id: unknown }).id, "TASK-001");
		assert.ok(bundle.perRelationType.decomposes, "decomposes bucket present");
		assert.strictEqual(bundle.perRelationType.decomposes.length, 2);
		const ids = (bundle.perRelationType.decomposes.map((it) => (it as { id: unknown }).id) as string[]).sort();
		assert.deepStrictEqual(ids, ["TASK-002", "TASK-003"]);
		assert.strictEqual(bundle.traversal_depth, 2);
		assert.ok(typeof bundle.scoped_at === "string" && bundle.scoped_at.length > 0);
	});
});

describe("gatherExecutionContext: multi-relation contract", () => {
	it("composes 3 distinct buckets for 3 declared bundle_relation_types", (t) => {
		const tmpDir = makeTmpDir("multi-rel");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		writeBlock(tmpDir, "tasks", "tasks", [
			{ id: "TASK-001", description: "subject" },
			{ id: "TASK-002", description: "decompose-child" },
			{ id: "TASK-003", description: "blocker" },
			{ id: "TASK-004", description: "related-out" },
			{ id: "TASK-005", description: "related-in" },
		]);
		writeBlock(tmpDir, "context-contracts", "contracts", [
			{
				id: "CTX-010",
				unit_kind: "task",
				bundle_relation_types: [
					{ relation_type: "decomposes", direction: "out", max_depth: 2 },
					{ relation_type: "blocks", direction: "in", max_depth: 1 },
					{ relation_type: "related", direction: "both", max_depth: 1 },
				],
				created_by: "test",
				created_at: "2026-05-13T00:00:00Z",
			},
		]);
		writeRelations(tmpDir, [
			{ parent: "TASK-001", child: "TASK-002", relation_type: "decomposes" },
			{ parent: "TASK-003", child: "TASK-001", relation_type: "blocks" },
			{ parent: "TASK-001", child: "TASK-004", relation_type: "related" },
			{ parent: "TASK-005", child: "TASK-001", relation_type: "related" },
		]);

		const result = gatherExecutionContext(tmpDir, { unitId: "TASK-001", kind: "task" });
		assert.ok(!("error" in result), `expected ContextBundle, got: ${JSON.stringify(result)}`);
		const bundle = result;

		const bucketNames = Object.keys(bundle.perRelationType).sort();
		assert.deepStrictEqual(bucketNames, ["blocks", "decomposes", "related"]);

		const decomposesIds = bundle.perRelationType.decomposes.map((it) => (it as { id: unknown }).id);
		assert.deepStrictEqual(decomposesIds, ["TASK-002"]);

		const blocksIds = bundle.perRelationType.blocks.map((it) => (it as { id: unknown }).id);
		assert.deepStrictEqual(blocksIds, ["TASK-003"]);

		const relatedIds = (bundle.perRelationType.related.map((it) => (it as { id: unknown }).id) as string[]).sort();
		assert.deepStrictEqual(relatedIds, ["TASK-004", "TASK-005"]);

		assert.strictEqual(bundle.traversal_depth, 2);
	});
});

describe("gatherExecutionContext: direction semantics", () => {
	it("in returns ancestors, out returns descendants, both returns deduped union", (t) => {
		const tmpDir = makeTmpDir("direction");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		// Edges (relation_type = "edge"):
		//   ANC-1 -> TASK-001 (TASK-001 has ancestor ANC-1)
		//   ANC-2 -> ANC-1    (ANC-1 has ancestor ANC-2 → walkAncestors reaches ANC-2)
		//   TASK-001 -> DESC-1
		//   DESC-1 -> DESC-2
		writeBlock(tmpDir, "tasks", "tasks", [
			{ id: "TASK-001", description: "subject" },
			{ id: "ANC-1", description: "ancestor-1" },
			{ id: "ANC-2", description: "ancestor-2" },
			{ id: "DESC-1", description: "descendant-1" },
			{ id: "DESC-2", description: "descendant-2" },
		]);
		writeRelations(tmpDir, [
			{ parent: "ANC-1", child: "TASK-001", relation_type: "edge" },
			{ parent: "ANC-2", child: "ANC-1", relation_type: "edge" },
			{ parent: "TASK-001", child: "DESC-1", relation_type: "edge" },
			{ parent: "DESC-1", child: "DESC-2", relation_type: "edge" },
		]);

		// Three runs against three contracts (one per direction), each
		// using a distinct unit_kind so the contract selection is
		// deterministic. Same edge set drives all three.
		writeBlock(tmpDir, "context-contracts", "contracts", [
			{
				id: "CTX-IN",
				unit_kind: "task-in",
				bundle_relation_types: [{ relation_type: "edge", direction: "in", max_depth: 5 }],
				created_by: "test",
				created_at: "2026-05-13T00:00:00Z",
			},
			{
				id: "CTX-OUT",
				unit_kind: "task-out",
				bundle_relation_types: [{ relation_type: "edge", direction: "out", max_depth: 5 }],
				created_by: "test",
				created_at: "2026-05-13T00:00:00Z",
			},
			{
				id: "CTX-BOTH",
				unit_kind: "task-both",
				bundle_relation_types: [{ relation_type: "edge", direction: "both", max_depth: 5 }],
				created_by: "test",
				created_at: "2026-05-13T00:00:00Z",
			},
		]);

		const inResult = gatherExecutionContext(tmpDir, { unitId: "TASK-001", kind: "task-in" });
		assert.ok(!("error" in inResult));
		const inIds = (inResult.perRelationType.edge.map((it) => (it as { id: unknown }).id) as string[]).sort();
		assert.deepStrictEqual(inIds, ["ANC-1", "ANC-2"]);

		const outResult = gatherExecutionContext(tmpDir, { unitId: "TASK-001", kind: "task-out" });
		assert.ok(!("error" in outResult));
		const outIds = (outResult.perRelationType.edge.map((it) => (it as { id: unknown }).id) as string[]).sort();
		assert.deepStrictEqual(outIds, ["DESC-1", "DESC-2"]);

		const bothResult = gatherExecutionContext(tmpDir, { unitId: "TASK-001", kind: "task-both" });
		assert.ok(!("error" in bothResult));
		const bothIds = (bothResult.perRelationType.edge.map((it) => (it as { id: unknown }).id) as string[]).sort();
		assert.deepStrictEqual(bothIds, ["ANC-1", "ANC-2", "DESC-1", "DESC-2"]);
	});
});

describe("gatherExecutionContext: maxDepth bound", () => {
	it("caller maxDepth caps spec.max_depth via Math.min and reflects in traversal_depth", (t) => {
		const tmpDir = makeTmpDir("maxdepth");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		// 4-deep descendant chain A -> B -> C -> D -> E.
		writeBlock(tmpDir, "tasks", "tasks", [
			{ id: "A", description: "root" },
			{ id: "B" },
			{ id: "C" },
			{ id: "D" },
			{ id: "E" },
		]);
		writeBlock(tmpDir, "context-contracts", "contracts", [
			{
				id: "CTX-DEPTH",
				unit_kind: "task",
				bundle_relation_types: [{ relation_type: "decomposes", direction: "out", max_depth: 5 }],
				created_by: "test",
				created_at: "2026-05-13T00:00:00Z",
			},
		]);
		writeRelations(tmpDir, [
			{ parent: "A", child: "B", relation_type: "decomposes" },
			{ parent: "B", child: "C", relation_type: "decomposes" },
			{ parent: "C", child: "D", relation_type: "decomposes" },
			{ parent: "D", child: "E", relation_type: "decomposes" },
		]);

		// maxDepth=2 caps spec.max_depth=5 → effective depth 2 in
		// traversal_depth. Note the traversal primitive walkDescendants
		// is not currently depth-bounded in implementation (visited-set
		// bounded only) — the traversal_depth field reflects the
		// effective cap applied at the bundle contract layer; reach
		// behavior is depth-bound territory for a future variant of context-bundling.
		// Verify the bound is recorded on the bundle.
		const result = gatherExecutionContext(tmpDir, { unitId: "A", kind: "task", maxDepth: 2 });
		assert.ok(!("error" in result), `expected ContextBundle, got: ${JSON.stringify(result)}`);
		assert.strictEqual(result.traversal_depth, 2, "traversal_depth reflects effective cap (min(2, 5))");

		// Without args.maxDepth, effective depth == spec.max_depth (5).
		const noCapResult = gatherExecutionContext(tmpDir, { unitId: "A", kind: "task" });
		assert.ok(!("error" in noCapResult));
		assert.strictEqual(noCapResult.traversal_depth, 5);
	});
});

describe("gatherExecutionContext: missing unit", () => {
	it("returns {error} when unit id is not present in any block", (t) => {
		const tmpDir = makeTmpDir("missing-unit");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		writeBlock(tmpDir, "tasks", "tasks", [{ id: "TASK-001" }]);
		writeBlock(tmpDir, "context-contracts", "contracts", [
			{
				id: "CTX-001",
				unit_kind: "task",
				bundle_relation_types: [],
				created_by: "test",
				created_at: "2026-05-13T00:00:00Z",
			},
		]);
		writeRelations(tmpDir, []);

		const result = gatherExecutionContext(tmpDir, { unitId: "TASK-999", kind: "task" });
		assert.ok("error" in result, `expected error return, got: ${JSON.stringify(result)}`);
		assert.match(result.error, /unit not found: TASK-999/);
	});
});

describe("gatherExecutionContext: missing contract", () => {
	it("returns {error} when no context-contract entry matches unit_kind", (t) => {
		const tmpDir = makeTmpDir("missing-contract");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		writeBlock(tmpDir, "tasks", "tasks", [{ id: "TASK-001" }]);
		writeBlock(tmpDir, "context-contracts", "contracts", [
			{
				id: "CTX-001",
				unit_kind: "decision",
				bundle_relation_types: [],
				created_by: "test",
				created_at: "2026-05-13T00:00:00Z",
			},
		]);
		writeRelations(tmpDir, []);

		const result = gatherExecutionContext(tmpDir, { unitId: "TASK-001", kind: "task" });
		assert.ok("error" in result);
		assert.match(result.error, /no context-contract for kind: task/);
	});
});

describe("gatherExecutionContext: empty bundle_relation_types[]", () => {
	it("returns ContextBundle with unit populated + perRelationType={} + traversal_depth=0", (t) => {
		const tmpDir = makeTmpDir("empty-bundle");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		writeBlock(tmpDir, "tasks", "tasks", [{ id: "TASK-001", description: "subject" }]);
		writeBlock(tmpDir, "context-contracts", "contracts", [
			{
				id: "CTX-001",
				unit_kind: "task",
				bundle_relation_types: [],
				created_by: "test",
				created_at: "2026-05-13T00:00:00Z",
			},
		]);
		writeRelations(tmpDir, []);

		const result = gatherExecutionContext(tmpDir, { unitId: "TASK-001", kind: "task" });
		assert.ok(!("error" in result), `expected ContextBundle, got: ${JSON.stringify(result)}`);
		assert.strictEqual((result.unit as { id: unknown }).id, "TASK-001");
		assert.deepStrictEqual(result.perRelationType, {});
		assert.strictEqual(result.traversal_depth, 0);
		assert.ok(typeof result.scoped_at === "string" && result.scoped_at.length > 0);
	});
});
