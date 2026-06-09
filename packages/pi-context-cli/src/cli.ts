/**
 * pi-context — auto-tracking command-line interface over the pi-context
 * op-registry.
 *
 * The command set is derived by REFLECTION over the imported `ops` array
 * (`@davidorex/pi-context/ops`): every OpDefinition whose `surface === "use"`
 * becomes a CLI command. Adding an op to pi-context surfaces a new CLI command
 * with zero edits here — there is intentionally NO hardcoded op-name list. The
 * one op that depends on a pi-runtime handle (list-tools) carries
 * `surface: "process"` at source and is therefore filtered out by the same
 * partition, not by name.
 *
 * Per-op flags are derived from each op's typebox `parameters` schema: scalar
 * fields (string/number/boolean) take `--field value` (boolean is a presence
 * flag); object/array/typeless fields take a JSON argument (`--field '<json>'`
 * or `--field @file.json`). Required fields (op.parameters.required) are
 * enforced before invocation, except `writer`, which is schema-driven
 * auto-injected from the resolved operator identity when not passed explicitly.
 *
 * authGated ops mirror the pi-agent-dispatch auth-gate: `--yes`/`--force`
 * proceeds; interactive TTY prompts; non-interactive without `--yes` refuses.
 *
 * The pure pieces (resolveOp / parseOpArgs / deriveHelp / deriveTopHelp /
 * resolveIdentity / authDecision / useOps) are exported for unit testing.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { renderConflicts } from "@davidorex/pi-context";
import { nextId, readBlock, resolveBlockItemSchema } from "@davidorex/pi-context/block-api";
import { loadConfig } from "@davidorex/pi-context/context";
import { schemaPath } from "@davidorex/pi-context/context-dir";
import type { DispatchContext, WriterIdentity } from "@davidorex/pi-context/dispatch-context";
import {
	boundedJsonOutput,
	type OpDefinition,
	type OpResult,
	ops,
	renderOpResultText,
} from "@davidorex/pi-context/ops";
import { validateFromFile } from "@davidorex/pi-context/schema-validator";
import { readSchema } from "@davidorex/pi-context/schema-write";
import { runPiBound } from "./pi-bound.js";
import { formatAjvError, isValidationError, renderTable } from "./render.js";

/**
 * The surfaced command set: every op the CLI exposes. Derived by reflection —
 * NOT a hardcoded list. A `surface: "process"` op (currently only list-tools)
 * is excluded here by the partition, never by name.
 */
export const useOps: OpDefinition[] = ops.filter((o) => o.surface === "use");

/**
 * The pi-context-cli package version, read ONCE at module load from the shipped
 * package.json. Resolved RELATIVE to this module's URL (mirrors pi-bound.ts's
 * createRequire(import.meta.url) pattern) so it works from the BUILT bin: from
 * `dist/cli.js`, `../package.json` is the package root (npm always ships
 * package.json in a published tarball). A plain `import pkg from "../package.json"`
 * is deliberately avoided — tsconfig.build's rootDir:"./src" / include:["src/**"]
 * would make that compile path a hazard. `--version`/`-v` prints this value.
 */
export const PKG_VERSION: string = JSON.parse(
	readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"),
).version;

/** Field-type tag rendered in help and used to pick a coercion strategy. */
export type FieldType = "string" | "number" | "boolean" | "json";

interface FieldSchema {
	type?: string;
	description?: string;
	anyOf?: Array<{ type?: string; const?: unknown; enum?: unknown[] }>;
}

/**
 * Extract the literal string values of a string-enum field, or null for any
 * non-enum shape. A typebox `Type.Union([Type.Literal("eq"), …])` serializes at
 * runtime to `{ anyOf: [{ type: "string", const: "eq" }, …] }` with no
 * top-level `type` — so the union members must be read off `anyOf`.
 *
 * Returns the string values only when `anyOf` is a non-empty array and EVERY
 * element contributes string members (a `const` string, or — for forward
 * safety against an element-level `enum` shape — string members of an `enum`
 * array). Any element that fails to contribute makes the whole shape non-enum
 * (returns null), so mixed unions and non-string literals are left untouched
 * and continue to flow through the JSON path.
 */
export function stringEnumValues(field: FieldSchema): string[] | null {
	const anyOf = field.anyOf;
	if (!Array.isArray(anyOf) || anyOf.length === 0) return null;
	const values: string[] = [];
	for (const el of anyOf) {
		if (el.type === "string" && typeof el.const === "string") {
			values.push(el.const);
			continue;
		}
		if (Array.isArray(el.enum)) {
			const strings = el.enum.filter((e): e is string => typeof e === "string");
			if (strings.length === el.enum.length && strings.length > 0) {
				values.push(...strings);
				continue;
			}
		}
		return null;
	}
	return values.length > 0 ? values : null;
}

interface ObjectSchema {
	properties?: Record<string, FieldSchema>;
	required?: string[];
}

/** The typebox Type.Object value carried at runtime on op.parameters. */
function objectSchema(op: OpDefinition): ObjectSchema {
	return (op.parameters as unknown as ObjectSchema) ?? {};
}

/**
 * Map a typebox field schema to a CLI field type. Scalars carry an explicit
 * `type`; Type.Unknown() has no `type`; Type.Record/Type.Object report
 * `type:"object"`; arrays `type:"array"` — all of which are JSON-arg fields.
 */
export function fieldType(field: FieldSchema): FieldType {
	// String-enum unions (Type.Union of string literals) coerce as verbatim
	// strings — identical to a plain string field — not as JSON.
	if (stringEnumValues(field) !== null) return "string";
	switch (field.type) {
		case "string":
			return "string";
		case "number":
		case "integer":
			return "number";
		case "boolean":
			return "boolean";
		default:
			// object | array | undefined (Type.Unknown) → JSON argument
			return "json";
	}
}

/** Look up a surfaced op by name. Returns undefined for unknown/non-use ops. */
export function resolveOp(name: string): OpDefinition | undefined {
	return useOps.find((o) => o.name === name);
}

/** True when `name` is a real op but not surfaced via the CLI (surface!=="use"). */
export function isProcessOnlyOp(name: string): boolean {
	return ops.some((o) => o.name === name) && !useOps.some((o) => o.name === name);
}

