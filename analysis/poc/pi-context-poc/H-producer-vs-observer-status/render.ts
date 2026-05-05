// POC H — producer-vs-observer status.
//
// Empirically demonstrates the candidate articulation's claim that producer-asserted
// status (the writing agent's self-report) and observer-derived status (the substrate's
// lifecycle field) are distinct queryable signals. The two are independently authored,
// and a validator surfaces mismatches as a derived signal — a producer that claims PASS
// while the lifecycle still reads `open` is a flag worth showing, not silently coerced
// into agreement.
//
// Scope boundary: this POC validates one rule (status-consistency) over five fixture
// items. It does not enforce the rule at write time, file issues for mismatches, or
// model the curator workflow that resolves a flagged mismatch — those belong upstream
// in the production pi-context surface.
//
// Node builtins + JSON only. No AJV, no third-party deps. Schema is documentary at this
// layer (the production layer adds AJV-at-every-write per F-006).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const POC_DIR = path.dirname(fileURLToPath(import.meta.url));

// ─── types ───

type ObserverStatus = "open" | "enacted" | "superseded";
type ProducerStatus = "PASS" | "FAIL" | "PARTIAL";
type Verdict = "CONSISTENT" | "MISMATCH" | "OBSERVER-ONLY";

interface ItemRecord {
	id: string;
	title: string;
	status: ObserverStatus;
	producer_status?: ProducerStatus;
	note?: string;
}

interface ConsistencyRecord {
	item: ItemRecord;
	verdict: Verdict;
	rationale: string;
}

// ─── consistency rule ───
//
// The rule is intentionally explicit (not derived from a generic mapping table) so the
// asymmetry between producer claims and observer state is auditable line-by-line:
//
//   producer PASS    + observer enacted    → CONSISTENT  (both indicate completion)
//   producer FAIL    + observer superseded → CONSISTENT  (both indicate non-completion)
//   producer FAIL    + observer open       → CONSISTENT  (both indicate non-completion)
//   producer PASS    + observer open       → MISMATCH    (claim done; lifecycle disagrees)
//   producer FAIL    + observer enacted    → MISMATCH    (claim failed; lifecycle disagrees)
//   producer PARTIAL + any observer        → CONSISTENT  (PARTIAL is intentionally permissive)
//   producer absent  + any observer        → OBSERVER-ONLY (no producer claim to validate)
//
// PARTIAL is treated as compatible with any observer state by design: a producer that
// reports partial completion is asserting ambiguity, which the lifecycle field cannot
// contradict. The validator surfaces this as CONSISTENT rather than coercing a verdict.
function classifyConsistency(item: ItemRecord): ConsistencyRecord {
	const ps = item.producer_status;
	const os = item.status;

	if (ps === undefined) {
		return {
			item,
			verdict: "OBSERVER-ONLY",
			rationale: `no producer_status filed; observer status is '${os}'`,
		};
	}

	if (ps === "PARTIAL") {
		return {
			item,
			verdict: "CONSISTENT",
			rationale: `producer reports PARTIAL; permissive against any observer status (here: '${os}')`,
		};
	}

	if (ps === "PASS" && os === "enacted") {
		return {
			item,
			verdict: "CONSISTENT",
			rationale: "producer PASS aligns with observer enacted (both indicate completion)",
		};
	}

	if (ps === "FAIL" && (os === "superseded" || os === "open")) {
		return {
			item,
			verdict: "CONSISTENT",
			rationale: `producer FAIL aligns with observer ${os} (both indicate non-completion)`,
		};
	}

	if (ps === "PASS" && os === "open") {
		return {
			item,
			verdict: "MISMATCH",
			rationale: "producer claims PASS while observer lifecycle is still 'open' — work asserted complete but not yet enacted",
		};
	}

	if (ps === "FAIL" && os === "enacted") {
		return {
			item,
			verdict: "MISMATCH",
			rationale: "producer claims FAIL while observer lifecycle records 'enacted' — work asserted failed but lifecycle disagrees",
		};
	}

	// Defensive default for any combination not enumerated above (e.g. PASS + superseded).
	// Treated as MISMATCH so silent gaps surface rather than pass quietly.
	return {
		item,
		verdict: "MISMATCH",
		rationale: `unenumerated combination producer_status='${ps}' status='${os}' — flagged by default`,
	};
}

// ─── report rendering ───

function renderReport(records: ConsistencyRecord[]): string {
	const lines: string[] = [];
	lines.push("# POC H — Producer-vs-Observer Status Mismatch Report");
	lines.push("");
	lines.push("Each row pairs the observer-derived lifecycle (`status`) against the");
	lines.push("producer-asserted self-report (`producer_status`). The verdict column");
	lines.push("is derived by `classifyConsistency()` in `render.ts`.");
	lines.push("");
	lines.push("| ID | Title | observer status | producer_status | Verdict |");
	lines.push("|----|-------|------------------|-----------------|---------|");
	for (const r of records) {
		const ps = r.item.producer_status ?? "(none)";
		lines.push(`| ${r.item.id} | ${r.item.title} | ${r.item.status} | ${ps} | ${r.verdict} |`);
	}
	lines.push("");
	lines.push("## Per-item rationale");
	lines.push("");
	// Rationale lines deliberately omit the verdict word — the verdict already appears
	// in the table column. Keeping it out of this section preserves the property that
	// each verdict literal appears on exactly one line per item, so per-verdict tallies
	// can be obtained by `grep -c <verdict> output/mismatch-report.md`.
	for (const r of records) {
		lines.push(`- **${r.item.id}** — ${r.rationale}`);
	}
	lines.push("");

	// Summary tallies. Labels use a neutral prefix (`verdict_`) so the literal verdict
	// words remain confined to table rows.
	let consistent = 0;
	let mismatch = 0;
	let observerOnly = 0;
	for (const r of records) {
		if (r.verdict === "CONSISTENT") consistent++;
		else if (r.verdict === "MISMATCH") mismatch++;
		else observerOnly++;
	}
	lines.push("## Summary");
	lines.push("");
	lines.push(`- verdict_consistent: ${consistent}`);
	lines.push(`- verdict_mismatch: ${mismatch}`);
	lines.push(`- verdict_observer_only: ${observerOnly}`);
	lines.push(`- total items: ${records.length}`);
	return lines.join("\n");
}

// ─── entry ───

function main(): void {
	const dataPath = path.join(POC_DIR, "data", "items.json");
	const raw = fs.readFileSync(dataPath, "utf8");
	const parsed = JSON.parse(raw) as { items: ItemRecord[] };
	const items = parsed.items;
	console.log(`Loaded ${items.length} items from ${path.relative(POC_DIR, dataPath)}`);

	const records = items.map(classifyConsistency);

	const outDir = path.join(POC_DIR, "output");
	fs.mkdirSync(outDir, { recursive: true });
	const outPath = path.join(outDir, "mismatch-report.md");
	const md = renderReport(records);
	fs.writeFileSync(outPath, md);
	console.log(`Wrote ${path.relative(POC_DIR, outPath)} (${md.split("\n").length} lines)`);

	for (const r of records) {
		const ps = r.item.producer_status ?? "(none)";
		console.log(`  ${r.item.id}: status='${r.item.status}' producer='${ps}' → ${r.verdict}`);
	}
}

main();
