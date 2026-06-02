/**
 * migration-decl-writer — standalone-tool reproduction of pi-context's
 * `appendMigrationDeclForDir` (formerly imported from the unexported
 * `migrations-store.ts`), for the relocated context-dir-migration lib that
 * now lives OUTSIDE the published `@davidorex/pi-context` package.
 *
 * On-disk behaviour is matched one-for-one against the body of
 * `appendMigrationDeclForDir` in `packages/pi-context/src/migrations-store.ts`:
 *
 *   1. Load `<migrationsPathForDir(substrateDir)>` JSON when present, else start
 *      from an empty `{schema_version: MIGRATIONS_FILE_VERSION, migrations: []}`
 *      file (the `MigrationsFile` shape declared in migrations-store.ts).
 *   2. Collision-check by the `(schemaName, fromVersion)` identity pair; a
 *      pre-existing pair throws the SAME descriptive error string the store
 *      raised (so an unintended double-declaration surfaces at the write site).
 *   3. Deep-clone (JSON round-trip), push the decl, and write the whole file
 *      via block-api's atomic `writeTypedFile` (tmp + rename) validated against
 *      the bundled `migrations.schema.json` — byte-equivalent to the store's
 *      `writeMigrationsFileForDir` path.
 *
 * Intentionally OMITTED relative to the store: `invalidateMigrationRegistryForDir`.
 * That helper only deletes an in-process `registryCache` entry
 * (migration-registry-loader.ts) — a process-lifetime read-cache concern that
 * is irrelevant to a one-shot standalone migration tool, which neither warms
 * nor re-reads that cache within the same process after the write. Confirmed by
 * reading `invalidateMigrationRegistryForDir`: its whole body is
 * `registryCache.delete(path.resolve(substrateDir))`.
 *
 * Schema resolution: `migrations.schema.json` ships in the pi-context package's
 * `schemas/` directory (declared in its `files[]`) but is NOT an exported
 * package subpath, so it cannot be imported through the package boundary. It is
 * resolved here by the same in-repo relative-path pattern the orchestrator
 * scripts already use to reach bundled package schemas (e.g.
 * `append-relation.ts`'s `relationsSchemaPath`): from this file's location under
 * `scripts/migration/lib/` up to the repo root, then into
 * `packages/pi-context/schemas/`.
 *
 * The `MigrationDecl` / `TransformSpec` / `TransformOp` / `MigrationsFile`
 * shapes and the `MIGRATIONS_FILE_VERSION` token are reproduced locally here:
 * they live (unexported) in migrations-store.ts and are NOT re-exported by the
 * `@davidorex/pi-context/schema-migrations` subpath (that module exports only
 * the in-memory registry abstraction). The on-disk shape is fixed by
 * `migrations.schema.json`, against which every write is AJV-validated, so the
 * local copies cannot silently drift from the persisted contract.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeTypedFile } from "@davidorex/pi-context/block-api";
import { migrationsPathForDir } from "@davidorex/pi-context/context-dir";
import type { DispatchContext } from "@davidorex/pi-context/dispatch-context";

/**
 * One TransformOp variant — discriminated by the `op` field. Mirrors the
 * `definitions/TransformOp` `oneOf` in migrations.schema.json and the type of
 * the same name in migrations-store.ts.
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
 * Tracks the `version` field of migrations.schema.json itself. Matches
 * `MIGRATIONS_FILE_VERSION` in migrations-store.ts.
 */
export const MIGRATIONS_FILE_VERSION = "1.0.0";

/**
 * Resolve the bundled migrations schema file from the in-repo pi-context
 * package `schemas/` directory. Mirrors the orchestrator-script precedent
 * (`append-relation.ts`'s `relationsSchemaPath`): from `scripts/migration/lib/`
 * up two segments to the repo root, then into the package's bundled schemas.
 */