/**
 * Resolve the operator identity for schema-driven writer injection. Cascade
 * (replicated from pi-agent-dispatch getVerifiedOperatorIdentity, which is not
 * importable without dragging the dispatch tree):
 *   (1) `git config user.email`, trimmed, if non-empty
 *   (2) process.env.USER, if non-empty
 *   (3) null
 * Dependencies are injectable for unit testing.
 */
export function resolveIdentity(deps?: {
	gitEmail?: () => string | null;
	envUser?: string | undefined;
}): string | null {
	const gitEmail =
		deps?.gitEmail ??
		(() => {
			try {
				return execSync("git config user.email", {
					encoding: "utf8",
					stdio: ["ignore", "pipe", "ignore"],
				}).trim();
			} catch {
				return null;
			}
		});
	const envUser = deps && "envUser" in deps ? deps.envUser : process.env.USER;

	const email = gitEmail();
	if (email && email.length > 0) return email;
	if (envUser && envUser.length > 0) return envUser;
	return null;
}

export interface ParsedArgs {
	cwd: string;
	json: boolean;
	yes: boolean;
	help: boolean;
	/** --show-schema (FGAP-022): print the block contract and exit before any write. */
	showSchema?: boolean;
	/**
	 * --dryRun / --dry-run (FGAP-024): for append-block-item, validate the prospective
	 * whole file and write nothing. Parsed as a global flag — never injected into
	 * `params` — because the frozen append op declares no `dryRun` param and would
	 * reject it as an unknown flag.
	 */
	dryRun?: boolean;
	/** Selected output render (FGAP-021). Unset → resolved from `json` at emit time. */
	format?: "text" | "json" | "table";
	explicitWriter?: unknown;
	params: Record<string, unknown>;
}

export class UsageError extends Error {}

/**
 * Parse the argv tail (everything after the op name) against the op's schema.
 * Throws UsageError on unknown flags, missing required fields, or malformed
 * values. Does NOT inject the writer or evaluate the auth gate — callers do
 * that after parsing so those concerns stay independently testable.
 */
