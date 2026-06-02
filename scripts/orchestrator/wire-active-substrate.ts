#!/usr/bin/env tsx
/**
 * wire-active-substrate — Claude-Code-side orchestrator for the Cycle-10
 * active-substrate wiring (content-addressed substrate identity arc).
 *
 * Wires the active substrate so its cross-substrate `project:<refname>` edges
 * resolve into the FROZEN archive `.project` (read-only) via the
 * project-root registry + the registry-fallback path in migrateToContentAddressed.
 *
 * Per the dual-surface discipline (CLAUDE.md): this is the Claude-Code-side
 * parallel; in-pi harness-confined agents reach the same library
 * (migrateToContentAddressed / registerSubstrate / writeSchemaCheckedForDir)
 * through Pi-registered tools. The script owns NO npm + NO git.
 *
 * Steps:
 *   A (always): register the `.project` archive in the project-root
 *      registry under alias `project` (project-root metadata, not substrate data
 *      — safe in dry-run too; it is the precondition the foreign resolution reads).
 *   B (always): run migrateToContentAddressed scoped to the active substrate
 *      (`onlySubstrates: [activeDir]`), honoring `--dry-run`. Print the report.
 *   C (apply only; skipped under --dry-run): de-nest the active `layer-plans`
 *      schema — replace it with a body whose `$id` is re-anchored to the active
 *      substrate_id (the de-nested form carried as a const literal below).
 *
 * Usage:
 *   tsx scripts/orchestrator/wire-active-substrate.ts [--dry-run] [--cwd <dir>]
 */
import fs from "node:fs";
import path from "node:path";
import { registerSubstrate } from "@davidorex/pi-context/context-registry";
import { migrateToContentAddressed } from "@davidorex/pi-context/migrate-content-addressed";
import { writeSchemaCheckedForDir } from "@davidorex/pi-context/schema-write";

/**
 * The de-nested `layer-plans` schema body for the ACTIVE substrate.
 *
 * This is the EXACT body of `.project/schemas/layer-plans.schema.json`
 * (the frozen archive's de-nested layer-plans schema) with its `$id` re-anchored
 * to the active substrate_id `sub-2668a102413f6aea`. Carried as a const literal
 * so the apply step does not read the frozen archive at runtime.
 */
const DENESTED_LAYER_PLANS_SCHEMA = {
	$schema: "http://json-schema.org/draft-07/schema#",
	$id: "pi-context://schemas/sub-2668a102413f6aea/layer-plans",
	version: "1.0.0",
	title: "layer-plans",
	type: "object",
	required: ["plans"],
	properties: {
		plans: {
			type: "array",
			items: {
				type: "object",
				required: ["id"],
				additionalProperties: false,
				properties: {
					id: {
						type: "string",
						pattern: "^PLAN-\\d{3}$",
					},
					title: {
						type: "string",
					},
					status: {
						type: "string",
					},
					model: {
						type: "string",
					},
					description: {
						type: "string",
					},
					related_gaps: {
						type: "array",
					},
					related_features: {
						type: "array",
					},
					related_decisions: {
						type: "array",
					},
					created_by: {
						type: "string",
					},
					created_at: {
						type: "string",
					},
					oid: {
						type: "string",
						pattern: "^[0-9a-f]{32}$",
						description:
							"Content-independent substrate-stable item identity (content-addressed substrate identity, Cycle 3). Minted once at item birth via mintOid(substrate_id); immutable across content versions. Optional in the schema so pre-Cycle-3 items validate; stamped on next write.",
					},
					content_hash: {
						type: "string",
						pattern: "^[0-9a-f]{64}$",
						description:
							"SHA-256 (hex) of the RFC-8785-canonical content projection of this item (metadata fields excluded). Recomputed on every stamping write; moves with content, stable across metadata-only churn.",
					},
					content_parent: {
						type: "string",
						pattern: "^[0-9a-f]{64}$",
						description:
							"content_hash of the immediately-prior version of this item; set on a content-changing update, absent on the first (v1) version. Forms the per-item content version chain.",
					},
				},
			},
		},
	},
};

interface Args {
	cwd: string;
	dryRun: boolean;
}

function parseArgs(argv: string[]): Args {
	const out: Args = { cwd: process.cwd(), dryRun: false };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--dry-run") {
			out.dryRun = true;
		} else if (a === "--cwd" && argv[i + 1]) {
			out.cwd = argv[i + 1];
			i++;
		} else {
			console.error(`Unknown argument: ${a}`);
			process.exit(2);
		}
	}
	return out;
}

/** Read the active contextDir basename from `<cwd>/.pi-context.json`. Exits 3 when absent/unreadable. */
function readActiveDir(cwd: string): string {
	const p = path.join(cwd, ".pi-context.json");
	if (!fs.existsSync(p)) {
		console.error(`wire-active-substrate: no .pi-context.json under ${cwd} — no active substrate pointer`);
		process.exit(3);
	}
	try {
		const data = JSON.parse(fs.readFileSync(p, "utf-8")) as Record<string, unknown>;
		const dir = data.contextDir;
		if (typeof dir !== "string" || dir.length === 0) {
			console.error(`wire-active-substrate: .pi-context.json has no contextDir string`);
			process.exit(3);
		}
		return dir;
	} catch (err) {
		console.error(
			`wire-active-substrate: cannot read .pi-context.json: ${err instanceof Error ? err.message : String(err)}`,
		);
		process.exit(3);
	}
}

/** Read the `.project` archive substrate_id from its config.json. Exits 3 when absent/unreadable. */
function readMigrateSid(cwd: string): string {
	const p = path.join(cwd, ".project", "config.json");
	if (!fs.existsSync(p)) {
		console.error(`wire-active-substrate: no .project/config.json under ${cwd}`);
		process.exit(3);
	}
	try {
		const data = JSON.parse(fs.readFileSync(p, "utf-8")) as Record<string, unknown>;
		const sid = data.substrate_id;
		if (typeof sid !== "string" || sid.length === 0) {
			console.error(`wire-active-substrate: .project/config.json has no substrate_id`);
			process.exit(3);
		}
		return sid;
	} catch (err) {
		console.error(
			`wire-active-substrate: cannot read .project/config.json: ${err instanceof Error ? err.message : String(err)}`,
		);
		process.exit(3);
	}
}

function main(): void {
	const args = parseArgs(process.argv.slice(2));
	const activeDir = readActiveDir(args.cwd);
	const migrateSid = readMigrateSid(args.cwd);

	// ── Step A: register the frozen archive under alias `project` (both modes) ──
	// Project-root registry metadata (not substrate data) — the precondition the
	// registry-fallback foreign resolution reads. Safe to run under --dry-run.
	registerSubstrate(args.cwd, migrateSid, ".project", ["project"]);
	console.log(`registered .project (${migrateSid}) under alias 'project' in the project-root registry`);

	// ── Step B: scoped migration (active substrate only), report printed ────────
	const report = migrateToContentAddressed(args.cwd, { onlySubstrates: [activeDir], dryRun: args.dryRun });
	console.log(JSON.stringify(report, null, 2));

	// ── Step C: de-nest the active layer-plans schema (apply only) ──────────────
	if (args.dryRun) {
		console.log("--dry-run: skipping layer-plans de-nest (step C)");
		return;
	}
	const activeAbs = path.resolve(args.cwd, activeDir);
	writeSchemaCheckedForDir(activeAbs, "layer-plans", DENESTED_LAYER_PLANS_SCHEMA, "replace");
	console.log(`de-nested layer-plans schema in ${activeDir} ($id re-anchored to the active substrate_id)`);
}

main();
