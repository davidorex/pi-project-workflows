#!/usr/bin/env tsx
/**
 * gather-execution-context — work-unit-driven context bundling per the
 * context-contract model (a work unit's kind declares which relation types
 * compose its context)
 *
 * Wraps the canonical gatherExecutionContext library function from
 * @davidorex/pi-context/execution-context. Reads the unit by id + locates
 * its context-contract by unit_kind + walks each declared relation_type in
 * the contract bidirectionally per direction semantic + resolves reached
 * ids to full item payloads via the bulk resolver. Returns the composed
 * ContextBundle as one structured payload — removes the N+1 read pattern
 * Claude-Code-side orchestrators had to hand-roll before this primitive.
 *
 * Closes the missing-composition-primitive gap (no single call composed a
 * work unit + its context-contract + its declared relations into one
 * bundle). Per the dual-surface pattern: this CLI script +
 * the matching pi tool (gather-execution-context in packages/pi-context/
 * src/index.ts) + the underlying gatherExecutionContext library function
 * ship as one atomic unit.
 *
 * SURFACED-GAPS (per the scripts' dual role as executable specifications):
 * closes the composition-primitive gap. Composes the existing query-surface
 * primitives without surfacing a new gap: filterBlockItems +
 * resolveItemsByIds + walkAncestors/walkDescendants
 * + loadRelations (existing). No new gaps observed during script writing.
 *
 * Usage:
 *   tsx scripts/orchestrator/gather-execution-context.ts \
 *       --unit-id <id> --kind <unit_kind> [--max-depth N] [--format json|summary]
 *
 *   --unit-id   : work-unit id (e.g. TASK-NNN, DEC-NNNN, FGAP-NNN)
 *   --kind      : unit-kind type tag matching a context-contract.unit_kind
 *                 (e.g. 'task', 'decision', 'verification')
 *   --max-depth : optional integer >= 1; caps each spec.max_depth via Math.min
 *   --format    : json    (default) — JSON-stringified ContextBundle or {error}
 *                 summary           — terse markdown header + per-relation-type
 *                                     count table
 */
import { gatherExecutionContext } from "@davidorex/pi-context/execution-context";

interface Args {
	unitId: string;
	kind: string;
	maxDepth?: number;
	format: "json" | "summary";
}

function parseArgs(argv: string[]): Args {
	const out: Partial<Args> = { format: "json" };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--unit-id" && argv[i + 1]) {
			out.unitId = argv[i + 1];
			i++;
		} else if (a === "--kind" && argv[i + 1]) {
			out.kind = argv[i + 1];
			i++;
		} else if (a === "--max-depth" && argv[i + 1]) {
			const n = Number.parseInt(argv[i + 1], 10);
			if (!Number.isFinite(n) || n < 1) {
				console.error(`--max-depth must be an integer >= 1 (got: ${argv[i + 1]})`);
				process.exit(2);
			}
			out.maxDepth = n;
			i++;
		} else if (a === "--format" && argv[i + 1]) {
			const v = argv[i + 1];
			if (v !== "json" && v !== "summary") {
				console.error(`--format must be json|summary (got: ${v})`);
				process.exit(2);
			}
			out.format = v;
			i++;
		}
	}
	if (out.unitId === undefined || out.kind === undefined) {
		console.error("Required: --unit-id <id> --kind <unit_kind>");
		console.error("Optional: --max-depth N (>=1)");
		console.error("Optional: --format json|summary (default json)");
		process.exit(2);
	}
	return out as Args;
}

function main(): void {
	const args = parseArgs(process.argv.slice(2));
	const result = gatherExecutionContext(process.cwd(), {
		unitId: args.unitId,
		kind: args.kind,
		...(args.maxDepth !== undefined ? { maxDepth: args.maxDepth } : {}),
	});

	if (args.format === "json") {
		console.log(JSON.stringify(result, null, 2));
		return;
	}

	// summary — terse markdown
	if ("error" in result) {
		console.log(`## gather-execution-context error`);
		console.log("");
		console.log(`- unit-id: ${args.unitId}`);
		console.log(`- kind: ${args.kind}`);
		console.log(`- error: ${result.error}`);
		return;
	}

	const bucketEntries = Object.entries(result.perRelationType);
	console.log(`## unit ${args.unitId} (${args.kind})`);
	console.log("");
	console.log(`- traversal_depth: ${result.traversal_depth}`);
	console.log(`- scoped_at: ${result.scoped_at}`);
	console.log(`- relation_type buckets: ${bucketEntries.length}`);
	console.log("");
	if (bucketEntries.length === 0) {
		console.log("(no bundle_relation_types declared)");
		return;
	}
	console.log("| relation_type | item_count | items |");
	console.log("| --- | --- | --- |");
	for (const [rt, items] of bucketEntries) {
		const ids = items.map((it) => (it as { id?: unknown }).id).filter((v) => typeof v === "string");
		const idList = ids.length > 0 ? ids.join(", ") : "(none)";
		console.log(`| ${rt} | ${items.length} | ${idList} |`);
	}
}

main();
