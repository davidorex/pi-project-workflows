#!/usr/bin/env tsx
/**
 * extract-markdown-section — generic markdown section extractor
 *
 * Reads a markdown file + emits content of a specific top-level section by header.
 * Used to pluck a Site Inventory table from an explore report, a phase row from
 * a plan's sub-phase analysis document, etc.
 *
 * Usage:
 *   tsx scripts/orchestrator/extract-markdown-section.ts --file <path> --section "## Site inventory"
 *   tsx scripts/orchestrator/extract-markdown-section.ts --file <path> --section "## Audit-grep results"
 *
 * Section boundary: from the matching header line to the next sibling-level
 * header (same `#` count) OR end-of-file. Emits the section header itself
 * unless --no-header passed.
 */
import fs from "node:fs";

interface Args {
	file: string;
	section: string;
	noHeader: boolean;
}

function parseArgs(argv: string[]): Args {
	const out: Partial<Args> = { noHeader: false };
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === "--file" && argv[i + 1]) {
			out.file = argv[i + 1];
			i++;
		} else if (argv[i] === "--section" && argv[i + 1]) {
			out.section = argv[i + 1];
			i++;
		} else if (argv[i] === "--no-header") {
			out.noHeader = true;
		}
	}
	if (!out.file || !out.section) {
		console.error('Required: --file <path> --section "## Header text" [--no-header]');
		process.exit(2);
	}
	return out as Args;
}

function main(): void {
	const args = parseArgs(process.argv.slice(2));
	if (!fs.existsSync(args.file)) {
		console.error(`File not found: ${args.file}`);
		process.exit(3);
	}
	const content = fs.readFileSync(args.file, "utf-8");
	const lines = content.split("\n");
	const headerMatch = /^(#+)\s/.exec(args.section);
	if (!headerMatch) {
		console.error(`--section must start with one or more '#' followed by space (got: ${args.section})`);
		process.exit(2);
	}
	const targetLevel = headerMatch[1].length;
	const headerNorm = args.section.trim();

	let inSection = false;
	const out: string[] = [];
	for (const line of lines) {
		const m = /^(#+)\s/.exec(line);
		if (inSection && m && m[1].length <= targetLevel) {
			break;
		}
		if (!inSection && line.trim() === headerNorm) {
			inSection = true;
			if (!args.noHeader) out.push(line);
			continue;
		}
		if (inSection) out.push(line);
	}
	if (out.length === 0 && !inSection) {
		console.error(`Section not found: ${args.section}`);
		process.exit(4);
	}
	process.stdout.write(out.join("\n"));
	if (!out[out.length - 1]?.endsWith("\n")) process.stdout.write("\n");
}

main();
