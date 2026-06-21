#!/usr/bin/env tsx
/**
 * filter-block-items — predicate-filter projection over a single block
 *
 * Wraps the canonical filterBlockItems library function from
 * @davidorex/pi-context/context-sdk. Used by Claude-Code-side orchestration
 * to slice a block's items by a one-field predicate (eq / neq / in / matches)
 * without hand-rolling readBlock + Array.filter at each call site.
 *
 * Per DEC-0019 dual-surface pattern: this CLI script + the matching pi tool
 * + the underlying library function ship as one unit. The script doubles
 * as executable specification of the predicate-filter contract.
 *
 * SURFACED-GAPS (per DEC-0019 dual-role): closes part of the FGAP-026
 * phase 2 high-impact query-surface gap (TASK-034). No new gaps surfaced
 * during the writing of this script — the discoverArrayKey single-array
 * heuristic was already filed via inject-context-items.ts.
 *
 * Usage:
 *   tsx scripts/orchestrator/filter-block-items.ts \
 *       --block <name> --field <name> --op <eq|neq|in|matches> \
 *       --value <value-or-csv> [--format json|table]
 *
 *   --op in   : --value is parsed as a comma-separated list
 *   --format  : json (default) | table (markdown; id + first 3 non-id fields)
 */
import { filterBlockItems } from "@davidorex/pi-context/context-sdk";

interface Args {
	block: string;
	field: string;
	op: "eq" | "neq" | "in" | "matches";
	value: unknown;
	format: "json" | "table";
}

function parseArgs(argv: string[]): Args {
	const out: Partial<Args> = { format: "json" };
	let rawValue: string | undefined;
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--block" && argv[i + 1]) {
			out.block = argv[i + 1];
			i++;
		} else if (a === "--field" && argv[i + 1]) {
			out.field = argv[i + 1];
			i++;
		} else if (a === "--op" && argv[i + 1]) {
			const v = argv[i + 1];
			if (v !== "eq" && v !== "neq" && v !== "in" && v !== "matches") {
				console.error(`--op must be eq|neq|in|matches (got: ${v})`);
				process.exit(2);
			}
			out.op = v;
			i++;
		} else if (a === "--value" && argv[i + 1]) {
			rawValue = argv[i + 1];
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
	if (!out.block || !out.field || !out.op || rawValue === undefined) {
		console.error("Required: --block <name> --field <name> --op <eq|neq|in|matches> --value <value-or-csv>");
		console.error("Optional: --format json|table (default json)");
		process.exit(2);
	}
	out.value =
		out.op === "in"
			? rawValue
					.split(",")
					.map((s) => s.trim())
					.filter(Boolean)
			: rawValue;
	return out as Args;
}

function renderTable(items: unknown[]): string {
	if (items.length === 0) return "(no matches)";
	// Collect the projection columns: id first if present, then up to 3 other
	// fields seen on the first item. Best-effort terse render — mirrors
	// extract-decs.ts narrative-not-tabular philosophy for unknown block shapes.
	const first = items[0] as Record<string, unknown>;
	const keys = Object.keys(first);
	const hasId = keys.includes("id");
	const others = keys.filter((k) => k !== "id").slice(0, 3);
	const cols = hasId ? ["id", ...others] : others.slice(0, 4);
	const header = `| ${cols.join(" | ")} |`;
	const sep = `| ${cols.map(() => "---").join(" | ")} |`;
	const rows = items.map((raw) => {
		const it = raw as Record<string, unknown>;
		return `| ${cols
			.map((c) => {
				const v = it[c];
				if (v === undefined || v === null) return "";
				const s = typeof v === "string" ? v : JSON.stringify(v);
				const oneLine = s.replace(/\s*\n\s*/g, " ");
				return oneLine.length > 80 ? `${oneLine.slice(0, 77)}...` : oneLine;
			})
			.join(" | ")} |`;
	});
	return [header, sep, ...rows].join("\n");
}

function main(): void {
	const args = parseArgs(process.argv.slice(2));
	let result: unknown[];
	try {
		result = filterBlockItems(process.cwd(), args.block, {
			field: args.field,
			op: args.op,
			value: args.value,
		});
	} catch (err) {
		console.error(`filter-block-items: ${err instanceof Error ? err.message : String(err)}`);
		process.exit(3);
	}
	if (args.format === "json") {
		console.log(JSON.stringify(result, null, 2));
	} else {
		console.log(renderTable(result));
	}
}

main();
