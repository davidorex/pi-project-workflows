// POC D — coverage-rank ranker over typed substrate.
//
// Lifted shape from gsd-build/context-packet's retrieval pattern as documented in
// analysis/2026-05-06-context-packet-comparison.md (§3 Pattern enumeration). The
// ranker decomposes a query into keyword tokens, scores each candidate item by
// (a) keyword-hit count across title + body, (b) title-position weighting (early
// matches outweigh late matches), and (c) per-keyword frequency, then performs
// set-covering selection rather than naive top-k similarity: items contributing
// new query-token coverage rank above items that merely repeat already-covered
// tokens.
//
// Node builtins only — no third-party dependencies.

export interface RankableItem {
	id: string;
	kind: string;
	title: string;
	body: string;
}

export interface RankSignal {
	id: string;
	kind: string;
	title: string;
	keywordHits: number;
	uniqueKeywordsCovered: string[];
	positionScore: number;
	frequencyScore: number;
	totalScore: number;
	newCoverage: string[];
}

const STOPWORDS = new Set([
	"the",
	"a",
	"an",
	"of",
	"for",
	"and",
	"or",
	"to",
	"in",
	"on",
	"at",
	"by",
	"with",
	"is",
	"are",
	"be",
]);

function tokenize(text: string): string[] {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, " ")
		.split(/\s+/)
		.filter((t) => t.length > 0 && !STOPWORDS.has(t));
}

function queryKeywords(query: string): string[] {
	return Array.from(new Set(tokenize(query)));
}

// Score a single item against the keyword set. Position weighting: matches in
// the title (treated as position 0) score 3x; matches early in body (first 20
// tokens) score 2x; later matches score 1x. Frequency: cumulative hit count
// per keyword (capped at 5 to avoid dominance by a single repeated word).
function scoreItem(item: RankableItem, keywords: string[]): RankSignal {
	const titleTokens = tokenize(item.title);
	const bodyTokens = tokenize(item.body);
	const titleSet = new Set(titleTokens);
	const earlyBodySet = new Set(bodyTokens.slice(0, 20));

	let keywordHits = 0;
	let positionScore = 0;
	let frequencyScore = 0;
	const covered: string[] = [];

	for (const kw of keywords) {
		const titleCount = titleTokens.filter((t) => t === kw).length;
		const bodyCount = bodyTokens.filter((t) => t === kw).length;
		const totalCount = titleCount + bodyCount;
		if (totalCount === 0) continue;

		keywordHits += totalCount;
		covered.push(kw);

		if (titleSet.has(kw)) positionScore += 3;
		else if (earlyBodySet.has(kw)) positionScore += 2;
		else positionScore += 1;

		frequencyScore += Math.min(totalCount, 5);
	}

	return {
		id: item.id,
		kind: item.kind,
		title: item.title,
		keywordHits,
		uniqueKeywordsCovered: covered,
		positionScore,
		frequencyScore,
		totalScore: positionScore * 2 + frequencyScore + covered.length * 4,
		newCoverage: [],
	};
}

// Set-covering selection: order candidates by totalScore descending, then
// iteratively select the next item that contributes the most NEW query
// keywords (ties broken by totalScore). Items contributing zero new keywords
// when prior selections already cover the query are demoted below items that
// cover even one new keyword. Returns ranked list (ALL items scored, sorted
// by selection order; caller can take top-k).
export function coverageRank(items: RankableItem[], query: string): RankSignal[] {
	const keywords = queryKeywords(query);
	if (keywords.length === 0) return [];

	const scored = items
		.map((item) => scoreItem(item, keywords))
		.filter((s) => s.keywordHits > 0)
		.sort((a, b) => b.totalScore - a.totalScore);

	const selected: RankSignal[] = [];
	const remaining = [...scored];
	const coveredSoFar = new Set<string>();

	while (remaining.length > 0) {
		let bestIdx = 0;
		let bestNewCount = -1;
		let bestScore = -1;
		for (let i = 0; i < remaining.length; i++) {
			const cand = remaining[i];
			const newCovered = cand.uniqueKeywordsCovered.filter((k) => !coveredSoFar.has(k));
			if (
				newCovered.length > bestNewCount ||
				(newCovered.length === bestNewCount && cand.totalScore > bestScore)
			) {
				bestIdx = i;
				bestNewCount = newCovered.length;
				bestScore = cand.totalScore;
			}
		}
		const picked = remaining.splice(bestIdx, 1)[0];
		const newKw = picked.uniqueKeywordsCovered.filter((k) => !coveredSoFar.has(k));
		picked.newCoverage = newKw;
		for (const k of newKw) coveredSoFar.add(k);
		selected.push(picked);
	}

	return selected;
}
