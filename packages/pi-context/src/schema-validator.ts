import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ErrorObject } from "ajv";
import _Ajv from "ajv";
import _addFormats from "ajv-formats";
import { schemaPath as schemaPathHelper } from "./context-dir.js";
import { type MigrationRegistry, runMigrations } from "./schema-migrations.js";

// Node16 module resolution + CJS interop: default import is the module namespace
const Ajv = (_Ajv as any).default ?? _Ajv;
const addFormats = (_addFormats as any).default ?? _addFormats;
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

/**
 * Pre-register the eight framework schemas (`config`, `relations`, plus the
 * six FGAP-016 shared enums: priority, status, severity, source, layer,
 * verification-method) at AJV-instance construction so cross-schema `$ref`
 * to `pi-context://schemas/<name>` resolves synchronously without an async
 * `loadSchema` hook. Pre-registration also makes the URN identity surface
 * (FGAP-006 closure) usable from any caller of this module without each
 * caller restating the schemas.
 *
 * Pre-registration is best-effort: if a schema file is missing or malformed
 * (which would only happen during local dev with a half-applied edit), the
 * load throws synchronously at module init — the failure surfaces immediately
 * rather than as a confusing late `$ref` resolution error.
 *
 * The schema directory is resolved relative to this file, which means the
 * pre-registration works the same way whether the package is consumed from
 * source (via tsx) or from `dist/` post-build, because the schemas/ directory
 * sits one level above either `src/` or `dist/`.
 */
const FRAMEWORK_SCHEMA_NAMES = [
	"config",
	"relations",
	"bootstrap",
	"priority",
	"status",
	"severity",
	"source",
	"layer",
	"verification-method",
] as const;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// `__dirname` points at either `<pkg>/src/` (tsx) or `<pkg>/dist/` (built).
// Either way, `../schemas/` lands at `<pkg>/schemas/` because both `src/` and
// `dist/` are direct children of the package root.
const SCHEMAS_ROOT = path.resolve(__dirname, "..", "schemas");

for (const name of FRAMEWORK_SCHEMA_NAMES) {
	const schemaPath = path.join(SCHEMAS_ROOT, `${name}.schema.json`);
	if (!fs.existsSync(schemaPath)) {
		throw new Error(`schema-validator: framework schema missing at module init: ${schemaPath}`);
	}
	const raw = fs.readFileSync(schemaPath, "utf-8");
	let parsed: Record<string, unknown>;
	try {
		parsed = JSON.parse(raw);
	} catch (err) {
		throw new Error(
			`schema-validator: failed to parse framework schema ${schemaPath}: ${err instanceof Error ? err.message : String(err)}`,
		);
	}
	// addSchema is idempotent when the same key is registered twice with
	// identical content, but we guard anyway so reloads in test contexts
	// (which they are not currently doing, but might in future) do not throw
	// on duplicate-id errors.
	const id = (parsed as { $id?: string }).$id;
	if (id && ajv.getSchema(id)) {
		continue;
	}
	ajv.addSchema(parsed, id);
}

/**
 * Error class for validation failures.
 * Contains the original AJV errors and a formatted message.
 */
export class ValidationError extends Error {
	readonly label: string;
	readonly errors: ErrorObject[];

	constructor(label: string, errors: ErrorObject[]) {
		const details = errors.map((e) => `${e.instancePath || ""}: ${e.message}`).join("; ");
		super(`Validation failed for ${label}: ${details}`);
		this.name = "ValidationError";
		this.label = label;
		this.errors = errors;
	}
}

/**
 * Validate data against a JSON Schema object.
 * Throws ValidationError with formatted error messages on failure.
 * Returns the validated data on success (pass-through).
 *
 * `$ref` to any pre-registered framework schema (URN form
 * `pi-context://schemas/<name>`) resolves synchronously because those schemas
 * were added to the shared AJV instance at module init.
 *
 * When the supplied schema carries an `$id` that already matches a registered
 * schema on this AJV instance (e.g. the framework `config` / `relations`
 * schemas pre-registered above), the cached compiled validator is reused
 * rather than re-adding the schema — re-adding a duplicate `$id` throws
 * "schema with key or id ... already exists".
 */
export function validate(schema: Record<string, unknown>, data: unknown, label: string): unknown {
	const id = typeof schema.$id === "string" ? schema.$id : undefined;
	let valid: boolean;
	let errors: ErrorObject[] | null | undefined;
	if (id) {
		const cached = ajv.getSchema(id);
		if (cached) {
			valid = cached(data) as boolean;
			errors = cached.errors;
		} else {
			valid = ajv.validate(schema, data) as boolean;
			errors = ajv.errors;
		}
	} else {
		valid = ajv.validate(schema, data) as boolean;
		errors = ajv.errors;
	}
	if (!valid) {
		throw new ValidationError(label, errors ?? []);
	}
	return data;
}

