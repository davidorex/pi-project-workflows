import fs from "node:fs";
import type { ErrorObject } from "ajv";
import _Ajv from "ajv";
import _addFormats from "ajv-formats";

// Node16 module resolution + CJS interop: default import is the module namespace
const Ajv = (_Ajv as any).default ?? _Ajv;
const addFormats = (_addFormats as any).default ?? _addFormats;
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

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
 */
export function validate(schema: Record<string, unknown>, data: unknown, label: string): unknown {
	const valid = ajv.validate(schema, data);
	if (!valid) {
		throw new ValidationError(label, ajv.errors ?? []);
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
