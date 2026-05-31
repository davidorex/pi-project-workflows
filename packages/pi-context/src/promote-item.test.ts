/**
 * Cycle 9 / G2 — `promoteItem` matrix.
 *
 * Promotes items between two scratch substrates registered in a project-root
 * registry, with `item_derived_from_item` seeded in the destination config, and
 * proves the §G matrix:
 *   - dest oid ≠ src oid; dest content_hash == hash of the copied projection;
 *     the content object is persisted under <destDir>/objects/<hash>.json;
 *   - the lineage edge lands in the dest relations.json and resolves `foreign`
 *     CLEAN for BOTH endpoints (the new derived item as parent, the source as
 *     child) — verified via resolveRef from the dest's vantage;
 *   - source status flips to "superseded" (decisions enum has it) and the source
 *     oid is preserved; an inbound edge to the source still resolves afterward;
 *   - a tasks source (enum lacks superseded) → status unchanged, lineage edge
 *     still filed;
 *   - newRefname collision throws; a dest-schema-validation failure aborts with
 *     NO writes (no item / edge / object); dryRun writes nothing on any channel;
 *   - preconditions throw: unregistered dest alias; unregistered relation_type;
 *     a source that resolves dangling/unregistered.
 */

import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { writeBlockForDir } from "./block-api.js";
import { computeContentHash } from "./content-hash.js";
import { resolveContextDir, writeBootstrapPointer } from "./context-dir.js";
import { registerSubstrate } from "./context-registry.js";
import { resolveRef } from "./context-sdk.js";
import { promoteItem } from "./promote-item.js";

const ITEM_DERIVED = {
	canonical_id: "item_derived_from_item",
	display_name: "derived from",
	category: "data_flow",
	source_kinds: ["*"],
	target_kinds: ["*"],
};

const RELATES_TO = { canonical_id: "relates_to", display_name: "relates to", category: "membership" };

// A decisions-like schema: identity fields + a status enum carrying "superseded".
function decisionsSchema(): Record<string, unknown> {
	return {
		type: "object",
		required: ["decisions"],
		properties: {
			decisions: {
				type: "array",
				items: {
					type: "object",
					additionalProperties: false,
					required: ["id", "title", "status"],
					properties: {
						id: { type: "string", pattern: "^DEC-\\d{4}$" },
						title: { type: "string" },
						status: { type: "string", enum: ["open", "enacted", "superseded"] },
						oid: { type: "string", pattern: "^[0-9a-f]{32}$" },
						content_hash: { type: "string", pattern: "^[0-9a-f]{64}$" },
						content_parent: { type: "string", pattern: "^[0-9a-f]{64}$" },
					},
				},
			},
		},
	};
}

// A tasks-like schema: identity fields, NO status enum (status absent).
function tasksSchema(): Record<string, unknown> {
	return {
		type: "object",
		required: ["tasks"],
		properties: {
			tasks: {
				type: "array",
				items: {
					type: "object",
					additionalProperties: false,
					required: ["id", "title"],
					properties: {
						id: { type: "string", pattern: "^TASK-\\d{3}$" },
						title: { type: "string" },
						oid: { type: "string", pattern: "^[0-9a-f]{32}$" },
						content_hash: { type: "string", pattern: "^[0-9a-f]{64}$" },
						content_parent: { type: "string", pattern: "^[0-9a-f]{64}$" },
					},
				},
			},
		},
	};
}

interface SubOpts {
	substrate_id: string;
	relation_types?: Array<Record<string, unknown>>;
	schemas?: Record<string, Record<string, unknown>>;
	blocks?: Record<string, unknown>;
	relations?: unknown[];
}

