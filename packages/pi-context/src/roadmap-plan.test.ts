import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { clearLensValidators, getLensValidators, registerLensValidator } from "./lens-validator.js";
import type { ItemRecord } from "./project-context.js";
import { validateProject } from "./project-sdk.js";
import {
	listRoadmaps,
	loadRoadmap,
	renderRoadmap,
	resolveStatusVocabulary,
	rollupPhaseStatus,
	type StatusBucket,
	topoSort,
	validateRoadmaps,
} from "./roadmap-plan.js";

// ── Status vocabulary defaults (mapped via resolveStatusVocabulary against an
// empty config so the default registry surfaces verbatim). ─────────────────

describe("STATUS_VOCABULARY (default registry resolved with no config overrides)", () => {
	function vocabIn(): Record<string, StatusBucket> {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "roadmap-vocab-default-"));
		fs.mkdirSync(path.join(dir, ".project"), { recursive: true });
		fs.writeFileSync(
			path.join(dir, ".project", "config.json"),
			JSON.stringify({ schema_version: "0.2.0", root: ".project", lenses: [], block_kinds: [] }, null, 2),
		);
		const result = resolveStatusVocabulary(dir);
		fs.rmSync(dir, { recursive: true, force: true });
		return result;
	}

	it("maps known issue statuses correctly", () => {
		const v = vocabIn();
		assert.equal(v.open, "todo");
		assert.equal(v.resolved, "complete");
		assert.equal(v.deferred, "unknown");
	});

	it("maps known decision statuses correctly", () => {
		const v = vocabIn();
		assert.equal(v.open, "todo");
		assert.equal(v.enacted, "complete");
		assert.equal(v.superseded, "unknown");
	});

	it("maps known task statuses correctly", () => {
		const v = vocabIn();
		assert.equal(v.todo, "todo");
		assert.equal(v.in_progress, "in_progress");
		assert.equal(v.completed, "complete");
		assert.equal(v.cancelled, "unknown");
	});

	it("handles hyphenated status variants", () => {
		const v = vocabIn();
		assert.equal(v["in-progress"], "in_progress");
		assert.equal(v["not-started"], "todo");
	});
});

describe("rollupPhaseStatus", () => {
	it("returns unknown bucket for empty items array", () => {
		const result = rollupPhaseStatus([]);
		assert.equal(result.bucket, "unknown");
		assert.equal(result.total, 0);
		assert.deepEqual(result.counts, { complete: 0, in_progress: 0, blocked: 0, todo: 0, unknown: 0 });
	});

	it("returns complete when all items complete", () => {
		const items: ItemRecord[] = [
			{ id: "a", status: "resolved" },
			{ id: "b", status: "enacted" },
			{ id: "c", status: "completed" },
		];
		const result = rollupPhaseStatus(items);
		assert.equal(result.bucket, "complete");
		assert.equal(result.counts.complete, 3);
		assert.equal(result.total, 3);
	});

	it("returns in_progress when any item in_progress and none blocked", () => {
		const items: ItemRecord[] = [
			{ id: "a", status: "resolved" },
			{ id: "b", status: "in_progress" },
			{ id: "c", status: "open" },
		];
		const result = rollupPhaseStatus(items);
		assert.equal(result.bucket, "in_progress");
		assert.equal(result.counts.complete, 1);
		assert.equal(result.counts.in_progress, 1);
		assert.equal(result.counts.todo, 1);
	});

	it("returns blocked when ANY item blocked even with completes", () => {
		const items: ItemRecord[] = [
			{ id: "a", status: "resolved" },
			{ id: "b", status: "blocked" },
			{ id: "c", status: "in_progress" },
		];
		const result = rollupPhaseStatus(items);
		assert.equal(result.bucket, "blocked");
		assert.equal(result.counts.blocked, 1);
		assert.equal(result.counts.in_progress, 1);
		assert.equal(result.counts.complete, 1);
	});

	it("returns todo when only todos and completes (no in_progress, no blocked)", () => {
		const items: ItemRecord[] = [
			{ id: "a", status: "open" },
			{ id: "b", status: "resolved" },
		];
		const result = rollupPhaseStatus(items);
		assert.equal(result.bucket, "todo");
	});

	it("returns unknown when items have unrecognized status values", () => {
		const items: ItemRecord[] = [
			{ id: "a", status: "frob" },
			{ id: "b", status: "qux" },
		];
		const result = rollupPhaseStatus(items);
		assert.equal(result.bucket, "unknown");
		assert.equal(result.counts.unknown, 2);
	});

	it("treats items missing status as unknown", () => {
		const items: ItemRecord[] = [{ id: "a" }, { id: "b" }];
		const result = rollupPhaseStatus(items);
		assert.equal(result.bucket, "unknown");
		assert.equal(result.counts.unknown, 2);
	});

	it("normalizes status case to lower for lookup", () => {
		const items: ItemRecord[] = [
			{ id: "a", status: "RESOLVED" },
			{ id: "b", status: "Open" },
		];
		const result = rollupPhaseStatus(items);
		assert.equal(result.counts.complete, 1);
		assert.equal(result.counts.todo, 1);
	});
});

