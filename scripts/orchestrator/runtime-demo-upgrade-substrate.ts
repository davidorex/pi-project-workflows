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
 *      project-root `.pi-context-registry.json` names `.context`.
 *   3. IDEMPOTENCY — re-running on the now-content-addressed substrate is the
 *      "already content-addressed" no-op.
 *   4. FAILURE-SAFETY AT BOTH GUARD STAGES — two fresh synthetic substrates, each
 *      carrying a DIFFERENT canon-blocking defect that fails at a DIFFERENT stage
 *      of the dupe/verify/swap sequence. In both the harness aborts (UpgradeError),
 *      the dupe is removed, and the original `.context` is byte-unchanged + no
 *      archive is created (the swap is never reached):
 *        4a. VERIFY-gate failure (UpgradeError code 1): a substrate whose
 *            relations.json holds a 2-edge CYCLE under a non-`cycle_allowed`,
 *            non-lens relation_type. The cycle SURVIVES `migrateToContentAddressed`
 *            (endpoint conversion rewrites the bare-string endpoints to structured
 *            same-substrate item endpoints that normalize back to the SAME refname
 *            node — `normalizeEndpoint` in context.ts keys items on `refname`, so
 *            the cycle graph is preserved), so the migrate step passes and the
 *            `verifyDupe` gate is the surface that rejects it: `validateContext` →
 *            `validateRelations` emits `edge_cycle_detected` (a BLOCKING_CODE).
 *        4b. MIGRATE-stage failure (UpgradeError code 3): a substrate whose `notes`
 *            schema declares a nested id-bearing array. This is rejected BEFORE the
 *            verify gate is reached: `landIdentityFieldsForDir` (step 3) injects the
 *            identity fields and writes the schema via `writeSchemaCheckedForDir`,
 *            whose `assertNoNestedIdBearingArray` guard THROWS — the harness catches
 *            it at the migrate try/catch and re-throws UpgradeError code 3. The
 *            verify gate is never reached. (Demonstrates the migrate-stage guard +
 *            its own fail-safe rollback, distinct from the verify gate in 4a.)
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
import { UpgradeError, type UpgradeOutcome, upgradeSubstrate } from "./upgrade-substrate-content-addressed.js";

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

/** An item-schema body for a block whose array items carry id + title + a couple
 * of author fields, and which DOES NOT declare the identity fields (oid /
 * content_hash / content_parent). Mirrors the wasc shape: $id + version present,
 * no identity declarations. When `nestedIdArray` is set, the item shape ALSO
 * declares a nested array property of that name whose own items carry an `id` —
 * the depth-≥1 id-bearing array that validateContext flags as
 * `nested_id_bearing_array` (a BLOCKING_CODE the verify gate rejects). */