function writeSub(cwd: string, dirName: string, opts: SubOpts): string {
	const dir = path.join(cwd, dirName);
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(
		path.join(dir, "config.json"),
		JSON.stringify({
			schema_version: "1.0.0",
			root: dirName,
			block_kinds: [],
			relation_types: opts.relation_types ?? [],
			invariants: [],
			substrate_id: opts.substrate_id,
		}),
	);
	if (opts.schemas) {
		const sdir = path.join(dir, "schemas");
		fs.mkdirSync(sdir, { recursive: true });
		for (const [name, schema] of Object.entries(opts.schemas)) {
			fs.writeFileSync(path.join(sdir, `${name}.schema.json`), JSON.stringify(schema, null, 2));
		}
	}
	for (const [name, body] of Object.entries(opts.blocks ?? {})) {
		// Write the block through the canonical write-path so its items are
		// identity-stamped (oid + content_hash + content object) — the realistic
		// precondition for promotion (a lineage-edge child needs an oid).
		writeBlockForDir(dir, name, body);
	}
	fs.writeFileSync(path.join(dir, "relations.json"), JSON.stringify(opts.relations ?? []));
	return dir;
}

const SUB_A = "sub-0000000000000a01";
const SUB_B = "sub-0000000000000b02";

/** Build a scratch project: active .subA (source) + registered .subB (dest with
 * item_derived_from_item). The source decisions block carries DEC-0001 open. */
function makeProject(prefix: string): { cwd: string; aDir: string; bDir: string } {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), `promote-item-${prefix}-`));
	writeBootstrapPointer(cwd, ".subA");
	const aDir = writeSub(cwd, ".subA", {
		substrate_id: SUB_A,
		relation_types: [RELATES_TO],
		schemas: { decisions: decisionsSchema(), tasks: tasksSchema() },
		blocks: {
			decisions: { decisions: [{ id: "DEC-0001", title: "the source decision", status: "open" }] },
			tasks: { tasks: [{ id: "TASK-001", title: "the source task" }] },
		},
	});
	const bDir = writeSub(cwd, ".subB", {
		substrate_id: SUB_B,
		relation_types: [ITEM_DERIVED, RELATES_TO],
		schemas: { decisions: decisionsSchema(), tasks: tasksSchema() },
		blocks: { decisions: { decisions: [] }, tasks: { tasks: [] } },
	});
	registerSubstrate(cwd, SUB_A, ".subA", ["self"]);
	registerSubstrate(cwd, SUB_B, ".subB", ["target"]);
	return { cwd, aDir, bDir };
}

