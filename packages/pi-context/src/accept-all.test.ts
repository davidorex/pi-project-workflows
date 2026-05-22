/**
 * accept-all (adoptConception) coverage — the samples-catalog CONSUMPTION MVP.
 *
 * adoptConception adopts samples/conception.json as the substrate's config.json
 * with the conception's hardcoded `.project` root overridden to the actual
 * substrate-dir name. Writes config only (no asset materialization); idempotent
 * (never clobbers an existing config); requires a bootstrap pointer.
 *
 * T7 exercises the rewired initProject through its public surface (the
 * `project-init` registered tool, invoked via a minimal ExtensionAPI stub that
 * captures tool registrations) and asserts the new init copies NO schema/block
 * assets — only scaffolds directories (FGAP-067 / DEC-0011).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import extension from "./index.js";
import { adoptConception, loadConfig } from "./project-context.js";
import { writeBootstrapPointer } from "./project-dir.js";

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
		assert.equal(cfg.block_kinds.length, 15);
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
		const tool = tools.get("project-init");
		assert.ok(tool, "project-init must be registered");
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