describe("topoSort", () => {
	type Node = { id: string; deps: string[] };
	const idOf = (n: Node) => n.id;
	const depsOf = (n: Node) => n.deps;

	it("returns empty result for empty input", () => {
		const result = topoSort<Node>([], idOf, depsOf);
		assert.deepEqual(result.order, []);
		assert.deepEqual(result.cycles, []);
	});

	it("returns single-node order for single-node input", () => {
		const result = topoSort<Node>([{ id: "A", deps: [] }], idOf, depsOf);
		assert.deepEqual(result.order, ["A"]);
		assert.deepEqual(result.cycles, []);
	});

	it("orders linear chain correctly", () => {
		const result = topoSort<Node>(
			[
				{ id: "C", deps: ["B"] },
				{ id: "A", deps: [] },
				{ id: "B", deps: ["A"] },
			],
			idOf,
			depsOf,
		);
		assert.deepEqual(result.order, ["A", "B", "C"]);
		assert.deepEqual(result.cycles, []);
	});

	it("preserves input order for independent nodes within same stratum", () => {
		const result = topoSort<Node>(
			[
				{ id: "A", deps: [] },
				{ id: "B", deps: [] },
				{ id: "C", deps: [] },
			],
			idOf,
			depsOf,
		);
		assert.deepEqual(result.order, ["A", "B", "C"]);
	});

	it("orders DAG with branching correctly", () => {
		// A → B, A → C, B → D, C → D
		const result = topoSort<Node>(
			[
				{ id: "D", deps: ["B", "C"] },
				{ id: "A", deps: [] },
				{ id: "B", deps: ["A"] },
				{ id: "C", deps: ["A"] },
			],
			idOf,
			depsOf,
		);
		assert.equal(result.order[0], "A");
		assert.equal(result.order[3], "D");
		assert.deepEqual(result.cycles, []);
	});

	it("detects 2-node cycle", () => {
		const result = topoSort<Node>(
			[
				{ id: "A", deps: ["B"] },
				{ id: "B", deps: ["A"] },
			],
			idOf,
			depsOf,
		);
		assert.equal(result.cycles.length, 1);
		const cycle = result.cycles[0];
		assert.ok(cycle, "expected at least one cycle");
		assert.equal(cycle.length, 3); // A→B→A or B→A→B
	});

	it("detects 3-node cycle", () => {
		const result = topoSort<Node>(
			[
				{ id: "A", deps: ["C"] },
				{ id: "B", deps: ["A"] },
				{ id: "C", deps: ["B"] },
			],
			idOf,
			depsOf,
		);
		assert.equal(result.cycles.length, 1);
	});

	it("detects self-loop", () => {
		const result = topoSort<Node>([{ id: "A", deps: ["A"] }], idOf, depsOf);
		assert.equal(result.cycles.length, 1);
		assert.deepEqual(result.cycles[0], ["A", "A"]);
	});

	it("returns partial order for graphs with cycle in only one component", () => {
		const result = topoSort<Node>(
			[
				{ id: "A", deps: [] }, // acyclic
				{ id: "B", deps: ["A"] },
				{ id: "C", deps: ["D"] }, // cycle
				{ id: "D", deps: ["C"] },
			],
			idOf,
			depsOf,
		);
		assert.deepEqual(result.order, ["A", "B"]);
		assert.equal(result.cycles.length, 1);
	});

	it("ignores deps pointing at nodes outside the input set", () => {
		const result = topoSort<Node>([{ id: "A", deps: ["NONEXISTENT"] }], idOf, depsOf);
		assert.deepEqual(result.order, ["A"]);
		assert.deepEqual(result.cycles, []);
	});

	it("handles diamond DAG", () => {
		// A → B → D, A → C → D
		const result = topoSort<Node>(
			[
				{ id: "A", deps: [] },
				{ id: "B", deps: ["A"] },
				{ id: "C", deps: ["A"] },
				{ id: "D", deps: ["B", "C"] },
			],
			idOf,
			depsOf,
		);
		assert.equal(result.order[0], "A");
		assert.equal(result.order[3], "D");
		assert.ok(result.order.includes("B"));
		assert.ok(result.order.includes("C"));
		assert.deepEqual(result.cycles, []);
	});
});

