/**
 * Integration test for gatherExecutionContext — TASK-040 / Phase 3 sub-phase 3.3.
 *
 * Scope vs the unit test (execution-context.test.ts; TASK-039 / sub-phase 3.2):
 * the unit test exercises gatherExecutionContext against per-test fixture
 * inputs with minimal permissive schemas next to each block file. Block-api
 * read paths are exercised but loadConfig is not (no config.json), so the
 * cross-block prefix-vs-block invariant (expectedBlockForId) and the
 * config.relation_types[] declaration are not on the read path.
 *
 * The integration test goes broader. Each scenario composes the FULL
 * synthetic substrate at dispatch time:
 *
 *   mkdtempSync(<prefix>)/
 *   ├── .pi-context.json                  ← bootstrap pointer (DEC-0015)
 *   └── .project/
 *       ├── config.json                   ← AJV-validated config block_kinds[]
 *       │                                   + relation_types[]
 *       ├── relations.json                ← AJV-validated Edge[]
 *       ├── context-contracts.json        ← bundle composition spec (FGAP-030)
 *       ├── tasks.json                    ← work-unit block (cross-block #1)
 *       ├── decisions.json                ← related block (cross-block #2)
 *       └── schemas/
 *           ├── tasks.schema.json
 *           ├── decisions.schema.json
 *           └── context-contracts.schema.json
 *
 * Exercises the canonical READ path through actual block-api + context-sdk
 * primitives: filterBlockItems → readBlock → JSON parse;
 * resolveItemsByIds → buildIdIndex → loadConfig → expectedBlockForId
 * prefix-vs-block invariant; loadRelations → AJV validate against bundled
 * relations.schema.json. No mocks, no stubs — the integration test
 * exercises the substrate-canonical surface end-to-end.
 *
 * Per DEC-0018 this is the runtime-demo equivalent within tests (no
 * live-repo-substrate runtime demo possible per Phase 5 deferral of
 * arc-tracking-block authoring as dogfood substrate).
 *
 * Coverage per TASK-040 acceptance criteria:
 *   A. Single-relation_type contract — happy path through full substrate
 *      with same-block (tasks) walk; loadConfig succeeds, buildIdIndex
 *      respects block_kinds[].prefix invariant.
 *   B. Multi-relation_type contract with mixed directions — 3 declared
 *      relation_types with in / out / both directions; cross-block
 *      resolution (tasks ↔ decisions) verified per bucket.
 *   C. Deep chain hitting max_depth bound — 4-deep descendant chain;
 *      traversal_depth reflects effective cap; all reachable items
 *      resolved through buildIdIndex cross-block.
 *   D. Missing-edge / no false-pass fallback — unit with contract
 *      declaring relation_types that have ZERO edges in relations.json;
 *      buckets must be present-but-empty (not absent) and substrate
 *      load must succeed (no schema-validation thrash from a partial-
 *      match fallback masking the empty walk).
 */

import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { writeBootstrapPointer } from "./context-dir.js";
import { gatherExecutionContext } from "./execution-context.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REGISTRY_SCHEMAS_DIR = path.resolve(__dirname, "..", "registry", "schemas");

/**
 * Test substrate authoring helpers. Each helper writes ONE substrate file
 * against the canonical schema shape (no permissive shortcuts where the
 * canonical surface validates on read). buildSubstrate composes the full
 * tree per scenario; each scenario calls it with its own item set.
 */

interface SubstrateSpec {
	configRelationTypes: Array<{
		canonical_id: string;
		display_name: string;
		category: "ordering" | "data_flow" | "membership";
	}>;
	tasks: Array<Record<string, unknown>>;
	decisions: Array<Record<string, unknown>>;
	contracts: Array<Record<string, unknown>>;
	edges: Array<Record<string, unknown>>;
}

function makeTmpDir(prefix: string): string {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), `exec-ctx-int-${prefix}-`));
	writeBootstrapPointer(cwd, ".project");
	const projectDir = path.join(cwd, ".project");
	const schemasDir = path.join(projectDir, "schemas");
	fs.mkdirSync(schemasDir, { recursive: true });
	return cwd;
}

/**
 * Author the schemas/ subdir for the three blocks the integration test
 * touches. Copies from the registry's authoritative schemas so AJV
 * validation on write/read paths exercises the SAME schema shape the
 * runtime uses — not a fixture-only minimal permissive variant. The
 * unit test (execution-context.test.ts) uses minimal permissive schemas
 * because it isn't exercising the cross-block resolution path; the
 * integration test exercises it, so it must use the canonical schemas.
 */
