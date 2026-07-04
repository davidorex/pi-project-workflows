/**
 * Tests for the edge-write surface (FGAP-075): appendRelation / appendRelations
 * in context.ts, layered on block-api's appendManyToTypedFileIfAbsent.
 *
 * Covers the write-surface guarantees in isolation (AJV-shape + exact-duplicate
 * no-op, dedup keyed on (parent,child,relation_type) ignoring ordinal, absent-
 * file creation, ctx structural-no-op parity, bulk dedup) AND the deferred-guard
 * contract: registration / endpoint / cycle violations are NOT caught at write
 * time but ARE surfaced by validateContext (the layer-graph forces this — the
 * write surface cannot reach buildIdIndex without inverting the dependency).
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { appendRelation, appendRelations, type Edge, endpointKey, loadRelations } from "./context.js";
import { writeBootstrapPointer } from "./context-dir.js";
import {
	appendRelationByRef,
	appendRelationsByRef,
	validateContext,
	validateEdgeAgainstRegistry,
} from "./context-sdk.js";
import { ValidationError } from "./schema-validator.js";

/** mkdtemp + bootstrap pointer at `.project` + ensure the substrate dir exists. */
function makeTmpDir(prefix: string): string {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), `edge-${prefix}-`));
	writeBootstrapPointer(cwd, ".project");
	fs.mkdirSync(path.join(cwd, ".project"), { recursive: true });
	return cwd;
}

function relationsFile(cwd: string): string {
	return path.join(cwd, ".project", "relations.json");
}

// ── A: valid single append ───────────────────────────────────────────────────

describe("appendRelation", () => {
	it("A: appends a valid edge and reports {appended:true}; loadRelations shows it", (t) => {
		const cwd = makeTmpDir("a-valid");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		const edge: Edge = { parent: "p1", child: "c1", relation_type: "rel" };
		const r = appendRelation(cwd, edge);
		assert.equal(r.appended, true);
		const stored = loadRelations(cwd);
		assert.equal(stored.length, 1);
		assert.deepEqual(stored[0], edge);
	});

	it("B: creates relations.json when absent; loadRelations = [edge]", (t) => {
		const cwd = makeTmpDir("b-absent");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		assert.equal(fs.existsSync(relationsFile(cwd)), false);
		const edge: Edge = { parent: "p1", child: "c1", relation_type: "rel" };
		const r = appendRelation(cwd, edge);
		assert.equal(r.appended, true);
		assert.equal(fs.existsSync(relationsFile(cwd)), true);
		assert.deepEqual(loadRelations(cwd), [edge]);
	});

	it("C: exact-duplicate triple is a no-op on the second append", (t) => {
		const cwd = makeTmpDir("c-dedup");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		const edge: Edge = { parent: "p1", child: "c1", relation_type: "rel" };
		assert.equal(appendRelation(cwd, edge).appended, true);
		assert.equal(appendRelation(cwd, edge).appended, false);
		assert.equal(loadRelations(cwd).length, 1);
	});

	it("D: dedup ignores ordinal; the originally-stored ordinal is preserved", (t) => {
		const cwd = makeTmpDir("d-ordinal-dedup");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		assert.equal(appendRelation(cwd, { parent: "p1", child: "c1", relation_type: "rel", ordinal: 1 }).appended, true);
		assert.equal(appendRelation(cwd, { parent: "p1", child: "c1", relation_type: "rel", ordinal: 5 }).appended, false);
		const stored = loadRelations(cwd);
		assert.equal(stored.length, 1);
		assert.equal(stored[0].ordinal, 1);
	});

	it("E: stores ordinal when given; omits the key when absent", (t) => {
		const cwd = makeTmpDir("e-ordinal-store");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		appendRelation(cwd, { parent: "p1", child: "c1", relation_type: "rel", ordinal: 3 });
		appendRelation(cwd, { parent: "p2", child: "c2", relation_type: "rel" });
		const stored = loadRelations(cwd);
		const withOrd = stored.find((e) => e.parent === "p1")!;
		const withoutOrd = stored.find((e) => e.parent === "p2")!;
		assert.equal(withOrd.ordinal, 3);
		assert.equal("ordinal" in withoutOrd, false);
	});

	it("F: ctx threading succeeds; relations.json is byte-identical to the ctx-less write", (t) => {
		const cwdWithCtx = makeTmpDir("f-ctx");
		const cwdNoCtx = makeTmpDir("f-noctx");
		t.after(() => fs.rmSync(cwdWithCtx, { recursive: true, force: true }));
		t.after(() => fs.rmSync(cwdNoCtx, { recursive: true, force: true }));

		const edge: Edge = { parent: "p1", child: "c1", relation_type: "rel" };
		const rCtx = appendRelation(cwdWithCtx, edge, { writer: { kind: "agent", agent_id: "x" } });
		const rNo = appendRelation(cwdNoCtx, edge);
		assert.equal(rCtx.appended, true);
		assert.equal(rNo.appended, true);
		const bytesCtx = fs.readFileSync(relationsFile(cwdWithCtx), "utf-8");
		const bytesNo = fs.readFileSync(relationsFile(cwdNoCtx), "utf-8");
		assert.equal(bytesCtx, bytesNo);
	});

	it("G: AJV rejects an edge missing relation_type; file is unchanged", (t) => {
		const cwd = makeTmpDir("g-shape");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		// Seed one valid edge so there is an on-disk file to prove "unchanged".
		appendRelation(cwd, { parent: "p1", child: "c1", relation_type: "rel" });
		const before = fs.readFileSync(relationsFile(cwd), "utf-8");

		const bad = { parent: "p2", child: "c2" } as unknown as Edge;
		assert.throws(() => appendRelation(cwd, bad), ValidationError);

		const after = fs.readFileSync(relationsFile(cwd), "utf-8");
		assert.equal(after, before);
		assert.equal(loadRelations(cwd).length, 1);
	});
});

