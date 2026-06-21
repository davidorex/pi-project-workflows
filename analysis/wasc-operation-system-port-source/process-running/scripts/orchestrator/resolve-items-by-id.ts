#!/usr/bin/env tsx
/**
 * resolve-items-by-id — bulk-resolve kind-prefixed ids to their block locations
 *
 * Wraps the canonical resolveItemsByIds library function from
 * @davidorex/pi-context/context-sdk. Used by Claude-Code-side orchestration
 * to map N input ids → N {block, arrayKey, item}|null entries against a
 * single buildIdIndex traversal, replacing the N×singular-call pattern.
 *
 * Per DEC-0019 dual-surface pattern: this CLI script + the matching pi tool
 * (resolve-items-by-id) + the underlying library function ship as one unit.
 * The script doubles as executable specification of the bulk-resolve
 * contract. Coexists with scripts/orchestrator usage of the singular
 * resolve-item-by-id pi tool / resolveItemById library function — bulk
 * variant adds the multi-id surface, never supersedes the singular form.
 *
 * SURFACED-GAPS (per DEC-0019 dual-role): closes part of the FGAP-026
 * phase 2 high-impact query-surface gap (TASK-035). No new gaps surfaced
 * during the writing of this script — the buildIdIndex prefix-vs-block
 * invariant already lives behind resolveItemsByIds; orchestrator surfacing
 * is a pure ergonomics layer.
 *
 * Usage:
 *   tsx scripts/orchestrator/resolve-items-by-id.ts \
 *       --ids id1,id2,id3 [--format json|table]
 *
 *   --ids   : comma-separated kind-prefixed ids (DEC-/FGAP-/TASK-/issue-/REQ-/...)
 *   --format: json (default) — { id: location|null, ... } object
 *             table          — markdown table | id | block | array_key | found |
 */
import { resolveItemsByIds } from "@davidorex/pi-context/context-sdk";

interface Args {
	ids: string[];
	format: "json" | "table";
}

function parseArgs(argv: string[]): Args {
	const out: Partial<Args> = { format: "json" };
	let rawIds: string | undefined;
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--ids" && argv[i + 1]) {
			rawIds = argv[i + 1];
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
	if (rawIds === undefined) {
		console.error("Required: --ids id1,id2,id3");
		console.error("Optional: --format json|table (default json)");
		process.exit(2);
	}
	out.ids = rawIds
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
	return out as Args;
}

function renderTable(map: Map<string, { block: string; arrayKey: string } | null>): string {
	if (map.size === 0) return "(no ids)";
	const header = "| id | block | array_key | found |";
	const sep = "| --- | --- | --- | --- |";
	const rows: string[] = [];
	for (const [id, loc] of map) {
		if (loc === null) {
			rows.push(`| ${id} |  |  | N |`);
		} else {
			rows.push(`| ${id} | ${loc.block} | ${loc.arrayKey} | Y |`);
		}
	}
	return [header, sep, ...rows].join("\n");
}

function main(): void {
	const args = parseArgs(process.argv.slice(2));
	let result: Map<string, { block: string; arrayKey: string; item: Record<string, unknown> } | null>;
	try {
		result = resolveItemsByIds(process.cwd(), args.ids);
	} catch (err) {
		console.error(`resolve-items-by-id: ${err instanceof Error ? err.message : String(err)}`);
		process.exit(3);
	}
	if (args.format === "json") {
		const obj: Record<string, unknown> = {};
		for (const [id, loc] of result) obj[id] = loc;
		console.log(JSON.stringify(obj, null, 2));
	} else {
		console.log(renderTable(result));
	}
}

main();
