#!/usr/bin/env tsx
/**
 * Runtime demo for upgrade-substrate-content-addressed.ts.
 *
 * Self-contained, no-npm, no-LLM runtime demonstration (node:assert, runs via tsx)
 * that builds a SYNTHETIC pre-content-addressing substrate under a scratch dir in
 * `tmp/` and exercises the harness end-to-end via its exported `upgradeSubstrate`
 * run-function. It asserts, against real library invocation (not mocks):
 *
 *   1. DRY-RUN leaves everything untouched — no `.context-migrate`, no
 *      `substrate_id` on the live config, no `objects/`.
 *   2. REAL RUN — the original is archived to `.context-archived` PRISTINE (same
 *      item count + content as pre-run); the live `.context` now carries a
 *      `substrate_id`, an `objects/` dir, and items stamped with `oid` /
 *      `content_hash`; `validateContext(cwd)` is clean of blocking codes; the
 *      project-root `.pi-context-registry.json` names `.context`. The real-run
 *      fixture INCLUDES an EMPTY-NESTED-ARRAY block (a `layer-plans`-like block: a
 *      schema declaring nested id-bearing arrays `plans.layers` + `plans.migration_
 *      phases`, with EMPTY data `{"plans":[]}` — the wasc shape). Post-swap the live
 *      layer-plans schema is DE-NESTED (no nested id-bearing array) — exercising the
 *      canonicalizer's schema-surgical empty-schema sweep THROUGH the dupe/verify/swap.
 *   3. IDEMPOTENCY — re-running on the now-content-addressed substrate is the
 *      "already content-addressed" no-op.
 *   4. EMPTY-NESTED-ARRAY STANDALONE SUCCESS — a substrate whose ONLY content-bearing
 *      shape is the empty-nested-array `layer-plans` block (nested id-bearing schema +
 *      empty data) upgrades to SUCCESS: post-swap the schema is de-nested, the substrate
 *      is content-addressed (substrate_id + objects/), and validateContext is clean. This
 *      is the behavior that REPLACED the old "nested id-bearing array → migrate-stage code
 *      3" failure case: a nested id-bearing array is no longer a hard reject — the
 *      canonicalizer HANDLES it (data-bearing → promote with `promotionTargets`; empty-data
 *      → schema-surgical strip).
 *   5. FAILURE-SAFETY AT THE VERIFY GATE — a substrate whose relations.json holds a
 *      2-edge CYCLE under a non-`cycle_allowed`, non-lens relation_type. The cycle
 *      SURVIVES `canonicalizeSubstrate` (endpoint conversion rewrites the bare-string
 *      endpoints to structured same-substrate item endpoints that normalize back to the
 *      SAME refname node — `normalizeEndpoint` in context.ts keys items on `refname`, so
 *      the cycle graph is preserved), so the canonicalize step passes and the `verifyDupe`
 *      gate is the surface that rejects it: `validateContext` → `validateRelations` emits
 *      `edge_cycle_detected` (a BLOCKING_CODE). The harness aborts (UpgradeError code 1),
 *      the dupe is removed, the original `.context` is byte-unchanged, and no archive is
 *      created (the swap is never reached).
 *
 * Scratch dirs are removed on success; any failed assertion prints the failure and
 * exits non-zero (scratch left in place for inspection).
 */

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateContext } from "@davidorex/pi-context/context-sdk";
import { findNestedIdBearingArrays } from "@davidorex/pi-context/schema-write";
import {
	UpgradeError,
	type UpgradeOptions,
	type UpgradeOutcome,
	upgradeSubstrate,
} from "./upgrade-substrate-content-addressed.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");
const TMP_ROOT = path.join(REPO_ROOT, "tmp");

const WRITER = "human:davidryan@gmail.com";
const BLOCKING_CODES = new Set([
	"nested_id_bearing_array",
	"edge_endpoint_dangling",
	"edge_endpoint_unregistered",
	"edge_parent_not_in_bins",
	"edge_cycle_detected",
]);

let passCount = 0;
function pass(label: string): void {
	passCount++;
	console.log(`[runtime-demo] PASS — ${label}`);
}

/** Invoke the harness with the shared writer + the empty promotion/register defaults
 * (wasc needs neither — its nested data is empty, handled by the schema-surgical sweep).
 * The harness's `upgradeSubstrate` requires `promotionTargets` + `registerBlocks`; this
 * supplies `{}` / `[]` so every scenario call stays terse. */