describe("appendRelations (bulk)", () => {
	it("H: skips an existing-duplicate and an intra-batch duplicate; stores the unique set", (t) => {
		const cwd = makeTmpDir("h-bulk");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		// Pre-existing edge that one batch member duplicates.
		appendRelation(cwd, { parent: "p1", child: "c1", relation_type: "rel" });

		const batch: Edge[] = [
			{ parent: "p1", child: "c1", relation_type: "rel" }, // dup of existing → skipped
			{ parent: "p2", child: "c2", relation_type: "rel" }, // new → appended
			{ parent: "p2", child: "c2", relation_type: "rel" }, // intra-batch dup → skipped
		];
		const r = appendRelations(cwd, batch);
		assert.deepEqual(r, { appended: 1, skipped: 2 });

		const stored = loadRelations(cwd);
		assert.equal(stored.length, 2);
		assert.ok(stored.some((e) => e.parent === "p1" && e.child === "c1"));
		assert.ok(stored.some((e) => e.parent === "p2" && e.child === "c2"));
	});
});

// ── Deferred-guard proofs: write succeeds; validateContext is the catch ───────
//
// Fixture mirrors context-sdk.test.ts:306+ — config.json carries the
// relation_types registry; block_kinds is empty so the prefix-vs-block
// invariant does not constrain the ad-hoc ids; item blocks provide the
// endpoints buildIdIndex resolves; no config.invariants are declared so the
// only failures come from the edge-integrity surface under test.

const REL_TYPES = [{ canonical_id: "rel", display_name: "rel", category: "data_flow" as const }];

function writeConfig(cwd: string, relationTypes: unknown[] = REL_TYPES): void {
	fs.writeFileSync(
		path.join(cwd, ".project", "config.json"),
		JSON.stringify({
			schema_version: "1.8.0",
			root: ".project",
			block_kinds: [],
			relation_types: relationTypes,
			invariants: [],
		}),
	);
}

function writeItems(cwd: string, ids: string[]): void {
	fs.writeFileSync(path.join(cwd, ".project", "items.json"), JSON.stringify({ items: ids.map((id) => ({ id })) }));
}

