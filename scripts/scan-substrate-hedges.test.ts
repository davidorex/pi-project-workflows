/**
 * Tests for the substrate hedge/fork pre-identification scanner
 * (scripts/scan-substrate-hedges.ts, TASK-120/TASK-121).
 *
 * Structure mirrors scan-comment-citations.test.ts: synthetic-fixture cells
 * exercise the pure functions (scanText / isProseStringNode /
 * collectProseValues / scanBlockItems) against in-memory values — including
 * the REAL hedge prose the manual FGAP-125/126 provenance audits confirmed —
 * plus one structural-invariant run of scanSubstrate over the live repo
 * substrate.
 *
 * Deliberately NOT pinned: any assertion that a specific live item stays
 * hedged. Correcting flagged items is this scanner's whole downstream
 * purpose, so such a pin is designed to break (the exact failure mode
 * TASK-108/109 hit with citation pins). The one live-item check (FGAP-125)
 * is conditional: it asserts flagging ONLY while the item still carries its
 * known fork text, and passes vacuously once that fork is audited away.
 *
 * No score/weight/threshold anywhere (TASK-121): the scanner is a plain
 * candidate list, not a ranking.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { readBlock } from "@davidorex/pi-context/block-api";
import {
	collectProseValues,
	type HedgeMatch,
	isProseStringNode,
	scanBlockItems,
	scanSubstrate,
	scanText,
} from "./scan-substrate-hedges.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");

function patternIds(matches: HedgeMatch[]): Set<string> {
	return new Set(matches.map((m) => m.patternId));
}

describe("scanText — fork category (real substrate prose)", () => {
	it("flags FGAP-125's live dash-or fork verbatim", () => {
		// Quoted from FGAP-125.proposed_resolution as read 2026-07-11 — the
		// known true positive the runtime demo must also surface.
		const text =
			"validate the agent's returned output against wo.output_contract post-return (the subprocess must emit " +
			"structured output the loop can check) — or amend the schema to stop declaring semantics the engine will " +
			"not implement, dual-surface, with per-field regression pins.";
		const ids = patternIds(scanText(text));
		assert.ok(ids.has("dash-or"), `expected dash-or among ${[...ids].join(", ")}`);
	});

	it("flags pre-correction FGAP-126's paren-or + as-a-decision fork verbatim", () => {
		// Quoted from the pre-correction FGAP-126.proposed_resolution (per
		// analysis/2026-07-10-fgap-126-coverage-fork-provenance.md §1).
		const text =
			"apply the FGAP-068 caller-as-reconciler shape (the interactive orchestrator authors; non-interactive " +
			"steps never need the gated ceremony) or give the pi-only gated tools an explicit pre-authorization " +
			"channel equivalent to the CLI --yes, as a decision";
		const ids = patternIds(scanText(text));
		assert.ok(ids.has("paren-or"), `expected paren-or among ${[...ids].join(", ")}`);
		assert.ok(ids.has("as-a-decision"), `expected as-a-decision among ${[...ids].join(", ")}`);
	});

	it("flags the or-joining-gerunds fork shape", () => {
		// Quoted from the same pre-correction FGAP-126 field's second clause.
		const text =
			"close the coverage inconsistency by gating the composite (run-work-order-loop) or routing its commit through the gated tool path.";
		const ids = patternIds(scanText(text));
		assert.ok(ids.has("or-gerund"), `expected or-gerund among ${[...ids].join(", ")}`);
	});

	it("flags lettered option lists and either/or", () => {
		const text =
			"Three options: (a) dispatch as a subprocess, (b) grow executeAgent, (c) re-scope to output-only. Take either the first or the second.";
		const ids = patternIds(scanText(text));
		assert.ok(ids.has("lettered-options"));
		assert.ok(ids.has("either-or"));
	});

	it("does not flag 'or' inside words, or or-nothing/-something noise", () => {
		const matches = scanText(
			"The monitor clamps wo.scope.operations for orchestrators; all or nothing, or something similar.",
		);
		const ids = patternIds(matches);
		assert.ok(!ids.has("or-gerund"), `or-gerund must not fire on or-nothing/-something: ${[...ids].join(", ")}`);
		// "monitor"/"for"/"orchestrators" must never produce a bare-or hit of any kind.
		assert.ok(!ids.has("dash-or"));
		assert.ok(!ids.has("paren-or"));
	});
});

describe("scanText — deferral category", () => {
	it("flags TBD (case-sensitive), open questions, and user's-call deferrals", () => {
		const ids = patternIds(scanText("Exact format TBD; this is an open question and ultimately the user's call."));
		assert.ok(ids.has("tbd"));
		assert.ok(ids.has("open-question"));
		assert.ok(ids.has("users-call"));
	});

	it("does not fire tbd on lowercase identifiers", () => {
		assert.ok(!patternIds(scanText("the tbdParser handles this")).has("tbd"));
	});

	it("flags to-be-determined and user scope call", () => {
		const ids = patternIds(scanText("The retry policy is to be determined — a user scope call."));
		assert.ok(ids.has("to-be-decided"));
		assert.ok(ids.has("users-call"));
	});
});

describe("scanText — modal-hedge category", () => {
	it("flags might/could/may-need/unclear/unknown", () => {
		const ids = patternIds(
			scanText("This might work; we could also defer it; it may need a flag later — unclear, provenance unknown."),
		);
		assert.ok(ids.has("might"));
		assert.ok(ids.has("could"));
		assert.ok(ids.has("may-need"));
		assert.ok(ids.has("unclear"));
		assert.ok(ids.has("unknown"));
		assert.ok(ids.has("later"));
	});

	it("returns zero matches on plainly declarative prose", () => {
		const matches = scanText(
			"The dispatch input is validated against input_contract via the canonical AJV validator before compile. " +
				"The clamp intersects the composed grant with scope.operations. Both are pinned by unit tests.",
		);
		assert.deepEqual(matches, []);
	});

	it("records offset-ordered matches with bounded snippets", () => {
		const long = `${"x".repeat(400)} might ${"y".repeat(400)}`;
		const matches = scanText(long);
		assert.equal(matches.length, 1);
		assert.ok(matches[0].snippet.length <= 260, `snippet too long: ${matches[0].snippet.length}`);
		assert.ok(matches[0].snippet.includes("might"));
		assert.equal(matches[0].matched, "might");
	});
});

describe("isProseStringNode — schema-driven field classification", () => {
	it("accepts a plain string and a string with x-prompt-budget", () => {
		assert.equal(isProseStringNode({ type: "string" }), true);
		assert.equal(isProseStringNode({ type: "string", "x-prompt-budget": { tokens: 1000 } }), true);
	});
	it("rejects enum / pattern / format / const strings and non-strings", () => {
		assert.equal(isProseStringNode({ type: "string", enum: ["open", "closed"] }), false);
		assert.equal(isProseStringNode({ type: "string", pattern: "^FGAP-\\d{3}$" }), false);
		assert.equal(isProseStringNode({ type: "string", format: "date-time" }), false);
		assert.equal(isProseStringNode({ type: "string", const: "fixed" }), false);
		assert.equal(isProseStringNode({ type: "object" }), false);
		assert.equal(isProseStringNode({ type: "array" }), false);
	});
	it("accepts a nullable string union type", () => {
		assert.equal(isProseStringNode({ type: ["string", "null"] }), true);
	});
});

/** A synthetic item schema mirroring framework-gaps' real shape. */
const ITEM_SCHEMA = {
	type: "object",
	properties: {
		id: { type: "string", pattern: "^FGAP-\\d{3}$" },
		status: { type: "string", enum: ["identified", "closed"] },
		title: { type: "string" },
		description: { type: "string", "x-prompt-budget": { tokens: 1000, words: 800 } },
		proposed_resolution: { type: "string", "x-prompt-budget": { tokens: 1000, words: 800 } },
		acceptance_criteria: { type: "array", items: { type: "string" } },
		evidence: {
			type: "array",
			items: {
				type: "object",
				properties: {
					file: { type: "string" },
					content_pin: { type: "string", pattern: "^[0-9a-f]{64}$" },
					reference: { type: "string", "x-prompt-budget": { tokens: 1000, words: 800 } },
				},
			},
		},
	},
};

