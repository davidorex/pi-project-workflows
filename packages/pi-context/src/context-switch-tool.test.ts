/**
 * Tests for the /context switch family's shared-engine surface that powers
 * both the slash command handlers and the context-switch + context-list +
 * context-archive Pi tools. Per TASK-094 step 8 acceptance criteria.
 *
 * Asserts:
 * - switchToExisting flips pointer to existing-substrate target; refuses
 *   non-substrate target with helpful message naming switch -c alternative.
 * - switchAndCreate bootstraps new substrate + flips pointer in one operation.
 * - switchToPrevious flips back; fails loud when previous_contextDir absent.
 * - listSubstrates enumerates + marks active.
 * - archiveSubstrate moves dir; refuses to archive active; refuses to clobber
 *   prior archive.
 *
 * AUTH_REQUIRED_TOOLS membership of context-switch + context-archive (and
 * non-membership of context-list) is asserted in pi-agent-dispatch's
 * auth-gate.test.ts where the canonical Bucket-2 pin lives; pi-context cannot
 * depend on pi-agent-dispatch (circular dep) so the routing assertion stays
 * upstream.
 */
import { strict as assert } from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { writeBootstrapPointer } from "./context-dir.js";
import { archiveSubstrate, listSubstrates, switchAndCreate, switchToExisting, switchToPrevious } from "./index.js";

/**
 * Materialize a fake substrate dir at `<cwd>/<name>/config.json` so target-dir
 * shape checks pass (the engines validate that the target has a config.json
 * before flipping).
 */
function makeSubstrate(cwd: string, name: string): void {
	const dir = path.join(cwd, name);
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({ root: name }), "utf-8");
}

describe("switchToExisting", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "context-switch-tool-existing-"));
		writeBootstrapPointer(tmpDir, ".project");
		makeSubstrate(tmpDir, ".project");
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("flips pointer to existing substrate target", () => {
		makeSubstrate(tmpDir, ".context");
		switchToExisting(tmpDir, ".context", "test-op");
		const pointer = JSON.parse(fs.readFileSync(path.join(tmpDir, ".pi-context.json"), "utf-8"));
		assert.equal(pointer.contextDir, ".context");
		assert.equal(pointer.previous_contextDir, ".project");
		assert.equal(pointer.switched_by, "test-op");
		assert.equal(pointer.version, "1.1.0");
	});

	it("refuses non-substrate target with message naming /context switch -c alternative", () => {
		fs.mkdirSync(path.join(tmpDir, ".empty-dir"));
		try {
			switchToExisting(tmpDir, ".empty-dir", "test-op");
			assert.fail("expected throw");
		} catch (err) {
			assert.ok(err instanceof Error);
			assert.match(err.message, /no config\.json/);
			assert.match(err.message, /\/context switch -c \.empty-dir/);
		}
	});
});

describe("switchAndCreate", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "context-switch-tool-create-"));
		writeBootstrapPointer(tmpDir, ".project");
		makeSubstrate(tmpDir, ".project");
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("bootstraps new substrate dir AND flips pointer in one operation", () => {
		const result = switchAndCreate(tmpDir, ".context", "test-op");
		const pointer = JSON.parse(fs.readFileSync(path.join(tmpDir, ".pi-context.json"), "utf-8"));
		assert.equal(pointer.contextDir, ".context");
		assert.equal(pointer.previous_contextDir, ".project");
		assert.ok(fs.existsSync(path.join(tmpDir, ".context")));
		assert.ok(fs.existsSync(path.join(tmpDir, ".context", "schemas")));
		assert.ok(result.created.length > 0);
	});

	it("rejects invalid target dir name (path separator)", () => {
		assert.throws(() => switchAndCreate(tmpDir, ".bad/dir", "test-op"), /invalid target dir name/);
	});

	it("tolerates leading-dot dir name (project convention)", () => {
		switchAndCreate(tmpDir, ".context-experimental", "test-op");
		assert.ok(fs.existsSync(path.join(tmpDir, ".context-experimental")));
	});
});

