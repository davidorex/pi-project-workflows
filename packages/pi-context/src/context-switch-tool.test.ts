/**
 * Tests for the /context switch family's shared-engine surface that powers
 * both the slash command handlers and the context-switch + context-list +
 * context-archive Pi tools. Per the /context switch command family's step 8 acceptance criteria.
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
import { loadConfig } from "./context.js";
import { mintSubstrateId, writeBootstrapPointer } from "./context-dir.js";
import { loadRegistry, registerSubstrate, writeRegistry } from "./context-registry.js";
import { validateContext } from "./context-sdk.js";
import { archiveSubstrate, listSubstrates, switchAndCreate, switchToExisting, switchToPrevious } from "./index.js";
import { loadMigrationsFileForDir } from "./migrations-store.js";

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

/**
 * Materialize a schema-valid, config-bearing substrate that CARRIES a freshly
 * minted `substrate_id` (via the same `mintSubstrateId` writeSkeletonConfig /
 * adoptConception use) but is NOT pre-registered in the project-root registry.
 * Returns the minted id so reconcile/validation assertions can key off it. The
 * config is the minimal config-schema-valid shape (schema_version + block_kinds
 * required; root + substrate_id permitted) so `loadConfig` (AJV-validated) and
 * `validateContext` operate on it.
 */
function makeSubstrateWithId(cwd: string, name: string): string {
	const dir = path.join(cwd, name);
	fs.mkdirSync(dir, { recursive: true });
	const substrate_id = mintSubstrateId();
	fs.writeFileSync(
		path.join(dir, "config.json"),
		JSON.stringify({ schema_version: "1.8.0", block_kinds: [], root: name, substrate_id }),
		"utf-8",
	);
	return substrate_id;
}

/**
 * Materialize a schema-valid, config-bearing substrate that DELIBERATELY lacks a
 * `substrate_id` — a pre-identity substrate. The config is the minimal
 * config-schema-valid shape (schema_version + block_kinds required; root
 * permitted) WITHOUT substrate_id, so `loadConfig` (AJV-validated) and
 * `validateContext` operate on it cleanly and reconcile finds no id to register.
 */
function makeSubstrateValidNoId(cwd: string, name: string): void {
	const dir = path.join(cwd, name);
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(
		path.join(dir, "config.json"),
		JSON.stringify({ schema_version: "1.8.0", block_kinds: [], root: name }),
		"utf-8",
	);
}

/**
 * Materialize a version-LAGGING legacy substrate: a config stamped
 * `schema_version: "1.0.0"` (the bundled config schema is ahead) and NO
 * migrations.json — the pre-seeding era's on-disk state. Reading its config
 * without the catalog `config` chain seeded throws a version mismatch, so the
 * switch ceremonies must seed the target right after the pointer flip
 * (the ceremony-seeding class rule: every ceremony entry point seeds before
 * its first config read).
 */
