#!/usr/bin/env tsx
/**
 * extract-decs — atomic-element extractor for .project/decisions.json
 *
 * Reads the decisions block via pi-context block-api (canonical surface; no
 * parallel JSON parsing) and emits each DEC as a markdown-formatted block
 * suitable for embedding in subagent briefs / plans.
 *
 * Usage:
 *   tsx scripts/orchestrator/extract-decs.ts [--status enacted|open|superseded] [--ids DEC-0014,DEC-0015]
 *
 * POC of "rendering out of atomic context blocks" per DEC-0017 spirit. Pain
 * points / gaps surface as hand-rolled rendering hits limits — file as FGAPs.
 */
import { readBlock } from "@davidorex/pi-context/block-api";

interface DecisionItem {
	id: string;
	title: string;
	status: string;
	context: string;
	decision: string;
	consequences?: string[];
	references?: Array<{ label: string; path?: string }>;
}

function parseArgs(argv: string[]): { status?: string; ids?: string[]; full: boolean } {
	const out: { status?: string; ids?: string[]; full: boolean } = { full: false };
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === "--status" && argv[i + 1]) {
			out.status = argv[i + 1];
			i++;
		} else if (argv[i] === "--ids" && argv[i + 1]) {
			out.ids = argv[i + 1].split(",").map((s) => s.trim());
			i++;
		} else if (argv[i] === "--full") {
			out.full = true;
		}
	}
	return out;
}

function renderDec(dec: DecisionItem, full: boolean): string {
	const lines: string[] = [];
	lines.push(`### ${dec.id} — ${dec.title} (${dec.status})`);
	lines.push(`**Decision**: ${dec.decision}`);
	if (full && dec.consequences && dec.consequences.length > 0) {
		lines.push("");
		lines.push("**Consequences**:");
		for (const c of dec.consequences) lines.push(`- ${c}`);
	}
	return lines.join("\n");
}

function main(): void {
	const args = parseArgs(process.argv.slice(2));
	const block = readBlock(process.cwd(), "decisions") as { decisions: DecisionItem[] };
	let decs = block.decisions;
	if (args.status) decs = decs.filter((d) => d.status === args.status);
	if (args.ids) decs = decs.filter((d) => args.ids!.includes(d.id));
	for (const dec of decs) {
		console.log(renderDec(dec, args.full));
		console.log("");
	}
}

main();
