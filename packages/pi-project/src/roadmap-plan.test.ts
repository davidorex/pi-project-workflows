import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import type { ItemRecord } from "./project-context.js";
import {
	listRoadmaps,
	loadRoadmap,
	renderRoadmap,
	rollupPhaseStatus,
	STATUS_VOCABULARY,
	type StatusBucket,
	topoSort,
	validateRoadmaps,
} from "./roadmap-plan.js";

describe("STATUS_VOCABULARY", () => {
	it("maps known issue statuses correctly", () => {
		assert.equal(STATUS_VOCABULARY.open, "todo");
		assert.equal(STATUS_VOCABULARY.resolved, "complete");
		assert.equal(STATUS_VOCABULARY.deferred, "unknown");
	});

	it("maps known decision statuses correctly", () => {
		assert.equal(STATUS_VOCABULARY.open, "todo");
		assert.equal(STATUS_VOCABULARY.enacted, "complete");
		assert.equal(STATUS_VOCABULARY.superseded, "unknown");
	});

	it("maps known task statuses correctly", () => {
		assert.equal(STATUS_VOCABULARY.todo, "todo");
		assert.equal(STATUS_VOCABULARY.in_progress, "in_progress");
		assert.equal(STATUS_VOCABULARY.completed, "complete");
		assert.equal(STATUS_VOCABULARY.cancelled, "unknown");
	});

	it("handles hyphenated status variants", () => {
		assert.equal(STATUS_VOCABULARY["in-progress"], "in_progress");
		assert.equal(STATUS_VOCABULARY["not-started"], "todo");
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
		// A and B should be in order; C and D are in cycle, omitted from order
		assert.deepEqual(result.order, ["A", "B"]);
		assert.equal(result.cycles.length, 1);
	});

	it("ignores deps pointing at nodes outside the input set", () => {
		const result = topoSort<Node>([{ id: "A", deps: ["NONEXISTENT"] }], idOf, depsOf);
		// External dep doesn't block A; it's just dropped
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
		// B and C are independent at stratum 2; both should appear
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

// ── Roadmap loading + validation + rendering (issue-084) ──────────────────

interface RoadmapFixture {
	lenses?: Array<Record<string, unknown>>;
	relations?: Array<{ parent: string; child: string; relation_type: string }>;
	roadmaps?: Array<Record<string, unknown>>;
	issues?: Array<Record<string, unknown>>;
	features?: Array<Record<string, unknown>>;
	verifications?: Array<Record<string, unknown>>;
	naming?: Record<string, string>;
}

function makeRoadmapProject(fixture: RoadmapFixture): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-project-roadmap-"));
	fs.mkdirSync(path.join(dir, ".project", "schemas"), { recursive: true });
	const config = {
		schema_version: "0.2.0",
		root: ".project",
		lenses: fixture.lenses ?? [],
		installed_blocks: ["roadmap"],
		...(fixture.naming ? { naming: fixture.naming } : {}),
	};
	fs.writeFileSync(path.join(dir, ".project", "config.json"), JSON.stringify(config, null, 2));
	if (fixture.relations) {
		fs.writeFileSync(
			path.join(dir, ".project", "relations.json"),
			JSON.stringify({ edges: fixture.relations }, null, 2),
		);
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
		roadmapTmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-project-roadmap-noconfig-"));
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
		// B and C in either order at positions 1 and 2.
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

		// Per-phase adjacency lines sourced from view.edges, alphabetical sort.
		// PHASE-A: no incoming, "—".
		assert.match(md, /\(PHASE-A\)[^\n]*\n[\s\S]*?\*\*Depends on:\*\* —/);
		// PHASE-B: incoming PHASE-A.
		assert.match(md, /\(PHASE-B\)[^\n]*\n[\s\S]*?\*\*Depends on:\*\* PHASE-A/);
		// PHASE-C: incoming PHASE-A.
		assert.match(md, /\(PHASE-C\)[^\n]*\n[\s\S]*?\*\*Depends on:\*\* PHASE-A/);
		// PHASE-D: incoming PHASE-B, PHASE-C (alphabetical).
		assert.match(md, /\(PHASE-D\)[^\n]*\n[\s\S]*?\*\*Depends on:\*\* PHASE-B, PHASE-C/);

		// CRITICAL: render output must NOT contain any sibling B↔C edge text
		// (the fabrication defect from the prior implementation that derived
		// rendered edges from phaseOrder consecutive pairs).
		assert.doesNotMatch(md, /B → C/);
		assert.doesNotMatch(md, /C → B/);
		assert.doesNotMatch(md, /PHASE-B → PHASE-C/);
		assert.doesNotMatch(md, /PHASE-C → PHASE-B/);

		// And the ambient mermaid/graph-syntax regression guard.
		assert.doesNotMatch(md, /mermaid|graph LR|graph TD|-->/);
	});
});
