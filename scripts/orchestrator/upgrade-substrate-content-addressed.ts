#!/usr/bin/env tsx
/**
 * upgrade-substrate-content-addressed — Claude-Code-side orchestrator that brings
 * ONE legacy (pre-identity) substrate under the content-addressed canon via the
 * generalized dupe / verify / swap triple-buffer. It is the trimmed, GENERALIZED
 * sibling of `foldin-context.ts`: where that script also runs substrate-specific
 * OPs (de-nesting the `layer-plans` schema, promoting cross-substrate refnames),
 * this harness performs ONLY the substrate-agnostic upgrade sequence that applies
 * to any flat substrate that predates the identity model.
 *
 * Sequence (the original is UNTOUCHED until a verified swap):
 *   1. Guard — resolve cwd + substrate dir; refuse a missing substrate / missing
 *      config.json; refuse a pre-existing `<substrate>-migrate` sibling; no-op
 *      (exit 0) when the config ALREADY carries a substrate_id (idempotency).
 *   2. Dupe — `fs.cpSync(<substrate>, <substrate>-migrate, {recursive:true})` to a
 *      ROOT-SIBLING (a DIRECT CHILD of cwd). This is required: OP4's
 *      `migrateToContentAddressed` discovers substrates by `fs.readdirSync(cwd)`
 *      and `onlySubstrates`-filters by the child dir name. A `tmp/`-nested dupe
 *      would be a child of `tmp/`, never discovered, so the migration would no-op.
 *   3. Land identity fields — `landIdentityFieldsForDir(<dupe>)` injects the three
 *      optional identity-field DECLARATIONS (oid / content_hash / content_parent)
 *      onto every registered block_kind's item schema (incl. any custom kind),
 *      satisfying the migration's step-0 fail-fast readiness gate.
 *   4. Migrate — `migrateToContentAddressed(cwd, {onlySubstrates:[<dupe>],
 *      register:false, dryRun})` mints substrate_id + backfills oid/content_hash +
 *      stores objects + converts endpoints, WITHOUT writing the project-root
 *      registry (registration is deferred to the post-swap step so the registry
 *      only ever names the live substrate, never a transient dupe).
 *      - `--dry-run`: print the report, remove the dupe, exit 0 (no swap).
 *   5. Verify — `verifyDupe(cwd, <dupe>)` pointer-switches the cwd to the dupe,
 *      runs validateContext, filters by the canonicalization BLOCKING_CODES, and
 *      ALWAYS restores the original pointer in a `finally`. On failure the dupe is
 *      removed and the harness exits non-zero.
 *   6. Swap (only on a clean verify) — rename `<substrate>` → `<substrate>-archived`
 *      (the original is PRESERVED, never deleted; a timestamped suffix is used when
 *      `<substrate>-archived` already exists), then rename `<substrate>-migrate` →
 *      `<substrate>`. On the second rename failing, the archived original is rolled
 *      back into place and the harness exits non-zero.
 *   7. Post-swap register — read the now-live `<substrate>/config.json`
 *      `substrate_id`; when present, `registerSubstrate(cwd, id, <substrate>, [])`.
 *
 * Error discipline: any throw BEFORE the swap removes the dupe and leaves the
 * original + pointer untouched, exiting non-zero with a message naming the failed
 * step. Diagnostics route through `console.error` (the same surface as
 * foldin-context.ts) so stdout carries only the migration/dry-run report JSON in
 * `--format json` mode.
 *
 * Usage:
 *   tsx scripts/orchestrator/upgrade-substrate-content-addressed.ts \
 *     [--cwd <dir>] [--substrate <name>] [--dry-run] \
 *     [--writer <kind:id>] [--format json|table]
 *   (defaults: --cwd ., --substrate .context, --writer human:davidryan@gmail.com,
 *    --format table)
 */
