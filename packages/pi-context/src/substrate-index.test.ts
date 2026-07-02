/**
 * Cycle 7 / Phase F1 — SubstrateIndex split (behavior-preserving refactor).
 *
 * `buildIdIndex`/`buildIdIndexForDir` now return a {@link SubstrateIndex}
 * separating the lookup maps (`byRefname`, `byOid`) from the iteration surface
 * (`items`). These tests pin the structural invariants that make the split
 * inert:
 *
 *   - `byRefname.size === items.length` ONLY when there are no refname
 *     collisions (one item per refname); with a collision, `items` keeps every
 *     item but `byRefname` keeps the first writer, so `byRefname.size <
 *     items.length`. We assert both the no-collision equality and the
 *     collision asymmetry explicitly.
 *   - `byOid` holds ONLY items carrying a string `oid` (the stamped subset),
 *     first-writer-wins, and a stamped item appears EXACTLY ONCE in each of
 *     `items` / `byRefname` / `byOid` (the anti-double-count property F2 relies
 *     on — a future oid-keyed lookup map cannot inflate iteration over `items`).
 *   - iteration over `byRefname.values()` (the surface the 9 migrated walker
 *     sites use) visits each distinct refname exactly once; iteration over
 *     `items` visits each item exactly once.
 *   - first-writer-wins collision: two items sharing a refname → `byRefname`
 *     keeps the FIRST; `items` keeps BOTH (preserved exactly from the prior
 *     single-Map semantics, which deduped on `.set` guarded by `!has`).
 *
 * Plus a behavior-preserving golden: `validateContext` over a fixture is
 * deterministic across repeated builds (structure-level inertness — the
 * orchestrator holds the real-repo 56-issue golden and diffs separately).
 */

import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { loadConfig } from "./context.js";
import { writeBootstrapPointer } from "./context-dir.js";
import { buildIdIndex, buildIdIndexForDir, validateContext } from "./context-sdk.js";

function makeTmpDir(prefix: string): string {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), `subidx-${prefix}-`));
	writeBootstrapPointer(cwd, ".project");
	return cwd;
}

/**
 * Seed a substrate with NO block_kinds prefixes (so the prefix-vs-block
 * invariant never fires on ad-hoc ids) and a mix of stamped (carrying `oid`)
 * and unstamped items, optionally with a refname collision.
 */
function seed(
	cwd: string,
	opts: {
		tasks: Array<Record<string, unknown>>;
		decisions?: Array<Record<string, unknown>>;
		relations?: Array<Record<string, unknown>>;
		substrate_id?: string;
	},
): string {
	const projectDir = path.join(cwd, ".project");
	fs.mkdirSync(projectDir, { recursive: true });
	fs.writeFileSync(
		path.join(projectDir, "config.json"),
		JSON.stringify({
			schema_version: "1.7.0",
			root: ".project",
			block_kinds: [],
			relation_types: [],
			invariants: [],
			...(opts.substrate_id ? { substrate_id: opts.substrate_id } : {}),
		}),
	);
	fs.writeFileSync(path.join(projectDir, "tasks.json"), JSON.stringify({ tasks: opts.tasks }));
	if (opts.decisions) {
		fs.writeFileSync(path.join(projectDir, "decisions.json"), JSON.stringify({ decisions: opts.decisions }));
	}
	fs.writeFileSync(path.join(projectDir, "relations.json"), JSON.stringify(opts.relations ?? []));
	return projectDir;
}

