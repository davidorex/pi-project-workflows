/**
 * Cycle 5 / Phase E — structured EdgeEndpoint model + dual-form consumers.
 *
 * Covers (plan §Verification 2–6):
 *  - no-regression golden: the REAL `.context-jit-spec-v2/relations.json`
 *    (legacy strings + project: sentinels) validates against relations v2.0.0;
 *  - helper unit semantics (normalizeEndpoint / endpointKey / endpointBin /
 *    endpointIdentity) incl. the documented string-vs-structured dedup asymmetry;
 *  - schema rejects malformed structured endpoints;
 *  - mixed-form graph: legacy "FGAP-1" and {kind:item,oid,refname:"FGAP-1"}
 *    land on the SAME node in walkers / validateRelations;
 *  - lens-bin-never-item adversarial: a {kind:lens_bin} parent is validated as a
 *    bin, never resolved to an item — even when its bin label collides with an id;
 *  - foreign-resolved (Cycle 8 / F2): a foreign {kind:item,substrate_id} endpoint
 *    whose substrate is registered + populated resolves `foreign` CLEAN via the
 *    registry-backed foreign index (supersedes the Cycle-5 pre-F2 sentinel assertion);
 *  - porcelain resolution: bare refname / <alias>:<refname> / lens-bin selector,
 *    plus round-trip through the raw append.
 */

import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
	adoptConception,
	type ConfigBlock,
	type Edge,
	type EdgeEndpoint,
	endpointBin,
	endpointIdentity,
	endpointKey,
	groupByLens,
	type ItemRecord,
	type LensSpec,
	normalizeEndpoint,
	validateRelations,
	walkAncestors,
	walkDescendants,
} from "./context.js";
import { writeBootstrapPointer } from "./context-dir.js";
import * as registry from "./context-registry.js";
import { appendRelationByRef, resolveRef, resolveRelationSelector, validateContext } from "./context-sdk.js";
import { validateFromFile } from "./schema-validator.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..");
const RELATIONS_SCHEMA = path.resolve(HERE, "..", "schemas", "relations.schema.json");

function tmpProject(prefix: string, activeDir = ".context"): string {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), `pcx-${prefix}-`));
	writeBootstrapPointer(cwd, activeDir);
	fs.mkdirSync(path.join(cwd, activeDir, "schemas"), { recursive: true });
	return cwd;
}

describe("structured-endpoints: helper semantics", () => {
	it("normalizeEndpoint maps the three forms (consumer key = refname, not oid)", () => {
		assert.deepEqual(normalizeEndpoint("FGAP-1"), { kind: "item", key: "FGAP-1", foreign: false });
		assert.deepEqual(normalizeEndpoint({ kind: "item", oid: "abc", refname: "FGAP-1" }), {
			kind: "item",
			key: "FGAP-1",
			foreign: false,
		});
		// no refname → falls back to oid as the consumer key
		assert.deepEqual(normalizeEndpoint({ kind: "item", oid: "abc" }), { kind: "item", key: "abc", foreign: false });
		// substrate_id present → foreign
		assert.deepEqual(normalizeEndpoint({ kind: "item", substrate_id: "S", oid: "abc", refname: "FGAP-1" }), {
			kind: "item",
			key: "FGAP-1",
			foreign: true,
		});
		assert.deepEqual(normalizeEndpoint({ kind: "lens_bin", bin: "done" }), {
			kind: "lens_bin",
			key: "done",
			bin: "done",
		});
	});

	it("endpointKey is byte-identical on legacy strings", () => {
		for (const s of ["FGAP-1", "DEC-0001", "project:FGAP-99", "done"]) {
			assert.equal(endpointKey(s), s);
		}
	});

	it("endpointBin is null for items (string + structured), the bin for lens_bin", () => {
		assert.equal(endpointBin("done"), null);
		assert.equal(endpointBin({ kind: "item", oid: "x", refname: "FGAP-1" }), null);
		assert.equal(endpointBin({ kind: "lens_bin", bin: "done" }), "done");
	});

	it("endpointIdentity: string→string, item→substrate:oid, lens_bin→bin:bin (the dedup asymmetry)", () => {
		assert.equal(endpointIdentity("FGAP-1"), "FGAP-1");
		assert.equal(endpointIdentity({ kind: "item", oid: "abc", refname: "FGAP-1" }), ":abc");
		assert.equal(endpointIdentity({ kind: "item", substrate_id: "S", oid: "abc" }), "S:abc");
		assert.equal(endpointIdentity({ kind: "lens_bin", bin: "done" }), "bin:done");
	});
});

