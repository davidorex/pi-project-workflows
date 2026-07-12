#!/usr/bin/env tsx
/**
 * walk-ancestors — closure-table parent-direction traversal
 *
 * Wraps the canonical walkAncestorsByLens library function from
 * @davidorex/pi-context/lens-view. Reverse-direction counterpart to the
 * existing walk-descendants surface — used by Claude-Code-side
 * orchestration to materialize the ancestor id chain for a child item
 * under a config-declared relation_type. Partially closes the gap where the
 * closure-table traversal surface was forward-direction only.
 *
 * Per the dual-surface pattern: this CLI script + the matching pi
 * tool (walk-ancestors) + the underlying walkAncestors / walkAncestorsByLens
 * library functions ship as one unit. The script doubles as executable
 * specification of the ancestor-traversal contract. Coexists with the
 * descendants-direction surface (context-walk-descendants tool /
 * walkLensDescendants library function) — adds the reverse-direction
 * surface, never supersedes the forward variant.
 *
 * SURFACED-GAPS (per the scripts' dual role as executable specifications):
 * closes the parent-direction half of the bidirectional closure-table
 * traversal that work-unit context composition (the context-contract
 * bundling model) requires. No new gaps surfaced
 * during the writing of this script; the closure-table invariant already
 * lives behind walkAncestors / walkAncestorsByLens.
 *
 * Usage:
 *   tsx scripts/orchestrator/walk-ancestors.ts \
 *       --item-id <id> --relation-type <type> [--format json|chain]
 *
 *   --item-id      : child id whose ancestors are sought
 *   --relation-type: relation_type from config.relation_types[].canonical_id
 *   --format       : json (default) — JSON-stringified string[] of ancestor ids
 *                    chain          — one ancestor per line: id1 → id2 → ... → root
 */
import { walkAncestorsByLens } from "@davidorex/pi-context/lens-view";

interface Args {
	itemId: string;
	relationType: string;
	format: "json" | "chain";
}

function parseArgs(argv: string[]): Args {
	const out: Partial<Args> = { format: "json" };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--item-id" && argv[i + 1]) {
			out.itemId = argv[i + 1];
			i++;
		} else if (a === "--relation-type" && argv[i + 1]) {
			out.relationType = argv[i + 1];
			i++;
		} else if (a === "--format" && argv[i + 1]) {
			const v = argv[i + 1];
			if (v !== "json" && v !== "chain") {
				console.error(`--format must be json|chain (got: ${v})`);
				process.exit(2);
			}
			out.format = v;
			i++;
		}
	}
	if (out.itemId === undefined || out.relationType === undefined) {
		console.error("Required: --item-id <id> --relation-type <type>");
		console.error("Optional: --format json|chain (default json)");
		process.exit(2);
	}
	return out as Args;
}

function main(): void {
	const args = parseArgs(process.argv.slice(2));
	let result: string[];
	try {
		result = walkAncestorsByLens(process.cwd(), args.itemId, args.relationType);
	} catch (err) {
		console.error(`walk-ancestors: ${err instanceof Error ? err.message : String(err)}`);
		process.exit(3);
	}
	if (args.format === "json") {
		console.log(JSON.stringify(result));
	} else {
		// chain: closest-ancestor-first, terminating at root-most.
		if (result.length === 0) {
			console.log("(no ancestors)");
			return;
		}
		console.log(result.join(" → "));
	}
}

main();
