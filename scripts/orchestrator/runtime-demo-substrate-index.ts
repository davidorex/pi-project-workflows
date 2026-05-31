/**
 * Runtime demo (Cycle 7 / Phase F1 — SubstrateIndex split):
 *
 * Exercises `buildIdIndex` end-to-end against a scratch substrate carrying a
 * MIX of stamped (oid-bearing) and unstamped items, plus a refname collision,
 * and proves the F1 inertness properties:
 *
 *   (a) byRefname.size === items.length  (when there is NO refname collision)
 *   (b) byOid holds ONLY the stamped items (the unstamped item is absent)
 *   (c) iterating `byRefname.values()` (the walker surface) visits each refname
 *       exactly once — and a stamped item appears ONCE in items / byRefname /
 *       byOid (the anti-double-count property F2 relies on)
 *   (d) first-writer-wins collision: a duplicate refname collapses to one
 *       byRefname entry (first writer) while `items` keeps both — and the
 *       walker surface still visits it once (behavior-preserving)
 *   (e) validateContext over a fixture run TWICE → byte-identical issue lists
 *       (the whole point of F1: zero behavior change / inertness)
 *
 * Pure library invocation (no npm, no LLM call, no pi subprocess) against the
 * canonical context-sdk surface. Console PASS markers; process.exit(1) on the
 * first failed assertion.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { writeBootstrapPointer } from "@davidorex/pi-context/context-dir";
import { buildIdIndex, validateContext } from "@davidorex/pi-context/context-sdk";

function fail(msg: string): never {
	console.error(`[runtime-demo] FAIL: ${msg}`);
	process.exit(1);
}
function pass(msg: string): void {
	console.log(`[runtime-demo] ✔ ${msg}`);
}

function seedSubstrate(cwd: string, tasks: Array<Record<string, unknown>>, relations: unknown[] = []): void {
	const projectDir = path.join(cwd, ".project");
	fs.mkdirSync(projectDir, { recursive: true });
	fs.writeFileSync(
		path.join(projectDir, "config.json"),
		JSON.stringify({
			schema_version: "1.0.0",
			root: ".project",
			block_kinds: [],
			relation_types: [{ canonical_id: "relates_to", display_name: "relates to", category: "membership" }],
			invariants: [],
		}),
	);
	fs.writeFileSync(path.join(projectDir, "tasks.json"), JSON.stringify({ tasks }));
	fs.writeFileSync(path.join(projectDir, "relations.json"), JSON.stringify(relations));
}

// ── Scratch A: no collision, mixed stamped/unstamped ────────────────────────
const scratchA = fs.mkdtempSync(path.join(os.tmpdir(), "substrate-index-demo-A-"));
writeBootstrapPointer(scratchA, ".project");
console.log(`[runtime-demo] scratchA = ${scratchA}`);
seedSubstrate(scratchA, [
	{ id: "T1", status: "planned" }, // unstamped
	{ id: "T2", status: "completed", oid: "oid-T2" }, // stamped
	{ id: "T3", status: "planned", oid: "oid-T3" }, // stamped
]);

const indexA = buildIdIndex(scratchA);

// (a) no-collision: byRefname.size === items.length
if (indexA.byRefname.size !== indexA.items.length)
	fail(`byRefname.size (${indexA.byRefname.size}) !== items.length (${indexA.items.length})`);
if (indexA.items.length !== 3) fail(`expected 3 items, got ${indexA.items.length}`);
pass(`(a) byRefname.size === items.length === 3 (no collision)`);

// (b) byOid holds ONLY the stamped items
const oidKeys = [...indexA.byOid.keys()].sort();
if (JSON.stringify(oidKeys) !== JSON.stringify(["oid-T2", "oid-T3"]))
	fail(`byOid keys expected [oid-T2, oid-T3], got ${JSON.stringify(oidKeys)}`);
if (indexA.byOid.size !== 2) fail(`byOid should hold exactly the 2 stamped items, got ${indexA.byOid.size}`);
pass(`(b) byOid holds only the stamped subset {oid-T2, oid-T3}; unstamped T1 absent`);

// (c) anti-double-count: each refname once in byRefname iteration; T2 once everywhere
const refnameVisits = new Map<string, number>();
for (const loc of indexA.byRefname.values()) refnameVisits.set(loc.id, (refnameVisits.get(loc.id) ?? 0) + 1);
if ([...refnameVisits.values()].some((n) => n !== 1))
	fail(`a refname was visited != once: ${JSON.stringify([...refnameVisits])}`);
const t2InItems = indexA.items.filter((l) => l.id === "T2").length;
if (t2InItems !== 1) fail(`T2 should appear once in items, got ${t2InItems}`);
if (indexA.byRefname.get("T2")?.id !== "T2" || indexA.byOid.get("oid-T2")?.id !== "T2")
	fail(`T2 not resolvable once via byRefname AND byOid`);
pass(`(c) each refname visited once; stamped T2 appears once in items / byRefname / byOid`);

// ── Scratch B: refname collision (first-writer-wins) ────────────────────────
const scratchB = fs.mkdtempSync(path.join(os.tmpdir(), "substrate-index-demo-B-"));
writeBootstrapPointer(scratchB, ".project");
console.log(`[runtime-demo] scratchB = ${scratchB}`);
seedSubstrate(scratchB, [
	{ id: "FB-001", status: "planned", marker: "first" },
	{ id: "FB-001", status: "completed", marker: "second" },
	{ id: "T2", status: "planned" },
]);

const indexB = buildIdIndex(scratchB);
if (indexB.byRefname.size !== 2) fail(`collision: byRefname.size expected 2, got ${indexB.byRefname.size}`);
if (indexB.items.length !== 3) fail(`collision: items.length expected 3, got ${indexB.items.length}`);
if (indexB.byRefname.get("FB-001")?.item.marker !== "first") fail(`first-writer-wins violated in byRefname`);
let fbWalkerVisits = 0;
for (const loc of indexB.byRefname.values()) if (loc.id === "FB-001") fbWalkerVisits++;
if (fbWalkerVisits !== 1) fail(`walker surface visited the colliding refname ${fbWalkerVisits} times (expected 1)`);
const fbItems = indexB.items.filter((l) => l.id === "FB-001");
if (fbItems.length !== 2 || fbItems[0].item.marker !== "first" || fbItems[1].item.marker !== "second")
	fail(`items did not keep both collision entries in scan order`);
pass(`(d) refname collision: byRefname keeps first writer (1 entry); items keeps both; walker visits once`);

// ── Scratch C: validateContext inertness (run twice → identical) ────────────
const scratchC = fs.mkdtempSync(path.join(os.tmpdir(), "substrate-index-demo-C-"));
writeBootstrapPointer(scratchC, ".project");
console.log(`[runtime-demo] scratchC = ${scratchC}`);
seedSubstrate(
	scratchC,
	[
		{ id: "t1", status: "completed" },
		{ id: "t2", status: "planned" },
	],
	[
		{ parent: "t1", child: "t2", relation_type: "relates_to" },
		{ parent: "t1", child: "ghost", relation_type: "relates_to" }, // dangling child
		{ parent: "t1", child: "t2", relation_type: "unregistered_rel" }, // unregistered
	],
);

const first = validateContext(scratchC);
const second = validateContext(scratchC);
if (JSON.stringify(first) !== JSON.stringify(second))
	fail(`validateContext NOT deterministic across builds:\n${JSON.stringify(first)}\nvs\n${JSON.stringify(second)}`);
if (first.issues.length === 0) fail(`fixture produced no issues — determinism check would be vacuous`);
pass(`(e) validateContext run twice → byte-identical issue list (${first.issues.length} issues, inert)`);

// ── Cleanup ─────────────────────────────────────────────────────────────────
for (const d of [scratchA, scratchB, scratchC]) fs.rmSync(d, { recursive: true, force: true });

console.log(
	`\n[runtime-demo] ✔ SubstrateIndex separates lookup maps (byRefname/byOid) from the iteration surface (items)`,
);
console.log(`[runtime-demo] ✔ byOid is populated for stamped items only (dormant this cycle — no F1 reader)`);
console.log(
	`[runtime-demo] ✔ first-writer-wins collision + scan order preserved; walker de-dups (behavior-preserving)`,
);
console.log(`[runtime-demo] ✔ validateContext is inert — identical output across repeated builds`);