function itemSchema(
	arrayKey: string,
	idPattern: string,
	title: string,
	opts?: { nestedIdArray?: string },
): Record<string, unknown> {
	const itemProps: Record<string, unknown> = {
		id: { type: "string", pattern: idPattern },
		title: { type: "string" },
		body: { type: "string" },
		created_by: { type: "string" },
		created_at: { type: "string" },
	};
	if (opts?.nestedIdArray) {
		itemProps[opts.nestedIdArray] = {
			type: "array",
			items: {
				type: "object",
				additionalProperties: false,
				required: ["id"],
				properties: {
					id: { type: "string", pattern: "^SUB-\\d{3}$" },
					label: { type: "string" },
				},
			},
		};
	}
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

/** Build a synthetic pre-content-addressing project cwd under `tmp/`. Two block
 * kinds (`notes` populated, `tasks` empty), schemas WITHOUT identity fields, a
 * relations.json with ONE in-substrate legacy bare-string edge, a registered
 * relation_type, a `.pi-context.json` pointer (contextDir `.context`, no
 * registry), and NO objects/ + NO registry.
 *
 * Two independent defect injectors steer the failure-safety scenarios:
 *  - `nestedIdArray`: the `notes` schema declares a depth-≥1 id-bearing array.
 *    `landIdentityFieldsForDir`'s schema-write (step 3, BEFORE verify) calls
 *    `assertNoNestedIdBearingArray`, which THROWS — the harness re-throws
 *    UpgradeError code 3 at its migrate try/catch. The MIGRATE-stage guard case.
 *  - `cycleEdges`: relations.json carries a 2-edge cycle (NOTE-001→NOTE-002 and
 *    NOTE-002→NOTE-001) under `note_relates_to_note` (not `cycle_allowed`, not a
 *    lens → a cycle candidate). Migrate does not reject cycles and rewrites the
 *    endpoints to structured same-substrate items that normalize back to the same
 *    refname node, so the cycle SURVIVES migrate; `verifyDupe`'s validateContext →
 *    validateRelations then emits `edge_cycle_detected` (a BLOCKING_CODE). The
 *    VERIFY-gate case (UpgradeError code 1). */
function buildSyntheticCwd(
	slug: string,
	opts?: { nestedIdArray?: boolean; cycleEdges?: boolean },
): {
	cwd: string;
	substrateAbs: string;
} {
	const stamp = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
	const cwd = path.join(TMP_ROOT, `upgrade-demo-${slug}-${stamp}`);
	const substrateAbs = path.join(cwd, ".context");
	const schemasDir = path.join(substrateAbs, "schemas");
	fs.mkdirSync(schemasDir, { recursive: true });

	// config.json — ≥2 block_kinds (each carrying the full required set incl. prefix), NO substrate_id, one registered relation_type. Schema-valid against config.schema.json.
	const config = {
		schema_version: "1.0.0",
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
		`${JSON.stringify(itemSchema("notes", "^NOTE-\\d{3}$", "Notes", opts?.nestedIdArray ? { nestedIdArray: "subitems" } : undefined), null, 2)}\n`,
		"utf-8",
	);
	fs.writeFileSync(
		path.join(schemasDir, "tasks.schema.json"),
		`${JSON.stringify(itemSchema("tasks", "^TASK-\\d{3}$", "Tasks"), null, 2)}\n`,
		"utf-8",
	);

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

// ─────────────────────────────────────────────────────────────────────────────
// Scenario A — dry-run is a pure no-op.
// ─────────────────────────────────────────────────────────────────────────────
function scenarioDryRun(): void {
	const { cwd, substrateAbs } = buildSyntheticCwd("dry");
	const dupeAbs = path.join(cwd, ".context-migrate");
	const preNotes = readItems(substrateAbs, "notes.json", "notes");

	const outcome = upgradeSubstrate({ cwd, substrate: ".context", dryRun: true, writer: WRITER, format: "json" });
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
	const { cwd, substrateAbs } = buildSyntheticCwd("real");
	const preNotes = readItems(substrateAbs, "notes.json", "notes");

	const outcome = upgradeSubstrate({ cwd, substrate: ".context", dryRun: false, writer: WRITER, format: "json" });
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

	// validateContext clean of blocking codes.
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
	const reRun = upgradeSubstrate({ cwd, substrate: ".context", dryRun: false, writer: WRITER, format: "json" });
	assert.equal(reRun.kind, "noop_already_addressed", "re-run is the already-content-addressed no-op");
	assert.equal(
		(reRun as Extract<UpgradeOutcome, { kind: "noop_already_addressed" }>).substrateId,
		liveId,
		"no-op reports the existing substrate_id",
	);
	pass("idempotency: re-run on a content-addressed substrate is a no-op");

	fs.rmSync(cwd, { recursive: true, force: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario C — failure-safety: a canon-blocking defect aborts the upgrade at its
// stage with the expected exit code; the dupe is removed; the original is
// byte-unchanged; no archive is created (the swap is never reached). Run for two
// distinct defects exercising two distinct guard stages (see the module header):
//   C.verify  — relations cycle → fails the VERIFY gate (code 1).
//   C.migrate — nested id-bearing array → fails the MIGRATE step (code 3).
// ─────────────────────────────────────────────────────────────────────────────

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

/** Assert the upgrade of a defect-bearing synthetic substrate aborts at its guard
 * stage with `expectedCode`, leaving the dupe removed + the original byte-for-byte
 * intact + no archive. `defect` selects which injector `buildSyntheticCwd` applies;
 * `stageLabel` names the demonstrated stage for the PASS line. */
function assertFailureSafe(
	slug: string,
	defect: { nestedIdArray?: boolean; cycleEdges?: boolean },
	expectedCode: number,
	stageLabel: string,
): void {
	const { cwd, substrateAbs } = buildSyntheticCwd(slug, defect);
	const dupeAbs = path.join(cwd, ".context-migrate");

	// Capture the original substrate byte-for-byte (relative path → content).
	const snapshot = snapshotTree(substrateAbs);

	let threw = false;
	try {
		upgradeSubstrate({ cwd, substrate: ".context", dryRun: false, writer: WRITER, format: "json" });
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

function scenarioFailureSafety(): void {
	// C.verify — a relations cycle SURVIVES migrate and fails the verify gate (code 1).
	assertFailureSafe("fail-verify", { cycleEdges: true }, 1, "verify-gate / edge_cycle_detected");
	// C.migrate — a nested id-bearing array is rejected AT the migrate step (code 3),
	// before the verify gate is reached.
	assertFailureSafe("fail-migrate", { nestedIdArray: true }, 3, "migrate-stage / nested_id_bearing_array");
}

function run(): void {
	fs.mkdirSync(TMP_ROOT, { recursive: true });
	scenarioDryRun();
	scenarioRealRunAndIdempotency();
	scenarioFailureSafety();
	console.log(`\n[runtime-demo] ✔ ALL ${passCount} assertions passed for upgrade-substrate-content-addressed.`);
}

try {
	run();
} catch (err) {
	console.error(`\n[runtime-demo] ✘ FAILED: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
	process.exit(1);
}
