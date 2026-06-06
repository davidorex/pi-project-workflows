/**
 * Tests for FGAP-007 ordering-edge direction enforcement (TASK-027).
 *
 * The blocked/ready deriver (currentState) consumes a `task_depends_on_task`
 * edge as `{parent = prerequisite, child = dependent}` — the parent must reach
 * "complete" before the child is unblocked. The `source_verb_target` relation
 * name reads the OPPOSITE (the verb implies the parent is the depender), so an
 * author following the name files a backwards edge that the deriver mis-reads.
 *
 * The fix: an ordering relation_type carries `endpoint_roles` naming which role
 * each AUTHORED endpoint holds. The append porcelain (appendRelationByRef /
 * appendRelationsByRef) AUTO-ORIENTS an authored edge to deriver-canonical
 * storage (prerequisite at parent) so the name reading and the stored direction
 * cannot diverge. These tests assert the write-path enforcement directly:
 *
 *  - a name-faithful ("backwards") edge is NORMALIZED to canonical storage,
 *  - an explicitly canonical edge is accepted unchanged,
 *  - the metadata-absent gate holds (no orientation when no endpoint_roles),
 *  - non-ordering / no-metadata relation_types are unaffected,
 *  - the deriver continues to treat {parent=prerequisite, child=dependent}
 *    correctly against the normalized storage.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { endpointKey, loadRelations, type RelationTypeDecl } from "./context.js";
import { writeBootstrapPointer } from "./context-dir.js";
import { appendRelationByRef, appendRelationsByRef, currentState } from "./context-sdk.js";

/** Ordering relation_type carrying name-faithful endpoint_roles (parent=depender). */
const INVERTED: RelationTypeDecl = {
	canonical_id: "task_depends_on_task",
	display_name: "depends on task",
	category: "ordering",
	source_kinds: ["tasks"],
	target_kinds: ["tasks"],
	endpoint_roles: { parent: "dependent", child: "prerequisite" },
};

/** Ordering relation_type WITHOUT endpoint_roles — the metadata-absent gate. */
const NO_ROLES: RelationTypeDecl = {
	canonical_id: "task_blocks_task",
	display_name: "blocks task",
	category: "ordering",
	source_kinds: ["tasks"],
	target_kinds: ["tasks"],
};

/** A relation_type already deriver-canonical (parent=prerequisite). */
const CANONICAL_ROLES: RelationTypeDecl = {
	canonical_id: "task_prereq_task",
	display_name: "is prerequisite of",
	category: "ordering",
	source_kinds: ["tasks"],
	target_kinds: ["tasks"],
	endpoint_roles: { parent: "prerequisite", child: "dependent" },
};

/** Non-ordering relation_type — never oriented. */
const DATA_FLOW: RelationTypeDecl = {
	canonical_id: "task_relates_to_task",
	display_name: "relates to",
	category: "data_flow",
	source_kinds: ["tasks"],
	target_kinds: ["tasks"],
};

/**
 * Bootstrap a substrate with a `.project` pointer, a config.json declaring the
 * given relation_types, and a tasks block + schema so refnames resolve and the
 * deriver can run. block_kinds is left empty so the fixtures' ad-hoc t1/t2 ids
 * are unconstrained by the prefix-vs-block invariant.
 */
function makeSubstrate(prefix: string, relationTypes: RelationTypeDecl[], tasks: Record<string, unknown>[]): string {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), `edge-orient-${prefix}-`));
	writeBootstrapPointer(cwd, ".project");
	const dir = path.join(cwd, ".project");
	fs.mkdirSync(path.join(dir, "schemas"), { recursive: true });
	fs.writeFileSync(
		path.join(dir, "config.json"),
		JSON.stringify({
			schema_version: "1.0.0",
			root: ".project",
			block_kinds: [],
			relation_types: relationTypes,
		}),
	);
	const taskSchema = {
		type: "object",
		properties: {
			tasks: {
				type: "array",
				items: {
					type: "object",
					required: ["id"],
					properties: {
						id: { type: "string" },
						description: { type: "string" },
						status: { type: "string" },
					},
				},
			},
		},
	};
	fs.writeFileSync(path.join(dir, "schemas", "tasks.schema.json"), JSON.stringify(taskSchema));
	fs.writeFileSync(path.join(dir, "tasks.json"), JSON.stringify({ tasks }));
	return cwd;
}

