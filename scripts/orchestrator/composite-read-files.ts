#!/usr/bin/env tsx
/**
 * composite-read-files — Claude-Code-side CLI wrapper for the read-files
 * composite KIND library function (FEAT-010 / TASK-092).
 *
 * Per DEC-0019/0020: every composite KIND lands as a TRIPLE (library +
 * Pi tool + CLI script). The Pi tool is registered dynamically by
 * composite-loader from config.tool_operations[]. This script is the
 * orchestrator-side parallel — same library underneath
 * (packages/pi-agent-dispatch/src/composites/read-files.ts), different
 * consumer wrapper.
 *
 * Usage:
 *   tsx scripts/orchestrator/composite-read-files.ts \
 *     --allowed-roots src,packages --path src/index.ts [--cwd .]
 */
import { runReadFiles } from "../../packages/pi-agent-dispatch/src/composites/read-files.js";

interface Args {
	cwd: string;
	allowedRoots: string[];
	path: string;
}

function parseArgs(argv: string[]): Args {
	const out: Partial<Args> = { cwd: process.cwd() };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--cwd" && argv[i + 1]) {
			out.cwd = argv[i + 1];
			i++;
		} else if (a === "--allowed-roots" && argv[i + 1]) {
			out.allowedRoots = argv[i + 1]
				.split(",")
				.map((s) => s.trim())
				.filter((s) => s.length > 0);
			i++;
		} else if (a === "--path" && argv[i + 1]) {
			out.path = argv[i + 1];
			i++;
		}
	}
	if (!out.allowedRoots || out.allowedRoots.length === 0) {
		console.error("Missing --allowed-roots <csv>");
		process.exit(2);
	}
	if (!out.path) {
		console.error("Missing --path <p>");
		process.exit(2);
	}
	return out as Args;
}

function main(): void {
	const args = parseArgs(process.argv.slice(2));
	try {
		const result = runReadFiles(args.cwd, { allowed_roots: args.allowedRoots }, { path: args.path });
		process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
	} catch (err) {
		console.error((err as Error).message);
		process.exit(1);
	}
}

main();
