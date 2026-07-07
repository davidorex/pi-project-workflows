/**
 * Helper-level tests for the derivable-context-currency gate: every cell of the
 * pure `isCurrent` classifier. No SDK, no substrate, no git, no filesystem —
 * the live SDK results are fed in as fixtures so the block/pass decision is
 * covered deterministically regardless of the working substrate's real state.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	bucketOfStatus,
	filterActionableDrift,
	isCurrent,
	isSettledBucket,
	itemIdFromField,
	type ReconcileResultLike,
	type ValidateIssueLike,
} from "./check-context-currency.js";

/**
 * A minimal status→bucket vocabulary fixture mirroring the SETTLED / LIVE split
 * of the substrate's real STATUS_VOCABULARY_DEFAULTS. The gate resolves the true
 * project vocabulary at runtime; the pure helpers take the map injected, so the
 * tests pin the exact strings under test rather than importing the (non-exported)
 * defaults map.
 */
const VOCAB: Record<string, string> = {
	// → complete (SETTLED)
	closed: "complete",
	complete: "complete",
	done: "complete",
	resolved: "complete",
	archived: "complete",
	verified: "complete",
	// → unknown (SETTLED)
	stale: "unknown",
	superseded: "unknown",
	cancelled: "unknown",
	abandoned: "unknown",
	wontfix: "unknown",
	deferred: "unknown",
	// → todo (LIVE)
	identified: "todo",
	open: "todo",
	todo: "todo",
	planned: "todo",
	proposed: "todo",
	draft: "todo",
	// → in_progress (LIVE)
	"in-progress": "in_progress",
	accepted: "in_progress",
	"in-review": "in_progress",
	// → blocked (LIVE)
	blocked: "blocked",
	failed: "blocked",
};

/** An empty reconcile dryRun result (no deltas, no staleness transitions). */
function cleanReconcile(): ReconcileResultLike {
	return { deltas: [], stalenessTransitions: [] };
}

describe("isCurrent", () => {
	it("no blocking validate issues + empty reconcile → current", () => {
		const verdict = isCurrent([], cleanReconcile());
		assert.equal(verdict.current, true);
		assert.deepEqual(verdict.blockers, []);
	});

	it("an anchor-drift validate issue → blocked, named", () => {
		const issues: ValidateIssueLike[] = [
			{
				code: "anchor-drift",
				block: "research",
				field: "citations[0]",
				message: "pinned file changed since it was pinned",
			},
		];
		const verdict = isCurrent(issues, cleanReconcile());
		assert.equal(verdict.current, false);
		assert.equal(verdict.blockers.length, 1);
		assert.match(verdict.blockers[0], /anchor-drift/);
		assert.match(verdict.blockers[0], /research\.citations\[0\]/);
	});

	it("a staleness-candidate validate issue → blocked", () => {
		const issues: ValidateIssueLike[] = [
			{ code: "staleness-candidate", block: "gaps", message: "typed stale_condition fired on a complete item" },
		];
		const verdict = isCurrent(issues, cleanReconcile());
		assert.equal(verdict.current, false);
		assert.match(verdict.blockers[0], /staleness-candidate/);
	});

	it("a reconcile stored-status delta → blocked, named", () => {
		const reconcile: ReconcileResultLike = {
			deltas: [{ id: "M-1", block: "milestones", from: "in-progress", to: "complete", invariant: "inv-rollup-1" }],
			stalenessTransitions: [],
		};
		const verdict = isCurrent([], reconcile);
		assert.equal(verdict.current, false);
		assert.equal(verdict.blockers.length, 1);
		assert.match(verdict.blockers[0], /stored-status-divergence/);
		assert.match(verdict.blockers[0], /milestones\/M-1/);
	});

	it("a reconcile pending-staleness transition → blocked", () => {
		const reconcile: ReconcileResultLike = {
			deltas: [],
			stalenessTransitions: [
				{ id: "V-9", block: "verifications", from: "complete", to: "stale", reasons: ["pin drift on evidence"] },
			],
		};
		const verdict = isCurrent([], reconcile);
		assert.equal(verdict.current, false);
		assert.match(verdict.blockers[0], /pending-staleness/);
		assert.match(verdict.blockers[0], /would transition to 'stale'/);
	});

	it("advisory-only validate issues (no blocking code, empty reconcile) → current", () => {
		const issues: ValidateIssueLike[] = [
			{ code: "decision-shows-derivation", block: "decisions", message: "advisory" },
			{ code: "task-completed-feature-complete", block: "tasks", message: "advisory" },
			{ code: "nested_id_bearing_array", block: "config", message: "advisory" },
			{ block: "relations", message: "codeless edge diagnostic" }, // no code at all
		];
		const verdict = isCurrent(issues, cleanReconcile());
		assert.equal(verdict.current, true);
		assert.deepEqual(verdict.blockers, []);
	});

	it("mixed set: advisory issues ignored, blocking signals accumulate", () => {
		const issues: ValidateIssueLike[] = [
			{ code: "decision-shows-derivation", block: "decisions", message: "advisory — ignored" },
			{ code: "anchor-drift", block: "research", message: "pinned file changed" },
		];
		const reconcile: ReconcileResultLike = {
			deltas: [{ id: "M-2", block: "milestones", from: "open", to: "complete", invariant: "inv-2" }],
			stalenessTransitions: [
				{ id: "V-3", block: "verifications", from: "complete", to: "stale", reasons: ["condition fired"] },
			],
		};
		const verdict = isCurrent(issues, reconcile);
		assert.equal(verdict.current, false);
		// anchor-drift + delta + staleness = 3 blockers; the advisory decision code is dropped.
		assert.equal(verdict.blockers.length, 3);
	});
});

