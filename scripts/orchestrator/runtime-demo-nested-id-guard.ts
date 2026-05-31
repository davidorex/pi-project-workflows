/**
 * Runtime demo (Cycle 9.2 — nested id-bearing array guard):
 *
 * A nested id-bearing array is an id-bearing item embedded inside another item's
 * array — a relationship-as-embedding that should be a top-level entity joined
 * by a closure-table membership edge. This cycle (a) REJECTS a new schema
 * declaring one at the canonical writeSchema / writeSchemaChecked surface, and
 * (b) REPORTS any already-installed carrier as a non-fatal validateContext
 * warning. This demo exercises both ends against scratch substrates.
 *
 * Demonstrates:
 *   (1) writeSchema with a nested id-bearing schema THROWS, naming the path;
 *   (2) writeSchema with a nested NON-id array PASSES;
 *   (3) writeSchema with a depth-0 (top-level) id array PASSES;
 *   (4) writeSchemaChecked({dryRun:true}) with a nested id-bearing schema THROWS;
 *   (5) a scratch substrate carrying a layer-plans-shaped schema → validateContext
 *       emits a `nested_id_bearing_array` WARNING (not error) and status is not
 *       flipped to "invalid" by it alone;
 *   (6) installing that carrier (emulated via fs copy, as installContext does)
 *       does NOT throw — the grandfathered carrier still lands.
 *
 * Pure library invocation (no npm, no LLM call, no pi subprocess) against the
 * canonical schema-write / context-sdk surface. Console PASS markers;
 * process.exit(1) on the first failed assertion.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { writeBootstrapPointer } from "@davidorex/pi-context/context-dir";
import { validateContext } from "@davidorex/pi-context/context-sdk";
import { writeSchema, writeSchemaChecked } from "@davidorex/pi-context/schema-write";

function fail(msg: string): never {
	console.error(`[runtime-demo] FAIL: ${msg}`);
	process.exit(1);
}
function pass(msg: string): void {
	console.log(`[runtime-demo] ✔ ${msg}`);
}

/** Scratch cwd: a `.pi-context.json` pointer at `.project` + the `.project/` dir,
 * matching the schema-write / context-sdk test fixtures. writeSchema mkdir's the
 * nested `schemas/` dir itself. */
function makeCwd(prefix: string): string {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), `nested-id-guard-${prefix}-`));
	writeBootstrapPointer(cwd, ".project");
	fs.mkdirSync(path.join(cwd, ".project"), { recursive: true });
	return cwd;
}

// Layer-plans-shaped carrier: top-level `plans[]` whose items embed two
// id-bearing arrays (layers, migration_phases) → two forbidden nested paths.
const carrierSchema: Record<string, unknown> = {
	type: "object",
	properties: {
		plans: {
			type: "array",
			items: {
				type: "object",
				properties: {
					id: { type: "string" },
					layers: {
						type: "array",
						items: { type: "object", properties: { id: { type: "string" }, name: { type: "string" } } },
					},
					migration_phases: {
						type: "array",
						items: { type: "object", properties: { id: { type: "string" }, name: { type: "string" } } },
					},
				},
			},
		},
	},
};

// Nested NON-id array: outer items embed a `tags` array whose items carry no id.
const nestedNonIdSchema: Record<string, unknown> = {
	type: "object",
	properties: {
		plans: {
			type: "array",
			items: {
				type: "object",
				properties: {
					id: { type: "string" },
					tags: { type: "array", items: { type: "object", properties: { name: { type: "string" } } } },
				},
			},
		},
	},
};

// Depth-0 (top-level) id array — the normal block-item shape; must pass.
const topLevelIdArraySchema: Record<string, unknown> = {
	type: "object",
	properties: {
		items: {
			type: "array",
			items: { type: "object", properties: { id: { type: "string" }, title: { type: "string" } } },
		},
	},
};

// ── (1) writeSchema rejects a nested id-bearing schema, naming the path ──────
{
	const cwd = makeCwd("reject");
	let caught: Error | undefined;
	try {
		writeSchema(cwd, "carrier", carrierSchema);
	} catch (err) {
		caught = err as Error;
	}
	if (!caught) fail("(1) expected writeSchema to throw on a nested id-bearing schema");
	if (!/nested id-bearing arrays are forbidden/.test(caught.message))
		fail(`(1) throw message missing the forbidden-class label: ${caught.message}`);
	if (!/plans\.layers/.test(caught.message) || !/plans\.migration_phases/.test(caught.message))
		fail(`(1) throw message did not name both offending paths: ${caught.message}`);
	if (fs.existsSync(path.join(cwd, ".project", "schemas", "carrier.schema.json")))
		fail("(1) rejected schema was nonetheless written to disk");
	fs.rmSync(cwd, { recursive: true, force: true });
	pass(
		"(1) writeSchema THROWS on nested id-bearing schema, naming plans.layers + plans.migration_phases; file unwritten",
	);
}