function copyRegistrySchema(cwd: string, blockName: string): void {
	const src = path.join(REGISTRY_SCHEMAS_DIR, `${blockName}.schema.json`);
	const dst = path.join(cwd, ".project", "schemas", `${blockName}.schema.json`);
	fs.copyFileSync(src, dst);
}

function writeBlock(cwd: string, blockName: string, payload: Record<string, unknown>): void {
	const filePath = path.join(cwd, ".project", `${blockName}.json`);
	fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
}

function writeConfig(cwd: string, relationTypes: SubstrateSpec["configRelationTypes"]): void {
	const config = {
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
				canonical_id: "decisions",
				display_name: "Decisions",
				prefix: "DEC-",
				schema_path: "schemas/decisions.schema.json",
				array_key: "decisions",
				data_path: "decisions.json",
			},
			{
				canonical_id: "context-contracts",
				display_name: "Context contracts",
				prefix: "CTX-",
				schema_path: "schemas/context-contracts.schema.json",
				array_key: "contracts",
				data_path: "context-contracts.json",
			},
		],
		relation_types: relationTypes,
	};
	writeBlock(cwd, "config", config);
}

function writeRelations(cwd: string, edges: SubstrateSpec["edges"]): void {
	fs.writeFileSync(path.join(cwd, ".project", "relations.json"), JSON.stringify(edges, null, 2));
}

function buildSubstrate(cwd: string, spec: SubstrateSpec): void {
	copyRegistrySchema(cwd, "tasks");
	copyRegistrySchema(cwd, "decisions");
	copyRegistrySchema(cwd, "context-contracts");

	writeConfig(cwd, spec.configRelationTypes);
	writeBlock(cwd, "tasks", { tasks: spec.tasks });
	writeBlock(cwd, "decisions", { decisions: spec.decisions });
	writeBlock(cwd, "context-contracts", { contracts: spec.contracts });
	writeRelations(cwd, spec.edges);
}

describe("gatherExecutionContext integration: scenario A — single relation_type / full substrate", () => {
	it("composes ContextBundle from full synthetic substrate via canonical block-api + context-sdk surfaces", (t) => {
		const tmpDir = makeTmpDir("A-single");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		buildSubstrate(tmpDir, {
			configRelationTypes: [{ canonical_id: "decomposes", display_name: "Decomposes", category: "membership" }],
			tasks: [
				{ id: "TASK-001", description: "parent task", status: "planned" },
				{ id: "TASK-002", description: "child task A", status: "planned" },
				{ id: "TASK-003", description: "child task B", status: "planned" },
			],
			decisions: [],
			contracts: [
				{
					id: "CTX-001",
					unit_kind: "task",
					bundle_relation_types: [{ relation_type: "decomposes", direction: "out", max_depth: 2 }],
					created_by: "test/integration",
					created_at: "2026-05-13T00:00:00Z",
				},
			],
			edges: [
				{ parent: "TASK-001", child: "TASK-002", relation_type: "decomposes" },
				{ parent: "TASK-001", child: "TASK-003", relation_type: "decomposes" },
			],
		});

		const result = gatherExecutionContext(tmpDir, { unitId: "TASK-001", kind: "task" });
		assert.ok(!("error" in result), `expected ContextBundle, got: ${JSON.stringify(result)}`);
		const bundle = result;

		// Unit located through buildIdIndex → loadConfig → expectedBlockForId
		// (TASK- prefix → tasks block). Cross-block read path exercised.
		assert.strictEqual((bundle.unit as { id: unknown }).id, "TASK-001");
		assert.strictEqual((bundle.unit as { description: unknown }).description, "parent task");

		// Single declared relation_type → one bucket.
		assert.deepStrictEqual(Object.keys(bundle.perRelationType), ["decomposes"]);
		const ids = (bundle.perRelationType.decomposes.map((it) => (it as { id: unknown }).id) as string[]).sort();
		assert.deepStrictEqual(ids, ["TASK-002", "TASK-003"]);
		assert.strictEqual(bundle.traversal_depth, 2);
		assert.ok(typeof bundle.scoped_at === "string" && bundle.scoped_at.length > 0);
	});
});