describe("SubstrateIndex — structure invariants (no collision)", () => {
	it("byRefname.size === items.length and items has no duplicate refname", (t) => {
		const cwd = makeTmpDir("noclash");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		seed(cwd, {
			tasks: [
				{ id: "T1", status: "planned" },
				{ id: "T2", status: "completed", oid: "oid-T2" },
			],
			decisions: [{ id: "D1", status: "decided", oid: "oid-D1" }],
		});

		const index = buildIdIndex(cwd);
		assert.strictEqual(index.byRefname.size, 3, "one byRefname entry per distinct refname");
		assert.strictEqual(index.items.length, 3, "one items entry per item");
		assert.strictEqual(index.byRefname.size, index.items.length, "no collision → size == length");

		const seen = new Set<string>();
		for (const loc of index.items) {
			assert.ok(!seen.has(loc.id), `items must not duplicate refname ${loc.id}`);
			seen.add(loc.id);
		}
		assert.deepStrictEqual([...seen].sort(), ["D1", "T1", "T2"]);
	});

	it("byOid holds ONLY the stamped subset; a stamped item appears once in items, byRefname, and byOid", (t) => {
		const cwd = makeTmpDir("byoid");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		seed(cwd, {
			tasks: [
				{ id: "T1", status: "planned" }, // unstamped
				{ id: "T2", status: "completed", oid: "oid-T2" }, // stamped
				{ id: "T3", status: "planned", oid: "oid-T3" }, // stamped
			],
		});

		const index = buildIdIndex(cwd);
		// byOid is exactly the stamped subset.
		assert.strictEqual(index.byOid.size, 2, "only the two items with an oid are indexed by oid");
		assert.deepStrictEqual([...index.byOid.keys()].sort(), ["oid-T2", "oid-T3"]);
		assert.ok(!index.byOid.has("oid-T1"), "the unstamped item is absent from byOid");

		// Anti-double-count: the stamped item T2 appears ONCE in each surface.
		const inItems = index.items.filter((l) => l.id === "T2");
		assert.strictEqual(inItems.length, 1, "T2 appears once in items");
		assert.strictEqual(index.byRefname.get("T2")?.id, "T2", "T2 once in byRefname");
		assert.strictEqual(index.byOid.get("oid-T2")?.id, "T2", "T2 once in byOid (keyed by oid)");
		// The three surfaces reference the SAME locator object for T2.
		assert.strictEqual(inItems[0], index.byRefname.get("T2"), "items / byRefname share locator identity");
		assert.strictEqual(inItems[0], index.byOid.get("oid-T2"), "items / byOid share locator identity");
	});

	it("iteration over byRefname.values() visits each distinct refname exactly once", (t) => {
		const cwd = makeTmpDir("iter-once");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		seed(cwd, {
			tasks: [
				{ id: "T1", status: "planned" },
				{ id: "T2", status: "planned" },
			],
			decisions: [{ id: "D1", status: "decided" }],
		});

		const index = buildIdIndex(cwd);
		const counts = new Map<string, number>();
		for (const loc of index.byRefname.values()) {
			counts.set(loc.id, (counts.get(loc.id) ?? 0) + 1);
		}
		assert.deepStrictEqual([...counts.values()], [1, 1, 1], "each refname visited exactly once");
	});

	it("substrate_id reflects config.substrate_id when declared, undefined otherwise; dir is the scanned dir", (t) => {
		const cwd = makeTmpDir("subid");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		const projectDir = seed(cwd, { tasks: [{ id: "T1", status: "planned" }], substrate_id: "sub-00000000000000ab" });

		const index = buildIdIndex(cwd);
		assert.strictEqual(index.substrate_id, "sub-00000000000000ab");
		assert.strictEqual(index.dir, projectDir);

		// buildIdIndexForDir with a null config → substrate_id undefined, no throw.
		const direct = buildIdIndexForDir(projectDir, cwd, null);
		assert.strictEqual(direct.substrate_id, undefined, "absent config does not throw and yields undefined id");
		assert.strictEqual(direct.dir, projectDir);
	});
});

