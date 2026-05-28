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
 *     Per-cwd caching + invalidation hook live here so the substrate writers
 *     can punch a single function call to mark the cached registry stale.
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
import { loadMigrationsFile, type MigrationDecl, type TransformOp } from "./migrations-store.js";
import type { MigrationFn, MigrationRegistry } from "./schema-migrations.js";
import { createRegistry } from "./schema-migrations.js";

/**
 * Per-cwd cache of populated MigrationRegistry instances. Keyed by absolute
 * cwd. Invalidated by `invalidateMigrationRegistry(cwd)` after a successful
 * migrations.json mutation so the next consumer sees the new declarations
 * without restarting the process.
 *
 * Cache identity is intentionally absolute-cwd-keyed rather than substrate-
 * resolved-dir-keyed: the bootstrap pointer is the source of truth for which
 * substrate dir a cwd resolves to, and the resolver itself already caches
 * pointer reads. Doubling that cache would just be a parallel ungated path.
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
export function buildRegistryFromSubstrate(cwd: string): MigrationRegistry {
	const reg = createRegistry();
	const file = loadMigrationsFile(cwd);
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

/**
 * Return a cached MigrationRegistry for `cwd`, building it on first call (or
 * after invalidation). Resolves the cwd to an absolute path before keying so
 * relative-cwd consumers and absolute-cwd consumers collapse to one entry.
 */
export function getProjectMigrationRegistry(cwd: string): MigrationRegistry {
	const key = path.resolve(cwd);
	const cached = registryCache.get(key);
	if (cached) return cached;
	const reg = buildRegistryFromSubstrate(cwd);
	registryCache.set(key, reg);
	return reg;
}

/**
 * Drop the cached MigrationRegistry for `cwd` (if any). Called by each
 * migrations-store mutation helper after a successful write so the next
 * consumer reads the fresh declarations without process restart.
 *
 * No-op when no entry is cached for `cwd` — invalidation is cheap and
 * write-after-no-cache is a normal pre-warming state.
 */
export function invalidateMigrationRegistry(cwd: string): void {
	registryCache.delete(path.resolve(cwd));
}
