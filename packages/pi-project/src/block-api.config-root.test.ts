import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { appendToBlock, readBlock, writeBlock } from "./block-api.js";

let tmpRoot: string;

function makeProject(configRoot?: string): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-project-blockapi-root-"));
	// Always create the bootstrap .project/ for config.json
	fs.mkdirSync(path.join(dir, ".project", "schemas"), { recursive: true });
	if (configRoot !== undefined) {
		const config = { schema_version: "0.2.0", root: configRoot, lenses: [] };
		fs.writeFileSync(path.join(dir, ".project", "config.json"), JSON.stringify(config, null, 2));
		// Pre-create the substrate root if it differs from .project
		if (configRoot !== ".project") {
			fs.mkdirSync(path.join(dir, configRoot, "schemas"), { recursive: true });
		}
	}
	return dir;
}

describe("block-api honors config.root", () => {
	afterEach(() => {
		if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
	});

	it("writeBlock writes to <cwd>/<config.root>/ when config sets a custom root", () => {
		tmpRoot = makeProject("data/state");
		writeBlock(tmpRoot, "issues", { issues: [{ id: "issue-001" }] });
		const written = path.join(tmpRoot, "data/state", "issues.json");
		assert.ok(fs.existsSync(written), `expected ${written} to exist`);
		const wrong = path.join(tmpRoot, ".project", "issues.json");
		assert.ok(!fs.existsSync(wrong), `expected ${wrong} to NOT exist (no longer default destination)`);
	});

	it("readBlock reads from <cwd>/<config.root>/ when config sets a custom root", () => {
		tmpRoot = makeProject("data/state");
		const dest = path.join(tmpRoot, "data/state", "issues.json");
		fs.writeFileSync(dest, JSON.stringify({ issues: [{ id: "issue-from-custom-root" }] }));
		const data = readBlock(tmpRoot, "issues") as { issues: { id: string }[] };
		assert.equal(data.issues[0]?.id, "issue-from-custom-root");
	});

	it("appendToBlock appends to <cwd>/<config.root>/ when config sets a custom root", () => {
		tmpRoot = makeProject("data");
		const dest = path.join(tmpRoot, "data", "issues.json");
		fs.writeFileSync(dest, JSON.stringify({ issues: [] }));
		appendToBlock(tmpRoot, "issues", "issues", { id: "issue-001" });
		const data = JSON.parse(fs.readFileSync(dest, "utf-8")) as { issues: { id: string }[] };
		assert.equal(data.issues[0]?.id, "issue-001");
	});

	it("falls back to .project/ when no config.json exists (back-compat)", () => {
		tmpRoot = makeProject();
		writeBlock(tmpRoot, "issues", { issues: [{ id: "back-compat" }] });
		const written = path.join(tmpRoot, ".project", "issues.json");
		assert.ok(fs.existsSync(written));
	});

	it("uses .project/ when config explicitly declares root='.project'", () => {
		tmpRoot = makeProject(".project");
		writeBlock(tmpRoot, "issues", { issues: [{ id: "explicit-default" }] });
		const written = path.join(tmpRoot, ".project", "issues.json");
		assert.ok(fs.existsSync(written));
	});
});
