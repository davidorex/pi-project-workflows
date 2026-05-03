import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { agentsDir, projectDir, projectRoot, projectTemplatesDir, schemaPath, schemasDir } from "./project-context.js";

let tmpRoot: string;

function makeCwd(configRoot?: string): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-project-projectroot-"));
	fs.mkdirSync(path.join(dir, ".project", "schemas"), { recursive: true });
	if (configRoot !== undefined) {
		const config = {
			schema_version: "0.2.0",
			root: configRoot,
			lenses: [],
		};
		fs.writeFileSync(path.join(dir, ".project", "config.json"), JSON.stringify(config, null, 2));
	}
	return dir;
}

describe("projectRoot", () => {
	afterEach(() => {
		if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
	});

	it("returns '.project' fallback when no config.json exists", () => {
		tmpRoot = makeCwd();
		assert.equal(projectRoot(tmpRoot), ".project");
	});

	it("returns config.root when present", () => {
		tmpRoot = makeCwd("data/state");
		assert.equal(projectRoot(tmpRoot), "data/state");
	});

	it("returns '.project' when config explicitly declares root='.project'", () => {
		tmpRoot = makeCwd(".project");
		assert.equal(projectRoot(tmpRoot), ".project");
	});
});

describe("path helpers honor projectRoot", () => {
	afterEach(() => {
		if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
	});

	it("projectDir resolves to <cwd>/<root>", () => {
		tmpRoot = makeCwd("custom-substrate");
		assert.equal(projectDir(tmpRoot), path.join(tmpRoot, "custom-substrate"));
	});

	it("schemasDir resolves to <cwd>/<root>/schemas", () => {
		tmpRoot = makeCwd("data");
		assert.equal(schemasDir(tmpRoot), path.join(tmpRoot, "data", "schemas"));
	});

	it("schemaPath composes block name correctly", () => {
		tmpRoot = makeCwd("data");
		assert.equal(schemaPath(tmpRoot, "tasks"), path.join(tmpRoot, "data", "schemas", "tasks.schema.json"));
	});

	it("agentsDir resolves to <cwd>/<root>/agents", () => {
		tmpRoot = makeCwd("data");
		assert.equal(agentsDir(tmpRoot), path.join(tmpRoot, "data", "agents"));
	});

	it("projectTemplatesDir resolves to <cwd>/<root>/templates", () => {
		tmpRoot = makeCwd("data");
		assert.equal(projectTemplatesDir(tmpRoot), path.join(tmpRoot, "data", "templates"));
	});

	it("path helpers use '.project' fallback when no config", () => {
		tmpRoot = makeCwd();
		assert.equal(projectDir(tmpRoot), path.join(tmpRoot, ".project"));
		assert.equal(schemasDir(tmpRoot), path.join(tmpRoot, ".project", "schemas"));
	});
});
