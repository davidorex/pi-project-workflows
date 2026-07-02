/**
 * Runtime demo (Cycle 8 / Phase F2 — resolveRef + the validator severity split +
 * cross-substrate resolution):
 *
 * Exercises `resolveRef` + `validateContext` end-to-end against a scratch project
 * carrying an ACTIVE substrate + a registered FOREIGN substrate, and proves:
 *
 *   (a) the four statuses: lens_bin → active/lens_bin; bare active present →
 *       active, absent → dangling; structured foreign registered+present →
 *       foreign; substrate_id unregistered → unregistered.
 *   (b) a legacy `project:`-string edge is `unregistered` BEFORE the `project`
 *       alias is registered and `foreign` CLEAN AFTER — the exact mechanism that
 *       will clear the real 30 at Phase H (without doing the migration here).
 *   (c) the per-pass foreign-index cache builds the foreign index ONCE for N
 *       edges into the same substrate (cache size === 1 after N resolutions).
 *
 * Pure library invocation (no npm, no LLM call, no pi subprocess) against the
 * canonical context-sdk / context-registry surface. Console PASS markers;
 * process.exit(1) on the first failed assertion.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { writeBootstrapPointer } from "@davidorex/pi-context/context-dir";
import { registerSubstrate } from "@davidorex/pi-context/context-registry";
import { buildIdIndex, resolveRef, validateContext } from "@davidorex/pi-context/context-sdk";

function fail(msg: string): never {
	console.error(`[runtime-demo] FAIL: ${msg}`);
	process.exit(1);
}
function pass(msg: string): void {
	console.log(`[runtime-demo] ✔ ${msg}`);
}

function writeSubstrate(
	cwd: string,
	dirName: string,
	opts: {
		substrate_id?: string;
		tasks?: Array<Record<string, unknown>>;
		relations?: unknown[];
		relation_types?: Array<Record<string, unknown>>;
	},
): void {
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
			...(opts.substrate_id ? { substrate_id: opts.substrate_id } : {}),
		}),
	);
	fs.writeFileSync(path.join(dir, "tasks.json"), JSON.stringify({ tasks: opts.tasks ?? [] }));
	fs.writeFileSync(path.join(dir, "relations.json"), JSON.stringify(opts.relations ?? []));
}

const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "resolve-ref-demo-"));
console.log(`[runtime-demo] cwd = ${cwd}`);
writeBootstrapPointer(cwd, ".project");

// Active substrate: T1 present; a relation child references project:FGAP-7 (a
// legacy alias-string, the real-substrate shape of the 30 cross-substrate edges).
writeSubstrate(cwd, ".project", {
	tasks: [{ id: "T1" }],
	relation_types: [{ canonical_id: "relates_to", display_name: "relates to", category: "membership" }],
	relations: [{ parent: "T1", child: "project:FGAP-7", relation_type: "relates_to" }],
});

// ── (a) the four statuses ───────────────────────────────────────────────────
{
	const lensBin = resolveRef(cwd, { kind: "lens_bin", bin: "backlog" });
	if (lensBin.status !== "active" || lensBin.endpointKind !== "lens_bin")
		fail(`lens_bin endpoint expected active/lens_bin, got ${lensBin.status}/${lensBin.endpointKind}`);

	const present = resolveRef(cwd, "T1");
	if (present.status !== "active" || present.loc?.id !== "T1")
		fail(`bare active 'T1' expected active+loc, got ${present.status}`);

	const absent = resolveRef(cwd, "GHOST");
	if (absent.status !== "dangling") fail(`bare absent 'GHOST' expected dangling, got ${absent.status}`);

	const unreg = resolveRef(cwd, { kind: "item", substrate_id: "sub-0000000000000fff", oid: "x", refname: "Y" });
	if (unreg.status !== "unregistered")
		fail(`structured unregistered substrate_id expected unregistered, got ${unreg.status}`);

	pass(
		"(a) four statuses: lens_bin→active; bare present→active; bare absent→dangling; unreg substrate_id→unregistered",
	);
}

// ── (b) project:-string edge: unregistered BEFORE alias, foreign CLEAN AFTER ──
const subId = "sub-0000000000000b07";

{
	// BEFORE registration: resolveRef → unregistered; validateContext flags it.
	const before = resolveRef(cwd, "project:FGAP-7");
	if (before.status !== "unregistered")
		fail(`pre-registration 'project:FGAP-7' expected unregistered, got ${before.status}`);

	const vBefore = validateContext(cwd);
	const unregErrs = vBefore.issues.filter((i) => i.code === "edge_endpoint_unregistered");
	if (unregErrs.length !== 1)
		fail(`pre-registration validateContext expected 1 edge_endpoint_unregistered, got ${unregErrs.length}`);
	if (vBefore.issues.some((i) => i.code === "edge_endpoint_dangling"))
		fail(`pre-registration produced an unexpected edge_endpoint_dangling (alias parse must route to unregistered)`);
	pass(`(b.1) BEFORE alias registration: 'project:FGAP-7' → unregistered + validateContext edge_endpoint_unregistered`);
}

// Register the `project` alias + the foreign substrate carrying FGAP-7 (the
// Phase-H mechanism — register + populate; no data migration performed here).
writeSubstrate(cwd, ".foreign", { substrate_id: subId, tasks: [{ id: "FGAP-7" }, { id: "FGAP-8" }] });
registerSubstrate(cwd, subId, ".foreign", ["project"]);

{
	const after = resolveRef(cwd, "project:FGAP-7");
	if (after.status !== "foreign" || after.loc?.id !== "FGAP-7")
		fail(`post-registration 'project:FGAP-7' expected foreign+loc, got ${after.status}`);

	const vAfter = validateContext(cwd);
	if (vAfter.issues.some((i) => i.code === "edge_endpoint_unregistered" || i.code === "edge_endpoint_dangling"))
		fail(`post-registration validateContext still flags the now-resolvable foreign child`);
	pass(`(b.2) AFTER alias registration: 'project:FGAP-7' → foreign CLEAN + validateContext no endpoint error`);
}

// ── (c) foreign-index cache builds once for N edges ─────────────────────────
{
	const foreignCache = new Map();
	const activeIndex = buildIdIndex(cwd);
	const r1 = resolveRef(cwd, "project:FGAP-7", { activeIndex, foreignCache });
	const r2 = resolveRef(cwd, "project:FGAP-8", { activeIndex, foreignCache });
	if (r1.status !== "foreign" || r2.status !== "foreign")
		fail(`both foreign edges expected foreign, got ${r1.status}/${r2.status}`);
	if (foreignCache.size !== 1)
		fail(`foreign-index cache expected size 1 (built once for N edges), got ${foreignCache.size}`);
	pass(`(c) foreign index built ONCE for 2 edges into the same substrate (cache size === 1)`);
}

fs.rmSync(cwd, { recursive: true, force: true });

console.log(`\n[runtime-demo] ✔ resolveRef classifies endpoints into active | foreign | dangling | unregistered`);
console.log(
	`[runtime-demo] ✔ a legacy 'project:'-string edge reclassifies unregistered→foreign once the alias is registered`,
);
console.log(`[runtime-demo] ✔ the per-pass foreign-index cache builds each foreign substrate's index once`);