/** Read the single stored edge as bare-refname (parent,child) pair. */
function storedPair(cwd: string): { parent: string; child: string; relation_type: string } {
	const edges = loadRelations(cwd);
	assert.equal(edges.length, 1, "exactly one edge should be stored");
	const e = edges[0];
	return { parent: endpointKey(e.parent), child: endpointKey(e.child), relation_type: e.relation_type };
}

describe("FGAP-007 ordering-edge orientation (appendRelationByRef)", () => {
	it("NORMALIZES a name-faithful (backwards) edge to deriver-canonical storage", (t) => {
		// Author follows the name "TASK-005 depends on TASK-004": parent is the
		// depender (TASK-005), child is the prerequisite (TASK-004). endpoint_roles
		// declares parent=dependent, so the write path swaps to canonical storage.
		const cwd = makeSubstrate(
			"normalize",
			[INVERTED],
			[
				{ id: "TASK-004", status: "planned" },
				{ id: "TASK-005", status: "planned" },
			],
		);
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		const { edge, appended } = appendRelationByRef(cwd, {
			parent: "TASK-005",
			child: "TASK-004",
			relation_type: "task_depends_on_task",
		});
		assert.equal(appended, true);
		// Returned + stored edge is deriver-canonical: prerequisite (TASK-004) at parent.
		assert.equal(endpointKey(edge.parent), "TASK-004");
		assert.equal(endpointKey(edge.child), "TASK-005");
		assert.deepEqual(storedPair(cwd), {
			parent: "TASK-004",
			child: "TASK-005",
			relation_type: "task_depends_on_task",
		});
	});

	it("ACCEPTS an explicitly canonical edge unchanged (parent=prerequisite role)", (t) => {
		const cwd = makeSubstrate(
			"canonical",
			[CANONICAL_ROLES],
			[
				{ id: "TASK-004", status: "planned" },
				{ id: "TASK-005", status: "planned" },
			],
		);
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		// parent=prerequisite per the declared roles → no swap.
		appendRelationByRef(cwd, { parent: "TASK-004", child: "TASK-005", relation_type: "task_prereq_task" });
		assert.deepEqual(storedPair(cwd), {
			parent: "TASK-004",
			child: "TASK-005",
			relation_type: "task_prereq_task",
		});
	});

	it("metadata-absent gate: an ordering relation_type WITHOUT endpoint_roles is stored verbatim", (t) => {
		const cwd = makeSubstrate(
			"no-roles",
			[NO_ROLES],
			[
				{ id: "TASK-004", status: "planned" },
				{ id: "TASK-005", status: "planned" },
			],
		);
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		// No endpoint_roles → no orientation, the authored direction survives.
		appendRelationByRef(cwd, { parent: "TASK-005", child: "TASK-004", relation_type: "task_blocks_task" });
		assert.deepEqual(storedPair(cwd), {
			parent: "TASK-005",
			child: "TASK-004",
			relation_type: "task_blocks_task",
		});
	});

	it("non-ordering relation_type is unaffected (no false-positive reorientation)", (t) => {
		const cwd = makeSubstrate(
			"data-flow",
			[DATA_FLOW],
			[
				{ id: "TASK-004", status: "planned" },
				{ id: "TASK-005", status: "planned" },
			],
		);
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		appendRelationByRef(cwd, { parent: "TASK-005", child: "TASK-004", relation_type: "task_relates_to_task" });
		assert.deepEqual(storedPair(cwd), {
			parent: "TASK-005",
			child: "TASK-004",
			relation_type: "task_relates_to_task",
		});
	});

	it("unregistered relation_type is unaffected (best-effort config lookup → no roles)", (t) => {
		const cwd = makeSubstrate(
			"unregistered",
			[INVERTED],
			[
				{ id: "TASK-004", status: "planned" },
				{ id: "TASK-005", status: "planned" },
			],
		);
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		appendRelationByRef(cwd, { parent: "TASK-005", child: "TASK-004", relation_type: "not_registered_rel" });
		assert.deepEqual(storedPair(cwd), {
			parent: "TASK-005",
			child: "TASK-004",
			relation_type: "not_registered_rel",
		});
	});
});

