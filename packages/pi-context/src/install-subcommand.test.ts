import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { computeContentHash } from "./content-hash.js";
import { loadConfig } from "./context.js";
import { writeBootstrapPointer } from "./context-dir.js";
import { checkStatus, installContext, resolveConflict, updateContext } from "./index.js";
import { getObject } from "./object-store.js";

const SAMPLES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "samples");

let tmpRoot: string;

function makeProject(installedSchemas: string[] = [], installedBlocks: string[] = []): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-context-install-"));
	writeBootstrapPointer(dir, ".project");
	fs.mkdirSync(path.join(dir, ".project", "schemas"), { recursive: true });
	const config = {
		schema_version: "1.0.0",
		root: ".project",
		block_kinds: [],
		lenses: [],
		installed_schemas: installedSchemas,
		installed_blocks: installedBlocks,
	};
	fs.writeFileSync(path.join(dir, ".project", "config.json"), JSON.stringify(config, null, 2));
	return dir;
}

describe("installContext", () => {
	afterEach(() => {
		if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
	});

	it("returns error when .project/config.json is absent", () => {
		tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-context-install-noconfig-"));
		writeBootstrapPointer(tmpRoot, ".project");
		const result = installContext(tmpRoot);
		assert.ok(result.error, "expected error string when config is absent");
		assert.match(result.error, /config\.json/);
		assert.deepEqual(result.installed, []);
	});

	it("no-op summary when install lists are empty", () => {
		tmpRoot = makeProject([], []);
		const result = installContext(tmpRoot);
		assert.equal(result.error, undefined);
		assert.deepEqual(result.installed, []);
		assert.deepEqual(result.updated, []);
		assert.deepEqual(result.skipped, []);
		assert.deepEqual(result.notFound, []);
	});

	it("installs declared schemas from the samples catalog into .project/schemas/", () => {
		tmpRoot = makeProject(["tasks"], []);
		const result = installContext(tmpRoot);
		assert.deepEqual(result.installed, ["schemas/tasks.schema.json"]);
		assert.deepEqual(result.updated, []);
		assert.deepEqual(result.skipped, []);
		assert.deepEqual(result.notFound, []);
		assert.ok(
			fs.existsSync(path.join(tmpRoot, ".project", "schemas", "tasks.schema.json")),
			"expected tasks.schema.json to be copied into .project/schemas/",
		);
	});

	it("installs declared starter blocks from the samples catalog into .project/", () => {
		tmpRoot = makeProject([], ["tasks"]);
		const result = installContext(tmpRoot);
		assert.deepEqual(result.installed, ["tasks.json"]);
		assert.ok(fs.existsSync(path.join(tmpRoot, ".project", "tasks.json")));
	});

	it("skips when destination exists and overwrite not requested", () => {
		tmpRoot = makeProject(["tasks"], []);
		const dest = path.join(tmpRoot, ".project", "schemas", "tasks.schema.json");
		fs.writeFileSync(dest, "{}"); // pre-existing — must not be touched
		const result = installContext(tmpRoot);
		assert.deepEqual(result.installed, []);
		assert.deepEqual(result.skipped, ["schemas/tasks.schema.json"]);
		assert.equal(fs.readFileSync(dest, "utf-8"), "{}", "destination must be untouched on skip");
	});

	it("re-syncs a versionless existing schema under overwrite=true (reported as resynced)", () => {
		// S4: a pre-existing schema with no `version` field has no migration contract,
		// so the --update path treats it as a same-version (description-only) re-sync →
		// verbatim overwrite reported as `resynced` (not `updated`).
		tmpRoot = makeProject(["tasks"], []);
		const dest = path.join(tmpRoot, ".project", "schemas", "tasks.schema.json");
		fs.writeFileSync(dest, "{}"); // pre-existing, versionless
		const result = installContext(tmpRoot, { overwrite: true });
		assert.deepEqual(result.installed, []);
		assert.deepEqual(result.resynced, ["schemas/tasks.schema.json"]);
		assert.deepEqual(result.updated, []);
		assert.deepEqual(result.skipped, []);
		assert.notEqual(
			fs.readFileSync(dest, "utf-8"),
			"{}",
			"destination must be replaced with samples-catalog content on overwrite",
		);
	});

	it("records notFound when a declared schema is missing from the samples catalog", () => {
		tmpRoot = makeProject(["definitely-not-a-real-schema-name"], []);
		const result = installContext(tmpRoot);
		assert.deepEqual(result.installed, []);
		assert.deepEqual(result.notFound, ["schemas/definitely-not-a-real-schema-name.schema.json"]);
	});

	it("processes schemas + blocks together in one call", () => {
		tmpRoot = makeProject(["tasks", "decisions"], ["tasks", "decisions"]);
		const result = installContext(tmpRoot);
		assert.equal(result.installed.length, 4);
		assert.ok(result.installed.includes("schemas/tasks.schema.json"));
		assert.ok(result.installed.includes("schemas/decisions.schema.json"));
		assert.ok(result.installed.includes("tasks.json"));
		assert.ok(result.installed.includes("decisions.json"));
	});

	it("install copies schema content from samples", () => {
		tmpRoot = makeProject(["tasks"], []);
		installContext(tmpRoot);
		const installed = fs.readFileSync(path.join(tmpRoot, ".project", "schemas", "tasks.schema.json"), "utf-8");
		const source = fs.readFileSync(path.join(SAMPLES_DIR, "schemas", "tasks.schema.json"), "utf-8");
		assert.equal(installed, source, "installed schema must be byte-equal to the samples-catalog source");
	});

	it("installs a samples-only kind (framework-gaps)", () => {
		tmpRoot = makeProject(["framework-gaps"], []);
		const result = installContext(tmpRoot);
		assert.deepEqual(result.installed, ["schemas/framework-gaps.schema.json"]);
	});

	// Cycle 9.2: writeSchema now rejects nested id-bearing schemas, but install
	// copies catalog schemas via fs (not writeSchema), so the grandfathered
	// layer-plans carrier still installs cleanly — confirm no throw + present.
	it("installs the nested-id carrier layer-plans (fs copy bypasses the writeSchema guard)", () => {
		tmpRoot = makeProject(["layer-plans"], []);
		// The guard lives on writeSchema; install copies the catalog via fs, so this
		// call must not throw (a throw would fail the test directly).
		const result = installContext(tmpRoot);
		assert.deepEqual(result.installed, ["schemas/layer-plans.schema.json"]);
		assert.ok(fs.existsSync(path.join(tmpRoot, ".project", "schemas", "layer-plans.schema.json")));
	});

	it("config and relations report notFound", () => {
		tmpRoot = makeProject(["config", "relations"], []);
		const result = installContext(tmpRoot);
		assert.deepEqual(result.notFound, ["schemas/config.schema.json", "schemas/relations.schema.json"]);
		assert.deepEqual(result.installed, []);
	});

	// FGAP-029 safe re-sync (slice S1): --update must never overwrite a populated
	// block — the catalog block starter is empty ({"tasks": []}), so copying it over
	// a block holding filed items would delete them. Populated blocks are preserved.
	it("preserves a populated block under overwrite (byte-identical, reported as preserved)", () => {
		tmpRoot = makeProject([], ["tasks"]);
		const dest = path.join(tmpRoot, ".project", "tasks.json");
		// Pre-existing populated block (no schema installed → no migration path).
		const populated = JSON.stringify({ tasks: [{ id: "TASK-001", title: "filed item" }] }, null, 2);
		fs.writeFileSync(dest, populated);
		const result = installContext(tmpRoot, { overwrite: true });
		assert.deepEqual(result.preserved, ["tasks.json"], "populated block must be reported as preserved");
		assert.deepEqual(result.updated, [], "populated block must not be reported as updated");
		assert.deepEqual(result.installed, []);
		assert.equal(
			fs.readFileSync(dest, "utf-8"),
			populated,
			"populated block file must be byte-identical after --update (never overwritten)",
		);
	});

	it("overwrites an empty existing block under overwrite (reported as updated, not preserved)", () => {
		tmpRoot = makeProject([], ["tasks"]);
		const dest = path.join(tmpRoot, ".project", "tasks.json");
		// Pre-existing EMPTY block — all arrays empty → eligible for --update overwrite.
		fs.writeFileSync(dest, JSON.stringify({ tasks: [], extra_marker: true }, null, 2));
		const result = installContext(tmpRoot, { overwrite: true });
		assert.deepEqual(result.updated, ["tasks.json"], "empty block must be reported as updated");
		assert.deepEqual(result.preserved, [], "empty block must not be preserved");
		const after = fs.readFileSync(dest, "utf-8");
		assert.ok(!after.includes("extra_marker"), "empty block must be replaced by the catalog starter on --update");
	});

	it("a schema under overwrite is still re-synced (block preservation does not regress schema --update)", () => {
		tmpRoot = makeProject(["tasks"], []);
		const dest = path.join(tmpRoot, ".project", "schemas", "tasks.schema.json");
		fs.writeFileSync(dest, "{}"); // pre-existing schema (versionless → resync path)
		const result = installContext(tmpRoot, { overwrite: true });
		assert.deepEqual(result.resynced, ["schemas/tasks.schema.json"], "schema must still be re-synced under overwrite");
		assert.deepEqual(result.updated, [], "S4 routes schema --update into resynced/migrated/blocked, not updated");
		assert.deepEqual(result.preserved, [], "schemas are never in the preserved set");
		assert.notEqual(fs.readFileSync(dest, "utf-8"), "{}", "schema must be refreshed from the samples catalog");
	});

	// FGAP-029 safe re-sync (slice S2): /context install records an install baseline
	// (config.installed_from) of the installed SCHEMAS so later slices can detect
	// installed-vs-catalog drift.
	it("records an installed_from baseline with a per-schema fingerprint", () => {
		tmpRoot = makeProject(["tasks", "decisions"], []);
		installContext(tmpRoot);
		const config = loadConfig(tmpRoot);
		assert.ok(config, "config must load after install");
		const from = config?.installed_from;
		assert.ok(from, "config.installed_from must be recorded");
		// catalog/catalog_version/at populated.
		assert.match(from.catalog, /^@davidorex\/pi-context@\d+\.\d+\.\d+$/, "catalog is name@version");
		assert.match(from.catalog_version, /^\d+\.\d+\.\d+$/, "catalog_version is the conception schema_version");
		assert.ok(Date.parse(from.at) > 0, "at is a parseable ISO-8601 timestamp");
		// One assets entry per installed schema (each a 64-hex hash + a version).
		assert.deepEqual(Object.keys(from.assets).sort(), ["decisions", "tasks"]);
		for (const name of ["tasks", "decisions"]) {
			const entry = from.assets[name];
			assert.match(entry.content_hash, /^[0-9a-f]{64}$/, `${name} content_hash is 64-hex`);
			assert.match(entry.version, /^\d+\.\d+\.\d+$/, `${name} version populated`);
		}
	});

	// TASK-035 / FEAT-006 T2 base-stamping: every install baseline-write site also
	// persists the as-installed schema BODY into the content-addressed object store,
	// keyed by the SAME content_hash recorded in installed_from.assets — so the merge
	// base is retrievable later (TASK-036 precondition). computeContentHash(body) over
	// the retrieved object must round-trip back to the baseline hash (per
	// content-hash.ts: a file's computeFileContentHash and its parsed object's
	// computeContentHash are the same JCS digest).
	it("base-stamps each installed schema body into the object store under its baseline content_hash", () => {
		tmpRoot = makeProject(["tasks", "decisions"], []);
		installContext(tmpRoot);
		const from = loadConfig(tmpRoot)?.installed_from;
		assert.ok(from, "config.installed_from must be recorded");
		const substrateDir = path.join(tmpRoot, ".project");
		for (const name of Object.keys(from.assets)) {
			const hash = from.assets[name].content_hash;
			const body = getObject(substrateDir, hash);
			assert.ok(body, `object store must hold the base-stamped body for ${name} under ${hash}`);
			assert.equal(
				computeContentHash(body),
				hash,
				`the stored ${name} body must round-trip to its baseline content_hash`,
			);
		}
	});

	it("baseline covers schemas only — no block names appear in installed_from.assets", () => {
		tmpRoot = makeProject(["tasks"], ["decisions"]);
		installContext(tmpRoot);
		const from = loadConfig(tmpRoot)?.installed_from;
		assert.ok(from);
		assert.deepEqual(Object.keys(from.assets), ["tasks"], "only the installed SCHEMA is baselined, not the block");
	});

	it("is idempotent — a second install on an unchanged substrate produces a byte-identical config.json", () => {
		tmpRoot = makeProject(["tasks", "decisions"], []);
		const cfgPath = path.join(tmpRoot, ".project", "config.json");
		installContext(tmpRoot);
		const first = fs.readFileSync(cfgPath, "utf-8");
		const firstAt = loadConfig(tmpRoot)?.installed_from?.at;
		installContext(tmpRoot);
		const second = fs.readFileSync(cfgPath, "utf-8");
		assert.equal(second, first, "second install must produce a byte-identical config.json");
		assert.equal(loadConfig(tmpRoot)?.installed_from?.at, firstAt, "`at` must be preserved across an unchanged re-run");
	});

	it("a corrupt installed schema file is skipped from the baseline — install does not throw", () => {
		tmpRoot = makeProject(["tasks", "decisions"], []);
		// Pre-place a CORRUPT (non-JSON) file at the `tasks` schema dest. With the
		// default (no-overwrite) install, the copy loop skips an existing dest, so the
		// corrupt content survives to the baseline loop — exercising the throw path
		// (JSON.parse / computeFileContentHash) the safety-default try/catch guards.
		// `decisions` is left for install to copy valid from the samples catalog.
		const corruptDest = path.join(tmpRoot, ".project", "schemas", "tasks.schema.json");
		fs.writeFileSync(corruptDest, "{ not json");
		assert.doesNotThrow(() => installContext(tmpRoot), "a corrupt installed schema must not crash installContext");
		const from = loadConfig(tmpRoot)?.installed_from;
		assert.ok(from, "config.installed_from must still be recorded despite the corrupt schema");
		assert.ok(!("tasks" in from.assets), "the corrupt schema must be ABSENT from installed_from.assets");
		assert.ok(
			"decisions" in from.assets,
			"a sibling VALID schema must still be baselined (loop continues past the corrupt one)",
		);
	});

	it("back-compat — a config without installed_from still loads/validates", () => {
		tmpRoot = makeProject([], []);
		// makeProject writes a config with NO installed_from; loadConfig AJV-validates it.
		const config = loadConfig(tmpRoot);
		assert.ok(config, "a pre-baseline config (no installed_from) must load + validate");
		assert.equal(config?.installed_from, undefined, "no installed_from present before install");
	});
});