describe("deferred guards (write succeeds; validateContext catches)", () => {
	it("I: unregistered relation_type — append succeeds, validateContext is invalid citing it", (t) => {
		const cwd = makeTmpDir("i-unregistered");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		writeConfig(cwd); // registers only "rel"
		writeItems(cwd, ["p1", "c1"]);

		// "unknown_rel" is NOT registered — the write surface does not check this.
		const r = appendRelation(cwd, { parent: "p1", child: "c1", relation_type: "unknown_rel" });
		assert.equal(r.appended, true);

		const result = validateContext(cwd);
		assert.equal(result.status, "invalid");
		const issue = result.issues.find((i) => i.message.includes("unknown_rel"));
		assert.ok(issue, "validateContext should flag the unregistered relation_type");
	});

	it("J: dangling endpoint — append succeeds, validateContext flags unresolved parent/child", (t) => {
		const cwd = makeTmpDir("j-dangling");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		writeConfig(cwd);
		writeItems(cwd, ["p1"]); // c-missing is absent

		const r = appendRelation(cwd, { parent: "p1", child: "c-missing", relation_type: "rel" });
		assert.equal(r.appended, true);

		const result = validateContext(cwd);
		assert.equal(result.status, "invalid");
		const issue = result.issues.find((i) => i.message.includes("c-missing"));
		assert.ok(issue, "validateContext should flag the unresolved child endpoint");
	});

	it("K: cycle — both edges append, validateContext reports edge_cycle_detected", (t) => {
		const cwd = makeTmpDir("k-cycle");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		writeConfig(cwd); // "rel" registered, cycle_allowed not set → cycle candidate
		writeItems(cwd, ["a", "b"]);

		assert.equal(appendRelation(cwd, { parent: "a", child: "b", relation_type: "rel" }).appended, true);
		assert.equal(appendRelation(cwd, { parent: "b", child: "a", relation_type: "rel" }).appended, true);

		const result = validateContext(cwd);
		assert.equal(result.status, "invalid");
		const issue = result.issues.find((i) => i.code === "edge_cycle_detected");
		assert.ok(issue, "validateContext should report edge_cycle_detected for a→b→a");
	});
});

// ── TASK-062: write-time edge-registry rejection (the ByRef porcelain) ────────
//
// The shared validateEdgeAgainstRegistry helper is invoked at write time by
// appendRelationByRef / appendRelationsByRef, so a kind-mismatched or
// unregistered edge THROWS before any persist (vs the deferred-guard proofs
// above, which exercise the RAW appendRelation surface that stays deferred).
// Endpoint blocks resolve from the data-file basename: writeItems writes
// items.json → block "items"; writeKinded writes <kind>.json → block "<kind>".

/** A relation_type carrying source_kinds/target_kinds (presence-gate ON). */
const KINDED_REL = [
	{
		canonical_id: "kinded_rel",
		display_name: "kinded rel",
		category: "data_flow" as const,
		source_kinds: ["tasks"],
		target_kinds: ["gaps"],
	},
];

/** A relation_type with NO endpoint metadata (presence-gate OFF → unchecked). */
const UNKINDED_REL = [{ canonical_id: "rel", display_name: "rel", category: "data_flow" as const }];

/** Write each id into its own <block>.json so buildIdIndex resolves loc.block. */
function writeKinded(cwd: string, byBlock: Record<string, string[]>): void {
	for (const [block, ids] of Object.entries(byBlock)) {
		fs.writeFileSync(
			path.join(cwd, ".project", `${block}.json`),
			JSON.stringify({ [block]: ids.map((id) => ({ id })) }),
		);
	}
}

