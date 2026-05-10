/**
 * Substrate-dir resolution + canonical path-builder helpers.
 *
 * Per DEC-0015 (config drives substrate location, permanent canon), no
 * hardcoded substrate-dir paths anywhere in pi-context production source.
 * `resolveContextDir(cwd)` is the single source of truth: it reads the
 * per-cwd `<cwd>/.pi-context.json` bootstrap pointer (validated against
 * the framework `bootstrap` schema) and returns the absolute substrate
 * directory path. Every internal pi-context site that previously
 * concatenated `cwd + ".project"` now routes through this resolver via
 * the path-builder helpers below (`projectDir`, `schemasDir`,
 * `schemaPath`, `agentsDir`, `projectTemplatesDir`).
 *
 * `PROJECT_DIR` and `SCHEMAS_DIR` remain exported as `@deprecated` aliases
 * for cross-package legacy callers (pi-workflows still imports them at
 * three sites: `workflow-sdk.ts`, `step-block.ts`, `workflow-executor.ts`).
 * Phase 7 of the FGAP-026 closure plan cascades those callers and removes
 * these exports; until then they retain bare-segment-string semantics so
 * the legacy hand-built `path.join(cwd, PROJECT_DIR, …)` shape continues
 * to compile + return the same path as the resolver-aware shape (because
 * this repo's bootstrap pointer declares `contextDir: ".project"`).
 */

import fs from "node:fs";
import path from "node:path";
import { validate } from "./schema-validator.js";

/**
 * @deprecated Use `resolveContextDir(cwd)` — substrate dir is config-driven
 * per DEC-0015. Retained as bare-segment string for cross-package legacy
 * callers (pi-workflows: workflow-sdk.ts, step-block.ts, workflow-executor.ts);
 * Phase 7 of FGAP-026 closure cascades those sites and removes this export.
 */
export const PROJECT_DIR = ".project";

/** @deprecated Same status as PROJECT_DIR — Phase 7 cascade target. */
export const SCHEMAS_DIR = "schemas";

/**
 * Thrown by `resolveContextDir` when the per-cwd bootstrap pointer
 * (`<cwd>/.pi-context.json`) is absent. Carries `cwd` and `bootstrapPath`
 * for forensic surface — callers can render a remediation hint without
 * re-deriving the path.
 */
export class BootstrapNotFoundError extends Error {
	readonly cwd: string;
	readonly bootstrapPath: string;
	constructor(cwd: string, bootstrapPath: string) {
		super(
			`pi-context: no .pi-context.json bootstrap pointer at ${bootstrapPath}; run /context init to declare substrate dir per DEC-0015`,
		);
		this.name = "BootstrapNotFoundError";
		this.cwd = cwd;
		this.bootstrapPath = bootstrapPath;
	}
}

interface BootstrapCacheEntry {
	contextDir: string;
	bootstrapMtimeMs: number;
}

/**
 * Per-cwd cache for the parsed bootstrap pointer. Keyed by absolute cwd;
 * invalidated on bootstrap-pointer mtime change. Mirrors the mtime-cache
 * shape used by `getProjectContext` so `/context migrate` (Phase 10) can
 * rewrite the pointer atomically and have all subsequent resolution see
 * the new substrate dir.
 */
const bootstrapCache = new Map<string, BootstrapCacheEntry>();

function bootstrapPointerPath(cwd: string): string {
	return path.join(cwd, ".pi-context.json");
}

// Lazy import shape: `validate` reaches into the schema-validator module-init
// AJV instance which pre-registers the `bootstrap` framework schema by URN
// (`pi-context://schemas/bootstrap`). Passing `{$ref: …}` is the canonical
// lookup shape for any URN-registered framework schema and matches the
// pattern used by `loadConfig` / `loadRelations` callers.
const BOOTSTRAP_SCHEMA_REF = { $ref: "pi-context://schemas/bootstrap" } as const;

/**
 * Resolve the substrate directory for `cwd`. Reads the per-cwd
 * `<cwd>/.pi-context.json` bootstrap pointer, AJV-validates against the
 * framework `bootstrap` schema, and returns the absolute substrate path
 * (`path.join(cwd, parsed.contextDir)`).
 *
 * Throws `BootstrapNotFoundError` when the pointer is absent.
 * Throws `Error` (with file context) on read / parse failure.
 * Throws `ValidationError` (from schema-validator) on schema failure
 * (e.g. wrong field type, missing required `contextDir`).
 *
 * Cached per absolute cwd; cache invalidates when the pointer's mtime
 * changes. Direct cache flush is not exposed — tests that need a fresh
 * read should rewrite the pointer (mtime change triggers reload).
 */
