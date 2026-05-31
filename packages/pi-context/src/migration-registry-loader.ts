/**
 * migration-registry-loader — builds a populated MigrationRegistry from the
 * substrate-persisted migrations.json declarations.
 *
 * Layering:
 *   - schema-migrations.ts owns the in-memory registry abstraction
 *     (MigrationFn, MigrationRegistry, createRegistry, runMigrations). It
 *     knows nothing of persistence — that boundary is intentional so the
 *     registry can be exercised by tests with ad-hoc functions.
 *   - migrations-store.ts owns the on-disk read/write surface (MigrationDecl,
 *     TransformOp shapes; AJV-validated load/write; op-correct mutation
 *     helpers).
 *   - This module is the bridge: it consumes MigrationDecl values from the
 *     store and produces MigrationFn closures that the registry registers.
 *     Caching (keyed on the resolved substrate dir) + invalidation hooks live
 *     here so the substrate writers can punch a single function call to mark
 *     the cached registry stale.
 *
 * Path-walker semantics (TransformSpec dotted paths):
 *   - All paths are anchored on '$' and use simple dotted notation:
 *     '$' → the data root, '$.field' → root.field, '$.nested.field' →
 *     root.nested.field. Bracket-indexed array access ('$.arr[0]') is OUT
 *     of initial scope; the schema does not constrain the string form
 *     beyond a free-form `type: "string"`, but the walker rejects '[' in
 *     a path segment so a future array-extension is not accidentally
 *     bypassed at the runtime layer.
 *   - 'set' creates intermediate object parents as needed (a 'set' at
 *     '$.a.b.c' on `{}` produces `{ a: { b: { c: value } } }`). 'rename'
 *     is read + delete + set: a no-op when the source field is absent.
 *     'delete' is a no-op when the field is absent. 'coerce' is a no-op
 *     when the field is absent; when present it casts via the explicit
 *     primitive constructors String(v) / Number(v) / Boolean(v); for
 *     'array' coercion uses [].concat(v) so a non-array value becomes a
 *     single-element array (and an existing array passes through
 *     unchanged); for 'object' coercion uses Object(v).
 *
 * Identity migrations are the pass-through case the operator declares when
 * the bumped schema is shape-compatible with the prior version; the closure
 * returned by migrationFnFor for kind='identity' is byte-cheap (returns the
 * input reference unchanged).
 */

import path from "node:path";
import { resolveContextDir, tryResolveContextDir } from "./context-dir.js";
import { loadMigrationsFileForDir, type MigrationDecl, type TransformOp } from "./migrations-store.js";
import type { MigrationFn, MigrationRegistry } from "./schema-migrations.js";
import { createRegistry } from "./schema-migrations.js";

/**
 * Cache of populated MigrationRegistry instances. ONE cache, keyed by the
 * RESOLVED SUBSTRATE DIR (`path.resolve(substrateDir)`) — not by cwd. The cwd
 * and dir forms converge on this single key: the cwd forms first resolve
 * `cwd → substrateDir` via the bootstrap pointer, then read/invalidate the
 * dir-keyed entry. Invalidated by `invalidateMigrationRegistry(cwd)` /
 * `invalidateMigrationRegistryForDir(substrateDir)` after a successful
 * migrations.json mutation so the next consumer sees the new declarations
 * without restarting the process.
 *
 * Keying on the resolved dir (rather than cwd) is load-bearing for coherence:
 * the block writers read the registry via `getProjectMigrationRegistryForDir`
 * (dir-keyed); a migration declaration invalidates via the cwd form. If the
 * read key (resolved dir) and the invalidate key (raw cwd) diverged — which
 * they do whenever cwd ≠ substrateDir, e.g. `<root>` vs `<root>/.project` —
 * the post-declaration read would serve a stale pre-declaration registry. The
 * single resolved-dir key keeps read and invalidate coherent.
 */
const registryCache = new Map<string, MigrationRegistry>();

/**
 * Apply a single dotted path traversal, returning {parent, key} where parent
 * is the object containing the addressed leaf and key is the final segment.
 * When `createParents` is true, intermediate missing parents are created as
 * empty objects (used by 'set' / 'rename' write side). When false, missing
 * intermediates yield `null` parent (used by 'delete' / 'coerce' / 'rename'
 * read side to no-op silently on absent paths).
 *
 * Rejects '[' / ']' in any segment — array-element addressing is explicitly
 * out of scope so a future extension cannot be accidentally bypassed.
 */
