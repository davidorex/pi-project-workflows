/**
 * accept-all (adoptConception) coverage — the samples-catalog CONSUMPTION MVP.
 *
 * adoptConception adopts samples/conception.json as the substrate's config.json
 * with the conception's hardcoded `.project` root overridden to the actual
 * substrate-dir name. Writes config only (no asset materialization); idempotent
 * (never clobbers an existing config); requires a bootstrap pointer.
 *
 * T7 exercises the rewired initProject through its public surface (the
 * `context-init` registered tool, invoked via a minimal ExtensionAPI stub that
 * captures tool registrations) and asserts the new init copies NO schema/block
 * assets — only scaffolds directories (FGAP-067 / DEC-0011).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { adoptConception, isSkeletonConfig, loadConfig } from "./context.js";
import { SUBSTRATE_ID_PATTERN, writeBootstrapPointer } from "./context-dir.js";
import { loadRegistry } from "./context-registry.js";
import extension, { initProject } from "./index.js";
import { loadMigrationsFileForDir } from "./migrations-store.js";

let tmpRoot: string;

/** mkdtemp + bootstrap pointer declaring `contextDir` as the substrate dir. */
function mkTmp(contextDir: string): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-context-accept-"));
	writeBootstrapPointer(dir, contextDir);
	return dir;
}

interface CapturedTool {
	name: string;
	execute: (
		toolCallId: string,
		params: Record<string, unknown>,
		signal: AbortSignal,
		onUpdate: (...a: unknown[]) => void,
		ctx: { cwd: string },
	) => Promise<unknown>;
}

/** Capture the extension's tool registrations so a handler can be invoked. */
function captureTools(): { tools: Map<string, CapturedTool>; api: unknown } {
	const tools = new Map<string, CapturedTool>();
	const api = {
		on: () => {},
		registerTool: (def: { name: string; execute: CapturedTool["execute"] }) => {
			tools.set(def.name, { name: def.name, execute: def.execute });
		},
		registerCommand: () => {},
		registerShortcut: () => {},
		sendMessage: () => {},
		getAllTools: () => [],
		getActiveTools: () => [],
	};
	return { tools, api };
}

