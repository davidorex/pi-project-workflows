/**
 * Runtime demo (write-path ordering: post-validation object
 * persistence + the nested id-uniqueness guard):
 *
 * Exercises the block-api write path end-to-end against a scratch substrate
 * (config carrying substrate_id + an identity-declaring schema with a nested
 * id-bearing array) and proves:
 *
 *   (1) an AJV-failing whole-block write leaves `objects/` EMPTY (no orphan
 *       content object) — object persistence is post-validation;
 *   (2) a successful whole-block write persists the stamped item's content
 *       object under its content_hash;
 *   (3) a successful NESTED-array append persists the nested item's content
 *       object (the load-bearing no-regression — nested items still get their
 *       objects written);
 *   (4) a nested-array duplicate id throws (the nested guard, label names
 *       parent.nested);
 *   (5) a nested id-less item does NOT throw.
 *
 * Pure library invocation (no npm, no LLM call, no pi subprocess) against the
 * canonical block-api / object-store surface. Console PASS markers;
 * process.exit(1) on the first failed assertion.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { appendToNestedArrayForDir, writeBlockForDir } from "@davidorex/pi-context/block-api";
import { hasObject } from "@davidorex/pi-context/object-store";

function fail(msg: string): never {
	console.error(`[runtime-demo] FAIL: ${msg}`);
	process.exit(1);
}
function pass(msg: string): void {
	console.log(`[runtime-demo] ✔ ${msg}`);
}

const SUB = "sub-00112233445566ab";

/** Scratch substrate dir: config (with substrate_id) + a schema declaring the
 * three identity fields, a top-level `plans` array whose items carry a nested
 * id-bearing `layers` array. `additionalProperties:false` at both levels so a
 * stray field fails whole-block AJV. */
function makeScratch(prefix: string): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), `write-ordering-${prefix}-`));
	fs.mkdirSync(path.join(dir, "schemas"), { recursive: true });
	fs.writeFileSync(
		path.join(dir, "config.json"),
		JSON.stringify({ schema_version: "1.8.0", block_kinds: [], substrate_id: SUB }, null, 2),
	);
	const identityProps = {
		oid: { type: "string", pattern: "^[0-9a-f]{32}$" },
		content_hash: { type: "string", pattern: "^[0-9a-f]{64}$" },
		content_parent: { type: "string", pattern: "^[0-9a-f]{64}$" },
	};
	const schema = {
		type: "object",
		properties: {
			plans: {
				type: "array",
				items: {
					type: "object",
					additionalProperties: false,
					required: ["id", "layers"],
					properties: {
						id: { type: "string" },
						title: { type: "string" },
						...identityProps,
						layers: {
							type: "array",
							items: {
								type: "object",
								additionalProperties: false,
								required: ["note"],
								properties: {
									id: { type: "string" },
									note: { type: "string" },
									...identityProps,
								},
							},
						},
					},
				},
			},
		},
	};
	fs.writeFileSync(path.join(dir, "schemas", "plans.schema.json"), JSON.stringify(schema, null, 2));
	return dir;
}

// ── (1) AJV-fail leaves objects/ empty ───────────────────────────────────────
{
	const dir = makeScratch("ajvfail");
	const objDir = path.join(dir, "objects");
	let threw = false;
	try {
		// `bogus` violates additionalProperties:false → whole-block AJV fails.
		writeBlockForDir(dir, "plans", { plans: [{ id: "P1", layers: [], bogus: 1 }] });
	} catch {
		threw = true;
	}
	if (!threw) fail("(1) expected AJV failure on a block carrying a forbidden field");
	const objs = fs.existsSync(objDir) ? fs.readdirSync(objDir) : [];
	if (objs.length !== 0) fail(`(1) AJV-fail left ${objs.length} orphan object(s); expected 0`);
	if (fs.existsSync(path.join(dir, "plans.json"))) fail("(1) AJV-fail wrote the block file; expected unwritten");
	fs.rmSync(dir, { recursive: true, force: true });
	pass("(1) AJV-failing write leaves objects/ empty AND block file unwritten");
}