/**
 * Validate that `schema` itself is a structurally-valid JSON Schema.
 * Routes through AJV's bundled draft-07 meta-schema via `ajv.validateSchema`,
 * which is the canonical "is this a schema?" check on the same AJV instance
 * already in use for data validation. Throws `ValidationError` listing every
 * meta-schema violation when the schema is malformed (e.g. unknown keyword
 * combinations, invalid `type` value, malformed `properties`). Returns the
 * input on success (pass-through, mirrors `validate`).
 *
 * Reusing the module-internal `ajv` instance is intentional per the rebuild
 * arc — the schema-write surface (FGAP-011) must not stand up a parallel AJV
 * instance with diverging strictness / format settings.
 */
export function validateSchemaAgainstMeta(schema: unknown, label: string): unknown {
	const valid = ajv.validateSchema(schema as Parameters<typeof ajv.validateSchema>[0]);
	if (valid !== true) {
		throw new ValidationError(label, ajv.errors ?? []);
	}
	return schema;
}

/**
 * Load a JSON Schema from a file path and validate data against it.
 * Throws if the schema file doesn't exist or is invalid JSON.
 * Throws ValidationError on validation failure.
 */
export function validateFromFile(schemaPath: string, data: unknown, label: string): unknown {
	let content: string;
	try {
		content = fs.readFileSync(schemaPath, "utf-8");
	} catch {
		throw new Error(`Schema file not found: ${schemaPath}`);
	}

	let schema: Record<string, unknown>;
	try {
		schema = JSON.parse(content);
	} catch (err) {
		throw new Error(`Invalid JSON in schema file: ${schemaPath}: ${err instanceof Error ? err.message : String(err)}`);
	}

	return validate(schema, data, label);
}

/**
 * Migration-aware block validation (FGAP-006 read-time migration surface).
 *
 * Aim: read a block file from disk, compare its declared `schema_version`
 * against the framework schema's `version`, run any registered migrations
 * forward via `runMigrations`, then validate the migrated data against the
 * current schema. This is the single entry point that lets a project on an
 * older block format keep loading after a schema bump, without rewriting the
 * file on disk.
 *
 * Behaviour:
 *   - `cwd` resolves to `<contextDir>/schemas/<schemaName>.schema.json` for
 *     the schema; user-state schemas under `.project/schemas/` win over
 *     framework schemas because that path is computed relative to `cwd`.
 *   - `data.schema_version` is read off the supplied data when present. When
 *     it is missing, the data is validated as-is (no migration attempted) —
 *     pre-FGAP-006 blocks have no version field and should pass through.
 *   - `registry` is optional; when omitted and the versions differ, the
 *     function throws (no chain to apply).
 *   - On match (`block.schema_version === schema.version`) or missing
 *     `schema_version` field, no migration runs and the data goes straight
 *     to `validate()`.
 *   - The migrated data is what gets validated; the input is not mutated.
 *
 * Out of scope: writing the migrated form back to disk — call sites that need
 * persistence handle that themselves via the block-write surface.
 */
export function validateBlockWithMigration(
	cwd: string,
	schemaName: string,
	data: unknown,
	registry?: MigrationRegistry,
): unknown {
	const schemaPath = schemaPathHelper(cwd, schemaName);
	if (!fs.existsSync(schemaPath)) {
		throw new Error(`validateBlockWithMigration: schema file not found at ${schemaPath}`);
	}

	let schema: Record<string, unknown>;
	try {
		schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
	} catch (err) {
		throw new Error(
			`validateBlockWithMigration: invalid JSON in ${schemaPath}: ${err instanceof Error ? err.message : String(err)}`,
		);
	}

	const schemaVersion = typeof schema.version === "string" ? (schema.version as string) : undefined;
	const blockVersion =
		data && typeof data === "object" && "schema_version" in (data as Record<string, unknown>)
			? ((data as Record<string, unknown>).schema_version as string | undefined)
			: undefined;

	let toValidate: unknown = data;
	if (schemaVersion && blockVersion && schemaVersion !== blockVersion) {
		if (!registry) {
			throw new Error(
				`validateBlockWithMigration: block at ${schemaName} declares schema_version '${blockVersion}' but schema is at '${schemaVersion}' and no MigrationRegistry was supplied`,
			);
		}
		toValidate = runMigrations(registry, schemaName, blockVersion, schemaVersion, data);
	}

	return validate(schema, toValidate, schemaName);
}
