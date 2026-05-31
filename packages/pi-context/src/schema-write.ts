/**
 * Canonical schema-write surface — read / write / mutate the JSON Schemas
 * that live alongside project blocks under `<contextDir>/schemas/`.
 *
 * Closes structurally:
 *   - FGAP-011 (canonical schema-write surface): every schema mutation that
 *     would otherwise reach `.project/schemas/*.schema.json` via direct fs
 *     edits now has a single typed entry point. Direct fs writes remain
 *     possible but are now a parallel ungated path that should be retired
 *     in any future schema mutation per the F-006-bypass-pattern discipline.
 *
 * Contract:
 *   - All schemas pass through AJV draft-07 meta-schema validation before
 *     they touch disk. Malformed schemas throw `ValidationError` with the
 *     meta-violation details; the file is not created or modified.
 *   - Atomic on-disk semantics — writes go to a `<file>.schema-write-<pid>.tmp`
 *     sibling and are renamed into place. A failed write leaves the prior
 *     schema byte-identical.
 *   - Schema files land at `<resolveContextDir(cwd)>/schemas/<schemaName>.schema.json`,
 *     routed through `schemaPath` (context-dir) so write resolution is identical
 *     to read resolution — pointer-canonical, `config.root` is NOT a path input
 *     (FGAP-079 / DEC-0045). Previously based on a config.root-honoring
 *     path-builder, which diverged from the pointer-canonical read side.
 *
 * Out-of-scope for step 3:
 *   - Schema $id + version + $ref + migration registry (FGAP-006, step 4)
 *   - Schema diff / change-log tooling
 *   - Cross-package opinionated mutators (e.g. add-author-fields shorthand)
 */

import fs from "node:fs";
import path from "node:path";
import { schemaPath } from "./context-dir.js";
import type { DispatchContext } from "./dispatch-context.js";
import { ValidationError, validateSchemaAgainstMeta } from "./schema-validator.js";

/**
 * The dotted key-paths of every array property at nesting depth ≥ 1 (reachable
 * only by descending through ≥1 enclosing array's `items`) whose item shape
 * declares an `"id"` property. A NESTED id-bearing array is a
 * relationship-as-embedding — an id-bearing item that should be a top-level
 * entity joined by a closure-table membership edge, not embedded inside another
 * item's array (content-addressed substrate identity, Cycle 9.2). Depth-0
 * (top-level) id arrays are the normal block-item shape and are NOT flagged;
 * nested NON-id arrays (e.g. a list of strings, or objects with no `id`) are NOT
 * flagged.
 *
 * Trigger = `"id"` PRESENCE in the nested array's item `properties` — NOT a
 * full identity-field declaration (`collectArrayItemIdentityDecisions` keys on
 * the IDENTITY_DECLARATION_FIELDS union; this guard keys on `id` alone, because
 * an embedded item carrying any local `id` is the relationship-as-embedding
 * smell regardless of whether it also declares oid/content_hash).
 *
 * The walk mirrors `collectArrayItemIdentityDecisions` (block-api.ts) —
 * `properties.*` + recurse into array `items` + recurse into object-valued
 * props — but carries a `depth` incremented each time it descends through an
 * array's `items`, and resolves a one-level `#/definitions/*` or `#/$defs/*`
 * `$ref` on `items` the same way `resolveBlockItemSchema` does (block-api.ts),
 * so a nested item that sits behind a `$ref` is not missed by a ref-blind walk.
 */
