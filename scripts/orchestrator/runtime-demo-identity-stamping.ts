/**
 * Runtime demo (Cycle 3 / Phase C — OID minting + identity stamping):
 *
 * Exercises the live write path end-to-end against a scratch substrate that
 * carries a real identity-declaring block schema + a minted substrate_id. Pure
 * library invocation (no npm, no LLM, no pi subprocess) against the canonical
 * block-api primitives — the SAME `appendToBlock` / `updateItemInBlock` surface
 * in-pi agents reach via registered tools.
 *
 * Demonstrates the locked Cycle-3 properties:
 *   (a) append a real item → oid (^[0-9a-f]{32}$) + content_hash present, NO
 *       content_parent (v1), object persisted at objects/<content_hash>.json
 *   (b) update CONTENT → content_hash moves, content_parent = the prior hash,
 *       oid UNCHANGED, new object persisted
 *   (c) rename the refname `id` → content_hash UNCHANGED (id is mandatory-floor
 *       metadata, excluded from the content hash), oid unchanged
 *   (d) attempt to mutate oid on update → throws (oid is immutable)
 *   (e) author-only re-stamp (modified_*) → content_hash UNCHANGED,
 *       content_parent NOT advanced
 *
 * Console PASS markers; process.exit(1) on the first failed assertion.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { appendToBlock, readBlock, updateItemInBlock } from "@davidorex/pi-context/block-api";
import { writeBootstrapPointer } from "@davidorex/pi-context/context-dir";
import type { DispatchContext } from "@davidorex/pi-context/dispatch-context";

function fail(msg: string): never {
	console.error(`[runtime-demo] FAIL: ${msg}`);
	process.exit(1);
}
function pass(msg: string): void {
	console.log(`[runtime-demo] ✔ ${msg}`);
}

const OID_RE = /^[0-9a-f]{32}$/;
const HASH_RE = /^[0-9a-f]{64}$/;
const SUBSTRATE_ID = "sub-00112233445566aa";

const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "identity-stamping-demo-"));
console.log(`[runtime-demo] scratch cwd = ${cwd}`);

// Bootstrap pointer → substrate dir ".sub".
writeBootstrapPointer(cwd, ".sub");
const subDir = path.join(cwd, ".sub");
fs.mkdirSync(path.join(subDir, "schemas"), { recursive: true });

// config.json carrying a minted substrate_id (substrateIdForDir reads this).
fs.writeFileSync(
	path.join(subDir, "config.json"),
	JSON.stringify({ schema_version: "1.0.0", substrate_id: SUBSTRATE_ID, block_kinds: [] }, null, 2),
	"utf-8",
);

// A real identity-declaring block schema: `tasks` items declare the three
// identity fields → the stamping gate fires.
const schema = {
	type: "object",
	required: ["tasks"],
	properties: {
		tasks: {
			type: "array",
			items: {
				type: "object",
				additionalProperties: false,
				required: ["id", "title", "status"],
				properties: {
					id: { type: "string" },
					title: { type: "string" },
					status: { type: "string" },
					modified_by: { type: "string" },
					modified_at: { type: "string" },
					oid: { type: "string", pattern: "^[0-9a-f]{32}$" },
					content_hash: { type: "string", pattern: "^[0-9a-f]{64}$" },
					content_parent: { type: "string", pattern: "^[0-9a-f]{64}$" },
				},
			},
		},
	},
};
fs.writeFileSync(path.join(subDir, "schemas", "tasks.schema.json"), JSON.stringify(schema, null, 2), "utf-8");
fs.writeFileSync(path.join(subDir, "tasks.json"), JSON.stringify({ tasks: [] }, null, 2), "utf-8");

const ctx: DispatchContext = { writer: { kind: "human", user: "davidryan@gmail.com" } };

function readTask(id: string): Record<string, unknown> {
	const block = readBlock(cwd, "tasks") as { tasks: Record<string, unknown>[] };
	const t = block.tasks.find((x) => x.id === id);
	if (!t) fail(`task '${id}' not found`);
	return t;
}
function objectExists(hash: string): boolean {
	return fs.existsSync(path.join(subDir, "objects", `${hash}.json`));
}

// --- (a) append → oid + content_hash, no content_parent, object persisted ---
appendToBlock(cwd, "tasks", "tasks", { id: "TASK-001", title: "do the thing", status: "open" }, ctx);
const v1 = readTask("TASK-001");
if (typeof v1.oid !== "string" || !OID_RE.test(v1.oid as string)) fail(`v1 oid malformed: ${JSON.stringify(v1.oid)}`);
if (typeof v1.content_hash !== "string" || !HASH_RE.test(v1.content_hash as string))
	fail(`v1 content_hash malformed: ${JSON.stringify(v1.content_hash)}`);
if ("content_parent" in v1) fail(`v1 must have NO content_parent, got ${JSON.stringify(v1.content_parent)}`);
if (!objectExists(v1.content_hash as string)) fail(`v1 object not persisted at objects/${v1.content_hash}.json`);
const oid1 = v1.oid as string;
const hash1 = v1.content_hash as string;
pass(`(a) append → oid=${oid1.slice(0, 12)}… content_hash=${hash1.slice(0, 12)}… no content_parent, object persisted`);

// --- (b) update CONTENT → hash moves, content_parent = prior, oid unchanged ---
updateItemInBlock(cwd, "tasks", "tasks", (t) => t.id === "TASK-001", { title: "do a DIFFERENT thing" }, ctx);
const v2 = readTask("TASK-001");
if (v2.oid !== oid1) fail(`(b) oid changed on content update: ${oid1} → ${JSON.stringify(v2.oid)}`);
if (v2.content_hash === hash1) fail(`(b) content_hash did NOT move on content change`);
if (!HASH_RE.test(v2.content_hash as string)) fail(`(b) v2 content_hash malformed`);
if (v2.content_parent !== hash1)
	fail(`(b) content_parent != prior hash: ${JSON.stringify(v2.content_parent)} vs ${hash1}`);
if (!objectExists(v2.content_hash as string)) fail(`(b) v2 object not persisted`);
const hash2 = v2.content_hash as string;
pass(
	`(b) content update → hash moved to ${hash2.slice(0, 12)}…, content_parent=${(v2.content_parent as string).slice(0, 12)}…, oid unchanged`,
);

// --- (c) rename refname id → content_hash UNCHANGED (id is floor metadata) ---
updateItemInBlock(cwd, "tasks", "tasks", (t) => t.id === "TASK-001", { id: "TASK-001-renamed" }, ctx);
const v3 = readTask("TASK-001-renamed");
if (v3.oid !== oid1) fail(`(c) oid changed on rename`);
if (v3.content_hash !== hash2) fail(`(c) content_hash moved on a pure id rename: ${v3.content_hash} vs ${hash2}`);
if ("content_parent" in v3 && v3.content_parent !== hash1)
	fail(`(c) content_parent advanced on a no-content-change rename: ${JSON.stringify(v3.content_parent)}`);
pass(`(c) refname id rename → content_hash UNCHANGED (${(v3.content_hash as string).slice(0, 12)}…), oid unchanged`);

// --- (d) attempt to mutate oid → throws ---
let threw = false;
try {
	updateItemInBlock(
		cwd,
		"tasks",
		"tasks",
		(t) => t.id === "TASK-001-renamed",
		{ oid: "ffffffffffffffffffffffffffffffff" },
		ctx,
	);
} catch (err) {
	threw = true;
	if (!(err instanceof Error) || !/oid is immutable/.test(err.message))
		fail(`(d) threw but with the wrong message: ${err instanceof Error ? err.message : String(err)}`);
}
if (!threw) fail(`(d) mutating oid did NOT throw`);
pass(`(d) mutate-oid on update → throws (oid is immutable)`);

// --- (e) author-only re-stamp → content_hash UNCHANGED, content_parent not advanced ---
const before = readTask("TASK-001-renamed");
// An empty-updates merge still re-stamps modified_* (author) but does not touch content.
updateItemInBlock(cwd, "tasks", "tasks", (t) => t.id === "TASK-001-renamed", {}, ctx);
const after = readTask("TASK-001-renamed");
if (after.content_hash !== before.content_hash)
	fail(`(e) author-only re-stamp moved content_hash: ${before.content_hash} → ${after.content_hash}`);
if (JSON.stringify(after.content_parent) !== JSON.stringify(before.content_parent))
	fail(
		`(e) author-only re-stamp advanced content_parent: ${JSON.stringify(before.content_parent)} → ${JSON.stringify(after.content_parent)}`,
	);
if (after.oid !== oid1) fail(`(e) author-only re-stamp changed oid`);
pass(`(e) author-only re-stamp → content_hash + content_parent + oid all unchanged`);

fs.rmSync(cwd, { recursive: true, force: true });

console.log(`\n[runtime-demo] ✔ append mints oid + content_hash, persists the object, sets no v1 content_parent`);
console.log(`[runtime-demo] ✔ content update moves the hash, advances content_parent, preserves oid`);
console.log(`[runtime-demo] ✔ refname (id) rename leaves the content hash stable (floor metadata)`);
console.log(`[runtime-demo] ✔ oid is immutable on update (throws)`);
console.log(`[runtime-demo] ✔ author-only re-stamp is content-hash-neutral`);
