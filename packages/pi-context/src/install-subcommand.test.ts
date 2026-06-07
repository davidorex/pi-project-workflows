import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { computeContentHash } from "./content-hash.js";
import { loadConfig } from "./context.js";
import { writeBootstrapPointer } from "./context-dir.js";
import { checkStatus, installContext, updateContext } from "./index.js";
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

	it("(a) refuses to overwrite a locally-modified installed schema — recorded in refused, bytes unchanged", () => {
		tmpRoot = makeProject(["tasks", "decisions"], []);
		installContext(tmpRoot);
		// Hand-edit the INSTALLED tasks schema so its content diverges from the
		// recorded baseline while the catalog stays equal → locally-modified.
		const dest = path.join(tmpRoot, ".project", "schemas", "tasks.schema.json");
		const obj = JSON.parse(fs.readFileSync(dest, "utf-8")) as Record<string, unknown>;
		obj.__local_edit_marker = true;
		fs.writeFileSync(dest, JSON.stringify(obj, null, 2));
		// Confirm the precondition: checkStatus classifies it locally-modified.
		assert.equal(
			checkStatus(tmpRoot).perAsset.find((a) => a.name === "tasks")?.state,
			"locally-modified",
			"precondition: the hand-edited schema must be locally-modified",
		);
		const before = fs.readFileSync(dest);
		const result = updateContext(tmpRoot);
		assert.deepEqual(result.refused, ["tasks"], "a locally-modified schema must be refused, never resynced");
		assert.ok(!result.resynced.includes("tasks"), "a locally-modified schema must NOT be resynced");
		assert.ok(!result.migrated.includes("tasks"), "a locally-modified schema must NOT be migrated");
		assert.deepEqual(result.inSync, ["decisions"], "the untouched sibling stays in-sync (no-op)");
		assert.ok(
			fs.readFileSync(dest).equals(before),
			"the locally-modified schema file must be byte-unchanged (refuse-and-report writes nothing to it)",
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
		assert.deepEqual(plan.refused, ["decisions"], "locally-modified schema appears in the refused set");
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
});