function walkPath(
	root: unknown,
	dottedPath: string,
	createParents: boolean,
): { parent: Record<string, unknown> | null; key: string } {
	if (!dottedPath.startsWith("$")) {
		throw new Error(`migration path must start with '$' (got '${dottedPath}')`);
	}
	const tail = dottedPath.slice(1); // strip leading '$'
	const segments = tail.length === 0 ? [] : tail.split(".").slice(1); // first split element is '' from leading '.'
	if (segments.length === 0) {
		throw new Error(`migration path '${dottedPath}' has no segments; cannot address the root for write/delete`);
	}
	for (const seg of segments) {
		if (seg.length === 0) {
			throw new Error(`migration path '${dottedPath}' contains an empty segment`);
		}
		if (seg.includes("[") || seg.includes("]")) {
			throw new Error(
				`migration path '${dottedPath}' contains array-element addressing ('[...]'); not supported in v1`,
			);
		}
	}

	if (typeof root !== "object" || root === null || Array.isArray(root)) {
		if (!createParents) return { parent: null, key: segments[segments.length - 1]! };
		throw new Error(`migration path '${dottedPath}' cannot create parents on a non-object root`);
	}

	let cursor = root as Record<string, unknown>;
	for (let i = 0; i < segments.length - 1; i++) {
		const seg = segments[i]!;
		const next = cursor[seg];
		if (typeof next === "object" && next !== null && !Array.isArray(next)) {
			cursor = next as Record<string, unknown>;
		} else if (createParents) {
			const fresh: Record<string, unknown> = {};
			cursor[seg] = fresh;
			cursor = fresh;
		} else {
			return { parent: null, key: segments[segments.length - 1]! };
		}
	}
	return { parent: cursor, key: segments[segments.length - 1]! };
}

/**
 * Apply one TransformOp to `data` in place. Returns the (possibly same) data
 * reference so chained ops compose cleanly. The mutation is intentionally
 * in-place because the migrationFnFor closure deep-clones at the entry of
 * the composed function — chaining sees a private copy throughout.
 */
function applyOp(data: unknown, op: TransformOp): unknown {
	switch (op.op) {
		case "rename": {
			const read = walkPath(data, op.from, false);
			if (read.parent === null || !(read.key in read.parent)) return data; // no-op on absent source
			const value = read.parent[read.key];
			delete read.parent[read.key];
			const write = walkPath(data, op.to, true);
			if (write.parent === null) return data;
			write.parent[write.key] = value;
			return data;
		}
		case "set": {
			const write = walkPath(data, op.path, true);
			if (write.parent === null) return data;
			write.parent[write.key] = op.value;
			return data;
		}
		case "delete": {
			const read = walkPath(data, op.path, false);
			if (read.parent === null) return data;
			delete read.parent[read.key];
			return data;
		}
		case "coerce": {
			const read = walkPath(data, op.path, false);
			if (read.parent === null || !(read.key in read.parent)) return data;
			const current = read.parent[read.key];
			let next: unknown;
			switch (op.type) {
				case "string":
					next = String(current);
					break;
				case "number":
					next = Number(current);
					break;
				case "boolean":
					next = Boolean(current);
					break;
				case "array":
					next = Array.isArray(current) ? current : ([] as unknown[]).concat(current as never);
					break;
				case "object":
					next = Object(current);
					break;
			}
			read.parent[read.key] = next;
			return data;
		}
	}
}

/**
 * Convert one MigrationDecl into a MigrationFn closure. kind='identity'
 * returns the input unchanged; kind='declarative-transform' deep-clones
 * the input then applies each TransformOp in declaration order to the
 * private copy, returning it.
 *
 * The kind='declarative-transform' branch throws when `transform` is
 * missing — the schema declares the field optional only because the
 * identity branch never carries one; runtime-time the loader trusts the
 * write-schema-migration tool's presence/absence guard, but a hand-edited
 * malformed file would surface here rather than silently no-op.
 */
export function migrationFnFor(decl: MigrationDecl): MigrationFn {
	if (decl.kind === "identity") {
		return (data: unknown) => data;
	}
	if (decl.kind === "declarative-transform") {
		const ops = decl.transform?.operations;
		if (!ops) {
			throw new Error(
				`migrationFnFor: declarative-transform decl for schema '${decl.schemaName}' ${decl.fromVersion}→${decl.toVersion} is missing transform.operations`,
			);
		}
		return (data: unknown) => {
			let cursor: unknown = JSON.parse(JSON.stringify(data));
			for (const op of ops) {
				cursor = applyOp(cursor, op);
			}
			return cursor;
		};
	}
	// Unreachable per the TS discriminated union — present as a defensive
	// throw so a future schema-shape additive change surfaces here.
	throw new Error(`migrationFnFor: unknown decl.kind '${(decl as { kind: string }).kind}'`);
}

