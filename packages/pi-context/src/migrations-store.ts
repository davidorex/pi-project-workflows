/**
 * migrations-store — substrate-managed read / write surface for
 * `<resolveContextDir(cwd)>/migrations.json`.
 *
 * Mirrors the config / relations precedent in context.ts: load + AJV-validate
 * via `validateFromFile` against the bundled migrations.schema.json; whole-file
 * writes delegate to block-api's atomic `writeTypedFile` (tmp + rename) so a
 * failed write leaves the prior file byte-identical.
 *
 * Three op-correct mutation helpers — append / replace / remove — wrap a
 * load → JSON deep-clone → mutate → write pattern. Identity of a MigrationDecl
 * is the (schemaName, fromVersion) pair, mirroring the registry's
 * one-outgoing-edge-per-(schemaName, fromVersion) discipline from
 * `schema-migrations.ts`:
 *   - appendMigrationDecl requires the (schemaName, fromVersion) pair to be
 *     ABSENT; collision throws with a descriptive message so an unintended
 *     double-declaration surfaces at the write site rather than as silent
 *     registry duplicate-registration at load time.
 *   - replaceMigrationDecl requires the pair to be PRESENT; a missing target
 *     throws (use append to introduce a new declaration).
 *   - removeMigrationDecl requires the pair to be PRESENT; a missing target
 *     throws.
 *
 * After each successful mutation the helper invokes
 * `invalidateMigrationRegistry(cwd)` (migration-registry-loader.ts) so the
 * next `getProjectMigrationRegistry(cwd)` consumer reads the fresh
 * declarations without process restart. The store↔loader edge is mutually
 * cyclic (loader reads from store; store writes invalidate loader cache);
 * ESM tolerates the cycle because both imports are function-level uses, not
 * top-level evaluations.
 *
 * MigrationDecl + TransformSpec + TransformOp types mirror the on-disk schema
 * shape one-for-one. They live here (rather than schema-migrations.ts) because
 * schema-migrations.ts is the in-memory registry abstraction (knows nothing of
 * persistence); the persisted-shape vocabulary belongs at the substrate-store
 * boundary.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeTypedFile } from "./block-api.js";
import { migrationsPath, migrationsPathForDir, resolveContextDir } from "./context-dir.js";
import type { DispatchContext } from "./dispatch-context.js";
import { invalidateMigrationRegistry } from "./migration-registry-loader.js";
import { validateFromFile } from "./schema-validator.js";

/**
 * Resolve the bundled migrations schema file. Mirrors the private
 * `bundledSchemaPath` helper in context.ts — schemas live one directory up
 * from both `src/` (under tsx --test) and `dist/` (after tsc).
 */
function bundledMigrationsSchemaPath(): string {
	const here = path.dirname(fileURLToPath(import.meta.url));
	return path.resolve(here, "..", "schemas", "migrations.schema.json");
}

/**
 * One TransformOp variant — discriminated by the `op` field. Mirrors the
 * `definitions/TransformOp` `oneOf` in migrations.schema.json. Keeping the
 * variants in TypeScript lets the loader's `migrationFnFor` switch on the
 * discriminator with type-narrowing rather than blind property access.
 */
export type TransformOp =
	| { op: "rename"; from: string; to: string }
	| { op: "set"; path: string; value?: unknown }
	| { op: "delete"; path: string }
	| { op: "coerce"; path: string; type: "string" | "number" | "boolean" | "array" | "object" };

export interface TransformSpec {
	operations: TransformOp[];
}

export interface MigrationDecl {
	schemaName: string;
	fromVersion: string;
	toVersion: string;
	kind: "identity" | "declarative-transform";
	transform?: TransformSpec;
	created_by: string;
	created_at: string;
}

export interface MigrationsFile {
	schema_version: string;
	migrations: MigrationDecl[];
}

/**
 * Current schema_version emitted into newly-created migrations.json files.
 * Tracks the `version` field of migrations.schema.json itself.
 */
export const MIGRATIONS_FILE_VERSION = "1.0.0";

/**
 * Load + AJV-validate migrations.json. Returns null when the file is absent
 * (pre-write state is a normal condition, NOT an error — empty/missing yields
 * an empty registry in the loader). Throws on read / parse / schema failure.
 */
export function loadMigrationsFileForDir(substrateDir: string): MigrationsFile | null {
	const p = migrationsPathForDir(substrateDir);
	if (!fs.existsSync(p)) return null;
	let raw: string;
	try {
		raw = fs.readFileSync(p, "utf-8");
	} catch (err) {
		throw new Error(`loadMigrationsFile: failed to read ${p}: ${err instanceof Error ? err.message : String(err)}`);
	}
	let data: unknown;
	try {
		data = JSON.parse(raw);
	} catch (err) {
		throw new Error(`loadMigrationsFile: invalid JSON in ${p}: ${err instanceof Error ? err.message : String(err)}`);
	}
	validateFromFile(bundledMigrationsSchemaPath(), data, `migrations.json (${p})`);
	return data as MigrationsFile;
}

