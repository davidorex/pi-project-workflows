#!/usr/bin/env -S npx tsx
/**
 * scan-substrate-hedges — read-only heuristic pre-identifier of substrate
 * items whose prose fields carry hedge / fork / deferral language, producing
 * a ranked machine-readable candidate list for the full agent-treatment
 * provenance audit (the process templated at
 * analysis/2026-07-11-gap-fork-provenance-audit-brief-template.md).
 *
 * TASK-120. This script pre-identifies; it corrects nothing and writes
 * nothing into the substrate. It is a triage pass over potentially hundreds
 * of items so audit candidates are found systematically instead of by an
 * orchestrator happening to read the right gap — the manual FGAP-124/125/
 * 126/127 fork-provenance audits (2026-07-10/11) are the process this feeds.
 *
 * Discovery is registry-driven, never hardcoded:
 *   - Block kinds come from the active substrate's config (`loadConfig(cwd)`
 *     -> `block_kinds[]`), the same registry the CLI ops read. No block-name
 *     list lives in this file.
 *   - Prose fields come from each block's own schema: a string-typed property
 *     is treated as prose iff it declares no `enum`, no `pattern`, no
 *     `format`, and no `const` (ids, statuses, dates, and hash fields all
 *     declare one of those; free-text fields — many carrying the
 *     `x-prompt-budget` annotation — declare none). The walk recurses through
 *     arrays-of-strings (e.g. acceptance criteria) and arrays-of-objects
 *     (e.g. evidence[].reference). No field-name list lives in this file.
 *   - All substrate access flows through the canonical pi-context surface
 *     (loadConfig / readSchema / readBlock), never raw fs reads of
 *     .context/*.json, so substrate-dir resolution stays honored.
 *
 * The heuristic categories and their weights are grounded in the real hedges
 * the manual audits confirmed (not abstract guesses):
 *   - fork: enumerated-alternative language. Confirmed real instances:
 *     FGAP-125 proposed_resolution "... — or amend the schema to stop
 *     declaring semantics ..." (dash-or); pre-correction FGAP-126 "...(the
 *     interactive orchestrator authors; ...) or give the pi-only gated tools
 *     an explicit pre-authorization channel ..." (paren-or) and "gating the
 *     composite (run-work-order-loop) or routing its commit through the
 *     gated tool path" (or + gerund); the source report's lettered
 *     "(a) ... (b) ... (c)" option list.
 *   - deferral: explicit decision-postponement. Confirmed real instance:
 *     pre-correction FGAP-126's "..., as a decision" (the exact phrase the
 *     2026-07-10 provenance audit found to be filing-time augmentation);
 *     plus the standard TBD / open-question / user's-call vocabulary.
 *   - modal-hedge: low-weight uncertainty vocabulary (might/could/unclear/
 *     unknown/...). Individually weak signals, so they carry weight 1-2 and
 *     only surface an item when they accumulate or co-occur.
 *
 * Weights rank, they do not judge: a flagged fork may be GROUNDED (FGAP-124's
 * and FGAP-127's forks were audited and left standing) — grounded-vs-invented
 * is exactly what the downstream per-item agent audit determines. Recall is
 * deliberately favored over precision; the ranked score + per-match snippets
 * let the consumer work top-down.
 *
 * Not a gate: informational tooling only, never wired into `npm run check`,
 * husky, or CI. Exit code is non-zero only on genuine I/O / substrate-read
 * failure, never for "candidates found".
 *
 * Usage:
 *   npx tsx scripts/scan-substrate-hedges.ts [--cwd <path>] [--output <path>]
 *       [--min-score <n>] [--stdout]
 *
 * Default output: tmp/substrate-hedge-scans/scan-<timestamp>.json under the
 * scanned cwd (tmp/ is this repo's gitignored scratch dir). --stdout prints
 * the full JSON report to stdout instead of writing a file.
 */
import fs from "node:fs";
import path from "node:path";
import { readBlock } from "@davidorex/pi-context/block-api";
import { loadConfig } from "@davidorex/pi-context/context-sdk";
import { readSchema } from "@davidorex/pi-context/schema-write";

// ── Heuristic pattern registry ───────────────────────────────────────────────

