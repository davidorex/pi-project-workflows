#!/usr/bin/env tsx
/**
 * read-block-item — single-item read over a single block by id
 *
 * Wraps the canonical readBlockItem library function from
 * @davidorex/pi-context/project-sdk. Reads ONE item from a named block by
 * its id (block-scoped — unlike resolve-item-by-id, which searches all
 * blocks by kind-prefixed id). Avoids fetching a whole large block to get
 * one item (FGAP-045: read-block is all-or-nothing + caps at 50KB).
 *
 * Per DEC-0019/0020 dual-surface pattern: this CLI script + the matching
 * pi tool (read-block-item) + the underlying library function ship as one
 * unit. The script doubles as executable specification of the contract.
 *
 * Usage:
 *   tsx scripts/orchestrator/read-block-item.ts \
 *       --block <name> --id <item-id> [--format json|table]
 *
 *   --format  : json (default) | table (markdown; id + up to 3 fields)
 */
import { readBlockItem } from "@davidorex/pi-context/project-sdk";

interface Args {
	block: string;
	id: string;
	format: "json" | "table";
}

function parseArgs(argv: string[]): Args {
	const out: Partial<Args> = { format: "json" };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--block" && argv[i + 1]) {
			out.block = argv[i + 1];
			i++;
		} else if (a === "--id" && argv[i + 1]) {
			out.id = argv[i + 1];
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
	if (!out.block || !out.id) {
		console.error("Required: --block <name> --id <item-id>");
		console.error("Optional: --format json|table (default json)");
		process.exit(2);
	}
	return out as Args;
}

function renderItem(item: unknown): string {
	if (item === null || item === undefined) return "(not found)";
	// Single markdown row: id first if present, then up to 3 other fields.
	// Mirrors filter-block-items.ts renderTable for a single item.
	const it = item as Record<string, unknown>;
	const keys = Object.keys(it);
	const hasId = keys.includes("id");
	const others = keys.filter((k) => k !== "id").slice(0, 3);
	const cols = hasId ? ["id", ...others] : others.slice(0, 4);
	const header = `| ${cols.join(" | ")} |`;
	const sep = `| ${cols.map(() => "---").join(" | ")} |`;
	const row = `| ${cols
		.map((c) => {
			const v = it[c];
			if (v === undefined || v === null) return "";
			const s = typeof v === "string" ? v : JSON.stringify(v);
			const oneLine = s.replace(/\s*\n\s*/g, " ");
			return oneLine.length > 80 ? `${oneLine.slice(0, 77)}...` : oneLine;
		})
		.join(" | ")} |`;
	return [header, sep, row].join("\n");
}

function main(): void {
	const args = parseArgs(process.argv.slice(2));
	let result: unknown;
	try {
		result = readBlockItem(process.cwd(), args.block, args.id);
	} catch (err) {
		console.error(`read-block-item: ${err instanceof Error ? err.message : String(err)}`);
		process.exit(3);
	}
	if (args.format === "json") {
		console.log(JSON.stringify(result, null, 2));
	} else {
		console.log(renderItem(result));
	}
}

main();