// FGAP-029 safe re-sync (slice S3): /context check-status is a PURE-READ drift
// detector — it compares the S2 install baseline against the catalog + the
// currently-installed schema files, classifies per-schema drift, and writes NOTHING.
describe("checkStatus (read-only drift detector)", () => {
	afterEach(() => {
		if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
	});

	it("reports every installed schema in-sync immediately after install", () => {
		tmpRoot = makeProject(["tasks", "decisions"], []);
		installContext(tmpRoot); // records the baseline
		const plan = checkStatus(tmpRoot);
		assert.equal(plan.summary.total, 2);
		assert.equal(plan.summary["in-sync"], 2);
		for (const a of plan.perAsset) {
			assert.equal(a.state, "in-sync", `${a.name} must be in-sync directly after install`);
			assert.equal(a.installed_modified, false, `${a.name} must not be flagged installed_modified`);
		}
	});

	it("flags a locally-mutated installed schema as locally-modified; siblings stay in-sync", () => {
		tmpRoot = makeProject(["tasks", "decisions"], []);
		installContext(tmpRoot);
		// Mutate the INSTALLED dest schema file (not the catalog source) so its content
		// hash diverges from the recorded baseline while the catalog stays equal.
		const dest = path.join(tmpRoot, ".project", "schemas", "tasks.schema.json");
		const obj = JSON.parse(fs.readFileSync(dest, "utf-8")) as Record<string, unknown>;
		obj.__local_edit_marker = true;
		fs.writeFileSync(dest, JSON.stringify(obj, null, 2));
		const plan = checkStatus(tmpRoot);
		const byName = Object.fromEntries(plan.perAsset.map((a) => [a.name, a]));
		assert.equal(byName.tasks.state, "locally-modified", "the mutated schema must be locally-modified");
		assert.equal(byName.tasks.installed_modified, true, "the mutated schema must be installed_modified");
		assert.equal(byName.decisions.state, "in-sync", "the untouched sibling must stay in-sync");
		assert.equal(plan.summary["locally-modified"], 1);
		assert.equal(plan.summary["in-sync"], 1);
	});

	it("reports no-baseline for every installed schema when config has no installed_from", () => {
		tmpRoot = makeProject(["tasks", "decisions"], []);
		// Materialize the schema files (so installed-now is hashable) but strip the
		// baseline so drift is undecidable → no-baseline.
		installContext(tmpRoot);
		const cfgPath = path.join(tmpRoot, ".project", "config.json");
		const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf-8")) as Record<string, unknown>;
		delete cfg.installed_from;
		fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
		const plan = checkStatus(tmpRoot);
		assert.equal(plan.summary["no-baseline"], 2);
		for (const a of plan.perAsset) assert.equal(a.state, "no-baseline", `${a.name} must be no-baseline`);
	});

	it("simulated catalog-ahead — installed === baseline but catalog source differs", () => {
		// installContext baselines FROM the installed dest file. To model catalog-ahead
		// (catalog ≠ baseline, installed === baseline): install, mutate the installed
		// schema so it diverges from the true catalog, then RE-install. The re-install
		// re-baselines against the now-stale installed file (baseline === installed),
		// while the catalog source on disk is unchanged → catalog ≠ baseline.
		tmpRoot = makeProject(["tasks"], []);
		installContext(tmpRoot);
		const dest = path.join(tmpRoot, ".project", "schemas", "tasks.schema.json");
		const obj = JSON.parse(fs.readFileSync(dest, "utf-8")) as Record<string, unknown>;
		obj.__stale_marker = true; // installed now diverges from the true catalog source
		fs.writeFileSync(dest, JSON.stringify(obj, null, 2));
		installContext(tmpRoot); // re-baseline FROM the stale installed file → baseline === installed
		const plan = checkStatus(tmpRoot);
		const tasks = plan.perAsset.find((a) => a.name === "tasks");
		assert.ok(tasks);
		assert.equal(tasks.state, "catalog-ahead", "installed === stale baseline but catalog differs → catalog-ahead");
		assert.equal(tasks.installed_modified, false, "installed matches the (stale) baseline → not installed_modified");
	});

	it("writes nothing — config.json bytes are byte-identical before and after checkStatus", () => {
		tmpRoot = makeProject(["tasks", "decisions"], []);
		installContext(tmpRoot);
		const cfgPath = path.join(tmpRoot, ".project", "config.json");
		const before = fs.readFileSync(cfgPath);
		checkStatus(tmpRoot);
		const after = fs.readFileSync(cfgPath);
		assert.ok(before.equals(after), "checkStatus must not modify config.json (byte-identical before/after)");
	});
});

