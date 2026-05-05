// POC C — two-phase token budget allocator for pi-context.
//
// Empirically demonstrates the candidate articulation's "always-keep-summaries"
// trim ordering claim. Items declare summary + body fields with x-prompt-budget
// annotations. The allocator runs in two phases:
//   Phase 1: reserve summary-segment space for ALL selected items (or trim
//            summaries in reverse-priority order if even summaries do not fit).
//   Phase 2: fill body-segment space per priority order until the budget
//            exhausts; bodies that do not fit emit "body trimmed" annotations
//            but their owning items still appear in the output.
//
// Token estimation uses a word-count × 1.3 heuristic. No tiktoken dependency,
// node builtins + JSON only.
//
// Run: npx tsx render.ts <budget>     (budget in tokens, e.g. 500, 1000, 3000)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const POC_DIR = path.dirname(fileURLToPath(import.meta.url));

// ─── types ───

interface Item {
	id: string;
	title: string;
	priority: number;
	summary: string;
	body: string;
}

interface ItemsFile {
	items: Item[];
}

type Disposition =
	| "SUMMARY+BODY"
	| "SUMMARY-only (body trimmed)"
	| "SUMMARY-only (no body)"
	| "DROPPED";

interface Allocation {
	id: string;
	priority: number;
	title: string;
	summaryTokens: number;
	bodyTokens: number;
	disposition: Disposition;
	includedSummary: boolean;
	includedBody: boolean;
}

// ─── token estimator: word-count × 1.3 heuristic ───

function estimateTokens(text: string): number {
	if (!text) return 0;
	const words = text.trim().split(/\s+/).filter((w) => w.length > 0);
	return Math.ceil(words.length * 1.3);
}

// ─── two-phase allocator ───
//
// The allocator deducts a fixed wrapper-overhead reserve from the caller's
// budget before phase 1. Wrapper covers per-item marker line + priority/
// allocation annotation + Summary/Body label prefixes — fixed structural
// content the renderer emits per surviving item plus a small file-level
// header. The constants below are tuned to the renderMarkdown shape; they
// are intentionally a small fraction of typical budgets and are surfaced in
// the file header so the verification path can audit fit empirically.

const WRAPPER_HEADER_TOKENS = 30; // file-level header line (budget summary)
const WRAPPER_PER_ITEM_TOKENS = 14; // marker line + "S:" + "B:" label prefixess

function allocate(items: Item[], budget: number): Allocation[] {
	// Sort selected items by priority ascending (lower number = higher priority)
	const ordered = [...items].sort((a, b) => a.priority - b.priority);

	// Pre-compute per-item token estimates
	const sized = ordered.map((it) => ({
		item: it,
		summaryTokens: estimateTokens(it.summary),
		bodyTokens: estimateTokens(it.body),
	}));

	// Effective content budget = caller budget − file header overhead − per-item
	// wrapper overhead × surviving item count. Because survivor count is what
	// we are deciding, iterate: tentatively assume all survive, deduct, run
	// phase 1, recompute survivor count, repeat at most twice (drops only
	// shrink survivor count, so the deduction strictly grows or holds — fixed
	// point reached quickly).
	const dropped = new Set<string>();
	let summaryTotal = sized.reduce((s, x) => s + x.summaryTokens, 0);
	for (let pass = 0; pass < 3; pass++) {
		const survivorCount = sized.length - dropped.size;
		const wrapperReserve = WRAPPER_HEADER_TOKENS + WRAPPER_PER_ITEM_TOKENS * survivorCount;
		const contentBudget = Math.max(0, budget - wrapperReserve);
		// ── Phase 1: reserve summary-segment space for ALL surviving items ──
		// If the sum of surviving summaries exceeds the content budget, drop
		// items in REVERSE priority order (lowest priority first) until they fit.
		let changed = false;
		for (let i = sized.length - 1; i >= 0 && summaryTotal > contentBudget; i--) {
			if (dropped.has(sized[i].item.id)) continue;
			dropped.add(sized[i].item.id);
			summaryTotal -= sized[i].summaryTokens;
			changed = true;
		}
		if (!changed) break;
	}

	const phase1Survivors = sized.filter((x) => !dropped.has(x.item.id));
	const reservedForSummaries = phase1Survivors.reduce((s, x) => s + x.summaryTokens, 0);
	const finalWrapperReserve =
		WRAPPER_HEADER_TOKENS + WRAPPER_PER_ITEM_TOKENS * phase1Survivors.length;
	let remainingForBodies = Math.max(0, budget - finalWrapperReserve - reservedForSummaries);

	// ── Phase 2: fill body-segment space per priority order ──
	const bodyFitted = new Set<string>();
	for (const x of phase1Survivors) {
		if (x.bodyTokens <= remainingForBodies) {
			bodyFitted.add(x.item.id);
			remainingForBodies -= x.bodyTokens;
		}
		// else: body cannot fit — leave for trimmed annotation. Greedy
		// priority-order fill: do not skip a large body to fit a smaller
		// lower-priority body, because priority is the primary axis.
	}

	// ── Assemble allocation report ──
	const allocations: Allocation[] = sized.map((x) => {
		if (dropped.has(x.item.id)) {
			return {
				id: x.item.id,
				priority: x.item.priority,
				title: x.item.title,
				summaryTokens: x.summaryTokens,
				bodyTokens: x.bodyTokens,
				disposition: "DROPPED",
				includedSummary: false,
				includedBody: false,
			};
		}
		if (bodyFitted.has(x.item.id)) {
			return {
				id: x.item.id,
				priority: x.item.priority,
				title: x.item.title,
				summaryTokens: x.summaryTokens,
				bodyTokens: x.bodyTokens,
				disposition: "SUMMARY+BODY",
				includedSummary: true,
				includedBody: true,
			};
		}
		// Summary survived phase 1 but body did not fit phase 2.
		// Distinguish "body trimmed" (body content existed but didn't fit)
		// from "body absent" (item has no body). All POC items have bodies,
		// so this branch reports "SUMMARY-only (body trimmed)".
		return {
			id: x.item.id,
			priority: x.item.priority,
			title: x.item.title,
			summaryTokens: x.summaryTokens,
			bodyTokens: x.bodyTokens,
			disposition: x.bodyTokens > 0 ? "SUMMARY-only (body trimmed)" : "SUMMARY-only (no body)",
			includedSummary: true,
			includedBody: false,
		};
	});

	return allocations;
}