export function parseOpArgs(op: OpDefinition, argv: string[], cwdBase = process.cwd()): ParsedArgs {
	const schema = objectSchema(op);
	const props = schema.properties ?? {};
	const out: ParsedArgs = {
		cwd: cwdBase,
		json: false,
		yes: false,
		help: false,
		params: {},
	};

	for (let i = 0; i < argv.length; i++) {
		const tok = argv[i];
		if (tok === "--help" || tok === "-h") {
			out.help = true;
			continue;
		}
		if (tok === "--show-schema") {
			// FGAP-022 — global flag (not an op param): print the block contract and exit.
			out.showSchema = true;
			continue;
		}
		if (op.name === "append-block-item" && (tok === "--dryRun" || tok === "--dry-run") && props.dryRun === undefined) {
			// FGAP-024 — `--dry-run` is a GLOBAL flag scoped to append-block-item, the
			// sole op the main() honor branch handles: it declares no `dryRun` param yet
			// supports a client-side prospective-whole-file dry run. The token is captured
			// here and NEVER routed into params, because the frozen op would reject
			// `dryRun` as an unknown flag. Both the camel and kebab tokens are matched
			// explicitly since, not being a schema key on this op, neither would resolve
			// through the kebab→camel normalization below.
			//
			// For ops that DO declare a `dryRun` param (relation ops, upsert, update, …)
			// `props.dryRun === undefined` is false, so this branch was already skipped and
			// the token flows to the boolean-param handling, preserving the op's own dryRun
			// semantics. For every OTHER no-`dryRun` op (the non-append block-mutation ops)
			// the token is NOT swallowed here; it falls through to the unknown-flag throw
			// below (UsageError → exit 2), a clean rejection rather than a silent write.
			out.dryRun = true;
			continue;
		}
		if (tok === "--json") {
			out.json = true;
			continue;
		}
		if (tok === "--yes" || tok === "--force") {
			out.yes = true;
			continue;
		}
		if (tok === "--cwd") {
			const v = argv[++i];
			if (v === undefined) throw new UsageError("--cwd requires a directory argument");
			out.cwd = path.isAbsolute(v) ? v : path.resolve(cwdBase, v);
			continue;
		}
		if (tok === "--format") {
			// FGAP-021 — explicit render selector. `text` reproduces each op's prior
			// run() text; `json` is the `--json` envelope; `table` projects a renderable
			// array (read-page / data array) as markdown. An unknown value is an operator
			// error, not a silent fallback.
			const v = argv[++i];
			if (v === undefined) throw new UsageError("--format requires one of: text, json, table");
			if (v !== "text" && v !== "json" && v !== "table") {
				throw new UsageError(`--format expects one of: text, json, table; got '${v}'`);
			}
			out.format = v;
			continue;
		}
		if (tok === "--writer") {
			const v = argv[++i];
			if (v === undefined) throw new UsageError("--writer requires a JSON argument");
			// Shorthand `kind:id` (FGAP-025): a value that is neither `{`-prefixed JSON
			// nor an `@file` reference and matches `<kind>:<identifier>` expands to the
			// canonical {kind, <id-field>:<rest>} WriterIdentity (the id-field per
			// WRITER_KIND_IDENTIFIER_FIELD). The rest may itself contain colons (an
			// email or step-id) — only the FIRST colon delimits kind from identifier.
			// A JSON / @file value (the canonical form) is parsed unchanged.
			const shorthand = /^(human|agent|monitor|workflow):(.+)$/.exec(v);
			if (shorthand && !v.startsWith("@")) {
				const kind = shorthand[1] as WriterIdentity["kind"];
				out.explicitWriter = { kind, [WRITER_KIND_IDENTIFIER_FIELD[kind]]: shorthand[2] };
				continue;
			}
			try {
				out.explicitWriter = v.startsWith("@") ? JSON.parse(readFileSync(v.slice(1), "utf8")) : JSON.parse(v);
			} catch (err) {
				throw new UsageError(`--writer: ${err instanceof Error ? err.message : String(err)}`);
			}
			continue;
		}
		// `--where field:op:value` shorthand (FGAP-025): a single token expanding to
		// the op's declared field/op/value params. Split on the FIRST TWO colons only —
		// the value segment may itself contain colons. The canonical explicit
		// `--field/--op/--value` flags remain available and pass through unchanged.
		if (tok === "--where") {
			const v = argv[++i];
			if (v === undefined) throw new UsageError("--where requires a field:op:value argument");
			const c1 = v.indexOf(":");
			const c2 = c1 >= 0 ? v.indexOf(":", c1 + 1) : -1;
			if (c1 < 0 || c2 < 0) {
				throw new UsageError(`--where expects field:op:value; got '${v}'`);
			}
			out.params.field = v.slice(0, c1);
			out.params.op = v.slice(c1 + 1, c2);
			out.params.value = v.slice(c2 + 1);
			continue;
		}
		if (!tok.startsWith("--")) {
			throw new UsageError(`unexpected argument: ${tok}`);
		}

		// Raw token kept verbatim for error messages; `field` resolves to the op's
		// actual property key via the normalization layer below.
		let field = tok.slice(2);
		// FGAP-032 — `--id` aliases the op's single declared id-param. An op may key
		// its id param `id`, or `<x>Id` (itemId/parentId/taskId/unitId/…). When the op
		// has no literal `id` property and exactly one such param, `--id` resolves to
		// it; zero leaves `field` as-is (the unknown-flag error fires); two or more is
		// ambiguous (the caller must name the explicit flag). An id-param is always
		// string-typed (every identity selector is Type.String / Type.Optional(String));
		// the string-type guard excludes boolean flags whose name happens to end in `Id`
		// — e.g. append-block-item's `autoId` (a Type.Boolean allocation flag, not an
		// identity selector) — so `--id` never silently binds to them.
		if (field === "id" && props.id === undefined) {
			const idParams = Object.keys(props).filter(
				(k) => (k === "id" || /Id$/.test(k)) && fieldType(props[k]) === "string",
			);
			if (idParams.length === 1) {
				field = idParams[0];
			} else if (idParams.length >= 2) {
				throw new UsageError(
					`ambiguous --id (op declares ${idParams.length} id-params: ${idParams.join(", ")}); use the explicit flag`,
				);
			}
		} else if (props[field] === undefined && field.includes("-")) {
			// FGAP-064 — kebab→camel normalization: a conventional `--dry-run` / `--id`
			// kebab form resolves to the camelCase op-schema key (`dryRun`) when that
			// camel key exists. An unresolved kebab token stays raw → unknown-flag error.
			const camel = field.replace(/-([a-z0-9])/g, (_m, c: string) => c.toUpperCase());
			if (props[camel] !== undefined) {
				field = camel;
			}
		}
		const fschema = props[field];
		if (fschema === undefined) {
			throw new UsageError(`unknown flag: ${tok}`);
		}
		const kind = fieldType(fschema);

		if (kind === "boolean") {
			// Presence flag; accept an optional explicit true|false next token.
			const next = argv[i + 1];
			if (next === "true" || next === "false") {
				out.params[field] = next === "true";
				i++;
			} else {
				out.params[field] = true;
			}
			continue;
		}

		const value = argv[++i];
		if (value === undefined) throw new UsageError(`--${field} requires a value`);

		if (kind === "number") {
			const n = Number(value);
			if (Number.isNaN(n)) throw new UsageError(`--${field} expects a number, got '${value}'`);
			out.params[field] = n;
		} else if (kind === "string") {
			const vals = stringEnumValues(fschema);
			if (vals !== null && !vals.includes(value)) {
				throw new UsageError(`--${field} expects one of: ${vals.join(", ")}; got '${value}'`);
			}
			out.params[field] = value;
		} else {
			// json: inline JSON or @file
			try {
				out.params[field] = value.startsWith("@")
					? JSON.parse(readFileSync(value.slice(1), "utf8"))
					: JSON.parse(value);
			} catch (err) {
				// FGAP-025: the `value` field (the comparison operand of
				// filter-block-items, Type.Unknown) is the sole CSV-shorthand target. A
				// bare unquoted operand that is not valid JSON is retained as the raw
				// string so the post-loop `--op in` CSV pass can split it (and an
				// unquoted scalar operand still reaches the op as a string). Every other
				// json field keeps the strict parse-or-error contract (e.g. a malformed
				// `--item` is an operator error, never a silent string).
				if (field === "value" && !value.startsWith("@")) {
					out.params[field] = value;
				} else {
					throw new UsageError(`--${field}: ${err instanceof Error ? err.message : String(err)}`);
				}
			}
		}
	}

	if (out.explicitWriter !== undefined) {
		out.params.writer = out.explicitWriter;
	}

	// CSV `--op in` normalization (FGAP-025): the `in` membership operator takes a
	// list value. When `op === "in"` and the value arrived as a single string,
	// split it on commas into the string array the op's declared shape expects.
	// Argv-order-independent — runs after the whole loop, so `--value a,b,c --op in`
	// and `--op in --value a,b,c` both normalize. A value already an array passes
	// through unchanged (the typeof guard).
	if (out.params.op === "in" && typeof out.params.value === "string") {
		out.params.value = out.params.value.split(",");
	}

	// Required-field check — the exemption set derives from AUTO_SUPPLIED, the single
	// source for the CLI auto-supplied param contract: a key there is auto-supplied, so
	// it is exempt from this missing-required check, rendered bracketed-optional in the
	// per-op synopsis (isSynopsisRequired), and `autoSupplied`-annotated in the Flags
	// block. Concretely today: `writer` (injectWriter fills it from the resolved operator
	// identity after parse) and `arrayKey` (injectArrayKey derives it from
	// config.block_kinds[].array_key for the block-mutation ops after parse, FGAP-019, so
	// a `--block` without an explicit `--arrayKey` must not be flagged missing here).
	// Adding a new AUTO_SUPPLIED key also requires adding its injector (injectWriter /
	// injectArrayKey-style): the map single-sources the exemption/help CONTRACT, not the
	// value-supply wiring.
	// `--help` and `--show-schema` exit before any op invocation and need no item, so
	// the required-field check is skipped for them (FGAP-022). `--dryRun` still requires
	// the op's declared inputs (it validates a prospective item) and so is NOT exempt.
	if (!out.help && !out.showSchema) {
		const required = (schema.required ?? []).filter((r) => !(r in AUTO_SUPPLIED));
		const missing = required.filter((r) => !(r in out.params));
		if (missing.length > 0) {
			throw new UsageError(`missing required: ${missing.map((m) => `--${m}`).join(", ")}`);
		}
	}

	return out;
}