describe("gatherExecutionContext integration: scenario B — multi-relation contract, mixed directions, cross-block resolution", () => {
	it("composes 3 buckets spanning tasks + decisions blocks with in / out / both direction semantics", (t) => {
		const tmpDir = makeTmpDir("B-multi");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		buildSubstrate(tmpDir, {
			configRelationTypes: [
				{ canonical_id: "decomposes", display_name: "Decomposes", category: "membership" },
				{ canonical_id: "constrained_by", display_name: "Constrained by", category: "data_flow" },
				{ canonical_id: "related", display_name: "Related", category: "data_flow" },
			],
			tasks: [
				{ id: "TASK-100", description: "subject task", status: "planned" },
				{ id: "TASK-101", description: "decompose child", status: "planned" },
				{ id: "TASK-102", description: "related-out task", status: "planned" },
				{ id: "TASK-103", description: "related-in task", status: "planned" },
			],
			decisions: [{ id: "DEC-100", decision: "constraining decision", rationale: "why", status: "decided" }],
			contracts: [
				{
					id: "CTX-100",
					unit_kind: "task",
					bundle_relation_types: [
						{ relation_type: "decomposes", direction: "out", max_depth: 2 },
						{ relation_type: "constrained_by", direction: "in", max_depth: 1 },
						{ relation_type: "related", direction: "both", max_depth: 1 },
					],
					created_by: "test/integration",
					created_at: "2026-05-13T00:00:00Z",
				},
			],
			edges: [
				// decomposes: TASK-100 → TASK-101 (out)
				{ parent: "TASK-100", child: "TASK-101", relation_type: "decomposes" },
				// constrained_by: DEC-100 → TASK-100 (TASK-100 constrained by DEC-100; "in" walks ancestor)
				{ parent: "DEC-100", child: "TASK-100", relation_type: "constrained_by" },
				// related: TASK-100 → TASK-102 (out) ; TASK-103 → TASK-100 (in)
				{ parent: "TASK-100", child: "TASK-102", relation_type: "related" },
				{ parent: "TASK-103", child: "TASK-100", relation_type: "related" },
			],
		});

		const result = gatherExecutionContext(tmpDir, { unitId: "TASK-100", kind: "task" });
		assert.ok(!("error" in result), `expected ContextBundle, got: ${JSON.stringify(result)}`);
		const bundle = result;

		assert.strictEqual((bundle.unit as { id: unknown }).id, "TASK-100");

		const bucketNames = Object.keys(bundle.perRelationType).sort();
		assert.deepStrictEqual(bucketNames, ["constrained_by", "decomposes", "related"]);

		// decomposes (out / depth 2): TASK-101
		const decomposesIds = bundle.perRelationType.decomposes.map((it) => (it as { id: unknown }).id);
		assert.deepStrictEqual(decomposesIds, ["TASK-101"]);

		// constrained_by (in / depth 1): DEC-100 — CROSS-BLOCK resolution
		// (DEC-100 lives in decisions.json, not tasks.json).
		const constrainedIds = bundle.perRelationType.constrained_by.map((it) => (it as { id: unknown }).id);
		assert.deepStrictEqual(constrainedIds, ["DEC-100"]);
		// Verify cross-block payload shape — decision item carries
		// decisions-schema fields, not tasks-schema fields.
		const decItem = bundle.perRelationType.constrained_by[0] as { rationale?: unknown; decision?: unknown };
		assert.strictEqual(decItem.rationale, "why");
		assert.strictEqual(decItem.decision, "constraining decision");

		// related (both / depth 1): TASK-102 + TASK-103 (deduped union of
		// inbound + outbound id chains)
		const relatedIds = (bundle.perRelationType.related.map((it) => (it as { id: unknown }).id) as string[]).sort();
		assert.deepStrictEqual(relatedIds, ["TASK-102", "TASK-103"]);

		// max effective depth across walks: max(2, 1, 1) = 2
		assert.strictEqual(bundle.traversal_depth, 2);
	});
});