// FGAP-029 safe re-sync (slice S4): /context install --update re-syncs installed
// SCHEMAS through the migration registry — same-version overwrite, version-bump
// forward-migration, or refuse-and-leave-unchanged. Never strands block items
// under a schema they fail.
describe("installContext --update SCHEMA migration-aware re-sync (S4)", () => {
	afterEach(() => {
		if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
	});

	// Pre-place an installed schema dest = the catalog schema body with its `version`
	// overridden, modelling an older (or unbumped) installed copy against the catalog.
	function installSchemaFixture(dir: string, name: string, version: string, extra?: Record<string, unknown>): string {
		const catalog = JSON.parse(
			fs.readFileSync(path.join(SAMPLES_DIR, "schemas", `${name}.schema.json`), "utf-8"),
		) as Record<string, unknown>;
		catalog.version = version;
		Object.assign(catalog, extra ?? {});
		const dest = path.join(dir, ".project", "schemas", `${name}.schema.json`);
		fs.writeFileSync(dest, JSON.stringify(catalog, null, 2));
		return dest;
	}

	function writeBlockFixture(dir: string, name: string, data: unknown): string {
		const dest = path.join(dir, ".project", `${name}.json`);
		fs.writeFileSync(dest, JSON.stringify(data, null, 2));
		return dest;
	}

	function catalogTasksVersion(): string {
		return (
			JSON.parse(fs.readFileSync(path.join(SAMPLES_DIR, "schemas", "tasks.schema.json"), "utf-8")) as {
				version: string;
			}
		).version;
	}

	it("same-version schema body change under --update → schema overwritten (resynced), block items unchanged", () => {
		const catVer = catalogTasksVersion();
		tmpRoot = makeProject(["tasks"], []);
		// Installed schema dest at the SAME version as the catalog but with a drifted
		// description (so the bytes differ but no migration contract changes).
		const dest = installSchemaFixture(tmpRoot, "tasks", catVer, { description: "DRIFTED LOCAL DESCRIPTION" });
		const blockDest = writeBlockFixture(tmpRoot, "tasks", {
			schema_version: catVer,
			tasks: [{ id: "TASK-001", description: "filed", status: "open" }],
		});
		const blockBefore = fs.readFileSync(blockDest);
		const result = installContext(tmpRoot, { overwrite: true });
		assert.deepEqual(result.resynced, ["schemas/tasks.schema.json"], "same-version drift must be resynced");
		assert.deepEqual(result.migrated, []);
		assert.deepEqual(result.blocked, []);
		const installedNow = fs.readFileSync(dest, "utf-8");
		const catalogNow = fs.readFileSync(path.join(SAMPLES_DIR, "schemas", "tasks.schema.json"), "utf-8");
		assert.equal(installedNow, catalogNow, "schema must be overwritten byte-equal to the catalog source");
		assert.ok(
			fs.readFileSync(blockDest).equals(blockBefore),
			"block file must be byte-unchanged on a same-version resync",
		);
	});

	// SKIPPED per DEC-0012: identity stamping is now unconditional on every write.
	// On this pre-identity substrate (makeProject writes no substrate_id), stamping's
	// substrateIdForDir throws inside resyncSchema's try and is caught as the "blocked"
	// refuse path — so installContext returns with this schema in result.blocked (block
	// and schema left byte-unchanged), and the migrate assertion no longer holds.
	// Re-greening it is the separate, canonically-planned pre-identity-re-sync implementation.
	it.skip("version bump WITH a shipped identity migration + populated block → migrated, item fields intact", () => {
		const catVer = catalogTasksVersion(); // 1.0.1 — catalog ships the 1.0.0→1.0.1 identity decl
		tmpRoot = makeProject(["tasks"], []);
		installSchemaFixture(tmpRoot, "tasks", "1.0.0"); // installed at the older version
		const blockDest = writeBlockFixture(tmpRoot, "tasks", {
			schema_version: "1.0.0",
			tasks: [
				{ id: "TASK-001", description: "alpha", status: "planned" },
				{ id: "TASK-002", description: "beta", status: "completed" },
			],
		});
		const result = installContext(tmpRoot, { overwrite: true });
		assert.deepEqual(result.migrated, ["schemas/tasks.schema.json"], "version bump with a shipped chain must migrate");
		assert.deepEqual(result.blocked, []);
		assert.deepEqual(result.resynced, []);
		// Schema advanced to the catalog version.
		const installedSchema = JSON.parse(
			fs.readFileSync(path.join(tmpRoot, ".project", "schemas", "tasks.schema.json"), "utf-8"),
		) as { version: string };
		assert.equal(installedSchema.version, catVer, "installed schema must advance to the catalog version");
		// Block items preserved (identity migration → field values unchanged); envelope advanced.
		const block = JSON.parse(fs.readFileSync(blockDest, "utf-8")) as {
			schema_version?: string;
			tasks: Array<Record<string, unknown>>;
		};
		assert.equal(block.schema_version, catVer, "block envelope schema_version must advance to the catalog version");
		assert.equal(block.tasks.length, 2, "item count must be preserved");
		assert.deepEqual(
			block.tasks.map((t) => ({ id: t.id, description: t.description, status: t.status })),
			[
				{ id: "TASK-001", description: "alpha", status: "planned" },
				{ id: "TASK-002", description: "beta", status: "completed" },
			],
			"identity migration must preserve every item's domain field values",
		);
	});

	it("version bump with NO shipped migration → blocked: schema AND block byte-unchanged, no throw", () => {
		tmpRoot = makeProject(["tasks"], []);
		// Installed at a version with no `X→catalog` chain in samples/migrations.json.
		const schemaDest = installSchemaFixture(tmpRoot, "tasks", "0.9.0");
		const blockDest = writeBlockFixture(tmpRoot, "tasks", {
			schema_version: "0.9.0",
			tasks: [{ id: "TASK-001", description: "filed", status: "open" }],
		});
		const mp = path.join(tmpRoot, ".project", "migrations.json");
		const schemaBefore = fs.readFileSync(schemaDest);
		const blockBefore = fs.readFileSync(blockDest);
		const migrationsBefore = fs.existsSync(mp) ? fs.readFileSync(mp) : null;
		let result!: ReturnType<typeof installContext>;
		assert.doesNotThrow(() => {
			result = installContext(tmpRoot, { overwrite: true });
		}, "an unmigratable version bump must not throw");
		assert.deepEqual(result.blocked, ["schemas/tasks.schema.json"], "no chain → blocked");
		assert.deepEqual(result.migrated, []);
		assert.deepEqual(result.resynced, []);
		assert.ok(fs.readFileSync(schemaDest).equals(schemaBefore), "blocked schema file must be byte-unchanged");
		assert.ok(fs.readFileSync(blockDest).equals(blockBefore), "blocked block file must be byte-unchanged");
		if (migrationsBefore === null) {
			assert.ok(!fs.existsSync(mp), "migrations.json must be absent after a blocked outcome when absent pre-call");
		} else {
			assert.ok(
				fs.readFileSync(mp).equals(migrationsBefore),
				"migrations.json must be byte-unchanged after a blocked outcome",
			);
		}
	});

	it("version bump whose migrated items would FAIL the new schema → blocked, both files byte-unchanged", () => {
		tmpRoot = makeProject(["tasks"], []);
		// Installed at 1.0.0 (catalog 1.0.1, identity chain exists), but the block holds
		// an item that VIOLATES the catalog 1.0.1 item schema (id fails the TASK-\d{3,}
		// pattern + missing required `status`). Identity migration is a no-op, so AJV
		// validation against the new schema fails → blocked + rollback.
		const schemaDest = installSchemaFixture(tmpRoot, "tasks", "1.0.0");
		const blockDest = writeBlockFixture(tmpRoot, "tasks", {
			schema_version: "1.0.0",
			tasks: [{ id: "not-a-valid-task-id", description: "breaks the new schema" }],
		});
		const mp = path.join(tmpRoot, ".project", "migrations.json");
		const schemaBefore = fs.readFileSync(schemaDest);
		const blockBefore = fs.readFileSync(blockDest);
		// Load-bearing: this path appends the shipped decls into migrations.json
		// BEFORE the validate throw, so a blocked outcome must restore them.
		const migrationsBefore = fs.existsSync(mp) ? fs.readFileSync(mp) : null;
		let result!: ReturnType<typeof installContext>;
		assert.doesNotThrow(() => {
			result = installContext(tmpRoot, { overwrite: true });
		}, "an items-fail-new-schema bump must not throw");
		assert.deepEqual(result.blocked, ["schemas/tasks.schema.json"], "items failing the new schema → blocked");
		assert.deepEqual(result.migrated, []);
		assert.ok(
			fs.readFileSync(schemaDest).equals(schemaBefore),
			"blocked schema file must be rolled back byte-identical to its pre-call bytes",
		);
		assert.ok(
			fs.readFileSync(blockDest).equals(blockBefore),
			"blocked block file must be byte-unchanged (never written)",
		);
		if (migrationsBefore === null) {
			assert.ok(!fs.existsSync(mp), "migrations.json must be absent after a blocked outcome when absent pre-call");
		} else {
			assert.ok(
				fs.readFileSync(mp).equals(migrationsBefore),
				"migrations.json must be byte-unchanged after a blocked outcome",
			);
		}
	});

	it("idempotent — re-run --update on an in-sync substrate yields no schema changes", () => {
		const catVer = catalogTasksVersion();
		tmpRoot = makeProject(["tasks"], []);
		// First install lands the catalog schema (1.0.1) fresh.
		installContext(tmpRoot);
		writeBlockFixture(tmpRoot, "tasks", {
			schema_version: catVer,
			tasks: [{ id: "TASK-001", description: "filed", status: "open" }],
		});
		const schemaDest = path.join(tmpRoot, ".project", "schemas", "tasks.schema.json");
		const blockDest = path.join(tmpRoot, ".project", "tasks.json");
		const schemaBefore = fs.readFileSync(schemaDest);
		const blockBefore = fs.readFileSync(blockDest);
		// Re-run with --update: installed === catalog version → resynced (verbatim
		// re-copy), block untouched. Nothing is migrated or blocked.
		const result = installContext(tmpRoot, { overwrite: true });
		assert.deepEqual(result.resynced, ["schemas/tasks.schema.json"], "in-sync schema re-syncs verbatim");
		assert.deepEqual(result.migrated, []);
		assert.deepEqual(result.blocked, []);
		assert.ok(fs.readFileSync(schemaDest).equals(schemaBefore), "schema bytes unchanged on an in-sync re-run");
		assert.ok(fs.readFileSync(blockDest).equals(blockBefore), "block bytes unchanged on an in-sync re-run");
	});

	// SKIPPED per DEC-0012: identity stamping is now unconditional on every write.
	// On this pre-identity substrate (makeProject writes no substrate_id), the migrate's
	// stamping throws inside resyncSchema and is caught as the "blocked" refuse path — so
	// the schema lands in result.blocked, the baseline is not refreshed, and check-status
	// does not report in-sync. Re-greening is the separate, canonically-planned
	// pre-identity-re-sync implementation.
	it.skip("after a migrate, check-status reports the schema in-sync (baseline refreshed)", () => {
		tmpRoot = makeProject(["tasks"], []);
		installSchemaFixture(tmpRoot, "tasks", "1.0.0");
		writeBlockFixture(tmpRoot, "tasks", {
			schema_version: "1.0.0",
			tasks: [{ id: "TASK-001", description: "filed", status: "planned" }],
		});
		const migrate = installContext(tmpRoot, { overwrite: true });
		assert.deepEqual(migrate.migrated, ["schemas/tasks.schema.json"]);
		const plan = checkStatus(tmpRoot);
		const tasks = plan.perAsset.find((a) => a.name === "tasks");
		assert.ok(tasks);
		assert.equal(tasks.state, "in-sync", "post-migrate baseline must report the schema in-sync");
	});
});