/**
 * Schema-driven writer injection: when the op declares a `writer` field and the
 * caller did not pass `--writer`, fill params.writer from the resolved operator
 * identity (falling back to "operator"). Mutates and returns `params`.
 */
export function injectWriter(
	op: OpDefinition,
	params: Record<string, unknown>,
	identity: string | null,
): Record<string, unknown> {
	const props = objectSchema(op).properties ?? {};
	if (props.writer !== undefined && params.writer === undefined) {
		params.writer = { kind: "human", user: identity ?? "operator" };
	}
	return params;
}

/**
 * Schema- + config-driven arrayKey injection (FGAP-019), mirroring injectWriter.
 * The 7 block-mutation ops still DECLARE `arrayKey` required (their in-pi schema +
 * handler are byte-unchanged and still receive + require it) — the CLI supplies it
 * pre-call so a caller passes only `--block`. When the op declares `arrayKey`, none
 * was passed, and a string `block` is present, derive the array_key from the
 * config block_kinds entry whose canonical_id matches `block` (canonical_id ≠
 * array_key in real data, e.g. framework-gaps → gaps, so the derivation is genuinely
 * needed). Best-effort: no substrate, no config, or an unknown block leaves arrayKey
 * unset — the op then throws its own missing-param error. Mutates and returns params.
 */
export function injectArrayKey(
	op: OpDefinition,
	params: Record<string, unknown>,
	cwd: string,
): Record<string, unknown> {
	const props = objectSchema(op).properties ?? {};
	if (props.arrayKey !== undefined && params.arrayKey === undefined && typeof params.block === "string") {
		let cfg: ReturnType<typeof loadConfig> = null;
		try {
			cfg = loadConfig(cwd);
		} catch {
			cfg = null;
		}
		const bk = cfg?.block_kinds.find((b) => b.canonical_id === params.block);
		if (bk) params.arrayKey = bk.array_key;
	}
	return params;
}

/**
 * Build the DispatchContext threaded into `op.run` as its 3rd arg so every CLI
 * write op stamps attestation (created_by / created_at) on schemas that declare
 * author fields. Identity precedence:
 *   - an explicit `--writer` (parsed JSON) is used verbatim as the writer — it
 *     may already be a full WriterIdentity ({kind, ...}) or the {kind, user}
 *     shape the smuggle-ops declare; either way it is the operator's stated
 *     identity, so it is passed through unchanged.
 *   - otherwise a human writer from the resolved operator identity, falling
 *     back to "operator" (mirrors injectWriter's fallback).
 *
 * This is independent of injectWriter, which fills the schema `writer` PARAM
 * the smuggle-ops (promote-item / write-schema-migration) still DECLARE so the
 * in-pi auth-gate has a field to stamp. The op bodies now read the contract ctx
 * built here, not params.writer; the param + ctx coexist harmlessly.
 */
export function buildCliDispatchContext(explicitWriter: unknown, identity: string | null): DispatchContext {
	if (explicitWriter !== undefined) {
		if (explicitWriter === null || typeof explicitWriter !== "object") {
			throw new UsageError('--writer must be a valid WriterIdentity, e.g. {"kind":"human","user":"me@example.com"}');
		}
		assertWriterIdentity(explicitWriter);
		return { writer: explicitWriter };
	}
	return { writer: { kind: "human", user: identity ?? "operator" } };
}

/** The identifier field each WriterIdentity kind requires as a non-empty string. */
const WRITER_KIND_IDENTIFIER_FIELD: Record<WriterIdentity["kind"], string> = {
	human: "user",
	agent: "agent_id",
	monitor: "monitor_name",
	workflow: "workflow_step_id",
};

/**
 * Narrow an arbitrary object to a well-formed WriterIdentity, or throw
 * UsageError. A valid writer has a `kind` of human/agent/monitor/workflow AND
 * the kind's required identifier field present as a non-empty string. A
 * malformed explicit writer is an operator error — never a silent fallback.
 */
function assertWriterIdentity(value: object): asserts value is WriterIdentity {
	const rec = value as Record<string, unknown>;
	const kind = rec.kind;
	if (kind !== "human" && kind !== "agent" && kind !== "monitor" && kind !== "workflow") {
		throw new UsageError('--writer must be a valid WriterIdentity, e.g. {"kind":"human","user":"me@example.com"}');
	}
	const idField = WRITER_KIND_IDENTIFIER_FIELD[kind];
	const idValue = rec[idField];
	if (typeof idValue !== "string" || idValue.length === 0) {
		throw new UsageError(
			`--writer kind '${kind}' requires a non-empty '${idField}'; e.g. {"kind":"${kind}","${idField}":"..."}`,
		);
	}
}

export type AuthDecision = { allow: true } | { allow: false; reason: string; needsPrompt: boolean };

/**
 * Pure auth-gate decision (no I/O). Mirrors the pi-agent-dispatch gate:
 *  - not gated → allow
 *  - --yes/--force → allow
 *  - interactive TTY → defer to a prompt (needsPrompt)
 *  - non-interactive without --yes → refuse
 */
export function authDecision(op: OpDefinition, opts: { yes: boolean; interactive: boolean }): AuthDecision {
	if (op.authGated !== true) return { allow: true };
	if (opts.yes) return { allow: true };
	if (opts.interactive) return { allow: false, needsPrompt: true, reason: "interactive confirmation required" };
	return {
		allow: false,
		needsPrompt: false,
		reason: `${op.name} requires authorization; re-run with --yes in a non-interactive context`,
	};
}

/**
 * One flag descriptor in the machine-readable help model (CHANGE 3 / TASK-042).
 * `type` is the enum-join (`eq|neq|in|matches`) for string-enum fields, else the
 * coarse FieldType tag. `required` reflects the op's declared schema `required` set
 * verbatim (writer/arrayKey ARE marked required here — schema-truth). `autoSupplied`
 * carries the AUTO_SUPPLIED provenance phrase when the CLI fills the param after
 * parse (writer / arrayKey), else omitted — the Flags block + json help render it as
 * `(required; <autoSupplied>)` so a schema-required-but-CLI-supplied param is not
 * mistaken for one the caller must pass.
 */
