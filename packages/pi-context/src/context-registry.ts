/**
 * context-registry — project-root substrate registry read / write surface for
 * `<cwd>/.pi-context-registry.json`.
 *
 * The registry is a PROJECT-ROOT file (tracked in git, like `.pi-context.json`),
 * NOT substrate-relative: it enumerates EVERY known substrate by its immutable
 * content-addressed `substrate_id` (`^sub-[0-9a-f]{16}$`), mapping each to its
 * on-disk directory + alias list. This is the substrate-locator layer the
 * cross-substrate reference resolver consumes to resolve a foreign
 * `<substrate_id>:<oid>` / `<alias>:<refname>` locator to a directory, and the
 * surface the planned legacy-substrate registration migration registers each
 * legacy substrate into.
 *
 * Distinct from the `.pi-context.json` bootstrap pointer: the pointer names the
 * single ACTIVE substrate dir; this registry enumerates all of them. The
 * SoT-drift invariant in `validateContext` (context-sdk.ts) requires the active
 * `config.substrate_id` to have an entry here whose `dir` resolves to the active
 * substrate.
 *
 * Mirrors `migrations-store.ts` atomic discipline one-for-one:
 *   - `loadRegistry` reads + JSON-parses + AJV-validates via `validateFromFile`
 *     against the bundled `context-registry.schema.json`; returns null when the
 *     file is absent (a pre-write project with no registry is a normal state,
 *     NOT an error).
 *   - `writeRegistry` delegates whole-file writes to block-api's atomic
 *     `writeTypedFile` (tmp + rename + schema-validate), so a failed write
 *     leaves the prior file byte-identical and a malformed registry never lands.
 *   - `registerSubstrate` wraps a load-or-empty → JSON deep-clone → upsert →
 *     write pattern (idempotent: re-registering the same substrate_id with the
 *     same dir is a no-op rewrite; a changed dir/aliases overwrites the entry).
 *
 * A small per-cwd cache (keyed by absolute cwd, invalidated on mtime change and
 * proactively on write) mirrors the migrations-store cache so read-after-write
 * within a process is consistent without restart.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeTypedFile } from "./block-api.js";
import type { DispatchContext } from "./dispatch-context.js";
import { validateFromFile } from "./schema-validator.js";

/**
 * Resolve the bundled context-registry schema file. Mirrors
 * `bundledMigrationsSchemaPath` in migrations-store.ts — schemas live one
 * directory up from both `src/` (under tsx --test) and `dist/` (after tsc).
 */
function bundledRegistrySchemaPath(): string {
	const here = path.dirname(fileURLToPath(import.meta.url));
	return path.resolve(here, "..", "schemas", "context-registry.schema.json");
}

/**
 * Project-root path of the substrate registry. PROJECT-ROOT, not substrate-dir-
 * relative (contrast `migrationsPath`, which resolves through the active
 * substrate dir). The registry enumerates substrates above any single
 * substrate, so it must live at a fixed root location independent of which
 * substrate the bootstrap pointer currently names.
 */
export function contextRegistryPath(cwd: string): string {
	return path.join(cwd, ".pi-context-registry.json");
}

/**
 * One registry entry — the directory + alias list for a substrate_id. Mirrors
 * the `RegistryEntry` definition in context-registry.schema.json one-for-one.
 * `dir` is resolved against the project root (`path.resolve(cwd, dir)`) when
 * matched against the active substrate by the drift invariant.
 */
export interface RegistryEntry {
	dir: string;
	aliases: string[];
}

/**
 * On-disk registry shape. `substrates` is keyed by substrate_id
 * (`^sub-[0-9a-f]{16}$`, enforced by the schema's `propertyNames`).
 */
export interface RegistryFile {
	version: string;
	substrates: Record<string, RegistryEntry>;
}

/**
 * Current `version` emitted into newly-created `.pi-context-registry.json`
 * files. Tracks the `version` field of context-registry.schema.json itself.
 */
export const REGISTRY_FILE_VERSION = "1.0.0";

/**
 * Per-cwd cache of the loaded registry, keyed by absolute cwd. Invalidates when
 * the on-disk file mtime changes (stat-on-read comparison; no watcher).
 * `writeRegistry` proactively deletes the entry for its cwd so the next
 * `loadRegistry` reads fresh data even when mtime granularity (1s on some
 * filesystems) would otherwise mask the change. Mirrors the bootstrapCache /
 * migrations-store cache discipline.
 */
interface RegistryCacheEntry {
	file: RegistryFile;
	mtimeMs: number;
}
const registryCache = new Map<string, RegistryCacheEntry>();

/**
 * Drop the cached registry for `cwd` so the next `loadRegistry(cwd)` re-reads
 * from disk. Called internally by `writeRegistry`; exported for callers that
 * mutate the file out-of-band (e.g. tests / the orchestrator seed).
 */
export function invalidateRegistry(cwd: string): void {
	registryCache.delete(path.resolve(cwd));
}

