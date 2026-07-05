import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { readBlock, writeBlockForDir } from "./block-api.js";
import { computeContentHash } from "./content-hash.js";
import { loadConfig } from "./context.js";
import { pendingBlockedPathForDir, writeBootstrapPointer } from "./context-dir.js";
import {
	checkStatus,
	installContext,
	renderBlocked,
	renderCheckStatus,
	resolveBlocked,
	resolveConflict,
	updateContext,
	validateBlockItemsAgainstCatalog,
} from "./index.js";
import { loadMigrationsFileForDir, seedCatalogConfigMigrationDecls } from "./migrations-store.js";
import { getObject } from "./object-store.js";
import { type OpDefinition, ops } from "./ops-registry.js";
import { loadPendingBlockedForDir } from "./pending-blocked-store.js";

const SAMPLES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "samples");

let tmpRoot: string;

function makeProject(installedSchemas: string[] = [], installedBlocks: string[] = []): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-context-install-"));
	writeBootstrapPointer(dir, ".project");
	fs.mkdirSync(path.join(dir, ".project", "schemas"), { recursive: true });
	const config = {
		schema_version: "1.8.0",
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

	it("legacy heal — a direct-written 1.0.0 config with no migrations.json is seeded and installs without error", () => {
		// A pre-migration-era substrate: config stamped at 1.0.0 (lagging the bundled
		// schema), no migrations.json. installContext seeds the catalog's config
		// chain BEFORE its config read, so the ceremony heals the substrate instead
		// of throwing on the unresolvable version mismatch.
		tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-context-install-legacy-"));
		writeBootstrapPointer(tmpRoot, ".project");
		fs.mkdirSync(path.join(tmpRoot, ".project", "schemas"), { recursive: true });
		const legacyConfig = {
			schema_version: "1.0.0",
			root: ".project",
			block_kinds: [],
			lenses: [],
			installed_schemas: ["tasks"],
			installed_blocks: [],
		};
		fs.writeFileSync(path.join(tmpRoot, ".project", "config.json"), JSON.stringify(legacyConfig, null, 2));
		const result = installContext(tmpRoot);
		assert.equal(result.error, undefined, "installContext must complete on the legacy substrate");
		assert.deepEqual(result.installed, ["schemas/tasks.schema.json"]);
		const migrations = loadMigrationsFileForDir(path.join(tmpRoot, ".project"));
		assert.ok(
			migrations?.migrations.some((m) => m.schemaName === "config" && m.fromVersion === "1.0.0"),
			"installContext must seed the (config, 1.0.0) decl",
		);
		assert.ok(loadConfig(tmpRoot), "the lagging config loads through the seeded chain");
	});
});

// TASK-070 class rule: EVERY sanctioned ceremony entry point seeds the catalog's
// `config` migration chain before its first config read, so a legacy substrate
// (1.0.0 config, no migrations.json) heals on the ceremony instead of throwing.
// init / accept-all / install seeding is covered in their own suites (and the
// legacy-heal test above); this suite covers the update / check-status / resolve
// family plus the switch family (the switch tests live in
// context-switch-tool.test.ts beside their function suites).
describe("ceremony legacy-heal seeding — update / check-status / resolve family (TASK-070 class rule)", () => {
	afterEach(() => {
		if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
	});

	// The install legacy-heal fixture shape: config stamped 1.0.0 (lagging the
	// bundled schema), no migrations.json.
	function makeLegacyProject(installedSchemas: string[] = []): string {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-context-ceremony-legacy-"));
		writeBootstrapPointer(dir, ".project");
		fs.mkdirSync(path.join(dir, ".project", "schemas"), { recursive: true });
		const legacyConfig = {
			schema_version: "1.0.0",
			root: ".project",
			block_kinds: [],
			lenses: [],
			installed_schemas: installedSchemas,
			installed_blocks: [],
		};
		fs.writeFileSync(path.join(dir, ".project", "config.json"), JSON.stringify(legacyConfig, null, 2));
		return dir;
	}

	function assertConfigDeclSeeded(dir: string): void {
		const migrations = loadMigrationsFileForDir(path.join(dir, ".project"));
		assert.ok(
			migrations?.migrations.some((m) => m.schemaName === "config" && m.fromVersion === "1.0.0"),
			"the ceremony must seed the (config, 1.0.0) decl",
		);
	}

	it("updateContext completes on a legacy substrate and seeds the config decl", () => {
		tmpRoot = makeLegacyProject();
		let result!: ReturnType<typeof updateContext>;
		assert.doesNotThrow(() => {
			result = updateContext(tmpRoot);
		}, "updateContext must heal the legacy substrate, not throw on the version lag");
		assert.equal(result.error, undefined, "updateContext must complete on the legacy substrate");
		assertConfigDeclSeeded(tmpRoot);
		assert.ok(loadConfig(tmpRoot), "the lagging config loads through the seeded chain");
	});

	it("checkStatus completes on a legacy substrate and seeds the config decl (the designed heal write)", () => {
		tmpRoot = makeLegacyProject(["tasks"]);
		let report!: ReturnType<typeof checkStatus>;
		assert.doesNotThrow(() => {
			report = checkStatus(tmpRoot);
		}, "checkStatus must heal the legacy substrate, not throw on the version lag");
		assert.equal(report.summary.total, 1, "the drift report covers the declared schema");
		assertConfigDeclSeeded(tmpRoot);
		assert.ok(loadConfig(tmpRoot), "the lagging config loads through the seeded chain");
	});

	it("checkStatus on a pointer naming a NONEXISTENT dir degrades empty and materializes NOTHING", () => {
		// Degenerate pointer: .pi-context.json names a dir that was never created.
		// checkStatus must degrade exactly as it did before ceremony seeding —
		// empty report, zero writes: the seed must not mkdir the dir into
		// existence just to drop a migrations.json into it.
		tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-context-ceremony-ghost-"));
		writeBootstrapPointer(tmpRoot, ".ghost");
		const ghostDir = path.join(tmpRoot, ".ghost");
		let report!: ReturnType<typeof checkStatus>;
		assert.doesNotThrow(() => {
			report = checkStatus(tmpRoot);
		}, "checkStatus must degrade on the nonexistent substrate dir, not throw");
		assert.deepEqual(report.perAsset, []);
		assert.equal(report.summary.total, 0);
		assert.ok(!fs.existsSync(ghostDir), "checkStatus must not create the pointed-at dir");
		assert.ok(
			!fs.existsSync(path.join(ghostDir, "migrations.json")),
			"no migrations.json may be materialized anywhere",
		);
	});

	it("resolveConflict seeds before its config read — a cold call fails on ITS contract error, not the version lag", () => {
		tmpRoot = makeLegacyProject(["tasks"]);
		// A cold resolve-conflict on a baseline-less substrate fails on the MISSING
		// INSTALL BASELINE (its own contract error) — reached only because the seed
		// let stampBaselineFromBody's loadConfig walk the 1.0.0 config forward.
		assert.throws(() => resolveConflict(tmpRoot, "tasks"), /no install baseline in config/);
		assertConfigDeclSeeded(tmpRoot);
	});

	it("resolveBlocked seeds at entry — a cold call fails on its pending-entry contract error, decl present", () => {
		tmpRoot = makeLegacyProject(["tasks"]);
		assert.throws(() => resolveBlocked(tmpRoot, "tasks"), /no pending-blocked entry/);
		assertConfigDeclSeeded(tmpRoot);
	});
});

