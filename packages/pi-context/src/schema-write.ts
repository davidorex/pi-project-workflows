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
import { resolveContextDir, schemaPathForDir } from "./context-dir.js";
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
 * Trigger = an `"id"` DECLARATION on the nested array's item shape — NOT a
 * full identity-field declaration (`collectArrayItemIdentityDecisions` keys on
 * the IDENTITY_DECLARATION_FIELDS union; this guard keys on `id` alone, because
 * an embedded item carrying any local `id` is the relationship-as-embedding
 * smell regardless of whether it also declares oid/content_hash). An `id` is
 * detected however it is declared (Cycle 9.3 hardening over the 9.2 form, which
 * keyed only on `items.properties.id` + one-level local `$ref`):
 *   - `items.properties.id`;
 *   - `id` in `items.required` (no `properties.id` needed);
 *   - any `anyOf`/`oneOf`/`allOf` branch of the item shape declaring an `id`
 *     (recursive, any-branch — the branch may itself declare it via `required`);
 *   - tuple-form `items` (an array of subschemas) where ANY member declares an `id`;
 *   - a one-level `#/definitions/*` | `#/$defs/*` `$ref` resolving to a target
 *     that declares an `id` via any of the above.
 *
 * The walk mirrors `collectArrayItemIdentityDecisions` (block-api.ts) —
 * `properties.*` + recurse into array `items` + recurse into object-valued
 * props — extended to traverse composition branches + tuple-`items` members, and
 * carries a `depth` incremented ONLY when it descends through an array's `items`.
 * `$ref` resolution mirrors `resolveBlockItemSchema` (block-api.ts) and is
 * cycle-guarded (a per-path visited set keyed on the resolved pointer string,
 * plus a recursion-depth backstop) so self-referential / mutually-recursive
 * `$defs` cannot loop. Unresolvable / external / unsupported `$ref`s are treated
 * as opaque nodes; the pass NEVER throws (lint pass, not a load-time gate).
 */