export type HedgeCategory = "fork" | "deferral" | "modal-hedge";

export interface HedgePattern {
	/** Stable identifier recorded on every match (report consumers key on it). */
	id: string;
	category: HedgeCategory;
	/**
	 * Ranking weight, 1 (weak, accumulates) to 4 (near-certain audit trigger).
	 * Weights order the candidate list; they are not a verdict on any item.
	 */
	weight: number;
	/** Matched via a fresh global-flagged copy per scan (source+flags reused). */
	regex: RegExp;
}

/**
 * The full pattern set. Category + example grounding per pattern is in the
 * module doc comment above; inline notes below cover only the non-obvious
 * exclusions.
 */
export const HEDGE_PATTERNS: readonly HedgePattern[] = [
	// ── fork: enumerated-alternative language ──
	{ id: "and-or", category: "fork", weight: 3, regex: /\band\/or\b/i },
	// Bounded gap (no sentence-enders between) so "either" and "or" must share a clause.
	{ id: "either-or", category: "fork", weight: 3, regex: /\beither\b[^.;:\n]{0,160}?\bor\b/i },
	// FGAP-125's confirmed live fork shape: "... the loop can check) — or amend the schema ..."
	{ id: "dash-or", category: "fork", weight: 3, regex: /[—–]\s*or\b|\s-\s+or\b/i },
	{ id: "semicolon-or", category: "fork", weight: 3, regex: /;\s*or\b/i },
	// Pre-correction FGAP-126's confirmed shape: "...(...) or give the pi-only gated tools ..."
	{ id: "paren-or", category: "fork", weight: 2, regex: /\)\s+or\b/ },
	// "gating the composite ... or routing its commit ..." — an or joining gerund
	// alternatives is an action fork. Excludes or-nothing/-something/... noise.
	{
		id: "or-gerund",
		category: "fork",
		weight: 2,
		regex: /\bor\s+(?!nothing\b|something\b|anything\b|everything\b)[a-z]+ing\b/i,
	},
	// Lettered option lists "(a) ... (b)". Numbered "(1) ... (2)" is deliberately
	// NOT matched: in this substrate's live prose it enumerates facts/facets
	// (e.g. FGAP-126's description), not alternatives.
	{ id: "lettered-options", category: "fork", weight: 3, regex: /\(a\)[\s\S]{1,400}?\(b\)/i },
	{
		id: "option-enum",
		category: "fork",
		weight: 2,
		regex:
			/\b(?:two|three|both)\s+(?:options|alternatives|approaches)\b|\boptions?\s+(?:are|include)\b|\boption\s+(?:[AB]|[12])\b/i,
	},
	{ id: "alternatively", category: "fork", weight: 3, regex: /\balternatively\b/i },

	// ── deferral: explicit decision-postponement ──
	// The exact phrase the FGAP-126 provenance audit confirmed as filing-time
	// augmentation ("... equivalent to the CLI --yes, as a decision").
	{ id: "as-a-decision", category: "deferral", weight: 4, regex: /\bas a decision\b/i },
	// Case-sensitive: lowercase "tbd" inside identifiers must not fire.
	{ id: "tbd", category: "deferral", weight: 4, regex: /\bTBD\b/ },
	{
		id: "to-be-decided",
		category: "deferral",
		weight: 4,
		regex: /\bto be (?:determined|decided|designed|specified)\b/i,
	},
	{
		id: "not-yet-decided",
		category: "deferral",
		weight: 4,
		regex: /\bnot yet (?:decided|determined|designed|specified|chosen|settled)\b/i,
	},
	{ id: "open-question", category: "deferral", weight: 4, regex: /\bopen question\b/i },
	// "user's call" / "user scope call" — the deferral register the manual
	// audits were dispatched to de-hedge.
	{ id: "users-call", category: "deferral", weight: 4, regex: /\buser(?:'s|s)?\s+(?:scope\s+)?call\b/i },
	{ id: "up-to-the-user", category: "deferral", weight: 4, regex: /\bup to the user\b/i },
	{ id: "undecided", category: "deferral", weight: 3, regex: /\bun(?:decided|determined)\b/i },
	{ id: "deferred", category: "deferral", weight: 2, regex: /\bdefer(?:red|ral|rals|s)?\b/i },
	{ id: "left-open", category: "deferral", weight: 3, regex: /\b(?:left|leaves?|remains?|stays?)\s+open\b/i },
	{ id: "pending-decision", category: "deferral", weight: 4, regex: /\bpending\s+(?:a\s+)?(?:decision|choice)\b/i },
	{ id: "needs-decision", category: "deferral", weight: 4, regex: /\bneeds?\s+(?:a\s+)?decision\b/i },
	{ id: "decide-later", category: "deferral", weight: 4, regex: /\bdecid\w*\s+later\b/i },
	{ id: "punt", category: "deferral", weight: 3, regex: /\bpunt(?:ed|ing|s)?\b/i },
	{ id: "not-yet", category: "deferral", weight: 1, regex: /\bnot yet\b/i },

	// ── modal-hedge: uncertainty vocabulary (weak individually, ranked by accumulation) ──
	{ id: "might", category: "modal-hedge", weight: 2, regex: /\bmight\b/i },
	{ id: "could", category: "modal-hedge", weight: 1, regex: /\bcould\b/i },
	{ id: "may-need", category: "modal-hedge", weight: 2, regex: /\bmay\s+(?:need|want|require|warrant)\b/i },
	{ id: "possibly", category: "modal-hedge", weight: 2, regex: /\bpossibly\b|\bperhaps\b/i },
	{ id: "probably", category: "modal-hedge", weight: 2, regex: /\bprobably\b|\bpresumably\b/i },
	{ id: "eventually", category: "modal-hedge", weight: 2, regex: /\beventually\b/i },
	{ id: "at-some-point", category: "modal-hedge", weight: 2, regex: /\bat some point\b|\bsomeday\b/i },
	{ id: "unclear", category: "modal-hedge", weight: 2, regex: /\bunclear\b|\buncertain\b|\bnot clear\b/i },
	// "unknown" ties directly to the substrate goal this feeds: surfacing any
	// TRULY unknown (not derivable from the claude-history record).
	{ id: "unknown", category: "modal-hedge", weight: 2, regex: /\bunknown\b/i },
	{ id: "later", category: "modal-hedge", weight: 1, regex: /\blater\b/i },
	{ id: "seems", category: "modal-hedge", weight: 1, regex: /\bseems?\b|\bappears?\s+to\b/i },
	{ id: "if-needed", category: "modal-hedge", weight: 1, regex: /\bif\s+(?:needed|necessary|desired)\b/i },
];

// ── Report shapes ────────────────────────────────────────────────────────────

export interface HedgeMatch {
	patternId: string;
	category: HedgeCategory;
	weight: number;
	/** The exact matched text. */
	matched: string;
	/** Bounded context excerpt around the match. */
	snippet: string;
	/** Character offset of the match within its field's text. */
	index: number;
}

export interface FieldFinding {
	/** Dot/bracket path of the field within the item, e.g. "evidence[1].reference". */
	fieldPath: string;
	/** Whether the field's schema declaration carries an x-prompt-budget annotation. */
	promptBudget: boolean;
	matches: HedgeMatch[];
}

export interface CandidateItem {
	block: string;
	arrayKey: string;
	/** item.id when present, else item.oid, else "<block>[<index>]". */
	id: string;
	title?: string;
	status?: string;
	/** Sum of all match weights across all fields — the ranking key. */
	score: number;
	/** Highest single-match weight (a quick strongest-signal indicator). */
	maxWeight: number;
	categories: HedgeCategory[];
	fields: FieldFinding[];
}

export interface BlockScanSummary {
	block: string;
	arrayKey: string;
	schemaName: string;
	itemsScanned: number;
	itemsFlagged: number;
	/** Present when the block could not be scanned; names the reason. */
	skipped?: string;
}

export interface HedgeScanReport {
	tool: "scan-substrate-hedges";
	generated_at: string;
	cwd: string;
	minScore: number;
	blocks: BlockScanSummary[];
	summary: {
		blocksScanned: number;
		blocksSkipped: number;
		itemsScanned: number;
		itemsFlagged: number;
		/** Items with matches whose score fell below minScore (present but not listed). */
		itemsBelowThreshold: number;
		totalMatches: number;
		byCategory: Record<HedgeCategory, number>;
		byBlock: Record<string, number>;
	};
	/** Sorted by score descending, then block, then id. */
	candidates: CandidateItem[];
}

// ── Text scanning ────────────────────────────────────────────────────────────

/** Max snippet length before truncating to an excerpt around the match. */
const MAX_SNIPPET_LEN = 240;

function excerpt(raw: string, matchIndex: number, matchLen: number): string {
	if (raw.length <= MAX_SNIPPET_LEN) return raw;
	const half = Math.floor((MAX_SNIPPET_LEN - matchLen) / 2);
	const start = Math.max(0, matchIndex - Math.max(half, 0));
	const end = Math.min(raw.length, matchIndex + matchLen + Math.max(half, 0));
	const prefix = start > 0 ? "…" : "";
	const suffix = end < raw.length ? "…" : "";
	return prefix + raw.slice(start, end) + suffix;
}

/** Run every hedge pattern over one field's text; matches sorted by offset. */
export function scanText(text: string): HedgeMatch[] {
	const out: HedgeMatch[] = [];
	for (const p of HEDGE_PATTERNS) {
		const flags = p.regex.flags.includes("g") ? p.regex.flags : `${p.regex.flags}g`;
		const re = new RegExp(p.regex.source, flags);
		let m = re.exec(text);
		while (m !== null) {
			out.push({
				patternId: p.id,
				category: p.category,
				weight: p.weight,
				matched: m[0],
				snippet: excerpt(text, m.index, m[0].length),
				index: m.index,
			});
			if (re.lastIndex === m.index) re.lastIndex++; // zero-length safety
			m = re.exec(text);
		}
	}
	return out.sort((a, b) => a.index - b.index || a.patternId.localeCompare(b.patternId));
}

// ── Schema-driven prose extraction ───────────────────────────────────────────

type SchemaNode = Record<string, unknown>;

/**
 * A string-typed schema property is prose iff it declares no constraint that
 * marks it machine-shaped: no enum (status vocabularies), no pattern (ids,
 * content hashes), no format (dates), no const. Free-text fields in this
 * substrate's schemas declare none of these (many additionally carry
 * x-prompt-budget, which is recorded on findings but not required — a prose
 * field without the annotation is still scanned).
 */
export function isProseStringNode(node: SchemaNode): boolean {
	const type = node.type;
	const isString = type === "string" || (Array.isArray(type) && type.includes("string"));
	if (!isString) return false;
	if (node.enum !== undefined) return false;
	if (node.pattern !== undefined) return false;
	if (node.format !== undefined) return false;
	if (node.const !== undefined) return false;
	return true;
}

export interface ProseValue {
	fieldPath: string;
	text: string;
	promptBudget: boolean;
}

/**
 * Walk an item value in lockstep with its schema node, collecting every prose
 * string the schema declares. Only schema-declared properties are visited
 * (undeclared / additionalProperties content is not scanned — the schema is
 * the field registry). Recurses through nested objects, arrays of strings,
 * and arrays of objects.
 */
export function collectProseValues(
	schemaNode: SchemaNode | undefined,
	value: unknown,
	fieldPath: string,
): ProseValue[] {
	const out: ProseValue[] = [];
	if (schemaNode === undefined || value === null || value === undefined) return out;

	if (isProseStringNode(schemaNode)) {
		if (typeof value === "string") {
			out.push({ fieldPath, text: value, promptBudget: schemaNode["x-prompt-budget"] !== undefined });
		}
		return out;
	}

	const type = schemaNode.type;
	if (type === "array" && Array.isArray(value)) {
		const items = schemaNode.items as SchemaNode | undefined;
		value.forEach((el, i) => {
			out.push(...collectProseValues(items, el, `${fieldPath}[${i}]`));
		});
		return out;
	}

	const props = schemaNode.properties as Record<string, SchemaNode> | undefined;
	if (props && typeof value === "object" && !Array.isArray(value)) {
		for (const [name, sub] of Object.entries(props)) {
			const v = (value as Record<string, unknown>)[name];
			if (v === undefined) continue;
			out.push(...collectProseValues(sub, v, fieldPath === "" ? name : `${fieldPath}.${name}`));
		}
	}
	return out;
}

// ── Item + block scanning ────────────────────────────────────────────────────

function stringField(item: Record<string, unknown>, key: string): string | undefined {
	const v = item[key];
	return typeof v === "string" ? v : undefined;
}

/**
 * Scan one block's items against its item schema. Returns every item with at
 * least one match (unthresholded — the caller applies minScore), ranked later
 * by the aggregate.
 */
export function scanBlockItems(
	block: string,
	arrayKey: string,
	itemSchema: SchemaNode,
	items: Record<string, unknown>[],
): CandidateItem[] {
	const flagged: CandidateItem[] = [];
	items.forEach((item, index) => {
		const proseValues = collectProseValues(itemSchema, item, "");
		const fields: FieldFinding[] = [];
		for (const pv of proseValues) {
			const matches = scanText(pv.text);
			if (matches.length > 0) fields.push({ fieldPath: pv.fieldPath, promptBudget: pv.promptBudget, matches });
		}
		if (fields.length === 0) return;
		const allMatches = fields.flatMap((f) => f.matches);
		const score = allMatches.reduce((s, m) => s + m.weight, 0);
		const maxWeight = allMatches.reduce((s, m) => Math.max(s, m.weight), 0);
		const categories = [...new Set(allMatches.map((m) => m.category))].sort();
		flagged.push({
			block,
			arrayKey,
			id: stringField(item, "id") ?? stringField(item, "oid") ?? `${block}[${index}]`,
			title: stringField(item, "title"),
			status: stringField(item, "status"),
			score,
			maxWeight,
			categories,
			fields,
		});
	});
	return flagged;
}

// ── Substrate scanning (registry-driven) ─────────────────────────────────────

export interface ScanOptions {
	minScore?: number;
}

const DEFAULT_MIN_SCORE = 2;

/**
 * Scan the active substrate of `cwd`: every block kind the config registry
 * declares, every item of each block's array_key, every schema-declared prose
 * field. Read-only throughout.
 */
export function scanSubstrate(cwd: string, options: ScanOptions = {}): HedgeScanReport {
	const minScore = options.minScore ?? DEFAULT_MIN_SCORE;
	const config = loadConfig(cwd);
	if (!config) throw new Error(`scan-substrate-hedges: no substrate config resolvable from ${cwd}`);

	const blocks: BlockScanSummary[] = [];
	const allCandidates: CandidateItem[] = [];
	let itemsScanned = 0;

	for (const kind of config.block_kinds) {
		const blockName = path.basename(kind.data_path, ".json");
		const schemaName = path.basename(kind.schema_path, ".schema.json");
		const summary: BlockScanSummary = {
			block: blockName,
			arrayKey: kind.array_key,
			schemaName,
			itemsScanned: 0,
			itemsFlagged: 0,
		};
		blocks.push(summary);

		let schema: SchemaNode | null = null;
		try {
			schema = readSchema(cwd, schemaName) as SchemaNode | null;
		} catch (err) {
			summary.skipped = `schema unreadable: ${err instanceof Error ? err.message : String(err)}`;
			continue;
		}
		const itemSchema = (
			(schema?.properties as Record<string, SchemaNode> | undefined)?.[kind.array_key] as SchemaNode | undefined
		)?.items as SchemaNode | undefined;
		if (!itemSchema) {
			summary.skipped = schema === null ? "schema file absent" : `schema declares no ${kind.array_key}[].items`;
			continue;
		}

		let data: unknown;
		try {
			data = readBlock(cwd, blockName);
		} catch (err) {
			summary.skipped = `block unreadable: ${err instanceof Error ? err.message : String(err)}`;
			continue;
		}
		const arr = (data as Record<string, unknown> | null)?.[kind.array_key];
		const items = Array.isArray(arr) ? (arr as Record<string, unknown>[]) : [];

		const flagged = scanBlockItems(blockName, kind.array_key, itemSchema, items);
		summary.itemsScanned = items.length;
		summary.itemsFlagged = flagged.filter((c) => c.score >= minScore).length;
		itemsScanned += items.length;
		allCandidates.push(...flagged);
	}

	const aboveThreshold = allCandidates
		.filter((c) => c.score >= minScore)
		.sort((a, b) => b.score - a.score || a.block.localeCompare(b.block) || a.id.localeCompare(b.id));
	const belowThreshold = allCandidates.length - aboveThreshold.length;

	const byCategory: Record<HedgeCategory, number> = { fork: 0, deferral: 0, "modal-hedge": 0 };
	const byBlock: Record<string, number> = {};
	let totalMatches = 0;
	for (const c of aboveThreshold) {
		byBlock[c.block] = (byBlock[c.block] ?? 0) + 1;
		for (const f of c.fields) {
			for (const m of f.matches) {
				byCategory[m.category]++;
				totalMatches++;
			}
		}
	}

	return {
		tool: "scan-substrate-hedges",
		generated_at: new Date().toISOString(),
		cwd,
		minScore,
		blocks,
		summary: {
			blocksScanned: blocks.filter((b) => b.skipped === undefined).length,
			blocksSkipped: blocks.filter((b) => b.skipped !== undefined).length,
			itemsScanned,
			itemsFlagged: aboveThreshold.length,
			itemsBelowThreshold: belowThreshold,
			totalMatches,
			byCategory,
			byBlock,
		},
		candidates: aboveThreshold,
	};
}

// ── CLI ──────────────────────────────────────────────────────────────────────

interface Args {
	cwd: string;
	output: string | null;
	minScore: number;
	stdout: boolean;
}

function parseArgs(argv: string[]): Args {
	const out: Partial<Args> = { stdout: false, output: null };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--cwd" && argv[i + 1]) {
			out.cwd = argv[i + 1];
			i++;
		} else if (a === "--output" && argv[i + 1]) {
			out.output = argv[i + 1];
			i++;
		} else if (a === "--min-score" && argv[i + 1]) {
			out.minScore = Number(argv[i + 1]);
			i++;
		} else if (a === "--stdout") {
			out.stdout = true;
		} else if (a === "--help" || a === "-h") {
			console.log(
				"Usage: npx tsx scripts/scan-substrate-hedges.ts [--cwd <path>] [--output <path>] [--min-score <n>] [--stdout]",
			);
			process.exit(0);
		}
	}
	const cwd = out.cwd ?? process.cwd();
	const minScore = out.minScore !== undefined && Number.isFinite(out.minScore) ? out.minScore : DEFAULT_MIN_SCORE;
	return { cwd, output: out.output ?? null, minScore, stdout: out.stdout ?? false };
}