function bundledMigrationsSchemaPath(): string {
	const here = path.dirname(fileURLToPath(import.meta.url));
	// scripts/migration/lib → scripts/migration → scripts → repo root.
	const schemaPath = path.resolve(
		here,
		"..",
		"..",
		"..",
		"packages",
		"pi-context",
		"schemas",
		"migrations.schema.json",
	);
	if (!fs.existsSync(schemaPath)) {
		throw new Error(`migration-decl-writer: bundled migrations schema not found: ${schemaPath}`);
	}
	return schemaPath;
}

/**
 * Compose an initial empty migrations file shape — used when the on-disk file
 * is absent. Matches `emptyMigrationsFile()` in migrations-store.ts.
 */
function emptyMigrationsFile(): MigrationsFile {
	return { schema_version: MIGRATIONS_FILE_VERSION, migrations: [] };
}

/**
 * Deep-clone via JSON round-trip. Matches `clone<T>()` in migrations-store.ts —
 * sufficient for MigrationDecl shapes (no Date / Map / undefined per schema).
 */
function clone<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Locate the index of a (schemaName, fromVersion) MigrationDecl; -1 when
 * absent. Matches `findMigrationIndex()` in migrations-store.ts.
 */
function findMigrationIndex(file: MigrationsFile, schemaName: string, fromVersion: string): number {
	return file.migrations.findIndex((m) => m.schemaName === schemaName && m.fromVersion === fromVersion);
}

/**
 * Load + return the migrations file at `substrateDir`, or null when absent.
 * Matches the absent-is-null contract of `loadMigrationsFileForDir` in
 * migrations-store.ts. NOTE: the store also AJV-validates on load; here the
 * validation that matters for write-correctness happens inside `writeTypedFile`
 * (it validates the post-mutation whole file). A pre-existing on-disk file is
 * assumed already-valid (it was written by this same validated path); if it is
 * malformed JSON the parse throws, matching the store's read-error surface.
 */
function loadMigrationsFileForDir(substrateDir: string): MigrationsFile | null {
	const p = migrationsPathForDir(substrateDir);
	if (!fs.existsSync(p)) return null;
	let raw: string;
	try {
		raw = fs.readFileSync(p, "utf-8");
	} catch (err) {
		throw new Error(`migration-decl-writer: failed to read ${p}: ${err instanceof Error ? err.message : String(err)}`);
	}
	try {
		return JSON.parse(raw) as MigrationsFile;
	} catch (err) {
		throw new Error(`migration-decl-writer: invalid JSON in ${p}: ${err instanceof Error ? err.message : String(err)}`);
	}
}

/**
 * Append a new MigrationDecl to the substrate at `substrateDir` — the
 * standalone reproduction of pi-context's `appendMigrationDeclForDir`.
 *
 * Op-correctness: the (schemaName, fromVersion) pair must be ABSENT on-disk;
 * collision throws with the same descriptive message the store raised. The
 * post-mutation whole file is written atomically + AJV-validated against the
 * bundled migrations.schema.json via `writeTypedFile`, so the resulting
 * migrations.json is byte-equivalent to what `appendMigrationDeclForDir`
 * produced for the same inputs.
 *
 * The loader-cache invalidation that the store performed after the write is
 * deliberately omitted (in-process cache; irrelevant to a standalone tool).
 */
export function appendMigrationDeclForDir(substrateDir: string, decl: MigrationDecl, ctx?: DispatchContext): void {
	const current = loadMigrationsFileForDir(substrateDir) ?? emptyMigrationsFile();
	const idx = findMigrationIndex(current, decl.schemaName, decl.fromVersion);
	if (idx >= 0) {
		throw new Error(
			`appendMigrationDecl: collision — migration for schema '${decl.schemaName}' fromVersion '${decl.fromVersion}' already exists; use replaceMigrationDecl to overwrite`,
		);
	}
	const next: MigrationsFile = clone(current);
	next.migrations.push(decl);
	writeTypedFile(migrationsPathForDir(substrateDir), bundledMigrationsSchemaPath(), next, ctx, "migrations.json");
}
