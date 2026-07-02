/**
 * Cycle 8 / Phase F2 — resolveRef + the validator severity split + cross-
 * substrate resolution.
 *
 * `resolveRef(cwd, ref, opts?)` classifies any edge endpoint (legacy string OR
 * structured) into `active | foreign | dangling | unregistered`. These tests pin
 * the four statuses on SYNTHETIC fixtures (per the plan §Verification.3), the
 * legacy `<alias>:<refname>` string parse (the load-bearing reclassification of
 * the real 30 `project:` strings), graceful foreign-build failure → dangling, and
 * the per-pass foreign-index cache (build once for N same-substrate edges).
 *
 * A Phase-H-PREVIEW case proves the mechanism that will clear the 30 at Cycle 10:
 * register a `project`-aliased foreign substrate + an edge child `project:FGAP-X`
 * (string) with FGAP-X present there → resolveRef foreign CLEAN → validateContext
 * no error for it (WITHOUT doing the migration here).
 *
 * Plus a `validateRelations` parity assertion: no `resolve` param → identical to
 * today's inline `idIndex` path; with `resolve` supplied → a cross-substrate
 * lens/hierarchy child resolves foreign.
 */

import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import type { ConfigBlock, Edge, RawEndpoint } from "./context.js";
import { validateRelations } from "./context.js";
import { writeBootstrapPointer } from "./context-dir.js";
import { registerSubstrate } from "./context-registry.js";
import { buildIdIndex, buildIdIndexForDir, resolveRef, validateContext } from "./context-sdk.js";

function makeProject(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), "resolveref-"));
}

/** Write a substrate directory (config + tasks + relations) under `<cwd>/<dirName>`. */
function writeSubstrate(
	cwd: string,
	dirName: string,
	opts: {
		substrate_id?: string;
		tasks?: Array<Record<string, unknown>>;
		relations?: unknown[];
		relation_types?: Array<Record<string, unknown>>;
		lenses?: unknown[];
		hierarchy?: unknown[];
	},
): string {
	const dir = path.join(cwd, dirName);
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(
		path.join(dir, "config.json"),
		JSON.stringify({
			schema_version: "1.7.0",
			root: dirName,
			block_kinds: [],
			relation_types: opts.relation_types ?? [],
			invariants: [],
			...(opts.lenses ? { lenses: opts.lenses } : {}),
			...(opts.hierarchy ? { hierarchy: opts.hierarchy } : {}),
			...(opts.substrate_id ? { substrate_id: opts.substrate_id } : {}),
		}),
	);
	fs.writeFileSync(path.join(dir, "tasks.json"), JSON.stringify({ tasks: opts.tasks ?? [] }));
	fs.writeFileSync(path.join(dir, "relations.json"), JSON.stringify(opts.relations ?? []));
	return dir;
}

describe("resolveRef — the four statuses (synthetic)", () => {
	it("lens_bin endpoint → active / endpointKind lens_bin, NO item lookup", (t) => {
		const cwd = makeProject();
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		writeBootstrapPointer(cwd, ".project");
		writeSubstrate(cwd, ".project", { tasks: [{ id: "T1" }] });

		const r = resolveRef(cwd, { kind: "lens_bin", bin: "backlog" });
		assert.strictEqual(r.status, "active");
		assert.strictEqual(r.endpointKind, "lens_bin");
		assert.strictEqual(r.loc, undefined, "lens_bin carries no item locator");
	});

	it("bare active refname present → active; absent → dangling", (t) => {
		const cwd = makeProject();
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		writeBootstrapPointer(cwd, ".project");
		writeSubstrate(cwd, ".project", { tasks: [{ id: "T1" }, { id: "T2" }] });

		const present = resolveRef(cwd, "T1");
		assert.strictEqual(present.status, "active");
		assert.strictEqual(present.endpointKind, "item");
		assert.strictEqual(present.loc?.id, "T1");

		const absent = resolveRef(cwd, "GHOST");
		assert.strictEqual(absent.status, "dangling");
		assert.strictEqual(absent.endpointKind, "item");
		assert.strictEqual(absent.loc, undefined);
	});

	it("structured foreign {substrate_id} registered+populated → foreign (by oid AND by refname)", (t) => {
		const cwd = makeProject();
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		writeBootstrapPointer(cwd, ".project");
		writeSubstrate(cwd, ".project", { tasks: [{ id: "LOCAL-1" }] });
		const subId = "sub-00000000000000aa";
		writeSubstrate(cwd, ".foreign", {
			substrate_id: subId,
			tasks: [{ id: "FGAP-9", oid: "oid-fgap-9" }],
		});
		registerSubstrate(cwd, subId, ".foreign");

		// Resolve by oid.
		const byOid = resolveRef(cwd, { kind: "item", substrate_id: subId, oid: "oid-fgap-9" });
		assert.strictEqual(byOid.status, "foreign");
		assert.strictEqual(byOid.endpointKind, "item");
		assert.strictEqual(byOid.loc?.id, "FGAP-9");
		assert.strictEqual(byOid.substrate_id, subId);

		// Resolve by refname (no oid on the locator, refname provided).
		const byRef = resolveRef(cwd, { kind: "item", substrate_id: subId, oid: "FGAP-9", refname: "FGAP-9" });
		assert.strictEqual(byRef.status, "foreign");
		assert.strictEqual(byRef.loc?.id, "FGAP-9");
	});

	it("structured foreign registered-but-item-absent → dangling", (t) => {
		const cwd = makeProject();
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		writeBootstrapPointer(cwd, ".project");
		writeSubstrate(cwd, ".project", { tasks: [{ id: "LOCAL-1" }] });
		const subId = "sub-00000000000000bb";
		writeSubstrate(cwd, ".foreign", { substrate_id: subId, tasks: [{ id: "FGAP-1" }] });
		registerSubstrate(cwd, subId, ".foreign");

		const r = resolveRef(cwd, { kind: "item", substrate_id: subId, oid: "nope", refname: "FGAP-404" });
		assert.strictEqual(r.status, "dangling");
		assert.strictEqual(r.substrate_id, subId);
		assert.strictEqual(r.loc, undefined);
	});

	it("structured substrate_id NOT registered → unregistered", (t) => {
		const cwd = makeProject();
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		writeBootstrapPointer(cwd, ".project");
		writeSubstrate(cwd, ".project", { tasks: [{ id: "LOCAL-1" }] });

		const r = resolveRef(cwd, { kind: "item", substrate_id: "sub-0000000000000fff", oid: "x", refname: "Y" });
		assert.strictEqual(r.status, "unregistered");
		assert.strictEqual(r.endpointKind, "item");
		assert.strictEqual(r.loc, undefined);
	});
});