import fs from "node:fs";
import path from "node:path";
import { registerSubstrate } from "@davidorex/pi-context/context-registry";
import type { DispatchContext, WriterIdentity } from "@davidorex/pi-context/dispatch-context";
import { landIdentityFieldsForDir } from "@davidorex/pi-context/land-identity-fields";
import { type MigrationReport, migrateToContentAddressed } from "@davidorex/pi-context/migrate-content-addressed";
import { verifyDupe } from "./verify-substrate-dupe.js";

export interface UpgradeOptions {
	cwd: string;
	substrate: string;
	dryRun: boolean;
	writer: string;
	format: "json" | "table";
}

export type UpgradeOutcome =
	| { kind: "noop_already_addressed"; substrateId: string }
	| { kind: "dry_run"; report: MigrationReport }
	| { kind: "swapped"; substrateId: string | null; archivedDir: string; registered: boolean };

/** Thrown for a guard / verify / swap failure; `code` is the process exit code the
 * CLI surfaces. The harness function NEVER calls process.exit so it stays callable
 * from the runtime demo; the CLI `main()` translates this into an exit. */
export class UpgradeError extends Error {
	constructor(
		message: string,
		readonly code: number,
	) {
		super(message);
		this.name = "UpgradeError";
	}
}

interface Args extends UpgradeOptions {}

function parseArgs(argv: string[]): Args {
	const out: Args = {
		cwd: process.cwd(),
		substrate: ".context",
		dryRun: false,
		writer: "human:davidryan@gmail.com",
		format: "table",
	};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--cwd" && argv[i + 1]) {
			out.cwd = argv[i + 1];
			i++;
		} else if (a === "--substrate" && argv[i + 1]) {
			out.substrate = argv[i + 1];
			i++;
		} else if (a === "--writer" && argv[i + 1]) {
			out.writer = argv[i + 1];
			i++;
		} else if (a === "--format" && argv[i + 1]) {
			const f = argv[i + 1];
			if (f !== "json" && f !== "table") {
				console.error(`Unknown --format value: ${f} (expected json|table)`);
				process.exit(2);
			}
			out.format = f;
			i++;
		} else if (a === "--dry-run") {
			out.dryRun = true;
		} else {
			console.error(`Unknown argument: ${a}`);
			process.exit(2);
		}
	}
	return out;
}

/** Parse a `kind:id` writer string into a DispatchContext. Maps the id segment to
 * the per-kind identifier field of WriterIdentity (human→user, agent→agent_id,
 * monitor→monitor_name, workflow→workflow_step_id); an unparseable string (no `:`)
 * or an unknown kind falls back to a human identity using the whole id segment. */
function writerToCtx(writer: string): DispatchContext {
	const idx = writer.indexOf(":");
	const kindRaw = idx >= 0 ? writer.slice(0, idx) : "human";
	const id = idx >= 0 ? writer.slice(idx + 1) : writer;
	let identity: WriterIdentity;
	switch (kindRaw) {
		case "agent":
			identity = { kind: "agent", agent_id: id };
			break;
		case "monitor":
			identity = { kind: "monitor", monitor_name: id };
			break;
		case "workflow":
			identity = { kind: "workflow", workflow_step_id: id };
			break;
		default:
			identity = { kind: "human", user: id };
			break;
	}
	return { writer: identity };
}

/** Read a substrate config's `substrate_id` field directly (read-only; returns
 * undefined when absent / unreadable). */
function readSubstrateId(configPath: string): string | undefined {
	try {
		const config = JSON.parse(fs.readFileSync(configPath, "utf-8")) as { substrate_id?: string };
		return typeof config.substrate_id === "string" && config.substrate_id.length > 0 ? config.substrate_id : undefined;
	} catch {
		return undefined;
	}
}

/**
 * Run the dupe / verify / swap upgrade for ONE substrate. Returns a structured
 * outcome; throws `UpgradeError` (carrying an exit code) on a guard / verify /
 * swap failure. NEVER calls process.exit — the CLI `main()` owns that, the demo
 * catches the throw. Diagnostics route through `console.error`.
 */
