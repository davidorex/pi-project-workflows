/**
 * pi-context substrate-dir resolution surface.
 *
 * Per DEC-0015 (config drives substrate location, permanently): NO hardcoded
 * substrate-dir paths anywhere in pi-context / pi-jit-agents / pi-workflows /
 * pi-behavior-monitors. The substrate dir name is declared per-cwd in the
 * `.pi-context.json` bootstrap pointer; `resolveContextDir(cwd)` reads that
 * pointer, AJV-validates it against the URN-registered bootstrap schema, and
 * returns the absolute path of the substrate dir.
 *
 * Hard-throw policy on absent pointer (no graceful fallback to ".project"):
 * a default would be hardcode-dressed-as-default, which DEC-0015 explicitly
 * rejects. Callers needing to bootstrap a fresh repo write the pointer first
 * via `writeBootstrapPointer(cwd, contextDir)` before any path-builder is
 * invoked; `contextDir` is a required parameter chosen by the caller per
 * DEC-0015.
 *
 * Path-builders (schemasDir / schemaPath / agentsDir / contextTemplatesDir)
 * all cascade through `resolveContextDir(cwd)` so the literal substrate-dir
 * name lives exactly nowhere in pi-context source after Phase 1.2 of FGAP-026
 * closure lands.
 *
 * The `SCHEMAS_DIR` export is retained as `@deprecated` for transitional
 * cross-package compat (pi-workflows: workflow-sdk.ts, step-block.ts,
 * workflow-executor.ts still import it as a bare segment); Phase 7 of
 * FGAP-026 closure cascades those sites and removes the export.
 */
import fs from "node:fs";
import path from "node:path";
import { validate } from "./schema-validator.js";

/** @deprecated Same status as the removed PROJECT_DIR — Phase 7 cascade target. */
export const SCHEMAS_DIR = "schemas";

/**
 * Thrown by `resolveContextDir(cwd)` when no `.pi-context.json` bootstrap
 * pointer exists at the cwd. Carries `cwd` and `bootstrapPath` fields so
 * callers can surface the absent-pointer site in error messages without
 * re-deriving the path. Per DEC-0015 hard-throw policy — there is no
 * fallback default; callers must materialize the pointer (via
 * `writeBootstrapPointer`) before any substrate operation.
 */
export class BootstrapNotFoundError extends Error {
	readonly cwd: string;
	readonly bootstrapPath: string;
	constructor(cwd: string, bootstrapPath: string) {
		super(
			`pi-context: no .pi-context.json bootstrap pointer at ${bootstrapPath}; run /context init <substrate-dir> to declare substrate dir per DEC-0015`,
		);
		this.name = "BootstrapNotFoundError";
		this.cwd = cwd;
		this.bootstrapPath = bootstrapPath;
	}
}

/**
 * Per-cwd cache of resolved bootstrap pointers, keyed by absolute cwd.
 * Invalidates when the on-disk pointer mtime changes (tracked here, NOT via
 * an mtime watcher — every `resolveContextDir(cwd)` call stats the pointer
 * file and compares against `bootstrapMtimeMs`). `writeBootstrapPointer`
 * proactively deletes the entry for its cwd so the next resolver call reads
 * fresh data even if mtime granularity (1s on some filesystems) would
 * otherwise mask the change.
 */
interface BootstrapCacheEntry {
	contextDir: string;
	bootstrapMtimeMs: number;
}
const bootstrapCache = new Map<string, BootstrapCacheEntry>();

/**
 * URN-anchored validation shape for the bootstrap pointer. The bootstrap
 * schema is pre-registered into the shared AJV instance at
 * `schema-validator.ts` module init under `pi-context://schemas/bootstrap`,
 * so this `$ref` resolves synchronously without re-reading the schema file.
 * Carrying it as a module-level constant avoids reconstructing on every
 * resolve.
 */
const BOOTSTRAP_REF_SCHEMA: Record<string, unknown> = {
	$ref: "pi-context://schemas/bootstrap",
};

