#!/usr/bin/env -S npx tsx
/**
 * Commit-time DERIVABLE-CONTEXT-CURRENCY gate.
 *
 * BLOCKS any commit while the active substrate's DERIVABLE context has drifted
 * from current — i.e. a fact the substrate can compute from code + pins no
 * longer matches what is stored. This guards the currency of the DERIVABLE
 * surface only; it deliberately does NOT block on advisory / human-judgment
 * signals (authored feature/gap/issue/task buckets, convention-articulation
 * checks, edge-integrity warnings, schema/id validity slugs, etc.). Those are
 * validate's review surface, not derivable currency, and pass through here.
 *
 * The block-set (any one non-empty → NOT current → exit 1):
 *   1. validateContext(cwd) issues whose `code` is `anchor-drift` (a pinned
 *      evidence/citation file changed since it was pinned) or
 *      `staleness-candidate` (a typed stale_condition fired on a complete item).
 *      These two codes are handled by DIFFERENT rules (code-split), because they
 *      mean different things:
 *        • anchor-drift is LIVE-ONLY. An anchor-drift flagged on an item whose
 *          status buckets to a SETTLED bucket (`complete` or `unknown`) is NOT a
 *          currency blocker — a settled item's cited code is historical by
 *          definition, so its pin can never match current code, and treating its
 *          drift as a blocker would keep the gate permanently red. The bucketing
 *          is the substrate's own status→bucket vocabulary (defaults shadowed by
 *          the project's config.status_buckets), NOT a transcribed string set:
 *          the `complete` bucket already includes `closed`/`archived`/`done`, so
 *          a settled framework-gap in `closed` correctly stops blocking. Only an
 *          anchor-drift on a LIVE-bucket item (`todo`/`in_progress`/`blocked`)
 *          blocks. The exempt issues are filtered out (by resolving each flagged
 *          item's status → bucket) BEFORE the pure classifier runs.
 *        • staleness-candidate is ALWAYS actionable and is NEVER exempted by
 *          status/bucket — it fires on a `complete` item whose typed
 *          stale_condition/pin tripped, which is exactly the reconcile-actionable
 *          drift the gate exists to catch; bucket-exempting it (all such items
 *          bucket to `complete`) would silence complete-item grounding drift.
 *   2. reconcileContext(cwd, { dryRun: true }) `deltas` (a stored rollup status
 *      diverges from its derivation) — dryRun writes NOTHING (verified against
 *      the library signature: it returns before any apply when dryRun).
 *   3. reconcileContext(cwd, { dryRun: true }) `stalenessTransitions` (a complete
 *      item whose typed condition/pin fired would transition to stale).
 *
 * Every other validate code (decision-derivation / task-completed-* /
 * *-articulates-convention / nested_id_bearing_array / status_unknown_value /
 * substrate-id slugs / block-schema-invalid / edge-integrity, …) is IGNORED —
 * only the four block-conditions above gate the commit.
 *
 * FAIL-OPEN (harness doctrine): a broken or ABSENT substrate must never brick
 * every commit in the repo. If there is no `.pi-context.json` pointer, no
 * substrate/config, or the SDK throws while reading, the gate prints a one-line
 * note to stderr and exits 0. It guards a PRESENT substrate's currency; it does
 * not require one to exist.
 *
 * The pure decision function `isCurrent` is exported for the sibling test so the
 * classifier is covered deterministically without depending on live-substrate
 * state; main() feeds it the live SDK results. Run via `npx tsx` from repo root,
 * imports the pi-context SDK through the tsconfig `paths` map (source, no dist
 * needed) — mirrors the other pre-commit gates.
 */
import { reconcileContext, resolveItemById, resolveStatusVocabulary } from "@davidorex/pi-context";
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
 * The BLOCK codes from validateContext: a pinned evidence/citation file changed
 * since it was pinned, or a typed stale-condition fired on a complete item.
 * Every OTHER validate code is advisory here and does not gate the commit.
 */
const BLOCKING_VALIDATE_CODES = new Set<string>(["anchor-drift", "staleness-candidate"]);

/**
 * The SETTLED status buckets — an item bucketing to one of these is no-longer-live
 * (`unknown`: superseded / cancelled / deferred / abandoned / wontfix / stale / …)
 * OR terminally done (`complete`: complete / done / resolved / verified / closed /
 * archived / …). Either way its cited code is historical by definition, so an
 * anchor-drift on it is honest history, not a currency blocker. The two LIVE
 * buckets (`todo` / `in_progress` / `blocked`) are absent — a live item's pin
 * drift IS a currency blocker.
 *
 * This is bucket-level (not a per-status string set) deliberately: the substrate's
 * own status→bucket vocabulary already places `closed`/`archived`/`done` in
 * `complete` and `superseded`/`stale`/`cancelled` in `unknown`, so a bucket check
 * tracks vocabulary evolution instead of re-transcribing (and mis-transcribing)
 * strings here.
 */
export const SETTLED_BUCKETS = new Set<string>(["complete", "unknown"]);

/**
 * Pure predicate: does `bucket` name a SETTLED (no-longer-live) bucket? An
 * anchor-drift on a settled-bucket item is exempt; on a live-bucket item
 * (`todo`/`in_progress`/`blocked`) it blocks.
 */