describe("StatusBucket type", () => {
	it("StatusBucket is a string union with 5 values", () => {
		const all: StatusBucket[] = ["complete", "in_progress", "blocked", "todo", "unknown"];
		assert.equal(all.length, 5);
	});
});

// ── Roadmap loading + validation + rendering ─────────────────────────────

interface RoadmapFixture {
	lenses?: Array<Record<string, unknown>>;
	relations?: Array<{ parent: string; child: string; relation_type: string }>;
	roadmaps?: Array<Record<string, unknown>>;
	issues?: Array<Record<string, unknown>>;
	features?: Array<Record<string, unknown>>;
	verifications?: Array<Record<string, unknown>>;
	naming?: Record<string, string>;
	status_buckets?: Record<string, StatusBucket>;
	display_strings?: Record<string, string>;
}

function makeRoadmapProject(fixture: RoadmapFixture): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-context-roadmap-"));
	fs.mkdirSync(path.join(dir, ".project", "schemas"), { recursive: true });
	const config: Record<string, unknown> = {
		schema_version: "0.2.0",
		root: ".project",
		lenses: fixture.lenses ?? [],
		installed_blocks: ["roadmap"],
		block_kinds: [],
	};
	if (fixture.naming) config.naming = fixture.naming;
	if (fixture.status_buckets) config.status_buckets = fixture.status_buckets;
	if (fixture.display_strings) config.display_strings = fixture.display_strings;
	fs.writeFileSync(path.join(dir, ".project", "config.json"), JSON.stringify(config, null, 2));
	if (fixture.relations) {
		// relations.json schema is a bare Edge[] array at the top level (per
		// loadRelations docs in project-context.ts); the {edges: [...]} shape
		// is the lens-view fixture's prior shape and would AJV-fail here.
		fs.writeFileSync(path.join(dir, ".project", "relations.json"), JSON.stringify(fixture.relations, null, 2));
	}
	if (fixture.roadmaps !== undefined) {
		fs.writeFileSync(
			path.join(dir, ".project", "roadmap.json"),
			JSON.stringify({ roadmaps: fixture.roadmaps }, null, 2),
		);
	}
	if (fixture.issues) {
		fs.writeFileSync(path.join(dir, ".project", "issues.json"), JSON.stringify({ issues: fixture.issues }, null, 2));
	}
	if (fixture.features) {
		fs.writeFileSync(
			path.join(dir, ".project", "features.json"),
			JSON.stringify({ features: fixture.features }, null, 2),
		);
	}
	if (fixture.verifications) {
		fs.writeFileSync(
			path.join(dir, ".project", "verification.json"),
			JSON.stringify({ verifications: fixture.verifications }, null, 2),
		);
	}
	return dir;
}

const ACYCLIC_LENSES = [
	{
		id: "lens-issues-by-phase",
		target: "issues",
		relation_type: "phase_member",
		derived_from_field: null,
		bins: ["PHASE-A", "PHASE-B", "PHASE-C"],
	},
	{
		id: "lens-features",
		target: "features",
		relation_type: "feature_member",
		derived_from_field: null,
		bins: ["PHASE-A", "PHASE-B", "PHASE-C"],
	},
];

const ACYCLIC_PHASES = [
	{ id: "PHASE-A", name: "Spec", lens: "lens-issues-by-phase" },
	{ id: "PHASE-B", name: "Implement", lens: "lens-issues-by-phase" },
	{
		id: "PHASE-C",
		name: "Verify",
		lens: "lens-features",
		milestone: "MILESTONE-001",
		exit_criteria: ["all tests pass"],
	},
];

function buildAcyclicRoadmap(extras: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
	return {
		id: "ROADMAP-001",
		title: "Substrate arc",
		description: "Sequenced substrate landing.",
		status: "active",
		phases: ACYCLIC_PHASES,
		milestones: [
			{
				id: "MILESTONE-001",
				name: "All verified",
				evidence_block: "verification",
				evidence_query: { status: "passed" },
			},
		],
		...extras,
	};
}

let roadmapTmpRoot: string;

