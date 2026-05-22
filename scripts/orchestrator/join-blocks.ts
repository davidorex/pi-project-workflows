#!/usr/bin/env tsx
/**
 * join-blocks — one-call HYBRID cross-block join (FGAP-043)
 *
 * Wraps the canonical joinBlocks library function from
 * @davidorex/pi-context/project-sdk. Pairs left-block items with right-block
 * items in a single call instead of N+1 read-block + resolve at each call site.
 *
 *   EDGE mode  : --relation-type <rt>  — pairs via a relations.json edge
 *                (--left-endpoint parent|child selects which end the left item is)
 *   FIELD mode : --left-field <lf> --right-field <rf>  — pairs where
 *                left[lf] === right[rf] (shared field value)
 *
 * Per DEC-0019/0020 dual-surface pattern: this CLI script + the matching pi
 * tool (join-blocks) + the underlying library function ship as one unit. The
 * script doubles as executable specification of the join contract.
 *
 * Usage:
 *   tsx scripts/orchestrator/join-blocks.ts \
 *       --left-block <name> --right-block <name> \
 *       (--relation-type <rt> [--left-endpoint parent|child]
 *        | --left-field <lf> --right-field <rf>) \
 *       [--where <field:op:value>] [--format json|table]
 *
 *   --where  : optional left pre-filter, parsed as field:op:value (op default eq)
 *   --format : json (default) | table (one line per pair: <left.id> -> [<right.id>, ...])
 */
import { joinBlocks } from "@davidorex/pi-context/project-sdk";

interface Args {
	leftBlock: string;
	rightBlock: string;
	relationType?: string;
	leftField?: string;
	rightField?: string;
	leftEndpoint?: "parent" | "child";
	where?: { field: string; op: "eq" | "neq" | "in" | "matches"; value: unknown };
	format: "json" | "table";
}

function parseArgs(argv: string[]): Args {
	const out: Partial<Args> = { format: "json" };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--left-block" && argv[i + 1]) {
			out.leftBlock = argv[i + 1];
			i++;
		} else if (a === "--right-block" && argv[i + 1]) {
			out.rightBlock = argv[i + 1];
			i++;
		} else if (a === "--relation-type" && argv[i + 1]) {
			out.relationType = argv[i + 1];
			i++;
		} else if (a === "--left-field" && argv[i + 1]) {
			out.leftField = argv[i + 1];
			i++;
		} else if (a === "--right-field" && argv[i + 1]) {
			out.rightField = argv[i + 1];
			i++;
		} else if (a === "--left-endpoint" && argv[i + 1]) {
			const v = argv[i + 1];
			if (v !== "parent" && v !== "child") {
				console.error(`--left-endpoint must be parent|child (got: ${v})`);
				process.exit(2);
			}
			out.leftEndpoint = v;
			i++;
		} else if (a === "--where" && argv[i + 1]) {
			const parts = argv[i + 1].split(":");
			if (parts.length !== 3) {
				console.error(`--where must be field:op:value (got: ${argv[i + 1]})`);
				process.exit(2);
			}
			const [field, op, value] = parts;
			if (op !== "eq" && op !== "neq" && op !== "in" && op !== "matches") {
				console.error(`--where op must be eq|neq|in|matches (got: ${op})`);
				process.exit(2);
			}
			out.where = { field, op, value };
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
	if (!out.leftBlock || !out.rightBlock) {
		console.error("Required: --left-block <name> --right-block <name>");
		console.error("Mode (exactly one): --relation-type <rt> | --left-field <lf> --right-field <rf>");
		process.exit(2);
	}
	const isEdge = out.relationType !== undefined;
	const isField = out.leftField !== undefined || out.rightField !== undefined;
	if (isEdge === isField) {
		console.error("Specify exactly one mode: --relation-type <rt> OR --left-field <lf> --right-field <rf>");
		process.exit(2);
	}
	if (isField && (out.leftField === undefined || out.rightField === undefined)) {
		console.error("Field mode requires both --left-field and --right-field");
		process.exit(2);
	}
	return out as Args;
}

function renderTable(result: { left: Record<string, unknown>; right: Record<string, unknown>[] }[]): string {
	if (result.length === 0) return "(no left items)";
	return result
		.map((pair) => {
			const leftId = typeof pair.left.id === "string" ? pair.left.id : JSON.stringify(pair.left.id);
			const rightIds = pair.right.map((r) => (typeof r.id === "string" ? r.id : JSON.stringify(r.id)));
			return `${leftId} -> [${rightIds.join(", ")}]`;
		})
		.join("\n");
}

function main(): void {
	const args = parseArgs(process.argv.slice(2));
	let result: { left: Record<string, unknown>; right: Record<string, unknown>[] }[];
	try {
		result = joinBlocks(process.cwd(), {
			leftBlock: args.leftBlock,
			rightBlock: args.rightBlock,
			relationType: args.relationType,
			leftField: args.leftField,
			rightField: args.rightField,
			leftEndpoint: args.leftEndpoint,
			leftPredicate: args.where,
		});
	} catch (err) {
		console.error(`join-blocks: ${err instanceof Error ? err.message : String(err)}`);
		process.exit(3);
	}
	if (args.format === "json") {
		console.log(JSON.stringify(result, null, 2));
	} else {
		console.log(renderTable(result));
	}
}

main();