export function isSettledBucket(bucket: string): boolean {
	return SETTLED_BUCKETS.has(bucket);
}

/**
 * Pure: map a status string to its bucket via the substrate's status→bucket
 * `vocab` (the map returned by resolveStatusVocabulary — the canonical defaults
 * shadowed by the project's config.status_buckets). Case-insensitive, trimmed.
 * An unrecognized status resolves to `"unknown"` (a SETTLED bucket): a status the
 * vocabulary does not know is not a known-live item, so — for the anchor-drift
 * exemption this feeds — it is treated as settled. This vocab-level fallback is
 * distinct from the resolution-level fail-closed in filterActionableDrift (a
 * status that cannot be resolved AT ALL keeps the issue as a live blocker).
 */
export function bucketOfStatus(status: string, vocab: Record<string, string>): string {
	return vocab[status.trim().toLowerCase()] ?? "unknown";
}

/**
 * Recover the flagged item's id from a validate issue's `field`. The observed
 * encoding is `<itemId>.<code>` (e.g. field `"<id>.anchor-drift"` for code
 * `anchor-drift`); strip the trailing `.<code>` suffix. If the shape differs,
 * fall back to the leading dotted segment; never guess further. Returns null
 * when no id can be recovered.
 */
export function itemIdFromField(field: string | undefined, code: string): string | null {
	if (!field) return null;
	const suffix = `.${code}`;
	if (field.endsWith(suffix)) {
		const id = field.slice(0, field.length - suffix.length);
		return id.length > 0 ? id : null;
	}
	const head = field.split(".")[0];
	return head.length > 0 ? head : null;
}

/** Resolve a flagged item's stored status by id, or null when unresolvable. */
export type ItemStatusResolver = (itemId: string) => string | null;

/**
 * CODE-SPLIT drift filter: drop the currency issues that are NOT actionable and
 * pass the rest through for the pure classifier. Kept out of `isCurrent` so the
 * classifier stays substrate-free and unit-testable; the status resolver + the
 * status→bucket `vocab` are injected so this filter is testable too.
 *
 * The split by validate `code`:
 *   • `anchor-drift` — LIVE-ONLY. Resolve the flagged item's status → bucket and
 *     DROP (exempt) the issue iff the bucket is SETTLED (`complete`/`unknown`);
 *     KEEP it iff the bucket is live (`todo`/`in_progress`/`blocked`).
 *   • `staleness-candidate` — ALWAYS KEEP. It is reconcile-actionable regardless
 *     of status (it fires on `complete` items by construction); bucket-exempting
 *     it would silence complete-item grounding drift.
 *   • any other code — passed through untouched (never a block code; `isCurrent`
 *     ignores it anyway).
 *
 * FAIL-CLOSED at every RESOLUTION uncertainty for anchor-drift: an issue whose
 * item id cannot be recovered, whose resolver throws, or whose item is not found
 * (null) is KEPT as a live blocker — a resolution failure never silently drops a
 * real blocker. Only a successfully-resolved SETTLED-bucket status removes it.
 */
export function filterActionableDrift(
	issues: ValidateIssueLike[],
	resolveStatus: ItemStatusResolver,
	vocab: Record<string, string>,
): ValidateIssueLike[] {
	return issues.filter((issue) => {
		if (!issue.code || !BLOCKING_VALIDATE_CODES.has(issue.code)) return true;
		// staleness-candidate is always actionable — never bucket-exempted.
		if (issue.code !== "anchor-drift") return true;
		// anchor-drift: exempt only a SETTLED-bucket item; fail-closed otherwise.
		const itemId = itemIdFromField(issue.field, issue.code);
		if (!itemId) return true;
		let status: string | null;
		try {
			status = resolveStatus(itemId);
		} catch {
			return true;
		}
		if (status == null) return true;
		return !isSettledBucket(bucketOfStatus(status, vocab));
	});
}

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

	// CODE-SPLIT exemption before classifying: exempt anchor-drift issues flagged
	// on SETTLED-bucket items (their cited code is historical by definition), while
	// always keeping staleness-candidate issues. The item status → bucket mapping
	// uses the substrate's own vocabulary (defaults shadowed by config.status_buckets),
	// resolved once here. Resolution is done here (not in the pure isCurrent) via the
	// SDK, so the classifier stays substrate-free. Fail-closed inside the filter.
	const vocab = resolveStatusVocabulary(cwd);
	const liveIssues = filterActionableDrift(
		validateIssues,
		(itemId) => {
			const loc = resolveItemById(cwd, itemId);
			return loc ? String((loc.item as { status?: unknown }).status ?? "") : null;
		},
		vocab,
	);

	const { current, blockers } = isCurrent(liveIssues, reconcile);
	if (current) {
		console.log(
			"check-context-currency: derivable context is current (no pin drift, no fired staleness, no stored-status divergence).",
		);
		return 0;
	}

	console.error(`check-context-currency: derivable context is NOT current — ${blockers.length} blocker(s):`);
	for (const b of blockers) console.error(`  ${b}`);
	console.error(
		"Remedy: derivable context is not current — run `pi-context context-reconcile` for stored-status/staleness transitions and re-pin drifted evidence, then commit (do not --no-verify).",
	);
	return 1;
}

// Run only as a CLI, not when imported by the test.
if (import.meta.url === `file://${process.argv[1]}`) {
	process.exit(main());
}
