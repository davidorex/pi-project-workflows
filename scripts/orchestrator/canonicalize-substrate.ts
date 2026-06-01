#!/usr/bin/env tsx
/**
 * canonicalize-substrate — Claude-Code-side orchestrator for the Cycle-10
 * substrate canonicalizer (`canonicalizeSubstrate`) PLUS the triple-buffer
 * (dupe / verify / swap) that de-risks the one-shot transform.
 *
 * Per DEC-0019/0020 dual-surface discipline: in-pi harness-confined agents reach
 * the canonicalizer through the Pi tool `canonicalize-substrate` (registered in
 * pi-context/index.ts), which canonicalizes the ACTIVE substrate in place; this
 * script is the Claude-Code-side parallel and additionally owns the triple-buffer
 * — the Pi tool intentionally does NOT (a sandboxed workflow has no
 * dupe-rename-swap surface).
 *
 * Triple-buffer (real run):
 *   1. dupe   — `fs.cpSync(substrate, workDir, {recursive:true})` to a stamped
 *               sibling (default under `<cwd>/tmp/` so it is gitignored).
 *   2. run    — `canonicalizeSubstrate(workDir)` mutates ONLY the dupe.
 *   3. verify — pointer-switch the cwd to the dupe (`writeBootstrapPointer`),
 *               `validateContext`, assert 0 `nested_id_bearing_array` + no
 *               dangling/unregistered edges, then RESTORE the original pointer in
 *               a `finally`.
 *   4. swap   — on verify pass + not `--no-swap`: atomic rename
 *               (substrate→`.bak-<stamp>`, workDir→substrate, rm `.bak`).
 *               On verify fail: `rmSync(workDir)`, original untouched, exit ≠ 0.
 *
 * `--dry-run` prints the CanonicalizeReport against the LIVE substrate (zero
 * writes) and exits 0 — no dupe, no swap.
 *
 * Usage:
 *   tsx scripts/orchestrator/canonicalize-substrate.ts --substrate <dir> [--cwd <dir>] [--dry-run] [--no-swap]
 */
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
	canonicalizeSubstrate,
	type PromotionTargets,
	type RegisterBlock,
} from "@davidorex/pi-context/canonicalize-substrate";
import { writeBootstrapPointer } from "@davidorex/pi-context/context-dir";
import { validateContext } from "@davidorex/pi-context/context-sdk";

/**
 * The EXPLICIT promotion-target mapping for the real `.project-migrate` substrate.
 * Per the binding ledger (commit 7228879) these names are operator-authored, NEVER
 * algorithmically derived/singularized/truncated. Keys are the dotted nested-array
 * paths the canonicalizer reports (`<parentBlockKind>.<nestedArrayKey>`).
 *
 *  - `features.stories`  → NEW `feature-story` block, ids `FSTORY-NNN`. (NOT a reuse of the
 *    vestigial top-level `story` block: that block's schema is a narrower, divergent shape
 *    (additionalProperties:false; no depends_on/gates/tasks), so the richer nested story
 *    cannot validate against it. Synthesizing a block whose schema matches the actual nested
 *    shape is faithful + lossless; the empty `story` block is left as a vestigial artifact.)
 *  - `feature-story.tasks` → NEW `story-task` block, ids `STORY-TASK-NNNN`. (Path is
 *    `feature-story.tasks` because the stories now live in the `feature-story` block.)
 *  - `layer-plans.layers`           → NEW `plan-layer` block, ids `PLAN-LAYER-NNN`.
 *  - `layer-plans.migration_phases` → NEW `plan-phase` block, ids `PLAN-PHASE-NNN`.
 */