describe("resolveRef — legacy `<alias>:<refname>` string parse", () => {
	it("alias unregistered → unregistered (the pre-Phase-H state of the 30 `project:` strings)", (t) => {
		const cwd = makeProject();
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		writeBootstrapPointer(cwd, ".project");
		writeSubstrate(cwd, ".project", { tasks: [{ id: "LOCAL-1" }] });

		// No `project` alias registered → resolveAlias null → unregistered (NOT an
		// active-substrate dangling lookup of the whole string).
		const r = resolveRef(cwd, "project:FGAP-153");
		assert.strictEqual(r.status, "unregistered");
		assert.strictEqual(r.endpointKind, "item");
		assert.strictEqual(r.refname, "project:FGAP-153", "the whole string is retained as refname for diagnostics");
	});

	it("alias registered + item present → foreign", (t) => {
		const cwd = makeProject();
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		writeBootstrapPointer(cwd, ".project");
		writeSubstrate(cwd, ".project", { tasks: [{ id: "LOCAL-1" }] });
		const subId = "sub-00000000000000cc";
		writeSubstrate(cwd, ".foreign", { substrate_id: subId, tasks: [{ id: "FGAP-153" }] });
		registerSubstrate(cwd, subId, ".foreign", ["project"]);

		const r = resolveRef(cwd, "project:FGAP-153");
		assert.strictEqual(r.status, "foreign");
		assert.strictEqual(r.loc?.id, "FGAP-153");
		assert.strictEqual(r.substrate_id, subId);
		assert.strictEqual(r.refname, "FGAP-153", "the post-colon part is the foreign refname");
	});

	it("alias registered but foreign item absent → dangling", (t) => {
		const cwd = makeProject();
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		writeBootstrapPointer(cwd, ".project");
		writeSubstrate(cwd, ".project", { tasks: [{ id: "LOCAL-1" }] });
		const subId = "sub-00000000000000dd";
		writeSubstrate(cwd, ".foreign", { substrate_id: subId, tasks: [{ id: "FGAP-1" }] });
		registerSubstrate(cwd, subId, ".foreign", ["project"]);

		const r = resolveRef(cwd, "project:FGAP-999");
		assert.strictEqual(r.status, "dangling");
	});
});

