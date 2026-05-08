// POC I — skip-detection end-to-end.
//
// Empirically demonstrates the cache-coherence claim in a realistic injection
// pipeline that combines three previously-isolated POC primitives:
//   - POC B: content-hash skip-detection (hash.ts, byte-identical copy)
//   - POC D: coverage-rank ranker (coverage-rank.ts, byte-identical copy)
//   - POC F: cascade fail-stop semantics (cascade.ts, byte-identical copy)
//
// Pipeline per round:
//   1. Load items-rN.json
//   2. Run coverage-rank against the fixed query "testing strategy"
//   3. Take top-k (k=4) ranked items as the selected injection set
//   4. Run cascade (skip-mode default per POC F's contract) over selected set
//   5. Compare each selected item's content_hash against the cached map from
//      the prior round; annotate per-item "rendered" / "cached" / "re-rendered"
//   6. Emit the final injection markdown with per-item annotations and update
//      the shared cache file
//
// Mutation between rounds: items-r2.json mutates ITEM-003's body in a sentence
// that contains neither "testing" nor "strategy", so the keyword distribution
// driving coverage-rank stays identical and the top-k id set is stable across
// rounds. Only ITEM-003's content_hash changes, so on round 2 only ITEM-003
// is re-rendered while the other top-k items are cache hits.
//
// Usage:
//   npx tsx render.ts        → default round 1, writes output/r1-injection.md
//   npx tsx render.ts r2     → round 2, writes output/r2-injection.md
//
// Self-contained: hash.ts / coverage-rank.ts / cascade.ts are duplicated into
// this POC dir per the precedent's self-containment discipline (no symlinks,
// no sibling-dir imports). Node builtins + JSON only.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computeContentHash } from "./hash.js";
import { coverageRank, type RankableItem, type RankSignal } from "./coverage-rank.js";
import { type ItemRecord, type StepResult, applyBudget, renderItem, wrapDelimiters } from "./cascade.js";

const POC_DIR = path.dirname(fileURLToPath(import.meta.url));

// ─── Fixture shape ───

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

// ─── Profile + invariants ───

const QUERY_TEXT = "testing strategy";
const TOP_K = 4;

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
			outputPath: path.join(POC_DIR, "output", "r1-injection.md"),
			cachePath: path.join(POC_DIR, "output", ".cache-hashes.json"),
			label: "round-1",
		};
	}
	if (suffix === "r2") {
		return {
			round: "r2",
			dataPath: path.join(POC_DIR, "data", "items-r2.json"),
			outputPath: path.join(POC_DIR, "output", "r2-injection.md"),
			cachePath: path.join(POC_DIR, "output", ".cache-hashes.json"),
			label: "round-2",
		};
	}
	throw new Error(`unknown profile suffix '${suffix}' (expected 'r1' or 'r2' or omit)`);
}

// ─── Core ops ───

