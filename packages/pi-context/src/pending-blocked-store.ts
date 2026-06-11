/**
 * pending-blocked-store — substrate-managed read / write surface for
 * `<substrateDir>/pending-blocked.json`.
 *
 * Records the catalog-ahead schema resyncs the last live `update` run REFUSED
 * (blocked). Each entry pins the target catalog schema body (by content_hash,
 * into the object store) plus the migration chain reaching it, so the
 * `resolve-blocked` commit op can later re-validate the corrected block against
 * the SAME pinned target the run blocked on, then commit the resolution.
 *
 * Mirrors the migrations-store precedent: load + AJV-validate via
 * `validateFromFile` against the bundled pending-blocked.schema.json; whole-file
 * writes delegate to block-api's atomic `writeTypedFile` (tmp + rename) so a
 * failed write leaves the prior file byte-identical. The sidecar is REPLACED
 * wholesale each live `update` run (it is not an append-only log) — an empty set
 * removes the file rather than persisting a stale empty sidecar.
 *
 * This sidecar lives BESIDE the blocked contract (the byte-unchanged
 * schema/block/migrations.json a blocked resync guarantees) — it is an additive
 * resolution record outside that contract, not part of it.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeTypedFile } from "./block-api.js";
import { pendingBlockedPathForDir } from "./context-dir.js";
import type { DispatchContext } from "./dispatch-context.js";
import type { MigrationDecl } from "./migrations-store.js";
import { validateFromFile } from "./schema-validator.js";

/**
 * Resolve the bundled pending-blocked schema file. Mirrors
 * `bundledMigrationsSchemaPath` — schemas live one directory up from both `src/`
 * (under tsx --test) and `dist/` (after tsc).
 */
function bundledPendingBlockedSchemaPath(): string {
	const here = path.dirname(fileURLToPath(import.meta.url));
	return path.resolve(here, "..", "schemas", "pending-blocked.schema.json");
}

/**
 * Current schema_version emitted into newly-created pending-blocked.json files.
 * Tracks the `version` field of pending-blocked.schema.json itself.
 */
export const PENDING_BLOCKED_FILE_VERSION = "1.0.0";

/** One per-item validation failure carried on a `validation-failed` entry. */
export interface PendingBlockedFailure {
	itemId?: string;
	instancePath: string;
	keyword: string;
	message: string;
}

/**
 * One pending-blocked record: a catalog-ahead resync `update` refused on its
 * last live run, pinning the target catalog schema + the chain reaching it.
 */
export interface PendingBlockedEntry {
	name: string;
	from?: string;
	to?: string;
	reason: "no-migration-chain" | "validation-failed";
	target_hash: string;
	chain: MigrationDecl[];
	failures?: PendingBlockedFailure[];
	/**
	 * content_hash of the wrapped pre-marker block-file bytes (`{kind:"raw-block-bytes",
	 * block, bytes}`) stored in the object store, set when a live update inscribed
	 * git-style failure markers into the validation-blocked block file (TASK-052 /
	 * FGAP-081). Present only on marker-bearing entries; lets a consumer restore the
	 * block file to its pre-marker bytes. Omitted when no markers were written.
	 */
	premarker_hash?: string;
	blocked_at: string;
}

export interface PendingBlockedFile {
	schema_version: string;
	entries: PendingBlockedEntry[];
}

/**
 * Load + AJV-validate pending-blocked.json. Returns null when the file is absent
 * (the normal steady state — no schema is currently blocked). Throws on read /
 * parse / schema failure.
 */
export function loadPendingBlockedForDir(substrateDir: string): PendingBlockedFile | null {
	const p = pendingBlockedPathForDir(substrateDir);
	if (!fs.existsSync(p)) return null;
	let raw: string;
	try {
		raw = fs.readFileSync(p, "utf-8");
	} catch (err) {
		throw new Error(`loadPendingBlocked: failed to read ${p}: ${err instanceof Error ? err.message : String(err)}`);
	}
	let data: unknown;
	try {
		data = JSON.parse(raw);
	} catch (err) {
		throw new Error(`loadPendingBlocked: invalid JSON in ${p}: ${err instanceof Error ? err.message : String(err)}`);
	}
	validateFromFile(bundledPendingBlockedSchemaPath(), data, `pending-blocked.json (${p})`);
	return data as PendingBlockedFile;
}

/**
 * Atomic, AJV-validated whole-file write of `<substrateDir>/pending-blocked.json`
 * against the bundled pending-blocked schema. `ctx` is accepted for call-site
 * parity with the rest of the substrate write surface; the pending-blocked schema
 * declares no envelope author fields so stamping is a structural no-op today.
 */
export function writePendingBlockedForDir(substrateDir: string, file: PendingBlockedFile, ctx?: DispatchContext): void {
	writeTypedFile(
		pendingBlockedPathForDir(substrateDir),
		bundledPendingBlockedSchemaPath(),
		file,
		ctx,
		"pending-blocked.json",
	);
}

/**
 * Reconcile pending-blocked.json to the supplied entry set (the truth the
 * caller computed for THIS state). When `entries` is non-empty, write the file
 * with that set (replacing any prior set wholesale). When `entries` is empty,
 * REMOVE the file if it exists — the steady state for "nothing blocked" is no
 * sidecar, not an empty one. Idempotent in both directions.
 */
export function reconcilePendingBlockedForDir(
	substrateDir: string,
	entries: PendingBlockedEntry[],
	ctx?: DispatchContext,
): void {
	const p = pendingBlockedPathForDir(substrateDir);
	if (entries.length === 0) {
		if (fs.existsSync(p)) fs.unlinkSync(p);
		return;
	}
	writePendingBlockedForDir(substrateDir, { schema_version: PENDING_BLOCKED_FILE_VERSION, entries }, ctx);
}
