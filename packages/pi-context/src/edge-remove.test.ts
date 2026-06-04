/**
 * Tests for the edge removal / replace write surface (TASK-007, cli-arc β):
 * removeRelation / removeRelationForDir in context.ts (symmetric inverse of
 * appendRelation, matched on the SAME identityKey dedup identity), and the
 * porcelain removeRelationByRef / replaceRelationByRef in context-sdk.ts.
 *
 * Covers: remove-existing → {removed:true} + gone; remove-absent → {removed:false}
 * no-op; only the matching edge removed (same-parent-different-rel_type and
 * same-rel_type-different-child siblings both survive); ctx threading
 * byte-neutral; replaceRelationByRef atomicity (old gone + new present after one
 * call; unrelated siblings untouched).
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { appendRelation, type Edge, endpointKey, loadRelations, removeRelation } from "./context.js";
import { writeBootstrapPointer } from "./context-dir.js";
import { appendRelationByRef, removeRelationByRef, replaceRelationByRef } from "./context-sdk.js";

function makeTmpDir(prefix: string): string {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), `edge-rm-${prefix}-`));
	writeBootstrapPointer(cwd, ".project");
	fs.mkdirSync(path.join(cwd, ".project"), { recursive: true });
	return cwd;
}

function relationsFile(cwd: string): string {
	return path.join(cwd, ".project", "relations.json");
}

describe("removeRelation", () => {
	it("A: removes an existing edge → {removed:true}; loadRelations no longer shows it", (t) => {
		const cwd = makeTmpDir("a-existing");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		appendRelation(cwd, { parent: "p1", child: "c1", relation_type: "rel" });
		const r = removeRelation(cwd, { parent: "p1", child: "c1", relation_type: "rel" });
		assert.equal(r.removed, true);
		assert.equal(loadRelations(cwd).length, 0);
	});

	it("B: removing a non-existent edge is an idempotent no-op → {removed:false}", (t) => {
		const cwd = makeTmpDir("b-absent");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		appendRelation(cwd, { parent: "p1", child: "c1", relation_type: "rel" });
		const before = fs.readFileSync(relationsFile(cwd), "utf-8");
		const r = removeRelation(cwd, { parent: "nope", child: "nope", relation_type: "rel" });
		assert.equal(r.removed, false);
		// File untouched on a no-op (not rewritten).
		assert.equal(fs.readFileSync(relationsFile(cwd), "utf-8"), before);
		assert.equal(loadRelations(cwd).length, 1);
	});

	it("C: remove(append(x)) is symmetric — restores the prior set exactly", (t) => {
		const cwd = makeTmpDir("c-symmetric");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		const edge: Edge = { parent: "p1", child: "c1", relation_type: "rel" };
		appendRelation(cwd, edge);
		removeRelation(cwd, edge);
		assert.deepEqual(loadRelations(cwd), []);
	});

	it("D: dedup identity ignores ordinal — removal matches regardless of the match's ordinal", (t) => {
		const cwd = makeTmpDir("d-ordinal");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		appendRelation(cwd, { parent: "p1", child: "c1", relation_type: "rel", ordinal: 7 });
		// Match carries no ordinal — still matches the stored ordinal:7 edge.
		const r = removeRelation(cwd, { parent: "p1", child: "c1", relation_type: "rel" });
		assert.equal(r.removed, true);
		assert.equal(loadRelations(cwd).length, 0);
	});

	it("E: removes ONLY the matching edge — same-parent-different-rel_type AND same-rel_type-different-child survive", (t) => {
		const cwd = makeTmpDir("e-only-match");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		appendRelation(cwd, { parent: "p1", child: "c1", relation_type: "rel" }); // target
		appendRelation(cwd, { parent: "p1", child: "c1", relation_type: "other" }); // same p+c, diff rt
		appendRelation(cwd, { parent: "p1", child: "c2", relation_type: "rel" }); // same p+rt, diff child

		const r = removeRelation(cwd, { parent: "p1", child: "c1", relation_type: "rel" });
		assert.equal(r.removed, true);

		const stored = loadRelations(cwd);
		assert.equal(stored.length, 2);
		assert.ok(stored.some((e) => e.parent === "p1" && e.child === "c1" && e.relation_type === "other"));
		assert.ok(stored.some((e) => e.parent === "p1" && e.child === "c2" && e.relation_type === "rel"));
		assert.ok(!stored.some((e) => e.parent === "p1" && e.child === "c1" && e.relation_type === "rel"));
	});

	it("F: ctx threading succeeds; relations.json is byte-identical to the ctx-less remove", (t) => {
		const cwdWithCtx = makeTmpDir("f-ctx");
		const cwdNoCtx = makeTmpDir("f-noctx");
		t.after(() => fs.rmSync(cwdWithCtx, { recursive: true, force: true }));
		t.after(() => fs.rmSync(cwdNoCtx, { recursive: true, force: true }));

		for (const cwd of [cwdWithCtx, cwdNoCtx]) {
			appendRelation(cwd, { parent: "p1", child: "c1", relation_type: "rel" });
			appendRelation(cwd, { parent: "p2", child: "c2", relation_type: "rel" });
		}
		const rCtx = removeRelation(
			cwdWithCtx,
			{ parent: "p1", child: "c1", relation_type: "rel" },
			{
				writer: { kind: "agent", agent_id: "x" },
			},
		);
		const rNo = removeRelation(cwdNoCtx, { parent: "p1", child: "c1", relation_type: "rel" });
		assert.equal(rCtx.removed, true);
		assert.equal(rNo.removed, true);
		assert.equal(
			fs.readFileSync(relationsFile(cwdWithCtx), "utf-8"),
			fs.readFileSync(relationsFile(cwdNoCtx), "utf-8"),
		);
	});
});

describe("removeRelationByRef (porcelain)", () => {
	it("G: resolves string selectors then removes; returns {removed, edge}", (t) => {
		const cwd = makeTmpDir("g-byref");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		// Seed via the by-ref porcelain (STRUCTURED endpoints) so the stored edge
		// carries the SAME dedup identity removeRelationByRef resolves the selectors
		// to — mirroring every production write path (the string-endpoint library
		// appendRelation seeds a different identity than the by-ref path matches,
		// which never occurs on a real substrate).
		appendRelationByRef(cwd, { parent: "p1", child: "c1", relation_type: "rel" });
		const r = removeRelationByRef(cwd, { parent: "p1", child: "c1", relation_type: "rel" });
		assert.equal(r.removed, true);
		assert.equal(loadRelations(cwd).length, 0);
	});

	it("H: absent edge → {removed:false} no-op", (t) => {
		const cwd = makeTmpDir("h-byref-absent");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		const r = removeRelationByRef(cwd, { parent: "p1", child: "c1", relation_type: "rel" });
		assert.equal(r.removed, false);
		assert.equal(loadRelations(cwd).length, 0);
	});
});

describe("replaceRelationByRef (atomic)", () => {
	it("I: old gone + new present after one call; unrelated siblings untouched", (t) => {
		const cwd = makeTmpDir("i-replace");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		// Seed via the by-ref porcelain (STRUCTURED), matching how the edge is
		// resolved and matched in replaceRelationByRef below.
		appendRelationByRef(cwd, { parent: "p1", child: "c1", relation_type: "rel" }); // to replace
		appendRelationByRef(cwd, { parent: "p9", child: "c9", relation_type: "rel" }); // unrelated sibling

		const r = replaceRelationByRef(cwd, {
			old: { parent: "p1", child: "c1", relation_type: "rel" },
			new: { parent: "p2", child: "c2", relation_type: "rel", ordinal: 3 },
		});
		assert.equal(r.removed, true);
		assert.equal(r.replaced, true);

		// Endpoints are STRUCTURED objects on disk — compare via endpointKey.
		const stored = loadRelations(cwd);
		assert.equal(stored.length, 2);
		assert.ok(!stored.some((e) => endpointKey(e.parent) === "p1" && endpointKey(e.child) === "c1"));
		const added = stored.find((e) => endpointKey(e.parent) === "p2" && endpointKey(e.child) === "c2");
		assert.ok(added, "new edge present");
		assert.equal(added!.ordinal, 3);
		assert.ok(
			stored.some((e) => endpointKey(e.parent) === "p9" && endpointKey(e.child) === "c9"),
			"unrelated sibling untouched",
		);
	});

	it("J: absent old edge degrades to an append of the new edge", (t) => {
		const cwd = makeTmpDir("j-replace-absent-old");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		const r = replaceRelationByRef(cwd, {
			old: { parent: "px", child: "cx", relation_type: "rel" },
			new: { parent: "p2", child: "c2", relation_type: "rel" },
		});
		assert.equal(r.removed, false);
		assert.equal(r.replaced, true);
		const stored = loadRelations(cwd);
		assert.equal(stored.length, 1);
		assert.ok(stored.some((e) => endpointKey(e.parent) === "p2" && endpointKey(e.child) === "c2"));
	});

	it("K: new edge already present (collision) → removes old, writes no duplicate", (t) => {
		const cwd = makeTmpDir("k-replace-collide");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		appendRelationByRef(cwd, { parent: "p1", child: "c1", relation_type: "rel" }); // old
		appendRelationByRef(cwd, { parent: "p2", child: "c2", relation_type: "rel" }); // already == new

		const r = replaceRelationByRef(cwd, {
			old: { parent: "p1", child: "c1", relation_type: "rel" },
			new: { parent: "p2", child: "c2", relation_type: "rel" },
		});
		assert.equal(r.removed, true);
		assert.equal(r.replaced, false);
		const stored = loadRelations(cwd);
		assert.equal(stored.length, 1);
		assert.ok(stored.some((e) => endpointKey(e.parent) === "p2" && endpointKey(e.child) === "c2"));
	});
});