describe("loadRoadmap", () => {
	afterEach(() => {
		if (roadmapTmpRoot) fs.rmSync(roadmapTmpRoot, { recursive: true, force: true });
	});

	it("returns error when no config exists", () => {
		roadmapTmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-context-roadmap-noconfig-"));
		fs.mkdirSync(path.join(roadmapTmpRoot, ".project"), { recursive: true });
		const result = loadRoadmap(roadmapTmpRoot, "ROADMAP-001");
		assert.ok("error" in result);
		assert.match(result.error, /No \.project\/config\.json/);
	});

	it("returns error when roadmap.json absent", () => {
		roadmapTmpRoot = makeRoadmapProject({ lenses: ACYCLIC_LENSES, relations: [] });
		const result = loadRoadmap(roadmapTmpRoot, "ROADMAP-001");
		assert.ok("error" in result);
		assert.match(result.error, /no roadmap\.json/);
	});

	it("returns error when roadmap id unknown", () => {
		roadmapTmpRoot = makeRoadmapProject({
			lenses: ACYCLIC_LENSES,
			relations: [],
			roadmaps: [buildAcyclicRoadmap()],
		});
		const result = loadRoadmap(roadmapTmpRoot, "ROADMAP-999");
		assert.ok("error" in result);
		assert.match(result.error, /not found/);
	});

	it("loads happy path with linear phase chain", () => {
		roadmapTmpRoot = makeRoadmapProject({
			lenses: ACYCLIC_LENSES,
			relations: [
				{ parent: "PHASE-A", child: "PHASE-B", relation_type: "phase_depends_on" },
				{ parent: "PHASE-B", child: "PHASE-C", relation_type: "phase_depends_on" },
			],
			roadmaps: [buildAcyclicRoadmap()],
			issues: [{ id: "issue-001", status: "resolved" }],
			features: [{ id: "FEAT-001", status: "complete" }],
			verifications: [{ id: "VER-001", status: "passed", target: "PHASE-C" }],
		});
		const result = loadRoadmap(roadmapTmpRoot, "ROADMAP-001");
		assert.ok(!("error" in result));
		assert.deepEqual(result.phaseOrder, ["PHASE-A", "PHASE-B", "PHASE-C"]);
		assert.deepEqual(result.cycles, []);
		assert.equal(result.phases.length, 3);
		assert.equal(result.edges.length, 2);
	});

	it("returns partial phaseOrder + populated cycles when phases form a cycle", () => {
		roadmapTmpRoot = makeRoadmapProject({
			lenses: ACYCLIC_LENSES,
			relations: [
				{ parent: "PHASE-A", child: "PHASE-B", relation_type: "phase_depends_on" },
				{ parent: "PHASE-B", child: "PHASE-A", relation_type: "phase_depends_on" },
			],
			roadmaps: [buildAcyclicRoadmap()],
		});
		const result = loadRoadmap(roadmapTmpRoot, "ROADMAP-001");
		assert.ok(!("error" in result));
		assert.deepEqual(result.phaseOrder, ["PHASE-C"]);
		assert.ok(result.cycles.length > 0);
	});

	it("evaluates milestoneSatisfied=true when evidence query matches at least one item", () => {
		roadmapTmpRoot = makeRoadmapProject({
			lenses: ACYCLIC_LENSES,
			relations: [],
			roadmaps: [buildAcyclicRoadmap()],
			verifications: [{ id: "VER-001", status: "passed", target: "PHASE-C" }],
		});
		const result = loadRoadmap(roadmapTmpRoot, "ROADMAP-001");
		assert.ok(!("error" in result));
		const phaseC = result.phases.find((p) => p.phase.id === "PHASE-C");
		assert.ok(phaseC);
		assert.equal(phaseC.milestoneSatisfied, true);
	});

	it("evaluates milestoneSatisfied=false when no evidence matches", () => {
		roadmapTmpRoot = makeRoadmapProject({
			lenses: ACYCLIC_LENSES,
			relations: [],
			roadmaps: [buildAcyclicRoadmap()],
			verifications: [{ id: "VER-001", status: "failed", target: "PHASE-C" }],
		});
		const result = loadRoadmap(roadmapTmpRoot, "ROADMAP-001");
		assert.ok(!("error" in result));
		const phaseC = result.phases.find((p) => p.phase.id === "PHASE-C");
		assert.ok(phaseC);
		assert.equal(phaseC.milestoneSatisfied, false);
	});
});

describe("listRoadmaps", () => {
	afterEach(() => {
		if (roadmapTmpRoot) fs.rmSync(roadmapTmpRoot, { recursive: true, force: true });
	});

	it("returns empty array when roadmap.json absent", () => {
		roadmapTmpRoot = makeRoadmapProject({ lenses: ACYCLIC_LENSES, relations: [] });
		const result = listRoadmaps(roadmapTmpRoot);
		assert.deepEqual(result, []);
	});

	it("returns one entry per roadmap with correct shape", () => {
		roadmapTmpRoot = makeRoadmapProject({
			lenses: ACYCLIC_LENSES,
			relations: [],
			roadmaps: [buildAcyclicRoadmap()],
		});
		const result = listRoadmaps(roadmapTmpRoot);
		assert.equal(result.length, 1);
		assert.equal(result[0]?.id, "ROADMAP-001");
		assert.equal(result[0]?.title, "Substrate arc");
		assert.equal(result[0]?.status, "active");
		assert.equal(result[0]?.phaseCount, 3);
	});
});

