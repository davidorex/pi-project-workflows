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
 *   - Schema files land at `<projectRoot>/schemas/<schemaName>.schema.json`
 *     where `projectRoot` honors `config.root` per the bootstrap-aware
 *     resolver in `project-context.ts`.
 *
 * Out-of-scope for step 3:
 *   - Schema $id + version + $ref + migration registry (FGAP-006, step 4)
 *   - Schema diff / change-log tooling
 *   - Cross-package opinionated mutators (e.g. add-author-fields shorthand)
 */

import fs from "node:fs";
import path from "node:path";
import { projectRoot } from "./project-context.js";
import { SCHEMAS_DIR } from "./project-dir.js";
import { ValidationError, validateSchemaAgainstMeta } from "./schema-validator.js";

/** `<projectRoot>/schemas/<schemaName>.schema.json` — canonical schema path. */
function schemaWritePath(cwd: string, schemaName: string): string {
	return path.join(projectRoot(cwd), SCHEMAS_DIR, `${schemaName}.schema.json`);
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
