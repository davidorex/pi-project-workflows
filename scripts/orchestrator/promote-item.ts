#!/usr/bin/env tsx
/**
 * promote-item — cross-substrate item promotion (Cycle 9 / G2)
 *
 * Wraps the canonical `promoteItem` library function from
 * @davidorex/pi-context/promote-item. Copies a source item into a registered
 * destination substrate as a NEW content-addressed item (the dest write-path
 * mints a fresh oid + content_hash + content object), files the
 * 'item_derived_from_item' lineage edge into the destination relations.json
 * (parent = the new derived item, child = the source), and — when the source
 * block's status enum supports it — marks the source superseded.
 *
 * Per DEC-0019 dual-surface pattern: this CLI script + the matching pi tool
 * (promote-item) + the underlying promoteItem library function ship as one
 * unit. The script doubles as executable specification of the promotion
 * contract; it is the Claude-Code-side ergonomics twin of the in-pi tool.
 *
 * Usage:
 *   tsx scripts/orchestrator/promote-item.ts \
 *       --source <selector> --to <dest-alias> [--new-refname <id>] [--dry-run] [--writer human:email]
 *
 *   --source      : source item selector (bare refname / <alias>:<refname>)
 *   --to          : registered destination substrate alias
 *   --new-refname : explicit destination refname (else allocated from the dest
 *                   block id pattern)
 *   --dry-run     : compute the destination without writing any channel
 *   --writer      : DispatchContext writer (kind:identifier; default human:davidryan@gmail.com)
 */
import type { DispatchContext, WriterIdentity } from "@davidorex/pi-context/dispatch-context";
import { promoteItem } from "@davidorex/pi-context/promote-item";

interface Args {
	source: string;
	to: string;
	newRefname?: string;
	dryRun: boolean;
	writer: string;
}

function parseArgs(argv: string[]): Args {
	const out: Partial<Args> = { dryRun: false, writer: "human:davidryan@gmail.com" };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--source" && argv[i + 1]) {
			out.source = argv[i + 1];
			i++;
		} else if (a === "--to" && argv[i + 1]) {
			out.to = argv[i + 1];
			i++;
		} else if (a === "--new-refname" && argv[i + 1]) {
			out.newRefname = argv[i + 1];
			i++;
		} else if (a === "--dry-run") {
			out.dryRun = true;
		} else if (a === "--writer" && argv[i + 1]) {
			out.writer = argv[i + 1];
			i++;
		}
	}
	if (out.source === undefined || out.to === undefined) {
		console.error("Required: --source <selector> --to <dest-alias>");
		console.error("Optional: --new-refname <id> | --dry-run | --writer kind:identifier");
		process.exit(2);
	}
	return out as Args;
}

function parseWriter(spec: string): WriterIdentity {
	const idx = spec.indexOf(":");
	const kind = idx === -1 ? spec : spec.slice(0, idx);
	const identifier = idx === -1 ? "" : spec.slice(idx + 1);
	switch (kind) {
		case "human":
			return { kind: "human", user: identifier };
		case "agent":
			return { kind: "agent", agent_id: identifier };
		case "monitor":
			return { kind: "monitor", monitor_name: identifier };
		case "workflow":
			return { kind: "workflow", workflow_step_id: identifier };
		default:
			console.error(`Invalid writer kind ${kind}; allowed: human|agent|monitor|workflow`);
			process.exit(2);
	}
}

function main(): void {
	const args = parseArgs(process.argv.slice(2));
	const ctx: DispatchContext = { writer: parseWriter(args.writer) };
	try {
		const result = promoteItem(
			process.cwd(),
			{
				source: args.source,
				destinationSubstrate: args.to,
				...(args.newRefname !== undefined ? { newRefname: args.newRefname } : {}),
				dryRun: args.dryRun,
			},
			ctx,
		);
		console.log(JSON.stringify(result, null, 2));
	} catch (err) {
		console.error(`promote-item: ${err instanceof Error ? err.message : String(err)}`);
		process.exit(3);
	}
}

main();