/**
 * Resolve the substrate dir for a given cwd. Reads the
 * `<cwd>/.pi-context.json` bootstrap pointer, AJV-validates the parsed
 * pointer object against the URN-registered bootstrap schema (FGAP-026
 * phase 1.1 schema), caches the resolution by absolute cwd keyed on
 * pointer mtime, and returns `path.join(cwd, contextDir)` as an absolute
 * path (subject to whatever cwd the caller passed).
 *
 * Hard-throws `BootstrapNotFoundError` when the pointer file is absent —
 * no fallback to `.project`. Per DEC-0015 the substrate dir name is
 * config-driven; defaulting would be hardcode-dressed-as-default. Callers
 * bootstrapping a fresh repo write the pointer first via
 * `writeBootstrapPointer(cwd, contextDir)` before any path-builder runs.
 *
 * Throws plain `Error` with file-context message on read/parse failure
 * (mirrors `loadConfig` at context.ts:188-196). Throws
 * `ValidationError` (re-raised from canonical `validate()`) when the
 * pointer fails AJV validation against the bootstrap schema.
 */
export function resolveContextDir(cwd: string): string {
	const bootstrapPath = path.join(cwd, ".pi-context.json");
	if (!fs.existsSync(bootstrapPath)) {
		throw new BootstrapNotFoundError(cwd, bootstrapPath);
	}

	const mtime = fs.statSync(bootstrapPath).mtimeMs;
	const key = path.resolve(cwd);
	const cached = bootstrapCache.get(key);
	if (cached && cached.bootstrapMtimeMs === mtime) {
		return path.join(cwd, cached.contextDir);
	}

	let raw: string;
	try {
		raw = fs.readFileSync(bootstrapPath, "utf-8");
	} catch (err) {
		throw new Error(
			`resolveContextDir: failed to read ${bootstrapPath}: ${err instanceof Error ? err.message : String(err)}`,
		);
	}
	let data: unknown;
	try {
		data = JSON.parse(raw);
	} catch (err) {
		throw new Error(
			`resolveContextDir: invalid JSON in ${bootstrapPath}: ${err instanceof Error ? err.message : String(err)}`,
		);
	}

	// AJV-validate via the canonical `validate()` surface against the
	// URN-registered bootstrap schema (`pi-context://schemas/bootstrap`,
	// pre-registered in schema-validator.ts at module init). No parallel
	// AJV instance per the rebuild-arc discipline.
	validate(BOOTSTRAP_REF_SCHEMA, data, `bootstrap pointer (${bootstrapPath})`);

	const contextDir = (data as { contextDir: string }).contextDir;
	bootstrapCache.set(key, { contextDir, bootstrapMtimeMs: mtime });
	return path.join(cwd, contextDir);
}

/**
 * Non-throwing variant of `resolveContextDir` for READ / CLASSIFY / SNAPSHOT
 * consumers that must degrade gracefully when no `.pi-context.json` bootstrap
 * pointer exists (DEC-0015) rather than hard-throwing `BootstrapNotFoundError`.
 *
 * Returns the resolved substrate dir when the pointer is present (identical to
 * `resolveContextDir`); returns `null` only on the absent-pointer
 * `BootstrapNotFoundError` branch. Re-throws every other error — a malformed
 * pointer / read failure is NOT degradation and must still surface (the
 * pointer-present error semantics of `resolveContextDir` are preserved).
 *
 * Name-based catch per FGAP-080 (instanceof is unreliable across module-instance
 * boundaries under tsx/dist dual-load).
 */
export function tryResolveContextDir(cwd: string): string | null {
	try {
		return resolveContextDir(cwd);
	} catch (err) {
		if (err instanceof Error && err.name === "BootstrapNotFoundError") return null;
		throw err;
	}
}