export function resolveContextDir(cwd: string): string {
	const absCwd = path.resolve(cwd);
	const bootstrapPath = bootstrapPointerPath(absCwd);

	if (!fs.existsSync(bootstrapPath)) {
		throw new BootstrapNotFoundError(absCwd, bootstrapPath);
	}

	const stat = fs.statSync(bootstrapPath);
	const cached = bootstrapCache.get(absCwd);
	if (cached && cached.bootstrapMtimeMs === stat.mtimeMs) {
		return path.join(absCwd, cached.contextDir);
	}

	let raw: string;
	try {
		raw = fs.readFileSync(bootstrapPath, "utf-8");
	} catch (err) {
		throw new Error(
			`resolveContextDir: failed to read ${bootstrapPath}: ${err instanceof Error ? err.message : String(err)}`,
		);
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (err) {
		throw new Error(
			`resolveContextDir: invalid JSON in ${bootstrapPath}: ${err instanceof Error ? err.message : String(err)}`,
		);
	}

	// Route through the canonical `validate()` surface — single AJV instance
	// per the issue-069 discipline (no parallel ungated paths). The `$ref`
	// resolves through the URN pre-registration in schema-validator.ts.
	validate(BOOTSTRAP_SCHEMA_REF as unknown as Record<string, unknown>, parsed, `bootstrap pointer (${bootstrapPath})`);

	const { contextDir } = parsed as { contextDir: string };
	bootstrapCache.set(absCwd, { contextDir, bootstrapMtimeMs: stat.mtimeMs });
	return path.join(absCwd, contextDir);
}

/**
 * Convenience helper for test fixtures + future `/context init`. Writes a
 * bootstrap pointer at `<cwd>/.pi-context.json` carrying `{contextDir,
 * version: "1.0.0", created_at: <ISO timestamp>}`. AJV-validates the
 * constructed object against the bootstrap schema before write — same
 * gate production callers will hit. Atomic on-disk semantics via
 * tmp + rename matching the rest of pi-context.
 *
 * NOT registered as a tool in this sub-phase — Phase 6 surfaces the
 * `/context init` ceremony with prompt-required dirName per DEC-0015
 * (defaulting reintroduces hardcode-dressed-as-default the DEC rejects).
 */
export function writeBootstrapPointer(cwd: string, contextDir = ".project"): void {
	const absCwd = path.resolve(cwd);
	const bootstrapPath = bootstrapPointerPath(absCwd);
	const payload = {
		contextDir,
		version: "1.0.0",
		created_at: new Date().toISOString(),
	};
	validate(BOOTSTRAP_SCHEMA_REF as unknown as Record<string, unknown>, payload, `bootstrap pointer (${bootstrapPath})`);
	const tmpPath = `${bootstrapPath}.bootstrap-${process.pid}.tmp`;
	try {
		fs.writeFileSync(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
		fs.renameSync(tmpPath, bootstrapPath);
	} catch (err) {
		try {
			fs.unlinkSync(tmpPath);
		} catch {
			/* best-effort cleanup */
		}
		throw new Error(
			`writeBootstrapPointer: failed to write ${bootstrapPath}: ${err instanceof Error ? err.message : String(err)}`,
		);
	}
	// Invalidate cache so an immediate resolveContextDir picks up the new
	// pointer even on filesystems where mtime has 1-second resolution and
	// a write+resolve in the same second would otherwise hit the cache.
	bootstrapCache.delete(absCwd);
}

/**
 * Canonical path-builder helpers — every previously hand-built
 * `path.join(cwd, ".project", …)` site now routes through these so the
 * substrate-dir literal exists exactly once (inside `resolveContextDir`).
 */
export function projectDir(cwd: string): string {
	return resolveContextDir(cwd);
}

export function schemasDir(cwd: string): string {
	return path.join(resolveContextDir(cwd), SCHEMAS_DIR);
}

export function schemaPath(cwd: string, blockName: string): string {
	return path.join(resolveContextDir(cwd), SCHEMAS_DIR, `${blockName}.schema.json`);
}

export function agentsDir(cwd: string): string {
	return path.join(resolveContextDir(cwd), "agents");
}

export function projectTemplatesDir(cwd: string): string {
	return path.join(resolveContextDir(cwd), "templates");
}