function defaultOutputPath(cwd: string, generatedAt: string): string {
	const stamp = generatedAt.replace(/[:.]/g, "-");
	return path.join(cwd, "tmp", "substrate-hedge-scans", `scan-${stamp}.json`);
}

function main(): void {
	const args = parseArgs(process.argv.slice(2));
	const report = scanSubstrate(args.cwd, { minScore: args.minScore });

	if (args.stdout) {
		console.log(JSON.stringify(report, null, 2));
		return;
	}

	const outPath = args.output ?? defaultOutputPath(args.cwd, report.generated_at);
	fs.mkdirSync(path.dirname(outPath), { recursive: true });
	fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf-8");

	const s = report.summary;
	console.log(`report: ${outPath}`);
	console.log(
		`scanned ${s.itemsScanned} items across ${s.blocksScanned} blocks (${s.blocksSkipped} skipped); flagged ${s.itemsFlagged} candidates at min-score ${report.minScore} (${s.itemsBelowThreshold} below threshold); matches by category: fork=${s.byCategory.fork} deferral=${s.byCategory.deferral} modal-hedge=${s.byCategory["modal-hedge"]}`,
	);
	for (const c of report.candidates.slice(0, 15)) {
		console.log(`  ${String(c.score).padStart(4)}  ${c.block}/${c.id}  [${c.categories.join(",")}]`);
	}
	if (report.candidates.length > 15) {
		console.log(`  … ${report.candidates.length - 15} more in the report file`);
	}
}

// Run only as a CLI, not when imported by the test.
if (import.meta.url === `file://${process.argv[1]}`) {
	main();
}