describe("collectProseValues — schema-lockstep prose extraction", () => {
	it("collects prose fields, recurses arrays of strings and of objects, and skips constrained fields", () => {
		const item = {
			id: "FGAP-901",
			status: "identified",
			title: "a title",
			description: "a description",
			acceptance_criteria: ["criterion one", "criterion two"],
			evidence: [{ file: "src/a.ts", content_pin: "0".repeat(64), reference: "what it demonstrates" }],
			undeclared_extra: "must not be scanned",
		};
		const values = collectProseValues(ITEM_SCHEMA, item, "");
		const paths = values.map((v) => v.fieldPath).sort();
		assert.deepEqual(paths, [
			"acceptance_criteria[0]",
			"acceptance_criteria[1]",
			"description",
			"evidence[0].file",
			"evidence[0].reference",
			"title",
		]);
		const desc = values.find((v) => v.fieldPath === "description");
		assert.equal(desc?.promptBudget, true);
		const title = values.find((v) => v.fieldPath === "title");
		assert.equal(title?.promptBudget, false);
	});

	it("returns nothing for absent values and undefined schema", () => {
		assert.deepEqual(collectProseValues(ITEM_SCHEMA, {}, ""), []);
		assert.deepEqual(collectProseValues(undefined, { title: "x" }, ""), []);
	});
});