describe("resolveRef — graceful foreign-build failure → dangling (no throw)", () => {
	it("a foreign substrate whose index build throws degrades to dangling", (t) => {
		const cwd = makeProject();
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		writeBootstrapPointer(cwd, ".project");
		writeSubstrate(cwd, ".project", { tasks: [{ id: "LOCAL-1" }] });
		const subId = "sub-00000000000000ee";
		// Foreign config registers TWO prefixed block_kinds — `decisions`→`DEC-` and
		// `tasks`→`TASK-`. The foreign data then files a `DEC-`-prefixed id inside the
		// WRONG block file (`tasks.json`): its prefix maps to `decisions` but it sits
		// in `tasks` → `buildIdIndexForDir` throws the prefix-vs-block invariant.
		// `foreignIndexFor` (the production path) loads THIS dir's own config via
		// `loadConfigForDirBestEffort` and must catch that throw → resolveRef dangling.
		const fdir = path.join(cwd, ".foreign");
		fs.mkdirSync(fdir, { recursive: true });
		const fcfg = {
			schema_version: "1.7.0",
			root: ".foreign",
			block_kinds: [
				{ canonical_id: "decisions", prefix: "DEC-", display_name: "Decisions" },
				{ canonical_id: "tasks", prefix: "TASK-", display_name: "Tasks" },
			],
			relation_types: [],
			invariants: [],
			substrate_id: subId,
		};
		fs.writeFileSync(path.join(fdir, "config.json"), JSON.stringify(fcfg));
		// `DEC-001` placed in `tasks` (prefix maps to `decisions`) → invariant throw.
		fs.writeFileSync(path.join(fdir, "tasks.json"), JSON.stringify({ tasks: [{ id: "DEC-001" }] }));
		registerSubstrate(cwd, subId, ".foreign", ["project"]);

		// Sanity: a direct build with THIS dir's own config (exactly how the
		// production `foreignIndexFor` calls it — via `loadConfigForDirBestEffort`)
		// DOES throw. Passing `null` config would silently skip the prefix invariant
		// (expectedBlockForId returns null), so the throw the catch guards only fires
		// when the foreign dir's config is loaded — which production does.
		const loadedCfg = JSON.parse(fs.readFileSync(path.join(fdir, "config.json"), "utf-8"));
		assert.throws(() => buildIdIndexForDir(fdir, fdir, loadedCfg), /Prefix-vs-block/);

		// The alias routes into the foreign substrate; building its index throws the
		// prefix-vs-block invariant, which `foreignIndexFor` catches → null → resolveRef
		// degrades to `dangling` (no throw escapes). The post-colon refname is moot once
		// the build throws — any refname into this substrate exercises the same catch.
		let r: ReturnType<typeof resolveRef> | undefined;
		assert.doesNotThrow(() => {
			r = resolveRef(cwd, "project:DEC-001");
		}, "resolveRef must not propagate the foreign-build throw");
		assert.strictEqual(r?.status, "dangling");
	});
});

describe("resolveRef — per-pass foreign-index cache (build once for N edges)", () => {
	it("two edges into the same foreign substrate build its index ONCE", (t) => {
		const cwd = makeProject();
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		writeBootstrapPointer(cwd, ".project");
		writeSubstrate(cwd, ".project", { tasks: [{ id: "LOCAL-1" }] });
		const subId = "sub-0000000000000aff";
		writeSubstrate(cwd, ".foreign", { substrate_id: subId, tasks: [{ id: "A" }, { id: "B" }] });
		registerSubstrate(cwd, subId, ".foreign", ["project"]);

		const foreignCache = new Map();
		const activeIndex = buildIdIndex(cwd);
		const r1 = resolveRef(cwd, "project:A", { activeIndex, foreignCache });
		const r2 = resolveRef(cwd, "project:B", { activeIndex, foreignCache });
		assert.strictEqual(r1.status, "foreign");
		assert.strictEqual(r2.status, "foreign");
		// The cache holds exactly one entry (the single foreign substrate), proving
		// the index was built once and reused for the second edge.
		assert.strictEqual(foreignCache.size, 1, "foreign index built once and cached");
		// Both resolutions point at the SAME index object (identity, not a rebuild).
		assert.strictEqual(foreignCache.get(subId)?.byRefname.get("A")?.id, "A");
		assert.strictEqual(foreignCache.get(subId)?.byRefname.get("B")?.id, "B");
	});
});