describe("SubstrateIndex — first-writer-wins collision (preserved from prior Map semantics)", () => {
	it("two items sharing a refname → byRefname keeps the first; items keeps both", (t) => {
		const cwd = makeTmpDir("clash");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		// Two FB-001 entries in the SAME block array (mirrors the real
		// .context-jit-spec-v2/friction-items.json collision). The prior single
		// Map deduped via `if (!index.has(id)) index.set(id, ...)` — first writer
		// wins. `items` carries BOTH because it is one-entry-per-item.
		seed(cwd, {
			tasks: [
				{ id: "FB-001", status: "planned", marker: "first" },
				{ id: "FB-001", status: "completed", marker: "second" },
				{ id: "T2", status: "planned" },
			],
		});

		const index = buildIdIndex(cwd);
		assert.strictEqual(index.byRefname.size, 2, "byRefname collapses the collision to one entry");
		assert.strictEqual(index.items.length, 3, "items keeps every item including the collision");
		assert.strictEqual(index.byRefname.get("FB-001")?.item.marker, "first", "first writer wins in byRefname");

		// items preserves both, in scan order.
		const fbItems = index.items.filter((l) => l.id === "FB-001");
		assert.strictEqual(fbItems.length, 2);
		assert.strictEqual(fbItems[0].item.marker, "first");
		assert.strictEqual(fbItems[1].item.marker, "second");

		// The walker surface (byRefname.values()) visits FB-001 once — exactly as
		// the prior Map iteration did, so validateContext output is unchanged.
		let fbVisits = 0;
		for (const loc of index.byRefname.values()) if (loc.id === "FB-001") fbVisits++;
		assert.strictEqual(fbVisits, 1, "byRefname iteration de-dups the collision (behavior-preserving)");
	});

	it("first-writer-wins on oid collision too (byOid keeps the first stamped item)", (t) => {
		const cwd = makeTmpDir("oidclash");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		seed(cwd, {
			tasks: [
				{ id: "T1", status: "planned", oid: "dup-oid", marker: "first" },
				{ id: "T2", status: "planned", oid: "dup-oid", marker: "second" },
			],
		});

		const index = buildIdIndex(cwd);
		assert.strictEqual(index.byOid.size, 1, "oid collision collapses to one byOid entry");
		assert.strictEqual(index.byOid.get("dup-oid")?.item.marker, "first", "first writer wins in byOid");
		// Both still present in byRefname (distinct refnames) and items.
		assert.strictEqual(index.byRefname.size, 2);
		assert.strictEqual(index.items.length, 2);
	});
});

describe("SubstrateIndex — validateContext inertness (deterministic across builds)", () => {
	it("validateContext over a fixture yields an identical issue list when run twice", (t) => {
		const cwd = makeTmpDir("golden");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		const projectDir = path.join(cwd, ".project");
		fs.mkdirSync(projectDir, { recursive: true });
		// A fixture exercising several validateContext surfaces: an unregistered
		// relation_type, a dangling edge endpoint, and a completed task that does
		// satisfy its verification edge. The exact issue set is not the contract
		// here (the orchestrator owns the real-repo golden); determinism is.
		fs.writeFileSync(
			path.join(projectDir, "config.json"),
			JSON.stringify({
				schema_version: "1.7.0",
				root: ".project",
				block_kinds: [],
				relation_types: [{ canonical_id: "relates_to", display_name: "relates to", category: "membership" }],
				invariants: [],
			}),
		);
		fs.writeFileSync(
			path.join(projectDir, "tasks.json"),
			JSON.stringify({
				tasks: [
					{ id: "t1", status: "completed" },
					{ id: "t2", status: "planned" },
				],
			}),
		);
		fs.writeFileSync(
			path.join(projectDir, "relations.json"),
			JSON.stringify([
				{ parent: "t1", child: "t2", relation_type: "relates_to" },
				{ parent: "t1", child: "ghost", relation_type: "relates_to" }, // dangling child
				{ parent: "t1", child: "t2", relation_type: "unregistered_rel" }, // unregistered
			]),
		);

		const first = validateContext(cwd);
		const second = validateContext(cwd);
		assert.deepStrictEqual(second, first, "validateContext is deterministic across repeated builds (inert)");
		// Sanity: the fixture actually produces issues (otherwise determinism is vacuous).
		assert.ok(first.issues.length > 0, "fixture must surface at least one issue");
	});

	it("loadConfig + buildIdIndex agree on the active substrate dir", (t) => {
		const cwd = makeTmpDir("agree");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		const projectDir = seed(cwd, { tasks: [{ id: "T1", status: "planned" }] });
		const index = buildIdIndex(cwd);
		// config is loadable; index.dir is the resolved .project dir.
		assert.ok(loadConfig(cwd) !== null);
		assert.strictEqual(index.dir, projectDir);
	});
});
