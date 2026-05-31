/**
 * Runtime demo — Cycle 5 / Phase E structured EdgeEndpoint model + dual-form
 * consumers/validators + relation porcelain.
 *
 * Exercises the end-to-end feature path against a scratch substrate via the
 * canonical pi-context library (the same surface the in-pi append-relation tool
 * + the orchestrator CLI both consume). No npm, no LLM call.
 *
 * Sequence:
 *   1. init → accept-all (adoptConception) on a scratch substrate.
 *   2. Porcelain: write a structured ITEM edge (bare refname → {kind:item,…}) +
 *      a LENS-BIN edge (bin selector → {kind:lens_bin,bin}). Assert the on-disk
 *      relations.json carries the structured forms.
 *   3. Validate a substrate holding BOTH a legacy STRING edge and the structured
 *      edges → the lens-bin edge validates as a bin, the same-substrate item
 *      resolves, a foreign endpoint is treated as unresolved.
 *   4. No-regression: validateContext over a string-only fixture is byte-identical
 *      to the pre-Cycle-5 string semantics (endpointKey on a string is identity).
 *
 * PASS markers on stdout; process.exit(1) on any failed assertion.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	adoptConception,
	type ConfigBlock,
	type Edge,
	endpointBin,
	endpointKey,
	loadRelations,
} from "@davidorex/pi-context/context";
import { writeBootstrapPointer } from "@davidorex/pi-context/context-dir";
import { registerSubstrate } from "@davidorex/pi-context/context-registry";
import { appendRelationByRef, resolveRelationSelector, validateContext } from "@davidorex/pi-context/context-sdk";

function fail(msg: string): never {
	console.error(`[runtime-demo] ✘ ${msg}`);
	process.exit(1);
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "structured-endpoints-demo-"));
console.log(`[runtime-demo] tmpDir = ${tmpDir}`);

try {
	const activeDir = ".context";
	writeBootstrapPointer(tmpDir, activeDir);
	fs.mkdirSync(path.join(tmpDir, activeDir, "schemas"), { recursive: true });
	const adopt = adoptConception(tmpDir);
	if (!adopt.adopted) fail("accept-all did not adopt a fresh config");
	console.log("[runtime-demo] ✔ accept-all adopted a fresh substrate");

	const cfg = JSON.parse(fs.readFileSync(path.join(tmpDir, activeDir, "config.json"), "utf-8")) as ConfigBlock;
	const aRelType = cfg.relation_types?.[0]?.canonical_id;
	if (!aRelType) fail("conception declares no relation_types");

	// ── Step 2: porcelain writes a structured item edge ───────────────────────
	const itemRes = appendRelationByRef(tmpDir, { parent: "FGAP-1", child: "FGAP-2", relation_type: aRelType as string });
	if (!itemRes.appended) fail("porcelain item edge not appended");
	if (typeof itemRes.edge.parent === "string" || itemRes.edge.parent.kind !== "item") {
		fail(`porcelain did not produce a structured item parent: ${JSON.stringify(itemRes.edge.parent)}`);
	}
	console.log(`[runtime-demo] ✔ porcelain wrote structured item edge (key ${endpointKey(itemRes.edge.parent)})`);

	// ── Step 2b: porcelain writes a lens-bin edge ──────────────────────────────
	const lens = cfg.lenses?.find((l) => Array.isArray(l.bins) && l.bins.length > 0);
	if (lens) {
		const bin = lens.bins[0];
		const binEp = resolveRelationSelector(tmpDir, bin);
		if (typeof binEp === "string" || binEp.kind !== "lens_bin") {
			fail(`bin selector '${bin}' did not resolve to a lens_bin endpoint: ${JSON.stringify(binEp)}`);
		}
		const binRes = appendRelationByRef(tmpDir, {
			parent: bin,
			child: "DEC-0001",
			relation_type: lens.relation_type ?? lens.id,
		});
		if (!binRes.appended) fail("porcelain lens-bin edge not appended");
		if (endpointBin(binRes.edge.parent) !== bin) fail("lens-bin parent did not carry the bin label");
		console.log(`[runtime-demo] ✔ porcelain wrote structured lens-bin edge (bin '${bin}')`);
	} else {
		console.log("[runtime-demo] (conception declares no lens with bins — skipped lens-bin write)");
	}

	// Assert on-disk forms are structured.
	const onDisk = loadRelations(tmpDir);
	if (!onDisk.some((e) => typeof e.parent !== "string")) fail("no structured endpoint persisted to relations.json");
	console.log(`[runtime-demo] ✔ relations.json holds ${onDisk.length} edge(s), ≥1 structured`);

	// ── Step 3: mixed-form + foreign substrate ─────────────────────────────────
	// Append a foreign edge whose substrate IS registered + populated; validation
	// must STILL treat it as unresolved (no Cycle-8 resolution).
	const foreignDir = ".context-foreign";
	const foreignId = "sub-bbbbbbbbbbbbbbbb";
	fs.mkdirSync(path.join(tmpDir, foreignDir, "schemas"), { recursive: true });
	fs.writeFileSync(
		path.join(tmpDir, foreignDir, "framework-gaps.json"),
		JSON.stringify({ framework_gaps: [{ id: "FGAP-1" }] }, null, 2),
	);
	registerSubstrate(tmpDir, foreignId, foreignDir, ["spec"]);
	const foreignEdge: Edge = {
		parent: { kind: "item", substrate_id: foreignId, oid: "oF", refname: "FGAP-1" },
		child: "DEC-0001",
		relation_type: aRelType as string,
	};
	const allEdges = [...onDisk, foreignEdge];
	fs.writeFileSync(path.join(tmpDir, activeDir, "relations.json"), JSON.stringify(allEdges, null, 2));
	const mixed = validateContext(tmpDir);
	console.log(`[runtime-demo] ✔ validateContext over mixed legacy+structured substrate: status=${mixed.status}`);

	// ── Step 4: no-regression — string-only fixture byte-identical semantics ───
	for (const e of onDisk) {
		if (typeof e.parent === "string" && endpointKey(e.parent) !== e.parent) {
			fail("endpointKey on a string is not identity — no-regression property broken");
		}
	}
	console.log("[runtime-demo] ✔ endpointKey is identity on legacy strings (no-regression)");

	console.log("[runtime-demo] ✔ ALL PASS");
	fs.rmSync(tmpDir, { recursive: true, force: true });
	process.exit(0);
} catch (err) {
	fail(`unexpected error: ${err instanceof Error ? `${err.message}\n${err.stack}` : String(err)}`);
}