describe("validateContext — F2 severity split + Phase-H-preview", () => {
	it("a `project:`-string child reclassifies to edge_endpoint_unregistered (alias not registered)", (t) => {
		const cwd = makeProject();
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		writeBootstrapPointer(cwd, ".project");
		writeSubstrate(cwd, ".project", {
			tasks: [{ id: "T1" }],
			relation_types: [{ canonical_id: "relates_to", display_name: "relates to", category: "membership" }],
			relations: [{ parent: "T1", child: "project:FGAP-153", relation_type: "relates_to" }],
		});

		const res = validateContext(cwd);
		const unreg = res.issues.filter((i) => i.code === "edge_endpoint_unregistered");
		assert.strictEqual(unreg.length, 1, "the `project:` child is one unregistered error");
		assert.ok(unreg[0].message.includes("project:FGAP-153"));
		// It is an ERROR (not a warning) and there is no dangling code for it.
		assert.strictEqual(unreg[0].severity, "error");
		assert.strictEqual(
			res.issues.filter((i) => i.code === "edge_endpoint_dangling").length,
			0,
			"no dangling code — the alias parse routes to unregistered, not active-dangling",
		);
	});

	it("a bare absent child reclassifies to edge_endpoint_dangling", (t) => {
		const cwd = makeProject();
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		writeBootstrapPointer(cwd, ".project");
		writeSubstrate(cwd, ".project", {
			tasks: [{ id: "T1" }],
			relation_types: [{ canonical_id: "relates_to", display_name: "relates to", category: "membership" }],
			relations: [{ parent: "T1", child: "GHOST", relation_type: "relates_to" }],
		});

		const res = validateContext(cwd);
		const dangling = res.issues.filter((i) => i.code === "edge_endpoint_dangling");
		assert.strictEqual(dangling.length, 1);
		assert.ok(dangling[0].message.includes("GHOST"));
	});

	it("Phase-H-preview: register the `project` alias + foreign FGAP-X present → foreign CLEAN, no validateContext error", (t) => {
		const cwd = makeProject();
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		writeBootstrapPointer(cwd, ".project");
		writeSubstrate(cwd, ".project", {
			tasks: [{ id: "T1" }],
			relation_types: [{ canonical_id: "relates_to", display_name: "relates to", category: "membership" }],
			relations: [{ parent: "T1", child: "project:FGAP-7", relation_type: "relates_to" }],
		});
		const subId = "sub-0000000000000b01";
		writeSubstrate(cwd, ".foreign", { substrate_id: subId, tasks: [{ id: "FGAP-7" }] });
		registerSubstrate(cwd, subId, ".foreign", ["project"]);

		// resolveRef → foreign CLEAN.
		assert.strictEqual(resolveRef(cwd, "project:FGAP-7").status, "foreign");
		// validateContext → no edge_endpoint_* error for the foreign child.
		const res = validateContext(cwd);
		assert.strictEqual(
			res.issues.filter((i) => i.code === "edge_endpoint_unregistered" || i.code === "edge_endpoint_dangling").length,
			0,
			"the foreign-resolved child produces no endpoint error",
		);
	});
});

describe("validateRelations — `resolve?` parity + cross-substrate resolution", () => {
	const cfg: ConfigBlock = {
		schema_version: "1.7.0",
		root: ".project",
		block_kinds: [],
		relation_types: [{ canonical_id: "parent_of", display_name: "parent of", category: "hierarchy" }],
		invariants: [],
		hierarchy: [{ relation_type: "parent_of", parent_block: "tasks", child_block: "tasks" }],
	} as unknown as ConfigBlock;

	it("WITHOUT resolve → byte-identical to the inline idIndex path (explicit parity)", () => {
		const edges: Edge[] = [{ parent: "T1", child: "T2", relation_type: "parent_of" }];
		const items = { tasks: [{ id: "T1" }, { id: "T2" }] };
		const noResolve = validateRelations(cfg, edges, items);
		// A child not in the index is unresolved both with and without a resolver
		// that returns dangling for it — the omitted-path is the today-behavior.
		assert.strictEqual(noResolve.status, "clean", "T1/T2 both resolve inline → clean");
		const danglingEdges: Edge[] = [{ parent: "T1", child: "GHOST", relation_type: "parent_of" }];
		const noResolveDangling = validateRelations(cfg, danglingEdges, items);
		assert.ok(
			noResolveDangling.issues.some((i) => i.code === "edge_unresolved_child"),
			"omitted-resolve dangling child → edge_unresolved_child (today's behavior)",
		);
	});

	it("WITH resolve → a cross-substrate (foreign) child resolves to its foreign block", () => {
		// The foreign child 'FX' is NOT in itemsByBlock (active only), so the inline
		// path would flag edge_unresolved_child. The resolver reports it foreign in
		// block 'tasks' → resolves CLEAN.
		const edges: Edge[] = [{ parent: "T1", child: "FX", relation_type: "parent_of" }];
		const items = { tasks: [{ id: "T1" }] };
		const resolve = (ref: RawEndpoint) => {
			if (ref === "FX") return { status: "foreign" as const, loc: { block: "tasks" } };
			if (ref === "T1") return { status: "active" as const, loc: { block: "tasks" } };
			return { status: "dangling" as const };
		};
		const withResolve = validateRelations(cfg, edges, items, resolve);
		assert.ok(
			!withResolve.issues.some((i) => i.code === "edge_unresolved_child"),
			"foreign child resolves via the resolver → no edge_unresolved_child",
		);
		assert.strictEqual(withResolve.status, "clean");

		// Control: the SAME edge WITHOUT the resolver IS unresolved (the contrast
		// that proves the resolver did the work).
		const without = validateRelations(cfg, edges, items);
		assert.ok(without.issues.some((i) => i.code === "edge_unresolved_child"));
	});
});