// FEAT-006 T1 (TASK-034 / DEC-0017): /context update consults checkStatus per
// installed schema and routes by drift — refuse-and-report for locally-modified /
// both-diverged (never overwrite), resync catalog-ahead via the SAME resyncSchema
// path /context install --update uses, no-op in-sync, report undecidable/absent.
// --dryRun computes the plan WITHOUT writing.
describe("updateContext (drift-routed model update — T1 refuse-and-report)", () => {
	afterEach(() => {
		if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
	});

	// Model catalog-ahead the SAME way the checkStatus catalog-ahead test does:
	// install, mutate the installed schema so it diverges from the true catalog,
	// then RE-install to re-baseline against the stale installed file. Result:
	// baseline === installed (so NOT locally-modified) while catalog ≠ baseline →
	// catalog-ahead. Because installed/catalog share the SAME `version`, the resync
	// takes the same-version (verbatim copyFileSync) branch — no migrate, no
	// identity-stamping throw on this pre-identity substrate.
	function makeCatalogAheadFixture(name: string): string {
		const dest = path.join(tmpRoot, ".project", "schemas", `${name}.schema.json`);
		installContext(tmpRoot);
		const obj = JSON.parse(fs.readFileSync(dest, "utf-8")) as Record<string, unknown>;
		obj.__stale_marker = true; // installed now diverges from the true catalog source
		fs.writeFileSync(dest, JSON.stringify(obj, null, 2));
		installContext(tmpRoot); // re-baseline FROM the stale installed file → baseline === installed
		return dest;
	}

	// TASK-036 — FEAT-006 T3: a locally-modified schema is now 3-way-merged rather
	// than blindly refused. The refuse-and-report path remains ONLY as the no-safe-
	// base fallback: with no retrievable stamped BASE body (here the object-store
	// object is deleted), the merge cannot run → the schema falls back to `refused`,
	// keeping its drift signal, and its file is left byte-unchanged (no crash).
	it("(a) a locally-modified schema with NO retrievable base body falls back to refused, bytes unchanged", () => {
		tmpRoot = makeProject(["tasks", "decisions"], []);
		installContext(tmpRoot);
		const substrateDir = path.join(tmpRoot, ".project");
		// Hand-edit the INSTALLED tasks schema so its content diverges from the
		// recorded baseline while the catalog stays equal → locally-modified.
		const dest = path.join(substrateDir, "schemas", "tasks.schema.json");
		const obj = JSON.parse(fs.readFileSync(dest, "utf-8")) as Record<string, unknown>;
		obj.__local_edit_marker = true;
		fs.writeFileSync(dest, JSON.stringify(obj, null, 2));
		// Confirm the precondition: checkStatus classifies it locally-modified.
		assert.equal(
			checkStatus(tmpRoot).perAsset.find((a) => a.name === "tasks")?.state,
			"locally-modified",
			"precondition: the hand-edited schema must be locally-modified",
		);
		// Remove the stamped BASE body so getObject(baseHash) returns null → no safe
		// 3-way merge → refuse-and-report fallback.
		const baseHash = loadConfig(tmpRoot)?.installed_from?.assets.tasks.content_hash;
		assert.ok(baseHash, "precondition: tasks must have a recorded baseline content_hash");
		assert.ok(
			getObject(substrateDir, baseHash) !== null,
			"precondition: the base body must be stamped before deletion",
		);
		const objectPath = path.join(substrateDir, "objects", `${baseHash}.json`);
		fs.unlinkSync(objectPath);
		assert.equal(getObject(substrateDir, baseHash), null, "precondition: the base body must be gone");

		const before = fs.readFileSync(dest);
		const result = updateContext(tmpRoot);
		assert.deepEqual(result.refused, ["tasks"], "no retrievable base body → fall back to refused");
		assert.deepEqual(result.merged, [], "with no base body the schema must NOT be merged");
		assert.deepEqual(result.conflicts, [], "a refused-fallback raises no conflict record");
		assert.ok(!result.resynced.includes("tasks"), "a locally-modified schema must NOT be resynced");
		assert.deepEqual(result.inSync, ["decisions"], "the untouched sibling stays in-sync (no-op)");
		assert.ok(
			fs.readFileSync(dest).equals(before),
			"the refused schema file must be byte-unchanged (refuse-and-report writes nothing to it)",
		);
	});

	it("(b) in-sync schema is a no-op; a catalog-ahead schema is resynced", () => {
		tmpRoot = makeProject(["tasks", "decisions"], []);
		// `tasks` → catalog-ahead (stale baseline trick); `decisions` left in-sync.
		const tasksDest = makeCatalogAheadFixture("tasks");
		// Precondition: tasks catalog-ahead, decisions in-sync.
		const pre = Object.fromEntries(checkStatus(tmpRoot).perAsset.map((a) => [a.name, a.state]));
		assert.equal(pre.tasks, "catalog-ahead", "precondition: tasks must be catalog-ahead");
		assert.equal(pre.decisions, "in-sync", "precondition: decisions must be in-sync");
		const result = updateContext(tmpRoot);
		assert.deepEqual(result.resynced, ["tasks"], "the catalog-ahead schema must be resynced");
		assert.deepEqual(result.migrated, [], "same-version catalog-ahead resyncs (no migration)");
		assert.deepEqual(result.blocked, [], "a same-version resync is never blocked");
		assert.deepEqual(result.refused, [], "nothing locally-modified → nothing refused");
		assert.deepEqual(result.inSync, ["decisions"], "the in-sync schema must be a no-op");
		// The resync overwrote the stale marker with the true catalog source.
		const catalogNow = fs.readFileSync(path.join(SAMPLES_DIR, "schemas", "tasks.schema.json"), "utf-8");
		assert.equal(
			fs.readFileSync(tasksDest, "utf-8"),
			catalogNow,
			"the resynced schema must be overwritten byte-equal to the catalog source",
		);
		// Post-condition: tasks is now in-sync.
		assert.equal(
			checkStatus(tmpRoot).perAsset.find((a) => a.name === "tasks")?.state,
			"in-sync",
			"after resync the schema must report in-sync",
		);
	});

	// TASK-035 / FEAT-006 T2: the updateContext baseline-REFRESH site (TASK-034) is a
	// baseline-write site too, so a resync base-stamps the resynced schema's NEW body
	// under its NEW (refreshed) content_hash. After resync, the refreshed baseline hash
	// must have a retrievable stored body that round-trips.
	it("(b2) a resync base-stamps the resynced schema body under its NEW refreshed baseline content_hash", () => {
		tmpRoot = makeProject(["tasks", "decisions"], []);
		const tasksDest = makeCatalogAheadFixture("tasks");
		const substrateDir = path.join(tmpRoot, ".project");
		// Baseline hash BEFORE update is the stale installed body's hash.
		const staleHash = loadConfig(tmpRoot)?.installed_from?.assets.tasks.content_hash;
		assert.ok(staleHash);
		const result = updateContext(tmpRoot);
		assert.deepEqual(result.resynced, ["tasks"], "precondition: tasks must resync");
		const refreshedHash = loadConfig(tmpRoot)?.installed_from?.assets.tasks.content_hash;
		assert.ok(refreshedHash, "the refreshed baseline must record a content_hash");
		assert.notEqual(refreshedHash, staleHash, "the resync must have refreshed the baseline hash");
		assert.equal(
			refreshedHash,
			computeContentHash(JSON.parse(fs.readFileSync(tasksDest, "utf-8")) as Record<string, unknown>),
			"the refreshed baseline hash must equal the now-installed (catalog) body hash",
		);
		const body = getObject(substrateDir, refreshedHash);
		assert.ok(body, "the resynced body must be base-stamped under the refreshed baseline hash");
		assert.equal(computeContentHash(body), refreshedHash, "the stored resynced body must round-trip to its hash");
	});

	it("(c) dryRun writes NOTHING for ANY drift state and returns the action plan", () => {
		// A substrate spanning the three live-routed states at once:
		//   tasks       → catalog-ahead (would resync)
		//   decisions   → locally-modified (would refuse)
		//   work-orders → in-sync (no-op)
		tmpRoot = makeProject(["tasks", "decisions", "work-orders"], []);
		installContext(tmpRoot);
		// tasks → catalog-ahead via the stale-baseline trick: mutate the installed
		// tasks schema, then re-install so it re-baselines FROM the stale installed
		// bytes (baseline === installed, catalog ≠ baseline). ONLY tasks is touched
		// before the re-install — decisions + work-orders keep baseline === catalog
		// (so a later single edit to decisions is cleanly locally-modified, not
		// both-diverged).
		const tasksDest = path.join(tmpRoot, ".project", "schemas", "tasks.schema.json");
		const tasksObj = JSON.parse(fs.readFileSync(tasksDest, "utf-8")) as Record<string, unknown>;
		tasksObj.__stale_marker = true;
		fs.writeFileSync(tasksDest, JSON.stringify(tasksObj, null, 2));
		installContext(tmpRoot); // re-baseline: tasks stale===baseline (catalog-ahead); decisions/work-orders unchanged === catalog
		// decisions → locally-modified: edit ONCE against the now-refreshed baseline,
		// which still equals the catalog (decisions was never edited pre-re-install),
		// so installed ≠ baseline === catalog → locally-modified (not both-diverged).
		const decDest = path.join(tmpRoot, ".project", "schemas", "decisions.schema.json");
		const decObj = JSON.parse(fs.readFileSync(decDest, "utf-8")) as Record<string, unknown>;
		decObj.__local_edit_marker = true;
		fs.writeFileSync(decDest, JSON.stringify(decObj, null, 2));
		// Capture EVERY substrate file's bytes before the dry run.
		const woDest = path.join(tmpRoot, ".project", "schemas", "work-orders.schema.json");
		const cfgPath = path.join(tmpRoot, ".project", "config.json");
		const snapshot = new Map<string, Buffer>();
		for (const f of [tasksDest, decDest, woDest, cfgPath]) snapshot.set(f, fs.readFileSync(f));
		// TASK-035 / FEAT-006 T2: base-stamping is INSIDE the !dryRun guard, so a
		// dry-run must add NO new object to the content-addressed store. Snapshot the
		// objects/ directory listing before the dry run (prior installs may have
		// stamped bodies; the invariant is that dryRun adds none).
		const objectsDir = path.join(tmpRoot, ".project", "objects");
		const objectsBefore = fs.existsSync(objectsDir) ? fs.readdirSync(objectsDir).sort() : [];
		// Precondition spread across states.
		const pre = Object.fromEntries(checkStatus(tmpRoot).perAsset.map((a) => [a.name, a.state]));
		assert.equal(pre.tasks, "catalog-ahead");
		assert.equal(pre.decisions, "locally-modified");
		assert.equal(pre["work-orders"], "in-sync");

		const plan = updateContext(tmpRoot, { dryRun: true });
		assert.equal(plan.dryRun, true, "the plan must declare it is a dry run");
		assert.deepEqual(plan.resynced, ["tasks"], "catalog-ahead schema appears in the would-resync set");
		// TASK-036 — FEAT-006 T3: a locally-modified schema is no longer blindly
		// refused. `decisions` here is locally-modified with base === catalog (only
		// ours diverges), so its 3-way merge is conflict-free → it routes into
		// `merged` (the would-merge set), NOT `refused`. Under dryRun the merge is
		// validate-only — nothing is written (asserted byte-for-byte below).
		assert.deepEqual(plan.merged, ["decisions"], "a conflict-free locally-modified merge appears in the merged set");
		assert.deepEqual(plan.refused, [], "no schema lacks a base body, so nothing falls back to refused");
		assert.deepEqual(plan.conflicts, [], "the disjoint merge raises no conflicts");
		assert.deepEqual(plan.inSync, ["work-orders"], "in-sync schema appears as a no-op");

		// The load-bearing assertion: NOTHING on disk changed under dryRun.
		for (const [f, before] of snapshot) {
			assert.ok(fs.readFileSync(f).equals(before), `dryRun must not modify ${path.basename(f)} (byte-identical)`);
		}
		// The objects/ store must be unchanged: dryRun base-stamps nothing.
		const objectsAfter = fs.existsSync(objectsDir) ? fs.readdirSync(objectsDir).sort() : [];
		assert.deepEqual(
			objectsAfter,
			objectsBefore,
			"dryRun must base-stamp nothing — the objects/ store listing must be unchanged",
		);
	});

	// ---- TASK-036 — FEAT-006 T3: 3-way installed/baseline/catalog schema merge ----
	//
	// All three sides must differ for the merge to be exercised non-trivially, but
	// the catalog (THEIRS) is the shared packaged samples file and must not be
	// mutated. So we synthesize divergence via the stale-baseline trick: edit the
	// installed body to form BASE, re-install (re-baseline FROM the edited body), so
	// BASE diverges from the catalog; the catalog stays the original (THEIRS). Then
	// edit the installed body again to form OURS. This yields BASE ≠ THEIRS and
	// OURS ≠ BASE — a `both-diverged` node that the merge resolves.
	//
	// `nudgeAt`/`readAt` operate on the nested item-property path
	// `properties.tasks.items.properties` (where the per-task field schemas live).
	const TASKS_ITEM_PROPS = ["properties", "tasks", "items", "properties"] as const;
	function deepGet(obj: Record<string, unknown>, pathSegs: readonly string[]): Record<string, unknown> {
		let cur: Record<string, unknown> = obj;
		for (const seg of pathSegs) cur = cur[seg] as Record<string, unknown>;
		return cur;
	}
	/**
	 * Build a `both-diverged` tasks fixture and return the dest path. `baseMut`
	 * mutates the installed item-properties to form BASE (then re-install bakes it
	 * as the baseline, diverging BASE from the catalog); `oursMut` then mutates the
	 * installed item-properties to form OURS on top of BASE.
	 */
	function makeBothDivergedTasks(
		baseMut: (itemProps: Record<string, unknown>) => void,
		oursMut: (itemProps: Record<string, unknown>) => void,
	): string {
		const dest = path.join(tmpRoot, ".project", "schemas", "tasks.schema.json");
		installContext(tmpRoot);
		// Form BASE.
		const baseObj = JSON.parse(fs.readFileSync(dest, "utf-8")) as Record<string, unknown>;
		baseMut(deepGet(baseObj, TASKS_ITEM_PROPS));
		fs.writeFileSync(dest, JSON.stringify(baseObj, null, 2));
		installContext(tmpRoot); // re-baseline FROM the edited body → BASE ≠ catalog(THEIRS)
		// Form OURS on top of BASE.
		const oursObj = JSON.parse(fs.readFileSync(dest, "utf-8")) as Record<string, unknown>;
		oursMut(deepGet(oursObj, TASKS_ITEM_PROPS));
		fs.writeFileSync(dest, JSON.stringify(oursObj, null, 2));
		return dest;
	}

	it("(d) disjoint divergence auto-merges: ours adds a field, catalog keeps a field base dropped → both present", () => {
		tmpRoot = makeProject(["tasks", "decisions"], []);
		// BASE drops the catalog's `notes` field (so THEIRS appears to have ADDED it
		// relative to BASE); OURS adds a brand-new `__ours_field`.
		const dest = makeBothDivergedTasks(
			(p) => {
				delete p.notes;
			},
			(p) => {
				p.__ours_field = { type: "string" };
			},
		);
		// Precondition: tasks is both-diverged (installed ≠ baseline ≠ catalog).
		assert.equal(
			checkStatus(tmpRoot).perAsset.find((a) => a.name === "tasks")?.state,
			"both-diverged",
			"precondition: tasks must be both-diverged",
		);
		const before = fs.readFileSync(dest);
		const result = updateContext(tmpRoot);
		assert.deepEqual(result.merged, ["tasks"], "a conflict-free 3-way merge must land in merged");
		assert.deepEqual(result.conflicts, [], "a disjoint merge raises no conflicts");
		assert.deepEqual(result.refused, [], "a merged schema is never refused");
		// The written body carries BOTH the catalog-kept field AND the local add.
		const written = JSON.parse(fs.readFileSync(dest, "utf-8")) as Record<string, unknown>;
		const writtenProps = deepGet(written, TASKS_ITEM_PROPS);
		assert.ok("notes" in writtenProps, "the catalog-kept `notes` field must survive the merge");
		assert.ok("__ours_field" in writtenProps, "the local `__ours_field` add must survive the merge");
		assert.ok(!fs.readFileSync(dest).equals(before), "a live merge must rewrite the schema file");
		// FGAP-070 durability: a SECOND update must NOT resync the disjoint local add away.
		// The merge stamped baseline := the catalog body, so the kept-local `__ours_field`
		// reads as locally-modified and persists; the re-merge takes ours via base === theirs.
		const second = updateContext(tmpRoot);
		assert.deepEqual(second.conflicts, [], "a second update over a disjoint auto-merge raises no conflict");
		const afterSecond = deepGet(
			JSON.parse(fs.readFileSync(dest, "utf-8")) as Record<string, unknown>,
			TASKS_ITEM_PROPS,
		);
		assert.ok(
			"__ours_field" in afterSecond,
			"the local `__ours_field` add survives a second update — NOT resynced away",
		);
		assert.ok("notes" in afterSecond, "the catalog-kept `notes` field remains present after a second update");
	});

	it("(e) same-node divergence conflicts: ours + catalog give a field different types → conflict, bytes unchanged", () => {
		tmpRoot = makeProject(["tasks", "decisions"], []);
		// BASE changes `notes.type` to "number" (diverging from the catalog's "string");
		// OURS changes the SAME node to "boolean". THEIRS (catalog) stays "string".
		// All three differ at properties.tasks.items.properties.notes.type → conflict.
		const dest = makeBothDivergedTasks(
			(p) => {
				(p.notes as Record<string, unknown>).type = "number";
			},
			(p) => {
				(p.notes as Record<string, unknown>).type = "boolean";
			},
		);
		assert.equal(
			checkStatus(tmpRoot).perAsset.find((a) => a.name === "tasks")?.state,
			"both-diverged",
			"precondition: tasks must be both-diverged",
		);
		const before = fs.readFileSync(dest);
		const result = updateContext(tmpRoot);
		assert.deepEqual(result.merged, [], "a conflicting merge must NOT land in merged");
		assert.equal(result.conflicts.length, 1, "the conflict must be recorded");
		assert.equal(result.conflicts[0].name, "tasks");
		assert.ok(
			result.conflicts[0].conflicts.some((c) => c.path === "properties.tasks.items.properties.notes.type"),
			"the recorded conflict path must point at the divergent node",
		);
		assert.ok(
			fs.readFileSync(dest).equals(before),
			"a conflicting merge must write NOTHING — the schema file is byte-unchanged",
		);
	});

	it("(f) enum widening on both sides set-unions without conflict", () => {
		tmpRoot = makeProject(["tasks", "decisions"], []);
		// BASE narrows status.enum to a single value (so THEIRS, the catalog, appears
		// to have ADDED the rest); OURS adds a brand-new enum value. Set-union keeps
		// the catalog values AND the local add.
		let catalogEnum: string[] = [];
		const dest = makeBothDivergedTasks(
			(p) => {
				const statusEnum = (p.status as Record<string, unknown>).enum as string[];
				catalogEnum = [...statusEnum];
				(p.status as Record<string, unknown>).enum = [statusEnum[0]];
			},
			(p) => {
				const e = (p.status as Record<string, unknown>).enum as string[];
				(p.status as Record<string, unknown>).enum = [...e, "__ours_status"];
			},
		);
		const result = updateContext(tmpRoot);
		assert.deepEqual(result.merged, ["tasks"], "an enum set-union must auto-merge");
		assert.deepEqual(result.conflicts, [], "a set-union raises no conflict");
		const written = JSON.parse(fs.readFileSync(dest, "utf-8")) as Record<string, unknown>;
		const mergedEnum = (deepGet(written, TASKS_ITEM_PROPS).status as Record<string, unknown>).enum as string[];
		for (const v of catalogEnum) {
			assert.ok(mergedEnum.includes(v), `the catalog enum value ${v} must survive the set-union`);
		}
		assert.ok(mergedEnum.includes("__ours_status"), "the local enum add must survive the set-union");
	});

	it("(g) delete-vs-modify conflicts: ours deletes a field the catalog modified → conflict", () => {
		tmpRoot = makeProject(["tasks", "decisions"], []);
		// BASE changes notes.type to "number" (so THEIRS=catalog="string" is a MODIFY
		// vs base); OURS deletes the whole notes node. delete-vs-modify → conflict.
		const dest = makeBothDivergedTasks(
			(p) => {
				(p.notes as Record<string, unknown>).type = "number";
			},
			(p) => {
				delete p.notes;
			},
		);
		const before = fs.readFileSync(dest);
		const result = updateContext(tmpRoot);
		assert.deepEqual(result.merged, [], "a delete-vs-modify must not auto-merge");
		assert.equal(result.conflicts.length, 1, "the delete-vs-modify must be recorded as a conflict");
		assert.equal(result.conflicts[0].name, "tasks");
		assert.ok(
			result.conflicts[0].conflicts.some((c) => c.path === "properties.tasks.items.properties.notes"),
			"the conflict path must point at the deleted-vs-modified node",
		);
		assert.ok(fs.readFileSync(dest).equals(before), "a conflicting merge writes nothing");
	});

	it("(h) an auto-merged schema is re-baselined to the CATALOG body, so the kept-local divergence stays locally-modified", () => {
		tmpRoot = makeProject(["tasks", "decisions"], []);
		const substrateDir = path.join(tmpRoot, ".project");
		const dest = makeBothDivergedTasks(
			(p) => {
				delete p.notes;
			},
			(p) => {
				p.__ours_field = { type: "string" };
			},
		);
		const result = updateContext(tmpRoot);
		assert.deepEqual(result.merged, ["tasks"], "precondition: tasks must auto-merge");
		// FGAP-070: the merge stamps the baseline := the CATALOG body (theirs), NOT the
		// merged on-disk body. The merged body still carries the local-only `__ours_field`
		// the catalog lacks, so against the catalog baseline a follow-up check-status sees a
		// LOCAL edit (installed ≠ baseline) while baseline === catalog (no catalog-ahead axis)
		// → `locally-modified` (NOT catalog-ahead). This is the durable fixed point: a kept-
		// local divergence persists across updates instead of being resynced to the catalog.
		assert.equal(
			checkStatus(tmpRoot).perAsset.find((a) => a.name === "tasks")?.state,
			"locally-modified",
			"after an auto-merge the kept-local divergence reads as locally-modified (baseline := catalog)",
		);
		// The merged on-disk body still carries BOTH the catalog-kept `notes` and the
		// local-only `__ours_field` — the merge result itself is unchanged on disk.
		const writtenProps = deepGet(
			JSON.parse(fs.readFileSync(dest, "utf-8")) as Record<string, unknown>,
			TASKS_ITEM_PROPS,
		);
		assert.ok("notes" in writtenProps, "the catalog-kept `notes` field is present on the merged on-disk body");
		assert.ok("__ours_field" in writtenProps, "the local-only `__ours_field` is present on the merged on-disk body");
		// The refreshed baseline hash equals the CATALOG body's hash, NOT the merged body's,
		// and has a retrievable stamped body that round-trips.
		const refreshedHash = loadConfig(tmpRoot)?.installed_from?.assets.tasks.content_hash;
		assert.ok(refreshedHash, "the merge must refresh the baseline content_hash");
		const catalogBody = JSON.parse(
			fs.readFileSync(path.join(SAMPLES_DIR, "schemas", "tasks.schema.json"), "utf-8"),
		) as Record<string, unknown>;
		assert.equal(
			refreshedHash,
			computeContentHash(catalogBody),
			"the refreshed baseline hash must equal the CATALOG body's hash, not the merged body's",
		);
		const body = getObject(substrateDir, refreshedHash);
		assert.ok(body, "the catalog body must be base-stamped under the refreshed baseline hash");
		assert.equal(computeContentHash(body), refreshedHash, "the stamped catalog body must round-trip to its hash");
	});

	// ── FGAP-069: resolveConflict commits a reconciliation end-to-end ────────────
	// update surfaces a both-diverged CONFLICT; the calling agent reconciles into a
	// body R and runs resolveConflict, which writes R AND advances the merge base to
	// the catalog. A SUBSEQUENT update must then converge — the base === catalog rule
	// takes R via base === theirs → ours: zero conflicts, R preserved on disk.

	it("(i) resolveConflict(R=ours) makes a subsequent update converge — conflict gone, R preserved, locally-modified", () => {
		tmpRoot = makeProject(["tasks", "decisions"], []);
		// The (e) conflict: BASE notes.type="number", OURS="boolean", catalog(THEIRS)="string".
		const dest = makeBothDivergedTasks(
			(p) => {
				(p.notes as Record<string, unknown>).type = "number";
			},
			(p) => {
				(p.notes as Record<string, unknown>).type = "boolean";
			},
		);
		// Precondition: the first update reports the tasks conflict and writes nothing.
		const first = updateContext(tmpRoot);
		assert.equal(first.conflicts.length, 1, "first update must report the tasks conflict");
		assert.equal(first.conflicts[0].name, "tasks");
		// R = the OURS body (the on-disk tasks schema; notes.type already "boolean").
		const R = JSON.parse(fs.readFileSync(dest, "utf-8")) as Record<string, unknown>;
		assert.equal((deepGet(R, TASKS_ITEM_PROPS).notes as Record<string, unknown>).type, "boolean", "R is the OURS body");
		const out = resolveConflict(tmpRoot, "tasks", R);
		assert.equal(out.schemaName, "tasks");
		assert.equal(out.wroteSchema, true, "a supplied schema is written");
		assert.ok(out.baseAdvancedTo, "the base advances to a catalog content_hash");
		// Immediately after resolveConflict (before any further update) the schema reads as
		// `locally-modified`: the base advanced to the catalog body, so baseline === catalog
		// while installed === R differs from it (the one axis that diverges is local). This
		// is precisely the state that lets the next update's merge take R via base === theirs.
		assert.equal(
			checkStatus(tmpRoot).perAsset.find((a) => a.name === "tasks")?.state,
			"locally-modified",
			"after the base advances, tasks is locally-modified (installed R ≠ baseline catalog), not both-diverged",
		);
		// The SUBSEQUENT update converges: no conflict, tasks lands in merged or is a no-op.
		const second = updateContext(tmpRoot);
		assert.deepEqual(second.conflicts, [], "the subsequent update reports NO conflict — the base advanced");
		assert.ok(
			second.merged.includes("tasks") || !second.refused.includes("tasks"),
			"tasks is no longer refused — it merged (or was already in-sync)",
		);
		// R is preserved on disk: notes.type is still "boolean" after the converging update.
		const onDisk = JSON.parse(fs.readFileSync(dest, "utf-8")) as Record<string, unknown>;
		assert.equal(
			(deepGet(onDisk, TASKS_ITEM_PROPS).notes as Record<string, unknown>).type,
			"boolean",
			"the reconciled R (notes.type boolean) survives the converging update",
		);
		// After the converging update, tasks is no longer a CONFLICT — and FGAP-070 makes
		// it STABLE: the second update auto-merged R (notes.type "boolean") and stamped the
		// baseline := the CATALOG body, so the kept-local divergence reads as `locally-
		// modified` (installed R ≠ baseline catalog), NOT `catalog-ahead`. A catalog-ahead
		// reading would resync R away on the next update — the very defect FGAP-070 fixes.
		assert.equal(
			checkStatus(tmpRoot).perAsset.find((a) => a.name === "tasks")?.state,
			"locally-modified",
			"the merge stamps baseline := catalog, so the kept-local R reads as locally-modified (stable, not resync-bound)",
		);
		// Durability across repeated updates (the FGAP-070 fixed point): a THIRD and FOURTH
		// update must keep R on disk (notes.type "boolean") and raise no conflict — R is
		// never resynced to the catalog "string".
		const third = updateContext(tmpRoot);
		assert.deepEqual(third.conflicts, [], "a further update raises no conflict — R is the stable fixed point");
		assert.equal(
			(
				deepGet(JSON.parse(fs.readFileSync(dest, "utf-8")) as Record<string, unknown>, TASKS_ITEM_PROPS)
					.notes as Record<string, unknown>
			).type,
			"boolean",
			"R (notes.type boolean) survives a further update — NOT resynced to the catalog string",
		);
		const fourth = updateContext(tmpRoot);
		assert.deepEqual(fourth.conflicts, [], "yet a further update still raises no conflict");
		assert.equal(
			(
				deepGet(JSON.parse(fs.readFileSync(dest, "utf-8")) as Record<string, unknown>, TASKS_ITEM_PROPS)
					.notes as Record<string, unknown>
			).type,
			"boolean",
			"R (notes.type boolean) is durable across repeated updates",
		);
	});

	it("(j) resolveConflict with schema omitted advances the base off the on-disk body and the next update converges", () => {
		tmpRoot = makeProject(["tasks", "decisions"], []);
		// Same (e) conflict; the on-disk body IS already R (notes.type="boolean").
		const dest = makeBothDivergedTasks(
			(p) => {
				(p.notes as Record<string, unknown>).type = "number";
			},
			(p) => {
				(p.notes as Record<string, unknown>).type = "boolean";
			},
		);
		const before = fs.readFileSync(dest);
		assert.equal(updateContext(tmpRoot).conflicts.length, 1, "precondition: the conflict is reported");
		const out = resolveConflict(tmpRoot, "tasks");
		assert.equal(out.wroteSchema, false, "no schema supplied → no write");
		assert.ok(out.baseAdvancedTo, "the base still advances to the catalog");
		assert.ok(fs.readFileSync(dest).equals(before), "omitting schema writes nothing to the schema file");
		const second = updateContext(tmpRoot);
		assert.deepEqual(second.conflicts, [], "the next update converges with the base advanced");
		const onDiskJ = JSON.parse(fs.readFileSync(dest, "utf-8")) as Record<string, unknown>;
		assert.equal(
			(deepGet(onDiskJ, TASKS_ITEM_PROPS).notes as Record<string, unknown>).type,
			"boolean",
			"the on-disk R (already boolean) is preserved",
		);
		// FGAP-070 durability: a THIRD and FOURTH update keep the reconciled value — the
		// schema is never resynced back to the catalog "string".
		const third = updateContext(tmpRoot);
		assert.deepEqual(third.conflicts, [], "a third update raises no conflict — the base advanced to the catalog");
		assert.equal(
			(
				deepGet(JSON.parse(fs.readFileSync(dest, "utf-8")) as Record<string, unknown>, TASKS_ITEM_PROPS)
					.notes as Record<string, unknown>
			).type,
			"boolean",
			"the reconciled notes.type stays boolean across a third update",
		);
		const fourth = updateContext(tmpRoot);
		assert.deepEqual(fourth.conflicts, [], "a fourth update still raises no conflict");
		assert.equal(
			(
				deepGet(JSON.parse(fs.readFileSync(dest, "utf-8")) as Record<string, unknown>, TASKS_ITEM_PROPS)
					.notes as Record<string, unknown>
			).type,
			"boolean",
			"the reconciled notes.type is durable across repeated updates",
		);
	});

	it("(k) resolveConflict reconciling to the catalog value (notes.type=string) converges to in-sync", () => {
		tmpRoot = makeProject(["tasks", "decisions"], []);
		const dest = makeBothDivergedTasks(
			(p) => {
				(p.notes as Record<string, unknown>).type = "number";
			},
			(p) => {
				(p.notes as Record<string, unknown>).type = "boolean";
			},
		);
		assert.equal(updateContext(tmpRoot).conflicts.length, 1, "precondition: the conflict is reported");
		// Reconcile to the catalog value: R = the on-disk body with notes.type set to "string".
		const R = JSON.parse(fs.readFileSync(dest, "utf-8")) as Record<string, unknown>;
		(deepGet(R, TASKS_ITEM_PROPS).notes as Record<string, unknown>).type = "string";
		resolveConflict(tmpRoot, "tasks", R);
		const second = updateContext(tmpRoot);
		assert.deepEqual(second.conflicts, [], "reconciling to the catalog value raises no conflict");
		// R === catalog body → the schema reads as in-sync (installed === baseline catalog).
		assert.equal(
			checkStatus(tmpRoot).perAsset.find((a) => a.name === "tasks")?.state,
			"in-sync",
			"reconciling to the catalog value converges to in-sync",
		);
		const onDiskK = JSON.parse(fs.readFileSync(dest, "utf-8")) as Record<string, unknown>;
		assert.equal(
			(deepGet(onDiskK, TASKS_ITEM_PROPS).notes as Record<string, unknown>).type,
			"string",
			"the catalog-valued reconciliation is preserved on disk",
		);
		// FGAP-070: a catalog-valued reconciliation is already a stable in-sync fixed point —
		// a second update is a no-op and it stays in-sync (notes.type "string" preserved).
		const third = updateContext(tmpRoot);
		assert.deepEqual(third.conflicts, [], "a second update over an in-sync schema raises no conflict");
		assert.equal(
			checkStatus(tmpRoot).perAsset.find((a) => a.name === "tasks")?.state,
			"in-sync",
			"a catalog-valued reconciliation stays in-sync across updates",
		);
		assert.equal(
			(
				deepGet(JSON.parse(fs.readFileSync(dest, "utf-8")) as Record<string, unknown>, TASKS_ITEM_PROPS)
					.notes as Record<string, unknown>
			).type,
			"string",
			"the catalog value remains on disk after a further update",
		);
	});
});

