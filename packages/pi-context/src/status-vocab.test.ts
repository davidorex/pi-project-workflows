/**
 * Completeness guard for STATUS_VOCABULARY_DEFAULTS (sub-unit 2.6D).
 *
 * The going-forward conception (samples/schemas, DEC-0037 canon) is the source
 * of truth for status vocabulary. This test reads every status enum declared in
 * those schemas and asserts each value resolves in STATUS_VOCABULARY_DEFAULTS —
 * so a future conception schema that adds an unmapped (or wrongly-unknown)
 * status fails CI rather than silently bucketing to "unknown" and mis-firing
 * the status-consistency invariants / currentState derivation.
 *
 * Scope is the conception only (DEC-0036): retired registry-only vocab is NOT
 * guarded here; substrate-specific vocab is a config.status_buckets concern
 * (DEC-0025), not a framework-defaults concern.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { STATUS_VOCABULARY_DEFAULTS } from "./status-vocab.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLES_SCHEMAS_DIR = path.resolve(__dirname, "..", "samples", "schemas");

/** The ONLY status values permitted to bucket to "unknown" — terminal-but-not-
 * complete states that intentionally don't count toward progress. Any other
 * conception status mapping to "unknown" is a defect. */
const INTENDED_UNKNOWN = new Set(["superseded", "cancelled", "deferred", "abandoned", "wontfix", "skipped", "stale"]);

/** Recursively collect every `properties.status.enum` value found anywhere in a
 * schema object (top-level item status + any nested status enums). */
function collectStatusEnumValues(node: unknown, out: Map<string, Set<string>>, schemaName: string): void {
	if (!node || typeof node !== "object") return;
	const obj = node as Record<string, unknown>;
	const props = obj.properties as Record<string, unknown> | undefined;
	const status = props?.status as { enum?: unknown[] } | undefined;
	if (status?.enum && Array.isArray(status.enum)) {
		for (const v of status.enum) {
			if (typeof v !== "string") continue;
			if (!out.has(v)) out.set(v, new Set());
			out.get(v)?.add(schemaName);
		}
	}
	for (const key of Object.keys(obj)) collectStatusEnumValues(obj[key], out, schemaName);
}

/** value -> set of schema files declaring it (across all samples/schemas). */
function conceptionStatusValues(): Map<string, Set<string>> {
	const out = new Map<string, Set<string>>();
	for (const file of fs.readdirSync(SAMPLES_SCHEMAS_DIR)) {
		if (!file.endsWith(".schema.json")) continue;
		const schema = JSON.parse(fs.readFileSync(path.join(SAMPLES_SCHEMAS_DIR, file), "utf-8"));
		collectStatusEnumValues(schema, out, file.replace(".schema.json", ""));
	}
	return out;
}

describe("STATUS_VOCABULARY_DEFAULTS conception-completeness guard (2.6D)", () => {
	it("samples/schemas dir is present and declares status enums", () => {
		assert.ok(fs.existsSync(SAMPLES_SCHEMAS_DIR), `expected samples/schemas at ${SAMPLES_SCHEMAS_DIR}`);
		const values = conceptionStatusValues();
		assert.ok(values.size > 0, "expected at least one status enum value across samples/schemas");
	});

	it("every conception status enum value resolves in STATUS_VOCABULARY_DEFAULTS", () => {
		const values = conceptionStatusValues();
		const unmapped: string[] = [];
		for (const [value, files] of values) {
			if (STATUS_VOCABULARY_DEFAULTS[value] === undefined) {
				unmapped.push(`${value} [${[...files].join(",")}]`);
			}
		}
		assert.deepEqual(
			unmapped,
			[],
			`conception status values bucket to "unknown" (not in STATUS_VOCABULARY_DEFAULTS): ${unmapped.join("; ")}`,
		);
	});

	it('only the intended terminal-not-complete set maps to "unknown"', () => {
		const values = conceptionStatusValues();
		const offenders: string[] = [];
		for (const [value, files] of values) {
			if (STATUS_VOCABULARY_DEFAULTS[value] === "unknown" && !INTENDED_UNKNOWN.has(value)) {
				offenders.push(`${value} [${[...files].join(",")}]`);
			}
		}
		assert.deepEqual(
			offenders,
			[],
			`conception status values map to "unknown" but are not in the intended-unknown allowlist: ${offenders.join("; ")}`,
		);
	});

	it("the 12 sub-unit-D mappings are present and correct", () => {
		const expected: Record<string, string> = {
			closed: "complete",
			verified: "complete",
			"in-review": "in_progress",
			revised: "in_progress",
			partial: "in_progress",
			approved: "todo",
			ready: "todo",
			decided: "todo",
			abandoned: "unknown",
			wontfix: "unknown",
			skipped: "unknown",
			stale: "unknown",
		};
		for (const [value, bucket] of Object.entries(expected)) {
			assert.equal(STATUS_VOCABULARY_DEFAULTS[value], bucket, `${value} should bucket to ${bucket}`);
		}
	});
});