describe("write-time edge-registry rejection (TASK-062)", () => {
	it("L: appendRelationByRef THROWS on a source-kind mismatch and persists nothing", (t) => {
		const cwd = makeTmpDir("l-bykind-source");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		writeConfig(cwd, KINDED_REL);
		// g1 lives in gaps (source kind 'gaps' ∉ source_kinds ["tasks"]) → reject.
		writeKinded(cwd, { tasks: ["t1"], gaps: ["g1"] });

		assert.throws(
			() => appendRelationByRef(cwd, { parent: "g1", child: "t1", relation_type: "kinded_rel" }),
			/source kind 'gaps' not in source_kinds/,
		);
		// Nothing written — relations.json absent (no prior valid edge seeded).
		assert.equal(fs.existsSync(relationsFile(cwd)), false);
	});

	it("M: appendRelationByRef THROWS on a target-kind mismatch and persists nothing", (t) => {
		const cwd = makeTmpDir("m-bykind-target");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		writeConfig(cwd, KINDED_REL);
		// child t1 lives in tasks (target kind 'tasks' ∉ target_kinds ["gaps"]) → reject.
		writeKinded(cwd, { tasks: ["t1", "t2"], gaps: ["g1"] });

		assert.throws(
			() => appendRelationByRef(cwd, { parent: "t1", child: "t2", relation_type: "kinded_rel" }),
			/target kind 'tasks' not in target_kinds/,
		);
		assert.equal(fs.existsSync(relationsFile(cwd)), false);
	});

	it("N: appendRelationByRef THROWS on an unregistered relation_type and persists nothing", (t) => {
		const cwd = makeTmpDir("n-byref-unregistered");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		writeConfig(cwd, UNKINDED_REL); // registers only "rel"
		writeItems(cwd, ["p1", "c1"]);

		assert.throws(
			() => appendRelationByRef(cwd, { parent: "p1", child: "c1", relation_type: "nope_rel" }),
			/relation_type 'nope_rel' is not registered/,
		);
		assert.equal(fs.existsSync(relationsFile(cwd)), false);
	});

	it("O: appendRelationByRef SUCCEEDS on a kind-correct edge; the edge is persisted", (t) => {
		const cwd = makeTmpDir("o-byref-ok");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		writeConfig(cwd, KINDED_REL);
		writeKinded(cwd, { tasks: ["t1"], gaps: ["g1"] });

		// parent in tasks, child in gaps → both kinds match.
		const r = appendRelationByRef(cwd, { parent: "t1", child: "g1", relation_type: "kinded_rel" });
		assert.equal(r.appended, true);
		const stored = loadRelations(cwd);
		assert.equal(stored.length, 1);
		assert.equal(stored[0].relation_type, "kinded_rel");
	});

	it("P: presence-gate — a relation_type with NO source_kinds/target_kinds is NOT rejected at write", (t) => {
		const cwd = makeTmpDir("p-byref-gate");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		writeConfig(cwd, UNKINDED_REL); // "rel" has no endpoint metadata → gate OFF
		writeItems(cwd, ["p1", "c1"]);

		// Same shape that the KINDED_REL would reject, but unchecked here.
		const r = appendRelationByRef(cwd, { parent: "p1", child: "c1", relation_type: "rel" });
		assert.equal(r.appended, true);
		assert.equal(loadRelations(cwd).length, 1);
	});

	it("Q: appendRelationsByRef is all-or-nothing — a bad edge throws, the whole batch persists nothing", (t) => {
		const cwd = makeTmpDir("q-bulk-byref");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		writeConfig(cwd, KINDED_REL);
		writeKinded(cwd, { tasks: ["t1"], gaps: ["g1"] });

		assert.throws(
			() =>
				appendRelationsByRef(cwd, [
					{ parent: "t1", child: "g1", relation_type: "kinded_rel" }, // valid
					{ parent: "g1", child: "t1", relation_type: "kinded_rel" }, // source-kind mismatch
				]),
			/source kind 'gaps' not in source_kinds/,
		);
		// The whole batch is rejected before any write — no file produced.
		assert.equal(fs.existsSync(relationsFile(cwd)), false);
	});

	it("R: dryRun also rejects — appendRelationByRef({dryRun}) on a bad edge throws, writes nothing", (t) => {
		const cwd = makeTmpDir("r-dryrun-reject");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		writeConfig(cwd, KINDED_REL);
		writeKinded(cwd, { tasks: ["t1"], gaps: ["g1"] });

		assert.throws(
			() =>
				appendRelationByRef(cwd, { parent: "g1", child: "t1", relation_type: "kinded_rel" }, undefined, {
					dryRun: true,
				}),
			/source kind 'gaps' not in source_kinds/,
		);
		assert.equal(fs.existsSync(relationsFile(cwd)), false);
	});
});

// ── TASK-062: write-time ↔ validate-time PARITY ──────────────────────────────
//
// The same edge reaches the same verdict at write time (appendRelationByRef)
// and at validate time (validateContext), because both route through the shared
// validateEdgeAgainstRegistry helper. We assert: an edge the write path REJECTS
// is exactly an edge validateContext flags; an edge the write path ACCEPTS
// validates clean (on the edge surface).