describe("bucketOfStatus", () => {
	it("complete-bucket statuses (incl. closed/archived/verified) → 'complete'", () => {
		for (const s of ["closed", "complete", "done", "resolved", "archived", "verified"]) {
			assert.equal(bucketOfStatus(s, VOCAB), "complete", `${s} → complete`);
		}
	});

	it("unknown-bucket (settled-not-complete) statuses → 'unknown'", () => {
		for (const s of ["stale", "superseded", "cancelled", "abandoned", "wontfix", "deferred"]) {
			assert.equal(bucketOfStatus(s, VOCAB), "unknown", `${s} → unknown`);
		}
	});

	it("todo-bucket statuses → 'todo'", () => {
		for (const s of ["identified", "open", "todo", "planned", "proposed", "draft"]) {
			assert.equal(bucketOfStatus(s, VOCAB), "todo", `${s} → todo`);
		}
	});

	it("in_progress-bucket statuses → 'in_progress'", () => {
		for (const s of ["in-progress", "accepted", "in-review"]) {
			assert.equal(bucketOfStatus(s, VOCAB), "in_progress", `${s} → in_progress`);
		}
	});

	it("blocked-bucket statuses → 'blocked'", () => {
		for (const s of ["blocked", "failed"]) {
			assert.equal(bucketOfStatus(s, VOCAB), "blocked", `${s} → blocked`);
		}
	});

	it("an unrecognized status → 'unknown' (vocab-level settled fallback)", () => {
		assert.equal(bucketOfStatus("frobnicated", VOCAB), "unknown");
		assert.equal(bucketOfStatus("", VOCAB), "unknown");
	});

	it("case-insensitive + trimmed", () => {
		assert.equal(bucketOfStatus("  Closed ", VOCAB), "complete");
		assert.equal(bucketOfStatus("STALE", VOCAB), "unknown");
		assert.equal(bucketOfStatus(" Identified ", VOCAB), "todo");
	});
});

describe("isSettledBucket", () => {
	it("complete / unknown → settled (true)", () => {
		assert.equal(isSettledBucket("complete"), true);
		assert.equal(isSettledBucket("unknown"), true);
	});

	it("todo / in_progress / blocked → live (false)", () => {
		assert.equal(isSettledBucket("todo"), false);
		assert.equal(isSettledBucket("in_progress"), false);
		assert.equal(isSettledBucket("blocked"), false);
	});
});

describe("itemIdFromField", () => {
	it("strips the trailing .<code> suffix to recover the item id", () => {
		assert.equal(itemIdFromField("M-1.anchor-drift", "anchor-drift"), "M-1");
		assert.equal(itemIdFromField("V-9.staleness-candidate", "staleness-candidate"), "V-9");
	});

	it("falls back to the leading dotted segment when the shape differs", () => {
		assert.equal(itemIdFromField("M-2.something-else", "anchor-drift"), "M-2");
	});

	it("returns null when no id can be recovered", () => {
		assert.equal(itemIdFromField(undefined, "anchor-drift"), null);
		assert.equal(itemIdFromField("", "anchor-drift"), null);
	});
});

