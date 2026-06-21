#!/usr/bin/env tsx
/**
 * write-schema — ergonomics wrapper around schema-write writeSchemaChecked
 *
 * Op-correct create-or-replace of a whole block-kind JSON Schema body.
 * operation 'create' requires the schema ABSENT; 'replace' requires it
 * PRESENT. The body is AJV draft-07 meta-validated before an atomic
 * (tmp + rename) write; a malformed body throws and nothing reaches disk.
 *
 * Migration caveat (FGAP-077, DECIDED): this op writes + meta-validates the
 * schema JSON only. A 'replace' that changes the schema's `version` does NOT
 * migrate existing block items forward — read-time validateBlockWithMigration
 * throws a version mismatch until a code-level MigrationFn is registered via
 * createRegistry().register(...), and there is NO tool / CLI surface for
 * registering a MigrationFn. Registering the block_kind that points at this
 * schema is a separate step (amend-config --registry block_kinds).
 *
 * Per DEC-0019/0020: in-pi harness-confined agents reach the same library
 * (schema-write.writeSchemaChecked) through the Pi tool `write-schema`
 * registered in pi-context/index.ts. This script is the Claude-Code-side
 * parallel — same library underneath, different consumer wrapper. Both layers
 * thin; business logic in the library.
 *
 * Usage:
 *   tsx scripts/orchestrator/write-schema.ts --operation create|replace --name <name> --schema @file.json|<inline-json> [--writer kind:id] [--dry-run] [--cwd <dir>] [--format json|table]
 */
import fs from "node:fs";
import type { DispatchContext, WriterIdentity } from "@davidorex/pi-context/dispatch-context";
import { writeSchemaChecked } from "@davidorex/pi-context/schema-write";

interface Args {
	operation: string;
	name: string;
	schema: string;
	writer: string;
	dryRun: boolean;
	cwd: string;
	format: "json" | "table";
}

function parseArgs(argv: string[]): Args {
	const out: Partial<Args> = {
		writer: "human:davidryan@gmail.com",
		dryRun: false,
		cwd: process.cwd(),
		format: "table",
	};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--operation" && argv[i + 1]) {
			out.operation = argv[i + 1];
			i++;
		} else if (a === "--name" && argv[i + 1]) {
			out.name = argv[i + 1];
			i++;
		} else if (a === "--schema" && argv[i + 1]) {
			out.schema = argv[i + 1];
			i++;
		} else if (a === "--writer" && argv[i + 1]) {
			out.writer = argv[i + 1];
			i++;
		} else if (a === "--dry-run") {
			out.dryRun = true;
		} else if (a === "--cwd" && argv[i + 1]) {
			out.cwd = argv[i + 1];
			i++;
		} else if (a === "--format" && argv[i + 1]) {
			const f = argv[i + 1];
			if (f !== "json" && f !== "table") {
				console.error(`--format must be 'json' or 'table', got '${f}'`);
				process.exit(2);
			}
			out.format = f;
			i++;
		}
	}
	if (!out.operation) {
		console.error("Missing --operation create|replace");
		process.exit(2);
	}
	if (out.operation !== "create" && out.operation !== "replace") {
		console.error(`--operation must be create | replace, got '${out.operation}'`);
		process.exit(2);
	}
	if (!out.name) {
		console.error("Missing --name <schemaName>");
		process.exit(2);
	}
	if (out.schema === undefined) {
		console.error("Missing --schema @file.json|<inline-json>");
		process.exit(2);
	}
	return out as Args;
}

function parseWriter(spec: string): WriterIdentity {
	const colon = spec.indexOf(":");
	const kind = colon === -1 ? spec : spec.slice(0, colon);
	const identifier = colon === -1 ? "" : spec.slice(colon + 1);
	switch (kind) {
		case "human":
			return { kind: "human", user: identifier };
		case "agent":
			return { kind: "agent", agent_id: identifier };
		case "monitor":
			return { kind: "monitor", monitor_name: identifier };
		case "workflow":
			return { kind: "workflow", workflow_step_id: identifier };
		default:
			console.error(`Invalid writer kind ${kind}; allowed: human|agent|monitor|workflow`);
			process.exit(2);
	}
}

