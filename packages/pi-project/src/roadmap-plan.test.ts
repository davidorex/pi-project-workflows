import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ItemRecord } from "./project-context.js";
import { rollupPhaseStatus, STATUS_VOCABULARY, type StatusBucket, topoSort } from "./roadmap-plan.js";

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