export function upgradeSubstrate(opts: UpgradeOptions): UpgradeOutcome {
	const substrateName = opts.substrate;
	const substrateAbs = path.isAbsolute(substrateName) ? substrateName : path.resolve(opts.cwd, substrateName);
	const configPath = path.join(substrateAbs, "config.json");

	// ── Guard: substrate present + has config.json ───────────────────────────────
	if (!fs.existsSync(substrateAbs) || !fs.existsSync(configPath)) {
		throw new UpgradeError(`upgrade-substrate: no config.json under ${substrateAbs} — not a substrate`, 3);
	}

	// ── Guard: idempotency — already content-addressed → no-op ────────────────────
	const existingId = readSubstrateId(configPath);
	if (existingId) {
		console.error(`upgrade-substrate: ${substrateName} already content-addressed (substrate_id=${existingId}); no-op.`);
		return { kind: "noop_already_addressed", substrateId: existingId };
	}

	// ── Guard: no pre-existing dupe sibling ───────────────────────────────────────
	// The dupe MUST be a DIRECT CHILD of cwd (see module header) — name it
	// `<substrate>-migrate` as a root-sibling of the substrate dir.
	const dupeName = `${substrateName}-migrate`;
	const dupeAbs = path.join(opts.cwd, dupeName);
	if (fs.existsSync(dupeAbs)) {
		throw new UpgradeError(
			`upgrade-substrate: ${dupeName} already exists — remove it before running (a prior interrupted run is not silently reused).`,
			3,
		);
	}

	const ctx = writerToCtx(opts.writer);

	// ── Dupe + ops on the dupe (a throw discards it; original untouched) ──────────
	fs.cpSync(substrateAbs, dupeAbs, { recursive: true });
	let report: MigrationReport;
	try {
		landIdentityFieldsForDir(dupeAbs, { ctx }); // step 3
		console.error("upgrade-substrate: landed identity-field declarations on the dupe.");
		report = migrateToContentAddressed(opts.cwd, {
			onlySubstrates: [dupeName],
			register: false,
			dryRun: opts.dryRun,
			ctx,
		}); // step 4
	} catch (err) {
		fs.rmSync(dupeAbs, { recursive: true, force: true });
		throw new UpgradeError(
			`upgrade-substrate: migration step failed on the dupe (original untouched): ${err instanceof Error ? err.message : String(err)}`,
			3,
		);
	}

	// ── Dry-run: report + discard the dupe, no swap ───────────────────────────────
	if (opts.dryRun) {
		printReport(report, opts.format);
		fs.rmSync(dupeAbs, { recursive: true, force: true });
		console.error("upgrade-substrate: DRY-RUN — dupe removed, original + pointer untouched.");
		return { kind: "dry_run", report };
	}

	// ── Verify (original pointer restored in verifyDupe's finally) ────────────────
	// verifyDupe can THROW (validateContext/buildIdIndex on corrupted-id state) before
	// it returns a verdict; its own finally restores the pointer, but the dupe would be
	// left on disk. Wrap to mirror the migrate-step pattern: a throw removes the dupe and
	// rethrows as UpgradeError, so ANY exit from the verify stage leaves no stray dupe.
	let verdict: ReturnType<typeof verifyDupe>;
	try {
		verdict = verifyDupe(opts.cwd, dupeName);
	} catch (err) {
		fs.rmSync(dupeAbs, { recursive: true, force: true });
		throw new UpgradeError(
			`upgrade-substrate: verification step threw on the dupe (original untouched): ${err instanceof Error ? err.message : String(err)}`,
			1,
		);
	}
	if (!verdict.ok) {
		fs.rmSync(dupeAbs, { recursive: true, force: true });
		console.error("upgrade-substrate: VERIFY FAILED on the dupe (original untouched). Blocking issues:");
		for (const issue of verdict.issues) console.error(`  - ${issue}`);
		throw new UpgradeError("upgrade-substrate: verification failed; dupe discarded.", 1);
	}

	// ── Swap: archive original (PRESERVE, never delete), promote dupe ─────────────
	let archivedAbs = `${substrateAbs}-archived`;
	if (fs.existsSync(archivedAbs)) {
		archivedAbs = `${substrateAbs}-archived-${Date.now()}`;
	}
	fs.renameSync(substrateAbs, archivedAbs);
	try {
		fs.renameSync(dupeAbs, substrateAbs);
	} catch (err) {
		// Roll back: restore the archived original to its live location. The rollback
		// rename can itself throw (double fault) — guard it so the failure is reported
		// as an operator-actionable message naming BOTH paths instead of a bare trace.
		// The original is never deleted in either branch: it sits at archivedAbs.
		try {
			fs.renameSync(archivedAbs, substrateAbs);
		} catch (rollbackErr) {
			throw new UpgradeError(
				`upgrade-substrate: CRITICAL — swap failed AND rollback failed. The original substrate is intact at '${archivedAbs}' but is NOT at its live path '${substrateAbs}'. MANUAL RECOVERY: move '${archivedAbs}' back to '${substrateAbs}'. Underlying: swap=${err instanceof Error ? err.message : String(err)} rollback=${rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr)}`,
				3,
			);
		}
		fs.rmSync(dupeAbs, { recursive: true, force: true });
		throw new UpgradeError(
			`upgrade-substrate: swap failed, original restored: ${err instanceof Error ? err.message : String(err)}`,
			3,
		);
	}
	console.error(
		`upgrade-substrate: SWAP OK — ${substrateName} is now content-addressed; original archived at ${archivedAbs}.`,
	);

	// ── Post-swap register: now-live substrate under its minted id ────────────────
	const liveId = readSubstrateId(path.join(substrateAbs, "config.json"));
	let registered = false;
	if (liveId) {
		registerSubstrate(opts.cwd, liveId, substrateName, [], ctx);
		registered = true;
		console.error(`upgrade-substrate: REGISTERED ${liveId} → ${substrateName}.`);
	} else {
		console.error("upgrade-substrate: post-swap — no substrate_id on the live config; skipping registry write.");
	}

	console.error(
		`upgrade-substrate: SUMMARY — swapped=true archived=${archivedAbs} registered=${registered} substrate_id=${liveId ?? "(none)"}`,
	);
	return { kind: "swapped", substrateId: liveId ?? null, archivedDir: archivedAbs, registered };
}