function runUpgrade(over: Pick<UpgradeOptions, "cwd"> & Partial<UpgradeOptions>): UpgradeOutcome {
	return upgradeSubstrate({
		substrate: ".context",
		dryRun: false,
		writer: WRITER,
		format: "json",
		promotionTargets: {},
		registerBlocks: [],
		...over,
	});
}

/** An item-schema body for a block whose array items carry id + title + a couple
 * of author fields, and which DOES NOT declare the identity fields (oid /
 * content_hash / content_parent). Mirrors the wasc shape: $id + version present,
 * no identity declarations. */
function itemSchema(arrayKey: string, idPattern: string, title: string): Record<string, unknown> {
	const itemProps: Record<string, unknown> = {
		id: { type: "string", pattern: idPattern },
		title: { type: "string" },
		body: { type: "string" },
		created_by: { type: "string" },
		created_at: { type: "string" },
	};
	return {
		$schema: "http://json-schema.org/draft-07/schema#",
		$id: `pi-context://schemas/${arrayKey}`,
		version: "1.0.0",
		title,
		type: "object",
		required: [arrayKey],
		properties: {
			[arrayKey]: {
				type: "array",
				items: {
					type: "object",
					additionalProperties: false,
					required: ["id", "title", "created_by", "created_at"],
					properties: itemProps,
				},
			},
		},
	};
}

/** The `layer-plans`-like EMPTY-NESTED-ARRAY block schema (the wasc shape): a `plans`
 * array whose item shape declares TWO nested id-bearing arrays — `layers[].id` +
 * `migration_phases[].id` — which `findNestedIdBearingArrays` reports as `plans.layers`
 * + `plans.migration_phases`. Paired with EMPTY data `{"plans":[]}` (zero parent items),
 * so the canonicalizer's DATA-driven path never reaches the nested declarations; only the
 * schema-surgical sweep strips them. validateContext flags `nested_id_bearing_array`
 * against this schema UNTIL it is de-nested. */
function layerPlansSchema(): Record<string, unknown> {
	const idBearingItems = (idPattern: string): Record<string, unknown> => ({
		type: "array",
		items: {
			type: "object",
			additionalProperties: false,
			required: ["id"],
			properties: { id: { type: "string", pattern: idPattern }, label: { type: "string" } },
		},
	});
	return {
		$schema: "http://json-schema.org/draft-07/schema#",
		$id: "pi-context://schemas/layer-plans",
		version: "1.0.0",
		title: "Layer Plans",
		type: "object",
		required: ["plans"],
		properties: {
			plans: {
				type: "array",
				items: {
					type: "object",
					additionalProperties: false,
					required: ["id"],
					properties: {
						id: { type: "string", pattern: "^PLAN-\\d{3}$" },
						title: { type: "string" },
						layers: idBearingItems("^LAYER-\\d{3}$"),
						migration_phases: idBearingItems("^PHASE-\\d{3}$"),
					},
				},
			},
		},
	};
}

/** Build a synthetic pre-content-addressing project cwd under `tmp/`. Two block
 * kinds (`notes` populated, `tasks` empty), schemas WITHOUT identity fields, a
 * relations.json with ONE in-substrate legacy bare-string edge, a registered
 * relation_type, a `.pi-context.json` pointer (contextDir `.context`, no
 * registry), and NO objects/ + NO registry.
 *
 * Two independent injectors steer the optional shapes:
 *  - `emptyNestedBlock`: ADD a `layer-plans`-like block — a schema declaring nested
 *    id-bearing arrays (`plans.layers` + `plans.migration_phases`) with EMPTY data
 *    `{"plans":[]}` (the wasc shape). The canonicalizer's schema-surgical sweep strips
 *    the nested declarations; post-canonicalize the schema is de-nested and
 *    validateContext is clean of `nested_id_bearing_array`. (Demonstrates the empty-
 *    schema de-nest THROUGH the dupe/verify/swap.)
 *  - `cycleEdges`: relations.json carries a 2-edge cycle (NOTE-001→NOTE-002 and
 *    NOTE-002→NOTE-001) under `note_relates_to_note` (not `cycle_allowed`, not a
 *    lens → a cycle candidate). canonicalize does not reject cycles and rewrites the
 *    endpoints to structured same-substrate items that normalize back to the same
 *    refname node, so the cycle SURVIVES canonicalize; `verifyDupe`'s validateContext →
 *    validateRelations then emits `edge_cycle_detected` (a BLOCKING_CODE). The
 *    VERIFY-gate case (UpgradeError code 1). */