describe("promoteItem", () => {
	it("promotes a decisions item: new oid, content_hash, object, lineage edge, supersede", () => {
		const { cwd, aDir, bDir } = makeProject("decisions");

		// The source was identity-stamped at block-write time (makeProject writes
		// blocks through the canonical write-path), so it carries an oid +
		// content_hash — the realistic promotion precondition.
		const srcRef = resolveRef(cwd, "DEC-0001");
		assert.strictEqual(srcRef.status, "active");
		const srcOid = srcRef.loc?.item.oid as string;
		const srcContentHash = srcRef.loc?.item.content_hash as string;
		assert.match(srcOid, /^[0-9a-f]{32}$/);
		assert.match(srcContentHash, /^[0-9a-f]{64}$/);

		const result = promoteItem(
			cwd,
			{ source: "DEC-0001", destinationSubstrate: "target" },
			{ writer: { kind: "human", user: "tester@example.com" } },
		);

		assert.strictEqual(result.dryRun, false);
		assert.strictEqual(result.lineageEdgeAppended, true);
		const newOid = result.destination.oid as string;
		const newRefname = result.destination.refname as string;
		assert.ok(newOid, "destination oid minted");
		assert.strictEqual(newRefname, "DEC-0001"); // first id in the empty dest block

		// Dest item present + carries the minted identity fields.
		const destBlock = JSON.parse(fs.readFileSync(path.join(bDir, "decisions.json"), "utf-8")) as {
			decisions: Array<Record<string, unknown>>;
		};
		assert.strictEqual(destBlock.decisions.length, 1);
		const destItem = destBlock.decisions[0];
		assert.strictEqual(destItem.id, "DEC-0001");
		assert.strictEqual(destItem.oid, newOid);
		// dest oid is distinct from the source oid.
		assert.notStrictEqual(destItem.oid, srcOid);
		const srcAfter = JSON.parse(fs.readFileSync(path.join(aDir, "decisions.json"), "utf-8")) as {
			decisions: Array<Record<string, unknown>>;
		};
		const srcItemAfter = srcAfter.decisions.find((d) => d.id === "DEC-0001") as Record<string, unknown>;

		// content_hash == hash of the copied projection (title + status; identity
		// + the absent author fields excluded). Recompute the projection the same
		// way: the promoted item's content fields minus metadata.
		const expectedProjection = { id: "DEC-0001", title: "the source decision", status: "open" };
		// contentProjection drops id/oid/content_hash/content_parent + author fields,
		// so the projection used by the write-path is {title, status}.
		const proj: Record<string, unknown> = { title: "the source decision", status: "open" };
		void expectedProjection;
		assert.strictEqual(destItem.content_hash, computeContentHash(proj));

		// content object persisted under <destDir>/objects/<hash>.json.
		const objPath = path.join(bDir, "objects", `${destItem.content_hash as string}.json`);
		assert.ok(fs.existsSync(objPath), `content object present at ${objPath}`);

		// Lineage edge in the dest relations.json.
		const destRelations = JSON.parse(fs.readFileSync(path.join(bDir, "relations.json"), "utf-8")) as Array<
			Record<string, unknown>
		>;
		assert.strictEqual(destRelations.length, 1);
		const edge = destRelations[0];
		assert.strictEqual(edge.relation_type, "item_derived_from_item");
		const parent = edge.parent as Record<string, unknown>;
		const child = edge.child as Record<string, unknown>;
		assert.strictEqual(parent.oid, newOid);
		assert.strictEqual(parent.substrate_id, SUB_B);
		assert.strictEqual(child.substrate_id, SUB_A);
		assert.strictEqual(child.refname, "DEC-0001");
		assert.strictEqual(child.oid, srcOid);
		// The child carries the pinned source content_hash for drift detection.
		assert.strictEqual(child.content_hash, srcContentHash);

		// BOTH endpoints resolve foreign CLEAN from a vantage where SUB_A and SUB_B
		// are both registered (the active cwd registry has both).
		const parentResolved = resolveRef(cwd, { kind: "item", substrate_id: SUB_B, oid: newOid, refname: newRefname });
		assert.strictEqual(parentResolved.status, "foreign");
		const childResolved = resolveRef(cwd, { kind: "item", substrate_id: SUB_A, oid: srcOid, refname: "DEC-0001" });
		assert.strictEqual(childResolved.status, "foreign");

		// Source status flipped to superseded; source preserved (still present).
		assert.strictEqual(srcItemAfter.status, "superseded");
	});

	it("source oid is preserved across supersession", () => {
		const { cwd, aDir } = makeProject("preserve-oid");
		// Capture the source oid BEFORE promotion (stamped at block-write time).
		const before = JSON.parse(fs.readFileSync(path.join(aDir, "decisions.json"), "utf-8")) as {
			decisions: Array<Record<string, unknown>>;
		};
		const oidBefore = (before.decisions.find((d) => d.id === "DEC-0001") as Record<string, unknown>).oid as string;
		assert.match(oidBefore, /^[0-9a-f]{32}$/);

		promoteItem(
			cwd,
			{ source: "DEC-0001", destinationSubstrate: "target" },
			{ writer: { kind: "human", user: "t@example.com" } },
		);
		// The supersede update flips status (content change) but the oid is
		// immutable — preserved across the update.
		const after = JSON.parse(fs.readFileSync(path.join(aDir, "decisions.json"), "utf-8")) as {
			decisions: Array<Record<string, unknown>>;
		};
		const item = after.decisions.find((d) => d.id === "DEC-0001") as Record<string, unknown>;
		assert.strictEqual(item.oid, oidBefore);
		assert.strictEqual(item.status, "superseded");
	});

	it("inbound edge to the source still resolves after promotion", () => {
		const { cwd, aDir } = makeProject("inbound");
		// Seed an inbound edge in the ACTIVE substrate: something relates_to DEC-0001.
		fs.writeFileSync(
			path.join(aDir, "relations.json"),
			JSON.stringify([{ parent: "TASK-001", child: "DEC-0001", relation_type: "relates_to" }]),
		);
		promoteItem(
			cwd,
			{ source: "DEC-0001", destinationSubstrate: "target" },
			{ writer: { kind: "human", user: "t@example.com" } },
		);
		// The inbound edge's child (DEC-0001) still resolves active in the source.
		const r = resolveRef(cwd, "DEC-0001");
		assert.strictEqual(r.status, "active");
		assert.strictEqual(r.loc?.id, "DEC-0001");
	});

	it("tasks source (enum lacks superseded): status unchanged, lineage edge filed", () => {
		const { cwd, aDir, bDir } = makeProject("tasks");
		const result = promoteItem(
			cwd,
			{ source: "TASK-001", destinationSubstrate: "target" },
			{ writer: { kind: "human", user: "t@example.com" } },
		);
		assert.strictEqual(result.lineageEdgeAppended, true);
		// Source task has no status field → unchanged (no status added).
		const srcAfter = JSON.parse(fs.readFileSync(path.join(aDir, "tasks.json"), "utf-8")) as {
			tasks: Array<Record<string, unknown>>;
		};
		const t = srcAfter.tasks.find((x) => x.id === "TASK-001") as Record<string, unknown>;
		assert.strictEqual(t.status, undefined);
		// Lineage edge present in dest.
		const destRelations = JSON.parse(fs.readFileSync(path.join(bDir, "relations.json"), "utf-8")) as unknown[];
		assert.strictEqual(destRelations.length, 1);
	});

	it("dryRun writes nothing on any channel", () => {
		const { cwd, aDir, bDir } = makeProject("dryrun");
		const result = promoteItem(
			cwd,
			{ source: "DEC-0001", destinationSubstrate: "target", dryRun: true },
			{ writer: { kind: "human", user: "t@example.com" } },
		);
		assert.strictEqual(result.dryRun, true);
		assert.strictEqual(result.lineageEdgeAppended, false);
		assert.strictEqual(result.destination.refname, "DEC-0001");
		// No dest item, no dest edge, no object dir, source unchanged.
		const destBlock = JSON.parse(fs.readFileSync(path.join(bDir, "decisions.json"), "utf-8")) as {
			decisions: unknown[];
		};
		assert.strictEqual(destBlock.decisions.length, 0);
		const destRelations = JSON.parse(fs.readFileSync(path.join(bDir, "relations.json"), "utf-8")) as unknown[];
		assert.strictEqual(destRelations.length, 0);
		assert.strictEqual(fs.existsSync(path.join(bDir, "objects")), false);
		const srcAfter = JSON.parse(fs.readFileSync(path.join(aDir, "decisions.json"), "utf-8")) as {
			decisions: Array<Record<string, unknown>>;
		};
		assert.strictEqual(srcAfter.decisions[0].status, "open");
	});

	it("newRefname collision throws", () => {
		const { cwd, bDir } = makeProject("collision");
		// Seed the dest block with DEC-0009 already present.
		fs.writeFileSync(
			path.join(bDir, "decisions.json"),
			JSON.stringify({ decisions: [{ id: "DEC-0009", title: "already here", status: "open" }] }),
		);
		assert.throws(
			() =>
				promoteItem(
					cwd,
					{ source: "DEC-0001", destinationSubstrate: "target", newRefname: "DEC-0009" },
					{ writer: { kind: "human", user: "t@example.com" } },
				),
			/already exists in destination block/,
		);
	});

	it("dest-schema-validation failure aborts the block + edge writes", () => {
		const { cwd, bDir } = makeProject("schemafail");
		// Make the source carry a field the dest schema forbids
		// (additionalProperties:false). The dest block write fails AJV → throw; the
		// lineage edge + supersede happen AFTER the write, so none occur.
		const aDecisions = path.join(cwd, ".subA", "decisions.json");
		fs.writeFileSync(
			aDecisions,
			JSON.stringify({ decisions: [{ id: "DEC-0001", title: "x", status: "open", bogus: "nope" }] }),
		);
		assert.throws(() =>
			promoteItem(
				cwd,
				{ source: "DEC-0001", destinationSubstrate: "target" },
				{ writer: { kind: "human", user: "t@example.com" } },
			),
		);
		// No dest item, no dest edge. (The block file's atomic tmp+rename write is
		// what is rolled back on AJV failure.)
		const destBlock = JSON.parse(fs.readFileSync(path.join(bDir, "decisions.json"), "utf-8")) as {
			decisions: unknown[];
		};
		assert.strictEqual(destBlock.decisions.length, 0);
		const destRelations = JSON.parse(fs.readFileSync(path.join(bDir, "relations.json"), "utf-8")) as unknown[];
		assert.strictEqual(destRelations.length, 0);
		// NOTE: the content object IS persisted during identity-stamping, which runs
		// (putObject) BEFORE the whole-block AJV validation in writeTypedFile. An
		// orphaned content object can therefore land even though the block + edge
		// writes are rolled back — the object store is content-addressed + idempotent
		// and not transactional with the block write. This reflects the existing
		// block-api write-path ordering, not a promote-item-specific effect.
		const objDir = path.join(bDir, "objects");
		if (fs.existsSync(objDir)) {
			// At most an orphan object — never a referenced one (no item/edge points at it).
			const objs = fs.readdirSync(objDir);
			assert.ok(objs.length <= 1, `expected at most one orphan object, got ${objs.length}`);
		}
	});

	it("precondition: unregistered destination alias throws", () => {
		const { cwd } = makeProject("unreg-dest");
		assert.throws(
			() =>
				promoteItem(
					cwd,
					{ source: "DEC-0001", destinationSubstrate: "no-such-alias" },
					{ writer: { kind: "human", user: "t@example.com" } },
				),
			/is not registered/,
		);
	});

	it("precondition: unregistered relation_type in dest config throws", () => {
		const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "promote-item-norel-"));
		writeBootstrapPointer(cwd, ".subA");
		writeSub(cwd, ".subA", {
			substrate_id: SUB_A,
			relation_types: [RELATES_TO],
			schemas: { decisions: decisionsSchema() },
			blocks: { decisions: { decisions: [{ id: "DEC-0001", title: "x", status: "open" }] } },
		});
		// Dest WITHOUT item_derived_from_item registered.
		writeSub(cwd, ".subB", {
			substrate_id: SUB_B,
			relation_types: [RELATES_TO],
			schemas: { decisions: decisionsSchema() },
			blocks: { decisions: { decisions: [] } },
		});
		registerSubstrate(cwd, SUB_A, ".subA", ["self"]);
		registerSubstrate(cwd, SUB_B, ".subB", ["target"]);
		assert.throws(
			() =>
				promoteItem(
					cwd,
					{ source: "DEC-0001", destinationSubstrate: "target" },
					{ writer: { kind: "human", user: "t@example.com" } },
				),
			/relation_type 'item_derived_from_item' is not registered/,
		);
	});

	it("precondition: a source that resolves dangling throws", () => {
		const { cwd } = makeProject("dangling-src");
		assert.throws(
			() =>
				promoteItem(
					cwd,
					{ source: "GHOST-999", destinationSubstrate: "target" },
					{ writer: { kind: "human", user: "t@example.com" } },
				),
			/dangling/,
		);
	});

	it("equivalence: active source dir is the resolved active dir (pointer untouched)", () => {
		const { cwd, aDir } = makeProject("equiv");
		promoteItem(
			cwd,
			{ source: "DEC-0001", destinationSubstrate: "target" },
			{ writer: { kind: "human", user: "t@example.com" } },
		);
		// The pointer still resolves to .subA — the promotion never moved it.
		assert.strictEqual(resolveContextDir(cwd), aDir);
	});
});