/** Print the migration / dry-run report to stdout in the requested format. */
function printReport(report: MigrationReport, format: "json" | "table"): void {
	if (format === "json") {
		console.log(JSON.stringify(report, null, 2));
		return;
	}
	const minted = report.substrates.reduce((n, s) => n + s.items_oid_minted, 0);
	const hashed = report.substrates.reduce((n, s) => n + s.items_hashed, 0);
	const objects = report.substrates.reduce((n, s) => n + s.objects_stored, 0);
	console.log("upgrade-substrate report:");
	console.log(`  dry_run                : ${report.dry_run}`);
	console.log(`  substrates             : ${report.substrates.length}`);
	console.log(`  items_oid_minted       : ${minted}`);
	console.log(`  items_hashed           : ${hashed}`);
	console.log(`  objects_stored         : ${objects}`);
	console.log(`  edges_rewritten        : ${report.edges_rewritten}`);
	console.log(`  cross_substrate_edges  : ${report.cross_substrate_edges}`);
	console.log(`  lens_bin_edges_preserved : ${report.lens_bin_edges_preserved}`);
	console.log(`  unresolved             : ${report.unresolved.length}`);
}

function main(): void {
	const args = parseArgs(process.argv.slice(2));
	try {
		upgradeSubstrate(args);
	} catch (err) {
		if (err instanceof UpgradeError) {
			console.error(err.message);
			process.exit(err.code);
		}
		console.error(`upgrade-substrate: unexpected failure: ${err instanceof Error ? err.message : String(err)}`);
		process.exit(3);
	}
}

// Run as a CLI only when invoked directly (not when imported by the runtime demo).
if (import.meta.url === `file://${process.argv[1]}`) {
	main();
}