describe("structured-endpoints: schema dual-form", () => {
	it("accepts legacy strings + project: sentinels (the persisted form)", () => {
		const legacy: Edge[] = [
			{ parent: "AX-001", child: "DEC-0004", relation_type: "axiom_grounds_decision" },
			{ parent: "project:FGAP-99", child: "DEC-0001", relation_type: "addresses" },
		];
		validateFromFile(RELATIONS_SCHEMA, legacy, "legacy");
	});

	it("accepts structured item + lens_bin endpoints", () => {
		const structured = [
			{ parent: { kind: "item", oid: "o1", refname: "FGAP-1" }, child: "DEC-0001", relation_type: "rt" },
			{ parent: { kind: "lens_bin", bin: "done" }, child: { kind: "item", oid: "o2" }, relation_type: "rt" },
			{
				parent: { kind: "item", substrate_id: "S", oid: "o3", refname: "X", content_hash: "h" },
				child: "Y",
				relation_type: "rt",
			},
		];
		validateFromFile(RELATIONS_SCHEMA, structured, "structured");
	});

	it("rejects item endpoint missing oid", () => {
		assert.throws(() =>
			validateFromFile(
				RELATIONS_SCHEMA,
				[{ parent: { kind: "item", refname: "X" }, child: "Y", relation_type: "rt" }],
				"bad",
			),
		);
	});

	it("rejects an endpoint with both item oid and lens_bin bin (extra prop on item)", () => {
		assert.throws(() =>
			validateFromFile(
				RELATIONS_SCHEMA,
				[{ parent: { kind: "item", oid: "o", bin: "done" }, child: "Y", relation_type: "rt" }],
				"bad",
			),
		);
	});

	it("rejects an unknown extra property on a structured endpoint", () => {
		assert.throws(() =>
			validateFromFile(
				RELATIONS_SCHEMA,
				[{ parent: { kind: "item", oid: "o", bogus: 1 }, child: "Y", relation_type: "rt" }],
				"bad",
			),
		);
	});
});

describe("structured-endpoints: mixed-form graph lands on same node", () => {
	const relationType = "hier";
	it("walkDescendants/walkAncestors treat legacy string and structured-same-refname as one node", () => {
		// parent FGAP-1 (legacy string) → child FGAP-2; then structured {refname:FGAP-2} → FGAP-3.
		const edges: Edge[] = [
			{ parent: "FGAP-1", child: { kind: "item", oid: "o2", refname: "FGAP-2" }, relation_type: relationType },
			{ parent: { kind: "item", oid: "o2", refname: "FGAP-2" }, child: "FGAP-3", relation_type: relationType },
		];
		// FGAP-2 reached as a string-keyed child, then used as a structured parent — same node.
		assert.deepEqual(walkDescendants("FGAP-1", relationType, edges), ["FGAP-2", "FGAP-3"]);
		assert.deepEqual(walkAncestors("FGAP-3", relationType, edges).sort(), ["FGAP-1", "FGAP-2"]);
	});
});

