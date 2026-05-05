// POC F — cascade fail-stop semantics: orchestrator.
//
// Empirically demonstrates three fail-stop modes for cascade-step failure:
//   skip      → drop the failed item, continue, summary notes 'skipped 1 step'
//   fail      → halt the entire injection at the first failure, exit 1
//   annotate  → substitute a placeholder annotation for the failed item, continue
//
// Mode is selected by `process.argv[2]`. Default (no arg) is `skip`.
//
// The cascade itself lives in cascade.ts; this file orchestrates per-item
// rendering, applies the per-mode failure policy, and emits a final markdown
// block plus a cascade-summary line.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	type ItemRecord,
	type StepResult,
	applyBudget,
	loadItems,
	renderItem,
	wrapDelimiters,
} from "./cascade.js";

const POC_DIR = path.dirname(fileURLToPath(import.meta.url));

type Mode = "skip" | "fail" | "annotate";

function resolveMode(): Mode {
	const arg = process.argv[2];
	if (arg === "skip" || arg === "fail" || arg === "annotate") return arg;
	if (!arg) return "skip";
	throw new Error(`Unknown mode '${arg}'. Expected one of: skip, fail, annotate.`);
}

function modeOutputFile(mode: Mode): string {
	return path.join(POC_DIR, "output", `${mode}-mode.md`);
}

interface CascadeOutcome {
	finalMarkdown: string;
	exitCode: number;
}

// ─── Per-mode orchestration ───

function runCascade(mode: Mode, items: ItemRecord[]): CascadeOutcome {
	const renderedLines: string[] = [];
	const failures: { item: ItemRecord; error: string; index: number }[] = [];
	let haltedAt: number | null = null;

	for (let i = 0; i < items.length; i++) {
		const item = items[i];
		const result: StepResult = renderItem(item);
		const stepIndex = i + 1; // 1-based for human-facing reports
		if (result.status === "ok") {
			renderedLines.push(result.output);
			continue;
		}
		failures.push({ item, error: result.error ?? "(no error message)", index: stepIndex });

		if (mode === "skip") {
			// Drop the item, continue.
			continue;
		}
		if (mode === "annotate") {
			renderedLines.push(`- [annotation] item ${item.id} skipped: ${result.error}`);
			continue;
		}
		// mode === "fail" — halt the cascade at this step.
		haltedAt = stepIndex;
		break;
	}

	// Downstream steps only run if we didn't halt.
	let finalBlock = "";
	if (haltedAt === null) {
		const budget = applyBudget(renderedLines);
		if (budget.status !== "ok") {
			throw new Error(`budget step failed unexpectedly in POC fixture: ${budget.error}`);
		}
		const wrapped = wrapDelimiters(budget.output);
		if (wrapped.status !== "ok") {
			throw new Error(`wrap step failed unexpectedly in POC fixture: ${wrapped.error}`);
		}
		finalBlock = wrapped.output;
	}

	// Cascade summary tailored per mode.
	const summaryLines: string[] = [];
	summaryLines.push("");
	summaryLines.push("---");
	summaryLines.push("");
	summaryLines.push("## cascade-summary");
	summaryLines.push("");
	summaryLines.push(`- mode: ${mode}`);
	summaryLines.push(`- total items: ${items.length}`);
	summaryLines.push(`- rendered: ${renderedLines.filter((l) => l.startsWith("- ITEM-")).length}`);
	summaryLines.push(`- failed steps: ${failures.length}`);

	if (mode === "skip") {
		summaryLines.push(`- skipped ${failures.length} step${failures.length === 1 ? "" : "s"}`);
	} else if (mode === "annotate") {
		summaryLines.push(`- annotated ${failures.length} failed step${failures.length === 1 ? "" : "s"}`);
	} else if (mode === "fail") {
		if (haltedAt !== null) {
			summaryLines.push(`- halted at step ${haltedAt}`);
		} else {
			summaryLines.push("- no failures encountered (cascade completed)");
		}
	}

	if (failures.length > 0) {
		summaryLines.push("");
		summaryLines.push("### failed-step diagnostics");
		summaryLines.push("");
		for (const f of failures) {
			summaryLines.push(`- step ${f.index} (${f.item.id}): ${f.error}`);
		}
	}

	// Build the final markdown payload per mode.
	const docLines: string[] = [];
	docLines.push(`# POC F output — mode: ${mode}`);
	docLines.push("");

	if (mode === "fail" && haltedAt !== null) {
		docLines.push("## error report");
		docLines.push("");
		docLines.push(`Cascade halted at step ${haltedAt} due to render failure.`);
		docLines.push("");
		docLines.push("### items rendered before halt");
		docLines.push("");
		if (renderedLines.length === 0) {
			docLines.push("(none)");
		} else {
			docLines.push(...renderedLines);
		}
	} else {
		// Emit the wrapped block as the injected context. Item lines inside the
		// delimiters remain on their own lines starting with `- ITEM-` (or
		// `- [ANNOTATION]` for annotate mode), so verifier counts work without
		// any duplicate listing above the wrapped block.
		docLines.push("## injected context (wrapped block delivered to agent)");
		docLines.push("");
		if (renderedLines.length === 0) {
			docLines.push("(no items rendered)");
		} else {
			docLines.push(finalBlock);
		}
	}

	docLines.push(...summaryLines);

	return {
		finalMarkdown: `${docLines.join("\n")}\n`,
		exitCode: mode === "fail" && haltedAt !== null ? 1 : 0,
	};
}

function main(): void {
	const mode = resolveMode();
	console.log(`\n=== POC F mode: ${mode} ===`);

	const itemsResult = loadItems(path.join(POC_DIR, "data", "items.json"));
	if (itemsResult.status !== "ok") {
		console.error(`load step failed: ${itemsResult.error}`);
		process.exit(2);
	}
	const items = JSON.parse(itemsResult.output) as ItemRecord[];
	console.log(`Loaded ${items.length} items.`);

	const outcome = runCascade(mode, items);

	const outPath = modeOutputFile(mode);
	fs.mkdirSync(path.dirname(outPath), { recursive: true });
	fs.writeFileSync(outPath, outcome.finalMarkdown);
	const rel = path.relative(POC_DIR, outPath);
	console.log(`Wrote ${rel}`);
	console.log(`Exit code: ${outcome.exitCode}`);

	process.exit(outcome.exitCode);
}

main();
