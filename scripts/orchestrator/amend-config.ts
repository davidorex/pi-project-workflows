#!/usr/bin/env tsx
/**
 * amend-config — ergonomics wrapper around project-context amendConfigEntry
 *
 * Write-twin of writeConfig for the scoped-amend case: adds / replaces / removes
 * ONE entry in ONE config.json registry (block_kinds, relation_types, lenses,
 * layers, invariants, status_buckets, display_strings, naming, installed_schemas,
 * installed_blocks, hierarchy). OP-CORRECTNESS (add ⇒ key absent, replace/remove
 * ⇒ key present) and SHAPE (whole-config AJV) are enforced by the library.
 * Cross-registry referential integrity (removing a still-referenced
 * relation_type / lens / layer / block_kind) is DEFERRED to project-validate —
 * run it after a remove.
 *
 * Per DEC-0019/0020: in-pi harness-confined agents reach the same library
 * (project-context.amendConfigEntry) through the Pi tool `amend-config`
 * registered in pi-context/index.ts. This script is the Claude-Code-side
 * parallel — same library underneath, different consumer wrapper. Both layers
 * thin; business logic in the library.
 *
 * Usage:
 *   tsx scripts/orchestrator/amend-config.ts --registry <name> --operation add|replace|remove --key <key> [--entry @file.json|<inline-json>] [--writer kind:id] [--dry-run] [--cwd <dir>] [--format json|table]
 */
import fs from "node:fs";
import { amendConfigEntry } from "@davidorex/pi-context/context";
import type { DispatchContext, WriterIdentity } from "@davidorex/pi-context/dispatch-context";

interface Args {
	registry: string;
	operation: string;
	key: string;
	entry?: string;
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
		if (a === "--registry" && argv[i + 1]) {
			out.registry = argv[i + 1];
			i++;
		} else if (a === "--operation" && argv[i + 1]) {
			out.operation = argv[i + 1];
			i++;
		} else if (a === "--key" && argv[i + 1]) {
			out.key = argv[i + 1];
			i++;
		} else if (a === "--entry" && argv[i + 1]) {
			out.entry = argv[i + 1];
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
	if (!out.registry) {
		console.error("Missing --registry <name>");
		process.exit(2);
	}
	if (!out.operation) {
		console.error("Missing --operation add|replace|remove");
		process.exit(2);
	}
	if (out.operation !== "add" && out.operation !== "replace" && out.operation !== "remove") {
		console.error(`--operation must be add | replace | remove, got '${out.operation}'`);
		process.exit(2);
	}
	if (!out.key) {
		console.error("Missing --key <key>");
		process.exit(2);
	}
	if ((out.operation === "add" || out.operation === "replace") && out.entry === undefined) {
		console.error(`--entry is required for operation '${out.operation}'`);
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
 * Resolve the entry payload from `--entry`: `@file.json` reads + parses the file,
 * inline text is parsed as JSON, and an inline value that fails JSON.parse is
 * kept as a raw string (valid for map-value registries whose value is a bare
 * string, e.g. naming / display_strings / status_buckets). File-read / file-JSON
 * failures exit 3 (file/schema read error). Returns undefined when `--entry`
 * was absent (the remove case).
 */
function loadEntry(entryArg: string | undefined): unknown {
	if (entryArg === undefined) return undefined;
	if (entryArg.startsWith("@")) {
		const filePath = entryArg.slice(1);
		let raw: string;
		try {
			raw = fs.readFileSync(filePath, "utf-8");
		} catch (err) {
			console.error(`Failed to read --entry file (${filePath}): ${err instanceof Error ? err.message : String(err)}`);
			process.exit(3);
		}
		try {
			return JSON.parse(raw);
		} catch (err) {
			console.error(
				`--entry file is not valid JSON (${filePath}): ${err instanceof Error ? err.message : String(err)}`,
			);
			process.exit(3);
		}
	}
	try {
		return JSON.parse(entryArg);
	} catch {
		// Inline non-JSON → raw string (valid map value).
		return entryArg;
	}
}

function main(): void {
	const args = parseArgs(process.argv.slice(2));
	const writer = parseWriter(args.writer);
	const ctx: DispatchContext = { writer };
	const entry = loadEntry(args.entry);

	if (args.dryRun) {
		// OP-CORRECTNESS + SHAPE both run inside amendConfigEntry(dryRun:true): it
		// validates the would-be-written config against the SAME schema writeConfig
		// uses, then writes nothing. ONE validation path — no re-implemented op here.
		let opResult: { modified: boolean; operation: string; registry: string; key: string; previousValue?: unknown };
		try {
			opResult = amendConfigEntry(args.cwd, args.registry, args.operation, args.key, entry, undefined, {
				dryRun: true,
			});
		} catch (err) {
			console.error("[dry-run] FAIL");
			console.error(`  - ${err instanceof Error ? err.message : String(err)}`);
			process.exit(5);
		}

		console.error("[dry-run] PASS");
		if (args.format === "json") {
			console.log(JSON.stringify({ wouldModify: opResult.modified, ...opResult }, null, 2));
		} else {
			console.log(`would ${opResult.operation} ${opResult.registry}[${opResult.key}]`);
		}
		process.exit(0);
	}

	let result: { modified: boolean; operation: string; registry: string; key: string; previousValue?: unknown };
	try {
		result = amendConfigEntry(args.cwd, args.registry, args.operation, args.key, entry, ctx);
	} catch (err) {
		console.error(`FAILED to amend config: ${err instanceof Error ? err.message : String(err)}`);
		process.exit(5);
	}

	if (args.format === "json") {
		console.log(JSON.stringify(result, null, 2));
	} else {
		const verb = result.modified ? `${result.operation}d` : "no-op";
		console.log(`amend-config: ${verb} ${result.registry}[${result.key}]`);
	}
	process.exit(0);
}

main();
