/**
 * Runtime demo (Cycle 1 / Phase 0 — dir-targeted block-api primitives):
 *
 * Exercises the `*ForDir` write path end-to-end against a scratch project with
 * two substrates (`.subA` active, `.subB` non-active). Proves the new capability:
 * allocate an id + append a real item into the NON-active substrate `.subB` via
 * `nextIdForDir` + `appendToBlockForDir`, read it back via `readBlockForDir`, and
 * assert that:
 *   - the item landed in `.subB`;
 *   - `.subA` is byte-identical to its pre-write snapshot;
 *   - the active pointer NEVER moved (`resolveContextDir(cwd)` still `.subA`).
 *
 * No npm. No LLM call. Pure library invocation against the canonical block-api +
 * pointer primitives. Prints PASS markers; `process.exit(1)` on any failure.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	appendToBlockForDir,
	nextIdForDir,
	readBlock,
	readBlockForDir,
	writeBlockForDir,
} from "@davidorex/pi-context/block-api";
import { resolveContextDir, writeBootstrapPointer } from "@davidorex/pi-context/context-dir";

function fail(msg: string): never {
	console.error(`[runtime-demo] FAIL: ${msg}`);
	process.exit(1);
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dir-targeted-write-demo-"));
console.log(`[runtime-demo] tmpDir = ${tmpDir}`);

const gapsSchema = {
	type: "object",
	required: ["gaps"],
	properties: {
		gaps: {
			type: "array",
			items: {
				type: "object",
				required: ["id", "description", "status"],
				properties: {
					id: { type: "string", pattern: "^FGAP-\\d{3}$" },
					description: { type: "string" },
					status: { type: "string", enum: ["open", "resolved", "deferred"] },
				},
			},
		},
	},
};

function setupSubstrate(rel: string): string {
	const dir = path.join(tmpDir, rel);
	fs.mkdirSync(path.join(dir, "schemas"), { recursive: true });
	fs.writeFileSync(path.join(dir, "schemas", "gaps.schema.json"), JSON.stringify(gapsSchema, null, 2));
	fs.writeFileSync(path.join(dir, "gaps.json"), JSON.stringify({ gaps: [] }, null, 2));
	return dir;
}

// --- Setup: two substrates, pointer = .subA (active) ---
const subA = setupSubstrate(".subA");
const subB = setupSubstrate(".subB");
writeBootstrapPointer(tmpDir, ".subA");

const resolvedBefore = resolveContextDir(tmpDir);
if (path.basename(resolvedBefore) !== ".subA") fail(`active substrate should be .subA, got ${resolvedBefore}`);
console.log(`[runtime-demo] active substrate = ${path.basename(resolvedBefore)} (pointer)`);

const subASnapshot = fs.readFileSync(path.join(subA, "gaps.json"), "utf-8");

// --- Write a real item into the NON-active .subB via the ForDir surface ---
const id = nextIdForDir(subB, "gaps");
if (id !== "FGAP-001") fail(`nextIdForDir(.subB) expected FGAP-001, got ${id}`);
appendToBlockForDir(subB, "gaps", "gaps", { id, description: "filed into non-active substrate", status: "open" });
console.log(`[runtime-demo] appended ${id} into NON-active .subB via appendToBlockForDir`);

// --- Read it back via readBlockForDir ---
const bAfter = readBlockForDir(subB, "gaps") as { gaps: Array<{ id: string }> };
if (bAfter.gaps.length !== 1) fail(`.subB should hold exactly 1 item, got ${bAfter.gaps.length}`);
if (bAfter.gaps[0]?.id !== "FGAP-001") fail(`.subB item id mismatch: ${bAfter.gaps[0]?.id}`);

// --- .subA must be untouched ---
const subAAfter = fs.readFileSync(path.join(subA, "gaps.json"), "utf-8");
if (subAAfter !== subASnapshot) fail(".subA gaps.json changed — cross-substrate write leaked into the active dir");
const aAfter = readBlockForDir(subA, "gaps") as { gaps: unknown[] };
if (aAfter.gaps.length !== 0) fail(`.subA should remain empty, got ${aAfter.gaps.length} items`);

// --- The cwd-form readBlock still targets the active .subA (pointer unmoved) ---
const aViaCwd = readBlock(tmpDir, "gaps") as { gaps: unknown[] };
if (aViaCwd.gaps.length !== 0) fail(`cwd-form readBlock should see empty .subA, got ${aViaCwd.gaps.length}`);

// --- Pointer never moved ---
const resolvedAfter = resolveContextDir(tmpDir);
if (path.basename(resolvedAfter) !== ".subA") fail(`pointer moved! resolveContextDir now ${resolvedAfter}`);

// --- writeBlockForDir whole-block path also targets .subB ---
writeBlockForDir(subB, "gaps", {
	gaps: [
		{ id: "FGAP-001", description: "filed into non-active substrate", status: "open" },
		{ id: "FGAP-002", description: "second", status: "open" },
	],
});
const bAfter2 = readBlockForDir(subB, "gaps") as { gaps: unknown[] };
if (bAfter2.gaps.length !== 2) fail(`writeBlockForDir(.subB) expected 2 items, got ${bAfter2.gaps.length}`);
if (path.basename(resolveContextDir(tmpDir)) !== ".subA") fail("pointer moved after writeBlockForDir");

// --- Cleanup ---
fs.rmSync(tmpDir, { recursive: true, force: true });

console.log("\n[runtime-demo] ✔ nextIdForDir + appendToBlockForDir wrote a real item into the NON-active .subB");
console.log("[runtime-demo] ✔ readBlockForDir reads it back from .subB");
console.log("[runtime-demo] ✔ active .subA stayed byte-identical (no cross-substrate leak)");
console.log("[runtime-demo] ✔ writeBlockForDir whole-block path also targets .subB");
console.log("[runtime-demo] ✔ the active pointer never moved across any ForDir write");