describe("write-time ↔ validate-time parity (TASK-062)", () => {
	it("S: a kind-mismatched edge is rejected at write AND flagged by validateContext (same wording)", (t) => {
		const cwd = makeTmpDir("s-parity-bad");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		writeConfig(cwd, KINDED_REL);
		writeKinded(cwd, { tasks: ["t1"], gaps: ["g1"] });

		// Write path: rejects.
		let writeError: Error | null = null;
		try {
			appendRelationByRef(cwd, { parent: "g1", child: "t1", relation_type: "kinded_rel" });
		} catch (e) {
			writeError = e as Error;
		}
		assert.ok(writeError, "write path should reject the kind-mismatched edge");

		// Validate path: the RAW append persists the same edge (deferred), and
		// validateContext flags it with the byte-identical kind-mismatch wording.
		appendRelation(cwd, { parent: "g1", child: "t1", relation_type: "kinded_rel" });
		const result = validateContext(cwd);
		assert.equal(result.status, "invalid");
		const vIssue = result.issues.find((i) => i.message.includes("source kind 'gaps' not in source_kinds"));
		assert.ok(vIssue, "validateContext should flag the same kind mismatch");
		// Parity of wording: validateContext's message is contained in the thrown one.
		assert.ok(
			writeError!.message.includes("source kind 'gaps' not in source_kinds"),
			"write-time throw should carry the same kind-mismatch wording as validateContext",
		);
	});

	it("T: a kind-correct edge is accepted at write AND validates clean on the edge surface", (t) => {
		const cwd = makeTmpDir("t-parity-good");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		writeConfig(cwd, KINDED_REL);
		writeKinded(cwd, { tasks: ["t1"], gaps: ["g1"] });

		const r = appendRelationByRef(cwd, { parent: "t1", child: "g1", relation_type: "kinded_rel" });
		assert.equal(r.appended, true);

		const result = validateContext(cwd);
		assert.ok(
			!result.issues.some(
				(i) => i.message.includes("not in source_kinds") || i.message.includes("not in target_kinds"),
			),
			"no kind-mismatch issue should fire for the accepted edge",
		);
	});

	it("U: helper-level parity — validateEdgeAgainstRegistry returns [] iff the write path accepts", (t) => {
		const cwd = makeTmpDir("u-helper-parity");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		writeConfig(cwd, KINDED_REL);
		writeKinded(cwd, { tasks: ["t1"], gaps: ["g1"] });

		// A trivial resolver suffices: loc.block from the file basename is what the
		// real resolveRef returns; here we hand-map the two ids to their blocks to
		// exercise the helper's gate + membership logic directly.
		const resolve = (ref: unknown) => {
			const key = ref as string;
			const block = key === "t1" ? "tasks" : "gaps";
			return { status: "active", endpointKind: "item", loc: { id: key, block, item: {} } } as never;
		};
		const goodEdge: Edge = { parent: "t1", child: "g1", relation_type: "kinded_rel" };
		const badEdge: Edge = { parent: "g1", child: "t1", relation_type: "kinded_rel" };
		assert.deepEqual(validateEdgeAgainstRegistry(goodEdge, KINDED_REL_CONFIG(), resolve), []);
		// g1->t1 mismatches BOTH endpoints: g1(gaps) ∉ source_kinds[tasks] AND
		// t1(tasks) ∉ target_kinds[gaps] → two messages.
		const badErrs = validateEdgeAgainstRegistry(badEdge, KINDED_REL_CONFIG(), resolve);
		assert.equal(badErrs.length, 2);
		assert.ok(badErrs.some((m) => m.includes("source kind 'gaps' not in source_kinds")));
		assert.ok(badErrs.some((m) => m.includes("target kind 'tasks' not in target_kinds")));
	});
});

// ── FGAP-113: role-typed authoring + ambiguous-bare-append reject ─────────────
//
// A role-bearing relation (one declaring role_direction) that is
// orientation-ambiguous (its source_kinds ∩ target_kinds ≠ ∅, incl. "*") cannot
// be reliably oriented from a bare {parent,child} append, so the porcelain
// REJECTS the bare form and directs the author to --primary/--counter, mapping the
// role to parent/child via role_direction. A disjoint-kind role-bearing relation
// is self-orienting (the source/target-kind gate covers it) so its bare append
// stays allowed.

/** Same-kind (tasks↔tasks) role-bearing relation: ambiguous, role_direction as_parent. */
const AMBIG_ROLE_REL = [
	{
		canonical_id: "task_before_task",
		display_name: "before",
		category: "ordering" as const,
		source_kinds: ["tasks"],
		target_kinds: ["tasks"],
		role_direction: "as_parent" as const,
	},
];

