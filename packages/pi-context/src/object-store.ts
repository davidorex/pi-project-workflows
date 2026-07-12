/**
 * Content-addressed object store. A durable, append-only
 * store keyed by a content hash: each distinct content projection is written
 * once to `<substrateDir>/objects/<contentHash>.json` holding its JSON. This is
 * the durable Merkle store that makes the OID/refname split actually
 * content-addressed and gives the layers built on it real pinning + integrity.
 *
 * Dir-explicit (no pointer resolution), so it is independently testable and
 * usable across substrate dirs. It takes a `contentHash` parameter rather than
 * computing one — the caller supplies the hash from `computeContentHash` — so
 * this module has ZERO dependency on `content-hash.ts`.
 *
 * No file lock: a write is keyed by its own content hash, so two writers of the
 * same content produce byte-identical files at the same path (collision-free,
 * idempotent). Atomic tmp+rename guards against a torn read of a partial file.
 *
 * `objects/` is tracked in git (it is the integrity store; gitignoring it would
 * lose pinning). No `.gitignore` change accompanies this module.
 *
 * Dormant on its own: no write path calls `putObject` directly — the
 * identity-stamping write path and the substrate canonicalizer migration's
 * backfill do. Infrastructure module — not re-exported from `index.ts`.
 */
import fs from "node:fs";
import path from "node:path";

/** Lowercase 64-char hex (a SHA-256 digest). */
const CONTENT_HASH_PATTERN = /^[0-9a-f]{64}$/;

/**
 * Guard the hash before it becomes a path segment. A content hash is a fixed
 * lowercase-hex SHA-256 digest; anything else (wrong length, uppercase, path
 * separators, `..`) is rejected so a malformed value cannot escape the
 * `objects/` directory or name a non-canonical file. Analogous to
 * `assertSubstrateName` for block names.
 */
function assertContentHash(contentHash: string): void {
	if (!CONTENT_HASH_PATTERN.test(contentHash)) {
		throw new Error(
			`object-store: invalid contentHash ${JSON.stringify(contentHash)} — expected lowercase 64-char hex (SHA-256)`,
		);
	}
}

function objectsDirFor(substrateDir: string): string {
	return path.join(substrateDir, "objects");
}

function objectPathFor(substrateDir: string, contentHash: string): string {
	return path.join(objectsDirFor(substrateDir), `${contentHash}.json`);
}

/**
 * True when an object with `contentHash` already exists in the store.
 * Asserts hash shape first (a malformed hash can never be present, but the
 * guard keeps the surface uniform and rejects path-escape attempts at the
 * boundary).
 */
export function hasObject(substrateDir: string, contentHash: string): boolean {
	assertContentHash(contentHash);
	return fs.existsSync(objectPathFor(substrateDir, contentHash));
}

/**
 * Write `content` under `contentHash` if not already present.
 *
 * Idempotent: returns early when `hasObject` is true (content-addressed — the
 * same hash implies the same bytes, so a re-put would rewrite identical
 * content). On a fresh write, creates `<substrateDir>/objects/` if needed and
 * writes `JSON.stringify(content, null, 2)` via atomic tmp+rename.
 *
 * `content` is expected to be the canonical content projection the caller
 * hashed to obtain `contentHash`; this module does not re-derive or verify the
 * hash (no dependency on content-hash.ts).
 */
export function putObject(substrateDir: string, contentHash: string, content: Record<string, unknown>): void {
	assertContentHash(contentHash);
	if (hasObject(substrateDir, contentHash)) {
		return;
	}
	const objectsDir = objectsDirFor(substrateDir);
	fs.mkdirSync(objectsDir, { recursive: true });
	const filePath = objectPathFor(substrateDir, contentHash);
	const tmpPath = `${filePath}.object-store-${process.pid}.tmp`;
	try {
		fs.writeFileSync(tmpPath, JSON.stringify(content, null, 2), "utf-8");
		fs.renameSync(tmpPath, filePath);
	} catch (err) {
		try {
			fs.unlinkSync(tmpPath);
		} catch {
			/* ignore cleanup failure */
		}
		const msg = err instanceof Error ? err.message : String(err);
		throw new Error(`object-store: failed to write object ${contentHash}: ${msg}`);
	}
}

/**
 * Parsed content stored under `contentHash`, or `null` when no such object
 * exists. Asserts hash shape first.
 */
export function getObject(substrateDir: string, contentHash: string): Record<string, unknown> | null {
	assertContentHash(contentHash);
	const filePath = objectPathFor(substrateDir, contentHash);
	if (!fs.existsSync(filePath)) {
		return null;
	}
	return JSON.parse(fs.readFileSync(filePath, "utf-8")) as Record<string, unknown>;
}