/**
 * Build a fresh MigrationRegistry populated from migrations.json. When the
 * file is absent or empty (no declarations), returns an empty registry that
 * `runMigrations` exercises happy-path-only (currentVersion === targetVersion
 * cases pass through without registry consultation).
 *
 * Throws when a declaration is malformed in a way the loader catches at
 * MigrationFn-construction time (e.g. declarative-transform with no
 * transform.operations), preserving the fail-fast aim. The store's AJV
 * validation at load time catches schema-shape failures upstream.
 */
export function buildRegistryFromSubstrateForDir(substrateDir: string): MigrationRegistry {
	const reg = createRegistry();
	const file = loadMigrationsFileForDir(substrateDir);
	if (file === null) return reg;
	for (const decl of file.migrations) {
		const migrate = migrationFnFor(decl);
		reg.register({
			schemaName: decl.schemaName,
			fromVersion: decl.fromVersion,
			toVersion: decl.toVersion,
			migrate,
		});
	}
	return reg;
}

export function buildRegistryFromSubstrate(cwd: string): MigrationRegistry {
	return buildRegistryFromSubstrateForDir(resolveContextDir(cwd));
}

/**
 * Return a cached MigrationRegistry for `cwd`, building it on first call (or
 * after invalidation). Resolves the cwd to its substrate dir via the bootstrap
 * pointer, then delegates to `getProjectMigrationRegistryForDir` so the cwd
 * read path and the dir read path share ONE cache entry (keyed by the resolved
 * substrate dir). This convergence is what keeps reads coherent with the
 * cwd-form invalidation.
 */
export function getProjectMigrationRegistry(cwd: string): MigrationRegistry {
	return getProjectMigrationRegistryForDir(resolveContextDir(cwd));
}

/**
 * Dir-targeted form of `getProjectMigrationRegistry` and the SINGLE registry
 * builder/cacher: return a cached MigrationRegistry for an explicit substrate
 * directory, building it on first call. Keyed on `path.resolve(substrateDir)`
 * — the one cache key both read forms and both invalidate forms agree on. Used
 * by `writeBlockForDir` so a write into a non-active substrate
 * validates/migrates against THAT substrate's `migrations.json`, never the
 * active dir's.
 *
 * The cwd form (`getProjectMigrationRegistry`) resolves `cwd → substrateDir`
 * and delegates here, so when `substrateDir === resolveContextDir(cwd)` both
 * forms hit the SAME entry. The migrations-store mutation helpers invalidate
 * via `invalidateMigrationRegistry(cwd)`, which resolves the same dir key and
 * deletes the entry this builder populates — so a declare-then-read sequence
 * (mutate migrations.json, then `writeBlockForDir` re-reads) rebuilds against
 * the fresh declarations rather than serving a stale registry.
 */
export function getProjectMigrationRegistryForDir(substrateDir: string): MigrationRegistry {
	const key = path.resolve(substrateDir);
	const cached = registryCache.get(key);
	if (cached) return cached;
	const reg = buildRegistryFromSubstrateForDir(substrateDir);
	registryCache.set(key, reg);
	return reg;
}

/**
 * Drop the cached MigrationRegistry for an explicit substrate directory (if
 * any). Deletes `path.resolve(substrateDir)` — the SAME key the read forms
 * populate, so an invalidation here is observed by the next read.
 *
 * No-op when no entry is cached — invalidation is cheap and write-after-no-
 * cache is a normal pre-warming state.
 */
export function invalidateMigrationRegistryForDir(substrateDir: string): void {
	registryCache.delete(path.resolve(substrateDir));
}

/**
 * Drop the cached MigrationRegistry for `cwd` (if any). Called by each
 * migrations-store mutation helper after a successful write so the next
 * consumer reads the fresh declarations without process restart.
 *
 * Resolves `cwd → substrateDir` and delegates to the ForDir form so the
 * deleted key MATCHES the resolved-substrate-dir key the read path uses (the
 * Regression-B fix: pre-fix this deleted `path.resolve(cwd)`, a different key
 * from the dir-keyed read entry, leaving the post-declaration read stale). The
 * mutation helpers always call this after a successful `writeMigrationsFile`,
 * which itself required the pointer to resolve — so resolution is normally
 * safe; `tryResolveContextDir` guards the absent-pointer edge with a no-op
 * rather than throwing during invalidation.
 */
export function invalidateMigrationRegistry(cwd: string): void {
	const substrateDir = tryResolveContextDir(cwd);
	if (substrateDir === null) return;
	invalidateMigrationRegistryForDir(substrateDir);
}