function buildSyntheticCwd(
	slug: string,
	opts?: { emptyNestedBlock?: boolean; cycleEdges?: boolean },
): {
	cwd: string;
	substrateAbs: string;
} {
	const stamp = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
	const cwd = path.join(TMP_ROOT, `upgrade-demo-${slug}-${stamp}`);
	const substrateAbs = path.join(cwd, ".context");
	const schemasDir = path.join(substrateAbs, "schemas");
	fs.mkdirSync(schemasDir, { recursive: true });

	const layerPlansBk = {
		canonical_id: "layer-plans",
		display_name: "Layer Plans",
		prefix: "PLAN-",
		schema_path: "schemas/layer-plans.schema.json",
		array_key: "plans",
		data_path: "layer-plans.json",
	};

	// config.json — ≥2 block_kinds (each carrying the full required set incl. prefix), NO substrate_id, one registered relation_type. Schema-valid against config.schema.json.
	const config = {
		schema_version: "1.7.0",
		root: ".context",
		block_kinds: [
			{
				canonical_id: "notes",
				display_name: "Notes",
				prefix: "NOTE-",
				schema_path: "schemas/notes.schema.json",
				array_key: "notes",
				data_path: "notes.json",
			},
			{
				canonical_id: "tasks",
				display_name: "Tasks",
				prefix: "TASK-",
				schema_path: "schemas/tasks.schema.json",
				array_key: "tasks",
				data_path: "tasks.json",
			},
			...(opts?.emptyNestedBlock ? [layerPlansBk] : []),
		],
		relation_types: [
			{
				canonical_id: "note_relates_to_note",
				display_name: "relates to",
				category: "data_flow",
				source_kinds: ["notes"],
				target_kinds: ["notes"],
			},
		],
	};
	fs.writeFileSync(path.join(substrateAbs, "config.json"), `${JSON.stringify(config, null, 2)}\n`, "utf-8");

	// schemas — NO identity-field declarations.
	fs.writeFileSync(
		path.join(schemasDir, "notes.schema.json"),
		`${JSON.stringify(itemSchema("notes", "^NOTE-\\d{3}$", "Notes"), null, 2)}\n`,
		"utf-8",
	);
	fs.writeFileSync(
		path.join(schemasDir, "tasks.schema.json"),
		`${JSON.stringify(itemSchema("tasks", "^TASK-\\d{3}$", "Tasks"), null, 2)}\n`,
		"utf-8",
	);
	if (opts?.emptyNestedBlock) {
		// The wasc shape: a nested-id-bearing schema + EMPTY data (0 parent items).
		fs.writeFileSync(
			path.join(schemasDir, "layer-plans.schema.json"),
			`${JSON.stringify(layerPlansSchema(), null, 2)}\n`,
			"utf-8",
		);
		fs.writeFileSync(
			path.join(substrateAbs, "layer-plans.json"),
			`${JSON.stringify({ plans: [] }, null, 2)}\n`,
			"utf-8",
		);
	}

	// Populated block (3 items) + empty block.
	const notes = {
		notes: [
			{
				id: "NOTE-001",
				title: "First note",
				body: "alpha",
				created_by: "human/david",
				created_at: "2026-01-01T00:00:00Z",
			},
			{
				id: "NOTE-002",
				title: "Second note",
				body: "beta",
				created_by: "human/david",
				created_at: "2026-01-02T00:00:00Z",
			},
			{
				id: "NOTE-003",
				title: "Third note",
				body: "gamma",
				created_by: "human/david",
				created_at: "2026-01-03T00:00:00Z",
			},
		],
	};
	fs.writeFileSync(path.join(substrateAbs, "notes.json"), `${JSON.stringify(notes, null, 2)}\n`, "utf-8");
	fs.writeFileSync(path.join(substrateAbs, "tasks.json"), `${JSON.stringify({ tasks: [] }, null, 2)}\n`, "utf-8");

	// relations.json — one legacy bare-string in-substrate edge (both endpoints
	// are real items, so endpoint conversion resolves them as same-substrate items).
	// When `cycleEdges` is set, add the reverse edge so the two edges form a cycle
	// (NOTE-001 → NOTE-002 → NOTE-001) under the non-cycle_allowed, non-lens
	// relation_type — caught by validateRelations as `edge_cycle_detected`.
	const relations = [
		{ parent: "NOTE-001", child: "NOTE-002", relation_type: "note_relates_to_note" },
		...(opts?.cycleEdges ? [{ parent: "NOTE-002", child: "NOTE-001", relation_type: "note_relates_to_note" }] : []),
	];
	fs.writeFileSync(path.join(substrateAbs, "relations.json"), `${JSON.stringify(relations, null, 2)}\n`, "utf-8");

	// .pi-context.json pointer (contextDir .context, no registry).
	fs.writeFileSync(
		path.join(cwd, ".pi-context.json"),
		`${JSON.stringify({ version: "1.0.0", contextDir: ".context", created_at: new Date().toISOString() }, null, 2)}\n`,
		"utf-8",
	);

	return { cwd, substrateAbs };
}

