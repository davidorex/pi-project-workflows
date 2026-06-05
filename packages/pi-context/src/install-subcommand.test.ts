import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { writeBootstrapPointer } from "./context-dir.js";
import { installContext } from "./index.js";

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
});