/**
 * Load + AJV-validate the project-root registry. Returns null when the file is
 * absent (a project with no registry yet — a normal pre-write condition, NOT an
 * error). Throws on read / parse / schema failure. Caches by absolute cwd keyed
 * on file mtime.
 */
export function loadRegistry(cwd: string): RegistryFile | null {
	const p = contextRegistryPath(cwd);
	if (!fs.existsSync(p)) return null;

	const mtime = fs.statSync(p).mtimeMs;
	const key = path.resolve(cwd);
	const cached = registryCache.get(key);
	if (cached && cached.mtimeMs === mtime) {
		return cached.file;
	}

	let raw: string;
	try {
		raw = fs.readFileSync(p, "utf-8");
	} catch (err) {
		throw new Error(`loadRegistry: failed to read ${p}: ${err instanceof Error ? err.message : String(err)}`);
	}
	let data: unknown;
	try {
		data = JSON.parse(raw);
	} catch (err) {
		throw new Error(`loadRegistry: invalid JSON in ${p}: ${err instanceof Error ? err.message : String(err)}`);
	}
	validateFromFile(bundledRegistrySchemaPath(), data, `.pi-context-registry.json (${p})`);
	const file = data as RegistryFile;
	registryCache.set(key, { file, mtimeMs: mtime });
	return file;
}

/**
 * Atomic, AJV-validated whole-file write of `.pi-context-registry.json`.
 * Delegates to block-api's `writeTypedFile` against the bundled registry schema
 * (tmp + rename; a failed write leaves the prior file byte-identical). `ctx` is
 * accepted for call-site parity with the rest of the substrate write surface;
 * the registry schema declares no envelope author fields so stamping is a
 * structural no-op today. Invalidates the per-cwd cache after the write so the
 * next `loadRegistry(cwd)` reads the fresh file.
 */
export function writeRegistry(cwd: string, file: RegistryFile, ctx?: DispatchContext): void {
	writeTypedFile(contextRegistryPath(cwd), bundledRegistrySchemaPath(), file, ctx, ".pi-context-registry.json");
	invalidateRegistry(cwd);
}

/**
 * Compose an initial empty registry shape — used by `registerSubstrate` when no
 * registry exists on disk. Centralised so the `version` token is sourced from
 * one place.
 */
function emptyRegistry(): RegistryFile {
	return { version: REGISTRY_FILE_VERSION, substrates: {} };
}

/**
 * Deep-clone via JSON round-trip. Sufficient for RegistryFile shapes (no Date /
 * Map / undefined values per the schema). Matches the migrations-store
 * load-clone-mutate-write precedent.
 */
function clone<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Upsert a substrate's registry entry. Load-or-empty → clone → set
 * `substrates[substrate_id] = { dir, aliases }` → atomic write. Idempotent:
 * re-registering the same substrate_id with the same dir + aliases produces a
 * byte-identical file; a changed dir (e.g. a renamed substrate directory) or a
 * changed alias list overwrites the prior entry in place. `aliases` defaults to
 * `[]` when omitted (the substrate registry + drift invariant registers with
 * empty aliases; the planned legacy-substrate registration migration populates
 * the legacy `project:` alias).
 *
 * Does NOT validate that `substrate_id` matches `^sub-[0-9a-f]{16}$` here — the
 * schema's `propertyNames` pattern enforces that at the write boundary (an
 * out-of-shape key fails `writeTypedFile`'s AJV validation, leaving the prior
 * file intact).
 */
export function registerSubstrate(
	cwd: string,
	substrate_id: string,
	dir: string,
	aliases: string[] = [],
	ctx?: DispatchContext,
): void {
	const current = loadRegistry(cwd) ?? emptyRegistry();
	const next: RegistryFile = clone(current);
	next.substrates[substrate_id] = { dir, aliases };
	writeRegistry(cwd, next, ctx);
}

/**
 * Resolve a substrate_id to its registered directory string (as stored — i.e.
 * project-root-relative, the caller resolves against cwd when an absolute path
 * is needed). Returns null on miss (substrate_id not registered, or no registry
 * file at all) — never throws on a clean miss, mirroring the cross-substrate
 * reference resolver's expectation of a null-or-hit lookup.
 */
export function resolveSubstrateDir(cwd: string, substrate_id: string): string | null {
	const reg = loadRegistry(cwd);
	if (reg === null) return null;
	const entry = reg.substrates[substrate_id];
	return entry ? entry.dir : null;
}

/**
 * Resolve an alias to the substrate_id that declares it. Scans every entry's
 * `aliases[]` for an exact string match and returns the owning substrate_id.
 * Returns null on miss (alias unregistered, or no registry file) — never throws
 * on a clean miss. First-match wins if (by misconfiguration) two substrates
 * claim the same alias; the registry does not enforce alias uniqueness this
 * cycle.
 */
export function resolveAlias(cwd: string, alias: string): string | null {
	const reg = loadRegistry(cwd);
	if (reg === null) return null;
	for (const [substrate_id, entry] of Object.entries(reg.substrates)) {
		if (entry.aliases.includes(alias)) return substrate_id;
	}
	return null;
}