describe("scanBlockItems — per-item aggregation", () => {
	it("flags the hedged item with categories and omits the clean item", () => {
		const items = [
			{
				id: "FGAP-901",
				status: "identified",
				title: "hedged gap",
				proposed_resolution:
					"inject the blocks and validate the output (the loop can check) — or amend the schema, as a decision.",
			},
			{
				id: "FGAP-902",
				status: "closed",
				title: "clean gap",
				proposed_resolution: "Route the commit through the gated tool. Shipped and pinned by unit tests.",
			},
		];
		const flagged = scanBlockItems("framework-gaps", "gaps", ITEM_SCHEMA, items);
		assert.equal(flagged.length, 1);
		const c = flagged[0];
		assert.equal(c.id, "FGAP-901");
		assert.equal(c.block, "framework-gaps");
		assert.ok(c.categories.includes("fork"));
		assert.ok(c.categories.includes("deferral"));
		const fieldPaths = c.fields.map((f) => f.fieldPath);
		assert.deepEqual(fieldPaths, ["proposed_resolution"]);
	});

	it("labels items without an id by block[index]", () => {
		const flagged = scanBlockItems("notes", "notes", { type: "object", properties: { body: { type: "string" } } }, [
			{ body: "either do this or that" },
		]);
		assert.equal(flagged.length, 1);
		assert.equal(flagged[0].id, "notes[0]");
	});

	it("skips a closed item entirely even when its prose still carries hedge language", () => {
		const items = [
			{
				id: "FGAP-903",
				status: "closed",
				title: "closed but still-hedged prose",
				proposed_resolution:
					"apply option A (the interactive orchestrator authors) or give the tools a pre-authorization channel, as a decision.",
			},
		];
		const flagged = scanBlockItems("framework-gaps", "gaps", ITEM_SCHEMA, items);
		assert.equal(flagged.length, 0, "a closed item must never be flagged, regardless of its prose");
	});

	it("applies per-block-kind terminal statuses, not a single hardcoded value", () => {
		const hedged = "do this or that, as a decision.";
		// tasks: "completed" is terminal, "in-progress" is not.
		const tasksItems = [
			{ id: "TASK-901", status: "completed", proposed_resolution: hedged },
			{ id: "TASK-902", status: "in-progress", proposed_resolution: hedged },
		];
		const tasksFlagged = scanBlockItems("tasks", "tasks", ITEM_SCHEMA, tasksItems);
		assert.deepEqual(
			tasksFlagged.map((c) => c.id),
			["TASK-902"],
			"only the in-progress task should be flagged; completed is terminal for tasks",
		);

		// decisions: "enacted" is terminal, "open" is not.
		const decisionsItems = [
			{ id: "DEC-0901", status: "enacted", proposed_resolution: hedged },
			{ id: "DEC-0902", status: "open", proposed_resolution: hedged },
		];
		const decisionsFlagged = scanBlockItems("decisions", "decisions", ITEM_SCHEMA, decisionsItems);
		assert.deepEqual(
			decisionsFlagged.map((c) => c.id),
			["DEC-0902"],
			"only the open decision should be flagged; enacted is terminal for decisions",
		);
	});

	it("does not skip on status values that are terminal for a DIFFERENT block kind", () => {
		// "closed" is framework-gaps' terminal value; a hypothetical block using
		// the same literal string but with no TERMINAL_STATUSES entry must not
		// have it treated as terminal by accident.
		const items = [{ id: "notes[0]", status: "closed", proposed_resolution: "do this or that, as a decision." }];
		const flagged = scanBlockItems("session-notes", "sessions", ITEM_SCHEMA, items);
		assert.equal(flagged.length, 1, "session-notes has no terminal-status entry; nothing should be skipped on status");
	});

	it("does not skip research's stale status — it is a live re-verification signal, not terminal", () => {
		const items = [{ id: "R-0901", status: "stale", proposed_resolution: "do this or that, as a decision." }];
		const flagged = scanBlockItems("research", "research", ITEM_SCHEMA, items);
		assert.equal(flagged.length, 1, "stale must remain a live candidate for research");
	});

	it("does not apply any terminal-status skip to the verification block", () => {
		// verification's status enum (passed/failed/partial/skipped) is a
		// test-outcome field, not a lifecycle state — deliberately absent from
		// TERMINAL_STATUSES, so nothing in this block is ever skipped on status.
		const items = [{ id: "VER-0901", status: "passed", proposed_resolution: "do this or that, as a decision." }];
		const flagged = scanBlockItems("verification", "verifications", ITEM_SCHEMA, items);
		assert.equal(flagged.length, 1, "verification has no terminal-status entry; a passed record stays flaggable");
	});
});