export function findNestedIdBearingArrays(schema: Record<string, unknown>): string[] {
	const hits: string[] = [];

	// Resolve a one-level local `$ref` on a schema node, mirroring
	// resolveBlockItemSchema's supported refs (#/definitions/* | #/$defs/*).
	// Unresolvable / unsupported refs are returned as-is (the walk then finds no
	// `properties` on them and stops — it never throws, since this is a lint pass,
	// not a load-time validation gate).
	function deref(node: Record<string, unknown>): Record<string, unknown> {
		const ref = typeof node.$ref === "string" ? node.$ref : undefined;
		if (!ref) return node;
		const m = /^#\/(definitions|\$defs)\/(.+)$/.exec(ref);
		if (!m) return node;
		const bag = schema[m[1]] as Record<string, Record<string, unknown>> | undefined;
		const target = bag?.[m[2]];
		return target && typeof target === "object" ? target : node;
	}

	function walk(node: Record<string, unknown>, depth: number, keyPath: string): void {
		if (!node || typeof node !== "object") return;
		const resolved = deref(node);
		const props = resolved.properties as Record<string, unknown> | undefined;
		if (!props) return;
		for (const [k, vRaw] of Object.entries(props)) {
			if (!vRaw || typeof vRaw !== "object") continue;
			const v = vRaw as Record<string, unknown>;
			if (v.type === "array" && v.items) {
				const items = deref(v.items as Record<string, unknown>);
				const itemProps = items.properties as Record<string, unknown> | undefined;
				// At nesting depth ≥ 1 an array whose item shape carries an `id`
				// property is the forbidden relationship-as-embedding.
				if (depth >= 1 && itemProps && Object.hasOwn(itemProps, "id")) {
					hits.push(`${keyPath}${k}`);
				}
				// Descend into the array's items at depth+1 to catch deeper nesting.
				walk(items, depth + 1, `${keyPath}${k}.`);
			} else {
				// Object-valued (non-array) property: recurse at the SAME depth so a
				// nested object wrapper does not by itself count as array nesting.
				walk(v, depth, `${keyPath}${k}.`);
			}
		}
	}

	walk(schema, 0, "");
	return hits;
}

/**
 * Throw when `schema` declares any nested id-bearing array (see
 * `findNestedIdBearingArrays`). The message names every offending dotted
 * key-path so the author knows exactly which embedded array to promote to a
 * top-level entity + membership edge. Mirrors the meta-reject throw convention
 * (a plain `Error` carrying a labeled message). A schema with no nested
 * id-bearing array is a no-op.
 */
export function assertNoNestedIdBearingArray(schema: Record<string, unknown>, label: string): void {
	const paths = findNestedIdBearingArrays(schema);
	if (paths.length) {
		throw new Error(
			`${label}: nested id-bearing arrays are forbidden (id-bearing items must be top-level blocks joined by membership edges, not embedded): ${paths.join(", ")}`,
		);
	}
}

/**
 * `<resolveContextDir(cwd)>/schemas/<schemaName>.schema.json` — canonical schema
 * path, routed through `schemaPath` (context-dir) so write resolution is
 * BYTE-IDENTICAL to read resolution (FGAP-079 / DEC-0045). Previously this was
 * based on a config.root-honoring path-builder, which diverged from the
 * pointer-canonical read side (`schemaPath` / `validateBlockWithMigration`) under
 * a non-default `config.root` — schemas would be written where reads/validation
 * could not find them. Delegating to `schemaPath` collapses the two paths to one
 * source AND inherits its `assertSubstrateName` guard (path-traversal rejection).
 */
function schemaWritePath(cwd: string, schemaName: string): string {
	return schemaPath(cwd, schemaName);
}

/**
 * Read a schema from `<contextDir>/schemas/<schemaName>.schema.json` and
 * return the parsed object. Returns `null` when the file does not exist —
 * absence is a normal pre-write state, not an error. Throws when the file
 * exists but is unreadable or contains invalid JSON.
 *
 * Note: this reader does NOT meta-validate. Callers that need a guarantee
 * the file holds a valid schema should pipe the result through
 * `validateSchemaAgainstMeta` themselves; `updateSchema` already does.
 */
export function readSchema(cwd: string, schemaName: string): object | null {
	const p = schemaWritePath(cwd, schemaName);
	if (!fs.existsSync(p)) return null;

	let raw: string;
	try {
		raw = fs.readFileSync(p, "utf-8");
	} catch (err) {
		throw new Error(`readSchema: failed to read ${p}: ${err instanceof Error ? err.message : String(err)}`);
	}

	try {
		return JSON.parse(raw) as object;
	} catch (err) {
		throw new Error(`readSchema: invalid JSON in ${p}: ${err instanceof Error ? err.message : String(err)}`);
	}
}

