/**
 * Runtime demo — the substrate registry + drift invariant.
 *
 * Exercises the project-root substrate registry end-to-end against a scratch
 * project directory. No npm, no LLM call — pure library invocation against the
 * canonical pi-context surfaces (the same library the in-pi tools + Claude-Code
 * orchestrator scripts both consume).
 *
 * Sequence:
 *   1. init (bootstrap pointer + substrate dir) → accept-all (adoptConception):
 *      assert config.substrate_id is minted AND the active substrate is
 *      registered in <cwd>/.pi-context-registry.json.
 *   2. Register a SECOND substrate; rename its dir via registerSubstrate (same
 *      substrate_id, new dir) → resolveSubstrateDir returns the new dir.
 *   3. resolveAlias hit/miss.
 *   4. Induce drift: rewrite the active config.substrate_id's registry entry to a
 *      dir that is NOT the active substrate → validateContext reports the drift
 *      ERROR (code substrate_id_registry_mismatch).
 *
 * PASS markers on stdout; process.exit(1) on any failed assertion.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { adoptConception, loadConfig } from "@davidorex/pi-context/context";
import { SUBSTRATE_ID_PATTERN, writeBootstrapPointer } from "@davidorex/pi-context/context-dir";
import {
	loadRegistry,
	registerSubstrate,
	resolveAlias,
	resolveSubstrateDir,
	writeRegistry,
} from "@davidorex/pi-context/context-registry";
import { validateContext } from "@davidorex/pi-context/context-sdk";

function fail(msg: string): never {
	console.error(`[runtime-demo] ✘ ${msg}`);
	process.exit(1);
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "context-registry-demo-"));
console.log(`[runtime-demo] tmpDir = ${tmpDir}`);

try {
	// ── Phase 1: init → accept-all ────────────────────────────────────────────
	const activeDir = ".context";
	writeBootstrapPointer(tmpDir, activeDir);
	fs.mkdirSync(path.join(tmpDir, activeDir, "schemas"), { recursive: true });

	const adopt = adoptConception(tmpDir);
	if (!adopt.adopted) fail("accept-all did not adopt a fresh config");

	const config = loadConfig(tmpDir);
	if (!config) fail("no config.json after accept-all");
	const activeId = config!.substrate_id;
	if (typeof activeId !== "string" || !SUBSTRATE_ID_PATTERN.test(activeId)) {
		fail(`accept-all did not mint a valid substrate_id, got ${activeId}`);
	}
	console.log(`[runtime-demo] ✔ accept-all minted config.substrate_id = ${activeId}`);

	const reg1 = loadRegistry(tmpDir);
	if (!reg1) fail("accept-all did not create .pi-context-registry.json");
	const activeEntry = reg1!.substrates[activeId as string];
	if (!activeEntry || activeEntry.dir !== activeDir) {
		fail(`active substrate not registered at dir '${activeDir}', got ${JSON.stringify(activeEntry)}`);
	}
	console.log(`[runtime-demo] ✔ active substrate registered: ${activeId} → ${activeEntry.dir}`);

	// ── Phase 2: register a SECOND substrate + rename its dir ──────────────────
	const SUB_2 = "sub-2222222222222ccc";
	registerSubstrate(tmpDir, SUB_2, ".other-substrate", ["legacy-project"]);
	if (resolveSubstrateDir(tmpDir, SUB_2) !== ".other-substrate") {
		fail(`resolveSubstrateDir miss after registering second substrate`);
	}
	console.log(`[runtime-demo] ✔ second substrate registered: ${SUB_2} → .other-substrate`);

	registerSubstrate(tmpDir, SUB_2, ".other-renamed", ["legacy-project"]);
	if (resolveSubstrateDir(tmpDir, SUB_2) !== ".other-renamed") {
		fail(`resolveSubstrateDir did not reflect the renamed dir for the unchanged substrate_id`);
	}
	const reg2 = loadRegistry(tmpDir);
	if (Object.keys(reg2!.substrates).length !== 2) {
		fail(`expected exactly 2 substrate entries after rename, got ${Object.keys(reg2!.substrates).length}`);
	}
	console.log(
		`[runtime-demo] ✔ re-register with renamed dir is an in-place upsert (no dup): ${SUB_2} → .other-renamed`,
	);

	// ── Phase 3: resolveAlias hit/miss ────────────────────────────────────────
	if (resolveAlias(tmpDir, "legacy-project") !== SUB_2) fail(`resolveAlias hit failed`);
	if (resolveAlias(tmpDir, "no-such-alias") !== null) fail(`resolveAlias miss should return null`);
	console.log(`[runtime-demo] ✔ resolveAlias: hit → ${SUB_2}, miss → null`);

	// ── Phase 3b: validate is drift-clean before drift is induced ──────────────
	const clean = validateContext(tmpDir);
	if (clean.status !== "clean") {
		fail(`expected drift-clean validation pre-drift, got ${clean.status}: ${JSON.stringify(clean.issues)}`);
	}
	console.log(`[runtime-demo] ✔ validateContext clean while registry matches active substrate`);

	// ── Phase 4: induce drift → validateContext reports the ERROR ──────────────
	// Point the ACTIVE config.substrate_id's registry entry at a dir that is not
	// the active substrate (the bootstrap pointer still names .context).
	const drifted = loadRegistry(tmpDir)!;
	drifted.substrates[activeId as string] = { dir: ".not-the-active-dir", aliases: [] };
	writeRegistry(tmpDir, drifted);

	const driftResult = validateContext(tmpDir);
	if (driftResult.status !== "invalid") {
		fail(`expected invalid status under drift, got ${driftResult.status}`);
	}
	const driftIssue = driftResult.issues.find((i) => i.code === "substrate_id_registry_mismatch");
	if (!driftIssue || driftIssue.severity !== "error") {
		fail(`expected a substrate_id_registry_mismatch ERROR, got ${JSON.stringify(driftResult.issues)}`);
	}
	console.log(`[runtime-demo] ✔ induced drift → validateContext ERROR: ${driftIssue.code} (${driftIssue.message})`);

	console.log("\n[runtime-demo] ALL PASS");
} finally {
	fs.rmSync(tmpDir, { recursive: true, force: true });
}
