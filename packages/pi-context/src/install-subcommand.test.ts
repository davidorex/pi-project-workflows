import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./context.js";
import { writeBootstrapPointer } from "./context-dir.js";
import { installContext, planInstall } from "./index.js";

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

	it("overwrites and reports as updated when overwrite=true and destination exists", () => {
		tmpRoot = makeProject(["tasks"], []);
		const dest = path.join(tmpRoot, ".project", "schemas", "tasks.schema.json");
		fs.writeFileSync(dest, "{}"); // pre-existing
		const result = installContext(tmpRoot, { overwrite: true });
		assert.deepEqual(result.installed, []);
		assert.deepEqual(result.updated, ["schemas/tasks.schema.json"]);
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

	it("a schema under overwrite is still updated (block preservation does not regress schema --update)", () => {
		tmpRoot = makeProject(["tasks"], []);
		const dest = path.join(tmpRoot, ".project", "schemas", "tasks.schema.json");
		fs.writeFileSync(dest, "{}"); // pre-existing schema
		const result = installContext(tmpRoot, { overwrite: true });
		assert.deepEqual(result.updated, ["schemas/tasks.schema.json"], "schema must still be updated under overwrite");
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

// FGAP-029 safe re-sync (slice S3): /context install --plan is a PURE-READ drift
// detector — it compares the S2 install baseline against the catalog + the
// currently-installed schema files, classifies per-schema drift, and writes NOTHING.
describe("planInstall (read-only drift detector)", () => {
	afterEach(() => {
		if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
	});

	it("reports every installed schema in-sync immediately after install", () => {
		tmpRoot = makeProject(["tasks", "decisions"], []);
		installContext(tmpRoot); // records the baseline
		const plan = planInstall(tmpRoot);
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
		const plan = planInstall(tmpRoot);
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
		const plan = planInstall(tmpRoot);
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
		const plan = planInstall(tmpRoot);
		const tasks = plan.perAsset.find((a) => a.name === "tasks");
		assert.ok(tasks);
		assert.equal(tasks.state, "catalog-ahead", "installed === stale baseline but catalog differs → catalog-ahead");
		assert.equal(tasks.installed_modified, false, "installed matches the (stale) baseline → not installed_modified");
	});

	it("writes nothing — config.json bytes are byte-identical before and after planInstall", () => {
		tmpRoot = makeProject(["tasks", "decisions"], []);
		installContext(tmpRoot);
		const cfgPath = path.join(tmpRoot, ".project", "config.json");
		const before = fs.readFileSync(cfgPath);
		planInstall(tmpRoot);
		const after = fs.readFileSync(cfgPath);
		assert.ok(before.equals(after), "planInstall must not modify config.json (byte-identical before/after)");
	});
});
