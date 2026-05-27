#!/usr/bin/env tsx
/**
 * composite-git-log — Claude-Code-side CLI wrapper for the git-log
 * composite KIND library function (FEAT-010 / TASK-092).
 *
 * Per DEC-0019/0020: every composite KIND lands as a TRIPLE (library +
 * Pi tool + CLI script). Same library underneath as the registered
 * Pi tool; different consumer wrapper.
 *
 * Usage:
 *   tsx scripts/orchestrator/composite-git-log.ts \
 *     [--cwd .] [--paths src,docs] [--since 2026-01-01] [--limit 10]
 */
import { runGitLog } from "../../packages/pi-agent-dispatch/src/composites/git-log.js";

interface Args {
	cwd: string;
	paths?: string[];
	since?: string;
	limit?: number;
}

function parseArgs(argv: string[]): Args {
	const out: Partial<Args> = { cwd: process.cwd() };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--cwd" && argv[i + 1]) {
			out.cwd = argv[i + 1];
			i++;
		} else if (a === "--paths" && argv[i + 1]) {
			out.paths = argv[i + 1]
				.split(",")
				.map((s) => s.trim())
				.filter((s) => s.length > 0);
			i++;
		} else if (a === "--since" && argv[i + 1]) {
			out.since = argv[i + 1];
			i++;
		} else if (a === "--limit" && argv[i + 1]) {
			out.limit = Number.parseInt(argv[i + 1], 10);
			i++;
		}
	}
	return out as Args;
}

function main(): void {
	const args = parseArgs(process.argv.slice(2));
	try {
		const result = runGitLog(args.cwd, { paths: args.paths, since: args.since }, { limit: args.limit });
		process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
	} catch (err) {
		console.error((err as Error).message);
		process.exit(1);
	}
}

main();