// FGAP-029 safe re-sync (slice S3): /context check-status is a PURE-READ drift
// detector — it compares the S2 install baseline against the catalog + the
// currently-installed schema files, classifies per-schema drift, and writes NOTHING
// (except the TASK-070 ceremony seed of the catalog's `config` migration decls
// into migrations.json — idempotent, covered by the legacy-heal suite above).
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

	// FGAP-078 / STORY-007 ("report which installed schemas are behind the catalog,
	// and by what version gap"): the additive `behind` / `version_delta` reporting
	// fields. Computed AFTER the classification arm — the state classifications above
	// are untouched. `installOlderSchema` overwrites the installed schema body with a
	// lower `version` so the post-install re-baseline records that older version, and
	// the catalog source (1.0.1) is then ahead → a version-bump catalog-ahead.
	function installOlderSchema(dir: string, name: string, version: string): void {
		const catalog = JSON.parse(
			fs.readFileSync(path.join(SAMPLES_DIR, "schemas", `${name}.schema.json`), "utf-8"),
		) as Record<string, unknown>;
		catalog.version = version;
		fs.writeFileSync(path.join(dir, ".project", "schemas", `${name}.schema.json`), JSON.stringify(catalog, null, 2));
	}

	it("version-bump behind: a catalog-ahead asset carries behind + a version-bump delta (from/to versions)", () => {
		tmpRoot = makeProject(["tasks"], []);
		installOlderSchema(tmpRoot, "tasks", "1.0.0"); // installed older than catalog (1.0.1)
		installContext(tmpRoot); // baseline FROM the on-disk 1.0.0 body → catalog-ahead
		const tasks = checkStatus(tmpRoot).perAsset.find((a) => a.name === "tasks");
		assert.ok(tasks);
		assert.equal(tasks.state, "catalog-ahead", "precondition: older installed version → catalog-ahead");
		assert.equal(tasks.behind, true, "a catalog-ahead asset is behind the catalog");
		assert.ok(tasks.version_delta, "a behind asset carries a version_delta");
		assert.equal(tasks.version_delta?.from, "1.0.0", "delta.from is the install baseline version");
		assert.equal(tasks.version_delta?.to, "1.0.1", "delta.to is the catalog version");
		assert.equal(tasks.version_delta?.basis, "version-bump", "distinct from/to versions → version-bump basis");
	});

	it("content-only behind: a catalog-ahead asset with no version bump carries behind + a content-only delta", () => {
		// The `__stale_marker` idiom (the simulated catalog-ahead fixture above): install,
		// mutate the installed schema body WITHOUT changing its version, then RE-install to
		// re-baseline from the stale body. Catalog content differs (hash) but the version
		// string is unchanged → content-only basis.
		tmpRoot = makeProject(["tasks"], []);
		installContext(tmpRoot);
		const dest = path.join(tmpRoot, ".project", "schemas", "tasks.schema.json");
		const obj = JSON.parse(fs.readFileSync(dest, "utf-8")) as Record<string, unknown>;
		obj.__stale_marker = true; // content diverges; version untouched
		fs.writeFileSync(dest, JSON.stringify(obj, null, 2));
		installContext(tmpRoot); // re-baseline FROM the stale body → catalog-ahead, same version
		const tasks = checkStatus(tmpRoot).perAsset.find((a) => a.name === "tasks");
		assert.ok(tasks);
		assert.equal(tasks.state, "catalog-ahead", "precondition: content drift with equal version → catalog-ahead");
		assert.equal(tasks.behind, true, "a catalog-ahead asset is behind the catalog");
		assert.equal(tasks.version_delta?.basis, "content-only", "equal/undefined versions → content-only basis");
		assert.equal(
			tasks.version_delta?.from,
			tasks.version_delta?.to,
			"a content-only drift has matching from/to versions",
		);
	});

	it("not-behind assets (locally-modified + in-sync) carry NEITHER behind nor version_delta", () => {
		tmpRoot = makeProject(["tasks", "decisions"], []);
		installContext(tmpRoot);
		// Mutate the installed `tasks` dest so it is locally-modified; `decisions` stays in-sync.
		const dest = path.join(tmpRoot, ".project", "schemas", "tasks.schema.json");
		const obj = JSON.parse(fs.readFileSync(dest, "utf-8")) as Record<string, unknown>;
		obj.__local_edit_marker = true;
		fs.writeFileSync(dest, JSON.stringify(obj, null, 2));
		const byName = Object.fromEntries(checkStatus(tmpRoot).perAsset.map((a) => [a.name, a]));
		assert.equal(byName.tasks.state, "locally-modified");
		assert.equal(byName.tasks.behind, undefined, "a locally-modified asset is not behind");
		assert.equal(byName.tasks.version_delta, undefined, "a not-behind asset carries no version_delta");
		assert.equal(byName.decisions.state, "in-sync");
		assert.equal(byName.decisions.behind, undefined, "an in-sync asset is not behind");
		assert.equal(byName.decisions.version_delta, undefined, "an in-sync asset carries no version_delta");
	});

	it("renderCheckStatus annotates behind assets with the version gap (both bases) and keeps the state grouping", () => {
		// version-bump asset
		tmpRoot = makeProject(["tasks"], []);
		installOlderSchema(tmpRoot, "tasks", "1.0.0");
		installContext(tmpRoot);
		const bumpRender = renderCheckStatus(checkStatus(tmpRoot));
		assert.ok(bumpRender.includes("catalog-ahead"), "the state grouping (catalog-ahead) is preserved");
		assert.ok(
			bumpRender.includes("tasks (1.0.0 -> 1.0.1)"),
			"a version-bump behind asset shows the from -> to version pair inline",
		);
		fs.rmSync(tmpRoot, { recursive: true, force: true });

		// content-only asset
		tmpRoot = makeProject(["tasks"], []);
		installContext(tmpRoot);
		const dest = path.join(tmpRoot, ".project", "schemas", "tasks.schema.json");
		const obj = JSON.parse(fs.readFileSync(dest, "utf-8")) as Record<string, unknown>;
		obj.__stale_marker = true;
		fs.writeFileSync(dest, JSON.stringify(obj, null, 2));
		installContext(tmpRoot);
		const contentRender = renderCheckStatus(checkStatus(tmpRoot));
		assert.ok(contentRender.includes("catalog-ahead"), "the state grouping is preserved for content-only drift");
		assert.ok(
			/tasks \([^)]*content changed\)/.test(contentRender),
			"a content-only behind asset is annotated 'content changed'",
		);
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
		// description (so the bytes differ but no migration contract changes). The
		// block item must be VALID against the incoming catalog body — the same-
		// version arm now re-validates populated blocks before overwriting.
		const dest = installSchemaFixture(tmpRoot, "tasks", catVer, { description: "DRIFTED LOCAL DESCRIPTION" });
		const blockDest = writeBlockFixture(tmpRoot, "tasks", {
			schema_version: catVer,
			tasks: [{ id: "TASK-001", description: "filed", status: "planned" }],
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

	it("same-version NARROWING catalog change over items that violate it → blocked (validation-failed), schema byte-unchanged", () => {
		const catVer = catalogTasksVersion();
		tmpRoot = makeProject(["tasks"], []);
		// Installed schema = catalog body WIDENED with an extra status enum value
		// the catalog does not carry; the block item uses it. The same-version
		// resync to the (narrower) catalog body would invalidate the item on the
		// enum — must refuse, not overwrite.
		const catalog = JSON.parse(
			fs.readFileSync(path.join(SAMPLES_DIR, "schemas", "tasks.schema.json"), "utf-8"),
		) as Record<string, unknown>;
		const widened = JSON.parse(JSON.stringify(catalog)) as Record<string, unknown>;
		(
			(
				(
					((widened.properties as Record<string, unknown>).tasks as Record<string, unknown>).items as Record<
						string,
						unknown
					>
				).properties as Record<string, unknown>
			).status as Record<string, unknown>
		).enum = ["planned", "in-progress", "completed", "blocked", "cancelled", "parked"];
		const dest = path.join(tmpRoot, ".project", "schemas", "tasks.schema.json");
		fs.writeFileSync(dest, JSON.stringify(widened, null, 2));
		writeBlockFixture(tmpRoot, "tasks", {
			schema_version: catVer,
			tasks: [{ id: "TASK-001", description: "filed", status: "parked" }],
		});
		// Record the install baseline over the EXISTING (widened) schema — skip-if-
		// exists preserves it and fingerprints it, so checkStatus reads the drift as
		// catalog-ahead (content-only) and update routes it through the resync arm.
		installContext(tmpRoot);
		const schemaBefore = fs.readFileSync(dest);
		const result = updateContext(tmpRoot);
		assert.deepEqual(result.blocked, ["tasks"], "narrowing same-version resync must block");
		assert.deepEqual(result.resynced, []);
		assert.ok(fs.readFileSync(dest).equals(schemaBefore), "installed schema must be byte-unchanged on refusal");
		const detail = result.blockedDetail.find((d) => d.name === "tasks");
		assert.equal(detail?.reason, "validation-failed");
		assert.ok(
			detail?.failures?.some((f) => f.itemId === "TASK-001" && f.keyword === "enum"),
			"per-item failure must name the violating item and keyword",
		);
	});

	it("same-version NARROWING change: --dryRun predicts the same blocked outcome, writing nothing", () => {
		const catVer = catalogTasksVersion();
		tmpRoot = makeProject(["tasks"], []);
		const catalog = JSON.parse(
			fs.readFileSync(path.join(SAMPLES_DIR, "schemas", "tasks.schema.json"), "utf-8"),
		) as Record<string, unknown>;
		const widened = JSON.parse(JSON.stringify(catalog)) as Record<string, unknown>;
		(
			(
				(
					((widened.properties as Record<string, unknown>).tasks as Record<string, unknown>).items as Record<
						string,
						unknown
					>
				).properties as Record<string, unknown>
			).status as Record<string, unknown>
		).enum = ["planned", "in-progress", "completed", "blocked", "cancelled", "parked"];
		const dest = path.join(tmpRoot, ".project", "schemas", "tasks.schema.json");
		fs.writeFileSync(dest, JSON.stringify(widened, null, 2));
		const blockDest = writeBlockFixture(tmpRoot, "tasks", {
			schema_version: catVer,
			tasks: [{ id: "TASK-001", description: "filed", status: "parked" }],
		});
		installContext(tmpRoot); // baseline over the existing widened schema (skip-if-exists)
		const schemaBefore = fs.readFileSync(dest);
		const blockBefore = fs.readFileSync(blockDest);
		const plan = updateContext(tmpRoot, { dryRun: true });
		assert.deepEqual(plan.blocked, ["tasks"], "dryRun must predict the blocked outcome");
		const detail = plan.blockedDetail.find((d) => d.name === "tasks");
		assert.equal(detail?.reason, "validation-failed");
		assert.ok(fs.readFileSync(dest).equals(schemaBefore), "dryRun must not touch the schema");
		assert.ok(fs.readFileSync(blockDest).equals(blockBefore), "dryRun must not touch the block");
	});

	// Build the same-version NARROWING fixture (widened installed schema + a block
	// item using the widened enum value) with its install baseline recorded — the
	// update run over it blocks 'tasks' while the registry propagation (against
	// makeProject's empty-registry config) still applies, i.e. a partial run.
	function makeNarrowedTasksFixture(): { dest: string; blockDest: string; configDest: string } {
		const catVer = catalogTasksVersion();
		tmpRoot = makeProject(["tasks"], []);
		const catalog = JSON.parse(
			fs.readFileSync(path.join(SAMPLES_DIR, "schemas", "tasks.schema.json"), "utf-8"),
		) as Record<string, unknown>;
		const widened = JSON.parse(JSON.stringify(catalog)) as Record<string, unknown>;
		(
			(
				(
					((widened.properties as Record<string, unknown>).tasks as Record<string, unknown>).items as Record<
						string,
						unknown
					>
				).properties as Record<string, unknown>
			).status as Record<string, unknown>
		).enum = ["planned", "in-progress", "completed", "blocked", "cancelled", "parked"];
		const dest = path.join(tmpRoot, ".project", "schemas", "tasks.schema.json");
		fs.writeFileSync(dest, JSON.stringify(widened, null, 2));
		const blockDest = writeBlockFixture(tmpRoot, "tasks", {
			schema_version: catVer,
			tasks: [{ id: "TASK-001", description: "filed", status: "parked" }],
		});
		installContext(tmpRoot); // baseline over the existing widened schema (skip-if-exists)
		return { dest, blockDest, configDest: path.join(tmpRoot, ".project", "config.json") };
	}

	it("partial run (blocked schema + applied registry additions) → partialApplication populated both sides with a legible summary", () => {
		makeNarrowedTasksFixture();
		const result = updateContext(tmpRoot);
		assert.deepEqual(result.blocked, ["tasks"], "precondition: the narrowing resync blocks");
		const ra = result.registryAdditions;
		const additionCount = ra.relation_types.length + ra.invariants.length + ra.block_kinds.length + ra.lenses.length;
		assert.ok(additionCount > 0, "precondition: registry additions applied against the empty-registry config");
		const pa = result.partialApplication;
		assert.ok(pa, "a run that both refused and applied must carry partialApplication");
		assert.deepEqual(pa.notApplied.blocked, ["tasks"]);
		assert.deepEqual(pa.notApplied.refused, []);
		assert.deepEqual(pa.notApplied.conflicts, []);
		assert.deepEqual(pa.applied.registryAdditions, ra, "applied side must mirror the registryAdditions channel");
		assert.deepEqual(pa.applied.resynced, []);
		assert.ok(pa.summary.includes("'tasks' (validation-failed)"), "summary must name the blocked schema + reason");
		assert.ok(pa.summary.includes("registry additions"), "summary must name the applied category");
		assert.ok(!pa.summary.includes("dryRun"), "a live summary must not read as a preview");
		// A SECOND run over the same substrate refuses again but applies nothing
		// (registries already propagated) — refusal-only is not partial application.
		const second = updateContext(tmpRoot);
		assert.deepEqual(second.blocked, ["tasks"], "the block persists on the second run");
		assert.equal(second.partialApplication, undefined, "a nothing-applied run must carry no partialApplication");
	});

	it("clean run (nothing refused) → no partialApplication; existing channels unchanged", () => {
		const catVer = catalogTasksVersion();
		tmpRoot = makeProject(["tasks"], []);
		installSchemaFixture(tmpRoot, "tasks", catVer, { description: "DRIFTED LOCAL DESCRIPTION" });
		writeBlockFixture(tmpRoot, "tasks", {
			schema_version: catVer,
			tasks: [{ id: "TASK-001", description: "filed", status: "planned" }],
		});
		installContext(tmpRoot); // baseline over the existing drifted schema (skip-if-exists)
		const result = updateContext(tmpRoot);
		assert.deepEqual(result.resynced, ["tasks"], "precondition: the same-version drift resyncs");
		assert.deepEqual(result.blocked, []);
		assert.equal(result.partialApplication, undefined, "a nothing-refused run must carry no partialApplication");
	});

	it("non-validation write-boundary throw on a version bump → blocked with reason write-failed: message carried, NO markers, NO pending record, files byte-unchanged", () => {
		// Two items sharing an id pass AJV (no uniqueness constraint) and the
		// in-memory identity migration, so the refusal fires at the WRITE boundary
		// (the block writer's duplicate-id guard) — a NON-validation throw. The
		// classification must say so (write-failed), and the validation-only
		// consequences (markers, pending-blocked) must not fire. (Formerly this
		// cell used a pre-identity substrate's stamping throw as the trigger; the
		// ceremony-entry identity establishment now heals that at entry.)
		tmpRoot = makeProject(["tasks"], []);
		installSchemaFixture(tmpRoot, "tasks", "1.0.0"); // installed at the older version
		const dest = path.join(tmpRoot, ".project", "schemas", "tasks.schema.json");
		const blockDest = writeBlockFixture(tmpRoot, "tasks", {
			schema_version: "1.0.0",
			tasks: [
				{ id: "TASK-001", description: "alpha", status: "planned" },
				{ id: "TASK-001", description: "beta", status: "planned" },
			],
		});
		installContext(tmpRoot); // baseline over the existing 1.0.0 schema (skip-if-exists); establishes identity
		const schemaBefore = fs.readFileSync(dest);
		const blockBefore = fs.readFileSync(blockDest);
		const result = updateContext(tmpRoot);
		assert.deepEqual(result.blocked, ["tasks"], "the write-boundary throw must refuse the resync");
		const detail = result.blockedDetail.find((d) => d.name === "tasks");
		assert.equal(detail?.reason, "write-failed", "a non-validation throw must not be labeled validation-failed");
		assert.ok(
			detail?.failures?.some((f) => f.keyword === "error" && f.message.includes("already exists")),
			"the failures entry must carry the thrown write-boundary message",
		);
		assert.equal(detail?.premarker_hash, undefined, "a write-failed refusal must not inscribe markers");
		assert.ok(fs.readFileSync(dest).equals(schemaBefore), "installed schema must be byte-unchanged");
		assert.ok(fs.readFileSync(blockDest).equals(blockBefore), "block file must be byte-unchanged (no markers)");
		assert.equal(
			fs.existsSync(pendingBlockedPathForDir(path.join(tmpRoot, ".project"))),
			false,
			"a write-failed refusal must not persist a pending-blocked record",
		);
	});

	it("ceremony-entry identity establishment: a live update on a pre-identity substrate mints + persists + registers + reports; already-established is untouched; dryRun establishes nothing", () => {
		const catVer = catalogTasksVersion();
		tmpRoot = makeProject(["tasks"], []);
		installSchemaFixture(tmpRoot, "tasks", catVer);
		writeBlockFixture(tmpRoot, "tasks", {
			schema_version: catVer,
			tasks: [{ id: "TASK-001", description: "filed", status: "planned" }],
		});
		installContext(tmpRoot); // records the baseline AND establishes identity at its own entry
		const configDest = path.join(tmpRoot, ".project", "config.json");
		const installedConfig = JSON.parse(fs.readFileSync(configDest, "utf-8")) as Record<string, unknown>;
		assert.match(
			String(installedConfig.substrate_id),
			/^sub-[0-9a-f]{16}$/,
			"install must establish identity at its entry",
		);
		// Strip the id back off to model a pre-identity substrate reaching update.
		delete installedConfig.substrate_id;
		fs.writeFileSync(configDest, JSON.stringify(installedConfig, null, 2));
		// dryRun: preview writes establish nothing.
		const plan = updateContext(tmpRoot, { dryRun: true });
		assert.equal(plan.substrateIdEstablished, undefined, "dryRun must not establish identity");
		const afterDry = JSON.parse(fs.readFileSync(configDest, "utf-8")) as Record<string, unknown>;
		assert.equal(afterDry.substrate_id, undefined, "dryRun must leave the config identity-less");
		// Live: establishes, persists, registers, reports.
		const live = updateContext(tmpRoot);
		assert.match(
			live.substrateIdEstablished ?? "",
			/^sub-[0-9a-f]{16}$/,
			"a live update on a pre-identity substrate must report the established id",
		);
		const afterLive = JSON.parse(fs.readFileSync(configDest, "utf-8")) as Record<string, unknown>;
		assert.equal(afterLive.substrate_id, live.substrateIdEstablished, "the established id must be persisted");
		const registry = JSON.parse(fs.readFileSync(path.join(tmpRoot, ".pi-context-registry.json"), "utf-8")) as {
			substrates: Record<string, unknown>;
		};
		assert.ok(
			registry.substrates[live.substrateIdEstablished as string],
			"the established id must be registered in the project registry",
		);
		// Already-established: never re-minted, field absent.
		const second = updateContext(tmpRoot);
		assert.equal(second.substrateIdEstablished, undefined, "an established substrate is untouched (no re-mint)");
		const afterSecond = JSON.parse(fs.readFileSync(configDest, "utf-8")) as Record<string, unknown>;
		assert.equal(afterSecond.substrate_id, live.substrateIdEstablished, "the on-disk id is immutable");
	});

	it("pre-identity version bump heals: dry predicts migrated and the live run migrates (dry/live agreement)", () => {
		tmpRoot = makeProject(["tasks"], []);
		installSchemaFixture(tmpRoot, "tasks", "1.0.0");
		const blockDest = writeBlockFixture(tmpRoot, "tasks", {
			schema_version: "1.0.0",
			tasks: [{ id: "TASK-001", description: "filed", status: "planned" }],
		});
		installContext(tmpRoot); // baseline (skip-if-exists) + identity establishment at install's entry
		const configDest = path.join(tmpRoot, ".project", "config.json");
		const cfg = JSON.parse(fs.readFileSync(configDest, "utf-8")) as Record<string, unknown>;
		delete cfg.substrate_id; // model the pre-identity operator substrate reaching update
		fs.writeFileSync(configDest, JSON.stringify(cfg, null, 2));
		const plan = updateContext(tmpRoot, { dryRun: true });
		assert.deepEqual(plan.migrated, ["tasks"], "dry must predict the migrate");
		assert.deepEqual(plan.blocked, []);
		const live = updateContext(tmpRoot);
		assert.deepEqual(live.migrated, ["tasks"], "the healed live run must agree with the prediction");
		assert.deepEqual(live.blocked, [], "the former pre-identity refusal must not fire");
		assert.match(live.substrateIdEstablished ?? "", /^sub-[0-9a-f]{16}$/);
		const block = JSON.parse(fs.readFileSync(blockDest, "utf-8")) as { tasks: Array<Record<string, unknown>> };
		assert.ok(
			block.tasks.every((t) => typeof t.oid === "string"),
			"the migrated items are identity-stamped under the established id",
		);
	});

	it("resolveBlocked commit throw → all-or-nothing: every touched file byte-restored, pending intact, resolved:false with the truthful failure", () => {
		// Real flow to the pending state: a genuine validation-failed block persists
		// markers + pending. Rewrite the block marker-free with the enum fixed but a
		// DUPLICATED item id (passes the target re-validation — no uniqueness
		// constraint — but the commit's writeBlockForDir duplicate-id guard throws
		// at the write boundary), so the commit must restore everything it touched.
		// (Formerly this cell used a pre-identity substrate's stamping throw; the
		// ceremony-entry identity establishment now heals that at entry.)
		makeNarrowedTasksFixture();
		const blocked = updateContext(tmpRoot);
		assert.deepEqual(blocked.blocked, ["tasks"], "precondition: the narrowing resync validation-blocks");
		const substrateDir = path.join(tmpRoot, ".project");
		const dest = path.join(substrateDir, "schemas", "tasks.schema.json");
		const blockDest = path.join(substrateDir, "tasks.json");
		const pendingPath = pendingBlockedPathForDir(substrateDir);
		assert.ok(fs.existsSync(pendingPath), "precondition: a validation-failed block persists pending");
		const catVer = catalogTasksVersion();
		fs.writeFileSync(
			blockDest,
			JSON.stringify(
				{
					schema_version: catVer,
					tasks: [
						{ id: "TASK-001", description: "filed", status: "planned" },
						{ id: "TASK-001", description: "twin", status: "planned" },
					],
				},
				null,
				2,
			),
		);
		const migrationsPath = path.join(substrateDir, "migrations.json");
		const before = new Map<string, Buffer | null>();
		for (const f of [dest, blockDest, pendingPath, migrationsPath, path.join(substrateDir, "config.json")]) {
			before.set(f, fs.existsSync(f) ? fs.readFileSync(f) : null);
		}
		const r = resolveBlocked(tmpRoot, "tasks");
		assert.equal(r.resolved, false, "the write-boundary throw must refuse the commit, not partially commit");
		assert.ok(
			!r.resolved && r.failures.some((f) => f.message.includes("already exists")),
			"the refusal must carry the truthful write-boundary failure",
		);
		for (const [f, bytes] of before) {
			if (bytes === null) {
				assert.equal(fs.existsSync(f), false, `${path.basename(f)} must not be created by a refused commit`);
			} else {
				assert.ok(fs.readFileSync(f).equals(bytes), `${path.basename(f)} must be byte-restored on the refused commit`);
			}
		}
	});

	it("partial run under --dryRun → predicted partialApplication in the same shape, writing nothing", () => {
		const { dest, blockDest, configDest } = makeNarrowedTasksFixture();
		const schemaBefore = fs.readFileSync(dest);
		const blockBefore = fs.readFileSync(blockDest);
		const configBefore = fs.readFileSync(configDest);
		const plan = updateContext(tmpRoot, { dryRun: true });
		assert.deepEqual(plan.blocked, ["tasks"], "precondition: dryRun predicts the block");
		const pa = plan.partialApplication;
		assert.ok(pa, "dryRun must predict the partiality in the same shape");
		assert.deepEqual(pa.notApplied.blocked, ["tasks"]);
		assert.deepEqual(pa.applied.registryAdditions, plan.registryAdditions);
		assert.ok(pa.summary.includes("dryRun preview"), "the predicted summary must declare itself a preview");
		assert.ok(fs.readFileSync(dest).equals(schemaBefore), "dryRun must not touch the schema");
		assert.ok(fs.readFileSync(blockDest).equals(blockBefore), "dryRun must not touch the block");
		assert.ok(fs.readFileSync(configDest).equals(configBefore), "dryRun must not write the registry additions");
	});

	// Re-greened per the ceremony-entry identity establishment decision (DEC-0020 —
	// FGAP-033): installContext establishes a substrate_id at entry on this
	// pre-identity substrate (makeProject writes none), so the migrate write's
	// identity stamp proceeds instead of refusing.
	it("version bump WITH a shipped identity migration + populated block → migrated, item fields intact", () => {
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
		assert.match(
			result.substrateIdEstablished ?? "",
			/^sub-[0-9a-f]{16}$/,
			"the ceremony must establish + report the substrate identity it minted",
		);
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
		// installContext seeds the catalog's config migration decl at entry; seed
		// here first so the byte capture reflects the post-seed steady state and
		// the blocked rollback is asserted against it.
		seedCatalogConfigMigrationDecls(path.join(tmpRoot, ".project"));
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
		// installContext seeds the catalog's config decl at entry; seed first so
		// the byte capture reflects the post-seed steady state.
		seedCatalogConfigMigrationDecls(path.join(tmpRoot, ".project"));
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
		// First install lands the catalog schema (1.0.1) fresh. The block item is
		// VALID against the catalog body — the same-version arm re-validates
		// populated blocks before the verbatim re-copy.
		installContext(tmpRoot);
		writeBlockFixture(tmpRoot, "tasks", {
			schema_version: catVer,
			tasks: [{ id: "TASK-001", description: "filed", status: "planned" }],
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

	// Re-greened per the ceremony-entry identity establishment decision (DEC-0020 —
	// FGAP-033): the ceremony establishes identity at entry, the migrate proceeds,
	// and the refreshed baseline reports in-sync.
	it("after a migrate, check-status reports the schema in-sync (baseline refreshed)", () => {
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
		// TASK-046 / FGAP-066: the faithful dryRun predicts the PRECISE outcome — this
		// fixture is a version-bump (1.0.0 → 1.0.1) with NO items, so the live path
		// reports `migrated`; the dry prediction must bucket it `migrated`, not
		// `resynced`.
		assert.deepEqual(result.migrated, ["tasks"], "a version-bump no-items dryRun predicts migrated, not resynced");
		assert.deepEqual(result.resynced, [], "a version-bump no-items dryRun is NOT predicted as resynced");
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

// TASK-046 / FGAP-066 — faithful dryRun outcome prediction. `update --dryRun`
// must predict the PRECISE per-schema catalog-ahead bucket (resynced / migrated /
// blocked) the live (`!dryRun`) path would land, by an in-memory forward-migration
// + re-validation. Each case runs dry on a fixture, asserts the bucket, then runs
// live on an IDENTICAL fixture and asserts the SAME bucket (dry == live parity).
describe("updateContext dryRun outcome parity (TASK-046 / FGAP-066)", () => {
	afterEach(() => {
		if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
	});

	// Pre-place an installed schema dest = the catalog body with its `version`
	// overridden to an older value, then install so the baseline is recorded FROM
	// that on-disk older body → checkStatus classifies it catalog-ahead. (Mirrors
	// the FGAP-050 suite's installOlderSchema.)
	function installOlderSchema(dir: string, name: string, version: string): void {
		const catalog = JSON.parse(
			fs.readFileSync(path.join(SAMPLES_DIR, "schemas", `${name}.schema.json`), "utf-8"),
		) as Record<string, unknown>;
		catalog.version = version;
		fs.writeFileSync(path.join(dir, ".project", "schemas", `${name}.schema.json`), JSON.stringify(catalog, null, 2));
	}

	// A valid substrate_id (`^sub-[0-9a-f]{16}$`) seeded into the fixture config so
	// the LIVE path's identity-stamping (writeBlockForDir → substrateIdForDir) does
	// not throw. Without it, a live populated-block migrate is caught inside
	// resyncSchema's try and refused as `blocked` (the pre-identity substrate
	// behavior the skipped S4 migrate test documents), which would defeat the
	// dry==live migrated parity these cases assert.
	const FIXTURE_SUBSTRATE_ID = "sub-0123456789abcdef";

	// Build a catalog-ahead `tasks` fixture at the older `version`, optionally with
	// a populated tasks.json block carrying `schema_version` + the supplied items.
	function makeCatalogAheadTasks(version: string, items?: Array<Record<string, unknown>>): string {
		const dir = makeProject(["tasks"], []);
		installOlderSchema(dir, "tasks", version);
		installContext(dir); // baseline FROM the on-disk older body → catalog-ahead
		// Seed a substrate_id post-install so the live stamping path can mint oids.
		const cfgPath = path.join(dir, ".project", "config.json");
		const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf-8")) as Record<string, unknown>;
		cfg.substrate_id = FIXTURE_SUBSTRATE_ID;
		fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
		if (items) {
			fs.writeFileSync(
				path.join(dir, ".project", "tasks.json"),
				JSON.stringify({ schema_version: version, tasks: items }, null, 2),
			);
		}
		const state = checkStatus(dir).perAsset.find((a) => a.name === "tasks")?.state;
		assert.equal(state, "catalog-ahead", `precondition: tasks must be catalog-ahead (installed ${version})`);
		return dir;
	}

	it("(a) blocked — a populated block whose item fails the catalog schema (chain present): dry == live == blocked, no decl leak", () => {
		// 1.0.0 → 1.0.1 identity chain ships; the item passes through the identity
		// migration unchanged and must re-validate against the catalog 1.0.1 schema.
		// An invalid `status` enum value makes that re-validation FAIL → blocked.
		const badItem = { id: "TASK-001", description: "x", status: "not-a-valid-status" };
		const dryDir = makeCatalogAheadTasks("1.0.0", [badItem]);
		const dry = updateContext(dryDir, { dryRun: true });
		assert.deepEqual(dry.blocked, ["tasks"], "dry: a validation-failing populated block predicts blocked");
		assert.deepEqual(
			dry.migrationsRegistered,
			[],
			"FGAP-066: a dry-blocked schema must leak NO would-register migration decls",
		);
		fs.rmSync(dryDir, { recursive: true, force: true });

		const liveDir = makeCatalogAheadTasks("1.0.0", [badItem]);
		const live = updateContext(liveDir);
		assert.deepEqual(live.blocked, ["tasks"], "live: the same fixture blocks");
		assert.deepEqual(live.migrationsRegistered, [], "live: a blocked (rolled-back) outcome registers nothing");
		fs.rmSync(liveDir, { recursive: true, force: true });

		// TASK-048 / FGAP-077: dry == live blockedDetail for the validation-failed case.
		// Re-derive both fresh (the dirs above were removed) and compare the diagnostic
		// detail (reason + version pair + per-item failures naming the failing item id).
		const dryDetailDir = makeCatalogAheadTasks("1.0.0", [badItem]);
		const dryDetail = updateContext(dryDetailDir, { dryRun: true }).blockedDetail;
		fs.rmSync(dryDetailDir, { recursive: true, force: true });
		const liveDetailDir = makeCatalogAheadTasks("1.0.0", [badItem]);
		const liveDetail = updateContext(liveDetailDir).blockedDetail;
		fs.rmSync(liveDetailDir, { recursive: true, force: true });
		// TASK-052 / FGAP-081 FIX 2: the live run inscribes markers and records premarker_hash
		// on its blockedDetail (the write attestation renderBlocked keys its past-tense claim
		// on); the dry preview writes nothing and carries no premarker_hash — an INTENDED
		// divergence. The TASK-048 diagnostic detail (reason + version pair + per-item failures)
		// must still be identical, so compare with premarker_hash stripped, then assert the
		// attestation is present live / absent dry.
		const strip = (ds: typeof dryDetail) => ds.map(({ premarker_hash, ...rest }) => rest);
		assert.deepEqual(
			strip(dryDetail),
			strip(liveDetail),
			"TASK-048: dry blockedDetail == live blockedDetail diagnostic (validation-failed), premarker_hash aside",
		);
		assert.ok(!dryDetail[0]?.premarker_hash, "FIX 2: dry preview carries no premarker_hash (nothing written)");
		assert.ok(liveDetail[0]?.premarker_hash, "FIX 2: the live run records premarker_hash (markers written)");
		assert.equal(dryDetail.length, 1, "one blocked-schema detail entry");
		const d = dryDetail[0];
		assert.equal(d.name, "tasks");
		assert.equal(d.reason, "validation-failed");
		assert.equal(d.from, "1.0.0");
		assert.equal(d.to, "1.0.1");
		assert.ok(Array.isArray(d.failures) && d.failures.length >= 1, "validation-failed carries per-item failures");
		const enumFailure = d.failures?.find((f) => f.instancePath === "/tasks/0/status");
		assert.ok(enumFailure, "the failing status field is reported by instancePath");
		assert.equal(enumFailure?.itemId, "TASK-001", "the failing item id is resolved from the instancePath");
		assert.equal(typeof enumFailure?.keyword, "string");
		assert.equal(typeof enumFailure?.message, "string");
	});

	it("(b) migrated — a populated block that migrates + re-validates clean: dry == live == migrated, decls listed", () => {
		// A valid item passes the identity migration and re-validates against the
		// catalog 1.0.1 schema → migrated; the would-register decl is surfaced.
		const goodItem = { id: "TASK-001", description: "x", status: "planned" };
		const expectedDecls = [{ schema: "tasks", from: "1.0.0", to: "1.0.1" }];
		const dryDir = makeCatalogAheadTasks("1.0.0", [goodItem]);
		const dry = updateContext(dryDir, { dryRun: true });
		assert.deepEqual(dry.migrated, ["tasks"], "dry: a clean-migrating populated block predicts migrated");
		assert.deepEqual(dry.blocked, [], "dry: a clean migration is not blocked");
		assert.deepEqual(dry.migrationsRegistered, expectedDecls, "dry: the would-register decl is listed");
		fs.rmSync(dryDir, { recursive: true, force: true });

		const liveDir = makeCatalogAheadTasks("1.0.0", [goodItem]);
		const live = updateContext(liveDir);
		assert.deepEqual(live.migrated, ["tasks"], "live: the same fixture migrates");
		assert.deepEqual(live.migrationsRegistered, expectedDecls, "live: the registered decl is surfaced");
		fs.rmSync(liveDir, { recursive: true, force: true });
	});

	it("(c) resynced + migrated — same-version drift resyncs; version-bump zero-items migrates: dry == live", () => {
		// Same-version catalog-ahead (the stale-marker trick) → no transition →
		// resynced. Dry must predict resynced; live must land resynced.
		const makeSameVersionDrift = (): string => {
			const dir = makeProject(["tasks"], []);
			installContext(dir);
			const dest = path.join(dir, ".project", "schemas", "tasks.schema.json");
			const obj = JSON.parse(fs.readFileSync(dest, "utf-8")) as Record<string, unknown>;
			obj.__stale_marker = true;
			fs.writeFileSync(dest, JSON.stringify(obj, null, 2));
			installContext(dir); // re-baseline FROM the stale body → catalog-ahead, SAME version
			assert.equal(
				checkStatus(dir).perAsset.find((a) => a.name === "tasks")?.state,
				"catalog-ahead",
				"precondition: tasks catalog-ahead at the SAME version",
			);
			return dir;
		};
		const dryDriftDir = makeSameVersionDrift();
		const dryDrift = updateContext(dryDriftDir, { dryRun: true });
		assert.deepEqual(dryDrift.resynced, ["tasks"], "dry: same-version drift predicts resynced");
		assert.deepEqual(dryDrift.migrationsRegistered, [], "dry: a same-version resync registers no decls");
		fs.rmSync(dryDriftDir, { recursive: true, force: true });

		const liveDriftDir = makeSameVersionDrift();
		const liveDrift = updateContext(liveDriftDir);
		assert.deepEqual(liveDrift.resynced, ["tasks"], "live: same-version drift resyncs");
		assert.deepEqual(liveDrift.migrationsRegistered, [], "live: a same-version resync registers no decls");
		fs.rmSync(liveDriftDir, { recursive: true, force: true });

		// Version-bump with ZERO items (no block file) → migrated.
		const dryBumpDir = makeCatalogAheadTasks("1.0.0");
		const dryBump = updateContext(dryBumpDir, { dryRun: true });
		assert.deepEqual(dryBump.migrated, ["tasks"], "dry: version-bump zero-items predicts migrated");
		assert.deepEqual(dryBump.resynced, [], "dry: version-bump zero-items is not resynced");
		fs.rmSync(dryBumpDir, { recursive: true, force: true });

		const liveBumpDir = makeCatalogAheadTasks("1.0.0");
		const liveBump = updateContext(liveBumpDir);
		assert.deepEqual(liveBump.migrated, ["tasks"], "live: version-bump zero-items migrates");
		assert.deepEqual(liveBump.resynced, [], "live: version-bump zero-items is not resynced");
		fs.rmSync(liveBumpDir, { recursive: true, force: true });
	});

	it("(d) blocked — a version bump with NO shipped chain reaching the catalog version: dry == live == blocked", () => {
		// No 0.9.0 → 1.0.1 chain ships → the live path refuses; the dry prediction
		// must bucket it blocked, with no decl leak.
		const dryDir = makeCatalogAheadTasks("0.9.0");
		const dry = updateContext(dryDir, { dryRun: true });
		assert.deepEqual(dry.blocked, ["tasks"], "dry: no-chain version bump predicts blocked");
		assert.deepEqual(dry.migrationsRegistered, [], "dry: a no-chain blocked prediction leaks no decls");
		fs.rmSync(dryDir, { recursive: true, force: true });

		const liveDir = makeCatalogAheadTasks("0.9.0");
		const live = updateContext(liveDir);
		assert.deepEqual(live.blocked, ["tasks"], "live: no-chain version bump blocks");
		assert.deepEqual(live.migrationsRegistered, [], "live: a no-chain blocked outcome registers nothing");
		fs.rmSync(liveDir, { recursive: true, force: true });

		// TASK-048 / FGAP-077: dry == live blockedDetail for the no-migration-chain case.
		const dryDetailDir = makeCatalogAheadTasks("0.9.0");
		const dryDetail = updateContext(dryDetailDir, { dryRun: true }).blockedDetail;
		fs.rmSync(dryDetailDir, { recursive: true, force: true });
		const liveDetailDir = makeCatalogAheadTasks("0.9.0");
		const liveDetail = updateContext(liveDetailDir).blockedDetail;
		fs.rmSync(liveDetailDir, { recursive: true, force: true });
		assert.deepEqual(dryDetail, liveDetail, "TASK-048: dry blockedDetail == live blockedDetail (no-chain)");
		assert.deepEqual(
			dryDetail,
			[{ name: "tasks", reason: "no-migration-chain", from: "0.9.0", to: "1.0.1" }],
			"no-chain blockedDetail carries reason + version pair, no failures",
		);
	});
});

// ── TASK-048 / FGAP-077: itemIdForPath mapper + validateBlockItemsAgainstCatalog ─
describe("validateBlockItemsAgainstCatalog + blocked-diagnostic mapper (TASK-048)", () => {
	afterEach(() => {
		if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
	});

	const FIXTURE_SUBSTRATE_ID = "sub-0123456789abcdef";

	// A catalog-ahead `tasks` fixture at the older `version` with a populated block.
	function makeTasksFixture(version: string, items: Array<Record<string, unknown>>): string {
		const dir = makeProject(["tasks"], []);
		const catalog = JSON.parse(
			fs.readFileSync(path.join(SAMPLES_DIR, "schemas", "tasks.schema.json"), "utf-8"),
		) as Record<string, unknown>;
		catalog.version = version;
		fs.writeFileSync(path.join(dir, ".project", "schemas", "tasks.schema.json"), JSON.stringify(catalog, null, 2));
		installContext(dir);
		const cfgPath = path.join(dir, ".project", "config.json");
		const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf-8")) as Record<string, unknown>;
		cfg.substrate_id = FIXTURE_SUBSTRATE_ID;
		fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
		fs.writeFileSync(
			path.join(dir, ".project", "tasks.json"),
			JSON.stringify({ schema_version: version, tasks: items }, null, 2),
		);
		return dir;
	}

	it("a failing block → valid:false + failures naming the item id / field / keyword", () => {
		const badItem = { id: "TASK-001", description: "x", status: "not-a-valid-status" };
		tmpRoot = makeTasksFixture("1.0.0", [badItem]);
		const r = validateBlockItemsAgainstCatalog(tmpRoot, "tasks");
		assert.equal(r.block, "tasks");
		assert.equal(r.valid, false, "a schema-failing item is not valid");
		assert.ok(r.failures.length >= 1, "at least one failure");
		const enumFailure = r.failures.find((f) => f.instancePath === "/tasks/0/status");
		assert.ok(enumFailure, "the failing status field is reported by instancePath");
		assert.equal(enumFailure?.itemId, "TASK-001", "the failing item id is resolved");
		assert.equal(typeof enumFailure?.keyword, "string");
	});

	it("a clean block → valid:true with no failures", () => {
		const goodItem = { id: "TASK-001", description: "x", status: "planned" };
		tmpRoot = makeTasksFixture("1.0.0", [goodItem]);
		const r = validateBlockItemsAgainstCatalog(tmpRoot, "tasks");
		assert.equal(r.valid, true, "a catalog-conformant item validates clean");
		assert.deepEqual(r.failures, [], "a clean block reports no failures");
		assert.equal(r.to, "1.0.1", "the catalog version is reported as `to`");
	});

	it("an unknown block throws a field-named error", () => {
		tmpRoot = makeProject(["tasks"], []);
		installContext(tmpRoot);
		assert.throws(
			() => validateBlockItemsAgainstCatalog(tmpRoot, "not-a-real-block"),
			/block:/,
			"an unknown block throws a field-named Error",
		);
	});

	// Mapper cases (TASK-048 itemIdForPath), observed through the diagnostic: an
	// id-less item failing the schema yields a failure whose itemId is undefined
	// (the indexed item has no string `id` to resolve); an envelope-level failure
	// (a non-array `tasks`) yields a failure whose instancePath has no
	// `/<arrayKey>/<index>` prefix, so itemId is likewise undefined.
	it("id-less failing item → failure.itemId undefined; envelope-level failure → itemId undefined", () => {
		// id-less: omit the required `id` → the `required` error reports at /tasks/0,
		// whose item carries no `id`, so itemIdForPath returns undefined.
		tmpRoot = makeTasksFixture("1.0.0", [{ description: "x", status: "planned" }]);
		const idless = validateBlockItemsAgainstCatalog(tmpRoot, "tasks");
		assert.equal(idless.valid, false, "an id-less item fails the required-id constraint");
		assert.ok(
			idless.failures.every((f) => f.itemId === undefined),
			"an id-less item resolves no itemId",
		);
		fs.rmSync(tmpRoot, { recursive: true, force: true });

		// envelope-level: `tasks` not an array → the error reports at /tasks (no index
		// segment), so itemIdForPath returns undefined.
		tmpRoot = makeProject(["tasks"], []);
		const catalog = JSON.parse(
			fs.readFileSync(path.join(SAMPLES_DIR, "schemas", "tasks.schema.json"), "utf-8"),
		) as Record<string, unknown>;
		catalog.version = "1.0.1";
		fs.writeFileSync(path.join(tmpRoot, ".project", "schemas", "tasks.schema.json"), JSON.stringify(catalog, null, 2));
		installContext(tmpRoot);
		fs.writeFileSync(
			path.join(tmpRoot, ".project", "tasks.json"),
			JSON.stringify({ schema_version: "1.0.1", tasks: "not-an-array" }, null, 2),
		);
		const envelope = validateBlockItemsAgainstCatalog(tmpRoot, "tasks");
		assert.equal(envelope.valid, false, "a non-array tasks fails the type constraint");
		assert.ok(
			envelope.failures.every((f) => f.itemId === undefined),
			"an envelope-level failure resolves no itemId",
		);
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

// ---- TASK-051 — FGAP-080: pending-blocked record + resolve-blocked commit ----
// The blocked-resync resolution loop: a live `update` that BLOCKS a catalog-ahead
// schema persists pending-blocked.json (pinning the target catalog schema + the
// chain), the calling agent fixes the failing items, and `resolveBlocked` commits
// the resolution against the SAME pinned target so the next `update` converges.
describe("resolveBlocked + pending-blocked persistence (TASK-051 / FGAP-080)", () => {
	const FIXTURE_SUBSTRATE_ID = "sub-0123456789abcdef";

	afterEach(() => {
		if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
	});

	// Pre-place an installed `tasks` schema = the catalog body with `version`
	// overridden to `version`, install so the baseline is recorded FROM that older
	// on-disk body → catalog-ahead, seed a substrate_id so live identity-stamping
	// can mint oids, and write a populated tasks.json block with the supplied items.
	function makeCatalogAheadTasks(dir: string, version: string, items: Array<Record<string, unknown>>): void {
		const catalog = JSON.parse(
			fs.readFileSync(path.join(SAMPLES_DIR, "schemas", "tasks.schema.json"), "utf-8"),
		) as Record<string, unknown>;
		catalog.version = version;
		fs.writeFileSync(path.join(dir, ".project", "schemas", "tasks.schema.json"), JSON.stringify(catalog, null, 2));
		installContext(dir); // baseline FROM the on-disk older body → catalog-ahead
		const cfgPath = path.join(dir, ".project", "config.json");
		const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf-8")) as Record<string, unknown>;
		cfg.substrate_id = FIXTURE_SUBSTRATE_ID;
		fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
		fs.writeFileSync(
			path.join(dir, ".project", "tasks.json"),
			JSON.stringify({ schema_version: version, tasks: items }, null, 2),
		);
		const state = checkStatus(dir).perAsset.find((a) => a.name === "tasks")?.state;
		assert.equal(state, "catalog-ahead", `precondition: tasks must be catalog-ahead (installed ${version})`);
	}

	const catalogTasksBody = (): Record<string, unknown> =>
		JSON.parse(fs.readFileSync(path.join(SAMPLES_DIR, "schemas", "tasks.schema.json"), "utf-8"));

	it("end-to-end loop: live blocked → pending record + pinned object → fix item → resolveBlocked → update converges", () => {
		tmpRoot = makeProject(["tasks"], []);
		// A populated block whose item FAILS the catalog 1.0.1 schema (bad status enum).
		// The 1.0.0→1.0.1 identity chain ships, so the live resync forward-migrates the
		// item (identity no-op) and re-validates → validation-failed → blocked.
		makeCatalogAheadTasks(tmpRoot, "1.0.0", [{ id: "TASK-001", description: "x", status: "not-a-valid-status" }]);

		const schemaDest = path.join(tmpRoot, ".project", "schemas", "tasks.schema.json");
		const blockDest = path.join(tmpRoot, ".project", "tasks.json");
		const mp = path.join(tmpRoot, ".project", "migrations.json");
		const schemaBefore = fs.readFileSync(schemaDest);
		const blockBefore = fs.readFileSync(blockDest);
		const migrationsBefore = fs.existsSync(mp) ? fs.readFileSync(mp) : null;

		const live = updateContext(tmpRoot);
		assert.deepEqual(live.blocked, ["tasks"], "the item failing the catalog schema blocks the resync");

		// The blocked contract: schema + migrations.json byte-unchanged. TASK-052: the
		// block file is NO longer byte-unchanged — the live blocked run inscribes git-style
		// failure markers INTO it (default behavior). Assert the sentinels are present and
		// POSITIONED at the offending item (the status line of TASK-001).
		assert.ok(fs.readFileSync(schemaDest).equals(schemaBefore), "blocked schema byte-unchanged");
		const markedText = fs.readFileSync(blockDest, "utf-8");
		assert.ok(/^<{7} BLOCKED tasks /m.test(markedText), "an open sentinel was written into the block");
		assert.ok(/^>{7} target: tasks@1\.0\.1/m.test(markedText), "a close sentinel was written into the block");
		const markedLines = markedText.split("\n");
		const openIdx = markedLines.findIndex((l) => /^<{7} BLOCKED tasks /.test(l));
		assert.ok(openIdx >= 0, "open sentinel located");
		assert.ok(
			/"status"\s*:/.test(markedLines[openIdx + 1] ?? ""),
			"the open sentinel sits directly above the offending status line",
		);
		// The premarker pin records the byte-exact pre-marker restore point.
		const markedEntry = loadPendingBlockedForDir(path.join(tmpRoot, ".project"))?.entries[0];
		assert.ok(markedEntry?.premarker_hash, "the entry carries a premarker_hash");
		const premarkerObj = getObject(path.join(tmpRoot, ".project"), markedEntry?.premarker_hash as string) as {
			kind?: string;
			bytes?: string;
		} | null;
		assert.equal(premarkerObj?.kind, "raw-block-bytes", "the pinned premarker wrapper is the raw-block-bytes kind");
		assert.ok(
			blockBefore.equals(Buffer.from(premarkerObj?.bytes ?? "", "utf-8")),
			"the pinned bytes equal the pre-marker block byte-for-byte",
		);
		if (migrationsBefore === null) {
			assert.ok(!fs.existsSync(mp), "migrations.json absent after a blocked outcome (absent pre-call)");
		} else {
			assert.ok(fs.readFileSync(mp).equals(migrationsBefore), "migrations.json byte-unchanged after blocked");
		}

		// pending-blocked.json exists with the entry; the pinned target object is present.
		const pending = loadPendingBlockedForDir(path.join(tmpRoot, ".project"));
		assert.ok(pending, "pending-blocked.json was written by the live blocked run");
		assert.equal(pending?.entries.length, 1, "one pending entry");
		const entry = pending?.entries[0];
		assert.equal(entry?.name, "tasks");
		assert.equal(entry?.reason, "validation-failed");
		assert.equal(entry?.from, "1.0.0");
		assert.equal(entry?.to, "1.0.1");
		assert.ok(Array.isArray(entry?.chain) && entry.chain.length >= 1, "the chain reaching the target is pinned");
		assert.ok(Array.isArray(entry?.failures) && entry.failures.length >= 1, "the per-item failures are recorded");
		const targetHash = entry?.target_hash as string;
		const targetObj = getObject(path.join(tmpRoot, ".project"), targetHash);
		assert.ok(targetObj, "the pinned target catalog schema body is in the object store");
		assert.deepEqual(targetObj, catalogTasksBody(), "the pinned body equals the catalog tasks schema");

		// Fix the failing item directly in the block fixture (the agent's correction).
		fs.writeFileSync(
			blockDest,
			JSON.stringify(
				{ schema_version: "1.0.0", tasks: [{ id: "TASK-001", description: "x", status: "planned" }] },
				null,
				2,
			),
		);

		const res = resolveBlocked(tmpRoot, "tasks");
		assert.equal(res.resolved, true, "the corrected block resolves");
		if (res.resolved === true) {
			assert.deepEqual(
				res.registeredMigrations,
				[{ schema: "tasks", from: "1.0.0", to: "1.0.1" }],
				"the chain decl was registered",
			);
		}

		// The schema file now equals the pinned target body.
		assert.deepEqual(
			JSON.parse(fs.readFileSync(schemaDest, "utf-8")),
			targetObj,
			"the on-disk schema equals the pinned target after resolve",
		);
		// The block envelope advanced to the target version.
		const blockAfter = JSON.parse(fs.readFileSync(blockDest, "utf-8")) as { schema_version?: string };
		assert.equal(blockAfter.schema_version, "1.0.1", "the block envelope advanced to the target version");
		// The merge base advanced to the target hash.
		const cfgAfter = loadConfig(tmpRoot);
		assert.equal(
			cfgAfter?.installed_from?.assets?.tasks?.content_hash,
			targetHash,
			"installed_from baseline advanced to the target content_hash",
		);
		// The pending entry is gone (file removed when empty).
		assert.ok(
			!fs.existsSync(pendingBlockedPathForDir(path.join(tmpRoot, ".project"))),
			"pending-blocked.json removed once the only entry is cleared",
		);
		// A fresh update re-run reports the schema in-sync (convergence).
		const reRun = updateContext(tmpRoot);
		assert.deepEqual(reRun.inSync, ["tasks"], "the schema converges to in-sync after resolution");
		assert.deepEqual(reRun.blocked, [], "no schema re-blocks");
	});

	it("oid stability: marker round-trip preserves item oids; fixed item advances content_parent, sibling untouched", () => {
		tmpRoot = makeProject(["tasks"], []);
		// Seed VALID items so the identity writer (which validates against the installed
		// catalog body) can stamp each item with an oid + content_hash.
		makeCatalogAheadTasks(tmpRoot, "1.0.0", [
			{ id: "TASK-001", description: "x", status: "planned" },
			{ id: "TASK-002", description: "y", status: "planned" },
		]);
		const blockDest = path.join(tmpRoot, ".project", "tasks.json");
		const seeded = JSON.parse(fs.readFileSync(blockDest, "utf-8")) as Record<string, unknown>;
		writeBlockForDir(path.join(tmpRoot, ".project"), "tasks", seeded);
		const beforeItems = (JSON.parse(fs.readFileSync(blockDest, "utf-8")) as { tasks: Array<Record<string, unknown>> })
			.tasks;
		const oidBefore = new Map(beforeItems.map((t) => [t.id as string, t.oid as string]));
		const hashBefore = new Map(beforeItems.map((t) => [t.id as string, t.content_hash as string]));

		// Raw-mutate ONLY TASK-001's status to invalid on disk, preserving its stamped
		// oid + content_hash, so the live update marks an oid-bearing block (the writer
		// would reject a bad status, so this is a deliberate raw write of the offending
		// state the operator's edit would have produced).
		const dirty = JSON.parse(fs.readFileSync(blockDest, "utf-8")) as { tasks: Array<Record<string, unknown>> };
		dirty.tasks[0].status = "not-a-valid-status";
		fs.writeFileSync(blockDest, JSON.stringify(dirty, null, 2));

		updateContext(tmpRoot); // → blocked + markers
		assert.ok(/^<{7} BLOCKED tasks /m.test(fs.readFileSync(blockDest, "utf-8")), "markers written");

		// Fix TASK-001's status back to valid AND change its description (a genuine
		// content change), keeping every item's stamped oid + content_hash on the wire
		// (the writer re-stamps from the on-disk prior index — the stripped marker-free
		// file CHANGE 3 raw-writes before the commit). TASK-002 is left untouched.
		const fixedBlock = {
			schema_version: "1.0.0",
			tasks: [{ ...beforeItems[0], description: "fixed", status: "planned" }, { ...beforeItems[1] }],
		};
		fs.writeFileSync(blockDest, JSON.stringify(fixedBlock, null, 2));
		const res = resolveBlocked(tmpRoot, "tasks");
		assert.equal(res.resolved, true, "the corrected block resolves");

		const afterItems = (JSON.parse(fs.readFileSync(blockDest, "utf-8")) as { tasks: Array<Record<string, unknown>> })
			.tasks;
		for (const t of afterItems) {
			assert.equal(t.oid, oidBefore.get(t.id as string), `${t.id} oid preserved across the marker round-trip`);
		}
		const fixed = afterItems.find((t) => t.id === "TASK-001");
		const sibling = afterItems.find((t) => t.id === "TASK-002");
		// The fixed item genuinely changed → its content_parent advances to the prior
		// on-disk content_hash (= the seeded hash CHANGE 3 preserved across the round-trip).
		assert.equal(
			fixed?.content_parent,
			hashBefore.get("TASK-001"),
			"the fixed item's content_parent = its prior content_hash",
		);
		// The untouched sibling's content_hash is unchanged (a real no-re-mint round-trip).
		assert.equal(
			sibling?.content_hash,
			hashBefore.get("TASK-002"),
			"the untouched sibling's content_hash is unchanged",
		);
	});

	it("string-brace targeting: braces inside string values do not mis-place the marker", () => {
		tmpRoot = makeProject(["tasks"], []);
		// description carries literal braces/brackets in its STRING value; status is the
		// failing field. A naive brace counter would over-count depth and mis-locate the
		// item; the string-aware lexer must still target the status line.
		makeCatalogAheadTasks(tmpRoot, "1.0.0", [
			{ id: "TASK-001", description: "weird { [ } ] braces", status: "not-a-valid-status" },
		]);
		const blockDest = path.join(tmpRoot, ".project", "tasks.json");
		updateContext(tmpRoot);
		const lines = fs.readFileSync(blockDest, "utf-8").split("\n");
		const openIdx = lines.findIndex((l) => /^<{7} BLOCKED tasks /.test(l));
		assert.ok(openIdx >= 0, "a sentinel was written");
		assert.ok(
			/"status"\s*:/.test(lines[openIdx + 1] ?? ""),
			"the sentinel targets the status line despite string braces",
		);
	});

	it("re-run while marked: a second live update retains the entry + premarker_hash and does not double-mark", () => {
		tmpRoot = makeProject(["tasks"], []);
		makeCatalogAheadTasks(tmpRoot, "1.0.0", [{ id: "TASK-001", description: "x", status: "not-a-valid-status" }]);
		const blockDest = path.join(tmpRoot, ".project", "tasks.json");
		updateContext(tmpRoot); // first mark
		const firstText = fs.readFileSync(blockDest, "utf-8");
		const firstEntry = loadPendingBlockedForDir(path.join(tmpRoot, ".project"))?.entries[0];
		const firstHash = firstEntry?.premarker_hash;
		assert.ok(firstHash, "first run pinned a premarker_hash");
		const openCountFirst = (firstText.match(/^<{7} BLOCKED/gm) ?? []).length;

		const second = updateContext(tmpRoot); // second run over the still-marked block
		const secondText = fs.readFileSync(blockDest, "utf-8");
		const secondEntry = loadPendingBlockedForDir(path.join(tmpRoot, ".project"))?.entries[0];
		const secondHash = secondEntry?.premarker_hash;
		assert.equal(secondHash, firstHash, "the premarker_hash is retained across a re-run");
		// FIX 1: the whole entry is retained — not just premarker_hash. The re-run's
		// freshly-built candidate would have degraded `failures` (re-derived from the
		// marker-bearing, non-JSON block file → a synthetic envelope-level "must be
		// object" failure); the retained entry carries the genuine per-item failures.
		assert.deepEqual(
			secondEntry,
			firstEntry,
			"the re-run retains the prior pending entry WHOLE (failures/chain/from-to)",
		);
		assert.ok(
			secondEntry?.failures?.some((f) => f.itemId === "TASK-001"),
			"the retained failures name the offending item (not the degraded must-be-object placeholder)",
		);
		assert.ok(
			!secondEntry?.failures?.some((f) => f.message === "must be object" && f.instancePath === ""),
			"the degraded envelope-level placeholder is NOT what got persisted",
		);
		// And the re-run's result.blockedDetail carries those genuine per-item failures.
		const detail = second.blockedDetail.find((d) => d.name === "tasks");
		assert.ok(detail, "the re-run reports tasks as blocked");
		assert.ok(
			detail?.failures?.some((f) => f.itemId === "TASK-001"),
			"the re-run blockedDetail carries the per-item failures, not the degraded must-be-object placeholder",
		);
		assert.ok(detail?.premarker_hash, "the re-run blockedDetail carries premarker_hash (markers are present)");
		const openCountSecond = (secondText.match(/^<{7} BLOCKED/gm) ?? []).length;
		assert.equal(openCountSecond, openCountFirst, "the block is not double-marked on a re-run");
		// And the original pre-marker bytes are still restorable from the retained pin.
		const obj = getObject(path.join(tmpRoot, ".project"), secondHash as string) as { bytes?: string } | null;
		assert.ok(JSON.parse(obj?.bytes ?? "null"), "the pinned pre-marker bytes parse as the original JSON block");
	});

	// FIX 2: renderBlocked's past-tense "markers were written INTO the block file(s)"
	// claim is keyed on the per-entry premarker_hash — present ONLY when a live update
	// actually inscribed markers. A dryRun preview (writes nothing) and a
	// no-migration-chain entry (never marked) must NOT claim a write that did not happen.
	it("render: a dryRun blocked report does NOT claim markers were written", () => {
		tmpRoot = makeProject(["tasks"], []);
		makeCatalogAheadTasks(tmpRoot, "1.0.0", [{ id: "TASK-001", description: "x", status: "not-a-valid-status" }]);
		const blockDest = path.join(tmpRoot, ".project", "tasks.json");
		const blockBefore = fs.readFileSync(blockDest);

		const preview = updateContext(tmpRoot, { dryRun: true });
		// Precondition: dryRun wrote nothing — the block file carries no sentinels.
		assert.ok(fs.readFileSync(blockDest).equals(blockBefore), "dryRun leaves the block file byte-unchanged");
		const detail = preview.blockedDetail.find((d) => d.name === "tasks");
		assert.ok(detail, "the dryRun plan surfaces tasks as blocked");
		assert.ok(!detail?.premarker_hash, "no premarker_hash on a dryRun blocked entry (nothing was written)");

		const out = renderBlocked(preview.blockedDetail);
		assert.match(out, /Schema resync blocked/, "the blocked header is present");
		assert.doesNotMatch(out, /were written INTO/i, "a dryRun report does NOT claim markers were written");
		assert.match(out, /No markers were written/, "it surfaces the neutral fix-then-resolve guidance");
	});

	it("render: a no-migration-chain-only report does NOT claim markers were written", () => {
		const out = renderBlocked([{ name: "tasks", reason: "no-migration-chain", from: "1.0.0", to: "2.0.0" }]);
		assert.match(out, /no migration chain reaches 2\.0\.0 from 1\.0\.0/, "the no-chain reason is named");
		assert.doesNotMatch(out, /were written INTO/i, "a no-chain entry never carries markers, so no write claim");
		assert.match(out, /No markers were written/, "it surfaces the neutral guidance");
	});

	it("render: a marked validation-failed entry (premarker_hash present) DOES claim markers were written", () => {
		const out = renderBlocked([
			{
				name: "tasks",
				reason: "validation-failed",
				from: "1.0.0",
				to: "1.0.1",
				failures: [
					{
						itemId: "TASK-001",
						instancePath: "/tasks/0/status",
						keyword: "enum",
						message: "must be equal to one of the allowed values",
					},
				],
				premarker_hash: "abc123",
			},
		]);
		assert.match(out, /TASK-001/, "the failing item is named");
		assert.match(out, /were written INTO/i, "a marker-bearing entry truthfully claims markers were written");
		assert.doesNotMatch(out, /No markers were written/, "the neutral guidance is NOT emitted when markers exist");
	});

	it("reader behavior on a marked block: readBlock throws invalid-JSON; validate-block-items degrades gracefully", () => {
		tmpRoot = makeProject(["tasks"], []);
		makeCatalogAheadTasks(tmpRoot, "1.0.0", [{ id: "TASK-001", description: "x", status: "not-a-valid-status" }]);
		updateContext(tmpRoot); // marks the block
		assert.throws(
			() => readBlock(tmpRoot, "tasks"),
			/Invalid JSON in block file/,
			"readBlock surfaces a labeled parse error on a marked block",
		);
		const v = validateBlockItemsAgainstCatalog(tmpRoot, "tasks");
		assert.equal(v.valid, false, "validate-block-items degrades to invalid on a marked (unparseable) block, no throw");
		assert.ok(v.failures.length >= 1, "it returns a failure rather than throwing");
	});

	it("no-write-on-fail: a still-failing block resolves false, all files byte-unchanged, pending intact", () => {
		tmpRoot = makeProject(["tasks"], []);
		makeCatalogAheadTasks(tmpRoot, "1.0.0", [{ id: "TASK-001", description: "x", status: "not-a-valid-status" }]);
		updateContext(tmpRoot); // → blocked, pending written

		const schemaDest = path.join(tmpRoot, ".project", "schemas", "tasks.schema.json");
		const blockDest = path.join(tmpRoot, ".project", "tasks.json");
		const mp = path.join(tmpRoot, ".project", "migrations.json");
		const cfgPath = path.join(tmpRoot, ".project", "config.json");
		const pendingPath = pendingBlockedPathForDir(path.join(tmpRoot, ".project"));
		const snapshot = new Map<string, Buffer>();
		for (const f of [schemaDest, blockDest, cfgPath, pendingPath]) snapshot.set(f, fs.readFileSync(f));
		const migrationsBefore = fs.existsSync(mp) ? fs.readFileSync(mp) : null;

		// The item is STILL invalid (not corrected) → resolveBlocked must fail + write nothing.
		const res = resolveBlocked(tmpRoot, "tasks");
		assert.equal(res.resolved, false, "an uncorrected block does not resolve");
		if (res.resolved === false) {
			assert.ok(res.failures.length >= 1, "the remaining per-item failures are reported");
		}

		for (const [f, before] of snapshot) {
			assert.ok(fs.readFileSync(f).equals(before), `resolveBlocked fail must not modify ${path.basename(f)}`);
		}
		if (migrationsBefore === null) {
			assert.ok(!fs.existsSync(mp), "migrations.json absent — resolve fail wrote no decls");
		} else {
			assert.ok(fs.readFileSync(mp).equals(migrationsBefore), "migrations.json byte-unchanged on resolve fail");
		}
		const pending = loadPendingBlockedForDir(path.join(tmpRoot, ".project"));
		assert.equal(pending?.entries.length, 1, "the pending entry stays intact on resolve fail");
	});

	it("dryRun blocked leaves NO pending file and adds no new object", () => {
		tmpRoot = makeProject(["tasks"], []);
		makeCatalogAheadTasks(tmpRoot, "1.0.0", [{ id: "TASK-001", description: "x", status: "not-a-valid-status" }]);
		const objectsDir = path.join(tmpRoot, ".project", "objects");
		const objectsBefore = fs.existsSync(objectsDir) ? fs.readdirSync(objectsDir).sort() : [];

		const dry = updateContext(tmpRoot, { dryRun: true });
		assert.deepEqual(dry.blocked, ["tasks"], "dry predicts blocked");
		assert.ok(
			!fs.existsSync(pendingBlockedPathForDir(path.join(tmpRoot, ".project"))),
			"dryRun must NOT write pending-blocked.json",
		);
		const objectsAfter = fs.existsSync(objectsDir) ? fs.readdirSync(objectsDir).sort() : [];
		assert.deepEqual(objectsAfter, objectsBefore, "dryRun must pin no new target object");
	});

	it("no-chain entry (chain []) resolves when the block already validates against the pinned target", () => {
		tmpRoot = makeProject(["tasks"], []);
		// Installed at 0.9.0 (no chain reaches catalog 1.0.1) with an item that ALREADY
		// satisfies the catalog 1.0.1 schema → live resync blocks no-migration-chain,
		// pinning chain:[]. resolveBlocked re-validates the block as-is (no migration) →
		// passes → commits.
		makeCatalogAheadTasks(tmpRoot, "0.9.0", [{ id: "TASK-001", description: "x", status: "planned" }]);
		const live = updateContext(tmpRoot);
		assert.deepEqual(live.blocked, ["tasks"], "no-chain catalog-ahead blocks");
		const pending = loadPendingBlockedForDir(path.join(tmpRoot, ".project"));
		assert.equal(pending?.entries[0]?.reason, "no-migration-chain");
		assert.deepEqual(pending?.entries[0]?.chain, [], "no-chain entry pins an empty chain");

		const res = resolveBlocked(tmpRoot, "tasks");
		assert.equal(res.resolved, true, "a block that validates as-is resolves under a no-chain entry");
		if (res.resolved === true) {
			assert.deepEqual(res.registeredMigrations, [], "a no-chain resolution registers no decls");
		}
		assert.ok(
			!fs.existsSync(pendingBlockedPathForDir(path.join(tmpRoot, ".project"))),
			"the pending entry is cleared after a no-chain resolution",
		);
	});

	it("absent pending entry → throws /schemaName:/", () => {
		tmpRoot = makeProject(["tasks"], []);
		installContext(tmpRoot); // in-sync; nothing blocked
		assert.throws(() => resolveBlocked(tmpRoot, "tasks"), /schemaName:/);
	});
});

// TASK-059 / FGAP-088: the reflected `context-install` op surfaces the install
// ceremony as a CLI/Pi op. It calls `installContext` with NO behavior fork — the
// op's `run` is the same engine + call shape the `/context install` slash handler
// runs (overwrite derived from `--update`). These tests exercise the op's own
// `run` (the surfaced path), asserting it materializes the declared schemas +
// blocks, records the install baseline, and equals a direct `installContext` call.
describe("op: context-install (reflected install ceremony)", () => {
	afterEach(() => {
		if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
	});

	const op = (name: string): OpDefinition => {
		const found = ops.find((o) => o.name === name);
		assert.ok(found, `op '${name}' must be registered`);
		return found;
	};

	it("materializes every declared schema file + block file on disk", () => {
		tmpRoot = makeProject(["tasks", "decisions"], ["tasks", "decisions"]);
		const result = op("context-install").run(tmpRoot, {});
		assert.ok(
			typeof result !== "string",
			"a successful context-install returns a { json } result, not an error string",
		);
		// Every declared schema → <substrate>/schemas/<name>.schema.json exists.
		for (const name of ["tasks", "decisions"]) {
			assert.ok(
				fs.existsSync(path.join(tmpRoot, ".project", "schemas", `${name}.schema.json`)),
				`schemas/${name}.schema.json must exist after context-install`,
			);
			// Every declared block → <substrate>/<name>.json exists.
			assert.ok(
				fs.existsSync(path.join(tmpRoot, ".project", `${name}.json`)),
				`${name}.json must exist after context-install`,
			);
		}
	});

	it("records config.installed_from.assets for every installed schema", () => {
		tmpRoot = makeProject(["tasks", "decisions"], []);
		op("context-install").run(tmpRoot, {});
		const from = loadConfig(tmpRoot)?.installed_from;
		assert.ok(from, "config.installed_from must be recorded by the reflected op");
		assert.deepEqual(
			Object.keys(from.assets).sort(),
			["decisions", "tasks"],
			"one installed_from.assets entry per installed schema",
		);
	});

	it("equals a direct installContext(cwd, {overwrite:false}) call — no behavior fork", () => {
		// Run the op against one substrate and a direct installContext against an
		// IDENTICALLY-declared sibling; the InstallResult payloads must be deep-equal.
		tmpRoot = makeProject(["tasks", "decisions"], ["tasks"]);
		const opResult = op("context-install").run(tmpRoot, {});
		assert.ok(typeof opResult !== "string" && "json" in opResult, "the op returns its InstallResult via { json }");

		const directRoot = makeProject(["tasks", "decisions"], ["tasks"]);
		try {
			const direct = installContext(directRoot, { overwrite: false });
			// Ceremony-entry identity establishment mints a UNIQUE substrate_id per
			// substrate, so that one field legitimately diverges between the two
			// runs — assert both establish, then compare with it normalized out.
			const opJson = opResult.json as typeof direct;
			assert.match(opJson.substrateIdEstablished ?? "", /^sub-[0-9a-f]{16}$/);
			assert.match(direct.substrateIdEstablished ?? "", /^sub-[0-9a-f]{16}$/);
			const { substrateIdEstablished: _op, ...opRest } = opJson;
			const { substrateIdEstablished: _direct, ...directRest } = direct;
			assert.deepEqual(opRest, directRest, "the op result must equal a direct installContext call (no fork)");
		} finally {
			fs.rmSync(directRoot, { recursive: true, force: true });
		}
	});

	it("a pure-op context-install lets a fresh substrate's schema model materialize (the install ceremony succeeds)", () => {
		// init → accept-all → install via the reflected ops only (no slash handler):
		// the op chain must leave a usable substrate (schemas materialized, baseline
		// recorded), the precondition an append-block-item then relies on.
		tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-context-install-op-chain-"));
		const dir = ".project";
		op("context-init").run(tmpRoot, { contextDir: dir });
		op("context-accept-all").run(tmpRoot, {});
		const result = op("context-install").run(tmpRoot, {});
		assert.ok(typeof result !== "string", "the install op must not return an error string after init + accept-all");
		const cfg = loadConfig(tmpRoot);
		assert.ok(cfg, "config must load after the reflected install ceremony");
		assert.ok(cfg.installed_from, "the install ceremony must record the installed_from baseline");
		// At least one declared schema materialized on disk.
		for (const name of cfg.installed_schemas ?? []) {
			assert.ok(
				fs.existsSync(path.join(tmpRoot, dir, "schemas", `${name}.schema.json`)),
				`schemas/${name}.schema.json must exist after the reflected install ceremony`,
			);
		}
	});
});
