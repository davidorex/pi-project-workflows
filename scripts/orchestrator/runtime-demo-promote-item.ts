/**
 * Runtime demo (Cycle 9 / G2 — promoteItem + the append id-uniqueness guard):
 *
 * Exercises `promoteItem` end-to-end against a scratch project carrying an
 * ACTIVE substrate (subA, the source) + a registered FOREIGN substrate (subB,
 * the destination, with `item_derived_from_item` seeded), and proves:
 *
 *   - dry-run computes the destination refname and writes NOTHING on any channel;
 *   - a real promote mints a fresh destination oid (≠ source oid) + content_hash
 *     == hash of the copied projection + the content object on disk;
 *   - the `item_derived_from_item` lineage edge lands in subB relations.json and
 *     resolves `foreign` CLEAN for BOTH endpoints (the new derived item parent +
 *     the source child);
 *   - the source is marked superseded + its oid is preserved;
 *   - an inbound edge to the source still resolves after promotion;
 *   - a newRefname collision throws; preconditions throw (unregistered dest
 *     alias, unregistered relation_type).
 *
 * Append-guard segment: a duplicate-id append throws; an upsert with the same id
 * REPLACES (no throw); a whole-file write carrying two same-id items throws.
 *
 * Pure library invocation (no npm, no LLM call, no pi subprocess) against the
 * canonical promote-item / block-api / context-sdk surface. Console PASS markers;
 * process.exit(1) on the first failed assertion.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { appendToBlockForDir, upsertItemInBlockForDir, writeBlockForDir } from "@davidorex/pi-context/block-api";
import { computeContentHash } from "@davidorex/pi-context/content-hash";
import { writeBootstrapPointer } from "@davidorex/pi-context/context-dir";
import { registerSubstrate } from "@davidorex/pi-context/context-registry";
import { resolveRef } from "@davidorex/pi-context/context-sdk";
import { promoteItem } from "@davidorex/pi-context/promote-item";

function fail(msg: string): never {
	console.error(`[runtime-demo] FAIL: ${msg}`);
	process.exit(1);
}
function pass(msg: string): void {
	console.log(`[runtime-demo] ✔ ${msg}`);
}

const ITEM_DERIVED = {
	canonical_id: "item_derived_from_item",
	display_name: "derived from",
	category: "data_flow",
	source_kinds: ["*"],
	target_kinds: ["*"],
};
const RELATES_TO = { canonical_id: "relates_to", display_name: "relates to", category: "membership" };

const decisionsSchema = {
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

const SUB_A = "sub-0000000000000a01";
const SUB_B = "sub-0000000000000b02";

function writeSub(
	cwd: string,
	dirName: string,
	opts: { substrate_id: string; relation_types: Array<Record<string, unknown>>; decisions: unknown[] },
): string {
	const dir = path.join(cwd, dirName);
	fs.mkdirSync(path.join(dir, "schemas"), { recursive: true });
	fs.writeFileSync(
		path.join(dir, "config.json"),
		JSON.stringify({
			schema_version: "1.0.0",
			root: dirName,
			block_kinds: [],
			relation_types: opts.relation_types,
			invariants: [],
			substrate_id: opts.substrate_id,
		}),
	);
	fs.writeFileSync(path.join(dir, "schemas", "decisions.schema.json"), JSON.stringify(decisionsSchema, null, 2));
	fs.writeFileSync(path.join(dir, "relations.json"), JSON.stringify([]));
	// Stamp the source items via the canonical write-path (oid + content_hash).
	writeBlockForDir(dir, "decisions", { decisions: opts.decisions });
	return dir;
}

const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "promote-item-demo-"));
console.log(`[runtime-demo] cwd = ${cwd}`);
writeBootstrapPointer(cwd, ".subA");

const aDir = writeSub(cwd, ".subA", {
	substrate_id: SUB_A,
	relation_types: [RELATES_TO],
	decisions: [{ id: "DEC-0001", title: "the source decision", status: "open" }],
});
const bDir = writeSub(cwd, ".subB", { substrate_id: SUB_B, relation_types: [ITEM_DERIVED, RELATES_TO], decisions: [] });
registerSubstrate(cwd, SUB_A, ".subA", ["self"]);
registerSubstrate(cwd, SUB_B, ".subB", ["target"]);

const writer = { writer: { kind: "human", user: "demo@example.com" } } as const;

// Source identity (stamped at write).
const srcRef = resolveRef(cwd, "DEC-0001");
if (srcRef.status !== "active") fail(`source DEC-0001 expected active, got ${srcRef.status}`);
const srcOid = srcRef.loc?.item.oid as string;
const srcContentHash = srcRef.loc?.item.content_hash as string;
if (!/^[0-9a-f]{32}$/.test(srcOid)) fail(`source oid not minted: ${srcOid}`);

// ── dry-run writes nothing ──────────────────────────────────────────────────
{
	const dry = promoteItem(cwd, { source: "DEC-0001", destinationSubstrate: "target", dryRun: true }, writer);
	if (!dry.dryRun || dry.lineageEdgeAppended) fail(`dry-run expected dryRun:true + no edge`);
	if (dry.destination.refname !== "DEC-0001")
		fail(`dry-run dest refname expected DEC-0001, got ${dry.destination.refname}`);
	const destBlock = JSON.parse(fs.readFileSync(path.join(bDir, "decisions.json"), "utf-8"));
	if (destBlock.decisions.length !== 0) fail(`dry-run wrote a dest item`);
	const destRel = JSON.parse(fs.readFileSync(path.join(bDir, "relations.json"), "utf-8"));
	if (destRel.length !== 0) fail(`dry-run wrote a dest edge`);
	if (fs.existsSync(path.join(bDir, "objects"))) fail(`dry-run wrote a content object`);
	pass("dry-run computes the destination refname and writes nothing on any channel");
}

// ── real promote ────────────────────────────────────────────────────────────
const result = promoteItem(cwd, { source: "DEC-0001", destinationSubstrate: "target" }, writer);
if (result.dryRun || !result.lineageEdgeAppended) fail(`real promote expected dryRun:false + edge appended`);
const newOid = result.destination.oid as string;
if (!/^[0-9a-f]{32}$/.test(newOid)) fail(`dest oid not minted: ${newOid}`);
if (newOid === srcOid) fail(`dest oid must differ from source oid`);
pass("real promote mints a fresh destination oid distinct from the source oid");

const destBlock = JSON.parse(fs.readFileSync(path.join(bDir, "decisions.json"), "utf-8"));
const destItem = destBlock.decisions[0];
if (destItem.content_hash !== computeContentHash({ title: "the source decision", status: "open" }))
	fail(`dest content_hash != hash of the copied projection`);
if (!fs.existsSync(path.join(bDir, "objects", `${destItem.content_hash}.json`)))
	fail(`content object not persisted for ${destItem.content_hash}`);
pass("dest content_hash == hash of the copied projection + the content object is on disk");

// ── lineage edge resolves foreign CLEAN for BOTH endpoints ──────────────────
const destRel = JSON.parse(fs.readFileSync(path.join(bDir, "relations.json"), "utf-8"));
if (destRel.length !== 1 || destRel[0].relation_type !== "item_derived_from_item")
	fail(`expected one item_derived_from_item edge in dest`);
const edge = destRel[0];
if (edge.parent.oid !== newOid || edge.child.oid !== srcOid || edge.child.content_hash !== srcContentHash)
	fail(`lineage edge endpoints mis-stamped`);
const parentResolved = resolveRef(cwd, { kind: "item", substrate_id: SUB_B, oid: newOid, refname: "DEC-0001" });
const childResolved = resolveRef(cwd, { kind: "item", substrate_id: SUB_A, oid: srcOid, refname: "DEC-0001" });
if (parentResolved.status !== "foreign" || childResolved.status !== "foreign")
	fail(`lineage endpoints expected foreign, got ${parentResolved.status}/${childResolved.status}`);
pass("lineage edge resolves foreign CLEAN for BOTH endpoints (derived-item parent + source child)");

// ── source superseded + oid preserved ───────────────────────────────────────
const srcAfter = JSON.parse(fs.readFileSync(path.join(aDir, "decisions.json"), "utf-8"));
const srcItemAfter = srcAfter.decisions.find((d: { id: string }) => d.id === "DEC-0001");
if (srcItemAfter.status !== "superseded") fail(`source status expected superseded, got ${srcItemAfter.status}`);
if (srcItemAfter.oid !== srcOid) fail(`source oid not preserved across supersession`);
pass("source marked superseded + source oid preserved");

// ── inbound edge to the source still resolves ───────────────────────────────
{
	const r = resolveRef(cwd, "DEC-0001");
	if (r.status !== "active" || r.loc?.id !== "DEC-0001")
		fail(`inbound-source DEC-0001 expected active after promotion`);
	pass("an inbound edge to the source still resolves after promotion");
}

// ── newRefname collision throws ─────────────────────────────────────────────
{
	let threw = false;
	try {
		promoteItem(cwd, { source: "DEC-0001", destinationSubstrate: "target", newRefname: "DEC-0001" }, writer);
	} catch (e) {
		threw = (e as Error).message.includes("already exists in destination block");
	}
	if (!threw) fail(`newRefname collision expected to throw`);
	pass("newRefname collision throws");
}

// ── preconditions throw ─────────────────────────────────────────────────────
{
	let threwDest = false;
	try {
		promoteItem(cwd, { source: "DEC-0001", destinationSubstrate: "no-such-alias" }, writer);
	} catch (e) {
		threwDest = (e as Error).message.includes("is not registered");
	}
	if (!threwDest) fail(`unregistered dest alias expected to throw`);

	// A fresh project whose dest config lacks item_derived_from_item.
	const cwd2 = fs.mkdtempSync(path.join(os.tmpdir(), "promote-item-demo-norel-"));
	writeBootstrapPointer(cwd2, ".subA");
	writeSub(cwd2, ".subA", {
		substrate_id: SUB_A,
		relation_types: [RELATES_TO],
		decisions: [{ id: "DEC-0001", title: "x", status: "open" }],
	});
	writeSub(cwd2, ".subB", { substrate_id: SUB_B, relation_types: [RELATES_TO], decisions: [] });
	registerSubstrate(cwd2, SUB_A, ".subA", ["self"]);
	registerSubstrate(cwd2, SUB_B, ".subB", ["target"]);
	let threwRel = false;
	try {
		promoteItem(cwd2, { source: "DEC-0001", destinationSubstrate: "target" }, writer);
	} catch (e) {
		threwRel = (e as Error).message.includes("relation_type 'item_derived_from_item' is not registered");
	}
	if (!threwRel) fail(`unregistered dest relation_type expected to throw`);
	fs.rmSync(cwd2, { recursive: true, force: true });
	pass("preconditions throw: unregistered dest alias + unregistered dest relation_type");
}

// ── append id-uniqueness guard segment ──────────────────────────────────────
{
	// Dup append throws.
	let dupThrew = false;
	try {
		appendToBlockForDir(bDir, "decisions", "decisions", { id: "DEC-0001", title: "dup", status: "open" });
	} catch (e) {
		dupThrew = (e as Error).message.includes("already exists in decisions.decisions");
	}
	if (!dupThrew) fail(`duplicate-id append expected to throw`);

	// Upsert with the same id REPLACES (no throw).
	let upsertOk = true;
	try {
		upsertItemInBlockForDir(
			bDir,
			"decisions",
			"decisions",
			{ id: "DEC-0001", title: "replaced", status: "open" },
			"id",
		);
	} catch {
		upsertOk = false;
	}
	if (!upsertOk) fail(`upsert with same id must replace, not throw`);

	// Whole-file write carrying two same-id items throws.
	let wholeThrew = false;
	try {
		writeBlockForDir(bDir, "decisions", {
			decisions: [
				{ id: "DEC-0002", title: "a", status: "open" },
				{ id: "DEC-0002", title: "b", status: "open" },
			],
		});
	} catch (e) {
		wholeThrew = (e as Error).message.includes("already exists in decisions.decisions");
	}
	if (!wholeThrew) fail(`whole-file duplicate-id write expected to throw`);
	pass("append guard: dup-append throws; upsert replaces; whole-file-dup throws");
}

fs.rmSync(cwd, { recursive: true, force: true });

console.log(
	`\n[runtime-demo] ✔ promoteItem copies an item cross-substrate as a NEW content-addressed item + lineage edge`,
);
console.log(`[runtime-demo] ✔ the lineage edge resolves foreign CLEAN for both endpoints; the source is superseded`);
console.log(`[runtime-demo] ✔ the block-append id-uniqueness guard rejects duplicates while upsert still replaces`);