export interface HelpFlag {
	name: string;
	type: string;
	required: boolean;
	description?: string;
	autoSupplied?: string;
}

/**
 * Structured per-op help model — the single source both the text template
 * (deriveHelp) and the `--help --format json` machine help render from.
 *
 * `synopsis` treats `writer` and `arrayKey` as OPTIONAL even when the schema lists
 * them required, because both are auto-injected after parse (writer from the
 * resolved operator identity; arrayKey from config.block_kinds[].array_key) — the
 * same exemption parseOpArgs applies to its required-field check. So a flag is
 * synopsis-required iff it is schema-required AND not writer/arrayKey.
 *
 * `related` is the sibling use-ops sharing this op's top-level help group
 * (groupForOp — the single grouping source the top-level help uses), name-sorted,
 * self excluded. pi-bound modes are not useOps, so they never appear.
 */
export interface HelpModel {
	name: string;
	synopsis: string;
	summary: string;
	flags: HelpFlag[];
	examples: string[];
	related: string[];
}

/**
 * Single source for the CLI's auto-supplied params: a field declared `required`
 * by the op schema that the CLI fills after parse, so the caller never passes it.
 * Maps the param name to its provenance phrase. This map is the ONE source for
 * both the synopsis exemption (bracketed-optional, `isSynopsisRequired`) and the
 * per-flag `autoSupplied` annotation surfaced in the Flags block + json help —
 * reconciling the Flags `(required)` schema-truth with the optional synopsis so
 * neither surface contradicts the other (TASK-042 iterate-to-zero finding):
 *   - writer:   injectWriter fills it from the resolved operator identity
 *   - arrayKey: injectArrayKey derives it from config.block_kinds[].array_key
 */
export const AUTO_SUPPLIED: Record<string, string> = {
	writer: "auto-injected",
	arrayKey: "auto-derived from --block",
};

/**
 * A field is synopsis-required iff the schema lists it required AND the CLI does
 * NOT auto-supply it. Auto-supplied params (AUTO_SUPPLIED) are post-parse fills,
 * so they render bracketed-optional in the synopsis even when schema-required —
 * derived from AUTO_SUPPLIED so the exemption and the `autoSupplied` annotation
 * share one source (no hardcoded writer/arrayKey literal here).
 */
function isSynopsisRequired(field: string, schemaRequired: Set<string>): boolean {
	return schemaRequired.has(field) && !(field in AUTO_SUPPLIED);
}

/**
 * Build the structured per-op help model from the op's typebox parameters +
 * the registry `examples` + the help-group siblings. Pure — no I/O.
 */
export function buildHelpModel(op: OpDefinition): HelpModel {
	const schema = objectSchema(op);
	const props = schema.properties ?? {};
	const required = new Set(schema.required ?? []);

	const flags: HelpFlag[] = Object.entries(props).map(([name, fschema]) => {
		const vals = stringEnumValues(fschema);
		return {
			name,
			type: vals ? vals.join("|") : fieldType(fschema),
			required: required.has(name),
			...(fschema.description ? { description: fschema.description } : {}),
			...(name in AUTO_SUPPLIED ? { autoSupplied: AUTO_SUPPLIED[name] } : {}),
		};
	});

	// Synopsis: required (sans writer/arrayKey) then optional, each `--<f> <type>`,
	// optionals bracketed. writer/arrayKey fall into the optional/bracketed set.
	const synReq: string[] = [];
	const synOpt: string[] = [];
	for (const f of flags) {
		const token = `--${f.name} <${f.type}>`;
		if (isSynopsisRequired(f.name, required)) synReq.push(token);
		else synOpt.push(`[${token}]`);
	}
	const synopsis = [`pi-context ${op.name}`, ...synReq, ...synOpt].join(" ");

	const group = groupForOp(op.name);
	const related = useOps
		.filter((o) => o.name !== op.name && groupForOp(o.name) === group)
		.map((o) => o.name)
		.sort();

	return {
		name: op.name,
		synopsis,
		summary: op.promptSnippet ?? op.description,
		flags,
		examples: op.examples ?? [],
		related,
	};
}

/**
 * Best-of-breed per-op help text (TASK-042): `<name> — <description>` → SYNOPSIS →
 * Flags (per-field, enum joins + required/optional + desc; json fields show
 * `<json | @file>`) → EXAMPLES → RELATED (omitted when empty) → footer →
 * the Global flags trailer. Plain text.
 */
export function deriveHelp(op: OpDefinition): string {
	const model = buildHelpModel(op);
	const lines = [`${op.name} — ${op.description}`, "", "SYNOPSIS", `  ${model.synopsis}`, ""];

	if (model.flags.length === 0) {
		lines.push("  (no parameters)");
	} else {
		lines.push("Flags:");
		for (const f of model.flags) {
			const typeShown = f.type === "json" ? "json | @file" : f.type;
			// required/optional is schema-truth; an auto-supplied param appends its
			// provenance (`required; auto-derived from --block`) so the (required) tag
			// here does not contradict the bracketed-optional synopsis.
			const baseTag = f.required ? "required" : "optional";
			const tag = f.autoSupplied ? `${baseTag}; ${f.autoSupplied}` : baseTag;
			const desc = f.description ? ` — ${f.description}` : "";
			lines.push(`  --${f.name} <${typeShown}>  (${tag})${desc}`);
		}
	}

	if (model.examples.length > 0) {
		lines.push("", "EXAMPLES");
		for (const ex of model.examples) lines.push(`  ${ex}`);
	}

	if (model.related.length > 0) {
		lines.push("", "RELATED", `  ${model.related.join("  ")}`);
	}

	lines.push(
		"",
		`Run 'pi-context --help' for all commands; '${op.name} --help --format json' for machine-readable help.`,
		"Global flags: --cwd <dir>  --json  --format text|json|table  --yes  --writer <json>  --show-schema  --dry-run  --help",
	);
	return lines.join("\n");
}