// ── (2) writeSchema accepts a nested NON-id array ────────────────────────────
{
	const cwd = makeCwd("nonid");
	writeSchema(cwd, "ok-nonid", nestedNonIdSchema);
	if (!fs.existsSync(path.join(cwd, ".project", "schemas", "ok-nonid.schema.json")))
		fail("(2) nested NON-id schema was not written");
	fs.rmSync(cwd, { recursive: true, force: true });
	pass("(2) writeSchema PASSES a nested NON-id array");
}

// ── (3) writeSchema accepts a depth-0 (top-level) id array ───────────────────
{
	const cwd = makeCwd("toplevel");
	writeSchema(cwd, "ok-toplevel", topLevelIdArraySchema);
	if (!fs.existsSync(path.join(cwd, ".project", "schemas", "ok-toplevel.schema.json")))
		fail("(3) top-level-id-array schema was not written");
	fs.rmSync(cwd, { recursive: true, force: true });
	pass("(3) writeSchema PASSES a depth-0 (top-level) id array");
}

// ── (4) writeSchemaChecked({dryRun:true}) rejects a nested id-bearing schema ─
{
	const cwd = makeCwd("dryrun");
	let caught: Error | undefined;
	try {
		writeSchemaChecked(cwd, "carrier", carrierSchema, "create", undefined, { dryRun: true });
	} catch (err) {
		caught = err as Error;
	}
	if (!caught) fail("(4) expected writeSchemaChecked dry-run to throw on a nested id-bearing schema");
	if (!/nested id-bearing arrays are forbidden/.test(caught.message))
		fail(`(4) dry-run throw message missing the forbidden-class label: ${caught.message}`);
	if (fs.existsSync(path.join(cwd, ".project", "schemas", "carrier.schema.json")))
		fail("(4) dry-run wrote the schema to disk");
	fs.rmSync(cwd, { recursive: true, force: true });
	pass("(4) writeSchemaChecked({dryRun:true}) THROWS on a nested id-bearing schema; nothing written");
}

// ── (5) validateContext emits a non-fatal warning for an installed carrier ───
{
	const cwd = makeCwd("validate");
	// Seed the carrier via fs (bypassing the writeSchema guard, as a pre-existing
	// installed carrier would be on disk) so validateContext can observe it.
	const schemasDir = path.join(cwd, ".project", "schemas");
	fs.mkdirSync(schemasDir, { recursive: true });
	fs.writeFileSync(path.join(schemasDir, "layer-plans.schema.json"), JSON.stringify(carrierSchema, null, 2));

	const result = validateContext(cwd);
	const warns = result.issues.filter((i) => i.code === "nested_id_bearing_array");
	if (warns.length !== 2) fail(`(5) expected 2 nested_id_bearing_array warnings, got ${warns.length}`);
	if (!warns.every((w) => w.severity === "warning")) fail("(5) a nested-id issue was not severity 'warning'");
	if (!warns.every((w) => w.block === "layer-plans")) fail("(5) a nested-id issue did not name block 'layer-plans'");
	const fields = warns.map((w) => w.field).sort();
	if (fields[0] !== "plans.layers" || fields[1] !== "plans.migration_phases")
		fail(`(5) unexpected offending fields: ${JSON.stringify(fields)}`);
	if (result.status === "invalid") fail("(5) the nested-id warning flipped status to 'invalid' (must be non-fatal)");
	if (result.status !== "warnings") fail(`(5) expected status 'warnings', got '${result.status}'`);
	fs.rmSync(cwd, { recursive: true, force: true });
	pass("(5) validateContext emits 2 non-fatal nested_id_bearing_array WARNINGS; status 'warnings' (not 'invalid')");
}

// ── (6) installing the carrier (fs copy) does not throw ──────────────────────
{
	const cwd = makeCwd("install");
	const schemasDir = path.join(cwd, ".project", "schemas");
	fs.mkdirSync(schemasDir, { recursive: true });
	const dest = path.join(schemasDir, "layer-plans.schema.json");
	// installContext copies catalog schemas via fs.copyFile (not writeSchema); emulate
	// that copy here and confirm it does not engage the writeSchema guard.
	let threw = false;
	try {
		fs.writeFileSync(dest, JSON.stringify(carrierSchema, null, 2));
	} catch {
		threw = true;
	}
	if (threw) fail("(6) fs-copy install of the carrier threw");
	if (!fs.existsSync(dest)) fail("(6) carrier not present after install");
	fs.rmSync(cwd, { recursive: true, force: true });
	pass("(6) installing the carrier via fs copy does NOT throw (grandfathered carrier still lands)");
}

console.log(`\n[runtime-demo] ✔ writeSchema / writeSchemaChecked reject NEW nested id-bearing schemas`);
console.log(`[runtime-demo] ✔ nested NON-id arrays + depth-0 id arrays remain accepted`);
console.log(`[runtime-demo] ✔ validateContext reports an installed carrier as a non-fatal warning`);
console.log(`[runtime-demo] ✔ install (fs copy) of the grandfathered carrier is unaffected`);