/** Read a block's item array from a substrate dir (read-only). */
function readItems(substrateAbs: string, dataFile: string, arrayKey: string): Record<string, unknown>[] {
	const raw = JSON.parse(fs.readFileSync(path.join(substrateAbs, dataFile), "utf-8")) as Record<string, unknown>;
	const arr = raw[arrayKey];
	return Array.isArray(arr) ? (arr as Record<string, unknown>[]) : [];
}

function readConfigField<T = unknown>(substrateAbs: string, field: string): T | undefined {
	const cfg = JSON.parse(fs.readFileSync(path.join(substrateAbs, "config.json"), "utf-8")) as Record<string, unknown>;
	return cfg[field] as T | undefined;
}

function blockingIssues(cwd: string): string[] {
	const result = validateContext(cwd);
	return result.issues
		.filter((i) => i.code !== undefined && BLOCKING_CODES.has(i.code))
		.map((i) => `${i.code}: ${i.message}`);
}

/** Read a schema file from a substrate dir (read-only). */
function readSchema(substrateAbs: string, schemaFile: string): Record<string, unknown> {
	return JSON.parse(fs.readFileSync(path.join(substrateAbs, "schemas", schemaFile), "utf-8")) as Record<
		string,
		unknown
	>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario A — dry-run is a pure no-op.
// ─────────────────────────────────────────────────────────────────────────────
function scenarioDryRun(): void {
	const { cwd, substrateAbs } = buildSyntheticCwd("dry");
	const dupeAbs = path.join(cwd, ".context-migrate");
	const preNotes = readItems(substrateAbs, "notes.json", "notes");

	const outcome = runUpgrade({ cwd, dryRun: true });
	assert.equal(outcome.kind, "dry_run", "dry-run outcome.kind");

	assert.ok(!fs.existsSync(dupeAbs), "dry-run leaves no .context-migrate dupe");
	assert.equal(readConfigField(substrateAbs, "substrate_id"), undefined, "dry-run leaves no substrate_id");
	assert.ok(!fs.existsSync(path.join(substrateAbs, "objects")), "dry-run creates no objects/ dir");
	const postNotes = readItems(substrateAbs, "notes.json", "notes");
	assert.deepEqual(postNotes, preNotes, "dry-run leaves notes byte-equal");
	assert.ok(
		postNotes.every((n) => n.oid === undefined && n.content_hash === undefined),
		"dry-run stamps no identity",
	);

	fs.rmSync(cwd, { recursive: true, force: true });
	pass("dry-run leaves substrate untouched (no dupe / no substrate_id / no objects / no stamping)");
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario B — real run swaps + archives pristine + content-addresses + registers.
// ─────────────────────────────────────────────────────────────────────────────
function scenarioRealRunAndIdempotency(): void {
	// The real-run fixture INCLUDES the empty-nested-array `layer-plans` block so the
	// canonicalizer's schema-surgical empty-schema de-nest is exercised THROUGH the swap.
	const { cwd, substrateAbs } = buildSyntheticCwd("real", { emptyNestedBlock: true });
	const preNotes = readItems(substrateAbs, "notes.json", "notes");
	// Pre-run: the layer-plans schema DOES declare nested id-bearing arrays.
	assert.deepEqual(
		findNestedIdBearingArrays(readSchema(substrateAbs, "layer-plans.schema.json")).sort(),
		["plans.layers", "plans.migration_phases"],
		"pre-run: layer-plans schema declares the nested id-bearing arrays",
	);

	const outcome = runUpgrade({ cwd, dryRun: false });
	assert.equal(outcome.kind, "swapped", "real-run outcome.kind");
	const swapped = outcome as Extract<UpgradeOutcome, { kind: "swapped" }>;

	// Original archived pristine.
	const archivedAbs = swapped.archivedDir;
	assert.ok(fs.existsSync(archivedAbs), "archived original dir exists");
	const archivedNotes = readItems(archivedAbs, "notes.json", "notes");
	assert.deepEqual(archivedNotes, preNotes, "archived original is pristine (same items + content)");
	assert.equal(
		(JSON.parse(fs.readFileSync(path.join(archivedAbs, "config.json"), "utf-8")) as { substrate_id?: string })
			.substrate_id,
		undefined,
		"archived original carries NO substrate_id (it predates the migration)",
	);

	// Live substrate is content-addressed.
	const liveId = readConfigField<string>(substrateAbs, "substrate_id");
	assert.ok(typeof liveId === "string" && /^sub-[0-9a-f]{16}$/.test(liveId), "live config has a substrate_id");
	assert.equal(swapped.substrateId, liveId, "outcome.substrateId matches live config");
	assert.ok(fs.existsSync(path.join(substrateAbs, "objects")), "live substrate has an objects/ dir");
	const liveNotes = readItems(substrateAbs, "notes.json", "notes");
	assert.equal(liveNotes.length, preNotes.length, "live notes preserve item count");
	assert.ok(
		liveNotes.every((n) => /^[0-9a-f]{32}$/.test(String(n.oid)) && /^[0-9a-f]{64}$/.test(String(n.content_hash))),
		"live notes carry oid + content_hash",
	);

	// Post-swap: the live layer-plans schema is DE-NESTED (the schema-surgical empty-schema
	// sweep stripped both nested id-bearing arrays); its empty data survives.
	const liveLayerPlansSchema = readSchema(substrateAbs, "layer-plans.schema.json");
	assert.deepEqual(
		findNestedIdBearingArrays(liveLayerPlansSchema),
		[],
		"post-swap: layer-plans schema de-nested (no nested id-bearing array)",
	);
	assert.deepEqual(readItems(substrateAbs, "layer-plans.json", "plans"), [], "post-swap: layer-plans data still empty");

	// validateContext clean of blocking codes (incl. no nested_id_bearing_array against
	// the de-nested layer-plans schema — the wasc bug this change fixes).
	const blocking = blockingIssues(cwd);
	assert.deepEqual(blocking, [], `validateContext clean of blocking codes (got: ${blocking.join("; ")})`);

	// Registry names .context.
	const registryPath = path.join(cwd, ".pi-context-registry.json");
	assert.ok(fs.existsSync(registryPath), "project-root .pi-context-registry.json written");
	assert.ok(swapped.registered, "outcome reports registered=true");
	const registry = JSON.parse(fs.readFileSync(registryPath, "utf-8")) as {
		substrates: Record<string, { dir: string }>;
	};
	assert.equal(registry.substrates[liveId]?.dir, ".context", "registry maps substrate_id → .context");

	pass("real run: original archived pristine, live content-addressed, validateContext clean, registry names .context");

	// Idempotency — re-run on the now-content-addressed substrate is a no-op.
	const reRun = runUpgrade({ cwd, dryRun: false });
	assert.equal(reRun.kind, "noop_already_addressed", "re-run is the already-content-addressed no-op");
	assert.equal(
		(reRun as Extract<UpgradeOutcome, { kind: "noop_already_addressed" }>).substrateId,
		liveId,
		"no-op reports the existing substrate_id",
	);
	pass("idempotency: re-run on a content-addressed substrate is a no-op");

	fs.rmSync(cwd, { recursive: true, force: true });
}

/** Snapshot a directory tree as relative-path → file bytes (recursive). */
function snapshotTree(root: string): Map<string, Buffer> {
	const out = new Map<string, Buffer>();
	(function walk(dir: string): void {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			const abs = path.join(dir, entry.name);
			if (entry.isDirectory()) walk(abs);
			else out.set(path.relative(root, abs), fs.readFileSync(abs));
		}
	})(root);
	return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario C — STANDALONE empty-nested-array → SUCCESS. A substrate whose only
// content-bearing shape is the empty-nested-array `layer-plans` block (nested
// id-bearing schema + empty data) upgrades cleanly: post-swap the schema is
// de-nested, the substrate is content-addressed, and validateContext is clean. This
// REPLACED the old "nested id-bearing array → migrate-stage code 3" FAILURE case —
// a nested id-bearing array is no longer a hard reject; the canonicalizer handles it.
// ─────────────────────────────────────────────────────────────────────────────
function scenarioEmptyNestedStandaloneSuccess(): void {
	const { cwd, substrateAbs } = buildSyntheticCwd("empty-nested", { emptyNestedBlock: true });
	assert.deepEqual(
		findNestedIdBearingArrays(readSchema(substrateAbs, "layer-plans.schema.json")).sort(),
		["plans.layers", "plans.migration_phases"],
		"pre-run: nested id-bearing arrays present",
	);

	const outcome = runUpgrade({ cwd, dryRun: false });
	assert.equal(outcome.kind, "swapped", "empty-nested standalone: upgrade succeeds (swapped, not a failure)");

	// De-nested + content-addressed + clean.
	assert.deepEqual(
		findNestedIdBearingArrays(readSchema(substrateAbs, "layer-plans.schema.json")),
		[],
		"post-swap: layer-plans schema de-nested",
	);
	const liveId = readConfigField<string>(substrateAbs, "substrate_id");
	assert.ok(typeof liveId === "string" && /^sub-[0-9a-f]{16}$/.test(liveId), "post-swap: substrate content-addressed");
	assert.ok(fs.existsSync(path.join(substrateAbs, "objects")), "post-swap: objects/ dir present");
	const blocking = blockingIssues(cwd);
	assert.deepEqual(blocking, [], `post-swap: validateContext clean of blocking codes (got: ${blocking.join("; ")})`);

	fs.rmSync(cwd, { recursive: true, force: true });
	pass(
		"standalone empty-nested-array → SUCCESS: de-nested, content-addressed, validateContext clean (no code-3 reject)",
	);
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario D — failure-safety AT THE VERIFY GATE. A relations cycle SURVIVES
// canonicalize and fails the verify gate (code 1): the harness aborts, the dupe is
// removed, the original is byte-unchanged, and no archive is created (swap never
// reached).
// ─────────────────────────────────────────────────────────────────────────────
function scenarioVerifyGateFailureSafe(): void {
	const stageLabel = "verify-gate / edge_cycle_detected";
	const expectedCode = 1;
	const { cwd, substrateAbs } = buildSyntheticCwd("fail-verify", { cycleEdges: true });
	const dupeAbs = path.join(cwd, ".context-migrate");

	// Capture the original substrate byte-for-byte (relative path → content).
	const snapshot = snapshotTree(substrateAbs);

	let threw = false;
	try {
		runUpgrade({ cwd, dryRun: false });
	} catch (err) {
		threw = true;
		assert.ok(err instanceof UpgradeError, `${stageLabel}: failure surfaces as UpgradeError`);
		assert.equal((err as UpgradeError).code, expectedCode, `${stageLabel}: aborts with exit code ${expectedCode}`);
	}
	assert.ok(threw, `${stageLabel}: harness aborts on the defect-bearing substrate`);
	assert.ok(!fs.existsSync(dupeAbs), `${stageLabel}: dupe removed after the abort`);
	assert.ok(!fs.existsSync(`${substrateAbs}-archived`), `${stageLabel}: no archive created (swap never reached)`);

	// Original byte-unchanged.
	const after = snapshotTree(substrateAbs);
	assert.equal(after.size, snapshot.size, `${stageLabel}: original file set unchanged`);
	for (const [rel, buf] of snapshot) {
		assert.ok(after.get(rel)?.equals(buf), `${stageLabel}: original file byte-unchanged: ${rel}`);
	}

	fs.rmSync(cwd, { recursive: true, force: true });
	pass(`failure-safety (${stageLabel}, code ${expectedCode}): aborts, dupe gone, original byte-unchanged, no archive`);
}

function run(): void {
	fs.mkdirSync(TMP_ROOT, { recursive: true });
	scenarioDryRun();
	scenarioRealRunAndIdempotency();
	scenarioEmptyNestedStandaloneSuccess();
	scenarioVerifyGateFailureSafe();
	console.log(`\n[runtime-demo] ✔ ALL ${passCount} assertions passed for upgrade-substrate-content-addressed.`);
}

try {
	run();
} catch (err) {
	console.error(`\n[runtime-demo] ✘ FAILED: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
	process.exit(1);
}