describe("structured-endpoints: lens-bin never reaches idIndex.get", () => {
	const lens: LensSpec = { id: "status", bins: ["done", "todo"], relation_type: "status" };
	const items: ItemRecord[] = [{ id: "DEC-0001" }, { id: "DEC-0002" }];

	it("groupByLens places a structured lens_bin parent by bin", () => {
		const edges: Edge[] = [
			{ parent: { kind: "lens_bin", bin: "done" }, child: "DEC-0001", relation_type: "status" },
			{ parent: "todo", child: "DEC-0002", relation_type: "status" },
		];
		const grouped = groupByLens(items, lens, edges);
		assert.deepEqual(
			grouped.get("done")?.map((i) => i.id),
			["DEC-0001"],
		);
		assert.deepEqual(
			grouped.get("todo")?.map((i) => i.id),
			["DEC-0002"],
		);
	});

	it("validateRelations validates a lens_bin parent as a bin (never as an item)", () => {
		const cfg = {
			schema_version: "1.8.0",
			root: ".context",
			block_kinds: [
				{
					canonical_id: "decisions",
					display_name: "D",
					prefix: "DEC-",
					schema_path: "x",
					array_key: "decisions",
					data_path: "decisions.json",
				},
			],
			lenses: [lens],
		} as unknown as ConfigBlock;
		// A lens_bin whose bin "done" does NOT collide with any item id resolves clean.
		const ok = validateRelations(
			cfg,
			[{ parent: { kind: "lens_bin", bin: "done" }, child: "DEC-0001", relation_type: "status" }],
			{
				decisions: items,
			},
		);
		assert.equal(ok.issues.filter((i) => i.code === "edge_parent_not_in_bins").length, 0);
		// A lens_bin whose bin collides with a real item id "DEC-0001" is STILL validated as a bin
		// (not in lens.bins → edge_parent_not_in_bins), never resolved to the item.
		const collide = validateRelations(
			cfg,
			[{ parent: { kind: "lens_bin", bin: "DEC-0001" }, child: "DEC-0002", relation_type: "status" }],
			{ decisions: items },
		);
		assert.equal(
			collide.issues.some((i) => i.code === "edge_parent_not_in_bins"),
			true,
		);
	});
});

describe("structured-endpoints: foreign endpoint not resolved (no F2 pull-forward)", () => {
	it("validateContext RESOLVES a foreign item endpoint when its substrate is registered + populated (Cycle 8 / F2)", () => {
		const cwd = tmpProject("foreign");
		adoptConception(cwd);

		// Cycle-8 intended reclassification (supersedes the Cycle-5 pre-F2 assertion):
		// a foreign {kind:item,substrate_id} endpoint whose substrate is REGISTERED and
		// whose refname is PRESENT there now resolves `foreign` CLEAN — the registry IS
		// consulted (via the per-pass foreign-index cache) and the foreign index is read
		// by byOid/byRefname. The endpoint produces NO `does not resolve` / endpoint
		// error. (Pre-F2 this stayed an unresolved sentinel; F2 is not behavior-
		// preserving on cross-substrate endpoints — that is the whole point.)
		const foreignDir = ".context-foreign";
		const foreignId = "sub-aaaaaaaaaaaaaaaa";
		fs.mkdirSync(path.join(cwd, foreignDir, "schemas"), { recursive: true });
		fs.writeFileSync(
			path.join(cwd, foreignDir, "decisions.json"),
			JSON.stringify({ decisions: [{ id: "OTHER-1" }, { id: "OTHER-2" }] }, null, 2),
		);
		registry.registerSubstrate(cwd, foreignId, foreignDir, ["other"]);

		const edges: Edge[] = [
			{
				parent: { kind: "item", substrate_id: foreignId, oid: "oFOREIGN", refname: "OTHER-1" },
				child: "DEC-0001",
				relation_type: "addresses",
			},
		];
		fs.writeFileSync(path.join(cwd, ".context", "relations.json"), JSON.stringify(edges, null, 2));

		const result = validateContext(cwd);
		// The foreign parent OTHER-1 now resolves (byRefname in the registered foreign
		// substrate) — no endpoint error names it.
		assert.equal(
			result.issues.some(
				(i) =>
					i.message.includes("OTHER-1") &&
					(i.code === "edge_endpoint_dangling" || i.code === "edge_endpoint_unregistered"),
			),
			false,
			"foreign endpoint resolves to its registered substrate (F2 — no endpoint error)",
		);
		// resolveRef confirms the status directly.
		assert.equal(
			resolveRef(cwd, edges[0].parent).status,
			"foreign",
			"the registered+populated foreign parent classifies as `foreign`",
		);
	});
});