describe("filterActionableDrift", () => {
	const closedItemDrift: ValidateIssueLike = {
		code: "anchor-drift",
		block: "gaps",
		field: "G-1.anchor-drift",
		message: "pinned file changed",
	};
	const identifiedItemDrift: ValidateIssueLike = {
		code: "anchor-drift",
		block: "gaps",
		field: "G-2.anchor-drift",
		message: "pinned file changed",
	};
	const staleItemDrift: ValidateIssueLike = {
		code: "anchor-drift",
		block: "research",
		field: "R-1.anchor-drift",
		message: "pinned file changed",
	};
	const inProgressItemDrift: ValidateIssueLike = {
		code: "anchor-drift",
		block: "tasks",
		field: "T-1.anchor-drift",
		message: "pinned file changed",
	};
	const staleness = (id: string, block: string): ValidateIssueLike => ({
		code: "staleness-candidate",
		block,
		field: `${id}.staleness-candidate`,
		message: "typed stale_condition fired on a complete item",
	});
	const resolver =
		(statuses: Record<string, string>): ((id: string) => string | null) =>
		(id) =>
			statuses[id] ?? null;

	it("(a) anchor-drift on a `closed` (complete-bucket) item → dropped", () => {
		const survivors = filterActionableDrift([closedItemDrift], resolver({ "G-1": "closed" }), VOCAB);
		assert.deepEqual(survivors, []);
	});

	it("(b) anchor-drift on an `identified` (todo-bucket, live) item → kept", () => {
		const survivors = filterActionableDrift([identifiedItemDrift], resolver({ "G-2": "identified" }), VOCAB);
		assert.equal(survivors.length, 1);
		assert.equal(survivors[0].field, "G-2.anchor-drift");
	});

	it("(c) anchor-drift on a `stale` (unknown-bucket, settled) item → dropped", () => {
		const survivors = filterActionableDrift([staleItemDrift], resolver({ "R-1": "stale" }), VOCAB);
		assert.deepEqual(survivors, []);
	});

	it("(d) anchor-drift on an `in-progress` (live) item → kept", () => {
		const survivors = filterActionableDrift([inProgressItemDrift], resolver({ "T-1": "in-progress" }), VOCAB);
		assert.equal(survivors.length, 1);
	});

	it("(e) staleness-candidate on a `complete` item → KEPT (never bucket-exempted)", () => {
		const issue = staleness("V-1", "verifications");
		const survivors = filterActionableDrift([issue], resolver({ "V-1": "complete" }), VOCAB);
		assert.deepEqual(survivors, [issue]);
	});

	it("(f) staleness-candidate on a `stale`/`closed` item → KEPT (status never resolved for it)", () => {
		const s1 = staleness("R-2", "research");
		const s2 = staleness("G-3", "gaps");
		// The resolver is intentionally throwing: staleness-candidate must never
		// reach status resolution, so a throwing resolver must not affect it.
		const survivors = filterActionableDrift(
			[s1, s2],
			() => {
				throw new Error("resolver must not be called for staleness-candidate");
			},
			VOCAB,
		);
		assert.deepEqual(survivors, [s1, s2]);
	});

	it("(g) fail-closed: anchor-drift whose item is not-found (null) → kept", () => {
		const survivors = filterActionableDrift([closedItemDrift], resolver({}), VOCAB);
		assert.equal(survivors.length, 1);
	});

	it("(g) fail-closed: anchor-drift whose resolver throws → kept", () => {
		const survivors = filterActionableDrift(
			[closedItemDrift],
			() => {
				throw new Error("SDK unavailable");
			},
			VOCAB,
		);
		assert.equal(survivors.length, 1);
	});

	it("fail-closed: anchor-drift with no recoverable item id → kept", () => {
		const noField: ValidateIssueLike = { code: "anchor-drift", block: "gaps", message: "no field" };
		const survivors = filterActionableDrift([noField], () => "closed", VOCAB);
		assert.equal(survivors.length, 1);
	});

	it("passes non-blocking-code issues through untouched", () => {
		const advisory: ValidateIssueLike = { code: "decision-shows-derivation", block: "decisions", message: "advisory" };
		const survivors = filterActionableDrift([advisory], () => "stale", VOCAB);
		assert.deepEqual(survivors, [advisory]);
	});
});