/**
 * Atomically write `schema` to `<contextDir>/schemas/<schemaName>.schema.json`
 * after validating it against the JSON Schema draft-07 meta-schema.
 *
 * Failure modes:
 *   - Malformed schema → `ValidationError` (file not created or modified).
 *   - Filesystem failure during write → `Error` with file context; tmp file
 *     cleanup is best-effort, prior schema (if any) is left byte-identical
 *     because the rename never happened.
 *
 * Overwrites any existing schema at the target path; callers that need
 * mutate-in-place semantics should use `updateSchema`.
 */
export function writeSchema(cwd: string, schemaName: string, schema: object): void {
	const p = schemaWritePath(cwd, schemaName);

	// (1) Meta-schema validation BEFORE any disk activity.
	validateSchemaAgainstMeta(schema, `schema '${schemaName}'`);

	// (1b) Substrate-shape guard: reject a schema that embeds an id-bearing item
	// inside another item's array (nested id-bearing array) — a
	// relationship-as-embedding that must be a top-level entity + membership edge
	// (content-addressed substrate identity, Cycle 9.2). Runs after meta-validation
	// (so the body is structurally a schema) and before any disk activity.
	assertNoNestedIdBearingArray(schema as Record<string, unknown>, `schema '${schemaName}'`);

	// (2) Ensure the schemas/ directory exists.
	fs.mkdirSync(path.dirname(p), { recursive: true });

	// (3) Atomic write: tmp + rename.
	const tmpPath = `${p}.schema-write-${process.pid}.tmp`;
	try {
		fs.writeFileSync(tmpPath, `${JSON.stringify(schema, null, 2)}\n`, "utf-8");
		fs.renameSync(tmpPath, p);
	} catch (err) {
		try {
			fs.unlinkSync(tmpPath);
		} catch {
			/* best-effort cleanup — surface the original error below */
		}
		const msg = err instanceof Error ? err.message : String(err);
		throw new Error(`writeSchema: failed to write ${p}: ${msg}`);
	}
}

/**
 * Op-correct create-or-replace of a whole schema body, layered over
 * `writeSchema` (FGAP-077 — the Pi-tool / CLI-facing schema-write op).
 *
 * Where `writeSchema` is an unconditional create-or-overwrite, this surface
 * adds an explicit operation discriminator so a caller's intent (create a NEW
 * schema vs. replace an EXISTING one) is enforced rather than silently
 * coerced:
 *   - `operation: "create"` requires the schema to be ABSENT — a collision
 *     with an existing schema throws (use `replace` to overwrite).
 *   - `operation: "replace"` requires the schema to be PRESENT — a missing
 *     target throws (use `create` to initialize).
 *   - any other operation string throws before any disk read.
 *
 * The presence check reuses `readSchema` (returns `null` when absent) and the
 * single private `schemaWritePath` helper so there is one path source. The
 * actual write delegates to `writeSchema`, which meta-validates against the
 * draft-07 meta-schema and writes atomically (tmp + rename); this surface adds
 * no second validation or write path.
 *
 * Migration boundary (DECIDED, FGAP-077): this op writes the schema JSON and
 * meta-validates the schema body. It does NOT migrate existing block items
 * forward when a `replace` changes the schema's `version`. A breaking
 * evolution is handled at READ time by `validateBlockWithMigration`, which
 * throws a version mismatch until a code-level `MigrationFn` is registered via
 * `createRegistry().register(...)` — and there is no Pi-tool surface for
 * registering a `MigrationFn`. This surface does not (and must not) emit an
 * "items exist at old version" warning: that would require reading block files
 * to assess data-layer impact from inside the schema-write layer, inverting
 * the read-time / write-time layering.
 *
 * `ctx` is accepted and IGNORED: schema files carry no author-attestation
 * fields, so there is nothing to stamp. The parameter is present for call-site
 * parity with the attestation-aware block-write / config-write surfaces
 * (mirrors `amendConfigEntry`'s ctx-forwarding parameter, which forwards to
 * `writeConfig`; here there is no author-bearing target to forward to).
 *
 * `opts.dryRun` runs the SAME meta-validator `writeSchema` uses against the
 * supplied body and returns `{ written: false }` without touching disk —
 * keeping ONE validation path (no re-implemented validation for the preview).
 */