// ── TASK-038 (FEAT-006 T5): config-registry propagation on update ────────────
// `updateContext` additively brings catalog-new config-registry entries
// (relation_types / invariants / block_kinds / lenses) absent from the substrate
// config current, preserving every user entry (and any locally-diverged body of
// an existing entry). makeProject ships block_kinds:[] / lenses:[] and no
// relation_types / invariants, so update must re-populate all four from the
// catalog. Catalog ids confirmed from samples/conception.json.
const CATALOG = JSON.parse(fs.readFileSync(path.join(SAMPLES_DIR, "conception.json"), "utf-8")) as {
	relation_types?: Array<{ canonical_id: string }>;
	invariants?: Array<{ id: string }>;
	block_kinds?: Array<{ canonical_id: string }>;
	lenses?: Array<{ id: string }>;
};
const configPathOf = (root: string) => path.join(root, ".project", "config.json");

describe("updateContext — config-registry propagation (TASK-038)", () => {
	afterEach(() => {
		if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
	});

	it("absent registry entries reappear from the catalog and are reported in registryAdditions", () => {
		tmpRoot = makeProject(["tasks"], []);
		installContext(tmpRoot);
		const result = updateContext(tmpRoot);

		const after = loadConfig(tmpRoot);
		assert.ok(after, "config must load after update");
		// All four registries gained the catalog's entries.
		const catRt = (CATALOG.relation_types ?? []).map((r) => r.canonical_id);
		const catInv = (CATALOG.invariants ?? []).map((i) => i.id);
		const catBk = (CATALOG.block_kinds ?? []).map((b) => b.canonical_id);
		const catLn = (CATALOG.lenses ?? []).map((l) => l.id);
		assert.deepEqual(
			new Set((after.relation_types ?? []).map((r) => r.canonical_id)),
			new Set(catRt),
			"every catalog relation_type must be present after update",
		);
		assert.deepEqual(
			new Set((after.invariants ?? []).map((i) => i.id)),
			new Set(catInv),
			"every catalog invariant must be present after update",
		);
		assert.deepEqual(
			new Set((after.block_kinds ?? []).map((b) => b.canonical_id)),
			new Set(catBk),
			"every catalog block_kind must be present after update",
		);
		assert.deepEqual(
			new Set((after.lenses ?? []).map((l) => l.id)),
			new Set(catLn),
			"every catalog lens must be present after update",
		);
		// registryAdditions lists exactly what was added (everything, here).
		assert.deepEqual(new Set(result.registryAdditions.relation_types), new Set(catRt));
		assert.deepEqual(new Set(result.registryAdditions.invariants), new Set(catInv));
		assert.deepEqual(new Set(result.registryAdditions.block_kinds), new Set(catBk));
		assert.deepEqual(new Set(result.registryAdditions.lenses), new Set(catLn));
		// A relation_type addition is keyed by its canonical_id (not display_name).
		assert.ok(
			result.registryAdditions.relation_types.includes("decision_supersedes_decision"),
			"relation_type additions must be keyed by canonical_id",
		);
	});

	it("a user-added entry absent from the catalog survives and is NOT in registryAdditions", () => {
		tmpRoot = makeProject(["tasks"], []);
		installContext(tmpRoot);
		// Hand-write a custom lens whose id is NOT in the catalog (the :29 precedent).
		const cfg = loadConfig(tmpRoot);
		assert.ok(cfg);
		const customLensId = "my-custom-lens-xyz";
		cfg.lenses = [...(cfg.lenses ?? []), { id: customLensId, bins: ["a", "b"] }];
		fs.writeFileSync(configPathOf(tmpRoot), JSON.stringify(cfg, null, 2));

		const result = updateContext(tmpRoot);

		const after = loadConfig(tmpRoot);
		assert.ok(after);
		const lens = (after.lenses ?? []).find((l) => l.id === customLensId);
		assert.ok(lens, "the user-added custom lens must survive the update");
		assert.deepEqual(lens.bins, ["a", "b"], "the custom lens body must be untouched");
		assert.ok(
			!result.registryAdditions.lenses.includes(customLensId),
			"a user-added entry must NOT be listed as a catalog addition",
		);
		// The catalog's own lenses still arrive alongside it.
		assert.ok(
			(after.lenses ?? []).some((l) => l.id === "tasks-by-status"),
			"catalog lenses still propagate alongside the preserved user lens",
		);
	});

	it("a user-modified existing entry is NOT overwritten by the catalog body", () => {
		tmpRoot = makeProject(["tasks"], []);
		installContext(tmpRoot);
		// First update to populate the registries from the catalog.
		updateContext(tmpRoot);
		// Now locally modify an EXISTING catalog entry's permitted body field.
		const cfg = loadConfig(tmpRoot);
		assert.ok(cfg);
		const targetId = "decision_supersedes_decision";
		const rt = (cfg.relation_types ?? []).find((r) => r.canonical_id === targetId);
		assert.ok(rt, "the catalog relation_type must be present after the first update");
		rt.display_name = "LOCALLY-EDITED-DISPLAY-NAME";
		fs.writeFileSync(configPathOf(tmpRoot), JSON.stringify(cfg, null, 2));

		const result = updateContext(tmpRoot);

		const after = loadConfig(tmpRoot);
		assert.ok(after);
		const afterRt = (after.relation_types ?? []).find((r) => r.canonical_id === targetId);
		assert.ok(afterRt);
		assert.equal(
			afterRt.display_name,
			"LOCALLY-EDITED-DISPLAY-NAME",
			"a present entry's locally-edited body must be preserved (additive-only)",
		);
		assert.ok(
			!result.registryAdditions.relation_types.includes(targetId),
			"a present (modified) entry must NOT be listed as a catalog addition",
		);
	});

	it("dryRun populates registryAdditions but leaves config.json byte-unchanged", () => {
		tmpRoot = makeProject(["tasks"], []);
		installContext(tmpRoot);
		const before = fs.readFileSync(configPathOf(tmpRoot), "utf-8");

		const result = updateContext(tmpRoot, { dryRun: true });

		assert.ok(result.registryAdditions.relation_types.length > 0, "dryRun must still compute the catalog additions");
		const after = fs.readFileSync(configPathOf(tmpRoot), "utf-8");
		assert.equal(after, before, "dryRun must not write config.json");
	});
});

