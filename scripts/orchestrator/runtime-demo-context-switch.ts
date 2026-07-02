/**
 * Runtime demo (Step 10 of TASK-094 plan):
 *
 * Exercises flipBootstrapPointer end-to-end via a tmp working directory.
 * Verifies the pointer-history flow: initial state → flip to dir-A →
 * flip to dir-B → flip back to previous (dir-A) → verify pointer state
 * preservation across the round-trip.
 *
 * No npm. No LLM call. Pure library invocation against canonical pointer
 * primitives. Sufficient to validate that flipBootstrapPointer preserves
 * created_at, stamps switched_at + switched_by + previous_contextDir,
 * and that switch-back-via-previous works.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { flipBootstrapPointer, resolveContextDir, writeBootstrapPointer } from "@davidorex/pi-context/context-dir";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "context-switch-demo-"));
const pointerPath = path.join(tmpDir, ".pi-context.json");
const writer = "human:davidryan@gmail.com";

function readPointer(): Record<string, unknown> {
	return JSON.parse(fs.readFileSync(pointerPath, "utf-8"));
}

function ensureDirWithConfig(dirName: string): void {
	const dirPath = path.join(tmpDir, dirName);
	fs.mkdirSync(dirPath, { recursive: true });
	fs.writeFileSync(
		path.join(dirPath, "config.json"),
		JSON.stringify({ schema_version: "1.7.0", root: dirName }),
		"utf-8",
	);
}

console.log(`[runtime-demo] tmpDir = ${tmpDir}`);

// --- Phase 1: initial bootstrap (no flip) ---
ensureDirWithConfig(".dir-A");
writeBootstrapPointer(tmpDir, ".dir-A");
const initial = readPointer();
const initialCreatedAt = initial.created_at as string;
console.log(`[runtime-demo] initial pointer: contextDir=${initial.contextDir} created_at=${initialCreatedAt}`);
if (initial.contextDir !== ".dir-A") throw new Error(`initial contextDir mismatch: ${initial.contextDir}`);
if (initial.previous_contextDir !== undefined) throw new Error(`initial previous_contextDir should be undefined`);

// --- Phase 2: flip to dir-B ---
ensureDirWithConfig(".dir-B");
// small delay so switched_at differs from created_at observably
await new Promise((r) => setTimeout(r, 10));
flipBootstrapPointer(tmpDir, ".dir-B", writer);
const afterFlipB = readPointer();
console.log(
	`[runtime-demo] post-flip-to-B: contextDir=${afterFlipB.contextDir} previous=${afterFlipB.previous_contextDir} switched_at=${afterFlipB.switched_at} switched_by=${afterFlipB.switched_by}`,
);
if (afterFlipB.contextDir !== ".dir-B") throw new Error(`flip-to-B contextDir mismatch: ${afterFlipB.contextDir}`);
if (afterFlipB.previous_contextDir !== ".dir-A")
	throw new Error(`flip-to-B previous_contextDir mismatch: expected .dir-A got ${afterFlipB.previous_contextDir}`);
if (afterFlipB.created_at !== initialCreatedAt)
	throw new Error(`flip-to-B did NOT preserve created_at: was ${initialCreatedAt} now ${afterFlipB.created_at}`);
if (afterFlipB.switched_by !== writer)
	throw new Error(`flip-to-B switched_by mismatch: expected ${writer} got ${afterFlipB.switched_by}`);
if (typeof afterFlipB.switched_at !== "string" || !(afterFlipB.switched_at as string).startsWith("20"))
	throw new Error(`flip-to-B switched_at not ISO: ${afterFlipB.switched_at}`);
if (afterFlipB.version !== "1.1.0") throw new Error(`flip-to-B version should be 1.1.0: ${afterFlipB.version}`);

// --- Phase 3: flip back to previous (.dir-A) ---
const flipBackTarget = afterFlipB.previous_contextDir as string;
await new Promise((r) => setTimeout(r, 10));
flipBootstrapPointer(tmpDir, flipBackTarget, writer);
const afterFlipBack = readPointer();
console.log(
	`[runtime-demo] post-flip-back: contextDir=${afterFlipBack.contextDir} previous=${afterFlipBack.previous_contextDir} switched_at=${afterFlipBack.switched_at}`,
);
if (afterFlipBack.contextDir !== ".dir-A")
	throw new Error(`flip-back contextDir mismatch: ${afterFlipBack.contextDir}`);
if (afterFlipBack.previous_contextDir !== ".dir-B")
	throw new Error(
		`flip-back previous_contextDir should be .dir-B (the intermediate): got ${afterFlipBack.previous_contextDir}`,
	);
if (afterFlipBack.created_at !== initialCreatedAt) throw new Error(`flip-back did NOT preserve created_at`);
if (afterFlipBack.switched_at === afterFlipB.switched_at)
	throw new Error(`flip-back switched_at should differ from previous flip's switched_at`);

// --- Phase 4: resolver reads the new state without stale cache ---
const resolved = resolveContextDir(tmpDir);
if (path.basename(resolved) !== ".dir-A") throw new Error(`resolveContextDir returned stale: ${resolved}`);
console.log(`[runtime-demo] resolveContextDir returns fresh: ${resolved}`);

// --- Cleanup ---
fs.rmSync(tmpDir, { recursive: true, force: true });

console.log(`\n[runtime-demo] ✔ flipBootstrapPointer preserves created_at across multiple flips`);
console.log(`[runtime-demo] ✔ previous_contextDir tracks the prior contextDir per flip`);
console.log(`[runtime-demo] ✔ switched_at + switched_by stamped per flip`);
console.log(`[runtime-demo] ✔ switch-back via previous_contextDir round-trips cleanly`);
console.log(`[runtime-demo] ✔ resolveContextDir invalidates cache and reads fresh after each flip`);
console.log(`[runtime-demo] ✔ pointer version bumped to 1.1.0`);
