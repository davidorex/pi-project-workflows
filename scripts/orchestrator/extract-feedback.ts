#!/usr/bin/env tsx
/**
 * extract-feedback — atomic-element extractor for memory feedback files
 *
 * Reads ~/.claude/projects/<this-project>/memory/feedback_*.md files, parses
 * YAML frontmatter (name, description, type) + body, and emits each as a
 * markdown-formatted block suitable for embedding in subagent briefs.
 *
 * Usage:
 *   tsx scripts/orchestrator/extract-feedback.ts [--names name1,name2] [--all]
 *
 * Pain point candidate: feedback files live OUTSIDE the substrate (memory dir is
 * orchestrator-side, not .project/). Surfaces a gap: no canonical block-api path
 * for memory-layer reads. Workaround: native fs + frontmatter parsing.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const MEMORY_DIR = path.join(
	os.homedir(),
	".claude",
	"projects",
	"-Users-david-Projects-workflowsPiExtension",
	"memory",
);

interface FeedbackEntry {
	filename: string;
	name?: string;
	description?: string;
	type?: string;
	body: string;
}

function parseFrontmatter(content: string): { fm: Record<string, string>; body: string } {
	if (!content.startsWith("---\n")) return { fm: {}, body: content };
	const end = content.indexOf("\n---\n", 4);
	if (end === -1) return { fm: {}, body: content };
	const fmText = content.slice(4, end);
	const body = content.slice(end + 5);
	const fm: Record<string, string> = {};
	for (const line of fmText.split("\n")) {
		const colon = line.indexOf(":");
		if (colon === -1) continue;
		const k = line.slice(0, colon).trim();
		const v = line.slice(colon + 1).trim();
		fm[k] = v;
	}
	return { fm, body };
}

function loadFeedback(filename: string): FeedbackEntry {
	const fullPath = path.join(MEMORY_DIR, filename);
	const content = fs.readFileSync(fullPath, "utf-8");
	const { fm, body } = parseFrontmatter(content);
	return {
		filename,
		name: fm.name,
		description: fm.description,
		type: fm.type,
		body: body.trim(),
	};
}

function parseArgs(argv: string[]): { names?: string[]; all: boolean; full: boolean } {
	const out: { names?: string[]; all: boolean; full: boolean } = { all: false, full: false };
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === "--names" && argv[i + 1]) {
			out.names = argv[i + 1].split(",").map((s) => s.trim());
			i++;
		} else if (argv[i] === "--all") {
			out.all = true;
		} else if (argv[i] === "--full") {
			out.full = true;
		}
	}
	return out;
}

function summarizeBody(body: string): string {
	// Default: emit the description-equivalent summary — first paragraph after frontmatter,
	// trimmed to first sentence-or-two if very long. Skip "Why:" / "How to apply:" / examples.
	const paragraphs = body.split(/\n\n+/);
	if (paragraphs.length === 0) return "";
	const first = paragraphs[0].trim();
	// Cap at ~3 lines / 400 chars to preserve signal without elaboration
	if (first.length > 400) return `${first.slice(0, 400)}…`;
	return first;
}

function renderFeedback(fb: FeedbackEntry, full: boolean): string {
	const lines: string[] = [];
	lines.push(`### ${fb.name ?? fb.filename}`);
	if (fb.description) lines.push(`_${fb.description}_`);
	lines.push("");
	lines.push(full ? fb.body : summarizeBody(fb.body));
	return lines.join("\n");
}

function main(): void {
	const args = parseArgs(process.argv.slice(2));
	const allFiles = fs.readdirSync(MEMORY_DIR).filter((f) => f.startsWith("feedback_") && f.endsWith(".md"));
	let selected: string[];
	if (args.names) {
		selected = allFiles.filter((f) => {
			const stem = f.replace(/^feedback_/, "").replace(/\.md$/, "");
			return args.names!.includes(stem) || args.names!.includes(f);
		});
	} else if (args.all) {
		selected = allFiles;
	} else {
		console.error("Specify --names <comma-list> or --all");
		process.exit(2);
	}
	for (const filename of selected) {
		const fb = loadFeedback(filename);
		console.log(renderFeedback(fb, args.full));
		console.log("");
	}
}

main();