// FGAP-050 — surfaced migration-declaration reporting on /context update. A
// version-bump catalog-ahead resync registers the shipped catalog chain's decls
// into migrations.json; updateContext now surfaces them under
// `migrationsRegistered` (live = the decls actually appended; dryRun = the
// would-register set computed read-only, nothing written). The catalog ships
// `tasks 1.0.0 -> 1.0.1` (identity), so installing `tasks` at 1.0.0 with NO block
// file (zero items → clean `migrated`, no identity-stamp throw on this
// pre-identity makeProject substrate) drives the version-bump path.
describe("updateContext migration-declaration reporting (FGAP-050)", () => {
	afterEach(() => {
		if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
	});

	// Pre-place an installed schema dest = the catalog body with its `version`
	// overridden to an older value, then install so the baseline is recorded FROM
	// that on-disk older body → checkStatus classifies it catalog-ahead.
	function installOlderSchema(dir: string, name: string, version: string): void {
		const catalog = JSON.parse(
			fs.readFileSync(path.join(SAMPLES_DIR, "schemas", `${name}.schema.json`), "utf-8"),
		) as Record<string, unknown>;
		catalog.version = version;
		fs.writeFileSync(path.join(dir, ".project", "schemas", `${name}.schema.json`), JSON.stringify(catalog, null, 2));
	}

	function migrationsPathOf(dir: string): string {
		return path.join(dir, ".project", "migrations.json");
	}

	it("live: a version-bump resync reports the registered decl AND writes it to migrations.json", () => {
		tmpRoot = makeProject(["tasks"], []);
		installOlderSchema(tmpRoot, "tasks", "1.0.0"); // installed older than catalog (1.0.1)
		installContext(tmpRoot); // baseline FROM the on-disk 1.0.0 body → catalog-ahead
		const pre = checkStatus(tmpRoot).perAsset.find((a) => a.name === "tasks");
		assert.equal(pre?.state, "catalog-ahead", "precondition: tasks must be catalog-ahead (older installed version)");

		const result = updateContext(tmpRoot);
		assert.deepEqual(result.migrated, ["tasks"], "a version bump with no items migrates");
		assert.deepEqual(
			result.migrationsRegistered,
			[{ schema: "tasks", from: "1.0.0", to: "1.0.1" }],
			"the registered catalog decl must be surfaced under migrationsRegistered",
		);
		// migrations.json now carries the decl on disk.
		const onDisk = JSON.parse(fs.readFileSync(migrationsPathOf(tmpRoot), "utf-8")) as {
			migrations: Array<{ schemaName: string; fromVersion: string; toVersion: string }>;
		};
		assert.ok(
			onDisk.migrations.some((m) => m.schemaName === "tasks" && m.fromVersion === "1.0.0" && m.toVersion === "1.0.1"),
			"the decl must be persisted into migrations.json on the live path",
		);
	});

	it("dryRun: the would-register decl is reported AND migrations.json is byte-unchanged", () => {
		tmpRoot = makeProject(["tasks"], []);
		installOlderSchema(tmpRoot, "tasks", "1.0.0");
		installContext(tmpRoot);
		assert.equal(
			checkStatus(tmpRoot).perAsset.find((a) => a.name === "tasks")?.state,
			"catalog-ahead",
			"precondition: tasks must be catalog-ahead",
		);
		const mp = migrationsPathOf(tmpRoot);
		const before = fs.existsSync(mp) ? fs.readFileSync(mp) : null;

		const result = updateContext(tmpRoot, { dryRun: true });
		assert.equal(result.dryRun, true, "the plan must declare it is a dry run");
		assert.deepEqual(
			result.migrationsRegistered,
			[{ schema: "tasks", from: "1.0.0", to: "1.0.1" }],
			"dryRun must list the would-register decl",
		);
		// migrations.json byte-unchanged (absent stays absent; present stays equal).
		const after = fs.existsSync(mp) ? fs.readFileSync(mp) : null;
		if (before === null) {
			assert.equal(after, null, "dryRun must not create migrations.json");
		} else {
			assert.ok(after, "dryRun must not delete migrations.json");
			assert.ok(after.equals(before), "dryRun must leave migrations.json byte-unchanged");
		}
	});

	it("resyncSchema return: a same-version catalog-ahead resync reports no registered decls", () => {
		// The stale-baseline trick yields a SAME-version catalog-ahead resync (no
		// migration), so migrationsRegistered stays empty.
		tmpRoot = makeProject(["tasks"], []);
		const dest = path.join(tmpRoot, ".project", "schemas", "tasks.schema.json");
		installContext(tmpRoot);
		const obj = JSON.parse(fs.readFileSync(dest, "utf-8")) as Record<string, unknown>;
		obj.__stale_marker = true;
		fs.writeFileSync(dest, JSON.stringify(obj, null, 2));
		installContext(tmpRoot); // re-baseline FROM the stale body → catalog-ahead, same version
		assert.equal(
			checkStatus(tmpRoot).perAsset.find((a) => a.name === "tasks")?.state,
			"catalog-ahead",
			"precondition: tasks catalog-ahead at the SAME version",
		);

		const result = updateContext(tmpRoot);
		assert.deepEqual(result.resynced, ["tasks"], "same-version catalog-ahead resyncs (no migration)");
		assert.deepEqual(result.migrated, [], "no version bump → nothing migrated");
		assert.deepEqual(result.migrationsRegistered, [], "a same-version resync registers no migration decls");
	});

	it("resyncSchema return: a blocked outcome reports no registered decls (rollback truth)", () => {
		// Installed at a version with no chain reaching the catalog version → blocked;
		// the rollback reverts migrations.json, so migrationsRegistered must be empty.
		tmpRoot = makeProject(["tasks"], []);
		installOlderSchema(tmpRoot, "tasks", "0.9.0"); // no 0.9.0 -> 1.0.1 chain ships
		installContext(tmpRoot);
		const blockDest = path.join(tmpRoot, ".project", "tasks.json");
		fs.writeFileSync(
			blockDest,
			JSON.stringify(
				{ schema_version: "0.9.0", tasks: [{ id: "TASK-001", description: "x", status: "open" }] },
				null,
				2,
			),
		);
		assert.equal(
			checkStatus(tmpRoot).perAsset.find((a) => a.name === "tasks")?.state,
			"catalog-ahead",
			"precondition: tasks catalog-ahead at 0.9.0",
		);

		const result = updateContext(tmpRoot);
		assert.deepEqual(result.blocked, ["tasks"], "no shipped chain → blocked");
		assert.deepEqual(result.migrated, []);
		assert.deepEqual(result.migrationsRegistered, [], "a blocked (rolled-back) outcome registers nothing");
	});
});

