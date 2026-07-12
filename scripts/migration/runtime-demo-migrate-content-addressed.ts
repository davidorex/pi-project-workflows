/**
 * Runtime demo (the substrate content-addressing migration).
 *
 * The orchestrator's rehearsal before the real-repo dry-run + apply. Builds a
 * two-substrate scratch project end-to-end and exercises
 * `migrateToContentAddressed` against the canonical library surface (no npm, no
 * LLM call, no pi subprocess). Proves, with console PASS markers + process.exit(1)
 * on the first failed assertion:
 *
 *   (1) dryRun writes NOTHING (file tree byte-identical before/after) yet reports
 *       accurate counts.
 *   (2) a real run mints + registers substrate_ids + the legacy alias, stamps
 *       every item (oid 32-hex + content_hash 64-hex + object on disk), converts
 *       the `legacy:REF-1` edge to a structured FOREIGN endpoint, the bare edge to
 *       a structured SAME-substrate endpoint (no substrate_id), and leaves the
 *       lens-bin endpoint unchanged.
 *   (3) validateContext (active=subA) → 0 edge_endpoint_unregistered.
 *   (4) idempotency — a second run mints 0 oids + rewrites 0 edges.
 *   (5) an unresolvable `missing:NOPE` edge lands in report.unresolved, NOT as a
 *       broken edge.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { type EdgeEndpoint, loadRelationsForDir } from "@davidorex/pi-context/context";
import { writeBootstrapPointer } from "@davidorex/pi-context/context-dir";
import { loadRegistry, resolveAlias, resolveSubstrateDir } from "@davidorex/pi-context/context-registry";
import { validateContext } from "@davidorex/pi-context/context-sdk";
import { hasObject } from "@davidorex/pi-context/object-store";
import { migrateToContentAddressed } from "./lib/migrate-content-addressed.js";

function fail(msg: string): never {
	console.error(`[runtime-demo] FAIL: ${msg}`);
	process.exit(1);
}
function pass(msg: string): void {
	console.log(`[runtime-demo] ✔ ${msg}`);
}

function identitySchema(): Record<string, unknown> {
	return {
		type: "object",
		properties: {
			tasks: {
				type: "array",
				items: {
					type: "object",
					properties: {
						id: { type: "string" },
						title: { type: "string" },
						oid: { type: "string", pattern: "^[0-9a-f]{32}$" },
						content_hash: { type: "string", pattern: "^[0-9a-f]{64}$" },
						content_parent: { type: "string", pattern: "^[0-9a-f]{64}$" },
					},
					required: ["id"],
				},
			},
		},
	};
}

function writeSubstrate(
	cwd: string,
	dirName: string,
	opts: {
		tasks: Array<Record<string, unknown>>;
		relations?: unknown[];
		lenses?: Array<{ id: string; relation_type: string; bins: string[] }>;
	},
): void {
	const dir = path.join(cwd, dirName);
	fs.mkdirSync(path.join(dir, "schemas"), { recursive: true });
	fs.writeFileSync(
		path.join(dir, "config.json"),
		JSON.stringify(
			{
				schema_version: "1.8.0",
				root: dirName,
				block_kinds: [
					{
						canonical_id: "tasks",
						display_name: "Tasks",
						prefix: "",
						schema_path: "schemas/tasks.schema.json",
						array_key: "tasks",
						data_path: "tasks.json",
					},
				],
				relation_types: [{ canonical_id: "relates_to", display_name: "relates to", category: "membership" }],
				invariants: [],
				...(opts.lenses ? { lenses: opts.lenses } : {}),
			},
			null,
			2,
		),
	);
	fs.writeFileSync(path.join(dir, "schemas", "tasks.schema.json"), JSON.stringify(identitySchema(), null, 2));
	fs.writeFileSync(path.join(dir, "tasks.json"), JSON.stringify({ tasks: opts.tasks }, null, 2));
	if (opts.relations !== undefined) {
		fs.writeFileSync(path.join(dir, "relations.json"), JSON.stringify(opts.relations, null, 2));
	}
}

function snapshotTree(dir: string): Map<string, string> {
	const out = new Map<string, string>();
	const walk = (d: string): void => {
		for (const e of fs.readdirSync(d, { withFileTypes: true })) {
			const full = path.join(d, e.name);
			if (e.isDirectory()) walk(full);
			else out.set(path.relative(dir, full), fs.readFileSync(full, "utf-8"));
		}
	};
	walk(dir);
	return out;
}

function buildFixture(): string {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "migrate-ca-demo-"));
	writeBootstrapPointer(cwd, ".subA");
	writeSubstrate(cwd, ".subA", {
		tasks: [
			{ id: "T1", title: "one" },
			{ id: "T2", title: "two" },
		],
		lenses: [{ id: "board", relation_type: "relates_to", bins: ["backlog"] }],
		relations: [
			{ parent: "T1", child: "legacy:REF-1", relation_type: "relates_to" },
			{ parent: "T1", child: "T2", relation_type: "relates_to" },
			{ parent: "backlog", child: "T2", relation_type: "relates_to" },
			{ parent: "T1", child: "missing:NOPE", relation_type: "relates_to" },
		],
	});
	writeSubstrate(cwd, ".subB", { tasks: [{ id: "REF-1", title: "target" }] });
	return cwd;
}

const ALIASES = { project: ".subA", legacy: ".subB" };

// ── (1) dryRun writes nothing, reports accurate counts ───────────────────────
{
	const cwd = buildFixture();
	const before = snapshotTree(cwd);
	const report = migrateToContentAddressed(cwd, { dryRun: true, legacyAliases: ALIASES });
	const after = snapshotTree(cwd);
	if (report.dry_run !== true) fail("dryRun report.dry_run must be true");
	if ([...after.keys()].sort().join() !== [...before.keys()].sort().join()) fail("dryRun created/removed files");
	for (const [k, v] of before) if (after.get(k) !== v) fail(`dryRun mutated file ${k}`);
	if (report.cross_substrate_edges !== 1)
		fail(`dryRun cross_substrate_edges expected 1, got ${report.cross_substrate_edges}`);
	if (report.lens_bin_edges_preserved !== 1)
		fail(`dryRun lens_bin_edges_preserved expected 1, got ${report.lens_bin_edges_preserved}`);
	if (report.unresolved.length !== 1)
		fail(`dryRun unresolved expected 1 (missing:NOPE), got ${report.unresolved.length}`);
	if (report.substrates.find((s) => s.dir === ".subA")?.items_oid_minted !== 2)
		fail("dryRun subA items_oid_minted expected 2");
	pass("(1) dryRun writes nothing + reports accurate counts (cross=1, lens_bin=1, unresolved=1, subA mint=2)");
	fs.rmSync(cwd, { recursive: true, force: true });
}

// ── (2)+(3)+(5) a real run: stamping, registration, endpoint conversion ──────
const cwd = buildFixture();
const report = migrateToContentAddressed(cwd, { legacyAliases: ALIASES });

// substrate_ids + aliases registered.
const reg = loadRegistry(cwd);
if (!reg) fail("registry absent after migrate");
const subAId = resolveAlias(cwd, "project");
const subBId = resolveAlias(cwd, "legacy");
if (!subAId || !/^sub-[0-9a-f]{16}$/.test(subAId)) fail(`subA id/alias bad: ${subAId}`);
if (!subBId || !/^sub-[0-9a-f]{16}$/.test(subBId)) fail(`subB id/alias bad: ${subBId}`);
if (resolveSubstrateDir(cwd, subBId) !== ".subB") fail("legacy alias must resolve to .subB dir");
pass(`(2.1) substrate_ids minted + registered; project→${subAId} legacy→${subBId}`);

// Every item stamped + object on disk.
for (const dirName of [".subA", ".subB"]) {
	const block = JSON.parse(fs.readFileSync(path.join(cwd, dirName, "tasks.json"), "utf-8")) as {
		tasks: Array<{ oid: string; content_hash: string }>;
	};
	for (const item of block.tasks) {
		if (!/^[0-9a-f]{32}$/.test(item.oid)) fail(`${dirName} oid not 32-hex: ${item.oid}`);
		if (!/^[0-9a-f]{64}$/.test(item.content_hash)) fail(`${dirName} content_hash not 64-hex`);
		if (!hasObject(path.join(cwd, dirName), item.content_hash)) fail(`${dirName} object missing on disk`);
	}
}
pass("(2.2) every item stamped (oid 32-hex + content_hash 64-hex + object on disk)");

// Endpoint conversion.
const refOid = (
	JSON.parse(fs.readFileSync(path.join(cwd, ".subB", "tasks.json"), "utf-8")) as {
		tasks: Array<{ id: string; oid: string }>;
	}
).tasks.find((it) => it.id === "REF-1")?.oid;
const edges = loadRelationsForDir(path.join(cwd, ".subA"));

const foreign = edges
	.map((e) => e.child)
	.find((c): c is EdgeEndpoint => typeof c === "object" && c.kind === "item" && "substrate_id" in c) as
	| EdgeEndpoint
	| undefined;
if (
	!foreign ||
	foreign.kind !== "item" ||
	foreign.substrate_id !== subBId ||
	foreign.refname !== "REF-1" ||
	foreign.oid !== refOid
)
	fail(`legacy:REF-1 → structured foreign mismatch: ${JSON.stringify(foreign)}`);
pass(`(2.3) legacy:REF-1 → {kind:item, substrate_id:${subBId}, oid:${refOid}, refname:REF-1}`);

const bare = edges.find(
	(e) =>
		typeof e.parent === "object" &&
		e.parent.kind === "item" &&
		(e.parent as { refname?: string }).refname === "T1" &&
		typeof e.child === "object" &&
		e.child.kind === "item" &&
		(e.child as { refname?: string }).refname === "T2",
);
if (!bare) fail("bare T1->T2 structured edge missing");
const bc = bare.child as EdgeEndpoint;
if (bc.kind !== "item" || bc.substrate_id !== undefined) fail("bare edge child must carry NO substrate_id");
pass("(2.4) bare T1->T2 → structured items, no substrate_id");

const binEdge = edges.find((e) => typeof e.parent === "object" && e.parent.kind === "lens_bin");
if (!binEdge || (binEdge.parent as { bin: string }).bin !== "backlog") fail("lens_bin edge missing/changed");
pass("(2.5) lens-bin endpoint preserved as {kind:lens_bin, bin:backlog}");

// (5) unresolvable edge in report.unresolved, not written.
if (report.unresolved.length !== 1 || report.unresolved[0].ref !== "missing:NOPE")
	fail(`unresolved expected [missing:NOPE], got ${JSON.stringify(report.unresolved)}`);
const hasNope = edges.some(
	(e) =>
		(typeof e.child === "object" && (e.child as { refname?: string }).refname === "NOPE") || e.child === "missing:NOPE",
);
if (hasNope) fail("broken edge to NOPE must not be written");
pass("(5) missing:NOPE → report.unresolved, broken edge dropped (not written)");

// (3) validateContext clean of unregistered.
const v = validateContext(cwd);
const unreg = v.issues.filter((i) => i.code === "edge_endpoint_unregistered");
if (unreg.length !== 0) fail(`validateContext edge_endpoint_unregistered expected 0, got ${JSON.stringify(unreg)}`);
pass("(3) validateContext (active=subA) → 0 edge_endpoint_unregistered");

// (4) idempotency.
const second = migrateToContentAddressed(cwd, { legacyAliases: ALIASES });
for (const s of second.substrates) {
	if (s.items_oid_minted !== 0) fail(`${s.dir} re-run minted ${s.items_oid_minted} oids (expected 0)`);
	if (s.objects_stored !== 0) fail(`${s.dir} re-run stored ${s.objects_stored} objects (expected 0)`);
}
if (second.edges_rewritten !== 0) fail(`re-run rewrote ${second.edges_rewritten} edges (expected 0)`);
pass("(4) idempotent: re-run mints 0 oids + stores 0 objects + rewrites 0 edges");

fs.rmSync(cwd, { recursive: true, force: true });
console.log("[runtime-demo] ALL PASS");