describe("FGAP-007 ordering-edge orientation (appendRelationsByRef bulk)", () => {
	it("NORMALIZES each name-faithful edge in a bulk append", (t) => {
		const cwd = makeSubstrate(
			"bulk",
			[INVERTED],
			[
				{ id: "TASK-004", status: "planned" },
				{ id: "TASK-005", status: "planned" },
				{ id: "TASK-006", status: "planned" },
			],
		);
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		const r = appendRelationsByRef(cwd, [
			{ parent: "TASK-005", child: "TASK-004", relation_type: "task_depends_on_task" },
			{ parent: "TASK-006", child: "TASK-005", relation_type: "task_depends_on_task" },
		]);
		assert.equal(r.appended, 2);
		const edges = loadRelations(cwd).map((e) => ({ parent: endpointKey(e.parent), child: endpointKey(e.child) }));
		// Both stored prerequisite-at-parent.
		assert.deepEqual(edges, [
			{ parent: "TASK-004", child: "TASK-005" },
			{ parent: "TASK-005", child: "TASK-006" },
		]);
	});
});

describe("FGAP-007 deriver consumes the normalized storage correctly", () => {
	it("a name-faithful append yields the CORRECT blocked/ready derivation", (t) => {
		// TASK-004 incomplete (planned), TASK-005 planned. The author files the
		// dependency name-faithfully ("TASK-005 depends on TASK-004"). After
		// normalization the deriver must report TASK-005 as blocked-by TASK-004.
		const cwd = makeSubstrate(
			"derive-blocked",
			[INVERTED],
			[
				{ id: "TASK-004", description: "prereq", status: "planned" },
				{ id: "TASK-005", description: "dependent", status: "planned" },
			],
		);
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		appendRelationByRef(cwd, { parent: "TASK-005", child: "TASK-004", relation_type: "task_depends_on_task" });

		const state = currentState(cwd);
		const blockedT5 = state.blocked.find((b) => b.id === "TASK-005");
		assert.ok(blockedT5, "TASK-005 should be blocked by its incomplete prerequisite TASK-004");
		assert.deepEqual(blockedT5!.blockedBy, ["TASK-004"]);
		// TASK-004 (the prerequisite) is itself unblocked → a ready next action.
		assert.ok(
			state.nextActions.some((a) => a.id === "TASK-004"),
			"prerequisite TASK-004 should be a ready next action",
		);
		assert.ok(!state.blocked.some((b) => b.id === "TASK-004"), "prerequisite TASK-004 must not be reported as blocked");
	});

	it("when the prerequisite is complete, the dependent is no longer blocked", (t) => {
		const cwd = makeSubstrate(
			"derive-ready",
			[INVERTED],
			[
				{ id: "TASK-004", description: "prereq", status: "completed" },
				{ id: "TASK-005", description: "dependent", status: "planned" },
			],
		);
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		appendRelationByRef(cwd, { parent: "TASK-005", child: "TASK-004", relation_type: "task_depends_on_task" });

		const state = currentState(cwd);
		assert.ok(
			!state.blocked.some((b) => b.id === "TASK-005"),
			"TASK-005 must be unblocked once its prerequisite TASK-004 is complete",
		);
		assert.ok(
			state.nextActions.some((a) => a.id === "TASK-005"),
			"TASK-005 should be a ready next action",
		);
	});
});
