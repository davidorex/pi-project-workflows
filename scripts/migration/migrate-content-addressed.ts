#!/usr/bin/env tsx
/**
 * migrate-content-addressed — Claude-Code-side ergonomics wrapper around the
 * §H content-addressing migration (`migrateToContentAddressed`).
 *
 * Per DEC-0019/0020 dual-surface discipline: in-pi harness-confined agents reach
 * the same library through the Pi tool `migrate-content-addressed` registered in
 * pi-context/index.ts; this script is the Claude-Code-side parallel. Both layers
 * thin; business logic in the library.
 *
 * Prints the MigrationReport JSON. Exits non-zero when `unresolved[]` is non-empty
 * on a NON-dry-run (an incomplete migration that dropped one or more broken
 * endpoints). A dry-run with unresolved endpoints prints the report and exits 0 —
 * the report is advisory; the operator decides whether to proceed.
 *
 * Usage:
 *   tsx scripts/migration/migrate-content-addressed.ts [--dry-run] [--legacy-alias project=.project ...] [--cwd <dir>]
 */
import { migrateToContentAddressed } from "./lib/migrate-content-addressed.js";

interface Args {
	dryRun: boolean;
	legacyAliases: Record<string, string>;
	cwd: string;
}

function parseArgs(argv: string[]): Args {
	const out: Args = { dryRun: false, legacyAliases: {}, cwd: process.cwd() };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--dry-run") {
			out.dryRun = true;
		} else if (a === "--legacy-alias" && argv[i + 1]) {
			const pair = argv[i + 1];
			const eq = pair.indexOf("=");
			if (eq <= 0) {
				console.error(`--legacy-alias expects alias=dirName, got '${pair}'`);
				process.exit(2);
			}
			out.legacyAliases[pair.slice(0, eq)] = pair.slice(eq + 1);
			i++;
		} else if (a === "--cwd" && argv[i + 1]) {
			out.cwd = argv[i + 1];
			i++;
		} else {
			console.error(`Unknown argument: ${a}`);
			process.exit(2);
		}
	}
	return out;
}

function main(): void {
	const args = parseArgs(process.argv.slice(2));
	let report: ReturnType<typeof migrateToContentAddressed>;
	try {
		report = migrateToContentAddressed(args.cwd, {
			dryRun: args.dryRun,
			...(Object.keys(args.legacyAliases).length > 0 ? { legacyAliases: args.legacyAliases } : {}),
		});
	} catch (err) {
		console.error(`migrate-content-addressed: ${err instanceof Error ? err.message : String(err)}`);
		process.exit(3);
	}
	console.log(JSON.stringify(report, null, 2));
	if (!report.dry_run && report.unresolved.length > 0) {
		console.error(`migrate-content-addressed: INCOMPLETE — ${report.unresolved.length} unresolved endpoint(s) dropped`);
		process.exit(1);
	}
}

main();