/**
 * Resolve the schema body from `--schema`: `@file.json` reads + parses the
 * file, inline text is parsed as JSON. Unlike amend-config's loadEntry, a
 * non-JSON inline value is a HARD error here — a schema is always an object,
 * never a bare string. File-read, file-JSON, and inline-JSON failures all
 * exit 3 (file/JSON error).
 */
function loadSchema(arg: string): unknown {
	if (arg.startsWith("@")) {
		const filePath = arg.slice(1);
		let raw: string;
		try {
			raw = fs.readFileSync(filePath, "utf-8");
		} catch (err) {
			console.error(`Failed to read --schema file (${filePath}): ${err instanceof Error ? err.message : String(err)}`);
			process.exit(3);
		}
		try {
			return JSON.parse(raw);
		} catch (err) {
			console.error(
				`--schema file is not valid JSON (${filePath}): ${err instanceof Error ? err.message : String(err)}`,
			);
			process.exit(3);
		}
	}
	try {
		return JSON.parse(arg);
	} catch (err) {
		console.error(`--schema inline value is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
		process.exit(3);
	}
}

function main(): void {
	const args = parseArgs(process.argv.slice(2));
	const writer = parseWriter(args.writer);
	const ctx: DispatchContext = { writer };
	const schema = loadSchema(args.schema) as object;
	const operation = args.operation as "create" | "replace";

	if (args.dryRun) {
		// Meta-validation runs inside writeSchemaChecked(dryRun:true) against the
		// SAME validator the write path uses, then writes nothing. ONE validation
		// path — no re-implemented check here.
		let result: { written: boolean; operation: "create" | "replace"; schemaPath: string };
		try {
			result = writeSchemaChecked(args.cwd, args.name, schema, operation, ctx, { dryRun: true });
		} catch (err) {
			// Name-based check, NOT `instanceof`: writeSchemaChecked throws BootstrapNotFoundError
			// transitively (schema-write → its own context-dir module instance), which under
			// tsx/symlink resolution is a DIFFERENT class object than the one this CLI would import
			// directly — so `instanceof` returns false. The class sets `name` (context-dir.ts), which
			// survives the module-instance split. (read-schema/read-config throw the class directly, so
			// their instanceof works; this CLI's throw is transitive.)
			if (err instanceof Error && err.name === "BootstrapNotFoundError") {
				console.error(`write-schema: substrate not initialized — ${err.message}`);
				process.exit(1);
			}
			console.error("[dry-run] FAIL");
			console.error(`  - ${err instanceof Error ? err.message : String(err)}`);
			process.exit(5);
		}

		console.error("[dry-run] PASS");
		if (args.format === "json") {
			console.log(JSON.stringify(result, null, 2));
		} else {
			console.log(`would ${operation} schema '${args.name}'`);
		}
		process.exit(0);
	}

	let result: { written: boolean; operation: "create" | "replace"; schemaPath: string };
	try {
		result = writeSchemaChecked(args.cwd, args.name, schema, operation, ctx);
	} catch (err) {
		// Name-based check, NOT `instanceof`: writeSchemaChecked throws BootstrapNotFoundError
		// transitively (schema-write → its own project-dir module instance), which under
		// tsx/symlink resolution is a DIFFERENT class object than the one this CLI would import
		// directly — so `instanceof` returns false. The class sets `name` (project-dir.ts), which
		// survives the module-instance split. (read-schema/read-config throw the class directly, so
		// their instanceof works; this CLI's throw is transitive.)
		if (err instanceof Error && err.name === "BootstrapNotFoundError") {
			console.error(`write-schema: substrate not initialized — ${err.message}`);
			process.exit(1);
		}
		console.error(`FAILED to write schema: ${err instanceof Error ? err.message : String(err)}`);
		process.exit(5);
	}

	if (args.format === "json") {
		console.log(JSON.stringify(result, null, 2));
	} else {
		console.log(`write-schema: ${operation}d schema '${args.name}' at ${result.schemaPath}`);
	}
	process.exit(0);
}

main();