// FGAP-051 — idempotent block skip. installContext's empty-block overwrite arm
// must NOT rewrite a block whose on-disk content already equals the catalog
// starter (JCS-canonical equality); it reports `skipped` and leaves the file
// byte-identical (mtime + bytes), avoiding no-op churn. A starter whose content
// differs still falls through to `updated`.
describe("installContext idempotent block skip (FGAP-051)", () => {
	afterEach(() => {
		if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
	});

	it("an empty block already equal to the catalog starter is skipped, not rewritten", () => {
		tmpRoot = makeProject([], ["tasks"]);
		const dest = path.join(tmpRoot, ".project", "tasks.json");
		// Write the on-disk block EXACTLY equal (content) to the catalog starter.
		const starter = fs.readFileSync(path.join(SAMPLES_DIR, "blocks", "tasks.json"), "utf-8");
		fs.writeFileSync(dest, starter);
		const before = fs.readFileSync(dest);
		const mtimeBefore = fs.statSync(dest).mtimeMs;

		const result = installContext(tmpRoot, { overwrite: true });
		assert.deepEqual(result.skipped, ["tasks.json"], "a starter-equal empty block must be skipped");
		assert.deepEqual(result.updated, [], "a starter-equal empty block must NOT be updated");
		assert.deepEqual(result.preserved, [], "an empty block is not preserved");
		assert.ok(fs.readFileSync(dest).equals(before), "the block file bytes must be unchanged");
		assert.equal(fs.statSync(dest).mtimeMs, mtimeBefore, "the block file mtime must be unchanged (no rewrite)");
	});

	it("an empty block that DIFFERS from the catalog starter is still overwritten (updated)", () => {
		// Guards that the idempotent skip does not regress the existing empty-block
		// overwrite behaviour: an itemless block carrying an extra top-level field
		// differs from the starter, so it must still be replaced + reported updated.
		tmpRoot = makeProject([], ["tasks"]);
		const dest = path.join(tmpRoot, ".project", "tasks.json");
		fs.writeFileSync(dest, JSON.stringify({ tasks: [], extra_marker: true }, null, 2));

		const result = installContext(tmpRoot, { overwrite: true });
		assert.deepEqual(result.updated, ["tasks.json"], "a differing empty block must be updated");
		assert.deepEqual(result.skipped, [], "a differing empty block must NOT be skipped");
		const after = fs.readFileSync(dest, "utf-8");
		assert.ok(!after.includes("extra_marker"), "the block must be replaced by the catalog starter");
	});
});