// ─── markdown emission ───

function renderMarkdown(allocations: Allocation[], items: Item[], budget: number): string {
	const byId = new Map(items.map((i) => [i.id, i]));
	const lines: string[] = [];

	const totalSummaryTokens = allocations
		.filter((a) => a.includedSummary)
		.reduce((s, a) => s + a.summaryTokens, 0);
	const totalBodyTokens = allocations
		.filter((a) => a.includedBody)
		.reduce((s, a) => s + a.bodyTokens, 0);
	const totalUsed = totalSummaryTokens + totalBodyTokens;

	const summaryKeptCount = allocations.filter((a) => a.includedSummary).length;
	const bodyKeptCount = allocations.filter((a) => a.includedBody).length;
	const bodyTrimmedCount = allocations.filter(
		(a) => a.disposition === "SUMMARY-only (body trimmed)",
	).length;
	const droppedCount = allocations.filter((a) => a.disposition === "DROPPED").length;

	// Compact emission — wrapper kept small so the file's heuristic-token-count
	// stays within the caller's budget. Per-item marker lines are the canonical,
	// exclusive carriers of the substrings "summary kept", "body kept",
	// "body trimmed", "item dropped" so `grep -c` returns one count per item.
	lines.push(
		`Budget cap ${budget}; used ${totalUsed} (${totalSummaryTokens} summary + ${totalBodyTokens} body); retained ${summaryKeptCount}, body-full ${bodyKeptCount}, body-trimmed ${bodyTrimmedCount}, dropped ${droppedCount}.`,
	);
	for (const a of allocations) {
		const item = byId.get(a.id);
		if (!item) continue;
		if (a.disposition === "DROPPED") {
			lines.push(`- ${a.id}: item dropped`);
			continue;
		}
		// Single marker line per item — pattern-stable for verification grep.
		let marker: string;
		if (a.includedBody) marker = `summary kept, body kept`;
		else if (a.disposition === "SUMMARY-only (body trimmed)") marker = `summary kept, body trimmed`;
		else marker = `summary kept`;
		lines.push(`- ${a.id} (p${a.priority}): ${marker}`);
		if (a.includedSummary) lines.push(`S: ${item.summary}`);
		if (a.includedBody) lines.push(`B: ${item.body}`);
	}
	return `${lines.join("\n")}\n`;
}

// ─── argv-driven budget switch ───

function resolveBudget(): { budget: number; outputFilename: string } {
	const arg = process.argv[2];
	if (!arg) {
		throw new Error("Usage: npx tsx render.ts <budget-tokens>  (e.g. 500, 1000, 3000)");
	}
	const budget = Number.parseInt(arg, 10);
	if (!Number.isFinite(budget) || budget <= 0) {
		throw new Error(`Invalid budget: ${arg}`);
	}
	const filename =
		budget === 500 ? "budget-500.md" : budget === 1000 ? "budget-1k.md" : budget === 3000 ? "budget-3k.md" : `budget-${budget}.md`;
	return { budget, outputFilename: filename };
}

function main(): void {
	const { budget, outputFilename } = resolveBudget();
	console.log(`\n=== POC C profile: budget ${budget} tokens ===`);

	const itemsPath = path.join(POC_DIR, "data", "items.json");
	const raw = fs.readFileSync(itemsPath, "utf8");
	const parsed = JSON.parse(raw) as ItemsFile;
	console.log(`Loaded ${parsed.items.length} items from ${path.relative(POC_DIR, itemsPath)}`);

	const allocations = allocate(parsed.items, budget);
	const md = renderMarkdown(allocations, parsed.items, budget);

	const outDir = path.join(POC_DIR, "output");
	fs.mkdirSync(outDir, { recursive: true });
	const outPath = path.join(outDir, outputFilename);
	fs.writeFileSync(outPath, md);

	const summaryKept = allocations.filter((a) => a.includedSummary).length;
	const bodyKept = allocations.filter((a) => a.includedBody).length;
	const dropped = allocations.filter((a) => a.disposition === "DROPPED").length;
	console.log(
		`Allocation result: summary kept ${summaryKept}, body kept ${bodyKept}, item dropped ${dropped}`,
	);
	console.log(`Wrote ${path.relative(POC_DIR, outPath)}`);
}

main();