describe("validateRoadmaps", () => {
	afterEach(() => {
		if (roadmapTmpRoot) fs.rmSync(roadmapTmpRoot, { recursive: true, force: true });
	});

	it("returns clean for happy-path acyclic fixture", () => {
		roadmapTmpRoot = makeRoadmapProject({
			lenses: ACYCLIC_LENSES,
			relations: [
				{ parent: "PHASE-A", child: "PHASE-B", relation_type: "phase_depends_on" },
				{ parent: "PHASE-B", child: "PHASE-C", relation_type: "phase_depends_on" },
			],
			roadmaps: [buildAcyclicRoadmap()],
			issues: [{ id: "issue-001", status: "resolved" }],
			features: [{ id: "FEAT-001", status: "complete" }],
			verifications: [{ id: "VER-001", status: "passed", target: "PHASE-C" }],
		});
		const result = validateRoadmaps(roadmapTmpRoot);
		assert.equal(result.status, "clean");
		assert.deepEqual(result.issues, []);
	});

	it("emits roadmap_lens_missing when phase references unknown lens", () => {
		const phases = [
			{ id: "PHASE-A", name: "Spec", lens: "doesnt-exist" },
			{ id: "PHASE-B", name: "Build", lens: "lens-issues-by-phase" },
		];
		roadmapTmpRoot = makeRoadmapProject({
			lenses: ACYCLIC_LENSES,
			relations: [],
			roadmaps: [{ id: "ROADMAP-001", title: "X", phases }],
		});
		const result = validateRoadmaps(roadmapTmpRoot);
		assert.equal(result.status, "invalid");
		assert.ok(result.issues.some((i) => i.code === "roadmap_lens_missing" && i.phase_id === "PHASE-A"));
	});

	it("emits roadmap_phase_dep_missing for dangling phase_depends_on edge", () => {
		roadmapTmpRoot = makeRoadmapProject({
			lenses: ACYCLIC_LENSES,
			relations: [{ parent: "PHASE-X", child: "PHASE-A", relation_type: "phase_depends_on" }],
			roadmaps: [buildAcyclicRoadmap()],
		});
		const result = validateRoadmaps(roadmapTmpRoot);
		assert.equal(result.status, "invalid");
		assert.ok(result.issues.some((i) => i.code === "roadmap_phase_dep_missing"));
	});

	it("emits roadmap_phase_cycle when phases cycle", () => {
		roadmapTmpRoot = makeRoadmapProject({
			lenses: ACYCLIC_LENSES,
			relations: [
				{ parent: "PHASE-A", child: "PHASE-B", relation_type: "phase_depends_on" },
				{ parent: "PHASE-B", child: "PHASE-A", relation_type: "phase_depends_on" },
			],
			roadmaps: [buildAcyclicRoadmap()],
		});
		const result = validateRoadmaps(roadmapTmpRoot);
		assert.equal(result.status, "invalid");
		assert.ok(result.issues.some((i) => i.code === "roadmap_phase_cycle"));
	});

	it("emits roadmap_composition_cycle when phase resolves to a self-cycling composition lens", () => {
		const lenses = [
			{ id: "lens-A", kind: "composition", bins: [], targets: ["issues"], members: [{ lens: "lens-B" }] },
			{ id: "lens-B", kind: "composition", bins: [], targets: ["issues"], members: [{ lens: "lens-A" }] },
		];
		roadmapTmpRoot = makeRoadmapProject({
			lenses,
			relations: [],
			roadmaps: [
				{
					id: "ROADMAP-001",
					title: "Cycle test",
					phases: [{ id: "PHASE-A", name: "Cycle", lens: "lens-A" }],
				},
			],
			issues: [],
		});
		const result = validateRoadmaps(roadmapTmpRoot);
		assert.equal(result.status, "invalid");
		assert.ok(result.issues.some((i) => i.code === "roadmap_composition_cycle"));
	});

	it("emits roadmap_milestone_evidence_block_missing when evidence_block not loaded", () => {
		const roadmap = buildAcyclicRoadmap({
			milestones: [
				{
					id: "MILESTONE-001",
					name: "X",
					evidence_block: "doesnt-exist",
					evidence_query: { status: "passed" },
				},
			],
		});
		roadmapTmpRoot = makeRoadmapProject({
			lenses: ACYCLIC_LENSES,
			relations: [],
			roadmaps: [roadmap],
		});
		const result = validateRoadmaps(roadmapTmpRoot);
		assert.ok(result.issues.some((i) => i.code === "roadmap_milestone_evidence_block_missing"));
	});

	it("emits roadmap_milestone_query_invalid when evidence_query has nested non-primitive", () => {
		const roadmap = buildAcyclicRoadmap({
			milestones: [
				{
					id: "MILESTONE-001",
					name: "X",
					evidence_block: "verification",
					evidence_query: { nested: { not: "primitive" } },
				},
			],
		});
		roadmapTmpRoot = makeRoadmapProject({
			lenses: ACYCLIC_LENSES,
			relations: [],
			roadmaps: [roadmap],
			verifications: [{ id: "VER-001", status: "passed" }],
		});
		const result = validateRoadmaps(roadmapTmpRoot);
		assert.ok(result.issues.some((i) => i.code === "roadmap_milestone_query_invalid"));
	});

	it("emits roadmap_status_unknown_value when roadmap.status is outside enum", () => {
		const roadmap = buildAcyclicRoadmap({ status: "rejected" });
		roadmapTmpRoot = makeRoadmapProject({
			lenses: ACYCLIC_LENSES,
			relations: [],
			roadmaps: [roadmap],
		});
		const result = validateRoadmaps(roadmapTmpRoot);
		assert.ok(result.issues.some((i) => i.code === "roadmap_status_unknown_value"));
	});
});

