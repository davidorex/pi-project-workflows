import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { writeBootstrapPointer } from "@davidorex/pi-context/context-dir";
import { AgentNotFoundError, createAgentLoader } from "@davidorex/pi-jit-agents";
import { dispatchLoadContext } from "./dispatch-loader.js";

// The user tier defaults to the developer machine's real ~/.pi/agent/agents/;
// tests pin it to an empty tmp dir (the documented LoadContext test hook) so
// resolution outcomes are machine-independent. builtinDir + cwd stay exactly
// what dispatchLoadContext produced.
function pinnedUserDir(tmpDir: string): string {
	const dir = path.join(tmpDir, "user-agents-empty");
	fs.mkdirSync(dir, { recursive: true });
	return dir;
}

describe("dispatchLoadContext", () => {
	let tmpDir: string;
	let substrateRoot: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-agent-dispatch-loader-"));
		const substrateName = "substrate";
		substrateRoot = path.join(tmpDir, substrateName);
		// Substrate with an EMPTY agents/ dir — the fresh-substrate shape the
		// builtin tier exists to serve.
		fs.mkdirSync(path.join(substrateRoot, "agents"), { recursive: true });
		writeBootstrapPointer(tmpDir, substrateName);
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("builtinDir points at the bundled pi-workflows agents/ dir on disk (investigator present)", () => {
		const loadCtx = dispatchLoadContext(tmpDir);
		assert.equal(loadCtx.cwd, tmpDir);
		assert.ok(loadCtx.builtinDir, "builtinDir must be set");
		assert.ok(fs.existsSync(loadCtx.builtinDir as string), `builtinDir missing on disk: ${loadCtx.builtinDir}`);
		assert.ok(fs.existsSync(path.join(loadCtx.builtinDir as string, "investigator.agent.yaml")));
	});

	it("resolves a bundled spec from a fresh substrate whose agents/ dir is empty", () => {
		const loadAgent = createAgentLoader({ ...dispatchLoadContext(tmpDir), userDir: pinnedUserDir(tmpDir) });
		const spec = loadAgent("investigator");
		assert.equal(spec.name, "investigator");
		assert.equal(spec.loadedFrom, dispatchLoadContext(tmpDir).builtinDir);
	});

	it("a local substrate spec of the same name wins over the bundled one", () => {
		const localBody = `name: investigator
role: sensor
description: local-override
prompt:
  system: "system"
  task: "task"
input:
  type: object
  properties:
    in: { type: string }
output:
  format: json
`;
		fs.writeFileSync(path.join(substrateRoot, "agents", "investigator.agent.yaml"), localBody, "utf8");
		const loadAgent = createAgentLoader({ ...dispatchLoadContext(tmpDir), userDir: pinnedUserDir(tmpDir) });
		const spec = loadAgent("investigator");
		assert.equal(spec.description, "local-override");
		assert.equal(spec.loadedFrom, path.join(substrateRoot, "agents"));
	});

	it("unknown name throws AgentNotFoundError carrying all three search tiers", () => {
		const loadAgent = createAgentLoader({ ...dispatchLoadContext(tmpDir), userDir: pinnedUserDir(tmpDir) });
		assert.throws(
			() => loadAgent("definitely-not-a-spec-anywhere"),
			(err: unknown) => {
				assert.ok(err instanceof AgentNotFoundError);
				assert.equal(err.searchPaths.length, 3);
				return true;
			},
		);
	});
});
