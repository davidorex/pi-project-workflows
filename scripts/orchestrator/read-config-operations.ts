#!/usr/bin/env tsx
/**
 * read-config-operations — emit canonical_ids of config.tool_operations[]
 *
 * Reads the active substrate's config.json via the canonical loadContext
 * library function and projects out the canonical_id of each declared
 * tool-operation entry (the bounded composite-tool instances: framework-
 * implemented composite KINDs, config-declared per-project instances). The launch script
 * (scripts/launch-constrained-pi.sh) consumes the JSON form to compose the
 * per-target --tools surface; a future Pi tool may consume the same library
 * surface per the dual-surface canon.
 *
 * Degrades quietly on config-absent (no .pi-context.json pointer OR no
 * config.json) by exiting with code 4 and an explanatory stderr line. The
 * launch script tolerates this and proceeds with an empty composite surface.
 *
 * Usage:
 *   tsx scripts/orchestrator/read-config-operations.ts [--cwd <path>] [--format json|csv]
 *
 *   --cwd     : dir whose substrate to read (default ".")
 *   --format  : json (default) — JSON array of canonical_ids
 *               csv            — comma-separated single line
 *
 * Exit codes:
 *   0 : success (may emit "[]" / empty line if tool_operations[] is absent/empty)
 *   2 : argument error
 *   4 : substrate config absent (no pointer or empty config)
 */
import { loadContext } from "@davidorex/pi-context/context";

interface Args {
	cwd: string;
	format: "json" | "csv";
}

function parseArgs(argv: string[]): Args {
	const out: Args = { cwd: ".", format: "json" };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--cwd" && argv[i + 1]) {
			out.cwd = argv[i + 1];
			i++;
		} else if (a === "--format" && argv[i + 1]) {
			const v = argv[i + 1];
			if (v !== "json" && v !== "csv") {
				console.error(`--format must be json|csv (got: ${v})`);
				process.exit(2);
			}
			out.format = v;
			i++;
		} else {
			console.error(`unknown arg: ${a}`);
			process.exit(2);
		}
	}
	return out;
}

function main(): void {
	const args = parseArgs(process.argv.slice(2));
	const ctx = loadContext(args.cwd);
	if (ctx.config === null) {
		console.error(
			`read-config-operations: substrate config absent at ${args.cwd} (no .pi-context.json pointer or no config.json)`,
		);
		process.exit(4);
	}
	const ids = (ctx.config.tool_operations ?? []).map((op) => op.canonical_id);
	if (args.format === "json") {
		console.log(JSON.stringify(ids));
	} else {
		console.log(ids.join(","));
	}
}

main();