/**
 * Group definitions for the grouped top-level help (CHANGE A). Each group has a
 * human-readable `label` and a `match(name)` predicate. The list is ORDERED
 * read-before-mutate (reads/queries → block writes → relations → schema/config →
 * lifecycle → workflow), and `groupForOp` returns the FIRST group whose predicate
 * matches (first-match-wins). Predicates are a mix of explicit name-sets and
 * name-prefixes; together they must be EXHAUSTIVE and DISJOINT over `useOps` — the
 * drift-guard test (`cli.test.ts`) is the real enforcement. Ordering is load-
 * bearing where prefixes would otherwise collide: Relations (`*-relation(s)`) is
 * listed BEFORE Block writes so `append-relation`/`remove-relation` slot to
 * Relations, not to the `append-/remove-*` block-write prefixes; the explicit
 * `context-*` read/lifecycle/workflow name-sets precede any bare `context-` rule.
 *
 * Process modes (`pi-bound`) are NOT registry-driven — they are rendered as a
 * static section in `deriveTopHelp`, never classified through `groupForOp`.
 */
interface HelpGroup {
	label: string;
	match: (name: string) => boolean;
}

/** Membership test against an explicit name-set. */
const oneOf =
	(...names: string[]): ((name: string) => boolean) =>
	(name) =>
		names.includes(name);

const HELP_GROUPS: HelpGroup[] = [
	{
		label: "Read & query",
		match: (n) =>
			n.startsWith("read-") ||
			oneOf(
				"filter-block-items",
				"join-blocks",
				"resolve-item-by-id",
				"resolve-items-by-id",
				"find-references",
				"walk-ancestors",
				"context-walk-descendants",
				"context-edges-for-lens",
				"context-lens-view",
				"context-status",
				"context-current-state",
				"context-bootstrap-state",
				"context-validate",
				"context-validate-relations",
				"gather-execution-context",
			)(n),
	},
	{
		// Relations BEFORE Block writes: `*-relation` / `*-relations` must win over
		// the `append-`/`remove-` block-write prefixes below.
		label: "Relations",
		match: (n) => n.endsWith("-relation") || n.endsWith("-relations"),
	},
	{
		label: "Block writes",
		match: (n) =>
			oneOf(
				"append-block-item",
				"update-block-item",
				"upsert-block-item",
				"remove-block-item",
				"append-block-nested-item",
				"update-block-nested-item",
				"remove-block-nested-item",
				"write-block",
			)(n),
	},
	{
		label: "Schema & config",
		match: oneOf(
			"write-schema",
			"write-schema-migration",
			"amend-config",
			"update",
			"resolve-conflict",
			"rename-canonical-id",
		),
	},
	{
		label: "Substrate lifecycle",
		match: oneOf("context-init", "context-accept-all", "context-switch", "context-list", "context-archive"),
	},
	{
		label: "Workflow",
		match: (n) => n.startsWith("context-roadmap-") || oneOf("complete-task", "promote-item")(n),
	},
];

/**
 * Classify a use-op into its top-level help group LABEL (first-match-wins over the
 * ordered HELP_GROUPS). Throws when a use-op matches no group — a new op that slips
 * past every rule fails loudly here rather than silently vanishing from the help.
 * The drift-guard test asserts every `useOps` name maps to exactly one group.
 */
export function groupForOp(name: string): string {
	const group = HELP_GROUPS.find((g) => g.match(name));
	if (group === undefined) {
		throw new Error(`groupForOp: op '${name}' matches no help group — add it to HELP_GROUPS`);
	}
	return group.label;
}

/** Max one-liner width before truncation in the grouped help. */
const HELP_ONELINER_WIDTH = 72;

/**
 * One-liner for an op row: prefer `promptSnippet` (the terse reflection summary),
 * fall back to `description`. Collapse to a single line, then truncate uniformly to
 * ~HELP_ONELINER_WIDTH at the last word boundary, appending an ellipsis when cut.
 * Applied to EVERY row identically — no per-op special-casing, and the ops-registry
 * text itself is never edited.
 */
export function helpOneLiner(op: OpDefinition): string {
	const raw = (op.promptSnippet ?? op.description).split("\n")[0].trim();
	if (raw.length <= HELP_ONELINER_WIDTH) return raw;
	const head = raw.slice(0, HELP_ONELINER_WIDTH);
	const lastSpace = head.lastIndexOf(" ");
	const cut = lastSpace > 0 ? head.slice(0, lastSpace) : head;
	return `${cut.trimEnd()}…`;
}

/**
 * Grouped, scannable top-level help. Sections appear in HELP_GROUPS order (only
 * groups with ≥1 op), ops sorted alphabetically within a group, each row a name
 * padded to the group's own max-name width followed by the truncated one-liner.
 * A static Process modes section surfaces `pi-bound` (a process mode, not a
 * substrate op). The Global flags block is retained verbatim plus `--version`.
 * Plain text only.
 */
export function deriveTopHelp(): string {
	const lines: string[] = ["pi-context <op> [flags]", ""];

	for (const group of HELP_GROUPS) {
		const groupOps = useOps
			.filter((o) => groupForOp(o.name) === group.label)
			.sort((a, b) => a.name.localeCompare(b.name));
		if (groupOps.length === 0) continue;
		const width = Math.max(...groupOps.map((o) => o.name.length));
		lines.push(group.label);
		for (const op of groupOps) {
			lines.push(`  ${op.name.padEnd(width)}  —  ${helpOneLiner(op)}`);
		}
		lines.push("");
	}

	lines.push("Process modes");
	lines.push("  pi-bound  —  Launch an embedded pi agent in-process on a bounded tool surface");
	lines.push("");

	lines.push(
		"Global flags:",
		"  --cwd <dir>      substrate root (default: cwd)",
		"  --json           emit { ok, op, output } envelope (≡ --format json)",
		"  --format <fmt>   render as text | json | table (default: text, or json with --json)",
		"  --yes, --force   pre-authorize gated ops in non-interactive contexts",
		"  --writer <json>  override the auto-resolved writer identity",
		"  --show-schema    preview a block op's contract (array_key/required/types/id) and exit",
		"  --dry-run        append-block-item: validate the prospective file, write nothing",
		"  --version, -v    print the pi-context version and exit",
		"  --help, -h       this help, or per-op help after an op name",
	);
	return lines.join("\n");
}

/** Prompt the operator on an interactive TTY. Resolves true on y/yes. */
function promptConfirm(opName: string): Promise<boolean> {
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	return new Promise((resolve) => {
		rl.question(`Authorize ${opName}? [y/N] `, (answer) => {
			rl.close();
			const a = answer.trim().toLowerCase();
			resolve(a === "y" || a === "yes");
		});
	});
}