describe("adoptConception (accept-all)", () => {
	afterEach(() => {
		if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
	});

	it("accept-all writes config with root override", () => {
		tmpRoot = mkTmp(".context");
		// Pointer written, dir ABSENT: accept-all is the sanctioned first materializer —
		// the write ceremony must mkdir the dir so the migration seed lands before the
		// config write (the seed helper itself no-ops on a nonexistent dir).
		assert.ok(!fs.existsSync(path.join(tmpRoot, ".context")), "precondition: substrate dir absent at adopt time");
		const result = adoptConception(tmpRoot);
		assert.equal(result.adopted, true);
		const config = loadConfig(tmpRoot);
		assert.ok(config, "expected a config.json to be written");
		const cfg = config!;
		assert.equal(
			cfg.root,
			".context",
			"root must be overridden to the actual substrate dir, not the conception's .project",
		);
		assert.equal(cfg.block_kinds.length, 18);
		// First-touch adopt must leave migrations.json carrying the catalog's config chain.
		const migrations = loadMigrationsFileForDir(path.join(tmpRoot, ".context"));
		assert.ok(migrations, "a first-touch accept-all must seed migrations.json");
		const configDecl = migrations!.migrations.find((m) => m.schemaName === "config" && m.fromVersion === "1.0.0");
		assert.ok(configDecl, "the (config, 1.0.0) decl must be seeded on the dir-absent path");
		assert.equal(configDecl!.toVersion, "1.7.0");
	});

	it("skeleton-aware idempotence: first adopt overwrites the init skeleton (adopted), second is a no-op (populated)", () => {
		tmpRoot = mkTmp(".context");
		// init writes a SKELETON config (FGAP-001 / DEC-0001) — empty of vocabulary.
		initProject(tmpRoot, ".context");
		const skeleton = loadConfig(tmpRoot);
		assert.ok(skeleton, "init must write a config");
		assert.ok(isSkeletonConfig(skeleton!), "init's config must be a skeleton");
		// First accept-all OVERWRITES the skeleton with the packaged catalog.
		const first = adoptConception(tmpRoot);
		assert.equal(first.adopted, true, "accept-all must overwrite a skeleton config");
		const populated = loadConfig(tmpRoot);
		assert.ok(populated && !isSkeletonConfig(populated), "config must now be populated");
		assert.equal(populated!.root, ".context");
		// Second accept-all is a no-op — the config is now populated (never-clobber).
		const second = adoptConception(tmpRoot);
		assert.equal(second.adopted, false, "accept-all must not re-adopt a populated config");
		assert.equal(loadConfig(tmpRoot)!.root, ".context");
	});

	it("never-clobbers a POPULATED config", () => {
		tmpRoot = mkTmp(".context");
		// A real adopt produces a populated config; a second adopt must be a no-op.
		adoptConception(tmpRoot);
		const populated = loadConfig(tmpRoot);
		assert.ok(populated && !isSkeletonConfig(populated), "first adopt must populate the config");
		const result = adoptConception(tmpRoot);
		assert.equal(result.adopted, false, "accept-all must never clobber a populated config");
		const config = loadConfig(tmpRoot);
		assert.ok(config);
		assert.equal(config!.root, ".context");
	});

	it("accept-all mints config.substrate_id + registers the active substrate (Cycle 4)", () => {
		tmpRoot = mkTmp(".context");
		adoptConception(tmpRoot);
		const config = loadConfig(tmpRoot);
		assert.ok(config);
		const id = config!.substrate_id;
		assert.ok(typeof id === "string" && SUBSTRATE_ID_PATTERN.test(id), `expected a minted substrate_id, got ${id}`);
		const reg = loadRegistry(tmpRoot);
		assert.ok(reg, "accept-all must create the project-root registry");
		assert.deepEqual(reg!.substrates[id as string], { dir: ".context", aliases: [] });
	});

	it("second accept-all is idempotent — no re-mint, no duplicate registry entry", () => {
		tmpRoot = mkTmp(".context");
		adoptConception(tmpRoot);
		const firstId = loadConfig(tmpRoot)!.substrate_id;
		const r2 = adoptConception(tmpRoot);
		assert.equal(r2.adopted, false, "second accept-all must not re-adopt");
		assert.equal(loadConfig(tmpRoot)!.substrate_id, firstId, "substrate_id must not be re-minted");
		const reg = loadRegistry(tmpRoot);
		assert.equal(Object.keys(reg!.substrates).length, 1, "no duplicate registry entry on second accept-all");
	});

	it("no bootstrap → throws", () => {
		const fresh = fs.mkdtempSync(path.join(os.tmpdir(), "pi-context-accept-nobp-"));
		try {
			assert.throws(
				() => adoptConception(fresh),
				(err: unknown) => err instanceof Error && err.name === "BootstrapNotFoundError",
			);
		} finally {
			fs.rmSync(fresh, { recursive: true, force: true });
		}
	});

	it("init scaffolds dirs + skeleton config, no block assets", async () => {
		tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-context-accept-init-"));
		const { tools, api } = captureTools();
		(extension as unknown as (pi: unknown) => void)(api);
		const tool = tools.get("context-init");
		assert.ok(tool, "context-init must be registered");
		await tool.execute("call-init", { contextDir: ".context" }, new AbortController().signal, () => {}, {
			cwd: tmpRoot,
		});
		const substrateDir = path.join(tmpRoot, ".context");
		const schemasDir = path.join(substrateDir, "schemas");
		assert.ok(fs.existsSync(substrateDir), "substrate dir must be scaffolded");
		assert.ok(fs.existsSync(schemasDir), "schemas dir must be scaffolded");
		const schemaFiles = fs.readdirSync(schemasDir).filter((f) => f.endsWith(".schema.json"));
		assert.deepEqual(schemaFiles, [], "init must copy no schema assets");
		// init writes a SKELETON config.json (FGAP-001 / DEC-0001) plus the seeded
		// migrations.json (the catalog's config migration chain); NO block data files.
		const jsonFiles = fs
			.readdirSync(substrateDir)
			.filter((f) => f.endsWith(".json"))
			.sort();
		assert.deepEqual(
			jsonFiles,
			["config.json", "migrations.json"],
			"init writes exactly the skeleton config + seeded migrations, no block assets",
		);
		const config = loadConfig(tmpRoot);
		assert.ok(config && isSkeletonConfig(config), "the written config must be a skeleton");
	});

	it("init → accept-all leaves migrations.json carrying the (config, 1.0.0→1.7.0) decl and loadConfig green", () => {
		tmpRoot = mkTmp(".context");
		initProject(tmpRoot, ".context");
		adoptConception(tmpRoot);
		const migrations = loadMigrationsFileForDir(path.join(tmpRoot, ".context"));
		assert.ok(migrations, "the ceremony must seed migrations.json");
		const configDecl = migrations!.migrations.find((m) => m.schemaName === "config" && m.fromVersion === "1.0.0");
		assert.ok(configDecl, "the (config, 1.0.0) decl must be seeded");
		assert.equal(configDecl!.toVersion, "1.7.0");
		assert.ok(loadConfig(tmpRoot), "loadConfig must return the adopted config");
	});
});