function loadItems(p: string): Item[] {
	const raw = fs.readFileSync(p, "utf8");
	const parsed = JSON.parse(raw) as ItemsFile;
	// Integrity check: every fixture item's stored content_hash must agree with
	// the recomputed value. Catches a divergent fixture before it surfaces as
	// a misleading "re-rendered" verdict.
	for (const it of parsed.items) {
		const recomputed = computeContentHash(it as unknown as Record<string, unknown>);
		if (recomputed !== it.content_hash) {
			throw new Error(
				`content_hash mismatch on ${it.id}: stored=${it.content_hash} recomputed=${recomputed}`,
			);
		}
	}
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

// ─── Skip-detection verdict per selected item ───

type Verdict = "rendered" | "cached" | "re-rendered";

interface SelectedRecord {
	item: Item;
	signal: RankSignal;
	verdict: Verdict;
	cachedHash: string | null;
}

function classify(item: Item, cache: Record<string, string>): { verdict: Verdict; cachedHash: string | null } {
	const cached = cache[item.id];
	if (cached === undefined) return { verdict: "rendered", cachedHash: null };
	if (cached === item.content_hash) return { verdict: "cached", cachedHash: cached };
	return { verdict: "re-rendered", cachedHash: cached };
}

// ─── Pipeline orchestration ───

interface PipelineResult {
	rankedAll: RankSignal[];
	selected: SelectedRecord[];
	cascadeBlock: string;
	cascadeFailures: { id: string; error: string }[];
}

function runPipeline(items: Item[], cache: Record<string, string>): PipelineResult {
	// Step 1+2: coverage-rank produces a ranked list across all items with at
	// least one keyword hit.
	const rankableItems: RankableItem[] = items.map((it) => ({
		id: it.id,
		kind: "item",
		title: it.title,
		body: it.body,
	}));
	const rankedAll = coverageRank(rankableItems, QUERY_TEXT);

	// Step 3: take top-k. If fewer than k items hit keywords, take what we have.
	const topK = rankedAll.slice(0, TOP_K);
	const itemById = new Map(items.map((it) => [it.id, it] as const));

	// Step 4: cascade (skip-mode) — render each selected item; failed ones drop
	// per the skip-mode contract from POC F.
	const renderedLines: string[] = [];
	const failures: { id: string; error: string }[] = [];
	const selected: SelectedRecord[] = [];

	for (const signal of topK) {
		const item = itemById.get(signal.id);
		if (!item) {
			throw new Error(`Ranker returned id ${signal.id} not present in fixture`);
		}
		const record: ItemRecord = { id: item.id, title: item.title, body: item.body };
		const result: StepResult = renderItem(record);
		if (result.status !== "ok") {
			failures.push({ id: item.id, error: result.error ?? "(no error)" });
			// Skip-mode: drop the failed item, do not include in selected output.
			continue;
		}
		const { verdict, cachedHash } = classify(item, cache);
		selected.push({ item, signal, verdict, cachedHash });
		renderedLines.push(result.output);
	}

	const budget = applyBudget(renderedLines);
	if (budget.status !== "ok") {
		throw new Error(`budget step failed in POC fixture: ${budget.error}`);
	}
	const wrapped = wrapDelimiters(budget.output);
	if (wrapped.status !== "ok") {
		throw new Error(`wrap step failed in POC fixture: ${wrapped.error}`);
	}

	return {
		rankedAll,
		selected,
		cascadeBlock: wrapped.output,
		cascadeFailures: failures,
	};
}

// ─── Markdown emission ───

// Verdict markers stay one-per-item-line so the plan's `grep -c "cached"` /
// `grep -c "re-rendered"` checks count exactly the per-item annotations and
// nothing else. Header avoids those substrings.
function renderMarkdown(profile: Profile, items: Item[], result: PipelineResult): string {
	const lines: string[] = [];
	lines.push(`# POC I output — ${profile.label}`);
	lines.push("");
	lines.push(`**fixture:** \`${path.relative(POC_DIR, profile.dataPath)}\`  `);
	lines.push(`**total items in fixture:** ${items.length}  `);
	lines.push(`**query:** \`${QUERY_TEXT}\`  `);
	lines.push(`**top-k:** ${TOP_K}  `);
	lines.push(`**ranker keyword-hit candidates:** ${result.rankedAll.length}  `);
	lines.push(`**cascade mode:** skip (POC F default)  `);
	lines.push(`**cascade failures:** ${result.cascadeFailures.length}`);
	lines.push("");
	lines.push("## selected top-k items (rank order)");
	lines.push("");
	// Verdict column intentionally omitted from this table — the per-item
	// annotation block below is the single source of the verdict words
	// ("rendered" / "cached" / "re-rendered"), so plan-mandated grep -c counts
	// match per-item rows exactly. Cache state column uses HIT/MISS/NEW
	// shorthand to convey the same signal without colliding on substrings.
	lines.push("| Rank | ID | Total Score | Hits | Cache | Stored Hash | Cached Hash |");
	lines.push("|------|----|-------------|------|-------|-------------|-------------|");
	for (let i = 0; i < result.selected.length; i++) {
		const s = result.selected[i];
		const cached = s.cachedHash ? `${s.cachedHash.slice(0, 12)}…` : "(none)";
		const cacheLabel = s.verdict === "cached" ? "HIT" : s.verdict === "re-rendered" ? "MISS" : "NEW";
		lines.push(
			`| ${i + 1} | ${s.item.id} | ${s.signal.totalScore} | ${s.signal.keywordHits} | ${cacheLabel} | ${s.item.content_hash.slice(0, 12)}… | ${cached} |`,
		);
	}
	lines.push("");
	lines.push("## per-item annotations (skip-detection verdicts)");
	lines.push("");
	for (const s of result.selected) {
		if (s.verdict === "cached") {
			lines.push(
				`- ${s.item.id}: cached (hash ${s.item.content_hash.slice(0, 12)}… unchanged from prior run)`,
			);
		} else if (s.verdict === "re-rendered") {
			const prev = s.cachedHash ?? "(none)";
			lines.push(
				`- ${s.item.id}: re-rendered (hash ${prev.slice(0, 12)}… → ${s.item.content_hash.slice(0, 12)}…)`,
			);
		} else {
			lines.push(`- ${s.item.id}: rendered (first run, hash ${s.item.content_hash.slice(0, 12)}…)`);
		}
	}
	lines.push("");
	lines.push("## injected context (wrapped block delivered to agent)");
	lines.push("");
	if (result.selected.length === 0) {
		lines.push("(no items selected after cascade)");
	} else {
		lines.push(result.cascadeBlock);
	}
	lines.push("");
	if (result.cascadeFailures.length > 0) {
		lines.push("## cascade failures (skip-mode dropped)");
		lines.push("");
		for (const f of result.cascadeFailures) {
			lines.push(`- ${f.id}: ${f.error}`);
		}
		lines.push("");
	}
	return `${lines.join("\n")}`;
}

function main(): void {
	const profile = resolveProfile();
	console.log(`\n=== POC I profile: ${profile.label} ===`);
	console.log(`fixture: ${path.relative(POC_DIR, profile.dataPath)}`);
	console.log(`query:   "${QUERY_TEXT}"  top-k=${TOP_K}`);

	const items = loadItems(profile.dataPath);
	const cache = loadCache(profile.cachePath);
	console.log(`Loaded ${items.length} items; cache entries: ${Object.keys(cache).length}`);

	const result = runPipeline(items, cache);
	console.log(`Ranker returned ${result.rankedAll.length} candidate(s); selected top-${TOP_K}:`);
	for (const s of result.selected) {
		console.log(`  ${s.item.id}: verdict=${s.verdict} totalScore=${s.signal.totalScore}`);
	}
	if (result.cascadeFailures.length > 0) {
		console.log(`Cascade dropped ${result.cascadeFailures.length} failed item(s).`);
	}

	const md = renderMarkdown(profile, items, result);
	fs.mkdirSync(path.dirname(profile.outputPath), { recursive: true });
	fs.writeFileSync(profile.outputPath, md);
	saveCache(profile.cachePath, items);

	console.log(`\nWrote ${path.relative(POC_DIR, profile.outputPath)}`);
	console.log(`Updated cache at ${path.relative(POC_DIR, profile.cachePath)}`);
}

main();