export function loadMigrationsFile(cwd: string): MigrationsFile | null {
	return loadMigrationsFileForDir(resolveContextDir(cwd));
}

/**
 * Atomic, AJV-validated whole-file write of migrations.json. Delegates to
 * block-api's writeTypedFile against the bundled migrations schema. `ctx` is
 * accepted for call-site parity with the rest of the substrate write surface;
 * the migrations schema declares no envelope author fields so stamping is a
 * structural no-op today (the loader-cache invalidation upstream of this call
 * is the side-effect that matters for read-after-write parity).
 */
export function writeMigrationsFile(cwd: string, file: MigrationsFile, ctx?: DispatchContext): void {
	writeTypedFile(migrationsPath(cwd), bundledMigrationsSchemaPath(), file, ctx, "migrations.json");
}

/**
 * Compose an initial empty migrations file shape — used by the append helper
 * when the on-disk file is absent. Centralised so the `schema_version` token
 * is sourced from one place.
 */
function emptyMigrationsFile(): MigrationsFile {
	return { schema_version: MIGRATIONS_FILE_VERSION, migrations: [] };
}

/**
 * Deep-clone via JSON round-trip. Sufficient for MigrationDecl shapes (no
 * Date / Map / undefined values per the schema). Matches the amend-config
 * load-clone-mutate-write precedent.
 */
function clone<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Locate the index of a (schemaName, fromVersion) MigrationDecl within the
 * file's `migrations[]` array; returns -1 when absent. Centralised so the
 * three op-correct helpers cannot drift on identity-matching semantics.
 */
function findMigrationIndex(file: MigrationsFile, schemaName: string, fromVersion: string): number {
	return file.migrations.findIndex((m) => m.schemaName === schemaName && m.fromVersion === fromVersion);
}

/**
 * Append a new MigrationDecl to the substrate. Op-correctness: the
 * (schemaName, fromVersion) pair must be ABSENT on-disk; collision throws.
 * Invalidates the loader cache for `cwd` after a successful write so the
 * next registry consumer reads the fresh declaration.
 */
export function appendMigrationDecl(cwd: string, decl: MigrationDecl, ctx?: DispatchContext): void {
	const current = loadMigrationsFile(cwd) ?? emptyMigrationsFile();
	const idx = findMigrationIndex(current, decl.schemaName, decl.fromVersion);
	if (idx >= 0) {
		throw new Error(
			`appendMigrationDecl: collision — migration for schema '${decl.schemaName}' fromVersion '${decl.fromVersion}' already exists; use replaceMigrationDecl to overwrite`,
		);
	}
	const next: MigrationsFile = clone(current);
	next.migrations.push(decl);
	writeMigrationsFile(cwd, next, ctx);
	invalidateMigrationRegistry(cwd);
}

/**
 * Replace an existing MigrationDecl identified by (schemaName, fromVersion).
 * Op-correctness: target must be PRESENT; missing target throws. The whole
 * decl is replaced (no per-field merge). Invalidates the loader cache after a
 * successful write.
 */
export function replaceMigrationDecl(cwd: string, decl: MigrationDecl, ctx?: DispatchContext): void {
	const current = loadMigrationsFile(cwd);
	if (current === null) {
		throw new Error(
			`replaceMigrationDecl: migrations.json absent at ${migrationsPath(cwd)}; use appendMigrationDecl to create`,
		);
	}
	const idx = findMigrationIndex(current, decl.schemaName, decl.fromVersion);
	if (idx < 0) {
		throw new Error(
			`replaceMigrationDecl: target missing — no migration declared for schema '${decl.schemaName}' fromVersion '${decl.fromVersion}'; use appendMigrationDecl to introduce`,
		);
	}
	const next: MigrationsFile = clone(current);
	next.migrations[idx] = decl;
	writeMigrationsFile(cwd, next, ctx);
	invalidateMigrationRegistry(cwd);
}

/**
 * Remove an existing MigrationDecl identified by (schemaName, fromVersion).
 * Op-correctness: target must be PRESENT; missing target throws. Invalidates
 * the loader cache after a successful write.
 */
export function removeMigrationDecl(cwd: string, schemaName: string, fromVersion: string, ctx?: DispatchContext): void {
	const current = loadMigrationsFile(cwd);
	if (current === null) {
		throw new Error(`removeMigrationDecl: migrations.json absent at ${migrationsPath(cwd)}; nothing to remove`);
	}
	const idx = findMigrationIndex(current, schemaName, fromVersion);
	if (idx < 0) {
		throw new Error(
			`removeMigrationDecl: target missing — no migration declared for schema '${schemaName}' fromVersion '${fromVersion}'`,
		);
	}
	const next: MigrationsFile = clone(current);
	next.migrations.splice(idx, 1);
	writeMigrationsFile(cwd, next, ctx);
	invalidateMigrationRegistry(cwd);
}
