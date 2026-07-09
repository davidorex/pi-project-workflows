#!/usr/bin/env -S npx tsx
/**
 * DERIVABLE-CONTEXT-CURRENCY check (invoked by the /audit-context-currency loop).
 *
 * Reports NOT-current while the active substrate's DERIVABLE context has drifted
 * from current — i.e. a fact the substrate can compute from code + pins no
 * longer matches what is stored. This guards the currency of the DERIVABLE
 * surface only; it deliberately does NOT flag advisory / human-judgment signals
 * (authored feature/gap/issue/task buckets, convention-articulation checks,
 * edge-integrity warnings, schema/id validity slugs, etc.). Those are validate's
 * review surface, not derivable currency, and pass through here.
 *
 * The block-set (any one non-empty → NOT current → exit 1):
 *   1. validateContext(cwd) issues whose `code` is `staleness-candidate` (a typed
 *      stale_condition fired on a complete item). It is ALWAYS actionable and is
 *      NEVER exempted by status/bucket — it fires on a `complete` item whose typed
 *      stale_condition/pin tripped, which is exactly the reconcile-actionable
 *      drift this check exists to catch.
 *   2. reconcileContext(cwd, { dryRun: true }) `deltas` (a stored rollup status
 *      diverges from its derivation) — dryRun writes NOTHING (verified against
 *      the library signature: it returns before any apply when dryRun).
 *   3. reconcileContext(cwd, { dryRun: true }) `stalenessTransitions` (a complete
 *      item whose typed condition/pin fired would transition to stale).
 *
 * Every other validate code (decision-derivation / task-completed-* /
 * *-articulates-convention / nested_id_bearing_array / status_unknown_value /
 * substrate-id slugs / block-schema-invalid / edge-integrity, …) is IGNORED —
 * only the three block-conditions above signal not-current.
 *
 * FAIL-OPEN (harness doctrine): a broken or ABSENT substrate must never fail the
 * caller. If there is no `.pi-context.json` pointer, no substrate/config, or the
 * SDK throws while reading, the check prints a one-line note to stderr and exits
 * 0. It guards a PRESENT substrate's currency; it does not require one to exist.
 *
 * The pure decision function `isCurrent` is exported for the sibling test so the
 * classifier is covered deterministically without depending on live-substrate
 * state; main() feeds it the live SDK results. Run via `npx tsx` from repo root,
 * imports the pi-context SDK through the tsconfig `paths` map (source, no dist
 * needed).
 */
import { reconcileContext } from "@davidorex/pi-context";
import { validateContext } from "@davidorex/pi-context/context-sdk";

/** The minimal shape of a validateContext issue this gate reads. */
export interface ValidateIssueLike {
	message: string;
	block: string;
	field?: string;
	code?: string;
}

/** The minimal shape of a reconcileContext dryRun result this gate reads. */
export interface ReconcileResultLike {
	deltas: Array<{ id: string; block: string; from: string; to: string; invariant: string }>;
	stalenessTransitions: Array<{ id: string; block: string; from: string; to: string; reasons: string[] }>;
}

/** The gate verdict: current when the block-set is empty; else the named blockers. */
export interface CurrencyVerdict {
	current: boolean;
	blockers: string[];
}

/**
 * The BLOCK code from validateContext: a typed stale-condition fired on a
 * complete item. Every OTHER validate code is advisory here and does not signal
 * not-current.
 */
const BLOCKING_VALIDATE_CODES = new Set<string>(["staleness-candidate"]);

/**
 * The pure decision: is the derivable context current? Blocks (returns
 * current:false) when ANY of — a blocking-code validate issue, a reconcile
 * stored-status delta, a reconcile pending-staleness transition — is present.
 * Advisory-only validate issues never block. `blockers` names each stale item
 * (block + locator/id) with its drift reason, for the operator report.
 */
export function isCurrent(validateIssues: ValidateIssueLike[], reconcile: ReconcileResultLike): CurrencyVerdict {
	const blockers: string[] = [];

	for (const issue of validateIssues) {
		if (issue.code && BLOCKING_VALIDATE_CODES.has(issue.code)) {
			const locator = issue.field ? `${issue.block}.${issue.field}` : issue.block;
			blockers.push(`[${issue.code}] ${locator}: ${issue.message}`);
		}
	}

	for (const d of reconcile.deltas) {
		blockers.push(
			`[stored-status-divergence] ${d.block}/${d.id}: stored '${d.from}' diverges from derived '${d.to}' (invariant ${d.invariant})`,
		);
	}

	for (const t of reconcile.stalenessTransitions) {
		const why = t.reasons.length > 0 ? t.reasons.join("; ") : "typed condition/pin fired";
		blockers.push(`[pending-staleness] ${t.block}/${t.id}: '${t.from}' would transition to '${t.to}' (${why})`);
	}

	return { current: blockers.length === 0, blockers };
}

function main(): number {
	const cwd = process.cwd();

	let validateIssues: ValidateIssueLike[];
	let reconcile: ReconcileResultLike;
	try {
		validateIssues = validateContext(cwd).issues;
		const rr = reconcileContext(cwd, { dryRun: true });
		// An explicit error string means no pointer / no config — a pre-bootstrap
		// or absent substrate. Fail-open: guard a present substrate, do not require one.
		if (rr.error) {
			console.error(
				`check-context-currency: no readable substrate (${rr.error}) — skipping currency gate (fail-open).`,
			);
			return 0;
		}
		reconcile = rr;
	} catch (err) {
		console.error(
			`check-context-currency: substrate/SDK unavailable (${err instanceof Error ? err.message : String(err)}) — skipping currency gate (fail-open).`,
		);
		return 0;
	}

	const { current, blockers } = isCurrent(validateIssues, reconcile);
	if (current) {
		console.log(
			"check-context-currency: derivable context is current (no fired staleness, no stored-status divergence).",
		);
		return 0;
	}

	console.error(`check-context-currency: derivable context is NOT current — ${blockers.length} blocker(s):`);
	for (const b of blockers) console.error(`  ${b}`);
	console.error(
		"Remedy: derivable context is not current — run `pi-context context-reconcile` for stored-status/staleness transitions, then commit (do not --no-verify).",
	);
	return 1;
}

// Run only as a CLI, not when imported by the test.
if (import.meta.url === `file://${process.argv[1]}`) {
	process.exit(main());
}
