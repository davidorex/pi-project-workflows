#!/usr/bin/env tsx
/**
 * composite-grep-paths — Claude-Code-side CLI wrapper for the grep-paths
 * composite KIND library function (FEAT-010 / TASK-092).
 *
 * Per DEC-0019/0020: every composite KIND lands as a TRIPLE (library +
 * Pi tool + CLI script). Same library underneath as the registered
 * Pi tool; different consumer wrapper.
 *
 * Usage:
 *   tsx scripts/orchestrator/composite-grep-paths.ts \
 *     --pattern <p> --allowed-roots src,packages [--glob '*.ts'] [--cwd .]
 */
import { runGrepPaths } from "../../packages/pi-agent-dispatch/src/composites/grep-paths.js";

interface Args {
	cwd: string;
	pattern: string;
	allowedRoots: string[];
	glob?: string;
}

function parseArgs(argv: string[]): Args {
	const out: Partial<Args> = { cwd: process.cwd() };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--cwd" && argv[i + 1]) {
			out.cwd = argv[i + 1];
			i++;
		} else if (a === "--pattern" && argv[i + 1]) {
			out.pattern = argv[i + 1];
			i++;
		} else if (a === "--allowed-roots" && argv[i + 1]) {
			out.allowedRoots = argv[i + 1]
				.split(",")
				.map((s) => s.trim())
				.filter((s) => s.length > 0);
			i++;
		} else if (a === "--glob" && argv[i + 1]) {
			out.glob = argv[i + 1];
			i++;
		}
	}
	if (!out.pattern) {
		console.error("Missing --pattern <p>");
		process.exit(2);
	}
	if (!out.allowedRoots || out.allowedRoots.length === 0) {
		console.error("Missing --allowed-roots <csv>");
		process.exit(2);
	}
	return out as Args;
}

function main(): void {
	const args = parseArgs(process.argv.slice(2));
	try {
		const result = runGrepPaths(
			args.cwd,
			{ allowed_roots: args.allowedRoots },
			{ pattern: args.pattern, glob: args.glob },
		);
		process.stdout.write(JSON.stringify(result, null, 2) + "\n");
	} catch (err) {
		console.error((err as Error).message);
		process.exit(1);
	}
}

main();
