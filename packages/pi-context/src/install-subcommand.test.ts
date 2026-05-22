import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { installProject } from "./index.js";
import { writeBootstrapPointer } from "./project-dir.js";

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

describe("installProject", () => {
	afterEach(() => {
		if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
	});

	it("returns error when .project/config.json is absent", () => {
		tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-context-install-noconfig-"));
		writeBootstrapPointer(tmpRoot, ".project");
		const result = installProject(tmpRoot);
		assert.ok(result.error, "expected error string when config is absent");
		assert.match(result.error, /config\.json/);
		assert.deepEqual(result.installed, []);
	});

	it("no-op summary when install lists are empty", () => {
		tmpRoot = makeProject([], []);
		const result = installProject(tmpRoot);
		assert.equal(result.error, undefined);
		assert.deepEqual(result.installed, []);
		assert.deepEqual(result.updated, []);
		assert.deepEqual(result.skipped, []);
		assert.deepEqual(result.notFound, []);
	});

	it("installs declared schemas from the samples catalog into .project/schemas/", () => {
		tmpRoot = makeProject(["tasks"], []);
		const result = installProject(tmpRoot);
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
		const result = installProject(tmpRoot);
		assert.deepEqual(result.installed, ["tasks.json"]);
		assert.ok(fs.existsSync(path.join(tmpRoot, ".project", "tasks.json")));
	});

	it("skips when destination exists and overwrite not requested", () => {
		tmpRoot = makeProject(["tasks"], []);
		const dest = path.join(tmpRoot, ".project", "schemas", "tasks.schema.json");
		fs.writeFileSync(dest, "{}"); // pre-existing — must not be touched
		const result = installProject(tmpRoot);
		assert.deepEqual(result.installed, []);
		assert.deepEqual(result.skipped, ["schemas/tasks.schema.json"]);
		assert.equal(fs.readFileSync(dest, "utf-8"), "{}", "destination must be untouched on skip");
	});

	it("overwrites and reports as updated when overwrite=true and destination exists", () => {
		tmpRoot = makeProject(["tasks"], []);
		const dest = path.join(tmpRoot, ".project", "schemas", "tasks.schema.json");
		fs.writeFileSync(dest, "{}"); // pre-existing
		const result = installProject(tmpRoot, { overwrite: true });
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
		const result = installProject(tmpRoot);
		assert.deepEqual(result.installed, []);
		assert.deepEqual(result.notFound, ["schemas/definitely-not-a-real-schema-name.schema.json"]);
	});

	it("processes schemas + blocks together in one call", () => {
		tmpRoot = makeProject(["tasks", "decisions"], ["tasks", "decisions"]);
		const result = installProject(tmpRoot);
		assert.equal(result.installed.length, 4);
		assert.ok(result.installed.includes("schemas/tasks.schema.json"));
		assert.ok(result.installed.includes("schemas/decisions.schema.json"));
		assert.ok(result.installed.includes("tasks.json"));
		assert.ok(result.installed.includes("decisions.json"));
	});

	it("install copies schema content from samples", () => {
		tmpRoot = makeProject(["tasks"], []);
		installProject(tmpRoot);
		const installed = fs.readFileSync(path.join(tmpRoot, ".project", "schemas", "tasks.schema.json"), "utf-8");
		const source = fs.readFileSync(path.join(SAMPLES_DIR, "schemas", "tasks.schema.json"), "utf-8");
		assert.equal(installed, source, "installed schema must be byte-equal to the samples-catalog source");
	});

	it("installs a samples-only kind (framework-gaps)", () => {
		tmpRoot = makeProject(["framework-gaps"], []);
		const result = installProject(tmpRoot);
		assert.deepEqual(result.installed, ["schemas/framework-gaps.schema.json"]);
	});

	it("config and relations report notFound", () => {
		tmpRoot = makeProject(["config", "relations"], []);
		const result = installProject(tmpRoot);
		assert.deepEqual(result.notFound, ["schemas/config.schema.json", "schemas/relations.schema.json"]);
		assert.deepEqual(result.installed, []);
	});
});