/** Disjoint-kind (phase→milestone) role-bearing relation: self-orienting, as_child. */
const DISJOINT_ROLE_REL = [
	{
		canonical_id: "phase_in_milestone",
		display_name: "positioned in",
		category: "membership" as const,
		source_kinds: ["phase"],
		target_kinds: ["milestone"],
		role_direction: "as_child" as const,
	},
];

describe("role-typed authoring + ambiguous-bare-append reject (FGAP-113)", () => {
	it("role-typed --primary/--counter maps to parent/child via role_direction (as_parent → primary=parent)", (t) => {
		const cwd = makeTmpDir("role-typed-map");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		writeConfig(cwd, AMBIG_ROLE_REL);
		writeKinded(cwd, { tasks: ["t1", "t2"] });

		const r = appendRelationByRef(cwd, { primary: "t1", counter: "t2", relation_type: "task_before_task" });
		assert.equal(r.appended, true);
		const stored = loadRelations(cwd);
		assert.equal(stored.length, 1);
		// as_parent → primary at edge.parent, counter at edge.child.
		assert.equal(endpointKey(stored[0].parent), "t1");
		assert.equal(endpointKey(stored[0].child), "t2");
	});

	it("a bare --parent/--child append of a same-kind role-bearing relation is REJECTED, directing to --primary/--counter", (t) => {
		const cwd = makeTmpDir("role-bare-reject");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		writeConfig(cwd, AMBIG_ROLE_REL);
		writeKinded(cwd, { tasks: ["t1", "t2"] });

		assert.throws(
			() => appendRelationByRef(cwd, { parent: "t1", child: "t2", relation_type: "task_before_task" }),
			/orientation-ambiguous[\s\S]*--primary\/--counter/,
		);
		// Nothing written — relations.json absent (no prior edge seeded).
		assert.equal(fs.existsSync(relationsFile(cwd)), false);
	});

	it("a bare append of a DISJOINT-kind role-bearing relation still SUCCEEDS (the kind gate covers it)", (t) => {
		const cwd = makeTmpDir("role-disjoint-ok");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		writeConfig(cwd, DISJOINT_ROLE_REL);
		writeKinded(cwd, { phase: ["PHASE-1"], milestone: ["MILE-1"] });

		// phase→milestone matches source/target kinds; disjoint kinds self-orient.
		const r = appendRelationByRef(cwd, { parent: "PHASE-1", child: "MILE-1", relation_type: "phase_in_milestone" });
		assert.equal(r.appended, true);
		const stored = loadRelations(cwd);
		assert.equal(stored.length, 1);
		assert.equal(endpointKey(stored[0].parent), "PHASE-1");
		assert.equal(endpointKey(stored[0].child), "MILE-1");
	});

	it("the role-typed form on a relation with NO role_direction throws (no role to map)", (t) => {
		const cwd = makeTmpDir("role-none-throws");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		writeConfig(cwd, UNKINDED_REL); // "rel" has no role_direction
		writeItems(cwd, ["p1", "c1"]);

		assert.throws(
			() => appendRelationByRef(cwd, { primary: "p1", counter: "c1", relation_type: "rel" }),
			/declares no role_direction/,
		);
		assert.equal(fs.existsSync(relationsFile(cwd)), false);
	});

	it("supplying BOTH a raw and a role-typed pair is rejected as mutually exclusive", (t) => {
		const cwd = makeTmpDir("role-both-throws");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		writeConfig(cwd, AMBIG_ROLE_REL);
		writeKinded(cwd, { tasks: ["t1", "t2"] });

		assert.throws(
			() =>
				appendRelationByRef(cwd, {
					parent: "t1",
					child: "t2",
					primary: "t1",
					counter: "t2",
					relation_type: "task_before_task",
				}),
			/mutually exclusive/,
		);
		assert.equal(fs.existsSync(relationsFile(cwd)), false);
	});

	it("bulk appendRelationsByRef rejects a bare same-kind role-bearing edge before any write (all-or-nothing)", (t) => {
		const cwd = makeTmpDir("role-bulk-reject");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		writeConfig(cwd, AMBIG_ROLE_REL);
		writeKinded(cwd, { tasks: ["t1", "t2", "t3"] });

		assert.throws(
			() =>
				appendRelationsByRef(cwd, [
					{ primary: "t1", counter: "t2", relation_type: "task_before_task" },
					{ parent: "t2", child: "t3", relation_type: "task_before_task" }, // bare ambiguous → rejects the batch
				]),
			/orientation-ambiguous/,
		);
		assert.equal(fs.existsSync(relationsFile(cwd)), false);
	});
});

