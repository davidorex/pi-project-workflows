// POC D — coverage-rank ranker over typed substrate (driver).
//
// Loads data/items.json (15 mixed-kind items: DEC-, FEAT-, R-, FGAP-, issue-),
// builds an in-memory id index (mini buildIdIndex equivalent), runs the
// coverage-rank ranker against one of three preset queries, and writes a
// markdown report with per-item coverage signals to output/<query-slug>.md.
//
// Usage:
//   npx tsx render.ts testing      → output/query-testing.md
//   npx tsx render.ts performance  → output/query-performance.md
//   npx tsx render.ts naming       → output/query-naming.md
//
// Three queries — preset and verifiable per README's expected-results table.
//
// Node builtins + JSON only. No third-party deps.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { coverageRank, type RankableItem, type RankSignal } from "./coverage-rank.js";

const POC_DIR = path.dirname(fileURLToPath(import.meta.url));

interface IdIndexEntry {
	id: string;
	kind: string;
	title: string;
	body: string;
}

// Mini buildIdIndex equivalent: flat in-memory id → record map. Production
// pi-project's buildIdIndex walks `.project/*.json` per block_kinds[]; here
// we read a single fixture file because the POC scope is the ranker, not
// the index. See A-identity-display-decoupling for multi-block index.
function buildIdIndex(itemsPath: string): Map<string, IdIndexEntry> {
	const raw = fs.readFileSync(itemsPath, "utf8");
	const parsed = JSON.parse(raw) as { items: IdIndexEntry[] };
	const idx = new Map<string, IdIndexEntry>();
	for (const item of parsed.items) {
		if (idx.has(item.id)) {
			throw new Error(`Duplicate id in fixture: ${item.id}`);
		}
		idx.set(item.id, item);
	}
	return idx;
}

interface QueryPreset {
	slug: string;
	queryText: string;
}

const QUERIES: Record<string, QueryPreset> = {
	testing: {
		slug: "query-testing",
		queryText: "testing strategy",
	},
	performance: {
		slug: "query-performance",
		queryText: "performance optimization",
	},
	naming: {
		slug: "query-naming",
		queryText: "naming conventions",
	},
};

function resolveQuery(): QueryPreset {
	const arg = process.argv[2];
	if (!arg) {
		throw new Error(
			`Query argument required. Usage: npx tsx render.ts <testing|performance|naming>`,
		);
	}
	const preset = QUERIES[arg];
	if (!preset) {
		throw new Error(
			`Unknown query '${arg}'. Available: ${Object.keys(QUERIES).join(", ")}`,
		);
	}
	return preset;
}

function renderReport(preset: QueryPreset, ranked: RankSignal[]): string {
	const lines: string[] = [];
	lines.push(`# Coverage-rank query: "${preset.queryText}"`);
	lines.push("");
	lines.push(`**Query slug:** \`${preset.slug}\`  `);
	lines.push(`**Items scored (with at least one keyword hit):** ${ranked.length}`);
	lines.push("");
	lines.push("Ranked most-relevant-first by set-covering selection: each row's");
	lines.push("`new coverage` column shows which query keywords this item adds");
	lines.push("that no higher-ranked item already covered.");
	lines.push("");
	lines.push("| Rank | ID | Kind | Title | Hits | Pos | Freq | Total | New coverage |");
	lines.push("|------|----|----|-------|------|-----|------|-------|--------------|");
	for (let i = 0; i < ranked.length; i++) {
		const r = ranked[i];
		const newCov = r.newCoverage.length > 0 ? r.newCoverage.join(", ") : "—";
		lines.push(
			`| ${i + 1} | ${r.id} | ${r.kind} | ${r.title} | ${r.keywordHits} | ${r.positionScore} | ${r.frequencyScore} | ${r.totalScore} | ${newCov} |`,
		);
	}
	lines.push("");
	lines.push("## Coverage signals (top 5)");
	lines.push("");
	const top = ranked.slice(0, 5);
	for (let i = 0; i < top.length; i++) {
		const r = top[i];
		lines.push(`### ${i + 1}. ${r.id} — ${r.title}`);
		lines.push("");
		lines.push(`- **kind:** \`${r.kind}\``);
		lines.push(`- **keyword-hit count:** ${r.keywordHits}`);
		lines.push(`- **position-weighted score:** ${r.positionScore}`);
		lines.push(`- **frequency score:** ${r.frequencyScore}`);
		lines.push(`- **total rank score:** ${r.totalScore}`);
		lines.push(`- **unique keywords matched:** ${r.uniqueKeywordsCovered.join(", ")}`);
		lines.push(
			`- **new coverage contributed at this rank:** ${r.newCoverage.length > 0 ? r.newCoverage.join(", ") : "(none — already covered above)"}`,
		);
		lines.push("");
	}
	return lines.join("\n");
}

function main(): void {
	const preset = resolveQuery();
	console.log(`\n=== POC D query: "${preset.queryText}" (slug=${preset.slug}) ===`);

	const itemsPath = path.join(POC_DIR, "data", "items.json");
	const idx = buildIdIndex(itemsPath);
	console.log(`Loaded id index: ${idx.size} items`);

	const candidates: RankableItem[] = Array.from(idx.values()).map((e) => ({
		id: e.id,
		kind: e.kind,
		title: e.title,
		body: e.body,
	}));

	const ranked = coverageRank(candidates, preset.queryText);
	console.log(`Ranker returned ${ranked.length} item(s) with at least one keyword hit`);

	const report = renderReport(preset, ranked);
	const outDir = path.join(POC_DIR, "output");
	fs.mkdirSync(outDir, { recursive: true });
	const outPath = path.join(outDir, `${preset.slug}.md`);
	fs.writeFileSync(outPath, report);
	const rel = path.relative(POC_DIR, outPath);
	console.log(`Wrote ${rel}`);

	console.log("\nTop-3 result summary:");
	for (let i = 0; i < Math.min(3, ranked.length); i++) {
		const r = ranked[i];
		console.log(
			`  ${i + 1}. ${r.id} (${r.kind}) — score=${r.totalScore} hits=${r.keywordHits} new=[${r.newCoverage.join(",")}]`,
		);
	}
}

main();