describe("gatherExecutionContext integration: scenario C — deep chain hits max_depth bound", () => {
	it("4-deep descendant chain resolves all reached items; traversal_depth reflects effective cap", (t) => {
		const tmpDir = makeTmpDir("C-depth");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		// Cross-block chain: TASK-200 → TASK-201 → DEC-200 → TASK-202 → DEC-201
		// (alternating tasks/decisions exercises buildIdIndex's per-block scan).
		buildSubstrate(tmpDir, {
			configRelationTypes: [{ canonical_id: "leads_to", display_name: "Leads to", category: "ordering" }],
			tasks: [
				{ id: "TASK-200", description: "root", status: "planned" },
				{ id: "TASK-201", description: "step-1", status: "planned" },
				{ id: "TASK-202", description: "step-3", status: "planned" },
			],
			decisions: [
				{ id: "DEC-200", decision: "step-2", rationale: "why", status: "decided" },
				{ id: "DEC-201", decision: "step-4", rationale: "why", status: "decided" },
			],
			contracts: [
				{
					id: "CTX-200",
					unit_kind: "task",
					bundle_relation_types: [{ relation_type: "leads_to", direction: "out", max_depth: 4 }],
					created_by: "test/integration",
					created_at: "2026-05-13T00:00:00Z",
				},
			],
			edges: [
				{ parent: "TASK-200", child: "TASK-201", relation_type: "leads_to" },
				{ parent: "TASK-201", child: "DEC-200", relation_type: "leads_to" },
				{ parent: "DEC-200", child: "TASK-202", relation_type: "leads_to" },
				{ parent: "TASK-202", child: "DEC-201", relation_type: "leads_to" },
			],
		});

		// Caller maxDepth=3 caps spec.max_depth=4 → effective traversal_depth=3.
		// walkDescendants is visited-set bounded (cycle-safe) but not
		// depth-bounded in the current primitive — the traversal_depth field
		// records the effective cap at the contract layer (depth-bound
		// territory tracked under FGAP-029). All 4 reachable descendants
		// resolve regardless of recorded cap; the assertion exercises the
		// contract surface (cap recorded), not the primitive's depth filter.
		const result = gatherExecutionContext(tmpDir, { unitId: "TASK-200", kind: "task", maxDepth: 3 });
		assert.ok(!("error" in result), `expected ContextBundle, got: ${JSON.stringify(result)}`);
		const bundle = result;

		assert.strictEqual(bundle.traversal_depth, 3, "effective cap min(3, 4) recorded");

		const reachedIds = (bundle.perRelationType.leads_to.map((it) => (it as { id: unknown }).id) as string[]).sort();
		assert.deepStrictEqual(
			reachedIds,
			["DEC-200", "DEC-201", "TASK-201", "TASK-202"],
			"all 4 reachable descendants resolved via cross-block buildIdIndex (visited-set bounded; depth-bound is FGAP-029 territory)",
		);

		// Run without caller cap → traversal_depth == spec.max_depth (4).
		const noCap = gatherExecutionContext(tmpDir, { unitId: "TASK-200", kind: "task" });
		assert.ok(!("error" in noCap));
		assert.strictEqual(noCap.traversal_depth, 4);
	});
});

describe("gatherExecutionContext integration: scenario D — missing edges yield empty buckets, no false-pass via fallback", () => {
	it("contract declares relation_types with zero matching edges; buckets present + empty; no schema-thrash", (t) => {
		const tmpDir = makeTmpDir("D-missing-edges");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		// Substrate has edges, but NOT for the relation_types the contract
		// declares. Verifies the bundle does not silently swallow the empty
		// walk as a missing-bucket condition; per gatherExecutionContext
		// implementation each declared relation_type ALWAYS gets a bucket
		// even when reachedIds.length === 0.
		buildSubstrate(tmpDir, {
			configRelationTypes: [
				{ canonical_id: "decomposes", display_name: "Decomposes", category: "membership" },
				{ canonical_id: "blocks", display_name: "Blocks", category: "ordering" },
				{ canonical_id: "informs", display_name: "Informs", category: "data_flow" },
			],
			tasks: [
				{ id: "TASK-300", description: "isolated", status: "planned" },
				{ id: "TASK-301", description: "unrelated-but-present", status: "planned" },
			],
			decisions: [{ id: "DEC-300", decision: "unrelated decision", rationale: "why", status: "decided" }],
			contracts: [
				{
					id: "CTX-300",
					unit_kind: "task",
					bundle_relation_types: [
						{ relation_type: "decomposes", direction: "out", max_depth: 2 },
						{ relation_type: "blocks", direction: "in", max_depth: 1 },
						{ relation_type: "informs", direction: "both", max_depth: 1 },
					],
					created_by: "test/integration",
					created_at: "2026-05-13T00:00:00Z",
				},
			],
			// edges exist but reference DIFFERENT relation_types — none of
			// the contract's declared relation_types have matching edges.
			edges: [{ parent: "TASK-301", child: "DEC-300", relation_type: "unrelated" }],
		});

		const result = gatherExecutionContext(tmpDir, { unitId: "TASK-300", kind: "task" });
		assert.ok(!("error" in result), `expected ContextBundle, got: ${JSON.stringify(result)}`);
		const bundle = result;

		assert.strictEqual((bundle.unit as { id: unknown }).id, "TASK-300");

		// All three declared relation_types appear as buckets, each empty.
		// (A false-pass fallback would either omit them or populate them
		// with the wrong items by walking the "unrelated" edge.)
		const bucketNames = Object.keys(bundle.perRelationType).sort();
		assert.deepStrictEqual(bucketNames, ["blocks", "decomposes", "informs"]);
		assert.deepStrictEqual(bundle.perRelationType.decomposes, []);
		assert.deepStrictEqual(bundle.perRelationType.blocks, []);
		assert.deepStrictEqual(bundle.perRelationType.informs, []);

		// max effective depth across declared specs: max(2, 1, 1) = 2
		assert.strictEqual(bundle.traversal_depth, 2);
	});
});
