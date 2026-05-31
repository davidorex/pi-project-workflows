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
import { adoptConception, loadConfig } from "./context.js";
import { SUBSTRATE_ID_PATTERN, writeBootstrapPointer } from "./context-dir.js";
import { loadRegistry } from "./context-registry.js";
import extension from "./index.js";

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
		assert.equal(cfg.block_kinds.length, 16);
	});

	it("idempotent", () => {
		tmpRoot = mkTmp(".context");
		adoptConception(tmpRoot);
		const result = adoptConception(tmpRoot);
		assert.equal(result.adopted, false);
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

	it("init scaffolds dirs only, no defaults", async () => {
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
		const blockFiles = fs.readdirSync(substrateDir).filter((f) => f.endsWith(".json"));
		assert.deepEqual(blockFiles, [], "init must copy no block assets");
	});
});
