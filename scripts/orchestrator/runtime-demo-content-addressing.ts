/**
 * Runtime demo (content-addressed substrate identity — the content-hash +
 * object-store foundation):
 *
 * Exercises the content-hash primitives + content projection + object store
 * end-to-end against a scratch tmp directory. Pure library invocation (no npm,
 * no LLM call, no pi subprocess) against the canonical block-api /
 * content-hash / object-store surfaces.
 *
 * Demonstrates the content-addressed identity properties:
 *   (a) reordering keys ⇒ same computeContentHash (JCS canonicalization)
 *   (b) changing a metadata field (created_at) ⇒ identical contentProjection
 *       ⇒ same content hash
 *   (c) changing a content field ⇒ different content hash
 *   (d) putObject(scratchDir, hash, projection) ⇒ hasObject true ⇒ getObject
 *       round-trips ⇒ second putObject is idempotent
 *   (e) the object file exists at <scratchDir>/objects/<hash>.json
 *
 * Console PASS markers; process.exit(1) on the first failed assertion.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { contentProjection } from "@davidorex/pi-context/block-api";
import { computeContentHash } from "@davidorex/pi-context/content-hash";
import { getObject, hasObject, putObject } from "@davidorex/pi-context/object-store";

function fail(msg: string): never {
	console.error(`[runtime-demo] FAIL: ${msg}`);
	process.exit(1);
}

function pass(msg: string): void {
	console.log(`[runtime-demo] ✔ ${msg}`);
}

const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), "content-addressing-demo-"));
console.log(`[runtime-demo] scratchDir = ${scratchDir}`);

// Minimal inline schema: one array `tasks` whose items use the default
// content/metadata partition (no x-identity override).
const schema: Record<string, unknown> = {
	type: "object",
	properties: {
		tasks: {
			type: "array",
			items: {
				type: "object",
				properties: {
					id: { type: "string" },
					oid: { type: "string" },
					created_by: { type: "string" },
					created_at: { type: "string" },
					modified_at: { type: "string" },
					title: { type: "string" },
					status: { type: "string" },
				},
			},
		},
	},
};

// --- (a) key reorder ⇒ same content hash ---
const itemAsc: Record<string, unknown> = { title: "do the thing", status: "open", priority: "p1" };
const itemReordered: Record<string, unknown> = { priority: "p1", status: "open", title: "do the thing" };
const hashAsc = computeContentHash(itemAsc);
const hashReordered = computeContentHash(itemReordered);
if (hashAsc !== hashReordered) fail(`key reorder changed the hash: ${hashAsc} vs ${hashReordered}`);
pass(`(a) key reorder ⇒ same computeContentHash (${hashAsc.slice(0, 12)}…)`);

// --- (b) metadata-only change ⇒ identical projection ⇒ same hash ---
const base: Record<string, unknown> = {
	id: "TASK-001",
	oid: "oid-1",
	created_by: "human:davidryan@gmail.com",
	created_at: "2026-01-01T00:00:00.000Z",
	title: "do the thing",
	status: "open",
};
const metadataMutated: Record<string, unknown> = {
	...base,
	created_at: "2099-12-31T23:59:59.000Z",
	oid: "oid-9999",
};
const projBase = contentProjection(schema, "tasks", base);
const projMutated = contentProjection(schema, "tasks", metadataMutated);
if (JSON.stringify(projBase) !== JSON.stringify(projMutated))
	fail(`metadata-only change altered the projection: ${JSON.stringify(projBase)} vs ${JSON.stringify(projMutated)}`);
const hashBase = computeContentHash(projBase);
const hashMutated = computeContentHash(projMutated);
if (hashBase !== hashMutated) fail(`metadata-only change altered the content hash: ${hashBase} vs ${hashMutated}`);
// Confirm projection actually dropped the metadata fields and kept content.
if (Object.hasOwn(projBase, "created_at") || Object.hasOwn(projBase, "oid") || Object.hasOwn(projBase, "id"))
	fail(`projection retained a metadata field: ${JSON.stringify(projBase)}`);
if (!Object.hasOwn(projBase, "title") || !Object.hasOwn(projBase, "status"))
	fail(`projection dropped a content field: ${JSON.stringify(projBase)}`);
// Confirm contentProjection did not mutate the input.
if (!Object.hasOwn(base, "created_at") || !Object.hasOwn(base, "oid")) fail(`contentProjection mutated its input item`);
pass(`(b) metadata-only change ⇒ identical projection ⇒ same hash (${hashBase.slice(0, 12)}…)`);

// --- (c) content-field change ⇒ different hash ---
const contentMutated: Record<string, unknown> = { ...base, title: "do a DIFFERENT thing" };
const hashContentMutated = computeContentHash(contentProjection(schema, "tasks", contentMutated));
if (hashContentMutated === hashBase) fail(`content change did NOT change the hash`);
pass(`(c) content change ⇒ different hash (${hashContentMutated.slice(0, 12)}…)`);

// --- (d) object store: put ⇒ has ⇒ get round-trip ⇒ idempotent re-put ---
if (hasObject(scratchDir, hashBase)) fail(`hasObject true before any put`);
putObject(scratchDir, hashBase, projBase);
if (!hasObject(scratchDir, hashBase)) fail(`hasObject false after putObject`);
const fetched = getObject(scratchDir, hashBase);
if (JSON.stringify(fetched) !== JSON.stringify(projBase))
	fail(`getObject did not round-trip: ${JSON.stringify(fetched)} vs ${JSON.stringify(projBase)}`);
const objectFile = path.join(scratchDir, "objects", `${hashBase}.json`);
const bytesBefore = fs.readFileSync(objectFile, "utf-8");
const statBefore = fs.statSync(objectFile);
// Re-put DIFFERENT content under the same hash: must be a no-op.
putObject(scratchDir, hashBase, { totally: "different" });
const bytesAfter = fs.readFileSync(objectFile, "utf-8");
const statAfter = fs.statSync(objectFile);
if (bytesAfter !== bytesBefore) fail(`idempotent re-put overwrote the object bytes`);
if (statAfter.mtimeMs !== statBefore.mtimeMs) fail(`idempotent re-put changed the object mtime`);
pass(`(d) put ⇒ has ⇒ get round-trip ⇒ idempotent re-put no-op`);

// --- (e) object file exists at <scratchDir>/objects/<hash>.json ---
if (!fs.existsSync(objectFile)) fail(`object file missing at ${objectFile}`);
pass(`(e) object file exists at <scratchDir>/objects/<hash>.json`);

// --- Cleanup ---
fs.rmSync(scratchDir, { recursive: true, force: true });

console.log(`\n[runtime-demo] ✔ content hash is key-order insensitive (JCS canonicalization)`);
console.log(`[runtime-demo] ✔ metadata-only change leaves the content hash stable`);
console.log(`[runtime-demo] ✔ content change moves the content hash`);
console.log(`[runtime-demo] ✔ object store put/has/get round-trips and re-put is idempotent`);
console.log(`[runtime-demo] ✔ object persisted at objects/<hash>.json`);
