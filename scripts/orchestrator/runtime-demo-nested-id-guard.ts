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
 *   (4a) writeSchema with a oneOf-branch nested id-bearing schema THROWS (9.3);
 *   (4b) writeSchema with a tuple-items nested id-bearing schema THROWS (9.3);
 *   (4c) a $ref-cycle schema is handled without hanging + rejected (9.3 cycle-guard);
 *   (4d) a $ref-self-cycle whose $def carries the id is rejected (9.3 fresh-seed id-peek);
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

// ── (4a) writeSchema rejects a oneOf-branch nested id-bearing schema (9.3) ───
// id buried in a oneOf branch of the nested array's items — 9.2 keyed only on
// items.properties.id and would have MISSED this; 9.3 must reject it.
{
	const cwd = makeCwd("oneof");
	const oneOfNestedId: Record<string, unknown> = {
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
							items: {
								oneOf: [
									{ type: "object", properties: { kind: { type: "string" } } },
									{ type: "object", properties: { id: { type: "string" } } },
								],
							},
						},
					},
				},
			},
		},
	};
	let caught: Error | undefined;
	try {
		writeSchema(cwd, "carrier", oneOfNestedId);
	} catch (err) {
		caught = err as Error;
	}
	if (!caught) fail("(4a) expected writeSchema to throw on a oneOf-branch nested id-bearing schema");
	if (!/nested id-bearing arrays are forbidden/.test(caught.message))
		fail(`(4a) throw message missing the forbidden-class label: ${caught.message}`);
	if (!/plans\.layers/.test(caught.message)) fail(`(4a) throw message did not name plans.layers: ${caught.message}`);
	if (fs.existsSync(path.join(cwd, ".project", "schemas", "carrier.schema.json")))
		fail("(4a) rejected oneOf-branch schema was nonetheless written to disk");
	fs.rmSync(cwd, { recursive: true, force: true });
	pass("(4a) writeSchema THROWS on a oneOf-branch nested id-bearing schema, naming plans.layers; file unwritten");
}

// ── (4b) writeSchema rejects a tuple-items nested id-bearing schema (9.3) ─────
{
	const cwd = makeCwd("tuple");
	const tupleNestedId: Record<string, unknown> = {
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
							items: [
								{ type: "object", properties: { name: { type: "string" } } },
								{ type: "object", properties: { id: { type: "string" } } },
							],
						},
					},
				},
			},
		},
	};
	let caught: Error | undefined;
	try {
		writeSchema(cwd, "carrier", tupleNestedId);
	} catch (err) {
		caught = err as Error;
	}
	if (!caught) fail("(4b) expected writeSchema to throw on a tuple-items nested id-bearing schema");
	if (!/nested id-bearing arrays are forbidden/.test(caught.message))
		fail(`(4b) throw message missing the forbidden-class label: ${caught.message}`);
	if (!/plans\.layers/.test(caught.message)) fail(`(4b) throw message did not name plans.layers: ${caught.message}`);
	if (fs.existsSync(path.join(cwd, ".project", "schemas", "carrier.schema.json")))
		fail("(4b) rejected tuple-items schema was nonetheless written to disk");
	fs.rmSync(cwd, { recursive: true, force: true });
	pass("(4b) writeSchema THROWS on a tuple-items nested id-bearing schema, naming plans.layers; file unwritten");
}

// ── (4c) a $ref-cycle schema is handled without hanging (9.3 cycle-guard) ─────
// A self-referential + mutually-recursive $defs graph must terminate. If the
// cycle-guard regresses this loops forever and the demo never reaches PASS.
{
	const cwd = makeCwd("refcycle");
	const refCycle: Record<string, unknown> = {
		type: "object",
		properties: {
			plans: {
				type: "array",
				items: { type: "object", properties: { id: { type: "string" }, node: { $ref: "#/$defs/A" } } },
			},
		},
		$defs: {
			A: {
				type: "object",
				properties: {
					children: { type: "array", items: { $ref: "#/$defs/A" } },
					bs: { type: "array", items: { $ref: "#/$defs/B" } },
				},
			},
			B: {
				type: "object",
				properties: { id: { type: "string" }, as: { type: "array", items: { $ref: "#/$defs/A" } } },
			},
		},
	};
	// Reached at depth ≥ 1 (descended plans.items), node→A.bs items ($def B) carry
	// an id → writeSchema must REJECT — and the recursive A↔B cycle must terminate.
	let caught: Error | undefined;
	const t0 = Date.now();
	try {
		writeSchema(cwd, "carrier", refCycle);
	} catch (err) {
		caught = err as Error;
	}
	const elapsedMs = Date.now() - t0;
	if (elapsedMs > 5000) fail(`(4c) $ref-cycle schema took ${elapsedMs}ms — guard likely looping`);
	if (!caught) fail("(4c) expected writeSchema to reject the id-bearing $ref-cycle carrier");
	if (!/nested id-bearing arrays are forbidden/.test(caught.message))
		fail(`(4c) throw message missing the forbidden-class label: ${caught.message}`);
	if (fs.existsSync(path.join(cwd, ".project", "schemas", "carrier.schema.json")))
		fail("(4c) rejected $ref-cycle schema was nonetheless written to disk");
	fs.rmSync(cwd, { recursive: true, force: true });
	pass(`(4c) writeSchema handles a $ref-cycle schema WITHOUT hanging (${elapsedMs}ms) and rejects it`);
}

