/**
 * Canonical schema-write surface — read / write / mutate the JSON Schemas
 * that live alongside project blocks under `<projectRoot>/schemas/`.
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
 *     routed through `schemaPath` (project-dir) so write resolution is identical
 *     to read resolution — pointer-canonical, `config.root` is NOT a path input
 *     (FGAP-079 / DEC-0045). Previously `projectRoot`-based (config.root-honoring),
 *     which diverged from the pointer-canonical read side.
 *
 * Out-of-scope for step 3:
 *   - Schema $id + version + $ref + migration registry (FGAP-006, step 4)
 *   - Schema diff / change-log tooling
 *   - Cross-package opinionated mutators (e.g. add-author-fields shorthand)
 */

import fs from "node:fs";
import path from "node:path";
import type { DispatchContext } from "./dispatch-context.js";
import { schemaPath } from "./project-dir.js";
import { ValidationError, validateSchemaAgainstMeta } from "./schema-validator.js";

/**
 * `<resolveContextDir(cwd)>/schemas/<schemaName>.schema.json` — canonical schema
 * path, routed through `schemaPath` (project-dir) so write resolution is
 * BYTE-IDENTICAL to read resolution (FGAP-079 / DEC-0045). Previously this was
 * `projectRoot`-based, which honored `config.root` and so diverged from the
 * pointer-canonical read side (`schemaPath` / `validateBlockWithMigration`) under
 * a non-default `config.root` — schemas would be written where reads/validation
 * could not find them. Delegating to `schemaPath` collapses the two paths to one
 * source AND inherits its `assertSubstrateName` guard (path-traversal rejection).
 */
function schemaWritePath(cwd: string, schemaName: string): string {
	return schemaPath(cwd, schemaName);
}

/**
 * Read a schema from `<projectRoot>/schemas/<schemaName>.schema.json` and
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
 * Atomically write `schema` to `<projectRoot>/schemas/<schemaName>.schema.json`
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
	if (opts?.dryRun) {
		validateSchemaAgainstMeta(schema, `schema '${schemaName}' (dry-run)`);
		return { written: false, operation, schemaPath: target };
	}

	// (4) Commit: writeSchema re-meta-validates + writes atomically (tmp + rename).
	writeSchema(cwd, schemaName, schema);
	return { written: true, operation, schemaPath: target };
}

/**
 * Read the current schema at `<projectRoot>/schemas/<schemaName>.schema.json`,
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