describe("switchToPrevious", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "context-switch-tool-prev-"));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("flips back to previous_contextDir after a prior switch", () => {
		writeBootstrapPointer(tmpDir, ".project");
		makeSubstrate(tmpDir, ".project");
		makeSubstrate(tmpDir, ".context");
		switchToExisting(tmpDir, ".context", "test-op-1");

		const { from, to } = switchToPrevious(tmpDir, "test-op-2");
		assert.equal(from, ".context");
		assert.equal(to, ".project");
		const pointer = JSON.parse(fs.readFileSync(path.join(tmpDir, ".pi-context.json"), "utf-8"));
		assert.equal(pointer.contextDir, ".project");
		assert.equal(pointer.previous_contextDir, ".context");
	});

	it("fails loud when previous_contextDir is absent (no prior switch)", () => {
		writeBootstrapPointer(tmpDir, ".project");
		assert.throws(() => switchToPrevious(tmpDir, "test-op"), /no previous_contextDir/);
	});
});

describe("listSubstrates", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "context-switch-tool-list-"));
		writeBootstrapPointer(tmpDir, ".project");
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("enumerates substrate dirs (top-level dirs with config.json) and marks active", () => {
		makeSubstrate(tmpDir, ".project");
		makeSubstrate(tmpDir, ".context");
		fs.mkdirSync(path.join(tmpDir, "other-non-substrate"));

		const subs = listSubstrates(tmpDir);
		const names = subs.map((s) => s.name).sort();
		assert.deepEqual(names, [".context", ".project"]);
		const active = subs.find((s) => s.isActive);
		assert.equal(active?.name, ".project");
	});

	it("skips archive/ wrapper dir", () => {
		makeSubstrate(tmpDir, ".project");
		fs.mkdirSync(path.join(tmpDir, "archive"));
		makeSubstrate(tmpDir, path.join("archive", "old-substrate"));

		const subs = listSubstrates(tmpDir);
		assert.equal(
			subs.find((s) => s.name === "archive"),
			undefined,
		);
	});

	it("returns empty when no substrate dirs present", () => {
		const subs = listSubstrates(tmpDir);
		assert.deepEqual(subs, []);
	});
});

describe("archiveSubstrate", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "context-switch-tool-archive-"));
		writeBootstrapPointer(tmpDir, ".project");
		makeSubstrate(tmpDir, ".project");
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("moves substrate to archive/<name>/", () => {
		makeSubstrate(tmpDir, ".old-substrate");
		const { from, to } = archiveSubstrate(tmpDir, ".old-substrate");
		assert.equal(from, ".old-substrate");
		assert.equal(to, path.join("archive", ".old-substrate"));
		assert.equal(fs.existsSync(path.join(tmpDir, ".old-substrate")), false);
		assert.ok(fs.existsSync(path.join(tmpDir, "archive", ".old-substrate", "config.json")));
	});

	it("refuses to archive the active substrate", () => {
		try {
			archiveSubstrate(tmpDir, ".project");
			assert.fail("expected throw");
		} catch (err) {
			assert.ok(err instanceof Error);
			assert.match(err.message, /refuses to archive '\.project'/);
			assert.match(err.message, /ACTIVE substrate/);
		}
	});

	it("refuses to clobber a pre-existing archive entry", () => {
		makeSubstrate(tmpDir, ".old-substrate");
		archiveSubstrate(tmpDir, ".old-substrate");
		// Recreate same-named substrate; second archive should refuse.
		makeSubstrate(tmpDir, ".old-substrate");
		assert.throws(() => archiveSubstrate(tmpDir, ".old-substrate"), /already exists/);
	});

	it("refuses non-substrate target dir (no config.json)", () => {
		fs.mkdirSync(path.join(tmpDir, ".bare-dir"));
		assert.throws(() => archiveSubstrate(tmpDir, ".bare-dir"), /no config\.json/);
	});
});
