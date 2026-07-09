/**
 * Helper-level tests for the derivable-context-currency gate: every cell of the
 * pure `isCurrent` classifier. No SDK, no substrate, no git, no filesystem —
 * the live SDK results are fed in as fixtures so the block/pass decision is
 * covered deterministically regardless of the working substrate's real state.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isCurrent, type ReconcileResultLike, type ValidateIssueLike } from "./check-context-currency.js";

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
			{ code: "staleness-candidate", block: "gaps", message: "typed stale_condition fired" },
		];
		const reconcile: ReconcileResultLike = {
			deltas: [{ id: "M-2", block: "milestones", from: "open", to: "complete", invariant: "inv-2" }],
			stalenessTransitions: [
				{ id: "V-3", block: "verifications", from: "complete", to: "stale", reasons: ["condition fired"] },
			],
		};
		const verdict = isCurrent(issues, reconcile);
		assert.equal(verdict.current, false);
		// staleness-candidate + delta + staleness transition = 3 blockers; the advisory decision code is dropped.
		assert.equal(verdict.blockers.length, 3);
	});
});
