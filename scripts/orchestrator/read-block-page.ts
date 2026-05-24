#!/usr/bin/env tsx
/**
 * read-block-page — paginated read over a single block
 *
 * Wraps the canonical readBlockPage library function from
 * @davidorex/pi-context/project-sdk. Returns a page of a block's items as
 * { items, total, hasMore } so callers can walk blocks too large to fetch
 * whole (FGAP-045: read-block is all-or-nothing + caps at 50KB; e.g.
 * framework-gaps at 88 items / 346KB blows the cap).
 *
 * Per DEC-0019/0020 dual-surface pattern: this CLI script + the matching
 * pi tool (read-block-page) + the underlying library function ship as one
 * unit. The script doubles as executable specification of the contract.
 *
 * Usage:
 *   tsx scripts/orchestrator/read-block-page.ts \
 *       --block <name> [--offset N] [--limit M] [--format json|table]
 *
 *   --offset  : start index, >= 0 (default 0)
 *   --limit   : max items to return, >= 1 (default 50)
 *   --format  : json (default) | table (markdown + footer line)
 */
import { readBlockPage } from "@davidorex/pi-context/context-sdk";

interface Args {
	block: string;
	offset: number;
	limit: number;
	format: "json" | "table";
}

function parseArgs(argv: string[]): Args {
	const out: Partial<Args> = { offset: 0, limit: 50, format: "json" };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--block" && argv[i + 1]) {
			out.block = argv[i + 1];
			i++;
		} else if (a === "--offset" && argv[i + 1]) {
			const n = Number.parseInt(argv[i + 1], 10);
			if (Number.isNaN(n) || n < 0) {
				console.error(`--offset must be an integer >= 0 (got: ${argv[i + 1]})`);
				process.exit(2);
			}
			out.offset = n;
			i++;
		} else if (a === "--limit" && argv[i + 1]) {
			const n = Number.parseInt(argv[i + 1], 10);
			if (Number.isNaN(n) || n < 1) {
				console.error(`--limit must be an integer >= 1 (got: ${argv[i + 1]})`);
				process.exit(2);
			}
			out.limit = n;
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
	if (!out.block) {
		console.error("Required: --block <name>");
		console.error(
			"Optional: --offset N (>=0, default 0) --limit M (>=1, default 50) --format json|table (default json)",
		);
		process.exit(2);
	}
	return out as Args;
}

function renderTable(items: unknown[]): string {
	if (items.length === 0) return "(no items)";
	// id first if present, then up to 3 other fields seen on the first item.
	// Mirrors filter-block-items.ts renderTable.
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
	let result: { items: unknown[]; total: number; hasMore: boolean };
	try {
		result = readBlockPage(process.cwd(), args.block, { offset: args.offset, limit: args.limit });
	} catch (err) {
		console.error(`read-block-page: ${err instanceof Error ? err.message : String(err)}`);
		process.exit(3);
	}
	if (args.format === "json") {
		console.log(JSON.stringify(result, null, 2));
	} else {
		console.log(renderTable(result.items));
		console.log(`\noffset ${args.offset} · limit ${args.limit} · total ${result.total} · hasMore ${result.hasMore}`);
	}
}

main();