// ── (2) successful write persists the item's object ──────────────────────────
{
	const dir = makeScratch("ok");
	writeBlockForDir(dir, "plans", { plans: [{ id: "P1", title: "x", layers: [] }] });
	const written = JSON.parse(fs.readFileSync(path.join(dir, "plans.json"), "utf-8")) as {
		plans: Array<{ content_hash: string }>;
	};
	const hash = written.plans[0].content_hash;
	if (!/^[0-9a-f]{64}$/.test(hash)) fail(`(2) top-level item missing content_hash, got ${hash}`);
	if (!hasObject(dir, hash)) fail("(2) successful write did NOT persist the content object");
	fs.rmSync(dir, { recursive: true, force: true });
	pass("(2) successful write persists the stamped item's content object");
}

// ── (3) successful nested append persists the nested item's object ───────────
{
	const dir = makeScratch("nested-ok");
	writeBlockForDir(dir, "plans", { plans: [{ id: "P1", title: "x", layers: [] }] });
	const parentPred = (it: Record<string, unknown>) => it.id === "P1";
	appendToNestedArrayForDir(dir, "plans", "plans", parentPred, "layers", { id: "L1", note: "first" });
	const written = JSON.parse(fs.readFileSync(path.join(dir, "plans.json"), "utf-8")) as {
		plans: Array<{ layers: Array<{ content_hash: string }> }>;
	};
	const nestedHash = written.plans[0].layers[0].content_hash;
	if (!/^[0-9a-f]{64}$/.test(nestedHash)) fail(`(3) nested item missing content_hash, got ${nestedHash}`);
	if (!hasObject(dir, nestedHash)) fail("(3) nested append did NOT persist the nested item's content object");
	fs.rmSync(dir, { recursive: true, force: true });
	pass("(3) successful nested append persists the nested item's content object (no-regression)");
}

// ── (4) nested duplicate id throws ───────────────────────────────────────────
{
	const dir = makeScratch("nested-dup");
	writeBlockForDir(dir, "plans", { plans: [{ id: "P1", title: "x", layers: [] }] });
	const parentPred = (it: Record<string, unknown>) => it.id === "P1";
	appendToNestedArrayForDir(dir, "plans", "plans", parentPred, "layers", { id: "L1", note: "first" });
	let threw = false;
	let msg = "";
	try {
		appendToNestedArrayForDir(dir, "plans", "plans", parentPred, "layers", { id: "L1", note: "dup" });
	} catch (e) {
		threw = true;
		msg = e instanceof Error ? e.message : String(e);
	}
	if (!threw) fail("(4) expected nested duplicate id to throw");
	if (!/\.plans\.layers/.test(msg)) fail(`(4) throw message did not name <block>.plans.layers, got: ${msg}`);
	const written = JSON.parse(fs.readFileSync(path.join(dir, "plans.json"), "utf-8")) as {
		plans: Array<{ layers: unknown[] }>;
	};
	if (written.plans[0].layers.length !== 1) fail("(4) nested array changed despite the duplicate-id rejection");
	fs.rmSync(dir, { recursive: true, force: true });
	pass("(4) nested-array duplicate id throws (label names the parent.nested path); array unchanged");
}

// ── (5) nested id-less item does NOT throw ───────────────────────────────────
{
	const dir = makeScratch("nested-noid");
	writeBlockForDir(dir, "plans", { plans: [{ id: "P1", title: "x", layers: [] }] });
	const parentPred = (it: Record<string, unknown>) => it.id === "P1";
	let threw = false;
	try {
		appendToNestedArrayForDir(dir, "plans", "plans", parentPred, "layers", { note: "a" });
		appendToNestedArrayForDir(dir, "plans", "plans", parentPred, "layers", { note: "b" });
	} catch {
		threw = true;
	}
	if (threw) fail("(5) id-less nested appends must NOT throw");
	const written = JSON.parse(fs.readFileSync(path.join(dir, "plans.json"), "utf-8")) as {
		plans: Array<{ layers: unknown[] }>;
	};
	if (written.plans[0].layers.length !== 2) fail("(5) both id-less nested appends should have landed");
	fs.rmSync(dir, { recursive: true, force: true });
	pass("(5) id-less nested items are NOT rejected (both appends land)");
}

console.log(`\n[runtime-demo] ✔ P6: content objects persist ONLY post-validation (no orphan on AJV-fail)`);
console.log(`[runtime-demo] ✔ P6: successful top-level + nested writes persist their content objects`);
console.log(`[runtime-demo] ✔ P4: nested id-uniqueness guard rejects dup ids; id-less items pass`);
