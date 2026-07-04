import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import type { ItemRecord } from "./context.js";
import { writeBootstrapPointer } from "./context-dir.js";
import { validateContext } from "./context-sdk.js";
import { clearLensValidators, getLensValidators, registerLensValidator } from "./lens-validator.js";
import {
	loadRoadmap,
	renderRoadmap,
	resolveStatusVocabulary,
	rollupPhaseStatus,
	type StatusBucket,
	topoSort,
	validateRoadmap,
} from "./roadmap-plan.js";

// ── Status vocabulary defaults (mapped via resolveStatusVocabulary against an
// empty config so the default registry surfaces verbatim). ─────────────────

describe("STATUS_VOCABULARY (default registry resolved with no config overrides)", () => {
	function vocabIn(): Record<string, StatusBucket> {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "roadmap-vocab-default-"));
		writeBootstrapPointer(dir, ".project");
		fs.mkdirSync(path.join(dir, ".project"), { recursive: true });
		fs.writeFileSync(
			path.join(dir, ".project", "config.json"),
			JSON.stringify({ schema_version: "1.8.0", root: ".project", lenses: [], block_kinds: [] }, null, 2),
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

// ── Derived roadmap loading + validation + rendering ────────────────────────

interface RoadmapFixture {
	relations?: Array<{ parent: string; child: string; relation_type: string }>;
	milestones?: Array<Record<string, unknown>>;
	phases?: Array<Record<string, unknown>>;
	tasks?: Array<Record<string, unknown>>;
	naming?: Record<string, string>;
	status_buckets?: Record<string, StatusBucket>;
	display_strings?: Record<string, string>;
	// Optional relation_types registry — supplied only when a test needs to declare
	// a non-default role_direction to exercise the config-driven roadmap orientation
	// (FGAP-113). Absent → no registry, so every roadmap relation falls back to its
	// stock orientation (milestone_precedes_milestone as_parent, the *_positioned_in_*
	// membership relations as_child) and output is byte-identical to the pre-metadata deriver.
	relation_types?: Array<Record<string, unknown>>;
}

function makeRoadmapProject(fixture: RoadmapFixture): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-context-roadmap-"));
	writeBootstrapPointer(dir, ".project");
	fs.mkdirSync(path.join(dir, ".project", "schemas"), { recursive: true });
	const config: Record<string, unknown> = {
		schema_version: "1.8.0",
		root: ".project",
		lenses: [],
		block_kinds: [],
		// Stock state_derivation (TASK-020): loadRoadmap's per-milestone status +
		// phaseCount read currentState().milestones — the config-declared rollup
		// over phase_positioned_in_milestone (reached/planned) — so the fixture
		// must declare the stock rollups entry.
		state_derivation: {
			in_flight: { kinds: ["tasks"], bucket: "in_progress" },
			focus_fallback: { kind: "phase", bucket: "in_progress" },
			next_ranked: [{ kind: "tasks", label: "task", bucket: "todo" }],
			blocked_by: { relation_types: ["task_depends_on_task"] },
			rollups: [
				{
					kind: "milestone",
					membership_relation: "phase_positioned_in_milestone",
					complete_status: "reached",
					incomplete_status: "planned",
				},
			],
			head_size: 15,
		},
	};
	if (fixture.relation_types) config.relation_types = fixture.relation_types;
	if (fixture.naming) config.naming = fixture.naming;
	if (fixture.status_buckets) config.status_buckets = fixture.status_buckets;
	if (fixture.display_strings) config.display_strings = fixture.display_strings;
	fs.writeFileSync(path.join(dir, ".project", "config.json"), JSON.stringify(config, null, 2));
	if (fixture.relations) {
		// relations.json schema is a bare Edge[] array at the top level (per
		// loadRelations docs in context.ts); the {edges: [...]} shape
		// is the lens-view fixture's prior shape and would AJV-fail here.
		fs.writeFileSync(path.join(dir, ".project", "relations.json"), JSON.stringify(fixture.relations, null, 2));
	}
	if (fixture.milestones) {
		fs.writeFileSync(
			path.join(dir, ".project", "milestone.json"),
			JSON.stringify({ milestones: fixture.milestones }, null, 2),
		);
	}
	if (fixture.phases) {
		fs.writeFileSync(path.join(dir, ".project", "phase.json"), JSON.stringify({ phases: fixture.phases }, null, 2));
	}
	if (fixture.tasks) {
		fs.writeFileSync(path.join(dir, ".project", "tasks.json"), JSON.stringify({ tasks: fixture.tasks }, null, 2));
	}
	return dir;
}

// Linear 3-milestone chain: 001 → 002 → 003, with phase/task membership on
// 001 (mixed statuses) and 002 (in-progress), and a completed phase on 003
// so its derived rollup is "reached" while 001/002 stay "planned".
function makeLinearChainProject(): string {
	return makeRoadmapProject({
		milestones: [
			{ id: "MILE-001", name: "Foundation", status: "planned" },
			{ id: "MILE-002", name: "Expansion", status: "planned" },
			{ id: "MILE-003", name: "Polish", status: "planned" },
		],
		phases: [
			{ id: "PHASE-A", name: "Groundwork", intent: "a", status: "planned" },
			{ id: "PHASE-B", name: "Build-out", intent: "b", status: "in-progress" },
			{ id: "PHASE-C", name: "Finishing", intent: "c", status: "completed" },
		],
		tasks: [
			{ id: "TASK-001", status: "completed" },
			{ id: "TASK-002", status: "todo" },
			{ id: "TASK-003", status: "in_progress" },
		],
		relations: [
			{ parent: "MILE-001", child: "MILE-002", relation_type: "milestone_precedes_milestone" },
			{ parent: "MILE-002", child: "MILE-003", relation_type: "milestone_precedes_milestone" },
			{ parent: "PHASE-A", child: "MILE-001", relation_type: "phase_positioned_in_milestone" },
			{ parent: "PHASE-B", child: "MILE-002", relation_type: "phase_positioned_in_milestone" },
			{ parent: "PHASE-C", child: "MILE-003", relation_type: "phase_positioned_in_milestone" },
			{ parent: "TASK-001", child: "PHASE-A", relation_type: "task_positioned_in_phase" },
			{ parent: "TASK-002", child: "PHASE-A", relation_type: "task_positioned_in_phase" },
			{ parent: "TASK-003", child: "PHASE-B", relation_type: "task_positioned_in_phase" },
		],
	});
}

// Live-shaped DAG: 9 milestones + the 8 authored edges verbatim (three starts
// 003/005/008 — 008 fully isolated — and two joins 007 ← 004+005, 009 ← 003+005).
const LIVE_DAG_MILESTONES = Array.from({ length: 9 }, (_, i) => ({
	id: `MILE-00${i + 1}`,
	name: `Milestone ${i + 1}`,
	status: "planned",
}));

const LIVE_DAG_EDGES = [
	{ parent: "MILE-003", child: "MILE-004", relation_type: "milestone_precedes_milestone" },
	{ parent: "MILE-004", child: "MILE-001", relation_type: "milestone_precedes_milestone" },
	{ parent: "MILE-001", child: "MILE-002", relation_type: "milestone_precedes_milestone" },
	{ parent: "MILE-003", child: "MILE-006", relation_type: "milestone_precedes_milestone" },
	{ parent: "MILE-004", child: "MILE-007", relation_type: "milestone_precedes_milestone" },
	{ parent: "MILE-005", child: "MILE-007", relation_type: "milestone_precedes_milestone" },
	{ parent: "MILE-003", child: "MILE-009", relation_type: "milestone_precedes_milestone" },
	{ parent: "MILE-005", child: "MILE-009", relation_type: "milestone_precedes_milestone" },
];

let roadmapTmpRoot: string;

describe("loadRoadmap", () => {
	afterEach(() => {
		if (roadmapTmpRoot) fs.rmSync(roadmapTmpRoot, { recursive: true, force: true });
	});

	it("returns error when no config exists", () => {
		roadmapTmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-context-roadmap-noconfig-"));
		writeBootstrapPointer(roadmapTmpRoot, ".project");
		fs.mkdirSync(path.join(roadmapTmpRoot, ".project"), { recursive: true });
		const result = loadRoadmap(roadmapTmpRoot);
		assert.ok("error" in result);
		assert.match(result.error, /No <substrate-dir>\/config\.json/);
	});

	it("returns a valid empty view (NOT an error) when no milestone-block items exist", () => {
		roadmapTmpRoot = makeRoadmapProject({ relations: [] });
		const result = loadRoadmap(roadmapTmpRoot);
		assert.ok(!("error" in result));
		assert.deepEqual(result, { milestones: [], order: [], cycles: [], edges: [] });
	});

	it("orientation is config-driven (FGAP-113): flipping role_direction reverses the precedes order and the membership side", () => {
		// Declare the roadmap relations with the OPPOSITE role_direction from their
		// stock fallbacks — precedes as_child (successor at parent) and membership
		// as_parent (container at parent) — proving the roadmap reads orientation
		// from config, not a hardcoded parent/child pick.
		roadmapTmpRoot = makeRoadmapProject({
			relation_types: [
				{
					canonical_id: "milestone_precedes_milestone",
					display_name: "precedes",
					category: "ordering",
					role_direction: "as_child",
				},
				{
					canonical_id: "phase_positioned_in_milestone",
					display_name: "positioned in",
					category: "membership",
					role_direction: "as_parent",
				},
			],
			milestones: [
				{ id: "MILE-001", name: "One", status: "planned" },
				{ id: "MILE-002", name: "Two", status: "planned" },
			],
			phases: [{ id: "PHASE-A", name: "A", intent: "a", status: "planned" }],
			relations: [
				{ parent: "MILE-001", child: "MILE-002", relation_type: "milestone_precedes_milestone" },
				{ parent: "PHASE-A", child: "MILE-001", relation_type: "phase_positioned_in_milestone" },
			],
		});
		const result = loadRoadmap(roadmapTmpRoot);
		assert.ok(!("error" in result));
		// as_child precedes: the CHILD (MILE-002) is the predecessor, so it topo-orders
		// FIRST — the reverse of the as_parent fallback (which would order 001, 002).
		assert.deepEqual(result.order, ["MILE-002", "MILE-001"]);
		// as_parent membership: the CONTAINER is edge.parent (PHASE-A, not a milestone),
		// so MILE-001 owns zero member phases — the reverse of the as_child fallback
		// (which would give MILE-001 the phase PHASE-A).
		const m1 = result.milestones.find((m) => m.id === "MILE-001");
		assert.ok(m1);
		assert.equal(m1.phaseCount, 0);
		assert.equal(m1.phases.length, 0);
	});

	it("loads a linear 3-milestone chain with per-milestone phase/task rollups and both reached states", () => {
		roadmapTmpRoot = makeLinearChainProject();
		const result = loadRoadmap(roadmapTmpRoot);
		assert.ok(!("error" in result));
		assert.deepEqual(result.order, ["MILE-001", "MILE-002", "MILE-003"]);
		assert.deepEqual(result.cycles, []);
		assert.equal(result.edges.length, 2);
		assert.equal(result.milestones.length, 3);

		const m1 = result.milestones.find((m) => m.id === "MILE-001");
		assert.ok(m1);
		assert.equal(m1.name, "Foundation");
		assert.equal(m1.status, "planned"); // PHASE-A is not complete
		assert.equal(m1.phaseCount, 1);
		assert.equal(m1.phases.length, 1);
		const phaseA = m1.phases[0];
		assert.ok(phaseA);
		assert.equal(phaseA.id, "PHASE-A");
		assert.equal(phaseA.name, "Groundwork");
		assert.equal(phaseA.tasks.length, 2);
		assert.deepEqual(
			phaseA.tasks.map((t) => t.id),
			["TASK-001", "TASK-002"],
		);
		// TASK-002 has no title field (tasks carry description, not title).
		assert.equal(phaseA.tasks[0]?.title, undefined);
		assert.equal(phaseA.rollup.bucket, "todo"); // complete=1 todo=1
		assert.equal(phaseA.rollup.counts.complete, 1);
		assert.equal(phaseA.rollup.counts.todo, 1);
		assert.equal(m1.rollup.total, 2); // milestone aggregates all member phases' tasks

		const m2 = result.milestones.find((m) => m.id === "MILE-002");
		assert.ok(m2);
		assert.equal(m2.phases[0]?.rollup.bucket, "in_progress");

		const m3 = result.milestones.find((m) => m.id === "MILE-003");
		assert.ok(m3);
		assert.equal(m3.status, "reached"); // its sole member phase PHASE-C is complete
		assert.equal(m3.phaseCount, 1);
		assert.equal(m3.rollup.total, 0); // PHASE-C has no tasks
	});

	it("orders the live-shaped DAG (9 milestones + the 8 authored edges) exactly", () => {
		roadmapTmpRoot = makeRoadmapProject({
			milestones: LIVE_DAG_MILESTONES,
			relations: LIVE_DAG_EDGES,
		});
		const result = loadRoadmap(roadmapTmpRoot);
		assert.ok(!("error" in result));
		assert.deepEqual(result.order, [
			"MILE-003",
			"MILE-005",
			"MILE-008",
			"MILE-004",
			"MILE-006",
			"MILE-009",
			"MILE-001",
			"MILE-007",
			"MILE-002",
		]);
		assert.deepEqual(result.cycles, []);
		assert.equal(result.edges.length, 8);
	});

	it("returns partial order + populated cycles when precedes edges cycle", () => {
		roadmapTmpRoot = makeRoadmapProject({
			milestones: [
				{ id: "MILE-001", name: "A", status: "planned" },
				{ id: "MILE-002", name: "B", status: "planned" },
				{ id: "MILE-003", name: "C", status: "planned" },
			],
			relations: [
				{ parent: "MILE-001", child: "MILE-002", relation_type: "milestone_precedes_milestone" },
				{ parent: "MILE-002", child: "MILE-001", relation_type: "milestone_precedes_milestone" },
			],
		});
		const result = loadRoadmap(roadmapTmpRoot);
		assert.ok(!("error" in result));
		assert.deepEqual(result.order, ["MILE-003"]);
		assert.ok(result.cycles.length > 0);
	});
});

describe("validateRoadmap", () => {
	afterEach(() => {
		if (roadmapTmpRoot) fs.rmSync(roadmapTmpRoot, { recursive: true, force: true });
	});

	it("returns clean for the linear-chain fixture", () => {
		roadmapTmpRoot = makeLinearChainProject();
		const result = validateRoadmap(roadmapTmpRoot);
		assert.equal(result.status, "clean");
		assert.deepEqual(result.issues, []);
	});

	it("emits roadmap_precedes_endpoint_missing for absent AND wrong-kind precedes endpoints", () => {
		roadmapTmpRoot = makeRoadmapProject({
			milestones: [{ id: "MILE-001", name: "A", status: "planned" }],
			phases: [{ id: "PHASE-A", name: "Not a milestone", intent: "a", status: "planned" }],
			relations: [
				{ parent: "MILE-999", child: "MILE-001", relation_type: "milestone_precedes_milestone" },
				{ parent: "PHASE-A", child: "MILE-001", relation_type: "milestone_precedes_milestone" },
			],
		});
		const result = validateRoadmap(roadmapTmpRoot);
		assert.equal(result.status, "invalid");
		assert.ok(
			result.issues.some((i) => i.code === "roadmap_precedes_endpoint_missing" && i.milestone_id === "MILE-999"),
			"absent endpoint flagged",
		);
		assert.ok(
			result.issues.some((i) => i.code === "roadmap_precedes_endpoint_missing" && i.milestone_id === "PHASE-A"),
			"wrong-kind endpoint flagged",
		);
	});

	it("emits roadmap_milestone_cycle when the precedes graph cycles", () => {
		roadmapTmpRoot = makeRoadmapProject({
			milestones: [
				{ id: "MILE-001", name: "A", status: "planned" },
				{ id: "MILE-002", name: "B", status: "planned" },
			],
			relations: [
				{ parent: "MILE-001", child: "MILE-002", relation_type: "milestone_precedes_milestone" },
				{ parent: "MILE-002", child: "MILE-001", relation_type: "milestone_precedes_milestone" },
			],
		});
		const result = validateRoadmap(roadmapTmpRoot);
		assert.equal(result.status, "invalid");
		const cycleIssue = result.issues.find((i) => i.code === "roadmap_milestone_cycle");
		assert.ok(cycleIssue);
		assert.ok(Array.isArray(cycleIssue.cycle) && cycleIssue.cycle.length > 0);
	});

	it("emits roadmap_milestone_missing for a phase_positioned_in_milestone edge whose child is unknown", () => {
		roadmapTmpRoot = makeRoadmapProject({
			milestones: [{ id: "MILE-001", name: "A", status: "planned" }],
			phases: [{ id: "PHASE-A", name: "A", intent: "a", status: "planned" }],
			relations: [{ parent: "PHASE-A", child: "MILE-404", relation_type: "phase_positioned_in_milestone" }],
		});
		const result = validateRoadmap(roadmapTmpRoot);
		assert.equal(result.status, "invalid");
		assert.ok(
			result.issues.some(
				(i) => i.code === "roadmap_milestone_missing" && i.milestone_id === "MILE-404" && i.phase_id === "PHASE-A",
			),
		);
	});

	it("emits roadmap_status_unknown_value (warning) when a phase's task rollup buckets unknown with items", () => {
		roadmapTmpRoot = makeRoadmapProject({
			milestones: [{ id: "MILE-001", name: "A", status: "planned" }],
			phases: [{ id: "PHASE-A", name: "A", intent: "a", status: "planned" }],
			tasks: [{ id: "TASK-001", status: "frobnicated" }],
			relations: [
				{ parent: "PHASE-A", child: "MILE-001", relation_type: "phase_positioned_in_milestone" },
				{ parent: "TASK-001", child: "PHASE-A", relation_type: "task_positioned_in_phase" },
			],
		});
		const result = validateRoadmap(roadmapTmpRoot);
		assert.equal(result.status, "warnings");
		assert.ok(
			result.issues.some(
				(i) => i.code === "roadmap_status_unknown_value" && i.milestone_id === "MILE-001" && i.phase_id === "PHASE-A",
			),
		);
	});

	it("emits roadmap_milestone_isolated (info) with status STAYING clean when it is the sole finding", () => {
		roadmapTmpRoot = makeRoadmapProject({
			milestones: [
				{ id: "MILE-001", name: "A", status: "planned" },
				{ id: "MILE-002", name: "B", status: "planned" },
				{ id: "MILE-003", name: "Isolated", status: "planned" },
			],
			relations: [{ parent: "MILE-001", child: "MILE-002", relation_type: "milestone_precedes_milestone" }],
		});
		const result = validateRoadmap(roadmapTmpRoot);
		assert.equal(result.status, "clean");
		assert.equal(result.issues.length, 1);
		assert.ok(result.issues.some((i) => i.code === "roadmap_milestone_isolated" && i.milestone_id === "MILE-003"));
	});
});

describe("renderRoadmap (markdown shape, NO mermaid)", () => {
	afterEach(() => {
		if (roadmapTmpRoot) fs.rmSync(roadmapTmpRoot, { recursive: true, force: true });
	});

	it("emits the canonical pure-textual markdown layout for the linear chain", () => {
		roadmapTmpRoot = makeLinearChainProject();
		const view = loadRoadmap(roadmapTmpRoot);
		assert.ok(!("error" in view));
		const md = renderRoadmap(view);

		assert.match(md, /^# Roadmap \(derived\)$/m);
		assert.match(md, /\*\*Milestones:\*\* 3 {2}\| {2}\*\*Ordered:\*\* 3 {2}\| {2}\*\*Cycles:\*\* 0/);
		assert.match(md, /^## Milestone order$/m);
		assert.match(md, /^1\. MILE-001 — Foundation \[planned\]$/m);
		assert.match(md, /^2\. MILE-002 — Expansion \[planned\]$/m);
		assert.match(md, /^3\. MILE-003 — Polish \[reached\]$/m);
		assert.match(md, /^## Milestones$/m);
		assert.match(md, /^### Foundation \(MILE-001\) \[planned\]$/m);
		assert.match(md, /\*\*Preceded by:\*\* —/);
		assert.match(md, /\(MILE-002\)[^\n]*\n[\s\S]*?\*\*Preceded by:\*\* MILE-001/);
		assert.match(md, /\*\*Rollup:\*\* complete=\d+ in_progress=\d+ blocked=\d+ todo=\d+ unknown=\d+ \(total=\d+\)/);
		assert.match(md, /^#### Groundwork \(PHASE-A\) \[planned\]$/m);
		assert.match(md, /\| Task \| Status \|/);
		assert.match(md, /\| TASK-001 \| completed \|/);

		// Negative regression assertion (against the prior fabrication defect).
		assert.doesNotMatch(md, /mermaid|graph LR|graph TD|-->/);
	});

	it("renders Preceded-by lines strictly from authored edges — the three DAG starts stay mutually unconnected", () => {
		roadmapTmpRoot = makeRoadmapProject({
			milestones: LIVE_DAG_MILESTONES,
			relations: LIVE_DAG_EDGES,
		});
		const view = loadRoadmap(roadmapTmpRoot);
		assert.ok(!("error" in view));
		const md = renderRoadmap(view);

		assert.match(md, /\(MILE-003\)[^\n]*\n[\s\S]*?\*\*Preceded by:\*\* —/);
		assert.match(md, /\(MILE-005\)[^\n]*\n[\s\S]*?\*\*Preceded by:\*\* —/);
		assert.match(md, /\(MILE-008\)[^\n]*\n[\s\S]*?\*\*Preceded by:\*\* —/);
		assert.match(md, /\(MILE-007\)[^\n]*\n[\s\S]*?\*\*Preceded by:\*\* MILE-004, MILE-005/);
		assert.match(md, /\(MILE-009\)[^\n]*\n[\s\S]*?\*\*Preceded by:\*\* MILE-003, MILE-005/);

		// CRITICAL: no fabricated adjacency between the mutually-unconnected starts.
		assert.doesNotMatch(md, /\*\*Preceded by:\*\*[^\n]*MILE-008/);
		assert.doesNotMatch(md, /MILE-003 → MILE-005/);
		assert.doesNotMatch(md, /MILE-005 → MILE-003/);

		// And the ambient mermaid/graph-syntax regression guard.
		assert.doesNotMatch(md, /mermaid|graph LR|graph TD|-->/);
	});

	it("surfaces cycle participants under a separate heading and Cycles detected line", () => {
		roadmapTmpRoot = makeRoadmapProject({
			milestones: [
				{ id: "MILE-001", name: "A", status: "planned" },
				{ id: "MILE-002", name: "B", status: "planned" },
			],
			relations: [
				{ parent: "MILE-001", child: "MILE-002", relation_type: "milestone_precedes_milestone" },
				{ parent: "MILE-002", child: "MILE-001", relation_type: "milestone_precedes_milestone" },
			],
		});
		const view = loadRoadmap(roadmapTmpRoot);
		assert.ok(!("error" in view));
		const md = renderRoadmap(view);

		assert.match(md, /\*\*Unordered \(cycle participants\):\*\*/);
		assert.match(md, /\*\*Cycles detected:\*\*/);

		// Negative regression assertion.
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
			milestones: [{ id: "MILE-001", name: "A", status: "planned" }],
			phases: [{ id: "PHASE-A", name: "A", intent: "a", status: "planned" }],
			relations: [{ parent: "PHASE-A", child: "MILE-404", relation_type: "phase_positioned_in_milestone" }],
		});
		const fallback = validateRoadmap(fallbackDir);
		const fallbackIssue = fallback.issues.find((i) => i.code === "roadmap_milestone_missing");
		assert.ok(fallbackIssue);
		assert.match(fallbackIssue.message, /references milestone 'MILE-404' that is not declared in the milestone block/);
		fs.rmSync(fallbackDir, { recursive: true, force: true });

		// Second fixture (distinct tmpdir bypasses the loadContext mtime cache):
		// display_strings override.
		roadmapTmpRoot = makeRoadmapProject({
			milestones: [{ id: "MILE-001", name: "A", status: "planned" }],
			phases: [{ id: "PHASE-A", name: "A", intent: "a", status: "planned" }],
			relations: [{ parent: "PHASE-A", child: "MILE-404", relation_type: "phase_positioned_in_milestone" }],
			display_strings: { roadmap_milestone_missing: "Custom localized message" },
		});
		const overridden = validateRoadmap(roadmapTmpRoot);
		const overriddenIssue = overridden.issues.find((i) => i.code === "roadmap_milestone_missing");
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

describe("validateContext (context-sdk) iterates registered lens-validators and merges issues", () => {
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

	it("merges fake lens-validator's issues into validateContext output; defensive try/catch wraps validator throws", () => {
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

		roadmapTmpRoot = makeRoadmapProject({ relations: [] });
		const result = validateContext(roadmapTmpRoot);

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

	it("roadmap validator contributes ONLY error-code issues (block 'milestone'); info is excluded from the merge", () => {
		snapshot = [...getLensValidators()];
		// Fixture combines an error (dangling membership edge) with an info-only
		// condition (MILE-003 isolated while MILE-001/002 are ordered).
		roadmapTmpRoot = makeRoadmapProject({
			milestones: [
				{ id: "MILE-001", name: "A", status: "planned" },
				{ id: "MILE-002", name: "B", status: "planned" },
				{ id: "MILE-003", name: "Isolated", status: "planned" },
			],
			phases: [{ id: "PHASE-A", name: "A", intent: "a", status: "planned" }],
			relations: [
				{ parent: "MILE-001", child: "MILE-002", relation_type: "milestone_precedes_milestone" },
				{ parent: "PHASE-A", child: "MILE-404", relation_type: "phase_positioned_in_milestone" },
			],
		});
		const result = validateContext(roadmapTmpRoot);

		const missing = result.issues.find((i) => i.code === "roadmap_milestone_missing");
		assert.ok(missing, "expected roadmap_milestone_missing from the roadmap lens-validator");
		assert.equal(missing.severity, "error");
		assert.equal(missing.block, "milestone");

		assert.ok(
			!result.issues.some((i) => i.code === "roadmap_milestone_isolated"),
			"info-code issues must not reach the lens-validator merge",
		);
	});
});