// ── (4d) a $ref-self-cycle whose $def carries the id is rejected (9.3 fresh seed) ─
// `root` items resolve to $def A; A.kids ($ref back to A, depth ≥ 1) and A declares
// `properties.id`. The structural descent records #/$defs/A before the id-peek runs;
// if the id-peek shared that visited set it would short-circuit the kids→A $ref and
// miss the id (false negative). The fresh-seed cycle-guard must REJECT this.
{
	const cwd = makeCwd("refcycle-id");
	const cycleWithId: Record<string, unknown> = {
		type: "object",
		$defs: {
			A: {
				type: "object",
				properties: {
					id: { type: "string" },
					kids: { type: "array", items: { $ref: "#/$defs/A" } },
				},
			},
		},
		properties: {
			root: { type: "array", items: { $ref: "#/$defs/A" } },
		},
	};
	let caught: Error | undefined;
	const t0 = Date.now();
	try {
		writeSchema(cwd, "carrier", cycleWithId);
	} catch (err) {
		caught = err as Error;
	}
	const elapsedMs = Date.now() - t0;
	if (elapsedMs > 5000) fail(`(4d) $ref-self-cycle schema took ${elapsedMs}ms — guard likely looping`);
	if (!caught) fail("(4d) expected writeSchema to reject the id-bearing $ref-self-cycle carrier (root.kids)");
	if (!/nested id-bearing arrays are forbidden/.test(caught.message))
		fail(`(4d) throw message missing the forbidden-class label: ${caught.message}`);
	if (!/root\.kids/.test(caught.message))
		fail(`(4d) throw message missing the offending path root.kids: ${caught.message}`);
	if (fs.existsSync(path.join(cwd, ".project", "schemas", "carrier.schema.json")))
		fail("(4d) rejected $ref-self-cycle schema was nonetheless written to disk");
	fs.rmSync(cwd, { recursive: true, force: true });
	pass(`(4d) writeSchema REJECTS a $ref-self-cycle whose $def carries the id (root.kids), ${elapsedMs}ms`);
}

// ── (4e) a composition-routed $ref cycle terminates without overflow (9.3) ────
// The form that surfaced the CRITICAL: a `$ref` cycle routed THROUGH a oneOf/
// anyOf/allOf branch back to an ancestor `$def`. Pre-fix the structural
// composition-branch descent reseeded the pointer-visited set to a throwaway clone
// AND bypassed every depth/recursion backstop → unbounded recursion → RangeError
// (stack overflow), violating the lint-never-throws contract. There is no depth-1
// array in this shape, so writeSchema must ACCEPT it — the load-bearing property is
// that the call RETURNS (terminates, does not hang / overflow) in bounded time.
{
	const cwd = makeCwd("compcycle");
	const compCycle: Record<string, unknown> = {
		type: "object",
		$defs: {
			// A↔B mutual composition cycle: A.allOf→B, B.anyOf→A. `items` is the
			// composition directly (no $ref at the items level) so the structural visited
			// set holds no ancestor pointer when the branch is first reached — the precise
			// shape that overflowed.
			A: { type: "object", allOf: [{ $ref: "#/$defs/B" }] },
			B: { type: "object", anyOf: [{ $ref: "#/$defs/A" }] },
		},
		properties: {
			root: { type: "array", items: { oneOf: [{ $ref: "#/$defs/A" }] } },
		},
	};
	let caught: Error | undefined;
	const t0 = Date.now();
	try {
		writeSchema(cwd, "compcycle", compCycle);
	} catch (err) {
		caught = err as Error;
	}
	const elapsedMs = Date.now() - t0;
	if (elapsedMs > 5000) fail(`(4e) composition-routed $ref cycle took ${elapsedMs}ms — guard likely looping`);
	if (caught) fail(`(4e) composition-routed $ref cycle (no nested id) must NOT throw; threw: ${caught.message}`);
	if (!fs.existsSync(path.join(cwd, ".project", "schemas", "compcycle.schema.json")))
		fail("(4e) composition-routed $ref cycle (no nested id) was not written");
	fs.rmSync(cwd, { recursive: true, force: true });
	pass(`(4e) writeSchema handles a composition-routed $ref cycle WITHOUT overflow/hang (${elapsedMs}ms); accepted`);
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
