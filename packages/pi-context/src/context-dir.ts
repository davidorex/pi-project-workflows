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
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { canonicalJson, sha256Hex } from "./content-hash.js";
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
 * Optional pointer-history fields stamped onto the bootstrap pointer by
 * `flipBootstrapPointer` (the /context switch family's mutation surface).
 * Pre-fresh-init pointers carry NONE of these; switched pointers carry ALL
 * three. The bootstrap schema declares each as optional so existing v1.0.0
 * pointers remain valid against v1.1.0 — missing optional fields resolve to
 * undefined in-process.
 *
 * `previous_contextDir` is the contextDir value the pointer held IMMEDIATELY
 * BEFORE the most-recent flip; consumed by `/context switch -` to flip back.
 *
 * `switched_at` is the ISO 8601 timestamp of the most-recent flip.
 *
 * `switched_by` is the verified terminal-operator identity stamped by auth-gate
 * on confirm; forensic attribution for the flip.
 */
export interface BootstrapPointerExtras {
	previous_contextDir?: string;
	switched_at?: string;
	switched_by?: string;
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
 *
 * Backwards-compatible signature evolution: the optional `extras` parameter
 * carries the v1.1.0 pointer-history fields. When `extras` is omitted (default,
 * existing call sites) the writer behaves identically to its v1.0.0 form —
 * pointer carries only `{contextDir, version, created_at}` and `version` stays
 * at "1.0.0". When `extras` is provided, the pointer-history fields are
 * merged in and `version` bumps to "1.1.0" so the on-disk pointer self-declares
 * the format it carries. `created_at` is FRESH on every call (this primitive
 * does not preserve created_at across writes — see `flipBootstrapPointer` for
 * the preservation contract).
 */
export function writeBootstrapPointer(cwd: string, contextDir: string, extras?: BootstrapPointerExtras): void {
	const hasExtras =
		extras !== undefined &&
		(extras.previous_contextDir !== undefined || extras.switched_at !== undefined || extras.switched_by !== undefined);

	const pointer: Record<string, string> = {
		contextDir,
		version: hasExtras ? "1.1.0" : "1.0.0",
		created_at: new Date().toISOString(),
	};

	if (extras?.previous_contextDir !== undefined) pointer.previous_contextDir = extras.previous_contextDir;
	if (extras?.switched_at !== undefined) pointer.switched_at = extras.switched_at;
	if (extras?.switched_by !== undefined) pointer.switched_by = extras.switched_by;

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
 * Flip the bootstrap pointer to a new contextDir while preserving the original
 * `created_at` timestamp and stamping pointer-history fields (previous_contextDir,
 * switched_at, switched_by). The mutation surface for `/context switch` family
 * + `context-switch` Pi tool.
 *
 * Behavior:
 * 1. Reads the existing pointer (throws BootstrapNotFoundError when absent —
 *    flipping a pointer that does not exist is a programming error; callers
 *    bootstrapping a fresh substrate use `writeBootstrapPointer` directly).
 * 2. Constructs the new pointer:
 *    - contextDir: `newContextDir` (the flip target)
 *    - version: "1.1.0" (pointer-history-bearing)
 *    - created_at: PRESERVED from the existing pointer (or stamped fresh when
 *      the existing pointer lacks created_at, which only happens for hand-
 *      authored pointers that omit the field)
 *    - previous_contextDir: the existing pointer's contextDir (so subsequent
 *      `/context switch -` can flip back)
 *    - switched_at: current ISO 8601 timestamp
 *    - switched_by: caller-supplied `writerIdentity` (auth-gate-verified
 *      terminal-operator identity at the Pi tool boundary)
 * 3. AJV-validates against the URN-registered bootstrap schema.
 * 4. Atomic tmp + rename write.
 * 5. Invalidates `bootstrapCache` for the cwd.
 *
 * Does NOT validate that `newContextDir` exists / has a config.json — that is
 * the caller's read-side check (slash command handler + Pi tool body each
 * perform target-dir-shape validation appropriate to their mode).
 */
export function flipBootstrapPointer(cwd: string, newContextDir: string, writerIdentity: string): void {
	const bootstrapPath = path.join(cwd, ".pi-context.json");
	if (!fs.existsSync(bootstrapPath)) {
		throw new BootstrapNotFoundError(cwd, bootstrapPath);
	}

	let existingRaw: string;
	try {
		existingRaw = fs.readFileSync(bootstrapPath, "utf-8");
	} catch (err) {
		throw new Error(
			`flipBootstrapPointer: failed to read existing ${bootstrapPath}: ${err instanceof Error ? err.message : String(err)}`,
		);
	}
	let existing: Record<string, unknown>;
	try {
		existing = JSON.parse(existingRaw) as Record<string, unknown>;
	} catch (err) {
		throw new Error(
			`flipBootstrapPointer: invalid JSON in existing ${bootstrapPath}: ${err instanceof Error ? err.message : String(err)}`,
		);
	}

	const previousContextDir = existing.contextDir as string | undefined;
	if (typeof previousContextDir !== "string") {
		throw new Error(
			`flipBootstrapPointer: existing pointer at ${bootstrapPath} lacks a string contextDir; refuses to flip an unreadable pointer`,
		);
	}

	const preservedCreatedAt =
		typeof existing.created_at === "string" ? (existing.created_at as string) : new Date().toISOString();

	const pointer: Record<string, string> = {
		contextDir: newContextDir,
		version: "1.1.0",
		created_at: preservedCreatedAt,
		previous_contextDir: previousContextDir,
		switched_at: new Date().toISOString(),
		switched_by: writerIdentity,
	};

	validate(BOOTSTRAP_REF_SCHEMA, pointer, `bootstrap pointer (flipBootstrapPointer for ${cwd})`);

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
		throw new Error(`flipBootstrapPointer: failed to write ${bootstrapPath}: ${msg}`);
	}

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

/**
 * Dir-targeted form of `schemaPath`: build the schema path against an
 * explicit substrate directory rather than resolving one from `cwd`.
 * `assertSubstrateName` still guards the block name (path-injection guard
 * preserved). Cross-substrate consumers (Cycle F resolver / Cycle H
 * migration) target a non-active substrate by passing its directory here.
 */
export function schemaPathForDir(substrateDir: string, blockName: string): string {
	assertSubstrateName(blockName);
	return path.join(substrateDir, SCHEMAS_DIR, `${blockName}.schema.json`);
}

export function schemaPath(cwd: string, blockName: string): string {
	// Assert the name BEFORE resolving the substrate dir so the FGAP-079
	// path-traversal guard fires ahead of BootstrapNotFoundError (a traversal
	// name must reject even when no `.pi-context.json` pointer exists). The
	// ForDir body asserts again — harmless double-assert; the boundary guard
	// is the point.
	assertSubstrateName(blockName);
	return schemaPathForDir(resolveContextDir(cwd), blockName);
}

export function agentsDir(cwd: string): string {
	return path.join(resolveContextDir(cwd), "agents");
}

export function contextTemplatesDir(cwd: string): string {
	return path.join(resolveContextDir(cwd), "templates");
}

/**
 * `<resolveContextDir(cwd)>/migrations.json` — substrate-managed file holding
 * operator-authored schema version migration declarations. Singleton file per
 * cwd (no per-name guard); see `migrations-store.ts` for read / write helpers
 * and `migration-registry-loader.ts` for the loader that converts declarations
 * into a populated MigrationRegistry. Mirrors the relationsPath / configPath
 * shape: pointer-resolved, substrate-dir-relative, no fallback default.
 */
/**
 * Dir-targeted form of `migrationsPath`: build the `migrations.json` path
 * against an explicit substrate directory rather than resolving one from
 * `cwd`. Used by the ForDir migration-registry loader so a write into a
 * non-active substrate validates/migrates against THAT substrate's
 * declarations.
 */
export function migrationsPathForDir(substrateDir: string): string {
	return path.join(substrateDir, "migrations.json");
}

export function migrationsPath(cwd: string): string {
	return migrationsPathForDir(resolveContextDir(cwd));
}

// ── Substrate identity (content-addressed substrate identity, Cycle 3) ────────

/**
 * `^sub-[0-9a-f]{16}$` — the substrate_id shape. A substrate_id is the per-
 * substrate root identity that `mintOid` (block-api.ts) salts an item OID with,
 * so two substrates minting an item with the same birth nonce still produce
 * distinct OIDs. Single source of truth for the on-disk `config.substrate_id`
 * regex (mirrored as a literal `pattern` in config.schema.json — the two must
 * not drift).
 */
export const SUBSTRATE_ID_PATTERN = /^sub-[0-9a-f]{16}$/;

/**
 * Mint a fresh substrate_id: `"sub-" + sha256Hex(canonicalJson([Date.now(),
 * randomUUID()])).slice(0, 16)`. The `[epoch-ms, uuid]` tuple makes the pre-
 * image collision-free in practice (the uuid alone suffices; the timestamp is
 * a readability/ordering aid in the pre-image only, never surfaced). The
 * 16-hex-char slice keeps the id compact while leaving 64 bits of entropy —
 * far beyond the substrate-count regime. Minted ONCE per substrate (at
 * /context init in Cycle 4; established by hand for the active substrate +
 * packaged samples this cycle) and then immutable on disk; never re-minted on
 * an item write.
 */
export function mintSubstrateId(): string {
	return `sub-${sha256Hex(canonicalJson([Date.now(), randomUUID()])).slice(0, 16)}`;
}

/**
 * Read the `substrate_id` from `<substrateDir>/config.json`. Throws loudly when
 * the config is absent / unreadable / lacks a `substrate_id` — there is NO
 * degraded fallback and NO lazy mint-on-read (locked decision 2): a substrate
 * that participates in identity stamping must carry an explicit substrate_id,
 * established when its identity-declaring schemas were established. The
 * schema-gate on `prepareItemIdentityForWrite` (block-api.ts) and this throw
 * align by construction — stamping only fires for substrates whose schemas
 * declare the identity fields, which are exactly the substrates given a
 * substrate_id — so the throw is a loud guard against a mis-provisioned
 * substrate, not an expected runtime branch.
 */
export function substrateIdForDir(substrateDir: string): string {
	const configPath = path.join(substrateDir, "config.json");
	if (!fs.existsSync(configPath)) {
		throw new Error(
			`substrateIdForDir: no config.json at ${configPath}; a substrate that stamps identity must carry an explicit substrate_id (no lazy mint on write)`,
		);
	}
	let raw: string;
	try {
		raw = fs.readFileSync(configPath, "utf-8");
	} catch (err) {
		throw new Error(
			`substrateIdForDir: failed to read ${configPath}: ${err instanceof Error ? err.message : String(err)}`,
		);
	}
	let data: unknown;
	try {
		data = JSON.parse(raw);
	} catch (err) {
		throw new Error(
			`substrateIdForDir: invalid JSON in ${configPath}: ${err instanceof Error ? err.message : String(err)}`,
		);
	}
	const substrateId = data && typeof data === "object" ? (data as Record<string, unknown>).substrate_id : undefined;
	if (typeof substrateId !== "string" || !SUBSTRATE_ID_PATTERN.test(substrateId)) {
		throw new Error(
			`substrateIdForDir: config.json at ${configPath} has no valid substrate_id (expected ^sub-[0-9a-f]{16}$, got ${JSON.stringify(substrateId)}); establish one before stamping identity`,
		);
	}
	return substrateId;
}

/**
 * Non-throwing companion of {@link substrateIdForDir}: return the substrate's
 * established `substrate_id` (matching `SUBSTRATE_ID_PATTERN`) or `undefined`
 * when the substrate is PRE-IDENTITY — config absent / unreadable / not JSON /
 * carrying no valid `substrate_id`. This is the deliberate-pre-identity probe
 * (mirroring `reconcileActiveSubstrateRegistration`'s "no substrate_id → skip"
 * branch in context.ts): callers that must DISTINGUISH a deliberately
 * pre-identity substrate from a mis-provisioned one branch on this instead of
 * catching the `substrateIdForDir` throw. It does NOT mint and does NOT mutate
 * config — a pre-identity substrate stays pre-identity until identity is
 * established by the normal path.
 */
export function tryReadSubstrateIdForDir(substrateDir: string): string | undefined {
	const configPath = path.join(substrateDir, "config.json");
	if (!fs.existsSync(configPath)) return undefined;
	let data: unknown;
	try {
		data = JSON.parse(fs.readFileSync(configPath, "utf-8"));
	} catch {
		return undefined;
	}
	const substrateId = data && typeof data === "object" ? (data as Record<string, unknown>).substrate_id : undefined;
	return typeof substrateId === "string" && SUBSTRATE_ID_PATTERN.test(substrateId) ? substrateId : undefined;
}

/**
 * `substrateIdForDir(resolveContextDir(cwd))` — the cwd-resolved form for
 * callers holding a working directory rather than an explicit substrate dir.
 */
export function substrateIdFor(cwd: string): string {
	return substrateIdForDir(resolveContextDir(cwd));
}