describe("renderRoadmap (markdown shape, NO mermaid)", () => {
	afterEach(() => {
		if (roadmapTmpRoot) fs.rmSync(roadmapTmpRoot, { recursive: true, force: true });
	});

	it("emits the canonical pure-textual markdown layout", () => {
		roadmapTmpRoot = makeRoadmapProject({
			lenses: ACYCLIC_LENSES,
			relations: [
				{ parent: "PHASE-A", child: "PHASE-B", relation_type: "phase_depends_on" },
				{ parent: "PHASE-B", child: "PHASE-C", relation_type: "phase_depends_on" },
			],
			roadmaps: [buildAcyclicRoadmap()],
			issues: [{ id: "issue-001", status: "open", title: "First" }],
			features: [{ id: "FEAT-001", status: "complete", title: "Done" }],
			verifications: [{ id: "VER-001", status: "passed" }],
		});
		const view = loadRoadmap(roadmapTmpRoot, "ROADMAP-001");
		assert.ok(!("error" in view));
		const md = renderRoadmap(view, undefined);

		assert.match(md, /^# Roadmap: .* \(ROADMAP-001\)$/m);
		assert.match(md, /\*\*Status:\*\*/);
		assert.match(md, /^## Phase order$/m);
		assert.match(md, /^1\. PHASE-A — /m);
		assert.match(md, /^2\. PHASE-B — /m);
		assert.match(md, /^3\. PHASE-C — /m);
		assert.match(md, /^## Phases$/m);
		assert.match(md, /^### .+ \(PHASE-A\) \[(complete|in_progress|blocked|todo|unknown)\]$/m);
		assert.match(md, /\*\*Lens:\*\* lens-issues-by-phase/);
		assert.match(md, /\*\*Depends on:\*\* (—|[A-Z0-9-]+(, [A-Z0-9-]+)*)/);
		assert.match(md, /\*\*Counts:\*\* complete=\d+ in_progress=\d+ blocked=\d+ todo=\d+ unknown=\d+ \(total=\d+\)/);
		assert.match(md, /\*\*Milestone:\*\* MILESTONE-001 — .+ — (satisfied|not yet satisfied)/);
		assert.match(md, /\| Item +\| Status +\| Title +\|/);

		// Negative regression assertion (against the prior fabrication defect).
		assert.doesNotMatch(md, /mermaid|graph LR|graph TD|-->/);
	});

	it("surfaces cycle-participating phases under a separate heading and Cycles detected line", () => {
		roadmapTmpRoot = makeRoadmapProject({
			lenses: ACYCLIC_LENSES,
			relations: [
				{ parent: "PHASE-A", child: "PHASE-B", relation_type: "phase_depends_on" },
				{ parent: "PHASE-B", child: "PHASE-A", relation_type: "phase_depends_on" },
			],
			roadmaps: [buildAcyclicRoadmap()],
		});
		const view = loadRoadmap(roadmapTmpRoot, "ROADMAP-001");
		assert.ok(!("error" in view));
		const md = renderRoadmap(view, undefined);

		assert.match(md, /\*\*Unordered \(cycle-participating\):\*\*/);
		assert.match(md, /\*\*Cycles detected:\*\*/);

		// Negative regression assertion.
		assert.doesNotMatch(md, /mermaid|graph LR|graph TD|-->/);
	});
});

describe("Diamond/branching-DAG roadmap (no fabricated edges)", () => {
	afterEach(() => {
		if (roadmapTmpRoot) fs.rmSync(roadmapTmpRoot, { recursive: true, force: true });
	});

	const DIAMOND_LENSES = [
		{
			id: "lens-issues-by-phase",
			target: "issues",
			relation_type: "phase_member",
			derived_from_field: null,
			bins: ["PHASE-A", "PHASE-B", "PHASE-C", "PHASE-D"],
		},
	];

	const diamondRoadmap = {
		id: "ROADMAP-001",
		title: "Diamond DAG",
		status: "active",
		phases: [
			{ id: "PHASE-A", name: "Root", lens: "lens-issues-by-phase" },
			{ id: "PHASE-B", name: "Left", lens: "lens-issues-by-phase" },
			{ id: "PHASE-C", name: "Right", lens: "lens-issues-by-phase" },
			{ id: "PHASE-D", name: "Sink", lens: "lens-issues-by-phase" },
		],
	};

	function setupDiamond(): void {
		roadmapTmpRoot = makeRoadmapProject({
			lenses: DIAMOND_LENSES,
			relations: [
				{ parent: "PHASE-A", child: "PHASE-B", relation_type: "phase_depends_on" },
				{ parent: "PHASE-A", child: "PHASE-C", relation_type: "phase_depends_on" },
				{ parent: "PHASE-B", child: "PHASE-D", relation_type: "phase_depends_on" },
				{ parent: "PHASE-C", child: "PHASE-D", relation_type: "phase_depends_on" },
			],
			roadmaps: [diamondRoadmap],
		});
	}

	it("loads with phaseOrder anchored at A and D, no cycles, all four edges populated", () => {
		setupDiamond();
		const view = loadRoadmap(roadmapTmpRoot, "ROADMAP-001");
		assert.ok(!("error" in view));
		assert.equal(view.phaseOrder[0], "PHASE-A");
		assert.equal(view.phaseOrder[3], "PHASE-D");
		const middle = view.phaseOrder.slice(1, 3).sort();
		assert.deepEqual(middle, ["PHASE-B", "PHASE-C"]);
		assert.deepEqual(view.cycles, []);
		assert.equal(view.edges.length, 4);

		const edgeKeys = view.edges.map((e) => `${e.parent}->${e.child}`).sort();
		assert.deepEqual(edgeKeys, ["PHASE-A->PHASE-B", "PHASE-A->PHASE-C", "PHASE-B->PHASE-D", "PHASE-C->PHASE-D"]);
	});

	it("renders per-phase Depends on lines from authored edges only — no fabricated B↔C edge", () => {
		setupDiamond();
		const view = loadRoadmap(roadmapTmpRoot, "ROADMAP-001");
		assert.ok(!("error" in view));
		const md = renderRoadmap(view, undefined);

		assert.match(md, /\(PHASE-A\)[^\n]*\n[\s\S]*?\*\*Depends on:\*\* —/);
		assert.match(md, /\(PHASE-B\)[^\n]*\n[\s\S]*?\*\*Depends on:\*\* PHASE-A/);
		assert.match(md, /\(PHASE-C\)[^\n]*\n[\s\S]*?\*\*Depends on:\*\* PHASE-A/);
		assert.match(md, /\(PHASE-D\)[^\n]*\n[\s\S]*?\*\*Depends on:\*\* PHASE-B, PHASE-C/);

		// CRITICAL: render output must NOT contain any sibling B↔C edge text.
		assert.doesNotMatch(md, /B → C/);
		assert.doesNotMatch(md, /C → B/);
		assert.doesNotMatch(md, /PHASE-B → PHASE-C/);
		assert.doesNotMatch(md, /PHASE-C → PHASE-B/);

		// And the ambient mermaid/graph-syntax regression guard.
		assert.doesNotMatch(md, /mermaid|graph LR|graph TD|-->/);
	});
});

// ── pi-context Step 7 divergence tests ──────────────────────────────────────

describe("resolveStatusVocabulary merges config.status_buckets over defaults (config wins)", () => {
	afterEach(() => {
		if (roadmapTmpRoot) fs.rmSync(roadmapTmpRoot, { recursive: true, force: true });
	});

	it("merges config.status_buckets over defaults; user keys win on collision", () => {
		roadmapTmpRoot = makeRoadmapProject({
			lenses: [],
			relations: [],
			status_buckets: { custom_status: "blocked", resolved: "todo" },
		});
		const v = resolveStatusVocabulary(roadmapTmpRoot);
		// Default key still present.
		assert.equal(v.open, "todo");
		// Config-supplied key present.
		assert.equal(v.custom_status, "blocked");
		// Collision: config wins (default mapping was "complete").
		assert.equal(v.resolved, "todo");
	});
});

describe("diagMessage resolves config.display_strings override; falls back to embedded English when absent", () => {
	afterEach(() => {
		if (roadmapTmpRoot) fs.rmSync(roadmapTmpRoot, { recursive: true, force: true });
	});

	it("returns embedded English when no config override; returns custom string when override present", () => {
		// First fixture: no display_strings override.
		const fallbackDir = makeRoadmapProject({
			lenses: ACYCLIC_LENSES,
			relations: [],
			roadmaps: [
				{
					id: "ROADMAP-001",
					title: "X",
					phases: [{ id: "PHASE-A", name: "A", lens: "doesnt-exist" }],
				},
			],
		});
		const fallback = validateRoadmaps(fallbackDir);
		const fallbackIssue = fallback.issues.find((i) => i.code === "roadmap_lens_missing");
		assert.ok(fallbackIssue);
		assert.match(fallbackIssue.message, /references unknown lens 'doesnt-exist'/);
		fs.rmSync(fallbackDir, { recursive: true, force: true });

		// Second fixture (distinct tmpdir bypasses the getProjectContext mtime cache):
		// display_strings override.
		roadmapTmpRoot = makeRoadmapProject({
			lenses: ACYCLIC_LENSES,
			relations: [],
			roadmaps: [
				{
					id: "ROADMAP-001",
					title: "X",
					phases: [{ id: "PHASE-A", name: "A", lens: "doesnt-exist" }],
				},
			],
			display_strings: { roadmap_lens_missing: "Custom localized message" },
		});
		const overridden = validateRoadmaps(roadmapTmpRoot);
		const overriddenIssue = overridden.issues.find((i) => i.code === "roadmap_lens_missing");
		assert.ok(overriddenIssue);
		assert.equal(overriddenIssue.message, "Custom localized message");
	});
});

describe("lens-validator dispatch: register + getValidators round-trip; idempotent by name", () => {
	let snapshot: ReadonlyArray<{ name: string; validate: (cwd: string) => unknown }>;

	afterEach(() => {
		clearLensValidators();
		// Restore the auto-registered 'roadmap' validator (and any others
		// registered at module-init) so cross-file test runs in the same tsx
		// --test process see the canonical registry.
		for (const v of snapshot) {
			registerLensValidator(v as { name: string; validate: (cwd: string) => never });
		}
	});

	it("clearLensValidators empties; registering same name is last-wins; distinct names accumulate", () => {
		snapshot = [...getLensValidators()];
		clearLensValidators();
		assert.equal(getLensValidators().length, 0);

		const noopResult = { status: "clean" as const, issues: [] };
		registerLensValidator({ name: "alpha", validate: () => noopResult });
		registerLensValidator({ name: "alpha", validate: () => noopResult });
		assert.equal(getLensValidators().length, 1);

		registerLensValidator({ name: "beta", validate: () => noopResult });
		assert.equal(getLensValidators().length, 2);
	});
});

describe("validateProject (project-sdk) iterates registered lens-validators and merges issues", () => {
	let snapshot: ReadonlyArray<{ name: string; validate: (cwd: string) => unknown }>;

	afterEach(() => {
		if (roadmapTmpRoot) fs.rmSync(roadmapTmpRoot, { recursive: true, force: true });
		clearLensValidators();
		// Restore canonical registry so cross-file test order does not bleed
		// synthetic validators into other suites.
		for (const v of snapshot) {
			registerLensValidator(v as { name: string; validate: (cwd: string) => never });
		}
	});

	it("merges fake lens-validator's issues into validateProject output; defensive try/catch wraps validator throws", () => {
		snapshot = [...getLensValidators()];
		clearLensValidators();
		registerLensValidator({
			name: "fake-test-validator",
			validate: () => ({
				status: "warnings",
				issues: [
					{
						code: "fake_diagnostic",
						severity: "warning",
						message: "synthetic test issue",
						block: "fake-block",
						field: "fake.field",
					},
				],
			}),
		});
		registerLensValidator({
			name: "throwing-validator",
			validate: () => {
				throw new Error("synthetic crash");
			},
		});

		roadmapTmpRoot = makeRoadmapProject({ lenses: [], relations: [] });
		const result = validateProject(roadmapTmpRoot);

		// Fake validator's issue surfaces verbatim.
		const fake = result.issues.find((i) => i.code === "fake_diagnostic");
		assert.ok(fake, "expected fake_diagnostic issue from registered validator");
		assert.equal(fake.severity, "warning");
		assert.equal(fake.block, "fake-block");
		assert.equal(fake.field, "fake.field");
		assert.equal(fake.message, "synthetic test issue");

		// Thrown error wrapped as warning issue, not a hard fail.
		const thrown = result.issues.find((i) => i.code === "lens_validator_failed:throwing-validator");
		assert.ok(thrown, "expected wrapped failure issue from throwing validator");
		assert.equal(thrown.severity, "warning");
		assert.match(thrown.message, /synthetic crash/);
	});
});
