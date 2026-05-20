#!/usr/bin/env tsx
/**
 * migrate-canonical-id — Claude-Code-side dual surface for the FGAP-060 /
 * DEC-0035 canonical_id rename engine.
 *
 * Wraps the canonical renameCanonicalId library function from
 * @davidorex/pi-context/rename-canonical-id. canonical_ids are
 * primary-key-permanent; this is the rare deliberate-rename path. The engine
 * operates on the EDGE model (DEC-0013) — item references live ONLY as
 * relations.json edges, so there is NO inline-FK sweep. Out-of-substrate
 * occurrences (analysis MDs, git history) are REPORTED, never rewritten.
 *
 * Per DEC-0019 dual-surface pattern: this CLI script + the matching pi tool
 * (rename-canonical-id) + the underlying renameCanonicalId library function
 * ship as one unit. The script doubles as executable specification of the
 * rename contract.
 *
 * Four kinds are supported: item | relation_type | lens | layer. block_kind
 * is unsupported (filesystem cascade — separate follow-up) and the engine
 * throws on it.
 *
 * Usage:
 *   tsx scripts/orchestrator/migrate-canonical-id.ts \
 *       --kind <item|relation_type|lens|layer> --old-id <id> --new-id <id> \
 *       [--dry-run] [--cwd <path>] [--format json|table]
 *
 *   --kind    : item | relation_type | lens | layer
 *   --old-id  : current canonical_id
 *   --new-id  : replacement canonical_id
 *   --dry-run : compute would-change counts without writing any substrate
 *   --cwd     : substrate root (default ".")
 *   --format  : table (default) — markdown report; json — JSON RenameReport
 */
import { renameCanonicalId } from "@davidorex/pi-context/rename-canonical-id";

interface Args {
	kind: string;
	oldId: string;
	newId: string;
	dryRun: boolean;
	cwd: string;
	format: "json" | "table";
}

function parseArgs(argv: string[]): Args {
	const out: Partial<Args> = { dryRun: false, cwd: ".", format: "table" };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--kind" && argv[i + 1]) {
			out.kind = argv[i + 1];
			i++;
		} else if (a === "--old-id" && argv[i + 1]) {
			out.oldId = argv[i + 1];
			i++;
		} else if (a === "--new-id" && argv[i + 1]) {
			out.newId = argv[i + 1];
			i++;
		} else if (a === "--dry-run") {
			out.dryRun = true;
		} else if (a === "--cwd" && argv[i + 1]) {
			out.cwd = argv[i + 1];
			i++;
		} else if (a === "--format" && argv[i + 1]) {
			const v = argv[i + 1];
			if (v !== "json" && v !== "table") {
				console.error(`--format must be json|table (got: ${v})`);
				process.exit(2);
			}
			out.format = v;
			i++;
		}
	}
	if (!out.kind || !out.oldId || !out.newId) {
		console.error("Required: --kind <item|relation_type|lens|layer> --old-id <id> --new-id <id>");
		console.error("Optional: --dry-run   (compute counts, no write)");
		console.error("Optional: --cwd <path> (default '.')");
		console.error("Optional: --format json|table (default table)");
		process.exit(2);
	}
	return out as Args;
}

function main(): void {
	const args = parseArgs(process.argv.slice(2));
	let report: ReturnType<typeof renameCanonicalId>;
	try {
		report = renameCanonicalId(args.cwd, args.kind, args.oldId, args.newId, { dryRun: args.dryRun });
	} catch (err) {
		console.error(`migrate-canonical-id: ${err instanceof Error ? err.message : String(err)}`);
		process.exit(3);
	}

	if (args.format === "json") {
		console.log(JSON.stringify(report, null, 2));
		return;
	}

	// table / markdown report
	console.log(`# rename ${report.kind}: ${report.oldId} → ${report.newId}${report.dryRun ? "  (DRY RUN)" : ""}`);
	console.log("");
	console.log(`## substrate rewrites${report.dryRun ? " (would change)" : ""}`);
	if (report.substrateRewrites.length === 0) {
		console.log("(none)");
	} else {
		console.log("| file | field | count |");
		console.log("| --- | --- | --- |");
		for (const r of report.substrateRewrites) {
			console.log(`| ${r.file} | ${r.field} | ${r.count} |`);
		}
	}
	console.log("");
	console.log("## out-of-substrate (report only — NOT rewritten)");
	if (report.outOfSubstrate.length === 0) {
		console.log("(none)");
	} else {
		for (const o of report.outOfSubstrate) {
			console.log(`- ${o.source}: ${o.context}`);
		}
	}
}

main();
