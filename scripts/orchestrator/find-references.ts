#!/usr/bin/env tsx
/**
 * find-references — closure-table edge inspection
 *
 * Wraps the canonical findReferencesInRepo library function from
 * @davidorex/pi-context/lens-view. Returns Edge[] (NOT string[]) —
 * distinguishing semantic vs the id-chain walk-ancestors / walk-descendants
 * orchestrator scripts. Surfaces edge-level inspection with relation_type +
 * ordinal preserved per record. The final atomic unit of the query-surface
 * build-out that gave the orchestrator its missing substrate query primitives.
 *
 * Per the dual-surface pattern: this CLI script + the matching pi tool
 * (find-references) + the underlying findReferences / findReferencesInRepo
 * library functions ship as one unit. The script doubles as executable
 * specification of the edge-inspection contract. Coexists with walk-ancestors
 * (parent-direction id chain) and walk-descendants (child-direction id chain)
 * — the three surfaces complete the closure-table query primitive set:
 *   walk-descendants  — forward id traversal
 *   walk-ancestors    — reverse id traversal
 *   find-references   — both-directions edge inspection
 *
 * SURFACED-GAPS (per the scripts' dual role as executable specifications):
 * closes the edge-level half of that query-surface gap. No new gaps surfaced during
 * the writing of this script; the closure-table invariant already lives
 * behind findReferences / findReferencesInRepo.
 *
 * Usage:
 *   tsx scripts/orchestrator/find-references.ts \
 *       --item-id <id> [--direction inbound|outbound|both] [--format json|table]
 *
 *   --item-id   : item id whose incident edges are sought
 *   --direction : inbound  — edges where child === itemId
 *                 outbound — edges where parent === itemId
 *                 both     — union (default)
 *   --format    : json (default) — JSON-stringified Edge[]
 *                 table          — markdown table | parent | child | relation_type | ordinal |
 */
import { endpointKey } from "@davidorex/pi-context/context";
import { findReferencesInRepo } from "@davidorex/pi-context/lens-view";

interface Args {
	itemId: string;
	direction: "inbound" | "outbound" | "both";
	format: "json" | "table";
}

function parseArgs(argv: string[]): Args {
	const out: Partial<Args> = { direction: "both", format: "json" };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--item-id" && argv[i + 1]) {
			out.itemId = argv[i + 1];
			i++;
		} else if (a === "--direction" && argv[i + 1]) {
			const v = argv[i + 1];
			if (v !== "inbound" && v !== "outbound" && v !== "both") {
				console.error(`--direction must be inbound|outbound|both (got: ${v})`);
				process.exit(2);
			}
			out.direction = v;
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
	if (out.itemId === undefined) {
		console.error("Required: --item-id <id>");
		console.error("Optional: --direction inbound|outbound|both (default both)");
		console.error("Optional: --format json|table (default json)");
		process.exit(2);
	}
	return out as Args;
}

function main(): void {
	const args = parseArgs(process.argv.slice(2));
	let result: ReturnType<typeof findReferencesInRepo>;
	try {
		result = findReferencesInRepo(process.cwd(), args.itemId, args.direction);
	} catch (err) {
		console.error(`find-references: ${err instanceof Error ? err.message : String(err)}`);
		process.exit(3);
	}
	if (args.format === "json") {
		console.log(JSON.stringify(result, null, 2));
		return;
	}
	// table
	if (result.length === 0) {
		console.log("(no references)");
		return;
	}
	console.log("| parent | child | relation_type | ordinal |");
	console.log("| --- | --- | --- | --- |");
	for (const e of result) {
		// Endpoints are dual-form since the structured-endpoint model: render the consumer node key (refname
		// for items, bin label for lens_bin) so a structured endpoint prints its
		// string identity rather than [object Object].
		console.log(`| ${endpointKey(e.parent)} | ${endpointKey(e.child)} | ${e.relation_type} | ${e.ordinal ?? ""} |`);
	}
}

main();
