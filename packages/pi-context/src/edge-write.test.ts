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
import { appendRelation, appendRelations, type Edge, loadRelations } from "./context.js";
import { writeBootstrapPointer } from "./context-dir.js";
import { validateContext } from "./context-sdk.js";
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
			schema_version: "1.0.0",
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