/** Minimal ConfigBlock-shaped object carrying the kinded relation_type. */
function KINDED_REL_CONFIG(): never {
	return {
		schema_version: "1.8.0",
		root: ".project",
		block_kinds: [],
		relation_types: KINDED_REL,
		invariants: [],
	} as never;
}

// ── TASK-062 regression: issues[] is class-grouped (registration before kind) ──
//
// context-validate prints issues[], so the emission ORDER of the edge-registry
// diagnostics is a UX surface. The pre-refactor validateContext ran two passes —
// all relation_type-registration issues across every edge, THEN all
// source/target-kind issues across every edge. The 92dde2d refactor to the
// shared validateEdgeAgainstRegistry helper briefly emitted them interleaved
// per-edge (A-reg, A-kind, B-reg, B-kind). This pins the restored class-grouped
// order so the two passes cannot re-interleave.
describe("validateContext issue ordering (TASK-062 regression)", () => {
	it("V: every registration-class issue precedes every kind-class issue in issues[]", (t) => {
		const cwd = makeTmpDir("v-issue-order");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		// config registers ONLY "kinded_rel" (source_kinds ["tasks"], target_kinds
		// ["gaps"]); "bad_rel_1"/"bad_rel_2" are unregistered → registration-class.
		writeConfig(cwd, KINDED_REL);
		// endpoints resolve from their file basename: tasks.json → "tasks", etc.
		writeKinded(cwd, { tasks: ["t1", "t2"], gaps: ["g1", "g2"] });

		// RAW appendRelation persists each edge WITHOUT the write-time registry
		// gate (the deferred surface), so all four reach validateContext. The
		// append order INTERLEAVES the two classes (kind, registration, kind,
		// registration) — under the pre-fix per-edge loop issues[] would interleave;
		// the class-grouped pass must re-collate them.
		// kind-class edge #1: g1(gaps)->t1(tasks) mismatches BOTH source+target kinds.
		appendRelation(cwd, { parent: "g1", child: "t1", relation_type: "kinded_rel" });
		// registration-class edge #1: "bad_rel_1" is not registered.
		appendRelation(cwd, { parent: "t1", child: "g1", relation_type: "bad_rel_1" });
		// kind-class edge #2: g2(gaps)->t2(tasks) mismatches BOTH source+target kinds.
		appendRelation(cwd, { parent: "g2", child: "t2", relation_type: "kinded_rel" });
		// registration-class edge #2: "bad_rel_2" is not registered.
		appendRelation(cwd, { parent: "t2", child: "g2", relation_type: "bad_rel_2" });

		const result = validateContext(cwd);
		assert.equal(result.status, "invalid");

		// Project to the edge-registry diagnostics only (registration + kind), in
		// emission order. block "relations" + no code distinguishes them from the
		// endpoint-resolution / cycle issues (which carry a `code`).
		const isRegistration = (m: string) => /is not registered/.test(m);
		const isKind = (m: string) => /source kind|target kind/.test(m);
		const ordered = result.issues
			.filter((i) => i.block === "relations" && !i.code && (isRegistration(i.message) || isKind(i.message)))
			.map((i) => i.message);

		// Sanity: the set is ≥2 registration-class and ≥2 kind-class issues.
		const regCount = ordered.filter(isRegistration).length;
		const kindCount = ordered.filter(isKind).length;
		assert.ok(regCount >= 2, `expected ≥2 registration-class issues, got ${regCount}`);
		assert.ok(kindCount >= 2, `expected ≥2 kind-class issues, got ${kindCount}`);

		// The ordering invariant: the LAST registration-class issue must appear
		// before the FIRST kind-class issue.
		const lastReg = ordered.reduce((acc, m, i) => (isRegistration(m) ? i : acc), -1);
		const firstKind = ordered.findIndex(isKind);
		assert.ok(lastReg < firstKind, `registration-class must precede kind-class; ordered=${JSON.stringify(ordered)}`);
	});
});
