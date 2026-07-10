/**
 * Schema migration registry — closes the schema versioning + identity +
 * composition + migration story at the runtime-migration layer. Pairs with
 * the `$id` + `version` schema-identity surface landed alongside this module
 * in the framework schemas under `packages/pi-context/schemas/`.
 *
 * Aim: when a block file declares `schema_version: "1.0.0"` but the schema
 * itself has advanced to `"2.0.0"`, a registered chain of MigrationFns walks
 * the data forward one step at a time — `1.0.0 → 1.1.0 → 2.0.0` — before AJV
 * validates against the current schema. Per-step migrations are pure data
 * transforms that take and return `unknown`; the registry resolves the chain
 * by looking up each (schemaName, fromVersion) entry and following its
 * `toVersion` forward until it lands on `targetVersion` or fails.
 *
 * Design notes (intentions, not absolutes):
 *   - In-memory module via `createRegistry()` returning the typed surface;
 *     a singleton is not exported because per-process / per-test isolation
 *     simplifies coverage and avoids cross-test contamination.
 *   - Linear chain only — no branching / no diamond resolution. If a future
 *     schema has multiple `1.x → 2.x` paths the registry as written will
 *     follow the first registered edge from each (schemaName, fromVersion);
 *     callers should register exactly one outgoing edge per node.
 *   - Cycle detection is bounded by tracking visited (schemaName, version)
 *     tuples during `resolve`; an unbounded walk would hang on a misregistered
 *     `1.0.0 → 1.0.0` self-loop.
 *   - `runMigrations` with `currentVersion === targetVersion` is a no-op
 *     pass-through — no registry lookup, no copy, no error.
 *   - `register` rejects duplicate (schemaName, fromVersion) entries with a
 *     descriptive Error so accidental double-registration surfaces at startup
 *     rather than as silent override.
 *
 * Out of scope here:
 *   - On-disk migration of existing block files. Migration runs at READ time
 *     when a future `validateBlockWithMigration` (schema-validator.ts) is
 *     called; it does not rewrite the source file.
 *   - Cross-schema migrations (e.g. splitting one block into two). Those
 *     would compose at a higher layer than this per-schema chain.
 */

/**
 * A single forward migration step. Receives the block data as it exists at
 * `fromVersion` and returns the data shaped to match `toVersion`. The function
 * is expected to be pure; it should not perform I/O.
 */
export type MigrationFn = (data: unknown) => unknown;

/**
 * One registered edge in the migration graph. `schemaName` is the canonical
 * schema id (matches the schema's `$id` minus the URN prefix, e.g. `"config"`,
 * `"relations"`, `"priority"`). `fromVersion` and `toVersion` are semver
 * strings matching the schema's `version` field at those points in time.
 */
export interface MigrationRegistryEntry {
	schemaName: string;
	fromVersion: string;
	toVersion: string;
	migrate: MigrationFn;
}

/**
 * Typed surface returned by `createRegistry()`. `register` adds an edge;
 * `resolve` walks the registered edges to produce an ordered list of
 * MigrationFns from `fromVersion` to `toVersion`. `resolve` throws when no
 * path exists (including when the registry is empty for that schemaName).
 */
export interface MigrationRegistry {
	register(entry: MigrationRegistryEntry): void;
	resolve(schemaName: string, fromVersion: string, toVersion: string): MigrationFn[];
}

/**
 * Construct a fresh, empty migration registry. Each call returns an
 * independent instance — there is no shared global state — so callers needing
 * isolation (notably tests) get it for free.
 */
export function createRegistry(): MigrationRegistry {
	// Outer map: schemaName → inner map keyed by fromVersion. Each inner-map
	// entry holds the single outgoing edge (toVersion + migrate). One outgoing
	// edge per (schemaName, fromVersion) keeps the walk deterministic.
	const edges = new Map<string, Map<string, { toVersion: string; migrate: MigrationFn }>>();

	function register(entry: MigrationRegistryEntry): void {
		let perSchema = edges.get(entry.schemaName);
		if (!perSchema) {
			perSchema = new Map();
			edges.set(entry.schemaName, perSchema);
		}
		if (perSchema.has(entry.fromVersion)) {
			throw new Error(
				`MigrationRegistry: duplicate edge for schema '${entry.schemaName}' fromVersion '${entry.fromVersion}'`,
			);
		}
		perSchema.set(entry.fromVersion, { toVersion: entry.toVersion, migrate: entry.migrate });
	}

	function resolve(schemaName: string, fromVersion: string, toVersion: string): MigrationFn[] {
		if (fromVersion === toVersion) return [];

		const perSchema = edges.get(schemaName);
		if (!perSchema || perSchema.size === 0) {
			throw new Error(
				`MigrationRegistry: no migrations registered for schema '${schemaName}' (need ${fromVersion} → ${toVersion})`,
			);
		}

		const chain: MigrationFn[] = [];
		const visited = new Set<string>();
		let cursor = fromVersion;

		// Walk forward step by step. Each step looks up the outgoing edge from
		// `cursor`; if there is none, the requested `toVersion` is unreachable.
		while (cursor !== toVersion) {
			if (visited.has(cursor)) {
				throw new Error(
					`MigrationRegistry: cycle detected at schema '${schemaName}' version '${cursor}' while resolving ${fromVersion} → ${toVersion}`,
				);
			}
			visited.add(cursor);

			const next = perSchema.get(cursor);
			if (!next) {
				throw new Error(
					`MigrationRegistry: no path from ${fromVersion} to ${toVersion} for schema '${schemaName}' (stuck at '${cursor}')`,
				);
			}
			chain.push(next.migrate);
			cursor = next.toVersion;
		}

		return chain;
	}

	return { register, resolve };
}

/**
 * Resolve the migration chain for `schemaName` from `currentVersion` to
 * `targetVersion` and apply each step in order to `data`. Returns the final
 * migrated data. When `currentVersion === targetVersion` the input is
 * returned unchanged (no allocation, no registry lookup).
 *
 * Throws when no migration path exists (`registry.resolve` propagates).
 */
export function runMigrations(
	registry: MigrationRegistry,
	schemaName: string,
	currentVersion: string,
	targetVersion: string,
	data: unknown,
): unknown {
	if (currentVersion === targetVersion) return data;

	const chain = registry.resolve(schemaName, currentVersion, targetVersion);
	let cursor = data;
	for (const step of chain) {
		cursor = step(cursor);
	}
	return cursor;
}
