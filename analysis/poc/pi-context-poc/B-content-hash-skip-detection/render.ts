// POC B — content-hash skip-detection.
//
// Empirically demonstrates the cache-coherence claim from
// analysis/2026-05-05-pi-context-executive-summary-candidate.md and the
// context-packet pattern lifted in analysis/2026-05-06-context-packet-comparison.md
// §"Pattern 2": every item carries a content_hash computed via
// timestamp-stripped canonicalization; on re-render, items whose hash is
// unchanged from the cached value are marked "cached" (skipped); only
// items with a changed hash are "re-rendered".
//
// Two profiles drive the same load → compare-hash → render path against two
// fixture rounds. Round 1 (default, no argv) writes output/round1.md and
// stores its hashes as the "cache". Round 2 (`render.ts r2`) loads round 1's
// cache from disk + round 2's items, compares per-item, emits per-item
// "cached" or "re-rendered" annotation in output/round2.md.
//
// Mutation between rounds: ITEM-003's body is changed in items-r2.json
// (recompute its content_hash); other 4 items are byte-identical in both
// fixtures, so their content_hash values stay stable across rounds.
//
// No npm dependencies beyond tsx (node builtins + JSON only). hash.ts is the
// 28-line canonicalizer + SHA-256 wrapper.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computeContentHash } from "./hash.js";

const POC_DIR = path.dirname(fileURLToPath(import.meta.url));

interface Item {
	id: string;
	title: string;
	body: string;
	status: string;
	created_at: string;
	content_hash: string;
}

interface ItemsFile {
	items: Item[];
}

interface RenderResult {
	id: string;
	verdict: "rendered" | "cached" | "re-rendered";
	stored_hash: string;
	current_hash: string;
}

// ─── profile resolution ───

interface Profile {
	round: "r1" | "r2";
	dataPath: string;
	outputPath: string;
	cachePath: string;
	label: string;
}

function resolveProfile(): Profile {
	const suffix = process.argv[2];
	if (!suffix || suffix === "r1") {
		return {
			round: "r1",
			dataPath: path.join(POC_DIR, "data", "items-r1.json"),
			outputPath: path.join(POC_DIR, "output", "round1.md"),
			cachePath: path.join(POC_DIR, "output", ".cache-hashes.json"),
			label: "round1",
		};
	}
	if (suffix === "r2") {
		return {
			round: "r2",
			dataPath: path.join(POC_DIR, "data", "items-r2.json"),
			outputPath: path.join(POC_DIR, "output", "round2.md"),
			cachePath: path.join(POC_DIR, "output", ".cache-hashes.json"),
			label: "round2",
		};
	}
	throw new Error(`unknown profile suffix '${suffix}' (expected 'r1' or 'r2' or omit)`);
}

// ─── core ops ───

function loadItems(p: string): Item[] {
	const raw = fs.readFileSync(p, "utf8");
	const parsed = JSON.parse(raw) as ItemsFile;
	return parsed.items;
}

function loadCache(p: string): Record<string, string> {
	if (!fs.existsSync(p)) return {};
	return JSON.parse(fs.readFileSync(p, "utf8")) as Record<string, string>;
}

function saveCache(p: string, items: Item[]): void {
	const map: Record<string, string> = {};
	for (const it of items) map[it.id] = it.content_hash;
	fs.writeFileSync(p, JSON.stringify(map, null, 2) + "\n");
}

// Compare current item's stored content_hash against the cached hash from a
// prior run. Three outcomes: "rendered" (no prior cache entry — first run),
// "cached" (current hash matches cached hash — skip), "re-rendered" (current
// hash differs from cached hash — content changed). Also recomputes the
// content_hash from the item's current fields and asserts it matches the
// stored field; integrity check on the fixture itself.
function classifyItem(item: Item, cache: Record<string, string>): RenderResult {
	const recomputed = computeContentHash(item as unknown as Record<string, unknown>);
	if (recomputed !== item.content_hash) {
		throw new Error(
			`content_hash mismatch on ${item.id}: stored=${item.content_hash} recomputed=${recomputed}`,
		);
	}
	const cached = cache[item.id];
	if (cached === undefined) {
		return { id: item.id, verdict: "rendered", stored_hash: item.content_hash, current_hash: recomputed };
	}
	if (cached === recomputed) {
		return { id: item.id, verdict: "cached", stored_hash: cached, current_hash: recomputed };
	}
	return { id: item.id, verdict: "re-rendered", stored_hash: cached, current_hash: recomputed };
}

// Markdown layout is deliberately minimal: one "verdict line" per item,
// nothing else that would mention the verdict words. This keeps the plan's
// `grep -c "cached"` / `grep -c "re-rendered"` checks unambiguous (one
// substring occurrence per matching item, full stop). Hash-change details
// embed in the same line as the verdict word.
function renderMarkdown(profile: Profile, items: Item[], results: RenderResult[]): string {
	const header = `# POC B — ${profile.label} (${profile.round}, ${items.length} items, fixture ${path.basename(profile.dataPath)})`;
	const itemLines = results.map((r) => {
		if (r.verdict === "cached") {
			return `- ${r.id}: cached (hash ${r.current_hash.slice(0, 12)}… unchanged from prior run)`;
		}
		if (r.verdict === "re-rendered") {
			return `- ${r.id}: re-rendered (hash ${r.stored_hash.slice(0, 12)}… → ${r.current_hash.slice(0, 12)}…)`;
		}
		return `- ${r.id}: rendered (first run, hash ${r.current_hash.slice(0, 12)}…)`;
	});
	return [header, "", ...itemLines, ""].join("\n");
}

function main(): void {
	const profile = resolveProfile();
	console.log(`\n=== POC B profile: ${profile.label} ===`);
	console.log(`fixture: ${path.relative(POC_DIR, profile.dataPath)}`);

	const items = loadItems(profile.dataPath);
	const cache = loadCache(profile.cachePath);
	console.log(`Loaded ${items.length} items; cache entries: ${Object.keys(cache).length}`);

	const results = items.map((it) => classifyItem(it, cache));
	for (const r of results) console.log(`  ${r.id}: ${r.verdict}`);

	fs.mkdirSync(path.dirname(profile.outputPath), { recursive: true });
	fs.writeFileSync(profile.outputPath, renderMarkdown(profile, items, results));
	saveCache(profile.cachePath, items);

	console.log(`\nWrote ${path.relative(POC_DIR, profile.outputPath)}`);
	console.log(`Updated cache at ${path.relative(POC_DIR, profile.cachePath)}`);
}

main();