const PROJECT_MIGRATE_TARGETS: PromotionTargets = {
	"features.stories": {
		blockKind: "feature-story",
		prefix: "FSTORY-",
		idPattern: "^FSTORY-\\d{3}$",
		relationType: "feature_contains_story",
	},
	"feature-story.tasks": {
		blockKind: "story-task",
		prefix: "STORY-TASK-",
		idPattern: "^STORY-TASK-\\d{4}$",
		relationType: "story_contains_task",
	},
	"layer-plans.layers": {
		blockKind: "plan-layer",
		prefix: "PLAN-LAYER-",
		idPattern: "^PLAN-LAYER-\\d{3}$",
		relationType: "plan_contains_layer",
	},
	"layer-plans.migration_phases": {
		blockKind: "plan-phase",
		prefix: "PLAN-PHASE-",
		idPattern: "^PLAN-PHASE-\\d{3}$",
		relationType: "plan_contains_phase",
	},
};

/**
 * EXPLICIT orphan-block registration directives for the real `.project-migrate`
 * substrate. `conventions` is a content-bearing block — a `rules` array (16 items,
 * slug ids `esm`/`tsc-build`/… with NO prefix+number pattern) PLUS singleton fields
 * (`test_conventions`/`lint_command`/`lint_scope`) — that is NOT a registered
 * block_kind, so the backfill pass never reaches it. Its schema
 * (`schemas/conventions.schema.json`) is ALREADY CLEAN (it models the array + the
 * singletons correctly); it only lacks the 3 identity fields on the `rules` item +
 * the block_kind registration. This directive registers it + injects identity +
 * lets the existing backfill content-address the 16 rules (slug ids kept verbatim).
 * `prefix` is "" — the rules carry slug ids, not minted prefix+number ids.
 */
const PROJECT_MIGRATE_REGISTER_BLOCKS: RegisterBlock[] = [
	{
		canonical_id: "conventions",
		array_key: "rules",
		prefix: "",
		schema_path: "schemas/conventions.schema.json",
		data_path: "conventions.json",
	},
];

interface Args {
	substrate: string;
	cwd: string;
	dryRun: boolean;
	noSwap: boolean;
}

function parseArgs(argv: string[]): Args {
	const out: Args = { substrate: "", cwd: process.cwd(), dryRun: false, noSwap: false };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--substrate" && argv[i + 1]) {
			out.substrate = argv[i + 1];
			i++;
		} else if (a === "--cwd" && argv[i + 1]) {
			out.cwd = argv[i + 1];
			i++;
		} else if (a === "--dry-run") {
			out.dryRun = true;
		} else if (a === "--no-swap") {
			out.noSwap = true;
		} else {
			console.error(`Unknown argument: ${a}`);
			process.exit(2);
		}
	}
	if (!out.substrate) {
		console.error("canonicalize-substrate: --substrate <dir> is required");
		process.exit(2);
	}
	return out;
}

/** Read the active contextDir from `<cwd>/.pi-context.json` (basename string),
 * or null when no pointer exists — restored in the verify finally. */
function readActivePointer(cwd: string): string | null {
	const p = path.join(cwd, ".pi-context.json");
	if (!fs.existsSync(p)) return null;
	try {
		const data = JSON.parse(fs.readFileSync(p, "utf-8")) as Record<string, unknown>;
		return typeof data.contextDir === "string" ? (data.contextDir as string) : null;
	} catch {
		return null;
	}
}

/** Verify a canonicalized work-dupe via a pointer-switch + validateContext.
 * Restores the original pointer in a finally regardless of outcome. Returns the
 * blocking issue list (empty ⇒ clean). */
function verifyDupe(cwd: string, workDirRel: string): { ok: boolean; issues: string[] } {
	const original = readActivePointer(cwd);
	try {
		writeBootstrapPointer(cwd, workDirRel);
		const result = validateContext(cwd);
		// Canonicalization correctness = NO nested id-bearing array remains AND no
		// edge endpoint is dangling/unregistered. Registry-level issues
		// (substrate_id_unregistered / substrate_id_registry_mismatch) are EXPECTED
		// for an unregistered work-dupe — the canonicalizer operates on a single dir
		// in isolation and does not touch the project-root registry; those are not
		// canonicalization defects and are intentionally NOT blocking here.
		const BLOCKING_CODES = new Set([
			"nested_id_bearing_array",
			"edge_endpoint_dangling",
			"edge_endpoint_unregistered",
			"edge_parent_not_in_bins",
			"edge_cycle_detected",
		]);
		const blocking = result.issues.filter((i) => i.code !== undefined && BLOCKING_CODES.has(i.code));
		const issues = blocking.map((i) => `${i.code}: ${i.message}`);
		return { ok: issues.length === 0, issues };
	} finally {
		if (original !== null) {
			writeBootstrapPointer(cwd, original);
		}
	}
}