/**
 * Atomically write a `.pi-context.json` bootstrap pointer at `<cwd>/.pi-context.json`.
 * `contextDir` is a required parameter chosen by the caller per DEC-0015 —
 * no default, no transitional bridge.
 *
 * Pre-validates the pointer object against the URN-registered bootstrap
 * schema BEFORE write so a malformed pointer never lands on disk. Atomic
 * write via tmp + rename mirrors `writeTypedFile` in block-api.ts:407-422
 * (process-pid-suffixed tmp path; cleanup on error). Invalidates the
 * `bootstrapCache` entry for this cwd so the next `resolveContextDir(cwd)`
 * call reads fresh data even if mtime granularity (1s on some filesystems)
 * would otherwise mask the change.
 */
export function writeBootstrapPointer(cwd: string, contextDir: string): void {
	const pointer = {
		contextDir,
		version: "1.0.0",
		created_at: new Date().toISOString(),
	};

	// Validate before write — AJV via canonical `validate()` against
	// pre-registered bootstrap schema URN.
	validate(BOOTSTRAP_REF_SCHEMA, pointer, `bootstrap pointer (writeBootstrapPointer for ${cwd})`);

	const bootstrapPath = path.join(cwd, ".pi-context.json");
	fs.mkdirSync(path.dirname(bootstrapPath), { recursive: true });

	const tmpPath = `${bootstrapPath}.bootstrap-${process.pid}.tmp`;
	try {
		fs.writeFileSync(tmpPath, JSON.stringify(pointer, null, 2), "utf-8");
		fs.renameSync(tmpPath, bootstrapPath);
	} catch (err) {
		try {
			fs.unlinkSync(tmpPath);
		} catch {
			/* ignore cleanup failure */
		}
		const msg = err instanceof Error ? err.message : String(err);
		throw new Error(`writeBootstrapPointer: failed to write ${bootstrapPath}: ${msg}`);
	}

	// Invalidate cache for this cwd so next resolveContextDir picks up the
	// fresh pointer regardless of mtime-granularity edge cases.
	bootstrapCache.delete(path.resolve(cwd));
}

/**
 * Reject substrate names that are not bare path segments (FGAP-079 / DEC-0045).
 *
 * Every name→path builder below (and in block-api / context /
 * schema-write) interpolates a raw `name` into a substrate-relative file path
 * (`${name}.schema.json`, `${name}.json`). A name containing a path separator
 * (`/`, `\`), a `..` traversal segment, a `.` (`x.schema`), or an absolute
 * prefix would escape the substrate dir. This validator constrains names to the
 * block_kind canonical_id alphabet (`[A-Za-z0-9_-]+`) — which has no separators,
 * dots, or empty form — so a traversal name throws BEFORE any path resolution.
 *
 * Guards BOTH read and write sides (the resolver unification of DEC-0045 routes
 * `schemaWritePath` through `schemaPath`, so guarding here covers writes too).
 * Now reachable from the in-pi tool surface — the write-schema tool (FGAP-077)
 * exposes the schema name directly to in-pi agents.
 */
export function assertSubstrateName(name: string): void {
	if (!/^[A-Za-z0-9_-]+$/.test(name)) {
		throw new Error(
			`Invalid substrate name '${name}': only letters, digits, '-', '_' are allowed (no path separators or '..').`,
		);
	}
}

/**
 * Canonical path-builder helpers for the substrate directory (config-driven
 * via `resolveContextDir(cwd)` per DEC-0015). Every site that previously
 * hand-built `path.join(cwd, ".project", ...)` now routes through these so
 * the substrate-dir name is read from the bootstrap pointer rather than
 * hardcoded.
 */
export function schemasDir(cwd: string): string {
	return path.join(resolveContextDir(cwd), SCHEMAS_DIR);
}

export function schemaPath(cwd: string, blockName: string): string {
	assertSubstrateName(blockName);
	return path.join(resolveContextDir(cwd), SCHEMAS_DIR, `${blockName}.schema.json`);
}

export function agentsDir(cwd: string): string {
	return path.join(resolveContextDir(cwd), "agents");
}

export function contextTemplatesDir(cwd: string): string {
	return path.join(resolveContextDir(cwd), "templates");
}