describe("structured-endpoints: porcelain resolution", () => {
	it("bare refname → same-substrate item; round-trips through raw append", () => {
		const cwd = tmpProject("porcelain-bare");
		adoptConception(cwd);
		const ep = resolveRelationSelector(cwd, "FGAP-1") as EdgeEndpoint;
		assert.equal(ep.kind, "item");
		assert.equal((ep as { refname?: string }).refname, "FGAP-1");
		assert.equal((ep as { substrate_id?: string }).substrate_id, undefined);

		// relation_type must be registered in the adopted conception catalog (the
		// write-time edge-registry gate, TASK-062, now rejects unregistered types):
		// gap_relates_to_gap carries framework-gaps as both source and target kinds,
		// matching the FGAP-1/FGAP-2 endpoints (which dangle here — no items written —
		// so the presence-gated kind check is skipped; registration is what passes).
		const { appended, edge } = appendRelationByRef(cwd, {
			parent: "FGAP-1",
			child: "FGAP-2",
			relation_type: "gap_relates_to_gap",
		});
		assert.equal(appended, true);
		assert.equal(endpointKey(edge.parent), "FGAP-1");
		assert.equal(endpointKey(edge.child), "FGAP-2");
		const onDisk = JSON.parse(fs.readFileSync(path.join(cwd, ".context", "relations.json"), "utf-8")) as Edge[];
		assert.equal(onDisk.length, 1);
		assert.equal(endpointKey(onDisk[0].parent), "FGAP-1");
		// second identical append is a no-op (dedup identity).
		const second = appendRelationByRef(cwd, {
			parent: "FGAP-1",
			child: "FGAP-2",
			relation_type: "gap_relates_to_gap",
		});
		assert.equal(second.appended, false);
	});

	it("<alias>:<refname> → foreign item carrying substrate_id", () => {
		const cwd = tmpProject("porcelain-alias");
		adoptConception(cwd);
		// Register a foreign substrate with an alias; its dir need not be fully populated —
		// the selector resolution forms the endpoint even when the refname is unresolved.
		const foreignId = "sub-aaaaaaaaaaaaaaaa";
		registry.registerSubstrate(cwd, foreignId, ".context-foreign", ["spec"]);
		fs.mkdirSync(path.join(cwd, ".context-foreign"), { recursive: true });
		const ep = resolveRelationSelector(cwd, "spec:FGAP-9") as EdgeEndpoint;
		assert.equal(ep.kind, "item");
		assert.equal((ep as { substrate_id?: string }).substrate_id, foreignId);
		assert.equal((ep as { refname?: string }).refname, "FGAP-9");
	});

	it("<alias>:<refname> with an UNRESOLVABLE foreign config degrades to the null-config contract (no throw)", () => {
		const cwd = tmpProject("porcelain-alias-badcfg");
		adoptConception(cwd);
		const foreignId = "sub-bbbbbbbbbbbbbbbb";
		registry.registerSubstrate(cwd, foreignId, ".context-foreign", ["spec"]);
		fs.mkdirSync(path.join(cwd, ".context-foreign"), { recursive: true });
		// A foreign config whose schema_version has no registered chain to the
		// bundled schema: the migration-aware best-effort read collapses to null
		// (the same degraded contract an absent config has) — the selector still
		// forms the endpoint rather than throwing.
		fs.writeFileSync(
			path.join(cwd, ".context-foreign", "config.json"),
			JSON.stringify({ schema_version: "0.0.1", block_kinds: [] }),
		);
		const ep = resolveRelationSelector(cwd, "spec:FGAP-9") as EdgeEndpoint;
		assert.equal(ep.kind, "item");
		assert.equal((ep as { substrate_id?: string }).substrate_id, foreignId);
		assert.equal((ep as { refname?: string }).refname, "FGAP-9");
	});

	it("a selector matching a declared lens bin → lens_bin endpoint", () => {
		const cwd = tmpProject("porcelain-bin");
		adoptConception(cwd);
		const cfg = JSON.parse(fs.readFileSync(path.join(cwd, ".context", "config.json"), "utf-8")) as ConfigBlock;
		const bin = cfg.lenses?.[0]?.bins?.[0];
		if (typeof bin === "string") {
			const ep = resolveRelationSelector(cwd, bin) as EdgeEndpoint;
			assert.equal(ep.kind, "lens_bin");
			assert.equal((ep as { bin: string }).bin, bin);
		}
	});
});

describe("structured-endpoints: no-regression golden on the real substrate", () => {
	it("the real .context-jit-spec-v2/relations.json validates against relations v2.0.0", () => {
		const p = path.join(REPO_ROOT, ".context-jit-spec-v2", "relations.json");
		if (!fs.existsSync(p)) return; // tolerate absence in a stripped checkout
		const data = JSON.parse(fs.readFileSync(p, "utf-8"));
		validateFromFile(RELATIONS_SCHEMA, data, "real-relations");
	});
});