export function findNestedIdBearingArrays(schema: Record<string, unknown>): string[] {
	const hits: string[] = [];

	// Backstop against pathological array-nesting depth even when the cycle-guard's
	// pointer set fails to catch a loop (e.g. an unbounded chain of distinct inline
	// subschemas reached by descending through array `items`).
	const MAX_DEPTH = 256;

	// SEPARATE structural-recursion backstop. `MAX_DEPTH` only counts array-`items`
	// descents — composition-branch descent (anyOf/oneOf/allOf) and object-property
	// recursion deliberately do NOT increment array-depth, so a pure-inline chain of
	// distinct composition subschemas (no `$ref` at all, e.g. allOf nested 500 deep)
	// would never trip MAX_DEPTH and would recurse unbounded. This counter increments
	// on EVERY structural recursion (object-property + array-items + composition) and
	// bounds total descent regardless of how depth is (or isn't) advanced. The
	// pointer-`visited` guard already terminates ALL `$ref` cycles; this counter only
	// backstops a finite-but-pathologically-deep PURE-INLINE chain (no `$ref`), itself
	// bounded by the finite schema-file size — so the bound can be small with no
	// practical downside, and small is what keeps termination stack-INdependent.
	//
	// Native ceiling, measured in this counter's own units (one `recursion++` per
	// structural step) for the deepest single-recursion-per-level inline chain:
	//   - default node stack (~984 KB): RangeError past ~1562 recursion units
	//   - `node --stack-size=512`:      RangeError past ~976 units
	//   - `node --stack-size=256`:      RangeError past ~390 units
	// A bound of 1024 therefore does NOT engage before native overflow on a 512 KB or
	// smaller stack — termination would be stack-dependent. 128 sits with large margin
	// below even the ~390-unit ceiling of a 256 KB stack (~67% headroom), so the
	// counter RETURNS before any `RangeError` can escape regardless of stack size,
	// preserving the lint-never-throws contract for a hostile pure-inline chain. It
	// still vastly exceeds any realistic authored nesting (deepest shipped schema nests
	// ~2 levels; real schemas stay well under ~20), and bounds recursion DEPTH per path
	// only — breadth is unbounded, so a schema with hundreds of sibling id-bearing
	// nested arrays still flags every one. Verified empirically at default and
	// constrained (`--stack-size=512`/`256`) stacks against a 5000-deep inline chain.
	const MAX_STRUCT_RECURSION = 128;

	// Resolve a one-level local `$ref` on a schema node, mirroring
	// resolveBlockItemSchema's supported refs (#/definitions/* | #/$defs/*).
	// Unresolvable / unsupported / external refs are returned as the original node
	// (opaque — the caller then finds no shape-bearing keys and stops). A `$ref`
	// whose resolved pointer has already been seen on this descent path returns an
	// empty object so a self-referential / mutually-recursive `$defs` cannot loop.
	// Never throws — this is a lint pass, not a load-time validation gate. On a
	// successful resolution the resolved pointer string is recorded in `visited`
	// (which the caller passes as a path-local clone so sibling uses of the same
	// `$ref` are not pruned — only cycles along one path are stopped).
	function deref(node: Record<string, unknown>, visited: Set<string>): Record<string, unknown> {
		const ref = typeof node.$ref === "string" ? node.$ref : undefined;
		if (!ref) return node;
		const m = /^#\/(definitions|\$defs)\/(.+)$/.exec(ref);
		if (!m) return node;
		if (visited.has(ref)) return {};
		const bag = schema[m[1]] as Record<string, Record<string, unknown>> | undefined;
		const target = bag?.[m[2]];
		if (!target || typeof target !== "object") return node;
		visited.add(ref);
		return target;
	}

	// The composition keywords whose members are arrays of subschemas; an `id`
	// (or a deeper nested array) can be buried inside any branch.
	function compositionBranches(node: Record<string, unknown>): Record<string, unknown>[] {
		const out: Record<string, unknown>[] = [];
		for (const key of ["anyOf", "oneOf", "allOf"] as const) {
			const arr = node[key];
			if (Array.isArray(arr)) {
				for (const member of arr) {
					if (member && typeof member === "object") out.push(member as Record<string, unknown>);
				}
			}
		}
		return out;
	}

	// True iff this subschema declares an `id` — directly via `properties.id`, via
	// `required` membership, or through ANY anyOf/oneOf/allOf branch (recursive,
	// any-branch). Cycle-guarded through `deref`; the visited set is cloned per
	// descent so it stops loops without pruning sibling references.
	function declaresId(nodeRaw: Record<string, unknown>, visited: Set<string>, depth: number): boolean {
		if (!nodeRaw || typeof nodeRaw !== "object" || depth > MAX_DEPTH) return false;
		const node = deref(nodeRaw, visited);
		const props = node.properties as Record<string, unknown> | undefined;
		if (props && Object.hasOwn(props, "id")) return true;
		if (Array.isArray(node.required) && node.required.includes("id")) return true;
		for (const branch of compositionBranches(node)) {
			if (declaresId(branch, new Set(visited), depth + 1)) return true;
		}
		return false;
	}

	// True iff the `items` of an array property is id-bearing: an object subschema →
	// `declaresId`; a tuple (array of subschemas) → ANY member `declaresId`.
	function itemsDeclareId(itemsRaw: unknown, visited: Set<string>): boolean {
		if (Array.isArray(itemsRaw)) {
			return itemsRaw.some(
				(member) =>
					member !== null &&
					typeof member === "object" &&
					declaresId(member as Record<string, unknown>, new Set(visited), 0),
			);
		}
		if (itemsRaw && typeof itemsRaw === "object") {
			return declaresId(itemsRaw as Record<string, unknown>, new Set(visited), 0);
		}
		return false;
	}

	// Structural descent. From a (deref'd) node, visit every shape that can host a
	// nested array: own `properties`, each composition branch's `properties`, and
	// each tuple-`items` member. `depth` increments ONLY when descending through an
	// array's `items`; an array property is the forbidden relationship-as-embedding
	// when it is reached at `depth >= 1` AND its items declare an `id`. `recursion`
	// increments on EVERY structural step (checked in `walk` AND at the composition
	// loop entry) so a composition chain that never advances `depth` still terminates.
	function descendShape(
		node: Record<string, unknown>,
		depth: number,
		keyPath: string,
		visited: Set<string>,
		recursion: number,
	): void {
		const props = node.properties as Record<string, unknown> | undefined;
		if (props) {
			for (const [k, vRaw] of Object.entries(props)) {
				if (!vRaw || typeof vRaw !== "object") continue;
				const v = vRaw as Record<string, unknown>;
				if (v.type === "array" && v.items) {
					// The id-peek uses a FRESH cycle-guard, independent of the structural
					// `visited` set. "Does this item declare an id" is a distinct question
					// from "have I already structurally walked this $ref"; reusing the
					// polluted structural set would short-circuit a $ref back to a $def that
					// declares the id (the descent already added that pointer), yielding a
					// false negative on $ref-cyclic id-bearing schemas. `declaresId` has its
					// own per-branch clone + MAX_DEPTH backstop and only recurses through
					// composition (not arbitrary properties), so a fresh seed cannot loop.
					if (depth >= 1 && itemsDeclareId(v.items, new Set())) {
						hits.push(`${keyPath}${k}`);
					}
					// Descend into the array's items at depth+1 to catch deeper nesting,
					// whether `items` is a single subschema or a tuple of subschemas.
					const itemMembers = Array.isArray(v.items) ? v.items : [v.items];
					for (const memberRaw of itemMembers) {
						if (memberRaw && typeof memberRaw === "object") {
							walk(memberRaw as Record<string, unknown>, depth + 1, `${keyPath}${k}.`, new Set(visited), recursion + 1);
						}
					}
				} else {
					// Object-valued (non-array) property: recurse at the SAME depth so a
					// nested object wrapper does not by itself count as array nesting.
					walk(v, depth, `${keyPath}${k}.`, new Set(visited), recursion + 1);
				}
			}
		}
		// A nested array can be buried inside a composition branch; traverse each at
		// the SAME `depth` (a branch is not itself an array `items` descent). Route the
		// composition descent through `walk` — NOT a direct `descendShape` self-call — so
		// the recursion is bounded by `walk`'s MAX_DEPTH / MAX_STRUCT_RECURSION backstops
		// just like every other path, and pass the SAME running `visited` (a path-local
		// clone that PRESERVES the ancestor refs already seen). `walk`'s `deref` then both
		// records the resolved pointer into that clone AND checks `visited.has(ref)` on it,
		// so a composition-routed `$ref` back to an ancestor `$def` already on this path
		// resolves to `{}` (cycle caught) rather than recursing forever. A pure-inline
		// composition chain (no `$ref`, so the pointer guard never fires) is instead bounded
		// by MAX_STRUCT_RECURSION, which `walk` increments on entry.
		for (const branch of compositionBranches(node)) {
			if (branch && typeof branch === "object") {
				walk(branch, depth, keyPath, new Set(visited), recursion + 1);
			}
		}
	}

	function walk(
		node: Record<string, unknown>,
		depth: number,
		keyPath: string,
		visited: Set<string>,
		recursion: number,
	): void {
		if (!node || typeof node !== "object" || depth > MAX_DEPTH || recursion > MAX_STRUCT_RECURSION) return;
		descendShape(deref(node, visited), depth, keyPath, visited, recursion);
	}

	walk(schema, 0, "", new Set<string>(), 0);
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
 * `<substrateDir>/schemas/<schemaName>.schema.json` — canonical schema path for
 * an EXPLICIT substrate directory, routed through `schemaPathForDir`
 * (context-dir) so write resolution is BYTE-IDENTICAL to read resolution
 * (FGAP-079 / DEC-0045) and inherits its `assertSubstrateName` guard
 * (path-traversal rejection). This is the dir-targeted twin of the cwd-resolved
 * write path; the cwd forms below delegate here via `resolveContextDir(cwd)`,
 * so a cwd call lands BYTE-IDENTICALLY where it did when this routed through the
 * cwd-resolving `schemaPath`.
 */
function schemaWritePathForDir(substrateDir: string, schemaName: string): string {
	return schemaPathForDir(substrateDir, schemaName);
}

/**
 * Dir-targeted twin of `readSchema`: read a schema from
 * `<substrateDir>/schemas/<schemaName>.schema.json` and return the parsed
 * object. Returns `null` when absent (a normal pre-write state). Throws when the
 * file exists but is unreadable or holds invalid JSON. Does NOT meta-validate
 * (mirrors `readSchema`).
 */
export function readSchemaForDir(substrateDir: string, schemaName: string): object | null {
	const p = schemaWritePathForDir(substrateDir, schemaName);
	if (!fs.existsSync(p)) return null;

	let raw: string;
	try {
		raw = fs.readFileSync(p, "utf-8");
	} catch (err) {
		throw new Error(`readSchemaForDir: failed to read ${p}: ${err instanceof Error ? err.message : String(err)}`);
	}

	try {
		return JSON.parse(raw) as object;
	} catch (err) {
		throw new Error(`readSchemaForDir: invalid JSON in ${p}: ${err instanceof Error ? err.message : String(err)}`);
	}
}

/**
 * Read a schema from `<resolveContextDir(cwd)>/schemas/<schemaName>.schema.json`
 * and return the parsed object. Thin cwd wrapper over `readSchemaForDir` — the
 * read/parse logic lives in the ForDir body. Returns `null` when the file does
 * not exist — absence is a normal pre-write state, not an error. Throws when the
 * file exists but is unreadable or contains invalid JSON.
 *
 * Note: this reader does NOT meta-validate. Callers that need a guarantee
 * the file holds a valid schema should pipe the result through
 * `validateSchemaAgainstMeta` themselves; `updateSchema` already does.
 */
export function readSchema(cwd: string, schemaName: string): object | null {
	return readSchemaForDir(resolveContextDir(cwd), schemaName);
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
/**
 * Dir-targeted twin of `writeSchema`: atomically write `schema` to
 * `<substrateDir>/schemas/<schemaName>.schema.json` after meta-validation + the
 * nested-id guard. Carries the full validate-then-write body; `writeSchema`
 * delegates here via `resolveContextDir(cwd)`. Cross-substrate consumers (Cycle
 * H migration / land-identity-fields) target a non-active substrate directly.
 *
 * `ctx` is accepted and IGNORED: schema files carry no author-attestation
 * fields (mirrors `writeSchemaChecked`'s ctx parameter). Present for call-site
 * parity with the attestation-aware block-write surfaces.
 */
export function writeSchemaForDir(
	substrateDir: string,
	schemaName: string,
	schema: object,
	ctx?: DispatchContext,
): void {
	void ctx; // accepted for call-site parity; schema files carry no author fields.
	const p = schemaWritePathForDir(substrateDir, schemaName);

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
		throw new Error(`writeSchemaForDir: failed to write ${p}: ${msg}`);
	}
}

export function writeSchema(cwd: string, schemaName: string, schema: object): void {
	writeSchemaForDir(resolveContextDir(cwd), schemaName, schema);
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
export function writeSchemaCheckedForDir(
	substrateDir: string,
	schemaName: string,
	schema: object,
	operation: "create" | "replace",
	ctx?: DispatchContext,
	opts?: { dryRun?: boolean },
): { written: boolean; operation: "create" | "replace"; schemaPath: string } {
	void ctx; // accepted for call-site parity; schema files carry no author fields.

	const target = schemaWritePathForDir(substrateDir, schemaName);

	// (1) Operation discriminator — reject unknown ops before any disk read.
	if (operation !== "create" && operation !== "replace") {
		throw new Error(`writeSchemaChecked: unknown operation '${operation}' — expected create | replace`);
	}

	// (2) Presence guard — readSchemaForDir returns null when the file is absent.
	const existing = readSchemaForDir(substrateDir, schemaName);
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

	// (3) Dry-run: meta-validate via the SAME validator the write path uses, no
	// write. The dry-run branch does NOT route through writeSchemaForDir (which
	// carries the nested-id guard), so the guard is applied here too — a --dry-run
	// preview of a nested-id schema must reject identically to a committing write.
	if (opts?.dryRun) {
		validateSchemaAgainstMeta(schema, `schema '${schemaName}' (dry-run)`);
		assertNoNestedIdBearingArray(schema as Record<string, unknown>, `schema '${schemaName}' (dry-run)`);
		return { written: false, operation, schemaPath: target };
	}

	// (4) Commit: writeSchemaForDir re-meta-validates + writes atomically (tmp + rename).
	writeSchemaForDir(substrateDir, schemaName, schema, ctx);
	return { written: true, operation, schemaPath: target };
}

export function writeSchemaChecked(
	cwd: string,
	schemaName: string,
	schema: object,
	operation: "create" | "replace",
	ctx?: DispatchContext,
	opts?: { dryRun?: boolean },
): { written: boolean; operation: "create" | "replace"; schemaPath: string } {
	return writeSchemaCheckedForDir(resolveContextDir(cwd), schemaName, schema, operation, ctx, opts);
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
			`updateSchema: schema '${schemaName}' does not exist at ${schemaWritePathForDir(resolveContextDir(cwd), schemaName)}; use writeSchema to create it`,
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