describe("scanSubstrate — live-substrate structural invariants", () => {
	it("scans every configured block kind read-only and produces a reconciled report with no score/weight anywhere", () => {
		const report = scanSubstrate(repoRoot);
		assert.equal(report.tool, "scan-substrate-hedges");
		assert.ok(report.blocks.length > 0, "config.block_kinds must yield at least one block");
		assert.ok(report.summary.itemsScanned > 0, "live substrate has items");
		assert.equal(
			report.summary.itemsFlagged,
			report.candidates.length,
			"summary.itemsFlagged must equal candidates.length",
		);
		assert.ok(!("minScore" in report), "report must not carry a minScore field");
		assert.ok(!("itemsBelowThreshold" in report.summary), "summary must not carry itemsBelowThreshold");
		// Order is block-then-id — incidental, not a priority claim.
		for (let i = 1; i < report.candidates.length; i++) {
			const prev = report.candidates[i - 1];
			const cur = report.candidates[i];
			const ordered = prev.block < cur.block || (prev.block === cur.block && prev.id <= cur.id);
			assert.ok(
				ordered,
				`candidates not block/id-ordered at ${i}: ${prev.block}/${prev.id} then ${cur.block}/${cur.id}`,
			);
		}
		const scannedBlocks = new Set(report.blocks.filter((b) => b.skipped === undefined).map((b) => b.block));
		for (const c of report.candidates) {
			assert.ok(scannedBlocks.has(c.block), `candidate block ${c.block} not among scanned blocks`);
			assert.ok(c.fields.length > 0);
			assert.ok(!("score" in c), `candidate ${c.block}/${c.id} must not carry a score field`);
			assert.ok(!("maxWeight" in c), `candidate ${c.block}/${c.id} must not carry a maxWeight field`);
			for (const f of c.fields) {
				for (const m of f.matches) {
					assert.ok(!("weight" in m), `match ${m.patternId} on ${c.block}/${c.id} must not carry a weight field`);
				}
			}
		}
		// totalMatches reconciles with the per-candidate match lists.
		const recomputed = report.candidates.reduce((s, c) => s + c.fields.reduce((t, f) => t + f.matches.length, 0), 0);
		assert.equal(report.summary.totalMatches, recomputed);
	});

	it("conditionally pins FGAP-125: while its proposed_resolution still carries the known '— or amend the schema' fork, it must be flagged", () => {
		// This is the known-true-positive sanity check from TASK-120's
		// acceptance criteria, made conditional so the cell passes vacuously
		// once the fork is audited and corrected downstream (the scanner's
		// purpose) rather than breaking like a hard pin would.
		const report = scanSubstrate(repoRoot);
		const fgapBlock = report.blocks.find((b) => b.arrayKey === "gaps");
		if (!fgapBlock || fgapBlock.skipped !== undefined) return; // no gaps block on this substrate
		const candidate = report.candidates.find((c) => c.id === "FGAP-125");
		if (candidate === undefined) {
			// Acceptable only if the fork text is gone; re-read its raw prose to prove it.
			// (readBlock is read-only — the same canonical reader scanSubstrate uses.)
			const data = readBlock(repoRoot, fgapBlock.block) as { gaps?: { id?: string; proposed_resolution?: string }[] };
			const item = data.gaps?.find((g) => g.id === "FGAP-125");
			const stillForked = item?.proposed_resolution?.includes("— or amend the schema") ?? false;
			assert.equal(
				stillForked,
				false,
				"FGAP-125 still carries its known fork but was not flagged — heuristic regression",
			);
			return;
		}
		assert.ok(
			candidate.categories.includes("fork"),
			`FGAP-125 flagged but without fork category: ${candidate.categories.join(",")}`,
		);
		const resolutionFinding = candidate.fields.find((f) => f.fieldPath === "proposed_resolution");
		assert.ok(resolutionFinding, "FGAP-125's proposed_resolution must be among its flagged fields");
	});
});