export function writeSchemaChecked(
	cwd: string,
	schemaName: string,
	schema: object,
	operation: "create" | "replace",
	ctx?: DispatchContext,
	opts?: { dryRun?: boolean },
): { written: boolean; operation: "create" | "replace"; schemaPath: string } {
	void ctx; // accepted for call-site parity; schema files carry no author fields.

	const target = schemaWritePath(cwd, schemaName);

	// (1) Operation discriminator — reject unknown ops before any disk read.
	if (operation !== "create" && operation !== "replace") {
		throw new Error(`writeSchemaChecked: unknown operation '${operation}' — expected create | replace`);
	}

	// (2) Presence guard — readSchema returns null when the file is absent.
	const existing = readSchema(cwd, schemaName);
	if (operation === "create" && existing !== null) {
		throw new Error(
			`writeSchemaChecked: create collision — schema '${schemaName}' already exists at ${target}; use operation 'replace' to overwrite`,
		);
	}
	if (operation === "replace" && existing === null) {
		throw new Error(
			`writeSchemaChecked: replace target missing — schema '${schemaName}' does not exist at ${target}; use operation 'create'`,
		);
	}

	// (3) Dry-run: meta-validate via the SAME validator writeSchema uses, no write.
	// The dry-run branch does NOT route through writeSchema (which now carries the
	// nested-id guard), so the guard is applied here too — a --dry-run preview of a
	// nested-id schema must reject identically to a committing write.
	if (opts?.dryRun) {
		validateSchemaAgainstMeta(schema, `schema '${schemaName}' (dry-run)`);
		assertNoNestedIdBearingArray(schema as Record<string, unknown>, `schema '${schemaName}' (dry-run)`);
		return { written: false, operation, schemaPath: target };
	}

	// (4) Commit: writeSchema re-meta-validates + writes atomically (tmp + rename).
	writeSchema(cwd, schemaName, schema);
	return { written: true, operation, schemaPath: target };
}

/**
 * Read the current schema at `<contextDir>/schemas/<schemaName>.schema.json`,
 * pass it to `mutator`, meta-validate the result, and atomically write it
 * back. Throws if:
 *   - the schema does not exist (`Error` — caller must initialize first)
 *   - the on-disk schema parses as JSON but the mutator output fails meta
 *     validation (`ValidationError`)
 *   - the filesystem write fails (`Error`, prior schema unchanged)
 *
 * `mutator` receives a deep-readable reference to the parsed schema; it is
 * the caller's responsibility to return a fresh object rather than mutate
 * in place — callers that mutate in place still work because the result is
 * what writeSchema sees, but the convention is "mutator returns the new
 * schema" so the call site reads as a transform.
 */
export function updateSchema(cwd: string, schemaName: string, mutator: (current: object) => object): void {
	const current = readSchema(cwd, schemaName);
	if (current === null) {
		throw new Error(
			`updateSchema: schema '${schemaName}' does not exist at ${schemaWritePath(cwd, schemaName)}; use writeSchema to create it`,
		);
	}

	const next = mutator(current);

	// validateSchemaAgainstMeta will throw ValidationError on a malformed result;
	// we deliberately let that propagate so the caller sees the meta details.
	validateSchemaAgainstMeta(next, `schema '${schemaName}' (post-mutator)`);

	// Reuse writeSchema for the atomic write — it re-validates, which is a
	// belt-and-braces double-check rather than wasted work, since the second
	// validation is fast on the same AJV instance and guarantees disk state
	// matches a meta-valid schema even if a future refactor moves the
	// pre-write check.
	writeSchema(cwd, schemaName, next);
}

// Re-export ValidationError so consumers don't need a dual import to catch
// the only error subclass thrown from the meta-validation path.
export { ValidationError };
