#!/usr/bin/env node
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
import { type OpDefinition, ops } from "@davidorex/pi-context/ops";

/**
 * The surfaced command set: every op the CLI exposes. Derived by reflection —
 * NOT a hardcoded list. A `surface: "process"` op (currently only list-tools)
 * is excluded here by the partition, never by name.
 */
export const useOps: OpDefinition[] = ops.filter((o) => o.surface === "use");

/** Field-type tag rendered in help and used to pick a coercion strategy. */
export type FieldType = "string" | "number" | "boolean" | "json";

interface FieldSchema {
	type?: string;
	description?: string;
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
		if (tok === "--writer") {
			const v = argv[++i];
			if (v === undefined) throw new UsageError("--writer requires a JSON argument");
			try {
				out.explicitWriter = v.startsWith("@") ? JSON.parse(readFileSync(v.slice(1), "utf8")) : JSON.parse(v);
			} catch (err) {
				throw new UsageError(`--writer: ${err instanceof Error ? err.message : String(err)}`);
			}
			continue;
		}
		if (!tok.startsWith("--")) {
			throw new UsageError(`unexpected argument: ${tok}`);
		}

		const field = tok.slice(2);
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
			out.params[field] = value;
		} else {
			// json: inline JSON or @file
			try {
				out.params[field] = value.startsWith("@")
					? JSON.parse(readFileSync(value.slice(1), "utf8"))
					: JSON.parse(value);
			} catch (err) {
				throw new UsageError(`--${field}: ${err instanceof Error ? err.message : String(err)}`);
			}
		}
	}

	if (out.explicitWriter !== undefined) {
		out.params.writer = out.explicitWriter;
	}

	// Required-field check — `writer` is exempt (schema-driven auto-injected
	// after parse when the op declares it and none was passed).
	if (!out.help) {
		const required = (schema.required ?? []).filter((r) => r !== "writer");
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

/** Per-op help text: description + one line per declared field. */
export function deriveHelp(op: OpDefinition): string {
	const schema = objectSchema(op);
	const props = schema.properties ?? {};
	const required = new Set(schema.required ?? []);
	const lines = [`${op.name} — ${op.description}`, ""];
	const entries = Object.entries(props);
	if (entries.length === 0) {
		lines.push("  (no parameters)");
	} else {
		lines.push("Flags:");
		for (const [field, fschema] of entries) {
			const t = fieldType(fschema);
			const req = required.has(field) ? "required" : "optional";
			const desc = fschema.description ? ` — ${fschema.description}` : "";
			lines.push(`  --${field} <${t}>  (${req})${desc}`);
		}
	}
	lines.push("", "Global flags: --cwd <dir>  --json  --yes  --writer <json>  --help");
	return lines.join("\n");
}

/** Top-level help: one line per surfaced op + global flag notes. */
export function deriveTopHelp(): string {
	const lines = ["pi-context <op> [flags]", "", "Commands:"];
	const width = Math.max(...useOps.map((o) => o.name.length));
	for (const op of useOps) {
		lines.push(`  ${op.name.padEnd(width)}  —  ${op.description.split("\n")[0]}`);
	}
	lines.push(
		"",
		"Global flags:",
		"  --cwd <dir>      substrate root (default: cwd)",
		"  --json           emit { ok, op, output } envelope",
		"  --yes, --force   pre-authorize gated ops in non-interactive contexts",
		"  --writer <json>  override the auto-resolved writer identity",
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

export async function main(argv: string[]): Promise<number> {
	const first = argv[0];

	if (first === undefined || first === "--help" || first === "-h") {
		process.stdout.write(`${deriveTopHelp()}\n`);
		return 0;
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
		process.stdout.write(`${deriveHelp(op)}\n`);
		return 0;
	}

	injectWriter(op, parsed.params, resolveIdentity());

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

	try {
		const text = await op.run(parsed.cwd, parsed.params);
		if (parsed.json) {
			process.stdout.write(`${JSON.stringify({ ok: true, op: op.name, output: text })}\n`);
		} else {
			process.stdout.write(`${text}\n`);
		}
		return 0;
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		if (parsed.json) {
			process.stdout.write(`${JSON.stringify({ ok: false, op: op.name, error: message })}\n`);
		} else {
			process.stderr.write(`error: ${message}\n`);
		}
		return 1;
	}
}

/**
 * True when this module is the process entrypoint (invoked as `pi-context …`),
 * false when it is merely imported (e.g. by the unit tests). Guards the
 * auto-run so importing the module to test its pure helpers does not execute
 * main() against the test runner's argv.
 */
function isEntrypoint(): boolean {
	const invoked = process.argv[1];
	if (invoked === undefined) return false;
	try {
		return fileURLToPath(import.meta.url) === path.resolve(invoked);
	} catch {
		return false;
	}
}

// Module entrypoint: run main() and map its resolved exit code. A thrown
// (non-UsageError) error maps to exit 1.
if (isEntrypoint()) {
	main(process.argv.slice(2))
		.then((code) => {
			process.exitCode = code;
		})
		.catch((err) => {
			process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`);
			process.exitCode = 1;
		});
}
