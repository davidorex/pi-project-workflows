#!/usr/bin/env tsx
/**
 * inject-context-items — item-level substrate-item projection for subagent briefs
 *
 * Selects specific block items by `<block>:<itemId>` selector, reads via
 * @davidorex/pi-context/block-api readBlock, projects to one of three output
 * formats:
 *   - json   — array of items (single-source-of-truth raw projection)
 *   - xml    — each item wrapped in <item block="X" id="Y">...</item>
 *   - markdown — per-block-kind macro projection (fallback rendering until
 *                per-block-kind render macros exist for the newer block kinds)
 *
 * Per the dogfood rationale, this script doubles as schema-shape discovery test
 * surface: friction points encountered while running it get filed as follow-up
 * FGAPs. Initial known friction points:
 *   - array_key per block is not advertised in any single registry the script
 *     can read; current implementation discovers via "single top-level array
 *     property" heuristic
 *   - id field name is assumed `id` for all blocks (no per-block id-field
 *     declaration in the registry); violations get surfaced as FGAPs
 *
 * Closes the missing Claude-Code-side item-level context-injection surface.
 *
 * Usage:
 *   tsx scripts/orchestrator/inject-context-items.ts \
 *       --items framework-gaps:FGAP-035,tasks:TASK-031,decisions:DEC-0015 \
 *       --format markdown \
 *       [--fields id,description,status]
 */
import { readBlock } from "@davidorex/pi-context/block-api";

interface Selector {
	block: string;
	itemId: string;
}

interface Args {
	items: Selector[];
	format: "json" | "xml" | "markdown";
	fields?: string[];
}

function parseArgs(argv: string[]): Args {
	const out: Partial<Args> = {};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--items" && argv[i + 1]) {
			out.items = argv[i + 1]
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean)
				.map((token) => {
					const colonIdx = token.indexOf(":");
					if (colonIdx === -1) {
						console.error(`--items selector missing colon: ${token} (expected <block>:<itemId>)`);
						process.exit(2);
					}
					return { block: token.slice(0, colonIdx).trim(), itemId: token.slice(colonIdx + 1).trim() };
				});
			i++;
		} else if (a === "--format" && argv[i + 1]) {
			const v = argv[i + 1];
			if (v !== "json" && v !== "xml" && v !== "markdown") {
				console.error(`--format must be json|xml|markdown (got: ${v})`);
				process.exit(2);
			}
			out.format = v;
			i++;
		} else if (a === "--fields" && argv[i + 1]) {
			out.fields = argv[i + 1]
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean);
			i++;
		}
	}
	if (!out.items || out.items.length === 0 || !out.format) {
		console.error("Required: --items <block>:<itemId>[,<block>:<itemId>...] --format json|xml|markdown");
		console.error("Optional: --fields field1,field2 (projection)");
		process.exit(2);
	}
	return out as Args;
}

function discoverArrayKey(blockData: Record<string, unknown>): string | null {
	const arrayKeys = Object.entries(blockData).filter(([, v]) => Array.isArray(v));
	if (arrayKeys.length === 1) return arrayKeys[0][0];
	if (arrayKeys.length === 0) return null;
	const candidates = arrayKeys.map(([k]) => k).join(", ");
	console.error(`discoverArrayKey: ambiguous — multiple array properties found (${candidates})`);
	console.error(
		"FRICTION: array_key is not declared per-block in any registry the script can read. File as follow-up FGAP if this surfaces.",
	);
	process.exit(5);
}

function projectFields(item: Record<string, unknown>, fields?: string[]): Record<string, unknown> {
	if (!fields || fields.length === 0) return item;
	const out: Record<string, unknown> = {};
	for (const f of fields) {
		if (f in item) out[f] = item[f];
	}
	return out;
}

function renderMarkdownFallback(selector: Selector, item: Record<string, unknown>): string {
	const lines: string[] = [];
	const id = (item.id as string | undefined) ?? selector.itemId;
	lines.push(`## ${selector.block}: ${id}`);
	lines.push("");
	for (const [k, v] of Object.entries(item)) {
		if (k === "id") continue;
		if (typeof v === "string") {
			if (v.includes("\n")) {
				lines.push(`**${k}**:`);
				lines.push("");
				lines.push(v);
				lines.push("");
			} else {
				lines.push(`**${k}**: ${v}`);
			}
		} else if (Array.isArray(v)) {
			lines.push(`**${k}** (${v.length}):`);
			for (const el of v) {
				if (typeof el === "string") lines.push(`- ${el}`);
				else lines.push(`- ${JSON.stringify(el)}`);
			}
		} else if (v !== null && v !== undefined) {
			lines.push(`**${k}**: ${JSON.stringify(v)}`);
		}
	}
	lines.push("");
	return lines.join("\n");
}

function renderXml(selector: Selector, item: Record<string, unknown>): string {
	return `<item block="${selector.block}" id="${selector.itemId}">\n${JSON.stringify(item, null, 2)}\n</item>`;
}

function main(): void {
	const args = parseArgs(process.argv.slice(2));
	const projected: Array<{ selector: Selector; item: Record<string, unknown> }> = [];

	for (const sel of args.items) {
		let blockData: Record<string, unknown>;
		try {
			blockData = readBlock(process.cwd(), sel.block) as Record<string, unknown>;
		} catch (err) {
			console.error(
				`inject-context-items: failed to read block "${sel.block}": ${err instanceof Error ? err.message : String(err)}`,
			);
			process.exit(3);
		}
		const arrayKey = discoverArrayKey(blockData);
		if (arrayKey === null) {
			console.error(
				`inject-context-items: block "${sel.block}" has no top-level array property — cannot resolve item ${sel.itemId}`,
			);
			console.error(
				"FRICTION: singleton-shaped blocks (e.g. project, handoff) need a different selector convention. File as follow-up FGAP.",
			);
			process.exit(4);
		}
		const arr = blockData[arrayKey] as Array<Record<string, unknown>>;
		const item = arr.find((i) => i.id === sel.itemId);
		if (!item) {
			console.error(`inject-context-items: item not found — ${sel.block}:${sel.itemId} (searched ${arr.length} items)`);
			process.exit(6);
		}
		projected.push({ selector: sel, item: projectFields(item, args.fields) });
	}

	if (args.format === "json") {
		console.log(
			JSON.stringify(
				projected.map((p) => p.item),
				null,
				2,
			),
		);
	} else if (args.format === "xml") {
		console.log(projected.map((p) => renderXml(p.selector, p.item)).join("\n\n"));
	} else {
		// markdown fallback (to be replaced by per-block-kind render macros)
		console.log(projected.map((p) => renderMarkdownFallback(p.selector, p.item)).join("\n---\n\n"));
	}
}

main();