function makeLegacySubstrate(cwd: string, name: string): void {
	const dir = path.join(cwd, name);
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(
		path.join(dir, "config.json"),
		JSON.stringify({ schema_version: "1.0.0", block_kinds: [], root: name }),
		"utf-8",
	);
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

	it("registers an unregistered substrate_id of the now-active target after flip", () => {
		const id = makeSubstrateWithId(tmpDir, ".context");
		switchToExisting(tmpDir, ".context", "test-op");
		const entry = loadRegistry(tmpDir)?.substrates?.[id];
		assert.ok(entry, "expected the now-active substrate_id to be registered");
		assert.equal(entry?.dir, ".context");
		const issues = validateContext(tmpDir).issues;
		assert.equal(
			issues.find((i) => i.code === "substrate_id_unregistered"),
			undefined,
		);
	});

	it("leaves a present-but-different-dir registry entry for validation to flag (mismatch preserved)", () => {
		const id = makeSubstrateWithId(tmpDir, ".context");
		// Pre-seed the registry with the id mapped to a WRONG dir — genuine drift.
		registerSubstrate(tmpDir, id, "wrong-dir", []);
		switchToExisting(tmpDir, ".context", "test-op");
		// Reconcile must NOT overwrite the drifted entry.
		assert.equal(loadRegistry(tmpDir)?.substrates?.[id]?.dir, "wrong-dir");
		const issues = validateContext(tmpDir).issues;
		assert.ok(
			issues.find((i) => i.code === "substrate_id_registry_mismatch"),
			"expected substrate_id_registry_mismatch to still be reported",
		);
	});

	it("performs no registration for a pre-identity substrate (no substrate_id) and validates clean", () => {
		// A schema-VALID config that simply lacks substrate_id — a pre-identity
		// substrate. Schema-valid so the validateContext clean assertions below hold.
		makeSubstrateValidNoId(tmpDir, ".context");
		assert.doesNotThrow(() => switchToExisting(tmpDir, ".context", "test-op"));
		const result = validateContext(tmpDir);
		assert.equal(
			result.issues.find((i) => i.code === "substrate_id_unregistered"),
			undefined,
		);
		assert.equal(
			result.issues.find((i) => i.code === "substrate_id_registry_mismatch"),
			undefined,
		);
	});

	it("seeds a legacy target's config migration chain right after the flip — post-switch loadConfig is green", () => {
		makeLegacySubstrate(tmpDir, ".legacy");
		assert.doesNotThrow(() => switchToExisting(tmpDir, ".legacy", "test-op"));
		const migrations = loadMigrationsFileForDir(path.join(tmpDir, ".legacy"));
		assert.ok(
			migrations?.migrations.some((m) => m.schemaName === "config" && m.fromVersion === "1.0.0"),
			"the switch must seed the (config, 1.0.0) decl into the TARGET substrate",
		);
		assert.ok(loadConfig(tmpDir), "the first config read after the switch loads through the seeded chain");
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

	it("registers a pre-existing unregistered substrate_id when never-clobber skips the skeleton write", () => {
		// Pre-create a config-bearing-but-unregistered substrate carrying an id.
		// switchAndCreate flips, skips scaffolding (dir exists), writeSkeletonConfig
		// never-clobbers (written:false), then reconcile registers the existing id.
		const id = makeSubstrateWithId(tmpDir, ".context");
		switchAndCreate(tmpDir, ".context", "test-op");
		const entry = loadRegistry(tmpDir)?.substrates?.[id];
		assert.ok(entry, "expected the pre-existing substrate_id to be registered after switch -c");
		assert.equal(entry?.dir, ".context");
		const issues = validateContext(tmpDir).issues;
		assert.equal(
			issues.find((i) => i.code === "substrate_id_unregistered"),
			undefined,
		);
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

	it("registers an unregistered substrate_id of the now-active target after flipping back", () => {
		// Substrate A (.project) carries an id; forward-switching to B (.context)
		// registers B. Prune A's registry entry so flipping back lands the active
		// pointer on a config-bearing-but-unregistered id — the third switch path
		// must reconcile it just like the forward paths do.
		const idA = makeSubstrateWithId(tmpDir, ".project");
		writeBootstrapPointer(tmpDir, ".project");
		registerSubstrate(tmpDir, idA, ".project", []);
		const idB = makeSubstrateWithId(tmpDir, ".context");
		switchToExisting(tmpDir, ".context", "test-op-1");
		assert.ok(loadRegistry(tmpDir)?.substrates?.[idB], "forward switch should register B");

		// Prune A's registry entry: write the registry back without A's id.
		const reg = loadRegistry(tmpDir);
		assert.ok(reg, "expected a registry after the forward switch");
		delete reg.substrates[idA];
		writeRegistry(tmpDir, reg);
		assert.equal(loadRegistry(tmpDir)?.substrates?.[idA], undefined, "A's entry should be pruned");

		const { from, to } = switchToPrevious(tmpDir, "test-op-2");
		assert.equal(from, ".context");
		assert.equal(to, ".project");

		const entry = loadRegistry(tmpDir)?.substrates?.[idA];
		assert.ok(entry, "expected A's substrate_id to be re-registered by switchToPrevious");
		assert.equal(entry?.dir, ".project");
		const issues = validateContext(tmpDir).issues;
		assert.equal(
			issues.find((i) => i.code === "substrate_id_unregistered"),
			undefined,
		);
	});

	it("seeds the flipped-back-to legacy substrate — post-switch loadConfig is green", () => {
		writeBootstrapPointer(tmpDir, ".legacy");
		makeLegacySubstrate(tmpDir, ".legacy");
		makeSubstrateValidNoId(tmpDir, ".modern");
		switchToExisting(tmpDir, ".modern", "test-op-1"); // seeds .modern only — .legacy stays unseeded
		assert.ok(!fs.existsSync(path.join(tmpDir, ".legacy", "migrations.json")), "precondition: .legacy is unseeded");

		const { to } = switchToPrevious(tmpDir, "test-op-2");
		assert.equal(to, ".legacy");
		const migrations = loadMigrationsFileForDir(path.join(tmpDir, ".legacy"));
		assert.ok(
			migrations?.migrations.some((m) => m.schemaName === "config" && m.fromVersion === "1.0.0"),
			"flipping back must seed the (config, 1.0.0) decl into the now-active substrate",
		);
		assert.ok(loadConfig(tmpDir), "the first config read after flipping back loads through the seeded chain");
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