function main(): void {
	const args = parseArgs(process.argv.slice(2));
	const substrateAbs = path.isAbsolute(args.substrate) ? args.substrate : path.resolve(args.cwd, args.substrate);

	if (!fs.existsSync(path.join(substrateAbs, "config.json"))) {
		console.error(`canonicalize-substrate: no config.json under ${substrateAbs} — not a substrate`);
		process.exit(3);
	}

	// ── Dry run: report against the live substrate, zero writes ────────────────
	if (args.dryRun) {
		let report: ReturnType<typeof canonicalizeSubstrate>;
		try {
			report = canonicalizeSubstrate(substrateAbs, {
				dryRun: true,
				promotionTargets: PROJECT_MIGRATE_TARGETS,
				registerBlocks: PROJECT_MIGRATE_REGISTER_BLOCKS,
			});
		} catch (err) {
			console.error(`canonicalize-substrate: ${err instanceof Error ? err.message : String(err)}`);
			process.exit(3);
		}
		console.log(JSON.stringify(report, null, 2));
		return;
	}

	// ── Real run: dupe → canonicalize → verify → (swap | discard) ──────────────
	const stamp = `${Date.now()}-${randomUUID().slice(0, 8)}`;
	const tmpRoot = path.join(args.cwd, "tmp");
	fs.mkdirSync(tmpRoot, { recursive: true });
	const workDir = path.join(tmpRoot, `canonicalize-work-${stamp}`);

	fs.cpSync(substrateAbs, workDir, { recursive: true });

	let report: ReturnType<typeof canonicalizeSubstrate>;
	try {
		report = canonicalizeSubstrate(workDir, {
			promotionTargets: PROJECT_MIGRATE_TARGETS,
			registerBlocks: PROJECT_MIGRATE_REGISTER_BLOCKS,
		});
	} catch (err) {
		fs.rmSync(workDir, { recursive: true, force: true });
		console.error(
			`canonicalize-substrate: transform failed on the dupe (original untouched): ${err instanceof Error ? err.message : String(err)}`,
		);
		process.exit(3);
	}
	console.log(JSON.stringify(report, null, 2));

	// Verify the dupe by pointer-switch (original pointer restored in finally).
	const workDirRel = path.relative(args.cwd, workDir);
	const verdict = verifyDupe(args.cwd, workDirRel);
	if (!verdict.ok) {
		fs.rmSync(workDir, { recursive: true, force: true });
		console.error(`canonicalize-substrate: VERIFY FAILED on the dupe (original untouched). Blocking issues:`);
		for (const issue of verdict.issues) console.error(`  - ${issue}`);
		process.exit(1);
	}

	if (args.noSwap) {
		console.error(
			`canonicalize-substrate: VERIFY OK. --no-swap → leaving canonical dupe at ${workDir} (original untouched).`,
		);
		return;
	}

	// Atomic swap: substrate → .bak-<stamp>, workDir → substrate, rm .bak.
	const bak = `${substrateAbs}.bak-${stamp}`;
	fs.renameSync(substrateAbs, bak);
	try {
		fs.renameSync(workDir, substrateAbs);
	} catch (err) {
		// Roll back: restore the original from .bak.
		fs.renameSync(bak, substrateAbs);
		console.error(
			`canonicalize-substrate: swap failed, original restored: ${err instanceof Error ? err.message : String(err)}`,
		);
		process.exit(3);
	}
	fs.rmSync(bak, { recursive: true, force: true });
	console.error(`canonicalize-substrate: SWAP OK — ${substrateAbs} is now canonical.`);
}

main();