/**
 * FGAP-021 — extract the renderable row array from an OpResult for `--format table`,
 * or null when the result is not a complete tabular collection. Precedence:
 *   - `{read}` whose `data` is an array AND `complete !== false` (an over-cap read,
 *     complete:false with data:null, is NOT tabular) → that array;
 *   - `{read}` whose `data` is an object exposing an `items` array → `.items`
 *     (the paged-collection shape: {items,total,hasMore});
 *   - `{json}` whose value is an array → that array;
 *   - anything else (prose, scalar/object data, over-cap, non-array) → null,
 *     so the dispatch falls back to text rather than emit a degenerate table.
 */
function tabularRows(r: OpResult): unknown[] | null {
	if (typeof r === "string") return null;
	if ("read" in r) {
		const read = r.read;
		if (read.complete === false) return null;
		if (Array.isArray(read.data)) return read.data;
		if (read.data !== null && typeof read.data === "object") {
			const items = (read.data as Record<string, unknown>).items;
			if (Array.isArray(items)) return items;
		}
		return null;
	}
	if ("json" in r && Array.isArray(r.json)) return r.json;
	return null;
}

export async function main(argv: string[]): Promise<number> {
	const first = argv[0];

	if (first === undefined || first === "--help" || first === "-h") {
		process.stdout.write(`${deriveTopHelp()}\n`);
		return 0;
	}

	if (first === "--version" || first === "-v") {
		// CHANGE B — print the package version (read once at module load, build-safe
		// relative to dist/cli.js) and exit. STDOUT, exit 0. Placed before the
		// pi-bound branch and resolveOp so `--version`/`-v` are never mistaken for ops.
		process.stdout.write(`pi-context ${PKG_VERSION}\n`);
		return 0;
	}

	if (first === "pi-bound") {
		return runPiBound(argv.slice(1));
	}

	const op = resolveOp(first);
	if (op === undefined) {
		if (isProcessOnlyOp(first)) {
			process.stderr.write(`${first} is not available via the CLI (process-only op)\n`);
		} else {
			process.stderr.write(`unknown command: ${first}\n\n${deriveTopHelp()}\n`);
		}
		return 2;
	}

	let parsed: ParsedArgs;
	try {
		parsed = parseOpArgs(op, argv.slice(1));
	} catch (err) {
		if (err instanceof UsageError) {
			process.stderr.write(`error: ${err.message}\n\n${deriveHelp(op)}\n`);
			return 2;
		}
		throw err;
	}

	if (parsed.help) {
		// `--help --format json` (or `--help --json`) emits the machine-readable
		// HelpModel; otherwise the text template. table → text fallback (only json
		// diverges). parsed.format/parsed.json are already populated by parseOpArgs.
		const helpFormat = parsed.format ?? (parsed.json ? "json" : "text");
		if (helpFormat === "json") {
			process.stdout.write(`${JSON.stringify(buildHelpModel(op))}\n`);
		} else {
			process.stdout.write(`${deriveHelp(op)}\n`);
		}
		return 0;
	}

	// FGAP-022 — `--show-schema`: preview the block contract (array_key / required /
	// field types / id pattern) and exit 0 BEFORE any write. Only meaningful for the
	// block-mutation ops (the ops that declare `arrayKey` and take a `--block`); on any
	// other op it is a misuse (exit 2). Reads the installed schema through the lifted
	// readSchema → resolveBlockItemSchema path (no op change).
	if (parsed.showSchema) {
		const opProps = objectSchema(op).properties ?? {};
		if (opProps.arrayKey === undefined || typeof parsed.params.block !== "string") {
			process.stderr.write(`error: --show-schema applies only to a block op with --block <name>\n`);
			return 2;
		}
		const block = parsed.params.block;
		const schema = readSchema(parsed.cwd, block);
		if (schema === null) {
			process.stderr.write(`error: schema not found for block ${block}\n`);
			return 3;
		}
		const { arrayKey, itemSchema } = resolveBlockItemSchema(schema as Record<string, unknown>);
		const props = (itemSchema.properties ?? {}) as Record<string, Record<string, unknown>>;
		const required = (itemSchema.required ?? []) as string[];
		const lines = [
			`Block: ${block}`,
			`Array key: ${arrayKey}`,
			`Required fields: ${required.join(", ")}`,
			"All fields:",
		];
		for (const [name, fschema] of Object.entries(props)) {
			const enumVals = Array.isArray(fschema.enum) ? fschema.enum : null;
			const type =
				typeof fschema.type === "string"
					? fschema.type
					: typeof fschema.$ref === "string"
						? (fschema.$ref as string)
						: enumVals
							? "enum"
							: "object";
			const enumSuffix = enumVals ? ` [enum: ${enumVals.join(", ")}]` : "";
			lines.push(`  - ${name}: ${type}${enumSuffix}`);
		}
		const idPattern = (props.id?.pattern as string | undefined) ?? "(none)";
		lines.push(`ID pattern: ${idPattern}`);
		process.stdout.write(`${lines.join("\n")}\n`);
		return 0;
	}

	const identity = resolveIdentity();
	injectWriter(op, parsed.params, identity);
	injectArrayKey(op, parsed.params, parsed.cwd);

	// FGAP-024 — append-block-item `--dry-run`: client-side prospective-whole-file
	// validation. Replicates the op's autoId allocation, builds the prospective file
	// {...existing, [arrayKey]: [...items, item]}, and validates it against the WHOLE
	// block schema (matching exactly what appendToBlock validates on write) — then
	// RETURNS before the auth/op-run block, so the frozen op is never invoked and
	// nothing is written. The `--dryRun` flag itself never enters parsed.params, so
	// the op would never see it even if reached.
	if (op.name === "append-block-item" && parsed.dryRun) {
		const block = parsed.params.block as string;
		const arrayKey = parsed.params.arrayKey as string | undefined;
		if (typeof arrayKey !== "string") {
			process.stderr.write(`error: cannot resolve array key for block ${block}\n`);
			return 2;
		}
		let item = (parsed.params.item ?? {}) as Record<string, unknown>;
		if (parsed.params.autoId && (item == null || item.id === undefined)) {
			try {
				item = { ...item, id: nextId(parsed.cwd, block) };
			} catch (e) {
				process.stderr.write(`error: ${e instanceof Error ? e.message : String(e)}\n`);
				return 4;
			}
		}
		let existing: Record<string, unknown> = {};
		try {
			existing = readBlock(parsed.cwd, block) as Record<string, unknown>;
		} catch {
			existing = {};
		}
		const items = Array.isArray(existing[arrayKey]) ? (existing[arrayKey] as unknown[]) : [];
		const prospective = { ...existing, [arrayKey]: [...items, item] };
		try {
			validateFromFile(schemaPath(parsed.cwd, block), prospective, `${block}.${arrayKey}[item]`);
		} catch (e) {
			if (isValidationError(e)) {
				process.stderr.write(`error: ${formatAjvError(e)}\n`);
				return 5;
			}
			if (/schema (file )?not found/i.test(String((e as Error).message))) {
				process.stderr.write(`error: ${(e as Error).message}\n`);
				return 3;
			}
			throw e;
		}
		process.stdout.write(`[dry-run] PASS${item.id ? ` — would append ${item.id}` : ""}\n`);
		return 0;
	}

	const dctx = buildCliDispatchContext(parsed.explicitWriter, identity);

	const decision = authDecision(op, {
		yes: parsed.yes,
		interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
	});
	if (decision.allow === false) {
		if (decision.needsPrompt) {
			const ok = await promptConfirm(op.name);
			if (!ok) {
				process.stderr.write(`declined: ${op.name} not authorized\n`);
				return 1;
			}
		} else {
			process.stderr.write(`${decision.reason}\n`);
			return 1;
		}
	}

	// Resolve the effective render. `--format` wins; absent it, `--json` → json,
	// else text — so `--json` and `--format json` are exact aliases.
	const format: "text" | "json" | "table" = parsed.format ?? (parsed.json ? "json" : "text");

	try {
		const r: OpResult = await op.run(parsed.cwd, parsed.params, dctx);

		if (format === "json") {
			// FGAP-013: emit `output` as a JSON VALUE, not a stringified JSON string.
			// Prose → the string itself; a read op → its structured ReadStructured
			// (data + paging/cap metadata); a data op → its raw JSON value. No
			// double-encode: the value is placed directly into the envelope and
			// JSON.stringify'd ONCE here.
			// TASK-013 / FGAP-015: boundedJsonOutput enforces the 50KB read cap at this
			// boundary — under-cap values pass through unchanged; an over-cap `{json}`
			// (or prose) result fails closed (`{ data: null, truncated: true, … }` /
			// REFUSAL string) so a `{json}` op can no longer leak substrate content
			// past the cap on the `--json` surface.
			const output = boundedJsonOutput(r);
			process.stdout.write(`${JSON.stringify({ ok: true, op: op.name, output })}\n`);
		} else if (format === "table") {
			// FGAP-021 — extract the renderable array, falling back to text whenever the
			// result is not a complete tabular collection (over-cap, prose, or a non-array
			// data op) so a degenerate one-row table never substitutes for the real output.
			const arr = tabularRows(r);
			if (arr !== null) {
				process.stdout.write(`${renderTable(arr)}\n`);
			} else {
				process.stdout.write(`${renderOpResultText(r)}\n`);
			}
		} else {
			// Default text surface stays byte-identical to before: the shared renderer
			// reproduces each op's prior `run()` text (prose / JSON.stringify / read footer).
			process.stdout.write(`${renderOpResultText(r)}\n`);
		}

		// TASK-037 — FEAT-006 T4: the `update` op returns the whole UpdateResult under
		// `{ json }`; if it recorded any irreconcilable 3-way-merge conflicts, the CLI
		// SURFACES them — it does NOT spawn a subordinate resolver. The CALLING agent
		// reconciles via the existing `read-schema` / `write-schema` ops. On a NON-json
		// surface (text or table), render the conflict report (renderConflicts carries the
		// reconcile-via-write-schema guidance line) below the op's own output. Under
		// `--format json` the structured `conflicts` array already prints in the op-result
		// envelope above — do NOT double-emit. A non-`update` op, or an `update` with no
		// conflicts, is a no-op here.
		if (format !== "json" && op.name === "update" && r && typeof r === "object" && "json" in r) {
			const update = (r as { json: { conflicts?: Parameters<typeof renderConflicts>[0] } }).json;
			const conflicts = update?.conflicts;
			if (Array.isArray(conflicts) && conflicts.length > 0) {
				process.stdout.write(`${renderConflicts(conflicts)}\n`);
			}
		}
		return 0;
	} catch (err) {
		// FGAP-023 — an AJV ValidationError surfaces field-named guidance (which field,
		// what constraint) rather than the raw concatenated `.message`. The shaped message
		// flows through both the `--json` envelope and the stderr line below.
		const message = isValidationError(err) ? formatAjvError(err) : err instanceof Error ? err.message : String(err);
		if (format === "json") {
			process.stdout.write(`${JSON.stringify({ ok: false, op: op.name, error: message })}\n`);
		} else {
			process.stderr.write(`error: ${message}\n`);
		}
		// FGAP-026 — granular exit codes distinguishing error classes. Name/message-based
		// (instanceof is unreliable across the package boundary): validation → 5;
		// not-initialized / BootstrapNotFoundError → 1 (generic runtime); schema-absent →
		// 3; id-allocation failure → 4; everything else → 1. Usage/arg errors are 2,
		// classified earlier at the UsageError catch. The message emit above is unchanged.
		// Ordering matters: schema-absent is tested BEFORE id-allocation because the
		// schema-missing throw from nextId ("nextId: schema not found for block …") also
		// matches the id-allocation pattern — its true cause is the absent schema (→ 3),
		// not an allocation failure (→ 4). The genuine allocation throws (no id.pattern;
		// not prefix+width parseable) do not contain "schema not found" and stay 4.
		let code = 1;
		if (isValidationError(err)) code = 5;
		else if (err instanceof Error && err.name === "BootstrapNotFoundError") code = 1;
		else if (err instanceof Error && /schema (file )?not found/i.test(err.message)) code = 3;
		else if (err instanceof Error && /nextId|id pattern|allocate/i.test(err.message)) code = 4;
		return code;
	}
}
